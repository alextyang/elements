/**
 * Original WGSL sky renderer. The implementation follows public atmospheric
 * and volumetric-rendering literature; it contains no code or assets from the
 * shader packs used as visual references.
 */

import { CLOUD_OPTICS_WGSL } from "./cloud-optics-wgsl";
import {
    CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS,
    CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH,
} from "./cloud-optics";
import { CLOUD_MORPHOLOGY_MODIFIERS_WGSL } from
    "./cloud-morphology-modifiers-wgsl";
import { CLOUD_VOLUME_FILTERING_WGSL } from "./cloud-volume-filtering-wgsl";
import { CLOUD_SHADOWED_ATMOSPHERE_TRANSPORT_WGSL } from
    "./cloud-shadowed-atmosphere-transport-wgsl";
import { CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL } from
    "./cloud-volume-exterior-contract-wgsl";
import {
    HYDROMETEOR_FIELD_WGSL,
    createHydrometeorAccumulatorWgsl,
    createHydrometeorBufferDeclaration,
} from "./hydrometeor-wgsl";
import { DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL } from
    "./directional-atmosphere-cloud-lighting-wgsl";
import { physicalAtmosphereConsumerWgsl } from "./physical-atmosphere-wgsl";
import { CELESTIAL_PHYSICS_WGSL } from "./celestial-physics-wgsl";
import {
    createCloudLightVolumeComputeWgsl,
    createCloudLightVolumeSamplingWgsl,
} from "./cloud-light-volume-wgsl";
import {
    SPECIALIZED_HYDROMETEOR_TRANSPORT_WGSL,
    SPECIALIZED_UPPER_ATMOSPHERE_TRANSPORT_WGSL,
    SPECIALIZED_WEATHER_TRANSPORT_COMMON_WGSL,
} from "./specialized-weather-transport-wgsl";
import {
    WEATHER_PHENOMENA_PRODUCTION_WGSL,
} from "./weather-phenomena-production-wgsl";
import { WEATHER_OPTICAL_PHENOMENA_WGSL } from
    "./weather-optical-phenomena-wgsl";
import {
    WEATHER_SCENE_UNIFORM_WGSL,
    createWeatherSceneUniformDeclaration,
} from "./weather-scene-abi";
import {
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE,
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT,
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD,
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD,
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT,
    DIRECTIONAL_CLOUD_AERIAL_SHADOW_PARTIAL_THRESHOLD,
    DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE,
    DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT,
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT,
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_MINIMUM_SCALE_KM,
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SCALE_FRACTION,
    DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SPAN_RATIO,
    DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE,
    DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT,
    DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH,
    DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA,
    DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT,
} from "./directional-cloud-visibility";

const FULLSCREEN_VERTEX = /* wgsl */ `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn fullscreen_vertex(@builtin(vertex_index) index: u32) -> VertexOut {
    let points = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var output: VertexOut;
    output.position = vec4<f32>(points[index], 0.0, 1.0);
    output.uv = points[index] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
    return output;
}
`;

const WEATHER_PRODUCTION_TRANSPORT_WGSL =
    WEATHER_SCENE_UNIFORM_WGSL +
    createWeatherSceneUniformDeclaration(0, 35) +
    WEATHER_OPTICAL_PHENOMENA_WGSL +
    WEATHER_PHENOMENA_PRODUCTION_WGSL;

/**
 * Shared sampled side of the compact coupling atlas. Positions and directions
 * use the atmosphere solver's east/north/up convention. Layer zero contains
 * the nonlinear-altitude positive radiance profile; layers one through 192
 * contain mean RGB Beer-visibility knots over three source-aligned receiver-
 * depth cascades for Sun and Moon. Four coherent footprint rays are averaged
 * only after their independent optical-depth suffix integrals.
 */
const DIRECTIONAL_COUPLING_ATLAS_WGSL = /* wgsl */ `
const COUPLING_ACTIVE_LOBE_COUNT: u32 = 17u;
const COUPLING_ATLAS_DIRECTIONAL_LAYER: i32 = 0;
const COUPLING_SHADOW_CASCADE_COUNT: u32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_COUNT}u;
const COUPLING_SHADOW_DEPTH_KNOT_COUNT: u32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_KNOT_COUNT}u;
const COUPLING_SHADOW_LAYER_COUNT: u32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_LAYER_COUNT}u;
const COUPLING_SHADOW_MAX_OPTICAL_DEPTH: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_MAX_OPTICAL_DEPTH}.0;
const COUPLING_AERIAL_SHADOW_INTERVAL_COUNT: u32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT}u;
const COUPLING_AERIAL_SHADOW_GL_NODE: f32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE};
const COUPLING_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT: u32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT}u;
const COUPLING_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD: f32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD};
const COUPLING_AERIAL_SHADOW_PARTIAL_THRESHOLD: f32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_PARTIAL_THRESHOLD};
const COUPLING_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD: f32 =
    ${DIRECTIONAL_CLOUD_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD};
const COUPLING_AERIAL_SHADOW_KRONROD_OUTER_NODE: f32 = 0.9258200997725514;
const COUPLING_AERIAL_SHADOW_KRONROD_BASE_WEIGHT: f32 = 0.4909090909090909;
const COUPLING_AERIAL_SHADOW_KRONROD_OUTER_WEIGHT: f32 = 0.1979797979797980;
const COUPLING_AERIAL_SHADOW_KRONROD_CENTER_WEIGHT: f32 = 0.6222222222222222;
const COUPLING_SHADOW_LATERAL_GL_NODE: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_LATERAL_GAUSS_NODE};
const COUPLING_SHADOW_BLEND_MINIMUM: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE[0]};
const COUPLING_SHADOW_BLEND_MAXIMUM: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_CASCADE_BLEND_RANGE[1]};
const COUPLING_SHADOW_DEPTH_WARP_SPAN_RATIO: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SPAN_RATIO}.0;
const COUPLING_SHADOW_DEPTH_WARP_SCALE_FRACTION: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_SCALE_FRACTION};
const COUPLING_SHADOW_DEPTH_WARP_MINIMUM_SCALE_KM: f32 =
    ${DIRECTIONAL_CLOUD_VISIBILITY_DEPTH_WARP_MINIMUM_SCALE_KM}.0;

struct DirectionalCloudVisibilityUniform {
    // schema, knot count, cascade count, generation
    header: vec4<u32>,
    // min source depth, max source depth, inverse span, plane half extent
    domains: array<vec4<f32>, 6>,
    // Two source/cascade plane centres packed into each xy/zw pair.
    plane_center_pairs: array<vec4<f32>, 3>,
    // source count, total atlas layer count, width, height
    atlas_layout: vec4<u32>,
};

@group(0) @binding(34) var<uniform> directional_cloud_visibility:
    DirectionalCloudVisibilityUniform;
// Two owner words for every source/cascade, 2x2 plane tile and depth
// interval. This is compute-only: consumer entry points use four sampled-atlas
// fetches, or a bounded eight only while crossing a cascade blend band.
@group(0) @binding(36) var<storage, read> coupling_shadow_owner_masks:
    array<vec2<u32>>;

struct CouplingShadowBasis {
    right: vec3<f32>,
    transverse: vec3<f32>,
};

fn coupling_shadow_basis(source_direction_input: vec3<f32>) -> CouplingShadowBasis {
    let source_direction = coupling_safe_normalize(source_direction_input);
    if (source_direction.z < -0.999999) {
        return CouplingShadowBasis(
            vec3<f32>(0.0, -1.0, 0.0),
            vec3<f32>(-1.0, 0.0, 0.0));
    }
    // Continuous Frisvad frame on the complete enabled-source hemisphere.
    // The previous reference-axis branch abruptly rolled the finite atlas at
    // high source elevations despite unchanged world-space cloud geometry.
    let inverse = 1.0 / (1.0 + source_direction.z);
    let cross_term = -source_direction.x * source_direction.y * inverse;
    let right = coupling_safe_normalize(vec3<f32>(
        1.0 - source_direction.x * source_direction.x * inverse,
        cross_term,
        -source_direction.x,
    ));
    return CouplingShadowBasis(
        right,
        coupling_safe_normalize(cross(source_direction, right)),
    );
}

fn coupling_visibility_contract_valid() -> bool {
    return directional_cloud_visibility.header.x ==
            ${DIRECTIONAL_CLOUD_VISIBILITY_SCHEMA}u &&
        directional_cloud_visibility.header.y ==
            COUPLING_SHADOW_DEPTH_KNOT_COUNT &&
        directional_cloud_visibility.header.z ==
            COUPLING_SHADOW_CASCADE_COUNT &&
        directional_cloud_visibility.atlas_layout.x ==
            ${DIRECTIONAL_CLOUD_VISIBILITY_SOURCE_COUNT}u &&
        directional_cloud_visibility.atlas_layout.y ==
            COUPLING_SHADOW_LAYER_COUNT;
}

fn coupling_visibility_domain(
    source_index: u32, cascade_index: u32,
) -> vec4<f32> {
    return directional_cloud_visibility.domains[
        source_index * COUPLING_SHADOW_CASCADE_COUNT + cascade_index];
}

fn coupling_visibility_plane_center(
    source_index: u32, cascade_index: u32,
) -> vec2<f32> {
    let slot = source_index * COUPLING_SHADOW_CASCADE_COUNT + cascade_index;
    let pair = directional_cloud_visibility.plane_center_pairs[slot / 2u];
    if ((slot & 1u) == 0u) { return pair.xy; }
    return pair.zw;
}

fn coupling_visibility_asinh(value: f32) -> f32 {
    return sign(value) * log(abs(value) + sqrt(value * value + 1.0));
}

fn coupling_visibility_depth_warp_reference_extent(
    source_index: u32,
) -> f32 {
    return coupling_visibility_domain(source_index, 0u).w;
}

fn coupling_visibility_depth_warp_enabled(
    domain: vec4<f32>, source_index: u32,
) -> bool {
    return domain.z > 0.0 && domain.y - domain.x >
        COUPLING_SHADOW_DEPTH_WARP_SPAN_RATIO *
            coupling_visibility_depth_warp_reference_extent(source_index);
}

fn coupling_visibility_depth_warp_scale(source_index: u32) -> f32 {
    return max(COUPLING_SHADOW_DEPTH_WARP_MINIMUM_SCALE_KM,
        COUPLING_SHADOW_DEPTH_WARP_SCALE_FRACTION *
            coupling_visibility_depth_warp_reference_extent(source_index));
}

fn coupling_visibility_depth_at_unit(
    domain: vec4<f32>, source_index: u32, unit_input: f32,
) -> f32 {
    let unit = clamp(unit_input, 0.0, 1.0);
    if (!coupling_visibility_depth_warp_enabled(domain, source_index)) {
        return mix(domain.x, domain.y, unit);
    }
    let scale_km = coupling_visibility_depth_warp_scale(source_index);
    let warped = mix(
        coupling_visibility_asinh(domain.x / scale_km),
        coupling_visibility_asinh(domain.y / scale_km), unit);
    return scale_km * 0.5 * (exp(warped) - exp(-warped));
}

fn coupling_visibility_unit_at_depth(
    domain: vec4<f32>, source_index: u32, depth_km: f32,
) -> f32 {
    if (!coupling_visibility_depth_warp_enabled(domain, source_index)) {
        return clamp((depth_km - domain.x) * domain.z, 0.0, 1.0);
    }
    let scale_km = coupling_visibility_depth_warp_scale(source_index);
    let minimum_warped = coupling_visibility_asinh(domain.x / scale_km);
    let maximum_warped = coupling_visibility_asinh(domain.y / scale_km);
    return clamp((coupling_visibility_asinh(depth_km / scale_km) -
        minimum_warped) / max(1e-8, maximum_warped - minimum_warped),
        0.0, 1.0);
}

fn coupling_visibility_layer(
    source_index: u32, cascade_index: u32, knot_index: u32,
) -> i32 {
    return i32(1u +
        (source_index * COUPLING_SHADOW_CASCADE_COUNT + cascade_index) *
            COUPLING_SHADOW_DEPTH_KNOT_COUNT + knot_index);
}

// The producer stores a positive square-footprint Beer average at every texel.
// Hardware-linear reconstruction is therefore already the correct positive
// tent filter. Re-warping each cell with smoothstep forces a zero derivative
// at every texel centre and exposes the atlas lattice as broad quilting.
// One fetch per knot keeps the 64-node full-screen aerial integral bounded.
fn coupling_smooth_visibility_layer(
    uv: vec2<f32>, atlas_layer: i32,
) -> vec3<f32> {
    return clamp(textureSampleLevel(
        directional_coupling_atlas, atmosphere_sampler,
        clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0)),
        atlas_layer, 0.0).rgb,
        vec3<f32>(0.0), vec3<f32>(1.0));
}

fn coupling_monotone_tangent(
    previous_slope: vec3<f32>, next_slope: vec3<f32>,
) -> vec3<f32> {
    let denominator = previous_slope + next_slope;
    let safe_denominator = select(
        vec3<f32>(1.0), denominator,
        abs(denominator) > vec3<f32>(1e-8));
    let harmonic = 2.0 * previous_slope * next_slope / safe_denominator;
    return select(vec3<f32>(0.0), harmonic,
        previous_slope * next_slope > vec3<f32>(0.0));
}

fn coupling_monotone_depth_visibility(
    previous_visibility: vec3<f32>, lower_visibility: vec3<f32>,
    upper_visibility: vec3<f32>, next_visibility: vec3<f32>, amount: f32,
    lower_is_endpoint: bool, upper_is_endpoint: bool,
) -> vec3<f32> {
    let interval_slope = upper_visibility - lower_visibility;
    var lower_tangent = coupling_monotone_tangent(
        lower_visibility - previous_visibility, interval_slope);
    var upper_tangent = coupling_monotone_tangent(
        interval_slope, next_visibility - upper_visibility);
    if (lower_is_endpoint) { lower_tangent = vec3<f32>(0.0); }
    if (upper_is_endpoint) { upper_tangent = vec3<f32>(0.0); }
    let amount_2 = amount * amount;
    let amount_3 = amount_2 * amount;
    let reconstructed =
        (2.0 * amount_3 - 3.0 * amount_2 + 1.0) * lower_visibility +
        (amount_3 - 2.0 * amount_2 + amount) * lower_tangent +
        (-2.0 * amount_3 + 3.0 * amount_2) * upper_visibility +
        (amount_3 - amount_2) * upper_tangent;
    return clamp(reconstructed,
        min(lower_visibility, upper_visibility),
        max(lower_visibility, upper_visibility));
}

fn coupling_cascade_visibility_at(
    relative_world_position: vec3<f32>,
    source_direction: vec3<f32>,
    basis: CouplingShadowBasis,
    source_index: u32,
    cascade_index: u32,
) -> vec3<f32> {
    let domain = coupling_visibility_domain(source_index, cascade_index);
    if (domain.z <= 0.0 || domain.w <= 0.0) { return vec3<f32>(1.0); }
    let extent = domain.w;
    let plane = vec2<f32>(
        dot(relative_world_position, basis.right),
        dot(relative_world_position, basis.transverse));
    let plane_center = coupling_visibility_plane_center(
        source_index, cascade_index);
    let uv = (plane - plane_center) / (2.0 * extent) + vec2<f32>(0.5);
    let receiver_depth = dot(relative_world_position, source_direction);
    if (receiver_depth >= domain.y) { return vec3<f32>(1.0); }
    var knot_coordinate = 0.0;
    if (receiver_depth > domain.x) {
        knot_coordinate = coupling_visibility_unit_at_depth(
            domain, source_index, receiver_depth) *
            f32(COUPLING_SHADOW_DEPTH_KNOT_COUNT - 1u);
    }
    let lower_knot = min(
        COUPLING_SHADOW_DEPTH_KNOT_COUNT - 2u,
        u32(floor(knot_coordinate)));
    let upper_knot = lower_knot + 1u;
    let knot_fraction = knot_coordinate - f32(lower_knot);
    let bounded_uv = clamp(uv, vec2<f32>(0.0), vec2<f32>(1.0));
    let previous_knot = u32(max(0, i32(lower_knot) - 1));
    let next_knot = min(
        COUPLING_SHADOW_DEPTH_KNOT_COUNT - 1u, upper_knot + 1u);
    let previous_visibility = coupling_smooth_visibility_layer(
        bounded_uv, coupling_visibility_layer(
            source_index, cascade_index, previous_knot));
    let lower_visibility = coupling_smooth_visibility_layer(
        bounded_uv, coupling_visibility_layer(
            source_index, cascade_index, lower_knot));
    let upper_visibility = coupling_smooth_visibility_layer(
        bounded_uv, coupling_visibility_layer(
            source_index, cascade_index, upper_knot));
    let next_visibility = coupling_smooth_visibility_layer(
        bounded_uv, coupling_visibility_layer(
            source_index, cascade_index, next_knot));
    return coupling_monotone_depth_visibility(
        previous_visibility, lower_visibility, upper_visibility,
        next_visibility, knot_fraction,
        lower_knot == 0u,
        upper_knot == COUPLING_SHADOW_DEPTH_KNOT_COUNT - 1u);
}

fn coupling_visibility_cascade_importance(
    plane: vec2<f32>,
    source_index: u32, cascade_index: u32,
) -> f32 {
    let domain = coupling_visibility_domain(source_index, cascade_index);
    let local_plane = plane - coupling_visibility_plane_center(
        source_index, cascade_index);
    return max(abs(local_plane.x), abs(local_plane.y)) /
        max(1e-8, domain.w);
}

fn coupling_cloud_source_visibility_at(
    atmosphere_world_position: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    if (!coupling_visibility_contract_valid() ||
        !atmo_source_enabled(source_index)) { return vec3<f32>(1.0); }
    let source_direction = atmo_source_direction(source_index);
    let basis = coupling_shadow_basis(source_direction);
    let relative = atmosphere_world_position - physical_atmosphere.observer_world.xyz;
    let plane = vec2<f32>(dot(relative, basis.right),
        dot(relative, basis.transverse));
    let near_importance = coupling_visibility_cascade_importance(
        plane, source_index, 0u);
    let middle_importance = coupling_visibility_cascade_importance(
        plane, source_index, 1u);
    let far_importance = coupling_visibility_cascade_importance(
        plane, source_index, 2u);
    var cascade_index = 2u;
    var normalized_importance = far_importance;
    if (near_importance <= 1.0) {
        cascade_index = 0u;
        normalized_importance = near_importance;
    } else if (middle_importance <= 1.0) {
        cascade_index = 1u;
        normalized_importance = middle_importance;
    } else if (far_importance > 1.0) {
        // The far clip contains every finite owner plus reconstruction support,
        // so a source-aligned ray outside it is physically cloud-clear.
        return vec3<f32>(1.0);
    }
    let current_visibility = coupling_cascade_visibility_at(
        relative, source_direction, basis, source_index, cascade_index);
    if (cascade_index < COUPLING_SHADOW_CASCADE_COUNT - 1u) {
        let next_importance = coupling_visibility_cascade_importance(
            plane, source_index, cascade_index + 1u);
        let blend_amount = smoothstep(
            COUPLING_SHADOW_BLEND_MINIMUM,
            COUPLING_SHADOW_BLEND_MAXIMUM, normalized_importance);
        if (blend_amount > 0.0 && next_importance <= 1.0) {
            let next_visibility = coupling_cascade_visibility_at(
                relative, source_direction, basis,
                source_index, cascade_index + 1u);
            return mix(current_visibility, next_visibility, blend_amount);
        }
    }
    return current_visibility;
}

fn coupling_cloud_source_transmittance_at(
    atmosphere_world_position: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    return coupling_cloud_source_visibility_at(
        atmosphere_world_position, source_index);
}

// Aerial radiance is already integrated over a long camera segment. Sampling
// a view-dependent chain of successively coarser cascades inside that integral
// writes the near/middle transition surfaces into the sky as broad angular
// bands, even though no physical cloud boundary exists there. The far cascade
// contains every finite owner and is the one source field whose band-limit is
// uniform over the complete atmosphere ray. Cloud, ground, and finite-weather
// direct illumination deliberately continue to use the full cascade path.
fn coupling_cloud_source_aerial_transmittance_at(
    atmosphere_world_position: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    if (!coupling_visibility_contract_valid() ||
        !atmo_source_enabled(source_index)) { return vec3<f32>(1.0); }
    let source_direction = atmo_source_direction(source_index);
    let basis = coupling_shadow_basis(source_direction);
    let relative = atmosphere_world_position -
        physical_atmosphere.observer_world.xyz;
    let plane = vec2<f32>(dot(relative, basis.right),
        dot(relative, basis.transverse));
    let far_cascade = COUPLING_SHADOW_CASCADE_COUNT - 1u;
    if (coupling_visibility_cascade_importance(
            plane, source_index, far_cascade) > 1.0) {
        return vec3<f32>(1.0);
    }
    return coupling_cascade_visibility_at(
        relative, source_direction, basis, source_index, far_cascade);
}

fn coupling_profile_texture_uv(texel_x: f32, altitude_km: f32) -> vec2<f32> {
    let dimensions = vec2<f32>(textureDimensions(directional_coupling_atlas));
    let row = coupling_altitude_node_coordinate(altitude_km);
    return vec2<f32>((texel_x + 0.5) / dimensions.x, (row + 0.5) / dimensions.y);
}

fn coupling_profile_lobe(lobe_index: u32, altitude_km: f32) -> CouplingSkyLobe {
    let axis_shape = textureSampleLevel(
        directional_coupling_atlas,
        atmosphere_sampler,
        coupling_profile_texture_uv(f32(lobe_index * 2u), altitude_km),
        COUPLING_ATLAS_DIRECTIONAL_LAYER,
        0.0,
    );
    let energy_normalization = textureSampleLevel(
        directional_coupling_atlas,
        atmosphere_sampler,
        coupling_profile_texture_uv(f32(lobe_index * 2u + 1u), altitude_km),
        COUPLING_ATLAS_DIRECTIONAL_LAYER,
        0.0,
    );
    return CouplingSkyLobe(axis_shape, energy_normalization);
}

fn coupling_profile_hemisphere_irradiance(
    altitude_km: f32,
) -> CouplingHemisphereIrradiance {
    let upper = textureSampleLevel(
        directional_coupling_atlas,
        atmosphere_sampler,
        coupling_profile_texture_uv(34.0, altitude_km),
        COUPLING_ATLAS_DIRECTIONAL_LAYER,
        0.0,
    ).rgb;
    let lower = textureSampleLevel(
        directional_coupling_atlas,
        atmosphere_sampler,
        coupling_profile_texture_uv(35.0, altitude_km),
        COUPLING_ATLAS_DIRECTIONAL_LAYER,
        0.0,
    ).rgb;
    return CouplingHemisphereIrradiance(
        max(vec3<f32>(0.0), upper), max(vec3<f32>(0.0), lower));
}

fn coupling_profile_directional_radiance(
    altitude_km: f32, direction: vec3<f32>,
) -> vec3<f32> {
    var radiance = vec3<f32>(0.0);
    for (var lobe_index = 0u; lobe_index < COUPLING_ACTIVE_LOBE_COUNT;
        lobe_index += 1u) {
        radiance += coupling_directional_sky_lobe_radiance(
            coupling_profile_lobe(lobe_index, altitude_km), direction);
    }
    return max(vec3<f32>(0.0), radiance);
}

fn coupling_profile_phase_integral(
    altitude_km: f32,
    view_direction: vec3<f32>,
    asymmetry_rgb: vec3<f32>,
) -> vec3<f32> {
    var result = vec3<f32>(0.0);
    for (var lobe_index = 0u; lobe_index < COUPLING_ACTIVE_LOBE_COUNT;
        lobe_index += 1u) {
        let lobe = coupling_profile_lobe(lobe_index, altitude_km);
        let encoded_shape = lobe.axis_shape.w;
        let coherence = select(
            clamp(encoded_shape / (encoded_shape + 3.0), 0.0, 1.0),
            0.28,
            encoded_shape < 0.0,
        );
        let cosine = dot(coupling_safe_normalize(view_direction),
            coupling_safe_normalize(lobe.axis_shape.xyz));
        var phase = vec3<f32>(0.0);
        for (var channel = 0u; channel < 3u; channel += 1u) {
            let g = clamp(asymmetry_rgb[channel] * coherence, -0.96, 0.96);
            let denominator = max(1e-8,
                1.0 + g * g - 2.0 * g * clamp(cosine, -1.0, 1.0));
            phase[channel] = (1.0 - g * g) /
                (4.0 * COUPLING_PI * pow(denominator, 1.5));
        }
        result += max(vec3<f32>(0.0),
            lobe.integrated_radiance_normalization.xyz) * phase;
    }
    return max(vec3<f32>(0.0), result);
}
`;

const CLOUD_LIGHT_VOLUME_SAMPLING_WGSL =
    createCloudLightVolumeSamplingWgsl({ bindingGroup: 1 });

export const WEBGPU_ATMOSPHERE_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(7) var directional_coupling_atlas: texture_2d_array<f32>;

${physicalAtmosphereConsumerWgsl({
    group: 0,
    uniformBinding: 1,
    transmittanceBinding: 2,
    multipleScatteringBinding: 3,
    skyViewBinding: 4,
    irradianceBinding: 5,
    samplerBinding: 6,
})}

${DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL}
${DIRECTIONAL_COUPLING_ATLAS_WGSL}
${CLOUD_SHADOWED_ATMOSPHERE_TRANSPORT_WGSL}
${CELESTIAL_PHYSICS_WGSL}

const PI: f32 = 3.141592653589793;

fn saturate(value: f32) -> f32 { return clamp(value, 0.0, 1.0); }

fn hash21(point: vec2<f32>) -> f32 {
    var q = fract(vec3<f32>(point.x, point.y, point.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + vec3<f32>(33.33));
    return fract((q.x + q.y) * q.z);
}

fn noise2(point: vec2<f32>) -> f32 {
    let cell = floor(point);
    var local = fract(point);
    local = local * local * (vec2<f32>(3.0) - 2.0 * local);
    return mix(
        mix(hash21(cell), hash21(cell + vec2<f32>(1.0, 0.0)), local.x),
        mix(hash21(cell + vec2<f32>(0.0, 1.0)), hash21(cell + vec2<f32>(1.0)), local.x),
        local.y,
    );
}

fn fbm2(initial: vec2<f32>) -> f32 {
    var point = initial;
    var sum = 0.0;
    var weight = 0.56;
    for (var octave = 0; octave < 4; octave++) {
        sum += noise2(point) * weight;
        point = vec2<f32>(
            point.x * 0.80 - point.y * 0.60,
            point.x * 0.60 + point.y * 0.80,
        ) * 2.03 + vec2<f32>(7.17);
        weight *= 0.48;
    }
    return sum / 1.02;
}

fn view_direction(uv: vec2<f32>) -> vec3<f32> {
    let camera = p[4];
    let yaw_cos = cos(p[53].x);
    let yaw_sin = sin(p[53].x);
    if (camera.w > 1.5) {
        let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
        let local = normalize(vec3<f32>(
            ndc.x * tan(camera.x * 0.5),
            ndc.y * tan(camera.z * 0.5),
            1.0,
        ));
        let pitch_cos = cos(camera.y);
        let pitch_sin = sin(camera.y);
        let pitched = normalize(vec3<f32>(
            local.x,
            local.y * pitch_cos + local.z * pitch_sin,
            local.z * pitch_cos - local.y * pitch_sin,
        ));
        return normalize(vec3<f32>(
            pitched.x * yaw_cos + pitched.z * yaw_sin,
            pitched.y,
            -pitched.x * yaw_sin + pitched.z * yaw_cos,
        ));
    }
    let azimuth = (uv.x - 0.5) * camera.x;
    var elevation = mix(PI * 0.51, -0.035, pow(uv.y, 0.91));
    if (camera.w > 0.5) {
        elevation = camera.y + (0.5 - uv.y) * camera.z;
    }
    let ce = cos(elevation);
    let local = vec3<f32>(sin(azimuth) * ce, sin(elevation), cos(azimuth) * ce);
    return normalize(vec3<f32>(
        local.x * yaw_cos + local.z * yaw_sin,
        local.y,
        -local.x * yaw_sin + local.z * yaw_cos,
    ));
}

fn renderer_to_atmosphere_direction(direction: vec3<f32>) -> vec3<f32> {
    // Renderer axes are east/up/north. The atmosphere solver uses east/north/up.
    return normalize(vec3<f32>(direction.x, direction.z, direction.y));
}

fn resolved_lunar_boundary_coverage(view: vec3<f32>) -> f32 {
    if (p[52].y <= 0.5) { return 0.0; }
    let separation = acos(clamp(dot(normalize(view), normalize(p[24].xyz)), -1.0, 1.0));
    let pixel_angle = max(1e-7, p[4].x / max(1.0, p[0].x));
    // The physical radius owns astronomy. When the editorial renderer enlarges
    // the disc for legibility, its visible silhouette must still occlude the
    // same extraterrestrial boundary sources underneath it.
    let rendered_radius = p[24].w * pixel_angle;
    let radius = max(p[12].w, rendered_radius);
    return 1.0 - smoothstep(
        radius - pixel_angle, radius + pixel_angle, separation);
}

fn physical_resolved_sun_disc(
    view: vec3<f32>, atmosphere_view: vec3<f32>,
) -> vec3<f32> {
    if (!atmo_source_enabled(0u)) { return vec3<f32>(0.0); }
    let source = atmo_source_radiance_radius(0u);
    let source_irradiance = source.rgb * atmo_source_solid_angle(source.w);
    let pixel_angle = max(1e-7, p[4].x / max(1.0, p[0].x));
    let disc = celestial_sun_disc_radiance(
        atmosphere_view,
        atmo_source_direction(0u),
        source.w,
        pixel_angle,
        source_irradiance,
        p[11].xy,
    );
    let direct_transfer = atmo_transmittance_to_space(
        physical_atmosphere.observer_world.xyz,
        atmo_source_direction(0u),
    );
    return disc.toa_radiance * direct_transfer *
        (1.0 - resolved_lunar_boundary_coverage(view));
}

fn physical_artificial_ground_skyglow(atmosphere_view: vec3<f32>) -> vec3<f32> {
    let source_radiance = max(vec3<f32>(0.0), p[45].rgb);
    let source_radius = max(0.0, p[43].w);
    if (max(source_radiance.r, max(source_radiance.g, source_radiance.b)) <= 1e-8 ||
        source_radius <= 0.0 || atmosphere_view.z <= -0.01) {
        return vec3<f32>(0.0);
    }
    let observer = physical_atmosphere.observer_world.xyz;
    let local_up = normalize(observer);
    let source_world = local_up * (physical_atmosphere.radii_scales.x + ATMO_EPSILON * 2.0);
    let ray_limit = atmo_ray_limit(observer, atmosphere_view);
    let skyglow_path_length = min(max(0.0, ray_limit.x), 120.0);
    let observer_to_space = atmo_transmittance_to_space(observer, atmosphere_view);
    var result = vec3<f32>(0.0);
    let step_count = 10u;
    for (var index = 0u; index < step_count; index += 1u) {
        let u0 = f32(index) / f32(step_count);
        let u1 = f32(index + 1u) / f32(step_count);
        let t0 = skyglow_path_length * u0 * u0;
        let t1 = skyglow_path_length * u1 * u1;
        let distance = (t0 + t1) * 0.5;
        let point = observer + atmosphere_view * distance;
        let source_vector = point - source_world;
        let source_distance = max(0.02, length(source_vector));
        let incoming_direction = source_vector / source_distance;
        let upward_cosine = max(0.0, dot(incoming_direction, local_up));
        let angular_emission = pow(0.08 + 0.92 * upward_cosine,
            clamp(1.0 + p[45].w, 0.25, 8.0));
        let source_solid_angle = min(2.0 * CELESTIAL_PI,
            CELESTIAL_PI * source_radius * source_radius /
            max(source_radius * source_radius, source_distance * source_distance));
        let source_to_space = atmo_transmittance_to_space(source_world, incoming_direction);
        let point_to_space_source = atmo_transmittance_to_space(point, incoming_direction);
        let source_to_point = clamp(atmo_safe_div(source_to_space,
            point_to_space_source), vec3<f32>(0.0), vec3<f32>(1.0));
        let point_to_space_view = atmo_transmittance_to_space(point, atmosphere_view);
        let point_to_observer = clamp(atmo_safe_div(observer_to_space,
            point_to_space_view), vec3<f32>(0.0), vec3<f32>(1.0));
        let medium = atmo_sample_medium(point);
        let scattering_cosine = dot(incoming_direction, -atmosphere_view);
        let scattering = medium.rayleigh * atmo_rayleigh_phase(scattering_cosine) +
            medium.mie * atmo_cornette_shanks_phase(scattering_cosine);
        result += source_radiance * angular_emission * source_solid_angle *
            source_to_point * scattering * point_to_observer * (t1 - t0);
    }
    return max(vec3<f32>(0.0), result);
}

fn physical_night_emission(view: vec3<f32>, atmosphere_view: vec3<f32>) -> vec3<f32> {
    let night = saturate(p[41].w);
    if (night <= 0.00001 || view.y <= -0.01) { return vec3<f32>(0.0); }
    let zodiacal = celestial_zodiacal_radiance(
        view, p[33].xyz, p[35].xyz, p[35].w, p[41].rgb);
    let galactic = celestial_galactic_radiance(
        view, p[36].xyz, p[37].xyz, p[36].w, p[42].w,
        vec3<f32>(0.0), p[42].rgb, p[43].rgb);
    let integrated = celestial_integrated_starlight_radiance(
        view, p[36].xyz, p[37].xyz, p[37].w, p[44].rgb);
    let airglow = celestial_airglow_radiance(
        view, p[38].rgb, p[39].z, p[39].x, p[39].y,
        p[39].w, p[40].z, p[40].xy, p[40].w);
    let path_transmittance = atmo_transmittance_to_space(
        physical_atmosphere.observer_world.xyz, atmosphere_view);
    // The resolved lunar disc owns occultation. Only extraterrestrial diffuse
    // boundary light is removed here; foreground atmosphere and airglow remain.
    let moon_separation = acos(clamp(dot(normalize(view), normalize(p[24].xyz)), -1.0, 1.0));
    let lunar_radius = max(1e-6, p[47].w);
    let lunar_coverage = resolved_lunar_boundary_coverage(view);
    let extra = (zodiacal + galactic + integrated) * (1.0 - lunar_coverage);
    let observer_medium = atmo_sample_medium(physical_atmosphere.observer_world.xyz);
    let total_scattering = max(observer_medium.scattering, vec3<f32>(1e-8));
    let optical_depth = max(vec3<f32>(0.0), -log(max(path_transmittance, vec3<f32>(1e-6))));
    let rayleigh_depth = optical_depth * observer_medium.rayleigh / total_scattering;
    let aerosol_depth = optical_depth * observer_medium.mie / total_scattering;
    let half_path = sqrt(path_transmittance);
    let aureole = celestial_lunar_atmospheric_aureole(
        moon_separation, lunar_radius,
        p[12].rgb,
        half_path, rayleigh_depth, aerosol_depth,
        physical_atmosphere.rayleigh_scattering_mie_g.w,
        half_path, vec3<f32>(0.0));
    let artificial_skyglow = physical_artificial_ground_skyglow(atmosphere_view);
    return (extra * path_transmittance + airglow.emission_radiance * path_transmittance +
        aureole.observed_radiance + artificial_skyglow) * night;
}

fn cloud_shadowed_atmosphere_loss(view_direction: vec3<f32>) -> vec3<f32> {
    let origin = physical_atmosphere.observer_world.xyz;
    let limit = atmo_ray_limit(origin, view_direction);
    let distance = max(0.0, limit.x);
    let hit_ground = limit.y > 0.5;
    let end_world = origin + view_direction * distance;
    let atmosphere_transport = cloud_shadowed_atmosphere_segment_transport(
        origin, end_world);
    let boundary_direction = select(
        view_direction, -view_direction, hit_ground);
    let origin_boundary_transmittance = atmo_transmittance_to_space(
        origin, boundary_direction);
    var removed_radiance = atmosphere_transport.removed_radiance;
    if (hit_ground) {
        let ground_point = end_world;
        let ground_throughput = cloud_clear_segment_to_point_transmittance(
            origin_boundary_transmittance, ground_point,
            view_direction, true);
        let up = normalize(ground_point);
        for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
            source_index += 1u) {
            if (!atmo_source_enabled(source_index)) { continue; }
            let source_direction = atmo_source_direction(source_index);
            let source = atmo_source_radiance_radius(source_index);
            let source_irradiance = source.rgb * atmo_source_solid_angle(source.w);
            let atmosphere_transfer = atmo_transmittance_to_space(
                ground_point + up * (ATMO_EPSILON * 2.0), source_direction);
            let cloud_transfer = coupling_cloud_source_transmittance_at(
                ground_point, source_index);
            removed_radiance += ground_throughput * source_irradiance *
                atmosphere_transfer *
                max(0.0, dot(up, source_direction)) *
                physical_atmosphere.ground_albedo_multiple_scattering.xyz /
                ATMO_PI * (vec3<f32>(1.0) - cloud_transfer);
        }
    }
    return max(vec3<f32>(0.0), removed_radiance);
}

@fragment
fn atmosphere_fragment(input: VertexOut) -> @location(0) vec4<f32> {
    let view = view_direction(input.uv);
    let atmosphere_view = renderer_to_atmosphere_direction(view);
    let shadow_loss = cloud_shadowed_atmosphere_loss(atmosphere_view);
    if (i32(round(p[22].y)) == 14) {
        return vec4<f32>(shadow_loss, 1.0);
    }
    let clear_physical = physical_atmosphere_sky_radiance(atmosphere_view);
    let physical = max(vec3<f32>(0.0), clear_physical -
        min(clear_physical, shadow_loss));
    let radiance = physical + physical_night_emission(view, atmosphere_view) +
        physical_resolved_sun_disc(view, atmosphere_view);
    return vec4<f32>(radiance, 1.0);
}
`;

/**
 * Cheap screen-space shell classification. It computes exact curved-shell
 * entry/exit distances and deliberately leaves density rejection to the
 * transport pass until a cell-conservative traversal passes its visual and
 * performance gates.
 */

export const WEBGPU_CLOUD_INTERVAL_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> layers: array<vec4<f32>>;

const PI: f32 = 3.141592653589793;
const PLANET_RADIUS: f32 = 6371.0;
const FAR_LIMIT: f32 = 140.0;

${CLOUD_VOLUME_FILTERING_WGSL}
${CLOUD_LIGHT_VOLUME_SAMPLING_WGSL}

fn cloud_volume_lod_at_local_position(
    local_position: vec3<f32>,
    coordinate_frequency_per_km: f32,
    texture_size: f32,
    maximum_mip: f32,
) -> f32 {
    let observer_local = vec3<f32>(0.0, p[19].w, 0.0);
    return cloud_volume_lod_for_world_frequency(
        length(local_position - observer_local),
        coordinate_frequency_per_km,
        texture_size,
        maximum_mip,
        p[4],
        max(vec2<f32>(1.0), p[29].zw),
    );
}

struct Layer {
    geometry: vec4<f32>,
    shape: vec4<f32>,
    motion: vec4<f32>,
    phase: vec4<f32>,
    scale: vec4<f32>,
    organization: vec4<f32>,
    species: vec4<f32>,
};

struct IntervalOutput {
    @location(0) low_middle: vec4<f32>,
    @location(1) high_mask: vec4<f32>,
};

fn layer_at(index: i32) -> Layer {
    let offset = index * 7;
    return Layer(
        layers[offset], layers[offset + 1], layers[offset + 2],
        layers[offset + 3], layers[offset + 4], layers[offset + 5],
        layers[offset + 6],
    );
}

fn saturate(value: f32) -> f32 { return clamp(value, 0.0, 1.0); }

fn view_direction(uv: vec2<f32>) -> vec3<f32> {
    let camera = p[4];
    let yaw_cos = cos(p[53].x);
    let yaw_sin = sin(p[53].x);
    if (camera.w > 1.5) {
        let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
        let local = normalize(vec3<f32>(
            ndc.x * tan(camera.x * 0.5),
            ndc.y * tan(camera.z * 0.5),
            1.0,
        ));
        let pitch_cos = cos(camera.y);
        let pitch_sin = sin(camera.y);
        let pitched = normalize(vec3<f32>(
            local.x,
            local.y * pitch_cos + local.z * pitch_sin,
            local.z * pitch_cos - local.y * pitch_sin,
        ));
        return normalize(vec3<f32>(
            pitched.x * yaw_cos + pitched.z * yaw_sin,
            pitched.y,
            -pitched.x * yaw_sin + pitched.z * yaw_cos,
        ));
    }
    let azimuth = (uv.x - 0.5) * camera.x;
    var elevation = mix(PI * 0.51, -0.035, pow(uv.y, 0.91));
    if (camera.w > 0.5) { elevation = camera.y + (0.5 - uv.y) * camera.z; }
    let ce = cos(elevation);
    let local = vec3<f32>(sin(azimuth) * ce, sin(elevation), cos(azimuth) * ce);
    return normalize(vec3<f32>(
        local.x * yaw_cos + local.z * yaw_sin,
        local.y,
        -local.x * yaw_sin + local.z * yaw_cos,
    ));
}

// Non-production comparison modes retain the original screen-space staging.
// Production composition is performed by world-space weather domains inside
// density_at(), so every cloud remains on a physically plausible view ray.
fn cloud_composition_uv(uv: vec2<f32>, index: i32) -> vec2<f32> {
    let mode = i32(round(p[28].y));
    var result = uv;
    var target_center = 0.72;
    var target_half = 0.28;
    var source_center = 0.74;
    var source_half = 0.17;
    var horizontal_scale = 0.62;
    if (index == 1) {
        target_center = 0.49;
        target_half = 0.25;
        source_center = 0.70;
        source_half = 0.20;
        horizontal_scale = 0.76;
    }
    if (index == 2) {
        target_center = 0.28;
        target_half = 0.23;
        source_center = 0.62;
        source_half = 0.27;
        horizontal_scale = 0.92;
    }
    if (mode == 1) {
        let seeded_offset = (p[14][index] - 0.5) *
            mix(0.18, 0.08, f32(index) * 0.5);
        result = vec2<f32>(
            0.5 + (uv.x - 0.5) * horizontal_scale + seeded_offset,
            source_center + (uv.y - target_center) / target_half * source_half,
        );
    }

    // Lens alternatives are independent from the framing/mask choice. This
    // makes the Lab useful for comparing scale and convergence without also
    // changing which masses are allowed to enter the frame.
    let perspective = i32(round(p[28].z));
    if (perspective == 1) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 1.22,
            0.5 + (result.y - 0.5) * 1.10,
        );
    }
    if (perspective == 2) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 0.82,
            0.5 + (result.y - 0.5) * 0.90,
        );
    }
    if (perspective == 3) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 0.62,
            0.5 + (result.y - 0.5) * 0.52,
        );
    }
    if (perspective == 4) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 1.48,
            0.5 + (result.y - 0.5) * 0.96,
        );
    }
    return result;
}

fn ellipse_field(uv: vec2<f32>, center: vec2<f32>, radius: vec2<f32>) -> f32 {
    let distance = length((uv - center) / radius);
    return 1.0 - smoothstep(0.72, 1.08, distance);
}

fn cloud_composition_mask(uv: vec2<f32>, layer: Layer, index: i32) -> f32 {
    let mode = i32(round(p[28].y));
    if (mode == 0 || mode == 3) { return 1.0; }
    var center = 0.72;
    var half_height = 0.28;
    if (index == 1) { center = 0.49; half_height = 0.25; }
    if (index == 2) { center = 0.28; half_height = 0.23; }
    let band = 1.0 - smoothstep(
        half_height * 0.78,
        half_height,
        abs(uv.y - center),
    );
    if (mode == 1) { return band; }

    let seed_a = p[14][index];
    let seed_b = p[14][(index + 1) % 4];
    let vertical_shift = (seed_b - 0.5) * half_height * 0.36;
    let left = ellipse_field(
        uv,
        vec2<f32>(-0.04 + seed_a * 0.10, center + vertical_shift),
        vec2<f32>(0.48, half_height * 0.92),
    ) * (0.72 + seed_b * 0.28);
    let right = ellipse_field(
        uv,
        vec2<f32>(1.04 - seed_b * 0.10, center - vertical_shift * 0.72),
        vec2<f32>(0.52, half_height),
    ) * (0.72 + seed_a * 0.28);
    let offset_accent = ellipse_field(
        uv,
        vec2<f32>(0.38 + seed_a * 0.24, center - half_height * 0.18),
        vec2<f32>(0.31, half_height * 0.70),
    ) * 0.64;
    var framing = max(max(left, right), offset_accent);
    let genus = i32(round(layer.scale.z));
    let broad_sheet = genus == 3 || genus == 5 || genus == 6 || genus == 8 ||
        layer.geometry.z > 0.82;
    framing = select(framing, mix(0.76, 1.0, framing), broad_sheet);
    return smoothstep(0.02, 0.18, framing);
}

fn sphere_hits(origin: vec3<f32>, direction: vec3<f32>, radius: f32) -> vec2<f32> {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;
    let d = b * b - c;
    if (d < 0.0) { return vec2<f32>(-1.0); }
    let root = sqrt(d);
    return vec2<f32>(-b - root, -b + root);
}

fn interval_for_layer(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer, index: i32,
) -> vec4<f32> {
    if (layer.phase.z < 0.5 || layer.geometry.z <= 0.0001) {
        return vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0);
    }
    let inner = sphere_hits(origin, direction, PLANET_RADIUS + layer.geometry.x);
    let outer = sphere_hits(
        origin, direction,
        PLANET_RADIUS + layer.geometry.x + layer.geometry.y,
    );
    if (outer.y <= 0.0) { return vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0); }
    let near = select(max(0.0, outer.x), inner.y, inner.y > 0.0);
    // World-space system placement is authoritative. Low storms and frontal
    // sheets can remain sharply visible well beyond the former fixed 38 km
    // cutoff; clipping the shell before their finite owner volume produced
    // empty overcasts and circular cutoff contours. Aerial perspective later
    // attenuates the completed cloud-to-camera segment without deleting it.
    let far = min(outer.y, FAR_LIMIT);
    if (far <= near) { return vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0); }

    return vec4<f32>(near, far, 1.0, 1.0);
}

@fragment
fn cloud_interval_fragment(input: VertexOut) -> IntervalOutput {
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let low_layer = layer_at(0);
    let middle_layer = layer_at(1);
    let high_layer = layer_at(2);
    let low_mask = cloud_composition_mask(input.uv, low_layer, 0);
    let middle_mask = cloud_composition_mask(input.uv, middle_layer, 1);
    let high_mask_value = cloud_composition_mask(input.uv, high_layer, 2);
    var low = interval_for_layer(
        origin, view_direction(cloud_composition_uv(input.uv, 0)), low_layer, 0);
    var middle = interval_for_layer(
        origin, view_direction(cloud_composition_uv(input.uv, 1)), middle_layer, 1);
    var high = interval_for_layer(
        origin, view_direction(cloud_composition_uv(input.uv, 2)), high_layer, 2);
    if (low_mask <= 0.001) { low = vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0); }
    if (middle_mask <= 0.001) { middle = vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0); }
    if (high_mask_value <= 0.001) { high = vec4<f32>(FAR_LIMIT, 0.0, 0.0, 0.0); }
    let mask = low.z + middle.z * 2.0 + high.z * 4.0;
    var output: IntervalOutput;
    output.low_middle = vec4<f32>(low.xy, middle.xy);
    output.high_mask = vec4<f32>(high.xy, mask, max(low.w, max(middle.w, high.w)));
    return output;
}
`;

export const WEBGPU_CLOUD_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(1) var<storage, read> layers: array<vec4<f32>>;
@group(0) @binding(2) var base_volume: texture_3d<f32>;
@group(0) @binding(3) var detail_volume: texture_3d<f32>;
@group(0) @binding(4) var weather_texture: texture_2d_array<f32>;
@group(0) @binding(5) var volume_sampler: sampler;
@group(0) @binding(7) var cloud_interval_low_middle: texture_2d<f32>;
@group(0) @binding(8) var cloud_interval_high_mask: texture_2d<f32>;
@group(0) @binding(9) var blue_noise_texture: texture_2d<f32>;
@group(0) @binding(14) var directional_coupling_atlas: texture_2d_array<f32>;

// Persistent world-space cloud-system owners. The CPU creates these only when
// the meteorological scene changes; view transport and light transport sample
// the identical records, so a highlight or shadow cannot belong to a
// different procedural owner than the visible cloud.
struct CloudFeature {
    identity: vec4<f32>,
    center_bound: vec4<f32>,
    axis_extent: vec4<f32>,
    shape: vec4<f32>,
    variation: vec4<f32>,
    extra0: vec4<f32>,
    extra1: vec4<f32>,
    extra2: vec4<f32>,
};

@group(0) @binding(15) var<storage, read> cloud_features: array<CloudFeature>;

// Camera-independent finite meteorological systems. This ABI mirrors
// CLOUD_SYSTEM_VEC4_LAYOUT exactly: one header vec4 followed by naturally
// aligned sixteen-vec4 records. Keep the records free of camera/frustum data;
// the same owners are sampled by the view and light-transport entry points.
struct CloudSystem {
    identity: vec4<f32>,
    horizontal_extent: vec4<f32>,
    vertical_extent: vec4<f32>,
    formation_levels: vec4<f32>,
    cap_and_shear: vec4<f32>,
    optical_material: vec4<f32>,
    thermodynamics: vec4<f32>,
    kinematics: vec4<f32>,
    lifecycle: vec4<f32>,
    lifecycle_tendencies: vec4<f32>,
    organization_primary: vec4<f32>,
    organization_secondary: vec4<f32>,
    precipitation: vec4<f32>,
    classification_masks: vec4<f32>,
    deterministic_seeds: vec4<f32>,
    buoyancy_and_turbulence: vec4<f32>,
};

struct CloudSystemBuffer {
    header: vec4<f32>,
    systems: array<CloudSystem>,
};

// Per-owner atlas transforms are resolved from the versioned manifest on the
// CPU. This keeps WGSL independent of atlas resolution, z stride, volume
// count, and future lifecycle expansion while preserving the CloudSystem ABI.
struct CloudMacroBinding {
    atlas_scale: vec4<f32>,
    atlas_offset: vec4<f32>,
    majorant_scale: vec4<f32>,
    majorant_offset: vec4<f32>,
    // Mean normalized atlas-R density paths through vertical, crosswind and
    // downwind projections, followed by the vertical 90th percentile. The
    // vertical mean calibrates one scalar material extinction coefficient;
    // the other paths remain morphology/qualification diagnostics. High-cloud
    // camera and source density both use this same R field before applying the
    // same stationary, mean-preserving 3-D ice residual at physical LOD.
    condensate_paths: vec4<f32>,
    // Canonical-to-texture transform for the compact guarded 96^3 high-ice
    // source atlas. source_scale.w is the explicit availability sentinel;
    // analytic fibratus and every non-high-ice owner leave both vectors zero.
    high_ice_source_scale: vec4<f32>,
    // xyz is the texel-centre offset of the source slot. w retains its stable
    // manifest slot ordinal for diagnostics without changing sampling.
    high_ice_source_offset: vec4<f32>,
};

struct CloudMacroBindingBuffer {
    header: vec4<f32>,
    owners: array<CloudMacroBinding>,
};

// Version-one lifecycle atlas: R authoritative condensate, G detail class,
// B ice fraction, A conservative signed distance (negative inside). The
// separate R8 texture stores conservative 8^3 brick majorants.
@group(0) @binding(16) var cloud_macro_atlas: texture_3d<f32>;
@group(0) @binding(17) var cloud_macro_majorants: texture_3d<f32>;
@group(0) @binding(18) var cloud_macro_sampler: sampler;
// Guarded authored high-ice source atlas. R is the exact block-mass-
// conditioned 96^3 density realization; G is the corresponding 48^3 source
// support coverage replicated into each 2^3 child block; B is the conditioned
// block E[rho^2], and A is the authored fine support bit. A single RGBA8
// binding replaces the old moment-only sidecar because the shared fragment
// pipeline already occupies WebGPU's guaranteed 16 sampled-texture slots.
@group(0) @binding(32) var cloud_high_ice_source_atlas: texture_3d<f32>;
@group(0) @binding(19) var<storage, read> cloud_system_buffer: CloudSystemBuffer;
@group(0) @binding(20) var<storage, read> cloud_macro_bindings: CloudMacroBindingBuffer;

${CLOUD_OPTICS_WGSL}

${physicalAtmosphereConsumerWgsl({
    group: 0,
    uniformBinding: 25,
    transmittanceBinding: 6,
    multipleScatteringBinding: 26,
    skyViewBinding: 27,
    irradianceBinding: 33,
    samplerBinding: 28,
})}

${DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL}
${DIRECTIONAL_COUPLING_ATLAS_WGSL}
${CLOUD_SHADOWED_ATMOSPHERE_TRANSPORT_WGSL}
${CLOUD_LIGHT_VOLUME_SAMPLING_WGSL}

${createHydrometeorBufferDeclaration(0, 29)}
${HYDROMETEOR_FIELD_WGSL}
${createHydrometeorAccumulatorWgsl()}

${CLOUD_MORPHOLOGY_MODIFIERS_WGSL}

@group(0) @binding(31) var directional_coupling_atlas_output:
    texture_storage_2d_array<rgba16float, write>;

const PI: f32 = 3.141592653589793;
const PLANET_RADIUS: f32 = 6371.0;
const FAR_LIMIT: f32 = 140.0;

${CLOUD_VOLUME_FILTERING_WGSL}

fn cloud_volume_lod_at_local_position(
    local_position: vec3<f32>,
    coordinate_frequency_per_km: f32,
    texture_size: f32,
    maximum_mip: f32,
) -> f32 {
    let observer_local = vec3<f32>(0.0, p[19].w, 0.0);
    return cloud_volume_lod_for_world_frequency(
        length(local_position - observer_local),
        coordinate_frequency_per_km,
        texture_size,
        maximum_mip,
        p[4],
        max(vec2<f32>(1.0), p[29].zw),
    );
}

fn renderer_to_atmosphere_world(position: vec3<f32>) -> vec3<f32> {
    // Cloud space is east/radial-up/north. The atmosphere solver is
    // east/north/radial-up and shares the same planet-centred origin.
    return vec3<f32>(position.x, position.z, position.y);
}

fn atmosphere_to_renderer_direction(direction: vec3<f32>) -> vec3<f32> {
    return normalize(vec3<f32>(direction.x, direction.z, direction.y));
}

fn physical_source_irradiance_at(
    source_index: u32,
    renderer_position: vec3<f32>,
) -> vec3<f32> {
    if (!atmo_source_enabled(source_index)) { return vec3<f32>(0.0); }
    let source = atmo_source_radiance_radius(source_index);
    let world_position = renderer_to_atmosphere_world(renderer_position);
    return source.rgb * atmo_source_solid_angle(source.w) *
        atmo_transmittance_to_space(
            world_position, atmo_source_direction(source_index));
}

fn physical_diffuse_irradiance_at(renderer_position: vec3<f32>) -> vec3<f32> {
    let world_position = renderer_to_atmosphere_world(renderer_position);
    let altitude_km = max(
        0.0, length(world_position) - physical_atmosphere.radii_scales.x);
    return coupling_profile_hemisphere_irradiance(altitude_km).upper_rgb;
}

fn physical_lower_atmosphere_irradiance_at(
    renderer_position: vec3<f32>,
) -> vec3<f32> {
    let world_position = renderer_to_atmosphere_world(renderer_position);
    let altitude_km = max(
        0.0, length(world_position) - physical_atmosphere.radii_scales.x);
    return coupling_profile_hemisphere_irradiance(altitude_km).lower_rgb;
}

fn physical_ground_irradiance_at(renderer_position: vec3<f32>) -> vec3<f32> {
    let atmosphere_point = renderer_to_atmosphere_world(renderer_position);
    let radius = max(PLANET_RADIUS + 0.0001, length(atmosphere_point));
    let local_up = normalize(atmosphere_point);
    let ground_point = local_up * (PLANET_RADIUS + 0.0002);
    let ground_renderer = vec3<f32>(ground_point.x, ground_point.z, ground_point.y);
    let clear_transfer = CouplingPassiveCloudTransfer(
        vec3<f32>(1.0), vec3<f32>(0.0));
    var direct_sources: array<CouplingGroundDirectSource, 2>;
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        let projected_irradiance = physical_source_irradiance_at(
            source_index, ground_renderer) * max(0.0,
                dot(local_up, atmo_source_direction(source_index)));
        let cloud_transfer = CouplingPassiveCloudTransfer(
            coupling_cloud_source_transmittance_at(ground_point, source_index),
            vec3<f32>(0.0));
        direct_sources[source_index] = CouplingGroundDirectSource(
            projected_irradiance, cloud_transfer);
    }
    let ground_to_sample = clamp(atmo_safe_div(
        atmo_transmittance_to_space(ground_point, local_up),
        max(vec3<f32>(1e-8),
            atmo_transmittance_to_space(atmosphere_point, local_up))),
        vec3<f32>(0.0), vec3<f32>(1.0));
    let ground_view_factor = clamp(
        (PLANET_RADIUS * PLANET_RADIUS) / (radius * radius), 0.0, 1.0);
    let bounce = coupling_cloud_shadowed_ground_bounce(
        coupling_profile_hemisphere_irradiance(0.0).upper_rgb,
        clear_transfer,
        direct_sources[0u],
        direct_sources[1u],
        physical_atmosphere.ground_albedo_multiple_scattering.xyz,
        ground_to_sample,
        ground_view_factor,
    );
    return bounce.lower_hemisphere_irradiance_at_sample_rgb;
}

struct CloudOutput {
    @location(0) radiance: vec4<f32>,
    @location(1) transmittance: vec4<f32>,
    @location(2) geometry: vec4<f32>,
    @location(3) motion: vec4<f32>,
};

struct CloudLightingOutput {
    @location(0) low: vec4<f32>,
    @location(1) middle: vec4<f32>,
    @location(2) high: vec4<f32>,
};

struct Layer {
    geometry: vec4<f32>,
    shape: vec4<f32>,
    motion: vec4<f32>,
    phase: vec4<f32>,
    scale: vec4<f32>,
    organization: vec4<f32>,
    species: vec4<f32>,
};

struct CameraTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
};

struct LayerMarchResult {
    transport: CameraTransport,
    first_depth: f32,
    mean_depth: f32,
    optical_depth_y: f32,
    opacity_y: f32,
    velocity: vec2<f32>,
    layer_identifier: f32,
    evaluated_steps: f32,
};

// Production cloud composition deliberately keeps all three layer results in
// scalar values. This avoids Metal lowering a dynamically indexed private
// array of transport structs while retaining the full march_layer result used
// by the G-buffer and temporal reconstruction contract.
struct LayerPacket {
    transport: CameraTransport,
    first_depth: f32,
    mean_depth: f32,
    opacity_y: f32,
    velocity: vec2<f32>,
    layer_identifier: f32,
    evaluated_steps: f32,
};

fn layer_at(index: i32) -> Layer {
    let offset = index * 7;
    return Layer(
        layers[offset], layers[offset + 1], layers[offset + 2],
        layers[offset + 3], layers[offset + 4], layers[offset + 5],
        layers[offset + 6],
    );
}

fn saturate(value: f32) -> f32 { return clamp(value, 0.0, 1.0); }
fn photopic(value: vec3<f32>) -> f32 {
    return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}
fn maximum_rgb(value: vec3<f32>) -> f32 {
    return max(value.x, max(value.y, value.z));
}
fn finite_scalar(value: f32) -> bool {
    return value == value && abs(value) <= 3.402823466e+38;
}
fn finite_rgb(value: vec3<f32>) -> bool {
    return all(value == value) &&
        maximum_rgb(abs(value)) <= 3.402823466e+38;
}
fn camera_transport_identity() -> CameraTransport {
    return CameraTransport(vec3<f32>(0.0), vec3<f32>(1.0));
}
fn compose_camera_transport(
    front: CameraTransport, back: CameraTransport,
) -> CameraTransport {
    return CameraTransport(
        front.radiance + front.transmittance * back.radiance,
        front.transmittance * back.transmittance,
    );
}
fn integrate_camera_transport_coefficients(
    extinction_rgb_per_km: vec3<f32>,
    source_coefficient_rgb_per_km: vec3<f32>,
    distance_km: f32,
) -> CameraTransport {
    var extinction = vec3<f32>(0.0);
    if (finite_rgb(extinction_rgb_per_km)) {
        extinction = max(vec3<f32>(0.0), extinction_rgb_per_km);
    }
    var source = vec3<f32>(0.0);
    if (finite_rgb(source_coefficient_rgb_per_km)) {
        source = max(vec3<f32>(0.0), source_coefficient_rgb_per_km);
    }
    var distance = 0.0;
    if (finite_scalar(distance_km)) { distance = max(0.0, distance_km); }
    let transmittance = exp(-extinction * distance);
    var radiance = vec3<f32>(0.0);
    for (var channel = 0u; channel < 3u; channel += 1u) {
        if (extinction[channel] <= 1e-10) {
            radiance[channel] = source[channel] * distance;
        } else {
            radiance[channel] = source[channel] *
                (1.0 - transmittance[channel]) / extinction[channel];
        }
    }
    return CameraTransport(radiance, transmittance);
}
fn relative_weather_transport(
    combined: CameraTransport,
    background_atmosphere: CameraTransport,
    tracked_weather_transmittance: vec3<f32>,
) -> CameraTransport {
    // The background texture already evaluates the cloud-shadowed atmosphere
    // operator A'. The ordered marcher evaluates the combined operator C with
    // that identical local air source. Return W such that W(A'(B)) == C(B) for
    // every boundary radiance B. Using unshadowed A here would subtract the
    // directional cloud-shadow loss a second time at final composition.
    // Tracking weather Beer transport independently avoids dividing C.T/A.T
    // after long horizon paths where both values can underflow rgba16float.
    var weather_transmittance = vec3<f32>(1.0);
    if (finite_rgb(tracked_weather_transmittance)) {
        weather_transmittance = clamp(
            tracked_weather_transmittance,
            vec3<f32>(0.0), vec3<f32>(1.0));
    }
    // In the numerically conditioned range, independently verify the tracked
    // Beer product against C.T = W.T * A'.T. A mismatch means one path did not
    // use the same atmosphere partition, so derive the exact affine quotient
    // channel-wise. Near FP16 underflow the explicit weather product remains
    // the stable representation and division is deliberately avoided.
    if (finite_rgb(combined.transmittance) &&
        finite_rgb(background_atmosphere.transmittance)) {
        for (var channel = 0u; channel < 3u; channel += 1u) {
            let background_t = background_atmosphere.transmittance[channel];
            if (background_t > 1e-4) {
                let expected_combined_t =
                    weather_transmittance[channel] * background_t;
                let tolerance = 2e-4 * max(
                    1.0, abs(combined.transmittance[channel]));
                if (abs(combined.transmittance[channel] -
                        expected_combined_t) > tolerance) {
                    weather_transmittance[channel] = clamp(
                        combined.transmittance[channel] / background_t,
                        0.0, 1.0);
                }
            }
        }
    }
    var relative_radiance = combined.radiance -
        weather_transmittance * background_atmosphere.radiance;
    // Negative relative radiance is valid: clouds can remove atmospheric
    // in-scattering already present in the background. Only nonfinite values
    // are rejected; the affine correction itself is never clamped.
    if (!finite_rgb(relative_radiance)) { relative_radiance = vec3<f32>(0.0); }
    return CameraTransport(relative_radiance, weather_transmittance);
}

fn cloud_source_share_of_combined_segment(
    combined_segment: CameraTransport,
    cloud_source_coefficient: vec3<f32>,
    combined_source_coefficient: vec3<f32>,
) -> vec3<f32> {
    // Emission-absorption is linear in source coefficient for fixed combined
    // extinction. Partition the exact segment solution rather than marching a
    // second cloud-only extinction event with the wrong Beer denominator.
    let source_share = clamp(
        cloud_source_coefficient /
            max(vec3<f32>(1e-8), combined_source_coefficient),
        vec3<f32>(0.0), vec3<f32>(1.0));
    return combined_segment.radiance * source_share;
}

fn cloud_relative_transport_from_air_moment(
    cloud_source_radiance: vec3<f32>,
    exact_shared_air: CameraTransport,
    cloud_weighted_air_proxy: vec3<f32>,
    air_proxy_weight: vec3<f32>,
    cloud_transmittance: vec3<f32>,
) -> CameraTransport {
    let q = clamp(cloud_transmittance,
        vec3<f32>(0.0), vec3<f32>(1.0));
    // K = integral(q(s) dA) / integral(dA). q(s) is the weather Beer
    // throughput in front of an air-source event. Therefore Q <= K <= 1:
    // foreground air has K=1, air behind all cloud has K=Q, and interleaved
    // air/cloud lies strictly between them. The proxy estimates only this
    // bounded depth moment; exact radiance comes from the shared operator.
    let proxy_k = cloud_weighted_air_proxy /
        max(vec3<f32>(1e-8), air_proxy_weight);
    let k = clamp(select(q, proxy_k,
        air_proxy_weight > vec3<f32>(1e-8)), q, vec3<f32>(1.0));
    let relative_air_radiance =
        (k - q) * exact_shared_air.radiance;
    // The correction is not hard-masked or color-clamped. Its sign follows
    // the proven K >= Q ordering, while the generic affine helper above still
    // retains signed radiance for non-cloud weather operators.
    return CameraTransport(
        cloud_source_radiance + relative_air_radiance, q);
}

// Atmosphere samples used by the cloud march. Clear air and cloud coefficients
// must share an exponential event wherever condensate is present; applying a
// complete atmosphere operator at one representative cloud depth changes the
// ordering of in-scattering across an extended cloud. The unshadowed source is
// retained independently for diagnostics. Relative weather transport uses the
// shadowed source coefficient because the rendered atmosphere background has
// already applied the same directional cloud-visibility loss.
fn cloud_coupled_atmosphere_direct_source(
    source_index: u32,
    point: vec3<f32>,
    view_direction_atmosphere: vec3<f32>,
    include_cloud_visibility: bool,
) -> CouplingAerialDirectSource {
    let source = atmo_source_radiance_radius(source_index);
    let source_irradiance = select(
        vec3<f32>(0.0),
        source.rgb * atmo_source_solid_angle(source.w),
        atmo_source_enabled(source_index));
    let source_direction = atmo_source_direction(source_index);
    let atmosphere_transport = atmo_transmittance_to_space(
        point, source_direction);
    let medium = atmo_sample_medium(point);
    let cosine = dot(view_direction_atmosphere, source_direction);
    let phase_scattering =
        medium.rayleigh * atmo_rayleigh_phase(cosine) +
        medium.mie * atmo_cornette_shanks_phase(cosine);
    let effective_phase = atmo_safe_div(
        phase_scattering, max(vec3<f32>(1e-8), medium.scattering));
    let cloud_transmittance = select(
        vec3<f32>(1.0),
        coupling_cloud_source_aerial_transmittance_at(point, source_index),
        vec3<bool>(include_cloud_visibility));
    return CouplingAerialDirectSource(
        source_irradiance * atmosphere_transport,
        effective_phase,
        CouplingPassiveCloudTransfer(cloud_transmittance, vec3<f32>(0.0)));
}

fn cloud_coupled_atmosphere_source_sample(
    renderer_point: vec3<f32>, renderer_direction: vec3<f32>,
    include_cloud_visibility: bool,
) -> CouplingAerialSourceSample {
    let point = renderer_to_atmosphere_world(renderer_point);
    let view_direction_atmosphere = normalize(vec3<f32>(
        renderer_direction.x, renderer_direction.z, renderer_direction.y));
    let medium = atmo_sample_medium(point);
    let source_0 = cloud_coupled_atmosphere_direct_source(
        0u, point, view_direction_atmosphere, include_cloud_visibility);
    let source_1 = cloud_coupled_atmosphere_direct_source(
        1u, point, view_direction_atmosphere, include_cloud_visibility);
    var diffuse_incident = vec3<f32>(0.0);
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        let source = atmo_source_radiance_radius(source_index);
        let source_irradiance = select(
            vec3<f32>(0.0),
            source.rgb * atmo_source_solid_angle(source.w),
            atmo_source_enabled(source_index));
        diffuse_incident += source_irradiance * atmo_multiple_scattering(
            point, atmo_source_direction(source_index));
    }
    return coupling_aerial_source(
        CouplingAerialMedium(medium.extinction, medium.scattering),
        diffuse_incident,
        CouplingPassiveCloudTransfer(vec3<f32>(1.0), vec3<f32>(0.0)),
        source_0,
        source_1);
}

// Renderer-space adapter for the canonical shadowed-atmosphere operator used
// by the atmosphere background. Keeping this as a thin coordinate conversion
// prevents the cloud marcher from growing a second quadrature or promoting an
// interval-average visibility across a prefix, clear gap, or tail.
fn cloud_background_atmosphere_segment(
    origin: vec3<f32>, direction: vec3<f32>, near_km: f32, far_km: f32,
) -> CameraTransport {
    if (far_km <= near_km) { return camera_transport_identity(); }
    let segment = cloud_shadowed_atmosphere_segment_transport(
        renderer_to_atmosphere_world(origin + direction * near_km),
        renderer_to_atmosphere_world(origin + direction * far_km));
    return CameraTransport(segment.radiance, segment.transmittance);
}
fn camera_transport_removed_luminance(
    incoming: vec3<f32>, medium_transmittance: vec3<f32>,
) -> f32 {
    return max(0.0, photopic(
        incoming * (vec3<f32>(1.0) - medium_transmittance)));
}
fn apply_camera_transport_coverage(
    transport: CameraTransport, coverage: f32,
) -> CameraTransport {
    let amount = saturate(coverage);
    let original_t = clamp(
        transport.transmittance, vec3<f32>(0.0001), vec3<f32>(1.0));
    let placed_t = exp(log(original_t) * amount);
    let original_removal = vec3<f32>(1.0) - original_t;
    let placed_removal = vec3<f32>(1.0) - placed_t;
    let scale = select(
        vec3<f32>(0.0),
        placed_removal / max(original_removal, vec3<f32>(1e-6)),
        original_removal > vec3<f32>(1e-6),
    );
    return CameraTransport(transport.radiance * scale, placed_t);
}
fn camera_transport_through_foreground_air(
    weather: CameraTransport, air: AtmosphereSegmentTransport,
) -> CameraTransport {
    // The clear-sky target already contains the complete air path. This is
    // the affine weather operator relative to that clear background: it adds
    // sample-to-camera attenuation and restores the foreground air displaced
    // when the background is multiplied by weather transmittance.
    return CameraTransport(
        air.transmittance * weather.radiance +
            air.radiance * (vec3<f32>(1.0) - weather.transmittance),
        weather.transmittance,
    );
}
fn remap(value: f32, low: f32, high: f32) -> f32 {
    return saturate((value - low) / max(0.0001, high - low));
}
fn density_threshold(coverage: f32) -> f32 {
    let projected_coverage = pow(saturate(coverage), 1.35);
    return mix(0.74, 0.30, pow(projected_coverage, 0.72));
}

fn hg(cosine: f32, g: f32) -> f32 {
    let g2 = g * g;
    return (1.0 - g2) /
        max(0.02, 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosine, 1.5));
}

fn hash31(point: vec3<f32>) -> f32 {
    var q = fract(point * 0.1031);
    q += dot(q, q.yzx + vec3<f32>(33.33));
    return fract((q.x + q.y) * q.z);
}

fn noise3(point: vec3<f32>) -> f32 {
    let cell = floor(point);
    var local = fract(point);
    local = local * local * (vec3<f32>(3.0) - 2.0 * local);
    let z0 = mix(
        mix(hash31(cell), hash31(cell + vec3<f32>(1.0, 0.0, 0.0)), local.x),
        mix(hash31(cell + vec3<f32>(0.0, 1.0, 0.0)), hash31(cell + vec3<f32>(1.0, 1.0, 0.0)), local.x),
        local.y,
    );
    let z1 = mix(
        mix(hash31(cell + vec3<f32>(0.0, 0.0, 1.0)), hash31(cell + vec3<f32>(1.0, 0.0, 1.0)), local.x),
        mix(hash31(cell + vec3<f32>(0.0, 1.0, 1.0)), hash31(cell + vec3<f32>(1.0)), local.x),
        local.y,
    );
    return mix(z0, z1, local.z);
}

fn fbm3(initial: vec3<f32>) -> f32 {
    var point = initial;
    var total = 0.0;
    var weight = 0.55;
    for (var octave = 0; octave < 3; octave++) {
        total += noise3(point) * weight;
        point = vec3<f32>(
            point.x * 0.78 - point.z * 0.63,
            point.y + 7.1,
            point.x * 0.63 + point.z * 0.78,
        ) * 2.04;
        weight *= 0.48;
    }
    return total / 0.94;
}

fn noise2(point: vec2<f32>) -> f32 {
    return noise3(vec3<f32>(point, 17.31));
}

fn fbm2(initial: vec2<f32>) -> f32 {
    var point = initial;
    var total = 0.0;
    var weight = 0.58;
    for (var octave = 0; octave < 3; octave++) {
        total += noise2(point) * weight;
        point = vec2<f32>(point.x * 0.8 - point.y * 0.6,
            point.x * 0.6 + point.y * 0.8) * 2.07 + vec2<f32>(5.2);
        weight *= 0.46;
    }
    return total / 0.96;
}

struct WeatherHierarchy {
    synoptic: vec4<f32>,
    mesoscale: vec4<f32>,
};

// One wrapped weather lookup produces an obvious repeating lattice once a
// cloud system spans several texture periods. Two incommensurate, rotated
// projections have no short common period in world space. Their low-frequency
// blend supplies the synoptic humidity envelope, while the second projection
// remains available as the smaller convective/cellular organization field.
// This costs the same two 2-D samples formerly used by weather + column maps.
fn weather_hierarchy(
    weather_uv: vec2<f32>, seed: vec4<f32>, index: i32,
) -> WeatherHierarchy {
    let first_coordinate = weather_uv * 0.173 +
        seed.xy * (19.0 + f32(index) * 7.0);
    let rotated = vec2<f32>(
        weather_uv.x * 0.613 - weather_uv.y * 0.790,
        weather_uv.x * 0.790 + weather_uv.y * 0.613,
    );
    let second_coordinate = rotated * 0.397 +
        seed.zw * (37.0 + f32(index) * 11.0) + vec2<f32>(0.193, 0.617);
    let first = textureSampleLevel(
        weather_texture, volume_sampler, fract(first_coordinate), index, 0.0);
    let second = textureSampleLevel(
        weather_texture, volume_sampler, fract(second_coordinate), index, 0.0);

    let first_curl = first.ba * 2.0 - vec2<f32>(1.0);
    let second_curl_encoded = second.ba * 2.0 - vec2<f32>(1.0);
    let second_curl = vec2<f32>(
        second_curl_encoded.x * 0.613 + second_curl_encoded.y * 0.790,
        -second_curl_encoded.x * 0.790 + second_curl_encoded.y * 0.613,
    );
    let curl = clamp(first_curl * 0.64 + second_curl * 0.36,
        vec2<f32>(-1.0), vec2<f32>(1.0));
    // Moisture must intersect the moisture channel from both projections.
    // Crossing the second sample's mesoscale/column channel into this term
    // made system humidity change with an unrelated organization statistic.
    let moisture_intersection = min(first.r, second.r);
    let synoptic = vec4<f32>(
        saturate(first.r * 0.58 + second.r * 0.29 + moisture_intersection * 0.13),
        saturate(first.g * 0.61 + second.g * 0.39),
        curl * 0.5 + vec2<f32>(0.5),
    );
    return WeatherHierarchy(synoptic, second);
}

// Rotate and gently shear the periodic 3-D basis before sampling it. The
// original axis-aligned lookup exposed the volume's tile planes as rows and
// columns at large cloud scales. Per-layer irrational orientation plus a
// height-dependent shear preserves seamless filtering but makes the shortest
// visible repeat much larger and meteorologically aligned with deformation.
fn volume_domain(point: vec3<f32>, index: i32, h: f32) -> vec3<f32> {
    var rotated = vec3<f32>(
        point.x * 0.819 + point.z * 0.574,
        point.y,
        -point.x * 0.574 + point.z * 0.819,
    );
    if (index == 1) {
        rotated = vec3<f32>(
            point.x * 0.438 - point.z * 0.899,
            point.y,
            point.x * 0.899 + point.z * 0.438,
        );
    }
    if (index == 2) {
        rotated = vec3<f32>(
            -point.x * 0.259 + point.z * 0.966,
            point.y,
            -point.x * 0.966 - point.z * 0.259,
        );
    }
    return vec3<f32>(
        rotated.x + rotated.y * (0.071 + h * 0.023),
        rotated.y + rotated.z * 0.047,
        rotated.z + rotated.x * (0.053 - h * 0.017),
    );
}

fn view_direction(uv: vec2<f32>) -> vec3<f32> {
    let camera = p[4];
    let yaw_cos = cos(p[53].x);
    let yaw_sin = sin(p[53].x);
    if (camera.w > 1.5) {
        let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
        let local = normalize(vec3<f32>(
            ndc.x * tan(camera.x * 0.5),
            ndc.y * tan(camera.z * 0.5),
            1.0,
        ));
        let pitch_cos = cos(camera.y);
        let pitch_sin = sin(camera.y);
        let pitched = normalize(vec3<f32>(
            local.x,
            local.y * pitch_cos + local.z * pitch_sin,
            local.z * pitch_cos - local.y * pitch_sin,
        ));
        return normalize(vec3<f32>(
            pitched.x * yaw_cos + pitched.z * yaw_sin,
            pitched.y,
            -pitched.x * yaw_sin + pitched.z * yaw_cos,
        ));
    }
    let azimuth = (uv.x - 0.5) * camera.x;
    var elevation = mix(PI * 0.51, -0.035, pow(uv.y, 0.91));
    if (camera.w > 0.5) { elevation = camera.y + (0.5 - uv.y) * camera.z; }
    let ce = cos(elevation);
    let local = vec3<f32>(sin(azimuth) * ce, sin(elevation), cos(azimuth) * ce);
    return normalize(vec3<f32>(
        local.x * yaw_cos + local.z * yaw_sin,
        local.y,
        -local.x * yaw_sin + local.z * yaw_cos,
    ));
}

fn source_direction(point: vec2<f32>) -> vec3<f32> {
    return view_direction(point);
}

// Keep the physical camera intact for production. Layered and edge-framed are
// retained as laboratory controls for direct comparison with the former
// screen-space approach.
fn cloud_composition_uv(uv: vec2<f32>, index: i32) -> vec2<f32> {
    let mode = i32(round(p[28].y));
    var result = uv;
    var target_center = 0.72;
    var target_half = 0.28;
    var source_center = 0.74;
    var source_half = 0.17;
    var horizontal_scale = 0.62;
    if (index == 1) {
        target_center = 0.49;
        target_half = 0.25;
        source_center = 0.70;
        source_half = 0.20;
        horizontal_scale = 0.76;
    }
    if (index == 2) {
        target_center = 0.28;
        target_half = 0.23;
        source_center = 0.62;
        source_half = 0.27;
        horizontal_scale = 0.92;
    }
    if (mode == 1) {
        let seeded_offset = (p[14][index] - 0.5) *
            mix(0.18, 0.08, f32(index) * 0.5);
        result = vec2<f32>(
            0.5 + (uv.x - 0.5) * horizontal_scale + seeded_offset,
            source_center + (uv.y - target_center) / target_half * source_half,
        );
    }
    let perspective = i32(round(p[28].z));
    if (perspective == 1) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 1.22,
            0.5 + (result.y - 0.5) * 1.10,
        );
    }
    if (perspective == 2) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 0.82,
            0.5 + (result.y - 0.5) * 0.90,
        );
    }
    if (perspective == 3) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 0.62,
            0.5 + (result.y - 0.5) * 0.52,
        );
    }
    if (perspective == 4) {
        result = vec2<f32>(
            0.5 + (result.x - 0.5) * 1.48,
            0.5 + (result.y - 0.5) * 0.96,
        );
    }
    return result;
}

fn ellipse_field(uv: vec2<f32>, center: vec2<f32>, radius: vec2<f32>) -> f32 {
    let distance = length((uv - center) / radius);
    return 1.0 - smoothstep(0.72, 1.08, distance);
}

fn cloud_composition_mask(uv: vec2<f32>, layer: Layer, index: i32) -> f32 {
    let mode = i32(round(p[28].y));
    if (mode == 0 || mode == 3) { return 1.0; }
    var center = 0.72;
    var half_height = 0.28;
    if (index == 1) { center = 0.49; half_height = 0.25; }
    if (index == 2) { center = 0.28; half_height = 0.23; }
    let band = 1.0 - smoothstep(
        half_height * 0.78,
        half_height,
        abs(uv.y - center),
    );
    if (mode == 1) { return band; }
    let seed_a = p[14][index];
    let seed_b = p[14][(index + 1) % 4];
    let vertical_shift = (seed_b - 0.5) * half_height * 0.36;
    let left = ellipse_field(
        uv,
        vec2<f32>(-0.04 + seed_a * 0.10, center + vertical_shift),
        vec2<f32>(0.48, half_height * 0.92),
    ) * (0.72 + seed_b * 0.28);
    let right = ellipse_field(
        uv,
        vec2<f32>(1.04 - seed_b * 0.10, center - vertical_shift * 0.72),
        vec2<f32>(0.52, half_height),
    ) * (0.72 + seed_a * 0.28);
    let offset_accent = ellipse_field(
        uv,
        vec2<f32>(0.38 + seed_a * 0.24, center - half_height * 0.18),
        vec2<f32>(0.31, half_height * 0.70),
    ) * 0.64;
    var framing = max(max(left, right), offset_accent);
    let genus = i32(round(layer.scale.z));
    let broad_sheet = genus == 3 || genus == 5 || genus == 6 || genus == 8 ||
        layer.geometry.z > 0.82;
    framing = select(framing, mix(0.76, 1.0, framing), broad_sheet);
    return smoothstep(0.02, 0.18, framing);
}

fn sphere_hits(origin: vec3<f32>, direction: vec3<f32>, radius: f32) -> vec2<f32> {
    let b = dot(origin, direction);
    let c = dot(origin, origin) - radius * radius;
    let d = b * b - c;
    if (d < 0.0) { return vec2<f32>(-1.0); }
    let root = sqrt(d);
    return vec2<f32>(-b - root, -b + root);
}

fn height_profile(h: f32, layer: Layer, column: f32) -> f32 {
    let genus = i32(round(layer.scale.z));
    // Convective clouds condense against a comparatively crisp lifting level;
    // stratiform decks have a deeper, humidity-softened transition at base.
    let soft_base = smoothstep(0.0, mix(0.025, 0.11, layer.shape.x), h);
    var top = 1.0 - smoothstep(0.72, 1.0, h);

    // Water-cloud columns terminate at different heights. This correlated
    // column top is the source of believable cauliflower silhouettes; using a
    // single shell-top fade produces the familiar flat procedural ceiling.
    if (genus == 9) {
        // Keep ordinary cumulus broad through its condensation layer and let
        // only strongly convective cores grow appreciably higher. Mapping the
        // full column field from 0.2-0.98 made every isolated cell taper into
        // a narrow conical spike when viewed toward the horizon.
        let column_top = clamp(
            0.38 + pow(column, 0.8) * 0.34 +
                layer.shape.y * pow(column, 1.6) * 0.24,
            0.4,
            0.96,
        );
        top = 1.0 - smoothstep(column_top * 0.67, column_top, h);
    }
    if (genus == 10) {
        // A cumulonimbus anvil is the outflow from a mature updraft, not a
        // second horizontal cloud sheet spanning the entire synoptic mask.
        // Couple both tower height and anvil support to the same continuous
        // convective column so weak neighbouring cells remain shallow and
        // genuine clear air survives around the principal tower.
        let core = smoothstep(0.3, 0.72, column);
        let column_top = mix(
            0.24,
            1.0,
            pow(core, 0.72) * mix(0.7, 1.0, layer.shape.y),
        );
        let tower = 1.0 - smoothstep(column_top * 0.79, column_top, h);
        let anvil_support = smoothstep(0.46, 0.76, column);
        let anvil = smoothstep(0.70, 0.84, h) *
            (1.0 - smoothstep(0.94, 1.0, h)) * layer.shape.z *
            anvil_support;
        return soft_base * max(tower, anvil);
    }
    if (genus == 1) {
        top = smoothstep(0.03, 0.18, h) * (1.0 - smoothstep(0.76, 0.98, h));
    }
    if (genus == 2) {
        top = smoothstep(0.02, 0.14, h) * (1.0 - smoothstep(0.58, 0.9, h));
    }
    if (genus == 3 || genus == 5 || genus == 6 || genus == 7 || genus == 8) {
        top = 1.0 - smoothstep(0.82, 1.0, h);
    }
    if (genus == 4 || genus == 7) {
        top = 1.0 - smoothstep(0.62, 0.96, h);
    }
    return soft_base * top;
}

// Stratiform genera are not interchangeable slabs.  This profile preserves
// the observed vertical constitution of each family before any horizontal
// weather variation is applied: a sparse ice veil for Cirrostratus, the
// ice/mixed/liquid stack of Altostratus, a deep precipitation column for
// Nimbostratus, and an inversion-capped, top-loaded Stratus droplet layer.
fn stratiform_vertical_profile(
    h: f32, layer: Layer, column: f32, interface_variance: f32,
) -> f32 {
    let genus = i32(round(layer.scale.z));
    if (h <= 0.0 || h >= 1.0) { return 0.0; }

    if (genus == 3) {
        let veil_base = smoothstep(-0.02, 0.16, h);
        let veil_top = 1.0 - smoothstep(0.74, 1.0, h);
        let sparse_ice_loading = mix(
            0.60, 1.0,
            smoothstep(0.16, 0.84, column * 0.64 + interface_variance * 0.36),
        );
        return veil_base * veil_top * sparse_ice_loading;
    }
    if (genus == 5) {
        let diffuse_base = smoothstep(-0.04, 0.11, h);
        let diffuse_top = 1.0 - smoothstep(0.82, 1.0, h);
        // Particle concentration is greatest in the lower liquid portion,
        // remains substantial through the mixed phase, then thins smoothly
        // into the upper ice veil.  Broad transitions avoid visible strata.
        let upper_ice_thinning = mix(
            1.08, 0.54, smoothstep(0.38, 0.94, h));
        let mixed_phase_support = 1.0 + 0.10 *
            (1.0 - smoothstep(0.0, 0.46, abs(h - 0.48)));
        return diffuse_base * diffuse_top * upper_ice_thinning *
            mixed_phase_support;
    }
    if (genus == 6) {
        // Nimbostratus has great vertical extent and no crisp lower surface.
        // Precipitation removes some small droplets low in the cloud while a
        // broad mixed-phase core remains optically deep above it.
        let indefinite_base = smoothstep(-0.10, 0.20, h);
        let deep_top = 1.0 - smoothstep(0.86, 1.0, h);
        let lower_particle_depletion = mix(
            0.70, 1.0, smoothstep(0.05, 0.34, h));
        let precipitation_core = mix(
            0.90, 1.12,
            1.0 - smoothstep(0.0, 0.58, abs(h - 0.56)),
        );
        return indefinite_base * deep_top * lower_particle_depletion *
            precipitation_core;
    }
    if (genus == 8) {
        let variable_base = smoothstep(-0.03, 0.14, h);
        let inversion_cap = 1.0 - smoothstep(0.86, 1.0, h);
        // Aircraft observations show droplet concentration rising toward the
        // top of Stratus.  Preserve that top loading without making a hard lid.
        let top_loaded_droplets = mix(
            0.46, 1.14, smoothstep(0.04, 0.76, h));
        return variable_base * inversion_cap * top_loaded_droplets;
    }
    return height_profile(h, layer, column);
}

// Build cloud-producing populations directly in world space. The returned
// value is a local condensation potential, not a visibility or alpha mask.
// Different genera use different population geometry because a field of
// detached thermals, a cellular colony, an advancing sheet, and sheared ice
// are not credible variations of one generic footprint.
fn cloud_population_blob(
    local: vec2<f32>, center: vec2<f32>, radii: vec2<f32>,
    weather_field: vec3<f32>, edge_variation: f32,
) -> f32 {
    let delta = (local - center) / max(vec2<f32>(0.2), radii);
    let normalized_squared = dot(delta, delta);
    // A cloud population is not an ellipse. Offset child lobes represent
    // neighbouring thermals or moisture maxima, and the cross-term breaks
    // bilateral symmetry without introducing a high-frequency noisy edge.
    let lobe_a_delta = (delta - vec2<f32>(0.24, -0.13)) /
        vec2<f32>(0.76, 0.68);
    let lobe_b_delta = (delta - vec2<f32>(-0.31, 0.17)) /
        vec2<f32>(0.61, 0.79);
    let hierarchical_distance_squared = min(normalized_squared, min(
        dot(lobe_a_delta, lobe_a_delta) + 0.20,
        dot(lobe_b_delta, lobe_b_delta) + 0.28,
    ));
    // Polynomial relief is smooth and substantially cheaper than evaluating
    // trigonometry inside every population loop at every ray-march sample.
    let boundary_relief =
        delta.x * delta.y * 0.035 +
        (delta.x * delta.x - delta.y * delta.y) *
            (weather_field.g - 0.5) * 0.045 +
        (weather_field.b - 0.5) * 0.055;
    let moisture_relief =
        (weather_field.g * 2.0 - 1.0) * 0.18 +
        (weather_field.b * 2.0 - 1.0) * 0.09 + edge_variation;
    return 1.0 - smoothstep(
        0.30 + moisture_relief + boundary_relief,
        1.18 + moisture_relief + boundary_relief,
        hierarchical_distance_squared,
    );
}

// Broad humidity potential used only to decide which resolved cloud elements
// are born. It is deliberately cheaper and smoother than cloud morphology: the
// family generators below create the actual visible boundary from whole cells,
// towers or fibres, so this field can never appear as a clipped alpha edge.
fn cloud_system_moisture(
    position: vec2<f32>, angle: f32, center_range: f32,
    half_along: f32, half_across: f32,
    weather_field: vec3<f32>, formation_seed: f32,
) -> f32 {
    let axis = vec2<f32>(sin(angle), cos(angle));
    let across_axis = vec2<f32>(axis.y, -axis.x);
    let local = vec2<f32>(
        dot(position, axis) - center_range,
        dot(position, across_axis),
    );
    let displacement = vec2<f32>(
        (weather_field.g - 0.5) * half_along * 0.24,
        (weather_field.b - 0.5) * half_across * 0.28,
    );
    let primary = cloud_population_blob(
        local + displacement,
        vec2<f32>(0.0),
        vec2<f32>(half_along, half_across),
        weather_field,
        (formation_seed - 0.5) * 0.08,
    );
    let companion = cloud_population_blob(
        local - displacement * 0.46,
        vec2<f32>(half_along * 0.42, -half_across * 0.31),
        vec2<f32>(half_along * 0.68, half_across * 0.61),
        weather_field.bgr,
        (0.5 - formation_seed) * 0.06,
    );
    return max(primary, companion * 0.82);
}

fn cloud_system_population(
    position: vec2<f32>, angle: f32, center_range: f32,
    half_along: f32, half_across: f32, transition_km: f32,
    weather_field: vec3<f32>, formation_seed: f32, boundary_style: i32,
) -> f32 {
    let axis = vec2<f32>(sin(angle), cos(angle));
    let across_axis = vec2<f32>(axis.y, -axis.x);
    let local = vec2<f32>(
        dot(position, axis) - center_range,
        dot(position, across_axis),
    );
    let system_seed = vec2<f32>(
        formation_seed * 37.0 + p[14].z * 11.0,
        formation_seed * 53.0 + p[14].w * 17.0,
    );

    if (boundary_style == 0) {
        // Fair-weather cumulus grows above a population of distinct boundary-
        // layer thermals. Generate those cells instead of clipping a regional
        // noise sheet with one enclosing shape.
        var population = 0.0;
        for (var cell = 0; cell < 6; cell++) {
            let fcell = f32(cell);
            let along_seed = hash31(vec3<f32>(fcell + 3.1, formation_seed, system_seed.x));
            let across_seed = hash31(vec3<f32>(fcell + 9.7, formation_seed, system_seed.y));
            let size_seed = hash31(vec3<f32>(fcell + 17.3, system_seed.yx));
            let center = vec2<f32>(
                (along_seed - 0.5) * half_along * 1.52,
                (across_seed - 0.5) * half_across * 1.46,
            );
            let size_class = pow(size_seed, 1.65);
            let radii = vec2<f32>(
                half_along * mix(0.085, 0.29, size_class),
                half_across * mix(0.10, 0.27, size_class * 0.72 + across_seed * 0.28),
            );
            let cell_field = cloud_population_blob(
                local, center, radii, weather_field,
                (along_seed + across_seed - 1.0) * 0.075,
            );
            population = max(population, cell_field);
        }
        return population;
    }
    if (boundary_style == 1) {
        // Cellular cloud is organized as colonies with connected clear-air
        // channels. Each colony has its own centre and scale; their union can
        // form open or closed cells without revealing an enclosing perimeter.
        var population = 0.0;
        for (var colony = 0; colony < 6; colony++) {
            let fcolony = f32(colony);
            let along_seed = hash31(vec3<f32>(fcolony + 5.2, formation_seed, system_seed.x));
            let across_seed = hash31(vec3<f32>(fcolony + 14.6, formation_seed, system_seed.y));
            let size_seed = hash31(vec3<f32>(fcolony + 29.1, system_seed.xy));
            let center = vec2<f32>(
                (along_seed - 0.5) * half_along * 1.62,
                (across_seed - 0.5) * half_across * 1.52,
            );
            let radii = vec2<f32>(
                half_along * mix(0.22, 0.39, size_seed),
                half_across * mix(0.19, 0.34, 1.0 - size_seed * 0.62),
            );
            population = max(population, cloud_population_blob(
                local, center, radii, weather_field.bgr,
                (along_seed - across_seed) * 0.07,
            ));
        }
        let channel_coordinate = weather_field.g * 0.62 + weather_field.b * 0.38;
        let channel_distance = abs(channel_coordinate - 0.5);
        let clear_channel = 1.0 - smoothstep(0.028, 0.12, channel_distance);
        return saturate(population - clear_channel * 0.42);
    }
    if (boundary_style == 2) {
        // Stratiform cloud is physically a coherent moisture shield rather
        // than a population of detached thermals. Generate its advancing and
        // trailing condensation surfaces directly; keep the lateral boundary
        // broad and heavily displaced so it does not become a visible oval.
        let frontal_wave =
            sin(local.y * 0.055 + p[14].x * 17.0) * transition_km * 0.44 +
            sin(local.y * 0.017 - p[14].y * 23.0) * transition_km * 0.31;
        let moisture_displacement =
            (weather_field.g * 2.0 - 1.0) * transition_km * 0.82 +
            (weather_field.b * 2.0 - 1.0) * transition_km * 0.38;
        let leading_front = half_along - local.x + frontal_wave + moisture_displacement;
        let trailing_edge = half_along + local.x + moisture_displacement * 0.58;
        let lateral_extent = half_across - abs(local.y) +
            moisture_displacement * 1.35 + frontal_wave * 0.42;
        let condensate = min(leading_front, min(trailing_edge, lateral_extent));
        return smoothstep(-transition_km * 0.68, transition_km * 0.46, condensate);
    }
    if (boundary_style == 3) {
        // High ice appears as several independently sheared streamers, not a
        // broad cloud sheet whose outside is faded away.
        var streamers = 0.0;
        for (var fibre = 0; fibre < 5; fibre++) {
            let ffibre = f32(fibre);
            let offset_seed = hash31(vec3<f32>(ffibre + 4.4, formation_seed, system_seed.x));
            let width_seed = hash31(vec3<f32>(ffibre + 18.8, formation_seed, system_seed.y));
            let centre_y = (offset_seed - 0.5) * half_across * 1.48 +
                sin(local.x * 0.045 + ffibre * 1.73) * half_across * 0.09;
            let across_distance = abs(local.y - centre_y) /
                max(0.5, half_across * mix(0.06, 0.14, width_seed));
            let along_taper = 1.0 - smoothstep(
                half_along * 0.62, half_along * 1.08, abs(local.x),
            );
            let fibre_field = (1.0 - smoothstep(0.55, 1.28, across_distance)) * along_taper;
            streamers = max(streamers, fibre_field);
        }
        return streamers;
    }
    // A storm complex is a small population of overlapping deep convective
    // cells plus a broad moisture shield. Keeping it separate from fair
    // cumulus preserves one dominant tower and plausible satellites.
    var storm_population = 0.0;
    for (var storm_cell = 0; storm_cell < 3; storm_cell++) {
        let fstorm = f32(storm_cell);
        let offset_seed = hash31(vec3<f32>(fstorm + 7.5, formation_seed, system_seed.x));
        let along_seed = hash31(vec3<f32>(fstorm + 21.7, formation_seed, system_seed.y));
        let center = vec2<f32>(
            select((along_seed - 0.5) * half_along * 0.54, 0.0, storm_cell == 1),
            (offset_seed - 0.5) * half_across * 0.34,
        );
        let dominance = select(mix(0.42, 0.61, along_seed), 0.88, storm_cell == 1);
        storm_population = max(storm_population, cloud_population_blob(
            local, center,
            vec2<f32>(half_along * dominance, half_across * dominance * 0.72),
            weather_field, (along_seed - offset_seed) * 0.06,
        ));
    }
    return storm_population;
}

// Place a cloud system where the selected physical camera can actually see its
// altitude. Fixed kilometre ranges collapse low clouds against the horizon
// whenever the camera is aimed above it: a 0.8 km cumulus at 6 km range is
// only 7.6 degrees high, regardless of how the frame is composed. This helper
// chooses a real horizontal range from the cloud base and a target elevation
// inside the camera frustum. No screen-space coordinate or opacity mask is
// involved; the result remains one stationary volume in the world.
fn camera_visible_system_range(layer: Layer, index: i32, seed: f32) -> f32 {
    let camera_center = p[4].y;
    let camera_span = max(radians(12.0), p[4].z);
    let lower_elevation = max(radians(2.5), camera_center - camera_span * 0.5);
    let upper_elevation = min(radians(84.0), camera_center + camera_span * 0.5);
    var frame_fraction = 0.34;
    if (index == 1) { frame_fraction = 0.48; }
    if (index == 2) { frame_fraction = 0.58; }
    let seeded_fraction = clamp(
        frame_fraction + (seed - 0.5) * 0.12,
        0.16,
        0.78,
    );
    let target_elevation = mix(lower_elevation, upper_elevation, seeded_fraction);
    // Aim through the lower third of the condensate instead of exactly at its
    // mathematical shell base. This exposes a physical body and its underside,
    // while keeping high cloud at an appropriately remote scale.
    let target_altitude = layer.geometry.x + layer.geometry.y *
        select(0.24, 0.34, index == 2);
    return clamp(
        target_altitude / max(0.055, tan(target_elevation)),
        max(0.22, target_altitude * 0.16),
        92.0,
    );
}

fn cloud_editorial_primary_angle(layer: Layer, index: i32) -> f32 {
    let seed_a = p[14][index];
    let seed_b = p[14][(index + 1) % 4];
    let side_seed = fract(
        layer.phase.w * 23.137 + seed_a * 3.171 +
        seed_b * 1.713 + f32(index) * 0.3187,
    );
    let edge_side = select(-1.0, 1.0, side_seed >= 0.5);
    let camera_half_fov = max(0.42, p[4].x * 0.5);
    return edge_side * camera_half_fov * mix(0.18, 0.55, side_seed) +
        (seed_b - 0.5) * camera_half_fov * 0.16;
}

fn storm_system_center_range(layer: Layer, index: i32, seed: f32) -> f32 {
    let regime_override = i32(round(p[28].w));
    let force_distant = regime_override == 1;
    let force_nearby = regime_override == 2;
    let force_overhead = regime_override == 3;
    let nearby_storm = force_nearby || force_overhead || (!force_distant &&
        layer.geometry.z > 0.64 && layer.organization.w > 0.72 &&
        layer.phase.y > 0.48);
    let visible_range = camera_visible_system_range(layer, index, seed);
    if (force_distant) {
        // Remain recognizably distant without dropping the storm beneath a
        // telephoto frame whose visible-system range already targets the
        // lower third of the camera. The former 1.8–2.7 multiplier routinely
        // moved the complete storm below the crop.
        return visible_range * mix(1.35, 1.72, seed);
    }
    return select(
        visible_range * mix(1.08, 1.48, seed),
        visible_range * mix(0.72, 1.05, seed),
        nearby_storm,
    );
}

// Production editorial direction is genus-specific and categorical. Sparse
// convective fields remain broad; continuous sheets are either a remote bank
// or an immediate deck; cumulonimbus is either a distant storm system or an
// active nearby one. Every choice occupies the real altitude shell and is
// therefore a possible ground-observer configuration.
fn cloud_editorial_population(
    position: vec2<f32>, layer: Layer, index: i32, weather_field: vec3<f32>,
) -> vec2<f32> {
    if (i32(round(p[28].y)) != 3) { return vec2<f32>(1.0, 0.0); }
    let genus = i32(round(layer.scale.z));
    let coverage = saturate(layer.geometry.z);
    let seed_a = p[14][index];
    let seed_b = p[14][(index + 1) % 4];
    // Anchor finite systems toward a camera edge in world azimuth, rather
    // than cutting their projection after rendering. The second system enters
    // from the opposite side with a different range and footprint.
    let side_seed = fract(
        layer.phase.w * 23.137 + seed_a * 3.171 +
        seed_b * 1.713 + f32(index) * 0.3187,
    );
    let edge_side = select(-1.0, 1.0, side_seed >= 0.5);
    let camera_half_fov = max(0.42, p[4].x * 0.5);
    // Bias the system axis within the camera frustum, with enough lateral
    // footprint to enter through an edge naturally. Using the scene seed here
    // prevents every daily system from collapsing into the same corner.
    let angle = cloud_editorial_primary_angle(layer, index);
    let opposite_angle = -edge_side * camera_half_fov *
        mix(0.32, 0.72, fract(side_seed * 3.17 + seed_a)) +
        (seed_a - 0.5) * camera_half_fov * 0.12;
    let regime_override = i32(round(p[28].w));
    let force_distant = regime_override == 1;
    let force_nearby = regime_override == 2;
    let force_overhead = regime_override == 3;

    // Fair cumulus already has physically separated kilometre-scale columns.
    // Two bounded systems retain a generous population without leaving a
    // low-density copy of the cloud field across the rest of the horizon.
    if (genus == 9) {
        if (force_overhead) { return vec2<f32>(1.0, 0.0); }
        let visible_range = camera_visible_system_range(layer, index, seed_b);
        let distance_scale = select(1.0, 2.15, force_distant);
        let nearby_scale = select(1.0, 0.72, force_nearby);
        let footprint_scale = mix(0.82, 1.16, coverage);
        let primary = cloud_system_moisture(
            position, angle * 1.35,
            visible_range * mix(0.86, 1.16, seed_b) * distance_scale * nearby_scale,
            mix(2.4, 3.8, seed_a) * footprint_scale,
            mix(12.0, 18.0, seed_b) * footprint_scale,
            weather_field, layer.phase.w,
        );
        let secondary = cloud_system_moisture(
            position, opposite_angle,
            visible_range * mix(1.65, 2.45, seed_a) * distance_scale * nearby_scale,
            mix(3.2, 5.0, seed_b) * footprint_scale,
            mix(14.0, 22.0, seed_a) * footprint_scale,
            weather_field.bgr, layer.phase.w + 0.37,
        );
        return vec2<f32>(max(primary, secondary), 1.0);
    }

    // A thunderstorm's framing follows its meteorological state rather than a
    // generic altitude band. Strong, extensive convection may occupy the near
    // field; otherwise the complete tower/anvil/rain system remains distant.
    if (genus == 10) {
        let nearby_storm = force_nearby || force_overhead || (!force_distant &&
            coverage > 0.64 && layer.organization.w > 0.72 &&
            layer.phase.y > 0.48);
        let center_range = storm_system_center_range(layer, index, seed_b);
        let half_along = select(10.0, 24.0, nearby_storm);
        let half_across = select(14.0, 32.0, nearby_storm);
        return vec2<f32>(cloud_system_moisture(
            position, angle, center_range, half_along, half_across,
            weather_field, layer.phase.w,
        ), 1.0);
    }

    // Continuous stratiform media cannot be both a remote bank and an
    // overhead ceiling. Coverage and precipitation choose one regime without
    // cross-fading their spatial interpretations.
    let continuous_sheet = genus == 3 || genus == 5 || genus == 6 || genus == 8;
    if (continuous_sheet) {
        let immediate_deck = force_overhead || (!force_distant && select(
            coverage >= 0.64,
            coverage >= 0.48 || layer.phase.y > 0.18,
            genus == 6,
        ));
        if (immediate_deck) { return vec2<f32>(1.0, 0.0); }
        let visible_range = camera_visible_system_range(layer, index, seed_b);
        var center_range = visible_range * mix(0.88, 1.25, seed_b);
        var system_length = 6.0;
        var system_width = 18.0;
        var transition = 5.5;
        if (index == 1) {
            // Partial middle sheets are remote advancing systems. Their rear
            // edge must not reach beneath the observer; that would turn a
            // four-okta bank into an apparent overhead slab.
            center_range = visible_range * mix(0.9, 1.35, seed_b);
            system_length = 8.0;
            system_width = 55.0;
            transition = 7.0;
        }
        if (index == 2) {
            center_range = visible_range * mix(0.92, 1.42, seed_b);
            system_length = 14.0;
            system_width = 72.0;
            transition = 11.0;
        }
        if (force_nearby) {
            center_range *= 0.52;
            transition *= 1.18;
        }
        // A partial sheet is a finite synoptic system, not a semi-infinite
        // half-plane. Bounding its back edge prevents long grazing rays from
        // accumulating into an implausible opaque strip along the entire
        // bottom horizon. The large cross-system radius still reads as a bank,
        // while the noisy kilometre-scale transition breaks up every perimeter.
        return vec2<f32>(cloud_system_population(
            position, angle, center_range, system_length, system_width,
            transition, weather_field, layer.phase.w, 2,
        ), 1.0);
    }

    // Cellular decks are intrinsically broken at partial cover, so their
    // weather field—not an outer cutout—supplies separation. This keeps their
    // perspective convergence and apparent element size physically legible.
    if (genus == 2 || genus == 4 || genus == 7) {
        let immediate_threshold = select(0.84, 0.90, genus == 7);
        if (force_overhead || (!force_distant && !force_nearby &&
            coverage >= immediate_threshold)) {
            return vec2<f32>(1.0, 0.0);
        }
        let visible_range = camera_visible_system_range(layer, index, seed_b);
        var layer_distance = visible_range * mix(0.82, 1.2, seed_b);
        var system_length = 3.0;
        var system_width = 8.0;
        var transition = 2.8;
        if (index == 1) {
            // Mid-level cells stay beyond the near-shell stepping regime.
            // Bringing this sheet close enough to force it up-screen exposes
            // its shallow physical depth as implausible vertical slices.
            layer_distance = visible_range * mix(0.88, 1.28, seed_b);
            system_length = 6.0;
            system_width = 16.0;
            transition = 5.5;
        }
        if (index == 2) {
            layer_distance = visible_range * mix(0.9, 1.36, seed_b);
            system_length = 12.0;
            system_width = 36.0;
            transition = 10.0;
        }
        if (force_distant) { layer_distance *= 1.45; }
        if (force_nearby) { layer_distance *= 0.72; }
        let primary = cloud_system_moisture(
            position, angle, layer_distance, system_length, system_width,
            weather_field, layer.phase.w,
        );
        let secondary = cloud_system_moisture(
            position, opposite_angle, layer_distance * 1.72,
            system_length * 0.82, system_width * 0.72,
            weather_field.bgr, layer.phase.w + 0.37,
        );
        return vec2<f32>(max(primary, secondary), 1.0);
    }

    // High ice fibres live on a broad remote synoptic plane. Retaining a faint
    // population outside the primary domains avoids any recognizable perimeter
    // while the distant core supplies the intended high-layer framing.
    if (genus == 1) {
        if (force_overhead) { return vec2<f32>(1.0, 0.0); }
        let visible_range = camera_visible_system_range(layer, index, seed_b);
        let distance_scale = select(1.0, 0.55, force_nearby);
        let primary = cloud_system_moisture(
            position, angle, visible_range * mix(0.86, 1.24, seed_b) * distance_scale,
            30.0, 40.0, weather_field, layer.phase.w,
        );
        let secondary = cloud_system_moisture(
            position, opposite_angle,
            visible_range * mix(1.35, 2.1, seed_a) * distance_scale,
            34.0, 42.0, weather_field.bgr, layer.phase.w + 0.37,
        );
        return vec2<f32>(max(primary, secondary), 1.0);
    }
    return vec2<f32>(1.0, 0.0);
}

fn morphology_hash2(cell: vec2<f32>, seed: f32) -> vec2<f32> {
    return vec2<f32>(
        hash31(vec3<f32>(cell, seed + 11.7)),
        hash31(vec3<f32>(cell.yx + vec2<f32>(19.1, 7.3), seed + 37.9)),
    );
}

fn morphology_lobe(
    horizontal: vec2<f32>, h: f32, radius: f32,
    center_h: f32, half_height: f32,
) -> f32 {
    let scaled = vec3<f32>(
        horizontal / max(0.04, radius),
        (h - center_h) / max(0.025, half_height),
    );
    // The macro body owns a comparatively crisp condensation boundary. Fine
    // volume texture feathers that boundary later; a broad primitive fade here
    // turns every lobe into the same translucent capsule before texture is even
    // consulted.
    return 1.0 - smoothstep(0.78, 1.06, dot(scaled, scaled));
}

// Polynomial smooth union for condensate fields.  A hard max preserves the
// seams of every analytic primitive as nested shells once light is integrated
// through the volume; real thermals merge continuously while retaining their
// outer cauliflower relief.  This only blends touching lobes and therefore
// cannot bridge independent cloud cells.
fn condensate_union(a: f32, b: f32, width: f32) -> f32 {
    if (a <= 0.001 || b <= 0.001) { return max(a, b); }
    let safe_width = max(0.001, width);
    let blend = max(safe_width - abs(a - b), 0.0) / safe_width;
    return saturate(max(a, b) + blend * blend * safe_width * 0.25);
}

// A graphic-composition thunderstorm owns one explicit world-space core. Its
// tower, anvil and overshoot share the same local coordinates, so an editorial
// moisture envelope can never leave only an unrelated anvil fragment in view.
fn editorial_storm_morphology(
    position: vec2<f32>, h: f32, layer: Layer,
    editorial: vec2<f32>, base_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let coverage = saturate(layer.geometry.z);
    let side_seed = fract(
        layer.phase.w * 23.137 + seed.x * 3.171 + seed.y * 1.713);
    let edge_side = select(-1.0, 1.0, side_seed >= 0.5);
    let camera_half_fov = max(0.42, p[4].x * 0.5);
    let angle = edge_side * camera_half_fov * mix(0.10, 0.28, side_seed) +
        (seed.y - 0.5) * camera_half_fov * 0.10;
    let regime_override = i32(round(p[28].w));
    let force_distant = regime_override == 1;
    let force_nearby = regime_override == 2;
    let force_overhead = regime_override == 3;
    let nearby = force_nearby || force_overhead || (!force_distant &&
        coverage > 0.64 && layer.organization.w > 0.72 &&
        layer.phase.y > 0.48);
    var center_range = select(
        mix(14.0, 23.0, seed.y), mix(8.0, 14.0, seed.y), nearby);
    if (force_distant) { center_range = mix(27.0, 42.0, seed.y); }
    let center = vec2<f32>(sin(angle), cos(angle)) * center_range;
    let local = position - center;
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
    let along = dot(local, wind_axis);
    let across = dot(local, cross_axis);
    let core_radius = mix(3.2, 5.2, seed.z);
    let taper = mix(0.78, 0.38, smoothstep(0.08, 0.9, h));
    let tower_radius = core_radius * taper *
        mix(0.88, 1.12, base_sample.r);
    let tower_radial = (along * along + across * across) /
        max(0.04, tower_radius * tower_radius);
    let tower = (1.0 - smoothstep(0.58, 1.12, tower_radial)) *
        smoothstep(0.0, 0.025, h) * (1.0 - smoothstep(0.92, 0.99, h));
    let shoulder = morphology_lobe(
        vec2<f32>(along + core_radius * 0.24, across - core_radius * 0.18),
        h, core_radius * 0.62, 0.58, 0.18);
    let crown = morphology_lobe(
        vec2<f32>(along - core_radius * 0.18, across + core_radius * 0.22),
        h, core_radius * 0.48, 0.76, 0.15);
    let anvil_along = along - core_radius * 0.48;
    let anvil_half_length = select(
        core_radius * 1.08, core_radius * 3.05, anvil_along >= 0.0);
    let anvil_distance = vec2<f32>(
        anvil_along / max(0.1, anvil_half_length),
        across / max(0.1, core_radius * 1.62));
    let anvil_horizontal = 1.0 - smoothstep(
        0.52, 1.12, dot(anvil_distance, anvil_distance));
    let anvil_vertical = smoothstep(0.75, 0.81, h) *
        (1.0 - smoothstep(0.89, 0.94, h));
    let anvil_edge = anvil_horizontal * anvil_vertical;
    let anvil = anvil_edge * mix(0.64, 1.0,
        base_sample.g * 0.62 + base_sample.b * 0.38) * layer.shape.z;
    let overshoot = morphology_lobe(
        vec2<f32>(along + core_radius * 0.08, across),
        h, core_radius * 0.30, 0.955, 0.055) * layer.shape.y;
    let macro_density = max(tower,
        max(shoulder, max(crown, max(anvil, overshoot))));
    let boundary_erosion = (1.0 - base_sample.g) * 0.10 *
        (1.0 - smoothstep(0.28, 0.78, macro_density));
    let relief = mix(0.72, 1.16,
        base_sample.r * 0.58 + base_sample.g * 0.28 + base_sample.b * 0.14);
    let system_support = smoothstep(0.04, 0.34, editorial.x);
    return saturate(smoothstep(0.045, 0.7,
        max(0.0, macro_density - boundary_erosion) * relief) * system_support);
}

fn sdf_ellipsoid(point: vec3<f32>, radii: vec3<f32>) -> f32 {
    let safe_radii = max(radii, vec3<f32>(0.015));
    let k0 = length(point / safe_radii);
    let k1 = length(point / (safe_radii * safe_radii));
    return k0 * (k0 - 1.0) / max(0.0001, k1);
}

fn sdf_smooth_union(a: f32, b: f32, radius: f32) -> f32 {
    let h = saturate(0.5 + 0.5 * (b - a) / max(0.001, radius));
    return mix(b, a, h) - radius * h * (1.0 - h);
}

// Stable hand-off between macro geometry and condensate material. More fields
// can be populated by specialized geometry evaluators without changing the
// material or optics contracts. Keeping feature scale and clearance explicit
// prevents a single world-noise wavelength from defining every silhouette.
struct GeometrySample {
    signed_distance_km: f32,
    feature_radius_km: f32,
    support_clearance_km: f32,
    seam_01: f32,
    inverse_curvature_km: f32,
    closest_surface_km: vec3<f32>,
    surface_normal: vec3<f32>,
};

fn make_geometry_sample(
    signed_distance_km: f32, feature_radius_km: f32, seam_01: f32,
) -> GeometrySample {
    let safe_radius = max(0.015, feature_radius_km);
    return GeometrySample(
        signed_distance_km,
        safe_radius,
        max(0.0, -signed_distance_km),
        saturate(seam_01),
        safe_radius,
        vec3<f32>(0.0),
        vec3<f32>(0.0, 0.0, 1.0),
    );
}

fn geometry_ellipsoid(
    sample_position: vec3<f32>, center: vec3<f32>, radii: vec3<f32>,
) -> GeometrySample {
    let safe_radii = max(radii, vec3<f32>(0.015));
    let relative = sample_position - center;
    let signed_distance = sdf_ellipsoid(relative, safe_radii);
    let normal = normalize(
        relative / (safe_radii * safe_radii) + vec3<f32>(0.00001));
    let feature_radius = pow(
        safe_radii.x * safe_radii.y * safe_radii.z,
        1.0 / 3.0,
    );
    return GeometrySample(
        signed_distance,
        feature_radius,
        max(0.0, -signed_distance),
        0.0,
        feature_radius,
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_oriented_ellipsoid(
    sample_position: vec3<f32>, center: vec3<f32>,
    axis: vec2<f32>, cross_axis: vec2<f32>, radii: vec3<f32>,
) -> GeometrySample {
    let relative_xy = sample_position.xy - center.xy;
    let oriented_position = vec3<f32>(
        dot(relative_xy, axis),
        dot(relative_xy, cross_axis),
        sample_position.z - center.z,
    );
    let oriented = geometry_ellipsoid(
        oriented_position, vec3<f32>(0.0), radii);
    let world_normal = normalize(vec3<f32>(
        axis.x * oriented.surface_normal.x +
            cross_axis.x * oriented.surface_normal.y,
        axis.y * oriented.surface_normal.x +
            cross_axis.y * oriented.surface_normal.y,
        oriented.surface_normal.z,
    ) + vec3<f32>(0.00001));
    let oriented_surface = oriented.closest_surface_km;
    let world_surface = vec3<f32>(
        center.x + axis.x * oriented_surface.x +
            cross_axis.x * oriented_surface.y,
        center.y + axis.y * oriented_surface.x +
            cross_axis.y * oriented_surface.y,
        center.z + oriented_surface.z,
    );
    return GeometrySample(
        oriented.signed_distance_km,
        oriented.feature_radius_km,
        oriented.support_clearance_km,
        oriented.seam_01,
        oriented.inverse_curvature_km,
        world_surface,
        world_normal,
    );
}

fn geometry_capsule(
    sample_position: vec3<f32>, start: vec3<f32>, finish: vec3<f32>,
    radius: f32,
) -> GeometrySample {
    let axis = finish - start;
    let axis_length_squared = max(0.000001, dot(axis, axis));
    let progress = clamp(
        dot(sample_position - start, axis) / axis_length_squared,
        0.0, 1.0,
    );
    let centerline = start + axis * progress;
    let offset = sample_position - centerline;
    let distance_to_axis = length(offset);
    let safe_radius = max(0.015, radius);
    let normal = normalize(offset + vec3<f32>(0.00001));
    let signed_distance = distance_to_axis - safe_radius;
    return GeometrySample(
        signed_distance,
        safe_radius,
        max(0.0, -signed_distance),
        0.0,
        safe_radius,
        centerline + normal * safe_radius,
        normal,
    );
}

fn geometry_smooth_union(
    first: GeometrySample, second: GeometrySample, blend_radius: f32,
) -> GeometrySample {
    let safe_blend = max(0.001, blend_radius);
    let blend = saturate(0.5 + 0.5 *
        (second.signed_distance_km - first.signed_distance_km) / safe_blend);
    let signed_distance = mix(
        second.signed_distance_km,
        first.signed_distance_km,
        blend,
    ) - safe_blend * blend * (1.0 - blend);
    let seam = (1.0 - smoothstep(
        safe_blend * 0.08,
        safe_blend,
        abs(first.signed_distance_km - second.signed_distance_km),
    )) * 4.0 * blend * (1.0 - blend);
    let normal = normalize(mix(
        second.surface_normal,
        first.surface_normal,
        blend,
    ) + vec3<f32>(0.00001));
    return GeometrySample(
        signed_distance,
        mix(second.feature_radius_km, first.feature_radius_km, blend),
        max(0.0, -signed_distance),
        max(max(first.seam_01, second.seam_01) * 0.72, seam),
        mix(second.inverse_curvature_km, first.inverse_curvature_km, blend),
        mix(second.closest_surface_km, first.closest_surface_km, blend),
        normal,
    );
}

fn geometry_clip_to_condensation_base(
    geometry: GeometrySample, sample_position: vec3<f32>,
) -> GeometrySample {
    let plane_distance = -sample_position.z;
    if (plane_distance <= geometry.signed_distance_km) { return geometry; }
    return GeometrySample(
        plane_distance,
        geometry.feature_radius_km,
        max(0.0, -plane_distance),
        max(geometry.seam_01, smoothstep(0.0, 0.08, -plane_distance)),
        geometry.inverse_curvature_km,
        vec3<f32>(sample_position.xy, 0.0),
        vec3<f32>(0.0, 0.0, -1.0),
    );
}

fn geometry_wave_packet(
    sample_position: vec3<f32>, center: vec3<f32>,
    axis: vec2<f32>, cross_axis: vec2<f32>,
    half_length: f32, half_width: f32, half_thickness: f32,
    phase: f32, wave_strength: f32,
) -> GeometrySample {
    let relative_xy = sample_position.xy - center.xy;
    let along = dot(relative_xy, axis);
    let across = dot(relative_xy, cross_axis);
    let safe_length = max(0.08, half_length);
    let safe_width = max(0.08, half_width);
    let safe_thickness = max(0.015, half_thickness);
    let u = along / safe_length;
    let v = across / safe_width;
    let power_sum = pow(abs(u), 4.0) + pow(abs(v), 4.0);
    let rho = pow(max(0.000001, power_sum), 0.25);
    let envelope = pow(max(0.0, 1.0 - rho * rho), 0.45);
    let wave_phase = u * PI * 1.35 + phase;
    let crest = center.z + safe_thickness * wave_strength * envelope *
        (sin(wave_phase) * 0.72 + sin(wave_phase * 2.17 + 1.3) * 0.28);
    let local_thickness = max(
        safe_thickness * 0.08,
        safe_thickness * envelope *
            (0.88 + 0.12 * sin(wave_phase * 1.61 + 0.7)),
    );
    let plan_distance = (rho - 1.0) * min(safe_length, safe_width);
    let vertical_delta = sample_position.z - crest;
    let vertical_distance = abs(vertical_delta) - local_thickness;
    let signed_distance = max(plan_distance, vertical_distance);

    let rho_denominator = max(0.0001, pow(max(power_sum, 0.000001), 0.75));
    let plan_along_gradient = min(safe_length, safe_width) *
        sign(u) * pow(abs(u), 3.0) /
        (safe_length * rho_denominator);
    let plan_across_gradient = min(safe_length, safe_width) *
        sign(v) * pow(abs(v), 3.0) /
        (safe_width * rho_denominator);
    let plan_normal = normalize(vec3<f32>(
        axis.x * plan_along_gradient + cross_axis.x * plan_across_gradient,
        axis.y * plan_along_gradient + cross_axis.y * plan_across_gradient,
        0.00001,
    ));
    let crest_slope = safe_thickness * wave_strength * envelope *
        cos(wave_phase) * PI * 1.35 / safe_length;
    let vertical_sign = select(-1.0, 1.0, vertical_delta >= 0.0);
    let vertical_normal = normalize(vec3<f32>(
        -axis.x * crest_slope * vertical_sign,
        -axis.y * crest_slope * vertical_sign,
        vertical_sign,
    ));
    let normal = select(
        vertical_normal, plan_normal, plan_distance > vertical_distance);
    return GeometrySample(
        signed_distance,
        safe_thickness,
        max(0.0, -signed_distance),
        0.0,
        safe_thickness,
        sample_position - normal * signed_distance,
        normal,
    );
}

// Stationary mountain-wave condensate.  A lenticular cloud is an elliptical
// lens with different upper and lower curvature, not a rounded rectangle or a
// constant-thickness slab.  The asymmetric cross-wind footprint leaves a
// compact windward edge and a slightly longer lee shoulder, while the
// elliptical envelope closes both long-axis tips to a genuinely thin edge.
fn geometry_lenticular_lens(
    sample_position: vec3<f32>, center: vec3<f32>,
    long_axis: vec2<f32>, lee_axis: vec2<f32>,
    half_length: f32, windward_half_width: f32, lee_half_width: f32,
    half_thickness: f32, phase: f32, wave_strength: f32,
) -> GeometrySample {
    let relative_xy = sample_position.xy - center.xy;
    let along = dot(relative_xy, long_axis);
    let across = dot(relative_xy, lee_axis);
    let safe_length = max(0.08, half_length);
    let safe_windward = max(0.06, windward_half_width);
    let safe_lee = max(0.07, lee_half_width);
    let safe_thickness = max(0.012, half_thickness);
    let local_width = select(safe_windward, safe_lee, across >= 0.0);
    let u = along / safe_length;
    let v = across / local_width;
    let elliptical_radius = sqrt(max(0.000001, u * u + v * v));

    // Thickness falls faster than the plan radius near the perimeter.  This
    // supplies the acute lenticular tips and feather-thin lee edge seen in a
    // laminar wave without relying on a noisy alpha fade.
    let radial_support = max(0.0, 1.0 - elliptical_radius * elliptical_radius);
    let tip_envelope = pow(radial_support, 0.72);
    let lee_fraction = saturate(across / safe_lee);
    let windward_fraction = saturate(-across / safe_windward);
    let along_wave = sin(u * PI * 0.82 + phase) * 0.62 +
        sin(u * PI * 1.73 + phase * 1.31) * 0.38;
    let crest = center.z + safe_thickness * wave_strength * tip_envelope *
        (along_wave * 0.18 + lee_fraction * 0.12 - windward_fraction * 0.045);
    let upper_depth = safe_thickness * tip_envelope *
        mix(0.92, 0.70, lee_fraction) *
        (1.0 + 0.035 * sin(u * PI * 2.2 + phase));
    let lower_depth = safe_thickness * tip_envelope *
        mix(0.70, 0.48, lee_fraction) *
        (1.0 - 0.025 * sin(u * PI * 1.7 + phase * 0.73));
    let upper_distance = sample_position.z - (crest + upper_depth);
    let lower_distance = (crest - lower_depth) - sample_position.z;
    let vertical_distance = max(upper_distance, lower_distance);
    let plan_distance = (elliptical_radius - 1.0) *
        min(safe_length, local_width);
    let signed_distance = max(plan_distance, vertical_distance);

    let plan_gradient = normalize(vec3<f32>(
        long_axis * (u / safe_length) +
            lee_axis * (v / local_width),
        0.00001,
    ));
    let upper_surface = upper_distance >= lower_distance;
    let vertical_sign = select(-1.0, 1.0, upper_surface);
    let cross_slope = safe_thickness * wave_strength *
        select(-0.045 / safe_windward, 0.12 / safe_lee, across >= 0.0);
    let vertical_normal = normalize(vec3<f32>(
        -lee_axis * cross_slope * vertical_sign,
        vertical_sign,
    ));
    let normal = select(
        vertical_normal, plan_gradient, plan_distance > vertical_distance);
    return GeometrySample(
        signed_distance,
        safe_thickness,
        max(0.0, -signed_distance),
        0.0,
        safe_thickness,
        sample_position - normal * signed_distance,
        normal,
    );
}

// Asymmetric glaciated outflow attached to a convective tower. A real anvil
// has a compact upwind crown, a widening downwind plume, a gently sloping
// equilibrium-level sheet and fibrous lateral divergence; a symmetric lens
// cannot represent those relationships.
fn geometry_anvil_outflow(
    sample_position: vec3<f32>, tower_center: vec3<f32>,
    wind_axis: vec2<f32>, cross_axis: vec2<f32>,
    upwind_length: f32, downwind_length: f32,
    maximum_half_width: f32, half_thickness: f32, phase: f32,
) -> GeometrySample {
    let relative_xy = sample_position.xy - tower_center.xy;
    let along = dot(relative_xy, wind_axis);
    let across = dot(relative_xy, cross_axis);
    let safe_upwind = max(0.15, upwind_length);
    let safe_downwind = max(0.25, downwind_length);
    let safe_width = max(0.12, maximum_half_width);
    let safe_thickness = max(0.025, half_thickness);
    let normalized_along = select(
        along / safe_upwind,
        along / safe_downwind,
        along >= 0.0,
    );
    let stream_position = saturate(
        (along + safe_upwind) / (safe_upwind + safe_downwind));
    // Outflow spreads into a broad shield. A sine envelope closes to a point
    // at both ends and produces the familiar synthetic "tongue"; observed
    // anvils retain a compact attachment behind the tower, diverge through
    // most of their fetch, and terminate in a broad, eroding downwind edge.
    let attachment = smoothstep(0.0, 0.16, stream_position);
    let divergence = smoothstep(0.08, 0.68, stream_position);
    let terminal_shape = smoothstep(0.86, 1.0, stream_position);
    let edge_lobes =
        sin(stream_position * PI * 3.1 + phase) * 0.055 +
        sin(stream_position * PI * 7.3 + phase * 1.37) * 0.022;
    let width_envelope = mix(0.28, 1.0, divergence) *
        mix(0.72, 1.0, attachment) * mix(1.0, 0.82, terminal_shape) +
        edge_lobes;
    let divergent_width = safe_width * max(0.16, width_envelope);
    let lateral_drift = sin(
        stream_position * PI * 1.36 + phase) * safe_width * 0.11 *
        smoothstep(0.12, 0.9, stream_position);
    let cross_distance = abs(across - lateral_drift) - divergent_width;
    let along_distance = select(
        -along - safe_upwind,
        along - safe_downwind,
        along >= 0.0,
    );
    let plan_distance = max(along_distance, cross_distance);
    let wave = (
        sin(stream_position * PI * 2.1 + phase) * 0.65 +
        sin(stream_position * PI * 4.7 + phase * 1.31) * 0.35
    ) * safe_thickness * 0.48;
    let slope = along / safe_downwind * safe_thickness * 0.22;
    let center_height = tower_center.z + slope + wave;
    let edge_fraction = saturate(abs(across - lateral_drift) /
        max(0.025, divergent_width));
    // In side elevation an anvil is a deep turbulent attachment that thins
    // into a fibrous downwind veil, not a constant-radius tube.  The
    // along-stream envelope supplies that meteorological wedge before the
    // lateral edge profile and stochastic boundary material are applied.
    let attachment_depth = mix(
        1.30, 0.70, smoothstep(0.10, 0.78, stream_position));
    // The far shield erodes into translucent filaments, but it remains a
    // finite ice layer. Collapsing its geometry almost to zero made the anvil
    // project as a bright contrail; material transport below owns the final
    // fibrous breakup instead.
    let terminal_thinning = mix(
        1.0, 0.64, smoothstep(0.78, 1.0, stream_position));
    let along_thickness = attachment_depth * terminal_thinning *
        (1.0 + sin(stream_position * PI * 4.2 + phase) * 0.08);
    let local_thickness = safe_thickness * along_thickness *
        mix(1.08, 0.24, pow(edge_fraction, 1.48)) *
        mix(0.82, 1.0, smoothstep(0.05, 0.42, stream_position));
    let vertical_delta = sample_position.z - center_height;
    let vertical_distance = abs(vertical_delta) - local_thickness;
    let signed_distance = max(plan_distance, vertical_distance);
    let side_sign = select(-1.0, 1.0, across >= lateral_drift);
    let plan_normal = normalize(vec3<f32>(
        cross_axis * side_sign + wind_axis * select(-0.12, 0.12, along >= 0.0),
        0.0001,
    ));
    let vertical_normal = vec3<f32>(
        -wind_axis * safe_thickness * 0.22 / safe_downwind,
        select(-1.0, 1.0, vertical_delta >= 0.0),
    );
    let normal = select(
        normalize(vertical_normal), plan_normal,
        plan_distance > vertical_distance,
    );
    return GeometrySample(
        signed_distance,
        safe_thickness,
        max(0.0, -signed_distance),
        0.0,
        safe_thickness,
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_finite_roll(
    sample_position: vec3<f32>, center: vec3<f32>,
    axis: vec2<f32>, cross_axis: vec2<f32>,
    half_length: f32, cross_radius: f32, vertical_radius: f32,
) -> GeometrySample {
    let relative_xy = sample_position.xy - center.xy;
    let along = dot(relative_xy, axis);
    let across = dot(relative_xy, cross_axis);
    let safe_length = max(0.08, half_length);
    let safe_cross = max(0.025, cross_radius);
    let safe_vertical = max(0.025, vertical_radius);
    let cap_distance = abs(along) - safe_length;
    let cross_vector = vec2<f32>(
        across / safe_cross,
        (sample_position.z - center.z) / safe_vertical,
    );
    let radial_distance = (length(cross_vector) - 1.0) *
        min(safe_cross, safe_vertical);
    let outside = length(max(vec2<f32>(cap_distance, radial_distance), vec2<f32>(0.0)));
    let signed_distance = outside + min(max(cap_distance, radial_distance), 0.0);
    let radial_normal_2d = normalize(vec2<f32>(
        across / (safe_cross * safe_cross),
        (sample_position.z - center.z) / (safe_vertical * safe_vertical),
    ) + vec2<f32>(0.00001));
    let radial_normal = normalize(vec3<f32>(
        cross_axis.x * radial_normal_2d.x,
        cross_axis.y * radial_normal_2d.x,
        radial_normal_2d.y,
    ));
    let cap_normal = vec3<f32>(axis * select(-1.0, 1.0, along >= 0.0), 0.0);
    let normal = select(radial_normal, cap_normal, cap_distance > radial_distance);
    return GeometrySample(
        signed_distance,
        min(safe_cross, safe_vertical),
        max(0.0, -signed_distance),
        0.0,
        min(safe_cross, safe_vertical),
        sample_position - normal * signed_distance,
        normal,
    );
}

// A finite roll-cloud support with a continuous core.  The eighth-power end
// envelope keeps most of the tube coherent before closing it rapidly into
// naturally tapered ends.  Cross-wind and vertical asymmetry represent the
// tilted circulation cell without splitting the cloud into a row of blobs.
fn geometry_tapered_roll(
    sample_position: vec3<f32>, center: vec3<f32>,
    axis: vec2<f32>, cross_axis: vec2<f32>,
    half_length: f32, cross_radius: f32, vertical_radius: f32,
    phase: f32, circulation_bias: f32,
) -> GeometrySample {
    let relative_xy = sample_position.xy - center.xy;
    let along = dot(relative_xy, axis);
    let safe_length = max(0.12, half_length);
    let safe_cross = max(0.025, cross_radius);
    let safe_vertical = max(0.025, vertical_radius);
    let u = along / safe_length;
    let terminal_support = max(0.0005, 1.0 - pow(abs(u), 8.0));
    let end_taper = pow(terminal_support, 0.34);
    let path_wave = sin(u * PI * 2.15 + phase) * end_taper;
    let cross_center = safe_cross * circulation_bias *
        (0.10 + path_wave * 0.045);
    let height_center = center.z + safe_vertical *
        (0.08 + path_wave * 0.055);
    let across = dot(relative_xy, cross_axis) - cross_center;
    let vertical_delta = sample_position.z - height_center;
    let local_cross = max(safe_cross * 0.075, safe_cross * end_taper);
    let upper_vertical = max(
        safe_vertical * 0.08,
        safe_vertical * end_taper * 1.10,
    );
    let lower_vertical = max(
        safe_vertical * 0.07,
        safe_vertical * end_taper * 0.78,
    );
    let local_vertical = select(
        lower_vertical, upper_vertical, vertical_delta >= 0.0);
    // A weak rotational lean makes the leading shoulder steeper than the
    // trailing underside while retaining a single connected cross-section.
    let leaned_across = across - vertical_delta * circulation_bias * 0.16;
    let cross_vector = vec2<f32>(
        leaned_across / local_cross,
        vertical_delta / local_vertical,
    );
    let radial_distance = (length(cross_vector) - 1.0) *
        min(local_cross, local_vertical);
    let cap_distance = abs(along) - safe_length;
    let signed_distance = max(cap_distance, radial_distance);
    let radial_normal_2d = normalize(vec2<f32>(
        leaned_across / (local_cross * local_cross),
        vertical_delta / (local_vertical * local_vertical),
    ) + vec2<f32>(0.00001));
    let radial_normal = normalize(vec3<f32>(
        cross_axis * radial_normal_2d.x,
        radial_normal_2d.y,
    ));
    let cap_normal = vec3<f32>(
        axis * select(-1.0, 1.0, along >= 0.0), 0.0);
    let normal = select(radial_normal, cap_normal, cap_distance > radial_distance);
    return GeometrySample(
        signed_distance,
        min(local_cross, local_vertical),
        max(0.0, -signed_distance),
        0.0,
        min(local_cross, local_vertical),
        sample_position - normal * signed_distance,
        normal,
    );
}

// Finite, tapered ice filament whose centreline bends and descends along the
// wind axis. This is an approximate tube SDF, but unlike a straight capsule it
// preserves the hooked/fallstreak topology of cirrus under perspective.
fn geometry_curved_fibre(
    sample_position: vec3<f32>, center: vec3<f32>,
    half_length: f32, half_width: f32, half_height: f32,
    fan_slope: f32, bend: f32, vertical_drop: f32, phase: f32,
) -> GeometrySample {
    let safe_length = max(0.12, half_length);
    let safe_width = max(0.018, half_width);
    let safe_height = max(0.018, half_height);
    let raw_u = (sample_position.x - center.x) / safe_length;
    let u = clamp(raw_u, -1.0, 1.0);
    let progress = saturate(u * 0.5 + 0.5);
    let taper = max(0.12, pow(max(0.0, 1.0 - abs(u)), 0.42));
    let waviness = sin(u * PI * 1.35 + phase) * bend * 0.34 +
        sin(u * PI * 3.1 + phase * 1.37) * bend * 0.10;
    let hook = pow(1.0 - progress, 2.3) * bend * 0.72;
    let center_y = center.y + u * fan_slope + waviness + hook;
    let center_z = center.z - vertical_drop * pow(progress, 1.28) +
        sin(u * PI * 1.1 + phase) * safe_height * 0.28;
    let cross = vec2<f32>(
        (sample_position.y - center_y) / max(0.015, safe_width * taper),
        (sample_position.z - center_z) / max(0.015, safe_height * taper),
    );
    let radial_distance = (length(cross) - 1.0) *
        min(safe_width, safe_height) * taper;
    let cap_distance = (abs(raw_u) - 1.0) * safe_length;
    let outside = length(max(
        vec2<f32>(cap_distance, radial_distance), vec2<f32>(0.0)));
    let signed_distance = outside + min(max(cap_distance, radial_distance), 0.0);
    let radial_normal_2d = normalize(vec2<f32>(
        (sample_position.y - center_y) /
            max(0.0002, safe_width * safe_width * taper * taper),
        (sample_position.z - center_z) /
            max(0.0002, safe_height * safe_height * taper * taper),
    ) + vec2<f32>(0.00001));
    let tangent_y = fan_slope / safe_length +
        cos(u * PI * 1.35 + phase) *
        PI * 1.35 * bend * 0.34 / safe_length;
    let tangent_z = -vertical_drop * 1.28 *
        pow(max(0.001, progress), 0.28) * 0.5 / safe_length;
    let radial_normal = normalize(vec3<f32>(
        -radial_normal_2d.x * tangent_y - radial_normal_2d.y * tangent_z,
        radial_normal_2d.x,
        radial_normal_2d.y,
    ));
    let cap_normal = vec3<f32>(select(-1.0, 1.0, raw_u >= 0.0), 0.0, 0.0);
    let normal = select(radial_normal, cap_normal, cap_distance > radial_distance);
    return GeometrySample(
        signed_distance,
        min(safe_width, safe_height),
        max(0.0, -signed_distance),
        0.0,
        min(safe_width, safe_height),
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_subtract(
    geometry: GeometrySample, cut: GeometrySample,
) -> GeometrySample {
    let cut_distance = -cut.signed_distance_km;
    if (geometry.signed_distance_km >= cut_distance) { return geometry; }
    return GeometrySample(
        cut_distance,
        min(geometry.feature_radius_km, cut.feature_radius_km),
        max(0.0, -cut_distance),
        max(geometry.seam_01, 0.35),
        min(geometry.inverse_curvature_km, cut.inverse_curvature_km),
        cut.closest_surface_km,
        -cut.surface_normal,
    );
}

fn geometry_shallow_cap(
    sample_position: vec3<f32>, radius: f32, top_height: f32,
) -> GeometrySample {
    let safe_radius = max(0.025, radius);
    let safe_height = max(0.02, top_height);
    let radial = length(sample_position.xy);
    let u = radial / safe_radius;
    let radial_power = pow(max(0.0, u), 1.7);
    let top_envelope = pow(max(0.0, 1.0 - radial_power), 0.72);
    let top_surface = safe_height * top_envelope;
    let safe_u = max(0.0001, u);
    let slope = select(
        0.0,
        -safe_height * 0.72 * pow(max(0.0001, 1.0 - radial_power), -0.28) *
            1.7 * pow(safe_u, 0.7) / safe_radius,
        u > 0.0001 && u < 0.999,
    );
    let top_distance = (sample_position.z - top_surface) /
        sqrt(1.0 + slope * slope);
    let side_distance = radial - safe_radius;
    let base_distance = -sample_position.z;
    let signed_distance = max(max(top_distance, side_distance), base_distance);
    let radial_direction = normalize(sample_position.xy + vec2<f32>(0.00001));
    let top_normal = normalize(vec3<f32>(
        -radial_direction * slope, 1.0));
    let side_normal = vec3<f32>(radial_direction, 0.0);
    var normal = top_normal;
    if (side_distance > top_distance && side_distance > base_distance) {
        normal = side_normal;
    }
    if (base_distance > top_distance && base_distance > side_distance) {
        normal = vec3<f32>(0.0, 0.0, -1.0);
    }
    return GeometrySample(
        signed_distance,
        min(safe_radius, safe_height),
        max(0.0, -signed_distance),
        0.0,
        min(safe_radius, safe_height),
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_shallow_cap_at(
    sample_position: vec3<f32>, center: vec3<f32>,
    radius: f32, top_height: f32,
) -> GeometrySample {
    let local = geometry_shallow_cap(
        sample_position - center, radius, top_height);
    return GeometrySample(
        local.signed_distance_km,
        local.feature_radius_km,
        local.support_clearance_km,
        local.seam_01,
        local.inverse_curvature_km,
        local.closest_surface_km + center,
        local.surface_normal,
    );
}

fn storm_radius_profile(normalized_height: f32) -> f32 {
    let h = saturate(normalized_height);
    // This is connective updraft support, not the visible storm outline.
    // Keeping it narrower than the resolved thermals prevents a monolithic
    // silo from surviving beneath the cauliflower hierarchy.
    var radius_factor = mix(0.56, 0.43, smoothstep(0.08, 0.46, h));
    radius_factor = mix(radius_factor, 0.54, smoothstep(0.52, 0.84, h));
    radius_factor = mix(radius_factor, 0.24, smoothstep(0.92, 1.0, h));
    return radius_factor;
}

fn cumulus_radius_profile(normalized_height: f32, maturity: f32) -> f32 {
    let h = saturate(normalized_height);
    // Growing cumulus remains a broad, connected water-cloud body. A narrow
    // mid-level profile forces successive thermal parcels to inflate merely
    // to touch, exposing a smoke-stack hierarchy in silhouette. Preserve a
    // modest waist, then broaden into the active cauliflower crown; only the
    // terminal dome contracts appreciably.
    var radius_factor = mix(0.46, mix(0.35, 0.40, maturity),
        smoothstep(0.10, 0.44, h));
    radius_factor = mix(radius_factor, mix(0.39, 0.50, maturity),
        smoothstep(0.48, 0.82, h));
    radius_factor = mix(radius_factor, mix(0.30, 0.38, maturity),
        smoothstep(0.92, 1.0, h));
    return radius_factor;
}

// Continuous deep-convective macro envelope. Its width follows the observed
// narrow-waist / expanding-upper-tower profile and its centre follows vertical
// shear. Resolved cauliflower protrusions are unioned onto this support by the
// owning feature, so this is not the final visible surface.
fn geometry_profiled_storm_tower(
    sample_position: vec3<f32>, radius: f32, top_height: f32,
    shear_amount: f32, variation: vec4<f32>,
) -> GeometrySample {
    let safe_radius = max(0.12, radius);
    let safe_top = max(0.4, top_height);
    let normalized_height = saturate(sample_position.z / safe_top);
    let centre = vec2<f32>(
        shear_amount * safe_radius * (
            normalized_height * 0.46 +
            sin(normalized_height * PI * 1.7 + variation.z * PI) * 0.055),
        (variation.x - 0.5) * safe_radius * 0.16 * normalized_height +
            sin(normalized_height * PI * 2.3 + variation.y * PI * 2.0) *
                safe_radius * 0.045,
    );
    let radius_variation = 1.0 +
        sin(normalized_height * PI * 5.2 + variation.x * PI * 2.0) * 0.075 +
        sin(normalized_height * PI * 9.4 + variation.w * PI * 2.0) * 0.035;
    let local_radius = safe_radius * storm_radius_profile(normalized_height) *
        radius_variation;
    let relative = sample_position.xy - centre;
    let elliptical = vec2<f32>(relative.x, relative.y / 0.86);
    let radial = length(elliptical);
    let horizontal_distance = radial - local_radius;
    let lower_distance = -sample_position.z;
    let top_surface = safe_top * (
        1.0 - pow(saturate(radial / max(0.04, local_radius)), 1.7) * 0.10);
    let upper_distance = sample_position.z - top_surface;
    let signed_distance = max(horizontal_distance,
        max(lower_distance, upper_distance));
    let radial_normal = normalize(vec3<f32>(
        relative.x,
        relative.y / (0.86 * 0.86),
        -shear_amount * 0.18,
    ) + vec3<f32>(0.00001));
    var normal = radial_normal;
    if (lower_distance > horizontal_distance && lower_distance > upper_distance) {
        normal = vec3<f32>(0.0, 0.0, -1.0);
    }
    if (upper_distance > horizontal_distance && upper_distance > lower_distance) {
        normal = vec3<f32>(0.0, 0.0, 1.0);
    }
    let material_radius = max(0.08, local_radius * 0.34);
    return GeometrySample(
        signed_distance,
        material_radius,
        max(0.0, -signed_distance),
        0.0,
        material_radius,
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_profiled_cumulus_tower(
    sample_position: vec3<f32>, radius: f32, top_height: f32,
    shear_amount: f32, maturity: f32, variation: vec4<f32>,
) -> GeometrySample {
    let safe_radius = max(0.08, radius);
    let safe_top = max(0.12, top_height);
    let normalized_height = saturate(sample_position.z / safe_top);
    let centre = vec2<f32>(
        shear_amount * safe_radius * normalized_height * mix(0.12, 0.34, maturity) +
            sin(normalized_height * PI * 3.7 + variation.z * PI * 2.0) *
                safe_radius * mix(0.06, 0.18, maturity),
        sin(normalized_height * PI * 2.1 + variation.y * PI * 2.0) *
            safe_radius * mix(0.08, 0.22, maturity),
    );
    let local_radius = safe_radius *
        cumulus_radius_profile(normalized_height, maturity) *
        (1.0 + sin(normalized_height * PI * 6.3 + variation.x * PI * 2.0) *
            mix(0.04, 0.09, maturity));
    let relative = sample_position.xy - centre;
    let elliptical = vec2<f32>(relative.x, relative.y / 0.88);
    let radial = length(elliptical);
    let horizontal_distance = radial - local_radius;
    let lower_distance = -sample_position.z;
    let top_surface = safe_top * (
        1.0 - pow(saturate(radial / max(0.03, local_radius)), 1.7) * 0.12);
    let upper_distance = sample_position.z - top_surface;
    let signed_distance = max(horizontal_distance,
        max(lower_distance, upper_distance));
    let radial_normal = normalize(vec3<f32>(
        relative.x,
        relative.y / (0.88 * 0.88),
        -shear_amount * 0.10,
    ) + vec3<f32>(0.00001));
    var normal = radial_normal;
    if (lower_distance > horizontal_distance && lower_distance > upper_distance) {
        normal = vec3<f32>(0.0, 0.0, -1.0);
    }
    if (upper_distance > horizontal_distance && upper_distance > lower_distance) {
        normal = vec3<f32>(0.0, 0.0, 1.0);
    }
    let material_radius = max(0.045, local_radius * 0.36);
    return GeometrySample(
        signed_distance,
        material_radius,
        max(0.0, -signed_distance),
        0.0,
        material_radius,
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_open_cell_wall(
    sample_position: vec3<f32>, nearest_vector: vec2<f32>,
    second_vector: vec2<f32>, wall_half_width: f32, top_height: f32,
) -> GeometrySample {
    let nearest_distance = max(0.0001, length(nearest_vector));
    let second_distance = max(0.0001, length(second_vector));
    let wall_distance = (second_distance - nearest_distance) * 0.5 -
        max(0.015, wall_half_width);
    let wall_gradient = normalize(
        second_vector / second_distance - nearest_vector / nearest_distance +
        vec2<f32>(0.00001));
    let lower_distance = -sample_position.z;
    let upper_distance = sample_position.z - max(0.02, top_height);
    let signed_distance = max(max(wall_distance, lower_distance), upper_distance);
    var normal = vec3<f32>(wall_gradient, 0.0);
    if (lower_distance > wall_distance && lower_distance > upper_distance) {
        normal = vec3<f32>(0.0, 0.0, -1.0);
    }
    if (upper_distance > wall_distance && upper_distance > lower_distance) {
        normal = vec3<f32>(0.0, 0.0, 1.0);
    }
    let feature_radius = max(0.02, wall_half_width);
    return GeometrySample(
        signed_distance,
        feature_radius,
        max(0.0, -signed_distance),
        0.0,
        feature_radius,
        sample_position - normal * signed_distance,
        normal,
    );
}

fn geometry_horizontal_slab(
    sample_position: vec3<f32>, top_height: f32,
) -> GeometrySample {
    let safe_top = max(0.02, top_height);
    let lower_distance = -sample_position.z;
    let upper_distance = sample_position.z - safe_top;
    let signed_distance = max(lower_distance, upper_distance);
    let normal = select(
        vec3<f32>(0.0, 0.0, -1.0),
        vec3<f32>(0.0, 0.0, 1.0),
        upper_distance > lower_distance,
    );
    return GeometrySample(
        signed_distance,
        safe_top,
        max(0.0, -signed_distance),
        0.0,
        safe_top,
        sample_position - normal * signed_distance,
        normal,
    );
}

// Shared cloud-boundary material. The SDF is deliberately only a bounded
// condensation support: it owns topology, connectivity and physical extent,
// while independent Perlin-Worley bands own the visible vapour boundary. This
// prevents analytic primitives from surviving as smooth spheres or ovals and
// prevents noise from creating detached cloud outside the intended air mass.
fn condensation_material_density(
    geometry: GeometrySample, sample_position: vec3<f32>, h: f32,
    detail_strength: f32, boundary_scale: f32, height_emphasis: f32,
    spectrum: vec4<f32>, owner_seed: vec4<f32>, index: i32,
) -> f32 {
    let sdf = geometry.signed_distance_km;
    let radius = geometry.feature_radius_km;
    // Extend the surface signal along the macro normal rather than sampling
    // generic smoke at the current volume point. This keeps the stochastic
    // boundary coherent throughout its narrow support band and prevents the
    // source primitive from reappearing as the ray crosses its interior.
    let maximum_projection = radius * 0.32;
    let projected_surface = sample_position - geometry.surface_normal *
        clamp(sdf, -maximum_projection, maximum_projection);
    let closest_surface = mix(
        projected_surface,
        geometry.closest_surface_km,
        smoothstep(0.0, radius * 0.5, length(geometry.closest_surface_km)),
    );
    let low_wavelength = max(0.025, radius * spectrum.x);
    let middle_wavelength = max(0.012, radius * spectrum.y);
    let fine_wavelength = max(0.006, radius * spectrum.z);
    let low_coordinates = fract(
        closest_surface / low_wavelength + owner_seed.xyz * 17.13 +
        vec3<f32>(f32(index) * 0.173, 0.0, 0.0),
    );
    let low_sample = textureSampleLevel(
        base_volume, volume_sampler, low_coordinates, 0.0);
    let raw_warp = low_sample.gba * 2.0 - vec3<f32>(1.0);
    let tangent_warp = raw_warp - geometry.surface_normal *
        dot(raw_warp, geometry.surface_normal);
    let warped_surface = closest_surface + tangent_warp *
        min(radius * 0.11, low_wavelength * 0.18);
    let middle_coordinates = fract(
        warped_surface.zxy / middle_wavelength + owner_seed.wxy * 23.71 +
        vec3<f32>(0.371, 0.617, 0.193),
    );
    let middle_sample = textureSampleLevel(
        base_volume, volume_sampler, middle_coordinates, 0.0);
    let fine_coordinates = fract(
        warped_surface.yzx / fine_wavelength + owner_seed.yzw * 31.19 +
        vec3<f32>(0.713, 0.257, 0.449),
    );
    let detail_sample = textureSampleLevel(
        detail_volume, volume_sampler, fine_coordinates, 0.0);
    let low_ridge = 1.0 - abs(low_sample.g * 2.0 - 1.0);
    let middle_ridge = 1.0 - abs(middle_sample.b * 2.0 - 1.0);
    let macro_relief = low_sample.r * 0.44 + low_ridge * 0.32 +
        middle_sample.r * 0.16 + middle_ridge * 0.08;
    let scallop_relief = (low_ridge - middle_sample.g) * 0.62 +
        (middle_ridge - middle_sample.a) * 0.38;
    let fine_relief = dot(
        detail_sample.rgb - vec3<f32>(0.5),
        vec3<f32>(0.58, 0.28, 0.14),
    );
    let normal_weight = abs(geometry.surface_normal);
    let tangent_relief = dot(
        low_sample.rgb - vec3<f32>(0.5),
        normalize(vec3<f32>(
            1.05 - normal_weight.x,
            1.05 - normal_weight.y,
            1.05 - normal_weight.z,
        )),
    );
    let signed_relief = (macro_relief - 0.50) * 1.10 +
        scallop_relief * 0.42 + fine_relief * 0.31 + tangent_relief * 0.17;
    // The lifting-condensation level stays geometrically coherent. Above it,
    // boundary displacement grows with resolved parcel size and maturity.
    let base_guard = smoothstep(0.035, 0.16, h);
    let requested_relief_amplitude = radius *
        spectrum.w * mix(0.72, 1.18, detail_strength) *
        boundary_scale * height_emphasis;
    // Strong displacement at a tight union or high-curvature feature exposes
    // the source primitive as a scalloped seam. Limit it by the local radius of
    // curvature while still permitting broad cauliflower relief elsewhere.
    let relief_amplitude = min(
        requested_relief_amplitude * mix(1.0, 0.46, geometry.seam_01),
        geometry.inverse_curvature_km * mix(0.16, 0.28, detail_strength),
    );
    let displaced_sdf = sdf - signed_relief * relief_amplitude * base_guard;
    let support_band = max(0.025, radius *
        mix(0.18, 0.32, detail_strength) * boundary_scale * height_emphasis);
    let support = saturate(0.5 - displaced_sdf / (2.0 * support_band));
    let material_threshold = mix(0.76, 0.10, support);
    let coarse_material = smoothstep(
        material_threshold - 0.075,
        material_threshold + 0.105,
        macro_relief,
    );
    let detail_fbm = dot(detail_sample.rgb,
        vec3<f32>(0.58, 0.28, 0.14));
    let rim_erosion = (1.0 - detail_fbm) *
        mix(0.12, 0.28, detail_strength) *
        (1.0 - smoothstep(0.66, 0.94, support));
    var condensate = smoothstep(0.10, 0.58,
        coarse_material - rim_erosion);
    // Preserve a compact optical core for stable self-shadowing, but begin it
    // far enough inside the noisy surface that it cannot reveal the primitive.
    let protected_core = smoothstep(
        radius * 0.16,
        radius * mix(0.34, 0.48, 1.0 - geometry.seam_01),
        geometry.support_clearance_km,
    );
    condensate = max(condensate, protected_core);
    // The displaced field owns the visible boundary. Clipping against the
    // undisplaced primitive here used to erase all outward relief and leave
    // the original ellipsoid/lens silhouette as an unmistakable stamp.
    condensate *= 1.0 - smoothstep(
        support_band * 0.76, support_band, displaced_sdf);
    return saturate(condensate);
}

// Ice-streamer material cannot retain the protected opaque core used by
// liquid convective clouds.  Cirrus is a sparse population of crystal bundles
// with broad IWC variation, nested fallstreak filaments, and a porous edge.
// The macro SDF still owns all support and topology; this bounded multiplier
// only redistributes condensate already inside that support.  Two independent
// filtered 3-D bands prevent the analytic curved-fibre primitive from reading
// as a smooth, uniformly filled ribbon.
fn cirrus_ice_microstructure(
    geometry: GeometrySample,
    base_sample: vec4<f32>,
    detail_sample: vec4<f32>,
    variation: vec4<f32>,
    dense_ice_fraction: f32,
) -> f32 {
    let dense_ice = saturate(dense_ice_fraction);
    let coarse_ridge = 1.0 - abs(base_sample.g - base_sample.b);
    let crystal_ridge = 1.0 - abs(
        detail_sample.r * 0.62 + detail_sample.b * 0.38 -
        (base_sample.a * 0.57 + variation.z * 0.43));
    let broad_loading = saturate(
        base_sample.r * 0.44 + coarse_ridge * 0.23 +
        base_sample.a * 0.18 + variation.y * 0.15);
    let filament_loading = saturate(
        detail_sample.r * 0.30 + detail_sample.g * 0.19 +
        detail_sample.b * 0.13 + crystal_ridge * 0.38);
    let bundle_loading = smoothstep(
        0.28, 0.78, broad_loading * 0.58 + filament_loading * 0.42);
    let edge_fraction = 1.0 - smoothstep(
        geometry.feature_radius_km * 0.10,
        geometry.feature_radius_km * 0.58,
        geometry.support_clearance_km);
    // Spissatus and compact high-ice aggregates retain a materially denser
    // interior; fibratus/uncinus remain transparent and cannot recover the
    // generic protected-core stamp through this shared function.
    let interior = mix(
        mix(0.30, 0.52, dense_ice),
        1.02,
        bundle_loading);
    let porous_edge = mix(
        mix(0.08, 0.18, dense_ice), 1.08,
        smoothstep(0.34, 0.76,
            filament_loading * 0.64 + bundle_loading * 0.36));
    return clamp(mix(interior, porous_edge, edge_fraction), 0.06, 1.08);
}

// Species-aware buoyant volume. Macro form is a continuous signed-distance
// field, so illumination crosses one condensate body rather than revealing a
// stack of intersecting primitives. Smaller thermals are attached only near
// the rising exterior, then turbulent texture displaces that exterior.
fn convective_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32, genus: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, detail_sample: vec4<f32>,
    weather_curl: vec2<f32>, seed: vec4<f32>,
) -> f32 {
    let storm = genus == 10;
    let species = i32(round(layer.species.x));
    let coverage = saturate(layer.geometry.z);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.8 + formation_potential * 0.2),
        editorial.y > 0.5,
    );
    let activation = saturate(system_potential * select(0.74, 0.6, storm) +
        coverage * select(0.5, 0.36, storm) - select(0.23, 0.3, storm));
    if (activation <= 0.015 && editorial.y <= 0.5) { return 0.0; }

    var morphology_position = position;
    var morphology_center = vec2<f32>(0.0);
    if (i32(round(p[28].y)) == 3) {
        let seed_b = p[14][(index + 1) % 4];
        let regime_override = i32(round(p[28].w));
        var distance_scale = 1.0;
        if (regime_override == 1) { distance_scale = 2.15; }
        if (regime_override == 2) { distance_scale = 0.72; }
        var primary_range = camera_visible_system_range(layer, index, seed_b) *
            mix(0.86, 1.16, seed_b) * distance_scale;
        if (storm) {
            // Use the identical world-space centre that owns storm moisture.
            // Separate placement formulas made the macro body sample a clear
            // part of the atmosphere and disappear in narrow distant views.
            primary_range = storm_system_center_range(layer, index, seed_b);
        }
        let angle_scale = select(1.35, 1.0, storm);
        let primary_angle = cloud_editorial_primary_angle(layer, index) * angle_scale;
        let primary_center = vec2<f32>(sin(primary_angle), cos(primary_angle)) *
            primary_range;
        morphology_center = primary_center;
        morphology_position -= primary_center;
    }

    let orientation = seed.x * 2.37 + f32(genus) * 0.41;
    let axis = vec2<f32>(cos(orientation), sin(orientation));
    let cross_axis = vec2<f32>(-axis.y, axis.x);
    var domain = vec2<f32>(
        dot(morphology_position, axis), dot(morphology_position, cross_axis));
    domain += (weather_curl - 0.5) * select(1.8, 5.8, storm);

    var spacing = mix(3.4, 5.8, layer.shape.y);
    if (species == 17) { spacing *= 0.88; }
    if (species == 19) { spacing *= 1.26; }
    if (storm) { spacing = mix(24.0, 34.0, seed.y); }
    let base_cell = floor(domain / spacing);
    var density = 0.0;

    for (var cell_y = -2; cell_y <= 2; cell_y++) {
        for (var cell_x = -2; cell_x <= 2; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.z + f32(genus) * 3.1);
            let cluster = floor((cell + vec2<f32>(9.0, -6.0)) / 3.0);
            let cluster_shift = morphology_hash2(
                cluster, seed.y + f32(genus) * 13.7) - vec2<f32>(0.5);
            let graphic_primary_owner = i32(round(p[28].y)) == 3 &&
                abs(cell.x) < 0.5 && abs(cell.y) < 0.5;
            // Focused storm compositions represent one coherent mesoscale
            // system. Do not allow neighbouring lattice owners to contribute
            // detached anvils or clipped towers to the same telephoto frame.
            if (storm && i32(round(p[28].y)) == 3 &&
                !graphic_primary_owner) { continue; }
            var candidate = (cell + mix(
                vec2<f32>(-0.72), vec2<f32>(0.72), jitter)) * spacing +
                cluster_shift * spacing * select(0.62, 0.12, storm);
            if (graphic_primary_owner) {
                candidate = vec2<f32>(0.0);
            }
            let local = domain - candidate;
            let size_seed = hash31(vec3<f32>(cell, seed.w + 5.7));
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.x + 13.1));
            let owner_position = morphology_center + axis * candidate.x +
                cross_axis * candidate.y;
            var owner_activation = activation;
            var owner_system_potential = system_potential;
            if (editorial.y > 0.5) {
                let owner_editorial = cloud_editorial_population(
                    owner_position, layer, index,
                    vec3<f32>(jitter, size_seed),
                );
                owner_system_potential = saturate(
                    owner_editorial.x * 0.80 + formation_potential * 0.20);
                owner_activation = saturate(
                    owner_system_potential * select(0.74, 0.60, storm) +
                    coverage * select(0.50, 0.36, storm) -
                    select(0.23, 0.30, storm));
            }
            var cell_active = 1.0 - smoothstep(owner_activation - 0.09,
                owner_activation + 0.08, birth_seed);
            let primary_owner = graphic_primary_owner;
            if (primary_owner) {
                cell_active = max(cell_active,
                    smoothstep(0.12, 0.42, owner_system_potential));
            }
            if (!storm && i32(round(p[28].y)) == 3 && !primary_owner) {
                // Keep a few depth cues around the selected fair-weather
                // subject without building several semi-transparent clouds on
                // the same view ray into a stack of horizontal shelves.
                cell_active *= 0.34;
            }
            if (cell_active <= 0.001) { continue; }

            let maturity = pow(size_seed, 1.38);
            var top = mix(0.42, 0.84, maturity);
            var radius = spacing * mix(0.085, 0.26, maturity);
            if (species == 17) { top = mix(0.34, 0.68, maturity); radius *= 0.92; }
            if (species == 18) { top = mix(0.5, 0.92, maturity); radius *= 0.94; }
            if (species == 19) { top = mix(0.62, 0.98, maturity); radius *= 0.88; }
            if (species == 31) { top = mix(0.34, 0.52, size_seed); radius *= 0.62; }
            if (storm) {
                top = mix(0.92, 0.99, size_seed);
                radius = spacing * mix(0.085, 0.13, size_seed);
            }
            if (primary_owner && !storm) {
                if (species == 17) {
                    top = max(top, 0.58);
                    radius = max(radius, spacing * 0.17);
                }
                if (species == 18) {
                    top = max(top, 0.76);
                    radius = max(radius, spacing * 0.19);
                }
                if (species == 19) {
                    top = max(top, 0.92);
                    radius = max(radius, spacing * 0.22);
                }
            }

            let depth = layer.geometry.y;
            let top_km = max(0.12, top * depth);
            let z = h * depth;
            let lean = (jitter - 0.5) * radius * mix(0.18, 0.52,
                layer.motion.z + layer.motion.w * 0.35);
            // Construct the cloud from buoyant three-dimensional parcels. A
            // heightfield or tapered cylinder inevitably reads as a capsule,
            // cone, or shelf stack. The broad basal parcel is clipped at the
            // lifting-condensation level; independently offset parcels above
            // it supply the two-scale cauliflower boundary and keep the
            // interior one connected optical body.
            let base_center = top_km * select(0.115, 0.09, storm);
            let base_vertical = max(0.055, min(top_km * 0.18, radius * 0.43));
            let sample_position = vec3<f32>(local, z);
            var geometry = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, base_center),
                vec3<f32>(
                    radius * select(0.61, 0.62, storm),
                    radius * mix(0.56, 0.72, jitter.y),
                    base_vertical,
                ),
            );

            // Connectivity is supplied by the overlapping buoyant spine below.
            // A single tall support ellipsoid survived deep inside the material
            // as a rectangular/silo-like optical core, especially in storms.
            // Removing it lets the same parcels own both topology and shadow.

            let parcel_count = select(
                select(
                    select(select(12, 15, species == 18), 18, species == 19),
                    10,
                    species == 31,
                ),
                18,
                storm,
            );
            for (var parcel = 0; parcel < 18; parcel++) {
                if (parcel >= parcel_count) { continue; }
                let pf = f32(parcel);
                let ps = morphology_hash2(
                    cell + vec2<f32>(pf * 13.7 + 2.0, -pf * 9.1 - 4.0),
                    seed.y + pf * 1.73,
                );
                // Build a connected buoyant tree. Its first parcels form an
                // overlapping, irregular updraft spine; later parcels branch
                // from that spine and form the visible cauliflower crown.
                // Independent exterior blobs were the source of horizontal
                // shelves because each one acquired its own lit base.
                let spine_count = select(5, 8, storm);
                let spine_parcel = parcel < spine_count;
                let scattered_level = fract(
                    pf * 0.61803398875 + ps.y * 0.37 + size_seed * 0.23);
                var level = mix(0.34, 0.88, scattered_level);
                if (spine_parcel) {
                    level = mix(0.24, select(0.78, 0.88, storm),
                        (pf + ps.y * 0.58) / max(1.0, f32(spine_count) - 0.42));
                }
                if (species == 17) {
                    level = min(level, mix(0.48, 0.73, scattered_level));
                }
                let crown_count = select(
                    3,
                    select(5, 6, species == 19 || storm),
                    species == 18 || species == 19 || storm,
                );
                let crown_parcel = parcel >= parcel_count - crown_count;
                if (crown_parcel) {
                    level = mix(
                        select(0.66, 0.72, species == 19 || storm),
                        select(0.82, 0.94, species == 19 || storm),
                        fract(ps.y * 1.73 + pf * 0.381966),
                    );
                    if (species == 17) {
                        level = mix(0.55, 0.72,
                            fract(ps.y * 1.73 + pf * 0.381966));
                    }
                    if (species == 18) {
                        level = mix(0.60, 0.92,
                            fract(ps.y * 1.73 + pf * 0.381966));
                    }
                }
                if (species == 31) { level *= 0.62; }
                let hierarchy = mix(
                    1.0,
                    select(0.78, 0.67, species == 19 || storm),
                    level,
                );
                var parcel_radius = radius * mix(0.26, 0.43, ps.y) * hierarchy;
                if (spine_parcel) {
                    parcel_radius = radius * mix(0.40, 0.56, ps.x) *
                        mix(1.0, 0.72, level);
                }
                if (crown_parcel) {
                    // Every mature thermal owns several resolved crown cells.
                    // A single forced top parcel merely replaces an oval with
                    // a snowman; a crown cluster supplies the cauliflower
                    // hierarchy seen in growing cumulus photographs.
                    parcel_radius = max(parcel_radius,
                        radius * select(0.22, 0.30, species == 19 || storm) *
                        mix(0.82, 1.16, ps.x));
                    if (species == 19 || storm) {
                        parcel_radius = max(
                            parcel_radius,
                            radius * mix(0.31, 0.43, ps.x),
                        );
                    }
                }
                let vertical_radius = min(
                    top_km * mix(0.16, 0.28, ps.x),
                    parcel_radius * mix(0.94, 1.34, layer.shape.y),
                );
                let radial_direction = normalize(
                    (ps - vec2<f32>(0.5)) + vec2<f32>(0.013, -0.017));
                // Place thermals on the exterior support cone, not inside a
                // broad hidden core. Interior placement was the direct cause
                // of the oval/snowman silhouette: twelve lobes existed, but
                // only the enclosing ellipsoid was ever visible.
                let crown_support = select(
                    0.64,
                    select(0.66, 0.70, species == 19 || storm),
                    species == 18 || species == 19 || storm,
                );
                let support_radius = radius * mix(0.72, crown_support, level);
                var radial_distance = support_radius * mix(0.22, 0.62, ps.x);
                if (spine_parcel) {
                    radial_distance = radius * mix(0.04, 0.26, ps.x) *
                        mix(0.72, 1.0, level);
                }
                var parcel_offset = vec2<f32>(
                    lean.x * level,
                    lean.y * level,
                ) + radial_direction * radial_distance;
                if ((species == 19 || storm) && crown_parcel) {
                    let crown_slot = f32(parcel - (parcel_count - crown_count));
                    let crown_angle = crown_slot * 2.39996323 +
                        size_seed * PI * 2.0;
                    let crown_spread = radius * mix(
                        0.28, select(0.82, 0.96, storm),
                        fract(crown_slot * 0.381966 + ps.x),
                    );
                    parcel_offset = lean * level +
                        vec2<f32>(cos(crown_angle), sin(crown_angle)) *
                            crown_spread;
                }
                let parcel_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(parcel_offset, top_km * level),
                    vec3<f32>(
                        parcel_radius,
                        parcel_radius * mix(0.74, 1.08, ps.x),
                        max(0.045, vertical_radius),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry,
                    parcel_geometry,
                    parcel_radius * select(
                        select(
                            mix(0.18, 0.30, layer.shape.y),
                            mix(0.12, 0.22, layer.shape.y),
                            spine_parcel,
                        ),
                        mix(0.16, 0.27, layer.shape.y),
                        crown_parcel,
                    ),
                );
            }
            // Flat cloud bases emerge from one shared condensation level, not
            // a dark painted line. Clipping after all parcel unions preserves
            // the rounded perimeter while making every connected component
            // terminate at the same physical LCL.
            geometry = geometry_clip_to_condensation_base(
                geometry, sample_position);

            var anvil_geometry = make_geometry_sample(1000.0, 0.12, 0.0);
            var has_anvil = false;
            if (storm) {
                let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
                let wind_cross = vec2<f32>(-wind_axis.y, wind_axis.x);
                let anvil_center = vec3<f32>(
                    lean * 0.78 + wind_axis * radius *
                        mix(0.20, 0.46, layer.motion.z),
                    top_km * 0.86,
                );
                if (species == 20) {
                    // Calvus has a smooth glaciating dome, not an anvil. The
                    // previous union-then-intersection accidentally clipped the
                    // tower against the anvil SDF. A compact crown extends the
                    // same owner while keeping the outflow stage absent.
                    let calvus_cap = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(lean * 0.82, top_km * 0.88),
                        vec3<f32>(radius * 0.72, radius * 0.66, top_km * 0.11),
                    );
                    geometry = geometry_smooth_union(
                        geometry, calvus_cap, radius * 0.22);
                } else {
                    // Mature outflow is an asymmetric plume: the short upwind
                    // crown stays attached to its parent tower while the
                    // downwind ice shield broadens and thins with divergence.
                    anvil_geometry = geometry_anvil_outflow(
                        sample_position, anvil_center,
                        wind_axis, wind_cross,
                        radius * mix(0.72, 1.12, size_seed),
                        radius * mix(2.0, 3.0, layer.shape.z),
                        radius * mix(1.42, 2.25, layer.shape.z),
                        top_km * mix(0.020, 0.034, size_seed),
                        seed.x * PI * 2.0 + size_seed * 1.7,
                    );
                    has_anvil = true;
                }
            }

            let crown_emphasis = mix(0.72, 1.28,
                smoothstep(0.24, 0.88, h));
            let owner_seed = vec4<f32>(jitter, size_seed, birth_seed);
            var condensate = condensation_material_density(
                geometry, sample_position, h, layer.shape.w,
                select(1.0, 1.48, species == 31), crown_emphasis,
                vec4<f32>(0.52, 0.17, 0.052, 0.18), owner_seed, index,
            ) * cell_active;
            if (has_anvil) {
                let ice_outflow = condensation_material_density(
                    anvil_geometry, sample_position, h, layer.shape.w,
                    0.64, 0.74,
                    vec4<f32>(0.94, 0.31, 0.065, 0.085),
                    owner_seed.wxyz, index,
                ) * cell_active * layer.shape.z * 0.29;
                condensate = max(condensate, ice_outflow);
            }
            density = max(density, condensate);
        }
    }
    return saturate(density);
}

// Retained temporarily as a reference while the species-aware SDF path is
// photographically certified. It is not called by the transport shader.
// A jittered set of thermals supplies a genuinely flat lifting-condensation
// base, a narrowing trunk, independently offset cauliflower lobes, and (for
// cumulonimbus) a coupled anvil and overshooting dome. The volume textures only
// perturb those resolved forms; they never define the silhouette by themselves.
fn legacy_convective_morphology(
    position: vec2<f32>, h: f32, layer: Layer, genus: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, weather_curl: vec2<f32>, seed: vec4<f32>,
) -> f32 {
    let storm = genus == 10;
    if (storm && editorial.y > 0.5) {
        return editorial_storm_morphology(
            position, h, layer, editorial, base_sample, seed);
    }
    let coverage = saturate(layer.geometry.z);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.78 + formation_potential * 0.22),
        editorial.y > 0.5,
    );
    let activation = saturate(
        system_potential * select(0.72, 0.58, storm) +
        coverage * select(0.48, 0.34, storm) - select(0.24, 0.31, storm),
    );
    if (activation <= 0.015) { return 0.0; }

    let orientation = seed.x * 2.37 + f32(genus) * 0.41;
    let orientation_c = cos(orientation);
    let orientation_s = sin(orientation);
    let domain = vec2<f32>(
        position.x * orientation_c - position.y * orientation_s,
        position.x * orientation_s + position.y * orientation_c,
    ) + (weather_curl - 0.5) * select(2.4, 7.0, storm);
    let spacing = select(
        mix(3.2, 5.6, layer.shape.y),
        mix(22.0, 31.0, seed.y),
        storm,
    );
    let grid_position = domain / spacing;
    let base_cell = floor(grid_position);
    var density = 0.0;

    // A complete Moore neighbourhood is required for a continuous jittered
    // population. The former 2x2 positive quadrant missed valid owners near
    // cell edges, which appeared as rows, clipped silhouettes and sudden
    // changes as the camera moved through the domain.
    for (var cell_y = -1; cell_y <= 1; cell_y++) {
        for (var cell_x = -1; cell_x <= 1; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.z + f32(genus) * 3.1);
            let candidate = (cell + mix(vec2<f32>(0.12), vec2<f32>(0.88), jitter)) * spacing;
            let local = domain - candidate;
            let size_seed = hash31(vec3<f32>(cell, seed.w + 5.7));
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.x + 13.1));
            let cell_active = 1.0 - smoothstep(
                activation - 0.09,
                activation + 0.08,
                birth_seed,
            );
            if (cell_active <= 0.001) { continue; }

            var top = clamp(
                mix(0.34, 0.68, size_seed) + layer.shape.y * mix(0.12, 0.29, size_seed),
                0.3,
                0.94,
            );
            var radius = spacing * mix(0.14, 0.27, pow(size_seed, 0.72));
            if (storm) {
                top = mix(0.82, 0.98, size_seed * 0.45 + layer.shape.y * 0.55);
                radius = spacing * mix(0.13, 0.22, size_seed);
            }
            let vertical_radius = clamp(
                radius / max(0.12, layer.geometry.y), 0.11, select(0.34, 0.48, storm));
            if (h > min(1.0, top + vertical_radius * 0.22)) { continue; }

            let side_a = morphology_hash2(cell + vec2<f32>(7.0, 3.0), seed.y) - 0.5;
            let side_b = morphology_hash2(cell + vec2<f32>(-5.0, 11.0), seed.w) - 0.5;
            let axis_a = normalize(side_a + vec2<f32>(0.003, 0.001));
            let axis_b = normalize(side_b + vec2<f32>(-0.001, 0.003));
            let radial_squared = dot(local / max(0.05, radius), local / max(0.05, radius));
            let flat_base = (1.0 - smoothstep(0.54, 1.08, radial_squared)) *
                (1.0 - smoothstep(0.08, min(top * 0.24, vertical_radius * 0.72), h));
            let lower = morphology_lobe(
                local + axis_b * radius * 0.10,
                h, radius * 0.88, top * 0.22, vertical_radius * 0.82,
            );
            let middle = morphology_lobe(
                local - axis_a * radius * 0.22,
                h, radius * 0.70, top * 0.47, vertical_radius * 0.78,
            );
            let shoulder_a = morphology_lobe(
                local + axis_a * radius * 0.58,
                h, radius * 0.52, top * 0.62, vertical_radius * 0.60,
            );
            let shoulder_b = morphology_lobe(
                local - axis_b * radius * 0.66,
                h, radius * 0.46, top * 0.68, vertical_radius * 0.56,
            );
            let crown = morphology_lobe(
                local + (axis_a - axis_b) * radius * 0.16,
                h, radius * 0.48, top * 0.81, vertical_radius * 0.58,
            );
            let cap = morphology_lobe(
                local - axis_a * radius * 0.12,
                h, radius * 0.30, top * 0.94, vertical_radius * 0.38,
            );
            // Secondary turretlets establish the smaller cauliflower scale
            // seen in photographs. They are owned by this thermal, so they
            // cannot tile independently or detach into unrelated beads.
            let turret_seed_a = morphology_hash2(
                cell + vec2<f32>(13.0, -17.0), seed.x + size_seed);
            let turret_seed_b = morphology_hash2(
                cell + vec2<f32>(-19.0, 23.0), seed.y + birth_seed);
            let turret_a = morphology_lobe(
                local + (turret_seed_a - 0.5) * radius * 0.92,
                h, radius * mix(0.19, 0.32, turret_seed_a.x),
                top * mix(0.72, 0.96, turret_seed_a.y),
                vertical_radius * mix(0.24, 0.38, turret_seed_a.x),
            );
            let turret_b = morphology_lobe(
                local + (turret_seed_b - 0.5) * radius * 0.84,
                h, radius * mix(0.17, 0.29, turret_seed_b.y),
                top * mix(0.66, 0.91, turret_seed_b.x),
                vertical_radius * mix(0.22, 0.35, turret_seed_b.y),
            );
            var thermal = max(flat_base, max(lower, max(middle,
                max(shoulder_a, max(shoulder_b,
                    max(crown, max(cap, max(turret_a, turret_b))))))));

            if (storm) {
                let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
                let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
                let along = dot(local, wind_axis);
                let across = dot(local, cross_axis);
                let anvil_distance = vec2<f32>(
                    (along - radius * 0.9) / max(0.1, radius * 2.45),
                    across / max(0.1, radius * 1.65),
                );
                let anvil_horizontal = 1.0 - smoothstep(
                    0.54, 1.16, dot(anvil_distance, anvil_distance));
                let anvil_vertical = smoothstep(0.72, 0.80, h) *
                    (1.0 - smoothstep(0.91, 0.97, h));
                let anvil = anvil_horizontal * anvil_vertical * layer.shape.z;
                let overshoot = morphology_lobe(
                    local - side_a * radius * 0.25,
                    h, radius * 0.34, top * 0.94, top * 0.09,
                ) * layer.shape.y;
                thermal = max(thermal, max(anvil, overshoot));
            }

            // Low-frequency texture gives real turbulent relief while retaining
            // the analytic base, crown and anvil silhouettes.
            let relief_noise = base_sample.r * 0.46 +
                dot(base_sample.gba, vec3<f32>(0.31, 0.16, 0.07));
            let relief = mix(0.68, 1.22, relief_noise);
            // Erosion is concentrated at the analytic exterior. Dense cores
            // stay coherent while resolved scallops and evaporation notches
            // interrupt the silhouette. This is the opposite of multiplying
            // the entire body by generic noise, which makes cloudy smoke.
            let boundary_band = 1.0 - smoothstep(0.48, 0.86, thermal);
            let boundary_erosion = pow(1.0 - relief_noise, 1.25) *
                mix(0.07, 0.17, layer.shape.w) * boundary_band;
            let condensed = smoothstep(0.045, 0.38,
                max(0.0, thermal - boundary_erosion) * relief) *
                smoothstep(0.0, 0.025, h) * cell_active;
            density = max(density, condensed);
        }
    }
    return saturate(density);
}

fn lenticular_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32,
    editorial: vec2<f32>, base_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    var density = 0.0;
    let depth = max(0.08, layer.geometry.y);
    let system_moisture = select(
        formation_potential,
        max(formation_potential, editorial.x * 0.92),
        editorial.y > 0.5,
    );
    let moisture = smoothstep(0.06, 0.36,
        system_moisture * 0.58 + layer.geometry.z * 0.42);
    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 2) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) {
            continue;
        }
        let wave_axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        // Feature axes follow the mountain ridge.  Clockwise rotation points
        // along the flow toward the lee shoulder of the stationary packet.
        let wave_lee = vec2<f32>(wave_axis.y, -wave_axis.x);
        let local = vec2<f32>(
            dot(raw_local, wave_axis), dot(raw_local, wave_lee));
        let sample_position = vec3<f32>(local, h * depth);
        let center_height = feature.shape.x * depth;
        let half_thickness = max(0.025, feature.shape.y * depth);
        let species = i32(round(feature.identity.z));
        let high_ice_lens = species == 24;
        let low_liquid_lens = species == 28;
        let lamina_count = i32(clamp(round(feature.extra1.w), 1.0, 3.0));
        // The packet owns one standing-wave condensate. Boundary turbulence is
        // weaker than in cellular cloud, while subtle transverse moisture
        // variation prevents an optically perfect synthetic lens.
        let transverse_moisture = mix(0.76, 1.0, smoothstep(0.22, 0.78,
            base_sample.r * 0.52 + base_sample.g * 0.31 +
            feature.variation.z * 0.17));
        var condensate = 0.0;
        for (var lamina = 0; lamina < 3; lamina++) {
            if (lamina >= lamina_count) { continue; }
            let lf = f32(lamina);
            let lamina_seed = fract(
                feature.variation.x * 5.17 +
                feature.variation.y * 3.71 + lf * 0.381966);
            let horizontal_scale = select(
                1.0,
                mix(0.70, 0.88, lamina_seed),
                lamina > 0,
            );
            let thickness_scale = select(
                1.0,
                mix(0.42, 0.68, fract(lamina_seed * 2.73)),
                lamina > 0,
            );
            let layer_offset = select(
                0.0,
                half_thickness * (1.92 + lf * 1.42 + lamina_seed * 0.42),
                lamina > 0,
            );
            let lateral_offset = select(
                vec2<f32>(0.0),
                vec2<f32>(
                    feature.axis_extent.z * (lamina_seed - 0.5) * 0.075,
                    feature.axis_extent.w * mix(-0.11, 0.16, lamina_seed)),
                lamina > 0,
            );
            let lee_asymmetry = mix(0.08, 0.28,
                fract(feature.variation.y * 1.91 + lf * 0.27));
            let windward_width = feature.axis_extent.w * horizontal_scale *
                (1.0 - lee_asymmetry * 0.34);
            let lee_width = feature.axis_extent.w * horizontal_scale *
                (1.0 + lee_asymmetry * 0.52);
            let geometry = geometry_lenticular_lens(
                sample_position,
                vec3<f32>(
                    lateral_offset,
                    center_height + layer_offset,
                ),
                vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
                feature.axis_extent.z * horizontal_scale,
                windward_width,
                lee_width,
                half_thickness * thickness_scale,
                feature.variation.w * PI * 2.0 + lf * 0.71,
                feature.shape.z * mix(1.0, 0.68, smoothstep(0.0, 2.0, lf)),
            );
            let detail_scale = select(
                select(0.48, 0.36, low_liquid_lens),
                0.42,
                high_ice_lens,
            );
            let boundary_scale = select(
                select(0.34, 0.42, low_liquid_lens),
                0.26,
                high_ice_lens,
            );
            let material_scale = select(
                select(1.0, 1.10, low_liquid_lens),
                0.72,
                high_ice_lens,
            ) * select(1.0, 0.80, lamina > 0);
            let lamina_condensate = condensation_material_density(
                geometry, sample_position, h,
                layer.shape.w * detail_scale,
                boundary_scale, 0.42,
                select(
                    vec4<f32>(0.34, 0.11, 0.034, 0.034),
                    vec4<f32>(0.30, 0.095, 0.030, 0.026),
                    high_ice_lens,
                ),
                feature.variation + vec4<f32>(lf * 0.17, lf * 0.31,
                    lf * 0.47, lf * 0.13),
                index,
            ) * moisture * feature.shape.w * transverse_moisture *
                material_scale;
            condensate = 1.0 - (1.0 - saturate(condensate)) *
                (1.0 - saturate(lamina_condensate));
        }
        density = max(density, condensate);
    }
    return saturate(density * 0.82);
}

fn volutus_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32,
    base_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let occupancy = smoothstep(0.08, 0.38,
        formation_potential * 0.55 + layer.geometry.z * 0.45);
    var density = 0.0;
    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 6) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) { continue; }
        let axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        let cross_axis = vec2<f32>(-axis.y, axis.x);
        let sample_position = vec3<f32>(raw_local, h * depth);
        let center = vec3<f32>(0.0, 0.0, feature.shape.x * depth);
        let circulation_bias = mix(-0.82, 0.82, feature.variation.y);
        var geometry = geometry_tapered_roll(
            sample_position, center, axis, cross_axis,
            feature.axis_extent.z, feature.axis_extent.w,
            max(0.035, feature.shape.y),
            feature.variation.w * PI * 2.0,
            circulation_bias,
        );
        // Unequal upper parcels expose the overturning crest while the parent
        // remains one continuous roll. They overlap the tube deeply enough to
        // perturb its silhouette instead of becoming a bead chain.
        for (var billow_index = 0; billow_index < 6; billow_index++) {
            let bf = f32(billow_index);
            let billow_seed = morphology_hash2(
                feature.variation.xy + vec2<f32>(bf * 6.37, -bf * 4.91),
                feature.variation.z + bf * 3.71,
            );
            let along = mix(
                -feature.axis_extent.z * 0.76,
                feature.axis_extent.z * 0.76,
                (bf + 0.5 + (billow_seed.x - 0.5) * 0.42) / 6.0,
            );
            let billow_radius = feature.axis_extent.w *
                mix(0.56, 0.88, billow_seed.x);
            let path_phase = (bf / 5.0) * PI * 2.0 +
                feature.variation.w * PI * 2.0;
            let billow_center = center + vec3<f32>(
                axis * along + cross_axis * feature.axis_extent.w *
                    ((billow_seed.y - 0.5) * 0.20 + sin(path_phase) * 0.08),
                feature.shape.y * mix(0.72, 1.08, billow_seed.y),
            );
            let billow = geometry_oriented_ellipsoid(
                sample_position,
                billow_center,
                axis,
                cross_axis,
                vec3<f32>(
                    billow_radius * mix(0.92, 1.36, billow_seed.y),
                    billow_radius * mix(0.68, 0.94, billow_seed.y),
                    max(0.025, feature.shape.y *
                        mix(0.62, 0.96, billow_seed.x)),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, billow, max(0.012, billow_radius * 0.075));
        }
        let species = i32(round(feature.identity.z));
        let middle_level_roll = species == 27;
        let local_across = dot(raw_local, cross_axis) /
            max(0.025, feature.axis_extent.w);
        let local_vertical = (h * depth - center.z) /
            max(0.025, feature.shape.y);
        let circulation_angle = atan2(local_vertical, local_across);
        let circulation_texture = sin(
            circulation_angle +
            dot(raw_local, axis) / max(0.12, feature.axis_extent.z) * 0.55 +
            feature.variation.w * PI * 2.0);
        let circulation_modulation = mix(
            0.91, 1.045, smoothstep(-0.82, 0.82, circulation_texture));
        let condensate = condensation_material_density(
            geometry, sample_position, h, layer.shape.w * 0.84,
            select(0.66, 0.58, middle_level_roll), 0.82,
            select(
                vec4<f32>(0.40, 0.13, 0.040, 0.080),
                vec4<f32>(0.36, 0.12, 0.036, 0.068),
                middle_level_roll,
            ),
            feature.variation, index,
        ) * occupancy * feature.shape.w * circulation_modulation *
            select(1.04, 0.90, middle_level_roll);
        density = 1.0 - (1.0 - density) * (1.0 - saturate(condensate));
    }
    return saturate(density);
}

// Stratus fractus consists of low, wind-torn sheet fragments formed within a
// boundary layer. It is neither a perforated uniform deck nor a population of
// rounded cumulus domes. Finite shallow wave packets give each whole fragment
// a physically owned birth, ragged top and underside, and elongated advection
// direction before the shared condensation material resolves its vapour edge.
fn stratus_fractus_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
    var morphology_position = position;
    if (i32(round(p[28].y)) == 3) {
        // Fractus lives close to the observer; using the generic nearby range
        // put a kilometre-wide fragment almost on the camera and projected it
        // as a clipped white ceiling. Keep the system several fragment widths
        // away while retaining genuine low-cloud perspective.
        let center_range = camera_visible_system_range(layer, index, seed.y) *
            mix(2.15, 2.75, seed.x);
        let center_angle = cloud_editorial_primary_angle(layer, index);
        morphology_position -= vec2<f32>(sin(center_angle), cos(center_angle)) *
            center_range;
    }
    let domain = vec2<f32>(
        dot(morphology_position, wind_axis),
        dot(morphology_position, cross_axis));
    let spacing = mix(0.58, 1.32, layer.geometry.z);
    let base_cell = floor(domain / spacing);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.58 + formation_potential * 0.42),
        editorial.y > 0.5,
    );
    let activation = clamp(
        layer.geometry.z * 0.58 + system_potential * 0.34 - 0.32,
        0.46,
        0.72,
    );
    let depth = max(0.08, layer.geometry.y);
    var density = 0.0;

    for (var cell_y = -1; cell_y <= 1; cell_y++) {
        for (var cell_x = -1; cell_x <= 1; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.z + 151.0);
            let cluster = floor((cell + vec2<f32>(7.0, -5.0)) / 3.0);
            let cluster_shift = morphology_hash2(cluster, seed.x + 163.0) -
                vec2<f32>(0.5);
            var candidate = (cell + mix(
                vec2<f32>(0.08), vec2<f32>(0.92), jitter)) * spacing +
                cluster_shift * spacing * 0.42;
            let graphic_primary_owner = i32(round(p[28].y)) == 3 &&
                abs(cell.x) < 0.5 && abs(cell.y) < 0.5;
            if (graphic_primary_owner) { candidate = vec2<f32>(0.0); }
            if (i32(round(p[28].y)) == 3 &&
                (abs(cell.x) > 1.1 || abs(cell.y) > 1.1)) {
                continue;
            }
            let local = domain - candidate;
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.w + 173.0));
            let colony = noise2(cell * 0.22 + seed.xy * 19.0);
            let birth_rank = mix(birth_seed, colony, 0.54);
            var owner = 1.0 - smoothstep(
                activation - 0.10, activation + 0.10, birth_rank);
            if (graphic_primary_owner) { owner = 1.0; }
            if (layer.geometry.z >= 0.55) {
                // At broken-to-overcast Stratus coverage the population is
                // extensive and the fragment footprints, not random owner
                // deletion, supply the clear slots. This prevents a valid
                // five-okta state from drawing no owner in a narrow camera.
                owner = max(owner,
                    smoothstep(0.55, 0.66, layer.geometry.z));
            }
            if (owner <= 0.001) { continue; }

            let size_seed = hash31(vec3<f32>(cell, seed.y + 181.0));
            let along_extent = spacing * mix(0.28, 0.58, size_seed);
            let across_extent = spacing * mix(0.12, 0.27, jitter.y);
            let center_height = depth * mix(0.26, 0.44, jitter.x);
            let half_thickness = depth * mix(0.12, 0.22, size_seed);
            let sample_position = vec3<f32>(local, h * depth);
            var geometry = geometry_wave_packet(
                sample_position,
                vec3<f32>(0.0, 0.0, center_height),
                vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
                along_extent, across_extent, half_thickness,
                jitter.x * PI * 2.0,
                mix(0.12, 0.28, layer.shape.w),
            );
            let fragment_left = geometry_wave_packet(
                sample_position,
                vec3<f32>(
                    -along_extent * mix(0.28, 0.48, jitter.y),
                    across_extent * (jitter.x - 0.5) * 0.72,
                    center_height + half_thickness * (jitter.y - 0.5) * 0.62,
                ),
                vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
                along_extent * mix(0.42, 0.68, jitter.x),
                across_extent * mix(0.48, 0.76, jitter.y),
                half_thickness * mix(0.58, 0.88, jitter.x),
                jitter.y * PI * 2.0 + 1.7,
                mix(0.18, 0.36, layer.shape.w),
            );
            let fragment_right = geometry_wave_packet(
                sample_position,
                vec3<f32>(
                    along_extent * mix(0.24, 0.44, jitter.x),
                    -across_extent * (jitter.y - 0.5) * 0.86,
                    center_height - half_thickness * (jitter.x - 0.5) * 0.48,
                ),
                vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
                along_extent * mix(0.36, 0.62, jitter.y),
                across_extent * mix(0.44, 0.70, jitter.x),
                half_thickness * mix(0.52, 0.82, jitter.y),
                jitter.x * PI * 2.0 + 3.1,
                mix(0.20, 0.40, layer.shape.w),
            );
            geometry = geometry_smooth_union(
                geometry, fragment_left, across_extent * 0.055);
            geometry = geometry_smooth_union(
                geometry, fragment_right, across_extent * 0.045);
            let owner_seed = vec4<f32>(jitter, size_seed, birth_seed);
            let fragment = condensation_material_density(
                geometry, sample_position, h, layer.shape.w,
                1.34, 0.88,
                vec4<f32>(0.52, 0.17, 0.055, 0.24),
                owner_seed, index,
            ) * owner;
            density = max(density, fragment);
        }
    }
    return saturate(density * 0.82);
}

fn stratus_fractus_feature_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let system_moisture = select(
        formation_potential,
        max(formation_potential, editorial.x * 0.86),
        editorial.y > 0.5,
    );
    let moisture = smoothstep(0.08, 0.4,
        system_moisture * 0.58 + layer.geometry.z * 0.42);
    var density = 0.0;
    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 5) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) { continue; }
        let axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        let cross_axis = vec2<f32>(-axis.y, axis.x);
        let local = vec2<f32>(dot(raw_local, axis), dot(raw_local, cross_axis));
        let sample_position = vec3<f32>(local, h * depth);
        let major = feature.axis_extent.z;
        let minor = feature.axis_extent.w;
        let center_height = feature.shape.x * depth;
        let vertical_radius = max(0.035, feature.shape.y * depth);
        // Fractus is an advected shred, not a rounded parent primitive. Build
        // its support as an irregular, overlapping chain whose vertical depth
        // is much smaller than its windwise extent. Unequal segment heights
        // make both the top and base ragged while preserving one connected
        // parcel of boundary-layer condensate.
        let first_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(3.7, -5.9),
            feature.variation.z + 11.3,
        );
        var geometry = geometry_ellipsoid(
            sample_position,
            vec3<f32>(
                -major * 0.66,
                (first_seed.y - 0.5) * minor * 0.48,
                center_height + vertical_radius * (first_seed.x - 0.5) * 0.58,
            ),
            vec3<f32>(
                major * mix(0.18, 0.27, first_seed.x),
                minor * mix(0.42, 0.68, first_seed.y),
                vertical_radius * mix(0.38, 0.64, first_seed.x),
            ),
        );
        for (var shred_index = 1; shred_index < 6; shred_index++) {
            let sf = f32(shred_index);
            let shred_seed = morphology_hash2(
                feature.variation.yx + vec2<f32>(sf * 7.7, -sf * 9.3),
                feature.variation.w + sf * 5.1,
            );
            let along = mix(-0.46, 0.72, (sf - 1.0) / 4.0) * major;
            let cross_drift = sin(sf * 1.73 + feature.variation.x * PI * 2.0) *
                minor * mix(0.12, 0.34, feature.shape.z);
            let vertical_drift = (shred_seed.x - 0.5) * vertical_radius * 0.82 +
                (sf - 2.5) * vertical_radius * feature.shape.z * 0.055;
            let shred = geometry_ellipsoid(
                sample_position,
                vec3<f32>(
                    along,
                    cross_drift + (shred_seed.y - 0.5) * minor * 0.24,
                    center_height + vertical_drift,
                ),
                vec3<f32>(
                    major * mix(0.17, 0.29, shred_seed.x),
                    minor * mix(0.38, 0.72, shred_seed.y),
                    vertical_radius * mix(0.34, 0.70, shred_seed.x),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, shred, max(0.008, minor * 0.032));
        }

        // Dry air entrains along several independent portions of the moving
        // perimeter.  Real SDF subtraction creates concave bays and torn gaps;
        // it does not merely lower opacity around an otherwise oval support.
        for (var bite_index = 0; bite_index < 3; bite_index++) {
            let bf = f32(bite_index);
            let bite_seed = morphology_hash2(
                feature.variation.xy + vec2<f32>(bf * 13.1, bf * -17.7),
                feature.variation.z + bf * 19.3,
            );
            let bite_side = select(-1.0, 1.0,
                fract(bite_seed.x + feature.variation.w) >= 0.5);
            let entrainment_bite = geometry_ellipsoid(
                sample_position,
                vec3<f32>(
                    mix(-0.58, 0.62, bite_seed.x) * major,
                    bite_side * minor * mix(0.34, 0.72, bite_seed.y),
                    center_height + vertical_radius *
                        mix(-0.28, 0.52, bite_seed.x),
                ),
                vec3<f32>(
                    major * mix(0.09, 0.17, bite_seed.y),
                    minor * mix(0.20, 0.38, bite_seed.x),
                    vertical_radius * mix(0.40, 0.72, bite_seed.y),
                ),
            );
            geometry = geometry_subtract(geometry, entrainment_bite);
        }
        let condensate = condensation_material_density(
            geometry, sample_position, h, layer.shape.w,
            0.72, 0.78,
            vec4<f32>(0.38, 0.13, 0.04, 0.15),
            feature.variation, index,
        ) * moisture * feature.shape.w *
            mix(0.72, 1.0, smoothstep(0.22, 0.74,
                base_sample.r * 0.62 + base_sample.g * 0.38));
        density = 1.0 - (1.0 - density) * (1.0 - saturate(condensate));
    }
    return saturate(density * 0.84);
}

// Cirrocumulus stratiformis is a field of minute granular cloudlets organized
// into short, imperfect ripples (the observed "mackerel sky").  The rows are
// finite inside each meteorological owner and are mutually phase-shifted, so
// they never become an infinite procedural grid.
fn cirrocumulus_stratiformis_owner(
    local: vec2<f32>, h: f32, layer: Layer, index: i32,
    feature: CloudFeature, moisture: f32,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let element_radius = feature.axis_extent.w;
    let member_count = i32(clamp(round(feature.extra0.x), 7.0, 10.0));
    var density = 0.0;
    for (var member = 0; member < 10; member++) {
        if (member >= member_count) { continue; }
        let mf = f32(member);
        let row = f32(member % 3) - 1.0;
        let column = f32(member / 3) - 1.5;
        let member_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(mf * 5.71, -mf * 8.93),
            feature.variation.z + mf * 3.17,
        );
        let along = column * feature.axis_extent.z * 0.39 +
            (member_seed.x - 0.5) * element_radius * 0.72;
        let ripple_phase = sin(
            column * 1.41 + feature.variation.w * PI * 2.0 + row * 0.63);
        let across = row * element_radius * 1.58 +
            ripple_phase * element_radius * 0.34 +
            (member_seed.y - 0.5) * element_radius * 0.42;
        let size = element_radius * mix(0.56, 0.88, member_seed.x);
        let top_height = depth * mix(0.105, 0.19, member_seed.y);
        let member_sample = vec3<f32>(
            local - vec2<f32>(along, across), h * depth);
        var geometry = geometry_shallow_cap(
            member_sample, size, top_height);
        let granule = geometry_ellipsoid(
            member_sample,
            vec3<f32>(size * (member_seed.x - 0.5) * 0.28,
                size * (member_seed.y - 0.5) * 0.20, top_height * 0.63),
            vec3<f32>(size * 0.54, size * 0.46, top_height * 0.30),
        );
        geometry = geometry_smooth_union(
            geometry, granule, max(0.006, size * 0.032));
        geometry = geometry_clip_to_condensation_base(
            geometry, member_sample);
        let material = condensation_material_density(
            geometry, member_sample, h, layer.shape.w,
            0.82, 0.70,
            vec4<f32>(0.31, 0.085, 0.026, 0.052),
            vec4<f32>(member_seed, feature.variation.zw), index,
        ) * moisture * feature.shape.w;
        density = 1.0 - (1.0 - density) * (1.0 - saturate(material));
    }
    return saturate(density * 2.34);
}

// Altocumulus stratiformis retains discrete, optically shaded water-cloud
// elements, but all elements in one patch condense at nearly the same level.
// Aperiodic phyllotactic packing gives clustered patches without checkerboard
// ownership or the regimented rows reserved for Cirrocumulus.
fn altocumulus_stratiformis_owner(
    local: vec2<f32>, h: f32, layer: Layer, index: i32,
    feature: CloudFeature, moisture: f32,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let element_radius = feature.axis_extent.w;
    let member_count = i32(clamp(round(feature.extra0.x), 5.0, 8.0));
    let shared_base_lift = depth * 0.018 * feature.variation.z;
    var density = 0.0;
    for (var member = 0; member < 8; member++) {
        if (member >= member_count) { continue; }
        let mf = f32(member);
        let member_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(mf * 5.13 + 1.7, -mf * 7.81),
            feature.variation.z + mf * 2.91,
        );
        let angle = mf * 2.39996323 + feature.variation.w * PI * 2.0 +
            (member_seed.x - 0.5) * 0.52;
        let radial = sqrt(fract(mf * 0.61803398875 + member_seed.y * 0.39));
        let member_center = vec2<f32>(cos(angle), sin(angle)) *
            feature.axis_extent.z * radial * 0.72;
        let size = element_radius * mix(0.72, 1.24, member_seed.x);
        let top_height = depth * feature.shape.x *
            mix(0.50, 0.82, member_seed.y);
        let member_sample = vec3<f32>(
            local - member_center, h * depth - shared_base_lift);
        var geometry = geometry_shallow_cap(
            member_sample, size * 0.92, top_height * 0.66);
        for (var lobe_index = 0; lobe_index < 3; lobe_index++) {
            let lf = f32(lobe_index);
            let lobe_seed = morphology_hash2(
                member_seed + vec2<f32>(lf * 4.3, -lf * 7.9),
                feature.extra2.x + lf * 11.0,
            );
            let lobe = geometry_ellipsoid(
                member_sample,
                vec3<f32>((lf - 1.0) * size * 0.31,
                    (lobe_seed.y - 0.5) * size * 0.38,
                    top_height * mix(0.39, 0.56, lobe_seed.y)),
                vec3<f32>(size * mix(0.38, 0.54, lobe_seed.x),
                    size * mix(0.32, 0.50, lobe_seed.y),
                    top_height * mix(0.15, 0.23, lobe_seed.x)),
            );
            geometry = geometry_smooth_union(
                geometry, lobe, max(0.009, size * 0.043));
        }
        geometry = geometry_clip_to_condensation_base(
            geometry, member_sample);
        let material = condensation_material_density(
            geometry, member_sample, h, layer.shape.w,
            0.98, mix(0.88, 1.10, smoothstep(0.1, 0.8, h)),
            vec4<f32>(0.43, 0.14, 0.044, 0.11),
            vec4<f32>(member_seed, feature.variation.zw), index,
        ) * moisture * feature.shape.w;
        density = 1.0 - (1.0 - density) * (1.0 - saturate(material));
    }
    return saturate(density * 0.92);
}

// Stratocumulus stratiformis is one low, merged water-cloud deck assembled
// from overlapping convective caps.  Real crevices are carved through that
// connected body with curved, finite dry channels; no density mask lightens
// clouds outside a desired footprint.
fn stratocumulus_stratiformis_owner(
    local: vec2<f32>, h: f32, layer: Layer, index: i32,
    feature: CloudFeature, moisture: f32,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let colony_radius = feature.axis_extent.z;
    let element_radius = feature.axis_extent.w;
    let member_count = i32(clamp(round(feature.extra0.x), 6.0, 8.0));
    let sample_position = vec3<f32>(local, h * depth);
    var geometry = make_geometry_sample(1000.0, element_radius, 0.0);
    var geometry_valid = false;
    for (var member = 0; member < 8; member++) {
        if (member >= member_count) { continue; }
        let mf = f32(member);
        let member_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(mf * 6.11, -mf * 9.17),
            feature.variation.z + mf * 4.07,
        );
        let angle = mf * 2.39996323 + feature.variation.w * PI * 2.0 +
            (member_seed.x - 0.5) * 0.78;
        let radial = sqrt(fract(mf * 0.61803398875 + member_seed.y * 0.46));
        let center = vec2<f32>(cos(angle), sin(angle)) *
            colony_radius * radial * 0.56;
        let size = element_radius * mix(1.05, 1.52, member_seed.x);
        let cap = geometry_shallow_cap_at(
            sample_position, vec3<f32>(center, 0.0), size,
            depth * feature.shape.x * mix(0.34, 0.54, member_seed.y));
        if (!geometry_valid) {
            geometry = cap;
            geometry_valid = true;
        } else {
            geometry = geometry_smooth_union(
                geometry, cap, max(0.015, element_radius * 0.13));
        }
    }
    if (!geometry_valid) { return 0.0; }
    // Two nonparallel broken channels make the familiar irregular fissures in
    // a low deck. Their positions and widths vary per owner and their finite
    // endpoints prevent a repeating hatch pattern at large scale.
    for (var channel_index = 0; channel_index < 2; channel_index++) {
        let cf = f32(channel_index);
        let channel_seed = morphology_hash2(
            feature.variation.zw + vec2<f32>(cf * 13.7, -cf * 5.3),
            feature.extra2.y + cf * 17.0,
        );
        let channel_angle = (channel_seed.x - 0.5) * 1.18 + cf * 1.37;
        let channel_axis = vec2<f32>(cos(channel_angle), sin(channel_angle));
        let channel_cross = vec2<f32>(-channel_axis.y, channel_axis.x);
        let offset = channel_cross * colony_radius *
            mix(-0.34, 0.34, channel_seed.y);
        let start = vec3<f32>(offset - channel_axis * colony_radius * 0.63,
            depth * 0.14);
        let bend = offset + channel_cross * element_radius *
            (channel_seed.x - 0.5) * 0.68;
        let middle = vec3<f32>(bend, depth * 0.16);
        let finish = vec3<f32>(offset + channel_axis * colony_radius * 0.61,
            depth * 0.13);
        let channel_radius = element_radius * mix(0.15, 0.24, channel_seed.x);
        geometry = geometry_subtract(
            geometry, geometry_capsule(sample_position, start, middle,
                channel_radius));
        geometry = geometry_subtract(
            geometry, geometry_capsule(sample_position, middle, finish,
                channel_radius * mix(0.78, 1.08, channel_seed.y)));
    }
    geometry = geometry_clip_to_condensation_base(
        geometry, sample_position);
    let material = condensation_material_density(
        geometry, sample_position, h, layer.shape.w,
        1.08, mix(0.90, 1.16, smoothstep(0.06, 0.76, h)),
        vec4<f32>(0.46, 0.16, 0.052, 0.15),
        feature.variation, index,
    ) * moisture * feature.shape.w;
    return saturate(material * 0.94);
}

// Castellanus is a finite crenellated ribbon: a single horizontal base owns
// several adjacent turrets.  Building the bank before the turrets prevents the
// former result—unrelated oval cloudlets that merely had bumps on top.
fn cellular_castellanus_owner(
    local: vec2<f32>, h: f32, layer: Layer, index: i32, genus: i32,
    feature: CloudFeature, moisture: f32,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let colony_radius = feature.axis_extent.z;
    let element_radius = feature.axis_extent.w;
    let sample_position = vec3<f32>(local, h * depth);
    let top_height = depth * feature.shape.x;
    var geometry = geometry_ellipsoid(
        sample_position,
        vec3<f32>(0.0, 0.0, top_height * 0.105),
        vec3<f32>(colony_radius * 0.78, element_radius * 0.76,
            top_height * 0.11),
    );
    let base_companion = geometry_ellipsoid(
        sample_position,
        vec3<f32>(colony_radius * (feature.variation.x - 0.5) * 0.26,
            element_radius * (feature.variation.y - 0.5) * 0.42,
            top_height * 0.12),
        vec3<f32>(colony_radius * 0.58, element_radius * 0.68,
            top_height * 0.12),
    );
    geometry = geometry_smooth_union(
        geometry, base_companion, max(0.012, element_radius * 0.11));
    let turret_count = i32(clamp(round(feature.extra0.x), 4.0, 6.0));
    for (var turret_index = 0; turret_index < 6; turret_index++) {
        if (turret_index >= turret_count) { continue; }
        let tf = f32(turret_index);
        let turret_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(tf * 9.1, -tf * 4.7),
            feature.extra2.x + tf * 12.0,
        );
        let x = (tf / max(1.0, f32(turret_count - 1)) - 0.5) *
            colony_radius * 1.34 +
            (turret_seed.x - 0.5) * element_radius * 0.22;
        let tower_height = top_height * mix(0.64, 1.0, turret_seed.y);
        let tower_width = element_radius * mix(0.36, 0.58, turret_seed.x);
        let lower = geometry_ellipsoid(
            sample_position,
            vec3<f32>(x, (turret_seed.x - 0.5) * element_radius * 0.26,
                top_height * 0.30),
            vec3<f32>(tower_width, tower_width * 0.88, top_height * 0.22),
        );
        geometry = geometry_smooth_union(
            geometry, lower, max(0.01, tower_width * 0.16));
        let crown = geometry_ellipsoid(
            sample_position,
            vec3<f32>(x + tower_width * (turret_seed.y - 0.5) * 0.22,
                (turret_seed.x - 0.5) * element_radius * 0.31,
                tower_height * 0.73),
            vec3<f32>(tower_width * mix(0.78, 1.04, turret_seed.y),
                tower_width * mix(0.72, 0.96, turret_seed.x),
                tower_height * 0.28),
        );
        geometry = geometry_smooth_union(
            geometry, crown, max(0.009, tower_width * 0.13));
        if (turret_seed.x > 0.46) {
            let bud = geometry_ellipsoid(
                sample_position,
                vec3<f32>(x - tower_width * 0.34,
                    element_radius * (turret_seed.y - 0.5) * 0.32,
                    tower_height * 0.88),
                vec3<f32>(tower_width * 0.48, tower_width * 0.44,
                    tower_height * 0.17),
            );
            geometry = geometry_smooth_union(
                geometry, bud, max(0.007, tower_width * 0.10));
        }
    }
    geometry = geometry_clip_to_condensation_base(
        geometry, sample_position);
    var family_gain = 1.0;
    if (genus == 2) { family_gain = 1.90; }
    if (genus == 7) { family_gain = 1.08; }
    let material = condensation_material_density(
        geometry, sample_position, h, layer.shape.w,
        select(1.08, 0.96, genus == 2),
        mix(0.88, 1.22, smoothstep(0.10, 0.86, h)),
        vec4<f32>(0.48, 0.16, 0.048, select(0.12, 0.075, genus == 2)),
        feature.variation, index,
    ) * moisture * feature.shape.w;
    return saturate(material * family_gain);
}

// Floccus is a set of detached eroding tufts, never a shared cloud base.
// Concave entrainment bites form ragged undersides.  Only some sufficiently
// glaciated tufts grow narrow, wind-sheared virga, matching its intermittent
// occurrence in observations rather than stamping a tail beneath every tuft.
fn cellular_floccus_owner(
    local: vec2<f32>, h: f32, layer: Layer, index: i32, genus: i32,
    feature: CloudFeature, moisture: f32,
) -> f32 {
    let depth = max(0.08, layer.geometry.y);
    let element_radius = feature.axis_extent.w;
    let member_count = i32(clamp(round(feature.extra0.x), 4.0, 7.0));
    var density = 0.0;
    for (var member = 0; member < 7; member++) {
        if (member >= member_count) { continue; }
        let mf = f32(member);
        let member_seed = morphology_hash2(
            feature.variation.xy + vec2<f32>(mf * 5.91, -mf * 8.31),
            feature.variation.z + mf * 3.73,
        );
        let angle = mf * 2.39996323 + feature.variation.w * PI * 2.0 +
            (member_seed.x - 0.5) * 0.84;
        let radial = sqrt(fract(mf * 0.61803398875 + member_seed.y * 0.51));
        let member_center = vec2<f32>(cos(angle), sin(angle)) *
            feature.axis_extent.z * radial * 0.72;
        let size = element_radius * mix(0.64, 1.16, member_seed.x);
        let tuft_height = depth * feature.shape.x *
            mix(0.56, 0.92, member_seed.y);
        let base_lift = depth * mix(0.12, 0.28, member_seed.x);
        let member_sample = vec3<f32>(
            local - member_center, h * depth - base_lift);
        var geometry = geometry_ellipsoid(
            member_sample,
            vec3<f32>(0.0, 0.0, tuft_height * 0.49),
            vec3<f32>(size * 0.58, size * 0.49, tuft_height * 0.36),
        );
        for (var lobe_index = 0; lobe_index < 3; lobe_index++) {
            let lf = f32(lobe_index);
            let lobe_seed = morphology_hash2(
                member_seed + vec2<f32>(lf * 7.2, -lf * 3.9),
                feature.extra2.y + lf * 9.0,
            );
            let lobe = geometry_ellipsoid(
                member_sample,
                vec3<f32>((lf - 1.0) * size * 0.31,
                    (lobe_seed.x - 0.5) * size * 0.38,
                    tuft_height * mix(0.48, 0.75, lobe_seed.y)),
                vec3<f32>(size * mix(0.31, 0.48, lobe_seed.x),
                    size * mix(0.29, 0.44, lobe_seed.y),
                    tuft_height * mix(0.18, 0.27, lobe_seed.x)),
            );
            geometry = geometry_smooth_union(
                geometry, lobe, max(0.008, size * 0.04));
        }
        let dry_notch = geometry_ellipsoid(
            member_sample,
            vec3<f32>(size * mix(-0.38, 0.38, member_seed.x),
                size * mix(-0.28, 0.28, member_seed.y), tuft_height * 0.18),
            vec3<f32>(size * 0.32, size * 0.27, tuft_height * 0.24),
        );
        geometry = geometry_subtract(geometry, dry_notch);
        let virga_probability = feature.extra1.y * 0.30 +
            feature.extra2.x * 0.20 + select(0.0, 0.08, genus == 2);
        if (member_seed.y < virga_probability) {
            let virga_start = vec3<f32>(
                size * (member_seed.x - 0.5) * 0.28,
                size * (member_seed.y - 0.5) * 0.22,
                tuft_height * 0.22);
            let shear = vec2<f32>(0.20, -0.12) * size *
                mix(0.6, 1.2, feature.extra0.w);
            let virga_finish = vec3<f32>(
                virga_start.xy + shear,
                max(-base_lift * 0.82, tuft_height * -0.18));
            let virga = geometry_capsule(
                member_sample, virga_start, virga_finish,
                max(0.012, size * select(0.055, 0.085, genus == 7)));
            geometry = geometry_smooth_union(
                geometry, virga, max(0.006, size * 0.022));
        }
        var family_gain = 0.94;
        if (genus == 2) { family_gain = 2.15; }
        if (genus == 7) { family_gain = 1.02; }
        let material = condensation_material_density(
            geometry, member_sample, h, layer.shape.w,
            1.16, mix(0.92, 1.20, smoothstep(0.10, 0.86, h)),
            vec4<f32>(0.49, 0.17, 0.052,
                select(0.15, 0.10, genus == 2)),
            vec4<f32>(member_seed, feature.variation.zw), index,
        ) * moisture * feature.shape.w * family_gain;
        density = 1.0 - (1.0 - density) * (1.0 - saturate(material));
    }
    return saturate(density);
}

// A bounded population of feature-owned cellular systems.  Each species is
// dispatched to an observationally distinct owner topology; production no
// longer builds every cellular cloud from the same eight-member colony.
fn cellular_feature_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    genus: i32, organization: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, detail_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    let depth = max(0.08, layer.geometry.y);
    let system_moisture = select(
        formation_potential,
        max(formation_potential, editorial.x * 0.88),
        editorial.y > 0.5,
    );
    let moisture = smoothstep(0.055, 0.34,
        system_moisture * 0.52 + layer.geometry.z * 0.48);
    var density = 0.0;

    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 4) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) {
            continue;
        }
        let colony_axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        let colony_cross = vec2<f32>(-colony_axis.y, colony_axis.x);
        let local = vec2<f32>(
            dot(raw_local, colony_axis), dot(raw_local, colony_cross));
        var owner_density = 0.0;
        if (species == 4) {
            owner_density = cirrocumulus_stratiformis_owner(
                local, h, layer, index, feature, moisture);
        } else if (species == 8) {
            owner_density = altocumulus_stratiformis_owner(
                local, h, layer, index, feature, moisture);
        } else if (species == 13) {
            owner_density = stratocumulus_stratiformis_owner(
                local, h, layer, index, feature, moisture);
        } else if (species == 5 || species == 10 || species == 29) {
            owner_density = cellular_castellanus_owner(
                local, h, layer, index, genus, feature, moisture);
        } else if (species == 25 || species == 26 || species == 30) {
            owner_density = cellular_floccus_owner(
                local, h, layer, index, genus, feature, moisture);
        }
        density = 1.0 - (1.0 - density) *
            (1.0 - saturate(owner_density));
    }
    return saturate(density);
}

// Cirro/alto/stratocumulus share cellular organization but not scale or
// optical depth. Irregularly jittered cell centres and size classes eliminate
// the implicit square lattice; each element has a flat condensation base and a
// resolved shallow dome. Open-cell organization swaps centres for cloudy walls.
fn cellular_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    genus: i32, organization: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, detail_sample: vec4<f32>,
    weather_curl: vec2<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    if (species == 9 || species == 24 || species == 28) {
        return lenticular_morphology(position, h, layer, index,
            formation_potential, editorial, base_sample, seed);
    }
    if (species == 14 || species == 27) {
        return volutus_morphology(position, h, layer, index,
            formation_potential, base_sample, seed);
    }
    // Physical organization scale in kilometres. Cirrocumulus is fine and
    // nearly unshaded, altocumulus occupies the middle range, and marine
    // stratocumulus cells/rolls are several kilometres across. Treating Sc as
    // the finest family was the principal source of the large-scale grid.
    var spacing = mix(1.15, 2.35, layer.geometry.z);
    if (genus == 2) { spacing = mix(0.28, 0.62, layer.geometry.z); }
    if (genus == 7) {
        // A nearby marine deck is resolved as many sub-kilometre to kilometre
        // elements, not a few multi-kilometre domes. Mesoscale organization
        // still comes from correlated births and circulation mode.
        spacing = mix(0.62, 1.55, layer.geometry.z);
    }
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
    var domain = vec2<f32>(dot(position, wind_axis), dot(position, cross_axis));
    domain += (weather_curl - 0.5) * spacing * 1.35;
    if (organization == 2) {
        // Streets organize cloud owners into bands; they do not stretch each
        // individual castellanus tower into a long lenticular bar.
        let castellanus_species =
            species == 5 || species == 10 || species == 29;
        domain.x *= select(0.48, 0.78, castellanus_species);
        domain.y *= select(1.36, 1.10, castellanus_species);
    }
    let grid_position = domain / spacing;
    let base_cell = floor(grid_position);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.72 + formation_potential * 0.28),
        editorial.y > 0.5,
    );
    let activation = saturate(system_potential * 0.82 + layer.geometry.z * 0.66 - 0.14);
    var density = 0.0;
    var nearest_distance = 1000.0;
    var second_distance = 1000.0;
    var nearest_vector = vec2<f32>(1000.0);
    var second_vector = vec2<f32>(1000.0);

    for (var cell_y = -1; cell_y <= 1; cell_y++) {
        for (var cell_x = -1; cell_x <= 1; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.y + f32(genus) * 7.7);
            // One regular owner per square remains visible as rows near the
            // horizon even with ordinary cell jitter. A correlated three-cell
            // displacement creates real mesoscale colonies and voids while the
            // local independent offset keeps neighbouring cloudlets irregular.
            // This remains a world-space population; no screen mask or camera
            // dependent deletion is involved.
            let cluster_cell = floor(
                (cell + vec2<f32>(13.0, -7.0)) / 3.0);
            let cluster_jitter = morphology_hash2(
                cluster_cell, seed.x + f32(genus) * 11.3);
            let row_stagger = fract(cell.y * 0.5) * spacing;
            let candidate = (cell + vec2<f32>(0.5)) * spacing +
                vec2<f32>(row_stagger, 0.0) +
                (jitter - vec2<f32>(0.5)) * spacing * 1.18 +
                (cluster_jitter - vec2<f32>(0.5)) * spacing * 0.48;
            let local = domain - candidate;
            let size_seed = hash31(vec3<f32>(cell, seed.z + 23.0));
            let cluster_scale = mix(0.72, 1.34,
                hash31(vec3<f32>(cluster_cell, seed.w + 17.0)));
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.w + 31.0));
            // Birth is correlated over several ownership cells. Applying a
            // continuous screen/world mask after density exists merely makes
            // regular clouds paler; selecting which buoyant parcels can form
            // creates actual colonies and clear mesoscale voids instead. The
            // independent component prevents broad noise from becoming a new
            // visible checkerboard at colony boundaries.
            let colony_field = noise2(
                cell * 0.19 + seed.xy * 13.7 + vec2<f32>(f32(genus) * 2.9));
            let birth_rank = mix(birth_seed, colony_field, 0.56);
            let owner_position = wind_axis * candidate.x +
                cross_axis * candidate.y;
            var owner_activation = activation;
            var circulation_active = 1.0;
            if (editorial.y > 0.5) {
                // Evaluate the mesoscale system once at the owner, not at the
                // current density sample. Whole cloudlets/circulation cells
                // are born or absent; no outer population field can fade an
                // already formed cloud into a recognizable mask boundary.
                let owner_editorial = cloud_editorial_population(
                    owner_position, layer, index,
                    vec3<f32>(jitter, size_seed),
                );
                owner_activation = saturate(
                    owner_editorial.x * 0.82 +
                    layer.geometry.z * 0.66 - 0.14);
                if (species == 4 || species == 8 || species == 13) {
                    owner_activation = min(
                        owner_activation,
                        mix(0.64, 0.82, layer.geometry.z),
                    );
                }
                circulation_active = smoothstep(
                    0.06, 0.24, owner_editorial.x);
            }
            let cell_active = 1.0 - smoothstep(
                owner_activation - 0.075,
                owner_activation + 0.075,
                birth_rank,
            );
            // Open-cell boundaries belong to the circulation tessellation,
            // including cells whose cloudy centre is inactive. Excluding
            // inactive owners makes giant square voids and discontinuous
            // walls rather than a connected polygonal network.
            if (circulation_active > 0.001) {
                let physical_distance = length(local);
                if (physical_distance < nearest_distance) {
                    second_distance = nearest_distance;
                    second_vector = nearest_vector;
                    nearest_distance = physical_distance;
                    nearest_vector = local;
                } else if (physical_distance < second_distance) {
                    second_distance = physical_distance;
                    second_vector = local;
                }
            }
            if (cell_active <= 0.001 && organization != 3) { continue; }
            var radius = spacing * mix(0.14, 0.48, pow(size_seed, 0.72)) *
                cluster_scale;
            if (genus == 4) {
                radius *= mix(0.92, 1.14, layer.geometry.z);
            }
            if (genus == 7) {
                // High-cover stratocumulus is a connected field of merged
                // convective rolls; sparse cover retains distinct large cells.
                radius = min(
                    spacing * mix(0.22, 0.34, size_seed) *
                        mix(0.94, 1.08, layer.geometry.z),
                    1.05,
                );
            }
            let shape_seed = hash31(vec3<f32>(cell + vec2<f32>(17.0, -9.0), seed.x));
            let shape_angle = shape_seed * PI * 2.0;
            let shape_axis = vec2<f32>(cos(shape_angle), sin(shape_angle));
            let shape_cross = vec2<f32>(-shape_axis.y, shape_axis.x);
            var aspect = mix(0.58, 1.62,
                hash31(vec3<f32>(cell.yx, seed.y + 43.0)));
            if (genus == 7) {
                aspect = mix(0.82, 1.24,
                    hash31(vec3<f32>(cell.yx, seed.y + 43.0)));
            }
            if (species == 5 || species == 10 || species == 29) {
                aspect = mix(0.86, 1.16, shape_seed);
            }
            let shaped_local = vec2<f32>(
                dot(local, shape_axis) / aspect,
                dot(local, shape_cross) * aspect,
            );
            var top = mix(0.34, 0.62, size_seed);
            if (genus == 2) { top = mix(0.26, 0.46, size_seed); }
            if (genus == 7) { top = mix(0.34, 0.58, size_seed); }
            let castellanus = species == 5 || species == 10 || species == 29;
            let floccus = species == 25 || species == 26 || species == 30;
            let stratiformis = species == 4 || species == 8 || species == 13;
            if (stratiformis) {
                // Stratiformis is an extensive population of shallow elements,
                // not a uniform set of tiny cumulus. It retains individual
                // cloudlets while preferentially growing broad, low parcels
                // that can merge inside the correlated colonies above.
                radius *= mix(1.05, 1.34, size_seed);
                top *= mix(0.68, 0.86, shape_seed);
            }
            if (castellanus) {
                top = mix(0.7, 0.94, size_seed);
            }
            if (floccus) { top = mix(0.58, 0.84, size_seed); }
            let depth = max(0.08, layer.geometry.y);
            // A cloud layer has a common altitude regime, not a mathematically
            // perfect plane. Correlated lifting-level variation breaks the
            // distant screen-space rows produced by identical cloudlet bases
            // while retaining one physically plausible condensation surface.
            let base_lift_seed = hash31(vec3<f32>(
                cluster_cell + vec2<f32>(5.0, -11.0), seed.z + 67.0));
            let local_base_seed = hash31(vec3<f32>(
                cell + vec2<f32>(-3.0, 19.0), seed.x + 73.0));
            let base_lift = depth * (1.0 - top) *
                (base_lift_seed * 0.11 + (local_base_seed - 0.5) * 0.035);
            let z = h * depth - max(0.0, base_lift);
            let top_km = max(0.035, top * depth);
            let primary_radius = select(radius, radius * 0.72,
                genus == 4 || genus == 7);

            // Resolved cloudlets are one connected signed-distance body. The
            // former max of scalar domes preserved every analytic oval in the
            // silhouette. A shallow basal parcel and several tightly blended
            // buoyant parcels now define only physical topology; the shared
            // condensation material below owns the visible vapour boundary.
            var primary_center = top_km * select(0.40, 0.54, floccus);
            var primary_vertical = top_km * select(0.38, 0.30, floccus);
            if (castellanus) {
                primary_center = top_km * 0.22;
                primary_vertical = top_km * 0.20;
            }
            let sample_position = vec3<f32>(shaped_local, z);
            var geometry = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, primary_center),
                vec3<f32>(
                    primary_radius,
                    primary_radius * mix(0.76, 1.04, shape_seed),
                    primary_vertical,
                ),
            );
            if (stratiformis) {
                // Layer cloudlets are shallow convective caps rooted at one
                // lifting-condensation surface. An ellipsoid leaves a smooth
                // oval silhouette even after erosion; the signed cap provides
                // a broad, slightly asymmetric top and a genuinely flat base.
                geometry = geometry_shallow_cap(
                    sample_position,
                    primary_radius * mix(0.68, 0.86, shape_seed),
                    top_km * mix(0.66, 0.84, size_seed),
                );
                let cap_offset_a = vec2<f32>(
                    primary_radius * mix(0.38, 0.62, shape_seed),
                    primary_radius * (size_seed - 0.5) * 0.66,
                );
                let cap_a = geometry_shallow_cap(
                    vec3<f32>(sample_position.xy - cap_offset_a,
                        sample_position.z),
                    primary_radius * mix(0.52, 0.76, size_seed),
                    top_km * mix(0.52, 0.80, shape_seed),
                );
                let cap_offset_b = vec2<f32>(
                    -primary_radius * mix(0.30, 0.54, size_seed),
                    primary_radius * (shape_seed - 0.5) * 0.72,
                );
                let cap_b = geometry_shallow_cap(
                    vec3<f32>(sample_position.xy - cap_offset_b,
                        sample_position.z),
                    primary_radius * mix(0.48, 0.70, shape_seed),
                    top_km * mix(0.46, 0.74, size_seed),
                );
                geometry = geometry_smooth_union(
                    geometry, cap_a, primary_radius * 0.055);
                geometry = geometry_smooth_union(
                    geometry, cap_b, primary_radius * 0.045);
                geometry = geometry_clip_to_condensation_base(
                    geometry, sample_position);
            }
            if (!floccus && !stratiformis) {
                let base_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(0.0, 0.0, top_km * 0.13),
                    vec3<f32>(
                        radius * 0.82,
                        radius * mix(0.62, 0.82, shape_seed),
                        max(0.025, top_km * 0.15),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry, base_geometry, radius * 0.11);
            }
            if (!stratiformis) {
                let secondary_offset = vec2<f32>(
                    radius * mix(0.24, 0.48, shape_seed),
                    radius * (shape_seed - 0.5) * 0.34,
                );
                let secondary_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(
                        secondary_offset,
                        top_km * select(
                            mix(0.52, 0.66, shape_seed), 0.60, castellanus),
                    ),
                    vec3<f32>(
                        radius * select(mix(0.38, 0.58, size_seed), 0.25, castellanus),
                        radius * select(mix(0.32, 0.52, shape_seed), 0.22, castellanus),
                        top_km * select(mix(0.20, 0.29, size_seed), 0.27, castellanus),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry,
                    secondary_geometry,
                    radius * select(select(0.13, 0.065, castellanus), 0.07, floccus),
                );
                let tertiary_offset = vec2<f32>(
                    -radius * mix(0.22, 0.44, size_seed),
                    radius * (size_seed - 0.5) * 0.40,
                );
                let tertiary_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(
                        tertiary_offset,
                        top_km * select(
                            mix(0.46, 0.60, size_seed), 0.56, castellanus),
                    ),
                    vec3<f32>(
                        radius * select(mix(0.31, 0.49, shape_seed), 0.23, castellanus),
                        radius * select(mix(0.28, 0.45, size_seed), 0.20, castellanus),
                        top_km * select(mix(0.17, 0.26, shape_seed), 0.24, castellanus),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry,
                    tertiary_geometry,
                    radius * select(select(0.11, 0.06, castellanus), 0.055, floccus),
                );
            }
            if (castellanus) {
                // Castellanus is a crenellated common bank: several adjacent
                // buoyant towers grow from one mid/low-level base. One turret
                // on an elongated cloudlet read as an ordinary oval with a
                // bump, especially in cloud-street perspective.
                for (var turret_index = 0; turret_index < 3; turret_index++) {
                    let tf = f32(turret_index);
                    let turret_seed = morphology_hash2(
                        cell + vec2<f32>(tf * 9.0 + 7.0, tf * -13.0),
                        seed.x + 97.0,
                    );
                    let turret_offset = vec2<f32>(
                        (tf - 1.0) * radius * 0.42,
                        radius * (turret_seed.x - 0.5) * 0.24,
                    );
                    let turret = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            turret_offset,
                            top_km * mix(0.64, 0.80, turret_seed.y),
                        ),
                        vec3<f32>(
                            radius * mix(0.20, 0.29, turret_seed.x),
                            radius * mix(0.18, 0.27, turret_seed.y),
                            top_km * mix(0.22, 0.31, turret_seed.x),
                        ),
                    );
                    geometry = geometry_smooth_union(
                        geometry, turret, radius * 0.075);
                }
            }
            if (!floccus) {
                // A shared lifting-condensation level is the defining base of
                // Ac/Sc cloudlets. Floccus intentionally retains a ragged,
                // detached underside instead.
                geometry = geometry_clip_to_condensation_base(
                    geometry, sample_position);
            }
            if (organization != 3) {
                var boundary_scale = 0.90;
                if (genus == 2) { boundary_scale = 1.06; }
                if (genus == 7) { boundary_scale = 1.14; }
                if (castellanus) { boundary_scale *= 1.12; }
                if (floccus) { boundary_scale *= 1.30; }
                let maturity_relief = mix(0.78, 1.18,
                    smoothstep(top * 0.16, top * 0.92, h));
                let owner_seed = vec4<f32>(
                    jitter, size_seed, birth_seed);
                let cloudlet = condensation_material_density(
                    geometry, sample_position, h, layer.shape.w,
                    boundary_scale, maturity_relief,
                    vec4<f32>(
                        0.52, 0.19, 0.065,
                        select(0.14, 0.22, castellanus || floccus),
                    ),
                    owner_seed, index,
                ) * cell_active;
                density = max(density, cloudlet);
            }
        }
    }
    if (organization == 3 && second_distance < 999.0) {
        // Open cellular convection is a shared cloudy Voronoi boundary around
        // clear sinking air. Independent annuli read as flying saucers in
        // perspective; the signed F2-F1 wall is a connected physical network
        // with a material boundary rather than a post-density fade mask.
        var wall_top = 0.56;
        if (genus == 2) { wall_top = 0.42; }
        if (genus == 7) { wall_top = 0.64; }
        let wall_width = spacing * mix(0.045, 0.075, layer.geometry.z);
        let wall_sample_position = vec3<f32>(
            domain, h * max(0.08, layer.geometry.y));
        let wall_geometry = geometry_open_cell_wall(
            wall_sample_position,
            nearest_vector,
            second_vector,
            wall_width,
            wall_top * max(0.08, layer.geometry.y),
        );
        let wall_seed = vec4<f32>(
            hash31(vec3<f32>(nearest_vector, seed.x + 83.0)),
            hash31(vec3<f32>(second_vector, seed.y + 89.0)),
            seed.zw,
        );
        density = condensation_material_density(
            wall_geometry, wall_sample_position, h, layer.shape.w,
            1.08, 0.92,
            vec4<f32>(0.35, 0.12, 0.045, 0.18),
            wall_seed, index,
        );
    }
    // Do not fill high-cover stratocumulus with a separate horizontal slab.
    // The slab projected as a dark ruler-straight strip under the resolved
    // field. Closed decks now become continuous only when neighbouring real
    // cloudlets overlap, preserving holes and an irregular shared base.
    var genus_density = 0.86;
    if (genus == 2) { genus_density = 0.54; }
    if (genus == 4) { genus_density = 0.72; }
    return saturate(density * genus_density);
}

// Cirrus is a population of finite, sheared ice streamers with fallstreaks.
// The fibres are analytic elongated volumes; noise only breaks and feathers
// them, avoiding both painted ribbons and isotropic cotton noise.
fn cirrus_morphology(
    position: vec2<f32>, h: f32, layer: Layer,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, weather_curl: vec2<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
    let compact_tuft = species == 22 || species == 23;
    var population_position = position;
    if (compact_tuft && i32(round(p[28].y)) == 3) {
        // Editorial framing selects a real world-space owner along the camera
        // centre ray; it does not warp or mask the cloud after projection.
        // This prevents a valid sparse 3-okta state from missing an entire
        // narrow/overhead frame while keeping all perspective cues physical.
        let center_direction = view_direction(vec2<f32>(0.5)).xz;
        let horizontal_direction = normalize(
            center_direction + vec2<f32>(0.0001));
        let center_elevation = max(0.12, p[4].y);
        let center_range = (layer.geometry.x + layer.geometry.y * 0.52 -
            p[19].w) / max(0.12, tan(center_elevation));
        population_position -= horizontal_direction * center_range;
    }
    let domain = vec2<f32>(
        dot(population_position, wind_axis),
        dot(population_position, cross_axis)) +
        (weather_curl - 0.5) * vec2<f32>(2.4, 4.2);
    // A photographic field of view must contain several independently born
    // streamers. Sixteen-kilometre ownership cells looked acceptable only in
    // the full dome and routinely left a 40-70 degree camera crop empty.
    // Fibre bundles are synoptic-scale strokes; compact castellanus/floccus
    // tufts occupy a much denser high-cloud population. Sharing the streamer
    // spacing left less than one tuft in an ordinary overhead camera frustum.
    var spacing = 16.5;
    if (compact_tuft) { spacing = 3.7; }
    let grid_position = domain / spacing;
    let base_cell = floor(grid_position);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.74 + formation_potential * 0.26),
        editorial.y > 0.5,
    );
    let activation = saturate(system_potential * 0.86 + layer.geometry.z * 0.62 - 0.12);
    var density = 0.0;
    for (var cell_y = -1; cell_y <= 1; cell_y++) {
        for (var cell_x = -1; cell_x <= 1; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.x + 41.0);
            let candidate = (cell + mix(vec2<f32>(0.08), vec2<f32>(0.92), jitter)) * spacing;
            let raw_local = domain - candidate;
            let length_seed = hash31(vec3<f32>(cell, seed.z + 47.0));
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.w + 59.0));
            let cell_active = 1.0 - smoothstep(
                activation - 0.1, activation + 0.1, birth_seed);
            if (cell_active <= 0.001) { continue; }
            var family_style = fract(
                layer.organization.y * 0.73 + length_seed * 0.61 + seed.w * 0.37);
            if (species == 1) { family_style = mix(0.06, 0.24, length_seed); }
            if (species == 2) { family_style = mix(0.46, 0.68, length_seed); }
            if (species == 3) { family_style = mix(0.84, 0.98, length_seed); }
            if (species == 22) { family_style = mix(0.58, 0.74, length_seed); }
            if (species == 23) { family_style = mix(0.72, 0.9, length_seed); }
            let fibre_angle = (hash31(vec3<f32>(cell, seed.x + 83.0)) - 0.5) *
                mix(0.48, 1.45, family_style);
            let angle_cos = cos(fibre_angle);
            let angle_sin = sin(fibre_angle);
            let local = vec2<f32>(
                raw_local.x * angle_cos - raw_local.y * angle_sin,
                raw_local.x * angle_sin + raw_local.y * angle_cos,
            );
            var half_length = mix(2.8, 7.4, length_seed) *
                mix(0.78, 1.18, smoothstep(0.18, 0.72, family_style));
            if (species == 2) {
                // Uncinus is a compact hook with a long crystal fallstreak,
                // not a fibratus strand with a small bulb glued to one end.
                half_length *= mix(0.34, 0.52, length_seed);
            }
            var strand_count = 1 + i32(floor(jitter.x * 3.0));
            if (species == 2) { strand_count = 1 + i32(jitter.x > 0.72); }
            for (var strand = 0; strand < 4; strand++) {
                if (strand >= strand_count) { continue; }
                let strand_value = f32(strand);
                let strand_seed = hash31(vec3<f32>(
                    cell + vec2<f32>(strand_value * 7.1), seed.y + 71.0));
                let strand_width = mix(0.035, 0.15, strand_seed) *
                    mix(0.78, 1.45, smoothstep(0.70, 0.94, family_style));
                let centred_strand = strand_value - f32(strand_count - 1) * 0.5;
                let across_offset = centred_strand *
                    mix(0.12, 0.46, jitter.y) + (strand_seed - 0.5) * 0.28;
                let along_offset = (strand_seed - 0.5) * half_length * 0.28;
                let center_h = mix(0.28, 0.72,
                    fract(strand_seed * 3.17 + jitter.x));
                let half_height = mix(0.055, 0.145,
                    fract(strand_seed * 5.31 + jitter.y));
                let strand_along = local.x + along_offset;
                let fallstreak = (center_h - h) *
                    mix(0.42, 2.1, layer.motion.z + layer.motion.w);
                let normalized_along = strand_along / max(0.2, half_length);
                let fan = centred_strand * normalized_along *
                    mix(0.04, 0.28, jitter.x);
                let waviness = sin(normalized_along * PI *
                    mix(0.75, 1.8, strand_seed) + jitter.y * PI * 2.0) *
                    mix(0.035, 0.22, layer.motion.w);
                let hook = smoothstep(-0.92, -0.42, normalized_along) *
                    (1.0 - smoothstep(-0.42, 0.06, normalized_along)) *
                    mix(0.06, 0.72, smoothstep(0.32, 0.68, family_style));
                let hooked_across = local.y - across_offset + fallstreak +
                    normalized_along * normalized_along *
                        (jitter.x - 0.5) * 1.7 + fan + waviness + hook;
                let along_taper = 1.0 - smoothstep(
                    half_length * 0.48, half_length, abs(strand_along));
                let across_taper = 1.0 - smoothstep(
                    strand_width * 0.28, strand_width, abs(hooked_across));
                let vertical = 1.0 - smoothstep(
                    half_height * 0.45, half_height, abs(h - center_h));
                let breakup = mix(0.44, 1.0, smoothstep(0.34, 0.76,
                    base_sample.r * 0.42 + base_sample.g * 0.34 +
                    base_sample.b * 0.24 + (strand_seed - 0.5) * 0.16));
                let fibre = along_taper * across_taper * vertical *
                    breakup * cell_active;
                // Uncinus carries a compact hook/head feeding a long falling
                // tail; spissatus contributes a denser, irregular ice patch.
                let head_center = vec2<f32>(
                    -half_length * mix(0.52, 0.72, strand_seed),
                    across_offset - fallstreak * 0.28,
                );
                let head_delta = vec3<f32>(
                    (local.x - head_center.x) / mix(0.72, 1.8, strand_seed),
                    (local.y - head_center.y) / mix(0.12, 0.34, strand_seed),
                    (h - center_h) / mix(0.04, 0.09, strand_seed),
                );
                var head_ownership = select(0.0,
                    smoothstep(0.28, 0.58, length_seed), strand == 0);
                if (species == 22) { head_ownership = 1.0; }
                let uncinus_head = (1.0 - smoothstep(0.68, 1.08,
                    dot(head_delta, head_delta))) *
                    smoothstep(0.28, 0.68, family_style) *
                    (1.0 - smoothstep(0.82, 0.98, family_style)) *
                    head_ownership * cell_active;
                let patch_delta = vec3<f32>(
                    local.x / max(0.3, half_length * 0.46),
                    local.y / mix(0.72, 1.65, strand_seed),
                    (h - center_h) / mix(0.10, 0.21, strand_seed),
                );
                let spissatus_patch = (1.0 - smoothstep(0.54, 1.12,
                    dot(patch_delta, patch_delta))) *
                    smoothstep(0.78, 0.94, family_style) * breakup *
                    cell_active * 0.72;
                density = max(density,
                    max(fibre, max(uncinus_head, spissatus_patch)));
            }
        }
    }
    return saturate(density * mix(0.78, 1.08,
        smoothstep(0.64, 0.94, layer.geometry.z)));
}

// Fiber-bundle successor to the scalar cirrus path above. Every bundle owns
// one connected signed geometry assembled from related fallstreak strands and,
// where appropriate, a single head or dense patch. The shared ice material is
// evaluated once on that geometry, so broad heads cannot survive without their
// tails and analytic tubes cannot become the final visible boundary.
fn cirrus_bundle_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, weather_curl: vec2<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
    let compact_tuft = species == 22 || species == 23;
    var population_position = position;
    if (compact_tuft && i32(round(p[28].y)) == 3) {
        // Editorial framing selects a real world-space owner along the camera
        // centre ray; it does not warp or mask the cloud after projection.
        let center_direction = view_direction(vec2<f32>(0.5)).xz;
        let horizontal_direction = normalize(
            center_direction + vec2<f32>(0.0001));
        let center_elevation = max(0.12, p[4].y);
        let center_range = (layer.geometry.x + layer.geometry.y * 0.52 -
            p[19].w) / max(0.12, tan(center_elevation));
        population_position -= horizontal_direction * center_range;
    }
    let domain = vec2<f32>(
        dot(population_position, wind_axis),
        dot(population_position, cross_axis)) +
        (weather_curl - 0.5) * vec2<f32>(2.4, 4.2);
    var spacing = 11.5;
    if (compact_tuft) { spacing = 3.7; }
    let base_cell = floor(domain / spacing);
    let system_potential = select(
        formation_potential,
        saturate(editorial.x * 0.74 + formation_potential * 0.26),
        editorial.y > 0.5,
    );
    let activation = saturate(
        system_potential * 0.86 + layer.geometry.z * 0.62 - 0.12);
    let depth = layer.geometry.y;
    var density = 0.0;

    for (var cell_y = -1; cell_y <= 1; cell_y++) {
        for (var cell_x = -1; cell_x <= 1; cell_x++) {
            let cell = base_cell + vec2<f32>(f32(cell_x), f32(cell_y));
            let jitter = morphology_hash2(cell, seed.x + 41.0);
            var candidate = (cell + mix(
                vec2<f32>(0.08), vec2<f32>(0.92), jitter)) * spacing;
            let graphic_primary_tuft = compact_tuft &&
                i32(round(p[28].y)) == 3 &&
                abs(cell.x) < 0.5 && abs(cell.y) < 0.5;
            if (graphic_primary_tuft) { candidate = vec2<f32>(0.0); }
            let raw_local = domain - candidate;
            let length_seed = hash31(vec3<f32>(cell, seed.z + 47.0));
            let birth_seed = hash31(vec3<f32>(cell.yx, seed.w + 59.0));
            var cell_active = 1.0 - smoothstep(
                activation - 0.1, activation + 0.1, birth_seed);
            if (compact_tuft) {
                // Sparse tuft species must not depend on nine independent
                // random births: at high camera elevation a whole view could
                // otherwise contain no owner at all. One owner in every 2x2
                // super-cell is the physically sparse population scaffold;
                // humidity/lifecycle still suppresses its material and the
                // remaining owners retain stochastic birth.
                let guaranteed_tuft_owner =
                    abs(i32(cell.x)) % 2 == 0 &&
                    abs(i32(cell.y)) % 2 == 0;
                let tuft_population = 1.0 - smoothstep(
                    mix(0.30, 0.46, layer.geometry.z),
                    mix(0.46, 0.62, layer.geometry.z),
                    birth_seed,
                );
                cell_active = max(
                    cell_active,
                    tuft_population * smoothstep(
                        0.12, 0.34, layer.geometry.z),
                );
                if (guaranteed_tuft_owner) {
                    cell_active = max(cell_active,
                        smoothstep(0.08, 0.28, layer.geometry.z));
                }
                if (graphic_primary_tuft) { cell_active = 1.0; }
            }
            if (cell_active <= 0.001) { continue; }

            var family_style = fract(
                layer.organization.y * 0.73 + length_seed * 0.61 +
                seed.w * 0.37);
            if (species == 1) { family_style = mix(0.06, 0.24, length_seed); }
            if (species == 2) { family_style = mix(0.46, 0.68, length_seed); }
            if (species == 3) { family_style = mix(0.84, 0.98, length_seed); }
            if (species == 22) { family_style = mix(0.58, 0.74, length_seed); }
            if (species == 23) { family_style = mix(0.72, 0.9, length_seed); }
            let fibre_angle = (hash31(vec3<f32>(
                cell, seed.x + 83.0)) - 0.5) * mix(0.48, 1.45, family_style);
            let angle_cos = cos(fibre_angle);
            let angle_sin = sin(fibre_angle);
            let local = vec2<f32>(
                raw_local.x * angle_cos - raw_local.y * angle_sin,
                raw_local.x * angle_sin + raw_local.y * angle_cos,
            );
            let half_length = mix(4.2, 11.5, length_seed) *
                mix(0.78, 1.18, smoothstep(0.18, 0.72, family_style));
            let strand_count = 2 + i32(floor(jitter.x * 3.0));
            let sample_position = vec3<f32>(local, h * depth);

            if (compact_tuft) {
                // Cirrus castellanus and floccus are tuft populations, not
                // long-streamer style variants. Their high-altitude ice still
                // shares the same material, but macro topology is compact:
                // castellated turrets grow from a short common base, while a
                // floccus head owns one descending virga-like tail.
                let tuft_radius = mix(0.62, 1.55, length_seed);
                let tuft_center_h = depth * mix(0.43, 0.68,
                    fract(jitter.x * 0.63 + jitter.y * 0.91));
                var tuft_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(0.0, 0.0, tuft_center_h),
                    vec3<f32>(
                        tuft_radius,
                        tuft_radius * mix(0.58, 0.86, jitter.y),
                        depth * mix(0.24, 0.34, jitter.x),
                    ),
                );
                if (species == 22) {
                    for (var turret_index = 0; turret_index < 3; turret_index++) {
                        let tf = f32(turret_index);
                        let turret_seed = morphology_hash2(
                            cell + vec2<f32>(tf * 11.0 + 3.0, tf * -7.0),
                            seed.y + 197.0,
                        );
                        let turret = geometry_ellipsoid(
                            sample_position,
                            vec3<f32>(
                                (tf - 1.0) * tuft_radius * 0.56,
                                (turret_seed.x - 0.5) * tuft_radius * 0.34,
                                depth * mix(0.58, 0.76, turret_seed.y),
                            ),
                            vec3<f32>(
                                tuft_radius * mix(0.23, 0.38, turret_seed.x),
                                tuft_radius * mix(0.20, 0.34, turret_seed.y),
                                depth * mix(0.13, 0.22, turret_seed.x),
                            ),
                        );
                        tuft_geometry = geometry_smooth_union(
                            tuft_geometry, turret, tuft_radius * 0.07);
                    }
                } else {
                    // Floccus is a compact glaciated aggregate rather than a
                    // smooth oval. Two attached, offset ice parcels break the
                    // head silhouette; narrow sheared fallstreaks descend from
                    // that same head, so the shape cannot read as a detached
                    // cotton ball plus an unrelated line.
                    // Remove the broad support ellipsoid for floccus. Its
                    // projected underside was the repeated dark lentil seen
                    // in photographs; a compact seed plus several separately
                    // scaled ice parcels produces a ragged aggregate instead.
                    tuft_geometry = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            tuft_radius * (jitter.x - 0.5) * 0.10,
                            tuft_radius * (jitter.y - 0.5) * 0.12,
                            tuft_center_h,
                        ),
                        vec3<f32>(
                            tuft_radius * 0.46,
                            tuft_radius * 0.34,
                            depth * mix(0.17, 0.24, jitter.x),
                        ),
                    );
                    let head_left = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            -tuft_radius * 0.32,
                            tuft_radius * (jitter.y - 0.5) * 0.24,
                            tuft_center_h + depth * mix(-0.045, 0.07, jitter.x),
                        ),
                        vec3<f32>(
                            tuft_radius * mix(0.42, 0.58, jitter.y),
                            tuft_radius * mix(0.34, 0.48, jitter.x),
                            depth * mix(0.18, 0.27, jitter.y),
                        ),
                    );
                    let head_right = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            tuft_radius * 0.28,
                            -tuft_radius * (jitter.x - 0.5) * 0.22,
                            tuft_center_h + depth * mix(-0.03, 0.09, jitter.y),
                        ),
                        vec3<f32>(
                            tuft_radius * mix(0.36, 0.52, jitter.x),
                            tuft_radius * mix(0.30, 0.44, jitter.y),
                            depth * mix(0.17, 0.25, jitter.x),
                        ),
                    );
                    tuft_geometry = geometry_smooth_union(
                        tuft_geometry, head_left, tuft_radius * 0.10);
                    tuft_geometry = geometry_smooth_union(
                        tuft_geometry, head_right, tuft_radius * 0.085);
                    let head_crown = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            tuft_radius * (jitter.y - 0.5) * 0.18,
                            tuft_radius * (jitter.x - 0.5) * 0.20,
                            tuft_center_h + depth * mix(0.12, 0.23, jitter.y),
                        ),
                        vec3<f32>(
                            tuft_radius * mix(0.24, 0.38, jitter.x),
                            tuft_radius * mix(0.20, 0.34, jitter.y),
                            depth * mix(0.10, 0.17, jitter.x),
                        ),
                    );
                    tuft_geometry = geometry_smooth_union(
                        tuft_geometry, head_crown, tuft_radius * 0.06);
                    let tail = geometry_oriented_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            tuft_radius * (jitter.x - 0.5) * 0.42,
                            -tuft_radius * mix(0.16, 0.48, jitter.y),
                            max(depth * 0.16, tuft_center_h - depth * 0.23),
                        ),
                        wind_axis,
                        cross_axis,
                        vec3<f32>(
                            tuft_radius * 0.17,
                            tuft_radius * 0.095,
                            depth * mix(0.24, 0.38, jitter.y),
                        ),
                    );
                    tuft_geometry = geometry_smooth_union(
                        tuft_geometry, tail, tuft_radius * 0.035);
                    let tail_companion = geometry_oriented_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            tuft_radius * (jitter.y - 0.62) * 0.50,
                            -tuft_radius * mix(0.18, 0.54, jitter.x),
                            max(depth * 0.13, tuft_center_h - depth * 0.30),
                        ),
                        wind_axis,
                        cross_axis,
                        vec3<f32>(
                            tuft_radius * 0.13,
                            tuft_radius * 0.065,
                            depth * mix(0.20, 0.34, jitter.x),
                        ),
                    );
                    tuft_geometry = geometry_smooth_union(
                        tuft_geometry, tail_companion, tuft_radius * 0.024);
                }
                let tuft_seed = vec4<f32>(jitter, length_seed, birth_seed);
                let tuft_density = condensation_material_density(
                    tuft_geometry, sample_position, h, layer.shape.w,
                    0.92, 0.86,
                    vec4<f32>(0.88, 0.28, 0.06, 0.14),
                    tuft_seed, index,
                ) * cell_active;
                density = max(density, tuft_density);
                continue;
            }
            var bundle_geometry = make_geometry_sample(1000.0, 0.12, 0.0);
            var bundle_valid = false;
            var bundle_breakup = 0.0;

            for (var strand = 0; strand < 4; strand++) {
                if (strand >= strand_count) { continue; }
                let strand_value = f32(strand);
                let strand_seed = hash31(vec3<f32>(
                    cell + vec2<f32>(strand_value * 7.1), seed.y + 71.0));
                let strand_width = mix(0.055, 0.24, strand_seed) *
                    mix(0.78, 1.45, smoothstep(0.70, 0.94, family_style));
                let centred_strand = strand_value -
                    f32(strand_count - 1) * 0.5;
                let across_offset = centred_strand *
                    mix(0.12, 0.46, jitter.y) + (strand_seed - 0.5) * 0.28;
                let along_offset = (strand_seed - 0.5) * half_length * 0.28;
                let center_h = mix(0.28, 0.72,
                    fract(strand_seed * 3.17 + jitter.x));
                let half_height = mix(0.055, 0.145,
                    fract(strand_seed * 5.31 + jitter.y));
                var fibre_bend = mix(0.42, 1.95,
                    layer.motion.w * 0.62 + family_style * 0.38) *
                    mix(0.72, 1.28, strand_seed);
                var vertical_drop = depth * mix(0.22, 0.88,
                    saturate(layer.motion.z * 0.58 +
                        layer.motion.w * 0.42 + family_style * 0.26));
                if (species == 2) {
                    fibre_bend *= 1.34;
                    vertical_drop = max(
                        vertical_drop, depth * mix(0.62, 1.02, strand_seed));
                }
                let fibre_geometry = geometry_curved_fibre(
                    sample_position,
                    vec3<f32>(
                        -along_offset, across_offset, center_h * depth),
                    half_length, strand_width, half_height * depth,
                    0.0, fibre_bend, vertical_drop,
                    jitter.y * PI * 2.0 + strand_seed * 3.1,
                );
                if (!bundle_valid) {
                    bundle_geometry = fibre_geometry;
                } else {
                    bundle_geometry = geometry_smooth_union(
                        bundle_geometry, fibre_geometry, strand_width * 0.06);
                }
                bundle_valid = true;
                let breakup = mix(0.44, 1.0, smoothstep(0.34, 0.76,
                    base_sample.r * 0.42 + base_sample.g * 0.34 +
                    base_sample.b * 0.24 + (strand_seed - 0.5) * 0.16));
                bundle_breakup = max(bundle_breakup, breakup);

                if (strand == 0 && species == 2) {
                    let head_center = vec3<f32>(
                        -half_length * mix(0.52, 0.72, strand_seed),
                        across_offset + fibre_bend * 0.46,
                        center_h * depth,
                    );
                    let head = geometry_ellipsoid(
                        sample_position, head_center,
                        vec3<f32>(
                            mix(0.72, 1.8, strand_seed),
                            mix(0.12, 0.34, strand_seed),
                            mix(0.04, 0.09, strand_seed) * depth,
                        ),
                    );
                    bundle_geometry = geometry_smooth_union(
                        bundle_geometry, head, strand_width * 0.16);
                    // Uncinus owns a hooked ice head and a resolved descending
                    // fallstreak. A bent horizontal fibre alone still reads as
                    // a contrail, particularly near the horizon.
                    let fallstreak = geometry_ellipsoid(
                        sample_position,
                        head_center - vec3<f32>(
                            -fibre_bend * 0.10,
                            fibre_bend * 0.12,
                            depth * mix(0.16, 0.27, strand_seed),
                        ),
                        vec3<f32>(
                            mix(0.10, 0.24, strand_seed),
                            mix(0.07, 0.18, strand_seed),
                            depth * mix(0.18, 0.31, strand_seed),
                        ),
                    );
                    bundle_geometry = geometry_smooth_union(
                        bundle_geometry, fallstreak, strand_width * 0.055);
                }
                if (strand == 0 && species == 3) {
                    let dense_patch = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(0.0, 0.0, center_h * depth),
                        vec3<f32>(
                            half_length * 0.46,
                            mix(0.72, 1.65, strand_seed),
                            mix(0.10, 0.21, strand_seed) * depth,
                        ),
                    );
                    bundle_geometry = geometry_smooth_union(
                        bundle_geometry, dense_patch, strand_width * 0.20);
                }
            }
            if (!bundle_valid) { continue; }
            let owner_seed = vec4<f32>(
                jitter, length_seed, birth_seed);
            let condensate = condensation_material_density(
                bundle_geometry, sample_position, h, layer.shape.w,
                mix(0.58, 0.86, family_style), 0.84,
                vec4<f32>(0.82, 0.29, 0.09, 0.085), owner_seed, index,
            ) * cell_active * bundle_breakup;
            density = max(density, condensate);
        }
    }
    return saturate(density * mix(0.44, 0.72,
        smoothstep(0.64, 0.94, layer.geometry.z)));
}

// Persistent feature version of the cirrus family. A feature is one physical
// ice-crystal plume with a shared source/head and a related set of sheared
// fibres. It replaces the density-query ownership lattice above: the latter is
// retained temporarily as an implementation reference, but is no longer used
// by production density evaluation.
fn cirrus_feature_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, detail_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    let depth = max(0.08, layer.geometry.y);
    let system_moisture = select(
        formation_potential,
        max(formation_potential, editorial.x * 0.9),
        editorial.y > 0.5,
    );
    let moisture = smoothstep(0.035, 0.31,
        system_moisture * 0.55 + layer.geometry.z * 0.45);
    var density = 0.0;

    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 1) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) {
            continue;
        }
        let plume_axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        let plume_cross = vec2<f32>(-plume_axis.y, plume_axis.x);
        let local = vec2<f32>(
            dot(raw_local, plume_axis), dot(raw_local, plume_cross));
        let sample_position = vec3<f32>(local, h * depth);
        let major = feature.axis_extent.z;
        let spread = feature.axis_extent.w;
        let center_height = feature.shape.x * depth;
        let compact = species == 22 || species == 23;
        var geometry = make_geometry_sample(1000.0, 0.08, 0.0);
        var geometry_valid = false;

        if (compact) {
            // Castellanus/floccus are compact high-ice aggregates. Their
            // explicit owner carries a small connected crown and, for floccus,
            // descending virga from the same source volume.
            let core = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, center_height),
                vec3<f32>(major * 0.42, spread * 0.72,
                    max(0.04, feature.shape.y * depth)),
            );
            geometry = core;
            geometry_valid = true;
            for (var parcel = 0; parcel < 3; parcel++) {
                let pf = f32(parcel);
                let parcel_seed = hash31(vec3<f32>(
                    feature.variation.xy + vec2<f32>(pf * 3.17),
                    feature.variation.z + pf * 5.31));
                let crown = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(
                        (pf - 1.0) * major * 0.28,
                        (parcel_seed - 0.5) * spread * 0.46,
                        center_height + feature.shape.y * depth *
                            mix(0.42, 1.15, parcel_seed),
                    ),
                    vec3<f32>(
                        major * mix(0.16, 0.27, parcel_seed),
                        spread * mix(0.28, 0.48, parcel_seed),
                        feature.shape.y * depth * mix(0.46, 0.78, parcel_seed),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry, crown, max(0.018, spread * 0.065));
            }
            if (species == 23) {
                for (var tail_index = 0; tail_index < 2; tail_index++) {
                    let tf = f32(tail_index);
                    let tail_seed = fract(feature.variation.w * 7.13 + tf * 0.371);
                    let tail = geometry_ellipsoid(
                        sample_position,
                        vec3<f32>(
                            (tail_seed - 0.5) * major * 0.34,
                            (tf - 0.5) * spread * 0.34,
                            center_height - feature.extra0.y * mix(0.26, 0.48, tail_seed),
                        ),
                        vec3<f32>(
                            major * mix(0.09, 0.16, tail_seed),
                            spread * mix(0.10, 0.20, tail_seed),
                            feature.extra0.y * mix(0.24, 0.42, tail_seed),
                        ),
                    );
                    geometry = geometry_smooth_union(
                        geometry, tail, max(0.012, spread * 0.025));
                }
            }
        } else if (species == 2) {
            // Uncinus is not a fibratus bundle with an attached blob. A small
            // hooked ice generator owns several sedimenting crystal trails;
            // every trail begins inside that head and curves continuously as
            // shear increases below it.
            let head_center = vec3<f32>(
                -major * 0.36,
                feature.shape.z * 0.12,
                center_height,
            );
            geometry = geometry_curved_fibre(
                sample_position,
                head_center,
                max(0.22, major * 0.24),
                max(0.09, spread * 0.20),
                max(0.04, feature.shape.y * depth * 0.54),
                -spread * 0.055,
                feature.shape.z * 1.28,
                feature.shape.y * depth * 0.16,
                feature.variation.w * PI * 2.0,
            );
            let hooked_crown = geometry_ellipsoid(
                sample_position,
                head_center + vec3<f32>(
                    -major * 0.12, spread * 0.08,
                    feature.shape.y * depth * 0.36),
                vec3<f32>(
                    max(0.08, major * 0.11),
                    max(0.05, spread * 0.16),
                    max(0.03, feature.shape.y * depth * 0.46),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, hooked_crown, max(0.01, spread * 0.028));
            geometry_valid = true;
            let tail_count = i32(clamp(round(feature.extra0.x + 1.0), 3.0, 5.0));
            for (var tail_index = 0; tail_index < 5; tail_index++) {
                if (tail_index >= tail_count) { continue; }
                let tif = f32(tail_index);
                let tail_seed = hash31(vec3<f32>(
                    feature.variation.zw + vec2<f32>(tif * 5.17),
                    feature.variation.x + tif * 9.31));
                let centred_tail = tif - f32(tail_count - 1) * 0.5;
                let source = head_center + vec3<f32>(
                    major * mix(-0.04, 0.09, tail_seed),
                    centred_tail * spread * 0.055,
                    -feature.shape.y * depth * mix(0.06, 0.18, tail_seed),
                );
                var tail_start = source;
                for (var tail_segment = 0; tail_segment < 6; tail_segment++) {
                    let progress = (f32(tail_segment) + 1.0) / 6.0;
                    let shear_curve = progress * progress;
                    let tail_finish = source + vec3<f32>(
                        feature.shape.z * shear_curve *
                            mix(0.46, 0.84, tail_seed),
                        centred_tail * spread * progress * 0.10 -
                            feature.shape.z * shear_curve * 0.16,
                        -feature.extra0.y * progress *
                            mix(0.78, 1.0, tail_seed),
                    );
                    let taper = mix(1.0, 0.28, progress);
                    let fallstreak = geometry_capsule(
                        sample_position, tail_start, tail_finish,
                        max(0.045, spread * 0.24 * taper),
                    );
                    geometry = geometry_smooth_union(
                        geometry, fallstreak,
                        max(0.006, spread * 0.014));
                    tail_start = tail_finish;
                }
            }
        } else {
            let strand_count = i32(clamp(round(feature.extra0.x), 2.0, 7.0));
            for (var strand = 0; strand < 7; strand++) {
                if (strand >= strand_count) { continue; }
                let sf = f32(strand);
                let strand_seed = hash31(vec3<f32>(
                    feature.variation.xy + vec2<f32>(sf * 7.1),
                    feature.variation.z + sf * 11.7));
                let centred = sf - f32(strand_count - 1) * 0.5;
                let fan_slope = centred * spread * mix(0.34, 0.72,
                    feature.variation.x) +
                    (strand_seed - 0.5) * spread * 0.38;
                let width = max(0.022,
                    spread * mix(0.09, 0.23, strand_seed)) * 1.22;
                let half_height = max(0.016,
                    feature.shape.y * depth * mix(0.92, 1.86, strand_seed));
                let strand_length = major * mix(0.46, 0.72, strand_seed);
                let strand_center = vec3<f32>(
                    -major * 0.64 + strand_length +
                        (strand_seed - 0.5) * major * 0.04,
                    fan_slope + (strand_seed - 0.5) * spread * 0.10,
                    center_height + (strand_seed - 0.5) * half_height * 0.9,
                );
                let fibre = geometry_curved_fibre(
                    sample_position, strand_center,
                    strand_length, width, half_height,
                    fan_slope,
                    feature.shape.z * mix(1.30, 2.50, strand_seed),
                    feature.extra0.y * mix(0.82, 1.52, strand_seed),
                    feature.variation.w * PI * 2.0 + sf * 1.47,
                );
                if (!geometry_valid) {
                    geometry = fibre;
                    geometry_valid = true;
                } else {
                    geometry = geometry_smooth_union(
                        geometry, fibre, width * 0.035);
                }
            }
            if (species == 3) {
                let dense_patch_geometry = geometry_ellipsoid(
                    sample_position,
                    vec3<f32>(-major * 0.08, 0.0, center_height),
                    vec3<f32>(major * 0.46, spread * 0.94,
                        max(0.05, feature.shape.y * depth * 1.7)),
                );
                geometry = geometry_smooth_union(
                    geometry, dense_patch_geometry, max(0.02, spread * 0.11));
            }
        }
        if (!geometry_valid) { continue; }
        let raw_boundary_breakup = mix(0.48, 1.0, smoothstep(0.28, 0.76,
            base_sample.r * 0.46 + base_sample.g * 0.31 +
            base_sample.b * 0.15 + feature.variation.x * 0.08));
        let boundary_breakup = select(
            raw_boundary_breakup,
            max(0.72, raw_boundary_breakup),
            species == 2,
        );
        let condensate = condensation_material_density(
            geometry, sample_position, h, layer.shape.w,
            select(0.82, 1.04, compact), 0.82,
            select(
                vec4<f32>(0.94, 0.31, 0.085, 0.12),
                vec4<f32>(0.66, 0.22, 0.065, 0.09),
                compact,
            ),
            feature.variation, index,
        ) * cirrus_ice_microstructure(
            geometry, base_sample, detail_sample, feature.variation,
            select(select(0.0, 0.46, compact), 1.0, species == 3),
        ) * moisture * feature.shape.w * boundary_breakup *
            select(1.0, 2.30, species == 2);
        // Independent ice bundles accumulate optical depth when they overlap;
        // max() made crossings look cut out and unnaturally uniform.
        density = 1.0 - (1.0 - density) * (1.0 - saturate(condensate));
    }
    let cirrus_density = mix(0.64, 0.96,
        smoothstep(0.26, 0.9, layer.geometry.z));
    return saturate(density * cirrus_density * select(1.0, 1.70, species == 2));
}

// Inverse topology deformation from physical world space into the canonical
// atlas. The atlas owns anatomy; these operators only express the real
// formation manifold (shear/sedimentation, fronts/inversions, cellular
// organization, stationary mountain waves, rolls and fragment advection).
fn deform_cloud_macro_coordinate(
    coordinate: vec3<f32>, system: CloudSystem,
    formation_mechanism: i32, topology: i32,
) -> vec3<f32> {
    var result = coordinate;
    let seeds = system.deterministic_seeds;
    let centered = coordinate - vec3<f32>(0.5);
    let shear = clamp(system.kinematics.z * 0.16, -0.42, 0.42);
    let organization_kind = i32(round(system.organization_primary.x));
    let major_diameter = max(0.08, system.horizontal_extent.z * 2.0);
    let minor_diameter = max(0.08, system.horizontal_extent.w * 2.0);

    if (formation_mechanism == 1 || formation_mechanism == 2) {
        // Buoyant trees remain rooted while their upper parcels and detached
        // anvil ice respond to the measured vertical shear layer.
        let upper = smoothstep(0.34, 0.96, coordinate.y);
        result.z -= shear * upper * select(0.16, 0.28,
            formation_mechanism == 2);
        result.x += shear * upper * (seeds.x - 0.5) * 0.11;
    }
    if (formation_mechanism == 3) {
        // Ice trajectories sediment while the ambient wind changes with
        // height. The terminal-velocity/wind ratio sets fallstreak slant;
        // vertical shear fans the bundle without a camera-space ribbon warp.
        let fall_fraction = 1.0 - coordinate.y;
        let sedimentation = clamp(
            system.precipitation.z / max(2.0, system.kinematics.x),
            0.0, 1.4);
        result.z -= fall_fraction * sedimentation * 0.24;
        result.x += centered.y * shear * 0.46 +
            sin(coordinate.y * PI * 2.0 + seeds.z * PI * 2.0) *
                fall_fraction * 0.025;
    }
    if (formation_mechanism == 4) {
        // Elevated convective ice retains turret ancestry but is displaced by
        // upper-level shear more gently than a sedimenting cirrus streamer.
        let upper = smoothstep(0.28, 0.94, coordinate.y);
        result.z -= shear * upper * 0.17;
        result.x += sin(coordinate.y * PI * 3.0 + seeds.x * 7.0) * 0.018;
    }
    if (formation_mechanism == 5) {
        // Mesoscale cellular colonies and cloud streets use the real spacing,
        // anisotropy and orientation carried by their runtime organization.
        let spacing_km = max(0.08, system.organization_primary.y);
        let cycle_count = clamp(major_diameter / spacing_km, 1.0, 12.0);
        let anisotropy = clamp(system.organization_secondary.x, 0.5, 5.0);
        let street_strength = select(0.35, 1.0, organization_kind == 2);
        let cellular_phase = (coordinate.z - 0.5) * PI * 2.0 * cycle_count +
            seeds.y * PI * 2.0;
        result.x += sin(cellular_phase) * 0.028 * street_strength *
            clamp(anisotropy, 0.7, 2.2);
        result.z += sin(
            (coordinate.x - 0.5) * PI * mix(3.0, 7.0, seeds.z) +
            seeds.w * 11.0) * 0.018;
    }
    if (formation_mechanism == 6) {
        // Low Stratocumulus already carries an irregular cyclic circulation
        // graph in the atlas. Repeating sine cycles here used to bend that
        // graph into a visible grid. A low-frequency, divergence-like drift
        // now supplies only mesoscale deformation; no runtime function
        // invents cells, rings, or spacing.
        let inversion_strength = clamp(
            system.cap_and_shear.y / 4.0, 0.0, 1.0);
        // secondary.z is the resolved organization manifold: open=0,
        // closed=1, closed/open transition=2, finite street packet=3.
        // secondary.w is physical coverage, never a topology selector.
        let organization_topology = i32(round(
            system.organization_secondary.z));
        let coverage = saturate(system.organization_secondary.w);
        let organization_anisotropy = clamp(
            system.organization_secondary.x, 0.7, 2.4);
        let deformation_coordinate = coordinate.xz * vec2<f32>(1.31, 1.07) +
            seeds.xy * 7.3;
        let crosswind_drift = noise2(deformation_coordinate) - 0.5;
        let downwind_drift = noise2(
            deformation_coordinate.yx * vec2<f32>(1.17, 0.91) +
                seeds.zw * 9.1) - 0.5;
        result.x += crosswind_drift * 0.026 * organization_anisotropy;
        result.z += downwind_drift * 0.024 /
            max(0.72, organization_anisotropy);

        // Longwave-cooled *closed* cells widen and deepen with physical cloud
        // fraction. Open cells, transition mosaics and streets already carry
        // their clear centres/corridors as generated atlas support and cannot
        // inherit this deck-deepening operator.
        let upper_amount = saturate((coordinate.y - 0.34) / 0.54);
        let upper_coupling = upper_amount * upper_amount * upper_amount *
            (upper_amount * (upper_amount * 6.0 - 15.0) + 10.0);
        let inversion_relief = noise2(
            coordinate.xz * vec2<f32>(1.53, 1.29) + seeds.zx * 11.7) - 0.5;
        let closed_cell = organization_kind == 1 &&
            organization_topology == 1;
        if (closed_cell) {
            let deepening = smoothstep(0.50, 0.90, coverage);
            let deepened_xz = vec2<f32>(0.5) +
                (result.xz - vec2<f32>(0.5)) *
                mix(1.0, 0.965, deepening);
            // WGSL swizzle expressions are not assignable when their
            // components are non-contiguous. Rebuild the vector explicitly;
            // this is numerically identical to the intended x/z update.
            result = vec3<f32>(deepened_xz.x, result.y, deepened_xz.y);
            result.y += inversion_relief * upper_coupling *
                mix(0.016, 0.007, inversion_strength) *
                mix(0.70, 1.24, deepening);
        } else {
            let regime_relief = select(
                select(0.0045, 0.0065, organization_topology == 2),
                0.0038,
                organization_topology == 3,
            );
            result.y += inversion_relief * upper_coupling * regime_relief *
                mix(1.0, 0.62, inversion_strength);
        }
    }
    if (formation_mechanism == 7) {
        // Frontal shields follow a sloped lifting surface and a softly
        // undulating inversion/equilibrium cap rather than a level slab.
        let leading_transition = max(0.04, system.organization_primary.w);
        let front_scale = clamp(leading_transition / minor_diameter, 0.0, 1.0);
        let inversion_strength = clamp(system.cap_and_shear.y / 4.0, 0.0, 1.0);
        result.y += centered.z * mix(0.035, 0.12, front_scale) +
            centered.x * shear * 0.12;
        result.y += sin(
            coordinate.x * PI * 2.0 + seeds.y * PI * 2.0) *
            mix(0.024, 0.009, inversion_strength);
    }
    if (formation_mechanism == 8 || topology == 5) {
        // Lenticular packets remain phase-locked to terrain. Wavelength and
        // crest count alter the standing displacement; time never enters.
        let wavelength_km = max(0.1, system.organization_primary.y);
        let encoded_crests = system.organization_primary.w;
        let crest_count = clamp(select(
            major_diameter / wavelength_km,
            encoded_crests,
            encoded_crests > 0.5), 1.0, 9.0);
        let standing_phase = (coordinate.z - 0.5) * PI * 2.0 * crest_count +
            seeds.x * PI * 2.0;
        result.y -= sin(standing_phase) *
            mix(0.022, 0.052, saturate(abs(shear) * 3.0 + 0.25));
        result.x += sin(standing_phase * 0.5 + seeds.w * 9.0) * 0.012;
    }
    if (formation_mechanism == 9 || topology == 6) {
        // Horizontal-roll circulation twists the cross-section gradually
        // along its axis while preserving the single detached tube support.
        let circulation = (coordinate.z - 0.5) *
            mix(0.08, 0.32, saturate(system.buoyancy_and_turbulence.w * 32.0));
        let cosine = cos(circulation);
        let sine = sin(circulation);
        let cross_section = vec2<f32>(centered.x, centered.y);
        result.x = 0.5 + cross_section.x * cosine - cross_section.y * sine;
        result.y = 0.5 + cross_section.x * sine + cross_section.y * cosine;
    }
    if (formation_mechanism == 10) {
        // Boundary-layer stratus follows its inversion but remains a coherent
        // sheet; only low-frequency physical undulation is permitted.
        let inversion_strength = clamp(system.cap_and_shear.y / 4.0, 0.0, 1.0);
        result.y += (
            sin(coordinate.x * PI * 2.0 + seeds.x * 8.0) +
            sin(coordinate.z * PI * 2.0 + seeds.z * 8.0)) *
            mix(0.018, 0.007, inversion_strength);
    }
    if (formation_mechanism == 11 || topology == 2) {
        // Fragments diverge in a dry turbulent boundary layer. The canonical
        // population still owns every shred; this merely breaks rigid motion.
        let fragmentation = saturate(
            system.buoyancy_and_turbulence.w * 28.0 +
            max(0.0, -system.lifecycle_tendencies.x));
        result.x += sin(
            coordinate.z * PI * 5.0 + coordinate.y * PI * 2.0 + seeds.x * 13.0) *
            mix(0.008, 0.032, fragmentation);
        result.z += sin(
            coordinate.x * PI * 4.0 - coordinate.y * PI * 3.0 + seeds.z * 17.0) *
            mix(0.006, 0.026, fragmentation);
    }
    return result;
}

// Authoritative cloud macro volumes. Owners are finite, stable tangent-plane
// weather systems. Canonical volume axes are x=crosswind, y=altitude,
// z=downwind; atlas transforms come directly from the manifest rather than
// being reconstructed from a hard-coded texture resolution or z stride.
// Material resolution additionally carries a scalar, vertically calibrated
// extinction coefficient and the two strongest optical owners. Density-only
// callers disable that work so morphology probes do not pay for optical-state
// storage reads.
fn cloud_owner_extinction_coefficient_from_mass_extinction(
    system: CloudSystem,
    atlas_binding: CloudMacroBinding,
    local_ice_fraction: f32,
    mass_extinction: vec3<f32>,
) -> f32 {
    let reference_mass_extinction = cloud_geometric_mass_extinction(
        system, local_ice_fraction);
    let spectral_ratio = max(mass_extinction, vec3<f32>(0.0)) /
        max(vec3<f32>(1e-5), vec3<f32>(reference_mass_extinction));
    let photopic_ratio = dot(
        spectral_ratio,
        vec3<f32>(0.2126, 0.7152, 0.0722));
    // system.optical_material.x = target vertical optical depth / physical
    // layer depth [km^-1]. Atlas R is dimensionless, so division by its mean
    // vertical integral produces one owner-local scalar coefficient. High
    // camera/source transport share R exactly; ray direction belongs only in
    // the subsequent integral of density ds.
    return max(0.0, system.optical_material.x) * photopic_ratio /
        max(0.002, atlas_binding.condensate_paths.x);
}

fn cloud_owner_extinction_coefficient(
    owner_index: u32,
    system: CloudSystem,
    atlas_binding: CloudMacroBinding,
    local_ice_fraction: f32,
) -> f32 {
    return cloud_owner_extinction_coefficient_from_mass_extinction(
        system,
        atlas_binding,
        local_ice_fraction,
        cloud_local_mass_extinction(owner_index, local_ice_fraction),
    );
}

struct CloudMacroSample {
    density: f32,
    detail: f32,
    ice_fraction: f32,
    unresolved_ice_variance: f32,
    unresolved_ice_correlation: f32,
    high_ice_second_moment: f32,
    high_ice_coverage: f32,
    high_ice_residual_variance: f32,
    high_ice_mean_density: f32,
    high_ice_correlation_length: f32,
    high_ice_lateral_filter_radius: f32,
    high_ice_depth_filter_radius: f32,
    matched_owner: f32,
    extinction_coefficient: f32,
    spectral_extinction_coefficient: vec3<f32>,
    effective_mass_extinction: vec3<f32>,
    single_scattering_albedo: vec3<f32>,
    asymmetry: vec3<f32>,
    retained_optical_fraction: f32,
    local_upper_path_km: vec3<f32>,
    local_lower_path_km: vec3<f32>,
    primary_owner: f32,
    secondary_owner: f32,
    primary_fraction: f32,
    primary_ice_fraction: f32,
    secondary_ice_fraction: f32,
};

// One bit per finite production transport record. Explicit scalar words keep
// Metal from materializing a dynamically indexed function-private array. IDs
// 0..35 are cloud owners, 36..38 are legacy layer fallbacks, 39 is reserved,
// 40..135 are hydrometeors, and 136..171 are upper-atmosphere owners.
struct OrderedActiveSet {
    records_0_31: u32,
    records_32_63: u32,
    records_64_95: u32,
    records_96_127: u32,
    records_128_159: u32,
    records_160_191: u32,
};

fn empty_ordered_active_set() -> OrderedActiveSet {
    return OrderedActiveSet(0u, 0u, 0u, 0u, 0u, 0u);
}

fn ordered_active_insert(
    active_set: OrderedActiveSet, identifier: u32,
) -> OrderedActiveSet {
    var result = active_set;
    if (identifier < 32u) {
        result.records_0_31 |= 1u << identifier;
    } else if (identifier < 64u) {
        result.records_32_63 |= 1u << (identifier - 32u);
    } else if (identifier < 96u) {
        result.records_64_95 |= 1u << (identifier - 64u);
    } else if (identifier < 128u) {
        result.records_96_127 |= 1u << (identifier - 96u);
    } else if (identifier < 160u) {
        result.records_128_159 |= 1u << (identifier - 128u);
    } else if (identifier < 192u) {
        result.records_160_191 |= 1u << (identifier - 160u);
    }
    return result;
}

fn ordered_active_contains(
    active_set: OrderedActiveSet, identifier: u32,
) -> bool {
    if (identifier < 32u) {
        return (active_set.records_0_31 & (1u << identifier)) != 0u;
    }
    if (identifier < 64u) {
        return (active_set.records_32_63 &
            (1u << (identifier - 32u))) != 0u;
    }
    if (identifier < 96u) {
        return (active_set.records_64_95 &
            (1u << (identifier - 64u))) != 0u;
    }
    if (identifier < 128u) {
        return (active_set.records_96_127 &
            (1u << (identifier - 96u))) != 0u;
    }
    if (identifier < 160u) {
        return (active_set.records_128_159 &
            (1u << (identifier - 128u))) != 0u;
    }
    if (identifier < 192u) {
        return (active_set.records_160_191 &
            (1u << (identifier - 160u))) != 0u;
    }
    return false;
}

fn empty_cloud_macro_sample() -> CloudMacroSample {
    var result: CloudMacroSample;
    result.density = 0.0;
    result.detail = 0.0;
    result.ice_fraction = 0.0;
    result.unresolved_ice_variance = 0.0;
    result.unresolved_ice_correlation = 0.0;
    result.high_ice_second_moment = 0.0;
    result.high_ice_coverage = 0.0;
    result.high_ice_residual_variance = 0.0;
    result.high_ice_mean_density = 0.0;
    result.high_ice_correlation_length = 0.0;
    result.high_ice_lateral_filter_radius = 0.0;
    result.high_ice_depth_filter_radius = 0.0;
    result.matched_owner = 0.0;
    result.extinction_coefficient = 0.0;
    result.spectral_extinction_coefficient = vec3<f32>(0.0);
    result.effective_mass_extinction = vec3<f32>(0.0);
    result.single_scattering_albedo = vec3<f32>(0.0);
    result.asymmetry = vec3<f32>(0.0);
    result.retained_optical_fraction = 1.0;
    result.local_upper_path_km = vec3<f32>(0.0);
    result.local_lower_path_km = vec3<f32>(0.0);
    result.primary_owner = 0.0;
    result.secondary_owner = 0.0;
    result.primary_fraction = 1.0;
    result.primary_ice_fraction = 0.0;
    result.secondary_ice_fraction = 0.0;
    return result;
}

// Atlas-v2 exterior-boundary compatibility. The v2 manifest owns these
// permissions and protected-base parameters. CloudMacroBinding predates that
// metadata, so the generated contract is decoded through the stable volume
// index until the next append-only binding revision carries the values
// directly. This is deliberately isolated from density/transport composition.
const CLOUD_EXTERIOR_LIQUID_CAULI: u32 = 0u;
const CLOUD_EXTERIOR_LIQUID_TURRET: u32 = 1u;
const CLOUD_EXTERIOR_LIQUID_SCUD: u32 = 2u;
const CLOUD_EXTERIOR_STRATIFORM_RAGGED: u32 = 3u;
const CLOUD_EXTERIOR_ICE_FIBRE: u32 = 4u;
const CLOUD_EXTERIOR_ICE_SEDIMENTATION: u32 = 5u;
const CLOUD_EXTERIOR_LAMINAR_WAVE: u32 = 6u;

${CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL}

// x = permitted-class bit mask, y = protected-base altitude, z = maximum
// downward-displacement scale. The Cu base is generator-owned above; the
// remaining values preserve the existing atlas-v2 compatibility table.
fn cloud_exterior_volume_contract(volume_index: u32) -> vec3<f32> {
    if (volume_index == 0u || volume_index == 1u) {
        return vec3<f32>(1.0, CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE, 0.0);
    }
    if (volume_index == 2u || volume_index == 32u || volume_index == 33u) {
        return vec3<f32>(3.0, CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE, 0.0);
    }
    if (volume_index == 3u) { return vec3<f32>(19.0, 0.06382979, 0.0); }
    if (volume_index == 4u || volume_index == 5u) {
        return vec3<f32>(51.0, 0.08510638, 0.0);
    }
    if (volume_index == 6u) { return vec3<f32>(54.0, 0.10638298, 0.0); }
    if (volume_index >= 7u && volume_index <= 11u) {
        return vec3<f32>(48.0, 0.38297872, 1.0);
    }
    if (volume_index == 12u) { return vec3<f32>(24.0, 0.61702128, 0.0); }
    if (volume_index == 13u) { return vec3<f32>(17.0, 0.53191489, 0.0); }
    if (volume_index == 14u) { return vec3<f32>(19.0, 0.55319149, 0.0); }
    if (volume_index == 15u) { return vec3<f32>(17.0, 0.46808511, 0.0); }
    if (volume_index == 16u) { return vec3<f32>(80.0, 0.57446809, 0.16); }
    if (volume_index == 17u) { return vec3<f32>(1.0, 0.42553191, 0.0); }
    if (volume_index == 18u) { return vec3<f32>(3.0, 0.44680851, 0.0); }
    if (volume_index == 19u) { return vec3<f32>(1.0, 0.36170213, 0.0); }
    if (volume_index == 20u) { return vec3<f32>(64.0, 0.46808511, 0.16); }
    if (volume_index == 21u) { return vec3<f32>(9.0, 0.44680851, 0.0); }
    if (volume_index == 22u) { return vec3<f32>(24.0, 0.44680851, 0.0); }
    if (volume_index == 23u) { return vec3<f32>(56.0, 0.08510638, 0.38); }
    if (volume_index == 24u) { return vec3<f32>(1.0, 0.25531915, 0.0); }
    if (volume_index == 25u) { return vec3<f32>(3.0, 0.29787234, 0.0); }
    if (volume_index == 26u) { return vec3<f32>(1.0, 0.21276596, 0.0); }
    if (volume_index == 27u) { return vec3<f32>(64.0, 0.36170213, 0.16); }
    if (volume_index == 28u) { return vec3<f32>(9.0, 0.29787234, 0.0); }
    if (volume_index == 29u) { return vec3<f32>(8.0, 0.21276596, 0.0); }
    if (volume_index == 30u || volume_index == 31u) {
        return vec3<f32>(4.0, 0.18085107, 1.0);
    }
    return vec3<f32>(1.0, 0.0, 1.0);
}

fn cloud_exterior_class_permitted(mask: u32, detail_code: u32) -> bool {
    return (mask & (1u << detail_code)) != 0u;
}

fn cloud_exterior_select_class(
    mask: u32, detail: f32, ice_fraction: f32,
    species: i32, precipitation_kind: i32,
) -> u32 {
    let explicit_fibre = species == 1 || species == 3 || species == 22;
    let explicit_sedimentation = species == 2 || species == 23 ||
        precipitation_kind == 1;
    // Atlas detail is a local material coordinate, not a species identifier.
    // Fibratus frequently has high G/B values, but those regions are still
    // horizontally sheared fibres—not vertical sedimentation streaks.
    if (explicit_fibre && cloud_exterior_class_permitted(
        mask, CLOUD_EXTERIOR_ICE_FIBRE)) {
        return CLOUD_EXTERIOR_ICE_FIBRE;
    }
    if (cloud_exterior_class_permitted(mask,
            CLOUD_EXTERIOR_ICE_SEDIMENTATION) &&
        explicit_sedimentation && ice_fraction >= 0.56 && detail >= 0.38) {
        return CLOUD_EXTERIOR_ICE_SEDIMENTATION;
    }
    if (cloud_exterior_class_permitted(mask, CLOUD_EXTERIOR_ICE_FIBRE) &&
        (ice_fraction >= 0.56 || detail >= 0.72)) {
        return CLOUD_EXTERIOR_ICE_FIBRE;
    }
    if (cloud_exterior_class_permitted(mask, CLOUD_EXTERIOR_LIQUID_SCUD) &&
        detail >= 0.40) {
        return CLOUD_EXTERIOR_LIQUID_SCUD;
    }
    if (cloud_exterior_class_permitted(mask,
            CLOUD_EXTERIOR_STRATIFORM_RAGGED) &&
        detail >= 0.27 && detail < 0.72) {
        return CLOUD_EXTERIOR_STRATIFORM_RAGGED;
    }
    if (cloud_exterior_class_permitted(mask, CLOUD_EXTERIOR_LIQUID_TURRET) &&
        detail <= 0.34) {
        return CLOUD_EXTERIOR_LIQUID_TURRET;
    }
    if (cloud_exterior_class_permitted(mask, CLOUD_EXTERIOR_LAMINAR_WAVE)) {
        return CLOUD_EXTERIOR_LAMINAR_WAVE;
    }
    for (var candidate = 0u; candidate < 7u; candidate += 1u) {
        if (cloud_exterior_class_permitted(mask, candidate)) { return candidate; }
    }
    return CLOUD_EXTERIOR_LIQUID_CAULI;
}

// Generic protected-core rule retained for lower/middle material and fallback
// compatibility. Transparent ice cannot use these floors in transport:
// raising every occupied voxel invalidates its calibrated optical-depth path
// and turns oblique grains into opaque bands. The shared transport evaluator
// below therefore returns atlas R first for every high-cloud genus.
fn cloud_macro_protected_core_density(
    macro_sample: vec4<f32>, formation_mechanism: i32,
    genus: i32, species: i32,
) -> f32 {
    if (macro_sample.r <= 0.0001) { return 0.0; }
    var core_floor = mix(0.76, 0.68, saturate(macro_sample.b));
    if (formation_mechanism == 3) {
        if (species == 1 || species == 2) {
            // Preserve the generator-calibrated sparse ice mass exactly.
            return saturate(macro_sample.r);
        }
        core_floor = 0.12;
        if (species == 3) { core_floor = 0.34; }
        if (species == 22) { core_floor = 0.20; }
        if (species == 23) { core_floor = 0.16; }
    }
    if (formation_mechanism == 4) { core_floor = 0.46; }
    if (formation_mechanism == 6) {
        // Closed/open Sc interiors, narrow downwelling rings, and dilute wall
        // shoulders are calibrated in the C2 atlas reconstruction. Raising
        // every occupied trilinear sample to the generic liquid floor fills
        // those channels and restores oval stamps, so code 6 is authoritative.
        return saturate(macro_sample.r);
    }
    if (formation_mechanism == 7) {
        core_floor = select(0.48, 0.30, genus == 3);
    }
    if (formation_mechanism == 8) { core_floor = 0.54; }
    if (formation_mechanism == 10) { core_floor = 0.58; }
    if (formation_mechanism == 11) { core_floor = 0.52; }
    return saturate(max(macro_sample.r, core_floor));
}

// High-cloud optics are calibrated to atlas R, and their resolved grains are
// supplied by cloud_resolved_high_ice_material below. Applying the generic
// liquid protected-core floor to every occupied Cc/Cs source texel made the
// directional field 1.8--3x denser and spatially broader than camera-visible
// grains. Camera and source queries enter this shared evaluator before the
// same stationary 3-D residual, so their support and normalization cannot
// diverge. Lower and middle clouds retain their established protected cores.
fn cloud_macro_transport_material_density(
    macro_sample: vec4<f32>, formation_mechanism: i32,
    genus: i32, species: i32,
) -> f32 {
    if (genus >= 1 && genus <= 3) {
        return saturate(macro_sample.r);
    }
    return cloud_macro_protected_core_density(
        macro_sample, formation_mechanism, genus, species);
}

struct CloudExteriorDetailContract {
    maximum_displacement_canonical: f32,
    maximum_density: f32,
    axis_scale: vec3<f32>,
};

fn cloud_exterior_detail_contract(
    detail_code: u32,
) -> CloudExteriorDetailContract {
    var result: CloudExteriorDetailContract;
    result.maximum_displacement_canonical = 0.058;
    result.maximum_density = 0.72;
    result.axis_scale = vec3<f32>(1.0, 1.15, 1.0);
    if (detail_code == CLOUD_EXTERIOR_LIQUID_TURRET) {
        result.maximum_displacement_canonical = 0.070;
        result.maximum_density = 0.76;
        result.axis_scale = vec3<f32>(1.0, 1.22, 1.0);
    } else if (detail_code == CLOUD_EXTERIOR_LIQUID_SCUD) {
        result.maximum_displacement_canonical = 0.050;
        result.maximum_density = 0.54;
        result.axis_scale = vec3<f32>(1.12, 0.72, 1.18);
    } else if (detail_code == CLOUD_EXTERIOR_STRATIFORM_RAGGED) {
        result.maximum_displacement_canonical = 0.034;
        result.maximum_density = 0.48;
        result.axis_scale = vec3<f32>(1.18, 0.42, 1.18);
    } else if (detail_code == CLOUD_EXTERIOR_ICE_FIBRE) {
        result.maximum_displacement_canonical = 0.066;
        result.maximum_density = 0.46;
        result.axis_scale = vec3<f32>(1.0, 0.74, 1.30);
    } else if (detail_code == CLOUD_EXTERIOR_ICE_SEDIMENTATION) {
        result.maximum_displacement_canonical = 0.082;
        result.maximum_density = 0.40;
        result.axis_scale = vec3<f32>(0.82, 1.26, 1.18);
    } else if (detail_code == CLOUD_EXTERIOR_LAMINAR_WAVE) {
        result.maximum_displacement_canonical = 0.020;
        result.maximum_density = 0.44;
        result.axis_scale = vec3<f32>(1.0, 0.28, 0.88);
    }
    return result;
}

fn cloud_macro_volume_rgba(
    canonical: vec3<f32>, atlas_binding: CloudMacroBinding,
) -> vec4<f32> {
    let storage_coordinate = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let atlas_uv = storage_coordinate * atlas_binding.atlas_scale.xyz +
        atlas_binding.atlas_offset.xyz;
    let centre = textureSampleLevel(
        cloud_macro_atlas, cloud_macro_sampler, atlas_uv, 0.0);
    // The inversion-bounded deck is a continuous liquid sheet, but its
    // compact 48^3 exemplar has only a handful of occupied altitude texels.
    // A single trilinear lookup therefore preserves the storage terraces as
    // broad horizontal radiance plateaus once a physical ray marcher resolves
    // the finite owner.  Reconstruct one bounded atlas-voxel footprint in the
    // owner frame.  This is a physical material reconstruction shared by
    // camera and source transport (not a screen-space mask or grade), and is
    // restricted to the inversion-bounded formation ABI so other volumes keep
    // their authoritative anatomy unchanged.
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    if (formation_mechanism != 10) { return centre; }
    let vertical_voxel = vec3<f32>(0.0, 1.0 / 47.0, 0.0);
    let lower_coordinate = clamp(
        storage_coordinate - vertical_voxel,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let upper_coordinate = clamp(
        storage_coordinate + vertical_voxel,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let lower_uv = lower_coordinate * atlas_binding.atlas_scale.xyz +
        atlas_binding.atlas_offset.xyz;
    let upper_uv = upper_coordinate * atlas_binding.atlas_scale.xyz +
        atlas_binding.atlas_offset.xyz;
    let lower = textureSampleLevel(
        cloud_macro_atlas, cloud_macro_sampler, lower_uv, 0.0);
    let upper = textureSampleLevel(
        cloud_macro_atlas, cloud_macro_sampler, upper_uv, 0.0);
    // The symmetric kernel has unit mass over the supported interior, so
    // vertical integration of R and the packed optical attributes is
    // unchanged away from the conservative boundaries.  Clamp each channel
    // to the three source values as a monotone reconstruction guard.  An empty
    // centre remains empty: neighbouring occupied texels cannot grow
    // condensate past the conservative atlas support at the deck base or cap.
    let monotone_lower = min(lower, min(centre, upper));
    let monotone_upper = max(lower, max(centre, upper));
    let filtered = clamp(
        (lower + centre * 2.0 + upper) * 0.25,
        monotone_lower, monotone_upper);
    // G/B are phase/material attributes, not independent condensate.  Blend
    // them with the same unit-mass kernel only when all three taps are inside
    // resident support; otherwise retain the centre attributes instead of
    // diluting a base/cap with an empty continuation.
    let material_has_two_sided_support = centre.r > 0.0001 &&
        lower.r > 0.0001 && upper.r > 0.0001;
    // Alpha is the signed-distance support carrier, not an optical colour.
    // Keep the geometric field exactly as authored; reconstructing it would
    // move the physical base or cap even when material support is conservative.
    return vec4<f32>(
        select(0.0, filtered.r, centre.r > 0.0001),
        select(centre.g, filtered.g, material_has_two_sided_support),
        select(centre.b, filtered.b, material_has_two_sided_support),
        centre.a,
    );
}

fn cloud_high_ice_source_sample(
    canonical: vec3<f32>, atlas_binding: CloudMacroBinding,
) -> vec4<f32> {
    if (atlas_binding.high_ice_source_scale.w < 0.5) {
        return vec4<f32>(0.0);
    }
    let storage_coordinate = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let atlas_uv = storage_coordinate *
        atlas_binding.high_ice_source_scale.xyz +
        atlas_binding.high_ice_source_offset.xyz;
    // The offline 2^3 block-mass contract makes the source's box restriction
    // exactly equal macro R. Hardware linear sampling therefore reveals the
    // authored realization without a runtime density ratio or support leak.
    // The zero guard on all six slot faces isolates neighbouring sources.
    return textureSampleLevel(
        cloud_high_ice_source_atlas, cloud_macro_sampler, atlas_uv, 0.0);
}

fn cloud_high_ice_source_coarse_moment_sample(
    canonical: vec3<f32>, atlas_binding: CloudMacroBinding,
) -> vec2<f32> {
    if (atlas_binding.high_ice_source_scale.w < 0.5) {
        return vec2<f32>(0.0);
    }
    let storage_coordinate = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let dimensions = vec3<f32>(textureDimensions(cloud_high_ice_source_atlas));
    // G/B are constant over each 2^3 fine block. Sample their block centres
    // on the exact 48^3 interpolation lattice: 94 fine-texel intervals and a
    // half-fine-texel offset relative to the 96^3 R/A lattice. This avoids a
    // half-texel drift between macro R and its unresolved statistics.
    let coarse_scale = atlas_binding.high_ice_source_scale.xyz * (94.0 / 95.0);
    let coarse_offset = atlas_binding.high_ice_source_offset.xyz +
        0.5 / dimensions;
    let atlas_uv = storage_coordinate * coarse_scale + coarse_offset;
    let source = textureSampleLevel(
        cloud_high_ice_source_atlas, cloud_macro_sampler, atlas_uv, 0.0);
    // x=E[rho^2], y=support coverage.
    return source.bg;
}

fn cloud_macro_sdf_voxels(
    canonical: vec3<f32>, encoded: f32,
) -> f32 {
    let storage_coordinate = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let decoded = (encoded * 255.0 - 128.0) / 127.0 *
        max(1.0, cloud_macro_bindings.header.w);
    // Explicit continuation outside the packed volume prevents hardware
    // filtering from reaching the next z-packed owner.
    return decoded + length(canonical - storage_coordinate) * 47.0;
}

fn cloud_macro_sdf_normal(
    canonical: vec3<f32>, atlas_binding: CloudMacroBinding,
) -> vec3<f32> {
    let voxel = 1.0 / 47.0;
    let dx = vec3<f32>(voxel, 0.0, 0.0);
    let dy = vec3<f32>(0.0, voxel, 0.0);
    let dz = vec3<f32>(0.0, 0.0, voxel);
    let gradient = vec3<f32>(
        cloud_macro_sdf_voxels(
            canonical + dx,
            cloud_macro_volume_rgba(canonical + dx, atlas_binding).a) -
        cloud_macro_sdf_voxels(
            canonical - dx,
            cloud_macro_volume_rgba(canonical - dx, atlas_binding).a),
        cloud_macro_sdf_voxels(
            canonical + dy,
            cloud_macro_volume_rgba(canonical + dy, atlas_binding).a) -
        cloud_macro_sdf_voxels(
            canonical - dy,
            cloud_macro_volume_rgba(canonical - dy, atlas_binding).a),
        cloud_macro_sdf_voxels(
            canonical + dz,
            cloud_macro_volume_rgba(canonical + dz, atlas_binding).a) -
        cloud_macro_sdf_voxels(
            canonical - dz,
            cloud_macro_volume_rgba(canonical - dz, atlas_binding).a),
    );
    let gradient_length = length(gradient);
    if (gradient_length <= 1e-5) { return vec3<f32>(0.0, 1.0, 0.0); }
    return gradient / gradient_length;
}

fn cloud_exterior_shape_signal(
    canonical: vec3<f32>, local_position: vec3<f32>,
    detail_code: u32, system: CloudSystem,
) -> f32 {
    let seeds = system.deterministic_seeds;
    let age = p[0].z * system.kinematics.x * 0.00006;
    let broad_coordinate = fract(canonical * vec3<f32>(5.1, 4.4, 5.3) +
        seeds.xyz * 13.7 + vec3<f32>(0.0, 0.0, age));
    let fine_coordinate = fract(canonical.zxy * vec3<f32>(13.7, 9.3, 15.1) +
        seeds.wxy * 23.1 + vec3<f32>(age * 1.7, 0.0, 0.0));
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let broad_world_frequency = max(
        5.1 / (2.0 * minor_radius),
        max(4.4 / geometric_depth, 5.3 / (2.0 * major_radius)),
    );
    let fine_world_frequency = max(
        13.7 / (2.0 * major_radius),
        max(9.3 / (2.0 * minor_radius), 15.1 / geometric_depth),
    );
    let broad_lod = cloud_volume_lod_at_local_position(
        local_position, broad_world_frequency, 128.0, 7.0);
    let fine_lod = cloud_volume_lod_at_local_position(
        local_position, fine_world_frequency, 64.0, 6.0);
    let broad = textureSampleLevel(
        base_volume, volume_sampler, broad_coordinate, broad_lod);
    let fine = textureSampleLevel(
        detail_volume, volume_sampler, fine_coordinate, fine_lod);
    var signal = broad.r * 0.50 + broad.g * 0.28 + fine.r * 0.22;
    if (detail_code == CLOUD_EXTERIOR_LIQUID_TURRET) {
        signal = broad.r * 0.42 + broad.b * 0.24 + fine.r * 0.20 +
            smoothstep(0.38, 0.72,
                noise2(canonical.xz * 17.0 + seeds.xy * 31.0)) * 0.14;
    } else if (detail_code == CLOUD_EXTERIOR_LIQUID_SCUD) {
        signal = broad.g * 0.46 + fine.r * 0.34 +
            fbm2(canonical.xz * 11.0 + seeds.zw * 19.0) * 0.20;
    } else if (detail_code == CLOUD_EXTERIOR_STRATIFORM_RAGGED) {
        signal = broad.r * 0.56 + broad.g * 0.30 + fine.r * 0.14;
    } else if (detail_code == CLOUD_EXTERIOR_ICE_FIBRE) {
        let fibres = fbm2(vec2<f32>(
            canonical.z * 18.0 + canonical.x * 2.1 + age * 4.0,
            canonical.y * 7.0 - canonical.x * 5.2) + seeds.zw * 29.0);
        signal = fine.g * 0.38 + fine.b * 0.20 + fibres * 0.42;
    } else if (detail_code == CLOUD_EXTERIOR_ICE_SEDIMENTATION) {
        let streaks = fbm2(vec2<f32>(
            canonical.z * 14.0 + canonical.x * 3.2 + age * 3.0,
            canonical.y * 4.8 - canonical.x * 8.0) + seeds.yz * 37.0);
        signal = fine.g * 0.30 + fine.b * 0.18 + streaks * 0.52;
    } else if (detail_code == CLOUD_EXTERIOR_LAMINAR_WAVE) {
        signal = broad.r * 0.72 + broad.g * 0.20 + fine.r * 0.08;
    }
    return saturate(signal);
}

// The coarse volume carries topology and a filtered signed distance, while
// procedural detail supplies sub-voxel amplification.  Applying noise as an
// opacity multiplier on the occupied side made otherwise continuous liquid
// surfaces look stippled and exposed the 48^3 sampling lattice.  One signed
// displacement now moves the same boundary from both sides.  The encoded R
// channel still owns condensate variation in the protected interior and the
// manifest majorant remains a conservative bound for every outward move.
fn cloud_macro_displaced_boundary_density(
    canonical: vec3<f32>, macro_sample: vec4<f32>,
    sdf_voxels: f32,
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding, genus: i32,
    formation_mechanism: i32,
) -> f32 {
    let volume_index = u32(max(0.0, round(atlas_binding.atlas_offset.w)));
    let volume_contract = cloud_exterior_volume_contract(volume_index);
    let permitted_mask = u32(round(volume_contract.x));
    let species = i32(round(system.identity.w));
    let precipitation_kind = i32(round(system.precipitation.x));
    let detail_code = cloud_exterior_select_class(
        permitted_mask, saturate(macro_sample.g), saturate(macro_sample.b),
        species, precipitation_kind);
    let detail_contract = cloud_exterior_detail_contract(detail_code);

    let protected_core = cloud_macro_transport_material_density(
        macro_sample, formation_mechanism, genus, species);

    // Deep samples cannot be changed by the bounded displacement.  Avoid a
    // normal/noise lookup there and retain the atlas condensate field exactly.
    if (sdf_voxels <= -6.0) { return protected_core; }

    // The largest axis scale is the manifest majorant's conservative reach.
    // Reject only samples beyond that bound before paying for the six-tap SDF
    // normal; survivors use the tighter directional reach below.
    let maximum_axis_scale = max(
        detail_contract.axis_scale.x,
        max(detail_contract.axis_scale.y, detail_contract.axis_scale.z));
    let maximum_axis_reach_voxels =
        detail_contract.maximum_displacement_canonical * 47.0 *
        maximum_axis_scale;
    if (maximum_axis_reach_voxels <= 1e-5 ||
        sdf_voxels > maximum_axis_reach_voxels + 0.75) { return 0.0; }

    let sdf_normal = cloud_macro_sdf_normal(canonical, atlas_binding);
    let directional_axis_scale = length(
        sdf_normal * detail_contract.axis_scale);
    let directional_reach_voxels =
        detail_contract.maximum_displacement_canonical * 47.0 *
        directional_axis_scale;
    if (directional_reach_voxels <= 1e-5 ||
        sdf_voxels > directional_reach_voxels + 0.75) { return 0.0; }
    let shape_signal = cloud_exterior_shape_signal(
        clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0)),
        local_position, detail_code, system);

    // Low values entrain dry air into the old boundary; high values expand a
    // coherent lobe.  Species alter this balance without changing the hard
    // manifest displacement ceiling.  Laminar wave clouds barely erode;
    // ice/scud can open deeper wisps and gaps.
    var inward_fraction = 0.34;
    var outward_fraction = 0.92;
    if (detail_code == CLOUD_EXTERIOR_LIQUID_TURRET) {
        inward_fraction = 0.27;
        outward_fraction = 1.0;
    } else if (detail_code == CLOUD_EXTERIOR_LIQUID_SCUD) {
        inward_fraction = 0.58;
        outward_fraction = 0.66;
    } else if (detail_code == CLOUD_EXTERIOR_STRATIFORM_RAGGED) {
        inward_fraction = 0.38;
        outward_fraction = 0.70;
    } else if (detail_code == CLOUD_EXTERIOR_ICE_FIBRE ||
        detail_code == CLOUD_EXTERIOR_ICE_SEDIMENTATION) {
        inward_fraction = 0.62;
        outward_fraction = 0.84;
    } else if (detail_code == CLOUD_EXTERIOR_LAMINAR_WAVE) {
        inward_fraction = 0.10;
        outward_fraction = 0.42;
    }
    let coherent_signal = smoothstep(0.16, 0.84, shape_signal);
    var displacement_voxels = directional_reach_voxels * mix(
        -inward_fraction, outward_fraction, coherent_signal);

    // The lifting-condensation level is a physical interface.  Outward
    // displacement on its underside is reduced by the per-volume protected
    // base contract, while inward entrainment and all lateral/top relief stay
    // available.  This produces a crisp but naturally finite Cu base instead
    // of either dangling noise or a screen-space ruler.
    if (displacement_voxels > 0.0 && sdf_normal.y < 0.0) {
        let altitude_from_base_voxels =
            (canonical.y - volume_contract.y) * 47.0;
        let protected_base_scale = mix(
            volume_contract.z,
            1.0,
            smoothstep(-0.75, 1.35, altitude_from_base_voxels));
        displacement_voxels *= protected_base_scale;
    }

    let displaced_sdf_voxels = sdf_voxels - displacement_voxels;
    let boundary_occupancy = 1.0 - smoothstep(
        -0.70, 0.70, displaced_sdf_voxels);
    if (boundary_occupancy <= 0.0001) { return 0.0; }
    let surface_material = detail_contract.maximum_density * mix(
        0.70, 1.0, smoothstep(0.18, 0.82, shape_signal));
    let surface_density = boundary_occupancy * surface_material;
    let core_weight = 1.0 - smoothstep(
        -6.0, -2.0, displaced_sdf_voxels);
    return saturate(mix(surface_density, protected_core, core_weight));
}

// The generated 48^3 atlas is the authoritative finite support and macro
// condensate carrier, but it is not a display-resolution ice material.  A
// trilinear atlas value alone turns broad Ci/Cs owners into smooth cards and
// leaves each Cc element as its reconstruction ellipsoid.  Resolve a bounded,
// zero-centred 3-D residual inside that support.  The two incommensurate owner-
// frame domains are physical kilometres (never screen UVs), so translating or
// orbiting the camera reveals one stable cloud rather than a radial stamp.
// Explicit volume LOD integrates sub-pixel structure instead of aliasing it.
fn cloud_resolved_high_ice_material(
    canonical: vec3<f32>, local_position: vec3<f32>,
    macro_sample: vec4<f32>, sdf_voxels: f32,
    base_density: f32, system: CloudSystem,
    genus: i32, species: i32,
    source_lateral_filter_radius_km: f32,
    source_depth_filter_radius_km: f32,
    source_ray_direction_owner_local: vec3<f32>,
) -> vec4<f32> {
    if (genus < 1 || genus > 3 || base_density <= 0.0001) {
        // No resolved high-ice residual exists outside Ci/Cc/Cs support. Keep
        // the fourth-channel contract explicit so downstream optical variance
        // is exactly zero rather than inheriting a species fallback.
        return vec4<f32>(base_density, saturate(macro_sample.g), 0.0, 0.0);
    }

    let minor_radius_km = max(0.04, system.horizontal_extent.w);
    let geometric_depth_km = max(0.02, system.vertical_extent.y);
    let major_radius_km = max(0.04, system.horizontal_extent.z);
    let owner_position_km = (canonical - vec3<f32>(0.5)) * vec3<f32>(
        2.0 * minor_radius_km,
        geometric_depth_km,
        2.0 * major_radius_km);
    let seeds = system.deterministic_seeds;
    let age = p[0].z * system.kinematics.x * 0.00006;

    // Frequencies are cycles per kilometre in the owner crosswind, vertical,
    // and downwind axes.  Each family receives its observed material anatomy:
    // long ice bundles for Ci, compact granular cells for Cc, and a veil plus
    // embedded fibres for Cs.  Species adjustments change real 3-D anatomy,
    // not opacity labels applied after transport.
    var broad_frequency = vec3<f32>(1.15, 1.80, 0.38);
    var fine_frequency = vec3<f32>(4.20, 5.60, 0.92);
    var residual_amplitude = 0.48;
    var broad_weight = 0.62;
    var vertical_shear = mix(-0.16, 0.16, seeds.z);
    if (genus == 1) {
        if (species == 1) {
            // Fibratus remains continuous downwind while crystal bundles and
            // sublimation texture divide each analytic strand in cross-section.
            broad_frequency = vec3<f32>(1.80, 3.10, 0.18);
            fine_frequency = vec3<f32>(6.80, 8.40, 0.54);
            residual_amplitude = 0.46;
            broad_weight = 0.68;
        } else if (species == 2) {
            // Uncinus heads shear into vertically coherent fallstreak fibres.
            broad_frequency = vec3<f32>(1.65, 0.46, 0.62);
            fine_frequency = vec3<f32>(5.30, 1.22, 1.85);
            residual_amplitude = 0.56;
            vertical_shear += 0.20;
        } else if (species == 3) {
            // Spissatus is optically denser, turbulent ice with fibrous edges.
            broad_frequency = vec3<f32>(0.92, 1.36, 0.54);
            fine_frequency = vec3<f32>(3.55, 4.10, 1.52);
            residual_amplitude = 0.43;
            broad_weight = 0.72;
        } else if (species == 22) {
            // Castellanus retains vertically developed ice turrets above its
            // common condensation base.
            broad_frequency = vec3<f32>(1.75, 3.30, 1.38);
            fine_frequency = vec3<f32>(5.60, 7.80, 4.10);
            residual_amplitude = 0.54;
        } else if (species == 23) {
            // Floccus tufts contain fine granular heads and descending virga.
            broad_frequency = vec3<f32>(2.10, 0.72, 1.48);
            fine_frequency = vec3<f32>(6.20, 1.65, 3.95);
            residual_amplitude = 0.62;
            vertical_shear += 0.14;
        }
    } else if (genus == 2) {
        broad_frequency = vec3<f32>(3.20, 4.50, 3.00);
        fine_frequency = vec3<f32>(8.60, 10.80, 7.70);
        residual_amplitude = 0.60;
        broad_weight = 0.58;
        if (species == 24) {
            // Lenticularis is a laminar wave condensate: preserve the lens and
            // use only faint internal ice laminae instead of cauliflower grain.
            broad_frequency = vec3<f32>(0.82, 5.40, 0.40);
            fine_frequency = vec3<f32>(2.20, 11.40, 1.08);
            residual_amplitude = 0.20;
            broad_weight = 0.76;
        } else if (species == 5) {
            broad_frequency = vec3<f32>(3.05, 5.70, 2.75);
            fine_frequency = vec3<f32>(8.20, 12.20, 7.20);
        } else if (species == 25) {
            broad_frequency = vec3<f32>(3.80, 2.20, 3.40);
            fine_frequency = vec3<f32>(10.20, 5.60, 9.10);
            residual_amplitude = 0.66;
        }
    } else {
        // A Cirrostratus owner is a low-frequency translucent veil carrying
        // real embedded fibre bundles.  Nebulosus stays nearly uniform; only
        // fibratus receives enough crosswind variance to read as striated ice.
        broad_frequency = vec3<f32>(0.28, 4.20, 0.10);
        fine_frequency = vec3<f32>(1.18, 8.20, 0.31);
        residual_amplitude = select(0.14, 0.30, species == 6);
        broad_weight = select(0.82, 0.70, species == 6);
        vertical_shear *= 0.32;
    }

    let advected_position_km = owner_position_km + vec3<f32>(
        age * mix(0.18, 0.42, seeds.x),
        -age * mix(0.04, 0.16, seeds.y),
        age * mix(0.34, 0.78, seeds.w));
    let broad_position = vec3<f32>(
        advected_position_km.x * 0.819 + advected_position_km.z * 0.574,
        advected_position_km.y + advected_position_km.z * vertical_shear,
        -advected_position_km.x * 0.574 + advected_position_km.z * 0.819);
    let fine_position = vec3<f32>(
        advected_position_km.z * 0.438 - advected_position_km.x * 0.899,
        advected_position_km.y + advected_position_km.x *
            vertical_shear * 0.61,
        advected_position_km.z * 0.899 + advected_position_km.x * 0.438);
    // The appearance footprint is isotropic in the owner frame. Use the RMS
    // bandwidth of the orthonormal frequency vector rather than its largest
    // component; max-axis filtering is appropriate for conservative support
    // bounds, but erases valid oblique/high-cloud texture variance.
    let broad_world_frequency = cloud_volume_rms_world_frequency(
        broad_frequency);
    let fine_world_frequency = cloud_volume_rms_world_frequency(
        fine_frequency);
    // Camera and source transport sample the same stationary 3-D ice field.
    // A negative radius selects the camera pixel-cone LOD. Source transport
    // supplies the lateral footprint separately from the positive depth-node
    // support. Collapsing those axes into one isotropic radius selected mips
    // five and six for an ordinary Spissatus shadow node, erasing the 3-D ice
    // residual before Beer integration. The lateral footprint selects the
    // texture mip; the axial support is filtered analytically below along the
    // actual owner-local source ray.
    var broad_lod = cloud_volume_lod_at_local_position(
        local_position, broad_world_frequency, 128.0, 7.0);
    var fine_lod = cloud_volume_lod_at_local_position(
        local_position, fine_world_frequency, 64.0, 6.0);
    if (source_lateral_filter_radius_km >= 0.0) {
        let footprint_diameter_km = max(
            0.006, 2.0 * source_lateral_filter_radius_km);
        broad_lod = clamp(log2(max(1.0,
            footprint_diameter_km * broad_world_frequency * 128.0)),
            0.0, 7.0);
        fine_lod = clamp(log2(max(1.0,
            footprint_diameter_km * fine_world_frequency * 64.0)),
            0.0, 6.0);
    }
    let broad_sample = textureSampleLevel(
        base_volume, volume_sampler,
        fract(broad_position * broad_frequency + seeds.xyz * 23.17),
        broad_lod);
    let fine_sample = textureSampleLevel(
        detail_volume, volume_sampler,
        fract(fine_position * fine_frequency + seeds.wxy * 43.71),
        fine_lod);

    var broad_axial_transfer = 1.0;
    var fine_axial_transfer = 1.0;
    let source_ray_length = length(source_ray_direction_owner_local);
    if (source_lateral_filter_radius_km >= 0.0 &&
        source_depth_filter_radius_km > 0.0 &&
        source_ray_length > 1e-5) {
        let source_ray = source_ray_direction_owner_local /
            source_ray_length;
        let broad_ray_coordinate = vec3<f32>(
            source_ray.x * 0.819 + source_ray.z * 0.574,
            source_ray.y + source_ray.z * vertical_shear,
            -source_ray.x * 0.574 + source_ray.z * 0.819,
        ) * broad_frequency;
        let fine_ray_coordinate = vec3<f32>(
            source_ray.z * 0.438 - source_ray.x * 0.899,
            source_ray.y + source_ray.x * vertical_shear * 0.61,
            source_ray.z * 0.899 + source_ray.x * 0.438,
        ) * fine_frequency;
        // A Gaussian with the same second moment as the positive quadrature
        // node's uniform support is a smooth, nonnegative axial prefilter.
        // This is the anisotropic counterpart to the lateral texture mip:
        // broad source-ray variation survives while genuinely sub-support
        // detail converges to its mean without extra density samples.
        let broad_omega_sigma = 2.0 * PI *
            source_depth_filter_radius_km * length(broad_ray_coordinate);
        let fine_omega_sigma = 2.0 * PI *
            source_depth_filter_radius_km * length(fine_ray_coordinate);
        broad_axial_transfer = exp(
            -0.5 * broad_omega_sigma * broad_omega_sigma);
        fine_axial_transfer = exp(
            -0.5 * fine_omega_sigma * fine_omega_sigma);
    }

    // The shipped average-mip volume channels have nearly identical means
    // near 0.56, not 0.5. Weighted values minus 0.5 therefore added a smooth
    // positive density bias while their variance collapsed at distance.
    // Balanced differences cancel the common mean at every mip and expose
    // the stationary 3-D ice anatomy that the independent channels carry.
    let broad_channel_residual = clamp(
        (broad_sample.g - broad_sample.b - 0.0020) * 1.8 +
        (broad_sample.a - 0.5 * (broad_sample.g + broad_sample.b) -
            0.0004) * 1.1,
        -0.72, 0.72);
    let fine_channel_residual = clamp(
        (fine_sample.g - fine_sample.b - 0.0016) * 2.6 +
        (fine_sample.r - fine_sample.a - 0.0007) * 1.4,
        -0.72, 0.72);
    var centred_residual =
        broad_channel_residual * broad_weight * broad_axial_transfer +
        fine_channel_residual * (1.0 - broad_weight) *
            fine_axial_transfer;
    var fibre_contrast = 0.0;
    if (genus == 1 || (genus == 3 && species == 6)) {
        // A bounded difference of independent ice channels supplies broken
        // subfilaments without a periodic sine train or a hard cut through a
        // source-connected streamer.
        fibre_contrast = clamp(
            (fine_sample.g - fine_sample.b - 0.0016) * 0.22,
            -0.11, 0.11);
        centred_residual += fibre_contrast * fine_axial_transfer;
    }
    centred_residual = clamp(centred_residual, -0.72, 0.72);

    // Perturb atlas R only inside its symmetric [0, 1] headroom. For a
    // zero-mean residual this is mean-preserving at every fixed raw-R value,
    // needs no saturating positive lobe, and cannot create support where
    // atlas R is zero. Dense cores remain denser than their porous margins.
    let inward_depth = max(0.0, -sdf_voxels);
    let core_amount = smoothstep(2.0, 9.0, inward_depth);
    let local_amplitude = residual_amplitude * mix(1.0, 0.72, core_amount);
    let contrast_capacity = min(base_density, 1.0 - base_density);
    let resolved_density = clamp(
        base_density + centred_residual * contrast_capacity *
            saturate(2.0 * local_amplitude),
        0.0, 1.0);
    let resolved_detail = saturate(mix(
        macro_sample.g,
        0.5 + centred_residual,
        select(0.22, 0.38, genus == 2)));
    // The residual is a local, owner-frame second-moment proxy. Its absolute
    // contrast is bounded by the balanced channel differences above; source
    // footprints additionally reduce the along-ray correlation through the
    // physical axial Gaussian transfer. Neither signal changes resolved R or
    // condensate mass.
    // A zero residual at one texel is not proof that a fibre ensemble is
    // homogeneous: the owner-level porosity remains a measured population
    // prior. Species-specific floors retain that prior in a locally balanced
    // channel difference, while the residual raises variance where resolved
    // contrast is actually present.
    var variance_floor = 0.16;
    if (genus == 1) {
        variance_floor = select(0.26, 0.42, species == 2);
        variance_floor = select(variance_floor, 0.56, species == 1);
        variance_floor = select(variance_floor, 0.22, species == 3);
    } else if (genus == 2) {
        variance_floor = 0.20;
    } else if (genus == 3) {
        variance_floor = select(0.14, 0.20, species == 6);
    }
    // Use the component second moment, not the absolute weighted sum. Broad
    // and fine channels can cancel in their mean while retaining substantial
    // texture variance. The 0.22 RMS reference is calibrated to the shipped
    // 16³/8³ ice mips; the saturating ratio keeps the signal bounded and
    // monotone as footprint filtering removes component energy.
    let broad_energy = broad_channel_residual * broad_channel_residual *
        broad_weight * broad_weight * broad_axial_transfer *
        broad_axial_transfer;
    let fine_energy = fine_channel_residual * fine_channel_residual *
        (1.0 - broad_weight) * (1.0 - broad_weight) *
        fine_axial_transfer * fine_axial_transfer;
    let fibre_energy = fibre_contrast * fibre_contrast *
        fine_axial_transfer * fine_axial_transfer;
    let residual_rms = sqrt(max(0.0,
        broad_energy + fine_energy + fibre_energy));
    let residual_variance = saturate(
        residual_rms * residual_rms /
        max(1e-6, residual_rms * residual_rms + 0.22 * 0.22));
    let local_variance = saturate(variance_floor +
        (1.0 - variance_floor) * residual_variance);
    let local_correlation = saturate(mix(
        broad_axial_transfer,
        fine_axial_transfer,
        0.5));
    return vec4<f32>(
        resolved_density,
        resolved_detail,
        local_variance,
        local_correlation);
}

// The authored Spissatus realization is a conservative 96^3 condensate and
// support carrier, not the terminal display-resolution ice field.  Map its
// unresolved occupancy moments onto the locally resolved mean, then add the
// stationary procedural residual as a separate, bounded density variance.
// This preserves the authored clear/support probability, cannot grow material
// outside authored R/A support, and gives camera/source Beer closures the same
// distribution after either path samples the same owner-space residual.
fn cloud_spissatus_authored_second_moment(
    authored_density: f32,
    authored_second_moment: f32,
    resolved_density: f32,
) -> f32 {
    let source_mean = clamp(authored_density, 0.0, 1.0);
    let source_capacity = source_mean * (1.0 - source_mean);
    let source_variance = max(
        0.0,
        clamp(authored_second_moment,
            source_mean * source_mean, source_mean) -
            source_mean * source_mean);
    let occupancy_fraction = select(
        0.0,
        clamp(source_variance / max(1e-6, source_capacity), 0.0, 1.0),
        source_capacity > 1e-6);
    let mean = clamp(resolved_density, 0.0, 1.0);
    let mapped_variance = occupancy_fraction * mean * (1.0 - mean);
    return clamp(
        mean * mean + mapped_variance,
        mean * mean,
        mean);
}

fn cloud_spissatus_residual_density_variance(
    resolved_density: f32,
    authored_coverage: f32,
    sdf_voxels: f32,
) -> f32 {
    let mean = clamp(resolved_density, 0.0, 1.0);
    let contrast_capacity = min(mean, 1.0 - mean);
    // Match the exact Spissatus amplitude and core attenuation used by
    // cloud_resolved_high_ice_material.  The balanced volume channels are
    // calibrated to a 0.22 RMS stationary residual; expected-Beer performs
    // the subsequent footprint/correlation reduction exactly once.
    let inward_depth = max(0.0, -sdf_voxels);
    let core_amount = smoothstep(2.0, 9.0, inward_depth);
    let local_amplitude = 0.43 * mix(1.0, 0.72, core_amount);
    let residual_rms = contrast_capacity * 2.0 * local_amplitude * 0.22;
    // Source G is unconditional parent-cell support coverage.  The residual
    // exists only inside that authored support, so its unconditional moment
    // carries the same probability exactly once before the Beer footprint
    // closure reduces it by N_eff.
    let support_probability = clamp(authored_coverage, 0.0, 1.0);
    return clamp(
        support_probability * residual_rms * residual_rms,
        0.0,
        mean * (1.0 - mean));
}

struct CloudMacroOwnerSample {
    density: f32,
    detail: f32,
    ice_fraction: f32,
    // Local high-ice optical heterogeneity, independent of density/mass.
    // Correlation is reduced by the physical source-depth prefilter.
    unresolved_ice_variance: f32,
    unresolved_ice_correlation: f32,
    high_ice_second_moment: f32,
    high_ice_coverage: f32,
    high_ice_residual_variance: f32,
    high_ice_mean_density: f32,
    high_ice_correlation_length: f32,
    high_ice_lateral_filter_radius: f32,
    high_ice_depth_filter_radius: f32,
    interior_depth_fraction: f32,
};

fn empty_cloud_macro_owner_sample() -> CloudMacroOwnerSample {
    var result: CloudMacroOwnerSample;
    result.density = 0.0;
    result.detail = 0.0;
    result.ice_fraction = 0.0;
    result.unresolved_ice_variance = 0.0;
    result.unresolved_ice_correlation = 0.0;
    result.high_ice_second_moment = 0.0;
    result.high_ice_coverage = 0.0;
    result.high_ice_residual_variance = 0.0;
    result.high_ice_mean_density = 0.0;
    result.high_ice_correlation_length = 0.0;
    result.high_ice_lateral_filter_radius = 0.0;
    result.high_ice_depth_filter_radius = 0.0;
    result.interior_depth_fraction = 0.0;
    return result;
}

struct CloudHighIceAuthoredSample {
    density: f32,
    second_moment: f32,
    coverage: f32,
    resolved_fraction: f32,
    correlation_length: f32,
};

fn cloud_high_ice_authored_sample(
    canonical: vec3<f32>, atlas_binding: CloudMacroBinding,
    macro_density_input: f32, source_voxel_dimensions_km: vec3<f32>,
    lateral_filter_radius_km: f32, depth_filter_radius_km: f32,
    ray_direction_owner_local: vec3<f32>,
) -> CloudHighIceAuthoredSample {
    let macro_density = clamp(macro_density_input, 0.0, 1.0);
    var result: CloudHighIceAuthoredSample;
    result.density = macro_density;
    result.second_moment = macro_density * macro_density;
    result.coverage = select(0.0, 1.0, macro_density > 1e-6);
    result.resolved_fraction = 0.0;
    result.correlation_length = max(1e-4, pow(max(
        1e-12,
        source_voxel_dimensions_km.x * source_voxel_dimensions_km.y *
            source_voxel_dimensions_km.z), 0.3333333333));
    if (atlas_binding.high_ice_source_scale.w < 0.5 ||
        macro_density <= 1e-5) { return result; }

    let ray_length = length(ray_direction_owner_local);
    let ray_unit = select(
        vec3<f32>(0.0, 1.0, 0.0),
        ray_direction_owner_local / max(1e-5, ray_length),
        ray_length > 1e-5);
    let voxel_squared = source_voxel_dimensions_km *
        source_voxel_dimensions_km;
    let axial_voxel_km = max(1e-5, sqrt(dot(
        voxel_squared, ray_unit * ray_unit)));
    let lateral_voxel_km = max(1e-5, sqrt(max(
        1e-10,
        0.5 * dot(voxel_squared,
            vec3<f32>(1.0) - ray_unit * ray_unit))));
    result.correlation_length = axial_voxel_km;

    // A negative lateral radius is the explicit resident/coarse sentinel.
    // Otherwise one fine-voxel footprint is fully resolved, two or more are
    // fully restricted to macro R, and log2 gives the physical transition
    // between those sampling rates without camera- or screen-space noise.
    var resolved_fraction = 0.0;
    if (lateral_filter_radius_km >= 0.0) {
        let footprint_ratio = max(
            1.0,
            max(
                2.0 * max(0.0, lateral_filter_radius_km) /
                    lateral_voxel_km,
                2.0 * max(0.0, depth_filter_radius_km) /
                    axial_voxel_km));
        let restriction = clamp(log2(footprint_ratio), 0.0, 1.0);
        resolved_fraction = 1.0 - smoothstep(0.0, 1.0, restriction);
    }
    result.resolved_fraction = resolved_fraction;

    var fine_density = macro_density;
    var fine_coverage = select(0.0, 1.0, macro_density > 1e-6);
    if (resolved_fraction > 1e-5) {
        let fine_source = cloud_high_ice_source_sample(canonical, atlas_binding);
        // A is the conditioned fine material-support bit. It can only remove
        // R; macro majorant/SDF gates have already proved the parent support.
        fine_density = select(0.0, clamp(fine_source.r, 0.0, 1.0),
            fine_source.a > 1e-6);
        fine_coverage = select(0.0, 1.0, fine_density > 1e-6);
    }

    var coarse_second_moment = macro_density * macro_density;
    var coarse_coverage = select(0.0, 1.0, macro_density > 1e-6);
    if (resolved_fraction < 1.0 - 1e-5) {
        let coarse_moment = cloud_high_ice_source_coarse_moment_sample(
            canonical, atlas_binding);
        coarse_second_moment = clamp(
            coarse_moment.x,
            macro_density * macro_density,
            macro_density);
        coarse_coverage = clamp(coarse_moment.y, macro_density, 1.0);
    }

    let density = clamp(mix(
        macro_density, fine_density, resolved_fraction), 0.0, 1.0);
    let unresolved_variance = max(
        0.0,
        coarse_second_moment - macro_density * macro_density) *
        max(0.0, 1.0 - resolved_fraction * resolved_fraction);
    let coverage = clamp(max(
        density,
        mix(coarse_coverage, fine_coverage, resolved_fraction)), 0.0, 1.0);
    result.density = density;
    result.second_moment = clamp(
        density * density + unresolved_variance,
        density * density,
        density);
    result.coverage = coverage;
    return result;
}

fn cloud_macro_owner_sample(
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding, genus: i32,
    parent_owner_index: u32,
    fibratus_filter_radius_km: f32,
    fibratus_ray_step_length_km: f32,
    fibratus_ray_direction: vec3<f32>,
) -> CloudMacroOwnerSample {
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let base_altitude = system.vertical_extent.x;
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = local_position.xz - center;
    let undeformed_canonical = vec3<f32>(
        0.5 + dot(delta, crosswind_axis) / (2.0 * minor_radius),
        (local_position.y - base_altitude) / geometric_depth,
        0.5 + dot(delta, downwind_axis) / (2.0 * major_radius));
    // 0.1065 is the largest manifest traversal inflation. The extra texel
    // allows trilinear and central-difference support without adjacent-volume
    // bleed (sampling itself is explicitly clamped below).
    if (any(undeformed_canonical < vec3<f32>(-0.13)) ||
        any(undeformed_canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    let topology = i32(round(atlas_binding.majorant_offset.w));
    let canonical = deform_cloud_macro_coordinate(
        undeformed_canonical, system, formation_mechanism, topology);
    if (any(canonical < vec3<f32>(-0.13)) ||
        any(canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }

    let majorant_coordinate_local = clamp(
        canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let majorant_uv = majorant_coordinate_local * atlas_binding.majorant_scale.xyz +
        atlas_binding.majorant_offset.xyz;
    let majorant_dimensions_u = textureDimensions(cloud_macro_majorants);
    let majorant_dimensions = vec3<i32>(majorant_dimensions_u);
    let majorant_coordinate = clamp(
        vec3<i32>(floor(majorant_uv * vec3<f32>(majorant_dimensions_u))),
        vec3<i32>(0), majorant_dimensions - vec3<i32>(1));
    let conservative_majorant = textureLoad(
        cloud_macro_majorants, majorant_coordinate, 0).r;
    // Atlas-v2 permits only this conservative potential-density majorant to
    // skip both interior and procedural exterior evaluation.
    if (conservative_majorant <= 0.0001) {
        return empty_cloud_macro_owner_sample();
    }

    // Sample RGBA even when R is zero. A/G/B remain authoritative inputs for
    // permitted exterior support in that exact case.
    let macro_sample = cloud_macro_volume_rgba(canonical, atlas_binding);
    // RGBA and signed distance share one atlas texel. Reusing alpha here is
    // value-identical to a second lookup and halves macro-atlas traffic for
    // every exact material/source query.
    let sdf_voxels = cloud_macro_sdf_voxels(canonical, macro_sample.a);
    let species = i32(round(system.identity.w));
    let transport_material_density = cloud_macro_transport_material_density(
        macro_sample, formation_mechanism, genus, species);
    let authored_source_allowed = genus >= 1 && genus <= 3 &&
        !(species == 1 && formation_mechanism == 3) &&
        atlas_binding.high_ice_source_scale.w > 0.5;
    var result: CloudMacroOwnerSample;
    if (species == 1 && formation_mechanism == 3) {
        // Only analytic fibratus consumes a tangent-relative ray sweep.  Keep
        // the two owner-frame dot products behind all support/majorant tests
        // and the exact species gate so every other cloud is unchanged and
        // pays no camera-footprint transform cost.
        let fibratus_ray_direction_owner_local = vec3<f32>(
            dot(fibratus_ray_direction.xz, crosswind_axis),
            fibratus_ray_direction.y,
            dot(fibratus_ray_direction.xz, downwind_axis));
        // Fibratus owns an analytic subvoxel cross-section. Do not first pay
        // for (or visually inherit) the generic six-tap SDF-normal exterior
        // displacement which expands a one-to-two-voxel macro envelope into
        // the broad brush this reconstruction is designed to replace.
        result.density =
            cloud_morphology_cirrus_fibratus_subvoxel_density(
                parent_owner_index,
                canonical,
                transport_material_density,
                sdf_voxels,
                vec3<f32>(
                    minor_radius,
                    geometric_depth * 0.5,
                    major_radius),
                system.deterministic_seeds,
                formation_mechanism,
                species,
                max(0.0, fibratus_filter_radius_km),
                max(0.0, fibratus_ray_step_length_km),
                fibratus_ray_direction_owner_local);
    } else if (genus >= 1 && genus <= 3) {
        // Cc, Cs, and non-fibratus Ci use the exact same calibrated atlas-R
        // support in camera and source transport. Their visible grain anatomy
        // is added by the shared resolved-high-ice evaluator below.
        result.density = transport_material_density;
    } else {
        result.density = cloud_macro_displaced_boundary_density(
            canonical, macro_sample, sdf_voxels, local_position, system,
            atlas_binding, genus, formation_mechanism);
    }
    // Camera queries carry the actual pixel-cone radius, occupied subsegment
    // length, and unit ray.  Source-grid callers intentionally pass zero
    // footprints and retain the stationary material fallback; the directional
    // coupling path has its own lateral/depth-filtered owner evaluator below.
    // Keeping the camera packet explicit prevents a hard-coded zero footprint
    // from erasing Ci/Cc/Cs variance before the Beer event is formed.
    var high_ice_lateral_filter_radius_km = -1.0;
    var high_ice_depth_filter_radius_km = 0.0;
    var high_ice_ray_direction_owner_local = vec3<f32>(0.0);
    let camera_footprint_query =
        fibratus_filter_radius_km > 1e-7 ||
        fibratus_ray_step_length_km > 1e-7;
    if (camera_footprint_query) {
        high_ice_lateral_filter_radius_km =
            max(0.0, fibratus_filter_radius_km);
        high_ice_depth_filter_radius_km =
            max(0.0, fibratus_ray_step_length_km) *
                CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR;
        high_ice_ray_direction_owner_local = vec3<f32>(
            dot(fibratus_ray_direction.xz, crosswind_axis),
            fibratus_ray_direction.y,
            dot(fibratus_ray_direction.xz, downwind_axis));
    }
    let source_voxel_dimensions = vec3<f32>(
        2.0 * minor_radius / 96.0,
        geometric_depth / 96.0,
        2.0 * major_radius / 96.0);
    if (authored_source_allowed) {
        // The authored 96^3 realization owns mass and finite support. Dense
        // Spissatus additionally resolves a bounded sub-voxel ice field; the
        // identical call in directional coupling keeps light and camera
        // transport on one stationary 3-D realization.
        let authored = cloud_high_ice_authored_sample(
            canonical, atlas_binding, transport_material_density,
            source_voxel_dimensions,
            high_ice_lateral_filter_radius_km,
            high_ice_depth_filter_radius_km,
            high_ice_ray_direction_owner_local);
        var resolved_authored = vec4<f32>(
            authored.density, saturate(macro_sample.g), 0.0, 0.0);
        if (species == 3) {
            resolved_authored = cloud_resolved_high_ice_material(
                canonical, local_position, macro_sample, sdf_voxels,
                authored.density, system, genus, species,
                high_ice_lateral_filter_radius_km,
                high_ice_depth_filter_radius_km,
                high_ice_ray_direction_owner_local);
        }
        result.density = resolved_authored.x;
        result.detail = resolved_authored.y;
        result.unresolved_ice_variance = 0.0;
        result.unresolved_ice_correlation = 0.0;
        result.high_ice_second_moment = select(
            authored.second_moment,
            cloud_spissatus_authored_second_moment(
                authored.density,
                authored.second_moment,
                result.density),
            species == 3);
        result.high_ice_coverage = authored.coverage;
        result.high_ice_residual_variance = select(
            0.0,
            cloud_spissatus_residual_density_variance(
                result.density, authored.coverage, sdf_voxels),
            species == 3);
        result.high_ice_mean_density = result.density;
        result.high_ice_correlation_length = select(
            authored.correlation_length,
            max(authored.correlation_length, 0.18),
            species == 3);
        result.high_ice_lateral_filter_radius = max(
            0.0, high_ice_lateral_filter_radius_km);
        result.high_ice_depth_filter_radius = max(
            0.0, high_ice_depth_filter_radius_km);
    } else {
        let resolved_high_ice = cloud_resolved_high_ice_material(
            canonical, local_position, macro_sample, sdf_voxels,
            result.density, system, genus, species,
            high_ice_lateral_filter_radius_km,
            high_ice_depth_filter_radius_km,
            high_ice_ray_direction_owner_local);
        result.density = resolved_high_ice.x;
        result.detail = resolved_high_ice.y;
        result.unresolved_ice_variance = resolved_high_ice.z;
        result.unresolved_ice_correlation = resolved_high_ice.w;
        result.high_ice_second_moment = 0.0;
        result.high_ice_coverage = 0.0;
        result.high_ice_residual_variance = 0.0;
        result.high_ice_mean_density = 0.0;
        result.high_ice_correlation_length = 0.0;
        result.high_ice_lateral_filter_radius = 0.0;
        result.high_ice_depth_filter_radius = 0.0;
    }
    result.ice_fraction = saturate(macro_sample.b);
    // The packed signed distance is fetched with the authoritative density.
    // Retaining its normalized inward distance gives the lighting closure a
    // continuous low-frequency self-visibility proxy at zero extra fetches.
    result.interior_depth_fraction = saturate(max(0.0, -sdf_voxels) / 47.0);
    return result;
}

fn cloud_macro_atlas_sample_with_footprint(
    point: vec3<f32>, layer_index: i32, genus: i32, resolve_optics: bool,
    restrict_to_active: bool, active_set: OrderedActiveSet,
    fibratus_filter_radius_km: f32,
    fibratus_ray_step_length_km: f32,
    fibratus_ray_direction: vec3<f32>,
) -> CloudMacroSample {
    if (abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return empty_cloud_macro_sample();
    }
    let system_count = min(
        36,
        min(
            i32(max(0.0, cloud_system_buffer.header.x)),
            i32(max(0.0, cloud_macro_bindings.header.x)),
        ),
    );
    let local_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    var density_union = 0.0;
    var weighted_detail = 0.0;
    var weighted_phase = 0.0;
    var weighted_ice_variance = 0.0;
    var weighted_ice_correlation = 0.0;
    var weighted_high_ice_residual_variance = 0.0;
    var weighted_high_ice_correlation_length = 0.0;
    var weighted_high_ice_lateral_filter_radius = 0.0;
    var weighted_high_ice_depth_filter_radius = 0.0;
    var clear_density_product = 1.0;
    var clear_second_moment_product = 1.0;
    var clear_support_product = 1.0;
    var high_ice_owner_active = false;
    var high_ice_owner_weight = 0.0;
    var material_weight = 0.0;
    var matched_owner = 0.0;
    var dominant_owner = 0.0;
    var dominant_owner_density = 0.0;
    var extinction_density_sum = 0.0;
    var spectral_extinction_density_sum = vec3<f32>(0.0);
    var mass_density_calibration_sum = 0.0;
    var scattering_density_sum = vec3<f32>(0.0);
    var scattering_asymmetry_density_sum = vec3<f32>(0.0);
    var upper_path_extinction_sum = vec3<f32>(0.0);
    var lower_path_extinction_sum = vec3<f32>(0.0);
    var primary_optical_strength = 0.0;
    var secondary_optical_strength = 0.0;
    var primary_owner = 0.0;
    var secondary_owner = 0.0;
    var primary_ice_fraction = 0.0;
    var secondary_ice_fraction = 0.0;

    // The fixed bound is part of the production safety contract. The header
    // shortens normal scenes to their actual finite population.
    for (var slot = 0; slot < 36; slot++) {
        if (slot >= system_count) { break; }
        let system = cloud_system_buffer.systems[slot];
        let atlas_binding = cloud_macro_bindings.owners[slot];
        if (system.identity.x < 0.5 ||
            i32(round(system.identity.y)) != layer_index ||
            i32(round(system.identity.z)) != genus ||
            atlas_binding.atlas_scale.w < 0.5) {
            continue;
        }
        // Once a supported owner exists for this layer, clear space outside
        // its finite volume is intentional. Do not resurrect the legacy
        // camera-authored population in those regions.
        matched_owner = 1.0;
        if (restrict_to_active &&
            !ordered_active_contains(active_set, u32(slot))) { continue; }

        let morphology = cloud_morphology_evaluate_owner(
            u32(slot), local_position);
        let base_sample = cloud_macro_owner_sample(
            morphology.base_position_km, system, atlas_binding, genus,
            u32(slot), fibratus_filter_radius_km,
            fibratus_ray_step_length_km, fibratus_ray_direction);
        var placement_sample = empty_cloud_macro_owner_sample();
        if (morphology.placement_weight > 0.0001) {
            placement_sample = cloud_macro_owner_sample(
                morphology.placement_position_km, system, atlas_binding, genus,
                u32(slot), fibratus_filter_radius_km,
                fibratus_ray_step_length_km, fibratus_ray_direction);
        }
        var reuse_sample = empty_cloud_macro_owner_sample();
        if (morphology.reuse_weight > 0.0001) {
            // Reuse samples the undeformed owner at this world point. The
            // modifier's macro code remains available for a future binding
            // table containing alternate per-owner atlas transforms.
            reuse_sample = cloud_macro_owner_sample(
                local_position, system, atlas_binding, genus, u32(slot),
                fibratus_filter_radius_km,
                fibratus_ray_step_length_km, fibratus_ray_direction);
        }
        let owner_density = cloud_morphology_compose_density(
            morphology,
            base_sample.density,
            placement_sample.density,
            reuse_sample.density);
        if (owner_density <= 0.0001) { continue; }
        let fallback_ice = saturate(1.0 - system.optical_material.y);
        let base_attribute_weight = base_sample.density * morphology.base_coverage;
        let placement_attribute_weight = placement_sample.density *
            morphology.placement_weight;
        let reuse_attribute_weight = reuse_sample.density * morphology.reuse_weight;
        let additive_attribute_weight = morphology.additive_density;
        let attribute_weight = base_attribute_weight + placement_attribute_weight +
            reuse_attribute_weight + additive_attribute_weight;
        let local_detail = select(
            mix(0.12, 0.92, fallback_ice),
            (base_sample.detail * (base_attribute_weight + additive_attribute_weight) +
                placement_sample.detail * placement_attribute_weight +
                reuse_sample.detail * reuse_attribute_weight) /
                max(0.0001, attribute_weight),
            attribute_weight > 0.0001);
        let local_ice_variance = select(
            0.0,
            (base_sample.unresolved_ice_variance *
                (base_attribute_weight + additive_attribute_weight) +
                placement_sample.unresolved_ice_variance *
                    placement_attribute_weight +
                reuse_sample.unresolved_ice_variance *
                    reuse_attribute_weight) /
                max(0.0001, attribute_weight),
            attribute_weight > 0.0001);
        let local_ice_correlation = select(
            0.0,
            (base_sample.unresolved_ice_correlation *
                (base_attribute_weight + additive_attribute_weight) +
                placement_sample.unresolved_ice_correlation *
                    placement_attribute_weight +
                reuse_sample.unresolved_ice_correlation *
                    reuse_attribute_weight) /
                max(0.0001, attribute_weight),
            attribute_weight > 0.0001);
        // Morphology is an independent union, not a normalized attribute
        // blend. Scale each authored random density by its deterministic
        // component weight, then compose P1/P2/support with the same clear
        // products used by cloud_morphology_compose_density.
        let base_component_density = clamp(
            base_sample.density * morphology.base_coverage, 0.0, 1.0);
        let placement_component_density = clamp(
            placement_sample.density * morphology.placement_weight, 0.0, 1.0);
        let reuse_component_density = clamp(
            reuse_sample.density * morphology.reuse_weight, 0.0, 1.0);
        let additive_component_density = clamp(
            morphology.additive_density, 0.0, 1.0);
        let base_sidecar_active = base_sample.high_ice_coverage > 1e-5 ||
            base_sample.high_ice_second_moment > 1e-5;
        let placement_sidecar_active =
            placement_sample.high_ice_coverage > 1e-5 ||
            placement_sample.high_ice_second_moment > 1e-5;
        let reuse_sidecar_active = reuse_sample.high_ice_coverage > 1e-5 ||
            reuse_sample.high_ice_second_moment > 1e-5;
        let base_sidecar_density = select(0.0, base_component_density,
            base_sidecar_active);
        let placement_sidecar_density = select(
            0.0, placement_component_density, placement_sidecar_active);
        let reuse_sidecar_density = select(0.0, reuse_component_density,
            reuse_sidecar_active);
        let base_component_second_moment = clamp(
            base_sample.high_ice_second_moment *
                morphology.base_coverage * morphology.base_coverage,
            base_component_density * base_component_density,
            base_component_density);
        let placement_component_second_moment = clamp(
            placement_sample.high_ice_second_moment *
                morphology.placement_weight * morphology.placement_weight,
            placement_component_density * placement_component_density,
            placement_component_density);
        let reuse_component_second_moment = clamp(
            reuse_sample.high_ice_second_moment *
                morphology.reuse_weight * morphology.reuse_weight,
            reuse_component_density * reuse_component_density,
            reuse_component_density);
        // Additive procedural support is deterministic. It participates in
        // the density/E2 union when an authored sidecar is present, but it
        // cannot by itself activate the high-ice sidecar closure.
        let additive_component_second_moment =
            additive_component_density * additive_component_density;
        let component_second_moment_product =
            (1.0 - 2.0 * base_component_density +
                base_component_second_moment) *
            (1.0 - 2.0 * placement_component_density +
                placement_component_second_moment) *
            (1.0 - 2.0 * reuse_component_density +
                reuse_component_second_moment) *
            (1.0 - 2.0 * additive_component_density +
                additive_component_second_moment);
        let component_density_product =
            (1.0 - base_component_density) *
            (1.0 - placement_component_density) *
            (1.0 - reuse_component_density) *
            (1.0 - additive_component_density);
        let base_support = select(0.0, base_sample.high_ice_coverage,
            base_sidecar_density > 1e-5);
        let placement_support = select(0.0,
            placement_sample.high_ice_coverage,
            placement_sidecar_density > 1e-5);
        let reuse_support = select(0.0, reuse_sample.high_ice_coverage,
            reuse_sidecar_density > 1e-5);
        let pre_subtractive_second_moment =
            1.0 - 2.0 * component_density_product +
                component_second_moment_product;
        let subtractive_scale = 1.0 -
            clamp(morphology.subtractive_density, 0.0, 1.0);
        let sidecar_signal = base_sidecar_density > 1e-5 ||
            placement_sidecar_density > 1e-5 ||
            reuse_sidecar_density > 1e-5;
        let local_high_ice_second_moment = select(
            0.0,
            clamp(pre_subtractive_second_moment *
                    subtractive_scale * subtractive_scale,
                owner_density * owner_density, owner_density),
            sidecar_signal);
        let local_high_ice_coverage = clamp(
            1.0 - (1.0 - base_support) *
                (1.0 - placement_support) * (1.0 - reuse_support) *
                (1.0 - select(0.0, 1.0,
                    additive_component_density > 1e-5 && sidecar_signal)),
            0.0, 1.0) * select(0.0, 1.0, subtractive_scale > 1e-5);
        let local_high_ice_residual_variance = select(
            0.0,
            (base_sample.high_ice_residual_variance *
                base_sidecar_density +
                placement_sample.high_ice_residual_variance *
                    placement_sidecar_density +
                reuse_sample.high_ice_residual_variance *
                    reuse_sidecar_density) /
                max(0.0001, base_sidecar_density +
                    placement_sidecar_density + reuse_sidecar_density),
            base_sidecar_density + placement_sidecar_density +
                reuse_sidecar_density > 0.0001);
        let local_ice = select(
            fallback_ice,
            (base_sample.ice_fraction * (base_attribute_weight + additive_attribute_weight) +
                placement_sample.ice_fraction * placement_attribute_weight +
                reuse_sample.ice_fraction * reuse_attribute_weight) /
            max(0.0001, attribute_weight),
            attribute_weight > 0.0001);
        // Reuse the signed distance fetched with each authoritative macro
        // sample. Analytic morphology has no atlas SDF, so its continuous
        // density supplies a deliberately shallow local depth instead of
        // inventing a long opaque column.
        let additive_interior_depth =
            saturate(morphology.additive_density) * 0.04;
        let local_interior_depth_fraction = select(
            saturate(owner_density) / 47.0,
            (base_sample.interior_depth_fraction * base_attribute_weight +
                placement_sample.interior_depth_fraction *
                    placement_attribute_weight +
                reuse_sample.interior_depth_fraction *
                    reuse_attribute_weight +
                additive_interior_depth * additive_attribute_weight) /
                max(0.0001, attribute_weight),
            attribute_weight > 0.0001);

        if (resolve_optics) {
            let optical_moments = cloud_local_optical_moments(
                u32(slot), local_ice);
            var owner_extinction =
                cloud_owner_extinction_coefficient_from_mass_extinction(
                    system, atlas_binding, local_ice,
                    optical_moments.mass_extinction);
            if (morphology.target_optical_depth >= 0.0 &&
                morphology.optical_weight > 0.0001) {
                let remapped_extinction = morphology.target_optical_depth /
                    max(0.0001, system.vertical_extent.y *
                        atlas_binding.condensate_paths.x);
                owner_extinction = mix(
                    owner_extinction,
                    remapped_extinction,
                    saturate(morphology.optical_weight));
            }
            let optical_strength = owner_density * owner_extinction;
            extinction_density_sum += optical_strength;
            let scalar_mass_extinction = max(1e-8, photopic(
                optical_moments.mass_extinction));
            let calibration = owner_density * owner_extinction /
                scalar_mass_extinction;
            let owner_spectral_extinction =
                calibration * optical_moments.mass_extinction;
            spectral_extinction_density_sum += owner_spectral_extinction;
            // calibration is proportional to the local condensate mass
            // concentration: sigma_t(lambda) = rho * kappa_t(lambda). Keeping
            // it separate from sigma_t preserves CloudLocalOptics' m^2/kg ABI.
            mass_density_calibration_sum += calibration;
            scattering_density_sum +=
                calibration * optical_moments.scattering;
            scattering_asymmetry_density_sum +=
                calibration * optical_moments.scattering_asymmetry;
            // The ambient proxy is local, not an averaged synthetic slab. Each
            // owner contributes a path computed in its own physical vertical
            // support. The coarse inward SDF remains useful, but displaced
            // density gates it continuously so a fixed atlas cell cannot stamp
            // a dark plateau across changing boundary relief. The atlas SDF is
            // already a bounded local-distance measurement. Reuse its complete
            // encoded range: imposing a second six-voxel cap made nonresident
            // dense cores inherit near-boundary diffuse fill even though their
            // camera and directional Beer paths remained optically deep.
            let owner_depth_km = max(0.02, system.vertical_extent.y);
            let owner_height_fraction = saturate(
                (local_position.y - system.vertical_extent.x) /
                    owner_depth_km);
            let owner_voxel_km = owner_depth_km / 47.0;
            let density_response = smoothstep(
                0.0, 1.0, saturate(owner_density));
            let boundary_reach_km = owner_voxel_km * mix(
                0.20, 0.90, sqrt(saturate(owner_density)));
            let unresolved_reach_km = boundary_reach_km +
                owner_depth_km * local_interior_depth_fraction *
                    density_response * 1.35;
            let encoded_sdf_reach_voxels = min(
                47.0, max(1.0, cloud_macro_bindings.header.w));
            let reach_cap_km =
                owner_voxel_km * encoded_sdf_reach_voxels;
            let local_reach_km = reach_cap_km * (1.0 - exp(
                -unresolved_reach_km / max(1e-5, reach_cap_km)));
            let upper_length_km = min(
                local_reach_km,
                max(0.0, (1.0 - owner_height_fraction) * owner_depth_km));
            let lower_length_km = min(
                local_reach_km,
                max(0.0, owner_height_fraction * owner_depth_km));
            upper_path_extinction_sum +=
                owner_spectral_extinction * upper_length_km;
            lower_path_extinction_sum +=
                owner_spectral_extinction * lower_length_km;
            if (optical_strength > primary_optical_strength) {
                secondary_optical_strength = primary_optical_strength;
                secondary_owner = primary_owner;
                secondary_ice_fraction = primary_ice_fraction;
                primary_optical_strength = optical_strength;
                primary_owner = f32(slot + 1);
                primary_ice_fraction = local_ice;
            } else if (optical_strength > secondary_optical_strength) {
                secondary_optical_strength = optical_strength;
                secondary_owner = f32(slot + 1);
                secondary_ice_fraction = local_ice;
            }
        }

        if (owner_density > dominant_owner_density) {
            dominant_owner_density = owner_density;
            // One-based encoding preserves the existing > 0.5 matched-owner
            // contract while carrying the exact physical owner into the local
            // optical-material lookup. Owner zero is therefore encoded as 1.
            dominant_owner = f32(slot + 1);
        }

        // Beer/coverage union preserves each connected owner and lets genuine
        // overlaps accumulate without summing normalized density above one.
        density_union = 1.0 - (1.0 - density_union) * (1.0 - owner_density);
        weighted_detail += local_detail * owner_density;
        weighted_phase += local_ice * owner_density;
        weighted_ice_variance += local_ice_variance * owner_density;
        weighted_ice_correlation += local_ice_correlation * owner_density;
        let local_high_ice_active = local_high_ice_coverage > 1e-5 ||
            local_high_ice_second_moment > 1e-5;
        if (local_high_ice_active) {
            high_ice_owner_active = true;
            high_ice_owner_weight += owner_density;
            let owner_second_moment = clamp(
                local_high_ice_second_moment,
                owner_density * owner_density,
                owner_density);
            clear_density_product *= 1.0 - owner_density;
            clear_second_moment_product *=
                1.0 - 2.0 * owner_density + owner_second_moment;
            clear_support_product *=
                1.0 - clamp(local_high_ice_coverage, 0.0, 1.0);
            weighted_high_ice_residual_variance +=
                local_high_ice_residual_variance * owner_density;
            let sidecar_filter_weight = max(1e-5,
                (base_sidecar_density + placement_sidecar_density +
                    reuse_sidecar_density) *
                max(0.0, 1.0 -
                    clamp(morphology.subtractive_density, 0.0, 1.0)));
            weighted_high_ice_correlation_length +=
                ((base_sample.high_ice_correlation_length *
                    base_sidecar_density +
                    placement_sample.high_ice_correlation_length *
                        placement_sidecar_density +
                    reuse_sample.high_ice_correlation_length *
                        reuse_sidecar_density) *
                max(0.0, 1.0 -
                    clamp(morphology.subtractive_density, 0.0, 1.0)) /
                    sidecar_filter_weight) * owner_density;
            weighted_high_ice_lateral_filter_radius +=
                (((base_sample.high_ice_lateral_filter_radius *
                    base_sidecar_density +
                    placement_sample.high_ice_lateral_filter_radius *
                        placement_sidecar_density +
                    reuse_sample.high_ice_lateral_filter_radius *
                        reuse_sidecar_density) *
                max(0.0, 1.0 -
                    clamp(morphology.subtractive_density, 0.0, 1.0))) /
                    sidecar_filter_weight) * owner_density;
            weighted_high_ice_depth_filter_radius +=
                (((base_sample.high_ice_depth_filter_radius *
                    base_sidecar_density +
                    placement_sample.high_ice_depth_filter_radius *
                        placement_sidecar_density +
                    reuse_sample.high_ice_depth_filter_radius *
                        reuse_sidecar_density) *
                max(0.0, 1.0 -
                    clamp(morphology.subtractive_density, 0.0, 1.0))) /
                    sidecar_filter_weight) * owner_density;
        }
        material_weight += owner_density;
    }
    var result = empty_cloud_macro_sample();
    result.density = saturate(density_union);
    result.detail = weighted_detail / max(0.0001, material_weight);
    result.ice_fraction = weighted_phase / max(0.0001, material_weight);
    result.unresolved_ice_variance = weighted_ice_variance /
        max(0.0001, material_weight);
    result.unresolved_ice_correlation = weighted_ice_correlation /
        max(0.0001, material_weight);
    if (high_ice_owner_active) {
        let high_ice_mean_density = clamp(
            1.0 - clear_density_product, 0.0, 1.0);
        result.high_ice_second_moment = clamp(
            1.0 - 2.0 * clear_density_product + clear_second_moment_product,
            high_ice_mean_density * high_ice_mean_density,
            high_ice_mean_density);
        result.high_ice_coverage = clamp(1.0 - clear_support_product,
            0.0, 1.0);
        result.high_ice_residual_variance =
            weighted_high_ice_residual_variance /
            max(0.0001, high_ice_owner_weight);
        result.high_ice_mean_density = high_ice_mean_density;
        result.high_ice_correlation_length =
            weighted_high_ice_correlation_length /
            max(0.0001, high_ice_owner_weight);
        result.high_ice_lateral_filter_radius =
            weighted_high_ice_lateral_filter_radius /
            max(0.0001, high_ice_owner_weight);
        result.high_ice_depth_filter_radius =
            weighted_high_ice_depth_filter_radius /
            max(0.0001, high_ice_owner_weight);
    }
    result.matched_owner = matched_owner;
    result.extinction_coefficient = extinction_density_sum /
        max(0.0001, result.density);
    result.spectral_extinction_coefficient =
        spectral_extinction_density_sum / max(0.0001, result.density);
    result.effective_mass_extinction =
        spectral_extinction_density_sum /
            max(vec3<f32>(1e-8), vec3<f32>(mass_density_calibration_sum));
    result.single_scattering_albedo = clamp(
        scattering_density_sum /
            max(vec3<f32>(1e-8), spectral_extinction_density_sum),
        vec3<f32>(0.0), vec3<f32>(1.0));
    result.asymmetry = clamp(
        scattering_asymmetry_density_sum /
            max(vec3<f32>(1e-8), scattering_density_sum),
        vec3<f32>(-0.985), vec3<f32>(0.985));
    result.retained_optical_fraction = saturate(
        (primary_optical_strength + secondary_optical_strength) /
            max(0.0001, extinction_density_sum));
    result.local_upper_path_km = upper_path_extinction_sum /
        max(vec3<f32>(1e-8), spectral_extinction_density_sum);
    result.local_lower_path_km = lower_path_extinction_sum /
        max(vec3<f32>(1e-8), spectral_extinction_density_sum);
    result.primary_owner = select(
        dominant_owner, primary_owner, primary_owner > 0.5);
    result.secondary_owner = secondary_owner;
    result.primary_fraction = primary_optical_strength /
        max(0.0001, primary_optical_strength + secondary_optical_strength);
    result.primary_ice_fraction = select(
        result.ice_fraction,
        primary_ice_fraction,
        primary_owner > 0.5);
    result.secondary_ice_fraction = secondary_ice_fraction;
    return result;
}

fn cloud_macro_atlas_sample_filtered(
    point: vec3<f32>, layer_index: i32, genus: i32, resolve_optics: bool,
    restrict_to_active: bool, active_set: OrderedActiveSet,
) -> CloudMacroSample {
    return cloud_macro_atlas_sample_with_footprint(
        point, layer_index, genus, resolve_optics,
        restrict_to_active, active_set,
        0.0, 0.0, vec3<f32>(0.0));
}

fn cloud_macro_atlas_sample(
    point: vec3<f32>, layer_index: i32, genus: i32, resolve_optics: bool,
) -> CloudMacroSample {
    return cloud_macro_atlas_sample_filtered(
        point, layer_index, genus, resolve_optics,
        false, empty_ordered_active_set());
}

struct CloudLocalMaterial {
    extinction_coefficient: f32,
    spectral_extinction_coefficient: vec3<f32>,
    effective_mass_extinction: vec3<f32>,
    single_scattering_albedo: vec3<f32>,
    asymmetry: vec3<f32>,
    retained_optical_fraction: f32,
    local_upper_path_km: vec3<f32>,
    local_lower_path_km: vec3<f32>,
    atlas_match: f32,
    primary_owner: f32,
    secondary_owner: f32,
    primary_fraction: f32,
    primary_ice_fraction: f32,
    secondary_ice_fraction: f32,
    unresolved_ice_variance: f32,
    unresolved_ice_correlation: f32,
    high_ice_second_moment: f32,
    high_ice_coverage: f32,
    high_ice_residual_variance: f32,
    high_ice_mean_density: f32,
    high_ice_correlation_length: f32,
    high_ice_lateral_filter_radius: f32,
    high_ice_depth_filter_radius: f32,
};

struct CloudDensityMaterialSample {
    density: f32,
    material: CloudLocalMaterial,
};

// View and light transport resolve the identical overlapping-owner material.
// Extinction includes every owner. Angular optics blend the two strongest
// extinction contributions so an overlap cannot snap to whichever normalized
// density happens to be microscopically larger at one sample.
fn cloud_local_material_from_macro_sample(
    macro_sample: CloudMacroSample, layer: Layer,
) -> CloudLocalMaterial {
    var result: CloudLocalMaterial;
    result.extinction_coefficient = max(0.0, layer.geometry.w);
    result.spectral_extinction_coefficient = vec3<f32>(
        result.extinction_coefficient);
    result.effective_mass_extinction = vec3<f32>(1.0);
    result.single_scattering_albedo = vec3<f32>(0.999);
    result.asymmetry = vec3<f32>(0.82);
    result.retained_optical_fraction = 1.0;
    result.local_upper_path_km = vec3<f32>(0.0);
    result.local_lower_path_km = vec3<f32>(0.0);
    result.atlas_match = 0.0;
    result.primary_owner = 1.0;
    result.secondary_owner = 0.0;
    result.primary_fraction = 1.0;
    result.primary_ice_fraction = layer.phase.x;
    result.secondary_ice_fraction = layer.phase.x;
    result.unresolved_ice_variance = 0.0;
    result.unresolved_ice_correlation = 0.0;
    result.high_ice_second_moment = 0.0;
    result.high_ice_coverage = 0.0;
    result.high_ice_residual_variance = 0.0;
    result.high_ice_mean_density = 0.0;
    result.high_ice_correlation_length = 0.0;
    result.high_ice_lateral_filter_radius = 0.0;
    result.high_ice_depth_filter_radius = 0.0;
    if (macro_sample.primary_owner > 0.5) {
        result.extinction_coefficient = macro_sample.extinction_coefficient;
        result.spectral_extinction_coefficient =
            macro_sample.spectral_extinction_coefficient;
        result.effective_mass_extinction =
            macro_sample.effective_mass_extinction;
        result.single_scattering_albedo =
            macro_sample.single_scattering_albedo;
        result.asymmetry = macro_sample.asymmetry;
        result.retained_optical_fraction =
            macro_sample.retained_optical_fraction;
        result.local_upper_path_km = macro_sample.local_upper_path_km;
        result.local_lower_path_km = macro_sample.local_lower_path_km;
        result.atlas_match = 1.0;
        result.primary_owner = macro_sample.primary_owner;
        result.secondary_owner = macro_sample.secondary_owner;
        result.primary_fraction = macro_sample.primary_fraction;
        result.primary_ice_fraction = macro_sample.primary_ice_fraction;
        result.secondary_ice_fraction = macro_sample.secondary_ice_fraction;
        result.unresolved_ice_variance = macro_sample.unresolved_ice_variance;
        result.unresolved_ice_correlation =
            macro_sample.unresolved_ice_correlation;
        result.high_ice_second_moment = macro_sample.high_ice_second_moment;
        result.high_ice_coverage = macro_sample.high_ice_coverage;
        result.high_ice_residual_variance =
            macro_sample.high_ice_residual_variance;
        result.high_ice_mean_density = macro_sample.high_ice_mean_density;
        result.high_ice_correlation_length =
            macro_sample.high_ice_correlation_length;
        result.high_ice_lateral_filter_radius =
            macro_sample.high_ice_lateral_filter_radius;
        result.high_ice_depth_filter_radius =
            macro_sample.high_ice_depth_filter_radius;
    }
    return result;
}

fn cloud_local_material_query_filtered(
    point: vec3<f32>, layer: Layer, layer_index: i32,
    restrict_to_active: bool, active_set: OrderedActiveSet,
) -> CloudLocalMaterial {
    let genus = i32(round(layer.scale.z));
    let macro_sample = cloud_macro_atlas_sample_filtered(
        point, layer_index, genus, true, restrict_to_active, active_set);
    return cloud_local_material_from_macro_sample(macro_sample, layer);
}

fn cloud_local_material_query(
    point: vec3<f32>, layer: Layer, layer_index: i32,
) -> CloudLocalMaterial {
    return cloud_local_material_query_filtered(
        point, layer, layer_index, false, empty_ordered_active_set());
}

fn cloud_local_material_query_active(
    point: vec3<f32>, layer: Layer, layer_index: i32,
    active_set: OrderedActiveSet,
) -> CloudLocalMaterial {
    return cloud_local_material_query_filtered(
        point, layer, layer_index, true, active_set);
}

fn cloud_geometric_mass_extinction(
    system: CloudSystem,
    local_ice_fraction: f32,
) -> f32 {
    // Q_ext approaches two for cloud-sized particles. This is the identical
    // geometric-optics basis used to derive the runtime liquid/ice water path,
    // and therefore provides a unit-correct reference for the spectral LUT.
    let liquid_radius_m = max(1e-7, system.optical_material.z * 1e-6);
    let ice_radius_m = max(1e-7, system.optical_material.w * 1e-6);
    let liquid_mass_extinction = 3.0 / (2.0 * 1000.0 * liquid_radius_m);
    let ice_mass_extinction = 3.0 / (2.0 * 917.0 * ice_radius_m);
    return mix(
        liquid_mass_extinction,
        ice_mass_extinction,
        saturate(local_ice_fraction),
    );
}

fn cloud_extinction_coefficient_from_mass(
    local_material: CloudLocalMaterial,
    layer: Layer,
) -> f32 {
    var fallback = 0.0;
    if (finite_scalar(layer.geometry.w)) {
        fallback = clamp(layer.geometry.w, 0.0, 4096.0);
    }
    if (local_material.atlas_match <= 0.5) {
        return fallback;
    }
    if (!finite_scalar(local_material.extinction_coefficient)) {
        return fallback;
    }
    return clamp(local_material.extinction_coefficient, 0.0, 4096.0);
}

fn cloud_extinction_coefficient_at(
    point: vec3<f32>, layer: Layer, layer_index: i32,
) -> f32 {
    let local_material = cloud_local_material_query(point, layer, layer_index);
    return cloud_extinction_coefficient_from_mass(local_material, layer);
}

fn cloud_extinction_coefficient_at_active(
    point: vec3<f32>, layer: Layer, layer_index: i32,
    active_set: OrderedActiveSet,
) -> f32 {
    let local_material = cloud_local_material_query_active(
        point, layer, layer_index, active_set);
    return cloud_extinction_coefficient_from_mass(local_material, layer);
}

fn cloud_material_owner(owner: f32) -> u32 {
    return min(35u, u32(max(0.0, round(owner) - 1.0)));
}

fn cloud_local_material_optics(
    local_material: CloudLocalMaterial,
    cosine: f32,
) -> CloudLocalOptics {
    let primary = cloud_local_optics(
        cloud_material_owner(local_material.primary_owner),
        local_material.primary_ice_fraction,
        cosine);
    let secondary_amount = select(
        0.0,
        1.0 - saturate(local_material.primary_fraction),
        local_material.secondary_owner > 0.5);
    var retained = primary;
    if (secondary_amount > 0.0001) {
        let primary_amount = 1.0 - secondary_amount;
        let secondary = cloud_local_optics(
            cloud_material_owner(local_material.secondary_owner),
            local_material.secondary_ice_fraction,
            cosine);
        let primary_scattering =
            primary.single_scattering_albedo * primary_amount;
        let secondary_scattering =
            secondary.single_scattering_albedo * secondary_amount;
        let scattering = primary_scattering + secondary_scattering;
        let safe_scattering = max(scattering, vec3<f32>(1e-8));
        retained.mass_extinction =
            primary.mass_extinction * primary_amount +
            secondary.mass_extinction * secondary_amount;
        retained.single_scattering_albedo = scattering;
        retained.asymmetry = (
            primary.asymmetry * primary_scattering +
            secondary.asymmetry * secondary_scattering
        ) / safe_scattering;
        retained.phase = (
            primary.phase * primary_scattering +
            secondary.phase * secondary_scattering
        ) / safe_scattering;
        retained.unresolved_ice_porosity =
            primary.unresolved_ice_porosity * primary_amount +
            secondary.unresolved_ice_porosity * secondary_amount;
        retained.unresolved_ice_variance =
            primary.unresolved_ice_variance * primary_amount +
            secondary.unresolved_ice_variance * secondary_amount;
        retained.unresolved_ice_correlation =
            primary.unresolved_ice_correlation * primary_amount +
            secondary.unresolved_ice_correlation * secondary_amount;
        retained.high_ice_second_moment =
            primary.high_ice_second_moment * primary_amount +
            secondary.high_ice_second_moment * secondary_amount;
        retained.high_ice_coverage =
            primary.high_ice_coverage * primary_amount +
            secondary.high_ice_coverage * secondary_amount;
        retained.high_ice_residual_variance =
            primary.high_ice_residual_variance * primary_amount +
            secondary.high_ice_residual_variance * secondary_amount;
        retained.high_ice_mean_density =
            primary.high_ice_mean_density * primary_amount +
            secondary.high_ice_mean_density * secondary_amount;
        retained.high_ice_correlation_length =
            primary.high_ice_correlation_length * primary_amount +
            secondary.high_ice_correlation_length * secondary_amount;
        retained.high_ice_lateral_filter_radius =
            primary.high_ice_lateral_filter_radius * primary_amount +
            secondary.high_ice_lateral_filter_radius * secondary_amount;
        retained.high_ice_depth_filter_radius =
            primary.high_ice_depth_filter_radius * primary_amount +
            secondary.high_ice_depth_filter_radius * secondary_amount;
    }
    if (local_material.atlas_match <= 0.5) { return retained; }

    // Extinction, scattering and first angular moment are accumulated from
    // every overlapping owner by the material query. Their HG reduction is a
    // continuous, energy-normalized sufficient statistic. Measured LUT detail
    // is restored only when the retained owners contain effectively all of the
    // mixture; as an omitted owner grows, this refinement continuously reaches
    // zero before any strongest-two identity crossover can become visible.
    let unresolved_fraction =
        1.0 - saturate(local_material.retained_optical_fraction);
    let angular_detail_weight =
        1.0 - smoothstep(0.0, 0.002, unresolved_fraction);
    var result: CloudLocalOptics;
    result.mass_extinction = max(
        vec3<f32>(1e-8), local_material.effective_mass_extinction);
    result.single_scattering_albedo = clamp(
        local_material.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    result.asymmetry = clamp(
        local_material.asymmetry,
        vec3<f32>(-0.985), vec3<f32>(0.985));
    let aggregate_phase = vec3<f32>(
        cloud_henyey_greenstein(cosine, result.asymmetry.r),
        cloud_henyey_greenstein(cosine, result.asymmetry.g),
        cloud_henyey_greenstein(cosine, result.asymmetry.b));
    result.phase = mix(
        aggregate_phase, retained.phase, angular_detail_weight);
    result.unresolved_ice_porosity =
        retained.unresolved_ice_porosity;
    result.unresolved_ice_variance = clamp(
        local_material.unresolved_ice_variance,
        0.0, 1.0);
    result.unresolved_ice_correlation = clamp(
        local_material.unresolved_ice_correlation,
        0.0, 1.0);
    result.high_ice_second_moment = clamp(
        local_material.high_ice_second_moment, 0.0, 1.0);
    result.high_ice_coverage = clamp(
        local_material.high_ice_coverage, 0.0, 1.0);
    result.high_ice_residual_variance = clamp(
        local_material.high_ice_residual_variance, 0.0, 0.25);
    result.high_ice_mean_density = clamp(
        local_material.high_ice_mean_density, 0.0, 1.0);
    result.high_ice_correlation_length = max(1e-4,
        local_material.high_ice_correlation_length);
    result.high_ice_lateral_filter_radius = max(0.0,
        local_material.high_ice_lateral_filter_radius);
    result.high_ice_depth_filter_radius = max(0.0,
        local_material.high_ice_depth_filter_radius);
    return result;
}

fn tangent_point_at_altitude(
    horizontal: vec2<f32>, altitude_km: f32,
) -> vec3<f32> {
    let radial_distance = PLANET_RADIUS + altitude_km;
    let tangent_height = sqrt(max(
        0.0,
        radial_distance * radial_distance - dot(horizontal, horizontal),
    ));
    return vec3<f32>(horizontal.x, tangent_height, horizontal.y);
}

// Feature-owned buoyant thermals. The old convective evaluator discovered a
// new 5x5 population around every query point, which quantized mature fields
// into rows and made tall clouds inherit the silhouette of a repeated support
// primitive. Each record below is one persistent thermal tree or storm cell;
// its base, branches, crown and optional anvil share world coordinates.
fn convective_feature_morphology(
    position: vec2<f32>, h: f32, layer: Layer, index: i32, genus: i32,
    formation_potential: f32, editorial: vec2<f32>,
    base_sample: vec4<f32>, detail_sample: vec4<f32>, seed: vec4<f32>,
) -> f32 {
    let species = i32(round(layer.species.x));
    let depth = max(0.08, layer.geometry.y);
    let storm = genus == 10;
    let capillatus = storm && species != 20;
    let system_moisture = select(
        formation_potential,
        max(formation_potential, editorial.x * select(0.82, 0.94, storm)),
        editorial.y > 0.5,
    );
    let moisture = smoothstep(select(0.09, 0.025, storm),
        select(0.38, 0.26, storm),
        system_moisture * 0.54 + layer.geometry.z * 0.46);
    var density = 0.0;

    for (var slot = 0; slot < 12; slot++) {
        let feature = cloud_features[index * 12 + slot];
        if (feature.identity.w < 0.5 || i32(round(feature.identity.x)) != 3) {
            continue;
        }
        let raw_local = position - feature.center_bound.xy;
        if (dot(raw_local, raw_local) >
            feature.center_bound.w * feature.center_bound.w) {
            continue;
        }
        let wind_axis = normalize(feature.axis_extent.xy + vec2<f32>(0.0001));
        let cross_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
        let local = vec2<f32>(
            dot(raw_local, wind_axis), dot(raw_local, cross_axis));
        let sample_position = vec3<f32>(local, h * depth);
        let radius = feature.axis_extent.z;
        let top_height = max(0.08, feature.axis_extent.w * depth);
        var geometry = make_geometry_sample(1000.0, radius, 0.0);
        var storm_crown_geometry = make_geometry_sample(1000.0, radius, 0.0);
        var storm_crown_center = vec3<f32>(0.0);

        if (species == 31) {
            // Fractus is a short-lived, ragged thermal fragment: several
            // overlapping parcels but no broad, level condensation pedestal.
            geometry = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, top_height * 0.38),
                vec3<f32>(radius * 0.58, radius * 0.44, top_height * 0.34),
            );
        } else if (storm) {
            // A deep convective cell is an asynchronous tree: one persistent
            // updraft reaches the equilibrium level while feeder thermals
            // merge into it and terminate at independent heights.  The former
            // profiled column and rotating lobe rings exposed an hourglass
            // support primitive instead of a cumulonimbus silhouette.
            let storm_root_radius = radius * 0.46;
            let storm_root_height = min(top_height * 0.050, radius * 0.18);
            geometry = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, max(0.04, storm_root_height * 0.56)),
                vec3<f32>(
                    storm_root_radius,
                    storm_root_radius * 0.84,
                    max(0.06, storm_root_height * 0.72)),
            );
            let storm_branch_count = 4;
            for (var storm_branch = 0; storm_branch < 4; storm_branch++) {
                let bf = f32(storm_branch);
                let branch_seed = morphology_hash2(
                    feature.variation.xy + vec2<f32>(bf * 6.17, -bf * 9.43),
                    feature.variation.z + bf * 4.79,
                );
                let branch_angle = feature.variation.w * PI * 2.0 +
                    bf * PI * 2.0 / f32(storm_branch_count) +
                    (branch_seed.x - 0.5) * 0.30;
                let branch_direction = select(
                    vec2<f32>(cos(branch_angle), sin(branch_angle)),
                    vec2<f32>(0.0),
                    storm_branch == 0,
                );
                let branch_cross = vec2<f32>(
                    -branch_direction.y, branch_direction.x);
                var branch_top = 1.0;
                var branch_tier_count = 7;
                var branch_start = 0.055;
                if (storm_branch == 1) {
                    branch_top = 0.82;
                    branch_start = 0.17;
                    branch_tier_count = 5;
                }
                if (storm_branch == 2) {
                    branch_top = 0.66;
                    branch_start = 0.27;
                    branch_tier_count = 4;
                }
                if (storm_branch == 3) {
                    branch_top = 0.51;
                    branch_start = 0.34;
                    branch_tier_count = 3;
                }
                let feeder_amount = select(0.0, 1.0, storm_branch > 0);
                let root_offset = branch_direction * storm_root_radius *
                    mix(0.0, 0.12, feeder_amount) *
                    mix(0.82, 1.08, branch_seed.y);
                var parent_center = vec3<f32>(
                    root_offset * mix(0.0, 0.42, feeder_amount),
                    max(storm_root_height * 0.58,
                        branch_start * top_height * 0.70));
                var parent_radius = max(
                    radius * mix(0.28, 0.22, feeder_amount),
                    storm_root_height * 0.76);

                for (var storm_tier = 0; storm_tier < 7; storm_tier++) {
                    if (storm_tier >= branch_tier_count) { continue; }
                    let tf = f32(storm_tier);
                    let tier_seed = morphology_hash2(
                        feature.variation.zw + vec2<f32>(
                            bf * 7.71 + tf * 5.19,
                            -bf * 3.83 - tf * 11.27),
                        feature.variation.x + bf * 5.41 + tf * 2.97,
                    );
                    let tier_progress = tf /
                        max(1.0, f32(branch_tier_count - 1));
                    let lobe_level = mix(
                        branch_start, branch_top, pow(tier_progress, 0.88));
                    // The upper liquid tower broadens into the glaciating
                    // crown; it does not collapse to the .24-radius neck used
                    // by the old support profile.
                    var radius_profile = mix(
                        0.40, 0.33, smoothstep(0.10, 0.52, lobe_level));
                    radius_profile = mix(
                        radius_profile, 0.43,
                        smoothstep(0.56, 0.88, lobe_level));
                    radius_profile = mix(
                        radius_profile, 0.34,
                        smoothstep(0.92, 1.0, lobe_level));
                    var lobe_radius = radius * radius_profile *
                        mix(0.82, 1.08, tier_seed.x) *
                        mix(1.0, mix(0.72, 0.90, branch_seed.y),
                            feeder_amount);
                    if (storm_branch == 0 &&
                        storm_tier == branch_tier_count - 1) {
                        lobe_radius *= 1.12;
                    }
                    let branch_spread = radius *
                        mix(0.035, 0.42, feeder_amount) *
                        smoothstep(0.02, 0.78, tier_progress) *
                        mix(0.82, 1.12, branch_seed.y);
                    let gentle_curve = branch_cross * radius *
                        (tier_seed.y - 0.5) *
                        mix(0.10, 0.18, feeder_amount) * tier_progress;
                    let shear_center = vec2<f32>(
                        layer.motion.z * radius * lobe_level * 0.43,
                        (feature.variation.x - 0.5) * radius *
                            0.14 * lobe_level,
                    );
                    let lobe_center = vec3<f32>(
                        root_offset + branch_direction * branch_spread +
                            gentle_curve + shear_center,
                        max(storm_root_height * 0.62,
                            lobe_level * top_height),
                    );
                    let center_separation = length(
                        lobe_center - parent_center);
                    let overlap_limit = max(
                        0.08, (parent_radius + lobe_radius) * 0.62);
                    if (center_separation > overlap_limit) {
                        lobe_radius +=
                            (center_separation - overlap_limit) * 0.54;
                    }
                    let storm_hidden_connector = geometry_capsule(
                        sample_position, parent_center, lobe_center,
                        min(parent_radius, lobe_radius) * 0.44);
                    geometry = geometry_smooth_union(
                        geometry, storm_hidden_connector,
                        max(0.01,
                            min(parent_radius, lobe_radius) * 0.070));
                    let lobe = geometry_ellipsoid(
                        sample_position, lobe_center,
                        vec3<f32>(
                            lobe_radius * mix(0.90, 1.10, tier_seed.y),
                            lobe_radius * mix(0.84, 1.08, tier_seed.x),
                            lobe_radius * mix(1.08, 1.38, tier_seed.y),
                        ));
                    geometry = geometry_smooth_union(
                        geometry, lobe, max(0.018, lobe_radius * 0.13));

                    if (storm_tier % 2 == 1 ||
                        storm_tier == branch_tier_count - 1) {
                        let bud_radius = lobe_radius *
                            mix(0.18, 0.31, tier_seed.y);
                        let bud_direction = normalize(
                            branch_direction + branch_cross *
                                (tier_seed.x - 0.5) * 0.82 +
                                vec2<f32>(0.0001));
                        let bud = geometry_ellipsoid(
                            sample_position,
                            lobe_center + vec3<f32>(
                                bud_direction * lobe_radius *
                                    mix(0.70, 0.94, tier_seed.x),
                                lobe_radius * mix(0.20, 0.48, tier_seed.y)),
                            vec3<f32>(
                                bud_radius,
                                bud_radius * mix(0.84, 1.08, tier_seed.x),
                                bud_radius * mix(0.80, 1.06, tier_seed.y)));
                        geometry = geometry_smooth_union(
                            geometry, bud,
                            max(0.010, bud_radius * 0.080));
                    }
                    parent_center = lobe_center;
                    parent_radius = lobe_radius;
                }
            }

            // The upper branches enter one broad glaciated shield.  Its
            // attachment overlaps the dominant crown and also contains the
            // origin of the directional outflow evaluated below.
            storm_crown_center = vec3<f32>(
                layer.motion.z * radius * 0.38,
                (feature.variation.x - 0.5) * radius * 0.10,
                top_height * mix(0.81, 0.86, feature.variation.w));
            // A mature storm has one optically continuous precipitation/
            // updraft core. This support remains buried inside the resolved
            // feeder tree, but prevents a view-dependent blue-sky tunnel from
            // opening between the liquid tower and glaciated crown.
            let storm_core_support = geometry_capsule(
                sample_position,
                vec3<f32>(0.0, 0.0, max(0.05, storm_root_height * 0.54)),
                storm_crown_center - vec3<f32>(0.0, 0.0, radius * 0.10),
                radius * 0.27,
            );
            geometry = geometry_smooth_union(
                geometry, storm_core_support, max(0.020, radius * 0.060));
            let crown_half_height = max(
                radius * 0.20, top_height * 0.055);
            let crown_primary = geometry_ellipsoid(
                sample_position, storm_crown_center,
                vec3<f32>(radius * 0.56, radius * 0.52,
                    crown_half_height));
            let crown_downwind = geometry_ellipsoid(
                sample_position,
                storm_crown_center + vec3<f32>(
                    radius * 0.34, radius *
                        (feature.variation.y - 0.5) * 0.08,
                    crown_half_height * 0.10),
                vec3<f32>(radius * 0.46, radius * 0.58,
                    crown_half_height * 0.76));
            storm_crown_geometry = geometry_smooth_union(
                crown_primary, crown_downwind,
                max(0.03, crown_half_height * 0.22));
            geometry = geometry_smooth_union(
                geometry, storm_crown_geometry,
                max(0.035, crown_half_height * 0.24));

            // A compact overshooting top emerges from, rather than replacing,
            // the broad glaciated crown.
            let overshoot_radius = radius * mix(
                0.13, 0.21, feature.variation.z);
            let overshoot = geometry_ellipsoid(
                sample_position,
                vec3<f32>(storm_crown_center.xy + vec2<f32>(
                    -radius * 0.08,
                    (feature.variation.y - 0.5) * radius * 0.08),
                    top_height * 0.96),
                vec3<f32>(
                    overshoot_radius,
                    overshoot_radius * 0.84,
                    max(overshoot_radius * 0.72, top_height * 0.055),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, overshoot, max(0.018, overshoot_radius * 0.10));
            geometry = geometry_clip_to_condensation_base(
                geometry, sample_position);
        } else {
            let maturity = select(
                select(0.18, 0.48, species == 18), 0.92, species == 19);
            // The visible cumulus is a connected tree of buoyant thermals,
            // not a textured column.  A shallow root owns the meteorological
            // condensation base; overlapping, persistent branches own every
            // part of the cauliflower silhouette above it.
            let root_radius = radius * mix(0.72, 0.54, maturity);
            let root_height = min(
                top_height * mix(0.18, 0.095, maturity),
                radius * mix(0.30, 0.20, maturity));
            geometry = geometry_ellipsoid(
                sample_position,
                vec3<f32>(0.0, 0.0, max(0.025, root_height * 0.56)),
                vec3<f32>(
                    root_radius,
                    root_radius * mix(0.82, 0.90, feature.variation.y),
                    max(0.035, root_height * 0.74)),
            );

            var cumulus_branch_count = 3;
            var cumulus_tier_count = 2;
            if (species == 18) { cumulus_tier_count = 3; }
            if (species == 19) {
                // One dominant rising core plus two feeder turrets produces a
                // connected congestus mass. Four full-height roots made the
                // cloud read as separate smoke plumes sharing a platform.
                cumulus_branch_count = 3;
                cumulus_tier_count = 5;
            }
            for (var branch = 0; branch < 4; branch++) {
                if (branch >= cumulus_branch_count) { continue; }
                let bf = f32(branch);
                let branch_seed = morphology_hash2(
                    feature.variation.xy + vec2<f32>(bf * 4.91, -bf * 7.37),
                    feature.variation.z + bf * 6.13,
                );
                // One direction belongs to the branch for its entire life.
                // Small parent-relative drift gives curvature without the
                // rotating tier rings that formerly read as smoke vortices.
                let branch_angle = feature.variation.w * PI * 2.0 +
                    bf * PI * 2.0 / f32(cumulus_branch_count) +
                    (branch_seed.x - 0.5) * 0.34;
                let branch_direction = vec2<f32>(
                    cos(branch_angle), sin(branch_angle));
                let branch_cross = vec2<f32>(
                    -branch_direction.y, branch_direction.x);
                var branch_top = 1.0;
                var branch_tier_count = cumulus_tier_count;
                var branch_start = 0.08;
                if (species == 17 && branch == 1) { branch_top = 0.88; }
                if (species == 17 && branch == 2) { branch_top = 0.78; }
                if (species == 18 && branch == 1) { branch_top = 0.86; }
                if (species == 18 && branch == 2) { branch_top = 0.70; }
                if (species == 19 && branch == 1) {
                    branch_top = 0.78;
                    branch_start = 0.18;
                    branch_tier_count = 4;
                }
                if (species == 19 && branch == 2) {
                    branch_top = 0.60;
                    branch_start = 0.24;
                    branch_tier_count = 3;
                }

                let central_branch = branch == 0;
                let root_offset = select(
                    branch_direction * root_radius *
                        mix(0.08, 0.14, branch_seed.y),
                    vec2<f32>(0.0),
                    central_branch,
                );
                var parent_center = vec3<f32>(
                    root_offset * select(0.34, 0.0, central_branch),
                    max(root_height * 0.54,
                        branch_start * top_height * 0.68));
                var parent_radius = max(
                    radius * select(0.22, 0.27, central_branch),
                    root_height * 0.72);
                for (var tier = 0; tier < 5; tier++) {
                    if (tier >= branch_tier_count) { continue; }
                    let tf = f32(tier);
                    let tier_seed = morphology_hash2(
                        feature.variation.zw + vec2<f32>(
                            bf * 8.17 + tf * 3.43,
                            -bf * 5.71 - tf * 9.29),
                        feature.variation.x + bf * 2.31 + tf * 7.19,
                    );
                    let tier_denominator = max(
                        1.0, f32(branch_tier_count - 1));
                    let tier_progress = tf / tier_denominator;
                    let lobe_level = mix(
                        branch_start, branch_top,
                        pow(tier_progress, mix(0.94, 0.82, maturity)));
                    let profile_radius = radius *
                        cumulus_radius_profile(lobe_level, maturity);
                    var lobe_radius = profile_radius *
                        mix(0.84, 1.10, tier_seed.x);
                    if (branch == 0 && tier == branch_tier_count - 1) {
                        lobe_radius *= mix(1.08, 1.22, maturity);
                    }

                    let branch_spread = radius * select(
                        mix(0.30, 0.44, maturity),
                        mix(0.04, 0.10, branch_seed.y),
                        central_branch,
                    ) * smoothstep(0.02, 0.86, tier_progress) *
                        mix(0.78, 1.06, branch_seed.y);
                    let gentle_curve = branch_cross * radius *
                        (tier_seed.y - 0.5) * 0.10 * tier_progress;
                    let shear_center = vec2<f32>(
                        layer.motion.z * radius * lobe_level *
                            mix(0.10, 0.26, maturity),
                        0.0,
                    );
                    let lobe_center = vec3<f32>(
                        root_offset + branch_direction * branch_spread +
                            gentle_curve + shear_center,
                        max(root_height * 0.62, lobe_level * top_height),
                    );

                    // Guaranteed parent overlap keeps the connector buried;
                    // it exists only to make topology continuous under every
                    // random seed and cannot become a visible tube.
                    let center_separation = length(lobe_center - parent_center);
                    let overlap_limit = max(
                        0.04, (parent_radius + lobe_radius) * 0.62);
                    if (center_separation > overlap_limit) {
                        lobe_radius += (center_separation - overlap_limit) * 0.56;
                    }
                    let hidden_connector = geometry_capsule(
                        sample_position, parent_center, lobe_center,
                        min(parent_radius, lobe_radius) * 0.42,
                    );
                    geometry = geometry_smooth_union(
                        geometry, hidden_connector,
                        max(0.008, min(parent_radius, lobe_radius) * 0.060));

                    let lobe = geometry_ellipsoid(
                        sample_position,
                        lobe_center,
                        vec3<f32>(
                            lobe_radius * mix(0.90, 1.08, tier_seed.y),
                            lobe_radius * mix(0.84, 1.06, tier_seed.x),
                            lobe_radius * mix(0.98, 1.28, tier_seed.y),
                        ),
                    );
                    geometry = geometry_smooth_union(
                        geometry, lobe, max(0.012, lobe_radius * 0.12));

                    let bud_direction = normalize(
                        branch_direction + branch_cross *
                            (tier_seed.x - 0.5) * 0.72 +
                            vec2<f32>(0.0001));
                    let bud_radius = lobe_radius *
                        mix(0.18, 0.31, tier_seed.y);
                    let bud = geometry_ellipsoid(
                        sample_position,
                        lobe_center + vec3<f32>(
                            bud_direction * lobe_radius *
                                mix(0.72, 0.92, tier_seed.x),
                            lobe_radius * mix(0.22, 0.48, tier_seed.y),
                        ),
                        vec3<f32>(
                            bud_radius,
                            bud_radius * mix(0.82, 1.06, tier_seed.x),
                            bud_radius * mix(0.78, 1.02, tier_seed.y),
                        ),
                    );
                    geometry = geometry_smooth_union(
                        geometry, bud, max(0.007, bud_radius * 0.075));
                    parent_center = lobe_center;
                    parent_radius = lobe_radius;
                }
            }
            geometry = geometry_clip_to_condensation_base(
                geometry, sample_position);
        }

        let parcel_count = select(
            0, 0, storm);
        // Mature convection is a bundle of interacting updrafts. Three
        // branches read as a narrow symmetric totem in profile; five storm
        // branches and four congestus branches build a broad, asymmetric
        // cauliflower mass while retaining parent-owned connectivity.
        let branch_count = select(
            select(3, 4, species == 19), 5, storm);
        for (var parcel = 0; parcel < 20; parcel++) {
            if (parcel >= parcel_count) { continue; }
            let pf = f32(parcel);
            let parcel_seed = morphology_hash2(
                feature.variation.xy + vec2<f32>(pf * 9.73 + 1.7,
                    -pf * 13.19 - 2.3),
                feature.variation.z + pf * 1.91,
            );
            // Parcels belong to a small number of persistent branching
            // thermals.  Each branch rises through successive tiers, curves
            // laterally and overlaps its neighbours.  This creates connected
            // cauliflower lobes instead of an unordered stack of balls.
            let branch = parcel % branch_count;
            let tier = parcel / branch_count;
            let tier_count = select(4, 4, species == 19 || storm);
            var branch_top = 1.0;
            if (storm) {
                // A storm complex normally contains one anvil-producing main
                // updraft and lower feeder/satellite cells. Giving every
                // branch the same equilibrium-level top created synchronized
                // horizontal shelves across the tower.
                if (branch == 1) { branch_top = 0.86; }
                if (branch == 2) { branch_top = 0.73; }
                if (branch == 3) { branch_top = 0.62; }
                if (branch == 4) { branch_top = 0.53; }
            }
            var level = (f32(tier) + 0.46 +
                f32(branch) * mix(0.045, 0.08, feature.variation.y) +
                parcel_seed.y * 0.58) / f32(tier_count) * branch_top;
            if (species == 17) { level *= 0.68; }
            if (species == 18) { level *= 0.86; }
            if (species == 31) { level *= 0.58; }
            let z = clamp(level, 0.08, 0.98) * top_height;
            let branch_seed = morphology_hash2(
                feature.variation.zw + vec2<f32>(f32(branch) * 3.71,
                    -f32(branch) * 5.93),
                feature.variation.x + f32(branch) * 7.17,
            );
            let branch_phase = f32(branch) / f32(branch_count) * PI * 2.0 +
                (feature.variation.x - 0.5) * 1.35 +
                (branch_seed.x - 0.5) * 0.64 +
                sin(f32(tier) * 1.73 + feature.variation.z * 5.0) * 0.10 +
                (parcel_seed.x - 0.5) * 0.12;
            let radial_direction = vec2<f32>(
                cos(branch_phase), sin(branch_phase));
            var radial_distance = radius * pow(saturate(level), 1.32) *
                mix(0.22, select(0.52, 0.68, storm), parcel_seed.x);
            if (species == 19) { radial_distance *= 1.36; }
            if (tier == 0) { radial_distance *= 0.38; }
            if (storm && branch == 0) { radial_distance *= 0.30; }
            if (storm && branch > 0) { radial_distance *= 1.14; }
            if (level > 0.76) {
                radial_distance *= mix(1.06, 1.34, parcel_seed.y);
            }
            // sample_position.x is already the wind-aligned axis.
            let shear_offset = vec2<f32>(
                layer.motion.z * level * radius * select(0.18, 0.52, storm),
                0.0,
            );
            let parcel_center = vec3<f32>(
                radial_direction * radial_distance + shear_offset,
                z,
            );
            var parcel_radius = radius * mix(0.40, 0.53, parcel_seed.x) *
                mix(1.0, select(0.68, 0.78, storm), level);
            if (level > 0.76) {
                parcel_radius = max(parcel_radius,
                    radius * mix(select(0.27, 0.29, storm),
                        select(0.38, 0.41, storm), parcel_seed.x));
            }
            if (capillatus) {
                parcel_radius *= mix(
                    1.0, 0.82, smoothstep(0.62, 0.92, level));
            }
            var vertical_radius = min(
                top_height * mix(0.15, 0.21, parcel_seed.y),
                parcel_radius * mix(1.0, select(1.24, 1.48, storm),
                    layer.shape.y),
            );
            if (capillatus) {
                vertical_radius *= mix(
                    1.0, 0.78, smoothstep(0.66, 0.94, level));
            }
            let parcel_geometry = geometry_ellipsoid(
                sample_position, parcel_center,
                vec3<f32>(
                    parcel_radius,
                    parcel_radius * mix(0.78, 1.16, parcel_seed.y),
                    max(0.035, vertical_radius),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, parcel_geometry,
                max(0.018, parcel_radius * 0.055),
            );
            if (tier > 0) {
                let tier_step = top_height / f32(tier_count);
                let parent_center = vec3<f32>(
                    parcel_center.xy * select(
                        mix(0.64, 0.78, parcel_seed.y),
                        mix(0.88, 0.96, parcel_seed.y), storm) -
                        vec2<f32>(
                            layer.motion.z * radius / f32(tier_count) *
                                select(0.18, 0.52, storm),
                            0.0,
                        ),
                    max(top_height * 0.10, parcel_center.z - tier_step),
                );
                let conduit = geometry_capsule(
                    sample_position,
                    parent_center,
                    parcel_center,
                    parcel_radius * mix(0.68, 0.82, parcel_seed.x),
                );
                geometry = geometry_smooth_union(
                    geometry, conduit, max(0.016, parcel_radius * 0.075));
            }
            // One attached daughter lobe gives each resolved thermal a
            // cauliflower edge at its own scale.  It is deliberately attached
            // to the parcel rather than generated from unrelated high-frequency
            // noise, so silhouettes remain coherent under motion and lighting.
            let bud_direction = normalize(vec2<f32>(
                cos(branch_phase + mix(0.48, 1.16, parcel_seed.y)),
                sin(branch_phase + mix(0.48, 1.16, parcel_seed.y)),
            ));
            let bud_radius = parcel_radius * mix(0.28, 0.44, parcel_seed.y);
            let bud = geometry_ellipsoid(
                sample_position,
                parcel_center + vec3<f32>(
                    bud_direction * parcel_radius * mix(0.72, 0.98, parcel_seed.x),
                    vertical_radius * mix(0.38, 0.72, parcel_seed.y),
                ),
                vec3<f32>(
                    bud_radius,
                    bud_radius * mix(0.76, 1.08, parcel_seed.x),
                    bud_radius * mix(0.82, 1.18, parcel_seed.y),
                ),
            );
            geometry = geometry_smooth_union(
                geometry, bud, max(0.012, bud_radius * 0.04));
            if (tier > 0) {
                let second_bud_direction = vec2<f32>(
                    cos(branch_phase - mix(0.66, 1.34, parcel_seed.x)),
                    sin(branch_phase - mix(0.66, 1.34, parcel_seed.x)),
                );
                let second_bud_radius = parcel_radius *
                    mix(0.26, 0.40, parcel_seed.x);
                let second_bud = geometry_ellipsoid(
                    sample_position,
                    parcel_center + vec3<f32>(
                        second_bud_direction * parcel_radius *
                            mix(0.70, 1.02, parcel_seed.y),
                        vertical_radius * mix(-0.04, 0.42, parcel_seed.x),
                    ),
                    vec3<f32>(
                        second_bud_radius,
                        second_bud_radius * mix(0.78, 1.12, parcel_seed.y),
                        second_bud_radius * mix(0.86, 1.20, parcel_seed.x),
                    ),
                );
                geometry = geometry_smooth_union(
                    geometry, second_bud,
                    max(0.01, second_bud_radius * 0.035));
            }
        }

        let condensation_signal =
            base_sample.r * 0.46 + base_sample.g * 0.28 +
            base_sample.b * 0.10 + detail_sample.r * 0.16;
        let condensation_cells = smoothstep(
            select(0.29, 0.24, storm),
            select(0.68, 0.64, storm),
            condensation_signal,
        );
        let material_variation = mix(
            // Noise may carve entrainment notches at the boundary, but it
            // cannot extinguish most of a liquid-water core. The previous
            // 0.20 floor turned coherent analytic thermals into translucent
            // smoke and erased the strong luminance contrasts of real Cu.
            select(0.76, 0.82, storm),
            select(1.18, 1.12, storm),
            condensation_cells,
        );
        let cumulus_base_ramp = select(
            select(
                smoothstep(0.0, max(0.015, top_height * 0.028),
                    sample_position.z),
                1.0,
                species == 31,
            ),
            1.0,
            storm,
        );
        var condensate = condensation_material_density(
            geometry, sample_position, h,
            select(layer.shape.w * 0.62, layer.shape.w * 0.78, storm),
            select(0.78, 0.82, storm),
            mix(0.78, 1.14, smoothstep(0.08, 0.9, h)),
            select(
                // Liquid cumulus keeps a crisp resolved cauliflower boundary;
                // stochastic detail roughens those lobes without dissolving
                // the entire silhouette into smoke.
                vec4<f32>(0.48, 0.17, 0.052, 0.12),
                vec4<f32>(0.52, 0.18, 0.055, 0.17),
                storm,
            ),
            feature.variation, index,
        ) * moisture * feature.shape.w * material_variation *
            cumulus_base_ramp;
        if (storm && species != 20 && feature.extra0.y > 0.01) {
            // Resolve the glaciated outflow as its own material regime. A thin
            // anvil otherwise inherits the water tower's compact boundary
            // spectrum and becomes an opaque slab behind its crown.
            let crown_condensate = condensation_material_density(
                storm_crown_geometry, sample_position, h,
                layer.shape.w * 0.82,
                0.70, 0.78,
                vec4<f32>(0.72, 0.24, 0.072, 0.13),
                feature.variation.zwxy, index);
            let resolved_crown = crown_condensate * moisture *
                feature.shape.w * mix(0.38, 0.58, feature.extra1.z);
            condensate = 1.0 - (1.0 - saturate(condensate)) *
                (1.0 - saturate(resolved_crown));

            let anvil_attachment_center = storm_crown_center + vec3<f32>(
                radius * 0.08, 0.0, 0.0);
            let anvil_geometry = geometry_anvil_outflow(
                sample_position,
                anvil_attachment_center,
                vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
                feature.extra0.x,
                feature.extra0.y,
                feature.extra0.z,
                max(0.035, feature.extra0.w),
                feature.variation.w * PI * 2.0,
            );
            let anvil_condensate = condensation_material_density(
                anvil_geometry, sample_position, h,
                layer.shape.w * 0.76,
                0.62, 0.74,
                vec4<f32>(0.78, 0.26, 0.078, 0.16),
                feature.variation.wxyz, index,
            );
            let anvil_streak = fbm2(
                vec2<f32>(sample_position.x * 0.11,
                    sample_position.y * 0.62) +
                feature.variation.xy * 19.0,
            );
            let anvil_stream_position = saturate(
                (sample_position.x - anvil_attachment_center.x +
                    feature.extra0.x) /
                max(0.2, feature.extra0.x + feature.extra0.y));
            let secondary_streak = fbm2(
                vec2<f32>(sample_position.x * 0.29,
                    sample_position.y * 1.18) +
                feature.variation.zw * 31.0);
            let fibrous_signal = anvil_streak * 0.67 + secondary_streak * 0.33;
            let attached_transport = mix(
                0.46, 1.08, smoothstep(0.28, 0.72, fibrous_signal));
            let terminal_transport = mix(
                0.0, 0.96, smoothstep(0.48, 0.74, fibrous_signal));
            let fibrous_transport = mix(
                attached_transport, terminal_transport,
                smoothstep(0.48, 0.96, anvil_stream_position));
            let resolved_anvil = anvil_condensate * moisture *
                feature.shape.w * mix(0.34, 0.58, feature.extra1.z) *
                fibrous_transport;
            condensate = 1.0 - (1.0 - saturate(condensate)) *
                (1.0 - saturate(resolved_anvil));
        }
        density = 1.0 - (1.0 - density) * (1.0 - saturate(condensate));
    }
    return saturate(density * select(1.22, 1.15, storm));
}

fn density_at_filtered_from_macro_sample(
    point: vec3<f32>, layer: Layer, index: i32,
    restrict_to_active: bool, active_set: OrderedActiveSet,
    radius: f32, h: f32, genus: i32, species: i32,
    macro_atlas: CloudMacroSample,
) -> f32 {
    if (macro_atlas.matched_owner > 0.5) {
        return macro_atlas.density;
    }
    if (restrict_to_active &&
        !ordered_active_contains(active_set, 36u + u32(max(0, index)))) {
        return 0.0;
    }

    let time = p[0].z;
    let seed = p[14];
    let wind = layer.motion.xy * time;
    let wind_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
    let shear = wind_axis * layer.motion.z * (h - 0.35) * layer.geometry.y * 1.8;
    var q = vec3<f32>(point.x, radius - PLANET_RADIUS, point.z) +
        vec3<f32>(wind.x + shear.x, 0.0, wind.y + shear.y);
    // Advect condensate texture through the system at full wind speed, but do
    // not drag a deliberately distant synoptic system across the observer just
    // because the renderer's bounded phase clock starts at a different point.
    // The envelope itself evolves slowly; fast motion belongs inside it.
    let system_position = point.xz + wind * 0.015;
    var weather_position = point.xz + wind * 0.16;
    let organization = i32(round(layer.organization.x));
    let organization_strength = layer.organization.z;
    let organization_across = vec2<f32>(-wind_axis.y, wind_axis.x);
    let organization_along_distance = dot(weather_position, wind_axis);
    let organization_across_distance = dot(weather_position, organization_across);
    if (organization == 2) {
        weather_position = wind_axis * organization_along_distance *
            mix(1.0, 0.34, organization_strength) +
            organization_across * organization_across_distance *
            mix(1.0, 1.8, organization_strength);
    }
    if (organization == 5 || organization == 6) {
        let along_scale = select(0.42, 0.2, organization == 6);
        weather_position = wind_axis * organization_along_distance *
            mix(1.0, along_scale, organization_strength) +
            organization_across * organization_across_distance;
    }
    let weather_uv = weather_position * layer.scale.w +
        vec2<f32>(layer.phase.w * 9.0);
    let weather_fields = weather_hierarchy(weather_uv, seed, index);
    let weather_sample = weather_fields.synoptic;
    let editorial_population = cloud_editorial_population(
        system_position,
        layer,
        index,
        weather_sample.rgb,
    );
    // The weather BA channels are a periodic curl field generated from one
    // scalar potential. It bends cloud edges without translating the core or
    // exposing a second unrelated noise pattern.
    let curl = (weather_sample.ba * 2.0 - vec2<f32>(1.0)) *
        layer.motion.w * mix(0.18, 1.18, smoothstep(0.04, 0.86, h));
    q += vec3<f32>(curl.x, 0.0, curl.y);

    if (genus >= 1 && genus <= 3) {
        let across_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
        let along = dot(q.xz, wind_axis);
        let across = dot(q.xz, across_axis);
        var along_scale = 0.42;
        var across_scale = 1.3;
        if (genus == 1) {
            // Cirrus anisotropy is built from a broken two-dimensional fibre
            // field below. Stretching the whole 3-D basis here turns parallel
            // strands into conspicuous perspective beams across the dome.
            along_scale = 1.0;
            across_scale = 1.0;
        }
        if (genus == 2) {
            along_scale = 0.76;
            across_scale = 1.16;
        }
        let stretched = wind_axis * (along * along_scale) +
            across_axis * (across * across_scale);
        q = vec3<f32>(stretched.x, q.y, stretched.y);
    }

    let coverage_pulse =
        sin(time * 0.0011 + seed.z * 17.0 + f32(index) * 2.1) * 0.018;
    let coverage = saturate(layer.geometry.z + coverage_pulse);
    var coverage_threshold = mix(0.8, 0.3, pow(coverage, 0.9)) -
        layer.shape.x * 0.025;
    if (genus == 1) { coverage_threshold -= 0.06; }
    if (genus == 9) { coverage_threshold -= 0.065; }
    if (genus == 10) {
        // Reported cumulonimbus cover describes the compact storm footprint,
        // not the entire mesoscale moisture envelope around it.
        coverage_threshold += 0.012 + (1.0 - coverage) * 0.038;
    }
    if (genus == 2 || genus == 4 || genus == 7) {
        // Cellular decks need genuine clear slots between organizations.
        // Without this coverage-dependent separation, even a 6-okta field
        // intersects some low density on virtually every view ray and becomes
        // a featureless overcast ceiling.
        coverage_threshold += (1.0 - coverage) * 0.28;
    }
    // Finite editorial systems replace the regional formation driver with a
    // generated population field. This is intentionally not
    // regional-density-times-mask: the thermals, colonies, front, storm cells,
    // or fibres are the source of cloud occupancy, while the correlated
    // weather channel supplies only sub-population humidity variation.
    var formation_driver = weather_sample.r;
    if (editorial_population.y > 0.5) {
        formation_driver = saturate(
            editorial_population.x * 0.82 + weather_sample.r * 0.30 - 0.12,
        );
        if (genus == 1) {
            formation_driver = saturate(
                editorial_population.x * 0.72 + weather_sample.r * 0.40 - 0.18,
            );
        }
        if (genus == 2 || genus == 4 || genus == 7) {
            // Colony footprints describe where a cellular air mass is moist
            // enough to exist; they must not become six giant solid clouds.
            // Mesoscale humidity cuts that envelope into real cloudlets and
            // open/closed cells before the 3-D basis supplies their volume.
            formation_driver = saturate(
                editorial_population.x * 0.50 +
                weather_sample.r * 0.18 +
                weather_fields.mesoscale.g * 0.58 - 0.18,
            );
        }
        if (genus == 3 || genus == 5 || genus == 6 || genus == 8) {
            // A finite sheet still contains broad internal humidity variance;
            // otherwise its first shell intersection becomes a solid geometric
            // slab. The front supplies condensate while the regional field
            // decides where that condensate survives as cloud.
            formation_driver = saturate(
                editorial_population.x * 0.50 + weather_sample.r * 0.68 - 0.31,
            );
        }
    }
    var weather_density = smoothstep(
        coverage_threshold - 0.10,
        coverage_threshold + 0.08,
        formation_driver,
    );
    if (organization == 3) {
        weather_density *= mix(
            1.0,
            smoothstep(0.28, 0.66, 1.0 - weather_sample.g),
            organization_strength * 0.72,
        );
    }
    if (organization == 4) {
        weather_density *= mix(
            1.0,
            smoothstep(0.24, 0.7, weather_sample.g),
            organization_strength * 0.58,
        );
    }
    if (species == 16) {
        // Fractus is a population of boundary-layer fragments, not a thin
        // overcast with opacity holes. Two independent humidity scales create
        // ragged but volumetric pieces with naturally broken group borders.
        let fragment_field = weather_sample.g * 0.52 +
            weather_fields.mesoscale.r * 0.48;
        weather_density *= smoothstep(0.46, 0.68, fragment_field);
    }
    // The mesoscale member is the rotated, incommensurate second projection
    // from weather_hierarchy(). Reusing it here avoids a third weather lookup
    // and ensures cell tops cannot fall back into the primary texture grid.
    let column_sample = weather_fields.mesoscale;
    if (organization == 1 && (genus == 9 || genus == 10)) {
        var isolated_cell = smoothstep(0.3, 0.7, column_sample.g);
        var isolation_mix = organization_strength * 0.9;
        if (genus == 10) {
            isolated_cell = smoothstep(0.31, 0.66, column_sample.g);
            // Deep convection is cellular by definition. Even a modest
            // organization value must cut clean slots between storm towers;
            // otherwise a 2-okta scene becomes an implausible full dome.
            isolation_mix = mix(0.78, 1.0, organization_strength);
        }
        weather_density *= mix(
            1.0,
            isolated_cell,
            isolation_mix,
        );
    }
    // Local cloud texture advects continuously, while the slower convective
    // envelope breathes over multi-hour timescales. Restrict the oscillation
    // around the seeded daily lifecycle instead of cycling the whole layer
    // from birth to dissipation in lockstep.
    let lifecycle_variation = sin(
        time * mix(0.00011, 0.00023, layer.shape.y) +
        seed.w * 19.0 + f32(index) * 2.37,
    ) * mix(0.035, 0.18, layer.shape.y) * organization_strength;
    let lifecycle = saturate(layer.organization.y + lifecycle_variation);
    var column = saturate(
        column_sample.g * 0.64 + weather_sample.g * 0.22 +
        weather_sample.r * 0.14 + (0.5 - lifecycle) * layer.shape.y * 0.16,
    );
    if (editorial_population.y > 0.5 && genus == 9) {
        // Cumulus height is driven by the thermal that produced the footprint,
        // not an unrelated tiling column map. The mesoscale term only varies
        // maturity inside each irregular thermal population.
        column = saturate(editorial_population.x * 0.68 +
            column_sample.g * 0.24 + weather_sample.g * 0.08);
    }
    if (editorial_population.y > 0.5 && genus == 10) {
        column = saturate(pow(editorial_population.x, 0.72) * 0.76 +
            column_sample.g * 0.18 + weather_sample.r * 0.06);
    }
    let sheet_family = genus == 3 || genus == 5 || genus == 6 || genus == 8;
    var vertical = 1.0;
    if (sheet_family) {
        var profile_h = h;
        // A stratiform cloud base is an undulating condensation surface, not
        // the lower boundary of a perfect spherical shell. Keep the top in the
        // meteorological layer while lifting the local base by a correlated
        // fraction of its depth. This breaks the ruler-straight overcast edge
        // without inventing detached puffs in a continuous deck.
        let interface_variance =
            column_sample.g * 0.62 + weather_sample.g * 0.38;
        var lift_scale = 0.022;
        var top_sink_scale = 0.018;
        if (genus == 5) {
            lift_scale = 0.038;
            top_sink_scale = 0.026;
        }
        if (genus == 6) {
            // The visual base is diffuse because precipitation and pannus
            // obscure it; the parent deck itself should not become a row of
            // large scallops.
            lift_scale = 0.052;
            top_sink_scale = 0.022;
        }
        if (genus == 8) {
            lift_scale = 0.11;
            top_sink_scale = 0.074;
        }
        let base_lift = smoothstep(0.18, 0.86, interface_variance) *
            lift_scale;
        let top_sink = smoothstep(
            0.24, 0.88,
            column_sample.b * 0.58 + weather_sample.b * 0.42,
        ) * top_sink_scale;
        profile_h = (h - base_lift) /
            max(0.45, 1.0 - base_lift - top_sink);
        vertical = stratiform_vertical_profile(
            profile_h, layer, column, interface_variance);
        if (species != 16 &&
            (weather_density <= 0.0001 || vertical <= 0.0001)) {
            return 0.0;
        }
    }

    var base_coordinate_scale = vec3<f32>(0.055);
    if (genus == 2) {
        // Cirrocumulus elements are one to two orders of magnitude smaller
        // than Ac/Sc. Sampling the common material wavelength left fewer than
        // one noise period across a cloudlet, exposing the support ellipsoid.
        base_coordinate_scale = vec3<f32>(0.28, 0.34, 0.28);
    }
    if (genus == 9) {
        // Keep the interior condensation basis isotropic. A boosted vertical
        // frequency exposed individual texture strata as horizontal bands in
        // otherwise coherent congestus towers.
        base_coordinate_scale = vec3<f32>(0.09);
    }
    let basis_position = volume_domain(q, index, h);
    let base_coordinates = fract(basis_position * layer.scale.x * base_coordinate_scale +
        vec3<f32>(seed.z, seed.w, f32(index) * 0.217));
    let local_position = vec3<f32>(point.x, radius - PLANET_RADIUS, point.z);
    let base_world_frequency = layer.scale.x *
        max(base_coordinate_scale.x,
            max(base_coordinate_scale.y, base_coordinate_scale.z)) * 1.18;
    let base_lod = cloud_volume_lod_at_local_position(
        local_position, base_world_frequency, 128.0, 7.0);
    let base_sample = textureSampleLevel(
        base_volume, volume_sampler, base_coordinates, base_lod);
    let worley_fbm = dot(base_sample.gba, vec3<f32>(0.625, 0.25, 0.125));

    // Explicit SDF morphology paths return before the generic erosion
    // pipeline below, so they receive the same fine 3-D boundary material
    // here. One sample per density query is shared by every resolved parcel.
    var morphology_detail_sample = vec4<f32>(0.5);
    if (genus == 1 || genus == 2 || genus == 4 || genus == 7 ||
        genus == 9 || genus == 10) {
        var morphology_detail_frequency = select(0.085, 0.24, genus == 2);
        // About 0.45 km at the production Cirrus detail scale: fine enough to
        // break kilometre-wide pale ribbons, but still resolved by the fixed
        // production perspective and the existing volume LOD policy.
        if (genus == 1) { morphology_detail_frequency = 0.12; }
        let morphology_detail_lod = cloud_volume_lod_at_local_position(
            local_position,
            layer.scale.y * morphology_detail_frequency * 1.18,
            64.0,
            6.0,
        );
        morphology_detail_sample = textureSampleLevel(
            detail_volume, volume_sampler,
            fract(volume_domain(q.zxy, (index + 1) % 3, 1.0 - h).zxy *
                layer.scale.y * morphology_detail_frequency +
                vec3<f32>(seed.w, seed.x, seed.y)),
            morphology_detail_lod,
        );
    }

    if (genus == 1) {
        return cirrus_feature_morphology(
            system_position, h, layer, index,
            formation_driver, editorial_population,
            base_sample, morphology_detail_sample, seed,
        );
    }
    if (genus == 8 && species == 16) {
        return stratus_fractus_feature_morphology(
            system_position, h, layer, index,
            formation_driver, editorial_population,
            base_sample, seed,
        );
    }
    if (genus == 2 || genus == 4 || genus == 7) {
        if (species != 9 && species != 24 && species != 28 &&
            species != 14 && species != 27) {
            return cellular_feature_morphology(
                system_position, h, layer, index, genus, organization,
                formation_driver, editorial_population,
                base_sample, morphology_detail_sample, seed,
            );
        }
        return cellular_morphology(
            system_position, h, layer, index, genus, organization, formation_driver,
            editorial_population, base_sample, morphology_detail_sample,
            weather_sample.ba, seed,
        );
    }
    if (genus == 9 || genus == 10) {
        return convective_feature_morphology(
            system_position, h, layer, index, genus, formation_driver,
            editorial_population, base_sample, morphology_detail_sample,
            seed,
        );
    }
    var bulk = base_sample.r;

    // The density families share the same meteorological envelope but not the
    // same morphology. These branches alter actual three-dimensional form,
    // not merely colour or opacity labels.
    if (genus == 1) {
        let fibre_axis = normalize(layer.motion.xy + vec2<f32>(0.001));
        let fibre_across = vec2<f32>(-fibre_axis.y, fibre_axis.x);
        let fibre_along_distance = dot(q.xz, fibre_axis);
        // Ice crystals fall while the streamer advects, producing the hooked
        // and feathered fallstreaks visible in cirrus fibratus/uncinus instead
        // of straight painted ribbons through the shell.
        let fallstreak_offset = (0.58 - h) * layer.geometry.y *
            mix(0.16, 0.58, layer.motion.z + layer.motion.w * 0.35);
        let raw_across_distance = dot(q.xz, fibre_across) + fallstreak_offset;
        let fibre_bend = (fbm2(vec2<f32>(
            fibre_along_distance * 0.16,
            raw_across_distance * 0.28,
        ) + seed.wx * 11.0) - 0.5) * 1.8;
        let fibre_across_distance = raw_across_distance + fibre_bend;
        let broad_fibres = fbm2(vec2<f32>(
            fibre_along_distance * 0.42,
            fibre_across_distance * 0.75,
        ) + seed.zw * 17.0);
        let fine_fibres = fbm2(vec2<f32>(
            fibre_along_distance * 0.9 + 9.7,
            fibre_across_distance * 1.8 - 4.2,
        ) + seed.xy * 23.0);
        let breakup = fbm2(vec2<f32>(
            fibre_along_distance * 0.34 - 7.1,
            fibre_across_distance * 0.55 + 5.8,
        ) + seed.yz * 13.0);
        // The 3-D ice basis supplies finite depth and broken edges; the
        // aligned fields only modulate it into fibres. A purely 2-D fibre mask
        // extrudes through the shell and projects as long vertical sausages.
        let ice_basis = smoothstep(
            0.24,
            0.68,
            base_sample.r * 0.72 + worley_fbm * 0.28,
        );
        let aligned_fibres = smoothstep(
            0.4,
            0.68,
            broad_fibres * 0.56 + fine_fibres * 0.44,
        );
        let broken_length = smoothstep(0.36, 0.7, breakup);
        bulk = ice_basis * mix(0.42, 1.0, aligned_fibres) *
            broken_length * mix(0.56, 1.0, weather_sample.g);
    }
    if (genus == 2 || genus == 4) {
        // Multi-scale cellular organization avoids exposing any one Worley
        // frequency as a honeycomb. High cirrocumulus stays finer and more
        // translucent; altocumulus retains rounded shaded cloudlets.
        let cellular_fbm = dot(base_sample.gba, vec3<f32>(0.52, 0.31, 0.17));
        let cell_center = smoothstep(0.32, 0.69, cellular_fbm);
        let cell_wall = smoothstep(0.17, 0.48,
            1.0 - abs(base_sample.g - base_sample.b) * 1.72);
        var cell = cell_center;
        if (organization == 3) { cell = cell_wall; }
        if (organization == 4) { cell = cell_center; }
        bulk = mix(base_sample.r, cell, select(0.62, 0.74, genus == 4));
    }
    if (genus == 3 || genus == 5 || genus == 6 || genus == 8) {
        // Stratiform decks are horizontally textured sheets. Letting a 3-D
        // octave dominate their vertical density turns each ray-march stratum
        // into a visible horizontal band. The correlated 2-D synoptic field
        // supplies stable underside variation while the physical height
        // profile controls the smooth vertical optical-depth integral.
        let sheet_texture = column_sample.g * 0.62 + weather_sample.g * 0.38;
        if (genus == 3) {
            // A Cirrostratus veil is sparse ice with extremely broad optical
            // variation.  It must never acquire the rolling underside of a
            // liquid deck merely because the same noise basis is available.
            bulk = mix(
                0.50, 0.74,
                weather_fields.synoptic.g * 0.76 +
                    weather_fields.mesoscale.g * 0.24,
            );
        }
        if (genus == 5) {
            // Altostratus combines lower liquid, a mixed-phase middle and a
            // thinner ice-rich upper part.  The phase loading changes smoothly
            // with height so no gradient stop can reveal the partition.
            let lower_liquid_loading = mix(
                1.10, 0.62, smoothstep(0.34, 0.92, h));
            let broad_opacity = mix(
                0.52, 0.90,
                weather_sample.g * 0.48 + column_sample.g * 0.52,
            );
            bulk = broad_opacity * lower_liquid_loading;
        }
        if (genus == 6) {
            // Embedded precipitation-generating regions remain connected by
            // a saturated parent deck.  A non-zero floor prevents rain cores
            // from reading as isolated cells or punched holes.
            let rain_core = smoothstep(
                0.26, 0.76,
                weather_fields.mesoscale.r * 0.58 +
                    weather_sample.g * 0.42,
            );
            let lower_particle_depletion = mix(
                0.76, 1.0, smoothstep(0.06, 0.34, h));
            bulk = mix(0.68, 1.0, rain_core) *
                mix(0.84, 1.0, sheet_texture) * lower_particle_depletion;
        }
        if (genus == 8) {
            // Low Stratus is an inversion-capped droplet layer.  Horizontal
            // density is gently variable while its vertical profile, above,
            // supplies the observed increase in concentration toward cloud top.
            bulk = mix(
                0.56, 0.82,
                weather_fields.synoptic.g * 0.70 +
                    weather_fields.mesoscale.g * 0.30,
            ) * mix(0.88, 1.08, smoothstep(0.18, 0.78, h));
        }
        if (genus == 3 && species == 6) {
            // Cirrostratus fibratus retains a veil, but aligned ice fibres
            // produce subtle optical-depth streaks inside it.
            let across_axis = vec2<f32>(-wind_axis.y, wind_axis.x);
            let fibres = fbm2(vec2<f32>(
                dot(q.xz, wind_axis) * 0.12,
                dot(q.xz, across_axis) * 0.72) + seed.xy * 17.0);
            bulk *= mix(0.68, 1.08, smoothstep(0.3, 0.74, fibres));
        }
        if ((genus == 3 && species == 7) ||
            (genus == 8 && species == 15)) {
            // Nebulosus suppresses resolved cells and high-frequency relief.
            bulk = mix(0.56, 0.76,
                weather_fields.synoptic.g * 0.68 +
                weather_fields.mesoscale.g * 0.32);
        }
        if (genus == 5 && species == 11) {
            // Opacus is deep enough for broad self-shadowing but still lacks
            // cellular peaks or cauliflower relief.
            bulk *= mix(0.92, 1.12,
                weather_sample.g * 0.46 + column_sample.g * 0.54);
        }
        if (species == 16) {
            bulk *= smoothstep(0.34, 0.69,
                base_sample.r * 0.52 + base_sample.g * 0.3 +
                weather_fields.mesoscale.r * 0.18);
        }
    }
    if (genus == 7) {
        let cellular_fbm = dot(base_sample.gba, vec3<f32>(0.48, 0.33, 0.19));
        let cell_center = smoothstep(0.3, 0.67, cellular_fbm);
        let cell_wall = smoothstep(0.16, 0.47,
            1.0 - abs(base_sample.g - base_sample.b) * 1.66);
        var cell = cell_center;
        if (organization == 3) { cell = cell_wall; }
        if (organization == 4) { cell = cell_center; }
        bulk = mix(base_sample.r, cell, 0.78);
    }
    if (genus == 9 || genus == 10) {
        var convective_envelope = smoothstep(0.24, 0.78, column);
        if (genus == 10) {
            convective_envelope = smoothstep(0.4, 0.78, column);
        }
        let cauliflower = smoothstep(0.24, 0.76,
            base_sample.r * 0.54 + worley_fbm * 0.46);
        let upper_tufts = mix(1.0, mix(0.68, 1.34, cauliflower),
            smoothstep(0.18, 0.82, h));
        bulk = mix(base_sample.r, worley_fbm, 0.08) * upper_tufts *
            mix(0.42, 1.28, convective_envelope) *
            mix(0.58, 1.0, smoothstep(0.18, 0.62, weather_density));
    }

    var field_floor = mix(0.47, 0.17, weather_density);
    var field_ceiling = 0.86;
    if (genus == 1) {
        field_floor = mix(0.42, 0.15, weather_density);
        field_ceiling = 0.72;
    }
    if (genus == 2 || genus == 4 || genus == 7) {
        field_floor = mix(0.62, 0.34, weather_density);
        field_ceiling = 0.78;
    }
    if (genus == 9) {
        // Sparse fair-weather cumulus occupies coherent columns with crisp
        // clear-air gaps; retaining every low-density Perlin skirt makes a
        // 3-okta sky read as a washed-out broken deck.
        field_floor = mix(0.54, 0.25, weather_density);
        field_ceiling = 0.82;
    }
    if (genus == 10) {
        field_floor = mix(0.58, 0.24, weather_density);
        field_ceiling = 0.76;
    }
    var field = remap(bulk, field_floor, field_ceiling) *
        weather_density * vertical;
    if (genus == 10) {
        let anvil = smoothstep(0.7, 0.84, h) *
            (1.0 - smoothstep(0.94, 1.0, h)) * layer.shape.z;
        let anvil_support = smoothstep(0.46, 0.76, column);
        field = max(field, anvil * anvil_support *
            smoothstep(0.42, 0.72, weather_sample.r) *
            mix(0.48, 0.9, worley_fbm));
    }

    let detail_lod = cloud_volume_lod_at_local_position(
        local_position, layer.scale.y * 0.085 * 1.18, 64.0, 6.0);
    let detail_sample = textureSampleLevel(
        detail_volume, volume_sampler,
        fract(volume_domain(q.zxy, (index + 1) % 3, 1.0 - h).zxy *
            layer.scale.y * 0.085 + vec3<f32>(seed.w, seed.x, seed.y)),
        detail_lod);
    let detail_fbm = dot(detail_sample.rgb, vec3<f32>(0.625, 0.25, 0.125));
    let dissipating_erosion = 1.0 + smoothstep(0.62, 1.0, lifecycle) * 0.72;
    let erosion = (1.0 - detail_fbm) * layer.shape.w * dissipating_erosion *
        mix(0.2, 0.065, layer.shape.x) * (1.0 - smoothstep(0.5, 0.9, field));
    var erosion_floor = 0.008;
    var erosion_ceiling = 0.76;
    if (genus == 2 || genus == 4 || genus == 7) {
        erosion_floor = 0.024;
        erosion_ceiling = 0.68;
    }
    if (genus == 9) {
        erosion_floor = 0.065;
        erosion_ceiling = 0.58;
    }
    if (genus == 10) {
        erosion_floor = 0.02;
        erosion_ceiling = 0.68;
    }
    field = remap(field - erosion, erosion_floor, erosion_ceiling);
    if (genus == 1) { field *= 0.19; }
    if (genus == 2) { field *= 0.52; }
    if (genus == 3) { field *= 0.2; }
    return saturate(field);
}

fn density_at_filtered(
    point: vec3<f32>, layer: Layer, index: i32,
    restrict_to_active: bool, active_set: OrderedActiveSet,
) -> f32 {
    if (layer.phase.z < 0.5) { return 0.0; }
    let radius = length(point);
    let base = PLANET_RADIUS + layer.geometry.x;
    let h = (radius - base) / max(0.02, layer.geometry.y);
    if (h <= 0.0 || h >= 1.0) { return 0.0; }
    let genus = i32(round(layer.scale.z));
    let species = i32(round(layer.species.x));
    let macro_atlas = cloud_macro_atlas_sample_filtered(
        point, index, genus, false, restrict_to_active, active_set);
    return density_at_filtered_from_macro_sample(
        point, layer, index, restrict_to_active, active_set,
        radius, h, genus, species, macro_atlas);
}

fn cloud_density_material_sample_filtered(
    point: vec3<f32>, layer: Layer, index: i32,
    restrict_to_active: bool, active_set: OrderedActiveSet,
    fibratus_filter_radius_km: f32,
    fibratus_ray_step_length_km: f32,
    fibratus_ray_direction: vec3<f32>,
) -> CloudDensityMaterialSample {
    var result: CloudDensityMaterialSample;
    result.density = 0.0;
    result.material = cloud_local_material_from_macro_sample(
        empty_cloud_macro_sample(), layer);
    // Preserve density_at_filtered's shell rejects before touching owner
    // anatomy. In particular, empty strata do not resolve optical material.
    if (layer.phase.z < 0.5) { return result; }
    let radius = length(point);
    let base = PLANET_RADIUS + layer.geometry.x;
    let h = (radius - base) / max(0.02, layer.geometry.y);
    if (h <= 0.0 || h >= 1.0) { return result; }
    let genus = i32(round(layer.scale.z));
    let species = i32(round(layer.species.x));
    // The resolved macro sample is the single authoritative owner traversal
    // for both density and material at this camera stratum. The atlas resolver
    // already skips optical work for owner densities at or below 0.0001.
    let macro_atlas = cloud_macro_atlas_sample_with_footprint(
        point, index, genus, true, restrict_to_active, active_set,
        fibratus_filter_radius_km, fibratus_ray_step_length_km,
        fibratus_ray_direction);
    result.density = density_at_filtered_from_macro_sample(
        point, layer, index, restrict_to_active, active_set,
        radius, h, genus, species, macro_atlas);
    result.material = cloud_local_material_from_macro_sample(
        macro_atlas, layer);
    return result;
}

fn cloud_density_material_sample(
    point: vec3<f32>, layer: Layer, index: i32,
) -> CloudDensityMaterialSample {
    return cloud_density_material_sample_filtered(
        point, layer, index, false, empty_ordered_active_set(),
        0.0, 0.0, vec3<f32>(0.0));
}

fn cloud_density_material_sample_active(
    point: vec3<f32>, layer: Layer, index: i32,
    active_set: OrderedActiveSet,
) -> CloudDensityMaterialSample {
    return cloud_density_material_sample_filtered(
        point, layer, index, true, active_set,
        0.0, 0.0, vec3<f32>(0.0));
}

fn cloud_camera_fibratus_pixel_filter_radius_per_km() -> f32 {
    let half_pixel_x_per_km = tan(
        max(1e-7, p[4].x) / (2.0 * max(1.0, p[0].x)));
    let half_pixel_y_per_km = tan(
        max(1e-7, p[4].z) / (2.0 * max(1.0, p[0].y)));
    // Orientation-neutral equivalent radius for the rectangular pixel cone.
    // The tangent-relative ray sweep remains anisotropic in the morphology
    // kernel, so this does not turn the complete query into a circular blur.
    return length(vec2<f32>(half_pixel_x_per_km, half_pixel_y_per_km)) *
        0.7071067811865476;
}

fn cloud_density_material_sample_camera(
    point: vec3<f32>, layer: Layer, index: i32,
    fibratus_filter_radius_km: f32,
    ray_step_length_km: f32, unit_ray_direction: vec3<f32>,
) -> CloudDensityMaterialSample {
    return cloud_density_material_sample_filtered(
        point, layer, index, false, empty_ordered_active_set(),
        max(0.0, fibratus_filter_radius_km),
        max(0.0, ray_step_length_km), unit_ray_direction);
}

fn cloud_density_material_sample_camera_active(
    point: vec3<f32>, layer: Layer, index: i32,
    active_set: OrderedActiveSet,
    fibratus_filter_radius_km: f32,
    ray_step_length_km: f32, unit_ray_direction: vec3<f32>,
) -> CloudDensityMaterialSample {
    return cloud_density_material_sample_filtered(
        point, layer, index, true, active_set,
        max(0.0, fibratus_filter_radius_km),
        max(0.0, ray_step_length_km), unit_ray_direction);
}

fn density_at(point: vec3<f32>, layer: Layer, index: i32) -> f32 {
    return density_at_filtered(
        point, layer, index, false, empty_ordered_active_set());
}

fn density_at_active(
    point: vec3<f32>, layer: Layer, index: i32,
    active_set: OrderedActiveSet,
) -> f32 {
    return density_at_filtered(point, layer, index, true, active_set);
}

fn light_interval_for_layer(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
) -> vec2<f32> {
    let inner_radius = PLANET_RADIUS + layer.geometry.x;
    let outer_radius = inner_radius + layer.geometry.y;
    let inner = sphere_hits(
        origin, direction, inner_radius);
    let outer = sphere_hits(
        origin, direction, outer_radius);
    if (outer.y <= 0.0) { return vec2<f32>(0.0); }
    let radius = length(origin);
    if (radius < inner_radius) {
        // The source ray starts below the cloud shell: enter through the inner
        // boundary and leave through the outer boundary.
        return select(
            vec2<f32>(0.0),
            vec2<f32>(inner.y, outer.y),
            inner.y >= 0.0 && outer.y > inner.y);
    }
    if (radius <= outer_radius) {
        // A cloud-light sample starts inside the shell. Integrate immediately
        // to the first boundary in the ray direction, never from the far-side
        // inner-sphere root.
        var exit_distance = outer.y;
        if (inner.x > 0.0) { exit_distance = min(exit_distance, inner.x); }
        return select(
            vec2<f32>(0.0),
            vec2<f32>(0.0, exit_distance),
            exit_distance > 0.0);
    }
    // The source ray starts above the shell. Outer.x is entry; an inner hit is
    // the first exit for a downward ray, otherwise outer.y is the exit.
    if (outer.x <= 0.0) { return vec2<f32>(0.0); }
    var exit_distance = outer.y;
    if (inner.x > outer.x) { exit_distance = min(exit_distance, inner.x); }
    return select(
        vec2<f32>(0.0),
        vec2<f32>(outer.x, exit_distance),
        exit_distance > outer.x);
}

fn uses_resolved_light_transport(layer: Layer) -> bool {
    let genus = i32(round(layer.scale.z));
    return genus == 2 || genus == 4 || genus == 7 ||
        genus == 9 || genus == 10;
}

fn local_light_distance(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
) -> f32 {
    let interval = light_interval_for_layer(
        origin + direction * 0.004, direction, layer);
    let available = max(0.0, interval.y - interval.x);
    return min(
        available,
        clamp(layer.geometry.y * 2.2, 0.48, 9.0));
}

// Cache only other-layer transport. The current layer is reconstructed either
// by the complete resident-owner Beer union or by the exact bounded legacy
// integral below. This whole-layer partition prevents a cached same-owner
// contribution from being multiplied by that owner's volume field a second time.
fn residual_light_tau(
    origin: vec3<f32>, direction: vec3<f32>, excluded_layer: i32,
) -> f32 {
    var tau = 0.0;
    let light_steps = i32(p[29].x);
    for (var layer_index = 0; layer_index < 3; layer_index++) {
        let layer = layer_at(layer_index);
        if (layer.phase.z < 0.5) { continue; }
        let interval = light_interval_for_layer(origin, direction, layer);
        if (layer_index == excluded_layer) {
            continue;
        }
        let interval_start = interval.x;
        let interval_length = interval.y - interval_start;
        if (interval_length <= 0.0) { continue; }
        // Keep a bounded static ceiling for WGSL portability while allowing
        // the compiled quality profile to grow beyond the former four-step
        // hard limit as the multi-depth cache is qualified.
        for (var step = 0; step < 16; step++) {
            if (step >= light_steps) { break; }
            let lower_t = f32(step) / f32(max(light_steps, 1));
            let upper_t = f32(step + 1) / f32(max(light_steps, 1));
            let travelled = interval_start + interval_length *
                mix(lower_t, upper_t, 0.5);
            let point = origin + direction * travelled;
            let step_length = interval_length * (upper_t - lower_t);
            let cloud_sample = cloud_density_material_sample(
                point, layer, layer_index);
            let density = cloud_sample.density;
            if (density > 0.0001) {
                tau += density * cloud_extinction_coefficient_from_mass(
                    cloud_sample.material, layer) * step_length;
            }
            if (tau > 24.0) { return tau; }
        }
    }
    return tau;
}

fn cloud_spectral_extinction_coefficient_from_material(
    local_material: CloudLocalMaterial, layer: Layer,
) -> vec3<f32> {
    let scalar_extinction = cloud_extinction_coefficient_from_mass(
        local_material, layer);
    if (local_material.atlas_match > 0.5) {
        let aggregate = max(
            vec3<f32>(0.0), local_material.spectral_extinction_coefficient);
        if (finite_rgb(aggregate)) { return aggregate; }
        return vec3<f32>(scalar_extinction);
    }
    let primary = cloud_local_mass_extinction(
        cloud_material_owner(local_material.primary_owner),
        local_material.primary_ice_fraction);
    let secondary_amount = select(
        0.0,
        1.0 - saturate(local_material.primary_fraction),
        local_material.secondary_owner > 0.5);
    let secondary = cloud_local_mass_extinction(
        cloud_material_owner(local_material.secondary_owner),
        local_material.secondary_ice_fraction);
    let mass_extinction = mix(primary, secondary, secondary_amount);
    let scalar_mass_extinction = dot(
        mass_extinction, vec3<f32>(0.2126, 0.7152, 0.0722));
    let resolved = max(vec3<f32>(0.0), scalar_extinction * mass_extinction /
        max(1e-8, scalar_mass_extinction));
    // Extinction assets are near-neutral and finite. A backend spill or a
    // malformed row must never turn Beer transport into NaN/FP16 rail values;
    // neutral scalar extinction is the conservative physical fallback.
    if (!finite_rgb(resolved)) { return vec3<f32>(scalar_extinction); }
    return resolved;
}

fn cloud_spectral_extinction_coefficient_at(
    point: vec3<f32>, layer: Layer, layer_index: i32,
) -> vec3<f32> {
    let local_material = cloud_local_material_query(point, layer, layer_index);
    return cloud_spectral_extinction_coefficient_from_material(
        local_material, layer);
}

// World-space source-aligned cascades are written by the same density
// ownership and optical-calibration contract as view transport. Directional
// shadow maps need the filtered, camera-independent extinction
// field, not the expensive surface-noise graph used by close view rays. The
// finite-owner slab mask first proves which owners can overlap this 2x2 plane
// tile and receiver-depth interval. Survivors use one conservative 8^3
// majorant probe and one trilinear 48^3 macro sample per requested morphology
// position. No density_at/local-material query, exterior-noise volume, or SDF
// normal traversal is reachable from the cascade producer.
fn cloud_coupling_filtered_macro_owner_sample(
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding, genus: i32,
    parent_owner_index: u32, lateral_filter_radius_km: f32,
    depth_filter_radius_km: f32,
    ray_step_length_km: f32,
    ray_direction_renderer: vec3<f32>,
) -> CloudMacroOwnerSample {
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = local_position.xz - center;
    let undeformed_canonical = vec3<f32>(
        0.5 + dot(delta, crosswind_axis) / (2.0 * minor_radius),
        (local_position.y - system.vertical_extent.x) / geometric_depth,
        0.5 + dot(delta, downwind_axis) / (2.0 * major_radius));
    if (any(undeformed_canonical < vec3<f32>(-0.13)) ||
        any(undeformed_canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    let topology = i32(round(atlas_binding.majorant_offset.w));
    let canonical = deform_cloud_macro_coordinate(
        undeformed_canonical, system, formation_mechanism, topology);
    if (any(canonical < vec3<f32>(-0.13)) ||
        any(canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }

    let majorant_local = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let majorant_uv = majorant_local * atlas_binding.majorant_scale.xyz +
        atlas_binding.majorant_offset.xyz;
    let majorant_dimensions_u = textureDimensions(cloud_macro_majorants);
    let majorant_dimensions = vec3<i32>(majorant_dimensions_u);
    let majorant_coordinate = clamp(
        vec3<i32>(floor(majorant_uv * vec3<f32>(majorant_dimensions_u))),
        vec3<i32>(0), majorant_dimensions - vec3<i32>(1));
    if (textureLoad(
        cloud_macro_majorants, majorant_coordinate, 0).r <= 0.0001) {
        return empty_cloud_macro_owner_sample();
    }

    let macro_sample = cloud_macro_volume_rgba(canonical, atlas_binding);
    let sdf_voxels = cloud_macro_sdf_voxels(canonical, macro_sample.a);
    let volume_index = u32(max(0.0, round(atlas_binding.atlas_offset.w)));
    let volume_contract = cloud_exterior_volume_contract(volume_index);
    let permitted_mask = u32(round(volume_contract.x));
    let species = i32(round(system.identity.w));
    let precipitation_kind = i32(round(system.precipitation.x));
    let detail_code = cloud_exterior_select_class(
        permitted_mask, saturate(macro_sample.g), saturate(macro_sample.b),
        species, precipitation_kind);
    let detail_contract = cloud_exterior_detail_contract(detail_code);
    let maximum_axis_scale = max(detail_contract.axis_scale.x,
        max(detail_contract.axis_scale.y, detail_contract.axis_scale.z));
    let maximum_reach_voxels =
        detail_contract.maximum_displacement_canonical * 47.0 *
        maximum_axis_scale;
    if (sdf_voxels > maximum_reach_voxels + 0.75) {
        return empty_cloud_macro_owner_sample();
    }

    // Integrate out the high-frequency signed displacement rather than
    // evaluating it at millions of DSM points. The low-pass condensate in R is
    // the radiometric field. The SDF displacement ceiling and brick majorant
    // above are culling contracts only: promoting any part of that potential
    // support to extinction manufactures shadow casters which do not exist in
    // camera density, producing detached gray stamps in both clouds and air.
    let material_density = cloud_macro_transport_material_density(
        macro_sample, formation_mechanism, genus, species);
    // The caller derives the lateral band-limit from the actual source-plane
    // texel represented by this quadrature node; axial support remains a
    // separate owner-local source-ray filter. A fixed fraction of a macro
    // voxel made the same fibre cast unrelated widths in the near/middle/far
    // cascades and could turn sub-voxel ice into a detached grey stamp.
    let coupling_filter_radius_km = max(
        0.003, lateral_filter_radius_km);
    var result = empty_cloud_macro_owner_sample();
    let ray_direction_owner_local = vec3<f32>(
        dot(ray_direction_renderer.xz, crosswind_axis),
        ray_direction_renderer.y,
        dot(ray_direction_renderer.xz, downwind_axis));
    let authored_source_allowed = genus >= 1 && genus <= 3 &&
        !(species == 1 && formation_mechanism == 3) &&
        atlas_binding.high_ice_source_scale.w > 0.5;
    let source_voxel_dimensions = vec3<f32>(
        2.0 * minor_radius / 96.0,
        geometric_depth / 96.0,
        2.0 * major_radius / 96.0);
    if (authored_source_allowed) {
        let authored = cloud_high_ice_authored_sample(
            canonical, atlas_binding, material_density,
            source_voxel_dimensions,
            coupling_filter_radius_km,
            max(0.0, depth_filter_radius_km),
            ray_direction_owner_local);
        var resolved_authored = vec4<f32>(
            authored.density, saturate(macro_sample.g), 0.0, 0.0);
        if (species == 3) {
            resolved_authored = cloud_resolved_high_ice_material(
                canonical, local_position, macro_sample, sdf_voxels,
                authored.density, system, genus, species,
                coupling_filter_radius_km,
                max(0.0, depth_filter_radius_km),
                ray_direction_owner_local);
        }
        result.density = resolved_authored.x;
        result.detail = resolved_authored.y;
        result.unresolved_ice_variance = 0.0;
        result.unresolved_ice_correlation = 0.0;
        result.high_ice_mean_density = result.density;
        result.high_ice_second_moment = select(
            authored.second_moment,
            cloud_spissatus_authored_second_moment(
                authored.density,
                authored.second_moment,
                result.density),
            species == 3);
        result.high_ice_coverage = authored.coverage;
        result.high_ice_residual_variance = select(
            0.0,
            cloud_spissatus_residual_density_variance(
                result.density, authored.coverage, sdf_voxels),
            species == 3);
        result.high_ice_correlation_length = select(
            authored.correlation_length,
            max(authored.correlation_length, 0.18),
            species == 3);
        result.high_ice_lateral_filter_radius = coupling_filter_radius_km;
        result.high_ice_depth_filter_radius = max(
            0.0, depth_filter_radius_km);
    } else {
        result.density =
            cloud_morphology_cirrus_fibratus_subvoxel_density(
                parent_owner_index,
                canonical,
                material_density,
                sdf_voxels,
                vec3<f32>(
                    minor_radius,
                    geometric_depth * 0.5,
                    major_radius),
                system.deterministic_seeds,
                formation_mechanism,
                species,
                coupling_filter_radius_km,
                max(0.0, ray_step_length_km),
                ray_direction_owner_local);
        let resolved_high_ice = cloud_resolved_high_ice_material(
            canonical, local_position, macro_sample, sdf_voxels,
            result.density, system, genus, species,
            coupling_filter_radius_km,
            max(0.0, depth_filter_radius_km),
            ray_direction_owner_local);
        result.density = resolved_high_ice.x;
        result.detail = resolved_high_ice.y;
        result.unresolved_ice_variance = resolved_high_ice.z;
        result.unresolved_ice_correlation = resolved_high_ice.w;
        result.high_ice_mean_density = 0.0;
        result.high_ice_second_moment = 0.0;
        result.high_ice_coverage = 0.0;
        result.high_ice_residual_variance = 0.0;
        result.high_ice_correlation_length = 0.0;
        result.high_ice_lateral_filter_radius = 0.0;
        result.high_ice_depth_filter_radius = 0.0;
    }
    result.ice_fraction = saturate(macro_sample.b);
    result.interior_depth_fraction =
        saturate(max(0.0, -sdf_voxels) / 47.0);
    return result;
}

// Source-grid Beer carries the same unresolved footprint statistics as the
// camera query. Extinction remains the arithmetic-mean mass carrier; the
// receiver converts each physical interval to expected Beer only after the
// owner mixture and its local variance/correlation have been accumulated.
struct CloudCouplingOpticalSample {
    extinction: vec3<f32>,
    unresolved_ice_porosity: f32,
    unresolved_ice_variance: f32,
    unresolved_ice_correlation: f32,
    high_ice_mean_density: f32,
    high_ice_second_moment: f32,
    high_ice_coverage: f32,
    high_ice_residual_variance: f32,
    high_ice_correlation_length: f32,
};

fn empty_cloud_coupling_optical_sample() -> CloudCouplingOpticalSample {
    var result: CloudCouplingOpticalSample;
    result.extinction = vec3<f32>(0.0);
    result.unresolved_ice_porosity = 0.0;
    result.unresolved_ice_variance = 0.0;
    result.unresolved_ice_correlation = 0.0;
    result.high_ice_mean_density = 0.0;
    result.high_ice_second_moment = 0.0;
    result.high_ice_coverage = 0.0;
    result.high_ice_residual_variance = 0.0;
    result.high_ice_correlation_length = 0.0;
    return result;
}

fn cloud_coupling_filtered_owner_extinction(
    point: vec3<f32>, owner_index: u32, lateral_filter_radius_km: f32,
    depth_filter_radius_km: f32,
    ray_step_length_km: f32,
    ray_direction_renderer: vec3<f32>,
) -> CloudCouplingOpticalSample {
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    if (owner_index >= system_count) {
        return empty_cloud_coupling_optical_sample();
    }
    let system = cloud_system_buffer.systems[owner_index];
    let atlas_binding = cloud_macro_bindings.owners[owner_index];
    let layer_index = i32(round(system.identity.y));
    if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5 ||
        layer_index < 0 || layer_index >= 3 ||
        layer_at(layer_index).phase.z < 0.5) {
        return empty_cloud_coupling_optical_sample();
    }
    let local_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    let morphology = cloud_morphology_evaluate_owner(
        owner_index, local_position);
    if (morphology.base_coverage <= 0.0001 &&
        morphology.placement_weight <= 0.0001 &&
        morphology.reuse_weight <= 0.0001 &&
        morphology.additive_density <= 0.0001) {
        return empty_cloud_coupling_optical_sample();
    }
    let genus = i32(round(system.identity.z));
    var base_sample = empty_cloud_macro_owner_sample();
    if (morphology.base_coverage > 0.0001) {
        base_sample = cloud_coupling_filtered_macro_owner_sample(
            morphology.base_position_km, system, atlas_binding, genus,
            owner_index, lateral_filter_radius_km, depth_filter_radius_km,
            ray_step_length_km, ray_direction_renderer);
    }
    var placement_sample = empty_cloud_macro_owner_sample();
    if (morphology.placement_weight > 0.0001) {
        placement_sample = cloud_coupling_filtered_macro_owner_sample(
            morphology.placement_position_km, system, atlas_binding, genus,
            owner_index, lateral_filter_radius_km, depth_filter_radius_km,
            ray_step_length_km, ray_direction_renderer);
    }
    var reuse_sample = empty_cloud_macro_owner_sample();
    if (morphology.reuse_weight > 0.0001) {
        reuse_sample = cloud_coupling_filtered_macro_owner_sample(
            local_position, system, atlas_binding, genus, owner_index,
            lateral_filter_radius_km, depth_filter_radius_km,
            ray_step_length_km, ray_direction_renderer);
    }
    let density = cloud_morphology_compose_density(
        morphology, base_sample.density, placement_sample.density,
        reuse_sample.density);
    if (density <= 0.0001) {
        return empty_cloud_coupling_optical_sample();
    }

    let fallback_ice = saturate(1.0 - system.optical_material.y);
    let base_weight = base_sample.density * morphology.base_coverage;
    let placement_weight = placement_sample.density *
        morphology.placement_weight;
    let reuse_weight = reuse_sample.density * morphology.reuse_weight;
    let additive_weight = morphology.additive_density;
    let attribute_weight = base_weight + placement_weight + reuse_weight +
        additive_weight;
    let local_ice = select(fallback_ice,
        (base_sample.ice_fraction * (base_weight + additive_weight) +
            placement_sample.ice_fraction * placement_weight +
            reuse_sample.ice_fraction * reuse_weight) /
            max(0.0001, attribute_weight),
        attribute_weight > 0.0001);
    let mass_extinction = cloud_local_mass_extinction(owner_index, local_ice);
    var scalar_extinction =
        cloud_owner_extinction_coefficient_from_mass_extinction(
            system, atlas_binding, local_ice, mass_extinction);
    if (morphology.target_optical_depth >= 0.0 &&
        morphology.optical_weight > 0.0001) {
        let remapped = morphology.target_optical_depth /
            max(0.0001, system.vertical_extent.y *
                atlas_binding.condensate_paths.x);
        scalar_extinction = mix(scalar_extinction, remapped,
            saturate(morphology.optical_weight));
    }
    let photopic_mass_extinction = dot(
        mass_extinction, vec3<f32>(0.2126, 0.7152, 0.0722));
    var spectral_extinction = max(vec3<f32>(0.0),
        scalar_extinction * mass_extinction /
            max(1e-8, photopic_mass_extinction));
    if (!finite_rgb(spectral_extinction)) {
        spectral_extinction = vec3<f32>(max(0.0, scalar_extinction));
    }
    var result = empty_cloud_coupling_optical_sample();
    result.extinction = density * spectral_extinction;
    result.unresolved_ice_porosity = clamp(
        cloud_optical_owners[min(owner_index, 35u)].ice_regime.w *
            local_ice,
        0.0, 0.85);
    let local_attribute_variance =
        (base_sample.unresolved_ice_variance *
            (base_weight + additive_weight) +
            placement_sample.unresolved_ice_variance * placement_weight +
            reuse_sample.unresolved_ice_variance * reuse_weight) /
        max(0.0001, attribute_weight);
    let local_attribute_correlation =
        (base_sample.unresolved_ice_correlation *
            (base_weight + additive_weight) +
            placement_sample.unresolved_ice_correlation * placement_weight +
            reuse_sample.unresolved_ice_correlation * reuse_weight) /
        max(0.0001, attribute_weight);
    result.unresolved_ice_variance = clamp(local_attribute_variance,
        0.0, 1.0);
    result.unresolved_ice_correlation = clamp(local_attribute_correlation,
        0.0, 1.0);
    // Keep source coupling byte-equivalent to camera morphology: each
    // independently composed Xi=wi*rhoi contributes its scaled E2, then the
    // P1/P2/support clear products reconstruct the owner union.
    let base_component_density = clamp(base_weight, 0.0, 1.0);
    let placement_component_density = clamp(placement_weight, 0.0, 1.0);
    let reuse_component_density = clamp(reuse_weight, 0.0, 1.0);
    let additive_component_density = clamp(additive_weight, 0.0, 1.0);
    let base_sidecar_active = base_sample.high_ice_coverage > 1e-5 ||
        base_sample.high_ice_second_moment > 1e-5;
    let placement_sidecar_active =
        placement_sample.high_ice_coverage > 1e-5 ||
        placement_sample.high_ice_second_moment > 1e-5;
    let reuse_sidecar_active = reuse_sample.high_ice_coverage > 1e-5 ||
        reuse_sample.high_ice_second_moment > 1e-5;
    let base_sidecar_density = select(0.0, base_component_density,
        base_sidecar_active);
    let placement_sidecar_density = select(
        0.0, placement_component_density, placement_sidecar_active);
    let reuse_sidecar_density = select(0.0, reuse_component_density,
        reuse_sidecar_active);
    let base_component_second_moment = clamp(
        base_sample.high_ice_second_moment *
            morphology.base_coverage * morphology.base_coverage,
        base_component_density * base_component_density,
        base_component_density);
    let placement_component_second_moment = clamp(
        placement_sample.high_ice_second_moment *
            morphology.placement_weight * morphology.placement_weight,
        placement_component_density * placement_component_density,
        placement_component_density);
    let reuse_component_second_moment = clamp(
        reuse_sample.high_ice_second_moment *
            morphology.reuse_weight * morphology.reuse_weight,
        reuse_component_density * reuse_component_density,
        reuse_component_density);
    let additive_component_second_moment =
        additive_component_density * additive_component_density;
    let component_density_product =
        (1.0 - base_component_density) *
        (1.0 - placement_component_density) *
        (1.0 - reuse_component_density) *
        (1.0 - additive_component_density);
    let component_second_moment_product =
        (1.0 - 2.0 * base_component_density +
            base_component_second_moment) *
        (1.0 - 2.0 * placement_component_density +
            placement_component_second_moment) *
        (1.0 - 2.0 * reuse_component_density +
            reuse_component_second_moment) *
        (1.0 - 2.0 * additive_component_density +
            additive_component_second_moment);
    let subtractive_scale = 1.0 -
        clamp(morphology.subtractive_density, 0.0, 1.0);
    let sidecar_signal = base_sidecar_density > 1e-5 ||
        placement_sidecar_density > 1e-5 ||
        reuse_sidecar_density > 1e-5;
    let pre_subtractive_second_moment =
        1.0 - 2.0 * component_density_product +
            component_second_moment_product;
    let local_high_ice_second_moment = select(
        0.0,
        clamp(pre_subtractive_second_moment *
                subtractive_scale * subtractive_scale,
            density * density, density),
        sidecar_signal);
    let local_high_ice_coverage = clamp(
        1.0 -
            (1.0 - select(0.0, base_sample.high_ice_coverage,
                base_sidecar_density > 1e-5)) *
            (1.0 - select(0.0, placement_sample.high_ice_coverage,
                placement_sidecar_density > 1e-5)) *
            (1.0 - select(0.0, reuse_sample.high_ice_coverage,
                reuse_sidecar_density > 1e-5)) *
            (1.0 - select(0.0, 1.0,
                additive_component_density > 1e-5 && sidecar_signal)),
        0.0, 1.0) * select(0.0, 1.0, subtractive_scale > 1e-5);
    // A zero RG8 sidecar signal means this owner is either a non-high genus,
    // analytic fibratus, or an atlas voxel outside authored high-ice support.
    // Do not manufacture a homogeneous m2=density² signal in those cases:
    // that would route ordinary liquid/cirrus extinction through the
    // high-ice expected-Beer closure merely because the owner has density.
    let sidecar_present = local_high_ice_coverage > 1e-5 ||
        local_high_ice_second_moment > 1e-5;
    result.high_ice_mean_density = select(0.0, density, sidecar_present);
    result.high_ice_second_moment = select(
        0.0,
        clamp(local_high_ice_second_moment,
            density * density, density),
        sidecar_present);
    result.high_ice_coverage = clamp(local_high_ice_coverage, 0.0, 1.0);
    let sidecar_filter_weight = max(1e-5,
        (base_sidecar_density + placement_sidecar_density +
            reuse_sidecar_density) * subtractive_scale);
    result.high_ice_residual_variance = clamp(
        ((base_sample.high_ice_residual_variance * base_sidecar_density +
            placement_sample.high_ice_residual_variance *
                placement_sidecar_density +
            reuse_sample.high_ice_residual_variance *
                reuse_sidecar_density) * subtractive_scale) /
            sidecar_filter_weight,
        0.0, 0.25);
    result.high_ice_correlation_length = max(1e-4,
        ((base_sample.high_ice_correlation_length * base_sidecar_density +
            placement_sample.high_ice_correlation_length *
                placement_sidecar_density +
            reuse_sample.high_ice_correlation_length *
                reuse_sidecar_density) * subtractive_scale) /
            sidecar_filter_weight);
    result.high_ice_residual_variance = select(
        0.0, result.high_ice_residual_variance, sidecar_signal);
    result.high_ice_correlation_length = select(
        0.0, result.high_ice_correlation_length, sidecar_signal);
    return result;
}

fn cloud_coupling_masked_extinction(
    point: vec3<f32>, owner_mask: vec2<u32>,
    lateral_filter_radius_km: f32,
    depth_filter_radius_km: f32,
    ray_step_length_km: f32,
    ray_direction_renderer: vec3<f32>,
) -> CloudCouplingOpticalSample {
    if (abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return empty_cloud_coupling_optical_sample();
    }
    var result = empty_cloud_coupling_optical_sample();
    var high_ice_density_clear_product = 1.0;
    var high_ice_second_moment_clear_product = 1.0;
    var high_ice_support_clear_product = 1.0;
    var high_ice_metadata_weight = 0.0;
    var low = owner_mask.x;
    for (var candidate = 0u; candidate < 32u; candidate += 1u) {
        if (low == 0u) { break; }
        let owner_index = firstTrailingBit(low);
        let owner_sample = cloud_coupling_filtered_owner_extinction(
            point, owner_index, lateral_filter_radius_km,
            depth_filter_radius_km,
            ray_step_length_km, ray_direction_renderer);
        let owner_weight = photopic(owner_sample.extinction);
        result.extinction += owner_sample.extinction;
        result.unresolved_ice_porosity +=
            owner_sample.unresolved_ice_porosity * owner_weight;
        result.unresolved_ice_variance +=
            owner_sample.unresolved_ice_variance * owner_weight;
        result.unresolved_ice_correlation +=
            owner_sample.unresolved_ice_correlation * owner_weight;
        let owner_high_ice_mean = clamp(
            owner_sample.high_ice_mean_density, 0.0, 1.0);
        let owner_high_ice_second_moment = clamp(
            owner_sample.high_ice_second_moment,
            owner_high_ice_mean * owner_high_ice_mean,
            owner_high_ice_mean);
        let owner_high_ice_coverage = clamp(
            owner_sample.high_ice_coverage, 0.0, 1.0);
        let owner_high_ice_active = owner_high_ice_mean > 1e-5 ||
            owner_high_ice_coverage > 1e-5;
        if (owner_high_ice_active) {
            high_ice_metadata_weight += owner_weight;
        }
        high_ice_density_clear_product *= 1.0 - owner_high_ice_mean;
        high_ice_second_moment_clear_product *=
            1.0 - 2.0 * owner_high_ice_mean +
                owner_high_ice_second_moment;
        high_ice_support_clear_product *= 1.0 - owner_high_ice_coverage;
        if (owner_high_ice_active) {
            result.high_ice_residual_variance +=
                owner_sample.high_ice_residual_variance * owner_weight;
            result.high_ice_correlation_length +=
                owner_sample.high_ice_correlation_length * owner_weight;
        }
        low &= low - 1u;
    }
    var high = owner_mask.y & 0x0fu;
    for (var candidate = 0u; candidate < 4u; candidate += 1u) {
        if (high == 0u) { break; }
        let owner_index = 32u + firstTrailingBit(high);
        let owner_sample = cloud_coupling_filtered_owner_extinction(
            point, owner_index, lateral_filter_radius_km,
            depth_filter_radius_km,
            ray_step_length_km, ray_direction_renderer);
        let owner_weight = photopic(owner_sample.extinction);
        result.extinction += owner_sample.extinction;
        result.unresolved_ice_porosity +=
            owner_sample.unresolved_ice_porosity * owner_weight;
        result.unresolved_ice_variance +=
            owner_sample.unresolved_ice_variance * owner_weight;
        result.unresolved_ice_correlation +=
            owner_sample.unresolved_ice_correlation * owner_weight;
        let owner_high_ice_mean = clamp(
            owner_sample.high_ice_mean_density, 0.0, 1.0);
        let owner_high_ice_second_moment = clamp(
            owner_sample.high_ice_second_moment,
            owner_high_ice_mean * owner_high_ice_mean,
            owner_high_ice_mean);
        let owner_high_ice_coverage = clamp(
            owner_sample.high_ice_coverage, 0.0, 1.0);
        let owner_high_ice_active = owner_high_ice_mean > 1e-5 ||
            owner_high_ice_coverage > 1e-5;
        if (owner_high_ice_active) {
            high_ice_metadata_weight += owner_weight;
        }
        high_ice_density_clear_product *= 1.0 - owner_high_ice_mean;
        high_ice_second_moment_clear_product *=
            1.0 - 2.0 * owner_high_ice_mean +
                owner_high_ice_second_moment;
        high_ice_support_clear_product *= 1.0 - owner_high_ice_coverage;
        if (owner_high_ice_active) {
            result.high_ice_residual_variance +=
                owner_sample.high_ice_residual_variance * owner_weight;
            result.high_ice_correlation_length +=
                owner_sample.high_ice_correlation_length * owner_weight;
        }
        high &= high - 1u;
    }
    let total_weight = photopic(result.extinction);
    if (total_weight <= 1e-8) {
        return empty_cloud_coupling_optical_sample();
    }
    result.extinction = max(vec3<f32>(0.0), result.extinction);
    result.unresolved_ice_porosity = clamp(
        result.unresolved_ice_porosity / total_weight, 0.0, 0.85);
    result.unresolved_ice_variance = clamp(
        result.unresolved_ice_variance / total_weight, 0.0, 1.0);
    result.unresolved_ice_correlation = clamp(
        result.unresolved_ice_correlation / total_weight, 0.0, 1.0);
    result.high_ice_mean_density = clamp(
        1.0 - high_ice_density_clear_product, 0.0, 1.0);
    result.high_ice_second_moment = clamp(
        1.0 - 2.0 * high_ice_density_clear_product +
            high_ice_second_moment_clear_product,
        result.high_ice_mean_density * result.high_ice_mean_density,
        result.high_ice_mean_density);
    result.high_ice_coverage = clamp(
        1.0 - high_ice_support_clear_product, 0.0, 1.0);
    result.high_ice_residual_variance = clamp(
        result.high_ice_residual_variance /
            max(0.0001, high_ice_metadata_weight), 0.0, 0.25);
    result.high_ice_correlation_length = select(
        0.0,
        result.high_ice_correlation_length /
            max(0.0001, high_ice_metadata_weight),
        high_ice_metadata_weight > 1e-5);
    return result;
}

fn cloud_coupling_mask_contains_resolved_high_ice(
    owner_mask: vec2<u32>,
) -> bool {
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    var low = owner_mask.x;
    for (var candidate = 0u; candidate < 32u; candidate += 1u) {
        if (low == 0u) { break; }
        let owner_index = firstTrailingBit(low);
        if (owner_index < system_count) {
            let system = cloud_system_buffer.systems[owner_index];
            let genus = i32(round(system.identity.z));
            if (system.identity.x >= 0.5 && genus >= 1 && genus <= 3) {
                return true;
            }
        }
        low &= low - 1u;
    }
    var high = owner_mask.y & 0x0fu;
    for (var candidate = 0u; candidate < 4u; candidate += 1u) {
        if (high == 0u) { break; }
        let owner_index = 32u + firstTrailingBit(high);
        if (owner_index < system_count) {
            let system = cloud_system_buffer.systems[owner_index];
            let genus = i32(round(system.identity.z));
            if (system.identity.x >= 0.5 && genus >= 1 && genus <= 3) {
                return true;
            }
        }
        high &= high - 1u;
    }
    return false;
}

// Four adjacent columns share a suffix scan across the 32 receiver-depth
// knots. The atlas retains full plane/depth resolution; hierarchy changes only
// which empty finite-owner slabs avoid material work.
var<workgroup> coupling_tau_scan_a: array<vec4<f32>, 128>;
var<workgroup> coupling_tau_scan_b: array<vec4<f32>, 128>;
var<workgroup> coupling_owner_mask_by_lane: array<vec2<u32>, 32>;
var<workgroup> coupling_high_ice_quadrature_by_lane: array<u32, 32>;

const COUPLING_GL_NODES = array<f32, 2>(
    -0.5773502692, 0.5773502692);
const COUPLING_GL_WEIGHTS = array<f32, 2>(1.0, 1.0);
const COUPLING_HIGH_ICE_GL_NODES = array<f32, 4>(
    -0.8611363116, -0.3399810436, 0.3399810436, 0.8611363116);
const COUPLING_HIGH_ICE_GL_WEIGHTS = array<f32, 4>(
    0.3478548451, 0.6521451549, 0.6521451549, 0.3478548451);
const COUPLING_LATERAL_GL_OFFSETS = array<vec2<f32>, 4>(
    vec2<f32>(-COUPLING_SHADOW_LATERAL_GL_NODE),
    vec2<f32>( COUPLING_SHADOW_LATERAL_GL_NODE,
              -COUPLING_SHADOW_LATERAL_GL_NODE),
    vec2<f32>(-COUPLING_SHADOW_LATERAL_GL_NODE,
               COUPLING_SHADOW_LATERAL_GL_NODE),
    vec2<f32>( COUPLING_SHADOW_LATERAL_GL_NODE));
@compute @workgroup_size(2, 2, 32)
fn cloud_coupling_shadow_compute(
    @builtin(global_invocation_id) invocation: vec3u,
    @builtin(local_invocation_id) local: vec3u,
    @builtin(workgroup_id) workgroup: vec3u,
) {
    let dimensions = textureDimensions(directional_coupling_atlas_output);
    let lane = local.z;
    let column = local.y * 2u + local.x;
    let scan_index = lane * 4u + column;
    let source_cascade = workgroup.z;
    let source_index = source_cascade / COUPLING_SHADOW_CASCADE_COUNT;
    let cascade_index = source_cascade % COUPLING_SHADOW_CASCADE_COUNT;
    let domain = coupling_visibility_domain(source_index, cascade_index);
    let source_direction = atmo_source_direction(source_index);
    let basis = coupling_shadow_basis(source_direction);
    let valid_column = invocation.x < dimensions.x &&
        invocation.y < dimensions.y && source_cascade < 6u;
    let active_domain = coupling_visibility_contract_valid() &&
        valid_column && atmo_source_enabled(source_index) && domain.z > 0.0;
    if (local.x == 0u && local.y == 0u) {
        var owner_mask = vec2<u32>(0u);
        if (source_cascade < 6u &&
            lane + 1u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            let tile_width = dimensions.x / 2u;
            let tile_height = dimensions.y / 2u;
            let interval_count = COUPLING_SHADOW_DEPTH_KNOT_COUNT - 1u;
            let record_index = (((source_cascade * tile_height + workgroup.y) *
                tile_width + workgroup.x) * interval_count + lane);
            owner_mask = coupling_shadow_owner_masks[record_index];
        }
        coupling_owner_mask_by_lane[lane] = owner_mask;
        coupling_high_ice_quadrature_by_lane[lane] = select(
            0u, 1u,
            cloud_coupling_mask_contains_resolved_high_ice(owner_mask));
    }
    workgroupBarrier();
    let owner_mask = coupling_owner_mask_by_lane[lane];
    let refine_high_ice_depth =
        coupling_high_ice_quadrature_by_lane[lane] != 0u;
    let uv = (vec2<f32>(invocation.xy) + vec2<f32>(0.5)) /
        vec2<f32>(dimensions.xy);
    let plane = coupling_visibility_plane_center(
        source_index, cascade_index) +
        (uv * 2.0 - vec2<f32>(1.0)) * domain.w;
    let plane_texel_width = vec2<f32>(2.0 * domain.w) /
        vec2<f32>(dimensions.xy);
    // Each of the four Gauss nodes represents one quarter of the square
    // texel. Its isotropic second-moment radius is texelWidth/sqrt(48). This
    // is the correct sub-node footprint for analytic ice cross-sections; the
    // four coherent Beer rays still own the complete square average.
    let lateral_filter_radius_km = max(
        0.003, length(plane_texel_width) * 0.10206207261596575);
    let interval_count = f32(COUPLING_SHADOW_DEPTH_KNOT_COUNT - 1u);
    let observer = physical_atmosphere.observer_world.xyz;
    var visibility_sum = vec3<f32>(0.0);
    // Each lateral node remains one fixed source-parallel sub-ray for the
    // complete suffix scan. Sequential reuse preserves the existing bounded
    // workgroup storage. Ordinary intervals retain 2-depth x 4-lateral
    // queries; only intervals containing thin resolved high ice use four
    // source-depth nodes.
    for (var lateral_index = 0u; lateral_index < 4u;
        lateral_index += 1u) {
        var interval_tau = vec3<f32>(0.0);
        if (active_domain && lane + 1u < COUPLING_SHADOW_DEPTH_KNOT_COUNT &&
            (owner_mask.x | owner_mask.y) != 0u) {
            let lower_depth = coupling_visibility_depth_at_unit(
                domain, source_index, f32(lane) / interval_count);
            let upper_depth = coupling_visibility_depth_at_unit(
                domain, source_index, f32(lane + 1u) / interval_count);
            let interval_length = upper_depth - lower_depth;
            let midpoint_depth = lower_depth + interval_length * 0.5;
            let ray_direction_renderer = normalize(vec3<f32>(
                source_direction.x, source_direction.z, source_direction.y));
            // Raw-R Ci/Cc/Cs support can be substantially thinner than one
            // warped receiver-depth interval. Four positive Gauss-Legendre
            // nodes resolve that finite support without promoting a maximum
            // density to the whole slab. Other cloud intervals retain the
            // established two-node query count.
            for (var quadrature = 0u; quadrature < 4u;
                quadrature += 1u) {
                if (!refine_high_ice_depth && quadrature >= 2u) { break; }
                var depth_node = 0.0;
                var depth_weight = 0.0;
                if (refine_high_ice_depth) {
                    depth_node = COUPLING_HIGH_ICE_GL_NODES[quadrature];
                    depth_weight = COUPLING_HIGH_ICE_GL_WEIGHTS[quadrature];
                } else {
                    depth_node = COUPLING_GL_NODES[quadrature];
                    depth_weight = COUPLING_GL_WEIGHTS[quadrature];
                }
                let depth = midpoint_depth + interval_length * 0.5 *
                    depth_node;
                let sample_plane = plane +
                    COUPLING_LATERAL_GL_OFFSETS[lateral_index] *
                        plane_texel_width;
                let atmosphere_point = observer + basis.right * sample_plane.x +
                    basis.transverse * sample_plane.y + source_direction * depth;
                let point = vec3<f32>(
                    atmosphere_point.x, atmosphere_point.z, atmosphere_point.y);
                // The positive quadrature weight is the physical interval
                // length represented by this node. Its uniform-support second
                // moment supplies the axial mip radius, and the same support
                // length bounds the analytic fibratus ray sweep.
                let quadrature_support_km = abs(interval_length) *
                    depth_weight * 0.5;
                let depth_filter_radius_km = quadrature_support_km *
                    0.28867513459481287;
                let coupling_sample = cloud_coupling_masked_extinction(
                    point, owner_mask, lateral_filter_radius_km,
                    depth_filter_radius_km,
                    quadrature_support_km, ray_direction_renderer);
                let interval_weight = depth_weight * interval_length * 0.5;
                let resolved_interval_tau = coupling_sample.extinction *
                    interval_weight;
                // Apply the same bounded two-point Beer law as the camera
                // marcher at each source-plane quadrature node. Lateral rays
                // remain independent and are averaged only after their suffix
                // Beer scans, preserving the physical footprint expectation.
                if (coupling_sample.high_ice_coverage > 1e-5 ||
                    coupling_sample.high_ice_second_moment > 1e-5) {
                    interval_tau += cloud_high_ice_expected_beer_tau(
                        resolved_interval_tau,
                        coupling_sample.high_ice_mean_density,
                        coupling_sample.high_ice_second_moment,
                        coupling_sample.high_ice_coverage,
                        coupling_sample.high_ice_residual_variance,
                        abs(interval_weight),
                        coupling_sample.high_ice_correlation_length,
                        lateral_filter_radius_km,
                        depth_filter_radius_km);
                } else {
                    interval_tau +=
                        cloud_unresolved_footprint_optical_depth_signal(
                            resolved_interval_tau,
                            coupling_sample.unresolved_ice_porosity,
                            coupling_sample.unresolved_ice_variance,
                            coupling_sample.unresolved_ice_correlation);
                }
            }
        }
        coupling_tau_scan_a[scan_index] = vec4<f32>(
            min(interval_tau, vec3<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH)), 0.0);
        workgroupBarrier();

        var scan = coupling_tau_scan_a[scan_index];
        if (lane + 1u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            scan += coupling_tau_scan_a[scan_index + 4u];
        }
        coupling_tau_scan_b[scan_index] = min(scan,
            vec4<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH));
        workgroupBarrier();

        scan = coupling_tau_scan_b[scan_index];
        if (lane + 2u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            scan += coupling_tau_scan_b[scan_index + 8u];
        }
        coupling_tau_scan_a[scan_index] = min(scan,
            vec4<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH));
        workgroupBarrier();

        scan = coupling_tau_scan_a[scan_index];
        if (lane + 4u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            scan += coupling_tau_scan_a[scan_index + 16u];
        }
        coupling_tau_scan_b[scan_index] = min(scan,
            vec4<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH));
        workgroupBarrier();

        scan = coupling_tau_scan_b[scan_index];
        if (lane + 8u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            scan += coupling_tau_scan_b[scan_index + 32u];
        }
        coupling_tau_scan_a[scan_index] = min(scan,
            vec4<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH));
        workgroupBarrier();

        scan = coupling_tau_scan_a[scan_index];
        if (lane + 16u < COUPLING_SHADOW_DEPTH_KNOT_COUNT) {
            scan += coupling_tau_scan_a[scan_index + 64u];
        }
        coupling_tau_scan_b[scan_index] = min(scan,
            vec4<f32>(COUPLING_SHADOW_MAX_OPTICAL_DEPTH));
        workgroupBarrier();

        visibility_sum += exp(-coupling_tau_scan_b[scan_index].rgb) * 0.25;
        workgroupBarrier();
    }

    if (valid_column) {
        let atlas_layer = coupling_visibility_layer(
            source_index, cascade_index, lane);
        textureStore(directional_coupling_atlas_output,
            vec2i(invocation.xy), atlas_layer,
            vec4<f32>(clamp(visibility_sum, vec3<f32>(0.0), vec3<f32>(1.0)),
                1.0));
    }
}

fn lighting_for_layer(
    origin: vec3<f32>, direction: vec3<f32>, interval: vec2<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    layer: Layer, layer_index: i32,
) -> vec4<f32> {
    if (interval.y <= interval.x) { return vec4<f32>(80.0); }
    let near_point = origin + direction * mix(interval.x, interval.y, 0.28);
    let far_point = origin + direction * mix(interval.x, interval.y, 0.72);
    var sun_near = 80.0;
    var sun_far = 80.0;
    var moon_near = 80.0;
    var moon_far = 80.0;
    let excluded_layer = layer_index;
    if (atmo_source_enabled(0u)) {
        sun_near = residual_light_tau(
            near_point, sun_direction, excluded_layer);
        sun_far = residual_light_tau(
            far_point, sun_direction, excluded_layer);
    }
    if (atmo_source_enabled(1u)) {
        moon_near = residual_light_tau(
            near_point, moon_direction, excluded_layer);
        moon_far = residual_light_tau(
            far_point, moon_direction, excluded_layer);
    }
    return vec4<f32>(sun_near, sun_far, moon_near, moon_far);
}

@fragment
fn cloud_lighting_fragment(input: VertexOut) -> CloudLightingOutput {
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let interval_dimensions = textureDimensions(cloud_interval_low_middle);
    let interval_pixel = clamp(
        vec2<i32>(floor(input.uv * vec2<f32>(interval_dimensions))),
        vec2<i32>(0),
        vec2<i32>(interval_dimensions) - vec2<i32>(1),
    );
    let low_middle = textureLoad(
        cloud_interval_low_middle, interval_pixel, 0);
    let high_mask = textureLoad(
        cloud_interval_high_mask, interval_pixel, 0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let low_layer = layer_at(0);
    let middle_layer = layer_at(1);
    let high_layer = layer_at(2);
    let low_direction = view_direction(cloud_composition_uv(input.uv, 0));
    let middle_direction = view_direction(cloud_composition_uv(input.uv, 1));
    let high_direction = view_direction(cloud_composition_uv(input.uv, 2));
    var output: CloudLightingOutput;
    output.low = lighting_for_layer(
        origin, low_direction, low_middle.xy, sun_direction, moon_direction,
        low_layer, 0);
    output.middle = lighting_for_layer(
        origin, middle_direction, low_middle.zw, sun_direction, moon_direction,
        middle_layer, 1);
    output.high = lighting_for_layer(
        origin, high_direction, high_mask.xy, sun_direction, moon_direction,
        high_layer, 2);
    return output;
}

fn cloud_optical_multiple_scattering(
    local: CloudLocalOptics,
    complete_source_visibility_rgb: vec3<f32>,
    local_source_optical_depth_rgb: vec3<f32>,
    cosine: f32,
) -> vec3<f32> {
    return cloud_passive_local_directional_multiple_scattering(
        local,
        complete_source_visibility_rgb,
        local_source_optical_depth_rgb,
        cosine);
}

fn cloud_diffuse_scattering_transport(
    local: CloudLocalOptics,
    optical_depth: f32,
) -> vec3<f32> {
    return cloud_passive_diffuse_scattering_transport(
        local, optical_depth);
}

fn cloud_high_order_diffuse_transport(
    local: CloudLocalOptics,
    optical_depth: f32,
) -> vec3<f32> {
    return cloud_passive_high_order_diffuse_transport(
        local, optical_depth);
}

fn cloud_finite_nonnegative_radiance(
    value: vec3<f32>, fallback: vec3<f32>,
) -> vec3<f32> {
    if (finite_rgb(value) && all(value >= vec3<f32>(0.0))) { return value; }
    if (finite_rgb(fallback) && all(fallback >= vec3<f32>(0.0))) {
        return fallback;
    }
    return vec3<f32>(0.0);
}

// A resident P1 tile is an alternate representation of the same higher-order
// field as the analytic closure. Confidence alone says that the sample lies in
// the packed volume; it cannot prove radiometric agreement. This continuous
// luminance/chroma gate prevents a finite but stale or differently partitioned
// tile from painting a rectangular gray patch at a residency boundary.
fn cloud_higher_order_agreement_weight(
    analytic: vec3<f32>, resident_p1: vec3<f32>,
) -> f32 {
    if (!finite_rgb(analytic) || !finite_rgb(resident_p1) ||
        any(analytic < vec3<f32>(0.0)) ||
        any(resident_p1 < vec3<f32>(0.0))) { return 0.0; }
    let analytic_luminance = photopic(analytic);
    let resident_luminance = photopic(resident_p1);
    if (analytic_luminance <= 1e-7 && resident_luminance <= 1e-7) {
        return 1.0;
    }
    let log_luminance_delta = abs(log2(
        (resident_luminance + 1e-5) / (analytic_luminance + 1e-5)));
    let luminance_agreement =
        1.0 - smoothstep(0.75, 2.25, log_luminance_delta);
    let analytic_chroma = analytic / max(1e-5, analytic_luminance);
    let resident_chroma = resident_p1 / max(1e-5, resident_luminance);
    let chroma_delta = length(analytic_chroma - resident_chroma);
    let chroma_agreement = 1.0 - smoothstep(0.16, 0.52, chroma_delta);
    return saturate(min(luminance_agreement, chroma_agreement));
}

// Diagnostic-only source partition. These modes are selected before camera
// integration so every view retains the production density, extinction,
// temporal reconstruction, camera and exposure. Mode zero through eight and
// the atmosphere-composite mode return the unmodified production source.
fn cloud_lighting_debug_source(
    production_radiance: vec3<f32>,
    direct_sun_radiance: vec3<f32>,
    exterior_diffuse_radiance: vec3<f32>,
    p1_cache_radiance: vec3<f32>,
    source_higher_order_radiance: vec3<f32>,
) -> vec3<f32> {
    let debug_view = i32(round(p[22].y));
    if (debug_view == 9) { return max(vec3<f32>(0.0), direct_sun_radiance); }
    if (debug_view == 10) {
        return max(vec3<f32>(0.0), exterior_diffuse_radiance);
    }
    if (debug_view == 11) { return max(vec3<f32>(0.0), p1_cache_radiance); }
    if (debug_view == 13) {
        return max(vec3<f32>(0.0), source_higher_order_radiance);
    }
    return production_radiance;
}

struct CloudDirectionalSkyPhaseAnchors {
    low_g: vec3<f32>,
    middle_g: vec3<f32>,
    high_g: vec3<f32>,
};

struct CloudDirectionalSkyBandCache {
    lower: CloudDirectionalSkyPhaseAnchors,
    middle: CloudDirectionalSkyPhaseAnchors,
    upper: CloudDirectionalSkyPhaseAnchors,
    // lower physical altitude, inverse full altitude span
    altitude_range: vec2<f32>,
};

const CLOUD_DIRECTIONAL_SKY_G_LOW: f32 =
    ${CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[0]};
const CLOUD_DIRECTIONAL_SKY_G_MIDDLE: f32 =
    ${CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[1]};
const CLOUD_DIRECTIONAL_SKY_G_HIGH: f32 =
    ${CLOUD_DIRECTIONAL_SKY_PHASE_G_ANCHORS[2]};

fn cloud_empty_directional_sky_phase_anchors(
) -> CloudDirectionalSkyPhaseAnchors {
    return CloudDirectionalSkyPhaseAnchors(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0));
}

fn cloud_empty_directional_sky_band_cache(
) -> CloudDirectionalSkyBandCache {
    let empty = cloud_empty_directional_sky_phase_anchors();
    return CloudDirectionalSkyBandCache(
        empty, empty, empty, vec2<f32>(0.0, 1.0));
}

fn cloud_directional_sky_anchor_phase(
    cosine: f32, coherence: f32, asymmetry: f32,
) -> f32 {
    let g = clamp(asymmetry * coherence, -0.96, 0.96);
    let denominator = max(1e-8,
        1.0 + g * g - 2.0 * g * clamp(cosine, -1.0, 1.0));
    return (1.0 - g * g) /
        (4.0 * PI * pow(denominator, 1.5));
}

// Resolve three material-phase anchors with one traversal of the 17 positive
// directional atmosphere lobes. Liquid, mixed-phase and ice samples then use
// a convex interpolation in their actual RGB asymmetry instead of inheriting
// whichever material happened to be hit first on the camera ray.
fn cloud_directional_sky_phase_anchors(
    altitude_km: f32, view_direction: vec3<f32>,
) -> CloudDirectionalSkyPhaseAnchors {
    var result = cloud_empty_directional_sky_phase_anchors();
    let view = coupling_safe_normalize(view_direction);
    for (var lobe_index = 0u; lobe_index < COUPLING_ACTIVE_LOBE_COUNT;
        lobe_index += 1u) {
        let lobe = coupling_profile_lobe(lobe_index, altitude_km);
        let encoded_shape = lobe.axis_shape.w;
        let coherence = select(
            clamp(encoded_shape / (encoded_shape + 3.0), 0.0, 1.0),
            0.28,
            encoded_shape < 0.0,
        );
        let cosine = dot(view,
            coupling_safe_normalize(lobe.axis_shape.xyz));
        let lobe_radiance = max(vec3<f32>(0.0),
            lobe.integrated_radiance_normalization.xyz);
        result.low_g += lobe_radiance * cloud_directional_sky_anchor_phase(
            cosine, coherence, CLOUD_DIRECTIONAL_SKY_G_LOW);
        result.middle_g += lobe_radiance *
            cloud_directional_sky_anchor_phase(
                cosine, coherence, CLOUD_DIRECTIONAL_SKY_G_MIDDLE);
        result.high_g += lobe_radiance * cloud_directional_sky_anchor_phase(
            cosine, coherence, CLOUD_DIRECTIONAL_SKY_G_HIGH);
    }
    return result;
}

fn cloud_mix_directional_sky_phase_anchors(
    first: CloudDirectionalSkyPhaseAnchors,
    second: CloudDirectionalSkyPhaseAnchors,
    amount: f32,
) -> CloudDirectionalSkyPhaseAnchors {
    let fraction = saturate(amount);
    return CloudDirectionalSkyPhaseAnchors(
        mix(first.low_g, second.low_g, fraction),
        mix(first.middle_g, second.middle_g, fraction),
        mix(first.high_g, second.high_g, fraction),
    );
}

fn cloud_directional_sky_band_cache(
    layer: Layer, renderer_direction: vec3<f32>,
) -> CloudDirectionalSkyBandCache {
    let lower_altitude = max(0.0, layer.geometry.x);
    let upper_altitude = max(
        lower_altitude + 0.001, layer.geometry.x + layer.geometry.y);
    let middle_altitude = 0.5 * (lower_altitude + upper_altitude);
    let atmosphere_direction = vec3<f32>(
        renderer_direction.x, renderer_direction.z, renderer_direction.y);
    let lower = cloud_directional_sky_phase_anchors(
        lower_altitude, atmosphere_direction);
    let upper = cloud_directional_sky_phase_anchors(
        upper_altitude, atmosphere_direction);
    var middle = cloud_mix_directional_sky_phase_anchors(
        lower, upper, 0.5);
    let genus = i32(round(layer.scale.z));
    // A third physical altitude knot is reserved for deep convection. Shallow
    // and sheet layers remain a two-knot cache, while every event still sees a
    // continuous altitude/material interpolation.
    if (layer.geometry.y > 3.5 || genus == 9 || genus == 10) {
        middle = cloud_directional_sky_phase_anchors(
            middle_altitude, atmosphere_direction);
    }
    return CloudDirectionalSkyBandCache(
        lower, middle, upper,
        vec2<f32>(lower_altitude,
            1.0 / max(0.001, upper_altitude - lower_altitude)),
    );
}

fn cloud_directional_sky_material_phase(
    anchors: CloudDirectionalSkyPhaseAnchors,
    asymmetry_rgb: vec3<f32>,
) -> vec3<f32> {
    let asymmetry = clamp(
        asymmetry_rgb,
        vec3<f32>(CLOUD_DIRECTIONAL_SKY_G_LOW),
        vec3<f32>(CLOUD_DIRECTIONAL_SKY_G_HIGH));
    let low_fraction = clamp(
        (asymmetry - vec3<f32>(CLOUD_DIRECTIONAL_SKY_G_LOW)) /
            (CLOUD_DIRECTIONAL_SKY_G_MIDDLE - CLOUD_DIRECTIONAL_SKY_G_LOW),
        vec3<f32>(0.0), vec3<f32>(1.0));
    let high_fraction = clamp(
        (asymmetry - vec3<f32>(CLOUD_DIRECTIONAL_SKY_G_MIDDLE)) /
            (CLOUD_DIRECTIONAL_SKY_G_HIGH - CLOUD_DIRECTIONAL_SKY_G_MIDDLE),
        vec3<f32>(0.0), vec3<f32>(1.0));
    let low_to_middle = mix(
        anchors.low_g, anchors.middle_g, low_fraction);
    let middle_to_high = mix(
        anchors.middle_g, anchors.high_g, high_fraction);
    return max(vec3<f32>(0.0), select(
        low_to_middle,
        middle_to_high,
        asymmetry > vec3<f32>(CLOUD_DIRECTIONAL_SKY_G_MIDDLE)));
}

fn cloud_sample_directional_sky_band_cache(
    cache: CloudDirectionalSkyBandCache,
    physical_altitude_km: f32,
    asymmetry_rgb: vec3<f32>,
) -> vec3<f32> {
    let altitude_fraction = saturate(
        (physical_altitude_km - cache.altitude_range.x) *
            cache.altitude_range.y);
    var first = cache.lower;
    var second = cache.middle;
    var band_fraction = altitude_fraction * 2.0;
    if (altitude_fraction > 0.5) {
        first = cache.middle;
        second = cache.upper;
        band_fraction = (altitude_fraction - 0.5) * 2.0;
    }
    let altitude_anchors = cloud_mix_directional_sky_phase_anchors(
        first, second, band_fraction);
    return cloud_directional_sky_material_phase(
        altitude_anchors, asymmetry_rgb);
}

struct CloudFallbackDiffuseOpticalDepth {
    upper_rgb: vec3<f32>,
    lower_rgb: vec3<f32>,
};

const CLOUD_FALLBACK_DIFFUSE_MAX_TAU: f32 =
    ${CLOUD_FALLBACK_DIFFUSE_MAX_OPTICAL_DEPTH}.0;
// AAA cloud renderers commonly use a low-frequency density/SDF representation
// for local ambient visibility while a deep-shadow map owns directional source
// visibility. The signed distance below was fetched with the authoritative
// macro density and propagated through the resolved one/two-owner material, so
// this closure adds no texture lookup, owner traversal, or discontinuous cone
// hit test. It estimates only the receiver's local self-occlusion; remote cloud
// banks already affect directional light through the coupling atlas.
fn cloud_local_sdf_diffuse_optical_depth(
    point: vec3<f32>, density: f32,
    spectral_extinction_coefficient: vec3<f32>,
    local_material: CloudLocalMaterial,
    layer: Layer,
) -> CloudFallbackDiffuseOpticalDepth {
    let local_extinction = max(vec3<f32>(0.0),
        density * spectral_extinction_coefficient);
    if (local_material.atlas_match > 0.5) {
        // Per-channel path moments were accumulated additively from each
        // owner's physical support. Multiplication by the bulk local sigma_t
        // exactly reconstructs sum_i sigma_t_i * length_i without inventing an
        // averaged base/depth slab or discarding spectral extinction weights.
        return CloudFallbackDiffuseOpticalDepth(
            min(vec3<f32>(CLOUD_FALLBACK_DIFFUSE_MAX_TAU),
                local_extinction * max(
                    vec3<f32>(0.0), local_material.local_upper_path_km)),
            min(vec3<f32>(CLOUD_FALLBACK_DIFFUSE_MAX_TAU),
                local_extinction * max(
                    vec3<f32>(0.0), local_material.local_lower_path_km)),
        );
    }
    let base_altitude_km = layer.geometry.x;
    let geometric_depth_km = max(0.02, layer.geometry.y);
    let altitude_km = length(point) - PLANET_RADIUS;
    let height_fraction = saturate(
        (altitude_km - base_altitude_km) / geometric_depth_km);
    let macro_voxel_km = geometric_depth_km / 47.0;
    let boundary_reach_km = macro_voxel_km * mix(
        0.35, 1.35, sqrt(saturate(density)));
    // Legacy unowned layers have no SDF. Keep their proxy strictly local and
    // smoothly bounded to the same six-voxel support as owned clouds.
    let reach_cap_km = macro_voxel_km * 6.0;
    let ambient_reach_km = reach_cap_km * (1.0 - exp(
        -boundary_reach_km / max(1e-5, reach_cap_km)));
    let upper_length_km = min(
        ambient_reach_km,
        max(0.0, (1.0 - height_fraction) * geometric_depth_km));
    let lower_length_km = min(
        ambient_reach_km,
        max(0.0, height_fraction * geometric_depth_km));
    return CloudFallbackDiffuseOpticalDepth(
        min(vec3<f32>(CLOUD_FALLBACK_DIFFUSE_MAX_TAU),
            local_extinction * upper_length_km),
        min(vec3<f32>(CLOUD_FALLBACK_DIFFUSE_MAX_TAU),
            local_extinction * lower_length_km),
    );
}

// Camera-cloud direct light consumes the same continuous, cumulative RGB
// deep-shadow field as atmosphere, ground and finite weather. The field owns
// every cloud layer exactly once. physical_source_irradiance_at separately
// owns atmosphere-to-source transfer, so the returned value is cloud-only and
// must not be multiplied by residual-light or resident-owner Beer products.
fn cloud_camera_source_transmittance(
    renderer_point: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    if (!atmo_source_enabled(source_index)) { return vec3<f32>(1.0); }
    return clamp(coupling_cloud_source_transmittance_at(
        renderer_to_atmosphere_world(renderer_point), source_index),
        vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_owner_box_axis_exit_path_km(
    local_position_axis_km: f32,
    local_direction_axis: f32,
    half_extent_km: f32,
) -> f32 {
    if (abs(local_direction_axis) < 1e-5) { return FAR_LIMIT; }
    let half_extent = max(0.001, half_extent_km);
    let local_position = clamp(
        local_position_axis_km, -half_extent, half_extent);
    let face = select(-half_extent, half_extent,
        local_direction_axis > 0.0);
    return max(0.0, (face - local_position) / local_direction_axis);
}

fn cloud_owner_source_exit_path_km(
    renderer_point: vec3<f32>,
    owner_index: u32,
    source_direction: vec3<f32>,
) -> f32 {
    let system_count = min(
        36u,
        min(
            u32(max(0.0, cloud_system_buffer.header.x)),
            u32(max(0.0, cloud_macro_bindings.header.x)),
        ),
    );
    if (owner_index >= system_count) { return 0.0; }
    let system = cloud_system_buffer.systems[owner_index];
    if (system.identity.x < 0.5) { return 0.0; }
    let altitude_km = length(renderer_point) - PLANET_RADIUS;
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = renderer_point.xz - center;
    let local_position = vec3<f32>(
        dot(delta, crosswind_axis),
        altitude_km - (system.vertical_extent.x + depth * 0.5),
        dot(delta, downwind_axis));
    let source = normalize(source_direction);
    let local_direction = vec3<f32>(
        dot(source.xz, crosswind_axis),
        source.y,
        dot(source.xz, downwind_axis));
    let half_extent = vec3<f32>(
        minor_radius,
        depth * 0.5,
        major_radius);
    let exit_x = cloud_owner_box_axis_exit_path_km(
        local_position.x, local_direction.x, half_extent.x);
    let exit_y = cloud_owner_box_axis_exit_path_km(
        local_position.y, local_direction.y, half_extent.y);
    let exit_z = cloud_owner_box_axis_exit_path_km(
        local_position.z, local_direction.z, half_extent.z);
    let exit_path = min(exit_x, min(exit_y, exit_z));
    return select(0.0, exit_path,
        finite_scalar(exit_path) && exit_path > 0.0 && exit_path < FAR_LIMIT);
}

fn cloud_local_directional_source_optical_depth(
    point: vec3<f32>,
    density: f32,
    spectral_extinction_rgb_per_km: vec3<f32>,
    local_material: CloudLocalMaterial,
    local_optics: CloudLocalOptics,
    diffuse_optical_depth: CloudFallbackDiffuseOpticalDepth,
    source_direction: vec3<f32>,
) -> vec3<f32> {
    let vertical_tau = cloud_local_source_optical_depth(
        diffuse_optical_depth.upper_rgb,
        diffuse_optical_depth.lower_rgb,
        source_direction.y);
    if (local_material.atlas_match <= 0.5) {
        return cloud_unresolved_footprint_optical_depth(
            local_optics, vertical_tau);
    }
    let secondary_amount = select(
        0.0,
        1.0 - saturate(local_material.primary_fraction),
        local_material.secondary_owner > 0.5);
    let primary_amount = 1.0 - secondary_amount;
    var owner_exit_path = cloud_owner_source_exit_path_km(
        point,
        cloud_material_owner(local_material.primary_owner),
        source_direction) * primary_amount;
    if (secondary_amount > 0.0001) {
        owner_exit_path += cloud_owner_source_exit_path_km(
            point,
            cloud_material_owner(local_material.secondary_owner),
            source_direction) * secondary_amount;
    }
    if (owner_exit_path <= 1e-5) {
        return cloud_unresolved_footprint_optical_depth(
            local_optics, vertical_tau);
    }
    let local_extinction = max(
        vec3<f32>(0.0), density * spectral_extinction_rgb_per_km);
    let finite_owner_tau = local_extinction * owner_exit_path;
    let slant_tau = vertical_tau / max(1e-4, abs(source_direction.y));
    let resolved_tau = min(
        vec3<f32>(CLOUD_FALLBACK_DIFFUSE_MAX_TAU),
        min(slant_tau, finite_owner_tau));
    if (local_optics.high_ice_coverage > 1e-5 ||
        local_optics.high_ice_second_moment > 1e-5) {
        return cloud_high_ice_expected_beer_tau(
            resolved_tau,
            local_optics.high_ice_mean_density,
            local_optics.high_ice_second_moment,
            local_optics.high_ice_coverage,
            local_optics.high_ice_residual_variance,
            owner_exit_path,
            local_optics.high_ice_correlation_length,
            local_optics.high_ice_lateral_filter_radius,
            local_optics.high_ice_depth_filter_radius);
    }
    return cloud_unresolved_footprint_optical_depth(
        local_optics, resolved_tau);
}

// Ordinary cloud single scattering is a bulk-mixture source. Basing it on an
// owner identity made a third overlapping owner disappear abruptly whenever
// the second and third strengths exchanged rank. The material moments above
// already contain every owner's extinction/scattering contribution, so this
// identity-free form is both passive and continuous. Owner-indexed fields are
// reserved for resident P1/lightning transports that are actually packed per
// meteorological system.
fn cloud_bulk_direct_radiance(
    density: f32,
    spectral_extinction_rgb_per_km: vec3<f32>,
    local_optics: CloudLocalOptics,
    atmosphere_transported_irradiance_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> vec3<f32> {
    let sigma_t = max(vec3<f32>(0.0),
        density * spectral_extinction_rgb_per_km);
    let sigma_s = sigma_t * clamp(
        local_optics.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let source_coefficient = sigma_s * max(
        vec3<f32>(0.0), local_optics.phase) * max(
        vec3<f32>(0.0), atmosphere_transported_irradiance_rgb) * clamp(
        source_visibility_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let radiance = source_coefficient / max(vec3<f32>(1e-8), sigma_t);
    return select(vec3<f32>(0.0), radiance, finite_rgb(radiance));
}

// The directional coupling profile is source-disc-free atmosphere radiance
// over the complete sphere, not merely the upper hemisphere. Its phase
// integral therefore owns atmospheric first order once. Exact hemispheric
// irradiance supplies only higher orders, while ground reflection (excluded
// from the profile) owns its complete first+higher closure. Every transport is
// RGB and passive; angular Beer averages are convex before converting to tau.
fn cloud_fallback_diffuse_radiance(
    local: CloudLocalOptics,
    directional_atmosphere_phase_integral: vec3<f32>,
    upper_atmosphere_mean_radiance: vec3<f32>,
    lower_atmosphere_mean_radiance: vec3<f32>,
    ground_mean_radiance: vec3<f32>,
    upper_optical_depth_rgb: vec3<f32>,
    lower_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let upper_tau = max(vec3<f32>(0.0), upper_optical_depth_rgb);
    let lower_tau = max(vec3<f32>(0.0), lower_optical_depth_rgb);
    let upper_hemisphere_transmittance =
        cloud_hemispheric_diffuse_transmittance_rgb(local, upper_tau);
    let lower_hemisphere_transmittance =
        cloud_hemispheric_diffuse_transmittance_rgb(local, lower_tau);
    let upper_atmosphere = max(
        vec3<f32>(0.0), upper_atmosphere_mean_radiance);
    let lower_atmosphere = max(
        vec3<f32>(0.0), lower_atmosphere_mean_radiance);
    let atmosphere_radiance = upper_atmosphere + lower_atmosphere;
    let atmosphere_first_order_transmittance = select(
        0.5 * (upper_hemisphere_transmittance +
            lower_hemisphere_transmittance),
        (upper_atmosphere * upper_hemisphere_transmittance +
            lower_atmosphere * lower_hemisphere_transmittance) /
            max(vec3<f32>(1e-8), atmosphere_radiance),
        atmosphere_radiance > vec3<f32>(1e-8),
    );
    let atmosphere_directional_first_order =
        max(vec3<f32>(0.0), directional_atmosphere_phase_integral) *
        clamp(local.single_scattering_albedo,
            vec3<f32>(0.0), vec3<f32>(1.0)) *
        clamp(atmosphere_first_order_transmittance,
            vec3<f32>(0.0), vec3<f32>(1.0));
    let upper_higher_order = upper_atmosphere *
        cloud_passive_high_order_hemispheric_diffuse_transport_rgb(
            local, upper_tau);
    let lower_higher_order = lower_atmosphere *
        cloud_passive_high_order_hemispheric_diffuse_transport_rgb(
            local, lower_tau);
    let ground_first_and_higher_order = max(
        vec3<f32>(0.0), ground_mean_radiance) *
        cloud_passive_hemispheric_diffuse_scattering_transport_rgb(
            local, lower_tau);
    return atmosphere_directional_first_order +
        upper_higher_order + lower_higher_order +
        ground_first_and_higher_order;
}

fn is_sheet_layer(layer: Layer) -> bool {
    let genus = i32(round(layer.scale.z));
    let species = i32(round(layer.species.x));
    // Cirrostratus is a geometrically thin sheet but no longer uses the one-
    // interval fixed quadrature below.  Its finite veil contains resolved 3-D
    // fibres; twelve deterministic shell nodes turned those fibres into
    // coherent concentric screen bands.  It therefore takes the ordinary
    // owner-support event march, with temporally stratified physical samples.
    // Stratocumulus is a shallow field of resolved convective cells. Treating
    // it as a homogeneous quadrature sheet erased its rolls, gaps and domes.
    // Stratus fractus is likewise a finite shred population and must retain
    // ordinary volumetric silhouette lighting rather than deck post-shading.
    return genus == 5 || genus == 6 ||
        (genus == 8 && species != 16);
}

// Evaluate the outgoing source term at one ordered stratiform quadrature
// event. Source visibility, local material, phase, atmosphere illumination,
// and light-volume residency all belong to the receiver point; collapsing
// them to the strongest or middle sample turns vertically changing decks into
// a single post-lit slab and breaks ordered emission-absorption transport.
fn sheet_node_source_radiance(
    point: vec3<f32>, direction: vec3<f32>, density: f32,
    layer: Layer, index: i32,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    local_material: CloudLocalMaterial,
    spectral_extinction_coefficient: vec3<f32>,
    directional_sky_cache: ptr<function, CloudDirectionalSkyBandCache>,
    directional_sky_cache_valid: ptr<function, bool>,
) -> vec3<f32> {
    let sun_cosine = dot(direction, sun_direction);
    let moon_cosine = dot(direction, moon_direction);
    let sun_optics = cloud_local_material_optics(
        local_material, sun_cosine);
    let moon_optics = cloud_local_material_optics(
        local_material, moon_cosine);
    let local_sun_irradiance = physical_source_irradiance_at(0u, point);
    let local_moon_irradiance = physical_source_irradiance_at(1u, point);

    let primary_owner = cloud_material_owner(local_material.primary_owner);
    let secondary_amount = select(
        0.0,
        1.0 - saturate(local_material.primary_fraction),
        local_material.secondary_owner > 0.5);
    let secondary_owner = cloud_material_owner(
        local_material.secondary_owner);
    var primary_volume_confidence = 0.0;
    if (local_material.atlas_match > 0.5) {
        primary_volume_confidence = cloud_lv_owner_sample_confidence(
            point, primary_owner);
    }
    var secondary_volume_confidence = 1.0;
    if (secondary_amount > 0.0001) {
        secondary_volume_confidence = cloud_lv_owner_sample_confidence(
            point, secondary_owner);
    }
    let light_volume_confidence = min(
        primary_volume_confidence, secondary_volume_confidence);
    var resolved_light_volume_confidence = light_volume_confidence;

    let source_sun_transmittance =
        cloud_camera_source_transmittance(point, 0u);
    let source_moon_transmittance =
        cloud_camera_source_transmittance(point, 1u);
    let diffuse_optical_depth = cloud_local_sdf_diffuse_optical_depth(
        point, density, spectral_extinction_coefficient,
        local_material, layer);
    let primary_amount = 1.0 - secondary_amount;
    let source_sun_direct = cloud_bulk_direct_radiance(
        density, spectral_extinction_coefficient, sun_optics,
        local_sun_irradiance, source_sun_transmittance);
    let source_moon_direct = cloud_bulk_direct_radiance(
        density, spectral_extinction_coefficient, moon_optics,
        local_moon_irradiance, source_moon_transmittance);

    // Direct source visibility is complete in both closures. Confidence only
    // crossfades the resident local P1 higher-order solution against the
    // bounded analytic higher-order closure at tile boundaries.
    let light_volume_direct_sun = source_sun_direct;
    var light_volume_p1 = vec3<f32>(0.0);
    if (light_volume_confidence > 0.0001) {
        let sigma_t = density * spectral_extinction_coefficient;
        let sigma_s = sigma_t * sun_optics.single_scattering_albedo;
        let sigma_tr = max(vec3<f32>(1e-6), sigma_t - sigma_s +
            sigma_s * (vec3<f32>(1.0) - sun_optics.asymmetry));
        let diffusion = 1.0 / (3.0 * sigma_tr);
        var p1_incident = cloud_lv_sample_owner_scattering_radiance(
            point, -direction, primary_owner, diffusion) * primary_amount;
        if (secondary_amount > 0.0001) {
            p1_incident += cloud_lv_sample_owner_scattering_radiance(
                point, -direction, secondary_owner, diffusion) * secondary_amount;
        }
        light_volume_p1 = cloud_propagated_diffuse_scattering_radiance(
            sun_optics, p1_incident);
    }
    if (!finite_rgb(light_volume_p1) ||
        any(light_volume_p1 < vec3<f32>(0.0))) {
        light_volume_p1 = vec3<f32>(0.0);
        resolved_light_volume_confidence = 0.0;
    }

    // The nonresident path reconstructs receiver-local diffuse self-visibility
    // from the already-fetched macro SDF. A complete resident P1 owner set
    // bypasses the proxy without changing this ordered camera-transport solve.
    var analytic_diffuse_radiance = vec3<f32>(0.0);
    var exterior_diffuse_reference = vec3<f32>(0.0);
    var source_higher_order_reference = vec3<f32>(0.0);
    let lighting_debug_view = i32(round(p[22].y));
    let needs_exterior_diffuse_reference = lighting_debug_view == 10;
    let needs_source_higher_order_reference = lighting_debug_view == 13;
    var analytic_reference_evaluated = false;
    let strict_radiometric_agreement = p[38].w > 0.5;
    if (strict_radiometric_agreement ||
        resolved_light_volume_confidence < 0.9999 ||
        needs_exterior_diffuse_reference ||
        needs_source_higher_order_reference) {
        analytic_reference_evaluated = true;
        let sun_local_tau = cloud_local_directional_source_optical_depth(
            point, density, spectral_extinction_coefficient,
            local_material, sun_optics, diffuse_optical_depth, sun_direction);
        let moon_local_tau = cloud_local_directional_source_optical_depth(
            point, density, spectral_extinction_coefficient,
            local_material, moon_optics, diffuse_optical_depth, moon_direction);
        let sun_multi = cloud_optical_multiple_scattering(
            sun_optics, source_sun_transmittance,
            sun_local_tau, sun_cosine);
        let moon_multi = cloud_optical_multiple_scattering(
            moon_optics, source_moon_transmittance,
            moon_local_tau, moon_cosine);
        // Keep resolved collimated first order common to both closures. These
        // two terms are only the warm/neutral source-driven higher orders;
        // the directional atmosphere and ground remain a separate diffuse
        // field whose naturally bluer chroma is transported below.
        let source_higher_order =
            local_sun_irradiance * sun_multi +
            local_moon_irradiance * moon_multi;
        source_higher_order_reference = cloud_finite_nonnegative_radiance(
            source_higher_order, vec3<f32>(0.0));

        let atmosphere_point = renderer_to_atmosphere_world(point);
        let physical_altitude_km = max(0.0,
            length(atmosphere_point) -
                physical_atmosphere.radii_scales.x);
        let incident_sky = physical_diffuse_irradiance_at(point) / PI;
        let lower_atmosphere =
            physical_lower_atmosphere_irradiance_at(point) / PI;
        let ground_irradiance = physical_ground_irradiance_at(point) / PI;
        if (!(*directional_sky_cache_valid)) {
            *directional_sky_cache = cloud_directional_sky_band_cache(
                layer, direction);
            *directional_sky_cache_valid = true;
        }
        let directional_atmosphere_phase_integral =
            cloud_sample_directional_sky_band_cache(
                *directional_sky_cache,
                physical_altitude_km,
                sun_optics.asymmetry);
        let sky_tau = diffuse_optical_depth.upper_rgb;
        let ground_tau = diffuse_optical_depth.lower_rgb;
        let diffuse = cloud_fallback_diffuse_radiance(
            sun_optics,
            directional_atmosphere_phase_integral,
            incident_sky,
            lower_atmosphere,
            ground_irradiance,
            sky_tau,
            ground_tau);
        exterior_diffuse_reference = cloud_finite_nonnegative_radiance(
            diffuse, vec3<f32>(0.0));
        analytic_diffuse_radiance = cloud_finite_nonnegative_radiance(
            source_higher_order + exterior_diffuse_reference,
            cloud_finite_nonnegative_radiance(
                source_higher_order, vec3<f32>(0.0)));
    }
    // Only higher-order radiance changes representation at a residency edge.
    // Adding the complete direct term outside the convex blend makes the
    // source/ambient chromatic separation exact and prevents a tile state from
    // ever modulating resolved Sun or Moon first order.
    var higher_order_blend_confidence = resolved_light_volume_confidence;
    if (analytic_reference_evaluated) {
        higher_order_blend_confidence *= cloud_higher_order_agreement_weight(
            analytic_diffuse_radiance, light_volume_p1);
    }
    let direct_radiance = cloud_finite_nonnegative_radiance(
        source_sun_direct + source_moon_direct, vec3<f32>(0.0));
    let production_radiance = cloud_finite_nonnegative_radiance(
        direct_radiance + mix(
            analytic_diffuse_radiance,
            light_volume_p1,
            higher_order_blend_confidence),
        direct_radiance,
    );
    let direct_sun_radiance = light_volume_direct_sun;
    return cloud_lighting_debug_source(
        production_radiance,
        direct_sun_radiance,
        exterior_diffuse_reference,
        light_volume_p1,
        source_higher_order_reference,
    );
}

/**
 * Stratiform clouds are optically continuous decks. Marching them as a stack
 * of uniformly spaced density samples exposes the sampling lattice as
 * horizontal bands, especially along long grazing paths. Ordered
 * Gauss-Legendre events preserve smooth quadrature while integrating the local
 * material, visibility and source term through RGB emission-absorption.
 */
fn march_sheet_layer(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer, index: i32,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    interval: vec2<f32>,
) -> LayerMarchResult {
    var result: LayerMarchResult;
    result.transport = camera_transport_identity();
    result.first_depth = FAR_LIMIT;
    result.mean_depth = FAR_LIMIT;
    result.optical_depth_y = 0.0;
    result.opacity_y = 0.0;
    result.velocity = layer.motion.xy;
    result.layer_identifier = f32(index);
    result.evaluated_steps = 12.0;
    let near = interval.x;
    let far = interval.y;
    if (far <= near) { return result; }

    // Twelve-point Gauss-Legendre quadrature over [0, 1]. Integrating actual
    // extinction at each node is essential: a frontal sheet can cross several
    // finite owners/material phases, and applying one mean-point coefficient
    // after density integration silently loses its LWP/IWP optical depth.
    let nodes = array<f32, 12>(
        0.0092196829, 0.0479413718, 0.1150486629, 0.2063410229,
        0.3160842505, 0.4373832957, 0.5626167043, 0.6839157495,
        0.7936589771, 0.8849513371, 0.9520586282, 0.9907803171,
    );
    let weights = array<f32, 12>(
        0.0235876682, 0.0534696629, 0.0800391643, 0.1015837134,
        0.1167462683, 0.1245735229, 0.1245735229, 0.1167462683,
        0.1015837134, 0.0800391643, 0.0534696629, 0.0235876682,
    );
    let path_length = far - near;
    // The relative layer operator is applied in front of the already-rendered
    // clear sky.  Seed both paths with the exact camera-to-shell air prefix so
    // cloud source and cloud-shadowed air are attenuated at their real depth,
    // rather than wrapped at one representative depth after marching.
    let camera_to_shell_air = cloud_background_atmosphere_segment(
        origin, direction, 0.0, near);
    var combined_transport = camera_to_shell_air;
    var clear_transport = camera_to_shell_air;
    var cloud_transmittance = vec3<f32>(1.0);
    var cloud_source_radiance = vec3<f32>(0.0);
    // Every prefix air event is in front of the sheet and therefore has q=1.
    var air_proxy_weight = camera_to_shell_air.radiance;
    var cloud_weighted_air_proxy = camera_to_shell_air.radiance;
    var weighted_depth = 0.0;
    var depth_weight = 0.0;
    var first_depth = FAR_LIMIT;
    var directional_sky_cache = cloud_empty_directional_sky_band_cache();
    var directional_sky_cache_valid = false;
    for (var sample = 0; sample < 12; sample++) {
        let travelled = near + path_length * nodes[sample];
        let point = origin + direction * travelled;
        let cloud_sample = cloud_density_material_sample(point, layer, index);
        let density = cloud_sample.density;
        if (density > 0.005) { first_depth = min(first_depth, travelled); }
        let ds = weights[sample] * path_length;
        var cloud_extinction = vec3<f32>(0.0);
        var cloud_source_coefficient = vec3<f32>(0.0);
        if (density > 0.0001) {
            let local_material = cloud_sample.material;
            let spectral_extinction_coefficient =
                cloud_spectral_extinction_coefficient_from_material(
                    local_material, layer);
            let resolved_cloud_extinction = max(
                vec3<f32>(0.0), density * spectral_extinction_coefficient);
            let view_optics = cloud_local_material_optics(
                local_material, dot(direction, sun_direction));
            let diffuse_optical_depth =
                cloud_local_sdf_diffuse_optical_depth(
                    point, density, spectral_extinction_coefficient,
                    local_material, layer);
            cloud_extinction = cloud_camera_footprint_extinction(
                view_optics,
                resolved_cloud_extinction,
                resolved_cloud_extinction * ds,
                ds);
            if (maximum_rgb(cloud_extinction) > 1e-8) {
                let source_radiance = sheet_node_source_radiance(
                    point, direction, density, layer, index,
                    sun_direction, moon_direction, local_material,
                    spectral_extinction_coefficient,
                    &directional_sky_cache,
                    &directional_sky_cache_valid);
                cloud_source_coefficient = cloud_extinction *
                    max(vec3<f32>(0.0), source_radiance);
            }
        }
        let cloud_active = maximum_rgb(cloud_extinction) > 1e-8;
        let air = cloud_coupled_atmosphere_source_sample(
            point, direction, true);
        let combined_source_coefficient = max(
            vec3<f32>(0.0),
            air.source_radiance_coefficient_rgb_per_km +
                cloud_source_coefficient);
        let combined_segment = integrate_camera_transport_coefficients(
            max(vec3<f32>(0.0),
                air.extinction_rgb_per_km + cloud_extinction),
            combined_source_coefficient,
            ds);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            ds);
        let cloud_step_transmittance = exp(-cloud_extinction * ds);
        let clear_air_contribution =
            clear_transport.transmittance * clear_segment.radiance;
        let cloud_midpoint_transmittance =
            cloud_transmittance * sqrt(cloud_step_transmittance);
        air_proxy_weight += clear_air_contribution;
        cloud_weighted_air_proxy +=
            cloud_midpoint_transmittance * clear_air_contribution;
        let local_cloud_source = cloud_source_share_of_combined_segment(
            combined_segment, cloud_source_coefficient,
            combined_source_coefficient);
        cloud_source_radiance +=
            combined_transport.transmittance * local_cloud_source;
        let removed = vec3<f32>(1.0) - cloud_step_transmittance;
        let visible_removal = combined_transport.transmittance * removed;
        let contribution = photopic(visible_removal);
        weighted_depth += travelled * contribution;
        depth_weight += contribution;
        combined_transport = compose_camera_transport(
            combined_transport, combined_segment);
        clear_transport = compose_camera_transport(
            clear_transport, clear_segment);
        cloud_transmittance *= cloud_step_transmittance;
    }
    let exact_shared_air = cloud_background_atmosphere_segment(
        origin, direction, 0.0, far);
    let relative_transport = cloud_relative_transport_from_air_moment(
        cloud_source_radiance, exact_shared_air,
        cloud_weighted_air_proxy, air_proxy_weight,
        cloud_transmittance);
    let mean_depth = select(
        FAR_LIMIT, weighted_depth / depth_weight, depth_weight > 0.0);
    let transmittance_y = clamp(photopic(cloud_transmittance), 0.0, 1.0);
    result.transport = relative_transport;
    result.first_depth = first_depth;
    result.mean_depth = mean_depth;
    result.optical_depth_y = -log(max(0.0001, transmittance_y));
    result.opacity_y = 1.0 - transmittance_y;
    return result;
}

fn march_layer(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer, index: i32,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>, jitter: f32,
    interval: vec2<f32>,
    finite_owner_mode: bool,
) -> LayerMarchResult {
    var result: LayerMarchResult;
    result.transport = camera_transport_identity();
    result.first_depth = FAR_LIMIT;
    result.mean_depth = FAR_LIMIT;
    result.optical_depth_y = 0.0;
    result.opacity_y = 0.0;
    result.velocity = vec2<f32>(0.0);
    result.layer_identifier = f32(index);
    result.evaluated_steps = 0.0;
    if (layer.phase.z < 0.5) { return result; }
    let near = interval.x;
    let far = interval.y;
    if (far <= near) { return result; }

    let genus = i32(round(layer.scale.z));
    let species = i32(round(layer.species.x));
    // A finite atlas owner already provides the exact world-space support
    // interval and active-owner set.  Route that case through the bounded
    // physical marcher below so a shallow deck is resolved at physical
    // strata (with camera-footprint filtering) instead of collapsing the
    // complete curved-shell interval into twelve fixed shell nodes.  The
    // fixed sheet quadrature remains the conservative fallback for legacy
    // procedural layers that have no finite owner ABI.
    if (is_sheet_layer(layer) && !finite_owner_mode) {
        return march_sheet_layer(
            origin, direction, layer, index, sun_direction, moon_direction,
            interval,
        );
    }

    var step_count = i32(p[20].z);
    if (genus == 4 || genus == 7) {
        step_count = min(48, step_count + 12);
    }
    if (genus == 9 || genus == 10) {
        step_count = min(64, step_count + 18);
    }
    if (genus == 10) { step_count = min(144, step_count + 72); }
    let interval_length = far - near;
    // Grazing rays traverse far more cloud kilometres than zenith rays. A
    // fixed angular sample count exposes each stratum as a horizontal comb
    // close to the horizon, so enforce a bounded physical step length there.
    // Only the lower part of the dome reaches this cap.
    // Higher layers project a given physical distance into fewer pixels and
    // their genus wavelengths are larger than the 100 m low-cloud step. Match
    // the grazing cap to resolvable morphology instead of oversampling tens of
    // kilometres of mid/high shell with no visible gain.
    var maximum_step_km = 0.1;
    if (index == 1) { maximum_step_km = 0.16; }
    if (index == 2) { maximum_step_km = 0.24; }
    // Upper-cloud anatomy is materially smaller than the generic high-shell
    // wavelength.  Bound the stochastic stratum to the real fibre/cloudlet
    // scale: this prevents Ci sweep covariance from inflating a 20--75 m
    // strand into a broad ribbon, resolves Cc grains, and gives a Cs veil
    // several independent events through its shallow physical depth.
    if (genus == 1) {
        maximum_step_km = select(0.10, 0.08, species == 1);
    }
    if (genus == 2) { maximum_step_km = 0.08; }
    if (genus == 3) { maximum_step_km = 0.12; }
    if (genus == 10) { maximum_step_km = 0.08; }
    step_count = max(
        step_count,
        min(select(96, 144, genus == 10),
            i32(ceil(interval_length / maximum_step_km))),
    );
    // Retain the configured/base stratum density on short finite paths while
    // enforcing the physical ceiling on long gap-filled hulls. Removing gaps
    // may reduce work, but it can never coarsen an occupied cloud span.
    let finite_step_target_km = min(
        maximum_step_km,
        interval_length / f32(max(1, step_count)));
    let distribution_power = mix(
        1.08,
        1.42,
        smoothstep(12.0, 90.0, interval_length),
    );
    // Begin at the camera, exactly as the finite-media reference marcher does.
    // This keeps all source events behind the correct amount of foreground air
    // without reintroducing the old mean-depth atmosphere approximation.
    let camera_to_shell_air = cloud_background_atmosphere_segment(
        origin, direction, 0.0, near);
    var combined_transport = camera_to_shell_air;
    var clear_transport = camera_to_shell_air;
    var cloud_transmittance = vec3<f32>(1.0);
    var cloud_source_radiance = vec3<f32>(0.0);
    // Prefix air is wholly foreground; subsequent strata accumulate the
    // bounded weather-throughput moment q(s).
    var air_proxy_weight = camera_to_shell_air.radiance;
    var cloud_weighted_air_proxy = camera_to_shell_air.radiance;
    var weighted_depth = 0.0;
    var weight = 0.0;
    var first_depth = FAR_LIMIT;
    var actual_steps = 0.0;
    var integrated_far = near;
    // Resolve the positive-lobe atmosphere only if the nonresident closure is
    // actually needed. The bounded cache has deterministic altitude and phase
    // anchors, so no material or altitude is inherited from the first hit.
    var directional_sky_cache = cloud_empty_directional_sky_band_cache();
    var directional_sky_cache_valid = false;
    var finite_segment_end = near;
    var finite_segment_occupied = false;
    var finite_active_set = empty_ordered_active_set();
    var finite_event_dirty = true;
    // Camera projection and the unit view ray are invariant for every
    // stratum.  Only travelled distance scales the physical pixel cone.
    let fibratus_pixel_filter_radius_per_km =
        cloud_camera_fibratus_pixel_filter_radius_per_km();
    // At most 36 finite supports can form 36 occupied spans and 35 clear gaps.
    // FAR_LIMIT / 0.08 is 1750 samples at the smallest production target; the
    // fixed 1900 ceiling therefore covers every clipped support, all boundary
    // events, and floating-point boundary recovery without a data-sized loop.
    for (var iteration = 0; iteration < 1900; iteration++) {
        if ((!finite_owner_mode && iteration >= step_count) ||
            maximum_rgb(cloud_transmittance) < 0.01) {
            break;
        }

        var step_near = integrated_far;
        var step_far = integrated_far;
        if (finite_owner_mode) {
            if (finite_event_dirty) {
                let event = production_layer_traversal_event(
                    origin, direction, layer, index, integrated_far, far);
                finite_segment_end = event.segment_end;
                finite_segment_occupied = event.occupied > 0.5;
                finite_active_set = event.active_set;
                finite_event_dirty = false;
            }
            if (finite_segment_end <= integrated_far + 1e-6) {
                integrated_far = min(far, integrated_far + 1e-5);
                finite_event_dirty = true;
                continue;
            }
            if (!finite_segment_occupied) {
                // Support-free distance is an exact shadowed-atmosphere
                // operator. It advances no cloud stratum and therefore cannot
                // dilute the physical sample spacing of a later Cu owner.
                let clear_gap = cloud_background_atmosphere_segment(
                    origin, direction, integrated_far, finite_segment_end);
                let clear_air_contribution =
                    clear_transport.transmittance * clear_gap.radiance;
                air_proxy_weight += clear_air_contribution;
                cloud_weighted_air_proxy +=
                    cloud_transmittance * clear_air_contribution;
                combined_transport = compose_camera_transport(
                    combined_transport, clear_gap);
                clear_transport = compose_camera_transport(
                    clear_transport, clear_gap);
                integrated_far = finite_segment_end;
                finite_event_dirty = true;
                continue;
            }
            step_near = integrated_far;
            step_far = min(
                finite_segment_end, integrated_far + finite_step_target_km);
            integrated_far = step_far;
            if (integrated_far >= finite_segment_end - 1e-6) {
                finite_event_dirty = true;
            }
        } else {
            let lower_t = f32(iteration) / f32(max(step_count, 1));
            let upper_t = f32(iteration + 1) / f32(max(step_count, 1));
            step_near = near + interval_length *
                pow(lower_t, distribution_power);
            step_far = near + interval_length *
                pow(upper_t, distribution_power);
            integrated_far = step_far;
        }

        let parent_step_length = step_far - step_near;
        if (parent_step_length <= 1e-7) { continue; }
        // Finite Ci/Cc/Cs owners are the only camera family that receives
        // packet refinement. Their occupied parent interval is integrated at
        // two positive GL2 nodes; legacy/procedural families retain one
        // jittered sample and exactly their prior cost/path.
        let high_ice_camera_packet = finite_owner_mode &&
            genus >= 1 && genus <= 3;
        for (var camera_subnode = 0u;
            camera_subnode < CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT;
            camera_subnode += 1u) {
            if (!high_ice_camera_packet && camera_subnode > 0u) { break; }
            let step_length = select(
                parent_step_length,
                0.5 * parent_step_length,
                high_ice_camera_packet);
            // Correlated R2 strata preserve the spatial/temporal blue-noise
            // rank for ordinary media. High-ice uses fixed positive GL2 nodes
            // so each subsegment's physical depth footprint is explicit.
            let stratum_jitter = fract(
                jitter + actual_steps * 0.5698402909980532 +
                    f32(index) * 0.438289);
            let guarded_jitter = mix(0.08, 0.92, stratum_jitter);
            let gl2_offset = select(
                0.0,
                (select(-1.0, 1.0, camera_subnode == 1u) *
                    CLOUD_CAMERA_HIGH_ICE_GL2_NODE) *
                    0.5 * parent_step_length,
                high_ice_camera_packet);
            let travelled = select(
                mix(step_near, step_far, guarded_jitter),
                0.5 * (step_near + step_far) + gl2_offset,
                high_ice_camera_packet);
            actual_steps += 1.0;
        let point = origin + direction * travelled;
        let fibratus_filter_radius_km = max(0.0, travelled) *
            fibratus_pixel_filter_radius_per_km;
        var cloud_sample: CloudDensityMaterialSample;
        if (finite_owner_mode) {
            cloud_sample = cloud_density_material_sample_camera_active(
                point, layer, index, finite_active_set,
                fibratus_filter_radius_km, step_length, direction);
        } else {
            cloud_sample = cloud_density_material_sample_camera(
                point, layer, index, fibratus_filter_radius_km,
                step_length, direction);
        }
        let density = cloud_sample.density;
        // The atmosphere proxy is required for both material hits and density
        // misses inside a conservative owner span. A miss uses this cheap
        // fine-stratum coefficient solve; adaptive 2/5-node atmosphere work is
        // reserved for the camera prefix and true macro-gaps.
        let air = cloud_coupled_atmosphere_source_sample(
            point, direction, true);
        if (density > 0.001) {
            let local_material = cloud_sample.material;
            let sun_cosine = dot(direction, sun_direction);
            let moon_cosine = dot(direction, moon_direction);
            let sun_optics = cloud_local_material_optics(
                local_material, sun_cosine);
            let moon_optics = cloud_local_material_optics(
                local_material, moon_cosine);
            let extinction_coefficient = cloud_extinction_coefficient_from_mass(
                local_material, layer);
            let spectral_extinction_coefficient =
                cloud_spectral_extinction_coefficient_from_material(
                    local_material, layer);
            let diffuse_optical_depth =
                cloud_local_sdf_diffuse_optical_depth(
                    point, density, spectral_extinction_coefficient,
                    local_material, layer);
            if (first_depth >= FAR_LIMIT) { first_depth = travelled; }
            let resolved_cloud_extinction = max(vec3<f32>(0.0),
                density * spectral_extinction_coefficient);
            // Preserve E[exp(-tau)] for sub-pixel sparse ice instead of
            // exponentiating the coarsened mean tau. The distribution is
            // packed per optical owner and preserves mean extinction in the
            // thin limit; resolved camera/DSM density remains authoritative.
            let cloud_extinction = cloud_camera_footprint_extinction(
                sun_optics,
                resolved_cloud_extinction,
                resolved_cloud_extinction * step_length,
                step_length);
            let segment_tau = cloud_extinction * step_length;
            let segment_t = exp(-segment_tau);
            let absorbed = vec3<f32>(1.0) - segment_t;
            let primary_owner = cloud_material_owner(local_material.primary_owner);
            let secondary_amount = select(
                0.0,
                1.0 - saturate(local_material.primary_fraction),
                local_material.secondary_owner > 0.5);
            let secondary_owner = cloud_material_owner(
                local_material.secondary_owner);
            // A resident brick is a storage/qualification fact, not proof that
            // diffusion is a valid angular closure.  Use the receiver's exact
            // finite-support upper/lower paths to measure local reduced
            // transport depth before admitting P1.  Thin forward-scattering
            // ice therefore keeps its resolved phase/blue-sky convolution;
            // deep liquid and ice volumes transition continuously to P1.
            let local_diffusion_validity = cloud_p1_diffusion_validity(
                sun_optics,
                diffuse_optical_depth.upper_rgb +
                    diffuse_optical_depth.lower_rgb);
            var primary_volume_confidence = 0.0;
            if (local_material.atlas_match > 0.5) {
                primary_volume_confidence = cloud_lv_owner_sample_confidence(
                    point, primary_owner);
            }
            var secondary_volume_confidence = 1.0;
            if (secondary_amount > 0.0001) {
                secondary_volume_confidence = cloud_lv_owner_sample_confidence(
                    point, secondary_owner);
            }
            let light_volume_confidence = min(
                primary_volume_confidence, secondary_volume_confidence) *
                local_diffusion_validity;
            var resolved_light_volume_confidence = light_volume_confidence;
            // One continuous cumulative RGB atlas owns all same- and
            // inter-layer cloud extinction. Resident P1 fields remain a
            // higher-order representation and are never multiplied here.
            let source_sun_transmittance =
                cloud_camera_source_transmittance(point, 0u);
            let source_moon_transmittance =
                cloud_camera_source_transmittance(point, 1u);
            let local_sun_irradiance =
                physical_source_irradiance_at(0u, point);
            let local_moon_irradiance =
                physical_source_irradiance_at(1u, point);
            let primary_amount = 1.0 - secondary_amount;
            let source_sun_direct = cloud_bulk_direct_radiance(
                density, spectral_extinction_coefficient, sun_optics,
                local_sun_irradiance, source_sun_transmittance);
            let source_moon_direct = cloud_bulk_direct_radiance(
                density, spectral_extinction_coefficient, moon_optics,
                local_moon_irradiance, source_moon_transmittance);
            var analytic_diffuse_radiance = vec3<f32>(0.0);
            let light_volume_direct_sun = source_sun_direct;
            var light_volume_p1 = vec3<f32>(0.0);
            if (light_volume_confidence > 0.0001) {
                let scalar_mass_extinction = dot(
                    sun_optics.mass_extinction,
                    vec3<f32>(0.2126, 0.7152, 0.0722));
                let sigma_t = density * extinction_coefficient *
                    sun_optics.mass_extinction / max(1e-8, scalar_mass_extinction);
                let sigma_s = sigma_t * sun_optics.single_scattering_albedo;
                let sigma_tr = max(vec3<f32>(1e-6), sigma_t - sigma_s +
                    sigma_s * (vec3<f32>(1.0) - sun_optics.asymmetry));
                let diffusion = 1.0 / (3.0 * sigma_tr);
                var p1_incident =
                    cloud_lv_sample_owner_scattering_radiance(
                        point, -direction, primary_owner, diffusion) * primary_amount;
                if (secondary_amount > 0.0001) {
                    p1_incident += cloud_lv_sample_owner_scattering_radiance(
                        point, -direction, secondary_owner, diffusion) * secondary_amount;
                }
                light_volume_p1 = cloud_propagated_diffuse_scattering_radiance(
                    sun_optics, p1_incident);
            }
            if (!finite_rgb(light_volume_p1) ||
                any(light_volume_p1 < vec3<f32>(0.0))) {
                light_volume_p1 = vec3<f32>(0.0);
                resolved_light_volume_confidence = 0.0;
            }
            var exterior_diffuse_reference = vec3<f32>(0.0);
            var source_higher_order_reference = vec3<f32>(0.0);
            let lighting_debug_view = i32(round(p[22].y));
            let needs_exterior_diffuse_reference = lighting_debug_view == 10;
            let needs_source_higher_order_reference =
                lighting_debug_view == 13;
            var analytic_reference_evaluated = false;
            let strict_radiometric_agreement = p[38].w > 0.5;
            if (strict_radiometric_agreement ||
                resolved_light_volume_confidence < 0.9999 ||
                needs_exterior_diffuse_reference ||
                needs_source_higher_order_reference) {
                analytic_reference_evaluated = true;
                if (!directional_sky_cache_valid) {
                    directional_sky_cache = cloud_directional_sky_band_cache(
                        layer, direction);
                    directional_sky_cache_valid = true;
                }
                let atmosphere_point = renderer_to_atmosphere_world(point);
                let physical_altitude_km = max(
                    0.0,
                    length(atmosphere_point) -
                        physical_atmosphere.radii_scales.x,
                );
                let directional_atmosphere_phase_integral =
                    cloud_sample_directional_sky_band_cache(
                        directional_sky_cache,
                        physical_altitude_km,
                        sun_optics.asymmetry);
                let incident_sky = physical_diffuse_irradiance_at(point) / PI;
                let lower_atmosphere =
                    physical_lower_atmosphere_irradiance_at(point) / PI;
                let ground = physical_ground_irradiance_at(point) / PI;
                let sun_local_tau =
                    cloud_local_directional_source_optical_depth(
                        point, density, spectral_extinction_coefficient,
                        local_material, sun_optics, diffuse_optical_depth,
                        sun_direction);
                let moon_local_tau =
                    cloud_local_directional_source_optical_depth(
                        point, density, spectral_extinction_coefficient,
                        local_material, moon_optics, diffuse_optical_depth,
                        moon_direction);
                let sun_multi = cloud_optical_multiple_scattering(
                    sun_optics, source_sun_transmittance,
                    sun_local_tau, sun_cosine);
                let moon_multi = cloud_optical_multiple_scattering(
                    moon_optics, source_moon_transmittance,
                    moon_local_tau, moon_cosine);
                let source_higher_order =
                    local_sun_irradiance * sun_multi +
                    local_moon_irradiance * moon_multi;
                source_higher_order_reference =
                    cloud_finite_nonnegative_radiance(
                        source_higher_order, vec3<f32>(0.0));
                let sky_tau = diffuse_optical_depth.upper_rgb;
                let ground_tau = diffuse_optical_depth.lower_rgb;
                let multiple = cloud_fallback_diffuse_radiance(
                    sun_optics,
                    directional_atmosphere_phase_integral,
                    incident_sky,
                    lower_atmosphere,
                    ground,
                    sky_tau,
                    ground_tau);
                exterior_diffuse_reference =
                    cloud_finite_nonnegative_radiance(
                        multiple, vec3<f32>(0.0));
                analytic_diffuse_radiance =
                    cloud_finite_nonnegative_radiance(
                        source_higher_order + exterior_diffuse_reference,
                        cloud_finite_nonnegative_radiance(
                            source_higher_order, vec3<f32>(0.0)));
            }
            var higher_order_blend_confidence =
                resolved_light_volume_confidence;
            if (analytic_reference_evaluated) {
                higher_order_blend_confidence *=
                    cloud_higher_order_agreement_weight(
                        analytic_diffuse_radiance, light_volume_p1);
            }
            let direct_radiance = cloud_finite_nonnegative_radiance(
                source_sun_direct + source_moon_direct, vec3<f32>(0.0));
            var sample_radiance = cloud_finite_nonnegative_radiance(
                direct_radiance + mix(
                    analytic_diffuse_radiance,
                    light_volume_p1,
                    higher_order_blend_confidence),
                direct_radiance);
            let direct_sun_radiance = light_volume_direct_sun;
            sample_radiance = cloud_lighting_debug_source(
                sample_radiance,
                direct_sun_radiance,
                exterior_diffuse_reference,
                light_volume_p1,
                source_higher_order_reference,
            );
            // Air and condensate are one participating-medium event here.
            // sample_radiance is the cloud source radiance per extinction
            // event, so sigma_cloud * L_source is its source coefficient.
            let cloud_source_coefficient = cloud_extinction * max(
                vec3<f32>(0.0), sample_radiance);
            let combined_source_coefficient = max(
                vec3<f32>(0.0),
                air.source_radiance_coefficient_rgb_per_km +
                    cloud_source_coefficient);
            let combined_segment = integrate_camera_transport_coefficients(
                max(vec3<f32>(0.0),
                    air.extinction_rgb_per_km + cloud_extinction),
                combined_source_coefficient,
                step_length);
            let clear_segment = integrate_camera_transport_coefficients(
                air.extinction_rgb_per_km,
                air.source_radiance_coefficient_rgb_per_km,
                step_length);
            let clear_air_contribution =
                clear_transport.transmittance * clear_segment.radiance;
            let cloud_midpoint_transmittance =
                cloud_transmittance * sqrt(segment_t);
            air_proxy_weight += clear_air_contribution;
            cloud_weighted_air_proxy +=
                cloud_midpoint_transmittance * clear_air_contribution;
            let local_cloud_source = cloud_source_share_of_combined_segment(
                combined_segment, cloud_source_coefficient,
                combined_source_coefficient);
            cloud_source_radiance +=
                combined_transport.transmittance * local_cloud_source;
            // Reconstruction depth follows the optical contribution actually
            // visible at the camera, including segment length and accumulated
            // transmittance. Density-only weighting biased thick, distant
            // interiors and destabilized reprojection at silhouettes.
            let depth_contribution = photopic(
                combined_transport.transmittance * absorbed);
            combined_transport = compose_camera_transport(
                combined_transport, combined_segment);
            clear_transport = compose_camera_transport(
                clear_transport, clear_segment);
            cloud_transmittance *= segment_t;
            weighted_depth += travelled * depth_contribution;
            weight += depth_contribution;
        } else {
            // This is a density miss inside a conservative occupied owner, not
            // a macro-gap. The fine atmosphere proxy is sufficient for K and
            // avoids an adaptive 2/5-node solve at every empty microstratum.
            let clear_gap = integrate_camera_transport_coefficients(
                air.extinction_rgb_per_km,
                air.source_radiance_coefficient_rgb_per_km,
                step_length);
            let clear_air_contribution =
                clear_transport.transmittance * clear_gap.radiance;
            air_proxy_weight += clear_air_contribution;
            cloud_weighted_air_proxy +=
                cloud_transmittance * clear_air_contribution;
            combined_transport = compose_camera_transport(
                combined_transport, clear_gap);
            clear_transport = compose_camera_transport(
                clear_transport, clear_gap);
        }
        }
    }
    if (integrated_far < far - 1e-6) {
        let clear_tail = cloud_background_atmosphere_segment(
            origin, direction, integrated_far, far);
        let clear_air_contribution =
            clear_transport.transmittance * clear_tail.radiance;
        air_proxy_weight += clear_air_contribution;
        cloud_weighted_air_proxy +=
            cloud_transmittance * clear_air_contribution;
        combined_transport = compose_camera_transport(
            combined_transport, clear_tail);
        clear_transport = compose_camera_transport(
            clear_transport, clear_tail);
    }
    let exact_shared_air = cloud_background_atmosphere_segment(
        origin, direction, 0.0, far);
    let relative_transport = cloud_relative_transport_from_air_moment(
        cloud_source_radiance, exact_shared_air,
        cloud_weighted_air_proxy, air_proxy_weight,
        cloud_transmittance);
    let transmittance_y = clamp(
        photopic(cloud_transmittance), 0.0, 1.0);
    result.transport = relative_transport;
    result.first_depth = first_depth;
    result.mean_depth = select(
        FAR_LIMIT, weighted_depth / weight, weight > 0.0);
    result.optical_depth_y = -log(max(0.0001, transmittance_y));
    result.opacity_y = 1.0 - transmittance_y;
    result.velocity = layer.motion.xy;
    result.evaluated_steps = actual_steps;
    return result;
}

struct HydrometeorTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
    first_depth: f32,
    mean_depth: f32,
    optical_depth: f32,
    velocity: vec2<f32>,
    parent_layer: f32,
    evaluated_steps: f32,
};

fn hydrometeor_invalid_interval() -> vec2<f32> {
    return vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
}

// Intersect one axis of a conservative field AABB. A stationary ray axis is
// valid only when the origin already lies inside that slab.
fn hydrometeor_axis_interval(
    origin: f32, direction: f32, lower: f32, upper: f32,
) -> vec2<f32> {
    if (abs(direction) < 1e-6) {
        return select(
            hydrometeor_invalid_interval(),
            vec2<f32>(-FAR_LIMIT, FAR_LIMIT),
            origin >= lower && origin <= upper);
    }
    let first = (lower - origin) / direction;
    let second = (upper - origin) / direction;
    return vec2<f32>(min(first, second), max(first, second));
}

// Curved-Earth altitude interval for a finite hydrometeor field. This handles
// all three observer cases explicitly: below, inside, or above the shell.
fn hydrometeor_altitude_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    bottom_altitude_km: f32, top_altitude_km: f32,
) -> vec2<f32> {
    let inner_radius = PLANET_RADIUS + max(-0.5, bottom_altitude_km);
    let outer_radius = PLANET_RADIUS + max(
        bottom_altitude_km + 0.001, top_altitude_km);
    let inner = sphere_hits(origin, direction, inner_radius);
    let outer = sphere_hits(origin, direction, outer_radius);
    if (outer.y <= 0.0) { return hydrometeor_invalid_interval(); }
    let radius = length(origin);
    if (radius < inner_radius) {
        return select(
            hydrometeor_invalid_interval(),
            vec2<f32>(inner.y, outer.y),
            inner.y >= 0.0 && outer.y > inner.y);
    }
    if (radius <= outer_radius) {
        var exit_distance = outer.y;
        if (inner.x > 0.0) { exit_distance = min(exit_distance, inner.x); }
        return select(
            hydrometeor_invalid_interval(),
            vec2<f32>(0.0, exit_distance),
            exit_distance > 0.0);
    }
    if (outer.x <= 0.0) { return hydrometeor_invalid_interval(); }
    var exit_distance = outer.y;
    if (inner.x > outer.x) { exit_distance = min(exit_distance, inner.x); }
    return select(
        hydrometeor_invalid_interval(),
        vec2<f32>(outer.x, exit_distance),
        exit_distance > outer.x);
}

// Each record is a vertically varying, wind-slanted ellipse with a harmonic
// natural boundary. The AABB encloses the complete swept ellipse from source
// to bottom, including maximum radius scaling, boundary relief, transition,
// and the bounded turbulent displacement used by the field evaluator. It is
// intersected with the exact altitude shell, so empty kilometres never enter
// transport and a shallow 10 m bank cannot disappear between 2 km samples.
fn hydrometeor_record_interval(
    origin: vec3<f32>, direction: vec3<f32>, record: HydrometeorRecord,
) -> vec2<f32> {
    if (record.identity.x < 0.5) { return hydrometeor_invalid_interval(); }
    let top_km = record.source_geometry.y;
    let bottom_km = record.source_geometry.z;
    let altitude_interval = hydrometeor_altitude_interval(
        origin, direction, bottom_km, top_km);
    if (altitude_interval.y <= altitude_interval.x) {
        return hydrometeor_invalid_interval();
    }

    let render_class = u32(record.identity.w + 0.5);
    let terminal_velocity = max(0.05, record.kinematics.z);
    let fall_time_seconds = select(
        max(0.0, top_km - bottom_km) * 1000.0 / terminal_velocity,
        0.0,
        render_class == 2u);
    let bottom_drift_km = record.kinematics.xy * fall_time_seconds / 1000.0;
    let top_center = record.source_center_extent.xy;
    let bottom_center = top_center + bottom_drift_km;
    let maximum_radius_scale = max(
        1.0, max(0.2, record.morphology.x));
    let boundary_scale = max(
        0.7,
        1.0 + abs(record.source_boundary.x) +
            abs(record.source_boundary.y));
    let support_scale = maximum_radius_scale * boundary_scale *
        (1.0 + max(0.01, record.source_geometry.w));
    let major = max(0.001, record.source_center_extent.z * support_scale);
    let minor = max(0.001, record.source_center_extent.w * support_scale);
    let sine = sin(record.source_geometry.x);
    let cosine = cos(record.source_geometry.x);
    let turbulent_bound = abs(record.kinematics.w) * 0.0008;
    let east_extent = sqrt(
        major * major * sine * sine + minor * minor * cosine * cosine) +
        turbulent_bound;
    let north_extent = sqrt(
        major * major * cosine * cosine + minor * minor * sine * sine) +
        turbulent_bound;
    let horizontal_minimum = min(top_center, bottom_center) -
        vec2<f32>(east_extent, north_extent);
    let horizontal_maximum = max(top_center, bottom_center) +
        vec2<f32>(east_extent, north_extent);
    let east_interval = hydrometeor_axis_interval(
        origin.x, direction.x, horizontal_minimum.x, horizontal_maximum.x);
    let north_interval = hydrometeor_axis_interval(
        origin.z, direction.z, horizontal_minimum.y, horizontal_maximum.y);
    let near = max(0.0, max(
        altitude_interval.x, max(east_interval.x, north_interval.x)));
    let far = min(FAR_LIMIT, min(
        altitude_interval.y, min(east_interval.y, north_interval.y)));
    return select(
        hydrometeor_invalid_interval(),
        vec2<f32>(near, far),
        far > near);
}

// Samples are allocated in physical path space. Projecting vertical depth and
// horizontal diameter onto the ray supplies at least eight strata across the
// narrowest crossed dimension, while a 250 m ceiling bounds work in broad,
// smooth curtains. The exact record interval separately guarantees that a
// shallow or distant field is visited at all.
fn hydrometeor_record_step_km(
    origin: vec3<f32>, direction: vec3<f32>, record: HydrometeorRecord,
    interval: vec2<f32>,
) -> f32 {
    let midpoint = origin + direction * mix(interval.x, interval.y, 0.5);
    let local_up = normalize(midpoint);
    let vertical_rate = max(0.02, abs(dot(direction, local_up)));
    let horizontal_rate = max(0.02, length(direction.xz));
    let depth = max(
        0.001, record.source_geometry.y - record.source_geometry.z);
    let radius_scale = max(1.0, max(0.2, record.morphology.x));
    let boundary_scale = max(
        0.7,
        1.0 + abs(record.source_boundary.x) +
            abs(record.source_boundary.y));
    let minimum_radius = max(
        0.001,
        min(record.source_center_extent.z, record.source_center_extent.w) *
            radius_scale * boundary_scale);
    let vertical_path = depth / vertical_rate;
    let horizontal_path = 2.0 * minimum_radius / horizontal_rate;
    let crossed_dimension = min(
        interval.y - interval.x,
        min(vertical_path, horizontal_path));
    // Every hydrometeor record now contains smaller physical cells or trails
    // inside its conservative support. Resolve those structures rather than
    // sampling only the enclosing ellipse; virga shafts are the narrowest.
    let render_class = u32(record.identity.w + 0.5);
    let strata = select(24.0, 32.0, render_class == 0u);
    return clamp(crossed_dimension / strata, 0.001, 0.25);
}

fn hydrometeor_spherical_gaussian(
    cosine: f32, concentration: f32,
) -> f32 {
    let bounded_concentration = clamp(concentration, 8.0, 28000.0);
    let normalization = bounded_concentration /
        (2.0 * PI * max(1e-8, 1.0 - exp(-2.0 * bounded_concentration)));
    return normalization * exp(
        bounded_concentration * (clamp(cosine, -1.0, 1.0) - 1.0));
}

// Both lobes integrate to one over 4pi. Species glint is therefore an energy
// redistribution toward the real Sun/Moon direction, never an additive spark
// or a screen-space halo.
fn hydrometeor_source_phase(
    cosine: f32, asymmetry: f32,
    glint_energy_fraction: f32, glint_concentration: f32,
) -> f32 {
    let glint_weight = saturate(glint_energy_fraction);
    return mix(
        hg(cosine, asymmetry),
        hydrometeor_spherical_gaussian(cosine, glint_concentration),
        glint_weight);
}

fn hydrometeor_multiple_scattering(
    albedo: vec3<f32>, asymmetry: f32, cosine: f32,
    optical_depth: f32, response: f32,
) -> vec3<f32> {
    // Same passive octave constraint as cloud transport. A species response
    // changes how quickly higher orders survive, but scattering never exceeds
    // the relaxed extinction coefficient of the substituted medium.
    let extinction_scale = 0.56;
    let scattering_scale = min(
        extinction_scale,
        0.46 * clamp(response, 0.0, 1.25));
    var result = vec3<f32>(0.0);
    var order_scattering = scattering_scale;
    var order_extinction = extinction_scale;
    for (var order = 2u; order <= 5u; order += 1u) {
        let order_g = sign(asymmetry) * pow(abs(asymmetry), f32(order));
        result += pow(albedo, vec3<f32>(f32(order))) *
            hg(cosine, order_g) * order_scattering *
            exp(-max(0.0, optical_depth) * order_extinction);
        order_scattering *= scattering_scale;
        order_extinction *= extinction_scale;
    }
    return result;
}

/*
 * Legacy independently composited hydrometeor transport is retained here as
 * source documentation only. Keeping its 96-entry function-private interval
 * tables in the compiled production module makes Metal lower addressable
 * private memory even though no production entry point calls it. The ordered
 * transport below supersedes this path; a future Lab-only module can restore
 * the comparison entry without contaminating the shipping shader module.
 */
/*
fn hydrometeor_diffuse_transport(
    albedo: vec3<f32>, optical_depth: f32, response: f32,
) -> vec3<f32> {
    let extinction_scale = 0.56;
    let scattering_scale = min(
        extinction_scale,
        0.46 * clamp(response, 0.0, 1.25));
    var result = albedo * exp(-max(0.0, optical_depth));
    var order_scattering = scattering_scale;
    var order_extinction = extinction_scale;
    for (var order = 2u; order <= 5u; order += 1u) {
        result += pow(albedo, vec3<f32>(f32(order))) * order_scattering *
            exp(-max(0.0, optical_depth) * order_extinction);
        order_scattering *= scattering_scale;
        order_extinction *= extinction_scale;
    }
    return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn march_hydrometeors(
    origin: vec3<f32>,
    direction: vec3<f32>,
    sun_direction: vec3<f32>,
    moon_direction: vec3<f32>,
    jitter: f32,
) -> HydrometeorTransport {
    var result: HydrometeorTransport;
    result.radiance = vec3<f32>(0.0);
    result.transmittance = vec3<f32>(1.0);
    result.first_depth = FAR_LIMIT;
    result.mean_depth = FAR_LIMIT;
    result.optical_depth = 0.0;
    result.velocity = vec2<f32>(0.0);
    result.parent_layer = -1.0;
    result.evaluated_steps = 0.0;
    if (hydrometeor_fields.header.x < 0.5) { return result; }

    var intervals: array<vec2<f32>, 96>;
    var step_targets_km: array<f32, 96>;
    let record_count = min(
        u32(hydrometeor_fields.header.x + 0.5),
        HYDROMETEOR_MAX_FIELDS);
    var global_near = FAR_LIMIT;
    var global_far = -FAR_LIMIT;
    for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
        if (index >= record_count) { break; }
        let record = hydrometeor_fields.records[index];
        let interval = hydrometeor_record_interval(origin, direction, record);
        intervals[index] = interval;
        if (interval.y > interval.x) {
            step_targets_km[index] = hydrometeor_record_step_km(
                origin, direction, record, interval);
            global_near = min(global_near, interval.x);
            global_far = max(global_far, interval.y);
        } else {
            // This value is never consumed for an inactive interval, but keep
            // every local array element initialized for strict WGSL validators.
            step_targets_km[index] = 0.25;
        }
    }
    if (global_far <= global_near) { return result; }

    var weighted_depth = 0.0;
    var weight = 0.0;
    var weighted_velocity = vec2<f32>(0.0);
    var dominant_parent_contribution = 0.0;
    var travelled = global_near;
    for (var step = 0; step < 192; step++) {
        if (travelled >= global_far - 1e-5 ||
            maximum_rgb(result.transmittance) < 0.01) {
            break;
        }
        var has_active_field = false;
        var next_event = global_far;
        var target_step_km = 0.25;
        for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
            if (index >= record_count) { break; }
            let interval = intervals[index];
            if (interval.y <= interval.x) { continue; }
            if (travelled >= interval.x - 1e-5 &&
                travelled < interval.y - 1e-5) {
                has_active_field = true;
                next_event = min(next_event, interval.y);
                target_step_km = min(target_step_km, step_targets_km[index]);
            } else if (interval.x > travelled + 1e-5) {
                next_event = min(next_event, interval.x);
            }
        }
        if (!has_active_field) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let segment_end = min(
            global_far,
            min(next_event, travelled + target_step_km));
        let step_length = segment_end - travelled;
        if (step_length <= 1e-6) {
            travelled += 1e-5;
            continue;
        }
        let stratum_jitter = fract(
            jitter + f32(step) * 0.61803398875 + p[14].w * 0.41421356237);
        let sample_distance = mix(
            travelled + step_length * 0.12,
            segment_end - step_length * 0.12,
            stratum_jitter);
        let point = origin + direction * sample_distance;
        let field_position = vec3<f32>(
            point.x, length(point) - PLANET_RADIUS, point.z);
        var meteor = hydrometeor_empty_sample();
        var optical_weight = 0.0;
        var direct_response_sum = 0.0;
        var diffuse_response_sum = 0.0;
        var glint_energy_sum = 0.0;
        var glint_concentration_sum = 0.0;
        var multiple_response_sum = 0.0;
        var velocity_sum = vec2<f32>(0.0);
        var local_parent_layer = -1.0;
        var local_parent_weight = 0.0;
        for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
            if (index >= record_count) { break; }
            let interval = intervals[index];
            if (sample_distance < interval.x || sample_distance > interval.y) {
                continue;
            }
            let record = hydrometeor_fields.records[index];
            let sample = hydrometeor_sample_record(
                record, field_position, sample_distance, p[0].z);
            let scattering = sample.extinction_rgb_km *
                sample.scattering_albedo_rgb;
            let sample_weight = dot(
                scattering, vec3<f32>(0.2126, 0.7152, 0.0722));
            if (sample_weight <= 1e-8) { continue; }
            meteor = hydrometeor_accumulate_sample(meteor, sample);
            optical_weight += sample_weight;
            direct_response_sum += sample_weight * sample.direct_irradiance_weight;
            diffuse_response_sum += sample_weight * sample.diffuse_irradiance_weight;
            glint_energy_sum += sample_weight * sample.source_glint_strength;
            let glint_sigma = clamp(
                record.particle_shape.z * 0.28 +
                    record.particle_shape.w * 0.12,
                0.006,
                0.35);
            glint_concentration_sum += sample_weight /
                max(1e-6, glint_sigma * glint_sigma);
            multiple_response_sum += sample_weight *
                sample.multiple_scattering_boost;
            velocity_sum += sample_weight * record.kinematics.xy;
            if (sample_weight > local_parent_weight) {
                local_parent_weight = sample_weight;
                local_parent_layer = record.energy_and_importance.w;
            }
        }
        travelled = segment_end;
        result.evaluated_steps += 1.0;
        if (optical_weight <= 1e-8) { continue; }
        meteor.direct_irradiance_weight = direct_response_sum / optical_weight;
        meteor.diffuse_irradiance_weight = diffuse_response_sum / optical_weight;
        meteor.source_glint_strength = glint_energy_sum / optical_weight;
        meteor.multiple_scattering_boost = multiple_response_sum / optical_weight;
        let glint_concentration = glint_concentration_sum / optical_weight;
        let local_velocity = velocity_sum / optical_weight;
        let extinction = max(vec3<f32>(0.0), meteor.extinction_rgb_km);
        let scalar_extinction = dot(
            extinction, vec3<f32>(0.2126, 0.7152, 0.0722));
        if (scalar_extinction <= 1e-6) { continue; }
        if (result.first_depth >= FAR_LIMIT) {
            result.first_depth = sample_distance;
        }
        let segment_tau = extinction * step_length;
        let segment_t = exp(-segment_tau);
        let scattered_fraction = vec3<f32>(1.0) - segment_t;
        let sun_cosine = dot(direction, sun_direction);
        let moon_cosine = dot(direction, moon_direction);
        let sun_phase = hydrometeor_source_phase(
            sun_cosine, meteor.asymmetry,
            meteor.source_glint_strength, glint_concentration);
        let moon_phase = hydrometeor_source_phase(
            moon_cosine, meteor.asymmetry,
            meteor.source_glint_strength, glint_concentration);
        let albedo = clamp(
            meteor.scattering_albedo_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0));
        let direct_response = clamp(
            meteor.direct_irradiance_weight, 0.0, 1.0);
        let diffuse_response = clamp(
            meteor.diffuse_irradiance_weight, 0.0, 1.0);
        let sun_optics = albedo * sun_phase + hydrometeor_multiple_scattering(
            albedo, meteor.asymmetry, sun_cosine, photopic(segment_tau),
            meteor.multiple_scattering_boost);
        let moon_optics = albedo * moon_phase + hydrometeor_multiple_scattering(
            albedo, meteor.asymmetry, moon_cosine, photopic(segment_tau),
            meteor.multiple_scattering_boost);
        let atmosphere_point = renderer_to_atmosphere_world(point);
        let direct = direct_response * (
            physical_source_irradiance_at(0u, point) *
                coupling_cloud_source_transmittance_at(
                    atmosphere_point, 0u) * sun_optics +
            physical_source_irradiance_at(1u, point) *
                coupling_cloud_source_transmittance_at(
                    atmosphere_point, 1u) * moon_optics);
        let hemispheric = (
            physical_diffuse_irradiance_at(point) +
            physical_ground_irradiance_at(point)) / PI;
        let diffuse = hemispheric * diffuse_response *
            hydrometeor_diffuse_transport(
                albedo, photopic(segment_tau),
                meteor.multiple_scattering_boost);
        let source = direct + diffuse;
        result.radiance += result.transmittance * source * scattered_fraction;
        let contribution = photopic(
            result.transmittance * scattered_fraction);
        weighted_depth += sample_distance * contribution;
        weighted_velocity += local_velocity * contribution;
        if (contribution > dominant_parent_contribution) {
            dominant_parent_contribution = contribution;
            result.parent_layer = local_parent_layer;
        }
        weight += contribution;
        result.transmittance *= segment_t;
    }
    if (weight > 0.0) {
        result.mean_depth = weighted_depth / weight;
        result.velocity = weighted_velocity / weight;
    }
    result.optical_depth = -log(max(
        0.0001,
        clamp(photopic(result.transmittance), 0.0, 1.0),
    ));
    return result;
}

*/
fn finite_atmosphere_to_sample(
    renderer_point: vec3<f32>,
) -> AtmosphereSegmentTransport {
    let start_world = physical_atmosphere.observer_world.xyz;
    let end_world = renderer_to_atmosphere_world(renderer_point);
    let delta = end_world - start_world;
    let distance = length(delta);
    var result: AtmosphereSegmentTransport;
    result.radiance = vec3<f32>(0.0);
    result.transmittance = vec3<f32>(1.0);
    if (distance <= 1e-6) { return result; }
    let direction = delta / distance;
    let count = 16u;
    let step_length = distance / f32(count);
    let clear_diffuse_transfer = CouplingPassiveCloudTransfer(
        vec3<f32>(1.0), vec3<f32>(0.0));
    var throughput = vec3<f32>(1.0);
    for (var index = 0u; index < count; index += 1u) {
        let point = start_world + direction *
            ((f32(index) + 0.5) * step_length);
        let radius = length(point);
        if (radius < physical_atmosphere.radii_scales.x ||
            radius > physical_atmosphere.radii_scales.y) { continue; }
        let medium = atmo_sample_medium(point);
        var direct_sources: array<CouplingAerialDirectSource, 2>;
        var diffuse_incident = vec3<f32>(0.0);
        for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
            source_index += 1u) {
            let source = atmo_source_radiance_radius(source_index);
            let source_irradiance = select(
                vec3<f32>(0.0),
                source.rgb * atmo_source_solid_angle(source.w),
                atmo_source_enabled(source_index));
            let source_direction = atmo_source_direction(source_index);
            let atmosphere_transport = atmo_transmittance_to_space(
                point, source_direction);
            let cosine = dot(direction, source_direction);
            let phase_scattering = medium.rayleigh * atmo_rayleigh_phase(cosine) +
                medium.mie * atmo_cornette_shanks_phase(cosine);
            let effective_phase = atmo_safe_div(
                phase_scattering, max(vec3<f32>(1e-8), medium.scattering));
            let cloud_transfer = CouplingPassiveCloudTransfer(
                coupling_cloud_source_aerial_transmittance_at(
                    point, source_index),
                vec3<f32>(0.0));
            direct_sources[source_index] = CouplingAerialDirectSource(
                source_irradiance * atmosphere_transport,
                effective_phase,
                cloud_transfer);
            diffuse_incident += source_irradiance *
                atmo_multiple_scattering(point, source_direction);
        }
        let coupled_source = coupling_aerial_source(
            CouplingAerialMedium(medium.extinction, medium.scattering),
            diffuse_incident,
            clear_diffuse_transfer,
            direct_sources[0u],
            direct_sources[1u]);
        let integrated = coupling_integrate_aerial_step(
            coupled_source, step_length);
        result.radiance += throughput * integrated.radiance_rgb;
        throughput *= integrated.transmittance_rgb;
    }
    result.radiance = max(vec3<f32>(0.0), result.radiance);
    result.transmittance = clamp(
        throughput, vec3<f32>(0.0), vec3<f32>(1.0));
    return result;
}

const UPPER_ATMOSPHERE_FAR_LIMIT: f32 = 1300.0;

struct UpperAtmosphereTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
    first_depth: f32,
    mean_depth: f32,
    evaluated_steps: f32,
};

fn empty_upper_atmosphere_transport() -> UpperAtmosphereTransport {
    var result: UpperAtmosphereTransport;
    result.radiance = vec3<f32>(0.0);
    result.transmittance = vec3<f32>(1.0);
    result.first_depth = UPPER_ATMOSPHERE_FAR_LIMIT;
    result.mean_depth = UPPER_ATMOSPHERE_FAR_LIMIT;
    result.evaluated_steps = 0.0;
    return result;
}

fn upper_invalid_interval() -> vec2<f32> {
    return vec2<f32>(
        UPPER_ATMOSPHERE_FAR_LIMIT, -UPPER_ATMOSPHERE_FAR_LIMIT);
}

fn upper_axis_interval(
    origin: f32, direction: f32, lower: f32, upper: f32,
) -> vec2<f32> {
    if (abs(direction) < 1e-7) {
        return select(
            upper_invalid_interval(),
            vec2<f32>(-UPPER_ATMOSPHERE_FAR_LIMIT,
                UPPER_ATMOSPHERE_FAR_LIMIT),
            origin >= lower && origin <= upper);
    }
    let first = (lower - origin) / direction;
    let second = (upper - origin) / direction;
    return vec2<f32>(min(first, second), max(first, second));
}

fn upper_record_horizontal_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    record: CloudMorphologyModifierRecord,
) -> vec2<f32> {
    let offset = origin.xz - record.center_support.xz;
    let axis_u = normalize(record.axis_u.xz + vec2<f32>(1e-8));
    let axis_w = normalize(record.axis_w.xz + vec2<f32>(1e-8));
    let u_interval = upper_axis_interval(
        dot(offset, axis_u), dot(direction.xz, axis_u),
        -record.axis_u.w * 1.04, record.axis_u.w * 1.04);
    let w_interval = upper_axis_interval(
        dot(offset, axis_w), dot(direction.xz, axis_w),
        -record.axis_w.w * 1.04, record.axis_w.w * 1.04);
    let near = max(0.0, max(u_interval.x, w_interval.x));
    let far = min(u_interval.y, w_interval.y);
    return select(upper_invalid_interval(), vec2<f32>(near, far), far > near);
}

fn upper_record_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    record: CloudMorphologyModifierRecord,
) -> vec2<f32> {
    // ADD_UPPER_WAVE_SHEET stores thickness, amplitude and wavelength in
    // metres. Intersect the actual curved altitude support rather than a flat
    // screen band; Earth occlusion then follows from the same planet sphere.
    let half_thickness_km = max(0.025, record.shape0.x * 0.0005);
    let amplitude_km = max(0.0, record.shape0.y * 0.001);
    let vertical_reach = max(record.axis_v.w,
        amplitude_km + half_thickness_km) * 1.04;
    let altitude_interval = hydrometeor_altitude_interval(
        origin, direction,
        record.center_support.y - vertical_reach,
        record.center_support.y + vertical_reach);
    let horizontal_interval = upper_record_horizontal_interval(
        origin, direction, record);
    if (altitude_interval.y <= altitude_interval.x ||
        horizontal_interval.y <= horizontal_interval.x) {
        return upper_invalid_interval();
    }
    var planet_limit = UPPER_ATMOSPHERE_FAR_LIMIT;
    let planet_hit = sphere_hits(origin, direction, PLANET_RADIUS + 0.0001);
    if (planet_hit.x > 1e-4) { planet_limit = planet_hit.x; }
    let near = max(0.0, max(
        altitude_interval.x, horizontal_interval.x));
    let far = min(UPPER_ATMOSPHERE_FAR_LIMIT, min(
        planet_limit, min(altitude_interval.y, horizontal_interval.y)));
    return select(upper_invalid_interval(), vec2<f32>(near, far), far > near);
}

fn upper_record_step_km(
    origin: vec3<f32>, direction: vec3<f32>,
    record: CloudMorphologyModifierRecord, interval: vec2<f32>,
) -> f32 {
    let midpoint = origin + direction * mix(interval.x, interval.y, 0.5);
    let local_up = normalize(midpoint);
    let vertical_rate = max(0.008, abs(dot(direction, local_up)));
    let horizontal_rate = max(0.008, length(direction.xz));
    let thickness_km = max(0.05, record.shape0.x * 0.001);
    let wavelength_km = max(0.02, record.shape0.z * 0.001);
    let physical_target = clamp(min(
        thickness_km / (vertical_rate * 5.0),
        wavelength_km / (horizontal_rate * 12.0)), 0.025, 0.8);
    // Ninety-six strata per finite patch guarantee completion even for a
    // grazing 500 km path; blue-noise jitter removes coherent shell bands.
    return max(physical_target, (interval.y - interval.x) / 96.0);
}

fn upper_rayleigh_phase(cosine: f32) -> f32 {
    return 3.0 * (1.0 + cosine * cosine) / (16.0 * PI);
}

fn upper_nacreous_spectral_response(cosine: f32) -> vec3<f32> {
    // A narrow distribution of approximately 10 um spherical ice particles
    // produces coherent Mie/diffraction colour near the source. This compact
    // spectral approximation varies optical path by display wavelength and
    // damps coherence away from the forward lobe; it never bakes world RGB.
    let theta = acos(clamp(cosine, -1.0, 1.0));
    let optical_path_um = 10.0 * (1.0 - cosine);
    let wavelengths_um = vec3<f32>(0.650, 0.550, 0.450);
    let interference = 0.5 + 0.5 * cos(
        vec3<f32>(2.0 * PI * optical_path_um) / wavelengths_um);
    let coherence = exp(-theta * theta / 0.24);
    return mix(vec3<f32>(1.0), vec3<f32>(0.86) + interference * 0.22,
        coherence * 0.58);
}

fn upper_material_extinction_km(profile: u32) -> vec3<f32> {
    if (profile == 1u) { return vec3<f32>(0.0040); }
    if (profile == 2u) { return vec3<f32>(0.0140); }
    if (profile == 3u) { return vec3<f32>(0.00022); }
    return vec3<f32>(0.0);
}

fn upper_material_source(
    profile: u32, point: vec3<f32>, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
) -> vec3<f32> {
    let sun_cosine = dot(direction, sun_direction);
    let moon_cosine = dot(direction, moon_direction);
    let atmosphere_point = renderer_to_atmosphere_world(point);
    let sun = physical_source_irradiance_at(0u, point) *
        coupling_cloud_source_transmittance_at(atmosphere_point, 0u);
    let moon = physical_source_irradiance_at(1u, point) *
        coupling_cloud_source_transmittance_at(atmosphere_point, 1u);
    let diffuse_irradiance = (
        physical_diffuse_irradiance_at(point) +
        physical_ground_irradiance_at(point)) / PI;
    if (profile == 1u) {
        let albedo = vec3<f32>(0.965, 0.985, 0.995);
        return albedo * (
            sun * hg(sun_cosine, 0.58) +
            moon * hg(moon_cosine, 0.58) +
            diffuse_irradiance * 0.24);
    }
    if (profile == 2u) {
        let albedo = vec3<f32>(0.995, 0.997, 0.999);
        let sun_spectral = upper_nacreous_spectral_response(sun_cosine);
        let moon_spectral = upper_nacreous_spectral_response(moon_cosine);
        return albedo * (
            sun * sun_spectral * hg(sun_cosine, 0.78) +
            moon * moon_spectral * hg(moon_cosine, 0.78) +
            diffuse_irradiance * 0.16);
    }
    if (profile == 3u) {
        // 60–100 nm mesospheric ice remains optically extremely thin. Its
        // visible spectrum is Rayleigh-like; multiple scattering is tiny and
        // therefore contributes only a restrained diffuse term.
        let spectral_scattering = vec3<f32>(0.42, 0.91, 1.65);
        return spectral_scattering * (
            sun * upper_rayleigh_phase(sun_cosine) +
            moon * upper_rayleigh_phase(moon_cosine) +
            diffuse_irradiance * 0.018);
    }
    return vec3<f32>(0.0);
}

/*
 * Unified finite-media event helpers remain beside their commented
 * experimental entry as source for the staged media split. Excluding this
 * unused call graph from shipping WGSL prevents whole-module Metal lowering
 * from compiling the 172-record event machinery for the cloud-only pass.
 */
/*
struct OrderedWeatherSample {
    extinction_rgb_per_km: vec3<f32>,
    source_coefficient_rgb_per_km: vec3<f32>,
    diagnostic_extinction_y_per_km: f32,
    velocity: vec2<f32>,
    metadata_weight: f32,
    layer_identifier: f32,
};

fn empty_ordered_weather_sample() -> OrderedWeatherSample {
    var result: OrderedWeatherSample;
    result.extinction_rgb_per_km = vec3<f32>(0.0);
    result.source_coefficient_rgb_per_km = vec3<f32>(0.0);
    result.diagnostic_extinction_y_per_km = 0.0;
    result.velocity = vec2<f32>(0.0);
    result.metadata_weight = 0.0;
    result.layer_identifier = -1.0;
    return result;
}

fn accumulate_ordered_weather_sample(
    accumulated: OrderedWeatherSample,
    added: OrderedWeatherSample,
) -> OrderedWeatherSample {
    if (!finite_rgb(added.extinction_rgb_per_km) ||
        !finite_rgb(added.source_coefficient_rgb_per_km) ||
        !finite_scalar(added.diagnostic_extinction_y_per_km) ||
        !finite_scalar(added.velocity.x) || !finite_scalar(added.velocity.y) ||
        !finite_scalar(added.metadata_weight) ||
        !finite_scalar(added.layer_identifier)) {
        return accumulated;
    }
    var result = accumulated;
    result.extinction_rgb_per_km += added.extinction_rgb_per_km;
    result.source_coefficient_rgb_per_km +=
        added.source_coefficient_rgb_per_km;
    result.diagnostic_extinction_y_per_km +=
        added.diagnostic_extinction_y_per_km;
    if (added.metadata_weight > accumulated.metadata_weight) {
        result.velocity = added.velocity;
        result.metadata_weight = added.metadata_weight;
        result.layer_identifier = added.layer_identifier;
    }
    return result;
}

fn sanitize_ordered_weather_sample(
    sample: OrderedWeatherSample,
) -> OrderedWeatherSample {
    if (!finite_rgb(sample.extinction_rgb_per_km) ||
        !finite_rgb(sample.source_coefficient_rgb_per_km) ||
        !finite_scalar(sample.diagnostic_extinction_y_per_km) ||
        !finite_scalar(sample.velocity.x) ||
        !finite_scalar(sample.velocity.y) ||
        !finite_scalar(sample.metadata_weight) ||
        !finite_scalar(sample.layer_identifier)) {
        return empty_ordered_weather_sample();
    }
    return sample;
}

fn ordered_atmosphere_source_sample(
    renderer_point: vec3<f32>, renderer_direction: vec3<f32>,
    include_cloud_visibility: bool,
) -> CouplingAerialSourceSample {
    let point = renderer_to_atmosphere_world(renderer_point);
    let view_direction_atmosphere = normalize(vec3<f32>(
        renderer_direction.x, renderer_direction.z, renderer_direction.y));
    let medium = atmo_sample_medium(point);
    let clear_diffuse_transfer = CouplingPassiveCloudTransfer(
        vec3<f32>(1.0), vec3<f32>(0.0));
    var direct_sources: array<CouplingAerialDirectSource, 2>;
    var diffuse_incident = vec3<f32>(0.0);
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        let source = atmo_source_radiance_radius(source_index);
        let source_irradiance = select(
            vec3<f32>(0.0),
            source.rgb * atmo_source_solid_angle(source.w),
            atmo_source_enabled(source_index));
        let source_direction = atmo_source_direction(source_index);
        let atmosphere_transport = atmo_transmittance_to_space(
            point, source_direction);
        let cosine = dot(view_direction_atmosphere, source_direction);
        let phase_scattering =
            medium.rayleigh * atmo_rayleigh_phase(cosine) +
            medium.mie * atmo_cornette_shanks_phase(cosine);
        let effective_phase = atmo_safe_div(
            phase_scattering, max(vec3<f32>(1e-8), medium.scattering));
        let cloud_transmittance = select(
            vec3<f32>(1.0),
            coupling_cloud_source_aerial_transmittance_at(
                point, source_index),
            vec3<bool>(include_cloud_visibility));
        let cloud_transfer = CouplingPassiveCloudTransfer(
            cloud_transmittance,
            vec3<f32>(0.0));
        direct_sources[source_index] = CouplingAerialDirectSource(
            source_irradiance * atmosphere_transport,
            effective_phase,
            cloud_transfer);
        diffuse_incident += source_irradiance *
            atmo_multiple_scattering(point, source_direction);
    }
    return coupling_aerial_source(
        CouplingAerialMedium(medium.extinction, medium.scattering),
        diffuse_incident,
        clear_diffuse_transfer,
        direct_sources[0u],
        direct_sources[1u]);
}

fn ordered_clear_atmosphere_segment(
    origin: vec3<f32>, direction: vec3<f32>,
    near_km: f32, far_km: f32,
) -> CameraTransport {
    return cloud_background_atmosphere_segment(
        origin, direction, near_km, far_km);
}

fn ordered_cloud_step_target_km(
    layer: Layer, index: i32, interval: vec2<f32>,
) -> f32 {
    let interval_length = max(0.001, interval.y - interval.x);
    let genus = i32(round(layer.scale.z));
    // These are camera-path ceilings, not sample-count wishes. They remain
    // below the smallest production macro-structure while allowing a single
    // bounded ordered march to cross the complete 140 km tropospheric ray.
    // The optical-depth limiter below subdivides dense cells further.
    var maximum_step_km = 0.32;
    if (index == 1) { maximum_step_km = 0.48; }
    if (index == 2) { maximum_step_km = 0.68; }
    if (genus == 10) { maximum_step_km = 0.28; }
    var step_count = max(1, i32(p[20].z));
    if (genus == 4 || genus == 7) {
        step_count = min(48, step_count + 12);
    }
    if (genus == 9 || genus == 10) {
        step_count = min(64, step_count + 18);
    }
    if (genus == 10) { step_count = min(144, step_count + 72); }
    step_count = max(step_count, min(select(96, 144, genus == 10),
        i32(ceil(interval_length / maximum_step_km))));
    return min(maximum_step_km, interval_length / f32(max(1, step_count)));
}

fn ordered_cloud_weather_sample(
    origin: vec3<f32>, distance_km: f32,
    layer_direction: vec3<f32>, layer: Layer, index: i32,
    interval: vec2<f32>, placement: f32,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    active_set: OrderedActiveSet,
) -> OrderedWeatherSample {
    var result = empty_ordered_weather_sample();
    if (layer.phase.z < 0.5 || distance_km < interval.x ||
        distance_km > interval.y || placement <= 0.0001) { return result; }
    let point = origin + layer_direction * distance_km;
    let cloud_sample = cloud_density_material_sample_active(
        point, layer, index, active_set);
    let density = cloud_sample.density * saturate(placement);
    if (density <= 0.0001) { return result; }
    let local_material = cloud_sample.material;
    let spectral_extinction_coefficient =
        cloud_spectral_extinction_coefficient_from_material(
            local_material, layer);
    let extinction = max(vec3<f32>(0.0),
        density * spectral_extinction_coefficient);
    if (!finite_rgb(extinction) || maximum_rgb(extinction) <= 1e-8) {
        return result;
    }
    var directional_sky_cache = cloud_empty_directional_sky_band_cache();
    var directional_sky_cache_valid = false;
    let source_radiance = sheet_node_source_radiance(
        point, layer_direction, density, layer, index,
        sun_direction, moon_direction,
        local_material, spectral_extinction_coefficient,
        &directional_sky_cache, &directional_sky_cache_valid);
    if (!finite_rgb(source_radiance)) { return result; }
    let weight = photopic(extinction);
    result.extinction_rgb_per_km = extinction;
    result.source_coefficient_rgb_per_km = extinction * source_radiance;
    result.diagnostic_extinction_y_per_km = weight;
    result.velocity = layer.motion.xy;
    result.metadata_weight = weight;
    result.layer_identifier = f32(index);
    return result;
}

fn ordered_hydrometeor_weather_sample(
    point: vec3<f32>, distance_km: f32,
    direction: vec3<f32>, sun_direction: vec3<f32>,
    moon_direction: vec3<f32>, active_set: OrderedActiveSet,
) -> OrderedWeatherSample {
    var result = empty_ordered_weather_sample();
    if (hydrometeor_fields.header.x < 0.5) { return result; }
    let field_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    let record_count = min(
        u32(hydrometeor_fields.header.x + 0.5), HYDROMETEOR_MAX_FIELDS);
    let incident = HydrometeorLocalIrradianceAtSample(
        physical_source_irradiance_at(0u, point),
        physical_source_irradiance_at(1u, point),
        physical_diffuse_irradiance_at(point),
        physical_ground_irradiance_at(point),
    );
    var overlap = hydrometeor_empty_passive_overlap();
    var optical_weight = 0.0;
    var velocity_sum = vec2<f32>(0.0);
    var dominant_parent_layer = -1.0;
    var dominant_parent_weight = 0.0;
    for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
        if (index >= record_count) { break; }
        if (!ordered_active_contains(active_set, 40u + index)) { continue; }
        let record = hydrometeor_fields.records[index];
        let sample = hydrometeor_sample_record(
            record, field_position, distance_km, p[0].z);
        let extinction = max(vec3<f32>(0.0), sample.extinction_rgb_km);
        let sample_weight = photopic(extinction);
        if (sample_weight <= 1e-8) { continue; }

        let glint_sigma = clamp(
            record.particle_shape.z * 0.28 +
                record.particle_shape.w * 0.12,
            0.006, 0.35);
        let glint_concentration = 1.0 /
            max(1e-6, glint_sigma * glint_sigma);
        let scattering = extinction * clamp(
            sample.scattering_albedo_rgb,
            vec3<f32>(0.0), vec3<f32>(1.0));
        let asymmetry = vec3<f32>(clamp(sample.asymmetry, -0.98, 0.98));
        let transport_extinction = max(
            vec3<f32>(1e-6), extinction - scattering +
                scattering * (vec3<f32>(1.0) - asymmetry));
        let diffusion = clamp(
            vec3<f32>(1.0) / (3.0 * transport_extinction),
            vec3<f32>(1e-4), vec3<f32>(1e4));
        let parent_owner = u32(clamp(
            round(record.identity.z), 0.0, 35.0));
        let owner_confidence = cloud_lv_owner_sample_confidence(
            point, parent_owner);
        let parent_scattering =
            cloud_lv_sample_owner_scattering_radiance(
                point, -direction, parent_owner, diffusion);
        let parent = HydrometeorParentLightCoupling(
            record.identity.z,
            record.energy_and_importance.w,
            hydrometeor_passive_rgb_transfer(
                cloud_lv_sample_owner_direct_transmittance(
                    point, parent_owner, 0u),
                vec3<f32>(0.0)),
            hydrometeor_passive_rgb_transfer(
                cloud_lv_sample_owner_direct_transmittance(
                    point, parent_owner, 1u),
                vec3<f32>(0.0)),
            // Inside a resident parent volume, its P1 field owns diffuse
            // arrival. Outside it, preserve the atmosphere's diffuse field.
            hydrometeor_passive_rgb_transfer(
                vec3<f32>(1.0 - owner_confidence), vec3<f32>(0.0)),
            hydrometeor_passive_rgb_transfer(
                vec3<f32>(1.0), vec3<f32>(0.0)),
            parent_scattering,
        );
        let local_up = normalize(point + vec3<f32>(1e-12));
        // First-order spherical-harmonic hemisphere integral of HG. The two
        // halves remain normalized and respond to the real local horizon.
        let upper_integral = clamp(
            0.5 + 0.75 * sample.asymmetry * dot(direction, local_up),
            0.0, 1.0);
        let resolved = hydrometeor_resolve_passive_source_coefficient(
            record,
            sample,
            incident,
            parent,
            dot(direction, sun_direction),
            dot(direction, moon_direction),
            glint_concentration,
            upper_integral,
            1.0 - upper_integral,
        );
        overlap = hydrometeor_accumulate_passive_overlap(overlap, resolved);
        optical_weight += sample_weight;
        velocity_sum += sample_weight * record.kinematics.xy;
        if (sample_weight > dominant_parent_weight) {
            dominant_parent_weight = sample_weight;
            dominant_parent_layer = record.energy_and_importance.w;
        }
    }
    if (optical_weight <= 1e-8) { return result; }
    let extinction = max(vec3<f32>(0.0), overlap.extinction_rgb_km);
    let scalar_extinction = photopic(extinction);
    if (scalar_extinction <= 1e-8) { return result; }
    result.extinction_rgb_per_km = extinction;
    result.source_coefficient_rgb_per_km = max(
        vec3<f32>(0.0), overlap.source_coefficient_rgb_km);
    result.diagnostic_extinction_y_per_km = scalar_extinction;
    result.velocity = velocity_sum / optical_weight;
    result.metadata_weight = scalar_extinction;
    result.layer_identifier = dominant_parent_layer;
    return result;
}

// Resolve one upper-atmosphere material record without retaining a per-ray
// owner table. x is the morphology-record index and y is the material profile;
// profile zero is the invalid sentinel.
fn ordered_upper_owner_material(owner: u32) -> vec2<u32> {
    let range = cloud_morphology_owner_range(owner);
    if (range.y == 0u) { return vec2<u32>(0u); }
    for (var local_index = 0u; local_index < 8u; local_index += 1u) {
        if (local_index >= range.y) { break; }
        let record_index = range.x + local_index;
        let candidate = cloud_morphology_load_record(record_index);
        if (cloud_morphology_operator_code(candidate) ==
            CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET) {
            return vec2<u32>(
                record_index,
                u32(max(0.0, round(candidate.shape1.w))));
        }
    }
    return vec2<u32>(0u);
}

fn ordered_upper_weather_sample(
    point: vec3<f32>, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    active_set: OrderedActiveSet,
) -> OrderedWeatherSample {
    var result = empty_ordered_weather_sample();
    let local_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS; owner += 1u) {
        if (!ordered_active_contains(active_set, 136u + owner)) { continue; }
        let material = ordered_upper_owner_material(owner);
        if (material.y == 0u) { continue; }
        let morphology = cloud_morphology_evaluate_owner(owner, local_position);
        let density = saturate(morphology.material_weight);
        let profile = morphology.material_profile_code;
        if (density <= 1e-6 || profile == 0u) { continue; }
        let extinction = density * upper_material_extinction_km(profile);
        result.extinction_rgb_per_km += extinction;
        result.source_coefficient_rgb_per_km += extinction *
            upper_material_source(
                profile, point, direction, sun_direction, moon_direction);
    }
    return result;
}

fn ordered_layer_interval(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
) -> vec2<f32> {
    if (layer.phase.z < 0.5 || layer.geometry.z <= 0.0001) {
        return vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    }
    let inner = sphere_hits(
        origin, direction, PLANET_RADIUS + layer.geometry.x);
    let outer = sphere_hits(
        origin, direction,
        PLANET_RADIUS + layer.geometry.x + layer.geometry.y);
    if (outer.y <= 0.0) {
        return vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    }
    let near = select(max(0.0, outer.x), inner.y, inner.y > 0.0);
    let far = min(FAR_LIMIT, outer.y);
    return select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(near, far),
        far > near);
}

fn ordered_union_interval(
    first: vec2<f32>, second: vec2<f32>,
) -> vec2<f32> {
    if (first.y <= first.x) { return second; }
    if (second.y <= second.x) { return first; }
    return vec2<f32>(min(first.x, second.x), max(first.y, second.y));
}

fn ordered_local_support_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    center_east_north: vec2<f32>,
    east_reach_km: f32, north_reach_km: f32,
    bottom_altitude_km: f32, top_altitude_km: f32,
) -> vec2<f32> {
    let altitude = hydrometeor_altitude_interval(
        origin, direction, bottom_altitude_km, top_altitude_km);
    let east = hydrometeor_axis_interval(
        origin.x, direction.x,
        center_east_north.x - east_reach_km,
        center_east_north.x + east_reach_km);
    let north = hydrometeor_axis_interval(
        origin.z, direction.z,
        center_east_north.y - north_reach_km,
        center_east_north.y + north_reach_km);
    let near = max(0.0, max(altitude.x, max(east.x, north.x)));
    let far = min(FAR_LIMIT, min(altitude.y, min(east.y, north.y)));
    return select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(near, far),
        far > near);
}

fn ordered_cloud_system_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    system: CloudSystem, owner_index: u32,
) -> vec2<f32> {
    let center = system.horizontal_extent.xy;
    // cloud_macro_owner_sample accepts canonical coordinates through
    // [-0.13, 1.13] for deformation, exterior SDF detail and filtering. That
    // maps to 1.26 times each half extent; 1.30 retains a small numerical
    // margin so this acceleration support can never crop authorized density.
    let owner_support_scale = 1.30;
    let major_radius = max(0.04, system.horizontal_extent.z) *
        owner_support_scale;
    let minor_radius = max(0.04, system.horizontal_extent.w) *
        owner_support_scale;
    let orientation = system.vertical_extent.z;
    let downwind = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind = vec2<f32>(-downwind.y, downwind.x);
    let offset = origin.xz - center;
    let along = hydrometeor_axis_interval(
        dot(offset, downwind), dot(direction.xz, downwind),
        -major_radius, major_radius);
    let across = hydrometeor_axis_interval(
        dot(offset, crosswind), dot(direction.xz, crosswind),
        -minor_radius, minor_radius);
    let depth = max(0.02, system.vertical_extent.y);
    let altitude = hydrometeor_altitude_interval(
        origin,
        direction,
        system.vertical_extent.x - depth * 0.30,
        system.vertical_extent.x + depth * 1.30);
    let base_near = max(0.0, max(
        altitude.x, max(along.x, across.x)));
    let base_far = min(FAR_LIMIT, min(
        altitude.y, min(along.y, across.y)));
    var result = select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(base_near, base_far),
        base_far > base_near);

    // Modifier operators are finite OBBs. Union their conservative
    // axis-aligned projections with the atlas owner support so placed bands,
    // clones, scud, and storm accessories cannot be skipped. Upper wave sheets
    // own a separate curved-shell event set and are excluded here.
    let range = cloud_morphology_owner_range(owner_index);
    for (var local_index = 0u; local_index < 8u; local_index += 1u) {
        if (local_index >= range.y) { break; }
        let record = cloud_morphology_load_record(range.x + local_index);
        if (cloud_morphology_operator_code(record) ==
            CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET) { continue; }
        let expansion = 1.08;
        let east_reach = expansion * (
            abs(record.axis_u.x) * record.axis_u.w +
            abs(record.axis_v.x) * record.axis_v.w +
            abs(record.axis_w.x) * record.axis_w.w);
        let altitude_reach = expansion * (
            abs(record.axis_u.y) * record.axis_u.w +
            abs(record.axis_v.y) * record.axis_v.w +
            abs(record.axis_w.y) * record.axis_w.w);
        let north_reach = expansion * (
            abs(record.axis_u.z) * record.axis_u.w +
            abs(record.axis_v.z) * record.axis_v.w +
            abs(record.axis_w.z) * record.axis_w.w);
        let modifier_interval = ordered_local_support_interval(
            origin,
            direction,
            record.center_support.xz,
            max(0.02, east_reach),
            max(0.02, north_reach),
            record.center_support.y - max(0.02, altitude_reach),
            record.center_support.y + max(0.02, altitude_reach));
        result = ordered_union_interval(result, modifier_interval);
    }
    return result;
}

fn ordered_all_weather_sample(
    origin: vec3<f32>, direction: vec3<f32>, distance_km: f32,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    layer_intervals: ptr<function, array<vec2<f32>, 3>>,
    layer_placements: ptr<function, array<f32, 3>>,
    active_set: OrderedActiveSet,
) -> OrderedWeatherSample {
    var result = empty_ordered_weather_sample();
    for (var index = 0; index < 3; index += 1) {
        result = accumulate_ordered_weather_sample(
            result,
            ordered_cloud_weather_sample(
                origin,
                distance_km,
                direction,
                layer_at(index),
                index,
                (*layer_intervals)[index],
                (*layer_placements)[index],
                sun_direction,
                moon_direction,
                active_set,
            ));
    }
    let point = origin + direction * distance_km;
    result = accumulate_ordered_weather_sample(
        result,
        ordered_hydrometeor_weather_sample(
            point,
            distance_km,
            direction,
            sun_direction,
            moon_direction,
            active_set,
        ));
    result = accumulate_ordered_weather_sample(
        result,
        ordered_upper_weather_sample(
            point,
            direction,
            sun_direction,
            moon_direction,
            active_set,
        ));
    return result;
}

*/
fn production_layer_shell_interval(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
) -> vec2<f32> {
    if (layer.phase.z < 0.5 || layer.geometry.z <= 0.0001) {
        return vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    }
    let inner = sphere_hits(
        origin, direction, PLANET_RADIUS + layer.geometry.x);
    let outer = sphere_hits(
        origin, direction,
        PLANET_RADIUS + layer.geometry.x + layer.geometry.y);
    if (outer.y <= 0.0) {
        return vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    }
    let near = select(max(0.0, outer.x), inner.y, inner.y > 0.0);
    let far = min(FAR_LIMIT, outer.y);
    return select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(near, far),
        far > near);
}

fn production_union_interval(
    first: vec2<f32>, second: vec2<f32>,
) -> vec2<f32> {
    if (first.y <= first.x) { return second; }
    if (second.y <= second.x) { return first; }
    return vec2<f32>(min(first.x, second.x), max(first.y, second.y));
}

fn production_local_support_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    center_east_north: vec2<f32>,
    east_reach_km: f32, north_reach_km: f32,
    bottom_altitude_km: f32, top_altitude_km: f32,
) -> vec2<f32> {
    let altitude = hydrometeor_altitude_interval(
        origin, direction, bottom_altitude_km, top_altitude_km);
    let east = hydrometeor_axis_interval(
        origin.x, direction.x,
        center_east_north.x - east_reach_km,
        center_east_north.x + east_reach_km);
    let north = hydrometeor_axis_interval(
        origin.z, direction.z,
        center_east_north.y - north_reach_km,
        center_east_north.y + north_reach_km);
    let near = max(0.0, max(altitude.x, max(east.x, north.x)));
    let far = min(FAR_LIMIT, min(altitude.y, min(east.y, north.y)));
    return select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(near, far),
        far > near);
}

// Bound view transport to the finite owner that density_at() can actually
// sample. The previous production path marched the complete curved shell even
// when a Cu owner occupied only a few kilometres within a 140 km grazing ray.
// With the hard 96-sample safety ceiling that turned the lifting-condensation
// boundary into a row-aligned comb. These supports mirror the atlas
// [-0.13, 1.13] continuation and every finite morphology OBB, so the tighter
// interval is conservative and cannot become a screen-space placement mask.
fn production_cloud_system_support_interval(
    origin: vec3<f32>, direction: vec3<f32>,
    system: CloudSystem, owner_index: u32,
) -> vec2<f32> {
    let center = system.horizontal_extent.xy;
    let owner_support_scale = 1.30;
    let major_radius = max(0.04, system.horizontal_extent.z) *
        owner_support_scale;
    let minor_radius = max(0.04, system.horizontal_extent.w) *
        owner_support_scale;
    let orientation = system.vertical_extent.z;
    let downwind = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind = vec2<f32>(-downwind.y, downwind.x);
    let offset = origin.xz - center;
    let along = hydrometeor_axis_interval(
        dot(offset, downwind), dot(direction.xz, downwind),
        -major_radius, major_radius);
    let across = hydrometeor_axis_interval(
        dot(offset, crosswind), dot(direction.xz, crosswind),
        -minor_radius, minor_radius);
    let depth = max(0.02, system.vertical_extent.y);
    let altitude = hydrometeor_altitude_interval(
        origin, direction,
        system.vertical_extent.x - depth * 0.30,
        system.vertical_extent.x + depth * 1.30);
    let base_near = max(0.0, max(
        altitude.x, max(along.x, across.x)));
    let base_far = min(FAR_LIMIT, min(
        altitude.y, min(along.y, across.y)));
    var result = select(
        vec2<f32>(FAR_LIMIT, -FAR_LIMIT),
        vec2<f32>(base_near, base_far),
        base_far > base_near);

    let range = cloud_morphology_owner_range(owner_index);
    for (var local_index = 0u; local_index < 8u; local_index += 1u) {
        if (local_index >= range.y) { break; }
        let record = cloud_morphology_load_record(range.x + local_index);
        if (cloud_morphology_operator_code(record) ==
            CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET) { continue; }
        let expansion = 1.08;
        let east_reach = expansion * (
            abs(record.axis_u.x) * record.axis_u.w +
            abs(record.axis_v.x) * record.axis_v.w +
            abs(record.axis_w.x) * record.axis_w.w);
        let altitude_reach = expansion * (
            abs(record.axis_u.y) * record.axis_u.w +
            abs(record.axis_v.y) * record.axis_v.w +
            abs(record.axis_w.y) * record.axis_w.w);
        let north_reach = expansion * (
            abs(record.axis_u.z) * record.axis_u.w +
            abs(record.axis_v.z) * record.axis_v.w +
            abs(record.axis_w.z) * record.axis_w.w);
        let modifier_interval = production_local_support_interval(
            origin, direction, record.center_support.xz,
            max(0.02, east_reach),
            max(0.02, north_reach),
            record.center_support.y - max(0.02, altitude_reach),
            record.center_support.y + max(0.02, altitude_reach));
        result = production_union_interval(result, modifier_interval);
    }
    return result;
}

fn production_layer_has_finite_owner(
    layer: Layer, layer_index: i32,
) -> bool {
    let valid_owner_abi =
        abs(cloud_system_buffer.header.y - 16.0) <= 0.25 &&
        abs(cloud_macro_bindings.header.y - 7.0) <= 0.25;
    if (!valid_owner_abi) { return false; }
    let system_count = min(
        36,
        min(
            i32(max(0.0, cloud_system_buffer.header.x)),
            i32(max(0.0, cloud_macro_bindings.header.x)),
        ),
    );
    let genus = i32(round(layer.scale.z));
    for (var slot = 0; slot < 36; slot += 1) {
        if (slot >= system_count) { break; }
        let system = cloud_system_buffer.systems[slot];
        let atlas_binding = cloud_macro_bindings.owners[slot];
        if (system.identity.x >= 0.5 &&
            i32(round(system.identity.y)) == layer_index &&
            i32(round(system.identity.z)) == genus &&
            atlas_binding.atlas_scale.w >= 0.5) {
            return true;
        }
    }
    return false;
}

struct ProductionLayerTraversalEvent {
    segment_end: f32,
    occupied: f32,
    active_set: OrderedActiveSet,
};

// Return the next owner-support boundary, occupancy, and the exact owner set
// for the half-open segment beginning at travelled. A fresh bounded scan is
// needed only at an endpoint; accepted cloud strata reuse both the boundary
// and six-word set until segment_end. Overlapping and nested supports retain
// the same material union without rescanning unrelated owners per stratum.
fn production_layer_traversal_event(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
    layer_index: i32, travelled: f32, layer_far: f32,
) -> ProductionLayerTraversalEvent {
    let shell = production_layer_shell_interval(origin, direction, layer);
    let system_count = min(
        36,
        min(
            i32(max(0.0, cloud_system_buffer.header.x)),
            i32(max(0.0, cloud_macro_bindings.header.x)),
        ),
    );
    let genus = i32(round(layer.scale.z));
    let boundary_epsilon = max(1e-6, abs(travelled) * 1e-7);
    var segment_end = layer_far;
    var segment_occupied = false;
    var active_set = empty_ordered_active_set();
    for (var slot = 0; slot < 36; slot += 1) {
        if (slot >= system_count) { break; }
        let system = cloud_system_buffer.systems[slot];
        let atlas_binding = cloud_macro_bindings.owners[slot];
        if (system.identity.x < 0.5 ||
            i32(round(system.identity.y)) != layer_index ||
            i32(round(system.identity.z)) != genus ||
            atlas_binding.atlas_scale.w < 0.5) {
            continue;
        }
        let owner_support = production_cloud_system_support_interval(
            origin, direction, system, u32(slot));
        let interval = vec2<f32>(
            max(shell.x, max(0.0, owner_support.x)),
            min(layer_far, min(shell.y, owner_support.y)));
        if (interval.y <= interval.x) { continue; }
        if (interval.x <= travelled + boundary_epsilon &&
            interval.y > travelled + boundary_epsilon) {
            segment_occupied = true;
            active_set = ordered_active_insert(active_set, u32(slot));
            segment_end = min(segment_end, interval.y);
        } else if (interval.x > travelled + boundary_epsilon) {
            segment_end = min(segment_end, interval.x);
        }
    }
    return ProductionLayerTraversalEvent(
        segment_end,
        select(0.0, 1.0, segment_occupied),
        active_set,
    );
}

fn production_layer_interval(
    origin: vec3<f32>, direction: vec3<f32>, layer: Layer,
    layer_index: i32,
) -> vec2<f32> {
    let shell = production_layer_shell_interval(origin, direction, layer);
    if (shell.y <= shell.x) { return shell; }

    let valid_owner_abi =
        abs(cloud_system_buffer.header.y - 16.0) <= 0.25 &&
        abs(cloud_macro_bindings.header.y - 7.0) <= 0.25;
    if (!valid_owner_abi) { return shell; }
    let system_count = min(
        36,
        min(
            i32(max(0.0, cloud_system_buffer.header.x)),
            i32(max(0.0, cloud_macro_bindings.header.x)),
        ),
    );
    let genus = i32(round(layer.scale.z));
    var has_finite_owner = false;
    var finite_support = vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    for (var slot = 0; slot < 36; slot += 1) {
        if (slot >= system_count) { break; }
        let system = cloud_system_buffer.systems[slot];
        let atlas_binding = cloud_macro_bindings.owners[slot];
        if (system.identity.x < 0.5 ||
            i32(round(system.identity.y)) != layer_index ||
            i32(round(system.identity.z)) != genus ||
            atlas_binding.atlas_scale.w < 0.5) {
            continue;
        }
        has_finite_owner = true;
        let owner_support = production_cloud_system_support_interval(
            origin, direction, system, u32(slot));
        let clipped_support = vec2<f32>(
            max(shell.x, owner_support.x),
            min(shell.y, owner_support.y));
        if (clipped_support.y > clipped_support.x) {
            finite_support = production_union_interval(
                finite_support, clipped_support);
        }
    }
    // Legacy procedural layers have no finite atlas owner and retain their
    // exact curved-shell integration. Once an atlas owner exists, a ray that
    // misses every owner is physically clear and must not march the shell.
    return select(shell, finite_support, has_finite_owner);
}

fn empty_cloud_output() -> CloudOutput {
    var output: CloudOutput;
    output.radiance = vec4<f32>(0.0);
    output.transmittance = vec4<f32>(1.0);
    output.geometry = vec4<f32>(FAR_LIMIT, FAR_LIMIT, 0.0, 0.0);
    output.motion = vec4<f32>(0.0, 0.0, -1.0, 0.0);
    return output;
}

fn sanitize_layer_transport(transport: CameraTransport) -> CameraTransport {
    var radiance = vec3<f32>(0.0);
    if (finite_rgb(transport.radiance)) { radiance = transport.radiance; }
    var transmittance = vec3<f32>(1.0);
    if (finite_rgb(transport.transmittance)) {
        transmittance = clamp(
            transport.transmittance, vec3<f32>(0.0), vec3<f32>(1.0));
    }
    return CameraTransport(radiance, transmittance);
}

fn production_layer_packet(
    origin: vec3<f32>, direction: vec3<f32>, input_uv: vec2<f32>,
    index: i32, sun_direction: vec3<f32>, moon_direction: vec3<f32>,
    jitter: f32,
) -> LayerPacket {
    let layer = layer_at(index);
    let placement = cloud_composition_mask(input_uv, layer, index);
    let finite_owner_mode = production_layer_has_finite_owner(layer, index);
    var interval = production_layer_interval(
        origin, direction, layer, index);
    if (placement <= 0.001) {
        interval = vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
    }
    let marched = march_layer(
        origin, direction, layer, index, sun_direction, moon_direction,
        jitter, interval, finite_owner_mode);
    var transport = sanitize_layer_transport(
        apply_camera_transport_coverage(marched.transport, placement));
    let local_transmittance_y = clamp(
        photopic(transport.transmittance), 0.0, 1.0);
    let opacity_y = 1.0 - local_transmittance_y;

    var first_depth = FAR_LIMIT;
    var mean_depth = FAR_LIMIT;
    var velocity = vec2<f32>(0.0);
    if (opacity_y > 0.0001 && finite_scalar(marched.first_depth) &&
        finite_scalar(marched.mean_depth) && marched.first_depth >= 0.0 &&
        marched.first_depth < FAR_LIMIT && marched.mean_depth >= 0.0 &&
        marched.mean_depth < FAR_LIMIT) {
        first_depth = marched.first_depth;
        mean_depth = marched.mean_depth;
        if (finite_scalar(marched.velocity.x) &&
            finite_scalar(marched.velocity.y)) {
            velocity = marched.velocity;
        }
    }

    var evaluated_steps = 0.0;
    if (finite_scalar(marched.evaluated_steps)) {
        evaluated_steps = max(0.0, marched.evaluated_steps);
    }
    return LayerPacket(
        transport,
        first_depth,
        mean_depth,
        opacity_y,
        velocity,
        f32(index),
        evaluated_steps,
    );
}

fn layer_packet_precedes(first: LayerPacket, second: LayerPacket) -> bool {
    return first.first_depth < second.first_depth ||
        (first.first_depth == second.first_depth &&
            first.layer_identifier < second.layer_identifier);
}

fn accumulate_layer_packet(
    scene_transport: ptr<function, CameraTransport>,
    first_depth: ptr<function, f32>,
    weighted_mean_depth: ptr<function, f32>,
    blended_velocity: ptr<function, vec2<f32>>,
    contribution_weight: ptr<function, f32>,
    dominant_contribution: ptr<function, f32>,
    dominant_layer: ptr<function, f32>,
    packet: LayerPacket,
) {
    let contribution = camera_transport_removed_luminance(
        (*scene_transport).transmittance, packet.transport.transmittance);
    *scene_transport = compose_camera_transport(
        *scene_transport, packet.transport);
    if (packet.opacity_y > 0.0001 && packet.mean_depth < FAR_LIMIT) {
        *first_depth = min(*first_depth, packet.first_depth);
        *weighted_mean_depth += packet.mean_depth * contribution;
        *blended_velocity += packet.velocity * contribution;
        *contribution_weight += contribution;
    }
    if (contribution > *dominant_contribution) {
        *dominant_contribution = contribution;
        *dominant_layer = packet.layer_identifier;
    }
}

// Compile-safe production transport: fully physical low/mid/high cloud
// marching on one camera ray, three scalar packets, and a fixed sorting
// network. Hydrometeor and upper-atmosphere participation is intentionally
// deferred to the staged experimental entry below; it is not approximated or
// silently composited in this pass.
@fragment
fn cloud_fragment_physical_layers(input: VertexOut) -> CloudOutput {
    let pixel = floor(input.position.xy);
    let interleaved_transport = p[30].y > 0.5;
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (interleaved_transport && checker != 0) { discard; }

    // These finite checks preserve the renderer's explicit production bind
    // contract. The interval textures remain a scheduling/prepass ABI only;
    // exact curved intervals are recomputed below on this common ray.
    let interval_low_middle = textureLoad(
        cloud_interval_low_middle, vec2<i32>(pixel), 0);
    let interval_high_mask = textureLoad(
        cloud_interval_high_mask, vec2<i32>(pixel), 0);
    if (!finite_scalar(interval_low_middle.x) ||
        !finite_scalar(interval_low_middle.y) ||
        !finite_scalar(interval_low_middle.z) ||
        !finite_scalar(interval_low_middle.w) ||
        !finite_scalar(interval_high_mask.x) ||
        !finite_scalar(interval_high_mask.y) ||
        !finite_scalar(interval_high_mask.z) ||
        !finite_scalar(interval_high_mask.w) ||
        !finite_scalar(hydrometeor_fields.header.x)) {
        return empty_cloud_output();
    }

    let direction = view_direction(input.uv);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64,
        i32(pixel.y) % 64,
    );
    let blue_noise = textureLoad(blue_noise_texture, blue_noise_cell, 0).r;
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);

    // Three compact packets are 156 bytes and remain well below the private
    // memory pressure that corrupted the former 36/40/96-record tables. One
    // runtime-indexed call site prevents Metal from cloning the complete
    // morphology and lighting marcher three times during pipeline lowering.
    var packets: array<LayerPacket, 3>;
    for (var layer_index = 0; layer_index < 3; layer_index += 1) {
        packets[layer_index] = production_layer_packet(
            origin, direction, input.uv, layer_index,
            sun_direction, moon_direction, jitter);
    }

    // Fixed three-input sorting network: (0,1), (1,2), then (0,1).
    if (layer_packet_precedes(packets[1], packets[0])) {
        let swap_packet = packets[0];
        packets[0] = packets[1];
        packets[1] = swap_packet;
    }
    if (layer_packet_precedes(packets[2], packets[1])) {
        let swap_packet = packets[1];
        packets[1] = packets[2];
        packets[2] = swap_packet;
    }
    if (layer_packet_precedes(packets[1], packets[0])) {
        let swap_packet = packets[0];
        packets[0] = packets[1];
        packets[1] = swap_packet;
    }

    var scene_transport = camera_transport_identity();
    var first_depth = FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var blended_velocity = vec2<f32>(0.0);
    var contribution_weight = 0.0;
    var dominant_contribution = 0.0;
    var dominant_layer = -1.0;
    for (var packet_index = 0; packet_index < 3; packet_index += 1) {
        accumulate_layer_packet(
            &scene_transport, &first_depth, &weighted_mean_depth,
            &blended_velocity, &contribution_weight,
            &dominant_contribution, &dominant_layer,
            packets[packet_index]);
    }

    let safe_transport = sanitize_layer_transport(scene_transport);
    let transmittance_y = clamp(
        photopic(safe_transport.transmittance), 0.0, 1.0);
    let safe_contribution_weight = max(1e-8, contribution_weight);
    let actual_steps = packets[0].evaluated_steps +
        packets[1].evaluated_steps + packets[2].evaluated_steps;
    var output: CloudOutput;
    output.radiance = vec4<f32>(safe_transport.radiance, 0.0);
    output.transmittance = vec4<f32>(
        safe_transport.transmittance, transmittance_y);
    output.geometry = vec4<f32>(
        first_depth,
        select(
            FAR_LIMIT,
            weighted_mean_depth / safe_contribution_weight,
            contribution_weight > 0.0001),
        -log(max(0.0001, transmittance_y)),
        1.0 - transmittance_y,
    );
    output.motion = vec4<f32>(
        select(
            vec2<f32>(0.0),
            blended_velocity / safe_contribution_weight,
            vec2<bool>(contribution_weight > 0.0001)),
        dominant_layer,
        clamp(actual_steps / 144.0, 0.0, 1.0),
    );
    return output;
}

/*
 * Legacy mean-depth composition and its 36-entry upper-atmosphere tables are
 * deliberately outside the compiled production WGSL for the same Metal
 * private-memory reason documented above.
 */
/*
fn march_upper_atmosphere(
    origin: vec3<f32>, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>, jitter: f32,
) -> UpperAtmosphereTransport {
    var result = empty_upper_atmosphere_transport();
    if (cloud_morphology_record_count() == 0u) { return result; }
    var intervals: array<vec2<f32>, 36>;
    var step_targets: array<f32, 36>;
    var profiles: array<u32, 36>;
    var global_near = UPPER_ATMOSPHERE_FAR_LIMIT;
    var global_far = -UPPER_ATMOSPHERE_FAR_LIMIT;
    for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS; owner += 1u) {
        intervals[owner] = upper_invalid_interval();
        step_targets[owner] = 0.8;
        profiles[owner] = 0u;
        let range = cloud_morphology_owner_range(owner);
        if (range.y == 0u) { continue; }
        var material_record = cloud_morphology_load_record(range.x);
        var profile = 0u;
        for (var local_index = 0u; local_index < 8u; local_index += 1u) {
            if (local_index >= range.y) { break; }
            let candidate = cloud_morphology_load_record(range.x + local_index);
            if (cloud_morphology_operator_code(candidate) ==
                CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET) {
                material_record = candidate;
                profile = u32(max(0.0, round(candidate.shape1.w)));
                break;
            }
        }
        if (profile == 0u) { continue; }
        let interval = upper_record_interval(
            origin, direction, material_record);
        if (interval.y <= interval.x) { continue; }
        intervals[owner] = interval;
        step_targets[owner] = upper_record_step_km(
            origin, direction, material_record, interval);
        profiles[owner] = profile;
        global_near = min(global_near, interval.x);
        global_far = max(global_far, interval.y);
    }
    if (global_far <= global_near) { return result; }

    var travelled = global_near;
    var weighted_depth = 0.0;
    var contribution_weight = 0.0;
    for (var step = 0; step < 192; step++) {
        if (travelled >= global_far - 1e-5 ||
            maximum_rgb(result.transmittance) < 0.002) {
            break;
        }
        var has_active_owner = false;
        var next_event = global_far;
        var target_step = 0.8;
        for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS; owner += 1u) {
            let interval = intervals[owner];
            if (interval.y <= interval.x) { continue; }
            if (travelled >= interval.x - 1e-5 &&
                travelled < interval.y - 1e-5) {
                has_active_owner = true;
                next_event = min(next_event, interval.y);
                target_step = min(target_step, step_targets[owner]);
            } else if (interval.x > travelled + 1e-5) {
                next_event = min(next_event, interval.x);
            }
        }
        if (!has_active_owner) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let segment_end = min(global_far, min(next_event, travelled + target_step));
        let step_length = segment_end - travelled;
        if (step_length <= 1e-6) {
            travelled += 1e-5;
            continue;
        }
        let sample_jitter = fract(
            jitter + f32(step) * 0.61803398875 + p[14].z * 0.41421356237);
        let sample_distance = mix(
            travelled + step_length * 0.12,
            segment_end - step_length * 0.12,
            sample_jitter);
        travelled = segment_end;
        result.evaluated_steps += 1.0;
        let point = origin + direction * sample_distance;
        let local_position = vec3<f32>(
            point.x, length(point) - PLANET_RADIUS, point.z);
        var extinction_sum = vec3<f32>(0.0);
        var source_sum = vec3<f32>(0.0);
        for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS; owner += 1u) {
            let interval = intervals[owner];
            if (profiles[owner] == 0u || sample_distance < interval.x ||
                sample_distance > interval.y) { continue; }
            let morphology = cloud_morphology_evaluate_owner(owner, local_position);
            let density = saturate(morphology.material_weight);
            let profile = morphology.material_profile_code;
            if (density <= 1e-6 || profile == 0u) { continue; }
            let extinction = density * upper_material_extinction_km(profile);
            extinction_sum += extinction;
            source_sum += extinction * upper_material_source(
                profile, point, direction, sun_direction, moon_direction);
        }
        if (maximum_rgb(extinction_sum) <= 1e-8) { continue; }
        if (result.first_depth >= UPPER_ATMOSPHERE_FAR_LIMIT) {
            result.first_depth = sample_distance;
        }
        let segment_tau = extinction_sum * step_length;
        let segment_transmittance = exp(-segment_tau);
        let scattered_fraction = vec3<f32>(1.0) - segment_transmittance;
        let source = source_sum / max(extinction_sum, vec3<f32>(1e-8));
        result.radiance += result.transmittance * source * scattered_fraction;
        let contribution = photopic(
            result.transmittance * scattered_fraction);
        weighted_depth += sample_distance * contribution;
        contribution_weight += contribution;
        result.transmittance *= segment_transmittance;
    }
    if (contribution_weight > 0.0) {
        result.mean_depth = weighted_depth / contribution_weight;
    }
    return result;
}

@fragment
fn cloud_fragment_legacy_mean_depth(input: VertexOut) -> CloudOutput {
    let pixel = floor(input.position.xy);
    let interleaved_transport = p[30].y > 0.5;
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (interleaved_transport && checker != 0) { discard; }
    let direction = view_direction(input.uv);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let pixel_index = vec2<i32>(pixel);
    let interval_low_middle = textureLoad(
        cloud_interval_low_middle, pixel_index, 0);
    let interval_high_mask = textureLoad(
        cloud_interval_high_mask, pixel_index, 0);
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64,
        i32(pixel.y) % 64,
    );
    let blue_noise = textureLoad(blue_noise_texture, blue_noise_cell, 0).r;
    // Cranley-Patterson rotation by the golden-ratio conjugate advances the
    // progressive spatial ranking without repeating short temporal cycles.
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);
    var scene_transport = camera_transport_identity();
    var first_depth = FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var blended_velocity = vec2<f32>(0.0);
    var contribution_weight = 0.0;
    var dominant_opacity = 0.0;
    var dominant_layer = -1.0;
    var actual_steps = 0.0;
    // Parent-owned precipitation and fog occupy one finite world-space
    // transport domain. Gather all cloud transports before composition so the
    // hydrometeor result can enter at its actual first interaction depth; a
    // distant shaft must sit behind a nearer cloud, while precipitation below
    // its parent naturally remains in front.
    let hydrometeors = march_hydrometeors(
        origin, direction, sun_direction, moon_direction, jitter);
    actual_steps += hydrometeors.evaluated_steps;
    let hydrometeor_transmittance_y = clamp(
        photopic(hydrometeors.transmittance), 0.0, 1.0);
    let hydrometeor_opacity = 1.0 - hydrometeor_transmittance_y;
    var transported_hydrometeors = CameraTransport(
        hydrometeors.radiance, hydrometeors.transmittance);
    if (hydrometeor_opacity > 0.0001 && hydrometeors.mean_depth < FAR_LIMIT) {
        let hydrometeor_point = origin + direction * hydrometeors.mean_depth;
        let air = finite_atmosphere_to_sample(hydrometeor_point);
        transported_hydrometeors = camera_transport_through_foreground_air(
            transported_hydrometeors, air);
    }
    var layer_transport: array<CameraTransport, 3>;
    var layer_opacity: array<f32, 3>;
    var layer_first_depth: array<f32, 3>;
    var layer_mean_depth: array<f32, 3>;
    var layer_velocity: array<vec2<f32>, 3>;
    var layer_identifier: array<f32, 3>;
    for (var index = 0; index < 3; index++) {
        let layer = layer_at(index);
        let placement = cloud_composition_mask(input.uv, layer, index);
        let layer_direction = view_direction(cloud_composition_uv(input.uv, index));
        var interval = interval_high_mask.xy;
        if (index == 0) { interval = interval_low_middle.xy; }
        if (index == 1) { interval = interval_low_middle.zw; }
        let marched = march_layer(origin, layer_direction, layer, index,
            sun_direction, moon_direction, jitter, interval,
            production_layer_has_finite_owner(layer, index));
        var transported_layer = apply_camera_transport_coverage(
            marched.transport, placement);
        let local_transmittance_y = clamp(
            photopic(transported_layer.transmittance), 0.0, 1.0);
        let opacity = 1.0 - local_transmittance_y;
        if (opacity > 0.0001 && marched.mean_depth < FAR_LIMIT) {
            let cloud_point = origin + layer_direction * marched.mean_depth;
            let air = finite_atmosphere_to_sample(cloud_point);
            // Clear-sky radiance is already present behind the cloud in the
            // final composite. Only the foreground air displaced by cloud
            // opacity belongs here, alongside sample-to-camera transport.
            transported_layer = camera_transport_through_foreground_air(
                transported_layer, air);
        }
        layer_transport[index] = transported_layer;
        layer_opacity[index] = opacity;
        layer_first_depth[index] = marched.first_depth;
        layer_mean_depth[index] = marched.mean_depth;
        layer_velocity[index] = marched.velocity;
        layer_identifier[index] = marched.layer_identifier;
        actual_steps += marched.evaluated_steps;
    }

    var hydrometeor_pending = hydrometeor_opacity > 1e-8 &&
        hydrometeors.mean_depth < FAR_LIMIT;
    for (var index = 0; index < 3; index++) {
        if (hydrometeor_pending &&
            hydrometeors.first_depth <= layer_first_depth[index]) {
            let contribution = camera_transport_removed_luminance(
                scene_transport.transmittance,
                transported_hydrometeors.transmittance);
            scene_transport = compose_camera_transport(
                scene_transport, transported_hydrometeors);
            first_depth = min(first_depth, hydrometeors.first_depth);
            weighted_mean_depth += hydrometeors.mean_depth * contribution;
            blended_velocity += hydrometeors.velocity * contribution;
            contribution_weight += contribution;
            if (contribution > dominant_opacity) {
                dominant_opacity = contribution;
                dominant_layer = hydrometeors.parent_layer;
            }
            hydrometeor_pending = false;
        }
        let contribution = camera_transport_removed_luminance(
            scene_transport.transmittance,
            layer_transport[index].transmittance);
        scene_transport = compose_camera_transport(
            scene_transport, layer_transport[index]);
        if (layer_opacity[index] > 0.0001) {
            first_depth = min(first_depth, layer_first_depth[index]);
            weighted_mean_depth += layer_mean_depth[index] * contribution;
            blended_velocity += layer_velocity[index] * contribution;
            contribution_weight += contribution;
        }
        if (contribution > dominant_opacity) {
            dominant_opacity = contribution;
            dominant_layer = layer_identifier[index];
        }
    }
    if (hydrometeor_pending) {
        let contribution = camera_transport_removed_luminance(
            scene_transport.transmittance,
            transported_hydrometeors.transmittance);
        scene_transport = compose_camera_transport(
            scene_transport, transported_hydrometeors);
        first_depth = min(first_depth, hydrometeors.first_depth);
        weighted_mean_depth += hydrometeors.mean_depth * contribution;
        blended_velocity += hydrometeors.velocity * contribution;
        contribution_weight += contribution;
        if (contribution > dominant_opacity) {
            dominant_opacity = contribution;
            dominant_layer = hydrometeors.parent_layer;
        }
    }

    // Upper-atmosphere species are real finite morphology owners in curved
    // 15–30 km and 80–85 km shells. They are composed behind tropospheric
    // weather, illuminated through the physical atmosphere, and attenuate the
    // clear sky with the same Beer transport as every other participating
    // medium. They intentionally do not enter the 140 km tropospheric depth
    // G-buffer, whose sentinel cannot encode mesospheric horizon distances.
    if (maximum_rgb(scene_transport.transmittance) > 0.002) {
        let upper = march_upper_atmosphere(
            origin, direction, sun_direction, moon_direction, jitter);
        let upper_transmittance_y = clamp(
            photopic(upper.transmittance), 0.0, 1.0);
        let upper_opacity = 1.0 - upper_transmittance_y;
        let upper_transport = CameraTransport(
            upper.radiance, upper.transmittance);
        let upper_contribution = camera_transport_removed_luminance(
            scene_transport.transmittance, upper.transmittance);
        scene_transport = compose_camera_transport(
            scene_transport, upper_transport);
        actual_steps += upper.evaluated_steps;
        if (upper_opacity > 0.0001 && contribution_weight <= 0.0001 &&
            upper.mean_depth < UPPER_ATMOSPHERE_FAR_LIMIT) {
            // Preserve a useful opacity diagnostic without lying about the
            // compact tropospheric depth contract.
            dominant_opacity = max(dominant_opacity, upper_contribution);
        }
    }

    let transmittance = clamp(
        scene_transport.transmittance, vec3<f32>(0.0), vec3<f32>(1.0));
    let transmittance_y = clamp(photopic(transmittance), 0.0, 1.0);
    var output: CloudOutput;
    output.radiance = vec4<f32>(scene_transport.radiance, 0.0);
    output.transmittance = vec4<f32>(transmittance, transmittance_y);
    output.geometry = vec4<f32>(
        first_depth,
        select(FAR_LIMIT, weighted_mean_depth / contribution_weight,
            contribution_weight > 0.0001),
        -log(max(0.0001, transmittance_y)),
        1.0 - transmittance_y,
    );
    output.motion = vec4<f32>(
        select(vec2<f32>(0.0), blended_velocity / contribution_weight,
            vec2<bool>(contribution_weight > 0.0001)),
        dominant_layer,
        clamp(actual_steps / 144.0, 0.0, 1.0),
    );
    return output;
}

// The former mean-depth transport above remains only as an inert historical
// comparison. The unified event marcher below is retained as a non-production
// experimental entry while hydrometeor and upper integration are staged back
// into the compile-safe physical cloud pass.
*/
/*
 * The unified event entry is retained as source for the forthcoming staged
 * media split, but must not enter the shipping Metal module: whole-module
 * lowering otherwise spends minutes compiling its nested event/sample graph
 * even when another entry point is selected.
 */
/*
@fragment
fn cloud_fragment_ordered_experimental(input: VertexOut) -> CloudOutput {
    let pixel = floor(input.position.xy);
    let interleaved_transport = p[30].y > 0.5;
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (interleaved_transport && checker != 0) { discard; }

    // The shipped scene always follows the same unwarped physical camera ray
    // as the atmosphere/background pass. Non-natural perspective choices are
    // deliberately Lab-only comparisons: apply one common lens transform to
    // every ordered medium instead of warping individual cloud layers.
    let physical_direction = view_direction(input.uv);
    let lab_perspective_enabled = i32(round(p[28].z)) != 0;
    let direction = select(
        physical_direction,
        view_direction(cloud_composition_uv(input.uv, 0)),
        lab_perspective_enabled);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let atmosphere_origin = renderer_to_atmosphere_world(origin);
    let atmosphere_direction = normalize(vec3<f32>(
        direction.x, direction.z, direction.y));
    let atmosphere_limit = atmo_ray_limit(
        atmosphere_origin, atmosphere_direction).x;
    let path_far = min(
        UPPER_ATMOSPHERE_FAR_LIMIT, max(0.0, atmosphere_limit));
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));

    let pixel_index = vec2<i32>(pixel);
    let interval_low_middle = textureLoad(
        cloud_interval_low_middle, pixel_index, 0);
    let interval_high_mask = textureLoad(
        cloud_interval_high_mask, pixel_index, 0);
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64,
        i32(pixel.y) % 64,
    );
    let blue_noise = textureLoad(blue_noise_texture, blue_noise_cell, 0).r;
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);

    var layer_shell_intervals: array<vec2<f32>, 3>;
    var layer_intervals: array<vec2<f32>, 3>;
    var layer_owner_counts: array<u32, 3>;
    var layer_placements: array<f32, 3>;
    for (var index = 0; index < 3; index += 1) {
        let layer = layer_at(index);
        let placement = cloud_composition_mask(input.uv, layer, index);
        var prepass_interval = interval_high_mask.xy;
        if (index == 0) { prepass_interval = interval_low_middle.xy; }
        if (index == 1) { prepass_interval = interval_low_middle.zw; }
        var interval = ordered_layer_interval(origin, direction, layer);
        if (prepass_interval.y <= prepass_interval.x ||
            placement <= 0.001) {
            interval = vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
        } else {
            interval = vec2<f32>(
                max(0.0, interval.x), min(path_far, interval.y));
        }
        layer_shell_intervals[index] = interval;
        layer_intervals[index] = vec2<f32>(FAR_LIMIT, -FAR_LIMIT);
        layer_owner_counts[index] = 0u;
        layer_placements[index] = placement;
    }

    var cloud_system_count = 0u;
    if (abs(cloud_system_buffer.header.y - 16.0) <= 0.25 &&
        abs(cloud_macro_bindings.header.y - 7.0) <= 0.25) {
        cloud_system_count = min(36u, min(
            u32(max(0.0, cloud_system_buffer.header.x)),
            u32(max(0.0, cloud_macro_bindings.header.x))));
    }
    for (var owner = 0u; owner < 36u; owner += 1u) {
        if (owner >= cloud_system_count) { break; }
        let system = cloud_system_buffer.systems[owner];
        let atlas_binding = cloud_macro_bindings.owners[owner];
        if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5) {
            continue;
        }
        let layer_index = i32(round(system.identity.y));
        if (layer_index < 0 || layer_index >= 3 ||
            i32(round(system.identity.z)) !=
                i32(round(layer_at(layer_index).scale.z))) {
            continue;
        }
        // This mirrors cloud_macro_atlas_sample's matched_owner contract.  A
        // valid manifest owner suppresses the legacy population even when the
        // current camera ray misses its finite world support.
        layer_owner_counts[layer_index] += 1u;
        let shell_interval = layer_shell_intervals[layer_index];
        if (shell_interval.y <= shell_interval.x) { continue; }
        let owner_support = ordered_cloud_system_interval(
            origin, direction, system, owner);
        let interval = vec2<f32>(
            max(shell_interval.x, max(0.0, owner_support.x)),
            min(path_far, min(shell_interval.y, owner_support.y)));
        if (interval.y <= interval.x) { continue; }
        layer_intervals[layer_index] = ordered_union_interval(
            layer_intervals[layer_index], interval);
    }
    for (var index = 0; index < 3; index += 1) {
        if (layer_owner_counts[index] != 0u) { continue; }
        let interval = layer_shell_intervals[index];
        layer_intervals[index] = interval;
    }

    let hydrometeor_count = min(
        u32(max(0.0, hydrometeor_fields.header.x) + 0.5),
        HYDROMETEOR_MAX_FIELDS);

    var combined_transport = camera_transport_identity();
    var clear_transport = camera_transport_identity();
    var weather_transmittance = vec3<f32>(1.0);
    var first_depth = FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var blended_velocity = vec2<f32>(0.0);
    var contribution_weight = 0.0;
    var dominant_contribution = 0.0;
    var dominant_layer = -1.0;
    var actual_steps = 0.0;
    var travelled = 0.0;
    var active_set = empty_ordered_active_set();
    var segment_end = 0.0;
    var segment_step_target = 8.0;
    var segment_occupied = false;
    var event_dirty = true;

    // A finite event march replaces mean-depth air wrapping and whole-layer
    // sorting. Every occupied step sums overlapping RGB sigma_t and j before
    // applying one exponential update. Clear gaps use the exact finite
    // atmosphere solver, so they do not consume the bounded local-step budget.
    // The outer ceiling includes every possible support endpoint in addition
    // to 512 accepted integration steps.
    for (var iteration = 0; iteration < 856; iteration += 1) {
        if (travelled >= path_far - 1e-5) { break; }
        if (actual_steps >= 512.0) { break; }
        if (maximum_rgb(weather_transmittance) < 0.0005) {
            // The remaining combined contribution is below half a per mille,
            // but the clear operator must still be complete for W(A(B))=C(B).
            let clear_tail = ordered_clear_atmosphere_segment(
                origin, direction, travelled, path_far);
            clear_transport = compose_camera_transport(
                clear_transport, clear_tail);
            travelled = path_far;
            break;
        }

        if (event_dirty) {
            active_set = empty_ordered_active_set();
            segment_occupied = false;
            segment_end = path_far;
            segment_step_target = 8.0;
            let boundary_epsilon = max(1e-6, abs(travelled) * 1e-7);

            // Rebuild only at a support boundary. The six scalar masks cache
            // the complete active set until segment_end, so neither accepted
            // steps nor optical-depth refinements rescan inactive records.
            for (var owner = 0u; owner < 36u; owner += 1u) {
                if (owner >= cloud_system_count) { break; }
                let system = cloud_system_buffer.systems[owner];
                let atlas_binding = cloud_macro_bindings.owners[owner];
                if (system.identity.x < 0.5 ||
                    atlas_binding.atlas_scale.w < 0.5) { continue; }
                let layer_index = i32(round(system.identity.y));
                if (layer_index < 0 || layer_index >= 3 ||
                    i32(round(system.identity.z)) !=
                        i32(round(layer_at(layer_index).scale.z))) { continue; }
                let shell_interval = layer_shell_intervals[layer_index];
                if (shell_interval.y <= shell_interval.x) { continue; }
                let owner_support = ordered_cloud_system_interval(
                    origin, direction, system, owner);
                let interval = vec2<f32>(
                    max(shell_interval.x, max(0.0, owner_support.x)),
                    min(path_far, min(shell_interval.y, owner_support.y)));
                if (interval.y <= interval.x) { continue; }
                if (interval.x <= travelled + boundary_epsilon &&
                    interval.y > travelled + boundary_epsilon) {
                    active_set = ordered_active_insert(active_set, owner);
                    segment_occupied = true;
                    segment_end = min(segment_end, interval.y);
                    segment_step_target = min(segment_step_target,
                        ordered_cloud_step_target_km(
                            layer_at(layer_index), layer_index, interval));
                } else if (interval.x > travelled + boundary_epsilon) {
                    segment_end = min(segment_end, interval.x);
                }
            }
            for (var index = 0; index < 3; index += 1) {
                if (layer_owner_counts[index] != 0u) { continue; }
                let interval = layer_shell_intervals[index];
                if (interval.y <= interval.x) { continue; }
                if (interval.x <= travelled + boundary_epsilon &&
                    interval.y > travelled + boundary_epsilon) {
                    active_set = ordered_active_insert(
                        active_set, 36u + u32(index));
                    segment_occupied = true;
                    segment_end = min(segment_end, interval.y);
                    segment_step_target = min(segment_step_target,
                        ordered_cloud_step_target_km(
                            layer_at(index), index, interval));
                } else if (interval.x > travelled + boundary_epsilon) {
                    segment_end = min(segment_end, interval.x);
                }
            }
            for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS;
                index += 1u) {
                if (index >= hydrometeor_count) { break; }
                let record = hydrometeor_fields.records[index];
                let unbounded_interval = hydrometeor_record_interval(
                    origin, direction, record);
                let interval = vec2<f32>(
                    max(0.0, unbounded_interval.x),
                    min(path_far, unbounded_interval.y));
                if (interval.y <= interval.x) { continue; }
                if (interval.x <= travelled + boundary_epsilon &&
                    interval.y > travelled + boundary_epsilon) {
                    active_set = ordered_active_insert(active_set, 40u + index);
                    segment_occupied = true;
                    segment_end = min(segment_end, interval.y);
                    segment_step_target = min(segment_step_target,
                        hydrometeor_record_step_km(
                            origin, direction, record, interval));
                } else if (interval.x > travelled + boundary_epsilon) {
                    segment_end = min(segment_end, interval.x);
                }
            }
            for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS;
                owner += 1u) {
                let material = ordered_upper_owner_material(owner);
                if (material.y == 0u) { continue; }
                let material_record = cloud_morphology_load_record(material.x);
                let unbounded_interval = upper_record_interval(
                    origin, direction, material_record);
                let interval = vec2<f32>(
                    max(0.0, unbounded_interval.x),
                    min(path_far, unbounded_interval.y));
                if (interval.y <= interval.x) { continue; }
                if (interval.x <= travelled + boundary_epsilon &&
                    interval.y > travelled + boundary_epsilon) {
                    active_set = ordered_active_insert(active_set, 136u + owner);
                    segment_occupied = true;
                    segment_end = min(segment_end, interval.y);
                    segment_step_target = min(segment_step_target,
                        upper_record_step_km(
                            origin, direction, material_record, interval));
                } else if (interval.x > travelled + boundary_epsilon) {
                    segment_end = min(segment_end, interval.x);
                }
            }
            event_dirty = false;
        }

        if (!segment_occupied) {
            if (segment_end <= travelled + 1e-6) {
                travelled = min(path_far, travelled + 1e-5);
                event_dirty = true;
                continue;
            }
            let clear_gap = ordered_clear_atmosphere_segment(
                origin, direction, travelled, segment_end);
            combined_transport = compose_camera_transport(
                combined_transport, clear_gap);
            clear_transport = compose_camera_transport(
                clear_transport, clear_gap);
            travelled = segment_end;
            event_dirty = true;
            continue;
        }

        var step_length = min(
            segment_step_target, max(0.0, segment_end - travelled));
        if (step_length <= 1e-6) {
            travelled = segment_end;
            event_dirty = true;
            continue;
        }
        let stratum_jitter = mix(
            0.16,
            0.84,
            fract(jitter + actual_steps * 0.61803398875 +
                p[14].w * 0.41421356237));
        var sample_distance = travelled + step_length * stratum_jitter;
        var point = origin + direction * sample_distance;
        var weather = ordered_all_weather_sample(
            origin,
            direction,
            sample_distance,
            sun_direction,
            moon_direction,
            &layer_intervals,
            &layer_placements,
            active_set,
        );
        weather = sanitize_ordered_weather_sample(weather);
        var air = ordered_atmosphere_source_sample(
            point, direction, true);

        // A strict tau ceiling controls bias independently in R/G/B. Four
        // bounded refinements are sufficient for the continuous production
        // density fields; no data-dependent loop can escape this limit.
        for (var refinement = 0; refinement < 4; refinement += 1) {
            var combined_extinction = vec3<f32>(0.0);
            let raw_combined_extinction =
                air.extinction_rgb_per_km + weather.extinction_rgb_per_km;
            if (finite_rgb(raw_combined_extinction)) {
                combined_extinction = max(
                    vec3<f32>(0.0), raw_combined_extinction);
            }
            let maximum_tau = maximum_rgb(
                combined_extinction * step_length);
            if (maximum_tau <= 0.2) { break; }
            let bounded_step = max(
                1e-5, step_length * 0.2 / max(0.2, maximum_tau));
            if (bounded_step >= step_length - 1e-7) { break; }
            step_length = bounded_step;
            sample_distance = travelled + step_length * stratum_jitter;
            point = origin + direction * sample_distance;
            weather = ordered_all_weather_sample(
                origin,
                direction,
                sample_distance,
                sun_direction,
                moon_direction,
                &layer_intervals,
                &layer_placements,
                active_set,
            );
            weather = sanitize_ordered_weather_sample(weather);
            air = ordered_atmosphere_source_sample(point, direction, true);
        }

        var combined_extinction = vec3<f32>(0.0);
        let raw_combined_extinction =
            air.extinction_rgb_per_km + weather.extinction_rgb_per_km;
        if (finite_rgb(raw_combined_extinction)) {
            combined_extinction = max(
                vec3<f32>(0.0), raw_combined_extinction);
        }
        // Enforce the final bound against the coefficients that will actually
        // be integrated even if the last refinement consumed its iteration.
        step_length = min(
            step_length,
            0.2 / max(1e-8, maximum_rgb(combined_extinction)));
        var combined_source = vec3<f32>(0.0);
        let raw_combined_source =
            air.source_radiance_coefficient_rgb_per_km +
            weather.source_coefficient_rgb_per_km;
        if (finite_rgb(raw_combined_source)) {
            combined_source = max(vec3<f32>(0.0), raw_combined_source);
        }
        let combined_segment = integrate_camera_transport_coefficients(
            combined_extinction, combined_source, step_length);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            step_length);
        var weather_extinction = vec3<f32>(0.0);
        if (finite_rgb(weather.extinction_rgb_per_km)) {
            weather_extinction = max(
                vec3<f32>(0.0), weather.extinction_rgb_per_km);
        }
        let weather_step_transmittance = exp(
            -weather_extinction * step_length);

        let weather_extinction_y = photopic(
            weather.extinction_rgb_per_km);
        // WGSL select evaluates both values. Keep empty conservative supports
        // from manufacturing a discarded 0/0 operand on Metal.
        let diagnostic_fraction = clamp(
            weather.diagnostic_extinction_y_per_km /
                max(1e-8, weather_extinction_y),
            0.0,
            1.0);
        let diagnostic_contribution = photopic(
            combined_transport.transmittance *
            (vec3<f32>(1.0) - weather_step_transmittance)) *
            diagnostic_fraction;
        if (weather.diagnostic_extinction_y_per_km * step_length > 1e-5) {
            first_depth = min(first_depth, sample_distance);
            weighted_mean_depth += sample_distance * diagnostic_contribution;
            blended_velocity += weather.velocity * diagnostic_contribution;
            contribution_weight += diagnostic_contribution;
            if (diagnostic_contribution > dominant_contribution) {
                dominant_contribution = diagnostic_contribution;
                dominant_layer = weather.layer_identifier;
            }
        }

        combined_transport = compose_camera_transport(
            combined_transport, combined_segment);
        clear_transport = compose_camera_transport(
            clear_transport, clear_segment);
        weather_transmittance *= weather_step_transmittance;
        travelled += step_length;
        actual_steps += 1.0;
        if (travelled >= segment_end - 1e-6) {
            travelled = segment_end;
            event_dirty = true;
        }
    }

    if (travelled < path_far - 1e-5) {
        // Keep A complete even when the hard work ceiling is reached. motion.w
        // exposes saturation to the renderer qualification harness.
        let clear_tail = ordered_clear_atmosphere_segment(
            origin, direction, travelled, path_far);
        clear_transport = compose_camera_transport(
            clear_transport, clear_tail);
    }

    let weather_transport = relative_weather_transport(
        combined_transport, clear_transport, weather_transmittance);
    var safe_radiance = vec3<f32>(0.0);
    if (finite_rgb(weather_transport.radiance)) {
        safe_radiance = weather_transport.radiance;
    }
    var transmittance = vec3<f32>(1.0);
    if (finite_rgb(weather_transport.transmittance)) {
        transmittance = clamp(
            weather_transport.transmittance,
            vec3<f32>(0.0), vec3<f32>(1.0));
    }
    let transmittance_y = clamp(photopic(transmittance), 0.0, 1.0);
    let safe_contribution_weight = max(1e-8, contribution_weight);
    var output: CloudOutput;
    // A relative affine operator may contain negative radiance: cloud shadow
    // can remove clear-air in-scattering. It is intentionally not clamped
    // before the completed scene is assembled and tone mapped.
    output.radiance = vec4<f32>(safe_radiance, 0.0);
    output.transmittance = vec4<f32>(transmittance, transmittance_y);
    output.geometry = vec4<f32>(
        first_depth,
        select(
            FAR_LIMIT,
            weighted_mean_depth / safe_contribution_weight,
            contribution_weight > 0.0001),
        -log(max(0.0001, transmittance_y)),
        1.0 - transmittance_y,
    );
    output.motion = vec4<f32>(
        select(
            vec2<f32>(0.0),
            blended_velocity / safe_contribution_weight,
            vec2<bool>(contribution_weight > 0.0001)),
        dominant_layer,
        // Preserve the established cloud step normalization. Additional
        // weather work may saturate this diagnostic lane but cannot rescale a
        // weather-free frame or perturb reconstruction behavior.
        clamp(actual_steps / 144.0, 0.0, 1.0),
    );
    return output;
}
*/
`;

const CLOUD_LIGHT_VOLUME_WORLD_MEDIUM_WGSL = /* wgsl */ `
struct CloudLvTransportOptics {
    mass_extinction: vec3<f32>,
    albedo: vec3<f32>,
    asymmetry: vec3<f32>,
};

fn cloud_lv_transport_optics(
    owner_index: u32, ice_fraction_input: f32,
) -> CloudLvTransportOptics {
    let owner = cloud_optical_owners[min(owner_index, 35u)];
    let liquid_low = cloud_optical_state(owner.radius_rows.x);
    let liquid_high = cloud_optical_state(owner.radius_rows.y);
    let ice_low = cloud_optical_state(owner.radius_rows.z);
    let ice_high = cloud_optical_state(owner.radius_rows.w);
    let liquid_amount = clamp(owner.radius_interpolation.x, 0.0, 1.0);
    let ice_amount = clamp(owner.radius_interpolation.y, 0.0, 1.0);
    let ice_fraction = clamp(ice_fraction_input, 0.0, 1.0);
    let weights = vec4<f32>(
        (1.0 - ice_fraction) * (1.0 - liquid_amount),
        (1.0 - ice_fraction) * liquid_amount,
        ice_fraction * (1.0 - ice_amount),
        ice_fraction * ice_amount);
    let extinction_0 = liquid_low.extinction_and_row.rgb * weights.x;
    let extinction_1 = liquid_high.extinction_and_row.rgb * weights.y;
    let extinction_2 = ice_low.extinction_and_row.rgb * weights.z;
    let extinction_3 = ice_high.extinction_and_row.rgb * weights.w;
    let scattering_0 = extinction_0 * liquid_low.albedo_and_mean_g.rgb;
    let scattering_1 = extinction_1 * liquid_high.albedo_and_mean_g.rgb;
    let scattering_2 = extinction_2 * ice_low.albedo_and_mean_g.rgb;
    let scattering_3 = extinction_3 * ice_high.albedo_and_mean_g.rgb;
    let mass_extinction = extinction_0 + extinction_1 + extinction_2 + extinction_3;
    let scattering = scattering_0 + scattering_1 + scattering_2 + scattering_3;
    let safe_scattering = max(scattering, vec3<f32>(1e-9));
    return CloudLvTransportOptics(
        mass_extinction,
        scattering / max(mass_extinction, vec3<f32>(1e-9)),
        (scattering_0 * liquid_low.asymmetry_and_schema.rgb +
            scattering_1 * liquid_high.asymmetry_and_schema.rgb +
            scattering_2 * ice_low.asymmetry_and_schema.rgb +
            scattering_3 * ice_high.asymmetry_and_schema.rgb) / safe_scattering);
}

// A zero result is a conservative proof that the exact owner query below is
// empty. This normally duplicates only the canonical deformation and R8
// atlas-majorant portion of cloud_macro_owner_sample. Analytic Ci fibratus
// additionally uses its authoritative RGBA/SDF zero proof, but this predicate
// never evaluates exterior noise, optics, or the weather material graph.
fn cloud_lv_macro_owner_may_sample(
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding, owner_index: u32,
) -> bool {
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let base_altitude = system.vertical_extent.x;
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = local_position.xz - center;
    let undeformed_canonical = vec3<f32>(
        0.5 + dot(delta, crosswind_axis) / (2.0 * minor_radius),
        (local_position.y - base_altitude) / geometric_depth,
        0.5 + dot(delta, downwind_axis) / (2.0 * major_radius));
    if (any(undeformed_canonical < vec3<f32>(-0.13)) ||
        any(undeformed_canonical > vec3<f32>(1.13))) {
        return false;
    }
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    let topology = i32(round(atlas_binding.majorant_offset.w));
    let canonical = deform_cloud_macro_coordinate(
        undeformed_canonical, system, formation_mechanism, topology);
    if (any(canonical < vec3<f32>(-0.13)) ||
        any(canonical > vec3<f32>(1.13))) {
        return false;
    }
    let majorant_uv = clamp(canonical, vec3<f32>(0.0), vec3<f32>(1.0)) *
        atlas_binding.majorant_scale.xyz + atlas_binding.majorant_offset.xyz;
    let dimensions_u = textureDimensions(cloud_macro_majorants);
    let dimensions = vec3<i32>(dimensions_u);
    let coordinate = clamp(
        vec3<i32>(floor(majorant_uv * vec3<f32>(dimensions_u))),
        vec3<i32>(0), dimensions - vec3<i32>(1));
    if (textureLoad(cloud_macro_majorants, coordinate, 0).r <= 0.0001) {
        return false;
    }
    // Ci fibratus deliberately owns no procedural exterior: its analytic
    // fibres are restricted to the negative signed-distance support below.
    // The generic R8 majorant remains conservatively inflated for the other
    // cloud families and therefore admits a much broader shell than fibratus
    // can ever occupy. Decode the authoritative alpha/SDF here so source-grid
    // materialization does not run the eight-fibre analytic kernel for those
    // provably empty cells. This is the same sample and zero test performed by
    // cloud_macro_owner_sample, so it changes scheduling cost only—not density
    // or radiometry.
    let species = i32(round(system.identity.w));
    if (species == 1 && formation_mechanism == 3) {
        let macro_sample = cloud_macro_volume_rgba(canonical, atlas_binding);
        if (macro_sample.r <= 0.0001) { return false; }
        let owner_topology = cloud_morphology_owner_topology(owner_index);
        if (owner_topology.connectivity == 1u &&
            cloud_macro_sdf_voxels(canonical, macro_sample.a) >= 0.0) {
            return false;
        }
    }
    return true;
}

// True only for operators that can move, duplicate, reuse, or add condensate
// support. Known subtractive, coverage-only, and optical-only operations can
// never make an empty base-majorant sample non-empty. Unknown operation codes
// intentionally fall through to true so future operators fail closed.
fn cloud_lv_morphology_operation_may_change_support(operation: u32) -> bool {
    if (operation == CLOUD_MORPHOLOGY_OP_PLACE_WORLD_BANDS ||
        operation == CLOUD_MORPHOLOGY_OP_SUBTRACT_LACUNAE ||
        operation == CLOUD_MORPHOLOGY_OP_REMAP_EXTINCTION ||
        operation == CLOUD_MORPHOLOGY_OP_SEPARATE_ELEMENTS ||
        operation == CLOUD_MORPHOLOGY_OP_SUBTRACT_CAVUM) {
        return false;
    }
    return true;
}

// Cheap owner-level branch selector only; never used as an emptiness proof.
// It preserves the previous one-range-load fast path for unmodified owners
// while point-wise envelopes below decide every actual exact query.
fn cloud_lv_owner_has_support_changing_modifier(owner_index: u32) -> bool {
    let range = cloud_morphology_owner_range(owner_index);
    for (var local_index = 0u; local_index < 8u; local_index += 1u) {
        if (local_index >= range.y) { break; }
        let record = cloud_morphology_load_record(range.x + local_index);
        if (record.identity.z <= 0.0) { continue; }
        if (cloud_lv_morphology_operation_may_change_support(
            cloud_morphology_operator_code(record))) {
            return true;
        }
    }
    return false;
}

// Morphology records are finite by contract: cloud_morphology_apply_record
// evaluates this same local transform and finite envelope before dispatching
// any operator. Therefore an exact query is required only at points lying
// inside a support-changing record's envelope, rather than everywhere owned
// by any system that happens to contain such a record.
fn cloud_lv_owner_modifier_may_change_support_at(
    local_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    let range = cloud_morphology_owner_range(owner_index);
    for (var local_index = 0u; local_index < 8u; local_index += 1u) {
        if (local_index >= range.y) { break; }
        let record = cloud_morphology_load_record(range.x + local_index);
        // Zero-strength records cannot affect the evaluated morphology.
        if (record.identity.z <= 0.0) { continue; }
        let operation = cloud_morphology_operator_code(record);
        if (!cloud_lv_morphology_operation_may_change_support(operation)) {
            continue;
        }
        let modifier_local = cloud_morphology_local_position(
            record, local_position_km);
        if (cloud_morphology_finite_envelope(modifier_local) > 0.0) {
            return true;
        }
    }
    return false;
}

fn cloud_lv_owner_base_local_may_sample(
    local_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    if (owner_index >= system_count ||
        abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return false;
    }
    let system = cloud_system_buffer.systems[owner_index];
    let atlas_binding = cloud_macro_bindings.owners[owner_index];
    if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5) {
        return false;
    }
    return cloud_lv_macro_owner_may_sample(
        local_position_km, system, atlas_binding, owner_index);
}

fn cloud_lv_owner_base_may_sample(
    world_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    let local_position = vec3<f32>(world_position_km.x,
        length(world_position_km) - PLANET_RADIUS, world_position_km.z);
    return cloud_lv_owner_base_local_may_sample(local_position, owner_index);
}

fn cloud_lv_owner_may_sample(
    world_position_km: vec3<f32>, owner_index: u32,
) -> bool {
    // Share the geocentric-to-local conversion between the modifier envelope
    // and base-majorant proofs. This is exactly the coordinate supplied to
    // cloud_morphology_evaluate_owner by the full medium query.
    let local_position = vec3<f32>(world_position_km.x,
        length(world_position_km) - PLANET_RADIUS, world_position_km.z);
    if (cloud_lv_owner_modifier_may_change_support_at(
        local_position, owner_index)) {
        return true;
    }
    return cloud_lv_owner_base_local_may_sample(local_position, owner_index);
}

// The macro atlas is the conserved low-frequency condensate moment used to
// calibrate each owner's optical path. Camera transport reconstructs
// sub-voxel Ci fibratus strands from packed descriptors, but replaying that
// point-sampled eight-fibre appearance kernel at every source-grid cell is
// both spectrally wrong (the light cell is much wider than a strand) and has a
// pathological Metal execution cost. At light-volume resolution, trilinear R
// is the correct cell-filtered mass carrier; alpha supplies the identical
// signed support and G/B retain the manifest material attributes.
fn cloud_lv_filtered_fibratus_owner_sample(
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding,
) -> CloudMacroOwnerSample {
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let base_altitude = system.vertical_extent.x;
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = local_position.xz - center;
    let undeformed_canonical = vec3<f32>(
        0.5 + dot(delta, crosswind_axis) / (2.0 * minor_radius),
        (local_position.y - base_altitude) / geometric_depth,
        0.5 + dot(delta, downwind_axis) / (2.0 * major_radius));
    if (any(undeformed_canonical < vec3<f32>(-0.13)) ||
        any(undeformed_canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    let topology_code = i32(round(atlas_binding.majorant_offset.w));
    let canonical = deform_cloud_macro_coordinate(
        undeformed_canonical, system, formation_mechanism, topology_code);
    if (any(canonical < vec3<f32>(-0.13)) ||
        any(canonical > vec3<f32>(1.13))) {
        return empty_cloud_macro_owner_sample();
    }
    let macro_sample = cloud_macro_volume_rgba(canonical, atlas_binding);
    let sdf_voxels = cloud_macro_sdf_voxels(canonical, macro_sample.a);
    if (macro_sample.r <= 0.0001 || sdf_voxels >= 0.0) {
        return empty_cloud_macro_owner_sample();
    }
    var result = empty_cloud_macro_owner_sample();
    result.density = saturate(macro_sample.r);
    result.detail = saturate(macro_sample.g);
    result.ice_fraction = saturate(macro_sample.b);
    result.interior_depth_fraction = saturate(
        max(0.0, -sdf_voxels) / 47.0);
    return result;
}

fn cloud_lv_macro_owner_transport_sample(
    local_position: vec3<f32>, system: CloudSystem,
    atlas_binding: CloudMacroBinding, genus: i32, owner_index: u32,
) -> CloudMacroOwnerSample {
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    let species = i32(round(system.identity.w));
    let owner_topology = cloud_morphology_owner_topology(owner_index);
    if (species == 1 && formation_mechanism == 3 &&
        owner_topology.connectivity == 1u) {
        return cloud_lv_filtered_fibratus_owner_sample(
            local_position, system, atlas_binding);
    }
    return cloud_macro_owner_sample(
        local_position, system, atlas_binding, genus, owner_index,
        0.0, 0.0, vec3<f32>(0.0));
}

fn cloud_lv_query_world_medium(
    world_position_km: vec3<f32>, owner_index: u32,
) -> CloudLvWorldMedium {
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    if (owner_index >= system_count ||
        abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let system = cloud_system_buffer.systems[owner_index];
    let atlas_binding = cloud_macro_bindings.owners[owner_index];
    if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let local_position = vec3<f32>(world_position_km.x,
        length(world_position_km) - PLANET_RADIUS, world_position_km.z);
    let genus = i32(round(system.identity.z));
    let morphology = cloud_morphology_evaluate_owner(owner_index, local_position);
    // A modifier record with no base, placement, reuse, or additive support
    // cannot create condensate. Subtractive and optical-only records only
    // alter material that already exists, so this is an exact zero proof
    // before any atlas/SDF/noise access.
    if (morphology.base_coverage <= 0.0001 &&
        morphology.placement_weight <= 0.0001 &&
        morphology.reuse_weight <= 0.0001 &&
        morphology.additive_density <= 0.0001) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    var base_sample = empty_cloud_macro_owner_sample();
    if (morphology.base_coverage > 0.0001) {
        base_sample = cloud_lv_macro_owner_transport_sample(
            morphology.base_position_km, system, atlas_binding, genus,
            owner_index);
    }
    var placement_sample = empty_cloud_macro_owner_sample();
    if (morphology.placement_weight > 0.0001) {
        placement_sample = cloud_lv_macro_owner_transport_sample(
            morphology.placement_position_km, system, atlas_binding, genus,
            owner_index);
    }
    var reuse_sample = empty_cloud_macro_owner_sample();
    if (morphology.reuse_weight > 0.0001) {
        reuse_sample = cloud_lv_macro_owner_transport_sample(
            local_position, system, atlas_binding, genus, owner_index);
    }
    let density = cloud_morphology_compose_density(
        morphology, base_sample.density, placement_sample.density,
        reuse_sample.density);
    if (density <= 0.0001) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let fallback_ice = saturate(1.0 - system.optical_material.y);
    let base_weight = base_sample.density * morphology.base_coverage;
    let placement_weight = placement_sample.density * morphology.placement_weight;
    let reuse_weight = reuse_sample.density * morphology.reuse_weight;
    let additive_weight = morphology.additive_density;
    let attribute_weight = base_weight + placement_weight + reuse_weight +
        additive_weight;
    let local_ice = select(fallback_ice,
        (base_sample.ice_fraction * (base_weight + additive_weight) +
            placement_sample.ice_fraction * placement_weight +
            reuse_sample.ice_fraction * reuse_weight) /
            max(0.0001, attribute_weight),
        attribute_weight > 0.0001);
    let optics = cloud_lv_transport_optics(owner_index, local_ice);
    var scalar_extinction =
        cloud_owner_extinction_coefficient_from_mass_extinction(
            system, atlas_binding, local_ice, optics.mass_extinction);
    if (morphology.target_optical_depth >= 0.0 &&
        morphology.optical_weight > 0.0001) {
        let remapped = morphology.target_optical_depth /
            max(0.0001, system.vertical_extent.y *
                atlas_binding.condensate_paths.x);
        scalar_extinction = mix(scalar_extinction, remapped,
            saturate(morphology.optical_weight));
    }
    let photopic_mass_extinction = dot(
        optics.mass_extinction, vec3<f32>(0.2126, 0.7152, 0.0722));
    let extinction = density * scalar_extinction * optics.mass_extinction /
        max(1e-8, photopic_mass_extinction);
    return CloudLvWorldMedium(
        max(vec3<f32>(0.0), extinction),
        max(vec3<f32>(0.0), extinction * optics.albedo),
        clamp(optics.asymmetry, vec3<f32>(-0.99), vec3<f32>(0.99)),
        saturate(density));
}
`;

// Source-aligned light cells are much wider than individual Ci fibratus
// strands. Their correct transport carrier is the generated atlas' conserved,
// trilinearly filtered low-frequency mass—not the camera-facing analytic
// fibre kernel. Keeping this query in a distinct WGSL module also means Metal
// can never lower the generic morphology/camera graph for fibratus source
// materialization. Canonical support, the R8 majorant, atlas R, and packed SDF
// all fail closed before optical storage is touched.
const CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_MEDIUM_WGSL = /* wgsl */ `
struct CloudLvFibratusTransportOptics {
    mass_extinction: vec3<f32>,
    albedo: vec3<f32>,
    asymmetry: vec3<f32>,
};

fn cloud_lv_fibratus_transport_optics(
    owner_index: u32, ice_fraction_input: f32,
) -> CloudLvFibratusTransportOptics {
    let owner = cloud_optical_owners[min(owner_index, 35u)];
    let liquid_low = cloud_optical_state(owner.radius_rows.x);
    let liquid_high = cloud_optical_state(owner.radius_rows.y);
    let ice_low = cloud_optical_state(owner.radius_rows.z);
    let ice_high = cloud_optical_state(owner.radius_rows.w);
    let liquid_amount = clamp(owner.radius_interpolation.x, 0.0, 1.0);
    let ice_amount = clamp(owner.radius_interpolation.y, 0.0, 1.0);
    let ice_fraction = clamp(ice_fraction_input, 0.0, 1.0);
    let weights = vec4<f32>(
        (1.0 - ice_fraction) * (1.0 - liquid_amount),
        (1.0 - ice_fraction) * liquid_amount,
        ice_fraction * (1.0 - ice_amount),
        ice_fraction * ice_amount);
    let extinction_0 = liquid_low.extinction_and_row.rgb * weights.x;
    let extinction_1 = liquid_high.extinction_and_row.rgb * weights.y;
    let extinction_2 = ice_low.extinction_and_row.rgb * weights.z;
    let extinction_3 = ice_high.extinction_and_row.rgb * weights.w;
    let scattering_0 = extinction_0 * liquid_low.albedo_and_mean_g.rgb;
    let scattering_1 = extinction_1 * liquid_high.albedo_and_mean_g.rgb;
    let scattering_2 = extinction_2 * ice_low.albedo_and_mean_g.rgb;
    let scattering_3 = extinction_3 * ice_high.albedo_and_mean_g.rgb;
    let mass_extinction =
        extinction_0 + extinction_1 + extinction_2 + extinction_3;
    let scattering =
        scattering_0 + scattering_1 + scattering_2 + scattering_3;
    return CloudLvFibratusTransportOptics(
        mass_extinction,
        scattering / max(mass_extinction, vec3<f32>(1e-9)),
        (scattering_0 * liquid_low.asymmetry_and_schema.rgb +
            scattering_1 * liquid_high.asymmetry_and_schema.rgb +
            scattering_2 * ice_low.asymmetry_and_schema.rgb +
            scattering_3 * ice_high.asymmetry_and_schema.rgb) /
            max(scattering, vec3<f32>(1e-9)));
}

fn cloud_lv_query_source_world_medium(
    world_position_km: vec3<f32>, owner_index: u32,
    ray_step_length_km: f32, ray_direction_world: vec3<f32>,
) -> CloudLvWorldMedium {
    // Source cells integrate this density over their exact world-space step
    // later in the Beer prefix. Reintroducing a point fibre based on either
    // value here would alias sub-cell anatomy and break conserved atlas mass.
    _ = ray_step_length_km;
    _ = ray_direction_world;
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    if (owner_index >= system_count ||
        abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let system = cloud_system_buffer.systems[owner_index];
    let atlas_binding = cloud_macro_bindings.owners[owner_index];
    let species = i32(round(system.identity.w));
    let formation_mechanism = i32(round(atlas_binding.majorant_scale.w));
    if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5 ||
        species != 1 || formation_mechanism != 3) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }

    let local_position = vec3<f32>(world_position_km.x,
        length(world_position_km) - PLANET_RADIUS, world_position_km.z);
    let center = system.horizontal_extent.xy;
    let major_radius = max(0.04, system.horizontal_extent.z);
    let minor_radius = max(0.04, system.horizontal_extent.w);
    let base_altitude = system.vertical_extent.x;
    let geometric_depth = max(0.02, system.vertical_extent.y);
    let orientation = system.vertical_extent.z;
    let downwind_axis = vec2<f32>(cos(orientation), sin(orientation));
    let crosswind_axis = vec2<f32>(-downwind_axis.y, downwind_axis.x);
    let delta = local_position.xz - center;
    let undeformed = vec3<f32>(
        0.5 + dot(delta, crosswind_axis) / (2.0 * minor_radius),
        (local_position.y - base_altitude) / geometric_depth,
        0.5 + dot(delta, downwind_axis) / (2.0 * major_radius));
    if (any(undeformed < vec3<f32>(-0.13)) ||
        any(undeformed > vec3<f32>(1.13))) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }

    // Exact formation-three inverse deformation, copied without any call into
    // the shared topology/noise function graph.
    let fall_fraction = 1.0 - undeformed.y;
    let shear = clamp(system.kinematics.z * 0.16, -0.42, 0.42);
    let sedimentation = clamp(
        system.precipitation.z / max(2.0, system.kinematics.x), 0.0, 1.4);
    var canonical = undeformed;
    canonical.z -= fall_fraction * sedimentation * 0.24;
    canonical.x += (undeformed.y - 0.5) * shear * 0.46 +
        sin(undeformed.y * 6.283185307179586 +
            system.deterministic_seeds.z * 6.283185307179586) *
            fall_fraction * 0.025;
    if (any(canonical < vec3<f32>(-0.13)) ||
        any(canonical > vec3<f32>(1.13))) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }

    let storage_coordinate = clamp(
        canonical, vec3<f32>(0.0), vec3<f32>(1.0));
    let majorant_uv = storage_coordinate * atlas_binding.majorant_scale.xyz +
        atlas_binding.majorant_offset.xyz;
    let majorant_dimensions_u = textureDimensions(cloud_macro_majorants);
    let majorant_dimensions = vec3<i32>(majorant_dimensions_u);
    let majorant_coordinate = clamp(
        vec3<i32>(floor(majorant_uv * vec3<f32>(majorant_dimensions_u))),
        vec3<i32>(0), majorant_dimensions - vec3<i32>(1));
    if (textureLoad(
            cloud_macro_majorants, majorant_coordinate, 0).r <= 0.0001) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }

    let atlas_uv = storage_coordinate * atlas_binding.atlas_scale.xyz +
        atlas_binding.atlas_offset.xyz;
    let macro_sample = textureSampleLevel(
        cloud_macro_atlas, cloud_macro_sampler, atlas_uv, 0.0);
    let sdf_voxels =
        (macro_sample.a * 255.0 - 128.0) / 127.0 *
            max(1.0, cloud_macro_bindings.header.w) +
        length(canonical - storage_coordinate) * 47.0;
    if (macro_sample.r <= 0.0001 || sdf_voxels >= 0.0) {
        return CloudLvWorldMedium(
            vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }

    let density = saturate(macro_sample.r);
    let local_ice = saturate(macro_sample.b);
    let optics = cloud_lv_fibratus_transport_optics(owner_index, local_ice);
    let scalar_extinction =
        cloud_owner_extinction_coefficient_from_mass_extinction(
            system, atlas_binding, local_ice, optics.mass_extinction);
    let photopic_mass_extinction = dot(
        optics.mass_extinction, vec3<f32>(0.2126, 0.7152, 0.0722));
    let extinction = density * scalar_extinction * optics.mass_extinction /
        max(1e-8, photopic_mass_extinction);
    return CloudLvWorldMedium(
        max(vec3<f32>(0.0), extinction),
        max(vec3<f32>(0.0), extinction * optics.albedo),
        clamp(optics.asymmetry, vec3<f32>(-0.99), vec3<f32>(0.99)),
        density);
}
`;

const CLOUD_LIGHT_VOLUME_SOURCE_IRRADIANCE_WGSL = /* wgsl */ `
fn cloud_lv_source_irradiance_at(
    world_position_km: vec3<f32>, source_index: u32,
) -> vec3<f32> {
    return physical_source_irradiance_at(min(1u, source_index), world_position_km);
}
`;

const CLOUD_LIGHT_VOLUME_BOUNDARY_PROJECTION_WGSL = /* wgsl */ `
fn cloud_lv_resident_scene_medium(
    world_position_km: vec3<f32>,
) -> CloudLvWorldMedium {
    var extinction = vec3<f32>(0.0);
    var scattering = vec3<f32>(0.0);
    var asymmetry_scattering = vec3<f32>(0.0);
    var occupancy = 0.0;
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
        let medium = cloud_lv_query_world_medium(world_position_km, owner);
        let sigma_s = max(vec3<f32>(0.0), medium.scattering_rgb_per_km);
        extinction += max(vec3<f32>(0.0), medium.extinction_rgb_per_km);
        scattering += sigma_s;
        asymmetry_scattering += medium.asymmetry_rgb * sigma_s;
        occupancy = max(occupancy, medium.occupancy);
    }
    return CloudLvWorldMedium(
        extinction,
        min(extinction, scattering),
        asymmetry_scattering / max(vec3<f32>(1e-6), scattering),
        occupancy,
    );
}

fn cloud_lv_transform_ray_exit(
    transform: CloudLvTransform,
    world_position_km: vec3<f32>,
    world_direction: vec3<f32>,
) -> f32 {
    let delta = world_position_km - transform.origin_active.xyz;
    let origin_cells = vec3<f32>(
        dot(delta, transform.axis_x_cell.xyz) /
            max(1e-8, transform.axis_x_cell.w),
        dot(delta, transform.axis_y_cell.xyz) /
            max(1e-8, transform.axis_y_cell.w),
        dot(delta, transform.axis_z_cell.xyz) /
            max(1e-8, transform.axis_z_cell.w));
    let direction_cells = vec3<f32>(
        dot(world_direction, transform.axis_x_cell.xyz) /
            max(1e-8, transform.axis_x_cell.w),
        dot(world_direction, transform.axis_y_cell.xyz) /
            max(1e-8, transform.axis_y_cell.w),
        dot(world_direction, transform.axis_z_cell.xyz) /
            max(1e-8, transform.axis_z_cell.w));
    let dimensions = vec3<f32>(f32(CLOUD_LV_WIDTH),
        f32(CLOUD_LV_HEIGHT), f32(CLOUD_LV_DEPTH));
    var near_t = -1e20;
    var far_t = 1e20;
    for (var axis = 0u; axis < 3u; axis += 1u) {
        if (abs(direction_cells[axis]) < 1e-8) {
            if (origin_cells[axis] < 0.0 ||
                origin_cells[axis] > dimensions[axis]) { return 0.0; }
            continue;
        }
        let first = -origin_cells[axis] / direction_cells[axis];
        let second = (dimensions[axis] - origin_cells[axis]) /
            direction_cells[axis];
        near_t = max(near_t, min(first, second));
        far_t = min(far_t, max(first, second));
    }
    if (far_t <= max(0.0, near_t)) { return 0.0; }
    return max(0.0, far_t);
}

fn cloud_lv_environment_radiance(
    world_position_km: vec3<f32>, atmosphere_direction: vec3<f32>,
) -> vec3<f32> {
    let atmosphere_position = renderer_to_atmosphere_world(world_position_km);
    let local_up = normalize(atmosphere_position);
    let altitude_km = max(0.0,
        length(atmosphere_position) - physical_atmosphere.radii_scales.x);
    var radiance = vec3<f32>(0.0);
    for (var lobe_index = 0u; lobe_index < COUPLING_ACTIVE_LOBE_COUNT;
        lobe_index += 1u) {
        radiance += coupling_directional_sky_lobe_radiance(
            coupling_profile_lobe(lobe_index, altitude_km),
            atmosphere_direction);
    }
    if (dot(atmosphere_direction, local_up) < 0.0) {
        radiance += physical_ground_irradiance_at(world_position_km) / PI;
    }
    return max(vec3<f32>(0.0), radiance);
}

// Finite formal-solution fallback for an omitted neighbour tile. It traces
// the actual remaining owner OBB, accumulates exact resident-owner extinction,
// exact Sun/Moon Beer and phase, and the existing passive diffuse closure. It
// has no empirical boundary multiplier and cannot inject clear sky through a
// dense truncated face.
fn cloud_lv_truncated_directional_radiance(
    brick: CloudLvBrick,
    center: vec3<f32>,
    atmosphere_direction: vec3<f32>,
) -> vec3<f32> {
    let world_direction = normalize(vec3<f32>(atmosphere_direction.x,
        atmosphere_direction.z, atmosphere_direction.y));
    let start = center + world_direction * 1e-4;
    let distance = cloud_lv_transform_ray_exit(
        brick.direct_0, start, world_direction);
    if (distance <= 1e-5) {
        return cloud_lv_environment_radiance(center, atmosphere_direction);
    }
    let step_length = distance / 8.0;
    var path_transmittance = vec3<f32>(1.0);
    var radiance = vec3<f32>(0.0);
    var scalar_optical_depth = 0.0;
    for (var step = 0u; step < 8u; step += 1u) {
        let point = start + world_direction *
            ((f32(step) + 0.5) * step_length);
        let medium = cloud_lv_resident_scene_medium(point);
        let extinction = max(vec3<f32>(0.0), medium.extinction_rgb_per_km);
        let scattering = clamp(medium.scattering_rgb_per_km,
            vec3<f32>(0.0), extinction);
        let segment_t = exp(-min(vec3<f32>(24.0),
            extinction * step_length));
        let albedo = scattering / max(vec3<f32>(1e-6), extinction);
        var direct_source_radiance = vec3<f32>(0.0);
        for (var source_index = 0u; source_index < 2u; source_index += 1u) {
            if (cloud_lv_sources[source_index].direction_active.w <= 0.5) {
                continue;
            }
            let cosine = clamp(dot(world_direction,
                cloud_lv_sources[source_index].direction_active.xyz), -1.0, 1.0);
            let phase = vec3<f32>(
                cloud_henyey_greenstein(cosine, medium.asymmetry_rgb.r),
                cloud_henyey_greenstein(cosine, medium.asymmetry_rgb.g),
                cloud_henyey_greenstein(cosine, medium.asymmetry_rgb.b));
            direct_source_radiance += cloud_lv_source_irradiance_at(
                point, source_index) *
                cloud_lv_all_owner_direct_transmittance(point, source_index) *
                phase;
        }
        let local_optics = CloudLocalOptics(
            vec3<f32>(1.0), albedo, medium.asymmetry_rgb,
            vec3<f32>(0.07957747154594767), 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
        let diffuse_incident = (
            physical_diffuse_irradiance_at(point) +
            physical_lower_atmosphere_irradiance_at(point) +
            physical_ground_irradiance_at(point)) / PI;
        let diffuse_source_radiance = diffuse_incident *
            cloud_passive_diffuse_scattering_transport(
                local_optics, scalar_optical_depth);
        let source_radiance = albedo * direct_source_radiance +
            diffuse_source_radiance;
        radiance += path_transmittance * source_radiance *
            (vec3<f32>(1.0) - segment_t);
        path_transmittance *= segment_t;
        scalar_optical_depth += dot(extinction,
            vec3<f32>(0.2126, 0.7152, 0.0722)) * step_length;
    }
    let far_point = start + world_direction * distance;
    radiance += path_transmittance * cloud_lv_environment_radiance(
        far_point, atmosphere_direction);
    return max(vec3<f32>(0.0), radiance);
}

fn cloud_lv_project_face_irradiance(
    brick_index: u32, face_index: u32,
) -> vec3<f32> {
    let brick = cloud_lv_bricks[brick_index];
    var face_center_cells = vec3<f32>(
        f32(CLOUD_LV_WIDTH) * 0.5,
        f32(CLOUD_LV_HEIGHT) * 0.5,
        f32(CLOUD_LV_DEPTH) * 0.5);
    let face_axis = min(2u, face_index / 2u);
    let positive_face = (face_index & 1u) == 0u;
    if (face_axis == 0u) {
        face_center_cells.x = select(0.5, f32(CLOUD_LV_WIDTH) - 0.5,
            positive_face);
    } else if (face_axis == 1u) {
        face_center_cells.y = select(0.5, f32(CLOUD_LV_HEIGHT) - 0.5,
            positive_face);
    } else {
        face_center_cells.z = select(0.5, f32(CLOUD_LV_DEPTH) - 0.5,
            positive_face);
    }
    let center = cloud_lv_world_position(brick.diffusion, face_center_cells);
    var normal_renderer = brick.diffusion.axis_x_cell.xyz;
    if (face_axis == 1u) {
        normal_renderer = brick.diffusion.axis_y_cell.xyz;
    } else if (face_axis == 2u) {
        normal_renderer = brick.diffusion.axis_z_cell.xyz;
    }
    if (!positive_face) { normal_renderer = -normal_renderer; }
    let boundary_kind = u32(round(cloud_lv_face_record(
        brick, face_index).w));

    let normal = normalize(vec3<f32>(
        normal_renderer.x, normal_renderer.z, normal_renderer.y));
    if (boundary_kind == CLOUD_LV_BOUNDARY_INTERNAL) {
        return vec3<f32>(0.0);
    }
    var irradiance = vec3<f32>(0.0);
    if (boundary_kind == CLOUD_LV_BOUNDARY_TRUNCATED) {
        // Sixteen angular nodes times eight finite-path nodes bounds a whole
        // brick projection below one ordinary material slab's exact queries.
        for (var sample_index = 0u; sample_index < 16u; sample_index += 1u) {
            let vertical = 1.0 - 2.0 * (f32(sample_index) + 0.5) / 16.0;
            let radius = sqrt(max(0.0, 1.0 - vertical * vertical));
            let azimuth = f32(sample_index) * PI * (3.0 - sqrt(5.0));
            let direction = vec3<f32>(
                radius * cos(azimuth), radius * sin(azimuth), vertical);
            let radiance = cloud_lv_truncated_directional_radiance(
                brick, center, direction);
            irradiance += radiance * max(0.0, dot(normal, direction)) *
                (4.0 * PI / 16.0);
        }
        return max(vec3<f32>(0.0), irradiance);
    }
    for (var sample_index = 0u; sample_index < 64u; sample_index += 1u) {
        let vertical = 1.0 - 2.0 * (f32(sample_index) + 0.5) / 64.0;
        let radius = sqrt(max(0.0, 1.0 - vertical * vertical));
        let azimuth = f32(sample_index) * PI * (3.0 - sqrt(5.0));
        let direction = vec3<f32>(
            radius * cos(azimuth), radius * sin(azimuth), vertical);
        let radiance = cloud_lv_environment_radiance(center, direction);
        irradiance += max(vec3<f32>(0.0), radiance) *
            max(0.0, dot(normal, direction)) * (4.0 * PI / 64.0);
    }
    return max(vec3<f32>(0.0), irradiance);
}
`;

/**
 * Return a WGSL module without one shader-stage entry point. The production
 * view marcher is compiled from a module that has no lighting, coupling, or
 * three-layer entry graph for Metal to lower speculatively.
 */
const withoutWgslEntryPoint = (source: string, entryPoint: string) => {
    const functionOffset = source.indexOf(`fn ${entryPoint}(`);
    if (functionOffset < 0) {
        throw new Error(`Missing WGSL entry point ${entryPoint}`);
    }
    const stageOffset = Math.max(
        source.lastIndexOf("@fragment", functionOffset),
        source.lastIndexOf("@compute", functionOffset),
        source.lastIndexOf("@vertex", functionOffset),
    );
    if (stageOffset < 0) {
        throw new Error(`Missing WGSL stage attribute for ${entryPoint}`);
    }
    const lineOffset = source.lastIndexOf("\n", stageOffset) + 1;
    const bodyOffset = source.indexOf("{", functionOffset);
    if (bodyOffset < 0) {
        throw new Error(`Missing WGSL body for ${entryPoint}`);
    }
    let depth = 0;
    let endOffset = bodyOffset;
    for (; endOffset < source.length; endOffset += 1) {
        if (source[endOffset] === "{") depth += 1;
        if (source[endOffset] === "}") {
            depth -= 1;
            if (depth === 0) {
                endOffset += 1;
                break;
            }
        }
    }
    if (depth !== 0) {
        throw new Error(`Unbalanced WGSL body for ${entryPoint}`);
    }
    return source.slice(0, lineOffset) + source.slice(endOffset);
};

const withoutWgslSection = (
    source: string,
    firstToken: string,
    nextToken: string,
) => {
    const firstOffset = source.indexOf(firstToken);
    const nextOffset = source.indexOf(nextToken, firstOffset + firstToken.length);
    if (firstOffset < 0 || nextOffset < 0) {
        throw new Error(`Missing WGSL section ${firstToken} -> ${nextToken}`);
    }
    return source.slice(0, firstOffset) + source.slice(nextOffset);
};

const withoutWgslBlockComments = (source: string) => {
    const output: string[] = [];
    let commentDepth = 0;
    for (let offset = 0; offset < source.length; offset += 1) {
        const pair = source.slice(offset, offset + 2);
        if (pair === "/*") {
            commentDepth += 1;
            offset += 1;
            continue;
        }
        if (pair === "*/" && commentDepth > 0) {
            commentDepth -= 1;
            offset += 1;
            continue;
        }
        if (commentDepth === 0) output.push(source[offset]);
    }
    if (commentDepth !== 0) {
        throw new Error("Unbalanced WGSL block comment");
    }
    return output.join("");
};

const productionCloudEntryOffset = WEBGPU_CLOUD_SHADER.indexOf(
    "@fragment\nfn cloud_fragment_physical_layers(",
);
if (productionCloudEntryOffset < 0) {
    throw new Error("Missing monolithic production cloud entry point");
}

// Lighting and coupling still share their mature density/material helpers,
// but the auxiliary module no longer exposes the expensive three-layer view
// entry. No production pipeline compiles that entry point.
export const WEBGPU_CLOUD_AUXILIARY_SHADER = withoutWgslEntryPoint(
    WEBGPU_CLOUD_SHADER,
    "cloud_fragment_physical_layers",
) + WEATHER_PRODUCTION_TRANSPORT_WGSL;

const CLOUD_LAYER_FULLSCREEN_VERTEX = /* wgsl */ `
struct VertexOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) @interpolate(flat) production_layer_index: u32,
};

@vertex
fn fullscreen_vertex(
    @builtin(vertex_index) index: u32,
    @builtin(instance_index) production_layer_index: u32,
) -> VertexOut {
    let points = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var output: VertexOut;
    output.position = vec4<f32>(points[index], 0.0, 1.0);
    output.uv = points[index] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
    output.production_layer_index = production_layer_index;
    return output;
}
`;

const productionCloudLayerCore = withoutWgslBlockComments(withoutWgslEntryPoint(
    withoutWgslSection(
        withoutWgslSection(
        WEBGPU_CLOUD_SHADER.slice(0, productionCloudEntryOffset),
            "// World-space source-aligned cascades are written by the same density",
            "fn lighting_for_layer(",
        ),
        "fn lighting_for_layer(",
        "@fragment\nfn cloud_lighting_fragment(",
    ),
    "cloud_lighting_fragment",
)).replace(FULLSCREEN_VERTEX, CLOUD_LAYER_FULLSCREEN_VERTEX);

/**
 * Isolated production view transport. The first-instance index selects one
 * physical layer without a specialization constant, so one pipeline retains
 * the exact single march_layer call used by all three packet destinations.
 * The results are encoded into the smallest lossless RGBA16F packet layout
 * used by the compositor below.
 */
export const WEBGPU_CLOUD_LAYER_SHADER = productionCloudLayerCore +
    WEATHER_PRODUCTION_TRANSPORT_WGSL + /* wgsl */ `
struct CloudLayerOutput {
    // RGB in-scattered radiance and first interaction depth.
    @location(0) radiance_first_depth: vec4<f32>,
    // RGB spectral transmittance and contribution-weighted mean depth.
    @location(1) transmittance_mean_depth: vec4<f32>,
    // Screen velocity, evaluated step count, reserved.
    @location(2) motion_steps: vec4<f32>,
};

fn encode_cloud_layer_packet(packet: LayerPacket) -> CloudLayerOutput {
    var output: CloudLayerOutput;
    output.radiance_first_depth = vec4<f32>(
        packet.transport.radiance, packet.first_depth);
    output.transmittance_mean_depth = vec4<f32>(
        packet.transport.transmittance, packet.mean_depth);
    output.motion_steps = vec4<f32>(
        packet.velocity, packet.evaluated_steps, 0.0);
    return output;
}

fn empty_cloud_layer_output(production_layer_index: u32) -> CloudLayerOutput {
    return encode_cloud_layer_packet(LayerPacket(
        camera_transport_identity(), FAR_LIMIT, FAR_LIMIT, 0.0,
        vec2<f32>(0.0), f32(production_layer_index), 0.0));
}

@fragment
fn cloud_fragment_physical_layer(input: VertexOut) -> CloudLayerOutput {
    let production_layer_index = input.production_layer_index;
    let pixel = floor(input.position.xy);
    let interleaved_transport = p[30].y > 0.5;
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (interleaved_transport && checker != 0) { discard; }

    // Preserve the complete production binding/finite-input contract. Exact
    // curved intervals are intentionally recomputed for the one shared ray.
    let interval_low_middle = textureLoad(
        cloud_interval_low_middle, vec2<i32>(pixel), 0);
    let interval_high_mask = textureLoad(
        cloud_interval_high_mask, vec2<i32>(pixel), 0);
    if (production_layer_index > 2u ||
        !finite_scalar(interval_low_middle.x) ||
        !finite_scalar(interval_low_middle.y) ||
        !finite_scalar(interval_low_middle.z) ||
        !finite_scalar(interval_low_middle.w) ||
        !finite_scalar(interval_high_mask.x) ||
        !finite_scalar(interval_high_mask.y) ||
        !finite_scalar(interval_high_mask.z) ||
        !finite_scalar(interval_high_mask.w) ||
        !finite_scalar(hydrometeor_fields.header.x)) {
        return empty_cloud_layer_output(production_layer_index);
    }

    let direction = view_direction(input.uv);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64,
        i32(pixel.y) % 64,
    );
    let blue_noise = textureLoad(blue_noise_texture, blue_noise_cell, 0).r;
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);
    let layer_index = i32(production_layer_index);
    return encode_cloud_layer_packet(production_layer_packet(
        origin, direction, input.uv, layer_index,
        sun_direction, moon_direction, jitter));
}
`;

/**
 * Shipping weather media are compiled as two bounded entry graphs.  Both use
 * the same mature density/optics/atmosphere foundation as cloud transport,
 * but neither can make Metal lower the three cloud marches or the former
 * monolithic 172-record event graph.
 */
export const WEBGPU_HYDROMETEOR_LAYER_SHADER =
    productionCloudLayerCore +
    WEATHER_PRODUCTION_TRANSPORT_WGSL +
    SPECIALIZED_WEATHER_TRANSPORT_COMMON_WGSL +
    SPECIALIZED_HYDROMETEOR_TRANSPORT_WGSL;

export const WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER =
    productionCloudLayerCore +
    WEATHER_PRODUCTION_TRANSPORT_WGSL +
    SPECIALIZED_WEATHER_TRANSPORT_COMMON_WGSL +
    SPECIALIZED_UPPER_ATMOSPHERE_TRANSPORT_WGSL;

/**
 * Marcher-free fixed-size compositor for cloud and finite weather operators.
 * Its output is byte-for-byte the existing raw cloud attachment ABI.
 */
export const WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var layer_radiance_first_depth:
    texture_2d_array<f32>;
@group(0) @binding(1) var layer_transmittance_mean_depth:
    texture_2d_array<f32>;
@group(0) @binding(2) var layer_motion_steps: texture_2d_array<f32>;
@group(0) @binding(3) var<storage, read> p: array<vec4<f32>>;

const FAR_LIMIT: f32 = 140.0;
const MEDIA_FAR_LIMIT: f32 = 1300.0;

struct CameraTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
};

struct LayerPacket {
    transport: CameraTransport,
    first_depth: f32,
    mean_depth: f32,
    opacity_y: f32,
    velocity: vec2<f32>,
    layer_identifier: f32,
    sort_identifier: f32,
    evaluated_steps: f32,
};

struct CloudOutput {
    @location(0) radiance: vec4<f32>,
    @location(1) transmittance: vec4<f32>,
    @location(2) geometry: vec4<f32>,
    @location(3) motion: vec4<f32>,
};

fn photopic(value: vec3<f32>) -> f32 {
    return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn decode_layer_packet(pixel: vec2<i32>, layer: i32) -> LayerPacket {
    let radiance_depth = textureLoad(
        layer_radiance_first_depth, pixel, layer, 0);
    let transmittance_depth = textureLoad(
        layer_transmittance_mean_depth, pixel, layer, 0);
    let motion_steps = textureLoad(layer_motion_steps, pixel, layer, 0);
    let transmittance = clamp(
        transmittance_depth.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let physical_layer_identifier = select(
        f32(layer), motion_steps.w, layer >= 3);
    return LayerPacket(
        CameraTransport(radiance_depth.rgb, transmittance),
        radiance_depth.a,
        transmittance_depth.a,
        1.0 - clamp(photopic(transmittance), 0.0, 1.0),
        motion_steps.xy,
        physical_layer_identifier,
        f32(layer),
        max(0.0, motion_steps.z),
    );
}

fn layer_packet_precedes(first: LayerPacket, second: LayerPacket) -> bool {
    return first.first_depth < second.first_depth ||
        (first.first_depth == second.first_depth &&
            first.sort_identifier < second.sort_identifier);
}

fn accumulate_layer_packet(
    scene_transport: ptr<function, CameraTransport>,
    first_depth: ptr<function, f32>,
    weighted_mean_depth: ptr<function, f32>,
    blended_velocity: ptr<function, vec2<f32>>,
    contribution_weight: ptr<function, f32>,
    dominant_contribution: ptr<function, f32>,
    dominant_layer: ptr<function, f32>,
    packet: LayerPacket,
) {
    let front = *scene_transport;
    let extinction_contribution = max(0.0, photopic(
        front.transmittance *
        (vec3<f32>(1.0) - packet.transport.transmittance)));
    // Emissive media such as aurora carry no fictitious opacity. Their scene-
    // linear radiance still needs depth/motion ownership so temporal resolve
    // and diagnostics do not classify a visible curtain as empty sky.
    let emission_contribution = max(0.0, photopic(
        front.transmittance * packet.transport.radiance));
    let contribution = max(extinction_contribution, emission_contribution);
    *scene_transport = CameraTransport(
        front.radiance + front.transmittance * packet.transport.radiance,
        front.transmittance * packet.transport.transmittance,
    );
    if (contribution > 0.0001 && packet.mean_depth < MEDIA_FAR_LIMIT) {
        *first_depth = select(
            packet.first_depth,
            min(*first_depth, packet.first_depth),
            *contribution_weight > 0.0001);
        *weighted_mean_depth += packet.mean_depth * contribution;
        *blended_velocity += packet.velocity * contribution;
        *contribution_weight += contribution;
    }
    if (contribution > *dominant_contribution) {
        *dominant_contribution = contribution;
        *dominant_layer = packet.layer_identifier;
    }
}

@fragment
fn cloud_layer_composite_fragment(input: VertexOut) -> CloudOutput {
    let pixel = vec2<i32>(floor(input.position.xy));
    let transport_phase = i32(round(p[30].z));
    let checker = (pixel.x + pixel.y + transport_phase) % 2;
    if (p[30].y > 0.5 && checker != 0) { discard; }

    // Scalar packets and a fixed insertion network avoid private arrays while
    // preserving physical first-interaction order for crossing curved shells,
    // bounded hydrometeors, and upper-atmosphere wave media.
    var first = decode_layer_packet(pixel, 0);
    var second = decode_layer_packet(pixel, 1);
    var third = decode_layer_packet(pixel, 2);
    var fourth = decode_layer_packet(pixel, 3);
    var fifth = decode_layer_packet(pixel, 4);
    // Preserve the previous three-cloud ordering network byte-for-byte.
    if (layer_packet_precedes(second, first)) {
        let swap = first;
        first = second;
        second = swap;
    }
    if (layer_packet_precedes(third, second)) {
        let swap = second;
        second = third;
        third = swap;
    }
    if (layer_packet_precedes(second, first)) {
        let swap = first;
        first = second;
        second = swap;
    }
    // Insert hydrometeor and upper-atmosphere packets in depth order. Empty
    // packets are exact affine identities, so a weather-free scene retains
    // the preceding three-packet transport path unchanged.
    if (layer_packet_precedes(fourth, third)) {
        let swap = third;
        third = fourth;
        fourth = swap;
    }
    if (layer_packet_precedes(third, second)) {
        let swap = second;
        second = third;
        third = swap;
    }
    if (layer_packet_precedes(second, first)) {
        let swap = first;
        first = second;
        second = swap;
    }
    if (layer_packet_precedes(fifth, fourth)) {
        let swap = fourth;
        fourth = fifth;
        fifth = swap;
    }
    if (layer_packet_precedes(fourth, third)) {
        let swap = third;
        third = fourth;
        fourth = swap;
    }
    if (layer_packet_precedes(third, second)) {
        let swap = second;
        second = third;
        third = swap;
    }
    if (layer_packet_precedes(second, first)) {
        let swap = first;
        first = second;
        second = swap;
    }

    var scene_transport = CameraTransport(vec3<f32>(0.0), vec3<f32>(1.0));
    var first_depth = FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var blended_velocity = vec2<f32>(0.0);
    var contribution_weight = 0.0;
    var dominant_contribution = 0.0;
    var dominant_layer = -1.0;
    accumulate_layer_packet(
        &scene_transport, &first_depth, &weighted_mean_depth,
        &blended_velocity, &contribution_weight,
        &dominant_contribution, &dominant_layer, first);
    accumulate_layer_packet(
        &scene_transport, &first_depth, &weighted_mean_depth,
        &blended_velocity, &contribution_weight,
        &dominant_contribution, &dominant_layer, second);
    accumulate_layer_packet(
        &scene_transport, &first_depth, &weighted_mean_depth,
        &blended_velocity, &contribution_weight,
        &dominant_contribution, &dominant_layer, third);
    accumulate_layer_packet(
        &scene_transport, &first_depth, &weighted_mean_depth,
        &blended_velocity, &contribution_weight,
        &dominant_contribution, &dominant_layer, fourth);
    accumulate_layer_packet(
        &scene_transport, &first_depth, &weighted_mean_depth,
        &blended_velocity, &contribution_weight,
        &dominant_contribution, &dominant_layer, fifth);

    let transmittance_y = clamp(
        photopic(scene_transport.transmittance), 0.0, 1.0);
    let safe_contribution_weight = max(1e-8, contribution_weight);
    let actual_steps = first.evaluated_steps + second.evaluated_steps +
        third.evaluated_steps + fourth.evaluated_steps +
        fifth.evaluated_steps;
    var output: CloudOutput;
    output.radiance = vec4<f32>(scene_transport.radiance, 0.0);
    output.transmittance = vec4<f32>(
        scene_transport.transmittance, transmittance_y);
    output.geometry = vec4<f32>(
        first_depth,
        select(
            FAR_LIMIT,
            weighted_mean_depth / safe_contribution_weight,
            contribution_weight > 0.0001),
        -log(max(0.0001, transmittance_y)),
        1.0 - transmittance_y,
    );
    output.motion = vec4<f32>(
        select(
            vec2<f32>(0.0),
            blended_velocity / safe_contribution_weight,
            vec2<bool>(contribution_weight > 0.0001)),
        dominant_layer,
        clamp(actual_steps / 512.0, 0.0, 1.0),
    );
    return output;
}
`;

/** Cloud shader plus the group-2, exact-owner light-volume compute entries. */
const CLOUD_LIGHTNING_FIELD_WGSL = /* wgsl */ `
@group(2) @binding(14) var cloud_lv_lightning_transfer_output:
    texture_storage_3d<rgba16float, write>;

@compute @workgroup_size(4, 4, 4)
fn cloud_lv_materialize_lightning_transfer_compute(
    @builtin(global_invocation_id) invocation: vec3<u32>,
) {
    let level = 2u;
    let dimensions = cloud_lv_level_dimensions(level);
    let local_z = cloud_lv_slab_local_z(invocation.z);
    if (invocation.x >= dimensions.x || invocation.y >= dimensions.y ||
        !cloud_lv_slab_contains(local_z, level)) { return; }
    let brick_index = cloud_lv_work_brick_index();
    let local = vec3<u32>(invocation.xy, local_z);
    var atlas = cloud_lv_work_coordinate(local, brick_index, level);
    atlas.z += i32(cloud_lv_uniforms.level_bank_io.y *
        cloud_lv_level_atlas_depth(level));
    if (brick_index >= cloud_lv_active_brick_count()) {
        textureStore(cloud_lv_lightning_transfer_output, atlas, vec4<f32>(0.0));
        return;
    }
    let brick = cloud_lv_bricks[brick_index];
    let owner_index = u32(max(0.0, round(
        brick.owner_atlas_tau_schema.x)));
    let world = cloud_lv_world_position_level(
        brick.diffusion, vec3<f32>(local) + vec3<f32>(0.5), level);
    let transfer = weather_production_lightning_transfer_bounded(
        owner_index, world);
    textureStore(cloud_lv_lightning_transfer_output, atlas,
        vec4<f32>(min(vec3<f32>(65504.0), transfer), 1.0));
}
`;

interface WgslFunctionRange {
    name: string;
    start: number;
    end: number;
    body: string;
}

const wgslFunctionEnd = (source: string, bodyOffset: number) => {
    let depth = 0;
    let blockCommentDepth = 0;
    let lineComment = false;
    for (let offset = bodyOffset; offset < source.length; offset += 1) {
        const pair = source.slice(offset, offset + 2);
        if (lineComment) {
            if (source[offset] === "\n") lineComment = false;
            continue;
        }
        if (blockCommentDepth > 0) {
            if (pair === "/*") {
                blockCommentDepth += 1;
                offset += 1;
            } else if (pair === "*/") {
                blockCommentDepth -= 1;
                offset += 1;
            }
            continue;
        }
        if (pair === "//") {
            lineComment = true;
            offset += 1;
            continue;
        }
        if (pair === "/*") {
            blockCommentDepth = 1;
            offset += 1;
            continue;
        }
        if (source[offset] === "{") depth += 1;
        if (source[offset] === "}") {
            depth -= 1;
            if (depth === 0) return offset + 1;
        }
    }
    throw new Error("Unbalanced WGSL function body");
};

const wgslFunctionRanges = (source: string): readonly WgslFunctionRange[] => {
    const ranges: WgslFunctionRange[] = [];
    for (const match of source.matchAll(/\bfn\s+([A-Za-z_]\w*)\s*\(/g)) {
        const functionOffset = match.index;
        const bodyOffset = source.indexOf("{", functionOffset);
        if (bodyOffset < 0) {
            throw new Error(`Missing WGSL body for ${match[1]}`);
        }
        let start = functionOffset;
        const lineStart = source.lastIndexOf("\n", functionOffset) + 1;
        const sameLinePrefix = source.slice(lineStart, functionOffset).trim();
        if (sameLinePrefix === "" || sameLinePrefix.startsWith("@")) {
            start = lineStart;
            let previousEnd = lineStart - 1;
            while (previousEnd > 0) {
                const previousStart = source.lastIndexOf(
                    "\n", previousEnd - 1) + 1;
                const previousLine = source.slice(
                    previousStart, previousEnd).trim();
                if (!previousLine.startsWith("@")) break;
                start = previousStart;
                previousEnd = previousStart - 1;
            }
        }
        const end = wgslFunctionEnd(source, bodyOffset);
        ranges.push({
            name: match[1],
            start,
            end,
            body: source.slice(bodyOffset, end),
        });
    }
    return ranges;
};

/**
 * WGSL has no indirect calls or function pointers, so the transitive static
 * call graph is the complete stage-reachability graph used by WebGPU. Remove
 * unreachable function declarations before createShaderModule while retaining
 * every reachable declaration byte-for-byte. Module-scope types, constants,
 * bindings and exact function bodies are never rewritten.
 */
const pruneWgslFunctionsToEntryPoints = (
    source: string,
    entryPoints: readonly string[],
) => {
    const ranges = wgslFunctionRanges(source);
    const byName = new Map(ranges.map((range) => [range.name, range]));
    const reachable = new Set<string>();
    const pending = [...entryPoints];
    while (pending.length > 0) {
        const name = pending.pop()!;
        if (reachable.has(name)) continue;
        const range = byName.get(name);
        if (!range) throw new Error(`Missing WGSL entry point ${name}`);
        reachable.add(name);
        const uncommentedBody = withoutWgslBlockComments(range.body)
            .replace(/\/\/.*$/gm, "");
        for (const call of uncommentedBody.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)) {
            if (byName.has(call[1]) && !reachable.has(call[1])) {
                pending.push(call[1]);
            }
        }
    }
    let pruned = source;
    for (const range of [...ranges].reverse()) {
        if (!reachable.has(range.name)) {
            pruned = pruned.slice(0, range.start) + pruned.slice(range.end);
        }
    }
    return pruned;
};

const cloudLightVolumeComputeSource = (
    exactOwnerQueries = false,
) => createCloudLightVolumeComputeWgsl({
    bindingGroup: 2,
    ...(exactOwnerQueries ? {
        worldMediumFunctionWgsl: CLOUD_LIGHT_VOLUME_WORLD_MEDIUM_WGSL,
        sourceIrradianceFunctionWgsl: CLOUD_LIGHT_VOLUME_SOURCE_IRRADIANCE_WGSL,
        boundaryProjectionFunctionWgsl:
            CLOUD_LIGHT_VOLUME_BOUNDARY_PROJECTION_WGSL,
    } : {}),
});

const cloudLightVolumeFibratusSourceComputeSource = () =>
    createCloudLightVolumeComputeWgsl({
        bindingGroup: 2,
        sourceWorldMediumFunctionWgsl:
            CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_MEDIUM_WGSL,
    });

/**
 * Directional atmosphere coupling needs one compute entry from the mature
 * cloud material graph. Keep its reachable function bodies byte-for-byte, but
 * do not make Dawn/Tint and Metal parse and lower the unrelated camera and
 * lighting entries retained by the auxiliary source.
 */
export const WEBGPU_CLOUD_COUPLING_SHADER =
    pruneWgslFunctionsToEntryPoints(
        WEBGPU_CLOUD_AUXILIARY_SHADER,
        ["cloud_coupling_shadow_compute"],
    );

/** Exact Sun/Moon source materialization needed by every direct-light scene. */
export const WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER =
    pruneWgslFunctionsToEntryPoints(
        WEBGPU_CLOUD_AUXILIARY_SHADER + cloudLightVolumeComputeSource(true),
        [
            "cloud_lv_materialize_source_0_compute",
            "cloud_lv_materialize_source_1_compute",
        ],
    );

/**
 * Plain Ci fibratus source materialization. This module samples only its
 * conserved macro atlas and optical records; generic owner morphology and the
 * camera analytic-fibre graph are statically unreachable.
 */
export const WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER =
    pruneWgslFunctionsToEntryPoints(
        WEBGPU_CLOUD_AUXILIARY_SHADER +
            cloudLightVolumeFibratusSourceComputeSource(),
        [
            "cloud_lv_materialize_source_0_compute",
            "cloud_lv_materialize_source_1_compute",
        ],
    );

/**
 * Beer prefix scans consume already materialized source fields only. The
 * publication clear belongs here as well: direct-only scenes must clear the
 * packed fluence partition before publishing, but must not pay to compile the
 * resident P1 hierarchy.
 */
export const WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER =
    pruneWgslFunctionsToEntryPoints(cloudLightVolumeComputeSource(), [
        "cloud_lv_direct_source_0_compute",
        "cloud_lv_direct_source_1_compute",
        "cloud_lv_clear_fluence_compute",
    ]);

/** Exact material and boundary queries exist only for resident P1 layers. */
export const WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER =
    pruneWgslFunctionsToEntryPoints(
        WEBGPU_CLOUD_AUXILIARY_SHADER + cloudLightVolumeComputeSource(true),
        [
            "cloud_lv_project_boundary_compute",
            "cloud_lv_materialize_medium_compute",
            "cloud_lv_materialize_medium_fine_compute",
        ],
    );

/**
 * Conservative material reconstruction plus the complete P1 multigrid graph.
 * This module has no cloud camera, weather, morphology, or atmosphere source.
 */
export const WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER =
    pruneWgslFunctionsToEntryPoints(cloudLightVolumeComputeSource(), [
        "cloud_lv_prolongate_medium_compute",
        "cloud_lv_restrict_medium_compute",
        "cloud_lv_smooth_compute",
        "cloud_lv_restrict_residual_compute",
        "cloud_lv_prolongate_compute",
        "cloud_lv_copy_fluence_compute",
        "cloud_lv_measure_residual_compute",
    ]);

/** Finite lightning transfer is compiled only when authored lightning exists. */
export const WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER =
    pruneWgslFunctionsToEntryPoints(
        WEBGPU_CLOUD_AUXILIARY_SHADER + cloudLightVolumeComputeSource(true) +
            CLOUD_LIGHTNING_FIELD_WGSL,
        ["cloud_lv_materialize_lightning_transfer_compute"],
    );

export const WEBGPU_STAR_SHADER = /* wgsl */ `
${CELESTIAL_PHYSICS_WGSL}
struct StarInput {
    @location(0) corner: vec2<f32>,
    @location(1) direction: vec3<f32>,
    @location(2) size: f32,
    @location(3) observer_flux_rgb: vec3<f32>,
    @location(4) opacity: f32,
    @location(5) scintillation: f32,
    @location(6) phase: f32,
    @location(7) chromatic: f32,
    @location(8) detection: f32,
    @location(9) glow: f32,
    @location(10) psf_fwhm: f32,
    @location(11) psf_beta: f32,
    @location(12) psf_wing_fraction: f32,
    @location(13) psf_wing_scale: f32,
    @location(14) psf_support_radius: f32,
    @location(15) tip_tilt_arcseconds: vec2<f32>,
};
struct StarOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) observer_flux_rgb: vec3<f32>,
    @location(2) psf: vec4<f32>,
    @location(3) support_radius: f32,
    @location(4) visibility: f32,
    @location(5) glow: f32,
};
@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;

fn project_perspective(direction: vec3<f32>, camera: vec4<f32>) -> vec3<f32> {
    // Camera rays are local-to-world rotated by p[53].x. Projection applies
    // the exact inverse yaw before the historical pitch inverse.
    let yaw_cos = cos(p[53].x);
    let yaw_sin = sin(p[53].x);
    let yaw_local = vec3<f32>(
        direction.x * yaw_cos - direction.z * yaw_sin,
        direction.y,
        direction.x * yaw_sin + direction.z * yaw_cos,
    );
    let pitch_cos = cos(camera.y);
    let pitch_sin = sin(camera.y);
    let local = vec3<f32>(
        yaw_local.x,
        yaw_local.y * pitch_cos - yaw_local.z * pitch_sin,
        yaw_local.y * pitch_sin + yaw_local.z * pitch_cos,
    );
    let ndc = vec2<f32>(
        local.x / max(0.0001, local.z * tan(camera.x * 0.5)),
        local.y / max(0.0001, local.z * tan(camera.z * 0.5)),
    );
    return vec3<f32>(ndc, local.z);
}

@vertex
fn star_vertex(input: StarInput) -> StarOutput {
    let time = p[0].z;
    let turbulence = celestial_stellar_turbulence(
        time, input.phase, 1.0 + input.scintillation * 18.0,
        5.0, 1.0 / 60.0, p[19].w * 400.0,
        input.psf_fwhm * 206264.806, input.chromatic, 1.0);
    let viewport = p[0].xy;
    let angular_pixel = max(1e-8, p[4].x / max(1.0, viewport.x));
    let support_pixels = clamp(input.psf_support_radius / angular_pixel, input.size, 28.0);
    let tip_pixels = (turbulence.tip_tilt_arcseconds + input.tip_tilt_arcseconds) /
        206264.806 / angular_pixel;
    let extent = (input.corner * support_pixels + tip_pixels) * p[23].x * 2.0 / viewport;
    let projected = project_perspective(normalize(input.direction), p[4]);
    let visible = projected.z > 0.0 &&
        abs(projected.x) < 1.08 && abs(projected.y) < 1.08;
    var output: StarOutput;
    output.position = vec4<f32>(
        select(vec2<f32>(4.0), projected.xy + extent, vec2<bool>(visible)),
        0.0,
        1.0,
    );
    output.local = input.corner;
    output.observer_flux_rgb = input.observer_flux_rgb * turbulence.rgb_gain *
        p[23].z * p[23].y;
    output.psf = vec4<f32>(input.psf_fwhm, input.psf_beta,
        input.psf_wing_fraction, input.psf_wing_scale);
    output.support_radius = input.psf_support_radius;
    let lunar_separation = acos(clamp(dot(normalize(input.direction),
        normalize(p[24].xyz)), -1.0, 1.0));
    let occulted = lunar_separation < p[47].w;
    // Catalogue magnitude is already integrated in observer_flux_rgb. The
    // legacy opacity field remains ABI padding and must not dim it a second time.
    output.visibility = select(1.0, 0.0, occulted);
    output.glow = input.glow * p[23].w;
    return output;
}

@fragment
fn star_fragment(input: StarOutput) -> @location(0) vec4<f32> {
    if (dot(input.local, input.local) > 1.0 || input.visibility <= 0.0) { discard; }
    let angular_radius = length(input.local) * input.support_radius;
    let profile = celestial_stellar_psf(angular_radius, input.psf.x,
        input.psf.y, input.psf.z, input.psf.w);
    let angular_pixel = max(1e-8, p[4].x / max(1.0, p[0].x));
    let pixel_solid_angle = angular_pixel *
        max(1e-8, p[4].z / max(1.0, p[0].y));
    let energy = max(vec3<f32>(0.0), input.observer_flux_rgb) *
        profile * pixel_solid_angle * input.visibility;
    let wing_fraction = clamp(input.glow, 0.0, 0.35);
    return vec4<f32>(
        energy * (1.0 - wing_fraction),
        wing_fraction / max(1e-5, 1.0 - wing_fraction));
}
`;

/**
 * Low-resolution, energy-conserving stellar PSF. Bright-source energy is
 * attenuated by cloud transmission before convolution, so stars behind cloud
 * cannot paint a decorative halo over the cloud deck.
 */
export const WEBGPU_STELLAR_GLOW_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var linear_sampler: sampler;
@group(0) @binding(1) var source_texture: texture_2d<f32>;
@group(0) @binding(2) var cloud_texture: texture_2d<f32>;

fn four_tap(uv: vec2<f32>) -> vec4<f32> {
    let texel = 1.0 / vec2<f32>(textureDimensions(source_texture));
    return (
        textureSample(source_texture, linear_sampler, uv + texel * vec2<f32>(-0.5, -0.5)) +
        textureSample(source_texture, linear_sampler, uv + texel * vec2<f32>( 0.5, -0.5)) +
        textureSample(source_texture, linear_sampler, uv + texel * vec2<f32>(-0.5,  0.5)) +
        textureSample(source_texture, linear_sampler, uv + texel * vec2<f32>( 0.5,  0.5))
    ) * 0.25;
}

@fragment
fn glow_extract_fragment(input: VertexOut) -> @location(0) vec4<f32> {
    let star = four_tap(input.uv);
    let transmission = clamp(
        textureSample(cloud_texture, linear_sampler, input.uv).rgb,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let source = star.rgb * star.a * transmission;
    // A soft sensor-domain gate excludes faint catalogue stars from the wide
    // PSF while retaining bright-star colour and scintillation.
    let luminance = dot(source, vec3<f32>(0.2126, 0.7152, 0.0722));
    // Star visibility has already been exposure- and atmosphere-gated when the
    // instance list is built. Keeping this threshold local also lets the
    // extract and blur variants share compact, unambiguous bind-group layouts.
    let sensor_floor = 0.00055;
    let gate = smoothstep(sensor_floor, sensor_floor * 4.0 + 0.012, luminance);
    return vec4<f32>(source * gate, gate);
}

@fragment
fn glow_downsample_fragment(input: VertexOut) -> @location(0) vec4<f32> {
    return four_tap(input.uv);
}

fn gaussian(uv: vec2<f32>, axis: vec2<f32>) -> vec4<f32> {
    let texel = axis / vec2<f32>(textureDimensions(source_texture));
    var result = textureSample(source_texture, linear_sampler, uv) * 0.227027;
    result += textureSample(source_texture, linear_sampler, uv + texel * 1.384615) * 0.316216;
    result += textureSample(source_texture, linear_sampler, uv - texel * 1.384615) * 0.316216;
    result += textureSample(source_texture, linear_sampler, uv + texel * 3.230769) * 0.070270;
    result += textureSample(source_texture, linear_sampler, uv - texel * 3.230769) * 0.070270;
    return result;
}

@fragment
fn glow_blur_h_fragment(input: VertexOut) -> @location(0) vec4<f32> {
    return gaussian(input.uv, vec2<f32>(1.0, 0.0));
}

@fragment
fn glow_blur_v_fragment(input: VertexOut) -> @location(0) vec4<f32> {
    return gaussian(input.uv, vec2<f32>(0.0, 1.0));
}
`;

export const WEBGPU_MOON_SHADER = /* wgsl */ `
${CELESTIAL_PHYSICS_WGSL}
${physicalAtmosphereConsumerWgsl({ group: 1 })}
struct MoonOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
};
@group(0) @binding(0) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(1) var lunar_texture: texture_2d<f32>;
@group(0) @binding(2) var lunar_sampler: sampler;

fn project_perspective(direction: vec3<f32>, camera: vec4<f32>) -> vec3<f32> {
    // Camera rays are local-to-world rotated by p[53].x. Projection applies
    // the exact inverse yaw before the historical pitch inverse.
    let yaw_cos = cos(p[53].x);
    let yaw_sin = sin(p[53].x);
    let yaw_local = vec3<f32>(
        direction.x * yaw_cos - direction.z * yaw_sin,
        direction.y,
        direction.x * yaw_sin + direction.z * yaw_cos,
    );
    let pitch_cos = cos(camera.y);
    let pitch_sin = sin(camera.y);
    let local = vec3<f32>(
        yaw_local.x,
        yaw_local.y * pitch_cos - yaw_local.z * pitch_sin,
        yaw_local.y * pitch_sin + yaw_local.z * pitch_cos,
    );
    let ndc = vec2<f32>(
        local.x / max(0.0001, local.z * tan(camera.x * 0.5)),
        local.y / max(0.0001, local.z * tan(camera.z * 0.5)),
    );
    return vec3<f32>(ndc, local.z);
}

@vertex
fn moon_vertex(@location(0) corner: vec2<f32>) -> MoonOutput {
    let moon = p[24];
    let viewport = p[0].xy;
    let extent = corner * moon.w * 2.0 / viewport;
    let projected = project_perspective(normalize(moon.xyz), p[4]);
    let visible = projected.z > 0.0 &&
        abs(projected.x) < 1.2 && abs(projected.y) < 1.2;
    var output: MoonOutput;
    output.position = vec4<f32>(
        select(vec2<f32>(4.0), projected.xy + extent, vec2<bool>(visible)),
        0.0,
        1.0,
    );
    output.local = corner;
    return output;
}

@fragment
fn moon_fragment(input: MoonOutput) -> @location(0) vec4<f32> {
    let radius = length(input.local);
    let footprint = max(0.00001, fwidth(radius) * 1.25);
    if (radius > 1.0 + footprint) { discard; }
    let texture_state = p[27];
    let c = cos(p[46].z);
    let s = sin(p[46].z);
    let rotated = vec2<f32>(
        input.local.x * c - input.local.y * s,
        input.local.x * s + input.local.y * c,
    );
    let coverage = 1.0 - smoothstep(1.0 - footprint, 1.0 + footprint, radius);
    var relative_profile_radiance = vec3<f32>(0.0);
    if (texture_state.x > 0.5) {
        // NASA SVS frames are already ephemeris-correct rendered observations:
        // preserve phase/libration, decode in linear light, and normalize their
        // measured profile integral to the one disk photometry target below.
        let uv = rotated * vec2<f32>(0.432, -0.432) + vec2<f32>(0.5);
        let encoded = max(textureSample(lunar_texture, lunar_sampler, uv).rgb,
            vec3<f32>(0.0));
        let low = encoded / 12.92;
        let high = pow((encoded + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
        relative_profile_radiance = select(
            low, high, encoded > vec3<f32>(0.04045));
    } else {
        let coordinates = celestial_lunar_texture_coordinates(
            input.local, footprint, p[46].x, p[46].y, p[46].z);
        let dimensions = vec2<f32>(textureDimensions(lunar_texture));
        let lod = max(0.0, log2(max(dimensions.x, dimensions.y) *
            coordinates.texture_footprint_radians / 3.141592653589793));
        let encoded = textureSampleLevel(lunar_texture, lunar_sampler,
            coordinates.texture_uv, lod).rgb;
        let albedo = pow(max(encoded, vec3<f32>(0.004)), vec3<f32>(2.2));
        let photometry = CelestialLunarPhotometry(p[48], p[49]);
        let surface = celestial_lunar_surface(
            coordinates.surface_normal, p[47].xyz, vec3<f32>(0.0, 0.0, 1.0),
            albedo, vec3<f32>(1.0), p[52].x, 1.0, p[50].rgb, photometry);
        relative_profile_radiance = surface.toa_radiance;
    }
    let source_radiance = celestial_calibrated_lunar_profile_radiance(
        relative_profile_radiance,
        p[13].rgb,
        p[12].rgb,
    );
    let atmosphere_transfer = select(
        vec3<f32>(0.0),
        atmo_transmittance_to_space(
            physical_atmosphere.observer_world.xyz,
            atmo_source_direction(1u),
        ),
        atmo_source_enabled(1u),
    );
    let observed = source_radiance * atmosphere_transfer * coverage;
    // Add foreground-attenuated lunar radiance. The atmosphere background is
    // never alpha-darkened; diffuse extraterrestrial occultation is handled in
    // the atmosphere pass and catalogue-star occultation in the star pass.
    return vec4<f32>(max(vec3<f32>(0.0), observed), coverage);
}
`;

/**
 * Diagnostic-only reduction of the physical cloud buffers. A fixed 64×36
 * stratified grid keeps the work and readback constant regardless of viewport
 * size. Samples are weighted by the camera projection's solid-angle Jacobian,
 * so the reported opacity is a projected sky fraction rather than an ordinary
 * screen-pixel average.
 */
export const WEBGPU_CLOUD_METRICS_SHADER = /* wgsl */ `
// The RGB transmittance attachment is authoritative for projected opacity.
// Its alpha is a freshly derived photopic summary written by cloud_fragment;
// it is metadata only and never participates in temporal transport filtering.
@group(0) @binding(0) var transmittance_texture: texture_2d<f32>;
@group(0) @binding(1) var interval_high_mask: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(4) var motion_texture: texture_2d<f32>;
@group(0) @binding(5) var radiance_texture: texture_2d<f32>;

struct CloudMetrics {
    opacity_weight: atomic<u32>,
    occupied_weight: atomic<u32>,
    interval_weight: atomic<u32>,
    total_weight: atomic<u32>,
    evaluated_step_weight: atomic<u32>,
    non_finite_transmittance_count: atomic<u32>,
    non_finite_radiance_count: atomic<u32>,
    maximum_transmittance_chroma_bits: atomic<u32>,
};
@group(0) @binding(3) var<storage, read_write> metrics: CloudMetrics;

const PI: f32 = 3.141592653589793;
const GRID_WIDTH: u32 = 64u;
const GRID_HEIGHT: u32 = 36u;

fn solid_angle_weight(uv: vec2<f32>) -> f32 {
    let camera = p[31];
    if (camera.w > 1.5) {
        let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
        let plane = vec2<f32>(
            ndc.x * tan(camera.x * 0.5),
            ndc.y * tan(camera.z * 0.5),
        );
        return pow(1.0 + dot(plane, plane), -1.5);
    }
    if (camera.w > 0.5) {
        let elevation = camera.y + (0.5 - uv.y) * camera.z;
        return max(0.001, cos(elevation) * abs(camera.z));
    }
    let v = clamp(uv.y, 0.0001, 0.9999);
    let range = PI * 0.51 + 0.035;
    let elevation = mix(PI * 0.51, -0.035, pow(v, 0.91));
    let elevation_derivative = range * 0.91 * pow(v, -0.09);
    return max(0.001, abs(cos(elevation) * elevation_derivative));
}

@compute @workgroup_size(8, 8, 1)
fn cloud_metrics_compute(@builtin(global_invocation_id) id: vec3<u32>) {
    if (id.x >= GRID_WIDTH || id.y >= GRID_HEIGHT) { return; }
    let uv = (vec2<f32>(id.xy) + vec2<f32>(0.5)) /
        vec2<f32>(f32(GRID_WIDTH), f32(GRID_HEIGHT));
    let dimensions = textureDimensions(transmittance_texture);
    let pixel = clamp(
        vec2<i32>(floor(uv * vec2<f32>(dimensions))),
        vec2<i32>(0),
        vec2<i32>(dimensions) - vec2<i32>(1),
    );
    let transmittance = textureLoad(transmittance_texture, pixel, 0);
    let radiance = textureLoad(radiance_texture, pixel, 0);
    let interval = textureLoad(interval_high_mask, pixel, 0);
    let motion = textureLoad(motion_texture, pixel, 0);
    let transmittance_finite = all(transmittance == transmittance) &&
        max(max(abs(transmittance.r), abs(transmittance.g)),
            max(abs(transmittance.b), abs(transmittance.a))) <= 65504.0;
    let radiance_finite = all(radiance == radiance) &&
        max(max(abs(radiance.r), abs(radiance.g)),
            max(abs(radiance.b), abs(radiance.a))) <= 65504.0;
    if (!transmittance_finite) {
        atomicAdd(&metrics.non_finite_transmittance_count, 1u);
    } else {
        let maximum_chroma = max(
            abs(transmittance.r - transmittance.g),
            max(abs(transmittance.g - transmittance.b),
                abs(transmittance.b - transmittance.r)));
        atomicMax(&metrics.maximum_transmittance_chroma_bits,
            bitcast<u32>(maximum_chroma));
    }
    if (!radiance_finite) {
        atomicAdd(&metrics.non_finite_radiance_count, 1u);
    }
    let weight = u32(round(solid_angle_weight(uv) * 4096.0));
    let opacity = 1.0 - clamp(transmittance.a, 0.0, 1.0);
    atomicAdd(&metrics.opacity_weight, u32(round(opacity * f32(weight))));
    atomicAdd(&metrics.occupied_weight, select(0u, weight, opacity >= 0.02));
    atomicAdd(&metrics.interval_weight, select(0u, weight, interval.z >= 0.5));
    atomicAdd(&metrics.total_weight, weight);
    atomicAdd(&metrics.evaluated_step_weight,
        u32(round(clamp(motion.w, 0.0, 1.0) * f32(weight))));
}
`;

export const WEBGPU_COMPOSITE_SHADER = /* wgsl */ `
${FULLSCREEN_VERTEX}

@group(0) @binding(0) var linear_sampler: sampler;
@group(0) @binding(1) var background_texture: texture_2d<f32>;
@group(0) @binding(2) var cloud_texture: texture_2d_array<f32>;
@group(0) @binding(3) var previous_cloud_texture: texture_2d_array<f32>;
@group(0) @binding(4) var geometry_texture: texture_2d<f32>;
@group(0) @binding(5) var previous_geometry_texture: texture_2d<f32>;
@group(0) @binding(6) var motion_texture: texture_2d<f32>;
@group(0) @binding(7) var previous_motion_texture: texture_2d<f32>;
@group(0) @binding(8) var<storage, read> p: array<vec4<f32>>;
@group(0) @binding(9) var star_texture: texture_2d<f32>;
@group(0) @binding(10) var glow_half_texture: texture_2d<f32>;
@group(0) @binding(11) var glow_quarter_texture: texture_2d<f32>;
@group(0) @binding(12) var glow_eighth_texture: texture_2d<f32>;
@group(0) @binding(13) var previous_temporal_texture: texture_2d<f32>;
@group(0) @binding(14) var previous_resolved_cloud_texture:
    texture_2d_array<f32>;

struct CompositeTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
};

struct CompositeOutput {
    @location(0) display: vec4<f32>,
    // Running cloud-radiance luminance mean and population variance,
    // reconstruction confidence, and normalized stable-history age. This
    // remains linear and is never fed through the display transform.
    @location(1) temporal: vec4<f32>,
    // Full-resolution linear affine cloud transport, persisted independently
    // from display tonemapping and low-resolution stochastic transport.
    @location(2) resolved_radiance: vec4<f32>,
    @location(3) resolved_transmittance: vec4<f32>,
};

fn composite_photopic(value: vec3<f32>) -> f32 {
    return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn neutral_composite_transport() -> CompositeTransport {
    return CompositeTransport(vec3<f32>(0.0), vec3<f32>(1.0));
}

fn mix_composite_transport(
    first: CompositeTransport, second: CompositeTransport, amount: f32,
) -> CompositeTransport {
    return CompositeTransport(
        mix(first.radiance, second.radiance, amount),
        mix(first.transmittance, second.transmittance, amount),
    );
}

fn select_composite_transport(
    when_false: CompositeTransport,
    when_true: CompositeTransport,
    condition: bool,
) -> CompositeTransport {
    return CompositeTransport(
        select(when_false.radiance, when_true.radiance,
            vec3<bool>(condition)),
        select(when_false.transmittance, when_true.transmittance,
            vec3<bool>(condition)),
    );
}

fn sample_current_transport(uv: vec2<f32>) -> CompositeTransport {
    return CompositeTransport(
        textureSampleLevel(
            cloud_texture, linear_sampler, uv, 0, 0.0).rgb,
        clamp(textureSampleLevel(
            cloud_texture, linear_sampler, uv, 1, 0.0).rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)),
    );
}

fn sample_previous_transport(uv: vec2<f32>) -> CompositeTransport {
    return CompositeTransport(
        textureSample(
            previous_cloud_texture, linear_sampler, uv, 0).rgb,
        clamp(textureSample(
            previous_cloud_texture, linear_sampler, uv, 1).rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)),
    );
}

fn sample_resolved_transport(uv: vec2<f32>) -> CompositeTransport {
    return CompositeTransport(
        textureSample(
            previous_resolved_cloud_texture, linear_sampler, uv, 0).rgb,
        clamp(textureSample(
            previous_resolved_cloud_texture, linear_sampler, uv, 1).rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)),
    );
}

// Immutable captures are arithmetic estimators at the output-pixel lattice.
// A filtered sampler at a nominal pixel centre is usually equivalent, but an
// integer load makes the no-neighbour contract explicit and immune to UV
// roundoff or backend-specific interpolation precision.
fn load_resolved_transport(pixel: vec2<i32>) -> CompositeTransport {
    return CompositeTransport(
        textureLoad(previous_resolved_cloud_texture, pixel, 0, 0).rgb,
        clamp(textureLoad(
            previous_resolved_cloud_texture, pixel, 1, 0).rgb,
            vec3<f32>(0.0), vec3<f32>(1.0)),
    );
}

struct CloudNeighborhoodStatistics {
    radiance_mean: vec3<f32>,
    radiance_variance: vec3<f32>,
    transmittance_min: vec3<f32>,
    transmittance_max: vec3<f32>,
};

fn transport_opacity(transmittance: vec3<f32>) -> f32 {
    return 1.0 - clamp(composite_photopic(transmittance), 0.0, 1.0);
}

// Volume radiance and transmittance are different estimators. Transmittance is
// the edge guide: a bright cloudy neighbour must never enlarge the radiance
// clip box of a clear or merely translucent target pixel. Relative opacity
// change tolerates ordinary Monte-Carlo extinction noise in dense interiors
// while falling rapidly across a physical cloud/clear-air boundary.
fn transmittance_edge_weight(
    reference: vec3<f32>, candidate: vec3<f32>,
) -> f32 {
    let reference_opacity = transport_opacity(reference);
    let candidate_opacity = transport_opacity(candidate);
    let relative_opacity_delta = abs(reference_opacity - candidate_opacity) /
        max(0.04, max(reference_opacity, candidate_opacity));
    let spectral_delta = max(
        abs(reference.r - candidate.r),
        max(abs(reference.g - candidate.g),
            abs(reference.b - candidate.b)),
    );
    return exp(-relative_opacity_delta * 7.5 - spectral_delta * 4.0);
}

// Compact two-scale cross gather. This is deliberately not a generic blur:
// only samples belonging to the same transmittance support contribute to the
// radiance moments and clip bounds. Radius two suppresses isolated low-rate
// volume noise without rounding a silhouette or crossing a translucent edge.
fn current_cloud_neighborhood(
    uv: vec2<f32>, center: CompositeTransport,
) -> CloudNeighborhoodStatistics {
    let texel = 1.0 / vec2<f32>(textureDimensions(cloud_texture));
    let taps = array<vec3<f32>, 9>(
        vec3<f32>( 0.0,  0.0, 4.0),
        vec3<f32>( 1.0,  0.0, 2.0),
        vec3<f32>(-1.0,  0.0, 2.0),
        vec3<f32>( 0.0,  1.0, 2.0),
        vec3<f32>( 0.0, -1.0, 2.0),
        vec3<f32>( 2.0,  0.0, 1.0),
        vec3<f32>(-2.0,  0.0, 1.0),
        vec3<f32>( 0.0,  2.0, 1.0),
        vec3<f32>( 0.0, -2.0, 1.0),
    );
    var radiance_sum = vec3<f32>(0.0);
    var radiance_square_sum = vec3<f32>(0.0);
    var weight_sum = 0.0;
    var transmittance_min = center.transmittance;
    var transmittance_max = center.transmittance;
    for (var tap = 0; tap < 9; tap++) {
        let descriptor = taps[tap];
        let candidate = sample_current_transport(
            uv + descriptor.xy * texel);
        let edge_weight = transmittance_edge_weight(
            center.transmittance, candidate.transmittance);
        let weight = descriptor.z * edge_weight;
        radiance_sum += candidate.radiance * weight;
        radiance_square_sum += candidate.radiance * candidate.radiance * weight;
        weight_sum += weight;
        // A negligible edge weight must not widen the clip interval even if a
        // high-energy neighbour happens to sit one low-resolution texel away.
        if (edge_weight >= 0.08) {
            transmittance_min = min(
                transmittance_min, candidate.transmittance);
            transmittance_max = max(
                transmittance_max, candidate.transmittance);
        }
    }
    let inverse_weight = 1.0 / max(0.0001, weight_sum);
    let mean = radiance_sum * inverse_weight;
    return CloudNeighborhoodStatistics(
        mean,
        max(vec3<f32>(0.0),
            radiance_square_sum * inverse_weight - mean * mean),
        transmittance_min,
        transmittance_max,
    );
}

fn variance_guided_history_radiance(
    uv: vec2<f32>, center: CompositeTransport, variance: f32,
) -> vec3<f32> {
    let texel = 1.0 /
        vec2<f32>(textureDimensions(previous_resolved_cloud_texture));
    let taps = array<vec3<f32>, 9>(
        vec3<f32>( 0.0,  0.0, 4.0),
        vec3<f32>( 1.0,  0.0, 2.0),
        vec3<f32>(-1.0,  0.0, 2.0),
        vec3<f32>( 0.0,  1.0, 2.0),
        vec3<f32>( 0.0, -1.0, 2.0),
        vec3<f32>( 2.0,  0.0, 1.0),
        vec3<f32>(-2.0,  0.0, 1.0),
        vec3<f32>( 0.0,  2.0, 1.0),
        vec3<f32>( 0.0, -2.0, 1.0),
    );
    let sigma = sqrt(max(0.0, variance));
    let center_luminance = composite_photopic(center.radiance);
    var radiance_sum = vec3<f32>(0.0);
    var weight_sum = 0.0;
    for (var tap = 0; tap < 9; tap++) {
        let descriptor = taps[tap];
        let candidate = sample_resolved_transport(
            uv + descriptor.xy * texel);
        let edge_weight = transmittance_edge_weight(
            center.transmittance, candidate.transmittance);
        let luminance_delta = abs(
            composite_photopic(candidate.radiance) - center_luminance);
        let luminance_weight = exp(-luminance_delta /
            max(0.004, sigma * 2.8));
        let weight = descriptor.z * edge_weight * luminance_weight;
        radiance_sum += candidate.radiance * weight;
        weight_sum += weight;
    }
    let filtered = radiance_sum / max(0.0001, weight_sum);
    let variance_strength = variance / (variance + 0.0004);
    let opacity_strength = mix(
        0.52, 0.78,
        smoothstep(0.02, 0.30, transport_opacity(center.transmittance)),
    );
    return mix(center.radiance, filtered,
        variance_strength * opacity_strength);
}

fn linear_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let low = c * 12.92;
    let high = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    return select(low, high, c >= vec3<f32>(0.0031308));
}

fn luminance_preserving_shoulder(color: vec3<f32>) -> vec3<f32> {
    let luminance = dot(max(color, vec3<f32>(0.0)),
        vec3<f32>(0.2126, 0.7152, 0.0722));
    let mapped_luminance = luminance /
        (1.0 + max(luminance - 0.72, 0.0) * 0.72);
    return color * mapped_luminance / max(0.00001, luminance);
}

fn aces_fitted_luminance(value: f32) -> f32 {
    let x = max(0.0, value);
    return clamp(
        (x * (2.51 * x + 0.03)) /
            max(0.00001, x * (2.43 * x + 0.59) + 0.14),
        0.0,
        1.0,
    );
}

fn photographic_tonemap(
    color: vec3<f32>, exposure_multiplier: f32,
) -> vec3<f32> {
    // Exposure belongs after all atmosphere/cloud/celestial radiance has been
    // composed. Applying it in the background pass alone left physically
    // correct cloud radiance several stops below the displayed sky.
    let exposed = max(color, vec3<f32>(0.0)) *
        clamp(exposure_multiplier, 0.01, 100000.0);
    let luminance = dot(exposed, vec3<f32>(0.2126, 0.7152, 0.0722));
    if (luminance <= 0.000001) { return exposed; }
    let mapped_luminance = aces_fitted_luminance(luminance);
    var mapped = exposed * mapped_luminance / luminance;
    // Camera shoulders and sensor cross-talk gently neutralize only the
    // brightest values. Midtone sky/cloud chroma remains radiometric and the
    // palette continues to act solely through its bounded atmosphere grade.
    let highlight_neutralization = smoothstep(0.74, 0.99, mapped_luminance) * 0.14;
    mapped = mix(mapped, vec3<f32>(mapped_luminance), highlight_neutralization);
    return max(mapped, vec3<f32>(0.0));
}

fn physical_atmosphere_apply_grade(
    radiance: vec3<f32>,
    exposure_compensation_ev: f32,
    chroma_residual: vec3<f32>,
    mood_strength: f32,
) -> vec3<f32> {
    let exposure = exp2(clamp(exposure_compensation_ev, -1.5, 1.5));
    let residual = clamp(chroma_residual, vec3<f32>(-0.12), vec3<f32>(0.12));
    let strength = clamp(mood_strength, 0.0, 0.35);
    return max(vec3<f32>(0.0),
        radiance * exposure * (vec3<f32>(1.0) + residual * strength));
}

fn hash21(point: vec2<f32>) -> f32 {
    var q = fract(vec3<f32>(point.x, point.y, point.x) * vec3<f32>(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yzx + vec3<f32>(33.33));
    return fract((q.x + q.y) * q.z);
}

fn view_direction_for_camera(
    uv: vec2<f32>, camera: vec4<f32>, yaw: f32,
) -> vec3<f32> {
    let yaw_cos = cos(yaw);
    let yaw_sin = sin(yaw);
    if (camera.w > 1.5) {
        let ndc = vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
        let local = normalize(vec3<f32>(
            ndc.x * tan(camera.x * 0.5),
            ndc.y * tan(camera.z * 0.5),
            1.0,
        ));
        let pitch_cos = cos(camera.y);
        let pitch_sin = sin(camera.y);
        let pitched = normalize(vec3<f32>(
            local.x,
            local.y * pitch_cos + local.z * pitch_sin,
            local.z * pitch_cos - local.y * pitch_sin,
        ));
        return normalize(vec3<f32>(
            pitched.x * yaw_cos + pitched.z * yaw_sin,
            pitched.y,
            -pitched.x * yaw_sin + pitched.z * yaw_cos,
        ));
    }
    let azimuth = (uv.x - 0.5) * camera.x;
    var elevation = mix(3.141592653589793 * 0.51, -0.035, pow(uv.y, 0.91));
    if (camera.w > 0.5) {
        elevation = camera.y + (0.5 - uv.y) * camera.z;
    }
    let ce = cos(elevation);
    let local = vec3<f32>(sin(azimuth) * ce, sin(elevation), cos(azimuth) * ce);
    return normalize(vec3<f32>(
        local.x * yaw_cos + local.z * yaw_sin,
        local.y,
        -local.x * yaw_sin + local.z * yaw_cos,
    ));
}

fn project_direction_to_camera(
    direction: vec3<f32>, camera: vec4<f32>, yaw: f32,
) -> vec2<f32> {
    let yaw_cos = cos(yaw);
    let yaw_sin = sin(yaw);
    if (camera.w > 1.5) {
        let yaw_local = vec3<f32>(
            direction.x * yaw_cos - direction.z * yaw_sin,
            direction.y,
            direction.x * yaw_sin + direction.z * yaw_cos,
        );
        let pitch_cos = cos(camera.y);
        let pitch_sin = sin(camera.y);
        let local = vec3<f32>(
            yaw_local.x,
            yaw_local.y * pitch_cos - yaw_local.z * pitch_sin,
            yaw_local.y * pitch_sin + yaw_local.z * pitch_cos,
        );
        if (local.z <= 0.0001) { return vec2<f32>(-2.0); }
        let ndc = vec2<f32>(
            local.x / (local.z * tan(camera.x * 0.5)),
            local.y / (local.z * tan(camera.z * 0.5)),
        );
        return vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
    }
    let yaw_local = vec3<f32>(
        direction.x * yaw_cos - direction.z * yaw_sin,
        direction.y,
        direction.x * yaw_sin + direction.z * yaw_cos,
    );
    let azimuth = atan2(yaw_local.x, yaw_local.z);
    let elevation = asin(clamp(yaw_local.y, -1.0, 1.0));
    var v = pow(clamp(
        (3.141592653589793 * 0.51 - elevation) /
            (3.141592653589793 * 0.51 + 0.035),
        0.0,
        1.0,
    ), 1.0 / 0.91);
    if (camera.w > 0.5) {
        v = 0.5 - (elevation - camera.y) / max(0.001, camera.z);
    }
    return vec2<f32>(azimuth / max(0.001, camera.x) + 0.5, v);
}

fn in_unit_square(uv: vec2<f32>) -> f32 {
    let inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
    return select(0.0, 1.0, inside);
}

fn cloud_reconstruction_weight(
    reference: vec4<f32>, candidate: vec4<f32>, spatial_weight: f32,
) -> f32 {
    let reference_present = reference.w > 0.002;
    let candidate_present = candidate.w > 0.002;
    if (reference_present != candidate_present) {
        return spatial_weight * 0.002;
    }
    if (!reference_present) { return spatial_weight; }
    let depth_scale = max(0.35, min(reference.y, candidate.y) * 0.025);
    let depth_weight = exp(-abs(reference.y - candidate.y) / depth_scale);
    let optical_weight = exp(-abs(reference.z - candidate.z) * 2.4);
    return spatial_weight * depth_weight * optical_weight;
}

fn reconstruct_cloud_transport(
    uv: vec2<f32>, reference_geometry: vec4<f32>,
) -> CompositeTransport {
    let dimensions = vec2<f32>(textureDimensions(cloud_texture));
    let texel = 1.0 / dimensions;
    var accumulated_radiance = vec3<f32>(0.0);
    var accumulated_transmittance = vec3<f32>(0.0);
    var accumulated_weight = 0.0;
    for (var y = -1; y <= 1; y++) {
        for (var x = -1; x <= 1; x++) {
            let offset = vec2<f32>(f32(x), f32(y));
            let sample_uv = uv + offset * texel;
            let candidate_geometry = textureSampleLevel(
                geometry_texture, linear_sampler, sample_uv, 0.0);
            var axis_weight = select(1.0, 2.0, x == 0) *
                select(1.0, 2.0, y == 0);
            if (x == 0 && y == 0) { axis_weight = 8.0; }
            let weight = cloud_reconstruction_weight(
                reference_geometry, candidate_geometry, axis_weight);
            let candidate = sample_current_transport(sample_uv);
            accumulated_radiance += candidate.radiance * weight;
            accumulated_transmittance += candidate.transmittance * weight;
            accumulated_weight += weight;
        }
    }
    let inverse_weight = 1.0 / max(0.0001, accumulated_weight);
    return CompositeTransport(
        accumulated_radiance * inverse_weight,
        clamp(accumulated_transmittance * inverse_weight,
            vec3<f32>(0.0), vec3<f32>(1.0)),
    );
}

@fragment
fn composite_fragment(input: VertexOut) -> CompositeOutput {
    let background = textureSample(background_texture, linear_sampler, input.uv).rgb;
    let output_dimensions = textureDimensions(previous_temporal_texture);
    let output_pixel = clamp(
        vec2<i32>(input.position.xy),
        vec2<i32>(0),
        vec2<i32>(output_dimensions) - vec2<i32>(1),
    );
    let display_direction = view_direction_for_camera(input.uv, p[4], p[53].x);
    let current_uv = project_direction_to_camera(
        display_direction, p[31], p[53].x);
    let current_camera_visibility = in_unit_square(current_uv);
    let cloud_dimensions = textureDimensions(cloud_texture);
    let cloud_pixel = clamp(
        vec2<i32>(floor(current_uv * vec2<f32>(cloud_dimensions))),
        vec2<i32>(0),
        vec2<i32>(cloud_dimensions) - vec2<i32>(1),
    );
    let transport_phase = i32(round(p[30].z));
    let checker = (cloud_pixel.x + cloud_pixel.y + transport_phase) % 2;
    let current_updated = (p[30].y < 0.5 || checker == 0) &&
        current_camera_visibility > 0.5;
    let updated_weight = select(0.0, 1.0, current_updated);
    let sampled_geometry = textureSample(geometry_texture, linear_sampler, current_uv);
    // Reconstruction remains in the linear transport domain, but is now
    // bilateral in physical optical depth and mean distance. An unconditional
    // tent mixed clear sky through cloud silhouettes, blurred lobe detail and
    // amplified shell-depth contours into concentric rings.
    let direct_current = sample_current_transport(current_uv);
    // Full-frame transport already supplies every source texel; a spatial
    // reconstruction pass there only softens silhouettes. Reserve bilateral
    // neighbourhood reconstruction for the optional checkerboard path whose
    // missing samples actually require it.
    let sampled_current = select_composite_transport(
        direct_current,
        reconstruct_cloud_transport(current_uv, sampled_geometry),
        p[30].y > 0.5,
    );
    let sampled_motion = textureSample(motion_texture, linear_sampler, current_uv);
    let current_candidate = mix_composite_transport(
        neutral_composite_transport(),
        sampled_current,
        current_camera_visibility,
    );
    let geometry_candidate = mix(
        vec4<f32>(140.0, 140.0, 0.0, 0.0),
        sampled_geometry,
        current_camera_visibility,
    );
    let motion_candidate = mix(
        vec4<f32>(0.0, 0.0, -1.0, 0.0),
        sampled_motion,
        current_camera_visibility,
    );
    let camera_only_previous_uv = project_direction_to_camera(
        display_direction, p[32], p[53].y);
    let seed_previous_geometry = textureSample(
        previous_geometry_texture, linear_sampler, camera_only_previous_uv);
    let seed_previous_motion = textureSample(
        previous_motion_texture, linear_sampler, camera_only_previous_uv);
    let reprojection_geometry = mix(
        seed_previous_geometry, geometry_candidate, updated_weight);
    let reprojection_motion = mix(
        seed_previous_motion, motion_candidate, updated_weight);
    let transport_distance = max(1.0, reprojection_geometry.y);
    let previous_world_point = display_direction * transport_distance + vec3<f32>(
        reprojection_motion.x * p[30].w,
        0.0,
        reprojection_motion.y * p[30].w,
    );
    let previous_uv = project_direction_to_camera(
        normalize(previous_world_point), p[32], p[53].y);
    let previous_camera_visibility = in_unit_square(previous_uv);
    let camera_delta = max(
        max(abs(p[31].x - p[32].x), abs(p[31].y - p[32].y)),
        max(
            max(abs(p[31].z - p[32].z), abs(p[31].w - p[32].w)),
            abs(atan2(
                sin(p[53].x - p[53].y),
                cos(p[53].x - p[53].y),
            )),
        ));
    let immutable_capture_epoch = p[30].w <= 1e-6 && camera_delta <= 1e-6;
    let sampled_complementary = sample_previous_transport(previous_uv);
    let sampled_complementary_geometry = textureSample(
        previous_geometry_texture, linear_sampler, previous_uv);
    let sampled_complementary_motion = textureSample(
        previous_motion_texture, linear_sampler, previous_uv);
    let complementary = mix_composite_transport(
        neutral_composite_transport(),
        sampled_complementary,
        previous_camera_visibility,
    );
    let complementary_geometry = mix(
        vec4<f32>(140.0, 140.0, 0.0, 0.0),
        sampled_complementary_geometry,
        previous_camera_visibility,
    );
    let complementary_motion = mix(
        vec4<f32>(0.0, 0.0, -1.0, 0.0),
        sampled_complementary_motion,
        previous_camera_visibility,
    );
    let current = mix_composite_transport(
        complementary, current_candidate, updated_weight);
    let geometry = mix(complementary_geometry, geometry_candidate, updated_weight);
    let motion = mix(complementary_motion, motion_candidate, updated_weight);
    let previous_geometry = complementary_geometry;
    let previous_motion = complementary_motion;
    let current_neighborhood = current_cloud_neighborhood(current_uv, current);
    let new_transport_sample = p[33].w > 0.5;
    // Presentation can run faster than volumetric transport. Never reproject
    // or re-average on a presentation-only frame: doing so repeatedly applies
    // the last motion vector and biases the history toward one raw sample.
    // An immutable capture epoch is also an exact same-pixel estimator. Do not
    // send it through direction -> projection -> bilinear sampling: even a
    // sub-pixel round-trip offset mixes neighbouring history ages and can keep
    // an otherwise accepted path permanently young. Moving epochs retain the
    // world-space camera/wind reprojection and all geometric rejection below.
    let reproject_temporal_history =
        new_transport_sample && !immutable_capture_epoch;
    let temporal_history_uv = select(
        input.uv, previous_uv, reproject_temporal_history);
    let temporal_history_visibility = select(
        1.0, previous_camera_visibility, reproject_temporal_history);
    let direct_previous_temporal = textureLoad(
        previous_temporal_texture, output_pixel, 0);
    let reprojected_previous_temporal = textureSample(
        previous_temporal_texture, linear_sampler, previous_uv);
    let previous_temporal = select(
        direct_previous_temporal,
        reprojected_previous_temporal,
        reproject_temporal_history,
    );
    let direct_resolved_history = load_resolved_transport(output_pixel);
    let reprojected_resolved_history = sample_resolved_transport(previous_uv);
    let previous_resolved_history = select_composite_transport(
        direct_resolved_history,
        reprojected_resolved_history,
        reproject_temporal_history,
    );
    // Persist moments of volume radiance alone. Background-through-cloud
    // luminance contains a second, transmittance-correlated signal and inflated
    // the old variance estimate exactly where a translucent boundary crossed a
    // bright sky gradient.
    let current_luminance = composite_photopic(current.radiance);
    let temporal_available = p[22].z > 0.0;
    let variance_sigma = sqrt(max(0.0, previous_temporal.y));
    let filtered_history = CompositeTransport(
        variance_guided_history_radiance(
            temporal_history_uv, previous_resolved_history, previous_temporal.y),
        previous_resolved_history.transmittance,
    );
    let variance_strength = previous_temporal.y /
        (previous_temporal.y + 0.0004);
    let current_filter_strength = variance_strength * mix(
        0.24, 0.52,
        smoothstep(0.02, 0.30, transport_opacity(current.transmittance)),
    );
    let denoised_current = CompositeTransport(
        mix(current.radiance, current_neighborhood.radiance_mean,
            current_filter_strength),
        current.transmittance,
    );
    let spatial_sigma = sqrt(max(
        vec3<f32>(0.0), current_neighborhood.radiance_variance));
    let boundary_clip_scale = mix(
        0.12, 1.0,
        smoothstep(0.004, 0.10, transport_opacity(current.transmittance)),
    );
    let radiance_clip_radius = (
        spatial_sigma * 1.65 + vec3<f32>(variance_sigma * 1.25 + 0.002)
    ) * boundary_clip_scale;
    let transmittance_guard = mix(0.002, 0.018, variance_strength);
    let neighborhood_clamped_history = CompositeTransport(
        clamp(filtered_history.radiance,
            max(vec3<f32>(0.0),
                current_neighborhood.radiance_mean - radiance_clip_radius),
            current_neighborhood.radiance_mean + radiance_clip_radius),
        clamp(filtered_history.transmittance,
            current_neighborhood.transmittance_min -
                vec3<f32>(transmittance_guard),
            current_neighborhood.transmittance_max +
                vec3<f32>(transmittance_guard)),
    );
    let current_present = geometry.w > 0.002;
    let previous_present = previous_geometry.w > 0.002;
    let occupancy_match = select(0.0, 1.0, current_present == previous_present);
    let first_depth_delta = abs(geometry.x - previous_geometry.x) /
        max(1.0, min(geometry.x, previous_geometry.x));
    let mean_depth_delta = abs(geometry.y - previous_geometry.y) /
        max(1.0, min(geometry.y, previous_geometry.y));
    let optical_delta = abs(geometry.z - previous_geometry.z) /
        max(0.08, max(geometry.z, previous_geometry.z));
    let layer_match = select(0.0, 1.0, abs(motion.z - previous_motion.z) < 0.25);
    let velocity_delta = length(motion.xy - previous_motion.xy);
    let depth_confidence = exp(-first_depth_delta * 8.0 - mean_depth_delta * 4.0);
    let optical_confidence = exp(-optical_delta * 5.0);
    let motion_confidence = exp(-velocity_delta * 0.22);
    let empty_confidence = select(1.0, occupancy_match * layer_match,
        current_present || previous_present);
    let reconstruction_confidence = clamp(
        depth_confidence * optical_confidence * motion_confidence * empty_confidence,
        0.0, 1.0);
    // A fixed camera and fixed simulation clock make every raw hit/miss at a
    // sub-pixel silhouette another estimator sample, not a disocclusion.
    // Retaining the same-pixel resolved operator is therefore exact temporal
    // integration of coverage. Requiring both one-sample occupancy flags here
    // repeatedly reset precisely the boundary pixels the convergence tail is
    // intended to solve.
    let immutable_sample_accept = immutable_capture_epoch &&
        temporal_available && current_updated &&
        temporal_history_visibility > 0.5;
    // First/mean depth are themselves one-sample stochastic estimators. In an
    // immutable qualification capture they must not veto an otherwise stable
    // occupied path: doing so retained isolated high-energy source samples as
    // stipple while the much lower-variance extinction remained continuous.
    // Optical depth and owner identity still reject real silhouette changes.
    let immutable_optical_accept = immutable_capture_epoch &&
        current_present && previous_present && occupancy_match > 0.5 &&
        layer_match > 0.5 && optical_delta <= 0.35;
    // The raw lighting estimator is intentionally stochastic. Only
    // silhouettes and low-confidence reprojections may be clipped against the
    // transmittance-guided two-scale neighborhood; a stable interior retains
    // the variance-filtered long-run radiance even when the current source
    // sample is an outlier. Geometry owns the binary accept/reject decision.
    let stable_interior = current_present && previous_present &&
        (reconstruction_confidence >= 0.72 || immutable_optical_accept) &&
        min(geometry.w, previous_geometry.w) >= 0.08;
    let clamped_resolved_history = select_composite_transport(
        neighborhood_clamped_history,
        filtered_history,
        stable_interior || immutable_sample_accept,
    );
    // A paused immutable epoch estimates one fixed output-pixel integral. Its
    // recurrence must contain only this raw sample and the prior resolved value
    // at that exact integer pixel. In particular, neither the current spatial
    // denoiser nor the variance-guided history gather may enter this branch.
    // Moving/reprojected epochs continue to use both filters and all silhouette
    // and disocclusion guards above.
    let immutable_resolve_current = select_composite_transport(
        denoised_current,
        current,
        immutable_capture_epoch,
    );
    let immutable_resolve_history = select_composite_transport(
        clamped_resolved_history,
        direct_resolved_history,
        immutable_capture_epoch,
    );
    let geometric_accept = select(
        0.0, 1.0,
        reconstruction_confidence >= 0.55 || immutable_sample_accept);
    let prior_count = max(1.0, previous_temporal.w * 64.0);
    let exact_mean_history = prior_count / (prior_count + 1.0);
    let bounded_live_history = min(0.98, exact_mean_history);
    let mean_history = select(
        bounded_live_history,
        exact_mean_history,
        immutable_capture_epoch,
    );
    let accepts_history = temporal_available && current_updated &&
        temporal_history_visibility > 0.5 && geometric_accept > 0.5;
    let history_weight = select(
        0.0,
        mean_history,
        new_transport_sample && accepts_history,
    );
    // Expected Monte-Carlo radiance variance is deliberately absent from the
    // history acceptance test. Geometry, optical depth, layer ownership and
    // motion reject disocclusions; noisy opaque interiors must be allowed to
    // converge instead of rejecting their own history.
    let newly_resolved_cloud = mix_composite_transport(
        immutable_resolve_current,
        immutable_resolve_history,
        history_weight,
    );
    let cloud = select_composite_transport(
        direct_resolved_history,
        newly_resolved_cloud,
        new_transport_sample,
    );
    // Population-variance form of Welford's online update. Unlike blending a
    // squared residual, this remains an analytic moment estimate at every
    // history length and does not overstate young-history variance.
    let moment_delta = current_luminance - previous_temporal.x;
    let accepted_mean = previous_temporal.x +
        moment_delta / (prior_count + 1.0);
    let accepted_variance = max(0.0,
        (prior_count * previous_temporal.y +
            moment_delta * (current_luminance - accepted_mean)) /
        (prior_count + 1.0));
    let newly_accumulated_mean = select(
        current_luminance, accepted_mean, accepts_history);
    let newly_accumulated_variance = select(
        0.0, accepted_variance, accepts_history);
    let newly_persistent_confidence = select(
        0.0,
        min(1.0, previous_temporal.z + 0.085),
        accepts_history,
    );
    let newly_stable_age = select(
        1.0 / 64.0,
        min(1.0, previous_temporal.w + 1.0 / 64.0),
        accepts_history,
    );
    let accumulated_mean = select(
        direct_previous_temporal.x,
        newly_accumulated_mean,
        new_transport_sample,
    );
    let accumulated_variance = select(
        direct_previous_temporal.y,
        newly_accumulated_variance,
        new_transport_sample,
    );
    let persistent_confidence = select(
        direct_previous_temporal.z,
        newly_persistent_confidence,
        new_transport_sample,
    );
    let stable_age = select(
        direct_previous_temporal.w,
        newly_stable_age,
        new_transport_sample,
    );
    // Cloud transport already includes finite sample-to-camera atmospheric
    // transmittance. Blending cloud radiance toward the full background here
    // applied aerial perspective twice and made opaque distant systems smoky.
    let cloud_scattering = cloud.radiance;
    let cloud_transmittance = clamp(
        cloud.transmittance, vec3<f32>(0.0), vec3<f32>(1.0));
    let cloud_transmittance_y = clamp(
        composite_photopic(cloud_transmittance), 0.0, 1.0);
    let stellar_core = textureSample(
        star_texture, linear_sampler, input.uv).rgb * cloud_transmittance;
    let glow_half = textureSample(glow_half_texture, linear_sampler, input.uv).rgb;
    let glow_quarter = textureSample(glow_quarter_texture, linear_sampler, input.uv).rgb;
    let glow_eighth = textureSample(glow_eighth_texture, linear_sampler, input.uv).rgb;
    // The three normalized sensor/atmosphere wing scales partition one finite
    // source-energy budget; their weights sum to one.
    let stellar_psf = glow_half * 0.486486 + glow_quarter * 0.310811 +
        glow_eighth * 0.202703;
    var radiance = cloud_scattering + background * cloud_transmittance +
        stellar_core + stellar_psf;

    let debug_view = i32(p[22].y);
    if (debug_view == 1) {
        radiance = vec3<f32>(1.0 - cloud_transmittance_y);
    }
    if (debug_view == 2) { radiance = vec3<f32>(1.0 - exp(-geometry.z * 0.35)); }
    if (debug_view == 3) { radiance = cloud_transmittance; }
    if (debug_view == 4) {
        radiance = vec3<f32>(
            1.0 - clamp(geometry.x / 140.0, 0.0, 1.0),
            1.0 - clamp(geometry.y / 140.0, 0.0, 1.0),
            0.0,
        );
    }
    if (debug_view == 5) {
        radiance = vec3<f32>(motion.xy * 0.08 + vec2<f32>(0.5),
            clamp((motion.z + 1.0) / 3.0, 0.0, 1.0));
    }
    if (debug_view == 6) {
        radiance = vec3<f32>(
            persistent_confidence,
            history_weight,
            clamp(variance_sigma * 8.0, 0.0, 1.0),
        );
    }
    if (debug_view == 7) { radiance = cloud.radiance; }
    if (debug_view == 8) { radiance = vec3<f32>(motion.w); }
    if (debug_view == 9 || debug_view == 10 || debug_view == 11 ||
        debug_view == 13) {
        radiance = cloud.radiance;
    }
    // The atmosphere-composite view retains the clear-sky boundary term and
    // the depth-ordered, foreground-air-transported cloud affine operator,
    // while excluding celestial sensor PSF and the final artistic grade.
    if (debug_view == 12) {
        radiance = cloud_scattering + background * cloud_transmittance;
    }
    // The atmosphere pass has replaced the background with its raw
    // scene-linear directional cloud-shadow loss. Exclude cloud and every
    // celestial path so this partition measures that operator alone.
    if (debug_view == 14) { radiance = background; }

    // Expose the completed linear-light scene once, exactly as a camera does.
    // Lighting debug uses that same exposure so physically valid values are
    // inspectable; scalar geometry diagnostics deliberately remain unexposed.
    if (debug_view == 0) {
        radiance = physical_atmosphere_apply_grade(
            radiance,
            p[5].w,
            vec3<f32>(p[7].w, p[8].w, p[9].w),
            p[6].w,
        );
    }
    if (debug_view == 0 || debug_view == 7 ||
        (debug_view >= 9 && debug_view <= 14)) {
        radiance = photographic_tonemap(radiance, p[29].y);
    } else {
        radiance = luminance_preserving_shoulder(radiance);
    }
    var display = linear_to_srgb(max(radiance, vec3<f32>(0.0)));
    let dither = (hash21(input.position.xy + vec2<f32>(17.0, 61.0)) +
        hash21(input.position.yx + vec2<f32>(83.0, 11.0)) - 1.0) / 255.0;
    display = clamp(display + vec3<f32>(dither), vec3<f32>(0.0), vec3<f32>(1.0));
    var output: CompositeOutput;
    output.display = vec4<f32>(display, 1.0);
    output.temporal = vec4<f32>(
        accumulated_mean,
        accumulated_variance,
        persistent_confidence,
        stable_age,
    );
    output.resolved_radiance = vec4<f32>(cloud.radiance, 0.0);
    output.resolved_transmittance = vec4<f32>(
        cloud_transmittance, cloud_transmittance_y);
    return output;
}
`;

/**
 * Post-composite numerical reconstruction audit. This compares consecutive
 * raw transport samples with the temporally resolved affine transport and the
 * actual history state. It deliberately writes no image and cannot affect the
 * reconstruction it measures.
 */
export const WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER = /* wgsl */ `
@group(0) @binding(0) var raw_radiance_current: texture_2d<f32>;
@group(0) @binding(1) var raw_radiance_previous: texture_2d<f32>;
@group(0) @binding(2) var raw_transmittance_current: texture_2d<f32>;
@group(0) @binding(3) var raw_transmittance_previous: texture_2d<f32>;
@group(0) @binding(4) var geometry_current: texture_2d<f32>;
@group(0) @binding(5) var geometry_previous: texture_2d<f32>;
@group(0) @binding(6) var temporal_current: texture_2d<f32>;
@group(0) @binding(7) var temporal_previous: texture_2d<f32>;
@group(0) @binding(8) var resolved_current: texture_2d_array<f32>;
@group(0) @binding(9) var resolved_previous: texture_2d_array<f32>;
@group(0) @binding(10) var<storage, read> p: array<vec4<f32>>;

struct ReconstructionMetrics {
    occupied_sample_count: atomic<u32>,
    raw_radiance_temporal_delta_sum: atomic<u32>,
    raw_transmittance_temporal_delta_sum: atomic<u32>,
    resolved_radiance_temporal_delta_sum: atomic<u32>,
    raw_resolved_radiance_residual_sum: atomic<u32>,
    history_accepted_count: atomic<u32>,
    history_rejected_count: atomic<u32>,
    stable_age_sum: atomic<u32>,
    persistent_confidence_sum: atomic<u32>,
    raw_radiance_spatial_variation_sum: atomic<u32>,
    resolved_radiance_spatial_variation_sum: atomic<u32>,
    // These fields sample the full-resolution resolved output lattice. They
    // are intentionally separate from raw-cloud variation so bilinear
    // upsampling cannot qualify on one low-resolution texel spacing.
    final_output_adjacent_variation_sum: atomic<u32>,
    final_output_scale_separated_variation_sum: atomic<u32>,
    first_depth_delta_sum: atomic<u32>,
    mean_depth_delta_sum: atomic<u32>,
    optical_depth_delta_sum: atomic<u32>,
    raw_radiance_non_finite_count: atomic<u32>,
    resolved_radiance_non_finite_count: atomic<u32>,
};
@group(0) @binding(11) var<storage, read_write> metrics:
    ReconstructionMetrics;

const GRID_WIDTH: u32 = 64u;
const GRID_HEIGHT: u32 = 36u;
const METRIC_SCALE: f32 = 1000000.0;

fn photopic(value: vec3<f32>) -> f32 {
    return dot(value, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn finite_rgb(value: vec3<f32>) -> bool {
    return all(value == value) &&
        max(max(abs(value.r), abs(value.g)), abs(value.b)) <= 65504.0;
}

fn relative_scalar_delta(first: f32, second: f32) -> f32 {
    return clamp(
        abs(first - second) /
            max(0.0001, max(abs(first), abs(second))),
        0.0, 1.0);
}

fn encode_metric(value: f32) -> u32 {
    return u32(round(clamp(value, 0.0, 1.0) * METRIC_SCALE));
}

@compute @workgroup_size(8, 8, 1)
fn cloud_reconstruction_metrics_compute(
    @builtin(global_invocation_id) id: vec3<u32>,
) {
    if (id.x >= GRID_WIDTH || id.y >= GRID_HEIGHT) { return; }
    let uv = (vec2<f32>(id.xy) + vec2<f32>(0.5)) /
        vec2<f32>(f32(GRID_WIDTH), f32(GRID_HEIGHT));
    let raw_dimensions = vec2<i32>(textureDimensions(raw_radiance_current));
    let raw_pixel = clamp(
        vec2<i32>(floor(uv * vec2<f32>(raw_dimensions))),
        vec2<i32>(0), raw_dimensions - vec2<i32>(1));
    let raw_neighbor = min(
        raw_pixel + vec2<i32>(1, 0), raw_dimensions - vec2<i32>(1));
    let resolved_dimensions = vec2<i32>(textureDimensions(resolved_current));
    let resolved_pixel = clamp(
        vec2<i32>(floor(uv * vec2<f32>(resolved_dimensions))),
        vec2<i32>(0), resolved_dimensions - vec2<i32>(1));
    let resolved_neighbor = clamp(
        resolved_pixel + vec2<i32>(1, 0),
        vec2<i32>(0), resolved_dimensions - vec2<i32>(1));
    let resolved_scale_neighbor = clamp(
        resolved_pixel + vec2<i32>(4, 0),
        vec2<i32>(0), resolved_dimensions - vec2<i32>(1));

    let current_transmittance = textureLoad(
        raw_transmittance_current, raw_pixel, 0);
    let previous_transmittance = textureLoad(
        raw_transmittance_previous, raw_pixel, 0);
    let current_opacity = 1.0 - clamp(current_transmittance.a, 0.0, 1.0);
    let previous_opacity = 1.0 - clamp(previous_transmittance.a, 0.0, 1.0);
    if (max(current_opacity, previous_opacity) < 0.02) { return; }
    atomicAdd(&metrics.occupied_sample_count, 1u);

    let current_raw = textureLoad(raw_radiance_current, raw_pixel, 0).rgb;
    let previous_raw = textureLoad(raw_radiance_previous, raw_pixel, 0).rgb;
    let neighbor_raw = textureLoad(raw_radiance_current, raw_neighbor, 0).rgb;
    let current_resolved = textureLoad(
        resolved_current, resolved_pixel, 0, 0).rgb;
    let previous_resolved = textureLoad(
        resolved_previous, resolved_pixel, 0, 0).rgb;
    let neighbor_resolved = textureLoad(
        resolved_current, resolved_neighbor, 0, 0).rgb;
    let scale_neighbor_resolved = textureLoad(
        resolved_current, resolved_scale_neighbor, 0, 0).rgb;
    let raw_finite = finite_rgb(current_raw) && finite_rgb(previous_raw) &&
        finite_rgb(neighbor_raw);
    let resolved_finite = finite_rgb(current_resolved) &&
        finite_rgb(previous_resolved) && finite_rgb(neighbor_resolved);
    let scale_neighbor_finite = finite_rgb(scale_neighbor_resolved);
    if (!raw_finite) {
        atomicAdd(&metrics.raw_radiance_non_finite_count, 1u);
    } else {
        let current_y = photopic(current_raw);
        let previous_y = photopic(previous_raw);
        let neighbor_y = photopic(neighbor_raw);
        atomicAdd(&metrics.raw_radiance_temporal_delta_sum,
            encode_metric(relative_scalar_delta(current_y, previous_y)));
        atomicAdd(&metrics.raw_radiance_spatial_variation_sum,
            encode_metric(relative_scalar_delta(current_y, neighbor_y)));
    }
    if (!resolved_finite) {
        atomicAdd(&metrics.resolved_radiance_non_finite_count, 1u);
    } else {
        let current_y = photopic(current_resolved);
        let previous_y = photopic(previous_resolved);
        let neighbor_y = photopic(neighbor_resolved);
        atomicAdd(&metrics.resolved_radiance_temporal_delta_sum,
            encode_metric(relative_scalar_delta(current_y, previous_y)));
        atomicAdd(&metrics.resolved_radiance_spatial_variation_sum,
            encode_metric(relative_scalar_delta(current_y, neighbor_y)));
        atomicAdd(&metrics.final_output_adjacent_variation_sum,
            encode_metric(relative_scalar_delta(current_y, neighbor_y)));
        if (scale_neighbor_finite) {
            atomicAdd(&metrics.final_output_scale_separated_variation_sum,
                encode_metric(relative_scalar_delta(
                    current_y, photopic(scale_neighbor_resolved))));
        }
        if (raw_finite) {
            atomicAdd(&metrics.raw_resolved_radiance_residual_sum,
                encode_metric(relative_scalar_delta(
                    photopic(current_raw), current_y)));
        }
    }

    let current_transmittance_y = clamp(
        photopic(current_transmittance.rgb), 0.0, 1.0);
    let previous_transmittance_y = clamp(
        photopic(previous_transmittance.rgb), 0.0, 1.0);
    atomicAdd(&metrics.raw_transmittance_temporal_delta_sum,
        encode_metric(abs(
            current_transmittance_y - previous_transmittance_y)));

    let current_geometry = textureLoad(geometry_current, raw_pixel, 0);
    let previous_geometry = textureLoad(geometry_previous, raw_pixel, 0);
    let first_depth_delta = abs(current_geometry.x - previous_geometry.x) /
        max(1.0, min(current_geometry.x, previous_geometry.x));
    let mean_depth_delta = abs(current_geometry.y - previous_geometry.y) /
        max(1.0, min(current_geometry.y, previous_geometry.y));
    let optical_depth_delta = abs(current_geometry.z - previous_geometry.z) /
        max(0.08, max(current_geometry.z, previous_geometry.z));
    atomicAdd(&metrics.first_depth_delta_sum,
        encode_metric(first_depth_delta));
    atomicAdd(&metrics.mean_depth_delta_sum,
        encode_metric(mean_depth_delta));
    atomicAdd(&metrics.optical_depth_delta_sum,
        encode_metric(optical_depth_delta));

    let temporal_dimensions = vec2<i32>(textureDimensions(temporal_current));
    let temporal_pixel = clamp(
        vec2<i32>(floor(uv * vec2<f32>(temporal_dimensions))),
        vec2<i32>(0), temporal_dimensions - vec2<i32>(1));
    let current_temporal = textureLoad(temporal_current, temporal_pixel, 0);
    let previous_temporal = textureLoad(temporal_previous, temporal_pixel, 0);
    atomicAdd(&metrics.stable_age_sum,
        encode_metric(current_temporal.w));
    atomicAdd(&metrics.persistent_confidence_sum,
        encode_metric(current_temporal.z));
    let has_prior_history = p[22].z > 0.5 && p[33].w > 0.5 &&
        previous_temporal.w >= (0.5 / 64.0);
    if (has_prior_history) {
        let accepted = current_temporal.w > (1.5 / 64.0);
        if (accepted) {
            atomicAdd(&metrics.history_accepted_count, 1u);
        } else {
            atomicAdd(&metrics.history_rejected_count, 1u);
        }
    }
}
`;

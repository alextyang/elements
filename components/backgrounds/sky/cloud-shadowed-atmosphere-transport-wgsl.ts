/**
 * One numerical definition of the clear atmosphere after directional cloud
 * shadowing. Both the atmosphere background and every weather marcher embed
 * this source verbatim. The surrounding shader must provide the physical
 * atmosphere consumer and DIRECTIONAL_COUPLING_ATLAS_WGSL before this block.
 */
export const CLOUD_SHADOWED_ATMOSPHERE_TRANSPORT_WGSL = /* wgsl */ `
struct CloudShadowedAtmosphereSample {
    removed_source_coefficient: vec3<f32>,
    shadow_amount: f32,
    partiality: f32,
};

struct CloudShadowedAtmosphereLossNode {
    loss_integrand: vec3<f32>,
    shadow_amount: f32,
    partiality: f32,
};

struct CloudShadowedAtmosphereSegmentTransport {
    radiance: vec3<f32>,
    transmittance: vec3<f32>,
    removed_radiance: vec3<f32>,
};

fn cloud_shadowed_atmosphere_sample(
    point: vec3<f32>, view_direction: vec3<f32>,
) -> CloudShadowedAtmosphereSample {
    let medium = atmo_sample_medium(point);
    var removed_source = vec3<f32>(0.0);
    var shadow_amount = 0.0;
    var partiality = 0.0;
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        if (!atmo_source_enabled(source_index)) { continue; }
        let source_direction = atmo_source_direction(source_index);
        let source = atmo_source_radiance_radius(source_index);
        let source_irradiance = source.rgb * atmo_source_solid_angle(source.w);
        let atmosphere_transfer = atmo_transmittance_to_space(
            point, source_direction);
        let cloud_transfer = clamp(
            coupling_cloud_source_aerial_transmittance_at(
            point, source_index), vec3<f32>(0.0), vec3<f32>(1.0));
        let scalar_visibility = clamp(dot(
            cloud_transfer, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
        shadow_amount = max(shadow_amount, 1.0 - scalar_visibility);
        partiality = max(partiality,
            4.0 * scalar_visibility * (1.0 - scalar_visibility));
        let cosine = dot(view_direction, source_direction);
        let phase_scattering = medium.rayleigh * atmo_rayleigh_phase(cosine) +
            medium.mie * atmo_cornette_shanks_phase(cosine);
        removed_source += source_irradiance * atmosphere_transfer *
            phase_scattering * (vec3<f32>(1.0) - cloud_transfer);
    }
    return CloudShadowedAtmosphereSample(
        removed_source, shadow_amount, partiality);
}

// Exact clear-air transfer from a segment origin to a point on the same ray.
// For a ground-going ray reciprocity uses the reverse sky boundary; upward
// rays use the forward boundary. The quotient is evaluated at every loss node
// rather than promoting one sampled extinction across an interval.
fn cloud_clear_segment_to_point_transmittance(
    origin_boundary_transmittance: vec3<f32>, point: vec3<f32>,
    direction: vec3<f32>, ray_hits_ground: bool,
) -> vec3<f32> {
    if (ray_hits_ground) {
        let point_to_space = atmo_transmittance_to_space(point, -direction);
        return clamp(atmo_safe_div(point_to_space,
            max(origin_boundary_transmittance, vec3<f32>(1e-8))),
            vec3<f32>(0.0), vec3<f32>(1.0));
    }
    let point_to_space = atmo_transmittance_to_space(point, direction);
    return clamp(atmo_safe_div(origin_boundary_transmittance,
        max(point_to_space, vec3<f32>(1e-8))),
        vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_shadowed_atmosphere_loss_node(
    origin: vec3<f32>, direction: vec3<f32>, distance: f32,
    ray_hits_ground: bool, origin_boundary_transmittance: vec3<f32>,
) -> CloudShadowedAtmosphereLossNode {
    let point = origin + direction * distance;
    let sample = cloud_shadowed_atmosphere_sample(point, direction);
    let camera_transfer = cloud_clear_segment_to_point_transmittance(
        origin_boundary_transmittance, point, direction, ray_hits_ground);
    return CloudShadowedAtmosphereLossNode(
        camera_transfer * sample.removed_source_coefficient,
        sample.shadow_amount, sample.partiality);
}

// Embedded 2/5-node rule for one interval. Refinement is driven by both the
// visibility transition and the radiometric loss itself; the original two
// nodes are retained when the three Kronrod extension nodes are evaluated.
fn cloud_shadowed_atmosphere_loss_interval(
    origin: vec3<f32>, direction: vec3<f32>, t0: f32, t1: f32,
    ray_hits_ground: bool, origin_boundary_transmittance: vec3<f32>,
) -> vec3<f32> {
    let center = 0.5 * (t0 + t1);
    let half_length = 0.5 * max(0.0, t1 - t0);
    if (half_length <= 0.0) { return vec3<f32>(0.0); }
    let distance_a = center - half_length * COUPLING_AERIAL_SHADOW_GL_NODE;
    let distance_b = center + half_length * COUPLING_AERIAL_SHADOW_GL_NODE;
    let sample_a = cloud_shadowed_atmosphere_loss_node(
        origin, direction, distance_a, ray_hits_ground,
        origin_boundary_transmittance);
    let sample_b = cloud_shadowed_atmosphere_loss_node(
        origin, direction, distance_b, ray_hits_ground,
        origin_boundary_transmittance);
    let maximum_loss = max(
        max(max(sample_a.loss_integrand.x, sample_a.loss_integrand.y),
            sample_a.loss_integrand.z),
        max(max(sample_b.loss_integrand.x, sample_b.loss_integrand.y),
            sample_b.loss_integrand.z));
    let loss_delta = abs(sample_a.loss_integrand - sample_b.loss_integrand);
    let maximum_loss_delta = max(max(loss_delta.x, loss_delta.y), loss_delta.z);
    let refine =
        abs(sample_a.shadow_amount - sample_b.shadow_amount) >
            COUPLING_AERIAL_SHADOW_DISAGREEMENT_THRESHOLD ||
        max(sample_a.partiality, sample_b.partiality) >
            COUPLING_AERIAL_SHADOW_PARTIAL_THRESHOLD ||
        maximum_loss_delta > max(1e-8,
            maximum_loss * COUPLING_AERIAL_SHADOW_LOSS_RELATIVE_THRESHOLD);
    if (!refine) {
        return max(vec3<f32>(0.0), half_length *
            (sample_a.loss_integrand + sample_b.loss_integrand));
    }
    let outer_a = cloud_shadowed_atmosphere_loss_node(
        origin, direction,
        center - half_length * COUPLING_AERIAL_SHADOW_KRONROD_OUTER_NODE,
        ray_hits_ground, origin_boundary_transmittance);
    let middle = cloud_shadowed_atmosphere_loss_node(
        origin, direction, center, ray_hits_ground,
        origin_boundary_transmittance);
    let outer_b = cloud_shadowed_atmosphere_loss_node(
        origin, direction,
        center + half_length * COUPLING_AERIAL_SHADOW_KRONROD_OUTER_NODE,
        ray_hits_ground, origin_boundary_transmittance);
    return max(vec3<f32>(0.0), half_length * (
        COUPLING_AERIAL_SHADOW_KRONROD_OUTER_WEIGHT *
            (outer_a.loss_integrand + outer_b.loss_integrand) +
        COUPLING_AERIAL_SHADOW_KRONROD_BASE_WEIGHT *
            (sample_a.loss_integrand + sample_b.loss_integrand) +
        COUPLING_AERIAL_SHADOW_KRONROD_CENTER_WEIGHT *
            middle.loss_integrand));
}

// Canonical shadowed-atmosphere segment operator. Long boundary rays retain
// the 32-interval production ceiling. Short clear gaps scale down to their
// physical length, so embedding this exact operator does not multiply a
// 2/5-node solve by every 80--240 m cloud stratum.
fn cloud_shadowed_atmosphere_segment_transport(
    start_world: vec3<f32>, end_world: vec3<f32>,
) -> CloudShadowedAtmosphereSegmentTransport {
    let clear = physical_atmosphere_segment(start_world, end_world);
    let delta = end_world - start_world;
    let distance = length(delta);
    if (distance <= 1e-6) {
        return CloudShadowedAtmosphereSegmentTransport(
            clear.radiance, clear.transmittance, vec3<f32>(0.0));
    }
    let direction = delta / distance;
    let ray_limit = atmo_ray_limit(start_world, direction);
    let ray_hits_ground = ray_limit.y > 0.5;
    let boundary_direction = select(
        direction, -direction, ray_hits_ground);
    let origin_boundary_transmittance = atmo_transmittance_to_space(
        start_world, boundary_direction);
    let local_up = normalize(start_world);
    let distribution_power = mix(
        1.0, 1.45,
        smoothstep(0.20, 0.90, abs(dot(direction, local_up))));
    let interval_count = max(1u, min(
        COUPLING_AERIAL_SHADOW_INTERVAL_COUNT,
        u32(ceil(distance *
            f32(COUPLING_AERIAL_SHADOW_INTERVAL_COUNT) / 100.0))));
    var removed_radiance = vec3<f32>(0.0);
    for (var index = 0u;
        index < COUPLING_AERIAL_SHADOW_INTERVAL_COUNT; index += 1u) {
        if (index >= interval_count) { break; }
        let t0 = distance * pow(
            f32(index) / f32(interval_count), distribution_power);
        let t1 = distance * pow(
            f32(index + 1u) / f32(interval_count), distribution_power);
        removed_radiance += cloud_shadowed_atmosphere_loss_interval(
            start_world, direction, t0, t1, ray_hits_ground,
            origin_boundary_transmittance);
    }
    removed_radiance = max(vec3<f32>(0.0), removed_radiance);
    let radiance = max(vec3<f32>(0.0), clear.radiance -
        min(clear.radiance, removed_radiance));
    return CloudShadowedAtmosphereSegmentTransport(
        radiance, clear.transmittance, removed_radiance);
}
`;

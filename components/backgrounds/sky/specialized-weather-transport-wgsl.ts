/**
 * Bounded, entry-point-local weather transport for the production WebGPU sky.
 *
 * These snippets are appended to the already isolated cloud transport core.
 * They intentionally avoid function-private record arrays: each support event
 * is rediscovered with a bounded storage-buffer scan, while only scalar affine
 * transport state survives between steps.  That keeps Metal from lowering the
 * former monolithic 172-record active-set graph for every cloud pipeline.
 */

export const SPECIALIZED_WEATHER_TRANSPORT_COMMON_WGSL = /* wgsl */ `
struct SpecializedMediaSample {
    extinction_rgb_per_km: vec3<f32>,
    source_coefficient_rgb_per_km: vec3<f32>,
    velocity: vec2<f32>,
    metadata_weight: f32,
    layer_identifier: f32,
};

struct CloudLayerOutput {
    @location(0) radiance_first_depth: vec4<f32>,
    @location(1) transmittance_mean_depth: vec4<f32>,
    @location(2) motion_steps: vec4<f32>,
};

fn specialized_empty_media_sample() -> SpecializedMediaSample {
    return SpecializedMediaSample(
        vec3<f32>(0.0), vec3<f32>(0.0), vec2<f32>(0.0), 0.0, -1.0);
}

fn specialized_encode_packet(packet: LayerPacket) -> CloudLayerOutput {
    var output: CloudLayerOutput;
    output.radiance_first_depth = vec4<f32>(
        packet.transport.radiance, packet.first_depth);
    output.transmittance_mean_depth = vec4<f32>(
        packet.transport.transmittance, packet.mean_depth);
    // w carries the physical parent layer.  The compositor uses the texture
    // slice, not this value, as its deterministic depth-sort tie breaker.
    output.motion_steps = vec4<f32>(
        packet.velocity, packet.evaluated_steps, packet.layer_identifier);
    return output;
}

fn specialized_empty_output(
    sort_identifier: f32,
) -> CloudLayerOutput {
    return specialized_encode_packet(LayerPacket(
        camera_transport_identity(), FAR_LIMIT, FAR_LIMIT, 0.0,
        vec2<f32>(0.0), sort_identifier, 0.0));
}

fn specialized_atmosphere_direct_source(
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
        coupling_cloud_source_transmittance_at(point, source_index),
        vec3<bool>(include_cloud_visibility));
    return CouplingAerialDirectSource(
        source_irradiance * atmosphere_transport,
        effective_phase,
        CouplingPassiveCloudTransfer(cloud_transmittance, vec3<f32>(0.0)));
}

// Local air is integrated in every occupied weather segment. The relative
// baseline uses the same cloud-shadowed source as the rendered atmosphere.
fn specialized_atmosphere_source_sample(
    renderer_point: vec3<f32>, renderer_direction: vec3<f32>,
    include_cloud_visibility: bool,
) -> CouplingAerialSourceSample {
    let point = renderer_to_atmosphere_world(renderer_point);
    let view_direction_atmosphere = normalize(vec3<f32>(
        renderer_direction.x, renderer_direction.z, renderer_direction.y));
    let medium = atmo_sample_medium(point);
    let source_0 = specialized_atmosphere_direct_source(
        0u, point, view_direction_atmosphere, include_cloud_visibility);
    let source_1 = specialized_atmosphere_direct_source(
        1u, point, view_direction_atmosphere, include_cloud_visibility);
    var diffuse_incident = vec3<f32>(0.0);
    for (var source_index = 0u; source_index < ATMO_SOURCE_COUNT;
        source_index += 1u) {
        let source = atmo_source_radiance_radius(source_index);
        let source_irradiance = select(
            vec3<f32>(0.0),
            source.rgb * atmo_source_solid_angle(source.w),
            atmo_source_enabled(source_index));
        diffuse_incident += source_irradiance *
            atmo_multiple_scattering(point, atmo_source_direction(source_index));
    }
    return coupling_aerial_source(
        CouplingAerialMedium(medium.extinction, medium.scattering),
        diffuse_incident,
        CouplingPassiveCloudTransfer(vec3<f32>(1.0), vec3<f32>(0.0)),
        source_0,
        source_1);
}

fn specialized_clear_atmosphere_segment(
    origin: vec3<f32>, direction: vec3<f32>, near_km: f32, far_km: f32,
) -> CameraTransport {
    return cloud_background_atmosphere_segment(
        origin, direction, near_km, far_km);
}

fn specialized_lightning_direct_packet(
    origin: vec3<f32>, direction: vec3<f32>, scene_time_seconds: f32,
) -> LayerPacket {
    let event_power = weather_production_lightning_event_power(
        scene_time_seconds).emitted_power_rgb;
    if (all(event_power <= vec3<f32>(0.0))) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), -1.0, 0.0);
    }
    let event_base = WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET;
    let bounds_min = weather_scene.data[event_base + 6u].xyz - vec3<f32>(0.5);
    let bounds_max = weather_scene.data[event_base + 7u].xyz + vec3<f32>(0.5);
    let local_origin = weather_renderer_world_to_local_ean(origin);
    let inverse_direction = 1.0 / select(
        vec3<f32>(1e-8), direction,
        abs(direction) > vec3<f32>(1e-8));
    let bounds_first = (bounds_min - local_origin) * inverse_direction;
    let bounds_second = (bounds_max - local_origin) * inverse_direction;
    let bounds_near = max(0.0, max(max(min(bounds_first, bounds_second).x,
        min(bounds_first, bounds_second).y), min(bounds_first, bounds_second).z));
    let bounds_far = min(min(max(bounds_first, bounds_second).x,
        max(bounds_first, bounds_second).y), max(bounds_first, bounds_second).z);
    if (bounds_far <= bounds_near) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), -1.0, 0.0);
    }
    let segment_count = min(WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS,
        u32(max(0.0, weather_scene.data[3u].x) + 0.5));
    var weighted_length = 0.0;
    var strongest_scores = array<f32, 2>(-1.0, -1.0);
    var strongest_ray_distances = array<f32, 2>(FAR_LIMIT, FAR_LIMIT);
    var strongest_channel_world = array<vec3<f32>, 2>(origin, origin);
    var strongest_segment_weights = array<f32, 2>(0.0, 0.0);
    var strongest_segment_lengths = array<f32, 2>(0.0, 0.0);
    var strongest_psf = array<f32, 2>(0.0, 0.0);
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let segment = weather_production_lightning_segment(index);
        let a = weather_local_ean_to_renderer_world(
            segment.start_east_altitude_north_km);
        let b = weather_local_ean_to_renderer_world(
            segment.end_east_altitude_north_km);
        let edge = b - a;
        let edge_length_squared = dot(edge, edge);
        let edge_length = sqrt(max(0.0, edge_length_squared));
        weighted_length += edge_length * segment.emissive_weight;
        if (edge_length_squared <= 1e-12 || segment.emissive_weight <= 0.0) {
            continue;
        }
        let ray_edge = dot(direction, edge);
        let offset = origin - a;
        let ray_offset = dot(direction, offset);
        let edge_offset = dot(edge, offset);
        let denominator = max(1e-12, edge_length_squared - ray_edge * ray_edge);
        var edge_progress = clamp((edge_offset - ray_edge * ray_offset) /
            denominator, 0.0, 1.0);
        var channel_point = a + edge * edge_progress;
        var ray_distance = max(0.0, dot(channel_point - origin, direction));
        let ray_point = origin + direction * ray_distance;
        edge_progress = clamp(dot(ray_point - a, edge) /
            edge_length_squared, 0.0, 1.0);
        channel_point = a + edge * edge_progress;
        ray_distance = dot(channel_point - origin, direction);
        if (ray_distance <= 1e-5) { continue; }
        let separation = channel_point - (origin + direction * ray_distance);
        let distance_squared = dot(separation, separation);
        let angular_distance = sqrt(max(0.0, distance_squared)) /
            ray_distance;
        let radius_km = max(2e-6, segment.radius_metres * 0.001);
        let core_sigma = max(0.000075, radius_km / ray_distance);
        let wing_sigma = max(0.00042, core_sigma * 4.0);
        if (angular_distance > wing_sigma * 7.0) { continue; }
        let core_coordinate = angular_distance / core_sigma;
        let wing_coordinate = angular_distance / wing_sigma;
        let psf = 0.88 * exp(-0.5 * core_coordinate * core_coordinate) /
                (2.0 * WEATHER_PI * core_sigma * core_sigma) +
            0.12 * pow(1.0 + wing_coordinate * wing_coordinate, -2.5) /
                (WEATHER_PI * wing_sigma * wing_sigma / 1.5);
        // Ranking by the radiometric contribution, rather than only screen
        // distance, keeps a nearby dim branch from replacing the main return
        // channel and lets crossings retain both finite line contributions.
        let score = edge_length * segment.emissive_weight * psf /
            max(1e-8, ray_distance * ray_distance);
        if (score > strongest_scores[0]) {
            strongest_scores[1] = strongest_scores[0];
            strongest_ray_distances[1] = strongest_ray_distances[0];
            strongest_channel_world[1] = strongest_channel_world[0];
            strongest_segment_weights[1] = strongest_segment_weights[0];
            strongest_segment_lengths[1] = strongest_segment_lengths[0];
            strongest_psf[1] = strongest_psf[0];
            strongest_scores[0] = score;
            strongest_ray_distances[0] = ray_distance;
            strongest_channel_world[0] = channel_point;
            strongest_segment_weights[0] = segment.emissive_weight;
            strongest_segment_lengths[0] = edge_length;
            strongest_psf[0] = psf;
        } else if (score > strongest_scores[1]) {
            strongest_scores[1] = score;
            strongest_ray_distances[1] = ray_distance;
            strongest_channel_world[1] = channel_point;
            strongest_segment_weights[1] = segment.emissive_weight;
            strongest_segment_lengths[1] = edge_length;
            strongest_psf[1] = psf;
        }
    }
    if (strongest_scores[0] < 0.0 || weighted_length <= 1e-8) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), -1.0, 0.0);
    }
    let owner_index = u32(max(0.0, round(weather_scene.data[
        WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET + 1u].w)));
    var radiance = vec3<f32>(0.0);
    var first_depth = FAR_LIMIT;
    var exact_trace_count = 0u;
    for (var selected = 0u; selected < 2u; selected += 1u) {
        if (strongest_scores[selected] < 0.0) { continue; }
        let ray_distance = strongest_ray_distances[selected];
        let channel_world = strongest_channel_world[selected];
        let line_fraction = strongest_segment_lengths[selected] *
            strongest_segment_weights[selected] / weighted_length;
        let geometric = 1.0 / (4.0 * WEATHER_PI * max(1e-8,
            ray_distance * ray_distance));
        let atmosphere_transfer = physical_atmosphere_segment(
            renderer_to_atmosphere_world(origin),
            renderer_to_atmosphere_world(channel_world)).transmittance;
        let parent_transfer = weather_parent_owner_segment_transmittance(
            owner_index, origin, channel_world);
        radiance += event_power * line_fraction * geometric *
            strongest_psf[selected] * atmosphere_transfer * parent_transfer;
        first_depth = min(first_depth, ray_distance);
        exact_trace_count += 1u;
    }
    radiance = min(vec3<f32>(65504.0), max(vec3<f32>(0.0), radiance));
    let contribution = max(0.0, photopic(radiance));
    if (contribution <= 1e-10) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), -1.0, 0.0);
    }
    return LayerPacket(CameraTransport(radiance, vec3<f32>(1.0)),
        first_depth, first_depth, 0.0, vec2<f32>(0.0), -1.0,
        f32(segment_count + exact_trace_count * 24u));
}

fn specialized_merge_lightning_packet(
    weather: LayerPacket, lightning: LayerPacket,
) -> LayerPacket {
    if (lightning.first_depth >= FAR_LIMIT) { return weather; }
    if (weather.first_depth >= FAR_LIMIT) { return lightning; }
    var transport = weather.transport;
    if (lightning.first_depth < weather.first_depth) {
        transport = CameraTransport(
            lightning.transport.radiance + weather.transport.radiance,
            weather.transport.transmittance);
    } else {
        transport = CameraTransport(
            weather.transport.radiance + weather.transport.transmittance *
                lightning.transport.radiance,
            weather.transport.transmittance);
    }
    let weather_weight = max(1e-8, weather.opacity_y);
    let lightning_weight = max(1e-8,
        photopic(lightning.transport.radiance));
    let weight = weather_weight + lightning_weight;
    return LayerPacket(sanitize_layer_transport(transport),
        min(weather.first_depth, lightning.first_depth),
        (weather.mean_depth * weather_weight + lightning.mean_depth *
            lightning_weight) / weight,
        weather.opacity_y, weather.velocity, weather.layer_identifier,
        weather.evaluated_steps + lightning.evaluated_steps);
}

fn specialized_relative_packet(
    combined: CameraTransport,
    clear: CameraTransport,
    weather_transmittance: vec3<f32>,
    first_depth: f32,
    weighted_mean_depth: f32,
    contribution_weight: f32,
    weighted_velocity: vec2<f32>,
    dominant_layer: f32,
    evaluated_steps: f32,
    far_sentinel: f32,
) -> LayerPacket {
    let bounded_weather_t = clamp(
        weather_transmittance, vec3<f32>(0.0), vec3<f32>(1.0));
    let opacity_y = 1.0 - clamp(photopic(bounded_weather_t), 0.0, 1.0);
    let relative = relative_weather_transport(
        combined, clear, bounded_weather_t);
    let emissive_y = max(0.0, photopic(relative.radiance));
    if ((opacity_y <= 0.0001 && emissive_y <= 1e-10) ||
        first_depth >= far_sentinel ||
        contribution_weight <= 1e-8) {
        return LayerPacket(
            camera_transport_identity(), FAR_LIMIT, FAR_LIMIT, 0.0,
            vec2<f32>(0.0), dominant_layer, evaluated_steps);
    }
    return LayerPacket(
        sanitize_layer_transport(relative),
        first_depth,
        weighted_mean_depth / contribution_weight,
        opacity_y,
        weighted_velocity / contribution_weight,
        dominant_layer,
        evaluated_steps);
}
`;

export const SPECIALIZED_HYDROMETEOR_TRANSPORT_WGSL = /* wgsl */ `
fn specialized_hydrometeor_sample(
    origin: vec3<f32>, point: vec3<f32>, distance_km: f32,
    direction: vec3<f32>, sun_direction: vec3<f32>,
    moon_direction: vec3<f32>, record_count: u32,
) -> SpecializedMediaSample {
    var result = specialized_empty_media_sample();
    let field_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    let incident = HydrometeorLocalIrradianceAtSample(
        physical_source_irradiance_at(0u, point),
        physical_source_irradiance_at(1u, point),
        physical_diffuse_irradiance_at(point),
        physical_ground_irradiance_at(point));
    var overlap = hydrometeor_empty_passive_overlap();
    var optical_weight = 0.0;
    var weighted_velocity = vec2<f32>(0.0);
    var dominant_weight = 0.0;
    for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
        if (index >= record_count) { break; }
        let record = hydrometeor_fields.records[index];
        let interval = hydrometeor_record_interval(origin, direction, record);
        if (distance_km < interval.x || distance_km > interval.y) { continue; }
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

        // Boundary-layer owners carry (-1,-1) and receive the unobstructed
        // local atmosphere.  Cloud precipitation uses only its exact packed
        // parent system/layer; it can never borrow a dominant neighbour.
        let cloud_owned = record.identity.z >= -0.25 &&
            record.energy_and_importance.w >= -0.25;
        var sun_parent_t = vec3<f32>(1.0);
        var moon_parent_t = vec3<f32>(1.0);
        var diffuse_parent_t = vec3<f32>(1.0);
        var parent_scattering = vec3<f32>(0.0);
        if (cloud_owned) {
            let parent_owner = u32(clamp(
                round(record.identity.z), 0.0, 35.0));
            let owner_confidence = cloud_lv_owner_sample_confidence(
                point, parent_owner);
            sun_parent_t = cloud_lv_sample_owner_direct_transmittance(
                point, parent_owner, 0u);
            moon_parent_t = cloud_lv_sample_owner_direct_transmittance(
                point, parent_owner, 1u);
            diffuse_parent_t = vec3<f32>(1.0 - owner_confidence);
            parent_scattering = cloud_lv_sample_owner_scattering_radiance(
                point, -direction, parent_owner, diffusion);
        }
        let parent = HydrometeorParentLightCoupling(
            record.identity.z,
            record.energy_and_importance.w,
            hydrometeor_passive_rgb_transfer(
                sun_parent_t, vec3<f32>(0.0)),
            hydrometeor_passive_rgb_transfer(
                moon_parent_t, vec3<f32>(0.0)),
            hydrometeor_passive_rgb_transfer(
                diffuse_parent_t, vec3<f32>(0.0)),
            hydrometeor_passive_rgb_transfer(
                vec3<f32>(1.0), vec3<f32>(0.0)),
            parent_scattering);
        let local_up = normalize(point + vec3<f32>(1e-12));
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
            1.0 - upper_integral);
        overlap = hydrometeor_accumulate_passive_overlap(overlap, resolved);
        optical_weight += sample_weight;
        weighted_velocity += sample_weight * record.kinematics.xy;
        if (sample_weight > dominant_weight) {
            dominant_weight = sample_weight;
            result.layer_identifier = record.energy_and_importance.w;
        }
    }
    result.extinction_rgb_per_km = max(
        vec3<f32>(0.0), overlap.extinction_rgb_km);
    result.source_coefficient_rgb_per_km = max(
        vec3<f32>(0.0), overlap.source_coefficient_rgb_km);
    if (optical_weight > 1e-8) {
        result.velocity = weighted_velocity / optical_weight;
    }
    let scene_time_seconds = weather_scene.data[1u].y;
    let blowing = weather_production_blowing_volume_sample(
        field_position, -direction, sun_direction, moon_direction,
        scene_time_seconds);
    result.extinction_rgb_per_km += blowing.extinction_rgb_per_km;
    result.source_coefficient_rgb_per_km +=
        blowing.source_coefficient_rgb_per_km;
    result.metadata_weight = photopic(result.extinction_rgb_per_km);
    result.metadata_weight += blowing.metadata_weight;
    return result;
}

fn specialized_march_hydrometeors(
    origin: vec3<f32>, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>, jitter: f32,
) -> LayerPacket {
    let record_count = min(
        u32(max(0.0, hydrometeor_fields.header.x) + 0.5),
        HYDROMETEOR_MAX_FIELDS);
    let blowing_count = min(WEATHER_PRODUCTION_MAX_BLOWING_MEDIA,
        u32(max(0.0, weather_scene.data[3u].w) + 0.5));
    let lightning_active = weather_scene.data[2u].w > 0.5;
    if (record_count == 0u && blowing_count == 0u && !lightning_active) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), -1.0, 0.0);
    }

    var combined_transport = camera_transport_identity();
    var clear_transport = camera_transport_identity();
    var weather_transmittance = vec3<f32>(1.0);
    var first_depth = FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var weighted_velocity = vec2<f32>(0.0);
    var contribution_weight = 0.0;
    var dominant_weight = 0.0;
    var dominant_layer = -1.0;
    var evaluated_steps = 0.0;
    var travelled = 0.0;

    // No private interval table: support is rescanned only at the current
    // finite event.  768 iterations bound both sparse 10 m banks and long
    // slanted precipitation curtains without reviving the monolithic graph.
    for (var iteration = 0u; iteration < 768u; iteration += 1u) {
        if (travelled >= FAR_LIMIT - 1e-5 ||
            maximum_rgb(weather_transmittance) < 0.0005) { break; }
        let boundary_epsilon = max(1e-6, abs(travelled) * 1e-7);
        var support_is_active = false;
        var next_event = FAR_LIMIT;
        var target_step = 0.25;
        for (var index = 0u; index < HYDROMETEOR_MAX_FIELDS; index += 1u) {
            if (index >= record_count) { break; }
            let record = hydrometeor_fields.records[index];
            let interval = hydrometeor_record_interval(
                origin, direction, record);
            if (interval.y <= interval.x) { continue; }
            if (interval.x <= travelled + boundary_epsilon &&
                interval.y > travelled + boundary_epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.y);
                target_step = min(target_step,
                    hydrometeor_record_step_km(
                        origin, direction, record, interval));
            } else if (interval.x > travelled + boundary_epsilon) {
                next_event = min(next_event, interval.x);
            }
        }
        for (var index = 0u; index < WEATHER_PRODUCTION_MAX_BLOWING_MEDIA;
            index += 1u) {
            if (index >= blowing_count) { break; }
            let interval = weather_production_blowing_record_interval(
                origin, direction, index, weather_scene.data[1u].y);
            if (interval.far_km <= interval.near_km) { continue; }
            if (interval.near_km <= travelled + boundary_epsilon &&
                interval.far_km > travelled + boundary_epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.far_km);
                target_step = min(target_step, 0.12);
            } else if (interval.near_km > travelled + boundary_epsilon) {
                next_event = min(next_event, interval.near_km);
            }
        }
        if (!support_is_active) {
            if (next_event >= FAR_LIMIT - 1e-5) { break; }
            if (next_event <= travelled + 1e-6) {
                travelled += 1e-5;
                continue;
            }
            let clear_gap = specialized_clear_atmosphere_segment(
                origin, direction, travelled, next_event);
            combined_transport = compose_camera_transport(
                combined_transport, clear_gap);
            clear_transport = compose_camera_transport(
                clear_transport, clear_gap);
            travelled = next_event;
            continue;
        }

        var step_length = min(target_step, next_event - travelled);
        if (step_length <= 1e-6) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let stratum_jitter = mix(0.16, 0.84, fract(
            jitter + evaluated_steps * 0.61803398875 +
                p[14].w * 0.41421356237));
        var sample_distance = travelled + step_length * stratum_jitter;
        var point = origin + direction * sample_distance;
        var weather = specialized_hydrometeor_sample(
            origin, point, sample_distance, direction,
            sun_direction, moon_direction, record_count);
        var air = specialized_atmosphere_source_sample(
            point, direction, true);
        for (var refinement = 0u; refinement < 4u; refinement += 1u) {
            let combined_extinction = max(vec3<f32>(0.0),
                air.extinction_rgb_per_km +
                    weather.extinction_rgb_per_km);
            let maximum_tau = maximum_rgb(combined_extinction * step_length);
            if (maximum_tau <= 0.2) { break; }
            step_length = max(1e-5,
                step_length * 0.2 / max(0.2, maximum_tau));
            sample_distance = travelled + step_length * stratum_jitter;
            point = origin + direction * sample_distance;
            weather = specialized_hydrometeor_sample(
                origin, point, sample_distance, direction,
                sun_direction, moon_direction, record_count);
            air = specialized_atmosphere_source_sample(point, direction, true);
        }
        let combined_extinction = max(vec3<f32>(0.0),
            air.extinction_rgb_per_km + weather.extinction_rgb_per_km);
        step_length = min(step_length,
            0.2 / max(1e-8, maximum_rgb(combined_extinction)));
        let combined_source = max(vec3<f32>(0.0),
            air.source_radiance_coefficient_rgb_per_km +
                weather.source_coefficient_rgb_per_km);
        let combined_segment = integrate_camera_transport_coefficients(
            combined_extinction, combined_source, step_length);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            step_length);
        let weather_step_t = exp(
            -max(vec3<f32>(0.0), weather.extinction_rgb_per_km) * step_length);
        let contribution = camera_transport_removed_luminance(
            weather_transmittance, weather_step_t);
        if (weather.metadata_weight * step_length > 1e-6) {
            first_depth = min(first_depth, sample_distance);
            weighted_mean_depth += sample_distance * contribution;
            weighted_velocity += weather.velocity * contribution;
            contribution_weight += contribution;
            if (contribution > dominant_weight) {
                dominant_weight = contribution;
                dominant_layer = weather.layer_identifier;
            }
        }
        combined_transport = compose_camera_transport(
            combined_transport, combined_segment);
        clear_transport = compose_camera_transport(
            clear_transport, clear_segment);
        weather_transmittance *= weather_step_t;
        travelled += step_length;
        evaluated_steps += 1.0;
    }
    let weather_packet = specialized_relative_packet(
        combined_transport, clear_transport, weather_transmittance,
        first_depth, weighted_mean_depth, contribution_weight,
        weighted_velocity, dominant_layer, evaluated_steps, FAR_LIMIT);
    let lightning_packet = specialized_lightning_direct_packet(
        origin, direction, weather_scene.data[1u].y);
    return specialized_merge_lightning_packet(
        weather_packet, lightning_packet);
}

@fragment
fn hydrometeor_fragment_physical(input: VertexOut) -> CloudLayerOutput {
    let pixel = floor(input.position.xy);
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (p[30].y > 0.5 && checker != 0) { discard; }
    if (!finite_scalar(hydrometeor_fields.header.x) ||
        (hydrometeor_fields.header.x < 0.5 && weather_scene.data[3u].w < 0.5 &&
            weather_scene.data[2u].w < 0.5)) {
        return specialized_empty_output(-1.0);
    }
    let direction = view_direction(input.uv);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64, i32(pixel.y) % 64);
    let blue_noise = textureLoad(
        blue_noise_texture, blue_noise_cell, 0).r;
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);
    return specialized_encode_packet(specialized_march_hydrometeors(
        origin, direction, sun_direction, moon_direction, jitter));
}
`;

export const SPECIALIZED_UPPER_ATMOSPHERE_TRANSPORT_WGSL = /* wgsl */ `
fn specialized_upper_owner_material(owner: u32) -> vec2<u32> {
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

fn specialized_upper_sample(
    point: vec3<f32>, distance_km: f32, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>,
) -> SpecializedMediaSample {
    var result = specialized_empty_media_sample();
    let local_position = vec3<f32>(
        point.x, length(point) - PLANET_RADIUS, point.z);
    for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS; owner += 1u) {
        let material = specialized_upper_owner_material(owner);
        if (material.y == 0u) { continue; }
        let record = cloud_morphology_load_record(material.x);
        let interval = upper_record_interval(
            vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0),
            direction, record);
        if (distance_km < interval.x || distance_km > interval.y) { continue; }
        let morphology = cloud_morphology_evaluate_owner(
            owner, local_position);
        let density = saturate(morphology.material_weight);
        let profile = morphology.material_profile_code;
        if (density <= 1e-6 || profile == 0u) { continue; }
        let extinction = density * upper_material_extinction_km(profile);
        let weight = photopic(extinction);
        result.extinction_rgb_per_km += extinction;
        result.source_coefficient_rgb_per_km += extinction *
            upper_material_source(
                profile, point, direction, sun_direction, moon_direction);
        result.metadata_weight += weight;
    }
    let aurora = weather_production_aurora_volume_sample(
        local_position, weather_scene.data[1u].y);
    result.extinction_rgb_per_km += aurora.extinction_rgb_per_km;
    result.source_coefficient_rgb_per_km +=
        aurora.source_coefficient_rgb_per_km;
    result.metadata_weight += aurora.metadata_weight;
    result.layer_identifier = 2.0;
    return result;
}

fn specialized_march_upper_atmosphere(
    origin: vec3<f32>, direction: vec3<f32>,
    sun_direction: vec3<f32>, moon_direction: vec3<f32>, jitter: f32,
) -> LayerPacket {
    let aurora_count = min(WEATHER_PRODUCTION_MAX_AURORA_CURTAINS,
        u32(max(0.0, weather_scene.data[3u].z) + 0.5));
    if (cloud_morphology_record_count() == 0u && aurora_count == 0u) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), 2.0, 0.0);
    }
    var combined_transport = camera_transport_identity();
    var clear_transport = camera_transport_identity();
    var weather_transmittance = vec3<f32>(1.0);
    var first_depth = UPPER_ATMOSPHERE_FAR_LIMIT;
    var weighted_mean_depth = 0.0;
    var contribution_weight = 0.0;
    var evaluated_steps = 0.0;
    var travelled = 0.0;

    for (var iteration = 0u; iteration < 512u; iteration += 1u) {
        if (travelled >= UPPER_ATMOSPHERE_FAR_LIMIT - 1e-5 ||
            maximum_rgb(weather_transmittance) < 0.0005) { break; }
        let boundary_epsilon = max(1e-6, abs(travelled) * 1e-7);
        var support_is_active = false;
        var next_event = UPPER_ATMOSPHERE_FAR_LIMIT;
        var target_step = 0.8;
        for (var owner = 0u; owner < CLOUD_MORPHOLOGY_MAX_OWNERS;
            owner += 1u) {
            let material = specialized_upper_owner_material(owner);
            if (material.y == 0u) { continue; }
            let record = cloud_morphology_load_record(material.x);
            let interval = upper_record_interval(origin, direction, record);
            if (interval.y <= interval.x) { continue; }
            if (interval.x <= travelled + boundary_epsilon &&
                interval.y > travelled + boundary_epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.y);
                target_step = min(target_step,
                    upper_record_step_km(origin, direction, record, interval));
            } else if (interval.x > travelled + boundary_epsilon) {
                next_event = min(next_event, interval.x);
            }
        }
        for (var index = 0u; index < WEATHER_PRODUCTION_MAX_AURORA_CURTAINS;
            index += 1u) {
            if (index >= aurora_count) { break; }
            let interval = weather_production_aurora_interval(
                origin, direction, weather_production_aurora_state(index));
            if (interval.far_km <= interval.near_km) { continue; }
            if (interval.near_km <= travelled + boundary_epsilon &&
                interval.far_km > travelled + boundary_epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.far_km);
                target_step = min(target_step, 1.5);
            } else if (interval.near_km > travelled + boundary_epsilon) {
                next_event = min(next_event, interval.near_km);
            }
        }
        if (!support_is_active) {
            if (next_event >= UPPER_ATMOSPHERE_FAR_LIMIT - 1e-5) { break; }
            if (next_event <= travelled + 1e-6) {
                travelled += 1e-5;
                continue;
            }
            let clear_gap = specialized_clear_atmosphere_segment(
                origin, direction, travelled, next_event);
            combined_transport = compose_camera_transport(
                combined_transport, clear_gap);
            clear_transport = compose_camera_transport(
                clear_transport, clear_gap);
            travelled = next_event;
            continue;
        }
        var step_length = min(target_step, next_event - travelled);
        if (step_length <= 1e-6) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let stratum_jitter = mix(0.16, 0.84, fract(
            jitter + evaluated_steps * 0.61803398875 +
                p[14].z * 0.41421356237));
        var sample_distance = travelled + step_length * stratum_jitter;
        var point = origin + direction * sample_distance;
        var weather = specialized_upper_sample(
            point, sample_distance, direction, sun_direction, moon_direction);
        var air = specialized_atmosphere_source_sample(
            point, direction, true);
        for (var refinement = 0u; refinement < 4u; refinement += 1u) {
            let combined_extinction = max(vec3<f32>(0.0),
                air.extinction_rgb_per_km +
                    weather.extinction_rgb_per_km);
            let maximum_tau = maximum_rgb(combined_extinction * step_length);
            if (maximum_tau <= 0.2) { break; }
            step_length = max(1e-5,
                step_length * 0.2 / max(0.2, maximum_tau));
            sample_distance = travelled + step_length * stratum_jitter;
            point = origin + direction * sample_distance;
            weather = specialized_upper_sample(
                point, sample_distance, direction,
                sun_direction, moon_direction);
            air = specialized_atmosphere_source_sample(point, direction, true);
        }
        let combined_extinction = max(vec3<f32>(0.0),
            air.extinction_rgb_per_km + weather.extinction_rgb_per_km);
        step_length = min(step_length,
            0.2 / max(1e-8, maximum_rgb(combined_extinction)));
        let combined_segment = integrate_camera_transport_coefficients(
            combined_extinction,
            max(vec3<f32>(0.0),
                air.source_radiance_coefficient_rgb_per_km +
                    weather.source_coefficient_rgb_per_km),
            step_length);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            step_length);
        let weather_step_t = exp(
            -max(vec3<f32>(0.0), weather.extinction_rgb_per_km) * step_length);
        let extinction_contribution = camera_transport_removed_luminance(
            weather_transmittance, weather_step_t);
        let emission_contribution = max(0.0, photopic(
            combined_transport.transmittance *
                weather.source_coefficient_rgb_per_km) * step_length);
        let contribution = max(extinction_contribution, emission_contribution);
        if (weather.metadata_weight * step_length > 1e-7) {
            first_depth = min(first_depth, sample_distance);
            weighted_mean_depth += sample_distance * contribution;
            contribution_weight += contribution;
        }
        combined_transport = compose_camera_transport(
            combined_transport, combined_segment);
        clear_transport = compose_camera_transport(
            clear_transport, clear_segment);
        weather_transmittance *= weather_step_t;
        travelled += step_length;
        evaluated_steps += 1.0;
    }
    return specialized_relative_packet(
        combined_transport, clear_transport, weather_transmittance,
        first_depth, weighted_mean_depth, contribution_weight,
        vec2<f32>(0.0), 2.0, evaluated_steps,
        UPPER_ATMOSPHERE_FAR_LIMIT);
}

@fragment
fn upper_atmosphere_fragment_physical(input: VertexOut) -> CloudLayerOutput {
    let pixel = floor(input.position.xy);
    let transport_phase = i32(round(p[30].z));
    let checker = (i32(pixel.x) + i32(pixel.y) + transport_phase) % 2;
    if (p[30].y > 0.5 && checker != 0) { discard; }
    if (cloud_morphology_record_count() == 0u &&
        weather_scene.data[3u].z < 0.5) {
        return specialized_empty_output(2.0);
    }
    let direction = view_direction(input.uv);
    let origin = vec3<f32>(0.0, PLANET_RADIUS + p[19].w, 0.0);
    let sun_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(0u));
    let moon_direction = atmosphere_to_renderer_direction(
        atmo_source_direction(1u));
    let blue_noise_cell = vec2<i32>(
        i32(pixel.x) % 64, i32(pixel.y) % 64);
    let blue_noise = textureLoad(
        blue_noise_texture, blue_noise_cell, 0).r;
    let jitter = fract(blue_noise + p[30].x * 0.7548776662466927);
    return specialized_encode_packet(specialized_march_upper_atmosphere(
        origin, direction, sun_direction, moon_direction, jitter));
}
`;

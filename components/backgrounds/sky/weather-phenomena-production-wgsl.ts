import {
    WEATHER_SCENE_AURORA_RECORD_VEC4S,
    WEATHER_SCENE_BLOWING_RECORD_VEC4S,
    WEATHER_SCENE_DROPLET_RECORD_VEC4S,
    WEATHER_SCENE_ICE_RECORD_VEC4S,
    WEATHER_SCENE_LIGHTNING_PULSE_VEC4S,
    WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S,
    WEATHER_SCENE_VEC4_OFFSETS,
} from "./weather-scene-abi";
import {
    WEATHER_SCENE_MAX_AURORA_CURTAINS,
    WEATHER_SCENE_MAX_BLOWING_MEDIA,
    WEATHER_SCENE_MAX_DROPLET_OWNERS,
    WEATHER_SCENE_MAX_ICE_OWNERS,
    WEATHER_SCENE_MAX_LIGHTNING_PULSES,
    WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS,
} from "./weather-scene";

/**
 * Binding- and entry-point-free production transport layer for the packed
 * weather scene.  The host must prepend WEATHER_SCENE_UNIFORM_WGSL,
 * WEATHER_OPTICAL_PHENOMENA_WGSL and the shared atmosphere/cloud transport.
 *
 * The source contains no screen coordinate, alpha, exposure, bloom, or colour
 * grade.  Directional features replace phase energy only inside their exact
 * finite owner.  Emissive and boundary-layer phenomena return local physical
 * coefficients for the ordered camera marcher.
 */
export const WEATHER_PHENOMENA_PRODUCTION_WGSL = /* wgsl */ `
const WEATHER_PRODUCTION_MAX_DROPLET_OWNERS: u32 = ${WEATHER_SCENE_MAX_DROPLET_OWNERS}u;
const WEATHER_PRODUCTION_MAX_ICE_OWNERS: u32 = ${WEATHER_SCENE_MAX_ICE_OWNERS}u;
const WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS: u32 = ${WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS}u;
const WEATHER_PRODUCTION_MAX_LIGHTNING_PULSES: u32 = ${WEATHER_SCENE_MAX_LIGHTNING_PULSES}u;
const WEATHER_PRODUCTION_MAX_AURORA_CURTAINS: u32 = ${WEATHER_SCENE_MAX_AURORA_CURTAINS}u;
const WEATHER_PRODUCTION_MAX_BLOWING_MEDIA: u32 = ${WEATHER_SCENE_MAX_BLOWING_MEDIA}u;
const WEATHER_PRODUCTION_DROPLET_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.dropletOwners}u;
const WEATHER_PRODUCTION_ICE_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.iceOwners}u;
const WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningEvent}u;
const WEATHER_PRODUCTION_LIGHTNING_SEGMENT_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningSegments}u;
const WEATHER_PRODUCTION_LIGHTNING_PULSE_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningPulses}u;
const WEATHER_PRODUCTION_AURORA_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains}u;
const WEATHER_PRODUCTION_BLOWING_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.blowingMedia}u;
const WEATHER_PRODUCTION_DROPLET_STRIDE: u32 = ${WEATHER_SCENE_DROPLET_RECORD_VEC4S}u;
const WEATHER_PRODUCTION_ICE_STRIDE: u32 = ${WEATHER_SCENE_ICE_RECORD_VEC4S}u;
const WEATHER_PRODUCTION_LIGHTNING_SEGMENT_STRIDE: u32 = ${WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S}u;
const WEATHER_PRODUCTION_LIGHTNING_PULSE_STRIDE: u32 = ${WEATHER_SCENE_LIGHTNING_PULSE_VEC4S}u;
const WEATHER_PRODUCTION_AURORA_STRIDE: u32 = ${WEATHER_SCENE_AURORA_RECORD_VEC4S}u;
const WEATHER_PRODUCTION_BLOWING_STRIDE: u32 = ${WEATHER_SCENE_BLOWING_RECORD_VEC4S}u;

struct WeatherProductionVolumeSample {
    extinction_rgb_per_km: vec3<f32>,
    source_coefficient_rgb_per_km: vec3<f32>,
    metadata_weight: f32,
};

struct WeatherProductionRayInterval {
    near_km: f32,
    far_km: f32,
};

fn weather_renderer_world_to_local_ean(
    world_position_km: vec3<f32>,
) -> vec3<f32> {
    return vec3<f32>(world_position_km.x,
        length(world_position_km) - PLANET_RADIUS, world_position_km.z);
}

fn weather_local_ean_to_renderer_world(
    local_position_km: vec3<f32>,
) -> vec3<f32> {
    let radius = PLANET_RADIUS + local_position_km.y;
    let horizontal_squared = dot(
        local_position_km.xz, local_position_km.xz);
    let radial = sqrt(max(0.0, radius * radius - horizontal_squared));
    return vec3<f32>(local_position_km.x, radial, local_position_km.z);
}

fn weather_production_empty_volume_sample() -> WeatherProductionVolumeSample {
    return WeatherProductionVolumeSample(vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
}

fn weather_production_inactive_directional_source()
    -> WeatherOrderedDirectionalScatteringSource {
    return WeatherOrderedDirectionalScatteringSource(
        vec3<f32>(0.0), vec3<f32>(0.0), vec3<f32>(0.0),
        vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
}

fn weather_production_droplet_owner_source(
    owner_index: u32,
    position_east_altitude_north_km: vec3<f32>,
    owner_sample_weight: f32,
    scattering_coefficient_rgb_per_km: vec3<f32>,
    base_phase_rgb_per_sr: vec3<f32>,
    source_direction_to_light: vec3<f32>,
    view_direction_to_camera: vec3<f32>,
    radiance_before_atmosphere_rgb: vec3<f32>,
    atmosphere_transmittance_to_sample_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> WeatherOrderedDirectionalScatteringSource {
    let record_count = min(WEATHER_PRODUCTION_MAX_DROPLET_OWNERS,
        u32(max(0.0, weather_scene.data[2u].y) + 0.5));
    for (var record_index = 0u; record_index <
        WEATHER_PRODUCTION_MAX_DROPLET_OWNERS; record_index += 1u) {
        if (record_index >= record_count) { break; }
        let base = WEATHER_PRODUCTION_DROPLET_OFFSET +
            record_index * WEATHER_PRODUCTION_DROPLET_STRIDE;
        let identity = weather_scene.data[base];
        if (identity.x < 0.5 || u32(round(identity.z)) != owner_index) { continue; }
        let owner = weather_scene.data[base + 1u];
        if (position_east_altitude_north_km.y < owner.y ||
            position_east_altitude_north_km.y > owner.z) {
            return weather_production_inactive_directional_source();
        }
        let scattering_angle = weather_droplet_scattering_angle(
            source_direction_to_light, view_direction_to_camera);
        let distribution = weather_scene.data[base + 3u];
        let lobe_count = min(6u, u32(max(0.0, distribution.y) + 0.5));
        var replacement = vec3<f32>(0.0);
        for (var lobe_index = 0u; lobe_index < 6u; lobe_index += 1u) {
            if (lobe_index >= lobe_count) { break; }
            let lobe_base = base + 8u + lobe_index * 4u;
            let center_kind = weather_scene.data[lobe_base];
            let lobe = WeatherSpectralAngularLobe(
                center_kind.xyz,
                weather_scene.data[lobe_base + 1u].xyz,
                weather_scene.data[lobe_base + 2u].xyz,
                weather_scene.data[lobe_base + 3u].xyz);
            replacement += weather_spectral_angular_lobe(lobe, scattering_angle);
        }
        if (distribution.z > 0.5) {
            let corona_distribution = weather_scene.data[base + 5u];
            let corona = WeatherCoronaState(
                corona_distribution.xy,
                weather_scene.data[base + 6u].xyz,
                weather_scene.data[base + 7u].xyz);
            replacement += weather_corona_phase(corona, scattering_angle);
        }
        return weather_droplet_ordered_source(
            scattering_coefficient_rgb_per_km,
            base_phase_rgb_per_sr,
            replacement,
            weather_scene.data[base + 4u].xyz,
            owner_sample_weight,
            1.0,
            radiance_before_atmosphere_rgb,
            atmosphere_transmittance_to_sample_rgb,
            source_visibility_rgb);
    }
    return weather_production_inactive_directional_source();
}

fn weather_production_ice_owner_source(
    owner_index: u32,
    position_east_altitude_north_km: vec3<f32>,
    owner_sample_weight: f32,
    scattering_coefficient_rgb_per_km: vec3<f32>,
    base_phase_rgb_per_sr: vec3<f32>,
    current_source_direction: vec3<f32>,
    view_direction_to_camera: vec3<f32>,
    radiance_before_atmosphere_rgb: vec3<f32>,
    atmosphere_transmittance_to_sample_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
) -> WeatherOrderedDirectionalScatteringSource {
    let record_count = min(WEATHER_PRODUCTION_MAX_ICE_OWNERS,
        u32(max(0.0, weather_scene.data[2u].z) + 0.5));
    for (var record_index = 0u; record_index < WEATHER_PRODUCTION_MAX_ICE_OWNERS;
        record_index += 1u) {
        if (record_index >= record_count) { break; }
        let base = WEATHER_PRODUCTION_ICE_OFFSET +
            record_index * WEATHER_PRODUCTION_ICE_STRIDE;
        let identity = weather_scene.data[base];
        if (identity.x < 0.5 || u32(round(identity.z)) != owner_index) { continue; }
        let owner = weather_scene.data[base + 1u];
        if (position_east_altitude_north_km.y < owner.y ||
            position_east_altitude_north_km.y > owner.z) {
            return weather_production_inactive_directional_source();
        }
        let source_direction = weather_scene.data[base + 3u].xyz;
        let local_up = weather_scene.data[base + 4u].xyz;
        let source_feature = weather_scene.data[base + 2u];
        let feature_count = min(6u, u32(max(0.0, source_feature.z) + 0.5));
        let tilt_sigma = weather_scene.data[base + 6u].z;
        var replacement = vec3<f32>(0.0);
        for (var feature_index = 0u; feature_index < 6u; feature_index += 1u) {
            if (feature_index >= feature_count) { break; }
            let feature_base = base + 8u + feature_index * 4u;
            let kind_energy = weather_scene.data[feature_base];
            let feature = WeatherIceFeature(
                u32(max(1.0, round(kind_energy.x))) - 1u,
                kind_energy.yzw,
                weather_scene.data[feature_base + 1u].xyz,
                weather_scene.data[feature_base + 2u].xyz,
                weather_scene.data[feature_base + 3u].xy);
            replacement += weather_oriented_ice_phase_replacement(
                feature, source_direction, view_direction_to_camera, local_up,
                source_feature.y, tilt_sigma, 1.0);
        }
        return weather_oriented_ice_ordered_source(
            scattering_coefficient_rgb_per_km,
            base_phase_rgb_per_sr,
            replacement,
            weather_scene.data[base + 7u].yzw,
            owner_sample_weight,
            1.0,
            source_direction,
            current_source_direction,
            radiance_before_atmosphere_rgb,
            atmosphere_transmittance_to_sample_rgb,
            source_visibility_rgb);
    }
    return weather_production_inactive_directional_source();
}

fn weather_production_cloud_direct_radiance(
    owner_index: u32,
    position_east_altitude_north_km: vec3<f32>,
    owner_sample_weight: f32,
    density: f32,
    spectral_extinction_rgb_per_km: vec3<f32>,
    local_optics: CloudLocalOptics,
    source_direction_to_light: vec3<f32>,
    view_direction_to_camera: vec3<f32>,
    atmosphere_transported_irradiance_rgb: vec3<f32>,
    source_visibility_rgb: vec3<f32>,
    ice_fraction: f32,
    include_lightning_field: bool,
) -> vec3<f32> {
    let sigma_t = max(vec3<f32>(0.0), density *
        spectral_extinction_rgb_per_km);
    let sigma_s = sigma_t * clamp(local_optics.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let local_position = weather_renderer_world_to_local_ean(
        position_east_altitude_north_km);
    let droplet = weather_production_droplet_owner_source(
        owner_index, local_position,
        owner_sample_weight, sigma_s, local_optics.phase,
        source_direction_to_light, view_direction_to_camera,
        atmosphere_transported_irradiance_rgb, vec3<f32>(1.0),
        source_visibility_rgb);
    let ice = weather_production_ice_owner_source(
        owner_index, local_position,
        owner_sample_weight, sigma_s, local_optics.phase,
        source_direction_to_light, view_direction_to_camera,
        atmosphere_transported_irradiance_rgb, vec3<f32>(1.0),
        source_visibility_rgb);
    var coefficient = sigma_s * max(vec3<f32>(0.0), local_optics.phase) *
        max(vec3<f32>(0.0), atmosphere_transported_irradiance_rgb) *
        clamp(source_visibility_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    if (droplet.enabled > 0.5 && ice.enabled > 0.5) {
        coefficient = mix(droplet.source_coefficient_rgb_per_km_per_sr,
            ice.source_coefficient_rgb_per_km_per_sr,
            clamp(ice_fraction, 0.0, 1.0));
    } else if (droplet.enabled > 0.5) {
        coefficient = droplet.source_coefficient_rgb_per_km_per_sr;
    } else if (ice.enabled > 0.5) {
        coefficient = ice.source_coefficient_rgb_per_km_per_sr;
    }
    if (include_lightning_field) {
        let event_power = weather_production_lightning_event_power(
            weather_scene.data[1u].y).emitted_power_rgb;
        let lightning_irradiance = event_power *
            cloud_lv_sample_owner_lightning_transfer(
                position_east_altitude_north_km, owner_index);
        // Multiple cloud scatterings erase channel direction rapidly. The
        // coarse field is the diffuse lightning component; the preserved line
        // geometry is rendered separately by the direct-channel PSF.
        coefficient += sigma_s * lightning_irradiance /
            (4.0 * WEATHER_PI);
    }
    return coefficient / max(vec3<f32>(1e-8), sigma_t);
}

// Exact arbitrary-segment parent transport for lightning. This deliberately
// evaluates only the requested packed owner and never consults the dominant
// owner, layer union, or an owner-wide visibility scalar.
fn weather_parent_owner_extinction_at(
    owner_index: u32,
    world_position_km: vec3<f32>,
) -> vec3<f32> {
    let system_count = min(36u, min(
        u32(max(0.0, cloud_system_buffer.header.x)),
        u32(max(0.0, cloud_macro_bindings.header.x))));
    if (owner_index >= system_count ||
        abs(cloud_system_buffer.header.y - 16.0) > 0.25 ||
        abs(cloud_macro_bindings.header.y - 7.0) > 0.25) {
        return vec3<f32>(0.0);
    }
    let system = cloud_system_buffer.systems[owner_index];
    let atlas_binding = cloud_macro_bindings.owners[owner_index];
    if (system.identity.x < 0.5 || atlas_binding.atlas_scale.w < 0.5) {
        return vec3<f32>(0.0);
    }
    let local_position = weather_renderer_world_to_local_ean(world_position_km);
    let genus = i32(round(system.identity.z));
    let morphology = cloud_morphology_evaluate_owner(owner_index, local_position);
    if (morphology.base_coverage <= 0.0001 &&
        morphology.placement_weight <= 0.0001 &&
        morphology.reuse_weight <= 0.0001 &&
        morphology.additive_density <= 0.0001) {
        return vec3<f32>(0.0);
    }
    var base_sample = empty_cloud_macro_owner_sample();
    if (morphology.base_coverage > 0.0001) {
        base_sample = cloud_macro_owner_sample(
            morphology.base_position_km, system, atlas_binding, genus,
            owner_index, 0.0, 0.0, vec3<f32>(0.0));
    }
    var placement_sample = empty_cloud_macro_owner_sample();
    if (morphology.placement_weight > 0.0001) {
        placement_sample = cloud_macro_owner_sample(
            morphology.placement_position_km, system, atlas_binding, genus,
            owner_index, 0.0, 0.0, vec3<f32>(0.0));
    }
    var reuse_sample = empty_cloud_macro_owner_sample();
    if (morphology.reuse_weight > 0.0001) {
        reuse_sample = cloud_macro_owner_sample(
            local_position, system, atlas_binding, genus, owner_index,
            0.0, 0.0, vec3<f32>(0.0));
    }
    let density = cloud_morphology_compose_density(
        morphology, base_sample.density, placement_sample.density,
        reuse_sample.density);
    if (density <= 0.0001) { return vec3<f32>(0.0); }
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
    var scalar_extinction = cloud_owner_extinction_coefficient(
        owner_index, system, atlas_binding, local_ice);
    if (morphology.target_optical_depth >= 0.0 &&
        morphology.optical_weight > 0.0001) {
        scalar_extinction = mix(scalar_extinction,
            morphology.target_optical_depth /
                max(0.0001, system.vertical_extent.y *
                    atlas_binding.condensate_paths.x),
            saturate(morphology.optical_weight));
    }
    let mass_extinction = cloud_local_mass_extinction(owner_index, local_ice);
    let photopic_mass = dot(mass_extinction,
        vec3<f32>(0.2126, 0.7152, 0.0722));
    return max(vec3<f32>(0.0), density * scalar_extinction *
        mass_extinction / max(1e-8, photopic_mass));
}

fn weather_parent_owner_segment_transmittance(
    owner_index: u32,
    start_world_km: vec3<f32>,
    end_world_km: vec3<f32>,
) -> vec3<f32> {
    let delta = end_world_km - start_world_km;
    let distance_km = length(delta);
    if (distance_km <= 1e-7) { return vec3<f32>(1.0); }
    var optical_depth = vec3<f32>(0.0);
    // Fixed midpoint strata preserve a small private graph. The exact owner
    // density/material query supplies finite support and RGB extinction.
    for (var step = 0u; step < 24u; step += 1u) {
        let progress = (f32(step) + 0.5) / 24.0;
        optical_depth += weather_parent_owner_extinction_at(
            owner_index, start_world_km + delta * progress) *
            distance_km / 24.0;
        if (all(optical_depth >= vec3<f32>(24.0))) { break; }
    }
    return exp(-min(optical_depth, vec3<f32>(24.0)));
}

fn weather_production_lightning_event_power(
    event_time_seconds: f32,
) -> WeatherLightningEmission {
    if (weather_scene.data[2u].w < 0.5) {
        return WeatherLightningEmission(vec3<f32>(0.0), 0.0, 0.0);
    }
    let event = weather_scene.data[WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET];
    if (event.x < 0.5) {
        return WeatherLightningEmission(vec3<f32>(0.0), 0.0, 0.0);
    }
    let event_start = weather_scene.data[
        WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET + 1u].x;
    let pulse_count = min(WEATHER_PRODUCTION_MAX_LIGHTNING_PULSES,
        u32(max(0.0, weather_scene.data[3u].y) + 0.5));
    var power = vec3<f32>(0.0);
    var current = 0.0;
    var profile = 0.0;
    for (var pulse_index = 0u; pulse_index <
        WEATHER_PRODUCTION_MAX_LIGHTNING_PULSES; pulse_index += 1u) {
        if (pulse_index >= pulse_count) { break; }
        let base = WEATHER_PRODUCTION_LIGHTNING_PULSE_OFFSET +
            pulse_index * WEATHER_PRODUCTION_LIGHTNING_PULSE_STRIDE;
        let pulse = WeatherLightningPulse(
            weather_scene.data[base],
            weather_scene.data[base + 1u],
            weather_scene.data[base + 2u].xyz);
        let sample = weather_lightning_pulse(pulse,
            event_time_seconds - event_start);
        power += sample.emitted_power_rgb;
        current += sample.current_kiloamps;
        profile += sample.normalized_temporal_profile_per_second;
    }
    return WeatherLightningEmission(power, current, profile);
}

fn weather_production_lightning_segment(
    segment_index: u32,
) -> WeatherLightningSegment {
    let base = WEATHER_PRODUCTION_LIGHTNING_SEGMENT_OFFSET +
        segment_index * WEATHER_PRODUCTION_LIGHTNING_SEGMENT_STRIDE;
    let start = weather_scene.data[base];
    let end = weather_scene.data[base + 1u];
    return WeatherLightningSegment(start.xyz, start.w, end.xyz, end.w);
}

// Local channel emissivity for the analytic channel/PSF path. This function
// does not broaden the centimetric channel into a visible world-space tube.
fn weather_production_lightning_channel_emission(
    position_east_altitude_north_km: vec3<f32>,
    event_time_seconds: f32,
) -> WeatherLightningVolumeInjection {
    let emission = weather_production_lightning_event_power(event_time_seconds);
    let segment_count = min(WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS,
        u32(max(0.0, weather_scene.data[3u].x) + 0.5));
    var weighted_length = 0.0;
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let segment = weather_production_lightning_segment(index);
        weighted_length += length(segment.end_east_altitude_north_km -
            segment.start_east_altitude_north_km) * segment.emissive_weight;
    }
    var result = WeatherLightningVolumeInjection(vec3<f32>(0.0), 0.0);
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let injection = weather_lightning_segment_injection(
            position_east_altitude_north_km,
            weather_production_lightning_segment(index),
            emission.emitted_power_rgb,
            weighted_length);
        result.emissivity_rgb_per_km3 += injection.emissivity_rgb_per_km3;
        result.channel_weight += injection.channel_weight;
    }
    return result;
}

// Coarse event-light materialization scans channel geometry once per field
// voxel, retains the two strongest geometric line-irradiance candidates, then
// spends exact parent transport only on four Gauss samples. Pure nearest-line
// selection over-promotes short, dim branch tips and under-represents the main
// return channel. The stored result is irradiance per unit emitted RGB power;
// millisecond pulse power is applied in the camera pass, so geometry/transport
// never needs rebuilding during return strokes.
fn weather_production_lightning_transfer_bounded(
    owner_index: u32,
    world_position_km: vec3<f32>,
) -> vec3<f32> {
    let event_owner = u32(max(0.0, round(weather_scene.data[
        WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET + 1u].w)));
    if (weather_scene.data[2u].w < 0.5 || event_owner != owner_index) {
        return vec3<f32>(0.0);
    }
    let segment_count = min(WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS,
        u32(max(0.0, weather_scene.data[3u].x) + 0.5));
    var weighted_length = 0.0;
    var strongest_indices = array<u32, 2>(0u, 0u);
    var strongest_scores = array<f32, 2>(-1.0, -1.0);
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let segment = weather_production_lightning_segment(index);
        let start_world = weather_local_ean_to_renderer_world(
            segment.start_east_altitude_north_km);
        let end_world = weather_local_ean_to_renderer_world(
            segment.end_east_altitude_north_km);
        let delta = end_world - start_world;
        let length_squared = dot(delta, delta);
        let progress = clamp(dot(world_position_km - start_world, delta) /
            max(1e-12, length_squared), 0.0, 1.0);
        let distance_squared = dot(world_position_km -
            (start_world + delta * progress), world_position_km -
            (start_world + delta * progress));
        let segment_length = sqrt(max(0.0, length_squared));
        let weighted_segment_length = segment_length *
            segment.emissive_weight;
        weighted_length += weighted_segment_length;
        let core_radius_km = max(2e-6, segment.radius_metres * 0.001);
        let score = weighted_segment_length /
            max(1e-12, distance_squared + core_radius_km * core_radius_km);
        if (score > strongest_scores[0]) {
            strongest_scores[1] = strongest_scores[0];
            strongest_indices[1] = strongest_indices[0];
            strongest_scores[0] = score;
            strongest_indices[0] = index;
        } else if (score > strongest_scores[1]) {
            strongest_scores[1] = score;
            strongest_indices[1] = index;
        }
    }
    if (weighted_length <= 1e-8) { return vec3<f32>(0.0); }
    let nodes = vec2<f32>(0.2113248654051871, 0.7886751345948129);
    var transfer = vec3<f32>(0.0);
    for (var selected = 0u; selected < 2u; selected += 1u) {
        if (strongest_scores[selected] < 0.0) { continue; }
        let segment = weather_production_lightning_segment(
            strongest_indices[selected]);
        let segment_length = length(segment.end_east_altitude_north_km -
            segment.start_east_altitude_north_km);
        if (segment_length <= 1e-7 || segment.emissive_weight <= 0.0) {
            continue;
        }
        for (var quadrature = 0u; quadrature < 2u; quadrature += 1u) {
            let local_channel = mix(segment.start_east_altitude_north_km,
                segment.end_east_altitude_north_km, nodes[quadrature]);
            let channel_world = weather_local_ean_to_renderer_world(
                local_channel);
            let distance_km = length(channel_world - world_position_km);
            let core_radius_km = max(2e-6,
                segment.radius_metres * 0.001);
            let geometric = 1.0 / (4.0 * WEATHER_PI *
                (distance_km * distance_km + core_radius_km * core_radius_km));
            let atmosphere_transfer = physical_atmosphere_segment(
                renderer_to_atmosphere_world(channel_world),
                renderer_to_atmosphere_world(world_position_km)).transmittance;
            let parent_transfer = weather_parent_owner_segment_transmittance(
                owner_index, channel_world, world_position_km);
            transfer += atmosphere_transfer * parent_transfer * geometric *
                segment_length * 0.5 * segment.emissive_weight /
                weighted_length;
        }
    }
    return max(vec3<f32>(0.0), transfer);
}

fn weather_production_henyey_greenstein(
    cosine: f32,
    asymmetry: vec3<f32>,
) -> vec3<f32> {
    let g = clamp(asymmetry, vec3<f32>(-0.98), vec3<f32>(0.98));
    let denominator = max(vec3<f32>(1e-6),
        vec3<f32>(1.0) + g * g - 2.0 * g * cosine);
    return (vec3<f32>(1.0) - g * g) /
        (4.0 * WEATHER_PI * pow(denominator, vec3<f32>(1.5)));
}

// Four-point line quadrature injects channel irradiance into the exact parent
// cloud. The host-supplied owner transfer must trace only that parent owner.
fn weather_production_lightning_cloud_source(
    owner_index: u32,
    owner_sample_weight: f32,
    position_east_altitude_north_km: vec3<f32>,
    view_direction_to_camera: vec3<f32>,
    cloud_scattering_rgb_per_km: vec3<f32>,
    cloud_asymmetry_rgb: vec3<f32>,
    event_time_seconds: f32,
) -> WeatherLightningCloudSource {
    let event_owner = u32(max(0.0, round(weather_scene.data[
        WEATHER_PRODUCTION_LIGHTNING_EVENT_OFFSET + 1u].w)));
    if (weather_scene.data[2u].w < 0.5 || event_owner != owner_index ||
        owner_sample_weight <= 0.0) {
        return WeatherLightningCloudSource(vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let event_power = weather_production_lightning_event_power(event_time_seconds);
    if (all(event_power.emitted_power_rgb <= vec3<f32>(0.0))) {
        return WeatherLightningCloudSource(vec3<f32>(0.0), vec3<f32>(0.0), 0.0);
    }
    let segment_count = min(WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS,
        u32(max(0.0, weather_scene.data[3u].x) + 0.5));
    var weighted_length = 0.0;
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let segment = weather_production_lightning_segment(index);
        weighted_length += length(segment.end_east_altitude_north_km -
            segment.start_east_altitude_north_km) * segment.emissive_weight;
    }
    let abscissa = vec4<f32>(-0.86113631, -0.33998104, 0.33998104, 0.86113631);
    let weights = vec4<f32>(0.34785485, 0.65214515, 0.65214515, 0.34785485);
    var incident = vec3<f32>(0.0);
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_LIGHTNING_SEGMENTS;
        index += 1u) {
        if (index >= segment_count) { break; }
        let segment = weather_production_lightning_segment(index);
        let delta = segment.end_east_altitude_north_km -
            segment.start_east_altitude_north_km;
        let segment_length = length(delta);
        if (segment_length <= 1e-7 || segment.emissive_weight <= 0.0) { continue; }
        let line_power = event_power.emitted_power_rgb *
            segment.emissive_weight / max(1e-7, weighted_length);
        for (var quadrature = 0u; quadrature < 4u; quadrature += 1u) {
            let progress = 0.5 * (abscissa[quadrature] + 1.0);
            let channel_position = segment.start_east_altitude_north_km +
                delta * progress;
            let channel_world = weather_local_ean_to_renderer_world(
                channel_position);
            let to_channel = channel_world - position_east_altitude_north_km;
            let distance_km = length(to_channel);
            let direction_to_channel = weather_safe_normalize(to_channel);
            let core_radius_km = max(2e-6, segment.radius_metres * 0.001);
            let geometric = 1.0 / (4.0 * WEATHER_PI *
                (distance_km * distance_km + core_radius_km * core_radius_km));
            let atmosphere_transfer = physical_atmosphere_segment(
                renderer_to_atmosphere_world(channel_world),
                renderer_to_atmosphere_world(position_east_altitude_north_km))
                .transmittance;
            // Required host hook: exact finite parent-cloud transmittance along
            // this arbitrary channel-to-sample segment, never a dominant owner.
            let parent_transfer = weather_parent_owner_segment_transmittance(
                owner_index, channel_world,
                position_east_altitude_north_km);
            let phase = weather_production_henyey_greenstein(
                dot(direction_to_channel, view_direction_to_camera),
                cloud_asymmetry_rgb);
            incident += line_power * atmosphere_transfer * parent_transfer *
                phase * geometric * segment_length * 0.5 * weights[quadrature];
        }
    }
    return weather_lightning_cloud_scattering_source(
        cloud_scattering_rgb_per_km,
        owner_sample_weight,
        1.0,
        1.0,
        incident,
        vec3<f32>(1.0));
}

fn weather_production_aurora_state(index: u32) -> WeatherAuroraCurtain {
    let base = WEATHER_PRODUCTION_AURORA_OFFSET +
        index * WEATHER_PRODUCTION_AURORA_STRIDE;
    let center = weather_scene.data[base + 2u];
    let geometry = weather_scene.data[base + 3u];
    let folding = weather_scene.data[base + 4u];
    let drift = weather_scene.data[base + 5u];
    return WeatherAuroraCurtain(
        vec4<f32>(center.x, center.y, center.z, center.w),
        geometry,
        vec4<f32>(folding.x, folding.y, folding.z,
            weather_scene.data[base].w),
        drift.xy,
        weather_scene.data[base + 6u].xyz,
        weather_scene.data[base + 7u].xyz,
        weather_scene.data[base + 8u].xyz);
}

fn weather_production_aurora_volume_sample(
    position_east_altitude_north_km: vec3<f32>,
    scene_time_seconds: f32,
) -> WeatherProductionVolumeSample {
    let count = min(WEATHER_PRODUCTION_MAX_AURORA_CURTAINS,
        u32(max(0.0, weather_scene.data[3u].z) + 0.5));
    var source = vec3<f32>(0.0);
    var weight = 0.0;
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_AURORA_CURTAINS;
        index += 1u) {
        if (index >= count) { break; }
        let base = WEATHER_PRODUCTION_AURORA_OFFSET +
            index * WEATHER_PRODUCTION_AURORA_STRIDE;
        if (weather_scene.data[base].x < 0.5) { continue; }
        let sample = weather_aurora_curtain_emission(
            weather_production_aurora_state(index),
            position_east_altitude_north_km,
            scene_time_seconds);
        source += sample.emissivity_rgb_per_km;
        weight += sample.sheet_density;
    }
    return WeatherProductionVolumeSample(vec3<f32>(0.0), source, weight);
}

fn weather_production_blowing_state(index: u32) -> WeatherBlowingBoundaryState {
    let base = WEATHER_PRODUCTION_BLOWING_OFFSET +
        index * WEATHER_PRODUCTION_BLOWING_STRIDE;
    let extent = weather_scene.data[base + 2u];
    let geometry = weather_scene.data[base + 3u];
    let wind = weather_scene.data[base + 4u];
    return WeatherBlowingBoundaryState(
        extent,
        vec4<f32>(geometry.x, geometry.y, geometry.z,
            weather_scene.data[base].z - 1.0),
        vec4<f32>(wind.x, wind.y, geometry.w, weather_scene.data[base].w),
        weather_scene.data[base + 5u].xyz,
        vec4<f32>(weather_scene.data[base + 6u].xyz, wind.w));
}

fn weather_production_blowing_volume_sample(
    position_east_altitude_north_km: vec3<f32>,
    view_direction_to_camera: vec3<f32>,
    sun_direction: vec3<f32>,
    moon_direction: vec3<f32>,
    scene_time_seconds: f32,
) -> WeatherProductionVolumeSample {
    let count = min(WEATHER_PRODUCTION_MAX_BLOWING_MEDIA,
        u32(max(0.0, weather_scene.data[3u].w) + 0.5));
    var extinction = vec3<f32>(0.0);
    var source = vec3<f32>(0.0);
    var weight = 0.0;
    for (var index = 0u; index < WEATHER_PRODUCTION_MAX_BLOWING_MEDIA;
        index += 1u) {
        if (index >= count) { break; }
        let base = WEATHER_PRODUCTION_BLOWING_OFFSET +
            index * WEATHER_PRODUCTION_BLOWING_STRIDE;
        if (weather_scene.data[base].x < 0.5) { continue; }
        let sample = weather_blowing_boundary_sample(
            weather_production_blowing_state(index),
            position_east_altitude_north_km,
            scene_time_seconds);
        if (sample.source_weight <= 0.0) { continue; }
        let g = vec3<f32>(sample.asymmetry);
        let sun_phase = weather_production_henyey_greenstein(
            dot(sun_direction, view_direction_to_camera), g);
        let moon_phase = weather_production_henyey_greenstein(
            dot(moon_direction, view_direction_to_camera), g);
        let renderer_position = weather_local_ean_to_renderer_world(
            position_east_altitude_north_km);
        let incident = physical_source_irradiance_at(
                0u, renderer_position) * sun_phase +
            physical_source_irradiance_at(
                1u, renderer_position) * moon_phase +
            (physical_diffuse_irradiance_at(renderer_position) +
                physical_ground_irradiance_at(renderer_position)) /
                (4.0 * WEATHER_PI);
        let passive = weather_blowing_passive_source_coefficient(sample, incident);
        extinction += passive.extinction_rgb_km;
        source += passive.source_coefficient_rgb_km;
        weight += sample.source_weight;
    }
    return WeatherProductionVolumeSample(extinction, source, weight);
}

// Exact finite support for a record-owned oriented ellipse plus altitude slab.
fn weather_production_intersect_oriented_elliptical_cylinder(
    ray_origin: vec3<f32>,
    ray_direction: vec3<f32>,
    center_east_north: vec2<f32>,
    radii_km: vec2<f32>,
    orientation_radians: f32,
    altitude_interval_km: vec2<f32>,
) -> WeatherProductionRayInterval {
    let sine = sin(orientation_radians);
    let cosine = cos(orientation_radians);
    let relative = ray_origin.xz - center_east_north;
    let inverse_radii = 1.0 / max(vec2<f32>(1e-5), radii_km);
    let horizontal_origin = vec2<f32>(
        dot(relative, vec2<f32>(sine, cosine)),
        dot(relative, vec2<f32>(cosine, -sine))) * inverse_radii;
    let horizontal_direction = vec2<f32>(
        dot(ray_direction.xz, vec2<f32>(sine, cosine)),
        dot(ray_direction.xz, vec2<f32>(cosine, -sine))) * inverse_radii;
    let quadratic = dot(horizontal_direction, horizontal_direction);
    let linear = 2.0 * dot(horizontal_origin, horizontal_direction);
    let constant = dot(horizontal_origin, horizontal_origin) - 1.0;
    var horizontal = vec2<f32>(0.0, 1e9);
    if (quadratic <= 1e-12) {
        if (constant > 0.0) { return WeatherProductionRayInterval(1e9, -1e9); }
    } else {
        let discriminant = linear * linear - 4.0 * quadratic * constant;
        if (discriminant < 0.0) {
            return WeatherProductionRayInterval(1e9, -1e9);
        }
        let root = sqrt(discriminant);
        horizontal = vec2<f32>(
            (-linear - root) / (2.0 * quadratic),
            (-linear + root) / (2.0 * quadratic));
    }
    // Altitude is radial, not the renderer's Cartesian y coordinate. Curved
    // shell entry is essential for horizon aurora and distant blowing media;
    // a planar y slab misses both as Earth curvature accumulates down-ray.
    let origin_altitude = length(ray_origin) - PLANET_RADIUS;
    let inner = sphere_hits(ray_origin, ray_direction,
        PLANET_RADIUS + max(0.0, altitude_interval_km.x));
    let outer = sphere_hits(ray_origin, ray_direction,
        PLANET_RADIUS + max(0.0, altitude_interval_km.y));
    var altitude = vec2<f32>(0.0, outer.y);
    if (origin_altitude < altitude_interval_km.x) {
        altitude.x = max(0.0, inner.y);
    } else if (origin_altitude > altitude_interval_km.y) {
        altitude = vec2<f32>(max(0.0, outer.x), inner.x);
    }
    if (altitude.y <= altitude.x) {
        return WeatherProductionRayInterval(1e9, -1e9);
    }
    return WeatherProductionRayInterval(
        max(0.0, max(horizontal.x, altitude.x)),
        min(horizontal.y, altitude.y));
}

// Conservative interval only schedules work. The curtain evaluator supplies
// the exact folded finite boundary and can never emit outside it.
fn weather_production_aurora_interval(
    ray_origin: vec3<f32>,
    ray_direction: vec3<f32>,
    curtain: WeatherAuroraCurtain,
) -> WeatherProductionRayInterval {
    let field = weather_safe_normalize(curtain.magnetic_field_direction);
    let altitude_span = curtain.geometry.z - curtain.geometry.y;
    let field_shear = length(field.xz) * altitude_span / max(0.08, abs(field.y));
    let half_length = curtain.center_orientation_length.w * 0.5 + field_shear;
    let half_width = curtain.geometry.x * 4.0 + abs(curtain.geometry.w) * 1.8 +
        field_shear;
    return weather_production_intersect_oriented_elliptical_cylinder(
        ray_origin, ray_direction,
        curtain.center_orientation_length.xy,
        vec2<f32>(max(1.0, half_length), max(0.1, half_width)),
        curtain.center_orientation_length.z,
        curtain.geometry.yz);
}

fn weather_production_blowing_record_interval(
    ray_origin: vec3<f32>,
    ray_direction: vec3<f32>,
    record_index: u32,
    scene_time_seconds: f32,
) -> WeatherProductionRayInterval {
    let state = weather_production_blowing_state(record_index);
    let center = state.center_extent.xy + state.motion.xy *
        scene_time_seconds / 1000.0;
    return weather_production_intersect_oriented_elliptical_cylinder(
        ray_origin, ray_direction, center, state.center_extent.zw,
        state.geometry.x, vec2<f32>(0.0, state.geometry.y));
}
`;

/**
 * Two bounded affine pass kernels. Aurora and boundary media are separated
 * because their physical scales differ by four orders of magnitude. Combining
 * them would either undersample saltation or waste hundreds of thermospheric
 * samples. Empty passes are exact identities.
 */
export const WEATHER_PHENOMENA_PRODUCTION_SPECIALIZED_PASSES_WGSL = /* wgsl */ `
fn weather_production_march_aurora(
    origin: vec3<f32>,
    direction: vec3<f32>,
    scene_time_seconds: f32,
    jitter: f32,
) -> LayerPacket {
    let record_count = min(WEATHER_PRODUCTION_MAX_AURORA_CURTAINS,
        u32(max(0.0, weather_scene.data[3u].z) + 0.5));
    if (record_count == 0u) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), 3.0, 0.0);
    }
    var combined = camera_transport_identity();
    var clear = camera_transport_identity();
    var weather_t = vec3<f32>(1.0);
    var first_depth = 1e9;
    var weighted_depth = 0.0;
    var contribution_weight = 0.0;
    var evaluated_steps = 0.0;
    var travelled = 0.0;
    for (var iteration = 0u; iteration < 1024u; iteration += 1u) {
        if (travelled >= 1200.0 || maximum_rgb(weather_t) < 0.0005) { break; }
        let epsilon = max(1e-5, travelled * 1e-7);
        var support_is_active = false;
        var next_event = 1200.0;
        for (var index = 0u; index < WEATHER_PRODUCTION_MAX_AURORA_CURTAINS;
            index += 1u) {
            if (index >= record_count) { break; }
            let interval = weather_production_aurora_interval(
                origin, direction, weather_production_aurora_state(index));
            if (interval.far_km <= interval.near_km) { continue; }
            if (interval.near_km <= travelled + epsilon &&
                interval.far_km > travelled + epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.far_km);
            } else if (interval.near_km > travelled + epsilon) {
                next_event = min(next_event, interval.near_km);
            }
        }
        if (!support_is_active) {
            if (next_event >= 1200.0) { break; }
            let gap = specialized_clear_atmosphere_segment(
                origin, direction, travelled, next_event);
            combined = compose_camera_transport(combined, gap);
            clear = compose_camera_transport(clear, gap);
            travelled = next_event;
            continue;
        }
        let step_length = min(1.5, next_event - travelled);
        if (step_length <= 1e-6) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let sample_distance = travelled + step_length * mix(0.2, 0.8,
            fract(jitter + evaluated_steps * 0.61803398875));
        let point = origin + direction * sample_distance;
        let weather = weather_production_aurora_volume_sample(
            point, scene_time_seconds);
        let air = specialized_atmosphere_source_sample(point, direction, true);
        let combined_extinction = max(vec3<f32>(0.0),
            air.extinction_rgb_per_km + weather.extinction_rgb_per_km);
        let combined_source = max(vec3<f32>(0.0),
            air.source_radiance_coefficient_rgb_per_km +
                weather.source_coefficient_rgb_per_km);
        let segment = integrate_camera_transport_coefficients(
            combined_extinction, combined_source, step_length);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            step_length);
        let step_t = exp(-weather.extinction_rgb_per_km * step_length);
        let contribution = max(photopic(
            combined.transmittance * weather.source_coefficient_rgb_per_km) *
            step_length, camera_transport_removed_luminance(weather_t, step_t));
        if (weather.metadata_weight > 1e-8) {
            first_depth = min(first_depth, sample_distance);
            weighted_depth += sample_distance * contribution;
            contribution_weight += contribution;
        }
        combined = compose_camera_transport(combined, segment);
        clear = compose_camera_transport(clear, clear_segment);
        weather_t *= step_t;
        travelled += step_length;
        evaluated_steps += 1.0;
    }
    if (contribution_weight <= 1e-10 || first_depth >= 1e9) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), 3.0, evaluated_steps);
    }
    let relative = relative_weather_transport(combined, clear, weather_t);
    return LayerPacket(sanitize_layer_transport(relative), first_depth,
        weighted_depth / contribution_weight, 1.0 - photopic(weather_t),
        vec2<f32>(0.0), 3.0, evaluated_steps);
}

fn weather_production_blowing_interval(
    ray_origin: vec3<f32>,
    ray_direction: vec3<f32>,
    record_index: u32,
    scene_time_seconds: f32,
) -> WeatherProductionRayInterval {
    let state = weather_production_blowing_state(record_index);
    let center = state.center_extent.xy + state.motion.xy *
        scene_time_seconds / 1000.0;
    return weather_production_intersect_oriented_elliptical_cylinder(
        ray_origin, ray_direction, center, state.center_extent.zw,
        state.geometry.x, vec2<f32>(0.0, state.geometry.y));
}

fn weather_production_march_blowing_media(
    origin: vec3<f32>,
    direction: vec3<f32>,
    sun_direction: vec3<f32>,
    moon_direction: vec3<f32>,
    scene_time_seconds: f32,
    jitter: f32,
) -> LayerPacket {
    let record_count = min(WEATHER_PRODUCTION_MAX_BLOWING_MEDIA,
        u32(max(0.0, weather_scene.data[3u].w) + 0.5));
    if (record_count == 0u) {
        return LayerPacket(camera_transport_identity(), FAR_LIMIT, FAR_LIMIT,
            0.0, vec2<f32>(0.0), 4.0, 0.0);
    }
    var combined = camera_transport_identity();
    var clear = camera_transport_identity();
    var weather_t = vec3<f32>(1.0);
    var first_depth = FAR_LIMIT;
    var weighted_depth = 0.0;
    var contribution_weight = 0.0;
    var evaluated_steps = 0.0;
    var travelled = 0.0;
    for (var iteration = 0u; iteration < 1536u; iteration += 1u) {
        if (travelled >= FAR_LIMIT || maximum_rgb(weather_t) < 0.0005) { break; }
        let epsilon = max(1e-6, travelled * 1e-7);
        var support_is_active = false;
        var next_event = FAR_LIMIT;
        for (var index = 0u; index < WEATHER_PRODUCTION_MAX_BLOWING_MEDIA;
            index += 1u) {
            if (index >= record_count) { break; }
            let interval = weather_production_blowing_interval(
                origin, direction, index, scene_time_seconds);
            if (interval.far_km <= interval.near_km) { continue; }
            if (interval.near_km <= travelled + epsilon &&
                interval.far_km > travelled + epsilon) {
                support_is_active = true;
                next_event = min(next_event, interval.far_km);
            } else if (interval.near_km > travelled + epsilon) {
                next_event = min(next_event, interval.near_km);
            }
        }
        if (!support_is_active) {
            if (next_event >= FAR_LIMIT) { break; }
            let gap = specialized_clear_atmosphere_segment(
                origin, direction, travelled, next_event);
            combined = compose_camera_transport(combined, gap);
            clear = compose_camera_transport(clear, gap);
            travelled = next_event;
            continue;
        }
        var step_length = min(0.12, next_event - travelled);
        if (step_length <= 1e-6) {
            travelled = max(travelled + 1e-5, next_event);
            continue;
        }
        let sample_distance = travelled + step_length * mix(0.18, 0.82,
            fract(jitter + evaluated_steps * 0.61803398875));
        var point = origin + direction * sample_distance;
        var weather = weather_production_blowing_volume_sample(
            point, -direction, sun_direction, moon_direction,
            scene_time_seconds);
        var air = specialized_atmosphere_source_sample(point, direction, true);
        for (var refinement = 0u; refinement < 4u; refinement += 1u) {
            let extinction = air.extinction_rgb_per_km +
                weather.extinction_rgb_per_km;
            let maximum_tau = maximum_rgb(extinction) * step_length;
            if (maximum_tau <= 0.18) { break; }
            step_length *= 0.18 / maximum_tau;
            sample_distance = travelled + step_length * mix(0.18, 0.82,
                fract(jitter + evaluated_steps * 0.61803398875));
            point = origin + direction * sample_distance;
            weather = weather_production_blowing_volume_sample(
                point, -direction, sun_direction, moon_direction,
                scene_time_seconds);
            air = specialized_atmosphere_source_sample(point, direction, true);
        }
        let combined_extinction = max(vec3<f32>(0.0),
            air.extinction_rgb_per_km + weather.extinction_rgb_per_km);
        let combined_source = max(vec3<f32>(0.0),
            air.source_radiance_coefficient_rgb_per_km +
                weather.source_coefficient_rgb_per_km);
        let segment = integrate_camera_transport_coefficients(
            combined_extinction, combined_source, step_length);
        let clear_segment = integrate_camera_transport_coefficients(
            air.extinction_rgb_per_km,
            air.source_radiance_coefficient_rgb_per_km,
            step_length);
        let step_t = exp(-weather.extinction_rgb_per_km * step_length);
        let contribution = camera_transport_removed_luminance(weather_t, step_t);
        if (weather.metadata_weight > 1e-7) {
            first_depth = min(first_depth, sample_distance);
            weighted_depth += sample_distance * contribution;
            contribution_weight += contribution;
        }
        combined = compose_camera_transport(combined, segment);
        clear = compose_camera_transport(clear, clear_segment);
        weather_t *= step_t;
        travelled += step_length;
        evaluated_steps += 1.0;
    }
    return specialized_relative_packet(combined, clear, weather_t,
        first_depth, weighted_depth, contribution_weight, vec2<f32>(0.0),
        4.0, evaluated_steps, FAR_LIMIT);
}
`;

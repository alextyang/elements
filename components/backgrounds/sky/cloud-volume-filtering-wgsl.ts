/**
 * Analytic projected-footprint filtering for the repeated 3-D appearance
 * volumes. Density queries execute inside bounded ray loops, where implicit
 * derivatives are unavailable; an explicit LOD prevents distant octaves from
 * aliasing into grain, stripes, and unstable cloud boundaries.
 */
export const CLOUD_VOLUME_FILTERING_WGSL = /* wgsl */ `
fn cloud_volume_angular_pixel_span(
    camera: vec4<f32>,
    render_resolution: vec2<f32>,
) -> f32 {
    let resolution = max(render_resolution, vec2<f32>(1.0));
    if (camera.w > 1.5) {
        return max(
            2.0 * tan(camera.x * 0.5) / resolution.x,
            2.0 * tan(camera.z * 0.5) / resolution.y,
        );
    }
    return max(
        abs(camera.x) / resolution.x,
        abs(camera.z) / resolution.y,
    );
}

// Procedural appearance fields use three orthonormal owner-space axes, with a
// possibly different frequency on each axis.  For an isotropic pixel footprint
// the projected bandwidth is the root-mean-square frequency, not the largest
// axis frequency.  Using max(fx, fy, fz) is a conservative empty-space bound,
// but it overfilters anisotropic ice detail and removes valid sub-pixel variance
// before the physical Beer integration.  This helper is for appearance fields;
// topology/majorant bounds retain their conservative maxima.
fn cloud_volume_rms_world_frequency(
    coordinate_frequency_per_km: vec3<f32>,
) -> f32 {
    let frequency = max(vec3<f32>(0.0), coordinate_frequency_per_km);
    return length(frequency) * 0.5773502691896258;
}

fn cloud_volume_lod_for_world_frequency(
    world_distance_km: f32,
    coordinate_frequency_per_km: f32,
    texture_size: f32,
    maximum_mip: f32,
    camera: vec4<f32>,
    render_resolution: vec2<f32>,
) -> f32 {
    let projected_world_footprint_km = max(0.0, world_distance_km) *
        cloud_volume_angular_pixel_span(camera, render_resolution);
    let texture_footprint = projected_world_footprint_km *
        max(0.0, coordinate_frequency_per_km) * max(1.0, texture_size);
    return clamp(log2(max(1.0, texture_footprint)), 0.0, maximum_mip);
}
`;

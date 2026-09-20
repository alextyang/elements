/**
 * Continuous condensation field for Cc, Ac and Sc stratiformis (4, 8, 13).
 *
 * A filtered cellular potential supplies unequal rounded elements at one
 * condensation level. Broad domain distortion prevents the repeating noise
 * tile from becoming a grid. No independent geometric cloud primitives are
 * placed. The complete packet stays inside the host's material bounds:
 * 0.48 +/- 0.85 * cloud_packet_depth(layer).
 *
 * WMO morphology references:
 * https://cloudatlas.wmo.int/en/species-cirrocumulus-stratiformis-cc-str.html
 * https://cloudatlas.wmo.int/en/species-altocumulus-stratiformis-ac-str.html
 * https://cloudatlas.wmo.int/en/species-stratocumulus-stratiformis-sc-str.html
 *
 * The host owns bulk advection, weather support, optics and transport. This
 * field owns material support and small-scale modulation; do not apply the
 * generic liquid erosion pass again to these species.
 */
export const CLOUD_CLOUDLET_FIELD_FUNCTIONS = /* glsl */ `
vec4 cloud_cloudlet_filtered(vec3 coordinate) {
    // Base.g contains three cellular octaves. Its fastest octave can decorate
    // a cloud face but must not split one cloudlet into tiny torn fragments.
    // A positive five-tap filter retains the dominant rounded potential.
    vec3 offset_x = vec3(0.035, 0.0, 0.0);
    vec3 offset_z = vec3(0.0, 0.0, 0.035);
    return cloud_texture(u_cloud_base, coordinate) * 0.25 +
        (cloud_texture(u_cloud_base, coordinate + offset_x) +
         cloud_texture(u_cloud_base, coordinate - offset_x) +
         cloud_texture(u_cloud_base, coordinate + offset_z) +
         cloud_texture(u_cloud_base, coordinate - offset_z)) * 0.1875;
}

float cloud_cloudlet_coverage(
    vec3 sample_position,
    CloudLayer layer,
    float h,
    float broad_coverage
) {
    if (h < 0.0 || h > 1.0 || broad_coverage <= 0.0) return 0.0;
    if (abs(layer.species - 4.0) > 0.5 &&
        abs(layer.species - 8.0) > 0.5 &&
        abs(layer.species - 13.0) > 0.5) return 0.0;
    float packet_depth = cloud_packet_depth(layer);
    float packet_distance = abs(h - 0.48) / packet_depth;
    if (packet_distance >= 0.82) return 0.0;

    float period = max(80.0, layer.elementScaleKm * 1000.0);
    vec2 wind_direction = layer.wind + vec2(0.173, 0.271);
    float wind_length = length(wind_direction);
    vec2 wind_axis = wind_length > 0.0001
        ? wind_direction / wind_length : vec2(1.0, 0.0);
    vec2 cross_axis = vec2(-wind_axis.y, wind_axis.x);
    vec2 horizontal = vec2(
        dot(sample_position.xz, wind_axis) / max(1.0, layer.anisotropy),
        dot(sample_position.xz, cross_axis)
    ) / period;
    vec3 seed = u_cloud_seed.xzw * vec3(3.1, 2.7, 3.9);
    vec2 broad_position = cloud_rotate2(horizontal, 0.57) * 0.043;
    vec4 organization = cloud_texture(u_cloud_base, vec3(
        broad_position.x + seed.z, u_cloud_seed.y * 3.7,
        broad_position.y + seed.x
    ));
    // Distortion changes on a scale of several cells, so each element remains
    // coherent while spacing and shape vary across an extensive layer.
    vec2 distortion = (organization.gb - vec2(0.42)) *
        mix(0.65, 1.0, saturate(layer.turbulence));
    vec2 cell_position = cloud_rotate2(horizontal, -0.21) * 0.40 + distortion;
    vec3 cell_coordinate = vec3(
        cell_position.x + seed.x,
        u_cloud_seed.y * 4.1 + cell_position.x * 0.371 + cell_position.y * 0.593,
        cell_position.y + seed.z
    );
    vec4 filtered = cloud_cloudlet_filtered(cell_coordinate);
    // The texture distribution is not uniform: its G channel is inverted
    // Worley FBM, centred near 0.4. Normalize that useful condensate range
    // rather than treating a median noise sample as a cloud's outer edge.
    float potential = saturate((filtered.g - 0.22) / 0.42 +
        (filtered.r - 0.68) * 0.22 + (organization.r - 0.68) * 0.20);

    float coarse = abs(layer.species - 13.0) < 0.5 ? 1.0 :
        abs(layer.species - 8.0) < 0.5 ? 0.5 : 0.0;
    float fragment = saturate(layer.fragmentation);
    float connectivity = saturate(layer.baseConnectivity) * mix(0.10, 1.0, coarse);
    float threshold = mix(0.35, 0.29, coarse) + fragment * 0.13 - connectivity * 0.06;
    float transition = mix(0.20, 0.38, saturate(layer.supportBand));
    float closed_cells = smoother(threshold, threshold + transition, potential);
    float open_rims = 1.0 - smoother(
        0.30 + fragment * 0.05, 0.61 - connectivity * 0.04, potential);
    float open_weight = 1.0 - smoother(-0.85, -0.05, layer.cellularClosure);
    // A maximum keeps a continuous topology transition without adding two
    // complementary masks into a featureless uniformly filled layer.
    float cellular = max(closed_cells * (1.0 - open_weight), open_rims * open_weight);
    if (cellular <= 0.0) return 0.0;

    // Height changes only the cloud's cross-section. It never selects an
    // independent cloudlet centre or repeats a compressed 3D noise octave.
    float base_height = 0.48 + packet_depth *
        (-0.25 + (organization.b - 0.42) * 0.10);
    float crown_scale = mix(0.88, 1.08, saturate(layer.crownExpansion)) *
        mix(1.0, 0.86, coarse);
    float cloudlet_depth = packet_depth *
        (0.16 + 0.67 * sqrt(cellular)) * crown_scale;
    vec4 surface = cloud_texture(u_cloud_base, vec3(
        cell_position.x * 1.73 + seed.z,
        sample_position.y / period * 0.28 + seed.y,
        cell_position.y * 1.73 + seed.x
    ));
    // The common condensation level is not a perfectly smooth extrusion.
    // Entrainment roughens the visible lower liquid boundary at scales much
    // smaller than the horizontal population, without perforating its core.
    vec3 boundary_position = sample_position / (period * 0.15) + seed.zxy;
    vec4 boundary = cloud_texture(u_cloud_base, boundary_position);
    vec3 fine_boundary = cloud_texture(u_cloud_detail,
        boundary_position * 3.13 + seed.yxz).rgb;
    float boundary_relief = (boundary.g - 0.40) * 0.35 +
        (dot(fine_boundary, vec3(0.625, 0.25, 0.125)) - 0.40) * 0.12;
    base_height += packet_depth * boundary_relief * coarse * layer.erosionStrength;
    float top_height = base_height + cloudlet_depth +
        (surface.b - 0.42) * packet_depth * 0.07 * coarse * layer.erosionStrength;
    float lower_face = smoother(base_height - packet_depth * 0.05,
        base_height + packet_depth * mix(0.11, 0.055, coarse), h);
    float upper_face = 1.0 - smoother(
        top_height - packet_depth * 0.075, top_height + packet_depth * 0.055, h);
    float packet_gate = 1.0 - smoother(0.77, 0.82, packet_distance);
    // Fine structure changes local condensate gently. It cannot excavate
    // small holes through a complete condensation element.
    float surface_density = mix(1.0, 0.76 + 0.24 * surface.g,
        saturate(layer.erosionStrength) * mix(0.18, 0.78, coarse));
    return saturate(broad_coverage) * cellular * lower_face * upper_face *
        packet_gate * surface_density * mix(0.84, 1.0, organization.r);
}
`;

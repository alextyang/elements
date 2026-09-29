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
    if (packet_distance >= 0.85) return 0.0;

    float period = max(80.0, layer.elementScaleKm * 1000.0);
    vec2 wind_direction = layer.wind + vec2(0.173, 0.271);
    float wind_length = length(wind_direction);
    vec2 wind_axis = wind_length > 0.0001
        ? wind_direction / wind_length : vec2(1.0, 0.0);
    vec2 cross_axis = vec2(-wind_axis.y, wind_axis.x);
    vec2 horizontal = vec2(
        dot(sample_position.xz, wind_axis) / max(0.1, layer.anisotropy),
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
    vec2 secondary_position = cloud_rotate2(horizontal, 0.73) * 0.23 +
        distortion * 0.37;
    vec4 secondary = cloud_texture(u_cloud_base, vec3(
        secondary_position.x + seed.z,
        u_cloud_seed.y * 5.3 + secondary_position.x * 0.613 +
            secondary_position.y * 0.257,
        secondary_position.y + seed.x
    ));
    // The texture distribution is not uniform: its G channel is inverted
    // Worley FBM, centred near 0.4. Normalize that useful condensate range
    // rather than treating a median noise sample as a cloud's outer edge.
    float primary_potential = saturate((filtered.g - 0.22) / 0.42 +
        (filtered.r - 0.68) * 0.22 + (organization.r - 0.68) * 0.20);
    float secondary_potential = saturate((secondary.g - 0.22) / 0.42 +
        (secondary.r - 0.68) * 0.22 + (organization.r - 0.68) * 0.20);
    float potential = saturate(
        0.82 * primary_potential + 0.18 * secondary_potential);

    float coarse = abs(layer.species - 13.0) < 0.5 ? 1.0 :
        abs(layer.species - 8.0) < 0.5 ? 0.5 : 0.0;
    float fragment = saturate(layer.fragmentation);
    float connectivity = saturate(layer.baseConnectivity) * mix(0.10, 1.0, coarse);
    float threshold = mix(0.35, 0.29, coarse) + fragment * 0.13 - connectivity * 0.06;
    float transition = mix(0.20, 0.38, saturate(layer.supportBand));
    float closure = clamp(layer.cellularClosure, -1.0, 1.0);
    float closed_threshold = threshold +
        0.08 * (0.76 - max(closure, 0.0));
    float closed_cells = smoother(
        closed_threshold, closed_threshold + transition, potential);
    float rim_threshold = 0.46 - 0.04 * saturate(layer.baseConnectivity);
    float rim_width = 0.07 + 0.10 * saturate(layer.supportBand);
    float open_rims = 1.0 - smoother(
        rim_width * (1.0 - 0.5 * saturate(layer.supportBand)),
        rim_width,
        abs(potential - rim_threshold)
    );
    float open_weight = smoother(0.0, 1.0, max(-closure, 0.0));

    float lower_fraction = mix(0.48, 0.30, coarse);
    float crown_scale = mix(0.88, 1.08, saturate(layer.crownExpansion)) *
        mix(1.0, 0.86, coarse) * 0.83;
    float default_crown_scale = mix(0.88, 1.08, 0.14) *
        mix(1.0, 0.86, coarse) * 0.83;
    float centre_height = 0.48 + packet_depth * (
        -0.25 + lower_fraction * default_crown_scale +
        0.10 * (organization.b - 0.42));
    float body_depth = packet_depth * crown_scale;
    float normalized_height = (h - centre_height) /
        max(1e-5, body_depth *
            (h < centre_height ? lower_fraction : 1.0 - lower_fraction));
    float closed_body = closed_cells - normalized_height * normalized_height;
    float open_body = open_rims - normalized_height * normalized_height;

    vec3 boundary_position = sample_position / (period * 0.15) + seed.zxy;
    vec4 boundary = cloud_texture(u_cloud_base, boundary_position);
    vec3 fine_boundary = cloud_texture(u_cloud_detail,
        boundary_position * 3.13 + seed.yxz).rgb;
    float boundary_noise = saturate(
        0.625 * boundary.g +
        0.375 * dot(fine_boundary, vec3(0.625, 0.25, 0.125)));
    float epsilon = mix(0.025, 0.12,
        (saturate(layer.supportBand) - 0.02) / 0.78);
    // Candidate one established curved support but left liquid boundaries
    // plastic-smooth. Candidate two keeps the same population/depth and lets
    // the existing medium/fine world-space field act farther into the liquid
    // boundary. This remains purely subtractive; Cc retains its thin guardrail.
    float erosion_scale = coarse < 0.25 ? 0.15 :
        coarse < 0.75 ? 1.10 : 1.50;
    float closed_erosion = epsilon * saturate(layer.erosionStrength) *
        erosion_scale * (1.0 - boundary_noise) *
        (1.0 - smoother(2.0 * epsilon, 6.0 * epsilon, max(closed_body, 0.0)));
    float open_erosion = epsilon * saturate(layer.erosionStrength) *
        erosion_scale * (1.0 - boundary_noise) *
        (1.0 - smoother(2.0 * epsilon, 6.0 * epsilon, max(open_body, 0.0)));
    float closed_eroded = closed_body - closed_erosion;
    float open_eroded = open_body - open_erosion;
    float closed_density = max(closed_eroded, 0.0) *
        smoother(0.0, epsilon, closed_eroded);
    float open_density = max(open_eroded, 0.0) *
        smoother(0.0, epsilon, open_eroded);
    return saturate(broad_coverage) *
        max((1.0 - open_weight) * closed_density, open_weight * open_density);
}
`;

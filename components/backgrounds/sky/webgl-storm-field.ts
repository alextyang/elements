/**
 * Finite, connected Cumulonimbus condensate for the WebGL renderer.
 *
 * This field owns its vertical support and erosion. Call it before the weather
 * map and do not subsequently apply the generic cumulus dome or Worley pass.
 * The host still owns the layer boundaries, transport, lighting, and camera.
 *
 * Morphological constraints:
 * https://cloudatlas.wmo.int/en/clouds-species-calvus.html
 * https://cloudatlas.wmo.int/en/species-cumulonimbus-capillatus-cb-cap.html
 * https://cloudatlas.wmo.int/en/clouds-supplementary-features-incus.html
 */
export const CLOUD_STORM_FIELD_FUNCTIONS = /* glsl */ `
/** The base volume contains four cells per coordinate unit in R/G. */
float cloud_storm_billow(vec3 coordinate) {
    vec4 noise = cloud_texture(u_cloud_base, coordinate);
    return noise.g * 0.68 + noise.b * 0.23 + noise.a * 0.09;
}

float cloud_storm_coverage(
    vec3 world_position,
    CloudLayer layer,
    float altitude_fraction
) {
    float h = saturate(altitude_fraction);
    float incus = abs(layer.species - 21.0) < 0.5 ? 1.0 : 0.0;
    float glaciated = abs(layer.species - 32.0) < 0.5 || incus > 0.5
        ? 1.0 : 0.0;
    // A generic storm can progress into the same upper anatomy. Explicit
    // calvus never acquires cirriform fibres from its genus' anvil default.
    if (layer.species < 0.5) {
        glaciated = smoother(0.40, 0.64, layer.lifecycle);
        incus = glaciated * smoother(0.48, 0.88, layer.anvilAmount);
    }

    float depth = max(1800.0, layer.thickness);
    float requested_scale = max(800.0, layer.elementScaleKm * 1000.0);
    // Recipe element scale describes the entire storm/outflow, not an
    // individual updraft diameter. Its influence is continuous at large
    // values; aspect independently changes the width of the rooted column.
    float scale_response = requested_scale / (requested_scale + depth);
    float core_scale = depth * (0.28 + 0.45 * scale_response) *
        pow(2.2 / max(0.35, layer.verticalAspect), 0.20);
    float support = clamp(layer.supportBand, 0.02, 0.80);
    float shear = saturate(layer.shear * 0.60 + layer.shearCoupling * 0.40);
    vec2 downwind = normalize(layer.wind + vec2(0.173, 0.271));
    vec2 crosswind = vec2(-downwind.y, downwind.x);
    vec2 forward = vec2(sin(u_camera.w), cos(u_camera.w));
    vec2 across = vec2(forward.y, -forward.x);

    // This is the one production scene's finite world owner, placed along its
    // heading as with congestus. No view elevation, FOV, ray, or screen radius
    // participates in the density. Light rays query this identical volume.
    float group_range = max(depth * 1.40, core_scale * (2.45 + incus * 0.60));
    vec2 group_center = forward * group_range + across *
        ((u_cloud_seed.x - 0.5) * core_scale * 0.18);
    vec2 owner = world_position.xz - group_center;
    float rise = smoother(0.06, 0.94, h);
    vec2 tilt = downwind * core_scale * shear *
        (0.10 * rise + 0.24 * rise * rise);
    vec2 rising_owner = owner - tilt;
    // Slight wind alignment retains a broad shared base in the production
    // view without forcing the upper outflow to run across the image.
    vec2 family_axis = normalize(across + downwind * 0.18);
    vec2 family_normal = vec2(-family_axis.y, family_axis.x);
    float x = dot(rising_owner, family_axis) / core_scale;
    float z = dot(rising_owner, family_normal) / core_scale;
    vec3 seed_offset = u_cloud_seed.xzw * vec3(3.7, 2.9, 4.3);

    float outflow_length = mix(0.62, 1.75 + scale_response * 0.68, incus) *
        mix(0.60, 1.10, layer.crownExpansion) * mix(0.72, 1.15, shear);
    // A cheap finite bound precedes all volume samples, including light-ray
    // queries. It encloses the column and its single attached downwind tail.
    vec2 bound = owner / core_scale;
    if (abs(dot(bound, family_axis)) > 1.7 + glaciated * outflow_length ||
        abs(dot(bound, family_normal)) > 1.2 + glaciated * outflow_length) {
        return 0.0;
    }

    // Height-independent ancestry preserves the same roots through every
    // growth stage. The second coordinate is deliberately not altitude.
    vec2 ancestry_owner = cloud_rotate2(rising_owner / core_scale, 0.61);
    vec4 ancestry_sample = cloud_texture(u_cloud_base, vec3(
        ancestry_owner.x * 0.33 + seed_offset.x,
        u_cloud_seed.y * 3.7 + 0.23,
        ancestry_owner.y * 0.33 + seed_offset.z
    ));
    float lineage = saturate((ancestry_sample.r - 0.53) * 3.0);
    float branch_scale = mix(0.48, 0.96,
        saturate(layer.branchOrCrestCount / 12.0));
    float daughter = cloud_texture(u_cloud_base, vec3(
        ancestry_owner.x * branch_scale + seed_offset.z,
        u_cloud_seed.z * 4.1 + 0.41,
        ancestry_owner.y * branch_scale + seed_offset.x
    )).g;
    float centerline = 0.040 * sin(x * 3.7 + u_cloud_seed.w * 5.0) +
        (lineage - 0.5) * 0.10;
    z -= centerline;

    // One persistent maximum and its noisy shoulders describe an unequal
    // parent/daughter family. Their top heights are a continuous landscape;
    // no independent closed primitives are placed at successive altitudes.
    float main_parent = 1.0 - smoothstep(0.12, 0.74,
        abs(x + 0.13 + (lineage - 0.5) * 0.20));
    float parent_strength = saturate(main_parent * 0.76 + lineage * 0.24);
    float lineage_detail = mix(0.035, 0.10,
        saturate((layer.lineageDepth - 1.0) / 8.0));
    float local_top = 0.47 + parent_strength * mix(0.30, 0.47, layer.towerAmount) +
        (daughter - 0.36) * (0.18 + lineage_detail);
    local_top += (u_cloud_scene.y - 0.5) * 0.045;

    // Actual world metres determine buoyancy cells. Four base-volume cells
    // per tile give roughly 400-900 m lobes, with independently phased smaller
    // growth. An altitude-only sine would synchronize all towers into layers.
    vec2 billow_owner = cloud_rotate2(rising_owner, -0.43);
    float cell_metres = clamp(core_scale * 0.14, 280.0, 1000.0) *
        mix(1.12, 0.86, saturate(layer.macroElementCount / 32.0));
    vec3 billow_coordinate = vec3(
        billow_owner.x,
        world_position.y - layer.baseAltitude,
        billow_owner.y
    ) / (cell_metres * 4.0) + seed_offset;
    vec4 billows = cloud_texture(u_cloud_base, billow_coordinate);
    float smaller_billows = cloud_storm_billow(
        billow_coordinate * 1.91 + vec3(0.31, 0.67, 0.19)
    );
    float rounded_surface = (billows.g - 0.37) * 0.16 +
        (smaller_billows - 0.37) * 0.065;
    float pulse = (billows.r - 0.70) * 0.30 +
        (billows.b - 0.37) * 0.085;
    float upper_transition = smoother(0.60, 0.90, h);
    float crown = smoother(0.35, 0.72, h) *
        (1.0 - smoother(0.88, 1.0, h));

    float half_length = mix(1.02, 0.76, smoother(0.08, 0.80, h)) *
        mix(0.90, 1.04, layer.organizationStrength);
    half_length *= mix(0.98, 1.18, saturate((layer.anisotropy - 1.0) / 5.0));
    half_length += crown * layer.crownExpansion * 0.09;
    float end_taper = 1.0 - 0.65 *
        smoothstep(half_length * 0.52, half_length, abs(x));
    float half_width = (0.30 + 0.085 * crown * layer.crownExpansion -
        0.035 * smoother(0.10, 0.40, h)) * end_taper;
    half_width *= mix(0.92, 1.08, u_cloud_scene.x) *
        mix(0.86, 1.13, mix(layer.coverageLow, layer.coverageHigh, lineage));
    half_width += pulse * smoother(0.10, 0.60, h);
    float along_margin = (half_length - abs(x)) * 0.40;
    float cross_margin = half_width - abs(z);
    float top_margin = (local_top - h) * 0.78 -
        0.12 * smoothstep(0.08, 0.34, abs(z));
    // Calvus loses sharp cumuliform outlines only in its upper sproutings.
    // Its lower column retains the same multi-scale liquid billows as cap.
    float calvus_smoothing = (1.0 - glaciated) * upper_transition;
    float surface_displacement = rounded_surface *
        mix(1.0, 0.42, calvus_smoothing) * mix(0.75, 1.16, layer.turbulence);
    float column_margin = min(along_margin, min(cross_margin, top_margin)) +
        surface_displacement;
    float edge_width = mix(0.018, 0.053, support);
    float column = smoothstep(-edge_width, edge_width, column_margin);

    // The lower condensation corridor is a connected common parent. A solid
    // narrow spine joins the daughter roots; noise only roughens its edge.
    // The base hands over throughout the lower column, not in a wafer-thin
    // band that could look like a detached dark plate beneath the towers.
    float base_half_width = (0.29 + layer.baseConnectivity * 0.09) * end_taper;
    float base_margin = min((1.04 - abs(x)) * 0.36,
        base_half_width - abs(z)) + rounded_surface * 0.58;
    float connected_base = smoothstep(-edge_width, edge_width, base_margin) *
        (1.0 - smoother(0.12, 0.34, h)) * layer.baseConnectivity;
    column = max(column, connected_base);

    // Boundary-only entrainment keeps a robust ancestral core while carving
    // clefts between growth lobes. Detail remains in physical metres when
    // elementScaleKm changes, rather than turning a storm into a smooth mass.
    vec3 fine_coordinate = vec3(
        billow_owner.y * 0.81 - billow_owner.x * 0.37,
        (world_position.y - layer.baseAltitude) * 0.93,
        billow_owner.x * 0.81 + billow_owner.y * 0.37
    ) / (clamp(cell_metres * 0.29, 90.0, 230.0) * 2.0) +
        u_cloud_seed.wyx * 3.1;
    vec3 fine_sample = cloud_texture(u_cloud_detail, fine_coordinate).rgb;
    float fine = dot(fine_sample, vec3(0.625, 0.25, 0.125));
    float column_boundary = 1.0 - smoothstep(0.025, 0.13, column_margin);
    float entrainment = (1.0 - fine) * 0.18 +
        (1.0 - smaller_billows) * 0.11;
    column -= column_boundary * entrainment * layer.erosionStrength *
        mix(0.85, 1.35, layer.fragmentation) *
        mix(1.0, 0.50, calvus_smoothing);
    column = max(0.0, column);

    float outflow = 0.0;
    if (glaciated > 0.001 && h > 0.60) {
        // Ice follows the air leaving the same parent at the upper column.
        // The source is inside its crown; every downstream cross-section
        // overlaps its predecessor. Sedimentation curves only this outflow.
        vec2 crown_source = group_center +
            downwind * core_scale * shear * 0.28 -
            family_axis * core_scale * 0.13;
        vec2 outflow_owner = (world_position.xz - crown_source) / core_scale;
        float down = dot(outflow_owner, downwind);
        float side = dot(outflow_owner, crosswind);
        float age = saturate(down / max(0.12, outflow_length));
        float settling = layer.sedimentationCoupling * age * age;
        float plume_curve = (lineage - 0.5) * 0.075 * age +
            sin(age * 2.7 + u_cloud_seed.w * 3.1) *
            layer.fibreCurl * age * 0.045;
        side -= plume_curve;
        float spread = mix(0.25, 0.56, incus) *
            smoother(0.0, 0.68, age) * layer.crownExpansion;
        float plume_width = (0.28 + spread) *
            (1.0 - 0.38 * smoother(0.70, 1.0, age));
        float plume_end = min(down + 0.32, outflow_length - down);
        float plume_bottom = mix(0.655, 0.785, smoother(0.0, 0.36, age)) -
            settling * mix(0.055, 0.085, incus);
        float plume_top = mix(0.935, 0.905, age) - settling * 0.04;

        // Strongly anisotropic 3D ice is swept along the outflow, with a
        // continuous liquid-to-ice transition. This cannot run for calvus.
        float ice_metres = max(95.0, cell_metres * 0.24);
        vec3 ice_coordinate = vec3(
            down * core_scale / (ice_metres * 17.0),
            ((h - 0.80 + settling * 0.10) * depth) / (ice_metres * 2.5),
            side * core_scale / (ice_metres * 2.3)
        ) + u_cloud_seed.zyw * vec3(4.1, 3.3, 2.7);
        vec3 ice_sample = cloud_texture(u_cloud_detail, ice_coordinate).rgb;
        float ice_fibres = dot(ice_sample, vec3(0.62, 0.27, 0.11));
        float ice_fray = (ice_fibres - 0.36) *
            mix(0.035, 0.10, age) * mix(0.7, 1.2, layer.fibreCurl);
        float horizontal_margin = min(plume_end * 0.26,
            plume_width - abs(side));
        float vertical_margin = min(h - plume_bottom, plume_top - h);
        float ice_margin = min(horizontal_margin, vertical_margin) + ice_fray;
        float ice_edge = mix(0.028, 0.068, support);
        outflow = smoothstep(-ice_edge, ice_edge, ice_margin) *
            mix(0.68, 0.28, age) * mix(0.76, 1.0, ice_fibres);
        outflow *= glaciated * smoother(0.60, 0.72, h);
        outflow *= 1.0 - layer.fragmentation * 0.35 * age;

        // Fibres also soften and striate the top of the convective column.
        // Only its exposed boundary is thinned; its source stays attached.
        float crown_ice = glaciated * smoother(0.61, 0.87, h);
        column *= 1.0 - crown_ice * column_boundary *
            (1.0 - ice_fibres) * 0.48;
    }

    float humidity = mix(0.84, 1.04, u_cloud_scene.z);
    float condensate = max(column * mix(0.52, 0.78, smoother(0.04, 0.62, h)),
        outflow) * humidity;
    // A short condensation ramp keeps the base level while allowing a ragged
    // underside. The irregular ancestry top already supplies the crown cut.
    float base_gate = smoother(0.0, 0.018, h);
    float top_gate = 1.0 - smoother(0.975, 1.0, h);
    return saturate(condensate * base_gate * top_gate);
}
`;

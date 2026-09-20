/**
 * Continuous source-owned Cirrus and Cirrostratus condensate.
 *
 * Coordinates arrive in advected Earth-local metres. The host applies layer
 * limits and transport; this module owns ice anatomy and boundary erosion.
 * Texture noise defines irregular source packets, never a collection of
 * closed geometric cloud primitives. Altitude back-tracing keeps fallstreaks
 * attached to the same source. All returned densities are in [0, 1].
 *
 * Primary morphology references (WMO International Cloud Atlas):
 * https://cloudatlas.wmo.int/en/species-cirrus-fibratus-ci-fib.html
 * https://cloudatlas.wmo.int/en/species-cirrus-uncinus-ci-unc.html
 * https://cloudatlas.wmo.int/en/species-cirrus-spissatus-ci-spi.html
 * https://cloudatlas.wmo.int/en/species-cirrus-castellanus-ci-cas.html
 * https://cloudatlas.wmo.int/en/species-cirrus-floccus-ci-flo.html
 * https://cloudatlas.wmo.int/en/species-cirrostratus-fibratus-cs-fib.html
 * https://cloudatlas.wmo.int/en/species-cirrostratus-nebulosus-cs-neb.html
 */
export const CLOUD_ICE_FIELD_FUNCTIONS = /* glsl */ `
float cloud_ice_band(float h, float center, float half_depth, float softness) {
    float depth = max(0.008, half_depth);
    return 1.0 - smoother(depth * (1.0 - softness),
        depth * (1.0 + softness), abs(h - center));
}

float cloud_ice_fibres(vec3 coordinate) {
    return dot(cloud_texture(u_cloud_detail, coordinate).rgb,
        vec3(0.58, 0.29, 0.13));
}

float cloud_ice_coverage(
    vec3 sample_position,
    CloudLayer layer,
    float h,
    float broad_coverage
) {
    if (h < 0.0 || h > 1.0 || broad_coverage <= 0.0) return 0.0;
    float weather = saturate(broad_coverage);
    float period = max(80.0, layer.elementScaleKm * 1000.0);
    float thickness = max(1.0, layer.thickness);
    vec2 wind_direction = layer.wind + vec2(0.173, 0.271);
    float wind_length = length(wind_direction);
    vec2 wind_axis = wind_length > 0.0001
        ? wind_direction / wind_length : vec2(1.0, 0.0);
    vec2 cross_axis = vec2(-wind_axis.y, wind_axis.x);
    float anisotropy = max(1.0, layer.anisotropy);
    vec2 ice_position = sample_position.xz;
    if (abs(layer.species - 2.0) < 0.5 || abs(layer.species - 3.0) < 0.5 ||
        abs(layer.species - 6.0) < 0.5 || abs(layer.species - 7.0) < 0.5) {
        // These fields already back-trace their own settling crystals. The
        // generic host shear otherwise spreads a compact source across several
        // kilometres again, washing hooks and veil striations into a blur.
        ice_position = ice_position - layer.wind * layer.shear * h * 90.0;
    }
    float along = dot(ice_position, wind_axis) / (period * anisotropy);
    float across = dot(ice_position, cross_axis) / period;
    float vertical = sample_position.y / period;
    float support = clamp(layer.supportBand, 0.02, 0.80);
    float fragment = saturate(layer.fragmentation);
    float packet_depth = clamp(period * layer.verticalAspect / thickness, 0.08, 0.98);
    vec3 seed = u_cloud_seed.xzw * vec3(3.1, 2.7, 3.9);
    vec3 coordinate = vec3(along, vertical, across) + seed;

    // Fibratus keeps the existing production source/fibre frequencies and
    // thresholds. Its filaments can curve but do not terminate in ice heads.
    if (abs(layer.species - 1.0) < 0.5) {
        vec4 macro_sample = cloud_texture(u_cloud_base, coordinate * 0.31);
        float fall = (1.0 - h) * layer.sedimentationCoupling;
        vec4 source = cloud_texture(u_cloud_base, vec3(
            along * 6.0 + u_cloud_seed.z,
            u_cloud_seed.y * 2.3,
            across * 0.6 + u_cloud_seed.w
        ));
        float curl = (source.b - 0.5) * layer.fibreCurl;
        vec3 fibre_coordinate = vec3(
            along * 2.0 + fall * layer.shearCoupling * 0.7,
            vertical * 0.42 + along * layer.fibreCurl * 0.31,
            across * 16.0 + curl * 7.0 +
                fall * (macro_sample.b - 0.5) * 3.0
        );
        float fibre = cloud_ice_fibres(fibre_coordinate);
        float source_swath = smoother(0.66, 0.75, source.r);
        // At the authored 13 km / 0.0525 aspect / 800 m layer this retains
        // the previous full-depth field. Thinner aspect overrides narrow the
        // material packet without changing the 3D texture's wavelength.
        float aspect_gate = mix(
            cloud_ice_band(h, 0.5, packet_depth * 0.50, 0.24),
            1.0,
            smoother(0.70, 0.84, packet_depth)
        );
        return saturate(weather * source_swath * smoother(
            mix(0.26, 0.42, fragment), 0.68, fibre
        ) * mix(0.52, 1.0, smoother(0.04, 0.78, h)) * aspect_gate);
    }

    // The veils have a connected positive interior. Fibratus embeds fine
    // streaks into it; nebulosus deliberately has no microstructure sample.
    if (abs(layer.species - 6.0) < 0.5 ||
        abs(layer.species - 7.0) < 0.5) {
        vec4 shield = cloud_texture(u_cloud_base, vec3(
            along * 0.19 + seed.z,
            u_cloud_seed.y * 2.7 + 0.41,
            across * 0.22 + seed.x
        ));
        float shield_center = 0.49 + (shield.r - 0.69) *
            min(0.15, packet_depth * 0.16);
        float shield_band = cloud_ice_band(h, shield_center,
            packet_depth * 0.47, mix(0.12, 0.28, support));
        float shield_support = smoother(0.015, 0.28, weather);
        float smooth_veil = mix(0.65, 0.72, shield.r);
        if (abs(layer.species - 7.0) < 0.5) {
            return saturate(shield_support * shield_band * smooth_veil);
        }
        float bend = (shield.b - 0.38) * layer.fibreCurl;
        float fine_scale = clamp(period / 22000.0, 0.5, 8.0);
        float veil_fibre = cloud_ice_fibres(vec3(
            along * 1.6 * fine_scale + (1.0 - h) * layer.shearCoupling * 0.18,
            vertical * 0.62 + along * layer.fibreCurl * 0.17,
            across * 16.0 * fine_scale + bend * 4.0
        ));
        float striation = smoother(0.23, 0.58, veil_fibre);
        float connected = mix(0.22, 0.38, layer.baseConnectivity);
        return saturate(shield_support * shield_band *
            mix(connected, 0.92, striation) * mix(0.90, 1.0, shield.r));
    }

    // Source packets are keyed by advected horizontal position. Height is
    // used only to back-trace settling crystals and shape finite support.
    vec4 broad_source = cloud_texture(u_cloud_base, vec3(
        along * 0.43 + seed.z,
        u_cloud_seed.y * 3.3 + 0.29,
        across * 0.53 + seed.x
    ));
    float source_warp = (broad_source.b - 0.38) * layer.fibreCurl;
    float shear = saturate(layer.shearCoupling * 0.65 + layer.shear * 0.35);

    if (abs(layer.species - 2.0) < 0.5) {
        float head_height = 0.77 + (broad_source.r - 0.69) * 0.34;
        float fall_depth = min(0.74, packet_depth *
            mix(0.66, 1.10, layer.sedimentationCoupling));
        float fall_age = saturate((head_height - h) / max(0.10, fall_depth));
        float downwind_shift = fall_age * fall_age * thickness *
            mix(0.60, 3.2, shear) * layer.sedimentationCoupling;
        // A bend that turns back near the source makes the upper comma. Its
        // continuation is a settling streamline, not a separate rounded head.
        float hook_turn = smoother(0.0, 0.28, fall_age) -
            0.72 * smoother(0.28, 0.68, fall_age);
        float hook_width = period * mix(0.020, 0.065, layer.fibreCurl);
        float hook_shift = hook_turn * hook_width +
            fall_age * fall_age * source_warp * period * 0.07;
        vec2 source_position = ice_position -
            wind_axis * downwind_shift - cross_axis * hook_shift;
        // The long fallstreak, not its source head, carries the streamer
        // anisotropy. Stretching both made kilometre-wide blurred ribbons.
        float head_aspect = 1.0 + (anisotropy - 1.0) * 0.16;
        float source_along = dot(source_position, wind_axis) / (period * head_aspect);
        float source_across = dot(source_position, cross_axis) / period;
        vec4 hook_source = cloud_texture(u_cloud_base, vec3(
            source_along * 12.0 + seed.x,
            u_cloud_seed.z * 3.9 + 0.17 + source_along * 0.371 + source_across * 0.593,
            source_across * 8.3 + seed.z
        ));
        float head_to_tail_threshold = mix(0.654, 0.714, fall_age);
        float hook_support = smoother(head_to_tail_threshold,
            head_to_tail_threshold + mix(0.070, 0.043, fall_age), hook_source.r);
        float source_end = smoother(head_height - fall_depth,
            head_height - fall_depth + 0.075, h) *
            (1.0 - smoother(head_height + 0.015,
                min(0.99, head_height + max(0.035, 0.12 * packet_depth)), h));
        float fibres = cloud_ice_fibres(vec3(
            source_along * 2.0 + fall_age * 0.19,
            vertical * 0.50 + source_along * 0.28,
            source_across * 70.0 + source_warp * 4.0 + fall_age * 0.83
        ));
        float head = 1.0 - smoother(0.06, 0.34, fall_age);
        float silky = smoother(mix(0.25, 0.38, fragment), 0.66, fibres);
        float source_groups = smoother(0.655, 0.735, broad_source.r);
        return saturate(weather * source_groups * hook_support * source_end *
            mix(silky * 0.52, 0.42 + silky * 0.35, head));
    }

    if (abs(layer.species - 3.0) < 0.5) {
        float fall_age = (1.0 - h) * layer.sedimentationCoupling;
        vec3 patch_coordinate = vec3(
            along * 0.73 - fall_age * shear * 0.055,
            u_cloud_seed.z * 3.1 + 0.37,
            across * 0.88 + source_warp * 0.10
        ) + seed;
        vec4 ice_patch = cloud_texture(u_cloud_base, patch_coordinate);
        float potential = ice_patch.r * 0.83 + broad_source.r * 0.17;
        float threshold = mix(0.630, 0.705, fragment);
        float packet = smoother(threshold, threshold + support * 0.20 + 0.035,
            potential);
        float core = smoother(threshold + 0.035, threshold + 0.085, potential);
        float patch_center = 0.52 + (ice_patch.b - 0.38) * packet_depth * 0.18 -
            fall_age * shear * 0.055;
        float patch_band = cloud_ice_band(h, patch_center,
            packet_depth * mix(0.22, 0.48, core), mix(0.16, 0.42, support));
        float fine_scale = clamp(period / 10500.0, 0.45, 4.0);
        float fibres = cloud_ice_fibres(vec3(
            along * 1.8 * fine_scale + fall_age * shear * 0.24,
            vertical * 0.60 + along * layer.fibreCurl * 0.22,
            across * 16.0 * fine_scale + source_warp * 5.0 + fall_age * 0.41
        ));
        float fringe = smoother(mix(0.24, 0.36, fragment), 0.62, fibres);
        // Interior ice can be optically dense; only its perimeter frays into
        // elongated fibres. There is no liquid cellular texture on the face.
        float condensate = mix(0.18 + fringe * 0.48,
            0.72 + fibres * 0.25, core);
        return saturate(weather * packet * patch_band * condensate);
    }

    if (abs(layer.species - 22.0) < 0.5) {
        // The generic host shear spans kilometres across an ice layer. Undo
        // its height-dependent displacement for compact turrets, then apply
        // one short physical tilt; bulk advection remains in source_position.
        vec2 source_position = sample_position.xz -
            layer.wind * layer.shear * (h - 0.32) * 90.0 -
            wind_axis * (h - 0.32) * thickness * shear * 0.18;
        vec2 world_owner = sample_position.xz - layer.drift -
            layer.wind * layer.shear * h * 90.0;
        vec2 region = (world_owner - (seed.xz - vec2(1.5, 1.9)) * 4500.0) /
            vec2(38000.0, 32000.0);
        float finite_region = (1.0 - smoother(0.62, 1.0, abs(region.x))) *
            (1.0 - smoother(0.62, 1.0, abs(region.y)));
        if (finite_region <= 0.0) return 0.0;
        vec2 compact = vec2(dot(source_position, wind_axis),
            dot(source_position, cross_axis)) / period;
        vec2 group_coordinate = cloud_rotate2(compact, 0.73) * 0.027;
        vec4 group_source = cloud_texture(u_cloud_base, vec3(
            group_coordinate.x + seed.z, u_cloud_seed.y * 3.7 + 0.19,
            group_coordinate.y + seed.x
        ));
        float group_support = smoother(0.666, 0.737, group_source.r);
        vec2 source_warp2 = (group_source.gb - vec2(0.42)) * 1.7;
        vec2 source_coordinate = cloud_rotate2(compact, -0.31) + source_warp2;
        float source_along = source_coordinate.x /
            (1.0 + (anisotropy - 1.0) * 0.12);
        float source_across = source_coordinate.y;
        // Each broad humid region contains a few unequal, curved common-base
        // lines. Their local turrets are not elongated by street anisotropy.
        vec4 base_source = cloud_texture(u_cloud_base, vec3(
            source_along * 0.13 + seed.z,
            u_cloud_seed.y * 4.7 + 0.19,
            source_across * 0.25 + seed.x
        ));
        float base_support = group_support * smoother(0.653, 0.715, base_source.r);
        float branch_frequency = mix(0.22, 0.53,
            saturate(layer.branchOrCrestCount / 12.0));
        vec4 ancestry = cloud_texture(u_cloud_base, vec3(
            source_along * branch_frequency + seed.x,
            u_cloud_seed.z * 4.1 + 0.31,
            source_across * branch_frequency * 1.09 + seed.z
        ));
        float parent = saturate((ancestry.r - 0.60) * 4.0);
        float turret = smoother(0.28, 0.64,
            parent * 0.56 + ancestry.g * 0.44);
        float base_height = 0.32 + (base_source.b - 0.38) * packet_depth * 0.075;
        float turret_top = base_height + packet_depth *
            (0.09 + turret * mix(0.54, 0.84, layer.crownExpansion));
        float common_base = cloud_ice_band(h, base_height,
            packet_depth * 0.095, 0.34) * layer.baseConnectivity;
        vec3 turret_coordinate = vec3(
            source_along * 1.83 + seed.z,
            vertical * 0.50 + seed.y,
            source_across * 1.97 + seed.x
        );
        vec4 ice_growth = cloud_texture(u_cloud_base, turret_coordinate);
        float upper_variation = (ice_growth.g - 0.38) * packet_depth * 0.08 *
            mix(0.65, 1.1, layer.turbulence);
        float top_gate = 1.0 - smoother(turret_top - packet_depth * 0.045,
            turret_top + packet_depth * 0.050, h - upper_variation);
        float lower_gate = smoother(base_height - packet_depth * 0.04,
            base_height + packet_depth * 0.07, h);
        float turrets = top_gate * lower_gate * smoother(0.04, 0.42, turret);
        float fibres = cloud_ice_fibres(vec3(
            source_along * 0.65 + shear * h * 0.12,
            vertical * 0.75 + source_along * layer.fibreCurl * 0.10,
            source_across * 2.5 + (group_source.b - 0.42) * layer.fibreCurl * 2.0
        ));
        float ice_surface = mix(0.54, 0.96, smoother(0.24, 0.64, fibres));
        return saturate(weather * finite_region * base_support *
            max(common_base * 0.62, turrets * ice_surface));
    }

    if (abs(layer.species - 23.0) < 0.5) {
        vec2 compact_position = sample_position.xz -
            layer.wind * layer.shear * (h - 0.64) * 90.0;
        vec2 world_owner = sample_position.xz - layer.drift -
            layer.wind * layer.shear * h * 90.0;
        vec2 region = (world_owner - (seed.xz - vec2(1.5, 1.9)) * 4500.0) /
            vec2(36000.0, 30000.0);
        float finite_region = (1.0 - smoother(0.62, 1.0, abs(region.x))) *
            (1.0 - smoother(0.62, 1.0, abs(region.y)));
        if (finite_region <= 0.0) return 0.0;
        vec2 compact = vec2(dot(compact_position, wind_axis),
            dot(compact_position, cross_axis)) / period;
        vec2 group_coordinate = cloud_rotate2(compact, -0.67) * 0.024;
        vec4 group_source = cloud_texture(u_cloud_base, vec3(
            group_coordinate.x + seed.z, u_cloud_seed.y * 3.7 + 0.29,
            group_coordinate.y + seed.x
        ));
        float group_support = smoother(0.672, 0.738, group_source.r);
        float head_height = 0.64 + (group_source.r - 0.69) * packet_depth * 0.52;
        float fall_depth = packet_depth * mix(0.22, 0.74, layer.sedimentationCoupling);
        float fall_age = saturate((head_height - h) / max(0.08, fall_depth));
        float downwind_shift = fall_age * fall_age * thickness *
            mix(0.08, 0.76, shear) * layer.sedimentationCoupling;
        vec2 source_coordinate = cloud_rotate2(compact -
            vec2(downwind_shift / period, 0.0), 0.41) +
            (group_source.gb - vec2(0.42)) * 1.9;
        float source_along = source_coordinate.x /
            (1.0 + (anisotropy - 1.0) * 0.08);
        float source_across = source_coordinate.y;
        vec4 tuft_source = cloud_texture(u_cloud_base, vec3(
            source_along * 0.29 + seed.z,
            u_cloud_seed.y * 3.9 + 0.37,
            source_across * 0.31 + seed.x
        ));
        float coarse_support = group_support * smoother(0.659, 0.745, tuft_source.r);
        float tuft_potential = tuft_source.g * 0.48 +
            saturate((tuft_source.r - 0.56) * 3.4) * 0.52;
        float tuft_threshold = mix(0.30, 0.42, fragment);
        float tuft_support = coarse_support * smoother(tuft_threshold,
            tuft_threshold + mix(0.13, 0.22, support), tuft_potential);
        float head_band = cloud_ice_band(h, head_height,
            packet_depth * mix(0.14, 0.23, layer.crownExpansion),
            mix(0.20, 0.44, support));
        float fibres = cloud_ice_fibres(vec3(
            source_along * 0.64 + h * shear * 0.12,
            vertical * 0.75 + source_along * layer.fibreCurl * 0.14,
            source_across * 3.9 + (group_source.b - 0.42) * layer.fibreCurl * 1.8 + fall_age * 0.28
        ));
        float head_fray = mix(0.49, 0.93, smoother(0.24, 0.62, fibres));
        // Lower material narrows to the persistent maxima of the same source
        // and vanishes at a finite sublimation distance. There is no base floor.
        float tail_support = coarse_support * smoother(
            tuft_threshold + fall_age * 0.08,
            tuft_threshold + 0.15 + fall_age * 0.08,
            tuft_potential
        );
        float tail_band = smoother(head_height - fall_depth,
            head_height - fall_depth + 0.075, h) *
            (1.0 - smoother(head_height - 0.025, head_height + 0.035, h));
        float tail_fibres = smoother(mix(0.26, 0.40, fragment), 0.65, fibres);
        float tail = tail_support * tail_band * tail_fibres *
            layer.sedimentationCoupling * 0.60;
        return saturate(weather * finite_region * max(tuft_support * head_band * head_fray, tail));
    }

    return 0.0;
}
`;

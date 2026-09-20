/**
 * Finite world-space lenticularis (24, 9, 28) and volutus (27, 14) fields.
 * Not integrated into the production shader yet.
 *
 * WMO morphology: bounded, mostly smooth lens/almond patches; a volutus is a
 * detached horizontal tube, normally a single line for Altocumulus.
 * https://cloudatlas.wmo.int/en/clouds-species-lenticularis.html
 * https://cloudatlas.wmo.int/en/species-cirrocumulus-lenticularis-cc-len.html
 * https://cloudatlas.wmo.int/en/species-stratocumulus-lenticularis-sc-len.html
 * https://cloudatlas.wmo.int/en/clouds-species-volutus.html
 * https://cloudatlas.wmo.int/en/species-altocumulus-volutus-ac-vol.html
 *
 * Controls, in this field (not literal interpretations of old recipe prose):
 * - elementScaleKm: nominal full axial length of one lens / one roll.
 * - anisotropy: nominal lens axial/propagation aspect at fixed horizontal area;
 *   rolls use its square root as an axial stretch, preserving tube diameter.
 * - verticalAspect: full material depth / nominal element length, limited by
 *   the meteorological layer to 72% of its depth. No vertical noise rescaling.
 * - branchOrCrestCount: number of detached parallel crests / rolls, 0..24.
 * - macroElementCount: lenses along EACH crest; for a roll, diameter maxima
 *   along its one continuous axis (not independent tube or sphere stamps).
 * - waveAmplitude: vertical wave displacement and condensate amplitude, not
 *   wavelength. Zero disables the wave condensate without moving its phase.
 * Fractional lens/crest counts fade in the final lobe/crest; fractional roll
 * diameter counts continuously change the axial modulation frequency.
 * Scale has a 50 m floor; depth is limited to [0.00001, 0.72] of the layer,
 * anisotropy to [0.1, 12], and macro count to [1, 128]. These are physical or
 * authored-domain bounds, not guarantees that every extreme renders usefully.
 * The remaining
 * controls used here are supportBand (edge width), erosionStrength (bounded
 * surface relief), and shearCoupling (crest curvature). Lineage depth,
 * sedimentation, closure, base connectivity, crown expansion, fragmentation
 * and fibre curl are not implemented by this field; do not advertise them.
 *
 * Input is unadvected Earth-local world_position plus a caller-owned finite
 * system_center in the same metre frame. The caller moves that center for
 * advection; do not pass the host's height-sheared sample_position. Placement
 * never depends on camera, ray or screen. View and light use the same entry.
 * Density is in [0, saturate(weather)] and exactly zero outside its finite
 * support. Dependencies: CloudLayer, u_cloud_seed, cloud_texture with explicit
 * LOD zero, u_cloud_base, saturate and smoother. Generic erosion must not be
 * applied a second time. Host optics and transport remain unchanged.
 */
export const CLOUD_WAVE_FIELD_FUNCTIONS = /* glsl */ `
float cloud_wave_coverage(
    vec3 world_position,
    vec2 system_center,
    CloudLayer layer,
    float h,
    float weather
) {
    if (h < 0.0 || h > 1.0 || weather <= 0.0) return 0.0;
    float roll = abs(layer.species - 27.0) < 0.5 ||
        abs(layer.species - 14.0) < 0.5 ? 1.0 : 0.0;
    if (roll < 0.5 && abs(layer.species - 24.0) > 0.5 &&
        abs(layer.species - 9.0) > 0.5 &&
        abs(layer.species - 28.0) > 0.5) return 0.0;
    float amplitude = saturate(layer.waveAmplitude);
    float crests = clamp(layer.branchOrCrestCount, 0.0, 24.0);
    if (amplitude <= 0.0 || crests <= 0.0) return 0.0;

    float scale = max(50.0, layer.elementScaleKm * 1000.0);
    float thickness = max(1.0, layer.thickness);
    float depth = clamp(scale * max(0.002, layer.verticalAspect) /
        thickness, 0.00001, 0.72);
    float axial_stretch = sqrt(clamp(layer.anisotropy, 0.1, 12.0));
    float axial_length = scale * axial_stretch;
    float cross_width = roll > 0.5 ? depth * thickness : scale / axial_stretch;
    float elements = clamp(layer.macroElementCount, 1.0, 128.0);
    float axial_extent = axial_length * (roll > 0.5 ? 1.0 : elements * 1.35);
    float crest_spacing = cross_width * (roll > 0.5 ? 1.65 : 1.40);
    vec2 axis = length(layer.wind) > 0.0001
        ? normalize(layer.wind) : vec2(1.0, 0.0);
    vec2 ridge_axis = vec2(-axis.y, axis.x);
    vec2 relative = world_position.xz - system_center;
    float along = dot(relative, axis);
    float axial = dot(relative, ridge_axis);

    // Cheap conservative finite bounds precede texture work. The curvature
    // displacement below is strictly below 0.30 crest spacings.
    if (abs(along) > crest_spacing * (crests * 0.5 + 0.8) ||
        abs(axial) > axial_extent * 0.65) return 0.0;
    vec3 seed = u_cloud_seed.xzw * vec3(3.1, 2.7, 3.9);
    vec4 source = cloud_texture(u_cloud_base, vec3(
        along / max(1.0, crest_spacing * crests) * 0.37 + seed.x,
        u_cloud_seed.y * 4.1 + axial / axial_extent * 0.19,
        axial / axial_extent * 0.41 + seed.z
    ));
    float bend = sin(axial / axial_extent * 5.1 + seed.y) *
        saturate(layer.shearCoupling) * 0.16 + (source.b - 0.5) * 0.10;
    float crest_position = along / crest_spacing + (crests - 1.0) * 0.5 + bend;
    float crest_index = floor(crest_position + 0.5);
    if (crest_index < 0.0 || crest_index >= crests) return 0.0;
    float crest_weight = smoother(0.0, 1.0, crests - crest_index);
    float crest_local = crest_position - crest_index;
    float coarse = abs(layer.species - 28.0) < 0.5 ||
        abs(layer.species - 14.0) < 0.5 ? 1.0 :
        abs(layer.species - 24.0) < 0.5 ? 0.0 : 0.45;
    float edge = mix(0.025, 0.18, saturate(layer.supportBand));
    float relief = (source.g - 0.5) * saturate(layer.erosionStrength) *
        edge * mix(0.20, 0.80, coarse);
    float entrainment = (1.0 - source.g) * saturate(layer.erosionStrength) *
        mix(0.025, 0.10, coarse);
    float center_height = 0.5 + depth * amplitude *
        (0.10 * cos(6.2831853 * crest_local) + (source.r - 0.5) * 0.035);

    if (roll > 0.5) {
        // One deformed cylinder per finite wave crest, not a union of puffs.
        // Axial maxima vary its diameter without severing the tube. The
        // detached gaps lie outside this cross-section for every height.
        float end_coordinate = axial / (axial_length * 0.5);
        float end_support = 1.0 - smoother(0.70, 1.0, abs(end_coordinate));
        if (end_support <= 0.0) return 0.0;
        float swell_position = clamp(end_coordinate / 1.4 + 0.5, 0.0, 1.0);
        float swell = 0.5 + 0.5 * cos(
            6.2831853 * (elements * swell_position - 0.5));
        float radius_scale = (0.79 + swell * mix(0.10, 0.20, coarse)) *
            sqrt(end_support) * sqrt(amplitude) * (1.0 - entrainment);
        float lateral = crest_local * crest_spacing / (cross_width * 0.5);
        float vertical = (h - center_height) / (depth * 0.5);
        float section = (lateral * lateral + vertical * vertical) /
            max(0.00001, radius_scale * radius_scale);
        float tube = 1.0 - smoother(1.0 - edge, 1.0 + relief, section);
        float texture_density = mix(0.96, 0.78 + source.g * 0.22, coarse);
        return saturate(weather) * crest_weight * tube * end_support *
            amplitude * texture_density;
    }

    // The intersection of a finite moist crest and an axial humidity wave
    // defines the lens. Its thickness follows condensate potential, tapering
    // both ends and edges into one laminar packet with an almond silhouette.
    float lobe_position = axial / (axial_length * 1.35) +
        (elements - 1.0) * 0.5 + sin(crest_index * 2.37 + seed.z) * 0.08;
    float lobe_index = floor(lobe_position + 0.5);
    if (lobe_index < 0.0 || lobe_index >= elements) return 0.0;
    float lobe_weight = smoother(0.0, 1.0, elements - lobe_index);
    float lobe_local = lobe_position - lobe_index;
    float lift = 0.60 * cos(6.2831853 * crest_local) +
        0.40 * cos(6.2831853 * lobe_local) - 0.28 - entrainment;
    float condensate = saturate(lift / 0.72);
    float half_depth = depth * 0.5 * sqrt(condensate * amplitude);
    if (half_depth <= 0.0000001) return 0.0;
    float vertical = abs(h - center_height) / half_depth;
    float lamina = 1.0 - smoother(1.0 - edge, 1.0 + relief, vertical);
    float rim = smoother(0.0, edge, condensate);
    float texture_density = mix(0.97, 0.80 + source.g * 0.20, coarse);
    return saturate(weather) * crest_weight * lobe_weight * lamina * rim *
        amplitude * texture_density;
}
`;

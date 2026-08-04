/**
 * Renderer-facing WGSL contract for cloud optical assets.
 *
 * Bindings 21–24 append to the current production cloud bind group after the
 * macro atlas/system resources. The lighting-cache shader consumes the state
 * and owner buffers for extinction; view transport additionally consumes the
 * phase texture and sampler for angular scattering.
 */

import {
    CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR,
    CLOUD_CAMERA_HIGH_ICE_GL2_NODE,
    CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT,
    CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION,
    CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION,
    CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT,
    CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE,
} from "./cloud-optics";

export const CLOUD_OPTICS_PHASE_BINDING = 21;
export const CLOUD_OPTICS_SAMPLER_BINDING = 22;
export const CLOUD_OPTICS_STATE_BINDING = 23;
export const CLOUD_OPTICS_OWNER_BINDING = 24;

export const CLOUD_OPTICS_WGSL = /* wgsl */ `
struct CloudOpticalState {
    // phase class, effective radius µm, habit code, roughness [0,1]
    particle: vec4<f32>,
    // mass extinction RGB (m²/kg), phase LUT row
    extinction_and_row: vec4<f32>,
    // single-scattering albedo RGB, mean asymmetry
    albedo_and_mean_g: vec4<f32>,
    // forward HG g, Draine g, Draine alpha, Draine weight
    analytic_forward: vec4<f32>,
    // backward HG g, backward weight, fit RMS log2, forward <10° energy
    analytic_backward: vec4<f32>,
    rainbow: vec4<f32>,
    glory: vec4<f32>,
    // asymmetry RGB, schema version
    asymmetry_and_schema: vec4<f32>,
};

struct CloudOpticalOwner {
    // active, owner index, layer index, system index
    identity: vec4<f32>,
    // liquid low/high rows, ice low/high rows
    radius_rows: vec4<f32>,
    // liquid interpolation, ice interpolation, liquid r_eff, ice r_eff
    radius_interpolation: vec4<f32>,
    // habit code, roughness, default ice fraction, unresolved ice porosity
    ice_regime: vec4<f32>,
};

struct CloudLocalOptics {
    mass_extinction: vec3<f32>,
    single_scattering_albedo: vec3<f32>,
    asymmetry: vec3<f32>,
    phase: vec3<f32>,
    // Mean-preserving sub-footprint optical-depth heterogeneity. Stored mass
    // and world density remain unchanged; camera and local escape paths may
    // evaluate the corresponding expected Beer transmittance.
    unresolved_ice_porosity: f32,
    // Resolved high-ice texture contrast and its along-ray correlation. Both
    // are dimensionless [0,1] signals. They modulate only the sub-footprint
    // distribution; arithmetic-mean extinction remains unchanged.
    unresolved_ice_variance: f32,
    unresolved_ice_correlation: f32,
    // High-ice sidecar moments. R stores raw E[rho^2], G stores support;
    // residual variance is a separate zero-mean procedural band.
    high_ice_second_moment: f32,
    high_ice_coverage: f32,
    high_ice_residual_variance: f32,
    high_ice_mean_density: f32,
    high_ice_correlation_length: f32,
    high_ice_lateral_filter_radius: f32,
    high_ice_depth_filter_radius: f32,
};

// Angle-independent sufficient statistics for a physical mixture.  Camera
// density can contain more than two overlapping meteorological owners. These
// moments can therefore be accumulated across every owner without selecting
// identities, then reduced to passive bulk optics at the receiver.  Angular
// LUT detail remains a separate, optional refinement when the retained owner
// set provably contains the complete mixture.
struct CloudOpticalMoments {
    mass_extinction: vec3<f32>,
    scattering: vec3<f32>,
    scattering_asymmetry: vec3<f32>,
};

struct CloudMultipleScatteringInput {
    energy: vec3<f32>,
    asymmetry: vec3<f32>,
    phase: vec3<f32>,
};

const CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT: u32 =
    ${CLOUD_OPTICS_MULTIPLE_SCATTERING_ORDER_COUNT}u;
const CLOUD_MULTIPLE_SCATTERING_CONTINUATION: f32 =
    ${CLOUD_OPTICS_MULTIPLE_SCATTERING_CONTINUATION};
const CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION: f32 =
    ${CLOUD_OPTICS_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION};
const CLOUD_P1_TRANSPORT_TAU_LOWER: f32 =
    ${CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE[0]};
const CLOUD_P1_TRANSPORT_TAU_UPPER: f32 =
    ${CLOUD_P1_TRANSPORT_OPTICAL_DEPTH_FADE[1]};
// Camera high-ice packet contract. Every occupied finite Ci/Cc/Cs step is
// integrated at two positive GL2 nodes. The axial texture footprint is the
// standard deviation of each represented uniform subsegment, not the full
// parent step. Source GL4 nodes publish the same sigma-depth convention.
const CLOUD_CAMERA_HIGH_ICE_GL2_NODE: f32 =
    ${CLOUD_CAMERA_HIGH_ICE_GL2_NODE};
const CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT: u32 =
    ${CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT}u;
const CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR: f32 =
    ${CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR};
const CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES: array<f32, 4> = array<f32, 4>(
    0.0694318442, 0.3300094782, 0.6699905218, 0.9305681558);
const CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS: array<f32, 4> = array<f32, 4>(
    0.1739274226, 0.3260725774, 0.3260725774, 0.1739274226);

@group(0) @binding(21) var cloud_optical_phase_lut: texture_2d<f32>;
@group(0) @binding(22) var cloud_optical_phase_sampler: sampler;
@group(0) @binding(23) var<storage, read> cloud_optical_states: array<CloudOpticalState>;
@group(0) @binding(24) var<storage, read> cloud_optical_owners: array<CloudOpticalOwner>;

fn cloud_optical_state(row: f32) -> CloudOpticalState {
    let last = max(1u, arrayLength(&cloud_optical_states)) - 1u;
    return cloud_optical_states[min(last, u32(max(0.0, round(row))))];
}

fn cloud_optical_phase_row(row: f32, cos_theta: f32) -> vec3<f32> {
    let dimensions = vec2<f32>(textureDimensions(cloud_optical_phase_lut, 0));
    let theta = acos(clamp(cos_theta, -1.0, 1.0));
    let uv = vec2<f32>(
        (0.5 + theta / 3.141592653589793 * (dimensions.x - 1.0)) /
            dimensions.x,
        (row + 0.5) / dimensions.y);
    return exp2(textureSampleLevel(
        cloud_optical_phase_lut,
        cloud_optical_phase_sampler,
        uv,
        0.0).rgb);
}

fn cloud_henyey_greenstein(cos_theta: f32, g: f32) -> f32 {
    let bounded_g = clamp(g, -0.985, 0.985);
    let denominator = max(
        1e-8,
        1.0 + bounded_g * bounded_g - 2.0 * bounded_g * cos_theta);
    return (1.0 - bounded_g * bounded_g) /
        (12.566370614359172 * pow(denominator, 1.5));
}

fn cloud_draine_phase(cos_theta: f32, g: f32, alpha: f32) -> f32 {
    let bounded_g = clamp(g, -0.985, 0.985);
    let bounded_alpha = max(0.0, alpha);
    let denominator = 12.566370614359172 *
        (3.0 + bounded_alpha * (1.0 + 2.0 * bounded_g * bounded_g)) *
        pow(max(1e-8,
            1.0 + bounded_g * bounded_g - 2.0 * bounded_g * cos_theta), 1.5);
    return 3.0 * (1.0 - bounded_g * bounded_g) *
        (1.0 + bounded_alpha * cos_theta * cos_theta) / denominator;
}

fn cloud_hg_draine_phase(state: CloudOpticalState, cos_theta: f32) -> f32 {
    let draine_weight = clamp(state.analytic_forward.w, 0.0, 1.0);
    let backward_weight = clamp(
        state.analytic_backward.y,
        0.0,
        1.0 - draine_weight);
    let forward_weight = 1.0 - draine_weight - backward_weight;
    return forward_weight * cloud_henyey_greenstein(
            cos_theta, state.analytic_forward.x) +
        draine_weight * cloud_draine_phase(
            cos_theta,
            state.analytic_forward.y,
            state.analytic_forward.z) +
        backward_weight * cloud_henyey_greenstein(
            cos_theta, state.analytic_backward.x);
}

fn cloud_draine_mean_cosine(g: f32, alpha: f32) -> f32 {
    let bounded_g = clamp(g, -0.985, 0.985);
    let bounded_alpha = max(0.0, alpha);
    // E_HG[mu] = g, E_HG[mu^2] = (1 + 2g^2) / 3 and
    // E_HG[mu^3] = (3g + 2g^3) / 5. Applying the Draine factor
    // (1 + alpha*mu^2) therefore has this closed-form first moment.
    return (
        bounded_g + bounded_alpha * bounded_g *
            (3.0 + 2.0 * bounded_g * bounded_g) / 5.0
    ) / max(1e-8,
        1.0 + bounded_alpha *
            (1.0 + 2.0 * bounded_g * bounded_g) / 3.0);
}

fn cloud_hg_draine_mean_cosine(state: CloudOpticalState) -> f32 {
    let draine_weight = clamp(state.analytic_forward.w, 0.0, 1.0);
    let backward_weight = clamp(
        state.analytic_backward.y,
        0.0,
        1.0 - draine_weight);
    let forward_weight = 1.0 - draine_weight - backward_weight;
    return forward_weight * clamp(state.analytic_forward.x, -0.985, 0.985) +
        draine_weight * cloud_draine_mean_cosine(
            state.analytic_forward.y, state.analytic_forward.z) +
        backward_weight * clamp(state.analytic_backward.x, -0.985, 0.985);
}

fn cloud_diffraction_concentration(radius_microns: f32) -> f32 {
    let sigma = clamp(
        0.61 * 0.55 / max(1.0, radius_microns),
        0.0013962634,
        0.0523598776);
    return 1.0 / max(1e-8, sigma * sigma);
}

// Energy-normalized spherical-Gaussian diffraction core. It restores the
// sub-degree forward lobe which a 512-sample angular texture cannot fully
// resolve for the largest ice particles.
fn cloud_diffraction_phase(cos_theta: f32, radius_microns: f32) -> f32 {
    let concentration = cloud_diffraction_concentration(radius_microns);
    let normalization = concentration /
        (6.283185307179586 * max(1e-8, 1.0 - exp(-2.0 * concentration)));
    return normalization * exp(concentration * (cos_theta - 1.0));
}

fn cloud_diffraction_mean_cosine(radius_microns: f32) -> f32 {
    let concentration = cloud_diffraction_concentration(radius_microns);
    // All supported particles have k >= 364. The exact Langevin function
    // coth(k)-1/k is indistinguishable from this overflow-safe form there.
    return 1.0 - 1.0 / concentration;
}

fn cloud_diffraction_energy_weight(state: CloudOpticalState) -> vec3<f32> {
    let broad_mean = cloud_hg_draine_mean_cosine(state);
    let diffraction_mean = cloud_diffraction_mean_cosine(state.particle.y);
    return clamp(
        (state.asymmetry_and_schema.rgb - vec3<f32>(broad_mean)) /
            max(vec3<f32>(1e-6), vec3<f32>(diffraction_mean - broad_mean)),
        vec3<f32>(0.0),
        vec3<f32>(1.0));
}

// Replace only phase energy narrower than half of the first LUT angular cell.
// The LUT and spherical Gaussian both integrate to one over 4pi, so this is a
// redistribution of measured energy rather than an additive silver-lining
// boost. First-moment closure determines the diffraction component; its exact
// spherical-Gaussian CDF determines how much the finite LUT cannot resolve.
fn cloud_analytic_forward_fallback(
    state: CloudOpticalState,
    cos_theta: f32,
    lut_phase: vec3<f32>,
) -> vec3<f32> {
    let dimensions = vec2<f32>(textureDimensions(cloud_optical_phase_lut, 0));
    let half_first_cell = 0.5 * 3.141592653589793 /
        max(1.0, dimensions.x - 1.0);
    let concentration = cloud_diffraction_concentration(state.particle.y);
    let unresolved_cdf = (
        1.0 - exp(concentration * (cos(half_first_cell) - 1.0))
    ) / max(1e-8, 1.0 - exp(-2.0 * concentration));
    let unresolved_weight = cloud_diffraction_energy_weight(state) *
        clamp(unresolved_cdf, 0.0, 1.0);
    let diffraction = vec3<f32>(cloud_diffraction_phase(
        cos_theta, state.particle.y));
    return lut_phase * (vec3<f32>(1.0) - unresolved_weight) +
        diffraction * unresolved_weight;
}

fn cloud_resolved_phase(
    state: CloudOpticalState,
    cos_theta: f32,
) -> vec3<f32> {
    let lut_phase = cloud_optical_phase_row(
        state.extinction_and_row.w, cos_theta);
    return cloud_analytic_forward_fallback(state, cos_theta, lut_phase);
}

/**
 * Spectral mass extinction without an angular phase lookup. Shadow and
 * transmittance marches need the same local liquid/ice mixture as view
 * scattering, but should not pay for a phase texture sample they discard.
 */
fn cloud_local_optical_moments(
    owner_index: u32,
    atlas_local_ice_fraction: f32,
) -> CloudOpticalMoments {
    let owner = cloud_optical_owners[min(owner_index, 35u)];
    let liquid_low = cloud_optical_state(owner.radius_rows.x);
    let liquid_high = cloud_optical_state(owner.radius_rows.y);
    let ice_low = cloud_optical_state(owner.radius_rows.z);
    let ice_high = cloud_optical_state(owner.radius_rows.w);
    let liquid_amount = clamp(owner.radius_interpolation.x, 0.0, 1.0);
    let ice_amount = clamp(owner.radius_interpolation.y, 0.0, 1.0);
    let ice_fraction = clamp(atlas_local_ice_fraction, 0.0, 1.0);
    let material_weights = vec4<f32>(
        (1.0 - ice_fraction) * (1.0 - liquid_amount),
        (1.0 - ice_fraction) * liquid_amount,
        ice_fraction * (1.0 - ice_amount),
        ice_fraction * ice_amount);
    let extinction_0 = liquid_low.extinction_and_row.rgb * material_weights.x;
    let extinction_1 = liquid_high.extinction_and_row.rgb * material_weights.y;
    let extinction_2 = ice_low.extinction_and_row.rgb * material_weights.z;
    let extinction_3 = ice_high.extinction_and_row.rgb * material_weights.w;
    let scattering_0 = extinction_0 * liquid_low.albedo_and_mean_g.rgb;
    let scattering_1 = extinction_1 * liquid_high.albedo_and_mean_g.rgb;
    let scattering_2 = extinction_2 * ice_low.albedo_and_mean_g.rgb;
    let scattering_3 = extinction_3 * ice_high.albedo_and_mean_g.rgb;
    var result: CloudOpticalMoments;
    result.mass_extinction =
        extinction_0 + extinction_1 + extinction_2 + extinction_3;
    result.scattering =
        scattering_0 + scattering_1 + scattering_2 + scattering_3;
    result.scattering_asymmetry =
        scattering_0 * liquid_low.asymmetry_and_schema.rgb +
        scattering_1 * liquid_high.asymmetry_and_schema.rgb +
        scattering_2 * ice_low.asymmetry_and_schema.rgb +
        scattering_3 * ice_high.asymmetry_and_schema.rgb;
    return result;
}

fn cloud_local_mass_extinction(
    owner_index: u32,
    atlas_local_ice_fraction: f32,
) -> vec3<f32> {
    return cloud_local_optical_moments(
        owner_index, atlas_local_ice_fraction).mass_extinction;
}

fn cloud_local_optics(
    owner_index: u32,
    atlas_local_ice_fraction: f32,
    cos_theta: f32,
) -> CloudLocalOptics {
    let owner = cloud_optical_owners[min(owner_index, 35u)];
    let liquid_low = cloud_optical_state(owner.radius_rows.x);
    let liquid_high = cloud_optical_state(owner.radius_rows.y);
    let ice_low = cloud_optical_state(owner.radius_rows.z);
    let ice_high = cloud_optical_state(owner.radius_rows.w);
    let liquid_amount = clamp(owner.radius_interpolation.x, 0.0, 1.0);
    let ice_amount = clamp(owner.radius_interpolation.y, 0.0, 1.0);
    let ice_fraction = clamp(atlas_local_ice_fraction, 0.0, 1.0);
    let material_weights = vec4<f32>(
        (1.0 - ice_fraction) * (1.0 - liquid_amount),
        (1.0 - ice_fraction) * liquid_amount,
        ice_fraction * (1.0 - ice_amount),
        ice_fraction * ice_amount);

    let extinction_0 = liquid_low.extinction_and_row.rgb * material_weights.x;
    let extinction_1 = liquid_high.extinction_and_row.rgb * material_weights.y;
    let extinction_2 = ice_low.extinction_and_row.rgb * material_weights.z;
    let extinction_3 = ice_high.extinction_and_row.rgb * material_weights.w;
    let scattering_0 = extinction_0 * liquid_low.albedo_and_mean_g.rgb;
    let scattering_1 = extinction_1 * liquid_high.albedo_and_mean_g.rgb;
    let scattering_2 = extinction_2 * ice_low.albedo_and_mean_g.rgb;
    let scattering_3 = extinction_3 * ice_high.albedo_and_mean_g.rgb;
    let mass_extinction = extinction_0 + extinction_1 + extinction_2 + extinction_3;
    let scattering = scattering_0 + scattering_1 + scattering_2 + scattering_3;
    let safe_scattering = max(scattering, vec3<f32>(1e-9));
    let phase = (
        scattering_0 * cloud_resolved_phase(liquid_low, cos_theta) +
        scattering_1 * cloud_resolved_phase(liquid_high, cos_theta) +
        scattering_2 * cloud_resolved_phase(ice_low, cos_theta) +
        scattering_3 * cloud_resolved_phase(ice_high, cos_theta)
    ) / safe_scattering;
    let asymmetry = (
        scattering_0 * liquid_low.asymmetry_and_schema.rgb +
        scattering_1 * liquid_high.asymmetry_and_schema.rgb +
        scattering_2 * ice_low.asymmetry_and_schema.rgb +
        scattering_3 * ice_high.asymmetry_and_schema.rgb
    ) / safe_scattering;
    var result: CloudLocalOptics;
    result.mass_extinction = mass_extinction;
    result.single_scattering_albedo = scattering /
        max(mass_extinction, vec3<f32>(1e-9));
    result.asymmetry = asymmetry;
    result.phase = phase;
    result.unresolved_ice_porosity = clamp(
        owner.ice_regime.w * ice_fraction, 0.0, 0.85);
    // Non-atlas callers (legacy procedural layers and the finite-volume
    // truncation fallback) have no resolved high-ice residual to report. A
    // species-level porosity therefore retains its full owner correlation;
    // atlas-backed callers overwrite these signals with local texture moments
    // before transport evaluates the Beer expectation.
    result.unresolved_ice_variance = select(0.0, 1.0,
        result.unresolved_ice_porosity > 1e-5);
    result.unresolved_ice_correlation = select(0.0, 1.0,
        result.unresolved_ice_porosity > 1e-5);
    result.high_ice_second_moment = 0.0;
    result.high_ice_coverage = 0.0;
    result.high_ice_residual_variance = 0.0;
    result.high_ice_mean_density = 0.0;
    result.high_ice_correlation_length = 0.0;
    result.high_ice_lateral_filter_radius = 0.0;
    result.high_ice_depth_filter_radius = 0.0;
    return result;
}

// Convert a nonnegative arithmetic-mean optical depth into the Beer-equivalent
// depth of a bounded two-point distribution. The sparse member has a fixed
// nonnegative scale and the complementary dense member is solved from the
// mean constraint, so condensate mass/support are never altered. Multiplying
// porosity by local variance and along-ray correlation makes the homogeneous
// and fully filtered limits exact while preserving Jensen's bound.
fn cloud_unresolved_footprint_optical_depth_signal(
    resolved_optical_depth_rgb: vec3<f32>,
    unresolved_ice_porosity: f32,
    local_variance: f32,
    local_correlation: f32,
) -> vec3<f32> {
    let tau = max(vec3<f32>(0.0), resolved_optical_depth_rgb);
    let porosity = clamp(unresolved_ice_porosity, 0.0, 0.85) *
        clamp(local_variance, 0.0, 1.0) *
        clamp(local_correlation, 0.0, 1.0);
    if (porosity <= 1e-5 || max(max(tau.r, tau.g), tau.b) <= 1e-7) {
        return tau;
    }
    // Sparse channels still contain ice; they are not an alpha cutout. The
    // dense scale is finite for porosity <= 0.85 and enforces E[tau_i] = tau.
    let sparse_tau_scale = 0.14;
    let dense_tau_scale = (1.0 - porosity * sparse_tau_scale) /
        max(1e-4, 1.0 - porosity);
    let mean_transmittance =
        porosity * exp(-tau * sparse_tau_scale) +
        (1.0 - porosity) * exp(-tau * dense_tau_scale);
    return -log(clamp(mean_transmittance,
        vec3<f32>(exp(-24.0)), vec3<f32>(1.0)));
}

// Moment-matched expected Beer closure for the high-ice sidecar. The raw
// sidecar channels describe an unconditional density distribution: mu is its
// arithmetic mean, m2 is E[rho^2], and coverage is the probability of authored
// support. A finite path/footprint averages N_eff correlated samples before
// the bounded occupied two-point law is formed, so support is introduced once
// and the homogeneous/empty limits remain exact.
fn cloud_high_ice_expected_beer_tau(
    resolved_optical_depth_rgb: vec3<f32>,
    mean_density: f32,
    raw_second_moment: f32,
    support_coverage: f32,
    residual_variance: f32,
    segment_length_km: f32,
    correlation_length_km: f32,
    lateral_filter_radius_km: f32,
    depth_filter_radius_km: f32,
) -> vec3<f32> {
    let tau = max(vec3<f32>(0.0), resolved_optical_depth_rgb);
    let mu = clamp(mean_density, 0.0, 1.0);
    let m2 = clamp(raw_second_moment, mu * mu, mu);
    var variance = max(0.0, m2 - mu * mu) +
        clamp(residual_variance, 0.0, 0.25);
    // An empty authored field has no extinction event, even if a caller
    // supplied a stale resolved tau. Preserve the ordinary resolved tau only
    // for the non-empty, numerically tiny segment case.
    if (mu <= 1e-6) { return vec3<f32>(0.0); }
    if (max(max(tau.r, tau.g), tau.b) <= 1e-7) { return tau; }
    let length_km = max(0.0, segment_length_km);
    let correlation_length = max(1e-4,
        correlation_length_km);
    let axial = select(
        1.0,
        clamp(2.0 * correlation_length / max(1e-8, length_km) -
            2.0 * correlation_length * correlation_length /
                max(1e-8, length_km * length_km) *
                (1.0 - exp(-length_km / correlation_length)), 0.0, 1.0),
        length_km > 1e-7);
    let lateral = 1.0 / (1.0 +
        (max(0.0, lateral_filter_radius_km) /
            max(1e-4, correlation_length)) *
        (max(0.0, lateral_filter_radius_km) /
            max(1e-4, correlation_length)));
    let footprint_factor = clamp(axial * lateral, 0.0, 1.0);
    let n_eff = max(1.0, 1.0 / max(1e-4, footprint_factor));
    variance = variance / n_eff;
    var coverage = clamp(support_coverage, 0.0, 1.0);
    coverage = max(coverage, mu);
    let effective_coverage = clamp(
        1.0 - pow(max(0.0, 1.0 - coverage), n_eff), 0.0, 1.0);
    let minimum_variance = mu * mu *
        (1.0 / max(1e-5, effective_coverage) - 1.0);
    variance = clamp(max(variance, minimum_variance),
        0.0, mu * (1.0 - mu));
    let occupied_mean = min(1.0,
        mu / max(1e-5, effective_coverage));
    let occupied_second = clamp(
        (mu * mu + variance) / max(1e-5, effective_coverage),
        occupied_mean * occupied_mean, occupied_mean);
    let occupied_variance = clamp(
        occupied_second - occupied_mean * occupied_mean,
        0.0, occupied_mean * (1.0 - occupied_mean));
    if (occupied_variance <= 1e-7 || occupied_mean >= 1.0 - 1e-6) {
        let unit_tau = tau / max(vec3<f32>(1e-5), vec3<f32>(mu));
        return -log(clamp(
            (1.0 - effective_coverage) + effective_coverage *
                exp(-unit_tau * occupied_mean),
            vec3<f32>(exp(-24.0)), vec3<f32>(1.0)));
    }
    let low = max(0.0, occupied_mean - sqrt(
        occupied_variance * (1.0 - occupied_mean) /
            max(1e-5, occupied_mean)));
    let high = min(1.0, occupied_mean + sqrt(
        occupied_variance * occupied_mean /
            max(1e-5, 1.0 - occupied_mean)));
    let high_probability = clamp(1.0 - occupied_mean, 0.0, 1.0);
    let unit_tau = tau / max(vec3<f32>(1e-5), vec3<f32>(mu));
    let expected_transmittance =
        (1.0 - effective_coverage) + effective_coverage * (
            (1.0 - high_probability) * exp(-unit_tau * low) +
            high_probability * exp(-unit_tau * high));
    return -log(clamp(expected_transmittance,
        vec3<f32>(exp(-24.0)), vec3<f32>(1.0)));
}

// A renderer footprint through sparse ice fibres is not a homogeneous slab.
// Reconstruct a bounded two-point optical-depth distribution whose arithmetic
// mean is exactly the resolved tau. The returned value is -log(E[exp(-tau)]),
// so Jensen's inequality supplies physically valid partial transmittance while
// the first derivative at tau=0 preserves resolved extinction. This operator
// is used for unresolved camera and local escape/source paths. The shared
// directional shadow field obtains the same expectation by averaging its four
// individually reconstructed footprint rays before converting visibility.
fn cloud_unresolved_footprint_optical_depth(
    local: CloudLocalOptics,
    resolved_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    if (local.high_ice_coverage > 1e-5 ||
        local.high_ice_second_moment > 1e-5) {
        return cloud_high_ice_expected_beer_tau(
            resolved_optical_depth_rgb,
            local.high_ice_mean_density,
            local.high_ice_second_moment,
            local.high_ice_coverage,
            local.high_ice_residual_variance,
            max(1e-4, local.high_ice_depth_filter_radius /
                max(1e-5, CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR)),
            local.high_ice_correlation_length,
            local.high_ice_lateral_filter_radius,
            local.high_ice_depth_filter_radius);
    }
    return cloud_unresolved_footprint_optical_depth_signal(
        resolved_optical_depth_rgb,
        local.unresolved_ice_porosity,
        local.unresolved_ice_variance,
        local.unresolved_ice_correlation);
}

fn cloud_local_source_optical_depth(
    upper_optical_depth_rgb: vec3<f32>,
    lower_optical_depth_rgb: vec3<f32>,
    source_vertical_cosine: f32,
) -> vec3<f32> {
    // A nearly horizontal source sees a symmetric local estimate; away from
    // the horizon it continuously approaches the physically corresponding
    // upper or lower finite-support path.
    let upper_weight = smoothstep(-0.12, 0.12, source_vertical_cosine);
    return mix(
        max(vec3<f32>(0.0), lower_optical_depth_rgb),
        max(vec3<f32>(0.0), upper_optical_depth_rgb),
        upper_weight);
}

fn cloud_camera_footprint_extinction(
    local: CloudLocalOptics,
    resolved_extinction_rgb_per_km: vec3<f32>,
    resolved_segment_optical_depth_rgb: vec3<f32>,
    segment_length_km: f32,
) -> vec3<f32> {
    let resolved_extinction = max(
        vec3<f32>(0.0), resolved_extinction_rgb_per_km);
    let segment_length = max(0.0, segment_length_km);
    if ((local.unresolved_ice_porosity <= 1e-5 &&
        local.high_ice_coverage <= 1e-5 &&
        local.high_ice_second_moment <= 1e-5) ||
        segment_length <= 1e-7) {
        return resolved_extinction;
    }
    let resolved_tau = max(
        vec3<f32>(0.0), resolved_segment_optical_depth_rgb);
    // The camera packet owns a current physical subsegment. Apply the
    // unresolved two-point Beer closure to sigma_resolved * ds, then convert
    // the Beer-equivalent segment tau back to a coefficient for the affine
    // transport operator. Diffuse upper/lower SDF depths are intentionally
    // absent: they describe local escape/source paths, not this camera event.
    var effective_tau = cloud_unresolved_footprint_optical_depth(
        local, resolved_tau);
    if (local.high_ice_coverage > 1e-5 ||
        local.high_ice_second_moment > 1e-5) {
        effective_tau = cloud_high_ice_expected_beer_tau(
            resolved_tau,
            local.high_ice_mean_density,
            local.high_ice_second_moment,
            local.high_ice_coverage,
            local.high_ice_residual_variance,
            segment_length,
            local.high_ice_correlation_length,
            local.high_ice_lateral_filter_radius,
            local.high_ice_depth_filter_radius);
    }
    let scale = select(
        vec3<f32>(1.0),
        effective_tau / max(vec3<f32>(1e-6), resolved_tau),
        resolved_tau > vec3<f32>(1e-6));
    return resolved_extinction * clamp(scale,
        vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_local_optics_default_phase(
    owner_index: u32,
    cos_theta: f32,
) -> CloudLocalOptics {
    let owner = cloud_optical_owners[min(owner_index, 35u)];
    return cloud_local_optics(owner_index, owner.ice_regime.z, cos_theta);
}

// Diffusion is an optically thick closure.  Evaluate its validity in reduced
// transport depth, tau_tr = tau * (1 - omega*g), so a thin ice veil with high
// forward asymmetry cannot be replaced by an isotropic pale light-volume
// solution merely because its brick is resident.  This only selects between
// two passive estimators; it creates no radiance or extinction.
fn cloud_p1_diffusion_validity(
    local: CloudLocalOptics,
    local_extinction_optical_depth_rgb: vec3<f32>,
) -> f32 {
    let effective_optical_depth_rgb =
        cloud_unresolved_footprint_optical_depth(
            local, local_extinction_optical_depth_rgb);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let asymmetry = clamp(local.asymmetry,
        vec3<f32>(-0.985), vec3<f32>(0.985));
    let transport_depth = max(vec3<f32>(0.0),
        effective_optical_depth_rgb) *
        max(vec3<f32>(0.0), vec3<f32>(1.0) - albedo * asymmetry);
    let photopic_transport_depth = dot(
        transport_depth, vec3<f32>(0.2126, 0.7152, 0.0722));
    let base_validity = smoothstep(
        CLOUD_P1_TRANSPORT_TAU_LOWER,
        CLOUD_P1_TRANSPORT_TAU_UPPER,
        photopic_transport_depth);
    // Heterogeneous, correlated thin ice keeps its resolved anisotropic
    // source structure until a genuinely thick transport depth is reached.
    // The suppression is continuous and vanishes for homogeneous cores or
    // for a footprint whose correlation was averaged away.
    let heterogeneity = clamp(
        local.unresolved_ice_variance * local.unresolved_ice_correlation,
        0.0, 1.0);
    let heterogeneous_fade = smoothstep(0.12, 0.60, heterogeneity);
    let thick_fade = smoothstep(
        CLOUD_P1_TRANSPORT_TAU_LOWER * 1.2,
        CLOUD_P1_TRANSPORT_TAU_UPPER * 1.35,
        photopic_transport_depth);
    return base_validity * mix(1.0, thick_fade, heterogeneous_fade);
}

// The n-fold convolution of a normalized HG lobe has first moment g^n.
// This remains normalized per steradian and never increases scattering energy.
fn cloud_multiple_scattering_input(
    local: CloudLocalOptics,
    cos_theta: f32,
    scattering_order: u32,
) -> CloudMultipleScatteringInput {
    let order = f32(scattering_order + 1u);
    let order_g = sign(local.asymmetry) * pow(abs(local.asymmetry), vec3<f32>(order));
    var result: CloudMultipleScatteringInput;
    result.energy = pow(
        clamp(local.single_scattering_albedo, vec3<f32>(0.0), vec3<f32>(1.0)),
        vec3<f32>(order));
    result.asymmetry = order_g;
    result.phase = vec3<f32>(
        cloud_henyey_greenstein(cos_theta, order_g.r),
        cloud_henyey_greenstein(cos_theta, order_g.g),
        cloud_henyey_greenstein(cos_theta, order_g.b));
    return result;
}

fn cloud_first_order_scattering_budget(
    local: CloudLocalOptics,
    source_optical_depth: f32,
) -> vec3<f32> {
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    return albedo * exp(-max(0.0, source_optical_depth));
}

// Scene-linear source assembly for one resolved collimated emitter. Incident
// irradiance has already crossed the atmosphere; source_visibility contains
// cloud Beer transport only. The normalized phase remains per steradian, so
// the result is radiance at an extinction event. No ambient or higher-order
// energy belongs in this term.
fn cloud_direct_single_scattering_radiance(
    local: CloudLocalOptics,
    atmosphere_transported_irradiance: vec3<f32>,
    source_visibility: vec3<f32>,
) -> vec3<f32> {
    return max(vec3<f32>(0.0), atmosphere_transported_irradiance) *
        clamp(source_visibility, vec3<f32>(0.0), vec3<f32>(1.0)) *
        clamp(local.single_scattering_albedo,
            vec3<f32>(0.0), vec3<f32>(1.0)) *
        max(vec3<f32>(0.0), local.phase);
}

// A P1/light-volume sample is already the scene's propagated incident
// radiance: its boundary conditions contain sky and ground irradiance, and its
// volume source contains energy removed from the direct Sun/Moon beams. The
// camera extinction event applies local albedo exactly once. Adding another
// analytic ambient or directional multiple-scattering term here would count
// the same path family twice.
fn cloud_propagated_diffuse_scattering_radiance(
    local: CloudLocalOptics,
    propagated_incident_radiance: vec3<f32>,
) -> vec3<f32> {
    return max(vec3<f32>(0.0), propagated_incident_radiance) *
        clamp(local.single_scattering_albedo,
            vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_higher_order_scattering_budget(
    local: CloudLocalOptics,
    source_optical_depth: f32,
) -> vec3<f32> {
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let direct_transfer = exp(-max(0.0, source_optical_depth));
    return albedo * albedo * (1.0 - direct_transfer);
}

// Passive Nubis-style path-space closure. A thin source path remains
// first-order and retains the resolved Mie/HG+Draine edge response. Energy
// removed from that path supplies a bounded sequence of broader g^n lobes,
// producing an interior glow without a powder tint or additive rim. Finite
// relaxed Beer factors make very deep cores dark again. Because geometric
// order weights sum to at most one, the phase integral of first plus all
// higher orders is <= single-scattering albedo in every RGB channel.
fn cloud_passive_directional_multiple_scattering(
    local: CloudLocalOptics,
    source_optical_depth: f32,
    cos_theta: f32,
) -> vec3<f32> {
    let optical_depth = max(0.0, source_optical_depth);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let available = cloud_higher_order_scattering_budget(
        local, optical_depth);
    var transport = vec3<f32>(0.0);
    var order_weight = 1.0 - CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
    var extinction_scale = CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
    var order_survival = vec3<f32>(1.0);
    for (var order_index = 0u;
        order_index < CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT;
        order_index += 1u) {
        let order = cloud_multiple_scattering_input(
            local, cos_theta, order_index + 1u);
        transport += order.phase * order_survival * order_weight *
            exp(-optical_depth * extinction_scale);
        order_weight *= CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
        extinction_scale *=
            CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        order_survival *= albedo;
    }
    return max(vec3<f32>(0.0), available * transport);
}

// Receiver-local directional higher orders. The former path used the complete
// sample-to-source shadow tau as though every collision occurred in the local
// cloud. A remote cloud could therefore manufacture pale fill here. Separate
// local finite-support tau from external RGB source attenuation: local tau
// controls collision/escape probability, while the shared DSM only attenuates
// incident energy not owned by this local closure. Every term stays inside the
// same omega^2 * (1-exp(-tau_local)) passive budget.
fn cloud_passive_local_directional_multiple_scattering(
    local: CloudLocalOptics,
    complete_source_visibility_rgb: vec3<f32>,
    local_source_optical_depth_rgb: vec3<f32>,
    cos_theta: f32,
) -> vec3<f32> {
    let resolved_local_tau = max(
        vec3<f32>(0.0), local_source_optical_depth_rgb);
    let local_tau = cloud_unresolved_footprint_optical_depth(
        local, resolved_local_tau);
    let complete_tau = -log(clamp(
        complete_source_visibility_rgb,
        vec3<f32>(exp(-24.0)), vec3<f32>(1.0)));
    // complete_tau is already a Beer-equivalent depth from the resolved
    // directional footprint. Remove the receiver-local Beer-equivalent depth,
    // not its homogeneous mean; subtracting the larger resolved mean erased
    // legitimate remote shadowing whenever local sparse-ice porosity was
    // active.
    let external_visibility = exp(-max(vec3<f32>(0.0),
        complete_tau - local_tau));
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let complete_visibility = clamp(
        complete_source_visibility_rgb,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let locally_removed_energy =
        (vec3<f32>(1.0) - exp(-local_tau)) * external_visibility;
    // Local SDF depth and the complete DSM use different reconstruction
    // footprints. When the fine local estimate is deeper than the complete
    // Beer-equivalent depth, clamping external visibility to clear must not
    // let the local closure scatter more source energy than the complete beam
    // lost. A valid external*local decomposition is unchanged because its
    // local removal is already a subset of complete removal.
    let available = albedo * albedo * min(
        vec3<f32>(1.0) - complete_visibility,
        locally_removed_energy);
    var transport = vec3<f32>(0.0);
    var order_weight = 1.0 - CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
    var extinction_scale = CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
    var order_survival = vec3<f32>(1.0);
    for (var order_index = 0u;
        order_index < CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT;
        order_index += 1u) {
        let order = cloud_multiple_scattering_input(
            local, cos_theta, order_index + 1u);
        transport += order.phase * order_survival * order_weight *
            exp(-local_tau * extinction_scale);
        order_weight *= CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
        extinction_scale *=
            CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        order_survival *= albedo;
    }
    return max(vec3<f32>(0.0), available * transport);
}

// The hemispheric incident field has already integrated phase over angle.
// Apply the identical energy partition without a directional phase lookup.
fn cloud_passive_diffuse_scattering_transport(
    local: CloudLocalOptics,
    source_optical_depth: f32,
) -> vec3<f32> {
    let optical_depth = max(0.0, source_optical_depth);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let first_order = cloud_first_order_scattering_budget(
        local, optical_depth);
    let available = cloud_higher_order_scattering_budget(
        local, optical_depth);
    var transport = vec3<f32>(0.0);
    var order_weight = 1.0 - CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
    var extinction_scale = CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
    var order_survival = vec3<f32>(1.0);
    for (var order_index = 0u;
        order_index < CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT;
        order_index += 1u) {
        transport += order_survival * order_weight *
            exp(-optical_depth * extinction_scale);
        order_weight *= CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
        extinction_scale *=
            CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        order_survival *= albedo;
    }
    return min(albedo, max(vec3<f32>(0.0),
        first_order + available * transport));
}

fn cloud_passive_high_order_diffuse_transport(
    local: CloudLocalOptics,
    source_optical_depth: f32,
) -> vec3<f32> {
    return max(vec3<f32>(0.0),
        cloud_passive_diffuse_scattering_transport(
            local, source_optical_depth) -
        cloud_first_order_scattering_budget(local, source_optical_depth));
}

// Spectral counterpart used by the analytic diffuse-visibility closure. Cloud
// mass extinction is close to neutral but not exactly so, and mixed-phase
// owners change it continuously with altitude. Keeping tau in RGB avoids
// converting that physical variation back into a photopic gray shelf.
fn cloud_passive_diffuse_scattering_transport_rgb(
    local: CloudLocalOptics,
    source_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let optical_depth = cloud_unresolved_footprint_optical_depth(
        local, source_optical_depth_rgb);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let direct_transfer = exp(-optical_depth);
    let first_order = albedo * direct_transfer;
    let available = albedo * albedo * (vec3<f32>(1.0) - direct_transfer);
    var transport = vec3<f32>(0.0);
    var order_weight = 1.0 - CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
    var extinction_scale = CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
    var order_survival = vec3<f32>(1.0);
    for (var order_index = 0u;
        order_index < CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT;
        order_index += 1u) {
        transport += order_survival * order_weight *
            exp(-optical_depth * extinction_scale);
        order_weight *= CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
        extinction_scale *=
            CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        order_survival *= albedo;
    }
    return min(albedo, max(vec3<f32>(0.0),
        first_order + available * transport));
}

fn cloud_passive_high_order_diffuse_transport_rgb(
    local: CloudLocalOptics,
    source_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let resolved_optical_depth =
        max(vec3<f32>(0.0), source_optical_depth_rgb);
    let effective_optical_depth = cloud_unresolved_footprint_optical_depth(
        local, resolved_optical_depth);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    return max(vec3<f32>(0.0),
        cloud_passive_diffuse_scattering_transport_rgb(
            local, resolved_optical_depth) -
        albedo * exp(-effective_optical_depth));
}

// Diffuse irradiance reaches the receiver from a cosine-weighted hemisphere,
// not one vertical pencil ray. Integrate 2 * mu * Beer(tau / mu) over mu in
// [0, 1] and evaluate sparse-ice Beer expectation on each slant path.
fn cloud_hemispheric_diffuse_transmittance_rgb(
    local: CloudLocalOptics,
    source_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let tau = max(vec3<f32>(0.0), source_optical_depth_rgb);
    var transmittance = vec3<f32>(0.0);
    for (var node = 0u; node < 4u; node += 1u) {
        let mu = CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_NODES[node];
        let weight = CLOUD_HEMISPHERIC_DIFFUSE_GAUSS_WEIGHTS[node];
        let slant_tau = cloud_unresolved_footprint_optical_depth(
            local, tau / max(1e-4, mu));
        transmittance += 2.0 * weight * mu * exp(-slant_tau);
    }
    return clamp(transmittance, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn cloud_passive_hemispheric_diffuse_scattering_transport_rgb(
    local: CloudLocalOptics,
    source_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let resolved_optical_depth =
        max(vec3<f32>(0.0), source_optical_depth_rgb);
    let effective_optical_depth = cloud_unresolved_footprint_optical_depth(
        local, resolved_optical_depth);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    let direct_transfer = cloud_hemispheric_diffuse_transmittance_rgb(
        local, resolved_optical_depth);
    let first_order = albedo * direct_transfer;
    let available = albedo * albedo * (vec3<f32>(1.0) - direct_transfer);
    var transport = vec3<f32>(0.0);
    var order_weight = 1.0 - CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
    var extinction_scale = CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
    var order_survival = vec3<f32>(1.0);
    for (var order_index = 0u;
        order_index < CLOUD_MULTIPLE_SCATTERING_ORDER_COUNT;
        order_index += 1u) {
        transport += order_survival * order_weight *
            exp(-effective_optical_depth * extinction_scale);
        order_weight *= CLOUD_MULTIPLE_SCATTERING_CONTINUATION;
        extinction_scale *=
            CLOUD_MULTIPLE_SCATTERING_EXTINCTION_RELAXATION;
        order_survival *= albedo;
    }
    return min(albedo, max(vec3<f32>(0.0),
        first_order + available * transport));
}

fn cloud_passive_high_order_hemispheric_diffuse_transport_rgb(
    local: CloudLocalOptics,
    source_optical_depth_rgb: vec3<f32>,
) -> vec3<f32> {
    let direct_transfer = cloud_hemispheric_diffuse_transmittance_rgb(
        local, source_optical_depth_rgb);
    let albedo = clamp(local.single_scattering_albedo,
        vec3<f32>(0.0), vec3<f32>(1.0));
    return max(vec3<f32>(0.0),
        cloud_passive_hemispheric_diffuse_scattering_transport_rgb(
            local, source_optical_depth_rgb) -
        albedo * direct_transfer);
}
`;

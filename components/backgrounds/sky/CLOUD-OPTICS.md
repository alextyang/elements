# Cloud optical assets

The production optical contract is a compact, wavelength-integrated visible
single-scattering dataset. It separates particle optics from cloud morphology:
the macro volume supplies condensate mass density and local liquid/ice phase;
this asset supplies extinction, single-scattering albedo, and angular phase.

## Physical model and provenance

- Liquid rows are generated locally with an original Lorenz-Mie solver. Seven
  visible wavelengths are integrated through smooth positive RGB responses and
  a 5778 K daylight spectrum. Each effective radius uses a Hansen
  modified-gamma size distribution with effective variance 0.10. Polydispersity
  is important: it preserves the rainbow, glory, and diffraction peak without
  retaining implausible monodisperse ripple noise.
- Ice rows are original energy-normalized multi-lobe approximations for four
  randomized habits (`general`, `aggregate`, `plate`, and `column`), five
  effective radii, and three roughness levels. Habit, roughness, and radius
  behavior follows the qualitative constraints of the Yang et al. 2013 optical
  database, but no Yang, Baum, OPAC, or libRadtran numerical table is copied or
  redistributed.
- The analytic fallback is an energy-normalized forward HG + Draine + weak
  backward-HG mixture. A deterministic continuous refinement follows the
  coarse fit while retaining its first-moment penalty; production v1.1 lowers
  mean log2 RMS from 0.172 to 0.141 and worst-case error from 0.705 to 0.612.
  The texture remains authoritative for primary light; the stable analytic fit
  is intended for unresolved diffraction, importance sampling, and reduced-
  cost secondary/multiple-scattering lobes.

Primary references:

- P. Yang et al., [spectrally consistent ice-crystal scattering properties](https://doi.org/10.1175/JAS-D-12-039.1), 2013.
- J. Jendersie and E. d'Eon, [HG-Draine approximation to Mie scattering](https://doi.org/10.1145/3587421.3595409), 2023.
- [libRadtran documentation](https://www.libradtran.org/) for standard cloud bulk-optics conventions and supported ice habit/radius domains.
- S. Hillaire, [Physically Based Sky, Atmosphere & Cloud Rendering](https://www.ea.com/news/physically-based-sky-atmosphere-and-cloud-rendering), 2016.
- A. Schneider et al., [Nubis, Evolved: Real-Time Volumetric Clouds for Skies, Environments, and VFX](https://advances.realtimerendering.com/s2022/index.html), 2022.
- J. Fong, M. Wrenninge, C. Kulla, and R. Habel, [Production Volume Rendering](https://graphics.pixar.com/library/ProductionVolumeRendering/paper.pdf), 2017.

## Asset layout

`cloud-optics-phase-rgba16float-v1.bin` is a 512 × 67 `rgba16float`
texture. RGB stores `log2(phase per steradian)`, allowing one texture to retain
both the weak backscatter and the narrow silver-lining peak. The angle samples
include both endpoints:

```text
theta = index / (width - 1) * PI
u = (0.5 + acos(clamp(cosTheta, -1, 1)) / PI * (width - 1)) / width
v = (phaseRow + 0.5) / height
phaseRGB = exp2(textureSampleLevel(phaseLut, clampSampler, vec2(u,v), 0).rgb)
```

Here `cosTheta = 1` means zero-deflection forward scattering. If the renderer
stores a vector from the cloud sample toward the light, negate it to obtain the
incident propagation vector before taking the dot product with the outgoing
view direction.

`cloud-optics-parameters-f32-v1.bin` is a 32-float (128-byte) record per
row. The complete offsets are versioned in the manifest. The important groups
are mass extinction/SSA, RGB asymmetry, the HG-Draine-backward fit, and
detected rainbow/glory metadata.

The 67 states are:

- 7 liquid radii from 4–30 µm;
- 60 ice states: 4 habits × 3 roughnesses × 5 radii from 10–90 µm.

The total binary payload is 283 KiB. The JSON manifest includes provenance,
checksums, validation results, and human-readable row metadata.

## Runtime API

`loadCloudOptics()` fetches and SHA-256 verifies all assets.
`uploadCloudOptics(device, loaded)` returns:

- `phaseTexture`: `texture_2d<f32>`, `rgba16float`;
- `phaseSampler`: clamped linear sampler;
- `parameterBuffer`: read-only storage buffer with 128-byte state records.

`resolveCloudOpticsBlend(manifest, input)` remains useful for a homogeneous
preview or a CPU reference. Production uses
`createCloudOpticsOwnerRuntime(cloudRuntime, loadedOptics)`. It emits exactly
36 records in the same owner order as `CloudSystemRuntime`; an inactive record
is explicit and cannot alias owner zero. Each 64-byte record preserves both
liquid and ice radius brackets:

```text
 0  active, owner index, layer index, system index
 4  liquid low/high rows, ice low/high rows
 8  liquid/ice radius interpolation, liquid/ice effective radius
12  ice habit, roughness, default ice fraction, cloud-top temperature
```

`uploadCloudOpticsOwnerRuntime()` creates binding 24's fixed 2,304-byte storage
buffer. Re-upload only when the physical runtime signature changes; local
atlas phase evolves in the shader without rebuilding this buffer.

The weights are intentionally not frozen using the system-average phase. At
every density sample, `cloud_local_optics()` combines these four state rows
using the macro atlas's local B-channel ice fraction. Extinction is blended by
condensate mass; phase and asymmetry are blended by RGB scattering coefficient
(`mass fraction × extinction × SSA`). This is the only phase-function
normalization pass.

Atlas R is a dimensionless condensate distribution, not extinction. Each
formation manifest therefore records mean normalized density paths through
occupied vertical, crosswind, and downwind columns, plus the vertical 90th
percentile. Only the mean vertical path calibrates material extinction. If
`P_v` is that dimensionless path, `H` is physical layer depth in kilometres,
and the runtime stores `extinctionKm = tau_target / H`, then

```text
integral_vertical(D ds) = P_v H
kappa = tau_target / (P_v H) = extinctionKm / P_v   [km^-1]
tau(ray) = integral_ray(D kappa ds)
```

`kappa` is an owner-local scalar. Crosswind/downwind paths remain useful atlas
qualification diagnostics, but they must not renormalize a material when a
ray rotates. Oblique, grazing, Sun, Moon, and diffuse-probe paths acquire their
different optical depths solely by integrating different distances and
density structures. The scalar is multiplied by the photopic ratio between
the local RGB Mie/ice mass extinction and the same geometric-optics reference
used by the runtime LWP/IWP derivation.

Finite owners overlap with Beer/coverage union for morphology. Extinction is
still additive: the shader constructs an effective coefficient satisfying
`D_union * kappa_effective = sum(D_i * kappa_i)` exactly. Spectral extinction,
scattering, asymmetry, SDF inward depth, base altitude, and geometric depth are
extinction-weighted moments over every overlapping owner. The two strongest
identities remain only for packed P1 lookup. Measured angular LUT detail fades
continuously to the normalized all-owner HG moment whenever an omitted owner
has material weight, so a second/third-owner rank exchange cannot stamp a new
colour or brightness into the cloud.

## Production transport

Every view segment uses the analytic homogeneous-medium update
`absorbed = 1 - exp(-density * sigma_t * distance)`. Source illumination uses
the same all-owner extinction field. One continuous cumulative RGB
directional atlas owns cloud-only Sun/Moon visibility for every camera event;
atmosphere-to-source transfer remains separately owned by the physical
atmosphere solver. The camera therefore performs at most two atlas queries
(sixteen texel fetches only when both queries cross cascade blend bands) and
zero finite-owner source traces. The obsolete half-resolution residual-light
pass and its three-layer camera texture are not dispatched or sampled.

The nonresident hemispheric closure reuses the signed inward distance fetched
with the authoritative macro density. Extinction-weighted all-owner geometry
sets compact upper/lower path lengths; no cone ray, remote support, morphology
traversal, or additional texture lookup can switch on at a sample. Its strict
camera-event ceiling is zero texture fetches and zero owner evaluations. A
finite, radiometrically agreeing resident P1 field may replace only the same
higher-order component; nonfinite or mismatched P1 samples fall continuously
back to this analytic closure.

Source rays that begin inside a curved shell integrate from zero to the first
physical boundary rather than selecting a far-side sphere root. There is no
powder term, surface-exposure lift, family tint, or view-derived shadow
multiplier.

The optics WGSL exports a passive path-space higher-order closure. For source
optical depth `tau` and single-scattering albedo `omega`, the resolved first
order receives `omega exp(-tau)`. All higher orders together may use no more
than `omega² (1-exp(-tau))`; geometric continuation weights sum below one,
each order uses the normalized HG convolution `g^n`, and its source extinction
is progressively relaxed. Thus the 4π integral of first plus higher orders is
never greater than `omega`. Thin edges retain the resolved Mie/HG+Draine
response, finite interiors gain broad transported light, and very deep cores
darken again because every retained order still has nonzero extinction. This
captures the useful Nubis dark-edge/inner-transport behavior without powder,
an additive rim, an arbitrary brightness tint, or a final clamp hiding an
energy violation.

The same partition is available without a phase term for already-integrated
upper-sky and lower-ground irradiance. The exported integration hooks are:

```wgsl
cloud_passive_directional_multiple_scattering(local, sourceTau, cosTheta)
cloud_passive_diffuse_scattering_transport(local, verticalTau)
cloud_passive_high_order_diffuse_transport(local, verticalTau)
```

The active cloud marcher should call these in place of its local octave helper
bodies; camera-path Beer transport remains in the marcher and must not be
folded into the source closure.

Continuous sheet families use twelve-point Gauss-Legendre quadrature. Density,
owner, mixed phase, and scalar material extinction are evaluated at every node;
the analytic source integral is applied only after their true optical depth has
been accumulated. This avoids treating a multi-owner frontal deck as one
mean-material slab and removes the sampling bands that a coarse ordinary march
creates on grazing cirrostratus, altostratus, stratus, or nimbostratus rays.

`selectCloudIceOpticalRegime()` deterministically constrains habit and
roughness from species, cloud-top temperature, lifecycle, precipitation,
vertical motion, and turbulent dissipation. Smooth particles are rare and
reserved for stable nonprecipitating cirrostratus; storm, precipitating,
glaciating, and decaying systems use rough aggregates. Plate/column halo
families are no longer selected from temperature alone: ordinary altostratus,
altocumulus, low clouds, and mixed-phase convective cloud retain a randomized
general habit unless their WMO/lifecycle state supports aggregation. This
prevents a trace high-level ice fraction from embossing halo structure into an
opaque water or mixed-phase deck. The atlas B channel remains authoritative
for local liquid-versus-ice mass fraction, so liquid bases, mixed transition
zones, and glaciated tops stay within one physical owner.

Current production hookup bindings are exact and append after bindings 16–20
used by the macro atlas and physical cloud-system buffers:

```wgsl
@group(0) @binding(21) var cloud_optical_phase_lut: texture_2d<f32>;
@group(0) @binding(22) var cloud_optical_phase_sampler: sampler;
@group(0) @binding(23) var<storage, read> cloud_optical_states: array<CloudOpticalState>;
@group(0) @binding(24) var<storage, read> cloud_optical_owners: array<CloudOpticalOwner>;
```

The original declarations and helpers are exported by `cloud-optics-wgsl.ts`.
They include endpoint-correct log-phase sampling, scattering-weighted local
phase resolution, normalized HG/Draine and sub-degree diffraction fallbacks,
and normalized HG convolution inputs for higher scattering orders. The
sub-degree path derives a narrow spherical-Gaussian component from particle
radius and the analytic fit's first-moment deficit, then applies only the
fraction hidden inside half of the first LUT cell. It forms a convex mixture
with the normalized LUT (`(1-w) P_lut + w P_diffraction`), so the correction
redistributes energy instead of adding a hand-tuned forward glow. The
world-space optical-depth cache binds parameter and owner buffers 23–24 because
it evaluates extinction but no phase function. The view-ray transport binds
all four resources 21–24 because it also evaluates angular scattering.

Do not bind the texture with repeat addressing, generate mipmaps, or linearly
blend liquid/ice phase without scattering-coefficient weights. Apply
`sigma_t = condensateMassDensity * massExtinction` and
`sigma_s = sigma_t * SSA`. Atmospheric transmittance to the light and observer
must remain outside this particle-optics lookup.

## Validation and limitations

`npm run sky:cloud-optics` regenerates the assets and
`node --test scripts/test-cloud-optics.mjs
scripts/test-cloud-optics-runtime.mjs` verifies byte determinism,
checksums, nonnegativity, 4π normalization after half-float quantization,
passive energy conservation, realistic asymmetry/extinction domains, Mie's
geometric-optics limit, liquid rainbow/glory behavior, mixed-phase weighting,
WebGPU upload alignment, exact 36-owner ordering, all WMO genera, local-phase
endpoints, no double normalization, normalized unresolved-diffraction closure,
physical habit selection, scalar extinction calibration, residual shadow-path
partitioning, compact finite-support translation continuity, the exact-owner
query ceiling, and normalized multiple-scattering inputs.

These assets do not model polarization, oriented-crystal arcs, thermal infrared,
or a full electromagnetic ice solution. Smooth-habit 22°/46° features are
azimuthally averaged; oriented parhelia and pillars need a separate particle
orientation distribution. The phase LUT is authoritative where its angular
resolution is sufficient; the analytic forward lobe should preserve sub-degree
diffraction energy for a distant compact sun.

### High-ice source realization and closure

Non-analytic high-ice owners use the compact guarded `highIceSourceAtlas`,
`cloud-high-ice-sources-v1-rgba8-96.bin`, rather than a runtime moment-only
sidecar. It is one linearly filtered `rgba8unorm` 3-D texture at group 0,
binding 32. Eleven non-analytic high-ice volumes are packed as guarded 96³
tiles in a 196 × 196 × 294 atlas (one clear voxel on every tile face and in
unused tail tiles). The payload is 45,177,216 bytes (43.08 MiB); keeping it as
one sampled binding preserves the shared fragment pipeline's guaranteed
16-sampled-texture budget.

The four channels are a conditioned representation of the same authored fine
field, not independent masks:

- `R` is fine density in `[0,1]`, block-mass-conditioned so every 2³ child
  block sums exactly to the authoritative coarse macro-R mass;
- `G` is coarse support coverage, replicated across that 2³ child block;
- `B` is conditioned `E[rho²]` for the eight children, also replicated; and
- `A` is the conditioned fine support bit (`255` iff the conditioned `R` is
  positive).

Unsupported coarse parents and every guard voxel are zero in all channels.
The source transform is append-only metadata in `CloudMacroBinding`: the
owner record is seven `vec4`s (stride 7), with the source scale/offset pair
following the original atlas, majorant, and condensate-path records. A zero
availability sentinel leaves analytic and non-high-ice owners unable to
address a source tile.

Macro `R`, the packed SDF, and the conservative majorant remain authoritative
for culling, geometric support, and empty-space skipping. The fine source can
only resolve material inside that proven support; it cannot create an exterior
shadow caster or extend an owner boundary.

Camera and directional Sun/Moon coupling use the same owner-space footprint
`q`. For lateral and axial footprint radii `r_lateral`, `r_depth` and source
voxel sizes `Delta_lateral`, `Delta_axial`,

```text
q = max(2 r_lateral / Delta_lateral, 2 r_depth / Delta_axial)
```

`q <= 1` resolves the fine RGBA source. `q >= 2` returns to authoritative
macro-R plus the packed coarse moments (`G/B`), with a continuous log₂(q)
transition between those limits. The directional path derives the same
owner-local radii from its source-plane quadrature; no screen-space footprint
or independent stochastic field is introduced.

For source-backed Ci/Cc/Cs owners, the authored realization remains the sole
mass and finite-support carrier. Dense Spissatus additionally resolves a
bounded, stationary owner-space ice residual *inside* positive authored
support; camera and directional transport sample that same field. Its
capacity-scaled perturbation cannot grow support or erase a positive source
sample. The authored unconditional `B` moment is remapped to the resolved
local mean, while residual variance is carried separately and multiplied by
the authored `G` support probability. It is therefore counted exactly once.
Other source-backed high-cloud species continue to use the authored field
without this species-specific residual. The expected-Beer closure forms its
bounded occupied distribution from the resolved mean, `B` second moment, `G`
support, and the separate residual variance, then returns
`-log(E[exp(-kappa * integral rho ds)])`; empty, homogeneous, and thin-path
limits remain exact and transmittance stays in `[0,1]`. Analytic Ci fibratus
remains on its specialized tangent-relative subvoxel evaluator and does not
enter this generic source-backed path.

`highIceMomentSidecar` remains a checksummed offline provenance artifact. It
records the coarse coverage and moment reduction used to qualify/regenerate
the source atlas, but the runtime does not upload or sample it and it is not a
second Beer closure. Resident P1/light-volume storage continues to carry
arithmetic extinction and scattering only.

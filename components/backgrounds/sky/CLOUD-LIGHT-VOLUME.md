# World-space cloud light volume

This subsystem replaces path-local higher-order cloud-lighting heuristics with
spatial transport in the production WebGPU renderer. `cloud-light-volume.ts`
owns planning, packing, and CPU references; `cloud-light-volume-runtime.ts`
selects stable owner-space tiles; `cloud-light-volume-wgsl.ts` owns the bounded
compute and view ABI; and `webgpu-shaders.ts` injects the renderer's exact
morphology/material and atmosphere functions into that graph.

## Physical model

The direct and diffuse parts of radiance are separated. This is important for
cloud droplets, whose first scattering event is strongly forward-peaked and is
not well represented by low-order angular moments.

For each distinct active cloud owner and resolved source (Sun and Moon), a
separate source-aligned grid evaluates the exact owner density and optical material. A
front-to-back Beer scan stores spectral direct transmittance at every cell
centre. The scan has one thread per source column and a compile-time-bounded
loop through the 32-cell source depth. At every P1 right-hand-side voxel, the
solver multiplies the full-OBB Beer field of every distinct resident owner
exactly once, so one owner's diffuse field is shadowed by other cloud systems
as well as itself.

Source activity is construction metadata, never a radiance edit. The runtime
tests complete selected-brick bounding spheres against the curved-Earth
horizon, including a one-degree upper-limb/refraction margin, and therefore
retains high-cloud illumination after a disc drops below the sea-level horizon.
It also skips numerically dark sources and a Moon below `1e-5` of a Sun at
least six degrees above the observer horizon. Twilight Moon transport stays
enabled because atmospheric attenuation can reverse that TOA ratio. Packed TOA
RGB values and directions remain unchanged even when their Beer solve is idle.

The angularly smoothed field is represented by P1 moments. Per RGB channel the
steady equation is

```text
-div(D grad Phi) + sigma_a Phi = sigma_s sum_s(E_s T_s)
D = 1 / (3 (sigma_a + sigma_s (1 - g)))
```

`Phi` is fluence, `sigma_a`/`sigma_s` are local absorption/scattering in km^-1,
`g` is the scattering-weighted first phase moment, and `E_s T_s` is the exact
unscattered source irradiance at that voxel. Harmonic face averages of `D`
preserve flux across density/material changes. A four-level aggregation
multigrid V-cycle propagates this source laterally through the real 3D owner
density, which is the missing mechanism behind sunlit cloud sides and energy
leaking around dense cores. Weighted Jacobi is only the pre/post/coarse
smoother inside that V-cycle; a fixed count of fine-grid Jacobi passes is not a
completion condition.

The positive 17-lobe sky cache (14 diffuse, horizon, Sun-adjacent, Moon-adjacent)
is integrated into six incoming face irradiances. Additional lower-atmosphere
and Lambertian ground radiance enter the lower directions. Empty neighbours use
the finite-volume Marshak boundary

```text
Phi + 2 D d(Phi)/dn = 4 E_in.
```

This is a P1 boundary condition, not an ambient tint. Every lobe contributes
according to its solid angle and projected direction, and the boundary field is
then transported through density by the same solve. Resolved Sun/Moon discs must
remain excluded from the 17 lobes because their beams are injected separately.

The view evaluator obtains current from Fick's law, `J = -D grad Phi`, using a
centred derivative in the interior and a true one-sided derivative at an
exterior cell. It does not difference against a clamped duplicate edge texel,
which would halve the boundary current and make the illuminated face a broad
flat shelf. The P1 field is reconstructed as:

```text
S_d(omega) = (Phi + 3 g J dot omega) / (4 pi).
```

It limits `|J| <= Phi/3` per channel before reconstruction, so the returned
radiance cannot be negative. An extinction-event marcher multiplies `S_d` by
local single-scattering albedo; a coefficient-based marcher multiplies it by
`sigma_s`.

Finite stratiform owners use the same solve. Their existing twelve-node sheet
quadrature still determines visible-segment extinction and the exact zeroth/
first-collision term. Same-layer source transport is partitioned per physical
owner: every selected owner's complete-OBB Sun/Moon Beer field is multiplied
once, while the exact directional integral is restricted to unselected owners.
The 17-lobe sky, lower atmosphere, and ground-to-cloud-base field enter the P1
higher-order term through Marshak faces. This keeps zero, one, and higher
orders disjoint even for broad or multi-owner layers while preserving finite
lateral sheet boundaries. It follows
the real-time stratiform decomposition described by Bouthors, Neyret, and
Lefebvre, adapted here to the common world-space owner/morphology contract.

This separation follows Stam's reduced-incident/diffuse construction and use of
P1 diffusion for optically thick media. Cloud-radiation research independently
identifies 3D horizontal flux and radiative smoothing as essential cloud
effects. The approximation is deliberately not used for the resolved direct
beam within its first collision.

## Default production envelope

The default atlas contains six owner bricks, each `48 x 32 x 48`, stacked in a
logical `48 x 32 x 288` atlas. The packed view texture contains three fields in
two publication banks, so its physical base-mip size is `48 x 32 x 1728`,
still below WebGPU's guaranteed 2048-texel 3D dimension limit. Lightning uses a
separate two-bank `48 x 32 x 576` transfer texture, so it does not increase the
packed atlas depth. All seven texture objects have four exact mip levels:
`48 x 32 x 48`, `24 x 16 x 24`,
`12 x 8 x 12`, and `6 x 4 x 6` per brick. Each owner has independent diffusion
and Sun/Moon source transforms; there is no screen-space or camera-frustum
ownership.

| Resource | Objects / contents | Four-mip bytes |
| --- | ---: | ---: |
| extinction + occupancy, scattering + g | 2 x RGBA16F | 8,087,040 |
| Sun and Moon transmittance / coarse residual RHS | 2 x RGBA16F | 8,087,040 |
| multigrid ping-pong scratch | 1 x RGBA16F | 4,043,520 |
| lightning transfer bank A+B | 1 x RGBA16F, twofold depth | 8,087,040 |
| packed view bank A+B, each fluence + Sun + Moon | 1 x RGBA16F, sixfold depth | 24,261,120 |
| **Total** | **exactly 7 texture objects** | **52,565,760 bytes (50.131 MiB)** |

The total comprises 505,440 logical voxels across all four mips. The
base-equivalent resource footprint is 104 bytes per logical voxel; the table is
the exact mip-inclusive allocation.

The immutable material/source preparation is bounded to:

- 73,728 exact owner queries per selected diffusion brick;
- 73,728 exact owner queries for each active Sun/Moon field per distinct
  physical owner (sibling tiles have byte-identical full-owner transforms and
  share the first stable field);
- at most 1,327,104 exact queries for six unrelated owners and both sources,
  or 589,824 for six sibling tiles of one owner and both sources;
- 1,152 material workgroups at `4 x 4 x 4`;
- 4,608 source-material workgroups at `4 x 4 x 1` per distinct owner/source;
  production assigns one invocation to each exact y cell, while the dormant
  paired experiment rejects the upper half of that same dispatch;
- 36 workgroups per direct source at `8 x 1 x 8`;
- at most 4,608 exact owner queries for a brick whose six faces are all
  truncated (`6 faces x 16 directions x 8 path nodes x 6 resident owners`).

The renderer does not submit that full graph in one frame. The cheap level-one
support classifier advances by eight z slices; exact diffusion and exact source
material advance by one; cached multigrid work advances by eight slices at
30 Hz while warming. Every fine-material or source-materialization pass owns
at most 1,536 queries. Each exact pass owns one
compute-only submission and the next exact pass waits for that submission's
queue-completion serial. Background, stars, glow, temporal reconstruction, and
presentation are not encoded into that fenced command buffer. Cheap
cached/support work uses the remaining slots of an eight-step presentation
batch. This backpressure prevents requestAnimationFrame from outrunning the GPU
queue without reducing grid resolution, density detail, or transport order.
Every pass is a global
barrier: all selected bricks finish every slab of materialization, restriction,
smoothing, prolongation, or copy before a dependent pass begins. Consequently,
selected-neighbour halo reads never combine newly solved and stale sibling
states.

Each V-cycle uses two fine pre-smooths, volume-average restriction, two smooths
at the intermediate levels, 16 smooths on the `6 x 4 x 6` coarse grid, matched
piecewise-constant signed correction prolongation, and three post-smooths on
each intermediate/fine level. Prolongation writes scratch, so the odd post
count finishes directly in the packed field. This turns the full-volume copy
that an even two-pass ascent required into useful relaxation without adding a
scheduled pass. A bounded `omega = 0.92` was selected across the production Cu
support, a dense volume, and six disconnected variable-density volumes; it
remains a convex fine-grid update and leaves the equation unchanged. Every
coarse equation is evaluated matrix-free
as `A_H = R A_h P` from the authoritative fine RGB coefficients. Fine void
Marshak faces and mapped sibling links therefore remain topology, rather than
being replaced by a dilute reciprocal-diffusion coarse material. That is
368,640 fine plus 54,144 coarse smoothing
voxel updates per brick per cycle. Completion is data-dependent, not pass-count
dependent: one global atomic reduction measures

```text
max_rgb |b - A Phi| / max(1e-5, |b|, |A Phi|)
```

over every occupied voxel in every selected brick. Publication requires a
maximum residual at or below 0.02, at least one occupied voxel, zero non-finite
values, and zero energy-range violations. The single-volume production Cu
reference qualifies by cycle three; easier owners can exit earlier. The
photographed three-owner congestus scene retains a 2.66% cross-brick mode after
cycle five, so the same residual-gated solver may use up to eight bounded cycles
without weakening the 2% quality threshold. Failure to qualify after that
ceiling leaves the previous bank and view records untouched and reports a
`failed` state. The canvas exposes the measured residual, tolerance,
non-finite/energy counts, occupied count, active bank, generation, and ready
counts for independent qualification.

No invocation follows an unconstrained ray and no shader loop depends on world
distance. Inactive bricks and sources write neutral values. The TypeScript plan
rejects invalid dimensions, more than 32 bricks, a non-four-level grid, invalid
smoother/cycle ceilings, and any double-bank atlas exceeding the WebGPU core 3D
texture limit.

For dense cumulus with a 50-63 m extinction mean free path, a
`2.88 x 1.6 x 2.88 km` brick has `60 x 50 x 60 m` cells. The supplied resolution
audit accepts a largest-cell/mean-free-path ratio up to 1.5. Larger owners must
be spatially tiled; silently stretching a brick across a 20-50 km system would
remove the transport scale that this subsystem exists to recover. A practical
selection policy is a bounded connected observer-priority frontier with at
most 18 materialized candidates per owner and six resident bricks. Wider
finite sheets and cellular/convective owners use the same overlapping spatial
tiles. The mandatory first tile of every non-sheet owner is seeded from an
actually occupied dense-core voxel in its selected macro atlas volume. Further
tiles retain observer relevance but are admitted only when they intersect the
manifest's conservative interior-plus-procedural-exterior support. Sheets use
the point in that same support nearest the observer. This prevents a padded
owner OBB from consuming its only residency slot below or beside real
condensate when owner count equals the six-brick budget. Morphology bounds are
extension-only: a zero-record owner is an identity and is never enlarged by an
oriented-box to world-AABB round trip.

## Production integration contract

1. `cloud_lv_query_world_medium(world_position_km, owner_index)` calls the same
   base/placement/reuse morphology composition, target-optical-depth override,
   local liquid/ice optical interpolation, extinction, albedo, and asymmetry as
   the view march. There is no duplicate density field.
2. At most six stable owner-space tiles are selected. Manifest support/core
   anchors guarantee one support-bearing first tile per selected owner before
   connected observer-relevance allocation. Their two-cell overlaps
   identify interior seams, and every direct transform spans the full owner OBB
   so Beer transport continues through same-owner sibling tiles. Finite
   stratiform topologies participate in this same resident set and P1 solve.
   A finite atlas owner uses bounded owner-event camera transport. The
   finite-segment sheet quadrature remains only for legacy analytic layers
   that do not have finite owner support.
3. A GPU projection integrates all 17 positive directional-atmosphere lobes
   with 64 sphere samples for every exterior face and adds cloud-shadow-coupled
   Lambertian ground radiance only below the local horizon. Faces are explicit:
   any selected sibling owner can exchange a world-space halo, true owner
   exteriors use the physical Marshak field, and omitted finite neighbours use
   a bounded `16 x 8` formal solution to the real owner-OBB exit. That closure
   sums resident extinction, exact all-owner Sun/Moon Beer and HG scattering,
   passive diffuse atmosphere/ground transport, and the attenuated far
   environment; it has no empirical boundary multiplier and cannot turn a
   dense truncation into clear sky.
4. Six `RGBA16F` 3-D resources are allocated with sampled/storage/copy usage.
   Group 1 exposes only a fixed 1,856-byte uniform and one packed sampled 3-D
   texture, remaining below the cloud fragment stage's texture limit.
5. Boundary, material, independent Sun/Moon scans, restriction, smoothing,
   prolongation, copy, and residual measurement use generation-wide pass
   barriers. Exact material uses bounded four-slice, compute-only submissions
   with one serial queue fence each; cached work uses eight-slice batches. The
   first stable tile evaluates each full-owner source field once, and atomic
   publication copies that representative Sun/Moon field into every sibling's
   packed slot. Fine/coarse fields ping-pong
   between the packed target bank and scratch; coarse Sun mips carry signed
   residual right-hand sides after the fine direct scan is complete.
6. The low-frequency cache excludes the current layer in its entirety. The
   atomically published 36-bit owner mask partitions that layer: Sun and Moon
   multiply each direct-qualified owner's full-OBB RGB Beer field exactly once, while
   the fine-near and remaining-shell exact integral evaluates only owners absent
   from the mask. In symbols, `tau_layer = tau_resident + tau_missing` and
   `T_layer = T_resident * exp(-tau_missing)`. The source-aligned grid extends
   two real zero-density transverse cells beyond every finite-owner OBB face.
   Ordinary Beer interpolation therefore reaches `T=1` before the packed atlas
   boundary and cannot expose a rectangular shadow step. No boundary, source right-hand
   side, or camera source term is permitted to see one owner through both
   paths. P1 is reconstructed with outgoing direction, exact local
   diffusion/asymmetry, and one local albedo factor; local brick confidence
   blends only that higher-order closure, never the already-complete direct
   visibility. Qualification is independent of diffusion resolution: every
   active Sun/Moon transform must keep its maximum source/transverse cell
   optical depth at or below `0.75`. Under-resolved owners remain absent from
   the mask and use exact same-layer tracing. They are also pruned from the
   retained cache brick set, so no source materialization, Beer prefix scan,
   or P1 solve is performed for a field the camera cannot sample. A generation
   with no qualified owner publishes atomically as exact-only: ready mask zero,
   resident masks zero, vacuum P1, and identity cached Beer.
7. Camera-visible P1 requires the complete-owner sampling flag, a complete
   resident layer, and direct qualification for every owner in that layer. A
   partial direct-qualified owner may contribute its complete-OBB Sun/Moon Beer
   field, but its truncated one-value-per-face solve
   is not used as radiance; the analytic physical closure remains authoritative
   for every owner in a mixed-residency layer. This prevents both a partially
   selected tile from exposing its rectangular irradiance domain and a lone
   complete owner from switching higher-order closures against its peers. Complete owners fade over the
   physical two-cell overlap. Confidence is the maximum across ready same-owner
   siblings; only the transition band evaluates both higher-order closures.
   Resolved direct Sun/Moon radiance is assembled once outside that convex
   blend, retaining its warm/neutral atmosphere-transmitted chroma separately
   from the usually bluer directional-sky field.
   Direct-qualified owners in a nonresident P1 layer retain only their Beer
   work. Their packed fluence slot is explicitly cleared to vacuum, the source
   grid uses the exact procedural medium, and all boundary/multigrid/residual
   kernels reject the brick through the P1-eligibility metadata bit.
8. Finite-volume halos connect only tiles of the same physical owner. If more
   than one sibling covers a halo point, fluence and diffusion are combined by
   a positive edge-distance partition of unity instead of selecting the first
   stable slot. Overlapping unrelated cloud systems exchange illumination
   through the shared incident field, never by aliasing one owner's solved
   voxel into another owner. This removes owner-order and brick-grid
   discontinuities without masking the resulting radiance.
8. Structural state, morphology bounds, optics, sources, aerosol tint, and a
   quantized two-second advection epoch are captured in one immutable parameter
   snapshot. Directional visibility remains on that same epoch while the solve
   warms. Live frame time never quilts multiple states into an in-flight
   generation, and a newly published bank must complete at least one camera
   transport before time alone can retire it. Missed live epochs coalesce
   directly to the newest request rather than replaying an obsolete backlog.
9. A signature change chooses the inactive packed bank while preserving the
   complete active bank, header, diagnostic layer mask, owner partition mask,
   and brick records. Only after the
   whole-generation residual qualifies, all direct fields are copied, and the
   queue completes does one header write flip the bank and records atomically.
   Any residual, non-finite, energy, or readback failure retains the old bank.

## Calibration and qualification

`evaluateHomogeneousSlabDiffusion` is an independent analytic P1 solution for a
collimated beam and vacuum Marshak boundaries. `solveCloudLightGridReference`
is the scalar, variable-density finite-volume/Jacobi baseline matching the GPU
fine-grid equation and normalized residual definition;
`solveCloudLightMultigridReference` is the executable aggregation-RAP
specification. The focused tests verify
the slab differential equation and both boundaries, positivity, linearity,
cube symmetry, residual below two percent, 17-lobe isotropic energy, source
alignment, finite-sheet selection/boundaries, morphology-expanded domains,
packing, resource ceilings, exact `R A P` action, symmetry/positive energy,
monotonic convergence of dense and six disconnected sparse owners, arbitrary
odd smoother parity, and P1 realizability.

For visual sign-off, add two reference sets before tuning performance:

- homogeneous slabs at optical depths 0.25, 1, 4, 16, and 64, with droplet
  albedo/asymmetry from the existing optical tables; compare fluence and face
  reflectance/transmittance against a high-sample delta-tracking Monte Carlo;
- canonical sphere, cumulus tower, overlapping liquid/ice owners, and a finite
  stratiform tile, illuminated from zenith and 5-degree elevation. Compare
  sidewall luminance profiles, dark-core position, color neutrality, and energy
  escaping all faces. Use 25/50/75/100 m grids to locate convergence.

P1 is an asymptotic thick-medium model. It is weakest within roughly one
transport mean free path of a sharp beam and for extremely anisotropic,
absorbing thin volumes. The explicit reduced beam, exact owner Beer scans,
resolved first-order phase, boundary treatment, and mean-free-path audit limit
those failure modes. If slab Monte Carlo shows unacceptable near-boundary bias,
the next upgrade is delta-P1 source correction or a higher angular-order local
closure—not an empirical powder/rim term.

## Primary sources

- Jos Stam, [*Multiple Scattering as a Diffusion Process*](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/egwr95.pdf), Eurographics Rendering Workshop 1995. Derives the reduced incident/diffuse split, P1 transport cross section, diffusion equation, finite differences, and cloud examples.
- Antoine Bouthors, Fabrice Neyret, and Sylvain Lefebvre, [*Real-time Realistic Illumination and Shading of Stratiform Clouds*](https://diglib.eg.org/items/af30af3c-8886-4c1f-b87d-54f9e7f1466e), Eurographics Natural Phenomena 2006. Separates direct, first-order, and higher-order stratiform illumination with finite cloud boundaries and sky/ground exchange.
- Anthony B. Davis and Alexander Marshak, [*Solar Radiation Transport in the Cloudy Atmosphere: a 3D Perspective on Observations and Climate Impacts*](https://ntrs.nasa.gov/api/citations/20110016084/downloads/20110016084.pdf?attachment=true), Reports on Progress in Physics 73 (2010). Reviews 3D cloud transport, diffusion, horizontal flux, and radiative smoothing.
- Andrew Schneider and Nathan Vos, [*The Real-time Volumetric Cloudscapes of Horizon: Zero Dawn*](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf), SIGGRAPH Advances in Real-Time Rendering 2015. Production reference for bounded volumetric cloud resources and primary/secondary scattering.
- Andrew Schneider, [*Nubis: Authoring Real-Time Volumetric Cloudscapes with the Decima Engine*](https://advances.realtimerendering.com/s2017/index.html), SIGGRAPH Advances in Real-Time Rendering 2017. Production follow-up covering the shipped regional cloud system, atmosphere integration, and lighting revisions.
- Sébastien Hillaire, [*Physically Based Sky, Atmosphere & Cloud Rendering in Frostbite*](https://www.ea.com/news/physically-based-sky-atmosphere-and-cloud-rendering), SIGGRAPH 2016. Production contract for physically based participating media and atmosphere/cloud interaction.
- Alexander Marshak et al., [*Radiative effects of sub-mean free path liquid water variability observed in stratiform clouds*](https://doi.org/10.1029/98JD01728), JGR Atmospheres 1998. Monte Carlo evidence for resolving cloud variability at approximately the photon mean-free-path scale.
- GPU for the Web Community Group, [WebGPU specification](https://gpuweb.github.io/gpuweb/). Defines the guaranteed `maxTextureDimension3D` of 2048 and storage/sampled texture contracts used by the bounded atlas.
- Jack Dongarra et al., [*Templates for the Solution of Linear Systems: Multigrid Methods*](https://www.netlib.org/utk/lsi/templatesLSI/TEMPLATES). Primary numerical reference for the complementary roles of Jacobi smoothing, restricted coarse correction, and post-smoothing in a V-cycle.
- PETSc Development Team, [*KSP and multigrid solver manual*](https://petsc.org/main/manual/ksp/). Production numerical reference for level smoother work/convergence tradeoffs, aggregation, restriction, and coarse-grid solution. Chebyshev acceleration was not used here because PETSc requires a reliable extreme-eigenvalue estimate; the cloud operator changes with every owner and lighting epoch.

Exact camera segments and directional Sun/Moon coupling nodes use the same
guarded `highIceSourceAtlas` sampled at binding 32. Their owner-space footprint
`q` is shared: at `q <= 1` the 96³ fine source resolves material, while at
`q >= 2` the evaluator returns to authoritative macro-R and its packed coarse
`G/B` moments, with a continuous transition between them. Macro R, SDF, and
majorants still own support proofs, geometry, and empty-space skipping; the
source atlas cannot create an unsupported light caster.

Source-backed Ci/Cc/Cs owners replace the old procedural residual with this
conditioned source realization. Analytic Ci fibratus remains on its specialized
tangent-relative evaluator. The resident light-volume medium and P1 storage
continue to carry arithmetic extinction and scattering, and the source
closure is applied only at the exact owner/source query before the Beer prefix.
The legacy RG8 moment/coverage sidecar is offline provenance for the source
build and qualification only; the runtime does not upload or sample it, so no
second expected-Beer closure can attenuate the P1 right-hand side.

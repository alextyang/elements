# High-cloud physical foundation

`high-cloud-physical-foundation.ts` is the renderer-independent contract for
the five Cirrus and four Cirrocumulus species implemented by Elements. It does
not generate atlas voxels or edit the production scene. Its purpose is to make
later generator, runtime, and shader integration reject physically impossible
states before they become visual artifacts.

The foundation separates three scales that must not be conflated:

1. An individual fibre, tuft, turret, grain, or lens has a physical diameter.
2. A formation has a much larger finite world-space envelope.
3. The camera projects an individual element to an angular diameter.

For Cirrocumulus above 30 degrees elevation, most individual elements must be
less than one degree across. The rule applies to the individual grain or turret,
not the full stratiformis sheet or wave packet. `qualifyHighCloudProjection()`
enforces both the physical species range and this camera-dependent WMO
discriminator.

Each species exposes four deterministic macroform descriptors. They identify
physical connectivity, mechanism, hierarchy, element count, spacing variation,
origin, and lifecycle. A generator may add stochastic small-scale detail, but
an owner index must first select a genuinely different macroform with
`selectHighCloudTopologyVariant()`.

`sampleHighCloudLocalMicrophysics()` produces a local state from normalized
height, trail membership, dense-core membership, wave support, temperature,
turbulence, lifecycle, and origin. Effective ice radius, habit mixture,
roughness, sedimentation, condensate, and sublimation therefore vary through
the cloud instead of remaining one owner-global value. The terminal-velocity
field is a bounded renderer proxy, not a replacement for a habit-resolving
microphysics solver.

`high-cloud-topology-qualification.ts` rejects exact macroshape clones, repeated
world-space lag vectors, and overly uniform nearest-neighbour spacing. Its grid
metric measures repeated displacement, not shared direction, so a real
castellanus line or wave band can retain its physical axis without passing a
rectangular lattice.

## Cirrus fibratus macro reconstruction

Fibratus now has three materialized 48³ C2 populations rather than one repeated
brush stamp. Topology ordinal 0 selects seven primary plus five subordinate
irregular curved fibres; ordinal 1 selects eight primary plus seven subordinate
fibres distributed through three depth/shear strata; ordinal 2 selects nine
primary plus four subordinate fibres from two unequal humidity-source swaths.
They deliberately contain no capsule-chain brushes, shared planar envelope,
terminal hooks, or rounded tufts. One synoptic wind field remains legible in
each anatomy, but source altitude and depth, local heading, sedimentation,
path curvature, lifetime, length, radius pulse, terminal taper, and real dry
slots vary independently within bounded physical ranges. Subordinate wisps
remain detached from their parents, so clear sky is genuine three-dimensional
negative space rather than a density mask cut from a slab.

The atlas keeps the same RGBA8 3-D texture and manifest-derived transform ABI.
Canonical 48³ slots are tiled across X/Z instead of being limited to one
2048-slice Z column; all pre-existing IDs and indices remain stable, and the
two fibratus IDs are append-only. This supplies distinct coarse SDF support for
the display-scale analytic fibre reconstruction without duplicating its
high-frequency work.

This construction follows three observed-scale constraints:

- WMO fibratus fibres are fine and mostly distinct, and may be straight or
  irregularly curved, but may not terminate in hooks or tufts.
- Cirrus fallstreak geometry follows the vertical wind profile and the spread
  of ice-particle fall speeds. Differential shear mixes smaller scales with
  depth rather than preserving equal parallel edges through the full layer.
- Sedimentation can deepen Cirrus by kilometres while sublimation removes
  smaller crystals first. A complete field may therefore occupy several
  altitude/depth strata even though each individual fibre stays thin.

Generation rejects the atlas if the trajectories form a two-axis repeat,
touch the owner boundary, lose their multiscale population at 2x/4x
reconstruction, lack source depth or curvature, use any legacy capsule chain,
or collapse into one dominant coarse component. CPU projection qualification
also measures component orientation, aspect, length/width hierarchy, and
negative-sky survival; a synthetic equal-length parallel-ribbon population is
an explicit failing reference.

## Exact integration callsites

- In `cloud-scene.ts`, replace the hardcoded high-level choices in
  `dailyBaseClassification()` with `reachableHighCloudSpecies()` or
  `selectReachableHighCloudSpecies()`. Derive the input from the coherent daily
  instability, wave, shear, sedimentation, origin, and lifecycle state.
- In `cloud-state-map.ts`, use `HIGH_CLOUD_SPECIES_DESCRIPTORS` to validate the
  high-cloud recipe's individual `elementScaleKm`. Do not use formation span as
  element scale.
- In `cloud-system-runtime.ts`, call `qualifyHighCloudProductionState()` before
  `compileCloudSystem()`; use `qualifyHighCloudProjection()` in
  `extentFor()`/placement qualification; and replace the one bulk ice radius in
  `physicalStateFor()` with the local profile parameters needed by the GPU.
- In `cloud-volume-atlas.ts`, `deterministicVariant` now maps topology ordinals
  0/1/2 to genuinely distinct append-only fibratus volume IDs.
- In `scripts/lib/cloud-volume-atlas.mjs`, three explicit source-history and
  shear anatomies are generated and qualified after 48³ and scale-4
  reconstruction; they are not rotations or alternate random seeds.
- In `sky-renderer-canvas.tsx`, preserve the selected topology variant while
  resolving each owner volume. Do not multiply a canonical full-population
  atlas stamp by the runtime owner count.
- In `cloud-optics-runtime.ts`, replace or augment the owner-global
  `selectCloudIceOpticalRegime()` result with the local profile's radius, habit,
  and roughness fields.
- In `packCloudSystems()` and `webgpu-shaders.ts`, pack a compact profile index
  plus local height/trail/core/wave coordinates. Evaluate the same profile for
  view and source transport before phase/extinction lookup. This prevents the
  view and light paths from disagreeing about local material.

The foundation deliberately emits no WGSL yet. Until buffer packing is chosen,
duplicating the equations in generated WGSL would create a second unconnected
implementation. The TypeScript tests are the numerical contract for that later
port.

## Primary references

- [WMO Cirrus definition](https://cloudatlas.wmo.int/en/cirrus-ci.html) and
  [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-cirrus.html)
- [WMO Cirrocumulus definition](https://cloudatlas.wmo.int/en/cirrocumulus-cc.html)
  and [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-cirrocumulus.html)
- Each descriptor links its specific WMO species page.
- [NASA: ice habit and size-distribution scattering](https://www.giss.nasa.gov/pubs/abs/ya07200b.html)
- [NASA: cirrus radiative properties across plates, columns, rosettes, and polycrystals](https://www.giss.nasa.gov/pubs/abs/mi00800v.html)
- [Cirrus formation pathways and lifecycle](https://acp.copernicus.org/articles/20/12569/2020/)
- [Observed cirrus nucleation, growth, sedimentation, and sublimation layers](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2024GL108493)
- [A 3D stochastic Cirrus model: fallstreak geometry and shear-induced mixing](https://doi.org/10.1256/qj.04.144)
- [Horizon / Nubis: separate governing macro shape from high-frequency erosion](https://advances.realtimerendering.com/s2015/)

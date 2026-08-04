# Deep-convection physical foundation

This note describes the Cumulonimbus foundation in
`deep-convection-physical-foundation.ts` and its first production integration
into the macro-volume atlas. Scene state, renderer, lighting, and shader work
remain intentionally serial because those files are concurrently changing.

## Source-derived constraints

The model treats classification, dynamics, microphysics, and rendering as
separate but coupled layers.

- The [WMO Calvus definition](https://cloudatlas.wmo.int/en/clouds-species-calvus.html)
  requires upper protuberances that are losing their sharp cumuliform outline,
  but no cirriform part. The [WMO Capillatus
  description](https://cloudatlas.wmo.int/en/species-cumulonimbus-capillatus-cb-cap.html)
  requires a visibly fibrous or striated upper portion and notes its frequent
  shower, thunderstorm, hail, and virga associations. `incus` is consequently
  legal only on a sufficiently glaciated Capillatus anvil.
- The [WMO Cumulonimbus aircraft
  description](https://cloudatlas.wmo.int/en/observation-of-clouds-from-aircraft-descriptions-cumulonimbus.html)
  places a normally sub-2-km, often ragged base below a 3–15-km-deep cloud,
  with water, supercooled water, ice crystals, precipitation, and often hail
  coexisting. The microphysics contract therefore blends phase continuously
  rather than switching material at the freezing level.
- The [NOAA/NWS thunderstorm lifecycle](https://www.weather.gov/spotterguide/life)
  distinguishes updraft-dominant development, mature coexistence of updraft
  and precipitation-driven downdraft, a spreading gust front, and eventual
  downdraft-dominant dissipation that can leave a remnant anvil. The four
  runtime stages retain that ordering while giving peak precipitation its own
  explicit state.
- NOAA defines an [overshooting top](https://forecast.weather.gov/glossary.php?word=OVERSHOOTING+TOP)
  as a dome above the anvil produced by a strong updraft. The foundation only
  emits it above the equilibrium level, attached to the ice crown, and while
  strong ascent persists.
- WMO feature ownership is literal, not decorative: [arcus](https://cloudatlas.wmo.int/en/clouds-supplementary-features-arcus.html)
  belongs to the forward gust front; [murus](https://cloudatlas.wmo.int/en/clouds-supplementary-features-murus.html)
  belongs to the rotating rain-free updraft base; [cauda](https://cloudatlas.wmo.int/en/clouds-supplementary-features-cauda.html)
  joins the precipitation region to murus at their shared base; [flumen](https://cloudatlas.wmo.int/en/clouds-accessory-flumen.html)
  follows supercell inflow but is detached from and above murus; [mamma](https://cloudatlas.wmo.int/en/clouds-supplementary-features-mamma.html)
  hangs from a cloudy underside, commonly the anvil; [pileus](https://cloudatlas.wmo.int/en/clouds-accessory-pileus.html)
  and [velum](https://cloudatlas.wmo.int/en/clouds-accessory-velum.html) are
  penetrated by actively growing turrets; [pannus](https://cloudatlas.wmo.int/en/clouds-accessory-pannus.html)
  is ragged low cloud in precipitation-moistened air; and [tuba](https://cloudatlas.wmo.int/en/clouds-supplementary-features-tuba.html)
  must reveal an actual base vortex.
- NOAA's [thunderstorm electrification
  account](https://www.nssl.noaa.gov/education/svrwx101/lightning/faq/)
  ties lightning to collisions among supercooled droplets, graupel, and small
  ice, followed by dynamical separation into charge reservoirs. The contract
  cannot create a random flash in a cloud that lacks that mixed-phase source.

The rendering architecture follows original production and simulation work
without copying implementation code:

- [Stormscapes](https://research.google/pubs/stormscapes-simulating-cloud-dynamics-in-the-now/)
  demonstrates that atmospheric density, buoyancy, pressure, thermodynamic
  profiles, and measured weather inputs are the right high-level controls for
  transitions and large Cumulonimbus clusters.
- Guerrilla's [2015 real-time volumetric cloudscape
  work](https://advances.realtimerendering.com/s2015/) separates directable
  formation-scale structure from animation, lighting, and fine volumetric
  detail.
- [Nubis Evolved](https://advances.realtimerendering.com/s2022/) and
  [Nubis³](https://www.guerrilla-games.com/read/nubis-cubed) motivate finite
  voxel-owned clouds, compressed distance fields for empty-space traversal,
  simulated macroforms, and a distinct lighting solution. They do not justify
  turning a 2-D coverage mask into a storm boundary.
- Hillaire's [production-ready atmosphere
  paper](https://sebh.github.io/publications/egsr2020.pdf) is the later
  integration target for consistent sky radiance, aerial perspective, and
  cloud/atmosphere coupling; cloud density and the surrounding atmosphere must
  share physical light units.

## Runtime contract now available

`createDeepConvectionDescriptor` resolves a deterministic storm from a
meteorological environment, lifecycle point, species, organization, intensity,
and seed. It supplies cloud-base/freezing/equilibrium relationships, continuous
flow strengths, updraft speed derived from a bounded CAPE estimate, anvil shear,
overshoot height, and a closed thermodynamic system boundary.

`resolveDeepConvectionTopology` returns one storm-relative graph. Its principal
mass path is:

`inflow → rain-free base → liquid core → mixed-phase core → turret → ice crown → anvil/overshoot`

Its precipitation/outflow path is:

`mixed-phase core → precipitation → downdraft → cold pool → gust front`

All geometry is in kilometres in the frame `x=downwind, y=altitude,
z=crosswind`. Shapes are finite support descriptors for later density
construction. They are not draw calls or opacity masks.

`sampleDeepConvectionMicrophysics` returns normalized bulk fractions for cloud
liquid, supercooled liquid, ice crystals, graupel, rain, and hail. Temperature,
altitude, radial support, downwind detrainment, lifecycle decay, and local
collision potential vary continuously. The model is deliberately a rendering
contract rather than a forecast-grade bin microphysics solver.

`resolveDeepConvectionFeatureOwnership` returns eligibility, incidence,
required owner regions, parent-feature dependencies, and attachment mode for
all ten requested WMO features. Explicit art direction cannot make an invalid
feature physically present; the result instead reports why it is ineligible.

`resolveDeepConvectionSourceContracts` produces owned rain, hail, virga, and
lightning sources. The result includes source altitude, prerequisites,
transport, termination, ground-reaching fraction, and resolved lightning charge
regions.

`resolveDeepConvectionElectricalSource` maps those charge reservoirs and
discharge candidates into the finite storm world frame. Channel core radii are
kept at the measured centimetric scale (1.8–9.5 cm); apparent pixel width is a
segment-coverage/camera-PSF concern. Its `illuminationEnvelope` is a
`finite-storm-light-transport-volume` with `emissionSource: channel-only`.
`evaluateDeepConvectionElectricalIlluminationMembership` supplies a finite
ellipsoidal transport bound, but cloud density still decides where scattering
occurs. `createDeepConvectionLightningEventContract` forwards qualified charge
centres, guide points, owner bounds, current, and radiant joules to the shared
optical lightning constructor. No whole-cloud emitter or screen flash exists.

`interpolateDeepConvectionDescriptors` and
`sampleDeepConvectionTransitionMicrophysics` provide continuous lifecycle and
phase handoff. `createDeepConvectionDescriptorAtProgress` maps one absolute
lifecycle coordinate through developing, mature, precipitating, and decaying
states.

`qualifyDeepConvection` validates topology, ownership, source legality,
microphysics, atmosphere ordering, finite bounds, and optional camera framing.
Eight archetypes span pulse cells, humid downpours, classic and tornadic
supercells, maritime clusters, dry virga, squall lines, and remnant anvils.
Five qualification environments each carry wide, oblique, and either distant
or under-anvil semi-ground perspectives.

## Macro-atlas integration now available

Generator version `2.11.0` replaces all eight Cumulonimbus owners with a
storm-relative, source-connected trajectory graph at the existing `48³`
resolution. It does not reuse the generic Cumulus positive primitives and does
not stamp positive ellipsoid caps or anvil plates. The normalized coordinate
mapping is explicit: physical downwind becomes atlas `z`, physical altitude is
atlas `y`, and physical crosswind becomes atlas `x`.

Each active storm begins with irregular feeder thermals that converge into a
protected dominant updraft. Attached entraining paths vary radius, direction,
height, and merger point so the mass cannot collapse into an oval, smoke stack,
snowman, or repeated grid. Calvus uses an attached, multi-path transitional
dome without cirriform outflow. Capillatus passes through a continuous
mixed-phase network into tapering fibres. Incus owners branch those fibres into
a finite two-level shear graph with separately parameterized downwind, upwind,
and crosswind extents. Overshoots originate inside the live crown. Rain-loading
and downdraft paths originate in the mixed-phase core but remain horizontally
offset from the protected inflow.

The deterministic alternatives represent different physical organizations,
not seed-only perturbations: pulse versus maritime multicell Calvus, humid
pulse versus strongly sheared Capillatus, downwind-dominant versus back-sheared
Incus, and compact decay versus a broad anvil remnant. Decay removes feeder and
live-updraft topology before it preserves eroding upper ice.

Focused qualification now records and rejects the known failures using packed
voxel and authoring-graph measurements: connected components, node/edge/path
accounting, attachment radius in voxels, radius and direction diversity,
projected grid autocorrelation, vertical-profile articulation, glaciation and
anvil branch depth, precipitation/core separation, and lower-tower loss. A
cryptographic family signature additionally proves that all 30 non-Cb volume
indices, packed atlas blocks, majorant blocks, and complete manifest entries
remain byte-for-byte unchanged from generator `2.10.0`.

## Serial integration plan

1. Adapt the shared scene-state normalizer to create one
   `DeepConvectionDescriptor` per Cumulonimbus owner. Preserve its storm-relative
   coordinate frame through all later stages. Do not convert its finite system
   boundary to coverage opacity.
2. **Complete for the canonical macro atlas.** The Cumulonimbus generator now
   uses swept connected thermal paths, a continuous glaciation transition,
   shear-driven finite anvil branches, owned precipitation/downdraft support,
   and negative entrainment clefts. Runtime evolution still belongs to the
   subsequent shader integration.
3. Give the shader a compact packed representation of topology regions,
   attachment paths, local thermodynamic coordinates, and microphysics. Macro
   density must be evaluated before procedural erosion; detail noise must not
   create or move the finite system boundary.
4. Connect rain, hail, and virga to the existing hydrometeor system using the
   source contracts. Connect lightning only after its charge regions can be
   transformed into the same world frame and the bolt/channel renderer can
   respect cloud optical depth.
5. Couple cloud extinction, multiple scattering, precipitation shadowing, and
   aerial perspective to the physical atmosphere and directional cloud-light
   volume. The ice crown/anvil, warm liquid core, rain curtain, and subcloud air
   require different optical parameters; one owner-wide tint is invalid.
6. Add the eight archetypes and fifteen qualification perspectives to the sky
   lab only after the production mapping is complete. The capture harness should
   gate image review on successful rendered-frame readiness, then compare
   silhouettes, internal lighting, precipitation ownership, and atmosphere
   integration against licensed photographs.
7. Only after visual correctness, add empty-space skipping, distance-field
   acceleration, temporal reconstruction, resolution policy, and fallback
   selection. Those optimizations must consume the same physical descriptor so
   lower quality levels cannot silently change storm anatomy.

## Remaining gaps

- Cumulonimbus macro-density, detail type, phase, signed exterior bands, and
  conservative majorants now change rendered inputs. The production renderer
  has not yet been updated to consume the richer topology metadata directly.
- The bulk microphysics model ensures continuity and source legality but is not
  a prognostic CFD or bin-microphysics simulation.
- Finite canonical density and anvil fibres now exist in the macro atlas. Fluid
  evolution, explicit precipitation particles, lightning channels, radiance
  integration, and atmospheric shadows remain later integration work.
- The five-environment qualification is structural and camera-geometric. It is
  not a substitute for the later serial photographic render review.
- Performance work remains intentionally deferred until the visual and
  physical integration is correct, per the current project priority.

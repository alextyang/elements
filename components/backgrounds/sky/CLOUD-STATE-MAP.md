# Cloud state and renderer component map

This is the working ontology for completing the Elements cloud renderer. It is
deliberately broader than a list of presets: a real cloud state is assembled
from mutually exclusive identity, orthogonal observed attributes, physical
state, organization, lifecycle, material, lighting and camera state.

The canonical machine-readable definitions live in `cloud-state-map.ts`.

## 1. State axes

### Identity

- Ten WMO genera plus clear sky.
- Twenty-nine mutually exclusive official genus/species combinations.
- Three renderer-specific compatibility recipe IDs: Cumulonimbus capillatus incus,
  Nimbostratus praecipitatio and Altostratus opacus. Incus and praecipitatio
  are supplementary features and opacus is a variety in the canonical model;
  the compound IDs survive only inside the legacy GPU recipe adapter.

`classificationFromRendererSpecies()` and
`rendererSpeciesForClassification()` are the compatibility boundary. New lab
and scene state uses canonical classification and cannot construct renderer IDs
with unchecked string casts.

### Orthogonal WMO appearance

- Varieties: intortus, vertebratus, undulatus, radiatus, lacunosus,
  duplicatus, translucidus, perlucidus and opacus.
- Supplementary features: incus, mamma, virga, praecipitatio, arcus, tuba,
  asperitas, fluctus, cavum, murus and cauda.
- Accessory clouds: pileus, velum, pannus and flumen.
- Special origin: flammagenitus, homogenitus, homomutatus,
  cataractagenitus and silvagenitus.
- Mother-cloud relation: source genus plus genitus or mutatus.
- Upper-atmosphere state: nacreous, polar-stratospheric and noctilucent.

Varieties and features are composable. Translucidus and opacus are mutually
exclusive. Every other combination is checked against the genus association
tables before it reaches rendering.

### Meteorological state

- Base altitude and geometric depth in kilometres.
- Projected coverage in oktas.
- Temperature and phase profile through the layer.
- Liquid-water and ice-water path.
- Humidity, stability, vertical velocity and entrainment.
- Wind vector, vertical shear, turbulent integral scale and dissipation.
- LCL, optional LFC/equilibrium-level pair, freezing level, capping inversion
  and the finite vertical shear layer. Missing physical levels remain null;
  they are not populated with visually convenient fake altitudes.
- Precipitation kind, production rate, fall speed and evaporation depth.
- Lifecycle stage: incipient, growing, mature, glaciating, precipitating or
  decaying.

### Mesoscale organization

- Unorganized Poisson populations.
- Clustered thermal populations.
- Cloud streets and radiating bands.
- Open-cell and closed-cell circulations.
- Frontal shields and duplicated layers.
- Orographic wave trains and rolls.
- Storm inflow, core, outflow and anvil ownership.

Organization is a discriminated physical state, not a label plus a generic
strength. Point processes carry spacing and exclusion radius; cells carry
diameter, topology and wall width; bands, fronts, wave packets and storm
complexes each carry their own finite world-space dimensions.

### System extent and lifecycle

- Stable world-space centre, major/minor radius, orientation and a physical
  formation/dissipation transition distance.
- Lifecycle stage plus progress, age, cloud-top tendency, condensate tendency,
  glaciation, precipitation efficiency and outflow speed.
- A complete state can own its anvil, precipitation and accessory clouds; those
  features cannot survive independently of the system that generated them.

### Lighting and viewing

Lighting is never a cloud label. It is derived from the shared atmosphere,
Sun/Moon direction, optical paths, cloud phase and surrounding irradiance.
Camera range, field of view and azimuthal framing are editorial state applied
after the meteorological state is valid. They project complete world-space
systems; they never move or mask density in screen space.

### Production runtime and GPU ABI

`createCloudSystemRuntime(scene)` is the sole production owner-placement
boundary. It accepts only `CloudScene`; camera, canvas, FOV, projection,
exposure and editorial modes are absent from its API and its stable scene
signature. Several finite systems can coexist at one altitude and preserve
their identity as the camera orbits.

Cloud amount is treated as an observer-space constraint on the complete
celestial dome, not as opacity or the fraction of a chosen frame. The finite
population is consequently distributed over the whole Earth-local horizon,
with an aperiodic north-sector cluster that gives an editorial camera a
readable formation to select without moving any owner toward that camera.
Count, physical radius and radial depth all increase coherently with cloud
amount. A bounded population uses stratified near/middle/far representatives;
pure uniform-area sampling would spend nearly every one of the twelve records
near the outer edge of the domain.

The population policy is topology-specific:

- thermal fields contain several separated parcel trees plus a broad field,
  rather than one owner standing in for four or six oktas;
- mature cumulonimbus can own a readable cell and genuinely remote companions,
  preserving complete tower/anvil/precipitation systems at distinct ranges;
- partial layered cloud is a remote finite frontal bank, while six-to-eight
  okta sheet cloud is one immediate finite shield which physically contains
  the observer's vertical projection;
- cirrus uses elongated but finite streamer fields at near-zenith, middle and
  horizon ranges. Its altitude supplies the distance even when horizontal
  range is small;
- cirro-/alto-/stratocumulus owners are mesoscale colonies, not individual
  cloudlets, and high colonies retain larger slant range than low thermals.

`estimateCloudPopulationProjection()` is the non-rendering qualification gate.
It traces deterministic rays through the curved-Earth altitude interval and
oriented owner ellipses, either over equal solid angles on the whole hemisphere
or through a proposed frame. The result measures finite owner *support*, not
opacity or final condensate, and is never fed back into placement.

`packCloudSystems()` emits one vec4 header followed by at most 36 naturally
aligned records. The header is `[activeCount, 16, capacity, droppedCount]`.
Each 256-byte record is:

1. identity; horizontal extent; vertical extent/orientation;
2. LCL/LFC/EL/freezing levels; inversion and shear bounds;
3. optical material; thermodynamics; kinematics;
4. lifecycle state and tendencies;
5. two organization vectors; precipitation;
6. classification bitmasks; deterministic seeds; buoyancy/turbulence.

The current shader still consumes an eight-vec4 `CloudFeature` compatibility
projection. Both buffers are produced from the same compiled physical systems;
the camera-authored generator is no longer called. Shader migration consists
of binding the sixteen-vec4 ABI and replacing the fixed layer/slot traversal.

### Population evidence

- WMO defines total cover and genus/layer amount as the fraction of the whole
  visible sky, including perspective-visible gaps:
  <https://cloudatlas.wmo.int/en/total-cloud-cover-and-cloud-amount.html>.
- The WMO surface-observer definitions assume a ground observer and explicitly
  require perspective to be considered outside the standard identification
  conditions:
  <https://cloudatlas.wmo.int/en/observation-of-clouds-from-the-earths-surface.html>.
- Landsat observations find fair-cumulus nearest-neighbour spacing scales with
  effective radius by factors of roughly five to twenty, includes clumping at
  small scales, and reaches tens of kilometres for larger clouds:
  <https://ntrs.nasa.gov/citations/19900061594>.
- NASA's nominal tropospheric dimensions place cloud-street spacing around
  2–8 km and length around 20–500 km:
  <https://ntrs.nasa.gov/api/citations/19800019372/downloads/19800019372.pdf>.
- NOAA distinguishes isolated cumulonimbus from organized convective shields
  hundreds of kilometres across, so a storm cell and a mesoscale storm shield
  cannot share one fixed owner scale:
  <https://psl.noaa.gov/data/gridded/hrc/index.html>.

## 2. Shared renderer components

Every species recipe composes a small set of systems.

### Macro topology

1. Ice streamer field — finite sheared fibres, hooks, fallstreaks and dense ice
   patches.
2. Cellular cloudlet field — shallow connected or detached convection at
   cirro-, alto- and stratocumulus scales.
3. Layered veil — a continuous condensation interface with very-low-frequency
   thickness variation.
4. Wave lens train — terrain-relative laminar bodies with finite trains and
   stationary birth/death regions.
5. Castellated deck — a shared base with buoyant turrets.
6. Floccus field — detached tufts with dissipating bases and optional virga.
7. Boundary-layer fragment field — ragged advected material attached to an
   inversion or terrain moisture source.
8. Thermal field — connected buoyant parcel hierarchies with one condensation
   base per thermal.
9. Deep storm complex — inflow, tower, glaciation, precipitation and outflow
   owned by one storm system.
10. Roll tube — a finite horizontal rotating body with a physically continuous
    underside notch.

### Density and material operators

- Condensation support: a topology SDF or circulation potential defines a
  finite support band; a 3-D Perlin-Worley material field is thresholded
  through that band. The analytic primitive must not remain visible.
- Detail erosion: high-frequency Worley detail subtracts material only near
  the support boundary. It cannot create a detached second cloud field.
- Laminar interface: sheet and wave clouds use correlated condensation
  surfaces rather than stacks of ray-march slices.
- Fibrous advection: ice is stretched by wind and shear, then displaced by
  crystal fall speed; a painted 2-D ribbon is not acceptable.
- Phase transition: water material glaciates continuously with temperature and
  ascent, changing both morphology and optics.
- Precipitation extraction: condensate leaves source columns, falls at a
  hydrometeor-dependent velocity and evaporates through unsaturated air.
- Virga extraction uses a few irregularly clustered generating cells within
  the parent footprint. Each cell reconstructs several compact-C2,
  independently curved world-space trails: bulk slant comes from the ratio of
  wind to terminal velocity, while small differential offsets represent drop
  size sorting and turbulent deformation. The trails emerge continuously
  beneath cloud base, narrow with descent, and reach zero density and zero
  slope before the surface. A filled ellipse, evenly spaced picket fence,
  altitude-only opacity wave, rectangular cutoff, or screen-space fade is an
  invalid virga representation.
- Trace virga remains optically thin. Its concentration response is bounded to
  0.055–0.24 of the source DSD extinction and its generating-cell axes are
  4.5–13% of the finite parent axes; visibility comes from clustered overlap
  and directional atmosphere lighting, not from whitening a broad volume.
- Other falling hydrometeors use species topology inside the same physical
  source contract. Drizzle is a close population of fine, slow veils;
  stratiform rain is a set of overlapping elongated curtains; convective rain,
  hail and snow pellets are abrupt compact shower cores; individual snow
  crystals are sparse narrow trails; aggregate flakes have broader fluttering
  trajectories; snow grains retain drizzle-like continuity at low optical
  energy; and ice pellets occupy banded melt/refreeze paths. All topology is
  world-space, wind-slanted and compactly supported. These distinctions follow
  the WMO separation of uniform precipitation from abruptly varying convective
  showers and its particle-specific descriptions ([falling particles](https://cloudatlas.wmo.int/hydrometeors-falling-particles.html),
  [drizzle](https://cloudatlas.wmo.int/en/drizzle.html),
  [snow](https://cloudatlas.wmo.int/en/snow.html),
  [snow grains](https://cloudatlas.wmo.int/snow-grains.html),
  [snow pellets](https://cloudatlas.wmo.int/en/snow-pellets.html),
  [hail](https://cloudatlas.wmo.int/hail.html), and
  [ice pellets](https://cloudatlas.wmo.int/en/ice-pellets.html)).
- Surface suspensions are finite connected 3-D cell populations. Fog uses
  broad overlapping surface-rooted droplets and smooth domes; mist has thinner
  separated wisps; ice fog has connected minute-ice banks without halo glints;
  diamond dust is a sparse clear-air crystal population with orientation-aware
  source glint. None may use a constant-height opacity slab. Fog height and
  smoothness follow the WMO [fog](https://cloudatlas.wmo.int/en/fog-as-seen-from-aircraft.html)
  description; minute, irregular, non-halo ice-fog particles follow
  [ice fog](https://cloudatlas.wmo.int/ice-fog.html). Diamond-dust glint remains
  an energy redistribution through the normalized phase function, consistent
  with measured near-horizontal planar-crystal fall attitudes (Sassen 1980,
  [DOI 10.2151/jmsj1965.58.5_422](https://doi.org/10.2151/jmsj1965.58.5_422)).

### Organization operators

- Poisson/blue-noise population placement for independent elements.
- Correlated clustering for fair-weather fields and convective complexes.
- Anisotropic street and band alignment from wind/shear.
- Voronoi circulation for open/closed cells, with noise-warped physical
  boundaries rather than visible tessellation.
- Frontal shields with generated leading, trailing and lateral condensation
  boundaries.
- Wave trains tied to a stationary terrain-relative phase.
- Storm ownership linking tower, anvil, precipitation and accessory clouds.

## 3. Parameter ownership

Parameters are divided into six categories. A parameter must have exactly one
owner.

| Category | Examples | Owner |
| --- | --- | --- |
| Meteorology | altitude, depth, water path, ice path, vertical velocity | scene generation / external weather |
| Morphology | element scale, aspect, turret hierarchy, fibre length | species recipe plus meteorology |
| Material | support width, density threshold, erosion, phase transition | shared density operators |
| Organization | clustering, anisotropy, system size, cell topology | mesoscale organization |
| Derived render | extinction, phase function, effective particle radius | renderer, never a random preset |
| Editorial | physical system range and bearing | camera composition after validation |

The lab may expose all six categories, but production daily generation must not
randomize derived-render quantities independently of their physical inputs.

## 4. Invalid-state gates

- Translucidus and opacus cannot coexist.
- Deep anvils, incus and storm-owned outflow require a glaciating
  Cumulonimbus.
- Liquid low cloud cannot independently acquire ice-fibre morphology.
- Cirriform clouds cannot produce ground-reaching liquid precipitation.
- Nimbostratus cannot acquire detached thermal towers.
- Lenticularis and volutus require a coherent wave/roll frame, low turbulence
  at the laminar boundary, and a finite train or tube.
- Open-cell and closed-cell are alternative circulation states, not opacity
  masks applied simultaneously.
- Praecipitatio requires sufficient condensate, depth and a saturated path to
  the surface; virga requires evaporation before the surface.
- Special-origin and supplementary-feature genus associations follow the WMO
  tables in `cloud-state-map.ts`.
- Upper-atmosphere clouds occupy separate physical altitude regimes and cannot
  be packed into a tropospheric genus layer.

## 5. Incremental photorealism order

1. Make condensation support, detail erosion and scale hierarchy common to
   thermal, cellular, castellated, floccus and fragment families.
2. Replace cellular max-of-ovals with SDF cloudlet unions passed through that
   material system; certify Cc, Ac and Sc at their own physical scales.
3. Replace stratiform shell gradients with generated top/base interfaces and
   optical-depth variation; certify Cs, As, Ns and St.
4. Rebuild cirrus as curved 3-D fibre bundles with crystal fallstreak material;
   certify all five species and intortus/vertebratus/radiatus.
5. Couple wave lenses and rolls to stationary world-space wave phase and
   realistic finite formation zones.
6. Rebuild deep convection as a storm-owned multiscale system with continuous
   glaciation, anvil outflow and source-coupled precipitation.
7. Add varieties, supplementary features, accessory clouds, mother-cloud
   transitions and special-origin states through the same components.
8. Qualify multi-layer scenes, all light regimes and all camera perspectives;
   optimize only after the visual/physical gates pass.

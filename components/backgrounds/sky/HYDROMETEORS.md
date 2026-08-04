# Hydrometeor and surface-meteor subsystem

This subsystem turns finite cloud or boundary-layer systems into world-space
hydrometeor fields. It never accepts a global rain overlay. Rain shafts, virga,
snow curtains, and hail retain their cloud-system owner; clear-air ice fog and
diamond dust retain an explicit finite boundary-region owner.

## Executable state

`createHydrometeorRuntime(sources, environment)` supports physically distinct:

- drizzle, stratiform rain, and convective rain showers;
- pristine snow crystals and aggregate snowflakes;
- hail, ice pellets, snow grains, and snow pellets/graupel;
- liquid and ice virga;
- fog, mist, ice fog, and diamond dust.

The result is deterministic and bounded to 96 records. Each record owns a
finite harmonic ellipse, altitude range, gamma particle-size distribution,
terminal velocity, phase path, sub-cloud evaporation/sublimation, wind,
turbulence, particle habit, morphology, optics, and lighting response.
Extraction radii remain within the parent cloud at cloud base; wind can advect
falling particles outside the parent footprint below it. Convective showers
use compact downshear patches, downward broadening, and stronger temporal
intermittency; stratiform precipitation remains a coherent curtain. These are
world-space density changes, not screen masks.

### Horizontal-angle ABI

Hydrometeor geometry and wind use the cloud runtime's Earth-local east-angle
contract end to end. An angle of zero points along `+east`; positive angles
increase toward `+north`; and a direction vector is
`[east, north] = [cos(theta), sin(theta)]`. The parent major axis is that same
vector and its right-handed cross axis is `[-sin(theta), cos(theta)]`. CPU
placement, CPU sampling, packed wind vectors, and the WGSL evaluator all use
these bases. Camera-world embedding rotates centers and subtracts the camera
yaw from these angles, so a precipitating parent and its hydrometeors remain a
single rigid world-space system under camera yaw.

The optional fourth runtime argument is `HydrometeorSceneOverrides` (the third
remains buffer capacity). `resolveWeatherQualificationCase().hydrometeors`
already emits this exact payload, so production and Sky Lab only need to carry
it through `SkyPreview` and pass it to the runtime call.

`HYDROMETEOR_ALLOWED_GENERA` enforces WMO Cloud Atlas associations. Drizzle
belongs to Stratus; uniform rain to Altostratus/Nimbostratus/Stratocumulus;
showers to Cumulus/Cumulonimbus; snow grains to Stratus; snow pellets to
Stratocumulus/Cumulus/Cumulonimbus; hail to Cumulonimbus; and ice pellets to
Altostratus/Nimbostratus. Invalid overrides produce a diagnostic and no field.

## Deep-convection source topology

Cumulonimbus is resolved through the shared deep-convection physical
foundation instead of the generic shower splitter. The runtime derives the
actual cloud base, top, freezing level, environmental humidity, precipitation
efficiency, vertical velocity, shear, lifecycle, organization, and finite
world-space owner before creating any falling population. This implements the
meteorological constraint that a mature thunderstorm contains coexisting
updraft and precipitation-driven downdraft, with outflow organized by a cold
pool and gust front, rather than treating severe weather as a brighter generic
curtain. The source constraints follow the [NOAA/NWS thunderstorm lifecycle](https://www.weather.gov/jetstream/life-cycle)
and the [WMO Cumulonimbus description](https://cloudatlas.wmo.int/en/cumulonimbus-cb.html).

The physically eligible populations are lifecycle- and environment-dependent:

- rain originates in the finite precipitation-loading core, offset downshear
  from the rain-free updraft;
- hail and graupel originate in finite, distinct mixed-phase loading regions
  only while vertical support and collision growth are active;
- snow is admitted only when the column and surface phase path support it;
- virga remains attached below its owner and ends aloft when the dry sub-cloud
  layer removes the population;
- developing storms emit no mature precipitation source, and decaying storms
  cannot continue manufacturing hail or graupel.

Supercell, multicell-cluster, squall-line, and pulse organization each alter
source count, downshear displacement, curvature, intermittency, cold-pool
coupling, and gust-front response. The generated population centers are
irregular clusters within the parent ellipse—not a picket grid—and their
combined mass flux is normalized back to the source precipitation rate. Each
population retains its phase and distinct particle habit, size spectrum,
terminal velocity, melting or evaporation path, optics, and surface survival.

This extension preserves the packed 16-vector ABI. `identity.x == 1` remains a
legacy/non-Cumulonimbus active field; `identity.x == 2` marks a storm-owned
topology. The WGSL evaluator gates every new shear, activation, curvature, and
overlap term behind that marker, so non-Cumulonimbus fields retain the prior
CPU records and packed bytes exactly.

Electrical topology is intentionally separate in
`deep-convection-electrical.ts`. It resolves finite positive and negative
charge reservoirs, storm-bounded intra-cloud/cloud-to-ground path candidates,
and a bounded volume-illumination envelope. It emits no hydrometeor density,
authored opacity, screen flash, or full-canvas exposure. A future lightning
radiance pass must consume that descriptor and solve the optical coupling
through the cloud and atmosphere.

## Microphysics and phase

All falling populations use numerically integrated bounded gamma spectra. The
normalization conserves the exact source mass flux (`rate / 3600 kg m^-2 s^-1`).
Rain uses a bounded measured velocity curve; pristine crystals, aggregates,
snow grains, graupel, dense ice pellets, and hail have separate size, density,
projected-area, and terminal-velocity regimes. Integrated area with physical
extinction efficiency produces `km^-1` extinction instead of arbitrary opacity.

`HYDROMETEOR_SPECIES_MICROPHYSICS` is the executable qualification envelope
for every rendered kind. In particular, drizzle is truncated at the WMO
0.5 mm boundary; snow grains remain below 1 mm; snow pellets and dense ice
pellets remain below 5 mm; hail occupies the ordinary WMO 5–50 mm regime; ice
fog occupies 2–30 micrometres; and the represented diamond-dust plates occupy
30–200 micrometres. Exceptional giant hail is intentionally outside this
bounded renderer state instead of being silently squeezed into an ordinary
hail field.

`createHydrometeorOptics()` derives RGB extinction, scattering albedo, and
habit/size-dependent phase asymmetry. The RGB lanes represent 680/550/440 nm.
Visible extinction continuously approaches neutral geometric optics as size
increases, so rain and hail do not acquire an implausible tint; the small
particle spectra retain only the weak wavelength dependence needed for fog,
ice fog, and crystal populations. Absorption stays in the RGB albedo rather
than an authored overlay. Every channel preserves `sigma_s <= sigma_t`.

Liquid-drop shape is also size-aware. Drops at and below 0.5 mm are spherical;
larger rain and liquid virga use the Pruppacher–Beard wind-tunnel relation
`b/a = 1.03 - 0.062 D_mm`, bounded before packing. This replaces one constant
oblate stamp for every rain rate while leaving a future sparse mesh free to
represent the Beard–Chuang flattened lower pole.

Fog, mist, ice fog, and diamond dust have separate suspended spectra and
liquid/ice water contents. Explicit meteorological visibility constrains the
regional field with `beta_ext = 3.912 / MOR`: fog and ice fog stay below one
kilometre; mist and diamond dust stay at or above it. Ice fog additionally
requires high humidity and temperatures no warmer than 243.15 K; diamond dust
requires humid air no warmer than 263.15 K.

Sub-cloud loss follows a ventilated D-squared evaporation/sublimation model.
Snow and hail melt over finite warm depth. Ice pellets encode their distinct
elevated melting layer followed by a sub-freezing surface refreeze layer. Every
record names a habit (`rain-drop`, `pristine-crystal`, `aggregate-flake`,
`hailstone`, `ice-pellet`, `snow-grain`, `graupel`, `fog-droplet`,
`ice-fog-crystal`, or `diamond-plate`) and supplies aspect ratio, orientation
dispersion, roughness, flutter, and resolvable distance.

Physical qualification happens before field creation. The runtime rejects
over-rate “drizzle,” ice pellets without both an elevated warm nose and a cold
surface refreeze layer, warm-surface snow grains, hail without an active cold
Cumulonimbus updraft, and Cumulonimbus graupel outside its active mixed-phase
collision stages. Fog versus mist is determined by meteorological optical
range, not the authored density scalar: fog must be below 1 km and mist at or
above 1 km. Invalid combinations produce explicit diagnostics and no packed
record.

The physical basis includes the [WMO Cloud Atlas falling-particle
classification](https://cloudatlas.wmo.int/hydrometeors-falling-particles.html),
[WMO cloud/hydrometeor associations](https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html),
[Li and Srivastava evaporation](https://doi.org/10.1175/1520-0450(2001)040%3C1607:AASFRE%3E2.0.CO;2),
measured [snow terminal velocity](https://doi.org/10.1002/qj.49708034404),
[Gunn and Kinzer liquid-drop fall speeds](https://doi.org/10.1175/1520-0469(1949)006%3C0243:TTVOFF%3E2.0.CO;2),
[Beard and Chuang equilibrium drop shape](https://doi.org/10.1175/1520-0469(1987)044%3C1509:ANMFTE%3E2.0.CO;2),
[Mitchell and Heymsfield aggregate fall speeds](https://doi.org/10.1175/JAS3413.1),
and the [NASA ice single-scattering database](https://ntrs.nasa.gov/citations/20150020819).

## GPU and lighting contract

`hydrometeor-wgsl.ts` emits the storage declaration, a world-space evaluator,
the bounded accumulator, and `hydrometeor_near_particle_appearance`. The
evaluator returns physical coefficients, never an authored color:

- `extinction_rgb_km`, `scattering_albedo_rgb`, `asymmetry`;
- `liquid_fraction`, `source_weight`;
- `volumetric_energy_fraction`, `sparse_particle_energy_fraction`;
- `direct_irradiance_weight`, `diffuse_irradiance_weight`;
- `source_glint_strength`, `multiple_scattering_boost`.

All four `lighting_response` lanes are bounded fractions. The ABI name
`multiple_scattering_boost` is retained, but its value is a fraction of the
normalized first-order phase redistributed into a broader normalized order; it
is not a radiance multiplier. Likewise, glint is a convex phase-function
mixture, not a new light. This follows PBRT's requirement that a physical phase
function have unit spherical integral and the unified extinction strategy of
[Frostbite's physically based volumetric
framework](https://www.ea.com/news/physically-based-unified-volumetric-rendering-in-frostbite?isLocalized=true).

## Passive RGB event radiometry

`hydrometeor-system.ts` contains the analytic CPU reference and
`hydrometeor-wgsl.ts` contains the matching record-local GPU contract. Both
implement the same homogeneous-segment equation. For overlapping record `i`:

```text
sigma_t = sum(sigma_t_i)
q       = sum(sigma_t_i * omega_i * angular_incident_radiance_i)
L_step  = (q / sigma_t) * (1 - exp(-sigma_t * ds))
T_step  = exp(-sigma_t * ds)
```

Every operation is RGB. `q` is accumulated before division, so a spectrally
different dense field cannot borrow another field's albedo, phase response, or
parent illumination. The whole overlap consumes one extinction event; direct
Sun/Moon, parent-scattered source energy, diffuse sky, and reflected ground are
terms in the one source function rather than separately composited opacity
layers.

The CPU references are:

- `createHydrometeorPassiveRgbTransfer`: enforces `T + S_receiver <= 1` in
  every RGB channel;
- `hydrometeorSpectralBeerTransmittance`: exact spectral Beer transport;
- `hydrometeorPassiveDirectionalPhase`: convex normalized HG, glint, and broad
  higher-order phase mixture;
- `integrateHydrometeorPassiveSegmentReference`: exact overlap and camera
  transmittance reference with strict parent ownership.

The irradiance input type deliberately spells out
`atmosphereAttenuatedSunIrradianceRgb` and
`atmosphereAttenuatedMoonIrradianceRgb`. These are local values after the
TOA-to-sample atmosphere path. The hydrometeor event must not apply that path a
second time. Sky and ground inputs are separate local hemispheric irradiances;
the helper converts them to radiance with `/ pi` exactly once and uses explicit
upper/lower phase integrals. Zero incident source produces zero radiance while
retaining Beer extinction.

Parent coupling carries mutually exclusive direct transmittance and energy
scattered toward the receiving angular domain. Cloud-owned precipitation and
virga require an exact `(parentSystemId, parentSystemIndex, parentLayerIndex,
ownerKind)` CPU join. The unchanged GPU ABI carries the exact system/layer pair
in `identity.z` and `energy_and_importance.w`; boundary-layer fog and diamond
dust retain `(-1, -1)` plus their finite record geometry and CPU region owner.
A mismatched GPU coupling still extinguishes light but contributes no source
radiance, preventing a dark shaft from borrowing a neighboring cloud's Sun or
Moon visibility.

### Central shader integration hooks

The storage ABI remains 16 vec4s. In the existing record loop, integration must
remain record-local through these exact calls:

1. Evaluate `hydrometeor_sample_record(record, point, distance, time)`.
2. Construct `HydrometeorLocalIrradianceAtSample` from the renderer's already
   atmosphere-attenuated Sun/Moon irradiance and local sky/ground irradiance.
3. Resolve `HydrometeorParentLightCoupling` for that record's exact
   `identity.z` / `energy_and_importance.w` owner. Do not use a dominant owner
   chosen after optical averaging. For a cloud owner, the existing exact query
   is `cloud_lv_sample_owner_direct_transmittance(point, owner, source)`; the
   global coupling-cascade query also contains unrelated clouds and is not a
   substitute for parent inheritance. The light-volume owner scattering query
   returns radiance rather than a dimensionless transfer fraction, so it must
   be supplied as `phase_convolved_scattering_radiance_rgb`; it must never be
   packed into `scattered_toward_receiver_rgb`. Keep the Sun/Moon scattered
   transfer lanes zero when the resolved radiance path is used.
4. Call `hydrometeor_resolve_passive_source_coefficient(...)` and accumulate
   its result with `hydrometeor_accumulate_passive_overlap(...)`.
5. After every overlapping record has contributed, call
   `hydrometeor_integrate_passive_overlap(overlap, step_km)` exactly once.
6. Composite `camera_T * segment.radiance_rgb`, then multiply `camera_T` by
   `segment.transmittance_rgb`.

The older additive `hydrometeor_multiple_scattering` / independently added
diffuse-source path must not be applied in addition to this hook. It would
spend the same scattering coefficient twice. Velocity, dominant owner metadata,
and adaptive step selection remain orthogonal reductions over the same
record-local samples.

This source-coefficient formulation is the deterministic discrete form of the
[PBRT equation of
transfer](https://pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer):
the source function adds in-scattering at a point and camera transmittance
attenuates that contribution once. Source/view-dependent near-rain appearance
continues to follow Garg and Nayar's measured [rain-streak photometric
model](https://www1.cs.columbia.edu/CAVE/publications/pdfs/Garg_TOG06.pdf);
its streak database or future sparse draw must replace the allocated sparse
fraction, never add another energy path.

The hydrometeor marcher consumes all sixteen vectors. Its unified experimental
cloud entry intersects each record's curved-Earth altitude shell with a
conservative world-space box enclosing the complete wind-swept harmonic
ellipse. The march jumps across empty distance and stops exactly at record
boundaries. Inside an active interval it uses blue-noise-stratified steps no
larger than one eighth of the narrowest ray-projected vertical or horizontal
feature, clamped between 1 m and 250 m. This replaces the former twelve samples
over a fixed 24 km ray: 10–100 m fog and ice-fog banks, narrow virga, and
compact rain shafts cannot be skipped merely because they fall between coarse
global samples. Production evaluates this field through the bounded
`hydrometeor_fragment_physical` entry. It rescans finite support events without
private interval tables, co-integrates local air, and publishes one affine RGB
packet for depth ordering with the three cloud layers and upper media.

Overlapping records retain separate source coefficients until their one Beer
event is integrated. Each record uses the renderer's atmosphere-filtered Sun
and Moon irradiance, diffuse sky and ground irradiance, its exact parent
transfer, and a convex mixture of normalized Henyey–Greenstein and
spherical-Gaussian phase functions. The latter gives aligned ice crystals and
rain streaks a source-linked forward response without inventing energy or a
screen-space spark. Finite atmosphere is applied from the segment's weighted
world point to the camera. Hydrometeor and cloud transports are gathered first
and inserted by their first interaction depth, so a distant shaft can lie
behind a nearer cloud while precipitation below its parent remains in front.

This bounded-event strategy follows the finite-medium/majorant-segment model in
[PBRT's volume-scattering implementation](https://pbr-book.org/4ed/Volume_Scattering/Media),
while the source-dependent rain response follows Garg and Nayar's measured
[photometric rain-streak model](https://www1.cs.columbia.edu/CAVE/publications/pdfs/Garg_TOG06.pdf).
The narrow ice response is constrained by measured halo/aureole scattering,
including Borovoi and Kustova's
[modified Kirchhoff approximation](https://doi.org/10.1364/OL.36.002271), and
not treated as generic bloom.

The packed header is `[count, 16, capacity, dropped]`. Vectors 0–11 preserve
the prior ABI. Append-only vectors are:

- 12 `morphology`: bottom radius scale, vertical modulation, intermittency,
  clustering;
- 13 `particle_shape`: habit code, aspect ratio, orientation dispersion,
  surface roughness;
- 14 `lighting_response`: direct response, diffuse response, normalized source
  glint fraction, normalized broad-order redistribution fraction;
- 15 `phase_path`: warm-layer bottom/top, refreezing depth, phase-path code.

## Sparse near-particle transition

The CPU and WGSL near-particle evaluators return a deterministic sampled
diameter, habit, exposure track, orientation, fall/wind velocity, optical
energy, and source-glint weight only inside the resolvable distance. Rain
appearance should retain the light/view dependence measured by [Garg and
Nayar](https://www1.cs.columbia.edu/CAVE/publications/pdfs/Garg_TOG06.pdf).

No sparse draw is currently bound. Therefore volume extinction deliberately
retains full energy today. The current appearance contract describes particle
size, track, orientation, velocity, and optical energy, but it does not yet
generate a stable world-space particle set or its exact per-pixel raster
coverage. Subtracting `sparse_particle_energy_fraction` before that coverage is
known would dim the medium unpredictably. When a sparse pass is enabled, the
host must generate deterministic particles, normalize their resolved raster
coverage, multiply volume extinction by `volumetric_energy_fraction`, and draw
exactly `sparse_particle_energy_fraction`; the two sum to one, avoiding a
brightness pop or near-field energy loss.

## Production authoring hookup

`SkyPreviewOptions.hydrometeors` is forwarded unchanged through
`SkyRadianceScene`, included in background, cloud-history, and hydrometeor
invalidation keys, and passed as runtime argument four. The renderer uploads
the expanded buffer automatically because its allocation imports
`HYDROMETEOR_VEC4_STRIDE`. The override carries:

- per-cloud `precipitationKindOverride` for ice pellets, snow grains, or snow
  pellets (the core kinds already cover rain, drizzle, showers, snow, hail, and
  virga);
- `surfaceVisibilityKm`, `surfacePhenomenon`, and optional `surfaceRegion`;
- `warmLayerBottomKm`, `warmLayerTopKm`, `warmLayerTemperatureKelvin`, and
  `surfaceColdLayerDepthKm`.

It also carries exact boundary-layer temperature, humidity, pressure, and wind
when a qualification case must not use the daily defaults. The unlisted Sky Lab
exposes every precipitation/surface-obscuration matrix target plus each valid
environment and perspective in arrow-steppable selectors. Its compact quick
presets expose each of the fifteen rendered families. Query serialization
retains both selection paths.

Current `CloudScene` morphology has one owner per altitude layer and does not
yet carry canonical `CloudClassification` objects. Therefore the authoring
override is intentionally keyed by `layerIndex`; the WMO validation still runs
against each compiled runtime owner. The final join point, once persistent
multiple systems/classifications are exposed above the canvas, is to replace
or augment that key with `parentSystemId`. No shader or microphysics ABI change
is required.

The cloud transport radiance code consumes the four lighting-response members
and exports hydrometeor mean/first depth, velocity, and owning layer into the
same temporal G-buffer used by clouds. A later sparse pass must call the
near-particle contract, depth-test against scene/cloud transmittance, and apply
the shared energy partition.

Terrain collision, splash, wet surfaces, accumulation, lightning, rainbows,
aurora, and tornado debris remain separate scene systems. Wind-raised snow,
dust, and qualified resuspended volcanic ash retain separate finite boundary
owners but expose the same ordered passive-medium coefficient shape.

The deep-convection hydrometeor sources are production-bound through the
existing packed volume evaluator. Remaining integration work is deliberately
separate: there is no stable sparse near-particle draw yet; the electrical
descriptor is not connected to a bolt/channel or radiance pass; and terrain
impact, splashes, wetness, accumulation, and debris are not modeled. The CPU
provenance record carries source-region and attachment-path semantics, while
the current GPU ABI carries only the resolved geometry, motion, phase, particle,
morphology, and optical consequences needed by the volume evaluator.

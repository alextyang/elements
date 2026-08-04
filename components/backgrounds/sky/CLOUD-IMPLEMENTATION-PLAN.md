# Cloud system completion plan

This document is the authoritative specification and delivery plan for the
Elements cloud system. `CLOUDS.md` describes the renderer that exists today,
`RENDERING.md` describes the shared sky architecture, and `BENCHMARK.md`
describes validation. When those documents describe an aspiration as if it is
already implemented, this plan's current-state and exit-gate tables take
precedence.

## Product outcome

The finished cloud system is a production-safe, atmosphere-coupled renderer
that preserves the full expressive palette range of Elements while making each
result believable as a real sky. Artistic emphasis may increase vibrancy,
legibility, or the visibility of a physically present phenomenon, but may not
invent contradictory illumination, cloud morphology, scale, or weather.

It must provide:

1. Photographic macrostructure, internal depth, edge structure, atmospheric
   fading, illumination, and motion without recognizable procedural artifacts.
2. The ten WMO genera, important visually distinct species and lifecycle
   stages, 0-8 oktas, plausible multi-layer combinations, fog, mist, virga,
   precipitation, deep convection, anvils, and rare noctilucent displays.
3. One scene-linear HDR composition for atmosphere, Sun, Moon, stars, clouds,
   fog, horizon, and aerial perspective, followed by one display transform.
4. Lighting driven by the real Sun and Moon directions and the same atmospheric
   transport used to render the surrounding sky.
5. Deterministic daily variety with continuously evolving, independently moving
   layers. No visible state may be a static stamp or a simply translated noise
   texture.
6. WebGPU as the production implementation, with the exact longest-lived
   deployed no-cloud sky as the emergency/accessibility fallback. WebGL2 is a
   diagnostic backend, not a second cloud implementation.
7. Background-appropriate GPU, memory, scheduling, and thermal behavior. The
   renderer must never freeze interaction or sustain unbounded GPU duty.
8. Completion evidence from real photographs, automated visual and state tests,
   shader validation, device-loss testing, and multi-device performance soaks.

This is a renderer for plausible or observed weather, not a computational fluid
dynamics forecast. `CloudScene` must accept real meteorological inputs when
available and generate correlated plausible conditions when they are not.

## Non-negotiable rendering invariants

- All physical scene elements share one camera, world coordinate system, light
  directions, exposure, and scene-linear color space.
- Clouds output in-scattered radiance and transmittance. Composition is
  `L_cloud + T_cloud * L_background`; ordinary alpha blending is not accepted.
- Cloud history never contains tone-mapped color.
- Astronomy controls source position and energy. Screen-space placement cannot
  replace the real Sun/Moon directions.
- Meteorological constraints run before rendering; shaders do not repair an
  invalid weather state through arbitrary visual clamps.
- Performance is obtained through conservative skipping, cached lighting,
  reconstruction, and bounded scheduling—not unchecked reductions in physical
  correctness or a brute-force full-window march.
- Spatial quality is preserved before cadence is reduced under load. Unsafe
  workloads fall back rather than monopolize the machine.
- No copied Apple, game, or shader-pack assets or source are used. External
  implementations are visual and architectural references only.

## Delivered production state

The current implementation provides the completed integrated WebGPU path:

- three curved Earth-relative cloud shells and all ten WMO genus labels;
- constrained layer altitude, coverage, extinction, wind, shear, phase,
  precipitation, fog, and noctilucent state;
- original periodic base/detail volumes and a precomputed weather texture;
- cloud radiance/transmittance, mean apparent depth, dominant-layer velocity,
  elementary solar/lunar shadowing, approximate phase lobes, and temporal
  history;
- automatic production WebGPU, Sky Lab controls, timestamp-query support,
  adaptive cadence, hidden-tab suspension, and unsafe-frame fallback.

The implementation uses constrained daily organization and lifecycle,
genus-specific three-dimensional morphology, analytic stratiform integration,
atmosphere-derived irradiance, cached Sun/Moon optical depth, finite-path aerial
perspective, precipitation tied to its parent source column, and camera-aware
temporal convergence. WebGPU failure does not generate assets or start another
expensive renderer: it immediately displays the legacy sky.

WebGPU now owns atmosphere, wrapped edge coloration, horizon transport, fog,
cloud transport, Moon, stars, stellar PSF, aerial perspective, dither, and the
single display transform in one canvas graph. It has no post-display DOM sky
overlays. Low, middle, and high layers use correlated but distinct weather
fields and independent winds; their curl/turbulence channels are consumed by
density deformation.

The production profiles use 24/48/62 percent cloud-buffer resolution and 1/2/4
Hz transport for battery/balanced/high modes. Clear scenes skip cloud interval,
lighting, and transport work completely.

## Execution checkpoint — 2026-07-25

The repository now has an isolated production-build and full-page validation
path in addition to the standalone WebGPU compiler harness. The source checkout
can have partially hydrated `node_modules` under macOS file-provider storage, so
the reproducible gate copies source/assets into a temporary clean checkout,
runs `npm ci`, builds with the bundled Node runtime and Turbopack, and serves the
optimized result. The build currently compiles, typechecks, prerenders all eight
pages, and exercises `/sky-lab` on a real WebGPU adapter.

Verified implementation milestones:

- all eight WGSL modules, thirteen production pipeline variants, exact bind
  groups, conservative hierarchy uploads, and the submitted production pass
  graph validate on real WebGPU;
- the graph includes interval, per-layer lighting, transport, persistent
  temporal feedback, atmosphere-derived irradiance, stellar PSF, and the single
  display transform;
- cloud-scene discontinuities now invalidate every temporal buffer, fixing a
  full-page preset-change failure that accumulated an opaque stale sky;
- timestamp-query telemetry separates interval, lighting, and transport costs;
- transport reuses packed weather/base channels instead of evaluating six
  redundant analytic fBm octaves per primary sample;
- spatial wavelengths are now genus-specific in kilometres rather than shared
  by altitude tier, and sparse density uses one matched synoptic/cellular
  statistic in both the interval bound and transport evaluation.

Measured on the current 1932×1087 test viewport with a 618×348 balanced cloud
buffer, 18 primary steps, 3 light steps, 2 Hz transport, and checkerboard
updates, the pre-calibration fair-cumulus soak reported approximately 0.07 ms
interval, 0.39 ms lighting, and 1.57–2.56 ms transport, with an observed 5.37 ms
p95 and 100% requested cadence. These are useful local measurements, not device
qualification.

The renderer now measures solid-angle-weighted mean opacity, visible footprint,
accepted interval fraction, and mean density evaluations directly from the
persistent cloud G-buffer with a bounded 64x36 GPU reduction. The first
deterministic fair-cumulus sweep
produced this measured curve after correcting the three-dimensional
coverage-to-density transfer:

| Oktas | Target fraction | Mean opacity | Visible footprint (opacity >= 0.02) | Accepted intervals |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 0.0% | 0.0% | 0.0% | 0.0% |
| 1 | 12.5% | 10.0% | 22.4% | 96.0% |
| 2 | 25.0% | 20.5% | 41.4% | 96.0% |
| 3 | 37.5% | 36.0% | 59.9% | 96.0% |
| 4 | 50.0% | 50.3% | 75.5% | 96.0% |
| 5 | 62.5% | 61.9% | 84.6% | 96.0% |
| 6 | 75.0% | 72.4% | 91.2% | 96.0% |
| 7 | 87.5% | 79.9% | 94.7% | 96.0% |
| 8 | 100.0% | 83.9% | 95.2% | 96.0% |

This resolves the previous 3/8 mean-opacity under-fill for that seed, but does
not close the coverage gate. The two diagnostics expose the remaining defects:
soft low-opacity material covers too much of the dome at sparse/mid cover, and
the separate weather/base maximum bounds accept almost the complete shell for
every nonzero cover. An eight-segment interval classifier and a per-sample
local base bound were tested and removed: acceptance remained 96%, interval
cost rose from about 0.07 ms to 0.26 ms, and transport rose to about 3.4 ms.
A subsequent joint per-layer 64x32x64 sampled macro-density volume, seven-level
maximum pyramid, and eight-segment classifier also failed its gate. Per-sample
use reduced 3/8 mean opacity from roughly 36% to 20% and raised measured total
cloud cost to 3.74 ms. Interval-only use still reduced opacity to roughly 31%,
raised total cost to 4.26 ms, and left accepted sky at 96%. Both runtime paths
were removed. This proves that center-sampled volume maxima plus one contiguous
ray interval are neither conservative enough nor selective enough here.

The next prototype used conservative weather and base maxima over four nominal
primary steps and skipped only blocks whose combined upper bound stayed below
the exact density threshold. It preserved the 3/8 image within measurement
noise, but reduced mean density evaluations only from 8.7 to 7.9 while raising
the same production run from 1.51/1.90 ms p50/p95 to 2.49/3.08 ms. The two
hierarchy lookups cost more than the approximately nine-percent sample saving,
so that runtime path and its diagnostic toggle were removed as well.

The next accelerator may not repeat either rejected access pattern. It must
amortize traversal through a jointly conservative structure generated from the
actual density basis, return multiple occupied ray segments, or fuse occupancy
classification with work the renderer already performs. A true cell/DDA or
brick traversal remains viable only if it demonstrates substantially fewer
density evaluations without per-step multi-texture overhead. The exact shell
march remains the correctness and performance reference. Multi-seed/genus/
elevation/aspect-ratio photographic calibration informed the later morphology
and horizon integration work. Production `auto` now selects WebGPU.

## Architecture-review reconciliation — 2026-07-26

The three completed reviews (macro-surface morphology, renderer implementation,
and Oracle ontology/architecture) are now part of this authoritative plan. No
Oracle response is outstanding. A browser timeout hid the completed response;
the saved transcript was recovered and reviewed in full.

Implemented from the reviews:

- canonical WMO genus/species, variety, supplementary-feature, accessory,
  origin, lifecycle, precipitation, physical-unit, extent, and discriminated
  organization state;
- one compositional recipe for every official genus/species combination plus
  compatibility adapters for the three historical compound renderer IDs;
- a non-mutating `validateCloudSystem()` and camera-independent
  `compileCloudSystem()` boundary with named geometry, material, organization,
  lifecycle, precipitation, and feature outputs;
- benchmark classifications without unchecked species casts, with one stable
  morphology seed per photographic reference across every lighting/camera case;
- common bounded-support condensation material for cellular and convective
  geometry rather than direct scalar ellipsoid density;
- correction of cross-channel weather moisture, sheet-profile clipping of
  analytic families, detached Cirrus features, Cumulonimbus calvus anvil
  clipping, the four-step lighting-loop ceiling, and density-only mean-depth
  weighting.

Active architecture work, in this order:

1. Replace scalar macro SDF handoff with a shared `GeometrySample` carrying
   signed distance, closest surface, feature scale, curvature/seam estimates,
   and support clearance. Boundary displacement becomes closest-surface,
   feature-relative, tangent-space, slope-limited, and footprint filtered.
2. Convert wave lenses, rolls, cirrus bundles, cellular fields, storm anvils,
   and accessory clouds to geometry → shared material → optics. No analytic
   primitive may directly become final density.
3. Compile persistent whole-cloud owners and feature graphs into sparse spatial
   bins. Use clustered/Poisson owners, aperiodic cellular tessellation, finite
   streets/bands/wave packets, and front coordinates; wrapped textures remain
   microstructure only.
4. Remove cloud-only camera warps and post-render framing from production.
   Editorial composition must be solved once as immutable world placement; the
   old layered/edge-framed modes remain diagnostic comparisons only.
5. Separate footprint, local cloud fraction, condensate and optical thickness;
   add projected-coverage calibration and WMO angular-size gates for Cc/Ac/Sc.
6. Replace genus brightness constants and the two-point source cache with
   condensate-derived optics, atmosphere SH irradiance, system-local multi-depth
   source visibility, owner-aware inter-system shadowing, and typed precipitation.
7. Add constrained lifecycle topology, attached incus/mamma/pileus/velum/pannus/
   arcus/cavum and hydrometeor ownership, then qualify all varieties, origins,
   multi-system scenes, and time series.

Performance tuning remains intentionally after visual correctness for this
increment, but the architecture may not introduce fixed three-layer ownership,
camera-dependent cloud state, periodic macro ownership, anonymous new packing,
or ownerless features because each would block later acceleration.

## Completion gates

The system is complete only when all gates below pass.

### Visual and physical gates

- Every supported genus and species is distinguishable by geometry and motion,
  not by a palette label.
- The photographic matrix covers every genus, important species, 0-8 oktas,
  representative multi-layer combinations, front/side/back light, twilight,
  moonlight, overcast, fog, and precipitation.
- No repeated noise, rigid sheet motion, boiling, history trail, hard shell
  boundary, gradient stop, halo stamp, circular mist artifact, unattenuated
  celestial body, or implausible lighting survives review.
- Clouds naturally inherit horizon extinction, twilight color, surrounding sky
  irradiance, ground bounce, inter-layer shadows, and moonlight.

### Performance and reliability gates

- The intended optimized balanced target is a cloud transport cost near 2 ms on
  the reference integrated GPU, with a measured and documented p50/p95 for every
  tier. A device qualifies from measurements, not its name.
- The optimized target is approximately 50-60 percent linear cloud resolution
  reconstructed from 12-20 Hz transport where hardware permits. Lower tiers may
  reduce cadence and cache resolution while preserving coherent morphology.
- Warmed rendering has no pipeline-compilation or resource-allocation spike.
- A single transport sample above 80 ms or two consecutive samples above 32 ms
  remains a hard fallback condition; these are safety limits, not passing
  performance.
- Hidden and paused skies submit no work. Resize, remount, device loss, offline
  assets, and long sessions do not leak or repeatedly recreate GPU resources.
- Cool-start, five-minute, and extended soaks on representative integrated and
  discrete GPUs show no freezing, input latency, or escalating energy impact.

### Compatibility and rollout gates

- Qualified WebGPU devices use the volumetric renderer automatically.
- WebGL2 preserves the same `CloudScene`, morphology families, lighting order,
  celestial attenuation, motion, and final color pipeline with documented,
  bounded reductions in samples and cache resolution.
- CSS is used only when neither GPU path is safe or when accessibility/reduced
  motion explicitly requires it.
- A feature flag, runtime fallback, and observable error/performance telemetry
  exist throughout rollout.

## Ordered implementation program

Each phase has an exit gate. Later fidelity work may be prototyped in Sky Lab,
but it cannot be considered integrated until the earlier dependency gates pass.

### Phase 0 — Baseline, truthful documentation, and observability

Work:

- preserve reference URLs/screenshots and record output/cloud resolution,
  quality tier, current/p50/p95 cloud GPU time, CPU submission, memory estimate,
  cadence scale, sample counts, timing source, history state, and fallback cause;
- make telemetry machine-readable from Sky Lab for browser automation;
- distinguish implemented, approximate, planned, and production-disabled
  features in documentation;
- add deterministic state-model tests for every constraint currently enforced.
- report solid-angle-weighted density evaluations from the cloud G-buffer so
  empty-space prototypes can be accepted or rejected by actual work removed.

Exit gate: every performance or visual change can be compared with a
reproducible scenario and the diagnostics report the actual workload.

### Phase 1 — Definitive HDR graph and cloud G-buffer

Work:

- move edge wrap, horizon volume, mist, low atmosphere, and grain to physically
  appropriate points in the scene-linear graph;
- define cloud outputs for radiance, transmittance, first significant depth,
  opacity-weighted mean depth, layer-weighted velocity, dominant layer,
  optical-depth change, and reconstruction confidence;
- remove duplicate tone mapping and post-display color effects.

Exit gate: WebGPU renders the entire visual sky without DOM atmosphere/cloud
overlays and correctly attenuates the Moon, stars, glow, and lower layers.

### Phase 2 — Density acceleration and bounded scheduling

Work:

- prototype a jointly conservative occupied-brick representation or fused
  coverage/height classifier before base/detail density evaluation;
- emit multiple occupied ray segments or traverse bricks with an amortized DDA;
  adapt steps by distance/density, terminate opaque rays, and avoid light
  marches for negligible source energy;
- add spatiotemporal blue noise; reject checkerboard/interleaved transport if
  it produces visible complementary-history artifacts;
- prewarm pipelines and caches outside interactive presentation;
- maintain separate cloud-transport and lightweight presentation schedules.

Exit gate: increased spatial/cadence quality fits the measured budget without
triggering safety adaptation on qualified reference hardware.

### Phase 3 — Density and morphology families

Work:

- use separate correlated weather fields for low, middle, and high layers;
- connect curl/turbulence data and implement altitude-dependent erosion;
- create specialized cumuliform, stratiform, cellular, fibrous-ice, frontal,
  precipitation, and deep-convective density functions;
- add visually distinct WMO species and validate scale, base, depth, coverage,
  cell spacing, fiber direction, anvil form, and cloud-top behavior;
- add special high-ice microstructure and an optional bounded hero
  cumulonimbus representation.

Exit gate: reference reviewers can identify every supported morphology in
neutral lighting without knowing its configured label.

### Phase 4 — Weather evolution and lifecycle

Work:

- evolve weather fields at a low bounded frequency using GPU flow-map or
  semi-Lagrangian advection;
- apply per-layer wind, vertical shear, curl, humidity erosion, and scale-aware
  decorrelation;
- model cumulus growth, congestus transition, anvil spread, mature storm,
  precipitation, decay, stratiform organization, and cirrus deformation;
- keep deterministic date/location/seed reproducibility while allowing smooth
  time traversal.

Exit gate: accelerated time-lapse shows formation and dissipation without
sliding sheets, boiling, popping, looping, or synchronized layer motion.

### Phase 5 — Atmosphere-coupled cloud lighting

Work:

- share physically calibrated atmospheric transmittance, sky-radiance,
  multiple-scattering, and irradiance data with cloud lighting;
- derive directional or low-order spherical-harmonic skylight by altitude;
- implement calibrated liquid/ice phase functions, conservative multi-order
  cloud scattering, self-shadowing, ground bounce, ambient occlusion,
  inter-layer shadows, and precipitation attenuation;
- cache lighting in froxels/slices so quality does not require a full secondary
  march at every view sample;
- apply aerial perspective from cloud sample to camera rather than tinting the
  final cloud color heuristically.

Exit gate: photographic front/side/back light, twilight, moonlight, overcast,
and horizon cases pass without artificial glow, flat gray fill, or crushed
interiors.

### Phase 6 — Temporal reconstruction

Work:

- reproject from camera motion plus layer/flow velocity;
- use first/mean depth, optical-depth change, layer identity, and local variance
  for disocclusion and history rejection;
- add confidence accumulation, variance/neighborhood clipping, full-frame
  history resolve, and explicit reset conditions;
- preserve stellar and lunar detail by reconstructing cloud transport rather
  than blurred final scene color.

Exit gate: motion, resize, time changes, weather transitions, and mixed layers
show no trails, ghosting, holes, shimmer, or unstable silhouettes.

### Phase 7 — Meteorological model and full controls

Work:

- extend `CloudScene` with species, lifecycle, humidity/lapse-rate profile,
  frontal organization, cloud-top phase/temperature, and precipitation state;
- constrain altitude, temperature, phase, instability, cover, precipitation,
  and layer combinations before rendering;
- support observed weather inputs and deterministic plausible generation;
- expose every canonical parameter in Sky Lab and visibly explain corrected or
  rejected states.

Exit gate: automated tests exercise every supported genus/species, lifecycle,
environmental constraint, and transition.

### Phase 8 — Legacy emergency fallback (superseded scope)

Work:

- preserve the exact longest-lived deployed hourly sky as the no-cloud
  fallback;
- avoid asset generation, chained GPU initialization, and cloud work after a
  WebGPU failure;
- retain explicit WebGL2 only as a Sky Lab diagnostic.

Exit gate: the fallback is instant, bounded, visually intentional, and cannot
repeat the freeze that caused the production failure.

### Phase 9 — Sky Lab, automated validation, and photographic calibration

Work:

- expose real per-pixel coverage, density, lighting, step, history-confidence,
  depth, velocity, and optical-change buffers;
- add scenario sweeps and a gallery across genera, species, oktas, lighting,
  palettes, aspect ratios, and quality tiers;
- add shader compilation tests, browser visual regression, morphology metrics,
  state fuzzing, leak/device-loss tests, and captured performance reports;
- compare against provenance-safe photographs and record intentional artistic
  deviations explicitly.

Exit gate: the complete matrix passes automated thresholds and side-by-side
human review without unresolved critical artifacts.

### Phase 10 — Qualification, rollout, and retirement

Work:

- run cool-start, five-minute, and extended energy soaks across the device
  matrix;
- implement a bounded capability calibration and staged feature flag;
- roll out through internal, explicit opt-in, small cohort, broad cohort, and
  automatic-default stages while monitoring validation, fallback, timing, and
  memory signals;
- retire CSS clouds and obsolete shader/state paths only after both GPU backends
  pass all gates.

Exit gate: qualified production devices automatically receive the volumetric
renderer with stable field evidence; only the documented emergency fallback
remains.

## Completed execution record

The dependency-ordered implementation has been executed through production:

1. Unified the atmosphere, stars, Moon, fog, and clouds under one perspective
   camera and restored the physical horizon to the default composition.
2. Rebuilt WMO morphology at physical scales, including cauliflower cumulus,
   cellular marine decks, analytic stratiform sheets, fibrous high ice, deep
   convective columns/anvils, and source-attached precipitation.
3. Coupled direct Sun/Moon radiance, atmosphere-derived ambient irradiance,
   ground bounce, self-shadowing, finite-path extinction, celestial occlusion,
   and one HDR display transform.
4. Added deterministic daily cover, optical depth, organization, lifecycle,
   independent advection, fog, noctilucent constraints, and the corresponding
   unlisted Sky Lab controls and presets.
5. Removed the startup-freeze path, disabled artifact-prone checkerboarding,
   skipped all cloud GPU work for clear scenes, bounded grazing-ray work, and
   retained hidden-tab suspension plus adaptive cadence.
6. Selected WebGPU automatically in production and preserved commit `492508b`'s
   longest-lived hourly no-cloud sky as the sole automatic failure fallback.
7. Validated all eight WGSL modules, thirteen production pipeline variants,
   bind groups, uploads, and the submitted graph on real WebGPU; all automated
   cloud/scene/policy tests and TypeScript checks pass.

## Final ledger

- [x] Automatic atmosphere-coupled WebGPU production renderer
- [x] Shared physical camera, astronomy, linear radiance, and display transform
- [x] Constrained ten-genus daily weather with organization and lifecycle
- [x] Genus-specific volumetric/analytic morphology and precipitation
- [x] Atmosphere-derived Sun, Moon, ambient, ground, and aerial light transport
- [x] Cloud attenuation of the Moon, catalog stars, and stellar glow
- [x] Camera/wind-aware temporal convergence and linear-light reconstruction
- [x] Clear-scene skip, low-power adapter, bounded cadence, and hidden-tab stop
- [x] No browser-side volumetric asset generation or chained expensive fallback
- [x] Unlisted complete-parameter Sky Lab and debug views
- [x] Real-device shader, pipeline, bind-group, and graph validation
- [x] Automated state, policy, noise, scene, and shader contracts
- [x] Production build and deployment gate

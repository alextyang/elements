# Unified sky rendering architecture

## Goals and invariants

The sky is a single radiometric scene, not a stack of decorative effects. Its
atmosphere, astronomical bodies, clouds, fog, and aerial perspective share the
same camera, light directions, linear-light color space, and final exposure.

The implementation preserves these invariants:

- `SkyCloudScene` is the canonical weather state. Rendering never invents an
  impossible cloud combination after constraints have been applied.
- Sun and Moon positions, lunar phase, catalog-star positions, extinction, and
  limiting magnitude come from the astronomy model rather than screen-space
  random placement.
- All intermediate radiance is scene-linear. The final pass alone tone maps,
  converts to sRGB, and dithers.
- Production cloud placement is art-directed through world-space weather-system
  domains on the real altitude shells. Individual layers are not screen-remapped
  or opacity-masked; photographic camera views retain natural projection.
- Weather stores an RGB affine camera operator rather than ordinary alpha. Its
  composition is `Lweather + Tweather * Lbackground`, with componentwise
  `Tweather`; alpha is derived photopic metadata only.
- Variety is deterministic for a date/location/sky seed, while wind,
  scintillation, and lifecycle phase keep a visible sky subtly alive.

## Backend selection

`renderer-types.ts` resolves `auto`, `webgpu`, `webgl2`, and `fallback` without
user-agent detection. `auto` selects WebGPU whenever the browser exposes it and
otherwise selects the legacy no-cloud fallback. WebGL2 remains available only
as an explicit Sky Lab diagnostic backend.

The WebGPU renderer requests the low-power adapter. Optional timestamp queries
are enabled only when advertised. Device loss, uncaptured validation errors,
or asset failure fall back safely. Adaptive cadence handles warmed transport
pressure without lowering spatial quality.

## WebGPU passes

### Atmosphere

The atmosphere pass evaluates a continuous five-knot palette spline in linear
light, then adds view/source-angle Rayleigh and aerosol scattering, twilight
volume, edge asymmetry, airglow, lunar scatter, and altitude-indexed
transmittance-LUT modulation. Smooth interpolation and final dither prevent
visible gradient bands.

### Stars

The star pass uses catalog-derived positions, apparent magnitude, Planckian
color, atmospheric visibility, and per-star scintillation state. Stars are
instanced point-spread quads with multi-band, aperiodic brightness modulation.
Catalogue detection, scene-linear flux, camera exposure, and PSF energy are
separate quantities: changing catalogue depth cannot turn every detected star
into an equally bright dot.

The unresolved core is retained at full resolution in `rgba16float`. Only the
bright-source fraction enters a three-scale half/quarter/eighth-resolution PSF.
Cloud transmittance is applied before that convolution, then the full-resolution
core and energy-conserving glow levels are recombined with the atmosphere and
cloud radiance before the display transform. This keeps the glow subordinate to
the star, avoids halos over opaque cloud, and provides broad wings without a
full-resolution blur. The WebGL2 fallback evaluates a compact analytic version
of the same core/seeing/aureole model.

### Moon

The Moon pass samples the current NASA lunar frame when available and otherwise
uses the packaged LROC color map. Sphere normals, true illuminated fraction,
orientation, incidence, earthshine, limb response, and exposure determine
radiance. The atmosphere pass produces the angle-dependent aureole; the Moon
texture itself has no baked glow or circular stamp.

### Clouds and weather

Cloud rendering is a bounded multipass subgraph. The interval pass intersects
curved Earth-relative shells and supplies their complete entry/exit distances;
there are no altitude-class distance caps that can clip a distant frontal
owner into a circular contour. A half-resolution lighting pass caches near/far
Sun and Moon optical depths for each layer. Three specialized full-frame
transport passes then evaluate low, middle, and high surviving segments with
one complete `march_layer` call apiece, progressive blue-noise jitter,
directional atlas density integration with owner-scalar vertical calibration,
atmosphere-derived source and hemispheric irradiance, and energy-bounded
higher-order scattering. A separate marcher-free compositor depth-sorts the
three scalar affine operators and writes the unchanged raw cloud G-buffer.
The intermediate packet is three three-layer `rgba16float` textures: 72 bytes
per cloud-resolution pixel, the minimum storage for spectral radiance and
transmittance, first/mean depth, motion, and work without private packet arrays.
Resolved clouds add a short fine-to-coarse source
integral to a disjoint far/inter-layer residual cache. A six-resource,
double-bank world-space light volume replaces the current layer with exact
distinct-owner Sun/Moon Beer fields plus a four-level P1 multigrid solve only
after every owner in that layer is resident, every active full-owner direct
transform has maximum cell optical depth at most `0.75`, and the global
normalized equation residual is at most two percent. Under-resolved direct
owners remain on exact same-layer tracing. Each direct field is built in two bounded
stages: a parallel exact morphology/optics query materializes source-aligned
RGB extinction and occupancy into mip-zero scratch, then one thread per column
performs the 32-cell Beer prefix at downstream cell faces. Geometric face
interpolation recovers exact cell-center half steps, returns neutral transport
sourceward of an owner, and preserves its full exit attenuation downstream.
Sun completes before Moon reuses the
scratch, and Moon completes before multigrid overwrites it; pass ordering and
single-mip views make those hazards explicit without another volume. Legacy
analytic stratiform layers without a finite owner keep their ordered
twelve-point visible-segment quadrature. Finite atlas-owned stratiform layers
use the bounded owner-event march, including physical step ceilings, camera
footprint filtering, and active-owner traversal. Each accepted event resolves
local RGB extinction, material/phase, receiver-local Sun/Moon visibility,
directional sky, lower atmosphere, ground exchange, and the resident
owner-union direct/P1 field before its emission-absorption update. Resident and
legacy sources are confidence-crossfaded rather than added, preserving one
source path and exact homogeneous-slab behavior while allowing finite lateral
boundaries and ground-to-cloud-base exchange. Ordinary volumes, legacy
analytic sheets, finite decks, hydrometeors, and upper-atmosphere condensate all integrate
RGB camera Beer transport and compose front-to-back as affine operators. The
compositor writes four `rgba16float` attachments: `Lrgb`, `Trgb`, geometry, and
motion (32 bytes/sample, four of the portable eight color attachments). `Lrgb` and
`Trgb` occupy the two layers of one array texture so raw transport and resolved
history swap atomically. First/mean depth, photopic optical depth/opacity,
blended velocity, dominant layer, and actual normalized work remain metadata.
WMO genus is a morphology branch within the common physical model, not a
palette label. See `CLOUDS.md` and `CLOUD-OPTICS.md` for details.

`CloudScene.classifications` is the stable owner-level WMO morphology API.
Daily scenes deterministically assign canonical classifications to every
present layer and may add valid orthogonal varieties, supplementary features,
accessory clouds, or upper-atmosphere species without changing owner identity.
The CPU compiles those assignments into ordered placement → warp → subtract →
union → reuse → optical records, packs them into the fixed rgba32float binding
30 texture, and inflates traversal shells for additive support. Both cached
lighting and view transport execute the same records before material lookup.
The version-two macro atlas likewise evaluates its signed-distance/detail/ice
channels even when macro R is zero: permitted exterior detail displaces the
SDF boundary using its central-difference normal, protected condensation bases,
and conservative potential-density majorant rather than a post-density mask.
Non-analytic high-ice owners additionally resolve the guarded 96³ source atlas
through one RGBA8 sampled binding at group 0, binding 32. Its source transform
is appended to the seven-`vec4` (stride-7) `CloudMacroBinding` record. Camera
and directional Sun/Moon paths share the same owner-space footprint `q`,
resolving fine material at `q <= 1` and returning to macro-R/coarse moments at
`q >= 2`; macro R, SDF, and majorants remain authoritative support contracts.
Source-backed Ci/Cc/Cs owners bypass the former procedural residual, analytic Ci
fibratus remains specialized, and the legacy RG8 moment sidecar is offline
provenance rather than a runtime texture.

Polar stratospheric, nacreous, and noctilucent clouds are separate finite
owners in curved 15–30 km and 80–85 km shells. Their wave-sheet condensate is
integrated through Beer transport with atmosphere-attenuated Sun/Moon and
hemispheric irradiance. Nitric-acid/water PSC, approximately 10 μm nacreous ice,
and 60–100 nm mesospheric ice use distinct extinction and angular/spectral
responses. The former decorative one-hit noctilucent overlay is not part of the
production graph.

Finite precipitation and surface obscuration use a separate sixteen-vector
hydrometeor record but enter this same transport pass. Conservative
wind-swept-field and curved-shell intervals eliminate empty marching and bound
the exact ray segment; adaptive stratification resolves 10 m banks and narrow
shafts. Rain, snow, hail, virga, fog, mist, ice fog, and diamond dust use their
own extinction, albedo, phase, direct/diffuse response, and passive
multiple-scattering weights with the shared physical Sun, Moon, sky, ground,
atmosphere, and exposure. Clouds and hydrometeors are then composed by actual
first-interaction depth and contribute compatible mean depth, velocity, and
owner identity to temporal reconstruction. See `HYDROMETEORS.md` for the
microphysics and sparse-particle energy contract.

### Temporal composite

Cloud history reconstructs a mean-depth world point, advects it by the dominant
layer wind, projects it through the previous transport camera, and rejects from
matched current/previous first/mean
depth, optical-depth change, layer identity, occupancy, and motion. Radiance is
deliberately not an accept/reject signal: it is the high-variance quantity the
history must estimate. Reprojection displacement comes from cloud simulation
time rather than submission cadence, so repeated samples of a paused weather
snapshot do not spuriously advect an immutable cloud field. During that exact
camera/time epoch, every same-pixel transport sample contributes to the resolved
operator: a stochastic boundary hit/miss is an anti-aliasing sample, not a real
disocclusion. Immutable history is sampled directly at the display pixel rather
than passed through a numerically redundant direction/projection round trip;
this prevents bilinear mixing with neighbouring, younger history ages. Moving
production scenes still reproject and reject silhouette, ownership, and
optical discontinuities through the geometric path. Volume
radiance moments are accumulated independently from transmittance: a compact
radius-one/radius-two cross filter uses relative RGB transmittance as its edge
guide, and its strength follows analytic temporal variance. Edge-local moment
clipping therefore suppresses stochastic source speckle while clear/cloud and
thin/thick optical boundaries remain sharp. The completed sky behind a cloud is
not included in the cloud-radiance variance estimate.
A joint bilateral cloud reconstruction compares occupancy, optical depth, and
mean distance so clear sky is not averaged through cloud silhouettes. It runs
only for the optional checkerboard transport path; normal full-frame transport
uses direct linear reconstruction and therefore does not blur already complete
cloud detail.
A linear HDR feedback target persists cloud-radiance luminance mean/population
variance, reconstruction confidence, and stable age so history filtering and
trust adapt to local change. One history weight and one geometric accept/reject
decision apply to both `Lrgb` and `Trgb`; transmittance discontinuities guide
radiance filtering, while `Trgb` itself is only edge-locally bounded. Resolved
transmittance alpha is recomputed photopically after filtering. Raw and resolved
transport arrays clear to the affine identity (`Lrgb = 0`, `Trgb = 1`) and swap
as whole arrays. The composite pass writes display, temporal metadata, resolved
`Lrgb`, and resolved `Trgb` in four attachments (28 bytes/sample for the usual
four-byte presentation format). Stars, glow, background, and transport debug
views use RGB transmittance before the one final creative grade, photographic
tone map, sRGB conversion, and dither. Depth controls aerial perspective. Debug
modes expose coverage, density, transmittance, depth, velocity, history,
lighting, and sample budget before the one display transform.

Photographic qualification runs the temporal reconstruction's complete,
bounded 64-transport history horizon. Transport count is necessary but not
sufficient: strict readiness also requires at least 90% current history
acceptance, 0.75 occupied-pixel mean normalized stable age (48 consecutive
samples), and 0.85 occupied-pixel mean persistent confidence. A
post-composite 64 × 36 numerical audit separately reports raw radiance and raw
transmittance temporal deltas, resolved-radiance delta, raw-to-resolved
residual, history acceptance/age/confidence, raw/resolved spatial variation,
first/mean/optical-depth deltas, and non-finite counts. This distinguishes a
noisy lighting estimator from noisy density, temporal rejection, or display
dither without using the screenshot itself as a diagnostic instrument.
Paused qualification cannot run beyond the 64-sample horizon through ordinary
prop redraws; only the existing one-sample decision probe may cross the bound,
and only when no history decision has yet been measured.

## Sky Lab

`/sky-lab` is intentionally unlisted. It serializes its state into the URL and
can force backends, quality tiers, debug views, cloud composition, lens, and
world-space weather-system placement regime,
temporal reconstruction,
resolution, cadence, date/time/location, palette variant, and all CloudScene
parameters. Each layer exposes genus, oktas, altitude, thickness, optical
depth, wind, shear, turbulence, ice fraction, precipitation, mesoscale
organization, lifecycle, and organization strength. Presets cover
clear, fair cumulus, marine cells, high cirrus, altocumulus, rain deck,
thunderstorm, and radiation fog.

Every select has previous/next controls with wraparound, so related palettes,
weather states, render modes, compositions, and perspective lenses can be
auditioned without reopening native select menus.

Stellar controls are deliberately orthogonal: visibility changes the limiting
magnitude, exposure changes displayed source energy, and glow changes only the
wide PSF. This is the preferred way to diagnose a night composition without
breaking photometric ordering.

The on-canvas telemetry reports chosen backend, output/cloud resolution,
estimated texture memory, temporal-history state, effective adaptive cadence,
CPU submission time, separate interval/lighting/transport GPU costs, isolated
cold-lighting GPU/queue cost, first-transport cost, density evaluations, and
timing source. Renderer debug views are the first
tool for diagnosing a visually implausible result; ordinary DOM inspection
cannot reveal linear-light composition errors.

## Important source files

- `sky.tsx`: palette, weather, and astronomy integration.
- `cloud-scene.ts`: constrained weather state and WMO morphology parameters.
- `cloud-morphology-modifiers.ts`: selection, ordered compilation, packing,
  stable owner resolution, and conservative bounds.
- `cloud-morphology-modifiers-wgsl.ts`: the shared 22-operator GPU evaluator.
- `sky-renderer-canvas.tsx`: backend selection, GPU resources, render graph,
  scheduler, temporal state, and telemetry.
- `webgpu-shaders.ts`: original atmosphere, star/stellar-PSF, Moon, cloud, and
  composite WGSL.
- `astronomy.tsx` and `star-catalog.ts`: astronomical state.
- `sky-photograph-benchmark.ts`: reference-image calibration.

## Extending the renderer

New visual features should enter the HDR graph at the physically correct point.
Do not add post-tone-map colored overlays for atmospheric phenomena. Add new
weather controls to `CloudScene`, constrain them before rendering, expose them
in Sky Lab, and add photographic benchmark cases. Any extra animated pass must
have a hidden-tab stop, a pixel/work budget, and observable timing.

# Volumetric cloud renderer

Elements includes an original atmosphere-coupled WebGPU cloud renderer as the
automatic production path on WebGPU-capable browsers. Atmosphere and celestial
elements share one perspective camera. Production cloud transport is physically
lit and placed in genus-aware world-space weather domains. Editorial choices
control which physically possible systems occupy the view, rather than cutting
the rendered result with screen-space masks.
Browsers without WebGPU, device loss, asset failure, or validation failure use
the exact no-cloud hourly sky that was Elements' longest-lived deployed sky.
The implementation follows public real-time rendering literature and WMO cloud
classification; it does not contain code, shaders, or textures from Photon,
DAV, or the Minecraft shader packs used as visual references.

## Rendering model

`SkyRendererCanvas` owns the HDR render graph:

1. Atmosphere, stars, and Moon render into scene-linear `rgba16float` targets.
2. A screen-space interval pass computes exact entry/exit distances for the
   three curved shells. Exact bounded shell transport remains faster here than
   the measured hierarchy approaches, which were removed after raising cost.
3. A half-resolution per-layer lighting pass caches near/far Sun and Moon
   optical depths so secondary marches are not repeated at every view sample;
   a tiny 4×12 target integrates directional skylight by altitude from the same
   atmosphere shader.
4. Three specialized full-frame passes raymarch the low, middle, and high
   intervals independently on the same physical camera ray. Each shader entry
   contains exactly one full-quality `march_layer` call. Their scalar affine
   packets occupy three three-layer `rgba16float` textures (72 bytes per
   cloud-resolution pixel): radiance/first depth, spectral transmittance/mean
   depth, and motion/work. A tiny separate shader depth-sorts and composes the
   three packets into the existing two-layer camera-transport array plus
   geometry and motion attachments. Layer 0 remains scene-linear `Lrgb`; layer
   1 remains componentwise Beer `Trgb`. First/mean depth, photopic optical
   depth/opacity, dominant layer, blended velocity, and actual work retain
   their existing locations. The transmittance alpha is freshly derived
   photopic metadata; it is never transport state.
5. The composite pass motion-reprojects and neighborhood-clamps both transport
   layers with one shared history decision, then evaluates
   `Lrgb + Trgb * backgroundRadiance` componentwise.
   Finite cloud-to-camera aerial transmittance is already resolved once in
   transport and is not reapplied as a background-colour blend.
6. One display transform, sRGB conversion, and sub-LSB dither occur at the end.

This ordering matters. Stars and the Moon are attenuated by the same cloud and
atmospheric transport as the rest of the sky, rather than being pasted over it.
Every finite cloud, sheet, hydrometeor, and upper-atmosphere result is an affine
camera operator `{Lrgb, Trgb}`. Front-to-back composition is
`{Lf + Tf * Lb, Tf * Tb}`; clear transport is exactly `{0, 1}`. Editorial
coverage rescales RGB optical depth and the associated source term together, so
placement cannot turn colored extinction into scalar opacity or create energy.

## Editorial physical composition

The default `graphic` mode no longer remaps altitude tiers, fades final opacity,
or clips a pre-existing regional cloud sheet. It generates deterministic cloud
populations directly on the real curved altitude shells. The population field
replaces the regional formation driver before density is built: it is the source
of local condensation, not a value multiplied into finished cloud density.
Every surviving cloud therefore retains normal extinction, self-shadowing,
aerial perspective, and motion. A single camera ray remains valid across the
atmosphere and every cloud layer.

Fair cumulus and ragged fragments use coverage-dependent aperiodic populations;
cellular genera use broad, irregular finite colonies with connected entrainment
channels. Cumulonimbus uses a depth-scaled upright storm footprint with a
dominant cell and only physically justified remote cells instead of inheriting
the fair-cumulus distribution. Lenticular and roll species use several finite
wave packets distributed through world depth. Cirrus uses fewer coherent
shear-aligned streamer families rather than a crowded set of crossing streaks. Partial
stratiform cover is generated as a coherent moisture shield with independently
corrugated advancing, trailing, and lateral condensation surfaces. High ice is generated
as independently offset, curved, tapered streamers. These are different density
sources, not different masks around the same source.

The populations occupy the full Earth-local horizon at aperiodic bearings and
stratified near/middle/far ranges. A fixed north-sector cluster supplies several
readable systems for an editorial camera to select, but the runtime never sees
the camera, canvas or FOV. The real cloud-scene seed controls azimuth, radial
depth, cell arrangement, size and topology, so daily variation cannot collapse
into a corner, ring or grid. Sufficiently extensive stratiform cover becomes a
physically immediate finite shield; a partial sheet remains a remote frontal
bank and cannot pretend to be both distant and overhead.

Population detail reuses the packed correlated weather texture rather than
evaluating independent multi-octave noises inside every transport sample. Two
rotated, incommensurate projections form a synoptic/mesoscale hierarchy with no
short shared world-space repeat; the second projection also drives cloud
columns, so this removes the former grid without adding a third weather lookup.
The periodic 3-D basis is rotated and sheared differently for every altitude
tier before sampling, removing its axis-aligned tile planes. This keeps cell
growth phase-locked with regional humidity while preserving the bounded
ray-march cost.

Sky Lab retains physical, hard layered, and edge-framed modes for direct
comparison with the previous approach. Its automatic, distant, nearby and
overhead options are camera/framing experiments around the same persistent
meteorological owners; they do not regenerate, mask or resize those owners.
Production and photographic previews use one shared FOV for atmosphere,
celestial objects and clouds. Cloud-only wide/telephoto/orthographic transforms
are explicitly diagnostic Lab controls and are never stacked on a real camera
lens.

## Cloud morphology

`CloudScene` represents the ten WMO genera and clear sky across low, middle, and
high layers. Each active layer contains physical and art-directable state:

- base altitude and thickness above the mean surface datum;
- okta-derived fractional coverage and Beer-Lambert extinction;
- wind vector, vertical shear, turbulence, organization, and lifecycle state;
- liquid/ice mixture, precipitation efficiency, and morphology controls;
- stratus blend, convective tower amount, anvil amount, and erosion detail.

The current shader combines correlated but distinct low/middle/high weather
fields, a periodic 128³ base volume, a periodic 64³ erosion volume,
WMO-specific height profiles, and world-space advection. The weather hierarchy
now determines where condensation is possible; it no longer supplies a generic
visible silhouette shared by every genus. Separate bounded morphology
generators build convective thermals, cellular colonies, and cirriform fibres,
while stratiform genera use continuous sheet transport. Cirrus is assembled
from finite wind-sheared streamers, cirrocumulus and altocumulus from irregular
shallow cells, stratocumulus from larger resolved rolls and domes, fair cumulus
from flat-base thermal towers and cauliflower crowns, and cumulonimbus from a
coupled tower, spreading anvil, and overshooting dome. Noise adds relief and
erosion inside these forms; it is not the primary shape. Thin or absent layers
cannot rain. High clouds remain ice dominated. Multiple tiers may coexist,
including deep convection spanning ordinary altitude bands.

Open cellular fields use the shared boundary between neighbouring irregular
cells (the Voronoi F2−F1 statistic), producing connected cloudy walls around
clear subsiding air instead of drawing independent rings. High-cover
stratocumulus merges through a shallow condensation-base volume while retaining
resolved domes and troughs. Editorial cumulonimbus owns an explicit system
centre: its core, asymmetric downwind anvil, overshoot, and rain state remain
one object under every camera framing. Partial middle and low systems also have
genus-specific minimum ranges, so a nominally distant bank cannot accidentally
place an element immediately over the camera.
Base/detail/weather wavelengths are selected by genus in physical kilometre
scales. Cumulus populations use a broad seeded size distribution, asymmetric
child thermals, flat condensation bases, and column heights driven by the same
thermal that owns the footprint. Cellular genera use the colony only as a
moist-air envelope: a separate mesoscale field opens real clear-air slots, and
multiple Worley bands prevent a single honeycomb frequency from appearing.
Cirrus applies wind-sheared crystal fallstreak displacement; deep convection
couples tower, anvil, and rain structure to the same isolated source column;
and stratiform cloud uses analytic optical transport with correlated underside
structure. Lighting no longer categorically excludes sheet topologies:
cirrostratus/altostratus/nimbostratus/stratus-style finite owners enter the
same connected world-space light-volume selection as cellular clouds. Finite
owners use bounded owner-event camera transport. Only a legacy analytic sheet
without finite owner support uses the twelve-node sheet quadrature. Each
accepted event evaluates its own material, RGB extinction,
Sun/Moon visibility, directional sky, lower-atmosphere and ground source. The
node is integrated immediately as `L += T * source * (1 - Tseg); T *= Tseg`,
so a frontal deck cannot collapse to the brightest or most extinguishing
sample. Exact whole-layer Sun/Moon Beer, P1 higher orders, sky/ground exchange,
and finite exterior/truncated boundaries come from the shared converged solve
where resident; the receiver-local legacy visibility path is the disjoint
fallback, not an additive second light.

Direct Beer construction preserves the exact owner morphology and spectral
optics query at every 48×32×48 source-grid cell, but evaluates those cells in a
parallel slab materialization pass. A following bounded column pass reads the
cached RGB extinction and occupancy and performs the Beer prefix toward the
source, storing downstream faces so cross-owner shadowing survives
beyond the caster bounds without changing internal half-step transport. The Sun
scan finishes before Moon materialization reuses
mip-zero multigrid scratch, and the later smoother overwrites that scratch
before reading it, so no source or solve generation can observe stale data.

The noise basis is original, seamless, deterministic, and shipped as
precomputed RGBA8 assets plus a progressive 64×64 R8 blue-noise tile. Assets
are fetched once, browser-cached,
and uploaded as normalized textures. Missing or corrupt volumetric assets go
straight to the legacy sky; the browser never attempts multi-million-voxel
main-thread synthesis during startup.

The authoritative 48³ macro atlas is generated from formation topology rather
than generic primitives. Cumulus congestus has a dedicated resolved genealogy:
three compact source roots join through a connected common condensation base,
then irregularly timed thermal pulses narrow into explicit junction necks and
expand into protected cauliflower heads. Balanced, turreted, and multicell
states terminate in four, three, and five separated crown branches,
respectively, with subordinate feeders merging into the dominant path instead
of surviving as parallel fingers. Crown buds are deliberately larger than the
atlas Nyquist limit; tetrahedral subvoxel quadrature preserves their curved
boundary coverage without turning the surface into voxel dust. Alternating
flank cavities form real clefts between heads while a protected connected core
preserves mass. Qualification is performed on the generated bytes in both
canonical elevation views: crown peaks must survive medium and coarse filters,
multiple convex hierarchy scales and trunk necks must remain visible, cleft
depth must be nonzero, and the crown must retain distinct heads after 2× box
reconstruction. Thin-surface and rejected-subvoxel fractions are bounded as
aliasing gates. Clear exterior support is classified as restrained liquid
cauliflower detail rather than adding procedural turret stamps. Calvus,
capillatus, incus, and decay
share the feeder-tree body but own distinct smooth-transition, fibrous,
detrained-anvil, and erosion stages. Cirrus fibres use a deliberately
reconstructible two-voxel envelope around coherent shear/sedimentation paths;
their apparent filament width is recovered by boundary up-resolution rather
than risking disappearing one-voxel atlas dust. The canonical WMO uncinus
volume is two unequal mare's-tail members, each one six-neighbour-connected
hook, curved head-fibre fan, reconstructible neck and long sedimenting virga.
The members deliberately differ in heading, arc, length and fall depth. Their
head fibres begin on the hook rather than using round cloudlet primitives, and
their tails narrow and lose optical density continuously instead of ending as
capsules or detached lines. Generator qualification measures both authored
attachments and reconstructed connected components, hook and fallstreak path
lengths, terminal radius/density taper, direction spread, silhouette openness,
and projected grid autocorrelation. Every non-Cu/Cb slot is bound directly to
one renderer-neutral high-, middle-, low-layered-, or upper-cloud descriptor
and a reachable topology variant. The manifest preserves physical element
diameter and whole-formation span separately; its clamped reconstructible
element proxy affects only the 48³ macro silhouette and never scales with
owner extent.

Cellular decks no longer share one altitude-scaled puff grammar. Cc uses a
finite broken grain/ripple sheet, Ac uses larger merged and separate
mixed-phase elements, and Sc uses an inversion-bounded cellular deck with
unequal physical seams. Castellanus at every level owns one curved,
nonuniformly spaced common base rather than several cloned rows. Floccus keeps
the spatial memory of a dissipated castellanus base but removes the base itself
and adds ragged, optionally sedimenting tufts. Cc lenticularis is an unequal
pair of very thin finite crests, Ac is one stationary unequal stack, and Sc is
a coherent grouped-element low lens. Ac and Sc volutus use separate finite,
tapered vortex-roll cross-sections with asymmetric ends and a shallow moving
underside indentation rather than an analytic solid capsule.

Continuous layers also have separate formation geometry. Cs is a thin invading
fibrous ice front, As an unequal superposed mixed-phase shield, Ns a deep
generating-cell precipitation shield with broad overlapping fall regions, and
St an inversion-bounded advected bank. Independent curved leading/trailing
boundaries, dry-air intrusions, and unequal end development make the
condensate boundary itself finite; no post-density fade or circular shaft mask
defines the formation. The manifest records connectivity, reconstructibility,
projection components and holes, silhouette compactness/asymmetry, owner
spacing entropy, one-axis and orthogonal anti-grid scores, family density and
occupancy signatures, and nearest-family voxel separation. Projected
condensate paths are measured along all three physical axes as the
normalization contract between atlas density and LWP/IWP-derived extinction.
Generation fails if topology, family separation, reconstructibility, or this
physical path contract regresses.

Atlas version two also stores a conservative signed distance, detail class and
ice fraction beside authoritative interior density. At runtime a zero R sample
is not an empty-space early exit: the potential-density majorant first proves
whether work can be skipped, then central SDF differences supply an outward
normal, the volume's permitted liquid/ice/laminar detail class selects an
axis-scaled displacement, and the protected-base rule prevents cauliflower
noise from destroying a physical condensation base. Interior and exterior
condensate are united before owner overlap, extinction, light marching, or view
transport. The owner binding is now seven `vec4`s (stride 7): the guarded
high-ice source scale/offset pair is appended after the original atlas,
majorant, and condensate-path records, with an explicit availability sentinel
for analytic/non-high-ice owners.

The guarded source atlas is one RGBA8 sampled binding (group 0, binding 32)
for eleven non-analytic high-ice volumes. Camera and directional Sun/Moon
queries share one owner-space footprint `q`: fine source material is resolved
through one source voxel at `q <= 1`, then the evaluator returns to
authoritative macro-R and packed coarse moments at `q >= 2`. Macro R, SDF, and
majorants remain authoritative support and culling contracts. Source-backed
Ci/Cc/Cs owners therefore bypass the former procedural high-ice residual;
analytic Ci fibratus stays on its specialized tangent-relative evaluator. The
legacy RG8 moment sidecar remains offline provenance only and is not sampled at
runtime.

Orthogonal WMO morphology is not baked into those macro volumes. Stable
`CloudScene.classifications` assignments compile to a bounded, ordered
rgba32float record texture at binding 30. Placement, warp, subtractive clear
space, smooth union, base-macro reuse, and optical remapping therefore operate
on the exact same finite physical owner in both lighting and view queries.
Virga and praecipitatio remain parent-owned hydrometeor fields and survive an
orthogonal classification override.

## Light transport

Every occupied sample receives:

- direct sunlight and moonlight after atmosphere-LUT modulation and
  half-resolution, per-layer cached cloud self-shadowing;
- separate water-droplet and ice-crystal phase approximations;
- a second, broader scattering lobe for multiple-scattering energy;
- altitude-aware ambient skylight and ground bounce;
- precipitation attenuation below producing layers.

Solar exposure is transported through the atmosphere at each sample's actual
altitude instead of using one sea-level colour for every genus. High sunset ice
therefore remains brighter and spectrally less extinguished than low water
cloud. Diffuse illumination is reconstructed chiefly from the local upward
sky hemisphere, with a smaller side-facing term, rather than sampling the
camera-facing horizon as if it were the incident hemisphere. The same change
keeps daytime shadows cool, low-Sun faces warm, and overcast bases coupled to
the rendered sky and ground. Powder emphasis follows the brighter active light
source, so an invisible Moon cannot alter daytime silver linings.
The cloud lighting cache uses the same per-layer composition ray as interval
classification and transport, preventing highlights from being evaluated on a
different piece of the shell. Atmosphere LUT reads use clamp addressing, and
finite sample-to-camera transmittance comes from the ratio of observer and
sample outward transmittances rather than an arbitrary distance tint.
Camera-ray Beer extinction is RGB for ordinary volumes, twelve-node sheet
quadrature, precipitation and obscuration, and upper-atmosphere condensate.
Photopic reductions are restricted to traversal/depth diagnostics and source
path caches whose lights are already evaluated spectrally; they never replace
the camera transfer stored in `Trgb`.

Fog uses the same world-space camera and final HDR composition. Polar
stratospheric, nacreous, and noctilucent owners occupy curved finite shells at
15–30 km and 80–85 km; invalid latitude, season, temperature, or solar
depression contexts compile no condensate. Their thin wave fields use distinct
nitric-acid/water, 10 μm ice-diffraction, and 60–100 nm ice-scattering material
responses, atmosphere-attenuated source irradiance, foreground aerial
perspective, and Beer extinction. Noctilucent multiple scattering stays
restrained because its vertical optical depth is ordinarily below 10⁻⁴.

## Temporal reconstruction and efficiency

The expensive cloud transport pass runs at 1, 2, or 4 Hz for battery, balanced,
and high quality, with a hard 6 Hz ceiling for manual controls.
The displayed result is reconstructed between updates using camera-aware
world-space reprojection, layer-wind advection, first and mean
depth, optical-depth change, dominant layer, blended velocity, occupancy,
separate cloud-radiance population moments, persistent confidence/stable age,
history rejection, and a variance-guided two-scale cross filter whose weights
fall rapidly across relative RGB-transmittance discontinuities.
Transport updates every cloud pixel; the visually unstable checkerboard path
is disabled. Curved-shell intersections bound the march, opaque rays terminate
early, grazing rays maintain a bounded physical step, and progressive blue-noise
strata plus transmittance-guided radiance reconstruction remove stipple and
marching combs without filtering stars, the Moon, or completed scene color.
Raw and resolved histories use the same two-layer array ABI and are swapped as
whole resources. Both layers share temporal weights and rejection, but relative
RGB-transmittance discontinuities guide radiance filtering and `Trgb` itself is
only edge-locally bounded. Transmittance alpha is recomputed from resolved
`Trgb` instead of being blended through history. New render
samples from an immutable camera/weather/time epoch read exact same-pixel
history; reprojection is reserved for camera or simulation motion. This keeps
stable age and persistent confidence monotone without weakening moving-scene
silhouette and owner rejection. Ordinary prop redraws respect the bounded
qualification scheduler instead of silently adding transport work past its
64-sample horizon. New render
targets are explicitly cleared to neutral cloud history (`Lrgb = 0`,
`Trgb = 1`). First-use
interval and lighting-cache work is submitted by itself; transport begins only
after that queue completes and a new animation frame is reached. This prevents
the previously observed lighting and transport residency costs from forming one
contiguous cold GPU submission without changing the warmed rendering graph.

The renderer also:

- caps total pixels and cloud-buffer scale independently of device pixel ratio;
- uses 12/30/42 base primary samples and 2/3/4 light samples by quality tier,
  with bounded extra samples only along long grazing or convective paths;
- matches the grazing-ray physical step to each tier's resolvable morphology
  (100 m low, 160 m middle, 240 m high) rather than oversampling distant shells;
- stops all scheduling in hidden tabs and while paused;
- limits star-twinkle presentation to 6 Hz and caches its multiscale glow;
- measures interval, lighting-cache, and transport costs separately with WebGPU
  timestamp queries when supported;
- reports isolated cold-lighting GPU/queue time and the first transport update
  separately from rolling warmed timings;
- sharply reduces cadence when sustained GPU time is high;
- loads and caches versioned reusable cloud data once, with no main-thread
  procedural-generation cost in the normal path.

Device loss or validation failure switches to the longest-lived deployed
hourly gradient without clouds. Explicit `webgl2` remains a diagnostic mode in
Sky Lab; explicit `fallback` previews the same production emergency sky.

## References

- [WMO International Cloud Atlas: cloud genera](https://cloudatlas.wmo.int/en/clouds-genera.html)
- [WMO Cumulus congestus morphology](https://cloudatlas.wmo.int/en/species-cumulus-congestus-cu-con.html)
- [WMO Cumulonimbus capillatus morphology](https://cloudatlas.wmo.int/species-cumulonimbus-capillatus-cb-cap.html)
- [WMO Cirrus uncinus morphology](https://cloudatlas.wmo.int/en/clouds-species-uncinus.html)
- [WMO Altocumulus stratiformis morphology](https://cloudatlas.wmo.int/en/species-altocumulus-stratiformis-ac-str.html)
- [Horizon Zero Dawn real-time volumetric cloudscapes](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)
- [Frostbite physically based sky, atmosphere, and cloud rendering](https://www.ea.com/news/physically-based-sky-atmosphere-and-cloud-rendering)
- [Epic volumetric cloud component](https://dev.epicgames.com/documentation/en-us/unreal-engine/volumetric-cloud-component-in-unreal-engine)
- [NVIDIA spatiotemporal blue noise](https://developer.nvidia.com/blog/rendering-in-real-time-with-spatiotemporal-blue-noise-textures-part-1/)
- [WebGPU specification](https://gpuweb.github.io/gpuweb/)

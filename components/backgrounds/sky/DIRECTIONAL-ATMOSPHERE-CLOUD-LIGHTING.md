# Directional atmosphere–cloud lighting foundation

`directional-atmosphere-cloud-lighting.ts` and
`directional-atmosphere-cloud-lighting-wgsl.ts` define the binding-free,
scene-linear contract used by the active WebGPU renderer to exchange light
between the physical atmosphere, clouds, the ground, and aerial media.

The goal is to remove the remaining scalar “ambient sky colour” assumption
without introducing a new artistic sky tint. Clouds receive compact
altitude-dependent directional radiance and separate upper/lower hemispheric
irradiance. In the other direction, cloud transmittance enters ground bounce,
atmospheric in-scattering, fog, and hydrometeors at the physical scattering
sample, producing crepuscular shafts and shadowed haze through transport rather
than a screen-space beam.

The invariant is unchanged:

```text
one TOA Sun/Moon source
    -> atmosphere transfer once
    -> cloud visibility/redistribution once
    -> local volume or surface response
    -> camera-path atmosphere once
    -> one shared exposure
```

No API in this foundation accepts an ambient tint, palette colour, exposure,
tone-map value, or screen coordinate.

## Research conclusions

The production references converge on a shared architecture:

- Hillaire’s atmosphere separates transmittance, multiple scattering,
  irradiance, sky-view radiance, and aerial perspective into bounded physical
  transfer data. The directional cache in this foundation is a prefilter of
  that authority; it is not a second atmosphere model.
- Frostbite’s unified volumetric framework makes participating media share
  extinction, scattering, volumetric shadowing, and light transport rather
  than letting fog, particles, and clouds use disconnected colour controls.
- *Red Dead Redemption 2* uses shared voxelized scattering/transmittance for
  the main view, reflection maps, and a sky-irradiance probe grid. The important
  lesson is the hierarchy and data exchange between systems, not one isolated
  cloud shader.
- Guerrilla’s *Horizon: Zero Dawn* work combines Beer transport, directional
  phase response, spherical cloud layers, weather, and the time-of-day
  atmosphere. It also documents why baked billboards fail at inter-cloud
  shadowing and evolving illumination.
- Production volume rendering treats single scattering, attenuation, emission,
  and high-order scattering as terms in one radiative-transfer equation.
  Approximations must remain passive; “ambient” energy cannot be invented to
  lift dark cloud interiors.

These constraints rule out a palette-authored top/bottom gradient and a
post-process god-ray mask.

## Positive directional radiance representation

The compact cache uses normalized spherical radial basis functions (SRBFs),
implemented as positive spherical Gaussians, rather than low-order spherical
harmonics. Low-order SH is excellent for smooth irradiance, but truncation can
reconstruct negative radiance and loses the narrow sourceward and horizon
structure that dominates sunrise, sunset, twilight, and silver-lining
conditions. A positive SRBF mixture has three useful invariants:

1. every reconstructed RGB radiance is nonnegative;
2. every lobe stores its integrated radiance, and its normalized kernel
   integrates to that energy over 4π;
3. source directions and bandwidths rotate directly without refitting a global
   basis.

Each altitude node contains:

- 14 nearly uniform positive diffuse SRBFs;
- one explicit horizon ring;
- at most two explicit sourceward lobes, one for the Sun and one for the Moon;
- exact quadrature-derived upper and lower hemispheric irradiance;
- exact upper, lower, and full-sphere radiance integrals.

The prefilter partitions each authoritative sky sample’s energy among the
lobes, so the sum of lobe integrals exactly equals the input integral. Explicit
horizon/source lobes receive energy only when the sampled field contains
measured angular contrast. Source geometry by itself therefore cannot emboss a
recognizable circular glow into an overcast field, and the existence of a
horizon cannot create a static band in an isotropic sky.

Resolved Sun and Moon discs must be excluded from the samples. They remain
separate TOA sources with their physical solid angle and radiance. The cache
represents atmosphere-scattered radiance around them, not the discs themselves.

`prefilterDirectionalSkyRadiance()` is the CPU reference. A GPU prefilter may
replace it, but must retain its positivity, contrast gate, quadrature coverage,
and energy-conservation tests. `evaluateDirectionalSkyNode()` and
`sampleDirectionalSkyRadianceProfile()` are the CPU reconstruction reference.

## Hemispheric irradiance

`upperHemisphereIrradianceRgb` and `lowerHemisphereIrradianceRgb` are stored
separately at every altitude. They are cosine-weighted integrals of the same
physical directional samples, not colours selected from the rendered camera
ray.

- Upper irradiance drives cloud tops, sky-facing cloud normals, terrain, fog,
  and the atmosphere’s diffuse incident term.
- Lower atmosphere irradiance remains separate from reflected ground flux.
- Cloud-shadowed ground bounce is evaluated dynamically and added to the lower
  incident hemisphere. It must not be baked into the upper sky cache or counted
  twice.

The nonresident cloud closure treats those fields as a disjoint source
partition. The full-sphere lobe/phase convolution owns atmosphere first order
once. Upper and lower atmosphere irradiance then supply only bounded higher
orders, each using its own cloud path depth. Reflected ground is excluded from
the directional cache, so it retains a complete first-plus-higher diffuse
closure on the lower path. The first-order atmosphere path depth is the
upper/lower photopic-irradiance-weighted mean; scaling the incident field
therefore scales scene-linear cloud radiance without changing transport.

The view marcher likewise keeps the atmosphere-transmitted collimated
Sun/Moon term outside the higher-order representation blend. Only the analytic
diffuse closure and a qualified complete-owner P1 solution are crossfaded.
Thus residency cannot desaturate or cool the resolved direct term, while the
directional atmosphere retains its real blue, twilight, or overcast chroma.
The operation is a convex blend of two passive higher-order estimates and adds
no palette-authored cloud colour.

The profile linearly interpolates radiance and both irradiance hemispheres
between strictly increasing physical-altitude nodes. Twelve nodes cover the
troposphere, stratospheric clouds, and an optional mesospheric endpoint while
keeping resource size bounded.

### Receiver-local phase cache

The nonresident production closure does not reuse the directional sky phase
integral from the first cloud hit. That made a tall cumulus or cumulonimbus
column inherit one altitude and one droplet/ice asymmetry for every later
event, creating a view-dependent lighting stamp and erasing real vertical
changes in twilight and mixed-phase towers.

Instead, each active cloud ray lazily builds a bounded receiver-local cache:

- shallow and sheet layers sample the 17 positive sky lobes at the physical
  layer bottom and top;
- deep convection adds one physical midpoint sample;
- each lobe fetch simultaneously accumulates normalized HG phase integrals at
  `g = 0.70`, `0.80`, and `0.88`, bracketing the generated liquid and ice
  asymmetries (`0.714–0.866`);
- every extinction event performs convex, piecewise-linear interpolation in
  physical altitude and its actual RGB scattering-weighted asymmetry.

Thus a shallow layer performs two 17-lobe traversals and a deep layer performs
three, independent of whether the camera march accepts 12 or 144 events. The
cache is not built when the resident light-volume closure is complete and no
diffuse diagnostic is requested. Convex interpolation preserves nonnegative
phase-integrated radiance, cannot exceed its cached endpoints, and is
continuous at both the altitude and material knots.

Only the expensive full-sphere phase convolution is cached. Upper-atmosphere
irradiance, lower-atmosphere irradiance, ground radiance, local liquid/ice
optics, and upper/lower cloud optical depths remain receiver-local at every
sheet or volumetric event. Their source ownership therefore stays disjoint:
directional atmosphere owns first order once, the two atmosphere hemispheres
own bounded higher orders, and ground owns its first-plus-higher reflected
path.

Those receiver-local cloud depths are not whole-layer samples. The local
material query accumulates extinction-weighted inward-SDF and geometry moments
from every overlapping owner. A compact analytic upper/lower path is derived
from those continuous moments with no cone ray, support traversal, or extra
texture fetch. This retains boundary detail without extrapolating a dense voxel
through clear kilometres, and prevents a remote cloud bank from creating a
ray-hit stamp in an unrelated cloud's diffuse self-visibility. A finite,
radiometrically agreeing resident P1 field may replace only the corresponding
higher-order term.

## Passive cloud transfer and ground bounce

`PassiveCloudTransfer` stores three mutually exclusive energy outcomes per RGB
channel:

```text
cloud transmittance
+ energy scattered toward the receiving domain
+ absorption / scattering elsewhere
= 1
```

`createPassiveCloudTransfer()` rejects sums above one and still normalizes the
returned state to a safe bound. Direct collimated Sun/Moon irradiance uses only
the transmittance term. Diffuse hemispheric illumination may use
`transmittance + scatteredTowardReceiver`, because its receiver is an angular
domain rather than the original collimated beam.

`evaluateCloudShadowedGroundBounce()` computes:

```text
E_ground = E_sky * cloud_diffuse_transfer
         + sum(E_direct_at_ground * cloud_source_transmittance)

reflected_flux = ground_albedo * E_ground
ground_radiance = reflected_flux / pi
E_lower_at_cloud = reflected_flux
                 * atmosphere_transmittance(ground -> cloud)
                 * projected_ground_view_factor
```

`E_direct_at_ground` has already travelled from TOA through the atmosphere once.
The ground-to-cloud transmittance is a different finite path and is applied
once. With albedo, transfer, and view factor all bounded by one, reflected flux
cannot exceed incident flux.

This distinguishes a naturally dim cloud shadow from a globally darkened cloud
base. Warm desert, snow, vegetation, and water ground response follows the
physical ground albedo already held by the atmosphere state; there is no
manually authored “bounce colour.”

## Aerial perspective, fog, and crepuscular shafts

`evaluateCloudCoupledAerialSource()` injects cloud visibility into the local
source term of the radiative-transfer equation:

```text
j_direct(x, view) = sigma_s(x)
                  * E_TOA->atmosphere(x)
                  * T_cloud(x -> source)
                  * phase(source, view)

j_diffuse(x, view) = sigma_s(x)
                   * integral(L_directional(x, omega)
                              * phase(omega, view) d omega)
                   * passive_cloud_diffuse_transfer
```

`integrateCloudCoupledAerialStep()` then integrates that coefficient with the
analytic Beer source integral. Cloud visibility changes in-scattering, not the
camera-path extinction of the same air sample. Adjacent lit and shadowed
samples therefore become crepuscular shafts naturally when marched toward the
camera. A post-multiplication of the completed aerial radiance is specifically
incorrect: it erases diffuse haze, shadows air in front of the cloud, and cannot
produce correct depth ordering.

The same evaluator accepts physical atmosphere, fog, mist, dust, blowing snow,
or hydrometeor coefficients. `scattering <= extinction` is validated per
channel. The local direct irradiance must already be atmosphere-transported
from the unchanged TOA source; `cloudTransfer.transmittanceRgb` is cloud-only.

## Bounded GPU representation

The general schema defines a production-feasible upper bound below 1 MiB:

| Resource | Bounded layout | Purpose |
| --- | --- | --- |
| Directional radiance | 34×12 RGBA16F | Two texels for each of 17 lobes at 12 altitudes |
| Hemisphere irradiance | 2×12 RGBA16F | Separate upper/lower RGB irradiance |
| Cloud shadow cascades | 2 sources × 3 layers × 128² RGBA16F | RGB cloud-only source transmittance |
| Aerial coupling froxels | 32×18×16 × 2 RGBA16F | Per-source cloud transmittance at atmosphere/fog samples |

The exact general-schema byte total is exported as
`DIRECTIONAL_LIGHTING_GPU_CACHE_LAYOUT.totalBytes`.

The active renderer uses one 96×96×193 RGBA16F atlas without adding a sampled
texture. Layer 0 stores the 17-lobe, twelve-altitude directional profile in its
first 36 columns. Layers 1–192 store 32 mean RGB Beer-visibility knots for each
of three Sun-aligned and three Moon-aligned receiver-depth cascades. Four fixed
footprint rays accumulate optical depth independently before averaging their
transmittances. The
near cascade has a translated adaptive 6–20 km clip, the middle clip is 64 km,
and the complete far clip is at least 192 km. This receiver-resolved field
supersedes the former source-most-occluder ordering value and is sampled
directly instead of allocating a separate aerial froxel texture.

`packDirectionalSkyRadianceLobe()` writes two aligned RGBA texels. The first is
`axis.xyz, shape`; nonnegative shape is spherical-Gaussian sharpness and
negative shape stores minus the horizon angular width. The second is
`integratedRadiance.rgb, normalizationSteradians`.

The shadow cascade stores cloud-only optical transfer. The aerial froxel cache
can be populated from those cascades at camera-relative world positions; it
does not store atmosphere radiance and therefore does not become stale when
only atmospheric aerosol or exposure changes.

## Invalidation domains

`resolveDirectionalLightingInvalidation()` makes dependencies explicit:

| Change | Directional sky / hemispheres | Cloud shadow | Ground bounce | Aerial froxels |
| --- | --- | --- | --- | --- |
| Atmosphere optical state | yes | no | yes | no |
| Source direction | yes | yes | yes | yes |
| Source radiometry | yes | no | yes | no |
| Cloud density/morphology | no | yes | yes | yes |
| Ground material | no | no | yes | no |
| Camera/froxel transform | no | no | no | yes |
| Exposure only | no | no | no | no |

Exposure-only changes are tagged separately and never invalidate physical
lighting caches.

## Active renderer hookup

The physical-atmosphere graph now computes the positive directional profile
after its optical and sky-view LUTs. `physicalAtmosphereDirectionalLightingKey`
includes atmospheric optics and physical Sun/Moon geometry and radiometry, but
excludes artistic grade and exposure. The cloud-source cascades update only
when cloud state or source geometry changes.

The atlas contract is:

| Stage | Binding | Access |
| --- | --- | --- |
| Atmosphere background | group 0, binding 7 | sampled 2D array |
| Cloud transport | group 0, binding 14 | sampled 2D array |
| Cloud shadow compute | group 0, binding 31 | write-only storage 2D array |

The frame dependency order is physical atmosphere LUTs → cloud shadow
cascades → atmosphere background → cloud intervals → cloud transport →
scene-linear composite. The former half-resolution cached-lighting pass is no
longer dispatched or sampled. The atmosphere subtracts only the
cloud-occluded direct single-scattering and direct-ground terms from its clear
physical solution; diffuse and multiple scattering remain. Cloud lighting uses
the positive directional phase integral, separate upper/lower irradiance, and
cloud-shadowed Lambertian ground bounce. Finite camera-path atmosphere samples
cloud transfer at each air step, preserving depth-correct shafts. Sun and Moon
remain unchanged TOA sources and final exposure is still applied exactly once
in the composite shader.

After shader or binding edits, rebuild with:

```sh
npm run typecheck
node --test scripts/test-physical-atmosphere.mjs \
  scripts/test-directional-atmosphere-cloud-lighting.mjs \
  scripts/test-cloud-shader-contract.mjs
node scripts/validate-webgpu-shaders.mjs
npm run build
```

The browser-driven WebGPU validator must run serially on the host; it compiles
the production entry points and submits the dependency-ordered shadow,
lighting, transport, and composite graph.

## Primary and production references

- Sébastien Hillaire, “A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique,” *Computer Graphics Forum* 39(4), 2020:
  <https://doi.org/10.1111/cgf.14050>
- Sébastien Hillaire, “Physically Based Sky, Atmosphere and Cloud Rendering in
  Frostbite,” SIGGRAPH Physically Based Shading course, 2016:
  <https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf>
- Sébastien Hillaire et al., “Towards Unified and Physically-Based Volumetric
  Lighting in Frostbite,” SIGGRAPH Advances in Real-Time Rendering, 2015:
  <https://advances.realtimerendering.com/s2015/index.html>
- Fabian Bauer, “Creating the Atmospheric World of Red Dead Redemption 2: A
  Complete and Integrated Solution,” SIGGRAPH Advances in Real-Time Rendering,
  2019: <https://advances.realtimerendering.com/s2019/index.htm>
- Andrew Schneider and Nathan Vos, “The Real-time Volumetric Cloudscapes of
  Horizon: Zero Dawn,” SIGGRAPH Advances in Real-Time Rendering, 2015:
  <https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf>
- Yu-Ting Tsai and Zen-Chung Shih, “All-Frequency Precomputed Radiance Transfer
  Using Spherical Radial Basis Functions and Clustered Tensor Approximation,”
  *ACM Transactions on Graphics* 25(3), 2006:
  <https://doi.org/10.1145/1141911.1141981>
- Wrenninge et al., “Production Volume Rendering,” SIGGRAPH course notes:
  <https://graphics.pixar.com/library/ProductionVolumeRendering/paper.pdf>
- Magnus Wrenninge, “Art-Directable Multiple Volumetric Scattering,” SIGGRAPH
  Talks, 2015: <https://doi.org/10.1145/2775280.2792512>

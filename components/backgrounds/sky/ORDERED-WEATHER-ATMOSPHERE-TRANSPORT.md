# Ordered atmosphere and weather transport

## Why this exists

The former cloud fragment integrated clouds, hydrometeors, and upper media
independently, reduced each result to a `mean_depth`, and then applied one
`finite_atmosphere_to_sample()` operator at that depth. That construction can
preserve each medium's total Beer transmittance while putting its source
radiance in the wrong amount of foreground air. It also cannot represent air
inside a long cloud, rain in front of and behind cloud material, clear gaps in
a precipitation field, or interleaved upper media.

`ordered-weather-atmosphere-transport.ts` is the renderer-independent CPU
contract for replacing that architecture. Production now compiles five
bounded entry graphs: one each for low/mid/high clouds, one for hydrometeors,
and one for finite upper-atmosphere media. A fixed scalar compositor orders
their affine RGB packets by first physical interaction depth. The weather
entries co-integrate local air and weather coefficients within occupied spans,
use exact atmosphere segments across certified clear gaps, and return the
operator relative to the already-rendered clear atmosphere. This preserves the
ordered equation without reviving the monolithic Metal compiler path.

## Primary references

- [PBRT 4e, The Equation of Transfer](https://pbr-book.org/4ed/Light_Transport_II_Volume_Rendering/The_Equation_of_Transfer)
  gives the governing requirement: source radiance at each point is attenuated
  by transmittance from that point to the camera, and piecewise segments carry
  the transmittance of every preceding segment. This is the basis of the affine
  front-to-back operator used here.
- [PBRT 4e, Volume Scattering Processes](https://pbr-book.org/4ed/Volume_Scattering/Volume_Scattering_Processes)
  separates absorption, emission, in-scattering, and out-scattering and permits
  heterogeneous, wavelength-dependent coefficients. The CPU sample ABI mirrors
  that separation.
- [Hillaire, *Physically-based and Unified Volumetric Rendering in Frostbite*,
  SIGGRAPH 2015](https://www.ea.com/news/physically-based-unified-volumetric-rendering-in-frostbite)
  argues for one physically parameterized volumetric representation so global
  fog, particles, and local media can light and shadow one another instead of
  being unrelated post effects.
- [Hillaire, *Physically Based Sky, Atmosphere & Cloud Rendering in Frostbite*,
  SIGGRAPH 2016 course notes](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/s2016-pbs-frostbite-sky-clouds-new.pdf)
  treats sky, atmosphere, and clouds as interacting participating media and
  derives analytic per-step emission/absorption integration used in production.
- [Hillaire, *A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique*, EGSR 2020](https://sebh.github.io/publications/egsr2020.pdf) and
  its [MIT reference implementation](https://github.com/sebh/UnrealEngineSkyAtmosphere)
  provide the finite aerial-perspective radiance/transmittance decomposition
  already used by this renderer's physical-atmosphere path.
- [Schneider and Vos, *The Real-Time Volumetric Cloudscapes of Horizon Zero
  Dawn*, SIGGRAPH 2015](https://d3d3g8mu99pzk9.cloudfront.net/AndrewSchneider/The-Real-time-Volumetric-Cloudscapes-of-Horizon-Zero-Dawn.pdf)
  marches clouds in a curved atmosphere and explicitly integrates the cloud
  result with atmosphere and time of day over depth. Its empty-space and
  low/high-detail decisions are compatible with the finite-event marcher here;
  they do not justify collapsing an extended medium to one depth.

## Physical contract

For a segment, transport is the affine RGB operator

```text
Lout = Lsegment + Tsegment * Lin
```

For adjacent camera-to-background segments `front` and `back`:

```text
L = Lfront + Tfront * Lback
T = Tfront * Tback
```

At a sample where atmosphere, cloud, precipitation, aerosol, or an upper
species overlap, coefficients add before integration:

```text
sigma_t = sum(sigma_t_i)
j       = sum(emission_i + sigma_s_i * phase_integrated_incident_i)
```

The exact piecewise-homogeneous RGB step is then:

```text
Tseg = exp(-sigma_t * ds)
Lseg = (j / sigma_t) * (1 - Tseg)
```

with the stable zero-extinction limit `Lseg = j * ds`. RGB is never reduced to
photopic luminance for radiometry. Luminance may still weight diagnostics and
temporal reconstruction metadata.

The implementation enforces nonnegative finite coefficients and
`sigma_s <= sigma_t` per channel. It sums overlapping media independent of
input order, splits exactly at every finite support boundary, and uses adaptive
step-doubled exponential midpoint integration inside each interval. A maximum
physical step and maximum optical thickness of `0.2` prevent a smooth error
estimate from aliasing unresolved density.

An exact/LUT-backed atmosphere segment callback is allowed only across a span
with no bounded weather. Where weather overlaps air, local atmospheric
coefficients are mandatory so the coefficients can be combined. Applying a
complete air operator before or after a weather step would introduce a false
ordering inside that step.

Because the resolved atmosphere texture already contains the directional
cloud-shadow loss, call its operator `A'`. An occupied weather pass returns a
relative operator `W`, not a second copy of the atmosphere. If `C` is transport
formed by co-integrating identically shadowed air and weather from the camera
through the bounded layer and `Tweather` is Beer transmittance accumulated from
weather extinction alone, the invariant is:

```text
W.L = C.L - Tweather * A'.L
W.T = Tweather
W(A'(B)) = C(B)  for every boundary radiance B
```

`W.L` is a signed correction. It may be negative where cloud shadow removes
clear-air in-scattering, so sanitization must preserve finite negative values.
Passivity applies to the physical `A'` and `C` operators and to
`0 <= Tweather <= 1`; clamping `W.L` would break exact reconstruction and add
energy. Tracking `Tweather` independently also avoids an unstable `C.T / A.T`
division when both atmosphere transmittances underflow near the horizon. The
camera prefix, empty gaps, occupied events, and support tail all use this same
shadowed background basis; reverting any one span to unshadowed `A` removes its
cloud-shadow loss twice at final composition.

## Current production WGSL

The three `cloud_fragment_physical_layer` specializations apply the cloud part
of the contract as follows:

1. Use exactly one unwarped `view_direction(input.uv)` shared with the physical
   atmosphere and recompute the three curved cloud-shell intervals on that
   ray. The interval textures remain scheduling data, not ray geometry.
2. Call the existing full-quality `march_layer()` independently for low,
   middle, and high cloud. Each marcher seeds both its coupled and background
   paths with the cloud-shadowed camera-to-shell atmosphere prefix, then integrates local air
   extinction/source and cloud extinction/source in the same exponential event
   throughout the shell. Cloud-empty strata use the same shadowed atmosphere
   segment on both paths so they cancel algebraically. Sheet families use the
   same ordering at their ascending Gauss-Legendre events.
3. Form the background-atmosphere-relative layer operator directly from the coupled
   path, background path, and independently tracked cloud Beer transmittance. The
   packet wrapper only applies editorial coverage and sanitizes non-finite
   transport/depth/work metadata; it no longer wraps cloud radiance in air at
   `mean_depth`. Finite signed relative radiance is preserved.
4. Order the three packets by first interaction depth with the fixed sorting
   network `(low,middle)`, `(middle,high)`, `(low,middle)`, then compose them
   front-to-back with RGB affine transport.
5. Preserve the existing first-depth, opacity-weighted mean depth, motion,
   dominant-layer, optical-depth, opacity, and evaluated-step G-buffer fields.

`hydrometeor_fragment_physical` and
`upper_atmosphere_fragment_physical` apply the remaining contract:

1. Scan finite world support boundaries without function-private 96- or
   36-record interval arrays.
2. Resolve physical step targets per active record and enforce RGB optical
   thickness no greater than `0.2`.
3. Sum all overlapping record extinction and source coefficients before one
   exponential integration event.
4. Co-integrate local air in occupied weather spans and retain an independent
   clear-air operator for exact relative composition.
5. Preserve hydrometeor parent system/layer ownership. Boundary fog, ice fog,
   mist, and diamond dust use their explicit `(-1,-1)` region ownership and
   never sample an arbitrary cloud owner.
6. Encode hydrometeor and upper-atmosphere results into packet slices three and
   four. The fixed five-packet insertion network composes them with low/mid/high
   cloud by first interaction depth.

`cloud_fragment_ordered_experimental` remains retained as a source-level
unified reference:
it builds support events for finite cloud owners, hydrometeor records, and
upper morphology owners; co-marches local air and weather coefficients; skips
certified clear gaps; and emits the clear-atmosphere-relative operator. Its
scalar active-set cache removes the former large private support arrays, but
the renderer does not select this entry until pipeline compilation and GPU
qualification are complete.

The production camera path remains the selected production perspective:
exactly the unwarped `view_direction(input.uv)` shared by the physical
atmosphere. No additional camera or perspective variants are introduced by the
transport integration. Sky Lab framing may still alter coverage, but it does
not warp one production cloud layer onto a different camera ray from another
layer or the atmosphere.

The existing `CameraTransport { radiance: vec3, transmittance: vec3 }` ABI and
two-layer RGB history texture remain valid. This change needs no additional
MRT and does not alter final grade/tone-map ordering.

## Required GPU tests

- Homogeneous air, cloud, rain, and upper slabs match the analytic operator per
  RGB channel.
- Two noncommuting radiance-bearing slabs reverse appearance when their world
  depths reverse; input buffer order cannot change the result.
- Overlap equals the analytic sum of coefficients, not alpha composition.
- A weather-free gap uses the atmosphere segment path exactly; an occupied
  span samples local air.
- Bounded media behind the receiver or beyond the ground/top-atmosphere event
  contribute nothing.
- A nonemissive medium with incident radiance bounded by a known ceiling cannot
  raise the ray above that ceiling.
- Step refinement converges against a dense CPU reference and never accepts a
  segment above the optical-depth limit unless an explicit diagnostic reports
  a refinement-limit failure.
- The extended frontal-system regression in
  `scripts/test-ordered-weather-atmosphere-transport.mjs` must remain. The old
  representative-depth architecture exceeds 12% radiance error there while
  matching total transmittance, proving that a Beer-only comparison cannot
  qualify the integration.

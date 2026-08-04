# Receiver-depth-resolved cloud visibility

This foundation replaces the old logical model of one full-column Beer value
plus one source-most occluder depth. That representation cannot distinguish a
receiver between two separated clouds from a receiver behind both clouds.

For source direction `s`, texel footprint nodes `x_j`, and receiver source
depth `d`, each of four fixed lateral sub-rays first forms cumulative RGB
optical depth, and the field stores their mean Beer visibility:

```text
tau_j(d) = integral(d -> source exterior, sigma_t(x_j + t s) dt)
V_s(x, d) = (1 / 4) sum_j exp(-tau_j(d))
```

Optical depth remains additive across owners and layers **within each coherent
sub-ray**. It is deliberately not averaged across the footprint: Beer transport
is nonlinear, so `exp(-E[tau])` turns an opaque/clear partial footprint into a
recognizable dark-grey stamp. Storing `E[exp(-tau)]` preserves the correct
fractional visibility. Positive spatial filtering and monotone depth/cascade
interpolation then operate directly on bounded visibility.

## Bounded production contract

- two stable source slots: Sun and Moon;
- three source-plane cascades per source;
- 32 receiver-depth knots per cascade;
- one existing atmosphere-profile layer;
- `96 x 96 x 193`, `rgba16float`;
- 13.5703125 MiB;
- one 176-byte domain/generation/translated-clip uniform;
- one 3.26953125 MiB two-word finite-owner slab-mask buffer;
- 16.83984375 MiB total visibility GPU memory, below a fixed 20 MiB ceiling;
- `2 x 2 x 32` compute workgroup, 128 invocations and 4.25 KiB workgroup memory;
- `48 x 48 x 6` dispatch.
- zero producer calls into the procedural view-medium graph;
- at most 13,713,408 hierarchy-gated quadrature sites; four consumer fetches in
  one cascade and a bounded eight only inside a cascade blend band.

Layer zero remains the directional-atmosphere profile. Visibility layer indices
are:

```text
1 + ((source * 3 + cascade) * 32 + depthKnot)
```

The 193 layers stay below WebGPU's guaranteed 256-layer 2D-array ceiling. The
producer reuses the camera renderer's two mipmapped high-ice appearance
volumes and filtering sampler; it adds no new texture allocation or render
attachment. The read-only mask buffer is 428,544 records: one record per source/cascade,
`2 x 2` plane tile, and receiver-depth interval.

## Finite world domains

`cloud-radiative-domain.ts` constructs one conservative curved-Earth OBB per
physical owner. It includes the formation boundary and every packed morphology
bound. Projection uses the same east/north/up source basis as the atmosphere
solver. The middle cascade remains observer-centred at 64 km. The near cascade
uses a bounded 6–20 km half-extent and a translated source-plane centre derived
from all receiver-important owners. Compact C1 weights and an observer anchor,
not a nearest-owner winner, make tied-owner handoff deterministic and
continuous. The far extent is observer-centred, at least 192 km, and expands to
enclose every projected finite owner with the complete two-texel reconstruction
support kept in true exterior. Every translated inner square is geometrically
nested inside its successor.

Each source/cascade uniform record is:

```text
minimumSourceDepth, maximumSourceDepth, inverseDepthSpan, planeHalfExtent
```

Three additional `vec4` records pack the six source/cascade plane centres. All
active cascades for one source share the complete finite-owner source-depth
range. Consequently, an owner crossing a lateral cascade boundary cannot
reparameterize existing depth knots. Every cascade also carries cascade zero's
source-wide warp-reference extent, including an empty near owner mask. When the
complete range is wider than twice that reference, one asinh map concentrates
knots near the observer; the CPU slab masks, every GPU cascade producer, and
the consumer use the same physical knots and exact forward/inverse mapping.

An inverse span of zero is an empty, exactly clear domain with visibility one.
Receivers sourceward of the maximum also have visibility one. Receivers anti-
source of the minimum use the complete knot-zero visibility. Nested cascades
blend visibility directly, never an effective optical depth. The far
cascade never fades to clear; points outside it are clear because all finite
owner projections are provably inside it.

## Production GPU integration

Before dispatch, the CPU projects each finite curved-world owner OBB into the
same source-plane/depth coordinates as the cascade. It rasterizes owner bits
only into slabs whose complete `2 x 2` producer footprint and complete
depth interval overlap that projection. Morphology bounds are already part of
the OBB, so this hierarchy may admit a cheap false positive but cannot cull a
participating owner. Empty slabs stop before morphology, texture, density, or
material work.

The production compute pass still assigns four source-plane columns to one
workgroup and retains all 96 plane texels and 32 depth knots. Each of the four
positive square-texel Gauss supports defines one fixed source-parallel ray.
Both positive depth Gauss nodes integrate each ray in every depth interval.
The four complete suffix scans run sequentially through the same two workgroup
arrays, retaining the exact `2 depth x 4 lateral` query count and bounded
storage without ever exchanging a lateral identity between depth intervals.

For a nonempty slab, set-bit traversal visits only the finite owners named by
that slab. Each requested base/placement/reuse position first probes the
owner's conservative 8-cubed brick majorant, then takes one trilinear sample of
the 48-cubed RGBA macro atlas. The producer integrates out high-frequency
signed boundary displacement into a continuous, conservative low-pass support;
it does not evaluate exterior SDF displacement, six-tap SDF normals,
`density_at`, or the separate local-material traversal. High-cloud owners do
sample the same two stationary, mipmapped 3-D ice fields as the camera. Their
explicit LOD comes from the combined source-plane Gauss footprint and the
receiver-depth subinterval's second moment, so a cascade cannot replace a
textured cloud with a smooth unrelated core. Ci fibratus additionally passes
the source direction and finite Gauss subinterval into its shared analytic
fibre covariance, conserving narrow-streamer mass instead of promoting one
point hit to a complete depth knot. Density, morphology optical remaps, local
ice fraction, and spectral mass extinction are fused into one additive RGB
extinction result per owner. Thus the old 20,570,112 full procedural medium
evaluations are eliminated rather than merely spread across the first frame.
The adaptive-near deterministic compact-Cu qualification activates 1,237,024
hierarchy quadrature sites, a 90.98% cull of the fixed 13,713,408-site lattice.
Two coincident owners retain those same active sites and require 2,474,048
owner-candidate evaluations. An unmodified owner needs one majorant/atlas pair
at each survivor; placement and reuse morphology can request at most three such
pairs without reopening the procedural graph.

For each fixed ray, a five-stage workgroup suffix scan produces cumulative
optical depth at all 32 knots. The producer exponentiates that ray, averages the
four RGB Beer products, and stores bounded visibility. Consumers reconstruct
each visibility knot with one positive hardware-linear tent lookup, then use
monotone cubic Hermite reconstruction along source depth. They never
exponentiate an averaged field. The producer footprint integral suppresses
point-sampled blocks without imposing a zero-slope plateau at every texel
centre. Four knot fetches serve
an interior query; a lazy second four-fetch lookup occurs only in the 0.76–0.96
cascade transition, where visibility is mixed directly. Source-plane
containment is tested before either cascade is sampled. Receiver depth is its
own atlas coordinate and never selects a spherical cascade shell.

The visibility field is the authoritative cloud-only receiver-to-source direct
visibility for clear-atmosphere loss, finite aerial transport, ground direct
irradiance, camera cloud events, finite hydrometeors, and upper-atmosphere
ice/aerosol material. A camera event samples it once per enabled source.
The strict camera ceiling is therefore two queries and sixteen texel fetches
when both Sun and Moon lie in cascade blend bands; outside those narrow bands
each query uses four fetches.
Atmospheric source transfer remains owned separately by
`physical_source_irradiance_at`; resident light-volume Beer, missing-owner
residual tau, and the global atlas are never multiplied together. The cloud
light volume remains a higher-order P1 radiance cache rather than a second
direct-visibility owner.

Clear-atmosphere loss is integrated as a camera-path volume, not drawn as a
screen-space shaft. This long, radiometrically low-frequency integral samples
the complete far cascade at every node, giving the entire path one uniform
world-space band-limit. It never crosses the near/middle cascade surfaces;
those full-resolution transitions remain available to direct cloud, ground,
and finite-weather receivers. Thirty-two elevation-adaptive intervals use a two-node
Gauss rule over the pointwise removed-source integrand. Every node is weighted
by the exact clear-air camera transfer obtained from the same-ray atmosphere-
LUT quotient. The observer boundary term is invariant and fetched once per
pixel; each loss node adds only its endpoint lookup. A sampled source coefficient is never averaged and promoted
through a complete interval. Intervals whose two nodes materially disagree or
contain partial shadow switch to an embedded five-node Gauss-Kronrod rule that
retains both base nodes and adds exactly three samples. The explicit worst case
is therefore 160 loss nodes. Downward rays use the reciprocal-direction quotient
and ground loss uses the exact full camera-to-ground transfer. This preserves
genuine crepuscular structure without horizontal whole-stratum shelves.

The visibility production pass remains independent of the six-brick cloud
light volume and integrates every finite owner/layer exactly once. Its complete
generation publishes atomically. Owner-local P1 data may enrich higher-order
scattering, but cannot gate or duplicate direct Beer visibility.

Visibility masks and Beer visibility invalidate together for cloud
density/morphology/extinction, source enabled state, advection epoch, source
direction, observer/cascade anchor, or
finite-domain changes. Source radiometry, atmospheric optics, exposure,
palette, and grade do not otherwise invalidate cloud-only visibility. The
physical-atmosphere directional profile writes only layer zero before the cloud
suffix-scan pass writes layers 1-192; atmosphere and external-medium consumers
run only after both updates have been encoded.

`test-directional-cloud-visibility.mjs` qualifies analytic homogeneous and
coherent separated slabs, a Jensen partial-coverage rejection, near-clear
half-float storage, overlapping owner order invariance, finite exterior behavior,
near-horizon projections, adaptive tied-owner handoff, translated cascade
containment, cascade transitions, deterministic packing, broad-span depth-warp
orientation/inversion and shared physical knot positions (including an empty
near cascade with far-only owners), per-texel separable mixed-moment rejection,
32-knot error against a 128-step reference,
continuous source/owner motion,
monotone C1 depth reconstruction, positive linear lateral reconstruction, deterministic
finite-owner slab rasterization (including both owner words), zero procedural
producer queries, fixed texture/buffer/query ceilings, and atomic generation
publication.

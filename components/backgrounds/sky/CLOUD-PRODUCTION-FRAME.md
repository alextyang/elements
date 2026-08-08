# Cloud production frame contract

The generative weather runtime now has one bounded production-frame boundary
between persistent meteorological owners and GPU scheduling. It is deliberately
separate from the legacy packed cloud-system buffer so migration can proceed
without changing current pixels in one unreviewable patch.

## Frame assembly

`compileCloudProductionFrameV1()` accepts the V2 owner, feature, and event
records emitted by conditioned or free-running generation and produces:

- fixed-capacity owner and feature buffers using the V2 ABI;
- one deduplicated lifecycle-event buffer and bounded reference table;
- globally rebased owner-to-feature ranges;
- a camera-independent horizontal spatial index;
- exact ray/AABB intervals ordered by physical depth;
- per-owner temporal history decisions based on stable owner identity,
  generation, advection, topology, material, condensate, phase, features, and
  lifecycle events;
- validation issues and a deterministic frame fingerprint.

Capacity overflow is observable. Owners, features, events, references, and
spatial memberships are counted as dropped rather than writing beyond a GPU
allocation or silently changing record stride.

The generation API always returns a compact frame summary. Full numeric buffers
are JSON-serialized only when `includeProductionBuffers` is explicitly true;
production renderer code should upload the typed arrays directly.

## Temporal rules

History follows owner identity, never array position. Expected advection is
removed before displacement is evaluated. History is invalidated for schema,
generation, topology, material, recipe, age-regression, and current-step
birth/merge/split/death events. It is attenuated for large extent, condensate,
phase, feature-set, glaciation, and precipitation changes. Retired and newly
born owners receive zero history weight.

Lifecycle events are considered only when their timestamp lies in the current
frame interval. Historical birth or merge records therefore cannot invalidate a
stable owner forever.

## Pass parity

`qualifyCloudPhysicalPassParity()` compares camera, light-volume, atmospheric
shadow, hydrometeor, and reference providers at identical world positions and
simulation time. It rejects disagreement in:

- owner, feature, or material identity;
- support or density;
- liquid and ice condensate;
- effective radii;
- precipitation source;
- temperature, velocity, or gradient.

This is the acceptance harness for migrating each production pass to
`CloudPhysicalSampleV1`. A pass is not considered migrated merely because it
can read V2 owner records.

## Integration boundary still open

These modules establish GPU-ready records, conservative culling, temporal
identity, and a measurable parity gate. The live WebGPU graph still needs to:

1. allocate and upload the V2 frame buffers;
2. bind the shared physical sampler in camera, light-volume, atmosphere-shadow,
   and hydrometeor shaders;
3. consume per-owner history decisions during reprojection;
4. compare those passes through the parity harness before deleting the legacy
   buffer path.

Until those steps and photographic evidence pass, support maturity remains
conservative.

## Validation

```sh
node --test scripts/test-cloud-production-frame.mjs
```

The test executes buffer flattening and truncation, global feature rebasing,
event deduplication, spatial DDA traversal, ordered ray intervals, temporal
reuse/invalidation/retirement, frame aggregation, API bounds, and cross-pass
physical-sample parity.

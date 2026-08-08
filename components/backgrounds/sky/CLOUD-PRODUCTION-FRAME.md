# Cloud production frame contract

The cloud system now has one bounded production-frame boundary between
persistent meteorological owners and GPU scheduling. It remains deliberately
separate from the legacy shipping cloud-system buffer so migration can proceed
with measurable parity instead of changing every production pass in one
unreviewable patch.

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

## GPU upload boundary

`createCloudProductionGpuUploadPlanV1()` prepares fifteen fixed storage
bindings covering:

- production header, owner, feature, lifecycle-event, and event-reference data;
- spatial-grid header, cells, and owner references;
- temporal header, timing, decisions, reason masks, and reuse weights.

`CloudProductionGpuSessionV1` owns one persistent allocation set, advances
history from the previously uploaded frame, rejects truncated frames by default,
uploads through `queue.writeBuffer()`, exposes sorted bind-group entries, and
destroys every allocation exactly once. The runtime is expressed through small
WebGPU-compatible interfaces so it can be tested without fabricating a browser
GPU result.

`resolvePackedCloudPhysicalSampleV1()` and
`createCloudProductionPhysicalSampleWgsl()` decode the same owner and feature
lanes into support, density, liquid and ice condensate, effective radii,
precipitation source, velocity, age, temperature, and stable identities. Feature
records therefore modify the parent physical sample instead of becoming an
unowned density overlay.

## Shipping-runtime shadow migration

`adaptCloudSystemRuntimeV2()` converts the current shipping runtime's finite
owners into V2 records without changing rendered pixels. It preserves the
selected recipe, material, atlas variant, world extent, thermodynamics,
kinematics, condensate, lifecycle, and owner identity.

Legacy morphology assignments remain explicit warnings. A shadow frame cannot
claim production readiness while its attached features still depend on the
legacy modifier buffer. Duplicate owner identities or invalid V2 records fail
the migration.

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

## Owner-indexed physical sampling

`sampleIndexedCloudWeatherPhysicalV1()` uses the production spatial index as a
conservative broad phase, checks three-dimensional owner bounds, and evaluates
only the remaining physical owners. It then uses the same mass-aware sample
composition as the exhaustive path.

`qualifyIndexedCloudWeatherSamplerV1()` compares exhaustive and indexed results
through the five-pass parity harness and reports actual owner evaluations and
the measured reduction fraction. `/api/cloud-generation` publishes this bounded
diagnostic over the same Gate A sample lattice, so an acceleration is rejected
when it changes condensate, phase, identity, precipitation, motion, or geometry.

This is the CPU reference for later tile, cluster, or occupied-brick owner lists.
It does not imply that the current shipping shader already skips owners.

## Pass parity and Gate A

`qualifyCloudPhysicalPassParity()` compares camera, light-volume, atmospheric
shadow, hydrometeor, and reference providers at identical world positions and
simulation time. It rejects disagreement in:

- owner, feature, or material identity;
- support or density;
- liquid and ice condensate;
- effective radii;
- precipitation source;
- temperature, velocity, or gradient.

`qualifyCloudGateA()` joins that parity result to frame validation, GPU upload
completeness, and a machine-readable live-migration ledger. It deliberately
separates:

- **contract ready** — bounded buffers, upload planning, and shared-provider
  parity pass; from
- **Gate A ready** — every shipping pass is live-integrated and the same parity
  evidence still passes.

The generation API exposes this summary. The current branch can demonstrate the
contract while still reporting camera transport, light volumes, atmosphere
shadows, hydrometeors, temporal reprojection, and remaining morphology
migration as blockers. This prevents an adapter test from being mistaken for a
shipping renderer milestone.

## Real-browser WGSL probe

`/cloud-production-probe` compiles the generated packed physical-sample decoder
with the browser's actual `GPUShaderModule`, awaits compilation diagnostics, and
checks a validation error scope. The page remains a diagnostic module probe: a
pass does not qualify the composed shipping pipelines and does not promote a
cloud route's support maturity.

With an Elements server running, execute the bounded browser qualification:

```sh
npm run cloud:production:probe
```

The command uses the repository's `playwright-cli` harness, waits only for an
explicit `passed`, `failed`, or `unavailable` state, fails closed for every state
except `passed`, and preserves the complete transcript under
`output/cloud-production-probe/`. A source build is not substituted for this
real-adapter result.

## Integration boundary still open

The live WebGPU graph still needs to:

1. instantiate `CloudProductionGpuSessionV1` beside the existing device graph;
2. use its fixed bindings in camera, light-volume, atmosphere-shadow, and
   hydrometeor pipelines;
3. consume packed per-owner history decisions during reprojection;
4. convert all remaining production morphology into the shared physical sample;
5. run real composed-WGSL, photographic, temporal, and device qualification
   before deleting the legacy buffer path.

Until those steps and evidence pass, support maturity remains conservative.

## Validation

```sh
node --test \
  scripts/test-cloud-production-frame.mjs \
  scripts/test-cloud-production-gpu-session.mjs \
  scripts/test-cloud-production-physical-sample-wgsl.mjs \
  scripts/test-cloud-gate-a-qualification.mjs \
  scripts/test-cloud-runtime-v2-adapter.mjs \
  scripts/test-cloud-production-shader-probe.mjs \
  scripts/test-cloud-production-shader-qualification.mjs \
  scripts/test-cloud-indexed-physical-sampler.mjs
```

These tests cover bounded flattening and truncation, global feature rebasing,
event deduplication, spatial DDA traversal, ordered ray intervals, temporal
reuse/invalidation/retirement, allocation reuse and destruction, fail-closed
uploads, CPU/WGSL record agreement, Gate A truthfulness, live-pass parity
requirements, shipping-runtime V2 shadow frames, real-browser probe contracts,
the bounded browser qualification runner, and owner-indexed parity with measured
evaluation reduction.

# Generative cloud runtime

This module set establishes the camera-independent runtime shared by conditioned
cloud synthesis and free-running weather generation. It is deliberately a
reduced-order deterministic weather model, not a numerical weather prediction
or computational-fluid-dynamics system.

## Shared representation

`cloud-physical-sample.ts` defines the authoritative physical sample used by
camera transport, source visibility, hydrometeors, diagnostics, and strict
reference transport. A sample owns bounded support, density, differential
geometry, velocity, age, liquid and ice condensate, effective radii,
precipitation source, turbulence, temperature, and stable owner/feature/material
identities.

`combineCloudPhysicalSamples()` is the overlap rule for multi-owner transport.
Camera and source rays can therefore use the same mass-aware sample callback;
features cannot alter camera density while remaining absent from light
transport.

`cloud-generated-physical-sampler.ts` evaluates deterministic weather owners
and their attached features through that sample contract. The strict reference
renderer consumes this exact callback for both camera and source rays, giving
the current WGSL migration a concrete parity target rather than a second density
implementation.

`cloud-system-abi-v2.ts` provides the migration boundary from the current
compiled representation:

- one fixed owner record;
- one separate feature buffer;
- one lifecycle-event buffer;
- explicit physical-sample and ABI schema versions;
- stable owner and feature identities;
- packing and validation functions;
- a structural V1-to-V2 migration adapter.

The existing renderer can continue to use its current compact ABI while the V2
bridge is integrated path by path. New dynamic semantics should be added to V2
rather than hidden in old packed fields.

## Generation modes

### Conditioned synthesis

`createConditionedCloudRuntime()` accepts a target taxonomy, physical domain,
forcing, seed, and optional owner count. The target selects a reachable initial
state; subsequent morphology, phase, precipitation, classification, and
features are derived from the evolving physical owner.

Rare upper-atmospheric targets use the same owner and event representation as
tropospheric clouds. They are not screen-space overlays.

### Free-running generation

`createFreeRunningCloudRuntime()` accepts only the weather domain, forcing, and
seed. Owner birth depends on moisture, stability, convergence, fronts, terrain,
and radiative forcing. Taxonomy is inferred after each physical update.

Both modes compile to:

1. a persistent `CloudWeatherSimulation`;
2. the existing `CloudScene` authored-owner contract;
3. `CompiledCloudSystemV2` owner, feature, and lifecycle buffers.

No generation API accepts a camera or qualification framing parameter.

## Fixed-step processes

Every update uses deterministic random streams keyed by global seed, owner ID,
process name, simulation step, and stream index. The fixed-step engine performs:

- world-space advection and wind shear;
- condensation and evaporation/sublimation;
- buoyant growth and bounded cloud-top development;
- entrainment and turbulent erosion;
- liquid-to-ice conversion above the freezing level;
- condensate-owned precipitation, loading, downdrafts, and cold pools;
- cloud-top radiative cooling for boundary-layer decks;
- high-ice stretching and sedimentation;
- owner birth, merge, split, decay, and death;
- parent-owned feature attachment, evolution, and detachment;
- cold-pool influence edges between owners;
- camera-independent overlap, shadow, precipitation-through-layer, anvil
  stabilization, and lineage relationships in `cloud-interaction-model.ts`;
- physical-state-to-taxonomy classification.

The convective vertical slice continuously traverses Cumulus humilis,
mediocris, congestus, Cumulonimbus calvus, capillatus/incus, precipitation, and
decay without replacing the source owner with an unrelated recipe. The
boundary-layer slice supports controlled fog/Stratus, cellular
Stratocumulus, fragmented clearing, and decay through changes in sounding,
surface humidity, heat, radiative cooling, and subsidence.

## Strict reference transport

`cloud-reference-transport.ts` is a slow CPU reference path over the same
physical sample callback. It provides stratified primary integration,
source-path optical depth, material-dependent phase, bounded higher-order
scattering, atmosphere radiance coupling, and optional restrained ice/twilight
spectral correction.

It is a diagnostic ground truth for separating geometry/weather defects from
real-time transport bias. It is not an offline spectral path tracer and should
not be treated as final electromagnetic validation for oriented ice crystals.

## Evidence and release gates

`cloud-qualification-evidence.ts` defines immutable baseline, still, sequence,
blind-review, and artifact provenance records. Its generated plan requires at
least three seeds, three independent cameras, side/back/twilight/moon lighting,
camera-motion sequences, and lifecycle sequences.

The photographic gate requires:

- genus top-1 recognition of at least 90%;
- species/key-feature top-1 recognition of at least 75%;
- species/key-feature top-2 recognition of at least 90%;
- at least 85% expert near-photorealistic ratings;
- zero critical physical or temporal failures;
- strict-ready stills and both motion sequence classes.

`cloud-performance-qualification.ts` defines ten adversarial stress scenes,
five device classes, three quality tiers, full-frame/component timing budgets,
memory, cadence, reconstruction, visual-equivalence, duration, and device-loss
gates. A performance result fails when visual equivalence is reduced to meet a
timing target.

## Baseline capture

After the renderer has emitted the required files, create an immutable baseline
manifest with:

```sh
node scripts/create-cloud-baseline-manifest.mjs \
  --id baseline-cu-congestus \
  --route base:cumulus:congestus \
  --renderer-revision <commit> \
  --seed 42 \
  --simulation-fingerprint <fingerprint> \
  --simulation-step 120 \
  --camera-signature oblique-natural:v1 \
  --environment day-oblique-natural \
  --mode conditioned \
  --artifact canonical-render=<path> \
  --artifact density-debug=<path> \
  --artifact owner-debug=<path> \
  --artifact material-debug=<path> \
  --artifact phase-debug=<path> \
  --artifact light-volume-debug=<path> \
  --artifact motion-sequence=<path> \
  --artifact lifecycle-sequence=<path> \
  --artifact timing-telemetry=<path> \
  --artifact reconstruction-telemetry=<path> \
  --output <manifest.json>
```

The command hashes every artifact and atomically writes the manifest. It does
not manufacture missing captures.

## Current integration boundary

The new runtime and V2 contracts are production-consumable, but the current
WGSL transport has not yet been completely migrated to `CloudPhysicalSampleV1`.
Until camera transport, light-volume generation, atmospheric shadowing, and
hydrometeors all call the same V2 sample implementation, Gate A remains open.
Likewise, no route becomes photograph-, time-, or device-qualified merely from
these deterministic unit tests; those levels require captured evidence.

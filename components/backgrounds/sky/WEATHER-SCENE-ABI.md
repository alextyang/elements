# Production weather-scene contract and uniform ABI

`weather-scene.ts` is the renderer-independent production authoring boundary
for finite weather media and optical/emissive events. It resolves through the
existing physical constructors in `weather-optical-phenomena.ts`; qualified
storm events additionally pass through
`createDeepConvectionLightningEventContract`. This layer does not reproduce or
replace any scattering, charge, hydrometeor, aerosol, or auroral physics.

The scene has a deterministic snapshot clock and contains at most:

| State | Capacity |
| --- | ---: |
| droplet optical owners | 36 |
| oriented-ice optical owners | 36 |
| lightning events | 1 |
| lightning channel segments | 128 |
| lightning pulses | 4 |
| auroral curtains | 4 |
| blowing boundary media | 8 |

Optical and lightning records carry the integer index of their authoritative
finite world owner. No screen coordinate, camera property, viewport mask,
exposure, alpha, bloom, or compositing control is authorable here.

## Rejection policy

Each input is resolved by its physical constructor. Entries with invalid
finite ownership, inadmissible optics, impossible charge topology, non-finite
resolved values, or excess local feature counts are rejected and reported in
`diagnostics`. Capacity overflow is also a diagnostic and only the bounded
prefix is inspected. Thus tools can display every accepted state and every
rejection in one result, but `ResolvedProductionWeatherScene.valid` is false if
anything was rejected. The uniform packer refuses any such partial result.

This preserves category boundaries. In particular, an active eruption plume
cannot be relabeled as resuspended volcanic ash; it is rejected by the existing
blowing-medium physics and never reaches the payload.

The clock stores snapshot time, authored scene time, and an exact unsigned
32-bit seed (two 16-bit float-exact lanes). GPU animation time is:

`sceneTime + max(0, currentMonotonicTime - snapshotTime)`

The CPU also resolves the stable f32 shader seed once. Repacking the same
authoring is byte-deterministic.

## Fixed uniform

`weather-scene-abi.ts` packs one zero-initialized `Float32Array`. Every member
is addressed as a `vec4<f32>`; there are no runtime arrays, storage buffers, or
implicit host-language struct layouts. The payload is 2,832 vec4s / 45,312
bytes, below WebGPU's guaranteed 65,536-byte maximum uniform binding and padded
to a 256-byte dynamic-offset boundary.

All offsets below are exact from the start of the buffer:

| Region | Vec4 offset | Byte offset | Capacity | Vec4 stride | Byte stride |
| --- | ---: | ---: | ---: | ---: | ---: |
| header | 0 | 0 | 1 | 16 | 256 |
| droplet owners | 16 | 256 | 36 | 32 | 512 |
| oriented-ice owners | 1,168 | 18,688 | 36 | 32 | 512 |
| lightning event | 2,320 | 37,120 | 1 | 8 | 128 |
| lightning segments | 2,328 | 37,248 | 128 | 3 | 48 |
| lightning pulses | 2,712 | 43,392 | 4 | 3 | 48 |
| auroral curtains | 2,724 | 43,584 | 4 | 10 | 160 |
| blowing media | 2,764 | 44,224 | 8 | 8 | 128 |
| unpadded end | 2,828 | 45,248 | — | — | — |
| padded end | 2,832 | 45,312 | — | — | — |

`Float32Array` construction guarantees zeroed storage. The packer writes only
accepted records, so every unused record, unused feature/lobe slot, reserved
header lane, and final alignment vector remains exactly zero.

## Header vectors

| Vec4 | Lanes |
| ---: | --- |
| 0 | schema, total vec4s, total bytes, valid flag |
| 1 | snapshot seconds, scene seconds, seed low 16 bits, seed high 16 bits |
| 2 | shader seed, droplet count, ice count, lightning-event count |
| 3 | lightning-segment count, pulse count, aurora count, blowing count |
| 4 | droplet, ice, aurora, and blowing capacities |
| 5 | lightning-event, segment, pulse, and exact owner-index capacities |
| 6 | droplet, ice, lightning-event, and lightning-segment vec4 offsets |
| 7 | pulse, aurora, blowing, and padded-end vec4 offsets |
| 8 | droplet, ice, lightning-event, and lightning-segment vec4 strides |
| 9 | pulse, aurora, blowing, and header vec4 strides |
| 10 | east/altitude/north coordinate code, schema, lobe cap, ice-feature cap |
| 11–15 | reserved zero |

## Record vectors

Droplet record base vectors 0–7 hold activity/schema/owner/seed, finite owner,
size distribution, lobe/corona counts, replacement energy, and corona state.
Vectors 8–31 contain six fixed four-vector spectral-lobe slots: center plus
kind, sigma, energy, and normalization.

Oriented-ice record base vectors 0–7 hold activity/schema/owner/seed, finite
owner, source elevation and feature mask, source/up directions, full habit and
orientation distribution, effective radius, and replacement energy. Vectors
8–31 contain six fixed four-vector feature slots: kind plus energy,
normalization, spectral angle, and the two angular widths.

The lightning event stores topology, seed, owner index, event time, finite
convective owner, charge-region geometry, total length, and exact counts. Each
segment stores start/radius, end/emissive weight, parent index, and branch
order. Each pulse stores timing, current/energy/normalizations, and spectrum.

Aurora records store finite shell ownership, world sheet geometry, folding,
drift, magnetic field, geomagnetic/solar state, altitude normalization, and
column emission. Blowing records store world ellipse/vertical support, wind,
visibility, extinction, albedo, asymmetry, particle size/density, provenance,
and volcanic-ash optical class.

## Binding status

`WEATHER_SCENE_UNIFORM_WGSL` is intentionally binding-free.
`createWeatherSceneUniformDeclaration(group, binding)` emits a caller-selected
`var<uniform>` declaration for a future production integration. No renderer or
bind-group code is changed by this slice.

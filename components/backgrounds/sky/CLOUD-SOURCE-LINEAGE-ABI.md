# Cloud source and lineage uniform ABI

This contract carries finite special-origin emission manifolds and real
cross-owner mother-cloud relationships to every GPU transport path. It is
renderer-independent: no camera, projection, exposure, editorial framing, or
screen-space mask participates in creating a record.

The implementation is split between:

- `cloud-special-origin-source.ts`: the existing physical source state,
  material mixture, and retrieval-informed aerosol envelope.
- `cloud-source-lineage-abi.ts`: validation, ownership resolution, bounded
  packing, conservative ray scheduling, and a CPU reference evaluator.
- `cloud-source-lineage-wgsl.ts`: the binding-free uniform decoder, compact
  support evaluator, owner-density rule, and conservative support interval.

## Primary physical and API references

- WMO International Cloud Atlas special origins and mother clouds:
  <https://cloudatlas.wmo.int/en/clouds-special.html> and
  <https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html>
- NASA ARCTAS spectral absorption of biomass-burning aerosol:
  <https://esdpubs.nasa.gov/content/Spectral_absorption_of_biomass_burning_aerosol_determined_from_retrieved_single_scattering>
- NASA MISR volcanic-ash retrieval (coarse, nonspherical, absorbing ash):
  <https://ntrs.nasa.gov/citations/20220014390>
- NASA contrail ice-nucleation dependence on soot, altitude, and temperature:
  <https://ntrs.nasa.gov/citations/20230016907>
- NASA Deep Blue definitions and retrieved aerosol size/SSA distinctions:
  <https://earth.gsfc.nasa.gov/climate/data/deep-blue/science>
- W3C WebGPU limits and WGSL uniform/alignment contracts:
  <https://www.w3.org/TR/webgpu/> and
  <https://www.w3.org/TR/WGSL/#alignment-and-size>
- Frostbite's unified participating-media integration is the architectural
  precedent for evaluating the same local medium in view, shadow, and light
  transport: <https://www.ea.com/news/physically-based-unified-volumetric-rendering-in-frostbite>

The RGB coefficients are bounded visualization envelopes, not an inversion of
one particular fire, volcano, fuel, engine, or plume observation. They preserve
the retrieved qualitative regimes: fine smoke has stronger spectral slope and
short-wave absorption; coarse ash has a low Ångström exponent; water/mineral
spray is almost conservative. Cloud liquid/ice still uses the existing droplet
and ice-crystal optics tables.

## Buffer contract

The GPU contract is one fixed 9,472-byte uniform: a 256-byte header followed by
exactly 36 addressable 256-byte record slots. This is well below WebGPU's
guaranteed 65,536-byte `maxUniformBufferBindingSize`. Both header and record
zero begin on 256-byte boundaries. Every value is `f32`; IDs are bounded exact
integers (owner indices or 24-bit seeds) representable without precision loss.

The CPU packer retains its existing bounded prefix layout. A caller requesting
fewer than 36 records may still receive a shorter `Float32Array` for tests or
serialization, but a GPU consumer allocates the full 9,472-byte buffer and
uploads that prefix into it. Production uses the default capacity of 36. The
header capacity and count bound all reads, and every unused fixed record slot
remains zero.

This must be a uniform buffer, not a read-only storage buffer. The production
fragment stage already uses WebGPU's baseline allowance of eight storage
buffers; a ninth would make the shader depend on an optional adapter limit.

Header vectors:

| vec4 | lanes |
| --- | --- |
| 0 | schema, record count, record vec4 stride, capacity |
| 1 | dropped count, source count, relation count, diagnostic count |
| 2 | cloud-clock snapshot seconds, RGB wavelengths (0.680, 0.550, 0.440 µm) |
| 3–15 | reserved zero lanes |

Record vectors:

| vec4 | name | lanes |
| --- | --- | --- |
| 0 | identity | active, schema, event, geometry |
| 1 | ownership | record, source, parent owner, child owner |
| 2 | classification | designation, source kind, relation, aerosol kind |
| 3 | center/age | east km, altitude km, north km, age s |
| 4 | axis/extent | axis east, axis north, major km, minor km |
| 5 | timing/transition | birth s, lifetime s, age fraction, transition |
| 6 | advection | east, up, north, horizontal speed (m s⁻¹) |
| 7 | emission | heat, water vapour, CCN, INP normalized strengths |
| 8 | thermodynamics | base K, top K, RH, entrainment |
| 9 | composition | water, ice, aerosol fractions, aerosol kind |
| 10 | aerosol extinction | RGB km⁻¹, asymmetry |
| 11 | aerosol absorption | RGB km⁻¹, Ångström exponent |
| 12 | aerosol scattering | RGB km⁻¹, source allocation |
| 13 | lineage | 24-bit seed, horizontal attachment, vertical overlap, ancestry |
| 14 | owner control | parent weight, child weight, topology mode, allocation |
| 15 | support | vertical radius km, boundary km, normalized seed, release altitude |

Event codes are inactive=0, special origin=1, genitus=2, mutatus=3. Geometry
codes are none=0, point=1, line=2, area=3. Topology modes are none=0,
non-additive attached genitus=1, and partitioned mutatus interpolation=2.

## Conservation and ownership rules

- One child has at most one source or mother-cloud relationship record.
- Duplicate owner IDs, self-parenting, missing parents, impossible directed WMO
  relations, disjoint vertical supports, invalid transition progress, duplicate
  mutatus children, and causal cycles do not enter the packed record set.
- If one source creates several child owners, its aerosol coefficient is split
  by `1 / validChildCount`. The source therefore enters transport once even
  when several owner bricks overlap it. Invalid or omitted owners never dilute
  the remaining valid source.
- RGB extinction equals absorption plus scattering per channel. Material
  fractions sum to one. Water/ice extinction is deliberately zero in this ABI;
  existing cloud owners remain authoritative for condensate transport.
- CPU production already partitions mutatus liquid/ice paths between parent and
  child. Transition weights in this record control topology interpolation only;
  they must never multiply those condensate paths a second time.
- A genitus attachment is a compact non-additive union inside its causal
  manifold. A mutatus pair interpolates the two shapes while its already
  partitioned optical mass remains conserved. Neither relationship is a screen
  fade or an unrestricted density sum.
- The support kernel is compact Wendland C2. Point/area sources use an oriented
  ellipsoid; lines use a capped oriented corridor. The ordered-march interval
  is a conservative bounding sphere, while the exact compact evaluator decides
  membership. Long sources and Earth curvature can add empty scheduled work,
  but cannot clip the medium.

## Exact central renderer hooks

These hooks intentionally remain out of the ABI modules so concurrent central
shader work can integrate them once without binding conflicts.

1. In `sky-renderer-canvas.tsx`, import
   `CLOUD_SOURCE_LINEAGE_BUFFER_BYTES` and
   `packCloudSourceLineageRecords`. Create one `UNIFORM | COPY_DST` buffer of
   `CLOUD_SOURCE_LINEAGE_BUFFER_BYTES` next
   to `cloudSystemBuffer`. Binding 35 in group 0 is currently unused and is the
   proposed slot.
2. In the `createCloudSystemRuntime(current.radiance.cloudScene)` update block,
   pack with
   `packCloudSourceLineageRecords(scene, cloudRuntime.systems, 36, cloudClock)`
   and upload its `.data`. The fourth argument is essential: shaders compute
   `cloud_sl_seconds_from_snapshot(p[0].z,
   cloud_source_lineage.header[2])`, avoiding an arbitrary extra advection
   offset. Destroy the buffer beside
   `cloudSystemBuffer` during teardown.
3. In `webgpu-shaders.ts`, import and inject
   `CLOUD_SOURCE_LINEAGE_WGSL`, then declare exactly once in each shader module
   that consumes it:

   ```wgsl
   @group(0) @binding(35)
   var<uniform> cloud_source_lineage: CloudSourceLineageUniform;
   ```

   Generate this declaration with
   `createCloudSourceLineageUniformDeclaration(0, 35)`. Validate the header
   with `cloud_sl_header_valid`, bound loops by
   `cloud_sl_record_count(cloud_source_lineage.header[0], 36u)`, and pass the
   elapsed snapshot time to every sample. Never infer count from buffer byte
   length. The fixed WGSL array, header capacity, header count, caller hard
   limit, and shader constant all independently cap record access at 36.
4. Add binding 35 to the main cloud bind group, cloud-lighting group,
   directional coupling/shadow group, `cloudLightExactQueryGroup0`, and the
   `includeExactMedium` branch of `cloudLightPhysicalGroup0`. These are the
   entry points that evaluate cloud/source medium. The clear-atmosphere-only
   background pipeline does not need this binding.
5. In the ordered camera transport near `cloud_event_intervals`, schedule each
   active source record with `cloud_sl_conservative_support_interval`. Either
   enlarge the bounded event array from 40 to 76 (36 cloud owners + at most 36
   source/lineage records + the legacy layer intervals) or keep a separate
   fixed 36-record source interval bank. Do not query source aerosol only from
   `ordered_cloud_weather_sample`: that function returns early in clear cloud
   space, while smoke/ash can physically extend outside condensate.
6. Add one global `ordered_source_lineage_weather_sample` call inside
   `ordered_all_weather_sample`. Loop records once, sample the local
   east/altitude/north position, and accumulate RGB aerosol extinction,
   absorption, and scattering. Construct source radiance from scattering (not
   extinction): atmosphere-transported sun/moon irradiance with the authored
   aerosol asymmetry, directional cloud visibility, diffuse sky irradiance,
   and ground irradiance. Absorption contributes no emission. Feed the result
   into the existing RGB optical-depth refinement and exponential integrator.
7. Refactor the owner accumulation around `cloud_macro_atlas_sample` so parent
   and child densities are available before final union. Apply
   `cloud_sl_resolve_owner_density` only within the compact relationship
   support. Preserve the existing per-owner optical coefficients: mutatus paths
   are already mass-partitioned. For genitus, replace the parent+child optical
   overlap by a compact non-additive pair contribution rather than adding the
   same inherited condensate twice. Unrelated owners keep the normal Beer union.
8. In `cloud_lv_query_world_medium`, add special-source aerosol records whose
   child index equals `owner_index`; allocation makes their sum conservative
   across bricks. Add aerosol extinction/scattering before the light-volume
   solve and scattering-weight the combined asymmetry. Apply the identical
   source query to exact directional source-shadow transport, so a visible
   smoke/ash plume also attenuates and colours illumination. Camera, shadow,
   and light-volume paths must use the same snapshot time and local coefficients.

The ABI tests exercise exact byte layout, the fixed uniform declaration,
baseline WebGPU limit compliance, deterministic packing, all eight
source kinds, point/line/area support, both causal relations, RGB optical
conservation, shared-source allocation, CPU/WGSL formula parity, bounded
overflow, conservative ray scheduling, invalid compositions, ownership
mismatches, transition bounds, and cyclic lineage rejection.

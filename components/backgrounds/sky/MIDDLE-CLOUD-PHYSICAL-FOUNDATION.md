# Middle-cloud physical foundation

`middle-cloud-physical-foundation.ts` defines renderer-independent contracts for
the five WMO Altocumulus species and four canonical Altostratus render states.
It does not modify atlas generation, production state, runtime packing, or WGSL.

## Taxonomy

Altocumulus has five mutually exclusive species: stratiformis, lenticularis,
castellanus, floccus, and volutus. Altostratus has no WMO species. Its
translucidus, opacus, and undulatus names are varieties; praecipitatio is a
supplementary feature. The four Altostratus representation IDs in this module
are canonical state snapshots, not invented species. They all map to the
existing `altostratus-opacus` renderer recipe while retaining their correct
orthogonal classification fields. In production, undulatus can combine with
either translucidus or opacus, while translucidus and opacus remain mutually
exclusive.

## Physical scale

Altocumulus's regularly arranged small elements usually subtend 1–5 degrees
when high enough for the WMO angular comparator. This applies to an individual
mass, turret, tuft, lens constituent, or roll cross-section—not to the full
sheet, wave packet, or roll length. `qualifyMiddleCloudProjection()` therefore
keeps element diameter independent of formation span, and
`middleCloudFeasibleElementDiameterKm()` exposes camera placements where no
physically allowed scale can satisfy the angular class.

Altostratus is a continuous layer tens to hundreds of kilometres wide and
hundreds to thousands of metres deep. It is never qualified as a repeated puff
population.

## Phase and optics

WMO describes Altocumulus as invariably droplet-bearing, with ice able to form
at low temperature—especially in castellanus and floccus—and a fully glaciated
diffuse remnant possible after droplets evaporate. Aircraft observations of
supercooled mixed-phase Altocumulus locate peak liquid near cloud top and ice
production/virga below. `sampleMiddleCloudLocalMicrophysics()` encodes that
vertical relationship rather than assigning one owner-global phase.

Altostratus can contain an upper ice part, middle mixed part, and lower liquid
part. Its lower particle population always blurs the Sun or Moon; thick parts
conceal the source. Surface observers do not see halo phenomena through
Altostratus. `qualifyMiddleCloudOpticalState()` makes those conditions hard
legality rules. Corona, irisation, plate halos, and pillars remain possible only
for finite, physically eligible Altocumulus owner material and source geometry.

## Exact integration callsites

- `cloud-scene.ts`: replace the hardcoded middle-level species and opacus choice
  in `dailyBaseClassification()` with a coherent representation transition.
  Preserve Altostratus varieties/features as orthogonal classification axes.
- `cloud-state-map.ts`: validate each Ac recipe's `elementScaleKm` against the
  individual element contract. Formation span belongs to system extent, not
  the cellular atlas scale. Keep all As states on the layered-veil material
  until dedicated recipe IDs are intentionally introduced.
- `cloud-system-runtime.ts`: call `qualifyMiddleCloudProductionState()` before
  compilation; use the projection feasibility result in `extentFor()` and
  camera qualification; map castellanus base erosion to floccus; require one
  owner for volutus and continuous support for Altostratus.
- `cloud-volume-atlas.ts` and `scripts/lib/cloud-volume-atlas.mjs`: map
  `deterministicVariant` to one of the four physical macroforms. A new variant
  needs different connectivity/support, not merely a new random seed.
- `sky-renderer-canvas.tsx`: preserve the selected variant and avoid multiplying
  a full Ac population stamp. Do not tile Altostratus from owner ellipsoids.
- `cloud-optics-runtime.ts`: feed local liquid/ice fractions, effective radii,
  ice habit, and roughness to the phase lookup. The liquid top and ice virga
  must not share one owner-global optical state.
- `weather-optical-phenomena.ts`: gate Ac corona/irisation/ice phenomena by the
  local eligibility fields and finite cloud support. Reject every halo request
  owned by Altostratus.
- `hydrometeor-system.ts`: use the praecipitatio representation for attached,
  continuous rain/snow/ice-pellet paths; virga may remain subcloud and must not
  imply ground precipitation.
- `packCloudSystems()` / `webgpu-shaders.ts`: after packing is coordinated,
  evaluate the same continuous vertical phase profile for both view and source
  transport. Altostratus's three parts must blend smoothly without horizontal
  phase shelves.
- The photograph qualification harness should run every representation through
  all five environment IDs in `MIDDLE_CLOUD_BENCHMARK_ENVIRONMENTS`, preserving
  morphology while source color, airlight, and exposure change.

No WGSL helper is emitted yet because the production packing ABI is under
active integration. The CPU contract and tests are the reference for the later
single WGSL port.

## Primary sources

- [WMO Altocumulus definition](https://cloudatlas.wmo.int/en/altocumulus-ac.html)
  and [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-altocumulus.html)
- The descriptor table links each WMO Altocumulus species page.
- [WMO Altostratus definition](https://cloudatlas.wmo.int/en/altostratus-as.html),
  [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-altostratus.html),
  [varieties](https://cloudatlas.wmo.int/en/varieties-altostratus-as.html), and
  [supplementary features](https://cloudatlas.wmo.int/en/supplementary-features-and-accessory-clouds-altostratus.html)
- [Observed supercooled Altocumulus phase/turbulence structure](https://acp.copernicus.org/articles/20/1921/2020/acp-20-1921-2020.html)
- [Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf)
- [NVIDIA approximate Mie scattering for cloud droplets](https://research.nvidia.com/labs/rtr/approximate-mie/)


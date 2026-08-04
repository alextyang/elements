# Weather and cloud qualification matrix

`weather-qualification-matrix.ts` is the renderer-independent completion map
for weather phenomena. It prevents a visually convincing handful of presets
from being mistaken for complete cloud coverage.

The current matrix contains 216 labeled physical targets and 3,272 camera /
lighting cases. Cases are exposed by a generator and are therefore consumed
serially; importing the module does not create previews, open a browser, start
a renderer, or allocate an eager screenshot matrix.

## Authoritative scope

The taxonomy and validity rules come from the WMO International Cloud Atlas:

- [cloud classification summary](https://cloudatlas.wmo.int/cloud-classification-summary.html)
  for genera, species, varieties, features, accessories and mother clouds;
- [supplementary-feature ownership](https://cloudatlas.wmo.int/en/clouds-supplementary-features-and-genera-most-frequently-occur-table.html)
  and [accessory-cloud principles](https://cloudatlas.wmo.int/en/principles-of-cloud-classification-accessory-clouds.html);
- [special clouds](https://cloudatlas.wmo.int/en/clouds-special.html) and
  [mother-cloud definitions](https://cloudatlas.wmo.int/principles-of-cloud-classification-mother-clouds.html);
- [precipitation/cloud associations](https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html)
  and [falling hydrometeors](https://cloudatlas.wmo.int/hydrometeors-falling-particles.html);
- [fog versus mist](https://cloudatlas.wmo.int/fog-compared-with-mist.html),
  [ice fog](https://cloudatlas.wmo.int/ice-fog.html), and
  [upper-atmosphere clouds](https://cloudatlas.wmo.int/en/upper-atmospheric-clouds.html).

The matrix covers:

| Axis | Physical targets |
| --- | ---: |
| WMO species plus the two species-less genera | 31 |
| Valid genus/variety pairs | 31 |
| Valid genus/supplementary-feature pairs | 36 |
| Valid genus/accessory-cloud pairs | 9 |
| Renderer precipitation-character/genus pairs | 22 |
| Additional WMO particle/genus pairs (snow grains, snow pellets, ice pellets) | 6 |
| Convective lifecycle stages | 6 |
| Complete directed WMO genitus/mutatus table | 48 |
| Valid genus/special-origin pairs | 11 |
| Fog, mist, ice fog and diamond dust | 4 |
| PSC Type Ia/Ib/II, nacreous and noctilucent clouds | 5 |
| Physically ordered multilayer weather scenes | 7 |

Each target selects only meaningful environments and perspectives. The 22-state
context pool now carries executable AOD, aerosol spectrum/absorption,
stratospheric aerosol, ozone, humidity, visibility, surface albedo,
boundary-layer stability, freezing level, wind, stratospheric temperature,
Moon geometry/phase and artificial skyglow. It spans clean and humid daylight,
polluted golden light, absorbing smoke, coarse desert dust, clean/sulfate
twilight, pristine/crescent/quarter/full-Moon/urban/polar nights, tropical
convection, mountain waves, polar winter/summer twilight and cold calm surface
air. Perspectives
include low horizon, natural oblique, zenith, telephoto, near uplook and an
elevated view above a low deck.

## Invalid-state gates now enforced

`validateCloudSystem()` now rejects these states before GPU packing:

- a WMO special origin attached to a genus that cannot own it;
- a genitus/mutatus cloud naming its own genus as its mother or using a
  child/mother direction absent from the complete WMO table;
- hail outside Cumulonimbus, showers outside Cumulus/Cumulonimbus, drizzle
  outside Stratus, or any other unsupported precipitation/genus association;
- active precipitation without positive production and fall speed, and virga
  without an evaporation path;
- cauda without murus;
- murus, cauda or flumen without a coherent storm-complex owner;
- pileus or velum without active ascent;
- radiatus without finite band organization, undulatus without a wave/band
  field, and lacunosus without open/lacunar cells;
- fluctus without a resolved shear layer, arcus without precipitation-driven
  outflow, tuba without active ascent/turbulence, and pannus without a
  saturated precipitation layer;
- Cumulonimbus without a storm complex or LFC/equilibrium-level manifold;
- incus without developed glaciated outflow.

The daily runtime also no longer emits Stratocumulus drizzle. It resolves
liquid Stratocumulus precipitation as virga or rain and reserves drizzle for
Stratus, matching the WMO precipitation association table.

The qualification validator separately validates every atmosphere/illumination
state (including Sun/Moon horizon rules and aerosol family spectra), enforces
the 1 km fog/mist visibility
boundary, the 15-30 km polar-winter domain for PSC/nacreous cloud, the 80-85 km
polar-summer domain for noctilucent cloud, and its 6-16 degree solar-depression
window. Ice fog is tied to calm air at or below -30 C and the nacreous case to
a stratosphere near the ice frost point. Independent multilayer systems must have positive depth and cannot
occupy the same volume; causal mother/embedded systems may overlap.

`resolveWeatherQualificationCase()` resolves each lazy case into a constrained
`CloudScene`, canonical classifications, atmosphere, surface, illumination,
and `HydrometeorSceneOverrides` state. The latter preserves the exact per-layer
rain/drizzle/snow/hail/ice-pellet/snow-grain/snow-pellet character that the
legacy scalar `CloudScene.precipitation` cannot encode, plus finite surface-
meteor regions, visibility, and ice-pellet warm-nose profiles. All 3,272
resolutions are exercised through the production physical
cloud runtime in the test suite. Orthogonal targets therefore change coverage,
optical depth, organization, shear, convection, precipitation or lifecycle
even when their final distinctive volume operator is still missing.

Sky Lab consumes this resolved hydrometeor object directly. Three arrow-
steppable selectors choose every precipitation/surface target, each target's
valid physical environments, and each valid review perspective. The selection
is URL-stable and invalidates cloud history and hydrometeor upload without
changing default daily skies.

## Persistent owners and implementation status

The matrix records the highest evidenced stage for every target instead of one
ambiguous “production” label:

- `packed`: validated state reaches the stable owner ABI;
- `operator-active`: a dedicated family/morphology operator consumes it;
- `transport-attached`: the finite owner participates in the production
  atmosphere, lighting, or hydrometeor transport path;
- `photographically-qualified`: a current strict-ready render has passed the
  target's photographic cues and invariants. Strict-ready means the complete
  64-transport history horizon plus measured reconstruction maturity; a valid
  transport count without stable age, acceptance, and confidence cannot pass.

Current counts are 80 operator-active and 136 transport-attached targets. No
target is promoted to photographically-qualified by CPU tests alone. All 216
therefore remain explicit photographic work even though none is unrepresentable.

`CloudScene.authoredSystems` now supplies camera-independent persistent finite
owners. A represented WMO level uses those owners; unrepresented levels retain
the legacy low/middle/high generator and its deterministic daily seed. Each
authored system owns its complete base, depth, wind, phase, lifecycle,
organization and Earth-local finite manifold while using the unchanged generic
16-vec4 packing ABI. Duplicatus qualification scenes now materialize two
superposed layers at different altitudes, ranges and winds, producing actual
parallax instead of cloned instances of one layer.

Every one of the 48 genitus/mutatus targets now materializes a separate mother
owner and daughter/transformation owner with a stable `causalParent`. Runtime
qualification requires WMO-valid genus direction, vertical formation overlap,
finite horizontal attachment, shared kinematic history and material ancestry.
An unattached causal label is rejected before packing.

The five upper-atmosphere states remain transport-attached: PSC Type Ib STS,
Type Ia NAT, Type II water ice, a separately authored visible nacreous display,
and noctilucent cloud. Type-I STS/NAT retain distinct CPU provenance while
sharing the present scalar/RGB profile; their Mueller/T-matrix distinction is
reserved by the ABI basis.
- One precipitation enum cannot express simultaneous virga and
  praecipitatio in different columns of the same parent system, even though WMO
  permits multiple supplementary features on one cloud.

## Review protocol

1. Select target IDs and pass them to `iterateWeatherQualificationCases()`.
2. Consume exactly one yielded case and call
   `resolveWeatherQualificationCase()`.
3. Configure the lab/renderer from that resolved state and wait for its
   existing measured-ready gate.
4. Capture and evaluate that completed frame against the target cues and WMO
   reference.
5. Destroy/reuse the frame resources before advancing the generator.

This file does not replace the existing photographic species benchmark. It
extends that benchmark from base morphology to the entire physically valid
weather state space and makes the remaining renderer work measurable.

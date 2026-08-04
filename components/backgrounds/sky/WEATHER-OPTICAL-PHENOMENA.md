# Physical weather-optics and emissive-phenomena foundation

`weather-optical-phenomena.ts` and `weather-optical-phenomena-wgsl.ts` define a
binding-free, scene-linear contract for rainbows, fogbows, glories, coronae,
oriented-ice displays, lightning, aurora, blowing snow, and blowing dust. The
CPU module owns validity, deterministic construction, and energy
normalization. The WGSL module mirrors only the local evaluators needed inside
the eventual transport passes.

This is intentionally a foundation, not an overlay renderer. It does not apply
camera exposure, adaptation, tone mapping, screen-space alpha, or an extra sky
gradient. The non-negotiable transport invariant remains:

```text
one physical source -> one owning medium -> one atmosphere -> one exposure
```

## Why these phenomena cannot be sprites

Each effect is only visible where a finite physical population exists and only
for compatible source/view geometry:

- A rainbow or glory is a directional replacement in the droplet phase
  function at a sampled rain, fog, or cloud point. It cannot continue through
  clear air merely because the camera ray intersects a screen-space arc.
- A halo is the two-dimensional phase function of a crystal habit and
  orientation distribution. An azimuthally averaged Henyey-Greenstein lobe
  cannot produce sundogs, circumzenithal arcs, pillars, or selective glints.
- A lightning channel is a transient world-space emissive source. Cloud
  illumination is produced by transport from that source, not by whitening the
  entire cloud or frame.
- An aurora is a thin, folded, field-aligned volume at roughly 80–550 km. It is
  attenuated by the atmosphere below it and is not a top-of-atmosphere RGB
  texture.
- Blowing snow and dust are finite boundary-layer media with wind transport,
  vertical concentration, extinction, albedo, and phase parameters. They are
  not horizon fog colors.

The finite owner is authoritative. `ownerSampleWeight` must come from the
existing cloud, hydrometeor, fog, rain-shaft, ice, or boundary-layer density
field. The optical evaluator shapes light but never creates material where the
owner says there is none.

`evaluateDropletOrderedScatteringSource()` and
`evaluateOrientedIceOrderedScatteringSource()` are the executable transport
boundary. They require the exact owner id and world altitude, local
`sigma_s`, a normalized broad phase, source-to-sample atmosphere
transmittance, source visibility, and the physical source/view directions.
For fractional owner membership `w`, they evaluate

```text
phase = base_phase * (1 - w * replacement_energy)
      + w * specialized_phase
source = sigma_s * phase * source_radiance * source_visibility
```

so the phase still integrates to one at soft material boundaries. Their result
explicitly has neither camera-path transmittance nor bloom; both remain later,
single operations.

## Droplet optics

`createDropletOpticalPhenomenonState()` converts effective radius and Hansen
effective variance into one or more compact spectral angular lobes. The RGB
channels are representative wavelengths (680, 550, and 440 nm), and every lobe
is numerically normalized over the sphere. `replacementEnergyRgb` is the exact
fraction reserved from the broad cloud/hydrometeor phase term.

At each scattering event:

```text
phase = base_phase * (1 - replacement_energy)
      + specialized_phase_replacement
```

Do not add the specialized term on top of an unmodified Mie/HG base. That would
create energy, produce a conspicuous repeated artifact, and over-brighten
cloud edges. The current compact kernels preserve the key measured behavior:

- primary and secondary bows have different angular radii, reversed spectral
  ordering, and different energy;
- small-droplet fogbows broaden and desaturate;
- glory radius scales with wavelength and inverse droplet radius, while size
  variance suppresses outer rings;
- coronae use an Airy/Bessel forward-diffraction kernel with
  polydispersity damping and no false backscatter peak.

The production-quality endpoint should eventually replace these compact lobes
with a Debye/Mie lookup indexed by wavelength, effective radius, variance, and
scattering angle. The state and energy-replacement contract should remain
unchanged. Lynch and Schwartz explicitly include realistic solar spectrum and
finite solar angular size in rainbow/fogbow calculations; Mayer et al. show why
finite cloud optical thickness, multiple scattering, background radiance, and
size spread wash out glories and cloudbows. Those effects belong in the shared
transport, not in an artistic opacity control.

## Oriented ice

`createOrientedIcePhenomenonState()` retains plate, column, aggregate, random,
horizontal, tilt, surface-roughness, size, temperature, and finite ice-owner
state. It produces source-relative 22°/46° rings, paired sundogs, a
source-elevation-dependent circumzenithal arc with its physical 32.3° cutoff,
vertical pillars, and Beckmann-distributed diamond-dust glints.

This is deliberately not an HG approximation. Measurements and physical-
geometric-optics databases show that scattering varies with incident
direction, habit, particle size, crystal tilt distribution, inclusions, and
surface roughness. The compact evaluator therefore keeps a genuinely
two-dimensional source/view function and an explicit orientation population.

At hookup, sample the finite ice density first and pass the resulting
scattering weight into `weather_oriented_ice_ordered_source`. Recompute the
state when the Sun/Moon direction or crystal population changes. The ordered
adapter rejects a state whose source differs by more than 0.05 degrees from the
current ephemeris direction. Never rotate a screen-space halo to imitate this
relationship.

The next fidelity tier is a packed, spectrally sampled TAMUoic/physical-
geometric-optics phase-matrix LUT. It can replace `weather_ice_feature_raw`
without changing ownership, source geometry, or energy partition.

## Lightning

`createLightningEventState()` deterministically constructs an intra-cloud or
cloud-to-ground channel tree between physical charge regions. Segment parent
indices preserve topology. Each finite pulse stores independently normalized
rise/decay shape, peak current, radiant energy, and spectral shape; integrated
luminance returns the pulse energy and the current maximum returns the stated
peak.

`evaluateLightningChannelInjection()` distributes event power over weighted
channel length and a finite, renormalized 4.5-sigma radial kernel. Its result is
local emissivity in world space. Physical channel core radii are centimetric;
analytic segment coverage and the camera PSF make them resolvable without
inflating the world-space channel to metres. The renderer must integrate it
through the same cloud and air transport as every other source:

```text
camera radiance += integral(
    transmittance(sample -> camera)
  * [channel emission + cloud scattering of channel irradiance]
) ds
```

The direct channel, cloud-base illumination, internal cloud glow, rain/fog
scatter, terrain response, and final bloom all derive from this one event.
There is no separate full-screen flash. `evaluateLightningCloudScatteringSource()`
accepts the channel radiance already integrated over segment directions and
the cloud phase, applies channel-to-sample transmittance and local `sigma_s`,
and marks `duplicatesChannelEmission: false`. Guo and Krider measured a fast
optical rise, a roughly 60 microsecond delayed peak, and 103–235 microsecond
subsequent-stroke widths. Quick and Krider measured 0.4–11 MW/m peak VNIR power
and 150 ± 140 J/m energy over 2 ms. The compact pulse and the broad 0.5–5000
J/m validity envelope preserve those orders of magnitude without excluding
natural extremes.

`deep-convection-electrical.ts` now exposes a structurally compatible event
bridge. Its illumination envelope is explicitly a
`finite-storm-light-transport-volume` with `emissionSource: channel-only`, not
a diffuse emitter. Candidate channel radii are 1.8–9.5 cm, and their qualified
charge-region guide points feed the same lightning event constructor.

## Aurora

`createAuroralCurtainState()` produces a finite longitudinal sheet with
multi-octave folds, drift, and horizontal displacement along the supplied
magnetic-field direction. `evaluateAuroralCurtainEmission()` returns local line
emission, with separate altitude distributions for O I 630.0 nm red, O I 557.7
nm green, and N2+ 427.8 nm blue-violet emission. The altitude profiles are
normalized over the finite owner shell, so integrating a column returns the
state's declared `columnEmissionRgb` independent of ray-step count. Both the
longitudinal and cross-curtain windows have exact finite support.

The evaluator intentionally does not turn aurora off in daylight. Particle
excitation can still occur; daytime atmospheric radiance and the shared
exposure make it invisible. At render time, intersect the camera ray with the
80–550 km shell, evaluate the curtain at physical positions, and integrate
remaining atmosphere transmittance from each sample to the camera. Gillies et
al. demonstrate that 630 nm arc height is variable and must be inferred rather
than treated as a painted band; Lee et al. derive altitude-resolved 557.7 nm
volume emission from limb measurements. Whiter et al.'s 57,907 paired
measurements place the green and 427.8 nm blue peaks together near 114 km; the
renderer therefore does not use the common but incorrect low-blue-band model.
A future particle-precipitation state
can replace the compact Gaussian altitude profiles without changing the
transport contract.

The folded-sheet construction follows the volumetric principle in Lawlor et
al.: geometry supplies thin curtain structure and the camera ray integrates a
volume. It must never be flattened to a scrolling RGB texture.

## Wind-raised snow, dust, and volcanic ash

`createBlowingBoundaryLayerState()` validates snow cover/temperature or dry
erodible soil, wind threshold, and finite region ownership. A third qualified
kind represents volcanic ash only when it is raised from a finite dry ash
deposit. An active eruption plume is rejected here because it requires an
elevated plume owner, eruption source flux, buoyancy, aggregation, and fallout;
coercing it into a ground boundary layer would be physically false.

The state derives extinction from meteorological visibility using the
Koschmieder contrast constant, then stores spectral extinction,
single-scattering albedo, phase asymmetry, particle-size envelope, density, and
source provenance. `evaluateBlowingBoundaryLayer()` adds a deterministic
irregular finite boundary, wind advection, and a species-dependent near-ground
vertical concentration. Snow occupies a shallow saltation/suspension layer;
mineral dust extends higher; fine resuspended ash has the broadest supported
boundary profile.

Pomeroy and Gray show that blowing snow contains a shear-driven saltation layer
and that transport is controlled by friction velocity and threshold cohesion.
The Prairie Blowing Snow Model extends that physics with suspension and
sublimation. SAMUM field measurements show that mineral-dust single-scattering
albedo and absorption are wavelength- and composition-dependent, so dust must
remain a spectral participating medium rather than a brown color grade.

For volcanic ash, the supported particle envelope is 0.5–500 micrometres and
the median must stay inside it. This is the remobilizable fine-ash subset, not
the complete WMO/USGS tephra range up to 2 mm. The 2300 kg/m3 density follows
FAAM in-situ Eyjafjallajokull processing. Weak, moderate, and strong absorption
classes span the published ash variability while preserving the repeatedly
observed increase in single-scattering albedo from blue toward red. They are
explicit source properties; the renderer does not infer magma composition
from sky color.

`evaluateBlowingBoundaryOrderedMedium()` is the CPU structural adapter for the
shared ordered-volume path. It emits `extinctionPerKm`, `scatteringPerKm`, and
`scatteredIncidentRadiance`, plus exact owner metadata; its source coefficient
is `sigma_s * L_incident`. The matching WGSL helper is
`weather_blowing_passive_source_coefficient()`. The caller supplies local,
atmosphere-attenuated, phase-weighted incident radiance. Do not multiply sky
RGB directly or add the same source after the ordered medium is integrated.

## Isolated production transport now available

`weather-phenomena-production.ts` now turns a completely valid resolved scene
into an exact bounded dispatch plan. It records reachability separately for
every supported bow, glory, corona, ice display, lightning topology, auroral
line family, and wind-raised medium. A reachable state is named
`production-integrated`: the shared renderer packs it into binding 35 and
invokes finite transport in the same five depth-ordered HDR packets as clouds
and hydrometeors. Photographic qualification remains a separate release gate.

`weather-phenomena-production-wgsl.ts` supplies the isolated production layer:

- rainbows, fogbows, glories, and coronae are evaluated only while marching
  their exact liquid owner index;
- halos, sundogs, circumzenithal arcs, pillars, and diamond-dust glints are
  evaluated only inside their exact ice owner and against the current physical
  source direction;
- lightning preserves the weighted centimetric channel for an analytic,
  atmosphere- and parent-attenuated camera PSF. A double-bank coarse event
  field selects the two strongest finite line-irradiance candidates and four
  line samples per voxel, then reuses that exact parent-owned transfer at cloud
  camera events. The direct PSF likewise retains the two strongest projected
  finite segments, so branch crossings add rather than collapse to whichever
  line happens to be nearest;
  millisecond pulse power remains dynamic and never rebuilds the field. Its
  cloud-scale response follows measured lightning diffusion rather than
  widening the channel into an arbitrary local glow;
- aurora uses a conservative finite world interval only to schedule work; the
  folded field-aligned curtain evaluator remains the authoritative boundary;
- blowing snow, mineral dust, and resuspended ash use exact oriented elliptical
  world support and add passive RGB coefficients to local atmosphere before the
  Beer event;
- aurora and boundary media have separate bounded affine pass kernels because
  their physical sample scales differ by roughly four orders of magnitude.

The isolated shader remains binding- and entry-point-free while shared shader
work is in flight. The one intentionally unresolved host hook is
`weather_parent_owner_segment_transmittance(owner, start, end)`: it must trace
the exact lightning parent density between arbitrary world points. Substituting
a dominant neighbouring cloud or an owner-wide scalar is forbidden.

## Exact renderer hookup (implemented)

The active renderer packs binding 35, materializes the event-light transfer in
the cloud light-volume refresh, samples it only for the exact parent owner, and
depth-orders the separately preserved channel PSF with the five production HDR
packets. The implemented integration is:

1. Prepend `WEATHER_OPTICAL_PHENOMENA_WGSL`,
   `WEATHER_PHENOMENA_PRODUCTION_WGSL`, and the specialized production pass
   kernels to the physical sky/cloud shader module. Invalid CPU states are
   never packed or dispatched.
2. Extend the scene state with finite owner identifiers and packed feature
   records. Pack `weatherPhenomenonShaderSeed(seed)`—not the original integer—
   into `WeatherAuroraCurtain.folding.w` and
   `WeatherBlowingBoundaryState.motion.w` so animated CPU/WGSL hashes agree.
3. During rain/fog/liquid-cloud scattering, call
   `weather_droplet_ordered_source()` with exact owner membership, local
   `sigma_s`, normalized base phase, source radiance, source-to-sample
   atmosphere transmittance, visibility, and physical directions.
4. During ice-cloud or diamond-dust scattering, accumulate enabled oriented
   feature records, then call `weather_oriented_ice_ordered_source()` with the
   same ephemeris direction used by atmosphere lighting.
5. Build an event through `createDeepConvectionLightningEventContract()` when
   storm charge topology owns the flash. Upload its segments and pulses, sum
   pulse power once, inject channel emission with
   `weather_lightning_segment_injection()`, and add cloud scattering with
   `weather_lightning_cloud_scattering_source()`. Never add an envelope glow.
6. Pack auroral altitude normalization and column-emission RGB, ray-intersect
   the finite shell/sheet, then add
   `weather_aurora_ordered_emission_source()` to the local source sum. The
   atmosphere marcher applies sample-to-camera transmittance exactly once.
7. Evaluate blowing snow/dust/resuspended ash inside the boundary-layer march,
   using the same extinction/source/transmittance bookkeeping as fog and
   hydrometeors. Reject active eruption plumes at this adapter boundary.
8. Composite all transported radiance, then apply the one shared adaptation
   exposure and output transform. Optical bloom, if present, is a calibrated
   camera response after transport—not a second source.

The WGSL feature codes are stable in schema 1:

```text
ice: 0 halo-22, 1 halo-46, 2 sundogs, 3 circumzenithal arc,
     4 light pillar, 5 diamond-dust glints
blowing medium: 0 snow, 1 dust, 2 resuspended volcanic ash
```

`weather-phenomena-qualification.ts` is a separate, deliberately unpromoted
18-scene matrix. A target may move into the active qualification matrix only
after scene integration and photographic review prove every required cue and
none of its forbidden failures. `scripts/test-weather-optical-phenomena.mjs`
locks finite-owner validity, spectral geometry, energy normalization,
deterministic topology, altitude structure, medium properties, and static
CPU/WGSL formula parity without requiring a GPU.

## Primary and implementation references

- Lynch & Schwartz, “Rainbows and fogbows,” *Applied Optics* 30(24), 1991:
  <https://doi.org/10.1364/AO.30.003415>
- Mayer, Davis & Platnick, “Simulating glories and cloudbows in color,”
  *Applied Optics* 42(3), 2003: <https://doi.org/10.1364/AO.42.000429>
- Saito et al., “Oriented Ice Crystals: A Single-Scattering Property Database,”
  *Journal of the Atmospheric Sciences* 76(9), 2019:
  <https://doi.org/10.1175/JAS-D-19-0031.1>
- Jourdan et al., “Light Scattering by Single Natural Ice Crystals,”
  *Journal of the Atmospheric Sciences* 63(5), 2006:
  <https://doi.org/10.1175/JAS3690.1>
- Forster, Weber & Mayer, “CrystalTrace: a Monte Carlo raytracing algorithm for
  radiative transfer in cirrus clouds with oriented ice crystals,”
  *Atmospheric Measurement Techniques* 18, 2025:
  <https://doi.org/10.5194/amt-18-7853-2025>
- Guo & Krider, “The optical and radiation field signatures produced by
  lightning return strokes,” *Journal of Geophysical Research* 87(C11), 1982:
  <https://doi.org/10.1029/JC087iC11p08913>
- Quick & Krider, “Optical power and energy radiated by return strokes in
  rocket-triggered lightning,” *JGR Atmospheres* 122, 2017:
  <https://doi.org/10.1002/2017JD027363>
- Wang et al., “First Experimental Verification of Opacity for the Lightning
  Near-Infrared Spectrum,” *Geophysical Research Letters* 49, 2022:
  <https://doi.org/10.1029/2022GL098883>
- Liang et al., “Differing current and optical return stroke speeds in
  lightning,” *Geophysical Research Letters* 41, 2014:
  <https://doi.org/10.1002/2014GL059703>
- Peterson, “Modeling the Transmission of Optical Lightning Signals Through
  Complex 3-D Cloud Scenes,” *JGR Atmospheres* 125, 2020:
  <https://doi.org/10.1029/2020JD033231>
- Brunner & Bitzer, “A First Look at Cloud Inhomogeneity and Its Effect on
  Lightning Optical Emission,” *Geophysical Research Letters* 47, 2020:
  <https://doi.org/10.1029/2020GL087094>
- Lee et al., “Statistical comparison of WINDII auroral green line emission
  rate with DMSP/SSJ4 electron energy input,” *JGR Space Physics* 112, 2007:
  <https://doi.org/10.1029/2007JA012323>
- Gillies et al., “Identifying the 630 nm auroral arc emission height,”
  *JGR Space Physics* 122, 2017: <https://doi.org/10.1002/2016JA023758>
- Whiter et al., “The altitude of green OI 557.7 nm and blue N2+ 427.8 nm
  aurora,” *Annales Geophysicae* 41, 2023:
  <https://doi.org/10.5194/angeo-41-1-2023>
- Lawlor et al., “Interactive Volume Rendering Aurora on the GPU,” 2010:
  <https://www.cs.uaf.edu/~olawlor/papers/2010/aurora/lawlor_aurora_2010.pdf>
- Pomeroy & Gray, “Saltation of snow,” *Water Resources Research* 26(7), 1990:
  <https://doi.org/10.1029/WR026i007p01583>
- Schladitz et al., “In situ measurements of optical properties at Tinfou
  during SAMUM 2006,” *Tellus B* 61(1), 2009:
  <https://doi.org/10.1111/j.1600-0889.2008.00397.x>
- Johnson et al., “In situ observations of volcanic ash clouds from the FAAM
  aircraft during the eruption of Eyjafjallajokull in 2010,” *JGR
  Atmospheres* 117, 2012: <https://doi.org/10.1029/2011JD016760>
- Derimian et al., “Optical properties and radiative forcing of the
  Eyjafjallajokull volcanic ash layer,” *JGR Atmospheres* 117, 2012:
  <https://doi.org/10.1029/2011JD016815>
- Gasteiger & Wiegner, “MOPSMAP v1.0,” *Geoscientific Model Development* 11,
  2018: <https://doi.org/10.5194/gmd-11-2739-2018>
- USGS Volcano Hazards Program, “Ash particle size”:
  <https://volcanoes.usgs.gov/volcanic_ash/ash_particle_size.html>
- Bruneton & Neyret, “Precomputed Atmospheric Scattering,” *Computer Graphics
  Forum* 27(4), 2008: <https://doi.org/10.1111/j.1467-8659.2008.01245.x>

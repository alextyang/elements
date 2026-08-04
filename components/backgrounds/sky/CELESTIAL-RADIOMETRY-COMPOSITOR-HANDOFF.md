# Celestial radiometry compositor handoff

This document records the completed production wiring for the scene-linear Sun
and Moon foundations. The CPU contracts, shared WebGPU host, atmosphere pass,
and lunar pass now consume one radiometric source graph.

Primary references:

- H. Kieffer and T. Stone, [The spectral irradiance of the
  Moon](https://pubs.usgs.gov/publication/70029564), USGS/Astronomical Journal,
  2005. The disk-integrated lunar target is phase-, libration-, and
  distance-dependent.
- NASA Scientific Visualization Studio, [Moon Phase and Libration,
  2026](https://svs.gsfc.nasa.gov/5587/). SVS frames provide the resolved
  geometry/appearance profile; they are not calibrated spectral radiance.
- S. Hillaire, [A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique](https://sebh.github.io/publications/egsr2020.pdf), EGSR 2020. The
  direct source and its forward-scattered atmosphere share one source and one
  transmittance state.
- NASA/NOAA, [Solar Calculation
  Details](https://gml.noaa.gov/grad/solcalc/calcdetails.html). The CPU state
  carries Earth-Sun distance, inverse-square source scaling, and apparent
  angular radius.

## Implemented contracts

- `atmosphereObserverTransmittanceToSpace` evaluates the exact spherical
  physical-atmosphere path at the configured observer. It returns transfer
  only and cannot contain clouds, visibility, or exposure.
- `createPhysicalAtmosphereStateFromComposition` is the canonical
  palette/weather-to-optical-state constructor. Create it once and share the
  returned object across celestial state and renderer LUT resources.
- `LunarDiscRadianceContract` owns one ROLO-calibrated disk-integrated source
  target. NASA and analytic profiles must both normalize their spatial profile
  to that target. The phase law is therefore applied exactly once.
- `CELESTIAL_LUNAR_IMAGE_RADIANCE_CONTRACT` explicitly classifies NASA SVS
  frames as non-radiometric, phase-resolved profiles.
- `PhysicalSunDiscState` owns orbital distance, angular radius, solid angle,
  limb-darkened source radiance, and an energy-normalized optical PSF.
- `PhysicalSunDiscAtmosphereState` owns exact direct atmosphere transfer and a
  non-additive forward-scattering handoff. Both Sun and Moon state expose
  `commonExposureScale: 1`; display adaptation remains the final scene step.
- `packLunarDiscRadianceContract` and
  `packPhysicalSunDiscAtmosphereState` provide fixed six- and seven-vec4 ABIs;
  matching WGSL structs live in the binding-free celestial physics library.

## Completed shared compositor wiring

1. The sky constructs one `PhysicalAtmosphereState` with
   `createPhysicalAtmosphereStateFromComposition` above both celestial scene
   creation and WebGPU LUT-resource creation. It passes that exact object to
   `calculateCelestialScene({ physicalAtmosphereState })` and uses it for the LUT
   frame; the renderer-local duplicate physical-state builder was deleted.
2. The atmosphere's Sun and Moon TOA source records come from
   `celestial.sun.source` and `celestial.moon.radianceContract`; the renderer
   does not recreate
   their irradiance, distance scale, angular radius, or spectral ratios in the
   renderer.
3. The atmosphere pass resolves the Sun as a finite boundary disc, evaluates
   limb-darkened radiance, multiplies by physical-atmosphere direct transfer
   once, places it behind the Moon for eclipse ordering, and places both behind
   finite cloud and weather transport.
4. No decorative solar halo is added. The atmosphere source creates
   the physically coupled aerosol/Rayleigh forward field. Only the compact,
   energy-normalized optical PSF belongs to the resolved disc path; its energy
   must be partitioned from the core rather than added.
5. Loaded NASA frames are decoded to linear profile values. The black frame
   outside the geometric disc is excluded, the profile's solid-angle RGB
   integral is measured once, and the result is normalized to
   `moon.radianceContract.topOfAtmosphereIrradianceRgb`.
6. The analytic Hapke/LROC path integrates its phase-resolved profile and
   normalizes it to the same target. The former additional multiplication by
   disk-integrated `relativeIrradiance` is gone; the normalization target
   already contains that phase law.
7. The compositor has no Moon-specific inverse/pre-exposure field. The
   compatibility `discRadianceScale` is now always one and must not be replaced
   with another local exposure. Apply atmosphere, then finite media, then the
   one common exposure/tone transform.
8. The lunar pass uses the physical-atmosphere transmittance LUT for direct disc
   transfer. The CPU `observerTransmittanceRgb` fields are deterministic
   qualification values and agree with the LUT; they are not a second
   extinction multiplier. Sun/Moon overlap is resolved at the extraterrestrial
   boundary, so the Moon removes the direct solar disc without alpha-darkening
   already scattered foreground atmosphere.

## Release gates

- Numerically integrate each resolved solar channel over solid angle and
  recover its TOA irradiance within the selected quadrature/LUT tolerance.
- Numerically integrate both NASA and analytic lunar paths and recover the same
  ROLO target at full, quarter, crescent, perigee, and apogee states.
- Assert one phase application, one atmosphere direct transfer, one finite
  cloud/weather transfer, and one common exposure for every celestial path.
- Assert the Moon geometrically replaces the Sun during overlap without
  alpha-darkening already in-scattered foreground atmosphere.
- Assert changing exposure never changes any TOA irradiance, profile
  calibration, transmittance, or source-disc integration result.

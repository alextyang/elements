# Sky radiative integration audit

This audit covers the scene-linear atmosphere, cloud/hydrometeor affine
transport, celestial layers, and the single final display transform. It is a
transport audit, not photographic acceptance. A family is not considered
complete merely because its isolated material or morphology is plausible.

Primary references used for the audit:

- S. Hillaire, [A Scalable and Production Ready Sky and Atmosphere Rendering
  Technique](https://sebh.github.io/publications/egsr2020.pdf), EGSR 2020.
- E. Bruneton, [Precomputed Atmospheric Scattering: a New
  Implementation](https://ebruneton.github.io/precomputed_atmospheric_scattering/),
  2017, including its spectral CPU reference comparisons.
- A. Jones et al., [An Advanced Scattered Moonlight
  Model](https://www.eso.org/sci/publications/messenger/archive/no.156-jun14/messenger-no156-31-34.pdf),
  ESO, 2014, and the [Cerro Paranal Advanced Sky
  Model](https://www.eso.org/observing/etc/doc/skycalc/The_Cerro_Paranal_Advanced_Sky_Model.pdf).
- H. Kieffer and T. Stone, [The spectral irradiance of the
  Moon](https://pubs.usgs.gov/publication/70029564), USGS/Astronomical Journal,
  2005.
- CIE, [TN 005:2016, practical implementation of mesopic
  photometry](https://files.cie.co.at/842_CIE_TN_005-2016.pdf).
- A. Schneider, [Nubis Cubed](https://advances.realtimerendering.com/s2023/Nubis%20Cubed%20%28Advances%202023%29.pdf),
  SIGGRAPH Advances in Real-Time Rendering, 2023.
- J. Jendersie and E. d'Eon, [An Approximate Mie Scattering Function for Fog
  and Cloud Rendering](https://research.nvidia.com/labs/rtr/approximate-mie/),
  SIGGRAPH 2023.
- J. Fong et al., [Production Volume
  Rendering](https://graphics.pixar.com/library/ProductionVolumeRendering/paper.pdf),
  Pixar.

## Correctly integrated foundations

- Sun and Moon enter the atmosphere and cloud solvers as top-of-atmosphere
  sources. Receiver-local atmosphere transmittance is applied once.
- Clear air and bounded weather are co-integrated as extinction and source
  coefficients in occupied spans; clear gaps use the exact atmosphere segment.
- Clouds, hydrometeors, and upper-atmosphere media publish affine RGB operators
  and are depth sorted before the clear-sky boundary is applied.
- Atmospheric direct first order is owned once by the directional full-sphere
  phase convolution. Higher-order upper/lower irradiance and the ground term
  have disjoint ownership.
- The resolved Moon is rendered into the clear-sky background before cloud
  transport, and catalogue-star cores receive cloud transmission.
- Exposure and the output transform are applied once in the final composite.

## Ranked integration status and remaining work

### P0 — source ordering and calibration (completed)

1. **Resolved physical solar disc.** The atmosphere pass now composites the
   finite limb-darkened Sun with the same direct transmittance as the sky. It
   sits behind the Moon for eclipses and behind cloud/weather transport, with
   no duplicate bloom owner.

2. **Unified lunar radiometry and physical atmosphere.** The production Moon
   samples the same physical-atmosphere transfer LUT as sky/cloud lighting.
   CPU observer transfer remains a qualification result, never another render
   multiplier.

3. **One lunar exposure and phase application.** NASA SVS image profiles and
   analytic Hapke/LROC profiles are linearized/integrated and normalized to one
   disk target. Neither path has local exposure, tint, or a second phase law.

4. **Finite weather compositor.** Enabled optical phenomena replace or
   redistribute owner phase energy inside their finite medium, then use the
   same ordered atmosphere/cloud transport. Lightning remains a separate
   finite light field; there is no standalone screen-space weather bloom.

### P1 — missing optical coupling

5. **Replace three-wavelength atmosphere calibration with a spectral reference
   path.** Three RGB samples are useful at runtime but do not robustly reproduce
   ozone Chappuis absorption, aerosol spectral curvature, or extreme twilight.
   Follow Bruneton's tested strategy: validate the runtime RGB/luminance LUT
   against a multi-wavelength CPU integration and fit the runtime conversion to
   bounded error across noon, golden hour, twilight, smoke, dust, sulfate, and
   observer altitude.

6. **Illuminate cloud and weather media with artificial ground emission.** The
   clear atmosphere currently scatters the artificial ground source, but cloud,
   fog, and hydrometeor incident-light records only receive Sun, Moon, physical
   sky diffuse, and ordinary ground bounce. Urban overcast therefore attenuates
   skyglow instead of producing the bright warm cloud base seen in reality.
   Route the finite ground emitter through the same source-to-sample visibility
   and cloud-light field; only then should cloud-reflected skyglow affect
   adaptation.

7. **Make adaptation respond to rendered weather luminance.** The common
   exposure is driven mainly by solar altitude, lunar irradiance, and authored
   artificial glow. It does not know whether the view is clear, deep overcast,
   inside fog, or under a dark storm base. Derive a stable hemispheric log-average
   or percentile luminance from the low-rate physical scene (excluding tiny Sun,
   Moon, star, and lightning outliers), filter it temporally, and retain explicit
   Lab exposure compensation. Do not use cloud density as an unrendered proxy.

8. **Keep source energy distinct from perceptual star detection.** Catalogue
   flux is correctly radiometric on the CPU, but production multiplies it by a
   global dark-adaptation opacity before the final exposure. Detection/culling
   may decide whether a PSF is rasterized; it must not change the retained
   source's integrated energy. A sensor/eye visibility model belongs after
   radiometric transport and must be tested separately from energy conservation.

9. **Replace the lunar aureole's local optical-depth partition.** The current
   shader partitions total slant optical depth into Rayleigh and aerosol using
   only the observer-local medium and applies a half-path approximation. This
   assigns absorption to scattering and fails in inversions/elevated aerosol.
   Integrate source-to-sample and sample-to-camera scattering optical depth, or
   evaluate the aureole through the atmosphere LUT/finite marcher. Cloud corona
   and ice halo energy remain separate owner-scattering phenomena.

10. **Transport extended night sources as extended sources.** Galactic light,
    integrated starlight, and zodiacal light are currently only extinguished;
    their atmosphere-scattered contribution is absent. ESO's sky model treats
    scattering into and out of the line of sight and notes that extended-source
    effective extinction differs from point-source extinction. Airglow also
    needs species/line families, solar-cycle/season/night evolution, and a
    source-altitude-to-observer path rather than one generic continuum.

11. **Give elevated aerosol an explicit composition.** Every stratospheric
    aerosol column currently uses sulfate optical constants. Volcanic sulfate,
    aged wildfire smoke, and elevated mineral dust need separate spectral
    extinction, single-scattering albedo, asymmetry, altitude/width, and valid
    environmental gates.

### P2 — qualification and secondary physics

12. Add polarization only where it materially changes appearance: Rayleigh
    horizon fields and oriented-ice/droplet optical phenomena. Keep ordinary
    cloud body transport scalar unless photographic comparison proves a need.
13. Calibrate tone mapping against linear HDR references. The present scalar
    ACES-like luminance shoulder is stable but is not an ACES reference rendering
    transform and has no display peak/ambient contract.
14. Add cross-regime energy tests for lightning-lit cloud/fog, moonlit snow,
    urban overcast, dust/smoke twilight, fog at sunrise, and aurora through lower
    aerosol. Each test must assert source ownership, finite support, nonnegative
    radiance, transmittance in `[0,1]`, and exactly one common exposure.

## Changes completed in this audit

- Ozone absorption is now column-conserving when center/width changes, including
  profiles clipped by the ground boundary.
- The low-level physical-composition resolver now enforces aerosol-family
  envelopes even when a Lab caller bypasses the authoring constraint.
- Finite cloudiness no longer globally culls/dims stars or the Moon on the CPU;
  the spatial cloud operator alone owns their occultation. Aerosol extinction,
  seeing, source glare, and user visibility controls remain independent.
- One canonical physical atmosphere state now drives celestial CPU
  qualification, renderer LUTs, and Sun/Moon source directions.
- The finite limb-darkened Sun is a transported boundary source behind the
  lunar silhouette and all finite weather, with no decorative halo owner.
- NASA and analytic lunar profiles normalize to one disk-integrated ROLO
  target. The old analytic second phase multiplier, local tint, CPU transfer,
  and Moon-specific exposure multiplier have been removed from WebGPU.
- Both resolved discs now sample the physical-atmosphere LUT exactly once;
  exposure remains the one final scene operation.

## Required validation matrix

For every row, test zenith, solar/lunar principal plane, antisolar direction,
and near-horizon views with clear, sparse, broken, and overcast cloud support:

| State | Required energy ordering |
| --- | --- |
| Noon clear / humid / polluted | TOA source → atmosphere → finite media → camera |
| Golden hour / dust / smoke | spectral source extinction once; no palette light |
| Civil / nautical / astronomical twilight | below-horizon Sun lights only reachable atmosphere/media |
| Moonlit clear / cirrus / overcast | one lunar source, separate disc/aureole/halo domains |
| Moonless rural / urban | airglow, zodiacal, Galactic, stars, ground emission remain distinct |
| Storm / lightning | finite emission lights owning cloud/hydrometeors and air before camera |
| Fog / precipitation / blowing media | local air and weather coefficients co-integrate |
| PSC / NLC / aurora | real altitude, illumination reachability, lower-atmosphere attenuation |

CPU references and shader contracts are necessary gates. Final acceptance still
requires strict renderer-ready photographic comparisons; no metric or fallback
image can substitute for them.

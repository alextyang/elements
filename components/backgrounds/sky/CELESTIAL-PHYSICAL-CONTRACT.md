# Celestial and atmosphere physical contract

The sky renderer uses one radiometric rule: Sun and Moon enter atmosphere and
cloud transport as unattenuated top-of-atmosphere (TOA) sources. Atmospheric
transmittance, cloud occlusion, and photographic adaptation are separate
operations and each is applied exactly once.

## Reference basis

- NASA's current solar-irradiance material reports a mean TOA total solar
  irradiance near 1361 W/m² (TSIS-1: 1361.6 ± 0.3 W/m² at the 2019 minimum):
  <https://earth.gsfc.nasa.gov/climate/projects/solar-irradiance/science>
- The lunar phase source follows the disk-integrated Krisciunas-Schaefer phase
  law with a restrained opposition surge. NASA/USGS ROLO is the higher-fidelity
  spectral reference; its observations are corrected to exoatmospheric
  radiance and integrated over the lunar disc. The runtime likewise keeps phase
  and distance in TOA source state, never in atmosphere transmittance:
  <https://www.usgs.gov/centers/astrogeology-science-center/science/rolo-further-details-lunar-calibration>
- Kasten and Young's revised optical-air-mass approximation is used for
  observer-path extinction:
  <https://opg.optica.org/ao/abstract.cfm?uri=ao-28-22-4735>
- CIE 191 places night viewing across a broad mesopic transition rather than a
  binary day/night switch. Adaptation here is a deterministic luminance-driven
  exposure, not a feedback loop that can pump as clouds move:
  <https://www.cie.co.at/publications/recommended-system-mesopic-photometry-based-visual-performance>
- ESO documents atmospheric turbulence as the cause of stellar twinkling and
  image blur. The runtime keeps intensity scintillation, chromatic
  scintillation, and seeing/PSF width as related but distinct states:
  <https://www.eso.org/public/images/potw1820a/>
- NASA describes earthshine as a faint secondary reflection strongest near a
  slim crescent, with seasonal variation from Earth's changing albedo. It is
  therefore a low-energy secondary exposure, not a readable fill light on all
  lunar phases:
  <https://science.nasa.gov/earth/earth-observatory/earthshine-83782/>
- Aerosol envelopes follow the component families represented by OPAC and the
  measured increase of aerosol scattering with relative humidity documented by
  NOAA. They are deliberately broad enough for mixed and aged air masses:
  <https://opg.optica.org/ao/abstract.cfm?uri=ao-36-30-8031>
  <https://gml.noaa.gov/aero/instrumentation/humid.html>
- Atmosphere transport follows Hillaire's production model: source radiance,
  transmittance, multiple scattering, and final artistic grade are independent
  stages:
  <https://onlinelibrary.wiley.com/doi/10.1111/cgf.14050>

## Runtime source contract

`SkyRadianceScene` exposes:

- `solarTopOfAtmosphereIrradiance`: invariant scene-domain solar TOA source.
- `moonTopOfAtmosphereIrradiance`: solar source × 2.4e-6 × lunar phase law ×
  Earth-Moon distance correction, with a restrained lunar reflectance spectrum.
- `adaptationExposure`: a common **post-transport linear multiplier**, not EV.
  It is 3.25 at the accepted 5500 cd/m² daylight reference, about 13,000 under
  a representative full-Moon sky, and about 76,000 for a pristine moonless
  natural sky. It is bounded at 82,000.

The physical atmosphere consumer must use the two explicit TOA fields directly.
It must not divide the lunar source by `moonTransmittance`; that field is an
observer-path diagnostic for the disc and legacy display consumers. The final
exposure is applied to the complete transported scene so moonlit atmosphere,
clouds, precipitation, stars, and ground response adapt together.

## Celestial visibility

- Star positions are Hipparcos catalogue positions transformed through local
  sidereal time, apparent-altitude refraction, and the camera projection.
- Each projected star now also carries intrinsic scene-linear TOA RGB flux,
  RGB observer-path transmittance, flux-conserving scintillation, independent
  angular tip/tilt, and an energy-normalized Moffat PSF/support radius. B-V is
  converted through a Planckian-locus CIE chromaticity into linear sRGB.
- Catalogue flux remains logarithmic. Detection uses sky adaptation, slant-path
  extinction, moon glare, horizon extinction, and cloud veil. Emitted stellar
  energy is stored relative to the Sun (visual magnitude -26.74), so the final
  common exposure does not double-adapt an arbitrary Sirius-normalized value.
- Scintillation grows with airmass to the 7/4 family, is strongest for bright
  unresolved sources, and is damped by obscuring aerosol/cloud. Haze does not
  manufacture extra twinkling.
- Seeing broadens the stellar PSF independently of intensity scintillation.
- Lunar direct-beam RGB transmittance uses Rayleigh, aerosol Angstrom, ozone,
  observer-altitude, and air-mass terms. Cloud density does not masquerade as
  aerosol optical depth.
- Lunar surface registration uses a real physical-ephemeris record: optical
  libration with principal physical corrections, the USNO bright-limb position
  angle, IAU lunar north, the local parallactic angle, phase, distance, and the
  Sun direction in lunar-disc coordinates. Registered LROC/LOLA samples use a
  periodic longitude, clamped latitude, explicit limb footprint, and terrain-
  normal reliability at under-resolved foreshortening.
- The lunar atmospheric aureole is derived from the Moon source, Rayleigh and
  aerosol scattering optical depths, Cornette-Shanks forward scattering, and
  two atmosphere path transmittances. It is not an independently colored or
  sized screen-space bloom.
- Earthshine is limited to slim crescents, deep adaptation, and a maximum
  display opacity of 0.0065.
- The lunar texture uses a local HDR disc scale inversely proportional to the
  common adaptation exposure. This is highlight reconstruction for visible
  surface detail; it does not alter lunar TOA irradiance or moonlit transport.

Natural-night diffuse sources remain radiometrically distinct. Zodiacal light,
structured unresolved Galactic radiance, broad integrated starlight, airglow,
and upward artificial ground emission have separate scene states and diagnostic
outputs. Extraterrestrial components receive the full atmosphere path once,
airglow receives only the atmosphere below its 84–101 km emitting shell, and
ground emission is forwarded to atmosphere/cloud scattering rather than added
to screen color.

## Authored palette bounds

Palette families remain editorial mood intent. Aerosol type constrains particle
size, absorption, humidity, and plausible stratospheric loading before the
physical atmosphere sees the values. The authored night floor is remapped into
a bounded radiance range; it no longer forces every moonless night to a bright
gradient. Color identity survives as a small post-transport residual rather
than impossible source chromaticity.

`scripts/test-astronomy-state.mjs` qualifies phase/distance behavior,
transmittance ordering, adaptation response, source/observer separation,
stellar detection, earthshine bounds, and every authored aerosol family.

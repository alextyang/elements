# Physical celestial and night-sky foundation

`celestial-physics.ts` and `celestial-physics-wgsl.ts` are a binding-free,
scene-linear contract for catalogue stars, lunar surface radiance, natural night
emission, artificial ground light, and the resolved Sun. They deliberately do
not contain an exposure or output transform.

The reference basis is Jensen et al.'s physically based night-sky decomposition
(resolved stars and Moon, unresolved Galactic light, zodiacal light, airglow,
and atmospheric transport), Hapke-family lunar photometry, and an
energy-normalized Moffat seeing profile:

- <https://graphics.cs.yale.edu/publications/physically-based-night-sky-model>
- <https://pubmed.ncbi.nlm.nih.gov/17737471/>
- <https://www-robotics.jpl.nasa.gov/media/documents/Villa_ea_Image_Rendering_AAS_GNC_2023.pdf>
- <https://pubmed.ncbi.nlm.nih.gov/20333125/>

The compact formulae are production approximations, not claims of spectral
simulation. Their important invariant is transport order: one TOA source, one
atmosphere evaluation, and one common scene exposure.

`celestial-ephemeris.ts` supplies the shared coordinate contract. It recovers
apparent equatorial Sun/Moon coordinates from the topocentric state, evaluates
the USNO bright-limb position angle, resolves lunar north relative to the local
zenith, evaluates optical libration plus the principal physical-libration
terms, and transforms the J2000 ecliptic and Galactic axes into renderer space.
NASA SVS hourly imagery remains the authoritative 2026 surface path; the
ephemeris-driven LROC/LOLA path is the deterministic fallback.

## Production compositor integration

The WebGPU renderer now consumes celestial ABI v2 directly. The active star
pass distributes linear catalogue flux through the normalized angular Moffat
mixture, keeps detection out of emitted energy, and resolves scintillation,
tip/tilt, and seeing separately. The active lunar pass uses ephemeris-correct
NASA SVS imagery when available and the registered analytic LROC-style path as
its deterministic fallback. No pass applies its own photographic exposure.

| Replaced legacy behavior | Active production behavior |
| --- | --- |
| Stellar `pow(radiance, 0.48)` before composition | Integrated catalogue flux stays linear through transport and the normalized PSF. |
| Decorative, finite-support star profile with no energy integral | `celestial_stellar_psf` is a unit-integral Moffat mixture; the CPU record supplies an angular support for a requested retained-energy fraction. |
| Scalar scintillation baked into billboard energy | Positive RGB flux gain, image motion, and seeing width are separate outputs. |
| Lunar texture gamma/power reinterpretation | NASA SVS frames are decoded to linear source radiance; the fallback treats registered albedo as linear reflectance before photometry. |
| Spherical normal only and cosine illumination | Ephemeris orientation, optical/physical libration, Hapke-like photometry, and disk-integrated ROLO calibration are active. A registered SLDEM/LOLA normal map remains an optional asset upgrade when one is licensed and shipped. |
| Display-strength earthshine and phase-dependent alpha | Earthshine is a capped secondary irradiance; alpha/coverage is geometric limb coverage only. |
| Moon alpha blended over the completed sky | Moon coverage replaces only behind-Moon extraterrestrial radiance; foreground atmosphere remains additive and unchanged. |

The atmosphere pass evaluates zodiacal light, unresolved Galactic light,
integrated starlight, airglow, the physical lunar aureole, and finite artificial
ground-light scattering before the existing five-packet cloud/weather affine
transport. Moon and star occultation happen before cloud attenuation. The final
compositor applies the bounded creative grade and photographic exposure once to
the completed scene.

## Source classes

The physical night evaluator does not collapse unlike light into one RGB floor:

- `extraAtmosphericRadianceRgb` contains zodiacal and unresolved Galactic
  radiance. It enters behind the atmosphere and is attenuated once.
- `atmosphericEmissionRadianceRgb` is airglow in the 84–101 km shell. It is
  integrated from its representative altitude through the remaining atmosphere.
- `groundUpwardRadianceRgb` is an artificial-light boundary source. It must be
  scattered through aerosol, cloud, fog, and ground/cloud bounce; it is never
  added as a screen-space horizon dome.

The extra-atmospheric diagnostic split exposes zodiacal light, structured
unresolved Galactic light, and broad integrated starlight separately. The
Hipparcos naked-eye catalogue remains the resolved source set; B-V colors are
converted through a Planckian-locus CIE chromaticity into linear sRGB rather
than treating three sampled wavelengths as display primaries.

A calibrated all-sky Milky Way texture is preferred. The analytic evaluator is
only a continuous fallback and accepts a renderer-sampled calibrated-map value
through `calibratedMapRadianceRgb` / `calibrated_map_radiance`. Both the Galactic
north and centre must be transformed from J2000 into the same local world frame
as the catalogue stars before evaluation.

## Stars

`createStellarSourceSample()` converts catalogue V magnitude to integrated flux
relative to the Sun and B-V to a unit-luminance linear RGB spectral shape. Sky
detection confidence remains metadata; it must not multiply emitted flux. The
renderer should:

1. Compute catalogue TOA flux.
2. Apply the physical atmosphere and cloud transmittance once.
3. Multiply by `createStellarTurbulenceState().rgbGain`.
4. Distribute the resulting integrated flux through `evaluateStellarPsf()`.
5. Apply the shared exposure and output transform after composition.

The Moffat mixture is normalized over the image plane. `stellarPsfSupportRadius`
provides a finite billboard radius for a chosen retained-energy threshold. Tip/
tilt is returned in arcseconds separately from seeing FWHM, and chromatic
scintillation is luminance-normalized around the achromatic intensity process.
There is no pre-exposure power curve.

`createStellarRenderSample()` is the concrete CPU handoff. It returns catalogue
source state, observer-transmitted/scintillated RGB flux, angular PSF parameters,
and an angular support radius. Detection and exposure are deliberately absent.

## Moon

`evaluateLunarSurface()` accepts registered linear albedo, a surface normal
derived from elevation, Sun/view directions, and TOA solar irradiance. It
returns direct Hapke-like/Lommel-Seeliger radiance plus a phase-dependent
earthshine contribution capped near 0.012% of the solar-lit reference. The
surface map, libration, and subsolar geometry remain caller-owned.

The exact texture ABI is exported as `CELESTIAL_LUNAR_TEXTURE_CONTRACT`. Decode
the elevation normal to signed tangent space (`+x` east, `+y` north, `+z`
outward) and pass it through `reconstructLunarSurfaceNormal()` or
`celestial_lunar_surface_normal()`. LROC albedo is absolute linear reflectance;
the evaluator turns it into a bounded spatial modulation around
`referenceAlbedo`, avoiding the old double application of absolute albedo and
Hapke single-scattering albedo. `roloCalibrationRgb` is an optional, linear,
disk-integrated calibration multiplier for direct sunlight, not an exposure.

`sampleLunarDiscGeometry()` is the CPU reference for analytic high-resolution
limb antialiasing. In WGSL, pass `fwidth(length(disc_uv))` as the radial pixel
footprint. `celestial_lunar_terminator_coverage()` antialiases illumination only;
it is never lunar-disc alpha.

`sampleLunarTextureCoordinates()` and its WGSL twin register the disc against
moon-fixed LROC/LOLA coordinates with real libration and pole orientation. The
returned explicit texture footprint prevents over-sharp limb sampling, U wraps
across lunar longitude, V clamps at the poles, and relief normals fade to the
geometric normal only when limb foreshortening falls below a pixel.

`evaluateLunarAtmosphericAureole()` and its WGSL twin evaluate Rayleigh and
Cornette-Shanks aerosol forward scattering from atmosphere-owned optical depths
and two path transmittances. The result is finite-disc regularized and
scene-linear. It is not an independently authored radial glow; cloud diffraction
and optical/ocular glare remain separate transport classes.

The Moon is an ordered radiative layer, not an alpha decal:

```text
observed = foreground atmosphere/cloud radiance
         + foreground transmittance
         * mix(behind-Moon extraterrestrial radiance,
               lunar surface radiance,
               limb coverage)
```

When only an additive renderer hookup is available, add
`additiveObservedRadianceRgb` and separately multiply catalogue/unresolved
background by `extraAtmosphericBackgroundTransmission`. Never subtract the
already-integrated foreground sky. A dark lunar hemisphere therefore occults
stars while retaining the atmospheric radiance in front of it.

## Sun

`createPhysicalSunDiscState()` and `evaluateSunDiscRadiance()` turn TOA solar
irradiance into a resolved, quadratic-limb-darkened radiance disc whose solid-
angle integral returns the source irradiance. The attached Moffat PSF is compact
and energy normalized. Aerosol/cloud forward scattering belongs to atmospheric
transport; it must not be duplicated as a radial screen stamp. Render the disc
only when its physical direction intersects the camera frustum.

## Exact renderer integration points

These changes intentionally avoid the active main-shader files. Hookup is
mechanical at the following locations after the renderer owner finishes:

1. `astronomy.tsx`, inside the `HIPPARCOS_STARS.flatMap` loop: replace the scalar
   `solarRelativeIrradiance * detection` source with
   `createStellarSourceSample(star.mag, star.bv, transmittance)`. Store detection
   separately, pass physical `topOfAtmosphereFluxRgb`, PSF parameters, and the
   turbulence seed/state to the renderer. Do not change catalogue positions.
   This CPU handoff is now prepared: `ProjectedStar` carries intrinsic TOA RGB
   flux, one-path observer RGB flux, RGB transmittance, angular PSF/support, and
   independent tip/tilt. Its compatibility scalar no longer includes detection.
2. `webgpu-shaders.ts`, star pass: build the complete module with
   `createCelestialPhysicsShaderSource({ entryPointWgsl })`; remove
   `pow(radiance, 0.48)` and sample `celestial_stellar_psf`. Apply RGB turbulence
   to linear flux and tip/tilt to angular position before the one shared
   exposure.
3. `webgpu-shaders.ts`, Moon section: sample albedo/elevation-derived normal,
   call `celestial_lunar_surface`, and use `celestial_layer_contribution`.
   Preserve atmosphere/cloud in-scatter accumulated before the lunar distance;
   apply the returned occultation only to stars and other behind-Moon sources.
   `MoonScene.ephemeris` now carries libration, pole and bright-limb orientation,
   phase angle, angular radius, and the Sun direction in lunar disc coordinates.
4. `physical-atmosphere-wgsl.ts` / atmosphere resource graph: sample zodiacal
   and calibrated Galactic radiance as the ray's extraterrestrial boundary;
   integrate airglow from its shell altitude; expose artificial ground emission
   to ground and cloud-bounce transport. Do not fold any of these into a TOA
   Sun/Moon source.
   `CelestialScene.naturalNight` now supplies local ecliptic/Galactic axes and
   airglow, zodiacal, Galactic, integrated-starlight, and optional upward-ground
   source states; LUT/compositor binding remains renderer-owned.
5. `webgpu-shaders.ts`, physical sky composite: call
   `celestial_sun_disc_radiance` at the physical Sun direction and convolve only
   its compact optical PSF. Atmosphere/cloud transmittance and scattering remain
   authoritative.
6. `sky-renderer-canvas.tsx`: allocate/pack the new source parameters and an
   optional calibrated Galactic map. Apply `adaptationExposure` once after all
   atmosphere, cloud, hydrometeor, Moon, Sun, star, and night-emission terms.

`composeCelestialAtmosphereOrder()` and its WGSL twin provide a directly testable
ordering reference: Galactic/zodiacal boundary plus stars, resolved Sun,
nearer resolved Moon, then atmosphere in-scatter and path-integrated airglow.
The returned value is explicitly **before clouds** and **before exposure**.
`CELESTIAL_PHYSICS_ABI_VERSION` must change if consumer-visible packed fields or
WGSL signatures change; `CelestialLunarPhotometry.surface` is currently a
`vec4<f32>` containing opposition width, roughness, reference linear albedo,
and a zero reserved field.

`scripts/test-celestial-physics.mjs` provides CPU reference, energy conservation,
ordered-composition, source-class separation, and WGSL contract parity checks.

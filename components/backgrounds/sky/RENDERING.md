# Sky rendering model

Celestial features are not independent overlays. The renderer treats the Moon
and stars as radiance arriving from outside the atmosphere, attenuates them by
airmass-dependent Rayleigh and aerosol optical depth, adds a restrained
Rayleigh/Mie-inspired in-scattering lobe, and applies one photographic tone
curve. Thin cloud and mist layers render above that result with ordinary alpha
compositing so they both extinguish celestial contrast and add scattered light.

The implementation is deliberately hybrid. A low-power WebGL2 pass evaluates
the full-screen atmospheric radiance once when the scene or viewport changes;
it has no animation loop. Slowly moving cloud and moisture fields remain in
low-cost CSS, while a second transparent WebGL2 canvas handles the small,
high-frequency celestial features. The Moon is drawn only when its scene or
texture changes. Only visibly scintillating stars trigger the capped animation
loop. This preserves a physically coherent base without creating a permanent
full-screen GPU workload.

## Lunar and stellar photometry

The Moon uses NASA SVS hourly LRO/LOLA frames for the real phase, libration,
terrain, and shadow geometry. The display-referred JPEG black floor is removed
before inverse transfer and scene-linear exposure, preventing compressed dark
pixels from becoming a visible gray hemisphere. Earthshine is a separate,
blue-biased illumination term. It is restricted to thin crescents, requires a
dark adapted sky, and is suppressed by low altitude and atmospheric clarity.
The renderer never raises exposure merely because the illuminated fraction is
small. Regolith shading uses a Lommel-Seeliger/Lambert blend, with the extra
opposition term limited to the very small phase angles where shadow hiding and
coherent backscatter are observed.

Illuminated area is never used as a proxy for lunar brightness. Disk-integrated
irradiance follows the measured nonlinear lunar phase law, including a narrow
opposition enhancement and Earth-Moon distance. The glow is then split into
the phenomena that actually produce it: a compact optical/seeing point-spread
function around the bright pixels, a spectrally tinted Rayleigh component, a
two-scale aerosol forward-scattering aureole, and a weak multiple-scattering
floor. Source and view airmass both enter the single-scattering transport
integral. Thin cloud and mist modulate that same angular field with correlated
density, so humid nights develop broken luminous veils instead of a circular
gradient stamp. Low-altitude extinction warms both the direct Moon and its
near-source aerosol scatter while wider molecular scatter remains relatively
blue.

The textured Moon and every atmospheric lunar term share one screen-space
projection and one attenuated source irradiance. The wide molecular, aerosol,
cloud, and multiple-scattering fields stay centred on the ephemeris position;
only the much smaller ocular PSF follows the centroid and extent of the
actually illuminated phase. This prevents a detached glow and keeps a bright
direct Moon coupled to a corresponding atmospheric response.

The transparent celestial pass is composited as emitted radiance. Coverage is
derived from sunlit terrain plus the much fainter earthshine exposure, never
from the geometric lunar silhouette. A zero-light dark hemisphere is therefore
transparent and neutral over the atmosphere rather than an opaque dark disc;
visible earthshine only adds its measured, terrain-shaped signal.
Measured earthshine surface brightness spans roughly +13.5 to +15.5 visual
magnitudes per square arcsecond and varies strongly with phase and terrestrial
weather. The display mapping therefore treats it as a separate secondary
exposure: it reaches a subdued maximum below a ten-percent crescent, falls to
zero by twenty percent illumination, and never supplies a generic dark-side
fill. The star and Moon draws use separate WebGL vertex-array objects so the
lunar quad cannot inherit catalogue-star attribute state.

The direct lunar image is also filtered as one scene-linear radiance source.
NASA texture, terrain, terminator, limb, earthshine, and the opposition term
all pass through the same atmosphere-dependent point-spread function before
tone mapping and compositing. A compact Moffat-like core approximates the
long-exposure turbulence/optical PSF; an isotropic seventeen-tap kernel avoids
directional sampling artifacts, while a separately weighted outer component
adds the weaker non-Gaussian seeing wing. Airmass broadens and mildly stretches
the direct core, but aerosol and thin-cloud optical depth primarily remove
unscattered contrast and reappear in the additive sky aureole rather than
turning the Moon into a defocused disc. Only very low Moon altitudes introduce
a subpixel zenith-directed broadband dispersion. Clear, high-altitude Moons
therefore retain terrain detail, while humid and horizon Moons lose contrast
without acquiring an unrelated circular blur stamp. NASA phase frames do not
contain earthshine, so the registered LROC albedo map supplies subdued maria
and highland structure on the dark hemisphere when real viewing conditions
make it visible. Its level is compensated for the photographic tone curve's
dark toe, but still falls rapidly with illuminated fraction, sky brightness,
airmass, and lost atmospheric clarity.
The much wider moonlit-sky aureole remains in the atmospheric pass because it
is angular sky radiance, not image blur. Its aerosol phase functions are
normalised at the source direction before their energy is scaled. Particle size
can consequently narrow or broaden the aureole without multiplying its peak
radiance, while correlated cloud optical depth may still produce a broken,
condition-dependent luminous veil.

The star field contains 8,874 real Hipparcos entries through Johnson V=6.5,
generated reproducibly from CDS VizieR I/239. Apparent magnitude is modified by
Kasten-Young airmass extinction and local lunar glare, then converted from its
logarithmic flux scale into a display-compressed intensity. The visibility
cutoff fades separately, so threshold proximity no longer defines a star's
brightness. B-V colour is mapped continuously along a restrained Planckian
sequence, with faint stars desaturated for scotopic vision and low-altitude
stars mildly reddened by extinction.

Stars use a compact Moffat-like seeing point-spread function. Diffraction
crosses are omitted because they are imaging-aperture artifacts, not naked-eye
stellar structure. Only sufficiently bright stars scintillate visibly. Their
intensity follows mean-preserving, non-periodic noise at multiple atmospheric
timescales; airmass controls its strength and the much weaker chromatic and
angle-of-arrival variation. This avoids synchronized or sinusoidal twinkling
while retaining the rapid, irregular behavior of low-altitude stars.

## Continuous radiance field

The visible sky is no longer the direct interpolation of five CSS gradient
stops. Palette samples now art-direct one continuous two-dimensional radiance
field. Its altitude response uses broad zero-slope interpolation combined with
an airmass curve; its azimuth response uses Rayleigh, forward Mie, reverse
twilight, lunar, and edge-illumination terms. A wide multiple-scattering fill,
weak correlated aerosol-density variation, and night-only airglow and zodiacal
components add structure at different spatial scales without becoming cloud
stamps or decorative blobs.

All scattering additions are composed in scene-linear RGB and converted back
to display sRGB only once. A fixed, decorrelated triangular RGB dither of about
one 8-bit quantisation interval is applied in physical pixel space after the
display transform, with slightly more amplitude in very dark gradients. The
compact lunar glare independently uses stochastic alpha quantisation, keeping
its faint falloff from collapsing into concentric transparency bands. Both
patterns are fixed in physical pixels and therefore do not shimmer. The
atmosphere pass renders at native Retina density on ordinary displays and uses
a total-pixel budget on very large 4K/5K surfaces; it redraws only after a
scene or viewport change. The legacy CSS gradient remains only as a WebGL
fallback and does not animate behind the opaque radiance canvas.

## Atmospheric and palette constraints

The color families are art-directed samples of real atmospheric regimes, not
interchangeable color themes. Each family carries aerosol, humidity, natural
night-floor, horizon-lift, and ground-skyglow parameters. Daily variants alter
the grade inside that regime; they no longer wrap to an adjacent family's base
palette. The runtime then derives a physical lighting regime from solar
altitude, lunar altitude and illuminated fraction, cloud density, and the
family optics.

During daylight and twilight, each graded palette is composed against a
solar-geometry envelope rather than accepted as a whole-dome tint. Clear,
moist, and overcast reference domes constrain the zenith, upper sky, horizon,
cloud, and haze independently in perceptual color space. Moisture and broad
multiple scattering reduce dome chroma and contrast. Aerosol warmth is kept in
the forward solar lobe; clean-air pink is kept in the bounded antisolar arch;
ozone's low-Sun violet contribution is restricted to the optical paths where
its Chappuis-band absorption matters. Family-specific constraint strengths
leave already-physical clear and desert skies mostly intact while strongly
correcting globally aqua, sage, rose, violet, smoke, and overcast combinations.

The WebGL scattering pass follows the same separation. Rayleigh fill, low-Sun
aerosol scattering, ozone-weighted twilight, and the Belt of Venus use
independent spectral reference colors in scene-linear space. Palette colors
provide only a restrained local grade. This prevents a decorative palette hue
from becoming the color of molecular or aerosol illumination everywhere, while
preserving the intended day-to-day diversity at the source-facing horizon,
antisolar edge, cloud deck, and humidity veil.

Atmospheric composition is resolved into independent, daily seeded dimensions:
aerosol optical depth, aerosol species, particle size, absorption, humidity,
ozone column, observer altitude, boundary-layer inversion, stratospheric
aerosol, and ground albedo. The atmosphere style then applies a small coupled
weather bias rather than replacing those values. Altitude reduces effective
airmass and boundary aerosol; humidity increases particle scattering while
compressing chroma; particle size changes forward-scattering anisotropy;
absorption changes low-Sun transmission; ozone changes twilight blue/violet;
and ground albedo only returns energy into the lowest multiple-scattering layer.
The unlisted laboratory exposes every dimension independently, while production
uses family-constrained combinations.

The two-dimensional radiance field now includes a subtle Rayleigh phase
minimum, a solar-depression-driven Earth shadow, a bounded Belt of Venus,
finite-height irregular inversion layers, elevated volcanic afterglow, and
separate green and red airglow layers. Thin cloud optical depth is evaluated in
the static atmospheric pass so it can extinguish and re-scatter sky radiance;
the moving CSS cloud layers remain responsible only for slow temporal change.
This preserves integration without adding a continuously animated full-screen
shader.

Deep night is composed after the display palette is selected. Zenith and
horizon luminance settle nonlinearly from nautical through astronomical
twilight; chroma compresses for mesopic vision; haze lifts and desaturates the
horizon; pristine air makes the zenith darker; a visible Moon raises the sky
floor and illuminates clouds; moonless cloud decks become darker than the clear
sky unless the family's intentional ground skyglow is strong enough to light
their undersides. This produces materially different pristine, marine, alpine,
desert, overcast, smoky, humid, polar, airglow, moonlit, and cloud-amplified
nights without inventing impossible source-light combinations.

Every daily family has a real-world anchor:

| Family | Real atmospheric reference | Deliberate liberty |
| --- | --- | --- |
| Crystal Azure | low-aerosol continental or high-pressure sky | slightly clearer edge separation |
| Marine Pearl | humid maritime boundary layer and sea haze | pearlescent horizon held a little longer |
| Lavender Alpenglow | clean high-altitude air with distant aerosol/cirrus | restrained violet emphasis near twilight |
| Desert Apricot | dry air with mineral aerosol near the horizon | apricot scattering is selectively enriched |
| Storm Slate | thick, moisture-rich overcast | slate separation remains readable instead of flat gray |
| Smoky Copper | absorbing smoke/dust aerosol | copper is confined to aerosol paths and the lower sky |
| Humid Aqua | tropical humidity and hydrated aerosol | cyan-green lift is subtle and luminance-led |
| Winter Ice | cold, dry, low-aerosol continental/polar air | blue-white clarity is gently emphasized |
| Rose Afterglow | high cloud catching sunlight after ground sunset | rose remains localized to afterglow geometry |
| Violet Nocturne | exceptionally clear blue hour and moonless high sky | violet is strongly desaturated in deep night |
| Sage Haze | humid haze or marine stratus | sage is a low-chroma veil, never a saturated night fill |
| Cobalt Gold | very clear dry air with strong low-sun contrast | cobalt/gold opposition is enhanced at the edges |
| Post-storm Cerulean | aerosol-scavenged air with residual humidity and retreating cloud | washed clarity is held slightly longer |
| Coastal Silver | coarse sea-salt aerosol in a bright humid maritime boundary layer | silver glare remains readable without cyan saturation |
| Saharan Veil | transported coarse mineral dust over otherwise dry air | ochre forward scattering is selectively enriched |
| Volcanic Amethyst | fine, weakly absorbing stratospheric sulfate after an eruption | rare elevated purple-orange afterglow is gently emphasized |
| Urban Amber Inversion | absorbing fine pollution trapped below a temperature inversion | low amber skyglow remains localized to the boundary layer |
| Monsoon Pewter | saturated tropical air beneath a deep stratiform cloud deck | muted pewter separation avoids a featureless flat gray |

The CIE General Sky supplies the clear-to-overcast daylight distribution
constraint. Perez is used as a daylight reference only, since it does not model
twilight or night. Twilight follows the measured rapid fall in sky radiance
through solar depression rather than linear day-to-night interpolation. Night
composition follows measured contributors—airglow, integrated starlight,
zodiacal light, lunar scattering, aerosol extinction, and optional artificial
skyglow—and the well-observed reversal whereby moonless natural clouds can be
dark while light-polluted low clouds become brighter than clear sky.

Primary technical references:

- Eric Bruneton and Fabrice Neyret,
  [Precomputed Atmospheric Scattering](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- Sébastien Hillaire,
  [A Scalable and Production Ready Sky and Atmosphere Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf)
- Simon Schneegans et al.,
  [Physically Based Real-Time Rendering of Atmospheres using Mie Theory](https://diglib.eg.org/items/1fb6b85a-b3f8-4817-975f-f65634020f03)
- Alexander Wilkie et al.,
  [A Fitted Radiance and Attenuation Model for Realistic Atmospheres](https://cgg.mff.cuni.cz/publications/skymodel-2021/)
- Sergey Kocifaj et al.,
  [The influence of tropospheric haze on twilight sky color](https://opg.optica.org/ao/abstract.cfm?URI=AO-56-19-G179)
- Sergey Kocifaj et al.,
  [The role of ozone and aerosols in the colouration of the twilight sky](https://acp.copernicus.org/articles/23/14829/2023/)
- NASA Earth Observatory,
  [Aerosols: Tiny Particles, Big Impact](https://science.nasa.gov/earth/earth-observatory/aerosols/)
- NOAA Global Monitoring Laboratory,
  [Aerosol hygroscopic growth measurements](https://gml.noaa.gov/aero/instrumentation/humid.html)
- Hartmut Winkler,
  [A revised simplified scattering model for the moonlit sky brightness profile](https://academic.oup.com/mnras/article/514/1/208/6589414)
- Amy Jones et al.,
  [An advanced scattered moonlight model for Cerro Paranal](https://arxiv.org/abs/1310.7030)
- Kevin Krisciunas and Bradley Schaefer,
  [A model of the brightness of moonlight](https://articles.adsabs.harvard.edu/pdf/1991PASP..103.1033K)
- Henrik Wann Jensen et al.,
  [A Physically-Based Night Sky Model](https://graphics.ucsd.edu/~henrik/papers/nightsky/)
- CIE,
  [Spatial distribution of daylight — CIE Standard General Sky](https://www.cie.co.at/publications/spatial-distribution-daylight-cie-standard-general-sky-0)
- Andrew Crumey,
  [Human contrast threshold and astronomical visibility](https://arxiv.org/abs/1405.4209)
- Florian Jechow et al.,
  [Tracking the dynamics of skyglow with differential photometry using a digital camera](https://doi.org/10.1088/2041-8205/826/2/L34)
- Sergey Kocifaj et al.,
  [The amplitude of night sky brightness due to scattered moonlight](https://academic.oup.com/mnras/article/470/1/731/3859529)
- Julien Lalonde and Iain Matthews,
  [Laval HDR Sky Database](https://lvsn.github.io/deepskymodel/)
- Academy Software Foundation,
  [ACES Output Transforms](https://docs.acescentral.com/system-components/output-transforms/)
- S. Noll et al.,
  [An atmospheric radiation model for Cerro Paranal](https://arxiv.org/abs/1205.2003)
- Eduard Masana et al.,
  [A multi-band map of the natural night sky brightness](https://arxiv.org/abs/2101.01500)
- Madhukar Budagavi and Oscar Bici,
  [Adaptive Debanding Filter](https://arxiv.org/abs/2009.10804)
- U.S. Geological Survey,
  [ROLO lunar model and database](https://www.usgs.gov/media/files/rolo-lunar-model-and-database)
- Bruce Hapke,
  [The wavelength dependence of the lunar phase curve](https://doi.org/10.1029/2011JE003916)
- Peter Thejll et al.,
  [On the colour of the dark side of the Moon](https://arxiv.org/abs/1401.1994)
- Pilar Montañés-Rodríguez et al.,
  [Measurements of the surface brightness of the earthshine](https://bbso.njit.edu/Research/EarthShine/literature/Montanes_etal_2007_AJ.pdf)
- Salvador Bará and Carmen Bao-Varela,
  [Skyglow inside your eyes](https://arxiv.org/abs/2212.09103)
- Andrew Crumey,
  [Human contrast threshold and astronomical visibility](https://arxiv.org/abs/1405.4209)
- Andrew T. Young,
  [The temporal power spectrum of scintillation](https://doi.org/10.1364/AO.8.000869)
- ESA / DPAC,
  [Gaia DR3 photometry documentation](https://gea.esac.esa.int/archive/documentation/GDR3/)
- Bo Xin et al.,
  [Monitoring the Atmospheric Turbulence Profile with High Angular Resolution Stellar Images](https://arxiv.org/abs/1805.02845)
- P. Martínez et al.,
  [Atmospheric image blur with finite outer scale or partial adaptive correction](https://arxiv.org/abs/astro-ph/0109067)
- Mohamed E. Hanafy et al.,
  [Atmospheric scattering point-spread function: modeling and application in remote sensing](https://opg.optica.org/abstract.cfm?uri=josaa-31-6-1312)
- C. Y. Hsu et al.,
  [Measurement of atmospheric point spread function by imaging the Moon's edge](https://aas.aanda.org/articles/aas/pdf/1997/16/ds5557.pdf)
- L. S. Samland,
  [Impact of atmospheric dispersion on high-contrast imaging](https://arxiv.org/abs/2112.01284)

# Sky rendering model

Celestial features are not independent overlays. The renderer treats the Moon
and stars as radiance arriving from outside the atmosphere, attenuates them by
airmass-dependent Rayleigh and aerosol optical depth, adds a restrained
Rayleigh/Mie-inspired in-scattering lobe, and applies one photographic tone
curve. Thin cloud and mist layers render above that result with ordinary alpha
compositing so they both extinguish celestial contrast and add scattered light.

The implementation is deliberately hybrid. The page's slowly changing sky and
weather field stays in low-cost CSS, while the small high-frequency celestial
features use a low-power WebGL2 canvas. The Moon is drawn only when its scene or
texture changes. Only visibly scintillating stars trigger the capped animation
loop. This avoids the permanent full-screen shader workload that would be
unreasonable for an ambient background.

## Atmospheric and palette constraints

The color families are art-directed samples of real atmospheric regimes, not
interchangeable color themes. Each family carries aerosol, humidity, natural
night-floor, horizon-lift, and ground-skyglow parameters. Daily variants alter
the grade inside that regime; they no longer wrap to an adjacent family's base
palette. The runtime then derives a physical lighting regime from solar
altitude, lunar altitude and illuminated fraction, cloud density, and the
family optics.

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
- Alexander Wilkie et al.,
  [A Fitted Radiance and Attenuation Model for Realistic Atmospheres](https://cgg.mff.cuni.cz/publications/skymodel-2021/)
- Hartmut Winkler,
  [A revised simplified scattering model for the moonlit sky brightness profile](https://academic.oup.com/mnras/article/514/1/208/6589414)
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

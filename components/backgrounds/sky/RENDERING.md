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
- Academy Software Foundation,
  [ACES Output Transforms](https://docs.acescentral.com/system-components/output-transforms/)

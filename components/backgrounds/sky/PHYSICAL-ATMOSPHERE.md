# Physical atmosphere subsystem

`physical-atmosphere.ts` and `physical-atmosphere-wgsl.ts` provide the
production atmosphere that replaces palette-authored source radiance. The
implementation follows Hillaire's spherical, low-dimensional LUT design and
keeps all intermediate quantities in scene-linear RGB.

Primary references:

- Sébastien Hillaire, [A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique](https://sebh.github.io/publications/egsr2020.pdf), EGSR
  2020.
- Epic Games, [UnrealEngineSkyAtmosphere reference
  implementation](https://github.com/sebh/UnrealEngineSkyAtmosphere), MIT.
- Epic Games, [Sky Atmosphere rendering
  documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/sky-atmosphere-component-in-unreal-engine).

The complete upstream license and exact revision consulted are preserved in
`PHYSICAL-ATMOSPHERE-NOTICE.txt`.

## Radiometric contract

- Distances are kilometres and coefficients are inverse kilometres.
- The atmosphere is a spherical shell. Density depends on radial altitude, not
  screen height.
- Rayleigh, tropospheric aerosol, stratospheric aerosol, aerosol absorption,
  and ozone absorption are independent RGB terms. Tropospheric aerosol is a
  column-conserving blend of an exponential free-troposphere profile and a
  smooth inversion-capped mixing layer. Elevated sulfate uses an independent
  Gaussian column and phase asymmetry. Ozone uses an equal-column raised
  cosine whose density and derivative meet continuously at the layer edges.
- Aerosol family is a prior, not a color preset. Angstrom exponent,
  single-scattering albedo, asymmetry, humidity growth, mixing-layer height,
  and elevated optical depth remain continuous physical controls.
- Every light stores unattenuated top-of-atmosphere disc radiance. Direct disc
  radiance applies transmittance once. Atmospheric scattering and irradiance
  multiply radiance by the source's physical solid angle first.
- Solar TOA irradiance is invariant with solar altitude. Planet shadow and
  spherical atmosphere transport create sunset, twilight, noctilucent
  illumination, and night rather than a CPU-side source fade.
- Sun and Moon occupy fixed source slots but use the same functions and LUTs.
  `kind` never selects a different transport equation.
- Every finite medium is an RGB affine operator `{Lrgb, Trgb}`. Ordered
  front-to-back composition is `{Lf + Tf * Lb, Tf * Tb}` and the identity is
  `{0, 1}`. Air and weather transmittance are therefore never encoded as
  ordinary alpha; photopic opacity is metadata only.
- Palette intent is `AtmosphereArtisticGrade`: a small post-integration chroma
  residual. It cannot alter medium coefficients, light radiance, LUT
  invalidation, or extinction. Its manual exposure field remains bounded, but
  production leaves it neutral.
- Camera adaptation is applied once in the final composite after sky, clouds,
  hydrometeors, Moon, and stars share one scene-linear radiance domain. A
  smooth scene-luminance exposure key (including lunar illumination) and
  luminance-preserving ACES shoulder retain dark-night variation without
  exposing individual layers separately.

## LUT graph

| LUT | Layout | Meaning | Invalidated by |
| --- | --- | --- | --- |
| Transmittance | 256×64 RGBA16F | RGB transfer from radius/direction to space | optical state |
| Multiple scattering | 32×32 RGBA16F | isotropic all-orders transfer by altitude/source zenith | optical state |
| Irradiance | 64×32 RGBA16F | hemispherical transfer by altitude/source zenith | optical state |
| Sky view | 192×108×2 RGBA16F | sky-radiance transfer around the observer, one layer per source | optical state, observer altitude, source direction |
| Directional coupling | 96×96×193 RGBA16F | altitude-dependent atmosphere-light lobes plus receiver-depth cloud visibility | optical state, source radiometry/direction, cloud visibility |

Source radiance and source angular radius do not regenerate the optical or
sky-view transfer LUTs, but do invalidate the compact transported directional
lighting cache. Artistic grade is uniform-only. It never regenerates a LUT.
All addressing is clamp-to-edge. The nonlinear sky-view vertical mapping
dedicates half the texture to each side of the geometric horizon, and both
branches meet at the same texel boundary.

## Renderer integration API

Create the physical model from the weather/palette scene:

```ts
const atmosphere = createPhysicalAtmosphereState({
    aerosolType,
    aerosolAngstromExponent,
    aerosolSingleScatteringAlbedo,
    aerosolAsymmetry,
    aerosolOpticalDepth550,
    aerosolBoundaryLayerStrength,
    aerosolBoundaryLayerHeightKm,
    aerosolBoundaryLayerTransitionKm,
    stratosphericAerosolOpticalDepth550,
    stratosphericAerosolCenterAltitudeKm,
    stratosphericAerosolWidthKm,
    relativeHumidity,
    groundAlbedo,
    observerAltitudeKm,
    grade: {
        exposureCompensationEv,
        chromaResidual,
        moodStrength,
    },
});
```

Create the GPU graph once after the WebGPU device is ready:

```ts
const atmosphereGpu = await createPhysicalAtmosphereGpuResources(
    device,
    atmosphere,
    { sources: [sunSource, moonSource], observerAltitudeKm },
);
```

At a scene-state boundary, call `atmosphereGpu.update(atmosphere, lighting)`.
Before any pass that samples a dirty LUT, call
`atmosphereGpu.encodePendingLutUpdates(commandEncoder)`. That function emits at
most four bounded compute passes and becomes a no-op until a relevant state
changes. Call `destroy()` on device loss, backend replacement, or unmount.

`atmosphereGpu.bindings` exposes:

1. the 256-byte, 16-`vec4` uniform buffer, including both aerosol profiles;
2. transmittance texture view;
3. multiple-scattering texture view;
4. two-layer sky-view texture view;
5. altitude irradiance texture view;
6. directional coupling array view;
7. filtering sampler.

Generate binding declarations and consumer functions for a WGSL module with:

```ts
physicalAtmosphereConsumerWgsl({
    group: 0,
    uniformBinding: 16,
    transmittanceBinding: 17,
    multipleScatteringBinding: 18,
    skyViewBinding: 19,
    irradianceBinding: 20,
    samplerBinding: 21,
});
```

The returned WGSL defines these stable functions:

- `physical_atmosphere_source_transmittance(sourceIndex, worldPosition)`:
  attenuated disc radiance for Moon/Sun rendering; never feed this value back
  into another atmosphere function.
- `physical_atmosphere_sky_radiance(viewDirection)`: summed Sun/Moon sky
  radiance from the layered sky-view transfer LUT.
- `physical_atmosphere_world_irradiance(altitudeKm, sourceIndex)`: direct plus
  diffuse RGB irradiance for cloud, terrain, and fog lighting.
- `physical_atmosphere_segment(cameraWorld, sampleWorld)`: finite RGB air
  in-scattering and transmittance for cloud-to-camera or ground-to-camera paths.
- `physical_atmosphere_compose_segment(background, segment)`: the correct
  finite aerial-perspective composite.
- `physical_atmosphere_apply_grade(radiance)`: the final constrained creative
  residual. Apply once, after all physical sky/celestial/cloud composition.

## Renderer integration status and transport ABI

The WebGPU renderer creates, updates, invalidates, and destroys the physical
atmosphere resources; emits dirty LUT work before atmosphere/cloud consumers;
uses physical sky radiance and source transmittance for the sky and celestial
discs; and supplies altitude-dependent source, sky, and ground irradiance to
weather. The constrained artistic grade is applied exactly once to the
completed scene.

Camera weather transport has a stable two-layer `rgba16float` array ABI:

1. array layer 0 stores scene-linear in-scattered `Lrgb`;
2. array layer 1 stores componentwise Beer `Trgb`; its alpha is a freshly
   derived photopic summary for diagnostics only;
3. raw and full-resolution resolved histories use the same layout, clear to
   `{0, 1}`, and swap atomically;
4. reconstruction shares spatial/temporal weights across `Lrgb` and `Trgb`
   while retaining separate RGB bounds;
5. final sky, stars, stellar glow, and debug composition consume `Trgb`, then
   the completed radiance receives one grade and one display transform.

The current bounded weather pass evaluates its RGB medium transport and then
uses `physical_atmosphere_segment` at the representative weather depth to form
the clear-sky-relative foreground-air operator. It does not yet co-march
air and weather at every camera-ray sample. The `{Lrgb, Trgb}` ABI deliberately
supports that future upgrade without another resource migration: an ordered
co-march can publish the same affine operator, or use a clear-air
relative/control-variate formulation and reconstruct the same operator before
history. Source-path optical-depth caches remain independent of this camera ABI.

`scripts/test-physical-atmosphere.mjs` is the numerical and resource contract.
It covers Beer law, reciprocal finite paths, monotonicity, nonnegativity, phase
energy, exact aerosol-column conservation, inversion redistribution, elevated
layer locality, ozone continuity, observer altitude, horizon mapping,
day/golden-hour/twilight/moonlit/moonless behavior, source linearity, LUT
invalidation, ABI/layout, dispatch bounds, and idempotent cleanup.

## Remaining full-scene responsibilities

The atmosphere intentionally does not invent a colored moonless-night floor.
Airglow, zodiacal light, integrated starlight, aurora, and artificial light
domes are physical emitters owned by celestial/weather composition and must be
transported through this atmosphere before the one final grade. Cloud and
hydrometeor camera transport still needs the documented ordered co-march to
replace the current representative-depth air segment. Those are compositor
integration tasks, not palette gradients or atmosphere-density substitutes.

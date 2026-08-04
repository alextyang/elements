# Cirrostratus and upper-atmospheric cloud foundation

`upper-atmospheric-cloud-foundation.ts` and
`upper-atmospheric-cloud-topology-qualification.ts` are isolated physical
contracts. They add no production scene, atlas, runtime, renderer, or shader
dependencies.

## Cirrostratus taxonomy

WMO recognizes Cirrostratus fibratus and nebulosus as species and duplicatus
and undulatus as varieties. The requested radiatus, translucidus, and opacus
axes are represented without inventing taxonomy:

- `cirrostratus-radiatus` is a mixed organization. Radiatus belongs to Cirrus;
  WMO notes that its physically parallel perspective bands may be partly
  Cirrostratus. It is legal only with an explicit Cirrus-radiatus companion.
- `cirrostratus-translucidus` is a noncanonical runtime optical state for the
  transparency inherent in the Cirrostratus genus. It is not emitted as a WMO
  variety name.
- `cirrostratus-opacus` is a non-production transition sentinel. An opaque
  thickening veil no longer satisfies Cirrostratus and must reclassify as
  Altostratus or another appropriate genus.

Each representation has three deterministic macro-topologies. Fibratus keeps
a continuous ice veil beneath non-hooked striations and sedimenting filaments;
nebulosus keeps sparse, ill-defined volume support; duplicatus uses physically
separate altitudes and boundaries; undulatus uses finite one/two-system gravity
waves; radiatus bands are parallel in world space and converge only in camera
perspective. Continuous veils cannot be tiled from population stamps.

## Finite frontal support

Cirrostratus may invade a portion of the dome, cover it, or erode. All states
use a finite high-altitude humidity/ice support with a curved world-space front.
The halo can be the first visible evidence of a thin front, but it does not
define the cloud boundary. A screen-space veil, radial spoke texture, repeated
filament atlas, or post-density alpha fade is invalid.

## Physical ice optics and halos

`qualifyPhysicalCirrostratusHalo()` does not request a drawn ring. It gates a
sample of an oriented hexagonal-ice spectral/Mueller phase function by:

- local optical depth and ice fraction;
- eligible oriented crystal population;
- source elevation;
- the angular locus and finite width of the requested ice-optics family.

The renderer must derive the visible feature from the source direction, view
ray, local ice habits, spectral solar/lunar radiance, and atmosphere paths.
There is no halo when those conditions fail. The result must not be an evenly
bright circle, bloom ring, or decal independent of cloud density.

## Polar stratospheric and nacreous clouds

The contract distinguishes three particle regimes rather than assigning the
nacreous appearance to every PSC:

- STS: small spherical liquid droplets of supercooled HNO3/H2SO4/H2O;
- NAT: solid, generally aspherical nitric-acid-trihydrate particles with a
  polarization/depolarization response unlike STS;
- nacreous ice: the WMO special cloud, a very cold water-ice PSC whose narrow
  size distribution can produce strong mother-of-pearl diffraction colours.

Production reachability requires 15–32 km altitude, high-latitude polar winter,
particle-class temperature thresholds, and plausible solar illumination.
Nacreous displays additionally require a mountain-wave or severe-storm wave
cold pocket. Variants cover stationary mountain-wave lenses, broad polar-vortex
ribbons, and finite eroding patches. Air flows through a stationary lenticular
wave cloud; the cloud texture must not advect like a nearby tropospheric puff.

`qualifyPhysicalIridescence()` requires a spectral, particle-size-dependent
phase function, valid particle scale, suitably narrow size distribution,
limited optical depth, and appropriate scattering angle. Random hue noise,
screen-space gradients, and always-on iridescence are prohibited. All optical
contracts are Stokes/Mueller-ready because particle shape and polarization are
needed to distinguish STS, NAT, and ice.

## Noctilucent clouds

Noctilucent clouds are a mesospheric water-ice sheet nucleated on minute dust,
not emissive Cirrus or aurora. The production gate requires:

- 76–90 km altitude near the mesopause;
- temperature at or below roughly 153 K (-120 C);
- local summer;
- a ground observer between 45 and 75 degrees absolute latitude, with the
  common 50–65 degree band naturally inside that range;
- a dark lower atmosphere while the mesosphere remains sunlit, represented by
  4–18 degrees solar depression;
- a normally near-horizon ground view.

Topology variants include the WMO visual classes: veil, long bands, billows,
and partial/large whirls. They are coupled across gravity-wave scales instead
of being repeated ribbons. Their optical depth is extremely small and their
colour comes from the spectral Sun-to-mesosphere and mesosphere-to-observer
paths plus small-ice scattering. “Electric blue” is not a self-emission term.

## Five-context qualification

Ordinary Cirrostratus is reachable in all five established contexts. PSCs and
nacreous ice are evaluated only in contexts that can retain direct solar
illumination. NLCs are evaluated in twilight and night-labelled contexts only,
with their explicit solar-depression test still required. A preset name never
overrides latitude, season, temperature, altitude, or illumination geometry.

## Serial integration plan

1. Extend scene classification with the two Cs species and orthogonal
   duplicatus/undulatus state. Keep the three requested noncanonical axes as
   runtime organization/optical/transition states exactly as documented.
2. Add a curved, finite frontal ice support to the scene/runtime ABI. Pack
   superposed veil altitude separately and carry physical parallel direction
   for the mixed radiatus companion.
3. Generate three distinct veil macroforms per state. The atlas stores local
   ice structure only; it must not store a full sky population that is tiled.
4. Add PSC/NLC layer domains to double-precision/camera-relative world
   placement. Tropospheric flat-Earth owner scales are insufficient at 20–90
   km altitude and hundreds to thousands of kilometres span.
5. Carry calendar hemisphere, latitude, temperature, Sun depression, wave
   support, and view elevation through scene qualification before allocating a
   visible upper-atmospheric system.
6. Add composition-specific spectral Mueller tables/functions: oriented
   hexagonal ice, spherical STS Mie, aspherical NAT T-matrix, stratospheric ice,
   and submicron NLC ice. Use the same phase data for view and source transport.
7. Couple Sun-to-cloud and cloud-to-eye atmosphere transmittance through the
   physical atmosphere. NLC/PSC visibility specifically depends on the Earth
   shadow and long twilight paths.
8. Integrate halo/iridescence as phase-function transport, not independent
   weather sprites. Polarization can initially remain latent output, but the
   optical ABI must preserve it.
9. Run static/unit/shader checks first, then one readiness-gated capture per
   physically legal context. Compare neutral Cs morphology before evaluating
   thin halo, nacreous colour, and NLC twilight radiometry.

## Production transport and reachability

Packed `ADD_UPPER_WAVE_SHEET` morphology records now reach the production
`upper_atmosphere_fragment_physical` pass. It intersects their curved altitude
shell and finite horizontal support, co-integrates local physical atmosphere,
and contributes an affine RGB packet to the same depth-sorting compositor as
tropospheric clouds and hydrometeors. The specialized entry retains no
36-owner private interval table and is compiler-isolated from the cloud
marchers.

- Production authoring exposes distinct legal IDs for PSC Type Ib STS,
  PSC Type Ia NAT, PSC Type II water ice, the visibly nacreous Type II display,
  and noctilucent cloud. The old `polar-stratospheric` ID remains only as a
  compatibility alias for STS and is no longer emitted by daily authoring.
- Runtime owner creation now consumes the deterministic topology variants.
  It places one finite, oriented tangent-shell wave packet at a physical
  altitude and range, derives its aspect and wavelength from the selected
  topology, and packs that state through the existing eight-scalar morphology
  record ABI. NLC uses a horizon-distance mesospheric support rather than a
  near-camera sheet.
- PSC Type I states share the current scalar/RGB nitric-acid/water transport
  profile, while CPU provenance distinguishes spherical STS from aspherical
  NAT. Type II and nacreous states use the water-ice profile; NLC uses its
  60–100 nm mesospheric ice response. This is an intentional current-ABI
  approximation, not a claim that their full scattering matrices are equal.
- Spectral Mueller/T-matrix tables and polarization transport are not yet in
  the shader ABI. Every upper record retains composition, particle-size range,
  topology ID, and a latent Stokes/Mueller basis so that adding those tables
  does not require collapsing or renaming the production weather states.
- Halo and iridescence qualifiers are CPU contracts only.
- No readiness-gated photograph has been rendered for this isolated work.

## Primary and original sources

- [WMO Cirrostratus definition](https://cloudatlas.wmo.int/en/cirrostratus-cs.html),
  [species](https://cloudatlas.wmo.int/en/species-cirrostratus-cs.html), and
  [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-cirrostratus.html).
- [WMO Cirrus radiatus](https://cloudatlas.wmo.int/en/varieties-cirrus-radiatus-ci-ra.html)
  and [classification history](https://cloudatlas.wmo.int/en/appendix-3-history-of-cloud-nomenclature.html).
- [WMO nacreous clouds](https://cloudatlas.wmo.int/nacreous-clouds.html).
- [CALIPSO PSC composition/depolarization observations](https://doi.org/10.1029/2007JD008616).
- [Measured mixed-PSC optical scattering model evaluation](https://doi.org/10.5194/amt-16-419-2023).
- [WMO noctilucent cloud constitution](https://cloudatlas.wmo.int/noctilucent-clouds.html),
  [observability/season](https://cloudatlas.wmo.int/en/explanatory-remarks-noctilucent-clouds.html),
  and [Type IV morphology](https://cloudatlas.wmo.int/noctilucent-clouds-type-IV-whirls.html).
- [AIM/CIPS measured polar-mesospheric-cloud phase functions](https://doi.org/10.1016/j.jastp.2008.09.039).

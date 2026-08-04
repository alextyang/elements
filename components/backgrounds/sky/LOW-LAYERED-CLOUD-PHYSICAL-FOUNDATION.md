# Low and layered cloud physical foundation

`low-layered-cloud-physical-foundation.ts` and
`low-layered-cloud-topology-qualification.ts` define a renderer-independent,
runtime-oriented contract for every WMO Stratocumulus and Stratus species and
for the distinct visual states of Nimbostratus. The production adapter and CPU
runtime now apply that contract to generated finite world domains, and the
atlas materializes distinct low-family macrogeometry. The shader ABI still
uses the existing owner extent rather than carrying every diagnostic field.

## Taxonomy and representation

Stratocumulus has five WMO species: stratiformis, lenticularis, castellanus,
floccus, and volutus. Stratus has nebulosus and fractus. Nimbostratus has no
species or varieties. The `nimbostratus`, `nimbostratus-virga`,
`nimbostratus-praecipitatio`, and `nimbostratus-pannus` IDs are render states
on orthogonal WMO axes: the genus, two supplementary features, and one
accessory cloud. They must not be presented as species.

Every state has three deterministic topology variants with explicit formation
mechanism, connectivity, physical size, origin, lifecycle, organization, and
silhouette cues. `selectLowLayeredCloudTopologyVariant()` is ready for scene
seeds. `qualifyLowLayeredVariantSet()` and `qualifyLowLayeredLayout()` reject
insufficiently distinct variants, repeated stamp clones, periodic owner grids,
and layered clouds assembled from repeated owner populations.

## Stratocumulus organization

Stratocumulus elements are larger than 5 degrees at view elevations above 30
degrees. This comparator applies to one rounded mass, flattened roll, turret,
tuft, lens constituent, or roll cross-section—not the entire weather system.
`qualifyStratocumulusProjection()` and
`stratocumulusFeasibleElementDiameterKm()` prevent a distant system from being
silently shrunk until it reads as Altocumulus.

Stratiformis is not one cloudlet stamp scattered many times. Its topology
contract separates:

- connected, radiatively driven closed-cell decks;
- drizzling open cells whose cloudy walls and cold-pool organization differ
  from closed cells;
- finite boundary-layer streets and broken decks with drifting wavelength.

The contract also includes actinoform/open-cell organization without making it
a WMO species. Formation boundaries belong to the simulated condensate support:
cellular cold-pool perimeters, entrainment-eroded humidity fields, finite wave
support, frontal humidity gradients, or terrain-coupled moisture boundaries.
A post-density alpha or whitening mask is expressly invalid.

## Immediate overcast versus a distant system

`qualifyLowLayeredSystemDomain()` makes camera placement mutually exclusive.
An immediate overcast has the camera inside the horizontal condensate domain
and must preserve overhead continuity. A distant system has the camera outside
the domain, retains a physically generated finite boundary, occupies a limited
sky fraction, and connects plausibly to the horizon or terrain. One state
cannot be both at once. Boundary transition thickness is also constrained
relative to system size so a hard mask and a global fade are both rejected.

## Phase, precipitation, and optics

`sampleLowLayeredLocalMicrophysics()` returns local, not owner-global,
condensate and optical inputs:

- liquid/ice fractions and effective radii;
- precipitation mass, melting, evaporation, and sublimation;
- normalized ice habit mixture and surface roughness;
- cloud-top longwave cooling and its displaced turbulence response;
- source-aligned extinction, droplet forward peak, and source-disc sharpness.

Ordinary Stratocumulus and Stratus remain liquid dominated. Ice becomes
important only in physically cold states, and fibrous Stratocumulus virga is
reserved for extreme cold. Nimbostratus has an ice-rich upper generating
region, aggregation through the fall region, a narrow melting transition when
present, and a lower liquid/rain region. It is opaque enough throughout to
conceal the source.

`LOW_LAYERED_OPTICAL_MATERIAL_CONTRACTS` requires source-aligned Beer
visibility, droplet HG+Draine or mixed droplet/rough-ice phase response,
higher-order multiple scattering, spectral source and view transmittance, and
ground-coupled lower-boundary light. Nimbostratus cannot show a halo, corona,
silver-lining cutout, or visible source disc. Thin Stratus and Stratocumulus
retain the rare WMO-allowed corona/irisation/ice-optics paths.

## Fractus and pannus ownership

Dry-weather Stratus fractus is a transition during formation or dissipation of
Stratus nebulosus. Wet-weather ragged clouds below Nimbostratus are pannus and
must have a precipitating parent. They share a visual vocabulary but not an
owner, lifecycle, or moisture source.

`qualifyUnderdeckOwnership()` prevents that alias. Pannus remains separate
world-space density below a parent shield, can merge upward explicitly, and
must be formed in precipitation-moistened turbulent air.
`samplePannusUnderdeckState()` models the observed non-monotonic response:
moderate precipitation moistens and merges fragments, while sufficiently
heavy precipitation sweeps particles out faster than they reform.

## Five-environment qualification

`LOW_LAYERED_ENVIRONMENT_CONTRACTS` requires every state to retain morphology
through the established day-oblique, golden-backlit telephoto, humid-nearby,
twilight-overhead, and moonlight views. It names evidence that must survive in
each view and forbids palette-only compensation, screen-space masking,
self-luminous night clouds, and painted bright rims.

## Integration status and remaining order

The following work is complete:

- all five Stratocumulus species plus both Stratus species are classified and
  have compositional recipes;
- low systems are allocated by species rather than a shared puff budget;
- production owners carry an exclusive immediate-overcast or distant-bank
  placement and a physical finite-boundary mechanism;
- runtime qualification projects the actual ellipsoidal world domains and
  rejects masks, owner clones, periodic arrangements, impossible horizon
  contact, and inconsistent camera containment;
- the atlas has regenerated finite St/Ns sheets, ragged St fractus, distinct
  Sc castellanus/lenticularis/volutus/floccus, and a source-connected,
  inversion-bounded Sc stratiformis deck. Its closed-cell wall network reaches
  one component without removing detached voxels and retains an empty atlas
  perimeter.

Remaining integration should proceed in this order:

1. **Nimbostratus scene state** — expose Ns virga/praecipitatio/pannus as orthogonal
   feature state. Drive legal changes with
   `isLegalLowLayeredRepresentationTransition()` and the external mother-cloud
   transition contract.
2. **Parent/underdeck graph** — pack Nimbostratus shield, precipitation, and
   pannus as related but separate owner domains. Pannus fragments sample
   parent precipitation/humidity and can merge upward; the parent never samples
   the pannus atlas as its own density.
3. **Local microphysics** — port
   `sampleLowLayeredLocalMicrophysics()` once to the CPU packer and once to
   WGSL. View and source transport must use identical local phase/size and the
   same melting level. Attach continuous precipitation to the parent optical
   path via `hydrometeor-system.ts`.
4. **Lighting** — feed these materials through source-aligned direct
   transmittance and the shared light-volume/multiple-scattering path. Use
   atmosphere-filtered Sun/Moon spectra and view airlight. Do not add a second
   heuristic ambient term.
5. **Rendered qualification** — only after a
   selected case reports rendered condensate and resolved light-volume
   readiness should the photo harness capture one of the five environments.
   Qualify morphology in neutral day first, then optical response across the
   remaining four.

## Remaining integration gaps

- The production scene does not yet expose all Ns orthogonal states.
- The renderer ABI does not yet carry normalized boundary distance, local
  melting level, or parent-underdeck ownership. Boundary mechanism and
  placement currently remain CPU metadata and qualification inputs.
- No WGSL port exists yet; the TypeScript sampler is the reference contract.
- Photograph-based acceptance has not been run for this isolated foundation;
  current acceptance is deterministic CPU topology/projection/optical legality.

## Primary sources

- [WMO Stratocumulus definition](https://cloudatlas.wmo.int/en/stratocumulus-sc.html),
  [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-stratocumulus.html),
  and the species pages linked by each descriptor.
- [WMO Stratus species](https://cloudatlas.wmo.int/species-stratus-st.html),
  [Stratus fractus](https://cloudatlas.wmo.int/en/species-stratus-fractus-st-fra.html),
  [physical constitution](https://cloudatlas.wmo.int/physical-constitution-stratus.html),
  and [formation from other clouds](https://cloudatlas.wmo.int/en/stratus-may-form.html).
- [WMO Nimbostratus definition](https://cloudatlas.wmo.int/nimbostratus-ns.html),
  [physical constitution](https://cloudatlas.wmo.int/en/physical-constitution-nimbostratus.html),
  and [features/accessory clouds](https://cloudatlas.wmo.int/supplementary-features-and-accessory-clouds-nimbostratus.html).
- Wang and Feingold, [LES of drizzle-driven open-cell formation](https://doi.org/10.1175/2009JAS3022.1).
- Zhou et al., [LES of cloud-radiative organization in closed cells](https://doi.org/10.1029/2018MS001448).
- [Aircraft/radar observations of structure and crystal growth in Nimbostratus](https://doi.org/10.1016/S0169-8095(01)00102-8).
- Schneider et al., [Real-time Volumetric Cloudscapes of Horizon Zero Dawn](https://advances.realtimerendering.com/s2015/The%20Real-time%20Volumetric%20Cloudscapes%20of%20Horizon%20-%20Zero%20Dawn%20-%20ARTR.pdf).
- Jendersie and d'Eon, [approximate Mie scattering for fog and cloud rendering](https://research.nvidia.com/labs/rtr/approximate-mie/).

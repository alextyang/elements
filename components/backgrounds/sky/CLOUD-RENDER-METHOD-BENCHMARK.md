# Cloud rendering method benchmark

The benchmark isolates rendering quality from cloud authoring quality. Every
candidate uses the same checksum-pinned `cumulus-congestus` OpenVDB, fixed
`oblique-natural` production camera, sun, physical sky, framing, resolution,
and exposure. The source is CC0 and is used only as a morphology truth object;
the production system must be able to generate equivalent connected density
fields from species parameters.

`cumulus-congestus` is the first benchmark because it exposes the common cloud
failure modes without hiding them behind a uniform layer: circular primitives,
radial screen patterns, smooth plastic boundaries, disconnected lobes, missing
interior transport, and denoiser-erased wisps are all visible in one frame.

## Compared methods

| Method | Representation | Transport | Purpose |
| --- | --- | --- | --- |
| Mesh isosurface | Density threshold surface | Surface PBR | Proves why opaque geometry cannot reproduce cloud depth |
| Eevee volume | Sparse VDB | Biased raster volume | Fast local preview baseline |
| Cycles HG | Sparse VDB | Unbiased null-scattering path trace | Common analytic phase baseline |
| Cycles Draine | Sparse VDB | Unbiased null-scattering path trace | Better angular cloud response baseline |
| Cycles Mie | Sparse VDB | Unbiased null-scattering path trace | Highest-fidelity built-in droplet phase candidate |
| Cycles Mie raw | Sparse VDB | Fixed-SPP path trace without denoising | Separates real density detail from denoiser structure |

The final client representation is not another morphology renderer. It is the
two-plane affine transport result of the winning offline renderer:

```text
live pixel = offline cloud radiance + cloud transmittance * live sky radiance
```

With the one production camera this retains the offline volume result exactly
while avoiding a client-side 3-D marcher. Ordinary RGBA, premultiplied sprites,
and screen-space procedural circles are excluded because they cannot preserve
colored transmittance or physically stable compositing.

## Acceptance

A method can win only if it preserves all five diagnostic features in the data
file, has no camera-radial or repeated-primitive organization, remains
relightable through explicit transport channels, and can render a connected
species group rather than one isolated blob. Sample count is allowed to grow
without a fixed ceiling. Visual acceptance is based on a contact sheet plus
per-candidate image metrics; numerical convergence alone is never sufficient.

The benchmark intentionally does not use generated images, neural appearance
models, neural denoisers, or image-to-volume reconstruction. They conflict with
the requirement for deterministic species control and auditable full-range
morphology.

## Research basis

- OpenVDB is designed for sparse, high-frequency volumetric data and records
  whether a grid is a fog volume.
- Blender Cycles uses unbiased null scattering for volume rendering; its render
  step rate can trade bias and detail independently of the density source.
- SideFX's production cloud workflow establishes a coherent volume first, then
  applies distinct billowy and wispy detail stages with surface-distance masks.
- NVIDIA's Mie study shows that a single Henyey-Greenstein phase can miss both
  brightness and apparent cloud detail relative to Mie or HG-Draine transport.
- The Disney cloud data set supplies a production-scale heterogeneous VDB and a
  Hyperion reference, demonstrating that sparse density plus multiple-scattering
  path tracing is capable of photographic cloud transport.

Primary sources:

- https://www.openvdb.org/documentation/doxygen/overview.html
- https://docs.blender.org/manual/en/latest/render/cycles/render_settings/volumes.html
- https://www.sidefx.com/docs/houdini/model/cloud.html
- https://www.sidefx.com/docs/houdini/nodes/sop/cloudbillowynoise.html
- https://www.sidefx.com/docs/houdini/nodes/sop/cloudwispynoise.html
- https://research.nvidia.com/labs/rtr/approximate-mie/
- https://disneyanimation.com/resources/clouds/

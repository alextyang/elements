# Continuous cloud VDB author

This tool is the density-authoring side of the offline cloud-plate pipeline. It
creates one sparse fog-volume field for a whole cloud formation. It does not
emit screen-space particles, camera-facing cards, or a collection of visible
sphere primitives.

The first implementation covers all ten WMO genera through three continuous
field families:

- convective envelopes for Cumulus and Cumulonimbus;
- finite, domain-warped stratiform fields for the layer genera;
- sheared fibrous and cellular fields for the upper genera.

Macrostructure is evaluated before scale-separated domain warp, erosion, and
edge detail. Convective fields use attenuated fBm plus domain-warped Worley F1
at two element sizes; ice outflow uses a separate anisotropic fibre field.
This follows the production ordering documented by SideFX: make a coherent
source volume, convert it to a fog VDB, then add multiple billowy and wispy
detail scales. A genus profile is only the authoring foundation; a plate
scene must still specify species, group continuity, phase, weather accessories,
lighting, and the fixed production camera.

Build on Apple Silicon with the Homebrew OpenVDB package:

```sh
cmake -S scripts/openvdb -B output/tools/cloud-vdb-author-build \
  -DCMAKE_BUILD_TYPE=Release
cmake --build output/tools/cloud-vdb-author-build --parallel
```

Generate a deterministic fog VDB:

```sh
output/tools/cloud-vdb-author-build/cloud-vdb-author \
  --genus cumulonimbus \
  --species cumulonimbus-capillatus-incus \
  --output output/cloud-plates/authored-vdb/cumulonimbus.vdb \
  --width 512 --depth 320 --height 288 \
  --voxel-size 0.04 --seed 42
```

`--evolution` accepts a normalized loop phase. It moves the sampling domain on
a closed path, so frame zero and frame one at an evolution value of `1` have
the same density field.

The author writes identifying OpenVDB metadata (`cloud:genus`, `cloud:seed`,
and `cloud:authoring`) and a grid named `density`. `vdb_print -m` can validate
the sparse bounds, fog-volume class, voxel size, and metadata without loading
the asset in Blender.

References:

- https://www.sidefx.com/docs/houdini/model/cloud.html
- https://www.sidefx.com/docs/houdini/nodes/sop/cloudbillowynoise.html
- https://www.sidefx.com/docs/houdini/nodes/sop/cloudwispynoise.html
- https://www.openvdb.org/documentation/doxygen/overview.html

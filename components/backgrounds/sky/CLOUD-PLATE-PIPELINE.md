# Cloud plate render pipeline

Production cloud playback uses one fixed `oblique-natural` camera. It does not
attempt to preserve arbitrary camera motion and it does not run the stochastic
volume marcher when a plate manifest is configured.

## Asset contract

Each frame is a scene-linear affine transport operator, not an ordinary RGBA
sprite:

```text
composited radiance = cloud radiance + cloud transmittance * live sky radiance
```

The two RGB fields are stored as little-endian RGBA16F planes. Radiance alpha
carries first interaction depth and transmittance alpha carries mean interaction
depth. Crossfades interpolate radiance linearly and transmittance in optical
depth, preventing the gray screen halos produced by alpha blending.

Every published file is SHA-256 verified. Manifests and their stable scene alias
are replaced atomically, so interrupted jobs expose only complete frames. The
renderer keeps the previous verified pair visible while the next pair streams.
A build with zero converged frames never writes the stable alias; the live scene
therefore cannot regress to an empty manifest during a long first-frame render.

## Meteorological scene model

A scene contains one or more cloud groups. Components such as a feeder tower,
deep convective core, incus, precipitation curtain, and pannus describe roles
inside a group; they are not independent sprites. Every component in a
continuous group shares one `continuityVolumeId` and is rendered into one
transport operator.

The first vertical slice is `data/cloud-plate-scenes/thunderstorm-mature.json`.
It uses one continuous deep-convective group. The production source is Walt
Disney Animation Studios' high-detail cloud density. Its `offlineComposition`
is data, not a renderer special case: checksum-pinned source identity,
overlapping volume transforms, per-instance scattering and bottom fades, slow
loop phases, bounded precipitation domain, and the explicit reference-light to
live-sky radiance calibration are all authored in the scene JSON. That same
contract is the extension point for other species and weather groups. The
calibration scales only the affine radiance source term; physical RGB
transmittance is unchanged. The outflow's lower density fades into the core, so
there is no floating slab boundary. The group is exported as one transport operator, never as
particles, spheres, screen-space noise, or camera-facing sprites.

The rain/hail core is a continuous, vertically correlated extinction volume
with tapered horizontal boundaries. It hangs beneath and overlaps the shared
storm mass; it is not assembled from cloud primitives or an alpha overlay.

## Local GPU worker

Bootstrap the checksum-pinned source volumes once:

```sh
npm run cloud:plates:bootstrap
```

The bootstrap verifies the five CC0 CGHEVEN component volumes and the WDAS
cloud archive. The WDAS download is 2.97 GB; eighth, quarter, and half grids are
staged under ignored `output/tools` storage. The pipeline selects eighth for
fast canaries, quarter for review renders, and half for production. The WDAS
asset is CC BY-SA 3.0 and its attribution and exact archive/grid checksums are
recorded in `data/cloud-plate-assets/wdas-cloud.json`.

Render all frames with:

```sh
npm run cloud:plates:render -- --scene thunderstorm-mature
```

Canary renders may select one frame and a smaller extent:

```sh
npm run cloud:plates:render -- --scene thunderstorm-mature \
  --frame 0 --samples 64 --width 320 --height 180 \
  --convergence-target 0.02
```

The target override is part of the content identity and is recorded in the
manifest; a draft cannot be resumed or mislabeled as the scene's stricter
production target.

The production scene launches Blender 5.2 Cycles headlessly on the Apple Metal
device. It starts at the requested sample count, renders a second frame at twice
that budget, and measures RMS across both RGB transport fields. If the measured
delta exceeds `convergenceTarget`, it doubles again. There is no real-time frame
budget or fixed quality ceiling. Stopping the process leaves a partial manifest;
rerunning verifies and resumes every already published frame.

Cycles adaptive sampling is disabled for convergence renders. Each side of the
pair therefore receives its exact samples-per-pixel budget; otherwise an
adaptive threshold near the acceptance residual can stop every doubled render
at the same noise floor and prevent genuine convergence.

The static radiance pass uses Open Image Denoise before transport export. This
removes low-frequency volumetric Monte Carlo crawl that becomes conspicuous
when a canary plate is enlarged, while the exact Cycles coverage channel is
still exported independently as RGB transmittance.

Production defaults to 1,024 total and volume bounces, matching the deep
multiple-scattering regime required by optically thick water clouds. For
anatomy-only canaries, `CLOUD_PLATE_VOLUME_BOUNCES=16` or `32` shortens feedback;
the effective value is included in the renderer hash and manifest so a shallow
path render cannot share production identity. Display-only preview PNGs use a
photographic shoulder; the radiance and transmittance planes remain scene
linear and ungraded.

Set `CLOUD_PLATE_BLENDER_PATH` when Blender is not installed at
`/Applications/Blender.app` or staged at `output/tools/Blender.app`. The legacy
native WebGPU exporter remains available to other scene definitions, but the
thunderstorm production scene does not use it.

The VDB manifests record archive and extracted-grid SHA-256 values plus license
provenance. Downloaded grids, archives, generated composites, and Blender live
under ignored `output/tools`; no third-party binary is committed to the
repository.

## Live composition

Set `SkyPreviewOptions.cloudPlateManifestUrl` to the stable scene manifest:

```text
/generated/cloud-plates/thunderstorm-mature/manifest.json
```

Playback validates the schema, one-camera contract, byte layout, dimensions,
and content hashes before allocating GPU textures. Only the current and next
frame pair is resident. The old 3-D cloud transport is suppressed as soon as a
plate manifest is requested, including while the first pair loads.

The current radiance plate is reference-lit but remains physically composable
with the live sky through RGB transmittance. A later relightable basis extension
can add direct-source and diffuse response planes without changing the affine
transport or scene-group contract.

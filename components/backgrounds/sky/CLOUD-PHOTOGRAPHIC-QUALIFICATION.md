# Cloud photographic qualification

This qualification layer turns the existing WMO photographic references and
weather-state matrices into a bounded evidence process. It does not declare a
cloud family photorealistic merely because the renderer produced pixels.

Authoritative taxonomy remains the WMO International Cloud Atlas:

- [Cloud classification summary](https://cloudatlas.wmo.int/cloud-classification-summary.html)
- [Associated cloud forms](https://cloudatlas.wmo.int/en/Associated-cloud-forms-table.html)

The machine contract is
[`data/cloud-photographic-qualification.json`](../../../data/cloud-photographic-qualification.json).
It defines 17 observable invariants, a 20-case compact core, strict capture
readiness, and the next six serial captures. The runtime audit in
[`cloud-photographic-qualification-matrix.ts`](./cloud-photographic-qualification-matrix.ts)
joins that contract to all 160 genus/species/environment cases, all 28
orthogonal morphology targets, and all 216 weather targets. Packed,
operator-active, and transport-attached targets all remain photographic gaps
until a current strict-ready render passes its reference-image invariants.

## Evidence policy

The compact core covers all ten WMO genera and deliberately crosses:

- five camera perspectives: horizon-wide, natural oblique, zenith-wide,
  distant telephoto, and near uplook;
- sparse, broken, extensive, and immediate-overcast coverage;
- front, side, back, diffuse, twilight, and moon illumination;
- incipient, growing, mature, precipitating, and decaying lifecycle states.

Those perspective labels remain catalogued evidence dimensions; they are not
independent cameras in the preview matrix. The shared static-preview catalogue
contains 276 identities: 32 canonical base forms, 28 orthogonal morphology
targets, and 216 weather targets. The background generator resolves every one
through the single production perspective recorded in the manifest (normally
`oblique-natural`). Camera elevation, field of view, observer altitude, range
treatment, and editorial regime therefore remain consistent across the grid.
Only target-relative lighting direction and meteorological state vary within a
generation revision.

The unlisted `/cloud-preview-matrix` page is a static-image-only evidence
browser. It never creates an iframe, canvas, cloud renderer, or GPU device and
has no start, pause, clear, or camera controls. Matrix scope, family, genus,
evidence, and status selectors filter already generated cards only; each uses
wrapping previous/next arrows for rapid review. Changing a selector cannot
start, stop, reorder, or truncate background generation.

Preview rendering is an external, strictly serial process. Run the persistent
watcher in a terminal:

```sh
npm run cloud:previews:watch
```

It begins or resumes the 276-image production queue, watches the renderer and
capture inputs used by the content hash, and coalesces edits. If those inputs
change during a run, it terminates the stale revision, waits for exact teardown,
then starts the new revision without overlapping generators. Completed PNGs are
content-hashed and committed by atomic rename; the manifest is also replaced
atomically after each completed image. The matrix can therefore poll partial
progress without observing a half-written image or manifest.

### Cloud-local PNG gate

For high-cloud public previews, the final beauty PNG is captured first and a
same-case, same-`oblique-natural`-camera `coverage` debug PNG is captured
second in the same persistent browser session. The renderer's exact `1 - T`
coverage output is used as a soft cloud-support matte, so the radial/fine-structure checks measure
cloud pixels and their immediate support instead of the clear-sky gradient.
Both captures use the per-view process-group deadline and readiness metrics;
the case, perspective, camera signature, viewport, and renderer revision must
match. The matte and readiness files remain private temporary work files and
are deleted after qualification. A failed pair never reaches the public image
rename or manifest publication. `Cs nebulosus` keeps its explicit smooth-veil
texture exception, while radial/smooth cloud-local structure still fails.

Serve the persistent read-only localhost lab separately:

```sh
npm run cloud:previews:serve
```

The command builds an isolated preview bundle and serves
`http://127.0.0.1:3000/cloud-preview-matrix`. Dynamic manifest and image routes
read newly committed files from disk, so the page updates without rebuilding or
performing live GPU work. The server command and watcher deliberately have
separate lifecycles and build directories.

Every case carries an expected occupied-sky range and invariant IDs for
formation support, scale hierarchy, topology, phase boundary, transport,
lighting, atmosphere, and weather interactions. A case passes only after its
render is compared to its direct WMO photograph and those invariants—not by
matching a generic “cloud-like” appearance.

## Serial review

Inspect the next queue without starting a renderer or writing an image:

```sh
npm run cloud:review:plan
```

With an Elements server already running, execute the queue serially:

```sh
npm run cloud:review:queue
```

The queue delegates each image to `review-cloud-render.sh`. That script removes
the stale target image, verifies current-case WebGPU evidence, requires a
complete finite light volume and the full 64-transport history horizon, then
requires at least 90% current history acceptance, 0.75 mean normalized stable
age, and 0.85 mean persistent confidence. Empty, failed, non-finite, or
under-resolved frames are rejected before a screenshot. A rejection ends the
queue; later images are not attempted.

The deliberately small next evidence set is:

1. Cu congestus transmittance correctness.
2. Cu congestus canonical daylight final color.
3. The same Cu under telephoto golden backlight.
4. Humid near-field Stratocumulus stratiformis.
5. Twilight Cirrus uncinus.
6. Moonlit precipitating Nimbostratus.

Once Cu passes the first two gates, only four new final-color images are needed
to expose the next broadest shared-system failures. Additional pictures should
be requested only when one of those four isolates a family-specific defect that
the compact core cannot distinguish.

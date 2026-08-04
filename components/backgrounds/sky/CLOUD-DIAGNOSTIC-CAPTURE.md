# Cloud diagnostic capture

`capture-cloud-diagnostics.mjs` captures named renderer debug views for one
cloud photograph case. It is an inspection interface for the renderer; it is
not a preview-generation or publication command.

The command owns (or attaches to) the same managed persistent browser session
used by cloud preview capture. It invokes the bounded capture primitive once
per view, in the requested order, and never runs two views concurrently. Each
view has its own process-group watchdog deadline. The capture primitive checks
the case, production perspective, debug view, readiness attributes, and
renderer viewport before it writes the PNG. It also writes the readiness and
renderer metrics into the per-view JSON record.

## Basic interface

From the `work/elements` project directory:

```sh
npm run cloud:diagnostics -- \
  --case ci-spissatus--day-oblique-natural \
  --output output/cloud-diagnostics
```

The equivalent direct command is:

```sh
node scripts/capture-cloud-diagnostics.mjs --case CASE [options]
```

Defaults are deliberately explicit and stable:

- production perspective: `oblique-natural`;
- renderer viewport: `800x500` CSS pixels (the captured device-pixel ratio is
  recorded in the metrics);
- transport/readiness horizon: `64` updates;
- per-view deadline: `180000` ms;
- capture mode: `native-metal`;
- views, in serial order: `final`, `lighting-direct-sun`,
  `lighting-exterior-diffuse`, `lighting-p1-cache`,
  `lighting-source-higher-order`, `lighting-atmosphere-composite`, and
  `history`.

Use `--views` with a comma-separated ordered list to select a subset. The
currently supported names are `final`, `coverage`, `density`,
`transmittance`, `depth`, `velocity`, `history`, `lighting`, `steps`,
`lighting-direct-sun`, `lighting-exterior-diffuse`, `lighting-p1-cache`,
`lighting-atmosphere-composite`, `lighting-source-higher-order`, and
`lighting-atmosphere-shadow-loss`.

`history` is the existing history view. There is no separate renderer
`no-history` debug view; requesting one fails validation. The atmosphere shadow
loss view is supported when it is useful for a follow-up investigation, but it
is not part of the default set.

## Output and immutability

The default output directory is `output/cloud-diagnostics`. The command
computes the local renderer content hash before starting and verifies that the
hash is unchanged before and after every view. The hash is part of every
filename:

```text
<safe-case>--<debug-view>--<renderer-hash-first-16>.png
<safe-case>--<debug-view>--<renderer-hash-first-16>.json
<safe-case>--<renderer-hash-first-16>.diagnostics.json
```

PNG, per-view JSON, and the final index are create-only files. Existing files
are never replaced. A failed later view can therefore leave earlier immutable
view records for inspection, but no final index is written unless the complete
ordered set succeeds. Failure transcripts are kept below the private
`.failures/` directory for the affected view.

The JSON records include the case, view, production perspective, renderer
revision, viewport, image SHA-256 and dimensions, readiness attributes, and an
explicit `publicManifestPublished: false` marker. This command does not read or
write the public preview manifest and does not add diagnostic files to it.

## Session attachment and revision limits

By default the command starts and stops
`manage-cloud-preview-capture-session.sh`, records the exact adapter/backend
evidence, and passes that evidence to each bounded capture. To use an already
managed session, pass `--session-state PATH`; the attached session is not
stopped by the command.

The default revision is the local `rendererContentHash` used by production
preview generation. `--renderer-revision HASH` can label a capture from an
externally managed server, but the local source hash checks still apply; use
it only when the server is known to be built from that exact renderer revision.
The capture command does not start a server, alter renderer optics, change
lighting/atlas/scene composition, or perform a native/GPU capture as part of
its installation or tests. Run an actual capture only when the server and
adapter are intentionally available.

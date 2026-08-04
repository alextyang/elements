# Static cloud preview matrix

`/cloud-preview-matrix` is a read-only browser for production cloud preview
images. Rendering never occurs in this page: it contains no renderer iframe,
canvas, WebGPU device, capture queue, or in-page start control. It polls an
atomic manifest and displays only completed, content-hashed PNG files.

## Catalogue and controls

The UI and background generator share `cloud-preview-catalog.ts`, which defines
276 stable preview identities:

- 32 canonical base cloud forms;
- 28 orthogonal varieties, supplementary features, upper-atmosphere states,
  and exterior systems;
- 216 weather qualification targets.

Every image in a manifest uses the same recorded production perspective. The
matrix does not offer camera variation because it must not imply that
ungenerated views exist. Matrix scope, family, genus, status, and evidence
selectors only filter static cards. Previous and next arrow buttons wrap around
every selector's available values.

## Local workflow

Start the persistent loopback-only viewer in one terminal:

```sh
npm run cloud:previews:serve
```

Open <http://127.0.0.1:3000/cloud-preview-matrix>. The command builds into the
dedicated `.next-cloud-preview-lab` directory. It does not start preview
generation, and it validates that the dynamic manifest and content-hashed image
APIs are present before reporting the lab ready.

Start or resume the persistent background generator once:

```sh
npm run cloud:previews:watch:start
```

The start command detaches safely, writes output to
`output/playwright/cloud-previews/watch-service.log`, and returns after the
watcher has published an ownership token. It immediately resumes the complete
276-case matrix, then starts a new content-hashed revision whenever rendering
inputs change. The preview page remains a static manifest reader throughout.
Use the explicit service controls at any time:

```sh
npm run cloud:previews:watch:status
npm run cloud:previews:watch:stop
npm run cloud:previews:watch:restart
```

Status reports both service activity and manifest completion. Stop signals only
the token-qualified watcher process group; the watcher first tears down its
exact active generator/browser group and escalates only within bounded grace
periods. A pid whose command, process group, state path, or ownership token does
not match is never signaled.

For an intentionally foreground watcher attached to the current terminal, use
`npm run cloud:previews:watch`. Foreground and detached watchers share a
singleton lock, so they cannot both coordinate the renderer queue.
Service startup also refuses to overlap an already active one-shot generator;
wait for that exact run to finish or stop it intentionally before starting the
persistent watcher.

The watcher runs one managed production generator at a time. Each renderer
revision owns one low-priority Playwright browser, one native Apple Metal
adapter preflight, and one mounted `/cloud-photographs` WebGPU canvas. The
serial generator switches the immutable scene through a capture-only bridge;
it does not reload the page or recreate the browser, adapter, device, shader
pipelines, or atlas for every card. Per-case readiness, diagnostics, screenshot
watchdogs, cooldown, atomic PNG processing, and manifest publication remain
independent. The session is closed by exact recorded session and daemon
identity when the revision completes or is superseded.

The watcher debounces
watched renderer changes, stops a stale run, waits for its process group to
close, and only then starts the updated revision. A delayed hard-kill bounds
unresponsive teardown and is canceled when the child closes. There is no
generator overlap and no GPU work in the matrix server. Its safe defaults lower
the complete build/capture process tree to OS priority 10, wait 30 seconds for
renderer edits to settle, and leave a 15-second idle cooldown between completed
captures. Pass `--priority`, `--debounce-ms`, or `--cooldown-ms` explicitly only
when a different tradeoff is intentional.
The service verifies the effective OS priority before it can publish readiness
or start a build; if niceness cannot be applied, startup fails without launching
the renderer.

Detached startup, every managed production build, manifest initialization, and
every serial browser capture require at least 2 GiB of free filesystem space.
The check is a metadata-only filesystem query; failure starts no build, server,
or browser. If service-state publication later fails (including `ENOSPC`), the
watcher logs the failure but retains the exact generator PID in memory, so its
signal and exit paths can still terminate that owned process group.

A five-second exact-content reconciliation pulse backs up recursive filesystem
notifications. This matters for atomic editor renames that macOS can omit: a
missed event can delay an update by at most one pulse plus the normal 30-second
settling window, never by the failed-revision retry interval.

If a run reaches the end with rejected cases, the watcher preserves every
completed current-hash image and resumes only the missing cases after 10
minutes. Repeated failures at the same renderer revision back off
exponentially—10, 20, 40 minutes, and so on—to a six-hour ceiling, so a
deterministic readiness failure cannot create a thermal retry loop. A real
renderer source edit supersedes that delay immediately; content-identical
filesystem events do not. Use `--retry-minutes` and `--retry-max-minutes` to
change those bounds.

For a one-shot run instead of persistent watching, use:

```sh
npm run cloud:previews:generate
```

Use `npm run cloud:previews:regenerate` only when every current entry must be
recaptured regardless of its content hash.

## Publication contract

The generator captures the catalogue serially at one production perspective.
It processes each screenshot into a temporary PNG, atomically renames that file
to its content-hashed final name, and only then atomically replaces
`public/generated/cloud-previews/manifest.json`. A manifest entry therefore
never points at a partial file. Current entries are resumable; renderer,
scenario, perspective, transport, or capture-backend changes produce new
scenario hashes rather than silently reusing incompatible images. The
manifest header also records `assetChecksums` (`algorithm`, `atlas`,
`majorants`, and `exteriorBoundary`) copied from
`public/assets/sky/cloud-macro-atlas-v2.json`. A manifest without that complete
identity is stale and cannot be used to resume entries; changing any cloud
volume, majorant, or exterior-boundary checksum invalidates every prior entry.
Final
filenames encode the SHA-256 digest of the processed PNG bytes themselves, so
a forced recapture with different pixels can never overwrite an already
cacheable immutable URL.

The matrix polls `/api/cloud-previews/manifest` without caching and proxies each
validated filename through `/api/cloud-previews/image/[filename]`. Manifest
responses are always live and image responses are immutable because filenames
encode their content revision. Pending catalogue identities remain lightweight
placeholders until the background command publishes them.

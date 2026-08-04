# Sky validation and performance gate

The completed delivery sequence and definition of done live in
`CLOUD-IMPLEMENTATION-PLAN.md`. This document specifies the repeatable
validation surface for the automatic production renderer.

Visual quality is evaluated against real photographs, not against another
renderer's screenshots. Existing curated data lives in `data/sky-benchmark.json`
and `data/moon-benchmark.json`; `/sky-photographs` and `/sky-benchmark` provide
the review surfaces.

## Photographic matrix

Every release-quality review should include:

- dawn, sunrise, clear day, haze, sunset, dusk, nautical twilight, dark night,
  moonlit night, and overcast states;
- clear sky and every WMO genus, plus plausible multi-layer combinations;
- 0–8 okta coverage, front/back/side lighting, low/high humidity and aerosol;
- new/crescent/quarter/gibbous/full Moon states above and near the horizon;
- dark rural and brighter urban limiting magnitudes;
- multiple aspect ratios and both physical and art-directed camera modes.

Photographic comparisons use one shared physical camera. When a case supplies
horizontal and vertical FOV, cloud perspective is `natural`; applying an
additional cloud-only wide or telephoto transform misregisters clouds from the
atmosphere and celestial field. The non-natural cloud perspective options are
diagnostic Sky Lab experiments only.

Reject a result for recognizable repeated noise, flat tint, hard altitude bands,
boiling, history trails, identical layer motion, implausible genus geometry,
unattenuated celestial objects, over-visible lunar dark side, halo stamps,
gradient stops, clipped twilight color, or night palettes too bright to reveal
astronomy.

The existing analyzer measures exposure offset, chromaticity, dynamic range,
dark-sky fraction, vertical tone profile, gradient curvature, and lunar halo
falloff. These measurements are guides: morphology and integration still need
side-by-side human review with provenance-safe reference photographs.

## Automated gates

Run:

```sh
npm run typecheck
npm test
npm run sky:validate-webgpu
npm run build
```

`npm test` checks CloudScene constraints, scheduling policy, generated-asset
invariants, and static render-graph contracts. `sky:validate-webgpu` is a
self-contained, bounded real-browser validation: it starts an ephemeral local
server, opens an isolated Playwright session, compiles all eight WGSL modules,
creates all thirteen pipeline variants, uploads the conservative weather
hierarchy, creates exact production bind groups, submits the interval →
lighting-cache → transport → persistent-temporal-composite graph, then closes
the browser and server on either success or failure. The page reports its
active GPU stage and the command fails on a bounded timeout rather than waiting
indefinitely. Use `node scripts/validate-webgpu-shaders.mjs --serve` only when
an explicitly persistent, manually inspected validator page is desired.
Full-page browser validation must additionally confirm:

- all WGSL modules report no compilation errors or warnings;
- WebGPU creates every render pipeline and completes frames without uncaptured
  validation errors;
- `auto` selects WebGPU, explicit WebGL2 remains diagnostic, and forced fallback
  reproduces the legacy hourly sky;
- pausing and hiding the tab stop frame scheduling, and resuming restarts it;
- changing genus, layer physics, time, debug mode, and quality does not recreate
  the GPU device or leak textures.

### Render-ready image reviews

Use `npm run cloud:review -- <case-id> <debug-view>` for human image review.
This is deliberately stricter than waiting for the page or canvas to exist. The
capture page is not ready until the currently selected case has a healthy WebGPU
history, has completed the 64-transport temporal horizon, its G-buffer reduction
reports both nonzero projected opacity and nonzero occupied sky, and the
reconstruction audit proves mature history: at least 90% current acceptance,
0.75 mean normalized stable age, and 0.85 persistent confidence.

The review harness writes no screenshot before that contract passes. A failed
renderer or a legitimately empty cloud result terminates with evidence and no
image, so reviewers cannot accidentally evaluate the clear placeholder frame,
an earlier selector case, or a numerically valid but under-resolved/ghosted
transport history. The readiness
attributes remain on `/cloud-photographs?capture=render` for other automation,
but screenshot tools should use this guarded path rather than their own delay.

The current source checkout may live on file-provider-backed storage with an
incompletely hydrated `node_modules`. For the production gate, use a clean
temporary checkout, `npm ci`, the bundled Codex Node runtime, and
`ELEMENTS_NEXT_DIST_DIR=.next-sky next build --turbopack`; do not interpret a
missing package inside a partially hydrated local install as a source failure.

The first historical full-page timestamp-query baseline at 1932×1087 output and 618×348
balanced cloud resolution measured roughly 0.07 ms interval, 0.39 ms lighting,
and 1.57–2.56 ms transport at 2 Hz checkerboard cadence. This identifies
transport as the optimization target but does not qualify the device. The same
run exposed a 3/8 fair-cumulus coverage failure. The diagnostic GPU reduction
now measures mean opacity, visible footprint, and interval acceptance; its first
recalibrated 0–8 sweep is recorded in `CLOUD-IMPLEMENTATION-PLAN.md`. Multiple
seeds, genera, aspect ratios, and elevations remain a release gate; screenshots
alone are not an adequate coverage test.

The historical clean empty-space A/B gate used the deterministic 3/8 fair-cumulus
scene at 1932×1087 with a 618×348 balanced cloud buffer, 18 view steps, 3 light
steps, 2 Hz cadence, and checkerboard transport:

| Traversal | Mean density evaluations | GPU p50 | GPU p95 | Mean opacity | Footprint |
| --- | ---: | ---: | ---: | ---: | ---: |
| Exact shell reference | 8.7 | 1.51 ms | 1.90 ms | 35.2% | 62.5% |
| Four-step conservative block bound | 7.9 | 2.49 ms | 3.08 ms | 33.4% | 60.5% |

The bound was rejected and removed: a roughly nine-percent evaluation saving
does not justify the additional weather/base hierarchy traffic or the measured
GPU regression. Future accelerators must beat the exact reference on both
evaluated work and p50/p95 while preserving opacity, footprint, and imagery.

A separate final exact-reference production reload exposed one 38.08 ms cold
sample (18.74 ms lighting and 19.33 ms transport). The following 30 seconds
recovered to 1.05 ms p50 and 2.16 ms p95 over six samples, with mean work near
eight density evaluations, but cadence correctly remained temporarily reduced
while recovering. This is a cold residency/first-use defect, not steady-state
cost, and it remains a release blocker: bounded step-count warm-up alone is not
enough. Qualification must prove that lighting and transport first use are
split or prewarmed without presenting a long contiguous GPU submission.

The renderer now performs that split. It clears new cloud history to a neutral
radiance/transmittance state, submits the exact interval and lighting-cache
passes, waits asynchronously for GPU completion, and starts transport on the
next animation frame. Cold lighting, conservative queue completion, and first
transport are reported independently. On the current adapter, five balanced
production reloads after the change measured:

| Signal | Observed range |
| --- | ---: |
| Isolated cold interval + lighting GPU | 0.39–5.90 ms |
| Conservative cold-submission queue completion | 9.10–28.20 ms |
| First balanced transport update | 1.31–2.10 ms |
| Balanced steady sample window | 1.84–3.54 ms p95 |

All balanced runs retained the requested 2 Hz cadence. A historical high-quality run at
2348×1321 output and 986×554 cloud resolution measured 3.41 ms isolated cold
lighting and 4.65 ms first transport, but later reached about 9 ms and invoked
cadence throttling. That adaptation remains intentional: spatial quality stays
fixed while only the background transport cadence yields.

## Performance budgets

Balanced quality is the shipping default. At a full-window desktop viewport:

- output resolution stays under the tier pixel budget;
- cloud transport is 48% linear resolution and 2 Hz before adaptation;
- high quality is 62% and 4 Hz; battery is 24% and 1 Hz;
- star scintillation never raises presentation above 6 Hz;
- spatial quality remains fixed when load adaptation lowers cadence;
- immutable cloud assets remain roughly 10 MB plus the LUT and bounded HDR
  render targets, including two full-resolution temporal-statistics targets;
- hidden tabs submit no frames.

Sky Lab displays hardware timestamp-query timing when available; otherwise it
shows conservative asynchronous queue-completion timing. The fallback never
blocks rendering on a GPU timing promise. If balanced cloud transport sustains
more than roughly 8 ms, cadence adapts downward. Device, asset, or validation
failure switches directly to the legacy sky; it never starts procedural asset
generation or a second expensive cloud path.

## Manual sign-off

Use a cool-start and a five-minute steady-state run. Inspect the battery/energy
panel, not only frame rate. Validate low-power and integrated GPUs, standard and
high-DPI displays, resize/orientation changes, device loss, reduced motion,
offline Moon-texture fallback, and long Sky Lab sessions. A visually excellent
frame that causes continuous maximum GPU duty is not a passing background.

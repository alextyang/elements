# Strict camera-transport execution contract

The production camera result is assembled from five independent packet draws:
three cloud layers, one hydrometeor pass, and one upper-atmosphere pass. The
fixed compositor reads the five complete packets only after all five draws.
The former three-layer fragment entry remains source material for shared WGSL
extraction, but no production pipeline compiles or dispatches it.

## Compiled per-pixel ceilings

- A legacy stratiform layer without a finite atlas owner evaluates exactly 12
  ordered Gauss-Legendre material and source nodes over its accepted interval.
  A finite atlas-owned stratiform layer uses the bounded owner-event march.
  This path preserves finite lateral support, physical step length, camera
  footprint filtering, and active-owner selection at grazing angles.
- The finite owner-event march has a 1,900-iteration ceiling. Ordinary
  non-finite layers retain the configured step count, capped at 144. Every
  finite endpoint scan considers at most 36 owners; each conservative owner
  support includes at most eight morphology records. An ordinary occupied
  stratum evaluates density and optical material at one jittered event. A
  finite Ci/Cc/Cs stratum instead evaluates two ordered positive GL2 events,
  each representing half of the parent segment, so unresolved ice is
  integrated with the current camera segment rather than a vertical owner
  proxy. Both event types use the bounded 36-owner atlas graph. The ordinary
  ceiling is therefore 72 owner visits and 576 morphology-record visits per
  parent stratum; the finite-high-ice ceiling is 144 owner visits and 1,152
  morphology-record visits before the bounded source-lighting closure.
- The hydrometeor packet has a 768-iteration event ceiling. Each endpoint scans
  at most 96 hydrometeor fields and eight blowing-media records. One accepted
  step plus its four optical-depth refinements can perform at most five local
  medium evaluations.
- The upper-atmosphere packet has a 512-iteration event ceiling. Each endpoint
  scans 36 upper-cloud owners (at most eight morphology records per owner) and
  four aurora curtains. One accepted step plus four refinements can perform at
  most five local medium evaluations.
- The compositor performs five packet loads and a fixed five-input ordering;
  it contains no density, material, quadrature, or weather march.

These are safety ceilings, not expected work. Finite support events, empty
intervals, transmittance termination, scene record counts, and conservative
majorants reject most candidates before their expensive material evaluation.

## Watchdog-safe strict qualification

Paused photographic qualification retains the selected production resolution,
quality profile, physical steps, camera ray, blue-noise rank, and 64-sample
history horizon. It divides every packet target into non-overlapping scissor
tiles. A strict queue submission shades at most 4,096 packet pixels in total,
even when that submission contains more than one tile draw. This is a
submission ceiling, not merely a per-draw ceiling: software WebGPU backends may
execute every command in one command buffer as one uninterrupted worker job.
After each nonterminal batch the renderer waits for
`queue.onSubmittedWorkDone()`, then yields through a zero-delay host timer before
encoding the next batch. No submission can inherit the complete production
target's physical-integration work.

One batch never crosses a packet boundary. The first batch for a packet clears
its private array layer; subsequent batches load it, and the deterministic tile
partition shades every target pixel exactly once. All five packet layers remain
private until the final tile of the fifth packet completes. Only that terminal
batch swaps the raw transport banks, invokes the compositor, advances temporal
history and `transportUpdates`, records the consumed light generation, and
presents the image. Neutral clear values and partially populated packets can
therefore never create rectangular grey or stale regions in an accepted frame.

A transaction freezes the packed camera/interval parameters and weather scene,
and identifies the exact structural scene, directional-visibility generation,
light-volume generation, target dimensions, and transport ordinal. Any identity
change cancels the transaction. Cancellation cannot expose mixed generations:
the raw-bank swap is still pending, and the replacement transaction clears each
private packet layer before writing it. The queue-completion continuation is
serial-guarded so a stale callback cannot resume or commit the cancelled work.

Live production keeps its ordinary five fullscreen draws in one submission.
Strict batching changes command granularity only; selected resolution, physical
quality, stochastic sample, and final pixels are unchanged.

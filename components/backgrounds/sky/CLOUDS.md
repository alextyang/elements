# Cloud rendering plan (revised)

This revises the proposed "WebGPU-first volumetric renderer" plan against the
code that actually exists. The original plan's licensing analysis and its
rejection of a Nubis³ voxel world are correct and retained. Its diagnosis of the
current renderer, its architecture choice, and roughly half its work breakdown
are not, and are replaced below.

## 1. Corrections to the plan's premise

The plan describes Elements as "a static WebGL atmosphere, a separate celestial
renderer, and blurred CSS cloud layers," and calls that separation "the main
realism ceiling." Four of its load-bearing claims are already false.

**Cloud transmittance composition already exists.** The plan presents
`final = cloudInscatter + cloudTransmittance × skyAndCelestialRadiance` as the
governing change, and argues that "ordinary opacity, screen blending and
separately colored cloud gradients cannot reproduce this." That composition is
already implemented in scene-linear space in
[atmosphere-canvas.tsx:472](components/backgrounds/sky/atmosphere-canvas.tsx:472):

```glsl
radiance = radiance * exp(-cloud_tau) + cloud_light * cloud_source;
radiance *= 1.0 - cloud_shadow;
```

Optical depth is per-genus (`cloud_tau_scale`), extinction is Beer–Lambert,
in-scatter is gated by solar availability and forward-scatter geometry, and
moonlight contributes through the same term. The CSS layers are not the cloud
model; they run at `--cloud-opacity: 0.04` / `--cloud-low-opacity: 0.02` as a
near-invisible motion garnish over a canvas that already did the physics.

**`cloudDensity` is not the cloud parameterization.** The plan proposes
replacing "the current scalar `cloudDensity`." The renderer already takes
`SkyCloudType` across seven genera, plus `cloudCoverage` and `cloudOpticalDepth`
as independent axes ([sky.tsx:60](components/backgrounds/sky/sky.tsx:60),
[sky.tsx:1477](components/backgrounds/sky/sky.tsx:1477)). The real gaps are
narrower: three missing genera (altocumulus, altostratus, nimbostratus), no
okta quantization, no multi-layer support, and no constrained transition graph.

**The photographic validation suite already exists.** The plan schedules it as
step 7, "build a reference matrix." Already built: `data/sky-benchmark.json`
(380 KB) and `data/moon-benchmark.json` (456 KB), the `/sky-photographs` and
`/sky-benchmark` routes, six curation scripts, a Playwright capture harness
(`scripts/render-sky-photographs.sh`), and a 332-line `sharp` analyzer scoring
exposure offset, chromaticity, dynamic range, dark-sky fraction, vertical tone
profile, gradient curvature, and halo falloff. Every case already carries both
`observed.cloudCoverage`/`cloudOpacity` and `renderer.cloudType`/`cloudCoverage`
/`cloudOpticalDepth`. This is the most valuable asset in the subsystem and it
should be the *gate mechanism from phase 1*, not a final step.

**There is no cloud animation to optimize.** `AtmosphereCanvas` has no
`requestAnimationFrame` loop; it redraws when `scene` changes, and `scene`
changes on a 60-second interval ([sky.tsx:1785](components/backgrounds/sky/sky.tsx:1785)).
The plan's performance chapter — "raymarch clouds at 12–20 Hz," "≤2 ms per cloud
update," 50–60% resolution, checkerboarding, STBN, velocity buffers,
neighborhood clamping — claims it "drastically lower[s] GPU duty cycle." It does
the opposite. It raises cloud work from ~0.017 Hz to 12–20 Hz, a four-order-of-
magnitude increase, and then spends most of its complexity budget mitigating a
cost it introduced. For a background behind a portfolio site, that trade is
backwards.

## 2. The actual defect, ranked

**#1 — Clouds are painted in screen space.** `cloud_field(uv, kind, coverage)`
([atmosphere-canvas.tsx:131](components/backgrounds/sky/atmosphere-canvas.tsx:131))
takes screen `uv` while the same shader has already computed a proper view
direction 130 lines later at
[atmosphere-canvas.tsx:268](components/backgrounds/sky/atmosphere-canvas.tsx:268).
Every other feature in the pass — Rayleigh phase, Earth shadow, Belt of Venus,
the lunar aureole — is solved against `view`. Clouds are the sole exception.

Consequences: clouds do not rotate with `viewAzimuth`, do not respond correctly
to `horizontalFov`/`cameraProjection`, do not converge or compress toward the
horizon, and cannot be advected in world space. Cumulonimbus is literally a
Gaussian in screen x ([atmosphere-canvas.tsx:180](components/backgrounds/sky/atmosphere-canvas.tsx:180)).
This one function is responsible for most of the perceived gap, it is fixable
in isolation, and the fix is independent of WebGPU, temporal reconstruction, and
the weather-state graph.

**#2 — Cloud lighting is a hardcoded grey.** `cloud_neutral` is a fixed
`vec3(0.58,0.64,0.71)`→`vec3(0.93,0.94,0.94)` blend
([atmosphere-canvas.tsx:464](components/backgrounds/sky/atmosphere-canvas.tsx:464)),
not transported sun/moon radiance. The plan's lighting section (§5) is right
about this and is retained.

**#3 — Single layer.** One `cloudType` at one implied altitude. No high-over-low
mixtures, which is what most real skies are.

**#4 — Sky Lab is behind the renderer.** It exposes only `cloudDensity`
([sky-lab.tsx:806](app/sky-lab/sky-lab.tsx:806)) although the renderer has
accepted genus, coverage, and optical depth for some time. Cheapest available
win: three controls, no renderer work.

**#5 — No evolution.** Cloud shape is frozen per scene update; the CSS layers
supply the only motion.

## 3. Architecture decisions that change

### WebGL2 stays primary. WebGPU is deferred, not "primary."

WebGPU's advantage is compute shaders and storage textures, which the original
plan needs for flow-map advection and sliced light-cache updates — both of which
exist only to serve the 12–20 Hz animation premise. Remove that premise and the
payoff largely disappears, while the costs stay: two shader languages held
visually identical, a forked capability path, and a 140-case Playwright
benchmark matrix that must now be captured and analyzed twice per change.

Revisit WebGPU only if a later phase demonstrates a specific effect that a
fragment-only WebGL2 path measurably cannot deliver.

### No temporal reconstruction. Static blue noise instead.

Boiling is caused by *stochastically re-jittering sample offsets every frame*,
not by a low update rate. STBN, history buffers, apparent-depth reprojection,
and neighborhood clamping are the standard fix for stochastic undersampling at
60 Hz. Elements does not undersample and does not need 60 Hz.

Use a raymarch offset drawn from a blue-noise pattern that is **fixed in
physical pixels** and constant in time. This removes the banding that uniform
stepping produces, adds no history, and cannot boil or ghost. It is the same
philosophy the existing dither already applies at
[atmosphere-canvas.tsx:604](components/backgrounds/sky/atmosphere-canvas.tsx:604)
("the pattern is fixed in physical pixels, so this static pass never shimmers").

This deletes the plan's entire "Temporal reconstruction" chapter, its
six-component per-pixel G-buffer, and the STBN dependency.

### Motion at 2–4 Hz into a cached low-resolution target.

Real cirrus takes minutes to visibly traverse. Render clouds into their own
half-resolution target at ~2–4 Hz when the document is visible; the composite
reuses that texture. Because the noise field is analytically advected in world
space and sampled deterministically, consecutive updates are already temporally
coherent — no reprojection required.

Gate on `prefers-reduced-motion`
([sky.module.css:680](components/backgrounds/sky/sky.module.css:680)) and on
`document.hidden`, reusing the pattern `CelestialCanvas` already uses to animate
only scintillating stars
([celestial-canvas.tsx:650](components/backgrounds/sky/celestial-canvas.tsx:650)).
Under reduced motion, fall back to the current one-shot behavior.

Revised budget: ≤3 ms per cloud update at 2–4 Hz — roughly 1–2% GPU duty cycle,
versus the original plan's 12–20 Hz target.

### Retained from the original plan

- Licensing conclusion: original implementation, Photon and DAV as visual and
  architectural reference only. DAV's archive is missing the `LICENSE.txt` its
  own headers require; Photon's terms do not clearly permit commercial web
  redistribution.
- Spherical 2.5D shells over a Nubis³ voxel world, for a fixed ground camera.
- Horizon Zero Dawn density structure: Perlin–Worley base volume, Worley
  erosion, weather map, height-profile curves per genus.
- The lighting list in §5 of the original plan.
- The WMO genus taxonomy as the classification authority.
- Sky Lab debug views and URL serialization.

## 4. Migration hazard the original plan misses

Benchmark cases in `data/sky-benchmark.json` encode a curated mapping from
observed sky conditions to `renderer.cloudType`, `cloudCoverage`, and
`cloudOpticalDepth`. Any reparameterization of the cloud state invalidates that
mapping and silently degrades the analyzer's output — the suite will keep
running and keep reporting numbers that no longer mean what they did.

Requirement: any change to the cloud parameter set ships with either a
compatibility shim from the old triple to the new state, or a re-curation pass,
plus a recorded pre-change analyzer baseline to diff against. Do this before
phase 2 touches the parameterization.

Secondary: `sky-palettes.ts` exposes `cloud` and `cloudWarm`, surfaced as
`--sky-cloud` / `--sky-cloud-warm` and consumed only by the CSS layers. When
those layers are retired, these keys must be repurposed as an art-direction
grade on the volumetric result or removed deliberately — not left dangling.

## 5. Revised sequence

Each phase is independently shippable and gated on the existing analyzer.

**Phase 0 — Baseline and Sky Lab parity.** Record an analyzer baseline across
the full 140-case matrix. Add genus, coverage, and optical-depth controls to
Sky Lab. No renderer change.
*Gate:* baseline archived; Sky Lab can reproduce any benchmark case's cloud state.

**Phase 1 — View-space cloud field.** Reparameterize `cloud_field` from screen
`uv` to the existing `view` direction, intersected against a spherical shell at
a genus-appropriate altitude. Keep the current composition, lighting, and genus
set unchanged.
*Gate:* no horizon stretching, no tiling; clouds track `viewAzimuth` and FOV;
analyzer shows no regression against the phase 0 baseline. This phase alone
should be visibly transformative.

**Phase 2 — Density representation.** Original Perlin–Worley base volume with
Worley erosion and per-genus height profiles, replacing the current 2D FBM.
Conservative density evaluated before detail and lighting; early-out near 1%
transmittance. Fixed-in-pixel blue-noise ray offset.
*Gate:* recognizable noise absent; step count within budget; benchmark parity.

**Phase 3 — Physical lighting.** Replace `cloud_neutral` with atmosphere-
transmitted sun and moon radiance. Add the multiple-scattering approximation,
sky ambient, ground bounce, and separate droplet/ice phase functions. Silver
lining and dark edges must emerge from optical depth, never from a bloom stamp.
*Gate:* sunset cloud color comes from incident light; celestial bodies extinguish
naturally through optical depth; analyzer chromaticity improves on cloud cases.

**Phase 4 — Layering and taxonomy.** Add altocumulus, altostratus, and
nimbostratus. Add independent low/middle/high layers with inter-layer shadowing.
Add okta quantization and the constrained transition graph (no cumulonimbus
without deep convection; no towered nimbostratus; ice scattering for cirrus).
*Gate:* every generated preset is meteorologically credible; invalid combinations
are disabled rather than rendered.

**Phase 5 — Evolution.** World-space advection with per-layer wind and shear,
curl deformation at edges, the 2–4 Hz cached-target update path, and the
reduced-motion and hidden-tab gates.
*Gate:* no boiling, no synchronized layer motion; measured duty cycle within
budget on integrated graphics.

**Phase 6 — Retire the CSS layers.** Remove `.cloudsHigh`, `.cloudsLow`, and
`.mistLayer`; resolve the `cloud`/`cloudWarm` palette keys. Ship behind a flag
and compare telemetry before removal.
*Gate:* full benchmark suite at or above the phase 0 baseline.

## 6. What this changes versus the original plan

| | Original | Revised |
|---|---|---|
| Primary backend | WebGPU, WebGL2 fallback | WebGL2; WebGPU deferred pending evidence |
| Cloud update rate | 12–20 Hz raymarch | 2–4 Hz into a cached low-res target |
| Temporal strategy | STBN + history + reprojection + clamping | Static blue-noise offset; no history |
| Per-pixel outputs | 6-component G-buffer | Radiance + transmittance |
| Composition work | "Introduce" transmittance compositing | Already exists; extend it |
| Cloud state | "Replace scalar `cloudDensity`" | Extend the existing genus/coverage/depth triple |
| Validation | Build a reference matrix at step 7 | Existing 140-case suite gates every phase |
| First visible win | After ~4 phases | Phase 1 — view-space reparameterization |

The largest single realism gain is phase 1, and it requires no new backend, no
new assets, and no animation loop.

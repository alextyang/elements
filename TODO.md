# Elements roadmap

## CLOUD-PHOTOREALISM — active objective

All cloud species must look photorealistic and integrate with the dynamic rich sky. One production camera, no generative AI cloud imagery, fully versioned changes. No species currently has verified photographic acceptance in this resumed run.

### Phase 1 — recover and establish rendered evidence

- [x] Reconcile branch `clouds/volumetric` and preserve the three existing local commits: `83ad8b0`, `a71f0c0`, `a771a30`.
- [x] Inspect the current WebGL entry point, morphology controls, and existing plate integration.
- [x] Collect the current regression results, including the prior Cc castellanus topology failure.
- [x] Open the cloud photograph flow with WebGL2 at the single production camera; inspect representative high, low, and storm clouds. Middle-cloud captures remain in Phase 3.
- [x] Establish an evidence ledger of visible defects and the actual active renderer.

### Phase 2 — repair cloud morphology and sky integration

- [ ] Repair visible field/reconstruction artifacts in the active WebGL path.
- [ ] Verify the 32 species recipes produce distinct, controllable characteristic anatomy across their useful parameter ranges.
- [ ] Verify complete storm and overcast groups, thin ice veils, fibres, broken decks, and small cloudlet populations.
- [ ] Verify direct sunlight/moonlight, ambient skylight, ground light, aerial perspective, extinction, and alpha compositing under the shared sky environment.
- [ ] Verify day, low sun, overcast, twilight, and night without changing the production camera.
- [ ] Confirm morphology/lighting controls have a visible effect and changes do not expose discontinuities or radial patterns.

### Phase 3 — integrated acceptance and delivery

- [ ] Capture and visually inspect all supported species in the production view; record acceptance per species below.
- [ ] Validate representative species during changes to lighting and weather.
- [ ] Finish meaningful renderer, plate, runtime, atlas, and TypeScript checks for the final candidate.
- [ ] Remove temporary diagnostics; run `git diff --check`; review the final changes.
- [ ] Commit coherent implementation/asset/documentation changes and push `clouds/volumetric` to GitHub.

## SPECIES-ACCEPTANCE

Statuses below are pending rendered verification; existing test passes do not mark them complete.

| Genus | Species awaiting acceptance |
| --- | --- |
| Cirrus | fibratus, uncinus, spissatus, castellanus, floccus |
| Cirrocumulus | stratiformis, lenticularis, castellanus, floccus |
| Cirrostratus | fibratus, nebulosus |
| Altocumulus | stratiformis, lenticularis, castellanus, floccus, volutus |
| Altostratus | opacus variety (this genus has no WMO species) |
| Nimbostratus | praecipitatio feature (this genus has no WMO species) |
| Stratocumulus | stratiformis, lenticularis, castellanus, floccus, volutus |
| Stratus | nebulosus, fractus |
| Cumulus | humilis, mediocris, congestus, fractus |
| Cumulonimbus | calvus, capillatus and incus/group variants |

## FLAT-SKY-PROJECTION — current user steering

The user reports radial/perspective distortion near the top and wants a flatter sky presentation, while retaining nearer/larger depth. Keep one production projection, not multiple optimized views.

1. [x] Audit actual default WebGL rays separately from fixed benchmark rays and match celestial projections. Old default was 241.2° wide and reached 91.8° elevation; identical benchmark camera numbers still differed by 10.54° at a top corner between angular WebGL and rectilinear WebGPU.
2. [x] Replace the panorama with one shared rectilinear production camera, preserving inverse-depth size and explicit diagnostic overrides. No postprocess warp or density change in this phase.
3. [x] Verify CPU inverse projection, actual extracted WebGL rays, Sun/Moon/star centers, inverse-depth sizing and absence of zenith folding; 42 focused tests and TypeScript pass. Moon sprite remains a circular approximation of an off-axis conic.
4. [x] Capture unchanged Cc species/light/scale after projection and inspect upper-frame geometry and near/far sizes. Native Metal frame `/tmp/elements-cloud-depth-b2sM2f/before.png` is complete, with zero console/page errors; camera signature `rectilinear-v1|55|27|64|43.52|0.02|natural|auto`. User confirms better perspective but rejects shallow tile-like morphology. This is not photographic acceptance.

## CLOUDLET-VOLUME — current user steering

The flatter camera exposes weak three-dimensional depth and a visibly textured/tiled underlying fill. Fix the material density, not the camera or grading. Cc is naturally thin and largely unshaded; Ac/Sc must demonstrate their stronger real depth without changing species identity.

**Resumed 2026-09-29 with unified-delegation.** The first density rewrite and its two bounded corrections failed visual gate R1. Curved height-varying support is verified, but Ac remains smooth/plastic and Cc printed/torn. Close the ray-integration evidence gap before selecting the next structural hypothesis, keeping physical view/light density, species identity, optical targets and the single production camera. New validation must be real end-to-end at browser/GPU edges, not new unit tests.

Measured benchmark packet/core depths: Cc 77/58.03 m, Ac 525/367.96 m, Sc 720/466.65 m. Cc's `coarse=0` disables both lower/top relief; remaining 3D density variation is at most 3.7152%. Repeated cellular frequencies reinforce the printed appearance, but an actual texture-wrap seam has not been established. Do not label this diagnosis a completed fix.

1. [x] Preserve a fixed-camera baseline and audit the active Cc/Ac/Sc field, noise frequencies, packet thickness and light paths.
2. [ ] Replace the planar threshold/extruded-cutout appearance with connected, height-varying condensate and rounded optical boundaries; remove visible repeated texture motifs.
3. [ ] Exercise physical scale, vertical-aspect sensitivity, open/closed-cell behavior, continuity and repeated-fill failure modes through real browser/GPU controls and completed captures; include negative controls and restore the baseline.
4. [ ] Compare native-GPU Cc and Ac/Sc images at unchanged camera/light; review genuine volume, depth overlap, soft edges and self-shadowing. Do not use false dark shading to make Cc appear more dimensional.
5. [ ] Validate integrated tests, record remaining visual gaps, commit and push the complete history.

## EVIDENCE-LOG

### 2026-09-29 — resumed cloud-volume outcome

1. [x] Recover clean checkpoint `b5b16711ef668c2b771c5b0674a15676bcab0b3e` and current user instructions. Prior `/tmp/elements-cloud-depth-b2sM2f/` images are no longer present; historical image claims are not fresh acceptance evidence.
2. [x] Obtain source-grounded cloud-volume outcome phases and a complete implementation contract through unified-delegation; one owner, an early real-GPU visual oracle, then coherent evidence batches. Design delivered; implementation and native acceptance remain open.
3. [ ] Implement and validate the Cc/Ac/Sc depth and pattern correction before expanding across remaining species families. Preserve differentiated anatomy and report remaining all-species gaps.
4. [ ] Review the actual integrated candidate and end-to-end evidence, update this roadmap, commit coherent changes and push the authorised branch history.

- Routing request `elements-cloud-depth-20260929-b5b1671-v1`: GPT-6 Pro, read-only diagnosis/design, inline output, attached committed sky source ZIP. Operational skill SHA-256 `fe682b5f18db71b050b5ef12359cf509e7cfffc82e34232ca00557ec5eebc996`. Initial preview rejected the temporary file location before enqueueing; identical source bytes were restaged inside the repository's Git metadata and preview retried. No submission or remote result is claimed yet.
- Accepted preview and submitted exact request: `program-80e694255e749f4f9fd7e7f413adbbca`, `turn-ea3ab2db26ad80b21f17d350ed258f5f`, queued at receipt, conversation not yet assigned. Request SHA-256 `0f76b0c193161abf3d13bc66f139f26aab4da46f75391094012ae57211103055`; immutable source ZIP SHA-256 `67967358ad05eced66f6b34d2eb9964a3ae6f4da33abb8e495f29c202d020090`. This is blocking design input; no speculative parallel implementation.
- Exact owner wait/reentry: `/Users/alexyang/Developer/genre-workspace/handoff-automation/.venv312/bin/python /Users/alexyang/.codex/skills/remote-delegation/scripts/desktop_wait.py run --thread-id "$CODEX_THREAD_ID" --program-id program-80e694255e749f4f9fd7e7f413adbbca` (working directory `/Users/alexyang`). Run the same command first on blank resumption, preserving the shared wait/cache budget.
- Updated authority: no new unit tests; required AGENTS/TODO only, no speculative documentation/compatibility/migrations/legacy maintenance absent deployed-production evidence. No credentials are involved or recorded in repository instructions.
- Remote design completed and delivered: conversation `6abb63d5-8120-83e8-959a-e4d2cf18ccdf`, answer SHA-256 `055ea31664fdd279bb0e878f1f95662b10d37c79bacf7ba755c1d52468cf5a7c`, canonical answer `/Users/alexyang/.codex/artifacts/remote-delegation/055ea31664fdd279bb0e878f1f95662b10d37c79bacf7ba755c1d52468cf5a7c/response.md`. Retained waiter result `/Users/alexyang/.codex/remote-delegation-waits/7dc9a2be4d158277b1180e0b3c9d637a723ba8ff12fab08f9759893a91e03c52.result.json`. No further remote wait is required for this completed request. Remote mathematical/source probes are not native-GPU evidence.

#### EXECUTION-20260929 — one implementation owner, sequential outcome gates

1. [~] **P0/T0: trustworthy real capture edge.** Bound branch/HEAD/source packet exactly at `clouds/volumetric` / `b5b16711ef668c2b771c5b0674a15676bcab0b3e` / `67967358ad05eced66f6b34d2eb9964a3ae6f4da33abb8e495f29c202d020090`; Apple M4 Max Metal 4 is present. Browser plugin is unavailable, so pinned `@playwright/cli` 0.1.21 and the repository native-Metal path are the recorded fallback. Fresh Cc/Ac baselines completed; Sc completed at the GPU edge but failed the unchanged artifact gate. The new capture-only float edge proves source-off, absent-cloud, exact restoration and spherical density slices without POST or live publication. Arbitrary ray-column convergence is explicitly rejected as `UNSUPPORTED_READBACK` and remains the P0 gap; no numerical-completeness claim is made.
2. [!] **P1/T1: cloud-volume oracle — R1 failed, parent decision required.** Implemented one CPU-resolved packet depth shared by density/bounds/extinction and a curved height-varying body. Initial candidate plus the two permitted causal corrections all completed on native Metal. Raw cuts prove genuinely changing vertical support, but final images remain unaccepted: Ac has broad plastic/smooth undersides with insufficient medium breakup; Cc remains a conspicuously printed/torn granular sheet. Do not expand P2. Retain the best coherent implementation and evidence for root review.
3. [ ] **P2/T2: three-species milestone.** After R1, finish useful control semantics and stable sampling phases; validate Sc, five lighting environments, declared seed variants and actual control/motion/restore effects. Root reviews R2. This does not accept other species.
4. [ ] **P3a/T3: seven ice recipes.** Source-connected fibres/hooks/fallstreaks and distinct veils; representative real oracle before expanding lighting cases.
5. [ ] **P3b/T4: five finite wave recipes.** Integrate finite lenses/rolls with stable world centres and useful controls; gate before family expansion.
6. [ ] **P3c/T5: six castellanus/floccus recipes.** Distinguish irregular towers on common bases from detached ragged tufts through real density, not stamps.
7. [ ] **P3d/T6: four sheet/fragment recipes.** Distinct As/Ns/St structures and real openings; precipitation is incomplete without a physical source-to-fall-field edge.
8. [ ] **P4/T7: seven convection/storm recipes.** Lifecycle, connected storm anatomy, world-owner overlap and mutual extinction; representative group oracle first.
9. [ ] **P5/T8: dynamic rich-sky closure.** Verify celestial occlusion, mixtures, live changes and cancellation/resize/visibility; reconcile 32 benchmark recipes × five environments. Captured frames are not automatically photographic acceptance.

The complete source-grounded contract is the retained answer above (C0–C7). One native Sol-medium owner executes coupled work, with root retaining visual acceptance and commit/push. No user-owned app task is authorised. Parent will not concurrently edit implementation files. Local preview-server start is a normal authorised development step, not permission to change production or remote-delegation services. Latest real-E2E-only user policy overrides the contract's suggestion to rerun the old unit/source suite. No speculative docs or legacy maintenance.

#### R1-20260929 — bounded oracle receipt

- Evidence root: `/tmp/elements-cloud-depth-r1-vx6WvO/`. Baseline Ac/Cc completed under shader `cc9bef70…61c4`; baseline Sc is preserved as an unchanged-qualifier rejection. Initial, correction-1 and correction-2 Ac/Cc images and per-frame metrics are separated by directory. Final shader identity is `532eb083…3dda` at the fixed `rectilinear-v1|55|27|64|43.52|0.02|natural|auto` camera.
- Durable unchanged copy: `/Users/alexyang/.codex/artifacts/cloud-depth-r1-a7a31e2/` (about 74 MB). Root verified final Ac/Cc SHA-256 identities against the original receipt; this retention does not change source or visual acceptance.
- Candidate-0 source-off radiance preserved depth while mean RGB fell from approximately `0.456/0.443/0.428` to `0.024/0.035/0.046`. Every absent-cloud transmittance pixel is exactly RGB `1` with depth `140 km`; before/restored planes are byte-identical in every candidate batch.
- Candidate-0 Ac density cuts: lower occupancy `69.83%`, mean `0.167`; middle `82.51%`, mean `0.633`; upper `0%`; vertical occupancy `29.16%`. Correction-1 only reduced occupancy and did not fix appearance. Correction-2 restored the population and extended subtractive boundary erosion; lower/middle/vertical occupancy is `69.51% / 82.29% / 28.84%`, but actual images still show little useful medium-scale breakup.
- Invalid `solarSourceScale=0.5` rejected with `INVALID_INPUT` before readback; the same Ac scene then completed again with no frame failure, proving queue/frame preservation. Diagnostics are capture-context gated and reject malformed modes, slice kinds, finite structure, and cloned scene shape before allocation.
- Static TypeScript, shell syntax, helper syntax and `git diff --check` pass. No unit/source suite was added or run. No commit, push, production publication or P2 expansion occurred. Remaining P0 numerical gap: independent ray columns/convergence and interval-budget telemetry.

#### R1-DIAG — parent decision after failed visual oracle

1. [x] Root inspected final Ac and Cc frames and confirms R1 failed. Independently checked candidate-0 absent components and byte-exact restoration. Correct GPU controls are accepted only as diagnostic evidence, not photorealism.
2. [x] Preserve this coherent experimental checkpoint in full branch history at `a7a31e2093fdbe6e0c8ef37e9b47b147ca31d179`; no production acceptance or deployment.
3. [x] Complete the capture-only ray-column/convergence and interval-budget edge against actual Ac production density/extinction. Final native-Metal shader `dab208db…e812` measured eight occupied/edge/clear view rays and four Sun rays with 256/512/1024 independent midpoint integrations. All rays except the intentionally opaque `T<0.005` core completed their material interval. Maximum `|T512-T1024|` is `2.9898e-4` for view rays and `1.4782e-4` for Sun rays. The opaque core stops after `921.089 m` of `1434.723 m`, leaving `513.633 m`; midpoint-budget `T=0.004930` versus reference `T=0.001875`, both optically opaque. The diagnostic production-budget column is an attributed copy of final-frame midpoint quadrature, not an in-pass beauty readback.
4. [x] Measure XZ density at 100 m increments from 4100–4800 m. Support exists from 4300–4600 m. Four-pixel block means represent `1562.5 m` medium-scale structure; adjacent-height Pearson correlation is `0.731`, `0.984`, `0.945` across 4300→4400→4500→4600 m. Raw correlation is `0.793`, `0.959`, `0.909`. Together with converged sampled mid/edge rays, this supports height-repeated density as the next causal hypothesis. Correlation alone does not prove the visual cause or rule out other transport defects; a controlled structural intervention and visual review are still required.
5. [~] R1-DIAG parent gate. Durable evidence: `/Users/alexyang/.codex/artifacts/cloud-r1-diag-a7a31e2-dab208db/`; manifest SHA-256 `601c2640dfa534aa53e8106eda1f33df23ff35d085323f183e9c4a5999e4a06a`. Attempt 1 is preserved separately because its interval telemetry over-counted half a midpoint step; final evidence corrects that attribution and records exact resolved world rays. Absent rays are zero-column/T=1/miss and representative restored records are byte-identical to live records. A zero-length ray is rejected as `INVALID_INPUT` before readback; frame ownership remains complete and the next valid ray reproduces the live record. Final frame is native Apple Metal, linked, GL0, no context loss, no console/page errors, fixed camera, image SHA-256 `d3b0b708…fe410`. TypeScript, shell/helper syntax, manifest verification, and `git diff --check` pass; no unit/source suite was added or run.
6. [ ] Parent chooses the next structural experiment before field tuning. Evidence-backed bounded hypothesis: Ac's height-invariant organization and parent cell coordinates extrude nearly the same medium-scale footprint, while 3D boundary noise only erodes it. Test one Ac-only coherent height-varying parent-support variant with current `1750 m` element scale, camera, packet depth, optics, and shared view/light density frozen; repeat identical slices/rays/beauty and require dimensional breakup without occupancy/column collapse. Broad foreground element scale is a separate later calibration axis and must not be mixed into this structural test. P2 remains blocked.

Reference limitation: the repository maps `cc-stratiformis` to filename `cirrocumulus-floccus-undulatus-with-virga-and-mamma` (WMO 4800); the primary WMO caption identifies Cirrocumulus floccus undulatus, not stratiformis. The Ac reference filename indicates castellanus/floccus metadata (WMO 4704), but its caption was not independently verified in this phase. Do not change references or tune stratiformis anatomy to these literal mismatches; raw GPU measurements remain valid.

#### R1-STRUCTURE — approved Ac-only intervention

1. [x] Root accepts the bounded R1-DIAG evidence and independently reproduced finite-ray output, absent-column values and both convergence maxima from saved binary readbacks. No general numerical or photographic acceptance follows.
2. [x] Implement one coherent height-varying medium-scale parent-support candidate for Ac only: one smooth phase moves the existing organization, primary and secondary parent coordinates through height. Cc/Sc retain phase zero. The `1750 m` scale, packet depth, optics, camera, default quality and shared view/light density remain unchanged. Remove the inactive `referenceSampleCount` request selector; evidence remains a fixed 256/512/1024 convergence triplet.
3. [x] Repeat the matched native-Metal beauty frame, eight height slices, 12 ray columns and absent/restoration controls under shader `a196d68f…7613`. Occupancy at 4300/4400/4500/4600 m changes from `69.51/84.91/82.29/72.24%` to `69.40/84.86/81.92/71.99%`; density means remain within 1.8%. Medium-scale adjacent correlation falls from `0.731/0.984/0.945` to `0.541/0.780/0.730` without slice coverage collapse. Fixed-ray reference columns redistribute strongly instead: view mean `120.83→268.99 m`, Sun mean `31.76→71.29 m`, and formerly clear rays become occupied. Absent records remain zero-column/T=1/miss; restored representative rays are byte-identical.
4. [!] Parent inspected the actual frame and rejects R1-STRUCTURE. Lower vertical correlation did not yield convincing photographic dimensional breakup: broad uniformly soft/plastic forms remain and the frame is more filled by overlapping opacity. No extra tuning or P2 expansion. Durable evidence: `/Users/alexyang/.codex/artifacts/cloud-r1-structure-3dc2889-a196d68f/`; manifest SHA-256 `f8b92d7aa3d4a659572f97c2ef3960856cd2c9f4c7f5b852421a3fc32df57a41`; image SHA-256 `abb3f39f…430f8`.
5. [ ] Obtain a revised consequential diagnosis grounded in the actual failed image and measurements before another implementation. Current bounded next hypothesis, not authorization to implement: freeze the new vertical topology and isolate Ac's broad `1750 m` foreground element scale using the existing near/far feature-scale alarm, without combining scale calibration with another support or erosion rewrite.

### 2026-09-20 — recovered WebGL integration and sampling investigation

- Resumed native GPT-6 Astra ultra only. The old TextEdit steering workflow remains permanently disabled.
- Preserved checkpoint `b7fb6da` and the previous three implementation commits; branch has not yet been pushed.
- Fresh TypeScript and 33 focused material/lighting/renderer/camera/readiness tests pass. These are structural checks, not photographic acceptance.
- Production camera is now enforced at azimuth 55°, elevation 27°, horizontal FOV 64°, vertical FOV 43.52°; navigation retains explicit WebGL selection.
- Native Apple M4 Max Metal evidence traces all seven initialization warnings to the celestial canvas: an optimized-out stellar attribute and Moon texture callbacks after StrictMode cleanup. Repaired lifecycle passes four behavioral tests; native completed-frame capture has zero console issues, zero page errors, and GL error 0. Evidence: `/tmp/elements-webgl-init-DhpEV8/`.
- Recovered seven-species Ci/Cs field module and seven numeric tests; GPU integration/visual review is in progress. These tests do not establish recognition or photorealism.
- Controlled Cb calvus captures at the same camera show that 768 view steps substantially reduce the fine horizontal bands and 1536 resolve the visible stripe defect without changing shape, light, or grading. Thin ice remains bounded at 384 because full storm sampling can produce missing raster tiles or stalls. Incomplete tiles also occurred in a heavier Cc field despite a completed GPU fence and GL error 0; bounded submission investigation is active. Evidence: `/tmp/elements-webgl-20260920-9NL15F/`.
- Shared atmospheric LUT transport and fixed-lighting plate tags are implemented. New baked plates need recapture for lighting changes; automatic recapture and independently relightable Sun/Moon response operators remain unfinished.
- Removed the layer-midpoint Sun/Moon switch: direct illumination is now transported and summed per sample, with diffuse illumination added only once. This preserves moonlit bases beneath a sunlit twilight crown. Lighting and renderer checks pass 21/21; final visual lighting acceptance remains open.
- Plate export now aborts pending uploads on disposal/context loss and rejects late continuations; five behavior tests pass. Camera-yaw and validator allocation checks use the existing 55-vector production ABI, unchanged by this work.
- Seven Ci/Cs fields are integrated and GPU-compiled. Compact Ci castellanus/floccus now cancel duplicated altitude shear and have finite population support: repeated full-sky radial grids are gone in actual v2 captures, but fibres, turret/base separation and some regular spacing remain unaccepted. Evidence: `/tmp/elements-compact-cirrus-cPeEll/`.
- Cc/Ac/Sc stratiformis use one shared condensation level and filtered cellular support instead of overlapping shredded elements. Added underside relief and an oblique 3-D noise slice; current Ac elements are too large/smooth and Cc still shows regular texture. The missing-tile investigation must finish before accepting the sampling path. Field checks pass 12/12 before the later compact-ice additions; latest ice tests pass 9/9.
- Browser interaction proof: changing day → golden-hour → humid → twilight → moonlight retains `rendererPreference=webgl2`, production azimuth 55°/elevation 27°/FOV64°, nonblank render, and no console warnings/errors. Golden-hour storm capture passes the artifact gate; twilight is rejected by the radial-artifact classifier and remains unqualified. No threshold was weakened.
- Commits: `48cfdd2` fixes celestial GPU lifecycle; `10c7d22` enforces one production camera and preserves benchmark navigation; `30dc76b` aligns validation buffers with the existing 55-vector ABI. Push remains pending integration.
- Broad regression: 956 tests, 939 pass, 17 fail. Three candidate-induced stale contract assertions were corrected; their 110-test rerun has 104 passes and six inherited failures. Reconciled remaining failures are 14, not a fresh whole-suite pass count. TypeScript passes. Exact evidence: `/tmp/elements-regression-TKQvD0/remaining-failures.md`.
- Fresh focused integrated check after compact-ice and lifecycle changes: TypeScript passes and 53/53 renderer/material/lighting/field/camera/readiness/lifecycle tests pass. This does not supersede the inherited failures or unresolved rendered defects.
- Latest uncinus refinement separates compact source heads from long fallstreak anisotropy; all nine ice-field tests pass. Actual GPU capture is pending the controlled submission investigation. All production shader edits and captures are paused during that comparison.
- Retained offscreen RGBA8 plus 128-pixel scissored tiles and per-tile fences still left an untouched canary rectangle on repeated native-GPU probes, with GL error 0. Readback is not a reliable cure. Do not ship that approach as a verified fix; smaller bounded submissions are being tested.
- Frozen-shader Chrome stderr confirms Metal command-buffer GPU hang/recovery errors despite an empty page console, live context, completed fence and GL error 0. Evidence: `/tmp/elements-webgl-submission-m4M1B5/geometry128.log`. This is a real submission failure, not just black cloud shading. Apple documents command-buffer termination when work exceeds the permitted execution time: https://developer.apple.com/documentation/metal/mtlcommandbuffererror-swift.struct/timeout.
- Plate/runtime/lighting/lifecycle rerun: 72/73 pass; the sole failure remains inherited Cc castellanus atlas turret-line anatomy. No test thresholds changed.
- Fresh full-suite rerun after the latest ice refinement and standalone wave tests: **968 tests, 954 pass, 14 fail**, zero skipped/cancelled, 50.79 seconds. All 14 match the inherited ledger below; this is a new measured total, not a reconciliation.
- Standalone finite lenticularis/volutus module and 10 numerical tests are complete for species 24/9/28/27/14, with one texture lookup and no population loops. It is deliberately not yet imported by production: placement, recipe-count calibration, GPU compilation and visual review remain pending. Only its documented nine controls are implemented.
- Full existing branch history pushed to GitHub through `11facb4`, including integrated-field checkpoint `77fbf09`, roadmap `d904efa` and the separate wave prototype. This is a progress checkpoint, not photographic acceptance. Subsequent batching/projection/safety edits require a new verified commit and push.
- Two frozen-source 16×16 actual-geometry submissions with presentation yields produced intact 800×500 Cc frames at 54.80/54.91 seconds; repeated readback has zero untouched canary or dark pixels and alpha 1 everywhere, with no Metal errors. Larger batches still fail. Production async lifecycle integration and same-source after-proof remain in progress.
- Projection audit measured a 10.54° top-corner ray discrepancy between current WebGL angular mapping and WebGPU rectilinear mapping despite identical camera numbers. The chosen fix shares rectilinear forward/inverse projection across the single production sky and celestial centers, preserving normal inverse-depth size while removing panoramic bending. Default WebGL's zenith crossing is at 1.298% of image height; remove that legacy path from production.
- Production bounded GPU submission now has an uninstrumented native-Metal after-proof (`/tmp/elements-webgl-submission-m4M1B5/after.png`): complete Cc image, no missing/dark raster tiles, zero console/page errors and the same shader hash as the frozen before image. Mean RGB8 difference from the intact before is 0.00558/255. Final lifecycle review passes 16/16, including queued and in-flight B→restored A, resize/readiness ownership and hidden-frame cancellation. No quality budget reduction.
- Shared rectilinear camera integration passes 42 focused tests, including actual GLSL ray evaluation. The first integrated native frame is `/tmp/elements-cloud-depth-b2sM2f/before.png`; shader hash `9573f9a2f55e9fd7a6563dcb69baf7cea5583a27289363569b9eaf8ebf7f08d3`. Projection improved; torn white flakes and planar texture remain unaccepted.
- New fixed-lighting WebGL plate manifests are rejected before plane loading by the physical WebGPU player, with old radiance/history cleared. Twelve lighting tests pass, including actual manifest-loader execution. Legacy untagged physical playback is preserved; calibrated or same-domain WebGL playback and automatic recapture are still open.
- Pause checkpoint: the Ac fixed-camera baseline `/tmp/elements-cloud-depth-b2sM2f/ac-before.png` also completes on native Metal with zero page/console errors and no missing raster tiles. Visual review confirms oversized, smooth, flat-bottomed cellular forms; no new cloudlet density edits were started. Cc/Ac shape, depth and pattern remain explicitly unaccepted.
- Fresh integrated full suite: **992 tests, 977 pass, 15 fail**, zero skipped/cancelled; TypeScript passes. Fourteen failures match the inherited ledger; the fifteenth was a stale source assertion requiring direct `current.*` camera fields instead of `resolveSkyCamera(current)`. Updated that contract without weakening ray/projection checks; final focused camera/rendering/lighting/lifecycle/readiness rerun is **54/54 passed**. This focused rerun is not represented as a new whole-suite result. Full logs: `/tmp/elements-integrated-regression-fWYMN7/`.
- Browser QA at pause: repository Playwright native-Metal fallback (Browser plugin unavailable), `http://127.0.0.1:3000/cloud-photographs`, 800×500. Cc and Ac routes have correct identity, meaningful complete frames, no framework overlay, no console/page errors, and the same production camera. No new interactive morphology controls or mobile viewport were tested in this checkpoint; earlier environment-navigation evidence remains separate.
- Implementation checkpoint `ec19337` records bounded frame publication, shared flat-sky projection, physical plate-domain rejection and their regressions. Root `AGENTS.md` and this roadmap preserve the user-requested stopping point; resume with CLOUDLET-VOLUME, not more camera tuning. No species is newly photographically accepted.

#### CONTROL-COVERAGE — verified code gaps, not accepted capabilities

All 16 morphology fields pack into WebGL, but packing alone does not mean the active species branch consumes them.

1. [ ] Add finite lenticularis/volutus anatomy with meaningful aspect, crest count and wave controls. Current cosine bands ignore aspect/count and use amplitude as frequency/phase. A standalone five-species field and numeric tests are being developed without changing the active shader during GPU diagnosis.
2. [ ] Make explicit Cb species respond to growing/mature/dissipating lifecycle; the current early explicit-species route bypasses it. Preserve coherent parent/daughter storm structure.
3. [ ] Add bounded below-base precipitation volumes/groups. Current precipitation mainly darkens cloud undersides and is not a rain-shaft implementation.
4. [ ] Connect independent authored world systems/manifolds to WebGL. Current packing still uses three layer slots and ignores authored same-tier owners.
5. [ ] Wire or explicitly mark unsupported shape controls by species. Generic castellanus/floccus, sheets, fractus, Cu humilis/mediocris and congestus ignore vertical aspect. Storm macro count/lineage currently change noise rather than true owner count/hierarchy.
6. [ ] Add per-species control sensitivity evidence, including useful extremes and saturation. Cloudlet closure above −0.05, anisotropy below 1, storm counts above 32 and lineage above 9 currently have dead ranges. Do not add UI promises beyond verified support.

Numeric/source tests establish control wiring and bounds only; inspect actual fixed-camera renders before recognizing anatomy or accepting realism.

#### PLATE-RADIOMETRY — integration blocker

1. [x] Refuse the new fixed-lighting WebGL response convention in the physical WebGPU compositor until same-domain playback or a physically calibrated export exists. The compatibility WebGL full-Moon source is 0.95, versus physical lunar irradiance around 7.68e-6; physical night adaptation can therefore clip captured compatibility-domain cloud radiance to white. A single scalar cannot independently correct already-combined Sun, Moon and palette ambient terms. Legacy playback contracts are preserved separately; actual loader rejection and old-history clearing are tested.
2. [ ] Store a deterministic captured-lighting/medium fingerprint and reject stale fixed-lighting frames when lighting changes. Current URL-only playback invalidation can retain daylight clouds at night even if radiometry is addressed.
3. [ ] Implement same-domain WebGL plate compositing or source-separated physically calibrated transport, then test day→twilight→night against the live renderer.
4. [ ] Wire bounded local recapture and atomic completed-frame publication for changed lighting/medium; retain only frames whose compatibility is established. Do not silently relight baked response bases.

#### REGRESSION-DEBT — inherited gates, not waived

- Five atlas gates: Cs coarse reconstruction mass retention 0.739 vs 0.96; Cc castellanus coarse peak count; missing Cs surface-mode metadata; Cc resolved turret line; Cs fibratus gain 1.30145 vs 1.30.
- One persisted preview manifest identity mismatch against current public atlas/majorant/exterior-boundary assets.
- Eight inherited WebGPU source contracts: local stratiform extinction call form; source path partition; diffuse cache call form; P1 capture parameter call; light-volume generation publication call; older 54-vector grade assertion; Cs stochastic strata step form; inversion-deck formation guard form.
- Do not change these thresholds or relabel photographic acceptance to make the candidate pass. Separate stale source assertions from physical/asset failures when resolving them.

#### Next steps from this checkpoint

1. Resume CLOUDLET-VOLUME: replace the cutout/slab density with rounded, height-varying condensate; compare Cc and Ac/Sc against the fixed-camera baselines. Keep verified bounded GPU submission and frame ownership unchanged.
2. Refine Ci hooks/fibres/common bases after the repeated-pattern fixes; distinguish Cs fibratus from nebulosus in actual frames.
3. Correct Ac/Sc cellular scale and relief, then review every remaining species in the same camera.
4. Verify dynamic day/twilight/night lighting, complete group scenes, and control ranges with actual GPU images.
5. Run final renderer/plate/runtime/atlas tests, record unresolved gates without weakening them, commit coherent changes, and push the full branch history.

### 2026-09-07 — resumed integration phase

- Branch is ahead of origin by three commits. Dirty changes cover high-cloud world placement, Cc stratiformis benchmark depth, atlas generation and assets, plus temporary Cc castellanus test diagnostics.
- The previous production projection found an 87-pixel main Cc castellanus component and one isolated threshold pixel; anti-oval score was 0.370 against a required value above 0.50. A subsequent authored-spur change was started; its result must be verified.
- No atlas generator or Next.js server was running at recovery.
- Browser access previously failed under the old in-app browser URL policy. Check the current supported browser route before attempting visual acceptance; do not bypass access controls.
- Local regression evidence is delegated to `cloud_regression_evidence`, GPT-5.6 Sol high, read-only prescribed tests. Root owns all edits and rendered validation.
- Remote-delegation routing assessed: immediate reproduction and interactive visual debugging stay local; a portable unresolved rendering question may be delegated after primary evidence is captured.
- Remote preview returned operator-disabled intake; no remote job was submitted. Work continues locally.
- Browser access now works through the supported in-app browser. The fixed production viewport is 800×500; `rendererPreference=webgl2` explicitly selects and verifies WebGL2.
- Baseline tests: TypeScript passes; 140 of 142 focused renderer/plate/scene/runtime/atlas tests pass. Remaining failures: Cc castellanus resolved turret line and Cs fibratus legacy source/raw gain 1.30145 versus maximum 1.30. Neither threshold has been weakened.
- Actual WebGL baseline: Cu humilis is smooth/dark, Ci fibratus nearly invisible, Cc stratiformis is a broad sheet instead of cloudlets, and Cb calvus fills the frame with a soft storm slab. None is photographically accepted.
- Candidate fixes in progress: explicit texture LOD inside divergent ray loops; separate ice/sheet altitude shaping; shallow cloudlet material support; corrected Worley erosion polarity; bounded multiple-scattering orders. These improve visibility but exposed vertically repeated billows and excessive coverage; candidate remains unaccepted.
- Sol high helper implemented preservation of renderer/plate/time URL parameters during benchmark navigation and authoritative world-space Sun/Moon directions in the WebGL atmosphere. TypeScript passes; final browser interaction and regression review remain.
- User subsequently changed routing to native GPT-6 Astra ultra only; no further skill-based local/remote delegation. Native workers own the storm field and atmospheric source integration; root owns shader morphology and visual acceptance.
- Fixed duplicate vertical noise compression: the visible stacked-pancake bands in Cu humilis disappeared in the actual WebGL frame. Overall cloud population and fine surface detail remain unaccepted.
- Ci fibratus now shows finite translucent curved fibre patches instead of an opaque repeating ribbon sheet. Cc stratiformis now uses material-bounded view/light sampling and explicit closed-cell organization; its texture repetition and optical-depth calibration are still being checked.
- Added a finite continuous storm field with separate calvus, capillatus and incus anatomy. GPU validation and photographic review remain pending.
- Atmospheric source LUT integration uses the same physical medium as the sky and sample-local spherical Earth visibility. Preserve old plate response conventions: new atmosphere-baked captures must be explicitly tagged and must not be relit using incompatible legacy source coefficients.

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

**Paused at the user's request.** No density rewrite has started. Next implementation should replace `webgl-cloudlet-field.ts`'s altitude-independent cellular mask multiplied by a slab with a continuous condensation density field: vary the threshold through packet height, contract cross-sections toward both faces and add modest 3D boundary variation. Keep the shared physical density on view/light paths, existing optical targets and single production camera. Add nested-cross-section and curved-underside tests alongside existing bounds/scale checks.

Measured benchmark packet/core depths: Cc 77/58.03 m, Ac 525/367.96 m, Sc 720/466.65 m. Cc's `coarse=0` disables both lower/top relief; remaining 3D density variation is at most 3.7152%. Repeated cellular frequencies reinforce the printed appearance, but an actual texture-wrap seam has not been established. Do not label this diagnosis a completed fix.

1. [x] Preserve a fixed-camera baseline and audit the active Cc/Ac/Sc field, noise frequencies, packet thickness and light paths.
2. [ ] Replace the planar threshold/extruded-cutout appearance with connected, height-varying condensate and rounded optical boundaries; remove visible repeated texture motifs.
3. [ ] Verify physical scale, vertical-aspect sensitivity, open/closed-cell behavior, continuity, material bounds and absence of repeating horizontal fill numerically.
4. [ ] Compare native-GPU Cc and Ac/Sc images at unchanged camera/light; review genuine volume, depth overlap, soft edges and self-shadowing. Do not use false dark shading to make Cc appear more dimensional.
5. [ ] Validate integrated tests, record remaining visual gaps, commit and push the complete history.

## EVIDENCE-LOG

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

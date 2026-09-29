# Elements

## Project summary and quickstart

Elements is a Next.js 15 / React 19 application with a dynamic astronomical sky and meteorological cloud renderer. Run `npm install` when dependencies are missing, then `npm run dev -- --hostname 127.0.0.1 --port 3000`. `/sky-lab` exposes the environment controls; `/cloud-photographs` provides cloud reference comparisons; `/cloud-preview-matrix` shows the capture catalogue.

Use `npm run typecheck` for static TypeScript validation. Validate renderer changes at the real browser/GPU edge with `scripts/capture-cloud-preview.sh`, using native-Metal WebGL2, the fixed production camera, and actual completed frames. Rebuild authored volume assets with `npm run sky:cloud-atlas` only when the atlas generator changes.

## Goals and non-goals

- Make all supported cloud species recognisable and photorealistic in the dynamic sky, with controllable morphology, optical properties, weather groups, and lighting.
- Continue the WebGL volume-rendering direction. Support slowly streamed, transparent local-GPU cloud plates composited into the live sky.
- Use one production camera. Additional diagnostic views must not become production camera requirements.
- The shared production projection is rectilinear (55° heading, 27° elevation, 64° × 43.52° FOV). CPU celestial projection and GPU rays must agree; never restore the default 241.2° panorama or zenith folding.
- Preserve continuous storm groups and physical scale; avoid repeated circles, screen-radial patterns, disconnected blob stamps, and affine cloud cards.
- Judge dimensionality from actual density, self-shadowing and soft optical boundaries, not decorative texture or stronger contrast. Preserve each species' real anatomy: thin Cc must not become deep cumulus just to exaggerate depth.
- Do not use generative AI images for clouds, change photographic reference images, or change exposure/grading to conceal morphology problems.
- Structural tests are necessary evidence, not proof of photorealism. Require rendered visual review and dynamic-lighting checks.
- A packed morphology parameter is not a supported control until its active species field consumes it and sensitivity is verified. Keep control/lifecycle/group limitations explicit in the roadmap.

## Rules

- Maintain this file and `TODO.md` at large phase boundaries and before the end of a turn. Store plans, remaining work, and verification in the roadmap.
- Do not add unit tests. Exercise changed modules through real end-to-end tests at their actual boundaries, including rendered effects, negative controls and restoration where applicable.
- No deployed-production state is established for this development branch. Beyond these required root instruction/roadmap files, do not add documentation, compatibility layers, migration options or legacy maintenance without an actual deployed-production requirement. This is not permission to delete unrelated existing work.
- Preserve existing user changes. Keep coherent commits and push the authorised branch with the full history; do not rewrite history.
- Keep generator source, binary assets, and manifest consistent. Do not relax qualification thresholds just to pass a candidate.
- Keep temporary captures and diagnostic outputs outside committed source. Remove temporary test instrumentation before committing.
- GPU fences and GL error 0 are not sufficient completeness evidence: verify the actual final frame, especially after heavy cloud draws. Keep shader versions fixed during controlled GPU comparisons.
- The 2026-09-29 Ac/Cc body experiment failed visual gate R1 despite correct negative controls and restoration. Do not expand cloud families or equate curved density support with realism. Close the ray-integration evidence gap before the next structural hypothesis.
- R1-DIAG verifies convergence for the sampled Ac rays, while 1.56 km-scale density remains strongly correlated through the occupied height band. This supports, but does not prove, the parent-support hypothesis. Root authorizes one Ac-only height-varying parent-support experiment before P2. Keep the current 1750 m element scale fixed; element-scale calibration is a separate causal axis.
- Current user routing is `unified-delegation` (2026-09-29), replacing the prior native-Astra-only choice. Follow its current routing and ownership rules; the primary task retains integration and real visual acceptance. Do not create user-owned app tasks without explicit authorization.
- The obsolete TextEdit/continuous-execution hook workflow is permanently disabled. Do not open steering files, poll for text-file answers, or recreate that workflow; communicate in the conversation and end completed turns normally.

## Intended architecture

`Sky` assembles astronomy, atmospheric composition, weather, and a `CloudScene`. The scene's species recipes and morphology/optics controls drive the WebGL cloud shader through `AtmosphereCanvas`. Finite world-space density fields provide the cloud shapes; radiative transport produces cloud radiance and transmittance for compositing with the sky. The WebGPU renderer and atlas path exist in the repository; do not expand compatibility work on those paths without a current requirement.

The capture page alone may expose capture-only cloud evidence readback. It is scene/frame/shader owned, validates requests before allocation, and can sample arbitrary resolved world rays through the same production density/extinction field. Ray records distinguish the final-frame midpoint production budget from independent 256/512/1024 integrations and report actual material-interval coverage. This is diagnostic architecture, not a production rendering API or visual acceptance shortcut.

The plate pipeline exports linear radiance/transmittance and optional direct, sky, and ground response bases. Legacy compatible bases support live source coefficients. New atmosphere-baked WebGL plates are explicitly fixed-lighting and require recapture for changed lighting. Their diagnostic bases must not be treated as arbitrary Sun/Moon relighting operators. Their compatibility-domain radiance must not enter the physical WebGPU compositor without an established radiometric/foreground-air conversion; this integration remains blocked, as recorded in `TODO.md`. Live WebGL uses the current sky's physical atmospheric medium at cloud sample positions. Reference photographs and production-frame captures form the visual acceptance evidence.

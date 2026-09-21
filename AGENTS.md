# Elements

## Project summary and quickstart

Elements is a Next.js 15 / React 19 application with a dynamic astronomical sky and meteorological cloud renderer. Run `npm install` when dependencies are missing, then `npm run dev -- --hostname 127.0.0.1 --port 3000`. `/sky-lab` exposes the environment controls; `/cloud-photographs` provides cloud reference comparisons; `/cloud-preview-matrix` shows the capture catalogue.

Use `npm run typecheck` for TypeScript validation. Focused renderer checks are `node --test scripts/test-webgl-cloud-renderer.mjs scripts/test-cloud-plate-pipeline.mjs scripts/test-cloud-system-runtime.mjs`. Rebuild authored volume assets with `npm run sky:cloud-atlas` only when the atlas generator changes.

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
- Preserve existing user changes. Keep coherent commits and push the authorised branch with the full history; do not rewrite history.
- Keep generator source, binary assets, and manifest consistent. Do not relax qualification thresholds just to pass a candidate.
- Keep temporary captures and diagnostic outputs outside committed source. Remove temporary test instrumentation before committing.
- GPU fences and GL error 0 are not sufficient completeness evidence: verify the actual final frame, especially after heavy cloud draws. Keep shader versions fixed during controlled GPU comparisons.
- Current user routing is native GPT-6 Astra ultra orchestration only. Do not use the local-orchestration or remote-delegation skills, or sol-advisor. The primary task owns integration and visual acceptance.
- The obsolete TextEdit/continuous-execution hook workflow is permanently disabled. Do not open steering files, poll for text-file answers, or recreate that workflow; communicate in the conversation and end completed turns normally.

## Intended architecture

`Sky` assembles astronomy, atmospheric composition, weather, and a `CloudScene`. The scene's species recipes and morphology/optics controls drive the WebGL cloud shader through `AtmosphereCanvas`. Finite world-space density fields provide the cloud shapes; radiative transport produces cloud radiance and transmittance for compositing with the sky. The WebGPU renderer and atlas path remain existing integration surfaces whose contracts must be preserved while the requested WebGL path is developed.

The plate pipeline exports linear radiance/transmittance and optional direct, sky, and ground response bases. Legacy compatible bases support live source coefficients. New atmosphere-baked WebGL plates are explicitly fixed-lighting and require recapture for changed lighting. Their diagnostic bases must not be treated as arbitrary Sun/Moon relighting operators. Their compatibility-domain radiance must not enter the physical WebGPU compositor without an established radiometric/foreground-air conversion; this integration remains blocked, as recorded in `TODO.md`. Live WebGL uses the current sky's physical atmospheric medium at cloud sample positions. Reference photographs and production-frame captures form the visual acceptance evidence.

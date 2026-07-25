# Lunar renderer realism evidence

Generated 2026-07-25T07:04:19.788Z from 140 same-state renders. These measurements reveal physical relationships and opportunities; they are not photo-matching objectives.

## Quantified findings

- The threshold-measured full-Moon edge is 0.88× the physical lunar radius in 2° scientific views (within the analyzer's quarter-ring sampling tolerance).
- Resolved full-Moon surface contrast is 0.373 versus 0.438 in NASA truth; normalized small-scale detail is 0.64× the reference.
- The crescent dark disc is -0.096 below its surrounding rendered sky at the median, while NASA truth remains 0.011 above its black reference field. The renderer is subtractively occluding sky radiance instead of compositing non-negative earthshine/transmitted light.
- Against calibrated 80 ms full-Moon frames, the renderer retains 36% of measured inner-halo energy and 124% of outer-halo energy, yet its radial ring curvature is 90× higher. The energy is redistributed into an incorrect, visibly banded radial profile.
- The calibrated night photographs contain a median 0 detected point sources versus 19 in matched renders; this exposes exposure/extinction coupling rather than merely star density.
- The same DLR scenes render 3.64 EV brighter with 23.5× the reference range, showing that camera exposure/tone response is not coupled to the lunar source and atmosphere.
- Across phase-balanced AADC scenes the renderer is -0.91 EV darker and preserves only 0.57× the photographed sky range, the opposite camera-response bias from DLR night frames. This is evidence for a scene-linear radiance stage followed by an independent editorial tone map—not a request to copy either exposure.
- AADC all-sky frames are authoritative for whole-sky color, cloud veil, and brightness distribution; their low-resolution Moon detections are deliberately excluded from lunar-edge conclusions.
- Contextual Commons photographs validate color, exposure, phase, scale, and atmospheric interaction, but not pixel registration because photographer optical-axis metadata is unavailable.

## Realism opportunities

- Composite the unlit lunar disc with non-negative transmitted sky and earthshine. It must never become a darker circular cutout in bright sky.
- Drive the textured disc, camera PSF, aureole, haze, and cloud forward-scattering from one scene-linear lunar radiance value. Use smooth, energy-conserving radial kernels so extra artistic emphasis remains continuous rather than ring-shaped.
- Make lunar detail frequency-aware: preserve large maria and terminator relief while filtering high-frequency texture by apparent size, seeing, aerosol path, cloud optical depth, and the editorial exposure.
- Couple stellar limiting magnitude, scintillation, and local extinction to sky radiance and lunar glare, then apply a separate editorial visibility floor if desired. This keeps intentionally beautiful stars without making them look pasted over the atmosphere.
- Generate depth and variety from coherent latent conditions—humidity profile, aerosol type and height, cloud optical depth, ground albedo, lunar altitude, and adaptation—then apply the palette's intentional grade. Avoid independently randomizing effects that should share the same scattering state.

## Editorial interpretation

- Preserve the app's intentional subtlety, vibrancy, emphasis, and day-to-day diversity. Correct discontinuities and implausible interactions before considering any global color or exposure shift.
- NASA SVS frames are used for phase, libration, limb, and surface truth—not atmospheric exposure or an editorial color grade.
- DLR Eye2Sky is the strongest local source for full-Moon PSF, halo shape, sky suppression, and nearby-star interaction because its 80 ms exposure and camera calibration are known. Its star count is evidence about coupled extinction/exposure, not a requirement to suppress the app's stars to the same count.
- AADC and Commons photographs teach the range and co-occurrence of sky depth, cloud veil, color, and Moon integration. Their camera tone curves and white balance are not radiometric ground truth.
- No reference pixel chooses renderer palette, exposure, aerosol, humidity, or cloud density.

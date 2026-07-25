# Sky and lunar rendering benchmarks

## Photographic sky diagnostic

The unlisted `/sky-photographs` route compares the renderer with 188
condition-known photographic skies. The set is balanced across solar-altitude
regimes, cloud morphology, aerosol class, camera direction, latitude, clear
air, twilight, moonlit atmosphere, and deep night. Its sources are GLOBE CLOUD
GAZE and terminator observations, DLR Eye2Sky, Australian Antarctic Division
Davis all-sky frames, and the high/medium-confidence atmospheric subset of the
lunar corpus.

This corpus is deliberately **not** a pixel-matching target. Camera response,
exposure, white balance, display transform, and the reference datasets' own
sampling biases are not the Elements art direction. Photographs are evidence
for geometry, optical depth, tonal continuity, extinction, atmospheric
coupling, plausible parameter combinations, and missing kinds of variation.
The renderer retains an intentional bias toward vibrant editorial color and
broad natural diversity.

The automated report is therefore a regression and outlier detector rather
than an optimizer. Global similarity scores can reveal a broken tone floor,
clipped chroma, gradient band, or implausible cloud extinction; they cannot
decide that a more average or less expressive sky is better.

```sh
npm run sky:curate
npm run build
SKY_BENCHMARK_URL=http://localhost:3000 npm run sky:render
npm run sky:analyze
```

## Lunar rendering benchmark

The unlisted `/sky-benchmark` route studies the Elements renderer alongside 140
astronomy-known references. It is an evidence tool, not a photo-matching target.
Every case fixes UTC time, observer coordinates,
Sun and Moon altitude/azimuth, phase, apparent lunar diameter, camera field of
view, and the source's available exposure metadata. The render path uses the
Moon's physical ~0.52° angular diameter; the normal app keeps its independent
art-directed scale. Reference pixels never choose palette color, family,
exposure, aerosol, humidity, or cloud density. Those controls come from
astronomy, location/climate, semantic weather evidence, and deterministic
editorial baselines.

## Evidence classes

- **55 AADC Davis all-sky frames** span every main phase class, day through
  deep night, horizon through high Moon, polar sky color, cloud veil, and
  brightness distribution. Their 720×576 imagery is not used for lunar-edge
  or surface-detail conclusions.
- **24 DLR Eye2Sky OLUOL frames** use the station's published radial camera
  calibration and exact 80 ms exposure. The full-Moon, moon-centred views are
  the strongest benchmark for PSF, halo falloff, sky suppression, and stars
  near the Moon.
- **19 NASA SVS 2026 frames** provide LRO/LOLA/LROC-derived phase, libration,
  limb, terminator, earthshine, and surface truth. A 2° virtual telephoto view
  gives the renderer enough pixels for structural analysis. These frames are
  not treated as atmospheric exposure references.
- **42 visually audited Wikimedia Commons photographs** have structured camera
  location, exact EXIF local time converted with the location's IANA timezone,
  camera exposure/aperture/ISO/focal length where available, and a per-file
  free license. Eclipses, occultations, composites, sequences, time-lapses,
  and semantically false “Moon” results are excluded. They cover landscape,
  city, cloud, haze, clear air, daylight, twilight, deep night, wide angle,
  normal, and telephoto compositions.

## Reproduce

```sh
npm run moon:curate
npm run build
SKY_BENCHMARK_URL=http://localhost:3000 npm run moon:render
npm run moon:analyze
```

`SKY_BENCHMARK_CLASS`, `SKY_BENCHMARK_SOURCE`, and `SKY_BENCHMARK_LIMIT` can
restrict a capture run. Captures and reports are written under ignored
`output/sky-benchmark/`.

## Analysis

The analyzer reports exposure offset, chromaticity, scene dynamic range,
dark-sky fraction, vertical tone profile, gradient curvature, point-source
counts, physical Moon radius, dark-disc contrast, radial halo falloff, and halo
ring curvature. Results are grouped by evidence class, source, lunar phase,
solar regime, and lunar altitude. These are diagnostic dimensions, not an
optimization loss. Camera exposure and white balance are especially useful for
revealing missing physical coupling, but must not flatten the app's deliberate
subtlety, vibrancy, or day-to-day diversity.

Metrics have deliberate boundaries:

- AADC contributes global sky statistics only; its Moon-local detections are
  too low-resolution for edge or halo claims.
- Contextual photographs contribute photographic distribution and state
  coverage, but not pixel registration because optical-axis metadata is absent.
- NASA contributes lunar-disc structure, not camera PSF or sky exposure.
- DLR contributes local Moon/atmosphere metrics, but its available 80 ms night
  frames are limited to full-Moon nights.
- Photographs teach relationships—limb-to-sky continuity, non-negative
  earthshine, PSF shape, cloud occlusion, scattering falloff, extinction, and
  depth. They do not prescribe a single photographic exposure or color grade.

The renderer is one-shot: WebGL atmosphere, cloud, celestial, and star passes
render only when inputs change. The benchmark adds no permanent animation loop
and therefore does not alter production thermal behavior.

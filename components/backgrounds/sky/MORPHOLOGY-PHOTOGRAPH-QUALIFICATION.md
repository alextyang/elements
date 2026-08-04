# Orthogonal morphology photographic qualification

`cloud-morphology-photograph-qualification.ts` is the data-only photographic
acceptance manifest for the morphology modifier and exterior-boundary systems.
It adds the review slice which the base-species photograph benchmark does not
cover:

- all nine WMO varieties;
- the nine non-hydrometeor supplementary features (Virga and Praecipitatio
  remain owned by the hydrometeor qualification path);
- all four accessory clouds;
- nitric-acid/water PSC, nacreous ice PSC, and noctilucent cloud;
- liquid cauliflower/turret, stratiform/scud, and ice-fibre/sedimentation
  exterior boundaries.

The 28 targets expand lazily across physical lighting/atmosphere contexts,
ground perspectives and coverage regimes. Importing the module performs no
fetch, image decode, screenshot, browser, renderer, server or GPU work. It
stores WMO URLs as strings and yields one case only when the caller advances
`iterateCloudMorphologyPhotographCases()`.

## First-party references

Every target has three WMO-hosted links: a direct compressed photograph, its
`imgviewer` metadata/description record, and the applicable definition or
classification page. Individual photographer credits are retained. No remote
image is copied into this repository.

The governing Atlas sources are:

- [varieties](https://cloudatlas.wmo.int/en/clouds-varieties.html);
- [supplementary features](https://cloudatlas.wmo.int/en/clouds-supplementary-features.html)
  and the [feature/genus table](https://cloudatlas.wmo.int/en/clouds-supplementary-features-and-genera-most-frequently-occur-table.html);
- [accessory clouds](https://cloudatlas.wmo.int/en/principles-of-cloud-classification-accessory-clouds.html);
- [upper-atmospheric clouds](https://cloudatlas.wmo.int/en/upper-atmospheric-clouds.html),
  [nacreous clouds](https://cloudatlas.wmo.int/en/nacreous-clouds.html), and
  [noctilucent clouds](https://cloudatlas.wmo.int/en/noctilucent-clouds.html).

References are acceptance goals, not textures. The cues require real topology,
parent ownership, depth, transmittance and atmosphere coupling; reproducing the
photograph's framing or color grade is not a pass.

## Review dimensions

Targets select at least three environments, three perspectives and two cloud
amounts. The shared contexts expose different defects:

- clean side light reveals volume relief and feature attachment;
- golden backlight reveals clipped support, fake rims and masks;
- diffuse humid light reveals repetition which hard shadows can hide;
- twilight and moonlight reveal cloud/atmosphere color discontinuities;
- tropical cases preserve storm ownership and liquid/ice transitions;
- polar-winter frost-point cases constrain PSC/nacreous clouds;
- polar-summer cases keep NLCs inside the 6–16 degree solar-depression window.

Wide horizon, natural oblique, wide uplook, distant telephoto and near uplook
views distinguish world-space geometry from screen-space layout. Sparse cloud
amount catches stamps and artificial system borders; broken amount catches
owner/population repetition; extensive/overcast cases catch fake masks and
lighting depth failures.

Each cue names the failure classes it rejects. The complete map explicitly
covers fake grids, repeated stamps, masking, detached features, wrong relative
placement/scale, storage-boundary clipping, lighting seams and sky-color
mismatch.

## Unlisted review integration

`/cloud-photographs` now preserves its complete base-species benchmark and adds
an arrow-steppable `Varieties & features` qualification set. Axis, target,
physical environment, perspective and coverage are independent controls.
`resolveCloudMorphologyPhotographCase(caseId)` performs direct validated map
lookups for the selected four-dimensional case; neither the route nor the
adapter enumerates the matrix.

`cloud-photograph-orthogonal-benchmark.ts` reuses the selected base species'
physical layer, applies the exact case amount and
`CloudScene.classifications`, and translates only the selected physical
environment and perspective into `SkyPreviewOptions`. The physical camera FOV
remains shared by atmosphere, celestial objects and clouds.

Pair/reference/overlay views mount one ordinary `<img>` using only the current
target's direct WMO URL. Render capture mounts no reference image. No reference
is prefetched, decoded or bundled by the data modules.

The unchanged serial capture contract accepts an orthogonal case directly:

```sh
npm run cloud:review -- \
  feature-mamma--tropical-storm-backlight--near-uplook--broken final
```

This produces the stable URL
`/cloud-photographs?case=feature-mamma--tropical-storm-backlight--near-uplook--broken&capture=render&debug=final`.
The existing measured-ready gate still requires a current WebGPU snapshot,
valid history, converged transport, nonzero projected opacity and occupied-sky
evidence before the harness writes a screenshot.

`iterateCloudMorphologyPhotographSmokeCases()` yields exactly eight single-case
representatives: subtractive lacunosus and cavum, attached mamma and pileus,
nacreous cloud, and all three exterior-boundary regimes. It is intended for a
quick integration pass; it is not the completion gate.

Representative stable smoke case IDs are:

- `variety-lacunosus--clean-side-day--zenith-wide--broken`
- `feature-mamma--tropical-storm-side--near-uplook--sparse`
- `feature-cavum--clean-side-day--zenith-wide--broken`
- `accessory-pileus--tropical-storm-side--distant-telephoto--sparse`
- `upper-nacreous--polar-winter-twilight--horizon-wide--sparse`
- `exterior-liquid-convection--clean-side-day--oblique-natural--sparse`
- `exterior-stratiform-scud--humid-marine-side--horizon-wide--broken`
- `exterior-ice-fibre--clean-side-day--oblique-natural--sparse`

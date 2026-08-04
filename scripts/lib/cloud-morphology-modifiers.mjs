import { createHash } from "node:crypto";

/**
 * Deterministic, renderer-independent WMO morphology modifier catalogue.
 *
 * Base species remain in cloud-volume-atlas.mjs. These records describe the
 * orthogonal organization, attachment and material operations that must be
 * evaluated in the parent's local meteorological frame. They deliberately do
 * not contain camera-space masks or pre-baked feature volumes: a mamma field,
 * cavum, wall cloud or pileus must inherit its parent's evolving surface and
 * lighting rather than becoming a reusable stamp.
 */

export const CLOUD_MORPHOLOGY_MODIFIER_SCHEMA = "elements-cloud-morphology-modifiers";
export const CLOUD_MORPHOLOGY_MODIFIER_VERSION = 1;
export const CLOUD_MORPHOLOGY_MODIFIER_GENERATOR_VERSION = "1.2.0";

export const CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT = Object.freeze({
    speciesCode: 1,
    formationMechanismCode: 3,
    connectivityCode: 1,
    maximumFibreCount: 8,
    primaryFibreCount: [3, 5],
    sourceCrossRadiusKm: [0.016, 0.075],
    sourceVerticalRadiusKm: [0.014, 0.055],
    terminalWidthRatio: [0.30, 0.58],
    terminalDensityRatio: [0.34, 0.58],
    maximumSourceToTerminalDropDepth: 0.48,
    originalSupportMaximumSdfVoxels: 0,
    couplingFootprintVoxelFraction: 0.35,
    implementation:
        "owner-seeded-c2-elliptical-fibres-with-area-preserving-world-filter",
    prohibitions: [
        "camera-space-density",
        "screen-space-geometry",
        "generic-scalar-noise",
        "fibratus-hooks",
        "fibratus-terminal-tufts",
        "exterior-support-expansion",
    ],
});

export const CLOUD_MORPHOLOGY_MODIFIER_IDS = [
    "intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
    "duplicatus", "translucidus", "perlucidus", "opacus",
    "mamma", "fluctus", "asperitas", "cavum", "arcus", "tuba",
    "murus", "cauda", "incus",
    "pileus", "velum", "pannus", "flumen",
    "polar-stratospheric", "nacreous", "noctilucent",
];

export const OPERATOR_CODES = Object.freeze({
    "warp-curl": 1,
    "add-spine-ribs": 2,
    "warp-wave": 3,
    "place-world-bands": 4,
    "subtract-lacunae": 5,
    "clone-layer": 6,
    "remap-extinction": 7,
    "separate-elements": 8,
    "add-udder-lobes": 9,
    "add-kh-billow": 10,
    "displace-underside": 11,
    "subtract-cavum": 12,
    "add-gust-front": 13,
    "add-vortex-funnel": 14,
    "add-wall-lowering": 15,
    "add-tail-connector": 16,
    "reuse-base-macro": 17,
    "add-cap-shell": 18,
    "add-veil-sheet": 19,
    "add-fragments": 20,
    "add-inflow-band": 21,
    "add-upper-wave-sheet": 22,
});

export const BLEND_CODES = Object.freeze({
    "smooth-union": 1,
    subtract: 2,
    warp: 3,
    placement: 4,
    optical: 5,
    reuse: 6,
});

export const ANCHOR_CODES = Object.freeze({
    "parent-volume": 1,
    "parent-filament-axis": 2,
    "parent-layer-midplane": 3,
    "parent-upper-surface": 4,
    "parent-underside": 5,
    "anvil-underside": 6,
    "parent-leading-lower-edge": 7,
    "rain-free-base": 8,
    "precipitation-core-edge": 9,
    "parent-top": 10,
    "parent-lower-environment": 11,
    "storm-inflow-sector": 12,
    "tangent-shell": 13,
});

export const MATERIAL_PROFILE_CODES = Object.freeze({
    none: 0,
    "psc-nitric-acid-water": 1,
    "psc-ice-nacreous-10um": 2,
    "pmc-water-ice-60-100nm": 3,
});

export const MACRO_VOLUME_CODES = Object.freeze({
    none: 0,
    "cb-capillatus-incus": 6,
});

export const LOGICAL_TOPOLOGY_CONNECTIVITY_CODES = Object.freeze({
    "single-connected": 0,
    "fragmented-population": 1,
    "cellular-colony": 2,
    "continuous-sheet": 3,
    "finite-wave-packet": 4,
    "roll-tube": 5,
});

/** [least-significant bit, bit count] in the raw owner-range topology word. */
export const LOGICAL_TOPOLOGY_OWNER_WORD_LAYOUT = Object.freeze({
    exemplarOrdinal: [0, 2],
    connectivity: [2, 3],
    lineageDepth: [5, 4],
    macroElementCount: [9, 6],
    branchOrCrestCount: [15, 4],
    shearCoupling: [19, 4],
    sedimentationCoupling: [23, 4],
    cellularClosure: [27, 5],
});

/** Eight physical scalars stored in record texels shape0 and shape1. */
export const OPERATOR_PARAMETER_LAYOUTS = Object.freeze({
    "warp-curl": ["bendRadians", "torsionRadians", "axialFrequency", "divergenceLimit", "octaveCount", "zero", "zero", "zero"],
    "add-spine-ribs": ["spineRadiusFraction", "ribLengthFraction", "ribTaper", "missingPairFraction", "asymmetry", "zero", "zero", "zero"],
    "warp-wave": ["amplitudeToWavelength", "secondaryAmplitudeFraction", "phaseDrift", "wavelengthDriftFraction", "crestSkew", "zero", "zero", "zero"],
    "place-world-bands": ["angularParallelToleranceRadians", "bandWidthVariation", "intervalVariation", "finiteEndErosionFraction", "twoHorizonConvergence", "zero", "zero", "zero"],
    "subtract-lacunae": ["throughLayerDepthFraction", "eccentricity", "rimFringeOctaves", "rimFringeAmplitudeFraction", "mergeProbability", "zero", "zero", "zero"],
    "clone-layer": ["verticalSeparationParentDepth", "horizontalOffsetParentRadius", "orientationDeltaRadians", "windShearMps", "mergeFraction", "zero", "zero", "zero"],
    "remap-extinction": ["medianVisibleOpticalDepth", "opaqueAreaMinimum", "opaqueAreaMaximum", "directDiscTransmissionMinimum", "directDiscTransmissionMaximum", "preservePerlucidusGaps", "zero", "zero"],
    "separate-elements": ["clearGapFraction", "ownerRadiusVariation", "edgeErosionFraction", "permitTranslucidusCombination", "zero", "zero", "zero", "zero"],
    "add-udder-lobes": ["attachmentNeckFraction", "penetrationToDiameter", "lobeAspect", "lateBreakawayFraction", "sublimationErosionFraction", "zero", "zero", "zero"],
    "add-kh-billow": ["wavelengthToShearDepth", "overturnFraction", "pairingProbability", "phaseJitterRadians", "terminalDissipationFraction", "zero", "zero", "zero"],
    "displace-underside": ["octaveCount", "directionalCoherence", "amplitudeToWavelength", "cuspFraction", "opticalDepthCorrelation", "zero", "zero", "zero"],
    "subtract-cavum": ["eccentricity", "throughLayerDepthFraction", "rimGlaciationWidthFraction", "growthFrontAsymmetry", "aircraftLinearProbability", "zero", "zero", "zero"],
    "add-gust-front": ["shelfToRoll", "leadingOverhangFraction", "undersideRaggedness", "alongFrontCurvature", "detachedRollGapFraction", "zero", "zero", "zero"],
    "add-vortex-funnel": ["topRadiusToLength", "terminalRadiusFraction", "curvatureFraction", "condensationCompleteness", "helicalPerturbation", "zero", "zero", "zero"],
    "add-wall-lowering": ["loweringDepthToWidth", "baseTiltRadians", "inflowSideBias", "rotationStrength", "edgeScudFraction", "zero", "zero", "zero"],
    "add-tail-connector": ["endHeightMismatchMaximumFraction", "narrowingTowardMurus", "upwardMotionNearJunction", "curvatureFraction", "verticalAspectMaximum", "zero", "zero", "zero"],
    "reuse-base-macro": ["macroVolumeCode", "preserveParentOwner", "independentStampForbidden", "downwindAxisFromUpperWind", "zero", "zero", "zero", "zero"],
    "add-cap-shell": ["shellThicknessToRadius", "summitClearanceToRadius", "domeEccentricity", "penetrationFraction", "stackedSpacingThicknesses", "zero", "zero", "zero"],
    "add-veil-sheet": ["thicknessToWidth", "edgeFrayFraction", "towerIntersectionCount", "penetrationBlendFraction", "tiltRadians", "zero", "zero", "zero"],
    "add-fragments": ["raggednessOctaves", "concavityFraction", "saturationMergeFraction", "verticalJitterFraction", "independentWindFraction", "zero", "zero", "zero"],
    "add-inflow-band": ["alignToLowLevelWindRadians", "baseAboveMurusMeters", "terminalUpdraftGapFraction", "broadBeaverTailProbability", "inflowSpeedMps", "zero", "zero", "zero"],
    "add-upper-wave-sheet": ["verticalThicknessMeters", "primaryWaveAmplitudeMeters", "primaryWavelengthMeters", "secondaryWaveFraction", "horizontalAnisotropy", "khIntermittency", "turbulenceIntermittency", "materialProfileCode"],
});

export const FLAG_BITS = Object.freeze({
    finite: 1 << 0,
    parentAttached: 1 << 1,
    upperAtmosphere: 1 << 2,
    cameraIndependent: 1 << 3,
    subtractive: 1 << 4,
    optical: 1 << 5,
    hydrometeorAnchor: 1 << 6,
    independentAdvection: 1 << 7,
    materialRequired: 1 << 8,
    reuseBase: 1 << 9,
    supercooled: 1 << 10,
});

const SOURCE_URLS = {
    wmoVarieties: "https://cloudatlas.wmo.int/en/clouds-varieties.html",
    wmoFeatures: "https://cloudatlas.wmo.int/en/clouds-supplementary-features.html",
    wmoAccessories: "https://cloudatlas.wmo.int/en/principles-of-cloud-classification-accessory-clouds.html",
    wmoUpper: "https://cloudatlas.wmo.int/en/upper-atmospheric-clouds.html",
    wmoMamma: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-mamma.html",
    wmoFluctus: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-fluctus.html",
    wmoAsperitas: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-asperitas.html",
    wmoCavum: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-cavum.html",
    wmoMurus: "https://cloudatlas.wmo.int/en/clouds-supplementary-features-murus.html",
    wmoCauda: "https://cloudatlas.wmo.int/clouds-supplementary-features-cauda.html",
    wmoPileus: "https://cloudatlas.wmo.int/en/clouds-accessory-pileus.html",
    wmoVelum: "https://cloudatlas.wmo.int/clouds-accessory-velum.html",
    wmoPannus: "https://cloudatlas.wmo.int/en/clouds-accessory-pannus.html",
    wmoFlumen: "https://cloudatlas.wmo.int/clouds-accessory-flumen.html",
    wmoNacreous: "https://cloudatlas.wmo.int/nacreous-clouds.html",
    mammatusSimulation: "https://doi.org/10.1175/2007JAS2469.1",
    holePunchSimulation: "https://doi.org/10.1175/JAS-D-15-0211.1",
    khObservation: "https://doi.org/10.1029/2011GL050120",
    asperitasModel: "https://doi.org/10.1103/PhysRevFluids.7.010501",
    pscMicrophysics: "https://doi.org/10.1029/2001JD001125",
    pmcDns: "https://doi.org/10.1029/2021JD035834",
    pmcMorphology: "https://doi.org/10.1016/j.jastp.2012.09.009",
    cirrusFallstreakStochasticModel: "https://doi.org/10.1256/qj.04.144",
    gpuGemsVolumeReconstruction:
        "https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-39-volume-rendering-techniques",
    gpuGemsProceduralFilterWidth:
        "https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-25-fast-filter-width-estimates-texture-maps",
    horizonVolumetricCloudscapes:
        "https://advances.realtimerendering.com/s2015/index.html#_REAL-TIME_VOLUMETRIC_CLOUDSCAPES",
    nubisEvolved:
        "https://advances.realtimerendering.com/s2022/index.html#Nubis",
};

const range = (minimum, maximum) => [minimum, maximum];
const support = (u, v, w, anchor, offsetMeters = [0, 0]) => ({
    frame: "parent-local-crosswind-altitude-downwind",
    finite: true,
    anchor,
    normalizedSupport: { u, v, w },
    verticalOffsetMeters: offsetMeters,
});
const physical = ({ horizontal, vertical, depth, wavelength = null, note }) => ({
    horizontalExtentMeters: horizontal,
    verticalExtentMeters: vertical,
    downwindExtentMeters: depth,
    wavelengthMeters: wavelength,
    note,
});
const placement = (method, count, scaleRelative, minimumSeparation = 0) => ({
    method,
    count,
    scaleRelative,
    minimumSeparation,
    candidateCount: method === "best-candidate-plane" ? 24 : 0,
    jitterFraction: method === "single" ? 0 : 0.18,
});
const operator = (code, blend, anchor, parameters, flags = []) => ({
    code,
    opCode: OPERATOR_CODES[code],
    blend,
    blendCode: BLEND_CODES[blend],
    anchor,
    anchorCode: ANCHOR_CODES[anchor],
    parameters,
    flags,
});
const constraints = ({
    genera = [], phases = ["liquid", "mixed", "ice"], lifecycle = [
        "incipient", "growing", "mature", "glaciating", "precipitating", "decaying",
    ], requires = [], dependencies = [], excludes = [], environment = {},
}) => ({ genera, phases, lifecycle, requires, dependencies, excludes, environment });

const variety = (id, config) => ({ id, category: "variety", ...config });
const feature = (id, config) => ({ id, category: "supplementary-feature", ...config });
const accessory = (id, config) => ({ id, category: "accessory-cloud", ...config });
const upper = (id, config) => ({ id, category: "upper-atmospheric", ...config });

export const CLOUD_MORPHOLOGY_MODIFIERS = [
    variety("intortus", {
        description: "Irregularly curved and capriciously entangled Cirrus filaments.",
        representation: "coordinate-warp",
        support: support(range(-1, 1), range(-1, 1), range(-1, 1), "parent-filament-axis"),
        physicalScale: physical({ horizontal: range(500, 15_000), vertical: range(50, 1_000), depth: range(300, 8_000), wavelength: range(400, 5_000), note: "Curvature acts along existing ice-fiber trajectories; it must not thicken them into tubes." }),
        placement: placement("curve-chain", range(5, 13), range(0.05, 0.18), 0.04),
        constraints: constraints({ genera: ["cirrus"], phases: ["ice"] }),
        operators: [operator("warp-curl", "warp", "parent-filament-axis", {
            octaveCount: 3, bendRadians: range(0.18, 0.95), torsionRadians: range(-0.7, 0.7), axialFrequency: range(0.7, 3.2), divergenceLimit: 0.35,
        }, ["preserve-cross-section", "advect-with-parent"])],
        sources: ["wmoVarieties"],
    }),
    variety("vertebratus", {
        description: "A finite Cirrus spine with uneven paired ribs resembling vertebrae or a fish skeleton.",
        representation: "additive-attached-field",
        support: support(range(-0.92, 0.92), range(-0.28, 0.28), range(-0.72, 0.72), "parent-filament-axis"),
        physicalScale: physical({ horizontal: range(1_500, 18_000), vertical: range(40, 700), depth: range(600, 6_000), wavelength: range(250, 1_800), note: "Ribs taper away from an irregular central ice spine and may be missing or unequal." }),
        placement: placement("paired-rib-chain", range(7, 19), range(0.04, 0.16), 0.035),
        constraints: constraints({ genera: ["cirrus"], phases: ["ice"] }),
        operators: [operator("add-spine-ribs", "smooth-union", "parent-filament-axis", {
            spineRadiusFraction: range(0.025, 0.08), ribLengthFraction: range(0.18, 0.48), ribTaper: range(0.55, 0.9), missingPairFraction: range(0.08, 0.28), asymmetry: range(0.1, 0.42),
        }, ["finite-chain", "density-tapered-ribs"])],
        sources: ["wmoVarieties"],
    }),
    variety("undulatus", {
        description: "Coherent wave organization whose wavelength and phase vary slowly across a finite cloud field.",
        representation: "coordinate-warp",
        support: support(range(-1, 1), range(-0.55, 0.55), range(-1, 1), "parent-layer-midplane"),
        physicalScale: physical({ horizontal: range(3_000, 150_000), vertical: range(30, 900), depth: range(3_000, 120_000), wavelength: range(500, 24_000), note: "A gravity-wave displacement, not repeated opacity stripes." }),
        placement: placement("wave-train", range(4, 11), range(0.08, 0.28), 0),
        constraints: constraints({ genera: ["cirrocumulus", "cirrostratus", "altocumulus", "altostratus", "stratocumulus", "stratus"] }),
        operators: [operator("warp-wave", "warp", "parent-layer-midplane", {
            amplitudeToWavelength: range(0.025, 0.16), secondaryAmplitudeFraction: range(0.08, 0.34), phaseDrift: range(-0.35, 0.35), wavelengthDriftFraction: range(0.04, 0.22), crestSkew: range(-0.25, 0.25),
        }, ["finite-envelope", "nonstationary-phase"])],
        sources: ["wmoVarieties"],
    }),
    variety("radiatus", {
        description: "Several finite, physically parallel world-space bands whose apparent convergence comes only from perspective.",
        representation: "world-placement",
        support: support(range(-1, 1), range(-0.45, 0.45), range(-1, 1), "parent-volume"),
        physicalScale: physical({ horizontal: range(10_000, 300_000), vertical: range(50, 3_000), depth: range(20_000, 400_000), wavelength: range(1_000, 30_000), note: "Never bend bands toward the camera; projection creates the horizon convergence." }),
        placement: placement("parallel-band-array", range(3, 9), range(0.12, 0.34), 0.07),
        constraints: constraints({ genera: ["cirrus", "altocumulus", "altostratus", "stratocumulus", "cumulus"], requires: ["banded-organization"] }),
        operators: [operator("place-world-bands", "placement", "parent-volume", {
            angularParallelToleranceRadians: 0.035, bandWidthVariation: range(0.16, 0.48), intervalVariation: range(0.08, 0.32), finiteEndErosionFraction: range(0.08, 0.25), twoHorizonConvergence: true,
        }, ["camera-independent", "world-parallel"] )],
        sources: ["wmoVarieties"],
    }),
    variety("lacunosus", {
        description: "A thin cellular layer with finite, fringed round holes organized like an irregular net or honeycomb.",
        representation: "subtractive-topology",
        support: support(range(-0.92, 0.92), range(-0.18, 0.18), range(-0.92, 0.92), "parent-layer-midplane"),
        physicalScale: physical({ horizontal: range(3_000, 120_000), vertical: range(50, 1_200), depth: range(3_000, 120_000), wavelength: range(400, 12_000), note: "The holes remove condensate through the layer; they are not pale discs painted over it." }),
        placement: placement("best-candidate-plane", range(8, 28), range(0.07, 0.22), 0.08),
        constraints: constraints({ genera: ["cirrocumulus", "altocumulus", "stratocumulus"], requires: ["open-cell-organization"] }),
        operators: [operator("subtract-lacunae", "subtract", "parent-layer-midplane", {
            throughLayerDepthFraction: range(0.8, 1.35), eccentricity: range(0, 0.45), rimFringeOctaves: 3, rimFringeAmplitudeFraction: range(0.04, 0.18), mergeProbability: range(0.05, 0.22),
        }, ["real-clear-space", "aperiodic-cells"])],
        sources: ["wmoVarieties"],
    }),
    variety("duplicatus", {
        description: "Two or more finite cloud layers at slightly different levels, sometimes merging locally.",
        representation: "layer-composition",
        support: support(range(-1, 1), range(-1, 1), range(-1, 1), "parent-volume"),
        physicalScale: physical({ horizontal: range(5_000, 250_000), vertical: range(100, 3_000), depth: range(5_000, 250_000), wavelength: null, note: "Each layer keeps its own wind, offset and optical path; this is not double sampling one slab." }),
        placement: placement("layer-stack", range(2, 4), range(0.72, 1), 0.06),
        constraints: constraints({ genera: ["cirrus", "cirrostratus", "altocumulus", "altostratus", "stratocumulus"] }),
        operators: [operator("clone-layer", "placement", "parent-volume", {
            verticalSeparationParentDepth: range(0.18, 1.3), horizontalOffsetParentRadius: range(0.05, 0.42), orientationDeltaRadians: range(-0.28, 0.28), windShearMps: range(0.5, 14), mergeFraction: range(0.02, 0.3),
        }, ["independent-advection", "separate-optical-paths"])],
        sources: ["wmoVarieties"],
    }),
    variety("translucidus", {
        description: "An extensive layer whose greater part transmits enough direct light to reveal the Sun or Moon position.",
        representation: "optical-remap",
        support: support(range(-1, 1), range(-1, 1), range(-1, 1), "parent-volume"),
        physicalScale: physical({ horizontal: range(10_000, 500_000), vertical: range(50, 4_000), depth: range(10_000, 500_000), note: "Constrains integrated optical depth, not local alpha." }),
        placement: placement("single", range(1, 1), range(1, 1)),
        constraints: constraints({ genera: ["altocumulus", "altostratus", "stratocumulus", "stratus"], excludes: ["opacus"] }),
        operators: [operator("remap-extinction", "optical", "parent-volume", {
            medianVisibleOpticalDepth: range(0.35, 1.8), opaqueAreaMaximum: 0.32, directDiscTransmissionMinimum: 0.12, conserveCondensateOrdering: true,
        }, ["path-integrated", "source-disc-visible"])],
        sources: ["wmoVarieties"],
    }),
    variety("perlucidus", {
        description: "An extensive Ac or Sc field with genuine clear spaces between cloud elements.",
        representation: "placement-topology",
        support: support(range(-1, 1), range(-0.5, 0.5), range(-1, 1), "parent-layer-midplane"),
        physicalScale: physical({ horizontal: range(8_000, 250_000), vertical: range(100, 2_500), depth: range(8_000, 250_000), wavelength: range(500, 15_000), note: "Clear sky must be revealed by separated condensate owners, never a transparency checkerboard." }),
        placement: placement("best-candidate-plane", range(8, 24), range(0.09, 0.28), 0.1),
        constraints: constraints({ genera: ["altocumulus", "stratocumulus"] }),
        operators: [operator("separate-elements", "placement", "parent-layer-midplane", {
            clearGapFraction: range(0.12, 0.45), ownerRadiusVariation: range(0.18, 0.52), edgeErosionFraction: range(0.05, 0.22), permitTranslucidusCombination: true,
        }, ["world-space-gaps", "aperiodic-owners"])],
        sources: ["wmoVarieties"],
    }),
    variety("opacus", {
        description: "An extensive layer whose greater part completely masks the Sun or Moon.",
        representation: "optical-remap",
        support: support(range(-1, 1), range(-1, 1), range(-1, 1), "parent-volume"),
        physicalScale: physical({ horizontal: range(10_000, 600_000), vertical: range(100, 7_000), depth: range(10_000, 600_000), note: "Raises path optical depth through condensate while preserving real gaps when perlucidus is also present." }),
        placement: placement("single", range(1, 1), range(1, 1)),
        constraints: constraints({ genera: ["altocumulus", "altostratus", "stratocumulus", "stratus"], excludes: ["translucidus"] }),
        operators: [operator("remap-extinction", "optical", "parent-volume", {
            medianVisibleOpticalDepth: range(4, 60), directDiscTransmissionMaximum: 0.018, opaqueAreaMinimum: 0.68, preservePerlucidusGaps: true,
        }, ["path-integrated", "source-disc-obscured"])],
        sources: ["wmoVarieties"],
    }),
    feature("mamma", {
        description: "Unequal, smooth-to-eroding lobes descending from a cloudy underside, commonly beneath a Cb anvil.",
        representation: "additive-attached-field",
        support: support(range(-0.92, 0.92), range(-0.52, 0.04), range(-0.92, 0.92), "parent-underside", range(-1_500, 0)),
        physicalScale: physical({ horizontal: range(800, 40_000), vertical: range(120, 2_000), depth: range(800, 40_000), wavelength: range(250, 3_500), note: "Lobes originate at the underside and descend with unequal penetration; detached spheres are invalid." }),
        placement: placement("best-candidate-plane", range(7, 26), range(0.07, 0.22), 0.075),
        constraints: constraints({ genera: ["cirrus", "cirrocumulus", "altocumulus", "altostratus", "stratocumulus", "cumulonimbus"], lifecycle: ["mature", "glaciating", "precipitating", "decaying"], requires: ["cloudy-underside", "subcloud-detrainment-or-sublimation"] }),
        operators: [operator("add-udder-lobes", "smooth-union", "parent-underside", {
            attachmentNeckFraction: range(0.45, 0.78), penetrationToDiameter: range(0.55, 1.7), lobeAspect: range(0.62, 1.25), lateBreakawayFraction: range(0, 0.14), sublimationErosionFraction: range(0.06, 0.32),
        }, ["surface-attached", "negative-buoyancy", "aperiodic-lobes"])],
        sources: ["wmoMamma", "mammatusSimulation"],
    }),
    feature("fluctus", {
        description: "A short finite train of overturning Kelvin-Helmholtz curls on a cloud top or shear interface.",
        representation: "additive-warp-field",
        support: support(range(-0.9, 0.9), range(-0.05, 0.55), range(-0.72, 0.72), "parent-upper-surface", range(0, 1_500)),
        physicalScale: physical({ horizontal: range(800, 30_000), vertical: range(100, 1_500), depth: range(300, 10_000), wavelength: range(500, 12_000), note: "Billow wavelength follows shear-layer depth and curls overturn consistently with vorticity sign." }),
        placement: placement("wave-train", range(3, 8), range(0.09, 0.25), 0.03),
        constraints: constraints({ genera: ["cirrus", "altocumulus", "stratocumulus", "stratus", "cumulus"], requires: ["vertical-shear-at-least-3-mps", "richardson-unstable-layer"] }),
        operators: [operator("add-kh-billow", "smooth-union", "parent-upper-surface", {
            wavelengthToShearDepth: range(6, 14), overturnFraction: range(0.32, 0.82), pairingProbability: range(0.05, 0.28), phaseJitterRadians: range(-0.18, 0.18), terminalDissipationFraction: range(0.12, 0.4),
        }, ["finite-wave-train", "signed-vorticity", "short-lived"])],
        sources: ["wmoFluctus", "khObservation"],
    }),
    feature("asperitas", {
        description: "Chaotic, localized underside waves with multiple scales and occasional sharp descending points.",
        representation: "surface-displacement",
        support: support(range(-1, 1), range(-0.58, 0.08), range(-1, 1), "parent-underside", range(-2_000, 0)),
        physicalScale: physical({ horizontal: range(5_000, 120_000), vertical: range(150, 2_000), depth: range(5_000, 120_000), wavelength: range(800, 18_000), note: "Less horizontally organized than undulatus; correlated depth variation is required for its dramatic self-shadowing." }),
        placement: placement("chaotic-wave-patches", range(5, 14), range(0.12, 0.4), 0.04),
        constraints: constraints({ genera: ["altocumulus", "stratocumulus"], lifecycle: ["mature", "decaying"], requires: ["settling-or-evaporation", "vertical-shear"] }),
        operators: [operator("displace-underside", "warp", "parent-underside", {
            octaveCount: 4, directionalCoherence: range(0.18, 0.55), amplitudeToWavelength: range(0.08, 0.28), cuspFraction: range(0.04, 0.2), opticalDepthCorrelation: range(0.35, 0.82),
        }, ["nonperiodic", "multiscale", "thickness-coupled"])],
        sources: ["wmoAsperitas", "asperitasModel"],
    }),
    feature("cavum", {
        description: "A finite circular or linear through-hole in supercooled droplet cloud with a glaciating, widening boundary.",
        representation: "subtractive-topology",
        support: support(range(-0.86, 0.86), range(-0.35, 0.35), range(-0.86, 0.86), "parent-layer-midplane"),
        physicalScale: physical({ horizontal: range(1_000, 50_000), vertical: range(100, 2_000), depth: range(1_000, 50_000), wavelength: null, note: "The clear region penetrates the layer and expands at a gravity-wave front; central virga remains hydrometeor-owned." }),
        placement: placement("single", range(1, 2), range(0.16, 0.58), 0.18),
        constraints: constraints({ genera: ["cirrocumulus", "altocumulus", "stratocumulus"], phases: ["liquid", "mixed"], requires: ["supercooled-liquid-layer"], environment: { maximumTemperatureKelvin: 273.15 } }),
        operators: [operator("subtract-cavum", "subtract", "parent-layer-midplane", {
            eccentricity: range(0, 0.55), throughLayerDepthFraction: range(1, 1.8), rimGlaciationWidthFraction: range(0.04, 0.18), growthFrontAsymmetry: range(0.02, 0.22), aircraftLinearProbability: 0.18,
        }, ["real-through-hole", "expanding-front", "hydrometeor-anchor-at-center"])],
        sources: ["wmoCavum", "holePunchSimulation"],
    }),
    feature("arcus", {
        description: "A dense finite shelf or roll on the leading lower edge of a precipitation-driven gust front.",
        representation: "additive-attached-field",
        support: support(range(-0.96, 0.96), range(-0.5, 0.18), range(-0.28, 0.36), "parent-leading-lower-edge", range(-2_000, 400)),
        physicalScale: physical({ horizontal: range(5_000, 180_000), vertical: range(200, 2_500), depth: range(500, 8_000), wavelength: null, note: "A horizontally dense leading roll/wedge with ragged scud, not a symmetric halo around the storm." }),
        placement: placement("front-chain", range(4, 14), range(0.1, 0.35), 0.035),
        constraints: constraints({ genera: ["cumulus", "cumulonimbus"], lifecycle: ["mature", "precipitating", "decaying"], requires: ["precipitation-driven-cold-pool", "positive-outflow-speed"] }),
        operators: [operator("add-gust-front", "smooth-union", "parent-leading-lower-edge", {
            shelfToRoll: range(0, 1), leadingOverhangFraction: range(0.08, 0.35), undersideRaggedness: range(0.08, 0.32), alongFrontCurvature: range(-0.22, 0.22), detachedRollGapFraction: range(0, 0.18),
        }, ["cold-pool-normal", "finite-front", "precipitation-owned"])],
        sources: ["wmoFeatures"],
    }),
    feature("tuba", {
        description: "A tapered, often curved condensation column descending from a vortical cumuliform base.",
        representation: "additive-attached-field",
        support: support(range(-0.45, 0.45), range(-1, 0.02), range(-0.45, 0.45), "rain-free-base", range(-4_000, 0)),
        physicalScale: physical({ horizontal: range(50, 2_000), vertical: range(100, 5_000), depth: range(50, 2_000), wavelength: null, note: "The funnel begins with a broad attached condensation collar and narrows downward; ground contact is not implied." }),
        placement: placement("tapered-path", range(1, 2), range(0.05, 0.22), 0.2),
        constraints: constraints({ genera: ["cumulus", "cumulonimbus"], lifecycle: ["growing", "mature", "precipitating"], requires: ["positive-convective-ascent", "resolved-vorticity"] }),
        operators: [operator("add-vortex-funnel", "smooth-union", "rain-free-base", {
            topRadiusToLength: range(0.08, 0.34), terminalRadiusFraction: range(0.08, 0.55), curvatureFraction: range(0, 0.28), condensationCompleteness: range(0.25, 1), helicalPerturbation: range(0.01, 0.08),
        }, ["surface-attached", "vorticity-aligned", "no-ground-contact-assumption"])],
        sources: ["wmoFeatures"],
    }),
    feature("murus", {
        description: "A localized persistent lowering under the rain-free updraft base of a supercell.",
        representation: "additive-attached-field",
        support: support(range(-0.48, 0.48), range(-0.72, 0.02), range(-0.42, 0.42), "rain-free-base", range(-2_500, 0)),
        physicalScale: physical({ horizontal: range(1_000, 15_000), vertical: range(250, 3_000), depth: range(800, 10_000), wavelength: null, note: "An abrupt asymmetric lowering in the inflow/updraft sector, never centered under the precipitation core." }),
        placement: placement("single", range(1, 1), range(0.22, 0.58)),
        constraints: constraints({ genera: ["cumulonimbus"], lifecycle: ["mature", "precipitating"], requires: ["storm-complex", "supercell-mesocyclone", "rain-free-updraft-base"] }),
        operators: [operator("add-wall-lowering", "smooth-union", "rain-free-base", {
            loweringDepthToWidth: range(0.12, 0.48), baseTiltRadians: range(-0.16, 0.16), inflowSideBias: range(0.28, 0.72), rotationStrength: range(0.15, 1), edgeScudFraction: range(0.04, 0.2),
        }, ["persistent-owner", "updraft-sector", "mesocyclone-aligned"])],
        sources: ["wmoMurus"],
    }),
    feature("cauda", {
        description: "A low horizontal tail joining the supercell precipitation region to murus at their shared base height.",
        representation: "additive-connector",
        support: support(range(-1, 1), range(-0.18, 0.18), range(-1, 1), "precipitation-core-edge"),
        physicalScale: physical({ horizontal: range(1_000, 25_000), vertical: range(150, 1_500), depth: range(500, 8_000), wavelength: null, note: "Motion and narrowing run from precipitation toward murus; it is horizontal and must never resemble a funnel." }),
        placement: placement("curve-chain", range(4, 11), range(0.07, 0.24), 0.025),
        constraints: constraints({ genera: ["cumulonimbus"], lifecycle: ["mature", "precipitating"], requires: ["storm-complex", "supercell-inflow", "precipitation-region"], dependencies: ["murus"] }),
        operators: [operator("add-tail-connector", "smooth-union", "precipitation-core-edge", {
            endHeightMismatchMaximumFraction: 0.08, narrowingTowardMurus: range(0.08, 0.34), upwardMotionNearJunction: range(0.2, 1), curvatureFraction: range(0.02, 0.24), verticalAspectMaximum: 0.28,
        }, ["connects-to-murus", "horizontal-not-funnel", "inflow-directed"])],
        sources: ["wmoCauda"],
    }),
    feature("incus", {
        description: "Reuse of the attached glaciated Cb capillatus-incus macro volume; never a detached generic plate.",
        representation: "base-volume-reuse",
        support: support(range(-1, 1), range(-0.25, 0.45), range(-1, 1), "parent-top"),
        physicalScale: physical({ horizontal: range(8_000, 220_000), vertical: range(500, 6_000), depth: range(8_000, 260_000), wavelength: null, note: "The existing lifecycle atlas supplies the storm-connected tower, back-shear and downwind outflow." }),
        placement: placement("single", range(1, 1), range(1, 1)),
        constraints: constraints({ genera: ["cumulonimbus"], phases: ["mixed", "ice"], lifecycle: ["glaciating", "mature", "precipitating", "decaying"], requires: ["capillatus-stage"] }),
        operators: [operator("reuse-base-macro", "reuse", "parent-top", {
            macroVolumeId: "cb-capillatus-incus", preserveParentOwner: true, independentStampForbidden: true, downwindAxisFromUpperWind: true,
        }, ["existing-atlas", "attached-to-updraft"] )],
        sources: ["wmoFeatures"],
    }),
    accessory("pileus", {
        description: "One or more thin smooth caps immediately above a rapidly rising cumuliform summit, often penetrated by it.",
        representation: "additive-attached-field",
        support: support(range(-0.7, 0.7), range(-0.05, 0.32), range(-0.7, 0.7), "parent-top", range(0, 1_500)),
        physicalScale: physical({ horizontal: range(500, 12_000), vertical: range(40, 700), depth: range(500, 12_000), wavelength: null, note: "A shallow curved shell fit to the summit pressure surface; multiple caps may be superposed." }),
        placement: placement("layer-stack", range(1, 3), range(0.34, 0.82), 0.05),
        constraints: constraints({ genera: ["cumulus", "cumulonimbus"], lifecycle: ["growing", "mature"], requires: ["positive-convective-ascent"] }),
        operators: [operator("add-cap-shell", "smooth-union", "parent-top", {
            shellThicknessToRadius: range(0.025, 0.12), summitClearanceToRadius: range(0.01, 0.18), domeEccentricity: range(0.08, 0.42), penetrationFraction: range(0, 0.38), stackedSpacingThicknesses: range(1.4, 4),
        }, ["summit-conformal", "laminar-shell", "parent-may-penetrate"])],
        sources: ["wmoPileus"],
    }),
    accessory("velum", {
        description: "A broad shallow veil close above or attached to one or more cumuliform clouds that often pierce it.",
        representation: "additive-attached-field",
        support: support(range(-1, 1), range(-0.12, 0.25), range(-1, 1), "parent-upper-surface", range(-300, 2_000)),
        physicalScale: physical({ horizontal: range(5_000, 80_000), vertical: range(80, 1_000), depth: range(5_000, 80_000), wavelength: null, note: "Greater horizontal extent than pileus, with finite frayed edges and explicit tower intersections." }),
        placement: placement("single", range(1, 2), range(0.72, 1)),
        constraints: constraints({ genera: ["cumulus", "cumulonimbus"], lifecycle: ["growing", "mature", "glaciating"], requires: ["positive-convective-ascent"] }),
        operators: [operator("add-veil-sheet", "smooth-union", "parent-upper-surface", {
            thicknessToWidth: range(0.008, 0.05), edgeFrayFraction: range(0.04, 0.2), towerIntersectionCount: range(1, 4), penetrationBlendFraction: range(0.02, 0.14), tiltRadians: range(-0.12, 0.12),
        }, ["finite-sheet", "tower-pierced", "advect-with-interface"])],
        sources: ["wmoVelum"],
    }),
    accessory("pannus", {
        description: "A finite population of ragged low shreds in precipitation-moistened air below a parent cloud, sometimes merging into a layer.",
        representation: "additive-population",
        support: support(range(-1, 1), range(-1, -0.05), range(-1, 1), "parent-lower-environment", range(-3_000, -100)),
        physicalScale: physical({ horizontal: range(2_000, 120_000), vertical: range(100, 1_500), depth: range(2_000, 120_000), wavelength: range(200, 4_000), note: "Individual shreds retain concave erosion and separate motion until saturation merges them." }),
        placement: placement("best-candidate-plane", range(8, 30), range(0.05, 0.2), 0.055),
        constraints: constraints({ genera: ["altostratus", "nimbostratus", "cumulus", "cumulonimbus"], lifecycle: ["precipitating", "decaying"], requires: ["precipitation-moistened-layer", "relative-humidity-at-least-0.85"] }),
        operators: [operator("add-fragments", "smooth-union", "parent-lower-environment", {
            raggednessOctaves: 4, concavityFraction: range(0.12, 0.42), saturationMergeFraction: range(0, 0.62), verticalJitterFraction: range(0.08, 0.38), independentWindFraction: range(0.04, 0.2),
        }, ["finite-shreds", "aperiodic-population", "subcloud-moisture-owned"])],
        sources: ["wmoPannus"],
    }),
    accessory("flumen", {
        description: "A finite low-cloud inflow band parallel to low-level wind and moving toward a supercell, detached from and above murus.",
        representation: "world-placement",
        support: support(range(-1, 1), range(-0.3, 0.3), range(-1, 1), "storm-inflow-sector", range(-1_000, 1_500)),
        physicalScale: physical({ horizontal: range(5_000, 80_000), vertical: range(150, 1_500), depth: range(500, 8_000), wavelength: null, note: "The band follows the pseudo-warm-front inflow and terminates near the updraft; it is not attached to murus." }),
        placement: placement("inflow-chain", range(4, 14), range(0.07, 0.26), 0.035),
        constraints: constraints({ genera: ["cumulonimbus"], lifecycle: ["mature", "precipitating"], requires: ["storm-complex", "supercell-inflow", "pseudo-warm-front"] }),
        operators: [operator("add-inflow-band", "placement", "storm-inflow-sector", {
            alignToLowLevelWindRadians: range(-0.08, 0.08), baseAboveMurusMeters: range(100, 1_200), terminalUpdraftGapFraction: range(0.02, 0.16), broadBeaverTailProbability: 0.28, inflowSpeedMps: range(4, 35),
        }, ["detached-from-murus", "inflow-directed", "world-space-band"])],
        sources: ["wmoFlumen"],
    }),
    upper("polar-stratospheric", {
        description: "A very thin polar-winter stratospheric condensate field following localized gravity-wave cold pockets.",
        representation: "upper-atmosphere-thin-layer",
        support: { frame: "earth-tangent-shell", finite: true, anchor: "tangent-shell", altitudeKm: range(15, 30), normalizedSupport: { u: range(-1, 1), v: range(-0.1, 0.1), w: range(-1, 1) }, verticalOffsetMeters: range(0, 0) },
        physicalScale: physical({ horizontal: range(20_000, 500_000), vertical: range(100, 3_000), depth: range(20_000, 500_000), wavelength: range(5_000, 120_000), note: "Nitric-acid/water PSC may occur above the ice frost point; morphology follows mesoscale cold pools and mountain waves." }),
        placement: placement("upper-wave-patches", range(2, 7), range(0.18, 0.65), 0.08),
        constraints: constraints({ genera: [], phases: ["mixed"], lifecycle: ["mature"], requires: ["polar-winter-vortex", "stratospheric-cold-pool"], environment: { absoluteLatitudeDegrees: range(60, 90), season: "winter", altitudeKm: range(15, 30) } }),
        operators: [operator("add-upper-wave-sheet", "smooth-union", "tangent-shell", {
            verticalThicknessMeters: range(100, 3_000), primaryWaveAmplitudeMeters: range(100, 2_000), primaryWavelengthMeters: range(5_000, 120_000), secondaryWaveFraction: range(0.05, 0.28), horizontalAnisotropy: range(1.5, 8), materialProfile: "psc-nitric-acid-water",
        }, ["earth-curvature", "gravity-wave-cold-pockets", "optically-thin"])],
        sources: ["wmoUpper", "pscMicrophysics"],
    }),
    upper("nacreous", {
        description: "Ice PSC in thin often lenticular gravity-wave sheets with particle-size-coherent iridescence.",
        representation: "upper-atmosphere-thin-layer",
        support: { frame: "earth-tangent-shell", finite: true, anchor: "tangent-shell", altitudeKm: range(15, 30), normalizedSupport: { u: range(-1, 1), v: range(-0.1, 0.1), w: range(-1, 1) }, verticalOffsetMeters: range(0, 0) },
        physicalScale: physical({ horizontal: range(10_000, 350_000), vertical: range(100, 2_000), depth: range(10_000, 250_000), wavelength: range(5_000, 100_000), note: "Stationary wave crests remain geometrically thin; mother-of-pearl colour is a view/source-dependent material operation, not baked RGB." }),
        placement: placement("upper-wave-patches", range(2, 6), range(0.2, 0.7), 0.1),
        constraints: constraints({ genera: [], phases: ["ice"], lifecycle: ["mature"], requires: ["polar-winter-vortex", "below-ice-frost-point"], environment: { absoluteLatitudeDegrees: range(60, 90), season: "winter", maximumTemperatureKelvin: 188.15, altitudeKm: range(15, 30), preferredSolarDepressionDegrees: range(1, 12) } }),
        operators: [operator("add-upper-wave-sheet", "smooth-union", "tangent-shell", {
            verticalThicknessMeters: range(100, 2_000), primaryWaveAmplitudeMeters: range(80, 1_500), primaryWavelengthMeters: range(5_000, 100_000), secondaryWaveFraction: range(0.04, 0.2), horizontalAnisotropy: range(8, 80), crestStationarity: 1, boundaryIntermittency: range(0.05, 0.3), materialProfile: "psc-ice-nacreous-10um",
        }, ["earth-curvature", "stationary-gravity-wave", "diffraction-material-required"])],
        sources: ["wmoUpper", "wmoNacreous", "pscMicrophysics"],
    }),
    upper("noctilucent", {
        description: "An exceptionally thin summer mesopause ice layer revealing nested gravity waves, billows and turbulence from kilometre to sub-kilometre scale.",
        representation: "upper-atmosphere-thin-layer",
        support: { frame: "earth-tangent-shell", finite: true, anchor: "tangent-shell", altitudeKm: range(80, 85), normalizedSupport: { u: range(-1, 1), v: range(-0.04, 0.04), w: range(-1, 1) }, verticalOffsetMeters: range(0, 0) },
        physicalScale: physical({ horizontal: range(20_000, 1_000_000), vertical: range(50, 2_000), depth: range(20_000, 1_000_000), wavelength: range(20, 100_000), note: "A tangent-shell mesospheric field; fine bands and Kelvin-Helmholtz structures modulate ice albedo rather than becoming tropospheric cirrus." }),
        placement: placement("upper-wave-patches", range(4, 12), range(0.12, 0.5), 0.045),
        constraints: constraints({ genera: [], phases: ["ice"], lifecycle: ["mature"], requires: ["polar-summer-mesopause", "sunlit-upper-layer"], environment: { absoluteLatitudeDegrees: range(50, 70), season: "summer", altitudeKm: range(80, 85), solarDepressionDegrees: range(6, 16) } }),
        operators: [operator("add-upper-wave-sheet", "smooth-union", "tangent-shell", {
            verticalThicknessMeters: range(50, 2_000), primaryWaveAmplitudeMeters: range(20, 1_000), primaryWavelengthMeters: range(4_000, 100_000), secondaryWaveFraction: range(0.08, 0.38), horizontalAnisotropy: range(1.5, 12), spectralBandsMeters: [[20, 250], [250, 4_000], [4_000, 100_000]], khIntermittency: range(0.04, 0.3), turbulenceIntermittency: range(0.08, 0.46), materialProfile: "pmc-water-ice-60-100nm",
        }, ["earth-curvature", "multiscale-gravity-waves", "mesospheric-ice-albedo"])],
        sources: ["wmoUpper", "pmcDns", "pmcMorphology"],
    }),
];

const hashText = (value) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};
const mulberry32 = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };
};
const mix = (low, high, amount) => low + (high - low) * amount;
const distance2 = (a, b) => (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
const normalizedScale = (definition, random) => {
    const [low, high] = definition.placement.scaleRelative;
    const base = mix(low, high, random() ** 1.35);
    return [
        base * mix(0.72, 1.32, random()),
        base * mix(0.55, 1.16, random()),
        base * mix(0.72, 1.32, random()),
    ];
};
const instance = (definition, random, center, index, angle = 0) => ({
    index,
    center: center.map((value) => Number(value.toFixed(6))),
    scale: normalizedScale(definition, random).map((value) => Number(value.toFixed(6))),
    angleRadians: Number(angle.toFixed(6)),
    intensity: Number(mix(0.62, 1, random()).toFixed(6)),
});

const bestCandidatePlane = (definition, random, count) => {
    const points = [];
    const minimum = definition.placement.minimumSeparation;
    for (let index = 0; index < count; index += 1) {
        let best = null;
        let bestScore = -Infinity;
        for (let candidateIndex = 0; candidateIndex < 24; candidateIndex += 1) {
            // Mixed broad and clustered candidates avoid both a lattice and an
            // unnaturally uniform Poisson wallpaper.
            const cluster = index % 4;
            const clusterAngle = cluster * Math.PI * 0.5 + 0.37;
            const clusterCenter = [Math.cos(clusterAngle) * 0.38, Math.sin(clusterAngle) * 0.34];
            const clustered = random() < 0.58;
            const candidate = [
                clustered ? clusterCenter[0] + (random() - 0.5) * 0.72 : mix(-0.88, 0.88, random()),
                0,
                clustered ? clusterCenter[1] + (random() - 0.5) * 0.70 : mix(-0.88, 0.88, random()),
            ];
            candidate[0] = Math.max(-0.92, Math.min(0.92, candidate[0]));
            candidate[2] = Math.max(-0.92, Math.min(0.92, candidate[2]));
            const nearest = points.length === 0 ? 1 : Math.min(...points.map((point) => distance2(candidate, point.center)));
            const edge = Math.min(0.92 - Math.abs(candidate[0]), 0.92 - Math.abs(candidate[2]));
            const score = nearest + edge * 0.025 + random() * 0.004;
            if (score > bestScore && (points.length < 2 || nearest >= minimum ** 2 * 0.72)) {
                best = candidate;
                bestScore = score;
            }
        }
        const chosen = best ?? [mix(-0.85, 0.85, random()), 0, mix(-0.85, 0.85, random())];
        chosen[1] = mix(-0.06, 0.06, random());
        points.push(instance(definition, random, chosen, index, random() * Math.PI * 2));
    }
    return points;
};

const chainSamples = (definition, random, count, mode) => Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    const intervalWarp = Math.sin(t * Math.PI * 2.7 + 0.6) * 0.035 + (random() - 0.5) * 0.035;
    let center = [mix(-0.82, 0.82, t) + intervalWarp, 0, Math.sin(t * Math.PI * 1.45 + 0.4) * 0.18];
    let angle = Math.atan2(0.18 * 1.45 * Math.PI * Math.cos(t * Math.PI * 1.45 + 0.4), 1.64);
    if (mode === "parallel-band-array") {
        center = [mix(-0.78, 0.78, t) + intervalWarp, mix(-0.04, 0.04, random()), (random() - 0.5) * 0.12];
        angle = 0.5 * Math.PI + (random() - 0.5) * 0.035;
    } else if (mode === "wave-train") {
        center = [mix(-0.84, 0.84, t) + intervalWarp, Math.sin(t * Math.PI * 2.2) * 0.12, (random() - 0.5) * 0.16];
        angle = mix(-0.14, 0.14, random());
    } else if (mode === "layer-stack") {
        center = [(random() - 0.5) * 0.16, mix(-0.35, 0.35, t) + intervalWarp, (random() - 0.5) * 0.18];
        angle = mix(-0.22, 0.22, random());
    } else if (mode === "tapered-path") {
        center = [(random() - 0.5) * 0.08, -t * 0.82, (random() - 0.5) * 0.08];
        angle = mix(-0.12, 0.12, random());
    } else if (mode === "inflow-chain") {
        center = [mix(-0.88, 0.62, t) + intervalWarp, mix(0.06, 0.16, t), mix(-0.7, 0.42, t) + Math.sin(t * Math.PI) * 0.12];
        angle = 0.65 + mix(-0.09, 0.09, random());
    } else if (mode === "front-chain") {
        center = [mix(-0.9, 0.9, t) + intervalWarp, mix(-0.12, 0.02, random()), Math.cos((t - 0.5) * Math.PI) * 0.16];
        angle = mix(-0.12, 0.12, random());
    }
    return instance(definition, random, center, index, angle);
});

export const generateReferenceInstances = (definition, seed = hashText(definition.id)) => {
    const random = mulberry32(seed);
    const [minimumCount, maximumCount] = definition.placement.count;
    const count = Math.max(1, Math.round(mix(minimumCount, maximumCount, 0.61)));
    switch (definition.placement.method) {
        case "best-candidate-plane":
        case "chaotic-wave-patches":
        case "upper-wave-patches":
            return bestCandidatePlane(definition, random, count);
        case "curve-chain":
        case "paired-rib-chain":
        case "wave-train":
        case "parallel-band-array":
        case "layer-stack":
        case "tapered-path":
        case "inflow-chain":
        case "front-chain":
            return chainSamples(definition, random, count, definition.placement.method);
        case "single":
            return [instance(definition, random, [0, 0, 0], 0, 0)];
        default:
            throw new Error(`Unknown modifier placement method ${definition.placement.method}`);
    }
};

const coefficientVariation = (values) => {
    if (values.length < 2) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    if (!(mean > 0)) return 0;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance) / mean;
};
const topologyStatistics = (instances) => {
    const nearest = instances.map((current, currentIndex) => {
        let value = Infinity;
        for (let index = 0; index < instances.length; index += 1) {
            if (index === currentIndex) continue;
            value = Math.min(value, Math.sqrt(distance2(current.center, instances[index].center)));
        }
        return Number.isFinite(value) ? value : 0;
    });
    const sortedU = instances.map((entry) => entry.center[0]).sort((a, b) => a - b);
    const intervals = sortedU.slice(1).map((value, index) => value - sortedU[index]);
    const directionBins = new Array(8).fill(0);
    for (let index = 0; index < instances.length; index += 1) {
        let nearestIndex = -1;
        let nearestDistance = Infinity;
        for (let other = 0; other < instances.length; other += 1) {
            if (other === index) continue;
            const value = distance2(instances[index].center, instances[other].center);
            if (value < nearestDistance) { nearestDistance = value; nearestIndex = other; }
        }
        if (nearestIndex >= 0) {
            const dx = instances[nearestIndex].center[0] - instances[index].center[0];
            const dz = instances[nearestIndex].center[2] - instances[index].center[2];
            const angle = (Math.atan2(dz, dx) + Math.PI * 2) % (Math.PI * 2);
            directionBins[Math.floor(angle / (Math.PI * 2) * directionBins.length) % directionBins.length] += 1;
        }
    }
    let entropy = 0;
    for (const count of directionBins) {
        if (count === 0) continue;
        const probability = count / Math.max(1, instances.length);
        entropy -= probability * Math.log(probability);
    }
    entropy /= Math.log(directionBins.length);
    return {
        count: instances.length,
        nearestSpacingCoefficientVariation: Number(coefficientVariation(nearest).toFixed(6)),
        orderedIntervalCoefficientVariation: Number(coefficientVariation(intervals).toFixed(6)),
        nearestDirectionEntropy: Number(entropy.toFixed(6)),
    };
};

const stableJson = (value) => JSON.stringify(value, (_key, nested) => {
    if (!nested || typeof nested !== "object" || Array.isArray(nested)) return nested;
    return Object.fromEntries(Object.entries(nested).sort(([left], [right]) => left.localeCompare(right)));
});

export const generateCloudMorphologyModifierManifest = () => {
    const modifiers = CLOUD_MORPHOLOGY_MODIFIERS.map((definition) => {
        const referenceInstances = generateReferenceInstances(definition);
        return {
            ...definition,
            referenceVariation: {
                seed: hashText(definition.id),
                instances: referenceInstances,
                topology: topologyStatistics(referenceInstances),
            },
        };
    });
    const payloadChecksum = createHash("sha256").update(stableJson({
        operatorCodes: OPERATOR_CODES,
        blendCodes: BLEND_CODES,
        anchorCodes: ANCHOR_CODES,
        materialProfileCodes: MATERIAL_PROFILE_CODES,
        macroVolumeCodes: MACRO_VOLUME_CODES,
        logicalTopologyConnectivityCodes: LOGICAL_TOPOLOGY_CONNECTIVITY_CODES,
        logicalTopologyOwnerWordLayout: LOGICAL_TOPOLOGY_OWNER_WORD_LAYOUT,
        operatorParameterLayouts: OPERATOR_PARAMETER_LAYOUTS,
        flagBits: FLAG_BITS,
        modifiers,
    })).digest("hex");
    return {
        schema: CLOUD_MORPHOLOGY_MODIFIER_SCHEMA,
        version: CLOUD_MORPHOLOGY_MODIFIER_VERSION,
        generatorVersion: CLOUD_MORPHOLOGY_MODIFIER_GENERATOR_VERSION,
        coordinateSystems: {
            parentLocal: { u: "crosswind normalized by parent support", v: "altitude normalized by parent depth", w: "downwind normalized by parent support" },
            upperAtmosphere: { u: "east tangent metres", v: "radial altitude metres", w: "north tangent metres", curvature: "Earth spherical shell" },
        },
        compositionOrder: ["placement", "warp", "subtract", "smooth-union", "reuse", "optical"],
        operatorCodes: OPERATOR_CODES,
        blendCodes: BLEND_CODES,
        anchorCodes: ANCHOR_CODES,
        materialProfileCodes: MATERIAL_PROFILE_CODES,
        macroVolumeCodes: MACRO_VOLUME_CODES,
        logicalTopologyConnectivityCodes: LOGICAL_TOPOLOGY_CONNECTIVITY_CODES,
        logicalTopologyOwnerWordLayout: LOGICAL_TOPOLOGY_OWNER_WORD_LAYOUT,
        operatorParameterLayouts: OPERATOR_PARAMETER_LAYOUTS,
        flagBits: FLAG_BITS,
        rendererContract: {
            textureBinding: { group: 0, binding: 30, resource: "texture_2d<f32>", format: "rgba32float", sampleType: "unfilterable-float" },
            textureWidth: 256,
            maximumParentOwners: 36,
            maximumModifierRecords: 288,
            recordStrideTexels: 8,
            headerTexels: 37,
            texelLayout: {
                0: "header: recordCount, ownerCapacity, recordStrideTexels, manifestVersion",
                "1..36": "ownerRanges[parentOwner]: recordOffset, recordCount, droppedCount, bitcast-f32 logicalTopologyWord",
                record0: "meta: operatorCode, blendCode, anchorCode, flags",
                record1: "identity: parentOwnerIndex, bitcast-f32 deterministicSeed bits, intensity, lifecycle",
                record2: "centerSupport: centerEastKm, centerAltitudeKm, centerNorthKm, supportRadiusKm",
                record3: "axisU: xyz direction, halfExtentKm",
                record4: "axisV: xyz direction, halfExtentKm",
                record5: "axisW: xyz direction, halfExtentKm",
                record6: "shape0: operator-specific physical parameters",
                record7: "shape1: operator-specific spectrum/material parameters",
            },
            logicalTopologyOwnerWord: {
                transport: "raw-u32-bits-in-owner-range-alpha",
                layout: LOGICAL_TOPOLOGY_OWNER_WORD_LAYOUT,
                purpose: "Carries the same species-qualified exemplar used by macro-atlas and family-foundation selection into morphology evaluation.",
            },
            cirrusFibratusSubvoxelReconstruction:
                CLOUD_CIRRUS_FIBRATUS_SUBVOXEL_CONTRACT,
            requiredPasses: ["cloud-lighting-cache", "cloud-view-transport"],
            cpuResponsibilities: [
                "Compile modifiers in compositionOrder and assign each parent a contiguous record range.",
                "Inflate parent world bounds by finite additive/warp support before the interval prepass.",
                "Resolve named anchors from the same persistent CloudSystem owner used by light and view transport.",
                "Emit diagnostics instead of silently dropping dependencies or invalid genus/phase/lifecycle combinations.",
            ],
            shaderResponsibilities: [
                "Evaluate modifier coordinates in parent world/local space before base density detail synthesis.",
                "Apply true signed subtraction for lacunosus and cavum before lighting and transport.",
                "Use the same modified density, phase and optical depth in cloud lighting and view transport.",
                "Derive radiatus convergence only through the physical camera projection.",
                "Evaluate upper-atmosphere records on curved tangent shells with atmosphere transmittance to both source and observer.",
                "Treat the 48^3 Ci-fibratus volume as finite macro support and reconstruct its thin C2 fibre hierarchy in world kilometres inside the original signed boundary.",
                "Use one area-preserving analytic fibre kernel in view, exact-light, and footprint-filtered directional coupling density.",
            ],
        },
        modifiers,
        checksums: { algorithm: "SHA-256", payload: payloadChecksum },
        provenance: {
            sources: Object.entries(SOURCE_URLS).map(([id, url]) => ({ id, url })),
            excludedFromThisAsset: ["virga", "praecipitatio"],
            exclusionReason: "Falling hydrometeors are generated by the parent-owned hydrometeor system, not cloud morphology operators.",
        },
        limitations: [
            "This manifest is a CPU/GPU operator contract and contains no renderer integration by itself.",
            "Reference variations certify deterministic topology; production instances must be regenerated from each persistent parent seed.",
            "Nacreous diffraction and NLC albedo require optical material work in addition to morphology.",
        ],
    };
};

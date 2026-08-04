/**
 * Renderer-independent physical contracts for the five WMO Cirrus species and
 * four WMO Cirrocumulus species represented by Elements.
 *
 * Formation span and element diameter are intentionally separate. A broad Cc
 * sheet can cover tens of kilometres while its individual grains remain below
 * the WMO one-degree apparent-width discriminator. Keeping those scales
 * separate prevents a low-resolution owner volume from being enlarged until
 * every embedded cloudlet becomes an implausibly large puff.
 */

import type {
    CloudLifecycleStage,
    CloudPrecipitationKind,
} from "./cloud-state-map";

export const HIGH_CLOUD_SPECIES = [
    "cirrus-fibratus",
    "cirrus-uncinus",
    "cirrus-spissatus",
    "cirrus-castellanus",
    "cirrus-floccus",
    "cirrocumulus-stratiformis",
    "cirrocumulus-lenticularis",
    "cirrocumulus-castellanus",
    "cirrocumulus-floccus",
] as const;

export type HighCloudSpecies = (typeof HIGH_CLOUD_SPECIES)[number];
export type HighCloudGenus = "cirrus" | "cirrocumulus";

export type HighCloudElementKind =
    | "fibre-width"
    | "hook-head-width"
    | "dense-patch-width"
    | "turret-width"
    | "tuft-width"
    | "grain-width"
    | "lens-width";

export type HighCloudFormationMechanism =
    | "sheared-ice-advection"
    | "ice-growth-and-sedimentation"
    | "dense-ice-detrainment"
    | "elevated-convection"
    | "sublimating-convective-remnant"
    | "gravity-wave-condensation"
    | "orographic-wave-condensation";

export type HighCloudTopologyConnectivity =
    | "separate-fibres"
    | "hook-and-fallstreak"
    | "irregular-dense-patch"
    | "single-common-base"
    | "detached-tufts"
    | "extensive-broken-sheet"
    | "finite-wave-packet";

export type HighCloudOrigin =
    | "natural"
    | "cumulonimbus-genitus"
    | "orographic-wave"
    | "gravity-wave"
    | "castellanus-transition";

export type HighCloudOrganization =
    | "isolated"
    | "aperiodic-field"
    | "banded"
    | "common-base-line"
    | "extensive-sheet"
    | "finite-wave-packet";

export interface HighCloudAngularConstraint {
    /** WMO comparator applies only when the observed element is above this elevation. */
    readonly minimumViewElevationDegrees: number;
    /** Most individual Cc elements must be narrower than this value. */
    readonly maximumElementDiameterDegrees: number;
    readonly appliesToFormationEnvelope: false;
}

export interface HighCloudSpeciesDescriptor {
    readonly species: HighCloudSpecies;
    readonly genus: HighCloudGenus;
    readonly wmoAbbreviation: string;
    readonly wmoDefinition: string;
    readonly wmoSource: string;
    readonly physicalConstitutionSource: string;
    /** The dimension to which elementDiameterKm and the angular rule apply. */
    readonly elementKind: HighCloudElementKind;
    readonly elementDiameterKm: readonly [minimum: number, maximum: number];
    readonly formationSpanKm: readonly [minimum: number, maximum: number];
    readonly verticalAspect: readonly [minimum: number, maximum: number];
    readonly angularConstraint: HighCloudAngularConstraint | null;
    readonly requiredMorphology: readonly string[];
    readonly forbiddenMorphology: readonly string[];
    readonly opticalAppearance: {
        readonly predominantlyWhite: boolean;
        readonly permitsGreySourceFacingDensity: boolean;
        readonly permitsSourceObscuration: boolean;
        readonly expectedTransparency: "transparent" | "thin" | "variable-dense";
    };
}

const CIRRUS_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-cirrus.html";
const CIRROCUMULUS_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-cirrocumulus.html";

const ccAngularConstraint = (): HighCloudAngularConstraint => ({
    minimumViewElevationDegrees: 30,
    maximumElementDiameterDegrees: 1,
    appliesToFormationEnvelope: false,
});

export const HIGH_CLOUD_SPECIES_DESCRIPTORS = {
    "cirrus-fibratus": {
        species: "cirrus-fibratus",
        genus: "cirrus",
        wmoAbbreviation: "Ci fib",
        wmoDefinition: "Nearly straight or irregularly curved, fine white filaments without hooks or terminal tufts.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrus-fibratus-ci-fib.html",
        physicalConstitutionSource: CIRRUS_CONSTITUTION,
        elementKind: "fibre-width",
        elementDiameterKm: [0.015, 0.18],
        formationSpanKm: [4, 28],
        verticalAspect: [0.01, 0.09],
        angularConstraint: null,
        requiredMorphology: ["fine distinct fibres", "unequal taper", "shear-coherent curvature"],
        forbiddenMorphology: ["terminal hook", "rounded terminal tuft", "parallel contrail comb", "shared oval envelope"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "transparent",
        },
    },
    "cirrus-uncinus": {
        species: "cirrus-uncinus",
        genus: "cirrus",
        wmoAbbreviation: "Ci unc",
        wmoDefinition: "Comma-shaped Cirrus ending aloft in a hook or tuft with an attached sedimenting trail.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrus-uncinus-ci-unc.html",
        physicalConstitutionSource: CIRRUS_CONSTITUTION,
        elementKind: "hook-head-width",
        elementDiameterKm: [0.12, 1.2],
        formationSpanKm: [4, 32],
        verticalAspect: [0.02, 0.16],
        angularConstraint: null,
        requiredMorphology: ["hook or comma head", "continuous tapered fallstreak", "shear-curved trail"],
        forbiddenMorphology: ["grey core", "detached circular head", "blunt fallstreak termination", "identical hook repetition"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "transparent",
        },
    },
    "cirrus-spissatus": {
        species: "cirrus-spissatus",
        genus: "cirrus",
        wmoAbbreviation: "Ci spi",
        wmoDefinition: "Optically dense Cirrus patches that may appear grey toward the source and can veil or hide it.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrus-spissatus-ci-spi.html",
        physicalConstitutionSource: CIRRUS_CONSTITUTION,
        elementKind: "dense-patch-width",
        elementDiameterKm: [0.8, 12],
        formationSpanKm: [3, 36],
        verticalAspect: [0.04, 0.22],
        angularConstraint: null,
        requiredMorphology: ["irregular dense interior", "multiscale fibrous perimeter", "advected asymmetry"],
        forbiddenMorphology: ["smooth ellipsoid ribbon", "uniform slab", "screen-space solar darkening"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: true,
            permitsSourceObscuration: true,
            expectedTransparency: "variable-dense",
        },
    },
    "cirrus-castellanus": {
        species: "cirrus-castellanus",
        genus: "cirrus",
        wmoAbbreviation: "Ci cas",
        wmoDefinition: "Small rounded and fibrous turrets or masses rising from a common base in a crenellated line.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrus-castellanus-ci-cas.html",
        physicalConstitutionSource: CIRRUS_CONSTITUTION,
        elementKind: "turret-width",
        elementDiameterKm: [0.2, 1.8],
        formationSpanKm: [1.2, 12],
        verticalAspect: [0.25, 0.9],
        angularConstraint: null,
        requiredMorphology: ["shared shallow base", "unequal fibrous turrets", "crenellated upper silhouette"],
        forbiddenMorphology: ["equal capsule row", "detached identical puffs", "rectangular lattice"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
    "cirrus-floccus": {
        species: "cirrus-floccus",
        genus: "cirrus",
        wmoAbbreviation: "Ci flo",
        wmoDefinition: "Isolated small rounded ice tufts, often with ragged bases and attached trails.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrus-floccus-ci-flo.html",
        physicalConstitutionSource: CIRRUS_CONSTITUTION,
        elementKind: "tuft-width",
        elementDiameterKm: [0.16, 1.5],
        formationSpanKm: [1, 14],
        verticalAspect: [0.25, 1],
        angularConstraint: null,
        requiredMorphology: ["detached unequal tufts", "ragged sublimating underside", "optional tapered trail"],
        forbiddenMorphology: ["smooth oval crown", "common continuous base", "uniform bead row"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
    "cirrocumulus-stratiformis": {
        species: "cirrocumulus-stratiformis",
        genus: "cirrocumulus",
        wmoAbbreviation: "Cc str",
        wmoDefinition: "A relatively extensive thin sheet or layer of very small grains or ripples, sometimes with breaks.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrocumulus-stratiformis-cc-str.html",
        physicalConstitutionSource: CIRROCUMULUS_CONSTITUTION,
        elementKind: "grain-width",
        elementDiameterKm: [0.035, 0.25],
        formationSpanKm: [4, 60],
        verticalAspect: [0.08, 0.38],
        angularConstraint: ccAngularConstraint(),
        requiredMorphology: ["extensive finite sheet", "sub-degree grains or ripples", "irregular breaks", "little or no shading"],
        forbiddenMorphology: ["marine closed-cell wall", "disconnected giant puff islands", "regular dot grid", "grey undersides"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
    "cirrocumulus-lenticularis": {
        species: "cirrocumulus-lenticularis",
        genus: "cirrocumulus",
        wmoAbbreviation: "Cc len",
        wmoDefinition: "Isolated elongated lens- or almond-shaped patches with defined, mostly smooth outlines.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrocumulus-lenticularis-cc-len.html",
        physicalConstitutionSource: CIRROCUMULUS_CONSTITUTION,
        elementKind: "lens-width",
        elementDiameterKm: [0.05, 0.28],
        formationSpanKm: [1.5, 24],
        verticalAspect: [0.025, 0.18],
        angularConstraint: ccAngularConstraint(),
        requiredMorphology: ["finite stationary wave support", "elongated defined outline", "unequal isolated or stacked crests", "very white body"],
        forbiddenMorphology: ["identical saucer train", "global periodic band", "rough turbulent edge", "grey core"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
    "cirrocumulus-castellanus": {
        species: "cirrocumulus-castellanus",
        genus: "cirrocumulus",
        wmoAbbreviation: "Cc cas",
        wmoDefinition: "Sub-degree small turrets rising from a common horizontal base and indicating instability at cloud level.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrocumulus-castellanus-cc-cas.html",
        physicalConstitutionSource: CIRROCUMULUS_CONSTITUTION,
        elementKind: "turret-width",
        elementDiameterKm: [0.035, 0.22],
        formationSpanKm: [0.8, 10],
        verticalAspect: [0.28, 0.9],
        angularConstraint: ccAngularConstraint(),
        requiredMorphology: ["one shallow common base", "sub-degree unequal turrets", "localized instability"],
        forbiddenMorphology: ["three repeated base rows", "equal capsule turrets", "detached cumulus-scale puffs"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
    "cirrocumulus-floccus": {
        species: "cirrocumulus-floccus",
        genus: "cirrocumulus",
        wmoAbbreviation: "Cc flo",
        wmoDefinition: "Very small cumuliform tufts with ragged lower parts, often formed as a castellanus base dissipates.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrocumulus-floccus-cc-flo.html",
        physicalConstitutionSource: CIRROCUMULUS_CONSTITUTION,
        elementKind: "tuft-width",
        elementDiameterKm: [0.03, 0.2],
        formationSpanKm: [0.8, 12],
        verticalAspect: [0.22, 0.85],
        angularConstraint: ccAngularConstraint(),
        requiredMorphology: ["sub-degree detached tufts", "ragged eroded base", "castellanus-remnant continuity", "optional virga"],
        forbiddenMorphology: ["smooth ovals", "uniform Poisson beads", "retained continuous base", "grey shading"],
        opticalAppearance: {
            predominantlyWhite: true,
            permitsGreySourceFacingDensity: false,
            permitsSourceObscuration: false,
            expectedTransparency: "thin",
        },
    },
} as const satisfies Record<HighCloudSpecies, HighCloudSpeciesDescriptor>;

export interface HighCloudTopologyVariantDescriptor {
    readonly id: string;
    readonly label: string;
    readonly mechanism: HighCloudFormationMechanism;
    readonly connectivity: HighCloudTopologyConnectivity;
    readonly macroElementCount: readonly [minimum: number, maximum: number];
    readonly hierarchyLevels: readonly [minimum: number, maximum: number];
    readonly formationAspectRatio: readonly [minimum: number, maximum: number];
    /** Required coefficient of variation in nearest-element spacing. */
    readonly minimumSpacingVariation: number;
    /** Maximum bilateral similarity of the macro silhouette. */
    readonly maximumMirrorSimilarity: number;
    readonly origins: readonly HighCloudOrigin[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly cues: readonly string[];
}

const variant = (
    value: HighCloudTopologyVariantDescriptor,
): HighCloudTopologyVariantDescriptor => value;

/**
 * Macroform choices, not random noise seeds. Each variant is a physically
 * distinct formation state that may receive independent stochastic detail.
 */
export const HIGH_CLOUD_TOPOLOGY_VARIANTS = {
    "cirrus-fibratus": [
        variant({ id: "straight-separated", label: "Straight separated fibres", mechanism: "sheared-ice-advection", connectivity: "separate-fibres", macroElementCount: [5, 12], hierarchyLevels: [3, 5], formationAspectRatio: [6, 18], minimumSpacingVariation: 0.28, maximumMirrorSimilarity: 0.62, origins: ["natural"], lifecycleStages: ["growing", "mature"], cues: ["fine taper", "unequal length", "no hook"] }),
        variant({ id: "irregular-curved", label: "Irregular curved fibres", mechanism: "sheared-ice-advection", connectivity: "separate-fibres", macroElementCount: [4, 10], hierarchyLevels: [3, 5], formationAspectRatio: [4, 14], minimumSpacingVariation: 0.34, maximumMirrorSimilarity: 0.55, origins: ["natural"], lifecycleStages: ["mature", "decaying"], cues: ["variable curvature", "split fibres", "open negative space"] }),
        variant({ id: "convergent-bands", label: "World-parallel perspective bands", mechanism: "sheared-ice-advection", connectivity: "separate-fibres", macroElementCount: [6, 14], hierarchyLevels: [3, 4], formationAspectRatio: [9, 24], minimumSpacingVariation: 0.22, maximumMirrorSimilarity: 0.66, origins: ["natural"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["world-space parallelism", "camera-only convergence", "band breaks"] }),
        variant({ id: "entangled-shear", label: "Entangled sheared fibres", mechanism: "sheared-ice-advection", connectivity: "separate-fibres", macroElementCount: [7, 16], hierarchyLevels: [4, 5], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.48, origins: ["natural"], lifecycleStages: ["mature", "decaying"], cues: ["crossing depth", "unequal branches", "aperiodic envelope"] }),
    ],
    "cirrus-uncinus": [
        variant({ id: "single-mare-tail", label: "Single mare's tail", mechanism: "ice-growth-and-sedimentation", connectivity: "hook-and-fallstreak", macroElementCount: [1, 2], hierarchyLevels: [4, 5], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.42, origins: ["natural"], lifecycleStages: ["mature", "precipitating"], cues: ["hooked head", "long tapered fallstreak", "vertical size sorting"] }),
        variant({ id: "paired-sheared-hooks", label: "Paired unequal sheared hooks", mechanism: "ice-growth-and-sedimentation", connectivity: "hook-and-fallstreak", macroElementCount: [2, 4], hierarchyLevels: [4, 5], formationAspectRatio: [4, 13], minimumSpacingVariation: 0.32, maximumMirrorSimilarity: 0.48, origins: ["natural"], lifecycleStages: ["growing", "mature", "precipitating"], cues: ["different hook handedness", "nonparallel trails", "unequal heads"] }),
        variant({ id: "deep-fallstreak-cascade", label: "Deep fallstreak cascade", mechanism: "ice-growth-and-sedimentation", connectivity: "hook-and-fallstreak", macroElementCount: [2, 5], hierarchyLevels: [4, 6], formationAspectRatio: [2, 8], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.4, origins: ["natural"], lifecycleStages: ["precipitating", "decaying"], cues: ["layered sedimentation", "curved trail depth", "sublimating termini"] }),
        variant({ id: "wind-shifted-comma-field", label: "Wind-shifted comma field", mechanism: "ice-growth-and-sedimentation", connectivity: "hook-and-fallstreak", macroElementCount: [3, 7], hierarchyLevels: [3, 5], formationAspectRatio: [5, 16], minimumSpacingVariation: 0.35, maximumMirrorSimilarity: 0.5, origins: ["natural"], lifecycleStages: ["mature", "precipitating"], cues: ["shared shear field", "individual hook phase", "sparse support"] }),
    ],
    "cirrus-spissatus": [
        variant({ id: "natural-irregular-patch", label: "Natural dense irregular patch", mechanism: "dense-ice-detrainment", connectivity: "irregular-dense-patch", macroElementCount: [1, 3], hierarchyLevels: [4, 6], formationAspectRatio: [1.8, 5], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.5, origins: ["natural"], lifecycleStages: ["mature", "decaying"], cues: ["dense asymmetric body", "fibrous perimeter", "variable transmission"] }),
        variant({ id: "cumulonimbus-remnant", label: "Cumulonimbus-detached remnant", mechanism: "dense-ice-detrainment", connectivity: "irregular-dense-patch", macroElementCount: [1, 4], hierarchyLevels: [4, 6], formationAspectRatio: [2.5, 8], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.46, origins: ["cumulonimbus-genitus"], lifecycleStages: ["glaciating", "mature", "decaying"], cues: ["anvil-origin shear", "dense interior", "frayed downwind edge"] }),
        variant({ id: "sheared-multipatch", label: "Sheared multi-patch field", mechanism: "dense-ice-detrainment", connectivity: "irregular-dense-patch", macroElementCount: [3, 7], hierarchyLevels: [3, 5], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.45, origins: ["natural", "cumulonimbus-genitus"], lifecycleStages: ["mature", "decaying"], cues: ["correlated patch shear", "unequal dense islands", "fibrous bridges"] }),
        variant({ id: "sublimating-dense-fragment", label: "Sublimating dense fragment", mechanism: "sublimating-convective-remnant", connectivity: "irregular-dense-patch", macroElementCount: [1, 4], hierarchyLevels: [4, 6], formationAspectRatio: [1.4, 4], minimumSpacingVariation: 0.44, maximumMirrorSimilarity: 0.38, origins: ["natural", "cumulonimbus-genitus"], lifecycleStages: ["decaying"], cues: ["eroded holes", "uneven optical core", "falling fibrous debris"] }),
    ],
    "cirrus-castellanus": [
        variant({ id: "single-crenellated-base", label: "Single crenellated common base", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [3, 7], hierarchyLevels: [3, 5], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.58, origins: ["natural"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["one shared base", "unequal turret tops", "fibrous shoulders"] }),
        variant({ id: "broken-castle-line", label: "Broken castle line", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [4, 9], hierarchyLevels: [3, 5], formationAspectRatio: [5, 14], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.48, origins: ["natural"], lifecycleStages: ["growing", "mature"], cues: ["interrupted base", "height progression", "nonuniform crenellation"] }),
        variant({ id: "sheared-turret-band", label: "Sheared turret band", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [3, 8], hierarchyLevels: [4, 5], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.34, maximumMirrorSimilarity: 0.5, origins: ["natural"], lifecycleStages: ["growing", "mature"], cues: ["tilted fibrous turrets", "shared shear direction", "unequal spacing"] }),
        variant({ id: "localized-turret-cluster", label: "Localized turret cluster", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [3, 6], hierarchyLevels: [4, 6], formationAspectRatio: [1.8, 5], minimumSpacingVariation: 0.45, maximumMirrorSimilarity: 0.4, origins: ["natural"], lifecycleStages: ["incipient", "growing"], cues: ["localized instability", "clustered but connected base", "asymmetric crown"] }),
    ],
    "cirrus-floccus": [
        variant({ id: "isolated-ragged-tufts", label: "Isolated ragged tufts", mechanism: "sublimating-convective-remnant", connectivity: "detached-tufts", macroElementCount: [3, 9], hierarchyLevels: [3, 5], formationAspectRatio: [1.5, 5], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.42, origins: ["natural"], lifecycleStages: ["mature", "decaying"], cues: ["unequal tuft mass", "ragged underside", "open spacing"] }),
        variant({ id: "virga-bearing-tufts", label: "Virga-bearing tuft field", mechanism: "ice-growth-and-sedimentation", connectivity: "detached-tufts", macroElementCount: [2, 7], hierarchyLevels: [4, 6], formationAspectRatio: [2, 7], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.4, origins: ["natural"], lifecycleStages: ["precipitating", "decaying"], cues: ["short tapered trails", "sublimating lower edge", "size-sorted ice"] }),
        variant({ id: "sheared-floccus-chain", label: "Sheared floccus chain", mechanism: "sublimating-convective-remnant", connectivity: "detached-tufts", macroElementCount: [4, 11], hierarchyLevels: [3, 5], formationAspectRatio: [4, 13], minimumSpacingVariation: 0.35, maximumMirrorSimilarity: 0.46, origins: ["natural"], lifecycleStages: ["mature", "decaying"], cues: ["coherent advection", "unequal tuft erosion", "nonperiodic gaps"] }),
        variant({ id: "dissipating-cluster", label: "Dissipating tuft cluster", mechanism: "sublimating-convective-remnant", connectivity: "detached-tufts", macroElementCount: [5, 13], hierarchyLevels: [4, 6], formationAspectRatio: [1.2, 4], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.36, origins: ["natural", "castellanus-transition"], lifecycleStages: ["decaying"], cues: ["fragment hierarchy", "perforated condensate", "fading trails"] }),
    ],
    "cirrocumulus-stratiformis": [
        variant({ id: "extensive-ripple-sheet", label: "Extensive irregular ripple sheet", mechanism: "gravity-wave-condensation", connectivity: "extensive-broken-sheet", macroElementCount: [24, 80], hierarchyLevels: [3, 5], formationAspectRatio: [1.5, 5], minimumSpacingVariation: 0.24, maximumMirrorSimilarity: 0.68, origins: ["gravity-wave", "natural"], lifecycleStages: ["growing", "mature"], cues: ["continuous moisture support", "sub-degree ripples", "aperiodic wavelength drift"] }),
        variant({ id: "broken-grain-sheet", label: "Broken granular sheet", mechanism: "gravity-wave-condensation", connectivity: "extensive-broken-sheet", macroElementCount: [18, 64], hierarchyLevels: [3, 5], formationAspectRatio: [1.2, 4], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.55, origins: ["gravity-wave", "natural"], lifecycleStages: ["mature", "decaying"], cues: ["irregular breaks", "coherent layer", "unequal grains"] }),
        variant({ id: "finite-ripple-packet", label: "Finite ripple packet", mechanism: "gravity-wave-condensation", connectivity: "finite-wave-packet", macroElementCount: [12, 42], hierarchyLevels: [3, 4], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.28, maximumMirrorSimilarity: 0.58, origins: ["gravity-wave"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["finite amplitude envelope", "phase-coherent ripples", "natural packet termination"] }),
        variant({ id: "crossed-undulation-sheet", label: "Crossed undulation sheet", mechanism: "gravity-wave-condensation", connectivity: "extensive-broken-sheet", macroElementCount: [28, 90], hierarchyLevels: [4, 5], formationAspectRatio: [1.1, 3], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.48, origins: ["gravity-wave", "natural"], lifecycleStages: ["mature", "decaying"], cues: ["two unequal wave vectors", "aperiodic mesh", "irregular cell closure"] }),
    ],
    "cirrocumulus-lenticularis": [
        variant({ id: "isolated-wave-lens", label: "Isolated wave lens", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-packet", macroElementCount: [1, 2], hierarchyLevels: [2, 4], formationAspectRatio: [4, 14], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.72, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["single defined lens", "stationary support", "asymmetric taper"] }),
        variant({ id: "unequal-paired-lenses", label: "Unequal paired lenses", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-packet", macroElementCount: [2, 3], hierarchyLevels: [2, 4], formationAspectRatio: [5, 16], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.6, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["growing", "mature"], cues: ["unequal crest width", "shared wavelength", "finite packet"] }),
        variant({ id: "stacked-wave-lenses", label: "Vertically stacked wave lenses", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-packet", macroElementCount: [2, 5], hierarchyLevels: [3, 5], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.26, maximumMirrorSimilarity: 0.58, origins: ["orographic-wave"], lifecycleStages: ["mature"], cues: ["unequal vertical stack", "coherent phase", "smooth outlined crests"] }),
        variant({ id: "dissipating-wave-packet", label: "Dissipating lens packet", mechanism: "gravity-wave-condensation", connectivity: "finite-wave-packet", macroElementCount: [2, 4], hierarchyLevels: [3, 5], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.44, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["decaying"], cues: ["unequal edge sublimation", "broken downstream crest", "preserved wave phase"] }),
    ],
    "cirrocumulus-castellanus": [
        variant({ id: "single-tiny-common-base", label: "Single tiny common-base line", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [4, 10], hierarchyLevels: [3, 5], formationAspectRatio: [3, 9], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.58, origins: ["natural"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["one shallow base", "sub-degree turrets", "unequal vertical growth"] }),
        variant({ id: "short-wave-castle", label: "Short-wave castle packet", mechanism: "gravity-wave-condensation", connectivity: "single-common-base", macroElementCount: [3, 8], hierarchyLevels: [3, 5], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.28, maximumMirrorSimilarity: 0.62, origins: ["gravity-wave", "natural"], lifecycleStages: ["growing", "mature"], cues: ["wave-localized instability", "shared base phase", "height modulation"] }),
        variant({ id: "broken-common-base", label: "Broken common-base formation", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [5, 12], hierarchyLevels: [4, 5], formationAspectRatio: [4, 11], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.44, origins: ["natural"], lifecycleStages: ["mature"], cues: ["narrow base gaps", "correlated turrets", "non-grid spacing"] }),
        variant({ id: "localized-growing-turrets", label: "Localized growing turret packet", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [3, 6], hierarchyLevels: [4, 6], formationAspectRatio: [1.5, 4], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.38, origins: ["natural"], lifecycleStages: ["incipient", "growing"], cues: ["localized instability", "asymmetric growth", "one condensate base"] }),
    ],
    "cirrocumulus-floccus": [
        variant({ id: "eroded-castellanus-remnant", label: "Eroded castellanus remnant", mechanism: "sublimating-convective-remnant", connectivity: "detached-tufts", macroElementCount: [4, 11], hierarchyLevels: [3, 5], formationAspectRatio: [3, 9], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.46, origins: ["castellanus-transition"], lifecycleStages: ["mature", "decaying"], cues: ["lost common base", "retained formation correlation", "ragged lower parts"] }),
        variant({ id: "isolated-tiny-tufts", label: "Isolated tiny ragged tufts", mechanism: "sublimating-convective-remnant", connectivity: "detached-tufts", macroElementCount: [5, 14], hierarchyLevels: [3, 5], formationAspectRatio: [1.5, 5], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.4, origins: ["natural", "castellanus-transition"], lifecycleStages: ["mature", "decaying"], cues: ["sub-degree tufts", "ragged base", "aperiodic gaps"] }),
        variant({ id: "virga-tuft-packet", label: "Virga-bearing tiny tuft packet", mechanism: "ice-growth-and-sedimentation", connectivity: "detached-tufts", macroElementCount: [3, 10], hierarchyLevels: [4, 6], formationAspectRatio: [2, 7], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.4, origins: ["natural", "castellanus-transition"], lifecycleStages: ["precipitating", "decaying"], cues: ["short tapered virga", "size-sorted ice", "sublimating underside"] }),
        variant({ id: "dissipating-wave-tufts", label: "Dissipating wave-phase tufts", mechanism: "gravity-wave-condensation", connectivity: "detached-tufts", macroElementCount: [6, 16], hierarchyLevels: [4, 5], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.42, origins: ["gravity-wave", "castellanus-transition"], lifecycleStages: ["decaying"], cues: ["fading wave correlation", "unequal remnant mass", "finite packet"] }),
    ],
} as const satisfies Record<
    HighCloudSpecies,
    readonly HighCloudTopologyVariantDescriptor[]
>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;

const assertFinite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};

/** Exact angular diameter of a finite element viewed at its centre range. */
export const highCloudAngularDiameterDegrees = (
    elementDiameterKm: number,
    slantRangeKm: number,
) => {
    assertFinite("element diameter", elementDiameterKm);
    assertFinite("slant range", slantRangeKm);
    if (!(elementDiameterKm > 0)) throw new Error("Element diameter must be positive");
    if (!(slantRangeKm > 0)) throw new Error("Slant range must be positive");
    return 2 * Math.atan(elementDiameterKm / (2 * slantRangeKm)) * 180 / Math.PI;
};

export const highCloudMaximumElementDiameterKm = (
    species: HighCloudSpecies,
    slantRangeKm: number,
    viewElevationDegrees: number,
) => {
    assertFinite("view elevation", viewElevationDegrees);
    assertFinite("slant range", slantRangeKm);
    if (!(slantRangeKm > 0)) throw new Error("Slant range must be positive");
    const descriptor = HIGH_CLOUD_SPECIES_DESCRIPTORS[species];
    const angular = descriptor.angularConstraint;
    if (!angular || viewElevationDegrees < angular.minimumViewElevationDegrees) {
        return descriptor.elementDiameterKm[1];
    }
    const angularLimitRadians = angular.maximumElementDiameterDegrees * Math.PI / 180;
    return Math.min(
        descriptor.elementDiameterKm[1],
        2 * slantRangeKm * Math.tan(angularLimitRadians * 0.5),
    );
};

export const highCloudMinimumSlantRangeKm = (
    species: HighCloudSpecies,
    elementDiameterKm: number,
    viewElevationDegrees: number,
) => {
    assertFinite("element diameter", elementDiameterKm);
    assertFinite("view elevation", viewElevationDegrees);
    if (!(elementDiameterKm > 0)) throw new Error("Element diameter must be positive");
    const angular = HIGH_CLOUD_SPECIES_DESCRIPTORS[species].angularConstraint;
    if (!angular || viewElevationDegrees < angular.minimumViewElevationDegrees) return 0;
    return elementDiameterKm /
        (2 * Math.tan(angular.maximumElementDiameterDegrees * Math.PI / 360));
};

export interface HighCloudProjectionInput {
    readonly species: HighCloudSpecies;
    readonly elementDiameterKm: number;
    readonly formationSpanKm: number;
    readonly slantRangeKm: number;
    readonly viewElevationDegrees: number;
}

export interface HighCloudProjectionQualification {
    readonly valid: boolean;
    readonly angularDiameterDegrees: number;
    readonly maximumElementDiameterKm: number;
    readonly violations: readonly string[];
}

export const qualifyHighCloudProjection = (
    input: HighCloudProjectionInput,
): HighCloudProjectionQualification => {
    assertFinite("formation span", input.formationSpanKm);
    assertFinite("view elevation", input.viewElevationDegrees);
    const descriptor = HIGH_CLOUD_SPECIES_DESCRIPTORS[input.species];
    const angularDiameterDegrees = highCloudAngularDiameterDegrees(
        input.elementDiameterKm,
        input.slantRangeKm,
    );
    const maximumElementDiameterKm = highCloudMaximumElementDiameterKm(
        input.species,
        input.slantRangeKm,
        input.viewElevationDegrees,
    );
    const violations: string[] = [];
    if (input.elementDiameterKm < descriptor.elementDiameterKm[0] ||
        input.elementDiameterKm > descriptor.elementDiameterKm[1]) {
        violations.push("element-diameter-outside-species-contract");
    }
    if (input.formationSpanKm < descriptor.formationSpanKm[0] ||
        input.formationSpanKm > descriptor.formationSpanKm[1]) {
        violations.push("formation-span-outside-species-contract");
    }
    const angular = descriptor.angularConstraint;
    if (angular && input.viewElevationDegrees >= angular.minimumViewElevationDegrees &&
        angularDiameterDegrees >= angular.maximumElementDiameterDegrees) {
        violations.push("cirrocumulus-element-is-not-sub-degree");
    }
    return {
        valid: violations.length === 0,
        angularDiameterDegrees,
        maximumElementDiameterKm,
        violations,
    };
};

export type HighCloudIceHabit =
    | "column"
    | "plate"
    | "bullet-rosette"
    | "aggregate"
    | "polycrystal";

export type HighCloudIceHabitFractions = Readonly<Record<HighCloudIceHabit, number>>;
export type HighCloudRoughnessClass = "smooth" | "moderate" | "severe";

interface HighCloudMicrophysicsSpeciesProfile {
    readonly topRadiusMicrons: number;
    readonly baseRadiusMicrons: number;
    readonly trailRadiusGainMicrons: number;
    readonly iceFraction: readonly [base: number, top: number];
    readonly liquidRadiusMicrons: readonly [base: number, top: number];
    readonly topHabits: HighCloudIceHabitFractions;
    readonly baseHabits: HighCloudIceHabitFractions;
    readonly roughness: number;
    readonly sedimentation: number;
    readonly condensate: number;
}

const habits = (
    column: number,
    plate: number,
    bulletRosette: number,
    aggregate: number,
    polycrystal: number,
): HighCloudIceHabitFractions => ({
    column,
    plate,
    "bullet-rosette": bulletRosette,
    aggregate,
    polycrystal,
});

export const HIGH_CLOUD_MICROPHYSICS_PROFILES = {
    "cirrus-fibratus": { topRadiusMicrons: 18, baseRadiusMicrons: 42, trailRadiusGainMicrons: 18, iceFraction: [0.995, 1], liquidRadiusMicrons: [8, 7], topHabits: habits(0.34, 0.12, 0.31, 0.08, 0.15), baseHabits: habits(0.28, 0.08, 0.2, 0.22, 0.22), roughness: 0.42, sedimentation: 0.34, condensate: 0.34 },
    "cirrus-uncinus": { topRadiusMicrons: 20, baseRadiusMicrons: 58, trailRadiusGainMicrons: 38, iceFraction: [0.998, 1], liquidRadiusMicrons: [8, 7], topHabits: habits(0.36, 0.1, 0.32, 0.07, 0.15), baseHabits: habits(0.18, 0.05, 0.16, 0.38, 0.23), roughness: 0.46, sedimentation: 0.72, condensate: 0.4 },
    "cirrus-spissatus": { topRadiusMicrons: 28, baseRadiusMicrons: 72, trailRadiusGainMicrons: 28, iceFraction: [0.998, 1], liquidRadiusMicrons: [8, 7], topHabits: habits(0.2, 0.08, 0.27, 0.22, 0.23), baseHabits: habits(0.1, 0.04, 0.12, 0.5, 0.24), roughness: 0.62, sedimentation: 0.48, condensate: 0.82 },
    "cirrus-castellanus": { topRadiusMicrons: 19, baseRadiusMicrons: 46, trailRadiusGainMicrons: 18, iceFraction: [0.985, 1], liquidRadiusMicrons: [9, 7], topHabits: habits(0.3, 0.12, 0.34, 0.09, 0.15), baseHabits: habits(0.2, 0.08, 0.22, 0.28, 0.22), roughness: 0.5, sedimentation: 0.32, condensate: 0.56 },
    "cirrus-floccus": { topRadiusMicrons: 22, baseRadiusMicrons: 62, trailRadiusGainMicrons: 30, iceFraction: [0.994, 1], liquidRadiusMicrons: [8, 7], topHabits: habits(0.24, 0.08, 0.3, 0.18, 0.2), baseHabits: habits(0.13, 0.04, 0.14, 0.47, 0.22), roughness: 0.6, sedimentation: 0.62, condensate: 0.48 },
    "cirrocumulus-stratiformis": { topRadiusMicrons: 15, baseRadiusMicrons: 30, trailRadiusGainMicrons: 8, iceFraction: [0.92, 0.99], liquidRadiusMicrons: [11, 8], topHabits: habits(0.3, 0.17, 0.3, 0.07, 0.16), baseHabits: habits(0.25, 0.14, 0.24, 0.16, 0.21), roughness: 0.34, sedimentation: 0.22, condensate: 0.31 },
    "cirrocumulus-lenticularis": { topRadiusMicrons: 13, baseRadiusMicrons: 25, trailRadiusGainMicrons: 4, iceFraction: [0.9, 0.985], liquidRadiusMicrons: [10, 8], topHabits: habits(0.28, 0.24, 0.25, 0.05, 0.18), baseHabits: habits(0.26, 0.22, 0.22, 0.09, 0.21), roughness: 0.2, sedimentation: 0.12, condensate: 0.27 },
    "cirrocumulus-castellanus": { topRadiusMicrons: 15, baseRadiusMicrons: 34, trailRadiusGainMicrons: 9, iceFraction: [0.91, 0.99], liquidRadiusMicrons: [12, 8], topHabits: habits(0.32, 0.15, 0.31, 0.07, 0.15), baseHabits: habits(0.24, 0.12, 0.24, 0.19, 0.21), roughness: 0.38, sedimentation: 0.26, condensate: 0.36 },
    "cirrocumulus-floccus": { topRadiusMicrons: 16, baseRadiusMicrons: 38, trailRadiusGainMicrons: 14, iceFraction: [0.93, 0.995], liquidRadiusMicrons: [11, 8], topHabits: habits(0.28, 0.12, 0.3, 0.12, 0.18), baseHabits: habits(0.18, 0.08, 0.18, 0.34, 0.22), roughness: 0.5, sedimentation: 0.44, condensate: 0.33 },
} as const satisfies Record<HighCloudSpecies, HighCloudMicrophysicsSpeciesProfile>;

export interface HighCloudLocalMicrophysicsInput {
    readonly species: HighCloudSpecies;
    /** Zero at cloud base or trail terminus, one at cloud top. */
    readonly normalizedHeight: number;
    /** Local membership in a sedimenting trail rather than the source tuft. */
    readonly trailFraction: number;
    /** Local protected/dense condensate membership. */
    readonly denseCoreFraction: number;
    /** Local gravity-wave crest support; relevant to Cc but harmless for Ci. */
    readonly waveCrestFraction: number;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: HighCloudOrigin;
    readonly temperatureKelvin: number;
    readonly turbulenceDissipation: number;
}

export interface HighCloudLocalMicrophysics {
    readonly iceEffectiveRadiusMicrons: number;
    readonly liquidEffectiveRadiusMicrons: number;
    readonly iceFraction: number;
    readonly habitFractions: HighCloudIceHabitFractions;
    readonly surfaceRoughness: number;
    readonly roughnessClass: HighCloudRoughnessClass;
    readonly sedimentationWeight: number;
    readonly terminalVelocityMetresPerSecond: number;
    readonly relativeCondensate: number;
    readonly sublimationFraction: number;
}

const lifecycleErosion = (stage: CloudLifecycleStage) => {
    switch (stage) {
        case "incipient": return 0.08;
        case "growing": return 0.02;
        case "mature": return 0;
        case "glaciating": return 0.08;
        case "precipitating": return 0.14;
        case "decaying": return 0.34;
    }
};

const normalizeHabits = (
    values: Record<HighCloudIceHabit, number>,
): HighCloudIceHabitFractions => {
    const sum = Object.values(values).reduce((total, value) => total + value, 0);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [
        key,
        value / Math.max(1e-9, sum),
    ])) as unknown as HighCloudIceHabitFractions;
};

export const sampleHighCloudLocalMicrophysics = (
    input: HighCloudLocalMicrophysicsInput,
): HighCloudLocalMicrophysics => {
    for (const [name, value] of Object.entries({
        normalizedHeight: input.normalizedHeight,
        trailFraction: input.trailFraction,
        denseCoreFraction: input.denseCoreFraction,
        waveCrestFraction: input.waveCrestFraction,
        temperatureKelvin: input.temperatureKelvin,
        turbulenceDissipation: input.turbulenceDissipation,
    })) assertFinite(name, value);
    if (!(input.temperatureKelvin > 0)) {
        throw new Error("temperatureKelvin must be positive");
    }
    if (input.turbulenceDissipation < 0) {
        throw new Error("turbulenceDissipation must be nonnegative");
    }
    const height = clamp(input.normalizedHeight);
    const trail = clamp(input.trailFraction);
    const core = clamp(input.denseCoreFraction);
    const crest = clamp(input.waveCrestFraction);
    const profile = HIGH_CLOUD_MICROPHYSICS_PROFILES[input.species];
    const erosion = lifecycleErosion(input.lifecycleStage);
    const coldGlaciation = clamp((253 - input.temperatureKelvin) / 18);
    const originAggregation = input.origin === "cumulonimbus-genitus" ? 0.16 : 0;
    const verticalRadius = mix(
        profile.baseRadiusMicrons,
        profile.topRadiusMicrons,
        height,
    );
    const iceEffectiveRadiusMicrons = clamp(
        verticalRadius + profile.trailRadiusGainMicrons * trail +
            originAggregation * 30 + core * 5,
        8,
        160,
    );
    const iceFraction = clamp(
        mix(profile.iceFraction[0], profile.iceFraction[1], height) +
            coldGlaciation * (1 - profile.iceFraction[0]) -
            (input.species.startsWith("cirrocumulus-") ? crest * 0.015 : 0),
        input.species.startsWith("cirrus-") ? 0.98 : 0.9,
        1,
    );
    const baseHabits = profile.baseHabits;
    const topHabits = profile.topHabits;
    const habitValues = {} as Record<HighCloudIceHabit, number>;
    for (const habit of [
        "column", "plate", "bullet-rosette", "aggregate", "polycrystal",
    ] as const) {
        habitValues[habit] = mix(baseHabits[habit], topHabits[habit], height);
    }
    habitValues.aggregate += trail * 0.22 + originAggregation;
    habitValues.polycrystal += input.turbulenceDissipation > 0.012 ? 0.08 : 0;
    const habitFractions = normalizeHabits(habitValues);
    const surfaceRoughness = clamp(
        profile.roughness + Math.sqrt(Math.max(0, input.turbulenceDissipation)) * 0.42 +
            erosion * 0.32 + trail * 0.08 - crest * 0.06,
        0.08,
        0.92,
    );
    const roughnessClass: HighCloudRoughnessClass = surfaceRoughness < 0.28
        ? "smooth" : surfaceRoughness < 0.58 ? "moderate" : "severe";
    const sedimentationWeight = clamp(
        profile.sedimentation * (0.35 + (1 - height) * 0.65) + trail * 0.55,
    );
    // A bounded renderer proxy: monotonically increasing with particle size and
    // sedimenting-trail membership, not a claim of one universal ice-habit law.
    const terminalVelocityMetresPerSecond = clamp(
        0.06 + iceEffectiveRadiusMicrons * 0.011 *
            mix(0.55, 1.15, sedimentationWeight),
        0.08,
        2.4,
    );
    const sublimationFraction = clamp(
        erosion + trail * (0.2 + (1 - input.waveCrestFraction) * 0.28) +
            (1 - core) * 0.08,
    );
    const relativeCondensate = clamp(
        profile.condensate * mix(0.62, 1.3, core) *
            mix(0.7, 1.08, crest) * (1 - sublimationFraction * 0.68),
    );
    return {
        iceEffectiveRadiusMicrons,
        liquidEffectiveRadiusMicrons: mix(
            profile.liquidRadiusMicrons[0],
            profile.liquidRadiusMicrons[1],
            height,
        ),
        iceFraction,
        habitFractions,
        surfaceRoughness,
        roughnessClass,
        sedimentationWeight,
        terminalVelocityMetresPerSecond,
        relativeCondensate,
        sublimationFraction,
    };
};

export interface HighCloudReachabilityContract {
    readonly species: HighCloudSpecies;
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly lifecycleTransitions: Readonly<Partial<Record<
        CloudLifecycleStage,
        readonly CloudLifecycleStage[]
    >>>;
    readonly origins: readonly HighCloudOrigin[];
    readonly organizations: readonly HighCloudOrganization[];
    readonly precipitationKinds: readonly CloudPrecipitationKind[];
    readonly minimumInstability: number;
    readonly maximumTurbulenceDissipation: number;
    readonly minimumSedimentationStrength: number;
    readonly minimumIceFraction: number;
}

const sequentialTransitions = (
    stages: readonly CloudLifecycleStage[],
): HighCloudReachabilityContract["lifecycleTransitions"] => Object.fromEntries(
    stages.map((stage, index) => [
        stage,
        stages.slice(index),
    ]),
) as HighCloudReachabilityContract["lifecycleTransitions"];

const reachability = (
    value: Omit<HighCloudReachabilityContract, "lifecycleTransitions"> & {
        readonly lifecycleTransitions?: HighCloudReachabilityContract["lifecycleTransitions"];
    },
): HighCloudReachabilityContract => ({
    ...value,
    lifecycleTransitions: value.lifecycleTransitions ??
        sequentialTransitions(value.lifecycleStages),
});

export const HIGH_CLOUD_REACHABILITY_CONTRACTS = {
    "cirrus-fibratus": reachability({ species: "cirrus-fibratus", lifecycleStages: ["incipient", "growing", "mature", "decaying"], origins: ["natural"], organizations: ["aperiodic-field", "banded"], precipitationKinds: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.12, minimumSedimentationStrength: 0.05, minimumIceFraction: 0.98 }),
    "cirrus-uncinus": reachability({ species: "cirrus-uncinus", lifecycleStages: ["growing", "mature", "precipitating", "decaying"], origins: ["natural"], organizations: ["isolated", "aperiodic-field"], precipitationKinds: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.1, minimumSedimentationStrength: 0.34, minimumIceFraction: 0.99 }),
    "cirrus-spissatus": reachability({ species: "cirrus-spissatus", lifecycleStages: ["glaciating", "mature", "decaying"], origins: ["natural", "cumulonimbus-genitus"], organizations: ["isolated", "aperiodic-field", "banded"], precipitationKinds: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.2, minimumSedimentationStrength: 0.12, minimumIceFraction: 0.99 }),
    "cirrus-castellanus": reachability({ species: "cirrus-castellanus", lifecycleStages: ["incipient", "growing", "mature"], origins: ["natural"], organizations: ["common-base-line"], precipitationKinds: ["none"], minimumInstability: 0.12, maximumTurbulenceDissipation: 0.18, minimumSedimentationStrength: 0.02, minimumIceFraction: 0.97 }),
    "cirrus-floccus": reachability({ species: "cirrus-floccus", lifecycleStages: ["mature", "precipitating", "decaying"], origins: ["natural", "castellanus-transition"], organizations: ["isolated", "aperiodic-field"], precipitationKinds: ["none", "virga"], minimumInstability: -0.2, maximumTurbulenceDissipation: 0.2, minimumSedimentationStrength: 0.16, minimumIceFraction: 0.98 }),
    "cirrocumulus-stratiformis": reachability({ species: "cirrocumulus-stratiformis", lifecycleStages: ["incipient", "growing", "mature", "decaying"], origins: ["natural", "gravity-wave"], organizations: ["extensive-sheet", "finite-wave-packet"], precipitationKinds: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.08, minimumSedimentationStrength: 0, minimumIceFraction: 0.9 }),
    "cirrocumulus-lenticularis": reachability({ species: "cirrocumulus-lenticularis", lifecycleStages: ["incipient", "growing", "mature", "decaying"], origins: ["orographic-wave", "gravity-wave"], organizations: ["finite-wave-packet"], precipitationKinds: ["none"], minimumInstability: -1, maximumTurbulenceDissipation: 0.025, minimumSedimentationStrength: 0, minimumIceFraction: 0.9 }),
    "cirrocumulus-castellanus": reachability({ species: "cirrocumulus-castellanus", lifecycleStages: ["incipient", "growing", "mature"], origins: ["natural", "gravity-wave"], organizations: ["common-base-line"], precipitationKinds: ["none"], minimumInstability: 0.16, maximumTurbulenceDissipation: 0.14, minimumSedimentationStrength: 0, minimumIceFraction: 0.9 }),
    "cirrocumulus-floccus": reachability({ species: "cirrocumulus-floccus", lifecycleStages: ["mature", "precipitating", "decaying"], origins: ["natural", "gravity-wave", "castellanus-transition"], organizations: ["isolated", "aperiodic-field", "finite-wave-packet"], precipitationKinds: ["none", "virga"], minimumInstability: -0.2, maximumTurbulenceDissipation: 0.16, minimumSedimentationStrength: 0.1, minimumIceFraction: 0.9 }),
} as const satisfies Record<HighCloudSpecies, HighCloudReachabilityContract>;

export interface HighCloudProductionState {
    readonly species: HighCloudSpecies;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: HighCloudOrigin;
    readonly organization: HighCloudOrganization;
    readonly precipitationKind: CloudPrecipitationKind;
    readonly instability: number;
    readonly turbulenceDissipation: number;
    readonly sedimentationStrength: number;
    readonly iceFraction: number;
    /** Brief WMO-observed liquid/mixed Cc state while a cavum glaciates. */
    readonly transientSupercooledCavum?: boolean;
}

export interface HighCloudProductionQualification {
    readonly legal: boolean;
    readonly violations: readonly string[];
}

export const qualifyHighCloudProductionState = (
    state: HighCloudProductionState,
): HighCloudProductionQualification => {
    const contract = HIGH_CLOUD_REACHABILITY_CONTRACTS[state.species];
    const violations: string[] = [];
    for (const [name, value] of Object.entries({
        instability: state.instability,
        turbulenceDissipation: state.turbulenceDissipation,
        sedimentationStrength: state.sedimentationStrength,
        iceFraction: state.iceFraction,
    })) {
        if (!Number.isFinite(value)) violations.push(`${name}-must-be-finite`);
    }
    if (state.turbulenceDissipation < 0) {
        violations.push("turbulence-dissipation-must-be-nonnegative");
    }
    if (state.sedimentationStrength < 0 || state.sedimentationStrength > 1) {
        violations.push("sedimentation-strength-must-be-normalized");
    }
    if (state.iceFraction < 0 || state.iceFraction > 1) {
        violations.push("ice-fraction-must-be-normalized");
    }
    if (!contract.lifecycleStages.includes(state.lifecycleStage)) {
        violations.push("illegal-lifecycle-stage-for-species");
    }
    if (!contract.origins.includes(state.origin)) {
        violations.push("illegal-formation-origin-for-species");
    }
    if (!contract.organizations.includes(state.organization)) {
        violations.push("illegal-organization-for-species");
    }
    if (!contract.precipitationKinds.includes(state.precipitationKind)) {
        violations.push("illegal-precipitation-for-species");
    }
    if (state.instability < contract.minimumInstability) {
        violations.push("insufficient-instability-for-species");
    }
    if (state.turbulenceDissipation > contract.maximumTurbulenceDissipation) {
        violations.push("excess-turbulence-for-species");
    }
    if (state.sedimentationStrength < contract.minimumSedimentationStrength) {
        violations.push("insufficient-sedimentation-for-species");
    }
    const supercooledCavumException = state.transientSupercooledCavum === true &&
        state.species.startsWith("cirrocumulus-") && state.iceFraction >= 0.65;
    if (state.iceFraction < contract.minimumIceFraction &&
        !supercooledCavumException) {
        violations.push("insufficient-ice-fraction-for-high-cloud-species");
    }
    return { legal: violations.length === 0, violations };
};

export const isLegalHighCloudLifecycleTransition = (
    species: HighCloudSpecies,
    from: CloudLifecycleStage,
    to: CloudLifecycleStage,
) => HIGH_CLOUD_REACHABILITY_CONTRACTS[species]
    .lifecycleTransitions[from]?.includes(to) ?? false;

export type ReachableHighCloudState = Omit<HighCloudProductionState, "species"> & {
    readonly genus: HighCloudGenus;
};

export const reachableHighCloudSpecies = (
    state: ReachableHighCloudState,
): readonly HighCloudSpecies[] => HIGH_CLOUD_SPECIES.filter((species) =>
    HIGH_CLOUD_SPECIES_DESCRIPTORS[species].genus === state.genus &&
    qualifyHighCloudProductionState({ ...state, species }).legal
);

export const selectReachableHighCloudSpecies = (
    state: ReachableHighCloudState,
    deterministicIndex: number,
): HighCloudSpecies | undefined => {
    assertFinite("deterministic index", deterministicIndex);
    const reachable = reachableHighCloudSpecies(state);
    if (reachable.length === 0) return undefined;
    return reachable[Math.abs(Math.trunc(deterministicIndex)) % reachable.length];
};

export const selectHighCloudTopologyVariant = (
    species: HighCloudSpecies,
    deterministicIndex: number,
): HighCloudTopologyVariantDescriptor => {
    assertFinite("deterministic index", deterministicIndex);
    const choices = HIGH_CLOUD_TOPOLOGY_VARIANTS[species];
    return choices[Math.abs(Math.trunc(deterministicIndex)) % choices.length];
};

const MECHANISM_CODE: Record<HighCloudFormationMechanism, number> = {
    "sheared-ice-advection": 0,
    "ice-growth-and-sedimentation": 1,
    "dense-ice-detrainment": 2,
    "elevated-convection": 3,
    "sublimating-convective-remnant": 4,
    "gravity-wave-condensation": 5,
    "orographic-wave-condensation": 6,
};

const CONNECTIVITY_CODE: Record<HighCloudTopologyConnectivity, number> = {
    "separate-fibres": 0,
    "hook-and-fallstreak": 1,
    "irregular-dense-patch": 2,
    "single-common-base": 3,
    "detached-tufts": 4,
    "extensive-broken-sheet": 5,
    "finite-wave-packet": 6,
};

/** Stable normalized descriptor vector used by generation qualification. */
export const highCloudTopologyVariantSignature = (
    descriptor: HighCloudTopologyVariantDescriptor,
): readonly number[] => [
    MECHANISM_CODE[descriptor.mechanism] / 6,
    CONNECTIVITY_CODE[descriptor.connectivity] / 6,
    Math.log1p((descriptor.macroElementCount[0] + descriptor.macroElementCount[1]) * 0.5) /
        Math.log(91),
    (descriptor.hierarchyLevels[0] + descriptor.hierarchyLevels[1]) / 12,
    Math.log1p((descriptor.formationAspectRatio[0] + descriptor.formationAspectRatio[1]) * 0.5) /
        Math.log(25),
    descriptor.minimumSpacingVariation,
    descriptor.maximumMirrorSimilarity,
];

export const highCloudTopologySignatureDistance = (
    left: readonly number[],
    right: readonly number[],
) => {
    if (left.length !== right.length || left.length === 0) {
        throw new Error("Topology signatures must have the same nonzero length");
    }
    let squaredDistance = 0;
    for (let index = 0; index < left.length; index += 1) {
        assertFinite("topology signature component", left[index]);
        assertFinite("topology signature component", right[index]);
        squaredDistance += (left[index] - right[index]) ** 2;
    }
    return Math.sqrt(squaredDistance / left.length);
};

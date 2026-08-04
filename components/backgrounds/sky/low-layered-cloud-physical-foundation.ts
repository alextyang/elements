/**
 * Renderer-independent physical contracts for low and precipitation-layer
 * clouds. This module deliberately has no production renderer side effects.
 *
 * Taxonomy follows WMO: Stratocumulus has five species, Stratus two, and
 * Nimbostratus no species or varieties. The Nimbostratus representation IDs
 * below are orthogonal render states (supplementary features/accessory cloud),
 * not invented species.
 */

import type {
    CloudLifecycleStage,
    CloudOrganizationState,
    CloudPrecipitationKind,
} from "./cloud-state-map";

export const LOW_LAYERED_CLOUD_REPRESENTATIONS = [
    "stratocumulus-stratiformis",
    "stratocumulus-lenticularis",
    "stratocumulus-castellanus",
    "stratocumulus-floccus",
    "stratocumulus-volutus",
    "stratus-nebulosus",
    "stratus-fractus",
    "nimbostratus",
    "nimbostratus-virga",
    "nimbostratus-praecipitatio",
    "nimbostratus-pannus",
] as const;

export type LowLayeredCloudRepresentation =
    (typeof LOW_LAYERED_CLOUD_REPRESENTATIONS)[number];
export type LowLayeredCloudGenus = "stratocumulus" | "stratus" | "nimbostratus";
export type ExistingLowLayeredRendererSpecies =
    | "stratocumulus-stratiformis"
    | "stratocumulus-lenticularis"
    | "stratocumulus-castellanus"
    | "stratocumulus-floccus"
    | "stratocumulus-volutus"
    | "stratus-nebulosus"
    | "stratus-fractus"
    | "nimbostratus-praecipitatio";
export type LowLayeredClassificationAxis =
    | "wmo-species"
    | "wmo-genus-state"
    | "wmo-supplementary-feature"
    | "wmo-accessory-cloud";
export type LowLayeredElementKind =
    | "flattened-mass"
    | "lens-constituent"
    | "turret-width"
    | "tuft-width"
    | "roll-cross-section"
    | "continuous-boundary-layer"
    | "ragged-shred"
    | "deep-precipitation-shield";
export type LowLayeredPrecipitation =
    | "none" | "drizzle" | "rain" | "snow" | "snow-grains"
    | "snow-pellets" | "ice-pellets" | "virga";

export interface LowLayeredRepresentationDescriptor {
    readonly representation: LowLayeredCloudRepresentation;
    readonly genus: LowLayeredCloudGenus;
    readonly rendererSpecies: ExistingLowLayeredRendererSpecies;
    readonly classificationAxis: LowLayeredClassificationAxis;
    readonly wmoAbbreviation: string;
    readonly wmoDefinition: string;
    readonly wmoSource: string;
    readonly physicalConstitutionSource: string;
    readonly elementKind: LowLayeredElementKind;
    /** Physical scale of one visible element, independent of system span. */
    readonly elementDiameterKm: readonly [number, number] | null;
    readonly formationSpanKm: readonly [number, number];
    readonly geometricDepthKm: readonly [number, number];
    readonly baseAltitudeKm: readonly [number, number];
    readonly opticalDepth: readonly [number, number];
    readonly sourceDisc: "sharp-if-thin" | "concealed" | "not-applicable";
    readonly requiredMorphology: readonly string[];
    readonly forbiddenMorphology: readonly string[];
    readonly classification: {
        readonly wmoSpecies: string | null;
        readonly supplementaryFeatures: readonly string[];
        readonly accessoryCloud: string | null;
    };
}

const SC_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-stratocumulus.html";
const ST_CONSTITUTION =
    "https://cloudatlas.wmo.int/physical-constitution-stratus.html";
const NS_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-nimbostratus.html";

const sc = (
    value: LowLayeredRepresentationDescriptor,
): LowLayeredRepresentationDescriptor => value;

export const LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS = {
    "stratocumulus-stratiformis": sc({
        representation: "stratocumulus-stratiformis", genus: "stratocumulus",
        rendererSpecies: "stratocumulus-stratiformis", classificationAxis: "wmo-species",
        wmoAbbreviation: "Sc str",
        wmoDefinition: "Flattened rolls or large rounded masses arranged in an extended sheet or layer.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-stratocumulus-stratiformis-sc-str.html",
        physicalConstitutionSource: SC_CONSTITUTION, elementKind: "flattened-mass",
        elementDiameterKm: [0.35, 7], formationSpanKm: [8, 900],
        geometricDepthKm: [0.18, 2.4], baseAltitudeKm: [0.15, 2.2],
        opticalDepth: [0.6, 32], sourceDisc: "not-applicable",
        requiredMorphology: ["flattened cellular masses", "merged and separated support", "mesoscale organization", "dark modeled undersides"],
        forbiddenMorphology: ["equal puff lattice", "one population stamp per owner", "featureless Stratus veil", "infinite periodic tiling"],
        classification: { wmoSpecies: "stratiformis", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratocumulus-lenticularis": sc({
        representation: "stratocumulus-lenticularis", genus: "stratocumulus",
        rendererSpecies: "stratocumulus-lenticularis", classificationAxis: "wmo-species",
        wmoAbbreviation: "Sc len",
        wmoDefinition: "A rare, well-defined elongated lens or almond of grouped elements or one smooth dark unit.",
        wmoSource: "https://cloudatlas.wmo.int/species-stratocumulus-lenticularis-sc-len.html",
        physicalConstitutionSource: SC_CONSTITUTION, elementKind: "lens-constituent",
        elementDiameterKm: [0.5, 8], formationSpanKm: [3, 100],
        geometricDepthKm: [0.12, 1.4], baseAltitudeKm: [0.25, 2.2],
        opticalDepth: [0.7, 24], sourceDisc: "not-applicable",
        requiredMorphology: ["finite wave-supported lens", "well-defined unequal taper", "large constituents or one smooth volume", "pronounced self-shadow"],
        forbiddenMorphology: ["screen-space oval", "saucer grid", "unbounded wave bands", "cauliflower edge"],
        classification: { wmoSpecies: "lenticularis", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratocumulus-castellanus": sc({
        representation: "stratocumulus-castellanus", genus: "stratocumulus",
        rendererSpecies: "stratocumulus-castellanus", classificationAxis: "wmo-species",
        wmoAbbreviation: "Sc cas",
        wmoDefinition: "Cumuliform turrets rise from cloud elements joined by a common horizontal base.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-stratocumulus-castellanus-sc-cas.html",
        physicalConstitutionSource: SC_CONSTITUTION, elementKind: "turret-width",
        elementDiameterKm: [0.45, 7], formationSpanKm: [3, 70],
        geometricDepthKm: [0.5, 3.8], baseAltitudeKm: [0.25, 2.2],
        opticalDepth: [1.2, 36], sourceDisc: "not-applicable",
        requiredMorphology: ["one common horizontal base", "unequal crenellated turrets", "side-view readability", "low-level instability"],
        forbiddenMorphology: ["detached equal towers", "capsule row", "smooth oval lobes", "fibrous glaciated Cumulonimbus top"],
        classification: { wmoSpecies: "castellanus", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratocumulus-floccus": sc({
        representation: "stratocumulus-floccus", genus: "stratocumulus",
        rendererSpecies: "stratocumulus-floccus", classificationAxis: "wmo-species",
        wmoAbbreviation: "Sc flo",
        wmoDefinition: "Small cumuliform tufts with ragged lower parts and, in extreme cold, fibrous ice virga.",
        wmoSource: "https://cloudatlas.wmo.int/species-stratocumulus-floccus-sc-flo.html",
        physicalConstitutionSource: SC_CONSTITUTION, elementKind: "tuft-width",
        elementDiameterKm: [0.35, 5.5], formationSpanKm: [2, 65],
        geometricDepthKm: [0.3, 2.8], baseAltitudeKm: [0.2, 2.3],
        opticalDepth: [0.7, 24], sourceDisc: "not-applicable",
        requiredMorphology: ["unequal detached tufts", "ragged lower parts", "castellanus-base dissipation continuity", "rare cold fibrous virga"],
        forbiddenMorphology: ["smooth ovals", "retained common base", "uniform bead field", "warm fibrous ice trails"],
        classification: { wmoSpecies: "floccus", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratocumulus-volutus": sc({
        representation: "stratocumulus-volutus", genus: "stratocumulus",
        rendererSpecies: "stratocumulus-volutus", classificationAxis: "wmo-species",
        wmoAbbreviation: "Sc vol",
        wmoDefinition: "A rare detached horizontal tube, usually solitary but occasionally in successive lines.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-stratocumulus-volutus-sc-vol.html",
        physicalConstitutionSource: SC_CONSTITUTION, elementKind: "roll-cross-section",
        elementDiameterKm: [0.6, 7], formationSpanKm: [10, 180],
        geometricDepthKm: [0.4, 2.8], baseAltitudeKm: [0.1, 2],
        opticalDepth: [1, 28], sourceDisc: "not-applicable",
        requiredMorphology: ["finite detached tube", "horizontal vortex cross-section", "usually one roll", "asymmetric physical ends"],
        forbiddenMorphology: ["horizon-infinite cylinder", "many equal parallel tubes", "solid capsule", "attached convective arcus"],
        classification: { wmoSpecies: "volutus", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratus-nebulosus": sc({
        representation: "stratus-nebulosus", genus: "stratus",
        rendererSpecies: "stratus-nebulosus", classificationAxis: "wmo-species",
        wmoAbbreviation: "St neb",
        wmoDefinition: "A nebulous, grey, fairly uniform boundary-layer cloud sheet.",
        wmoSource: "https://cloudatlas.wmo.int/species-stratus-st.html",
        physicalConstitutionSource: ST_CONSTITUTION, elementKind: "continuous-boundary-layer",
        elementDiameterKm: null, formationSpanKm: [5, 500],
        geometricDepthKm: [0.05, 1.1], baseAltitudeKm: [0.02, 1.5],
        opticalDepth: [0.25, 30], sourceDisc: "sharp-if-thin",
        requiredMorphology: ["continuous nebulous support", "fairly uniform low base", "fog-lifting continuity", "subtle nonperiodic thickness"],
        forbiddenMorphology: ["cellular tessellation", "puff-stamp tiling", "hard finite alpha mask", "blurred Altostratus source disc"],
        classification: { wmoSpecies: "nebulosus", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "stratus-fractus": sc({
        representation: "stratus-fractus", genus: "stratus",
        rendererSpecies: "stratus-fractus", classificationAxis: "wmo-species",
        wmoAbbreviation: "St fra",
        wmoDefinition: "Irregular ragged shreds whose outlines change continuously and often rapidly.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-stratus-fractus-st-fra.html",
        physicalConstitutionSource: ST_CONSTITUTION, elementKind: "ragged-shred",
        elementDiameterKm: [0.08, 3], formationSpanKm: [0.4, 60],
        geometricDepthKm: [0.04, 0.7], baseAltitudeKm: [0.02, 1.6],
        opticalDepth: [0.15, 12], sourceDisc: "not-applicable",
        requiredMorphology: ["irregular ragged shreds", "rapid boundary evolution", "merge-or-detach lifecycle", "unequal correlated fragments"],
        forbiddenMorphology: ["round cloudlets", "stable clones", "uniform continuous veil", "wet pannus without parent precipitation"],
        classification: { wmoSpecies: "fractus", supplementaryFeatures: [], accessoryCloud: null },
    }),
    "nimbostratus": sc({
        representation: "nimbostratus", genus: "nimbostratus",
        rendererSpecies: "nimbostratus-praecipitatio", classificationAxis: "wmo-genus-state",
        wmoAbbreviation: "Ns",
        wmoDefinition: "A deep, diffuse grey precipitation layer, thick enough throughout to conceal the Sun.",
        wmoSource: "https://cloudatlas.wmo.int/nimbostratus-ns.html",
        physicalConstitutionSource: NS_CONSTITUTION, elementKind: "deep-precipitation-shield",
        elementDiameterKm: null, formationSpanKm: [60, 1200],
        geometricDepthKm: [1.2, 8.5], baseAltitudeKm: [0.15, 3],
        opticalDepth: [8, 100], sourceDisc: "concealed",
        requiredMorphology: ["deep finite frontal shield", "diffuse or indeterminate base", "internally modulated precipitation structure", "source concealed everywhere"],
        forbiddenMorphology: ["defined cellular elements", "sharp lower surface", "towered convection", "flat grey alpha card"],
        classification: { wmoSpecies: null, supplementaryFeatures: [], accessoryCloud: null },
    }),
    "nimbostratus-virga": sc({
        representation: "nimbostratus-virga", genus: "nimbostratus",
        rendererSpecies: "nimbostratus-praecipitatio", classificationAxis: "wmo-supplementary-feature",
        wmoAbbreviation: "Ns vir",
        wmoDefinition: "Nimbostratus whose attached rain, snow, or ice-pellet fallstreaks evaporate before reaching ground.",
        wmoSource: "https://cloudatlas.wmo.int/supplementary-features-and-accessory-clouds-nimbostratus.html",
        physicalConstitutionSource: NS_CONSTITUTION, elementKind: "deep-precipitation-shield",
        elementDiameterKm: null, formationSpanKm: [60, 1200],
        geometricDepthKm: [1.5, 9], baseAltitudeKm: [0.3, 3.5],
        opticalDepth: [10, 110], sourceDisc: "concealed",
        requiredMorphology: ["deep continuous shield", "attached broad virga", "evaporating lower terminus", "diffuse wet-looking base"],
        forbiddenMorphology: ["detached shafts", "surface precipitation", "convective curtains", "visible source disc"],
        classification: { wmoSpecies: null, supplementaryFeatures: ["virga"], accessoryCloud: null },
    }),
    "nimbostratus-praecipitatio": sc({
        representation: "nimbostratus-praecipitatio", genus: "nimbostratus",
        rendererSpecies: "nimbostratus-praecipitatio", classificationAxis: "wmo-supplementary-feature",
        wmoAbbreviation: "Ns pra",
        wmoDefinition: "Nimbostratus with continuous rain, snow, or ice-pellet precipitation, usually reaching ground.",
        wmoSource: "https://cloudatlas.wmo.int/supplementary-features-and-accessory-clouds-nimbostratus.html",
        physicalConstitutionSource: NS_CONSTITUTION, elementKind: "deep-precipitation-shield",
        elementDiameterKm: null, formationSpanKm: [80, 1400],
        geometricDepthKm: [1.8, 10], baseAltitudeKm: [0.1, 3],
        opticalDepth: [12, 140], sourceDisc: "concealed",
        requiredMorphology: ["continuous non-showery precipitation", "deep mixed-phase path", "melting-level modulation", "diffuse obscured base"],
        forbiddenMorphology: ["isolated shower shafts", "hail core", "hard rain-plane clipping", "visible source disc"],
        classification: { wmoSpecies: null, supplementaryFeatures: ["praecipitatio"], accessoryCloud: null },
    }),
    "nimbostratus-pannus": sc({
        representation: "nimbostratus-pannus", genus: "nimbostratus",
        rendererSpecies: "nimbostratus-praecipitatio", classificationAxis: "wmo-accessory-cloud",
        wmoAbbreviation: "Ns pan",
        wmoDefinition: "Nimbostratus with separately owned low ragged pannus in precipitation-moistened air beneath it.",
        wmoSource: "https://cloudatlas.wmo.int/supplementary-features-and-accessory-clouds-nimbostratus.html",
        physicalConstitutionSource: NS_CONSTITUTION, elementKind: "deep-precipitation-shield",
        elementDiameterKm: null, formationSpanKm: [80, 1400],
        geometricDepthKm: [1.8, 10], baseAltitudeKm: [0.1, 3],
        opticalDepth: [12, 150], sourceDisc: "concealed",
        requiredMorphology: ["continuous parent shield", "separate ragged underdeck owners", "parent visible through early gaps", "coalescing wet-weather fragments"],
        forbiddenMorphology: ["pannus baked into parent density", "uniform second slab", "bright scud", "pannus surviving strongest washout unchanged"],
        classification: { wmoSpecies: null, supplementaryFeatures: ["praecipitatio"], accessoryCloud: "pannus" },
    }),
} as const satisfies Record<LowLayeredCloudRepresentation, LowLayeredRepresentationDescriptor>;

export const LOW_LAYERED_BENCHMARK_ENVIRONMENTS = [
    "day-oblique-natural", "golden-backlit-telephoto", "humid-wide-nearby",
    "twilight-overhead", "moonlight-natural",
] as const;
export type LowLayeredBenchmarkEnvironment =
    (typeof LOW_LAYERED_BENCHMARK_ENVIRONMENTS)[number];

export interface LowLayeredEnvironmentContract {
    readonly camera: "natural-oblique" | "telephoto-backlit" | "wide-nearby" | "overhead-wide";
    readonly source: "day-sun" | "low-golden-sun" | "twilight-source" | "moon";
    readonly atmosphere: "clear-natural" | "golden-aerosol" | "humid" | "twilight" | "night";
    readonly requiredEvidence: readonly string[];
    readonly forbiddenCompensation: readonly string[];
}

export const LOW_LAYERED_ENVIRONMENT_CONTRACTS = {
    "day-oblique-natural": {
        camera: "natural-oblique", source: "day-sun", atmosphere: "clear-natural",
        requiredEvidence: ["element scale", "volumetric underside", "finite world support"],
        forbiddenCompensation: ["painted shadow patch", "screen-space edge vignette"],
    },
    "golden-backlit-telephoto": {
        camera: "telephoto-backlit", source: "low-golden-sun", atmosphere: "golden-aerosol",
        requiredEvidence: ["spectral source transmittance", "deep forward peak", "airlit finite edge"],
        forbiddenCompensation: ["white rim outline", "uniform orange tint"],
    },
    "humid-wide-nearby": {
        camera: "wide-nearby", source: "day-sun", atmosphere: "humid",
        requiredEvidence: ["near-field parallax", "humid view extinction", "nonperiodic system boundary"],
        forbiddenCompensation: ["global blur", "flattened horizon mask"],
    },
    "twilight-overhead": {
        camera: "overhead-wide", source: "twilight-source", atmosphere: "twilight",
        requiredEvidence: ["long-path spectral extinction", "multiple-scattered interior", "overhead geometric continuity"],
        forbiddenCompensation: ["palette-only recolor", "luminous unshadowed cloud floor"],
    },
    "moonlight-natural": {
        camera: "natural-oblique", source: "moon", atmosphere: "night",
        requiredEvidence: ["moon-aligned Beer visibility", "dark-adapted contrast", "atmospheric moon color"],
        forbiddenCompensation: ["daylight cloud multiplied blue", "self-luminous grey deck"],
    },
} as const satisfies Record<LowLayeredBenchmarkEnvironment, LowLayeredEnvironmentContract>;

export type LowLayeredOrigin =
    | "marine-boundary-layer" | "continental-boundary-layer"
    | "cold-air-outbreak" | "gravity-wave" | "orographic-wave"
    | "castellanus-transition" | "shear-layer-roll" | "fog-lift"
    | "radiative-cooling" | "advection-cooling" | "dry-fractus-transition"
    | "altostratus-thickening" | "stratocumulus-thickening"
    | "altocumulus-thickening" | "cumulonimbus-spreading"
    | "cumulus-spreading" | "precipitation-moistening";
export type LowLayeredOrganization =
    | "closed-cell-deck" | "open-cell-deck" | "actinoform-cluster"
    | "cloud-streets" | "closed-open-transition-mosaic"
    | "aperiodic-flattened-deck" | "finite-wave-lens"
    | "common-base-line" | "detached-tufts" | "single-roll"
    | "successive-rolls" | "uniform-boundary-layer" | "lifting-fog"
    | "ragged-fragment-field" | "frontal-shield" | "precipitating-shield"
    | "pannus-underdeck";
export type LowLayeredConnectivity =
    | "cellular-sheet" | "finite-lens" | "single-common-base"
    | "detached-fragments" | "finite-roll" | "continuous-layer"
    | "deep-continuous-layer" | "parent-plus-underdeck";
export type LowLayeredFormationMechanism =
    | "cloud-top-radiative-convection" | "drizzle-cold-pool-organization"
    | "boundary-layer-roll-convection" | "orographic-wave-condensation"
    | "elevated-boundary-layer-convection" | "base-dissipation"
    | "horizontal-vortex-roll" | "fog-lifting" | "surface-cooling"
    | "advection-over-cold-surface" | "fragment-merger-dissipation"
    | "frontal-ascent" | "stratiform-generating-cells"
    | "precipitation-moistened-turbulence";

export interface LowLayeredTopologyVariantDescriptor {
    readonly id: string;
    readonly label: string;
    readonly mechanism: LowLayeredFormationMechanism;
    readonly connectivity: LowLayeredConnectivity;
    readonly macroElementCount: readonly [number, number];
    readonly hierarchyLevels: readonly [number, number];
    readonly formationAspectRatio: readonly [number, number];
    readonly boundaryCorrelationKm: readonly [number, number];
    readonly minimumSpacingVariation: number;
    readonly maximumMirrorSimilarity: number;
    readonly origins: readonly LowLayeredOrigin[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly organizations: readonly LowLayeredOrganization[];
    readonly cues: readonly string[];
}

const topology = (value: LowLayeredTopologyVariantDescriptor) => value;
const variants = (
    ...values: readonly LowLayeredTopologyVariantDescriptor[]
): readonly LowLayeredTopologyVariantDescriptor[] => values;

export const LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS = {
    "stratocumulus-stratiformis": variants(
        topology({ id: "closed-cell-radiative-deck", label: "Radiatively driven closed-cell deck", mechanism: "cloud-top-radiative-convection", connectivity: "cellular-sheet", macroElementCount: [24, 140], hierarchyLevels: [4, 7], formationAspectRatio: [1.2, 8], boundaryCorrelationKm: [4, 30], minimumSpacingVariation: 0.28, maximumMirrorSimilarity: 0.5, origins: ["marine-boundary-layer", "continental-boundary-layer"], lifecycleStages: ["growing", "mature"], organizations: ["closed-cell-deck", "aperiodic-flattened-deck"], cues: ["bright connected cell centers", "dark intercell seams", "cloud-top cooling support"] }),
        topology({ id: "drizzling-open-cell-field", label: "Drizzling open-cell field", mechanism: "drizzle-cold-pool-organization", connectivity: "cellular-sheet", macroElementCount: [12, 72], hierarchyLevels: [5, 7], formationAspectRatio: [1.2, 7], boundaryCorrelationKm: [6, 40], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.4, origins: ["cold-air-outbreak", "marine-boundary-layer"], lifecycleStages: ["mature", "precipitating", "decaying"], organizations: ["open-cell-deck", "actinoform-cluster"], cues: ["cloudy cell walls", "clearer centers", "drizzle-coincident downdrafts", "localized closed-to-open transitions"] }),
        topology({ id: "finite-street-and-broken-deck", label: "Finite streets and broken flattened deck", mechanism: "boundary-layer-roll-convection", connectivity: "cellular-sheet", macroElementCount: [14, 90], hierarchyLevels: [4, 6], formationAspectRatio: [2, 14], boundaryCorrelationKm: [3, 24], minimumSpacingVariation: 0.35, maximumMirrorSimilarity: 0.44, origins: ["marine-boundary-layer", "continental-boundary-layer", "cold-air-outbreak"], lifecycleStages: ["incipient", "growing", "mature", "precipitating", "decaying"], organizations: ["cloud-streets", "aperiodic-flattened-deck"], cues: ["finite correlated bands", "wavelength drift", "unequal merged elements"] }),
        topology({ id: "closed-open-transition-mosaic", label: "Sparse closed-to-open transition mosaic", mechanism: "drizzle-cold-pool-organization", connectivity: "cellular-sheet", macroElementCount: [10, 64], hierarchyLevels: [5, 7], formationAspectRatio: [1.2, 9], boundaryCorrelationKm: [5, 36], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.36, origins: ["cold-air-outbreak", "marine-boundary-layer", "continental-boundary-layer"], lifecycleStages: ["incipient", "growing", "mature", "precipitating", "decaying"], organizations: ["closed-open-transition-mosaic"], cues: ["surviving broad closed cells", "precipitation-narrowed open arcs", "parent and offspring cold-pool cells", "real sparse support rather than carved holes"] }),
    ),
    "stratocumulus-lenticularis": variants(
        topology({ id: "single-low-wave-lens", label: "Single low wave lens", mechanism: "orographic-wave-condensation", connectivity: "finite-lens", macroElementCount: [1, 1], hierarchyLevels: [4, 6], formationAspectRatio: [5, 22], boundaryCorrelationKm: [1, 9], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.62, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["incipient", "growing", "mature"], organizations: ["finite-wave-lens"], cues: ["well-defined lens", "dark volumetric interior", "unequal ends"] }),
        topology({ id: "grouped-element-lens", label: "Grouped-element low lens", mechanism: "orographic-wave-condensation", connectivity: "finite-lens", macroElementCount: [4, 18], hierarchyLevels: [4, 6], formationAspectRatio: [4, 16], boundaryCorrelationKm: [1, 8], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.48, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["growing", "mature"], organizations: ["finite-wave-lens"], cues: ["large grouped elements", "shared wave envelope", "nonperiodic constituents"] }),
        topology({ id: "eroding-low-wave-packet", label: "Eroding low wave packet", mechanism: "orographic-wave-condensation", connectivity: "finite-lens", macroElementCount: [1, 5], hierarchyLevels: [5, 7], formationAspectRatio: [3, 14], boundaryCorrelationKm: [0.6, 6], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.36, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["decaying"], organizations: ["finite-wave-lens"], cues: ["lee-edge erosion", "finite packet", "preserved laminar volume"] }),
    ),
    "stratocumulus-castellanus": variants(
        topology({ id: "crenellated-low-deck", label: "Crenellated common-base low deck", mechanism: "elevated-boundary-layer-convection", connectivity: "single-common-base", macroElementCount: [4, 14], hierarchyLevels: [4, 7], formationAspectRatio: [2, 9], boundaryCorrelationKm: [0.8, 6], minimumSpacingVariation: 0.32, maximumMirrorSimilarity: 0.48, origins: ["continental-boundary-layer", "marine-boundary-layer"], lifecycleStages: ["incipient", "growing", "mature"], organizations: ["common-base-line"], cues: ["common base", "unequal turrets", "side-profile crenellation"] }),
        topology({ id: "deepening-stratocumulus-castle", label: "Deepening stratocumulus castle", mechanism: "elevated-boundary-layer-convection", connectivity: "single-common-base", macroElementCount: [3, 10], hierarchyLevels: [5, 7], formationAspectRatio: [2, 7], boundaryCorrelationKm: [0.7, 5], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.4, origins: ["continental-boundary-layer", "cold-air-outbreak"], lifecycleStages: ["growing", "mature"], organizations: ["common-base-line"], cues: ["some turrets taller than wide", "deep-convection transition readiness", "shared horizontal base"] }),
        topology({ id: "base-eroding-floccus-transition", label: "Base-eroding floccus transition", mechanism: "base-dissipation", connectivity: "single-common-base", macroElementCount: [5, 16], hierarchyLevels: [5, 7], formationAspectRatio: [2, 8], boundaryCorrelationKm: [0.5, 5], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.34, origins: ["castellanus-transition"], lifecycleStages: ["decaying"], organizations: ["common-base-line", "detached-tufts"], cues: ["fragmenting base", "correlated remnant crowns", "increasing ragged undersides"] }),
    ),
    "stratocumulus-floccus": variants(
        topology({ id: "castellanus-remnant-low-tufts", label: "Castellanus-remnant low tufts", mechanism: "base-dissipation", connectivity: "detached-fragments", macroElementCount: [5, 18], hierarchyLevels: [4, 7], formationAspectRatio: [1.5, 7], boundaryCorrelationKm: [0.4, 4], minimumSpacingVariation: 0.45, maximumMirrorSimilarity: 0.38, origins: ["castellanus-transition"], lifecycleStages: ["mature", "decaying"], organizations: ["detached-tufts"], cues: ["lost common base", "ragged lower edge", "formation-level correlation"] }),
        topology({ id: "unstable-boundary-layer-tufts", label: "Unstable boundary-layer tufts", mechanism: "elevated-boundary-layer-convection", connectivity: "detached-fragments", macroElementCount: [4, 15], hierarchyLevels: [4, 6], formationAspectRatio: [1.2, 6], boundaryCorrelationKm: [0.4, 3], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.34, origins: ["marine-boundary-layer", "continental-boundary-layer"], lifecycleStages: ["growing", "mature"], organizations: ["detached-tufts"], cues: ["unequal liquid crowns", "ragged bases", "no retained sheet"] }),
        topology({ id: "extreme-cold-ice-trail-tufts", label: "Extreme-cold ice-trail tufts", mechanism: "base-dissipation", connectivity: "detached-fragments", macroElementCount: [3, 12], hierarchyLevels: [5, 7], formationAspectRatio: [2, 9], boundaryCorrelationKm: [0.5, 5], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.3, origins: ["castellanus-transition", "cold-air-outbreak"], lifecycleStages: ["glaciating", "precipitating", "decaying"], organizations: ["detached-tufts"], cues: ["liquid source tufts", "rare fibrous ice virga", "sublimating termini"] }),
    ),
    "stratocumulus-volutus": variants(
        topology({ id: "solitary-boundary-roll", label: "Solitary boundary-layer roll", mechanism: "horizontal-vortex-roll", connectivity: "finite-roll", macroElementCount: [1, 1], hierarchyLevels: [5, 7], formationAspectRatio: [12, 50], boundaryCorrelationKm: [4, 30], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.5, origins: ["shear-layer-roll"], lifecycleStages: ["growing", "mature"], organizations: ["single-roll"], cues: ["detached tube", "rolling cross-section", "finite unequal ends"] }),
        topology({ id: "curved-solitary-boundary-roll", label: "Curved solitary boundary roll", mechanism: "horizontal-vortex-roll", connectivity: "finite-roll", macroElementCount: [1, 1], hierarchyLevels: [5, 7], formationAspectRatio: [10, 42], boundaryCorrelationKm: [3, 24], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.38, origins: ["shear-layer-roll"], lifecycleStages: ["mature", "decaying"], organizations: ["single-roll"], cues: ["gentle world-space curvature", "axial condensate asymmetry", "one finite cloud"] }),
        topology({ id: "successive-unequal-boundary-rolls", label: "Successive unequal boundary rolls", mechanism: "horizontal-vortex-roll", connectivity: "finite-roll", macroElementCount: [2, 4], hierarchyLevels: [5, 7], formationAspectRatio: [10, 46], boundaryCorrelationKm: [4, 32], minimumSpacingVariation: 0.35, maximumMirrorSimilarity: 0.34, origins: ["shear-layer-roll", "cold-air-outbreak"], lifecycleStages: ["growing", "mature"], organizations: ["successive-rolls"], cues: ["rare successive lines", "unequal separation", "independent finite ends"] }),
    ),
    "stratus-nebulosus": variants(
        topology({ id: "radiatively-cooled-uniform-sheet", label: "Radiatively cooled uniform sheet", mechanism: "surface-cooling", connectivity: "continuous-layer", macroElementCount: [1, 3], hierarchyLevels: [5, 7], formationAspectRatio: [30, 180], boundaryCorrelationKm: [2, 30], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.5, origins: ["radiative-cooling", "continental-boundary-layer"], lifecycleStages: ["incipient", "growing", "mature"], organizations: ["uniform-boundary-layer"], cues: ["uniform low base", "smoky grey thin state", "broad aperiodic thickness"] }),
        topology({ id: "advected-coastal-stratus-bank", label: "Advected coastal stratus bank", mechanism: "advection-over-cold-surface", connectivity: "continuous-layer", macroElementCount: [1, 4], hierarchyLevels: [5, 7], formationAspectRatio: [20, 140], boundaryCorrelationKm: [3, 40], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.42, origins: ["advection-cooling", "marine-boundary-layer"], lifecycleStages: ["growing", "mature", "decaying"], organizations: ["uniform-boundary-layer"], cues: ["finite weather bank", "entrainment-eroded edge", "continuous interior support"] }),
        topology({ id: "lifting-fog-layer", label: "Lifting fog layer", mechanism: "fog-lifting", connectivity: "continuous-layer", macroElementCount: [1, 3], hierarchyLevels: [4, 7], formationAspectRatio: [20, 160], boundaryCorrelationKm: [1, 20], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.38, origins: ["fog-lift"], lifecycleStages: ["incipient", "growing", "mature", "decaying"], organizations: ["lifting-fog"], cues: ["surface-connected genesis", "rising base", "preserved diffuse top"] }),
    ),
    "stratus-fractus": variants(
        topology({ id: "dry-forming-fractus", label: "Dry-weather forming fractus", mechanism: "fragment-merger-dissipation", connectivity: "detached-fragments", macroElementCount: [7, 36], hierarchyLevels: [4, 7], formationAspectRatio: [1.2, 7], boundaryCorrelationKm: [0.15, 2], minimumSpacingVariation: 0.52, maximumMirrorSimilarity: 0.28, origins: ["dry-fractus-transition", "radiative-cooling", "advection-cooling"], lifecycleStages: ["incipient", "growing"], organizations: ["ragged-fragment-field"], cues: ["rapidly changing shreds", "merger toward nebulosus", "no precipitation owner"] }),
        topology({ id: "dry-dissipating-fractus", label: "Dry-weather dissipating fractus", mechanism: "fragment-merger-dissipation", connectivity: "detached-fragments", macroElementCount: [4, 28], hierarchyLevels: [5, 7], formationAspectRatio: [1.2, 8], boundaryCorrelationKm: [0.12, 2], minimumSpacingVariation: 0.56, maximumMirrorSimilarity: 0.24, origins: ["dry-fractus-transition", "fog-lift"], lifecycleStages: ["decaying"], organizations: ["ragged-fragment-field"], cues: ["detached layer remnants", "eroding boundaries", "unequal luminance"] }),
        topology({ id: "sheared-low-fragment-field", label: "Sheared low fragment field", mechanism: "fragment-merger-dissipation", connectivity: "detached-fragments", macroElementCount: [6, 34], hierarchyLevels: [5, 7], formationAspectRatio: [2, 12], boundaryCorrelationKm: [0.2, 3], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.26, origins: ["dry-fractus-transition", "continental-boundary-layer"], lifecycleStages: ["growing", "mature", "decaying"], organizations: ["ragged-fragment-field"], cues: ["correlated shear", "ceaseless outline change", "nonperiodic fragment scale"] }),
    ),
    "nimbostratus": variants(
        topology({ id: "deepening-altostratus-shield", label: "Deepening Altostratus-derived shield", mechanism: "frontal-ascent", connectivity: "deep-continuous-layer", macroElementCount: [2, 6], hierarchyLevels: [6, 8], formationAspectRatio: [24, 180], boundaryCorrelationKm: [12, 90], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.52, origins: ["altostratus-thickening"], lifecycleStages: ["incipient", "growing", "mature"], organizations: ["frontal-shield"], cues: ["downward-thickening layer", "source concealed throughout", "diffuse base"] }),
        topology({ id: "generating-cell-stratiform-shield", label: "Generating-cell stratiform shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [3, 12], hierarchyLevels: [6, 9], formationAspectRatio: [20, 150], boundaryCorrelationKm: [6, 60], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.4, origins: ["altostratus-thickening", "cumulonimbus-spreading", "cumulus-spreading"], lifecycleStages: ["growing", "mature", "precipitating"], organizations: ["frontal-shield", "precipitating-shield"], cues: ["embedded upper generating cells", "hundreds-metre reflectivity variability", "horizontally smoothed fall region"] }),
        topology({ id: "thickened-low-deck-nimbostratus", label: "Thickened low-deck Nimbostratus", mechanism: "frontal-ascent", connectivity: "deep-continuous-layer", macroElementCount: [2, 8], hierarchyLevels: [6, 8], formationAspectRatio: [18, 130], boundaryCorrelationKm: [8, 70], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.38, origins: ["stratocumulus-thickening", "altocumulus-thickening"], lifecycleStages: ["growing", "mature", "precipitating"], organizations: ["frontal-shield", "precipitating-shield"], cues: ["lost low-cloud elements", "no distinct lower surface", "deep particle column"] }),
    ),
    "nimbostratus-virga": variants(
        topology({ id: "broad-rain-virga-shield", label: "Broad rain-virga shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [3, 10], hierarchyLevels: [6, 9], formationAspectRatio: [22, 160], boundaryCorrelationKm: [8, 70], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.42, origins: ["altostratus-thickening"], lifecycleStages: ["precipitating", "decaying"], organizations: ["precipitating-shield"], cues: ["attached broad fallstreaks", "subcloud evaporation", "no surface intersection"] }),
        topology({ id: "snow-virga-shield", label: "Snow-virga shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [4, 12], hierarchyLevels: [6, 9], formationAspectRatio: [18, 140], boundaryCorrelationKm: [7, 60], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.38, origins: ["altostratus-thickening", "cumulonimbus-spreading"], lifecycleStages: ["precipitating", "decaying"], organizations: ["precipitating-shield"], cues: ["aggregated ice fall region", "dry lower terminus", "source concealed"] }),
        topology({ id: "fragmenting-virga-shield", label: "Fragmenting virga shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [3, 9], hierarchyLevels: [7, 9], formationAspectRatio: [18, 120], boundaryCorrelationKm: [6, 50], minimumSpacingVariation: 0.52, maximumMirrorSimilarity: 0.32, origins: ["stratocumulus-thickening", "altocumulus-thickening"], lifecycleStages: ["decaying"], organizations: ["precipitating-shield"], cues: ["unequal trailing regions", "internal lacunae", "continuous upper shield"] }),
    ),
    "nimbostratus-praecipitatio": variants(
        topology({ id: "continuous-rain-frontal-shield", label: "Continuous-rain frontal shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [4, 14], hierarchyLevels: [7, 9], formationAspectRatio: [24, 180], boundaryCorrelationKm: [8, 80], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.4, origins: ["altostratus-thickening", "stratocumulus-thickening"], lifecycleStages: ["precipitating", "mature"], organizations: ["precipitating-shield"], cues: ["continuous rain", "melting-layer transition", "non-showery horizontal modulation"] }),
        topology({ id: "continuous-snow-frontal-shield", label: "Continuous-snow frontal shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [4, 16], hierarchyLevels: [7, 9], formationAspectRatio: [22, 170], boundaryCorrelationKm: [7, 75], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.36, origins: ["altostratus-thickening", "cumulonimbus-spreading"], lifecycleStages: ["precipitating", "mature"], organizations: ["precipitating-shield"], cues: ["upper depositional growth", "aggregation toward melting level", "continuous snow"] }),
        topology({ id: "mixed-precipitation-frontal-shield", label: "Mixed-precipitation frontal shield", mechanism: "stratiform-generating-cells", connectivity: "deep-continuous-layer", macroElementCount: [5, 18], hierarchyLevels: [7, 9], formationAspectRatio: [20, 150], boundaryCorrelationKm: [6, 70], minimumSpacingVariation: 0.52, maximumMirrorSimilarity: 0.32, origins: ["altostratus-thickening", "altocumulus-thickening", "cumulus-spreading"], lifecycleStages: ["precipitating"], organizations: ["precipitating-shield"], cues: ["sloped melting level", "ice pellets or rain/snow transition", "aperiodic embedded generating cells"] }),
    ),
    "nimbostratus-pannus": variants(
        topology({ id: "incipient-separated-pannus", label: "Incipient separated pannus", mechanism: "precipitation-moistened-turbulence", connectivity: "parent-plus-underdeck", macroElementCount: [8, 36], hierarchyLevels: [5, 8], formationAspectRatio: [1.5, 10], boundaryCorrelationKm: [0.3, 4], minimumSpacingVariation: 0.56, maximumMirrorSimilarity: 0.26, origins: ["precipitation-moistening"], lifecycleStages: ["growing", "precipitating"], organizations: ["pannus-underdeck", "precipitating-shield"], cues: ["separate dark ragged fragments", "parent visible through gaps", "vertical ownership gap"] }),
        topology({ id: "coalescing-pannus-underdeck", label: "Coalescing pannus underdeck", mechanism: "precipitation-moistened-turbulence", connectivity: "parent-plus-underdeck", macroElementCount: [12, 48], hierarchyLevels: [5, 8], formationAspectRatio: [2, 14], boundaryCorrelationKm: [0.4, 6], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.28, origins: ["precipitation-moistening"], lifecycleStages: ["mature", "precipitating"], organizations: ["pannus-underdeck", "precipitating-shield"], cues: ["merging low fragments", "ragged base retained", "lighter parent through remaining gaps"] }),
        topology({ id: "washout-limited-pannus", label: "Washout-limited heavy-rain pannus", mechanism: "precipitation-moistened-turbulence", connectivity: "parent-plus-underdeck", macroElementCount: [3, 20], hierarchyLevels: [5, 8], formationAspectRatio: [1.5, 9], boundaryCorrelationKm: [0.25, 4], minimumSpacingVariation: 0.58, maximumMirrorSimilarity: 0.22, origins: ["precipitation-moistening"], lifecycleStages: ["precipitating", "decaying"], organizations: ["pannus-underdeck", "precipitating-shield"], cues: ["heavy precipitation sweeps fragments", "continual local reformation", "unequal surviving scud"] }),
    ),
} as const satisfies Record<LowLayeredCloudRepresentation, readonly LowLayeredTopologyVariantDescriptor[]>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (left: number, right: number, amount: number) =>
    left + (right - left) * amount;
const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = clamp((value - edge0) / Math.max(1e-9, edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const assertFinite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};

export const lowLayeredCloudTopologyVariantSignature = (
    value: LowLayeredTopologyVariantDescriptor,
) => [
    value.macroElementCount[0], value.macroElementCount[1],
    value.hierarchyLevels[0], value.hierarchyLevels[1],
    Math.log(value.formationAspectRatio[0]), Math.log(value.formationAspectRatio[1]),
    Math.log(value.boundaryCorrelationKm[0]), Math.log(value.boundaryCorrelationKm[1]),
    value.minimumSpacingVariation, value.maximumMirrorSimilarity,
    value.connectivity.length / 32, value.mechanism.length / 40,
] as const;

export const lowLayeredCloudTopologySignatureDistance = (
    left: readonly number[], right: readonly number[],
) => {
    if (left.length !== right.length || left.length === 0) {
        throw new Error("Topology signatures must have equal nonzero length");
    }
    return Math.sqrt(left.reduce((sum, value, index) => {
        const scale = Math.max(1, Math.abs(value), Math.abs(right[index]));
        return sum + ((value - right[index]) / scale) ** 2;
    }, 0) / left.length);
};

export const selectLowLayeredCloudTopologyVariant = (
    representation: LowLayeredCloudRepresentation,
    deterministicVariant: number,
) => {
    if (!Number.isInteger(deterministicVariant)) {
        throw new Error("Deterministic variant must be an integer");
    }
    const available = LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation];
    return available[((deterministicVariant % available.length) + available.length) %
        available.length];
};

export interface StratocumulusProjectionInput {
    readonly representation:
        | "stratocumulus-stratiformis" | "stratocumulus-lenticularis"
        | "stratocumulus-castellanus" | "stratocumulus-floccus"
        | "stratocumulus-volutus";
    readonly elementDiameterKm: number;
    readonly formationSpanKm: number;
    readonly slantRangeKm: number;
    readonly viewElevationDegrees: number;
}

/** WMO's >5 degree comparator applies to an element, not the formation. */
export const qualifyStratocumulusProjection = (
    input: StratocumulusProjectionInput,
) => {
    for (const [name, value] of Object.entries(input)) {
        if (name !== "representation") assertFinite(name, value as number);
    }
    if (!(input.elementDiameterKm > 0 && input.formationSpanKm > 0 &&
        input.slantRangeKm > 0)) throw new Error("Physical scales and range must be positive");
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const allowed = descriptor.elementDiameterKm!;
    const angularDiameterDegrees = 2 * Math.atan(
        input.elementDiameterKm / (2 * input.slantRangeKm),
    ) * 180 / Math.PI;
    const violations: string[] = [];
    if (input.elementDiameterKm < allowed[0] || input.elementDiameterKm > allowed[1]) {
        violations.push("element-diameter-outside-physical-contract");
    }
    if (input.formationSpanKm < descriptor.formationSpanKm[0] ||
        input.formationSpanKm > descriptor.formationSpanKm[1]) {
        violations.push("formation-span-outside-physical-contract");
    }
    if (input.viewElevationDegrees > 30 && angularDiameterDegrees <= 5) {
        violations.push("stratocumulus-element-would-read-as-altocumulus-or-smaller");
    }
    return { valid: violations.length === 0, angularDiameterDegrees, violations };
};

export const stratocumulusFeasibleElementDiameterKm = (
    representation: StratocumulusProjectionInput["representation"],
    slantRangeKm: number,
    viewElevationDegrees: number,
) => {
    assertFinite("slantRangeKm", slantRangeKm);
    assertFinite("viewElevationDegrees", viewElevationDegrees);
    if (slantRangeKm <= 0) throw new Error("Slant range must be positive");
    const range = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[representation]
        .elementDiameterKm!;
    const wmoMinimum = viewElevationDegrees > 30
        ? 2 * slantRangeKm * Math.tan(5 * Math.PI / 360) : 0;
    const minimumKm = Math.max(range[0], wmoMinimum * (1 + 1e-6));
    return { feasible: minimumKm <= range[1], minimumKm, maximumKm: range[1] };
};

export type CloudSystemPlacementMode =
    | "immediate-overcast"
    | "immediate-broken-field"
    | "distant-finite-system";
export type PhysicalBoundaryMechanism =
    | "entrainment-eroded" | "frontal-moisture-gradient"
    | "cellular-cold-pool-perimeter" | "finite-wave-support"
    | "topographic-moisture-boundary"
    | "radiative-cellular-moisture-envelope"
    | "drizzle-cold-pool-network"
    | "finite-roll-moisture-corridor";

/**
 * Mesoscale organization is an independent physical axis of Sc stratiformis.
 * A stable topology seed may vary anatomy inside one regime, but cannot turn
 * an authored open-cell field into a closed deck or a radiatus street packet.
 */
export type StratocumulusStratiformisOrganizationRegime =
    | "closed-cell"
    | "open-cell"
    | "street"
    | "sparse-transition";

export interface StratocumulusStratiformisRegimeInput {
    readonly organization: CloudOrganizationState;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly coverageOktas: number;
    readonly precipitationEfficiency: number;
    readonly precipitationKind: CloudPrecipitationKind;
    readonly varieties?: readonly string[];
    /** Authored contradictions are reported instead of silently rewritten. */
    readonly strictAuthored?: boolean;
}

export interface StratocumulusStratiformisRegimeResolution {
    readonly regime: StratocumulusStratiformisOrganizationRegime;
    readonly foundationVariantId:
        | "closed-cell-radiative-deck"
        | "drizzling-open-cell-field"
        | "finite-street-and-broken-deck"
        | "closed-open-transition-mosaic";
    readonly placement: CloudSystemPlacementMode;
    readonly boundaryMechanism: PhysicalBoundaryMechanism;
    readonly coverageFraction: number;
    readonly violations: readonly string[];
}

const scRegimeFoundation = Object.freeze({
    "closed-cell": "closed-cell-radiative-deck",
    "open-cell": "drizzling-open-cell-field",
    street: "finite-street-and-broken-deck",
    "sparse-transition": "closed-open-transition-mosaic",
} as const);

const scRegimeBoundary = Object.freeze({
    "closed-cell": "radiative-cellular-moisture-envelope",
    "open-cell": "drizzle-cold-pool-network",
    street: "finite-roll-moisture-corridor",
    "sparse-transition": "drizzle-cold-pool-network",
} as const satisfies Record<
    StratocumulusStratiformisOrganizationRegime,
    PhysicalBoundaryMechanism
>);

export const resolveStratocumulusStratiformisOrganizationRegime = (
    input: StratocumulusStratiformisRegimeInput,
): StratocumulusStratiformisRegimeResolution => {
    const coverageFraction = clamp(input.coverageOktas / 8);
    const precipitationEfficiency = clamp(input.precipitationEfficiency);
    const precipitatingLifecycle = input.lifecycleStage === "precipitating" ||
        input.lifecycleStage === "decaying";
    const radiatus = input.varieties?.includes("radiatus") ?? false;
    const undulatus = input.varieties?.includes("undulatus") ?? false;
    const lacunosus = input.varieties?.includes("lacunosus") ?? false;
    const requestedOpen = input.organization.kind === "cellular" &&
        input.organization.topology === "open";
    const requestedClosed = input.organization.kind === "cellular" &&
        input.organization.topology === "closed";
    // Lacunosus is an observed hole-bearing organization, not a decorative
    // modifier. Classification can be supplied independently from a legacy
    // layer's closed-cell hint, so it must resolve the material manifold before
    // the high-cover generated-state canonicalizer runs.
    const requestedTransition = lacunosus || (
        input.organization.kind === "cellular" &&
        input.organization.topology === "lacunar"
    );
    // Stratocumulus undulatus is a gravity-wave/band state, not a closed-cell
    // deck with a decorative displacement. The current dense atlas has one
    // finite coherent-band manifold (`street`), so route both an explicit
    // wave packet and the WMO variety to it before Sc adaptation can
    // canonicalize the owner back into a cellular organization.
    const requestedStreet = radiatus || undulatus ||
        input.organization.kind === "banded" ||
        input.organization.kind === "wave-packet";
    const warmRainActive = input.precipitationKind !== "none" &&
        precipitationEfficiency >= 0.28;
    const openLifecycle = input.lifecycleStage === "mature" ||
        precipitatingLifecycle;
    const violations: string[] = [];

    let regime: StratocumulusStratiformisOrganizationRegime;
    if (requestedStreet) {
        regime = "street";
    } else if (requestedOpen) {
        if (!openLifecycle) {
            violations.push("open-cell-lifecycle-is-not-mature-or-precipitating");
        }
        if (coverageFraction > 0.68) {
            violations.push("open-cell-coverage-exceeds-physical-regime");
        }
        if (input.strictAuthored ||
            openLifecycle && coverageFraction <= 0.68) {
            regime = "open-cell";
        } else if (warmRainActive) {
            regime = "sparse-transition";
        } else {
            regime = "closed-cell";
        }
    } else if (requestedTransition) {
        regime = "sparse-transition";
    } else if (requestedClosed) {
        regime = precipitatingLifecycle && warmRainActive &&
            coverageFraction < 0.58
            ? "sparse-transition"
            : "closed-cell";
    } else if (coverageFraction < 0.34 ||
        precipitatingLifecycle && warmRainActive && coverageFraction < 0.58) {
        regime = "sparse-transition";
    } else {
        regime = "closed-cell";
    }

    // A high-cover generated open/transition state is a dense radiative deck,
    // not an open-cell field stretched until its clear centres disappear.
    if (!input.strictAuthored && coverageFraction >= 0.72 &&
        regime !== "street" && !lacunosus) {
        regime = "closed-cell";
    }
    const placement: CloudSystemPlacementMode = regime === "closed-cell" &&
        coverageFraction >= 0.72
        ? "immediate-overcast"
        : coverageFraction >= 0.46
            ? "immediate-broken-field"
            : "distant-finite-system";
    return {
        regime,
        foundationVariantId: scRegimeFoundation[regime],
        placement,
        boundaryMechanism: scRegimeBoundary[regime],
        coverageFraction,
        violations,
    };
};

export interface LowLayeredSystemDomainInput {
    readonly representation: LowLayeredCloudRepresentation;
    readonly placement: CloudSystemPlacementMode;
    readonly boundaryMechanism: PhysicalBoundaryMechanism;
    readonly horizontalSpanKm: number;
    readonly boundaryTransitionKm: number;
    readonly cameraInsideCondensateDomain: boolean;
    readonly skyCoverageFraction: number;
    readonly horizonContactFraction: number;
    /** True only when density support is generated in world space. */
    readonly generatedFiniteSupport: boolean;
    /** A post-density screen/world mask must never define the cloud boundary. */
    readonly postDensityMaskWeight: number;
    /**
     * True for a WMO special-origin cloud whose finite waterfall, vegetation,
     * or industrial source—not the ordinary synoptic descriptor—sets span.
     */
    readonly locallyForcedFiniteSource?: boolean;
    /**
     * A real genitus/mutatus daughter whose finite support is constrained by
     * a separately materialized mother owner. Its span and placement are
     * qualified by the cross-owner attachment contract, not by the standalone
     * deck's immediate-vs-distant preset.
     */
    readonly causallyAttachedFiniteSource?: boolean;
}

export const qualifyLowLayeredSystemDomain = (
    input: LowLayeredSystemDomainInput,
) => {
    for (const [name, value] of Object.entries({
        horizontalSpanKm: input.horizontalSpanKm,
        boundaryTransitionKm: input.boundaryTransitionKm,
        skyCoverageFraction: input.skyCoverageFraction,
        horizonContactFraction: input.horizonContactFraction,
        postDensityMaskWeight: input.postDensityMaskWeight,
    })) assertFinite(name, value);
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const violations: string[] = [];
    const externallyConstrainedDomain = input.locallyForcedFiniteSource ||
        input.causallyAttachedFiniteSource;
    if (!(input.horizontalSpanKm > 0) ||
        !externallyConstrainedDomain && (
            input.horizontalSpanKm < descriptor.formationSpanKm[0] ||
            input.horizontalSpanKm > descriptor.formationSpanKm[1]
        )) {
        violations.push("formation-span-outside-physical-contract");
    }
    if (!(input.boundaryTransitionKm > 0) ||
        input.boundaryTransitionKm / input.horizontalSpanKm < 0.002 ||
        input.boundaryTransitionKm / input.horizontalSpanKm > 0.28) {
        violations.push("boundary-transition-is-not-a-physical-weather-gradient");
    }
    if (!input.generatedFiniteSupport) {
        violations.push("cloud-system-must-generate-finite-world-space-support");
    }
    if (input.postDensityMaskWeight > 0.02) {
        violations.push("post-density-mask-cannot-create-system-boundary");
    }
    if (input.causallyAttachedFiniteSource) {
        // Cross-owner compilation already requires finite generated support,
        // vertical overlap, shared motion/material ancestry, and horizontal
        // attachment. Reapplying a standalone coverage-derived placement mode
        // would reject legitimate daughters at a mother system's perimeter.
    } else if (input.placement === "immediate-overcast") {
        if (!input.cameraInsideCondensateDomain) {
            violations.push("immediate-overcast-camera-must-be-inside-horizontal-domain");
        }
        if (input.skyCoverageFraction < 0.68) {
            violations.push("immediate-overcast-needs-overhead-continuity");
        }
    } else if (input.placement === "immediate-broken-field") {
        if (!input.cameraInsideCondensateDomain) {
            violations.push("immediate-broken-field-camera-must-be-inside-domain");
        }
        if (input.skyCoverageFraction < 0.18 ||
            input.skyCoverageFraction > 0.82) {
            violations.push("immediate-broken-field-needs-partial-sky-coverage");
        }
    } else {
        if (input.cameraInsideCondensateDomain) {
            violations.push("distant-system-camera-must-be-outside-horizontal-domain");
        }
        if (input.skyCoverageFraction > 0.76) {
            violations.push("distant-system-cannot-simultaneously-read-as-immediate-overcast");
        }
        if (input.horizonContactFraction < 0.08 &&
            input.boundaryMechanism !== "finite-wave-support" &&
            input.boundaryMechanism !== "topographic-moisture-boundary") {
            violations.push("distant-low-system-needs-believable-horizon-or-terrain-contact");
        }
    }
    if (input.boundaryMechanism === "finite-wave-support" &&
        input.representation !== "stratocumulus-lenticularis" &&
        input.representation !== "stratocumulus-volutus") {
        violations.push("finite-wave-boundary-is-not-valid-for-this-representation");
    }
    return { valid: violations.length === 0, violations };
};

export interface LowLayeredOpticalMaterialContract {
    readonly phaseModel: "droplet-hg-draine" | "mixed-droplet-rough-ice";
    readonly sourceVisibility: "sharp-or-concealed-by-local-optical-depth" | "always-concealed";
    readonly directShadowModel: "source-aligned-beer";
    readonly multipleScatteringModel: "p1-diffusion-or-equivalent";
    readonly atmosphereCoupling: "spectral-source-and-view-transmittance";
    readonly allowsSilverLining: boolean;
    readonly allowsHalo: boolean;
    readonly allowsCoronaOrIrisation: boolean;
    readonly lowerBoundaryGroundBounceWeight: readonly [number, number];
}

export const LOW_LAYERED_OPTICAL_MATERIAL_CONTRACTS = {
    stratocumulus: {
        phaseModel: "droplet-hg-draine", sourceVisibility: "sharp-or-concealed-by-local-optical-depth",
        directShadowModel: "source-aligned-beer", multipleScatteringModel: "p1-diffusion-or-equivalent",
        atmosphereCoupling: "spectral-source-and-view-transmittance", allowsSilverLining: true,
        allowsHalo: true, allowsCoronaOrIrisation: true,
        lowerBoundaryGroundBounceWeight: [0.04, 0.32],
    },
    stratus: {
        phaseModel: "droplet-hg-draine", sourceVisibility: "sharp-or-concealed-by-local-optical-depth",
        directShadowModel: "source-aligned-beer", multipleScatteringModel: "p1-diffusion-or-equivalent",
        atmosphereCoupling: "spectral-source-and-view-transmittance", allowsSilverLining: false,
        allowsHalo: true, allowsCoronaOrIrisation: true,
        lowerBoundaryGroundBounceWeight: [0.08, 0.42],
    },
    nimbostratus: {
        phaseModel: "mixed-droplet-rough-ice", sourceVisibility: "always-concealed",
        directShadowModel: "source-aligned-beer", multipleScatteringModel: "p1-diffusion-or-equivalent",
        atmosphereCoupling: "spectral-source-and-view-transmittance", allowsSilverLining: false,
        allowsHalo: false, allowsCoronaOrIrisation: false,
        lowerBoundaryGroundBounceWeight: [0.02, 0.24],
    },
} as const satisfies Record<LowLayeredCloudGenus, LowLayeredOpticalMaterialContract>;

export type LowLayeredIceHabit = "small-column" | "plate" | "needle" | "aggregate" | "snowflake";
export type LowLayeredIceHabitFractions = Readonly<Record<LowLayeredIceHabit, number>>;

interface MicrophysicsProfile {
    readonly liquidRadiusMicrons: readonly [number, number];
    readonly iceRadiusMicrons: readonly [number, number];
    readonly condensate: number;
    readonly baseIceFraction: number;
    readonly coldSensitivity: number;
    readonly drizzleThreshold: number;
    readonly edgeErosion: number;
}

const profile = (value: MicrophysicsProfile) => value;
export const LOW_LAYERED_MICROPHYSICS_PROFILES = Object.fromEntries(
    LOW_LAYERED_CLOUD_REPRESENTATIONS.map((representation) => {
        const genus = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[representation].genus;
        if (genus === "stratocumulus") return [representation, profile({
            liquidRadiusMicrons: representation === "stratocumulus-stratiformis" ? [8, 19] : [7, 17],
            iceRadiusMicrons: [24, 88], condensate: representation === "stratocumulus-castellanus" ? 0.82 : 0.68,
            baseIceFraction: 0.015, coldSensitivity: 0.48, drizzleThreshold: 0.58, edgeErosion: 0.5,
        })];
        if (genus === "stratus") return [representation, profile({
            liquidRadiusMicrons: [4, 13], iceRadiusMicrons: [18, 58],
            condensate: representation === "stratus-nebulosus" ? 0.56 : 0.38,
            baseIceFraction: 0.01, coldSensitivity: 0.62, drizzleThreshold: 0.66, edgeErosion: 0.72,
        })];
        return [representation, profile({
            liquidRadiusMicrons: [9, 24], iceRadiusMicrons: [32, 220],
            condensate: representation === "nimbostratus" ? 0.78 : 0.92,
            baseIceFraction: 0.34, coldSensitivity: 0.76, drizzleThreshold: 0.34, edgeErosion: 0.36,
        })];
    }),
) as Record<LowLayeredCloudRepresentation, MicrophysicsProfile>;

export interface LowLayeredLocalMicrophysicsInput {
    readonly representation: LowLayeredCloudRepresentation;
    /** Zero at the cloud-layer bottom, one at its top. */
    readonly normalizedHeight: number;
    /** Zero at system edge, one in stable interior support. */
    readonly normalizedBoundaryDistance: number;
    readonly coherentCoreFraction: number;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: LowLayeredOrigin;
    readonly temperatureKelvin: number;
    readonly turbulenceDissipation: number;
    readonly opticalDepth: number;
    readonly precipitation: LowLayeredPrecipitation;
    /** Height of 0 C level in normalized layer coordinates; null if absent. */
    readonly normalizedMeltingLevel: number | null;
}

export interface LowLayeredLocalMicrophysics {
    readonly liquidEffectiveRadiusMicrons: number;
    readonly iceEffectiveRadiusMicrons: number;
    readonly liquidFraction: number;
    readonly iceFraction: number;
    readonly precipitationMassFraction: number;
    readonly relativeCondensate: number;
    readonly iceHabitFractions: LowLayeredIceHabitFractions;
    readonly cloudTopLongwaveCoolingWeight: number;
    readonly radiativelyDrivenTurbulenceWeight: number;
    readonly sourceAlignedExtinctionScale: number;
    readonly dropletForwardPeakWeight: number;
    readonly iceSurfaceRoughness: number;
    readonly meltingFraction: number;
    readonly evaporationOrSublimationFraction: number;
    readonly sourceDiscSharpness: number;
}

const normalizedHabits = (values: Record<LowLayeredIceHabit, number>) => {
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [key, value / Math.max(1e-9, total)])) as LowLayeredIceHabitFractions;
};

export const sampleLowLayeredLocalMicrophysics = (
    input: LowLayeredLocalMicrophysicsInput,
): LowLayeredLocalMicrophysics => {
    for (const [name, value] of Object.entries({
        normalizedHeight: input.normalizedHeight,
        normalizedBoundaryDistance: input.normalizedBoundaryDistance,
        coherentCoreFraction: input.coherentCoreFraction,
        temperatureKelvin: input.temperatureKelvin,
        turbulenceDissipation: input.turbulenceDissipation,
        opticalDepth: input.opticalDepth,
    })) assertFinite(name, value);
    if (!(input.temperatureKelvin > 0) || input.turbulenceDissipation < 0 ||
        input.opticalDepth < 0) {
        throw new Error("Temperature must be positive; turbulence and optical depth nonnegative");
    }
    if (input.normalizedMeltingLevel !== null) {
        assertFinite("normalizedMeltingLevel", input.normalizedMeltingLevel);
    }
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const p = LOW_LAYERED_MICROPHYSICS_PROFILES[input.representation];
    const height = clamp(input.normalizedHeight);
    const boundary = clamp(input.normalizedBoundaryDistance);
    const core = clamp(input.coherentCoreFraction);
    const cold = clamp((258.15 - input.temperatureKelvin) / 35);
    const eroding = input.lifecycleStage === "decaying" ? 0.36
        : input.lifecycleStage === "glaciating" ? 0.16 : 0;
    let iceFraction: number;
    if (descriptor.genus === "nimbostratus") {
        const upperIce = smoothstep(0.35, 0.9, height);
        iceFraction = clamp(0.1 + upperIce * 0.82 + cold * 0.08, 0.04, 0.995);
    } else {
        const extremeColdIce = smoothstep(0.45, 0.95, cold);
        iceFraction = clamp(p.baseIceFraction + extremeColdIce * p.coldSensitivity *
            mix(0.45, 1, 1 - height), 0, descriptor.genus === "stratus" ? 0.92 : 0.72);
    }
    const liquidFraction = 1 - iceFraction;
    const precipitationActive = input.precipitation !== "none";
    const precipitationBase = input.precipitation === "virga" ? 0.36
        : input.precipitation === "drizzle" ? 0.28
            : precipitationActive ? 0.72 : 0;
    const precipitationMassFraction = clamp(precipitationBase *
        mix(1, 0.35, height) * mix(0.55, 1, core));
    const meltingLevel = input.normalizedMeltingLevel;
    const meltingFraction = descriptor.genus === "nimbostratus" &&
        meltingLevel !== null
        ? Math.exp(-(((height - clamp(meltingLevel)) / 0.065) ** 2))
        : 0;
    const edgeErosion = (1 - smoothstep(0.02, 0.32, boundary)) * p.edgeErosion;
    const precipEvaporation = input.precipitation === "virga"
        ? smoothstep(0.15, 0.65, 1 - height) : 0;
    const relativeCondensate = clamp(p.condensate * mix(0.5, 1.1, core) *
        (1 - edgeErosion) * (1 - eroding) * (1 - precipEvaporation * 0.55));
    const topCooling = Math.exp(-(((1 - height) / 0.13) ** 2)) *
        (descriptor.genus === "nimbostratus" ? 0.35 : 1);
    const turbulenceResponse = Math.exp(-(((height - 0.68) / 0.24) ** 2)) *
        mix(0.45, 1, clamp(input.turbulenceDissipation / 0.08));
    const aggregation = descriptor.genus === "nimbostratus"
        ? smoothstep(0.2, 0.72, 1 - height) : 0;
    const iceHabits = normalizedHabits({
        "small-column": mix(0.34, 0.08, aggregation),
        plate: mix(0.28, 0.08, aggregation),
        needle: mix(0.2, 0.09, aggregation),
        aggregate: mix(0.12, 0.48, aggregation),
        snowflake: mix(0.06, 0.27, aggregation),
    });
    const liquidRadius = mix(p.liquidRadiusMicrons[0], p.liquidRadiusMicrons[1],
        clamp(core * 0.55 + precipitationMassFraction * 0.45));
    const iceRadius = mix(p.iceRadiusMicrons[0], p.iceRadiusMicrons[1],
        clamp(aggregation * 0.65 + precipitationMassFraction * 0.35));
    const sourceDiscSharpness = descriptor.genus === "nimbostratus" ? 0
        : descriptor.genus === "stratus"
            ? clamp(1 - input.opticalDepth / 4) : clamp(1 - input.opticalDepth / 7);
    return {
        liquidEffectiveRadiusMicrons: liquidRadius,
        iceEffectiveRadiusMicrons: iceRadius,
        liquidFraction,
        iceFraction,
        precipitationMassFraction,
        relativeCondensate,
        iceHabitFractions: iceHabits,
        cloudTopLongwaveCoolingWeight: topCooling,
        radiativelyDrivenTurbulenceWeight: turbulenceResponse,
        sourceAlignedExtinctionScale: mix(0.55, 1.35, relativeCondensate) *
            mix(0.9, 1.18, precipitationMassFraction),
        dropletForwardPeakWeight: liquidFraction * mix(0.72, 0.92,
            clamp((liquidRadius - 4) / 20)),
        iceSurfaceRoughness: clamp(0.22 + aggregation * 0.5 + eroding * 0.2, 0.12, 0.9),
        meltingFraction,
        evaporationOrSublimationFraction: clamp(edgeErosion + precipEvaporation * 0.72 + eroding),
        sourceDiscSharpness,
    };
};

export type UnderdeckCloudKind = "dry-stratus-fractus" | "wet-pannus";
export interface UnderdeckOwnershipInput {
    readonly kind: UnderdeckCloudKind;
    readonly parentRepresentation: LowLayeredCloudRepresentation | null;
    readonly precipitationActive: boolean;
    readonly parentGapKm: number;
    readonly mergedWithParentFraction: number;
    readonly precipitationIntensity: number;
    readonly relativeHumidity: number;
}

export const qualifyUnderdeckOwnership = (input: UnderdeckOwnershipInput) => {
    for (const [name, value] of Object.entries({
        parentGapKm: input.parentGapKm,
        mergedWithParentFraction: input.mergedWithParentFraction,
        precipitationIntensity: input.precipitationIntensity,
        relativeHumidity: input.relativeHumidity,
    })) assertFinite(name, value);
    const violations: string[] = [];
    if (input.kind === "wet-pannus") {
        if (input.parentRepresentation !== "nimbostratus-pannus" &&
            input.parentRepresentation !== "nimbostratus-praecipitatio") {
            violations.push("wet-pannus-needs-precipitating-parent-owner");
        }
        if (!input.precipitationActive || input.relativeHumidity < 0.78) {
            violations.push("wet-pannus-needs-precipitation-moistened-air");
        }
        if (input.parentGapKm < 0 && input.mergedWithParentFraction < 0.9) {
            violations.push("overlapping-underdeck-must-explicitly-merge-with-parent");
        }
    } else {
        if (input.precipitationActive || input.parentRepresentation?.startsWith("nimbostratus")) {
            violations.push("dry-fractus-cannot-alias-wet-pannus");
        }
    }
    return { valid: violations.length === 0, violations };
};

/**
 * WMO notes that pannus first increases and merges, but heavy precipitation
 * can sweep particles out faster than replacement. This produces a peaked,
 * not monotonic, coverage response.
 */
export const samplePannusUnderdeckState = (
    precipitationIntensity: number,
    relativeHumidity: number,
    turbulentMoistening: number,
) => {
    [precipitationIntensity, relativeHumidity, turbulentMoistening].forEach(
        (value, index) => assertFinite(`pannus input ${index}`, value),
    );
    const rain = clamp(precipitationIntensity);
    const humidity = clamp(relativeHumidity);
    const turbulence = clamp(turbulentMoistening);
    const formation = smoothstep(0.08, 0.5, rain) *
        smoothstep(0.72, 0.98, humidity) * mix(0.55, 1, turbulence);
    const washout = smoothstep(0.72, 1, rain) * mix(0.55, 1, 1 - turbulence);
    const coverageFraction = clamp(formation * (1 - washout * 0.72));
    return {
        coverageFraction,
        fragmentCountScale: clamp(formation * (1 - washout * 0.4)),
        parentMergeFraction: smoothstep(0.42, 0.86, coverageFraction),
        washoutFraction: washout,
        parentVisibleThroughGaps: coverageFraction < 0.86,
    };
};

export interface LowLayeredProductionStateInput {
    readonly representation: LowLayeredCloudRepresentation;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: LowLayeredOrigin;
    readonly organization: LowLayeredOrganization;
    readonly precipitation: LowLayeredPrecipitation;
    readonly opticalDepth: number;
    readonly instability: number;
    readonly environment: LowLayeredBenchmarkEnvironment;
}

const legalOrigins: Record<LowLayeredCloudRepresentation, readonly LowLayeredOrigin[]> =
    Object.fromEntries(LOW_LAYERED_CLOUD_REPRESENTATIONS.map((representation) => [
        representation,
        [...new Set(LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation]
            .flatMap((variant) => variant.origins))],
    ])) as unknown as Record<LowLayeredCloudRepresentation, readonly LowLayeredOrigin[]>;
const legalOrganizations: Record<LowLayeredCloudRepresentation, readonly LowLayeredOrganization[]> =
    Object.fromEntries(LOW_LAYERED_CLOUD_REPRESENTATIONS.map((representation) => [
        representation,
        [...new Set(LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation]
            .flatMap((variant) => variant.organizations))],
    ])) as unknown as Record<LowLayeredCloudRepresentation, readonly LowLayeredOrganization[]>;
const legalStages: Record<LowLayeredCloudRepresentation, readonly CloudLifecycleStage[]> =
    Object.fromEntries(LOW_LAYERED_CLOUD_REPRESENTATIONS.map((representation) => [
        representation,
        [...new Set(LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation]
            .flatMap((variant) => variant.lifecycleStages))],
    ])) as unknown as Record<LowLayeredCloudRepresentation, readonly CloudLifecycleStage[]>;

export const LOW_LAYERED_REACHABILITY_CONTRACTS = Object.fromEntries(
    LOW_LAYERED_CLOUD_REPRESENTATIONS.map((representation) => [representation, {
        origins: legalOrigins[representation],
        organizations: legalOrganizations[representation],
        lifecycleStages: legalStages[representation],
    }]),
) as Record<LowLayeredCloudRepresentation, {
    readonly origins: readonly LowLayeredOrigin[];
    readonly organizations: readonly LowLayeredOrganization[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
}>;

export const qualifyLowLayeredProductionState = (
    input: LowLayeredProductionStateInput,
) => {
    assertFinite("opticalDepth", input.opticalDepth);
    assertFinite("instability", input.instability);
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const reachability = LOW_LAYERED_REACHABILITY_CONTRACTS[input.representation];
    const violations: string[] = [];
    if (!LOW_LAYERED_BENCHMARK_ENVIRONMENTS.includes(input.environment)) {
        violations.push("unknown-photograph-qualification-environment");
    }
    if (!reachability.origins.includes(input.origin)) violations.push("illegal-origin");
    if (!reachability.organizations.includes(input.organization)) violations.push("illegal-organization");
    if (!reachability.lifecycleStages.includes(input.lifecycleStage)) violations.push("illegal-lifecycle-stage");
    if (input.opticalDepth < descriptor.opticalDepth[0] ||
        input.opticalDepth > descriptor.opticalDepth[1]) {
        violations.push("optical-depth-outside-representation-range");
    }
    if (input.representation === "stratocumulus-castellanus" && input.instability < 0.25) {
        violations.push("insufficient-instability-for-castellanus");
    }
    if (input.representation === "nimbostratus-virga" && input.precipitation !== "virga") {
        violations.push("virga-state-requires-evaporating-precipitation");
    }
    if ((input.representation === "nimbostratus-praecipitatio" ||
        input.representation === "nimbostratus-pannus") &&
        !["rain", "snow", "ice-pellets"].includes(input.precipitation)) {
        violations.push("praecipitatio-state-requires-continuous-ground-precipitation");
    }
    if (input.representation === "stratus-fractus" && input.precipitation !== "none") {
        violations.push("stratus-fractus-representation-is-dry-not-pannus");
    }
    return { legal: violations.length === 0, violations };
};

const LEGAL_TRANSITIONS: Readonly<Record<LowLayeredCloudRepresentation, readonly LowLayeredCloudRepresentation[]>> = {
    "stratocumulus-stratiformis": ["stratocumulus-stratiformis", "stratus-nebulosus", "nimbostratus"],
    "stratocumulus-lenticularis": ["stratocumulus-lenticularis"],
    "stratocumulus-castellanus": ["stratocumulus-castellanus", "stratocumulus-floccus"],
    "stratocumulus-floccus": ["stratocumulus-floccus", "stratocumulus-stratiformis"],
    "stratocumulus-volutus": ["stratocumulus-volutus", "stratocumulus-stratiformis"],
    "stratus-nebulosus": ["stratus-nebulosus", "stratus-fractus", "stratocumulus-stratiformis"],
    "stratus-fractus": ["stratus-fractus", "stratus-nebulosus"],
    nimbostratus: ["nimbostratus", "nimbostratus-virga", "nimbostratus-praecipitatio"],
    "nimbostratus-virga": ["nimbostratus-virga", "nimbostratus", "nimbostratus-praecipitatio"],
    "nimbostratus-praecipitatio": ["nimbostratus-praecipitatio", "nimbostratus-pannus", "nimbostratus-virga", "nimbostratus"],
    "nimbostratus-pannus": ["nimbostratus-pannus", "nimbostratus-praecipitatio", "nimbostratus"],
};

export const isLegalLowLayeredRepresentationTransition = (
    from: LowLayeredCloudRepresentation,
    to: LowLayeredCloudRepresentation,
) => LEGAL_TRANSITIONS[from].includes(to);

export const LOW_LAYERED_EXTERNAL_TRANSITION_CONTRACTS = Object.freeze({
    "stratocumulus-castellanus": ["cumulus-congestus-stratocumulogenitus", "cumulonimbus-stratocumulogenitus"],
    nimbostratus: ["altostratus-altostratomutatus", "stratocumulus-stratocumulomutatus", "altocumulus-altocumulomutatus", "cumulonimbus-cumulonimbogenitus", "cumulus-congestus-cumulogenitus"],
});

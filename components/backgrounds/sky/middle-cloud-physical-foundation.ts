/**
 * Renderer-independent physical contracts for Altocumulus species and the
 * Altostratus variety/supplementary states represented by Elements.
 *
 * WMO gives Altostratus no species. The entries below are physical render
 * representations of orthogonal varieties/features. They retain the shared
 * `altostratus-opacus` renderer species while exposing genuinely different
 * topology, material, reachability, and adapter state to production.
 */

import type { CloudLifecycleStage } from "./cloud-state-map";

export const MIDDLE_CLOUD_REPRESENTATIONS = [
    "altocumulus-stratiformis",
    "altocumulus-lenticularis",
    "altocumulus-castellanus",
    "altocumulus-floccus",
    "altocumulus-volutus",
    "altostratus-translucidus",
    "altostratus-opacus",
    "altostratus-duplicatus",
    "altostratus-undulatus",
    "altostratus-radiatus",
    "altostratus-praecipitatio",
] as const;

export type MiddleCloudRepresentation =
    (typeof MIDDLE_CLOUD_REPRESENTATIONS)[number];
export type MiddleCloudGenus = "altocumulus" | "altostratus";
export type ExistingMiddleCloudRendererSpecies =
    | "altocumulus-stratiformis"
    | "altocumulus-lenticularis"
    | "altocumulus-castellanus"
    | "altocumulus-floccus"
    | "altocumulus-volutus"
    | "altostratus-opacus";

export type MiddleCloudClassificationAxis =
    | "wmo-species"
    | "wmo-variety"
    | "wmo-supplementary-feature";
export type MiddleCloudElementKind =
    | "rounded-element"
    | "lens-constituent"
    | "turret-width"
    | "tuft-width"
    | "roll-cross-section"
    | "continuous-layer";
export type MiddleCloudTransparency =
    | "variety-dependent"
    | "translucidus"
    | "opacus"
    | "either";
export type MiddleCloudSourceDiscVisibility =
    | "not-applicable"
    | "sharp-outline"
    | "blurred-position"
    | "concealed";
export type MiddleCloudPrecipitation =
    | "none"
    | "virga"
    | "rain"
    | "snow"
    | "ice-pellets";

export interface AltocumulusAngularConstraint {
    readonly minimumViewElevationDegrees: number;
    readonly minimumElementDiameterDegrees: number;
    readonly maximumElementDiameterDegrees: number;
    readonly appliesToFormationEnvelope: false;
    readonly appliesToMostRegularSmallElements: true;
}

export interface MiddleCloudRepresentationDescriptor {
    readonly representation: MiddleCloudRepresentation;
    readonly genus: MiddleCloudGenus;
    readonly rendererSpecies: ExistingMiddleCloudRendererSpecies;
    readonly classificationAxis: MiddleCloudClassificationAxis;
    readonly wmoAbbreviation: string;
    readonly wmoDefinition: string;
    readonly wmoSource: string;
    readonly physicalConstitutionSource: string;
    readonly elementKind: MiddleCloudElementKind;
    /** Null for a continuous Altostratus layer without repeated cloud elements. */
    readonly elementDiameterKm: readonly [number, number] | null;
    readonly formationSpanKm: readonly [number, number];
    readonly geometricDepthKm: readonly [number, number];
    readonly verticalAspect: readonly [number, number];
    readonly angularConstraint: AltocumulusAngularConstraint | null;
    readonly transparency: MiddleCloudTransparency;
    readonly opticalDepth: readonly [number, number];
    readonly sourceDiscVisibility: MiddleCloudSourceDiscVisibility;
    readonly permitsHalo: boolean;
    readonly permitsCoronaOrIrisation: boolean;
    readonly requiredMorphology: readonly string[];
    readonly forbiddenMorphology: readonly string[];
    readonly classification: {
        readonly wmoSpecies: string | null;
        readonly requiredVarieties: readonly string[];
        readonly requiredSupplementaryFeatures: readonly string[];
    };
}

const ALTOCUMULUS_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-altocumulus.html";
const ALTOSTRATUS_CONSTITUTION =
    "https://cloudatlas.wmo.int/en/physical-constitution-altostratus.html";

const altocumulusAngularConstraint = (): AltocumulusAngularConstraint => ({
    minimumViewElevationDegrees: 30,
    minimumElementDiameterDegrees: 1,
    maximumElementDiameterDegrees: 5,
    appliesToFormationEnvelope: false,
    appliesToMostRegularSmallElements: true,
});

export const MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS = {
    "altocumulus-stratiformis": {
        representation: "altocumulus-stratiformis",
        genus: "altocumulus",
        rendererSpecies: "altocumulus-stratiformis",
        classificationAxis: "wmo-species",
        wmoAbbreviation: "Ac str",
        wmoDefinition: "An extensive sheet or layer of separate or merged Altocumulus elements.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-altocumulus-stratiformis-ac-str.html",
        physicalConstitutionSource: ALTOCUMULUS_CONSTITUTION,
        elementKind: "rounded-element",
        elementDiameterKm: [0.22, 2.5],
        formationSpanKm: [8, 120],
        geometricDepthKm: [0.15, 1.2],
        verticalAspect: [0.08, 0.48],
        angularConstraint: altocumulusAngularConstraint(),
        transparency: "variety-dependent",
        opticalDepth: [0.35, 10],
        sourceDiscVisibility: "not-applicable",
        permitsHalo: true,
        permitsCoronaOrIrisation: true,
        requiredMorphology: ["extensive finite sheet", "one-to-five-degree elements", "separate or merged bodies", "natural shading"],
        forbiddenMorphology: ["cirrocumulus-scale grains", "marine lattice reused unchanged", "equal puff grid", "unbounded owner repetition"],
        classification: { wmoSpecies: "stratiformis", requiredVarieties: [], requiredSupplementaryFeatures: [] },
    },
    "altocumulus-lenticularis": {
        representation: "altocumulus-lenticularis",
        genus: "altocumulus",
        rendererSpecies: "altocumulus-lenticularis",
        classificationAxis: "wmo-species",
        wmoAbbreviation: "Ac len",
        wmoDefinition: "A usually well-defined elongated lens or almond, either granular or one smooth shaded unit.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-altocumulus-lenticularis-ac-len.html",
        physicalConstitutionSource: ALTOCUMULUS_CONSTITUTION,
        elementKind: "lens-constituent",
        elementDiameterKm: [0.25, 4],
        formationSpanKm: [3, 70],
        geometricDepthKm: [0.08, 0.9],
        verticalAspect: [0.025, 0.2],
        angularConstraint: altocumulusAngularConstraint(),
        transparency: "variety-dependent",
        opticalDepth: [0.4, 14],
        sourceDiscVisibility: "not-applicable",
        permitsHalo: true,
        permitsCoronaOrIrisation: true,
        requiredMorphology: ["finite stationary wave support", "defined elongated outline", "smooth unit or tightly grouped elements", "pronounced physical shading when smooth"],
        forbiddenMorphology: ["identical saucer grid", "screen-space oval", "globally periodic bands", "turbulent cauliflower edge"],
        classification: { wmoSpecies: "lenticularis", requiredVarieties: [], requiredSupplementaryFeatures: [] },
    },
    "altocumulus-castellanus": {
        representation: "altocumulus-castellanus",
        genus: "altocumulus",
        rendererSpecies: "altocumulus-castellanus",
        classificationAxis: "wmo-species",
        wmoAbbreviation: "Ac cas",
        wmoDefinition: "Cumuliform turrets, sometimes taller than wide, rising in lines from a common horizontal base.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-altocumulus-castellanus-ac-cas.html",
        physicalConstitutionSource: ALTOCUMULUS_CONSTITUTION,
        elementKind: "turret-width",
        elementDiameterKm: [0.28, 3.2],
        formationSpanKm: [2, 36],
        geometricDepthKm: [0.4, 3.4],
        verticalAspect: [0.42, 1.8],
        angularConstraint: altocumulusAngularConstraint(),
        transparency: "variety-dependent",
        opticalDepth: [0.7, 18],
        sourceDiscVisibility: "not-applicable",
        permitsHalo: true,
        permitsCoronaOrIrisation: true,
        requiredMorphology: ["one common horizontal base", "unequal turret line", "crenellated side silhouette", "mid-level instability"],
        forbiddenMorphology: ["detached equal puffs", "capsule row", "three cloned bases", "deep-convective mushroom retained as Ac"],
        classification: { wmoSpecies: "castellanus", requiredVarieties: [], requiredSupplementaryFeatures: [] },
    },
    "altocumulus-floccus": {
        representation: "altocumulus-floccus",
        genus: "altocumulus",
        rendererSpecies: "altocumulus-floccus",
        classificationAxis: "wmo-species",
        wmoAbbreviation: "Ac flo",
        wmoDefinition: "Small cumuliform tufts with ragged lower parts, often accompanied by ice-crystal virga.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-altocumulus-floccus-ac-flo.html",
        physicalConstitutionSource: ALTOCUMULUS_CONSTITUTION,
        elementKind: "tuft-width",
        elementDiameterKm: [0.22, 2.7],
        formationSpanKm: [2, 40],
        geometricDepthKm: [0.3, 2.8],
        verticalAspect: [0.35, 1.4],
        angularConstraint: altocumulusAngularConstraint(),
        transparency: "variety-dependent",
        opticalDepth: [0.5, 13],
        sourceDiscVisibility: "not-applicable",
        permitsHalo: true,
        permitsCoronaOrIrisation: true,
        requiredMorphology: ["detached unequal tufts", "ragged lower parts", "optional fibrous ice virga", "castellanus-base dissipation continuity"],
        forbiddenMorphology: ["smooth ovals", "retained shared base", "uniform Poisson beads", "rain shaft without glaciation"],
        classification: { wmoSpecies: "floccus", requiredVarieties: [], requiredSupplementaryFeatures: [] },
    },
    "altocumulus-volutus": {
        representation: "altocumulus-volutus",
        genus: "altocumulus",
        rendererSpecies: "altocumulus-volutus",
        classificationAxis: "wmo-species",
        wmoAbbreviation: "Ac vol",
        wmoDefinition: "A rare, long, detached horizontal tube, usually a single line and seldom horizon-to-horizon.",
        wmoSource: "https://cloudatlas.wmo.int/en/species-altocumulus-volutus-ac-vol.html",
        physicalConstitutionSource: ALTOCUMULUS_CONSTITUTION,
        elementKind: "roll-cross-section",
        elementDiameterKm: [0.4, 4.5],
        formationSpanKm: [12, 160],
        geometricDepthKm: [0.35, 2.6],
        verticalAspect: [0.22, 0.9],
        angularConstraint: altocumulusAngularConstraint(),
        transparency: "variety-dependent",
        opticalDepth: [0.7, 16],
        sourceDiscVisibility: "not-applicable",
        permitsHalo: true,
        permitsCoronaOrIrisation: true,
        requiredMorphology: ["single detached tube", "finite horizontal axis", "rolled asymmetric cross-section", "rare isolated occurrence"],
        forbiddenMorphology: ["parallel tube array", "horizon-to-horizon cylinder", "solid capsule", "arcus attachment"],
        classification: { wmoSpecies: "volutus", requiredVarieties: [], requiredSupplementaryFeatures: [] },
    },
    "altostratus-translucidus": {
        representation: "altostratus-translucidus",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-variety",
        wmoAbbreviation: "As tr",
        wmoDefinition: "Altostratus whose greater part reveals the position of the Sun or Moon through a ground-glass blur.",
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-altostratus-translucidus-as-tr.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [30, 500],
        geometricDepthKm: [0.3, 3.2],
        verticalAspect: [0.001, 0.08],
        angularConstraint: null,
        transparency: "translucidus",
        opticalDepth: [0.45, 3.2],
        sourceDiscVisibility: "blurred-position",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["great horizontal extent", "grey-blue ground-glass layer", "blurred source position", "low-frequency physical thickness variation"],
        forbiddenMorphology: ["sharp source outline", "halo", "cellular puff field", "clear-sky alpha veil"],
        classification: { wmoSpecies: null, requiredVarieties: ["translucidus"], requiredSupplementaryFeatures: [] },
    },
    "altostratus-opacus": {
        representation: "altostratus-opacus",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-variety",
        wmoAbbreviation: "As op",
        wmoDefinition: "Altostratus whose greater part is sufficiently opaque to mask the Sun or Moon completely.",
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-altostratus-opacus-as-op.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [40, 700],
        geometricDepthKm: [0.6, 4.5],
        verticalAspect: [0.001, 0.09],
        angularConstraint: null,
        transparency: "opacus",
        opticalDepth: [3, 28],
        sourceDiscVisibility: "concealed",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["continuous grey-blue shield", "source concealed over greater part", "layered mixed-phase depth", "broad natural luminance variation"],
        forbiddenMorphology: ["visible sharp solar disc", "halo", "uniform flat grey card", "repeated cloudlet grid"],
        classification: { wmoSpecies: null, requiredVarieties: ["opacus"], requiredSupplementaryFeatures: [] },
    },
    "altostratus-duplicatus": {
        representation: "altostratus-duplicatus",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-variety",
        wmoAbbreviation: "As du",
        wmoDefinition: "Altostratus arranged in two or more superposed sheets or layers at slightly different levels, sometimes partly merged.",
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-altostratus-duplicatus-as-du.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [35, 700],
        geometricDepthKm: [0.7, 5.2],
        verticalAspect: [0.002, 0.12],
        angularConstraint: null,
        transparency: "either",
        opticalDepth: [0.8, 30],
        sourceDiscVisibility: "blurred-position",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["two or more superposed shields", "slightly separated physical levels", "independent advection and thickness", "partial natural merging"],
        forbiddenMorphology: ["single slab with painted duplicate", "equal cloned layers", "screen-space offset copy", "halo"],
        classification: { wmoSpecies: null, requiredVarieties: ["duplicatus"], requiredSupplementaryFeatures: [] },
    },
    "altostratus-undulatus": {
        representation: "altostratus-undulatus",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-variety",
        wmoAbbreviation: "As un",
        wmoDefinition: "Altostratus showing broad undulations; transparency remains an independent variety axis.",
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-altostratus-undulatus-as-un.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [30, 600],
        geometricDepthKm: [0.4, 4],
        verticalAspect: [0.001, 0.1],
        angularConstraint: null,
        transparency: "either",
        opticalDepth: [0.6, 24],
        sourceDiscVisibility: "blurred-position",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["continuous shield", "world-space broad undulations", "finite wavelength drift", "independent transparency state"],
        forbiddenMorphology: ["sine-wave alpha stripes", "parallel cloned slabs", "halo", "detached roll cloud"],
        classification: { wmoSpecies: null, requiredVarieties: ["undulatus"], requiredSupplementaryFeatures: [] },
    },
    "altostratus-radiatus": {
        representation: "altostratus-radiatus",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-variety",
        wmoAbbreviation: "As ra",
        wmoDefinition: "Altostratus arranged in broad parallel bands which, owing to perspective, appear to converge towards one or two opposite horizon points.",
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-altostratus-radiatus-as-ra.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [45, 750],
        geometricDepthKm: [0.4, 4.2],
        verticalAspect: [0.001, 0.09],
        angularConstraint: null,
        transparency: "either",
        opticalDepth: [0.55, 25],
        sourceDiscVisibility: "blurred-position",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["broad parallel world-space bands", "perspective-only apparent convergence", "finite unequal band widths", "independent transparency state"],
        forbiddenMorphology: ["radial screen-space spokes", "literal converging cloud geometry", "equal alpha stripes", "halo"],
        classification: { wmoSpecies: null, requiredVarieties: ["radiatus"], requiredSupplementaryFeatures: [] },
    },
    "altostratus-praecipitatio": {
        representation: "altostratus-praecipitatio",
        genus: "altostratus",
        rendererSpecies: "altostratus-opacus",
        classificationAxis: "wmo-supplementary-feature",
        wmoAbbreviation: "As pra",
        wmoDefinition: "Altostratus with visible precipitation; ground-reaching precipitation is continuous rain, snow, or ice pellets.",
        wmoSource: "https://cloudatlas.wmo.int/en/supplementary-features-and-accessory-clouds-altostratus.html",
        physicalConstitutionSource: ALTOSTRATUS_CONSTITUTION,
        elementKind: "continuous-layer",
        elementDiameterKm: null,
        formationSpanKm: [50, 800],
        geometricDepthKm: [0.8, 5.5],
        verticalAspect: [0.002, 0.12],
        angularConstraint: null,
        transparency: "either",
        opticalDepth: [2.2, 36],
        sourceDiscVisibility: "concealed",
        permitsHalo: false,
        permitsCoronaOrIrisation: false,
        requiredMorphology: ["continuous frontal shield", "attached virga or continuous precipitation", "three-part mixed-phase structure", "diffuse precipitation-obscured base"],
        forbiddenMorphology: ["convective shower shafts", "detached rain columns", "halo", "surface precipitation without parent path"],
        classification: { wmoSpecies: null, requiredVarieties: [], requiredSupplementaryFeatures: ["praecipitatio"] },
    },
} as const satisfies Record<
    MiddleCloudRepresentation,
    MiddleCloudRepresentationDescriptor
>;

export const MIDDLE_CLOUD_BENCHMARK_ENVIRONMENTS = [
    "day-oblique-natural",
    "golden-backlit-telephoto",
    "humid-wide-nearby",
    "twilight-overhead",
    "moonlight-natural",
] as const;
export type MiddleCloudBenchmarkEnvironment =
    (typeof MIDDLE_CLOUD_BENCHMARK_ENVIRONMENTS)[number];

export type MiddleCloudFormationMechanism =
    | "radiatively-cooled-layer"
    | "gravity-wave-condensation"
    | "orographic-wave-condensation"
    | "elevated-convection"
    | "castellanus-base-dissipation"
    | "horizontal-vortex-roll"
    | "frontal-ascent"
    | "superposed-frontal-layers"
    | "parallel-frontal-bands"
    | "continuous-precipitation";
export type MiddleCloudTopologyConnectivity =
    | "extensive-element-sheet"
    | "finite-wave-lens"
    | "single-common-base"
    | "detached-tufts"
    | "single-roll-tube"
    | "continuous-layer"
    | "superposed-layers"
    | "parallel-band-layer"
    | "undulating-layer"
    | "precipitating-layer";
export type MiddleCloudOrigin =
    | "natural"
    | "gravity-wave"
    | "orographic-wave"
    | "castellanus-transition"
    | "shear-layer-roll"
    | "frontal-ascent"
    | "superposed-fronts"
    | "convective-detrainment";
export type MiddleCloudOrganization =
    | "extensive-sheet"
    | "aperiodic-cellular-sheet"
    | "finite-wave-packet"
    | "common-base-line"
    | "detached-tufts"
    | "single-roll"
    | "frontal-shield"
    | "superposed-shields"
    | "parallel-band-shield"
    | "undulating-shield"
    | "precipitating-shield";

export interface MiddleCloudTopologyVariantDescriptor {
    readonly id: string;
    readonly label: string;
    readonly mechanism: MiddleCloudFormationMechanism;
    readonly connectivity: MiddleCloudTopologyConnectivity;
    readonly macroElementCount: readonly [number, number];
    readonly hierarchyLevels: readonly [number, number];
    readonly formationAspectRatio: readonly [number, number];
    readonly minimumSpacingVariation: number;
    readonly maximumMirrorSimilarity: number;
    /** Material/fall-region distinction when topology alone is intentionally shared. */
    readonly hydrometeorRegime?: "virga" | "rain" | "snow" | "mixed";
    readonly origins: readonly MiddleCloudOrigin[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly cues: readonly string[];
}

const topology = (
    value: MiddleCloudTopologyVariantDescriptor,
): MiddleCloudTopologyVariantDescriptor => value;

export const MIDDLE_CLOUD_TOPOLOGY_VARIANTS = {
    "altocumulus-stratiformis": [
        topology({ id: "extensive-merged-sheet", label: "Extensive merged-element sheet", mechanism: "radiatively-cooled-layer", connectivity: "extensive-element-sheet", macroElementCount: [18, 60], hierarchyLevels: [3, 5], formationAspectRatio: [1.4, 5], minimumSpacingVariation: 0.28, maximumMirrorSimilarity: 0.62, origins: ["natural", "frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["merged and separate elements", "broad liquid support", "aperiodic holes"] }),
        topology({ id: "broken-cellular-layer", label: "Broken cellular layer", mechanism: "radiatively-cooled-layer", connectivity: "extensive-element-sheet", macroElementCount: [16, 52], hierarchyLevels: [4, 5], formationAspectRatio: [1.1, 4], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.48, origins: ["natural"], lifecycleStages: ["mature", "glaciating", "decaying"], cues: ["irregular breaks", "mixed merged cells", "diffuse lower ice"] }),
        topology({ id: "gravity-wave-ripple-sheet", label: "Gravity-wave ripple sheet", mechanism: "gravity-wave-condensation", connectivity: "extensive-element-sheet", macroElementCount: [14, 48], hierarchyLevels: [3, 5], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.56, origins: ["gravity-wave"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["finite wave packet", "one-to-five-degree elements", "wavelength drift"] }),
        topology({ id: "duplicated-mixed-phase-decks", label: "Unequal superposed decks", mechanism: "frontal-ascent", connectivity: "extensive-element-sheet", macroElementCount: [20, 70], hierarchyLevels: [4, 6], formationAspectRatio: [1.5, 5], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.44, origins: ["frontal-ascent"], lifecycleStages: ["growing", "mature", "decaying"], cues: ["unequal layer altitude", "independent gaps", "ice virga below liquid tops"] }),
    ],
    "altocumulus-lenticularis": [
        topology({ id: "single-smooth-lens", label: "Single smooth wave lens", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-lens", macroElementCount: [1, 1], hierarchyLevels: [3, 5], formationAspectRatio: [5, 18], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.7, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["one defined unit", "pronounced volume shading", "unequal taper"] }),
        topology({ id: "stacked-orographic-lenses", label: "Unequal stacked orographic lenses", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-lens", macroElementCount: [2, 5], hierarchyLevels: [3, 5], formationAspectRatio: [4, 15], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.58, origins: ["orographic-wave"], lifecycleStages: ["growing", "mature"], cues: ["stationary phase", "unequal stack", "defined outlines"] }),
        topology({ id: "granular-lens-patch", label: "Grouped-element lens patch", mechanism: "gravity-wave-condensation", connectivity: "finite-wave-lens", macroElementCount: [5, 18], hierarchyLevels: [3, 5], formationAspectRatio: [4, 14], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.52, origins: ["gravity-wave", "orographic-wave"], lifecycleStages: ["growing", "mature"], cues: ["closely grouped elements", "lens envelope", "one-to-five-degree constituents"] }),
        topology({ id: "dissipating-lee-wave", label: "Dissipating lee-wave lens", mechanism: "orographic-wave-condensation", connectivity: "finite-wave-lens", macroElementCount: [1, 4], hierarchyLevels: [4, 6], formationAspectRatio: [3, 12], minimumSpacingVariation: 0.44, maximumMirrorSimilarity: 0.42, origins: ["orographic-wave", "gravity-wave"], lifecycleStages: ["decaying"], cues: ["downstream edge erosion", "preserved wave support", "unequal crest survival"] }),
    ],
    "altocumulus-castellanus": [
        topology({ id: "single-crenellated-base", label: "Single crenellated common base", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [4, 10], hierarchyLevels: [4, 6], formationAspectRatio: [3, 10], minimumSpacingVariation: 0.32, maximumMirrorSimilarity: 0.56, origins: ["natural"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["one broad base", "unequal towers", "side-view crenellation"] }),
        topology({ id: "tall-instability-line", label: "Tall instability line", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [3, 8], hierarchyLevels: [4, 6], formationAspectRatio: [4, 13], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.48, origins: ["natural"], lifecycleStages: ["growing", "mature"], cues: ["some towers taller than wide", "height progression", "shared base"] }),
        topology({ id: "virga-bearing-castle", label: "Glaciating virga-bearing castle", mechanism: "elevated-convection", connectivity: "single-common-base", macroElementCount: [4, 9], hierarchyLevels: [4, 6], formationAspectRatio: [3, 9], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.44, origins: ["natural"], lifecycleStages: ["glaciating", "mature"], cues: ["liquid turret top", "ice-producing lower half", "localized virga"] }),
        topology({ id: "base-eroding-transition", label: "Base-eroding floccus transition", mechanism: "castellanus-base-dissipation", connectivity: "single-common-base", macroElementCount: [5, 12], hierarchyLevels: [4, 6], formationAspectRatio: [2, 7], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.38, origins: ["castellanus-transition"], lifecycleStages: ["decaying"], cues: ["fragmenting common base", "correlated remnant tufts", "increasing ice trails"] }),
    ],
    "altocumulus-floccus": [
        topology({ id: "castellanus-remnant-tufts", label: "Castellanus-remnant tufts", mechanism: "castellanus-base-dissipation", connectivity: "detached-tufts", macroElementCount: [5, 14], hierarchyLevels: [4, 6], formationAspectRatio: [2, 8], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.44, origins: ["castellanus-transition"], lifecycleStages: ["mature", "decaying"], cues: ["lost common base", "retained formation correlation", "ragged undersides"] }),
        topology({ id: "isolated-liquid-tufts", label: "Isolated droplet-bearing tufts", mechanism: "elevated-convection", connectivity: "detached-tufts", macroElementCount: [4, 12], hierarchyLevels: [3, 5], formationAspectRatio: [1.3, 5], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.4, origins: ["natural"], lifecycleStages: ["growing", "mature"], cues: ["sharp liquid crowns", "unequal mass", "ragged lower edge"] }),
        topology({ id: "ice-virga-tufts", label: "Ice-virga tuft field", mechanism: "castellanus-base-dissipation", connectivity: "detached-tufts", macroElementCount: [3, 10], hierarchyLevels: [4, 6], formationAspectRatio: [2, 7], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.38, origins: ["natural", "castellanus-transition"], lifecycleStages: ["glaciating", "precipitating", "decaying"], cues: ["liquid source tuft", "fibrous ice trail", "sublimating terminus"] }),
        topology({ id: "sheared-decaying-floccus", label: "Sheared decaying floccus", mechanism: "castellanus-base-dissipation", connectivity: "detached-tufts", macroElementCount: [6, 16], hierarchyLevels: [4, 6], formationAspectRatio: [4, 12], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.34, origins: ["natural", "castellanus-transition"], lifecycleStages: ["decaying"], cues: ["multiscale fragmentation", "correlated shear", "nonperiodic gaps"] }),
    ],
    "altocumulus-volutus": [
        topology({ id: "solitary-straight-roll", label: "Solitary straight roll", mechanism: "horizontal-vortex-roll", connectivity: "single-roll-tube", macroElementCount: [1, 1], hierarchyLevels: [4, 6], formationAspectRatio: [10, 35], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.58, origins: ["shear-layer-roll"], lifecycleStages: ["growing", "mature"], cues: ["one finite tube", "rolled cross-section", "detached support"] }),
        topology({ id: "curved-solitary-roll", label: "Curved solitary roll", mechanism: "horizontal-vortex-roll", connectivity: "single-roll-tube", macroElementCount: [1, 1], hierarchyLevels: [4, 6], formationAspectRatio: [8, 28], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.44, origins: ["shear-layer-roll"], lifecycleStages: ["mature"], cues: ["gentle world curvature", "asymmetric ends", "continuous tube"] }),
        topology({ id: "tapered-rolling-tube", label: "Tapered rolling tube", mechanism: "horizontal-vortex-roll", connectivity: "single-roll-tube", macroElementCount: [1, 1], hierarchyLevels: [5, 6], formationAspectRatio: [12, 40], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.4, origins: ["shear-layer-roll"], lifecycleStages: ["growing", "mature"], cues: ["unequal end radius", "visible axial rotation", "concave underside"] }),
        topology({ id: "dissipating-single-roll", label: "Dissipating solitary roll", mechanism: "horizontal-vortex-roll", connectivity: "single-roll-tube", macroElementCount: [1, 1], hierarchyLevels: [4, 6], formationAspectRatio: [7, 25], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.34, origins: ["shear-layer-roll"], lifecycleStages: ["decaying"], cues: ["one eroding tube", "broken condensate without multiple rolls", "finite ends"] }),
    ],
    "altostratus-translucidus": [
        topology({ id: "ground-glass-shield", label: "Ground-glass frontal shield", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [1, 3], hierarchyLevels: [4, 6], formationAspectRatio: [20, 120], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.6, origins: ["frontal-ascent"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["blurred source position", "continuous support", "low-frequency thickness"] }),
        topology({ id: "striated-translucent-sheet", label: "Striated translucent sheet", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [2, 4], hierarchyLevels: [4, 6], formationAspectRatio: [18, 100], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.52, origins: ["frontal-ascent", "natural"], lifecycleStages: ["growing", "mature"], cues: ["physical striation", "ground-glass source", "unequal layer overlap"] }),
        topology({ id: "fibrous-mixed-phase-veil", label: "Fibrous mixed-phase veil", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [1, 3], hierarchyLevels: [5, 6], formationAspectRatio: [24, 140], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.46, origins: ["frontal-ascent", "convective-detrainment"], lifecycleStages: ["mature"], cues: ["ice-rich upper fibres", "liquid lower blur", "no halo"] }),
        topology({ id: "thickening-translucent-front", label: "Thickening translucent front", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [2, 5], hierarchyLevels: [4, 6], formationAspectRatio: [16, 90], minimumSpacingVariation: 0.44, maximumMirrorSimilarity: 0.42, origins: ["frontal-ascent"], lifecycleStages: ["growing"], cues: ["approaching opacus transition", "source still locatable", "broad thickness gradient"] }),
    ],
    "altostratus-opacus": [
        topology({ id: "deep-frontal-shield", label: "Deep opaque frontal shield", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [1, 4], hierarchyLevels: [5, 7], formationAspectRatio: [18, 120], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.56, origins: ["frontal-ascent"], lifecycleStages: ["mature", "precipitating"], cues: ["source concealed", "three-part phase depth", "continuous support"] }),
        topology({ id: "layered-opaque-deck", label: "Unequal layered opaque deck", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [1, 3], hierarchyLevels: [5, 7], formationAspectRatio: [22, 130], minimumSpacingVariation: 0.32, maximumMirrorSimilarity: 0.5, origins: ["frontal-ascent", "natural"], lifecycleStages: ["mature", "decaying"], cues: ["superposed unequal layers", "broad luminance variation", "no puff seams"] }),
        topology({ id: "embedded-dense-bands", label: "Embedded dense frontal bands", mechanism: "frontal-ascent", connectivity: "continuous-layer", macroElementCount: [2, 6], hierarchyLevels: [5, 7], formationAspectRatio: [12, 80], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.44, origins: ["frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["continuous base layer", "aperiodic dense bands", "concealed source"] }),
        topology({ id: "precipitation-ready-shield", label: "Precipitation-ready opaque shield", mechanism: "continuous-precipitation", connectivity: "continuous-layer", macroElementCount: [2, 5], hierarchyLevels: [5, 7], formationAspectRatio: [14, 90], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.4, origins: ["frontal-ascent"], lifecycleStages: ["mature", "precipitating"], cues: ["deep lower mixed phase", "attached virga onset", "diffuse base"] }),
    ],
    "altostratus-duplicatus": [
        topology({ id: "two-level-frontal-shields", label: "Two-level frontal shields", mechanism: "superposed-frontal-layers", connectivity: "superposed-layers", macroElementCount: [2, 3], hierarchyLevels: [5, 7], formationAspectRatio: [16, 105], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.38, origins: ["superposed-fronts", "frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["slightly separated physical levels", "independent wind vectors", "unequal optical depth"] }),
        topology({ id: "partly-merged-superposition", label: "Partly merged superposition", mechanism: "superposed-frontal-layers", connectivity: "superposed-layers", macroElementCount: [2, 4], hierarchyLevels: [5, 7], formationAspectRatio: [14, 90], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.34, origins: ["superposed-fronts", "frontal-ascent"], lifecycleStages: ["growing", "mature", "decaying"], cues: ["finite merge corridors", "preserved level distinction", "nonmatching boundaries"] }),
        topology({ id: "translucent-over-opaque-deck", label: "Translucent deck over opaque shield", mechanism: "superposed-frontal-layers", connectivity: "superposed-layers", macroElementCount: [2, 3], hierarchyLevels: [5, 7], formationAspectRatio: [18, 120], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.3, origins: ["superposed-fronts"], lifecycleStages: ["mature"], cues: ["different layer optical depths", "parallax-consistent overlap", "blurred source through thin regions"] }),
        topology({ id: "sheared-separating-decks", label: "Sheared separating decks", mechanism: "superposed-frontal-layers", connectivity: "superposed-layers", macroElementCount: [2, 4], hierarchyLevels: [5, 7], formationAspectRatio: [12, 75], minimumSpacingVariation: 0.54, maximumMirrorSimilarity: 0.28, origins: ["superposed-fronts", "frontal-ascent"], lifecycleStages: ["decaying"], cues: ["differential advection", "unequal eroding margins", "continued physical overlap"] }),
    ],
    "altostratus-undulatus": [
        topology({ id: "broad-gravity-undulations", label: "Broad gravity-wave undulations", mechanism: "gravity-wave-condensation", connectivity: "undulating-layer", macroElementCount: [3, 9], hierarchyLevels: [4, 6], formationAspectRatio: [12, 70], minimumSpacingVariation: 0.3, maximumMirrorSimilarity: 0.58, origins: ["gravity-wave", "frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["continuous sheet", "finite wavelength drift", "physical vertical displacement"] }),
        topology({ id: "crossed-undulating-shield", label: "Crossed undulating shield", mechanism: "gravity-wave-condensation", connectivity: "undulating-layer", macroElementCount: [5, 14], hierarchyLevels: [5, 7], formationAspectRatio: [8, 45], minimumSpacingVariation: 0.4, maximumMirrorSimilarity: 0.46, origins: ["gravity-wave", "frontal-ascent"], lifecycleStages: ["mature"], cues: ["two unequal wave vectors", "continuous condensate", "no alpha stripes"] }),
        topology({ id: "shear-coupled-waves", label: "Shear-coupled frontal waves", mechanism: "frontal-ascent", connectivity: "undulating-layer", macroElementCount: [4, 11], hierarchyLevels: [5, 7], formationAspectRatio: [10, 55], minimumSpacingVariation: 0.36, maximumMirrorSimilarity: 0.48, origins: ["frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["altitude-varying phase", "broad thickness modulation", "independent opacity"] }),
        topology({ id: "dissipating-undulations", label: "Dissipating undulating shield", mechanism: "gravity-wave-condensation", connectivity: "undulating-layer", macroElementCount: [3, 10], hierarchyLevels: [5, 7], formationAspectRatio: [7, 40], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.4, origins: ["gravity-wave", "frontal-ascent"], lifecycleStages: ["decaying"], cues: ["unequal wave survival", "perforated upper ice", "continuous lower haze"] }),
    ],
    "altostratus-radiatus": [
        topology({ id: "broad-parallel-frontal-bands", label: "Broad parallel frontal bands", mechanism: "parallel-frontal-bands", connectivity: "parallel-band-layer", macroElementCount: [3, 7], hierarchyLevels: [4, 6], formationAspectRatio: [18, 120], minimumSpacingVariation: 0.32, maximumMirrorSimilarity: 0.5, origins: ["frontal-ascent"], lifecycleStages: ["growing", "mature"], cues: ["parallel world-space axes", "perspective convergence only", "unequal band widths"] }),
        topology({ id: "broken-radiating-shield", label: "Broken radiating shield", mechanism: "parallel-frontal-bands", connectivity: "parallel-band-layer", macroElementCount: [5, 14], hierarchyLevels: [6, 8], formationAspectRatio: [10, 65], minimumSpacingVariation: 0.52, maximumMirrorSimilarity: 0.34, origins: ["frontal-ascent", "natural"], lifecycleStages: ["mature", "decaying"], cues: ["finite parallel segments", "aperiodic gaps", "shared physical heading"] }),
        topology({ id: "cross-horizon-band-field", label: "Cross-horizon band field", mechanism: "parallel-frontal-bands", connectivity: "parallel-band-layer", macroElementCount: [2, 5], hierarchyLevels: [5, 7], formationAspectRatio: [28, 170], minimumSpacingVariation: 0.38, maximumMirrorSimilarity: 0.43, origins: ["frontal-ascent"], lifecycleStages: ["mature"], cues: ["one or two apparent convergence points", "camera-relative projection", "continuous mixed-phase support"] }),
        topology({ id: "sheared-dissipating-bands", label: "Sheared dissipating bands", mechanism: "parallel-frontal-bands", connectivity: "parallel-band-layer", macroElementCount: [4, 12], hierarchyLevels: [6, 8], formationAspectRatio: [8, 52], minimumSpacingVariation: 0.62, maximumMirrorSimilarity: 0.25, origins: ["frontal-ascent", "natural"], lifecycleStages: ["decaying"], cues: ["parallel mean orientation", "unequal eroded termini", "no radial density mask"] }),
    ],
    "altostratus-praecipitatio": [
        topology({ id: "continuous-rain-shield", label: "Continuous rain shield", mechanism: "continuous-precipitation", connectivity: "precipitating-layer", macroElementCount: [2, 6], hierarchyLevels: [5, 7], formationAspectRatio: [12, 80], minimumSpacingVariation: 0.44, maximumMirrorSimilarity: 0.48, hydrometeorRegime: "rain", origins: ["frontal-ascent"], lifecycleStages: ["precipitating"], cues: ["attached broad rain path", "diffuse lower base", "nonconvective continuity"] }),
        topology({ id: "continuous-snow-shield", label: "Continuous snow shield", mechanism: "continuous-precipitation", connectivity: "precipitating-layer", macroElementCount: [2, 6], hierarchyLevels: [5, 7], formationAspectRatio: [10, 70], minimumSpacingVariation: 0.46, maximumMirrorSimilarity: 0.44, hydrometeorRegime: "snow", origins: ["frontal-ascent"], lifecycleStages: ["precipitating"], cues: ["ice-rich upper part", "snow growth middle part", "continuous fall region"] }),
        topology({ id: "virga-transition-shield", label: "Virga transition shield", mechanism: "continuous-precipitation", connectivity: "precipitating-layer", macroElementCount: [2, 5], hierarchyLevels: [5, 7], formationAspectRatio: [14, 90], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.42, hydrometeorRegime: "virga", origins: ["frontal-ascent"], lifecycleStages: ["mature", "precipitating"], cues: ["attached sublimating fallstreak region", "dry subcloud layer", "parent continuity"] }),
        topology({ id: "mixed-precipitation-frontal-zone", label: "Mixed precipitation frontal zone", mechanism: "continuous-precipitation", connectivity: "precipitating-layer", macroElementCount: [3, 8], hierarchyLevels: [6, 7], formationAspectRatio: [10, 65], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.38, hydrometeorRegime: "mixed", origins: ["frontal-ascent"], lifecycleStages: ["precipitating", "decaying"], cues: ["rain-snow thermal transition", "continuous shield", "unequal precipitation depth"] }),
    ],
} as const satisfies Record<
    MiddleCloudRepresentation,
    readonly MiddleCloudTopologyVariantDescriptor[]
>;

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;
const smoothstep = (minimum: number, maximum: number, value: number) => {
    const t = clamp((value - minimum) / Math.max(1e-9, maximum - minimum));
    return t * t * (3 - 2 * t);
};
const assertFinite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};

export const middleCloudAngularDiameterDegrees = (
    diameterKm: number,
    slantRangeKm: number,
) => {
    assertFinite("element diameter", diameterKm);
    assertFinite("slant range", slantRangeKm);
    if (!(diameterKm > 0 && slantRangeKm > 0)) {
        throw new Error("Element diameter and slant range must be positive");
    }
    return 2 * Math.atan(diameterKm / (2 * slantRangeKm)) * 180 / Math.PI;
};

export interface MiddleCloudElementDiameterRange {
    readonly feasible: boolean;
    readonly minimumKm: number;
    readonly maximumKm: number;
}

export const middleCloudFeasibleElementDiameterKm = (
    representation: MiddleCloudRepresentation,
    slantRangeKm: number,
    viewElevationDegrees: number,
): MiddleCloudElementDiameterRange => {
    assertFinite("slant range", slantRangeKm);
    assertFinite("view elevation", viewElevationDegrees);
    if (!(slantRangeKm > 0)) throw new Error("Slant range must be positive");
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
    if (!descriptor.elementDiameterKm || !descriptor.angularConstraint) {
        throw new Error("A continuous Altostratus layer has no element-diameter rule");
    }
    let minimumKm: number = descriptor.elementDiameterKm[0];
    let maximumKm: number = descriptor.elementDiameterKm[1];
    if (viewElevationDegrees >= descriptor.angularConstraint.minimumViewElevationDegrees) {
        minimumKm = Math.max(minimumKm, 2 * slantRangeKm * Math.tan(
            descriptor.angularConstraint.minimumElementDiameterDegrees * Math.PI / 360,
        ));
        maximumKm = Math.min(maximumKm, 2 * slantRangeKm * Math.tan(
            descriptor.angularConstraint.maximumElementDiameterDegrees * Math.PI / 360,
        ));
    }
    return { feasible: minimumKm <= maximumKm, minimumKm, maximumKm };
};

export interface MiddleCloudProjectionInput {
    readonly representation: MiddleCloudRepresentation;
    readonly elementDiameterKm: number;
    readonly formationSpanKm: number;
    readonly slantRangeKm: number;
    readonly viewElevationDegrees: number;
}

export const qualifyMiddleCloudProjection = (input: MiddleCloudProjectionInput) => {
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    if (!descriptor.elementDiameterKm || !descriptor.angularConstraint) {
        throw new Error("Altostratus is qualified as a continuous layer, not as repeated elements");
    }
    assertFinite("formation span", input.formationSpanKm);
    assertFinite("view elevation", input.viewElevationDegrees);
    const angle = middleCloudAngularDiameterDegrees(
        input.elementDiameterKm,
        input.slantRangeKm,
    );
    const violations: string[] = [];
    if (input.elementDiameterKm < descriptor.elementDiameterKm[0] ||
        input.elementDiameterKm > descriptor.elementDiameterKm[1]) {
        violations.push("element-diameter-outside-representation-contract");
    }
    if (input.formationSpanKm < descriptor.formationSpanKm[0] ||
        input.formationSpanKm > descriptor.formationSpanKm[1]) {
        violations.push("formation-span-outside-representation-contract");
    }
    const angular = descriptor.angularConstraint;
    if (input.viewElevationDegrees >= angular.minimumViewElevationDegrees) {
        if (angle < angular.minimumElementDiameterDegrees) {
            violations.push("altocumulus-element-would-read-as-cirrocumulus");
        }
        if (angle > angular.maximumElementDiameterDegrees) {
            violations.push("altocumulus-element-would-read-as-stratocumulus");
        }
    }
    return { valid: violations.length === 0, angularDiameterDegrees: angle, violations };
};

export interface MiddleCloudOpticalQualificationInput {
    readonly representation: MiddleCloudRepresentation;
    readonly opticalDepth: number;
    readonly sourceDiscVisibility: MiddleCloudSourceDiscVisibility;
    readonly haloVisible: boolean;
    readonly precipitation: MiddleCloudPrecipitation;
}

export const qualifyMiddleCloudOpticalState = (
    input: MiddleCloudOpticalQualificationInput,
) => {
    assertFinite("optical depth", input.opticalDepth);
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const violations: string[] = [];
    if (input.opticalDepth < descriptor.opticalDepth[0] ||
        input.opticalDepth > descriptor.opticalDepth[1]) {
        violations.push("optical-depth-outside-representation-contract");
    }
    if (descriptor.genus === "altostratus") {
        if (input.haloVisible) violations.push("altostratus-never-shows-halo");
        if (input.sourceDiscVisibility === "not-applicable") {
            violations.push("altostratus-source-visibility-must-be-resolved");
        }
        if (input.sourceDiscVisibility === "sharp-outline") {
            violations.push("altostratus-source-outline-must-always-be-blurred");
        }
        if (input.representation === "altostratus-translucidus" &&
            input.sourceDiscVisibility !== "blurred-position") {
            violations.push("translucidus-must-reveal-blurred-source-position");
        }
        if (input.representation === "altostratus-opacus" &&
            input.sourceDiscVisibility !== "concealed") {
            violations.push("opacus-must-conceal-source-over-greater-part");
        }
        if (input.representation === "altostratus-praecipitatio" &&
            input.precipitation === "none") {
            violations.push("praecipitatio-requires-visible-precipitation");
        }
    }
    return { valid: violations.length === 0, violations };
};

export type MiddleCloudIceHabit =
    | "plate"
    | "column"
    | "bullet-rosette"
    | "aggregate"
    | "snow-crystal";
export type MiddleCloudIceHabitFractions = Readonly<Record<
    MiddleCloudIceHabit,
    number
>>;

interface MiddleCloudMicrophysicsProfile {
    readonly liquidRadiusMicrons: readonly [base: number, top: number];
    readonly iceRadiusMicrons: readonly [base: number, top: number];
    readonly baseIceFraction: number;
    readonly coldIceSensitivity: number;
    readonly trailIceGain: number;
    readonly condensate: number;
    readonly roughness: number;
    readonly topHabits: MiddleCloudIceHabitFractions;
    readonly baseHabits: MiddleCloudIceHabitFractions;
}

const iceHabits = (
    plate: number,
    column: number,
    bulletRosette: number,
    aggregate: number,
    snowCrystal: number,
): MiddleCloudIceHabitFractions => ({
    plate,
    column,
    "bullet-rosette": bulletRosette,
    aggregate,
    "snow-crystal": snowCrystal,
});

export const MIDDLE_CLOUD_MICROPHYSICS_PROFILES = {
    "altocumulus-stratiformis": { liquidRadiusMicrons: [10, 8], iceRadiusMicrons: [52, 24], baseIceFraction: 0.1, coldIceSensitivity: 0.48, trailIceGain: 0.42, condensate: 0.52, roughness: 0.34, topHabits: iceHabits(0.24, 0.24, 0.24, 0.12, 0.16), baseHabits: iceHabits(0.12, 0.18, 0.16, 0.3, 0.24) },
    "altocumulus-lenticularis": { liquidRadiusMicrons: [11, 8], iceRadiusMicrons: [44, 20], baseIceFraction: 0.05, coldIceSensitivity: 0.34, trailIceGain: 0.28, condensate: 0.58, roughness: 0.2, topHabits: iceHabits(0.3, 0.24, 0.22, 0.08, 0.16), baseHabits: iceHabits(0.18, 0.2, 0.17, 0.24, 0.21) },
    "altocumulus-castellanus": { liquidRadiusMicrons: [12, 9], iceRadiusMicrons: [64, 27], baseIceFraction: 0.16, coldIceSensitivity: 0.58, trailIceGain: 0.48, condensate: 0.66, roughness: 0.45, topHabits: iceHabits(0.2, 0.26, 0.27, 0.12, 0.15), baseHabits: iceHabits(0.1, 0.15, 0.15, 0.34, 0.26) },
    "altocumulus-floccus": { liquidRadiusMicrons: [12, 9], iceRadiusMicrons: [72, 28], baseIceFraction: 0.22, coldIceSensitivity: 0.62, trailIceGain: 0.54, condensate: 0.52, roughness: 0.52, topHabits: iceHabits(0.18, 0.23, 0.26, 0.17, 0.16), baseHabits: iceHabits(0.08, 0.13, 0.12, 0.39, 0.28) },
    "altocumulus-volutus": { liquidRadiusMicrons: [11, 9], iceRadiusMicrons: [48, 23], baseIceFraction: 0.08, coldIceSensitivity: 0.38, trailIceGain: 0.3, condensate: 0.62, roughness: 0.38, topHabits: iceHabits(0.25, 0.25, 0.24, 0.1, 0.16), baseHabits: iceHabits(0.14, 0.18, 0.16, 0.29, 0.23) },
    "altostratus-translucidus": { liquidRadiusMicrons: [11, 8], iceRadiusMicrons: [58, 25], baseIceFraction: 0.12, coldIceSensitivity: 0.7, trailIceGain: 0.28, condensate: 0.46, roughness: 0.34, topHabits: iceHabits(0.22, 0.25, 0.24, 0.12, 0.17), baseHabits: iceHabits(0.1, 0.16, 0.13, 0.3, 0.31) },
    "altostratus-opacus": { liquidRadiusMicrons: [14, 9], iceRadiusMicrons: [72, 29], baseIceFraction: 0.18, coldIceSensitivity: 0.76, trailIceGain: 0.34, condensate: 0.78, roughness: 0.42, topHabits: iceHabits(0.19, 0.24, 0.23, 0.16, 0.18), baseHabits: iceHabits(0.08, 0.12, 0.1, 0.34, 0.36) },
    "altostratus-duplicatus": { liquidRadiusMicrons: [13, 9], iceRadiusMicrons: [70, 28], baseIceFraction: 0.17, coldIceSensitivity: 0.75, trailIceGain: 0.33, condensate: 0.7, roughness: 0.4, topHabits: iceHabits(0.2, 0.24, 0.23, 0.15, 0.18), baseHabits: iceHabits(0.08, 0.13, 0.11, 0.34, 0.34) },
    "altostratus-undulatus": { liquidRadiusMicrons: [13, 9], iceRadiusMicrons: [66, 27], baseIceFraction: 0.15, coldIceSensitivity: 0.72, trailIceGain: 0.3, condensate: 0.62, roughness: 0.38, topHabits: iceHabits(0.21, 0.25, 0.23, 0.14, 0.17), baseHabits: iceHabits(0.09, 0.14, 0.12, 0.33, 0.32) },
    "altostratus-radiatus": { liquidRadiusMicrons: [12, 8], iceRadiusMicrons: [64, 26], baseIceFraction: 0.14, coldIceSensitivity: 0.71, trailIceGain: 0.3, condensate: 0.58, roughness: 0.36, topHabits: iceHabits(0.21, 0.25, 0.24, 0.13, 0.17), baseHabits: iceHabits(0.09, 0.15, 0.12, 0.32, 0.32) },
    "altostratus-praecipitatio": { liquidRadiusMicrons: [20, 10], iceRadiusMicrons: [92, 34], baseIceFraction: 0.24, coldIceSensitivity: 0.78, trailIceGain: 0.42, condensate: 0.88, roughness: 0.5, topHabits: iceHabits(0.15, 0.21, 0.22, 0.2, 0.22), baseHabits: iceHabits(0.05, 0.09, 0.08, 0.32, 0.46) },
} as const satisfies Record<
    MiddleCloudRepresentation,
    MiddleCloudMicrophysicsProfile
>;

export interface MiddleCloudLocalMicrophysicsInput {
    readonly representation: MiddleCloudRepresentation;
    /** Zero at cloud base, one at cloud top. */
    readonly normalizedHeight: number;
    readonly cellCoreFraction: number;
    readonly waveCrestFraction: number;
    readonly trailFraction: number;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: MiddleCloudOrigin;
    readonly temperatureKelvin: number;
    readonly turbulenceDissipation: number;
    readonly opticalDepth: number;
    readonly precipitation: MiddleCloudPrecipitation;
}

export interface MiddleCloudLocalMicrophysics {
    readonly liquidEffectiveRadiusMicrons: number;
    readonly iceEffectiveRadiusMicrons: number;
    readonly liquidFraction: number;
    readonly iceFraction: number;
    readonly iceHabitFractions: MiddleCloudIceHabitFractions;
    readonly iceSurfaceRoughness: number;
    readonly precipitatingMassFraction: number;
    readonly virgaFraction: number;
    readonly relativeCondensate: number;
    readonly sublimationFraction: number;
    /** Radiative-cooling source concentrated near the liquid-rich cloud top. */
    readonly longwaveCoolingSourceWeight: number;
    /** Resulting turbulence response displaced below the cooling source. */
    readonly radiativelyDrivenTurbulenceWeight: number;
    readonly sourceDiscBlurSigmaDegrees: number;
    readonly coronaOrIrisationEligible: boolean;
    readonly orientedIceHaloEligible: boolean;
}

const lifecycleErosion = (stage: CloudLifecycleStage) => {
    switch (stage) {
        case "incipient": return 0.06;
        case "growing": return 0.01;
        case "mature": return 0;
        case "glaciating": return 0.08;
        case "precipitating": return 0.14;
        case "decaying": return 0.34;
    }
};

const normalizedIceHabits = (
    values: Record<MiddleCloudIceHabit, number>,
): MiddleCloudIceHabitFractions => {
    const total = Object.values(values).reduce((sum, value) => sum + value, 0);
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [
        key,
        value / Math.max(1e-9, total),
    ])) as unknown as MiddleCloudIceHabitFractions;
};

export const sampleMiddleCloudLocalMicrophysics = (
    input: MiddleCloudLocalMicrophysicsInput,
): MiddleCloudLocalMicrophysics => {
    for (const [name, value] of Object.entries({
        normalizedHeight: input.normalizedHeight,
        cellCoreFraction: input.cellCoreFraction,
        waveCrestFraction: input.waveCrestFraction,
        trailFraction: input.trailFraction,
        temperatureKelvin: input.temperatureKelvin,
        turbulenceDissipation: input.turbulenceDissipation,
        opticalDepth: input.opticalDepth,
    })) assertFinite(name, value);
    if (!(input.temperatureKelvin > 0) || input.turbulenceDissipation < 0 ||
        input.opticalDepth < 0) {
        throw new Error("Temperature must be positive; turbulence and optical depth nonnegative");
    }
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[input.representation];
    const profile = MIDDLE_CLOUD_MICROPHYSICS_PROFILES[input.representation];
    const height = clamp(input.normalizedHeight);
    const core = clamp(input.cellCoreFraction);
    const crest = clamp(input.waveCrestFraction);
    const trail = clamp(input.trailFraction);
    const erosion = lifecycleErosion(input.lifecycleStage);
    const coldNucleation = clamp((258 - input.temperatureKelvin) / 30);
    const altostratus = descriptor.genus === "altostratus";
    let iceFraction: number;
    if (altostratus) {
        // WMO's lower liquid / middle mixed / upper ice structure. Continuous
        // smooth transitions avoid visible phase shelves in source lighting.
        const verticalIce = mix(0.08, 0.92, smoothstep(0.16, 0.9, height));
        iceFraction = clamp(verticalIce + coldNucleation * 0.12 + trail * 0.16, 0.04, 0.995);
    } else {
        // Ac remains droplet-bearing. Ice nucleates within the liquid layer and
        // is concentrated in the lower half and in virga below it.
        const fullyGlaciatedRemnant = (
            input.lifecycleStage === "glaciating" ||
            input.lifecycleStage === "decaying"
        ) && trail > 0.6;
        iceFraction = clamp(
            profile.baseIceFraction + coldNucleation * profile.coldIceSensitivity *
                mix(1, 0.38, height) + trail * profile.trailIceGain,
            0.01,
            fullyGlaciatedRemnant ? 1 : 0.94,
        );
    }
    const liquidFraction = 1 - iceFraction;
    const precipitationStrength = input.precipitation === "none" ? 0
        : input.precipitation === "virga" ? 0.34 : 0.72;
    const precipitatingMassFraction = clamp(
        precipitationStrength * mix(1, 0.28, height) *
            mix(0.55, 1, input.opticalDepth /
                Math.max(1, descriptor.opticalDepth[1])),
    );
    const virgaFraction = input.precipitation === "virga"
        ? clamp(0.38 + trail * 0.55 + (1 - height) * 0.22)
        : clamp(trail * iceFraction * 0.55);
    const liquidEffectiveRadiusMicrons = clamp(
        mix(profile.liquidRadiusMicrons[0], profile.liquidRadiusMicrons[1], height) +
            precipitatingMassFraction * 9 + core * 1.5,
        5,
        36,
    );
    const iceEffectiveRadiusMicrons = clamp(
        mix(profile.iceRadiusMicrons[0], profile.iceRadiusMicrons[1], height) +
            trail * 28 + precipitatingMassFraction * 22,
        12,
        160,
    );
    const habitValues = {} as Record<MiddleCloudIceHabit, number>;
    for (const habit of [
        "plate", "column", "bullet-rosette", "aggregate", "snow-crystal",
    ] as const) {
        habitValues[habit] = mix(
            profile.baseHabits[habit],
            profile.topHabits[habit],
            height,
        );
    }
    habitValues.aggregate += trail * 0.16;
    habitValues["snow-crystal"] += input.precipitation === "snow" ? 0.3 : 0;
    const iceHabitFractions = normalizedIceHabits(habitValues);
    const iceSurfaceRoughness = clamp(
        profile.roughness + Math.sqrt(input.turbulenceDissipation) * 0.45 +
            trail * 0.12 + erosion * 0.26 - crest * 0.05,
        0.08,
        0.94,
    );
    const sublimationFraction = clamp(
        erosion + trail * 0.32 + (1 - core) * 0.08 +
            (input.origin === "castellanus-transition" ? 0.1 : 0),
    );
    const relativeCondensate = clamp(
        profile.condensate * mix(0.6, 1.28, core) * mix(0.78, 1.08, crest) *
            (1 - sublimationFraction * 0.62),
    );
    const longwaveCoolingSourceWeight = clamp(
        (altostratus ? 0.42 : 0.72) * liquidFraction *
            Math.exp(-0.5 * ((height - 0.88) / 0.2) ** 2) *
            mix(0.65, 1, core),
    );
    const radiativelyDrivenTurbulenceWeight = clamp(
        (altostratus ? 0.34 : 0.66) * liquidFraction *
            Math.exp(-0.5 * ((height - 0.46) / 0.25) ** 2) *
            mix(0.7, 1, core),
    );
    const sourceDiscBlurSigmaDegrees = altostratus
        ? clamp(0.16 + Math.sqrt(input.opticalDepth) * 0.18 +
            liquidFraction * 0.12, 0.18, 1.4)
        : 0;
    const coronaOrIrisationEligible = !altostratus && liquidFraction > 0.68 &&
        input.opticalDepth >= 0.25 && input.opticalDepth <= 2.2 &&
        input.turbulenceDissipation < 0.025;
    const orientedIceHaloEligible = !altostratus && iceFraction > 0.42 &&
        input.opticalDepth >= 0.2 && input.opticalDepth <= 2.4 &&
        iceSurfaceRoughness < 0.34;
    return {
        liquidEffectiveRadiusMicrons,
        iceEffectiveRadiusMicrons,
        liquidFraction,
        iceFraction,
        iceHabitFractions,
        iceSurfaceRoughness,
        precipitatingMassFraction,
        virgaFraction,
        relativeCondensate,
        sublimationFraction,
        longwaveCoolingSourceWeight,
        radiativelyDrivenTurbulenceWeight,
        sourceDiscBlurSigmaDegrees,
        coronaOrIrisationEligible,
        orientedIceHaloEligible,
    };
};

export interface MiddleCloudReachabilityContract {
    readonly representation: MiddleCloudRepresentation;
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly origins: readonly MiddleCloudOrigin[];
    readonly organizations: readonly MiddleCloudOrganization[];
    readonly precipitation: readonly MiddleCloudPrecipitation[];
    readonly minimumInstability: number;
    readonly maximumTurbulenceDissipation: number;
    readonly opticalDepth: readonly [number, number];
    readonly environments: readonly MiddleCloudBenchmarkEnvironment[];
}

const allEnvironments = MIDDLE_CLOUD_BENCHMARK_ENVIRONMENTS;
const reachable = (
    value: MiddleCloudReachabilityContract,
): MiddleCloudReachabilityContract => value;

export const MIDDLE_CLOUD_REACHABILITY_CONTRACTS = {
    "altocumulus-stratiformis": reachable({ representation: "altocumulus-stratiformis", lifecycleStages: ["incipient", "growing", "mature", "glaciating", "decaying"], origins: ["natural", "gravity-wave", "frontal-ascent"], organizations: ["extensive-sheet", "aperiodic-cellular-sheet", "finite-wave-packet"], precipitation: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.12, opticalDepth: [0.35, 10], environments: allEnvironments }),
    "altocumulus-lenticularis": reachable({ representation: "altocumulus-lenticularis", lifecycleStages: ["incipient", "growing", "mature", "decaying"], origins: ["orographic-wave", "gravity-wave"], organizations: ["finite-wave-packet"], precipitation: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.035, opticalDepth: [0.4, 14], environments: allEnvironments }),
    "altocumulus-castellanus": reachable({ representation: "altocumulus-castellanus", lifecycleStages: ["incipient", "growing", "glaciating", "mature", "decaying"], origins: ["natural", "castellanus-transition"], organizations: ["common-base-line"], precipitation: ["none", "virga"], minimumInstability: 0.18, maximumTurbulenceDissipation: 0.24, opticalDepth: [0.7, 18], environments: allEnvironments }),
    "altocumulus-floccus": reachable({ representation: "altocumulus-floccus", lifecycleStages: ["growing", "glaciating", "mature", "precipitating", "decaying"], origins: ["natural", "castellanus-transition"], organizations: ["detached-tufts"], precipitation: ["none", "virga"], minimumInstability: -0.1, maximumTurbulenceDissipation: 0.22, opticalDepth: [0.5, 13], environments: allEnvironments }),
    "altocumulus-volutus": reachable({ representation: "altocumulus-volutus", lifecycleStages: ["growing", "mature", "decaying"], origins: ["shear-layer-roll"], organizations: ["single-roll"], precipitation: ["none", "virga"], minimumInstability: -0.5, maximumTurbulenceDissipation: 0.16, opticalDepth: [0.7, 16], environments: allEnvironments }),
    "altostratus-translucidus": reachable({ representation: "altostratus-translucidus", lifecycleStages: ["incipient", "growing", "mature"], origins: ["frontal-ascent", "natural", "convective-detrainment"], organizations: ["frontal-shield"], precipitation: ["none", "virga"], minimumInstability: -1, maximumTurbulenceDissipation: 0.12, opticalDepth: [0.45, 3.2], environments: allEnvironments }),
    "altostratus-opacus": reachable({ representation: "altostratus-opacus", lifecycleStages: ["growing", "mature", "precipitating", "decaying"], origins: ["frontal-ascent", "natural"], organizations: ["frontal-shield"], precipitation: ["none", "virga", "rain", "snow", "ice-pellets"], minimumInstability: -1, maximumTurbulenceDissipation: 0.16, opticalDepth: [3, 28], environments: allEnvironments }),
    "altostratus-duplicatus": reachable({ representation: "altostratus-duplicatus", lifecycleStages: ["growing", "mature", "decaying"], origins: ["superposed-fronts", "frontal-ascent"], organizations: ["superposed-shields"], precipitation: ["none", "virga", "rain", "snow"], minimumInstability: -1, maximumTurbulenceDissipation: 0.16, opticalDepth: [0.8, 30], environments: allEnvironments }),
    "altostratus-undulatus": reachable({ representation: "altostratus-undulatus", lifecycleStages: ["growing", "mature", "decaying"], origins: ["gravity-wave", "frontal-ascent"], organizations: ["undulating-shield"], precipitation: ["none", "virga", "rain", "snow"], minimumInstability: -1, maximumTurbulenceDissipation: 0.14, opticalDepth: [0.6, 24], environments: allEnvironments }),
    "altostratus-radiatus": reachable({ representation: "altostratus-radiatus", lifecycleStages: ["growing", "mature", "decaying"], origins: ["frontal-ascent", "natural"], organizations: ["parallel-band-shield"], precipitation: ["none", "virga", "rain", "snow"], minimumInstability: -1, maximumTurbulenceDissipation: 0.15, opticalDepth: [0.55, 25], environments: allEnvironments }),
    "altostratus-praecipitatio": reachable({ representation: "altostratus-praecipitatio", lifecycleStages: ["mature", "precipitating", "decaying"], origins: ["frontal-ascent"], organizations: ["precipitating-shield"], precipitation: ["virga", "rain", "snow", "ice-pellets"], minimumInstability: -1, maximumTurbulenceDissipation: 0.18, opticalDepth: [2.2, 36], environments: allEnvironments }),
} as const satisfies Record<
    MiddleCloudRepresentation,
    MiddleCloudReachabilityContract
>;

export interface MiddleCloudProductionState {
    readonly representation: MiddleCloudRepresentation;
    readonly lifecycleStage: CloudLifecycleStage;
    readonly origin: MiddleCloudOrigin;
    readonly organization: MiddleCloudOrganization;
    readonly precipitation: MiddleCloudPrecipitation;
    readonly instability: number;
    readonly turbulenceDissipation: number;
    readonly opticalDepth: number;
    readonly environment: MiddleCloudBenchmarkEnvironment;
}

export const qualifyMiddleCloudProductionState = (
    state: MiddleCloudProductionState,
) => {
    const contract = MIDDLE_CLOUD_REACHABILITY_CONTRACTS[state.representation];
    const violations: string[] = [];
    for (const [name, value] of Object.entries({
        instability: state.instability,
        turbulenceDissipation: state.turbulenceDissipation,
        opticalDepth: state.opticalDepth,
    })) if (!Number.isFinite(value)) violations.push(`${name}-must-be-finite`);
    if (!contract.lifecycleStages.includes(state.lifecycleStage)) {
        violations.push("illegal-lifecycle-stage-for-representation");
    }
    if (!contract.origins.includes(state.origin)) {
        violations.push("illegal-origin-for-representation");
    }
    if (!contract.organizations.includes(state.organization)) {
        violations.push("illegal-organization-for-representation");
    }
    if (!contract.precipitation.includes(state.precipitation)) {
        violations.push("illegal-precipitation-for-representation");
    }
    if (state.instability < -1 || state.instability > 1) {
        violations.push("instability-must-be-normalized");
    }
    if (state.instability < contract.minimumInstability) {
        violations.push("insufficient-instability-for-representation");
    }
    if (state.turbulenceDissipation < 0 ||
        state.turbulenceDissipation > contract.maximumTurbulenceDissipation) {
        violations.push("turbulence-outside-representation-contract");
    }
    if (state.opticalDepth < contract.opticalDepth[0] ||
        state.opticalDepth > contract.opticalDepth[1]) {
        violations.push("optical-depth-outside-representation-contract");
    }
    if (!contract.environments.includes(state.environment)) {
        violations.push("environment-not-qualified-for-representation");
    }
    return { legal: violations.length === 0, violations };
};

export const MIDDLE_CLOUD_REPRESENTATION_TRANSITIONS = {
    "altocumulus-stratiformis": ["altocumulus-stratiformis", "altocumulus-floccus"],
    "altocumulus-lenticularis": ["altocumulus-lenticularis"],
    "altocumulus-castellanus": ["altocumulus-castellanus", "altocumulus-floccus"],
    "altocumulus-floccus": ["altocumulus-floccus"],
    "altocumulus-volutus": ["altocumulus-volutus"],
    "altostratus-translucidus": ["altostratus-translucidus", "altostratus-opacus", "altostratus-duplicatus", "altostratus-undulatus", "altostratus-radiatus"],
    "altostratus-opacus": ["altostratus-opacus", "altostratus-duplicatus", "altostratus-undulatus", "altostratus-radiatus", "altostratus-praecipitatio"],
    "altostratus-duplicatus": ["altostratus-duplicatus", "altostratus-translucidus", "altostratus-opacus", "altostratus-praecipitatio"],
    "altostratus-undulatus": ["altostratus-undulatus", "altostratus-opacus", "altostratus-radiatus", "altostratus-praecipitatio"],
    "altostratus-radiatus": ["altostratus-radiatus", "altostratus-translucidus", "altostratus-opacus", "altostratus-undulatus"],
    "altostratus-praecipitatio": ["altostratus-praecipitatio"],
} as const satisfies Record<
    MiddleCloudRepresentation,
    readonly MiddleCloudRepresentation[]
>;

export const isLegalMiddleCloudRepresentationTransition = (
    from: MiddleCloudRepresentation,
    to: MiddleCloudRepresentation,
) => {
    const successors: readonly MiddleCloudRepresentation[] =
        MIDDLE_CLOUD_REPRESENTATION_TRANSITIONS[from];
    return successors.includes(to);
};

export const selectMiddleCloudTopologyVariant = (
    representation: MiddleCloudRepresentation,
    deterministicIndex: number,
): MiddleCloudTopologyVariantDescriptor => {
    assertFinite("deterministic index", deterministicIndex);
    const variants = MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation];
    return variants[Math.abs(Math.trunc(deterministicIndex)) % variants.length];
};

const MECHANISM_CODE: Record<MiddleCloudFormationMechanism, number> = {
    "radiatively-cooled-layer": 0,
    "gravity-wave-condensation": 1,
    "orographic-wave-condensation": 2,
    "elevated-convection": 3,
    "castellanus-base-dissipation": 4,
    "horizontal-vortex-roll": 5,
    "frontal-ascent": 6,
    "superposed-frontal-layers": 7,
    "parallel-frontal-bands": 8,
    "continuous-precipitation": 9,
};
const CONNECTIVITY_CODE: Record<MiddleCloudTopologyConnectivity, number> = {
    "extensive-element-sheet": 0,
    "finite-wave-lens": 1,
    "single-common-base": 2,
    "detached-tufts": 3,
    "single-roll-tube": 4,
    "continuous-layer": 5,
    "superposed-layers": 6,
    "parallel-band-layer": 7,
    "undulating-layer": 8,
    "precipitating-layer": 9,
};
const HYDROMETEOR_CODE = {
    none: 0,
    virga: 1,
    rain: 2,
    snow: 3,
    mixed: 4,
} as const;

export const middleCloudTopologyVariantSignature = (
    descriptor: MiddleCloudTopologyVariantDescriptor,
): readonly number[] => [
    MECHANISM_CODE[descriptor.mechanism] / 9,
    CONNECTIVITY_CODE[descriptor.connectivity] / 9,
    Math.log1p((descriptor.macroElementCount[0] + descriptor.macroElementCount[1]) * 0.5) /
        Math.log(71),
    (descriptor.hierarchyLevels[0] + descriptor.hierarchyLevels[1]) / 14,
    Math.log1p((descriptor.formationAspectRatio[0] + descriptor.formationAspectRatio[1]) * 0.5) /
        Math.log(141),
    descriptor.minimumSpacingVariation,
    descriptor.maximumMirrorSimilarity,
    HYDROMETEOR_CODE[descriptor.hydrometeorRegime ?? "none"] / 4,
];

export const middleCloudTopologySignatureDistance = (
    left: readonly number[],
    right: readonly number[],
) => {
    if (left.length === 0 || left.length !== right.length) {
        throw new Error("Topology signatures must have equal nonzero length");
    }
    let squared = 0;
    for (let index = 0; index < left.length; index += 1) {
        assertFinite("signature component", left[index]);
        assertFinite("signature component", right[index]);
        squared += (left[index] - right[index]) ** 2;
    }
    return Math.sqrt(squared / left.length);
};

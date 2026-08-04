import type {
    CloudGenus,
    CloudOrganization,
    CloudSpecies,
} from "./cloud-scene";

export type WmoCloudGenus = Exclude<CloudGenus, "clear">;

/** Canonical WMO species. Altostratus and Nimbostratus intentionally have none. */
export const WMO_SPECIES_BY_GENUS = {
    cirrus: ["fibratus", "uncinus", "spissatus", "castellanus", "floccus"],
    cirrocumulus: ["stratiformis", "lenticularis", "castellanus", "floccus"],
    cirrostratus: ["fibratus", "nebulosus"],
    altocumulus: ["stratiformis", "lenticularis", "castellanus", "floccus", "volutus"],
    altostratus: [],
    nimbostratus: [],
    stratocumulus: ["stratiformis", "lenticularis", "castellanus", "floccus", "volutus"],
    stratus: ["nebulosus", "fractus"],
    cumulus: ["humilis", "mediocris", "congestus", "fractus"],
    cumulonimbus: ["calvus", "capillatus"],
} as const satisfies Record<WmoCloudGenus, readonly string[]>;

export type WmoSpeciesFor<G extends WmoCloudGenus> =
    (typeof WMO_SPECIES_BY_GENUS)[G][number];

/**
 * Orthogonal WMO and renderer state axes.
 *
 * Species remains mutually exclusive within a genus. Varieties, supplementary
 * features and accessory clouds are deliberately independent: observed clouds
 * can carry several of them at once. Keeping these axes separate prevents the
 * renderer from growing a bespoke shader branch for every Latin name.
 */
export type CloudVariety =
    | "intortus"
    | "vertebratus"
    | "undulatus"
    | "radiatus"
    | "lacunosus"
    | "duplicatus"
    | "translucidus"
    | "perlucidus"
    | "opacus";

export type CloudSupplementaryFeature =
    | "incus"
    | "mamma"
    | "virga"
    | "praecipitatio"
    | "arcus"
    | "tuba"
    | "asperitas"
    | "fluctus"
    | "cavum"
    | "murus"
    | "cauda";

export type CloudAccessory = "pileus" | "velum" | "pannus" | "flumen";

export type CloudSpecialOrigin =
    | "natural"
    | "flammagenitus"
    | "homogenitus"
    | "homomutatus"
    | "cataractagenitus"
    | "silvagenitus";

export type UpperAtmosphericCloud =
    | "none"
    /** PSC Type Ib: supercooled ternary solution droplets. */
    | "polar-stratospheric-sts"
    /** PSC Type Ia: solid nitric-acid-trihydrate particles. */
    | "polar-stratospheric-nat"
    /** PSC Type II water ice without requiring a visible nacreous display. */
    | "polar-stratospheric-ice"
    /** Visible mother-of-pearl subset of the Type II water-ice state. */
    | "nacreous"
    /** Deprecated compatibility alias; production authoring resolves to STS. */
    | "polar-stratospheric"
    | "noctilucent";

export type CloudMotherRelation = "genitus" | "mutatus";

export interface CloudMotherCloud {
    sourceGenus: Exclude<CloudGenus, "clear">;
    relation: CloudMotherRelation;
}

export type CloudOrigin =
    | { kind: "natural" }
    | { kind: "genitus" | "mutatus"; motherGenus: WmoCloudGenus }
    | {
        kind: "special";
        designation: Exclude<CloudSpecialOrigin, "natural">;
        source?: "aircraft-condensation-trail" | "industrial-plume";
    };

export type CloudClassification = {
    [G in WmoCloudGenus]: {
        genus: G;
        species: WmoSpeciesFor<G> | null;
        varieties: CloudVariety[];
        supplementaryFeatures: CloudSupplementaryFeature[];
        accessoryClouds: CloudAccessory[];
        origin: CloudOrigin;
    }
}[WmoCloudGenus];

export type CloudLifecycleStage =
    | "incipient"
    | "growing"
    | "mature"
    | "glaciating"
    | "precipitating"
    | "decaying";

export type CloudPrecipitationKind =
    | "none"
    | "virga"
    | "drizzle"
    | "rain"
    | "shower"
    | "snow"
    | "hail";

export interface CloudThermodynamicState {
    baseTemperatureKelvin: number;
    topTemperatureKelvin: number;
    relativeHumidity: number;
    environmentalLapseRate: number;
    stabilityIndex: number;
    verticalVelocity: number;
    entrainment: number;
}

export interface CloudKinematicState {
    windSpeed: number;
    windDirection: number;
    verticalShear: number;
    turbulenceIntegralScaleKm: number;
    turbulenceDissipation: number;
}

export interface CloudCondensateState {
    liquidWaterPath: number;
    iceWaterPath: number;
    liquidFraction: number;
    dropletEffectiveRadius: number;
    iceEffectiveRadius: number;
}

export interface CloudPrecipitationState {
    kind: CloudPrecipitationKind;
    rate: number;
    terminalVelocity: number;
    evaporationDepthKm: number;
}

/**
 * Vertical levels which constrain where condensate can physically form.
 *
 * Nullable levels are genuinely absent rather than encoded as an arbitrary
 * altitude.  For example, a mechanically forced lenticular cloud has an LCL
 * and a shear layer, but no resolved LFC/EL pair.  GPU packing uses -1 only at
 * the serialization boundary.
 */
export interface CloudFormationManifoldState {
    liftingCondensationLevelKm: number;
    levelOfFreeConvectionKm: number | null;
    equilibriumLevelKm: number | null;
    inversionBaseKm: number | null;
    inversionStrengthKelvin: number;
    freezingLevelKm: number;
    shearLayerBaseKm: number;
    shearLayerTopKm: number;
}

export interface CloudOrthogonalState {
    varieties: CloudVariety[];
    supplementaryFeatures: CloudSupplementaryFeature[];
    accessories: CloudAccessory[];
    specialOrigin: CloudSpecialOrigin;
    motherCloud?: CloudMotherCloud;
    upperAtmosphericCloud: UpperAtmosphericCloud;
    lifecycleStage: CloudLifecycleStage;
    precipitationKind: CloudPrecipitationKind;
}

/** Complete physical state before any camera or exposure decision is applied. */
export interface CloudPhysicalState {
    baseAltitudeKm: number;
    geometricDepthKm: number;
    coverageOktas: number;
    thermodynamics: CloudThermodynamicState;
    kinematics: CloudKinematicState;
    condensate: CloudCondensateState;
    precipitation: CloudPrecipitationState;
    formation: CloudFormationManifoldState;
}

export interface CloudSystemExtent {
    centerEastKm: number;
    centerNorthKm: number;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientation: number;
    /** Physical formation/dissipation distance, never a post-render alpha mask. */
    boundaryTransitionKm: number;
}

export type CloudOrganizationState =
    | {
        kind: "point-process";
        distribution: "poisson-disk" | "clustered";
        meanSpacingKm: number;
        minimumSeparationKm: number;
        clusterRadiusKm: number;
        anisotropy: number;
        orientation: number;
    }
    | {
        kind: "cellular";
        topology: "open" | "closed" | "lacunar";
        meanCellDiameterKm: number;
        wallWidthFraction: number;
        centerJitter: number;
        anisotropy: number;
        orientation: number;
    }
    | {
        kind: "banded";
        bandSpacingKm: number;
        bandWidthFraction: number;
        lengthKm: number;
        curvature: number;
        orientation: number;
    }
    | {
        kind: "frontal-shield";
        alongFrontLengthKm: number;
        crossFrontDepthKm: number;
        leadingTransitionKm: number;
        trailingTransitionKm: number;
        orientation: number;
    }
    | {
        kind: "wave-packet";
        wavelengthKm: number;
        packetLengthKm: number;
        crestCount: number;
        orientation: number;
    }
    | {
        kind: "storm-complex";
        inflowRadiusKm: number;
        updraftRadiusKm: number;
        outflowRadiusKm: number;
        propagationDirection: number;
    };

export interface CloudLifecycleState {
    stage: CloudLifecycleStage;
    stageProgress: number;
    ageSeconds: number;
    cloudTopRiseRate: number;
    condensateTendency: number;
    glaciationRate: number;
    precipitationEfficiency: number;
    outflowSpeed: number;
}

export interface CloudEditorialState {
    cameraRangeKm: number;
    horizontalFieldOfView: number;
    viewElevation: number;
    frameAzimuthBias: number;
    exposureCompensation: number;
}

/** One classified physical cloud system before any camera or exposure choice. */
export interface CloudSystemState {
    id: string;
    classification: CloudClassification;
    physical: CloudPhysicalState;
    extent: CloudSystemExtent;
    organization: CloudOrganizationState;
    lifecycle: CloudLifecycleState;
}

/** Legacy/laboratory wrapper; editorial state is never compiled into density. */
export interface CompleteCloudState extends CloudSystemState {
    editorial: CloudEditorialState;
}

export type CloudMacroTopology =
    | "ice-streamer-field"
    | "cellular-cloudlet-field"
    | "layered-veil"
    | "wave-lens-train"
    | "castellated-deck"
    | "floccus-field"
    | "precipitating-sheet"
    | "boundary-layer-sheet"
    | "fragment-field"
    | "thermal-field"
    | "deep-storm-complex"
    | "roll-tube";

export type CloudMaterialModel =
    | "fibrous-ice"
    | "granular-ice"
    | "mixed-phase-cellular"
    | "liquid-cellular"
    | "mixed-phase-sheet"
    | "liquid-sheet"
    | "liquid-convective"
    | "deep-mixed-phase";

export type CloudDensityOperator =
    | "condensation-support"
    | "laminar-interface"
    | "fibrous-advection"
    | "precipitation-extraction"
    | "phase-transition";

export type CloudOrganizationOperator =
    | "poisson-population"
    | "clustered-population"
    | "street-alignment"
    | "open-cell-circulation"
    | "closed-cell-circulation"
    | "frontal-shield"
    | "wave-train"
    | "storm-outflow";

export interface CloudRendererRecipe {
    genus: Exclude<CloudGenus, "clear">;
    species: Exclude<CloudSpecies, "generic">;
    macroTopology: CloudMacroTopology;
    materialModel: CloudMaterialModel;
    densityOperators: CloudDensityOperator[];
    organizationOperators: CloudOrganizationOperator[];
    validOrganizations: CloudOrganization[];
    /** Dominant resolved element diameter in kilometres. */
    elementScaleKm: readonly [min: number, max: number];
    /** Ratio of resolved vertical development to horizontal diameter. */
    verticalAspect: readonly [min: number, max: number];
    /** Fraction of the geometric depth occupied by the noisy support band. */
    boundarySupport: readonly [min: number, max: number];
}

const recipe = (
    genus: CloudRendererRecipe["genus"],
    species: CloudRendererRecipe["species"],
    macroTopology: CloudMacroTopology,
    materialModel: CloudMaterialModel,
    elementScaleKm: CloudRendererRecipe["elementScaleKm"],
    verticalAspect: CloudRendererRecipe["verticalAspect"],
    validOrganizations: CloudOrganization[],
    densityOperators: CloudDensityOperator[] = ["condensation-support"],
    organizationOperators: CloudOrganizationOperator[] = ["poisson-population"],
    boundarySupport: CloudRendererRecipe["boundarySupport"] = [0.18, 0.42],
): CloudRendererRecipe => ({
    genus,
    species,
    macroTopology,
    materialModel,
    densityOperators,
    organizationOperators,
    validOrganizations,
    elementScaleKm,
    verticalAspect,
    boundarySupport,
});

const isolated: CloudOrganization[] = ["unorganized", "isolated", "streets"];
const cellular: CloudOrganization[] = ["unorganized", "open-cell", "closed-cell", "streets", "banded"];
const sheets: CloudOrganization[] = ["unorganized", "frontal", "banded"];

/** Every explicit species implemented by the renderer has one compositional recipe. */
export const CLOUD_RENDERER_RECIPES: Record<Exclude<CloudSpecies, "generic">, CloudRendererRecipe> = {
    "cirrus-fibratus": recipe("cirrus", "cirrus-fibratus", "ice-streamer-field", "fibrous-ice", [4, 22], [0.015, 0.09], sheets, ["fibrous-advection", "condensation-support"], ["poisson-population", "street-alignment"], [0.3, 0.62]),
    "cirrus-uncinus": recipe("cirrus", "cirrus-uncinus", "ice-streamer-field", "fibrous-ice", [5, 28], [0.02, 0.12], isolated, ["fibrous-advection", "precipitation-extraction"], ["poisson-population"], [0.32, 0.68]),
    "cirrus-spissatus": recipe("cirrus", "cirrus-spissatus", "ice-streamer-field", "granular-ice", [3, 18], [0.04, 0.18], sheets, ["fibrous-advection", "condensation-support"], ["clustered-population"], [0.2, 0.5]),
    "cirrus-castellanus": recipe("cirrus", "cirrus-castellanus", "castellated-deck", "granular-ice", [0.6, 2.4], [0.25, 0.75], isolated, ["condensation-support"], ["street-alignment", "clustered-population"]),
    "cirrus-floccus": recipe("cirrus", "cirrus-floccus", "floccus-field", "granular-ice", [0.4, 2.0], [0.3, 0.9], isolated, ["condensation-support", "precipitation-extraction"], ["clustered-population"]),
    "cirrocumulus-stratiformis": recipe("cirrocumulus", "cirrocumulus-stratiformis", "cellular-cloudlet-field", "granular-ice", [0.08, 0.45], [0.12, 0.42], cellular, ["condensation-support"], ["closed-cell-circulation", "open-cell-circulation"]),
    "cirrocumulus-lenticularis": recipe("cirrocumulus", "cirrocumulus-lenticularis", "wave-lens-train", "granular-ice", [0.6, 4], [0.05, 0.22], ["banded"], ["laminar-interface"], ["wave-train"], [0.04, 0.16]),
    "cirrocumulus-castellanus": recipe("cirrocumulus", "cirrocumulus-castellanus", "castellated-deck", "granular-ice", [0.15, 0.7], [0.3, 0.8], isolated, ["condensation-support"], ["street-alignment"]),
    "cirrocumulus-floccus": recipe("cirrocumulus", "cirrocumulus-floccus", "floccus-field", "granular-ice", [0.12, 0.6], [0.25, 0.8], isolated, ["condensation-support", "precipitation-extraction"], ["clustered-population"]),
    "cirrostratus-fibratus": recipe("cirrostratus", "cirrostratus-fibratus", "layered-veil", "fibrous-ice", [12, 80], [0.005, 0.04], sheets, ["fibrous-advection", "laminar-interface"], ["frontal-shield"], [0.08, 0.24]),
    "cirrostratus-nebulosus": recipe("cirrostratus", "cirrostratus-nebulosus", "layered-veil", "fibrous-ice", [30, 160], [0.003, 0.025], sheets, ["laminar-interface"], ["frontal-shield"], [0.04, 0.16]),
    "altocumulus-stratiformis": recipe("altocumulus", "altocumulus-stratiformis", "cellular-cloudlet-field", "mixed-phase-cellular", [0.5, 3], [0.12, 0.48], cellular, ["condensation-support"], ["closed-cell-circulation", "open-cell-circulation"]),
    "altocumulus-lenticularis": recipe("altocumulus", "altocumulus-lenticularis", "wave-lens-train", "mixed-phase-cellular", [2, 18], [0.035, 0.18], ["banded"], ["laminar-interface"], ["wave-train"], [0.025, 0.12]),
    "altocumulus-castellanus": recipe("altocumulus", "altocumulus-castellanus", "castellated-deck", "mixed-phase-cellular", [0.7, 3.5], [0.35, 1.1], isolated, ["condensation-support"], ["street-alignment", "clustered-population"]),
    "altocumulus-floccus": recipe("altocumulus", "altocumulus-floccus", "floccus-field", "mixed-phase-cellular", [0.5, 2.8], [0.3, 1], isolated, ["condensation-support", "precipitation-extraction"], ["clustered-population"]),
    "altocumulus-volutus": recipe("altocumulus", "altocumulus-volutus", "roll-tube", "mixed-phase-cellular", [8, 60], [0.04, 0.16], ["streets", "banded"], ["laminar-interface"], ["wave-train"], [0.06, 0.18]),
    "altostratus-opacus": recipe("altostratus", "altostratus-opacus", "layered-veil", "mixed-phase-sheet", [30, 220], [0.005, 0.06], sheets, ["laminar-interface", "phase-transition"], ["frontal-shield"], [0.06, 0.2]),
    "nimbostratus-praecipitatio": recipe("nimbostratus", "nimbostratus-praecipitatio", "precipitating-sheet", "mixed-phase-sheet", [40, 300], [0.01, 0.1], sheets, ["laminar-interface", "phase-transition", "precipitation-extraction"], ["frontal-shield"], [0.08, 0.26]),
    "stratocumulus-stratiformis": recipe("stratocumulus", "stratocumulus-stratiformis", "cellular-cloudlet-field", "liquid-cellular", [1.5, 8], [0.1, 0.42], cellular, ["condensation-support"], ["closed-cell-circulation", "open-cell-circulation", "street-alignment"]),
    "stratocumulus-lenticularis": recipe("stratocumulus", "stratocumulus-lenticularis", "wave-lens-train", "liquid-cellular", [3, 24], [0.04, 0.2], ["banded"], ["laminar-interface"], ["wave-train"], [0.03, 0.14]),
    "stratocumulus-castellanus": recipe("stratocumulus", "stratocumulus-castellanus", "castellated-deck", "liquid-cellular", [1.5, 7], [0.28, 0.85], isolated, ["condensation-support"], ["street-alignment", "clustered-population"]),
    "stratocumulus-floccus": recipe("stratocumulus", "stratocumulus-floccus", "floccus-field", "liquid-cellular", [1, 5], [0.25, 0.75], isolated, ["condensation-support", "precipitation-extraction"], ["clustered-population"]),
    "stratocumulus-volutus": recipe("stratocumulus", "stratocumulus-volutus", "roll-tube", "liquid-cellular", [12, 100], [0.025, 0.13], ["streets", "banded"], ["laminar-interface"], ["wave-train"], [0.06, 0.2]),
    "stratus-nebulosus": recipe("stratus", "stratus-nebulosus", "boundary-layer-sheet", "liquid-sheet", [20, 180], [0.002, 0.04], ["unorganized", "frontal", "banded"], ["laminar-interface"], ["frontal-shield", "wave-train"], [0.05, 0.2]),
    "stratus-fractus": recipe("stratus", "stratus-fractus", "fragment-field", "liquid-sheet", [0.15, 2.5], [0.08, 0.5], ["unorganized", "isolated"], ["condensation-support"], ["clustered-population"], [0.3, 0.7]),
    "cumulus-humilis": recipe("cumulus", "cumulus-humilis", "thermal-field", "liquid-convective", [0.4, 2.5], [0.18, 0.55], isolated, ["condensation-support"], ["poisson-population", "street-alignment"], [0.28, 0.56]),
    "cumulus-mediocris": recipe("cumulus", "cumulus-mediocris", "thermal-field", "liquid-convective", [0.8, 4], [0.45, 1.2], isolated, ["condensation-support"], ["poisson-population", "street-alignment"], [0.3, 0.6]),
    "cumulus-congestus": recipe("cumulus", "cumulus-congestus", "thermal-field", "liquid-convective", [1.2, 6], [0.9, 2.8], isolated, ["condensation-support", "precipitation-extraction"], ["clustered-population", "street-alignment"], [0.32, 0.64]),
    "cumulus-fractus": recipe("cumulus", "cumulus-fractus", "fragment-field", "liquid-convective", [0.15, 1.5], [0.25, 0.9], isolated, ["condensation-support"], ["clustered-population"], [0.42, 0.78]),
    "cumulonimbus-calvus": recipe("cumulonimbus", "cumulonimbus-calvus", "deep-storm-complex", "deep-mixed-phase", [6, 24], [1.5, 4.5], ["isolated", "banded"], ["condensation-support", "phase-transition", "precipitation-extraction"], ["clustered-population", "storm-outflow"], [0.24, 0.52]),
    "cumulonimbus-capillatus": recipe("cumulonimbus", "cumulonimbus-capillatus", "deep-storm-complex", "deep-mixed-phase", [10, 40], [1.2, 4], ["isolated", "banded"], ["condensation-support", "phase-transition", "fibrous-advection", "precipitation-extraction"], ["clustered-population", "storm-outflow"], [0.28, 0.62]),
    "cumulonimbus-capillatus-incus": recipe("cumulonimbus", "cumulonimbus-capillatus-incus", "deep-storm-complex", "deep-mixed-phase", [20, 100], [0.4, 2.5], ["isolated", "banded"], ["condensation-support", "phase-transition", "fibrous-advection", "precipitation-extraction"], ["clustered-population", "storm-outflow"], [0.3, 0.66]),
};

/**
 * A logical macroshape is a causal construction, not an affine transform of a
 * canonical density field. These compact records are intentionally asset
 * independent: a renderer may materialize them in an atlas, a sparse volume,
 * or a procedural owner without changing classification or the cloud-system
 * storage-buffer ABI.
 */
export type CloudTopologyCausalFamily =
    | "thermal-lineage"
    | "cellular-organization"
    | "frontal-shear-wave-packet"
    | "ice-fall-fibratus"
    | "deep-convection-lifecycle";

export type CloudTopologyConnectivity =
    | "single-connected"
    | "fragmented-population"
    | "cellular-colony"
    | "continuous-sheet"
    | "finite-wave-packet"
    | "roll-tube";

export interface CloudTopologyExemplar {
    /** Species-qualified stable identifier; never derived from an array index. */
    id: string;
    species: Exclude<CloudSpecies, "generic">;
    ordinal: number;
    macroTopology: CloudMacroTopology;
    causalFamily: CloudTopologyCausalFamily;
    causalGeometry: string;
    connectivity: CloudTopologyConnectivity;
    /** Construction bounds consumed by generators, not post-hoc XYZ scaling. */
    construction: {
        lineageDepth: readonly [number, number];
        macroElementCount: readonly [number, number];
        branchOrCrestCount: readonly [number, number];
        shearCoupling: readonly [number, number];
        sedimentationCoupling: readonly [number, number];
        cellularClosure: readonly [number, number];
    };
}

/** Fixed logical breadth; dense materialization is separately budgeted by the atlas. */
export const CLOUD_TOPOLOGY_EXEMPLARS_PER_SPECIES = 3;

type TopologyArchetype = Omit<
    CloudTopologyExemplar,
    "id" | "species" | "ordinal" | "macroTopology"
> & { suffix: string };

const exemplar = (
    suffix: string,
    causalFamily: CloudTopologyCausalFamily,
    causalGeometry: string,
    connectivity: CloudTopologyConnectivity,
    construction: CloudTopologyExemplar["construction"],
): TopologyArchetype => ({
    suffix, causalFamily, causalGeometry, connectivity, construction,
});

const topologyExemplarArchetypes: Record<CloudMacroTopology, readonly TopologyArchetype[]> = {
    "thermal-field": [
        exemplar("single-pulse-tree", "thermal-lineage", "one rooted parcel lineage with nested toroidal crown pulses", "single-connected", { lineageDepth: [3, 5], macroElementCount: [7, 13], branchOrCrestCount: [1, 2], shearCoupling: [0.04, 0.16], sedimentationCoupling: [0, 0.03], cellularClosure: [0, 0] }),
        exemplar("bifurcating-thermals", "thermal-lineage", "two unequal buoyant lineages joined only at the condensation base", "single-connected", { lineageDepth: [4, 7], macroElementCount: [13, 25], branchOrCrestCount: [2, 4], shearCoupling: [0.10, 0.28], sedimentationCoupling: [0, 0.05], cellularClosure: [0, 0] }),
        exemplar("entraining-pulse-cluster", "thermal-lineage", "successive feeder thermals with dry-air clefts and a displaced dominant crown", "single-connected", { lineageDepth: [5, 8], macroElementCount: [18, 34], branchOrCrestCount: [3, 6], shearCoupling: [0.16, 0.38], sedimentationCoupling: [0, 0.08], cellularClosure: [0, 0] }),
    ],
    "fragment-field": [
        exemplar("young-scud-lineage", "thermal-lineage", "short saturation-rooted fragments retaining one rising parcel lineage", "fragmented-population", { lineageDepth: [1, 2], macroElementCount: [4, 8], branchOrCrestCount: [1, 2], shearCoupling: [0.12, 0.34], sedimentationCoupling: [0, 0.04], cellularClosure: [0, 0] }),
        exemplar("shear-torn-shreds", "thermal-lineage", "dry-air-eroded fragments advected from unequal parent thermals", "fragmented-population", { lineageDepth: [1, 3], macroElementCount: [7, 14], branchOrCrestCount: [2, 5], shearCoupling: [0.44, 0.78], sedimentationCoupling: [0, 0.08], cellularClosure: [0, 0] }),
        exemplar("evaporating-remnants", "thermal-lineage", "detached remnant lobes with concave erosion and no invented common base", "fragmented-population", { lineageDepth: [1, 2], macroElementCount: [9, 18], branchOrCrestCount: [3, 7], shearCoupling: [0.28, 0.62], sedimentationCoupling: [0.02, 0.12], cellularClosure: [0, 0] }),
    ],
    "cellular-cloudlet-field": [
        exemplar("closed-cell-colony", "cellular-organization", "finite closed-cell colony with dense rims and weak subsiding centres", "cellular-colony", { lineageDepth: [2, 3], macroElementCount: [12, 28], branchOrCrestCount: [5, 10], shearCoupling: [0.04, 0.18], sedimentationCoupling: [0, 0.10], cellularClosure: [0.58, 0.94] }),
        exemplar("open-cell-colony", "cellular-organization", "connected open-cell arcs around dry descending cores", "cellular-colony", { lineageDepth: [2, 4], macroElementCount: [10, 24], branchOrCrestCount: [4, 9], shearCoupling: [0.08, 0.24], sedimentationCoupling: [0, 0.14], cellularClosure: [-0.94, -0.52] }),
        exemplar("convective-street-packet", "cellular-organization", "unequal cells organized into finite roll-aligned streets", "cellular-colony", { lineageDepth: [2, 4], macroElementCount: [14, 32], branchOrCrestCount: [3, 7], shearCoupling: [0.34, 0.68], sedimentationCoupling: [0, 0.12], cellularClosure: [-0.16, 0.24] }),
    ],
    "castellated-deck": [
        exemplar("broken-common-base", "cellular-organization", "unequal turrets rising from several finite common-base segments", "cellular-colony", { lineageDepth: [2, 4], macroElementCount: [8, 18], branchOrCrestCount: [4, 8], shearCoupling: [0.10, 0.30], sedimentationCoupling: [0.02, 0.18], cellularClosure: [0.22, 0.62] }),
        exemplar("instability-line", "cellular-organization", "one shear-aligned instability line with alternating active and decaying turrets", "cellular-colony", { lineageDepth: [3, 5], macroElementCount: [10, 22], branchOrCrestCount: [5, 10], shearCoupling: [0.38, 0.70], sedimentationCoupling: [0.04, 0.24], cellularClosure: [0.05, 0.36] }),
        exemplar("clustered-castles", "cellular-organization", "two offset turret clusters separated by a real dry slot", "fragmented-population", { lineageDepth: [2, 5], macroElementCount: [9, 20], branchOrCrestCount: [4, 9], shearCoupling: [0.18, 0.46], sedimentationCoupling: [0.06, 0.28], cellularClosure: [-0.28, 0.18] }),
    ],
    "floccus-field": [
        exemplar("virga-bearing-tufts", "ice-fall-fibratus", "detached convective tufts coupled to unequal sedimentation tails", "fragmented-population", { lineageDepth: [2, 3], macroElementCount: [6, 13], branchOrCrestCount: [2, 5], shearCoupling: [0.18, 0.42], sedimentationCoupling: [0.50, 0.86], cellularClosure: [-0.34, 0.08] }),
        exemplar("eroded-remnant-tufts", "ice-fall-fibratus", "castellanus remnants with offset heads and broken virga", "fragmented-population", { lineageDepth: [1, 3], macroElementCount: [8, 17], branchOrCrestCount: [3, 7], shearCoupling: [0.30, 0.60], sedimentationCoupling: [0.34, 0.72], cellularClosure: [-0.52, -0.10] }),
        exemplar("clustered-fallstreaks", "ice-fall-fibratus", "two moisture-source clusters feeding nonparallel fallstreak bundles", "fragmented-population", { lineageDepth: [2, 4], macroElementCount: [10, 21], branchOrCrestCount: [4, 9], shearCoupling: [0.46, 0.78], sedimentationCoupling: [0.62, 0.96], cellularClosure: [-0.24, 0.18] }),
    ],
    "ice-streamer-field": [
        exemplar("curved-fibre-lineage", "ice-fall-fibratus", "separate curved ice fibres sharing a finite source swath", "fragmented-population", { lineageDepth: [2, 4], macroElementCount: [5, 11], branchOrCrestCount: [2, 5], shearCoupling: [0.42, 0.70], sedimentationCoupling: [0.22, 0.52], cellularClosure: [0, 0] }),
        exemplar("differential-fallstreak-braid", "ice-fall-fibratus", "nonparallel sedimentation trajectories braided by vertically varying shear", "fragmented-population", { lineageDepth: [3, 6], macroElementCount: [7, 15], branchOrCrestCount: [3, 7], shearCoupling: [0.58, 0.88], sedimentationCoupling: [0.58, 0.94], cellularClosure: [0, 0] }),
        exemplar("split-source-streamers", "ice-fall-fibratus", "two unequal ice source patches with distinct fall speeds and downstream curvature", "fragmented-population", { lineageDepth: [3, 5], macroElementCount: [8, 17], branchOrCrestCount: [4, 8], shearCoupling: [0.66, 0.96], sedimentationCoupling: [0.40, 0.82], cellularClosure: [0, 0] }),
    ],
    "layered-veil": [
        exemplar("invading-frontal-edge", "frontal-shear-wave-packet", "curved finite frontal swath with a broad invading condensation edge", "continuous-sheet", { lineageDepth: [1, 2], macroElementCount: [3, 6], branchOrCrestCount: [1, 3], shearCoupling: [0.16, 0.38], sedimentationCoupling: [0.04, 0.28], cellularClosure: [0, 0] }),
        exemplar("dry-slot-frontal-shield", "frontal-shear-wave-packet", "continuous frontal shield displaced around a causally eroded dry slot", "continuous-sheet", { lineageDepth: [2, 3], macroElementCount: [5, 9], branchOrCrestCount: [2, 4], shearCoupling: [0.30, 0.58], sedimentationCoupling: [0.08, 0.38], cellularClosure: [0, 0] }),
        exemplar("undular-shear-veil", "frontal-shear-wave-packet", "finite shear-wave packet embedded in a connected lifting veil", "continuous-sheet", { lineageDepth: [2, 4], macroElementCount: [6, 12], branchOrCrestCount: [3, 7], shearCoupling: [0.54, 0.86], sedimentationCoupling: [0.10, 0.44], cellularClosure: [0, 0] }),
    ],
    "precipitating-sheet": [
        exemplar("warm-frontal-conveyor", "frontal-shear-wave-packet", "deep sloping ascent shield with a continuous rain-bearing lower deck", "continuous-sheet", { lineageDepth: [2, 4], macroElementCount: [6, 12], branchOrCrestCount: [2, 5], shearCoupling: [0.20, 0.46], sedimentationCoupling: [0.58, 0.88], cellularClosure: [0, 0] }),
        exemplar("occluded-frontal-wrap", "frontal-shear-wave-packet", "curved occlusion wrap with embedded precipitation bands", "continuous-sheet", { lineageDepth: [3, 5], macroElementCount: [8, 15], branchOrCrestCount: [3, 7], shearCoupling: [0.38, 0.68], sedimentationCoupling: [0.68, 0.96], cellularClosure: [0, 0] }),
        exemplar("banded-dry-intrusion", "frontal-shear-wave-packet", "connected rain shield scalloped by a descending dry intrusion and wave bands", "continuous-sheet", { lineageDepth: [2, 5], macroElementCount: [9, 17], branchOrCrestCount: [4, 8], shearCoupling: [0.52, 0.82], sedimentationCoupling: [0.64, 0.94], cellularClosure: [0, 0] }),
    ],
    "boundary-layer-sheet": [
        exemplar("advected-bank", "frontal-shear-wave-packet", "finite inversion-bounded bank with one smooth leading condensation edge", "continuous-sheet", { lineageDepth: [1, 2], macroElementCount: [3, 7], branchOrCrestCount: [1, 3], shearCoupling: [0.10, 0.30], sedimentationCoupling: [0, 0.08], cellularClosure: [0, 0] }),
        exemplar("radiative-lobe-deck", "cellular-organization", "connected nocturnal deck organized by unequal radiative cooling lobes", "continuous-sheet", { lineageDepth: [2, 3], macroElementCount: [6, 12], branchOrCrestCount: [3, 6], shearCoupling: [0.06, 0.24], sedimentationCoupling: [0, 0.10], cellularClosure: [0.34, 0.72] }),
        exemplar("shear-wave-bank", "frontal-shear-wave-packet", "connected low deck carrying a finite packet of inversion waves", "continuous-sheet", { lineageDepth: [2, 4], macroElementCount: [7, 14], branchOrCrestCount: [3, 8], shearCoupling: [0.48, 0.82], sedimentationCoupling: [0, 0.12], cellularClosure: [0, 0] }),
    ],
    "wave-lens-train": [
        exemplar("single-crest-lenses", "frontal-shear-wave-packet", "unequal lenses condensed on one finite mountain-wave crest", "finite-wave-packet", { lineageDepth: [1, 2], macroElementCount: [2, 5], branchOrCrestCount: [1, 2], shearCoupling: [0.18, 0.42], sedimentationCoupling: [0, 0.10], cellularClosure: [0, 0] }),
        exemplar("stacked-wave-packet", "frontal-shear-wave-packet", "vertically stacked lenses on two phase-locked wave crests", "finite-wave-packet", { lineageDepth: [2, 4], macroElementCount: [4, 9], branchOrCrestCount: [2, 4], shearCoupling: [0.30, 0.58], sedimentationCoupling: [0, 0.14], cellularClosure: [0, 0] }),
        exemplar("decaying-lee-train", "frontal-shear-wave-packet", "downstream lens train with decreasing amplitude and asymmetric evaporation edges", "finite-wave-packet", { lineageDepth: [2, 3], macroElementCount: [5, 11], branchOrCrestCount: [3, 6], shearCoupling: [0.46, 0.74], sedimentationCoupling: [0, 0.16], cellularClosure: [0, 0] }),
    ],
    "roll-tube": [
        exemplar("solitary-boundary-roll", "frontal-shear-wave-packet", "one finite horizontal circulation tube with tapered ends", "roll-tube", { lineageDepth: [2, 3], macroElementCount: [5, 10], branchOrCrestCount: [1, 2], shearCoupling: [0.26, 0.50], sedimentationCoupling: [0, 0.08], cellularClosure: [0.12, 0.38] }),
        exemplar("curved-roll-packet", "frontal-shear-wave-packet", "curved roll tube assembled from unequal phase-coherent circulation segments", "roll-tube", { lineageDepth: [2, 4], macroElementCount: [7, 14], branchOrCrestCount: [2, 4], shearCoupling: [0.38, 0.66], sedimentationCoupling: [0, 0.10], cellularClosure: [0.08, 0.32] }),
        exemplar("breaking-roll-wave", "frontal-shear-wave-packet", "finite roll with one breaking crest and a causally thinning downstream end", "roll-tube", { lineageDepth: [3, 5], macroElementCount: [9, 17], branchOrCrestCount: [3, 5], shearCoupling: [0.54, 0.84], sedimentationCoupling: [0, 0.14], cellularClosure: [-0.08, 0.22] }),
    ],
    "deep-storm-complex": [
        exemplar("rooted-single-updraft", "deep-convection-lifecycle", "one source-connected feeder/updraft lineage with a bounded detrainment crown", "single-connected", { lineageDepth: [5, 8], macroElementCount: [20, 38], branchOrCrestCount: [2, 5], shearCoupling: [0.18, 0.42], sedimentationCoupling: [0.34, 0.66], cellularClosure: [0, 0] }),
        exemplar("merged-multicell", "deep-convection-lifecycle", "several feeder lineages merging below unequal active and decaying cells", "single-connected", { lineageDepth: [6, 10], macroElementCount: [32, 58], branchOrCrestCount: [4, 8], shearCoupling: [0.30, 0.62], sedimentationCoupling: [0.46, 0.78], cellularClosure: [0, 0] }),
        exemplar("sheared-regenerative-line", "deep-convection-lifecycle", "regenerative upwind feeders coupled to a displaced glaciated outflow lineage", "single-connected", { lineageDepth: [7, 12], macroElementCount: [40, 72], branchOrCrestCount: [5, 10], shearCoupling: [0.62, 0.94], sedimentationCoupling: [0.52, 0.88], cellularClosure: [0, 0] }),
    ],
};

export const CLOUD_TOPOLOGY_EXEMPLARS = Object.freeze(Object.fromEntries(
    Object.entries(CLOUD_RENDERER_RECIPES).map(([species, rendererRecipe]) => [
        species,
        Object.freeze(topologyExemplarArchetypes[rendererRecipe.macroTopology].map(
            (archetype, ordinal): CloudTopologyExemplar => ({
                id: `${species}:${archetype.suffix}`,
                species: species as Exclude<CloudSpecies, "generic">,
                ordinal,
                macroTopology: rendererRecipe.macroTopology,
                causalFamily: archetype.causalFamily,
                causalGeometry: archetype.causalGeometry,
                connectivity: archetype.connectivity,
                construction: archetype.construction,
            }),
        )),
    ]),
)) as Readonly<Record<Exclude<CloudSpecies, "generic">, readonly CloudTopologyExemplar[]>>;

const topologySeedText = (seed: number | string | readonly number[]) =>
    Array.isArray(seed) ? seed.map((value) => Number(value).toPrecision(12)).join(":")
        : String(seed);

const hashTopologySeed = (value: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

/** Stable scene/day plus owner selection; camera and frame time are forbidden inputs. */
export function selectCloudTopologyExemplar({
    species,
    sceneDaySeed,
    ownerSeed = 0,
}: {
    species: Exclude<CloudSpecies, "generic">;
    sceneDaySeed: number | string | readonly number[];
    ownerSeed?: number | string;
}): CloudTopologyExemplar {
    const available = CLOUD_TOPOLOGY_EXEMPLARS[species];
    const hash = hashTopologySeed(
        `${species}|${topologySeedText(sceneDaySeed)}|${String(ownerSeed)}`,
    );
    return available[hash % available.length];
}

export interface CloudParameterDefinition {
    category: "meteorology" | "morphology" | "material" | "organization" | "derived-render" | "editorial";
    unit: string;
    range: readonly [number, number];
    description: string;
}

/** Canonical parameter vocabulary shared by generation, lab controls and WGSL packing. */
export const CLOUD_PARAMETER_DEFINITIONS = {
    baseAltitudeKm: { category: "meteorology", unit: "km", range: [0, 20], description: "Condensation-base altitude above the surface datum." },
    geometricDepthKm: { category: "meteorology", unit: "km", range: [0.02, 16], description: "Physical depth of the cloudy layer or storm." },
    coverageOktas: { category: "meteorology", unit: "oktas", range: [0, 8], description: "Projected sky fraction before optical-depth weighting." },
    baseTemperatureKelvin: { category: "meteorology", unit: "K", range: [180, 315], description: "Temperature at cloud base controlling saturation and phase." },
    topTemperatureKelvin: { category: "meteorology", unit: "K", range: [175, 310], description: "Temperature at cloud top controlling glaciation and precipitation." },
    relativeHumidity: { category: "meteorology", unit: "fraction", range: [0, 1.2], description: "Humidity relative to the applicable liquid or ice saturation surface." },
    environmentalLapseRate: { category: "meteorology", unit: "K km^-1", range: [-4, 15], description: "Environmental vertical temperature gradient; negative values represent an inversion." },
    stabilityIndex: { category: "meteorology", unit: "normalized", range: [-1, 1], description: "Resolved instability or restoring stability used by topology and lifecycle." },
    liquidWaterPath: { category: "meteorology", unit: "kg m^-2", range: [0, 5], description: "Column liquid condensate controlling extinction and precipitation potential." },
    iceWaterPath: { category: "meteorology", unit: "kg m^-2", range: [0, 3], description: "Column ice condensate controlling fibrous structure and phase." },
    verticalVelocity: { category: "meteorology", unit: "m s^-1", range: [-10, 70], description: "Resolved ascent/descent proxy driving towers, holes and precipitation." },
    entrainment: { category: "meteorology", unit: "fraction", range: [0, 1], description: "Dry-air mixing that erodes condensate and limits vertical growth." },
    windSpeed: { category: "meteorology", unit: "m s^-1", range: [0, 120], description: "Layer-mean advection speed in world space." },
    windDirection: { category: "meteorology", unit: "radians", range: [-3.142, 3.142], description: "Layer-mean cloud east-angle direction; zero is +east and positive turns toward +north." },
    verticalShear: { category: "meteorology", unit: "m s^-1 km^-1", range: [0, 50], description: "Wind change through depth driving streets, fallstreaks and anvils." },
    turbulenceIntegralScaleKm: { category: "meteorology", unit: "km", range: [0.005, 30], description: "Largest energetic eddy scale available to deform the cloud boundary." },
    turbulenceDissipation: { category: "meteorology", unit: "m^2 s^-3", range: [0.000001, 1], description: "Dissipation rate controlling the inertial-range detail cascade." },
    precipitationRate: { category: "meteorology", unit: "mm h^-1", range: [0, 300], description: "Source-column precipitation production rate." },
    hydrometeorTerminalVelocity: { category: "meteorology", unit: "m s^-1", range: [0, 60], description: "Phase- and size-dependent fall velocity of extracted condensate." },
    precipitationEvaporationDepthKm: { category: "meteorology", unit: "km", range: [0, 10], description: "Unsaturated fall distance before hydrometeors evaporate as virga." },
    liftingCondensationLevelKm: { category: "meteorology", unit: "km", range: [0, 20], description: "Parcel saturation level constraining the cloud base." },
    levelOfFreeConvectionKm: { category: "meteorology", unit: "km", range: [0, 20], description: "First level of positive parcel buoyancy; absent for non-convective systems." },
    equilibriumLevelKm: { category: "meteorology", unit: "km", range: [0, 24], description: "Upper neutral-buoyancy level constraining a convective top or anvil." },
    inversionBaseKm: { category: "meteorology", unit: "km", range: [0, 22], description: "Base of a capping inversion when one constrains the system." },
    inversionStrengthKelvin: { category: "meteorology", unit: "K", range: [0, 20], description: "Temperature jump through the capping inversion." },
    freezingLevelKm: { category: "meteorology", unit: "km", range: [0, 20], description: "Environmental zero-degree isotherm controlling mixed-phase transitions." },
    shearLayerBaseKm: { category: "meteorology", unit: "km", range: [0, 22], description: "Base of the resolved layer across which directional or speed shear acts." },
    shearLayerTopKm: { category: "meteorology", unit: "km", range: [0, 24], description: "Top of the resolved layer across which directional or speed shear acts." },
    elementScaleKm: { category: "morphology", unit: "km", range: [0.05, 300], description: "Dominant resolved body, cell, fibre or system wavelength." },
    verticalAspect: { category: "morphology", unit: "ratio", range: [0.002, 5], description: "Vertical development divided by horizontal element scale." },
    supportBand: { category: "material", unit: "fraction", range: [0.02, 0.8], description: "Finite noisy condensation band around the macro support field." },
    erosionStrength: { category: "material", unit: "fraction", range: [0, 1], description: "Fine-scale evaporation applied only within the support band." },
    phaseTransition: { category: "material", unit: "fraction", range: [0, 1], description: "Liquid-to-ice transition through the volume." },
    clusterStrength: { category: "organization", unit: "fraction", range: [0, 1], description: "Attraction of elements into coherent mesoscale populations." },
    anisotropy: { category: "organization", unit: "ratio", range: [0.1, 12], description: "Along-flow to cross-flow organization wavelength." },
    meanSpacingKm: { category: "organization", unit: "km", range: [0.03, 120], description: "Mean owner separation for an aperiodic point process." },
    minimumSeparationKm: { category: "organization", unit: "km", range: [0, 80], description: "Poisson-disk exclusion radius preventing lattice-like or implausibly overlapping owners." },
    clusterRadiusKm: { category: "organization", unit: "km", range: [0.1, 300], description: "Mesoscale correlation radius for grouped cloud elements." },
    meanCellDiameterKm: { category: "organization", unit: "km", range: [0.1, 100], description: "Open, closed or lacunar circulation-cell diameter." },
    wallWidthFraction: { category: "organization", unit: "fraction", range: [0.02, 0.6], description: "Condensing wall width relative to circulation-cell diameter." },
    bandSpacingKm: { category: "organization", unit: "km", range: [0.1, 150], description: "Physical wavelength between streets, waves or radiating bands." },
    systemMajorRadiusKm: { category: "organization", unit: "km", range: [0.2, 1000], description: "Major world-space radius of the complete weather system." },
    systemMinorRadiusKm: { category: "organization", unit: "km", range: [0.2, 600], description: "Minor world-space radius of the complete weather system." },
    boundaryTransitionKm: { category: "organization", unit: "km", range: [0.02, 200], description: "Formation/dissipation distance in which whole owners change state." },
    lifecycle: { category: "meteorology", unit: "fraction", range: [0, 1], description: "Growth through maturity, glaciation and dissipation." },
    cloudTopRiseRate: { category: "meteorology", unit: "m s^-1", range: [-20, 70], description: "Lifecycle tendency of the resolved cloud top." },
    condensateTendency: { category: "meteorology", unit: "g m^-3 s^-1", range: [-1, 1], description: "Local condensate production or evaporation rate." },
    glaciationRate: { category: "meteorology", unit: "s^-1", range: [0, 0.1], description: "Rate at which liquid material converts to ice." },
    precipitationEfficiency: { category: "meteorology", unit: "fraction", range: [0, 1], description: "Fraction of generated condensate extracted as precipitation." },
    outflowSpeed: { category: "meteorology", unit: "m s^-1", range: [0, 80], description: "Lifecycle-dependent anvil or cold-pool outflow speed." },
    extinctionKm: { category: "derived-render", unit: "km^-1", range: [0, 140], description: "Spectral extinction derived from condensate and effective radius." },
    dropletEffectiveRadius: { category: "derived-render", unit: "µm", range: [4, 35], description: "Effective liquid droplet radius used by optical approximations." },
    iceEffectiveRadius: { category: "derived-render", unit: "µm", range: [10, 160], description: "Effective ice-crystal radius used by optical approximations." },
    singleScatteringAlbedo: { category: "derived-render", unit: "fraction", range: [0.75, 1], description: "Spectral scattering fraction derived from particle composition." },
    asymmetryParameter: { category: "derived-render", unit: "fraction", range: [0.45, 0.94], description: "Forward-scattering moment derived from phase and effective particle size." },
    cameraRangeKm: { category: "editorial", unit: "km", range: [0.1, 300], description: "Physical range selected after meteorology, never a density mask." },
    horizontalFieldOfView: { category: "editorial", unit: "degrees", range: [18, 130], description: "Camera projection used for physical perspective and composition." },
    viewElevation: { category: "editorial", unit: "degrees", range: [-8, 90], description: "Camera elevation from horizon through zenith." },
    frameAzimuthBias: { category: "editorial", unit: "radians", range: [-1.57, 1.57], description: "World-space system bearing relative to camera forward." },
    exposureCompensation: { category: "editorial", unit: "EV", range: [-4, 4], description: "Photographic exposure applied after physical radiance is integrated." },
} as const satisfies Record<string, CloudParameterDefinition>;

export const CLOUD_VARIETY_GENERA: Record<CloudVariety, CloudGenus[]> = {
    intortus: ["cirrus"],
    vertebratus: ["cirrus"],
    undulatus: ["cirrocumulus", "cirrostratus", "altocumulus", "altostratus", "stratocumulus", "stratus"],
    radiatus: ["cirrus", "altocumulus", "altostratus", "stratocumulus", "cumulus"],
    lacunosus: ["cirrocumulus", "altocumulus", "stratocumulus"],
    duplicatus: ["cirrus", "cirrostratus", "altocumulus", "altostratus", "stratocumulus"],
    translucidus: ["altocumulus", "altostratus", "stratocumulus", "stratus"],
    perlucidus: ["altocumulus", "stratocumulus"],
    opacus: ["altocumulus", "altostratus", "stratocumulus", "stratus"],
};

export const CLOUD_FEATURE_GENERA: Record<CloudSupplementaryFeature, CloudGenus[]> = {
    incus: ["cumulonimbus"],
    mamma: ["cirrus", "cirrocumulus", "altocumulus", "altostratus", "stratocumulus", "cumulonimbus"],
    virga: ["cirrocumulus", "altocumulus", "altostratus", "nimbostratus", "stratocumulus", "cumulus", "cumulonimbus"],
    praecipitatio: ["altostratus", "nimbostratus", "stratocumulus", "stratus", "cumulus", "cumulonimbus"],
    arcus: ["cumulus", "cumulonimbus"],
    tuba: ["cumulus", "cumulonimbus"],
    asperitas: ["altocumulus", "stratocumulus"],
    fluctus: ["cirrus", "altocumulus", "stratocumulus", "stratus", "cumulus"],
    cavum: ["cirrocumulus", "altocumulus", "stratocumulus"],
    murus: ["cumulonimbus"],
    cauda: ["cumulonimbus"],
};

export const CLOUD_ACCESSORY_GENERA: Record<CloudAccessory, CloudGenus[]> = {
    pileus: ["cumulus", "cumulonimbus"],
    velum: ["cumulus", "cumulonimbus"],
    pannus: ["altostratus", "nimbostratus", "cumulus", "cumulonimbus"],
    flumen: ["cumulonimbus"],
};

/**
 * Genera documented for each WMO special-origin designation.  These are
 * identity constraints, not aesthetic defaults: an aircraft trail cannot be
 * relabelled Stratus homogenitus merely because it is viewed near the
 * horizon.  The current WMO table includes both Cumulus and Cumulonimbus for
 * vigorous fire/industrial convection and both Stratus and Cumulus for
 * waterfall-generated cloud. Persistent contrails that have undergone enough
 * internal transformation to become homomutatus may take the appropriate
 * cirriform genus: Cirrus, Cirrocumulus, or Cirrostratus. See WMO ICA
 * section 2.1.3.6.4: https://cloudatlas.wmo.int/en/homomutatus.html
 */
export const CLOUD_SPECIAL_ORIGIN_GENERA: Record<
    Exclude<CloudSpecialOrigin, "natural">,
    CloudGenus[]
> = {
    flammagenitus: ["cumulus", "cumulonimbus"],
    homogenitus: ["cirrus", "cumulus", "cumulonimbus"],
    homomutatus: ["cirrus", "cirrocumulus", "cirrostratus"],
    cataractagenitus: ["stratus", "cumulus"],
    silvagenitus: ["stratus"],
};

/**
 * Cloud genera associated with renderer precipitation states.  `shower` is a
 * precipitation character rather than a particle phase in WMO terminology;
 * it is retained by the existing ABI but is restricted to convective Cu/Cb.
 * Virga ownership follows the supplementary-feature table.
 */
export const CLOUD_PRECIPITATION_GENERA: Record<CloudPrecipitationKind, CloudGenus[]> = {
    none: [
        "clear", "cirrus", "cirrocumulus", "cirrostratus", "altocumulus",
        "altostratus", "nimbostratus", "stratocumulus", "stratus",
        "cumulus", "cumulonimbus",
    ],
    virga: [...CLOUD_FEATURE_GENERA.virga],
    drizzle: ["stratocumulus", "stratus"],
    rain: ["altostratus", "nimbostratus", "stratocumulus", "cumulus", "cumulonimbus"],
    shower: ["cumulus", "cumulonimbus"],
    snow: ["altostratus", "nimbostratus", "stratocumulus", "stratus", "cumulus", "cumulonimbus"],
    hail: ["cumulonimbus"],
};

/**
 * WMO mother-cloud table (International Cloud Atlas, Vol. I, Table 4).
 *
 * `genitus` is growth of a different genus from part of the mother cloud;
 * `mutatus` is a large-scale internal transformation.  Keeping the complete
 * directed relation prevents arbitrary genus pairs from being accepted just
 * because they are different names.
 */
export const CLOUD_MOTHER_GENUS_RELATIONS: Readonly<Record<
    WmoCloudGenus,
    Readonly<Record<CloudMotherRelation, readonly WmoCloudGenus[]>>
>> = {
    cirrus: {
        genitus: ["cirrocumulus", "altocumulus", "cumulonimbus"],
        mutatus: ["cirrostratus"],
    },
    cirrocumulus: {
        genitus: [],
        mutatus: ["cirrus", "cirrostratus", "altocumulus"],
    },
    cirrostratus: {
        genitus: ["cirrocumulus", "cumulonimbus"],
        mutatus: ["cirrus", "cirrocumulus", "altostratus"],
    },
    altocumulus: {
        genitus: ["cumulus", "cumulonimbus"],
        mutatus: ["cirrocumulus", "altostratus", "nimbostratus", "stratocumulus"],
    },
    altostratus: {
        genitus: ["altocumulus", "cumulonimbus"],
        mutatus: ["cirrostratus", "nimbostratus"],
    },
    nimbostratus: {
        genitus: ["cumulus", "cumulonimbus"],
        mutatus: ["altocumulus", "altostratus", "stratocumulus"],
    },
    stratocumulus: {
        genitus: ["altostratus", "nimbostratus", "cumulus", "cumulonimbus"],
        mutatus: ["altocumulus", "nimbostratus", "stratus"],
    },
    stratus: {
        genitus: ["nimbostratus", "cumulus", "cumulonimbus"],
        mutatus: ["stratocumulus"],
    },
    cumulus: {
        genitus: ["altocumulus", "stratocumulus"],
        mutatus: ["stratocumulus", "stratus"],
    },
    cumulonimbus: {
        genitus: ["altocumulus", "altostratus", "nimbostratus", "stratocumulus", "cumulus"],
        mutatus: ["cumulus"],
    },
} as const;

export type CloudValidationSeverity = "error" | "warning";

export interface CloudValidationIssue {
    path: string;
    code: string;
    severity: CloudValidationSeverity;
    message: string;
}

export interface CompiledCloudSystem {
    sourceId: string;
    classification: CloudClassification;
    recipeId: Exclude<CloudSpecies, "generic">;
    macroTopology: CloudMacroTopology;
    materialModel: CloudMaterialModel;
    organizationKind: CloudOrganizationState["kind"];
    organizationOperators: readonly CloudOrganizationOperator[];
    densityOperators: readonly CloudDensityOperator[];
    geometry: {
        baseAltitudeKm: number;
        geometricDepthKm: number;
        elementScaleKm: number;
        verticalAspect: number;
        supportBandFraction: number;
        extent: CloudSystemExtent;
    };
    material: {
        liquidWaterPathKgM2: number;
        iceWaterPathKgM2: number;
        liquidFraction01: number;
        extinctionKm: number;
        singleScatteringAlbedo: number;
        asymmetryParameter: number;
        liquidEffectiveRadiusMicrons: number;
        iceEffectiveRadiusMicrons: number;
    };
    thermodynamics: CloudThermodynamicState;
    kinematics: CloudKinematicState;
    formation: CloudFormationManifoldState;
    lifecycle: CloudLifecycleState;
    precipitation: CloudPrecipitationState;
    features: {
        varieties: readonly CloudVariety[];
        supplementary: readonly CloudSupplementaryFeature[];
        accessories: readonly CloudAccessory[];
        hasIncus: boolean;
        hasVirga: boolean;
        hasSurfacePrecipitation: boolean;
    };
}

export interface CloudCompilationResult {
    issues: CloudValidationIssue[];
    compiled?: CompiledCloudSystem;
}

const finiteRangeIssue = (
    issues: CloudValidationIssue[], path: string, value: number,
    minimum: number, maximum: number,
) => {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
        issues.push({
            path,
            code: "range",
            severity: "error",
            message: `${path} must be finite and within [${minimum}, ${maximum}].`,
        });
    }
};

const duplicateIssues = <T extends string>(
    issues: CloudValidationIssue[], path: string, values: readonly T[],
) => {
    if (new Set(values).size !== values.length) {
        issues.push({
            path,
            code: "duplicate-dimension",
            severity: "error",
            message: `${path} contains the same WMO dimension more than once.`,
        });
    }
};

const organizationCompatibility = (
    organization: CloudOrganizationState,
): readonly CloudOrganization[] => {
    if (organization.kind === "cellular") {
        if (organization.topology === "open") return ["open-cell"];
        if (organization.topology === "closed") return ["closed-cell"];
        return ["unorganized"];
    }
    if (organization.kind === "banded" || organization.kind === "wave-packet") {
        return ["banded", "streets"];
    }
    if (organization.kind === "frontal-shield") return ["frontal"];
    if (organization.kind === "storm-complex") return ["isolated", "banded"];
    return organization.distribution === "clustered"
        ? ["isolated", "unorganized"]
        : ["isolated", "unorganized", "streets"];
};

/**
 * Lacunosus is an orthogonal WMO variety, not a replacement species. The
 * Atlas includes Cirrocumulus lenticularis lacunosus: a wave-conditioned
 * lenticular sheet whose holes require an open/lacunar cellular organization.
 * Keep that one compound state explicit so ordinary lenticularis still cannot
 * silently enter the cellular producer path.
 */
const isCirrocumulusLenticularisLacunosusOrganization = (
    classification: CloudClassification,
    organization: CloudOrganizationState,
) => classification.genus === "cirrocumulus" &&
    classification.species === "lenticularis" &&
    classification.varieties.includes("lacunosus") &&
    organization.kind === "cellular" &&
    organization.topology !== "closed";

/**
 * Validate canonical identity and meteorology without mutating or coercing the
 * source system. Invalid random states are generator bugs, not shader inputs.
 */
export function validateCloudSystem(system: CloudSystemState): CloudValidationIssue[] {
    const issues: CloudValidationIssue[] = [];
    const classification = system.classification;
    const genus = classification.genus;
    const validSpecies = WMO_SPECIES_BY_GENUS[genus] as readonly string[];

    if (classification.species !== null &&
        !validSpecies.includes(classification.species)) {
        issues.push({
            path: "classification.species",
            code: "invalid-genus-species",
            severity: "error",
            message: `${classification.species} is not a WMO species of ${genus}.`,
        });
    }
    if ((genus === "altostratus" || genus === "nimbostratus") &&
        classification.species !== null) {
        issues.push({
            path: "classification.species",
            code: "species-not-applicable",
            severity: "error",
            message: `${genus} does not take a WMO species.`,
        });
    }

    duplicateIssues(issues, "classification.varieties", classification.varieties);
    duplicateIssues(issues, "classification.supplementaryFeatures",
        classification.supplementaryFeatures);
    duplicateIssues(issues, "classification.accessoryClouds",
        classification.accessoryClouds);
    if (classification.varieties.includes("translucidus") &&
        classification.varieties.includes("opacus")) {
        issues.push({
            path: "classification.varieties",
            code: "exclusive-varieties",
            severity: "error",
            message: "translucidus and opacus are mutually exclusive.",
        });
    }
    for (const variety of classification.varieties) {
        if (!CLOUD_VARIETY_GENERA[variety].includes(genus)) {
            issues.push({
                path: "classification.varieties",
                code: "invalid-variety-owner",
                severity: "error",
                message: `${variety} is not valid for ${genus}.`,
            });
        }
    }
    for (const feature of classification.supplementaryFeatures) {
        if (!CLOUD_FEATURE_GENERA[feature].includes(genus)) {
            issues.push({
                path: "classification.supplementaryFeatures",
                code: "invalid-feature-owner",
                severity: "error",
                message: `${feature} is not valid for ${genus}.`,
            });
        }
    }
    for (const accessory of classification.accessoryClouds) {
        if (!CLOUD_ACCESSORY_GENERA[accessory].includes(genus)) {
            issues.push({
                path: "classification.accessoryClouds",
                code: "invalid-accessory-owner",
                severity: "error",
                message: `${accessory} is not valid for ${genus}.`,
            });
        }
    }
    const organization = system.organization;
    if (classification.varieties.includes("radiatus") &&
        organization.kind !== "banded") {
        issues.push({
            path: "organization.kind",
            code: "radiatus-without-radiating-bands",
            severity: "error",
            message: "radiatus requires finite, perspective-converging cloud bands.",
        });
    }
    if (classification.varieties.includes("undulatus") &&
        organization.kind !== "banded" && organization.kind !== "wave-packet") {
        issues.push({
            path: "organization.kind",
            code: "undulatus-without-wave-organization",
            severity: "error",
            message: "undulatus requires a coherent gravity-wave or band organization.",
        });
    }
    if (classification.varieties.includes("lacunosus") &&
        (organization.kind !== "cellular" ||
            organization.topology === "closed")) {
        issues.push({
            path: "organization.kind",
            code: "lacunosus-without-open-cells",
            severity: "error",
            message: "lacunosus requires an open or lacunar cellular field with real holes.",
        });
    }
    if (classification.supplementaryFeatures.includes("incus") &&
        (genus !== "cumulonimbus" || classification.species !== "capillatus")) {
        issues.push({
            path: "classification.supplementaryFeatures",
            code: "invalid-incus-stage",
            severity: "error",
            message: "incus requires Cumulonimbus capillatus.",
        });
    }
    const origin = classification.origin;
    if (origin.kind === "special") {
        if (!CLOUD_SPECIAL_ORIGIN_GENERA[origin.designation].includes(genus)) {
            issues.push({
                path: "classification.origin",
                code: "invalid-special-origin-owner",
                severity: "error",
                message: `${origin.designation} is not a WMO special origin of ${genus}.`,
            });
        }
        if (origin.source === "aircraft-condensation-trail" &&
            origin.designation !== "homogenitus" &&
            origin.designation !== "homomutatus") {
            issues.push({
                path: "classification.origin.source",
                code: "invalid-aircraft-origin",
                severity: "error",
                message: "Aircraft condensation trails require homogenitus or homomutatus.",
            });
        }
        // WMO ICA 2.1.3.6.3 names a recently formed persistent contrail only
        // Cirrus homogenitus. It explicitly receives no species, variety, or
        // supplementary feature while it remains in that transient state.
        if (genus === "cirrus" && origin.designation === "homogenitus" &&
            (classification.species !== null ||
                classification.varieties.length > 0 ||
                classification.supplementaryFeatures.length > 0)) {
            issues.push({
                path: "classification",
                code: "classified-aircraft-contrail",
                severity: "error",
                message: "Cirrus homogenitus takes no species, variety, or supplementary feature.",
            });
        }
    } else if (origin.kind === "genitus" || origin.kind === "mutatus") {
        if (origin.motherGenus === genus) {
            issues.push({
                path: "classification.origin.motherGenus",
                code: "self-mother-cloud",
                severity: "error",
                message: `${origin.kind} requires formation from a different mother-cloud genus.`,
            });
        } else if (!CLOUD_MOTHER_GENUS_RELATIONS[genus][origin.kind]
            .includes(origin.motherGenus)) {
            issues.push({
                path: "classification.origin.motherGenus",
                code: "invalid-mother-cloud-relation",
                severity: "error",
                message: `${genus} ${origin.kind} cannot derive from ${origin.motherGenus}.`,
            });
        }
    }

    const rendererSpecies = rendererSpeciesForClassification(classification);
    if (!rendererSpecies) {
        issues.push({
            path: "classification",
            code: "missing-renderer-recipe",
            severity: "error",
            message: "The canonical classification has no compiled renderer recipe.",
        });
    } else {
        const recipe = CLOUD_RENDERER_RECIPES[rendererSpecies];
        const compatibleOrganizations = organizationCompatibility(system.organization);
        const exactLacunosusLens = rendererSpecies ===
            "cirrocumulus-lenticularis" &&
            isCirrocumulusLenticularisLacunosusOrganization(
                classification,
                system.organization,
            );
        if (!exactLacunosusLens && !compatibleOrganizations.some((value) =>
            recipe.validOrganizations.includes(value))) {
            issues.push({
                path: "organization.kind",
                code: "incompatible-organization",
                severity: "error",
                message: `${system.organization.kind} is incompatible with ${rendererSpecies}.`,
            });
        }
    }

    finiteRangeIssue(issues, "physical.baseAltitudeKm",
        system.physical.baseAltitudeKm, 0, 20);
    finiteRangeIssue(issues, "physical.geometricDepthKm",
        system.physical.geometricDepthKm, 0.02, 16);
    finiteRangeIssue(issues, "physical.coverageOktas",
        system.physical.coverageOktas, 0, 8);
    finiteRangeIssue(issues, "physical.thermodynamics.relativeHumidity",
        system.physical.thermodynamics.relativeHumidity, 0, 1.2);
    finiteRangeIssue(issues, "physical.condensate.liquidFraction",
        system.physical.condensate.liquidFraction, 0, 1);
    finiteRangeIssue(issues, "physical.condensate.liquidWaterPath",
        system.physical.condensate.liquidWaterPath, 0, 5);
    finiteRangeIssue(issues, "physical.condensate.iceWaterPath",
        system.physical.condensate.iceWaterPath, 0, 3);
    finiteRangeIssue(issues, "extent.majorRadiusKm", system.extent.majorRadiusKm, 0.2, 1000);
    finiteRangeIssue(issues, "extent.minorRadiusKm", system.extent.minorRadiusKm, 0.2, 600);
    finiteRangeIssue(issues, "extent.boundaryTransitionKm",
        system.extent.boundaryTransitionKm, 0.02, 200);
    finiteRangeIssue(issues, "lifecycle.stageProgress", system.lifecycle.stageProgress, 0, 1);
    finiteRangeIssue(issues, "lifecycle.precipitationEfficiency",
        system.lifecycle.precipitationEfficiency, 0, 1);

    const formation = system.physical.formation;
    const cloudTopKm = system.physical.baseAltitudeKm +
        system.physical.geometricDepthKm;
    finiteRangeIssue(issues, "physical.formation.liftingCondensationLevelKm",
        formation.liftingCondensationLevelKm, 0, 20);
    finiteRangeIssue(issues, "physical.formation.freezingLevelKm",
        formation.freezingLevelKm, 0, 20);
    finiteRangeIssue(issues, "physical.formation.inversionStrengthKelvin",
        formation.inversionStrengthKelvin, 0, 20);
    finiteRangeIssue(issues, "physical.formation.shearLayerBaseKm",
        formation.shearLayerBaseKm, 0, 22);
    finiteRangeIssue(issues, "physical.formation.shearLayerTopKm",
        formation.shearLayerTopKm, 0, 24);
    if (formation.shearLayerTopKm <= formation.shearLayerBaseKm) {
        issues.push({
            path: "physical.formation.shearLayerTopKm",
            code: "inverted-shear-layer",
            severity: "error",
            message: "The shear-layer top must be above its base.",
        });
    }
    if (formation.levelOfFreeConvectionKm !== null) {
        finiteRangeIssue(issues, "physical.formation.levelOfFreeConvectionKm",
            formation.levelOfFreeConvectionKm, 0, 20);
    }
    if (formation.equilibriumLevelKm !== null) {
        finiteRangeIssue(issues, "physical.formation.equilibriumLevelKm",
            formation.equilibriumLevelKm, 0, 24);
    }
    if ((formation.levelOfFreeConvectionKm === null) !==
        (formation.equilibriumLevelKm === null)) {
        issues.push({
            path: "physical.formation",
            code: "incomplete-convective-manifold",
            severity: "error",
            message: "LFC and equilibrium level must either both exist or both be absent.",
        });
    } else if (formation.levelOfFreeConvectionKm !== null &&
        formation.equilibriumLevelKm !== null &&
        (formation.levelOfFreeConvectionKm < formation.liftingCondensationLevelKm ||
            formation.equilibriumLevelKm <= formation.levelOfFreeConvectionKm ||
            formation.equilibriumLevelKm > cloudTopKm + 1)) {
        issues.push({
            path: "physical.formation",
            code: "invalid-convective-manifold",
            severity: "error",
            message: "The physical ordering must be LCL <= LFC < EL near the cloud top.",
        });
    }
    if (formation.inversionBaseKm !== null) {
        finiteRangeIssue(issues, "physical.formation.inversionBaseKm",
            formation.inversionBaseKm, 0, 22);
        if (formation.inversionBaseKm < system.physical.baseAltitudeKm - 0.1 ||
            formation.inversionBaseKm > cloudTopKm + 2) {
            issues.push({
                path: "physical.formation.inversionBaseKm",
                code: "detached-inversion",
                severity: "error",
                message: "A capping inversion must intersect or immediately cap the system.",
            });
        }
    } else if (formation.inversionStrengthKelvin > 0) {
        issues.push({
            path: "physical.formation.inversionStrengthKelvin",
            code: "missing-inversion-base",
            severity: "error",
            message: "Inversion strength cannot be nonzero without an inversion base.",
        });
    }

    const precipitation = system.physical.precipitation;
    finiteRangeIssue(issues, "physical.precipitation.rate",
        precipitation.rate, 0, 300);
    finiteRangeIssue(issues, "physical.precipitation.terminalVelocity",
        precipitation.terminalVelocity, 0, 60);
    finiteRangeIssue(issues, "physical.precipitation.evaporationDepthKm",
        precipitation.evaporationDepthKm, 0, 10);
    if (!CLOUD_PRECIPITATION_GENERA[precipitation.kind].includes(genus)) {
        issues.push({
            path: "physical.precipitation.kind",
            code: "invalid-precipitation-owner",
            severity: "error",
            message: `${precipitation.kind} is not associated with ${genus}.`,
        });
    }
    if (precipitation.kind === "none" && precipitation.rate > 0) {
        issues.push({
            path: "physical.precipitation.rate",
            code: "precipitation-rate-without-kind",
            severity: "error",
            message: "A none precipitation state must have zero production rate.",
        });
    }
    if (precipitation.kind !== "none" &&
        (precipitation.rate <= 0 || precipitation.terminalVelocity <= 0)) {
        issues.push({
            path: "physical.precipitation",
            code: "inactive-precipitation-state",
            severity: "error",
            message: "An active precipitation state requires positive production and fall speed.",
        });
    }
    if (precipitation.kind === "virga" && precipitation.evaporationDepthKm <= 0) {
        issues.push({
            path: "physical.precipitation.evaporationDepthKm",
            code: "virga-without-evaporation",
            severity: "error",
            message: "Virga requires a finite unsaturated evaporation path.",
        });
    }
    if (classification.supplementaryFeatures.includes("virga") &&
        precipitation.kind !== "virga") {
        issues.push({
            path: "physical.precipitation.kind",
            code: "virga-state-mismatch",
            severity: "error",
            message: "A virga feature requires virga hydrometeor survival state.",
        });
    }
    if (classification.supplementaryFeatures.includes("praecipitatio") &&
        (precipitation.kind === "none" || precipitation.kind === "virga")) {
        issues.push({
            path: "physical.precipitation.kind",
            code: "surface-precipitation-required",
            severity: "error",
            message: "praecipitatio requires hydrometeors to reach the surface.",
        });
    }
    if (classification.supplementaryFeatures.includes("cauda") &&
        !classification.supplementaryFeatures.includes("murus")) {
        issues.push({
            path: "classification.supplementaryFeatures",
            code: "cauda-without-murus",
            severity: "error",
            message: "Cauda is the tail cloud joining a supercell precipitation region to murus.",
        });
    }
    const stormOwnedFeature =
        classification.supplementaryFeatures.includes("murus") ||
        classification.supplementaryFeatures.includes("cauda") ||
        classification.accessoryClouds.includes("flumen");
    if (stormOwnedFeature && system.organization.kind !== "storm-complex") {
        issues.push({
            path: "organization.kind",
            code: "storm-feature-without-storm-complex",
            severity: "error",
            message: "Murus, cauda and flumen require one coherent supercell storm complex.",
        });
    }
    if (classification.supplementaryFeatures.includes("fluctus") &&
        system.physical.kinematics.verticalShear < 3) {
        issues.push({
            path: "physical.kinematics.verticalShear",
            code: "fluctus-without-shear-instability",
            severity: "error",
            message: "fluctus requires a resolved shear layer capable of Kelvin-Helmholtz billows.",
        });
    }
    if (classification.supplementaryFeatures.includes("arcus") &&
        (system.lifecycle.outflowSpeed <= 0 ||
            system.physical.precipitation.kind === "none")) {
        issues.push({
            path: "lifecycle.outflowSpeed",
            code: "arcus-without-cold-pool-outflow",
            severity: "error",
            message: "arcus requires a precipitation-driven gust-front outflow.",
        });
    }
    if (classification.supplementaryFeatures.includes("tuba") &&
        (system.physical.thermodynamics.verticalVelocity <= 0 ||
            system.physical.kinematics.turbulenceDissipation <= 0)) {
        issues.push({
            path: "physical.kinematics",
            code: "tuba-without-convective-vorticity",
            severity: "error",
            message: "tuba requires active convective ascent and a turbulent/vortical cloud base.",
        });
    }
    if (classification.accessoryClouds.includes("pannus") &&
        (system.physical.precipitation.kind === "none" ||
            system.physical.thermodynamics.relativeHumidity < 0.85)) {
        issues.push({
            path: "classification.accessoryClouds",
            code: "pannus-without-saturated-precipitation-layer",
            severity: "error",
            message: "pannus requires precipitation-moistened, near-saturated air below its parent.",
        });
    }
    if ((classification.accessoryClouds.includes("pileus") ||
        classification.accessoryClouds.includes("velum")) &&
        system.physical.thermodynamics.verticalVelocity <= 0) {
        issues.push({
            path: "physical.thermodynamics.verticalVelocity",
            code: "lift-accessory-without-ascent",
            severity: "error",
            message: "Pileus and velum require active ascent over a cumuliform cloud.",
        });
    }
    if (genus === "cumulonimbus") {
        if (system.organization.kind !== "storm-complex" &&
            system.organization.kind !== "banded") {
            issues.push({
                path: "organization.kind",
                code: "cumulonimbus-without-storm-complex",
                severity: "error",
                message: "Cumulonimbus must retain a storm-owned updraft/outflow complex or a finite line of such owners.",
            });
        }
        if (formation.levelOfFreeConvectionKm === null ||
            formation.equilibriumLevelKm === null) {
            issues.push({
                path: "physical.formation",
                code: "cumulonimbus-without-convective-manifold",
                severity: "error",
                message: "Cumulonimbus requires resolved LFC and equilibrium levels.",
            });
        }
    }
    if (classification.supplementaryFeatures.includes("incus") &&
        (system.physical.condensate.iceWaterPath <= 0 ||
            system.lifecycle.stage === "incipient" ||
            system.lifecycle.stage === "growing")) {
        issues.push({
            path: "classification.supplementaryFeatures",
            code: "incus-without-glaciated-outflow",
            severity: "error",
            message: "Incus requires a developed, glaciated Cumulonimbus outflow.",
        });
    }
    return issues;
}

const midpoint = (range: readonly [number, number]) => (range[0] + range[1]) * 0.5;

/**
 * Compile one valid physical system into named, camera-independent renderer
 * inputs. The result is immutable by construction and contains no screen-space
 * framing, exposure, or palette decisions.
 */
export function compileCloudSystem(system: CloudSystemState): CloudCompilationResult {
    const issues = validateCloudSystem(system);
    if (issues.some((issue) => issue.severity === "error")) return { issues };

    const recipeId = rendererSpeciesForClassification(system.classification);
    if (!recipeId) return { issues };
    const recipe = CLOUD_RENDERER_RECIPES[recipeId];
    const condensate = system.physical.condensate;
    const depthKm = system.physical.geometricDepthKm;
    const liquidRadiusMetres = condensate.dropletEffectiveRadius * 1e-6;
    const iceRadiusMetres = condensate.iceEffectiveRadius * 1e-6;
    const liquidOpticalDepth = liquidRadiusMetres > 0
        ? 3 * condensate.liquidWaterPath / (2 * 1000 * liquidRadiusMetres)
        : 0;
    const iceOpticalDepth = iceRadiusMetres > 0
        ? 3 * condensate.iceWaterPath / (2 * 917 * iceRadiusMetres)
        : 0;
    const iceFraction = 1 - condensate.liquidFraction;

    return {
        issues,
        compiled: {
            sourceId: system.id,
            classification: {
                ...system.classification,
                varieties: [...system.classification.varieties],
                supplementaryFeatures: [...system.classification.supplementaryFeatures],
                accessoryClouds: [...system.classification.accessoryClouds],
            } as CloudClassification,
            recipeId,
            macroTopology: recipe.macroTopology,
            materialModel: recipe.materialModel,
            organizationKind: system.organization.kind,
            organizationOperators: [...recipe.organizationOperators],
            densityOperators: [...recipe.densityOperators],
            geometry: {
                baseAltitudeKm: system.physical.baseAltitudeKm,
                geometricDepthKm: depthKm,
                elementScaleKm: midpoint(recipe.elementScaleKm),
                verticalAspect: midpoint(recipe.verticalAspect),
                supportBandFraction: midpoint(recipe.boundarySupport),
                extent: { ...system.extent },
            },
            material: {
                liquidWaterPathKgM2: condensate.liquidWaterPath,
                iceWaterPathKgM2: condensate.iceWaterPath,
                liquidFraction01: condensate.liquidFraction,
                extinctionKm: (liquidOpticalDepth + iceOpticalDepth) / depthKm,
                singleScatteringAlbedo: 0.999 - iceFraction * 0.002,
                asymmetryParameter: 0.85 - iceFraction * 0.1,
                liquidEffectiveRadiusMicrons: condensate.dropletEffectiveRadius,
                iceEffectiveRadiusMicrons: condensate.iceEffectiveRadius,
            },
            thermodynamics: { ...system.physical.thermodynamics },
            kinematics: { ...system.physical.kinematics },
            formation: { ...system.physical.formation },
            lifecycle: { ...system.lifecycle },
            precipitation: { ...system.physical.precipitation },
            features: {
                varieties: [...system.classification.varieties],
                supplementary: [...system.classification.supplementaryFeatures],
                accessories: [...system.classification.accessoryClouds],
                hasIncus: system.classification.supplementaryFeatures.includes("incus"),
                hasVirga: system.classification.supplementaryFeatures.includes("virga"),
                hasSurfacePrecipitation:
                    system.classification.supplementaryFeatures.includes("praecipitatio"),
            },
        },
    };
}

export function recipeForCloudSpecies(species: CloudSpecies) {
    return species === "generic" ? undefined : CLOUD_RENDERER_RECIPES[species];
}

/**
 * Compatibility compiler from the legacy renderer identifier into canonical
 * WMO dimensions. The three historical compound identifiers remain GPU recipe
 * keys, but no longer masquerade as WMO species in labs or new scene state.
 */
export function classificationFromRendererSpecies(
    rendererSpecies: Exclude<CloudSpecies, "generic">,
): CloudClassification {
    const recipe = CLOUD_RENDERER_RECIPES[rendererSpecies];
    const base = {
        genus: recipe.genus,
        varieties: [] as CloudVariety[],
        supplementaryFeatures: [] as CloudSupplementaryFeature[],
        accessoryClouds: [] as CloudAccessory[],
        origin: { kind: "natural" } as const,
    };
    if (rendererSpecies === "altostratus-opacus") {
        return { ...base, genus: "altostratus", species: null, varieties: ["opacus"] };
    }
    if (rendererSpecies === "nimbostratus-praecipitatio") {
        return {
            ...base,
            genus: "nimbostratus",
            species: null,
            supplementaryFeatures: ["praecipitatio"],
        };
    }
    if (rendererSpecies === "cumulonimbus-capillatus-incus") {
        return {
            ...base,
            genus: "cumulonimbus",
            species: "capillatus",
            supplementaryFeatures: ["incus"],
        };
    }
    const designation = rendererSpecies.slice(recipe.genus.length + 1);
    const valid = WMO_SPECIES_BY_GENUS[recipe.genus] as readonly string[];
    if (!valid.includes(designation)) {
        throw new Error(`Renderer species ${rendererSpecies} has no canonical WMO mapping.`);
    }
    return { ...base, species: designation } as CloudClassification;
}

export function rendererSpeciesForClassification(
    classification: CloudClassification,
): Exclude<CloudSpecies, "generic"> | undefined {
    // These two legacy compound identifiers are renderer recipe keys, not
    // claims that every Altostratus is opacus or every Nimbostratus carries
    // praecipitatio. Orthogonal WMO axes remain authoritative in state while
    // the common physical sheet recipe serves all of the genus' appearances.
    if (classification.genus === "altostratus") {
        return "altostratus-opacus";
    }
    if (classification.genus === "nimbostratus") {
        return "nimbostratus-praecipitatio";
    }
    if (classification.genus === "cumulonimbus" &&
        classification.species === "capillatus" &&
        classification.supplementaryFeatures.includes("incus")) {
        return "cumulonimbus-capillatus-incus";
    }
    // The physical source-line manifold supplies the contrail macroshape. A
    // neutral Cirrus ice recipe supplies only its bounded material/transport
    // basis; it must not leak the taxonomically forbidden fibratus label back
    // into canonical state.
    if (classification.genus === "cirrus" && classification.species === null &&
        classification.origin.kind === "special" &&
        classification.origin.designation === "homogenitus") {
        return "cirrus-fibratus";
    }
    if (classification.species === null) return undefined;
    const candidate = `${classification.genus}-${classification.species}`;
    if (Object.hasOwn(CLOUD_RENDERER_RECIPES, candidate)) {
        return candidate as Exclude<CloudSpecies, "generic">;
    }
    return undefined;
}

/** Parse one labeled benchmark designation without an unchecked type cast. */
export function classificationFromDesignation(
    genus: WmoCloudGenus,
    designation: string,
): CloudClassification {
    if (genus === "altostratus" && designation === "opacus") {
        return classificationFromRendererSpecies("altostratus-opacus");
    }
    if (genus === "nimbostratus" && designation === "praecipitatio") {
        return classificationFromRendererSpecies("nimbostratus-praecipitatio");
    }
    if (genus === "cumulonimbus" && designation === "capillatus incus") {
        return classificationFromRendererSpecies("cumulonimbus-capillatus-incus");
    }
    const candidate = `${genus}-${designation.replaceAll(" ", "-")}`;
    if (!Object.hasOwn(CLOUD_RENDERER_RECIPES, candidate)) {
        throw new Error(`Unsupported cloud designation: ${genus} ${designation}`);
    }
    return classificationFromRendererSpecies(
        candidate as Exclude<CloudSpecies, "generic">,
    );
}

export function isOrthogonalStateValid(genus: CloudGenus, state: CloudOrthogonalState) {
    if (state.varieties.includes("translucidus") && state.varieties.includes("opacus")) return false;
    if (state.varieties.some((value) => !CLOUD_VARIETY_GENERA[value].includes(genus))) return false;
    if (state.supplementaryFeatures.some((value) => !CLOUD_FEATURE_GENERA[value].includes(genus))) return false;
    if (state.accessories.some((value) => !CLOUD_ACCESSORY_GENERA[value].includes(genus))) return false;
    if (state.specialOrigin !== "natural" &&
        !CLOUD_SPECIAL_ORIGIN_GENERA[state.specialOrigin].includes(genus)) return false;
    if (!CLOUD_PRECIPITATION_GENERA[state.precipitationKind].includes(genus)) return false;
    if (state.upperAtmosphericCloud !== "none" && genus !== "clear") return false;
    return true;
}

/**
 * Isolated physical contracts for Cirrostratus and visible upper-atmospheric
 * clouds. No renderer, atlas, runtime, or scene state is mutated here.
 */

import type { CloudLifecycleStage } from "./cloud-state-map";

export const UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS = [
    "cirrostratus-fibratus", "cirrostratus-nebulosus",
    "cirrostratus-duplicatus", "cirrostratus-undulatus",
    "cirrostratus-radiatus", "cirrostratus-translucidus",
    "cirrostratus-opacus", "polar-stratospheric-sts",
    "polar-stratospheric-nat", "polar-stratospheric-ice",
    "nacreous-ice", "noctilucent",
] as const;
export type UpperAtmosphericCloudRepresentation =
    (typeof UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS)[number];
export type UpperAtmosphericCloudFamily =
    | "cirrostratus" | "polar-stratospheric-cloud" | "noctilucent-cloud";
export type UpperClassificationAxis =
    | "wmo-species" | "wmo-variety" | "companion-cloud-organization"
    | "noncanonical-optical-state" | "scientific-particle-class"
    | "wmo-special-cloud";
export type UpperParticleComposition =
    | "tropospheric-water-ice" | "supercooled-ternary-solution"
    | "nitric-acid-trihydrate" | "stratospheric-water-ice"
    | "meteoric-smoke-nucleated-water-ice";
export type UpperElementKind =
    | "fibrous-veil" | "continuous-veil" | "superposed-veils"
    | "wave-veil" | "perspective-bands" | "stratospheric-wave-patch"
    | "mesospheric-wave-sheet";

export interface UpperAtmosphericDescriptor {
    readonly representation: UpperAtmosphericCloudRepresentation;
    readonly family: UpperAtmosphericCloudFamily;
    readonly classificationAxis: UpperClassificationAxis;
    readonly wmoCanonicalDesignation: boolean;
    readonly productionReachable: boolean;
    readonly rendererSpecies:
        | "cirrostratus-fibratus" | "cirrostratus-nebulosus" | null;
    readonly wmoAbbreviation: string | null;
    readonly wmoSource: string;
    readonly scienceSources: readonly string[];
    readonly elementKind: UpperElementKind;
    readonly composition: UpperParticleComposition;
    readonly altitudeKm: readonly [number, number];
    readonly formationSpanKm: readonly [number, number];
    readonly geometricDepthKm: readonly [number, number];
    readonly opticalDepth: readonly [number, number];
    readonly particleDiameterMicrons: readonly [number, number];
    readonly requiredMorphology: readonly string[];
    readonly forbiddenMorphology: readonly string[];
    readonly legalEnvironments: readonly UpperBenchmarkEnvironment[];
    readonly taxonomyNote: string;
}

export const UPPER_BENCHMARK_ENVIRONMENTS = [
    "day-oblique-natural", "golden-backlit-telephoto", "humid-wide-nearby",
    "twilight-overhead", "moonlight-natural",
] as const;
export type UpperBenchmarkEnvironment =
    (typeof UPPER_BENCHMARK_ENVIRONMENTS)[number];

const CS_PHYSICS = "https://cloudatlas.wmo.int/en/physical-constitution-cirrostratus.html";
const PSC_SCIENCE = "https://doi.org/10.1029/2007JD008616";
const PSC_OPTICS = "https://doi.org/10.5194/amt-16-419-2023";
const NLC_WMO = "https://cloudatlas.wmo.int/noctilucent-clouds.html";
const NLC_CIPS = "https://doi.org/10.1016/j.jastp.2008.09.039";
const allContexts = [...UPPER_BENCHMARK_ENVIRONMENTS];
const sunlitUpperContexts: readonly UpperBenchmarkEnvironment[] = [
    "day-oblique-natural", "golden-backlit-telephoto", "twilight-overhead",
];
const twilightContexts: readonly UpperBenchmarkEnvironment[] = [
    "twilight-overhead", "moonlight-natural",
];

const descriptor = (value: UpperAtmosphericDescriptor) => value;
export const UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS = {
    "cirrostratus-fibratus": descriptor({
        representation: "cirrostratus-fibratus", family: "cirrostratus",
        classificationAxis: "wmo-species", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: "cirrostratus-fibratus",
        wmoAbbreviation: "Cs fib",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrostratus-cs.html",
        scienceSources: [CS_PHYSICS], elementKind: "fibrous-veil",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [30, 800], geometricDepthKm: [0.2, 3],
        opticalDepth: [0.01, 3], particleDiameterMicrons: [8, 180],
        requiredMorphology: ["continuous fibrous veil support", "thin non-hooked striations", "sedimenting ice filaments", "finite invading front"],
        forbiddenMorphology: ["detached Cirrus field", "procedural hair grid", "opaque Altostratus", "decorative halo texture"],
        legalEnvironments: allContexts,
        taxonomyNote: "WMO species; may develop from Cirrus fibratus or spissatus.",
    }),
    "cirrostratus-nebulosus": descriptor({
        representation: "cirrostratus-nebulosus", family: "cirrostratus",
        classificationAxis: "wmo-species", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: "cirrostratus-nebulosus",
        wmoAbbreviation: "Cs neb",
        wmoSource: "https://cloudatlas.wmo.int/en/species-cirrostratus-cs.html",
        scienceSources: [CS_PHYSICS], elementKind: "continuous-veil",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [50, 1200], geometricDepthKm: [0.2, 3.5],
        opticalDepth: [0.005, 3], particleDiameterMicrons: [8, 140],
        requiredMorphology: ["ill-defined smooth veil", "no apparent detail at ordinary contrast", "finite frontal edge", "source outline preserved when elevated"],
        forbiddenMorphology: ["uniform alpha card", "low-frequency color wash only", "opaque source concealment", "halo baked into density"],
        legalEnvironments: allContexts,
        taxonomyNote: "WMO species; can be nearly invisible except for a physical halo.",
    }),
    "cirrostratus-duplicatus": descriptor({
        representation: "cirrostratus-duplicatus", family: "cirrostratus",
        classificationAxis: "wmo-variety", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: "cirrostratus-nebulosus",
        wmoAbbreviation: "Cs du",
        wmoSource: "https://cloudatlas.wmo.int/en/appendix-3-history-of-cloud-nomenclature.html",
        scienceSources: [CS_PHYSICS], elementKind: "superposed-veils",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [50, 1000], geometricDepthKm: [0.35, 4],
        opticalDepth: [0.02, 3.4], particleDiameterMicrons: [8, 160],
        requiredMorphology: ["two or more distinct high veils", "slightly different levels", "partial physical merging", "independent finite edges"],
        forbiddenMorphology: ["same veil drawn twice", "coplanar z-fighting bands", "equal opacity layers", "screen-space parallax"],
        legalEnvironments: allContexts,
        taxonomyNote: "WMO variety orthogonal to the fibratus/nebulosus species axis.",
    }),
    "cirrostratus-undulatus": descriptor({
        representation: "cirrostratus-undulatus", family: "cirrostratus",
        classificationAxis: "wmo-variety", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: "cirrostratus-nebulosus",
        wmoAbbreviation: "Cs un",
        wmoSource: "https://cloudatlas.wmo.int/en/appendix-3-history-of-cloud-nomenclature.html",
        scienceSources: [CS_PHYSICS], elementKind: "wave-veil",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [40, 900], geometricDepthKm: [0.2, 3.4],
        opticalDepth: [0.01, 3], particleDiameterMicrons: [8, 160],
        requiredMorphology: ["one or two gravity-wave systems", "continuous ice veil", "wavelength and amplitude drift", "finite wave packet"],
        forbiddenMorphology: ["sine alpha stripes", "equal parallel ribbons", "Cirrocumulus beads", "unbounded periodicity"],
        legalEnvironments: allContexts,
        taxonomyNote: "WMO variety orthogonal to species and duplicatus.",
    }),
    "cirrostratus-radiatus": descriptor({
        representation: "cirrostratus-radiatus", family: "cirrostratus",
        classificationAxis: "companion-cloud-organization", wmoCanonicalDesignation: false,
        productionReachable: true, rendererSpecies: "cirrostratus-fibratus",
        wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/en/varieties-cirrus-radiatus-ci-ra.html",
        scienceSources: [CS_PHYSICS], elementKind: "perspective-bands",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [80, 1000], geometricDepthKm: [0.2, 3],
        opticalDepth: [0.01, 2.5], particleDiameterMicrons: [8, 180],
        requiredMorphology: ["physically parallel Cirrus bands", "perspective-only convergence", "bands partly merging into Cs veil", "shared frontal support"],
        forbiddenMorphology: ["radial screen-space spokes", "convergence in world coordinates", "invented Cs variety label", "independent unrelated streaks"],
        legalEnvironments: allContexts,
        taxonomyNote: "Radiatus is a Cirrus variety; WMO notes its bands may be partly Cirrostratus. Render as a mixed companion organization, never Cs radiatus taxonomy.",
    }),
    "cirrostratus-translucidus": descriptor({
        representation: "cirrostratus-translucidus", family: "cirrostratus",
        classificationAxis: "noncanonical-optical-state", wmoCanonicalDesignation: false,
        productionReachable: true, rendererSpecies: "cirrostratus-nebulosus",
        wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/en/cirrostratus-cs.html",
        scienceSources: [CS_PHYSICS], elementKind: "continuous-veil",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [50, 1200], geometricDepthKm: [0.15, 2.5],
        opticalDepth: [0.004, 1.6], particleDiameterMicrons: [8, 140],
        requiredMorphology: ["inherently transparent Cs veil", "sharp source outline when elevated", "sparse ice volume", "halo-only visibility possible"],
        forbiddenMorphology: ["invented Cs translucidus taxonomy", "ground-glass source blur", "opaque patch", "uniform white overlay"],
        legalEnvironments: allContexts,
        taxonomyNote: "Not a WMO Cs variety; this runtime optical state expresses transparency inherent in the genus.",
    }),
    "cirrostratus-opacus": descriptor({
        representation: "cirrostratus-opacus", family: "cirrostratus",
        classificationAxis: "noncanonical-optical-state", wmoCanonicalDesignation: false,
        productionReachable: false, rendererSpecies: "cirrostratus-nebulosus",
        wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/en/physical-constitution-cirrostratus.html",
        scienceSources: [CS_PHYSICS], elementKind: "continuous-veil",
        composition: "tropospheric-water-ice", altitudeKm: [5, 14],
        formationSpanKm: [60, 1200], geometricDepthKm: [1, 5],
        opticalDepth: [3, 12], particleDiameterMicrons: [10, 180],
        requiredMorphology: ["thickening transition state", "loss of Cs transparency", "lowering frontal shield", "Altostratus reclassification cue"],
        forbiddenMorphology: ["production Cs opacus label", "halo through opaque mass", "sharp source through high optical depth", "permanent high grey slab"],
        legalEnvironments: [],
        taxonomyNote: "Invalid as Cirrostratus: opacus is not a Cs variety; an opaque thickened veil must transition to Altostratus or another genus.",
    }),
    "polar-stratospheric-sts": descriptor({
        representation: "polar-stratospheric-sts", family: "polar-stratospheric-cloud",
        classificationAxis: "scientific-particle-class", wmoCanonicalDesignation: false,
        productionReachable: true, rendererSpecies: null, wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/nacreous-clouds.html",
        scienceSources: [PSC_SCIENCE, PSC_OPTICS], elementKind: "stratospheric-wave-patch",
        composition: "supercooled-ternary-solution", altitudeKm: [15, 30],
        formationSpanKm: [20, 800], geometricDepthKm: [0.3, 5],
        opticalDepth: [0.0002, 0.12], particleDiameterMicrons: [0.2, 2.5],
        requiredMorphology: ["thin stratospheric sheet or wave patch", "liquid spherical scattering", "polar-vortex temperature support", "finite synoptic or wave boundary"],
        forbiddenMorphology: ["tropospheric cloud shading", "strong nacreous colour by default", "opaque lens", "low-altitude parallax"],
        legalEnvironments: sunlitUpperContexts,
        taxonomyNote: "Liquid HNO3/H2SO4/H2O PSC class; not synonymous with visible nacreous ice cloud.",
    }),
    "polar-stratospheric-nat": descriptor({
        representation: "polar-stratospheric-nat", family: "polar-stratospheric-cloud",
        classificationAxis: "scientific-particle-class", wmoCanonicalDesignation: false,
        productionReachable: true, rendererSpecies: null, wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/nacreous-clouds.html",
        scienceSources: [PSC_SCIENCE, PSC_OPTICS], elementKind: "stratospheric-wave-patch",
        composition: "nitric-acid-trihydrate", altitudeKm: [15, 30],
        formationSpanKm: [20, 700], geometricDepthKm: [0.3, 5],
        opticalDepth: [0.0001, 0.1], particleDiameterMicrons: [0.5, 20],
        requiredMorphology: ["thin polar-stratospheric patches", "aspherical depolarizing particles", "mountain-wave or vortex structure", "finite temperature support"],
        forbiddenMorphology: ["identical bright lenses", "spherical-only polarization", "rainbow hue ramp", "tropospheric depth"],
        legalEnvironments: sunlitUpperContexts,
        taxonomyNote: "Solid NAT PSC class; optically distinct from liquid STS and water-ice nacreous clouds.",
    }),
    "polar-stratospheric-ice": descriptor({
        representation: "polar-stratospheric-ice", family: "polar-stratospheric-cloud",
        classificationAxis: "scientific-particle-class", wmoCanonicalDesignation: false,
        productionReachable: true, rendererSpecies: null, wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/nacreous-clouds.html",
        scienceSources: [PSC_SCIENCE, PSC_OPTICS], elementKind: "stratospheric-wave-patch",
        composition: "stratospheric-water-ice", altitudeKm: [18, 32],
        formationSpanKm: [10, 600], geometricDepthKm: [0.2, 4],
        opticalDepth: [0.0003, 0.2], particleDiameterMicrons: [3, 20],
        requiredMorphology: ["finite Type II water-ice PSC", "polar-winter frost-point support", "thin mountain-wave or vortex patch", "spectral particle material"],
        forbiddenMorphology: ["mandatory mother-of-pearl display", "opaque lens", "tropospheric parallax", "screen-space colour wash"],
        legalEnvironments: sunlitUpperContexts,
        taxonomyNote: "PSC Type II water ice. Nacreous is its visibly iridescent WMO special-cloud presentation, not a second particle composition.",
    }),
    "nacreous-ice": descriptor({
        representation: "nacreous-ice", family: "polar-stratospheric-cloud",
        classificationAxis: "wmo-special-cloud", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: null, wmoAbbreviation: null,
        wmoSource: "https://cloudatlas.wmo.int/nacreous-clouds.html",
        scienceSources: [PSC_SCIENCE, PSC_OPTICS], elementKind: "stratospheric-wave-patch",
        composition: "stratospheric-water-ice", altitudeKm: [18, 32],
        formationSpanKm: [10, 500], geometricDepthKm: [0.2, 4],
        opticalDepth: [0.0005, 0.2], particleDiameterMicrons: [3, 20],
        requiredMorphology: ["stationary lenticular wave or cirriform patch", "narrow particle-size colour coherence", "bright after tropospheric Cirrus greys", "finite mountain-wave support"],
        forbiddenMorphology: ["spectral hue noise", "always-on iridescence", "screen-space mother-of-pearl texture", "low-altitude cloud movement"],
        legalEnvironments: sunlitUpperContexts,
        taxonomyNote: "WMO nacreous cloud is the water-ice PSC visual state, favored below the stratospheric ice frost point.",
    }),
    noctilucent: descriptor({
        representation: "noctilucent", family: "noctilucent-cloud",
        classificationAxis: "wmo-special-cloud", wmoCanonicalDesignation: true,
        productionReachable: true, rendererSpecies: null, wmoAbbreviation: null,
        wmoSource: NLC_WMO, scienceSources: [NLC_CIPS],
        elementKind: "mesospheric-wave-sheet",
        composition: "meteoric-smoke-nucleated-water-ice", altitudeKm: [76, 90],
        formationSpanKm: [50, 2500], geometricDepthKm: [0.2, 3],
        opticalDepth: [0.00001, 0.001], particleDiameterMicrons: [0.05, 0.7],
        requiredMorphology: ["edge-on mesospheric sheet", "veil bands billows and whirls", "gravity-wave scale hierarchy", "sunlit cloud over dark lower atmosphere"],
        forbiddenMorphology: ["bright daytime cirrus", "aurora-like emissive curtain", "tropospheric parallax", "opaque electric-blue ribbon"],
        legalEnvironments: twilightContexts,
        taxonomyNote: "WMO special cloud / ground-observed polar mesospheric cloud, not Cirrus and not self-emissive.",
    }),
} as const satisfies Record<UpperAtmosphericCloudRepresentation, UpperAtmosphericDescriptor>;

export type UpperFormationMechanism =
    | "frontal-ice-ascent" | "cirrus-spreading" | "gravity-wave"
    | "superposed-moist-layers" | "parallel-cirrus-companion"
    | "polar-vortex-cooling" | "mountain-wave-stratospheric-cooling"
    | "mesopause-ice-nucleation" | "mesospheric-gravity-wave";
export type UpperConnectivity =
    | "continuous-fibrous-veil" | "continuous-nebulous-veil"
    | "superposed-independent-veils" | "finite-wave-veil"
    | "mixed-band-and-veil" | "finite-stratospheric-patch"
    | "mesospheric-sheet";
export type UpperOrigin =
    | "natural-frontal" | "cirrus-fibratus-transition" | "cirrus-spissatus-transition"
    | "gravity-wave" | "superposed-fronts" | "cirrus-radiatus-companion"
    | "polar-vortex" | "mountain-wave" | "severe-storm-wave"
    | "meteoric-smoke-summer-mesopause";
export type UpperOrganization =
    | "invading-front" | "whole-sky-veil" | "finite-veil"
    | "superposed-layers" | "wave-packet" | "perspective-band-companion"
    | "vortex-sheet" | "lenticular-wave" | "ribbon-patch"
    | "nlc-veil" | "nlc-bands" | "nlc-billows" | "nlc-whirls";

export interface UpperTopologyVariant {
    readonly id: string;
    readonly mechanism: UpperFormationMechanism;
    readonly connectivity: UpperConnectivity;
    readonly formationAspectRatio: readonly [number, number];
    readonly wavelengthKm: readonly [number, number] | null;
    readonly hierarchyLevels: readonly [number, number];
    readonly minimumSpacingVariation: number;
    readonly maximumMirrorSimilarity: number;
    readonly origins: readonly UpperOrigin[];
    readonly organizations: readonly UpperOrganization[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
    readonly cues: readonly string[];
}

const tv = (value: UpperTopologyVariant) => value;
const topologySet = (
    representation: UpperAtmosphericCloudRepresentation,
): readonly UpperTopologyVariant[] => {
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
    if (representation === "cirrostratus-fibratus") return [
        tv({ id: "invading-fibrous-front", mechanism: "frontal-ice-ascent", connectivity: "continuous-fibrous-veil", formationAspectRatio: [12, 80], wavelengthKm: [8, 70], hierarchyLevels: [5, 8], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.4, origins: ["natural-frontal"], organizations: ["invading-front"], lifecycleStages: ["growing", "mature"], cues: ["front-normal thickness gradient", "embedded thin striations", "non-hooked filaments"] }),
        tv({ id: "cirrus-spread-fibrous-veil", mechanism: "cirrus-spreading", connectivity: "continuous-fibrous-veil", formationAspectRatio: [10, 70], wavelengthKm: [4, 45], hierarchyLevels: [6, 8], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.34, origins: ["cirrus-fibratus-transition", "cirrus-spissatus-transition"], organizations: ["finite-veil", "whole-sky-veil"], lifecycleStages: ["growing", "mature", "decaying"], cues: ["correlated Cirrus ancestry", "sedimentation trails", "continuous background veil"] }),
        tv({ id: "sheared-fibrous-shield", mechanism: "gravity-wave", connectivity: "continuous-fibrous-veil", formationAspectRatio: [18, 110], wavelengthKm: [12, 110], hierarchyLevels: [6, 9], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.3, origins: ["natural-frontal", "gravity-wave"], organizations: ["wave-packet", "finite-veil"], lifecycleStages: ["mature", "decaying"], cues: ["multiscale shear", "finite wave modulation", "unequal filament fall speeds"] }),
    ];
    if (representation === "cirrostratus-nebulosus" ||
        representation === "cirrostratus-translucidus" ||
        representation === "cirrostratus-opacus") return [
        tv({ id: `${representation}-whole-sky`, mechanism: "frontal-ice-ascent", connectivity: "continuous-nebulous-veil", formationAspectRatio: [30, 180], wavelengthKm: null, hierarchyLevels: [5, 8], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.52, origins: ["natural-frontal"], organizations: ["whole-sky-veil"], lifecycleStages: ["growing", "mature"], cues: ["smooth sparse ice support", "very-low-frequency depth", "no visible tile seam"] }),
        tv({ id: `${representation}-invading-front`, mechanism: "frontal-ice-ascent", connectivity: "continuous-nebulous-veil", formationAspectRatio: [18, 130], wavelengthKm: [40, 220], hierarchyLevels: [6, 9], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.42, origins: ["natural-frontal"], organizations: ["invading-front"], lifecycleStages: ["incipient", "growing", "mature"], cues: ["finite humidity front", "curved world boundary", "halo may precede visible veil"] }),
        tv({ id: `${representation}-eroding-veil`, mechanism: "gravity-wave", connectivity: "continuous-nebulous-veil", formationAspectRatio: [14, 100], wavelengthKm: [20, 160], hierarchyLevels: [6, 9], minimumSpacingVariation: 0.52, maximumMirrorSimilarity: 0.34, origins: ["natural-frontal", "gravity-wave"], organizations: ["finite-veil", "wave-packet"], lifecycleStages: ["decaying"], cues: ["aperiodic transparency windows", "ice sedimentation", "preserved continuous support"] }),
    ];
    if (representation === "cirrostratus-duplicatus") return [
        tv({ id: "two-crossing-veils", mechanism: "superposed-moist-layers", connectivity: "superposed-independent-veils", formationAspectRatio: [18, 120], wavelengthKm: [20, 160], hierarchyLevels: [6, 9], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.34, origins: ["superposed-fronts"], organizations: ["superposed-layers"], lifecycleStages: ["growing", "mature"], cues: ["two altitudes", "crossing fibre directions", "independent boundaries"] }),
        tv({ id: "partly-merged-duplicatus", mechanism: "superposed-moist-layers", connectivity: "superposed-independent-veils", formationAspectRatio: [20, 140], wavelengthKm: [25, 180], hierarchyLevels: [7, 9], minimumSpacingVariation: 0.5, maximumMirrorSimilarity: 0.3, origins: ["superposed-fronts", "natural-frontal"], organizations: ["superposed-layers", "whole-sky-veil"], lifecycleStages: ["mature"], cues: ["partial physical overlap", "different drift", "unequal optical depth"] }),
        tv({ id: "eroding-upper-duplicate", mechanism: "gravity-wave", connectivity: "superposed-independent-veils", formationAspectRatio: [16, 110], wavelengthKm: [12, 130], hierarchyLevels: [7, 9], minimumSpacingVariation: 0.54, maximumMirrorSimilarity: 0.26, origins: ["superposed-fronts"], organizations: ["superposed-layers", "finite-veil"], lifecycleStages: ["decaying"], cues: ["upper veil fragments first", "persistent lower support", "nonmatching holes"] }),
    ];
    if (representation === "cirrostratus-undulatus") return [0, 1, 2].map((index) => tv({
        id: ["single-long-wave", "crossed-wave-systems", "breaking-wave-veil"][index],
        mechanism: "gravity-wave", connectivity: "finite-wave-veil",
        formationAspectRatio: [16 + index * 3, 100 + index * 20],
        wavelengthKm: index === 0 ? [15, 100] : index === 1 ? [8, 70] : [4, 45],
        hierarchyLevels: [6 + (index > 1 ? 1 : 0), 9],
        minimumSpacingVariation: 0.34 + index * 0.09,
        maximumMirrorSimilarity: 0.48 - index * 0.08,
        origins: ["gravity-wave", "natural-frontal"], organizations: ["wave-packet"],
        lifecycleStages: index === 2 ? ["decaying"] : ["growing", "mature"],
        cues: index === 0 ? ["one drifting wavelength", "continuous veil"]
            : index === 1 ? ["two unequal wave vectors", "moiré from real overlap"]
                : ["localized wave breaking", "aperiodic eroded crests"],
    }));
    if (representation === "cirrostratus-radiatus") return [0, 1, 2].map((index) => tv({
        id: ["one-horizon-companion-bands", "two-horizon-perspective-bands", "bands-merging-into-front"][index],
        mechanism: "parallel-cirrus-companion", connectivity: "mixed-band-and-veil",
        formationAspectRatio: [24 + index * 4, 180 + index * 30], wavelengthKm: [10 + index * 4, 90 + index * 20],
        hierarchyLevels: [6, 9], minimumSpacingVariation: 0.38 + index * 0.06,
        maximumMirrorSimilarity: 0.44 - index * 0.07,
        origins: ["cirrus-radiatus-companion", "natural-frontal"],
        organizations: ["perspective-band-companion", "invading-front"],
        lifecycleStages: index === 2 ? ["growing", "mature"] : ["mature"],
        cues: ["parallel world bands", "perspective convergence only", "part-Cirrus part-Cs continuity"],
    }));
    if (descriptor.family === "polar-stratospheric-cloud") return [0, 1, 2].map((index) => tv({
        id: [`${representation}-mountain-wave-lenses`, `${representation}-vortex-ribbons`, `${representation}-eroding-wave-patch`][index],
        mechanism: index === 1 ? "polar-vortex-cooling" : "mountain-wave-stratospheric-cooling",
        connectivity: "finite-stratospheric-patch", formationAspectRatio: [8 + index * 5, 55 + index * 30],
        wavelengthKm: index === 0 ? [12, 80] : index === 1 ? [50, 400] : [6, 60],
        hierarchyLevels: [5 + index, 8], minimumSpacingVariation: 0.4 + index * 0.06,
        maximumMirrorSimilarity: 0.44 - index * 0.07,
        origins: index === 1 ? ["polar-vortex"] : ["mountain-wave", "severe-storm-wave"],
        organizations: index === 0 ? ["lenticular-wave"] : index === 1 ? ["vortex-sheet", "ribbon-patch"] : ["ribbon-patch"],
        lifecycleStages: index === 0 ? ["growing", "mature"] : index === 1 ? ["mature"] : ["decaying"],
        cues: index === 0 ? ["stationary wave crest", "air-through-cloud motion"]
            : index === 1 ? ["large polar-vortex support", "unequal ribbons"]
                : ["downstream sublimation", "finite temperature boundary"],
    }));
    return [
        tv({ id: "nlc-veil-and-long-bands", mechanism: "mesopause-ice-nucleation", connectivity: "mesospheric-sheet", formationAspectRatio: [30, 220], wavelengthKm: [20, 300], hierarchyLevels: [6, 9], minimumSpacingVariation: 0.42, maximumMirrorSimilarity: 0.42, origins: ["meteoric-smoke-summer-mesopause"], organizations: ["nlc-veil", "nlc-bands"], lifecycleStages: ["growing", "mature"], cues: ["Type I veil", "Type II bands", "edge-on illumination"] }),
        tv({ id: "nlc-gravity-wave-billows", mechanism: "mesospheric-gravity-wave", connectivity: "mesospheric-sheet", formationAspectRatio: [24, 180], wavelengthKm: [3, 80], hierarchyLevels: [7, 10], minimumSpacingVariation: 0.48, maximumMirrorSimilarity: 0.34, origins: ["meteoric-smoke-summer-mesopause"], organizations: ["nlc-billows", "nlc-bands"], lifecycleStages: ["growing", "mature", "decaying"], cues: ["Type III billows", "wave amplitude modulation", "breaking-wave fragments"] }),
        tv({ id: "nlc-whirls-and-bends", mechanism: "mesospheric-gravity-wave", connectivity: "mesospheric-sheet", formationAspectRatio: [18, 150], wavelengthKm: [1, 120], hierarchyLevels: [8, 10], minimumSpacingVariation: 0.54, maximumMirrorSimilarity: 0.28, origins: ["meteoric-smoke-summer-mesopause"], organizations: ["nlc-whirls", "nlc-billows", "nlc-veil"], lifecycleStages: ["mature", "decaying"], cues: ["Type IV partial whirls", "dark centers", "multiscale curved bands"] }),
    ];
};

export const UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS = Object.fromEntries(
    UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS.map((representation) =>
        [representation, topologySet(representation)]),
) as unknown as Record<UpperAtmosphericCloudRepresentation, readonly UpperTopologyVariant[]>;

export const upperTopologySignature = (variant: UpperTopologyVariant) => [
    Math.log(variant.formationAspectRatio[0]), Math.log(variant.formationAspectRatio[1]),
    variant.wavelengthKm ? Math.log(variant.wavelengthKm[0]) : -1,
    variant.wavelengthKm ? Math.log(variant.wavelengthKm[1]) : -1,
    variant.hierarchyLevels[0], variant.hierarchyLevels[1],
    variant.minimumSpacingVariation, variant.maximumMirrorSimilarity,
    variant.mechanism.length / 40, variant.connectivity.length / 35,
] as const;
export const upperTopologySignatureDistance = (left: readonly number[], right: readonly number[]) => {
    if (left.length !== right.length || left.length === 0) throw new Error("Signatures must have equal nonzero length");
    return Math.sqrt(left.reduce((sum, value, index) => {
        const scale = Math.max(1, Math.abs(value), Math.abs(right[index]));
        return sum + ((value - right[index]) / scale) ** 2;
    }, 0) / left.length);
};
export const selectUpperTopologyVariant = (
    representation: UpperAtmosphericCloudRepresentation, seed: number,
) => {
    if (!Number.isInteger(seed)) throw new Error("Seed must be an integer");
    const variants = UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[representation];
    return variants[((seed % variants.length) + variants.length) % variants.length];
};

const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = clamp((value - edge0) / Math.max(1e-9, edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const finite = (name: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
};

export interface UpperAdmissibilityInput {
    readonly representation: UpperAtmosphericCloudRepresentation;
    readonly latitudeDegrees: number;
    /** UTC/local calendar month, 1-12; season only depends on hemisphere. */
    readonly month: number;
    readonly altitudeKm: number;
    readonly temperatureKelvin: number;
    /** Positive degrees below geometric horizon. */
    readonly solarDepressionDegrees: number;
    readonly viewElevationDegrees: number;
    readonly environment: UpperBenchmarkEnvironment;
    readonly hasOrographicOrSevereStormGravityWave: boolean;
    readonly hasCirrusRadiatusCompanion: boolean;
}

const inNorthernSummer = (month: number) => month >= 5 && month <= 8;
const inSouthernSummer = (month: number) => month === 11 || month === 12 || month <= 2;
const inPolarWinter = (latitude: number, month: number) => latitude >= 0
    ? month >= 10 || month <= 3 : month >= 4 && month <= 9;

export const qualifyUpperAtmosphericAdmissibility = (input: UpperAdmissibilityInput) => {
    for (const [name, value] of Object.entries(input)) {
        if (typeof value === "number") finite(name, value);
    }
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[input.representation];
    const violations: string[] = [];
    if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) violations.push("invalid-calendar-month");
    if (Math.abs(input.latitudeDegrees) > 90) violations.push("invalid-latitude");
    if (input.altitudeKm < descriptor.altitudeKm[0] || input.altitudeKm > descriptor.altitudeKm[1]) violations.push("altitude-outside-physical-layer");
    if (!descriptor.legalEnvironments.includes(input.environment)) violations.push("environment-cannot-display-this-state");
    if (!descriptor.productionReachable) violations.push("noncanonical-state-must-transition-before-production");
    if (input.representation === "cirrostratus-radiatus" && !input.hasCirrusRadiatusCompanion) {
        violations.push("radiatus-appearance-needs-physical-Cirrus-companion-bands");
    }
    if (descriptor.family === "polar-stratospheric-cloud") {
        if (Math.abs(input.latitudeDegrees) < 50) violations.push("psc-requires-high-latitude-polar-air");
        if (!inPolarWinter(input.latitudeDegrees, input.month)) violations.push("psc-requires-polar-winter");
        const temperatureLimit = input.representation === "nacreous-ice" ||
            input.representation === "polar-stratospheric-ice" ? 188.15
            : input.representation === "polar-stratospheric-nat" ? 195 : 198;
        if (input.temperatureKelvin > temperatureLimit) violations.push("stratosphere-too-warm-for-selected-particle-class");
        if (input.representation === "nacreous-ice" &&
            !input.hasOrographicOrSevereStormGravityWave) {
            violations.push("nacreous-display-needs-wave-scale-cold-pocket");
        }
        if (input.solarDepressionDegrees < -4 || input.solarDepressionDegrees > 9) {
            violations.push("psc-not-plausibly-sunlit-in-selected-view");
        }
    }
    if (descriptor.family === "noctilucent-cloud") {
        const absLatitude = Math.abs(input.latitudeDegrees);
        const summer = input.latitudeDegrees >= 0
            ? inNorthernSummer(input.month) : inSouthernSummer(input.month);
        if (absLatitude < 45 || absLatitude > 75) violations.push("nlc-ground-view-latitude-outside-observed-band");
        if (!summer) violations.push("nlc-requires-local-summer");
        if (input.temperatureKelvin > 153.15) violations.push("mesopause-too-warm-for-noctilucent-ice");
        if (input.solarDepressionDegrees < 4 || input.solarDepressionDegrees > 18) violations.push("nlc-needs-dark-observer-and-sunlit-mesosphere");
        if (input.viewElevationDegrees < 0 || input.viewElevationDegrees > 35) violations.push("nlc-ground-view-is-normally-near-twilight-horizon");
    }
    return { legal: violations.length === 0, violations };
};

export type UpperParticleShape = "hexagonal-ice" | "spherical-liquid" | "aspherical-solid" | "quasi-spherical-ice";
export interface UpperOpticalMaterialContract {
    readonly composition: UpperParticleComposition;
    readonly particleShape: UpperParticleShape;
    readonly phaseEvaluation: "ice-habit-mueller" | "spectral-mie-mueller" | "aspherical-tmatrix-mueller" | "small-ice-mie-mueller";
    readonly polarizationReady: true;
    readonly atmosphereCoupling: "spectral-sun-path-cloud-view-path";
    readonly selfEmissive: false;
    readonly diffractionColourRequiresSizeDistribution: true;
}
const optical = (composition: UpperParticleComposition, particleShape: UpperParticleShape,
    phaseEvaluation: UpperOpticalMaterialContract["phaseEvaluation"]): UpperOpticalMaterialContract => ({
    composition, particleShape, phaseEvaluation, polarizationReady: true,
    atmosphereCoupling: "spectral-sun-path-cloud-view-path", selfEmissive: false,
    diffractionColourRequiresSizeDistribution: true,
});
export const UPPER_OPTICAL_MATERIAL_CONTRACTS = {
    "tropospheric-water-ice": optical("tropospheric-water-ice", "hexagonal-ice", "ice-habit-mueller"),
    "supercooled-ternary-solution": optical("supercooled-ternary-solution", "spherical-liquid", "spectral-mie-mueller"),
    "nitric-acid-trihydrate": optical("nitric-acid-trihydrate", "aspherical-solid", "aspherical-tmatrix-mueller"),
    "stratospheric-water-ice": optical("stratospheric-water-ice", "quasi-spherical-ice", "spectral-mie-mueller"),
    "meteoric-smoke-nucleated-water-ice": optical("meteoric-smoke-nucleated-water-ice", "quasi-spherical-ice", "small-ice-mie-mueller"),
} as const satisfies Record<UpperParticleComposition, UpperOpticalMaterialContract>;

export interface IridescenceInput {
    readonly representation: UpperAtmosphericCloudRepresentation;
    readonly particleDiameterMicrons: number;
    readonly particleDiameterCoefficientOfVariation: number;
    readonly opticalDepth: number;
    readonly scatteringAngleDegrees: number;
    readonly spectralPhaseFunctionAvailable: boolean;
}
export const qualifyPhysicalIridescence = (input: IridescenceInput) => {
    Object.entries(input).forEach(([name, value]) => {
        if (typeof value === "number") finite(name, value);
    });
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[input.representation];
    const violations: string[] = [];
    if (!input.spectralPhaseFunctionAvailable) violations.push("iridescence-needs-spectral-size-dependent-phase-function");
    if (input.particleDiameterMicrons < descriptor.particleDiameterMicrons[0] ||
        input.particleDiameterMicrons > descriptor.particleDiameterMicrons[1]) violations.push("particle-size-outside-composition-range");
    const visiblyNacreous = input.representation === "nacreous-ice";
    if (visiblyNacreous && input.particleDiameterCoefficientOfVariation > 0.22) violations.push("nacreous-size-distribution-too-broad-for-coherent-colour");
    if (input.opticalDepth > 0.35) violations.push("multiple-scattering-washes-out-diffraction-colour");
    if (input.scatteringAngleDegrees < 2 || input.scatteringAngleDegrees > 80) violations.push("view-angle-outside-practical-iridescence-region");
    if (!["nacreous-ice", "polar-stratospheric-ice", "polar-stratospheric-sts", "polar-stratospheric-nat"].includes(input.representation)) {
        violations.push("representation-does-not-use-nacreous-iridescence-path");
    }
    return { eligible: violations.length === 0, violations };
};

export interface CirrostratusHaloInput {
    readonly representation: UpperAtmosphericCloudRepresentation;
    readonly localOpticalDepth: number;
    readonly iceFraction: number;
    readonly orientedHexagonalFraction: number;
    readonly sourceElevationDegrees: number;
    readonly scatteringAngleDegrees: number;
    readonly requestedFamily: "22-degree" | "46-degree" | "sun-dog" | "pillar";
    readonly spectralIceMuellerAvailable: boolean;
}
export const qualifyPhysicalCirrostratusHalo = (input: CirrostratusHaloInput) => {
    Object.entries(input).forEach(([name, value]) => {
        if (typeof value === "number") finite(name, value);
    });
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[input.representation];
    const violations: string[] = [];
    if (descriptor.family !== "cirrostratus") violations.push("halo-owner-must-be-cirrostratus");
    if (!descriptor.productionReachable) violations.push("invalid-cirrostratus-state");
    if (!input.spectralIceMuellerAvailable) violations.push("halo-needs-oriented-ice-spectral-phase-data");
    if (input.localOpticalDepth <= 0 || input.localOpticalDepth > 3.5) violations.push("halo-optical-depth-outside-visible-range");
    if (input.iceFraction < 0.92 || input.orientedHexagonalFraction < 0.06) violations.push("insufficient-eligible-ice-habit-population");
    if (input.sourceElevationDegrees < 2) violations.push("source-too-low-for-stable-halo-qualification");
    const target = input.requestedFamily === "22-degree" ? 22
        : input.requestedFamily === "46-degree" ? 46
            : input.requestedFamily === "sun-dog" ? 22 : 0;
    const width = input.requestedFamily === "pillar" ? 4 : 2.8;
    if (Math.abs(input.scatteringAngleDegrees - target) > width) violations.push("sample-is-outside-requested-ice-optics-locus");
    return { eligible: violations.length === 0, violations,
        phaseLocusDegrees: target, maximumAngularHalfWidthDegrees: width };
};

export interface UpperProductionStateInput extends UpperAdmissibilityInput {
    readonly origin: UpperOrigin;
    readonly organization: UpperOrganization;
    readonly lifecycleStage: CloudLifecycleStage;
}
export const qualifyUpperProductionState = (input: UpperProductionStateInput) => {
    const base = qualifyUpperAtmosphericAdmissibility(input);
    const variants = UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[input.representation];
    const violations = [...base.violations];
    if (!variants.some((variant) => variant.origins.includes(input.origin))) violations.push("origin-not-reachable-by-representation");
    if (!variants.some((variant) => variant.organizations.includes(input.organization))) violations.push("organization-not-reachable-by-representation");
    if (!variants.some((variant) => variant.lifecycleStages.includes(input.lifecycleStage))) violations.push("lifecycle-not-reachable-by-representation");
    return { legal: violations.length === 0, violations };
};

export const isLegalUpperTransition = (
    from: UpperAtmosphericCloudRepresentation,
    to: UpperAtmosphericCloudRepresentation,
) => {
    const legal: Readonly<Record<UpperAtmosphericCloudRepresentation, readonly UpperAtmosphericCloudRepresentation[]>> = {
        "cirrostratus-fibratus": ["cirrostratus-fibratus", "cirrostratus-nebulosus", "cirrostratus-duplicatus", "cirrostratus-undulatus", "cirrostratus-radiatus", "cirrostratus-translucidus", "cirrostratus-opacus"],
        "cirrostratus-nebulosus": ["cirrostratus-nebulosus", "cirrostratus-fibratus", "cirrostratus-duplicatus", "cirrostratus-undulatus", "cirrostratus-translucidus", "cirrostratus-opacus"],
        "cirrostratus-duplicatus": ["cirrostratus-duplicatus", "cirrostratus-nebulosus", "cirrostratus-fibratus"],
        "cirrostratus-undulatus": ["cirrostratus-undulatus", "cirrostratus-nebulosus", "cirrostratus-fibratus"],
        "cirrostratus-radiatus": ["cirrostratus-radiatus", "cirrostratus-fibratus"],
        "cirrostratus-translucidus": ["cirrostratus-translucidus", "cirrostratus-nebulosus", "cirrostratus-opacus"],
        "cirrostratus-opacus": [],
        "polar-stratospheric-sts": ["polar-stratospheric-sts", "polar-stratospheric-nat", "polar-stratospheric-ice", "nacreous-ice"],
        "polar-stratospheric-nat": ["polar-stratospheric-nat", "polar-stratospheric-sts", "polar-stratospheric-ice", "nacreous-ice"],
        "polar-stratospheric-ice": ["polar-stratospheric-ice", "nacreous-ice", "polar-stratospheric-nat", "polar-stratospheric-sts"],
        "nacreous-ice": ["nacreous-ice", "polar-stratospheric-ice", "polar-stratospheric-nat", "polar-stratospheric-sts"],
        noctilucent: ["noctilucent"],
    };
    return legal[from].includes(to);
};

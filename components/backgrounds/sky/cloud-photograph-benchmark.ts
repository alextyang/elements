import {
    CLOUD_GENUS_LEVEL,
    EMPTY_LAYER,
    constrainScene,
    createLayer,
    type CloudGenus,
    type CloudOrganization,
    type CloudScene,
} from "./cloud-scene";
import {
    classificationFromDesignation,
    rendererSpeciesForClassification,
    type CloudClassification,
} from "./cloud-state-map";
import type { SkyCompositionControls, SkyPreviewOptions } from "./sky";
import type { SkyCloudEditorialRegime, SkyCloudPerspective } from "./renderer-types";

type RenderableGenus = Exclude<CloudGenus, "clear">;

interface MorphologyProfile {
    base: number;
    thickness: number;
    oktas: number;
    opticalDepth: number;
    convection?: number;
    instability?: number;
    ice?: number;
    precipitation?: number;
    wind?: number;
    shear?: number;
    turbulence?: number;
    organization?: CloudOrganization;
    lifecycle?: number;
    organizationStrength?: number;
}

interface CloudReference {
    id: string;
    genus: RenderableGenus;
    species: string;
    title: string;
    image: string;
    source: string;
    credit: string;
    cues: string[];
    profile: MorphologyProfile;
}

export interface EvaluationEnvironment {
    id: string;
    label: string;
    description: string;
    date: string;
    latitude: number;
    longitude: number;
    viewAzimuth: number;
    viewElevation: number;
    horizontalFov: number;
    verticalFov: number;
    perspective: SkyCloudPerspective;
    regime: SkyCloudEditorialRegime;
    familyId: string;
    atmosphereStyle: NonNullable<SkyPreviewOptions["atmosphereStyle"]>;
    aerosolType: NonNullable<SkyPreviewOptions["aerosolType"]>;
    composition: SkyCompositionControls;
    nightExposure?: number;
}

const wmoImage = (id: number, filename: string) =>
    `https://cloudatlas.wmo.int/images/original/${id}_main_${filename}`;
const wmoViewer = (id: number) =>
    `https://cloudatlas.wmo.int/en/imgviewer-${id}.txt`;

const REFERENCES: CloudReference[] = [
    {
        id: "ci-fibratus", genus: "cirrus", species: "fibratus", title: "Cirrus fibratus",
        image: wmoImage(4135, "circumzenithal-arc_clouds-photometeors.JPG"), source: wmoViewer(4135), credit: "Matthew Clark / WMO International Cloud Atlas",
        cues: ["finite silky fibres", "strong length-to-width hierarchy", "no common base"],
        profile: { base: 9.4, thickness: 0.8, oktas: 3, opticalDepth: 0.34, ice: 1, wind: 27, shear: 0.62, turbulence: 0.45, organization: "banded", lifecycle: 0.18, organizationStrength: 0.62 },
    },
    {
        id: "ci-uncinus", genus: "cirrus", species: "uncinus", title: "Cirrus uncinus",
        image: wmoImage(4321, "cirrus-uncinus-and-cirrus-fibratus_clouds.jpg"), source: wmoViewer(4321), credit: "Stephen Burt / WMO International Cloud Atlas",
        cues: ["hooked heads", "fallstreak tails", "independent curved streamers"],
        profile: { base: 9.1, thickness: 1.1, oktas: 4, opticalDepth: 0.45, ice: 1, wind: 31, shear: 0.9, turbulence: 0.7, organization: "banded", lifecycle: 0.55, organizationStrength: 0.72 },
    },
    {
        id: "ci-spissatus", genus: "cirrus", species: "spissatus", title: "Cirrus spissatus",
        image: wmoImage(4718, "cirrus-spissatus-mamma-and-cirrus-floccus_clouds.JPG"), source: wmoViewer(4718), credit: "Frank Le Blancq / WMO International Cloud Atlas",
        cues: ["dense ice patches", "fibrous perimeter", "translucent depth rather than cotton"],
        profile: { base: 8.4, thickness: 1.4, oktas: 5, opticalDepth: 0.62, ice: 1, wind: 25, shear: 0.76, turbulence: 0.62, organization: "unorganized", lifecycle: 0.9, organizationStrength: 0.48 },
    },
    {
        id: "ci-castellanus", genus: "cirrus", species: "castellanus", title: "Cirrus castellanus",
        image: "https://cloudatlas.wmo.int/images/compressed/4810_main_cirrus-castellanus_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-cirrus-castellanus-ci-cas.html", credit: "WMO International Cloud Atlas",
        cues: ["small fibrous turrets", "crenellated common ice base", "dense but unmistakably glaciated masses"],
        profile: { base: 8.8, thickness: 1.1, oktas: 4, opticalDepth: 0.48, ice: 1, wind: 24, shear: 0.55, turbulence: 0.62, organization: "streets", lifecycle: 0.62, organizationStrength: 0.72 },
    },
    {
        id: "ci-floccus", genus: "cirrus", species: "floccus", title: "Cirrus floccus",
        image: "https://cloudatlas.wmo.int/images/compressed/4322_main_cirrus-floccus_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-cirrus-floccus-ci-flo.html", credit: "WMO International Cloud Atlas",
        cues: ["isolated rounded ice tufts", "narrow fibrous trails", "no common base between tufts"],
        profile: { base: 9.0, thickness: 1.0, oktas: 3, opticalDepth: 0.42, ice: 1, wind: 26, shear: 0.7, turbulence: 0.72, organization: "isolated", lifecycle: 0.78, organizationStrength: 0.66 },
    },
    {
        id: "cc-stratiformis", genus: "cirrocumulus", species: "stratiformis", title: "Cirrocumulus stratiformis",
        image: wmoImage(4800, "cirrocumulus-floccus-undulatus-with-virga-and-mamma_clouds.jpg"), source: wmoViewer(4800), credit: "Rubén del Campo-Hernández / WMO International Cloud Atlas",
        cues: ["sub-degree grains", "little or no shading", "irregular rippled field without a grid"],
        profile: { base: 8.5, thickness: 0.5, oktas: 5, opticalDepth: 0.22, ice: 0.96, wind: 24, shear: 0.58, turbulence: 0.42, organization: "closed-cell", lifecycle: 0.46, organizationStrength: 0.7 },
    },
    {
        id: "cc-castellanus", genus: "cirrocumulus", species: "castellanus", title: "Cirrocumulus castellanus",
        image: wmoImage(5101, "cirrocumulus-castellanus-undulatus_clouds.jpg"), source: wmoViewer(5101), credit: "Martin Gudd / WMO International Cloud Atlas",
        cues: ["tiny turreted elements", "shallow shared level", "high-altitude translucency"],
        profile: { base: 7.8, thickness: 0.72, oktas: 4, opticalDepth: 0.26, ice: 0.9, wind: 21, shear: 0.46, turbulence: 0.62, organization: "streets", lifecycle: 0.7, organizationStrength: 0.66 },
    },
    {
        id: "cc-lenticularis", genus: "cirrocumulus", species: "lenticularis", title: "Cirrocumulus lenticularis",
        image: "https://cloudatlas.wmo.int/images/compressed/4809_main_cirrocumulus-lenticularis_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-cirrocumulus-lenticularis-cc-len.html", credit: "WMO International Cloud Atlas",
        cues: ["very white elongated lenses", "smooth well-defined laminar outline", "isolated high-level wave patches"],
        profile: { base: 8.6, thickness: 0.36, oktas: 2, opticalDepth: 0.18, ice: 0.98, wind: 30, shear: 0.82, turbulence: 0.06, organization: "banded", lifecycle: 0.32, organizationStrength: 0.92 },
    },
    {
        id: "cc-floccus", genus: "cirrocumulus", species: "floccus", title: "Cirrocumulus floccus",
        image: "https://cloudatlas.wmo.int/images/compressed/5108_main_cirrocumulus-floccus-with-virga_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-cirrocumulus-floccus-cc-flo.html", credit: "WMO International Cloud Atlas",
        cues: ["very small detached cumuliform tufts", "ragged lower portions", "delicate ice-crystal virga"],
        profile: { base: 8.2, thickness: 0.56, oktas: 4, opticalDepth: 0.24, ice: 0.94, wind: 23, shear: 0.6, turbulence: 0.64, organization: "isolated", lifecycle: 0.78, organizationStrength: 0.62 },
    },
    {
        id: "cs-fibratus", genus: "cirrostratus", species: "fibratus", title: "Cirrostratus fibratus",
        image: wmoImage(4702, "parhelic-circle-and-120-parhelion_clouds-photometeors.JPG"), source: wmoViewer(4702), credit: "Frank Le Blancq / WMO International Cloud Atlas",
        cues: ["continuous transparent veil", "embedded fibres", "sun and sky remain legible"],
        profile: { base: 8.0, thickness: 1.1, oktas: 7, opticalDepth: 0.22, ice: 1, wind: 30, shear: 0.72, turbulence: 0.2, organization: "frontal", lifecycle: 0.38, organizationStrength: 0.72 },
    },
    {
        id: "cs-nebulosus", genus: "cirrostratus", species: "nebulosus", title: "Cirrostratus nebulosus",
        image: wmoImage(4136, "cirrostratus-nebulosus-and-22-halo_clouds-photometeors.JPG"), source: wmoViewer(4136), credit: "Frank Le Blancq / WMO International Cloud Atlas",
        cues: ["smooth milky veil", "very low-frequency optical depth", "ice halo-compatible transmission"],
        profile: { base: 8.4, thickness: 1.4, oktas: 8, opticalDepth: 0.2, ice: 1, wind: 26, shear: 0.45, turbulence: 0.1, organization: "frontal", lifecycle: 0.62, organizationStrength: 0.82 },
    },
    {
        id: "ac-stratiformis", genus: "altocumulus", species: "stratiformis", title: "Altocumulus stratiformis",
        image: wmoImage(4704, "crepuscular-rays-and-altocumulus-castellanus-and-floccusfloccus_clouds-photometeors.jpg"), source: wmoViewer(4704), credit: "George Anderson / WMO International Cloud Atlas",
        cues: ["one-to-five-degree elements", "shared level and rounded masses", "visible self-shading"],
        profile: { base: 4.0, thickness: 0.85, oktas: 5, opticalDepth: 0.5, ice: 0.22, wind: 16, shear: 0.38, turbulence: 0.45, organization: "closed-cell", lifecycle: 0.42, organizationStrength: 0.7 },
    },
    {
        id: "ac-lenticularis", genus: "altocumulus", species: "lenticularis", title: "Altocumulus lenticularis",
        image: wmoImage(4719, "altocumulus-lenticularis-duplicatus-and-cumulus_clouds-special-clouds-and-other-features.jpg"), source: wmoViewer(4719), credit: "Gréta S. Guðjónsdóttir / WMO International Cloud Atlas",
        cues: ["smooth lens volumes", "layered wave alignment", "sharp laminar edges without repetitive saucers"],
        profile: { base: 4.7, thickness: 0.65, oktas: 3, opticalDepth: 0.58, ice: 0.3, wind: 23, shear: 0.7, turbulence: 0.08, organization: "banded", lifecycle: 0.28, organizationStrength: 0.9 },
    },
    {
        id: "ac-castellanus", genus: "altocumulus", species: "castellanus", title: "Altocumulus castellanus",
        image: wmoImage(4704, "crepuscular-rays-and-altocumulus-castellanus-and-floccusfloccus_clouds-photometeors.jpg"), source: wmoViewer(4704), credit: "George Anderson / WMO International Cloud Atlas",
        cues: ["mid-level turrets", "common base", "localized instability without cumulus scale"],
        profile: { base: 3.8, thickness: 1.25, oktas: 4, opticalDepth: 0.56, ice: 0.18, wind: 15, shear: 0.3, turbulence: 0.66, organization: "streets", lifecycle: 0.76, organizationStrength: 0.7 },
    },
    {
        id: "ac-floccus", genus: "altocumulus", species: "floccus", title: "Altocumulus floccus",
        image: "https://cloudatlas.wmo.int/images/compressed/5787_main_altocumulus-floccus-virga_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-altocumulus-floccus-ac-flo.html", credit: "WMO International Cloud Atlas",
        cues: ["separated mid-level cumuliform tufts", "dissipating ragged bases", "mixed-phase virga beneath some elements"],
        profile: { base: 4.1, thickness: 0.9, oktas: 4, opticalDepth: 0.5, ice: 0.3, precipitation: 0.12, wind: 17, shear: 0.42, turbulence: 0.68, organization: "isolated", lifecycle: 0.84, organizationStrength: 0.68 },
    },
    {
        id: "ac-volutus", genus: "altocumulus", species: "volutus", title: "Altocumulus volutus",
        image: "https://cloudatlas.wmo.int/images/compressed/5930_main_altocumulus-volutus_clouds.jpg", source: "https://cloudatlas.wmo.int/en/species-altocumulus-volutus-ac-vol.html", credit: "WMO International Cloud Atlas",
        cues: ["single detached horizontal tube", "finite roll seldom spanning the horizon", "middle-level scale and smooth rotational body"],
        profile: { base: 4.0, thickness: 0.62, oktas: 2, opticalDepth: 0.5, ice: 0.18, wind: 22, shear: 0.38, turbulence: 0.22, organization: "streets", lifecycle: 0.48, organizationStrength: 0.96 },
    },
    {
        id: "as-opacus", genus: "altostratus", species: "opacus", title: "Altostratus opacus",
        image: wmoImage(3706, "altostratus-opacus-and-stratocumulus-stratiformis-undulatus_clouds.JPG"), source: wmoViewer(3706), credit: "Jarmo Koistinen / WMO International Cloud Atlas",
        cues: ["broad blue-grey sheet", "deep low-relief structure", "no cellular or cauliflower topology"],
        profile: { base: 3.0, thickness: 2.3, oktas: 8, opticalDepth: 0.78, ice: 0.42, precipitation: 0.08, wind: 18, shear: 0.42, turbulence: 0.14, organization: "frontal", lifecycle: 0.58, organizationStrength: 0.84 },
    },
    {
        id: "ns-precipitating", genus: "nimbostratus", species: "praecipitatio", title: "Nimbostratus with continuous precipitation",
        image: wmoImage(5143, "nimbostratus-with-continuous-snow_clouds-hydrometeors.JPG"), source: wmoViewer(5143), credit: "Jüri Kamenik / WMO International Cloud Atlas",
        cues: ["deep diffuse rain deck", "wet indistinct base", "broad attached precipitation cores"],
        profile: { base: 1.3, thickness: 4.2, oktas: 8, opticalDepth: 0.98, ice: 0.34, precipitation: 0.88, wind: 17, shear: 0.35, turbulence: 0.24, organization: "frontal", lifecycle: 0.68, organizationStrength: 0.94 },
    },
    {
        id: "sc-stratiformis", genus: "stratocumulus", species: "stratiformis", title: "Stratocumulus stratiformis",
        image: wmoImage(4714, "stratocumulus-stratiformis-translucidus-undulatus_clouds.JPG"), source: wmoViewer(4714), credit: "Frank Le Blancq / WMO International Cloud Atlas",
        cues: ["large merged low elements", "common base with rolling relief", "irregular clear channels"],
        profile: { base: 0.9, thickness: 0.9, oktas: 6, opticalDepth: 0.72, ice: 0, wind: 11, shear: 0.2, turbulence: 0.32, organization: "closed-cell", lifecycle: 0.52, organizationStrength: 0.8 },
    },
    {
        id: "sc-lenticularis", genus: "stratocumulus", species: "lenticularis", title: "Stratocumulus lenticularis",
        image: "https://cloudatlas.wmo.int/images/compressed/5488_main_stratocumulus-lenticularis-wave-cloud_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-stratocumulus-lenticularis-sc-len.html", credit: "WMO International Cloud Atlas",
        cues: ["large low-level wave lens", "smooth attached orographic geometry", "strong self-shading without cellular texture"],
        profile: { base: 1.2, thickness: 0.7, oktas: 3, opticalDepth: 0.68, ice: 0, wind: 18, shear: 0.7, turbulence: 0.08, organization: "banded", lifecycle: 0.3, organizationStrength: 0.92 },
    },
    {
        id: "sc-castellanus", genus: "stratocumulus", species: "castellanus", title: "Stratocumulus castellanus",
        image: "https://cloudatlas.wmo.int/images/compressed/5803_main_stratocumulus-castellanus-beneath-stratocumulus-stratiformis-opacus_clouds.jpg", source: "https://cloudatlas.wmo.int/en/species-stratocumulus-castellanus-sc-cas.html", credit: "WMO International Cloud Atlas",
        cues: ["large low turrets in lines", "shared stratocumulus base", "turrets broader than mid/high castellanus"],
        profile: { base: 0.95, thickness: 1.2, oktas: 5, opticalDepth: 0.76, ice: 0, wind: 10, shear: 0.22, turbulence: 0.68, organization: "streets", lifecycle: 0.72, organizationStrength: 0.82 },
    },
    {
        id: "sc-floccus", genus: "stratocumulus", species: "floccus", title: "Stratocumulus floccus",
        image: "https://cloudatlas.wmo.int/images/compressed/5709_main_stratocumulus-floccus_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-stratocumulus-floccus-sc-flo.html", credit: "WMO International Cloud Atlas",
        cues: ["detached low cumuliform tufts", "ragged dissipating lower portions", "larger and more shaded than alto/cirro floccus"],
        profile: { base: 0.85, thickness: 0.82, oktas: 4, opticalDepth: 0.66, ice: 0, wind: 10, shear: 0.2, turbulence: 0.62, organization: "isolated", lifecycle: 0.86, organizationStrength: 0.62 },
    },
    {
        id: "sc-volutus", genus: "stratocumulus", species: "volutus", title: "Stratocumulus volutus",
        image: wmoImage(4744, "stratocumulus-volutus_clouds.JPG"), source: wmoViewer(4744), credit: "Shirley Rebstock / WMO International Cloud Atlas",
        cues: ["coherent horizontal roll", "perspective convergence", "asymmetric illuminated cylinder"],
        profile: { base: 0.7, thickness: 0.75, oktas: 4, opticalDepth: 0.7, ice: 0, wind: 14, shear: 0.28, turbulence: 0.24, organization: "streets", lifecycle: 0.46, organizationStrength: 0.94 },
    },
    {
        id: "st-nebulosus", genus: "stratus", species: "nebulosus", title: "Stratus nebulosus",
        image: wmoImage(4717, "stratus-nebulosus_clouds.JPG"), source: wmoViewer(4717), credit: "Frank Le Blancq / WMO International Cloud Atlas",
        cues: ["shallow uniform slab", "very low-frequency base undulation", "soft diffuse illumination"],
        profile: { base: 0.28, thickness: 0.42, oktas: 8, opticalDepth: 0.64, ice: 0, precipitation: 0.08, wind: 6, shear: 0.08, turbulence: 0.08, organization: "unorganized", lifecycle: 0.5, organizationStrength: 0.18 },
    },
    {
        id: "st-fractus", genus: "stratus", species: "fractus", title: "Stratus fractus",
        image: wmoImage(4968, "mist-with-stratus-forming-upslope-fog_clouds-hydrometeors.JPG"), source: wmoViewer(4968), credit: "Kwok Fai Chiang / WMO International Cloud Atlas",
        cues: ["ragged low fragments", "terrain/boundary-layer attachment", "no rounded convective domes"],
        profile: { base: 0.16, thickness: 0.36, oktas: 5, opticalDepth: 0.48, ice: 0, precipitation: 0.04, wind: 5, shear: 0.1, turbulence: 0.42, organization: "unorganized", lifecycle: 0.9, organizationStrength: 0.3 },
    },
    {
        id: "cu-humilis", genus: "cumulus", species: "humilis", title: "Cumulus humilis",
        image: wmoImage(2635, "cumulus-humilis_clouds.jpg"), source: wmoViewer(2635), credit: "Stephen Burt / WMO International Cloud Atlas",
        cues: ["detached bodies", "clear-cut common base per cloud", "rounded low-relief tops and crisp gaps"],
        profile: { base: 0.9, thickness: 0.55, oktas: 3, opticalDepth: 0.76, convection: 0.18, instability: 0.25, ice: 0, wind: 8, shear: 0.1, turbulence: 0.3, organization: "isolated", lifecycle: 0.3, organizationStrength: 0.62 },
    },
    {
        id: "cu-mediocris", genus: "cumulus", species: "mediocris", title: "Cumulus mediocris",
        image: wmoImage(4751, "cumulus-congestus-and-other-species_clouds.JPG"), source: wmoViewer(4751), credit: "Marcin Kocybik / WMO International Cloud Atlas",
        cues: ["moderate vertical development", "two-scale cauliflower crowns", "dark horizontal bases with sky-colored shadows"],
        profile: { base: 1.0, thickness: 1.7, oktas: 4, opticalDepth: 0.84, convection: 0.5, instability: 0.55, ice: 0, wind: 9, shear: 0.16, turbulence: 0.55, organization: "isolated", lifecycle: 0.55, organizationStrength: 0.72 },
    },
    {
        id: "cu-congestus", genus: "cumulus", species: "congestus", title: "Cumulus congestus",
        image: wmoImage(3875, "cumulus-congestus-with-precipitation_clouds.JPG"), source: wmoViewer(3875), credit: "Matthew Clark / WMO International Cloud Atlas",
        cues: ["strong tower-to-width ratio", "successive hard cauliflower turrets", "precipitation remains secondary to the water tower"],
        profile: { base: 0.8, thickness: 4.2, oktas: 4, opticalDepth: 0.92, convection: 0.84, instability: 0.86, ice: 0.08, precipitation: 0.2, wind: 10, shear: 0.24, turbulence: 0.72, organization: "isolated", lifecycle: 0.7, organizationStrength: 0.82 },
    },
    {
        id: "cu-fractus", genus: "cumulus", species: "fractus", title: "Cumulus fractus",
        image: "https://cloudatlas.wmo.int/images/compressed/4756_main_cumulus-fractus_clouds.jpg", source: "https://cloudatlas.wmo.int/en/species-cumulus-fractus-cu-fra.html", credit: "WMO International Cloud Atlas",
        cues: ["ragged changing cumuliform fragments", "clear air between independent pieces", "wind-torn form without a stratus sheet"],
        profile: { base: 0.7, thickness: 0.5, oktas: 3, opticalDepth: 0.6, convection: 0.16, instability: 0.3, ice: 0, wind: 14, shear: 0.3, turbulence: 0.88, organization: "isolated", lifecycle: 0.94, organizationStrength: 0.5 },
    },
    {
        id: "cb-calvus", genus: "cumulonimbus", species: "calvus", title: "Cumulonimbus calvus",
        image: wmoImage(4726, "cumulonimbus-calvus-with-pileus_clouds.jpg"), source: wmoViewer(4726), credit: "Stephen Burt / WMO International Cloud Atlas",
        cues: ["one coherent deep tower", "smooth glaciating dome", "attached dark rain core"],
        profile: { base: 0.75, thickness: 9.2, oktas: 3, opticalDepth: 1, convection: 0.9, instability: 0.92, ice: 0.28, precipitation: 0.72, wind: 15, shear: 0.4, turbulence: 0.72, organization: "isolated", lifecycle: 0.36, organizationStrength: 0.88 },
    },
    {
        id: "cb-capillatus", genus: "cumulonimbus", species: "capillatus", title: "Cumulonimbus capillatus",
        image: "https://cloudatlas.wmo.int/images/compressed/5500_main_cumulonimbus-capillatus-praecipitatio_clouds.JPG", source: "https://cloudatlas.wmo.int/en/species-cumulonimbus-capillatus-cb-cap.html", credit: "WMO International Cloud Atlas",
        cues: ["glaciated fibrous upper tower", "one storm-owned outflow crown", "deep attached precipitation and coherent updraft"],
        profile: { base: 0.72, thickness: 11.4, oktas: 4, opticalDepth: 1, convection: 0.98, instability: 0.98, ice: 0.48, precipitation: 0.92, wind: 20, shear: 0.7, turbulence: 0.8, organization: "isolated", lifecycle: 0.64, organizationStrength: 0.94 },
    },
    {
        id: "cb-capillatus-incus", genus: "cumulonimbus", species: "capillatus incus", title: "Cumulonimbus capillatus incus",
        image: wmoImage(4736, "cumulonimbus-capillatus-incus-with-mamma_clouds.jpg"), source: wmoViewer(4736), credit: "Fabrizio Micalizzi / WMO International Cloud Atlas",
        cues: ["storm-owned fibrous anvil", "downwind asymmetric outflow", "overshoot, tower and precipitation share one system"],
        profile: { base: 0.7, thickness: 12.4, oktas: 5, opticalDepth: 1, convection: 1, instability: 0.98, ice: 0.52, precipitation: 0.96, wind: 22, shear: 0.82, turbulence: 0.82, organization: "isolated", lifecycle: 0.72, organizationStrength: 0.96 },
    },
];

const ENVIRONMENTS: EvaluationEnvironment[] = [
    {
        id: "day-oblique-natural", label: "Dry day · oblique · natural", description: "High side/front light, ordinary photographic perspective and moderate elevation.",
        date: "2026-07-25T21:00:00.000Z", latitude: 34.0522, longitude: -118.2437, viewAzimuth: 55, viewElevation: 24, horizontalFov: 64, verticalFov: 42,
        perspective: "natural", regime: "auto", familyId: "crystal-azure", atmosphereStyle: "crystal", aerosolType: "clean",
        composition: { aerosol: 0.12, humidity: 0.28, aerosolSize: 0.24, aerosolAbsorption: 0.02, ozone: 1, observerAltitude: 0.08, inversion: 0.05, stratosphericAerosol: 0, groundAlbedo: 0.22 },
    },
    {
        id: "golden-backlit-telephoto", label: "Golden backlight · horizon · telephoto", description: "Low solar backlight exposes silver edges, optical depth and distant-system silhouette.",
        date: "2026-07-26T02:22:00.000Z", latitude: 34.0522, longitude: -118.2437, viewAzimuth: 286, viewElevation: 12, horizontalFov: 38, verticalFov: 26,
        perspective: "telephoto", regime: "distant", familyId: "cobalt-gold", atmosphereStyle: "haze", aerosolType: "maritime",
        composition: { aerosol: 0.3, humidity: 0.56, aerosolSize: 0.48, aerosolAbsorption: 0.05, ozone: 1.02, observerAltitude: 0.02, inversion: 0.22, stratosphericAerosol: 0, groundAlbedo: 0.2 },
    },
    {
        id: "humid-wide-nearby", label: "Humid day · high oblique · wide", description: "Near-field scale, aerial perspective and broad spatial organization in moist air.",
        date: "2026-08-11T16:30:00.000Z", latitude: 25.7617, longitude: -80.1918, viewAzimuth: 125, viewElevation: 38, horizontalFov: 94, verticalFov: 64,
        perspective: "wide", regime: "nearby", familyId: "humid-aqua", atmosphereStyle: "soft", aerosolType: "maritime",
        composition: { aerosol: 0.24, humidity: 0.86, aerosolSize: 0.55, aerosolAbsorption: 0.03, ozone: 0.98, observerAltitude: 0, inversion: 0.34, stratosphericAerosol: 0, groundAlbedo: 0.16 },
    },
    {
        id: "twilight-overhead", label: "Twilight · overhead · natural", description: "High camera elevation tests depth, underside structure and warm/cool atmospheric coupling.",
        date: "2026-10-08T01:50:00.000Z", latitude: 34.0522, longitude: -118.2437, viewAzimuth: 248, viewElevation: 64, horizontalFov: 72, verticalFov: 52,
        perspective: "natural", regime: "overhead", familyId: "rose-afterglow", atmosphereStyle: "soft", aerosolType: "sulfate",
        composition: { aerosol: 0.2, humidity: 0.62, aerosolSize: 0.38, aerosolAbsorption: 0.03, ozone: 1.06, observerAltitude: 0.04, inversion: 0.18, stratosphericAerosol: 0.05, groundAlbedo: 0.2 },
    },
    {
        id: "moonlight-natural", label: "Moonlight · mid elevation · natural", description: "Low radiance tests phase, translucency and shadow hue without daylight exposure hiding defects.",
        date: "2026-07-30T06:20:00.000Z", latitude: 34.0522, longitude: -118.2437, viewAzimuth: 165, viewElevation: 30, horizontalFov: 68, verticalFov: 46,
        perspective: "natural", regime: "auto", familyId: "violet-nocturne", atmosphereStyle: "crystal", aerosolType: "clean", nightExposure: -0.28,
        composition: { aerosol: 0.08, humidity: 0.34, aerosolSize: 0.22, aerosolAbsorption: 0.02, ozone: 1.05, observerAltitude: 0.1, inversion: 0.04, stratosphericAerosol: 0, groundAlbedo: 0.18 },
    },
];

const seedFor = (text: string): [number, number, number, number] => {
    let value = 2166136261;
    const result: number[] = [];
    for (const character of text) {
        value ^= character.charCodeAt(0);
        value = Math.imul(value, 16777619);
        result.push(((value >>> 0) % 10_000) / 10_000);
    }
    while (result.length < 4) {
        value = Math.imul(value ^ (result.length * 2654435761), 16777619);
        result.push(((value >>> 0) % 10_000) / 10_000);
    }
    return result.slice(-4) as [number, number, number, number];
};

const sceneFor = (reference: CloudReference): CloudScene => {
    const profile = reference.profile;
    // Lighting/camera environments must not silently regenerate morphology.
    // Keeping one seed per photographic reference makes comparisons isolate
    // illumination and perspective, and enables true invariance assertions.
    const seed = seedFor(reference.id);
    // Near-cloud humidity belongs to the meteorological reference, not the
    // photographic aerosol/lighting environment. Deriving it from the latter
    // changed the stable runtime signature and silently rearranged every owner
    // between day, twilight and moonlight comparisons of the same cloud.
    const cloudHumidity = Math.min(0.94, Math.max(0.46,
        0.50 + profile.opticalDepth * 0.28 +
        (profile.precipitation ?? 0) * 0.12 +
        (reference.genus === "nimbostratus" ? 0.08 : 0)));
    const classification = classificationFromDesignation(
        reference.genus, reference.species);
    const rendererSpecies = rendererSpeciesForClassification(classification);
    if (!rendererSpecies) {
        throw new Error(`No renderer recipe for ${reference.title}.`);
    }
    const layer = createLayer({
        genus: reference.genus,
        species: rendererSpecies,
        oktas: profile.oktas,
        baseAltitude: profile.base * 1000,
        thickness: profile.thickness * 1000,
        opticalDepth: profile.opticalDepth,
        convection: profile.convection ?? 0.16,
        iceFraction: profile.ice,
        precipitation: profile.precipitation,
        windSpeed: profile.wind,
        windDirection: seed[0] * Math.PI * 2,
        shear: profile.shear,
        turbulence: profile.turbulence,
        organization: profile.organization,
        lifecycle: profile.lifecycle,
        organizationStrength: profile.organizationStrength,
    });
    const layers: CloudScene["layers"] = [
        { ...EMPTY_LAYER }, { ...EMPTY_LAYER }, { ...EMPTY_LAYER },
    ];
    const level = CLOUD_GENUS_LEVEL[reference.genus];
    layers[level === "low" ? 0 : level === "middle" ? 1 : 2] = layer;
    return constrainScene({
        layers,
        totalOktas: profile.oktas,
        convection: profile.convection ?? 0.16,
        instability: profile.instability ?? profile.convection ?? 0.2,
        humidity: cloudHumidity,
        fog: reference.genus === "stratus" ? 0.26 : 0,
        noctilucent: 0,
        seed,
    });
};

export interface CloudPhotographCase {
    id: string;
    genus: RenderableGenus;
    species: string;
    classification: CloudClassification;
    title: string;
    referenceImage: string;
    source: string;
    credit: string;
    cues: string[];
    environment: EvaluationEnvironment;
    preview: SkyPreviewOptions;
}

export const CLOUD_PHOTOGRAPH_CASES: CloudPhotographCase[] = REFERENCES.flatMap((reference) =>
    ENVIRONMENTS.map((environment) => ({
        id: `${reference.id}--${environment.id}`,
        genus: reference.genus,
        species: reference.species,
        classification: classificationFromDesignation(reference.genus, reference.species),
        title: reference.title,
        referenceImage: reference.image,
        source: reference.source,
        credit: reference.credit,
        cues: reference.cues,
        environment,
        preview: {
            date: new Date(environment.date),
            timezone: "UTC",
            latitude: environment.latitude,
            longitude: environment.longitude,
            viewAzimuth: environment.viewAzimuth,
            viewElevation: environment.viewElevation,
            horizontalFov: environment.horizontalFov,
            verticalFov: environment.verticalFov,
            familyId: environment.familyId,
            atmosphereStyle: environment.atmosphereStyle,
            aerosolType: environment.aerosolType,
            composition: environment.composition,
            cloudScene: sceneFor(reference),
            cloudComposition: "graphic",
            // The supplied horizontal/vertical FOV is the physical camera
            // projection shared by atmosphere, stars and cloud systems.  A
            // second cloud-only wide/telephoto transform would warp the cloud
            // against its sky and can move finite systems out of frame.  Lens
            // transforms remain explicit diagnostic controls in Sky Lab.
            cloudPerspective: "natural",
            cloudEditorialRegime: environment.regime,
            rendererPreference: "webgpu",
            rendererQuality: "high",
            cloudResolutionScale: 1,
            temporalClouds: true,
            motionAmount: 0,
            nightExposure: environment.nightExposure,
        },
    })),
);

export const CLOUD_PHOTOGRAPH_SUMMARY = {
    references: REFERENCES.length,
    environments: ENVIRONMENTS.length,
    cases: CLOUD_PHOTOGRAPH_CASES.length,
};

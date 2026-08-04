import type { CloudScene, CloudSpecies } from "./cloud-scene";
import type { CloudMorphologyClassificationAssignment } from "./cloud-morphology-modifiers";
import type {
    CloudAccessory,
    CloudClassification,
    CloudSupplementaryFeature,
    CloudVariety,
    UpperAtmosphericCloud,
    WmoCloudGenus,
} from "./cloud-state-map";

/**
 * Lazy first-party photographic qualification for orthogonal cloud morphology.
 *
 * Importing this file performs no network, image, browser, renderer, or GPU
 * work. WMO image URLs remain provenance strings until a review UI explicitly
 * requests one yielded case.
 */

export type MorphologyPhotographAxis =
    | "variety"
    | "supplementary-feature"
    | "accessory-cloud"
    | "upper-atmospheric"
    | "exterior-boundary";

export type MorphologyFailureMode =
    | "fake-grid"
    | "repeated-stamp"
    | "screen-space-mask"
    | "detached-owner-feature"
    | "wrong-relative-placement"
    | "wrong-scale-hierarchy"
    | "boundary-clipping"
    | "lighting-discontinuity"
    | "atmosphere-color-mismatch";

export interface WmoPhotographicReference {
    provider: "WMO International Cloud Atlas";
    /** Direct WMO-hosted image; the host must not fetch it before review. */
    imageUrl: string;
    /** Direct WMO metadata/viewer record with description and photo credit. */
    viewerUrl: string;
    /** Authoritative WMO definition or classification page. */
    taxonomyUrl: string;
    credit: string;
    imageId: number;
}

export interface MorphologyAcceptanceCue {
    id: string;
    pass: string;
    rejects: readonly MorphologyFailureMode[];
}

export interface MorphologyPhotographEnvironment {
    id: string;
    label: string;
    /** Optional adapter key already understood by weather qualification. */
    weatherQualificationEnvironmentId?: string;
    date: string;
    latitude: number;
    longitude: number;
    solarElevationDegrees: number;
    lighting: "front" | "side" | "back" | "diffuse" | "twilight" | "moon";
    relativeHumidity: number;
    aerosolType: "clean" | "maritime" | "pollution";
    aerosolOpticalDepth: number;
    season: number;
    stratosphericTemperatureKelvin: number;
    moonElevationDegrees: number;
    moonIlluminatedFraction: number;
    purpose: string;
}

export interface MorphologyPhotographPerspective {
    id: string;
    label: string;
    weatherQualificationPerspectiveId: string;
    observerAltitudeKm: number;
    viewElevationDegrees: number;
    horizontalFieldOfViewDegrees: number;
    range: "near" | "natural" | "distant";
    purpose: string;
}

export interface MorphologyPhotographCoverage {
    id: "sparse" | "broken" | "extensive" | "overcast";
    label: string;
    oktas: number;
    expectedOccupiedSkyFraction: readonly [number, number];
    purpose: string;
}

export interface MorphologyPhotographTarget {
    id: string;
    axis: MorphologyPhotographAxis;
    designation: CloudVariety | CloudSupplementaryFeature | CloudAccessory |
        Exclude<UpperAtmosphericCloud, "none"> | "liquid-convection" |
        "stratiform-scud" | "ice-fibre";
    label: string;
    reference: WmoPhotographicReference;
    classification: CloudClassification;
    assignment: CloudMorphologyClassificationAssignment;
    environmentIds: readonly string[];
    perspectiveIds: readonly string[];
    coverageIds: readonly MorphologyPhotographCoverage["id"][];
    cues: readonly MorphologyAcceptanceCue[];
}

export interface MorphologyPhotographCase {
    id: string;
    target: MorphologyPhotographTarget;
    reference: WmoPhotographicReference;
    environment: MorphologyPhotographEnvironment;
    perspective: MorphologyPhotographPerspective;
    coverage: MorphologyPhotographCoverage;
    /** Directly assignable to CloudScene.classifications. */
    classifications: readonly CloudMorphologyClassificationAssignment[];
}

const environment = (
    value: MorphologyPhotographEnvironment,
): MorphologyPhotographEnvironment => value;

export const MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS: readonly MorphologyPhotographEnvironment[] = [
    environment({ id: "clean-side-day", label: "Clean side-lit day", weatherQualificationEnvironmentId: "clean-midday-side", date: "2026-07-25T20:10:00.000Z", latitude: 44, longitude: -105, solarElevationDegrees: 48, lighting: "side", relativeHumidity: 0.42, aerosolType: "clean", aerosolOpticalDepth: 0.10, season: 0.78, stratosphericTemperatureKelvin: 205, moonElevationDegrees: -25, moonIlluminatedFraction: 0, purpose: "Resolves true volume relief, attachment, and cloud/sky radiance coupling." }),
    environment({ id: "golden-backlight", label: "Golden-hour backlight", weatherQualificationEnvironmentId: "golden-backlight", date: "2026-07-25T02:15:00.000Z", latitude: 34, longitude: -118, solarElevationDegrees: 5, lighting: "back", relativeHumidity: 0.58, aerosolType: "pollution", aerosolOpticalDepth: 0.22, season: 0.80, stratosphericTemperatureKelvin: 206, moonElevationDegrees: -18, moonIlluminatedFraction: 0.04, purpose: "Exposes fake edge glows, masks, clipping, and incorrect optical-depth coloration." }),
    environment({ id: "diffuse-humid", label: "Diffuse humid overcast", weatherQualificationEnvironmentId: "diffuse-overcast", date: "2026-10-18T13:20:00.000Z", latitude: 51, longitude: 0, solarElevationDegrees: 27, lighting: "diffuse", relativeHumidity: 0.98, aerosolType: "maritime", aerosolOpticalDepth: 0.20, season: 0.62, stratosphericTemperatureKelvin: 203, moonElevationDegrees: -30, moonIlluminatedFraction: 0, purpose: "Tests low-contrast structure without directional lighting hiding repetition." }),
    environment({ id: "humid-marine-side", label: "Humid marine side light", weatherQualificationEnvironmentId: "humid-marine", date: "2026-08-11T16:30:00.000Z", latitude: 26, longitude: -80, solarElevationDegrees: 42, lighting: "side", relativeHumidity: 0.90, aerosolType: "maritime", aerosolOpticalDepth: 0.17, season: 0.90, stratosphericTemperatureKelvin: 205, moonElevationDegrees: -20, moonIlluminatedFraction: 0, purpose: "Checks aerial perspective and low-cloud boundary softness without whitening." }),
    environment({ id: "tropical-storm-side", label: "Tropical storm side light", weatherQualificationEnvironmentId: "tropical-convection", date: "2026-07-25T18:00:00.000Z", latitude: 12, longitude: -61, solarElevationDegrees: 51, lighting: "side", relativeHumidity: 0.88, aerosolType: "maritime", aerosolOpticalDepth: 0.16, season: 0.90, stratosphericTemperatureKelvin: 202, moonElevationDegrees: -35, moonIlluminatedFraction: 0, purpose: "Resolves storm-owned features, liquid/ice transition, and self-shadow depth." }),
    environment({ id: "tropical-storm-backlight", label: "Tropical storm backlight", weatherQualificationEnvironmentId: "golden-backlight", date: "2026-07-25T22:25:00.000Z", latitude: 18, longitude: -66, solarElevationDegrees: 4, lighting: "back", relativeHumidity: 0.84, aerosolType: "maritime", aerosolOpticalDepth: 0.18, season: 0.88, stratosphericTemperatureKelvin: 202, moonElevationDegrees: -16, moonIlluminatedFraction: 0.05, purpose: "Tests storm silhouette continuity, silver lining, and attached-feature extinction." }),
    environment({ id: "clean-twilight", label: "Clean twilight", weatherQualificationEnvironmentId: "twilight-afterglow", date: "2026-10-08T01:50:00.000Z", latitude: 37, longitude: -122, solarElevationDegrees: -5, lighting: "twilight", relativeHumidity: 0.63, aerosolType: "maritime", aerosolOpticalDepth: 0.14, season: 0.72, stratosphericTemperatureKelvin: 201, moonElevationDegrees: -10, moonIlluminatedFraction: 0.12, purpose: "Tests warm/cool color continuity through transparent and opaque condensate." }),
    environment({ id: "clean-moonlight", label: "Clean gibbous moonlight", weatherQualificationEnvironmentId: "dark-moonlight", date: "2026-07-30T06:20:00.000Z", latitude: 35, longitude: -118, solarElevationDegrees: -24, lighting: "moon", relativeHumidity: 0.48, aerosolType: "clean", aerosolOpticalDepth: 0.07, season: 0.72, stratosphericTemperatureKelvin: 202, moonElevationDegrees: 34, moonIlluminatedFraction: 0.74, purpose: "Catches luminous pasted features and shadow colors disconnected from the night sky." }),
    environment({ id: "polar-winter-twilight", label: "Polar winter twilight", weatherQualificationEnvironmentId: "polar-winter-twilight", date: "2026-01-18T11:20:00.000Z", latitude: 70, longitude: 19, solarElevationDegrees: -7, lighting: "twilight", relativeHumidity: 0.50, aerosolType: "clean", aerosolOpticalDepth: 0.04, season: 0.08, stratosphericTemperatureKelvin: 184, moonElevationDegrees: -12, moonIlluminatedFraction: 0.08, purpose: "Physical PSC/nacreous frost-point case with a dark lower atmosphere." }),
    environment({ id: "polar-winter-grazing", label: "Polar winter grazing sunlight", date: "2026-02-05T10:40:00.000Z", latitude: 68, longitude: 20, solarElevationDegrees: -2, lighting: "back", relativeHumidity: 0.46, aerosolType: "clean", aerosolOpticalDepth: 0.035, season: 0.12, stratosphericTemperatureKelvin: 183, moonElevationDegrees: -18, moonIlluminatedFraction: 0.03, purpose: "Grazing source geometry exposes wave thickness and physically located iridescence." }),
    environment({ id: "polar-winter-moon", label: "Polar winter moonlight", weatherQualificationEnvironmentId: "polar-snow-moonlight", date: "2026-01-28T22:10:00.000Z", latitude: 68, longitude: 19, solarElevationDegrees: -26, lighting: "moon", relativeHumidity: 0.42, aerosolType: "clean", aerosolOpticalDepth: 0.03, season: 0.10, stratosphericTemperatureKelvin: 184, moonElevationDegrees: 26, moonIlluminatedFraction: 0.93, purpose: "Separates real stratospheric morphology from a baked twilight color stamp." }),
    environment({ id: "polar-summer-civil", label: "Polar summer civil twilight", date: "2026-07-08T22:40:00.000Z", latitude: 62, longitude: 12, solarElevationDegrees: -7, lighting: "twilight", relativeHumidity: 0.50, aerosolType: "clean", aerosolOpticalDepth: 0.04, season: 0.92, stratosphericTemperatureKelvin: 198, moonElevationDegrees: -20, moonIlluminatedFraction: 0.03, purpose: "NLC onset against a still-bright twilight gradient." }),
    environment({ id: "polar-summer-nautical", label: "Polar summer nautical twilight", weatherQualificationEnvironmentId: "polar-summer-twilight", date: "2026-07-09T00:05:00.000Z", latitude: 62, longitude: 12, solarElevationDegrees: -11, lighting: "twilight", relativeHumidity: 0.48, aerosolType: "clean", aerosolOpticalDepth: 0.035, season: 0.92, stratosphericTemperatureKelvin: 198, moonElevationDegrees: -24, moonIlluminatedFraction: 0.03, purpose: "Canonical sunlit mesopause cloud above a dark lower atmosphere." }),
    environment({ id: "polar-summer-deep", label: "Polar summer deep twilight", date: "2026-07-09T01:10:00.000Z", latitude: 62, longitude: 12, solarElevationDegrees: -15, lighting: "twilight", relativeHumidity: 0.45, aerosolType: "clean", aerosolOpticalDepth: 0.03, season: 0.92, stratosphericTemperatureKelvin: 198, moonElevationDegrees: -27, moonIlluminatedFraction: 0.03, purpose: "Tests high-altitude illumination falloff and fine wave contrast near the visibility limit." }),
] as const;

export const MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES: readonly MorphologyPhotographPerspective[] = [
    { id: "horizon-wide", label: "Low horizon wide", weatherQualificationPerspectiveId: "horizon-wide", observerAltitudeKm: 0.02, viewElevationDegrees: 7, horizontalFieldOfViewDegrees: 96, range: "distant", purpose: "Finite system boundaries, band convergence, storm attachment and aerial perspective." },
    { id: "oblique-natural", label: "Natural oblique", weatherQualificationPerspectiveId: "oblique-natural", observerAltitudeKm: 0.05, viewElevationDegrees: 27, horizontalFieldOfViewDegrees: 64, range: "natural", purpose: "Canonical morphology, depth and parent-relative placement." },
    { id: "zenith-wide", label: "Wide uplook", weatherQualificationPerspectiveId: "zenith-wide", observerAltitudeKm: 0.02, viewElevationDegrees: 72, horizontalFieldOfViewDegrees: 84, range: "near", purpose: "Organization, holes, undersides and fake-grid detection." },
    { id: "distant-telephoto", label: "Distant telephoto", weatherQualificationPerspectiveId: "distant-telephoto", observerAltitudeKm: 0.03, viewElevationDegrees: 12, horizontalFieldOfViewDegrees: 32, range: "distant", purpose: "True scale hierarchy, thin-layer separation and silhouette attachment." },
    { id: "near-uplook", label: "Near-field uplook", weatherQualificationPerspectiveId: "near-uplook", observerAltitudeKm: 0.01, viewElevationDegrees: 48, horizontalFieldOfViewDegrees: 70, range: "near", purpose: "Boundary texture, self-shadow and accessory attachment." },
] as const;

export const MORPHOLOGY_PHOTOGRAPH_COVERAGES: readonly MorphologyPhotographCoverage[] = [
    { id: "sparse", label: "Sparse · 2 oktas", oktas: 2, expectedOccupiedSkyFraction: [0.04, 0.32], purpose: "Exposes repeated stamps, hard system borders and detached feature placement." },
    { id: "broken", label: "Broken · 5 oktas", oktas: 5, expectedOccupiedSkyFraction: [0.28, 0.78], purpose: "Tests multiple owners, overlap, negative space and non-grid organization." },
    { id: "extensive", label: "Extensive · 7 oktas", oktas: 7, expectedOccupiedSkyFraction: [0.58, 0.95], purpose: "Tests finite sheets and dense fields without turning boundaries into masks." },
    { id: "overcast", label: "Overcast · 8 oktas", oktas: 8, expectedOccupiedSkyFraction: [0.82, 1], purpose: "Tests immediate deck lighting, depth and physically continuous coverage." },
] as const;

const wmoReference = (
    imageId: number,
    filename: string,
    taxonomyUrl: string,
    credit: string,
): WmoPhotographicReference => ({
    provider: "WMO International Cloud Atlas",
    imageUrl: `https://cloudatlas.wmo.int/images/compressed/${imageId}_main_${filename}`,
    viewerUrl: `https://cloudatlas.wmo.int/en/imgviewer-${imageId}.txt`,
    taxonomyUrl,
    credit,
    imageId,
});

const classify = (
    genus: WmoCloudGenus,
    species: string,
    axes: Partial<Pick<CloudClassification,
        "varieties" | "supplementaryFeatures" | "accessoryClouds">> = {},
): CloudClassification => ({
    genus,
    species: (genus === "altostratus" || genus === "nimbostratus") ? null : species,
    varieties: genus === "altostratus" && species === "opacus" ? ["opacus"] : [],
    supplementaryFeatures: genus === "nimbostratus" && species === "praecipitatio"
        ? ["praecipitatio"] : [],
    accessoryClouds: [],
    origin: { kind: "natural" },
    ...axes,
} as CloudClassification);

const rendererSpeciesForPhotographClassification = (
    classification: CloudClassification,
): Exclude<CloudSpecies, "generic"> => {
    if (classification.genus === "altostratus") return "altostratus-opacus";
    if (classification.genus === "nimbostratus") return "nimbostratus-praecipitatio";
    return `${classification.genus}-${classification.species}` as Exclude<CloudSpecies, "generic">;
};

const assignmentFor = (
    classification: CloudClassification,
    upperAtmosphericCloud?: Exclude<UpperAtmosphericCloud, "none">,
): CloudMorphologyClassificationAssignment => {
    const layerIndex = ["stratus", "stratocumulus", "cumulus", "cumulonimbus"]
        .includes(classification.genus) ? 0
        : ["altocumulus", "altostratus", "nimbostratus"].includes(classification.genus) ? 1 : 2;
    return {
        layerIndex,
        systemIndex: upperAtmosphericCloud ? 11 : 0,
        classification,
        ...(upperAtmosphericCloud ? { upperAtmosphericCloud } : {}),
    };
};

const cue = (
    id: string,
    pass: string,
    ...rejects: MorphologyFailureMode[]
): MorphologyAcceptanceCue => ({ id, pass, rejects });

const VARIETY_URL = (name: CloudVariety) =>
    `https://cloudatlas.wmo.int/en/clouds-varieties-${name}.html`;
const FEATURE_URL = (name: CloudSupplementaryFeature) =>
    `https://cloudatlas.wmo.int/en/clouds-supplementary-features-${name}.html`;
const ACCESSORY_URL = (name: CloudAccessory) =>
    `https://cloudatlas.wmo.int/en/clouds-accessory-${name}.html`;

const target = (
    value: Omit<MorphologyPhotographTarget, "assignment">,
    upperAtmosphericCloud?: Exclude<UpperAtmosphericCloud, "none">,
): MorphologyPhotographTarget => ({
    ...value,
    assignment: assignmentFor(value.classification, upperAtmosphericCloud),
});

const varietyTargets: MorphologyPhotographTarget[] = [
    target({
        id: "variety-intortus", axis: "variety", designation: "intortus", label: "Cirrus intortus",
        reference: wmoReference(4843, "cirrus-fibratus-increasing_clouds.jpg", VARIETY_URL("intortus"), "Stephen Burt / WMO International Cloud Atlas"),
        classification: classify("cirrus", "fibratus", { varieties: ["intortus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["oblique-natural", "zenith-wide", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("entangled-fibres", "Irregular filaments curve, cross and entangle without repeating a curl or sharing one stamped envelope.", "fake-grid", "repeated-stamp"),
            cue("open-cirrus-field", "Clear gaps remain genuine three-dimensional separation between finite ice streamers.", "screen-space-mask", "wrong-scale-hierarchy"),
            cue("ice-lighting", "Each fibre inherits sky/source color and aerial perspective continuously along its length.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-vertebratus", axis: "variety", designation: "vertebratus", label: "Cirrus vertebratus",
        reference: wmoReference(4716, "cirrus-fibratus-vertebratus_clouds.jpg", VARIETY_URL("vertebratus"), "Frank Le Blancq / WMO International Cloud Atlas"),
        classification: classify("cirrus", "fibratus", { varieties: ["vertebratus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["oblique-natural", "zenith-wide", "distant-telephoto"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("spine-and-ribs", "A finite central ice spine carries unequal tapered ribs with correlated shear, not mirrored line segments.", "fake-grid", "repeated-stamp"),
            cue("rib-attachment", "Ribs emerge continuously from the spine and decay independently into the ambient dry air.", "detached-owner-feature", "boundary-clipping"),
            cue("translucent-depth", "Overlap increases optical depth without flattening the fishbone into a bright graphic symbol.", "screen-space-mask", "lighting-discontinuity"),
        ],
    }),
    target({
        id: "variety-undulatus", axis: "variety", designation: "undulatus", label: "Altostratus undulatus",
        reference: wmoReference(5733, "altostratus-translucidus-undulatus-with-virga_clouds.JPG", VARIETY_URL("undulatus"), "Art Rangno / WMO International Cloud Atlas"),
        classification: classify("altostratus", "opacus", { varieties: ["undulatus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "diffuse-humid"], perspectiveIds: ["oblique-natural", "zenith-wide", "horizon-wide"], coverageIds: ["broken", "extensive", "overcast"],
        cues: [
            cue("wave-field", "Several long wave crests share a physical wavelength but vary in phase, amplitude and continuity.", "fake-grid", "repeated-stamp"),
            cue("layer-coupling", "Undulations deform one deep sheet rather than appearing as bright bands pasted over a flat deck.", "screen-space-mask", "wrong-relative-placement"),
            cue("oblique-depth", "Perspective foreshortening and self-shadow change coherently from zenith to horizon.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-radiatus", axis: "variety", designation: "radiatus", label: "Cirrus radiatus",
        reference: wmoReference(4846, "cirrus-spissatus-radiatus-cirrus-uncinus-radiatus-cirrus-floccus-and-cirrocumulus-floccus_clouds.jpg", VARIETY_URL("radiatus"), "Stephen Burt / WMO International Cloud Atlas"),
        classification: classify("cirrus", "uncinus", { varieties: ["radiatus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["horizon-wide", "oblique-natural", "zenith-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("physical-parallelism", "World-space parallel bands converge only through camera perspective and remain parallel from zenith.", "fake-grid", "screen-space-mask"),
            cue("band-variation", "Band spacing, width and streamer population vary without losing the shared shear direction.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("horizon-extinction", "Distant bands fade and redden through atmosphere rather than receiving a uniform alpha fade.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-lacunosus", axis: "variety", designation: "lacunosus", label: "Cirrocumulus lacunosus",
        reference: wmoReference(5103, "cirrocumulus-lenticularis-lacunosus_clouds.JPG", VARIETY_URL("lacunosus"), "Jarmo Koistinen / WMO International Cloud Atlas"),
        classification: classify("cirrocumulus", "lenticularis", { varieties: ["lacunosus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["zenith-wide", "oblique-natural", "horizon-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("true-clear-holes", "Round-to-irregular holes are subtractive clear air through the layer, with fringed condensate edges.", "screen-space-mask", "lighting-discontinuity"),
            cue("aperiodic-net", "The field suggests a net without equal hole radii, lattice spacing or repeated cell stamps.", "fake-grid", "repeated-stamp"),
            cue("edge-phase", "Hole rims retain correct ice/liquid material and local illumination rather than a bright outline.", "boundary-clipping", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-duplicatus", axis: "variety", designation: "duplicatus", label: "Altocumulus duplicatus",
        reference: wmoReference(5738, "altocumulus-castellanus-duplicatus_clouds.png", VARIETY_URL("duplicatus"), "Michael Bruhn / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "castellanus", { varieties: ["duplicatus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "diffuse-humid"], perspectiveIds: ["oblique-natural", "distant-telephoto", "zenith-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("separate-levels", "Two or more finite cloud populations occupy slightly different physical levels and may partly merge.", "repeated-stamp", "wrong-relative-placement"),
            cue("independent-parallax", "Layer separation produces real parallax and overlap instead of a duplicated screen-space texture.", "screen-space-mask", "wrong-scale-hierarchy"),
            cue("overlap-transport", "Overlaps accumulate extinction and colored light transport continuously through both layers.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-translucidus", axis: "variety", designation: "translucidus", label: "Altocumulus translucidus",
        reference: wmoReference(5172, "altocumulus-stratiformis-translucidus-perlucidus-undulatus_clouds.jpg", "https://cloudatlas.wmo.int/en/varieties-altocumulus-translucidus-ac-tr.html", "George Anderson / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "stratiformis", { varieties: ["translucidus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-moonlight"], perspectiveIds: ["oblique-natural", "zenith-wide", "horizon-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("source-position-visible", "The Sun or Moon position remains visible diffusely through most of the cloud without a cut-out disc.", "screen-space-mask", "lighting-discontinuity"),
            cue("variable-optical-depth", "Transmission varies with real condensate path length while the genus structure remains readable.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("forward-scattering-color", "Source-facing glow and transmitted sky color follow phase, aerosol and path geometry.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-perlucidus", axis: "variety", designation: "perlucidus", label: "Altocumulus perlucidus",
        reference: wmoReference(5168, "altocumulus-stratiformis-translucidus-perlucidus-undulatus_clouds.JPG", "https://cloudatlas.wmo.int/en/varieties-altocumulus-perlucidus-ac-pe.html", "Frank Le Blancq / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "stratiformis", { varieties: ["perlucidus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-moonlight"], perspectiveIds: ["zenith-wide", "oblique-natural", "horizon-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("real-interstices", "Blue sky or overlying light is seen through distinct clear spaces between condensate elements.", "screen-space-mask", "lighting-discontinuity"),
            cue("nonuniform-gaps", "Interstices vary naturally in size and edge shape without forming a regular perforation grid.", "fake-grid", "repeated-stamp"),
            cue("element-depth", "Cloud elements keep real side shading and optical thickness adjacent to open sky.", "boundary-clipping", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "variety-opacus", axis: "variety", designation: "opacus", label: "Altocumulus opacus",
        reference: wmoReference(5653, "altocumulus-stratiformis-opacus-undulatus_clouds.jpg", VARIETY_URL("opacus"), "Markéta Augustinová / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "stratiformis", { varieties: ["opacus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "diffuse-humid"], perspectiveIds: ["oblique-natural", "zenith-wide", "horizon-wide"], coverageIds: ["extensive", "overcast"],
        cues: [
            cue("luminary-occlusion", "The dense majority truly extinguishes the Sun or Moon while thin margins transition continuously.", "screen-space-mask", "lighting-discontinuity"),
            cue("deep-sheet-variation", "Opaque regions retain internal depth and low-frequency structure instead of one flat grey fill.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("sky-colored-shadow", "Shadow color responds to sky irradiance, aerosol and neighboring gaps without black clipping.", "boundary-clipping", "atmosphere-color-mismatch"),
        ],
    }),
];

const supplementaryTargets: MorphologyPhotographTarget[] = [
    target({
        id: "feature-incus", axis: "supplementary-feature", designation: "incus", label: "Cumulonimbus incus",
        reference: wmoReference(4775, "cumulonimbus-capillatus-praecipitatio-incus-mamma-praecipitatio_clouds.jpg", FEATURE_URL("incus"), "Mustafa Hayri Ayvaz / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { supplementaryFeatures: ["incus"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "clean-twilight"], perspectiveIds: ["distant-telephoto", "oblique-natural", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("storm-owned-anvil", "The fibrous anvil grows continuously from the glaciated tower and shares its advecting storm owner.", "detached-owner-feature", "wrong-relative-placement"),
            cue("asymmetric-outflow", "Outflow spreads preferentially downshear with a finite irregular perimeter, not a centered disc stamp.", "repeated-stamp", "screen-space-mask"),
            cue("liquid-ice-light", "Tower, transition and anvil show continuous but material-dependent illumination and color.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-mamma", axis: "supplementary-feature", designation: "mamma", label: "Cumulonimbus mamma",
        reference: wmoReference(4767, "cumulonimbus-capillatus-incus-mamma_clouds.JPG", FEATURE_URL("mamma"), "Gary Salisbury / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { supplementaryFeatures: ["mamma"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "clean-twilight"], perspectiveIds: ["near-uplook", "oblique-natural", "distant-telephoto"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("anvil-underside-attachment", "Unequal pendant lobes remain attached to the anvil underside and inherit its motion and material.", "detached-owner-feature", "wrong-relative-placement"),
            cue("lobe-population", "Lobe radius, sag, spacing and merger vary across the underside without a bead grid.", "fake-grid", "repeated-stamp"),
            cue("underside-transport", "Soft interreflection and shadow deepen toward lobe roots without dark outlines or luminous stamps.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-arcus", axis: "supplementary-feature", designation: "arcus", label: "Cumulonimbus arcus",
        reference: wmoReference(5050, "cumulonimbus-with-arcus_clouds-hydrometeors.jpg", FEATURE_URL("arcus"), "Petter Hjulstad / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { supplementaryFeatures: ["arcus"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "diffuse-humid"], perspectiveIds: ["horizon-wide", "oblique-natural", "distant-telephoto"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("gust-front-arc", "A finite wedge/roll follows the precipitation-driven outflow boundary ahead of its parent storm.", "detached-owner-feature", "wrong-relative-placement"),
            cue("finite-leading-edge", "The shelf has turbulent, evolving depth and an irregular terminus rather than a horizon-wide alpha band.", "screen-space-mask", "boundary-clipping"),
            cue("outflow-light", "Dense leading structure self-shadows and couples to rain-cooled haze without uniform whitening.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-tuba", axis: "supplementary-feature", designation: "tuba", label: "Cumulonimbus tuba",
        reference: wmoReference(5189, "tornado-image-1_clouds-hydrometeors-special-clouds-and-other-features.JPG", FEATURE_URL("tuba"), "Matthew Clark / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "calvus", { supplementaryFeatures: ["tuba"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "diffuse-humid"], perspectiveIds: ["distant-telephoto", "oblique-natural", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("rotating-base-origin", "The tapered cone/column originates from a localized rotating storm base, not empty sky.", "detached-owner-feature", "wrong-relative-placement"),
            cue("taper-and-curvature", "Radius, opacity and axis evolve continuously with height without a perfect cone primitive.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("condensate-continuity", "The funnel shares storm-base illumination and extinction with no seam at attachment.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-asperitas", axis: "supplementary-feature", designation: "asperitas", label: "Altocumulus asperitas",
        reference: wmoReference(5858, "altocumulus-stratiformis-opacus-asperitas_clouds.jpg", FEATURE_URL("asperitas"), "Gary McArthur / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "stratiformis", { supplementaryFeatures: ["asperitas"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "diffuse-humid"], perspectiveIds: ["zenith-wide", "near-uplook", "oblique-natural"], coverageIds: ["broken", "extensive", "overcast"],
        cues: [
            cue("chaotic-undulation", "A coherent layer develops strongly localized, nonperiodic underside waves with multiple interacting scales.", "fake-grid", "repeated-stamp"),
            cue("volume-not-normal-map", "Troughs and ridges alter true path length, parallax and occlusion rather than only surface shading.", "screen-space-mask", "wrong-scale-hierarchy"),
            cue("dramatic-soft-light", "Dark relief remains sky-colored with smooth multiple-scattering transitions and no crushed graphic grooves.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-fluctus", axis: "supplementary-feature", designation: "fluctus", label: "Stratocumulus fluctus",
        reference: wmoReference(5166, "stratocumulus-fluctus_clouds-special-clouds-and-other-features.jpg", FEATURE_URL("fluctus"), "June Grønseth / WMO International Cloud Atlas"),
        classification: classify("stratocumulus", "stratiformis", { supplementaryFeatures: ["fluctus"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "humid-marine-side"], perspectiveIds: ["oblique-natural", "distant-telephoto", "horizon-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("breaking-kh-waves", "A short train of asymmetric Kelvin–Helmholtz curls grows, overturns and decays along one shear layer.", "fake-grid", "repeated-stamp"),
            cue("parent-shear-attachment", "Wave bases remain embedded in the parent cloud top with consistent wind/shear orientation.", "detached-owner-feature", "wrong-relative-placement"),
            cue("curl-depth", "Crests occlude and self-shadow as volumes; backlight reveals thin overturning lips without halos painted on edges.", "screen-space-mask", "lighting-discontinuity"),
        ],
    }),
    target({
        id: "feature-cavum", axis: "supplementary-feature", designation: "cavum", label: "Altocumulus cavum",
        reference: wmoReference(5167, "altocumulus-stratiformis-perlucidus-translucidus-cavum_clouds-special-clouds-and-other-features.jpg", FEATURE_URL("cavum"), "Tsz Cheung Lee / WMO International Cloud Atlas"),
        classification: classify("altocumulus", "stratiformis", { supplementaryFeatures: ["cavum"] }),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["zenith-wide", "oblique-natural", "horizon-wide"], coverageIds: ["broken", "extensive"],
        cues: [
            cue("subtractive-hole", "The opening removes condensate through layer depth and exposes the physically rendered sky behind it.", "screen-space-mask", "lighting-discontinuity"),
            cue("eccentric-growth-rim", "The hole is eccentric and evolving, with an irregular glaciated rim and possible central fallstreak.", "repeated-stamp", "fake-grid"),
            cue("rim-transport", "Rim brightness arises from material/path geometry and source direction, not a circular edge effect.", "boundary-clipping", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-murus", axis: "supplementary-feature", designation: "murus", label: "Cumulonimbus murus",
        reference: wmoReference(5566, "cumulonimbus-praecipitatio-murus-flumen_clouds-special-clouds-and-other-features.JPG", FEATURE_URL("murus"), "Eric Van Lochem / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { supplementaryFeatures: ["murus"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "diffuse-humid"], perspectiveIds: ["distant-telephoto", "oblique-natural", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("rain-free-base-wall", "A localized lowering remains attached beneath the rain-free updraft base beside—not inside—the precipitation core.", "detached-owner-feature", "wrong-relative-placement"),
            cue("storm-scale", "Wall width and depth scale with its supercell owner and never appear as a generic low-cloud stamp.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("base-lighting", "Murus and parent base share continuous shadow/aerial color while retaining readable relief.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "feature-cauda", axis: "supplementary-feature", designation: "cauda", label: "Cumulonimbus cauda",
        reference: wmoReference(4959, "cumulonimbus-capillatus-praecipitatio-murus-cauda-flumen-tuba_clouds-hydrometeors-special-clouds-and-other-features.jpg", FEATURE_URL("cauda"), "Steve Willington / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { supplementaryFeatures: ["murus", "cauda"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "diffuse-humid"], perspectiveIds: ["horizon-wide", "distant-telephoto", "oblique-natural"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("precipitation-to-wall-tail", "A low horizontal tail connects the precipitation cascade region to murus with inflow directed toward the wall.", "detached-owner-feature", "wrong-relative-placement"),
            cue("finite-inflow-shape", "The tail varies in depth and opacity along a finite curved path rather than a constant tube or line.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("shared-storm-air", "Cauda, rain haze, murus and base compose through one atmosphere with no color or opacity seams.", "screen-space-mask", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
];

const accessoryTargets: MorphologyPhotographTarget[] = [
    target({
        id: "accessory-pileus", axis: "accessory-cloud", designation: "pileus", label: "Cumulonimbus pileus",
        reference: wmoReference(4770, "cumulonimbus-calvus-pileus_clouds.JPG", ACCESSORY_URL("pileus"), "Sylke Boyd / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "calvus", { accessoryClouds: ["pileus"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "clean-twilight"], perspectiveIds: ["distant-telephoto", "oblique-natural", "near-uplook"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("cap-above-turret", "A thin smooth cap sits immediately above or attaches to one rapidly rising turret, which may penetrate it.", "detached-owner-feature", "wrong-relative-placement"),
            cue("finite-short-lived-cap", "Pileus scale follows the active turret and can stack irregularly without repeating a lens asset.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("thin-liquid-optics", "The translucent cap responds to source angle and underlying tower shadow with no pasted bright ellipse.", "screen-space-mask", "lighting-discontinuity"),
        ],
    }),
    target({
        id: "accessory-velum", axis: "accessory-cloud", designation: "velum", label: "Cumulonimbus velum",
        reference: wmoReference(5991, "cumulonimbus-capillatus-incus-velum_clouds.jpg", ACCESSORY_URL("velum"), "Petr Hykš / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { accessoryClouds: ["velum"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "clean-twilight"], perspectiveIds: ["distant-telephoto", "oblique-natural", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("broad-storm-veil", "A broad thin veil lies close above or attaches to one or several rising towers which can pierce it.", "detached-owner-feature", "wrong-relative-placement"),
            cue("veil-versus-anvil", "Velum stays smooth, liquid/mixed and parent-relative rather than becoming a fibrous detached anvil.", "wrong-scale-hierarchy", "repeated-stamp"),
            cue("layered-transport", "Tower occlusion and veil transmission combine in depth without a compositing seam.", "screen-space-mask", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "accessory-pannus", axis: "accessory-cloud", designation: "pannus", label: "Altostratus pannus",
        reference: wmoReference(5867, "altostratus-opacus-pannus-nimbostratomutatus_clouds.JPG", ACCESSORY_URL("pannus"), "Michael Bruhn / WMO International Cloud Atlas"),
        classification: classify("altostratus", "opacus", { accessoryClouds: ["pannus"] }),
        environmentIds: ["diffuse-humid", "humid-marine-side", "golden-backlight"], perspectiveIds: ["horizon-wide", "oblique-natural", "near-uplook"], coverageIds: ["broken", "extensive", "overcast"],
        cues: [
            cue("ragged-below-deck", "Independent ragged shreds form below a saturated precipitating layer and sometimes partly merge into it.", "detached-owner-feature", "wrong-relative-placement"),
            cue("scud-population", "Fragments vary in scale, density and lifetime without ovals, a puff grid or a whitening mask.", "fake-grid", "repeated-stamp", "screen-space-mask"),
            cue("wet-aerial-color", "Low fragments inherit wet diffuse illumination and aerial perspective while remaining volumetric.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "accessory-flumen", axis: "accessory-cloud", designation: "flumen", label: "Cumulonimbus flumen",
        reference: wmoReference(4959, "cumulonimbus-capillatus-praecipitatio-murus-cauda-flumen-tuba_clouds-hydrometeors-special-clouds-and-other-features.jpg", ACCESSORY_URL("flumen"), "Steve Willington / WMO International Cloud Atlas"),
        classification: classify("cumulonimbus", "capillatus", { accessoryClouds: ["flumen"] }),
        environmentIds: ["tropical-storm-side", "tropical-storm-backlight", "diffuse-humid"], perspectiveIds: ["horizon-wide", "distant-telephoto", "oblique-natural"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("inflow-band", "A finite low cloud band feeds the supercell updraft with motion toward—but base detached from—the storm.", "detached-owner-feature", "wrong-relative-placement"),
            cue("mesoscale-path", "Width, gaps and orientation vary along the inflow path without a straight repeated ribbon.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("distance-lighting", "The remote band follows atmospheric extinction and storm shadow continuously across its length.", "screen-space-mask", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
];

const upperBase = classify("cirrus", "fibratus");
const upperTargets: MorphologyPhotographTarget[] = [
    target({
        id: "upper-polar-stratospheric", axis: "upper-atmospheric", designation: "polar-stratospheric-sts", label: "PSC Type Ib supercooled ternary solution",
        reference: wmoReference(6046, "polar-stratospheric-cloud-nitric-acid-and-water_special-clouds-and-other-features.jpg", "https://cloudatlas.wmo.int/en/nitric-acid-and-water-polar-stratospheric-clouds.html", "Kevin Boyle / WMO International Cloud Atlas"),
        classification: upperBase,
        environmentIds: ["polar-winter-twilight", "polar-winter-grazing", "polar-winter-moon"], perspectiveIds: ["horizon-wide", "oblique-natural", "distant-telephoto"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("stratospheric-wave-layer", "Thin finite wave clouds occupy 15–30 km and remain clearly above all tropospheric haze/cloud.", "wrong-relative-placement", "wrong-scale-hierarchy"),
            cue("irregular-finite-patches", "Wave packets vary and terminate physically without a global band, grid or stamp.", "fake-grid", "repeated-stamp", "screen-space-mask"),
            cue("polar-light-coupling", "Brightness and restrained color follow the grazing source through a dark lower atmosphere.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }, "polar-stratospheric-sts"),
    target({
        id: "upper-nacreous", axis: "upper-atmospheric", designation: "nacreous", label: "Nacreous ice PSC",
        reference: wmoReference(4907, "polar-stratospheric-clouds-nacreous_others-special-clouds-and-other-features.jpg", "https://cloudatlas.wmo.int/en/nacreous-clouds.html", "Albert de Nijs / WMO International Cloud Atlas"),
        classification: upperBase,
        environmentIds: ["polar-winter-twilight", "polar-winter-grazing", "polar-winter-moon"], perspectiveIds: ["horizon-wide", "distant-telephoto", "oblique-natural"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("stationary-wave-ice", "Very thin nacreous wave lenses remain at 15–30 km with finite, non-repeated crests.", "fake-grid", "repeated-stamp", "wrong-relative-placement"),
            cue("view-source-iridescence", "Mother-of-pearl color varies with view/source angle and particle path, not UV coordinates or cloud alpha.", "screen-space-mask", "atmosphere-color-mismatch"),
            cue("twilight-ordering", "Sunlit PSC radiance is transported through the real stratosphere above a darker troposphere and fades physically in moonlight.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }, "nacreous"),
    target({
        id: "upper-noctilucent", axis: "upper-atmospheric", designation: "noctilucent", label: "Noctilucent cloud",
        reference: wmoReference(5581, "noctilucent-cloud_special-clouds-and-other-features.JPG", "https://cloudatlas.wmo.int/en/noctilucent-clouds.html", "Ewan Kane / WMO International Cloud Atlas"),
        classification: upperBase,
        environmentIds: ["polar-summer-civil", "polar-summer-nautical", "polar-summer-deep"], perspectiveIds: ["horizon-wide", "oblique-natural", "distant-telephoto"], coverageIds: ["sparse", "broken", "extensive"],
        cues: [
            cue("mesopause-altitude", "Fine ice structure sits near 80–85 km and remains sunlit above a dark lower atmosphere.", "wrong-relative-placement", "wrong-scale-hierarchy"),
            cue("multi-scale-wave-mesh", "Bands, billows and knots form an aperiodic multi-scale field, never tropospheric cirrus or a repeated noise grid.", "fake-grid", "repeated-stamp"),
            cue("twilight-evolution", "Contrast and blue-silver color evolve correctly across 6–16° solar depression without a luminous overlay.", "screen-space-mask", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }, "noctilucent"),
];

const exteriorTargets: MorphologyPhotographTarget[] = [
    target({
        id: "exterior-liquid-convection", axis: "exterior-boundary", designation: "liquid-convection", label: "Liquid cauliflower and turret exterior",
        reference: wmoReference(3875, "cumulus-congestus-with-precipitation_clouds.JPG", "https://cloudatlas.wmo.int/en/species-cumulus-congestus-cu-con.html", "Matthew Clark / WMO International Cloud Atlas"),
        classification: classify("cumulus", "congestus"),
        environmentIds: ["clean-side-day", "golden-backlight", "humid-marine-side"], perspectiveIds: ["oblique-natural", "distant-telephoto", "near-uplook"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("nested-cauli-boundary", "Successive buoyant lobes carry smaller lobes, clefts and entrainment bites without smooth oval shells.", "repeated-stamp", "wrong-scale-hierarchy"),
            cue("protected-connected-core", "Deep liquid cores remain connected while shallow/dilute edges erode into real negative space.", "screen-space-mask", "boundary-clipping"),
            cue("silver-edge-depth", "Backlit edges arise from finite path and multiple scattering with no fixed rim or storage-face cut.", "lighting-discontinuity", "atmosphere-color-mismatch", "boundary-clipping"),
        ],
    }),
    target({
        id: "exterior-stratiform-scud", axis: "exterior-boundary", designation: "stratiform-scud", label: "Stratiform and scud exterior",
        reference: wmoReference(4968, "mist-with-stratus-forming-upslope-fog_clouds-hydrometeors.JPG", "https://cloudatlas.wmo.int/en/species-stratus-fractus-st-fra.html", "Kwok Fai Chiang / WMO International Cloud Atlas"),
        classification: classify("stratus", "fractus"),
        environmentIds: ["humid-marine-side", "diffuse-humid", "golden-backlight"], perspectiveIds: ["horizon-wide", "oblique-natural", "near-uplook"], coverageIds: ["broken", "extensive", "overcast"],
        cues: [
            cue("ragged-formation-boundary", "Dry-air scallops, torn shreds and finite frontal edges are generated as condensate topology, not faded masks.", "screen-space-mask", "boundary-clipping"),
            cue("no-oval-scud", "Scud has concave, advected, merging fragments rather than smooth capsules or a puff grid.", "fake-grid", "repeated-stamp"),
            cue("soft-wet-light", "Low wet-air contrast blends through atmosphere while retaining real depth and protected deck bases.", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
    target({
        id: "exterior-ice-fibre", axis: "exterior-boundary", designation: "ice-fibre", label: "Ice fibre and sedimentation exterior",
        reference: wmoReference(4321, "cirrus-uncinus-and-cirrus-fibratus_clouds.jpg", "https://cloudatlas.wmo.int/en/clouds-species-uncinus.html", "Stephen Burt / WMO International Cloud Atlas"),
        classification: classify("cirrus", "uncinus"),
        environmentIds: ["clean-side-day", "golden-backlight", "clean-twilight"], perspectiveIds: ["oblique-natural", "distant-telephoto", "horizon-wide"], coverageIds: ["sparse", "broken"],
        cues: [
            cue("sheared-fibres", "Long anisotropic fibres split, taper and curve with the wind field without parallel line stamps.", "fake-grid", "repeated-stamp"),
            cue("sedimentation-taper", "Fallstreaks remain attached to generators and narrow/fade through physical sedimentation and sublimation.", "detached-owner-feature", "boundary-clipping"),
            cue("thin-ice-radiance", "Translucent ice inherits atmosphere/source color continuously and never becomes opaque cotton or white overlay.", "screen-space-mask", "lighting-discontinuity", "atmosphere-color-mismatch"),
        ],
    }),
];

export const CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS: readonly MorphologyPhotographTarget[] = [
    ...varietyTargets,
    ...supplementaryTargets,
    ...accessoryTargets,
    ...upperTargets,
    ...exteriorTargets,
] as const;

export const CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS = [
    "variety-lacunosus",
    "feature-mamma",
    "feature-cavum",
    "accessory-pileus",
    "upper-nacreous",
    "exterior-liquid-convection",
    "exterior-stratiform-scud",
    "exterior-ice-fibre",
] as const;

const targetById = new Map(CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((entry) => [entry.id, entry]));
const environmentById = new Map(MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS.map((entry) => [entry.id, entry]));
const perspectiveById = new Map(MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES.map((entry) => [entry.id, entry]));
const coverageById = new Map<string, MorphologyPhotographCoverage>(
    MORPHOLOGY_PHOTOGRAPH_COVERAGES.map((entry) => [entry.id, entry]),
);

export const cloudMorphologyPhotographCaseId = ({
    targetId,
    environmentId,
    perspectiveId,
    coverageId,
}: {
    targetId: string;
    environmentId: string;
    perspectiveId: string;
    coverageId: MorphologyPhotographCoverage["id"] | string;
}) => `${targetId}--${environmentId}--${perspectiveId}--${coverageId}`;

/**
 * Resolve one URL-selected case without advancing or materializing the full
 * Cartesian qualification matrix. Invalid or target-incompatible dimensions
 * return undefined so an unrecognized URL can fall back to the original
 * base-species benchmark unchanged.
 */
export const resolveCloudMorphologyPhotographCase = (
    caseId: string | null | undefined,
): MorphologyPhotographCase | undefined => {
    if (!caseId) return undefined;
    const [targetId, environmentId, perspectiveId, coverageId, ...remainder] =
        caseId.split("--");
    if (remainder.length > 0 || !targetId || !environmentId ||
        !perspectiveId || !coverageId) return undefined;
    const selectedTarget = targetById.get(targetId);
    const selectedEnvironment = environmentById.get(environmentId);
    const selectedPerspective = perspectiveById.get(perspectiveId);
    const selectedCoverage = coverageById.get(coverageId);
    if (!selectedTarget || !selectedEnvironment || !selectedPerspective ||
        !selectedCoverage ||
        !selectedTarget.environmentIds.includes(environmentId) ||
        !selectedTarget.perspectiveIds.includes(perspectiveId) ||
        !selectedTarget.coverageIds.includes(selectedCoverage.id)) {
        return undefined;
    }
    return {
        id: cloudMorphologyPhotographCaseId({
            targetId,
            environmentId,
            perspectiveId,
            coverageId,
        }),
        target: selectedTarget,
        reference: selectedTarget.reference,
        environment: selectedEnvironment,
        perspective: selectedPerspective,
        coverage: selectedCoverage,
        classifications: [selectedTarget.assignment],
    };
};

export function* iterateCloudMorphologyPhotographCases({
    targetIds,
    smokeOnly = false,
}: {
    targetIds?: readonly string[];
    smokeOnly?: boolean;
} = {}): Generator<MorphologyPhotographCase> {
    const selectedIds = targetIds ?? (smokeOnly
        ? CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS
        : CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((entry) => entry.id));
    for (const targetId of selectedIds) {
        const selectedTarget = targetById.get(targetId);
        if (!selectedTarget) throw new Error(`Unknown morphology photograph target: ${targetId}`);
        const environmentIds = smokeOnly
            ? selectedTarget.environmentIds.slice(0, 1)
            : selectedTarget.environmentIds;
        const perspectiveIds = smokeOnly
            ? selectedTarget.perspectiveIds.slice(0, 1)
            : selectedTarget.perspectiveIds;
        const coverageIds = smokeOnly
            ? selectedTarget.coverageIds.slice(0, 1)
            : selectedTarget.coverageIds;
        for (const environmentId of environmentIds) {
            const selectedEnvironment = environmentById.get(environmentId);
            if (!selectedEnvironment) throw new Error(`Unknown morphology photograph environment: ${environmentId}`);
            for (const perspectiveId of perspectiveIds) {
                const selectedPerspective = perspectiveById.get(perspectiveId);
                if (!selectedPerspective) throw new Error(`Unknown morphology photograph perspective: ${perspectiveId}`);
                for (const coverageId of coverageIds) {
                    const selectedCoverage = coverageById.get(coverageId);
                    if (!selectedCoverage) throw new Error(`Unknown morphology photograph coverage: ${coverageId}`);
                    yield {
                        id: cloudMorphologyPhotographCaseId({
                            targetId,
                            environmentId,
                            perspectiveId,
                            coverageId,
                        }),
                        target: selectedTarget,
                        reference: selectedTarget.reference,
                        environment: selectedEnvironment,
                        perspective: selectedPerspective,
                        coverage: selectedCoverage,
                        classifications: [selectedTarget.assignment],
                    };
                }
            }
        }
    }
}

export const iterateCloudMorphologyPhotographSmokeCases = () =>
    iterateCloudMorphologyPhotographCases({ smokeOnly: true });

/**
 * Small adapter for the existing CloudScene classification path. The caller
 * remains responsible for constructing the target's base genus/species layer;
 * `rendererSpecies` below tells the existing benchmark which recipe to use.
 */
export const applyMorphologyPhotographCaseToScene = (
    scene: CloudScene,
    qualificationCase: MorphologyPhotographCase,
): CloudScene => {
    const layerIndex = qualificationCase.target.assignment.layerIndex;
    const coverage = qualificationCase.coverage.oktas / 8;
    const layers = scene.layers.map((layer, index) => index === layerIndex ? {
        ...layer,
        present: true,
        oktas: qualificationCase.coverage.oktas,
        coverage,
    } : { ...layer }) as CloudScene["layers"];
    return {
        ...scene,
        layers,
        totalOktas: qualificationCase.coverage.oktas,
        noctilucent: qualificationCase.target.designation === "noctilucent"
            ? 0.82 : scene.noctilucent,
        classifications: qualificationCase.classifications,
        latitude: qualificationCase.environment.latitude,
        season: qualificationCase.environment.season,
        solarDepression: Math.max(
            0,
            -qualificationCase.environment.solarElevationDegrees,
        ),
    };
};

export const morphologyPhotographRendererSpecies = (
    targetId: string,
) => {
    const selectedTarget = targetById.get(targetId);
    if (!selectedTarget) throw new Error(`Unknown morphology photograph target: ${targetId}`);
    return rendererSpeciesForPhotographClassification(selectedTarget.classification);
};

export const CLOUD_MORPHOLOGY_PHOTOGRAPH_SUMMARY = {
    targets: CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.length,
    varieties: varietyTargets.length,
    supplementaryFeatures: supplementaryTargets.length,
    accessories: accessoryTargets.length,
    upperAtmospheric: upperTargets.length,
    exteriorBoundaries: exteriorTargets.length,
    smokeTargets: CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS.length,
};

/**
 * Meteorological cloud state.
 *
 * The renderer is driven by a physically constrained scene rather than a scalar
 * density. Coverage is expressed in WMO oktas, morphology by genus, and each of
 * the three layers (low, middle, high) carries its own altitude, wind, shear,
 * and phase composition. A constraint pass rejects impossible combinations, so
 * a deterministic daily seed cannot produce a towered nimbostratus or a
 * cumulonimbus without deep convection.
 *
 * Classification follows the WMO International Cloud Atlas ten genera.
 * @see https://cloudatlas.wmo.int/en/clouds-genera.html
 */

import type { CloudMorphologyClassificationAssignment } from
    "./cloud-morphology-modifiers";
import type { CloudClassification } from "./cloud-state-map";
import type { CloudSpecialOriginSource } from "./cloud-special-origin-source";

export type CloudGenus =
    | "clear"
    // High: ice, 5-13 km temperate
    | "cirrus"
    | "cirrocumulus"
    | "cirrostratus"
    // Middle: mixed phase, 2-7 km temperate
    | "altocumulus"
    | "altostratus"
    | "nimbostratus"
    // Low: water, surface-2 km
    | "stratocumulus"
    | "stratus"
    | "cumulus"
    | "cumulonimbus";

export type CloudLevel = "low" | "middle" | "high";

/**
 * Morphologically distinct WMO species represented by the volume renderer.
 * The genus prefix is intentional: names such as fibratus, stratiformis and
 * castellanus recur at different levels but have different physical scale,
 * phase and optical structure.
 */
export type CloudSpecies =
    | "generic"
    | "cirrus-fibratus"
    | "cirrus-uncinus"
    | "cirrus-spissatus"
    | "cirrus-castellanus"
    | "cirrus-floccus"
    | "cirrocumulus-stratiformis"
    | "cirrocumulus-lenticularis"
    | "cirrocumulus-castellanus"
    | "cirrocumulus-floccus"
    | "cirrostratus-fibratus"
    | "cirrostratus-nebulosus"
    | "altocumulus-stratiformis"
    | "altocumulus-lenticularis"
    | "altocumulus-castellanus"
    | "altocumulus-floccus"
    | "altocumulus-volutus"
    | "altostratus-opacus"
    | "nimbostratus-praecipitatio"
    | "stratocumulus-stratiformis"
    | "stratocumulus-lenticularis"
    | "stratocumulus-castellanus"
    | "stratocumulus-floccus"
    | "stratocumulus-volutus"
    | "stratus-nebulosus"
    | "stratus-fractus"
    | "cumulus-humilis"
    | "cumulus-mediocris"
    | "cumulus-congestus"
    | "cumulus-fractus"
    | "cumulonimbus-calvus"
    | "cumulonimbus-capillatus"
    | "cumulonimbus-capillatus-incus";

export const CLOUD_SPECIES_CODE: Record<CloudSpecies, number> = {
    generic: 0,
    "cirrus-fibratus": 1,
    "cirrus-uncinus": 2,
    "cirrus-spissatus": 3,
    "cirrocumulus-stratiformis": 4,
    "cirrocumulus-castellanus": 5,
    "cirrostratus-fibratus": 6,
    "cirrostratus-nebulosus": 7,
    "altocumulus-stratiformis": 8,
    "altocumulus-lenticularis": 9,
    "altocumulus-castellanus": 10,
    "altostratus-opacus": 11,
    "nimbostratus-praecipitatio": 12,
    "stratocumulus-stratiformis": 13,
    "stratocumulus-volutus": 14,
    "stratus-nebulosus": 15,
    "stratus-fractus": 16,
    "cumulus-humilis": 17,
    "cumulus-mediocris": 18,
    "cumulus-congestus": 19,
    "cumulonimbus-calvus": 20,
    "cumulonimbus-capillatus-incus": 21,
    "cirrus-castellanus": 22,
    "cirrus-floccus": 23,
    "cirrocumulus-lenticularis": 24,
    "cirrocumulus-floccus": 25,
    "altocumulus-floccus": 26,
    "altocumulus-volutus": 27,
    "stratocumulus-lenticularis": 28,
    "stratocumulus-castellanus": 29,
    "stratocumulus-floccus": 30,
    "cumulus-fractus": 31,
    "cumulonimbus-capillatus": 32,
};

/** Canonical owner genus for every renderer species key. */
export const CLOUD_SPECIES_GENUS: Record<
    Exclude<CloudSpecies, "generic">,
    Exclude<CloudGenus, "clear">
> = {
    "cirrus-fibratus": "cirrus",
    "cirrus-uncinus": "cirrus",
    "cirrus-spissatus": "cirrus",
    "cirrus-castellanus": "cirrus",
    "cirrus-floccus": "cirrus",
    "cirrocumulus-stratiformis": "cirrocumulus",
    "cirrocumulus-lenticularis": "cirrocumulus",
    "cirrocumulus-castellanus": "cirrocumulus",
    "cirrocumulus-floccus": "cirrocumulus",
    "cirrostratus-fibratus": "cirrostratus",
    "cirrostratus-nebulosus": "cirrostratus",
    "altocumulus-stratiformis": "altocumulus",
    "altocumulus-lenticularis": "altocumulus",
    "altocumulus-castellanus": "altocumulus",
    "altocumulus-floccus": "altocumulus",
    "altocumulus-volutus": "altocumulus",
    "altostratus-opacus": "altostratus",
    "nimbostratus-praecipitatio": "nimbostratus",
    "stratocumulus-stratiformis": "stratocumulus",
    "stratocumulus-lenticularis": "stratocumulus",
    "stratocumulus-castellanus": "stratocumulus",
    "stratocumulus-floccus": "stratocumulus",
    "stratocumulus-volutus": "stratocumulus",
    "stratus-nebulosus": "stratus",
    "stratus-fractus": "stratus",
    "cumulus-humilis": "cumulus",
    "cumulus-mediocris": "cumulus",
    "cumulus-congestus": "cumulus",
    "cumulus-fractus": "cumulus",
    "cumulonimbus-calvus": "cumulonimbus",
    "cumulonimbus-capillatus": "cumulonimbus",
    "cumulonimbus-capillatus-incus": "cumulonimbus",
};

/** The complete mutually-exclusive genus/species combinations in WMO 407. */
export const WMO_CLOUD_SPECIES: readonly CloudSpecies[] = [
    "cirrus-fibratus", "cirrus-uncinus", "cirrus-spissatus",
    "cirrus-castellanus", "cirrus-floccus",
    "cirrocumulus-stratiformis", "cirrocumulus-lenticularis",
    "cirrocumulus-castellanus", "cirrocumulus-floccus",
    "cirrostratus-fibratus", "cirrostratus-nebulosus",
    "altocumulus-stratiformis", "altocumulus-lenticularis",
    "altocumulus-castellanus", "altocumulus-floccus",
    "altocumulus-volutus",
    "stratocumulus-stratiformis", "stratocumulus-lenticularis",
    "stratocumulus-castellanus", "stratocumulus-floccus",
    "stratocumulus-volutus",
    "stratus-nebulosus", "stratus-fractus",
    "cumulus-humilis", "cumulus-mediocris", "cumulus-congestus",
    "cumulus-fractus",
    "cumulonimbus-calvus", "cumulonimbus-capillatus",
] as const;

export type CloudOrganization =
    | "unorganized"
    | "isolated"
    | "streets"
    | "open-cell"
    | "closed-cell"
    | "frontal"
    | "banded";

export const CLOUD_GENERA: CloudGenus[] = [
    "clear",
    "cirrus",
    "cirrocumulus",
    "cirrostratus",
    "altocumulus",
    "altostratus",
    "nimbostratus",
    "stratocumulus",
    "stratus",
    "cumulus",
    "cumulonimbus",
];

/** Numeric codes handed to the shader. Order must match `CLOUD_GENERA`. */
export const CLOUD_GENUS_CODE: Record<CloudGenus, number> = {
    clear: 0,
    cirrus: 1,
    cirrocumulus: 2,
    cirrostratus: 3,
    altocumulus: 4,
    altostratus: 5,
    nimbostratus: 6,
    stratocumulus: 7,
    stratus: 8,
    cumulus: 9,
    cumulonimbus: 10,
};

export const CLOUD_GENUS_LEVEL: Record<CloudGenus, CloudLevel> = {
    clear: "low",
    cirrus: "high",
    cirrocumulus: "high",
    cirrostratus: "high",
    altocumulus: "middle",
    altostratus: "middle",
    nimbostratus: "middle",
    stratocumulus: "low",
    stratus: "low",
    cumulus: "low",
    cumulonimbus: "low",
};

export interface CloudLayerState {
    genus: CloudGenus;
    /** Explicit WMO morphology; `generic` is used by unconstrained daily skies. */
    species: CloudSpecies;
    present: boolean;
    /** Cloud-base altitude above mean surface datum, metres. */
    baseAltitude: number;
    /** Geometric depth of the layer, metres. */
    thickness: number;
    /** Sky fraction hidden by this layer, 0-1, derived from oktas. */
    coverage: number;
    /** WMO coverage in eighths, 0-8. */
    oktas: number;
    /** Extinction scale: transparent veil through opaque deck. */
    opticalDepth: number;
    /** 0 fully cumuliform, 1 fully stratiform. */
    stratusBlend: number;
    /** Convective vertical development, 0-1. */
    towerAmount: number;
    /** Anvil spreading at the tropopause, 0-1. */
    anvilAmount: number;
    /** 0 liquid droplets, 1 ice crystals. Drives the phase function. */
    iceFraction: number;
    /** Worley erosion strength on cloud edges. */
    detailStrength: number;
    /** Metres per second. */
    windSpeed: number;
    /** Radians, meteorological convention. */
    windDirection: number;
    /** Directional shear across the layer's depth. */
    shear: number;
    /** Curl deformation strength at edges. */
    turbulence: number;
    /** 0-1; drives virga and rain-shaft darkening. */
    precipitation: number;
    /** Mesoscale layout of the layer, not merely its local texture. */
    organization: CloudOrganization;
    /** Convective/advective lifecycle: 0 growing, 0.5 mature, 1 dissipating. */
    lifecycle: number;
    /** Strength of organization and clustering, 0-1. */
    organizationStrength: number;
}

export type CloudLayerIndex = 0 | 1 | 2;

/**
 * Persistent finite world domain for one explicitly authored cloud system.
 *
 * This is meteorological state, not a camera composition primitive.  The
 * Earth-local east/north frame is shared by the generic runtime, radiative
 * caches, hydrometeors, and every camera that may later observe the system.
 */
export interface CloudAuthoredSystemManifold {
    centerEastKm: number;
    centerNorthKm: number;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientation: number;
    boundaryTransitionKm: number;
}

/**
 * One persistent cloud owner.  `layer` deliberately remains a complete
 * CloudLayerState: two systems at the same WMO level may have independent
 * bases, depths, winds, phase, lifecycle, and organization rather than being
 * projected from one aggregate low/middle/high compatibility layer.
 */
export interface CloudAuthoredSystemState {
    /** Stable scene identity used by classification and causal references. */
    id: string;
    /** WMO altitude family; this must agree with `layer.genus`. */
    layerIndex: CloudLayerIndex;
    layer: CloudLayerState;
    /** Finite camera-independent formation domain in Earth-local kilometres. */
    manifold: CloudAuthoredSystemManifold;
}

export interface CloudScene {
    /** Ordered low, middle, high. */
    layers: [CloudLayerState, CloudLayerState, CloudLayerState];
    /** Combined sky coverage in oktas, 0-8. */
    totalOktas: number;
    /** Convective available energy proxy, 0-1. */
    convection: number;
    /** Atmospheric instability, 0-1. */
    instability: number;
    /** Boundary-layer relative humidity, 0-1. */
    humidity: number;
    /** Fog / lifted stratus as a continuous boundary-layer state, 0-1. */
    fog: number;
    /** Rare noctilucent display, 0-1. Valid only at high latitude in summer. */
    noctilucent: number;
    /** Camera-independent orthogonal WMO assignments keyed to stable owners. */
    classifications?: readonly CloudMorphologyClassificationAssignment[];
    /**
     * Explicit finite owners for same-tier/multisystem meteorology.  A tier
     * represented here suppresses only that tier's legacy generated owner
     * population; unrepresented tiers continue to use `layers` unchanged.
     */
    authoredSystems?: readonly CloudAuthoredSystemState[];
    /** Finite physical generators referenced by special-origin assignments. */
    specialOriginSources?: readonly CloudSpecialOriginSource[];
    /** Physical environment retained for upper-atmosphere validation. */
    latitude?: number;
    /** 0 midwinter through 1 midsummer in the observer's hemisphere. */
    season?: number;
    /** Positive degrees below the astronomical horizon. */
    solarDepression?: number;
    /** Resolved lower-stratosphere temperature for PSC admissibility. */
    stratosphericTemperatureKelvin?: number;
    /** Resolved summer-mesopause temperature for noctilucent ice. */
    mesopauseTemperatureKelvin?: number;
    seed: [number, number, number, number];
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));

interface GenusProfile {
    /** Base altitude range in metres at 45° latitude. */
    altitude: [number, number];
    /** Thickness range in metres. */
    thickness: [number, number];
    stratusBlend: number;
    towerAmount: number;
    anvilAmount: number;
    iceFraction: number;
    /** Relative extinction; cirrus is nearly transparent, Cb is opaque. */
    opticalDepth: number;
    detailStrength: number;
    /** Typical precipitation capability, 0-1. */
    precipitation: number;
}

/**
 * Per-genus morphology. Values are art-directed within the ranges published in
 * the WMO Cloud Atlas rather than fitted to a single photograph.
 */
const GENUS_PROFILE: Record<CloudGenus, GenusProfile> = {
    clear: {
        altitude: [1200, 1200],
        thickness: [0, 0],
        stratusBlend: 0,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0,
        opticalDepth: 0,
        detailStrength: 0,
        precipitation: 0,
    },
    cirrus: {
        altitude: [7000, 11500],
        thickness: [400, 1200],
        stratusBlend: 0.24,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 1,
        opticalDepth: 0.16,
        detailStrength: 0.72,
        precipitation: 0,
    },
    cirrocumulus: {
        altitude: [6500, 10500],
        thickness: [300, 700],
        stratusBlend: 0.1,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0.94,
        opticalDepth: 0.24,
        detailStrength: 0.86,
        precipitation: 0,
    },
    cirrostratus: {
        altitude: [6800, 11000],
        thickness: [500, 1600],
        stratusBlend: 0.92,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 1,
        opticalDepth: 0.2,
        detailStrength: 0.3,
        precipitation: 0,
    },
    altocumulus: {
        altitude: [2600, 5800],
        thickness: [400, 1000],
        stratusBlend: 0.22,
        towerAmount: 0.08,
        anvilAmount: 0,
        iceFraction: 0.28,
        opticalDepth: 0.56,
        detailStrength: 0.74,
        precipitation: 0.04,
    },
    altostratus: {
        altitude: [2800, 6000],
        thickness: [900, 2600],
        stratusBlend: 0.95,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0.4,
        opticalDepth: 0.7,
        detailStrength: 0.22,
        precipitation: 0.16,
    },
    nimbostratus: {
        altitude: [900, 3000],
        thickness: [2500, 5000],
        stratusBlend: 1,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0.3,
        opticalDepth: 1,
        detailStrength: 0.16,
        precipitation: 0.85,
    },
    stratocumulus: {
        altitude: [600, 1800],
        thickness: [400, 1100],
        stratusBlend: 0.58,
        towerAmount: 0.12,
        anvilAmount: 0,
        iceFraction: 0,
        opticalDepth: 0.74,
        detailStrength: 0.8,
        precipitation: 0.12,
    },
    stratus: {
        altitude: [120, 900],
        thickness: [200, 700],
        stratusBlend: 1,
        towerAmount: 0,
        anvilAmount: 0,
        iceFraction: 0,
        opticalDepth: 0.66,
        detailStrength: 0.2,
        precipitation: 0.18,
    },
    cumulus: {
        altitude: [700, 2000],
        thickness: [700, 3000],
        stratusBlend: 0,
        towerAmount: 0.4,
        anvilAmount: 0,
        iceFraction: 0,
        opticalDepth: 0.82,
        detailStrength: 0.95,
        precipitation: 0.08,
    },
    cumulonimbus: {
        altitude: [600, 1500],
        thickness: [8000, 13000],
        stratusBlend: 0,
        towerAmount: 1,
        anvilAmount: 0.85,
        iceFraction: 0.45,
        opticalDepth: 1,
        detailStrength: 0.66,
        precipitation: 1,
    },
};

const lerp = (low: number, high: number, amount: number) =>
    low + (high - low) * amount;

/**
 * Latitude and season shift the tropopause, and with it every genus altitude.
 * Tropical high cloud reaches 18 km; polar high cloud tops out near 8 km.
 */
const altitudeScale = (latitude: number, season: number) => {
    const tropical = 1 - clamp(Math.abs(latitude) / 66, 0, 1);
    // Summer deepens the troposphere; winter compresses it.
    return 0.78 + tropical * 0.46 + season * 0.08;
};

export const EMPTY_LAYER: CloudLayerState = {
    genus: "clear",
    species: "generic",
    present: false,
    baseAltitude: 1200,
    thickness: 0,
    coverage: 0,
    oktas: 0,
    opticalDepth: 0,
    stratusBlend: 0,
    towerAmount: 0,
    anvilAmount: 0,
    iceFraction: 0,
    detailStrength: 0,
    windSpeed: 0,
    windDirection: 0,
    shear: 0,
    turbulence: 0,
    precipitation: 0,
    organization: "unorganized",
    lifecycle: 0.5,
    organizationStrength: 0,
};

export interface LayerRequest {
    genus: CloudGenus;
    species?: CloudSpecies;
    oktas: number;
    latitude?: number;
    season?: number;
    /** 0-1 position within the genus altitude band. */
    altitudeBias?: number;
    opticalDepth?: number;
    windSpeed?: number;
    windDirection?: number;
    shear?: number;
    turbulence?: number;
    detailStrength?: number;
    convection?: number;
    precipitation?: number;
    baseAltitude?: number;
    thickness?: number;
    iceFraction?: number;
    organization?: CloudOrganization;
    lifecycle?: number;
    organizationStrength?: number;
}

/** Builds one physically consistent layer from a genus and a coverage. */
export function createLayer(request: LayerRequest): CloudLayerState {
    const {
        genus,
        oktas,
        latitude = 45,
        season = 0.5,
        altitudeBias = 0.5,
        convection = 0,
    } = request;

    if (
        request.species && request.species !== "generic" &&
        CLOUD_SPECIES_GENUS[request.species] !== genus
    ) {
        throw new RangeError(
            `${request.species} cannot be authored as genus ${genus}; ` +
            `its canonical genus is ${CLOUD_SPECIES_GENUS[request.species]}.`,
        );
    }

    if (genus === "clear" || oktas <= 0) return { ...EMPTY_LAYER };

    const profile = GENUS_PROFILE[genus];
    const scale = altitudeScale(latitude, season);
    const baseAltitude = request.baseAltitude ??
        lerp(profile.altitude[0], profile.altitude[1], altitudeBias) * scale;

    // Convection deepens cumuliform cloud: humilis through congestus is a
    // continuum of thickness, not a separate genus.
    const convectiveDepth = profile.towerAmount > 0
        ? 1 + convection * 1.6 * profile.towerAmount
        : 1;
    const thickness = request.thickness ??
        lerp(profile.thickness[0], profile.thickness[1], altitudeBias) *
            scale * convectiveDepth;

    const coverage = clamp(oktas / 8);

    return {
        genus,
        species: request.species ?? "generic",
        present: true,
        baseAltitude,
        thickness,
        coverage,
        oktas: clamp(oktas, 0, 8),
        opticalDepth: clamp(request.opticalDepth ?? profile.opticalDepth, 0, 1),
        stratusBlend: profile.stratusBlend,
        // Towers only grow where convection actually supports them.
        towerAmount: clamp(profile.towerAmount * (0.35 + convection * 0.65)),
        anvilAmount: clamp(profile.anvilAmount * convection),
        iceFraction: clamp(request.iceFraction ?? profile.iceFraction),
        detailStrength: clamp(request.detailStrength ?? profile.detailStrength),
        windSpeed: request.windSpeed ?? 8,
        windDirection: request.windDirection ?? 0,
        shear: request.shear ?? 0.2,
        turbulence: clamp(
            request.turbulence ?? 0.3 + profile.towerAmount * 0.4,
        ),
        precipitation: clamp(
            request.precipitation ??
                profile.precipitation * clamp(coverage * 1.3) *
                    clamp(profile.opticalDepth * 1.2),
        ),
        organization: request.organization ?? (
            genus === "cumulus" || genus === "cumulonimbus"
                ? "isolated"
                : genus === "stratocumulus" || genus === "altocumulus" ||
                    genus === "cirrocumulus"
                    ? "closed-cell"
            : genus === "cirrus"
                        ? "unorganized"
                        : genus === "altostratus" || genus === "nimbostratus" ||
                            genus === "cirrostratus"
                            ? "frontal"
                            : "unorganized"
        ),
        lifecycle: clamp(request.lifecycle ?? 0.5),
        organizationStrength: clamp(request.organizationStrength ?? 0.45),
    };
}

/**
 * Enforces meteorological consistency across the assembled scene. This is the
 * gate that keeps a random seed from producing an unbelievable sky.
 */
export function constrainScene(scene: CloudScene): CloudScene {
    const layers = scene.layers.map((layer) => ({ ...layer })) as
        CloudScene["layers"];
    const [low, middle, high] = layers;

    // Cumulonimbus requires deep convection and instability. Without it the
    // cell can only reach congestus, which we express as deep cumulus.
    if (
        low.genus === "cumulonimbus" &&
        (scene.convection < 0.55 || scene.instability < 0.48)
    ) {
        low.genus = "cumulus";
        low.species = "cumulus-congestus";
        const profile = GENUS_PROFILE.cumulus;
        low.thickness = Math.min(low.thickness, profile.thickness[1] * 1.6);
        low.anvilAmount = 0;
        low.iceFraction = 0;
        low.opticalDepth = Math.min(low.opticalDepth, profile.opticalDepth);
        low.precipitation = Math.min(low.precipitation, 0.3);
    }

    // Stratiform cloud cannot acquire cauliflower towers or an anvil.
    layers.forEach((layer) => {
        if (layer.stratusBlend > 0.85) {
            layer.towerAmount = 0;
            layer.anvilAmount = 0;
        }
    });

    // Precipitation requires sufficient optical depth to have condensed.
    layers.forEach((layer) => {
        if (layer.opticalDepth < 0.45) layer.precipitation = 0;
    });

    // High cloud is ice by definition; low water cloud cannot be glaciated
    // unless it is a deep convective tower reaching the freezing level.
    layers.forEach((layer) => {
        const level = CLOUD_GENUS_LEVEL[layer.genus];
        if (level === "high") layer.iceFraction = Math.max(layer.iceFraction, 0.9);
        if (level === "low" && layer.towerAmount < 0.6) {
            layer.iceFraction = Math.min(layer.iceFraction, 0.15);
        }
    });

    // Nimbostratus is usually a deep merged layer, but ragged Stratus fractus
    // and pannus can form as a genuinely separate, lower accessory population
    // in the humid precipitation layer.  Preserve that underdeck instead of
    // deleting the physical owner that the multilayer and accessory-cloud
    // paths deliberately authored.  An anonymous low deck is still absorbed
    // into the deep frontal shield.  Independent high ice can remain visible
    // through thinner portions of the rain deck.
    if (middle.genus === "nimbostratus" && middle.present) {
        const explicitPannus = scene.classifications?.some((assignment) =>
            assignment.classification.accessoryClouds.includes("pannus")
        ) ?? false;
        const raggedUnderdeck = low.genus === "stratus" &&
            low.species === "stratus-fractus";
        if (!explicitPannus && !raggedUnderdeck) low.present = false;
    }

    // Ordinary stratiform layers remain separated. Deep convection is allowed
    // to span the middle and high levels: forcing a cumulonimbus tower below an
    // arbitrary shell boundary destroys its defining vertical structure.
    const deepConvective = low.present && low.genus === "cumulonimbus";
    const causalLayerBridge = (first: number, second: number) =>
        scene.classifications?.some((assignment) =>
            assignment.causalParent !== undefined &&
            ((assignment.layerIndex === first &&
                assignment.causalParent.layerIndex === second) ||
                (assignment.layerIndex === second &&
                    assignment.causalParent.layerIndex === first))) ?? false;
    if (middle.present && low.present && !deepConvective &&
        !causalLayerBridge(0, 1)) {
        middle.baseAltitude = Math.max(
            middle.baseAltitude,
            low.baseAltitude + low.thickness + 250,
        );
    }
    if (high.present && middle.present && !deepConvective &&
        !causalLayerBridge(1, 2)) {
        high.baseAltitude = Math.max(
            high.baseAltitude,
            middle.baseAltitude + middle.thickness + 400,
        );
    }

    // Wind veers and strengthens with height (Ekman spiral above the boundary
    // layer), so layers must not share a velocity or they will read as one
    // rigid sheet sliding across the sky.
    layers.forEach((layer, index) => {
        if (index === 0 || !layer.present) return;
        const below = layers.slice(0, index).reverse().find((candidate) => candidate.present);
        if (!below) return;
        if (Math.abs(layer.windDirection - below.windDirection) < 0.12) {
            layer.windDirection = below.windDirection + 0.35 + index * 0.22;
        }
        layer.windSpeed = Math.max(layer.windSpeed, below.windSpeed * 1.25);
    });

    // Noctilucent cloud is a genuine rarity: it needs a dark, high-latitude
    // summer sky and a Sun 6-16° below the horizon. Validity of the solar
    // condition is checked by the caller; latitude and season are checked here.
    const noctilucent = scene.noctilucent;

    // Combined cover is the union of independently projected layer masks, not
    // their sum. Two 4/8 layers do not automatically make an overcast sky.
    const authoredLayerIndices = new Set(
        (scene.authoredSystems ?? []).map(({ layerIndex }) => layerIndex),
    );
    const coverageStates = [
        ...layers.filter((_, layerIndex) =>
            !authoredLayerIndices.has(layerIndex as CloudLayerIndex)),
        ...(scene.authoredSystems ?? []).map(({ layer }) => layer),
    ];
    const clearFraction = coverageStates.reduce(
        (remaining, layer) =>
            remaining * (1 - (layer.present ? clamp(layer.coverage) : 0)),
        1,
    );
    const totalOktas = clamp(1 - clearFraction) * 8;

    const classifications = scene.classifications?.map((assignment) => ({
        ...assignment,
        classification: {
            ...assignment.classification,
            varieties: [...assignment.classification.varieties],
            supplementaryFeatures: [
                ...assignment.classification.supplementaryFeatures,
            ],
            accessoryClouds: [...assignment.classification.accessoryClouds],
            origin: { ...assignment.classification.origin },
        } as CloudClassification,
    }));
    const authoredSystems = scene.authoredSystems?.map((system) => ({
        ...system,
        layer: { ...system.layer },
        manifold: { ...system.manifold },
    }));

    return {
        ...scene,
        layers,
        totalOktas,
        noctilucent,
        ...(classifications ? { classifications } : {}),
        ...(authoredSystems ? { authoredSystems } : {}),
    };
}

/**
 * Legacy compatibility.
 *
 * `data/sky-benchmark.json` encodes a curated mapping from observed sky
 * conditions to the previous `cloudType` / `cloudCoverage` / `cloudOpticalDepth`
 * triple. Rebuilding the parameterization without this shim would silently
 * invalidate every benchmark case: the analyzer would keep producing numbers
 * that no longer mean what they did. This maps the old triple onto the new
 * scene so the existing 140-case suite stays a valid gate.
 */
export type LegacyCloudType =
    | "none"
    | "cirrus"
    | "cirrocumulus"
    | "stratus"
    | "stratocumulus"
    | "cumulus"
    | "cumulonimbus";

export function sceneFromLegacy(
    cloudType: LegacyCloudType,
    coverage: number,
    opticalDepth: number,
    seed: [number, number, number, number],
    options: { latitude?: number; season?: number; humidity?: number } = {},
): CloudScene {
    const { latitude = 45, season = 0.5, humidity = 0.5 } = options;
    const oktas = clamp(coverage) * 8;
    const genus: CloudGenus = cloudType === "none" ? "clear" : cloudType;
    const level = CLOUD_GENUS_LEVEL[genus];
    const convection = genus === "cumulonimbus"
        ? 0.85
        : genus === "cumulus"
            ? 0.45
            : 0.12;

    const layer = createLayer({
        genus,
        oktas,
        latitude,
        season,
        altitudeBias: seed[0],
        opticalDepth,
        convection,
        windSpeed: 6 + seed[1] * 10,
        windDirection: seed[2] * Math.PI * 2,
    });

    const layers: CloudScene["layers"] = [
        { ...EMPTY_LAYER },
        { ...EMPTY_LAYER },
        { ...EMPTY_LAYER },
    ];
    layers[level === "low" ? 0 : level === "middle" ? 1 : 2] = layer;

    return constrainScene({
        layers,
        totalOktas: oktas,
        convection,
        instability: convection,
        humidity,
        fog: 0,
        noctilucent: 0,
        seed,
    });
}

/**
 * Builds a full multi-layer scene from the deterministic daily state.
 *
 * Layer selection is correlated, not independent: convective days favour
 * cumuliform low cloud with little above, frontal days stack cirrus over
 * altostratus over a thickening low deck, and settled anticyclonic days leave
 * thin high cloud alone.
 */
export interface DailyCloudRequest {
    /** Deterministic per-day values in 0-1. At least 12 entries. */
    random: number[];
    /** Legacy atmosphere style, retained as the coarse weather regime. */
    regime: "crystal" | "cirrus" | "haze" | "mist" | "soft";
    /** Overall cloudiness multiplier, roughly 0-2. */
    density: number;
    latitude: number;
    season: number;
    humidity: number;
    /** Solar depression in degrees, used only for the noctilucent test. */
    solarDepression?: number;
}

const dailyBaseClassification = (
    layer: CloudLayerState,
): CloudClassification | undefined => {
    const common = {
        varieties: [] as CloudClassification["varieties"],
        supplementaryFeatures: [] as CloudClassification["supplementaryFeatures"],
        accessoryClouds: [] as CloudClassification["accessoryClouds"],
        origin: { kind: "natural" } as const,
    };
    switch (layer.genus) {
        case "cirrus": return { ...common, genus: "cirrus", species: "fibratus" };
        case "cirrocumulus": return {
            ...common, genus: "cirrocumulus", species: "stratiformis",
        };
        case "cirrostratus": return {
            ...common, genus: "cirrostratus", species: "nebulosus",
        };
        case "altocumulus": return {
            ...common, genus: "altocumulus", species: "stratiformis",
        };
        case "altostratus": return {
            ...common, genus: "altostratus", species: null,
            varieties: ["opacus"],
        };
        case "nimbostratus": return {
            ...common, genus: "nimbostratus", species: null,
            supplementaryFeatures: layer.precipitation > 0.08
                ? ["praecipitatio"] : [],
        };
        case "stratocumulus": return {
            ...common, genus: "stratocumulus", species: "stratiformis",
        };
        case "stratus": return {
            ...common, genus: "stratus", species: "nebulosus",
        };
        case "cumulus": return {
            ...common,
            genus: "cumulus",
            species: layer.towerAmount > 0.66 || layer.thickness > 2_400
                ? "congestus"
                : layer.towerAmount > 0.32 || layer.thickness > 900
                    ? "mediocris" : "humilis",
        };
        case "cumulonimbus": return {
            ...common,
            genus: "cumulonimbus",
            species: layer.lifecycle >= 0.46 ? "capillatus" : "calvus",
            supplementaryFeatures: layer.anvilAmount > 0.52 &&
                layer.lifecycle >= 0.56 ? ["incus"] : [],
        };
        case "clear": return undefined;
    }
};

/**
 * Restrained daily orthogonal state. Every present level gets one canonical
 * assignment, while an actual modifier appears on only a minority of days and
 * a second owner only in rare cases. Choices below have no unmet physical
 * dependencies; conditional storm/accessory states are added only when their
 * runtime requirements are already present.
 */
const dailyMorphologyAssignments = (
    layers: CloudScene["layers"],
    value: (index: number) => number,
    context: {
        latitude: number;
        season: number;
        solarDepression: number;
        noctilucent: number;
    },
): CloudMorphologyClassificationAssignment[] => {
    const assignments: CloudMorphologyClassificationAssignment[] = [];
    layers.forEach((layer, layerIndex) => {
        const classification = dailyBaseClassification(layer);
        if (!classification || !layer.present) return;
        const roll = value(36 + layerIndex * 3);
        if (roll > 0.78) {
            switch (classification.genus) {
                case "cirrus":
                    classification.varieties.push(roll > 0.91
                        ? "vertebratus" : "intortus");
                    break;
                case "cirrocumulus":
                case "cirrostratus":
                    classification.varieties.push(roll > 0.9
                        ? "duplicatus" : "undulatus");
                    break;
                case "altocumulus":
                case "stratocumulus":
                    classification.varieties.push(roll > 0.94
                        ? "perlucidus" : roll > 0.86
                            ? "duplicatus" : "undulatus");
                    break;
                case "stratus":
                    classification.varieties.push(roll > 0.9
                        ? "translucidus" : "undulatus");
                    break;
                case "cumulus":
                    if (layer.lifecycle >= 0.14 && layer.lifecycle <= 0.68 &&
                        layer.towerAmount > 0.24) {
                        classification.accessoryClouds.push(
                            roll > 0.92 ? "velum" : "pileus");
                    }
                    break;
                case "cumulonimbus":
                    if (layer.lifecycle >= 0.38 && layer.precipitation > 0.42) {
                        classification.supplementaryFeatures.push("mamma");
                    }
                    break;
                case "altostratus":
                case "nimbostratus":
                    // Their canonical opacus/praecipitatio states already
                    // carry the restrained orthogonal distinction.
                    break;
            }
        }
        assignments.push({ layerIndex, systemIndex: 0, classification });

        if (value(37 + layerIndex * 3) > 0.975) {
            assignments.push({
                layerIndex,
                systemIndex: 1,
                classification: {
                    ...classification,
                    varieties: [...classification.varieties],
                    supplementaryFeatures: [
                        ...classification.supplementaryFeatures,
                    ],
                    accessoryClouds: [...classification.accessoryClouds],
                    origin: { ...classification.origin },
                } as CloudClassification,
            });
        }
    });

    const absLatitude = Math.abs(context.latitude);
    const upperHost: CloudClassification = {
        genus: "cirrus",
        species: "fibratus",
        varieties: [],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { kind: "natural" },
    };
    if (context.noctilucent > 0) {
        assignments.push({
            layerIndex: 2,
            systemIndex: 11,
            classification: upperHost,
            upperAtmosphericCloud: "noctilucent",
        });
    } else if (absLatitude >= 60 && context.season < 0.25 && value(45) > 0.975) {
        assignments.push({
            layerIndex: 2,
            systemIndex: 11,
            classification: upperHost,
            upperAtmosphericCloud: context.solarDepression >= 1 &&
                context.solarDepression <= 9 && value(46) > 0.82
                ? "nacreous"
                : value(46) > 0.62 ? "polar-stratospheric-ice"
                    : value(46) > 0.28 ? "polar-stratospheric-nat"
                        : "polar-stratospheric-sts",
        });
    }
    return assignments;
};

export function createDailyCloudScene(
    request: DailyCloudRequest,
): CloudScene {
    const { random, regime, density, latitude, season, humidity } = request;
    const value = (index: number) => random[index % random.length] ?? 0.5;

    const seed: [number, number, number, number] = [
        value(0),
        value(1),
        value(2),
        value(3),
    ];

    // Convection is driven by season, latitude, humidity and the daily roll.
    // It is the gate for every cumuliform decision downstream.
    const tropical = 1 - clamp(Math.abs(latitude) / 66);
    const convection = clamp(
        (season * 0.4 + tropical * 0.35 + humidity * 0.25) *
            (0.45 + value(4)) *
            (regime === "soft" ? 1.25 : regime === "crystal" ? 0.5 : 0.85),
    );
    const instability = clamp(convection * (0.6 + value(5) * 0.7));

    const baseOktas = clamp(density * 0.5) * 8;
    const windDirection = value(6) * Math.PI * 2;
    const windSpeed = 4 + value(7) * 16;

    let lowGenus: CloudGenus = "clear";
    let middleGenus: CloudGenus = "clear";
    let highGenus: CloudGenus = "clear";
    let lowOktas = 0;
    let middleOktas = 0;
    let highOktas = 0;

    switch (regime) {
        case "crystal":
            // Settled, dry. Occasional thin high ice only.
            highGenus = value(8) > 0.62 ? "cirrus" : "clear";
            highOktas = clamp(baseOktas * 0.4, 0, 2.5);
            break;
        case "cirrus":
            highGenus = value(8) > 0.7 ? "cirrocumulus" : "cirrus";
            highOktas = clamp(baseOktas * 0.85, 0, 6);
            if (value(9) > 0.72) {
                middleGenus = "altocumulus";
                middleOktas = clamp(baseOktas * 0.4, 0, 4);
            }
            break;
        case "haze":
            // Approaching front: high ice thickening to a middle deck.
            highGenus = "cirrostratus";
            highOktas = clamp(baseOktas * 0.7, 0, 6);
            middleGenus = value(9) > 0.5 ? "altostratus" : "altocumulus";
            middleOktas = clamp(baseOktas * 0.75, 0, 7);
            break;
        case "mist":
            if (value(9) > 0.66) {
                lowGenus = "stratocumulus";
                lowOktas = clamp(baseOktas * 1.05, 0, 8);
            } else {
                lowGenus = "stratus";
                lowOktas = clamp(baseOktas * 1.15, 0, 8);
            }
            if (value(10) > 0.7) {
                middleGenus = "altostratus";
                middleOktas = clamp(baseOktas * 0.5, 0, 5);
            }
            break;
        case "soft":
        default:
            if (convection > 0.62 && value(8) > 0.88 && density > 1.15) {
                lowGenus = "cumulonimbus";
                lowOktas = clamp(baseOktas * 0.8, 1, 6);
                // A mature cell spreads its own anvil across the high level.
                highGenus = "cirrus";
                highOktas = clamp(baseOktas * 0.6, 0, 5);
            } else if (value(8) > 0.45) {
                lowGenus = "cumulus";
                lowOktas = clamp(baseOktas * 0.9, 0, 7);
            } else {
                lowGenus = "stratocumulus";
                lowOktas = clamp(baseOktas * 1.0, 0, 8);
            }
            if (value(10) > 0.78) {
                highGenus = highGenus === "clear" ? "cirrus" : highGenus;
                highOktas = Math.max(highOktas, clamp(baseOktas * 0.35, 0, 3));
            }
            break;
    }

    // Deep, saturated air below a thickening middle deck becomes nimbostratus,
    // which is a single merged rain deck rather than two stacked layers.
    if (
        middleGenus === "altostratus" &&
        middleOktas > 6 &&
        humidity > 0.7 &&
        value(11) > 0.6
    ) {
        middleGenus = "nimbostratus";
        middleOktas = 8;
    }

    const lowOrganization: CloudOrganization = (() => {
        if (lowGenus === "cumulus" || lowGenus === "cumulonimbus") {
            return value(24) < 0.24 ? "streets" : "isolated";
        }
        if (lowGenus === "stratocumulus") {
            if (value(24) < 0.34) return "open-cell";
            if (value(24) < 0.72) return "closed-cell";
            return "streets";
        }
        return lowGenus === "stratus" ? "unorganized" : "frontal";
    })();
    const middleOrganization: CloudOrganization =
        middleGenus === "altocumulus"
            ? (value(25) < 0.46 ? "open-cell" : "closed-cell")
            : middleGenus === "clear"
                ? "unorganized"
                : "frontal";
    const highOrganization: CloudOrganization =
        highGenus === "cirrocumulus"
            ? "closed-cell"
            : highGenus === "clear"
                ? "unorganized"
                : value(26) < 0.58 ? "banded" : "frontal";

    const dailyOpticalDepth = (genus: CloudGenus, randomIndex: number) => {
        const climatological: Record<CloudGenus, number> = {
            clear: 0,
            cirrus: 0.16,
            cirrocumulus: 0.24,
            cirrostratus: 0.2,
            altocumulus: 0.56,
            altostratus: 0.7,
            nimbostratus: 1,
            stratocumulus: 0.74,
            stratus: 0.66,
            cumulus: 0.82,
            cumulonimbus: 1,
        };
        const denseWeather = genus === "nimbostratus" || genus === "cumulonimbus";
        const variability = 0.7 + value(randomIndex) * 0.44;
        const moisture = 0.88 + humidity * 0.2;
        return clamp(
            climatological[genus] * variability * moisture,
            denseWeather ? 0.84 : 0,
            1,
        );
    };

    const lowOrganizationStrength = lowGenus === "cumulonimbus"
        ? 0.56 + value(28) * 0.34
        : lowGenus === "cumulus"
            ? 0.38 + value(28) * 0.38
            : 0.28 + value(28) * 0.68;

    const layers: CloudScene["layers"] = [
        createLayer({
            genus: lowGenus,
            oktas: lowOktas,
            latitude,
            season,
            altitudeBias: value(12),
            convection,
            windSpeed,
            windDirection,
            shear: 0.12 + value(13) * 0.24,
            turbulence: 0.25 + convection * 0.5,
            opticalDepth: dailyOpticalDepth(lowGenus, 33),
            organization: lowOrganization,
            lifecycle: value(27),
            organizationStrength: lowOrganizationStrength,
        }),
        createLayer({
            genus: middleGenus,
            oktas: middleOktas,
            latitude,
            season,
            altitudeBias: value(14),
            convection: convection * 0.5,
            windSpeed: windSpeed * 1.5,
            windDirection: windDirection + 0.4 + value(15) * 0.5,
            shear: 0.18 + value(16) * 0.22,
            turbulence: 0.2 + value(17) * 0.3,
            opticalDepth: dailyOpticalDepth(middleGenus, 34),
            organization: middleOrganization,
            lifecycle: value(29),
            organizationStrength: 0.24 + value(30) * 0.58,
        }),
        createLayer({
            genus: highGenus,
            oktas: highOktas,
            latitude,
            season,
            altitudeBias: value(18),
            convection: 0,
            windSpeed: windSpeed * 2.6,
            windDirection: windDirection + 0.8 + value(19) * 0.7,
            shear: 0.3 + value(20) * 0.35,
            turbulence: 0.12 + value(21) * 0.2,
            opticalDepth: dailyOpticalDepth(highGenus, 35),
            organization: highOrganization,
            lifecycle: value(31),
            organizationStrength: 0.22 + value(32) * 0.62,
        }),
    ];

    // Fog is a continuous boundary-layer state, strongest in humid, settled,
    // radiatively cooled air rather than a separate cloud type.
    const fog = clamp(
        (humidity - 0.62) * 2.1 * (1 - convection * 0.7) *
            (regime === "mist" ? 1.4 : regime === "haze" ? 0.9 : 0.35),
    );

    // Noctilucent cloud: 50-70° latitude, local summer, Sun 6-16° below the
    // horizon. Everything else in the sky must also be nearly clear.
    const depression = request.solarDepression ?? 0;
    const absLatitude = Math.abs(latitude);
    const noctilucentValid =
        absLatitude > 50 &&
        absLatitude < 70 &&
        season > 0.7 &&
        depression > 6 &&
        depression < 16;
    const noctilucent = noctilucentValid && value(22) > 0.93
        ? clamp(0.3 + value(23) * 0.7)
        : 0;

    const classifications = dailyMorphologyAssignments(layers, value, {
        latitude,
        season,
        solarDepression: depression,
        noctilucent,
    });

    return constrainScene({
        layers,
        totalOktas: 0,
        convection,
        instability,
        humidity,
        fog,
        noctilucent,
        classifications,
        latitude,
        season,
        solarDepression: depression,
        seed,
    });
}

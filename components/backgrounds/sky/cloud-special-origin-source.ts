/**
 * Finite generating sources for WMO special-origin clouds.
 *
 * These are meteorological source manifolds, not visible billboard props.  A
 * source constrains where condensate may begin, which material/thermal impulse
 * it inherits, and how it is advected before it becomes an ordinary member of
 * its WMO genus.  The renderer receives the resulting CloudSystemState through
 * the existing packed ABI; non-water aerosol radiative transport deliberately
 * remains outside this module.
 *
 * @see https://cloudatlas.wmo.int/en/clouds-special.html
 * @see https://cloudatlas.wmo.int/en/flammagenitus.html
 * @see https://cloudatlas.wmo.int/en/homogenitus.html
 * @see https://cloudatlas.wmo.int/en/homomutatus.html
 * @see https://cloudatlas.wmo.int/en/cataractagenitus.html
 * @see https://cloudatlas.wmo.int/silvagenitus.html
 */

import {
    CLOUD_SPECIAL_ORIGIN_GENERA,
    type CloudSpecialOrigin,
    type CloudSystemState,
    type WmoCloudGenus,
} from "./cloud-state-map";

export type CloudSpecialOriginDesignation = Exclude<
    CloudSpecialOrigin,
    "natural"
>;

export type CloudSpecialOriginSourceKind =
    | "wildfire-convection"
    | "volcanic-convection"
    | "industrial-thermal"
    | "aircraft-exhaust-line"
    | "aircraft-aerodynamic-line"
    | "persistent-contrail-field"
    | "waterfall-spray"
    | "forest-evapotranspiration";

export interface CloudSpecialOriginSourceGeometry {
    kind: "point" | "line" | "area";
    centerEastKm: number;
    centerNorthKm: number;
    /** Half-length for a line and semi-major radius for an area. */
    majorRadiusKm: number;
    /** Source breadth, never a post-render alpha feather. */
    minorRadiusKm: number;
    orientation: number;
    releaseAltitudeKm: number;
}

/** Normalized causal strengths. Each value is finite and constrained to 0-1. */
export interface CloudSpecialOriginEmissionState {
    sensibleHeat: number;
    waterVapor: number;
    condensationNuclei: number;
    iceNuclei: number;
    verticalMomentum: number;
}

export const CLOUD_SPECIAL_ORIGIN_RGB_WAVELENGTHS_MICRONS =
    [0.680, 0.550, 0.440] as const;

export type CloudSpecialOriginAerosolKind =
    | "none"
    | "biomass-burning-smoke"
    | "volcanic-ash"
    | "industrial-combustion"
    | "aircraft-soot"
    | "mineral-spray"
    | "biogenic-organic";

export interface CloudSpecialOriginMaterialComposition {
    /** Normalized emitted material fractions; they must sum to one. */
    waterFraction: number;
    iceFraction: number;
    aerosolFraction: number;
    aerosolKind: CloudSpecialOriginAerosolKind;
    /** Source-core reference coefficient before finite-support weighting. */
    aerosolExtinction550PerKm: number;
    aerosolAngstromExponent: number;
    aerosolSingleScatteringAlbedoRgb: readonly [number, number, number];
    aerosolAsymmetry: number;
}

export interface CloudSpecialOriginSource {
    id: string;
    designation: CloudSpecialOriginDesignation;
    kind: CloudSpecialOriginSourceKind;
    geometry: CloudSpecialOriginSourceGeometry;
    emission: CloudSpecialOriginEmissionState;
    composition: CloudSpecialOriginMaterialComposition;
    /** Birth relative to the current scene snapshot; generated sources use -age. */
    birthTimeSeconds: number;
    ageSeconds: number;
    activeLifetimeSeconds: number;
    advectionSpeedMps: number;
    advectionDirection: number;
}

export interface CloudSpecialOriginSourceIssue {
    code: string;
    message: string;
}

export interface CloudSpecialOriginProductionMetadata {
    designation: CloudSpecialOriginDesignation;
    sourceId: string;
    sourceKind: CloudSpecialOriginSourceKind;
    sourceGeometry: CloudSpecialOriginSourceGeometry["kind"];
    lineageSeed: number;
    ageFraction: number;
    sourceMaterialFraction: number;
    thermalLiftFraction: number;
    finiteFormationRadiusKm: readonly [number, number];
}

const SOURCE_KINDS_BY_DESIGNATION: Readonly<Record<
    CloudSpecialOriginDesignation,
    readonly CloudSpecialOriginSourceKind[]
>> = {
    flammagenitus: ["wildfire-convection", "volcanic-convection"],
    homogenitus: [
        "industrial-thermal",
        "aircraft-exhaust-line",
        "aircraft-aerodynamic-line",
    ],
    homomutatus: ["persistent-contrail-field"],
    cataractagenitus: ["waterfall-spray"],
    silvagenitus: ["forest-evapotranspiration"],
};

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;

const unitHash = (seed: number, salt: number) => {
    let value = Math.imul((seed ^ salt) >>> 0, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
};

const textHash = (text: string) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
};

const finite = (value: number) => Number.isFinite(value);

const sourceKindFor = (
    designation: CloudSpecialOriginDesignation,
    genus: WmoCloudGenus,
    seed: number,
): CloudSpecialOriginSourceKind => {
    if (designation === "flammagenitus") {
        return unitHash(seed, 0x71f4) < 0.82
            ? "wildfire-convection" : "volcanic-convection";
    }
    if (designation === "homogenitus") {
        if (genus !== "cirrus") return "industrial-thermal";
        return unitHash(seed, 0xa317) < 0.84
            ? "aircraft-exhaust-line" : "aircraft-aerodynamic-line";
    }
    if (designation === "homomutatus") return "persistent-contrail-field";
    if (designation === "cataractagenitus") return "waterfall-spray";
    return "forest-evapotranspiration";
};

interface SourceProfile {
    geometry: CloudSpecialOriginSourceGeometry["kind"];
    distanceKm: readonly [number, number];
    majorRadiusKm: readonly [number, number];
    minorRadiusKm: readonly [number, number];
    releaseAltitudeKm: readonly [number, number];
    ageSeconds: readonly [number, number];
    lifetimeSeconds: readonly [number, number];
    advectionSpeedMps: readonly [number, number];
    emission: CloudSpecialOriginEmissionState;
}

const SOURCE_PROFILES: Readonly<Record<CloudSpecialOriginSourceKind, SourceProfile>> = {
    "wildfire-convection": {
        geometry: "area", distanceKm: [10, 70], majorRadiusKm: [0.5, 4.5],
        minorRadiusKm: [0.3, 2.8], releaseAltitudeKm: [0.02, 0.3],
        ageSeconds: [480, 5_400], lifetimeSeconds: [3_600, 43_200],
        advectionSpeedMps: [3, 18], emission: {
            sensibleHeat: 0.94, waterVapor: 0.64, condensationNuclei: 1,
            iceNuclei: 0.62, verticalMomentum: 0.9,
        },
    },
    "volcanic-convection": {
        geometry: "point", distanceKm: [18, 120], majorRadiusKm: [0.3, 2.2],
        minorRadiusKm: [0.2, 1.3], releaseAltitudeKm: [0.3, 3.8],
        ageSeconds: [360, 4_200], lifetimeSeconds: [2_400, 28_800],
        advectionSpeedMps: [5, 28], emission: {
            sensibleHeat: 0.88, waterVapor: 0.56, condensationNuclei: 0.94,
            iceNuclei: 0.88, verticalMomentum: 0.96,
        },
    },
    "industrial-thermal": {
        geometry: "point", distanceKm: [5, 45], majorRadiusKm: [0.08, 0.65],
        minorRadiusKm: [0.05, 0.4], releaseAltitudeKm: [0.04, 0.35],
        ageSeconds: [180, 2_400], lifetimeSeconds: [1_200, 10_800],
        advectionSpeedMps: [2, 14], emission: {
            sensibleHeat: 0.66, waterVapor: 0.76, condensationNuclei: 0.72,
            iceNuclei: 0.18, verticalMomentum: 0.56,
        },
    },
    "aircraft-exhaust-line": {
        geometry: "line", distanceKm: [22, 130], majorRadiusKm: [18, 110],
        minorRadiusKm: [0.04, 0.16], releaseAltitudeKm: [8.2, 12.4],
        ageSeconds: [90, 2_400], lifetimeSeconds: [900, 14_400],
        advectionSpeedMps: [14, 58], emission: {
            sensibleHeat: 0.08, waterVapor: 0.84, condensationNuclei: 0.9,
            iceNuclei: 0.82, verticalMomentum: 0.04,
        },
    },
    "aircraft-aerodynamic-line": {
        geometry: "line", distanceKm: [18, 95], majorRadiusKm: [4, 34],
        minorRadiusKm: [0.025, 0.11], releaseAltitudeKm: [6.5, 11.8],
        ageSeconds: [20, 480], lifetimeSeconds: [180, 1_800],
        advectionSpeedMps: [12, 52], emission: {
            sensibleHeat: 0, waterVapor: 0.14, condensationNuclei: 0.12,
            iceNuclei: 0.24, verticalMomentum: 0,
        },
    },
    "persistent-contrail-field": {
        geometry: "line", distanceKm: [35, 190], majorRadiusKm: [55, 260],
        minorRadiusKm: [2, 24], releaseAltitudeKm: [8.2, 12.6],
        ageSeconds: [1_200, 14_400], lifetimeSeconds: [5_400, 43_200],
        advectionSpeedMps: [20, 72], emission: {
            sensibleHeat: 0, waterVapor: 0.58, condensationNuclei: 0.82,
            iceNuclei: 0.9, verticalMomentum: 0,
        },
    },
    "waterfall-spray": {
        geometry: "point", distanceKm: [1.5, 18], majorRadiusKm: [0.03, 0.42],
        minorRadiusKm: [0.02, 0.24], releaseAltitudeKm: [0.01, 0.28],
        ageSeconds: [40, 1_200], lifetimeSeconds: [300, 5_400],
        advectionSpeedMps: [0.4, 7], emission: {
            sensibleHeat: 0.02, waterVapor: 0.96, condensationNuclei: 0.18,
            iceNuclei: 0.02, verticalMomentum: 0.42,
        },
    },
    "forest-evapotranspiration": {
        geometry: "area", distanceKm: [3, 42], majorRadiusKm: [2, 24],
        minorRadiusKm: [1.2, 15], releaseAltitudeKm: [0.01, 0.12],
        ageSeconds: [900, 12_000], lifetimeSeconds: [7_200, 57_600],
        advectionSpeedMps: [0.4, 9], emission: {
            sensibleHeat: 0.18, waterVapor: 0.88, condensationNuclei: 0.28,
            iceNuclei: 0.01, verticalMomentum: 0.12,
        },
    },
};

/**
 * Conservative source-core visualization envelopes. RGB absorption is derived
 * from these SSA/Ångström values by the source-lineage ABI. Smoke is allowed
 * substantial short-wave absorption; coarse ash uses a low Ångström exponent;
 * spray is nearly conservative. These are broad retrieval-informed envelopes,
 * not claims about one fire, fuel, volcano, or industrial stack.
 *
 * NASA ARCTAS smoke: https://esdpubs.nasa.gov/content/Spectral_absorption_of_biomass_burning_aerosol_determined_from_retrieved_single_scattering
 * NASA MISR ash: https://ntrs.nasa.gov/citations/20220014390
 * NASA contrails: https://ntrs.nasa.gov/citations/20230016907
 * NASA aerosol definitions: https://earth.gsfc.nasa.gov/climate/data/deep-blue/science
 */
const SOURCE_COMPOSITION_BY_KIND: Readonly<Record<
    CloudSpecialOriginSourceKind,
    CloudSpecialOriginMaterialComposition
>> = {
    "wildfire-convection": {
        waterFraction: 0.42, iceFraction: 0.08, aerosolFraction: 0.5,
        aerosolKind: "biomass-burning-smoke",
        aerosolExtinction550PerKm: 0.3, aerosolAngstromExponent: 1.72,
        aerosolSingleScatteringAlbedoRgb: [0.9, 0.87, 0.82],
        aerosolAsymmetry: 0.66,
    },
    "volcanic-convection": {
        waterFraction: 0.2, iceFraction: 0.12, aerosolFraction: 0.68,
        aerosolKind: "volcanic-ash",
        aerosolExtinction550PerKm: 0.42, aerosolAngstromExponent: 0.5,
        aerosolSingleScatteringAlbedoRgb: [0.92, 0.92, 0.9],
        aerosolAsymmetry: 0.76,
    },
    "industrial-thermal": {
        waterFraction: 0.44, iceFraction: 0.01, aerosolFraction: 0.55,
        aerosolKind: "industrial-combustion",
        aerosolExtinction550PerKm: 0.2, aerosolAngstromExponent: 1.36,
        aerosolSingleScatteringAlbedoRgb: [0.86, 0.84, 0.8],
        aerosolAsymmetry: 0.64,
    },
    "aircraft-exhaust-line": {
        waterFraction: 0.32, iceFraction: 0.52, aerosolFraction: 0.16,
        aerosolKind: "aircraft-soot",
        aerosolExtinction550PerKm: 0.035, aerosolAngstromExponent: 1.05,
        aerosolSingleScatteringAlbedoRgb: [0.56, 0.53, 0.5],
        aerosolAsymmetry: 0.58,
    },
    "aircraft-aerodynamic-line": {
        waterFraction: 0.02, iceFraction: 0.97, aerosolFraction: 0.01,
        aerosolKind: "aircraft-soot",
        aerosolExtinction550PerKm: 0.002, aerosolAngstromExponent: 1.05,
        aerosolSingleScatteringAlbedoRgb: [0.56, 0.53, 0.5],
        aerosolAsymmetry: 0.58,
    },
    "persistent-contrail-field": {
        waterFraction: 0.01, iceFraction: 0.97, aerosolFraction: 0.02,
        aerosolKind: "aircraft-soot",
        aerosolExtinction550PerKm: 0.003, aerosolAngstromExponent: 1.05,
        aerosolSingleScatteringAlbedoRgb: [0.56, 0.53, 0.5],
        aerosolAsymmetry: 0.58,
    },
    "waterfall-spray": {
        waterFraction: 0.995, iceFraction: 0, aerosolFraction: 0.005,
        aerosolKind: "mineral-spray",
        aerosolExtinction550PerKm: 0.002, aerosolAngstromExponent: 0.2,
        aerosolSingleScatteringAlbedoRgb: [0.997, 0.997, 0.996],
        aerosolAsymmetry: 0.72,
    },
    "forest-evapotranspiration": {
        waterFraction: 0.9, iceFraction: 0, aerosolFraction: 0.1,
        aerosolKind: "biogenic-organic",
        aerosolExtinction550PerKm: 0.006, aerosolAngstromExponent: 1.45,
        aerosolSingleScatteringAlbedoRgb: [0.98, 0.97, 0.94],
        aerosolAsymmetry: 0.62,
    },
};

export interface CreateCloudSpecialOriginSourceInput {
    id: string;
    designation: CloudSpecialOriginDesignation;
    genus: WmoCloudGenus;
    deterministicSeed: number;
    /**
     * Optional Earth-local bearing of the advected source endpoint. Curated
     * qualification scenes use this to keep the complete causal trajectory
     * readable. Omit it for the ordinary full-dome deterministic distribution.
     */
    editorialTerminalBearing?: number;
}

/** Deterministic physically bounded source used by curated production scenes. */
export function createCloudSpecialOriginSource(
    input: CreateCloudSpecialOriginSourceInput,
): CloudSpecialOriginSource {
    if (input.editorialTerminalBearing !== undefined &&
        !finite(input.editorialTerminalBearing)) {
        throw new RangeError("Editorial source bearing must be finite.");
    }
    const kind = sourceKindFor(
        input.designation,
        input.genus,
        input.deterministicSeed,
    );
    const profile = SOURCE_PROFILES[kind];
    const orientation = unitHash(input.deterministicSeed, 0x12f9) * Math.PI * 2;
    const bearing = unitHash(input.deterministicSeed, 0x4e21) * Math.PI * 2;
    const distance = mix(...profile.distanceKm,
        unitHash(input.deterministicSeed, 0xb275));
    const majorRadiusKm = mix(...profile.majorRadiusKm,
        unitHash(input.deterministicSeed, 0x93c1));
    const minorRadiusKm = Math.min(majorRadiusKm, mix(...profile.minorRadiusKm,
        unitHash(input.deterministicSeed, 0x2ba7)));
    const ageSeconds = mix(...profile.ageSeconds,
        unitHash(input.deterministicSeed, 0xc857));
    const source: CloudSpecialOriginSource = {
        id: input.id,
        designation: input.designation,
        kind,
        geometry: {
            kind: profile.geometry,
            centerEastKm: Math.sin(bearing) * distance,
            centerNorthKm: Math.cos(bearing) * distance,
            majorRadiusKm,
            minorRadiusKm,
            orientation,
            releaseAltitudeKm: mix(...profile.releaseAltitudeKm,
                unitHash(input.deterministicSeed, 0xa831)),
        },
        emission: { ...profile.emission },
        composition: {
            ...SOURCE_COMPOSITION_BY_KIND[kind],
            aerosolSingleScatteringAlbedoRgb: [
                ...SOURCE_COMPOSITION_BY_KIND[kind]
                    .aerosolSingleScatteringAlbedoRgb,
            ],
        },
        birthTimeSeconds: -ageSeconds,
        ageSeconds,
        activeLifetimeSeconds: mix(...profile.lifetimeSeconds,
            unitHash(input.deterministicSeed, 0x5f13)),
        advectionSpeedMps: mix(...profile.advectionSpeedMps,
            unitHash(input.deterministicSeed, 0xd94b)),
        advectionDirection: orientation + (unitHash(input.deterministicSeed, 0x7ca1) - 0.5) * 0.7,
    };
    if (input.editorialTerminalBearing === undefined) return source;

    // Rotate the source, source axis, and wind trajectory as one rigid
    // Earth-local manifold. This preserves age, displacement, geometry,
    // material, and causal advection instead of steering only the resulting
    // cloud or distorting its wind to make a qualification frame.
    const activeAgeSeconds = Math.min(
        source.ageSeconds,
        source.activeLifetimeSeconds,
    );
    const advectedKm = source.advectionSpeedMps * activeAgeSeconds / 1000;
    const terminalEastKm = source.geometry.centerEastKm +
        Math.cos(source.advectionDirection) * advectedKm;
    const terminalNorthKm = source.geometry.centerNorthKm +
        Math.sin(source.advectionDirection) * advectedKm;
    const currentTerminalBearing = Math.atan2(
        terminalEastKm,
        terminalNorthKm,
    );
    const rotation = Math.atan2(
        Math.sin(currentTerminalBearing - input.editorialTerminalBearing),
        Math.cos(currentTerminalBearing - input.editorialTerminalBearing),
    );
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const centerEastKm = source.geometry.centerEastKm * cosine -
        source.geometry.centerNorthKm * sine;
    const centerNorthKm = source.geometry.centerEastKm * sine +
        source.geometry.centerNorthKm * cosine;
    return {
        ...source,
        geometry: {
            ...source.geometry,
            centerEastKm,
            centerNorthKm,
            orientation: source.geometry.orientation + rotation,
        },
        advectionDirection: source.advectionDirection + rotation,
    };
}

export function validateCloudSpecialOriginSource(
    source: CloudSpecialOriginSource,
    genus?: WmoCloudGenus,
): CloudSpecialOriginSourceIssue[] {
    const issues: CloudSpecialOriginSourceIssue[] = [];
    const issue = (code: string, message: string) => issues.push({ code, message });
    if (!source.id.trim()) issue("missing-source-id", "A source needs a stable non-empty id.");
    if (!SOURCE_KINDS_BY_DESIGNATION[source.designation].includes(source.kind)) {
        issue("source-designation-mismatch",
            `${source.kind} cannot generate ${source.designation}.`);
    }
    if (genus && !CLOUD_SPECIAL_ORIGIN_GENERA[source.designation].includes(genus)) {
        issue("source-genus-mismatch",
            `${source.designation} cannot generate ${genus}.`);
    }
    if (genus === "cirrus" && source.designation === "homogenitus" &&
        source.kind === "industrial-thermal") {
        issue("industrial-cirrus-source",
            "Cirrus homogenitus requires an aircraft condensation source.");
    }
    if ((genus === "cumulus" || genus === "cumulonimbus") &&
        source.designation === "homogenitus" && source.kind !== "industrial-thermal") {
        issue("aircraft-convective-source",
            `${genus} homogenitus requires a buoyant industrial thermal source.`);
    }
    const numeric = [
        source.geometry.centerEastKm, source.geometry.centerNorthKm,
        source.geometry.majorRadiusKm, source.geometry.minorRadiusKm,
        source.geometry.orientation, source.geometry.releaseAltitudeKm,
        source.birthTimeSeconds, source.ageSeconds, source.activeLifetimeSeconds,
        source.advectionSpeedMps, source.advectionDirection,
        ...Object.values(source.emission),
        source.composition.waterFraction, source.composition.iceFraction,
        source.composition.aerosolFraction,
        source.composition.aerosolExtinction550PerKm,
        source.composition.aerosolAngstromExponent,
        ...source.composition.aerosolSingleScatteringAlbedoRgb,
        source.composition.aerosolAsymmetry,
    ];
    if (numeric.some((value) => !finite(value))) {
        issue("non-finite-source", "Every source parameter must be finite.");
    }
    if (source.geometry.majorRadiusKm <= 0 || source.geometry.minorRadiusKm <= 0 ||
        source.geometry.minorRadiusKm > source.geometry.majorRadiusKm) {
        issue("invalid-source-extent",
            "A finite source needs positive ordered semi-axes.");
    }
    if (source.geometry.releaseAltitudeKm < 0 || source.ageSeconds < 0 ||
        source.activeLifetimeSeconds <= 0 || source.advectionSpeedMps < 0) {
        issue("invalid-source-time-or-motion",
            "Source altitude, age, lifetime and advection must be non-negative.");
    }
    if (Object.values(source.emission).some((value) => value < 0 || value > 1)) {
        issue("invalid-normalized-emission", "Emission strengths must remain in [0, 1].");
    }
    const composition = source.composition;
    const materialTotal = composition.waterFraction + composition.iceFraction +
        composition.aerosolFraction;
    if ([composition.waterFraction, composition.iceFraction,
        composition.aerosolFraction].some((value) => value < 0 || value > 1) ||
        Math.abs(materialTotal - 1) > 1e-6) {
        issue("nonconservative-source-composition",
            "Water, ice and aerosol source fractions must be non-negative and sum to one.");
    }
    if (composition.aerosolExtinction550PerKm < 0 ||
        composition.aerosolAngstromExponent < 0 ||
        composition.aerosolAngstromExponent > 4 ||
        composition.aerosolSingleScatteringAlbedoRgb.some((value) =>
            value < 0 || value > 1) ||
        composition.aerosolAsymmetry < -0.2 ||
        composition.aerosolAsymmetry > 0.98) {
        issue("invalid-source-aerosol-optics",
            "Aerosol extinction, spectral slope, albedo and asymmetry are out of range.");
    }
    const hasNoAerosol = composition.aerosolFraction === 0 &&
        composition.aerosolExtinction550PerKm === 0;
    if ((composition.aerosolKind === "none") !== hasNoAerosol) {
        issue("source-aerosol-kind-mismatch",
            "A zero aerosol fraction must use none and active aerosol needs an optical kind.");
    }
    if (Math.abs(source.birthTimeSeconds + source.ageSeconds) > 1e-3) {
        issue("source-birth-age-mismatch",
            "At the scene snapshot birth time plus resolved age must equal zero.");
    }
    return issues;
}

const mixAngle = (from: number, to: number, amount: number) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * amount;
};

const positionedExtent = (
    state: CloudSystemState,
    source: CloudSpecialOriginSource,
    seed: number,
) => {
    const geometry = source.geometry;
    const alongAxis = [Math.cos(geometry.orientation), Math.sin(geometry.orientation)] as const;
    const crossAxis = [-alongAxis[1], alongAxis[0]] as const;
    const age = Math.min(source.ageSeconds, source.activeLifetimeSeconds);
    const advectedKm = source.advectionSpeedMps * age / 1000;
    const advectedCenter = [
        geometry.centerEastKm + Math.cos(source.advectionDirection) * advectedKm,
        geometry.centerNorthKm + Math.sin(source.advectionDirection) * advectedKm,
    ] as const;
    const along = geometry.kind === "point" ? 0
        : (unitHash(seed, 0x174d) * 2 - 1) * geometry.majorRadiusKm * 0.72;
    const cross = geometry.kind === "point"
        ? (unitHash(seed, 0x83b1) * 2 - 1) * geometry.minorRadiusKm * 0.35
        : (unitHash(seed, 0x83b1) * 2 - 1) * geometry.minorRadiusKm * 0.68;
    let majorRadiusKm = state.extent.majorRadiusKm;
    let minorRadiusKm = state.extent.minorRadiusKm;
    let boundaryTransitionKm = state.extent.boundaryTransitionKm;
    if (source.kind === "waterfall-spray") {
        majorRadiusKm = clamp(geometry.majorRadiusKm * mix(1.4, 4.4,
            unitHash(seed, 0x5a63)), 0.2, 2.4);
        minorRadiusKm = clamp(geometry.minorRadiusKm * mix(1.2, 3.2,
            unitHash(seed, 0x91d5)), 0.2, majorRadiusKm);
        boundaryTransitionKm = Math.max(0.04, minorRadiusKm * 0.28);
    } else if (source.kind === "forest-evapotranspiration") {
        majorRadiusKm = clamp(geometry.majorRadiusKm * mix(0.58, 0.94,
            unitHash(seed, 0xe3a7)), 1.2, 32);
        minorRadiusKm = clamp(geometry.minorRadiusKm * mix(0.62, 1.04,
            unitHash(seed, 0x672b)), 0.8, majorRadiusKm);
        boundaryTransitionKm = Math.max(0.25, minorRadiusKm * 0.24);
    } else if (source.kind === "industrial-thermal") {
        majorRadiusKm = clamp(Math.max(geometry.majorRadiusKm * 2.2,
            state.extent.majorRadiusKm * 0.42), 0.35, 9);
        minorRadiusKm = clamp(Math.max(geometry.minorRadiusKm * 1.8,
            state.extent.minorRadiusKm * 0.38), 0.25, majorRadiusKm);
        boundaryTransitionKm = Math.max(0.08, minorRadiusKm * 0.2);
    } else if (source.kind === "aircraft-exhaust-line" ||
        source.kind === "aircraft-aerodynamic-line") {
        majorRadiusKm = clamp(geometry.majorRadiusKm * mix(0.18, 0.42,
            unitHash(seed, 0x19e3)), 1, 65);
        minorRadiusKm = clamp(geometry.minorRadiusKm * mix(2.5, 9,
            unitHash(seed, 0xca71)), 0.2, Math.min(4, majorRadiusKm));
        boundaryTransitionKm = Math.max(0.08, minorRadiusKm * 0.35);
    } else if (source.kind === "persistent-contrail-field") {
        majorRadiusKm = clamp(geometry.majorRadiusKm * mix(0.42, 0.82,
            unitHash(seed, 0xa22f)), 18, 260);
        minorRadiusKm = clamp(geometry.minorRadiusKm * mix(0.7, 1.35,
            unitHash(seed, 0x2c93)), 2, Math.min(80, majorRadiusKm));
        boundaryTransitionKm = Math.max(0.8, minorRadiusKm * 0.32);
    } else {
        // Fire and volcanic convection retain the physically large mature
        // cloud while keeping its root above the finite heat source.
        majorRadiusKm = clamp(Math.max(state.extent.majorRadiusKm * 0.72,
            geometry.majorRadiusKm * 2.4), 1, 85);
        minorRadiusKm = clamp(Math.max(state.extent.minorRadiusKm * 0.7,
            geometry.minorRadiusKm * 2), 0.8, majorRadiusKm);
        boundaryTransitionKm = Math.max(0.18,
            Math.min(state.extent.boundaryTransitionKm, minorRadiusKm * 0.3));
    }
    return {
        ...state.extent,
        centerEastKm: advectedCenter[0] + alongAxis[0] * along + crossAxis[0] * cross,
        centerNorthKm: advectedCenter[1] + alongAxis[1] * along + crossAxis[1] * cross,
        majorRadiusKm,
        minorRadiusKm,
        orientation: mixAngle(state.extent.orientation, geometry.orientation,
            geometry.kind === "line" ? 0.92 : 0.42),
        boundaryTransitionKm: Math.min(majorRadiusKm * 0.45,
            boundaryTransitionKm),
    };
};

export interface ApplyCloudSpecialOriginSourceResult {
    state: CloudSystemState;
    metadata?: CloudSpecialOriginProductionMetadata;
    issues: CloudSpecialOriginSourceIssue[];
}

/** Bake a finite source's causal thermodynamic/material history into one owner. */
export function applyCloudSpecialOriginSource(
    state: CloudSystemState,
    source: CloudSpecialOriginSource | undefined,
    deterministicSeed: number,
): ApplyCloudSpecialOriginSourceResult {
    const origin = state.classification.origin;
    if (origin.kind !== "special") return { state, issues: [] };
    if (!source) {
        return {
            state,
            issues: [{
                code: "missing-special-origin-source",
                message: `${origin.designation} requires a finite generating source.`,
            }],
        };
    }
    const issues = validateCloudSpecialOriginSource(source,
        state.classification.genus);
    if (source.designation !== origin.designation) {
        issues.push({
            code: "classification-source-designation-mismatch",
            message: `${origin.designation} cannot use a ${source.designation} source.`,
        });
    }
    if (origin.source === "aircraft-condensation-trail" &&
        source.kind !== "aircraft-exhaust-line" &&
        source.kind !== "aircraft-aerodynamic-line" &&
        source.kind !== "persistent-contrail-field") {
        issues.push({
            code: "classification-aircraft-source-mismatch",
            message: "The authored aircraft origin does not reference an aircraft source.",
        });
    }
    if (origin.source === "industrial-plume" &&
        source.kind !== "industrial-thermal") {
        issues.push({
            code: "classification-industrial-source-mismatch",
            message: "The authored industrial origin does not reference an industrial source.",
        });
    }
    if (issues.length > 0) return { state, issues };

    const lineageSeed = (deterministicSeed ^ textHash(source.id) ^
        textHash(source.kind)) >>> 0;
    const emission = source.emission;
    const ageFraction = clamp(source.ageSeconds / source.activeLifetimeSeconds);
    const isAircraft = source.kind === "aircraft-exhaust-line" ||
        source.kind === "aircraft-aerodynamic-line" ||
        source.kind === "persistent-contrail-field";
    const isConvective = source.kind === "wildfire-convection" ||
        source.kind === "volcanic-convection" ||
        source.kind === "industrial-thermal";
    const isLiquidSurface = source.kind === "waterfall-spray" ||
        source.kind === "forest-evapotranspiration";
    const sourceMaterialFraction = clamp(
        emission.waterVapor * 0.46 + emission.condensationNuclei * 0.18 +
        (1 - ageFraction) * 0.16,
        0.08,
        0.82,
    );
    const targetLiquidFraction = isAircraft ? 0.01
        : isLiquidSurface ? 0.995
            : state.classification.genus === "cumulonimbus"
                ? clamp(state.physical.condensate.liquidFraction, 0.28, 0.76)
                : clamp(state.physical.condensate.liquidFraction, 0.72, 1);
    const condensateGain = mix(0.82, 1.24,
        clamp(emission.waterVapor * 0.72 + emission.verticalMomentum * 0.28));
    const liquidWaterPath = isAircraft ? Math.min(0.015,
        state.physical.condensate.liquidWaterPath * 0.04)
        : clamp(state.physical.condensate.liquidWaterPath * condensateGain,
            0.002, 5);
    const iceWaterPath = isAircraft
        ? clamp(Math.max(0.008, state.physical.condensate.iceWaterPath) *
            mix(0.72, 1.34, emission.iceNuclei), 0.004, 1.2)
        : clamp(state.physical.condensate.iceWaterPath *
            mix(0.86, 1.18, emission.iceNuclei), 0, 3);
    const sourceUpdraft = source.kind === "wildfire-convection" ? 8 + 38 * emission.verticalMomentum
        : source.kind === "volcanic-convection" ? 10 + 48 * emission.verticalMomentum
            : source.kind === "industrial-thermal" ? 1 + 8 * emission.verticalMomentum
                : source.kind === "waterfall-spray" ? 0.25 + 2.4 * emission.verticalMomentum
                    : source.kind === "forest-evapotranspiration" ? 0.04 + 0.5 * emission.verticalMomentum
                        : 0;
    const windBlend = isAircraft ? 0.82 : 0.32;
    const stateResult: CloudSystemState = {
        ...state,
        extent: positionedExtent(state, source, lineageSeed),
        physical: {
            ...state.physical,
            thermodynamics: {
                ...state.physical.thermodynamics,
                relativeHumidity: clamp(Math.max(
                    state.physical.thermodynamics.relativeHumidity,
                    isAircraft ? 0.9 + emission.waterVapor * 0.25
                        : 0.82 + emission.waterVapor * 0.24,
                ), 0, 1.2),
                verticalVelocity: isConvective || isLiquidSurface
                    ? Math.max(state.physical.thermodynamics.verticalVelocity,
                        sourceUpdraft) : Math.min(1,
                        state.physical.thermodynamics.verticalVelocity),
                entrainment: clamp(state.physical.thermodynamics.entrainment *
                    mix(1.08, 0.58, emission.waterVapor), 0.02, 0.92),
            },
            kinematics: {
                ...state.physical.kinematics,
                windSpeed: mix(state.physical.kinematics.windSpeed,
                    source.advectionSpeedMps, windBlend),
                windDirection: mixAngle(state.physical.kinematics.windDirection,
                    source.advectionDirection, windBlend),
                verticalShear: isAircraft
                    ? Math.max(state.physical.kinematics.verticalShear,
                        source.advectionSpeedMps * 0.12)
                    : state.physical.kinematics.verticalShear,
            },
            condensate: {
                ...state.physical.condensate,
                liquidWaterPath,
                iceWaterPath,
                liquidFraction: targetLiquidFraction,
                dropletEffectiveRadius: isLiquidSurface
                    ? clamp(state.physical.condensate.dropletEffectiveRadius * 0.78,
                        4, 16)
                    : state.physical.condensate.dropletEffectiveRadius,
                iceEffectiveRadius: isAircraft
                    ? clamp(state.physical.condensate.iceEffectiveRadius, 12, 48)
                    : state.physical.condensate.iceEffectiveRadius,
            },
        },
    };
    return {
        state: stateResult,
        issues: [],
        metadata: {
            designation: origin.designation,
            sourceId: source.id,
            sourceKind: source.kind,
            sourceGeometry: source.geometry.kind,
            lineageSeed,
            ageFraction,
            sourceMaterialFraction,
            thermalLiftFraction: clamp(sourceUpdraft / 58),
            finiteFormationRadiusKm: [
                stateResult.extent.majorRadiusKm,
                stateResult.extent.minorRadiusKm,
            ],
        },
    };
}

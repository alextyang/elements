import { createHash } from "node:crypto";
import {
    HIGH_CLOUD_SPECIES_DESCRIPTORS,
    HIGH_CLOUD_TOPOLOGY_VARIANTS,
} from "../../components/backgrounds/sky/high-cloud-physical-foundation.ts";
import {
    MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
    MIDDLE_CLOUD_TOPOLOGY_VARIANTS,
} from "../../components/backgrounds/sky/middle-cloud-physical-foundation.ts";
import {
    LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
    LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS,
} from "../../components/backgrounds/sky/low-layered-cloud-physical-foundation.ts";
import {
    UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
    UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS,
} from "../../components/backgrounds/sky/upper-atmospheric-cloud-foundation.ts";

export const CLOUD_MACRO_ATLAS_SCHEMA = "elements-cloud-macro-atlas";
export const CLOUD_MACRO_ATLAS_VERSION = 2;
export const CLOUD_MACRO_ATLAS_GENERATOR_VERSION = "2.27.0";
export const CLOUD_MACRO_ATLAS_SEED = 0x6e756269;
export const CLOUD_PROTECTED_CU_RECONSTRUCTION_SCALE = 2;
export const CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS = Object.freeze([
    "cu-humilis",
    "cu-mediocris",
    "cu-congestus",
    "cu-congestus-turreted",
    "cu-congestus-multicell",
]);
const CLOUD_PROTECTED_CU_RECONSTRUCTION_ID_SET = new Set(
    CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS,
);
export const CLOUD_HIGH_ICE_RECONSTRUCTION_SCALE = 2;
export const CLOUD_HIGH_ICE_MOMENT_SIDECAR_SCHEMA =
    "elements-cloud-high-ice-moment-sidecar";
export const CLOUD_HIGH_ICE_MOMENT_SIDECAR_VERSION = 1;
export const CLOUD_HIGH_ICE_MOMENT_SIDECAR_FILE =
    "cloud-high-ice-moments-v1-rg8-48.bin";
/**
 * Authoritative fine source-density/support payload for the non-analytic high-ice
 * owners.  Ci fibratus (and its split/depth-shear variants) deliberately
 * remain analytic in the runtime and therefore do not consume this atlas.
 */
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_SCHEMA =
    "elements-cloud-high-ice-source-atlas";
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_VERSION = 1;
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_FILE =
    "cloud-high-ice-sources-v1-rgba8-96.bin";
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION = 96;
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS = 1;
export const CLOUD_HIGH_ICE_RECONSTRUCTION_IDS = Object.freeze([
    "ci-uncinus",
    "ci-spissatus",
    "ci-floccus",
    "ci-castellanus",
    "cs-veil",
    "cs-fibratus",
    "cc-stratiformis",
    "cc-stratiformis-dispersive",
    "cc-castellanus",
    "cc-floccus",
    "cc-lenticularis",
]);
const CLOUD_HIGH_ICE_RECONSTRUCTION_ID_SET = new Set(
    CLOUD_HIGH_ICE_RECONSTRUCTION_IDS,
);
// The source atlas follows the high-ice reconstruction set exactly.  Keeping
// this alias explicit prevents an analytic Ci fibratus owner from silently
// acquiring a stale texture slot if the reconstruction list changes later.
export const CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS = Object.freeze([
    ...CLOUD_HIGH_ICE_RECONSTRUCTION_IDS,
]);
export const CLOUD_MACRO_VOLUME_IDS = [
    "cu-humilis",
    "cu-mediocris",
    "cu-congestus",
    "cb-calvus",
    "cb-capillatus",
    "cb-capillatus-incus",
    "cb-dissipating",
    "ci-fibratus",
    "ci-uncinus",
    "ci-spissatus",
    "ci-floccus",
    "ci-castellanus",
    "cs-veil",
    "cc-stratiformis",
    "cc-castellanus",
    "cc-floccus",
    "cc-lenticularis",
    "ac-stratiformis",
    "ac-castellanus",
    "ac-floccus",
    "ac-lenticularis",
    "ac-volutus",
    "as-opacus",
    "ns-precipitating",
    "sc-stratiformis",
    "sc-castellanus",
    "sc-floccus",
    "sc-lenticularis",
    "sc-volutus",
    "st-nebulosus",
    "st-fractus",
    "cu-fractus",
    "cu-congestus-turreted",
    "cu-congestus-multicell",
    "cb-calvus-multicell",
    "cb-capillatus-sheared",
    "cb-capillatus-incus-back-sheared",
    "cb-dissipating-remnant",
    // Appended so every pre-existing volume index and Cu/Cb byte block stays
    // stable while the two remaining WebGPU 3D-texture slots materialize the
    // WMO-distinct high/middle optical forms that cannot share one macroshape.
    "cs-fibratus",
    "as-translucidus",
    // Existing family IDs remain append-only. The atlas is spatially tiled
    // from generator 2.21 onward, so bounded additional 48^3 anatomies no
    // longer compete for the final slices of one 2048-deep column.
    "cc-stratiformis-dispersive",
    "ci-fibratus-split-source",
    "ci-fibratus-depth-shear",
    // Orthogonal Sc stratiformis organization manifolds. The historical
    // `sc-stratiformis` index remains the finite closed-cell colony.
    "sc-stratiformis-closed-overhead",
    "sc-stratiformis-open-field",
    "sc-stratiformis-street-packet",
    "sc-stratiformis-transition-mosaic",
    // Nimbostratus parent bodies are causal shield anatomies. Hydrometeor
    // fall domains and pannus owners remain separate runtime systems.
    "ns-deepening-altostratus-shield",
    "ns-generating-cell-shield",
    "ns-thickened-low-deck-shield",
];

export const CLOUD_EXTERIOR_BOUNDARY_SCHEMA = "elements-cloud-exterior-boundary";
export const CLOUD_EXTERIOR_BOUNDARY_VERSION = 1;

/**
 * Physical narrow-band classes used by the future shader to up-res the
 * authoritative macro silhouette. Distances are fractions of one canonical
 * owner extent, so world placement converts them to metres without changing
 * the atlas. The density ceiling is an extinction-field upper bound, not an
 * authored opacity.
 */
export const CLOUD_EXTERIOR_DETAIL_CLASSES = Object.freeze({
    "liquid-cauli": Object.freeze({
        maximumCanonicalDisplacement: 0.058,
        maximumExteriorDensity: 0.72,
        axisScale: Object.freeze([1, 1.15, 1]),
        topology: "nested-buoyant-lobes-and-clefts",
    }),
    "liquid-turret": Object.freeze({
        maximumCanonicalDisplacement: 0.070,
        maximumExteriorDensity: 0.76,
        axisScale: Object.freeze([1, 1.22, 1]),
        topology: "rising-turret-corona-and-entrainment-bites",
    }),
    "liquid-scud": Object.freeze({
        maximumCanonicalDisplacement: 0.050,
        maximumExteriorDensity: 0.54,
        axisScale: Object.freeze([1.12, 0.72, 1.18]),
        topology: "advected-ragged-shreds-and-concave-erosion",
    }),
    "stratiform-ragged": Object.freeze({
        maximumCanonicalDisplacement: 0.034,
        maximumExteriorDensity: 0.48,
        axisScale: Object.freeze([1.18, 0.42, 1.18]),
        topology: "finite-frontal-edge-fray-and-dry-air-scallops",
    }),
    "ice-fibre": Object.freeze({
        maximumCanonicalDisplacement: 0.066,
        maximumExteriorDensity: 0.46,
        axisScale: Object.freeze([1, 0.74, 1.30]),
        topology: "sheared-anisotropic-fibres",
    }),
    "ice-sedimentation": Object.freeze({
        maximumCanonicalDisplacement: 0.082,
        maximumExteriorDensity: 0.40,
        axisScale: Object.freeze([0.82, 1.26, 1.18]),
        topology: "tapered-fallstreaks-and-virga",
    }),
    "laminar-wave": Object.freeze({
        maximumCanonicalDisplacement: 0.020,
        maximumExteriorDensity: 0.44,
        axisScale: Object.freeze([1, 0.28, 0.88]),
        topology: "smooth-wave-surface-with-finite-edge-fray",
    }),
});

const wgslFloat = (value) => {
    const fixed = Number(value).toFixed(8).replace(/0+$/, "");
    return fixed.endsWith(".") ? `${fixed}0` : fixed;
};

/**
 * Emit the shared protected Cu condensation base from the same generated
 * volume contracts serialized into the atlas manifest. All protected Cumulus
 * exemplars use one LCL plane, so generation fails if those contracts diverge.
 */
export const createCloudProtectedCuBaseContractWgsl = (volumes) => {
    const protectedCu = volumes.filter((volume) =>
        volume.classification.genus === "cumulus" &&
        volume.exteriorBoundary.protectedBase.downwardDisplacementScale === 0);
    if (protectedCu.length < 1) {
        throw new Error("Cloud atlas has no protected Cumulus volumes");
    }
    const normalizedAltitude =
        protectedCu[0].exteriorBoundary.protectedBase.normalizedAltitude;
    for (const volume of protectedCu) {
        const candidate =
            volume.exteriorBoundary.protectedBase.normalizedAltitude;
        if (Math.abs(candidate - normalizedAltitude) > 1e-12) {
            throw new Error(
                `Protected Cumulus base ${volume.id} diverged from the shared LCL`,
            );
        }
    }
    return "// Generated by scripts/generate-cloud-volume-atlas.mjs.\n" +
        "const CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE: f32 = " +
        `${wgslFloat(normalizedAltitude)};`;
};

/**
 * One canonical atlas volume cannot contain every runtime topology variant,
 * but it must be a physically valid member of the same family rather than a
 * generic scale-adjusted template. These bindings point each non-convective
 * atlas slot at the renderer-neutral descriptor and one representative
 * production topology. The physical element scale is kept distinct from the
 * complete formation span; `canonicalElementFraction` is only the
 * reconstructible 48^3 proxy used for the macro silhouette.
 */
const NON_CONVECTIVE_FOUNDATION_BINDINGS = Object.freeze({
    "ci-fibratus": ["high", "cirrus-fibratus", "irregular-curved"],
    "ci-fibratus-split-source": ["high", "cirrus-fibratus", "straight-separated"],
    "ci-fibratus-depth-shear": ["high", "cirrus-fibratus", "entangled-shear"],
    "ci-uncinus": ["high", "cirrus-uncinus", "paired-sheared-hooks"],
    "ci-spissatus": ["high", "cirrus-spissatus", "natural-irregular-patch"],
    "ci-floccus": ["high", "cirrus-floccus", "virga-bearing-tufts"],
    "ci-castellanus": ["high", "cirrus-castellanus", "broken-castle-line"],
    "cs-veil": ["upper", "cirrostratus-nebulosus", "cirrostratus-nebulosus-invading-front"],
    "cs-fibratus": ["upper", "cirrostratus-fibratus", "invading-fibrous-front"],
    "cc-stratiformis": ["high", "cirrocumulus-stratiformis", "broken-grain-sheet"],
    "cc-stratiformis-dispersive": ["high", "cirrocumulus-stratiformis", "finite-ripple-packet"],
    "cc-castellanus": ["high", "cirrocumulus-castellanus", "broken-common-base"],
    "cc-floccus": ["high", "cirrocumulus-floccus", "eroded-castellanus-remnant"],
    "cc-lenticularis": ["high", "cirrocumulus-lenticularis", "unequal-paired-lenses"],
    "ac-stratiformis": ["middle", "altocumulus-stratiformis", "broken-cellular-layer"],
    "ac-castellanus": ["middle", "altocumulus-castellanus", "tall-instability-line"],
    "ac-floccus": ["middle", "altocumulus-floccus", "ice-virga-tufts"],
    "ac-lenticularis": ["middle", "altocumulus-lenticularis", "stacked-orographic-lenses"],
    "ac-volutus": ["middle", "altocumulus-volutus", "tapered-rolling-tube"],
    "as-opacus": ["middle", "altostratus-opacus", "layered-opaque-deck"],
    "as-translucidus": ["middle", "altostratus-translucidus", "ground-glass-shield"],
    "ns-precipitating": ["low", "nimbostratus-praecipitatio", "continuous-rain-frontal-shield"],
    "ns-deepening-altostratus-shield": ["low", "nimbostratus", "deepening-altostratus-shield"],
    "ns-generating-cell-shield": ["low", "nimbostratus", "generating-cell-stratiform-shield"],
    "ns-thickened-low-deck-shield": ["low", "nimbostratus", "thickened-low-deck-nimbostratus"],
    "sc-stratiformis": ["low", "stratocumulus-stratiformis", "closed-cell-radiative-deck"],
    "sc-stratiformis-closed-overhead": ["low", "stratocumulus-stratiformis", "closed-cell-radiative-deck"],
    "sc-stratiformis-open-field": ["low", "stratocumulus-stratiformis", "drizzling-open-cell-field"],
    "sc-stratiformis-street-packet": ["low", "stratocumulus-stratiformis", "finite-street-and-broken-deck"],
    "sc-stratiformis-transition-mosaic": ["low", "stratocumulus-stratiformis", "closed-open-transition-mosaic"],
    "sc-castellanus": ["low", "stratocumulus-castellanus", "crenellated-low-deck"],
    "sc-floccus": ["low", "stratocumulus-floccus", "castellanus-remnant-low-tufts"],
    "sc-lenticularis": ["low", "stratocumulus-lenticularis", "grouped-element-lens"],
    "sc-volutus": ["low", "stratocumulus-volutus", "curved-solitary-boundary-roll"],
    "st-nebulosus": ["low", "stratus-nebulosus", "advected-coastal-stratus-bank"],
    "st-fractus": ["low", "stratus-fractus", "sheared-low-fragment-field"],
});

const foundationTables = Object.freeze({
    high: {
        descriptors: HIGH_CLOUD_SPECIES_DESCRIPTORS,
        variants: HIGH_CLOUD_TOPOLOGY_VARIANTS,
    },
    middle: {
        descriptors: MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
        variants: MIDDLE_CLOUD_TOPOLOGY_VARIANTS,
    },
    low: {
        descriptors: LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
        variants: LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS,
    },
    upper: {
        descriptors: UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
        variants: UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS,
    },
});

const geometricMidpoint = (range) => Math.sqrt(range[0] * range[1]);

const foundationProfileForConfig = (config) => {
    const binding = NON_CONVECTIVE_FOUNDATION_BINDINGS[config.id];
    if (!binding) return null;
    const [family, representation, topologyVariantId] = binding;
    const table = foundationTables[family];
    const descriptor = table.descriptors[representation];
    const topology = table.variants[representation].find(
        (candidate) => candidate.id === topologyVariantId,
    );
    if (!descriptor || !topology) {
        throw new Error(
            `${config.id} foundation binding ${family}/${representation}/` +
            `${topologyVariantId} is not reachable`,
        );
    }
    const elementRange = descriptor.elementDiameterKm ?? null;
    const formationSpanKm = descriptor.formationSpanKm;
    const physicalElementToFormationRatio = elementRange
        ? geometricMidpoint(elementRange) / geometricMidpoint(formationSpanKm)
        : 0;
    // Preserve the real ratio in metadata. The macro proxy is deliberately
    // clamped to several voxels so trilinear reconstruction cannot enlarge a
    // sub-voxel grain into an accidental low-cloud puff.
    const canonicalElementFraction = elementRange
        ? clamp(physicalElementToFormationRatio * 5.4, 0.034, 0.19)
        : 0;
    return Object.freeze({
        family,
        representation,
        topologyVariantId,
        connectivity: topology.connectivity,
        mechanism: topology.mechanism,
        elementKind: descriptor.elementKind,
        elementDiameterKm: elementRange,
        formationSpanKm,
        physicalElementToFormationRatio,
        canonicalElementFraction,
        macroElementCount: topology.macroElementCount ?? [1, 1],
        hierarchyLevels: topology.hierarchyLevels,
        formationAspectRatio: topology.formationAspectRatio,
        minimumSpacingVariation: topology.minimumSpacingVariation,
        maximumMirrorSimilarity: topology.maximumMirrorSimilarity,
        requiredMorphology: descriptor.requiredMorphology,
        forbiddenMorphology: descriptor.forbiddenMorphology,
    });
};

const topologyPolicyForFoundation = (profile, fallback) => {
    if (!profile) return fallback;
    // The materialized Sc stratiformis exemplar is the radiatively driven
    // closed-cell deck. Its cell masses and cloudy perimeter walls form one
    // inversion-bounded condensate sheet; open-cell colonies remain the
    // logically separate broken-wall topology. Treating the closed deck as a
    // detached cloudlet population contradicted both the foundation and its
    // real mesoscale connectivity.
    if (
        profile.representation === "stratocumulus-stratiformis" &&
        profile.topologyVariantId === "closed-cell-radiative-deck"
    ) return "single-connected";
    if (
        profile.connectivity === "single-common-base" ||
        profile.connectivity === "single-roll-tube" ||
        profile.connectivity === "finite-roll" ||
        profile.connectivity === "continuous-layer" ||
        profile.connectivity === "continuous-fibrous-veil" ||
        profile.connectivity === "continuous-nebulous-veil" ||
        profile.connectivity === "deep-continuous-layer"
    ) return "single-connected";
    if (profile.connectivity === "irregular-dense-patch") {
        return "irregular-patch";
    }
    if (
        profile.connectivity === "detached-tufts" ||
        profile.connectivity === "detached-fragments" ||
        profile.connectivity === "separate-fibres"
    ) return "fragmented-population";
    if (
        profile.connectivity === "extensive-broken-sheet" ||
        profile.connectivity === "extensive-element-sheet" ||
        profile.connectivity === "cellular-sheet"
    ) return "cellular-colony";
    if (
        profile.connectivity === "finite-wave-packet" ||
        profile.connectivity === "finite-wave-lens"
    ) return "wave-packet";
    return fallback;
};

const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (low, high, amount) => low + (high - low) * amount;
const smoothstep = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / Math.max(1e-9, edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const fade = (value) => value * value * value * (value * (value * 6 - 15) + 10);

const hashInteger = (value) => {
    let result = value | 0;
    result = Math.imul(result ^ (result >>> 16), 0x7feb352d);
    result = Math.imul(result ^ (result >>> 15), 0x846ca68b);
    return (result ^ (result >>> 16)) >>> 0;
};

const hashString = (value) => {
    let result = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        result ^= value.charCodeAt(index);
        result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
};

const hash3 = (x, y, z, seed) => hashInteger(
    Math.imul(x | 0, 0x1f123bb5) ^
    Math.imul(y | 0, 0x5f356495) ^
    Math.imul(z | 0, 0x2c1b3c6d) ^
    Math.imul(seed | 0, 0x297a2d39),
) / 4294967296;

const makeRandom = (seed) => {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
};

const valueNoise3 = (x, y, z, seed) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    const tx = fade(x - x0);
    const ty = fade(y - y0);
    const tz = fade(z - z0);
    const sample = (dx, dy, dz) => hash3(x0 + dx, y0 + dy, z0 + dz, seed);
    const lower = mix(
        mix(sample(0, 0, 0), sample(1, 0, 0), tx),
        mix(sample(0, 1, 0), sample(1, 1, 0), tx),
        ty,
    );
    const upper = mix(
        mix(sample(0, 0, 1), sample(1, 0, 1), tx),
        mix(sample(0, 1, 1), sample(1, 1, 1), tx),
        ty,
    );
    return mix(lower, upper, tz);
};

const fbm3 = (x, y, z, seed) => {
    let value = 0;
    let amplitude = 0.56;
    let frequency = 1;
    for (let octave = 0; octave < 4; octave += 1) {
        value += valueNoise3(
            x * frequency,
            y * frequency,
            z * frequency,
            seed + octave * 101,
        ) * amplitude;
        frequency *= 2.07;
        amplitude *= 0.48;
    }
    return value / 1.064;
};

const ridgedFbm3 = (x, y, z, seed) => {
    let value = 0;
    let weight = 0.58;
    let frequency = 1;
    let normalization = 0;
    for (let octave = 0; octave < 4; octave += 1) {
        const ridge = 1 - Math.abs(valueNoise3(
            x * frequency,
            y * frequency,
            z * frequency,
            seed + octave * 131,
        ) * 2 - 1);
        value += ridge * ridge * weight;
        normalization += weight;
        frequency *= 2.13;
        weight *= 0.46;
    }
    return value / normalization;
};

// The coarse atlas owns the macro silhouette. A small, divergence-like domain
// warp is therefore applied before primitive evaluation rather than relying on
// detail noise to disguise smooth ellipsoids after the fact. The amplitudes are
// intentionally sub-lobe-scale so connected thermal and sheet topology survives.
const warpPoint3 = (x, y, z, seed, strength, anisotropy = [1, 1, 1]) => [
    x + (fbm3(x * 3.7 + 11.2, y * 3.1 - 5.4, z * 3.5 + 2.1, seed + 17) - 0.5) * strength * anisotropy[0],
    y + (fbm3(x * 3.2 - 7.3, y * 3.9 + 8.1, z * 3.4 - 1.9, seed + 43) - 0.5) * strength * anisotropy[1],
    z + (fbm3(x * 3.4 + 4.8, y * 3.3 - 9.7, z * 3.8 + 6.2, seed + 79) - 0.5) * strength * anisotropy[2],
];

const addEllipsoid = (shapes, center, radii, options = {}) => {
    shapes.push({
        center,
        radii,
        rotation: options.rotation ?? 0,
        density: options.density ?? 1,
        detail: options.detail ?? 0.1,
        phase: options.phase ?? 0,
        role: options.role ?? "thermal",
        // Deep liquid clouds may opt individual authored parcels into the
        // erosion-resistant core.  Keeping this on the primitive instead of
        // inferring it from a broad role is important at atlas resolution:
        // otherwise every connector and historical pulse becomes one hard
        // union before reconstruction.
        protectedCoreInset: options.protectedCoreInset ?? null,
    });
};

const addThermalPlume = (shapes, random, config, branchIndex) => {
    const {
        baseY,
        topY,
        levels,
        centerX,
        centerZ,
        radius,
        driftX,
        driftZ,
        branchScale,
        glaciationStart,
        detailBase,
    } = config;
    const crownMode = config.crownMode ?? "liquid";
    const pathPhase = random() * Math.PI * 2;
    const pathFrequency = mix(0.62, 1.28, random());
    const curveAmplitude = radius * mix(config.towering ? 0.34 : 0.20, config.towering ? 0.68 : 0.44, random());
    for (let level = 0; level < levels; level += 1) {
        const t = levels === 1 ? 1 : level / (levels - 1);
        // Successive parcels are intentionally unequal and laterally offset.
        // A small radius modulation made the union read as one extruded
        // capsule; real congestus exposes distinct rising thermals at several
        // scales even though their interiors remain connected.
        const thermalPulse =
            0.82 +
            Math.sin(t * Math.PI * (2.15 + branchIndex * 0.19) + branchIndex * 0.91) * 0.22 +
            Math.sin(t * Math.PI * 5.1 + branchIndex * 1.7) * 0.075;
        const crownExpansion = smoothstep(0.66, 1, t) * (config.crownExpansion ?? 0.24);
        const congestusMorphology = config.morphologyVariant !== undefined;
        const mergedBodyExpansion = config.towering
            ? Math.pow(Math.sin(t * Math.PI), congestusMorphology ? 1.22 : 1.15) *
                (congestusMorphology
                    ? config.morphologyVariant === "multicell" ? 0.16 : 0.21
                    : 0.38)
            : Math.sin(t * Math.PI) * 0.10;
        const horizontalRadius = radius * branchScale * Math.max(
            config.towering ? 0.74 : 0.62,
            thermalPulse + crownExpansion + mergedBodyExpansion,
        );
        const verticalRadius = horizontalRadius * mix(
            congestusMorphology ? 0.68 : 0.70,
            congestusMorphology ? 0.91 : 0.94,
            smoothstep(0.5, 1, t),
        );
        const phase = smoothstep(glaciationStart, 1, t);
        const detail = mix(detailBase, 0.62, phase);
        const y = mix(baseY, topY, t);

        const curve = Math.sin(pathPhase + t * Math.PI * pathFrequency) - Math.sin(pathPhase);
        const crossCurve = Math.sin(pathPhase * 0.73 + t * Math.PI * (pathFrequency + 0.37)) -
            Math.sin(pathPhase * 0.73);
        const x = centerX + driftX * t + curve * curveAmplitude * mix(0.32, 1, t);
        const z = centerZ + driftZ * t + crossCurve * curveAmplitude * mix(0.28, 0.86, t);

        addEllipsoid(shapes, [x, y, z], [
            horizontalRadius * mix(0.92, 1.12, random()),
            verticalRadius,
            horizontalRadius * mix(0.84, 1.08, random()),
        ], {
            density: mix(0.92, 1.05, random()),
            detail,
            phase,
            rotation: (random() - 0.5) * 0.72,
            role: phase > 0.55 ? "glaciated-crown" : "thermal",
        });

        // Corona thermals approximate successive buoyant pulses around the
        // coherent updraft. They overlap the parent but vary in scale, azimuth,
        // and height, producing a cauliflower boundary rather than a visible
        // chain of equally sized ellipsoids.
        if (level > 0) {
            const crownLevel = level === levels - 1;
            const pulseGate = (level + branchIndex) % 3 !== 1 || t > 0.58;
            const daughterCount = crownLevel
                ? (crownMode === "liquid"
                    ? congestusMorphology ? 7 : 5
                    : crownMode === "calvus" ? 2 : 1)
                : pulseGate
                    ? (t > 0.64
                        ? congestusMorphology ? 4 : 3
                        : congestusMorphology ? 3 : 2)
                    : congestusMorphology ? 2 : 1;
            const coronaPhase = random() * Math.PI * 2;
            for (let daughter = 0; daughter < daughterCount; daughter += 1) {
                const azimuth = coronaPhase + daughter * 2.399963229728653;
                const daughterRadius = Math.max(
                    congestusMorphology
                        ? config.towering ? 0.026 : 0.024
                        : config.towering ? 0.040 : 0.026,
                    horizontalRadius * mix(
                    crownLevel ? congestusMorphology ? 0.26 : 0.38 : congestusMorphology ? 0.23 : 0.32,
                    crownLevel && crownMode === "liquid"
                        ? congestusMorphology ? 0.51 : 0.66
                        : congestusMorphology ? 0.44 : 0.56,
                    random(),
                ));
                const offset = horizontalRadius * mix(
                    crownLevel ? congestusMorphology ? 0.67 : 0.42 : congestusMorphology ? 0.62 : 0.47,
                    crownLevel ? congestusMorphology ? 1.04 : 0.88 : congestusMorphology ? 0.94 : 0.76,
                    random(),
                );
                const daughterCenter = [
                    x + Math.cos(azimuth) * offset,
                    y + verticalRadius * mix(crownLevel ? -0.18 : 0.04, crownLevel ? 0.38 : 0.42, random()),
                    z + Math.sin(azimuth) * offset * mix(0.72, 1.08, random()),
                ];
                addEllipsoid(shapes, [
                    daughterCenter[0], daughterCenter[1], daughterCenter[2],
                ], [
                    daughterRadius * mix(0.84, 1.16, random()),
                    daughterRadius * mix(0.78, 1.03, random()),
                    daughterRadius * mix(0.82, 1.12, random()),
                ], {
                    density: mix(0.89, 0.98, random()),
                    detail,
                    phase,
                    rotation: (random() - 0.5) * 1.1,
                    role: phase > 0.55 ? "glaciated-crown" : "thermal",
                });

                // A smaller, offset tertiary pulse is retained in the coarse
                // support rather than delegated to detail noise.  Buoyant
                // cumuli organize as nested thermals; this second hierarchy is
                // what keeps a 48^3 silhouette from collapsing to smooth ovals.
                if (
                    t > (congestusMorphology ? 0.30 : 0.42) &&
                    daughterRadius > (congestusMorphology ? 0.022 : 0.026) &&
                    (congestusMorphology
                        ? (daughter + level + branchIndex) % 2 === 0
                        : (daughter + level) % 2 === 0) &&
                    (crownMode === "liquid" || !crownLevel)
                ) {
                    const budAzimuth = azimuth + mix(0.55, 1.25, random());
                    const budRadius = daughterRadius * mix(
                        congestusMorphology ? 0.34 : 0.38,
                        congestusMorphology ? 0.52 : 0.56,
                        random(),
                    );
                    addEllipsoid(shapes, [
                        daughterCenter[0] + Math.cos(budAzimuth) * daughterRadius * 0.58,
                        daughterCenter[1] + daughterRadius * mix(0.34, 0.66, random()),
                        daughterCenter[2] + Math.sin(budAzimuth) * daughterRadius * 0.50,
                    ], [
                        budRadius * mix(0.88, 1.14, random()),
                        budRadius * mix(0.82, 1.06, random()),
                        budRadius * mix(0.84, 1.12, random()),
                    ], {
                        density: mix(0.84, 0.95, random()),
                        detail,
                        phase,
                        rotation: (random() - 0.5) * 1.3,
                        role: phase > 0.55 ? "glaciated-crown" : "thermal-bud",
                    });
                }
            }
        }
    }
};

const addMergedConvectiveBody = (shapes, random, config, baseY) => {
    if (config.topY < 0.70) return 0;
    const storm = Boolean(config.storm);
    const levelCount = storm ? 7 : 6;
    const pulseScales = storm
        ? [1.48, 1.82, 1.62, 2.04, 1.70, 2.14, 1.90]
        : config.morphologyVariant === "multicell"
            ? [1.22, 1.52, 1.31, 1.63, 1.38, 1.72]
            : config.morphologyVariant === "turreted"
                ? [1.18, 1.43, 1.29, 1.58, 1.35, 1.66]
                : [1.27, 1.58, 1.36, 1.72, 1.43, 1.79];
    const phase = random() * Math.PI * 2;
    let added = 0;
    for (let level = 0; level < levelCount; level += 1) {
        const t = level / Math.max(1, levelCount - 1);
        const scale = pulseScales[level] * mix(0.94, 1.06, random());
        const horizontalRadius = config.radius * scale;
        const congestusMorphology = config.morphologyVariant !== undefined;
        const center = [
            0.5 + Math.sin(phase + t * Math.PI * 1.55) * mix(
                congestusMorphology ? 0.022 : 0.018,
                congestusMorphology ? 0.092 : 0.060,
                t,
            ) + (random() - 0.5) * (congestusMorphology ? 0.028 : 0.018),
            mix(baseY + 0.145, config.topY * (storm ? 0.76 : 0.78), t) +
                (congestusMorphology
                    ? (random() - 0.5) * mix(0.008, 0.030, t)
                    : 0),
            0.49 + Math.sin(phase * 0.61 + t * Math.PI * 1.17) * mix(
                congestusMorphology ? 0.024 : 0.020,
                congestusMorphology ? 0.096 : 0.068,
                t,
            ) + (random() - 0.5) * (congestusMorphology ? 0.030 : 0.020),
        ];
        addEllipsoid(shapes, center, [
            horizontalRadius * mix(0.92, 1.16, random()),
            horizontalRadius * mix(0.68, 0.88, random()),
            horizontalRadius * mix(0.84, 1.12, random()),
        ], {
            density: mix(0.90, 1.02, random()),
            detail: config.detailBase,
            phase: smoothstep(config.glaciationStart, 1, t),
            rotation: mix(-0.70, 0.70, random()),
            role: "thermal-mass",
        });
        added += 1;

        // Two or three unequal perimeter bubbles leave readable clefts between
        // successive toroidal pulses. A complete ring of equally sized lobes
        // unions back into the smooth cotton-ball hull this hierarchy is meant
        // to replace.
        const flankCount = 2 + ((level + (storm ? 1 : 0)) % 2);
        const flankPhase = random() * Math.PI * 2;
        for (let flank = 0; flank < flankCount; flank += 1) {
            const angle = flankPhase + flank * 2.399963229728653;
            // One upper bubble becomes the visibly dominant detrainment side
            // of the crown. This is the coarse 48^3 analogue of the asymmetric
            // toroidal-vortex shell seen in high-resolution cumulus LES.
            const dominantCrownBubble = t > 0.54 && flank === 0;
            const flankRadius = horizontalRadius * mix(
                congestusMorphology ? 0.34 : 0.42,
                dominantCrownBubble
                    ? congestusMorphology ? 0.72 : 0.82
                    : congestusMorphology ? 0.57 : 0.66,
                random(),
            ) *
                (dominantCrownBubble ? 1.12 : 1);
            const offset = horizontalRadius * mix(
                congestusMorphology ? 0.84 : 0.72,
                dominantCrownBubble
                    ? congestusMorphology ? 1.38 : 1.26
                    : congestusMorphology ? 1.20 : 1.10,
                random(),
            );
            const flankCenter = [
                center[0] + Math.cos(angle) * offset,
                center[1] + flankRadius * mix(-0.12, dominantCrownBubble ? 0.76 : 0.54, random()),
                center[2] + Math.sin(angle) * offset * mix(0.76, 1.08, random()),
            ];
            addEllipsoid(shapes, flankCenter, [
                flankRadius * mix(0.90, 1.16, random()),
                flankRadius * mix(0.78, 1.04, random()),
                flankRadius * mix(0.86, 1.12, random()),
            ], {
                density: mix(0.84, 0.97, random()),
                detail: config.detailBase,
                phase: smoothstep(config.glaciationStart, 1, t),
                rotation: angle,
                role: "thermal-mass-flank",
            });
            added += 1;
            if ((level + flank) % 3 === 0) {
                const budRadius = Math.max(0.030, flankRadius * mix(0.44, 0.62, random()));
                addEllipsoid(shapes, [
                    flankCenter[0] + Math.cos(angle + 0.8) * budRadius * 0.72,
                    flankCenter[1] + budRadius * mix(0.48, 0.82, random()),
                    flankCenter[2] + Math.sin(angle + 0.8) * budRadius * 0.66,
                ], [budRadius * 1.08, budRadius, budRadius * 0.96], {
                    density: 0.84,
                    detail: config.detailBase,
                    phase: smoothstep(config.glaciationStart, 1, t),
                    rotation: angle + 0.8,
                    role: "thermal-mass-bud",
                });
                added += 1;
            }
        }
    }
    return added;
};

const addEvaporatingConvectiveFlanks = (shapes, random, config, baseY) => {
    const candidates = shapes.filter((shape) =>
        [
            "thermal", "thermal-bud", "thermal-mass-flank",
            "thermal-mass-bud", "thermal-junction-bud",
            "thermal-shell-pulse", "thermal-cusp",
        ].includes(shape.role) &&
        shape.center[1] > baseY + 0.08 &&
        shape.center[1] < config.topY - 0.015
    );
    const count = config.dissipating
        ? 22
        : config.storm
            ? 16
            : config.topY >= 0.70
                ? 14
                : config.topY >= 0.50 ? 7 : 4;
    let added = 0;
    for (let index = 0; index < count && candidates.length > 0; index += 1) {
        const anchor = candidates[Math.floor(random() * candidates.length)];
        let outwardX = anchor.center[0] - 0.5;
        let outwardZ = anchor.center[2] - 0.49;
        const outwardLength = Math.hypot(outwardX, outwardZ);
        if (outwardLength < 0.025) {
            const azimuth = random() * Math.PI * 2;
            outwardX = Math.cos(azimuth);
            outwardZ = Math.sin(azimuth);
        } else {
            outwardX /= outwardLength;
            outwardZ /= outwardLength;
        }
        const anchorRadius = Math.max(anchor.radii[0], anchor.radii[2]);
        const width = mix(0.026, config.dissipating ? 0.066 : 0.052, random());
        const stretch = mix(1.20, 2.30, random());
        const radialOffset = anchorRadius * mix(0.74, 1.22, random());
        addEllipsoid(shapes, [
            anchor.center[0] + outwardX * radialOffset,
            anchor.center[1] + width * mix(-0.78, 0.40, random()),
            anchor.center[2] + outwardZ * radialOffset,
        ], [
            width * mix(0.58, 1.12, random()) * (Math.abs(outwardZ) * 0.55 + 0.72),
            width * mix(0.34, 0.66, random()),
            width * stretch * (Math.abs(outwardX) * 0.48 + 0.68),
        ], {
            density: mix(config.dissipating ? 0.30 : 0.36, config.dissipating ? 0.54 : 0.60, random()),
            detail: mix(0.18, 0.42, random()),
            phase: smoothstep(config.glaciationStart, 1, anchor.center[1] / Math.max(0.001, config.topY)),
            rotation: Math.atan2(outwardZ, outwardX) + mix(-0.55, 0.55, random()),
            role: "evaporating-flank",
        });
        added += 1;
    }
    return added;
};

const VOLUME_CONFIGS = [
    {
        id: "cu-humilis",
        label: "Cumulus humilis",
        genus: "cumulus",
        species: "humilis",
        lifecycle: "mature",
        topY: 0.32,
        branches: 3,
        levels: 4,
        radius: 0.090,
        baseWidth: 0.36,
        baseDepth: 0.23,
        glaciationStart: 2,
        cavityCount: 10,
        detailBase: 0.08,
        densityScale: 0.92,
        builder: "cumulus",
    },
    {
        id: "cu-mediocris",
        label: "Cumulus mediocris",
        genus: "cumulus",
        species: "mediocris",
        lifecycle: "growing",
        topY: 0.58,
        branches: 4,
        levels: 8,
        radius: 0.110,
        baseWidth: 0.25,
        baseDepth: 0.19,
        glaciationStart: 2,
        cavityCount: 16,
        detailBase: 0.09,
        densityScale: 0.96,
        builder: "cumulus",
    },
    {
        id: "cu-congestus",
        label: "Cumulus congestus",
        genus: "cumulus",
        species: "congestus",
        lifecycle: "growing",
        topY: 0.79,
        branches: 5,
        levels: 12,
        radius: 0.115,
        baseWidth: 0.245,
        baseDepth: 0.19,
        glaciationStart: 2,
        cavityCount: 30,
        // Values above the liquid-turret selector threshold use the calmer
        // cauliflower exterior displacement. The explicit macro tree owns
        // the turrets; procedural edge noise must not redraw them.
        detailBase: 0.38,
        densityScale: 1,
        crownExpansion: 0.30,
        morphologyVariant: "balanced",
        builder: "cumulus",
    },
    {
        id: "cb-calvus",
        label: "Cumulonimbus calvus",
        genus: "cumulonimbus",
        species: "calvus",
        lifecycle: "mature",
        topY: 0.86,
        branches: 5,
        levels: 14,
        radius: 0.086,
        baseWidth: 0.325,
        baseDepth: 0.235,
        glaciationStart: 0.86,
        cavityCount: 34,
        detailBase: 0.11,
        densityScale: 1.04,
        crownExpansion: 0.38,
        storm: true,
        builder: "cumulonimbus",
        morphologyVariant: "single-pulse",
    },
    {
        id: "cb-capillatus",
        label: "Cumulonimbus capillatus",
        genus: "cumulonimbus",
        species: "capillatus",
        lifecycle: "glaciating",
        topY: 0.87,
        branches: 6,
        levels: 15,
        radius: 0.083,
        baseWidth: 0.34,
        baseDepth: 0.24,
        glaciationStart: 0.68,
        cavityCount: 36,
        detailBase: 0.11,
        densityScale: 1.02,
        crownExpansion: 0.46,
        storm: true,
        fibrousCrown: true,
        builder: "cumulonimbus",
        morphologyVariant: "single-pulse",
    },
    {
        id: "cb-capillatus-incus",
        label: "Cumulonimbus capillatus incus",
        genus: "cumulonimbus",
        species: "capillatus",
        supplementaryFeature: "incus",
        lifecycle: "glaciating",
        topY: 0.88,
        branches: 6,
        levels: 14,
        radius: 0.080,
        baseWidth: 0.34,
        baseDepth: 0.24,
        glaciationStart: 0.63,
        cavityCount: 38,
        detailBase: 0.11,
        densityScale: 1.02,
        crownExpansion: 0.38,
        storm: true,
        fibrousCrown: true,
        anvil: true,
        builder: "cumulonimbus",
        morphologyVariant: "downwind-incus",
    },
    {
        id: "cb-dissipating",
        label: "Dissipating cumulonimbus",
        genus: "cumulonimbus",
        species: "capillatus",
        lifecycle: "decaying",
        topY: 0.87,
        branches: 5,
        levels: 13,
        radius: 0.076,
        baseWidth: 0.315,
        baseDepth: 0.225,
        glaciationStart: 0.49,
        cavityCount: 48,
        detailBase: 0.25,
        densityScale: 0.79,
        crownExpansion: 0.34,
        storm: true,
        fibrousCrown: true,
        anvil: true,
        dissipating: true,
        builder: "cumulonimbus",
        morphologyVariant: "decaying-column",
    },
    {
        id: "ci-fibratus",
        label: "Cirrus fibratus",
        genus: "cirrus",
        species: "fibratus",
        lifecycle: "mature",
        builder: "ice-streamer",
        variant: "fibratus",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "fibrous-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.60,
    },
    {
        id: "ci-uncinus",
        label: "Cirrus uncinus",
        genus: "cirrus",
        species: "uncinus",
        lifecycle: "precipitating",
        builder: "ice-streamer",
        variant: "uncinus",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "fibrous-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.82,
    },
    {
        id: "ci-spissatus",
        label: "Cirrus spissatus",
        genus: "cirrus",
        species: "spissatus",
        lifecycle: "mature",
        builder: "ice-streamer",
        variant: "spissatus",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "granular-ice",
        topologyPolicy: "irregular-patch",
        // Spissatus is the optically dense Cirrus species: WMO permits a
        // grey, Sun-veiling core while its sheared fringe remains sparse.
        // Preserve that high-density tail after adding real crown/underside
        // relief; density intermittency and dry-air channels remain separate
        // 3-D fields and prevent this bounded gain becoming a uniform slab.
        densityScale: 0.85,
    },
    {
        id: "ci-floccus",
        label: "Cirrus floccus",
        genus: "cirrus",
        species: "floccus",
        lifecycle: "decaying",
        builder: "ice-streamer",
        variant: "floccus",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "granular-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.68,
    },
    {
        id: "ci-castellanus",
        label: "Cirrus castellanus",
        genus: "cirrus",
        species: "castellanus",
        lifecycle: "growing",
        builder: "ice-streamer",
        variant: "castellanus",
        formationMechanism: "elevated-convective-ice",
        materialModel: "granular-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.76,
    },
    {
        id: "cs-veil",
        label: "Cirrostratus veil",
        genus: "cirrostratus",
        species: null,
        speciesAliases: ["nebulosus"],
        lifecycle: "mature",
        builder: "sheet",
        variant: "cirrostratus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "fibrous-ice",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.42,
        phaseBase: 1,
    },
    {
        id: "cc-stratiformis",
        label: "Cirrocumulus stratiformis",
        genus: "cirrocumulus",
        species: "stratiformis",
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        formationMechanism: "cellular-convective-colony",
        materialModel: "granular-ice",
        topologyPolicy: "cellular-colony",
        level: "high",
        densityScale: 0.56,
        phaseBase: 0.96,
    },
    {
        id: "cc-castellanus",
        label: "Cirrocumulus castellanus",
        genus: "cirrocumulus",
        species: "castellanus",
        lifecycle: "growing",
        builder: "cellular",
        variant: "castellanus",
        formationMechanism: "cellular-convective-colony",
        materialModel: "granular-ice",
        topologyPolicy: "cellular-colony",
        level: "high",
        densityScale: 0.62,
        phaseBase: 0.92,
    },
    {
        id: "cc-floccus",
        label: "Cirrocumulus floccus",
        genus: "cirrocumulus",
        species: "floccus",
        lifecycle: "decaying",
        builder: "cellular",
        variant: "floccus",
        formationMechanism: "cellular-convective-colony",
        materialModel: "granular-ice",
        topologyPolicy: "fragmented-population",
        level: "high",
        densityScale: 0.58,
        phaseBase: 0.94,
    },
    {
        id: "cc-lenticularis",
        label: "Cirrocumulus lenticularis",
        genus: "cirrocumulus",
        species: "lenticularis",
        lifecycle: "mature",
        builder: "wave-lens",
        formationMechanism: "orographic-wave-condensation",
        materialModel: "granular-ice",
        topologyPolicy: "wave-packet",
        level: "high",
        densityScale: 0.52,
        phaseBase: 0.98,
    },
    {
        id: "ac-stratiformis",
        label: "Altocumulus stratiformis",
        genus: "altocumulus",
        species: "stratiformis",
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        formationMechanism: "cellular-convective-colony",
        materialModel: "mixed-phase-cellular",
        topologyPolicy: "cellular-colony",
        level: "middle",
        densityScale: 0.78,
        phaseBase: 0.24,
    },
    {
        id: "ac-castellanus",
        label: "Altocumulus castellanus",
        genus: "altocumulus",
        species: "castellanus",
        lifecycle: "growing",
        builder: "cellular",
        variant: "castellanus",
        formationMechanism: "cellular-convective-colony",
        materialModel: "mixed-phase-cellular",
        topologyPolicy: "cellular-colony",
        level: "middle",
        densityScale: 0.84,
        phaseBase: 0.18,
    },
    {
        id: "ac-floccus",
        label: "Altocumulus floccus",
        genus: "altocumulus",
        species: "floccus",
        lifecycle: "decaying",
        builder: "cellular",
        variant: "floccus",
        formationMechanism: "cellular-convective-colony",
        materialModel: "mixed-phase-cellular",
        topologyPolicy: "fragmented-population",
        level: "middle",
        densityScale: 0.76,
        phaseBase: 0.30,
    },
    {
        id: "ac-lenticularis",
        label: "Altocumulus lenticularis",
        genus: "altocumulus",
        species: "lenticularis",
        lifecycle: "mature",
        builder: "wave-lens",
        formationMechanism: "orographic-wave-condensation",
        materialModel: "mixed-phase-cellular",
        topologyPolicy: "wave-packet",
        level: "middle",
        densityScale: 0.84,
        phaseBase: 0.28,
    },
    {
        id: "ac-volutus",
        label: "Altocumulus volutus",
        genus: "altocumulus",
        species: "volutus",
        lifecycle: "mature",
        builder: "roll",
        formationMechanism: "horizontal-roll-circulation",
        materialModel: "mixed-phase-cellular",
        topologyPolicy: "roll-tube",
        level: "middle",
        densityScale: 0.82,
        phaseBase: 0.18,
    },
    {
        id: "as-opacus",
        label: "Altostratus opacus",
        genus: "altostratus",
        species: null,
        speciesAliases: ["opacus"],
        lifecycle: "mature",
        builder: "sheet",
        variant: "altostratus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.84,
        phaseBase: 0.42,
    },
    {
        id: "ns-precipitating",
        label: "Nimbostratus praecipitatio",
        genus: "nimbostratus",
        species: null,
        supplementaryFeature: "praecipitatio",
        lifecycle: "precipitating",
        builder: "sheet",
        variant: "nimbostratus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.98,
        phaseBase: 0.36,
    },
    {
        id: "sc-stratiformis",
        label: "Stratocumulus stratiformis",
        genus: "stratocumulus",
        species: "stratiformis",
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        scOrganizationRegime: "closed-cell",
        scPlacementRegime: "distant-finite-system",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.92,
        phaseBase: 0,
    },
    {
        id: "sc-castellanus",
        label: "Stratocumulus castellanus",
        genus: "stratocumulus",
        species: "castellanus",
        lifecycle: "growing",
        builder: "cellular",
        variant: "castellanus",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.96,
        phaseBase: 0,
    },
    {
        id: "sc-floccus",
        label: "Stratocumulus floccus",
        genus: "stratocumulus",
        species: "floccus",
        lifecycle: "decaying",
        builder: "cellular",
        variant: "floccus",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "fragmented-population",
        level: "low",
        densityScale: 0.88,
        phaseBase: 0,
    },
    {
        id: "sc-lenticularis",
        label: "Stratocumulus lenticularis",
        genus: "stratocumulus",
        species: "lenticularis",
        lifecycle: "mature",
        builder: "wave-lens",
        formationMechanism: "orographic-wave-condensation",
        materialModel: "liquid-cellular",
        topologyPolicy: "wave-packet",
        level: "low",
        densityScale: 0.94,
        phaseBase: 0,
    },
    {
        id: "sc-volutus",
        label: "Stratocumulus volutus",
        genus: "stratocumulus",
        species: "volutus",
        lifecycle: "mature",
        builder: "roll",
        formationMechanism: "horizontal-roll-circulation",
        materialModel: "liquid-cellular",
        topologyPolicy: "roll-tube",
        level: "low",
        densityScale: 0.98,
        phaseBase: 0,
    },
    {
        id: "st-nebulosus",
        label: "Stratus nebulosus",
        genus: "stratus",
        species: "nebulosus",
        lifecycle: "mature",
        builder: "sheet",
        variant: "stratus",
        formationMechanism: "inversion-bounded-deck",
        materialModel: "liquid-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.74,
        phaseBase: 0,
    },
    {
        id: "st-fractus",
        label: "Stratus fractus",
        genus: "stratus",
        species: "fractus",
        lifecycle: "decaying",
        builder: "fragment",
        variant: "stratus",
        formationMechanism: "boundary-layer-fragmentation",
        materialModel: "liquid-sheet",
        topologyPolicy: "fragmented-population",
        densityScale: 0.68,
        phaseBase: 0,
    },
    {
        id: "cu-fractus",
        label: "Cumulus fractus",
        genus: "cumulus",
        species: "fractus",
        lifecycle: "decaying",
        builder: "fragment",
        variant: "cumulus",
        formationMechanism: "boundary-layer-fragmentation",
        materialModel: "liquid-convective",
        topologyPolicy: "fragmented-population",
        densityScale: 0.76,
        phaseBase: 0,
    },
    // Owner-level congestus alternatives share one physical species and
    // material model, but not one silhouette. They are appended so existing
    // atlas indices and all non-congestus checksums remain stable.
    {
        id: "cu-congestus-turreted",
        label: "Cumulus congestus · turreted pulse",
        genus: "cumulus",
        species: "congestus",
        lifecycle: "growing",
        topY: 0.84,
        branches: 6,
        levels: 13,
        radius: 0.105,
        baseWidth: 0.23,
        baseDepth: 0.18,
        glaciationStart: 2,
        cavityCount: 36,
        detailBase: 0.38,
        densityScale: 1.015,
        crownExpansion: 0.36,
        morphologyVariant: "turreted",
        builder: "cumulus",
    },
    {
        id: "cu-congestus-multicell",
        label: "Cumulus congestus · merged multicell",
        genus: "cumulus",
        species: "congestus",
        lifecycle: "growing",
        topY: 0.78,
        branches: 4,
        levels: 11,
        radius: 0.118,
        baseWidth: 0.26,
        baseDepth: 0.20,
        glaciationStart: 2,
        cavityCount: 34,
        detailBase: 0.38,
        densityScale: 1,
        crownExpansion: 0.24,
        morphologyVariant: "multicell",
        builder: "cumulus",
    },
    ...[
        ["cb-calvus-multicell", "Cumulonimbus calvus · merged multicell", "calvus", "mature", "multicell"],
        ["cb-capillatus-sheared", "Cumulonimbus capillatus · sheared crown", "capillatus", "glaciating", "strongly-sheared"],
        ["cb-capillatus-incus-back-sheared", "Cumulonimbus incus · back-sheared outflow", "capillatus", "glaciating", "back-sheared-incus"],
        ["cb-dissipating-remnant", "Dissipating cumulonimbus · anvil remnant", "capillatus", "decaying", "anvil-remnant"],
    ].map(([id, label, species, lifecycle, morphologyVariant]) => {
        const incus = id.includes("incus");
        const dissipating = lifecycle === "decaying";
        const capillatus = species === "capillatus";
        return {
            id, label, genus: "cumulonimbus", species, lifecycle,
            supplementaryFeature: incus ? "incus" : undefined,
            builder: "cumulonimbus",
            morphologyVariant,
            topY: dissipating ? 0.87 : incus ? 0.88 : capillatus ? 0.87 : 0.86,
            branches: morphologyVariant === "multicell" ? 7 : 5,
            levels: 14,
            radius: morphologyVariant === "multicell" ? 0.078 : 0.083,
            baseWidth: morphologyVariant === "multicell" ? 0.36 : 0.33,
            baseDepth: 0.24,
            glaciationStart: species === "calvus" ? 0.86 : 0.64,
            cavityCount: dissipating ? 46 : 36,
            detailBase: dissipating ? 0.25 : 0.11,
            densityScale: dissipating ? 0.76 : 1.02,
            crownExpansion: 0.40,
            storm: true,
            fibrousCrown: capillatus,
            anvil: incus || dissipating,
            dissipating,
        };
    }),
    {
        id: "cs-fibratus",
        label: "Cirrostratus fibratus",
        genus: "cirrostratus",
        species: "fibratus",
        lifecycle: "mature",
        builder: "sheet",
        variant: "cirrostratus-fibratus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "fibrous-ice",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.46,
        phaseBase: 1,
    },
    {
        id: "as-translucidus",
        label: "Altostratus translucidus",
        genus: "altostratus",
        species: null,
        rendererSpeciesKeys: [],
        lifecycle: "mature",
        builder: "sheet",
        variant: "altostratus-translucidus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.43,
        phaseBase: 0.48,
    },
    {
        id: "cc-stratiformis-dispersive",
        label: "Cirrocumulus stratiformis · dispersive packet",
        genus: "cirrocumulus",
        species: "stratiformis",
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        topologyExemplarStyle: "dispersive-oblique-packet",
        formationMechanism: "cellular-convective-colony",
        materialModel: "granular-ice",
        topologyPolicy: "cellular-colony",
        level: "high",
        densityScale: 0.62,
        phaseBase: 0.96,
    },
    {
        id: "ci-fibratus-split-source",
        label: "Cirrus fibratus · split source swaths",
        genus: "cirrus",
        species: "fibratus",
        lifecycle: "mature",
        builder: "ice-streamer",
        variant: "fibratus",
        fibratusAnatomy: "split-source",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "fibrous-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.58,
    },
    {
        id: "ci-fibratus-depth-shear",
        label: "Cirrus fibratus · depth-varying shear",
        genus: "cirrus",
        species: "fibratus",
        lifecycle: "decaying",
        builder: "ice-streamer",
        variant: "fibratus",
        fibratusAnatomy: "depth-shear",
        formationMechanism: "sheared-ice-sedimentation",
        materialModel: "fibrous-ice",
        topologyPolicy: "fragmented-population",
        densityScale: 0.55,
    },
    {
        id: "sc-stratiformis-closed-overhead",
        label: "Stratocumulus stratiformis · closed overhead deck",
        genus: "stratocumulus",
        species: "stratiformis",
        rendererSpeciesKeys: [],
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        scOrganizationRegime: "closed-cell",
        scPlacementRegime: "immediate-overcast",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.96,
        phaseBase: 0,
    },
    {
        id: "sc-stratiformis-open-field",
        label: "Stratocumulus stratiformis · open-cell field",
        genus: "stratocumulus",
        species: "stratiformis",
        rendererSpeciesKeys: [],
        lifecycle: "precipitating",
        builder: "cellular",
        variant: "stratiformis",
        scOrganizationRegime: "open-cell",
        scPlacementRegime: "immediate-broken-field",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.88,
        phaseBase: 0,
    },
    {
        id: "sc-stratiformis-street-packet",
        label: "Stratocumulus stratiformis · finite cloud streets",
        genus: "stratocumulus",
        species: "stratiformis",
        rendererSpeciesKeys: [],
        lifecycle: "mature",
        builder: "cellular",
        variant: "stratiformis",
        scOrganizationRegime: "street",
        scPlacementRegime: "immediate-broken-field",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.90,
        phaseBase: 0,
    },
    {
        id: "sc-stratiformis-transition-mosaic",
        label: "Stratocumulus stratiformis · closed/open transition",
        genus: "stratocumulus",
        species: "stratiformis",
        rendererSpeciesKeys: [],
        lifecycle: "decaying",
        builder: "cellular",
        variant: "stratiformis",
        scOrganizationRegime: "sparse-transition",
        scPlacementRegime: "immediate-broken-field",
        formationMechanism: "inversion-bounded-cellular-deck",
        materialModel: "liquid-cellular",
        topologyPolicy: "cellular-colony",
        level: "low",
        densityScale: 0.82,
        phaseBase: 0,
    },
    {
        id: "ns-deepening-altostratus-shield",
        label: "Nimbostratus deepening Altostratus parent shield",
        genus: "nimbostratus",
        species: null,
        rendererSpeciesKeys: [],
        lifecycle: "growing",
        builder: "sheet",
        variant: "nimbostratus",
        nsParentAnatomy: "deepening-altostratus",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.93,
        phaseBase: 0.39,
    },
    {
        id: "ns-generating-cell-shield",
        label: "Nimbostratus generating-cell parent shield",
        genus: "nimbostratus",
        species: null,
        rendererSpeciesKeys: [],
        lifecycle: "precipitating",
        builder: "sheet",
        variant: "nimbostratus",
        nsParentAnatomy: "generating-cell",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.98,
        phaseBase: 0.36,
    },
    {
        id: "ns-thickened-low-deck-shield",
        label: "Nimbostratus thickened low-deck parent shield",
        genus: "nimbostratus",
        species: null,
        rendererSpeciesKeys: [],
        lifecycle: "mature",
        builder: "sheet",
        variant: "nimbostratus",
        nsParentAnatomy: "thickened-low-deck",
        formationMechanism: "frontal-ascent-sheet",
        materialModel: "mixed-phase-sheet",
        topologyPolicy: "continuous-sheet",
        densityScale: 0.96,
        phaseBase: 0.31,
    },
];

const rendererSpeciesKeysForConfig = (config) => {
    if (config.rendererSpeciesKeys) return config.rendererSpeciesKeys;
    if (config.genus === "cumulonimbus" && config.supplementaryFeature === "incus") {
        return ["cumulonimbus-capillatus-incus"];
    }
    if (config.species) return [`${config.genus}-${config.species}`];
    if (config.speciesAliases?.length) {
        return config.speciesAliases.map((species) => `${config.genus}-${species}`);
    }
    if (config.genus === "nimbostratus" &&
        config.supplementaryFeature === "praecipitatio") {
        return ["nimbostratus-praecipitatio"];
    }
    return [];
};

const createTopologyExemplarCoverage = (
    volumeEntries,
    { atlasWidth, atlasDepth, zStride, packingColumns },
) => {
    const volumeIdsBySpecies = new Map();
    for (const config of VOLUME_CONFIGS) {
        for (const rendererSpecies of rendererSpeciesKeysForConfig(config)) {
            const ids = volumeIdsBySpecies.get(rendererSpecies) ?? [];
            ids.push(config.id);
            volumeIdsBySpecies.set(rendererSpecies, ids);
        }
    }
    const entryIds = new Set(volumeEntries.map((entry) => entry.id));
    const species = [...volumeIdsBySpecies.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([rendererSpecies, ids]) => {
            const materializedVolumeIds = [...new Set(ids)].filter((id) =>
                entryIds.has(id));
            const materializedExemplarCount = Math.min(3, materializedVolumeIds.length);
            const ordinalVolumeIds = rendererSpecies === "cirrus-fibratus"
                ? [
                    "ci-fibratus",
                    "ci-fibratus-depth-shear",
                    "ci-fibratus-split-source",
                ]
                : Array.from({ length: 3 }, (_, ordinal) =>
                    materializedVolumeIds[ordinal % materializedVolumeIds.length]);
            return {
                rendererSpecies,
                genus: rendererSpecies.split("-")[0],
                logicalExemplarCount: 3,
                materializedExemplarCount,
                materializedVolumeIds,
                ordinalVolumeIds,
                remainingLogicalExemplars: Math.max(0, 3 - materializedExemplarCount),
                status: materializedExemplarCount > 1
                    ? "dense-multi-exemplar"
                    : "canonical-plus-logical-exemplars",
            };
        });
    return {
        schema: "elements-cloud-topology-exemplars",
        version: 1,
        selection: {
            inputs: ["renderer species", "stable scene/day seed", "stable owner seed"],
            hash: "FNV-1a-32 over normalized species|scene/day|owner identity",
            cameraInvariant: true,
            frameTimeInvariant: true,
        },
        logicalExemplarsPerSpecies: 3,
        denseAssetBudget: {
            maximumWidthSlices: 2048,
            maximumDepthSlices: 2048,
            usedWidthSlices: atlasWidth,
            usedDepthSlices: atlasDepth,
            remainingWidthSlices: 2048 - atlasWidth,
            remainingDepthSlices: 2048 - atlasDepth,
            zStridePerVolume: zStride,
            packingColumns,
            maximumAdditionalDenseVolumes:
                packingColumns * Math.floor(2048 / zStride) - volumeEntries.length,
            policy: "keep the rgba8 3D texture ABI, append IDs, and tile bounded representative exemplars across manifest-derived X/Z slots",
        },
        species,
    };
};

const createStratocumulusOrganizationManifolds = (volumeEntries) => {
    const materializedIds = new Set(volumeEntries.map((entry) => entry.id));
    const definitions = [
        {
            regime: "closed-cell",
            placement: "distant-finite-system",
            volumeId: "sc-stratiformis",
            materialSupport: "finite-connected-cell-interior-and-wall-network",
        },
        {
            regime: "closed-cell",
            placement: "immediate-overcast",
            volumeId: "sc-stratiformis-closed-overhead",
            materialSupport: "observer-spanning-connected-cell-interior-and-wall-network",
        },
        {
            regime: "open-cell",
            placement: "immediate-broken-field",
            volumeId: "sc-stratiformis-open-field",
            materialSupport: "broken-cloudy-cold-pool-wall-arcs-around-clear-centres",
        },
        {
            regime: "street",
            placement: "immediate-broken-field",
            volumeId: "sc-stratiformis-street-packet",
            materialSupport: "unequal-finite-curved-boundary-layer-roll-corridors",
        },
        {
            regime: "sparse-transition",
            placement: "immediate-broken-field",
            volumeId: "sc-stratiformis-transition-mosaic",
            materialSupport: "surviving-closed-cells-and-generated-open-wall-arcs",
        },
    ];
    for (const definition of definitions) {
        if (!materializedIds.has(definition.volumeId)) {
            throw new Error(
                `Sc organization manifold ${definition.volumeId} is not materialized`,
            );
        }
    }
    return {
        schema: "elements-cloud-organization-manifolds",
        version: 1,
        rendererSpecies: "stratocumulus-stratiformis",
        selection: {
            authoritativeInputs: [
                "resolved physical organization regime",
                "mutually exclusive world-space placement regime",
            ],
            seedRole: "within-manifold variation only",
            forbiddenSubstitutions: [
                "coverage used as a topology selector",
                "post-density masks used to carve clear cells or system boundaries",
                "periodic analytic fields used to synthesize cellular or street structure",
            ],
        },
        manifolds: definitions,
    };
};

const exteriorDetailClassIdsForConfig = (config) => {
    if (config.builder === "ice-streamer") {
        return config.variant === "uncinus"
            ? ["ice-sedimentation", "ice-fibre"]
            : ["ice-fibre", "ice-sedimentation"];
    }
    if (config.builder === "sheet") {
        if (config.variant === "cirrostratus-fibratus") {
            return ["ice-fibre", "stratiform-ragged"];
        }
        if (config.variant === "cirrostratus") {
            // Nebulosus is an ill-defined three-dimensional ice veil.  Giving
            // every boundary sample the anisotropic fibre displacement class
            // redrew a smooth veil as visible spokes whose only depth came
            // from texture.  Its analytic lower/upper surfaces now own the
            // volume; the narrow exterior band supplies only finite frontal
            // fray.  Fibratus retains the explicit ice-fibre class above.
            return ["stratiform-ragged"];
        }
        if (config.variant === "nimbostratus") {
            return ["stratiform-ragged", "ice-sedimentation", "ice-fibre"];
        }
        return [
            "stratiform-ragged",
            ...(config.variant.startsWith("altostratus") ? ["ice-fibre"] : []),
        ];
    }
    if (config.builder === "fragment") return ["liquid-scud"];
    if (config.builder === "wave-lens") {
        return ["laminar-wave", ...(config.level === "high" ? ["ice-fibre"] : [])];
    }
    if (config.builder === "roll") return ["liquid-cauli", "stratiform-ragged"];
    if (config.builder === "cellular") {
        const cellular = config.species === "castellanus"
            ? ["liquid-turret", "liquid-cauli"]
            : ["liquid-cauli"];
        return config.level === "high" ? ["ice-fibre", ...cellular] : cellular;
    }
    if (config.genus === "cumulonimbus" && config.dissipating) {
        return ["ice-fibre", "ice-sedimentation", "liquid-scud", "liquid-turret"];
    }
    if (config.genus === "cumulonimbus") {
        return config.fibrousCrown
            ? ["liquid-turret", "ice-fibre", "ice-sedimentation", "liquid-cauli"]
            : ["liquid-turret", "liquid-cauli", "ice-fibre"];
    }
    // Explicit source heads own Congestus turret geometry. Cauliflower is the
    // calm default mixing shell; only low G values opt into stronger turret
    // displacement. Keeping it first also makes the CPU fallback identical to
    // the shader's lowest-set-bit class selection.
    if (config.species === "congestus") return ["liquid-cauli", "liquid-turret"];
    return ["liquid-cauli"];
};

const protectedBaseForConfig = (config, connectivity, resolution) => {
    // The protected fair-weather Cu LCL is an authored physical plane. A 2x
    // source cell may conservatively reduce into the coarse texel immediately
    // below that plane, so it must not redefine the shared shader contract.
    const normalizedAltitude = config.builder === "cumulus"
        ? 7 / 47
        : connectivity.occupiedBounds?.minimum?.[1] ?? 0;
    if (config.genus === "cumulonimbus" && config.dissipating) {
        return {
            mode: "unprotected-eroding-convective-remnant",
            normalizedAltitude,
            featherVoxels: 0,
            downwardDisplacementScale: 1,
        };
    }
    if (config.builder === "fragment" || config.builder === "ice-streamer") {
        return {
            mode: "unprotected-ragged-boundary",
            normalizedAltitude,
            featherVoxels: 0,
            downwardDisplacementScale: 1,
        };
    }
    if (config.builder === "sheet") {
        const precipitationPermeable = config.variant === "nimbostratus";
        return {
            mode: precipitationPermeable
                ? "precipitation-permeable-stratiform-base"
                : "protected-planar-stratiform-base",
            normalizedAltitude,
            featherVoxels: precipitationPermeable ? 1.5 : 0.75,
            downwardDisplacementScale: precipitationPermeable ? 0.38 : 0,
        };
    }
    if (config.builder === "wave-lens") {
        return {
            mode: "protected-laminar-lower-envelope",
            normalizedAltitude,
            featherVoxels: 0.75,
            downwardDisplacementScale: 0.16,
        };
    }
    return {
        mode: config.builder === "cellular" || config.builder === "roll"
            ? "protected-cellular-condensation-base"
            : "protected-convective-condensation-base",
        normalizedAltitude,
        featherVoxels: 0.75,
        downwardDisplacementScale: 0,
    };
};

const createExteriorBoundaryProfile = (config, connectivity, resolution) => {
    const detailClasses = exteriorDetailClassIdsForConfig(config);
    const maximumClass = detailClasses.reduce((maximum, id) => {
        const definition = CLOUD_EXTERIOR_DETAIL_CLASSES[id];
        const axisMaximum = Math.max(...definition.axisScale);
        const displacement = definition.maximumCanonicalDisplacement * axisMaximum;
        return displacement > maximum.displacement
            ? {
                id,
                displacement,
                density: Math.max(maximum.density, definition.maximumExteriorDensity),
            }
            : {
                ...maximum,
                density: Math.max(maximum.density, definition.maximumExteriorDensity),
            };
    }, { id: detailClasses[0], displacement: -Infinity, density: 0 });
    const cellCircumradiusVoxels = Math.sqrt(3) * 0.5;
    return {
        schema: CLOUD_EXTERIOR_BOUNDARY_SCHEMA,
        version: CLOUD_EXTERIOR_BOUNDARY_VERSION,
        volumeResolution: resolution,
        detailClasses,
        maximumOutwardDisplacementCanonical: maximumClass.displacement,
        maximumOutwardDisplacementVoxels: maximumClass.displacement * (resolution - 1),
        maximumExteriorDensity: maximumClass.density,
        interpolationHaloVoxels: cellCircumradiusVoxels,
        majorantSampleHaloVoxels: 1,
        visibleOwnerBoundsInflationCanonical: maximumClass.displacement,
        traversalOwnerBoundsInflationCanonical: maximumClass.displacement +
            (cellCircumradiusVoxels + 1) / (resolution - 1),
        protectedBase: protectedBaseForConfig(config, connectivity, resolution),
    };
};

export const selectCloudExteriorDetailClass = (boundary, detailType, iceFraction) => {
    const allowed = boundary.detailClasses;
    const has = (id) => allowed.includes(id);
    if (has("ice-sedimentation") && iceFraction >= 0.62 && detailType >= 0.60) {
        return "ice-sedimentation";
    }
    if (has("ice-fibre") && (iceFraction >= 0.56 || detailType >= 0.72)) {
        return "ice-fibre";
    }
    if (has("liquid-scud") && detailType >= 0.40) return "liquid-scud";
    if (has("stratiform-ragged") && detailType >= 0.27 && detailType < 0.72) {
        return "stratiform-ragged";
    }
    if (has("liquid-turret") && detailType <= 0.34) return "liquid-turret";
    if (has("laminar-wave")) return "laminar-wave";
    return allowed[0];
};

const exteriorBaseScale = (boundary, canonicalY) => {
    const base = boundary.protectedBase;
    if (base.downwardDisplacementScale >= 1) return 1;
    const featherCanonical = base.featherVoxels /
        Math.max(1, boundary.volumeResolution - 1);
    return mix(
        base.downwardDisplacementScale,
        1,
        smoothstep(
            base.normalizedAltitude - featherCanonical,
            base.normalizedAltitude + featherCanonical,
            canonicalY,
        ),
    );
};

/**
 * CPU reference for the exact WGSL exterior-support contract. The shader must
 * derive the normal from central differences of channel A, call the same class
 * selection thresholds, and apply the same axis-scaled displacement. The
 * `includeInterpolationHalo` branch is exclusively for conservative majorants;
 * it must never be used to author visible condensate.
 */
export const resolveCloudExteriorBoundarySample = ({
    boundary,
    detailType,
    iceFraction,
    signedDistanceVoxels,
    canonicalPosition,
    signedDistanceNormal = [0, 1, 0],
    includeInterpolationHalo = false,
}) => {
    const detailClass = selectCloudExteriorDetailClass(boundary, detailType, iceFraction);
    const definition = CLOUD_EXTERIOR_DETAIL_CLASSES[detailClass];
    const normalLength = Math.hypot(...signedDistanceNormal);
    const normal = normalLength > 1e-8
        ? signedDistanceNormal.map((component) => component / normalLength)
        : [0, 1, 0];
    const directionalAxisScale = Math.hypot(
        normal[0] * definition.axisScale[0],
        normal[1] * definition.axisScale[1],
        normal[2] * definition.axisScale[2],
    );
    const downward = normal[1] < 0;
    const baseScale = downward ? exteriorBaseScale(boundary, canonicalPosition[1]) : 1;
    const displacementVoxels = definition.maximumCanonicalDisplacement *
        (boundary.volumeResolution - 1) * directionalAxisScale * baseScale;
    const supportVoxels = displacementVoxels +
        (includeInterpolationHalo ? boundary.interpolationHaloVoxels : 0);
    // The canonical atlas owns [0,1]^3, but visible detail may extend beyond
    // that storage cube. The shader clamps the texture lookup to the volume's
    // own texel domain and adds this Euclidean continuation distance. This
    // avoids slicing tall anvils, remote sheets, or edge-facing fibres at an
    // arbitrary texture face without inventing another macro silhouette.
    const canonicalOutside = canonicalPosition.map((component) =>
        component < 0 ? -component : component > 1 ? component - 1 : 0);
    const domainContinuationVoxels = Math.hypot(...canonicalOutside) *
        (boundary.volumeResolution - 1);
    const continuedSignedDistanceVoxels = signedDistanceVoxels +
        domainContinuationVoxels;
    return {
        detailClass,
        directionalAxisScale,
        displacementVoxels,
        supportVoxels,
        domainContinuationVoxels,
        continuedSignedDistanceVoxels,
        reachable: continuedSignedDistanceVoxels >= 0 &&
            continuedSignedDistanceVoxels <= supportVoxels,
        maximumExteriorDensity: definition.maximumExteriorDensity,
    };
};

const buildShapeModel = (config, seed) => {
    const random = makeRandom(seed);
    const shapes = [];
    const cavities = [];
    const baseY = 0.145;
    const towering = config.topY >= 0.70;
    const branchOrigins = [];
    let crownLobeCount = 0;

    // The condensation base is a thick, merged population of source thermals,
    // not one wide oblate primitive.  A single ellipse projected as a bright
    // rectangular shelf below a narrow tower.  These unequal overlapping root
    // lobes keep the underside approximately level while the sides rise into
    // the feeder branches continuously.
    const congestusMorphology = config.species === "congestus";
    const morphologySkew = config.morphologyVariant === "turreted" ? 0.030
        : config.morphologyVariant === "multicell" ? -0.026 : 0;
    const rootLobes = congestusMorphology
        ? [
            { center: [0.50 + morphologySkew, baseY + 0.052, 0.49], radii: [config.baseWidth * 0.55, 0.091, config.baseDepth * 0.72], rotation: 0.05 },
            { center: [0.38 + morphologySkew * 0.35, baseY + 0.030, 0.52], radii: [config.baseWidth * 0.39, 0.073, config.baseDepth * 0.55], rotation: -0.34 },
            { center: [0.63 + morphologySkew * 0.22, baseY + 0.067, 0.45], radii: [config.baseWidth * 0.36, 0.086, config.baseDepth * 0.50], rotation: 0.41 },
            { center: [0.46 - morphologySkew * 0.30, baseY + 0.081, 0.62], radii: [config.baseWidth * 0.31, 0.082, config.baseDepth * 0.43], rotation: -0.17 },
            { center: [0.57 + morphologySkew * 0.48, baseY + 0.022, 0.36], radii: [config.baseWidth * 0.29, 0.064, config.baseDepth * 0.40], rotation: 0.26 },
        ]
        : [
            { center: [0.50, baseY + 0.040, 0.49], radii: [config.baseWidth * 0.61, towering ? 0.100 : 0.082, config.baseDepth * 0.78], rotation: 0.05 },
            { center: [0.39, baseY + 0.033, 0.51], radii: [config.baseWidth * 0.43, towering ? 0.087 : 0.072, config.baseDepth * 0.61], rotation: -0.28 },
            { center: [0.62, baseY + 0.047, 0.46], radii: [config.baseWidth * 0.40, towering ? 0.093 : 0.071, config.baseDepth * 0.57], rotation: 0.34 },
            { center: [0.47, baseY + 0.052, 0.61], radii: [config.baseWidth * 0.36, towering ? 0.095 : 0.069, config.baseDepth * 0.49], rotation: -0.11 },
            { center: [0.55, baseY + 0.029, 0.37], radii: [config.baseWidth * 0.33, towering ? 0.078 : 0.064, config.baseDepth * 0.46], rotation: 0.19 },
        ];
    if (congestusMorphology) {
        for (const root of rootLobes) {
            root.center[0] += (random() - 0.5) * 0.026;
            root.center[1] += (random() - 0.5) * 0.018;
            root.center[2] += (random() - 0.5) * 0.024;
            root.radii[0] *= mix(0.91, 1.07, random());
            root.radii[1] *= mix(0.88, 1.08, random());
            root.radii[2] *= mix(0.90, 1.08, random());
            addEllipsoid(shapes, root.center, root.radii, {
                density: 0.87 * mix(0.92, 1.03, random()),
                detail: config.detailBase,
                rotation: root.rotation,
                role: "root",
            });
        }
    } else {
        for (const [index, root] of rootLobes.entries()) {
            addEllipsoid(shapes, root.center, root.radii, {
                density: (config.dissipating ? 0.57 : 0.87) * mix(0.92, 1.03, random()),
                detail: config.detailBase,
                rotation: root.rotation,
                role: "root",
            });
            root.center[1] += (index - 2) * 0.0015;
        }
    }
    // Dry air bites upward into the *outer* source-thermal undersides. This is
    // an SDF subtraction from condensate, not a horizontal alpha mask; the
    // central liquid connection remains protected above the lifting level.
    if (congestusMorphology) {
        for (let index = 0; index < 10; index += 1) {
            const root = rootLobes[index % rootLobes.length];
            let outwardX = root.center[0] - 0.5;
            let outwardZ = root.center[2] - 0.49;
            const length = Math.max(0.025, Math.hypot(outwardX, outwardZ));
            outwardX /= length;
            outwardZ /= length;
            const radius = mix(0.026, 0.052, random());
            cavities.push({
                center: [
                    root.center[0] + outwardX * root.radii[0] * mix(0.52, 0.86, random()),
                    root.center[1] - root.radii[1] * mix(0.44, 0.78, random()),
                    root.center[2] + outwardZ * root.radii[2] * mix(0.50, 0.84, random()),
                ],
                radii: [
                    radius * mix(0.82, 1.32, random()),
                    radius * mix(0.58, 0.96, random()),
                    radius * mix(0.76, 1.26, random()),
                ],
                rotation: random() * Math.PI,
                strength: mix(0.62, 0.94, random()),
                role: "base-entrainment-bite",
            });
        }
    }
    let mergedBodyLobeCount = addMergedConvectiveBody(shapes, random, config, baseY);

    for (let branch = 0; branch < config.branches; branch += 1) {
        const primary = branch === 0;
        const angle = branch * 2.399963229728653 + random() * 0.58;
        const offset = primary
            ? mix(0.006, 0.026, random())
            : mix(towering ? 0.095 : 0.055, config.storm ? 0.17 : towering ? 0.19 : 0.135, random());
        const heightFraction = primary
            ? 1
            : branch === 1 && towering
                ? mix(0.84, 0.93, random())
                : branch === 2 && towering
                    ? mix(0.73, 0.84, random())
                    : mix(config.storm ? 0.62 : 0.56, 0.78, random());
        const branchTop = mix(baseY + 0.09, config.topY, heightFraction);
        const branchScale = primary
            ? mix(0.94, 1.04, random())
            : mix(towering ? 0.72 : 0.62, towering ? 0.98 : 0.88, random());
        const branchLevels = primary
            ? Math.max(7, Math.round(config.levels * 0.86))
            : Math.max(4, Math.round(config.levels * mix(0.54, 0.76, heightFraction)));
        const origin = [
            0.5 + Math.cos(angle) * offset,
            0.49 + Math.sin(angle) * offset,
        ];
        branchOrigins.push(origin);

        // Feeder shoulders merge the source lobes into the separated towers.
        // Their vertical thickness prevents the lower body from reading as a
        // flat shelf, and the oblique centers preserve depth from either view.
        if (!primary) {
            addEllipsoid(shapes, [
                mix(0.50, origin[0], 0.62),
                baseY + mix(0.105, 0.165, random()),
                mix(0.49, origin[1], 0.62),
            ], [
                config.radius * branchScale * mix(1.12, 1.48, random()),
                config.radius * branchScale * mix(0.86, 1.22, random()),
                config.radius * branchScale * mix(1.02, 1.37, random()),
            ], {
                density: mix(0.88, 0.98, random()),
                detail: config.detailBase,
                rotation: angle,
                role: "feeder-thermal",
            });
        }
        const branchDriftX = Math.cos(angle) * mix(0.035, config.storm ? 0.078 : 0.105, random());
        const branchDriftZ = (config.storm ? 0.034 : 0) +
            Math.sin(angle) * mix(0.028, config.storm ? 0.070 : 0.085, random());
        if (towering && !primary) {
            // Liquid congestus has to remain one laterally communicating
            // thermal mass almost to the turret bases.  A third upper
            // junction prevents the several feeders from becoming parallel
            // fingers in the most revealing oblique views.  Mature storms do
            // not need it: their broader shared body and glaciated summit
            // already merge the same height range.
            const junctionHeights = config.storm
                ? [0.34, 0.57]
                : [0.34, 0.57, 0.72];
            for (const junctionT of junctionHeights) {
                const branchX = origin[0] + branchDriftX * junctionT;
                const branchZ = origin[1] + branchDriftZ * junctionT;
                const junctionRadius = config.radius * branchScale *
                    mix(junctionT < 0.5 ? 1.30 : 1.42, junctionT < 0.5 ? 1.54 : 1.72, random());
                const junctionCenter = [
                    mix(0.5, branchX, junctionT < 0.5 ? 0.70 : 0.84),
                    mix(baseY + 0.13, branchTop, junctionT),
                    mix(0.49, branchZ, junctionT < 0.5 ? 0.70 : 0.84),
                ];
                addEllipsoid(shapes, junctionCenter, [
                    junctionRadius * mix(1.02, 1.20, random()),
                    junctionRadius * mix(0.72, 0.91, random()),
                    junctionRadius * mix(0.94, 1.16, random()),
                ], {
                    density: mix(0.90, 0.99, random()),
                    detail: config.detailBase,
                    rotation: angle,
                    role: "thermal-junction",
                });
                const budRadius = junctionRadius * mix(0.34, 0.48, random());
                addEllipsoid(shapes, [
                    junctionCenter[0] + Math.cos(angle + 1.1) * junctionRadius * 0.62,
                    junctionCenter[1] + budRadius * mix(0.42, 0.76, random()),
                    junctionCenter[2] + Math.sin(angle + 1.1) * junctionRadius * 0.54,
                ], [budRadius * 1.08, budRadius, budRadius], {
                    density: 0.86,
                    detail: config.detailBase,
                    rotation: angle + 1.1,
                    role: "thermal-junction-bud",
                });
                mergedBodyLobeCount += 2;
            }
        }
        const beforeShapeCount = shapes.length;
        addThermalPlume(shapes, random, {
            baseY: baseY + (towering ? 0.105 : 0.075),
            topY: branchTop,
            levels: branchLevels,
            centerX: origin[0],
            centerZ: origin[1],
            radius: config.radius,
            driftX: branchDriftX,
            driftZ: branchDriftZ,
            branchScale,
            glaciationStart: config.glaciationStart,
            detailBase: config.detailBase,
            crownExpansion: config.crownExpansion,
            morphologyVariant: config.morphologyVariant,
            crownMode: config.species === "calvus"
                ? "calvus"
                : config.fibrousCrown ? "fibrous" : "liquid",
            towering,
        }, branch);
        crownLobeCount += shapes.slice(beforeShapeCount).filter((shape) =>
            shape.center[1] >= branchTop - config.radius * 1.25
        ).length;
    }

    // Diluted cloudy air descends around the rising protected core.  These
    // sparse, lower-density flank remnants are part of the macro support so
    // trilinear reconstruction cannot turn every cloud edge into an equally
    // sharp ellipsoid, but they remain too weak to read as new cloud columns.
    const evaporatingFlankCount = addEvaporatingConvectiveFlanks(
        shapes,
        random,
        config,
        baseY,
    );

    // Calvus is the short transition in which the cauliflower summit loses
    // sharp liquid outlines but has not yet developed the fibrous capillatus
    // crown. A broad, smooth dome bridges the upper thermals without creating
    // an anvil plate.
    if (config.species === "calvus" && !config.suppressCbPhaseFeatures) {
        addEllipsoid(shapes, [0.505, config.topY - 0.055, 0.53], [0.205, 0.105, 0.175], {
            density: 0.93,
            detail: 0.48,
            phase: 0.48,
            rotation: 0.08,
            role: "glaciating-calvus-dome",
        });
    }

    if (config.fibrousCrown && !config.suppressCbPhaseFeatures) {
        const crownY = config.topY - 0.035;
        for (let index = 0; index < 7; index += 1) {
            const t = index / 6;
            addEllipsoid(shapes, [
                0.50 + (t - 0.5) * mix(0.20, 0.30, random()),
                crownY + Math.sin(t * Math.PI) * 0.030 + (random() - 0.5) * 0.018,
                0.515 + t * 0.050,
            ], [
                mix(0.075, 0.112, random()),
                mix(0.041, 0.067, random()),
                mix(0.066, 0.105, random()),
            ], {
                density: config.dissipating ? 0.66 : 0.88,
                detail: mix(0.68, 0.90, random()),
                phase: mix(0.82, 1, random()),
                rotation: mix(-0.35, 0.35, random()),
                role: "glaciated-crown",
            });
        }
    }

    if (config.anvil && !config.suppressCbPhaseFeatures) {
        const anvilY = config.topY - 0.035;
        const plates = config.dissipating ? 8 : 9;
        for (let index = 0; index < plates; index += 1) {
            const t = index / (plates - 1);
            const downwind = mix(-0.11, config.dissipating ? 0.36 : 0.34, t);
            const taper = 1 - smoothstep(0.72, 1, t) * 0.54;
            addEllipsoid(shapes, [
                0.50 + (random() - 0.5) * 0.035,
                anvilY + (random() - 0.5) * 0.020 - t * 0.018,
                0.50 + downwind,
            ], [
                mix(0.22, 0.34, smoothstep(0, 0.62, t)) * taper,
                mix(0.030, 0.048, random()),
                mix(0.075, 0.105, random()),
            ], {
                density: mix(config.dissipating ? 0.48 : 0.78, config.dissipating ? 0.67 : 0.94, 1 - t),
                detail: mix(0.72, 0.96, t),
                phase: mix(0.88, 1, t),
                rotation: (random() - 0.5) * 0.16,
                role: "anvil",
            });
        }
        // Back-shear creates the finite upwind lip characteristic of an incus,
        // while remaining joined to the glaciated crown.
        addEllipsoid(shapes, [0.50, anvilY + 0.006, 0.40], [0.22, 0.040, 0.105], {
            density: config.dissipating ? 0.53 : 0.82,
            detail: 0.78,
            phase: 0.94,
            role: "anvil",
        });
        // Narrow, sheared outflow fingers break the leeward edge and encode
        // actual detrainment trajectories; the runtime detail field can then
        // up-resolve fibers without inventing the macro silhouette.
        for (let finger = 0; finger < (config.dissipating ? 8 : 5); finger += 1) {
            const t = finger / Math.max(1, (config.dissipating ? 7 : 4));
            const fingerZ = mix(0.72, config.dissipating ? 0.86 : 0.85, random());
            const fingerDepth = Math.min(
                mix(0.080, config.dissipating ? 0.135 : 0.125, random()),
                0.94 - fingerZ,
            );
            addEllipsoid(shapes, [
                mix(0.30, 0.72, t) + (random() - 0.5) * 0.055,
                anvilY - mix(0.012, 0.050, random()),
                fingerZ,
            ], [
                mix(0.055, 0.105, random()),
                mix(0.012, 0.026, random()),
                fingerDepth,
            ], {
                density: config.dissipating ? mix(0.37, 0.58, random()) : mix(0.66, 0.82, random()),
                detail: mix(0.88, 1, random()),
                phase: 1,
                rotation: mix(-0.30, 0.30, random()),
                role: "anvil-fallstreak",
            });
        }
    }

    // Detrained ice has the broadest canonical footprint. Keep a small genuine
    // clear-air margin around it so trilinear sampling never exposes a clipped
    // atlas face as an artificial storm edge. This is a model-space fit of the
    // entire lifecycle volume, not an opacity envelope applied after density.
    if (config.anvil && !config.suppressCbPhaseFeatures) {
        const horizontalScale = config.dissipating ? [0.88, 0.87] : [0.90, 0.90];
        for (const shape of shapes) {
            shape.center[0] = 0.5 + (shape.center[0] - 0.5) * horizontalScale[0];
            shape.center[2] = 0.5 + (shape.center[2] - 0.5) * horizontalScale[1];
            shape.radii[0] *= horizontalScale[0];
            shape.radii[2] *= horizontalScale[1];
        }
        for (const origin of branchOrigins) {
            origin[0] = 0.5 + (origin[0] - 0.5) * horizontalScale[0];
            origin[1] = 0.5 + (origin[1] - 0.5) * horizontalScale[1];
        }
    }

    // Entrainment cavities are placed on lobe flanks and are prevented from
    // cutting the protected central updraft. This yields real negative space
    // without breaking the thermal tree into a collection of floating blobs.
    const cavityAnchors = shapes.filter((shape) =>
        [
            "thermal", "thermal-bud", "feeder-thermal",
            "thermal-mass-flank", "thermal-mass-bud",
            "thermal-junction-bud",
        ].includes(shape.role) &&
        shape.center[1] > baseY + 0.09 &&
        shape.center[1] < config.topY - 0.025
    );
    for (let index = 0; index < config.cavityCount; index += 1) {
        const anchor = cavityAnchors[Math.floor(random() * cavityAnchors.length)] ?? {
            center: [0.5, mix(0.24, config.topY - 0.08, random()), 0.5],
            radii: [config.radius, config.radius, config.radius],
        };
        const azimuth = random() * Math.PI * 2;
        const anchorRadius = Math.max(anchor.radii[0], anchor.radii[2]);
        const radius = mix(0.024, config.dissipating ? 0.086 : 0.068, random());
        const radial = anchorRadius * mix(0.62, 1.13, random());
        cavities.push({
            center: [
                anchor.center[0] + Math.cos(azimuth) * radial,
                anchor.center[1] + (random() - 0.5) * anchor.radii[1] * 0.78,
                anchor.center[2] + Math.sin(azimuth) * radial,
            ],
            radii: [radius, radius * mix(0.66, 1.18, random()), radius * mix(0.72, 1.14, random())],
            rotation: random() * Math.PI,
            strength: mix(config.dissipating ? 0.72 : 0.52, config.dissipating ? 1.0 : 0.92, random()),
        });
    }

    let branchSpread = 0;
    for (let index = 0; index < branchOrigins.length; index += 1) {
        for (let other = index + 1; other < branchOrigins.length; other += 1) {
            branchSpread = Math.max(
                branchSpread,
                Math.hypot(
                    branchOrigins[index][0] - branchOrigins[other][0],
                    branchOrigins[index][1] - branchOrigins[other][1],
                ),
            );
        }
    }
    return {
        shapes,
        cavities,
        baseY,
        ownerPoints: branchOrigins,
        baseLobeCount: rootLobes.length,
        crownLobeCount,
        mergedBodyLobeCount,
        evaporatingFlankCount,
        branchSpread,
        hierarchyLevelCount: 3,
    };
};

/**
 * Congestus is authored as a genealogy of resolved buoyant heads.  The
 * canonical 48^3 atlas cannot preserve dozens of sub-voxel bubbles: after
 * trilinear reconstruction and the exterior displacement they collapse into
 * mottled noise around a rectangular union.  This dedicated path therefore
 * spends the available bandwidth on fewer, larger convex events, narrow
 * communicating necks, nested terminal buds, and explicit dry-air clefts.
 * Every visible lobe is attached to the source parcel tree; noise is reserved
 * for the mixing shell and never supplies the macro silhouette.
 */
const buildCongestusModel = (config, seed) => {
    const random = makeRandom(seed);
    const shapes = [];
    const cavities = [];
    const baseY = 0.145;
    const morphology = config.morphologyVariant ?? "balanced";
    const detail = config.detailBase;
    const sourceX = 0.49;
    const sourceZ = 0.49;
    const authoredBudRadii = [];
    const authoredNeckRadii = [];
    const authoredCleftDepths = [];
    let nestedPulseCount = 0;
    let cuspCount = 0;
    let mergedBodyLobeCount = 0;
    let crownLobeCount = 0;
    let hardProtectedThermalHeadCount = 0;
    let hardProtectedJunctionCount = 0;
    let resolvedThermalHeadCount = 0;
    let communicatingNeckCount = 0;

    const profiles = {
        balanced: {
            roots: [
                [-0.012, 0.010, 0.35, 0.034, 0.42],
                [-0.045, -0.026, 0.25, 0.028, 0.32],
                [0.038, 0.024, 0.23, 0.026, 0.30],
            ],
            mainTop: 0.675,
            main: [
                // One resolved parcel per buoyant pulse.  Unequal spacing and
                // width create the mushroom/neck profile seen in LES instead
                // of a densely overlapping stack whose union is a silo.
                [0.00, 0.58, -0.028, 0.018],
                [0.18, 0.50, -0.012, -0.004],
                [0.43, 0.68, 0.036, -0.030],
                [0.70, 0.52, 0.082, 0.026],
                [1.00, 0.72, 0.137, 0.016],
            ],
            crownBoundary: 0.890,
            crown: [
                // Adjacent heads overlap as one cauliflower crown. Their
                // unequal z offsets and top ages preserve genuine 3-D clefts;
                // large radial offsets would expose the lineage as a Y tree.
                [-0.105, -0.055, 0.50, 0.025],
                [0.015, 0.075, 0.70, 0.055],
                [0.125, -0.045, 0.55, -0.035],
            ],
            // The crown is not a radial tree. Each head continues a distinct
            // late parcel lineage; at most two heads share one ancestor and
            // the active head is the direct continuation of the main updraft.
            crownParents: [
                ["feeder", 0, -1],
                ["main", 4],
                ["main", 3],
            ],
            feeders: [[-1, 0.58, 3, 2, 0.56]],
            shoulders: [
                [2, -0.105, 0.070, 0.52, 0.70, 0.66],
                [3, -0.080, -0.092, 0.45, 0.78, 0.61],
                [4, 0.078, 0.102, 0.36, 0.64, 0.56],
            ],
        },
        turreted: {
            roots: [
                [-0.008, 0.008, 0.36, 0.033, 0.38],
                [-0.038, -0.024, 0.25, 0.028, 0.28],
                [0.032, 0.026, 0.23, 0.026, 0.26],
            ],
            mainTop: 0.735,
            main: [
                // A turreted tower is a visible succession of contracting
                // necks and fresh broad bubbles, not a constant-width stack.
                // The alternating parcel scales keep that source genealogy
                // legible while the curved centers prevent a stepped silo.
                [0.00, 0.61, -0.024, 0.025],
                [0.13, 0.44, 0.010, -0.045],
                [0.41, 0.70, 0.032, 0.035],
                [0.69, 0.34, 0.095, 0.095],
                [1.00, 0.70, 0.142, -0.050],
            ],
            crownBoundary: 0.860,
            crown: [
                [-0.080, 0.090, 0.46, 0.030],
                [0.035, -0.070, 0.76, 0.065],
                [0.120, 0.055, 0.46, -0.025],
            ],
            crownParents: [
                ["feeder", 0, -1],
                ["main", 4],
                ["main", 3],
            ],
            feeders: [[-1, 0.62, 3, 2, 0.52]],
            shoulders: [
                [2, -0.126, 0.084, 0.47, 0.68, 0.62],
                [3, 0.098, -0.106, 0.33, 0.62, 0.56],
            ],
        },
        multicell: {
            roots: [
                [-0.065, -0.028, 0.31, 0.028, 0.31],
                [-0.006, 0.034, 0.41, 0.033, 0.40],
                [0.062, -0.018, 0.29, 0.027, 0.31],
            ],
            mainTop: 0.655,
            main: [
                [0.00, 0.60, -0.030, 0.020],
                [0.15, 0.52, -0.012, -0.006],
                [0.43, 0.70, 0.034, -0.020],
                [0.69, 0.52, 0.078, 0.032],
                [1.00, 0.72, 0.104, 0.012],
            ],
            crownBoundary: 0.890,
            crown: [
                [-0.200, -0.080, 0.60, -0.030],
                [-0.060, 0.090, 0.70, 0.045],
                [0.080, -0.070, 0.66, 0.047],
                [0.200, 0.060, 0.52, -0.055],
            ],
            crownParents: [
                ["feeder", 0, -1],
                ["main", 2],
                ["feeder", 1, -1],
                ["main", 4],
            ],
            feeders: [
                [-1, 0.70, 3, 3, 0.70],
                [1, 0.52, 4, 3, 0.54],
            ],
            shoulders: [
                [2, -0.225, 0.125, 0.64, 0.76, 0.63, 0.60],
                [3, 0.235, -0.142, 0.62, 0.78, 0.58, 0.48],
                [4, -0.094, -0.108, 0.38, 0.62, 0.54],
                [4, 0.110, 0.082, 0.31, 0.58, 0.50],
            ],
        },
    };
    const profile = profiles[morphology] ?? profiles.balanced;

    const addConnectedNeck = (start, end, radius, role = "thermal-junction") => {
        const dx = end[0] - start[0];
        const dy = end[1] - start[1];
        const dz = end[2] - start[2];
        const distance = Math.max(1e-6, Math.hypot(dx, dy, dz));
        // One axis-aligned ellipsoid spanning both endpoints promoted every
        // diagonal lineage into its entire bounding box.  Several such boxes
        // reconstructed as flat support walls.  A short chain of overlapping,
        // near-spherical parcels follows the actual trajectory while remaining
        // above the 48^3 reconstructibility limit.
        const safeRadius = Math.max(0.026, radius);
        const interiorCount = clamp(
            Math.ceil(distance / (safeRadius * 1.50)) - 1,
            1,
            12,
        );
        const horizontalLength = Math.hypot(dx, dz);
        let normalX = horizontalLength > 0.012 ? -dz / horizontalLength : 0.78;
        let normalZ = horizontalLength > 0.012 ? dx / horizontalLength : -0.63;
        const bendSign = (start[0] + start[2] + end[0] + end[2]) >= 1.96
            ? -1
            : 1;
        normalX *= bendSign;
        normalZ *= bendSign;
        const bend = Math.min(safeRadius * 0.34, distance * 0.075);
        for (let index = 1; index <= interiorCount; index += 1) {
            const t = index / (interiorCount + 1);
            const curve = Math.sin(t * Math.PI) * bend;
            const taper = 1 - Math.abs(t - 0.5) * 0.10;
            addEllipsoid(shapes, [
                mix(start[0], end[0], t) + normalX * curve,
                mix(start[1], end[1], t),
                mix(start[2], end[2], t) + normalZ * curve,
            ], [
                safeRadius * 0.94 * taper,
                safeRadius * 1.08,
                safeRadius * 0.88 * taper,
            ], {
                density: 0.985,
                detail,
                rotation: Math.atan2(dz, dx),
                role,
                // A neck communicates cloudy material; it is not an
                // undiluted updraft head.  Let its boundary entrain rather than
                // unioning every level through the hard protected floor.
                protectedCoreInset: null,
            });
            mergedBodyLobeCount += 1;
        }
        authoredNeckRadii.push(safeRadius);
        communicatingNeckCount += 1;
    };

    const rootCenters = [];
    for (const [dx, dz, radiusX, radiusY, radiusZ] of profile.roots) {
        const center = [
            sourceX + dx + mix(-0.004, 0.004, random()),
            baseY + radiusY,
            sourceZ + dz + mix(-0.004, 0.004, random()),
        ];
        addEllipsoid(shapes, center, [
            // The LCL footprint belongs to the authored source area, not the
            // narrow rising-head radius. Scaling both horizontal axes by the
            // latter made every Congestus owner begin as a pencil stem before
            // abruptly widening into its middle and crown.
            config.baseWidth * radiusX,
            radiusY,
            config.baseDepth * radiusZ,
        ], {
            density: 1,
            detail,
            rotation: mix(-0.32, 0.32, random()),
            role: "root",
        });
        rootCenters.push(center);
    }

    // A merged multicell source includes subordinate condensation pulses
    // inside the same finite lifting footprint. Two shallow, overlapping
    // parcels fill real gaps between the three dominant roots at the LCL;
    // they are compact lobes rather than a planar support slab and remain
    // unprotected so perimeter entrainment can erode them.
    if (morphology === "multicell") {
        const sourcePulses = [
            [-0.055, 0.015, 0.070, 0.028, 0.053],
            [0.055, -0.020, 0.062, 0.026, 0.058],
        ];
        for (const [dx, dz, radiusX, radiusY, radiusZ] of sourcePulses) {
            addEllipsoid(shapes, [
                sourceX + dx,
                baseY + radiusY + 0.001,
                sourceZ + dz,
            ], [radiusX, radiusY, radiusZ], {
                density: 0.98,
                detail,
                rotation: mix(-0.28, 0.28, random()),
                role: "subordinate-source-pulse",
            });
            mergedBodyLobeCount += 1;
        }
    }

    // A few resolved perimeter notches break the finite LCL footprint while
    // leaving the central condensation surface coherent. They replace the
    // former high-amplitude base fractal that stippled every bottom voxel.
    const baseBiteCount = morphology === "multicell" ? 7 : 6;
    for (let index = 0; index < baseBiteCount; index += 1) {
        const angle = index * 2.399963229728653 + mix(-0.18, 0.18, random());
        const radial = config.radius * mix(0.48, 0.92, random());
        const radius = mix(0.020, 0.031, random());
        cavities.push({
            center: [
                sourceX + Math.cos(angle) * radial,
                baseY + radius * mix(0.46, 0.76, random()),
                sourceZ + Math.sin(angle) * radial * 0.82,
            ],
            radii: [radius, radius * 0.76, radius * mix(0.86, 1.16, random())],
            rotation: angle,
            strength: mix(0.84, 1, random()),
            role: "base-entrainment-bite",
        });
    }

    const mainCenters = [];
    const mainRadii = [];
    const mainVerticalRadii = [];
    const pulseWidths = [];
    for (let level = 0; level < profile.main.length; level += 1) {
        const [t, radiusScale, dx, dz] = profile.main[level];
        const radius = config.radius * radiusScale * mix(0.96, 1.04, random());
        const center = [
            sourceX + dx + mix(-0.004, 0.004, random()),
            mix(baseY + 0.063, profile.mainTop, Math.pow(t, 0.98)),
            sourceZ + dz + mix(-0.004, 0.004, random()),
        ];
        let verticalRadius = radius * mix(0.94, 1.07, random());
        if (level === 0) {
            verticalRadius = Math.min(verticalRadius, center[1] - baseY - 0.005);
        }
        addEllipsoid(shapes, center, [
            radius * mix(0.95, 1.06, random()),
            verticalRadius,
            radius * mix(0.90, 1.04, random()),
        ], {
            density: 1,
            detail,
            rotation: mix(-0.42, 0.42, random()),
            role: "thermal-mass",
            // Only the first resolved pulse continues the protected source
            // core. Higher events are optically dense through their actual
            // support, but their mixed boundaries remain free to separate.
            protectedCoreInset: level === 0 ? 0.024 : null,
        });
        resolvedThermalHeadCount += 1;
        if (level === 0) hardProtectedThermalHeadCount += 1;
        mainCenters.push(center);
        mainRadii.push(radius);
        mainVerticalRadii.push(verticalRadius);
        pulseWidths.push(radius);
        mergedBodyLobeCount += 1;

        if (level > 0) {
            addConnectedNeck(
                mainCenters[level - 1],
                center,
                Math.min(mainRadii[level - 1], radius) *
                    (morphology === "turreted" ? 0.40 : 0.43),
            );
            // Expose one oblique, exterior entrainment bay rather than
            // subtracting the complete pulse junction. Mid-plane cuts read as
            // horizontal shelves after 48^3 reconstruction even when their
            // source shapes are smooth. A lateral bay still reveals successive
            // parcel events while preserving one continuous moist core.
            if (level === 2) {
                const previous = mainCenters[level - 1];
                const side = level % 2 === 0 ? -1 : 1;
                const cutRadius = Math.max(0.022, Math.min(
                    mainRadii[level - 1], radius,
                ) * mix(0.42, 0.50, random()));
                const midpointX = mix(previous[0], center[0], 0.50);
                const midpointZ = mix(previous[2], center[2], 0.50);
                let outwardX = midpointX - sourceX;
                let outwardZ = midpointZ - sourceZ;
                const outwardLength = Math.hypot(outwardX, outwardZ);
                if (outwardLength < 0.018) {
                    outwardX = side;
                    outwardZ = -side * 0.42;
                } else {
                    outwardX /= outwardLength;
                    outwardZ /= outwardLength;
                }
                cavities.push({
                    center: [
                        midpointX + outwardX * cutRadius * 1.36,
                        mix(previous[1], center[1], 0.54),
                        midpointZ + outwardZ * cutRadius * 1.36,
                    ],
                    radii: [
                        cutRadius * 0.94,
                        cutRadius * 1.04,
                        cutRadius * 0.72,
                    ],
                    rotation: Math.atan2(outwardZ, outwardX) + side * 0.26,
                    strength: mix(0.84, 0.94, random()),
                    role: "thermal-entrainment-bay",
                });
                authoredCleftDepths.push(cutRadius * 1.04);
            }
        }

        if (level === 0) continue;
        // One attached head is enough to reveal an individual buoyant event at
        // 48^3. A second head is reserved for the terminal event; decorating
        // every level twice reconstructs as a row of laterally offset columns.
        const budCount = level === profile.main.length - 1 ? 2 : 1;
        const phase = random() * Math.PI * 2;
        for (let bud = 0; bud < budCount; bud += 1) {
            const angle = phase + bud * 2.399963229728653;
            const scale = bud === 0 ? mix(0.57, 0.65, random())
                : mix(0.46, 0.57, random());
            const budRadius = Math.max(0.036, radius * scale);
            const offset = radius * mix(0.61, 0.70, random()) +
                budRadius * 0.16;
            const budCenter = [
                center[0] + Math.cos(angle) * offset,
                center[1] + budRadius * mix(
                    level >= profile.main.length - 2 ? 0.12 : -0.20,
                    level >= profile.main.length - 2 ? 0.70 : 0.44,
                    random(),
                ),
                center[2] + Math.sin(angle) * offset * mix(0.82, 1.02, random()),
            ];
            addEllipsoid(shapes, budCenter, [
                budRadius * mix(0.95, 1.08, random()),
                budRadius * mix(0.98, 1.16, random()),
                budRadius * mix(0.90, 1.05, random()),
            ], {
                density: 0.98,
                detail,
                rotation: angle,
                role: "convex-bud",
            });
            authoredBudRadii.push(budRadius);
            nestedPulseCount += 1;
            mergedBodyLobeCount += 1;
            resolvedThermalHeadCount += 1;

            if (bud !== 0 || level < Math.floor(profile.main.length * 0.48)) continue;
            const nestedRadius = Math.max(0.033, budRadius * mix(0.56, 0.64, random()));
            const nestedAngle = angle + mix(0.52, 0.94, random());
            const nestedCenter = [
                budCenter[0] + Math.cos(nestedAngle) * budRadius * 0.66,
                budCenter[1] + nestedRadius * mix(0.42, 0.76, random()),
                budCenter[2] + Math.sin(nestedAngle) * budRadius * 0.58,
            ];
            addEllipsoid(shapes, nestedCenter, [
                nestedRadius * 1.04,
                nestedRadius * 1.08,
                nestedRadius * 0.94,
            ], {
                density: 0.97,
                detail,
                rotation: nestedAngle,
                role: "nested-convex-bud",
            });
            addConnectedNeck(budCenter, nestedCenter,
                Math.max(0.020, nestedRadius * 0.54), "bud-neck");
            authoredBudRadii.push(nestedRadius);
            nestedPulseCount += 1;
            cuspCount += 1;
            mergedBodyLobeCount += 1;
            resolvedThermalHeadCount += 1;
        }
    }

    // Secondary source thermals are younger or older parcels from the same
    // lifting area. They remain laterally readable through most of their life
    // and merge only below the selected dominant event. This prevents both a
    // set of detached towers and the former single centred silo.
    const feederLineages = [];
    for (let feeder = 0; feeder < profile.feeders.length; feeder += 1) {
        const [side, bowScale, joinIndex, authoredSteps = 4,
            peakScale = 0.60] = profile.feeders[feeder];
        const start = rootCenters[side < 0 ? 0 : rootCenters.length - 1];
        const target = mainCenters[Math.min(joinIndex, mainCenters.length - 1)];
        let previous = start;
        let previousRadius = config.radius * 0.35;
        const feederSteps = authoredSteps;
        const lineage = [];
        for (let step = 1; step <= feederSteps; step += 1) {
            const u = step / feederSteps;
            const feederEndScale = morphology === "turreted" ? 0.42
                : morphology === "multicell" ? 0.44 : 0.40;
            const feederMiddleScale = peakScale;
            const radius = config.radius * mix(
                feederEndScale,
                feederMiddleScale,
                Math.sin(u * Math.PI),
            ) * mix(0.94, 1.06, random());
            const center = [
                mix(start[0], target[0], u) +
                    side * Math.sin(u * Math.PI) * config.radius * bowScale,
                mix(baseY + 0.060, target[1], u),
                mix(start[2], target[2], u) -
                    side * Math.sin(u * Math.PI) * config.radius * bowScale * 0.42,
            ];
            addEllipsoid(shapes, center, [
                radius,
                radius * mix(0.94, 1.10, random()),
                radius * 0.92,
            ], {
                density: 0.99,
                detail,
                role: "feeder-thermal",
                protectedCoreInset: null,
            });
            resolvedThermalHeadCount += 1;
            addConnectedNeck(previous, center,
                Math.min(previousRadius, radius) * 0.46);
            previous = center;
            previousRadius = radius;
            lineage.push({ center, radius });
            pulseWidths.push(radius);
            mergedBodyLobeCount += 1;
        }
        feederLineages.push(lineage);
    }

    // Real convective towers contain several lifecycle states at once. Hard,
    // actively rising heads coexist with older mixed-air shoulders which have
    // spread, lost buoyancy and begun to erode. These are source-connected
    // condensate lobes, not detached opacity sprites or screen-space masks.
    // Their explicitly unequal scales and heights are what breaks the visual
    // rhythm of repeated vertical stamps at atlas reconstruction scale.
    let dissipatingShoulderCount = 0;
    for (const [anchorIndex, dx, dz, radiusScale, verticalScale,
        densityScale, verticalLiftScale = null] of profile.shoulders) {
        const anchor = mainCenters[Math.min(anchorIndex, mainCenters.length - 1)];
        const radius = config.radius * radiusScale * mix(0.96, 1.04, random());
        const shoulder = [
            anchor[0] + dx,
            verticalLiftScale === null
                ? anchor[1] - radius * mix(0.08, 0.30, random())
                : anchor[1] + radius * verticalLiftScale,
            anchor[2] + dz,
        ];
        addConnectedNeck(
            anchor,
            shoulder,
            Math.max(0.023, radius * mix(0.42, 0.50, random())),
            "detraining-shoulder-neck",
        );
        addEllipsoid(shapes, shoulder, [
            radius * mix(1.08, 1.24, random()),
            radius * verticalScale,
            radius * mix(0.92, 1.16, random()),
        ], {
            density: densityScale,
            detail: mix(0.30, 0.40, random()),
            rotation: Math.atan2(dz, dx),
            role: "detraining-shoulder",
        });
        // A smaller trailing remnant makes the shoulder end in a scalloped,
        // entraining edge rather than another complete ellipsoid.
        const outwardLength = Math.max(0.02, Math.hypot(dx, dz));
        const outwardX = dx / outwardLength;
        const outwardZ = dz / outwardLength;
        const remnantRadius = Math.max(0.034,
            radius * mix(0.48, 0.60, random()));
        const remnant = [
            shoulder[0] + outwardX * radius * mix(0.64, 0.78, random()),
            shoulder[1] - remnantRadius * mix(0.12, 0.34, random()),
            shoulder[2] + outwardZ * radius * mix(0.58, 0.74, random()),
        ];
        addEllipsoid(shapes, remnant, [
            remnantRadius * 1.16,
            remnantRadius * mix(0.68, 0.82, random()),
            remnantRadius,
        ], {
            density: Math.max(0.46, densityScale - 0.08),
            detail: mix(0.31, 0.42, random()),
            rotation: Math.atan2(outwardZ, outwardX),
            role: "detraining-remnant",
        });
        cavities.push({
            center: [
                shoulder[0] + outwardX * radius * 0.52,
                shoulder[1] - radius * 0.18,
                shoulder[2] + outwardZ * radius * 0.52,
            ],
            radii: [radius * 0.42, radius * 0.64, radius * 0.48],
            rotation: Math.atan2(outwardZ, outwardX),
            strength: mix(0.82, 0.96, random()),
            role: "entrainment-wake",
        });
        authoredBudRadii.push(remnantRadius);
        nestedPulseCount += 1;
        cuspCount += 1;
        mergedBodyLobeCount += 3;
        dissipatingShoulderCount += 1;
    }

    // Continue several independently readable late thermals into the crown.
    // A former implementation connected every terminal to one shared root;
    // the resulting radial graph was physically connected but projected as a
    // conspicuous Y-shaped sculpture. These parent descriptors instead bind a
    // crown head to a specific main or feeder event. The bridges overlap the
    // local parcel, so connectivity survives reconstruction without drawing a
    // separate support strut through the silhouette.
    const crownTerminals = [];
    const crownAnchorUseCounts = new Map();
    const crownTopOffsets = profile.crown.map((entry) => entry[3]);
    const minimumCrownTopOffset = Math.min(...crownTopOffsets);
    const maximumCrownTopOffset = Math.max(...crownTopOffsets);

    const resolveCrownAnchor = (descriptor, branch) => {
        const [kind, authoredIndex, authoredStep = -1] = descriptor ?? [
            "main",
            Math.max(0, mainCenters.length - 1 - branch),
        ];
        if (kind === "feeder") {
            const feederIndex = clamp(
                authoredIndex,
                0,
                Math.max(0, feederLineages.length - 1),
            );
            const lineage = feederLineages[feederIndex];
            if (lineage?.length) {
                const resolvedStep = authoredStep < 0
                    ? lineage.length + authoredStep
                    : authoredStep;
                const step = clamp(resolvedStep, 0, lineage.length - 1);
                return {
                    center: lineage[step].center,
                    radius: lineage[step].radius,
                    key: `feeder:${feederIndex}:${step}`,
                };
            }
        }
        const resolvedIndex = authoredIndex < 0
            ? mainCenters.length + authoredIndex
            : authoredIndex;
        const mainIndex = clamp(resolvedIndex, 0, mainCenters.length - 1);
        return {
            center: mainCenters[mainIndex],
            radius: mainRadii[mainIndex],
            key: `main:${mainIndex}`,
        };
    };

    for (let branch = 0; branch < profile.crown.length; branch += 1) {
        const [dx, dz, radiusScale, topOffset] = profile.crown[branch];
        const anchor = resolveCrownAnchor(profile.crownParents?.[branch], branch);
        crownAnchorUseCounts.set(
            anchor.key,
            (crownAnchorUseCounts.get(anchor.key) ?? 0) + 1,
        );
        const branchActivity = (topOffset - minimumCrownTopOffset) /
            Math.max(0.001, maximumCrownTopOffset - minimumCrownTopOffset);
        const terminalRadius = config.radius * radiusScale *
            mix(0.97, 1.03, random());
        const terminalVerticalScale = mix(1.00, 1.12, random());
        const terminal = [
            sourceX + dx + mix(-0.004, 0.004, random()),
            profile.crownBoundary + topOffset -
                terminalRadius * terminalVerticalScale,
            sourceZ + dz + mix(-0.004, 0.004, random()),
        ];
        // Preserve one resolved precursor between the parent pulse and its
        // terminal head. The previous pair of large precursor ellipsoids plus
        // three bounding-box bridges made every crown lineage a narrow tower
        // of its own. One asymmetric precursor and curved necks retain a
        // readable genealogy without drawing support columns.
        const precursorRadius = Math.max(
            0.034,
            Math.min(
                anchor.radius * 0.68,
                terminalRadius * mix(0.58, 0.68, random()),
            ),
        );
        const branchDx = terminal[0] - anchor.center[0];
        const branchDz = terminal[2] - anchor.center[2];
        const horizontalDistance = Math.max(0.001,
            Math.hypot(branchDx, branchDz));
        const bendSign = branch % 2 === 0 ? -1 : 1;
        const bend = Math.min(
            config.radius * mix(0.10, 0.18, random()),
            horizontalDistance * 0.18,
        );
        // A merged multicell tower preserves distinct source parcels through
        // the middle body, whereas the balanced tower delays most lateral
        // expansion until the crown. The narrow turreted phenotype occupies
        // the physically intermediate case. This is parcel genealogy, not a
        // view-dependent silhouette adjustment.
        const precursorHorizontalT = morphology === "multicell" ? 0.70
            : morphology === "turreted" ? 0.58 : 0.52;
        const precursor = [
            mix(anchor.center[0], terminal[0], precursorHorizontalT) -
                branchDz / horizontalDistance * bend * bendSign,
            mix(anchor.center[1], terminal[1], 0.62),
            mix(anchor.center[2], terminal[2], precursorHorizontalT) +
                branchDx / horizontalDistance * bend * bendSign,
        ];
        addConnectedNeck(anchor.center, precursor,
            Math.max(0.024, Math.min(anchor.radius, precursorRadius) * 0.44),
            "crown-lineage-neck");
        addEllipsoid(shapes, precursor, [
            precursorRadius * mix(0.94, 1.02, random()),
            precursorRadius * mix(1.02, 1.14, random()),
            precursorRadius * mix(0.88, 0.97, random()),
        ], {
            density: 0.99,
            detail,
            rotation: Math.atan2(branchDz, branchDx),
            role: "crown-lineage-precursor",
            protectedCoreInset: null,
        });
        addConnectedNeck(precursor, terminal,
            Math.max(0.024,
                Math.min(precursorRadius, terminalRadius) * 0.44),
            "crown-lineage-neck");
        addEllipsoid(shapes, terminal, [
            terminalRadius * mix(0.96, 1.05, random()),
            terminalRadius * terminalVerticalScale,
            terminalRadius * mix(0.92, 1.04, random()),
        ], {
            density: 1,
            detail,
            rotation: Math.atan2(dz, dx),
            role: "crown-terminal-head",
            protectedCoreInset: null,
        });
        authoredBudRadii.push(
            precursorRadius,
            terminalRadius,
        );
        nestedPulseCount += 2;
        crownLobeCount += 2;
        mergedBodyLobeCount += 2;
        resolvedThermalHeadCount += 2;

        // The narrow turreted phenotype terminates in one dominant fresh
        // bubble. Give that bubble a resolved apical dome rather than relying
        // on a flat ellipsoid plateau; it survives a radius-two footprint and
        // keeps the summit recognizably cauliflower-shaped without adding a
        // fourth lateral tower.
        if ((morphology === "turreted" || morphology === "multicell") &&
            branch === 1) {
            // The merged multicell crown also needs one actively rising dome.
            // Its other heads are deliberately older and broader, so lifting
            // this continuation above their shared envelope produces a real
            // successive-thermal elevation instead of four co-height lobes.
            // Keep it attached to the dominant lineage rather than adding a
            // laterally offset fifth column.
            const apicalRadius = Math.max(
                morphology === "multicell" ? 0.042 : 0.046,
                terminalRadius * (morphology === "multicell" ? 0.46 : 0.54),
            );
            const apical = [
                terminal[0] - apicalRadius * 0.10,
                terminal[1] + terminalRadius *
                    (morphology === "multicell" ? 0.82 : 0.76),
                terminal[2] + apicalRadius * 0.08,
            ];
            addEllipsoid(shapes, apical, [
                apicalRadius * 0.90,
                apicalRadius * 1.28,
                apicalRadius * 0.86,
            ], {
                density: 1,
                detail,
                role: "crown-apical-bud",
                protectedCoreInset: null,
            });
            addConnectedNeck(terminal, apical,
                Math.max(0.026, apicalRadius * 0.50), "bud-neck");
            authoredBudRadii.push(apicalRadius);
            nestedPulseCount += 1;
            cuspCount += 1;
            crownLobeCount += 1;
            mergedBodyLobeCount += 2;
            resolvedThermalHeadCount += 1;
        }

        const outwardAngle = Math.atan2(branchDz, branchDx);
        const primaryDirection = branch % 2 === 0 ? -1 : 1;
        // The newest heads carry a smaller, lower companion beside the hard
        // rising bud. Unequal radii and vertical ages create cauliflower
        // hierarchy without giving each terminal a symmetric forked crown.
        const budAngles = branchActivity >= 0.52
            ? morphology === "turreted"
                ? [primaryDirection * 0.62, 0]
                : morphology === "multicell"
                    ? [primaryDirection * 0.62]
                    : [primaryDirection * 0.62, -primaryDirection * 0.96]
            : [primaryDirection * 0.76];
        for (let bud = 0; bud < budAngles.length; bud += 1) {
            const angle = outwardAngle + budAngles[bud] +
                mix(-0.12, 0.12, random());
            const budRadius = Math.max(
                bud === 0 ? 0.038 : 0.034,
                terminalRadius * (bud === 0
                    ? mix(0.54, 0.62, random())
                    : mix(0.40, 0.49, random())) *
                    mix(0.82, 1.08, branchActivity),
            );
            const budCenter = [
                terminal[0] + Math.cos(angle) * terminalRadius *
                    mix(bud === 0 ? 0.56
                        : morphology === "turreted" ? 0.76 : 0.48,
                    bud === 0 ? 0.68
                        : morphology === "turreted" ? 0.88 : 0.60,
                    random()) - (morphology === "turreted" &&
                        branch === 0 && bud > 0 ? terminalRadius * 0.26 : 0),
                terminal[1] + budRadius * mix(
                    morphology === "turreted" && bud > 0
                        ? -0.76
                        : bud === 0
                            ? mix(-0.18, 0.10, random())
                            : mix(-0.34, -0.08, random()),
                    morphology === "turreted" && bud > 0
                        ? -0.62
                        : bud === 0
                            ? mix(0.68, 0.92, random())
                            : mix(0.06, 0.30, random()),
                    branchActivity,
                ),
                terminal[2] + Math.sin(angle) * terminalRadius *
                    mix(bud === 0 ? 0.52
                        : morphology === "turreted" ? 0.72 : 0.46,
                    bud === 0 ? 0.66
                        : morphology === "turreted" ? 0.84 : 0.58,
                    random()) - (morphology === "turreted" &&
                        branch === 0 && bud > 0 ? terminalRadius * 0.60 : 0),
            ];
            addEllipsoid(shapes, budCenter, [
                budRadius * mix(0.98, 1.07, random()),
                budRadius * mix(
                    bud === 0 ? 1.04 : 0.88,
                    bud === 0 ? 1.18 : 1.02,
                    random(),
                ),
                budRadius * mix(0.90, 0.98, random()),
            ], {
                density: 0.99,
                detail,
                rotation: angle,
                role: "crown-convex-bud",
            });
            addConnectedNeck(terminal, budCenter,
                Math.max(0.020, budRadius * 0.50), "bud-neck");
            authoredBudRadii.push(budRadius);
            nestedPulseCount += 1;
            cuspCount += 1;
            crownLobeCount += 1;
            mergedBodyLobeCount += 2;
            resolvedThermalHeadCount += 1;

            if (bud !== 0) continue;
            const nestedRadius = Math.max(0.033,
                budRadius * mix(0.57, 0.64, random()));
            const nestedAngle = angle - primaryDirection *
                mix(0.42, 0.76, random());
            const nestedCenter = [
                budCenter[0] + Math.cos(nestedAngle) * budRadius * 0.62,
                budCenter[1] + nestedRadius * mix(
                    mix(-0.16, 0.10, random()),
                    mix(0.68, 0.92, random()),
                    branchActivity,
                ) + (morphology === "turreted"
                    ? nestedRadius * branchActivity * 0.38
                    : 0),
                budCenter[2] + Math.sin(nestedAngle) * budRadius * 0.56,
            ];
            addEllipsoid(shapes, nestedCenter, [
                nestedRadius * 1.04,
                nestedRadius * 1.08,
                nestedRadius * 0.94,
            ], {
                density: 0.98,
                detail,
                rotation: nestedAngle,
                role: "crown-nested-bud",
            });
            addConnectedNeck(budCenter, nestedCenter,
                Math.max(0.019, nestedRadius * 0.52), "bud-neck");
            authoredBudRadii.push(nestedRadius);
            nestedPulseCount += 1;
            cuspCount += 1;
            crownLobeCount += 1;
            mergedBodyLobeCount += 2;
            resolvedThermalHeadCount += 1;
        }

        crownTerminals.push({
            center: terminal,
            radius: terminalRadius,
            anchorKey: anchor.key,
        });
    }

    // Carve the dry-air valleys between neighboring heads in both canonical
    // elevations. The same pair may be adjacent in x or z; de-duplicate it so
    // the connected interior is never over-subtracted.
    const cleftPairs = new Map();
    for (const axis of [0, 2]) {
        const sorted = [...crownTerminals].sort((left, right) =>
            left.center[axis] - right.center[axis]);
        for (let index = 0; index + 1 < sorted.length; index += 1) {
            const left = sorted[index];
            const right = sorted[index + 1];
            const key = [left, right]
                .map((entry) => crownTerminals.indexOf(entry))
                .sort((a, b) => a - b).join(":");
            cleftPairs.set(key, [left, right]);
        }
    }
    for (const [left, right] of cleftPairs.values()) {
        const angle = Math.atan2(
            right.center[2] - left.center[2],
            right.center[0] - left.center[0],
        );
        const minimumRadius = Math.min(left.radius, right.radius);
        const cutRadius = clamp(minimumRadius * 0.48, 0.028, 0.040);
        const leftTop = left.center[1] + left.radius;
        const rightTop = right.center[1] + right.radius;
        const depth = Math.max(
            morphology === "balanced" ? 0.048 : 0,
            minimumRadius * mix(
                morphology === "turreted" ? 0.88 : 0.86,
                morphology === "turreted" ? 1.10 : 1.08,
                random(),
            ),
        );
        cavities.push({
            center: [
                mix(left.center[0], right.center[0], 0.50),
                Math.min(leftTop, rightTop) - depth * 0.28,
                mix(left.center[2], right.center[2], 0.50),
            ],
            radii: [cutRadius, depth, cutRadius * 1.26],
            rotation: angle,
            strength: 1,
            role: "crown-interthermal-cleft",
        });
        authoredCleftDepths.push(depth);
    }

    // Subordinate mixed-air remnants are coherent lobes, not opacity speckle.
    // Keep them large enough to survive the 48^3 reconstruction theorem.
    const flankAnchors = shapes.filter((shape) =>
        shape.role === "convex-bud" || shape.role === "crown-convex-bud");
    const evaporatingFlankCount = morphology === "multicell" ? 7 : 6;
    for (let index = 0; index < evaporatingFlankCount; index += 1) {
        const anchor = flankAnchors[(index * 3 + 1) % flankAnchors.length];
        let outwardX = anchor.center[0] - sourceX;
        let outwardZ = anchor.center[2] - sourceZ;
        const outwardLength = Math.max(0.02, Math.hypot(outwardX, outwardZ));
        outwardX /= outwardLength;
        outwardZ /= outwardLength;
        const anchorRadius = Math.max(anchor.radii[0], anchor.radii[2]);
        const radius = Math.max(0.035, anchorRadius * mix(0.48, 0.62, random()));
        addEllipsoid(shapes, [
            anchor.center[0] + outwardX * anchorRadius * 0.62,
            anchor.center[1] - radius * mix(0.12, 0.36, random()),
            anchor.center[2] + outwardZ * anchorRadius * 0.62,
        ], [radius, radius * 0.74, radius * 0.92], {
            density: mix(0.58, 0.68, random()),
            detail,
            rotation: Math.atan2(outwardZ, outwardX),
            role: "evaporating-flank",
        });
    }

    const meanWidth = pulseWidths.reduce((sum, value) => sum + value, 0) /
        Math.max(1, pulseWidths.length);
    const widthVariation = Math.sqrt(pulseWidths.reduce((sum, value) =>
        sum + (value - meanWidth) ** 2, 0) /
        Math.max(1, pulseWidths.length)) / Math.max(1e-6, meanWidth);
    const eventIntervals = profile.main.slice(1).map((entry, index) =>
        entry[0] - profile.main[index][0]);
    const meanInterval = eventIntervals.reduce((sum, value) => sum + value, 0) /
        Math.max(1, eventIntervals.length);
    const eventIntervalVariation = Math.sqrt(eventIntervals.reduce((sum, value) =>
        sum + (value - meanInterval) ** 2, 0) /
        Math.max(1, eventIntervals.length)) / Math.max(1e-6, meanInterval);

    return {
        shapes,
        cavities,
        baseY,
        ownerPoints: rootCenters.map((center) => [center[0], center[2]]),
        baseLobeCount: profile.roots.length,
        crownLobeCount,
        mergedBodyLobeCount,
        evaporatingFlankCount,
        secondaryLobeCount: nestedPulseCount + cuspCount,
        hierarchyLevelCount: 4,
        branchSpread: Math.max(...profile.crown.map(([dx, dz]) =>
            Math.hypot(dx, dz))) * 2,
        cumulusNestedPulseCount: nestedPulseCount,
        cumulusCuspCount: cuspCount,
        cumulusCrownBranchCount: profile.crown.length,
        cumulusCrownLineageAnchorCount: crownAnchorUseCounts.size,
        cumulusCrownMaximumSharedJunctionChildren: Math.max(
            0,
            ...crownAnchorUseCounts.values(),
        ),
        cumulusThermalChainCount: 1 + profile.feeders.length,
        cumulusDissipatingShoulderCount: dissipatingShoulderCount,
        cumulusAuthoredResolvedThermalHeadCount: resolvedThermalHeadCount,
        cumulusAuthoredCommunicatingNeckCount: communicatingNeckCount,
        cumulusHardProtectedThermalHeadCount: hardProtectedThermalHeadCount,
        cumulusHardProtectedJunctionCount: hardProtectedJunctionCount,
        cumulusCrownTopHeightVariation: (() => {
            const heights = profile.crown.map((entry) => entry[3]);
            return Math.max(...heights) - Math.min(...heights);
        })(),
        cumulusDominantTrajectoryDrift: Math.hypot(
            mainCenters.at(-1)[0] - mainCenters[0][0],
            mainCenters.at(-1)[2] - mainCenters[0][2],
        ),
        cumulusTowerWidthVariation: widthVariation,
        cumulusThermalEventSpacingVariation: eventIntervalVariation,
        cumulusMeanThermalVerticalAspect: mainVerticalRadii.reduce(
            (sum, radius, index) => sum + radius / mainRadii[index], 0,
        ) / Math.max(1, mainRadii.length),
        cumulusAuthoredMinimumBudRadiusCanonical:
            Math.min(...authoredBudRadii),
        cumulusAuthoredMaximumBudRadiusCanonical:
            Math.max(...authoredBudRadii),
        cumulusAuthoredMinimumNeckRadiusCanonical:
            Math.min(...authoredNeckRadii),
        cumulusAuthoredMaximumCleftDepthCanonical:
            Math.max(...authoredCleftDepths),
    };
};

/**
 * Fair-weather Cumulus needs a different macro vocabulary from deep mixed-
 * phase convection. The previous shared branch builder filled five broad
 * roots with dozens of weak, near-equal bubbles; at display scale that reduced
 * every species to rounded blocks. This builder keeps one source-connected
 * parcel tree, then adds successively smaller attached vortex-shell pulses.
 * The LCL remains horizontally coherent through the centre while dry-air
 * bites are confined to its perimeter.
 */
const buildCumulusModel = (config, seed) => {
    if (config.species === "congestus") {
        return buildCongestusModel(config, seed);
    }
    const random = makeRandom(seed);
    const shapes = [];
    const cavities = [];
    const baseY = 0.145;
    const congestus = config.species === "congestus";
    const mediocris = config.species === "mediocris";
    const morphology = config.morphologyVariant ?? config.species;
    const rootDefinitions = congestus
        ? [
            // A coherent LCL is a plane, not a rectangular platform. These
            // unequal, overlapping source lobes keep that plane while making
            // its footprint materially smaller and less box-like than the
            // developing tower above it.
            [0.49, 0.50, 0.26, 0.18, 0.34],
            [0.445, 0.515, 0.16, 0.14, 0.22],
            [0.55, 0.47, 0.15, 0.15, 0.22],
            [0.515, 0.445, 0.13, 0.12, 0.18],
        ]
        : mediocris
            ? [
                [0.49, 0.50, 0.50, 0.43, 0.68],
                [0.38, 0.51, 0.34, 0.34, 0.51],
                [0.61, 0.46, 0.31, 0.37, 0.47],
                [0.51, 0.38, 0.27, 0.30, 0.42],
            ]
            : [
                [0.49, 0.50, 0.50, 0.36, 0.69],
                [0.40, 0.51, 0.35, 0.31, 0.49],
                [0.59, 0.47, 0.31, 0.34, 0.45],
            ];
    const rootCenters = [];
    for (const [x, z, widthScale, heightScale, depthScale] of rootDefinitions) {
        const rootJitter = congestus ? 0.012 : 0.026;
        const verticalRadius = config.radius * heightScale;
        const center = [
            x + (random() - 0.5) * rootJitter,
            baseY + verticalRadius + (random() - 0.5) * 0.004,
            z + (random() - 0.5) * rootJitter,
        ];
        const radii = [
            config.baseWidth * widthScale,
            verticalRadius,
            config.baseDepth * depthScale,
        ];
        addEllipsoid(shapes, center, radii, {
            density: mix(0.91, 1, random()),
            detail: config.detailBase,
            rotation: mix(-0.34, 0.34, random()),
            role: "root",
        });
        rootCenters.push(center);
    }
    for (let index = 1; index < rootCenters.length; index += 1) {
        const center = rootCenters[index];
        const root = rootCenters[0];
        addEllipsoid(shapes, [
            mix(root[0], center[0], 0.52),
            baseY + (congestus ? 0.030 : 0.027),
            mix(root[2], center[2], 0.52),
        ], [
            Math.max(0.035, Math.abs(root[0] - center[0]) * 0.62),
            congestus ? 0.031 : 0.027,
            Math.max(0.035, Math.abs(root[2] - center[2]) * 0.62),
        ], {
            density: 0.98,
            detail: config.detailBase,
            rotation: Math.atan2(center[2] - root[2], center[0] - root[0]),
            role: "root-bridge",
        });
    }

    // Perimeter-only entrainment leaves a credible flat central LCL instead
    // of either a rectangular slab or globally ragged underside.
    const baseBiteCount = congestus ? 9 : mediocris ? 6 : 4;
    for (let index = 0; index < baseBiteCount; index += 1) {
        const angle = index * 2.399963229728653 + random() * 0.42;
        const radial = mix(congestus ? 0.065 : 0.125, congestus ? 0.118 : 0.185, random());
        const radius = mix(congestus ? 0.016 : 0.022, congestus ? 0.032 : 0.037, random());
        cavities.push({
            center: [
                0.50 + Math.cos(angle) * radial,
                baseY + radius * mix(0.34, 0.74, random()),
                0.49 + Math.sin(angle) * radial * 0.78,
            ],
            radii: [radius * mix(0.85, 1.25, random()), radius * 0.72,
                radius * mix(0.82, 1.18, random())],
            rotation: angle,
            strength: mix(0.58, 0.86, random()),
            role: congestus ? "base-entrainment-bite" : "perimeter-entrainment-bite",
        });
    }

    const levels = congestus ? Math.max(10, config.levels) : mediocris ? 7 : 4;
    const driftScale = congestus ? 1 : mediocris ? 0.68 : 0.42;
    const driftSign = morphology === "turreted" ? 1 : morphology === "multicell" ? -1 : 0.62;
    // A rising cloud is a sequence of buoyant thermal events, not a stack of
    // evenly spaced horizontal slices. Equal-height samples and a periodic
    // radius function survived 48^3 voxelization as repeated terraces. Draw
    // positive, bounded event intervals and normalize their cumulative sum so
    // the graph still reaches the authored top without acquiring a lattice.
    const eventIntervals = Array.from({ length: Math.max(1, levels - 1) },
        (_, index) => {
            const correlated = 0.82 + random() * 0.46;
            const alternatingBias = index % 3 === 0 ? 0.83
                : index % 3 === 1 ? 1.13 : 1.01;
            return correlated * alternatingBias;
        });
    const totalEventInterval = eventIntervals.reduce((sum, value) => sum + value, 0);
    const eventTimes = [0];
    for (const interval of eventIntervals) {
        eventTimes.push(eventTimes.at(-1) + interval / totalEventInterval);
    }
    const meanEventInterval = 1 / Math.max(1, levels - 1);
    const eventIntervalVariation = Math.sqrt(eventIntervals.reduce((sum, interval) => {
        const normalized = interval / totalEventInterval;
        return sum + (normalized - meanEventInterval) ** 2;
    }, 0) / Math.max(1, eventIntervals.length)) / meanEventInterval;

    // The centreline follows an integrated, correlated lateral velocity. A
    // sinusoid made every congestus variant bend back and forth at the same
    // vertical wavelengths; this trajectory remains smooth and connected but
    // never becomes bilateral or periodically repeated.
    let trajectoryX = 0.49;
    let trajectoryZ = 0.49;
    let trajectoryVelocityX = driftSign * mix(0.004, 0.011, random());
    let trajectoryVelocityZ = mix(-0.005, 0.005, random());
    let thermalGrowthState = mix(-0.08, 0.08, random());
    const mainCenters = [];
    const mainRadii = [];
    let nestedPulseCount = 0;
    let cuspCount = 0;
    let mergedBodyLobeCount = 0;
    let crownLobeCount = 0;
    const pulseWidths = [];
    for (let level = 0; level < levels; level += 1) {
        const t = eventTimes[level];
        thermalGrowthState = clamp(
            thermalGrowthState * mix(0.38, 0.58, random()) +
                (random() - 0.5) * (congestus ? 0.46 : mediocris ? 0.32 : 0.22),
            congestus ? -0.25 : -0.18,
            congestus ? 0.28 : 0.20,
        );
        const fairWeatherPulseMotif = mediocris
            ? [1.08, 0.77, 1.16, 0.84, 1.04, 0.72, 1.12]
            : [1.10, 0.82, 1.04, 0.74];
        const pulse = congestus
            ? 0.96 + thermalGrowthState *
                    (morphology === "multicell" ? 1.75 : 1) +
                smoothstep(0.66, 1, t) * (morphology === "turreted" ? 0.055 : 0.085)
            : fairWeatherPulseMotif[level] + thermalGrowthState *
                (mediocris ? 0.46 : 0.34);
        // The protected trunk narrows between buoyant events and expands into
        // its crown. Keeping one nearly constant radius through twelve close
        // samples made the reconstructed owner a rectangular pillar even
        // though its source ellipsoids varied numerically.
        const trunkEnvelope = !congestus ? 1
            : morphology === "multicell"
                ? mix(0.74, 0.84, smoothstep(0.05, 0.86, t))
                : morphology === "turreted"
                    ? mix(0.62, 0.75, smoothstep(0.04, 0.90, t))
                    : mix(0.67, 0.80, smoothstep(0.04, 0.86, t));
        const horizontalRadius = config.radius * pulse * trunkEnvelope * (
            morphology === "multicell" ? 1.06 : morphology === "turreted" ? 0.91 : 1
        );
        // Growing liquid thermal heads are close to spherical or vertically
        // elongated. The old 0.68--0.82 scale authored flat spheroids, so an
        // oblique view literally exposed each successive one as a shelf.
        let verticalRadius = horizontalRadius * (congestus
            ? mix(0.91, 1.14, t) * mix(0.94, 1.08, random())
            : mediocris ? mix(0.78, 0.96, t) * mix(0.96, 1.05, random())
                : mix(0.64, 0.80, t) * mix(0.96, 1.05, random()));
        if (level > 0) {
            const eventInterval = eventTimes[level] - eventTimes[level - 1];
            trajectoryVelocityX = trajectoryVelocityX * 0.62 +
                driftSign * mix(0.001, 0.004, random()) +
                (random() - 0.5) * mix(0.007, 0.014, t);
            trajectoryVelocityZ = trajectoryVelocityZ * 0.58 +
                (random() - 0.5) * mix(0.007, 0.015, t);
            trajectoryX += trajectoryVelocityX * driftScale *
                eventInterval / meanEventInterval;
            trajectoryZ += trajectoryVelocityZ * driftScale *
                eventInterval / meanEventInterval;
        }
        const center = [
            trajectoryX + driftSign * driftScale *
                (congestus ? 0.068 : 0.042) * t * t,
            mix(baseY + (congestus ? 0.070 : mediocris ? 0.066 : 0.058),
                congestus ? config.topY - 0.050 : config.topY,
                Math.pow(t, 1.03)),
            trajectoryZ - driftScale * (congestus ? 0.034 : 0.017) * t * t,
        ];
        // The first source-connected head must meet, but not punch through,
        // the central lifting-condensation surface.  Upper heads keep their
        // round aspect; only the still-forming lower pulse is truncated by the
        // common condensation base represented by the root population.
        if (t < 0.26) {
            verticalRadius = Math.min(
                verticalRadius,
                Math.max(horizontalRadius * 0.52, center[1] - baseY - 0.006),
            );
        }
        addEllipsoid(shapes, center, [
            horizontalRadius * mix(0.94, 1.08, random()),
            verticalRadius,
            horizontalRadius * mix(0.88, 1.05, random()),
        ], {
            density: mix(0.96, 1.04, random()),
            detail: config.detailBase,
            role: congestus
                ? t > 0.62 ? "crown-main-thermal" : "thermal-mass"
                : "thermal",
        });
        mainCenters.push(center);
        mainRadii.push(horizontalRadius);
        pulseWidths.push(horizontalRadius);
        mergedBodyLobeCount += 1;

        if (level > 0) {
            const previous = mainCenters[level - 1];
            const bridgeRadius = Math.min(mainRadii[level - 1], horizontalRadius) *
                (congestus ? 0.40 : 0.56);
            const verticalGap = Math.abs(center[1] - previous[1]);
            addEllipsoid(shapes, [
                mix(previous[0], center[0], 0.50),
                mix(previous[1], center[1], 0.50),
                mix(previous[2], center[2], 0.50),
            ], [bridgeRadius * (congestus ? 0.72 : 0.82),
                Math.max(
                    bridgeRadius * (congestus ? 1 : 1.08),
                    verticalGap * (congestus ? 0.54 : 0.62),
                ),
                bridgeRadius * (congestus ? 0.78 : 0.90)], {
                density: 0.97,
                detail: config.detailBase,
                role: congestus ? "thermal-junction" : "thermal",
            });
            mergedBodyLobeCount += 1;
        }

        if (level === 0) continue;
        const crown = t > 0.72;
        const daughterCount = congestus
            ? (crown ? 3 : t > 0.38 ? 3 : 2)
            : mediocris ? (crown ? 4 : 2) : (crown ? 3 : 1);
        const shellPhase = random() * Math.PI * 2;
        for (let daughter = 0; daughter < daughterCount; daughter += 1) {
            const azimuth = shellPhase + daughter * 2.399963229728653 +
                (random() - 0.5) * (congestus ? 0.58 : mediocris ? 1.35 : 1.05);
            const dominantPulse = congestus && daughter === 0 &&
                (crown || level % 3 === 1);
            const daughterRadius = Math.max(
                congestus ? 0.031 : mediocris ? 0.027 : 0.024,
                horizontalRadius * mix(congestus ? 0.36 : 0.34,
                    congestus ? 0.56 : 0.50, random()),
            ) * (dominantPulse ? mix(1.08, 1.24, random()) : 1);
            // Couple displacement to radius so every visible daughter both
            // protrudes as a hard cusp and overlaps its parent substantially.
            const offset = horizontalRadius * mix(0.58, 0.69, random()) +
                daughterRadius * mix(0.16, 0.28, random());
            const daughterCenter = [
                center[0] + Math.cos(azimuth) * offset,
                center[1] + daughterRadius * (dominantPulse
                    ? mix(crown ? 0.72 : 0.44, crown ? 1.28 : 0.92, random())
                    : mix(crown ? -0.12 : -0.34,
                        crown ? 0.76 : 0.62, random())),
                center[2] + Math.sin(azimuth) * offset * mix(0.78, 1.02, random()),
            ];
            if (!congestus) {
                daughterCenter[1] = Math.min(
                    daughterCenter[1],
                    config.topY - daughterRadius * 0.50,
                );
            }
            addEllipsoid(shapes, daughterCenter, [
                daughterRadius * mix(0.90, 1.12, random()),
                daughterRadius * mix(dominantPulse ? 1.00 : 0.90,
                    dominantPulse ? 1.22 : 1.10, random()),
                daughterRadius * mix(0.88, 1.10, random()),
            ], {
                density: mix(0.91, 0.99, random()),
                detail: config.detailBase,
                rotation: azimuth,
                role: "thermal-shell-pulse",
            });
            const shellBridgeRadius = Math.max(0.019, daughterRadius * 0.47);
            addEllipsoid(shapes, [
                mix(center[0], daughterCenter[0], 0.53),
                mix(center[1], daughterCenter[1], 0.53),
                mix(center[2], daughterCenter[2], 0.53),
            ], [shellBridgeRadius * 0.92, shellBridgeRadius * 1.14,
                shellBridgeRadius], {
                density: 0.97,
                detail: config.detailBase,
                rotation: azimuth,
                role: "thermal-shell-bridge",
            });
            mergedBodyLobeCount += 1;
            nestedPulseCount += 1;
            if (crown) crownLobeCount += 1;

            const addCusp = congestus
                ? (daughter + level) % 2 === 0
                : mediocris ? crown && daughter % 2 === 0
                    : crown && daughter === 0;
            if (!addCusp) continue;
            const cuspRadius = daughterRadius * mix(0.48, 0.64, random());
            const cuspAngle = azimuth + mix(0.42, 0.92, random());
            addEllipsoid(shapes, [
                daughterCenter[0] + Math.cos(cuspAngle) * daughterRadius * 0.56,
                daughterCenter[1] + daughterRadius * mix(0.40, 0.64, random()),
                daughterCenter[2] + Math.sin(cuspAngle) * daughterRadius * 0.50,
            ], [cuspRadius * 1.04, cuspRadius, cuspRadius * 0.96], {
                density: 0.91,
                detail: config.detailBase,
                rotation: cuspAngle,
                role: "thermal-cusp",
            });
            const cuspCenter = shapes.at(-1).center;
            const cuspBridgeRadius = Math.max(0.018, cuspRadius * 0.58);
            addEllipsoid(shapes, [
                mix(daughterCenter[0], cuspCenter[0], 0.54),
                mix(daughterCenter[1], cuspCenter[1], 0.54),
                mix(daughterCenter[2], cuspCenter[2], 0.54),
            ], [cuspBridgeRadius, cuspBridgeRadius, cuspBridgeRadius], {
                density: 0.95,
                detail: config.detailBase,
                role: "thermal-cusp-bridge",
            });
            mergedBodyLobeCount += 1;
            cuspCount += 1;
            if (crown) crownLobeCount += 1;
        }
    }

    let crownBranchCount = 0;
    if (congestus) {
        // Split the upper parcel trajectory into several unequal, connected
        // toroidal heads. A single enlarged terminal ellipsoid—however noisy—
        // reads as one rounded cap; real Congestus crowns expose simultaneous
        // buoyant events, subordinate buds, necks, and dry clefts.
        crownBranchCount = morphology === "multicell" ? 5
            : morphology === "turreted" ? 3 : 4;
        const crownRootIndex = Math.max(1, Math.floor((levels - 1) * 0.66));
        const crownRoot = mainCenters[crownRootIndex];
        const branchPhase = random() * Math.PI * 2;
        const branchAngleMotif = crownBranchCount === 3
            ? [0, 1.36, 3.92]
            : crownBranchCount === 4
                ? [0, 0.94, 2.73, 4.66]
                : [0, 0.82, 2.18, 3.06, 5.12];
        const branchHeightMotif = crownBranchCount === 3
            ? [0.045, -0.020, 0.016]
            : crownBranchCount === 4
                ? [0.050, -0.018, 0.022, -0.042]
                : [0.045, -0.010, 0.026, -0.048, 0.008];
        const crownTerminals = [];
        for (let branch = 0; branch < crownBranchCount; branch += 1) {
            const angle = branchPhase + branchAngleMotif[branch] +
                mix(-0.20, 0.20, random());
            const radial = config.radius * mix(
                morphology === "turreted" ? 0.65 : 0.78,
                morphology === "multicell" ? 1.80 :
                    morphology === "turreted" ? 1.50 : 1.65,
                random(),
            );
            const branchTop = Math.min(
                0.90,
                config.topY + branchHeightMotif[branch] +
                    mix(-0.010, 0.010, random()),
            );
            let previous = crownRoot;
            let previousRadius = Math.max(0.034,
                mainRadii[crownRootIndex] * 0.42);
            const branchSteps = branch === 0 ? 4 : 3;
            for (let step = 1; step <= branchSteps; step += 1) {
                const u = step / branchSteps;
                const lateral = radial * Math.pow(u, 1.18);
                const radius = config.radius * mix(
                    morphology === "turreted" ? 0.42 : 0.46,
                    branch === 0 ? 0.78 : 0.66,
                    Math.pow(u, 0.72),
                ) * mix(0.88, 1.12, random());
                const center = [
                    crownRoot[0] + Math.cos(angle) * lateral +
                        Math.cos(angle + 1.4) * radius * 0.12 * Math.sin(u * Math.PI),
                    mix(crownRoot[1], branchTop, u),
                    crownRoot[2] + Math.sin(angle) * lateral *
                        mix(0.80, 1.08, random()),
                ];
                const neckRadius = Math.max(0.021,
                    Math.min(previousRadius, radius) * 0.48);
                addEllipsoid(shapes, [
                    mix(previous[0], center[0], 0.52),
                    mix(previous[1], center[1], 0.52),
                    mix(previous[2], center[2], 0.52),
                ], [neckRadius * 0.86,
                    Math.max(neckRadius, Math.abs(center[1] - previous[1]) * 0.56),
                    neckRadius * 0.92], {
                    density: 0.97,
                    detail: config.detailBase,
                    role: "crown-branch-neck",
                });
                addEllipsoid(shapes, center, [
                    radius * mix(0.92, 1.10, random()),
                    radius * mix(0.94, 1.18, random()),
                    radius * mix(0.86, 1.08, random()),
                ], {
                    density: mix(0.94, 1, random()),
                    detail: config.detailBase,
                    rotation: angle,
                    role: "crown-branch-thermal",
                });
                mergedBodyLobeCount += 2;
                nestedPulseCount += 1;
                crownLobeCount += 1;
                previous = center;
                previousRadius = radius;
                if (step !== branchSteps) continue;
                const terminalBudCount = branch === 0 ? 3 : 2;
                for (let bud = 0; bud < terminalBudCount; bud += 1) {
                    const budAngle = angle + (bud - 0.7) * 1.38 +
                        mix(-0.18, 0.18, random());
                    const budRadius = radius * mix(0.34, 0.52, random());
                    const budCenter = [
                        center[0] + Math.cos(budAngle) * radius * mix(0.58, 0.82, random()),
                        center[1] + budRadius * mix(0.25, 0.78, random()),
                        center[2] + Math.sin(budAngle) * radius * mix(0.48, 0.76, random()),
                    ];
                    addEllipsoid(shapes, budCenter, [
                        budRadius * 1.06,
                        budRadius * mix(0.96, 1.18, random()),
                        budRadius * 0.94,
                    ], {
                        density: 0.92,
                        detail: config.detailBase,
                        rotation: budAngle,
                        role: "crown-branch-bud",
                    });
                    const budNeckRadius = Math.max(0.017, budRadius * 0.52);
                    addEllipsoid(shapes, [
                        mix(center[0], budCenter[0], 0.55),
                        mix(center[1], budCenter[1], 0.55),
                        mix(center[2], budCenter[2], 0.55),
                    ], [budNeckRadius, budNeckRadius * 1.08, budNeckRadius], {
                        density: 0.95,
                        detail: config.detailBase,
                        role: "crown-branch-bud-neck",
                    });
                    mergedBodyLobeCount += 1;
                    nestedPulseCount += 1;
                    cuspCount += 1;
                    crownLobeCount += 1;
                }
            }
            crownTerminals.push({ center: previous, radius: previousRadius });
        }
        for (let branch = 0; branch + 1 < crownTerminals.length; branch += 1) {
            const left = crownTerminals[branch];
            const right = crownTerminals[branch + 1];
            const separation = Math.hypot(
                right.center[0] - left.center[0],
                right.center[2] - left.center[2],
            );
            const cutRadius = clamp(separation * 0.18, 0.022, 0.042);
            cavities.push({
                center: [
                    mix(left.center[0], right.center[0], 0.5),
                    Math.min(left.center[1], right.center[1]) +
                        Math.min(left.radius, right.radius) * 0.42,
                    mix(left.center[2], right.center[2], 0.5),
                ],
                radii: [cutRadius * 1.10, cutRadius * 1.46, cutRadius * 1.10],
                rotation: Math.atan2(
                    right.center[2] - left.center[2],
                    right.center[0] - left.center[0],
                ),
                strength: mix(0.82, 0.95, random()),
                role: "crown-interthermal-cleft",
            });
        }

        // Opposed, alternating flank cuts at event junctions reveal the neck
        // hierarchy without severing the protected central parcel path.
        for (let level = 1; level < mainCenters.length; level += 1) {
            const previous = mainCenters[level - 1];
            const current = mainCenters[level];
            const tangentX = current[0] - previous[0];
            const tangentZ = current[2] - previous[2];
            const tangentLength = Math.max(0.012, Math.hypot(tangentX, tangentZ));
            const normalX = -tangentZ / tangentLength;
            const normalZ = tangentX / tangentLength;
            const fallbackAngle = level * 2.399963229728653;
            const outwardX = tangentLength > 0.018 ? normalX : Math.cos(fallbackAngle);
            const outwardZ = tangentLength > 0.018 ? normalZ : Math.sin(fallbackAngle);
            const side = level % 2 === 0 ? -1 : 1;
            const neckRadius = Math.min(mainRadii[level - 1], mainRadii[level]);
            const cutRadius = Math.max(0.018, neckRadius * mix(0.26, 0.38, random()));
            cavities.push({
                center: [
                    mix(previous[0], current[0], 0.52) +
                        outwardX * side * neckRadius * 0.78,
                    mix(previous[1], current[1], 0.52),
                    mix(previous[2], current[2], 0.52) +
                        outwardZ * side * neckRadius * 0.78,
                ],
                radii: [cutRadius * 1.16, cutRadius * 0.90, cutRadius],
                rotation: Math.atan2(outwardZ, outwardX),
                strength: mix(0.66, 0.84, random()),
                role: "thermal-neck-cleft",
            });
        }
    }

    // Unequal feeder thermals merge below the dominant trajectory. They add
    // asymmetry and depth without producing several equal detached towers.
    const feederCount = congestus ? (morphology === "multicell" ? 3 : 2) : mediocris ? 2 : 1;
    for (let feeder = 0; feeder < feederCount; feeder += 1) {
        const root = rootCenters[(feeder + 1) % rootCenters.length];
        const side = feeder % 2 === 0 ? -1 : 1;
        const feederTopT = congestus ? mix(0.46, 0.68, random()) : mediocris ? 0.48 : 0.32;
        const steps = congestus ? 4 : 3;
        for (let step = 0; step < steps; step += 1) {
            const t = (step + 1) / steps;
            const mainIndex = Math.min(levels - 1, Math.round(feederTopT * t * (levels - 1)));
            const main = mainCenters[mainIndex];
            const center = [
                mix(root[0], main[0] + side * config.radius * 0.32, t),
                mix(baseY + 0.070, main[1], t),
                mix(root[2], main[2] - side * config.radius * 0.16, t),
            ];
            const radius = config.radius * mix(congestus ? 0.76 : 0.66,
                congestus ? 0.56 : 0.48, t);
            addEllipsoid(shapes, center, [radius,
                radius * mix(0.94, 1.10, random()), radius * 0.92], {
                density: 0.94,
                detail: config.detailBase,
                rotation: side * 0.35,
                role: "feeder-thermal",
            });
            mergedBodyLobeCount += 1;
        }
    }

    // Fair-weather Cu is still a population of successive thermals. Humilis
    // carries one low, aging shoulder beside its restrained active dome;
    // Mediocris carries two unequal remnants around a newer central pulse.
    // These connected lifecycle cues prevent the single canonical atlas from
    // reading as a cloned smooth oval when a field contains many owners.
    const fairWeatherShoulders = mediocris
        ? [
            [2, -0.082, 0.056, 0.48, 0.70, 0.67],
            [4, 0.074, -0.066, 0.39, 0.64, 0.58],
        ]
        : [
            [1, -0.070, 0.044, 0.46, 0.58, 0.64],
        ];
    for (const [anchorIndex, dx, dz, radiusScale, verticalScale,
        densityScale] of fairWeatherShoulders) {
        const anchor = mainCenters[Math.min(anchorIndex, mainCenters.length - 1)];
        const radius = config.radius * radiusScale;
        const shoulder = [
            anchor[0] + dx,
            anchor[1] - radius * 0.20,
            anchor[2] + dz,
        ];
        const bridgeRadius = Math.max(0.020, radius * 0.46);
        addEllipsoid(shapes, [
            mix(anchor[0], shoulder[0], 0.52),
            mix(anchor[1], shoulder[1], 0.52),
            mix(anchor[2], shoulder[2], 0.52),
        ], [
            bridgeRadius + Math.abs(dx) * 0.22,
            bridgeRadius * 0.82,
            bridgeRadius + Math.abs(dz) * 0.22,
        ], {
            density: 0.90,
            detail: config.detailBase,
            rotation: Math.atan2(dz, dx),
            role: "fair-weather-shoulder-neck",
        });
        addEllipsoid(shapes, shoulder, [
            radius * 1.14,
            radius * verticalScale,
            radius,
        ], {
            density: densityScale,
            detail: mix(config.detailBase, 0.30, 0.58),
            rotation: Math.atan2(dz, dx),
            role: "fair-weather-detraining-shoulder",
        });
        cavities.push({
            center: [
                shoulder[0] + dx * 0.20,
                shoulder[1] - radius * 0.16,
                shoulder[2] + dz * 0.20,
            ],
            radii: [radius * 0.38, radius * 0.52, radius * 0.42],
            rotation: Math.atan2(dz, dx),
            strength: 0.76,
            role: "fair-weather-entrainment-wake",
        });
        mergedBodyLobeCount += 2;
        nestedPulseCount += 1;
        cuspCount += 1;
    }

    const cavityAnchors = shapes.filter((shape) =>
        (shape.role === "thermal-shell-pulse" || shape.role === "thermal-cusp") &&
        shape.center[1] > baseY + 0.10 && shape.center[1] < config.topY - 0.025);
    const evaporatingFlankCount = congestus ? 12 : mediocris ? 5 : 0;
    for (let index = 0; index < evaporatingFlankCount; index += 1) {
        const anchor = cavityAnchors[(index * 5 + 2) % Math.max(1, cavityAnchors.length)];
        if (!anchor) break;
        let outwardX = anchor.center[0] - 0.50;
        let outwardZ = anchor.center[2] - 0.49;
        const length = Math.max(0.02, Math.hypot(outwardX, outwardZ));
        outwardX /= length;
        outwardZ /= length;
        const anchorRadius = Math.max(anchor.radii[0], anchor.radii[2]);
        const width = Math.max(0.024, anchorRadius * mix(0.38, 0.52, random()));
        addEllipsoid(shapes, [
            anchor.center[0] + outwardX * anchorRadius * mix(0.48, 0.64, random()),
            anchor.center[1] - width * mix(0.06, 0.32, random()),
            anchor.center[2] + outwardZ * anchorRadius * mix(0.48, 0.64, random()),
        ], [width * 0.92, width * 0.58, width * 1.12], {
            density: mix(0.48, 0.62, random()),
            detail: mix(0.24, 0.40, random()),
            rotation: Math.atan2(outwardZ, outwardX),
            role: "evaporating-flank",
        });
    }
    // Resolved negative clefts represent toroidal-vortex entrainment below and
    // around growing heads. They are attached to exterior shell pulses and
    // cannot sever the protected source/updraft core in evaluateModel.
    const flankCavityCount = congestus ? 14 : mediocris ? 6 : 2;
    for (let index = 0; index < flankCavityCount; index += 1) {
        const anchor = cavityAnchors[index % Math.max(1, cavityAnchors.length)];
        if (!anchor) break;
        let outwardX = anchor.center[0] - 0.50;
        let outwardZ = anchor.center[2] - 0.49;
        const length = Math.max(0.02, Math.hypot(outwardX, outwardZ));
        outwardX /= length;
        outwardZ /= length;
        const radius = mix(0.018, congestus ? 0.038 : 0.030, random());
        cavities.push({
            center: [anchor.center[0] + outwardX * radius * mix(0.32, 0.74, random()),
                anchor.center[1] - radius * mix(0.08, 0.54, random()),
                anchor.center[2] + outwardZ * radius * mix(0.32, 0.74, random())],
            radii: [radius * mix(0.82, 1.18, random()),
                radius * mix(0.86, 1.38, random()),
                radius * mix(0.82, 1.16, random())],
            rotation: random() * Math.PI,
            strength: mix(0.48, 0.78, random()),
            role: "flank-entrainment-cavity",
        });
    }

    const meanWidth = pulseWidths.reduce((sum, value) => sum + value, 0) /
        Math.max(1, pulseWidths.length);
    const widthVariation = Math.sqrt(pulseWidths.reduce((sum, value) =>
        sum + (value - meanWidth) ** 2, 0) / Math.max(1, pulseWidths.length)) /
        Math.max(1e-6, meanWidth);
    return {
        shapes,
        cavities,
        baseY,
        ownerPoints: rootCenters.map((center) => [center[0], center[2]]),
        baseLobeCount: rootDefinitions.length,
        crownLobeCount,
        mergedBodyLobeCount,
        evaporatingFlankCount,
        secondaryLobeCount: nestedPulseCount + cuspCount,
        hierarchyLevelCount: congestus ? 4 : mediocris ? 3 : 2,
        branchSpread: rootCenters.reduce((maximum, center) => Math.max(maximum,
            Math.hypot(center[0] - 0.5, center[2] - 0.49) * 2), 0),
        cumulusNestedPulseCount: nestedPulseCount,
        cumulusCuspCount: cuspCount,
        cumulusCrownBranchCount: crownBranchCount,
        cumulusThermalChainCount: 1 + feederCount,
        cumulusDissipatingShoulderCount: fairWeatherShoulders.length,
        cumulusCrownTopHeightVariation: mediocris ? 0.08 : 0.035,
        cumulusDominantTrajectoryDrift: Math.hypot(
            mainCenters.at(-1)[0] - mainCenters[0][0],
            mainCenters.at(-1)[2] - mainCenters[0][2],
        ),
        cumulusTowerWidthVariation: widthVariation,
        cumulusThermalEventSpacingVariation: eventIntervalVariation,
        cumulusMeanThermalVerticalAspect: mainRadii.reduce((sum, radius, index) => {
            const shape = shapes.find((candidate) =>
                candidate.center === mainCenters[index]);
            return sum + (shape
                ? shape.radii[1] / Math.max(shape.radii[0], shape.radii[2])
                : 0);
        }, 0) / Math.max(1, mainRadii.length),
    };
};

const ellipsoidField = (x, y, z, shape) => {
    const dx = x - shape.center[0];
    const dz = z - shape.center[2];
    const cosine = Math.cos(shape.rotation);
    const sine = Math.sin(shape.rotation);
    const localX = dx * cosine + dz * sine;
    const localZ = -dx * sine + dz * cosine;
    const localY = y - shape.center[1];
    const distance = Math.sqrt(
        (localX / shape.radii[0]) ** 2 +
        (localY / shape.radii[1]) ** 2 +
        (localZ / shape.radii[2]) ** 2,
    );
    return (1 - distance) * Math.min(...shape.radii);
};

const evaluateModel = (model, config, x, y, z, seed) => {
    const congestusMorphology = config.species === "congestus";
    // The explicit Congestus thermal tree now resolves the visible curvature.
    // A three-percent domain warp displaced a full 1.4 source voxels before
    // the later exterior displacement and turned convex heads into mush.
    const convectiveWarp = congestusMorphology
        ? 0.006
        : config.storm ? 0.040 : 0.030;
    const [warpedX, warpedY, warpedZ] = warpPoint3(
        x,
        y,
        z,
        seed + 113,
        convectiveWarp,
        [1, config.storm ? 0.52 : 0.68, 1],
    );
    let support = -1;
    let protectedCore = -1;
    const baseY = model.baseY ?? 0.145;
    let attributeWeight = 0;
    let detail = config.detailBase;
    let phase = 0;
    for (const shape of model.shapes) {
        const field = ellipsoidField(warpedX, warpedY, warpedZ, shape);
        // Density is not a distance scale: multiplying negative SDF values by
        // a weak wisp density expands its nominal support. Instead, low-density
        // condensate receives a small physical inset and therefore remains a
        // narrow fringe around its authored centerline.
        const weightedField = field - (1 - shape.density) * 0.020;
        support = Math.max(support, weightedField);
        // Only the connected, lower liquid updraft of deep convection receives
        // a hard core floor. A universal floor on every thermal inflated fair-
        // weather cumulus into smooth ovals and prevented scalloped dry-air
        // erosion. Glaciated crowns and dissipating towers must also be free to
        // separate into fibres and fallstreaks.
        const retainsDeepLiquidCore = !config.dissipating &&
            (config.species === "congestus" || config.genus === "cumulonimbus") &&
            shape.phase < 0.42;
        // The lifting-level source stays connected, but its lowest outer
        // shell is intentionally *not* protected. A constant root floor made
        // all five source thermals union into a ruler-straight rectangular
        // slab and overrode the authored entrainment bites. The inset shrinks
        // upward as the source plume consolidates, matching the transition
        // from a ragged condensation boundary to a protected cloudy updraft.
        const rootCoreInset = config.species === "congestus"
            ? mix(
                0.048,
                0.020,
                smoothstep(baseY + 0.025, baseY + 0.135, y),
            )
            : 0.020;
        const congestusAuthoredCoreInset = config.species === "congestus"
            ? typeof shape.protectedCoreInset === "number"
                ? shape.protectedCoreInset
                : null
            : null;
        const coreInset = retainsDeepLiquidCore && shape.role === "root"
            ? rootCoreInset
            : retainsDeepLiquidCore && config.species === "congestus"
                ? congestusAuthoredCoreInset
                : retainsDeepLiquidCore && shape.role === "thermal-mass"
                    ? 0.020
                    : retainsDeepLiquidCore &&
                        (shape.role === "feeder-thermal" ||
                            shape.role === "thermal-junction")
                        ? 0.016
                        : null;
        if (coreInset !== null) {
            // Protection begins *inside* the primitive. Keeping zero at every
            // primitive boundary previously blocked entrainment and left a
            // soft ellipsoidal halo around the whole cloud.
            protectedCore = Math.max(protectedCore, field - coreInset);
        }
        const weight = smoothstep(-0.018, 0.040, field) * shape.density;
        attributeWeight += weight;
        detail += shape.detail * weight;
        phase += shape.phase * weight;
    }
    detail /= Math.max(1, attributeWeight);
    phase /= Math.max(1, attributeWeight);

    let cavity = 0;
    let baseEntrainmentCavity = 0;
    let crownEntrainmentCavity = 0;
    for (const shape of model.cavities) {
        const cavityField = smoothstep(
            -0.020,
            0.026,
            ellipsoidField(warpedX, warpedY, warpedZ, shape),
        ) * shape.strength;
        if (shape.role === "base-entrainment-bite") {
            baseEntrainmentCavity = Math.max(baseEntrainmentCavity, cavityField);
        } else if (shape.role === "crown-interthermal-cleft") {
            crownEntrainmentCavity = Math.max(
                crownEntrainmentCavity,
                cavityField,
            );
        } else {
            cavity = Math.max(cavity, cavityField);
        }
    }

    const broadNoise = fbm3(x * 4.1, y * 4.8, z * 4.1, seed + 151);
    const cellularNoise = fbm3(x * 10.7 + 4.2, y * 11.9 - 2.7, z * 10.1 + 1.8, seed + 347);
    const billowRidges = ridgedFbm3(x * 7.6 - 2.4, y * 8.8 + 1.9, z * 7.2 + 5.7, seed + 401);
    const scallopNoise = ridgedFbm3(x * 16.4 + 7.1, y * 17.8 - 4.3, z * 15.6 + 2.8, seed + 433);
    const edgeFactor = 1 - smoothstep(0.005, 0.055, support);
    const erosion = congestusMorphology
        ? (
            (broadNoise - 0.48) * mix(0.002, 0.006, edgeFactor) +
            (cellularNoise - 0.51) * mix(0.001, 0.003, edgeFactor) +
            (billowRidges - 0.54) * mix(0.0005, 0.0015, edgeFactor) +
            (scallopNoise - 0.58) * mix(0.0002, 0.0007, edgeFactor)
        )
        : (
            (broadNoise - 0.48) * mix(0.012, 0.052, edgeFactor) +
            (cellularNoise - 0.51) * mix(0.006, 0.032, edgeFactor) +
            (billowRidges - 0.54) * mix(0.004, config.storm ? 0.024 : 0.021, edgeFactor) +
            (scallopNoise - 0.58) * mix(0.002, config.storm ? 0.014 : 0.012, edgeFactor)
        );
    const lowerBody = 1 - smoothstep(baseY + 0.015, baseY + 0.17, y);
    const baseFractal = congestusMorphology
        ? (
            (fbm3(x * 6.6 + 5.4, 0.37, z * 6.2 - 3.8, seed + 467) - 0.50) * 0.010 +
            (ridgedFbm3(x * 13.8 - 2.7, 0.81, z * 14.6 + 4.2, seed + 491) - 0.58) * 0.003 +
            (fbm3(
                (x + z * 0.37) * 4.7 - 1.3,
                0.23,
                (z - x * 0.22) * 5.1 + 2.9,
                seed + 509,
            ) - 0.50) * 0.004
        ) * lowerBody
        : (
            (fbm3(x * 6.6 + 5.4, 0.37, z * 6.2 - 3.8, seed + 467) - 0.50) * 0.030 +
            (ridgedFbm3(x * 13.8 - 2.7, 0.81, z * 14.6 + 4.2, seed + 491) - 0.58) * 0.014
        ) * lowerBody;
    const cavityCut = congestusMorphology
        ? Math.max(
            cavity * mix(0.058, 0.118, edgeFactor),
            baseEntrainmentCavity * mix(0.066, 0.112, edgeFactor) * lowerBody,
            // Dry-air valleys between adjacent buoyant heads must remain
            // resolved after the 2x box reconstruction.  They are deeper than
            // ordinary shell pitting, but remain local crown cavities rather
            // than cuts through the communicating lineage below.
            crownEntrainmentCavity * (config.morphologyVariant === "multicell"
                ? mix(0.140, 0.240, edgeFactor)
                : mix(0.090, 0.160, edgeFactor)),
        )
        : cavity * mix(0.034, config.dissipating ? 0.092 : 0.074, edgeFactor);
    const erodedSupport = Math.max(support + erosion + baseFractal - cavityCut, protectedCore);
    let density = congestusMorphology
        ? smoothstep(-0.004, 0.018, erodedSupport) * config.densityScale
        : smoothstep(-0.008, 0.034, erodedSupport) * config.densityScale;

    // Compress the optically important undiluted interior toward unity while
    // retaining a broad distribution in mixed boundary air. LES distinguishes
    // protected cores from heavily diluted shells; global noise modulation of
    // every voxel made the previous cloud uniformly translucent.
    const coreFactor = smoothstep(0.014, 0.060, support);
    const compressedCore = 1 - Math.pow(
        1 - clamp(density),
        config.storm ? 1.85 : congestusMorphology ? 1.78 : 1.65,
    );
    density = mix(density, compressedCore, coreFactor);

    // Cloud bases have higher liquid-water content but not a painted planar
    // edge. Broad modulation fades out in protected core volumes and the
    // independent x/z fractal field breaks the underside at several scales.
    density *= congestusMorphology
        ? mix(mix(0.86, 1.02, broadNoise), 1, coreFactor)
        : mix(mix(0.70, 1.06, broadNoise), 1, coreFactor);
    if (config.species === "humilis") {
        // Quantized, heavily diluted base-edge samples can survive as isolated
        // one-voxel islands even when their parent thermal has evaporated.
        // Remove only that unresolved mixing tail near the LCL; resolved
        // condensate and the scalloped upper silhouette are unchanged.
        const sourceLayer = 1 - smoothstep(baseY + 0.055, baseY + 0.125, y);
        const resolvedSourceDensity = density * smoothstep(0.10, 0.22, density);
        density = mix(density, resolvedSourceDensity, sourceLayer);
    }
    if (config.dissipating) {
        const decayNoise = fbm3(x * 6.4 + 7, y * 7.1 - 3, z * 5.9 + 11, seed + 719);
        density *= smoothstep(0.19, 0.76, decayNoise + (1 - y) * 0.11);
        detail = mix(detail, 0.94, smoothstep(0.42, 0.82, y));
        phase = Math.max(phase, smoothstep(0.40, 0.76, y) * 0.86);
    }

    return {
        density: clamp(density),
        detail: clamp(detail),
        phase: clamp(phase),
        precipitation: 0,
    };
};

const addCapsule = (primitives, start, end, radius, options = {}) => {
    primitives.push({
        kind: "capsule",
        start,
        end,
        radius,
        verticalScale: options.verticalScale ?? 1,
        density: options.density ?? 1,
        detail: options.detail ?? 0.8,
        phase: options.phase ?? 1,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "streamer",
    });
};

const uniformCubicBasis = (amount) => {
    const inverse = 1 - amount;
    return [
        inverse ** 3 / 6,
        (3 * amount ** 3 - 6 * amount ** 2 + 4) / 6,
        (-3 * amount ** 3 + 3 * amount ** 2 + 3 * amount + 1) / 6,
        amount ** 3 / 6,
    ];
};

const sampleUniformCubicSpline = (points, radii, subdivisions) => {
    if (points.length < 2 || radii.length !== points.length) {
        throw new Error("A swept C2 support requires matching point/radius knots");
    }
    // Repeating end controls clamps the open uniform cubic B-spline to its
    // source and sink. Interior spans remain C2-continuous; sampled line
    // segments are only the conservative distance-query acceleration form.
    const pointControls = [
        points[0], points[0], points[0],
        ...points.slice(1, -1),
        points.at(-1), points.at(-1), points.at(-1),
    ];
    const radiusControls = [
        radii[0], radii[0], radii[0],
        ...radii.slice(1, -1),
        radii.at(-1), radii.at(-1), radii.at(-1),
    ];
    const samples = [];
    for (let span = 0; span + 3 < pointControls.length; span += 1) {
        for (let step = 0; step < subdivisions; step += 1) {
            if (span > 0 && step === 0) continue;
            const amount = step / subdivisions;
            const basis = uniformCubicBasis(amount);
            const point = [0, 0, 0];
            let radius = 0;
            for (let control = 0; control < 4; control += 1) {
                for (let axis = 0; axis < 3; axis += 1) {
                    point[axis] += pointControls[span + control][axis] *
                        basis[control];
                }
                radius += radiusControls[span + control] * basis[control];
            }
            samples.push({ point, radius });
        }
    }
    samples.push({ point: points.at(-1), radius: radii.at(-1) });
    return samples;
};

/**
 * A radius-varying C2 centerline support.  This is deliberately a distinct
 * primitive rather than a necklace of terminal ellipsoids: every daughter
 * sweep starts on an occupied parent source and carries its own lifecycle
 * taper.  At 48^3 the sampled acceleration segments remain overlapped, so
 * generation cannot quantize a smooth lineage into detached oval stamps.
 */
const addSweptC2Support = (
    primitives,
    points,
    radii,
    options = {},
) => {
    const subdivisions = options.subdivisions ?? 4;
    primitives.push({
        kind: "swept-c2",
        points,
        radii,
        samples: sampleUniformCubicSpline(points, radii, subdivisions),
        verticalScale: options.verticalScale ?? 1,
        density: options.density ?? 1,
        detail: options.detail ?? 0.8,
        phase: options.phase ?? 1,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "source-connected-sweep",
        hierarchyLevel: options.hierarchyLevel ?? 0,
        lifecycleStage: options.lifecycleStage ?? "mature",
        sourceConnected: options.sourceConnected ?? true,
        densityEndTaper: options.densityEndTaper ?? 1,
        densityTaperPower: options.densityTaperPower ?? 1,
        supportKind: "uniform-cubic-bspline-radius-sweep",
    });
};

const quinticUnitSweep = (value) => {
    const amount = clamp(value);
    return amount * amount * amount *
        (amount * (amount * 6 - 15) + 10);
};

// Stable log-sum-exp intersection. Unlike min(), the blend has continuous
// first and second derivatives where a plan boundary meets a base/crown
// surface. The radius is kept substantially below one source voxel so it
// rounds the analytic seam without inflating the canonical condensate mass.
const smoothMinimumC2 = (left, right, radius) => {
    const smoothing = Math.max(1e-6, radius);
    const minimum = Math.min(left, right);
    return minimum - smoothing * Math.log1p(
        Math.exp(-Math.abs(left - right) / smoothing),
    );
};

/**
 * Adds one inversion-bounded circulation cell as a single analytic surface.
 * Angular modes are evaluated on the plan boundary, not stamped as terminal
 * ellipsoids. Their amplitudes span three unequal bands, producing an
 * asymmetric scalloped crown/wall while the lower condensation surface stays
 * nearly planar. Every operation defining the surface is C2 or smoother.
 */
const addCirculationCellSurface = (primitives, cell, options = {}) => {
    primitives.push({
        kind: "circulation-cell-surface",
        center: [cell.centerX, cell.centerY],
        radiusX: cell.radiusX,
        radiusY: cell.radiusY,
        baseHeight: cell.baseHeight,
        topHeight: cell.topHeight,
        inversionHeight: cell.inversionHeight,
        rotation: cell.rotationRadians,
        planModes: cell.planModes,
        crownModes: cell.crownModes,
        undersideAmplitude: cell.undersideAmplitude,
        interiorClearance: cell.interiorClearance,
        wallFraction: cell.wallFraction,
        density: options.density ?? 1,
        detail: options.detail ?? 0.24,
        phase: options.phase ?? 0,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "foundation-sc-circulation-cell-surface",
        hierarchyLevel: cell.hierarchyLevel,
        supportKind: "c2-inversion-bounded-circulation-surface",
    });
};

const circulationCellSurfaceField = (x, y, z, primitive) => {
    const dx = x - primitive.center[0];
    const dz = z - primitive.center[1];
    const cosine = Math.cos(primitive.rotation);
    const sine = Math.sin(primitive.rotation);
    const localX = dx * cosine + dz * sine;
    const localZ = -dx * sine + dz * cosine;
    const unitX = localX / Math.max(1e-6, primitive.radiusX);
    const unitZ = localZ / Math.max(1e-6, primitive.radiusY);
    const radial = Math.hypot(unitX, unitZ);
    const angle = Math.atan2(unitZ, unitX);
    // Boundary harmonics are bounded and aperiodic across cells. Multiplying
    // their crown influence by the radial sweep removes the polar singularity
    // from the visible surface at the cell centre.
    let planScale = 1;
    for (const mode of primitive.planModes) {
        planScale += mode.amplitude * Math.cos(
            mode.order * angle + mode.phase,
        );
    }
    planScale = clamp(planScale, 0.76, 1.24);
    const planCoordinate = radial / planScale;
    const planField = (1 - planCoordinate) *
        Math.min(primitive.radiusX, primitive.radiusY);
    const radialSweep = quinticUnitSweep(planCoordinate);
    const radialInterior = 1 - radialSweep;

    let crownSignal = 0;
    for (const mode of primitive.crownModes) {
        crownSignal += mode.amplitude * Math.cos(
            mode.order * angle + mode.phase,
        );
    }
    // A broad central updraft crown and an off-centre wall ridge coexist in
    // closed cells. The Gaussian band is analytic and carries angular
    // asymmetry only away from the polar centre.
    const wallBand = Math.exp(-((
        (planCoordinate - 0.68) / Math.max(0.08, primitive.wallFraction)
    ) ** 2));
    const thickness = primitive.topHeight - primitive.baseHeight;
    const topologyClearance = clamp(
        primitive.interiorClearance / Math.max(0.006,
            Math.min(primitive.radiusX, primitive.radiusY)),
        0.08,
        0.72,
    );
    const underside = primitive.baseHeight +
        primitive.undersideAmplitude * wallBand *
        Math.cos(angle + primitive.rotation * 0.37);
    const centralCrown = primitive.baseHeight + thickness * (
        primitive.wallFraction +
        (1 - primitive.wallFraction) * Math.pow(
            Math.max(0, radialInterior),
            mix(0.48, 0.72, topologyClearance),
        )
    );
    const scallopedCrown = centralCrown + thickness * crownSignal *
        wallBand * radialSweep;
    const crown = smoothMinimumC2(
        scallopedCrown,
        primitive.inversionHeight,
        Math.max(0.0015, thickness * 0.035),
    );
    const lowerField = y - underside;
    const upperField = crown - y;
    const verticalField = smoothMinimumC2(
        lowerField,
        upperField,
        Math.max(0.0012, thickness * 0.025),
    );
    return smoothMinimumC2(
        planField,
        verticalField,
        Math.max(0.0012, Math.min(
            primitive.radiusX,
            primitive.radiusY,
        ) * 0.035),
    );
};

const sampleCirculationRibbonSpline = (
    points,
    widths,
    halfDepths,
    subdivisions,
) => {
    if (points.length < 2 || widths.length !== points.length ||
        halfDepths.length !== points.length) {
        throw new Error(
            "A C2 circulation ribbon requires matching points, widths, and depths",
        );
    }
    const pointControls = [
        points[0], points[0], points[0],
        ...points.slice(1, -1),
        points.at(-1), points.at(-1), points.at(-1),
    ];
    const widthControls = [
        widths[0], widths[0], widths[0],
        ...widths.slice(1, -1),
        widths.at(-1), widths.at(-1), widths.at(-1),
    ];
    const depthControls = [
        halfDepths[0], halfDepths[0], halfDepths[0],
        ...halfDepths.slice(1, -1),
        halfDepths.at(-1), halfDepths.at(-1), halfDepths.at(-1),
    ];
    const samples = [];
    for (let span = 0; span + 3 < pointControls.length; span += 1) {
        for (let step = 0; step < subdivisions; step += 1) {
            if (span > 0 && step === 0) continue;
            const amount = step / subdivisions;
            const basis = uniformCubicBasis(amount);
            const point = [0, 0, 0];
            let width = 0;
            let halfDepth = 0;
            for (let control = 0; control < 4; control += 1) {
                for (let axis = 0; axis < 3; axis += 1) {
                    point[axis] += pointControls[span + control][axis] *
                        basis[control];
                }
                width += widthControls[span + control] * basis[control];
                halfDepth += depthControls[span + control] * basis[control];
            }
            samples.push({ point, width, halfDepth });
        }
    }
    samples.push({
        point: points.at(-1),
        width: widths.at(-1),
        halfDepth: halfDepths.at(-1),
    });
    return samples;
};

/** A C2 centreline carrying an asymmetric, vertically flattened cloud wall. */
const addCirculationRibbonSurface = (
    destination,
    points,
    widths,
    halfDepths,
    options = {},
) => {
    destination.push({
        kind: "circulation-ribbon-surface",
        points,
        widths,
        halfDepths,
        samples: sampleCirculationRibbonSpline(
            points,
            widths,
            halfDepths,
            options.subdivisions ?? 5,
        ),
        lateralAsymmetry: options.lateralAsymmetry ?? 0,
        undersideFraction: options.undersideFraction ?? 0.72,
        density: options.density ?? 1,
        detail: options.detail ?? 0.24,
        phase: options.phase ?? 0,
        precipitation: options.precipitation ?? 0,
        strength: options.strength ?? 1,
        role: options.role ?? "foundation-sc-circulation-wall-ribbon",
        hierarchyLevel: options.hierarchyLevel ?? 1,
        supportKind: "uniform-cubic-bspline-circulation-ribbon",
    });
};

const circulationRibbonSurfaceField = (x, y, z, primitive) => {
    let field = -Infinity;
    for (let index = 0; index + 1 < primitive.samples.length; index += 1) {
        const source = primitive.samples[index];
        const target = primitive.samples[index + 1];
        const axisX = target.point[0] - source.point[0];
        const axisZ = target.point[2] - source.point[2];
        const denominator = Math.max(1e-8, axisX * axisX + axisZ * axisZ);
        const amount = clamp(
            ((x - source.point[0]) * axisX +
                (z - source.point[2]) * axisZ) / denominator,
        );
        const centerX = mix(source.point[0], target.point[0], amount);
        const centerZ = mix(source.point[2], target.point[2], amount);
        const centerY = mix(source.point[1], target.point[1], amount);
        const length = Math.sqrt(denominator);
        const signedLateral = length <= 1e-6 ? 0 : (
            (x - centerX) * -axisZ + (z - centerZ) * axisX
        ) / length;
        const lateralDistance = Math.hypot(
            x - centerX,
            z - centerZ,
        );
        const width = mix(source.width, target.width, amount) * (
            1 + primitive.lateralAsymmetry *
                Math.tanh(signedLateral * 40)
        );
        const halfDepth = mix(
            source.halfDepth,
            target.halfDepth,
            amount,
        );
        // Euclidean distance to the clamped segment is essential at the open
        // ribbon ends. Using only signed cross-axis distance extends a finite
        // spline into an infinite strip whenever a query lies beyond an end.
        const lateralCoordinate = lateralDistance /
            Math.max(1e-6, width);
        const planField = (1 - lateralCoordinate) * width;
        const lateralSweep = quinticUnitSweep(lateralCoordinate);
        const underside = centerY - halfDepth * primitive.undersideFraction;
        const crown = centerY + halfDepth * (
            0.42 + 0.58 * (1 - lateralSweep)
        );
        const verticalField = smoothMinimumC2(
            y - underside,
            crown - y,
            Math.max(0.001, halfDepth * 0.05),
        );
        const segmentField = smoothMinimumC2(
            planField,
            verticalField,
            Math.max(0.001, width * 0.06),
        );
        field = Math.max(field, segmentField);
    }
    return field;
};

const rotatedIcePlanCoordinates = (x, z, primitive) => {
    const dx = x - primitive.center[0];
    const dz = z - primitive.center[2];
    const cosine = Math.cos(primitive.rotation);
    const sine = Math.sin(primitive.rotation);
    return {
        localX: dx * cosine + dz * sine,
        localZ: -dx * sine + dz * cosine,
    };
};

/**
 * One finite generating envelope for Cirrus spissatus.  The envelope is only
 * a mesoscale prior: it bounds the humidity source, but it does not decide
 * which voxels contain condensate.  That decision is made by the signed
 * excursion of the stochastic IWC field below.
 */
const addSpissatusStochasticField = (primitives, options) => {
    primitives.push({
        kind: "spissatus-stochastic-field",
        center: options.center,
        radii: options.radii,
        rotation: options.rotation ?? 0,
        sourceSites: options.sourceSites ?? [],
        layers: options.layers ?? [],
        shear: options.shear ?? [0, 0],
        fallstreakShear: options.fallstreakShear ?? [0, 0],
        spectrum: options.spectrum ?? {
            broad: [1.35, 0.72, 1.80],
            mesoscale: [3.8, 1.65, 5.4],
            // fbm3/ridgedFbm3 add four octaves internally. Keep the highest
            // source octave below the 96^3 Nyquist limit so 48^3 reduction
            // sees correlated variance rather than checkerboard support.
            fine: [4.8, 1.8, 3.1],
        },
        sigma: options.sigma ?? 1.28,
        // The raw fbm combination is normalized to a measured latent scale
        // before exponentiation. Keeping this explicit prevents an accidental
        // near-uniform IWC slab when octave count or source spectra change.
        supportVarianceScale: options.supportVarianceScale ?? 1,
        supportMeanOffset: options.supportMeanOffset ?? 0,
        supportVarianceReference: options.supportVarianceReference ?? 0.085,
        envelopeWarpScale: options.envelopeWarpScale ?? 1,
        excursionThreshold: options.excursionThreshold ?? 0.88,
        excursionScale: options.excursionScale ?? 0.18,
        envelopeScale: options.envelopeScale ?? 0.23,
        smoothing: options.smoothing ?? 0.009,
        density: options.density ?? 1,
        detail: options.detail ?? 0.84,
        phase: options.phase ?? 1,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "spissatus-finite-lognormal-excursion-field",
        hierarchyLevel: options.hierarchyLevel ?? 3,
        supportKind: "finite-mesoscale-prior-stochastic-iwc-excursion",
    });
};

const spissatusLayerSpectrum = (height, primitive) => {
    const layers = primitive.layers ?? [];
    if (layers.length === 0) {
        return {
            shear: primitive.shear ?? [0, 0],
            anisotropy: [1, 1, 1],
            fallstreakWeight: 0.5,
            coherence: 0.5,
        };
    }
    let weightSum = 0;
    let shearX = 0;
    let shearZ = 0;
    let anisotropyX = 0;
    let anisotropyY = 0;
    let anisotropyZ = 0;
    let fallstreakWeight = 0;
    let coherence = 0;
    for (const layer of layers) {
        const thickness = Math.max(0.04, layer.thickness ?? 0.24);
        const distance = (height - (layer.height ?? 0)) / thickness;
        const weight = Math.exp(-0.5 * distance * distance);
        weightSum += weight;
        shearX += weight * (layer.shear?.[0] ?? 0);
        shearZ += weight * (layer.shear?.[1] ?? 0);
        anisotropyX += weight * (layer.anisotropy?.[0] ?? 1);
        anisotropyY += weight * (layer.anisotropy?.[1] ?? 1);
        anisotropyZ += weight * (layer.anisotropy?.[2] ?? 1);
        fallstreakWeight += weight * (layer.fallstreakWeight ?? 0.5);
        coherence += weight * (layer.coherence ?? 0.5);
    }
    const inverseWeight = 1 / Math.max(1e-8, weightSum);
    return {
        shear: [shearX * inverseWeight, shearZ * inverseWeight],
        anisotropy: [
            anisotropyX * inverseWeight,
            anisotropyY * inverseWeight,
            anisotropyZ * inverseWeight,
        ],
        fallstreakWeight: fallstreakWeight * inverseWeight,
        coherence: coherence * inverseWeight,
    };
};

const evaluateSpissatusStochasticField = (x, y, z, primitive, seed = 0) => {
    const { localX, localZ } = rotatedIcePlanCoordinates(x, z, primitive);
    const radiusX = Math.max(1e-6, primitive.radii[0]);
    const radiusY = Math.max(1e-6, primitive.radii[1]);
    const radiusZ = Math.max(1e-6, primitive.radii[2]);
    const normalizedX = localX / radiusX;
    const normalizedY = (y - primitive.center[1]) / radiusY;
    const normalizedZ = localZ / radiusZ;
    const rawEnvelopeRadius = Math.hypot(
        normalizedX,
        normalizedY,
        normalizedZ,
    );
    // A finite humidity envelope is a prior, not a visible ellipse. Low-pass
    // displacements shear and corrugate it while `Math.min(raw, warped)`
    // preserves conservative finite support at the original owner boundary.
    const envelopeWarpScale = primitive.envelopeWarpScale ?? 1;
    const envelopeWarpX = (fbm3(
        normalizedX * 1.20 + 1.7,
        normalizedY * 0.78 - 4.2,
        normalizedZ * 1.35 + 2.6,
        seed + 3011,
    ) - 0.5) * 0.18 * envelopeWarpScale;
    const envelopeWarpY = (fbm3(
        normalizedX * 0.94 - 3.5,
        normalizedY * 0.84 + 5.1,
        normalizedZ * 1.08 - 6.6,
        seed + 3047,
    ) - 0.5) * 0.10 * envelopeWarpScale;
    const envelopeWarpZ = (fbm3(
        normalizedX * 1.08 + 6.8,
        normalizedY * 0.72 - 1.4,
        normalizedZ * 1.28 + 4.4,
        seed + 3079,
    ) - 0.5) * 0.20 * envelopeWarpScale;
    const warpedEnvelopeRadius = Math.hypot(
        normalizedX + normalizedY * 0.14 + envelopeWarpX,
        normalizedY + envelopeWarpY,
        normalizedZ - normalizedY * 0.10 + envelopeWarpZ,
    );
    // The warped prior owns the visible finite boundary.  A larger smooth
    // guard only prevents that prior from escaping the conservative owner
    // bounds; retaining the raw ellipsoid as a second minimum would imprint a
    // mirrored radial shell and defeat the low-pass shear/corrugation.
    const ownerGuardRadius = rawEnvelopeRadius / 1.22;
    const envelope = Math.min(
        1 - warpedEnvelopeRadius,
        1 - ownerGuardRadius,
    );
    const envelopeScale = primitive.envelopeScale ?? 0.23;
    // Keep all field evaluation bounded around the finite source. This also
    // avoids high-frequency work in clearly dry air outside the envelope.
    if (envelope < -0.18) {
        return {
            field: envelope * envelopeScale,
            normalizedX,
            normalizedY,
            normalizedZ,
            envelope,
            iwc: 0,
            supportIwc: 0,
            fineIwcFactor: 1,
            lognormalGaussian: 0,
            fibrousSignal: 0,
            fallstreakSignal: 0,
        };
    }

    const layer = spissatusLayerSpectrum(normalizedY, primitive);
    const shearX = normalizedX +
        layer.shear[0] * normalizedY +
        (primitive.shear?.[0] ?? 0) * normalizedY * normalizedY;
    const shearZ = normalizedZ +
        layer.shear[1] * normalizedY +
        (primitive.shear?.[1] ?? 0) * normalizedY * normalizedY;
    // Sedimenting crystals are increasingly displaced in the lower half of
    // the generating mass. A translated vertical spectrum produces oblique
    // fallstreaks without introducing a separate screen-space ribbon.
    const settling = 1 - smoothstep(-0.84, 0.46, normalizedY);
    const advectedZ = shearZ + settling * (
        (primitive.fallstreakShear?.[1] ?? 0) +
        0.16 * Math.sin(normalizedY * 2.4 + seed * 0.000013)
    );
    const advectedX = shearX + settling *
        (primitive.fallstreakShear?.[0] ?? 0) * 0.58;
    const spectrum = primitive.spectrum ?? {};
    const broadFrequency = spectrum.broad ?? [1.35, 0.72, 1.80];
    const mesoscaleFrequency = spectrum.mesoscale ?? [3.8, 1.65, 5.4];
    const fineFrequency = spectrum.fine ?? [4.8, 1.8, 3.1];
    const heightBlend = smoothstep(-0.78, 0.78, normalizedY);
    const anisotropy = layer.anisotropy ?? [1, 1, 1];
    const broad = fbm3(
        advectedX * broadFrequency[0] * anisotropy[0] + 4.7,
        normalizedY * broadFrequency[1] * anisotropy[1] - 2.6,
        advectedZ * broadFrequency[2] * anisotropy[2] + 7.9,
        seed + 3181,
    );
    const mesoscale = fbm3(
        advectedX * mix(mesoscaleFrequency[0] * 0.86,
            mesoscaleFrequency[0] * 1.34, heightBlend) * anisotropy[0] - 6.1,
        normalizedY * mix(mesoscaleFrequency[1] * 0.82,
            mesoscaleFrequency[1] * 1.44, heightBlend) * anisotropy[1] + 1.8,
        advectedZ * mix(mesoscaleFrequency[2] * 1.16,
            mesoscaleFrequency[2] * 0.78, heightBlend) * anisotropy[2] - 3.5,
        seed + 3259,
    );
    const fine = fbm3(
        advectedX * fineFrequency[0] * (0.90 + 0.32 * heightBlend) + 2.4,
        normalizedY * fineFrequency[1] * (0.86 + 0.48 * heightBlend) - 7.3,
        advectedZ * fineFrequency[2] * (1.18 - 0.34 * heightBlend) + 4.1,
        seed + 3317,
    );
    // Ridged noise aligned with the downwind axis is the fibrous/sheared
    // organization. Its height-dependent weight is small in the core and
    // stronger in the thin upper and lower mixed-air layers.
    const fibrous = ridgedFbm3(
        advectedX * 5.0 * anisotropy[0] - 3.1,
        normalizedY * 1.5 * anisotropy[1] + 5.6,
        advectedZ * 2.6 * anisotropy[2] - 8.7,
        seed + 3373,
    );
    const fallstreakSignal = ridgedFbm3(
        advectedX * 6.2 * anisotropy[0] + 5.1,
        normalizedY * 1.4 * anisotropy[1] - 4.8,
        advectedZ * 2.4 * anisotropy[2] + 1.6,
        seed + 3419,
    );
    const coherentFallstreak = fbm3(
        advectedX * 2.2 * anisotropy[0] - 1.4,
        normalizedY * 1.05 * anisotropy[1] + 3.8,
        advectedZ * 1.35 * anisotropy[2] - 2.3,
        seed + 3461,
    );
    // Source-site proximity is a weak humidity modulation, not a union of
    // authored blobs. It preserves finite generating histories while leaving
    // the stochastic field in charge of the actual excursion boundary.
    let sourceSiteSignal = 0;
    for (const site of primitive.sourceSites ?? []) {
        const siteDistance = Math.hypot(
            normalizedX - site[0],
            (normalizedY - (site[2] ?? 0)) * 0.68,
            normalizedZ - site[1],
        );
        sourceSiteSignal = Math.max(
            sourceSiteSignal,
            Math.exp(-0.5 * (siteDistance / 0.42) ** 2),
        );
    }
    // Mesoscale/broad modes own the support excursion. Fine/fibrous modes
    // remain in the optical IWC and density modulation, but cannot pepper the
    // binary support with isolated one-voxel islands before 2x reduction.
    const rawSupportGaussian =
        0.50 * (broad - 0.5) +
        0.39 * (mesoscale - 0.5) +
        0.07 * (layer.coherence - 0.5) +
        0.04 * (sourceSiteSignal - 0.42) +
        0.08 * (coherentFallstreak - 0.5) *
            settling * (layer.fallstreakWeight ?? 0.5);
    const supportGaussian = (
        rawSupportGaussian - (primitive.supportMeanOffset ?? 0)
    ) * (primitive.supportVarianceScale ?? 1);
    const fineGaussian =
        0.64 * (fine - 0.5) +
        0.36 * (fibrous - 0.5) +
        0.22 * (fallstreakSignal - 0.5) * settling;
    const sigma = Math.max(0.15, primitive.sigma ?? 1.28);
    // A lognormal IWC proxy preserves a positive heavy tail while remaining
    // deterministic and bounded. The finite envelope controls total support;
    // this field controls the excursion geometry and optical-depth contrast.
    const supportIwc = Math.exp(
        sigma * supportGaussian - 0.5 * sigma * sigma *
            (primitive.supportVarianceReference ?? 0.085),
    );
    const lowerSettlingBias = (fallstreakSignal - 0.5) *
        (0.16 + 0.20 * settling * (layer.fallstreakWeight ?? 0.5));
    const fibrousBias = (fibrous - 0.5) *
        (0.18 + 0.24 * (1 - layer.coherence));
    const iwc = supportIwc * Math.exp(
        0.82 * fineGaussian + lowerSettlingBias + fibrousBias,
    );
    const excursion = (supportIwc - (primitive.excursionThreshold ?? 0.88)) *
        (primitive.excursionScale ?? 0.18);
    const envelopeField = envelope * envelopeScale;
    const field = smoothMinimumC2(
        envelopeField,
        excursion,
        primitive.smoothing ?? 0.009,
    );
    return {
        field,
        normalizedX,
        normalizedY,
        normalizedZ,
        envelope,
        iwc,
        lognormalGaussian: supportGaussian,
        supportIwc,
        fineIwcFactor: iwc / Math.max(1e-6, supportIwc),
        fibrousSignal: fibrous,
        fallstreakSignal,
    };
};

export const evaluateCloudSpissatusStochasticField = (primitive, point, seed = 0) => {
    if (!primitive || primitive.kind !== "spissatus-stochastic-field" ||
        !Array.isArray(point) || point.length !== 3) {
        throw new Error(
            "Spissatus stochastic-field qualification requires one primitive and xyz point",
        );
    }
    return evaluateSpissatusStochasticField(
        point[0], point[1], point[2], primitive, seed,
    );
};

// Expose the deterministic source model for focused qualification probes. The
// atlas generator remains the sole owner of sampling/packing; this helper only
// returns the exact ci-spissatus primitive (with the same identity-derived
// random stream) so tests can compare field ablations without rebuilding every
// volume in the atlas.
export const createCloudSpissatusStochasticModel = (
    seed = CLOUD_MACRO_ATLAS_SEED,
) => {
    const config = VOLUME_CONFIGS.find((candidate) =>
        candidate.id === "ci-spissatus",
    );
    if (!config) throw new Error("ci-spissatus source config is unavailable");
    const volumeSeed = hashInteger(seed ^ hashString(config.id));
    return buildMacroModel(config, volumeSeed);
};

export const evaluateCloudSpissatusStochasticModel = (
    model,
    point,
    seed = CLOUD_MACRO_ATLAS_SEED,
) => {
    if (!model || model.kind !== "primitive" ||
        !Array.isArray(point) || point.length !== 3) {
        throw new Error(
            "Spissatus stochastic-model qualification requires one model and xyz point",
        );
    }
    const config = VOLUME_CONFIGS.find((candidate) =>
        candidate.id === "ci-spissatus",
    );
    if (!config) throw new Error("ci-spissatus source config is unavailable");
    const volumeSeed = hashInteger(seed ^ hashString(config.id));
    return evaluateMacroModel(
        model,
        config,
        point[0],
        point[1],
        point[2],
        volumeSeed,
    );
};

const summarizeSpissatusLatentField = (primitive, seed) => {
    const values = [];
    const iwcValues = [];
    // A 21^3 stratified lattice resolves the upper IWC tail that a 9^3
    // summary can miss entirely while remaining deterministic and cheap
    // relative to the 96^3 source sampling.
    const sampleResolution = 21;
    for (let z = 0; z < sampleResolution; z += 1) {
        for (let y = 0; y < sampleResolution; y += 1) {
            for (let x = 0; x < sampleResolution; x += 1) {
                const sample = evaluateSpissatusStochasticField(
                    x / (sampleResolution - 1),
                    y / (sampleResolution - 1),
                    z / (sampleResolution - 1),
                    primitive,
                    seed,
                );
                if (sample.envelope <= 0 || !Number.isFinite(sample.lognormalGaussian)) {
                    continue;
                }
                values.push(sample.lognormalGaussian);
                iwcValues.push(sample.iwc);
            }
        }
    }
    const mean = values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length);
    const variance = values.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0,
    ) / Math.max(1, values.length);
    const standardDeviation = Math.sqrt(variance);
    const skew = values.reduce(
        (sum, value) => sum + ((value - mean) / Math.max(1e-6, standardDeviation)) ** 3,
        0,
    ) / Math.max(1, values.length);
    const iwcMean = iwcValues.reduce((sum, value) => sum + value, 0) /
        Math.max(1, iwcValues.length);
    const sortedIwc = [...iwcValues].sort((left, right) => left - right);
    const iwcQuantile = (amount) => sortedIwc.length === 0 ? 0 :
        sortedIwc[Math.min(
            sortedIwc.length - 1,
            Math.floor(amount * (sortedIwc.length - 1)),
        )];
    const iwcSaturationFraction = iwcValues.filter((value) => value >= 1.85).length /
        Math.max(1, iwcValues.length);
    return {
        latentMean: mean,
        latentVariance: variance,
        latentSkew: skew,
        iwcMean,
        iwcP95: iwcQuantile(0.95),
        iwcP99: iwcQuantile(0.99),
        iwcSaturationFraction,
    };
};

const iceAngularSignal = (modes, angle) => (modes ?? []).reduce(
    (sum, mode) => sum + mode.amplitude * Math.cos(
        mode.order * angle + mode.phase,
    ),
    0,
);

/**
 * One finite, depth-bearing mass of optically dense ice cloud.
 *
 * Spissatus is neither a capsule nor a card.  Its generating region is a
 * compact three-dimensional condensate body whose upper and lower surfaces
 * are displaced differently by shear and sedimentation.  Low-order angular
 * modes describe the correlated perimeter of that body; they are not opacity
 * masks and they never extend beyond the owner.  The non-zero rim thickness
 * gives boundary fibres a real volume from which to emerge.
 */
const addIcePatchSurface = (primitives, options) => {
    primitives.push({
        kind: "ice-patch-surface",
        center: options.center,
        radii: options.radii,
        rotation: options.rotation ?? 0,
        planModes: options.planModes ?? [],
        planReliefLobes: options.planReliefLobes ?? [],
        thicknessModes: options.thicknessModes ?? [],
        surfaceModes: options.surfaceModes ?? [],
        upperReliefLobes: options.upperReliefLobes ?? [],
        lowerReliefLobes: options.lowerReliefLobes ?? [],
        upperSurfaceBend: options.upperSurfaceBend ?? {
            linear: [0, 0],
            quadratic: [0, 0, 0],
        },
        lowerSurfaceBend: options.lowerSurfaceBend ?? {
            linear: [0, 0],
            quadratic: [0, 0, 0],
        },
        maximumUpperReliefFraction:
            options.maximumUpperReliefFraction ?? 0.34,
        centerlineSlope: options.centerlineSlope ?? [0, 0],
        centerlineWave: options.centerlineWave ?? {
            amplitude: 0,
            frequency: [1, 1],
            phase: 0,
            secondaryAmplitude: 0,
            secondaryFrequency: [1, -1],
            secondaryPhase: 0,
        },
        rimThicknessFraction: options.rimThicknessFraction ?? 0.18,
        interiorThicknessExponent: options.interiorThicknessExponent ?? 0.62,
        upperFraction: options.upperFraction ?? 0.58,
        density: options.density ?? 1,
        detail: options.detail ?? 0.78,
        phase: options.phase ?? 1,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "finite-sheared-ice-patch",
        hierarchyLevel: options.hierarchyLevel ?? 0,
        // Optional owner-local condensate hierarchy.  This changes material
        // density only; the finite C2 surface above remains the sole support
        // and SDF authority.
        interiorDensity: options.interiorDensity ?? null,
        supportKind: "c2-finite-depth-bearing-ice-patch",
    });
};

const icePatchLocalizedRelief = (
    normalizedX,
    normalizedZ,
    lobes,
) => (lobes ?? []).reduce((sum, lobe) => {
    const radiusX = Math.max(1e-6, lobe.radii[0]);
    const radiusZ = Math.max(1e-6, lobe.radii[1]);
    const radial = Math.hypot(
        (normalizedX - lobe.center[0]) / radiusX,
        (normalizedZ - lobe.center[1]) / radiusZ,
    );
    return sum + lobe.amplitude * (1 - quinticUnitSweep(radial));
}, 0);

const icePatchDirectionalSurfaceBend = (
    normalizedX,
    normalizedZ,
    interior,
    radiusY,
    bend,
) => {
    const linear = bend?.linear ?? [0, 0];
    const quadratic = bend?.quadratic ?? [0, 0, 0];
    return radiusY * Math.max(0, interior) * clamp(
        linear[0] * normalizedX +
        linear[1] * normalizedZ +
        quadratic[0] * normalizedX * normalizedX +
        quadratic[1] * normalizedZ * normalizedZ +
        quadratic[2] * normalizedX * normalizedZ,
        -0.26,
        0.26,
    );
};

const evaluateIcePatchSurface = (x, y, z, primitive) => {
    const { localX, localZ } = rotatedIcePlanCoordinates(x, z, primitive);
    const radiusX = Math.max(1e-6, primitive.radii[0]);
    const radiusY = Math.max(1e-6, primitive.radii[1]);
    const radiusZ = Math.max(1e-6, primitive.radii[2]);
    const normalizedX = localX / radiusX;
    const normalizedZ = localZ / radiusZ;
    const radial = Math.hypot(normalizedX, normalizedZ);
    const angle = Math.atan2(normalizedZ, normalizedX);
    const planScale = clamp(
        1 + iceAngularSignal(primitive.planModes, angle),
        0.66,
        1.34,
    );
    const planCoordinate = radial / planScale;
    // Localized positive/negative plan relief creates attached shoulders,
    // fibrous tongues, and dry-air notches at a scale that survives the
    // production atlas. Unlike another angular noise octave, each feature has
    // one finite physical location and cannot repeat around a radial ring.
    const planField = (1 - planCoordinate) * Math.min(radiusX, radiusZ) +
        icePatchLocalizedRelief(
            normalizedX,
            normalizedZ,
            primitive.planReliefLobes,
        );
    const interior = 1 - quinticUnitSweep(planCoordinate);
    const edgeBand = Math.exp(-(
        ((planCoordinate - 0.68) / 0.27) ** 2
    ));
    const thicknessSignal = iceAngularSignal(
        primitive.thicknessModes,
        angle,
    ) * edgeBand;
    const thicknessScale = clamp(1 + thicknessSignal, 0.54, 1.48);
    const halfDepth = radiusY * thicknessScale * (
        primitive.rimThicknessFraction +
        (1 - primitive.rimThicknessFraction) * Math.pow(
            Math.max(0, interior),
            primitive.interiorThicknessExponent,
        )
    );
    const wave = primitive.centerlineWave;
    const centerline = primitive.center[1] +
        primitive.centerlineSlope[0] * localX +
        primitive.centerlineSlope[1] * localZ +
        wave.amplitude * Math.sin(
            normalizedX * wave.frequency[0] +
            normalizedZ * wave.frequency[1] +
            wave.phase,
        ) * Math.max(0, interior) +
        (wave.secondaryAmplitude ?? 0) * Math.sin(
            normalizedX * (wave.secondaryFrequency?.[0] ?? 1) +
            normalizedZ * (wave.secondaryFrequency?.[1] ?? -1) +
            (wave.secondaryPhase ?? 0),
        ) * Math.max(0, interior);
    const surfaceSignal = iceAngularSignal(primitive.surfaceModes, angle) *
        radiusY * edgeBand;
    const upperRelief = clamp(
        icePatchLocalizedRelief(
            normalizedX,
            normalizedZ,
            primitive.upperReliefLobes,
        ),
        -radiusY * primitive.maximumUpperReliefFraction,
        radiusY * primitive.maximumUpperReliefFraction,
    );
    const lowerRelief = clamp(
        icePatchLocalizedRelief(
            normalizedX,
            normalizedZ,
            primitive.lowerReliefLobes,
        ),
        -radiusY * 0.36,
        radiusY * 0.36,
    );
    const upperSurfaceBend = icePatchDirectionalSurfaceBend(
        normalizedX,
        normalizedZ,
        interior,
        radiusY,
        primitive.upperSurfaceBend,
    );
    const lowerSurfaceBend = icePatchDirectionalSurfaceBend(
        normalizedX,
        normalizedZ,
        interior,
        radiusY,
        primitive.lowerSurfaceBend,
    );
    const minimumUpperDepth = radiusY * primitive.rimThicknessFraction *
        primitive.upperFraction * 0.68;
    const minimumLowerDepth = radiusY * primitive.rimThicknessFraction *
        (1 - primitive.upperFraction) * 0.68;
    const upperDepth = Math.max(
        minimumUpperDepth,
        halfDepth * primitive.upperFraction +
            Math.max(-halfDepth * 0.24, surfaceSignal) +
            upperRelief +
            upperSurfaceBend,
    );
    const lowerDepth = Math.max(
        minimumLowerDepth,
        halfDepth * (1 - primitive.upperFraction) -
            Math.min(halfDepth * 0.24, surfaceSignal * 0.62) +
            lowerRelief +
            lowerSurfaceBend,
    );
    const lowerSurface = centerline - lowerDepth;
    const upperSurface = centerline + upperDepth;
    const verticalField = smoothMinimumC2(
        y - lowerSurface,
        upperSurface - y,
        Math.max(0.001, radiusY * 0.035),
    );
    const field = smoothMinimumC2(
        planField,
        verticalField,
        Math.max(0.001, Math.min(radiusX, radiusZ) * 0.025),
    );
    const depthSpan = Math.max(1e-6, upperSurface - lowerSurface);
    const normalizedDepth = clamp((y - lowerSurface) / depthSpan);
    return {
        field,
        normalizedX,
        normalizedZ,
        normalizedDepth,
        planInterior: clamp(1 - planCoordinate),
        depthInterior: clamp(4 * normalizedDepth * (1 - normalizedDepth)),
    };
};

const icePatchSurfaceField = (x, y, z, primitive) =>
    evaluateIcePatchSurface(x, y, z, primitive).field;

/**
 * A dense Cirrus patch is not a constant-density solid bounded by a noisy
 * shell.  Ice is generated in finite regions, differentially advected while
 * settling, and mixed through several correlated spatial scales.  Evaluate
 * that hierarchy in the selected patch's own frame so it remains a real 3-D
 * optical-depth field under every camera and light direction.
 *
 * The multiplier is gated away from the C2 boundary and never changes
 * support.  Existing 2x reduction and block-mass conditioning therefore
 * remain the exact conservative authority for macro density and fine source
 * moments.
 */
const spissatusInteriorDensityMultiplier = (
    primitive,
    geometry,
    seed,
) => {
    const descriptor = primitive.interiorDensity;
    if (!descriptor || descriptor.kind !==
        "sheared-sedimenting-ice-mass") return 1;
    const depthOffset = geometry.normalizedDepth - 0.5;
    const shearedX = geometry.normalizedX +
        descriptor.shear[0] * depthOffset;
    const shearedZ = geometry.normalizedZ +
        descriptor.shear[1] * depthOffset;
    const localSeed = seed + descriptor.seedOffset;
    const broad = fbm3(
        shearedX * 2.4 + 3.7,
        shearedZ * 3.1 - 5.2,
        geometry.normalizedDepth * 1.8 + 1.1,
        localSeed + 2053,
    );
    const middle = fbm3(
        shearedX * 6.7 - 4.3,
        shearedZ * 8.9 + 2.8,
        geometry.normalizedDepth * 4.5 - 3.4,
        localSeed + 2381,
    );
    const fibrous = ridgedFbm3(
        shearedX * 14.5 + 7.1,
        shearedZ * 17.0 - 6.2,
        geometry.normalizedDepth * 9.0 + 4.6,
        localSeed + 2741,
    );
    const hierarchy =
        0.52 * (broad - 0.5) +
        0.32 * (middle - 0.5) +
        0.16 * (fibrous - 0.5);
    // Atmospheric ice condensate is intermittent rather than Gaussian: broad
    // generating regions contain coherent denser sheaves separated by
    // depleted mixed air.  This odd, bounded transfer expands the physically
    // important middle of the zero-mean hierarchy without changing its
    // extrema, its sign, or any analytic support.  Keeping the descriptor's
    // existing multiplier bounds avoids the plateaus produced by simply
    // raising contrast until the clamp carries the visual structure.
    const intermittency = descriptor.intermittency;
    const shapedHierarchy = 0.5 *
        Math.tanh(intermittency * hierarchy) /
        Math.tanh(intermittency * 0.5);
    const interiorGate =
        smoothstep(0.08, 0.42, geometry.planInterior) *
        smoothstep(0.05, 0.55, geometry.depthInterior);
    // Slightly greater lower-patch mass represents the larger crystals which
    // acquire terminal velocity before continuing into the authored trails.
    const settlingBias = descriptor.settlingBias *
        (0.5 - geometry.normalizedDepth);
    return clamp(
        1 + interiorGate * (
            descriptor.contrast * shapedHierarchy + settlingBias
        ),
        descriptor.minimumMultiplier,
        descriptor.maximumMultiplier,
    );
};

/**
 * One irregular elevated-convective ice tuft.  A single analytic support owns
 * its scalloped crown, narrowed root, and ragged sublimating underside.  This
 * replaces unions of smooth ellipsoid stamps while retaining a genuine 3-D
 * volume for lighting and shadow integration.
 */
const addIceTuftSurface = (primitives, options) => {
    primitives.push({
        kind: "ice-tuft-surface",
        center: options.center,
        radii: options.radii,
        rotation: options.rotation ?? 0,
        baseAltitude: options.baseAltitude,
        crownHeight: options.crownHeight,
        undersideDepth: options.undersideDepth,
        planModes: options.planModes ?? [],
        crownModes: options.crownModes ?? [],
        undersideModes: options.undersideModes ?? [],
        crownExponent: options.crownExponent ?? 0.62,
        tilt: options.tilt ?? [0, 0],
        density: options.density ?? 1,
        detail: options.detail ?? 0.82,
        phase: options.phase ?? 1,
        precipitation: options.precipitation ?? 0,
        role: options.role ?? "finite-ragged-ice-tuft",
        hierarchyLevel: options.hierarchyLevel ?? 0,
        supportKind: "c2-scalloped-crown-ragged-underside-ice-tuft",
    });
};

const iceTuftSurfaceField = (x, y, z, primitive) => {
    const { localX, localZ } = rotatedIcePlanCoordinates(x, z, primitive);
    const radiusX = Math.max(1e-6, primitive.radii[0]);
    const radiusZ = Math.max(1e-6, primitive.radii[2]);
    const normalizedX = localX / radiusX;
    const normalizedZ = localZ / radiusZ;
    const radial = Math.hypot(normalizedX, normalizedZ);
    const angle = Math.atan2(normalizedZ, normalizedX);
    const planScale = clamp(
        1 + iceAngularSignal(primitive.planModes, angle),
        0.68,
        1.32,
    );
    const planCoordinate = radial / planScale;
    const planField = (1 - planCoordinate) * Math.min(radiusX, radiusZ);
    const interior = 1 - quinticUnitSweep(planCoordinate);
    const shoulderBand = Math.exp(-(
        ((planCoordinate - 0.48) / 0.25) ** 2
    ));
    const edgeBand = Math.exp(-(
        ((planCoordinate - 0.80) / 0.20) ** 2
    ));
    const base = primitive.baseAltitude +
        primitive.tilt[0] * localX + primitive.tilt[1] * localZ;
    const crownSignal = iceAngularSignal(primitive.crownModes, angle);
    const undersideSignal = iceAngularSignal(
        primitive.undersideModes,
        angle,
    );
    const crown = base + primitive.crownHeight * clamp(
        0.16 + 0.84 * Math.pow(Math.max(0, interior),
            primitive.crownExponent) + crownSignal * shoulderBand,
        0.10,
        1.28,
    );
    const underside = base - primitive.undersideDepth * clamp(
        0.18 + 0.52 * Math.pow(Math.max(0, interior), 0.72) +
            undersideSignal * edgeBand,
        0.06,
        1.18,
    );
    const verticalField = smoothMinimumC2(
        y - underside,
        crown - y,
        Math.max(0.001, Math.min(
            primitive.crownHeight,
            primitive.undersideDepth,
        ) * 0.035),
    );
    return smoothMinimumC2(
        planField,
        verticalField,
        Math.max(0.001, Math.min(radiusX, radiusZ) * 0.035),
    );
};

const capsuleField = (x, y, z, primitive) => {
    const verticalScale = Math.max(0.08, primitive.verticalScale);
    const px = x;
    const py = y / verticalScale;
    const pz = z;
    const ax = primitive.start[0];
    const ay = primitive.start[1] / verticalScale;
    const az = primitive.start[2];
    const bx = primitive.end[0];
    const by = primitive.end[1] / verticalScale;
    const bz = primitive.end[2];
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const denominator = Math.max(1e-8, abx * abx + aby * aby + abz * abz);
    const t = clamp(((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / denominator);
    const dx = px - mix(ax, bx, t);
    const dy = py - mix(ay, by, t);
    const dz = pz - mix(az, bz, t);
    return primitive.radius - Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const sweptC2Field = (x, y, z, primitive) => {
    const verticalScale = Math.max(0.08, primitive.verticalScale);
    const px = x;
    const py = y / verticalScale;
    const pz = z;
    let field = -Infinity;
    for (let index = 0; index + 1 < primitive.samples.length; index += 1) {
        const source = primitive.samples[index];
        const target = primitive.samples[index + 1];
        const ax = source.point[0];
        const ay = source.point[1] / verticalScale;
        const az = source.point[2];
        const bx = target.point[0];
        const by = target.point[1] / verticalScale;
        const bz = target.point[2];
        const abx = bx - ax;
        const aby = by - ay;
        const abz = bz - az;
        const denominator = Math.max(1e-8, abx * abx + aby * aby + abz * abz);
        const amount = clamp(
            ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) /
                denominator,
        );
        const dx = px - mix(ax, bx, amount);
        const dy = py - mix(ay, by, amount);
        const dz = pz - mix(az, bz, amount);
        const radius = mix(source.radius, target.radius, amount);
        const globalAmount = (index + amount) /
            Math.max(1, primitive.samples.length - 1);
        const densityTaper = mix(
            1,
            primitive.densityEndTaper ?? 1,
            Math.pow(globalAmount, primitive.densityTaperPower ?? 1),
        );
        field = Math.max(
            field,
            (radius - Math.sqrt(dx * dx + dy * dy + dz * dz)) * densityTaper,
        );
    }
    return field;
};

export const evaluateCloudSweptC2Support = (primitive, point) => {
    if (primitive?.kind !== "swept-c2" || !Array.isArray(point) ||
        point.length !== 3) {
        throw new Error("Swept C2 qualification requires one sweep and xyz point");
    }
    return sweptC2Field(point[0], point[1], point[2], primitive);
};

const primitiveField = (x, y, z, primitive, seed = 0) => {
    if (primitive.kind === "capsule") return capsuleField(x, y, z, primitive);
    if (primitive.kind === "swept-c2") return sweptC2Field(x, y, z, primitive);
    if (primitive.kind === "spissatus-stochastic-field") {
        return evaluateSpissatusStochasticField(x, y, z, primitive, seed).field;
    }
    if (primitive.kind === "ice-patch-surface") {
        return icePatchSurfaceField(x, y, z, primitive);
    }
    if (primitive.kind === "ice-tuft-surface") {
        return iceTuftSurfaceField(x, y, z, primitive);
    }
    if (primitive.kind === "circulation-cell-surface") {
        return circulationCellSurfaceField(x, y, z, primitive);
    }
    if (primitive.kind === "circulation-ribbon-surface") {
        return circulationRibbonSurfaceField(x, y, z, primitive);
    }
    return ellipsoidField(x, y, z, primitive);
};

export const evaluateCloudCirculationSurface = (primitive, point) => {
    if (!primitive || ![
        "circulation-cell-surface",
        "circulation-ribbon-surface",
    ].includes(primitive.kind) || !Array.isArray(point) || point.length !== 3) {
        throw new Error(
            "Circulation-surface qualification requires one surface and xyz point",
        );
    }
    return primitiveField(point[0], point[1], point[2], primitive);
};

const addPrimitiveEllipsoid = (primitives, center, radii, options = {}) => {
    addEllipsoid(primitives, center, radii, options);
    const primitive = primitives[primitives.length - 1];
    primitive.kind = "ellipsoid";
    primitive.precipitation = options.precipitation ?? 0;
};

const evaluatePrimitiveModel = (model, config, x, y, z, seed) => {
    const [warpedX, warpedY, warpedZ] = model.laminar
        ? [x, y, z]
        : warpPoint3(
            x,
            y,
            z,
            seed + 877,
            model.warpStrength ?? (config.builder === "ice-streamer" ? 0.010 : 0.024),
            model.warpAnisotropy ?? [1, 0.62, 1],
        );
    let support = -1;
    let bestField = -1;
    let detail = model.detailBase ?? 0.72;
    let phase = config.phaseBase ?? 1;
    let precipitation = 0;
    let bestPrimitive = null;
    let bestIcePatchGeometry = null;
    let bestSpissatusStochasticGeometry = null;
    for (const primitive of model.primitives) {
        const icePatchGeometry = primitive.kind === "ice-patch-surface"
            ? evaluateIcePatchSurface(
                warpedX,
                warpedY,
                warpedZ,
                primitive,
            )
            : null;
        const stochasticGeometry = primitive.kind === "spissatus-stochastic-field"
            ? evaluateSpissatusStochasticField(
                warpedX,
                warpedY,
                warpedZ,
                primitive,
                seed,
            )
            : null;
        const field = icePatchGeometry?.field ?? stochasticGeometry?.field ??
            primitiveField(warpedX, warpedY, warpedZ, primitive, seed);
        const weighted = field * primitive.density;
        support = Math.max(support, weighted);
        if (weighted > bestField) {
            bestField = weighted;
            bestPrimitive = primitive;
            bestIcePatchGeometry = icePatchGeometry;
            bestSpissatusStochasticGeometry = stochasticGeometry;
            detail = primitive.detail;
            phase = primitive.phase;
            precipitation = primitive.precipitation;
        }
    }
    let cavity = 0;
    for (const cut of model.cavities ?? []) {
        cavity = Math.max(cavity, Math.max(0,
            primitiveField(warpedX, warpedY, warpedZ, cut, seed)) *
            (cut.strength ?? 0.75));
    }
    // High-ice patches own a genuinely three-dimensional optical-depth
    // hierarchy.  Their dry-air intrusions are authored cavities (not screen
    // masks), and need enough leverage in the dense interior to survive the
    // 2x reduction and the production ray projection.  Keep the historical
    // conservative edge erosion for every other family; only the explicit
    // per-model gain may deepen ice cavities.
    const cavityInteriorGain = model.cavityInteriorGain ?? 1;
    support -= cavity * cavityInteriorGain *
        mix(0.42, 0.82, 1 - smoothstep(0.018, 0.070, support));
    const boundary = 1 - smoothstep(0.003, 0.035, support);
    const broad = fbm3(x * 5.1 + 3, y * 6.3 - 4, z * 5.4 + 7, seed + 991);
    const filament = fbm3(x * 16.2 - 8, y * 13.7 + 6, z * 14.9 - 2, seed + 1297);
    const ridge = ridgedFbm3(x * 8.3 + 2.7, y * 9.1 - 5.2, z * 7.9 + 9.4, seed + 1439);
    const erosionStrength = model.laminar
        ? mix(0.001, 0.004, boundary)
        : mix(model.interiorNoise ?? 0.002, model.edgeNoise ?? 0.016, boundary);
    const eroded = support +
        (broad - 0.48) * erosionStrength +
        (filament - 0.51) * erosionStrength * 0.45 +
        (ridge - 0.55) * erosionStrength * (model.fragmentary ? 0.72 : 0.30);
    let density = smoothstep(model.densityEdgeLow ?? -0.004, model.densityEdgeHigh ?? 0.020, eroded);
    if (bestPrimitive?.kind === "spissatus-stochastic-field" &&
        bestSpissatusStochasticGeometry) {
        // Spissatus optical density is an IWC observable, not a saturated
        // binary smoothstep of the excursion field.  The low-pass support gate
        // keeps dry-air boundaries finite while this affine positive-IWC map
        // retains a measurable low tail and a right-skewed high tail.
        const supportGate = smoothstep(
            0.0,
            0.028,
            bestSpissatusStochasticGeometry.field,
        );
        const iwcCore = clamp(
            // Use the log-IWC variate itself so the positive tail changes
            // optical depth without driving most interior bytes into the
            // upper clamp. The small bounded range is only the physical
            // [0,1] density contract, not a support selector.
            0.74 + 1.20 * Math.log(
                Math.max(1e-6, bestSpissatusStochasticGeometry.supportIwc),
            ),
            0.10,
            0.96,
        );
        density = supportGate * iwcCore;
    }
    density *= config.densityScale ?? 1;
    if (bestPrimitive && bestIcePatchGeometry) {
        density *= spissatusInteriorDensityMultiplier(
            bestPrimitive,
            bestIcePatchGeometry,
            seed,
        );
    }
    if (bestPrimitive?.kind === "spissatus-stochastic-field" &&
        bestSpissatusStochasticGeometry) {
        // Fine/fibrous IWC modes modulate optical depth inside connected
        // support. They never create new support voxels on their own.
        density *= clamp(
            -0.50 + 1.50 * bestSpissatusStochasticGeometry.fineIwcFactor,
            0.20,
            1.80,
        );
    }
    if (model.fragmentary) {
        const breakup = fbm3(x * 8.7 + 5, y * 9.1 - 3, z * 8.3 + 11, seed + 1879);
        density *= smoothstep(0.23, 0.56, breakup + Math.max(0, support) * 5.5);
    }
    return {
        density: clamp(density),
        detail: clamp(detail),
        phase: clamp(phase),
        precipitation: clamp(precipitation),
    };
};

/**
 * The atlas is a normalized, storm-relative translation of the physical
 * descriptors in deep-convection-physical-foundation.ts. Atlas axes are
 * x=crosswind, y=altitude, z=downwind (the physical foundation uses x for
 * downwind and z for crosswind). Values are deliberately owner-specific: a
 * sheared supercell crown cannot be obtained by merely rotating a pulse cell.
 */
export const DEEP_CONVECTION_MACRO_PROFILES = Object.freeze({
    "cb-calvus": Object.freeze({
        organization: "pulse-cell", environment: "tropical-humid-pulse",
        feederCount: 6, thermalCount: 10, cellCount: 1, crownCount: 9,
        shearCrosswind: 0.018, shearDownwind: 0.065, baseY: 0.135,
        overshootCount: 3, precipitationCount: 1, anvilBranches: 0,
        anvilChildren: 0, anvilDownwind: 0, anvilUpwind: 0,
        anvilCrosswind: 0, remnantCount: 0,
    }),
    "cb-capillatus": Object.freeze({
        organization: "pulse-cell", environment: "tropical-humid-pulse",
        feederCount: 6, thermalCount: 11, cellCount: 1, crownCount: 14,
        shearCrosswind: 0.026, shearDownwind: 0.095, baseY: 0.13,
        overshootCount: 3, precipitationCount: 3, anvilBranches: 0,
        anvilChildren: 0, anvilDownwind: 0, anvilUpwind: 0,
        anvilCrosswind: 0, remnantCount: 0,
    }),
    "cb-capillatus-incus": Object.freeze({
        organization: "supercell", environment: "continental-sheared-supercell",
        feederCount: 7, thermalCount: 12, cellCount: 1, crownCount: 14,
        shearCrosswind: 0.045, shearDownwind: 0.11, baseY: 0.145,
        overshootCount: 4, precipitationCount: 4, anvilBranches: 5,
        anvilChildren: 3, anvilDownwind: 0.34, anvilUpwind: 0.10,
        anvilCrosswind: 0.34, remnantCount: 0,
    }),
    "cb-dissipating": Object.freeze({
        organization: "pulse-cell", environment: "tropical-humid-pulse",
        feederCount: 0, thermalCount: 0, cellCount: 0, crownCount: 11,
        shearCrosswind: 0.035, shearDownwind: 0.11, baseY: 0.35,
        overshootCount: 0, precipitationCount: 1, anvilBranches: 4,
        anvilChildren: 2, anvilDownwind: 0.29, anvilUpwind: 0.12,
        anvilCrosswind: 0.31, remnantCount: 4,
    }),
    "cb-calvus-multicell": Object.freeze({
        organization: "multicell-cluster", environment: "maritime-multicell",
        feederCount: 9, thermalCount: 14, cellCount: 3, crownCount: 12,
        shearCrosswind: -0.025, shearDownwind: 0.085, baseY: 0.12,
        overshootCount: 2, precipitationCount: 2, anvilBranches: 0,
        anvilChildren: 0, anvilDownwind: 0, anvilUpwind: 0,
        anvilCrosswind: 0, remnantCount: 0,
    }),
    "cb-capillatus-sheared": Object.freeze({
        organization: "supercell", environment: "continental-sheared-supercell",
        feederCount: 6, thermalCount: 11, cellCount: 1, crownCount: 16,
        shearCrosswind: 0.105, shearDownwind: 0.18, baseY: 0.15,
        overshootCount: 2, precipitationCount: 3, anvilBranches: 0,
        anvilChildren: 0, anvilDownwind: 0, anvilUpwind: 0,
        anvilCrosswind: 0, remnantCount: 0,
    }),
    "cb-capillatus-incus-back-sheared": Object.freeze({
        organization: "supercell", environment: "continental-sheared-supercell",
        feederCount: 6, thermalCount: 11, cellCount: 1, crownCount: 15,
        shearCrosswind: -0.075, shearDownwind: 0.105, baseY: 0.15,
        overshootCount: 3, precipitationCount: 4, anvilBranches: 5,
        anvilChildren: 3, anvilDownwind: 0.25, anvilUpwind: 0.25,
        anvilCrosswind: 0.33, remnantCount: 0,
    }),
    "cb-dissipating-remnant": Object.freeze({
        organization: "multicell-cluster", environment: "maritime-multicell",
        feederCount: 0, thermalCount: 0, cellCount: 0, crownCount: 13,
        shearCrosswind: -0.03, shearDownwind: 0.13, baseY: 0.37,
        overshootCount: 0, precipitationCount: 1, anvilBranches: 5,
        anvilChildren: 3, anvilDownwind: 0.32, anvilUpwind: 0.15,
        anvilCrosswind: 0.37, remnantCount: 6,
    }),
});

/**
 * Cumulonimbus topology is authored as a graph of source-connected, tapered
 * trajectories. No positive ellipsoid is used for a tower lobe, crown, cap,
 * or anvil. That is important at 48^3: a family of overlapping spheres reads
 * as a snowman while a connected set of advected thermal paths survives
 * trilinear reconstruction as one evolving storm volume.
 */
const buildCumulonimbusModel = (config, seed) => {
    const profile = DEEP_CONVECTION_MACRO_PROFILES[config.id];
    if (!profile) throw new Error(`Missing deep-convection macro profile for ${config.id}`);
    const random = makeRandom(seed);
    const primitives = [];
    const cavities = [];
    const ownerPoints = [];
    const decaying = config.dissipating;
    const densityScale = config.densityScale ?? 1;
    // 48^3 is the authoritative macro support, not the final turbulent edge.
    // A little over one voxel of radius is insufficient for a massive Cb
    // body after trilinear reconstruction, so connected condensate paths use
    // a family-scale envelope while preserving all owner-specific radii.
    const macroEnvelopeScale = decaying ? 1.20 : 1.36;
    const goldenAngle = 2.399963229728653;
    let topologyNodeCount = 0;
    let topologyEdgeCount = 0;
    let sourceConnectedTrajectoryCount = 0;
    let trajectoryCount = 0;
    let feederTrajectoryCount = 0;
    let mergedUpdraftTrajectoryCount = 0;
    let calvusBridgeCount = 0;
    let glaciationTransitionCount = 0;
    let crownTrajectoryCount = 0;
    let anvilTrajectoryCount = 0;
    let overshootTrajectoryCount = 0;
    let precipitationTrajectoryCount = 0;
    let downdraftTrajectoryCount = 0;
    let remnantTrajectoryCount = 0;
    const trajectoryRadii = [];
    const trajectoryAzimuths = [];

    const resolveSeries = (value, index, amount) => typeof value === "function"
        ? value(amount, index)
        : Array.isArray(value)
            ? value[Math.min(index, value.length - 1)]
            : value;
    const trajectory = (points, radii, options = {}) => {
        if (points.length < 2) return;
        const radiusSeries = Array.isArray(radii) ? radii : points.map(() => radii);
        trajectoryCount += 1;
        topologyNodeCount += points.length;
        topologyEdgeCount += points.length - 1;
        if (options.sourceConnected !== false) sourceConnectedTrajectoryCount += 1;
        for (let index = 0; index + 1 < points.length; index += 1) {
            const amount = (index + 0.5) / (points.length - 1);
            const radius = Math.max(
                options.minimumRadius ?? 0.018,
                (radiusSeries[index] + radiusSeries[index + 1]) * 0.5,
            ) * (options.macroEnvelopeScale ?? macroEnvelopeScale);
            trajectoryRadii.push(radius);
            addCapsule(primitives, points[index], points[index + 1], radius, {
                density: clamp((resolveSeries(options.density ?? 1, index, amount)) * densityScale),
                detail: clamp(resolveSeries(options.detail ?? 0.7, index, amount)),
                phase: clamp(resolveSeries(options.phase ?? 0, index, amount)),
                precipitation: clamp(resolveSeries(options.precipitation ?? 0, index, amount)),
                verticalScale: resolveSeries(options.verticalScale ?? 1, index, amount),
                role: options.role ?? "deep-convective-trajectory",
            });
        }
        const start = points[0];
        const end = points.at(-1);
        trajectoryAzimuths.push(Math.atan2(end[0] - start[0], end[2] - start[2]));
        ownerPoints.push(points[Math.floor(points.length * 0.55)]);
    };

    const crownBaseY = decaying ? 0.69 : 0.67;
    const coreTopY = decaying ? 0.79 : 0.815;
    const centerAt = (altitude, cellOffset = 0) => {
        const amount = clamp((altitude - profile.baseY) / Math.max(0.1, coreTopY - profile.baseY));
        const merge = 1 - smoothstep(0.36, 0.82, amount);
        const wave = Math.sin(amount * Math.PI * 2.35 + (seed & 255) * 0.013);
        return [
            0.49 + profile.shearCrosswind * Math.pow(amount, 1.45) +
                cellOffset * merge + wave * 0.009,
            altitude,
            0.405 + profile.shearDownwind * Math.pow(amount, 1.55) +
                Math.cos(amount * Math.PI * 1.8 + 0.7) * 0.008,
        ];
    };
    const phaseAt = (altitude) => config.species === "calvus"
        ? smoothstep(0.67, 0.88, altitude) * 0.48
        : smoothstep(0.54, 0.86, altitude);
    const detailAt = (altitude) => mix(
        config.species === "calvus" ? 0.13 : 0.17,
        config.species === "calvus" ? 0.46 : 0.94,
        smoothstep(0.55, 0.87, altitude),
    );

    if (!decaying) {
        const feederJoin = centerAt(profile.baseY + 0.12);
        for (let index = 0; index < profile.feederCount; index += 1) {
            const angle = goldenAngle * index + random() * 0.38;
            const reach = mix(0.075, profile.cellCount > 1 ? 0.19 : 0.145, random());
            const cellBias = profile.cellCount > 1
                ? (index % profile.cellCount - (profile.cellCount - 1) * 0.5) * 0.05 : 0;
            const start = [
                0.49 + Math.cos(angle) * reach + cellBias,
                profile.baseY,
                0.405 + Math.sin(angle) * reach * 0.72,
            ];
            trajectory([
                start,
                [mix(start[0], feederJoin[0], 0.42), profile.baseY + 0.045 + random() * 0.018,
                    mix(start[2], feederJoin[2], 0.37)],
                [mix(start[0], feederJoin[0], 0.77), profile.baseY + 0.085 + random() * 0.015,
                    mix(start[2], feederJoin[2], 0.74)],
                feederJoin,
            ], [0.035, 0.046 + random() * 0.013, 0.052 + random() * 0.013, 0.060], {
                density: [0.78, 0.90, 0.96], detail: [0.24, 0.18, 0.14], phase: 0,
                verticalScale: [0.72, 0.90, 1.05], role: "surface-fed-inflow-thermal",
            });
            feederTrajectoryCount += 1;
        }

        const coreLevels = [
            profile.baseY + 0.105, profile.baseY + 0.17, profile.baseY + 0.245,
            profile.baseY + 0.33, profile.baseY + 0.42, profile.baseY + 0.50,
            profile.baseY + 0.57, crownBaseY, 0.745, coreTopY,
        ].filter((value, index, values) => index === 0 || value > values[index - 1] + 0.015);
        const corePoints = coreLevels.map((altitude) => centerAt(altitude));
        const coreRadii = coreLevels.map((altitude, index) => {
            const amount = index / Math.max(1, coreLevels.length - 1);
            return mix(0.071, 0.058, amount) +
                (0.032 + Math.sin(amount * Math.PI * 3.4 + 0.4) * 0.015) *
                smoothstep(0.05, 0.62, amount) * (1 - smoothstep(0.76, 1, amount));
        });
        trajectory(corePoints, coreRadii, {
            density: 0.99, detail: (amount) => detailAt(mix(coreLevels[0], coreTopY, amount)),
            phase: (amount) => phaseAt(mix(coreLevels[0], coreTopY, amount)),
            verticalScale: 1.18, role: "dominant-protected-updraft",
        });
        mergedUpdraftTrajectoryCount += 1;

        for (let cell = 1; cell < profile.cellCount; cell += 1) {
            const sign = cell % 2 === 1 ? -1 : 1;
            const magnitude = 0.105 + Math.floor((cell - 1) / 2) * 0.045;
            const mergeY = 0.58 + cell * 0.035;
            const root = [
                0.49 + sign * magnitude,
                profile.baseY + 0.015 * cell,
                0.39 + sign * 0.025,
            ];
            trajectory([
                root,
                [root[0] + sign * 0.018, profile.baseY + 0.18, root[2] + 0.015],
                [mix(root[0], centerAt(mergeY)[0], 0.46), 0.43 + cell * 0.018,
                    mix(root[2], centerAt(mergeY)[2], 0.55)],
                centerAt(mergeY),
            ], [0.052, 0.076, 0.087 - cell * 0.006, 0.066], {
                density: [0.90, 0.98, 0.94], detail: [0.18, 0.22, 0.27],
                phase: (amount) => phaseAt(mix(profile.baseY, mergeY, amount)),
                verticalScale: 1.14, role: "merged-secondary-updraft",
            });
            mergedUpdraftTrajectoryCount += 1;
        }

        for (let index = 0; index < profile.thermalCount; index += 1) {
            const startAmount = mix(0.09, 0.68, (index + random() * 0.42) / profile.thermalCount);
            const startY = mix(profile.baseY + 0.10, 0.65, startAmount);
            const rise = mix(0.13, 0.24, random()) * (1 - startAmount * 0.20);
            const endY = Math.min(crownBaseY + 0.06, startY + rise);
            const angle = goldenAngle * index + random() * 0.55;
            const expansion = mix(0.065, 0.125, random()) * mix(0.72, 1.12, startAmount);
            const start = centerAt(startY);
            const end = centerAt(endY);
            const midpoint = centerAt(mix(startY, endY, 0.55));
            midpoint[0] += Math.cos(angle) * expansion;
            midpoint[2] += Math.sin(angle) * expansion * 0.78 +
                profile.shearDownwind * startAmount * 0.14;
            trajectory([
                start,
                [mix(start[0], midpoint[0], 0.55), mix(startY, endY, 0.30),
                    mix(start[2], midpoint[2], 0.55)],
                midpoint,
                [mix(midpoint[0], end[0], 0.56), mix(startY, endY, 0.82),
                    mix(midpoint[2], end[2], 0.58)],
                end,
            ], [0.038, 0.053 + random() * 0.015, 0.061 + random() * 0.021,
                0.047 + random() * 0.012, 0.038], {
                density: [0.88, 0.96, 0.92, 0.88],
                detail: (amount) => detailAt(mix(startY, endY, amount)),
                phase: (amount) => phaseAt(mix(startY, endY, amount)),
                verticalScale: [1.02, 1.14, 1.06, 0.98], role: "attached-entraining-thermal",
            });
            mergedUpdraftTrajectoryCount += 1;
        }
    }

    const summitSource = centerAt(crownBaseY);
    if (config.species === "calvus") {
        for (let index = 0; index < profile.crownCount; index += 1) {
            const angle = goldenAngle * index + random() * 0.42;
            const breadth = mix(0.065, 0.13, random()) * (index % 3 === 0 ? 1.12 : 1);
            const summitY = mix(0.835, 0.875, random()) - Math.abs(Math.sin(angle)) * 0.008;
            const shoulder = [
                summitSource[0] + Math.cos(angle) * breadth,
                mix(crownBaseY, summitY, 0.55) + random() * 0.018,
                summitSource[2] + Math.sin(angle) * breadth * 0.76 + profile.shearDownwind * 0.22,
            ];
            trajectory([
                summitSource,
                [mix(summitSource[0], shoulder[0], 0.54), 0.745 + random() * 0.022,
                    mix(summitSource[2], shoulder[2], 0.48)],
                shoulder,
                [mix(shoulder[0], centerAt(summitY)[0], 0.64), summitY,
                    mix(shoulder[2], centerAt(summitY)[2], 0.56)],
            ], [0.054, 0.065 + random() * 0.013, 0.058 + random() * 0.018,
                0.036 + random() * 0.009], {
                density: [0.94, 0.96, 0.88], detail: [0.30, 0.39, 0.45],
                phase: [0.20, 0.34, 0.48], verticalScale: [1.11, 1.02, 0.88],
                role: "attached-calvus-dome-trajectory",
            });
            calvusBridgeCount += 1;
            crownTrajectoryCount += 1;
        }
    } else {
        const transitionHub = centerAt(0.755);
        const transitionCount = profile.organization === "supercell" ? 7 : 6;
        for (let index = 0; index < transitionCount; index += 1) {
            const angle = goldenAngle * index + random() * 0.35;
            const span = mix(0.045, 0.09, random());
            trajectory([
                summitSource,
                [summitSource[0] + Math.cos(angle) * span, 0.715 + random() * 0.018,
                    summitSource[2] + Math.sin(angle) * span * 0.68],
                [transitionHub[0] + Math.cos(angle) * span * 0.78, 0.775 + random() * 0.012,
                    transitionHub[2] + Math.sin(angle) * span * 0.58],
                transitionHub,
            ], [0.048, 0.057 + random() * 0.012, 0.046, 0.036], {
                density: [0.94, 0.91, 0.84], detail: [0.44, 0.62, 0.76],
                phase: [0.43, 0.67, 0.84], verticalScale: [1.02, 0.94, 0.88],
                role: "continuous-mixed-phase-transition",
            });
            glaciationTransitionCount += 1;
        }
        for (let index = 0; index < profile.crownCount; index += 1) {
            const across = index / Math.max(1, profile.crownCount - 1) - 0.5;
            const angle = goldenAngle * index + random() * 0.28;
            const fan = mix(0.09, 0.225, clamp(Math.abs(across) * 1.22 + random() * 0.24));
            const shearReach = profile.shearDownwind * mix(0.36, 0.94, random());
            const endY = mix(0.825, 0.883, random()) - Math.abs(across) * 0.025;
            trajectory([
                transitionHub,
                [transitionHub[0] + Math.cos(angle) * fan * 0.34, 0.81 + random() * 0.016,
                    transitionHub[2] + Math.sin(angle) * fan * 0.20 + shearReach * 0.28],
                [transitionHub[0] + Math.cos(angle) * fan * 0.74 + profile.shearCrosswind * 0.18,
                    0.855 + random() * 0.018,
                    transitionHub[2] + Math.sin(angle) * fan * 0.43 + shearReach * 0.68],
                [transitionHub[0] + Math.cos(angle) * fan + profile.shearCrosswind * 0.32,
                    endY,
                    transitionHub[2] + Math.sin(angle) * fan * 0.58 + shearReach],
            ], [0.036, 0.033 + random() * 0.010, 0.027 + random() * 0.008,
                0.019 + random() * 0.006], {
                density: decaying ? [0.58, 0.48, 0.34] : [0.88, 0.76, 0.58],
                detail: [0.79, 0.91, 0.98], phase: [0.86, 0.97, 1],
                verticalScale: [0.88, 0.70, 0.56], role: "source-connected-capillatus-fibre",
            });
            crownTrajectoryCount += 1;
        }
    }

    if (profile.overshootCount > 0) {
        const source = centerAt(0.81);
        const peakY = config.species === "calvus" ? 0.925 : 0.935;
        for (let index = 0; index < profile.overshootCount; index += 1) {
            const angle = goldenAngle * index + 0.35 + random() * 0.25;
            const reach = mix(0.025, 0.052, random());
            trajectory([
                source,
                [source[0] + Math.cos(angle) * reach, 0.855 + random() * 0.012,
                    source[2] + Math.sin(angle) * reach * 0.7],
                [source[0] + Math.cos(angle) * reach * 0.42, peakY - index * 0.007,
                    source[2] + Math.sin(angle) * reach * 0.28 + profile.shearDownwind * 0.08],
            ], [0.034, 0.030 + random() * 0.006, 0.020], {
                density: [0.90, 0.70], detail: config.species === "calvus" ? [0.38, 0.48] : [0.72, 0.89],
                phase: config.species === "calvus" ? [0.34, 0.50] : [0.80, 0.96],
                verticalScale: [1.00, 0.88], role: "source-connected-overshooting-top",
            });
            overshootTrajectoryCount += 1;
        }
    }

    if (profile.anvilBranches > 0) {
        const anvilSource = centerAt(0.805);
        for (let branch = 0; branch < profile.anvilBranches; branch += 1) {
            const across = branch / Math.max(1, profile.anvilBranches - 1) - 0.5;
            const hub = [
                anvilSource[0] + across * profile.anvilCrosswind * 0.42 +
                    Math.sin(branch * 1.73) * 0.014,
                0.842 - Math.abs(across) * 0.018 + random() * 0.010,
                anvilSource[2] + profile.anvilDownwind * 0.30 + random() * 0.018,
            ];
            trajectory([anvilSource, hub], [0.037, 0.030 + random() * 0.007], {
                density: decaying ? 0.54 : 0.82, detail: 0.94, phase: 1,
                verticalScale: 0.56, role: "anvil-source-branch",
            });
            anvilTrajectoryCount += 1;
            for (let child = 0; child < profile.anvilChildren; child += 1) {
                const childAcross = across +
                    (child - (profile.anvilChildren - 1) * 0.5) /
                    Math.max(4, profile.anvilChildren * 3.4);
                const lengthJitter = mix(0.76, 1.04, random());
                const endpoint = [
                    0.49 + childAcross * profile.anvilCrosswind * 1.94 +
                        profile.shearCrosswind * 0.30,
                    0.825 - Math.abs(childAcross) * 0.045 - random() * 0.018,
                    anvilSource[2] + profile.anvilDownwind * lengthJitter,
                ];
                trajectory([
                    hub,
                    [mix(hub[0], endpoint[0], 0.54) + Math.sin((branch + 1) * (child + 1)) * 0.012,
                        mix(hub[1], endpoint[1], 0.46) + random() * 0.012,
                        mix(hub[2], endpoint[2], 0.50)],
                    endpoint,
                ], [0.031, 0.027 + random() * 0.006, 0.021 + random() * 0.005], {
                    density: decaying ? [0.50, 0.34] : [0.76, 0.56],
                    detail: [0.96, 1], phase: 1, verticalScale: [0.46, 0.36],
                    role: "finite-sheared-anvil-child",
                });
                anvilTrajectoryCount += 1;
            }
        }
        const backCount = config.morphologyVariant === "back-sheared-incus" ? 6 : 4;
        for (let index = 0; index < backCount; index += 1) {
            const across = index / Math.max(1, backCount - 1) - 0.5;
            const endpoint = [
                anvilSource[0] + across * profile.anvilCrosswind * 1.25,
                0.82 - Math.abs(across) * 0.035 - random() * 0.012,
                anvilSource[2] - profile.anvilUpwind * mix(0.72, 1.04, random()),
            ];
            trajectory([
                anvilSource,
                [mix(anvilSource[0], endpoint[0], 0.52), 0.848 + random() * 0.012,
                    mix(anvilSource[2], endpoint[2], 0.52)],
                endpoint,
            ], [0.032, 0.027 + random() * 0.006, 0.021 + random() * 0.005], {
                density: decaying ? [0.46, 0.32] : [0.72, 0.52], detail: [0.95, 1],
                phase: 1, verticalScale: [0.48, 0.36], role: "finite-back-shear-anvil-child",
            });
            anvilTrajectoryCount += 1;
        }
    }

    if (decaying) {
        const remnantHub = centerAt(0.70);
        for (let index = 0; index < profile.remnantCount; index += 1) {
            const angle = goldenAngle * index + random() * 0.55;
            const reach = mix(0.045, 0.13, random());
            const startY = mix(0.38, 0.48, random());
            const start = [
                centerAt(startY)[0] + Math.cos(angle) * reach,
                startY,
                centerAt(startY)[2] + Math.sin(angle) * reach * 0.72,
            ];
            trajectory([
                start,
                [mix(start[0], remnantHub[0], 0.42), mix(startY, 0.70, 0.46),
                    mix(start[2], remnantHub[2], 0.38)],
                remnantHub,
            ], [0.026 + random() * 0.010, 0.032 + random() * 0.010, 0.030], {
                density: [0.43, 0.53], detail: [0.76, 0.88], phase: [0.65, 0.91],
                verticalScale: [1.02, 0.88], role: "eroding-upper-column-remnant",
            });
            remnantTrajectoryCount += 1;
        }
    }

    let minimumPrecipitationCoreSeparation = 1;
    for (let index = 0; index < profile.precipitationCount; index += 1) {
        const sourceY = decaying ? 0.69 : mix(0.54, 0.68, index / Math.max(1, profile.precipitationCount - 1));
        const source = centerAt(sourceY);
        const side = index % 2 === 0 ? 1 : -1;
        const separation = mix(0.085, 0.15, random());
        const lowerY = decaying ? mix(0.35, 0.42, random()) : profile.baseY + mix(0.015, 0.075, random());
        const endpoint = [
            centerAt(lowerY)[0] + side * separation,
            lowerY,
            centerAt(lowerY)[2] + 0.11 + index * 0.018,
        ];
        const horizontalSeparation = Math.hypot(
            endpoint[0] - centerAt(lowerY)[0], endpoint[2] - centerAt(lowerY)[2],
        );
        minimumPrecipitationCoreSeparation = Math.min(
            minimumPrecipitationCoreSeparation, horizontalSeparation,
        );
        const loadingHub = [
            source[0] + side * separation * 0.62,
            sourceY - 0.12,
            source[2] + 0.055,
        ];
        trajectory([
            source,
            loadingHub,
            [mix(loadingHub[0], endpoint[0], 0.58), mix(loadingHub[1], lowerY, 0.56),
                mix(loadingHub[2], endpoint[2], 0.58)],
            endpoint,
        ], [0.030, 0.036 + random() * 0.009, 0.030, 0.020], {
            density: decaying ? [0.39, 0.30, 0.22] : [0.62, 0.49, 0.34],
            detail: [0.64, 0.75, 0.84], phase: [0.54, 0.38, 0.18],
            precipitation: decaying ? [0.55, 0.68, 0.58] : [0.58, 0.91, 0.82],
            verticalScale: [0.92, 1.12, 1.24], role: "offset-precipitation-loading-trajectory",
        });
        precipitationTrajectoryCount += 1;
        trajectory([
            loadingHub,
            [loadingHub[0] + side * 0.022, mix(loadingHub[1], lowerY, 0.48), loadingHub[2] + 0.035],
            endpoint,
        ], [0.024, 0.027 + random() * 0.006, 0.019], {
            density: decaying ? [0.29, 0.20] : [0.48, 0.30], detail: [0.74, 0.86],
            phase: [0.46, 0.16], precipitation: [0.72, 0.86], verticalScale: 1.18,
            role: "precipitation-driven-downdraft-support",
        });
        downdraftTrajectoryCount += 1;
    }

    // Negative boundary primitives make entrainment clefts. They never add a
    // stamped positive lobe and stay outside the protected dominant core.
    const cavityCount = decaying ? 14 : Math.min(24, 10 + profile.thermalCount);
    for (let index = 0; index < cavityCount; index += 1) {
        const amount = (index + 0.45) / cavityCount;
        const altitude = decaying ? mix(0.43, 0.82, amount) : mix(profile.baseY + 0.09, 0.79, amount);
        const angle = goldenAngle * index + random() * 0.48;
        const centre = centerAt(altitude);
        const radial = mix(0.075, 0.13, smoothstep(profile.baseY, 0.72, altitude)) +
            random() * 0.025;
        cavities.push({
            center: [centre[0] + Math.cos(angle) * radial, altitude,
                centre[2] + Math.sin(angle) * radial * 0.78],
            radii: [mix(0.032, 0.065, random()), mix(0.040, 0.080, random()),
                mix(0.030, 0.058, random())],
            rotation: angle * 0.37,
            strength: decaying ? mix(0.52, 0.76, random()) : mix(0.32, 0.58, random()),
        });
    }

    const meanRadius = trajectoryRadii.reduce((sum, value) => sum + value, 0) /
        Math.max(1, trajectoryRadii.length);
    const radiusDeviation = Math.sqrt(trajectoryRadii.reduce(
        (sum, value) => sum + (value - meanRadius) ** 2, 0,
    ) / Math.max(1, trajectoryRadii.length));
    const quantizedDirections = new Set(trajectoryAzimuths.map((angle) =>
        Math.round(((angle + Math.PI) / (Math.PI * 2)) * 24) % 24));
    const anvilAsymmetry = profile.anvilBranches > 0
        ? profile.anvilDownwind / Math.max(0.001, profile.anvilUpwind) : 0;

    return {
        kind: "primitive",
        primitives,
        cavities,
        baseY: profile.baseY,
        ownerPoints,
        baseLobeCount: feederTrajectoryCount,
        crownLobeCount: crownTrajectoryCount,
        mergedBodyLobeCount: mergedUpdraftTrajectoryCount,
        evaporatingFlankCount: cavityCount,
        branchSpread: Math.max(profile.anvilCrosswind, 0.18 + profile.cellCount * 0.04),
        hierarchyLevelCount: profile.anvilBranches > 0 ? 6 : 5,
        feederTrajectoryCount,
        mergedUpdraftTrajectoryCount,
        calvusBridgeCount,
        glaciationTransitionCount,
        crownTrajectoryCount,
        anvilTrajectoryCount,
        anvilBranchDepth: profile.anvilBranches > 0 ? 2 : 0,
        anvilAsymmetry,
        overshootTrajectoryCount,
        precipitationTrajectoryCount,
        downdraftTrajectoryCount,
        remnantTrajectoryCount,
        topologyNodeCount,
        topologyEdgeCount,
        sourceConnectedTrajectoryCount,
        trajectoryCount,
        minimumAttachmentRadiusVoxels: Math.min(...trajectoryRadii) * 47,
        trajectoryRadiusCoefficientOfVariation: radiusDeviation / Math.max(1e-6, meanRadius),
        uniqueTrajectoryDirectionFraction: quantizedDirections.size /
            Math.max(1, Math.min(24, trajectoryAzimuths.length)),
        minimumPrecipitationCoreSeparation: profile.precipitationCount > 0
            ? minimumPrecipitationCoreSeparation : 0,
        legacyEllipsoidCapCount: 0,
        legacyEllipsoidPlateCount: 0,
        deepConvectionProfile: {
            organization: profile.organization,
            environment: profile.environment,
            lifecycle: decaying ? "decaying" : config.lifecycle,
            species: config.species,
            topology: "finite-source-connected-advected-thermal-graph",
            coordinateMapping: "atlas-x=crosswind, atlas-y=altitude, atlas-z=downwind",
        },
        boundaryModel: "source-connected-advected-thermal-graph",
        detailBase: config.detailBase,
        edgeNoise: decaying ? 0.025 : 0.019,
        interiorNoise: decaying ? 0.009 : 0.0045,
        fragmentary: false,
        densityEdgeLow: -0.005,
        densityEdgeHigh: decaying ? 0.019 : 0.022,
        warpStrength: decaying ? 0.018 : 0.012,
        warpAnisotropy: [1, 0.68, 1],
    };
};

const buildIceStreamerModel = (config, seed) => {
    const random = makeRandom(seed);
    const primitives = [];
    const cavities = [];
    const ownerPoints = [];
    let groupCount = 0;
    let streamlineCount = 0;
    let commonBaseCount = 0;
    let secondaryLobeCount = 0;
    let commaHeadCount = 0;
    let taperedFallstreakCount = 0;
    let uncinusHookCount = 0;
    let uncinusConnectedHeadFiberCount = 0;
    let uncinusConnectedFallstreakCount = 0;
    const fallstreakTaperRatios = [];
    const fallstreakDensityTaperRatios = [];
    const fallstreakDirections = [];
    const fallstreakLengths = [];
    const fallstreakVerticalDrops = [];
    const hookArcLengths = [];
    let fibratusPrimaryFibreCount = 0;
    let fibratusSecondaryFibreCount = 0;
    let fibratusSweptC2Count = 0;
    let fibratusLegacyCapsuleCount = 0;
    const fibratusTerminalRadiusRatios = [];
    const fibratusHeadings = [];
    const fibratusLengths = [];
    const fibratusExcessCurvatures = [];
    const fibratusStartAltitudes = [];
    const fibratusStartDepths = [];
    let fibratusAnatomyId = null;
    let fibratusSourceClusterCount = 0;
    let fibratusSplitSourceCount = 0;
    const addTrail = (points, radius, options = {}) => {
        // A canonical 48^3 volume cannot safely carry a one-sample fiber:
        // trilinear reconstruction and minification would erase it before the
        // runtime's boundary up-resolution could act. Keep a conservative
        // two-sample macro envelope; G marks it as fibrous so the renderer may
        // narrow and split that envelope at display resolution.
        const thinStreamer = config.variant === "fibratus" || config.variant === "uncinus";
        const uncinusHook = options.role === "uncinus-hook";
        const uncinusHeadFiber = options.role === "uncinus-head-fiber";
        const uncinusFallstreak = options.role === "uncinus-fallstreak";
        const minimumEnvelope = uncinusHook
            ? 0.036
            : uncinusHeadFiber
                ? 0.031
            : uncinusFallstreak
                ? 0.035
                : config.variant === "fibratus" ? 0.020 : 0.022;
        const reconstructibleRadius = Math.max(minimumEnvelope, radius);
        const polylineLength = points.slice(1).reduce((length, point, index) => {
            const previous = points[index];
            return length + Math.hypot(
                point[0] - previous[0],
                point[1] - previous[1],
                point[2] - previous[2],
            );
        }, 0);
        if (uncinusHook) {
            uncinusHookCount += 1;
            hookArcLengths.push(polylineLength);
        }
        if (uncinusHeadFiber && options.attachedToHook) {
            uncinusConnectedHeadFiberCount += 1;
        }
        if (uncinusFallstreak) {
            const terminalRadius = Math.max(
                options.minimumRadius ?? 0.010,
                reconstructibleRadius * (options.endTaper ?? 0.52),
            );
            fallstreakTaperRatios.push(terminalRadius / reconstructibleRadius);
            fallstreakDensityTaperRatios.push(options.densityEndTaper ?? 1);
            const start = points[0];
            const end = points.at(-1);
            fallstreakDirections.push(Math.atan2(end[0] - start[0], end[2] - start[2]));
            fallstreakLengths.push(polylineLength);
            fallstreakVerticalDrops.push(Math.max(0, start[1] - end[1]));
            if (options.attachedToHook) uncinusConnectedFallstreakCount += 1;
        }
        const minimumRadius = options.minimumRadius ?? (
            uncinusFallstreak ? 0.018 : thinStreamer ? 0.019 : 0.017
        );
        const radii = points.map((_, index) => {
            const amount = index / Math.max(1, points.length - 1);
            const taper = mix(
                1,
                options.endTaper ?? 0.52,
                Math.pow(amount, options.taperPower ?? 1),
            );
            const pulse = 1 + Math.sin(amount * Math.PI * 3.7 + 0.6) *
                (options.radiusPulse ?? 0) * Math.sin(amount * Math.PI);
            return Math.max(minimumRadius, reconstructibleRadius * taper * pulse);
        });
        addSweptC2Support(primitives, points, radii, {
            subdivisions: options.subdivisions ?? 5,
            detail: options.detail ?? 0.94,
            phase: 1,
            density: options.density ?? 1,
            verticalScale: Math.max(
                uncinusFallstreak
                    ? 0.64
                    : uncinusHeadFiber ? 0.66 : thinStreamer ? 0.72 : 0.64,
                options.verticalScale ?? 0.64,
            ),
            precipitation: options.precipitation ?? 0,
            densityEndTaper:
                options.supportDensityEndTaper ?? options.densityEndTaper ?? 1,
            densityTaperPower:
                options.densityTaperPower ?? options.taperPower ?? 1,
            role: options.role ?? "ice-sedimentation-trail",
            hierarchyLevel: options.hierarchyLevel ?? 2,
            lifecycleStage: options.lifecycleStage ?? "mature",
            sourceConnected: options.sourceConnected ?? true,
        });
        streamlineCount += 1;
    };

    const makeShearedTrail = ({
        start,
        downwind,
        fall,
        crosswind,
        curl,
        segments = 9,
    }) => {
        const points = [];
        const wavePhase = random() * Math.PI * 2;
        const waveCount = mix(0.55, 1.35, random());
        const shearCurve = mix(-0.045, 0.055, random());
        for (let segment = 0; segment <= segments; segment += 1) {
            const t = segment / segments;
            const smoothCurl = Math.sin(t * Math.PI * waveCount + wavePhase) - Math.sin(wavePhase);
            points.push([
                start[0] + crosswind * t + smoothCurl * curl + shearCurve * t * t,
                start[1] - fall * t + Math.sin(t * Math.PI) * curl * 0.28,
                start[2] + downwind * t,
            ]);
        }
        return points;
    };

    if (config.variant === "fibratus") {
        // Fibratus is an aperiodic population of distinct fine ice trajectories.
        // It is not a bundle of nearly coincident capsule chains: those chains
        // merge after 48^3 reconstruction into wide, parallel brush strokes.
        //
        // Each primary fibre follows a C2-continuous differential-shear path.
        // The family shares one synoptic wind direction, but unequal source
        // altitude, particle fall speed, heading, curvature phase, lifetime and
        // terminal taper produce real three-dimensional separation. Short
        // subordinate wisps occupy a second hierarchy without touching the
        // primary support. This follows the observed generating-region /
        // sedimentation model while retaining the WMO fibratus discriminator:
        // fine filaments with neither hooks nor terminal tufts.
        const anatomy = config.fibratusAnatomy ?? "irregular-curved";
        const anatomyProfiles = {
            "irregular-curved": {
                primaryCount: 7,
                secondaryCount: 5,
                sourceSites: null,
                sourceAltitudeMotif: [0.52, 0.78, 0.64, 0.84, 0.45, 0.71, 0.58],
                sedimentationMotif: [0.045, 0.10, 0.065, 0.12, 0.035, 0.085, 0.055],
                lengthMotif: [0.38, 0.82, 0.52, 0.96, 0.24, 0.67, 0.44],
                sourceX: [0.25, 0.75],
                sourceDepth: [0.07, 0.26],
                headingFan: 0.40,
                headingJitter: 0.11,
                length: [0.30, 0.60],
                bow: [-0.090, 0.096],
                secondaryBow: [-0.040, 0.046],
                shearTurn: [-0.12, 0.13],
                sourceClusters: 1,
                splitSources: 2,
                secondaryParentOrder: [0, 3, 6, 2, 5],
                secondaryLength: [0.14, 0.31],
                secondarySeparation: [0.050, 0.094],
                secondaryTurn: [-0.060, 0.068],
            },
            "split-source": {
                primaryCount: 9,
                secondaryCount: 4,
                // Two finite humidity source swaths with a dry central lane.
                // They are not mirrored: cardinality, altitude, heading and
                // residence time differ across the two source histories.
                sourceSites: [
                    [0.08, 0.14], [0.17, 0.31], [0.29, 0.08], [0.34, 0.46],
                    [0.64, 0.62], [0.72, 0.86], [0.81, 0.53], [0.91, 0.76],
                    [0.76, 0.28],
                ],
                sourceAltitudeMotif: [0.81, 0.63, 0.48, 0.72, 0.55, 0.86, 0.67, 0.43, 0.76],
                sedimentationMotif: [0.11, 0.055, 0.035, 0.085, 0.045, 0.13, 0.070, 0.025, 0.095],
                lengthMotif: [0.91, 0.36, 0.62, 0.24, 0.78, 0.47, 0.98, 0.31, 0.69],
                sourceX: [0.20, 0.80],
                sourceDepth: [0.06, 0.30],
                headingFan: 0.20,
                headingJitter: 0.055,
                length: [0.25, 0.57],
                bow: [-0.048, 0.052],
                secondaryBow: [-0.020, 0.024],
                shearTurn: [-0.060, 0.068],
                sourceClusters: 2,
                splitSources: 4,
                secondaryParentOrder: [0, 5, 2, 7],
                secondaryLength: [0.12, 0.26],
                secondarySeparation: [0.058, 0.102],
                secondaryTurn: [-0.044, 0.052],
            },
            "depth-shear": {
                primaryCount: 8,
                secondaryCount: 7,
                sourceSites: [
                    [0.16, 0.08], [0.36, 0.78], [0.58, 0.34], [0.82, 0.91],
                    [0.25, 0.53], [0.69, 0.12], [0.45, 0.96], [0.88, 0.44],
                ],
                sourceAltitudeMotif: [0.86, 0.44, 0.73, 0.58, 0.81, 0.50, 0.66, 0.76],
                sedimentationMotif: [0.16, 0.030, 0.11, 0.060, 0.14, 0.045, 0.090, 0.12],
                lengthMotif: [0.98, 0.22, 0.72, 0.41, 0.88, 0.31, 0.59, 0.79],
                sourceX: [0.29, 0.69],
                sourceDepth: [0.05, 0.28],
                headingFan: 0.36,
                headingJitter: 0.085,
                length: [0.23, 0.56],
                bow: [-0.085, 0.090],
                secondaryBow: [-0.040, 0.044],
                shearTurn: [-0.11, 0.12],
                sourceClusters: 3,
                splitSources: 5,
                secondaryParentOrder: [0, 4, 2, 6, 1, 7, 3],
                secondaryLength: [0.11, 0.35],
                secondarySeparation: [0.047, 0.11],
                secondaryTurn: [-0.095, 0.10],
            },
        };
        const profile = anatomyProfiles[anatomy];
        if (!profile) throw new Error(`Unknown fibratus anatomy ${anatomy}`);
        const primaryCount = profile.primaryCount;
        const sourceSites = profile.sourceSites ??
            poissonPoints(random, primaryCount, 0.15, 0.10);
        const synopticHeading = mix(-0.10, 0.10, random());
        const sourceAltitudeMotif = profile.sourceAltitudeMotif;
        const sedimentationMotif = profile.sedimentationMotif;
        fibratusAnatomyId = anatomy;
        fibratusSourceClusterCount = profile.sourceClusters;
        fibratusSplitSourceCount = profile.splitSources;
        const primaryPaths = [];
        const measurePath = (points) => {
            let length = 0;
            for (let index = 1; index < points.length; index += 1) {
                length += Math.hypot(
                    points[index][0] - points[index - 1][0],
                    points[index][1] - points[index - 1][1],
                    points[index][2] - points[index - 1][2],
                );
            }
            const chord = Math.hypot(
                points.at(-1)[0] - points[0][0],
                points.at(-1)[1] - points[0][1],
                points.at(-1)[2] - points[0][2],
            );
            return { length, excessCurvature: length / Math.max(1e-6, chord) - 1 };
        };
        const addFibratusSweep = (points, radii, options) => {
            addSweptC2Support(primitives, points, radii, {
                subdivisions: 5,
                verticalScale: options.verticalScale,
                density: options.density,
                detail: options.detail ?? 0.96,
                phase: 1,
                role: options.role,
                hierarchyLevel: options.hierarchyLevel,
                lifecycleStage: options.lifecycleStage,
                sourceConnected: false,
            });
            fibratusSweptC2Count += 1;
            streamlineCount += 1;
            const path = measurePath(points);
            fibratusLengths.push(path.length);
            fibratusExcessCurvatures.push(path.excessCurvature);
            fibratusTerminalRadiusRatios.push(
                radii.at(-1) / Math.max(1e-6, radii[0]),
            );
            fibratusHeadings.push(Math.atan2(
                points.at(-1)[0] - points[0][0],
                points.at(-1)[2] - points[0][2],
            ));
        };

        for (let fibre = 0; fibre < sourceSites.length; fibre += 1) {
            const [siteX, siteDepth] = sourceSites[fibre];
            const rank = fibre / Math.max(1, sourceSites.length - 1);
            // The local heading changes smoothly across the moisture source.
            // This retains one synoptic wind field while gently fanning the
            // fibres apart instead of either crossing into a plate or sharing
            // exact parallel edges.
            const splitSourceBias = anatomy === "split-source"
                ? (fibre < 4 ? -0.13 : fibre < 8 ? 0.15 : -0.02)
                : 0;
            const depthShearBias = anatomy === "depth-shear"
                ? mix(-0.11, 0.12, siteDepth)
                : 0;
            const headingOffset = mix(
                -profile.headingFan,
                profile.headingFan,
                siteX,
            ) + splitSourceBias + depthShearBias +
                mix(-profile.headingJitter, profile.headingJitter, random());
            const heading = synopticHeading + headingOffset;
            const forward = [Math.sin(heading), Math.cos(heading)];
            const right = [Math.cos(heading), -Math.sin(heading)];
            const start = anatomy === "irregular-curved" ? [
                mix(0.25, 0.75, siteX),
                sourceAltitudeMotif[fibre] + mix(-0.014, 0.014, random()),
                mix(0.07, 0.26,
                    (siteDepth * 0.71 + fibre * 0.173 + random() * 0.17) % 1),
            ] : [
                mix(profile.sourceX[0], profile.sourceX[1], siteX),
                sourceAltitudeMotif[fibre] + mix(-0.014, 0.014, random()),
                mix(profile.sourceDepth[0], profile.sourceDepth[1], siteDepth) +
                    mix(-0.010, 0.010, random()),
            ];
            const length = anatomy === "irregular-curved"
                ? mix(0.30, 0.60, rank * 0.43 + random() * 0.57)
                : mix(
                    profile.length[0],
                    profile.length[1],
                    clamp(profile.lengthMotif[fibre] * 0.82 + random() * 0.18),
                );
            const fall = sedimentationMotif[fibre] *
                mix(0.88, 1.12, random());
            const bow = mix(profile.bow[0], profile.bow[1], random());
            const secondaryBow = mix(
                profile.secondaryBow[0],
                profile.secondaryBow[1],
                random(),
            );
            const phase = random() * Math.PI * 2;
            const shearTurn = mix(
                profile.shearTurn[0],
                profile.shearTurn[1],
                random(),
            );
            const points = [];
            const knotCount = 7;
            for (let knot = 0; knot < knotCount; knot += 1) {
                const amount = knot / (knotCount - 1);
                // Subtract the phase origin so the path begins exactly at its
                // physical source rather than jumping onto an offset curve.
                const lateral = Math.sin(amount * Math.PI) * bow +
                    (Math.sin(amount * Math.PI * 2 + phase) - Math.sin(phase)) *
                        secondaryBow * amount +
                    shearTurn * amount * amount;
                const along = length * amount *
                    mix(0.96, 1.04, Math.sin(amount * Math.PI));
                points.push([
                    start[0] + forward[0] * along + right[0] * lateral,
                    start[1] - fall * amount ** mix(1.10, 1.52, random()) +
                        Math.sin(amount * Math.PI) * mix(-0.012, 0.020, random()),
                    start[2] + forward[1] * along + right[1] * lateral,
                ]);
            }
            // A single separated fibre may be two to three native voxels
            // across; visual fineness comes from its large aspect ratio and
            // isolated support, not from sub-voxel dust that disappears under
            // the production reconstruction footprint.
            const sourceRadius = anatomy === "depth-shear"
                ? mix(0.025, 0.033, random())
                : anatomy === "split-source"
                    ? mix(0.023, 0.031, random())
                    : mix(0.024, 0.032, random());
            const terminalRatio = anatomy === "irregular-curved"
                ? mix(0.34, 0.62, random())
                : anatomy === "depth-shear"
                ? mix(0.32, 0.58, random())
                : mix(0.34, 0.60, random());
            const radiusPulse = anatomy === "depth-shear"
                ? mix(0.12, 0.24, random())
                : mix(0.07, 0.19, random());
            const radii = points.map((_, knot) => {
                const amount = knot / (points.length - 1);
                const lifecycleTaper = mix(
                    1,
                    terminalRatio,
                    amount ** mix(0.82, 1.28, random()),
                );
                return Math.max(
                    0.012,
                    sourceRadius * lifecycleTaper *
                        (1 + Math.sin(amount * Math.PI * 2.3 + phase) *
                            radiusPulse * Math.sin(amount * Math.PI)),
                );
            });
            addFibratusSweep(points, radii, {
                verticalScale: mix(0.76, 0.94, random()),
                density: mix(0.72, 0.92, random()),
                hierarchyLevel: 1,
                lifecycleStage: fibre % 4 === 0 ? "decaying" : "mature",
                role: "fibratus-primary-differential-shear-fibre",
            });
            primaryPaths.push({ points, radii, heading, fibre });
            ownerPoints.push([start[0], start[2]]);
            fibratusStartAltitudes.push(start[1]);
            fibratusStartDepths.push(start[2]);
            fibratusPrimaryFibreCount += 1;
            groupCount += 1;
        }

        // A shorter, thinner hierarchy of detached shreds creates the fine
        // filament family visible around a mature fibre. They follow the same
        // local shear tensor but begin outside the parent's reconstructed
        // radius, so clear air remains physical negative space rather than a
        // noise-cut ribbon.
        const secondaryCount = profile.secondaryCount;
        const secondaryParentOrder = profile.secondaryParentOrder;
        for (let wisp = 0; wisp < secondaryCount; wisp += 1) {
            const parent = primaryPaths[
                secondaryParentOrder[wisp] % primaryPaths.length
            ];
            const anchorIndex = 1 + Math.floor(random() * 3);
            const anchor = parent.points[anchorIndex];
            const forward = [Math.sin(parent.heading), Math.cos(parent.heading)];
            const right = [Math.cos(parent.heading), -Math.sin(parent.heading)];
            const side = random() < 0.5 ? -1 : 1;
            const separation = mix(
                profile.secondarySeparation[0],
                profile.secondarySeparation[1],
                random(),
            ) * side;
            const start = [
                anchor[0] + right[0] * separation,
                anchor[1] + mix(-0.046, 0.052, random()),
                anchor[2] + right[1] * separation + mix(-0.025, 0.034, random()),
            ];
            const length = mix(
                profile.secondaryLength[0],
                profile.secondaryLength[1],
                random(),
            );
            const fall = anatomy === "depth-shear"
                ? mix(0.025, 0.14, random())
                : mix(0.020, 0.095, random());
            const turn = mix(
                profile.secondaryTurn[0],
                profile.secondaryTurn[1],
                random(),
            );
            const points = [];
            for (let knot = 0; knot < 5; knot += 1) {
                const amount = knot / 4;
                const lateral = Math.sin(amount * Math.PI) * turn +
                    side * amount * amount * mix(0.012, 0.035, random());
                points.push([
                    start[0] + forward[0] * length * amount + right[0] * lateral,
                    start[1] - fall * amount ** 1.24 +
                        Math.sin(amount * Math.PI) * mix(-0.009, 0.013, random()),
                    start[2] + forward[1] * length * amount + right[1] * lateral,
                ]);
            }
            const radius = anatomy === "depth-shear"
                ? mix(0.021, 0.026, random())
                : mix(0.019, 0.024, random());
            const terminalRatio = mix(0.28, 0.52, random());
            const radii = points.map((_, knot) => {
                const amount = knot / (points.length - 1);
                return Math.max(0.010, radius * mix(1, terminalRatio, amount ** 0.94));
            });
            addFibratusSweep(points, radii, {
                verticalScale: mix(0.68, 0.86, random()),
                density: mix(0.57, 0.78, random()),
                hierarchyLevel: 2 + (wisp % 3),
                lifecycleStage: "decaying",
                role: "fibratus-detached-sublimating-wisp",
            });
            fibratusSecondaryFibreCount += 1;
        }
    } else if (config.variant === "uncinus") {
        // WMO uncinus is a fibrous mare's tail: a hook or tuft at the upper
        // generator and a long, continuously attached ice-crystal fallstreak.
        // Two unequal members establish owner-scale variety without baking a
        // field, comb, or repeated stamp into the canonical macro volume.
        const headings = [mix(-0.70, -0.28, random()), mix(0.28, 0.72, random())];
        for (let group = 0; group < headings.length; group += 1) {
            const heading = headings[group];
            const forward = [Math.sin(heading), Math.cos(heading)];
            const right = [Math.cos(heading), -Math.sin(heading)];
            const memberScale = group === 0 ? 1 : mix(0.72, 0.86, random());
            const x0 = group === 0
                // Leave the advected side of the dominant mare's tail inside
                // its complete owner. The hook/fallstreak keeps its physical
                // span; this is an owner-space recentering, not a clipped
                // density fade or a shortened virga.
                ? mix(0.38, 0.46, random())
                : mix(0.60, 0.68, random());
            const y0 = mix(group === 0 ? 0.73 : 0.66, group === 0 ? 0.81 : 0.75, random());
            const z0 = mix(group === 0 ? 0.12 : 0.20, group === 0 ? 0.21 : 0.30, random());
            const hook = [];
            const hookDirection = group === 0 ? -1 : 1;
            const hookRadius = mix(0.050, 0.070, random()) * memberScale;
            const hookDepth = hookRadius * mix(0.62, 1.12, random());
            const hookVertical = hookRadius * mix(0.84, 1.05, random());
            for (let segment = 0; segment <= 9; segment += 1) {
                const t = segment / 9;
                const angle = mix(1.28, -1.18, t);
                const radial = Math.cos(angle) * hookRadius * hookDirection;
                const along = t * hookDepth;
                hook.push([
                    x0 + right[0] * radial + forward[0] * along,
                    y0 + Math.sin(angle) * hookVertical,
                    z0 + right[1] * radial + forward[1] * along,
                ]);
            }
            addTrail(hook, mix(0.016, 0.022, random()) * memberScale, {
                density: mix(0.76, 0.90, random()),
                verticalScale: 0.62,
                endTaper: mix(0.48, 0.62, random()),
                taperPower: 1.18,
                radiusPulse: 0.05,
                role: "uncinus-hook",
            });

            // The head is a fan of connected curved fibres, never a cluster of
            // spherical lobes. Every branch begins on the upper hook and then
            // curls along a distinct shear trajectory before sublimating.
            // Unequal fan cardinality prevents the paired members reading as
            // cloned comma stamps while preserving the same total eight
            // reconstructible head fibres in the canonical proxy.
            const headFiberCount = group === 0 ? 5 : 3;
            for (let fiber = 0; fiber < headFiberCount; fiber += 1) {
                const attachmentIndex = Math.min(4, 1 + fiber);
                const attachment = hook[attachmentIndex];
                const side = fiber % 2 === 0 ? -1 : 1;
                const branchLength = hookRadius * mix(0.72, 1.36, random());
                const lift = hookRadius * mix(-0.08, 0.42, random());
                const branchPoints = [];
                for (let segment = 0; segment <= 4; segment += 1) {
                    const t = segment / 4;
                    const lateral = side * branchLength * t;
                    const bow = Math.sin(t * Math.PI) * hookRadius * mix(0.12, 0.34, random());
                    branchPoints.push([
                        attachment[0] + right[0] * lateral + forward[0] * bow,
                        attachment[1] + lift * t - hookRadius * 0.18 * t * t,
                        attachment[2] + right[1] * lateral + forward[1] * bow,
                    ]);
                }
                addTrail(branchPoints, hookRadius * mix(0.18, 0.27, random()), {
                    attachedToHook: true,
                    density: mix(0.54, 0.76, random()),
                    verticalScale: 0.52,
                    endTaper: mix(0.16, 0.34, random()),
                    taperPower: mix(0.82, 1.32, random()),
                    densityEndTaper: mix(0.22, 0.42, random()),
                    densityTaperPower: 1.1,
                    minimumRadius: 0.019,
                    role: "uncinus-head-fiber",
                });
                secondaryLobeCount += 1;
                commaHeadCount += 1;
            }

            const tailCount = 1;
            for (let tail = 0; tail < tailCount; tail += 1) {
                const tailHeading = heading + (group === 0
                    ? tail === 0 ? -mix(0.08, 0.18, random()) : mix(0.18, 0.32, random())
                    : mix(-0.10, 0.12, random()));
                const tailForward = [Math.sin(tailHeading), Math.cos(tailHeading)];
                const tailRight = [Math.cos(tailHeading), -Math.sin(tailHeading)];
                const downwind = group === 0
                    ? tail === 0 ? mix(0.38, 0.49, random()) : mix(0.30, 0.40, random())
                    : mix(0.26, 0.34, random());
                const fall = group === 0
                    ? tail === 0 ? mix(0.38, 0.49, random()) : mix(0.31, 0.42, random())
                    : mix(0.25, 0.34, random());
                const crosswind = (tail - (tailCount - 1) * 0.5) * mix(0.05, 0.11, random());
                const curl = mix(0.018, 0.040, random());
                const wavePhase = random() * Math.PI * 2;
                const waveCount = mix(0.58, 1.18, random());
                const shearCurve = mix(-0.040, 0.052, random());
                const segments = group === 0 ? 14 : 12;
                const trail = [];
                for (let segment = 0; segment <= segments; segment += 1) {
                    const t = segment / segments;
                    const smoothCurl = Math.sin(t * Math.PI * waveCount + wavePhase) -
                        Math.sin(wavePhase);
                    const lateral = crosswind * t + smoothCurl * curl + shearCurve * t * t;
                    trail.push([
                        hook.at(-1)[0] + tailForward[0] * downwind * t + tailRight[0] * lateral,
                        hook.at(-1)[1] - fall * t + Math.sin(t * Math.PI) * curl * 0.22,
                        hook.at(-1)[2] + tailForward[1] * downwind * t + tailRight[1] * lateral,
                    ]);
                }
                // The fallstreak begins at the final hook sample.  Both are
                // radius-varying C2 sweeps generated on a 2x source lattice,
                // so their common endpoint is a real connected ice volume;
                // no broad diagonal capsule or chain of oval bridge stamps is
                // required to survive the production reconstruction.
                addTrail(trail, mix(0.018, 0.022, random()) * memberScale, {
                    attachedToHook: true,
                    precipitation: 0.72,
                    verticalScale: 0.52,
                    density: mix(0.54, 0.72, random()),
                    endTaper: mix(0.08, 0.16, random()),
                    taperPower: mix(0.68, 0.92, random()),
                    radiusPulse: mix(0.02, 0.07, random()),
                    densityEndTaper: mix(0.14, 0.22, random()),
                    supportDensityEndTaper: mix(0.42, 0.56, random()),
                    densityTaperPower: mix(0.74, 1.04, random()),
                    minimumRadius: 0.018,
                    role: "uncinus-fallstreak",
                });
                taperedFallstreakCount += 1;
            }
            groupCount += 1;
        }
    } else if (config.variant === "spissatus") {
        // Spissatus is a finite moisture source whose condensate is an
        // excursion set of a 3-D lognormal IWC field. The broad envelope is
        // deliberately only a mesoscale prior; layer shear, height-dependent
        // spectral anisotropy, sedimenting/fallstreak displacement, and
        // ridged fibrous structure determine the natural boundary.
        const sourceSites = [
            [-0.64, -0.34, -0.54],
            [-0.28, 0.20, 0.18],
            [0.08, -0.46, -0.08],
            [0.38, 0.34, 0.32],
            [0.72, -0.02, -0.22],
            [-0.02, 0.68, 0.46],
        ].map(([x, z, y]) => [
            x + mix(-0.055, 0.055, random()),
            z + mix(-0.055, 0.055, random()),
            y + mix(-0.06, 0.06, random()),
        ]);
        const layers = [
            {
                height: -0.72,
                thickness: 0.30,
                shear: [0.30, 0.54],
                anisotropy: [1.14, 0.86, 0.76],
                fallstreakWeight: 0.92,
                coherence: 0.28,
            },
            {
                height: -0.34,
                thickness: 0.34,
                shear: [-0.22, 0.37],
                anisotropy: [1.06, 0.92, 0.84],
                fallstreakWeight: 0.74,
                coherence: 0.44,
            },
            {
                height: 0.02,
                thickness: 0.36,
                shear: [0.42, -0.18],
                anisotropy: [0.94, 1.00, 0.96],
                fallstreakWeight: 0.48,
                coherence: 0.62,
            },
            {
                height: 0.38,
                thickness: 0.32,
                shear: [-0.36, -0.42],
                anisotropy: [0.82, 1.10, 1.14],
                fallstreakWeight: 0.32,
                coherence: 0.54,
            },
            {
                height: 0.72,
                thickness: 0.28,
                shear: [0.24, -0.58],
                anisotropy: [0.72, 1.20, 1.32],
                fallstreakWeight: 0.18,
                coherence: 0.34,
            },
        ];
        const center = [
            0.50 + mix(-0.018, 0.018, random()),
            0.56 + mix(-0.014, 0.014, random()),
            0.50 + mix(-0.018, 0.018, random()),
        ];
        const radii = [
            0.425 * mix(0.96, 1.04, random()),
            0.285 * mix(0.95, 1.06, random()),
            0.355 * mix(0.95, 1.05, random()),
        ];
        const rotation = mix(-0.48, 0.48, random());
        const shear = [
            mix(-0.12, 0.12, random()),
            mix(-0.14, 0.14, random()),
        ];
        const fallstreakShear = [
            mix(-0.08, 0.08, random()),
            mix(0.18, 0.34, random()),
        ];
        addSpissatusStochasticField(primitives, {
            center,
            radii,
            rotation,
            sourceSites,
            layers,
            shear,
            fallstreakShear,
            spectrum: {
                broad: [1.30, 0.74, 1.88],
                mesoscale: [3.65, 1.55, 5.60],
                fine: [4.8, 1.8, 3.1],
            },
            sigma: 1.34,
            supportVarianceScale: 1.85,
            supportMeanOffset: 0.010,
            supportVarianceReference: 0.019,
            excursionThreshold: 1.02,
            excursionScale: 0.39,
            envelopeScale: 0.23,
            envelopeWarpScale: 2,
            smoothing: 0.004,
            density: mix(0.93, 1.0, random()),
            detail: mix(0.78, 0.88, random()),
            phase: 1,
            role: "spissatus-lognormal-sheared-source-field",
            hierarchyLevel: 4,
        });
        ownerPoints.push(...sourceSites.map(([x, z]) => [
            center[0] + x * radii[0] * 0.68,
            center[2] + z * radii[2] * 0.68,
        ]));
        const latentSummary = summarizeSpissatusLatentField(
            primitives.at(-1),
            seed,
        );
        groupCount = 1;
        commonBaseCount = 0;
        secondaryLobeCount = sourceSites.length;
        return {
            kind: "primitive",
            primitives,
            cavities,
            ownerPoints,
            groupCount,
            commonBaseCount,
            secondaryLobeCount,
            sourceFieldCount: 1,
            sourceLayerCount: layers.length,
            sourceSiteCount: sourceSites.length,
            sourceEnvelopePrior: "finite-mesoscale-humidity-envelope",
            sourceIwcDistribution: "lognormal-multiscale-fractal",
            sourceSpectrum: "height-dependent-anisotropic-shear-spectrum",
            sourceFallstreakOrganization: "height-dependent-sedimentation-shear-displacement",
            sourceFibrousOrganization: "ridged-downwind-fibre-modulation",
            sourceShearDisplacement: Math.hypot(...shear) +
                Math.hypot(...fallstreakShear),
            sourceExcursionThreshold: 1.02,
            sourceLognormalSigma: 1.34,
            sourceLatentStandardDeviationTarget: Math.sqrt(0.019),
            sourceEnvelopeWarpScale: 2,
            sourceLatentMean: latentSummary.latentMean,
            sourceLatentVariance: latentSummary.latentVariance,
            sourceLatentSkew: latentSummary.latentSkew,
            sourceIwcMean: latentSummary.iwcMean,
            sourceIwcP95: latentSummary.iwcP95,
            sourceIwcP99: latentSummary.iwcP99,
            sourceIwcSaturationFraction: latentSummary.iwcSaturationFraction,
            detailBase: 0.82,
            edgeNoise: 0.004,
            interiorNoise: 0.004,
            cavityInteriorGain: 1,
            densityEdgeHigh: 0.016,
            warpStrength: 0.004,
            warpAnisotropy: [1, 0.72, 1],
            hierarchyLevelCount: layers.length,
            boundaryModel:
                "finite-envelope-prior-3d-lognormal-fractal-iwc-excursion",
         };

    } else if (config.variant === "floccus") {
        // Each floccus member is one scalloped 3-D tuft with a ragged lower
        // surface, not a pile of smooth oval lobes.  Members remain detached;
        // their fallstreaks begin inside the tuft and therefore preserve a
        // causal generating-region/sedimentation relationship.
        const centers = poissonPoints(random, 7, 0.20, 0.14);
        for (let group = 0; group < centers.length; group += 1) {
            const cx = centers[group][0];
            const cz = centers[group][1];
            const baseAltitude = mix(0.54, 0.76, random());
            const radius = mix(0.048, 0.075, random());
            const crownHeight = radius * mix(1.15, 2.05, random());
            const undersideDepth = radius * mix(0.46, 0.92, random());
            const mode = (order, minimum, maximum) => ({
                order,
                amplitude: mix(minimum, maximum, random()) *
                    (random() < 0.5 ? -1 : 1),
                phase: random() * Math.PI * 2,
            });
            addIceTuftSurface(primitives, {
                center: [cx, baseAltitude, cz],
                radii: [
                    radius * mix(0.82, 1.22, random()),
                    crownHeight,
                    radius * mix(0.78, 1.18, random()),
                ],
                rotation: random() * Math.PI,
                baseAltitude,
                crownHeight,
                undersideDepth,
                planModes: [
                    mode(2, 0.04, 0.10),
                    mode(3, 0.05, 0.13),
                    mode(5, 0.025, 0.08),
                ],
                crownModes: [
                    mode(3, 0.08, 0.18),
                    mode(5, 0.04, 0.11),
                    mode(7, 0.02, 0.06),
                ],
                undersideModes: [
                    mode(2, 0.08, 0.18),
                    mode(4, 0.04, 0.12),
                ],
                crownExponent: mix(0.44, 0.72, random()),
                tilt: [mix(-0.16, 0.16, random()), mix(-0.14, 0.14, random())],
                density: mix(0.82, 0.98, random()),
                detail: mix(0.76, 0.90, random()),
                precipitation: 0.18,
                role: "floccus-scalloped-ragged-ice-tuft",
            });
            secondaryLobeCount += 1;
            ownerPoints.push([cx, cz]);
            cavities.push({
                center: [
                    cx + mix(-0.35, 0.35, random()) * radius,
                    baseAltitude - undersideDepth * mix(0.20, 0.52, random()),
                    cz + mix(-0.32, 0.32, random()) * radius,
                ],
                radii: [
                    radius * mix(0.30, 0.48, random()),
                    radius * mix(0.18, 0.30, random()),
                    radius * mix(0.28, 0.44, random()),
                ],
                rotation: random() * Math.PI,
                strength: mix(0.62, 0.84, random()),
            });
            const tailCount = group % 3 === 0 ? 2 : 1;
            for (let tail = 0; tail < tailCount; tail += 1) {
                const heading = mix(-0.42, 0.42, random()) +
                    (cz > 0.54 ? Math.PI : 0);
                const forward = [Math.sin(heading), Math.cos(heading)];
                const right = [Math.cos(heading), -Math.sin(heading)];
                const start = [
                    cx + (tail - (tailCount - 1) * 0.5) * radius * 0.26,
                    baseAltitude - undersideDepth * 0.22,
                    cz,
                ];
                const length = mix(0.10, 0.18, random());
                const fall = mix(0.12, 0.22, random());
                const points = [];
                for (let knot = 0; knot <= 7; knot += 1) {
                    const amount = knot / 7;
                    const curl = Math.sin(amount * Math.PI) *
                        mix(-0.020, 0.020, random());
                    points.push([
                        start[0] + forward[0] * length * amount + right[0] * curl,
                        start[1] - fall * amount ** 1.12,
                        start[2] + forward[1] * length * amount + right[1] * curl,
                    ]);
                }
                addTrail(points, radius * mix(0.20, 0.32, random()), {
                    precipitation: 0.72,
                    verticalScale: 0.52,
                    density: mix(0.50, 0.70, random()),
                    endTaper: mix(0.10, 0.22, random()),
                    densityEndTaper: mix(0.14, 0.28, random()),
                    minimumRadius: 0.008,
                    role: "floccus-attached-sublimating-fallstreak",
                    hierarchyLevel: 3,
                    lifecycleStage: "decaying",
                });
            }
            groupCount += 1;
        }
    } else {
        // A shallow finite ice-patch surface owns the common generating layer;
        // unequal scalloped tuft surfaces grow from it.  No capsule row or
        // sphere chain is present in either the base or crenellated crown.
        const turretCount = 6;
        const baseY = mix(0.43, 0.50, random());
        const heading = mix(-0.48, 0.48, random());
        const tangent = [Math.cos(heading), Math.sin(heading)];
        const normal = [-tangent[1], tangent[0]];
        const commonMode = (order, minimum, maximum) => ({
            order,
            amplitude: mix(minimum, maximum, random()) *
                (random() < 0.5 ? -1 : 1),
            phase: random() * Math.PI * 2,
        });
        addIcePatchSurface(primitives, {
            center: [0.50, baseY, 0.50],
            radii: [0.39, 0.060, 0.115],
            rotation: heading,
            planModes: [
                commonMode(2, 0.025, 0.055),
                commonMode(3, 0.025, 0.060),
                commonMode(5, 0.018, 0.045),
            ],
            thicknessModes: [
                commonMode(2, 0.04, 0.09),
                commonMode(5, 0.025, 0.07),
            ],
            surfaceModes: [
                commonMode(3, 0.035, 0.08),
                commonMode(6, 0.020, 0.055),
            ],
            centerlineSlope: [0, mix(-0.06, 0.06, random())],
            rimThicknessFraction: 0.34,
            interiorThicknessExponent: 0.78,
            upperFraction: 0.52,
            density: 0.80,
            detail: 0.70,
            role: "castellanus-finite-irregular-common-base",
        });
        const intervalMotif = [0.48, 1.58, 0.68, 1.82, 0.88];
        const intervals = Array.from(
            { length: turretCount - 1 },
            (_, index) => intervalMotif[index] * mix(0.86, 1.14, random()),
        );
        const intervalTotal = intervals.reduce((sum, value) => sum + value, 0);
        let cumulative = 0;
        for (let turret = 0; turret < turretCount; turret += 1) {
            const t = turret === 0 ? 0 : cumulative / intervalTotal;
            if (turret < intervals.length) cumulative += intervals[turret];
            const along = mix(-0.37, 0.37, t);
            const cross = Math.sin(t * Math.PI * 1.35 + 0.3) *
                mix(0.015, 0.055, random());
            const cx = 0.5 + tangent[0] * along + normal[0] * cross;
            const cz = 0.5 + tangent[1] * along + normal[1] * cross;
            const radius = mix(0.041, 0.057, random());
            const towerHeight = radius * mix(2.4, 4.8, random());
            ownerPoints.push([cx, cz]);
            addIceTuftSurface(primitives, {
                center: [cx, baseY, cz],
                radii: [
                    radius * mix(0.80, 1.18, random()),
                    towerHeight,
                    radius * mix(0.74, 1.10, random()),
                ],
                rotation: heading + mix(-0.24, 0.24, random()),
                baseAltitude: baseY - 0.008,
                crownHeight: towerHeight,
                undersideDepth: mix(0.020, 0.034, random()),
                planModes: [
                    commonMode(2, 0.04, 0.10),
                    commonMode(3, 0.04, 0.12),
                    commonMode(5, 0.02, 0.065),
                ],
                crownModes: [
                    commonMode(3, 0.08, 0.16),
                    commonMode(5, 0.04, 0.10),
                ],
                undersideModes: [commonMode(3, 0.04, 0.10)],
                crownExponent: mix(0.38, 0.62, random()),
                tilt: [mix(-0.10, 0.10, random()), mix(-0.08, 0.08, random())],
                density: mix(0.88, 1.0, random()),
                detail: mix(0.78, 0.90, random()),
                role: "castellanus-unequal-fibrous-turret",
            });
            secondaryLobeCount += 1;
            if (turret % 2 === 0) {
                const fibreStart = [
                    cx + normal[0] * radius * 0.25,
                    baseY + towerHeight * 0.68,
                    cz + normal[1] * radius * 0.25,
                ];
                const fibrePoints = Array.from({ length: 5 }, (_, knot) => {
                    const amount = knot / 4;
                    return [
                        fibreStart[0] + tangent[0] * radius * 1.45 * amount +
                            normal[0] * Math.sin(amount * Math.PI) * radius * 0.22,
                        fibreStart[1] - towerHeight * 0.24 * amount,
                        fibreStart[2] + tangent[1] * radius * 1.45 * amount +
                            normal[1] * Math.sin(amount * Math.PI) * radius * 0.22,
                    ];
                });
                addSweptC2Support(
                    primitives,
                    fibrePoints,
                    [0.017, 0.016, 0.013, 0.010, 0.007],
                    {
                        subdivisions: 5,
                        density: 0.58,
                        detail: 0.94,
                        phase: 1,
                        verticalScale: 0.72,
                        densityEndTaper: 0.28,
                        role: "castellanus-crown-sedimentation-fibre",
                        hierarchyLevel: 3,
                        lifecycleStage: "mature",
                    },
                );
                streamlineCount += 1;
            }
        }
        commonBaseCount = 1;
        groupCount = turretCount;
        return {
            kind: "primitive",
            primitives,
            cavities,
            groupCount,
            ownerPoints,
            streamlineCount,
            commonBaseCount,
            secondaryLobeCount,
            detailBase: 0.82,
            edgeNoise: 0.010,
            interiorNoise: 0.006,
            cavityInteriorGain: 2,
            densityEdgeHigh: 0.015,
            warpStrength: 0.006,
            warpAnisotropy: [1, 0.54, 1],
            hierarchyLevelCount: config.foundationProfile
                ? Math.round(geometricMidpoint(config.foundationProfile.hierarchyLevels))
                : 1,
            boundaryModel:
                "finite-depth-bearing-common-base-with-scalloped-ice-turrets",
        };
    }
    let fallstreakDirectionSpread = 0;
    for (let index = 0; index < fallstreakDirections.length; index += 1) {
        for (let other = index + 1; other < fallstreakDirections.length; other += 1) {
            const difference = Math.abs(fallstreakDirections[index] - fallstreakDirections[other]);
            fallstreakDirectionSpread = Math.max(
                fallstreakDirectionSpread,
                Math.min(difference, Math.PI * 2 - difference),
            );
        }
    }
    return {
        kind: "primitive",
        primitives,
        cavities,
        ownerPoints,
        groupCount,
        streamlineCount,
        commonBaseCount,
        secondaryLobeCount,
        commaHeadCount,
        taperedFallstreakCount,
        uncinusHookCount,
        uncinusConnectedHeadFiberCount,
        uncinusConnectedFallstreakCount,
        uncinusMeanHookArcLength: hookArcLengths.reduce((sum, value) => sum + value, 0) /
            Math.max(1, hookArcLengths.length),
        uncinusMeanFallstreakLength: fallstreakLengths.reduce((sum, value) => sum + value, 0) /
            Math.max(1, fallstreakLengths.length),
        uncinusFallstreakLengthRatio: Math.max(0, ...fallstreakLengths) /
            Math.max(1e-6, Math.min(...fallstreakLengths, Infinity)),
        uncinusMeanFallstreakVerticalDrop: fallstreakVerticalDrops.reduce((sum, value) => sum + value, 0) /
            Math.max(1, fallstreakVerticalDrops.length),
        fibratusPrimaryFibreCount,
        fibratusSecondaryFibreCount,
        fibratusSweptC2Count,
        fibratusLegacyCapsuleCount,
        fibratusMeanTerminalRadiusRatio: fibratusTerminalRadiusRatios.reduce(
            (sum, value) => sum + value,
            0,
        ) / Math.max(1, fibratusTerminalRadiusRatios.length),
        fibratusHeadingSpread: fibratusHeadings.length > 0
            ? Math.max(...fibratusHeadings) - Math.min(...fibratusHeadings)
            : 0,
        fibratusLengthCoefficientVariation: (() => {
            const average = fibratusLengths.reduce((sum, value) => sum + value, 0) /
                Math.max(1, fibratusLengths.length);
            return Math.sqrt(fibratusLengths.reduce(
                (sum, value) => sum + (value - average) ** 2,
                0,
            ) / Math.max(1, fibratusLengths.length)) / Math.max(1e-6, average);
        })(),
        fibratusMeanExcessCurvature: fibratusExcessCurvatures.reduce(
            (sum, value) => sum + value,
            0,
        ) / Math.max(1, fibratusExcessCurvatures.length),
        fibratusSourceAltitudeSpread: fibratusStartAltitudes.length > 0
            ? Math.max(...fibratusStartAltitudes) -
                Math.min(...fibratusStartAltitudes)
            : 0,
        fibratusSourceDepthSpread: fibratusStartDepths.length > 0
            ? Math.max(...fibratusStartDepths) - Math.min(...fibratusStartDepths)
            : 0,
        fibratusAnatomyId,
        fibratusSourceClusterCount,
        fibratusSplitSourceCount,
        meanFallstreakTerminalRadiusRatio: fallstreakTaperRatios.reduce((sum, value) => sum + value, 0) /
            Math.max(1, fallstreakTaperRatios.length),
        meanFallstreakTerminalDensityRatio: fallstreakDensityTaperRatios.reduce((sum, value) => sum + value, 0) /
            Math.max(1, fallstreakDensityTaperRatios.length),
        fallstreakDirectionSpread,
        detailBase: config.variant === "spissatus" ? 0.76 : 0.92,
        edgeNoise: config.variant === "spissatus" ? 0.010 : config.variant === "uncinus" ? 0.0025 : 0.006,
        // Mature Spissatus carries mesoscale ice-mass modulation through the
        // generating patch.  The modulation is deliberately bounded and is
        // evaluated in owner space, so it changes optical depth rather than
        // inventing detached support.  Uncinus/fibratus remain fine streamer
        // fields with their historical interior stability.
        interiorNoise: config.variant === "spissatus"
            ? 0.024
            : config.variant === "floccus"
                ? 0.007
                : config.variant === "uncinus" ? 0.0007 : 0.001,
        cavityInteriorGain: config.variant === "spissatus"
            ? 10
            : config.variant === "floccus" ? 10 : 1,
        densityEdgeHigh: config.variant === "uncinus" ? 0.010 : 0.013,
        fragmentary: config.variant === "floccus",
        hierarchyLevelCount: config.foundationProfile
            ? Math.round(geometricMidpoint(config.foundationProfile.hierarchyLevels))
            : 1,
        boundaryModel: config.variant === "fibratus"
            ? "aperiodic-multidepth-c2-differential-shear-fibres"
            : config.variant === "spissatus"
            ? "branching-dense-ice-patch-with-fibrous-perimeter"
            : config.variant === "floccus"
                ? "ragged-sedimenting-detached-ice-tufts"
                : "sheared-fiber-bundles",
    };
};

const poissonPoints = (random, count, minimumDistance, margin = 0.10) => {
    const points = [];
    let attempts = 0;
    while (points.length < count && attempts < count * 80) {
        attempts += 1;
        const candidate = [mix(margin, 1 - margin, random()), mix(margin, 1 - margin, random())];
        if (points.every((point) => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) >= minimumDistance)) {
            points.push(candidate);
        }
    }
    return points;
};

const buildMoistureEnvelope = (random, level) => {
    const high = level === "high";
    const middle = level === "middle";
    const orientation = mix(-0.72, 0.72, random());
    const center = [mix(0.43, 0.57, random()), mix(0.43, 0.57, random())];
    const lobes = [{
        center,
        radii: [high ? 0.43 : middle ? 0.44 : 0.46, high ? 0.32 : 0.35],
        rotation: orientation,
    }];
    const satelliteCount = 2 + (random() > 0.45 ? 1 : 0);
    for (let index = 0; index < satelliteCount; index += 1) {
        const angle = orientation + mix(-1.35, 1.35, random()) + (index - 1) * 0.82;
        const offset = mix(0.17, 0.29, random());
        lobes.push({
            center: [
                center[0] + Math.cos(angle) * offset,
                center[1] + Math.sin(angle) * offset,
            ],
            radii: [mix(0.16, 0.26, random()), mix(0.12, 0.22, random())],
            rotation: orientation + mix(-0.55, 0.55, random()),
        });
    }
    return lobes;
};

const moistureEnvelopeSupport = (x, z, lobes) => {
    let support = -Infinity;
    for (const lobe of lobes) {
        const dx = x - lobe.center[0];
        const dz = z - lobe.center[1];
        const cosine = Math.cos(lobe.rotation);
        const sine = Math.sin(lobe.rotation);
        const localX = dx * cosine + dz * sine;
        const localZ = -dx * sine + dz * cosine;
        const metric = Math.sqrt(
            (localX / lobe.radii[0]) ** 2 +
            (localZ / lobe.radii[1]) ** 2
        );
        support = Math.max(support, 1 - metric);
    }
    return support;
};

const poissonPointsInEnvelope = (random, count, minimumDistance, envelope, margin = 0.07) => {
    const points = [];
    const maximumAttempts = count * 260;
    for (let attempt = 0; attempt < maximumAttempts && points.length < count; attempt += 1) {
        const candidate = [mix(margin, 1 - margin, random()), mix(margin, 1 - margin, random())];
        const support = moistureEnvelopeSupport(candidate[0], candidate[1], envelope);
        if (support < mix(0.02, -0.10, attempt / maximumAttempts)) continue;
        const spacing = minimumDistance * mix(1, 0.82, attempt / maximumAttempts);
        if (points.every((point) => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) >= spacing)) {
            points.push(candidate);
        }
    }
    return points;
};

const clusteredPointsInEnvelope = (random, count, clusterCount, envelope, level) => {
    const centers = poissonPointsInEnvelope(
        random,
        clusterCount,
        level === "high" ? 0.22 : 0.25,
        envelope,
        0.10,
    );
    const points = [];
    const scales = [];
    const memberships = [];
    for (let cluster = 0; cluster < centers.length; cluster += 1) {
        const center = centers[cluster];
        const remainingClusters = centers.length - cluster;
        const targetMembers = Math.max(
            2,
            Math.round((count - points.length) / Math.max(1, remainingClusters)) +
                (random() > 0.58 ? 1 : -1),
        );
        const clusterScale = mix(0.72, 1.34, random());
        const clusterAngle = random() * Math.PI * 2;
        const clusterRadius = level === "high"
            ? mix(0.060, 0.125, random())
            : level === "middle" ? mix(0.078, 0.155, random()) : mix(0.095, 0.180, random());
        for (let member = 0; member < targetMembers && points.length < count; member += 1) {
            const primary = member === 0;
            const angle = clusterAngle + member * 2.399963229728653 + mix(-0.46, 0.46, random());
            const radius = primary ? 0 : clusterRadius * mix(0.26, 1.0, Math.pow(random(), 0.78));
            const candidate = [
                center[0] + Math.cos(angle) * radius * mix(0.72, 1.18, random()),
                center[1] + Math.sin(angle) * radius * mix(0.62, 1.26, random()),
            ];
            if (
                candidate[0] < 0.065 || candidate[0] > 0.935 ||
                candidate[1] < 0.065 || candidate[1] > 0.935 ||
                moistureEnvelopeSupport(candidate[0], candidate[1], envelope) < -0.12
            ) continue;
            points.push(candidate);
            scales.push(clusterScale * mix(primary ? 1.04 : 0.52, primary ? 1.46 : 1.28, random()));
            memberships.push(cluster);
        }
    }
    // Extremely restrictive envelopes may reject edge members. Fill the
    // remainder aperiodically, retaining the broad size distribution rather
    // than falling back to rows.
    let attempts = 0;
    while (points.length < count && attempts < count * 120) {
        attempts += 1;
        const centerIndex = Math.floor(random() * Math.max(1, centers.length));
        const center = centers[centerIndex] ?? [0.5, 0.5];
        const angle = random() * Math.PI * 2;
        const radius = mix(0.035, level === "high" ? 0.13 : 0.17, random());
        const candidate = [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius];
        if (
            candidate[0] < 0.065 || candidate[0] > 0.935 ||
            candidate[1] < 0.065 || candidate[1] > 0.935 ||
            moistureEnvelopeSupport(candidate[0], candidate[1], envelope) < -0.12
        ) continue;
        if (points.some((point) => Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) < 0.032)) continue;
        points.push(candidate);
        scales.push(mix(0.52, 1.42, random()));
        memberships.push(centerIndex);
    }
    return { points, scales, memberships, clusterCount: centers.length };
};

const measureOwnerPattern = (points) => {
    if (!points || points.length < 3) {
        return { ownerSpacingCoefficientVariation: 0, ownerAngularEntropy: 0 };
    }
    const nearestDistances = [];
    const angleBins = new Array(8).fill(0);
    for (let index = 0; index < points.length; index += 1) {
        let nearest = Infinity;
        let nearestPoint = null;
        for (let other = 0; other < points.length; other += 1) {
            if (index === other) continue;
            const distance = Math.hypot(
                points[other][0] - points[index][0],
                points[other][1] - points[index][1],
            );
            if (distance < nearest) {
                nearest = distance;
                nearestPoint = points[other];
            }
        }
        nearestDistances.push(nearest);
        let angle = Math.atan2(nearestPoint[1] - points[index][1], nearestPoint[0] - points[index][0]);
        if (angle < 0) angle += Math.PI * 2;
        angleBins[Math.min(7, Math.floor(angle / (Math.PI * 2) * 8))] += 1;
    }
    const mean = nearestDistances.reduce((sum, value) => sum + value, 0) / nearestDistances.length;
    const variance = nearestDistances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nearestDistances.length;
    let entropy = 0;
    for (const count of angleBins) {
        if (count === 0) continue;
        const probability = count / points.length;
        entropy -= probability * Math.log(probability);
    }
    return {
        ownerSpacingCoefficientVariation: Math.sqrt(variance) / Math.max(1e-8, mean),
        ownerAngularEntropy: entropy / Math.log(angleBins.length),
    };
};

/**
 * Natural-neighbor graph shared by cellular cloud generators.
 *
 * A Gabriel edge exists only when the disk whose diameter joins the two
 * sites contains no third site.  Unlike a k-nearest graph this does not
 * introduce a preferred valence or hidden Cartesian spacing, and unlike an
 * MST it retains the local cycles that distinguish a cellular moisture field
 * from a branching rail skeleton.
 */
export const createCloudGabrielEdges = (
    sites,
    coordinates = (site) => [site.centerX, site.centerY],
) => {
    const edges = [];
    for (let left = 0; left < sites.length; left += 1) {
        for (let right = left + 1; right < sites.length; right += 1) {
            const leftPoint = coordinates(sites[left]);
            const rightPoint = coordinates(sites[right]);
            const midpointX = (leftPoint[0] + rightPoint[0]) * 0.5;
            const midpointY = (leftPoint[1] + rightPoint[1]) * 0.5;
            const radiusSquared =
                (leftPoint[0] - rightPoint[0]) ** 2 * 0.25 +
                (leftPoint[1] - rightPoint[1]) ** 2 * 0.25;
            const tolerance = Math.max(1e-12, radiusSquared * 1e-10);
            const blocked = sites.some((site, index) => {
                if (index === left || index === right) return false;
                const point = coordinates(site);
                return (point[0] - midpointX) ** 2 +
                    (point[1] - midpointY) ** 2 < radiusSquared - tolerance;
            });
            if (!blocked) edges.push([left, right]);
        }
    }
    return edges;
};

export const measureCloudNeighborGraph = (cellCount, edges) => {
    const adjacency = Array.from({ length: cellCount }, () => []);
    for (const [left, right] of edges) {
        adjacency[left].push(right);
        adjacency[right].push(left);
    }
    let componentCount = 0;
    const visited = new Uint8Array(cellCount);
    for (let start = 0; start < cellCount; start += 1) {
        if (visited[start]) continue;
        componentCount += 1;
        const stack = [start];
        visited[start] = 1;
        while (stack.length > 0) {
            const current = stack.pop();
            for (const neighbor of adjacency[current]) {
                if (visited[neighbor]) continue;
                visited[neighbor] = 1;
                stack.push(neighbor);
            }
        }
    }
    return {
        componentCount,
        cycleRank: Math.max(0, edges.length - cellCount + componentCount),
        leafCount: adjacency.filter((neighbors) => neighbors.length <= 1).length,
    };
};

const cloudGraphBridgeKeys = (cellCount, edges) => {
    const key = (left, right) => left < right
        ? `${left}:${right}` : `${right}:${left}`;
    const adjacency = Array.from({ length: cellCount }, () => []);
    for (const [left, right] of edges) {
        adjacency[left].push(right);
        adjacency[right].push(left);
    }
    const discovery = new Int32Array(cellCount).fill(-1);
    const low = new Int32Array(cellCount).fill(-1);
    const bridges = new Set();
    let time = 0;
    const visit = (node, parent) => {
        discovery[node] = time;
        low[node] = time;
        time += 1;
        for (const neighbor of adjacency[node]) {
            if (neighbor === parent) continue;
            if (discovery[neighbor] >= 0) {
                low[node] = Math.min(low[node], discovery[neighbor]);
                continue;
            }
            visit(neighbor, node);
            low[node] = Math.min(low[node], low[neighbor]);
            if (low[neighbor] > discovery[node]) {
                bridges.add(key(node, neighbor));
            }
        }
    };
    for (let node = 0; node < cellCount; node += 1) {
        if (discovery[node] < 0) visit(node, -1);
    }
    return bridges;
};

/**
 * Generate spatially varying moisture domains.  Species generators can
 * change their number and scale distribution, but share one aperiodic domain
 * grammar so no family quietly falls back to rows or a jittered grid.
 */
const createAperiodicMoistureDomains = ({
    random,
    envelope,
    count,
    minimumDistance,
    margin = 0.10,
    minimumCount = Math.max(2, count - 2),
    scaleRange = [0.48, 1.56],
}) => {
    const centers = poissonPointsInEnvelope(
        random,
        count,
        minimumDistance,
        envelope,
        margin,
    );
    while (centers.length < minimumCount) {
        const angle = random() * Math.PI * 2;
        const candidate = [
            0.5 + Math.cos(angle) * mix(0.10, 0.29, random()),
            0.5 + Math.sin(angle) * mix(0.08, 0.25, random()),
        ];
        if (moistureEnvelopeSupport(candidate[0], candidate[1], envelope) < -0.10) {
            continue;
        }
        if (centers.some((center) => Math.hypot(
            center[0] - candidate[0],
            center[1] - candidate[1],
        ) < minimumDistance * 0.62)) continue;
        centers.push(candidate);
    }
    const scales = centers.map((_, index) => clamp(
        mix(scaleRange[0], scaleRange[1], random()) +
            Math.sin(index * 2.399963229728653 + random() * 0.31) * 0.12,
        scaleRange[0],
        scaleRange[1],
    ));
    return { centers, scales };
};

/**
 * Variable-radius best-candidate sites inside the shared moisture domains.
 * The local scale affects exclusion distance, making broad and fine colonies
 * coexist without a repeated motif.  The callback carries species physics
 * (wave phase, thermal maturity, dry-slot bias) without duplicating packing.
 */
const createAperiodicDomainSites = ({
    random,
    seed,
    envelope,
    domains,
    count,
    margin = 0.095,
    candidatesPerSite = 128,
    baseSpacing = 0.050,
    spacingExponent = 1.45,
    supportWeight = 0.055,
    decorateCandidate = null,
}) => {
    const sites = [];
    for (let siteIndex = 0; siteIndex < count; siteIndex += 1) {
        let best = null;
        const candidateCount = siteIndex < domains.centers.length
            ? Math.max(180, candidatesPerSite)
            : candidatesPerSite;
        for (let candidateIndex = 0; candidateIndex < candidateCount;
            candidateIndex += 1) {
            const centerX = mix(margin, 1 - margin, random());
            const centerY = mix(margin, 1 - margin, random());
            const support = moistureEnvelopeSupport(centerX, centerY, envelope);
            if (support < -0.075) continue;
            let domainIndex = 0;
            let domainDistance = Infinity;
            for (let index = 0; index < domains.centers.length; index += 1) {
                const distance = Math.hypot(
                    centerX - domains.centers[index][0],
                    centerY - domains.centers[index][1],
                );
                if (distance < domainDistance) {
                    domainDistance = distance;
                    domainIndex = index;
                }
            }
            const localScale = domains.scales[domainIndex] ?? 1;
            let normalizedClearance = Infinity;
            for (const site of sites) {
                const separation = Math.hypot(
                    centerX - site.centerX,
                    centerY - site.centerY,
                );
                normalizedClearance = Math.min(
                    normalizedClearance,
                    separation / Math.max(
                        baseSpacing * 0.90,
                        (Math.pow(localScale, spacingExponent) +
                            Math.pow(site.localScale, spacingExponent)) *
                            baseSpacing,
                    ),
                );
            }
            if (sites.length === 0) normalizedClearance = support + 1;
            const colonyBias = Math.exp(-domainDistance * domainDistance / 0.075) *
                mix(-0.035, 0.075, (domainIndex * 0.61803398875) % 1);
            const decoration = decorateCandidate?.({
                centerX,
                centerY,
                domainIndex,
                domainDistance,
                localScale,
                siteIndex,
                support,
                seed,
            }) ?? {};
            const score = normalizedClearance + support * supportWeight +
                colonyBias + (decoration.scoreBias ?? 0) +
                (random() - 0.5) * 0.028;
            if (!best || score > best.score) {
                best = {
                    centerX,
                    centerY,
                    localScale,
                    domainIndex,
                    ...decoration,
                    score,
                };
            }
        }
        if (!best) throw new Error("unable to place aperiodic cellular site");
        sites.push(best);
    }
    return sites;
};

const stratocumulusMaterialEdges = (cells, naturalEdges) => {
    const parent = cells.map((_, index) => index);
    const find = (node) => {
        let root = node;
        while (parent[root] !== root) root = parent[root];
        while (parent[node] !== node) {
            const next = parent[node];
            parent[node] = root;
            node = next;
        }
        return root;
    };
    const join = (left, right) => {
        const leftRoot = find(left);
        const rightRoot = find(right);
        if (leftRoot === rightRoot) return false;
        parent[rightRoot] = leftRoot;
        return true;
    };
    const withDistance = naturalEdges.map(([left, right]) => ({
        edge: [left, right],
        distance: Math.hypot(
            cells[left].centerX - cells[right].centerX,
            cells[left].centerY - cells[right].centerY,
        ),
    }));
    // Local circulation owns the visible network. Hull diagonals in a finite
    // Gabriel graph are mathematically valid but meteorologically implausible
    // as long straight condensate bridges, so they remain clear channels.
    const selected = withDistance
        .filter(({ distance }) => distance <= 0.20)
        .map(({ edge }) => edge);
    for (const [left, right] of selected) join(left, right);
    // If an unusually lobed seeded envelope leaves separate local colonies,
    // add only the shortest inter-colony saddle needed for material support.
    // The many already-selected cycles remain the dominant topology.
    for (const { edge: [left, right] } of withDistance
        .filter(({ distance }) => distance > 0.20)
        .sort((a, b) => a.distance - b.distance)) {
        if (!join(left, right)) continue;
        selected.push([left, right]);
    }
    return selected;
};

const quantizedCloudSiteCount = (
    sites,
    resolution,
    coordinates = (site) => [site.centerX, site.centerY],
) => new Set(
    sites.map((site) => {
        const point = coordinates(site);
        return [
            Math.min(resolution - 1, Math.floor(point[0] * resolution)),
            Math.min(resolution - 1, Math.floor(point[1] * resolution)),
        ].join(":");
    }),
).size;

/**
 * Creates the resolved circulation topology used by the low Stratocumulus
 * stratiformis atlas exemplar.
 *
 * The sites are an aperiodic, spatially varying blue-noise population inside
 * one finite mesoscale moisture envelope. Their Gabriel graph is a physical
 * local-neighbor network with loops, rather than an arbitrary spanning tree.
 * Cloudy necks are materialized later, below the cell crowns, so this graph
 * keeps the source connected without drawing a visible set of uniform rails.
 * The returned qualification observation is deliberately source-geometric:
 * scale counts measure center aliasing at 48/24/12 samples, while condensate
 * mass is conserved by the atlas' block-average reconstruction contract.
 */
export const createStratocumulusStratiformisTopology = ({
    seed = CLOUD_MACRO_ATLAS_SEED,
    moistureEnvelope = null,
    baseY = 0.34,
    cellCount = 28,
    radiusScale = 1,
} = {}) => {
    if (!Number.isInteger(cellCount) || cellCount < 24) {
        throw new Error("Stratocumulus stratiformis requires at least 24 cells");
    }
    const topologyRandom = makeRandom(hashInteger(seed ^ 0x73632d73));
    const envelope = moistureEnvelope ?? buildMoistureEnvelope(
        // Match buildFoundationCellularModel's first deterministic operation
        // so a standalone qualification observes the production envelope.
        makeRandom(seed),
        "low",
    );
    const domains = createAperiodicMoistureDomains({
        random: topologyRandom,
        envelope,
        count: 6,
        minimumDistance: 0.155,
        margin: 0.11,
        minimumCount: 4,
        scaleRange: [0.42, 1.68],
    });
    const sites = createAperiodicDomainSites({
        random: topologyRandom,
        seed,
        envelope,
        domains,
        count: cellCount,
    });

    const cells = sites.map((site, index) => {
        const mesoscale = fbm3(
            site.centerX * 3.1 + 2.7,
            0.41,
            site.centerY * 2.8 - 4.3,
            seed + 6907,
        );
        const radius = clamp(
            0.050 * site.localScale * mix(0.88, 1.14, topologyRandom()) *
                radiusScale,
            0.041 * Math.min(1, radiusScale),
            0.072 * Math.max(1, radiusScale),
        );
        const radiusX = radius * mix(0.88, 1.28, topologyRandom());
        const radiusY = radius * mix(0.82, 1.20, topologyRandom());
        const thickness = radius * mix(0.90, 1.46, topologyRandom());
        // The condensation underside is much flatter than the cloud top.
        // Mesoscale radiative-convective relief therefore changes depth and
        // crown altitude primarily, rather than moving whole oval elements up
        // and down through the inversion layer.
        const baseHeight = baseY - 0.014 +
            (mesoscale - 0.5) * 0.008 +
            Math.sin(index * 1.347 + site.domainIndex * 0.71) * 0.0025;
        const topHeight = baseHeight + thickness;
        const inversionHeight = baseY + 0.072 +
            (mesoscale - 0.5) * 0.012 +
            Math.sin(site.domainIndex * 1.213 + 0.4) * 0.004;
        const rotationRadians = topologyRandom() * Math.PI;
        const planModes = [2, 3, 5].map((order, hierarchyLevel) => ({
            order,
            phase: topologyRandom() * Math.PI * 2,
            amplitude: mix(
                [0.034, 0.022, 0.010][hierarchyLevel],
                [0.082, 0.052, 0.026][hierarchyLevel],
                topologyRandom(),
            ) * (topologyRandom() > 0.5 ? 1 : -1),
        }));
        const crownModes = [1, 3, 6].map((order, hierarchyLevel) => ({
            order,
            phase: topologyRandom() * Math.PI * 2,
            amplitude: mix(
                [0.024, 0.014, 0.006][hierarchyLevel],
                [0.064, 0.038, 0.018][hierarchyLevel],
                topologyRandom(),
            ) * (topologyRandom() > 0.5 ? 1 : -1),
        }));
        return {
            centerX: site.centerX,
            centerY: site.centerY,
            baseHeight,
            topHeight,
            inversionHeight: Math.max(
                baseHeight + thickness * 0.72,
                inversionHeight,
            ),
            radiusX,
            radiusY,
            domainIndex: site.domainIndex,
            hierarchyLevel: index % 3,
            rotationRadians,
            planModes,
            crownModes,
            undersideAmplitude: mix(0.0004, 0.0018, topologyRandom()),
            interiorClearance: 0,
            wallFraction: 0.42,
        };
    });
    const edges = createCloudGabrielEdges(cells);
    const cellNeighbors = Array.from({ length: cells.length }, () => []);
    for (const [left, right] of edges) {
        cellNeighbors[left].push(right);
        cellNeighbors[right].push(left);
    }
    for (let index = 0; index < cells.length; index += 1) {
        const cell = cells[index];
        const planRadius = Math.sqrt(cell.radiusX * cell.radiusY);
        const clearances = cellNeighbors[index].map((neighborIndex) => {
            const neighbor = cells[neighborIndex];
            const neighborRadius = Math.sqrt(
                neighbor.radiusX * neighbor.radiusY,
            );
            const separation = Math.hypot(
                cell.centerX - neighbor.centerX,
                cell.centerY - neighbor.centerY,
            );
            return separation - (planRadius + neighborRadius) * 0.72;
        });
        cell.interiorClearance = clamp(
            Math.min(...clearances),
            0.004,
            0.070,
        );
        // Broad cloudy interiors belong to closed cells. Clearance controls
        // the width/depth split without synthesizing a Voronoi polygon: close
        // neighbours yield a narrower wall shoulder, roomy cells can carry a
        // deeper radiatively driven crown.
        cell.wallFraction = mix(
            0.34,
            0.52,
            clamp(cell.interiorClearance / Math.max(0.012, planRadius), 0, 1),
        );
    }
    const cycleMetrics = measureCloudNeighborGraph(cells.length, edges);
    if (cycleMetrics.componentCount !== 1 ||
        cycleMetrics.cycleRank < Math.ceil(cells.length * 0.14)) {
        throw new Error("Stratocumulus natural-neighbor topology lacks loops");
    }
    const materialEdges = stratocumulusMaterialEdges(cells, edges);
    const materialCycleMetrics = measureCloudNeighborGraph(
        cells.length,
        materialEdges,
    );
    const materialBridgeKeys = cloudGraphBridgeKeys(
        cells.length,
        materialEdges,
    );
    if (materialCycleMetrics.componentCount !== 1 ||
        materialCycleMetrics.cycleRank < Math.ceil(cells.length * 0.14)) {
        throw new Error("Stratocumulus material topology lacks cellular loops");
    }
    const clearChannels = edges.map(([left, right], index) => {
        const source = cells[left];
        const target = cells[right];
        const distance = Math.hypot(
            target.centerX - source.centerX,
            target.centerY - source.centerY,
        );
        const occupiedRadius =
            (Math.sqrt(source.radiusX * source.radiusY) +
                Math.sqrt(target.radiusX * target.radiusY)) * 0.62;
        const channelWidth = distance - occupiedRadius +
            Math.sin(index * 1.913 + seed * 1e-6) * 0.012;
        return {
            index,
            left,
            right,
            width: clamp(
                channelWidth * mix(0.76, 1.28, topologyRandom()),
                0.006,
                0.100,
            ),
            length: distance * mix(0.62, 1.32, topologyRandom()),
            orientationRadians: Math.atan2(
                target.centerY - source.centerY,
                target.centerX - source.centerX,
            ) + Math.PI * 0.5 + mix(-0.17, 0.17, topologyRandom()),
            midpointX: (source.centerX + target.centerX) * 0.5,
            midpointY: (source.centerY + target.centerY) * 0.5,
            cavityDepthFraction: mix(0.34, 0.68, topologyRandom()),
            selectionBias: topologyRandom(),
        };
    });
    // Only a distributed subset of wide natural-neighbor seams becomes an
    // explicit cold-pool/downwelling channel. Carving every bisector would
    // expose a Voronoi grid; selecting by physical clearance plus an
    // independent deterministic bias preserves evolving parent/offspring
    // cells and leaves many merged cloudy interfaces.
    const coldPoolChannelCount = Math.max(
        9,
        Math.ceil(clearChannels.length * 0.28),
    );
    const materialBridgeSegments = [...materialBridgeKeys].map((entry) => {
        const [left, right] = entry.split(":").map(Number);
        return [cells[left], cells[right]];
    });
    const pointSegmentDistance = (x, y, source, target) => {
        const dx = target.centerX - source.centerX;
        const dy = target.centerY - source.centerY;
        const amount = clamp((
            (x - source.centerX) * dx + (y - source.centerY) * dy
        ) / Math.max(1e-8, dx * dx + dy * dy));
        return Math.hypot(
            x - mix(source.centerX, target.centerX, amount),
            y - mix(source.centerY, target.centerY, amount),
        );
    };
    const crossesProtectedBridge = (channel) => {
        if (materialBridgeSegments.length === 0) return false;
        const directionX = Math.cos(channel.orientationRadians);
        const directionY = Math.sin(channel.orientationRadians);
        const halfLength = clamp(channel.length * 0.42, 0.025, 0.075);
        for (let sampleIndex = 0; sampleIndex <= 8; sampleIndex += 1) {
            const amount = sampleIndex / 4 - 1;
            const x = channel.midpointX + directionX * halfLength * amount;
            const y = channel.midpointY + directionY * halfLength * amount;
            if (materialBridgeSegments.some(([source, target]) =>
                pointSegmentDistance(x, y, source, target) < 0.045)) {
                return true;
            }
        }
        return false;
    };
    const coldPoolChannels = clearChannels
        .filter((channel) => !materialBridgeKeys.has(
            channel.left < channel.right
                ? `${channel.left}:${channel.right}`
                : `${channel.right}:${channel.left}`,
        ))
        .filter((channel) => !crossesProtectedBridge(channel))
        .sort((left, right) =>
            right.width * mix(0.76, 1.24, right.selectionBias) -
            left.width * mix(0.76, 1.24, left.selectionBias))
        .slice(0, coldPoolChannelCount)
        .sort((left, right) => left.index - right.index);
    const condensateMass = cells.reduce((sum, cell) => sum +
        Math.PI * 4 / 3 * cell.radiusX * cell.radiusY *
            (cell.topHeight - cell.baseHeight) * 0.5,
    0);
    return {
        cells,
        edges,
        materialEdges,
        clearChannels,
        coldPoolChannels,
        domainCount: new Set(cells.map((cell) => cell.domainIndex)).size,
        cycleRank: cycleMetrics.cycleRank,
        materialCycleRank: materialCycleMetrics.cycleRank,
        leafCount: cycleMetrics.leafCount,
        qualificationObservation: {
            cells: cells.map((cell) => ({
                centerX: cell.centerX,
                centerY: cell.centerY,
                baseHeight: cell.baseHeight,
                topHeight: cell.topHeight,
            })),
            clearChannels,
            multiscale: {
                1: {
                    resolvedCellCount: cells.length,
                    condensateMass,
                },
                2: {
                    resolvedCellCount: quantizedCloudSiteCount(cells, 24),
                    condensateMass,
                },
                4: {
                    resolvedCellCount: quantizedCloudSiteCount(cells, 12),
                    condensateMass,
                },
            },
            surfaceReconstruction: {
                cellSurfaceCount: cells.length,
                circulationRibbonCount: materialEdges.length,
                coldPoolCavityCount: coldPoolChannels.length,
                hierarchyLevelCount: new Set(cells.map((cell) =>
                    cell.hierarchyLevel)).size,
                legacyEllipsoidCount: 0,
                legacyCapsuleCount: 0,
                minimumInteriorClearance: Math.min(...cells.map((cell) =>
                    cell.interiorClearance)),
                maximumUndersideAmplitude: Math.max(...cells.map((cell) =>
                    cell.undersideAmplitude)),
            },
        },
    };
};

const buildCellularModel = (config, seed) => {
    const random = makeRandom(seed);
    const primitives = [];
    const high = config.level === "high";
    const middle = config.level === "middle";
    const variant = config.variant;
    const targetCount = variant === "stratiformis" ? (high ? 17 : middle ? 14 : 12) : (variant === "castellanus" ? 10 : 11);
    const minimumDistance = variant === "stratiformis" ? (high ? 0.105 : middle ? 0.135 : 0.15) : 0.17;
    const baseY = high ? 0.58 : middle ? 0.48 : 0.35;
    // High-cloud macro cells still need a reconstructible cross-section in a
    // 48^3 atlas.  Their apparent smallness comes from world placement and the
    // boundary-detail stage, not from sub-voxel canonical support.
    const nominalRadius = high ? 0.048 : middle ? 0.061 : 0.080;
    let commonBaseCount = 0;
    let secondaryLobeCount = 0;
    let points = [];
    let pointScales = [];
    let cellClusterCount = 0;
    const rows = [];
    const moistureEnvelope = buildMoistureEnvelope(random, config.level);

    if (variant === "castellanus") {
        const rowCount = high ? 3 : 2;
        for (let row = 0; row < rowCount; row += 1) {
            const count = Math.floor(targetCount / rowCount) + (row < targetCount % rowCount ? 1 : 0);
            const rowPoints = [];
            const rowZ = mix(0.24, 0.76, row / Math.max(1, rowCount - 1)) + (random() - 0.5) * 0.055;
            const rowSlope = mix(-0.12, 0.12, random());
            const intervalWeights = Array.from(
                { length: Math.max(1, count - 1) },
                () => mix(0.55, 1.65, random()),
            );
            const intervalTotal = intervalWeights.reduce((sum, value) => sum + value, 0);
            let cumulative = 0;
            for (let index = 0; index < count; index += 1) {
                const t = index === 0 ? 0 : cumulative / intervalTotal;
                const point = [
                    mix(0.11, 0.89, t) + (random() - 0.5) * 0.038,
                    rowZ + rowSlope * (t - 0.5) +
                        Math.sin(t * Math.PI * mix(0.72, 1.36, random())) * mix(-0.055, 0.055, random()) +
                        (random() - 0.5) * 0.052,
                ];
                rowPoints.push(point);
                points.push(point);
                if (index < intervalWeights.length) cumulative += intervalWeights[index];
            }
            rows.push(rowPoints);
        }
    } else if (variant === "stratiformis") {
        const clustered = clusteredPointsInEnvelope(
            random,
            targetCount,
            high ? 5 : 4,
            moistureEnvelope,
            config.level,
        );
        points = clustered.points;
        pointScales = clustered.scales;
        cellClusterCount = clustered.clusterCount;
    } else {
        points = poissonPointsInEnvelope(
            random,
            targetCount,
            minimumDistance,
            moistureEnvelope,
        );
    }

    for (let index = 0; index < points.length; index += 1) {
        const [cx, cz] = points[index];
        const radius = nominalRadius * (pointScales[index] ?? mix(0.72, 1.30, random()));
        if (variant === "stratiformis") {
            const moisturePatch = fbm3(cx * 2.25 + 3.1, 0.4, cz * 2.05 - 1.7, seed + 2711);
            const cellY = baseY + (moisturePatch - 0.5) * radius * 0.68 + (random() - 0.5) * radius * 0.22;
            const flowRotation = moistureEnvelope[0].rotation + mix(-0.62, 0.62, random());
            addPrimitiveEllipsoid(primitives, [cx, cellY, cz], [
                radius * mix(0.92, 1.62, random()),
                radius * mix(high ? 0.38 : 0.52, high ? 0.78 : 0.96, random()),
                radius * mix(0.78, 1.42, random()),
            ], { density: mix(0.82, 1, random()), detail: high ? 0.62 : 0.28, phase: config.phaseBase, rotation: flowRotation, role: "cell-owner" });
            const daughterCount = 1 +
                (random() > 0.72 ? 1 : 0) +
                (moisturePatch > 0.68 && random() > 0.45 ? 1 : 0);
            for (let daughter = 0; daughter < daughterCount; daughter += 1) {
                const angle = random() * Math.PI * 2;
                const daughterScale = mix(0.46, 0.72, random());
                const daughterCenter = [
                    cx + Math.cos(angle) * radius * mix(0.32, 0.92, random()),
                    cellY + radius * mix(0.10, 0.46, random()),
                    cz + Math.sin(angle) * radius * mix(0.28, 0.86, random()),
                ];
                addPrimitiveEllipsoid(primitives, [
                    daughterCenter[0], daughterCenter[1], daughterCenter[2],
                ], [
                    radius * daughterScale * mix(0.88, 1.18, random()),
                    radius * daughterScale * mix(0.70, 1.00, random()),
                    radius * daughterScale * mix(0.84, 1.16, random()),
                ], { density: 0.84, detail: high ? 0.68 : 0.32, phase: config.phaseBase, rotation: random() * Math.PI, role: "cell-daughter" });
                secondaryLobeCount += 1;
                if (high && (index + daughter) % 3 === 0) {
                    const budRadius = Math.max(high ? 0.017 : 0.020, radius * daughterScale * mix(0.42, 0.58, random()));
                    addPrimitiveEllipsoid(primitives, [
                        daughterCenter[0] + Math.cos(angle + 0.9) * budRadius * 0.72,
                        daughterCenter[1] + budRadius * mix(0.42, 0.72, random()),
                        daughterCenter[2] + Math.sin(angle + 0.9) * budRadius * 0.64,
                    ], [budRadius * 1.08, budRadius * 0.92, budRadius], {
                        density: 0.78,
                        detail: high ? 0.72 : 0.36,
                        phase: config.phaseBase,
                        rotation: random() * Math.PI,
                        role: "cell-tertiary-bud",
                    });
                    secondaryLobeCount += 1;
                }
            }
        } else if (variant === "castellanus") {
            addPrimitiveEllipsoid(primitives, [cx, baseY, cz], [radius * 1.28, radius * 0.36, radius], {
                density: 0.88, detail: high ? 0.62 : 0.22, phase: config.phaseBase, rotation: random() * Math.PI, role: "castellated-base",
            });
            const towerHeight = radius * mix(1.8, 3.1, random());
            addCapsule(primitives, [cx, baseY, cz], [cx + (random() - 0.5) * radius * 0.25, baseY + towerHeight, cz + (random() - 0.5) * radius * 0.22], radius * 0.62, {
                density: 1, detail: high ? 0.70 : 0.20, phase: config.phaseBase, verticalScale: 0.95, role: "castellated-turret",
            });
            addPrimitiveEllipsoid(primitives, [cx, baseY + towerHeight, cz], [radius * 0.82, radius * 0.66, radius * 0.78], {
                density: 0.94, detail: high ? 0.76 : 0.25, phase: config.phaseBase, role: "castellated-crown",
            });
            secondaryLobeCount += 1;
            for (let bud = 0; bud < 2; bud += 1) {
                const budAngle = random() * Math.PI * 2;
                const budRadius = radius * mix(0.34, 0.52, random());
                addPrimitiveEllipsoid(primitives, [
                    cx + Math.cos(budAngle) * radius * 0.52,
                    baseY + towerHeight + budRadius * mix(0.08, 0.42, random()),
                    cz + Math.sin(budAngle) * radius * 0.46,
                ], [budRadius * 1.06, budRadius, budRadius], {
                    density: 0.88,
                    detail: high ? 0.78 : 0.29,
                    phase: config.phaseBase,
                    role: "castellated-crown-bud",
                });
                secondaryLobeCount += 1;
            }
        } else {
            const tuftY = baseY + radius * mix(0.2, 1.0, random());
            const lobeCount = 5 + Math.floor(random() * 3);
            for (let lobe = 0; lobe < lobeCount; lobe += 1) {
                const angle = random() * Math.PI * 2;
                const scale = mix(0.44, 0.92, random());
                addPrimitiveEllipsoid(primitives, [
                    cx + Math.cos(angle) * radius * mix(0.08, 0.48, random()),
                    tuftY + radius * mix(-0.08, 0.55, random()),
                    cz + Math.sin(angle) * radius * mix(0.08, 0.46, random()),
                ], [radius * scale * 1.12, radius * scale, radius * scale], {
                    density: mix(0.84, 1, random()), detail: high ? 0.75 : 0.35, phase: config.phaseBase, rotation: random() * Math.PI, role: "floccus-tuft-lobe",
                });
                secondaryLobeCount += 1;
            }
            addCapsule(primitives, [cx, baseY + radius * 0.2, cz], [cx + radius * 0.28, baseY - radius * mix(1.0, 2.1, random()), cz + radius * 0.65], radius * 0.24, {
                density: 0.58, detail: high ? 0.92 : 0.68, phase: Math.max(config.phaseBase, middle ? 0.4 : 0.8), precipitation: 0.65, verticalScale: 0.5, role: "virga",
            });
        }
    }

    if (variant === "castellanus") {
        for (const row of rows) {
            for (let base = 0; base + 1 < row.length; base += 1) {
                addCapsule(primitives, [row[base][0], baseY, row[base][1]], [row[base + 1][0], baseY, row[base + 1][1]], nominalRadius * mix(0.40, 0.56, random()), {
                    density: 0.84,
                    detail: high ? 0.62 : 0.22,
                    phase: config.phaseBase,
                    verticalScale: 0.30,
                    role: "castellanus-common-base",
                });
            }
            commonBaseCount += 1;
        }
    }
    return {
        kind: "primitive",
        primitives,
        cavities: [],
        groupCount: points.length,
        ownerPoints: points,
        commonBaseCount,
        secondaryLobeCount,
        hierarchyLevelCount: variant === "stratiformis" ? 3 : 1,
        cellClusterCount,
        boundaryLobeCount: moistureEnvelope.length,
        detailBase: high ? 0.68 : 0.28,
        edgeNoise: high ? 0.013 : 0.017,
        interiorNoise: high ? 0.002 : 0.003,
        densityEdgeHigh: high ? 0.014 : 0.019,
        fragmentary: variant === "floccus",
        warpStrength: high ? 0.026 : 0.032,
    };
};

const selectLocalColonyEdges = (sites, edges, {
    maximumDistance,
    requireSharedDomain = true,
    selectionModulo = 3,
}) => edges.filter(([left, right], edgeIndex) => {
    const source = sites[left];
    const target = sites[right];
    if (requireSharedDomain && source.domainIndex !== target.domainIndex) {
        return false;
    }
    const distance = Math.hypot(
        source.centerX - target.centerX,
        source.centerY - target.centerY,
    );
    return distance <= maximumDistance &&
        (edgeIndex + left * 3 + right * 5) % selectionModulo !== 0;
});

const cellularClearSlots = (sites, naturalEdges, materialEdges, random) => {
    const materialKeys = new Set(materialEdges.map(([left, right]) =>
        `${Math.min(left, right)}:${Math.max(left, right)}`));
    return naturalEdges
        .filter(([left, right]) => !materialKeys.has(
            `${Math.min(left, right)}:${Math.max(left, right)}`,
        ))
        .map(([left, right], slotIndex) => {
            const source = sites[left];
            const target = sites[right];
            const dx = target.centerX - source.centerX;
            const dz = target.centerY - source.centerY;
            const distance = Math.hypot(dx, dz);
            return {
                centerX: (source.centerX + target.centerX) * 0.5 +
                    mix(-0.012, 0.012, random()),
                centerY: (source.centerY + target.centerY) * 0.5 +
                    mix(-0.012, 0.012, random()),
                length: distance * mix(0.42, 0.78, random()),
                width: clamp(distance * mix(0.12, 0.28, random()), 0.012, 0.060),
                orientationRadians: Math.atan2(dz, dx) + Math.PI * 0.5 +
                    Math.sin(slotIndex * 1.731) * 0.11,
            };
        });
};

const addCellularDrySlotCavity = (
    cavities,
    slot,
    altitude,
    verticalRadius,
    strength,
) => {
    cavities.push({
        center: [slot.centerX, altitude, slot.centerY],
        radii: [
            Math.max(slot.width, slot.length * 0.42),
            verticalRadius,
            Math.max(slot.width, slot.length * 0.18),
        ],
        rotation: slot.orientationRadians,
        strength,
    });
};

/**
 * Source geometry for the six formerly blob-oriented Cc/Ac cellular species.
 *
 * Cc is organized by a finite, refracting gravity-wave packet: the sites are
 * aperiodic but phase-biased and its ice grains are shallow swept ripples. Ac
 * is organized as shallow mixed-phase thermal colonies around variable
 * moisture domains. Castellanus preserves one unstable common source layer;
 * floccus preserves the separated, unequally decaying remnants of that layer.
 */
const buildUpperMiddleCellularModel = (config, seed) => {
    const random = makeRandom(seed);
    const high = config.level === "high";
    const middle = config.level === "middle";
    const variant = config.variant;
    const dispersive = high && variant === "stratiformis" &&
        config.topologyExemplarStyle === "dispersive-oblique-packet";
    const primitives = [];
    const cavities = [];
    const ownerPoints = [];
    const baseY = high ? 0.60 : 0.47;
    const moistureEnvelope = buildMoistureEnvelope(random, config.level);
    const domainCount = variant === "stratiformis" ? (high ? 6 : 5) : 4;
    const domains = createAperiodicMoistureDomains({
        random,
        envelope: moistureEnvelope,
        count: domainCount,
        minimumDistance: high ? 0.135 : 0.16,
        margin: 0.095,
        minimumCount: Math.max(3, domainCount - 1),
        scaleRange: high ? [0.58, 1.38] : [0.52, 1.52],
    });
    let wave = null;
    if (high) {
        const heading = mix(-0.78, 0.78, random());
        const tangent = [Math.cos(heading), Math.sin(heading)];
        const normal = [-tangent[1], tangent[0]];
        const crestIntervals = Array.from({ length: dispersive ? 3 : 4 }, (_, index) =>
            mix(dispersive ? 0.62 : 0.58, dispersive ? 1.48 : 1.58, random()) *
            (0.82 + ((index * 0.61803398875 + 0.21) % 1) * 0.40));
        const total = crestIntervals.reduce((sum, value) => sum + value, 0);
        const offsets = [-0.24];
        for (const interval of crestIntervals) {
            offsets.push(offsets.at(-1) + interval / total * 0.48);
        }
        wave = {
            heading,
            tangent,
            normal,
            offsets,
            curvature: offsets.map(() => mix(
                dispersive ? -0.155 : -0.145,
                dispersive ? 0.155 : 0.145,
                random(),
            )),
            phase: offsets.map(() => random() * Math.PI * 2),
        };
    }
    const lineageHeading = high ? wave.heading : moistureEnvelope[0].rotation;
    const lineageTangent = [Math.cos(lineageHeading), Math.sin(lineageHeading)];
    const lineageNormal = [-lineageTangent[1], lineageTangent[0]];

    const targetCount = variant === "stratiformis"
        ? high ? dispersive ? 25 : 30 : 20
        : variant === "castellanus" ? high ? 8 : 7
            : high ? 10 : 9;
    const sites = createAperiodicDomainSites({
        random,
        seed,
        envelope: moistureEnvelope,
        domains,
        count: targetCount,
        candidatesPerSite: high ? 164 : 148,
        baseSpacing: variant === "stratiformis"
            ? high ? 0.039 : 0.052
            : high ? 0.057 : 0.068,
        spacingExponent: high ? 1.18 : 1.38,
        supportWeight: 0.05,
        decorateCandidate: ({ centerX, centerY, siteIndex }) => {
            const localX = (centerX - 0.5) * lineageTangent[0] +
                (centerY - 0.5) * lineageTangent[1];
            const localZ = (centerX - 0.5) * lineageNormal[0] +
                (centerY - 0.5) * lineageNormal[1];
            if (variant !== "stratiformis") {
                const sourceCurve = Math.sin(
                    localX * Math.PI * mix(1.1, 1.7,
                        (hashInteger(seed ^ 0x17ac) % 1000) / 1000) +
                        seed * 1e-6,
                ) * (high ? 0.045 : 0.062) + localX * localX *
                    (high ? 0.07 : 0.10);
                const width = variant === "castellanus"
                    ? high ? 0.050 : 0.068
                    : high ? 0.105 : 0.135;
                return {
                    lineageCoordinate: localX,
                    scoreBias: Math.exp(-((localZ - sourceCurve) ** 2) /
                        (width * width)) *
                        (variant === "castellanus" ? 0.82 : 0.30) -
                        Math.max(0, Math.abs(localX) - 0.40) * 0.8,
                };
            }
            if (!wave) return {};
            let crestIndex = 0;
            let crestDistance = Infinity;
            for (let index = 0; index < wave.offsets.length; index += 1) {
                const curvedOffset = wave.offsets[index] +
                    Math.sin(localX * Math.PI * 2.1 + wave.phase[index]) *
                        (dispersive ? 0.020 : 0.027) +
                    localX * localX * wave.curvature[index];
                const distance = Math.abs(localZ - curvedOffset);
                if (distance < crestDistance) {
                    crestDistance = distance;
                    crestIndex = index;
                }
            }
            const edgeEnvelope = Math.pow(Math.max(0,
                1 - Math.abs(localX) / 0.43), 0.32);
            return {
                crestIndex,
                waveCoordinate: localX,
                scoreBias: Math.exp(-(crestDistance ** 2) /
                    (dispersive ? 0.00086 : 0.00052)) * 0.72 +
                    edgeEnvelope * 0.045 -
                    ((siteIndex + crestIndex) % 7 === 0 ? 0.035 : 0),
            };
        },
    }).map((site, index) => {
        // A best-candidate process is intentionally repulsive, but an
        // unconstrained one makes every gravity-wave grain converge on the
        // same nearest-neighbour distance.  Real Cc packets alternate compact
        // and relaxed grain colonies as a crest crosses moisture domains.
        // Dilate only the coordinate *along* the crest around the owning
        // domain centre.  The cross-crest coordinate is retained, preserving
        // the refracting wave phase rather than scattering grains after the
        // fact.  Domain scale therefore controls both source support and the
        // physically corresponding wavelength distribution.
        let centerX = site.centerX;
        let centerY = site.centerY;
        let waveCoordinate = site.waveCoordinate;
        if (high && variant === "stratiformis" && wave) {
            const domainCenter = domains.centers[site.domainIndex] ?? [0.5, 0.5];
            const localX = (site.centerX - 0.5) * wave.tangent[0] +
                (site.centerY - 0.5) * wave.tangent[1];
            const localZ = (site.centerX - 0.5) * wave.normal[0] +
                (site.centerY - 0.5) * wave.normal[1];
            const domainX = (domainCenter[0] - 0.5) * wave.tangent[0] +
                (domainCenter[1] - 0.5) * wave.tangent[1];
            const alongScale = clamp(
                Math.pow(site.localScale, dispersive ? 2.05 : 2.35),
                dispersive ? 0.48 : 0.42,
                dispersive ? 1.72 : 1.86,
            );
            // Each moisture domain refracts the packet by a small coherent
            // phase amount.  This is deliberately constant within a domain:
            // independent per-grain jitter would destroy wave causality,
            // whereas a domain phase shift breaks the residual two-axis lag
            // signature while preserving locally coherent crests.
            const domainPhaseShift = dispersive ? (
                hashInteger(seed ^ Math.imul(site.domainIndex + 1, 0x45d9f3b)) /
                    4294967296 - 0.5
            ) * 0.036 : 0;
            const redistributedX = domainX +
                (localX - domainX) * alongScale + domainPhaseShift;
            centerX = clamp(
                0.5 + wave.tangent[0] * redistributedX +
                    wave.normal[0] * localZ,
                0.065,
                0.935,
            );
            centerY = clamp(
                0.5 + wave.tangent[1] * redistributedX +
                    wave.normal[1] * localZ,
                0.065,
                0.935,
            );
            waveCoordinate = redistributedX;
        }
        return {
            ...site,
            centerX,
            centerY,
            waveCoordinate,
            lifecycleStage: (() => {
                const lifecycle = (hashInteger(seed + index * 31337) % 100) / 100;
                if (variant === "castellanus") {
                    return lifecycle < 0.30 ? "growing"
                        : lifecycle < 0.78 ? "mature" : "decaying";
                }
                if (variant === "floccus") {
                    return lifecycle < 0.18 ? "mature" :
                        lifecycle < 0.72 ? "decaying" : "dissipating";
                }
                return lifecycle < 0.22 ? "forming"
                    : lifecycle < 0.82 ? "mature" : "eroding";
            })(),
        };
    });
    const naturalEdges = createCloudGabrielEdges(sites);
    const graphMetrics = measureCloudNeighborGraph(sites.length, naturalEdges);
    let materialEdges = [];
    let crestCount = high && wave ? wave.offsets.length : 0;
    let commonBaseCount = 0;
    let secondaryLobeCount = 0;
    let maximumHierarchyLevel = 1;
    let curvatureAccumulator = 0;
    let curvatureSampleCount = 0;

    const addSweep = (points, radii, options) => {
        addSweptC2Support(primitives, points, radii, options);
        const primitive = primitives.at(-1);
        const chord = Math.hypot(
            points.at(-1)[0] - points[0][0],
            points.at(-1)[1] - points[0][1],
            points.at(-1)[2] - points[0][2],
        );
        let pathLength = 0;
        for (let index = 0; index + 1 < points.length; index += 1) {
            pathLength += Math.hypot(
                points[index + 1][0] - points[index][0],
                points[index + 1][1] - points[index][1],
                points[index + 1][2] - points[index][2],
            );
        }
        curvatureAccumulator += Math.max(0, pathLength / Math.max(1e-6, chord) - 1);
        curvatureSampleCount += 1;
        maximumHierarchyLevel = Math.max(
            maximumHierarchyLevel,
            (options.hierarchyLevel ?? 0) + 1,
        );
        return primitive;
    };

    if (variant === "stratiformis") {
        materialEdges = high ? [] : selectLocalColonyEdges(sites, naturalEdges, {
            maximumDistance: 0.155,
            requireSharedDomain: true,
            selectionModulo: 3,
        });
        for (let index = 0; index < sites.length; index += 1) {
            const site = sites[index];
            const stageScale = site.lifecycleStage === "forming" ? 0.72
                : site.lifecycleStage === "eroding" ? 0.63
                    : site.lifecycleStage === "mature" ? 1 : 0.82;
            const radius = high && dispersive
                ? clamp(
                    0.050 * site.localScale *
                        mix(0.86, 1.16, random()) * stageScale,
                    0.043,
                    0.064,
                )
                : high
                    ? clamp(
                        0.044 * site.localScale *
                            mix(0.84, 1.14, random()) * stageScale,
                        0.038,
                        0.060,
                    )
                    : 0.052 * site.localScale *
                        mix(0.80, 1.16, random()) * stageScale;
            const heading = high
                ? wave.heading + mix(
                    dispersive ? -0.30 : -0.17,
                    dispersive ? 0.30 : 0.17,
                    random(),
                )
                : moistureEnvelope[0].rotation + mix(-0.72, 0.72, random());
            const tangent = [Math.cos(heading), Math.sin(heading)];
            const normal = [-tangent[1], tangent[0]];
            const relief = high ? radius * mix(0.35, 0.72, random())
                : radius * mix(0.32, 0.68, random());
            const domainAltitude = high
                ? (
                    hashInteger(seed ^ Math.imul(
                        (site.domainIndex ?? 0) + 1,
                        0x27d4eb2d,
                    )) / 4294967296 - 0.5
                ) * (dispersive ? 0.068 : 0.054)
                : 0;
            const packetFold = high
                ? Math.sin(
                    (site.waveCoordinate ?? 0) * Math.PI * 1.31 +
                    (site.crestIndex ?? 0) * 0.91,
                ) * (dispersive ? 0.019 : 0.015)
                : 0;
            const centerY = baseY + (high
                ? domainAltitude + packetFold +
                    Math.sin((site.waveCoordinate ?? 0) * Math.PI * 2.3 +
                        (site.crestIndex ?? 0) * 0.83) * relief * 0.48
                : (fbm3(site.centerX * 2.8, 0.47, site.centerY * 2.6,
                    seed + 4409) - 0.5) * relief);
            const halfLength = radius * (high
                ? mix(
                    dispersive ? 1.05 : 0.95,
                    dispersive ? 1.82 : 1.60,
                    random(),
                ) : mix(0.72, 1.28, random()));
            const root = [
                site.centerX - tangent[0] * halfLength,
                centerY - relief * mix(0.18, 0.42, random()),
                site.centerY - tangent[1] * halfLength,
            ];
            const source = [site.centerX, centerY + relief, site.centerY];
            const sink = [
                site.centerX + tangent[0] * halfLength,
                centerY + relief * mix(-0.24, 0.22, random()),
                site.centerY + tangent[1] * halfLength,
            ];
            addSweep([
                root,
                [
                    site.centerX - tangent[0] * halfLength * 0.28 +
                        normal[0] * radius * mix(-0.22, 0.22, random()),
                    centerY + relief * 0.45,
                    site.centerY - tangent[1] * halfLength * 0.28 +
                        normal[1] * radius * mix(-0.22, 0.22, random()),
                ],
                source,
                sink,
            ], [
                radius * (high ? dispersive ? 0.52 : 0.34 : 0.38),
                radius * 0.78,
                radius,
                radius * (high ? dispersive ? 0.44 : 0.30 : 0.42),
            ], {
                density: mix(0.84, 1, random()),
                detail: high ? 0.76 : 0.34,
                phase: config.phaseBase,
                verticalScale: high ? mix(
                    dispersive ? 0.78 : 0.72,
                    dispersive ? 1.05 : 0.98,
                    random(),
                )
                    : mix(0.52, 0.76, random()),
                role: high ? "cc-gravity-wave-grain-source"
                    : "ac-shallow-thermal-colony-source",
                hierarchyLevel: 0,
                lifecycleStage: site.lifecycleStage,
            });
            const branchSelector = hashInteger(
                seed ^ Math.imul(index + 1, 0x45d9f3b),
            ) % 7;
            const branchCount = high
                ? branchSelector < 2 ? 0 : branchSelector < 6 ? 1 : 2
                : 2 + (index % 4 === 0 ? 1 : 0);
            for (let branch = 0; branch < branchCount; branch += 1) {
                const side = (
                    (branchSelector + branch + (site.domainIndex ?? 0)) % 2
                ) === 0 ? 1 : -1;
                const branchRadius = radius * mix(
                    high ? dispersive ? 0.38 : 0.34 : 0.30,
                    high ? dispersive ? 0.57 : 0.52 : 0.58,
                    random(),
                );
                const attachment = branch === 0 ? source : [
                    mix(root[0], source[0], 0.72),
                    mix(root[1], source[1], 0.72),
                    mix(root[2], source[2], 0.72),
                ];
                const alongDrift = mix(-0.55, 0.72, random());
                const lateralReach = mix(1.18, 1.92, random());
                addSweep([
                    attachment,
                    [
                        attachment[0] + normal[0] * branchRadius * side * 0.72 +
                            tangent[0] * branchRadius * alongDrift * 0.38,
                        attachment[1] + relief * mix(-0.06, 0.62, random()),
                        attachment[2] + normal[1] * branchRadius * side * 0.72 +
                            tangent[1] * branchRadius * alongDrift * 0.38,
                    ],
                    [
                        attachment[0] + normal[0] * branchRadius * side *
                            lateralReach +
                            tangent[0] * branchRadius * alongDrift,
                        attachment[1] + relief * mix(-0.18, 0.54, random()),
                        attachment[2] + normal[1] * branchRadius * side *
                            lateralReach +
                            tangent[1] * branchRadius * alongDrift,
                    ],
                ], [
                    radius * (dispersive ? 0.56 : high ? 0.50 : 0.42),
                    branchRadius,
                    branchRadius * (dispersive ? 0.42 : high ? 0.36 : 0.30),
                ], {
                    density: mix(dispersive ? 0.78 : 0.70, 0.90, random()),
                    detail: high ? 0.82 : 0.39,
                    phase: config.phaseBase,
                    verticalScale: high
                        ? mix(dispersive ? 0.72 : 0.68, 0.90, random())
                        : 0.64,
                    role: high ? "cc-grain-nested-ripple"
                        : "ac-thermal-nested-pulse",
                    hierarchyLevel: 1,
                    lifecycleStage: site.lifecycleStage,
                });
                secondaryLobeCount += 1;
            }
            ownerPoints.push([site.centerX, site.centerY]);
        }
        for (const [edgeIndex, [left, right]] of materialEdges.entries()) {
            const source = sites[left];
            const target = sites[right];
            const midpoint = [
                (source.centerX + target.centerX) * 0.5 +
                    Math.sin(edgeIndex * 1.71) * 0.008,
                baseY - mix(0.010, 0.026, random()),
                (source.centerY + target.centerY) * 0.5 +
                    Math.cos(edgeIndex * 1.37) * 0.008,
            ];
            addSweep([
                [source.centerX, baseY, source.centerY],
                midpoint,
                [target.centerX, baseY, target.centerY],
            ], [0.028, mix(0.021, 0.030, random()), 0.028], {
                density: mix(0.58, 0.76, random()),
                detail: 0.30,
                phase: config.phaseBase,
                verticalScale: 0.48,
                role: "ac-colony-moisture-saddle",
                hierarchyLevel: 0,
                lifecycleStage: "mature",
            });
        }
    } else if (variant === "castellanus") {
        // Keep one real source layer, but let tower births be selected from an
        // aperiodic domain field. Sorting is only for tracing the finite base;
        // site placement itself has no row/grid grammar.
        const axis = high ? wave.tangent : [
            Math.cos(moistureEnvelope[0].rotation),
            Math.sin(moistureEnvelope[0].rotation),
        ];
        const orderedSites = [...sites].sort((left, right) =>
            (left.centerX - 0.5) * axis[0] + (left.centerY - 0.5) * axis[1] -
            ((right.centerX - 0.5) * axis[0] + (right.centerY - 0.5) * axis[1]));
        const middleRenewalWeights = middle
            ? (() => {
                const weights = [];
                let logInterval = mix(-0.62, 0.62, random());
                for (let index = 0; index + 1 < orderedSites.length; index += 1) {
                    logInterval = logInterval * 0.24 +
                        mix(-1.08, 1.08, random()) * 0.76;
                    weights.push(Math.exp(logInterval + Math.sin(
                        (index + 0.31) * 2.399963229728653,
                    ) * 0.22));
                }
                return weights;
            })()
            : null;
        const middleRenewalTotal = middleRenewalWeights?.reduce(
            (sum, value) => sum + value,
            0,
        ) ?? 1;
        let middleRenewalCumulative = 0;
        const middleBasePhase = random() * Math.PI * 2;
        const basePoints = orderedSites.map((site, index) => {
            if (high) return [
                site.centerX,
                baseY +
                    Math.sin(index * 1.27 + seed * 1e-6) * 0.012 +
                    Math.sin(
                        site.centerX * Math.PI * 1.37 +
                        site.centerY * Math.PI * 0.83,
                    ) * 0.008,
                site.centerY,
            ];
            const amount = index === 0 ? 0 :
                middleRenewalCumulative / middleRenewalTotal;
            if (index < middleRenewalWeights.length) {
                middleRenewalCumulative += middleRenewalWeights[index];
            }
            const along = mix(-0.39, 0.39, amount);
            // A correlated renewal spectrum controls tower births. Two
            // incommensurate low-amplitude modes curve the physical source
            // through its moisture domains without turning it into a row or
            // letting best-candidate repulsion equalize every interval.
            const crossOffset = Math.sin(
                amount * Math.PI * 2 * 0.83 + middleBasePhase,
            ) * 0.048 + Math.sin(
                amount * Math.PI * 2 * 1.71 + middleBasePhase * 0.63,
            ) * 0.021 + (amount - 0.43) ** 2 * mix(-0.08, 0.08, random());
            const normal = [-axis[1], axis[0]];
            return [
                0.5 + axis[0] * along + normal[0] * crossOffset,
                baseY + Math.sin(index * 1.27 + seed * 1e-6) * 0.010,
                0.5 + axis[1] * along + normal[1] * crossOffset,
            ];
        });
        const commonBaseSupport = addSweep(basePoints, basePoints.map((_, index) =>
            0.056 * mix(high ? 0.88 : 0.78, 1.16,
                (hashInteger(seed + index * 271) % 1000) / 1000)), {
            density: high ? 0.94 : 0.86,
            detail: high ? 0.72 : 0.28,
            phase: config.phaseBase,
            verticalScale: high ? 0.72 : 0.38,
            role: high ? "cc-castellanus-common-wave-source"
                : "ac-castellanus-common-mixed-phase-source",
            lifecycleStage: "mature",
        });
        commonBaseCount = 1;
        materialEdges = orderedSites.slice(0, -1).map((site, index) => [
            sites.indexOf(site),
            sites.indexOf(orderedSites[index + 1]),
        ]);
        for (let index = 0; index < orderedSites.length; index += 1) {
            const site = orderedSites[index];
            const base = basePoints[index];
            const radius = high
                ? clamp(
                    0.047 * site.localScale * mix(0.82, 1.16, random()),
                    0.044,
                    0.068,
                )
                : 0.050 * site.localScale * mix(0.76, 1.18, random());
            const stageHeight = site.lifecycleStage === "growing" ? 1.06
                : site.lifecycleStage === "decaying" ? 0.72 : 1;
            const height = radius * (high ? mix(2.2, 3.8, random())
                : mix(2.7, 4.9, random())) * stageHeight;
            const cross = [-axis[1], axis[0]];
            const drift = radius * mix(-0.62, 0.62, random());
            const shoulder = [
                base[0] + cross[0] * drift * 0.45,
                base[1] + height * 0.54,
                base[2] + cross[1] * drift * 0.45,
            ];
            const crown = [
                base[0] + cross[0] * drift,
                base[1] + height,
                base[2] + cross[1] * drift,
            ];
            if (high) {
                // The interpolating tower sources are intentionally aperiodic,
                // while a uniform cubic B-spline only approximates its control
                // sites. Join each birth site back to the nearest occupied
                // sample on the curved common source with a broad C2 moisture
                // throat. This is authored condensate lineage, not a repair or
                // post-raster bridge, and remains curved/non-row-like.
                const attachment = commonBaseSupport.samples.reduce(
                    (nearest, sample) => {
                        const distance = Math.hypot(
                            sample.point[0] - base[0],
                            sample.point[1] - base[1],
                            sample.point[2] - base[2],
                        );
                        return !nearest || distance < nearest.distance
                            ? { ...sample, distance } : nearest;
                    },
                    null,
                );
                const midpoint = [
                    mix(attachment.point[0], base[0], 0.56) +
                        cross[0] * radius * mix(-0.10, 0.10, random()),
                    Math.min(attachment.point[1], base[1]) -
                        radius * mix(0.02, 0.10, random()),
                    mix(attachment.point[2], base[2], 0.56) +
                        cross[1] * radius * mix(-0.10, 0.10, random()),
                ];
                addSweep([
                    attachment.point,
                    midpoint,
                    base,
                ], [
                    Math.max(0.044, attachment.radius * 0.84),
                    Math.max(0.043, radius * 0.78),
                    Math.max(0.042, radius * 0.72),
                ], {
                    density: 0.92,
                    detail: 0.74,
                    phase: config.phaseBase,
                    verticalScale: 0.76,
                    role: "cc-castellanus-common-source-junction",
                    hierarchyLevel: 0,
                    lifecycleStage: site.lifecycleStage,
                });
            }
            addSweep([base, [base[0], base[1] + height * 0.23, base[2]],
                shoulder, crown], [
                radius * (high ? 0.70 : 0.52),
                radius * (high ? 0.90 : 0.78),
                radius * (high ? 1.04 : 1),
                radius * (high
                    ? site.lifecycleStage === "decaying" ? 0.62 : 0.78
                    : site.lifecycleStage === "decaying" ? 0.42 : 0.68),
            ], {
                density: mix(0.88, 1, random()),
                detail: high ? 0.80 : 0.34,
                phase: config.phaseBase,
                verticalScale: high ? 0.96 : 0.92,
                role: high ? "cc-castellanus-buoyant-ice-lineage"
                    : "ac-castellanus-buoyant-mixed-phase-lineage",
                hierarchyLevel: 0,
                lifecycleStage: site.lifecycleStage,
            });
            const crownSelector = hashInteger(
                seed ^ Math.imul(index + 1, 0x119de1f3),
            );
            const crownBranchCount = high
                ? 1 + (crownSelector % 3 === 0 ? 1 : 0)
                : 2;
            for (let branch = 0; branch < crownBranchCount; branch += 1) {
                const side = ((crownSelector + branch) & 1) === 0 ? -1 : 1;
                const branchRadius = radius * mix(
                    high ? 0.48 : 0.31,
                    high ? 0.64 : 0.52,
                    random(),
                );
                const streamwiseDrift = high
                    ? mix(-0.72, 0.86, random()) : 0;
                addSweep([
                    shoulder,
                    [
                        shoulder[0] + cross[0] * branchRadius * side * 0.9 +
                            axis[0] * branchRadius * streamwiseDrift * 0.36,
                        shoulder[1] + height * mix(0.12, 0.23, random()),
                        shoulder[2] + cross[1] * branchRadius * side * 0.9 +
                            axis[1] * branchRadius * streamwiseDrift * 0.36,
                    ],
                    [
                        crown[0] + cross[0] * branchRadius * side *
                            mix(1.2, 1.8, random()) +
                            axis[0] * branchRadius * streamwiseDrift,
                        crown[1] + height * mix(-0.06, 0.13, random()),
                        crown[2] + cross[1] * branchRadius * side *
                            mix(1.2, 1.8, random()) +
                            axis[1] * branchRadius * streamwiseDrift,
                    ],
                ], [
                    radius * (high ? 0.68 : 0.48),
                    branchRadius,
                    branchRadius * (high ? 0.38 : 0.34),
                ], {
                    density: mix(0.72, 0.91, random()),
                    detail: high ? 0.84 : 0.40,
                    phase: config.phaseBase,
                    verticalScale: high ? 0.88 : 0.94,
                    role: "castellanus-nested-crown-lineage",
                    hierarchyLevel: 1,
                    lifecycleStage: site.lifecycleStage,
                });
                secondaryLobeCount += 1;
            }
            ownerPoints.push([base[0], base[2]]);
        }
    } else {
        // Floccus is sampled from the same causal domains as castellanus, but
        // no common-base material is retained. Each tuft has an independent
        // decay stage, an attached nested crown, and a curved sedimentation
        // tail; nothing terminates as a free ellipsoid stamp.
        materialEdges = [];
        const shearHeading = mix(-0.92, 0.92, random());
        const shear = [Math.cos(shearHeading), Math.sin(shearHeading)];
        const cross = [-shear[1], shear[0]];
        for (let index = 0; index < sites.length; index += 1) {
            const site = sites[index];
            const lifecycleScale = site.lifecycleStage === "dissipating" ? 0.62 :
                site.lifecycleStage === "decaying" ? 0.82 : 1;
            const radius = high
                ? clamp(
                    0.053 * site.localScale * lifecycleScale *
                        mix(0.86, 1.16, random()),
                    0.047,
                    0.072,
                )
                : 0.054 * site.localScale * lifecycleScale *
                    mix(0.80, 1.15, random());
            const groupAltitude = high
                ? (
                    hashInteger(seed ^ Math.imul(
                        (site.domainIndex ?? 0) + 1,
                        0x165667b1,
                    )) / 4294967296 - 0.5
                ) * 0.060
                : 0;
            const centerY = baseY + groupAltitude +
                radius * mix(0.64, 1.48, random());
            const source = [site.centerX, centerY - radius * 0.62, site.centerY];
            const crown = [
                site.centerX + cross[0] * radius * mix(-0.34, 0.34, random()),
                centerY + radius * mix(0.46, 0.92, random()),
                site.centerY + cross[1] * radius * mix(-0.34, 0.34, random()),
            ];
            const outflow = [
                crown[0] + shear[0] * radius * mix(0.58, 1.22, random()),
                crown[1] + radius * mix(-0.20, 0.18, random()),
                crown[2] + shear[1] * radius * mix(0.58, 1.22, random()),
            ];
            addSweep([source, [site.centerX, centerY, site.centerY], crown,
                outflow], [
                radius * (high ? 0.52 : 0.40),
                radius,
                radius * (high ? 0.84 : 0.78),
                radius * (high ? 0.38 : 0.22),
            ], {
                density: site.lifecycleStage === "dissipating" ? 0.66 : 0.90,
                detail: high ? 0.86 : 0.48,
                phase: config.phaseBase,
                verticalScale: high ? 1.02 : 0.96,
                role: high ? "cc-floccus-decaying-ice-tuft-lineage"
                    : "ac-floccus-decaying-mixed-phase-tuft-lineage",
                hierarchyLevel: 0,
                lifecycleStage: site.lifecycleStage,
            });
            const tuftSelector = hashInteger(
                seed ^ Math.imul(index + 1, 0x27d4eb2d),
            );
            const tuftBranchCount = high
                ? 1 + (tuftSelector % 3 === 0 ? 1 : 0) +
                    (tuftSelector % 11 === 0 ? 1 : 0)
                : 2;
            for (let branch = 0; branch < tuftBranchCount; branch += 1) {
                const side = ((tuftSelector + branch) & 1) === 0 ? -1 : 1;
                const branchRadius = radius * mix(
                    high ? 0.45 : 0.28,
                    high ? 0.62 : 0.48,
                    random(),
                );
                const branchHeading = shearHeading +
                    side * mix(0.48, 1.08, random()) +
                    mix(-0.24, 0.24, random());
                const branchDirection = [
                    Math.cos(branchHeading),
                    Math.sin(branchHeading),
                ];
                addSweep([
                    crown,
                    [
                        crown[0] + branchDirection[0] * branchRadius,
                        crown[1] + branchRadius * mix(0.22, 0.66, random()),
                        crown[2] + branchDirection[1] * branchRadius,
                    ],
                    [
                        crown[0] + branchDirection[0] * branchRadius * 1.8 +
                            shear[0] * branchRadius * 0.7,
                        crown[1] + branchRadius * mix(0.06, 0.42, random()),
                        crown[2] + branchDirection[1] * branchRadius * 1.8 +
                            shear[1] * branchRadius * 0.7,
                    ],
                ], [
                    radius * (high ? 0.64 : 0.46),
                    branchRadius,
                    branchRadius * (high ? 0.38 : 0.24),
                ], {
                    density: mix(0.64, 0.86, random()),
                    detail: high ? 0.90 : 0.52,
                    phase: config.phaseBase,
                    verticalScale: high ? 0.90 : 0.92,
                    role: "floccus-source-attached-crown-filament",
                    hierarchyLevel: 1,
                    lifecycleStage: site.lifecycleStage,
                });
                secondaryLobeCount += 1;
            }
            const fallstreakCount = high && tuftSelector % 4 === 0 ? 2 : 1;
            for (let fallstreak = 0;
                fallstreak < fallstreakCount;
                fallstreak += 1) {
                const fallLength = radius * (high ? mix(1.7, 3.3, random())
                    : mix(1.3, 3.2, random()));
                const trailSide = fallstreakCount === 1
                    ? 0 : fallstreak === 0 ? -1 : 1;
                const trailStart = [
                    source[0] + cross[0] * radius * trailSide * 0.20,
                    source[1] + radius * 0.18,
                    source[2] + cross[1] * radius * trailSide * 0.20,
                ];
                addSweep([
                    trailStart,
                    [
                        trailStart[0] + shear[0] * fallLength * 0.18 +
                            cross[0] * fallLength * trailSide * 0.08,
                        trailStart[1] - fallLength * 0.34,
                        trailStart[2] + shear[1] * fallLength * 0.18 +
                            cross[1] * fallLength * trailSide * 0.08,
                    ],
                    [
                        trailStart[0] + shear[0] * fallLength * 0.55 +
                            cross[0] * fallLength * trailSide * 0.12,
                        trailStart[1] - fallLength,
                        trailStart[2] + shear[1] * fallLength * 0.55 +
                            cross[1] * fallLength * trailSide * 0.12,
                    ],
                ], [
                    radius * (high ? 0.48 : 0.24),
                    radius * (high ? 0.30 : 0.14),
                    radius * (high ? 0.14 : 0.035),
                ], {
                    density: mix(
                        high ? 0.48 : 0.38,
                        high ? 0.68 : 0.62,
                        random(),
                    ),
                    detail: high ? 0.96 : 0.76,
                    phase: high ? 1 : Math.max(0.52, config.phaseBase),
                    precipitation: high ? 0.46 : 0.66,
                    verticalScale: high ? 0.72 : 0.54,
                    role: "floccus-source-connected-sedimentation-tail",
                    hierarchyLevel: 1,
                    lifecycleStage: site.lifecycleStage,
                });
            }
            ownerPoints.push([site.centerX, site.centerY]);
        }
    }

    const clearSlots = cellularClearSlots(sites, naturalEdges, materialEdges, random);
    for (const slot of clearSlots.slice(0, high ? 12 : 10)) {
        addCellularDrySlotCavity(
            cavities,
            slot,
            variant === "castellanus"
                // Castellanus clear air belongs between the rising turrets,
                // never through their one physical common condensation base.
                // Cutting the base itself made a valid curved source layer
                // separate into five pieces at the 4x reconstruction footprint.
                ? baseY + (high ? 0.082 : 0.115)
                : variant === "floccus"
                    ? baseY + (high ? 0.015 : 0.025)
                    : baseY,
            high ? 0.020 : 0.030,
            variant === "castellanus" ? 0.42 : mix(0.58, 0.84, random()),
        );
    }
    const lifecycleCounts = Object.fromEntries([
        "forming", "growing", "mature", "eroding", "decaying", "dissipating",
    ].map((stage) => [stage,
        sites.filter((site) => site.lifecycleStage === stage).length]));
    const scale2Count = quantizedCloudSiteCount(sites, 24);
    const scale4Count = quantizedCloudSiteCount(sites, 12);
    return {
        kind: "primitive",
        primitives,
        cavities,
        baseY,
        groupCount: sites.length,
        ownerPoints,
        commonBaseCount,
        secondaryLobeCount,
        hierarchyLevelCount: maximumHierarchyLevel,
        cellClusterCount: domains.centers.length,
        crestCount,
        stackLayerCount: high ? 1 : 0,
        boundaryLobeCount: moistureEnvelope.length,
        detailBase: high ? 0.78 : 0.38,
        edgeNoise: high ? 0.008 : 0.012,
        // Ice cellular forms retain broad source-connected support, but their
        // optical depth is not uniform.  A bounded interior modulation and
        // cavity gain expose dry-air windows between rounded turrets/tufts
        // while preserving the material graph and its conservative majorant.
        interiorNoise: high
            ? variant === "castellanus" ? 0.010
                : variant === "floccus" ? 0.008 : 0.0008
            : 0.002,
        cavityInteriorGain: high
            ? variant === "castellanus" ? 6
                : variant === "floccus" ? 8 : 1
            : 1,
        densityEdgeHigh: high ? 0.011 : 0.016,
        fragmentary: variant === "floccus",
        warpStrength: high ? 0.010 : 0.016,
        warpAnisotropy: high ? [1, 0.42, 1] : [1, 0.38, 1],
        boundaryModel: high
            ? variant === "stratiformis"
                ? dispersive
                    ? "source-connected-c2-dispersive-gravity-wave-grain-packet"
                    : "source-connected-c2-gravity-wave-grain-packet"
                : variant === "castellanus"
                    ? "source-connected-c2-ice-castellanus-common-layer"
                    : "source-connected-c2-sedimenting-ice-tuft-colonies"
            : variant === "stratiformis"
                ? "source-connected-c2-shallow-mixed-phase-thermal-colonies"
                : variant === "castellanus"
                    ? "source-connected-c2-mixed-phase-castellanus-common-layer"
                    : "source-connected-c2-decaying-mixed-phase-tuft-colonies",
        cellularTopology: {
            genus: config.genus,
            species: config.species,
            mechanism: high
                ? dispersive ? "finite-dispersive-refracting-gravity-wave"
                    : "finite-refracting-gravity-wave"
                : "shallow-mixed-phase-thermal-colonies",
            siteCount: sites.length,
            domainCount: domains.centers.length,
            naturalNeighborEdgeCount: naturalEdges.length,
            naturalNeighborCycleRank: graphMetrics.cycleRank,
            materialEdgeCount: materialEdges.length,
            clearSlotCount: clearSlots.length,
            scale2ResolvedPeakCount: scale2Count,
            scale4ResolvedPeakCount: scale4Count,
            scale2PeakSurvival: scale2Count / sites.length,
            scale4PeakSurvival: scale4Count / sites.length,
            sourceConnectedSweepCount: primitives.filter((primitive) =>
                primitive.kind === "swept-c2" && primitive.sourceConnected).length,
            terminalEllipsoidCount: primitives.filter((primitive) =>
                primitive.kind === "ellipsoid").length,
            terminalCapsuleCount: primitives.filter((primitive) =>
                primitive.kind === "capsule").length,
            maximumHierarchyLevel,
            lifecycleCounts,
            meanCenterlineExcessCurvature: curvatureAccumulator /
                Math.max(1, curvatureSampleCount),
            verticalScaleRange: high
                ? variant === "castellanus" ? [0.72, 0.96]
                    : variant === "floccus" ? [0.72, 1.02]
                        : [0.68, 1.05]
                : variant === "castellanus" ? [0.38, 0.94] : [0.38, 0.96],
        },
    };
};

export const createUpperMiddleCellularTopology = ({
    volumeId,
    seed = CLOUD_MACRO_ATLAS_SEED,
} = {}) => {
    const sourceConfig = VOLUME_CONFIGS.find((candidate) =>
        candidate.id === volumeId);
    if (!sourceConfig || sourceConfig.builder !== "cellular" ||
        !["high", "middle"].includes(sourceConfig.level) ||
        !["stratiformis", "castellanus", "floccus"].includes(
            sourceConfig.variant,
        )) {
        throw new Error(`Unsupported upper/middle cellular topology ${volumeId}`);
    }
    const foundationProfile = foundationProfileForConfig(sourceConfig);
    const config = {
        ...sourceConfig,
        foundationProfile,
        topologyPolicy: topologyPolicyForFoundation(
            foundationProfile,
            sourceConfig.topologyPolicy,
        ),
    };
    return buildUpperMiddleCellularModel(
        config,
        hashInteger(seed ^ hashString(volumeId)),
    );
};

const addStratocumulusOpenWallArc = ({
    primitives,
    random,
    cell,
    startAngle,
    sweepAngle,
    radiusScale = 1.18,
    role = "foundation-sc-open-cell-cloudy-wall",
    hierarchyLevel = 1,
}) => {
    const knotCount = 5;
    const rotationCosine = Math.cos(cell.rotationRadians);
    const rotationSine = Math.sin(cell.rotationRadians);
    const halfDepth = clamp(
        (cell.topHeight - cell.baseHeight) * mix(0.34, 0.52, random()),
        0.024,
        0.047,
    );
    const nominalWidth = clamp(
        Math.min(cell.radiusX, cell.radiusY) * mix(0.42, 0.62, random()),
        0.024,
        0.040,
    );
    const radialDrift = mix(-0.12, 0.12, random());
    const crownDrift = mix(-0.006, 0.008, random());
    const points = [];
    const widths = [];
    const halfDepths = [];
    for (let knot = 0; knot < knotCount; knot += 1) {
        const amount = knot / (knotCount - 1);
        const angle = startAngle + sweepAngle * amount;
        const endpointEnvelope = Math.pow(Math.sin(amount * Math.PI), 0.38);
        const radialScale = radiusScale * (
            1 + radialDrift * (amount - 0.5) +
            mix(-0.045, 0.045, random()) * endpointEnvelope
        );
        const localX = Math.cos(angle) * cell.radiusX * radialScale;
        const localZ = Math.sin(angle) * cell.radiusY * radialScale;
        points.push([
            clamp(
                cell.centerX + localX * rotationCosine -
                    localZ * rotationSine,
                0.045,
                0.955,
            ),
            cell.baseHeight + halfDepth * mix(0.76, 0.94, random()) +
                crownDrift * endpointEnvelope,
            clamp(
                cell.centerY + localX * rotationSine +
                    localZ * rotationCosine,
                0.045,
                0.955,
            ),
        ]);
        const endpoint = knot === 0 || knot === knotCount - 1;
        // Real open-cell walls decay into their clear-air gaps. The support
        // itself tapers; no density mask cuts a mathematically complete ring.
        widths.push(nominalWidth * mix(
            endpoint ? 0.54 : 0.88,
            endpoint ? 0.72 : 1.12,
            random(),
        ));
        halfDepths.push(halfDepth * mix(
            endpoint ? 0.62 : 0.90,
            endpoint ? 0.82 : 1.10,
            random(),
        ));
    }
    addCirculationRibbonSurface(
        primitives,
        points,
        widths,
        halfDepths,
        {
            density: mix(0.84, 0.98, random()),
            detail: mix(0.20, 0.27, random()),
            phase: 0,
            lateralAsymmetry: mix(-0.22, 0.22, random()),
            undersideFraction: mix(0.70, 0.80, random()),
            hierarchyLevel,
            role,
        },
    );
};

/**
 * Material organization manifolds for Sc stratiformis states that are not a
 * closed-cell sheet. Their clear air is the absence of generated support:
 * there is no screen-space crop, atlas-space density mask, or periodic field.
 */
const buildStratocumulusOrganizationModel = (config, seed) => {
    const random = makeRandom(hashInteger(seed ^ 0x73632d6d));
    const primitives = [];
    const ownerPoints = [];
    const baseY = 0.34;
    const moistureEnvelope = buildMoistureEnvelope(
        makeRandom(hashInteger(seed ^ 0x73632d65)),
        "low",
    );
    const regime = config.scOrganizationRegime;
    let closedCellPatchCount = 0;
    let openWallArcCount = 0;
    let streetCorridorCount = 0;
    let cellClusterCount = 0;

    if (regime === "street") {
        const heading = mix(-0.78, 0.78, random());
        const tangent = [Math.cos(heading), Math.sin(heading)];
        const normal = [-tangent[1], tangent[0]];
        const laneCount = 5;
        const intervals = Array.from(
            { length: laneCount - 1 },
            () => mix(0.54, 1.62, random()),
        );
        const intervalSum = intervals.reduce((sum, value) => sum + value, 0);
        const laneOffsets = [-0.31];
        for (const interval of intervals) {
            laneOffsets.push(laneOffsets.at(-1) + interval / intervalSum * 0.62);
        }
        for (let lane = 0; lane < laneCount; lane += 1) {
            const laneLength = mix(0.52, 0.82, random()) *
                (lane === 0 || lane === laneCount - 1
                    ? mix(0.74, 0.92, random()) : 1);
            const laneCenter = mix(-0.09, 0.09, random());
            const breakCenter = mix(0.39, 0.63, random());
            const breakHalfWidth = mix(0.035, 0.080, random());
            const segments = [
                [0, Math.max(0.18, breakCenter - breakHalfWidth)],
                [Math.min(0.82, breakCenter + breakHalfWidth), 1],
            ];
            const secularBow = mix(-0.10, 0.10, random());
            const turning = mix(-0.055, 0.055, random());
            for (const [segmentStart, segmentEnd] of segments) {
                const points = [];
                const widths = [];
                const halfDepths = [];
                const knotCount = 5;
                const nominalWidth = mix(0.027, 0.046, random());
                const nominalDepth = mix(0.026, 0.052, random());
                for (let knot = 0; knot < knotCount; knot += 1) {
                    const localAmount = knot / (knotCount - 1);
                    const amount = mix(segmentStart, segmentEnd, localAmount);
                    const along = laneCenter + (amount - 0.5) * laneLength;
                    const across = laneOffsets[lane] +
                        secularBow * ((amount - 0.42) ** 2 - 0.08) +
                        turning * (amount - 0.5) +
                        mix(-0.012, 0.012, random());
                    points.push([
                        clamp(0.5 + tangent[0] * along + normal[0] * across,
                            0.045, 0.955),
                        baseY + nominalDepth * mix(0.78, 1.02, random()),
                        clamp(0.5 + tangent[1] * along + normal[1] * across,
                            0.045, 0.955),
                    ]);
                    const endpoint = knot === 0 || knot === knotCount - 1;
                    widths.push(nominalWidth * mix(
                        endpoint ? 0.54 : 0.88,
                        endpoint ? 0.76 : 1.12,
                        random(),
                    ));
                    halfDepths.push(nominalDepth * mix(
                        endpoint ? 0.66 : 0.90,
                        endpoint ? 0.84 : 1.10,
                        random(),
                    ));
                }
                addCirculationRibbonSurface(
                    primitives,
                    points,
                    widths,
                    halfDepths,
                    {
                        density: mix(0.86, 0.98, random()),
                        detail: mix(0.20, 0.26, random()),
                        phase: 0,
                        lateralAsymmetry: mix(-0.18, 0.18, random()),
                        undersideFraction: mix(0.70, 0.79, random()),
                        hierarchyLevel: 1 + lane % 3,
                        role: "foundation-sc-finite-roll-cloud-street",
                    },
                );
                const centerPoint = points[Math.floor(points.length / 2)];
                ownerPoints.push([centerPoint[0], centerPoint[2]]);
                streetCorridorCount += 1;
            }
        }
        cellClusterCount = laneCount;
    } else {
        const topology = createStratocumulusStratiformisTopology({
            seed: hashInteger(seed ^ 0x73632d74),
            moistureEnvelope,
            baseY,
            cellCount: 28,
        });
        const candidates = topology.cells.filter((cell) =>
            cell.centerX > 0.08 && cell.centerX < 0.92 &&
            cell.centerY > 0.08 && cell.centerY < 0.92);
        if (regime === "open-cell") {
            const openCells = candidates.filter((_, index) => index % 2 === 0)
                .slice(0, 13);
            for (const [index, cell] of openCells.entries()) {
                const initialAngle = random() * Math.PI * 2;
                const firstSweep = mix(1.55, 2.25, random());
                const secondSweep = mix(1.20, 1.95, random());
                addStratocumulusOpenWallArc({
                    primitives,
                    random,
                    cell,
                    startAngle: initialAngle,
                    sweepAngle: firstSweep,
                    radiusScale: mix(1.18, 1.46, random()),
                    hierarchyLevel: 1 + index % 3,
                });
                addStratocumulusOpenWallArc({
                    primitives,
                    random,
                    cell,
                    startAngle: initialAngle + firstSweep + mix(0.38, 0.78, random()),
                    sweepAngle: secondSweep,
                    radiusScale: mix(1.12, 1.40, random()),
                    hierarchyLevel: 2 + index % 2,
                });
                ownerPoints.push([cell.centerX, cell.centerY]);
                openWallArcCount += 2;
            }
            cellClusterCount = Math.max(3, topology.domainCount);
        } else {
            const closedCells = candidates.filter((_, index) => index % 3 === 0)
                .slice(0, 8);
            const openCells = candidates.filter((_, index) => index % 3 !== 0)
                .filter((_, index) => index % 2 === 0)
                .slice(0, 9);
            for (const sourceCell of closedCells) {
                const cell = {
                    ...sourceCell,
                    radiusX: sourceCell.radiusX * mix(1.04, 1.18, random()),
                    radiusY: sourceCell.radiusY * mix(1.02, 1.16, random()),
                    topHeight: sourceCell.topHeight * mix(0.995, 1.012, random()),
                    wallFraction: mix(0.38, 0.50, random()),
                };
                addCirculationCellSurface(primitives, cell, {
                    density: mix(0.86, 0.98, random()),
                    detail: mix(0.20, 0.27, random()),
                    phase: 0,
                    role: "foundation-sc-transition-surviving-closed-cell",
                });
                ownerPoints.push([cell.centerX, cell.centerY]);
                closedCellPatchCount += 1;
            }
            for (const [index, cell] of openCells.entries()) {
                addStratocumulusOpenWallArc({
                    primitives,
                    random,
                    cell,
                    startAngle: random() * Math.PI * 2,
                    sweepAngle: mix(1.35, 2.35, random()),
                    radiusScale: mix(1.10, 1.38, random()),
                    role: "foundation-sc-transition-drizzle-cold-pool-wall",
                    hierarchyLevel: 2 + index % 2,
                });
                ownerPoints.push([cell.centerX, cell.centerY]);
                openWallArcCount += 1;
            }
            cellClusterCount = Math.max(3, topology.domainCount);
        }
    }

    const resolvedCellCount = ownerPoints.length;
    const boundaryModel = regime === "open-cell"
        ? "finite-drizzle-organized-open-cell-wall-field"
        : regime === "street"
            ? "finite-unequal-boundary-layer-roll-corridors"
            : "finite-material-closed-open-transition-mosaic";
    return {
        kind: "primitive",
        primitives,
        cavities: [],
        baseY,
        groupCount: resolvedCellCount,
        ownerPoints,
        commonBaseCount: 0,
        secondaryLobeCount: 0,
        hierarchyLevelCount: Math.round(geometricMidpoint(
            config.foundationProfile.hierarchyLevels,
        )),
        cellClusterCount,
        crestCount: 0,
        stackLayerCount: 0,
        boundaryLobeCount: moistureEnvelope.length,
        stratiformisResolvedCellCount: resolvedCellCount,
        stratiformisNaturalNeighborEdgeCount: 0,
        stratiformisNaturalNeighborCycleRank: 0,
        stratiformisMaterialEdgeCount: 0,
        stratiformisMaterialCycleRank: 0,
        stratiformisClearChannelCount: 0,
        stratiformisColdPoolCavityCount: 0,
        stratiformisCirculationCellSurfaceCount: closedCellPatchCount,
        stratiformisCirculationRibbonSurfaceCount:
            openWallArcCount + streetCorridorCount,
        stratiformisOpenWallArcCount: openWallArcCount,
        stratiformisStreetCorridorCount: streetCorridorCount,
        stratiformisClosedCellPatchCount: closedCellPatchCount,
        stratiformisLegacyEllipsoidCount: 0,
        stratiformisLegacyCapsuleCount: 0,
        stratiformisMinimumInteriorClearance: 0,
        stratiformisMaximumUndersideAmplitude: 0,
        stratiformisScale2ResolvedCellCount: quantizedCloudSiteCount(
            ownerPoints,
            24,
            (point) => point,
        ),
        stratiformisScale4ResolvedCellCount: quantizedCloudSiteCount(
            ownerPoints,
            12,
            (point) => point,
        ),
        detailBase: 0.17,
        edgeNoise: 0.007,
        interiorNoise: 0.003,
        densityEdgeHigh: 0.012,
        fragmentary: false,
        warpStrength: 0.006,
        warpAnisotropy: [1, 0.06, 1],
        stratiformisExteriorEdgeNoise: 0.007,
        stratiformisExteriorWarpStrength: 0.006,
        stratiformisOrganizationRegime: regime,
        stratiformisPlacementRegime: config.scPlacementRegime,
        boundaryModel,
    };
};

/**
 * Foundation-qualified Cc/Ac/Sc macrogeometry.
 *
 * Element diameter controls only the internal grain/turret scale. The moisture
 * envelope controls the finite owner boundary. This prevents a 100 km deck
 * from turning each embedded element into a 100 km puff when the runtime
 * changes owner extent.
 */
const buildFoundationCellularModel = (config, seed) => {
    const random = makeRandom(seed);
    const profile = config.foundationProfile;
    const high = profile.family === "high";
    const middle = profile.family === "middle";
    const low = profile.family === "low";
    const primitives = [];
    const cavities = [];
    const ownerPoints = [];
    const stratiformCellNodes = [];
    const variant = config.variant;
    if (low && variant === "stratiformis" &&
        config.scOrganizationRegime !== "closed-cell") {
        return buildStratocumulusOrganizationModel(config, seed);
    }
    if ((high || middle) &&
        ["stratiformis", "castellanus", "floccus"].includes(variant)) {
        return buildUpperMiddleCellularModel(config, seed);
    }
    const baseY = high ? 0.61 : middle ? 0.48 : 0.34;
    const moistureEnvelope = buildMoistureEnvelope(random, config.level);
    let secondaryLobeCount = 0;
    let commonBaseCount = 0;
    let cellClusterCount = 0;
    let waveCrestCount = 0;
    let lowStratiformisTopology = null;

    const addArticulatedElement = ({
        center,
        radius,
        verticalScale,
        phase,
        detail,
        role,
        raggedBase = false,
        crownBias = 0.2,
    }) => {
        const lobeCount = low && variant === "stratiformis"
            ? 3 + Math.floor(random() * 2)
            : 3 + Math.floor(random() * 3);
        const lobePhase = random() * Math.PI * 2;
        const centers = [];
        for (let lobe = 0; lobe < lobeCount; lobe += 1) {
            const primary = lobe === 0;
            const angle = lobePhase + lobe * 2.399963229728653 +
                mix(-0.24, 0.24, random());
            const scale = primary ? mix(0.82, 1.08, random()) :
                mix(0.42, 0.73, random());
            const offset = primary ? 0 : radius * mix(0.34, 0.76, random());
            const lobeCenter = [
                center[0] + Math.cos(angle) * offset,
                center[1] + radius * (
                    primary ? mix(-0.08, 0.10, random()) :
                        mix(-0.12, crownBias, random())
                ),
                center[2] + Math.sin(angle) * offset * mix(0.72, 1.13, random()),
            ];
            addPrimitiveEllipsoid(primitives, lobeCenter, [
                radius * scale * mix(0.86, 1.25, random()),
                radius * scale * verticalScale * mix(0.78, 1.12, random()),
                radius * scale * mix(0.80, 1.20, random()),
            ], {
                density: primary ? mix(0.90, 1, random()) : mix(0.72, 0.93, random()),
                detail,
                phase,
                rotation: random() * Math.PI,
                role,
            });
            if (low && variant === "stratiformis" && !primary) {
                // A closed-cell Sc element is an articulated part of one
                // inversion deck, not a set of merely overlapping puffs. At
                // 48^3 a visually overlapping daughter can otherwise miss
                // the primary by one quantized y voxel. Materialize the
                // cloudy-wall throat in the source geometry so connectivity
                // is reconstructible without post-generation island removal.
                addCapsule(
                    primitives,
                    centers[0],
                    lobeCenter,
                    Math.max(0.022, radius * scale * 0.30),
                    {
                        density: 0.86,
                        detail,
                        phase,
                        verticalScale: 0.72,
                        role: "foundation-sc-cell-internal-throat",
                    },
                );
            }
            centers.push(lobeCenter);
            secondaryLobeCount += 1;
        }
        if (raggedBase) {
            const cutRadius = radius * mix(0.30, 0.50, random());
            cavities.push({
                center: [
                    center[0] + mix(-0.42, 0.42, random()) * radius,
                    center[1] - radius * verticalScale * mix(0.42, 0.70, random()),
                    center[2] + mix(-0.38, 0.38, random()) * radius,
                ],
                radii: [
                    cutRadius * mix(0.8, 1.25, random()),
                    cutRadius * mix(0.46, 0.78, random()),
                    cutRadius * mix(0.72, 1.18, random()),
                ],
                rotation: random() * Math.PI,
                strength: mix(0.62, 0.88, random()),
            });
        }
        return centers;
    };

    if (variant === "castellanus") {
        // WMO castellanus has one common horizontal base. Perspective may make
        // it look like a row, but the condensate itself is not three cloned
        // rows. Unequal intervals and a curved finite axis reject a capsule
        // fence while retaining one reconstructible connected formation.
        const turretCount = high ? 7 : middle ? 7 : 6;
        // Turrets are buoyant events along one unstable layer. Model their
        // spacing as a correlated renewal spectrum: broad gaps persist for a
        // few events, but no fixed motif or Cartesian cell interval repeats.
        const intervalWeights = [];
        let logInterval = mix(-0.42, 0.42, random());
        for (let interval = 0; interval < turretCount - 1; interval += 1) {
            const innovation = mix(-0.92, 0.92, random());
            logInterval = logInterval * 0.28 + innovation * 0.72;
            const quasiperiodicDrift = Math.sin(
                (interval + 0.37) * 2.399963229728653 + random() * 0.34,
            ) * 0.19;
            intervalWeights.push(Math.exp(logInterval + quasiperiodicDrift));
        }
        const intervalTotal = intervalWeights.reduce((sum, value) => sum + value, 0);
        let cumulative = 0;
        const bases = [];
        const baseRotation = mix(-0.30, 0.30, random());
        const tangent = [Math.cos(baseRotation), Math.sin(baseRotation)];
        const normal = [-tangent[1], tangent[0]];
        const centerlineModes = Array.from({ length: 3 }, (_, mode) => ({
            frequency: [0.73, 1.37, 2.19][mode] * mix(0.90, 1.10, random()),
            amplitude: (high ? 0.046 : middle ? 0.062 : 0.078) /
                Math.pow(mode + 1, 1.18) * mix(0.72, 1.20, random()),
            phase: random() * Math.PI * 2,
        }));
        for (let turret = 0; turret < turretCount; turret += 1) {
            const t = turret === 0 ? 0 : cumulative / intervalTotal;
            if (turret < intervalWeights.length) cumulative += intervalWeights[turret];
            const along = mix(-0.37, 0.37, t);
            const packetEnvelope = Math.pow(Math.sin(t * Math.PI), 0.42);
            const bow = centerlineModes.reduce(
                (sum, mode) => sum + Math.sin(
                    t * Math.PI * 2 * mode.frequency + mode.phase,
                ) * mode.amplitude,
                0,
            ) * packetEnvelope +
                (t - 0.36) ** 2 * mix(
                    high ? -0.05 : -0.085,
                    high ? 0.05 : 0.085,
                    random(),
                );
            const cx = 0.5 + tangent[0] * along + normal[0] * bow;
            const cz = 0.5 + tangent[1] * along + normal[1] * bow;
            const radius = (high ? 0.035 : middle ? 0.052 : 0.069) *
                mix(0.72, 1.26, random());
            const towerHeight = radius * mix(
                high ? 2.2 : middle ? 2.5 : 2.0,
                high ? 4.0 : middle ? 4.6 : 3.8,
                random(),
            );
            const drift = mix(-0.32, 0.32, random()) * radius;
            const base = [cx, baseY, cz];
            const shoulder = [
                cx + normal[0] * drift,
                baseY + towerHeight * 0.58,
                cz + normal[1] * drift,
            ];
            const crown = [
                cx + normal[0] * drift * 1.35,
                baseY + towerHeight,
                cz + normal[1] * drift * 1.35,
            ];
            bases.push(base);
            ownerPoints.push([cx, cz]);
            addCapsule(
                primitives,
                base,
                shoulder,
                radius * mix(
                    high ? 0.72 : middle ? 0.46 : 0.54,
                    high ? 0.88 : middle ? 0.60 : 0.70,
                    random(),
                ),
                {
                density: 0.94,
                detail: high ? 0.76 : middle ? 0.28 : 0.19,
                phase: config.phaseBase,
                verticalScale: 0.96,
                role: "foundation-castellanus-turret",
                },
            );
            addCapsule(
                primitives,
                shoulder,
                crown,
                radius * mix(
                    high ? 0.62 : middle ? 0.40 : 0.48,
                    high ? 0.78 : middle ? 0.55 : 0.64,
                    random(),
                ),
                {
                    density: 0.90,
                    detail: high ? 0.78 : middle ? 0.30 : 0.21,
                    phase: config.phaseBase,
                    verticalScale: 0.98,
                    role: "foundation-castellanus-upper-turret",
                },
            );
            if (middle) {
                // Mid-level castellanus is a sequence of buoyant pulses above
                // one stable deck, not a set of smooth extruded columns. Two
                // overlapping asymmetric pulse colonies hide the thin
                // connective updraft while preserving its material continuity.
                for (const [pulseT, pulseScale] of [
                    [0.34, mix(0.70, 0.88, random())],
                    [0.66, mix(0.58, 0.78, random())],
                ]) {
                    addArticulatedElement({
                        center: [
                            mix(base[0], crown[0], pulseT) +
                                normal[0] * radius * mix(-0.16, 0.16, random()),
                            mix(base[1], crown[1], pulseT),
                            mix(base[2], crown[2], pulseT) +
                                normal[1] * radius * mix(-0.16, 0.16, random()),
                        ],
                        radius: radius * pulseScale,
                        verticalScale: mix(0.82, 1.08, random()),
                        phase: config.phaseBase,
                        detail: 0.30,
                        role: "foundation-castellanus-buoyant-pulse",
                        raggedBase: false,
                        crownBias: 0.36,
                    });
                }
            }
            addArticulatedElement({
                center: crown,
                radius: radius * mix(0.72, 0.94, random()),
                verticalScale: high ? 0.72 : 0.88,
                phase: config.phaseBase,
                detail: high ? 0.82 : middle ? 0.32 : 0.22,
                role: "foundation-castellanus-crown",
                raggedBase: false,
                crownBias: 0.42,
            });
        }
        for (let index = 0; index + 1 < bases.length; index += 1) {
            const baseRadius = (high ? 0.050 : middle ? 0.058 : 0.065) *
                mix(0.92, 1.12, random());
            addCapsule(primitives, bases[index], bases[index + 1],
                baseRadius, {
                    density: 0.82,
                    detail: high ? 0.72 : middle ? 0.25 : 0.18,
                    phase: config.phaseBase,
                    verticalScale: 0.30,
                    role: "foundation-single-common-base",
                });
            const distance = Math.hypot(
                bases[index + 1][0] - bases[index][0],
                bases[index + 1][2] - bases[index][2],
            );
            // The capsule is the actual condensate bridge. Avoid resampling it
            // into equally spaced support beads, which reintroduced a strong
            // four-voxel autocorrelation even when turret births were random.
            if (distance > 0.17) {
                const supportT = mix(0.34, 0.66, random());
                addPrimitiveEllipsoid(primitives, [
                    mix(bases[index][0], bases[index + 1][0], supportT),
                    baseY,
                    mix(bases[index][2], bases[index + 1][2], supportT),
                ], [
                    baseRadius * mix(0.88, 1.12, random()),
                    high ? 0.025 : middle ? 0.031 : 0.038,
                    baseRadius * mix(0.86, 1.10, random()),
                ], {
                    density: 0.78,
                    detail: high ? 0.72 : middle ? 0.25 : 0.18,
                    phase: config.phaseBase,
                    role: "foundation-common-base-renewal-support",
                });
            }
        }
        commonBaseCount = 1;
    } else if (variant === "floccus") {
        // Floccus preserves correlation with a lost castellanus base but no
        // continuous base. A sheared, irregular chain gives that causal memory
        // without a Poisson bead field.
        const groupCount = high ? 9 : middle ? 9 : 7;
        const heading = mix(-0.68, 0.68, random());
        const tangent = [Math.cos(heading), Math.sin(heading)];
        const normal = [-tangent[1], tangent[0]];
        const anchors = [];
        const intervalWeights = Array.from(
            { length: groupCount - 1 },
            () => mix(0.34, 1.92, random()),
        );
        const intervalTotal = intervalWeights.reduce((sum, value) => sum + value, 0);
        let cumulative = 0;
        for (let group = 0; group < groupCount; group += 1) {
            const t = group === 0 ? 0 : cumulative / intervalTotal;
            if (group < intervalWeights.length) cumulative += intervalWeights[group];
            const along = mix(-0.39, 0.39, t);
            const cross = Math.sin(t * Math.PI * mix(1.1, 1.8, random()) + 0.4) *
                mix(0.025, 0.075, random()) +
                mix(-0.045, 0.045, random());
            const cx = 0.5 + tangent[0] * along + normal[0] * cross;
            const cz = 0.5 + tangent[1] * along + normal[1] * cross;
            const radius = (high ? 0.048 : middle ? 0.054 : 0.060) *
                mix(
                    high ? 0.75 : middle ? 0.68 : 0.72,
                    high ? 1.30 : middle ? 1.18 : 1.06,
                    random(),
                );
            const center = [
                cx,
                baseY + radius * mix(0.30, 0.95, random()),
                cz,
            ];
            anchors.push([cx, cz]);
            ownerPoints.push([cx, cz]);
            addArticulatedElement({
                center,
                radius,
                verticalScale: high ? 0.78 : middle ? 0.96 : 0.86,
                phase: config.phaseBase,
                detail: high ? 0.82 : middle ? 0.42 : 0.30,
                role: "foundation-floccus-tuft",
                raggedBase: true,
                crownBias: 0.48,
            });
            if (high || middle || random() > 0.78) {
                const trailLength = radius * mix(high ? 2.0 : 1.4, high ? 4.8 : 3.2, random());
                const trailEnd = [
                    center[0] + tangent[0] * trailLength * mix(0.45, 0.80, random()),
                    center[1] - trailLength,
                    center[2] + tangent[1] * trailLength * mix(0.45, 0.80, random()),
                ];
                addCapsule(primitives, [
                    center[0], center[1] - radius * 0.30, center[2],
                ], trailEnd, radius * mix(0.16, 0.24, random()), {
                    density: mix(0.42, 0.68, random()),
                    detail: high ? 0.94 : 0.72,
                    phase: high ? 1 : Math.max(config.phaseBase, 0.48),
                    precipitation: high ? 0.46 : 0.62,
                    verticalScale: 0.48,
                    role: "foundation-floccus-virga",
                });
            }
        }
        cellClusterCount = 2;
    } else {
        // Stratiformis differs by altitude: Cc is a fine broken grain/ripple
        // sheet, Ac a larger mixed merged/separate layer, and Sc an
        // inversion-bounded closed-cell deck. All share one finite moisture
        // system, never one owner-scale puff.
        const targetCount = high ? 26 : middle ? 18
            : config.scPlacementRegime === "immediate-overcast" ? 32 : 28;
        // Cirrocumulus stratiformis is gravity-wave cloud, not a miniature
        // copy of the cellular Ac/Sc generator. Build a finite packet of
        // phase-coherent, broken crests. Individual grains share the local
        // wave tangent while their spacing, wavelength, crest curvature and
        // packet termination drift independently. This preserves the WMO
        // extensive ripple sheet without producing a dot grid or infinite
        // sine bands.
        const highWavePacket = high ? (() => {
            const dispersive = config.topologyExemplarStyle ===
                "dispersive-oblique-packet";
            const packetHeading = mix(-0.72, 0.72, random());
            const crestCounts = dispersive ? [8, 6, 5, 4] : [8, 7, 6, 5];
            const points = [];
            const scales = [];
            // Gravity-wave crests remain phase-related, but atmospheric
            // dispersion and refraction do not produce equally spaced rails.
            // A bounded renewal process supplies non-harmonic crest spacing
            // without replacing the physical wave packet with generic noise.
            const crestIntervals = Array.from(
                { length: crestCounts.length - 1 },
                (_, index) => mix(0.58, 1.58, random()) *
                    (0.82 + ((index * 0.61803398875 + 0.27) % 1) * 0.36),
            );
            const intervalSum = crestIntervals.reduce(
                (sum, value) => sum + value,
                0,
            );
            const crestOffsets = [-0.215];
            for (const interval of crestIntervals) {
                crestOffsets.push(
                    crestOffsets.at(-1) + interval / intervalSum * 0.43,
                );
            }
            for (let crest = 0; crest < crestCounts.length; crest += 1) {
                const count = crestCounts[crest];
                // A real packet refracts and disperses: neighboring crests
                // are locally coherent, not mathematically parallel copies.
                const crestHeading = packetHeading +
                    (crest - (crestCounts.length - 1) * 0.5) *
                        (dispersive ? mix(-0.085, 0.085, random()) : 0) +
                    mix(-0.075, 0.075, random());
                const tangent = [Math.cos(crestHeading), Math.sin(crestHeading)];
                const normal = [-tangent[1], tangent[0]];
                const intervalWeights = Array.from(
                    { length: count - 1 },
                    (_, interval) => {
                        const nonRepeatingMotif = 0.32 +
                            ((interval * 0.754877666 + crest * 0.438579) % 1) * 1.68;
                        return nonRepeatingMotif * mix(0.68, 1.36, random());
                    },
                );
                const intervalTotal = intervalWeights.reduce(
                    (sum, value) => sum + value,
                    0,
                );
                let cumulative = 0;
                const halfLength = mix(0.29, 0.39, random()) *
                    (crest === 0 || crest === crestCounts.length - 1
                        ? mix(0.76, 0.91, random()) : 1);
                const wavelengthDrift = mix(0.78, 1.42, random());
                const crestPhase = random() * Math.PI * 2;
                const secondaryPhase = random() * Math.PI * 2;
                const primaryCurvature = mix(0.016, 0.046, random());
                const secondaryCurvature = mix(0.006, 0.021, random());
                const secularCurvature = mix(-0.065, 0.065, random());
                for (let grain = 0; grain < count; grain += 1) {
                    const t = grain === 0 ? 0 : cumulative / intervalTotal;
                    if (grain < intervalWeights.length) {
                        cumulative += intervalWeights[grain];
                    }
                    const along = mix(-halfLength, halfLength, t);
                    const packetEnvelope = Math.pow(Math.sin(t * Math.PI), 0.32);
                    const curvedOffset = crestOffsets[crest] +
                        Math.sin(
                            t * Math.PI * wavelengthDrift + crestPhase,
                        ) * primaryCurvature +
                        Math.sin(
                            t * Math.PI * (2.11 + wavelengthDrift * 0.37) +
                                secondaryPhase,
                        ) * secondaryCurvature +
                        (t - 0.5) ** 2 * secularCurvature;
                    const stagger = mix(-0.026, 0.026, random()) *
                        (0.45 + packetEnvelope * 0.55);
                    points.push([
                        clamp(
                            0.5 + tangent[0] * (along + stagger) +
                                normal[0] * curvedOffset,
                            0.075,
                            0.925,
                        ),
                        clamp(
                            0.5 + tangent[1] * (along + stagger) +
                                normal[1] * curvedOffset,
                            0.075,
                            0.925,
                        ),
                    ]);
                    scales.push(
                        mix(0.57, 1.12, random()) *
                            mix(0.72, 1, packetEnvelope),
                    );
                }
            }
            return { points, scales, clusterCount: crestCounts.length };
        })() : null;
        lowStratiformisTopology = low
            ? createStratocumulusStratiformisTopology({
                seed,
                moistureEnvelope,
                baseY,
                cellCount: targetCount,
                radiusScale: config.scPlacementRegime === "immediate-overcast"
                    ? 1.12 : 1,
            })
            : null;
        const clustered = highWavePacket ?? (lowStratiformisTopology
            ? {
                points: lowStratiformisTopology.cells.map((cell) => [
                    cell.centerX,
                    cell.centerY,
                ]),
                scales: lowStratiformisTopology.cells.map((cell) =>
                    Math.sqrt(cell.radiusX * cell.radiusY) / 0.050),
                clusterCount: lowStratiformisTopology.domainCount,
            }
            : clusteredPointsInEnvelope(
                random,
                targetCount,
                middle ? 5 : 4,
                moistureEnvelope,
                config.level,
            ));
        // Reserve a reconstruction halo around the finite low deck. Its
        // runtime owner may be kilometres wide, but the canonical condensate
        // boundary must still end inside the volume rather than being clipped
        // into an atlas-face mask.
        const formationPoints = low
            ? clustered.points
            : high
                // Preserve the small resolved grains while opening the clear
                // channels between gravity-wave crests. Enlarging the finite
                // packet's *spacing* rather than shrinking condensate keeps
                // each grain reconstructible at 2x/4x and prevents Cc from
                // collapsing into a continuous marine-cell-like deck.
                ? clustered.points.map(([x, z]) => [
                    0.5 + (x - 0.5) * 1.08,
                    0.5 + (z - 0.5) * 1.08,
                ])
                : clustered.points;
        cellClusterCount = clustered.clusterCount;
        for (let index = 0; index < formationPoints.length; index += 1) {
            const [cx, cz] = formationPoints[index];
            const macroScale = clamp(
                clustered.scales[index],
                high ? 0.48 : 0.56,
                high ? 1.30 : 1.38,
            );
            const topologyCell = lowStratiformisTopology?.cells[index] ?? null;
            const radius = topologyCell
                ? Math.sqrt(topologyCell.radiusX * topologyCell.radiusY)
                : (high
                ? config.topologyExemplarStyle === "dispersive-oblique-packet"
                    ? 0.052 : 0.044
                : middle ? 0.052 : 0.073) * macroScale;
            const y = topologyCell
                ? (topologyCell.baseHeight + topologyCell.topHeight) * 0.5
                : baseY + (high
                    ? Math.sin(
                        cx * Math.PI * 2.3 + cz * Math.PI * 1.7 +
                            seed * 0.000001,
                    ) * radius * 0.18
                    : (fbm3(
                        cx * 2.7 + 1.2,
                        0.5,
                        cz * 2.4 - 3.7,
                        seed + 6173,
                    ) - 0.5) * radius * 0.48);
            ownerPoints.push([cx, cz]);
            if (topologyCell) {
                // One smooth circulation surface replaces the former primary
                // ellipsoid plus three/four daughter ellipsoids and capsule
                // throats. The natural-neighbor graph remains authoritative;
                // its edges are materialized below as flattened C2 wall
                // ribbons, not as a necklace of round tubes.
                addCirculationCellSurface(primitives, topologyCell, {
                    density: mix(0.88, 1, random()),
                    detail: mix(0.21, 0.27, random()),
                    phase: 0,
                });
                secondaryLobeCount += topologyCell.planModes.length +
                    topologyCell.crownModes.length;
            } else {
                addArticulatedElement({
                    center: [cx, y, cz],
                    radius,
                    verticalScale: high
                    ? config.topologyExemplarStyle ===
                        "dispersive-oblique-packet"
                        ? mix(0.46, 0.70, random())
                        : mix(0.36, 0.58, random())
                    : middle ? mix(0.40, 0.72, random())
                        : mix(0.32, 0.56, random()),
                phase: config.phaseBase,
                detail: high ? 0.72 : middle ? 0.30 : 0.18,
                role: high ? "foundation-cc-grain"
                    : middle ? "foundation-ac-element" : "foundation-sc-cell-mass",
                // The materialized low stratiformis state is a connected
                // closed-cell deck. Its negative space belongs between cells,
                // not as deep per-element underside bites that can sever a
                // complete cell from its cloudy wall network.
                raggedBase: false,
                crownBias: high ? 0.12 : 0.24,
                });
            }
            if (low) stratiformCellNodes.push({
                center: [cx, y, cz],
                radius,
                baseHeight: topologyCell.baseHeight,
                topHeight: topologyCell.topHeight,
            });
        }
        if (low && lowStratiformisTopology) {
            // Materialize the full local circulation graph rather than a
            // minimum spanning tree. Gabriel neighbors follow the irregular
            // cell packing and retain real loops. Each neck bows gently below
            // the crowns with unequal width/depth, preserving narrow clear
            // channels above it instead of drawing a uniform tubular rail.
            for (const [edgeIndex, [from, to]] of
                lowStratiformisTopology.materialEdges.entries()) {
                const source = stratiformCellNodes[from];
                const target = stratiformCellNodes[to];
                const sourceCell = lowStratiformisTopology.cells[from];
                const targetCell = lowStratiformisTopology.cells[to];
                const minimumRadius = Math.min(source.radius, target.radius);
                // Four-source-voxel filtering still needs to observe the
                // circulation wall as a surface with optical mass. A minimum
                // half-width just above one native voxel preserves the graph
                // without returning to round capsule anatomy.
                const overheadClosedDeck = config.scPlacementRegime ===
                    "immediate-overcast";
                const wallRadius = Math.max(overheadClosedDeck ? 0.044 : 0.034,
                    minimumRadius * mix(
                        overheadClosedDeck ? 0.66 : 0.52,
                        overheadClosedDeck ? 0.84 : 0.68,
                        random(),
                    ));
                const midpoint = [
                    (source.center[0] + target.center[0]) * 0.5 +
                        Math.sin(edgeIndex * 1.91 + seed * 1e-6) * 0.006,
                    Math.max(sourceCell.baseHeight, targetCell.baseHeight) +
                        Math.min(
                            sourceCell.topHeight - sourceCell.baseHeight,
                            targetCell.topHeight - targetCell.baseHeight,
                        ) * mix(0.30, 0.43, random()),
                    (source.center[2] + target.center[2]) * 0.5 +
                        Math.cos(edgeIndex * 1.37 + seed * 1e-6) * 0.006,
                ];
                const sourceDepth = (sourceCell.topHeight -
                    sourceCell.baseHeight) * mix(0.28, 0.38, random());
                const targetDepth = (targetCell.topHeight -
                    targetCell.baseHeight) * mix(0.28, 0.38, random());
                addCirculationRibbonSurface(
                    primitives,
                    [
                        [source.center[0], sourceCell.baseHeight +
                            sourceDepth * 1.18, source.center[2]],
                        midpoint,
                        [target.center[0], targetCell.baseHeight +
                            targetDepth * 1.18, target.center[2]],
                    ],
                    [
                        Math.max(overheadClosedDeck ? 0.041 : 0.032,
                            wallRadius * mix(0.88, 1.04, random())),
                        wallRadius,
                        Math.max(overheadClosedDeck ? 0.041 : 0.032,
                            wallRadius * mix(0.86, 1.08, random())),
                    ],
                    [sourceDepth, Math.min(sourceDepth, targetDepth) *
                        mix(0.78, 0.96, random()), targetDepth],
                    {
                        density: mix(0.90, 0.98, random()),
                        detail: mix(0.21, 0.27, random()),
                        phase: 0,
                        lateralAsymmetry: mix(-0.16, 0.16, random()),
                        undersideFraction: mix(0.68, 0.78, random()),
                        hierarchyLevel: 1 + edgeIndex % 2,
                        role:
                            "foundation-sc-cellular-circulation-wall-ribbon",
                    },
                );
            }

            // Wide natural-neighbor seams host a bounded subset of upper
            // downwelling/cold-pool clear channels. The cavity follows the
            // physical bisector locally, ends before the next junction, and
            // never cuts the low communicating circulation wall. This makes
            // believable narrow rings/slots without drawing a Voronoi mask.
            for (const channel of
                lowStratiformisTopology.coldPoolChannels) {
                const sourceCell = lowStratiformisTopology.cells[channel.left];
                const targetCell = lowStratiformisTopology.cells[channel.right];
                const direction = [
                    Math.cos(channel.orientationRadians),
                    Math.sin(channel.orientationRadians),
                ];
                const halfLength = clamp(channel.length * 0.42, 0.025, 0.075);
                const curveOffset = channel.width * mix(-0.24, 0.24,
                    channel.selectionBias);
                const minimumBase = Math.max(
                    sourceCell.baseHeight,
                    targetCell.baseHeight,
                );
                const minimumDepth = Math.min(
                    sourceCell.topHeight - sourceCell.baseHeight,
                    targetCell.topHeight - targetCell.baseHeight,
                );
                const cavityCenterY = minimumBase + minimumDepth *
                    mix(0.58, 0.72, channel.cavityDepthFraction);
                const cavityDepth = minimumDepth *
                    mix(0.20, 0.34, channel.cavityDepthFraction);
                const cavityWidth = clamp(channel.width * 0.24, 0.004, 0.014);
                addCirculationRibbonSurface(
                    cavities,
                    [
                        [channel.midpointX - direction[0] * halfLength,
                            cavityCenterY,
                            channel.midpointY - direction[1] * halfLength],
                        [channel.midpointX + direction[1] * curveOffset,
                            cavityCenterY + minimumDepth * 0.025,
                            channel.midpointY - direction[0] * curveOffset],
                        [channel.midpointX + direction[0] * halfLength,
                            cavityCenterY,
                            channel.midpointY + direction[1] * halfLength],
                    ],
                    [
                        cavityWidth * 0.62,
                        cavityWidth,
                        cavityWidth * 0.54,
                    ],
                    [cavityDepth * 0.72, cavityDepth, cavityDepth * 0.64],
                    {
                        strength: mix(1.35, 1.75, channel.selectionBias),
                        lateralAsymmetry: mix(-0.20, 0.20,
                            channel.selectionBias),
                        undersideFraction: 0.42,
                        role: "foundation-sc-cold-pool-clear-channel",
                        hierarchyLevel: 2,
                    },
                );
            }
        }
        if (high) waveCrestCount = highWavePacket.clusterCount;
    }

    return {
        kind: "primitive",
        primitives,
        cavities,
        baseY,
        groupCount: ownerPoints.length,
        ownerPoints,
        commonBaseCount,
        secondaryLobeCount,
        hierarchyLevelCount: Math.round(geometricMidpoint(profile.hierarchyLevels)),
        cellClusterCount,
        crestCount: waveCrestCount,
        stackLayerCount: high ? 1 : 0,
        boundaryLobeCount: moistureEnvelope.length,
        stratiformisResolvedCellCount:
            lowStratiformisTopology?.cells.length ?? 0,
        stratiformisNaturalNeighborEdgeCount:
            lowStratiformisTopology?.edges.length ?? 0,
        stratiformisNaturalNeighborCycleRank:
            lowStratiformisTopology?.cycleRank ?? 0,
        stratiformisMaterialEdgeCount:
            lowStratiformisTopology?.materialEdges.length ?? 0,
        stratiformisMaterialCycleRank:
            lowStratiformisTopology?.materialCycleRank ?? 0,
        stratiformisClearChannelCount:
            lowStratiformisTopology?.clearChannels.length ?? 0,
        stratiformisColdPoolCavityCount:
            lowStratiformisTopology?.coldPoolChannels.length ?? 0,
        stratiformisCirculationCellSurfaceCount:
            lowStratiformisTopology?.cells.length ?? 0,
        stratiformisCirculationRibbonSurfaceCount:
            lowStratiformisTopology?.materialEdges.length ?? 0,
        stratiformisLegacyEllipsoidCount: low && variant === "stratiformis"
            ? primitives.filter((primitive) =>
                primitive.kind === "ellipsoid").length : 0,
        stratiformisLegacyCapsuleCount: low && variant === "stratiformis"
            ? primitives.filter((primitive) =>
                primitive.kind === "capsule").length : 0,
        stratiformisMinimumInteriorClearance:
            lowStratiformisTopology
                ? Math.min(...lowStratiformisTopology.cells.map((cell) =>
                    cell.interiorClearance))
                : 0,
        stratiformisMaximumUndersideAmplitude:
            lowStratiformisTopology
                ? Math.max(...lowStratiformisTopology.cells.map((cell) =>
                    cell.undersideAmplitude))
                : 0,
        stratiformisScale2ResolvedCellCount:
            lowStratiformisTopology?.qualificationObservation.multiscale[2]
                .resolvedCellCount ?? 0,
        stratiformisScale4ResolvedCellCount:
            lowStratiformisTopology?.qualificationObservation.multiscale[4]
                .resolvedCellCount ?? 0,
        detailBase: high ? 0.74 : middle ? 0.31
            : variant === "stratiformis" ? 0.17 : 0.20,
        edgeNoise: high ? 0.009 : middle ? 0.014
            : variant === "stratiformis" ? 0.007 : 0.019,
        interiorNoise: high ? 0.001 : 0.003,
        densityEdgeHigh: high ? 0.012 : middle ? 0.018
            : variant === "stratiformis" ? 0.012 : 0.022,
        fragmentary: variant === "floccus",
        warpStrength: high ? 0.014 : middle ? 0.021
            : variant === "stratiformis" ? 0.006 : 0.026,
        warpAnisotropy: high ? [1, 0.25, 1]
            : low && variant === "stratiformis" ? [1, 0.06, 1]
                : [1, 0.48, 1],
        stratiformisExteriorEdgeNoise: low && variant === "stratiformis"
            ? 0.007 : 0,
        stratiformisExteriorWarpStrength: low && variant === "stratiformis"
            ? 0.006 : 0,
        boundaryModel: variant === "castellanus"
            ? "single-curved-common-base"
            : variant === "floccus"
                ? "correlated-base-remnant-tufts"
                : high
                    ? config.topologyExemplarStyle ===
                        "dispersive-oblique-packet"
                        ? "finite-dispersive-broken-grain-sheet"
                        : "finite-broken-grain-sheet"
                    : middle
                        ? "finite-merged-element-layer"
                        : config.scPlacementRegime === "immediate-overcast"
                            ? "observer-spanning-inversion-closed-cell-deck"
                            : "finite-connected-inversion-closed-cell-deck",
    };
};

/** Focused deterministic source used by Sc reconstruction qualification. */
export const createStratocumulusStratiformisSurfaceModel = ({
    seed = null,
    volumeId = "sc-stratiformis",
} = {}) => {
    const sourceConfig = VOLUME_CONFIGS.find((candidate) =>
        candidate.id === volumeId);
    if (!sourceConfig || sourceConfig.genus !== "stratocumulus" ||
        sourceConfig.species !== "stratiformis") {
        throw new Error(`Unsupported Stratocumulus organization volume ${volumeId}`);
    }
    const foundationProfile = foundationProfileForConfig(sourceConfig);
    const resolvedSeed = seed ?? hashInteger(
        CLOUD_MACRO_ATLAS_SEED ^ hashString(sourceConfig.id),
    );
    const config = {
        ...sourceConfig,
        foundationProfile,
        topologyPolicy: topologyPolicyForFoundation(
            foundationProfile,
            sourceConfig.topologyPolicy,
        ),
    };
    return {
        config,
        seed: resolvedSeed,
        model: buildFoundationCellularModel(config, resolvedSeed),
    };
};

export const evaluateStratocumulusStratiformisSurfaceModel = (
    source,
    point,
) => {
    if (!source?.model || !source?.config || !Array.isArray(point) ||
        point.length !== 3) {
        throw new Error("Sc surface evaluation requires a source and xyz point");
    }
    return evaluatePrimitiveModel(
        source.model,
        source.config,
        point[0],
        point[1],
        point[2],
        source.seed,
    );
};

const lensField = (x, y, z, lens) => {
    const dx = x - lens.center[0];
    const dz = z - lens.center[2];
    const cosine = Math.cos(lens.rotation);
    const sine = Math.sin(lens.rotation);
    const lx = dx * cosine + dz * sine;
    const lz = -dx * sine + dz * cosine;
    if (lens.planKind === "asymmetric-laminar-almond") {
        // A stationary wave layer is a finite condensation surface with a
        // pointed leading shoulder, a longer eroding lee shoulder, and an
        // independently bowed centreline. It is not a superellipse extruded
        // into a shallow oval. The analytic plan and upper/lower surfaces
        // remain continuous while their unequal end laws make the layer read
        // as a laminar almond from every natural oblique view.
        const normalizedAlong = lx / Math.max(0.001, lens.radii[0]);
        if (Math.abs(normalizedAlong) >= 1.04) return -1;
        const endInterior = Math.max(
            0,
            1 - Math.abs(normalizedAlong) ** lens.endPower,
        );
        const centreline = lens.centerlineSweep * normalizedAlong +
            lens.centerlineCurvature *
                (normalizedAlong ** 2 - 0.30) +
            Math.sin(
                normalizedAlong * Math.PI * lens.planWaveFrequency +
                lens.edgePhase,
            ) * lens.planWaveAmplitude * endInterior;
        const localAcross = lz - centreline;
        const sideRadius = localAcross < 0
            ? lens.leadingRadius : lens.trailingRadius;
        const halfWidth = sideRadius *
            Math.pow(endInterior, lens.widthExponent) *
            (
                1 + Math.sin(
                    normalizedAlong * Math.PI * 1.73 -
                    lens.edgePhase * 0.62,
                ) * lens.widthVariation
            );
        const planField = Math.min(
            (1.04 - Math.abs(normalizedAlong)) * lens.radii[0],
            halfWidth - Math.abs(localAcross),
        );
        if (planField < -0.035) return planField;
        const transverseInterior = clamp(
            1 - Math.abs(localAcross) / Math.max(0.001, halfWidth),
        );
        const interior = clamp(Math.min(
            endInterior,
            transverseInterior,
        ));
        const centerBow = lens.bow *
            (normalizedAlong ** 2 - 0.32) +
            lens.crossBow * (
                (localAcross / Math.max(0.001, halfWidth)) ** 2 - 0.28
            ) +
            lens.centerlineLift * normalizedAlong;
        const halfDepth = lens.radii[1] * (
            lens.rimDepthFraction +
            (1 - lens.rimDepthFraction) *
                Math.pow(interior, lens.profilePower)
        ) * (
            1 + Math.sin(
                normalizedAlong * Math.PI * lens.thicknessWaveFrequency +
                lens.thicknessWavePhase,
            ) * lens.thicknessWaveAmplitude
        );
        const localY = y - lens.center[1] - centerBow;
        const verticalField = localY >= 0
            ? halfDepth - localY
            : halfDepth * lens.lowerFraction + localY;
        return smoothMinimumC2(
            planField,
            verticalField,
            Math.max(0.001, Math.min(
                lens.radii[1],
                lens.leadingRadius,
            ) * 0.055),
        );
    }
    const downwindRadius = lz < 0 ? lens.leadingRadius : lens.trailingRadius;
    const planMetric =
        Math.abs(lx / lens.radii[0]) ** lens.crosswindPower +
        Math.abs(lz / downwindRadius) ** lens.downwindPower;
    if (planMetric >= 1.35) return -1;
    const centerBow = lens.bow * ((lx / lens.radii[0]) ** 2 - 0.28);
    const verticalProfile = lens.radii[1] * Math.pow(Math.max(0, 1 - planMetric), lens.profilePower);
    // The upper and lower surfaces need not be mirror images: wave-cloud bases
    // are usually flatter while the cap is smoothly arched.
    const localY = y - lens.center[1] - centerBow;
    const vertical = localY >= 0
        ? verticalProfile - localY
        : verticalProfile * lens.lowerFraction + localY;
    const horizontal = (1 - Math.pow(Math.max(0, planMetric), 1 / lens.downwindPower)) *
        Math.min(lens.radii[0], downwindRadius);
    return Math.min(vertical, horizontal);
};

const buildWaveLensModel = (config, seed) => {
    const random = makeRandom(seed);
    const high = config.level === "high";
    const middle = config.level === "middle";
    const crestCount = high ? 3 : middle ? 3 : 2;
    const lenses = [];
    let stackLayerCount = 0;
    for (let crest = 0; crest < crestCount; crest += 1) {
        const t = crestCount === 1 ? 0.5 : crest / (crestCount - 1);
        const layers = high
            ? 1 + (random() > 0.48 ? 1 : 0)
            : middle ? 2 + (random() > 0.38 ? 1 : 0) : 2 + (random() > 0.55 ? 1 : 0);
        const crestX = 0.50 + (random() - 0.5) * 0.07;
        const crestZ = mix(0.27, 0.72, t) + (random() - 0.5) * 0.045;
        const baseAltitude = (high ? 0.61 : middle ? 0.50 : 0.39) + (crest - (crestCount - 1) * 0.5) * (high ? 0.010 : 0.016);
        const rotation = mix(-0.22, 0.22, random());
        for (let layer = 0; layer < layers; layer += 1) {
            const layerScale = 1 - layer * mix(0.08, 0.17, random());
            const rx = (high ? 0.27 : middle ? 0.37 : 0.39) * layerScale * mix(0.90, 1.08, random());
            const rz = (high ? 0.11 : middle ? 0.18 : 0.17) * layerScale * mix(0.88, 1.10, random());
            // Cirrocumulus lenses are optically shallow, but a one-voxel sheet
            // aliases into a flashing/vanishing plane after trilinear lookup.
            // Preserve the physically thin aspect while resolving both curved
            // surfaces across multiple 48^3 samples.
            const ry = (high ? 0.030 : middle ? 0.047 : 0.048) * mix(0.86, 1.10, random());
            lenses.push({
                center: [crestX + (random() - 0.5) * 0.018, baseAltitude + layer * ry * 1.65, crestZ + layer * rz * 0.08],
                radii: [rx, ry, rz],
                leadingRadius: rz * mix(0.72, 0.92, random()),
                trailingRadius: rz * mix(1.04, 1.31, random()),
                crosswindPower: mix(2.35, 3.05, random()),
                downwindPower: mix(1.55, 2.05, random()),
                profilePower: mix(0.58, 0.76, random()),
                lowerFraction: mix(0.64, 0.82, random()),
                bow: mix(0.004, 0.013, random()),
                rotation,
                crest,
            });
            stackLayerCount += 1;
        }
    }
    return {
        kind: "wave-lens",
        lenses,
        cavities: [],
        groupCount: crestCount,
        crestCount,
        stackLayerCount,
        laminar: true,
    };
};

const buildFoundationWaveLensModel = (config, seed) => {
    const random = makeRandom(seed);
    const profile = config.foundationProfile;
    const high = profile.family === "high";
    const middle = profile.family === "middle";

    if (!high && !middle) {
        // Low Sc lenticularis may be a grouped-element lens rather than one
        // smooth unit. Its elements follow one wave envelope and overlap into
        // a coherent dark volume; they are not an oval screen-space stamp.
        const primitives = [];
        const cavities = [];
        const ownerPoints = [];
        const heading = mix(-0.38, 0.38, random());
        const tangent = [Math.cos(heading), Math.sin(heading)];
        const normal = [-tangent[1], tangent[0]];
        const count = 7;
        for (let index = 0; index < count; index += 1) {
            const t = index / (count - 1);
            const along = mix(-0.32, 0.34, t);
            const envelope = Math.pow(Math.sin(t * Math.PI), 0.52);
            const cross = Math.sin(t * Math.PI * 1.45 + 0.35) * 0.035;
            const cx = 0.5 + tangent[0] * along + normal[0] * cross;
            const cz = 0.5 + tangent[1] * along + normal[1] * cross;
            const radius = mix(0.046, 0.105, envelope) * mix(0.84, 1.16, random());
            const center = [
                cx,
                0.40 + Math.sin(t * Math.PI) * 0.015 +
                    (random() - 0.5) * 0.008,
                cz,
            ];
            ownerPoints.push([cx, cz]);
            addPrimitiveEllipsoid(primitives, center, [
                radius * mix(1.10, 1.52, random()),
                radius * mix(0.30, 0.47, random()),
                radius * mix(0.72, 1.06, random()),
            ], {
                density: mix(0.84, 1, random()),
                detail: 0.18,
                phase: 0,
                rotation: heading + mix(-0.22, 0.22, random()),
                role: "foundation-grouped-low-lens-element",
            });
            if (index > 0 && index + 1 < count && index % 2 === 0) {
                const cutRadius = radius * mix(0.24, 0.36, random());
                cavities.push({
                    center: [
                        cx + normal[0] * radius * 0.58,
                        center[1] - radius * 0.14,
                        cz + normal[1] * radius * 0.58,
                    ],
                    radii: [cutRadius * 1.15, cutRadius * 0.48, cutRadius],
                    rotation: heading,
                    strength: 0.54,
                });
            }
        }
        return {
            kind: "primitive",
            primitives,
            cavities,
            groupCount: 1,
            ownerPoints,
            crestCount: 1,
            stackLayerCount: 1,
            hierarchyLevelCount: Math.round(geometricMidpoint(profile.hierarchyLevels)),
            detailBase: 0.18,
            edgeNoise: 0.010,
            interiorNoise: 0.0015,
            densityEdgeHigh: 0.018,
            warpStrength: 0.008,
            warpAnisotropy: [1, 0.12, 1],
            laminar: true,
            boundaryModel: "coherent-grouped-element-wave-lens",
        };
    }

    const lenses = [];
    const packetHeading = mix(-0.34, 0.34, random());
    if (high) {
        // Cc lenticularis is an unequal pair of stationary crests. The
        // dominant crest contains two overlapping laminar layers with
        // independent vertical surfaces; the smaller lee crest carries one.
        // Three finite analytic almonds therefore provide real depth without
        // borrowing the broad Ac stack or falling back to shallow oval cards.
        const layers = [
            {
                x: 0.41, y: 0.585, z: 0.38,
                scale: 1, crest: 0, layer: 0,
            },
            {
                x: 0.425, y: 0.660, z: 0.392,
                scale: 0.86, crest: 0, layer: 1,
            },
            {
                x: 0.65, y: 0.620, z: 0.67,
                scale: mix(0.62, 0.74, random()), crest: 1, layer: 0,
            },
        ];
        for (const item of layers) {
            const rx = 0.235 * item.scale * mix(0.94, 1.06, random());
            const rz = 0.088 * item.scale * mix(0.90, 1.10, random());
            const ry = (item.crest === 0 ? 0.047 : 0.043) *
                mix(0.94, 1.08, random());
            lenses.push({
                center: [
                    item.x + mix(-0.008, 0.008, random()),
                    item.y,
                    item.z + mix(-0.008, 0.008, random()),
                ],
                radii: [rx, ry, rz],
                leadingRadius: rz * mix(0.64, 0.82, random()),
                trailingRadius: rz * mix(1.12, 1.42, random()),
                profilePower: mix(0.48, 0.68, random()),
                lowerFraction: mix(0.60, 0.78, random()),
                rimDepthFraction: mix(0.18, 0.28, random()),
                bow: mix(0.007, 0.015, random()),
                crossBow: mix(-0.006, 0.008, random()),
                centerlineLift: mix(-0.006, 0.008, random()),
                rotation: packetHeading +
                    item.layer * mix(-0.035, 0.045, random()) +
                    item.crest * mix(0.05, 0.13, random()),
                crest: item.crest,
                layer: item.layer,
                edgePhase: random() * Math.PI * 2,
                edgeAmplitude: mix(0.0025, 0.0050, random()),
                leeErosion: mix(0.10, 0.22, random()),
                planKind: "asymmetric-laminar-almond",
                endPower: mix(1.34, 1.72, random()),
                widthExponent: mix(0.48, 0.68, random()),
                centerlineSweep: mix(-0.030, 0.040, random()),
                centerlineCurvature: mix(-0.022, 0.026, random()),
                planWaveFrequency: mix(1.10, 1.74, random()),
                planWaveAmplitude: mix(0.002, 0.006, random()),
                widthVariation: mix(0.035, 0.075, random()),
                thicknessWaveFrequency: mix(0.72, 1.26, random()),
                thicknessWavePhase: random() * Math.PI * 2,
                thicknessWaveAmplitude: mix(0.05, 0.12, random()),
            });
        }
    } else {
        // Ac lenticularis uses one stationary crest with an unequal vertical
        // stack. All layers share wave phase but not width, height, or end
        // taper, avoiding a train of identical smooth saucers.
        const layerCount = 3;
        for (let layer = 0; layer < layerCount; layer += 1) {
            const scale = [1, 0.84, 0.69][layer] * mix(0.95, 1.05, random());
            const rx = 0.36 * scale;
            const rz = 0.15 * scale;
            const ry = 0.043 * mix(0.88, 1.12, random());
            lenses.push({
                center: [
                    0.49 + layer * 0.008,
                    0.49 + layer * 0.070,
                    0.50 + layer * 0.012,
                ],
                radii: [rx, ry, rz],
                leadingRadius: rz * mix(0.62, 0.82, random()),
                trailingRadius: rz * mix(1.15, 1.42, random()),
                crosswindPower: mix(2.45, 3.10, random()),
                downwindPower: mix(1.45, 1.88, random()),
                profilePower: mix(0.55, 0.72, random()),
                lowerFraction: mix(0.60, 0.76, random()),
                bow: mix(0.007, 0.015, random()),
                rotation: packetHeading + layer * mix(-0.025, 0.035, random()),
                crest: 0,
                edgePhase: random() * Math.PI * 2,
                edgeAmplitude: mix(0.003, 0.006, random()),
                leeErosion: mix(0.06, 0.16, random()),
            });
        }
    }
    return {
        kind: "wave-lens",
        lenses,
        cavities: [],
        groupCount: high ? 2 : 1,
        crestCount: high ? 2 : 1,
        stackLayerCount: lenses.length,
        hierarchyLevelCount: Math.round(geometricMidpoint(profile.hierarchyLevels)),
        laminar: true,
        boundaryModel: high
            ? "unequal-paired-stacked-asymmetric-laminar-almonds"
            : "stationary-unequal-stacked-wave-lens",
    };
};

const evaluateWaveLensModel = (model, config, x, y, z, seed) => {
    let support = -1;
    for (const lens of model.lenses) {
        let field = lensField(x, y, z, lens);
        if (config.foundationProfile) {
            const dx = x - lens.center[0];
            const dz = z - lens.center[2];
            const cosine = Math.cos(lens.rotation);
            const sine = Math.sin(lens.rotation);
            const localX = dx * cosine + dz * sine;
            const localZ = -dx * sine + dz * cosine;
            const normalizedX = localX / Math.max(0.001, lens.radii[0]);
            const normalizedZ = localZ / Math.max(0.001, lens.trailingRadius);
            const coherentEdge =
                Math.sin(normalizedX * Math.PI * 1.7 + lens.edgePhase) *
                    lens.edgeAmplitude +
                Math.sin(normalizedX * Math.PI * 3.9 - lens.edgePhase * 0.7) *
                    lens.edgeAmplitude * 0.32;
            const leeSide = smoothstep(-0.05, 0.92, normalizedZ);
            const leeScallop = Math.max(
                0,
                Math.sin(normalizedX * Math.PI * 2.2 + lens.edgePhase * 1.3),
            ) * lens.edgeAmplitude * lens.leeErosion * 2.8 * leeSide;
            field += coherentEdge - leeScallop;
        }
        support = Math.max(support, field);
    }
    const boundary = 1 - smoothstep(0.001, 0.025, support);
    const endRaggedness = (
        (fbm3(x * 4.8 + 3, y * 5.1, z * 4.4 - 2, seed + 2221) - 0.5) * 0.004 +
        (ridgedFbm3(x * 8.4 - 1, y * 4.2, z * 7.8 + 5, seed + 2267) - 0.56) * 0.0025
    ) * boundary;
    return {
        density: clamp(smoothstep(-0.002, 0.014, support + endRaggedness) * config.densityScale),
        detail: config.level === "high" ? 0.70 : 0.16,
        phase: config.phaseBase,
        precipitation: 0,
    };
};

const buildRollModel = (config, seed) => {
    if (!config.foundationProfile) {
        return {
            kind: "roll",
            groupCount: 1,
            cavities: [],
            solitonEnvelopeCount: 1,
        };
    }
    const random = makeRandom(seed);
    const middle = config.foundationProfile.family === "middle";
    const axisRotation = mix(-0.30, 0.30, random());
    const centerlineModes = Array.from({ length: 3 }, (_, mode) => ({
        frequency: [0.58, 1.17, 2.03][mode] * mix(0.90, 1.10, random()),
        amplitude: (middle ? 0.022 : 0.034) /
            Math.pow(mode + 1, 1.24) * mix(0.72, 1.18, random()),
        phase: random() * Math.PI * 2,
    }));
    const verticalModes = Array.from({ length: 2 }, (_, mode) => ({
        frequency: [0.66, 1.43][mode] * mix(0.92, 1.08, random()),
        amplitude: (middle ? 0.010 : 0.014) /
            Math.pow(mode + 1, 1.18) * mix(0.72, 1.18, random()),
        phase: random() * Math.PI * 2,
    }));
    const radiusModes = Array.from({ length: 3 }, (_, mode) => ({
        frequency: [0.47, 0.91, 1.71][mode] * mix(0.92, 1.08, random()),
        amplitude: [0.13, 0.075, 0.040][mode] * mix(0.72, 1.16, random()),
        phase: random() * Math.PI * 2,
    }));
    return {
        kind: "roll",
        groupCount: 1,
        cavities: [],
        solitonEnvelopeCount: 1,
        hierarchyLevelCount: Math.round(
            geometricMidpoint(config.foundationProfile.hierarchyLevels),
        ),
        axisStart: mix(0.065, 0.095, random()),
        axisEnd: mix(0.89, 0.93, random()),
        axisRotation,
        centerY: middle ? 0.52 : 0.38,
        centerZ: mix(0.47, 0.53, random()),
        bendY: mix(-0.024, 0.030, random()),
        bendZ: mix(-0.055, 0.060, random()),
        leadingRadiusScale: mix(0.70, 0.88, random()),
        trailingRadiusScale: mix(0.46, 0.70, random()),
        leadingTaperFraction: mix(0.12, 0.22, random()),
        trailingTaperFraction: mix(0.18, 0.31, random()),
        centerlineModes,
        verticalModes,
        radiusModes,
        rollPhase: random() * Math.PI * 2,
        boundaryModel: middle
            ? "finite-tapered-midlevel-vortex-roll"
            : "finite-curved-boundary-layer-vortex-roll",
    };
};

const evaluateRollModel = (model, config, x, y, z, seed) => {
    const middle = config.level === "middle";
    const axisRotation = model.axisRotation ?? 0;
    const axisCosine = Math.cos(axisRotation);
    const axisSine = Math.sin(axisRotation);
    const relativeX = x - 0.5;
    const relativeZ = z - 0.5;
    const alongCoordinate = 0.5 +
        relativeX * axisCosine + relativeZ * axisSine;
    const crossCoordinate = 0.5 -
        relativeX * axisSine + relativeZ * axisCosine;
    const x0 = model.axisStart ?? 0.10;
    const x1 = model.axisEnd ?? 0.90;
    const along = clamp((alongCoordinate - x0) / (x1 - x0));
    const leadingEnvelope = smoothstep(
        0,
        model.leadingTaperFraction ?? 0.17,
        along,
    );
    const trailingEnvelope = 1 - smoothstep(
        1 - (model.trailingTaperFraction ?? 0.24),
        1,
        along,
    );
    const endProfile = Math.pow(
        Math.max(0, leadingEnvelope * trailingEnvelope),
        0.46,
    );
    const asymmetry = mix(
        model.leadingRadiusScale ?? 1,
        model.trailingRadiusScale ?? 1,
        smoothstep(0.18, 0.88, along),
    );
    const broadVariation = clamp(
        0.93 + (model.radiusModes ?? []).reduce(
            (sum, mode) => sum + Math.sin(
                along * Math.PI * 2 * mode.frequency + mode.phase,
            ) * mode.amplitude,
            0,
        ),
        0.68,
        1.18,
    );
    const centerY = (model.centerY ?? (middle ? 0.51 : 0.38)) +
        (model.bendY ?? 0.018) * (along - 0.5) ** 2 * 4 +
        (model.verticalModes ?? []).reduce(
            (sum, mode) => sum + Math.sin(
                along * Math.PI * 2 * mode.frequency + mode.phase,
            ) * mode.amplitude,
            0,
        );
    const centerZ = (model.centerZ ?? 0.50) +
        (model.bendZ ?? 0.030) * Math.sin(along * Math.PI) +
        (model.centerlineModes ?? []).reduce(
            (sum, mode) => sum + Math.sin(
                along * Math.PI * 2 * mode.frequency + mode.phase,
            ) * mode.amplitude,
            0,
        );
    const radiusY = (middle ? 0.076 : 0.112) *
        endProfile * asymmetry * broadVariation;
    const radiusZ = (middle ? 0.090 : 0.132) *
        endProfile * asymmetry * broadVariation;
    const dy = (y - centerY) / Math.max(0.004, radiusY);
    const dz = (crossCoordinate - centerZ) / Math.max(0.004, radiusZ);
    const angle = Math.atan2(dy, dz);
    const rollingPhase = (model.rollPhase ?? 0.8) + along * Math.PI * 1.35;
    const angularRelief =
        Math.cos(angle - rollingPhase) * 0.10 +
        Math.cos((angle - rollingPhase) * 2.0 + 0.7) * 0.035;
    const radialMetric = (
        Math.abs(dy) ** 2.18 +
        Math.abs(dz) ** 1.78
    ) ** (1 / 1.96);
    const radial = (1 + angularRelief - radialMetric) *
        Math.min(radiusY, radiusZ);
    const endSupport = Math.min(
        alongCoordinate - x0,
        x1 - alongCoordinate,
    ) * 0.7;
    let support = Math.min(radial, endSupport);
    if (config.foundationProfile) {
        // A shallow moving underside indentation reveals the vortex roll
        // without hollowing it into a torus or leaving a solid capsule.
        const cavityCenterY = centerY - radiusY * 0.54;
        const cavityCenterZ = centerZ +
            Math.sin(rollingPhase) * radiusZ * 0.28;
        const cavityMetric = Math.hypot(
            (y - cavityCenterY) / Math.max(0.004, radiusY * 0.50),
            (crossCoordinate - cavityCenterZ) /
                Math.max(0.004, radiusZ * 0.54),
        );
        const cavity = Math.max(0, 1 - cavityMetric) *
            Math.min(radiusY, radiusZ) * 0.20 *
            smoothstep(0.12, 0.42, endProfile);
        support -= cavity;
    }
    const breakup = (
        (fbm3(x * 5.4, y * 7.2, z * 6.1, seed + 2423) - 0.5) * 0.008 +
        (ridgedFbm3(x * 9.4, y * 8.2, z * 8.8, seed + 2441) - 0.56) * 0.004
    ) * (0.14 + endProfile * 0.42);
    const density = clamp(
        smoothstep(-0.005, 0.020, support + breakup) *
        config.densityScale *
        smoothstep(0.015, 0.15, endProfile),
    );
    return {
        density,
        detail: middle ? 0.24 : 0.18,
        phase: config.phaseBase,
        precipitation: 0,
    };
};

const buildSheetModel = (config, seed) => {
    const random = makeRandom(seed);
    const cirrostratus = config.variant === "cirrostratus" ||
        config.variant === "cirrostratus-fibratus";
    const cirrostratusFibratus = config.variant === "cirrostratus-fibratus";
    const altostratus = config.variant === "altostratus" ||
        config.variant === "altostratus-translucidus";
    const altostratusTranslucidus = config.variant === "altostratus-translucidus";
    const makeEdgeHarmonics = (count, amplitudeScale) => Array.from(
        { length: count },
        (_, index) => ({
            frequency: mix(0.72 + index * 0.76, 1.28 + index * 1.08, random()),
            amplitude: amplitudeScale * mix(0.42, 1, random()) / Math.sqrt(index + 1),
            phase: random() * Math.PI * 2,
        }),
    );
    const generatingCells = config.variant === "nimbostratus" &&
        config.nsParentAnatomy === "generating-cell"
        ? poissonPoints(random, 8, 0.14, 0.10).map(([x, z]) => ({
            x,
            z,
            radiusX: mix(0.045, 0.10, random()),
            radiusZ: mix(0.040, 0.09, random()),
            height: mix(0.065, 0.15, random()),
        }))
        : [];
    const boundarySettings = cirrostratus
        ? {
            halfLength: 0.395, halfWidth: 0.295, frontAmplitude: 0.043,
            rearAmplitude: 0.036, intrusionCount: 5, intrusionDepth: [0.030, 0.082],
            lobeCount: 4,
        }
        : altostratus
            ? {
                halfLength: 0.44, halfWidth: 0.39, frontAmplitude: 0.064,
                rearAmplitude: 0.055, intrusionCount: 5, intrusionDepth: [0.045, 0.12],
                lobeCount: 5,
            }
            : config.variant === "nimbostratus"
                ? {
                    halfLength: 0.43, halfWidth: 0.41, frontAmplitude: 0.078,
                    rearAmplitude: 0.068, intrusionCount: 6, intrusionDepth: [0.055, 0.15],
                    lobeCount: 6,
                }
                : {
                    halfLength: 0.45, halfWidth: 0.41, frontAmplitude: 0.054,
                    rearAmplitude: 0.066, intrusionCount: 6, intrusionDepth: [0.045, 0.14],
                    lobeCount: 5,
                };
    return {
        kind: "sheet",
        generatingCells,
        cavities: [],
        groupCount: 1,
        // A finite frontal/inversion swath is bounded by independently curved
        // advancing and trailing edges, not a radial stamp.
        orientation: mix(-0.62, 0.62, random()),
        alongCenter: mix(-0.025, 0.025, random()),
        crossCenter: mix(-0.030, 0.030, random()),
        halfLength: boundarySettings.halfLength,
        halfWidth: boundarySettings.halfWidth,
        frontSkew: mix(-0.14, 0.14, random()),
        frontCurvature: mix(-0.12, 0.12, random()),
        endSkew: mix(-0.24, 0.24, random()),
        frontHarmonics: makeEdgeHarmonics(6, boundarySettings.frontAmplitude),
        rearHarmonics: makeEdgeHarmonics(5, boundarySettings.rearAmplitude),
        // Mesoscale dry-air intrusions scallop a frontal/deck perimeter. They
        // alter the condensate boundary itself and never attenuate an already
        // generated cloud, which avoids a visibly masked edge.
        dryIntrusions: Array.from({ length: boundarySettings.intrusionCount }, () => ({
            side: random() > 0.42 ? "rear" : "front",
            along: mix(-0.72, 0.72, random()),
            width: mix(0.10, 0.25, random()),
            depth: mix(
                boundarySettings.intrusionDepth[0],
                boundarySettings.intrusionDepth[1],
                random(),
            ),
        })),
        boundaryLobeCount: boundarySettings.lobeCount,
        hierarchyLevelCount: config.foundationProfile
            ? Math.round(geometricMidpoint(config.foundationProfile.hierarchyLevels))
            : 1,
        layerOffsets: altostratus
            ? altostratusTranslucidus
                ? [
                    { x: mix(-0.030, -0.008, random()), z: mix(0.012, 0.038, random()), y: -0.018 },
                ]
                : [
                    { x: mix(-0.035, -0.010, random()), z: mix(0.015, 0.045, random()), y: -0.028 },
                    { x: mix(0.018, 0.048, random()), z: mix(-0.040, -0.012, random()), y: 0.042 },
                ]
            : config.variant === "nimbostratus"
                ? config.nsParentAnatomy === "thickened-low-deck"
                    ? [
                        { x: mix(-0.12, -0.04, random()), z: mix(0.03, 0.13, random()), y: -0.095 },
                        { x: mix(0.02, 0.12, random()), z: mix(-0.13, -0.03, random()), y: -0.080 },
                        { x: mix(-0.03, 0.06, random()), z: mix(-0.02, 0.08, random()), y: -0.065 },
                    ]
                    : config.nsParentAnatomy === "deepening-altostratus"
                        ? [
                            { x: mix(-0.06, -0.015, random()), z: mix(0.015, 0.065, random()), y: -0.050 },
                            { x: mix(0.015, 0.060, random()), z: mix(-0.065, -0.015, random()), y: 0.035 },
                        ]
                        : [
                            { x: mix(-0.045, -0.018, random()), z: mix(0.020, 0.055, random()), y: 0.070 },
                            { x: mix(0.018, 0.052, random()), z: mix(-0.052, -0.020, random()), y: -0.055 },
                        ]
                : [],
        // The Cirrostratus sheet owns two independent, low-frequency surface
        // fields plus a separate thickness spectrum. These modes alter the
        // physical lower/upper condensate boundaries; they are not density
        // stripes painted on a planar slab.
        surfaceModes: cirrostratus
            ? [
                [0.61, 0.43],
                [0.93, 1.17],
                [1.47, 0.79],
                [2.09, 1.61],
            ].map(([alongFrequency, acrossFrequency], index) => {
                const amplitude = (
                    cirrostratusFibratus ? 0.023 : 0.017
                ) / Math.pow(index + 1, 0.82) * mix(0.82, 1.18, random());
                return {
                    alongFrequency: alongFrequency * mix(0.92, 1.08, random()),
                    acrossFrequency: acrossFrequency *
                        mix(0.92, 1.08, random()),
                    lowerAmplitude: amplitude *
                        mix(0.72, 1.08, random()),
                    upperAmplitude: amplitude *
                        mix(0.62, 1.02, random()),
                    lowerPhase: random() * Math.PI * 2,
                    upperPhase: random() * Math.PI * 2,
                };
            })
            : [],
        thicknessModes: cirrostratus
            ? [
                [0.53, 0.81, 0.16],
                [1.11, 0.57, 0.11],
                [1.73, 1.39, 0.07],
            ].map(([alongFrequency, acrossFrequency, amplitude]) => ({
                alongFrequency: alongFrequency * mix(0.93, 1.07, random()),
                acrossFrequency: acrossFrequency * mix(0.93, 1.07, random()),
                amplitude: amplitude * mix(0.76, 1.14, random()),
                phase: random() * Math.PI * 2,
            }))
            : [],
        fibreBundles: cirrostratusFibratus
            ? Array.from({ length: 8 }, (_, index) => ({
                offset: mix(-0.27, 0.27, (index + 0.35 + random() * 0.30) / 8),
                width: mix(0.012, 0.026, random()),
                curvature: mix(-0.045, 0.045, random()),
                frequency: mix(0.72, 1.48, random()),
                phase: random() * Math.PI * 2,
                alongCenter: mix(-0.08, 0.08, random()),
                halfLength: mix(0.24, 0.43, random()),
                strength: mix(0.58, 1, random()),
                altitudeOffset: mix(-0.060, 0.060, random()),
                verticalRadius: mix(0.022, 0.040, random()),
                altitudeSlope: mix(-0.055, 0.055, random()),
                altitudeWaveAmplitude: mix(0.006, 0.018, random()),
                altitudeWaveFrequency: mix(0.72, 1.36, random()),
                altitudePhase: random() * Math.PI * 2,
            }))
            : [],
        streamlineCount: cirrostratusFibratus ? 8 : 0,
        sheetSurfaceModeCount: cirrostratus ? 4 : 0,
        sheetThicknessModeCount: cirrostratus ? 3 : 0,
        embeddedFibreBundleCount: cirrostratusFibratus ? 8 : 0,
        fibreAltitudeSpread: cirrostratusFibratus ? 0.12 : 0,
        fibrePhase: random() * Math.PI * 2,
        boundaryModel: cirrostratusFibratus
            ? "volumetric-undulating-veil-with-finite-depth-sheared-ice-fibres"
            : cirrostratus
                ? "finite-volumetric-undulating-nebulous-ice-front"
            : altostratusTranslucidus
                ? "finite-ground-glass-mixed-phase-shield"
            : altostratus
                ? "unequal-superposed-mixed-phase-shield"
                : config.variant === "nimbostratus"
                    ? `deep-${config.nsParentAnatomy ?? "stratiform"}-parent-shield`
                    : "advected-inversion-bounded-stratus-bank",
    };
};

const evaluateEdgeHarmonics = (coordinate, harmonics) => harmonics.reduce(
    (sum, harmonic) => sum +
        Math.sin(coordinate * Math.PI * harmonic.frequency + harmonic.phase) * harmonic.amplitude,
    0,
);

const evaluateSheetModel = (model, config, x, y, z, seed) => {
    const cirrostratus = config.variant === "cirrostratus" ||
        config.variant === "cirrostratus-fibratus";
    const cirrostratusFibratus = config.variant === "cirrostratus-fibratus";
    const altostratus = config.variant === "altostratus" ||
        config.variant === "altostratus-translucidus";
    const altostratusTranslucidus = config.variant === "altostratus-translucidus";
    const stratus = config.variant === "stratus";
    const settings = cirrostratus
        ? {
            center: 0.64,
            thickness: cirrostratusFibratus ? 0.132 : 0.116,
            undulation: 0,
            detail: cirrostratusFibratus ? 0.84 : 0.48,
        }
        : altostratus
            ? {
                center: 0.57,
                thickness: altostratusTranslucidus ? 0.16 : 0.23,
                undulation: altostratusTranslucidus ? 0.021 : 0.026,
                detail: altostratusTranslucidus ? 0.47 : 0.40,
            }
            : config.variant === "nimbostratus"
                ? config.nsParentAnatomy === "deepening-altostratus"
                    ? { center: 0.60, thickness: 0.285, undulation: 0.032, detail: 0.48 }
                    : config.nsParentAnatomy === "thickened-low-deck"
                        ? { center: 0.53, thickness: 0.36, undulation: 0.052, detail: 0.56 }
                        : { center: 0.57, thickness: 0.34, undulation: 0.045, detail: 0.54 }
                : stratus
                    ? {
                        // Stratus is authored in the owner frame, where y=0
                        // and y=1 are the physical base and top of the
                        // compiled layer. The former .28/.105 ribbon was a
                        // five-voxel internal slice and made an immediate
                        // overcast read as a distant lower bank.
                        center: 0.50,
                        thickness: 0.90,
                        undulation: 0.018,
                        detail: 0.18,
                    }
                    : { center: 0.28, thickness: 0.105, undulation: 0.018, detail: 0.18 };
    const dx = x - 0.5;
    const dz = z - 0.5;
    const cosine = Math.cos(model.orientation);
    const sine = Math.sin(model.orientation);
    const along = dx * cosine + dz * sine - model.alongCenter;
    const across = -dx * sine + dz * cosine - model.crossCenter;
    const normalizedAlong = along / model.halfLength;
    const endMetric = Math.abs(normalizedAlong) * (
        1 + Math.sign(normalizedAlong || 1) * model.endSkew
    );
    const endTaper = Math.pow(
        Math.max(0, 1 - endMetric ** 3.0),
        0.24,
    );
    const boundaryNoise = fbm3(x * 3.1 + 2, 0.7, z * 3.4 - 5, seed + 2521) - 0.5;
    const frontMeander = evaluateEdgeHarmonics(normalizedAlong, model.frontHarmonics) +
        boundaryNoise * (cirrostratus ? 0.027 : 0.044);
    const rearMeander = evaluateEdgeHarmonics(normalizedAlong, model.rearHarmonics) +
        (fbm3(x * 3.7 - 4, 1.3, z * 2.9 + 6, seed + 2543) - 0.5) *
            (cirrostratus ? 0.024 : 0.039);
    const centerline =
        model.frontSkew * normalizedAlong +
        model.frontCurvature * (normalizedAlong ** 2 - 0.34) +
        (frontMeander + rearMeander) * 0.18;
    let frontWidth = model.halfWidth * endTaper * (
        0.91 + Math.sin(normalizedAlong * Math.PI * 2.1 + 1.2) * 0.07
    ) + frontMeander;
    let rearWidth = model.halfWidth * endTaper * (
        0.76 + Math.sin(normalizedAlong * Math.PI * 1.5 - 0.5) * 0.11
    ) + rearMeander;
    for (const intrusion of model.dryIntrusions) {
        const distance = (normalizedAlong - intrusion.along) / intrusion.width;
        const indentation = intrusion.depth * Math.exp(-distance * distance * 2.4);
        if (intrusion.side === "front") frontWidth -= indentation;
        else rearWidth -= indentation;
    }
    const alongSupport = (model.halfLength - Math.abs(along)) * 0.72;
    const frontSupport = centerline + frontWidth - across;
    const rearSupport = across - (centerline - rearWidth);
    const planSupport = Math.min(alongSupport, frontSupport, rearSupport);
    const normalizedAcross = across / Math.max(0.001, model.halfWidth);
    let lowerSurfaceDisplacement = 0;
    let upperSurfaceDisplacement = 0;
    for (const mode of model.surfaceModes ?? []) {
        lowerSurfaceDisplacement += Math.sin(
            normalizedAlong * Math.PI * mode.alongFrequency +
            normalizedAcross * Math.PI * mode.acrossFrequency +
            mode.lowerPhase,
        ) * mode.lowerAmplitude;
        upperSurfaceDisplacement += Math.sin(
            normalizedAlong * Math.PI * mode.alongFrequency * 0.91 -
            normalizedAcross * Math.PI * mode.acrossFrequency * 1.07 +
            mode.upperPhase,
        ) * mode.upperAmplitude;
    }
    let sheetThicknessScale = 1;
    for (const mode of model.thicknessModes ?? []) {
        sheetThicknessScale += Math.sin(
            normalizedAlong * Math.PI * mode.alongFrequency -
            normalizedAcross * Math.PI * mode.acrossFrequency +
            mode.phase,
        ) * mode.amplitude;
    }
    sheetThicknessScale = clamp(sheetThicknessScale, 0.68, 1.36);
    const longWave = cirrostratus ? 0 : (
        Math.sin(x * Math.PI * 2.1 + z * 1.4 + model.fibrePhase) * 0.44 +
        Math.sin(z * Math.PI * 1.65 - x * 0.9 - model.fibrePhase * 0.4) * 0.26 +
        (fbm3(x * 4.0, 0.2, z * 4.0, seed + 2591) - 0.5) * 0.60
    ) * settings.undulation;
    let localThickening = 0;
    for (const offset of model.layerOffsets ?? []) {
        const distance = Math.hypot(
            (x - 0.5 - offset.x) * 1.05,
            (z - 0.5 - offset.z) * 0.88,
        );
        localThickening += Math.max(0, 1 - distance / 0.42) *
            Math.abs(offset.y) * 0.38;
    }
    let generatingCellThickening = 0;
    for (const cell of model.generatingCells ?? []) {
        const metric = Math.sqrt(
            ((x - cell.x) / cell.radiusX) ** 2 +
            ((z - cell.z) / cell.radiusZ) ** 2,
        );
        generatingCellThickening += (1 - smoothstep(0, 1, metric)) * cell.height;
    }
    const lowDeck = config.nsParentAnatomy === "thickened-low-deck";
    const localSheetThickness = settings.thickness *
        (cirrostratus ? sheetThicknessScale : 1);
    let lower = settings.center - localSheetThickness * 0.5 + longWave -
        localThickening * (config.variant === "nimbostratus"
            ? lowDeck ? 1.55 : 1.05 : 0.6);
    let upper = settings.center + localSheetThickness * 0.5 + longWave * 0.44 +
        localThickening * (lowDeck ? 0.20 : 0.45) + generatingCellThickening;
    if (cirrostratus) {
        lower += lowerSurfaceDisplacement;
        upper += upperSurfaceDisplacement;
        const minimumDepth = cirrostratusFibratus ? 0.074 : 0.066;
        if (upper - lower < minimumDepth) {
            const center = (lower + upper) * 0.5;
            lower = center - minimumDepth * 0.5;
            upper = center + minimumDepth * 0.5;
        }
    }
    const verticalSupport = Math.min(y - lower, upper - y);
    let embeddedFibreSupport = -Infinity;
    let coherentFibreWeight = 0;
    for (const fibre of model.fibreBundles ?? []) {
        const localAlong = along - fibre.alongCenter;
        const finiteEnvelope = smoothstep(
            0,
            0.16,
            1 - Math.abs(localAlong) / fibre.halfLength,
        );
        const centre = fibre.offset +
            Math.sin(
                localAlong * Math.PI * fibre.frequency + fibre.phase,
            ) * fibre.curvature +
            localAlong * localAlong * fibre.curvature * 0.75;
        const normalizedDistance = (across - centre) / fibre.width;
        const altitude = settings.center + fibre.altitudeOffset +
            localAlong * fibre.altitudeSlope +
            Math.sin(
                localAlong * Math.PI * fibre.altitudeWaveFrequency +
                fibre.altitudePhase,
            ) * fibre.altitudeWaveAmplitude;
        const verticalRadius = fibre.verticalRadius *
            mix(0.58, 1, finiteEnvelope);
        const longitudinalSupport = (
            fibre.halfLength - Math.abs(localAlong)
        ) * 0.62;
        const lateralSupport = fibre.width * 1.65 -
            Math.abs(across - centre);
        const fibrePlanSupport = Math.min(
            longitudinalSupport,
            lateralSupport,
            planSupport + 0.012,
        );
        const fibreVerticalSupport = verticalRadius -
            Math.abs(y - altitude);
        embeddedFibreSupport = Math.max(
            embeddedFibreSupport,
            smoothMinimumC2(
                fibrePlanSupport,
                fibreVerticalSupport,
                0.0012,
            ),
        );
        coherentFibreWeight = Math.max(
            coherentFibreWeight,
            Math.exp(-normalizedDistance * normalizedDistance * 0.5) *
                Math.exp(-(
                    (
                        (y - altitude) /
                        Math.max(0.002, verticalRadius)
                    ) ** 2
                ) * 0.5) *
                finiteEnvelope * fibre.strength,
        );
    }
    const sheetSupport = Math.min(planSupport, verticalSupport);
    const support = Math.max(sheetSupport, embeddedFibreSupport);
    // R is condensate owned by the parent shield only. Virga, rain, and snow
    // are emitted by parent-linked hydrometeor domains and never unioned into
    // this density field.
    const precipitation = 0;
    const boundary = 1 - smoothstep(0.002, 0.040, support);
    const micro = (
        fbm3(x * 8.1 + 3, y * 7.4 - 2, z * 8.5 + 6, seed + 2671) - 0.5
    ) * mix(
        cirrostratus ? 0.0015 : 0.002,
        config.variant === "stratus" ? 0.013 : cirrostratus ? 0.004 : 0.007,
        boundary,
    );
    const nebulousVariation = clamp(
        0.97 +
        Math.sin(
            normalizedAlong * Math.PI * 0.71 +
            normalizedAcross * Math.PI * 0.43 +
            model.fibrePhase,
        ) * 0.035 +
        Math.sin(
            normalizedAlong * Math.PI * 1.19 -
            normalizedAcross * Math.PI * 0.67 -
            model.fibrePhase * 0.58,
        ) * 0.022,
        0.88,
        1.05,
    );
    const fibrousStriation = cirrostratus
        ? cirrostratusFibratus
            ? mix(
                0.70,
                1.18,
                clamp(
                    coherentFibreWeight * 0.82 +
                    fbm3(
                        normalizedAlong * 1.7,
                        y * 2.2,
                        normalizedAcross * 1.4,
                        seed + 2693,
                    ) * 0.26,
                ),
            )
            : nebulousVariation
        : 1;
    const shieldVariation = altostratus
        ? mix(0.78, 1.05, fbm3(along * 2.4, y * 2.8, across * 2.1, seed + 2719))
        : config.variant === "nimbostratus"
            ? mix(0.70, 1.08, fbm3(along * 2.8, y * 3.3, across * 2.6, seed + 2741))
            : config.variant === "stratus"
                ? mix(0.86, 1.03, fbm3(along * 1.7, y * 2.2, across * 1.8, seed + 2767))
                : 1;
    const density = smoothstep(
        -0.006,
        cirrostratus ? 0.013 : 0.025,
        support + micro,
    ) * config.densityScale * fibrousStriation * shieldVariation *
        // Droplet density increases toward the inversion/top of a mature
        // Stratus deck. This profile has unit integral over [0, 1]
        // (0.74 + 0.572 / 2.2 = 1), so it redistributes condensate vertically
        // without adding optical mass or brightening the material arbitrarily.
        (stratus
            ? 0.74 + 0.572 * Math.pow(
                clamp((y - lower) / Math.max(0.001, upper - lower)),
                1.2,
            )
            : 1);
    const normalizedHeight = clamp((y - lower) / Math.max(0.001, upper - lower));
    const phase = cirrostratus
        ? 1
        : altostratus
            ? mix(0.16, 0.72, smoothstep(0.10, 0.92, normalizedHeight))
            : config.variant === "nimbostratus"
                ? mix(
                    precipitation > 0.05 ? 0.18 : 0.28,
                    0.82,
                    smoothstep(0.16, 0.90, normalizedHeight),
                )
                : 0;
    return {
        density: clamp(density),
        detail: precipitation > 0.05 ? 0.68 : settings.detail,
        phase,
        precipitation,
    };
};

const buildFragmentModel = (config, seed) => {
    const random = makeRandom(seed);
    const primitives = [];
    const stratus = config.variant === "stratus";
    const groupCount = stratus ? 12 : 10;
    const points = poissonPoints(random, groupCount, stratus ? 0.16 : 0.18, 0.10);
    let secondaryLobeCount = 0;
    for (const [cx, cz] of points) {
        const baseY = stratus ? mix(0.20, 0.38, random()) : mix(0.28, 0.50, random());
        const radius = mix(stratus ? 0.045 : 0.050, stratus ? 0.080 : 0.090, random());
        const pieces = 3 + Math.floor(random() * 3);
        const advectionAngle = random() * Math.PI * 2;
        let previous = null;
        for (let piece = 0; piece < pieces; piece += 1) {
            const t = piece / Math.max(1, pieces - 1);
            const center = [
                cx + Math.cos(advectionAngle) * radius * mix(-0.62, 0.76, t) + (random() - 0.5) * radius * 0.38,
                baseY + (random() - 0.5) * radius * (stratus ? 0.48 : 1.0) +
                    (stratus ? 0 : Math.sin(t * Math.PI) * radius * 0.42),
                cz + Math.sin(advectionAngle) * radius * mix(-0.62, 0.76, t) + (random() - 0.5) * radius * 0.34,
            ];
            addPrimitiveEllipsoid(primitives, [
                center[0], center[1], center[2],
            ], [
                radius * mix(0.72, 1.34, random()),
                radius * mix(stratus ? 0.30 : 0.52, stratus ? 0.65 : 1.05, random()),
                radius * mix(0.58, 1.12, random()),
            ], {
                density: mix(0.70, 1, random()),
                detail: stratus ? 0.36 : 0.18,
                phase: 0,
                rotation: random() * Math.PI,
                role: stratus ? "boundary-layer-shred" : "torn-thermal-fragment",
            });
            if (previous && random() > 0.34) {
                addCapsule(primitives, previous, center, radius * mix(stratus ? 0.22 : 0.28, stratus ? 0.37 : 0.46, random()), {
                    density: mix(0.62, 0.82, random()),
                    detail: stratus ? 0.42 : 0.24,
                    phase: 0,
                    verticalScale: stratus ? 0.34 : 0.72,
                    role: "torn-bridge",
                });
            }
            previous = center;
            secondaryLobeCount += 1;
        }
    }
    return {
        kind: "primitive",
        primitives,
        cavities: [],
        groupCount,
        ownerPoints: points,
        secondaryLobeCount,
        hierarchyLevelCount: 2,
        detailBase: stratus ? 0.38 : 0.20,
        edgeNoise: stratus ? 0.027 : 0.024,
        interiorNoise: 0.008,
        fragmentary: true,
        densityEdgeHigh: 0.019,
        warpStrength: stratus ? 0.042 : 0.036,
        warpAnisotropy: stratus ? [1, 0.35, 1] : [1, 0.75, 1],
    };
};

const buildFoundationFragmentModel = (config, seed) => {
    const random = makeRandom(seed);
    const profile = config.foundationProfile;
    const primitives = [];
    const cavities = [];
    const ownerPoints = [];
    const heading = mix(-0.78, 0.78, random());
    const tangent = [Math.cos(heading), Math.sin(heading)];
    const normal = [-tangent[1], tangent[0]];
    const clusterCenters = [
        [-0.28, -0.08],
        [-0.10, 0.12],
        [0.12, -0.13],
        [0.30, 0.06],
    ].map(([along, cross]) => [
        0.5 + tangent[0] * along + normal[0] * cross +
            mix(-0.035, 0.035, random()),
        0.5 + tangent[1] * along + normal[1] * cross +
            mix(-0.035, 0.035, random()),
    ]);
    let secondaryLobeCount = 0;
    for (let group = 0; group < 13; group += 1) {
        const cluster = clusterCenters[group % clusterCenters.length];
        const ring = Math.floor(group / clusterCenters.length);
        const angle = heading + group * 2.399963229728653 +
            mix(-0.42, 0.42, random());
        const distance = ring === 0 ? 0 : mix(0.055, 0.16, random());
        const cx = cluster[0] + Math.cos(angle) * distance;
        const cz = cluster[1] + Math.sin(angle) * distance;
        if (cx < 0.09 || cx > 0.91 || cz < 0.09 || cz > 0.91) continue;
        const baseY = mix(0.20, 0.34, random()) +
            Math.sin((cx + cz) * Math.PI * 1.7) * 0.018;
        const scale = mix(0.045, 0.085, random());
        const pathLength = scale * mix(1.8, 3.5, random());
        const segmentCount = 3 + Math.floor(random() * 3);
        const centers = [];
        for (let segment = 0; segment < segmentCount; segment += 1) {
            const t = segment / Math.max(1, segmentCount - 1);
            const localCenter = [
                cx + tangent[0] * pathLength * (t - 0.5) +
                    normal[0] * Math.sin(t * Math.PI) * scale * mix(-0.40, 0.40, random()),
                baseY + (random() - 0.5) * scale * 0.34,
                cz + tangent[1] * pathLength * (t - 0.5) +
                    normal[1] * Math.sin(t * Math.PI) * scale * mix(-0.40, 0.40, random()),
            ];
            const radius = scale * mix(0.42, 0.78, random());
            addPrimitiveEllipsoid(primitives, localCenter, [
                radius * mix(1.0, 1.65, random()),
                radius * mix(0.28, 0.55, random()),
                radius * mix(0.78, 1.28, random()),
            ], {
                density: mix(0.62, 0.92, random()),
                detail: 0.42,
                phase: 0,
                rotation: heading + mix(-0.40, 0.40, random()),
                role: "foundation-sheared-stratus-shred",
            });
            centers.push(localCenter);
            secondaryLobeCount += 1;
            if (segment > 0 && random() > 0.30) {
                addCapsule(primitives, centers[segment - 1], localCenter,
                    radius * mix(0.20, 0.31, random()), {
                        density: 0.60,
                        detail: 0.46,
                        phase: 0,
                        verticalScale: 0.30,
                        role: "foundation-fractus-merger-neck",
                    });
            }
        }
        const cutScale = scale * mix(0.28, 0.46, random());
        cavities.push({
            center: [
                cx + normal[0] * scale * mix(-0.45, 0.45, random()),
                baseY - scale * 0.16,
                cz + normal[1] * scale * mix(-0.45, 0.45, random()),
            ],
            radii: [cutScale * 1.25, cutScale * 0.48, cutScale],
            rotation: heading,
            strength: mix(0.68, 0.92, random()),
        });
        ownerPoints.push([cx, cz]);
    }
    return {
        kind: "primitive",
        primitives,
        cavities,
        groupCount: ownerPoints.length,
        ownerPoints,
        secondaryLobeCount,
        hierarchyLevelCount: Math.round(geometricMidpoint(profile.hierarchyLevels)),
        detailBase: 0.42,
        edgeNoise: 0.024,
        interiorNoise: 0.006,
        fragmentary: true,
        densityEdgeHigh: 0.018,
        warpStrength: 0.034,
        warpAnisotropy: [1, 0.24, 1],
        boundaryModel: "correlated-sheared-ragged-fragment-field",
    };
};

const buildMacroModel = (config, seed) => {
    switch (config.builder) {
        case "cumulus": return buildCumulusModel(config, seed);
        case "cumulonimbus": return buildCumulonimbusModel(config, seed);
        case "ice-streamer": return buildIceStreamerModel(config, seed);
        case "cellular": return config.foundationProfile
            ? buildFoundationCellularModel(config, seed)
            : buildCellularModel(config, seed);
        case "wave-lens": return config.foundationProfile
            ? buildFoundationWaveLensModel(config, seed)
            : buildWaveLensModel(config, seed);
        case "roll": return buildRollModel(config, seed);
        case "sheet": return buildSheetModel(config, seed);
        case "fragment": return config.foundationProfile
            ? buildFoundationFragmentModel(config, seed)
            : buildFragmentModel(config, seed);
        default: return buildShapeModel(config, seed);
    }
};

const evaluateMacroModel = (model, config, x, y, z, seed) => {
    switch (model.kind) {
        case "primitive": return evaluatePrimitiveModel(model, config, x, y, z, seed);
        case "wave-lens": return evaluateWaveLensModel(model, config, x, y, z, seed);
        case "roll": return evaluateRollModel(model, config, x, y, z, seed);
        case "sheet": return evaluateSheetModel(model, config, x, y, z, seed);
        default: return evaluateModel(model, config, x, y, z, seed);
    }
};

const distanceTransform1d = (source, length, output, scratchSites, scratchBreaks) => {
    let k = 0;
    scratchSites[0] = 0;
    scratchBreaks[0] = -Infinity;
    scratchBreaks[1] = Infinity;
    for (let q = 1; q < length; q += 1) {
        let site = scratchSites[k];
        let separation = (
            (source[q] + q * q) - (source[site] + site * site)
        ) / (2 * q - 2 * site);
        while (separation <= scratchBreaks[k]) {
            k -= 1;
            site = scratchSites[k];
            separation = (
                (source[q] + q * q) - (source[site] + site * site)
            ) / (2 * q - 2 * site);
        }
        k += 1;
        scratchSites[k] = q;
        scratchBreaks[k] = separation;
        scratchBreaks[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q += 1) {
        while (scratchBreaks[k + 1] < q) k += 1;
        const delta = q - scratchSites[k];
        output[q] = delta * delta + source[scratchSites[k]];
    }
};

const squaredDistanceTransform3dInto = (
    occupied,
    resolution,
    distanceToOccupied,
    first,
    second,
) => {
    const voxelCount = resolution ** 3;
    const infinity = 1e12;
    let source = first;
    let target = second;
    for (let index = 0; index < voxelCount; index += 1) {
        source[index] = occupied[index] === distanceToOccupied ? 0 : infinity;
    }
    const line = new Float64Array(resolution);
    const transformed = new Float64Array(resolution);
    const sites = new Int32Array(resolution);
    const breaks = new Float64Array(resolution + 1);
    const runAxis = (axis) => {
        for (let outerA = 0; outerA < resolution; outerA += 1) {
            for (let outerB = 0; outerB < resolution; outerB += 1) {
                for (let coordinate = 0; coordinate < resolution; coordinate += 1) {
                    const x = axis === 0 ? coordinate : outerA;
                    const y = axis === 1 ? coordinate : (axis === 0 ? outerA : outerB);
                    const z = axis === 2 ? coordinate : outerB;
                    line[coordinate] = source[(z * resolution + y) * resolution + x];
                }
                distanceTransform1d(line, resolution, transformed, sites, breaks);
                for (let coordinate = 0; coordinate < resolution; coordinate += 1) {
                    const x = axis === 0 ? coordinate : outerA;
                    const y = axis === 1 ? coordinate : (axis === 0 ? outerA : outerB);
                    const z = axis === 2 ? coordinate : outerB;
                    target[(z * resolution + y) * resolution + x] = transformed[coordinate];
                }
            }
        }
        [source, target] = [target, source];
    };
    runAxis(0);
    runAxis(1);
    runAxis(2);
    return source;
};

const squaredDistanceTransform3d = (occupied, resolution, distanceToOccupied) =>
    squaredDistanceTransform3dInto(
        occupied,
        resolution,
        distanceToOccupied,
        new Float64Array(resolution ** 3),
        new Float64Array(resolution ** 3),
    );

const createSignedDistanceChannel = (occupied, resolution, rangeVoxels) => {
    const outsideSquared = squaredDistanceTransform3d(occupied, resolution, 1);
    const insideSquared = squaredDistanceTransform3d(occupied, resolution, 0);
    const result = new Uint8Array(occupied.length);
    const cellCircumradius = Math.sqrt(3) * 0.5;
    for (let index = 0; index < occupied.length; index += 1) {
        const squared = occupied[index] ? insideSquared[index] : outsideSquared[index];
        const conservativeMagnitude = Math.max(0, Math.sqrt(squared) - cellCircumradius);
        const magnitudeCode = Math.floor(clamp(conservativeMagnitude / rangeVoxels) * 127);
        const signedCode = occupied[index] ? -magnitudeCode : magnitudeCode;
        result[index] = 128 + signedCode;
    }
    return result;
};

/**
 * Reinitialize a binary source mask into an exact Euclidean signed-distance
 * field. The large 3-D work buffers are Float32 and are reused for the inside
 * and outside passes; squared lattice distances at the supported resolutions
 * are integers exactly representable by Float32. The returned field is
 * clamped to the only narrow band that can survive atlas encoding.
 */
const createNarrowBandSignedDistanceField = (
    occupied,
    resolution,
    rangeVoxels,
) => {
    const voxelCount = resolution ** 3;
    const first = new Float32Array(voxelCount);
    const second = new Float32Array(voxelCount);
    const signedDistance = new Float32Array(voxelCount);
    const cellCircumradius = Math.sqrt(3) * 0.5;
    const writeDistance = (distanceSquared, sign, selectOccupied) => {
        for (let index = 0; index < voxelCount; index += 1) {
            if (Boolean(occupied[index]) !== selectOccupied) continue;
            const conservativeMagnitude = Math.min(
                rangeVoxels,
                Math.max(0, Math.sqrt(distanceSquared[index]) - cellCircumradius),
            );
            signedDistance[index] = sign * conservativeMagnitude;
        }
    };
    const outsideSquared = squaredDistanceTransform3dInto(
        occupied,
        resolution,
        1,
        first,
        second,
    );
    writeDistance(outsideSquared, 1, false);
    const insideSquared = squaredDistanceTransform3dInto(
        occupied,
        resolution,
        0,
        first,
        second,
    );
    writeDistance(insideSquared, -1, true);
    return {
        signedDistance,
        peakWorkingBytes: first.byteLength + second.byteLength +
            signedDistance.byteLength,
    };
};

const encodeConservativeSignedDistance = (signedDistanceVoxels, rangeVoxels) => {
    const magnitudeCode = Math.floor(
        clamp(Math.abs(signedDistanceVoxels) / rangeVoxels) * 127,
    );
    return 128 + (signedDistanceVoxels < 0 ? -magnitudeCode : magnitudeCode);
};

/**
 * Reduce an exact 2x source field to the fixed runtime lattice. Every target
 * texel owns one 2x2x2 source block. Density is the block's optical-mass mean,
 * including clear samples, with only the minimum positive byte required to
 * preserve a partially covered block. Attributes are density weighted inside
 * support and ordinary block means outside it, where they still classify the
 * procedural exterior. Signed distance is a box restriction of the fine
 * reinitialized field in target-voxel units, with its sign constrained to the
 * exactly reduced support before conservative quantization.
 */
export const reduceCloudMacroSource2x = ({
    density: sourceDensity,
    authoredDensity: sourceAuthoredDensity = null,
    detail: sourceDetail,
    phase: sourcePhase,
    precipitation: sourcePrecipitation,
    occupied: sourceOccupied,
    signedDistance: sourceSignedDistance,
    sourceResolution,
    targetResolution,
    occupancyThreshold = 16,
    sdfRangeVoxels = 12,
}) => {
    if (sourceResolution !== targetResolution * 2) {
        throw new Error("2x cloud reduction requires sourceResolution === targetResolution * 2");
    }
    const sourceVoxelCount = sourceResolution ** 3;
    for (const [name, field] of Object.entries({
        density: sourceDensity,
        detail: sourceDetail,
        phase: sourcePhase,
        precipitation: sourcePrecipitation,
        occupied: sourceOccupied,
        signedDistance: sourceSignedDistance,
    })) {
        if (!field || field.length !== sourceVoxelCount) {
            throw new Error(`${name} source field does not match the 2x source lattice`);
        }
    }
    if (sourceAuthoredDensity && sourceAuthoredDensity.length !== sourceVoxelCount) {
        throw new Error(
            "authoredDensity source field does not match the 2x source lattice",
        );
    }
    const targetVoxelCount = targetResolution ** 3;
    const density = new Uint8Array(targetVoxelCount);
    const detail = new Uint8Array(targetVoxelCount);
    const phase = new Uint8Array(targetVoxelCount);
    const precipitation = new Uint8Array(targetVoxelCount);
    const occupied = new Uint8Array(targetVoxelCount);
    const signedDistance = new Uint8Array(targetVoxelCount);
    const restrictedSignedDistance = new Float32Array(targetVoxelCount);
    const filteredSignedDistance = new Float32Array(targetVoxelCount);
    let sourceOccupiedVoxels = 0;
    let sourceDensityMassBytes = 0;
    let targetOccupiedVoxels = 0;
    let targetEquivalentDensityMassBytes = 0;
    let partiallyCoveredTargetVoxels = 0;
    let minimumPositiveCoverage = 1;
    let coverageSum = 0;
    let massCapacityClampedTargetVoxels = 0;
    let massCapacityRemovedBytes = 0;
    const sourceSamplesPerTarget = 8;
    for (let z = 0; z < targetResolution; z += 1) {
        for (let y = 0; y < targetResolution; y += 1) {
            for (let x = 0; x < targetResolution; x += 1) {
                const targetIndex = (z * targetResolution + y) * targetResolution + x;
                let densitySum = 0;
                let detailSum = 0;
                let phaseSum = 0;
                let precipitationSum = 0;
                let weightedDetailSum = 0;
                let weightedPhaseSum = 0;
                let weightedPrecipitationSum = 0;
                let supportCount = 0;
                let authoredPositiveCount = 0;
                let signedDistanceSum = 0;
                for (let dz = 0; dz < 2; dz += 1) {
                    const sourceZ = z * 2 + dz;
                    for (let dy = 0; dy < 2; dy += 1) {
                        const sourceY = y * 2 + dy;
                        for (let dx = 0; dx < 2; dx += 1) {
                            const sourceX = x * 2 + dx;
                            const sourceIndex = (
                                (sourceZ * sourceResolution + sourceY) *
                                sourceResolution + sourceX
                            );
                            const sourceDensityByte = sourceDensity[sourceIndex];
                            if (sourceAuthoredDensity?.[sourceIndex] > 0) {
                                authoredPositiveCount += 1;
                            }
                            densitySum += sourceDensityByte;
                            detailSum += sourceDetail[sourceIndex];
                            phaseSum += sourcePhase[sourceIndex];
                            precipitationSum += sourcePrecipitation[sourceIndex];
                            weightedDetailSum += sourceDetail[sourceIndex] *
                                sourceDensityByte;
                            weightedPhaseSum += sourcePhase[sourceIndex] *
                                sourceDensityByte;
                            weightedPrecipitationSum +=
                                sourcePrecipitation[sourceIndex] * sourceDensityByte;
                            signedDistanceSum += sourceSignedDistance[sourceIndex];
                            if (!sourceOccupied[sourceIndex]) continue;
                            supportCount += 1;
                            sourceOccupiedVoxels += 1;
                            sourceDensityMassBytes += sourceDensityByte;
                        }
                    }
                }
                const hasSupport = supportCount > 0;
                occupied[targetIndex] = hasSupport ? 1 : 0;
                if (hasSupport) {
                    const massMean = Math.round(densitySum / sourceSamplesPerTarget);
                    const unconstrainedDensity = Math.max(
                        occupancyThreshold,
                        massMean,
                    );
                    // The guarded high-ice source atlas preserves every
                    // authored zero. Its coarse parent therefore cannot ask
                    // the positive fine children to carry more than their
                    // exact R8 capacity. Nearest-byte quantization can exceed
                    // that capacity by at most half a coarse byte (for
                    // example 2 * 255 / 8 = 63.75 rounds to 64). Clamp only
                    // when the independent authored-density field is supplied;
                    // protected Cu and the generic reducer retain their
                    // versioned nearest-mean bytes.
                    const capacityDensity = sourceAuthoredDensity
                        ? Math.floor(
                            authoredPositiveCount * 255 /
                            sourceSamplesPerTarget,
                        )
                        : 255;
                    if (sourceAuthoredDensity &&
                        capacityDensity < occupancyThreshold) {
                        throw new Error(
                            "authored high-ice support cannot carry the occupancy floor",
                        );
                    }
                    density[targetIndex] = Math.min(
                        unconstrainedDensity,
                        capacityDensity,
                    );
                    if (density[targetIndex] < unconstrainedDensity) {
                        massCapacityClampedTargetVoxels += 1;
                        massCapacityRemovedBytes +=
                            unconstrainedDensity - density[targetIndex];
                    }
                    detail[targetIndex] = Math.round(weightedDetailSum / densitySum);
                    phase[targetIndex] = Math.round(weightedPhaseSum / densitySum);
                    precipitation[targetIndex] = Math.round(
                        weightedPrecipitationSum / densitySum,
                    );
                    targetOccupiedVoxels += 1;
                    targetEquivalentDensityMassBytes +=
                        density[targetIndex] * sourceSamplesPerTarget;
                    const coverage = supportCount / sourceSamplesPerTarget;
                    coverageSum += coverage;
                    minimumPositiveCoverage = Math.min(minimumPositiveCoverage, coverage);
                    if (supportCount < sourceSamplesPerTarget) {
                        partiallyCoveredTargetVoxels += 1;
                    }
                } else {
                    detail[targetIndex] = Math.round(detailSum / sourceSamplesPerTarget);
                    phase[targetIndex] = Math.round(phaseSum / sourceSamplesPerTarget);
                    precipitation[targetIndex] = Math.round(
                        precipitationSum / sourceSamplesPerTarget,
                    );
                }
                const restrictedDistance =
                    signedDistanceSum / sourceSamplesPerTarget / 2;
                restrictedSignedDistance[targetIndex] = hasSupport
                    ? Math.min(0, restrictedDistance)
                    : Math.max(0, restrictedDistance);
            }
        }
    }
    // One compact B-spline restriction pass removes selector creases between
    // adjacent 2x blocks. Reapply the exact reduced-support sign afterward so
    // filtering can neither erase a thin occupied block nor invent support.
    const filterWeights = [1, 2, 1];
    for (let z = 0; z < targetResolution; z += 1) {
        for (let y = 0; y < targetResolution; y += 1) {
            for (let x = 0; x < targetResolution; x += 1) {
                const targetIndex = (z * targetResolution + y) * targetResolution + x;
                let weightedSum = 0;
                let weightSum = 0;
                for (let dz = -1; dz <= 1; dz += 1) {
                    const sourceZ = z + dz;
                    if (sourceZ < 0 || sourceZ >= targetResolution) continue;
                    for (let dy = -1; dy <= 1; dy += 1) {
                        const sourceY = y + dy;
                        if (sourceY < 0 || sourceY >= targetResolution) continue;
                        for (let dx = -1; dx <= 1; dx += 1) {
                            const sourceX = x + dx;
                            if (sourceX < 0 || sourceX >= targetResolution) continue;
                            const weight = filterWeights[dx + 1] *
                                filterWeights[dy + 1] * filterWeights[dz + 1];
                            weightedSum += restrictedSignedDistance[(
                                (sourceZ * targetResolution + sourceY) *
                                targetResolution + sourceX
                            )] * weight;
                            weightSum += weight;
                        }
                    }
                }
                const filtered = weightedSum / weightSum;
                filteredSignedDistance[targetIndex] = occupied[targetIndex]
                    ? Math.min(0, filtered)
                    : Math.max(0, filtered);
                signedDistance[targetIndex] = encodeConservativeSignedDistance(
                    filteredSignedDistance[targetIndex],
                    sdfRangeVoxels,
                );
            }
        }
    }
    let lostSourceSupportVoxels = 0;
    for (let z = 0; z < sourceResolution; z += 1) {
        for (let y = 0; y < sourceResolution; y += 1) {
            for (let x = 0; x < sourceResolution; x += 1) {
                const sourceIndex = (z * sourceResolution + y) * sourceResolution + x;
                if (!sourceOccupied[sourceIndex]) continue;
                const targetIndex = (
                    (Math.floor(z / 2) * targetResolution + Math.floor(y / 2)) *
                    targetResolution + Math.floor(x / 2)
                );
                if (!occupied[targetIndex] || density[targetIndex] < occupancyThreshold) {
                    lostSourceSupportVoxels += 1;
                }
            }
        }
    }
    return {
        density,
        detail,
        phase,
        precipitation,
        occupied,
        signedDistance,
        diagnostics: {
            sourceResolution,
            targetResolution,
            sourceOccupiedVoxels,
            targetOccupiedVoxels,
            lostSourceSupportVoxels,
            partiallyCoveredTargetVoxels,
            minimumPositiveCoverage:
                targetOccupiedVoxels > 0 ? minimumPositiveCoverage : 0,
            meanPositiveCoverage:
                coverageSum / Math.max(1, targetOccupiedVoxels),
            sourceDensityMassBytes,
            targetEquivalentDensityMassBytes,
            densityMassRatio: targetEquivalentDensityMassBytes /
                Math.max(1, sourceDensityMassBytes),
            massCapacityClampedTargetVoxels,
            massCapacityRemovedBytes,
        },
    };
};

/**
 * Restrict an authored 2x high-ice source into two normalized moments that
 * survive beside (and never mutate) the authoritative coarse RGBA atlas.
 *
 * R stores the normalized within-voxel second moment. For the conditioned
 * production path, d_i is the exact mass-conditioned authored fine byte;
 * without targetDensity/parentOccupied it retains the raw source behavior.
 *
 *     E2 = (1/8) Σ d_i²,   R = round(clamp(E2) * 255).
 *
 * G stores fractional binary support, G = round((n / 8) * 255), where n is
 * the count of sourceOccupied samples.  E2 and coverage are affine under
 * linear filtering; a consumer derives the non-negative variance as
 * max(E2 - μ², 0) using the coarse density mean. Unsupported coarse voxels
 * are explicitly zeroed in both channels.
 */
export const reduceCloudHighIceMomentSource2x = ({
    density: sourceDensity,
    occupied: sourceOccupied,
    sourceResolution,
    targetResolution,
    targetDensity = null,
    parentOccupied = null,
}) => {
    if (sourceResolution !== targetResolution * 2) {
        throw new Error(
            "high-ice moment reduction requires sourceResolution === targetResolution * 2",
        );
    }
    const sourceVoxelCount = sourceResolution ** 3;
    for (const [name, field] of Object.entries({
        density: sourceDensity,
        occupied: sourceOccupied,
    })) {
        if (!field || field.length !== sourceVoxelCount) {
            throw new Error(`${name} source field does not match the 2x source lattice`);
        }
    }
    if ((targetDensity === null) !== (parentOccupied === null) ||
        (targetDensity && targetDensity.length !== targetResolution ** 3) ||
        (parentOccupied && parentOccupied.length !== targetResolution ** 3)) {
        throw new Error(
            "high-ice conditioned moments require matching target density/support fields",
        );
    }
    const targetVoxelCount = targetResolution ** 3;
    const secondMoment = new Uint8Array(targetVoxelCount);
    const coverage = new Uint8Array(targetVoxelCount);
    let supportedVoxelCount = 0;
    let positiveCoverageSum = 0;
    let maximumSecondMoment = 0;
    for (let z = 0; z < targetResolution; z += 1) {
        for (let y = 0; y < targetResolution; y += 1) {
            for (let x = 0; x < targetResolution; x += 1) {
                const targetIndex = (z * targetResolution + y) * targetResolution + x;
                if (parentOccupied && !parentOccupied[targetIndex]) continue;
                let secondMomentSum = 0;
                let supportCount = 0;
                const conditionedBlock = targetDensity
                    ? new Uint8Array(8) : null;
                let blockChild = 0;
                for (let dz = 0; dz < 2; dz += 1) {
                    const sourceZ = z * 2 + dz;
                    for (let dy = 0; dy < 2; dy += 1) {
                        const sourceY = y * 2 + dy;
                        for (let dx = 0; dx < 2; dx += 1) {
                            const sourceX = x * 2 + dx;
                            const sourceIndex = (
                                (sourceZ * sourceResolution + sourceY) *
                                sourceResolution + sourceX
                            );
                            if (conditionedBlock) {
                                conditionedBlock[blockChild++] = sourceDensity[sourceIndex];
                            }
                            const normalizedDensity = sourceDensity[sourceIndex] / 255;
                            secondMomentSum += normalizedDensity ** 2;
                            if (sourceOccupied[sourceIndex]) supportCount += 1;
                        }
                    }
                }
                if (conditionedBlock) {
                    const conditioned = conditionCloudHighIceSourceBlockMass({
                        density: conditionedBlock,
                        targetDensity: targetDensity[targetIndex],
                        parentOccupied: true,
                    });
                    secondMomentSum = 0;
                    supportCount = 0;
                    for (const value of conditioned) {
                        secondMomentSum += (value / 255) ** 2;
                        if (value > 0) supportCount += 1;
                    }
                }
                if (supportCount === 0) continue;
                const normalizedSecondMoment = clamp(secondMomentSum / 8);
                const fractionalCoverage = supportCount / 8;
                secondMoment[targetIndex] = Math.round(normalizedSecondMoment * 255);
                coverage[targetIndex] = Math.round(fractionalCoverage * 255);
                supportedVoxelCount += 1;
                positiveCoverageSum += fractionalCoverage;
                maximumSecondMoment = Math.max(maximumSecondMoment, normalizedSecondMoment);
            }
        }
    }
    return {
        secondMoment,
        coverage,
        diagnostics: {
            sourceResolution,
            targetResolution,
            supportedVoxelCount,
            meanPositiveCoverage: positiveCoverageSum /
                Math.max(1, supportedVoxelCount),
            maximumNormalizedSecondMoment: maximumSecondMoment,
        },
    };
};

export const decodeCloudSignedDistanceVoxels = (encoded, rangeVoxels = 12) =>
    (encoded - 128) / 127 * rangeVoxels;

const createExteriorPotentialDensity = (
    density,
    detail,
    phase,
    signedDistance,
    boundary,
    resolution,
    rangeVoxels,
) => {
    const result = new Uint8Array(density);
    let exteriorPotentialVoxels = 0;
    let maximumExteriorDensityByte = 0;
    let minimumSignedDistanceVoxels = Infinity;
    let maximumSignedDistanceVoxels = 0;
    const bounds = {
        minimum: [resolution, resolution, resolution],
        maximum: [-1, -1, -1],
    };
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (density[index] > 0) continue;
                const signedDistanceVoxels = decodeCloudSignedDistanceVoxels(
                    signedDistance[index],
                    rangeVoxels,
                );
                const detailClass = selectCloudExteriorDetailClass(
                    boundary,
                    detail[index] / 255,
                    phase[index] / 255,
                );
                const definition = CLOUD_EXTERIOR_DETAIL_CLASSES[detailClass];
                // This is deliberately the class' largest directional reach.
                // The shader may use a smaller normal-projected reach, but the
                // acceleration hierarchy can never assume that normal before
                // sampling the signed-distance neighborhood.
                const outwardSupportVoxels = definition.maximumCanonicalDisplacement *
                    (resolution - 1) * Math.max(...definition.axisScale) +
                    boundary.interpolationHaloVoxels;
                if (signedDistanceVoxels < 0 || signedDistanceVoxels > outwardSupportVoxels) {
                    continue;
                }
                const ceiling = Math.ceil(definition.maximumExteriorDensity * 255);
                result[index] = ceiling;
                exteriorPotentialVoxels += 1;
                maximumExteriorDensityByte = Math.max(maximumExteriorDensityByte, ceiling);
                minimumSignedDistanceVoxels = Math.min(
                    minimumSignedDistanceVoxels,
                    signedDistanceVoxels,
                );
                maximumSignedDistanceVoxels = Math.max(
                    maximumSignedDistanceVoxels,
                    signedDistanceVoxels,
                );
                bounds.minimum[0] = Math.min(bounds.minimum[0], x);
                bounds.minimum[1] = Math.min(bounds.minimum[1], y);
                bounds.minimum[2] = Math.min(bounds.minimum[2], z);
                bounds.maximum[0] = Math.max(bounds.maximum[0], x);
                bounds.maximum[1] = Math.max(bounds.maximum[1], y);
                bounds.maximum[2] = Math.max(bounds.maximum[2], z);
            }
        }
    }
    return {
        potentialDensity: result,
        statistics: {
            exteriorPotentialVoxels,
            exteriorPotentialFraction: exteriorPotentialVoxels / density.length,
            exteriorMaximumDensityByte: maximumExteriorDensityByte,
            exteriorMinimumSignedDistanceVoxels:
                Number.isFinite(minimumSignedDistanceVoxels) ? minimumSignedDistanceVoxels : 0,
            exteriorMaximumSignedDistanceVoxels: maximumSignedDistanceVoxels,
            exteriorPotentialBounds: exteriorPotentialVoxels > 0 ? bounds : null,
        },
    };
};

const measureConnectivity = (occupied, resolution) => {
    const visited = new Uint8Array(occupied.length);
    const queue = new Int32Array(occupied.length);
    let occupiedCount = 0;
    let componentCount = 0;
    let largest = 0;
    const componentSizes = [];
    const componentBounds = [];
    let minX = resolution;
    let minY = resolution;
    let minZ = resolution;
    let maxX = -1;
    let maxY = -1;
    let maxZ = -1;
    for (let index = 0; index < occupied.length; index += 1) {
        if (!occupied[index]) continue;
        occupiedCount += 1;
        const z = Math.floor(index / (resolution * resolution));
        const remainder = index - z * resolution * resolution;
        const y = Math.floor(remainder / resolution);
        const x = remainder - y * resolution;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        maxZ = Math.max(maxZ, z);
    }
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || visited[start]) continue;
        componentCount += 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        visited[start] = 1;
        let componentMinX = resolution;
        let componentMinY = resolution;
        let componentMinZ = resolution;
        let componentMaxX = -1;
        let componentMaxY = -1;
        let componentMaxZ = -1;
        while (head < tail) {
            const index = queue[head++];
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            componentMinX = Math.min(componentMinX, x);
            componentMinY = Math.min(componentMinY, y);
            componentMinZ = Math.min(componentMinZ, z);
            componentMaxX = Math.max(componentMaxX, x);
            componentMaxY = Math.max(componentMaxY, y);
            componentMaxZ = Math.max(componentMaxZ, z);
            const push = (neighbor) => {
                if (occupied[neighbor] && !visited[neighbor]) {
                    visited[neighbor] = 1;
                    queue[tail++] = neighbor;
                }
            };
            if (x > 0) push(index - 1);
            if (x + 1 < resolution) push(index + 1);
            if (y > 0) push(index - resolution);
            if (y + 1 < resolution) push(index + resolution);
            if (z > 0) push(index - resolution * resolution);
            if (z + 1 < resolution) push(index + resolution * resolution);
        }
        largest = Math.max(largest, tail);
        componentSizes.push(tail);
        componentBounds.push({
            size: tail,
            minimum: [componentMinX, componentMinY, componentMinZ],
            maximum: [componentMaxX, componentMaxY, componentMaxZ],
        });
    }
    componentBounds.sort((a, b) => b.size - a.size);
    componentSizes.sort((a, b) => b - a);
    const normalizeBound = (value) => value / Math.max(1, resolution - 1);
    return {
        occupiedVoxels: occupiedCount,
        occupancyFraction: occupiedCount / occupied.length,
        connectedComponentCount: componentCount,
        largestComponentFraction: occupiedCount > 0 ? largest / occupiedCount : 0,
        dominantComponentFractions: componentSizes.slice(0, 8).map((size) => size / Math.max(1, occupiedCount)),
        dominantComponentBounds: componentBounds.slice(0, 8).map((component) => ({
            fraction: component.size / Math.max(1, occupiedCount),
            minimum: component.minimum.map(normalizeBound),
            maximum: component.maximum.map(normalizeBound),
        })),
        occupiedBounds: occupiedCount > 0 ? {
            minimum: [normalizeBound(minX), normalizeBound(minY), normalizeBound(minZ)],
            maximum: [normalizeBound(maxX), normalizeBound(maxY), normalizeBound(maxZ)],
        } : { minimum: [0, 0, 0], maximum: [0, 0, 0] },
    };
};

const measureSurfaceFraction = (occupied, resolution) => {
    let occupiedCount = 0;
    let surfaceCount = 0;
    const slice = resolution * resolution;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (!occupied[index]) continue;
                occupiedCount += 1;
                if (
                    x === 0 || x + 1 === resolution ||
                    y === 0 || y + 1 === resolution ||
                    z === 0 || z + 1 === resolution ||
                    !occupied[index - 1] || !occupied[index + 1] ||
                    !occupied[index - resolution] || !occupied[index + resolution] ||
                    !occupied[index - slice] || !occupied[index + slice]
                ) surfaceCount += 1;
            }
        }
    }
    return surfaceCount / Math.max(1, occupiedCount);
};

const measureSignedDistanceSurfaceQuality = (
    signedDistance,
    resolution,
    rangeVoxels,
) => {
    const voxelCount = resolution ** 3;
    const decoded = new Float32Array(voxelCount);
    const normals = new Float32Array(voxelCount * 3);
    const valid = new Uint8Array(voxelCount);
    for (let index = 0; index < voxelCount; index += 1) {
        decoded[index] = decodeCloudSignedDistanceVoxels(
            signedDistance[index],
            rangeVoxels,
        );
    }
    const slice = resolution * resolution;
    let normalSampleCount = 0;
    let axisDominantCount = 0;
    let latticeCreaseCount = 0;
    for (let z = 1; z + 1 < resolution; z += 1) {
        for (let y = 1; y + 1 < resolution; y += 1) {
            for (let x = 1; x + 1 < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (Math.abs(decoded[index]) > 2.25) continue;
                const gradientX = decoded[index + 1] - decoded[index - 1];
                const gradientY = decoded[index + resolution] -
                    decoded[index - resolution];
                const gradientZ = decoded[index + slice] - decoded[index - slice];
                const length = Math.hypot(gradientX, gradientY, gradientZ);
                if (length < 1e-6) continue;
                const normalX = gradientX / length;
                const normalY = gradientY / length;
                const normalZ = gradientZ / length;
                normals[index * 3] = normalX;
                normals[index * 3 + 1] = normalY;
                normals[index * 3 + 2] = normalZ;
                valid[index] = 1;
                normalSampleCount += 1;
                const components = [
                    Math.abs(normalX),
                    Math.abs(normalY),
                    Math.abs(normalZ),
                ].sort((left, right) => right - left);
                if (components[0] >= 0.97) axisDominantCount += 1;
                if (
                    Math.abs(components[0] - components[1]) < 0.035 &&
                    components[2] < 0.12
                ) latticeCreaseCount += 1;
            }
        }
    }
    let neighboringNormalPairs = 0;
    let sharpNormalCreases = 0;
    let neighboringNormalVariation = 0;
    const sharpCreaseDotThreshold = Math.cos(35 * Math.PI / 180);
    for (let z = 1; z + 1 < resolution; z += 1) {
        for (let y = 1; y + 1 < resolution; y += 1) {
            for (let x = 1; x + 1 < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (!valid[index]) continue;
                for (const neighbor of [index + 1, index + resolution, index + slice]) {
                    if (!valid[neighbor]) continue;
                    const dot = clamp(
                        normals[index * 3] * normals[neighbor * 3] +
                        normals[index * 3 + 1] * normals[neighbor * 3 + 1] +
                        normals[index * 3 + 2] * normals[neighbor * 3 + 2],
                        -1,
                        1,
                    );
                    neighboringNormalPairs += 1;
                    neighboringNormalVariation += 1 - dot;
                    if (dot < sharpCreaseDotThreshold) sharpNormalCreases += 1;
                }
            }
        }
    }
    return {
        signedDistanceSurfaceNormalSampleCount: normalSampleCount,
        signedDistanceAxisDominantNormalFraction:
            axisDominantCount / Math.max(1, normalSampleCount),
        signedDistanceLatticeCreaseNormalFraction:
            latticeCreaseCount / Math.max(1, normalSampleCount),
        signedDistanceSharpNormalCreaseFraction:
            sharpNormalCreases / Math.max(1, neighboringNormalPairs),
        signedDistanceMeanNeighborNormalVariation:
            neighboringNormalVariation / Math.max(1, neighboringNormalPairs),
    };
};

const measureReconstructionSupport = (occupied, resolution) => {
    let occupiedCount = 0;
    let neighborSum = 0;
    let trilinearCoreCount = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (!occupied[index]) continue;
                occupiedCount += 1;
                let directNeighbors = 0;
                let neighborhood = 0;
                for (let dz = -1; dz <= 1; dz += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        for (let dx = -1; dx <= 1; dx += 1) {
                            if (dx === 0 && dy === 0 && dz === 0) continue;
                            const nx = x + dx;
                            const ny = y + dy;
                            const nz = z + dz;
                            if (nx < 0 || nx >= resolution || ny < 0 || ny >= resolution || nz < 0 || nz >= resolution) continue;
                            if (!occupied[(nz * resolution + ny) * resolution + nx]) continue;
                            neighborhood += 1;
                            if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) === 1) directNeighbors += 1;
                        }
                    }
                }
                neighborSum += directNeighbors;
                if (neighborhood >= 3) trilinearCoreCount += 1;
            }
        }
    }
    return {
        meanOccupiedNeighborCount: neighborSum / Math.max(1, occupiedCount),
        trilinearCoreFraction: trilinearCoreCount / Math.max(1, occupiedCount),
    };
};

const measureBinaryProjectionTopology = (projected, width, height) => {
    const visitedForeground = new Uint8Array(projected.length);
    const visitedBackground = new Uint8Array(projected.length);
    const queue = new Int32Array(projected.length);
    const componentSizes = [];
    const flood = (start, foreground, visited) => {
        let read = 0;
        let write = 1;
        let size = 0;
        queue[0] = start;
        visited[start] = 1;
        while (read < write) {
            const index = queue[read++];
            size += 1;
            const x = index % width;
            const y = Math.floor(index / width);
            const append = (nx, ny) => {
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
                const neighbor = ny * width + nx;
                if (visited[neighbor] || Boolean(projected[neighbor]) !== foreground) return;
                visited[neighbor] = 1;
                queue[write++] = neighbor;
            };
            append(x - 1, y);
            append(x + 1, y);
            append(x, y - 1);
            append(x, y + 1);
        }
        return size;
    };
    for (let index = 0; index < projected.length; index += 1) {
        if (!projected[index] || visitedForeground[index]) continue;
        componentSizes.push(flood(index, true, visitedForeground));
    }
    // Mark all clear air connected to the projection boundary. Remaining
    // clear components are real silhouette holes/negative space.
    const boundaryStarts = [];
    for (let x = 0; x < width; x += 1) {
        boundaryStarts.push(x, (height - 1) * width + x);
    }
    for (let y = 1; y + 1 < height; y += 1) {
        boundaryStarts.push(y * width, y * width + width - 1);
    }
    for (const start of boundaryStarts) {
        if (projected[start] || visitedBackground[start]) continue;
        flood(start, false, visitedBackground);
    }
    let holeCount = 0;
    let holeArea = 0;
    for (let index = 0; index < projected.length; index += 1) {
        if (projected[index] || visitedBackground[index]) continue;
        const size = flood(index, false, visitedBackground);
        if (size < 2) continue;
        holeCount += 1;
        holeArea += size;
    }
    componentSizes.sort((left, right) => right - left);
    const foregroundArea = componentSizes.reduce((sum, size) => sum + size, 0);
    return {
        componentCount: componentSizes.length,
        largestComponentFraction: componentSizes[0] /
            Math.max(1, foregroundArea),
        holeCount,
        holeAreaFraction: holeArea / Math.max(1, foregroundArea + holeArea),
    };
};

const measureProjectedFootprint = (occupied, resolution) => {
    const projected = new Uint8Array(resolution * resolution);
    let minX = resolution;
    let minZ = resolution;
    let maxX = -1;
    let maxZ = -1;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            for (let y = 0; y < resolution; y += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                projected[z * resolution + x] = 1;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
                break;
            }
        }
    }
    let area = 0;
    let perimeter = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            if (!projected[z * resolution + x]) continue;
            area += 1;
            if (x === 0 || !projected[z * resolution + x - 1]) perimeter += 1;
            if (x + 1 === resolution || !projected[z * resolution + x + 1]) perimeter += 1;
            if (z === 0 || !projected[(z - 1) * resolution + x]) perimeter += 1;
            if (z + 1 === resolution || !projected[(z + 1) * resolution + x]) perimeter += 1;
        }
    }
    const mirrorSimilarity = (axis) => {
        if (area === 0) return 0;
        let intersection = 0;
        let union = 0;
        for (let z = minZ; z <= maxZ; z += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                const mirrorX = axis === 0 ? minX + maxX - x : x;
                const mirrorZ = axis === 1 ? minZ + maxZ - z : z;
                const source = projected[z * resolution + x];
                const mirrored = projected[mirrorZ * resolution + mirrorX];
                if (source || mirrored) union += 1;
                if (source && mirrored) intersection += 1;
            }
        }
        return intersection / Math.max(1, union);
    };
    const topology = measureBinaryProjectionTopology(
        projected,
        resolution,
        resolution,
    );
    let centroidX = 0;
    let centroidZ = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            if (!projected[z * resolution + x]) continue;
            centroidX += x;
            centroidZ += z;
        }
    }
    centroidX /= Math.max(1, area);
    centroidZ /= Math.max(1, area);
    let covarianceXX = 0;
    let covarianceZZ = 0;
    let covarianceXZ = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            if (!projected[z * resolution + x]) continue;
            const dx = x - centroidX;
            const dz = z - centroidZ;
            covarianceXX += dx * dx;
            covarianceZZ += dz * dz;
            covarianceXZ += dx * dz;
        }
    }
    covarianceXX /= Math.max(1, area);
    covarianceZZ /= Math.max(1, area);
    covarianceXZ /= Math.max(1, area);
    const covarianceTrace = covarianceXX + covarianceZZ;
    const covarianceDiscriminant = Math.sqrt(Math.max(
        0,
        (covarianceXX - covarianceZZ) ** 2 + 4 * covarianceXZ ** 2,
    ));
    const principalVariance = (covarianceTrace + covarianceDiscriminant) * 0.5;
    const secondaryVariance = (covarianceTrace - covarianceDiscriminant) * 0.5;
    return {
        projectedFootprintCompactness: perimeter > 0 ? 4 * Math.PI * area / (perimeter * perimeter) : 0,
        projectedMirrorSimilarity: (mirrorSimilarity(0) + mirrorSimilarity(1)) * 0.5,
        projectedFootprintComponentCount: topology.componentCount,
        projectedFootprintLargestComponentFraction:
            topology.largestComponentFraction,
        projectedFootprintHoleCount: topology.holeCount,
        projectedFootprintHoleAreaFraction: topology.holeAreaFraction,
        projectedPrincipalAspectRatio: Math.sqrt(
            (principalVariance + 1e-6) / (secondaryVariance + 1e-6),
        ),
        projectedPrincipalAxisRadians: 0.5 * Math.atan2(
            2 * covarianceXZ,
            covarianceXX - covarianceZZ,
        ),
    };
};

/**
 * Integrate encoded condensate density through every occupied projection.
 * Density is normalized while the sample spacing is expressed in canonical
 * volume lengths, so the result is a dimensionless path. Runtime transport
 * divides physical LWP/IWP extinction by the vertical mean before applying
 * local Mie/ice mass extinction. This gives every species the same physical
 * column contract despite very different atlas support and density ranges.
 */
const measureProjectedDensityPaths = (density, resolution) => {
    const sampleSpacing = 1 / Math.max(1, resolution - 1);
    const paths = [[], [], []];
    const appendPath = (axis, first, second) => {
        let integral = 0;
        for (let along = 0; along < resolution; along += 1) {
            const x = axis === 0 ? along : first;
            const y = axis === 1 ? along : axis === 0 ? first : second;
            const z = axis === 2 ? along : second;
            integral += density[(z * resolution + y) * resolution + x] /
                255 * sampleSpacing;
        }
        if (integral > 0) paths[axis].push(integral);
    };
    for (let first = 0; first < resolution; first += 1) {
        for (let second = 0; second < resolution; second += 1) {
            // X: first=y, second=z. Y: first=x, second=z. Z: first=x, second=y.
            appendPath(0, first, second);
            appendPath(1, first, second);
            appendPath(2, first, second);
        }
    }
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length);
    const percentile = (values, amount) => {
        if (!values.length) return 0;
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.min(
            sorted.length - 1,
            Math.floor((sorted.length - 1) * amount),
        )];
    };
    return {
        meanDensityPathCrosswind: mean(paths[0]),
        meanDensityPathVertical: mean(paths[1]),
        meanDensityPathDownwind: mean(paths[2]),
        p90DensityPathVertical: percentile(paths[1], 0.9),
    };
};

const measureDensityDistribution = (density) => {
    let occupiedCount = 0;
    let denseCount = 0;
    let fringeCount = 0;
    let denseSum = 0;
    let fringeSum = 0;
    let totalSum = 0;
    let normalizedSum = 0;
    let normalizedSquareSum = 0;
    let normalizedCubeSum = 0;
    let saturationCount = 0;
    for (const value of density) {
        if (value === 0) continue;
        occupiedCount += 1;
        totalSum += value;
        const normalized = value / 255;
        normalizedSum += normalized;
        normalizedSquareSum += normalized * normalized;
        normalizedCubeSum += normalized * normalized * normalized;
        if (value >= 250) saturationCount += 1;
        if (value >= 191) {
            denseCount += 1;
            denseSum += value;
        }
        if (value < 64) {
            fringeCount += 1;
            fringeSum += value;
        }
    }
    const mean = normalizedSum / Math.max(1, occupiedCount);
    const variance = normalizedSquareSum / Math.max(1, occupiedCount) - mean * mean;
    const standardDeviation = Math.sqrt(Math.max(0, variance));
    const centralThirdMoment = normalizedCubeSum /
        Math.max(1, occupiedCount) - 3 * mean *
            normalizedSquareSum / Math.max(1, occupiedCount) + 2 * mean ** 3;
    return {
        denseCoreFraction: denseCount / Math.max(1, occupiedCount),
        denseCoreMeanDensity: denseSum / Math.max(1, denseCount) / 255,
        denseCoreMassFraction: denseSum / Math.max(1, totalSum),
        diluteFringeFraction: fringeCount / Math.max(1, occupiedCount),
        diluteFringeMassFraction: fringeSum / Math.max(1, totalSum),
        positiveDensitySkew:
            centralThirdMoment / Math.max(1e-6, standardDeviation ** 3),
        positiveDensitySaturationFraction:
            saturationCount / Math.max(1, occupiedCount),
    };
};

/**
 * Measure material variation away from both the silhouette and authored dry
 * cavities.  Whole-volume variance is a poor guard for dense ice patches: a
 * constant milky core can pass it using only a complicated edge.  One coarse
 * voxel of negative SDF is the smallest interior that survives trilinear
 * reconstruction without borrowing exterior sky.
 */
const measureDeepInteriorDensityVariation = (
    density,
    signedDistance,
    rangeVoxels,
) => {
    const values = [];
    for (let index = 0; index < density.length; index += 1) {
        if (density[index] === 0 ||
            decodeCloudSignedDistanceVoxels(
                signedDistance[index],
                rangeVoxels,
            ) > -1) continue;
        values.push(density[index] / 255);
    }
    values.sort((left, right) => left - right);
    const mean = values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length);
    const variance = values.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0,
    ) / Math.max(1, values.length);
    const quantile = (amount) => values.length === 0 ? 0 : values[
        Math.min(
            values.length - 1,
            Math.floor(amount * (values.length - 1)),
        )
    ];
    return {
        deepInteriorDensitySampleCount: values.length,
        deepInteriorDensityMean: mean,
        deepInteriorDensityCoefficientOfVariation:
            Math.sqrt(variance) / Math.max(1e-6, mean),
        deepInteriorNearUniformHighFraction: values.filter(
            (value) => value >= 200 / 255,
        ).length / Math.max(1, values.length),
        deepInteriorDensityP10: quantile(0.10),
        deepInteriorDensityP90: quantile(0.90),
    };
};

/**
 * Measure optical-depth hierarchy on the emitted macro field itself.  A
 * smooth milky patch can have a complicated SDF edge while every traversed
 * interior column remains nearly constant; this statistic deliberately
 * ignores the outer silhouette and compares only columns with a substantial
 * occupied run.  It is used by projection qualification to reject edge-only
 * detail and to document that dry-air channels survive the two reductions.
 */
const measureInteriorOpticalDepthHierarchy = (density, occupied, resolution) => {
    const averageOf = (values) => values.reduce((sum, value) => sum + value, 0) /
        Math.max(1, values.length);
    const axes = [0, 1, 2];
    const axisStats = axes.map((axis) => {
        const means = [];
        let eligibleColumns = 0;
        let structuredColumns = 0;
        let clearGapColumns = 0;
        for (let first = 0; first < resolution; first += 1) {
            for (let second = 0; second < resolution; second += 1) {
                const values = [];
                let occupiedSamples = 0;
                let firstOccupied = resolution;
                let lastOccupied = -1;
                for (let along = 0; along < resolution; along += 1) {
                    const x = axis === 0 ? along : first;
                    const y = axis === 1 ? along : axis === 0 ? first : second;
                    const z = axis === 2 ? along : second;
                    const index = (z * resolution + y) * resolution + x;
                    if (!occupied[index]) continue;
                    occupiedSamples += 1;
                    firstOccupied = Math.min(firstOccupied, along);
                    lastOccupied = Math.max(lastOccupied, along);
                    values.push(density[index] / 255);
                }
                // Three samples are the minimum resolvable interior path after
                // a 2x source reduction.  Restrict the variation to occupied
                // runs so a long clear-air exterior cannot masquerade as a
                // high optical hierarchy.
                if (occupiedSamples < 3 || lastOccupied - firstOccupied < 2) {
                    continue;
                }
                eligibleColumns += 1;
                const average = averageOf(values);
                const variance = averageOf(values.map((value) =>
                    (value - average) ** 2));
                means.push(average);
                const coefficient = Math.sqrt(variance) /
                    Math.max(1e-6, average);
                if (coefficient >= 0.18) structuredColumns += 1;
                // A zero-density interval enclosed by occupied support is a
                // true internal dry-air window, not a detached edge sample.
                let enclosedClear = false;
                for (let along = firstOccupied + 1;
                    along < lastOccupied; along += 1) {
                    const x = axis === 0 ? along : first;
                    const y = axis === 1 ? along : axis === 0 ? first : second;
                    const z = axis === 2 ? along : second;
                    if (!occupied[(z * resolution + y) * resolution + x]) {
                        enclosedClear = true;
                        break;
                    }
                }
                if (enclosedClear) clearGapColumns += 1;
            }
        }
        const globalMean = averageOf(means);
        const globalVariance = averageOf(means.map((value) =>
            (value - globalMean) ** 2));
        return {
            opticalDepthEligibleColumns: eligibleColumns,
            opticalDepthStructuredColumnFraction:
                structuredColumns / Math.max(1, eligibleColumns),
            opticalDepthEnclosedClearColumnFraction:
                clearGapColumns / Math.max(1, eligibleColumns),
            opticalDepthColumnMean: globalMean,
            opticalDepthColumnCoefficientOfVariation:
                Math.sqrt(globalVariance) / Math.max(1e-6, globalMean),
        };
    });
    return {
        opticalDepthStructuredColumnFraction: averageOf(axisStats.map((stats) =>
            stats.opticalDepthStructuredColumnFraction)),
        opticalDepthEnclosedClearColumnFraction: averageOf(axisStats.map((stats) =>
            stats.opticalDepthEnclosedClearColumnFraction)),
        opticalDepthColumnCoefficientOfVariation: averageOf(axisStats.map((stats) =>
            stats.opticalDepthColumnCoefficientOfVariation)),
        opticalDepthEligibleColumnCount: axisStats.reduce((sum, stats) =>
            sum + stats.opticalDepthEligibleColumns, 0),
    };
};

/**
 * Quantify whether authored support survives the spatial footprints that a
 * trilinear ray marcher and a small projected cloud eventually integrate.
 * The box filter is deliberately conservative: blocks whose mean falls below
 * the production occupancy threshold are treated as lost, exposing fibres or
 * grains that exist only as atlas-resolution dust.
 */
const measureMultiscaleReconstruction = (
    density,
    resolution,
    occupancyThreshold = 16,
) => {
    const sourceMass = density.reduce((sum, value) => sum + value, 0);
    const measure = (factor) => {
        const reducedResolution = Math.floor(resolution / factor);
        const reducedDensity = new Uint8Array(reducedResolution ** 3);
        const reducedOccupied = new Uint8Array(reducedResolution ** 3);
        let retainedMass = 0;
        let retainedSourceVoxelCount = 0;
        let sourceVoxelCount = 0;
        for (let z = 0; z < reducedResolution; z += 1) {
            for (let y = 0; y < reducedResolution; y += 1) {
                for (let x = 0; x < reducedResolution; x += 1) {
                    let blockMass = 0;
                    let blockSourceVoxels = 0;
                    for (let dz = 0; dz < factor; dz += 1) {
                        for (let dy = 0; dy < factor; dy += 1) {
                            for (let dx = 0; dx < factor; dx += 1) {
                                const value = density[
                                    (((z * factor + dz) * resolution +
                                        y * factor + dy) * resolution +
                                        x * factor + dx)
                                ];
                                blockMass += value;
                                if (value > 0) blockSourceVoxels += 1;
                            }
                        }
                    }
                    sourceVoxelCount += blockSourceVoxels;
                    const average = Math.round(blockMass / factor ** 3);
                    const index = (z * reducedResolution + y) *
                        reducedResolution + x;
                    if (average < occupancyThreshold) continue;
                    reducedDensity[index] = average;
                    reducedOccupied[index] = 1;
                    retainedMass += average * factor ** 3;
                    retainedSourceVoxelCount += blockSourceVoxels;
                }
            }
        }
        const connectivity = measureConnectivity(
            reducedOccupied,
            reducedResolution,
        );
        return {
            massRetention: retainedMass / Math.max(1, sourceMass),
            sourceSupportRetention: retainedSourceVoxelCount /
                Math.max(1, sourceVoxelCount),
            occupancyFraction: connectivity.occupancyFraction,
            connectedComponentCount: connectivity.connectedComponentCount,
            largestComponentFraction: connectivity.largestComponentFraction,
        };
    };
    const scale2 = measure(2);
    const scale4 = measure(4);
    return {
        reconstructionScale2MassRetention: scale2.massRetention,
        reconstructionScale4MassRetention: scale4.massRetention,
        reconstructionScale2SourceSupportRetention:
            scale2.sourceSupportRetention,
        reconstructionScale4SourceSupportRetention:
            scale4.sourceSupportRetention,
        reconstructionScale2OccupancyFraction: scale2.occupancyFraction,
        reconstructionScale4OccupancyFraction: scale4.occupancyFraction,
        reconstructionScale2ConnectedComponentCount:
            scale2.connectedComponentCount,
        reconstructionScale4ConnectedComponentCount:
            scale4.connectedComponentCount,
        reconstructionScale2LargestComponentFraction:
            scale2.largestComponentFraction,
        reconstructionScale4LargestComponentFraction:
            scale4.largestComponentFraction,
    };
};

const measureLowerBoundaryRoughness = (occupied, resolution, baseY = null) => {
    const levels = [];
    const maximumRelevantY = Math.floor(resolution * 0.40);
    const baseBandMinimum = baseY === null ? 0 : Math.max(0, Math.floor((baseY - 0.015) * (resolution - 1)));
    const baseBandMaximum = baseY === null
        ? resolution - 1
        : Math.min(resolution - 1, Math.ceil((baseY + 0.095) * (resolution - 1)));
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let minimumY = -1;
            let columnCount = 0;
            let intersectsBaseBand = false;
            for (let y = 0; y < resolution; y += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                if (minimumY < 0) minimumY = y;
                columnCount += 1;
                if (y >= baseBandMinimum && y <= baseBandMaximum) intersectsBaseBand = true;
            }
            if (
                minimumY >= 0 && minimumY <= maximumRelevantY &&
                columnCount >= 3 && intersectsBaseBand
            ) {
                levels.push(minimumY);
            }
        }
    }
    if (levels.length === 0) return {
        lowerBoundaryRoughness: 0,
        lowerBoundaryRange: 0,
        lowerBoundaryDistinctLevels: 0,
    };
    const mean = levels.reduce((sum, value) => sum + value, 0) / levels.length;
    const variance = levels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / levels.length;
    return {
        lowerBoundaryRoughness: Math.sqrt(variance) / resolution,
        lowerBoundaryRange: (Math.max(...levels) - Math.min(...levels)) / resolution,
        lowerBoundaryDistinctLevels: new Set(levels).size,
    };
};

const measureCentralLclBase = (occupied, resolution, baseY = null) => {
    if (baseY === null) return {
        centralLclBaseRangeVoxels: 0,
        centralLclBaseStdDevVoxels: 0,
        centralLclBaseSampleCount: 0,
    };
    let minX = resolution;
    let maxX = -1;
    let minZ = resolution;
    let maxZ = -1;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            for (let y = 0; y < resolution; y += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
            }
        }
    }
    if (maxX < 0) return {
        centralLclBaseRangeVoxels: 0,
        centralLclBaseStdDevVoxels: 0,
        centralLclBaseSampleCount: 0,
    };
    const insetX = Math.floor((maxX - minX + 1) * 0.18);
    const insetZ = Math.floor((maxZ - minZ + 1) * 0.18);
    const expectedBase = baseY * (resolution - 1);
    const levels = [];
    for (let z = minZ + insetZ; z <= maxZ - insetZ; z += 1) {
        for (let x = minX + insetX; x <= maxX - insetX; x += 1) {
            let lowest = -1;
            for (let y = 0; y < resolution; y += 1) {
                if (occupied[(z * resolution + y) * resolution + x]) {
                    lowest = y;
                    break;
                }
            }
            // Exclude narrow detached flank columns; central LCL samples must
            // begin close to the authored lifting level.
            if (lowest >= 0 && Math.abs(lowest - expectedBase) <= 3.5) levels.push(lowest);
        }
    }
    const average = levels.reduce((sum, value) => sum + value, 0) /
        Math.max(1, levels.length);
    const deviation = Math.sqrt(levels.reduce((sum, value) =>
        sum + (value - average) ** 2, 0) / Math.max(1, levels.length));
    return {
        centralLclBaseRangeVoxels: levels.length > 0
            ? Math.max(...levels) - Math.min(...levels) : 0,
        centralLclBaseStdDevVoxels: deviation,
        centralLclBaseSampleCount: levels.length,
    };
};

const measureProjectedAutocorrelation = (density, resolution) => {
    const projected = new Float64Array(resolution * resolution);
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let maximum = 0;
            for (let y = 0; y < resolution; y += 1) {
                maximum = Math.max(maximum, density[(z * resolution + y) * resolution + x] / 255);
            }
            projected[z * resolution + x] = maximum;
        }
    }
    // Remove the finite system envelope before testing repeated spacing.
    // Otherwise every compact cloud has a strong low-frequency correlation.
    const residual = new Float64Array(projected.length);
    const blurRadius = Math.max(2, Math.round(resolution / 12));
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            let sum = 0;
            let count = 0;
            for (let dz = -blurRadius; dz <= blurRadius; dz += 1) {
                const nz = z + dz;
                if (nz < 0 || nz >= resolution) continue;
                for (let dx = -blurRadius; dx <= blurRadius; dx += 1) {
                    const nx = x + dx;
                    if (nx < 0 || nx >= resolution) continue;
                    sum += projected[nz * resolution + nx];
                    count += 1;
                }
            }
            residual[z * resolution + x] = projected[z * resolution + x] - sum / count;
        }
    }
    const correlation = (offsetX, offsetZ) => {
        let product = 0;
        let sourceEnergy = 0;
        let shiftedEnergy = 0;
        for (let z = 0; z < resolution; z += 1) {
            const shiftedZ = z + offsetZ;
            if (shiftedZ < 0 || shiftedZ >= resolution) continue;
            for (let x = 0; x < resolution; x += 1) {
                const shiftedX = x + offsetX;
                if (shiftedX < 0 || shiftedX >= resolution) continue;
                const source = residual[z * resolution + x];
                const shifted = residual[shiftedZ * resolution + shiftedX];
                product += source * shifted;
                sourceEnergy += source * source;
                shiftedEnergy += shifted * shifted;
            }
        }
        return product / Math.sqrt(Math.max(1e-12, sourceEnergy * shiftedEnergy));
    };
    let axisPeak = 0;
    let crosswindPeak = 0;
    let downwindPeak = 0;
    let diagonalPeak = 0;
    let axisPeakLag = 0;
    for (let lag = Math.max(4, Math.round(resolution / 12)); lag <= Math.floor(resolution / 3); lag += 1) {
        const crosswind = correlation(lag, 0);
        const downwind = correlation(0, lag);
        const axis = Math.max(crosswind, downwind);
        const diagonal = Math.max(correlation(lag, lag), correlation(lag, -lag));
        crosswindPeak = Math.max(crosswindPeak, crosswind);
        downwindPeak = Math.max(downwindPeak, downwind);
        if (axis > axisPeak) {
            axisPeak = axis;
            axisPeakLag = lag;
        }
        diagonalPeak = Math.max(diagonalPeak, diagonal);
    }
    // A roll or wave should have strong *continuous* one-axis coherence. A
    // Cartesian puff grid instead has distinct correlation revivals at a
    // spacing and its harmonics, often on two independent axes. Measure local
    // peak prominence over eight orientations so rotation cannot evade the
    // gate, then report one-axis and orthogonal repetition separately.
    const directionCount = 8;
    const maximumLag = Math.floor(resolution / 3);
    const directionalPeriodicity = [];
    for (let direction = 0; direction < directionCount; direction += 1) {
        const angle = direction / directionCount * Math.PI;
        const samples = [];
        let previousOffset = null;
        for (let lag = 2; lag <= maximumLag; lag += 1) {
            const offsetX = Math.round(Math.cos(angle) * lag);
            const offsetZ = Math.round(Math.sin(angle) * lag);
            if (offsetX === 0 && offsetZ === 0) continue;
            if (previousOffset && previousOffset[0] === offsetX &&
                previousOffset[1] === offsetZ) continue;
            samples.push(correlation(offsetX, offsetZ));
            previousOffset = [offsetX, offsetZ];
        }
        const peakProminences = [];
        for (let index = 1; index + 1 < samples.length; index += 1) {
            const localShoulder = (samples[index - 1] + samples[index + 1]) * 0.5;
            const widerShoulder = (
                samples[Math.max(0, index - 2)] +
                samples[Math.min(samples.length - 1, index + 2)]
            ) * 0.5;
            const prominence = samples[index] -
                Math.max(localShoulder, widerShoulder);
            if (prominence > 0.018) peakProminences.push(prominence);
        }
        peakProminences.sort((left, right) => right - left);
        // One isolated revival is normally the opposite edge of a finite
        // coherent body. Repeated spacing needs at least two distinct local
        // maxima; the weaker of the two is the conservative harmonic score.
        directionalPeriodicity.push(
            peakProminences.length >= 2
                ? peakProminences[1]
                : (peakProminences[0] ?? 0) * 0.18,
        );
    }
    let twoAxisPeriodicScore = 0;
    for (let direction = 0; direction < directionCount; direction += 1) {
        const orthogonal = (direction + directionCount / 2) % directionCount;
        twoAxisPeriodicScore = Math.max(
            twoAxisPeriodicScore,
            Math.min(
                directionalPeriodicity[direction],
                directionalPeriodicity[orthogonal],
            ),
        );
    }
    const oneAxisPeriodicScore = Math.max(0, ...directionalPeriodicity);
    return {
        projectedAxisAutocorrelationPeak: axisPeak,
        projectedDiagonalAutocorrelationPeak: diagonalPeak,
        projectedGridAutocorrelationScore: Math.max(0, axisPeak - diagonalPeak),
        projectedOrthogonalGridScore: Math.max(
            0,
            Math.min(crosswindPeak, downwindPeak) - diagonalPeak * 0.35,
        ),
        projectedCrosswindAutocorrelationPeak: crosswindPeak,
        projectedDownwindAutocorrelationPeak: downwindPeak,
        projectedAxisAutocorrelationPeakLag: axisPeakLag,
        projectedOneAxisPeriodicScore: oneAxisPeriodicScore,
        projectedTwoAxisPeriodicScore: twoAxisPeriodicScore,
        projectedDirectionalPeriodicity: directionalPeriodicity,
    };
};

const qualifyAperiodicReconstructibleFamily = (
    config,
    statistics,
    resolution,
) => {
    // Qualification thresholds describe the production 48^3 reconstruction
    // contract. Smaller deterministic test atlases intentionally have a
    // different sampling theorem and are checked only for repeatability.
    if (resolution < 48) return;
    const fail = (message) => {
        throw new Error(`${config.id} failed macro qualification: ${message}`);
    };
    const castellanus = new Set([
        "cc-castellanus", "ac-castellanus", "sc-castellanus",
    ]);
    if (castellanus.has(config.id)) {
        if (statistics.projectedTwoAxisPeriodicScore >= 0.06) {
            fail(`two-axis periodic score ${statistics.projectedTwoAxisPeriodicScore}`);
        }
        if (statistics.projectedOneAxisPeriodicScore >= 0.16) {
            fail(`renewal line periodic score ${statistics.projectedOneAxisPeriodicScore}`);
        }
        if (statistics.projectedOrthogonalGridScore >= 0.10) {
            fail(`orthogonal grid score ${statistics.projectedOrthogonalGridScore}`);
        }
        if (statistics.reconstructionScale2ConnectedComponentCount !== 1 ||
            statistics.reconstructionScale4ConnectedComponentCount !== 1) {
            fail("the common base separates under multiscale reconstruction: " +
                `scale2=${statistics.reconstructionScale2ConnectedComponentCount}, ` +
                `scale4=${statistics.reconstructionScale4ConnectedComponentCount}, ` +
                `mass2=${statistics.reconstructionScale2MassRetention}, ` +
                `mass4=${statistics.reconstructionScale4MassRetention}`);
        }
        if (statistics.reconstructionScale4MassRetention < 0.88) {
            fail(`scale-4 mass retention ${statistics.reconstructionScale4MassRetention}`);
        }
    }
    if (config.id === "ac-volutus" || config.id === "sc-volutus") {
        // A solitary roll is intentionally coherent along one direction. It
        // must not exhibit harmonic repeats or a second organized axis.
        if (statistics.projectedOneAxisPeriodicScore >= 0.11 ||
            statistics.projectedTwoAxisPeriodicScore >= 0.055 ||
            statistics.projectedOrthogonalGridScore >= 0.06) {
            fail("finite vortex roll contains repeated Cartesian structure");
        }
        if (statistics.reconstructionScale2ConnectedComponentCount !== 1 ||
            statistics.reconstructionScale4ConnectedComponentCount !== 1 ||
            statistics.reconstructionScale4MassRetention < 0.92) {
            fail("finite vortex roll is not reconstructibly connected");
        }
    }
    const ccPackets = new Set([
        "cc-stratiformis", "cc-stratiformis-dispersive",
    ]);
    if (ccPackets.has(config.id)) {
        if (statistics.cellularTerminalEllipsoidCount !== 0 ||
            statistics.cellularTerminalCapsuleCount !== 0 ||
            statistics.cellularSourceConnectedSweepCount <
                statistics.formationGroupCount ||
            statistics.cellularMinimumVerticalScale < 0.65 ||
            statistics.cellularMaximumVerticalScale < 0.95) {
            fail(
                "gravity-wave grains regressed to flat terminal stamps: " +
                `sweeps=${statistics.cellularSourceConnectedSweepCount}, ` +
                `groups=${statistics.formationGroupCount}, ` +
                `vertical=${statistics.cellularMinimumVerticalScale}..` +
                `${statistics.cellularMaximumVerticalScale}`,
            );
        }
        if (statistics.reconstructionScale2MassRetention < 0.82 ||
            statistics.reconstructionScale4MassRetention < 0.30 ||
            statistics.reconstructionScale4SourceSupportRetention < 0.22) {
            fail("thin grain packet collapses under multiscale reconstruction: " +
                `mass2=${statistics.reconstructionScale2MassRetention}, ` +
                `mass4=${statistics.reconstructionScale4MassRetention}, ` +
                `support4=${statistics.reconstructionScale4SourceSupportRetention}`);
        }
        if (statistics.reconstructionScale2ConnectedComponentCount < 8 ||
            statistics.reconstructionScale4ConnectedComponentCount < 3 ||
            statistics.reconstructionScale2LargestComponentFraction > 0.38 ||
            statistics.reconstructionScale4LargestComponentFraction > 0.60) {
            fail("thin grain packet loses resolved inter-grain clear air under reconstruction");
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.07) {
            fail("thin grain packet contains a two-axis repeated lattice");
        }
    }
    const closedStratiformis = new Set([
        "sc-stratiformis",
        "sc-stratiformis-closed-overhead",
    ]);
    if (closedStratiformis.has(config.id)) {
        if (statistics.stratiformisResolvedCellCount < 24 ||
            statistics.stratiformisNaturalNeighborEdgeCount <=
                statistics.stratiformisResolvedCellCount - 1 ||
            statistics.stratiformisNaturalNeighborCycleRank <
                Math.ceil(statistics.stratiformisResolvedCellCount * 0.14) ||
            statistics.stratiformisMaterialEdgeCount <=
                statistics.stratiformisResolvedCellCount - 1 ||
            statistics.stratiformisMaterialCycleRank <
                Math.ceil(statistics.stratiformisResolvedCellCount * 0.14)) {
            fail("closed-cell source regressed to a sparse tree skeleton");
        }
        if (statistics.stratiformisCirculationCellSurfaceCount !==
                statistics.stratiformisResolvedCellCount ||
            statistics.stratiformisCirculationRibbonSurfaceCount !==
                statistics.stratiformisMaterialEdgeCount ||
            statistics.stratiformisLegacyEllipsoidCount !== 0 ||
            statistics.stratiformisLegacyCapsuleCount !== 0) {
            fail("closed-cell source regressed from C2 circulation surfaces to oval/capsule anatomy");
        }
        if (statistics.stratiformisColdPoolCavityCount <
                Math.ceil(statistics.stratiformisClearChannelCount * 0.24) ||
            statistics.stratiformisMinimumInteriorClearance < 0.0039 ||
            statistics.stratiformisMaximumUndersideAmplitude > 0.0020) {
            fail("closed-cell channels or inversion-flat underside violate the circulation-surface contract");
        }
        if (statistics.reconstructionScale2MassRetention < 0.86 ||
            statistics.reconstructionScale4MassRetention < 0.68) {
            fail("closed-cell condensate mass collapses under reconstruction");
        }
        if (statistics.reconstructionScale2ConnectedComponentCount !== 1 ||
            statistics.reconstructionScale4ConnectedComponentCount !== 1) {
            fail("closed-cell circulation network separates under reconstruction: " +
                `scale2=${statistics.reconstructionScale2ConnectedComponentCount}, ` +
                `scale4=${statistics.reconstructionScale4ConnectedComponentCount}`);
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.06 ||
            statistics.projectedOrthogonalGridScore >= 0.10) {
            fail("closed-cell circulation exposes a repeated planar grid");
        }
    }
    if (config.id === "sc-stratiformis-open-field") {
        if (statistics.stratiformisOpenWallArcCount < 20 ||
            statistics.stratiformisCirculationCellSurfaceCount !== 0 ||
            statistics.stratiformisLegacyEllipsoidCount !== 0 ||
            statistics.stratiformisLegacyCapsuleCount !== 0) {
            fail("open-cell field is not a material population of broken C2 cloudy walls");
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.065 ||
            statistics.projectedOrthogonalGridScore >= 0.10) {
            fail("open-cell wall field exposes a repeated planar grid");
        }
    }
    if (config.id === "sc-stratiformis-street-packet") {
        if (statistics.stratiformisStreetCorridorCount < 8 ||
            statistics.stratiformisOpenWallArcCount !== 0 ||
            statistics.stratiformisLegacyEllipsoidCount !== 0 ||
            statistics.stratiformisLegacyCapsuleCount !== 0) {
            fail("cloud-street packet is not made from finite C2 roll corridors");
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.07 ||
            statistics.projectedOrthogonalGridScore >= 0.09) {
            fail("cloud-street packet regressed to a two-axis repeated grid");
        }
    }
    if (config.id === "sc-stratiformis-transition-mosaic") {
        if (statistics.stratiformisClosedCellPatchCount < 6 ||
            statistics.stratiformisOpenWallArcCount < 6 ||
            statistics.stratiformisLegacyEllipsoidCount !== 0 ||
            statistics.stratiformisLegacyCapsuleCount !== 0) {
            fail("transition mosaic does not contain both material closed cells and open walls");
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.065 ||
            statistics.projectedOrthogonalGridScore >= 0.10) {
            fail("transition mosaic exposes a repeated planar grid");
        }
    }
    if (config.id === "cc-floccus") {
        if (statistics.cellularTerminalEllipsoidCount !== 0 ||
            statistics.cellularTerminalCapsuleCount !== 0 ||
            statistics.cellularSourceConnectedSweepCount <
                statistics.formationGroupCount * 3 ||
            statistics.cellularMaximumVerticalScale < 1) {
            fail("floccus is not a population of depth-bearing source-connected tufts and tails");
        }
        if (statistics.reconstructionScale2MassRetention < 0.84 ||
            statistics.reconstructionScale4MassRetention < 0.60 ||
            statistics.reconstructionScale4SourceSupportRetention < 0.50) {
            fail("floccus tufts collapse into sub-voxel dust: " +
                `mass2=${statistics.reconstructionScale2MassRetention}, ` +
                `mass4=${statistics.reconstructionScale4MassRetention}, ` +
                `support4=${statistics.reconstructionScale4SourceSupportRetention}`);
        }
    }
    if (config.id === "cc-castellanus") {
        if (statistics.commonBaseCount !== 1 ||
            statistics.cellularTerminalEllipsoidCount !== 0 ||
            statistics.cellularTerminalCapsuleCount !== 0 ||
            statistics.cellularSourceConnectedSweepCount <
                statistics.formationGroupCount * 2 ||
            statistics.cellularMaximumVerticalScale < 0.94) {
            fail("castellanus lost its curved common source or depth-bearing turret lineages");
        }
    }
    if (config.id === "cc-lenticularis") {
        if (statistics.waveCrestCount !== 2 ||
            statistics.waveStackLayerCount !== 3 ||
            statistics.waveAsymmetricLaminarAlmondCount !== 3) {
            fail(
                "lenticularis must contain two unequal crests and three " +
                "finite asymmetric laminar almond surfaces",
            );
        }
        if (statistics.reconstructionScale2MassRetention < 0.90 ||
            statistics.reconstructionScale4MassRetention < 0.70 ||
            statistics.reconstructionScale4SourceSupportRetention < 0.68) {
            fail("laminar lenses lose their curved body under reconstruction");
        }
    }
    if (config.id === "cs-veil" || config.id === "cs-fibratus") {
        if (statistics.cirrostratusSurfaceModeCount !== 4 ||
            statistics.cirrostratusThicknessModeCount !== 3) {
            fail("cirrostratus regressed to a planar constant-thickness slab");
        }
        if (config.id === "cs-veil" &&
            statistics.cirrostratusEmbeddedFibreBundleCount !== 0) {
            fail("the nebulous veil contains authored fibre ribbons");
        }
        if (config.id === "cs-fibratus" &&
            (statistics.cirrostratusEmbeddedFibreBundleCount !== 8 ||
                statistics.cirrostratusFibreAltitudeSpread < 0.10)) {
            fail("fibratus lacks finite fibre bundles distributed through sheet depth");
        }
    }
    if (config.builder === "ice-streamer" && config.variant === "fibratus") {
        if (statistics.cirrusFibratusPrimaryFibreCount < 7 ||
            statistics.cirrusFibratusSecondaryFibreCount < 4 ||
            statistics.cirrusFibratusSweptC2Count !==
                statistics.cirrusFibratusPrimaryFibreCount +
                statistics.cirrusFibratusSecondaryFibreCount ||
            statistics.cirrusFibratusLegacyCapsuleCount !== 0) {
            fail("fibratus is not an entirely swept-C2 multiscale fibre population");
        }
        if (statistics.cirrusFibratusMeanTerminalRadiusRatio >= 0.58 ||
            statistics.cirrusFibratusMeanTerminalRadiusRatio <= 0.24) {
            fail("fibratus terminal radius taper is outside the observed fine-wisp regime");
        }
        if (statistics.cirrusFibratusHeadingSpread < 0.30 ||
            statistics.cirrusFibratusLengthCoefficientVariation < 0.18 ||
            statistics.cirrusFibratusMeanExcessCurvature < 0.0035 ||
            statistics.cirrusFibratusSourceAltitudeSpread < 0.18 ||
            statistics.cirrusFibratusSourceDepthSpread < 0.075) {
            fail("fibratus trajectories lack differential shear, hierarchy, or spatial depth");
        }
        if (statistics.cirrusFibratusSourceClusterCount < 1 ||
            statistics.cirrusFibratusSplitSourceCount < 1 ||
            typeof statistics.cirrusFibratusAnatomyId !== "string") {
            fail("fibratus anatomy has no materialized source-history identity");
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.055 ||
            statistics.projectedOrthogonalGridScore >= 0.10) {
            fail("fibratus trajectories form a repeated brush or orthogonal grid: " +
                `periodic2=${statistics.projectedTwoAxisPeriodicScore}, ` +
                `orthogonal=${statistics.projectedOrthogonalGridScore}`);
        }
        if (statistics.reconstructionScale2ConnectedComponentCount < 7 ||
            statistics.reconstructionScale4ConnectedComponentCount < 3 ||
            statistics.reconstructionScale2LargestComponentFraction > 0.40 ||
            statistics.reconstructionScale4LargestComponentFraction > 0.58) {
            fail("fibratus clear-air separation collapses under multiscale reconstruction: " +
                `components2=${statistics.reconstructionScale2ConnectedComponentCount}, ` +
                `components4=${statistics.reconstructionScale4ConnectedComponentCount}, ` +
                `largest2=${statistics.reconstructionScale2LargestComponentFraction}, ` +
                `largest4=${statistics.reconstructionScale4LargestComponentFraction}`);
        }
        const planMinimum = Math.min(
            statistics.occupiedBounds.minimum[0],
            statistics.occupiedBounds.minimum[2],
        );
        const planMaximum = Math.max(
            statistics.occupiedBounds.maximum[0],
            statistics.occupiedBounds.maximum[2],
        );
        if (planMinimum <= 0 || planMaximum >= 1) {
            fail("fibratus condensate is clipped by its canonical owner domain: " +
                `minimum=${planMinimum}, maximum=${planMaximum}`);
        }
    }
    if (config.id === "ci-uncinus") {
        // Uncinus now owns a continuous 2x-sampled C2 hook/fallstreak rather
        // than an overlapping chain of broad capsules. A 4x footprint is
        // allowed to lose the sublimating terminus: forcing the former 76%
        // mass / 60% support thresholds required a card-width proxy and was
        // the direct opposite of the species' fine, fading anatomy. The native
        // 48^3 topology and 2x footprint remain the authoritative continuity
        // gates; the 4x checks only prevent wholesale disappearance.
        if (statistics.reconstructionScale2MassRetention < 0.86 ||
            statistics.reconstructionScale4MassRetention < 0.42 ||
            statistics.reconstructionScale4SourceSupportRetention < 0.27 ||
            statistics.reconstructionScale2LargestComponentFraction < 0.45 ||
            statistics.reconstructionScale4LargestComponentFraction < 0.25) {
            fail("mare's-tail support does not survive coarse reconstruction: " +
                `mass2=${statistics.reconstructionScale2MassRetention}, ` +
                `mass4=${statistics.reconstructionScale4MassRetention}, ` +
                `support4=${statistics.reconstructionScale4SourceSupportRetention}, ` +
                `largest2=${statistics.reconstructionScale2LargestComponentFraction}, ` +
                `largest4=${statistics.reconstructionScale4LargestComponentFraction}`);
        }
        if (statistics.projectedTwoAxisPeriodicScore >= 0.055) {
            fail("mare's-tail members form a repeated comb");
        }
        const planMinimum = Math.min(
            statistics.occupiedBounds.minimum[0],
            statistics.occupiedBounds.minimum[2],
        );
        const planMaximum = Math.max(
            statistics.occupiedBounds.maximum[0],
            statistics.occupiedBounds.maximum[2],
        );
        if (planMinimum <= 0 || planMaximum >= 1) {
            fail("mare's-tail condensate is clipped by its canonical owner domain");
        }
    }
};

const measureVerticalSilhouette = (occupied, resolution) => {
    const projected = new Uint8Array(resolution * resolution);
    let minX = resolution;
    let minY = resolution;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            for (let z = 0; z < resolution; z += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                projected[y * resolution + x] = 1;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                break;
            }
        }
    }
    let area = 0;
    let perimeter = 0;
    for (let y = 0; y < resolution; y += 1) {
        for (let x = 0; x < resolution; x += 1) {
            if (!projected[y * resolution + x]) continue;
            area += 1;
            if (x === 0 || !projected[y * resolution + x - 1]) perimeter += 1;
            if (x + 1 === resolution || !projected[y * resolution + x + 1]) perimeter += 1;
            if (y === 0 || !projected[(y - 1) * resolution + x]) perimeter += 1;
            if (y + 1 === resolution || !projected[(y + 1) * resolution + x]) perimeter += 1;
        }
    }
    const mirrorSimilarity = (axis) => {
        if (area === 0) return 0;
        let intersection = 0;
        let union = 0;
        for (let y = minY; y <= maxY; y += 1) {
            for (let x = minX; x <= maxX; x += 1) {
                const mirrorX = axis === 0 ? minX + maxX - x : x;
                const mirrorY = axis === 1 ? minY + maxY - y : y;
                const source = projected[y * resolution + x];
                const mirrored = projected[mirrorY * resolution + mirrorX];
                if (source || mirrored) union += 1;
                if (source && mirrored) intersection += 1;
            }
        }
        return intersection / Math.max(1, union);
    };
    const topology = measureBinaryProjectionTopology(
        projected,
        resolution,
        resolution,
    );
    return {
        verticalSilhouetteCompactness: perimeter > 0
            ? 4 * Math.PI * area / (perimeter * perimeter)
            : 0,
        verticalSilhouetteMirrorSimilarity:
            (mirrorSimilarity(0) + mirrorSimilarity(1)) * 0.5,
        verticalSilhouetteComponentCount: topology.componentCount,
        verticalSilhouetteLargestComponentFraction:
            topology.largestComponentFraction,
        verticalSilhouetteHoleCount: topology.holeCount,
        verticalSilhouetteHoleAreaFraction: topology.holeAreaFraction,
    };
};

/**
 * Projection-space acceptance measurements for liquid convective anatomy.
 * These deliberately inspect the reconstructed voxel support—not the source
 * primitive list—so a numerically varied ellipsoid stack cannot pass while it
 * still resolves as one rectangular pillar or one smooth terminal cap.
 */
const measureCumulusProjectionAnatomy = (
    occupied,
    density,
    resolution,
    baseY = null,
    minimumProjectionDensityByte = 1,
) => {
    const measureElevationProjection = (horizontalAxis) => {
        const projected = new Uint8Array(resolution * resolution);
        for (let y = 0; y < resolution; y += 1) {
            for (let horizontal = 0; horizontal < resolution; horizontal += 1) {
                for (let depth = 0; depth < resolution; depth += 1) {
                    const x = horizontalAxis === 0 ? horizontal : depth;
                    const z = horizontalAxis === 0 ? depth : horizontal;
                    const index = (z * resolution + y) * resolution + x;
                    if (!occupied[index] ||
                        density[index] < minimumProjectionDensityByte) continue;
                    projected[y * resolution + horizontal] = 1;
                    break;
                }
            }
        }
        const rows = [];
        let minimumHorizontal = resolution;
        let maximumHorizontal = -1;
        let area = 0;
        for (let y = 0; y < resolution; y += 1) {
            let left = resolution;
            let right = -1;
            for (let horizontal = 0; horizontal < resolution; horizontal += 1) {
                if (!projected[y * resolution + horizontal]) continue;
                left = Math.min(left, horizontal);
                right = Math.max(right, horizontal);
                area += 1;
            }
            if (right < 0) continue;
            rows.push({ y, left, right, width: right - left + 1 });
            minimumHorizontal = Math.min(minimumHorizontal, left);
            maximumHorizontal = Math.max(maximumHorizontal, right);
        }
        if (rows.length === 0) return {
            boundingBoxFill: 0,
            bodyWidthVariation: 0,
            straightSideFraction: 0,
            crownPeakCount: 0,
            crownShoulderPeakCount: 0,
            crownFinePeakCount: 0,
            crownMediumPeakCount: 0,
            crownCoarsePeakCount: 0,
            crownMaximumCleftDepthVoxels: 0,
            crownMeanCleftDepthVoxels: 0,
            crownConvexScaleBandCount: 0,
            trunkNeckCount: 0,
            deepestNeckFraction: 0,
            trunkMinimumToMaximumWidthRatio: 1,
        };
        const minimumY = rows[0].y;
        const maximumY = rows.at(-1).y;
        const height = maximumY - minimumY + 1;
        const body = rows.filter(({ y }) => {
            const t = (y - minimumY) / Math.max(1, maximumY - minimumY);
            return t >= 0.10 && t <= 0.76;
        });
        const meanWidth = body.reduce((sum, row) => sum + row.width, 0) /
            Math.max(1, body.length);
        const bodyWidthVariation = Math.sqrt(body.reduce((sum, row) =>
            sum + (row.width - meanWidth) ** 2, 0) /
            Math.max(1, body.length)) / Math.max(1, meanWidth);
        const longestConstantRun = (side) => {
            let longest = 1;
            let run = 1;
            for (let index = 1; index < body.length; index += 1) {
                const contiguous = body[index].y === body[index - 1].y + 1;
                const sameEdge = Math.abs(body[index][side] -
                    body[index - 1][side]) <= 0;
                run = contiguous && sameEdge ? run + 1 : 1;
                longest = Math.max(longest, run);
            }
            return longest / Math.max(1, body.length);
        };

        const top = new Float64Array(resolution).fill(-1);
        for (let horizontal = minimumHorizontal;
            horizontal <= maximumHorizontal; horizontal += 1) {
            for (let y = maximumY; y >= minimumY; y -= 1) {
                if (!projected[y * resolution + horizontal]) continue;
                top[horizontal] = y;
                break;
            }
        }
        const smoothed = [...top];
        for (let horizontal = minimumHorizontal;
            horizontal <= maximumHorizontal; horizontal += 1) {
            let sum = 0;
            let weight = 0;
            for (let offset = -1; offset <= 1; offset += 1) {
                const value = top[horizontal + offset];
                if (value === undefined || value < 0) continue;
                const sampleWeight = offset === 0 ? 2 : 1;
                sum += value * sampleWeight;
                weight += sampleWeight;
            }
            smoothed[horizontal] = weight > 0 ? sum / weight : -1;
        }
        let crownShoulderPeakCount = 0;
        let horizontal = minimumHorizontal + 1;
        while (horizontal <= maximumHorizontal - 1) {
            const plateauStart = horizontal;
            let plateauEnd = horizontal;
            while (
                plateauEnd + 1 <= maximumHorizontal - 1 &&
                top[plateauEnd + 1] === top[plateauStart]
            ) plateauEnd += 1;
            const left = top[plateauStart - 1];
            const right = top[plateauEnd + 1];
            if (left >= 0 && right >= 0 &&
                top[plateauStart] >= left + 1 &&
                top[plateauStart] >= right + 1) {
                crownShoulderPeakCount += 1;
            }
            horizontal = plateauEnd + 1;
        }
        const candidates = [];
        for (horizontal = minimumHorizontal + 2;
            horizontal <= maximumHorizontal - 2; horizontal += 1) {
            const value = smoothed[horizontal];
            if (value < smoothed[horizontal - 1] ||
                value < smoothed[horizontal + 1] ||
                value === smoothed[horizontal - 1] &&
                    value === smoothed[horizontal + 1]) continue;
            const leftShoulder = Math.min(
                smoothed[horizontal - 1], smoothed[horizontal - 2],
            );
            const rightShoulder = Math.min(
                smoothed[horizontal + 1], smoothed[horizontal + 2],
            );
            const prominence = value - Math.max(leftShoulder, rightShoulder);
            // A one-voxel shoulder is already a resolvable 2% of this coarse
            // atlas. The weighted three-column reconstruction reduces that
            // prominence to 0.25 voxel; accepting it preserves real secondary
            // turrets while the local-maximum test still rejects a monotonic
            // single ellipsoid cap.
            if (prominence >= 0.24) candidates.push({ horizontal, value });
        }
        candidates.sort((left, right) => right.value - left.value);
        const accepted = [];
        for (const candidate of candidates) {
            if (accepted.some((peak) =>
                Math.abs(peak.horizontal - candidate.horizontal) < 3)) continue;
            accepted.push(candidate);
        }

        // Peak counts at three reconstruction scales reject both one smooth
        // terminal dome and a noisy sawtooth. Fine peaks retain terminal
        // buds; medium peaks retain major cauliflower heads; coarse peaks
        // prove that the crown remains branched after projected filtering.
        const crownFloor = minimumY + height * 0.60;
        const envelopeAtScale = (radius) => {
            if (radius === 0) return [...top];
            const result = new Float64Array(resolution).fill(-1);
            for (let x = minimumHorizontal; x <= maximumHorizontal; x += 1) {
                let sum = 0;
                let weight = 0;
                for (let offset = -radius; offset <= radius; offset += 1) {
                    const value = top[x + offset];
                    if (value === undefined || value < 0) continue;
                    const sampleWeight = radius + 1 - Math.abs(offset);
                    sum += value * sampleWeight;
                    weight += sampleWeight;
                }
                result[x] = weight > 0 ? sum / weight : -1;
            }
            return result;
        };
        const peaksAtScale = (radius, minimumProminence, minimumSeparation) => {
            const envelope = envelopeAtScale(radius);
            const peakCandidates = [];
            const neighborhood = Math.max(1, radius + 1);
            const prominenceRadius = Math.max(4, radius * 2 + 4);
            for (let x = minimumHorizontal + neighborhood;
                x <= maximumHorizontal - neighborhood; x += 1) {
                const value = envelope[x];
                if (value < crownFloor) continue;
                let localMaximum = true;
                for (let offset = -neighborhood;
                    offset <= neighborhood; offset += 1) {
                    if (offset === 0) continue;
                    if (envelope[x + offset] > value + 1e-6) {
                        localMaximum = false;
                        break;
                    }
                }
                if (!localMaximum) continue;
                // Count a flat summit once at its centre.
                if (x > minimumHorizontal &&
                    Math.abs(envelope[x - 1] - value) < 1e-6) continue;
                let leftMinimum = value;
                let rightMinimum = value;
                for (let offset = 1; offset <= prominenceRadius; offset += 1) {
                    const left = envelope[x - offset];
                    const right = envelope[x + offset];
                    if (left !== undefined && left >= 0) {
                        leftMinimum = Math.min(leftMinimum, left);
                    }
                    if (right !== undefined && right >= 0) {
                        rightMinimum = Math.min(rightMinimum, right);
                    }
                }
                const prominence = value - Math.max(leftMinimum, rightMinimum);
                if (prominence < minimumProminence) continue;
                let width = 1;
                const shoulderLevel = value - Math.max(1, prominence * 0.52);
                for (let offset = 1; x - offset >= minimumHorizontal; offset += 1) {
                    if (envelope[x - offset] < shoulderLevel) break;
                    width += 1;
                }
                for (let offset = 1; x + offset <= maximumHorizontal; offset += 1) {
                    if (envelope[x + offset] < shoulderLevel) break;
                    width += 1;
                }
                peakCandidates.push({ x, value, prominence, width });
            }
            peakCandidates.sort((left, right) =>
                right.prominence - left.prominence || right.value - left.value);
            const result = [];
            for (const candidate of peakCandidates) {
                if (result.some((peak) =>
                    Math.abs(peak.x - candidate.x) < minimumSeparation)) continue;
                result.push(candidate);
            }
            return result.sort((left, right) => left.x - right.x);
        };
        const finePeaks = peaksAtScale(0, 1, 3);
        // At 48 samples a two-voxel raw valley becomes roughly 0.6 voxel
        // after the triangular radius-one filter and about 0.4 at radius two.
        // The separation and crown-floor constraints, rather than an
        // over-large post-filter prominence, reject high-frequency noise.
        const mediumPeaks = peaksAtScale(1, 0.62, 4);
        const coarsePeaks = peaksAtScale(2, 0.38, 5);
        const cleftDepths = [];
        for (let index = 0; index + 1 < finePeaks.length; index += 1) {
            const left = finePeaks[index];
            const right = finePeaks[index + 1];
            let valley = Math.min(left.value, right.value);
            for (let x = left.x + 1; x < right.x; x += 1) {
                if (top[x] >= 0) valley = Math.min(valley, top[x]);
            }
            const depth = Math.min(left.value, right.value) - valley;
            if (depth > 0) cleftDepths.push(depth);
        }
        const scaleBandCount = Number(finePeaks.length >= 2) +
            Number(mediumPeaks.length >= 2) +
            Number(coarsePeaks.length >= 1);

        // Width minima between adjacent buoyant events are the observable
        // neck hierarchy. A rectangular pillar has neither enough depth nor
        // repeated minima even if its noisy edge changes one voxel at a time.
        const widthProfile = body.map((row, index) => {
            const previous = body[Math.max(0, index - 1)].width;
            const next = body[Math.min(body.length - 1, index + 1)].width;
            return (previous + row.width * 2 + next) * 0.25;
        });
        let trunkNeckCount = 0;
        let deepestNeckFraction = 0;
        const maximumBodyWidth = Math.max(1, ...widthProfile);
        const minimumBodyWidth = Math.min(...widthProfile);
        for (let index = 2; index + 2 < widthProfile.length; index += 1) {
            const value = widthProfile[index];
            if (value > widthProfile[index - 1] ||
                value > widthProfile[index + 1]) continue;
            const leftMaximum = Math.max(...widthProfile.slice(
                Math.max(0, index - 5), index,
            ));
            const rightMaximum = Math.max(...widthProfile.slice(
                index + 1, Math.min(widthProfile.length, index + 6),
            ));
            const depth = Math.min(leftMaximum, rightMaximum) - value;
            if (depth < 1.5) continue;
            trunkNeckCount += 1;
            deepestNeckFraction = Math.max(
                deepestNeckFraction,
                depth / Math.max(1, Math.min(leftMaximum, rightMaximum)),
            );
        }
        return {
            boundingBoxFill: area / Math.max(
                1,
                (maximumHorizontal - minimumHorizontal + 1) * height,
            ),
            bodyWidthVariation,
            straightSideFraction: Math.max(
                longestConstantRun("left"),
                longestConstantRun("right"),
            ),
            crownPeakCount: accepted.length,
            crownShoulderPeakCount,
            crownFinePeakCount: finePeaks.length,
            crownMediumPeakCount: mediumPeaks.length,
            crownCoarsePeakCount: coarsePeaks.length,
            crownMaximumCleftDepthVoxels: Math.max(0, ...cleftDepths),
            crownMeanCleftDepthVoxels: cleftDepths.reduce(
                (sum, value) => sum + value, 0,
            ) / Math.max(1, cleftDepths.length),
            crownConvexScaleBandCount: scaleBandCount,
            trunkNeckCount,
            deepestNeckFraction,
            trunkMinimumToMaximumWidthRatio:
                minimumBodyWidth / maximumBodyWidth,
        };
    };

    const crosswind = measureElevationProjection(0);
    const downwind = measureElevationProjection(2);
    let lowestY = resolution;
    let highestY = -1;
    for (let index = 0; index < occupied.length; index += 1) {
        if (!occupied[index]) continue;
        const y = Math.floor((index % (resolution * resolution)) / resolution);
        lowestY = Math.min(lowestY, y);
        highestY = Math.max(highestY, y);
    }
    const horizontalSliceArea = (y) => {
        let area = 0;
        for (let z = 0; z < resolution; z += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (occupied[(z * resolution + y) * resolution + x]) area += 1;
            }
        }
        return area;
    };
    const lclCenter = baseY === null
        ? lowestY : Math.round(baseY * (resolution - 1));
    const lclAreas = [];
    const lclProjection = new Uint8Array(resolution * resolution);
    for (let y = Math.max(lowestY, lclCenter);
        y <= Math.min(highestY, lclCenter + 3); y += 1) {
        lclAreas.push(horizontalSliceArea(y));
        for (let z = 0; z < resolution; z += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (occupied[(z * resolution + y) * resolution + x]) {
                    lclProjection[z * resolution + x] = 1;
                }
            }
        }
    }
    const middleAreas = [];
    for (let y = lowestY; y <= highestY; y += 1) {
        const t = (y - lowestY) / Math.max(1, highestY - lowestY);
        if (t >= 0.28 && t <= 0.68) middleAreas.push(horizontalSliceArea(y));
    }
    const meanLclArea = lclAreas.reduce((sum, value) => sum + value, 0) /
        Math.max(1, lclAreas.length);
    let lclArea = 0;
    let lclMinX = resolution;
    let lclMaxX = -1;
    let lclMinZ = resolution;
    let lclMaxZ = -1;
    for (let z = 0; z < resolution; z += 1) {
        for (let x = 0; x < resolution; x += 1) {
            if (!lclProjection[z * resolution + x]) continue;
            lclArea += 1;
            lclMinX = Math.min(lclMinX, x);
            lclMaxX = Math.max(lclMaxX, x);
            lclMinZ = Math.min(lclMinZ, z);
            lclMaxZ = Math.max(lclMaxZ, z);
        }
    }
    // Two-to-one box reconstruction is deliberately harsher than runtime
    // trilinear sampling. It exposes one-voxel dust and tests whether major
    // crown heads survive a projected pixel footprint instead of aliasing
    // into stipple.
    const filteredResolution = Math.floor(resolution / 2);
    const filteredOccupied = new Uint8Array(filteredResolution ** 3);
    let rejectedDensity = 0;
    let totalDensity = 0;
    for (let z = 0; z < filteredResolution; z += 1) {
        for (let y = 0; y < filteredResolution; y += 1) {
            for (let x = 0; x < filteredResolution; x += 1) {
                let blockDensity = 0;
                for (let dz = 0; dz < 2; dz += 1) {
                    for (let dy = 0; dy < 2; dy += 1) {
                        for (let dx = 0; dx < 2; dx += 1) {
                            blockDensity += density[
                                (((z * 2 + dz) * resolution + y * 2 + dy) *
                                    resolution + x * 2 + dx)
                            ];
                        }
                    }
                }
                totalDensity += blockDensity;
                if (blockDensity / 8 >= 46) {
                    filteredOccupied[(z * filteredResolution + y) *
                        filteredResolution + x] = 1;
                } else {
                    rejectedDensity += blockDensity;
                }
            }
        }
    }
    const filteredCrownPeaks = (horizontalAxis) => {
        const top = new Int16Array(filteredResolution).fill(-1);
        let minimumY = filteredResolution;
        let maximumY = -1;
        for (let horizontal = 0; horizontal < filteredResolution; horizontal += 1) {
            for (let y = filteredResolution - 1; y >= 0; y -= 1) {
                let found = false;
                for (let depth = 0; depth < filteredResolution; depth += 1) {
                    const x = horizontalAxis === 0 ? horizontal : depth;
                    const z = horizontalAxis === 0 ? depth : horizontal;
                    if (!filteredOccupied[(z * filteredResolution + y) *
                        filteredResolution + x]) continue;
                    top[horizontal] = y;
                    minimumY = Math.min(minimumY, y);
                    maximumY = Math.max(maximumY, y);
                    found = true;
                    break;
                }
                if (found) break;
            }
        }
        if (maximumY < 0) return 0;
        let maximumHeadRuns = 0;
        for (let y = maximumY; y >= Math.max(0, maximumY - 2); y -= 1) {
            let runs = 0;
            let insideRun = false;
            for (let horizontal = 0; horizontal < filteredResolution;
                horizontal += 1) {
                let projected = false;
                for (let depth = 0; depth < filteredResolution; depth += 1) {
                    const x = horizontalAxis === 0 ? horizontal : depth;
                    const z = horizontalAxis === 0 ? depth : horizontal;
                    if (!filteredOccupied[(z * filteredResolution + y) *
                        filteredResolution + x]) continue;
                    projected = true;
                    break;
                }
                if (projected && !insideRun) runs += 1;
                insideRun = projected;
            }
            maximumHeadRuns = Math.max(maximumHeadRuns, runs);
        }
        const crownFloor = minimumY + (maximumY - minimumY + 1) * 0.58;
        const peaks = [];
        for (let x = 1; x + 1 < filteredResolution; x += 1) {
            if (top[x] < crownFloor || top[x] < top[x - 1] ||
                top[x] < top[x + 1]) continue;
            if (top[x] === top[x - 1]) continue;
            let leftMinimum = top[x];
            let rightMinimum = top[x];
            for (let offset = 1; offset <= 3; offset += 1) {
                if (top[x - offset] >= 0) {
                    leftMinimum = Math.min(leftMinimum, top[x - offset]);
                }
                if (top[x + offset] >= 0) {
                    rightMinimum = Math.min(rightMinimum, top[x + offset]);
                }
            }
            if (top[x] - Math.max(leftMinimum, rightMinimum) < 1) continue;
            if (peaks.some((peak) => Math.abs(peak - x) < 2)) continue;
            peaks.push(x);
        }
        return Math.max(peaks.length, maximumHeadRuns);
    };
    let surfaceVoxelCount = 0;
    let thinSurfaceVoxelCount = 0;
    const slice = resolution * resolution;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const index = (z * resolution + y) * resolution + x;
                if (!occupied[index]) continue;
                let neighbors = 0;
                const visit = (nx, ny, nz) => {
                    if (nx < 0 || nx >= resolution || ny < 0 ||
                        ny >= resolution || nz < 0 || nz >= resolution) return;
                    if (occupied[(nz * resolution + ny) * resolution + nx]) {
                        neighbors += 1;
                    }
                };
                visit(x - 1, y, z);
                visit(x + 1, y, z);
                visit(x, y - 1, z);
                visit(x, y + 1, z);
                visit(x, y, z - 1);
                visit(x, y, z + 1);
                if (neighbors === 6) continue;
                surfaceVoxelCount += 1;
                if (neighbors <= 2) thinSurfaceVoxelCount += 1;
            }
        }
    }
    return {
        cumulusVerticalBoundingBoxFillFraction:
            (crosswind.boundingBoxFill + downwind.boundingBoxFill) * 0.5,
        cumulusVerticalBodyWidthVariation:
            (crosswind.bodyWidthVariation + downwind.bodyWidthVariation) * 0.5,
        cumulusMaximumStraightSideFraction: Math.max(
            crosswind.straightSideFraction,
            downwind.straightSideFraction,
        ),
        cumulusCrownProminentPeakCount: Math.max(
            crosswind.crownPeakCount,
            downwind.crownPeakCount,
        ),
        cumulusCrownShoulderPeakCount: Math.max(
            crosswind.crownShoulderPeakCount,
            downwind.crownShoulderPeakCount,
        ),
        cumulusCrownFinePeakCount: Math.min(
            crosswind.crownFinePeakCount,
            downwind.crownFinePeakCount,
        ),
        cumulusCrownMaximumViewFinePeakCount: Math.max(
            crosswind.crownFinePeakCount,
            downwind.crownFinePeakCount,
        ),
        cumulusCrownMediumPeakCount: Math.min(
            crosswind.crownMediumPeakCount,
            downwind.crownMediumPeakCount,
        ),
        cumulusCrownCoarsePeakCount: Math.min(
            crosswind.crownCoarsePeakCount,
            downwind.crownCoarsePeakCount,
        ),
        cumulusCrownMinimumViewMaximumCleftDepthVoxels: Math.min(
            crosswind.crownMaximumCleftDepthVoxels,
            downwind.crownMaximumCleftDepthVoxels,
        ),
        cumulusCrownMaximumViewMaximumCleftDepthVoxels: Math.max(
            crosswind.crownMaximumCleftDepthVoxels,
            downwind.crownMaximumCleftDepthVoxels,
        ),
        cumulusCrownMinimumViewMeanCleftDepthVoxels: Math.min(
            crosswind.crownMeanCleftDepthVoxels,
            downwind.crownMeanCleftDepthVoxels,
        ),
        cumulusCrownConvexScaleBandCount: Math.min(
            crosswind.crownConvexScaleBandCount,
            downwind.crownConvexScaleBandCount,
        ),
        cumulusTrunkNeckCount: Math.max(
            crosswind.trunkNeckCount,
            downwind.trunkNeckCount,
        ),
        cumulusMaximumViewDeepestNeckFraction: Math.max(
            crosswind.deepestNeckFraction,
            downwind.deepestNeckFraction,
        ),
        cumulusTrunkMinimumToMaximumWidthRatio: Math.max(
            crosswind.trunkMinimumToMaximumWidthRatio,
            downwind.trunkMinimumToMaximumWidthRatio,
        ),
        cumulusFilteredCrownPeakCount: Math.min(
            filteredCrownPeaks(0),
            filteredCrownPeaks(2),
        ),
        cumulusSubvoxelAliasDensityFraction:
            rejectedDensity / Math.max(1, totalDensity),
        cumulusThinSurfaceVoxelFraction:
            thinSurfaceVoxelCount / Math.max(1, surfaceVoxelCount),
        cumulusLclToMiddleAreaRatio: meanLclArea /
            Math.max(1, ...middleAreas),
        cumulusLclFootprintFillFraction: lclArea / Math.max(
            1,
            (lclMaxX - lclMinX + 1) * (lclMaxZ - lclMinZ + 1),
        ),
    };
};

const measureVerticalSpanProfile = (occupied, resolution) => {
    const spans = [];
    for (let y = 0; y < resolution; y += 1) {
        let minX = resolution;
        let maxX = -1;
        let minZ = resolution;
        let maxZ = -1;
        for (let z = 0; z < resolution; z += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
            }
        }
        if (maxX >= 0) spans.push({
            y,
            x: maxX - minX + 1,
            z: maxZ - minZ + 1,
        });
    }
    if (spans.length === 0) return {
        baseHorizontalSpan: 0,
        middleBodyHorizontalSpan: 0,
        crownHorizontalSpan: 0,
        middleBodyToBaseSpanRatio: 0,
        crownToMiddleBodySpanRatio: 0,
        broadBaseThicknessFraction: 0,
    };
    const minimumY = spans[0].y;
    const maximumY = spans.at(-1).y;
    const normalized = spans.map((span) => ({
        ...span,
        t: (span.y - minimumY) / Math.max(1, maximumY - minimumY),
    }));
    const tier = (minimum, maximum) => {
        const samples = normalized.filter((span) => span.t >= minimum && span.t <= maximum);
        return {
            x: Math.max(0, ...samples.map((span) => span.x)),
            z: Math.max(0, ...samples.map((span) => span.z)),
        };
    };
    const base = tier(0, 0.24);
    const middle = tier(0.24, 0.70);
    const crown = tier(0.68, 1);
    const baseBroadSlices = normalized.filter((span) =>
        span.t <= 0.30 &&
        span.x >= base.x * 0.72 &&
        span.z >= base.z * 0.72
    ).length;
    return {
        baseHorizontalSpan: Math.sqrt(base.x * base.z) / resolution,
        middleBodyHorizontalSpan: Math.sqrt(middle.x * middle.z) / resolution,
        crownHorizontalSpan: Math.sqrt(crown.x * crown.z) / resolution,
        middleBodyToBaseSpanRatio: Math.min(
            middle.x / Math.max(1, base.x),
            middle.z / Math.max(1, base.z),
        ),
        crownToMiddleBodySpanRatio: Math.min(
            crown.x / Math.max(1, middle.x),
            crown.z / Math.max(1, middle.z),
        ),
        broadBaseThicknessFraction: baseBroadSlices / Math.max(1, spans.length),
    };
};

// A vertically projected silhouette can hide a bundle of detached columns:
// depth overlap makes them look continuous from one view.  Measure connected
// components independently in each physical horizontal slice through the
// developing body.  The dominant-component score still permits small detached
// scud/buds, while the single-component fraction rejects repeated feeder
// fingers that never merge into the parent thermal mass.
const measureHorizontalSliceTopology = (occupied, resolution) => {
    const slices = [];
    for (let y = 0; y < resolution; y += 1) {
        const plane = new Uint8Array(resolution * resolution);
        let occupiedCount = 0;
        for (let z = 0; z < resolution; z += 1) {
            for (let x = 0; x < resolution; x += 1) {
                if (!occupied[(z * resolution + y) * resolution + x]) continue;
                plane[z * resolution + x] = 1;
                occupiedCount += 1;
            }
        }
        if (occupiedCount === 0) continue;

        const visited = new Uint8Array(plane.length);
        const queue = new Int32Array(plane.length);
        let componentCount = 0;
        let largestComponent = 0;
        const componentSizes = [];
        for (let start = 0; start < plane.length; start += 1) {
            if (!plane[start] || visited[start]) continue;
            componentCount += 1;
            let read = 0;
            let write = 1;
            let componentSize = 0;
            queue[0] = start;
            visited[start] = 1;
            while (read < write) {
                const current = queue[read];
                read += 1;
                componentSize += 1;
                const x = current % resolution;
                const z = Math.floor(current / resolution);
                const visit = (nx, nz) => {
                    if (nx < 0 || nx >= resolution || nz < 0 || nz >= resolution) return;
                    const index = nz * resolution + nx;
                    if (!plane[index] || visited[index]) return;
                    visited[index] = 1;
                    queue[write] = index;
                    write += 1;
                };
                visit(x - 1, z);
                visit(x + 1, z);
                visit(x, z - 1);
                visit(x, z + 1);
            }
            largestComponent = Math.max(largestComponent, componentSize);
            componentSizes.push(componentSize);
        }
        const majorComponentCount = componentSizes.filter((size) =>
            size >= 2 && size / occupiedCount >= 0.08
        ).length;
        slices.push({
            y,
            componentCount,
            majorComponentCount,
            dominantFraction: largestComponent / occupiedCount,
        });
    }

    if (slices.length === 0) return {
        middleSliceSingleComponentFraction: 0,
        middleSliceSingleMajorComponentFraction: 0,
        middleSliceMeanComponentCount: 0,
        middleSliceDominantComponentFraction: 0,
    };
    const minimumY = slices[0].y;
    const maximumY = slices.at(-1).y;
    const middle = slices.filter((slice) => {
        const t = (slice.y - minimumY) / Math.max(1, maximumY - minimumY);
        return t >= 0.22 && t <= 0.72;
    });
    return {
        middleSliceSingleComponentFraction:
            middle.filter((slice) => slice.componentCount === 1).length / Math.max(1, middle.length),
        middleSliceSingleMajorComponentFraction:
            middle.filter((slice) => slice.majorComponentCount <= 1).length / Math.max(1, middle.length),
        middleSliceMeanComponentCount:
            middle.reduce((sum, slice) => sum + slice.componentCount, 0) / Math.max(1, middle.length),
        middleSliceDominantComponentFraction:
            middle.reduce((sum, slice) => sum + slice.dominantFraction, 0) / Math.max(1, middle.length),
    };
};

const measureVerticalMass = (density, resolution) => {
    const sliceMass = new Float64Array(resolution);
    let total = 0;
    let heightWeightedMass = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const value = density[(z * resolution + y) * resolution + x];
                sliceMass[y] += value;
                total += value;
                heightWeightedMass += value * y / Math.max(1, resolution - 1);
            }
        }
    }
    const lowerEnd = Math.floor(resolution / 3);
    const upperStart = Math.ceil(resolution * 2 / 3);
    let lower = 0;
    let upper = 0;
    const nonempty = [];
    for (let y = 0; y < resolution; y += 1) {
        if (y < lowerEnd) lower += sliceMass[y];
        if (y >= upperStart) upper += sliceMass[y];
        if (sliceMass[y] > 0) nonempty.push(sliceMass[y]);
    }
    const mean = nonempty.reduce((sum, value) => sum + value, 0) / Math.max(1, nonempty.length);
    const variance = nonempty.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, nonempty.length);
    return {
        lowerThirdMassFraction: lower / Math.max(1, total),
        upperThirdMassFraction: upper / Math.max(1, total),
        verticalDensityCenterOfMass: heightWeightedMass / Math.max(1, total),
        verticalProfileCoefficientVariation: Math.sqrt(variance) / Math.max(1, mean),
    };
};

const makeMajorants = (density, resolution, brickSize) => {
    const gridSize = Math.ceil(resolution / brickSize);
    const result = new Uint8Array(gridSize ** 3);
    for (let bz = 0; bz < gridSize; bz += 1) {
        for (let by = 0; by < gridSize; by += 1) {
            for (let bx = 0; bx < gridSize; bx += 1) {
                let maximum = 0;
                // A one-voxel halo covers every source sample contributing to
                // trilinear interpolation at the brick boundary.
                for (let z = Math.max(0, bz * brickSize - 1); z <= Math.min(resolution - 1, (bz + 1) * brickSize); z += 1) {
                    for (let y = Math.max(0, by * brickSize - 1); y <= Math.min(resolution - 1, (by + 1) * brickSize); y += 1) {
                        for (let x = Math.max(0, bx * brickSize - 1); x <= Math.min(resolution - 1, (bx + 1) * brickSize); x += 1) {
                            maximum = Math.max(maximum, density[(z * resolution + y) * resolution + x]);
                        }
                    }
                }
                result[(bz * gridSize + by) * gridSize + bx] = maximum;
            }
        }
    }
    return result;
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/**
 * Choose a deterministic 3-D tile grid for fine high-ice source volumes.
 *
 * Each source owns a complete (resolution + 2 * guard)^3 tile.  Candidate
 * grids are ranked by their largest physical axis first (so a source set can
 * be uploaded to a WebGPU 3-D texture without a long, cache-hostile stack),
 * then by allocated tile count and lexicographic axis order.  The latter
 * tie-break makes the source ID -> slot mapping stable across runs and host
 * platforms.  For the default eleven sources this selects 2 x 2 x 3 tiles,
 * 196 x 196 x 294 texels, with twelve total slots and one unused zero tile.
 */
export const calculateCloudHighIceSourceAtlasPacking = ({
    sourceCount = CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS.length,
    sourceResolution = CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION,
    guardVoxels = CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
} = {}) => {
    if (!Number.isInteger(sourceCount) || sourceCount < 1) {
        throw new Error("high-ice sourceCount must be a positive integer");
    }
    if (!Number.isInteger(sourceResolution) || sourceResolution < 1) {
        throw new Error("high-ice sourceResolution must be a positive integer");
    }
    if (!Number.isInteger(guardVoxels) || guardVoxels < 1) {
        throw new Error("high-ice source guardVoxels must be a positive integer");
    }
    const stride = sourceResolution + guardVoxels * 2;
    const candidates = [];
    // A one-axis stack is always sufficient for the WebGPU 2048 limit at the
    // current source count.  Restricting the search to sourceCount slots keeps
    // pathological future calls from allocating a large empty candidate grid,
    // while still permitting the minimal balanced grid whenever its product
    // is the first value >= sourceCount.
    for (let columns = 1; columns <= sourceCount; columns += 1) {
        for (let rows = 1; rows <= sourceCount; rows += 1) {
            for (let layers = 1; layers <= sourceCount; layers += 1) {
                const slotCount = columns * rows * layers;
                if (slotCount < sourceCount) continue;
                const dimensions = [
                    columns * stride,
                    rows * stride,
                    layers * stride,
                ];
                const maximumAxis = Math.max(...dimensions);
                candidates.push({
                    columns,
                    rows,
                    layers,
                    slotCount,
                    dimensions,
                    score: [
                        maximumAxis,
                        slotCount,
                        columns,
                        rows,
                        layers,
                    ],
                });
            }
        }
    }
    candidates.sort((left, right) => {
        for (let index = 0; index < left.score.length; index += 1) {
            if (left.score[index] !== right.score[index]) {
                return left.score[index] - right.score[index];
            }
        }
        return 0;
    });
    const selected = candidates[0];
    if (!selected || Math.max(...selected.dimensions) > 2048) {
        throw new Error(
            `high-ice source atlas cannot fit WebGPU 3-D dimensions for ` +
            `${sourceCount} ${sourceResolution}^3 sources with ${guardVoxels} guard voxels`,
        );
    }
    return Object.freeze({
        kind: "xyz-tiled-canonical-source-volumes",
        sourceResolution,
        guardVoxels,
        xStride: stride,
        yStride: stride,
        zStride: stride,
        columns: selected.columns,
        rows: selected.rows,
        layers: selected.layers,
        slotCount: selected.slotCount,
        dimensions: Object.freeze({
            width: selected.dimensions[0],
            height: selected.dimensions[1],
            depthOrArrayLayers: selected.dimensions[2],
        }),
    });
};

/**
 * Condition one authored 2x2x2 source block to the exact byte mass of its
 * final coarse parent.  Scaling uses largest-remainder quantization with a
 * stable index tie-break and a hard [0,255] byte bound.  Zero-valued authored
 * children remain zero; mass is redistributed only among positive authored
 * children.  Unsupported parents are always returned as eight zero bytes.
 */
export const conditionCloudHighIceSourceBlockMass = ({
    density,
    targetDensity,
    parentOccupied = true,
} = {}) => {
    if (!density || density.length !== 8) {
        throw new Error("high-ice source block density must contain 8 bytes");
    }
    if (!Number.isInteger(targetDensity) || targetDensity < 0 ||
        targetDensity > 255) {
        throw new Error("high-ice source target density must be an R8 byte");
    }
    if (!parentOccupied || targetDensity === 0) return new Uint8Array(8);
    const targetMass = targetDensity * 8;
    let sourceMass = 0;
    let positiveCount = 0;
    for (const value of density) {
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            throw new Error("high-ice source density must contain R8 bytes");
        }
        sourceMass += value;
        if (value > 0) positiveCount += 1;
    }
    if (sourceMass === targetMass) return Uint8Array.from(density);
    const result = new Uint8Array(8);
    if (sourceMass === 0) {
        if (targetMass > 0) {
            throw new Error(
                "high-ice source target mass is positive for an all-zero authored block",
            );
        }
        return result;
    }
    if (targetMass > positiveCount * 255) {
        throw new Error(
            `high-ice source target mass ${targetMass} exceeds ` +
            `${positiveCount} positive authored R8 children`,
        );
    }
    const scale = targetMass / sourceMass;
    const fractions = [];
    let quantizedMass = 0;
    for (let index = 0; index < density.length; index += 1) {
        const exact = density[index] * scale;
        const floor = Math.min(255, Math.floor(exact));
        result[index] = floor;
        quantizedMass += floor;
        if (density[index] > 0) {
            fractions.push({
                index,
                fraction: exact - Math.floor(exact),
            });
        }
    }
    fractions.sort((left, right) =>
        right.fraction - left.fraction || left.index - right.index);
    let remaining = targetMass - quantizedMass;
    while (remaining > 0) {
        let progressed = false;
        for (const candidate of fractions) {
            if (remaining <= 0) break;
            if (result[candidate.index] >= 255) continue;
            result[candidate.index] += 1;
            remaining -= 1;
            progressed = true;
        }
        if (!progressed) {
            throw new Error("high-ice source target mass cannot fit R8 block");
        }
    }
    return result;
};

/**
 * Pack authored source-density fields into the guarded RGBA8 source atlas.
 * `sourceFields` may be a Map or a plain object; each value contains the
 * authored `density` and `occupied` arrays, the final coarse `parentOccupied`
 * support mask, and the coarse `coverage` bytes.  Source IDs define the only
 * accepted ordering and are never sorted implicitly.  R is copied for every
 * authored fine voxel whose final coarse parent remains supported (including
 * sub-threshold clear children); G replicates that parent's exact coarse
 * support coverage across all eight children; B stores the conditioned
 * normalized second moment for that parent; A stores the original fine
 * source-occupied mask.  No source field is regenerated from the reduced
 * macro atlas.
 */
export const packCloudHighIceSourceAtlas = ({
    sourceFields,
    sourceIds = CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS,
    sourceResolution = CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION,
    guardVoxels = CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
} = {}) => {
    if (!sourceFields || typeof sourceFields !== "object") {
        throw new Error("high-ice sourceFields are required");
    }
    if (!Array.isArray(sourceIds) || sourceIds.length < 1 ||
        new Set(sourceIds).size !== sourceIds.length) {
        throw new Error("high-ice sourceIds must be a non-empty unique array");
    }
    const packing = calculateCloudHighIceSourceAtlasPacking({
        sourceCount: sourceIds.length,
        sourceResolution,
        guardVoxels,
    });
    const { width, height, depthOrArrayLayers: depth } = packing.dimensions;
    const atlas = new Uint8Array(width * height * depth * 4);
    const slots = [];
    const sourceChecksums = {};
    const sourceLookup = sourceFields instanceof Map
        ? (id) => sourceFields.get(id)
        : (id) => sourceFields[id];
    const tileStride = packing.xStride;
    for (let slot = 0; slot < sourceIds.length; slot += 1) {
        const id = sourceIds[slot];
        const field = sourceLookup(id);
        const expectedLength = sourceResolution ** 3;
        const density = field?.density;
        const occupied = field?.occupied;
        const parentOccupied = field?.parentOccupied;
        const coverage = field?.coverage;
        const targetDensity = field?.targetDensity;
        const targetResolution = sourceResolution / 2;
        if (!field || !density || !occupied || !parentOccupied || !coverage ||
            !Number.isInteger(targetResolution) ||
            density.length !== expectedLength ||
            occupied.length !== expectedLength ||
            parentOccupied.length !== targetResolution ** 3 ||
            coverage.length !== targetResolution ** 3 ||
            !targetDensity ||
            targetDensity.length !== targetResolution ** 3) {
            throw new Error(
                `high-ice source ${id} must provide authored ${expectedLength}^3 ` +
                "density/occupied and final coarse parent support/coverage fields",
            );
        }
        const tileX = slot % packing.columns;
        const tileY = Math.floor(slot / packing.columns) % packing.rows;
        const tileZ = Math.floor(slot / (packing.columns * packing.rows));
        const xOffset = tileX * tileStride + guardVoxels;
        const yOffset = tileY * tileStride + guardVoxels;
        const zOffset = tileZ * tileStride + guardVoxels;
        for (let parentZ = 0; parentZ < targetResolution; parentZ += 1) {
            for (let parentY = 0; parentY < targetResolution; parentY += 1) {
                for (let parentX = 0; parentX < targetResolution; parentX += 1) {
                    const parentIndex =
                        (parentZ * targetResolution + parentY) * targetResolution +
                        parentX;
                    if (!parentOccupied[parentIndex]) continue;
                    const blockDensity = new Uint8Array(8);
                    let blockChild = 0;
                    for (let blockZ = 0; blockZ < 2; blockZ += 1) {
                        for (let blockY = 0; blockY < 2; blockY += 1) {
                            for (let blockX = 0; blockX < 2; blockX += 1) {
                                blockDensity[blockChild++] = density[
                                    (((parentZ * 2 + blockZ) * sourceResolution +
                                        parentY * 2 + blockY) * sourceResolution +
                                        parentX * 2 + blockX)
                                ];
                            }
                        }
                    }
                    const conditioned = conditionCloudHighIceSourceBlockMass({
                        density: blockDensity,
                        targetDensity: targetDensity[parentIndex],
                        parentOccupied: true,
                    });
                    const conditionedSecondMoment = Math.round(
                        conditioned.reduce(
                            (sum, value) => sum + (value / 255) ** 2,
                            0,
                        ) / 8 * 255,
                    );
                    blockChild = 0;
                    for (let blockZ = 0; blockZ < 2; blockZ += 1) {
                        for (let blockY = 0; blockY < 2; blockY += 1) {
                            for (let blockX = 0; blockX < 2; blockX += 1) {
                                const targetIndex = (
                                    ((zOffset + parentZ * 2 + blockZ) * height +
                                        yOffset + parentY * 2 + blockY) * width +
                                    xOffset + parentX * 2 + blockX
                                ) * 4;
                                const conditionedChild = conditioned[blockChild++];
                                atlas[targetIndex] = conditionedChild;
                                // G is metadata, so it is intentionally
                                // replicated to clear fine children too.
                                atlas[targetIndex + 1] = coverage[parentIndex];
                                // B is the exact normalized E[rho^2] of the
                                // conditioned eight-child block, replicated
                                // so linear filtering preserves the parent
                                // statistic without a second fine reduction.
                                atlas[targetIndex + 2] = conditionedSecondMoment;
                                // A gates final conditioned material support:
                                // retained positive fine density is 255,
                                // including an authored sub-threshold child;
                                // clear/unsupported children are 0.
                                atlas[targetIndex + 3] = conditionedChild > 0
                                    ? 255 : 0;
                            }
                        }
                    }
                }
            }
        }
        const checksum = sha256(density);
        sourceChecksums[id] = checksum;
        slots.push({
            slot,
            id,
            tile: { x: tileX, y: tileY, z: tileZ },
            xOffset,
            yOffset,
            zOffset,
            checksum,
        });
    }
    return {
        atlas,
        packing,
        slots,
        sourceChecksums,
        sourceIdToSlot: Object.fromEntries(
            sourceIds.map((id, slot) => [id, slot]),
        ),
    };
};

// A canonical Cumulus owner is one parcel-connected cloud. Quantization can
// leave an otherwise invisible one-voxel mixing-tail island just above the
// occupancy byte threshold. Retain the dominant physical component and report
// the removed fraction so tests still reject any authoring failure large
// enough to be meteorologically meaningful.
const retainLargestConnectedComponent = (
    occupied,
    density,
    detail,
    phase,
    precipitation,
    resolution,
) => {
    const labels = new Uint32Array(occupied.length);
    const queue = new Int32Array(occupied.length);
    const sizes = [0];
    let label = 0;
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || labels[start] !== 0) continue;
        label += 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = label;
        while (head < tail) {
            const index = queue[head++];
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            const push = (neighbor) => {
                if (occupied[neighbor] && labels[neighbor] === 0) {
                    labels[neighbor] = label;
                    queue[tail++] = neighbor;
                }
            };
            if (x > 0) push(index - 1);
            if (x + 1 < resolution) push(index + 1);
            if (y > 0) push(index - resolution);
            if (y + 1 < resolution) push(index + resolution);
            if (z > 0) push(index - resolution * resolution);
            if (z + 1 < resolution) push(index + resolution * resolution);
        }
        sizes[label] = tail;
    }
    if (label <= 1) return { removedVoxelCount: 0, removedVoxelFraction: 0 };
    let largestLabel = 1;
    for (let index = 2; index < sizes.length; index += 1) {
        if (sizes[index] > sizes[largestLabel]) largestLabel = index;
    }
    const occupiedBefore = sizes.reduce((sum, value) => sum + value, 0);
    let removedVoxelCount = 0;
    for (let index = 0; index < occupied.length; index += 1) {
        if (!occupied[index] || labels[index] === largestLabel) continue;
        occupied[index] = 0;
        density[index] = 0;
        detail[index] = 0;
        phase[index] = 0;
        precipitation[index] = 0;
        removedVoxelCount += 1;
    }
    return {
        removedVoxelCount,
        removedVoxelFraction: removedVoxelCount / Math.max(1, occupiedBefore),
    };
};

// The 2x high-ice reduction preserves every source-supported target block.
// Spissatus also needs one narrow cleanup for an isolated threshold byte that
// is created by a single source sample. It removes only that conservative
// dust and leaves the authored bodies unchanged.
const removeTinyDetachedComponents = (
    occupied,
    density,
    detail,
    phase,
    precipitation,
    resolution,
    maximumComponentVoxels,
    maximumDensity,
) => {
    const labels = new Uint32Array(occupied.length);
    const queue = new Int32Array(occupied.length);
    const componentSizes = [0];
    const componentMaximumDensities = [0];
    let componentCount = 0;
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || labels[start] !== 0) continue;
        componentCount += 1;
        let head = 0;
        let tail = 0;
        let componentMaximumDensity = 0;
        queue[tail++] = start;
        labels[start] = componentCount;
        while (head < tail) {
            const index = queue[head++];
            componentMaximumDensity = Math.max(
                componentMaximumDensity,
                density[index],
            );
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            const push = (neighbor) => {
                if (occupied[neighbor] && labels[neighbor] === 0) {
                    labels[neighbor] = componentCount;
                    queue[tail++] = neighbor;
                }
            };
            if (x > 0) push(index - 1);
            if (x + 1 < resolution) push(index + 1);
            if (y > 0) push(index - resolution);
            if (y + 1 < resolution) push(index + resolution);
            if (z > 0) push(index - resolution * resolution);
            if (z + 1 < resolution) push(index + resolution * resolution);
        }
        componentSizes[componentCount] = tail;
        componentMaximumDensities[componentCount] = componentMaximumDensity;
    }
    const occupiedBefore = componentSizes.reduce(
        (sum, size) => sum + size,
        0,
    );
    let removedVoxelCount = 0;
    let removedDensityMassBytes = 0;
    for (let index = 0; index < occupied.length; index += 1) {
        const label = labels[index];
        if (!occupied[index] ||
            componentSizes[label] > maximumComponentVoxels ||
            componentMaximumDensities[label] > maximumDensity) {
            continue;
        }
        removedDensityMassBytes += density[index];
        occupied[index] = 0;
        density[index] = 0;
        detail[index] = 0;
        phase[index] = 0;
        precipitation[index] = 0;
        removedVoxelCount += 1;
    }
    return {
        removedVoxelCount,
        removedVoxelFraction: removedVoxelCount /
            Math.max(1, occupiedBefore),
        removedDensityMassBytes,
    };
};

const connectSupportComponentsAdditively = (
    occupied,
    density,
    resolution,
    occupancyThreshold,
) => {
    const labels = new Uint32Array(occupied.length);
    const queue = new Int32Array(occupied.length);
    const componentSizes = [0];
    let componentCount = 0;
    for (let start = 0; start < occupied.length; start += 1) {
        if (!occupied[start] || labels[start] !== 0) continue;
        componentCount += 1;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        labels[start] = componentCount;
        while (head < tail) {
            const index = queue[head++];
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            const push = (neighbor) => {
                if (occupied[neighbor] && labels[neighbor] === 0) {
                    labels[neighbor] = componentCount;
                    queue[tail++] = neighbor;
                }
            };
            if (x > 0) push(index - 1);
            if (x + 1 < resolution) push(index + 1);
            if (y > 0) push(index - resolution);
            if (y + 1 < resolution) push(index + resolution);
            if (z > 0) push(index - resolution * resolution);
            if (z + 1 < resolution) push(index + resolution * resolution);
        }
        componentSizes[componentCount] = tail;
    }
    if (componentCount <= 1) {
        return { originalComponentCount: componentCount, addedConnectorVoxels: 0 };
    }
    let largestLabel = 1;
    for (let label = 2; label <= componentCount; label += 1) {
        if (componentSizes[label] > componentSizes[largestLabel]) {
            largestLabel = label;
        }
    }
    const previous = new Int32Array(occupied.length);
    const componentOrder = Array.from(
        { length: componentCount },
        (_, index) => index + 1,
    ).filter((label) => label !== largestLabel).sort(
        (left, right) => componentSizes[right] - componentSizes[left] || left - right,
    );
    let addedConnectorVoxels = 0;
    const maximumConnectorVoxels = Math.ceil(resolution / 4);
    for (const componentLabel of componentOrder) {
        previous.fill(-3);
        let head = 0;
        let tail = 0;
        for (let index = 0; index < labels.length; index += 1) {
            if (labels[index] !== componentLabel) continue;
            previous[index] = -2;
            queue[tail++] = index;
        }
        let connection = -1;
        while (head < tail && connection < 0) {
            const index = queue[head++];
            const z = Math.floor(index / (resolution * resolution));
            const remainder = index - z * resolution * resolution;
            const y = Math.floor(remainder / resolution);
            const x = remainder - y * resolution;
            const visit = (neighbor) => {
                if (connection >= 0) return;
                if (labels[neighbor] === largestLabel) {
                    connection = index;
                    return;
                }
                if (previous[neighbor] !== -3) return;
                if (labels[neighbor] !== 0 && labels[neighbor] !== componentLabel) {
                    return;
                }
                previous[neighbor] = index;
                queue[tail++] = neighbor;
            };
            if (x > 0) visit(index - 1);
            if (x + 1 < resolution) visit(index + 1);
            if (y > 0) visit(index - resolution);
            if (y + 1 < resolution) visit(index + resolution);
            if (z > 0) visit(index - resolution * resolution);
            if (z + 1 < resolution) visit(index + resolution * resolution);
        }
        if (connection < 0) {
            throw new Error("protected Cu source support could not be connected additively");
        }
        let cursor = connection;
        while (cursor >= 0) {
            if (!occupied[cursor]) {
                occupied[cursor] = 1;
                density[cursor] = occupancyThreshold;
                labels[cursor] = largestLabel;
                addedConnectorVoxels += 1;
                if (addedConnectorVoxels > maximumConnectorVoxels) {
                    throw new Error(
                        "protected Cu source support requires an unsafe connector length",
                    );
                }
            }
            if (previous[cursor] === -2) break;
            cursor = previous[cursor];
        }
        for (let index = 0; index < labels.length; index += 1) {
            if (labels[index] === componentLabel) labels[index] = largestLabel;
        }
    }
    return { originalComponentCount: componentCount, addedConnectorVoxels };
};

// This is retained only for the explicit 1x comparison path. Production Cu
// now evaluates the continuous model on the 2x Cartesian source lattice.
const congestusTetrahedralOffsets = [
    [-0.23, -0.23, -0.23],
    [0.23, 0.23, -0.23],
    [0.23, -0.23, 0.23],
    [-0.23, 0.23, 0.23],
];

const sampleMacroModelFields = ({
    model,
    config,
    volumeSeed,
    resolution,
    occupancyThreshold,
    tetrahedralCongestus = false,
    sourceScale = 1,
    retainSubthresholdDensity = false,
}) => {
    const voxelCount = resolution ** 3;
    const density = new Uint8Array(voxelCount);
    const authoredDensity = retainSubthresholdDensity
        ? new Uint8Array(voxelCount) : null;
    const authoredOccupied = retainSubthresholdDensity
        ? new Uint8Array(voxelCount) : null;
    const detail = new Uint8Array(voxelCount);
    const phase = new Uint8Array(voxelCount);
    const precipitation = new Uint8Array(voxelCount);
    const occupied = new Uint8Array(voxelCount);
    const targetResolution = resolution / sourceScale;
    const normalizedCoordinate = (index) => sourceScale === 1
        ? index / (resolution - 1)
        : clamp((
            Math.floor(index / sourceScale) +
            ((index % sourceScale) + 0.5) / sourceScale - 0.5
        ) / (targetResolution - 1));
    for (let z = 0; z < resolution; z += 1) {
        const normalizedZ = normalizedCoordinate(z);
        for (let y = 0; y < resolution; y += 1) {
            const normalizedY = normalizedCoordinate(y);
            for (let x = 0; x < resolution; x += 1) {
                const normalizedX = normalizedCoordinate(x);
                const index = (z * resolution + y) * resolution + x;
                let sample;
                if (tetrahedralCongestus && config.species === "congestus") {
                    const aggregate = {
                        density: 0,
                        detail: 0,
                        phase: 0,
                        precipitation: 0,
                    };
                    for (const [offsetX, offsetY, offsetZ] of
                        congestusTetrahedralOffsets) {
                        const subsample = evaluateMacroModel(
                            model,
                            config,
                            clamp(normalizedX + offsetX / (resolution - 1)),
                            clamp(normalizedY + offsetY / (resolution - 1)),
                            clamp(normalizedZ + offsetZ / (resolution - 1)),
                            volumeSeed,
                        );
                        aggregate.density += subsample.density;
                        aggregate.detail += subsample.detail;
                        aggregate.phase += subsample.phase;
                        aggregate.precipitation += subsample.precipitation ?? 0;
                    }
                    const inverseSampleCount = 1 /
                        congestusTetrahedralOffsets.length;
                    sample = {
                        density: aggregate.density * inverseSampleCount,
                        detail: aggregate.detail * inverseSampleCount,
                        phase: aggregate.phase * inverseSampleCount,
                        precipitation: aggregate.precipitation * inverseSampleCount,
                    };
                } else {
                    sample = evaluateMacroModel(
                        model,
                        config,
                        normalizedX,
                        normalizedY,
                        normalizedZ,
                        volumeSeed,
                    );
                }
                const encodedDensity = Math.floor(sample.density * 255);
                if (authoredDensity) authoredDensity[index] = encodedDensity;
                if (authoredOccupied) {
                    authoredOccupied[index] = encodedDensity > 0 ? 1 : 0;
                }
                // The support threshold is applied at the reconstruction
                // source resolution. Reduction may soften covered boundary
                // blocks, but it never resurrects sub-threshold haze.
                density[index] = encodedDensity >= occupancyThreshold
                    ? encodedDensity
                    : 0;
                detail[index] = Math.round(sample.detail * 255);
                phase[index] = Math.round(sample.phase * 255);
                precipitation[index] = Math.round(
                    (sample.precipitation ?? 0) * 255,
                );
                occupied[index] = density[index] > 0 ? 1 : 0;
            }
        }
    }
    return {
        density,
        ...(authoredDensity ? { authoredDensity } : {}),
        ...(authoredOccupied ? { authoredOccupied } : {}),
        detail,
        phase,
        precipitation,
        occupied,
    };
};

export const createCloudExteriorBoundaryChecksum = (contract, volumes) => sha256(
    Buffer.from(JSON.stringify({
        contract,
        volumes: volumes.map((volume) => ({
            id: volume.id,
            exteriorBoundary: volume.exteriorBoundary,
        })),
    })),
);

export const generateCloudMacroAtlas = ({
    resolution = 48,
    paddingZ = 1,
    brickSize = 8,
    seed = CLOUD_MACRO_ATLAS_SEED,
    protectedCuReconstructionScale = CLOUD_PROTECTED_CU_RECONSTRUCTION_SCALE,
    highIceReconstructionScale = CLOUD_HIGH_ICE_RECONSTRUCTION_SCALE,
} = {}) => {
    if (!Number.isInteger(resolution) || resolution < 16 || resolution % brickSize !== 0) {
        throw new Error("resolution must be an integer >= 16 and divisible by brickSize");
    }
    if (![1, 2].includes(protectedCuReconstructionScale)) {
        throw new Error("protectedCuReconstructionScale must be 1 or 2");
    }
    if (![1, 2].includes(highIceReconstructionScale)) {
        throw new Error("highIceReconstructionScale must be 1 or 2");
    }
    if (highIceReconstructionScale === 1) {
        throw new Error(
            "highIceReconstructionScale=1 is unsupported: high-ice source and moment " +
            "contracts require the conditioned 96^3 -> 48^3 reduction",
        );
    }
    const volumeCount = VOLUME_CONFIGS.length;
    const zStride = resolution + paddingZ * 2;
    // The runtime consumes a complete xyz transform per volume; the old
    // one-column Z stack was only a generator convention. Tile append-only
    // 48^3 slots across X and Z so material anatomies do not consume reduced
    // resolution or exceed WebGPU's guaranteed 2048^3 texture dimensions.
    // Existing IDs and indices remain stable even though their physical texel
    // offsets are now manifest-derived in all three axes.
    const packingColumns = Math.max(
        1,
        Math.ceil(volumeCount * zStride / 2048),
    );
    const packingRows = Math.ceil(volumeCount / packingColumns);
    const atlasWidth = packingColumns * zStride;
    const atlasHeight = resolution;
    const atlasDepth = packingRows * zStride;
    if (Math.max(atlasWidth, atlasHeight, atlasDepth) > 2048) {
        throw new Error(
            `macro atlas ${atlasWidth}x${atlasHeight}x${atlasDepth} exceeds the WebGPU guaranteed ` +
            `maxTextureDimension3D of 2048`,
        );
    }
    const atlas = new Uint8Array(atlasWidth * atlasHeight * atlasDepth * 4);
    // RG8 high-ice moments use the exact atlas packing and dimensions. Guards
    // remain zero so filtering cannot leak a moment into an adjacent owner.
    const highIceMomentSidecar = new Uint8Array(
        atlasWidth * atlasHeight * atlasDepth * 2,
    );
    // Every packing guard is clear air with a positive saturated SDF. This
    // protects trilinear samples in both tiled axes, not only the legacy Z
    // stack, and makes unused tail cells semantically exterior.
    for (let index = 3; index < atlas.length; index += 4) atlas[index] = 255;
    const majorantGridSize = resolution / brickSize;
    const majorantWidth = majorantGridSize * packingColumns;
    const majorantHeight = majorantGridSize;
    const majorantDepth = majorantGridSize * packingRows;
    const majorants = new Uint8Array(
        majorantWidth * majorantHeight * majorantDepth,
    );
    const volumeEntries = [];
    const foundationDensityFields = new Map();
    // Keep the authored fine fields until the guarded RG8 payload is packed at
    // the end of generation.  This is intentionally a map of the exact
    // source arrays sampled below; reconstructing them from the reduced
    // macro atlas would erase the within-voxel spatial signal this asset is
    // meant to preserve.
    const highIceSourceAtlasResolution =
        resolution * CLOUD_HIGH_ICE_RECONSTRUCTION_SCALE;
    const highIceSourceFields = new Map();
    const occupancyThreshold = 16;
    const sdfRangeVoxels = 12;

    for (let volumeIndex = 0; volumeIndex < volumeCount; volumeIndex += 1) {
        const sourceConfig = VOLUME_CONFIGS[volumeIndex];
        const foundationProfile = foundationProfileForConfig(sourceConfig);
        // Cu/Cb keep the exact object and random/evaluation path so family
        // integration cannot perturb their versioned byte blocks.
        const config = foundationProfile
            ? {
                ...sourceConfig,
                foundationProfile,
                topologyPolicy: topologyPolicyForFoundation(
                    foundationProfile,
                    sourceConfig.topologyPolicy,
                ),
            }
            : sourceConfig;
        // The template identity, not its packing index, owns the random stream.
        // Adding a new species therefore never mutates any existing topology.
        const volumeSeed = hashInteger(seed ^ hashString(config.id));
        const model = buildMacroModel(config, volumeSeed);
        const voxelCount = resolution ** 3;
        const reconstructProtectedCu =
            protectedCuReconstructionScale === 2 &&
            CLOUD_PROTECTED_CU_RECONSTRUCTION_ID_SET.has(config.id);
        const reconstructHighIce =
            highIceReconstructionScale === 2 &&
            CLOUD_HIGH_ICE_RECONSTRUCTION_ID_SET.has(config.id);
        const reconstructSource2x = reconstructProtectedCu || reconstructHighIce;
        const reconstructionSourceScale = reconstructProtectedCu
            ? protectedCuReconstructionScale : highIceReconstructionScale;
        let density;
        let detail;
        let phase;
        let precipitation;
        let occupied;
        let signedDistance;
        let highIceMoments;
        let topologyCleanup;
        let sourceTopologyCleanup = {
            removedVoxelCount: 0,
            removedVoxelFraction: 0,
            removedDensityMassBytes: 0,
        };
        let reconstructionStatistics = {};
        if (reconstructSource2x) {
            const sourceResolution = resolution * 2;
            const sourceVoxelCount = sourceResolution ** 3;
            const source = sampleMacroModelFields({
                model,
                config,
                volumeSeed,
                resolution: sourceResolution,
                occupancyThreshold,
                sourceScale: reconstructionSourceScale,
                retainSubthresholdDensity: reconstructHighIce,
            });
            const preCleanupSourceOccupiedVoxels = source.occupied.reduce(
                (sum, value) => sum + (value > 0 ? 1 : 0),
                0,
            );
            const preCleanupSourceComponentCount = measureConnectivity(
                source.occupied,
                sourceResolution,
            ).connectedComponentCount;
            const preCleanupSourceSupportChecksum = sha256(source.occupied);
            const preCleanupSourceDensityChecksum = sha256(
                reconstructHighIce ? source.authoredDensity : source.density,
            );
            if (reconstructHighIce && config.id === "ci-spissatus") {
                // Cull only physically subgrid threshold islands on the fine
                // source lattice, before moments and coarse reduction are
                // authored.  Keep the source RGBA, coverage sidecar, and
                // reduced support derived from this same cleaned population.
                const sourceOccupiedBefore = source.occupied.slice();
                sourceTopologyCleanup = removeTinyDetachedComponents(
                    source.occupied,
                    source.density,
                    source.detail,
                    source.phase,
                    source.precipitation,
                    sourceResolution,
                    2,
                    occupancyThreshold + 2,
                );
                for (let index = 0; index < source.occupied.length; index += 1) {
                    if (sourceOccupiedBefore[index] && !source.occupied[index]) {
                        source.authoredDensity[index] = 0;
                        source.authoredOccupied[index] = 0;
                    }
                }
            }
            // Source support is immutable through the 2x reduction: every
            // source-supported block survives into the coarse support.
            topologyCleanup = {
                removedVoxelCount: 0,
                removedVoxelFraction: 0,
            };
            const sourceSupportChecksum = sha256(source.occupied);
            const sourceDensityChecksum = sha256(source.density);
            const originalSourceOccupiedVoxels = preCleanupSourceOccupiedVoxels;
            const supportRepair = reconstructProtectedCu
                ? connectSupportComponentsAdditively(
                    source.occupied,
                    source.density,
                    sourceResolution,
                    occupancyThreshold,
                )
                : {
                    originalComponentCount: measureConnectivity(
                        source.occupied,
                        sourceResolution,
                    ).connectedComponentCount,
                    addedConnectorVoxels: 0,
                };
            // Protected liquid towers need the fine-lattice SDF restriction to
            // preserve their exact LCL/exterior contract. High ice needs the
            // 2x optical-mass reconstruction but not a 96^3 distance transform:
            // its authoritative SDF is reinitialized from the reduced 48^3
            // support below. This removes two large 3-D EDT passes per Cirrus
            // volume without changing any runtime texture or visual sample.
            const sourceSdf = reconstructProtectedCu
                ? createNarrowBandSignedDistanceField(
                    source.occupied,
                    sourceResolution,
                    sdfRangeVoxels * reconstructionSourceScale,
                )
                : {
                    signedDistance: new Float32Array(sourceVoxelCount),
                    peakWorkingBytes: sourceVoxelCount * 4,
                };
            const reduced = reduceCloudMacroSource2x({
                ...source,
                signedDistance: sourceSdf.signedDistance,
                sourceResolution,
                targetResolution: resolution,
                occupancyThreshold,
                sdfRangeVoxels,
            });
            ({
                density,
                detail,
                phase,
                precipitation,
                occupied,
                signedDistance,
            } = reduced);
            if (reconstructHighIce && config.id === "ci-spissatus") {
                // Reduction can leave one or two isolated bytes at the support
                // threshold when a source sample straddles a coarse target
                // block. They are conservative quantization dust, not a fourth
                // dense body; remove only a <=2-voxel component whose peak
                // remains within two bytes of the occupancy floor.
                topologyCleanup = removeTinyDetachedComponents(
                    occupied,
                    density,
                    detail,
                    phase,
                    precipitation,
                    resolution,
                    2,
                    occupancyThreshold + 2,
                );
            }
            if (reconstructHighIce) {
                // Compute moments from the authored post-cleanup fine density,
                // conditioned against the exact final coarse parent bytes.
                // The guarded RGBA source pack applies the same conditioner,
                // making sidecar R/G byte-identical to source B/G.
                highIceMoments = reduceCloudHighIceMomentSource2x({
                    density: source.authoredDensity,
                    occupied: source.authoredOccupied,
                    sourceResolution,
                    targetResolution: resolution,
                    targetDensity: density,
                    parentOccupied: occupied,
                });
            }
            if (reconstructHighIce) {
                highIceSourceFields.set(config.id, {
                    density: source.authoredDensity,
                    occupied: source.authoredOccupied,
                    parentOccupied: occupied,
                    coverage: highIceMoments.coverage,
                    targetDensity: density,
                });
            }
            const reducedOccupiedVoxels =
                reduced.diagnostics.targetOccupiedVoxels -
                topologyCleanup.removedVoxelCount;
            const reducedEquivalentDensityMassBytes =
                reduced.diagnostics.targetEquivalentDensityMassBytes -
                (topologyCleanup.removedDensityMassBytes ?? 0) * 8;
            if (reconstructHighIce) {
                signedDistance = createSignedDistanceChannel(
                    occupied,
                    resolution,
                    sdfRangeVoxels,
                );
            }
            reconstructionStatistics = {
                reconstructionMethod:
                    reconstructHighIce
                        ? "continuous-2x-high-ice-source-conservative-mass-coverage-reduction"
                        : "continuous-2x-source-conservative-mass-coverage-reduction",
                reconstructionScale: reconstructionSourceScale,
                reconstructionSourceResolution: sourceResolution,
                reconstructionSourceSupportChecksum: sourceSupportChecksum,
                reconstructionSourceDensityChecksum: sourceDensityChecksum,
                reconstructionPreCleanupSourceSupportChecksum:
                    preCleanupSourceSupportChecksum,
                reconstructionPreCleanupSourceDensityChecksum:
                    preCleanupSourceDensityChecksum,
                reconstructionOriginalSourceOccupiedVoxels:
                    originalSourceOccupiedVoxels,
                reconstructionSourceOccupiedVoxels:
                    reduced.diagnostics.sourceOccupiedVoxels,
                reconstructionOriginalSourceComponentCount:
                    preCleanupSourceComponentCount,
                reconstructionPostCleanupSourceComponentCount:
                    supportRepair.originalComponentCount,
                reconstructionSourceCleanupVoxelCount:
                    sourceTopologyCleanup.removedVoxelCount,
                reconstructionSourceCleanupVoxelFraction:
                    sourceTopologyCleanup.removedVoxelFraction,
                reconstructionSourceCleanupDensityMassBytes:
                    sourceTopologyCleanup.removedDensityMassBytes ?? 0,
                reconstructionAddedConnectorVoxels:
                    supportRepair.addedConnectorVoxels,
                reconstructionReducedOccupiedVoxels:
                    reducedOccupiedVoxels,
                reconstructionLostSourceSupportVoxels:
                    reduced.diagnostics.lostSourceSupportVoxels,
                reconstructionPartiallyCoveredVoxels:
                    reduced.diagnostics.partiallyCoveredTargetVoxels,
                reconstructionMinimumPositiveCoverage:
                    reduced.diagnostics.minimumPositiveCoverage,
                reconstructionMeanPositiveCoverage:
                    reduced.diagnostics.meanPositiveCoverage,
                reconstructionSourceDensityMassBytes:
                    reduced.diagnostics.sourceDensityMassBytes,
                reconstructionReducedEquivalentDensityMassBytes:
                    reducedEquivalentDensityMassBytes,
                reconstructionDensityMassRatio: reducedEquivalentDensityMassBytes /
                    Math.max(1, reduced.diagnostics.sourceDensityMassBytes),
                reconstructionMassCapacityClampedTargetVoxels:
                    reduced.diagnostics.massCapacityClampedTargetVoxels,
                reconstructionMassCapacityRemovedBytes:
                    reduced.diagnostics.massCapacityRemovedBytes,
                reconstructionSdfMethod:
                    reconstructHighIce
                        ? "exact-coarse-edt-after-conservative-2x-support-reduction"
                        : "exact-separable-edt-clamped-narrow-band-before-2x-reduction",
                reconstructionSdfUnit: "coarse-voxel",
                reconstructionPeakTypedArrayBytes: Math.max(
                    sourceVoxelCount * (reconstructHighIce ? 9 : 17),
                    sourceVoxelCount * 9 + voxelCount * 14,
                ),
            };
        } else {
            const sampled = sampleMacroModelFields({
                model,
                config,
                volumeSeed,
                resolution,
                occupancyThreshold,
                tetrahedralCongestus: protectedCuReconstructionScale === 1,
            });
            ({ density, detail, phase, precipitation, occupied } = sampled);
            topologyCleanup = (
                config.builder === "cumulus" ||
                (foundationProfile && config.topologyPolicy === "single-connected")
            )
                ? retainLargestConnectedComponent(
                    occupied,
                    density,
                    detail,
                    phase,
                    precipitation,
                    resolution,
                )
                : { removedVoxelCount: 0, removedVoxelFraction: 0 };
            signedDistance = createSignedDistanceChannel(
                occupied,
                resolution,
                sdfRangeVoxels,
            );
        }
        let densitySum = 0;
        let phaseSum = 0;
        let detailSum = 0;
        let precipitationSum = 0;
        let attributeSampleCount = 0;
        for (let index = 0; index < voxelCount; index += 1) {
            if (!occupied[index]) continue;
            densitySum += density[index];
            detailSum += detail[index];
            phaseSum += phase[index];
            precipitationSum += precipitation[index];
            attributeSampleCount += 1;
        }
        const connectivity = measureConnectivity(occupied, resolution);
        const exteriorBoundary = createExteriorBoundaryProfile(
            config,
            connectivity,
            resolution,
        );
        const exteriorPotential = createExteriorPotentialDensity(
            density,
            detail,
            phase,
            signedDistance,
            exteriorBoundary,
            resolution,
            sdfRangeVoxels,
        );
        const packingColumn = volumeIndex % packingColumns;
        const packingRow = Math.floor(volumeIndex / packingColumns);
        const xOffset = packingColumn * zStride + paddingZ;
        const yOffset = 0;
        const zOffset = packingRow * zStride + paddingZ;
        for (let z = 0; z < resolution; z += 1) {
            const atlasZ = zOffset + z;
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const sourceIndex = (z * resolution + y) * resolution + x;
                    const targetIndex = (
                        (atlasZ * atlasHeight + yOffset + y) * atlasWidth +
                        xOffset + x
                    ) * 4;
                    atlas[targetIndex] = density[sourceIndex];
                    atlas[targetIndex + 1] = detail[sourceIndex];
                    atlas[targetIndex + 2] = phase[sourceIndex];
                    atlas[targetIndex + 3] = signedDistance[sourceIndex];
                    if (highIceMoments && occupied[sourceIndex]) {
                        const sidecarIndex = (
                            (atlasZ * atlasHeight + yOffset + y) * atlasWidth +
                            xOffset + x
                        ) * 2;
                        // The moment reducer and source-atlas pack both use
                        // the same mass-conditioned eight-child bytes. Copy
                        // its already-quantized R directly so sidecar R is
                        // byte-identical to source B (rather than applying a
                        // second, potentially divergent clamp).
                        highIceMomentSidecar[sidecarIndex] =
                            highIceMoments.secondMoment[sourceIndex];
                        highIceMomentSidecar[sidecarIndex + 1] =
                            highIceMoments.coverage[sourceIndex];
                    }
                }
            }
        }
        const volumeMajorants = makeMajorants(
            exteriorPotential.potentialDensity,
            resolution,
            brickSize,
        );
        const majorantXOffset = packingColumn * majorantGridSize;
        const majorantYOffset = 0;
        const majorantZOffset = packingRow * majorantGridSize;
        for (let bz = 0; bz < majorantGridSize; bz += 1) {
            for (let by = 0; by < majorantGridSize; by += 1) {
                const source = (bz * majorantGridSize + by) * majorantGridSize;
                const target = (
                    (majorantZOffset + bz) * majorantHeight +
                    majorantYOffset + by
                ) * majorantWidth + majorantXOffset;
                majorants.set(
                    volumeMajorants.subarray(source, source + majorantGridSize),
                    target,
                );
            }
        }
        const statistics = {
            ...connectivity,
            ...exteriorPotential.statistics,
            removedDetachedVoxelCount: topologyCleanup.removedVoxelCount,
            removedDetachedVoxelFraction: topologyCleanup.removedVoxelFraction,
            meanDensity: densitySum / Math.max(1, attributeSampleCount) / 255,
            meanDetailType: detailSum / Math.max(1, attributeSampleCount) / 255,
            meanIceFraction: phaseSum / Math.max(1, attributeSampleCount) / 255,
            meanPrecipitationStructure: precipitationSum / Math.max(1, attributeSampleCount) / 255,
            ...reconstructionStatistics,
            surfaceVoxelFraction: measureSurfaceFraction(occupied, resolution),
            ...measureSignedDistanceSurfaceQuality(
                signedDistance,
                resolution,
                sdfRangeVoxels,
            ),
            ...measureDensityDistribution(density),
            ...measureDeepInteriorDensityVariation(
                density,
                signedDistance,
                sdfRangeVoxels,
            ),
            ...measureInteriorOpticalDepthHierarchy(
                density,
                occupied,
                resolution,
            ),
            ...measureMultiscaleReconstruction(
                density,
                resolution,
                occupancyThreshold,
            ),
            ...measureReconstructionSupport(occupied, resolution),
            ...measureProjectedFootprint(occupied, resolution),
            ...measureProjectedDensityPaths(density, resolution),
            ...measureProjectedAutocorrelation(density, resolution),
            ...measureVerticalSilhouette(occupied, resolution),
            ...measureCumulusProjectionAnatomy(
                occupied,
                density,
                resolution,
                model.baseY ?? null,
                reconstructProtectedCu ? occupancyThreshold + 1 : 1,
            ),
            ...measureVerticalSpanProfile(occupied, resolution),
            ...measureHorizontalSliceTopology(occupied, resolution),
            ...measureLowerBoundaryRoughness(occupied, resolution, model.baseY ?? null),
            ...measureCentralLclBase(occupied, resolution, model.baseY ?? null),
            ...measureVerticalMass(density, resolution),
            primitiveCount: (model.shapes ?? model.primitives ?? model.lenses ?? []).length,
            cirrusIcePatchSurfaceCount: model.primitives?.filter(
                (primitive) => primitive.kind === "ice-patch-surface",
            ).length ?? 0,
            cirrusSpissatusStochasticSourceFieldCount:
                model.primitives?.filter(
                    (primitive) => primitive.kind === "spissatus-stochastic-field",
                ).length ?? 0,
            cirrusSpissatusStochasticLayerCount:
                model.sourceLayerCount ?? 0,
            cirrusSpissatusStochasticSourceSiteCount:
                model.sourceSiteCount ?? 0,
            cirrusSpissatusStochasticShearDisplacement:
                model.sourceShearDisplacement ?? 0,
            cirrusSpissatusStochasticExcursionThreshold:
                model.sourceExcursionThreshold ?? 0,
            cirrusSpissatusStochasticLognormalSigma:
                model.sourceLognormalSigma ?? 0,
            cirrusSpissatusStochasticLatentStandardDeviationTarget:
                model.sourceLatentStandardDeviationTarget ?? 0,
            cirrusSpissatusStochasticLatentMean:
                model.sourceLatentMean ?? 0,
            cirrusSpissatusStochasticLatentVariance:
                model.sourceLatentVariance ?? 0,
            cirrusSpissatusStochasticLatentSkew:
                model.sourceLatentSkew ?? 0,
            cirrusSpissatusStochasticIwcMean:
                model.sourceIwcMean ?? 0,
            cirrusSpissatusStochasticIwcP95:
                model.sourceIwcP95 ?? 0,
            cirrusSpissatusStochasticIwcP99:
                model.sourceIwcP99 ?? 0,
            cirrusSpissatusStochasticIwcSaturationFraction:
                model.sourceIwcSaturationFraction ?? 0,
            cirrusSpissatusStochasticIwcDistribution:
                model.sourceIwcDistribution ?? null,
            cirrusSpissatusStochasticSpectrum:
                model.sourceSpectrum ?? null,
            cirrusSpissatusStochasticFallstreakOrganization:
                model.sourceFallstreakOrganization ?? null,
            cirrusSpissatusStochasticFibrousOrganization:
                model.sourceFibrousOrganization ?? null,
            cirrusSpissatusStochasticEnvelopePrior:
                model.sourceEnvelopePrior ?? null,
            cirrusSpissatusStochasticEnvelopeWarpScale:
                model.sourceEnvelopeWarpScale ?? 0,
            cirrusSpissatusInteriorDensityPrimitiveCount:
                model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface" &&
                        primitive.interiorDensity?.kind ===
                            "sheared-sedimenting-ice-mass",
                ).length ?? 0,
            cirrusSpissatusInteriorDensityHierarchyOctaveCount:
                Math.max(0, ...(model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface" &&
                        primitive.interiorDensity?.kind ===
                            "sheared-sedimenting-ice-mass",
                ).map((primitive) =>
                    primitive.interiorDensity.hierarchyOctaveCount) ?? [0])),
            cirrusSpissatusInteriorDensityIntermittency:
                Math.max(0, ...(model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface" &&
                        primitive.interiorDensity?.kind ===
                            "sheared-sedimenting-ice-mass",
                ).map((primitive) =>
                    primitive.interiorDensity.intermittency) ?? [0])),
            cirrusSpissatusInteriorDensityShearSpread: (() => {
                const shears = model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface" &&
                        primitive.interiorDensity?.kind ===
                            "sheared-sedimenting-ice-mass",
                ).map((primitive) => primitive.interiorDensity.shear) ?? [];
                let spread = 0;
                for (let left = 0; left < shears.length; left += 1) {
                    for (let right = left + 1;
                        right < shears.length; right += 1) {
                        spread = Math.max(spread, Math.hypot(
                            shears[left][0] - shears[right][0],
                            shears[left][1] - shears[right][1],
                        ));
                    }
                }
                return spread;
            })(),
            cirrusIndependentSurfaceBendCount: model.primitives?.filter(
                (primitive) =>
                    primitive.kind === "ice-patch-surface" &&
                    JSON.stringify(primitive.upperSurfaceBend) !==
                        JSON.stringify(primitive.lowerSurfaceBend) &&
                    [
                        ...primitive.upperSurfaceBend.linear,
                        ...primitive.upperSurfaceBend.quadratic,
                        ...primitive.lowerSurfaceBend.linear,
                        ...primitive.lowerSurfaceBend.quadratic,
                    ].some((value) => Math.abs(value) > 1e-6),
            ).length ?? 0,
            cirrusLocalizedPlanReliefLobeCount:
                model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface",
                ).reduce(
                    (count, primitive) =>
                        count + primitive.planReliefLobes.length,
                    0,
                ) ?? 0,
            cirrusLocalizedSurfaceReliefLobeCount:
                model.primitives?.filter(
                    (primitive) => primitive.kind === "ice-patch-surface",
                ).reduce(
                    (count, primitive) => count +
                        primitive.upperReliefLobes.length +
                        primitive.lowerReliefLobes.length,
                    0,
                ) ?? 0,
            cirrusIceTuftSurfaceCount: model.primitives?.filter(
                (primitive) => primitive.kind === "ice-tuft-surface",
            ).length ?? 0,
            cirrusSweptC2AnatomyCount: model.primitives?.filter(
                (primitive) => primitive.kind === "swept-c2",
            ).length ?? 0,
            cirrusLegacyCapsulePrimitiveCount: model.primitives?.filter(
                (primitive) => primitive.kind === "capsule",
            ).length ?? 0,
            cirrusLegacyEllipsoidPrimitiveCount: model.primitives?.filter(
                (primitive) => primitive.kind === "ellipsoid",
            ).length ?? 0,
            formationGroupCount: model.groupCount ?? config.branches ?? 1,
            ...measureOwnerPattern(model.ownerPoints),
            entrainmentCavityCount: model.cavities?.length ?? 0,
            streamlineCount: model.streamlineCount ?? 0,
            commonBaseCount: model.commonBaseCount ?? 0,
            secondaryLobeCount: model.secondaryLobeCount ??
                (model.shapes?.filter((shape) => shape.role === "thermal" || shape.role === "glaciated-crown").length ?? 0),
            hierarchyLevelCount: model.hierarchyLevelCount ?? (model.shapes ? 2 : 1),
            waveCrestCount: model.crestCount ?? 0,
            waveStackLayerCount: model.stackLayerCount ?? 0,
            waveAsymmetricLaminarAlmondCount: model.lenses?.filter(
                (lens) => lens.planKind === "asymmetric-laminar-almond",
            ).length ?? 0,
            formationBoundaryLobeCount: model.boundaryLobeCount ?? 0,
            convectiveBaseLobeCount: model.baseLobeCount ?? 0,
            convectiveCrownLobeCount: model.crownLobeCount ?? 0,
            convectiveMergedBodyLobeCount: model.mergedBodyLobeCount ?? 0,
            convectiveEvaporatingFlankCount: model.evaporatingFlankCount ?? 0,
            cirrusCommaHeadLobeCount: model.commaHeadCount ?? 0,
            cirrusTaperedFallstreakCount: model.taperedFallstreakCount ?? 0,
            cirrusMeanFallstreakTerminalRadiusRatio: model.meanFallstreakTerminalRadiusRatio ?? 0,
            cirrusMeanFallstreakTerminalDensityRatio: model.meanFallstreakTerminalDensityRatio ?? 0,
            cirrusFallstreakDirectionSpread: model.fallstreakDirectionSpread ?? 0,
            cirrusUncinusHookCount: model.uncinusHookCount ?? 0,
            cirrusUncinusConnectedHeadFiberCount: model.uncinusConnectedHeadFiberCount ?? 0,
            cirrusUncinusConnectedFallstreakCount: model.uncinusConnectedFallstreakCount ?? 0,
            cirrusUncinusMeanHookArcLength: model.uncinusMeanHookArcLength ?? 0,
            cirrusUncinusMeanFallstreakLength: model.uncinusMeanFallstreakLength ?? 0,
            cirrusUncinusFallstreakLengthRatio: model.uncinusFallstreakLengthRatio ?? 0,
            cirrusUncinusMeanFallstreakVerticalDrop: model.uncinusMeanFallstreakVerticalDrop ?? 0,
            cirrusFibratusPrimaryFibreCount:
                model.fibratusPrimaryFibreCount ?? 0,
            cirrusFibratusSecondaryFibreCount:
                model.fibratusSecondaryFibreCount ?? 0,
            cirrusFibratusSweptC2Count:
                model.fibratusSweptC2Count ?? 0,
            cirrusFibratusLegacyCapsuleCount:
                model.fibratusLegacyCapsuleCount ?? 0,
            cirrusFibratusMeanTerminalRadiusRatio:
                model.fibratusMeanTerminalRadiusRatio ?? 0,
            cirrusFibratusHeadingSpread:
                model.fibratusHeadingSpread ?? 0,
            cirrusFibratusLengthCoefficientVariation:
                model.fibratusLengthCoefficientVariation ?? 0,
            cirrusFibratusMeanExcessCurvature:
                model.fibratusMeanExcessCurvature ?? 0,
            cirrusFibratusSourceAltitudeSpread:
                model.fibratusSourceAltitudeSpread ?? 0,
            cirrusFibratusSourceDepthSpread:
                model.fibratusSourceDepthSpread ?? 0,
            cirrusFibratusAnatomyId:
                model.fibratusAnatomyId ?? null,
            cirrusFibratusSourceClusterCount:
                model.fibratusSourceClusterCount ?? 0,
            cirrusFibratusSplitSourceCount:
                model.fibratusSplitSourceCount ?? 0,
            cellularClusterCount: model.cellClusterCount ?? 0,
            cellularSourceConnectedSweepCount:
                model.cellularTopology?.sourceConnectedSweepCount ?? 0,
            cellularTerminalEllipsoidCount:
                model.cellularTopology?.terminalEllipsoidCount ?? 0,
            cellularTerminalCapsuleCount:
                model.cellularTopology?.terminalCapsuleCount ?? 0,
            cellularNaturalNeighborEdgeCount:
                model.cellularTopology?.naturalNeighborEdgeCount ?? 0,
            cellularNaturalNeighborCycleRank:
                model.cellularTopology?.naturalNeighborCycleRank ?? 0,
            cellularMaterialEdgeCount:
                model.cellularTopology?.materialEdgeCount ?? 0,
            cellularClearSlotCount:
                model.cellularTopology?.clearSlotCount ?? 0,
            cellularScale2PeakSurvival:
                model.cellularTopology?.scale2PeakSurvival ?? 0,
            cellularScale4PeakSurvival:
                model.cellularTopology?.scale4PeakSurvival ?? 0,
            cellularMeanCenterlineExcessCurvature:
                model.cellularTopology?.meanCenterlineExcessCurvature ?? 0,
            cellularMinimumVerticalScale:
                model.cellularTopology?.verticalScaleRange?.[0] ?? 0,
            cellularMaximumVerticalScale:
                model.cellularTopology?.verticalScaleRange?.[1] ?? 0,
            cirrostratusSurfaceModeCount:
                model.sheetSurfaceModeCount ?? 0,
            cirrostratusThicknessModeCount:
                model.sheetThicknessModeCount ?? 0,
            cirrostratusEmbeddedFibreBundleCount:
                model.embeddedFibreBundleCount ?? 0,
            cirrostratusFibreAltitudeSpread:
                model.fibreAltitudeSpread ?? 0,
            stratiformisResolvedCellCount:
                model.stratiformisResolvedCellCount ?? 0,
            stratiformisNaturalNeighborEdgeCount:
                model.stratiformisNaturalNeighborEdgeCount ?? 0,
            stratiformisNaturalNeighborCycleRank:
                model.stratiformisNaturalNeighborCycleRank ?? 0,
            stratiformisMaterialEdgeCount:
                model.stratiformisMaterialEdgeCount ?? 0,
            stratiformisMaterialCycleRank:
                model.stratiformisMaterialCycleRank ?? 0,
            stratiformisClearChannelCount:
                model.stratiformisClearChannelCount ?? 0,
            stratiformisColdPoolCavityCount:
                model.stratiformisColdPoolCavityCount ?? 0,
            stratiformisCirculationCellSurfaceCount:
                model.stratiformisCirculationCellSurfaceCount ?? 0,
            stratiformisCirculationRibbonSurfaceCount:
                model.stratiformisCirculationRibbonSurfaceCount ?? 0,
            stratiformisOpenWallArcCount:
                model.stratiformisOpenWallArcCount ?? 0,
            stratiformisStreetCorridorCount:
                model.stratiformisStreetCorridorCount ?? 0,
            stratiformisClosedCellPatchCount:
                model.stratiformisClosedCellPatchCount ?? 0,
            stratiformisLegacyEllipsoidCount:
                model.stratiformisLegacyEllipsoidCount ?? 0,
            stratiformisLegacyCapsuleCount:
                model.stratiformisLegacyCapsuleCount ?? 0,
            stratiformisMinimumInteriorClearance:
                model.stratiformisMinimumInteriorClearance ?? 0,
            stratiformisMaximumUndersideAmplitude:
                model.stratiformisMaximumUndersideAmplitude ?? 0,
            stratiformisScale2ResolvedCellCount:
                model.stratiformisScale2ResolvedCellCount ?? 0,
            stratiformisScale4ResolvedCellCount:
                model.stratiformisScale4ResolvedCellCount ?? 0,
            stratiformisExteriorEdgeNoise:
                model.stratiformisExteriorEdgeNoise ?? 0,
            stratiformisExteriorWarpStrength:
                model.stratiformisExteriorWarpStrength ?? 0,
            thermalBranchSpread: model.branchSpread ?? 0,
            cumulusNestedPulseCount: model.cumulusNestedPulseCount ?? 0,
            cumulusCuspCount: model.cumulusCuspCount ?? 0,
            cumulusCrownBranchCount: model.cumulusCrownBranchCount ?? 0,
            cumulusCrownLineageAnchorCount:
                model.cumulusCrownLineageAnchorCount ?? 0,
            cumulusCrownMaximumSharedJunctionChildren:
                model.cumulusCrownMaximumSharedJunctionChildren ?? 0,
            cumulusThermalChainCount: model.cumulusThermalChainCount ?? 0,
            cumulusDissipatingShoulderCount:
                model.cumulusDissipatingShoulderCount ?? 0,
            cumulusAuthoredResolvedThermalHeadCount:
                model.cumulusAuthoredResolvedThermalHeadCount ?? 0,
            cumulusAuthoredCommunicatingNeckCount:
                model.cumulusAuthoredCommunicatingNeckCount ?? 0,
            cumulusHardProtectedThermalHeadCount:
                model.cumulusHardProtectedThermalHeadCount ?? 0,
            cumulusHardProtectedJunctionCount:
                model.cumulusHardProtectedJunctionCount ?? 0,
            cumulusCrownTopHeightVariation:
                model.cumulusCrownTopHeightVariation ?? 0,
            cumulusDominantTrajectoryDrift: model.cumulusDominantTrajectoryDrift ?? 0,
            cumulusTowerWidthVariation: model.cumulusTowerWidthVariation ?? 0,
            cumulusThermalEventSpacingVariation:
                model.cumulusThermalEventSpacingVariation ?? 0,
            cumulusMeanThermalVerticalAspect:
                model.cumulusMeanThermalVerticalAspect ?? 0,
            cumulusAuthoredMinimumBudRadiusCanonical:
                model.cumulusAuthoredMinimumBudRadiusCanonical ?? 0,
            cumulusAuthoredMaximumBudRadiusCanonical:
                model.cumulusAuthoredMaximumBudRadiusCanonical ?? 0,
            cumulusAuthoredMinimumNeckRadiusCanonical:
                model.cumulusAuthoredMinimumNeckRadiusCanonical ?? 0,
            cumulusAuthoredMaximumCleftDepthCanonical:
                model.cumulusAuthoredMaximumCleftDepthCanonical ?? 0,
            cumulonimbusCalvusBridgeCount: model.calvusBridgeCount ?? 0,
            cumulonimbusCrownTrajectoryCount: model.crownTrajectoryCount ?? 0,
            cumulonimbusAnvilTrajectoryCount: model.anvilTrajectoryCount ?? 0,
            cumulonimbusRemnantTrajectoryCount: model.remnantTrajectoryCount ?? 0,
            cumulonimbusLegacyEllipsoidCapCount: model.legacyEllipsoidCapCount ?? 0,
            cumulonimbusLegacyEllipsoidPlateCount: model.legacyEllipsoidPlateCount ?? 0,
            ...(config.genus === "cumulonimbus" ? {
                cumulonimbusFeederTrajectoryCount: model.feederTrajectoryCount ?? 0,
                cumulonimbusMergedUpdraftTrajectoryCount: model.mergedUpdraftTrajectoryCount ?? 0,
                cumulonimbusGlaciationTransitionCount: model.glaciationTransitionCount ?? 0,
                cumulonimbusAnvilBranchDepth: model.anvilBranchDepth ?? 0,
                cumulonimbusAnvilDownwindUpwindRatio: model.anvilAsymmetry ?? 0,
                cumulonimbusOvershootTrajectoryCount: model.overshootTrajectoryCount ?? 0,
                cumulonimbusPrecipitationTrajectoryCount: model.precipitationTrajectoryCount ?? 0,
                cumulonimbusDowndraftTrajectoryCount: model.downdraftTrajectoryCount ?? 0,
                cumulonimbusTopologyNodeCount: model.topologyNodeCount ?? 0,
                cumulonimbusTopologyEdgeCount: model.topologyEdgeCount ?? 0,
                cumulonimbusSourceConnectedTrajectoryCount: model.sourceConnectedTrajectoryCount ?? 0,
                cumulonimbusTrajectoryCount: model.trajectoryCount ?? 0,
                cumulonimbusMinimumAttachmentRadiusVoxels: model.minimumAttachmentRadiusVoxels ?? 0,
                cumulonimbusTrajectoryRadiusCoefficientOfVariation:
                    model.trajectoryRadiusCoefficientOfVariation ?? 0,
                cumulonimbusUniqueTrajectoryDirectionFraction:
                    model.uniqueTrajectoryDirectionFraction ?? 0,
                cumulonimbusMinimumPrecipitationCoreSeparation:
                    model.minimumPrecipitationCoreSeparation ?? 0,
            } : {}),
            ...(foundationProfile ? {
                foundationPhysicalElementToFormationRatio:
                    foundationProfile.physicalElementToFormationRatio,
                foundationCanonicalElementFraction:
                    foundationProfile.canonicalElementFraction,
                foundationDensityChecksum: sha256(density),
                foundationOccupancyChecksum: sha256(occupied),
            } : {}),
        };
        qualifyAperiodicReconstructibleFamily(config, statistics, resolution);
        const policy = config.topologyPolicy ?? "single-connected";
        if (
            (policy === "single-connected" || policy === "roll-tube" || policy === "continuous-sheet") &&
            statistics.largestComponentFraction < (config.dissipating ? 0.42 : 0.86)
        ) {
            throw new Error(
                `${config.id} violates ${policy}: largest component is ` +
                `${statistics.largestComponentFraction}; components=` +
                JSON.stringify(statistics.dominantComponentBounds.slice(0, 5)),
            );
        }
        if (
            (policy === "fragmented-population" || policy === "cellular-colony") &&
            statistics.connectedComponentCount < 2
        ) {
            throw new Error(`${config.id} must retain multiple physical components`);
        }
        if (policy === "irregular-patch") {
            const materialComponents = statistics.dominantComponentFractions
                .filter((fraction) => fraction >= 0.004);
            if (materialComponents.length < 1 || materialComponents.length > 3 ||
                materialComponents[0] < 0.75) {
                throw new Error(
                    `${config.id} irregular-patch requires one-to-three ` +
                    `material components; fractions=${JSON.stringify(materialComponents)}`,
                );
            }
        }
        const occupancyMinimum = config.builder === "ice-streamer"
            ? 0.0004
            : config.level === "high"
                ? 0.0008
                : 0.0015;
        if (statistics.occupancyFraction < occupancyMinimum || statistics.occupancyFraction > 0.46) {
            throw new Error(`${config.id} occupancy ${statistics.occupancyFraction} is outside production bounds`);
        }
        volumeEntries.push({
            id: config.id,
            label: config.label,
            classification: {
                genus: config.genus,
                species: config.species,
                morphologyVariant: config.morphologyVariant ?? null,
                supplementaryFeature: config.supplementaryFeature ?? null,
                speciesAliases: config.speciesAliases ?? [],
                lifecycle: config.lifecycle,
            },
            formation: {
                mechanism: config.formationMechanism ?? (config.storm ? "deep-convective-detrainment" : "parcel-thermal-tree"),
                materialModel: config.materialModel ?? (config.storm ? "deep-mixed-phase" : "liquid-convective"),
                topologyPolicy: policy,
                boundaryModel: model.boundaryModel ??
                    (config.builder === "sheet" ? "curved-frontal-swath" :
                        config.builder === "wave-lens" ? "asymmetric-wave-condensation" :
                            config.builder === "roll" ? "soliton-envelope" :
                                config.builder === "ice-streamer" ? "sheared-fiber-bundles" :
                                    "domain-warped-formation-primitives"),
                ...(config.scOrganizationRegime ? {
                    stratocumulusOrganization: {
                        regime: config.scOrganizationRegime,
                        placement: config.scPlacementRegime,
                        supportConstruction: "generated-material-manifold",
                        postDensityMaskWeight: 0,
                    },
                } : {}),
                protectedConnectedCore: !config.dissipating &&
                    (config.species === "congestus" || config.genus === "cumulonimbus")
                    ? {
                        material: "lower-liquid-updraft",
                        roles: config.species === "congestus"
                            ? ["root", "thermal-mass"]
                            : ["root", "thermal-mass", "feeder-thermal", "thermal-junction"],
                        ...(config.species === "congestus" ? {
                            authoredSelection:
                                "source roots plus first dominant thermal head; communicating necks entrain",
                        } : {}),
                        maximumIceFraction: 0.42,
                    }
                    : null,
                ...(model.deepConvectionProfile
                    ? { deepConvection: model.deepConvectionProfile }
                    : {}),
                ...(model.cellularTopology
                    ? { cellularTopology: model.cellularTopology }
                    : {}),
                ...(foundationProfile ? {
                    physicalFoundation: {
                        family: foundationProfile.family,
                        representation: foundationProfile.representation,
                        topologyVariantId: foundationProfile.topologyVariantId,
                        connectivity: foundationProfile.connectivity,
                        mechanism: foundationProfile.mechanism,
                        elementKind: foundationProfile.elementKind,
                        elementDiameterKm: foundationProfile.elementDiameterKm,
                        formationSpanKm: foundationProfile.formationSpanKm,
                        physicalElementToFormationRatio:
                            foundationProfile.physicalElementToFormationRatio,
                        canonicalElementFraction:
                            foundationProfile.canonicalElementFraction,
                        macroElementCount: foundationProfile.macroElementCount,
                        hierarchyLevels: foundationProfile.hierarchyLevels,
                        formationAspectRatio: foundationProfile.formationAspectRatio,
                        minimumSpacingVariation:
                            foundationProfile.minimumSpacingVariation,
                        maximumMirrorSimilarity:
                            foundationProfile.maximumMirrorSimilarity,
                    },
                } : {}),
            },
            index: volumeIndex,
            seed: volumeSeed,
            xOffset,
            yOffset,
            zOffset,
            sampleTransform: {
                scale: [
                    (resolution - 1) / atlasWidth,
                    (resolution - 1) / atlasHeight,
                    (resolution - 1) / atlasDepth,
                ],
                offset: [
                    (xOffset + 0.5) / atlasWidth,
                    (yOffset + 0.5) / atlasHeight,
                    (zOffset + 0.5) / atlasDepth,
                ],
            },
            majorantXOffset,
            majorantYOffset,
            majorantZOffset,
            majorantSampleTransform: {
                scale: [
                    (majorantGridSize - 1) / majorantWidth,
                    (majorantGridSize - 1) / majorantHeight,
                    (majorantGridSize - 1) / majorantDepth,
                ],
                offset: [
                    (majorantXOffset + 0.5) / majorantWidth,
                    (majorantYOffset + 0.5) / majorantHeight,
                    (majorantZOffset + 0.5) / majorantDepth,
                ],
            },
            exteriorBoundary,
            statistics,
        });
        if (foundationProfile) {
            foundationDensityFields.set(config.id, {
                density,
                occupied,
                genus: config.genus,
                builder: config.builder,
            });
        }
        // Atlas generation evaluates several 96^3 high-ice sources and their
        // coarse reductions in one process.  Release transient model/source
        // buffers eagerly when the generator is run with --expose-gc (the
        // checked-in asset itself is unaffected); this keeps deterministic
        // regeneration possible on constrained CI workers.
        if (typeof globalThis.gc === "function") globalThis.gc();
    }

    // Pack only after every owner has been authored so each slot is populated
    // from the exact source array used by its reduction path.  The helper
    // leaves all tile guards and unused tail slots at their initialized zero
    // value, which is the required linear-filter isolation contract.
    const packedHighIceSourceAtlas = packCloudHighIceSourceAtlas({
        sourceFields: highIceSourceFields,
        sourceIds: CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS,
        sourceResolution: highIceSourceAtlasResolution,
        guardVoxels: CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
    });
    const highIceSourceAtlas = packedHighIceSourceAtlas.atlas;

    const compareFoundationFields = (left, right) => {
        let intersection = 0;
        let union = 0;
        let absoluteDensityDifference = 0;
        for (let index = 0; index < left.density.length; index += 1) {
            const occupiedLeft = left.occupied[index] > 0;
            const occupiedRight = right.occupied[index] > 0;
            if (occupiedLeft && occupiedRight) intersection += 1;
            if (occupiedLeft || occupiedRight) union += 1;
            absoluteDensityDifference += Math.abs(
                left.density[index] - right.density[index],
            );
        }
        return {
            voxelJaccard: intersection / Math.max(1, union),
            meanAbsoluteDensityDifference:
                absoluteDensityDifference / left.density.length / 255,
        };
    };
    for (const volume of volumeEntries) {
        const field = foundationDensityFields.get(volume.id);
        if (!field) continue;
        const comparisons = [...foundationDensityFields.entries()]
            .filter(([id]) => id !== volume.id)
            .map(([id, other]) => ({
                id,
                sameGenus: field.genus === other.genus,
                sameBuilder: field.builder === other.builder,
                ...compareFoundationFields(field, other),
            }));
        const nearest = [...comparisons].sort(
            (left, right) =>
                right.voxelJaccard - left.voxelJaccard ||
                left.meanAbsoluteDensityDifference -
                    right.meanAbsoluteDensityDifference,
        )[0];
        const sameGenus = comparisons.filter((comparison) => comparison.sameGenus);
        const nearestSameGenus = [...sameGenus].sort(
            (left, right) =>
                right.voxelJaccard - left.voxelJaccard ||
                left.meanAbsoluteDensityDifference -
                    right.meanAbsoluteDensityDifference,
        )[0] ?? null;
        volume.statistics.nearestFoundationVolumeId = nearest.id;
        volume.statistics.nearestFoundationVoxelJaccard =
            nearest.voxelJaccard;
        volume.statistics.nearestFoundationMeanAbsoluteDensityDifference =
            nearest.meanAbsoluteDensityDifference;
        volume.statistics.nearestSameGenusVolumeId =
            nearestSameGenus?.id ?? null;
        volume.statistics.nearestSameGenusVoxelJaccard =
            nearestSameGenus?.voxelJaccard ?? 0;
        volume.statistics.nearestSameGenusMeanAbsoluteDensityDifference =
            nearestSameGenus?.meanAbsoluteDensityDifference ?? 0;
    }

    const atlasFile = `cloud-macro-atlas-v${CLOUD_MACRO_ATLAS_VERSION}-rgba8-${resolution}.bin`;
    const majorantFile = `cloud-macro-majorants-v${CLOUD_MACRO_ATLAS_VERSION}-r8-${majorantGridSize}.bin`;
    const highIceMomentSidecarFile = resolution === 48
        ? CLOUD_HIGH_ICE_MOMENT_SIDECAR_FILE
        : `cloud-high-ice-moments-v${CLOUD_HIGH_ICE_MOMENT_SIDECAR_VERSION}-rg8-${resolution}.bin`;
    const highIceSourceAtlasFile = highIceSourceAtlasResolution ===
        CLOUD_HIGH_ICE_SOURCE_ATLAS_SOURCE_RESOLUTION
        ? CLOUD_HIGH_ICE_SOURCE_ATLAS_FILE
        : `cloud-high-ice-sources-v${CLOUD_HIGH_ICE_SOURCE_ATLAS_VERSION}-rgba8-${highIceSourceAtlasResolution}.bin`;
    const exteriorBoundary = {
        schema: CLOUD_EXTERIOR_BOUNDARY_SCHEMA,
        version: CLOUD_EXTERIOR_BOUNDARY_VERSION,
        densitySemantics: {
            atlasDensity: "authoritative-macro-condensate",
            exteriorDensity: "procedural-positive-condensate-permitted-where-atlas-density-is-zero",
            ceiling: "detail-class maximumExteriorDensity is a hard extinction-density ceiling",
        },
        detailClasses: CLOUD_EXTERIOR_DETAIL_CLASSES,
        classSelection: {
            inputs: ["detail-type channel G", "ice-fraction channel B"],
            orderedRules: [
                "ice-sedimentation when permitted and ice >= 0.62 and detail >= 0.60",
                "ice-fibre when permitted and (ice >= 0.56 or detail >= 0.72)",
                "liquid-scud when permitted and detail >= 0.40",
                "stratiform-ragged when permitted and 0.27 <= detail < 0.72",
                "liquid-turret when permitted and detail <= 0.34",
                "laminar-wave when permitted",
                "otherwise the first permitted class",
            ],
        },
        signedDistanceContract: {
            channel: "atlas.a",
            decode: `(sample * 255 - 128) / 127 * ${sdfRangeVoxels}`,
            unit: "source voxels",
            exteriorPredicate: "atlas.r == 0 and decodedSignedDistance >= 0",
            normal: "normalized central difference of decoded atlas.a in canonical voxel coordinates",
        },
        displacementContract: {
            equation: "class.maximumCanonicalDisplacement * (volumeResolution - 1) * length(normal * class.axisScale) * protectedBaseScale",
            visibleReach: "decodedSignedDistance <= displacement",
            majorantReach: "decodedSignedDistance <= maximum-axis displacement + interpolationHaloVoxels",
            interpolationHaloVoxels: Math.sqrt(3) * 0.5,
            protectedBaseScale: "for downward normals, mix downwardDisplacementScale to 1 across the declared base feather; otherwise 1",
            domainContinuation: "clamp the lookup coordinate to this volume's texel domain, add length(canonicalPosition - clamp(canonicalPosition, 0, 1)) * (volumeResolution - 1) to decoded signed distance, and use clamped G/B attributes",
            ownerBounds: "inflate visible owner bounds by visibleOwnerBoundsInflationCanonical and traversal bounds by traversalOwnerBoundsInflationCanonical before interval construction",
        },
        compositionContract: {
            order: [
                "sample RGBA even when R is zero",
                "decode signed distance and derive its normal",
                "select the volume-permitted exterior class from G and B",
                "evaluate interior and exterior density before local optical transport",
                "apply the same combined density in lighting and view transmittance paths",
            ],
            forbiddenEarlyExit: "Do not reject macroDensity == 0 before evaluating exterior support.",
        },
        storageGuards: {
            packedZPadding: "remains empty density with positive saturated signed distance",
            trilinearIsolation: "sampleTransform addresses texel centers and paddingZ prevents adjacent-volume bleed",
            exteriorFaceContinuation: "canonical coordinates outside the storage cube use explicit per-volume clamping and signed-distance continuation; never allow hardware filtering into an adjacent packed volume",
        },
        accelerationContract: {
            semantic: "conservative-potential-density-majorant",
            source: "max(authoritative density, exterior class density ceiling inside maximum displaced support)",
            brickHaloVoxels: 1,
            traversalRule: "a zero majorant is the only value that may skip both macro and exterior procedural density",
        },
    };
    const topologyExemplars = createTopologyExemplarCoverage(volumeEntries, {
        atlasWidth,
        atlasDepth,
        zStride,
        packingColumns,
    });
    const manifest = {
        schema: CLOUD_MACRO_ATLAS_SCHEMA,
        version: CLOUD_MACRO_ATLAS_VERSION,
        generatorVersion: CLOUD_MACRO_ATLAS_GENERATOR_VERSION,
        deterministicSeed: seed,
        coordinateSystem: {
            axes: { x: "crosswind", y: "altitude", z: "downwind" },
            handedness: "right-handed",
            localDomain: { minimum: [0, 0, 0], maximum: [1, 1, 1] },
        },
        offlineSourceReconstruction: {
            protectedVolumeIds: protectedCuReconstructionScale === 2
                ? CLOUD_PROTECTED_CU_RECONSTRUCTION_IDS
                : [],
            sourceScale: protectedCuReconstructionScale,
            sourceResolution: resolution * protectedCuReconstructionScale,
            reduction:
                "2x2x2 optical-mass mean with conservative positive support",
            signedDistance:
                "exact fine-support EDT reinitialized before conservative coarse resampling",
            fineSupportLossPolicy: "zero source voxels",
            runtimeStorage: "discarded; final atlas remains the fixed coarse ABI",
        },
        atlas: {
            url: `/assets/sky/${atlasFile}`,
            file: atlasFile,
            format: "rgba8unorm",
            dimensions: {
                width: atlasWidth,
                height: atlasHeight,
                depthOrArrayLayers: atlasDepth,
            },
            volumeResolution: resolution,
            volumeCount,
            zStride,
            paddingZ,
            packing: {
                kind: "xz-tiled-canonical-volumes",
                columns: packingColumns,
                rows: packingRows,
                xStride: zStride,
                zStride,
            },
            byteLength: atlas.byteLength,
            channels: {
                r: { semantic: "macro-density", decode: "unorm", description: "Authoritative coarse condensate support/density." },
                g: {
                    semantic: "detail-type",
                    decode: "unorm",
                    endpoints: ["billowy-liquid", "fibrous-wispy"],
                    anchors: {
                        billowyLiquid: 0.12,
                        laminarSheet: 0.34,
                        precipitationOrVirga: 0.68,
                        fibrousIce: 0.92,
                    },
                },
                b: { semantic: "ice-fraction", decode: "unorm", endpoints: ["liquid", "ice"] },
                a: {
                    semantic: "conservative-signed-distance",
                    decode: `(sample * 255 - 128) / 127 * ${sdfRangeVoxels}`,
                    unit: "voxels",
                    sign: "negative-inside",
                    rangeVoxels: sdfRangeVoxels,
                    conservatism: "magnitude is rounded toward zero after subtracting the voxel-cell circumradius",
                },
            },
        },
        majorants: {
            url: `/assets/sky/${majorantFile}`,
            file: majorantFile,
            format: "r8unorm",
            dimensions: {
                width: majorantWidth,
                height: majorantHeight,
                depthOrArrayLayers: majorantDepth,
            },
            brickSize,
            gridSize: majorantGridSize,
            byteLength: majorants.byteLength,
            semantic: "conservative-potential-density-majorant",
            filtering: "nearest",
            conservatism: "maximum of authoritative density and exterior detail-class ceiling over maximum axis-scaled displaced support plus a cell-circumradius interpolation halo, then a one-voxel brick sampling halo",
        },
        highIceMomentSidecar: {
            schema: CLOUD_HIGH_ICE_MOMENT_SIDECAR_SCHEMA,
            version: CLOUD_HIGH_ICE_MOMENT_SIDECAR_VERSION,
            url: `/assets/sky/${highIceMomentSidecarFile}`,
            file: highIceMomentSidecarFile,
            format: "rg8unorm",
            dimensions: {
                width: atlasWidth,
                height: atlasHeight,
                depthOrArrayLayers: atlasDepth,
            },
            volumeResolution: resolution,
            volumeCount,
            zStride,
            paddingZ,
            packing: {
                kind: "xz-tiled-canonical-volumes",
                columns: packingColumns,
                rows: packingRows,
                xStride: zStride,
                zStride,
            },
            byteLength: highIceMomentSidecar.byteLength,
            sourceResolution: resolution * 2,
            sourceIds: CLOUD_HIGH_ICE_RECONSTRUCTION_IDS,
            filtering: "linear",
            alignment: "byte-for-byte volume ordinals, offsets, and guard voxels match atlas; guards are RG=0",
            channels: {
                r: {
                    semantic: "normalized-within-coarse-voxel-density-second-moment",
                    decode: "secondMoment = sample / 255; variance = max(secondMoment - coarseMeanDensity^2, 0)",
                    source: "d_i = mass-conditioned authored fine density byte / 255; secondMoment = (1/8) * sum(d_i^2)",
                    normalization: "source density is bounded to [0, 1], and E[d^2] is conditioned to [coarseMean^2, coarseMean] after the authoritative occupancy floor before RG8 quantization",
                },
                g: {
                    semantic: "fractional-source-support-coverage",
                    decode: "coverage = sample / 255",
                    source: "supportCount / 8 where sourceOccupied is the conditioned authored 96^3 positive-density mask",
                },
            },
            supportContract: "both channels are exactly zero outside final coarse support; no screen-space texture or noise is injected",
        },
        highIceSourceAtlas: {
            schema: CLOUD_HIGH_ICE_SOURCE_ATLAS_SCHEMA,
            version: CLOUD_HIGH_ICE_SOURCE_ATLAS_VERSION,
            url: `/assets/sky/${highIceSourceAtlasFile}`,
            file: highIceSourceAtlasFile,
            format: "rgba8unorm",
            dimensions: packedHighIceSourceAtlas.packing.dimensions,
            layout: packedHighIceSourceAtlas.packing.kind,
            filtering: "linear",
            guard: {
                voxels: CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
                value: 0,
                semantics:
                    "one clear texel on every face of every source tile; unused tail tiles are clear",
                filtering:
                    "linear samples outside canonical [0,1] are isolated by the zero guard before clamping",
            },
            guardVoxels: CLOUD_HIGH_ICE_SOURCE_ATLAS_GUARD_VOXELS,
            sourceResolution: highIceSourceAtlasResolution,
            sourceCount: CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS.length,
            sourceIds: CLOUD_HIGH_ICE_SOURCE_ATLAS_IDS,
            sourceIdToSlot: packedHighIceSourceAtlas.sourceIdToSlot,
            slots: packedHighIceSourceAtlas.slots,
            sourceChecksums: packedHighIceSourceAtlas.sourceChecksums,
            packing: packedHighIceSourceAtlas.packing,
            byteLength: highIceSourceAtlas.byteLength,
            channels: {
                r: {
                    semantic: "authored-high-ice-source-density",
                    decode: "density = sample / 255",
                    source:
                        "the deterministic authored sourceDensity R8 field before 2x coarse reduction, block-mass-conditioned to the final authoritative coarse R byte",
                    range: [0, 1],
                },
                g: {
                    semantic: "coarse-source-support-coverage",
                    decode: "coverage = sample / 255",
                    source:
                        "the exact conditioned 48^3 highIceMoments.coverage byte replicated across each corresponding 2^3 fine child block",
                    range: [0, 1],
                },
                b: {
                    semantic: "conditioned-source-density-second-moment",
                    decode: "secondMoment = sample / 255",
                    source:
                        "E[(conditioned fine density / 255)^2] over the eight children, quantized once and replicated",
                    range: [0, 1],
                },
                a: {
                    semantic: "conditioned-fine-material-occupancy",
                    decode: "occupied = sample >= 0.5",
                    source:
                        "the final conditioned fine material support bit (255 iff conditioned R is positive), encoded per child",
                    range: [0, 1],
                },
            },
            supportSemantics: {
                field:
                    "each source is the authored high-ice condensate density on its complete fine lattice",
                positive:
                    "R is conditioned source density; G is parent support coverage; B is conditioned E[rho^2]; A is conditioned fine material occupancy (R > 0)",
                clear:
                    "R retains authored sub-threshold density bytes for clear fine children while their final coarse parent is supported, then conditions block mass exactly to the authoritative coarse R; sidecar moments use these same conditioned bytes",
                guard:
                    "guard and unused voxels are exactly zero in all four channels and are not source support",
                parent:
                    "RGBA are zero when the final reduced coarse parent is unsupported; supported parents retain G and B across all eight children",
                reconstruction:
                    "the 48^3 macro density and RG8 moments are independent reductions of the same authored source bytes; RGBA source blocks retain density, coverage, second moment, and occupancy in one sample",
            },
            alignment:
                "slot offsets and source IDs are deterministic; source tile bytes are copied row-major as z,y,x",
        },
        occupancy: {
            densityByteThreshold: occupancyThreshold,
            connectivity: "six-neighbor",
        },
        topologyExemplars,
        organizationManifolds:
            createStratocumulusOrganizationManifolds(volumeEntries),
        exteriorBoundary,
        volumes: volumeEntries,
        checksums: {
            algorithm: "SHA-256",
            atlas: sha256(atlas),
            majorants: sha256(majorants),
            highIceMomentSidecar: sha256(highIceMomentSidecar),
            highIceSourceAtlas: sha256(highIceSourceAtlas),
            exteriorBoundary: createCloudExteriorBoundaryChecksum(
                exteriorBoundary,
                volumeEntries,
            ),
        },
        provenance: {
            license: "original-project-asset",
            method: "deterministic formation-manifold volumes with 2x conservative protected-Cu source reconstruction: hierarchical thermal trees, reconstructible sedimenting ice trajectories, finite multi-lobed cellular colonies, harmonic inversion/frontal boundaries with dry-air intrusions, wave lenses, roll circulation, and fragmented boundary-layer shreds",
            references: [
                "https://www.guerrilla-games.com/read/nubis-cubed",
                "https://research.nvidia.com/labs/prl/publication/nanovdb/",
                "https://www.sidefx.com/docs/houdini/nodes/sop/vdbfromparticles.html",
                "https://www.met.reading.ac.uk/~swrhgnrj/publications/fractal_ci.pdf",
                "https://research.google/pubs/simulation-of-cloud-dynamics-on-graphics-hardware/",
                "https://cloudatlas.wmo.int/en/clouds-genera.html",
                "https://cloudatlas.wmo.int/en/species-cumulus-congestus-cu-con.html",
                "https://cloudatlas.wmo.int/species-cumulonimbus-capillatus-cb-cap.html",
                "https://cloudatlas.wmo.int/en/clouds-species-uncinus.html",
                "https://cloudatlas.wmo.int/en/species-altocumulus-stratiformis-ac-str.html",
            ],
        },
    };
    return {
        atlas,
        majorants,
        highIceMomentSidecar,
        // Alias retained for callers that prefer the descriptive asset name.
        highIceMoments: highIceMomentSidecar,
        highIceSourceAtlas,
        // Alias retained for callers that use the shorter source name.
        highIceSources: highIceSourceAtlas,
        manifest,
    };
};

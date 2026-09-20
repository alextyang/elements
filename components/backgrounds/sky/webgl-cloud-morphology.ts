import type {
    CloudGenus,
    CloudLayerState,
    CloudMorphologyControls,
    CloudOrganization,
    CloudScene,
} from "./cloud-scene";
import {
    CLOUD_RENDERER_RECIPES,
    CLOUD_TOPOLOGY_EXEMPLARS,
    type CloudMacroTopology,
    type CloudMaterialModel,
} from "./cloud-state-map";

export const WEBGL_CLOUD_MACRO_TOPOLOGY_CODE: Record<CloudMacroTopology, number> = {
    "ice-streamer-field": 1,
    "layered-veil": 2,
    "cellular-cloudlet-field": 3,
    "wave-lens-train": 4,
    "castellated-deck": 5,
    "floccus-field": 6,
    "precipitating-sheet": 7,
    "boundary-layer-sheet": 8,
    "fragment-field": 9,
    "thermal-field": 10,
    "deep-storm-complex": 11,
    "roll-tube": 12,
};

export const WEBGL_CLOUD_MATERIAL_MODEL_CODE: Record<CloudMaterialModel, number> = {
    "fibrous-ice": 1,
    "granular-ice": 2,
    "mixed-phase-cellular": 3,
    "liquid-cellular": 4,
    "mixed-phase-sheet": 5,
    "liquid-sheet": 6,
    "liquid-convective": 7,
    "deep-mixed-phase": 8,
};

const GENERIC_TOPOLOGY: Record<Exclude<CloudGenus, "clear">, CloudMacroTopology> = {
    cirrus: "ice-streamer-field",
    cirrocumulus: "cellular-cloudlet-field",
    cirrostratus: "layered-veil",
    altocumulus: "cellular-cloudlet-field",
    altostratus: "layered-veil",
    nimbostratus: "precipitating-sheet",
    stratocumulus: "cellular-cloudlet-field",
    stratus: "boundary-layer-sheet",
    cumulus: "thermal-field",
    cumulonimbus: "deep-storm-complex",
};

const GENERIC_MATERIAL: Record<Exclude<CloudGenus, "clear">, CloudMaterialModel> = {
    cirrus: "fibrous-ice",
    cirrocumulus: "granular-ice",
    cirrostratus: "fibrous-ice",
    altocumulus: "mixed-phase-cellular",
    altostratus: "mixed-phase-sheet",
    nimbostratus: "mixed-phase-sheet",
    stratocumulus: "liquid-cellular",
    stratus: "liquid-sheet",
    cumulus: "liquid-convective",
    cumulonimbus: "deep-mixed-phase",
};

const ORGANIZATION_ANISOTROPY: Record<CloudOrganization, number> = {
    unorganized: 1,
    isolated: 1.15,
    streets: 4.8,
    "open-cell": 1.3,
    "closed-cell": 1.15,
    frontal: 6.2,
    banded: 5.4,
};

const TOPOLOGY_DEFAULTS: Record<CloudMacroTopology, {
    baseConnectivity: number;
    crownExpansion: number;
    fragmentation: number;
    fibreCurl: number;
    waveAmplitude: number;
}> = {
    "ice-streamer-field": { baseConnectivity: 0.08, crownExpansion: 0.05, fragmentation: 0.72, fibreCurl: 0.82, waveAmplitude: 0.12 },
    "layered-veil": { baseConnectivity: 0.98, crownExpansion: 0.01, fragmentation: 0.04, fibreCurl: 0.38, waveAmplitude: 0.18 },
    "cellular-cloudlet-field": { baseConnectivity: 0.58, crownExpansion: 0.14, fragmentation: 0.30, fibreCurl: 0.22, waveAmplitude: 0.16 },
    "wave-lens-train": { baseConnectivity: 0.42, crownExpansion: 0.02, fragmentation: 0.16, fibreCurl: 0.08, waveAmplitude: 0.88 },
    "castellated-deck": { baseConnectivity: 0.78, crownExpansion: 0.36, fragmentation: 0.24, fibreCurl: 0.20, waveAmplitude: 0.18 },
    "floccus-field": { baseConnectivity: 0.12, crownExpansion: 0.44, fragmentation: 0.78, fibreCurl: 0.38, waveAmplitude: 0.08 },
    "precipitating-sheet": { baseConnectivity: 1, crownExpansion: 0.01, fragmentation: 0.03, fibreCurl: 0.18, waveAmplitude: 0.22 },
    "boundary-layer-sheet": { baseConnectivity: 1, crownExpansion: 0.01, fragmentation: 0.08, fibreCurl: 0.12, waveAmplitude: 0.26 },
    "fragment-field": { baseConnectivity: 0.10, crownExpansion: 0.24, fragmentation: 0.94, fibreCurl: 0.58, waveAmplitude: 0.08 },
    "thermal-field": { baseConnectivity: 0.88, crownExpansion: 0.58, fragmentation: 0.16, fibreCurl: 0.34, waveAmplitude: 0.06 },
    "deep-storm-complex": { baseConnectivity: 0.96, crownExpansion: 0.92, fragmentation: 0.10, fibreCurl: 0.52, waveAmplitude: 0.12 },
    "roll-tube": { baseConnectivity: 0.72, crownExpansion: 0.04, fragmentation: 0.12, fibreCurl: 0.18, waveAmplitude: 1 },
};

const midpoint = (range: readonly [number, number]) =>
    (range[0] + range[1]) * 0.5;
const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));
const override = (
    controls: CloudMorphologyControls | undefined,
    key: keyof CloudMorphologyControls,
    fallback: number,
    low: number,
    high: number,
) => clamp(controls?.[key] ?? fallback, low, high);

const stableExemplarOrdinal = (
    scene: CloudScene,
    layerIndex: number,
    count: number,
) => {
    const seed = scene.seed;
    const mixed = Math.abs(
        seed[0] * 1_000_003 + seed[1] * 100_019 +
        seed[2] * 10_007 + seed[3] * 1_009 + layerIndex * 97,
    );
    return Math.floor(mixed * 65_521) % count;
};

export interface WebGlCloudMorphologyProfile {
    topology: CloudMacroTopology;
    material: CloudMaterialModel;
    elementScaleKm: number;
    verticalAspect: number;
    supportBand: number;
    erosionStrength: number;
    lineageDepth: number;
    macroElementCount: number;
    branchOrCrestCount: number;
    shearCoupling: number;
    sedimentationCoupling: number;
    cellularClosure: number;
    anisotropy: number;
    baseConnectivity: number;
    crownExpansion: number;
    fragmentation: number;
    fibreCurl: number;
    waveAmplitude: number;
}

export const compileWebGlCloudMorphology = (
    scene: CloudScene,
    layer: CloudLayerState,
    layerIndex: number,
): WebGlCloudMorphologyProfile => {
    const explicit = layer.species === "generic"
        ? undefined
        : CLOUD_RENDERER_RECIPES[layer.species];
    const genus = layer.genus === "clear" ? "stratus" : layer.genus;
    const topology = explicit?.macroTopology ?? GENERIC_TOPOLOGY[genus];
    const material = explicit?.materialModel ?? GENERIC_MATERIAL[genus];
    const exemplars = layer.species === "generic"
        ? undefined
        : CLOUD_TOPOLOGY_EXEMPLARS[layer.species];
    const exemplar = exemplars?.[
        stableExemplarOrdinal(scene, layerIndex, exemplars.length)
    ];
    const construction = exemplar?.construction;
    const defaults = TOPOLOGY_DEFAULTS[topology];
    const controls = layer.morphology;
    const elementScaleKm = explicit ? midpoint(explicit.elementScaleKm) :
        Math.max(0.08, layer.thickness * 0.001 *
            (topology === "layered-veil" || topology === "precipitating-sheet"
                ? 18 : 0.9));
    const verticalAspect = explicit ? midpoint(explicit.verticalAspect) :
        clamp(layer.thickness * 0.001 / elementScaleKm, 0.002, 5);
    const supportBand = explicit ? midpoint(explicit.boundarySupport) :
        topology === "layered-veil" || topology === "boundary-layer-sheet"
            ? 0.12 : 0.42;

    return {
        topology,
        material,
        elementScaleKm: override(controls, "elementScaleKm", elementScaleKm, 0.05, 300),
        verticalAspect: override(controls, "verticalAspect", verticalAspect, 0.002, 5),
        supportBand: override(controls, "supportBand", supportBand, 0.02, 0.8),
        erosionStrength: override(controls, "erosionStrength", layer.detailStrength, 0, 1),
        lineageDepth: override(controls, "lineageDepth", construction ? midpoint(construction.lineageDepth) : 3, 1, 16),
        macroElementCount: override(controls, "macroElementCount", construction ? midpoint(construction.macroElementCount) : 12, 1, 128),
        branchOrCrestCount: override(controls, "branchOrCrestCount", construction ? midpoint(construction.branchOrCrestCount) : 3, 0, 24),
        shearCoupling: override(controls, "shearCoupling", construction ? midpoint(construction.shearCoupling) : layer.shear, 0, 1),
        sedimentationCoupling: override(controls, "sedimentationCoupling", construction ? midpoint(construction.sedimentationCoupling) : layer.precipitation, 0, 1),
        cellularClosure: override(controls, "cellularClosure",
            layer.organization === "closed-cell" ? 0.76 :
                layer.organization === "open-cell" ? -0.76 :
                    construction ? midpoint(construction.cellularClosure) : 0,
            -1, 1),
        anisotropy: override(controls, "anisotropy", ORGANIZATION_ANISOTROPY[layer.organization], 0.1, 12),
        baseConnectivity: override(controls, "baseConnectivity", defaults.baseConnectivity, 0, 1),
        crownExpansion: override(controls, "crownExpansion", defaults.crownExpansion, 0, 1),
        fragmentation: override(controls, "fragmentation", defaults.fragmentation, 0, 1),
        fibreCurl: override(controls, "fibreCurl", defaults.fibreCurl, 0, 1),
        waveAmplitude: override(controls, "waveAmplitude", defaults.waveAmplitude, 0, 1),
    };
};

export interface PackedWebGlCloudMorphology {
    topology: Float32Array;
    anatomy: Float32Array;
    dynamics: Float32Array;
    formation: Float32Array;
    microstructure: Float32Array;
    optics: Float32Array;
    lighting: Float32Array;
}

export const packWebGlCloudMorphology = (
    scene: CloudScene,
): PackedWebGlCloudMorphology => {
    const topology = new Float32Array(12);
    const anatomy = new Float32Array(12);
    const dynamics = new Float32Array(12);
    const formation = new Float32Array(12);
    const microstructure = new Float32Array(12);
    const optics = new Float32Array(12);
    const lighting = new Float32Array(12);
    scene.layers.forEach((layer, index) => {
        const offset = index * 4;
        const profile = compileWebGlCloudMorphology(scene, layer, index);
        topology.set([
            WEBGL_CLOUD_MACRO_TOPOLOGY_CODE[profile.topology],
            WEBGL_CLOUD_MATERIAL_MODEL_CODE[profile.material],
            profile.elementScaleKm,
            profile.verticalAspect,
        ], offset);
        anatomy.set([
            profile.supportBand,
            profile.erosionStrength,
            profile.lineageDepth,
            profile.macroElementCount,
        ], offset);
        dynamics.set([
            profile.branchOrCrestCount,
            profile.shearCoupling,
            profile.sedimentationCoupling,
            profile.cellularClosure,
        ], offset);
        formation.set([
            profile.anisotropy,
            profile.baseConnectivity,
            profile.crownExpansion,
            profile.fragmentation,
        ], offset);
        microstructure.set([
            profile.fibreCurl,
            profile.waveAmplitude,
            clamp(layer.optics?.powderStrength ?? 1, 0, 2),
            0,
        ], offset);
        optics.set([
            clamp(layer.optics?.singleScatteringAlbedo ??
                (0.999 - layer.iceFraction * 0.002), 0.8, 1),
            clamp(layer.optics?.liquidAsymmetry ?? 0.78, 0.35, 0.95),
            clamp(layer.optics?.iceAsymmetry ?? 0.66, 0.30, 0.92),
            clamp(layer.optics?.draineAlpha ?? 0.62, 0, 2),
        ], offset);
        lighting.set([
            clamp(layer.optics?.multipleScatteringExtinction ?? 0.34, 0.02, 1),
            clamp(layer.optics?.multipleScatteringStrength ?? 1, 0, 3),
            clamp(layer.optics?.skyFillStrength ?? 1, 0, 3),
            clamp(layer.optics?.groundFillStrength ?? 1, 0, 3),
        ], offset);
    });
    return {
        topology,
        anatomy,
        dynamics,
        formation,
        microstructure,
        optics,
        lighting,
    };
};

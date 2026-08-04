/**
 * Generated v2 macro-atlas occupancy profile used by CPU-only composition
 * qualification. Values are copied from
 * `public/assets/sky/cloud-macro-atlas-v2.json` statistics; they are not a
 * renderer input and never replace the atlas texture in production marching.
 */

export interface CloudAtlasMaterialProfile {
    occupancyFraction: number;
    projectedFootprintCompactness: number;
    largestComponentFraction: number;
    meanDensity: number;
    meanDensityPath: number;
}

const profile = (
    occupancyFraction: number,
    projectedFootprintCompactness: number,
    largestComponentFraction: number,
    meanDensity: number,
    meanDensityPath: number,
): CloudAtlasMaterialProfile => ({
    occupancyFraction,
    projectedFootprintCompactness,
    largestComponentFraction,
    meanDensity,
    meanDensityPath,
});

/** Statistics generated with the atlas v2 occupancy threshold (16/255). */
export const CLOUD_ATLAS_MATERIAL_PROFILES: Readonly<Record<string,
    CloudAtlasMaterialProfile>> = {
    "cirrus-fibratus": profile(0.005524812, 0.038192421, 0.204582652, 0.326947145, 0.01871396),
    "cirrus-uncinus": profile(0.00523546, 0.096271105, 0.582037997, 0.248128958, 0.017144952),
    "cirrus-spissatus": profile(0.040247034, 0.088090336, 0.41002022, 0.485048083, 0.075526887),
    "cirrus-floccus": profile(0.01035337, 0.055090968, 0.213100437, 0.288045209, 0.024931911),
    "cirrus-castellanus": profile(0.012170862, 0.380106748, 1, 0.37649681, 0.057689178),
    "cirrostratus-fibratus": profile(0.045129847, 0.371591507, 1, 0.280457766, 0.083252444),
    "cirrostratus-nebulosus": profile(0.040455006, 0.347730139, 1, 0.30214836, 0.09853531),
    "cirrocumulus-stratiformis": profile(0.012740524, 0.031577022, 0.273243435, 0.243243018, 0.031652833),
    "cirrocumulus-castellanus": profile(0.026783131, 0.109307262, 1, 0.387946671, 0.059566519),
    "cirrocumulus-floccus": profile(0.008870443, 0.051407463, 0.139653415, 0.228630249, 0.019535612),
    "cirrocumulus-lenticularis": profile(0.00773112, 0.25387737, 0.709941521, 0.284591217, 0.039179747),
    "altocumulus-stratiformis": profile(0.004367405, 0.037290636, 0.298136645, 0.450168474, 0.035450332),
    "altocumulus-castellanus": profile(0.010407624, 0.171021611, 1, 0.612435904, 0.057815677),
    "altocumulus-floccus": profile(0.003038194, 0.076448306, 0.288690476, 0.385924369, 0.0246678),
    "altocumulus-lenticularis": profile(0.014765987, 0.544694426, 1, 0.634811427, 0.127561215),
    "altocumulus-volutus": profile(0.006293403, 0.224658298, 1, 0.564401622, 0.072496977),
    "altostratus-opacus": profile(0.103497541, 0.336926326, 1, 0.672482552, 0.297732256),
    "altostratus-translucidus": profile(0.066134983, 0.278967728, 1, 0.338970655, 0.141101176),
    "nimbostratus-praecipitatio": profile(0.172110098, 0.268809714, 1, 0.743465254, 0.350021558),
    "stratocumulus-stratiformis": profile(0.010344329, 0.108489666, 1, 0.618648019, 0.114990672),
    "stratocumulus-castellanus": profile(0.013102214, 0.205544973, 1, 0.607280207, 0.073332782),
    "stratocumulus-floccus": profile(0.003499349, 0.113980685, 0.589147286, 0.437493033, 0.041963048),
    "stratocumulus-lenticularis": profile(0.005542896, 0.349356617, 1, 0.505811982, 0.082806665),
    "stratocumulus-volutus": profile(0.015308521, 0.332165545, 1, 0.766042412, 0.149978677),
    "stratus-nebulosus": profile(0.39026331, 0.265432835, 1, 0.652223009, 0.414189363),
    "stratus-fractus": profile(0.00418656, 0.038298804, 0.254859611, 0.197357388, 0.012870886),
    "cumulus-fractus": profile(0.022316261, 0.063307221, 0.298622367, 0.48432167, 0.063876223),
    "cumulus-humilis": profile(0.007405598, 0.216141575, 1, 0.329569777, 0.043176219),
    "cumulus-mediocris": profile(0.024450231, 0.424245545, 1, 0.513802355, 0.112490282),
    "cumulus-congestus": profile(0.018599899, 0.382881605, 1, 0.478923237, 0.07434068),
    "cumulonimbus-calvus": profile(0.04900897, 0.541728928, 1, 0.830855944, 0.244025095),
    "cumulonimbus-capillatus": profile(0.048999928, 0.387244928, 1, 0.785619226, 0.214536572),
    "cumulonimbus-capillatus-incus": profile(0.053810402, 0.175146114, 1, 0.762533896, 0.160168151),
};

export const cloudAtlasMaterialProfileFor = (
    species: string | undefined,
): CloudAtlasMaterialProfile => CLOUD_ATLAS_MATERIAL_PROFILES[species ?? ""] ??
    profile(0.02, 0.2, 0.75, 0.5, 0.1);

/**
 * Convert generated atlas occupancy statistics into a conservative material
 * occupancy multiplier for the finite owner envelope. The multiplier uses
 * projected footprint, connected-core retention, and density-path support;
 * it is intentionally bounded and cannot create support outside geometry.
 */
export const cloudAtlasMaterialOccupancyFactorFor = (
    species: string | undefined,
) => {
    const material = cloudAtlasMaterialProfileFor(species);
    const footprint = Math.min(1, material.projectedFootprintCompactness / 0.35);
    const path = Math.min(1, material.meanDensityPath / 0.25);
    const core = Math.min(1, material.largestComponentFraction);
    return Math.min(1, Math.max(0.42,
        0.54 + 0.26 * footprint + 0.14 * path + 0.06 * core));
};

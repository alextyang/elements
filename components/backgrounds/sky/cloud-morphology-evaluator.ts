import type { CloudMorphologyRecord } from "./cloud-morphology-modifiers";

type Vec3 = readonly [number, number, number];

export interface CloudMorphologyReferenceEvaluation {
    basePositionKm: [number, number, number];
    placementPositionKm: [number, number, number];
    baseCoverage: number;
    placementWeight: number;
    additiveDensity: number;
    subtractiveDensity: number;
    reuseMacroCode: number;
    reuseWeight: number;
    targetOpticalDepth: number;
    opaqueArea: [number, number];
    directDiscTransmission: [number, number];
    opticalWeight: number;
    materialProfileCode: number;
    materialWeight: number;
}

const PI = Math.PI;
const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.max(minimum, Math.min(maximum, value));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (edge0: number, edge1: number, value: number) => {
    const t = clamp((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
};
const length2 = (x: number, y: number) => Math.hypot(x, y);
const maximum3 = (value: Vec3) => Math.max(value[0], value[1], value[2]);
const abs3 = (value: Vec3): [number, number, number] =>
    [Math.abs(value[0]), Math.abs(value[1]), Math.abs(value[2])];
const fract = (value: number) => value - Math.floor(value);

const hashCell = (x: number, y: number, z: number, seed: number) => {
    let value = seed >>> 0;
    value ^= Math.imul(x | 0, 0x9e3779b1);
    value ^= Math.imul(y | 0, 0x85ebca77);
    value ^= Math.imul(z | 0, 0xc2b2ae3d);
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x1_0000_0000;
};

const rotate2 = (x: number, y: number, angle: number): [number, number] => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return [cosine * x - sine * y, sine * x + cosine * y];
};

const localPosition = (record: CloudMorphologyRecord, world: Vec3): [number, number, number] => {
    const offset: [number, number, number] = [
        world[0] - record.centerKm[0],
        world[1] - record.centerKm[1],
        world[2] - record.centerKm[2],
    ];
    return record.axes.map((axis, index) => (
        (offset[0] * axis[0] + offset[1] * axis[1] + offset[2] * axis[2]) /
        Math.max(1e-5, record.halfExtentsKm[index])
    )) as [number, number, number];
};

const worldPosition = (record: CloudMorphologyRecord, local: Vec3): [number, number, number] => [
    record.centerKm[0] + record.axes[0][0] * local[0] * record.halfExtentsKm[0] +
        record.axes[1][0] * local[1] * record.halfExtentsKm[1] +
        record.axes[2][0] * local[2] * record.halfExtentsKm[2],
    record.centerKm[1] + record.axes[0][1] * local[0] * record.halfExtentsKm[0] +
        record.axes[1][1] * local[1] * record.halfExtentsKm[1] +
        record.axes[2][1] * local[2] * record.halfExtentsKm[2],
    record.centerKm[2] + record.axes[0][2] * local[0] * record.halfExtentsKm[0] +
        record.axes[1][2] * local[1] * record.halfExtentsKm[1] +
        record.axes[2][2] * local[2] * record.halfExtentsKm[2],
];

const finiteEnvelope = (local: Vec3) =>
    1 - smoothstep(0.82, 1.04, maximum3(abs3(local)));
const softInside = (distance: number, feather = 0.08) =>
    1 - smoothstep(-feather, feather, distance);
const ellipsoid = (local: Vec3, radius: Vec3) => softInside(Math.hypot(
    local[0] / Math.max(1e-4, radius[0]),
    local[1] / Math.max(1e-4, radius[1]),
    local[2] / Math.max(1e-4, radius[2]),
) - 1);

const cellular = (local: Vec3, seed: number, frequency: number) => {
    const skewX = local[0] + local[2] * 0.347;
    const skewZ = local[2] - local[0] * 0.219;
    const cellX = Math.floor((skewX + 1.5) * frequency);
    const cellZ = Math.floor((skewZ + 1.5) * frequency);
    let nearest = 10;
    for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
            const x = cellX + dx;
            const z = cellZ + dz;
            const jitterX = hashCell(x, 0, z, seed) - 0.5;
            const jitterZ = hashCell(x, 1, z, seed) - 0.5;
            const pointX = (x + 0.5 + jitterX * 0.72) / frequency - 1.5;
            const pointZ = (z + 0.5 + jitterZ * 0.72) / frequency - 1.5;
            nearest = Math.min(nearest, length2(skewX - pointX, skewZ - pointZ) * frequency);
        }
    }
    return nearest;
};

export const createCloudMorphologyReferenceEvaluation = (
    worldPositionKm: Vec3,
): CloudMorphologyReferenceEvaluation => ({
    basePositionKm: [...worldPositionKm],
    placementPositionKm: [...worldPositionKm],
    baseCoverage: 1,
    placementWeight: 0,
    additiveDensity: 0,
    subtractiveDensity: 0,
    reuseMacroCode: 0,
    reuseWeight: 0,
    targetOpticalDepth: -1,
    opaqueArea: [0, 1],
    directDiscTransmission: [0, 1],
    opticalWeight: 0,
    materialProfileCode: 0,
    materialWeight: 0,
});

/**
 * Scalar reference for the WGSL evaluator. This deliberately locks topology,
 * units, channel ownership and composition semantics; it is not a CPU render
 * path. Inputs are the exact eight packed operator parameters.
 */
export function applyCloudMorphologyRecordReference(
    evaluation: CloudMorphologyReferenceEvaluation,
    record: CloudMorphologyRecord,
    worldPositionKm: Vec3,
) {
    const p = localPosition(record, worldPositionKm);
    const envelope = finiteEnvelope(p) * record.intensity;
    if (envelope <= 0) return evaluation;
    const a = record.shape0;
    const b = record.shape1;
    const seedPhase = hashCell(0, 0, 0, record.seed) * PI * 2;
    let density = 0;

    switch (record.operatorCode) {
        case 1: { // intortus: divergence-limited bend and torsion of a filament
            const curl = (position: Vec3) => {
                const warped: [number, number, number] = [...position];
                const phase = position[2] * a[2] * PI + seedPhase;
                const radial = Math.max(0, 1 - length2(position[0], position[1]));
                warped[0] -= Math.sin(phase) * a[0] * 0.22 * radial * a[3];
                warped[1] -= Math.cos(phase + a[1]) * Math.abs(a[1]) * 0.16 *
                    radial * a[3];
                return warped;
            };
            evaluation.basePositionKm = worldPosition(record,
                curl(localPosition(record, evaluation.basePositionKm)));
            evaluation.placementPositionKm = worldPosition(record,
                curl(localPosition(record, evaluation.placementPositionKm)));
            break;
        }
        case 2: { // vertebratus: connected spine plus uneven paired ribs
            const spine = softInside(length2(p[0], p[1]) - Math.max(0.025, a[0]), 0.025);
            const ribCell = Math.floor((p[2] + 1) * 8);
            const ribPhase = fract((p[2] + 1) * 8) - 0.5;
            const missing = hashCell(ribCell, 2, 0, record.seed) < a[3] ? 0 : 1;
            const asymmetry = mix(1 - b[0], 1 + b[0], hashCell(ribCell, 3, 0, record.seed));
            const rib = softInside(Math.abs(ribPhase) - 0.09, 0.035) *
                softInside(Math.abs(p[1]) - 0.08, 0.04) *
                softInside(Math.abs(p[0]) - a[1] * asymmetry, 0.06) * missing;
            density = Math.max(spine, rib * a[2]);
            break;
        }
        case 3: { // undulatus: nonstationary gravity-wave displacement
            const waveWarp = (position: Vec3) => {
                const warped: [number, number, number] = [...position];
                const drift = 1 + a[3] * position[2];
                const phase = (position[0] * PI * 2 * drift) + a[2] + seedPhase;
                const wave = Math.sin(phase) +
                    Math.sin(phase * 1.73 + position[2] * 2.1) * a[1];
                warped[1] -= wave * a[0] * (1 + b[0] * Math.sign(wave));
                return warped;
            };
            evaluation.basePositionKm = worldPosition(record,
                waveWarp(localPosition(record, evaluation.basePositionKm)));
            evaluation.placementPositionKm = worldPosition(record,
                waveWarp(localPosition(record, evaluation.placementPositionKm)));
            break;
        }
        case 4: { // radiatus: finite parallel world bands
            const crosswind = p[0] + p[2] * a[0];
            const coordinate = crosswind * (3.5 + a[2] * 3) + seedPhase / PI;
            const interval = Math.abs(fract(coordinate) - 0.5);
            const width = mix(0.16, 0.34, a[1]);
            const bands = 1 - smoothstep(width, width + 0.08, interval);
            const endErosion = 1 - smoothstep(1 - a[3], 1, Math.abs(p[2]));
            evaluation.baseCoverage *= mix(1, bands * endErosion, envelope);
            break;
        }
        case 5: { // lacunosus: real cellular through-holes
            const cell = cellular(p, record.seed, 3.2);
            const radius = mix(0.26, 0.43, a[1]);
            const hole = (1 - smoothstep(radius, radius + 0.1 + a[3], cell)) *
                softInside(Math.abs(p[1]) - a[0], 0.08);
            evaluation.subtractiveDensity = Math.max(evaluation.subtractiveDensity,
                hole * envelope);
            return evaluation;
        }
        case 6: { // duplicatus: independent offset base-density sample
            const angle = a[2];
            const [x, z] = rotate2(p[0] - a[1], p[2], -angle);
            const placed = [x, p[1] - a[0], z] as const;
            evaluation.placementPositionKm = worldPosition(record, placed);
            evaluation.placementWeight = Math.max(evaluation.placementWeight,
                envelope * (1 - b[0] * 0.5));
            break;
        }
        case 7: { // translucidus/opacus: path-integrated optical constraints
            evaluation.targetOpticalDepth = a[0];
            evaluation.opaqueArea = [a[1], a[2] > 0 ? a[2] : 1];
            evaluation.directDiscTransmission = [a[3], b[0] > 0 ? b[0] : 1];
            evaluation.opticalWeight = Math.max(evaluation.opticalWeight, envelope);
            break;
        }
        case 8: { // perlucidus: separated aperiodic condensate owners
            const cell = cellular(p, record.seed, 3.7);
            const radius = mix(0.3, 0.49, a[1]);
            const elements = 1 - smoothstep(radius, radius + 0.08 + a[2], cell);
            evaluation.baseCoverage *= mix(1, elements, envelope * (0.68 + a[0] * 0.32));
            break;
        }
        case 9: { // mamma: attached, unequal underside lobes
            const cell = cellular(p, record.seed, 3.3);
            const neck = softInside(Math.abs(p[1]) - a[0] * 0.24, 0.08);
            const descent = p[1] + 0.22 + cell * 0.22 * a[1];
            const lobe = ellipsoid([cell * 0.78, descent, p[2] * 0.12],
                [0.56, Math.max(0.16, a[2]), 0.7]);
            density = Math.max(neck * (1 - smoothstep(0.5, 0.9, cell)),
                lobe * (1 - b[0] * smoothstep(0.35, 1, -p[1])));
            break;
        }
        case 10: { // fluctus: finite Kelvin-Helmholtz overturning billows
            const cell = fract((p[0] + 1) * 3.5 + seedPhase / PI) - 0.5;
            const angle = cell * PI * 1.55 * a[1];
            const radius = 0.24 + 0.06 * Math.sin(seedPhase);
            const ring = Math.abs(length2(cell, p[1] - 0.12) - radius);
            const curl = softInside(ring - 0.075, 0.035) *
                softInside(Math.abs(p[2]) - 0.62, 0.08) *
                (0.68 + 0.32 * Math.cos(angle));
            density = curl * (1 - b[0] * smoothstep(0.55, 1, p[0]));
            break;
        }
        case 11: { // asperitas: nonperiodic correlated underside displacement
            const undersideWarp = (position: Vec3) => {
                const warped: [number, number, number] = [...position];
                const waveA = Math.sin(position[0] * 5.3 + position[2] * 2.1 + seedPhase);
                const waveB = Math.sin(position[0] * 11.7 - position[2] * 7.9 +
                    seedPhase * 1.37);
                const cusp = Math.sign(waveA) * Math.pow(Math.abs(waveA),
                    mix(1, 0.42, a[3]));
                const displacement = (cusp + waveB * (1 - a[1]) * 0.38) * a[2];
                warped[1] -= displacement *
                    (1 - smoothstep(-0.75, 0.25, position[1]));
                return warped;
            };
            evaluation.basePositionKm = worldPosition(record,
                undersideWarp(localPosition(record, evaluation.basePositionKm)));
            evaluation.placementPositionKm = worldPosition(record,
                undersideWarp(localPosition(record, evaluation.placementPositionKm)));
            break;
        }
        case 12: { // cavum: elliptical full-depth hole with asymmetric growth front
            const [x, z] = rotate2(p[0], p[2], seedPhase * 0.17);
            const radial = length2(x / (1 + a[0]), z * (1 + a[0]));
            const front = radial + a[3] * x;
            const hole = (1 - smoothstep(0.42, 0.42 + Math.max(0.04, a[2]), front)) *
                softInside(Math.abs(p[1]) - a[1], 0.06);
            evaluation.subtractiveDensity = Math.max(evaluation.subtractiveDensity,
                hole * envelope);
            return evaluation;
        }
        case 13: { // arcus: asymmetric shelf wedge plus optional leading roll
            const curvedY = p[1] - a[3] * p[0] * p[0];
            const wedge = softInside(Math.max(Math.abs(p[0]) - 0.94,
                Math.max(curvedY + 0.12, Math.abs(p[2] + a[1]) - 0.34)), 0.08);
            const roll = softInside(length2(curvedY + 0.18, p[2] + 0.42) - 0.2, 0.06);
            density = mix(wedge, Math.max(wedge * 0.7, roll), a[0]) *
                (0.82 + 0.18 * Math.sin(p[0] * 19 + seedPhase) * a[2]);
            break;
        }
        case 14: { // tuba: curved, helically perturbed tapered condensation funnel
            const down = clamp(-p[1]);
            const centerX = Math.sin(down * PI + seedPhase) * a[2] * down +
                Math.sin(down * 17 + seedPhase) * b[0];
            const radius = Math.max(0.035, a[0] * mix(1, a[1], down));
            density = softInside(length2(p[0] - centerX, p[2]) - radius, 0.035) *
                softInside(Math.abs(p[1] + 0.5) - 0.52, 0.05) * a[3];
            break;
        }
        case 15: { // murus: tilted, inflow-biased abrupt wall lowering
            const tiltedY = p[1] - p[0] * Math.tan(a[1]);
            const biasX = p[0] - (a[2] - 0.5) * 0.5;
            density = ellipsoid([biasX, tiltedY + 0.3, p[2]],
                [0.72, Math.max(0.18, a[0] * 1.6), 0.64]);
            density *= 0.88 + 0.12 * Math.sin((p[0] + p[2]) * 15 + seedPhase) * b[0];
            break;
        }
        case 16: { // cauda: low curved horizontal connector tapering toward murus
            const along = clamp((p[0] + 1) * 0.5);
            const centerY = Math.sin(along * PI) * a[3] * 0.25 + a[2] * along * 0.08;
            const width = mix(0.34, 0.12, along * a[1]);
            density = softInside(length2(p[1] - centerY, p[2]) - width, 0.06) *
                softInside(Math.abs(p[0]) - 0.96, 0.05);
            break;
        }
        case 17: { // incus: request the canonical attached macro volume
            evaluation.reuseMacroCode = Math.round(a[0]);
            evaluation.reuseWeight = Math.max(evaluation.reuseWeight, envelope);
            return evaluation;
        }
        case 18: { // pileus: thin summit-conformal ellipsoidal shell
            const radius = Math.hypot(p[0], p[2]);
            const dome = p[1] - a[1] + radius * radius * mix(0.35, 0.85, a[2]);
            density = softInside(Math.abs(dome) - Math.max(0.018, a[0]), 0.025) *
                (1 - smoothstep(0.72, 0.98, radius));
            density *= 1 - a[3] * softInside(radius - 0.2, 0.05);
            break;
        }
        case 19: { // velum: broad finite tilted veil with frayed physical edge
            const tilted = p[1] - Math.tan(b[0]) * p[0];
            const sheet = softInside(Math.abs(tilted) - Math.max(0.012, a[0]), 0.025);
            const edge = 1 - smoothstep(1 - a[1], 1, Math.max(Math.abs(p[0]), Math.abs(p[2])));
            density = sheet * edge;
            break;
        }
        case 20: { // pannus: finite ragged fragments, capable of saturation merging
            const cell = cellular(p, record.seed, 3.9);
            const irregular = cell + Math.sin((p[0] - p[2]) * 17 + seedPhase) * a[1] * 0.13;
            const fragments = 1 - smoothstep(0.3 + a[2] * 0.12,
                0.4 + a[2] * 0.18, irregular);
            density = fragments * softInside(Math.abs(p[1] +
                (hashCell(Math.floor(p[0] * 4), 4, Math.floor(p[2] * 4), record.seed) - 0.5) *
                a[3]) - 0.42, 0.08);
            break;
        }
        case 21: { // flumen: detached finite inflow band terminating before updraft
            const [x, z] = rotate2(p[0], p[2], a[0]);
            const terminal = 1 - smoothstep(1 - a[2] - 0.08, 1 - a[2], x);
            const broad = hashCell(2, 5, 7, record.seed) < a[3] ? 1.6 : 1;
            density = softInside(Math.abs(z + Math.sin(x * PI) * 0.08) - 0.16 * broad, 0.06) *
                softInside(Math.abs(p[1]) - 0.28, 0.06) * terminal;
            evaluation.placementWeight = Math.max(evaluation.placementWeight,
                density * envelope);
            return evaluation;
        }
        case 22: { // PSC/nacreous/NLC: thin earth-tangent multiscale wave sheet
            const wavelengthKm = Math.max(0.02, a[2] / 1_000);
            const normalizedWave = wavelengthKm / Math.max(0.01,
                record.halfExtentsKm[0] * 2);
            const waveNumber = PI * 2 / Math.max(0.025, normalizedWave);
            const primary = Math.sin(p[0] * waveNumber + seedPhase);
            const anisotropy = Math.sqrt(Math.max(1, b[0]));
            const secondary = Math.sin((p[0] * 0.71 + p[2] * 0.91 / anisotropy) *
                waveNumber * 1.83 + seedPhase * 1.31) * a[3];
            const khRipple = Math.sin((p[0] * 0.2 - p[2]) * waveNumber * 4.1 +
                seedPhase * 0.73) * b[1] * 0.12;
            const turbulentRipple = Math.sin((p[0] * 7.3 + p[2] * 5.7) * waveNumber +
                seedPhase * 2.17) * b[2] * 0.08;
            const amplitude = a[1] / Math.max(1, record.halfExtentsKm[1] * 1_000);
            const sheetCenter = (primary + secondary + khRipple + turbulentRipple) * amplitude;
            const halfThickness = Math.max(1e-4,
                a[0] / Math.max(1, record.halfExtentsKm[1] * 2_000));
            density = softInside(Math.abs(p[1] - sheetCenter) - halfThickness, halfThickness * 0.8);
            density *= 0.78 + 0.22 * Math.sin(p[2] * waveNumber * 0.37 + seedPhase) * b[1];
            evaluation.materialProfileCode = Math.round(b[3]);
            evaluation.materialWeight = Math.max(evaluation.materialWeight, density * envelope);
            break;
        }
        default:
            return evaluation;
    }

    evaluation.additiveDensity = Math.max(evaluation.additiveDensity,
        clamp(density) * envelope);
    return evaluation;
}

export function evaluateCloudMorphologyOwnerReference(
    records: readonly CloudMorphologyRecord[],
    parentOwnerIndex: number,
    worldPositionKm: Vec3,
) {
    const evaluation = createCloudMorphologyReferenceEvaluation(worldPositionKm);
    for (const record of records) {
        if (record.parentOwnerIndex === parentOwnerIndex) {
            applyCloudMorphologyRecordReference(evaluation, record, worldPositionKm);
        }
    }
    return evaluation;
}

export function composeCloudMorphologyDensityReference(
    evaluation: CloudMorphologyReferenceEvaluation,
    baseDensity: number,
    placementDensity: number,
    reuseDensity: number,
) {
    const base = clamp(baseDensity * evaluation.baseCoverage);
    const placed = clamp(placementDensity * evaluation.placementWeight);
    const added = clamp(evaluation.additiveDensity);
    const reused = clamp(reuseDensity * evaluation.reuseWeight);
    const union = 1 - (1 - base) * (1 - placed) * (1 - added) * (1 - reused);
    return clamp(union * (1 - clamp(evaluation.subtractiveDensity)));
}

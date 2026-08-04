/**
 * Camera-independent finite cloud-owner domains shared by radiative caches.
 *
 * Renderer-world coordinates are east/up/north. Atmosphere-world coordinates
 * are east/north/up. Distances are kilometres and angles are radians.
 */

import type { CloudMorphologyBounds } from "./cloud-morphology-modifiers";
import type { RuntimeCloudSystem } from "./cloud-system-runtime";

export type CloudRadiativeVec2 = readonly [number, number];
export type CloudRadiativeVec3 = readonly [number, number, number];

export const CLOUD_RADIATIVE_PLANET_RADIUS_KM = 6_371;

export interface CloudRadiativeValidation {
    valid: boolean;
    reasons: readonly string[];
}

export interface CloudRadiativeOwnerInput {
    ownerIndex: number;
    layerIndex: number;
    id: string;
    centerEastKm: number;
    centerNorthKm: number;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientationRadians: number;
    boundaryTransitionKm: number;
    baseAltitudeKm: number;
    geometricDepthKm: number;
    morphologyBounds?: CloudMorphologyBounds;
}

export interface CloudRadiativeOwnerDomain {
    ownerIndex: number;
    layerIndex: number;
    id: string;
    centerRendererWorldKm: CloudRadiativeVec3;
    /** Crosswind, radial-up, and downwind. */
    axesRendererWorld: readonly [
        CloudRadiativeVec3,
        CloudRadiativeVec3,
        CloudRadiativeVec3,
    ];
    halfExtentKm: CloudRadiativeVec3;
    boundaryTransitionKm: number;
    cornersRendererWorldKm: readonly CloudRadiativeVec3[];
}

export interface CloudSourceAlignedBasis {
    directionToSourceAtmosphere: CloudRadiativeVec3;
    rightAtmosphere: CloudRadiativeVec3;
    transverseAtmosphere: CloudRadiativeVec3;
}

export interface CloudRadiativeOwnerProjection {
    ownerIndex: number;
    layerIndex: number;
    id: string;
    planeMinimumKm: CloudRadiativeVec2;
    planeMaximumKm: CloudRadiativeVec2;
    depthMinimumKm: number;
    depthMaximumKm: number;
}

const finite = (value: number) => Number.isFinite(value);
const add3 = (left: CloudRadiativeVec3, right: CloudRadiativeVec3):
CloudRadiativeVec3 => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const sub3 = (left: CloudRadiativeVec3, right: CloudRadiativeVec3):
CloudRadiativeVec3 => [
    left[0] - right[0], left[1] - right[1], left[2] - right[2],
];
const scale3 = (value: CloudRadiativeVec3, scale: number): CloudRadiativeVec3 => [
    value[0] * scale, value[1] * scale, value[2] * scale,
];
export const cloudRadiativeDot3 = (
    left: CloudRadiativeVec3,
    right: CloudRadiativeVec3,
) => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const cross3 = (left: CloudRadiativeVec3, right: CloudRadiativeVec3):
CloudRadiativeVec3 => [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
];
const length3 = (value: CloudRadiativeVec3) => Math.hypot(...value);
export const cloudRadiativeNormalize3 = (
    value: CloudRadiativeVec3,
    fallback: CloudRadiativeVec3 = [0, 0, 1],
): CloudRadiativeVec3 => {
    const magnitude = length3(value);
    return magnitude > 1e-10 && finite(magnitude)
        ? scale3(value, 1 / magnitude)
        : fallback;
};

export const rendererToAtmosphereWorld = (
    rendererWorldKm: CloudRadiativeVec3,
): CloudRadiativeVec3 => [
    rendererWorldKm[0], rendererWorldKm[2], rendererWorldKm[1],
];

export const atmosphereToRendererWorld = (
    atmosphereWorldKm: CloudRadiativeVec3,
): CloudRadiativeVec3 => [
    atmosphereWorldKm[0], atmosphereWorldKm[2], atmosphereWorldKm[1],
];

const morphologyPointToRendererWorld = (
    point: CloudRadiativeVec3,
): CloudRadiativeVec3 => {
    const radius = CLOUD_RADIATIVE_PLANET_RADIUS_KM + point[1];
    return [
        point[0],
        Math.sqrt(Math.max(1,
            radius * radius - point[0] * point[0] - point[2] * point[2])),
        point[2],
    ];
};

const orientedCorners = (
    center: CloudRadiativeVec3,
    axes: CloudRadiativeOwnerDomain["axesRendererWorld"],
    halfExtent: CloudRadiativeVec3,
) => {
    const corners: CloudRadiativeVec3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
        corners.push(add3(center, add3(
            scale3(axes[0], x * halfExtent[0]),
            add3(scale3(axes[1], y * halfExtent[1]),
                scale3(axes[2], z * halfExtent[2])),
        )));
    }
    return corners;
};

export const validateCloudRadiativeOwnerInput = (
    input: CloudRadiativeOwnerInput,
): CloudRadiativeValidation => {
    const reasons: string[] = [];
    if (!Number.isInteger(input.ownerIndex) || input.ownerIndex < 0) {
        reasons.push("owner-index-must-be-a-nonnegative-integer");
    }
    if (!Number.isInteger(input.layerIndex) || input.layerIndex < -1 ||
        input.layerIndex > 2) {
        reasons.push("layer-index-must-be-minus-one-through-two");
    }
    if (input.id.length === 0) reasons.push("owner-id-must-not-be-empty");
    for (const [name, value] of [
        ["center-east", input.centerEastKm],
        ["center-north", input.centerNorthKm],
        ["orientation", input.orientationRadians],
        ["base-altitude", input.baseAltitudeKm],
    ] as const) {
        if (!finite(value)) reasons.push(`${name}-must-be-finite`);
    }
    for (const [name, value] of [
        ["major-radius", input.majorRadiusKm],
        ["minor-radius", input.minorRadiusKm],
        ["geometric-depth", input.geometricDepthKm],
    ] as const) {
        if (!(finite(value) && value > 0)) {
            reasons.push(`${name}-must-be-finite-and-positive`);
        }
    }
    if (!(finite(input.boundaryTransitionKm) &&
        input.boundaryTransitionKm >= 0)) {
        reasons.push("boundary-transition-must-be-finite-and-nonnegative");
    }
    const middleRadius = CLOUD_RADIATIVE_PLANET_RADIUS_KM +
        input.baseAltitudeKm + input.geometricDepthKm * 0.5;
    if (Math.hypot(input.centerEastKm, input.centerNorthKm) >= middleRadius) {
        reasons.push("owner-center-is-outside-local-earth-tangent-domain");
    }
    const morphology = input.morphologyBounds;
    if (morphology) {
        if (morphology.minimumKm.some((value) => !finite(value)) ||
            morphology.maximumKm.some((value) => !finite(value))) {
            reasons.push("morphology-bounds-must-be-finite");
        }
        if (morphology.minimumKm.some((value, axis) =>
            value > morphology.maximumKm[axis])) {
            reasons.push("morphology-minimum-must-not-exceed-maximum");
        }
    }
    return { valid: reasons.length === 0, reasons };
};

export const cloudRadiativeOwnerInputFromRuntime = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    morphologyBounds?: CloudMorphologyBounds,
): CloudRadiativeOwnerInput => ({
    ownerIndex,
    layerIndex: system.layerIndex,
    id: system.state.id,
    centerEastKm: system.state.extent.centerEastKm,
    centerNorthKm: system.state.extent.centerNorthKm,
    majorRadiusKm: system.state.extent.majorRadiusKm,
    minorRadiusKm: system.state.extent.minorRadiusKm,
    orientationRadians: system.state.extent.orientation,
    boundaryTransitionKm: system.state.extent.boundaryTransitionKm,
    baseAltitudeKm: system.compiled.geometry.baseAltitudeKm,
    geometricDepthKm: system.compiled.geometry.geometricDepthKm,
    morphologyBounds,
});

export const createCloudRadiativeOwnerDomain = (
    input: CloudRadiativeOwnerInput,
): CloudRadiativeOwnerDomain => {
    const validation = validateCloudRadiativeOwnerInput(input);
    if (!validation.valid) {
        throw new RangeError(`Invalid cloud radiative owner ${input.id}: ` +
            validation.reasons.join(", "));
    }
    const depth = Math.max(0.05, input.geometricDepthKm);
    const middleAltitude = input.baseAltitudeKm + depth * 0.5;
    const radius = CLOUD_RADIATIVE_PLANET_RADIUS_KM + middleAltitude;
    const radial = Math.sqrt(Math.max(1,
        radius * radius - input.centerEastKm * input.centerEastKm -
            input.centerNorthKm * input.centerNorthKm));
    let center: CloudRadiativeVec3 = [
        input.centerEastKm, radial, input.centerNorthKm,
    ];
    const up = cloudRadiativeNormalize3(center, [0, 1, 0]);
    const rawDownwind: CloudRadiativeVec3 = [
        Math.cos(input.orientationRadians), 0,
        Math.sin(input.orientationRadians),
    ];
    const downwind = cloudRadiativeNormalize3(add3(rawDownwind,
        scale3(up, -cloudRadiativeDot3(rawDownwind, up))), [0, 0, 1]);
    const crosswind = cloudRadiativeNormalize3(cross3(up, downwind), [1, 0, 0]);
    const axes = [crosswind, up, downwind] as const;
    let halfExtent: CloudRadiativeVec3 = [
        Math.max(0.05, input.minorRadiusKm + input.boundaryTransitionKm),
        Math.max(0.05, depth * 0.5 + Math.min(
            0.2, input.boundaryTransitionKm * 0.2)),
        Math.max(0.05, input.majorRadiusKm + input.boundaryTransitionKm),
    ];

    if (input.morphologyBounds) {
        const minima = halfExtent.map((value) => -value) as
            [number, number, number];
        const maxima = [...halfExtent] as [number, number, number];
        const bounds = input.morphologyBounds;
        for (const east of [bounds.minimumKm[0], bounds.maximumKm[0]]) {
            for (const altitude of [bounds.minimumKm[1], bounds.maximumKm[1]]) {
                for (const north of [bounds.minimumKm[2], bounds.maximumKm[2]]) {
                    const delta = sub3(morphologyPointToRendererWorld(
                        [east, altitude, north]), center);
                    for (let axis = 0; axis < 3; axis += 1) {
                        const projection = cloudRadiativeDot3(delta, axes[axis]);
                        minima[axis] = Math.min(minima[axis], projection);
                        maxima[axis] = Math.max(maxima[axis], projection);
                    }
                }
            }
        }
        const localCenter: CloudRadiativeVec3 = [
            (minima[0] + maxima[0]) * 0.5,
            (minima[1] + maxima[1]) * 0.5,
            (minima[2] + maxima[2]) * 0.5,
        ];
        center = add3(center, add3(
            scale3(axes[0], localCenter[0]),
            add3(scale3(axes[1], localCenter[1]),
                scale3(axes[2], localCenter[2])),
        ));
        halfExtent = [
            Math.max(0.05, (maxima[0] - minima[0]) * 0.5),
            Math.max(0.05, (maxima[1] - minima[1]) * 0.5),
            Math.max(0.05, (maxima[2] - minima[2]) * 0.5),
        ];
    }

    return Object.freeze({
        ownerIndex: input.ownerIndex,
        layerIndex: input.layerIndex,
        id: input.id,
        centerRendererWorldKm: center,
        axesRendererWorld: axes,
        halfExtentKm: halfExtent,
        boundaryTransitionKm: input.boundaryTransitionKm,
        cornersRendererWorldKm: Object.freeze(orientedCorners(
            center, axes, halfExtent)),
    });
};

export const createCloudRadiativeOwnerDomains = (
    inputs: readonly CloudRadiativeOwnerInput[],
) => [...inputs]
    .sort((left, right) => left.ownerIndex - right.ownerIndex ||
        left.id.localeCompare(right.id))
    .map(createCloudRadiativeOwnerDomain);

export const createCloudSourceAlignedBasis = (
    sourceDirectionAtmosphere: CloudRadiativeVec3,
): CloudSourceAlignedBasis => {
    const direction = cloudRadiativeNormalize3(
        sourceDirectionAtmosphere, [0, 0, 1]);
    // Frisvad's branch-free northern-hemisphere frame avoids the former
    // reference-axis switch at z=0.94.  That switch abruptly rolled the atlas
    // while a source moved through high elevation even though the underlying
    // cloud field and renderer/atmosphere affine map were continuous.
    if (direction[2] < -0.999999) {
        return {
            directionToSourceAtmosphere: direction,
            rightAtmosphere: [0, -1, 0],
            transverseAtmosphere: [-1, 0, 0],
        };
    }
    const inverse = 1 / (1 + direction[2]);
    const crossTerm = -direction[0] * direction[1] * inverse;
    const right = cloudRadiativeNormalize3([
        1 - direction[0] * direction[0] * inverse,
        crossTerm,
        -direction[0],
    ], [1, 0, 0]);
    return {
        directionToSourceAtmosphere: direction,
        rightAtmosphere: right,
        transverseAtmosphere: cloudRadiativeNormalize3(
            cross3(direction, right), [0, 1, 0]),
    };
};

export const projectCloudRadiativeOwnerDomain = (
    domain: CloudRadiativeOwnerDomain,
    observerAtmosphereWorldKm: CloudRadiativeVec3,
    sourceBasis: CloudSourceAlignedBasis,
): CloudRadiativeOwnerProjection => {
    let minimumPlaneX = Infinity;
    let minimumPlaneY = Infinity;
    let maximumPlaneX = -Infinity;
    let maximumPlaneY = -Infinity;
    let minimumDepth = Infinity;
    let maximumDepth = -Infinity;
    for (const rendererCorner of domain.cornersRendererWorldKm) {
        const relative = sub3(
            rendererToAtmosphereWorld(rendererCorner),
            observerAtmosphereWorldKm,
        );
        const planeX = cloudRadiativeDot3(relative, sourceBasis.rightAtmosphere);
        const planeY = cloudRadiativeDot3(
            relative, sourceBasis.transverseAtmosphere);
        const depth = cloudRadiativeDot3(
            relative, sourceBasis.directionToSourceAtmosphere);
        minimumPlaneX = Math.min(minimumPlaneX, planeX);
        minimumPlaneY = Math.min(minimumPlaneY, planeY);
        maximumPlaneX = Math.max(maximumPlaneX, planeX);
        maximumPlaneY = Math.max(maximumPlaneY, planeY);
        minimumDepth = Math.min(minimumDepth, depth);
        maximumDepth = Math.max(maximumDepth, depth);
    }
    return Object.freeze({
        ownerIndex: domain.ownerIndex,
        layerIndex: domain.layerIndex,
        id: domain.id,
        planeMinimumKm: [minimumPlaneX, minimumPlaneY] as CloudRadiativeVec2,
        planeMaximumKm: [maximumPlaneX, maximumPlaneY] as CloudRadiativeVec2,
        depthMinimumKm: minimumDepth,
        depthMaximumKm: maximumDepth,
    });
};

export const cloudRadiativeProjectionOverlapsSquare = (
    projection: CloudRadiativeOwnerProjection,
    halfExtentKm: number,
    guardKm = 0,
) => projection.planeMaximumKm[0] >= -halfExtentKm - guardKm &&
    projection.planeMinimumKm[0] <= halfExtentKm + guardKm &&
    projection.planeMaximumKm[1] >= -halfExtentKm - guardKm &&
    projection.planeMinimumKm[1] <= halfExtentKm + guardKm;

/**
 * GPU-ready, renderer-independent ABI for finite special-origin sources and
 * cross-owner WMO mother-cloud lineages.
 *
 * One child owner can have exactly one origin, so one bounded record is enough
 * for either its source manifold or its parent relationship. Cloud water/ice
 * extinction remains owned by CloudSystem; this ABI contributes only source
 * aerosol coefficients and density-union/transition control, preventing the
 * same condensate from entering transport twice.
 */

import type { CloudScene } from "./cloud-scene";
import { CLOUD_MOTHER_GENUS_RELATIONS } from "./cloud-state-map";
import {
    CLOUD_SPECIAL_ORIGIN_RGB_WAVELENGTHS_MICRONS,
    validateCloudSpecialOriginSource,
    type CloudSpecialOriginAerosolKind,
    type CloudSpecialOriginSource,
} from "./cloud-special-origin-source";
import {
    CLOUD_SYSTEM_MAX_COUNT,
    type RuntimeCloudSystem,
} from "./cloud-system-runtime";

type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];

export const CLOUD_SOURCE_LINEAGE_SCHEMA = 1;
export const CLOUD_SOURCE_LINEAGE_MAX_RECORDS = CLOUD_SYSTEM_MAX_COUNT;
/** Sixteen vec4s = 256 bytes per storage record. */
export const CLOUD_SOURCE_LINEAGE_VEC4_STRIDE = 16;
/** Pad the header to 256 bytes so record zero also begins at a 256-byte offset. */
export const CLOUD_SOURCE_LINEAGE_HEADER_VEC4S = 16;
export const CLOUD_SOURCE_LINEAGE_RECORD_BYTES =
    CLOUD_SOURCE_LINEAGE_VEC4_STRIDE * 4 * Float32Array.BYTES_PER_ELEMENT;
export const CLOUD_SOURCE_LINEAGE_BUFFER_FLOATS =
    (CLOUD_SOURCE_LINEAGE_HEADER_VEC4S +
        CLOUD_SOURCE_LINEAGE_MAX_RECORDS * CLOUD_SOURCE_LINEAGE_VEC4_STRIDE) * 4;
export const CLOUD_SOURCE_LINEAGE_BUFFER_BYTES =
    CLOUD_SOURCE_LINEAGE_BUFFER_FLOATS * Float32Array.BYTES_PER_ELEMENT;

export const CLOUD_SOURCE_LINEAGE_VEC4_LAYOUT = Object.freeze({
    identity: 0,
    ownership: 1,
    classification: 2,
    centerAndAge: 3,
    axisAndExtent: 4,
    timingAndTransition: 5,
    advection: 6,
    emission: 7,
    thermodynamics: 8,
    composition: 9,
    aerosolExtinction: 10,
    aerosolAbsorption: 11,
    aerosolScattering: 12,
    lineage: 13,
    ownerWeights: 14,
    support: 15,
} as const);

export const CLOUD_SOURCE_LINEAGE_EVENT_CODE = Object.freeze({
    inactive: 0,
    specialOrigin: 1,
    genitus: 2,
    mutatus: 3,
} as const);

export const CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE = Object.freeze({
    none: 0,
    point: 1,
    line: 2,
    area: 3,
} as const);

export const CLOUD_SOURCE_LINEAGE_RELATION_CODE = Object.freeze({
    none: 0,
    genitus: 1,
    mutatus: 2,
} as const);

export const CLOUD_SOURCE_LINEAGE_DESIGNATION_CODE = Object.freeze({
    none: 0,
    flammagenitus: 1,
    homogenitus: 2,
    homomutatus: 3,
    cataractagenitus: 4,
    silvagenitus: 5,
} as const);

export const CLOUD_SOURCE_LINEAGE_SOURCE_KIND_CODE = Object.freeze({
    none: 0,
    "wildfire-convection": 1,
    "volcanic-convection": 2,
    "industrial-thermal": 3,
    "aircraft-exhaust-line": 4,
    "aircraft-aerodynamic-line": 5,
    "persistent-contrail-field": 6,
    "waterfall-spray": 7,
    "forest-evapotranspiration": 8,
} as const);

export const CLOUD_SOURCE_LINEAGE_AEROSOL_KIND_CODE: Readonly<Record<
    CloudSpecialOriginAerosolKind,
    number
>> = Object.freeze({
    none: 0,
    "biomass-burning-smoke": 1,
    "volcanic-ash": 2,
    "industrial-combustion": 3,
    "aircraft-soot": 4,
    "mineral-spray": 5,
    "biogenic-organic": 6,
});

export interface CloudSourceLineageRecord {
    /** active, schema, event code, geometry code */
    identity: Vec4;
    /** record index, source index (-1 lineage), parent owner, child owner */
    ownership: Vec4;
    /** designation, source kind, relation, aerosol kind */
    classification: Vec4;
    /** east km, altitude km, north km, resolved age seconds */
    centerAndAge: Vec4;
    /** axis east/north, major km, minor km */
    axisAndExtent: Vec4;
    /** birth s, active lifetime s, age fraction, transition progress */
    timingAndTransition: Vec4;
    /** east/up/north m s-1, horizontal speed m s-1 */
    advection: Vec4;
    /** heat, vapor, condensation nuclei, ice nuclei (normalized) */
    emission: Vec4;
    /** base K, top K, RH fraction, entrainment fraction */
    thermodynamics: Vec4;
    /** water, ice, aerosol fractions, aerosol kind code */
    composition: Vec4;
    /** aerosol extinction RGB km-1, asymmetry */
    aerosolExtinction: Vec4;
    /** aerosol absorption RGB km-1, Ångström exponent */
    aerosolAbsorption: Vec4;
    /** aerosol scattering RGB km-1, source allocation fraction */
    aerosolScattering: Vec4;
    /** exact 24-bit seed, horizontal attachment, vertical overlap, ancestry */
    lineage: Vec4;
    /** parent, child, compact-union mode, emission/source allocation */
    ownerWeights: Vec4;
    /** vertical radius km, boundary km, seed [0,1], release altitude km */
    support: Vec4;
}

export interface PackedCloudSourceLineageRecords {
    data: Float32Array;
    records: readonly CloudSourceLineageRecord[];
    count: number;
    capacity: number;
    dropped: number;
    sourceRecordCount: number;
    relationRecordCount: number;
    snapshotTimeSeconds: number;
    diagnostics: readonly string[];
}

export interface CloudSourceAerosolOptics {
    extinctionRgbPerKm: Vec3;
    absorptionRgbPerKm: Vec3;
    scatteringRgbPerKm: Vec3;
    singleScatteringAlbedoRgb: Vec3;
    asymmetry: number;
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;
const finite = (value: number) => Number.isFinite(value);
const length2 = (x: number, y: number) => Math.hypot(x, y);

/** Convert one authored source mixture into conservative RGB coefficients. */
export function evaluateCloudSourceAerosolOptics(
    source: CloudSpecialOriginSource,
): CloudSourceAerosolOptics {
    const composition = source.composition;
    const extinctionRgbPerKm = CLOUD_SPECIAL_ORIGIN_RGB_WAVELENGTHS_MICRONS.map(
        (wavelength) => composition.aerosolExtinction550PerKm *
            Math.pow(wavelength / 0.55, -composition.aerosolAngstromExponent),
    ) as unknown as Vec3;
    const scatteringRgbPerKm = extinctionRgbPerKm.map((extinction, index) =>
        extinction * composition.aerosolSingleScatteringAlbedoRgb[index],
    ) as unknown as Vec3;
    const absorptionRgbPerKm = extinctionRgbPerKm.map((extinction, index) =>
        Math.max(0, extinction - scatteringRgbPerKm[index]),
    ) as unknown as Vec3;
    return {
        extinctionRgbPerKm,
        absorptionRgbPerKm,
        scatteringRgbPerKm,
        singleScatteringAlbedoRgb:
            [...composition.aerosolSingleScatteringAlbedoRgb] as Vec3,
        asymmetry: composition.aerosolAsymmetry,
    };
}

const exactSeed24 = (seed: number) => (seed >>> 0) & 0x00ff_ffff;

const sourceVerticalSupport = (
    source: CloudSpecialOriginSource,
    child: RuntimeCloudSystem,
) => {
    const depth = child.state.physical.geometricDepthKm;
    const top = child.state.physical.baseAltitudeKm + depth;
    let verticalRadiusKm: number;
    if (source.kind === "wildfire-convection" ||
        source.kind === "volcanic-convection") {
        verticalRadiusKm = Math.min(
            Math.max(0.2, top - source.geometry.releaseAltitudeKm) * 0.5,
            Math.max(depth * 0.38, source.geometry.majorRadiusKm * 0.5),
        );
    } else if (source.kind === "industrial-thermal") {
        verticalRadiusKm = Math.min(
            Math.max(0.1, top - source.geometry.releaseAltitudeKm) * 0.5,
            Math.max(depth * 0.24, source.geometry.majorRadiusKm * 0.65),
        );
    } else if (source.kind === "aircraft-exhaust-line" ||
        source.kind === "aircraft-aerodynamic-line" ||
        source.kind === "persistent-contrail-field") {
        verticalRadiusKm = Math.min(depth * 0.5,
            Math.max(0.03, source.geometry.minorRadiusKm * 0.45));
    } else {
        verticalRadiusKm = Math.min(depth * 0.5,
            Math.max(0.03, source.geometry.minorRadiusKm * 0.9));
    }
    verticalRadiusKm = clamp(verticalRadiusKm, 0.02, 12);
    const grounded = source.geometry.releaseAltitudeKm <
        child.state.physical.baseAltitudeKm;
    const centerAltitudeKm = grounded
        ? source.geometry.releaseAltitudeKm + verticalRadiusKm
        : source.geometry.releaseAltitudeKm;
    return { verticalRadiusKm, centerAltitudeKm };
};

const materialFractionsForLineage = (
    parent: RuntimeCloudSystem,
    child: RuntimeCloudSystem,
    relation: "genitus" | "mutatus",
) => {
    const childCondensate = child.state.physical.condensate;
    const parentCondensate = parent.state.physical.condensate;
    const liquid = relation === "mutatus"
        ? childCondensate.liquidWaterPath + parentCondensate.liquidWaterPath
        : childCondensate.liquidWaterPath;
    const ice = relation === "mutatus"
        ? childCondensate.iceWaterPath + parentCondensate.iceWaterPath
        : childCondensate.iceWaterPath;
    const total = liquid + ice;
    if (total <= 1e-9) {
        const liquidFraction = clamp(childCondensate.liquidFraction);
        return [liquidFraction, 1 - liquidFraction, 0] as const;
    }
    return [liquid / total, ice / total, 0] as const;
};

const sourceRecord = (
    source: CloudSpecialOriginSource,
    sourceIndex: number,
    child: RuntimeCloudSystem,
    childIndex: number,
    sourceAllocationFraction: number,
): CloudSourceLineageRecord => {
    const origin = child.state.classification.origin;
    if (origin.kind !== "special") {
        throw new Error("A source record requires a special-origin child.");
    }
    const metadata = child.familyProduction?.specialOrigin;
    const seed = exactSeed24(metadata?.lineageSeed ?? childIndex * 0x9e3779);
    const optics = evaluateCloudSourceAerosolOptics(source);
    const vertical = sourceVerticalSupport(source, child);
    const ageFraction = clamp(source.ageSeconds / source.activeLifetimeSeconds);
    const upward = source.emission.verticalMomentum * Math.max(0,
        child.state.physical.thermodynamics.verticalVelocity);
    return {
        identity: [1, CLOUD_SOURCE_LINEAGE_SCHEMA,
            CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin,
            CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE[source.geometry.kind]],
        ownership: [-1, sourceIndex, -1, childIndex],
        classification: [
            CLOUD_SOURCE_LINEAGE_DESIGNATION_CODE[origin.designation],
            CLOUD_SOURCE_LINEAGE_SOURCE_KIND_CODE[source.kind],
            CLOUD_SOURCE_LINEAGE_RELATION_CODE.none,
            CLOUD_SOURCE_LINEAGE_AEROSOL_KIND_CODE[
                source.composition.aerosolKind],
        ],
        centerAndAge: [source.geometry.centerEastKm,
            vertical.centerAltitudeKm, source.geometry.centerNorthKm,
            source.ageSeconds],
        axisAndExtent: [Math.cos(source.geometry.orientation),
            Math.sin(source.geometry.orientation), source.geometry.majorRadiusKm,
            source.geometry.minorRadiusKm],
        timingAndTransition: [source.birthTimeSeconds,
            source.activeLifetimeSeconds, ageFraction, 0],
        advection: [
            Math.cos(source.advectionDirection) * source.advectionSpeedMps,
            upward,
            Math.sin(source.advectionDirection) * source.advectionSpeedMps,
            source.advectionSpeedMps,
        ],
        emission: [source.emission.sensibleHeat, source.emission.waterVapor,
            source.emission.condensationNuclei, source.emission.iceNuclei],
        thermodynamics: [
            child.state.physical.thermodynamics.baseTemperatureKelvin,
            child.state.physical.thermodynamics.topTemperatureKelvin,
            child.state.physical.thermodynamics.relativeHumidity,
            child.state.physical.thermodynamics.entrainment,
        ],
        composition: [source.composition.waterFraction,
            source.composition.iceFraction, source.composition.aerosolFraction,
            CLOUD_SOURCE_LINEAGE_AEROSOL_KIND_CODE[
                source.composition.aerosolKind]],
        aerosolExtinction: [...optics.extinctionRgbPerKm, optics.asymmetry],
        aerosolAbsorption: [...optics.absorptionRgbPerKm,
            source.composition.aerosolAngstromExponent],
        aerosolScattering: [...optics.scatteringRgbPerKm,
            sourceAllocationFraction],
        lineage: [seed, 0, 0, metadata?.sourceMaterialFraction ??
            source.composition.waterFraction + source.composition.iceFraction],
        ownerWeights: [0, 1, 0, sourceAllocationFraction],
        support: [vertical.verticalRadiusKm,
            Math.max(0.02, Math.min(source.geometry.minorRadiusKm,
                child.state.extent.boundaryTransitionKm)),
            seed / 0x0100_0000, source.geometry.releaseAltitudeKm],
    };
};

const lineageRecord = (
    parent: RuntimeCloudSystem,
    parentIndex: number,
    child: RuntimeCloudSystem,
    childIndex: number,
    relation: "genitus" | "mutatus",
): CloudSourceLineageRecord => {
    const metadata = child.familyProduction?.causalOrigin!;
    const parentExtent = parent.state.extent;
    const childExtent = child.state.extent;
    const deltaEast = childExtent.centerEastKm - parentExtent.centerEastKm;
    const deltaNorth = childExtent.centerNorthKm - parentExtent.centerNorthKm;
    const distance = length2(deltaEast, deltaNorth);
    const axisEast = distance > 1e-6
        ? deltaEast / distance : Math.cos(parentExtent.orientation);
    const axisNorth = distance > 1e-6
        ? deltaNorth / distance : Math.sin(parentExtent.orientation);
    const parentBase = parent.state.physical.baseAltitudeKm;
    const parentTop = parentBase + parent.state.physical.geometricDepthKm;
    const childBase = child.state.physical.baseAltitudeKm;
    const childTop = childBase + child.state.physical.geometricDepthKm;
    const overlapBase = Math.max(parentBase, childBase);
    const overlapTop = Math.min(parentTop, childTop);
    const overlapDepth = Math.max(0.02, overlapTop - overlapBase);
    const minimumMajor = Math.min(parentExtent.majorRadiusKm,
        childExtent.majorRadiusKm);
    const minimumMinor = Math.min(parentExtent.minorRadiusKm,
        childExtent.minorRadiusKm);
    const majorRadiusKm = relation === "mutatus"
        ? Math.max(0.2, minimumMajor * 0.92)
        : Math.max(0.2, distance * 0.5 + minimumMajor * 0.3);
    const minorRadiusKm = Math.min(majorRadiusKm,
        Math.max(0.2, minimumMinor * (relation === "mutatus" ? 0.88 : 0.38)));
    const progress = relation === "mutatus"
        ? clamp(metadata.transitionProgress ?? 0.5) : 0;
    const fractions = materialFractionsForLineage(parent, child, relation);
    const seed = exactSeed24(metadata.lineageSeed);
    const childAge = child.state.lifecycle.ageSeconds;
    const lifetime = Math.max(childAge + 1,
        parent.state.lifecycle.ageSeconds, childAge) * 1.25;
    return {
        identity: [1, CLOUD_SOURCE_LINEAGE_SCHEMA,
            relation === "genitus" ? CLOUD_SOURCE_LINEAGE_EVENT_CODE.genitus
                : CLOUD_SOURCE_LINEAGE_EVENT_CODE.mutatus,
            relation === "genitus" ? CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.line
                : CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.area],
        ownership: [-1, -1, parentIndex, childIndex],
        classification: [0, 0,
            CLOUD_SOURCE_LINEAGE_RELATION_CODE[relation], 0],
        centerAndAge: [
            (parentExtent.centerEastKm + childExtent.centerEastKm) * 0.5,
            (overlapBase + overlapTop) * 0.5,
            (parentExtent.centerNorthKm + childExtent.centerNorthKm) * 0.5,
            childAge,
        ],
        axisAndExtent: [axisEast, axisNorth, majorRadiusKm, minorRadiusKm],
        timingAndTransition: [-childAge, lifetime,
            clamp(childAge / lifetime), progress],
        advection: [
            Math.cos(child.state.physical.kinematics.windDirection) *
                child.state.physical.kinematics.windSpeed,
            child.state.lifecycle.cloudTopRiseRate,
            Math.sin(child.state.physical.kinematics.windDirection) *
                child.state.physical.kinematics.windSpeed,
            child.state.physical.kinematics.windSpeed,
        ],
        emission: [0, 0, 0, 0],
        thermodynamics: [
            child.state.physical.thermodynamics.baseTemperatureKelvin,
            child.state.physical.thermodynamics.topTemperatureKelvin,
            child.state.physical.thermodynamics.relativeHumidity,
            child.state.physical.thermodynamics.entrainment,
        ],
        composition: [...fractions, 0],
        aerosolExtinction: [0, 0, 0, 0],
        aerosolAbsorption: [0, 0, 0, 0],
        aerosolScattering: [0, 0, 0, 0],
        lineage: [seed, metadata.horizontalAttachmentFraction ?? 0,
            metadata.verticalOverlapFraction ?? 0,
            metadata.materialAncestryFraction],
        ownerWeights: [relation === "mutatus" ? 1 - progress : 1,
            relation === "mutatus" ? progress : 1,
            relation === "mutatus" ? 2 : 1, 0],
        support: [overlapDepth * 0.5,
            Math.max(0.02, Math.min(parentExtent.boundaryTransitionKm,
                childExtent.boundaryTransitionKm)),
            seed / 0x0100_0000, overlapBase],
    };
};

const recordVectors = (record: CloudSourceLineageRecord): readonly Vec4[] => [
    record.identity,
    record.ownership,
    record.classification,
    record.centerAndAge,
    record.axisAndExtent,
    record.timingAndTransition,
    record.advection,
    record.emission,
    record.thermodynamics,
    record.composition,
    record.aerosolExtinction,
    record.aerosolAbsorption,
    record.aerosolScattering,
    record.lineage,
    record.ownerWeights,
    record.support,
];

const recordIsFinite = (record: CloudSourceLineageRecord) =>
    recordVectors(record).every((vector) => vector.every(finite));

/** Pack the current physical runtime without observing any camera state. */
export function packCloudSourceLineageRecords(
    scene: CloudScene,
    systems: readonly RuntimeCloudSystem[],
    requestedCapacity = CLOUD_SOURCE_LINEAGE_MAX_RECORDS,
    requestedSnapshotTimeSeconds = 0,
): PackedCloudSourceLineageRecords {
    const diagnostics: string[] = [];
    const normalizedCapacity = finite(requestedCapacity)
        ? Math.floor(requestedCapacity) : CLOUD_SOURCE_LINEAGE_MAX_RECORDS;
    const capacity = Math.max(1, Math.min(CLOUD_SOURCE_LINEAGE_MAX_RECORDS,
        normalizedCapacity));
    if (!finite(requestedCapacity)) {
        diagnostics.push("header:non-finite-capacity");
    }
    const snapshotTimeSeconds = finite(requestedSnapshotTimeSeconds)
        ? requestedSnapshotTimeSeconds : 0;
    if (!finite(requestedSnapshotTimeSeconds)) {
        diagnostics.push("header:non-finite-snapshot-time");
    }
    const sourceById = new Map<string, {
        source: CloudSpecialOriginSource;
        sourceIndex: number;
    }>();
    for (const [sourceIndex, source] of (scene.specialOriginSources ?? []).entries()) {
        if (sourceById.has(source.id)) {
            diagnostics.push(`source:${source.id}:duplicate-source-id`);
            continue;
        }
        const issues = validateCloudSpecialOriginSource(source);
        if (issues.length > 0) {
            diagnostics.push(...issues.map((issue) =>
                `source:${source.id}:${issue.code}:${issue.message}`));
            continue;
        }
        sourceById.set(source.id, { source, sourceIndex });
    }

    const ownerIndexById = new Map<string, number>();
    const duplicateOwnerIds = new Set<string>();
    for (const [index, system] of systems.entries()) {
        if (ownerIndexById.has(system.state.id)) {
            duplicateOwnerIds.add(system.state.id);
            diagnostics.push(`owner:${system.state.id}:duplicate-owner-id`);
        } else {
            ownerIndexById.set(system.state.id, index);
        }
    }

    const sourceCandidates: Array<{
        childIndex: number;
        source: CloudSpecialOriginSource;
        sourceIndex: number;
        sourceId: string;
    }> = [];
    const relationCandidates: Array<{
        childIndex: number;
        parentIndex: number;
        relation: "genitus" | "mutatus";
    }> = [];
    for (const [childIndex, child] of systems.entries()) {
        if (duplicateOwnerIds.has(child.state.id)) continue;
        const origin = child.state.classification.origin;
        if (origin.kind === "special") {
            const sourceId = child.morphologyAssignment?.sourceId;
            const indexed = sourceId ? sourceById.get(sourceId) : undefined;
            if (!sourceId || !indexed) {
                diagnostics.push(`owner:${child.state.id}:missing-special-origin-source`);
                continue;
            }
            if (indexed.source.designation !== origin.designation ||
                child.familyProduction?.specialOrigin?.sourceId !== sourceId) {
                diagnostics.push(`owner:${child.state.id}:source-ownership-mismatch`);
                continue;
            }
            sourceCandidates.push({
                childIndex,
                ...indexed,
                sourceId,
            });
            continue;
        }
        if (origin.kind !== "genitus" && origin.kind !== "mutatus") continue;
        const metadata = child.familyProduction?.causalOrigin;
        if (!child.morphologyAssignment?.causalParent) {
            // A single-owner taxonomy qualification has provenance but no
            // authored second owner; it correctly has no cross-owner record.
            continue;
        }
        if (!metadata?.crossOwner || !metadata.parentSystemId ||
            metadata.childSystemId !== child.state.id) {
            diagnostics.push(`owner:${child.state.id}:missing-cross-owner-lineage`);
            continue;
        }
        const parentIndex = ownerIndexById.get(metadata.parentSystemId);
        if (parentIndex === undefined || parentIndex === childIndex) {
            diagnostics.push(`owner:${child.state.id}:invalid-parent-owner-index`);
            continue;
        }
        const parent = systems[parentIndex];
        if (parent.state.classification.genus !== origin.motherGenus ||
            metadata.relation !== origin.kind ||
            metadata.motherGenus !== origin.motherGenus ||
            !CLOUD_MOTHER_GENUS_RELATIONS[
                child.state.classification.genus
            ][origin.kind].includes(origin.motherGenus)) {
            diagnostics.push(`owner:${child.state.id}:parent-lineage-classification-mismatch`);
            continue;
        }
        const reference = child.morphologyAssignment.causalParent;
        const referenceMatches = reference.systemId !== undefined
            ? reference.systemId === parent.state.id
            : reference.layerIndex === parent.layerIndex &&
                (reference.systemIndex ?? 0) === parent.systemIndex;
        if (!referenceMatches) {
            diagnostics.push(`owner:${child.state.id}:parent-reference-mismatch`);
            continue;
        }
        const parentBase = parent.state.physical.baseAltitudeKm;
        const parentTop = parentBase + parent.state.physical.geometricDepthKm;
        const childBase = child.state.physical.baseAltitudeKm;
        const childTop = childBase + child.state.physical.geometricDepthKm;
        if (Math.min(parentTop, childTop) - Math.max(parentBase, childBase) <= 0) {
            diagnostics.push(`owner:${child.state.id}:disjoint-lineage-altitudes`);
            continue;
        }
        const attachment = metadata.horizontalAttachmentFraction;
        const overlap = metadata.verticalOverlapFraction;
        const ancestry = metadata.materialAncestryFraction;
        if (![attachment, overlap, ancestry].every((value) =>
            value !== undefined && finite(value) && value >= 0 && value <= 1) ||
            attachment === 0 || overlap === 0) {
            diagnostics.push(`owner:${child.state.id}:invalid-lineage-support`);
            continue;
        }
        const progress = metadata.transitionProgress;
        if (origin.kind === "mutatus" &&
            (!finite(progress ?? Number.NaN) || progress! <= 0 || progress! >= 1) ||
            origin.kind === "genitus" && progress !== undefined) {
            diagnostics.push(`owner:${child.state.id}:invalid-lineage-transition`);
            continue;
        }
        relationCandidates.push({ childIndex, parentIndex, relation: origin.kind });
    }

    // Count only records that survived source ownership and source validation.
    // Dividing a source by invalid/omitted owners would silently destroy
    // extinction and violate the one-source/one-transport-event invariant.
    const sourceUseCount = new Map<string, number>();
    for (const candidate of sourceCandidates) {
        sourceUseCount.set(candidate.sourceId,
            (sourceUseCount.get(candidate.sourceId) ?? 0) + 1);
    }

    const mutatusChildByParent = new Map<number, number>();
    const duplicateMutatusChildren = new Set<number>();
    for (const candidate of relationCandidates) {
        if (candidate.relation !== "mutatus") continue;
        const existing = mutatusChildByParent.get(candidate.parentIndex);
        if (existing === undefined) {
            mutatusChildByParent.set(candidate.parentIndex, candidate.childIndex);
            continue;
        }
        duplicateMutatusChildren.add(candidate.childIndex);
        diagnostics.push(
            `owner:${systems[candidate.childIndex].state.id}:duplicate-mutatus-child`,
        );
    }

    const parentByChild = new Map(relationCandidates.map((candidate) =>
        [candidate.childIndex, candidate.parentIndex]));
    const cyclicOwners = new Set<number>();
    for (const candidate of relationCandidates) {
        const path: number[] = [];
        const visited = new Map<number, number>();
        let cursor: number | undefined = candidate.childIndex;
        while (cursor !== undefined) {
            const earlier = visited.get(cursor);
            if (earlier !== undefined) {
                for (const owner of path.slice(earlier)) cyclicOwners.add(owner);
                break;
            }
            visited.set(cursor, path.length);
            path.push(cursor);
            cursor = parentByChild.get(cursor);
        }
    }
    if (cyclicOwners.size > 0) {
        diagnostics.push(`lineage:cycle:${[...cyclicOwners].sort((a, b) => a - b)
            .join(",")}`);
    }

    const candidates: Array<{ childIndex: number; record: CloudSourceLineageRecord }> = [];
    for (const candidate of sourceCandidates) {
        candidates.push({
            childIndex: candidate.childIndex,
            record: sourceRecord(candidate.source, candidate.sourceIndex,
                systems[candidate.childIndex], candidate.childIndex,
                1 / Math.max(1, sourceUseCount.get(candidate.sourceId) ?? 1)),
        });
    }
    for (const candidate of relationCandidates) {
        if (cyclicOwners.has(candidate.childIndex) ||
            cyclicOwners.has(candidate.parentIndex) ||
            duplicateMutatusChildren.has(candidate.childIndex)) continue;
        candidates.push({
            childIndex: candidate.childIndex,
            record: lineageRecord(systems[candidate.parentIndex],
                candidate.parentIndex, systems[candidate.childIndex],
                candidate.childIndex, candidate.relation),
        });
    }
    candidates.sort((left, right) => left.childIndex - right.childIndex ||
        left.record.identity[2] - right.record.identity[2]);
    const finiteCandidates = candidates.filter(({ record }, index) => {
        if (recordIsFinite(record)) return true;
        diagnostics.push(`record:${index}:non-finite-record`);
        return false;
    });
    const dropped = Math.max(0, finiteCandidates.length - capacity);
    const retainedCandidates = finiteCandidates.slice(0, capacity);
    const retainedSourceUseCount = new Map<number, number>();
    for (const { record } of retainedCandidates) {
        if (record.identity[2] !==
            CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin) continue;
        const sourceIndex = Math.round(record.ownership[1]);
        retainedSourceUseCount.set(sourceIndex,
            (retainedSourceUseCount.get(sourceIndex) ?? 0) + 1);
    }
    const records = retainedCandidates
        .map(({ record }, recordIndex) => {
            const isSource = record.identity[2] ===
                CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin;
            const retainedAllocation = isSource
                ? 1 / Math.max(1, retainedSourceUseCount.get(
                    Math.round(record.ownership[1]),
                ) ?? 1)
                : record.ownerWeights[3];
            return {
                ...record,
                ownership: [recordIndex, record.ownership[1],
                    record.ownership[2], record.ownership[3]] as Vec4,
                aerosolScattering: [record.aerosolScattering[0],
                    record.aerosolScattering[1], record.aerosolScattering[2],
                    retainedAllocation] as Vec4,
                ownerWeights: [record.ownerWeights[0], record.ownerWeights[1],
                    record.ownerWeights[2], retainedAllocation] as Vec4,
            };
        });
    const data = new Float32Array(
        (CLOUD_SOURCE_LINEAGE_HEADER_VEC4S +
            capacity * CLOUD_SOURCE_LINEAGE_VEC4_STRIDE) * 4,
    );
    data.set([
        CLOUD_SOURCE_LINEAGE_SCHEMA,
        records.length,
        CLOUD_SOURCE_LINEAGE_VEC4_STRIDE,
        capacity,
    ], 0);
    const sourceRecordCount = records.filter((record) =>
        record.identity[2] === CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin).length;
    const relationRecordCount = records.length - sourceRecordCount;
    data.set([dropped, sourceRecordCount, relationRecordCount,
        diagnostics.length], 4);
    data.set([
        snapshotTimeSeconds,
        ...CLOUD_SPECIAL_ORIGIN_RGB_WAVELENGTHS_MICRONS,
    ], 8);
    for (const [recordIndex, record] of records.entries()) {
        const floatOffset = (CLOUD_SOURCE_LINEAGE_HEADER_VEC4S +
            recordIndex * CLOUD_SOURCE_LINEAGE_VEC4_STRIDE) * 4;
        for (const [vectorIndex, vector] of recordVectors(record).entries()) {
            data.set(vector, floatOffset + vectorIndex * 4);
        }
    }
    return {
        data,
        records,
        count: records.length,
        capacity,
        dropped,
        sourceRecordCount,
        relationRecordCount,
        snapshotTimeSeconds,
        diagnostics,
    };
}

export interface CloudSourceLineageMediumSample {
    supportWeight: number;
    sourceWeight: number;
    lineageWeight: number;
    aerosolExtinctionRgbPerKm: Vec3;
    aerosolAbsorptionRgbPerKm: Vec3;
    aerosolScatteringRgbPerKm: Vec3;
    aerosolAsymmetry: number;
    composition: Vec3;
    velocityEastUpNorthMps: Vec3;
    parentOwnerIndex: number;
    childOwnerIndex: number;
    parentDensityWeight: number;
    childDensityWeight: number;
    densityUnionMode: number;
}

const compactWendlandC2 = (radius: number) => {
    if (!(radius < 1)) return 0;
    const remaining = 1 - Math.max(0, radius);
    return remaining ** 4 * (1 + 4 * Math.max(0, radius));
};

/** CPU parity evaluator for the binding-free WGSL source/manifold sampler. */
export function sampleCloudSourceLineageRecord(
    record: CloudSourceLineageRecord,
    worldPositionEastAltitudeNorthKm: Vec3,
    secondsFromSnapshot = 0,
): CloudSourceLineageMediumSample {
    const eventCode = Math.round(record.identity[2]);
    const geometryCode = Math.round(record.identity[3]);
    const relativeTime = Math.max(0, secondsFromSnapshot);
    const isSource = eventCode === CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin;
    const age = Math.max(0, record.centerAndAge[3] + relativeTime);
    const centerEast = record.centerAndAge[0] + record.advection[0] *
        (isSource ? age : relativeTime) / 1000;
    const centerNorth = record.centerAndAge[2] + record.advection[2] *
        (isSource ? age : relativeTime) / 1000;
    const deltaEast = worldPositionEastAltitudeNorthKm[0] - centerEast;
    const deltaAltitude = worldPositionEastAltitudeNorthKm[1] -
        record.centerAndAge[1];
    const deltaNorth = worldPositionEastAltitudeNorthKm[2] - centerNorth;
    const along = deltaEast * record.axisAndExtent[0] +
        deltaNorth * record.axisAndExtent[1];
    const cross = -deltaEast * record.axisAndExtent[1] +
        deltaNorth * record.axisAndExtent[0];
    const major = Math.max(0.02, record.axisAndExtent[2]);
    const minor = Math.max(0.02, record.axisAndExtent[3]);
    const vertical = Math.max(0.02, record.support[0]);
    let normalizedRadius: number;
    if (geometryCode === CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.line) {
        const axialOutside = Math.max(0, Math.abs(along) - major) / minor;
        normalizedRadius = Math.hypot(axialOutside, cross / minor,
            deltaAltitude / vertical);
    } else {
        normalizedRadius = Math.hypot(along / major, cross / minor,
            deltaAltitude / vertical);
    }
    const support = compactWendlandC2(normalizedRadius);
    const lifetime = Math.max(1, record.timingAndTransition[1]);
    const remaining = clamp(1 - age / lifetime);
    const lifecycleWeight = isSource
        ? clamp(remaining / 0.15) : 1;
    const allocation = isSource ? clamp(record.ownerWeights[3]) : 1;
    const weightedSupport = support * lifecycleWeight * allocation;
    const scaleRgb = (value: Vec4): Vec3 => [
        Math.max(0, value[0]) * weightedSupport,
        Math.max(0, value[1]) * weightedSupport,
        Math.max(0, value[2]) * weightedSupport,
    ];
    return {
        supportWeight: weightedSupport,
        sourceWeight: isSource ? weightedSupport : 0,
        lineageWeight: isSource ? 0 : support,
        aerosolExtinctionRgbPerKm: scaleRgb(record.aerosolExtinction),
        aerosolAbsorptionRgbPerKm: scaleRgb(record.aerosolAbsorption),
        aerosolScatteringRgbPerKm: scaleRgb(record.aerosolScattering),
        aerosolAsymmetry: clamp(record.aerosolExtinction[3], -0.2, 0.98),
        composition: [record.composition[0], record.composition[1],
            record.composition[2]],
        velocityEastUpNorthMps: [record.advection[0], record.advection[1],
            record.advection[2]],
        parentOwnerIndex: Math.round(record.ownership[2]),
        childOwnerIndex: Math.round(record.ownership[3]),
        parentDensityWeight: record.ownerWeights[0],
        childDensityWeight: record.ownerWeights[1],
        densityUnionMode: Math.round(record.ownerWeights[2]),
    };
}

/** CPU parity for the non-additive owner-density rule in the WGSL module. */
export function resolveCloudSourceLineageDensity(
    existingUnionDensity: number,
    parentDensity: number,
    childDensity: number,
    sample: CloudSourceLineageMediumSample,
) {
    const support = clamp(sample.lineageWeight);
    if (sample.densityUnionMode === 1) {
        const attachedUnion = Math.max(
            Math.max(0, parentDensity) * sample.parentDensityWeight,
            Math.max(0, childDensity) * sample.childDensityWeight,
        );
        return mix(existingUnionDensity, attachedUnion, support);
    }
    if (sample.densityUnionMode === 2) {
        const partitionedDensity =
            Math.max(0, parentDensity) * sample.parentDensityWeight +
            Math.max(0, childDensity) * sample.childDensityWeight;
        return mix(existingUnionDensity, partitionedDensity, support);
    }
    return existingUnionDensity;
}

export interface CloudSourceLineageRayInterval {
    nearKm: number;
    farKm: number;
    valid: boolean;
}

/**
 * Conservative renderer-space support used by the ordered event march.
 * Exact inclusion remains the compact local evaluator above; this sphere can
 * only schedule extra empty samples and therefore cannot clip a curved-Earth
 * line/area manifold.
 */
export function intersectCloudSourceLineageSupport(
    record: CloudSourceLineageRecord,
    rayOriginRendererKm: Vec3,
    rayDirectionRenderer: Vec3,
    secondsFromSnapshot = 0,
    planetRadiusKm = 6_371,
    farLimitKm = 140,
): CloudSourceLineageRayInterval {
    const invalid = () => ({
        nearKm: farLimitKm,
        farKm: -farLimitKm,
        valid: false,
    });
    if (record.identity[0] < 0.5 ||
        Math.abs(record.identity[1] - CLOUD_SOURCE_LINEAGE_SCHEMA) > 0.25) {
        return invalid();
    }
    const isSource = Math.round(record.identity[2]) ===
        CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin;
    const relativeTime = Math.max(0, secondsFromSnapshot);
    const age = Math.max(0, record.centerAndAge[3] + relativeTime);
    if (isSource && age >= Math.max(1, record.timingAndTransition[1])) {
        return invalid();
    }
    const centerTime = isSource ? age : relativeTime;
    const center: Vec3 = [
        record.centerAndAge[0] + record.advection[0] * centerTime / 1_000,
        planetRadiusKm + record.centerAndAge[1],
        record.centerAndAge[2] + record.advection[2] * centerTime / 1_000,
    ];
    const major = Math.max(0.02, record.axisAndExtent[2]);
    const minor = Math.max(0.02, record.axisAndExtent[3]);
    const vertical = Math.max(0.02, record.support[0]);
    const boundary = Math.max(0, record.support[1]);
    const line = Math.round(record.identity[3]) ===
        CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.line;
    const radius = (line
        ? Math.hypot(major, minor, vertical)
        : Math.max(major, minor, vertical)) + boundary;
    const offset = [
        rayOriginRendererKm[0] - center[0],
        rayOriginRendererKm[1] - center[1],
        rayOriginRendererKm[2] - center[2],
    ] as const;
    const a = rayDirectionRenderer[0] ** 2 +
        rayDirectionRenderer[1] ** 2 + rayDirectionRenderer[2] ** 2;
    const halfB = offset[0] * rayDirectionRenderer[0] +
        offset[1] * rayDirectionRenderer[1] +
        offset[2] * rayDirectionRenderer[2];
    const c = offset[0] ** 2 + offset[1] ** 2 + offset[2] ** 2 - radius ** 2;
    const discriminant = halfB ** 2 - a * c;
    if (a <= 1e-12 || discriminant < 0) {
        return invalid();
    }
    const root = Math.sqrt(Math.max(0, discriminant));
    const nearKm = Math.max(0, (-halfB - root) / a);
    const farKm = Math.min(farLimitKm, (-halfB + root) / a);
    return { nearKm, farKm, valid: farKm > nearKm };
}

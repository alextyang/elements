/**
 * Production bridge from renderer-neutral family foundations into the existing
 * CloudSystemState / CompiledCloudSystem ABI.
 *
 * The foundations distinguish an individual element from its complete weather
 * formation and expose locally varying phase/radius profiles. This adapter
 * integrates those profiles into the owner-level fields the current renderer
 * already packs, without adding a GPU binding or changing the 16-vec4 ABI.
 */

import {
    CLOUD_MOTHER_GENUS_RELATIONS,
    CLOUD_RENDERER_RECIPES,
    compileCloudSystem,
    type CloudCompilationResult,
    type CloudLifecycleStage,
    type CloudOrganizationState,
    type CloudPrecipitationKind,
    type CloudSystemState,
    type CloudTopologyExemplar,
    type CompiledCloudSystem,
} from "./cloud-state-map";
import {
    applyCloudSpecialOriginSource,
    type CloudSpecialOriginProductionMetadata,
    type CloudSpecialOriginSource,
} from "./cloud-special-origin-source";
import type { CloudSpecies } from "./cloud-scene";
import {
    HIGH_CLOUD_REACHABILITY_CONTRACTS,
    HIGH_CLOUD_SPECIES_DESCRIPTORS,
    HIGH_CLOUD_TOPOLOGY_VARIANTS,
    qualifyHighCloudProductionState,
    sampleHighCloudLocalMicrophysics,
    selectHighCloudTopologyVariant,
    type HighCloudOrganization,
    type HighCloudOrigin,
    type HighCloudSpecies,
} from "./high-cloud-physical-foundation";
import {
    MIDDLE_CLOUD_REACHABILITY_CONTRACTS,
    MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
    MIDDLE_CLOUD_TOPOLOGY_VARIANTS,
    qualifyMiddleCloudProductionState,
    sampleMiddleCloudLocalMicrophysics,
    selectMiddleCloudTopologyVariant,
    type MiddleCloudOrganization,
    type MiddleCloudOrigin,
    type MiddleCloudPrecipitation,
    type MiddleCloudRepresentation,
} from "./middle-cloud-physical-foundation";
import {
    LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
    LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS,
    LOW_LAYERED_REACHABILITY_CONTRACTS,
    qualifyLowLayeredSystemDomain,
    qualifyLowLayeredProductionState,
    resolveStratocumulusStratiformisOrganizationRegime,
    sampleLowLayeredLocalMicrophysics,
    selectLowLayeredCloudTopologyVariant,
    type CloudSystemPlacementMode,
    type LowLayeredCloudRepresentation,
    type LowLayeredOrganization,
    type LowLayeredOrigin,
    type LowLayeredPrecipitation,
    type PhysicalBoundaryMechanism,
    type StratocumulusStratiformisOrganizationRegime,
} from "./low-layered-cloud-physical-foundation";
import {
    UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
    UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS,
    qualifyUpperProductionState,
    selectUpperTopologyVariant,
    type UpperAtmosphericCloudRepresentation,
    type UpperOrganization,
    type UpperOrigin,
} from "./upper-atmospheric-cloud-foundation";
import {
    cirrostratusRepresentationFor,
    lowLayeredCloudRepresentationFor,
    middleCloudRepresentationFor,
} from "./cloud-family-admissibility";

type FoundationFamily =
    | "high"
    | "middle"
    | "low-layered"
    | "upper"
    | "specialized-convective";

export interface CloudCausalProductionMetadata {
    readonly relation: "genitus" | "mutatus";
    readonly motherGenus: string;
    readonly continuity:
        | "extension-partial-attachment"
        | "same-owner-internal-transformation";
    readonly lineageSeed: number;
    readonly materialAncestryFraction: number;
    readonly parentSystemId?: string;
    readonly childSystemId?: string;
    readonly crossOwner?: true;
    readonly horizontalAttachmentFraction?: number;
    readonly verticalOverlapFraction?: number;
    readonly transitionProgress?: number;
}

export interface CloudFamilyProductionMetadata {
    readonly family: FoundationFamily;
    readonly representation: string;
    readonly topologyVariantId: string;
    readonly formationSpanKm: number;
    readonly elementScaleKm: number;
    readonly reachabilityQualified: true;
    /** Authoritative Sc stratiformis organization, independent of seed/exemplar. */
    readonly organizationRegime?: StratocumulusStratiformisOrganizationRegime;
    /** Causal low-cloud origin selected by the physical foundation. */
    readonly lowLayeredOrigin?: LowLayeredOrigin;
    /**
     * Parent-shield anatomy is orthogonal to an Ns accessory or precipitation
     * feature. The atlas consumes this instead of guessing from a renderer
     * species name or from frame-local randomness.
     */
    readonly nimbostratusParentTopologyVariantId?:
        | "deepening-altostratus-shield"
        | "generating-cell-stratiform-shield"
        | "thickened-low-deck-nimbostratus";
    /** Separate wet-fragment owner state below a Nimbostratus shield. */
    readonly pannusUnderdeck?: {
        readonly parentOwnerId: string;
        readonly stage:
            | "incipient-separated-pannus"
            | "coalescing-pannus-underdeck"
            | "washout-limited-pannus";
        readonly coverageFraction: number;
        readonly fragmentCountScale: number;
        readonly parentMergeFraction: number;
        readonly washoutFraction: number;
    };
    /**
     * Scene/day-stable logical topology used for within-regime causal variety.
     * Physical Sc organization is carried separately by organizationRegime.
     */
    readonly logicalTopologyExemplarId?: string;
    readonly logicalTopologyConnectivity?: CloudTopologyExemplar["connectivity"];
    readonly lowLayeredDomain?: {
        readonly placement: CloudSystemPlacementMode;
        readonly boundaryMechanism: PhysicalBoundaryMechanism;
        readonly generatedFiniteSupport: true;
        readonly postDensityMaskWeight: 0;
    };
    readonly causalOrigin?: CloudCausalProductionMetadata;
    readonly specialOrigin?: CloudSpecialOriginProductionMetadata;
}

export interface CloudFamilyProductionAdapterInput {
    readonly state: CloudSystemState;
    readonly rendererSpecies: Exclude<CloudSpecies, "generic">;
    readonly deterministicSeed: number;
    /** The same species-qualified exemplar used by the macro-volume atlas. */
    readonly topologyExemplar?: CloudTopologyExemplar;
    /**
     * Optional family-foundation macroform lane. The macro atlas and the
     * physical family ontology intentionally have different cardinalities
     * (for example three reusable Ci-fibratus atlas anatomies but four
     * meteorological macroforms). Keeping this lane separate lets several
     * finite owners reuse one anatomy without collapsing the declared family
     * states or duplicating the volume asset.
     */
    readonly foundationTopologyVariantOrdinal?: number;
    /**
     * Physical formation-span variation between finite owners. This scales
     * the complete kilometre-scale formation, never its crystal/fibre width,
     * and therefore supplies a real near/mid/far hierarchy without a camera
     * or screen-space size transform.
     */
    readonly formationScale?: number;
    /**
     * The state came from `CloudScene.authoredSystems`, whose manifold is the
     * complete camera-independent physical owner rather than a sizing hint.
     * Family adaptation may refine material and internal organization but may
     * not silently replace this finite world-space domain.
     */
    readonly preserveAuthoredManifold?: boolean;
    readonly specialOriginSource?: CloudSpecialOriginSource;
}

export type CloudFamilyProductionAdapterResult = CloudCompilationResult & {
    readonly state: CloudSystemState;
    readonly metadata?: CloudFamilyProductionMetadata;
};

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (minimum: number, maximum: number, amount: number) =>
    minimum + (maximum - minimum) * amount;
const midpoint = (range: readonly [number, number]) =>
    (range[0] + range[1]) * 0.5;
const geometricMix = (
    range: readonly [number, number],
    amount: number,
) => range[0] * (range[1] / range[0]) ** clamp(amount);

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

const causalOriginState = (
    input: CloudFamilyProductionAdapterInput,
): { state: CloudSystemState; metadata?: CloudCausalProductionMetadata } => {
    const origin = input.state.classification.origin;
    if (origin.kind !== "genitus" && origin.kind !== "mutatus") {
        return { state: input.state };
    }
    const lineageSeed = (input.deterministicSeed ^ textHash(origin.motherGenus) ^
        (origin.kind === "genitus" ? 0x67e91 : 0x4d87a)) >>> 0;
    const lineage = unitHash(lineageSeed, 0x19c73);
    const materialBias = unitHash(lineageSeed, 0x82b4f);
    const relationIsGenitus = origin.kind === "genitus";
    const orientationOffset = (lineage - 0.5) *
        (relationIsGenitus ? 0.16 : 0.3);
    const orientation = input.state.extent.orientation + orientationOffset;
    const partialAttachment = relationIsGenitus ? 0.74 + lineage * 0.14 : 0.94;
    const crossFraction = relationIsGenitus ? 0.78 + materialBias * 0.12
        : 0.9 + materialBias * 0.16;
    const displacement = relationIsGenitus
        ? input.state.extent.majorRadiusKm * (0.12 + lineage * 0.12) : 0;
    const liquidScale = relationIsGenitus
        ? 0.82 + materialBias * 0.22 : 0.9 + materialBias * 0.2;
    const iceScale = relationIsGenitus
        ? 0.88 + (1 - materialBias) * 0.2 : 0.86 + (1 - materialBias) * 0.26;
    const materialAncestryFraction = relationIsGenitus
        ? 0.28 + materialBias * 0.24 : 0.72 + materialBias * 0.2;
    return {
        state: {
            ...input.state,
            extent: {
                ...input.state.extent,
                centerEastKm: input.state.extent.centerEastKm +
                    Math.cos(orientation) * displacement,
                centerNorthKm: input.state.extent.centerNorthKm +
                    Math.sin(orientation) * displacement,
                majorRadiusKm: input.state.extent.majorRadiusKm * partialAttachment,
                minorRadiusKm: input.state.extent.minorRadiusKm * crossFraction,
                orientation,
                boundaryTransitionKm: input.state.extent.boundaryTransitionKm *
                    (relationIsGenitus ? 1.18 : 1.06),
            },
            physical: {
                ...input.state.physical,
                kinematics: {
                    ...input.state.physical.kinematics,
                    windSpeed: input.state.physical.kinematics.windSpeed *
                        (0.96 + lineage * 0.08),
                    windDirection: input.state.physical.kinematics.windDirection +
                        orientationOffset * (relationIsGenitus ? 0.35 : 0.7),
                    verticalShear: input.state.physical.kinematics.verticalShear *
                        (relationIsGenitus ? 0.92 : 1.04),
                },
                condensate: {
                    ...input.state.physical.condensate,
                    liquidWaterPath: input.state.physical.condensate.liquidWaterPath *
                        liquidScale,
                    iceWaterPath: input.state.physical.condensate.iceWaterPath * iceScale,
                },
            },
        },
        metadata: {
            relation: origin.kind,
            motherGenus: origin.motherGenus,
            continuity: relationIsGenitus
                ? "extension-partial-attachment"
                : "same-owner-internal-transformation",
            lineageSeed,
            materialAncestryFraction,
        },
    };
};

const withCausalMetadata = (
    result: CloudFamilyProductionAdapterResult,
    causalOrigin: CloudCausalProductionMetadata | undefined,
): CloudFamilyProductionAdapterResult => {
    if (!causalOrigin || !result.metadata) return result;
    return {
        ...result,
        metadata: { ...result.metadata, causalOrigin },
    };
};

const withSpecialOriginState = (
    result: CloudFamilyProductionAdapterResult,
    source: CloudSpecialOriginSource | undefined,
    deterministicSeed: number,
): CloudFamilyProductionAdapterResult => {
    if (result.state.classification.origin.kind !== "special") return result;
    const special = applyCloudSpecialOriginSource(
        result.state,
        source,
        deterministicSeed,
    );
    if (special.issues.length > 0) {
        return {
            state: result.state,
            issues: special.issues.map((issue) => ({
                path: "classification.origin.source",
                code: issue.code,
                severity: "error" as const,
                message: issue.message,
            })),
        };
    }
    const compiled = compileCloudSystem(special.state);
    if (!compiled.compiled) return { ...compiled, state: special.state };
    const priorGeometry = result.compiled?.geometry;
    return {
        ...compiled,
        state: special.state,
        compiled: {
            ...compiled.compiled,
            ...(priorGeometry ? {
                geometry: {
                    ...compiled.compiled.geometry,
                    elementScaleKm: priorGeometry.elementScaleKm,
                    verticalAspect: priorGeometry.verticalAspect,
                    supportBandFraction: priorGeometry.supportBandFraction,
                    extent: { ...special.state.extent },
                },
            } : {}),
        },
        ...(result.metadata ? {
            metadata: {
                ...result.metadata,
                formationSpanKm: special.state.extent.majorRadiusKm * 2,
                ...(result.metadata.lowLayeredDomain ? {
                    lowLayeredDomain: {
                        ...result.metadata.lowLayeredDomain,
                        // A finite generating source is a localized world
                        // domain even when the ambient layer reports overcast.
                        // It cannot inherit the ordinary synoptic placement
                        // selected before source geometry is applied.
                        placement: "distant-finite-system" as const,
                        boundaryMechanism: source?.kind === "waterfall-spray" ||
                            source?.kind === "forest-evapotranspiration"
                            ? "topographic-moisture-boundary" as const
                            : result.metadata.lowLayeredDomain.boundaryMechanism,
                    },
                } : {}),
                ...(special.metadata ? { specialOrigin: special.metadata } : {}),
            },
        } : {}),
    };
};

export interface CloudCrossOwnerCausalRelationshipInput {
    readonly parentState: CloudSystemState;
    readonly childState: CloudSystemState;
    readonly relation: "genitus" | "mutatus";
    readonly deterministicSeed: number;
    readonly transitionProgress?: number;
}

export interface CloudCrossOwnerCausalRelationshipIssue {
    readonly code: string;
    readonly message: string;
}

export interface CloudCrossOwnerCausalRelationshipResult {
    readonly parentState: CloudSystemState;
    readonly childState: CloudSystemState;
    readonly metadata?: CloudCausalProductionMetadata;
    readonly issues: readonly CloudCrossOwnerCausalRelationshipIssue[];
}

const mixAngle = (from: number, to: number, amount: number) => {
    const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
    return from + delta * amount;
};

const condensateTotal = (state: CloudSystemState) =>
    state.physical.condensate.liquidWaterPath +
    state.physical.condensate.iceWaterPath;

const verticalOverlapFraction = (
    parent: CloudSystemState,
    child: CloudSystemState,
) => {
    const parentTop = parent.physical.baseAltitudeKm +
        parent.physical.geometricDepthKm;
    const childTop = child.physical.baseAltitudeKm +
        child.physical.geometricDepthKm;
    const overlap = Math.max(0,
        Math.min(parentTop, childTop) -
        Math.max(parent.physical.baseAltitudeKm, child.physical.baseAltitudeKm));
    return overlap / Math.max(0.02, Math.min(
        parent.physical.geometricDepthKm,
        child.physical.geometricDepthKm,
    ));
};

/**
 * Couple two already family-qualified owners into one meteorological lineage.
 * The relationship is resolved after both foundations have produced their
 * target morphologies, so attachment cannot be overwritten by a later family
 * extent pass.
 */
export function applyCloudCrossOwnerCausalRelationship(
    input: CloudCrossOwnerCausalRelationshipInput,
): CloudCrossOwnerCausalRelationshipResult {
    const { parentState, childState, relation } = input;
    const issues: CloudCrossOwnerCausalRelationshipIssue[] = [];
    const issue = (code: string, message: string) => issues.push({ code, message });
    const origin = childState.classification.origin;
    if (parentState.id === childState.id) {
        issue("self-causal-owner", "A cloud owner cannot be its own causal parent.");
    }
    if (origin.kind !== relation) {
        issue("causal-relation-origin-mismatch",
            `Assignment ${relation} does not match child origin ${origin.kind}.`);
    } else if (origin.motherGenus !== parentState.classification.genus) {
        issue("causal-parent-genus-mismatch",
            `${origin.motherGenus} was authored as mother, but the linked owner is ` +
            `${parentState.classification.genus}.`);
    } else if (!CLOUD_MOTHER_GENUS_RELATIONS[childState.classification.genus]
        [relation].includes(parentState.classification.genus)) {
        issue("invalid-cross-owner-mother-relation",
            `${parentState.classification.genus} cannot produce ` +
            `${childState.classification.genus} ${relation}.`);
    }
    const verticalOverlap = verticalOverlapFraction(parentState, childState);
    if (verticalOverlap <= 0) {
        issue("detached-causal-altitudes",
            "Mother and child need a shared vertical formation interface.");
    }
    const requestedProgress = input.transitionProgress ??
        mix(0.38, 0.72, unitHash(input.deterministicSeed, 0x6b37));
    if (!Number.isFinite(requestedProgress) || requestedProgress <= 0 ||
        requestedProgress >= 1) {
        issue("invalid-mutatus-progress",
            "A visible two-owner transition requires progress strictly between 0 and 1.");
    }
    if (issues.length > 0) {
        return { parentState, childState, issues };
    }

    const lineageSeed = (input.deterministicSeed ^ textHash(parentState.id) ^
        textHash(childState.id) ^ (relation === "genitus" ? 0x71a5 : 0x4d27)) >>> 0;
    if (relation === "genitus") {
        const parentExtent = parentState.extent;
        const targetExtent = childState.extent;
        const directionSign = unitHash(lineageSeed, 0xe18d) < 0.5 ? -1 : 1;
        const direction = parentExtent.orientation + (directionSign < 0 ? Math.PI : 0);
        const attachmentAngle = direction +
            (unitHash(lineageSeed, 0x2f81) - 0.5) * 0.28;
        const majorRadiusKm = clamp(targetExtent.majorRadiusKm,
            Math.max(0.2, parentExtent.majorRadiusKm * 0.28),
            Math.max(0.25, parentExtent.majorRadiusKm * 2.2));
        const minorRadiusKm = clamp(targetExtent.minorRadiusKm,
            0.2, Math.min(majorRadiusKm,
                Math.max(0.25, parentExtent.minorRadiusKm * 1.65)));
        // Place the daughter through the mother's perimeter.  This is an
        // actual overlapping formation support, not an edge alpha fade.
        const attachmentDistanceKm = parentExtent.majorRadiusKm * 0.68 +
            majorRadiusKm * 0.18;
        const crossOffsetKm = parentExtent.minorRadiusKm *
            (unitHash(lineageSeed, 0x8c53) - 0.5) * 0.22;
        const crossAngle = attachmentAngle + Math.PI * 0.5;
        const sharedWindDirection = mixAngle(
            parentState.physical.kinematics.windDirection,
            childState.physical.kinematics.windDirection,
            0.28,
        );
        const ancestry = mix(0.42, 0.68, unitHash(lineageSeed, 0x91b7));
        const parentCondensate = parentState.physical.condensate;
        const childCondensate = childState.physical.condensate;
        const liquidWaterPath = clamp(
            childCondensate.liquidWaterPath * (1 - ancestry * 0.42) +
            parentCondensate.liquidWaterPath * ancestry * 0.12,
            0,
            5,
        );
        const iceWaterPath = clamp(
            childCondensate.iceWaterPath * (1 - ancestry * 0.2) +
            parentCondensate.iceWaterPath * ancestry * 0.46,
            0,
            3,
        );
        const total = Math.max(1e-6, liquidWaterPath + iceWaterPath);
        const attachedChild: CloudSystemState = {
            ...childState,
            extent: {
                ...targetExtent,
                centerEastKm: parentExtent.centerEastKm +
                    Math.cos(attachmentAngle) * attachmentDistanceKm +
                    Math.cos(crossAngle) * crossOffsetKm,
                centerNorthKm: parentExtent.centerNorthKm +
                    Math.sin(attachmentAngle) * attachmentDistanceKm +
                    Math.sin(crossAngle) * crossOffsetKm,
                majorRadiusKm,
                minorRadiusKm,
                orientation: mixAngle(parentExtent.orientation,
                    targetExtent.orientation, 0.24),
                boundaryTransitionKm: Math.min(majorRadiusKm * 0.42,
                    Math.max(0.08, targetExtent.boundaryTransitionKm * 0.84)),
            },
            physical: {
                ...childState.physical,
                thermodynamics: {
                    ...childState.physical.thermodynamics,
                    relativeHumidity: Math.max(
                        childState.physical.thermodynamics.relativeHumidity,
                        parentState.physical.thermodynamics.relativeHumidity * 0.94,
                    ),
                    entrainment: mix(
                        parentState.physical.thermodynamics.entrainment,
                        childState.physical.thermodynamics.entrainment,
                        0.48,
                    ),
                },
                kinematics: {
                    ...childState.physical.kinematics,
                    windSpeed: mix(parentState.physical.kinematics.windSpeed,
                        childState.physical.kinematics.windSpeed, 0.32),
                    windDirection: sharedWindDirection,
                    verticalShear: mix(
                        parentState.physical.kinematics.verticalShear,
                        childState.physical.kinematics.verticalShear,
                        0.45,
                    ),
                },
                condensate: {
                    ...childCondensate,
                    liquidWaterPath,
                    iceWaterPath,
                    liquidFraction: liquidWaterPath / total,
                },
            },
        };
        const normalizedDistance = attachmentDistanceKm /
            Math.max(0.2, parentExtent.majorRadiusKm + majorRadiusKm);
        return {
            parentState,
            childState: attachedChild,
            issues: [],
            metadata: {
                relation,
                motherGenus: parentState.classification.genus,
                continuity: "extension-partial-attachment",
                lineageSeed,
                materialAncestryFraction: ancestry,
                parentSystemId: parentState.id,
                childSystemId: childState.id,
                crossOwner: true,
                horizontalAttachmentFraction: clamp(1 - normalizedDistance),
                verticalOverlapFraction: clamp(verticalOverlap),
            },
        };
    }

    const progress = requestedProgress;
    const parentExtent = parentState.extent;
    const targetExtent = childState.extent;
    const sharedWindDirection = mixAngle(
        parentState.physical.kinematics.windDirection,
        childState.physical.kinematics.windDirection,
        progress,
    );
    const sharedWindSpeed = mix(parentState.physical.kinematics.windSpeed,
        childState.physical.kinematics.windSpeed, progress);
    const parentCondensate = parentState.physical.condensate;
    const targetCondensate = childState.physical.condensate;
    const parentTotal = condensateTotal(parentState);
    const targetTotal = condensateTotal(childState);
    const conservedTotal = mix(parentTotal, targetTotal, progress);
    const parentLiquidFraction = parentTotal > 0
        ? parentCondensate.liquidWaterPath / parentTotal
        : parentCondensate.liquidFraction;
    const targetLiquidFraction = targetTotal > 0
        ? targetCondensate.liquidWaterPath / targetTotal
        : targetCondensate.liquidFraction;
    const childLiquidFraction = mix(parentLiquidFraction,
        targetLiquidFraction, progress);
    const parentMass = conservedTotal * (1 - progress);
    const childMass = conservedTotal * progress;
    const transitionedParent: CloudSystemState = {
        ...parentState,
        physical: {
            ...parentState.physical,
            kinematics: {
                ...parentState.physical.kinematics,
                windSpeed: sharedWindSpeed,
                windDirection: sharedWindDirection,
                verticalShear: mix(
                    parentState.physical.kinematics.verticalShear,
                    childState.physical.kinematics.verticalShear,
                    progress,
                ),
            },
            condensate: {
                ...parentCondensate,
                liquidWaterPath: parentMass * parentLiquidFraction,
                iceWaterPath: parentMass * (1 - parentLiquidFraction),
                liquidFraction: parentLiquidFraction,
            },
        },
    };
    const transitionedChild: CloudSystemState = {
        ...childState,
        extent: {
            ...targetExtent,
            centerEastKm: mix(parentExtent.centerEastKm,
                targetExtent.centerEastKm, progress * 0.12),
            centerNorthKm: mix(parentExtent.centerNorthKm,
                targetExtent.centerNorthKm, progress * 0.12),
            majorRadiusKm: mix(parentExtent.majorRadiusKm,
                targetExtent.majorRadiusKm, progress),
            minorRadiusKm: mix(parentExtent.minorRadiusKm,
                targetExtent.minorRadiusKm, progress),
            orientation: mixAngle(parentExtent.orientation,
                targetExtent.orientation, progress * 0.28),
            boundaryTransitionKm: mix(parentExtent.boundaryTransitionKm,
                targetExtent.boundaryTransitionKm, progress),
        },
        physical: {
            ...childState.physical,
            thermodynamics: {
                ...childState.physical.thermodynamics,
                relativeHumidity: mix(
                    parentState.physical.thermodynamics.relativeHumidity,
                    childState.physical.thermodynamics.relativeHumidity,
                    progress,
                ),
                entrainment: mix(
                    parentState.physical.thermodynamics.entrainment,
                    childState.physical.thermodynamics.entrainment,
                    progress,
                ),
            },
            kinematics: {
                ...childState.physical.kinematics,
                windSpeed: sharedWindSpeed,
                windDirection: sharedWindDirection,
                verticalShear: transitionedParent.physical.kinematics.verticalShear,
            },
            condensate: {
                ...targetCondensate,
                liquidWaterPath: childMass * childLiquidFraction,
                iceWaterPath: childMass * (1 - childLiquidFraction),
                liquidFraction: childLiquidFraction,
                dropletEffectiveRadius: mix(
                    parentCondensate.dropletEffectiveRadius,
                    targetCondensate.dropletEffectiveRadius,
                    progress,
                ),
                iceEffectiveRadius: mix(
                    parentCondensate.iceEffectiveRadius,
                    targetCondensate.iceEffectiveRadius,
                    progress,
                ),
            },
        },
    };
    return {
        parentState: transitionedParent,
        childState: transitionedChild,
        issues: [],
        metadata: {
            relation,
            motherGenus: parentState.classification.genus,
            continuity: "same-owner-internal-transformation",
            lineageSeed,
            materialAncestryFraction: 1 - progress * 0.22,
            parentSystemId: parentState.id,
            childSystemId: childState.id,
            crossOwner: true,
            horizontalAttachmentFraction: 1,
            verticalOverlapFraction: clamp(verticalOverlap),
            transitionProgress: progress,
        },
    };
}

const lifecycleOrder: readonly CloudLifecycleStage[] = [
    "incipient", "growing", "mature", "glaciating", "precipitating", "decaying",
];

const nearestLifecycle = (
    requested: CloudLifecycleStage,
    available: readonly CloudLifecycleStage[],
) => available.reduce((nearest, candidate) =>
    Math.abs(lifecycleOrder.indexOf(candidate) - lifecycleOrder.indexOf(requested)) <
        Math.abs(lifecycleOrder.indexOf(nearest) - lifecycleOrder.indexOf(requested))
        ? candidate : nearest, available[0]);

const opticalDepthFor = (state: CloudSystemState) => {
    const condensate = state.physical.condensate;
    const liquidRadiusMetres = condensate.dropletEffectiveRadius * 1e-6;
    const iceRadiusMetres = condensate.iceEffectiveRadius * 1e-6;
    const liquid = liquidRadiusMetres > 0
        ? 3 * condensate.liquidWaterPath / (2 * 1000 * liquidRadiusMetres) : 0;
    const ice = iceRadiusMetres > 0
        ? 3 * condensate.iceWaterPath / (2 * 917 * iceRadiusMetres) : 0;
    return liquid + ice;
};

const precipitationForMiddle = (
    kind: CloudPrecipitationKind,
): MiddleCloudPrecipitation => kind === "shower" || kind === "hail"
    ? "rain" : kind === "drizzle" ? "rain" : kind;

const precipitationForLow = (
    kind: CloudPrecipitationKind,
): LowLayeredPrecipitation => kind === "shower" || kind === "hail"
    ? "rain" : kind;

const adaptedOrganization = (
    organization: CloudOrganizationState,
    elementScaleKm: number,
    formationSpanKm: number,
    formationAspectRatio: number,
    boundaryTransitionKm: number,
    wavelengthKm?: number,
    preserveMesoscaleOrganization = false,
): CloudOrganizationState => {
    const crossSpan = Math.max(
        elementScaleKm,
        formationSpanKm / Math.max(1, formationAspectRatio),
    );
    switch (organization.kind) {
        case "point-process": return {
            ...organization,
            meanSpacingKm: Math.max(elementScaleKm * 1.35,
                Math.sqrt(elementScaleKm * formationSpanKm) * 0.62),
            minimumSeparationKm: Math.max(elementScaleKm * 0.72, 0.02),
            clusterRadiusKm: Math.max(crossSpan, formationSpanKm * 0.18),
        };
        case "cellular": return {
            ...organization,
            meanCellDiameterKm: preserveMesoscaleOrganization
                ? organization.meanCellDiameterKm : elementScaleKm,
            wallWidthFraction: clamp(organization.wallWidthFraction, 0.08, 0.48),
        };
        case "banded": return {
            ...organization,
            bandSpacingKm: preserveMesoscaleOrganization
                ? organization.bandSpacingKm
                : wavelengthKm ?? Math.max(elementScaleKm * 1.8, 0.1),
            lengthKm: formationSpanKm,
        };
        case "frontal-shield": return {
            ...organization,
            alongFrontLengthKm: formationSpanKm,
            crossFrontDepthKm: crossSpan,
            leadingTransitionKm: boundaryTransitionKm,
            trailingTransitionKm: boundaryTransitionKm * 1.35,
        };
        case "wave-packet": return {
            ...organization,
            wavelengthKm: wavelengthKm ?? Math.max(elementScaleKm * 1.7, 0.1),
            packetLengthKm: formationSpanKm,
            crestCount: Math.max(1, Math.round(
                formationSpanKm /
                Math.max(wavelengthKm ?? elementScaleKm * 1.7, 0.1),
            )),
        };
        case "storm-complex": return organization;
    }
};

const adaptedExtent = (
    state: CloudSystemState,
    elementScaleKm: number,
    formationSpanKm: number,
    formationAspectRatio: number,
    boundaryTransitionKm: number,
    preserveAuthoredManifold = false,
) => {
    if (preserveAuthoredManifold) return { ...state.extent };
    const majorRadiusKm = formationSpanKm * 0.5;
    const minorRadiusKm = Math.max(
        0.2,
        elementScaleKm * 0.55,
        majorRadiusKm / Math.max(1, formationAspectRatio),
        Math.min(state.extent.minorRadiusKm, majorRadiusKm),
    );
    return {
        ...state.extent,
        majorRadiusKm,
        minorRadiusKm: Math.min(majorRadiusKm, minorRadiusKm),
        boundaryTransitionKm: Math.min(
            majorRadiusKm * 0.45,
            Math.max(0.02, boundaryTransitionKm),
        ),
    };
};

const withLifecycle = (
    state: CloudSystemState,
    stage: CloudLifecycleStage,
) => ({
    ...state,
    lifecycle: { ...state.lifecycle, stage },
});

const withMicrophysics = (
    state: CloudSystemState,
    liquidFraction: number,
    liquidRadiusMicrons: number,
    iceRadiusMicrons: number,
    relativeCondensate: number,
    opticalDepthRange?: readonly [number, number],
) => {
    const depthKm = state.physical.geometricDepthKm;
    const baselineOpticalDepth = opticalDepthFor(state);
    const unboundedOpticalDepth = baselineOpticalDepth *
        mix(0.72, 1.28, relativeCondensate);
    const targetOpticalDepth = opticalDepthRange
        ? clamp(unboundedOpticalDepth, opticalDepthRange[0], opticalDepthRange[1])
        : Math.max(0.001, unboundedOpticalDepth);
    const boundedLiquid = clamp(liquidFraction);
    const liquidWaterPath = targetOpticalDepth * boundedLiquid *
        2 * 1000 * (liquidRadiusMicrons * 1e-6) / 3;
    const iceWaterPath = targetOpticalDepth * (1 - boundedLiquid) *
        2 * 917 * (iceRadiusMicrons * 1e-6) / 3;
    return {
        ...state,
        physical: {
            ...state.physical,
            condensate: {
                liquidWaterPath: clamp(liquidWaterPath, 0, 5),
                iceWaterPath: clamp(iceWaterPath, 0, 3),
                liquidFraction: boundedLiquid,
                dropletEffectiveRadius: liquidRadiusMicrons,
                iceEffectiveRadius: iceRadiusMicrons,
            },
        },
        targetOpticalDepth,
        depthKm,
    };
};

const finalize = (
    state: CloudSystemState,
    metadata: CloudFamilyProductionMetadata,
    verticalAspect: number,
    supportBandFraction: number,
) => {
    const result = compileCloudSystem(state);
    if (!result.compiled) return { ...result, state };
    const compiled: CompiledCloudSystem = {
        ...result.compiled,
        geometry: {
            ...result.compiled.geometry,
            elementScaleKm: metadata.elementScaleKm,
            verticalAspect,
            supportBandFraction,
            extent: { ...state.extent },
        },
        organizationKind: state.organization.kind,
    };
    return {
        issues: result.issues,
        state,
        compiled,
        metadata,
    } satisfies CloudFamilyProductionAdapterResult;
};

const compatibleVariant = <Variant extends {
    readonly id: string;
    readonly origins: readonly string[];
    readonly lifecycleStages: readonly CloudLifecycleStage[];
}>(
    variants: readonly Variant[],
    selectedId: string,
    stage: CloudLifecycleStage,
    preferredOrigin: string,
) => {
    const start = Math.max(0, variants.findIndex(({ id }) => id === selectedId));
    const ordered = variants.map((_, offset) => variants[(start + offset) % variants.length]);
    return ordered.find((variant) =>
        variant.lifecycleStages.includes(stage) &&
        variant.origins.includes(preferredOrigin)) ??
        ordered.find((variant) => variant.lifecycleStages.includes(stage)) ?? ordered[0];
};

const selectedFoundationVariantId = <Variant extends { readonly id: string }>(
    variants: readonly Variant[],
    fallbackId: string,
    exemplar?: CloudTopologyExemplar,
    foundationTopologyVariantOrdinal?: number,
) => foundationTopologyVariantOrdinal !== undefined
    ? variants[
        Math.abs(Math.trunc(foundationTopologyVariantOrdinal)) % variants.length
    ]?.id ?? fallbackId
    : exemplar
        ? variants[exemplar.ordinal % variants.length]?.id ?? fallbackId
        : fallbackId;

const logicalTopologyMetadata = (input: CloudFamilyProductionAdapterInput) =>
    input.topologyExemplar ? {
        logicalTopologyExemplarId: input.topologyExemplar.id,
        logicalTopologyConnectivity: input.topologyExemplar.connectivity,
    } as const : {};

const semanticHighOrigin = (state: CloudSystemState): HighCloudOrigin => {
    const origin = state.classification.origin;
    if (origin.kind === "genitus" && origin.motherGenus === "cumulonimbus") {
        return "cumulonimbus-genitus";
    }
    if (state.organization.kind === "wave-packet") return "gravity-wave";
    return "natural";
};

const highOrganization = (
    state: CloudSystemState,
    legal: readonly HighCloudOrganization[],
): HighCloudOrganization => {
    const preferred: HighCloudOrganization = state.organization.kind === "wave-packet"
        ? "finite-wave-packet"
        : state.organization.kind === "banded" ? "banded"
            : state.organization.kind === "cellular" ? "extensive-sheet"
                : state.classification.species === "castellanus"
                    ? "common-base-line" : "aperiodic-field";
    return legal.includes(preferred) ? preferred : legal[0];
};

const formationSpanFor = (
    input: CloudFamilyProductionAdapterInput,
    sampledSpanKm: number,
) => input.preserveAuthoredManifold
    ? input.state.extent.majorRadiusKm * 2
    : sampledSpanKm * clamp(input.formationScale ?? 1, 0.32, 2.0);

const formationAspectFor = (
    input: CloudFamilyProductionAdapterInput,
    sampledAspectRatio: number,
) => input.preserveAuthoredManifold
    ? input.state.extent.majorRadiusKm /
        Math.max(0.001, input.state.extent.minorRadiusKm)
    : sampledAspectRatio;

const boundaryTransitionFor = (
    input: CloudFamilyProductionAdapterInput,
    sampledTransitionKm: number,
) => input.preserveAuthoredManifold
    ? input.state.extent.boundaryTransitionKm
    : sampledTransitionKm;

const adaptHighCloud = (
    input: CloudFamilyProductionAdapterInput,
    species: HighCloudSpecies,
): CloudFamilyProductionAdapterResult => {
    const contract = HIGH_CLOUD_REACHABILITY_CONTRACTS[species];
    const transientSupercooledCavum = species.startsWith("cirrocumulus-") &&
        input.state.classification.supplementaryFeatures.includes("cavum");
    const descriptor = HIGH_CLOUD_SPECIES_DESCRIPTORS[species];
    const stage = nearestLifecycle(input.state.lifecycle.stage, contract.lifecycleStages);
    const preferredOrigin = semanticHighOrigin(input.state);
    const selected = selectHighCloudTopologyVariant(species, input.deterministicSeed);
    const variant = compatibleVariant(
        HIGH_CLOUD_TOPOLOGY_VARIANTS[species],
        selectedFoundationVariantId(
            HIGH_CLOUD_TOPOLOGY_VARIANTS[species],
            selected.id,
            input.topologyExemplar,
            input.foundationTopologyVariantOrdinal,
        ),
        stage,
        preferredOrigin,
    );
    const origin = variant.origins.includes(preferredOrigin)
        ? preferredOrigin : variant.origins[0];
    const organization = highOrganization(input.state, contract.organizations);
    const t = 0.18 + unitHash(input.deterministicSeed, 0x15a4) * 0.64;
    const elementScaleKm = geometricMix(descriptor.elementDiameterKm, t);
    const sampledFormationSpanKm = Math.max(
        geometricMix(
            descriptor.formationSpanKm,
            0.16 + unitHash(input.deterministicSeed, 0x27b9) * 0.68,
        ),
        Math.min(descriptor.formationSpanKm[1], input.state.extent.majorRadiusKm * 2),
    );
    const formationSpanKm = input.preserveAuthoredManifold
        ? formationSpanFor(input, sampledFormationSpanKm)
        : clamp(
            formationSpanFor(input, sampledFormationSpanKm),
            descriptor.formationSpanKm[0],
            descriptor.formationSpanKm[1],
        );
    const formationAspectRatio = formationAspectFor(input, geometricMix(
        variant.formationAspectRatio,
        0.2 + unitHash(input.deterministicSeed, 0x318f) * 0.6,
    ));
    const verticalAspect = mix(
        descriptor.verticalAspect[0], descriptor.verticalAspect[1], t,
    );
    const hierarchy = midpoint(variant.hierarchyLevels);
    const supportBandFraction = clamp(0.12 + 0.72 / hierarchy, 0.1, 0.38);
    const boundaryTransitionKm = boundaryTransitionFor(input, Math.max(
        elementScaleKm,
        formationSpanKm / formationAspectRatio,
    ) * 0.34);
    let state = withLifecycle(input.state, stage);
    const turbulenceDissipation = Math.min(
        state.physical.kinematics.turbulenceDissipation,
        contract.maximumTurbulenceDissipation * 0.96,
    );
    state = {
        ...state,
        physical: {
            ...state.physical,
            kinematics: { ...state.physical.kinematics, turbulenceDissipation },
        },
    };
    const heights = [0.18, 0.5, 0.82] as const;
    const samples = heights.map((height, index) =>
        sampleHighCloudLocalMicrophysics({
            species,
            normalizedHeight: height,
            trailFraction: clamp((1 - height) *
                (state.physical.precipitation.kind === "none" ? 0.28 : 0.82) +
                unitHash(input.deterministicSeed, 0x4100 + index) * 0.12),
            denseCoreFraction: clamp(0.56 +
                unitHash(input.deterministicSeed, 0x5200 + index) * 0.34),
            waveCrestFraction: species.startsWith("cirrocumulus-")
                ? 0.45 + unitHash(input.deterministicSeed, 0x6300 + index) * 0.45 : 0.1,
            lifecycleStage: stage,
            origin,
            temperatureKelvin: mix(
                state.physical.thermodynamics.baseTemperatureKelvin,
                state.physical.thermodynamics.topTemperatureKelvin,
                height,
            ),
            turbulenceDissipation,
        }));
    const weight = samples.reduce((sum, sample) => sum + sample.relativeCondensate, 0);
    const average = (selector: (sample: (typeof samples)[number]) => number) =>
        samples.reduce((sum, sample) =>
            sum + selector(sample) * sample.relativeCondensate, 0) /
        Math.max(1e-6, weight);
    const micro = withMicrophysics(
        state,
        transientSupercooledCavum
            ? Math.max(0.28, 1 - average((sample) => sample.iceFraction))
            : 1 - average((sample) => sample.iceFraction),
        average((sample) => sample.liquidEffectiveRadiusMicrons),
        average((sample) => sample.iceEffectiveRadiusMicrons),
        weight / samples.length,
    );
    const foundationInstability = Math.max(
        contract.minimumInstability,
        clamp((1 - micro.physical.thermodynamics.stabilityIndex) * 0.5),
    );
    const finiteExtent = adaptedExtent(
        micro,
        elementScaleKm,
        formationSpanKm,
        formationAspectRatio,
        boundaryTransitionKm,
        input.preserveAuthoredManifold,
    );
    // The atlas packets for these two small high-cloud species are complete
    // finite formations, not axial ribbons. Their descriptor aspect bands
    // permit a materially wider crosswind envelope than the generic seeded
    // ellipse, which keeps the authored support resolvable from an oblique
    // ground view without changing element diameter or optical depth.
    const minimumCrosswindFraction = species === "cirrocumulus-floccus"
        ? 0.36 : 0;
    state = {
        ...micro,
        physical: {
            ...micro.physical,
            thermodynamics: {
                ...micro.physical.thermodynamics,
                stabilityIndex: 1 - foundationInstability * 2,
            },
        },
        extent: minimumCrosswindFraction > 0
            ? {
                ...finiteExtent,
                minorRadiusKm: Math.max(
                    finiteExtent.minorRadiusKm,
                    finiteExtent.majorRadiusKm * minimumCrosswindFraction,
                ),
            }
            : finiteExtent,
    };
    state = {
        ...state,
        organization: adaptedOrganization(
            state.organization,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
        ),
    };
    const precipitationKind = contract.precipitationKinds.includes(
        state.physical.precipitation.kind,
    ) ? state.physical.precipitation.kind : contract.precipitationKinds[0];
    if (precipitationKind !== state.physical.precipitation.kind) {
        state = {
            ...state,
            physical: {
                ...state.physical,
                precipitation: precipitationKind === "none"
                    ? { kind: "none", rate: 0, terminalVelocity: 0, evaporationDepthKm: 0 }
                    : {
                        ...state.physical.precipitation,
                        kind: precipitationKind,
                        evaporationDepthKm: Math.max(
                            0.1,
                            state.physical.precipitation.evaporationDepthKm,
                        ),
                    },
            },
        };
    }
    const qualification = qualifyHighCloudProductionState({
        species,
        lifecycleStage: stage,
        origin,
        organization,
        precipitationKind,
        instability: foundationInstability,
        turbulenceDissipation,
        sedimentationStrength: average((sample) => sample.sedimentationWeight),
        iceFraction: 1 - state.physical.condensate.liquidFraction,
        transientSupercooledCavum,
    });
    if (!qualification.legal) {
        return {
            state,
            issues: qualification.violations.map((violation) => ({
                path: "familyProduction.high",
                code: violation,
                severity: "error" as const,
                message: `${species} failed its production foundation: ${violation}.`,
            })),
        };
    }
    return finalize(state, {
        family: "high",
        representation: species,
        topologyVariantId: variant.id,
        formationSpanKm,
        elementScaleKm,
        reachabilityQualified: true,
        ...logicalTopologyMetadata(input),
    }, verticalAspect, supportBandFraction);
};

const semanticMiddleOrigin = (
    state: CloudSystemState,
    representation: MiddleCloudRepresentation,
): MiddleCloudOrigin => {
    if (state.organization.kind === "wave-packet") {
        return representation.includes("lenticularis")
            ? "orographic-wave" : "gravity-wave";
    }
    if (representation.startsWith("altostratus-")) return "frontal-ascent";
    if (representation.endsWith("volutus")) return "shear-layer-roll";
    return "natural";
};

const adaptMiddleCloud = (
    input: CloudFamilyProductionAdapterInput,
    representation: MiddleCloudRepresentation,
): CloudFamilyProductionAdapterResult => {
    const descriptor = MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
    const contract = MIDDLE_CLOUD_REACHABILITY_CONTRACTS[representation];
    const stage = nearestLifecycle(input.state.lifecycle.stage, contract.lifecycleStages);
    const preferredOrigin = semanticMiddleOrigin(input.state, representation);
    const selected = selectMiddleCloudTopologyVariant(
        representation,
        input.deterministicSeed,
    );
    const variant = compatibleVariant(
        MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation],
        selectedFoundationVariantId(
            MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation],
            selected.id,
            input.topologyExemplar,
        ),
        stage,
        preferredOrigin,
    );
    const origin = variant.origins.includes(preferredOrigin)
        ? preferredOrigin : variant.origins[0];
    const organization: MiddleCloudOrganization = contract.organizations[
        Math.abs(input.deterministicSeed) % contract.organizations.length
    ];
    const t = 0.18 + unitHash(input.deterministicSeed, 0x91a3) * 0.64;
    const formationSpanKm = formationSpanFor(input, Math.max(
        geometricMix(
            descriptor.formationSpanKm,
            0.14 + unitHash(input.deterministicSeed, 0xa21d) * 0.68,
        ),
        Math.min(descriptor.formationSpanKm[1], input.state.extent.majorRadiusKm * 2),
    ));
    const formationAspectRatio = formationAspectFor(input, geometricMix(
        variant.formationAspectRatio,
        0.2 + unitHash(input.deterministicSeed, 0xb307) * 0.6,
    ));
    const elementScaleKm = descriptor.elementDiameterKm
        ? geometricMix(descriptor.elementDiameterKm, t)
        : Math.max(0.18, Math.min(
            formationSpanKm * 0.08,
            input.state.physical.geometricDepthKm * formationAspectRatio * 0.36,
        ));
    const verticalAspect = descriptor.elementDiameterKm
        ? mix(descriptor.verticalAspect[0], descriptor.verticalAspect[1], t)
        : clamp(input.state.physical.geometricDepthKm / elementScaleKm, 0.02, 1);
    const supportBandFraction = clamp(
        0.12 + 0.8 / midpoint(variant.hierarchyLevels),
        0.1,
        0.42,
    );
    const boundaryTransitionKm = boundaryTransitionFor(input, Math.max(
        elementScaleKm * 0.6,
        formationSpanKm / formationAspectRatio * 0.22,
    ));
    let state = withLifecycle(input.state, stage);
    const turbulenceDissipation = Math.min(
        state.physical.kinematics.turbulenceDissipation,
        contract.maximumTurbulenceDissipation * 0.96,
    );
    state = {
        ...state,
        physical: {
            ...state.physical,
            kinematics: { ...state.physical.kinematics, turbulenceDissipation },
        },
    };
    let precipitation = precipitationForMiddle(state.physical.precipitation.kind);
    if (!contract.precipitation.includes(precipitation)) {
        precipitation = contract.precipitation.includes("virga") &&
            state.physical.precipitation.kind !== "none" ? "virga"
            : contract.precipitation[0];
    }
    const baselineOpticalDepth = opticalDepthFor(state);
    const qualifiedOpticalDepth = clamp(
        baselineOpticalDepth,
        contract.opticalDepth[0],
        contract.opticalDepth[1],
    );
    const samples = ([0.16, 0.5, 0.86] as const).map((height, index) =>
        sampleMiddleCloudLocalMicrophysics({
            representation,
            normalizedHeight: height,
            cellCoreFraction: 0.58 +
                unitHash(input.deterministicSeed, 0xc100 + index) * 0.34,
            waveCrestFraction: state.organization.kind === "wave-packet"
                ? 0.58 + unitHash(input.deterministicSeed, 0xc200 + index) * 0.34
                : 0.16,
            trailFraction: precipitation === "none" ? 0.08
                : clamp((1 - height) * 0.72),
            lifecycleStage: stage,
            origin,
            temperatureKelvin: mix(
                state.physical.thermodynamics.baseTemperatureKelvin,
                state.physical.thermodynamics.topTemperatureKelvin,
                height,
            ),
            turbulenceDissipation,
            opticalDepth: qualifiedOpticalDepth,
            precipitation,
        }));
    const weight = samples.reduce((sum, sample) => sum + sample.relativeCondensate, 0);
    const average = (selector: (sample: (typeof samples)[number]) => number) =>
        samples.reduce((sum, sample) =>
            sum + selector(sample) * sample.relativeCondensate, 0) /
        Math.max(1e-6, weight);
    const micro = withMicrophysics(
        state,
        average((sample) => sample.liquidFraction),
        average((sample) => sample.liquidEffectiveRadiusMicrons),
        average((sample) => sample.iceEffectiveRadiusMicrons),
        weight / samples.length,
        descriptor.opticalDepth,
    );
    const foundationInstability = Math.max(
        contract.minimumInstability,
        clamp((1 - micro.physical.thermodynamics.stabilityIndex) * 0.5),
    );
    state = {
        ...micro,
        physical: {
            ...micro.physical,
            thermodynamics: {
                ...micro.physical.thermodynamics,
                stabilityIndex: 1 - foundationInstability * 2,
            },
        },
        extent: adaptedExtent(
            micro,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            input.preserveAuthoredManifold,
        ),
    };
    const wavelengthKm = variant.connectivity === "finite-wave-lens" ||
        variant.connectivity === "undulating-layer" ||
        variant.connectivity === "parallel-band-layer"
        ? Math.max(elementScaleKm * 1.8, formationSpanKm / 8) : undefined;
    state = {
        ...state,
        organization: adaptedOrganization(
            state.organization,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            wavelengthKm,
        ),
    };
    const qualification = qualifyMiddleCloudProductionState({
        representation,
        lifecycleStage: stage,
        origin,
        organization,
        precipitation,
        instability: foundationInstability,
        turbulenceDissipation,
        opticalDepth: micro.targetOpticalDepth,
        environment: "day-oblique-natural",
    });
    if (!qualification.legal) {
        return {
            state,
            issues: qualification.violations.map((violation) => ({
                path: "familyProduction.middle",
                code: violation,
                severity: "error" as const,
                message: `${representation} failed its production foundation: ${violation}.`,
            })),
        };
    }
    return finalize(state, {
        family: "middle",
        representation,
        topologyVariantId: variant.id,
        formationSpanKm,
        elementScaleKm,
        reachabilityQualified: true,
        ...logicalTopologyMetadata(input),
    }, verticalAspect, supportBandFraction);
};

const semanticLowOrigin = (
    state: CloudSystemState,
    representation: LowLayeredCloudRepresentation,
    deterministicSeed: number,
    candidateOrigins?: readonly LowLayeredOrigin[],
): LowLayeredOrigin => {
    if (representation.startsWith("nimbostratus")) {
        const origins = candidateOrigins?.length
            ? candidateOrigins : ["altostratus-thickening"] as const;
        return origins[Math.abs(deterministicSeed) % origins.length];
    }
    if (representation === "stratus-fractus") return "dry-fractus-transition";
    if (representation === "stratus-nebulosus") return "radiative-cooling";
    if (state.organization.kind === "wave-packet") return "orographic-wave";
    return "marine-boundary-layer";
};

const lowLayeredBoundaryMechanism = (
    representation: LowLayeredCloudRepresentation,
    scBoundary?: PhysicalBoundaryMechanism,
): PhysicalBoundaryMechanism => {
    if (representation === "stratocumulus-stratiformis" && scBoundary) {
        return scBoundary;
    }
    if (representation === "stratocumulus-lenticularis" ||
        representation === "stratocumulus-volutus") {
        return "finite-wave-support";
    }
    if (representation.startsWith("nimbostratus")) {
        return "frontal-moisture-gradient";
    }
    if (representation === "stratocumulus-stratiformis") {
        return "cellular-cold-pool-perimeter";
    }
    return "entrainment-eroded";
};

const lowLayeredUsesImmediateOvercast = (
    representation: LowLayeredCloudRepresentation,
    coverageOktas: number,
) => coverageOktas >= 5.76 && (
    representation === "stratus-nebulosus" ||
    representation === "stratocumulus-stratiformis" ||
    representation.startsWith("nimbostratus")
);

const placeLowLayeredFormationDomain = (
    state: CloudSystemState,
    representation: LowLayeredCloudRepresentation,
    placementOverride?: CloudSystemPlacementMode,
): CloudSystemState => {
    const extent = state.extent;
    const bearing = Math.atan2(extent.centerEastKm, extent.centerNorthKm);
    const currentRange = Math.hypot(
        extent.centerEastKm,
        extent.centerNorthKm,
    );
    // Ragged Stratus is a shallow sheared formation, not a radial spear. Keep
    // its long axis broadly across the observer ray with deterministic weather
    // variance; this permits genuinely nearby shreds while the finite domain
    // still remains outside the observer. The substantial jitter prevents a
    // concentric screen-space arc pattern around the full horizon.
    const orientation = representation === "stratus-fractus"
        ? -bearing + (unitHash(textHash(state.id), 0x1bd71) - 0.5) * 0.72
        : extent.orientation;
    const radialEast = Math.sin(bearing);
    const radialNorth = Math.cos(bearing);
    const downwindEast = Math.cos(orientation);
    const downwindNorth = Math.sin(orientation);
    const crosswindEast = -downwindNorth;
    const crosswindNorth = downwindEast;
    const radialSupportKm = Math.hypot(
        extent.majorRadiusKm * (
            radialEast * downwindEast + radialNorth * downwindNorth
        ),
        extent.minorRadiusKm * (
            radialEast * crosswindEast + radialNorth * crosswindNorth
        ),
    );
    const placement = placementOverride ?? (
        lowLayeredUsesImmediateOvercast(
            representation,
            state.physical.coverageOktas,
        ) ? "immediate-overcast" : "distant-finite-system"
    );
    const immediate = placement !== "distant-finite-system";
    // An immediate ceiling contains the fixed Earth-local observer inside its
    // finite condensation domain. A distant bank remains outside even after
    // the physical foundation expands its formation span. This corrects the
    // old contradictory state where one giant radius was assigned after range
    // placement and silently swallowed the camera.
    const authoredDistantRangeKm = representation === "stratus-nebulosus"
        ? Math.min(currentRange, 60)
        : currentRange;
    const rangeKm = immediate
        ? Math.min(currentRange, extent.minorRadiusKm * 0.34)
        : Math.max(
            authoredDistantRangeKm,
            radialSupportKm + extent.boundaryTransitionKm * 1.08,
        );
    return {
        ...state,
        extent: {
            ...extent,
            orientation,
            centerEastKm: Math.sin(bearing) * rangeKm,
            centerNorthKm: Math.cos(bearing) * rangeKm,
        },
    };
};

const scOrganizationForRegime = (
    organization: CloudOrganizationState,
    regime: StratocumulusStratiformisOrganizationRegime,
    formationSpanKm: number,
): CloudOrganizationState => {
    if (regime === "street") {
        if (organization.kind === "banded") return organization;
        const cellScale = organization.kind === "cellular"
            ? organization.meanCellDiameterKm : Math.max(0.5, formationSpanKm / 8);
        const orientation = "orientation" in organization
            ? organization.orientation : 0;
        return {
            kind: "banded",
            bandSpacingKm: Math.max(0.1, cellScale * 1.8),
            bandWidthFraction: organization.kind === "cellular"
                ? clamp(organization.wallWidthFraction, 0.1, 0.58) : 0.28,
            lengthKm: formationSpanKm,
            curvature: organization.kind === "cellular"
                ? (organization.centerJitter - 0.5) * 0.24 : 0,
            orientation,
        };
    }
    const topology = regime === "closed-cell" ? "closed"
        : regime === "open-cell" ? "open" : "lacunar";
    if (organization.kind === "cellular") {
        return { ...organization, topology };
    }
    const orientation = "orientation" in organization
        ? organization.orientation : 0;
    return {
        kind: "cellular",
        topology,
        // Mesoscale circulation cells are deliberately distinct from the
        // smaller visible flattened masses represented by elementScaleKm.
        meanCellDiameterKm: clamp(formationSpanKm / 7, 1.5, 42),
        wallWidthFraction: regime === "open-cell" ? 0.20
            : regime === "sparse-transition" ? 0.24 : 0.40,
        centerJitter: regime === "closed-cell" ? 0.34 : 0.52,
        anisotropy: 1,
        orientation,
    };
};

const adaptLowLayeredCloud = (
    input: CloudFamilyProductionAdapterInput,
    representation: LowLayeredCloudRepresentation,
): CloudFamilyProductionAdapterResult => {
    const descriptor = LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
    const reachability = LOW_LAYERED_REACHABILITY_CONTRACTS[representation];
    const scRegime = representation === "stratocumulus-stratiformis"
        ? resolveStratocumulusStratiformisOrganizationRegime({
            organization: input.state.organization,
            lifecycleStage: input.state.lifecycle.stage,
            coverageOktas: input.state.physical.coverageOktas,
            precipitationEfficiency:
                input.state.lifecycle.precipitationEfficiency,
            precipitationKind: input.state.physical.precipitation.kind,
            varieties: input.state.classification.varieties,
            strictAuthored: input.preserveAuthoredManifold,
        })
        : undefined;
    if (input.preserveAuthoredManifold && scRegime?.violations.length) {
        return {
            state: input.state,
            issues: scRegime.violations.map((violation) => ({
                path: "familyProduction.lowLayered.organizationRegime",
                code: violation,
                severity: "error" as const,
                message: `Authored ${representation} organization is not physical: ` +
                    `${violation}.`,
            })),
        };
    }
    const selected = selectLowLayeredCloudTopologyVariant(
        representation,
        input.deterministicSeed,
    );
    const scVariant = scRegime
        ? LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation].find(
            ({ id }) => id === scRegime.foundationVariantId,
        )
        : undefined;
    const stage = nearestLifecycle(
        input.state.lifecycle.stage,
        scVariant?.lifecycleStages ?? reachability.lifecycleStages,
    );
    const selectedVariantId = selectedFoundationVariantId(
        LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation],
        selected.id,
        input.topologyExemplar,
    );
    const selectedVariant = LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[
        representation
    ].find(({ id }) => id === selectedVariantId) ?? selected;
    const preferredOrigin = semanticLowOrigin(
        input.state,
        representation,
        input.deterministicSeed,
        selectedVariant.origins,
    );
    const variant = scVariant ?? compatibleVariant(
        LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation],
        selectedVariantId,
        stage,
        preferredOrigin,
    );
    const origin = variant.origins.includes(preferredOrigin)
        ? preferredOrigin : variant.origins[0];
    const organization: LowLayeredOrganization = scRegime
        ? scRegime.regime === "closed-cell"
            ? unitHash(input.deterministicSeed, 0xcf11) > 0.76
                ? "aperiodic-flattened-deck" : "closed-cell-deck"
            : scRegime.regime === "open-cell"
                ? unitHash(input.deterministicSeed, 0x0f31) > 0.82
                    ? "actinoform-cluster" : "open-cell-deck"
                : scRegime.regime === "street"
                    ? "cloud-streets"
                    : "closed-open-transition-mosaic"
        : variant.organizations[
            Math.abs(input.deterministicSeed) % variant.organizations.length
        ];
    const t = 0.18 + unitHash(input.deterministicSeed, 0xd173) * 0.64;
    let formationSpanKm = formationSpanFor(input, Math.max(
        geometricMix(
            descriptor.formationSpanKm,
            0.12 + unitHash(input.deterministicSeed, 0xe28d) * 0.68,
        ),
        Math.min(descriptor.formationSpanKm[1], input.state.extent.majorRadiusKm * 2),
    ));
    if (representation === "stratus-nebulosus" &&
        !input.preserveAuthoredManifold &&
        !lowLayeredUsesImmediateOvercast(
            representation,
            input.state.physical.coverageOktas,
        )) {
        // A 200–500 km Stratus shield may be real, but from a surface observer
        // its far edge lies below the geometric horizon. A *distant bank*
        // state therefore materializes a finite local 5–60 km sector; the
        // extensive shield belongs to the mutually exclusive immediate state.
        formationSpanKm = Math.min(formationSpanKm, 60);
    }
    if (scRegime && !input.preserveAuthoredManifold) {
        // A 48^3 macrovolume is a resolved local sector, not a 900 km atlas
        // stretched until kilometre-scale cells become continental blobs.
        formationSpanKm = scRegime.placement === "immediate-overcast"
            ? clamp(formationSpanKm, 18, 64)
            : scRegime.placement === "immediate-broken-field"
                ? clamp(formationSpanKm, 12, 96)
                : clamp(formationSpanKm, 8, 120);
    }
    const formationAspectRatio = formationAspectFor(input, geometricMix(
        variant.formationAspectRatio,
        0.18 + unitHash(input.deterministicSeed, 0xf397) * 0.62,
    ));
    const elementScaleKm = descriptor.elementDiameterKm
        ? geometricMix(descriptor.elementDiameterKm, t)
        : Math.max(0.12, Math.min(
            formationSpanKm * 0.065,
            input.state.physical.geometricDepthKm * formationAspectRatio * 0.3,
        ));
    const verticalAspect = clamp(
        input.state.physical.geometricDepthKm / elementScaleKm,
        0.025,
        descriptor.genus === "nimbostratus" ? 1.4 : 1.8,
    );
    const supportBandFraction = clamp(
        0.14 + 0.86 / midpoint(variant.hierarchyLevels),
        0.1,
        0.46,
    );
    const boundaryTransitionKm = boundaryTransitionFor(input, clamp(
        geometricMix(
            variant.boundaryCorrelationKm,
            0.18 + unitHash(input.deterministicSeed, 0x104a1) * 0.64,
        ),
        formationSpanKm * 0.0025,
        formationSpanKm * 0.24,
    ));
    let state = withLifecycle(input.state, stage);
    let precipitation = precipitationForLow(state.physical.precipitation.kind);
    if (representation === "stratus-fractus") precipitation = "none";
    if (representation === "nimbostratus-virga") precipitation = "virga";
    if (representation === "nimbostratus-praecipitatio" ||
        representation === "nimbostratus-pannus") {
        precipitation = state.physical.condensate.liquidFraction < 0.28
            ? "snow" : "rain";
    }
    const baselineOpticalDepth = opticalDepthFor(state);
    const qualifiedOpticalDepth = clamp(
        baselineOpticalDepth,
        descriptor.opticalDepth[0],
        descriptor.opticalDepth[1],
    );
    const normalizedMeltingLevel = state.physical.formation.freezingLevelKm >
        state.physical.baseAltitudeKm &&
        state.physical.formation.freezingLevelKm <
            state.physical.baseAltitudeKm + state.physical.geometricDepthKm
        ? (state.physical.formation.freezingLevelKm - state.physical.baseAltitudeKm) /
            state.physical.geometricDepthKm : null;
    const samples = ([0.14, 0.5, 0.88] as const).map((height, index) =>
        sampleLowLayeredLocalMicrophysics({
            representation,
            normalizedHeight: height,
            normalizedBoundaryDistance: 0.48 +
                unitHash(input.deterministicSeed, 0x11500 + index) * 0.46,
            coherentCoreFraction: 0.58 +
                unitHash(input.deterministicSeed, 0x12600 + index) * 0.34,
            lifecycleStage: stage,
            origin,
            temperatureKelvin: mix(
                state.physical.thermodynamics.baseTemperatureKelvin,
                state.physical.thermodynamics.topTemperatureKelvin,
                height,
            ),
            turbulenceDissipation: state.physical.kinematics.turbulenceDissipation,
            opticalDepth: qualifiedOpticalDepth,
            precipitation,
            normalizedMeltingLevel,
        }));
    const weight = samples.reduce((sum, sample) => sum + sample.relativeCondensate, 0);
    const average = (selector: (sample: (typeof samples)[number]) => number) =>
        samples.reduce((sum, sample) =>
            sum + selector(sample) * sample.relativeCondensate, 0) /
        Math.max(1e-6, weight);
    const scLiquidRadiusScale = scRegime?.regime === "open-cell" ? 1.12
        : scRegime?.regime === "sparse-transition" ? 1.08
            : scRegime?.regime === "street" ? 1.03 : 1;
    const scCondensateScale = scRegime?.regime === "open-cell" ? 0.88
        : scRegime?.regime === "sparse-transition" ? 0.78
            : scRegime?.regime === "street" ? 0.92
                : scRegime?.placement === "immediate-overcast" ? 1.08 : 1;
    const micro = withMicrophysics(
        state,
        average((sample) => sample.liquidFraction),
        clamp(
            average((sample) => sample.liquidEffectiveRadiusMicrons) *
                scLiquidRadiusScale,
            representation === "stratocumulus-stratiformis" ? 7 : 2,
            representation === "stratocumulus-stratiformis" ? 21 : 30,
        ),
        average((sample) => sample.iceEffectiveRadiusMicrons),
        weight / samples.length * scCondensateScale,
        descriptor.opticalDepth,
    );
    const foundationInstability = representation === "stratocumulus-castellanus"
        ? Math.max(
            0.25,
            clamp((1 - micro.physical.thermodynamics.stabilityIndex) * 0.5),
        )
        : clamp((1 - micro.physical.thermodynamics.stabilityIndex) * 0.5);
    const regimeOrganization = scRegime
        ? scOrganizationForRegime(
            micro.organization,
            scRegime.regime,
            formationSpanKm,
        )
        : micro.organization;
    const adaptedState = {
        ...micro,
        organization: regimeOrganization,
        physical: {
            ...micro.physical,
            thermodynamics: {
                ...micro.physical.thermodynamics,
                stabilityIndex: 1 - foundationInstability * 2,
            },
        },
        extent: adaptedExtent(
            micro,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            input.preserveAuthoredManifold,
        ),
    };
    state = input.preserveAuthoredManifold
        ? adaptedState
        : placeLowLayeredFormationDomain(
            adaptedState,
            representation,
            scRegime?.placement,
        );
    const wavelengthKm = variant.connectivity === "finite-lens" ||
        variant.connectivity === "finite-roll"
        ? Math.max(elementScaleKm * 1.8, formationSpanKm / 7) : undefined;
    state = {
        ...state,
        organization: adaptedOrganization(
            state.organization,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            wavelengthKm,
            Boolean(scRegime),
        ),
    };
    const qualification = qualifyLowLayeredProductionState({
        representation,
        lifecycleStage: stage,
        origin,
        organization,
        precipitation,
        opticalDepth: micro.targetOpticalDepth,
        instability: foundationInstability,
        environment: "day-oblique-natural",
    });
    if (!qualification.legal) {
        return {
            state,
            issues: qualification.violations.map((violation) => ({
                path: "familyProduction.lowLayered",
                code: violation,
                severity: "error" as const,
                message: `${representation} failed its production foundation: ${violation}.`,
            })),
        };
    }
    const placement: CloudSystemPlacementMode = scRegime?.placement ?? (
        lowLayeredUsesImmediateOvercast(
            representation,
            state.physical.coverageOktas,
        ) ? "immediate-overcast" : "distant-finite-system"
    );
    const immediate = placement !== "distant-finite-system";
    const boundaryMechanism = lowLayeredBoundaryMechanism(
        representation,
        scRegime?.boundaryMechanism,
    );
    const domainQualification = qualifyLowLayeredSystemDomain({
        representation,
        placement,
        boundaryMechanism,
        horizontalSpanKm: state.extent.majorRadiusKm * 2,
        boundaryTransitionKm: state.extent.boundaryTransitionKm,
        cameraInsideCondensateDomain: immediate,
        // The complete population projection is checked by the runtime. Here
        // the foundation gate verifies the mutually exclusive authored state.
        skyCoverageFraction: placement === "immediate-overcast"
            ? 0.9
            : placement === "immediate-broken-field"
                ? clamp(state.physical.coverageOktas / 8, 0.18, 0.82)
                : Math.min(0.72, state.physical.coverageOktas / 8),
        horizonContactFraction: immediate ? 0.7 : 0.24,
        generatedFiniteSupport: true,
        postDensityMaskWeight: 0,
    });
    if (!domainQualification.valid) {
        return {
            state,
            issues: domainQualification.violations.map((violation) => ({
                path: "familyProduction.lowLayeredDomain",
                code: violation,
                severity: "error" as const,
                message: `${representation} failed its finite domain foundation: ` +
                    `${violation}.`,
            })),
        };
    }
    const nimbostratusParentTopologyVariantId = representation.startsWith(
        "nimbostratus",
    )
        ? variant.id === "deepening-altostratus-shield" ||
            variant.id === "generating-cell-stratiform-shield" ||
            variant.id === "thickened-low-deck-nimbostratus"
            ? variant.id
            : origin === "stratocumulus-thickening" ||
                origin === "altocumulus-thickening"
                ? "thickened-low-deck-nimbostratus"
                : origin === "altostratus-thickening"
                    ? "generating-cell-stratiform-shield"
                    : unitHash(input.deterministicSeed, 0x19b73) > 0.72
                        ? "thickened-low-deck-nimbostratus"
                        : "generating-cell-stratiform-shield"
        : undefined;
    return finalize(state, {
        family: "low-layered",
        representation,
        topologyVariantId: variant.id,
        formationSpanKm,
        elementScaleKm,
        reachabilityQualified: true,
        lowLayeredOrigin: origin,
        ...(nimbostratusParentTopologyVariantId ? {
            nimbostratusParentTopologyVariantId,
        } : {}),
        ...(scRegime ? { organizationRegime: scRegime.regime } : {}),
        ...logicalTopologyMetadata(input),
        lowLayeredDomain: {
            placement,
            boundaryMechanism,
            generatedFiniteSupport: true,
            postDensityMaskWeight: 0,
        },
    }, verticalAspect, supportBandFraction);
};

const adaptCirrostratus = (
    input: CloudFamilyProductionAdapterInput,
    representation: UpperAtmosphericCloudRepresentation,
): CloudFamilyProductionAdapterResult => {
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
    const allVariants = UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[representation];
    const availableStages = [...new Set(allVariants.flatMap((variant) =>
        variant.lifecycleStages))];
    const stage = nearestLifecycle(input.state.lifecycle.stage, availableStages);
    const selected = selectUpperTopologyVariant(representation, input.deterministicSeed);
    const preferredOrigin: UpperOrigin = input.state.organization.kind === "wave-packet"
        ? "gravity-wave" : "natural-frontal";
    const variant = compatibleVariant(
        allVariants,
        selectedFoundationVariantId(
            allVariants,
            selected.id,
            input.topologyExemplar,
        ),
        stage,
        preferredOrigin,
    );
    const origin = (variant.origins.includes(preferredOrigin)
        ? preferredOrigin : variant.origins[0]) as UpperOrigin;
    const organization = variant.organizations[
        Math.abs(input.deterministicSeed) % variant.organizations.length
    ] as UpperOrganization;
    const t = 0.18 + unitHash(input.deterministicSeed, 0x137b3) * 0.64;
    const formationSpanKm = formationSpanFor(input, Math.max(
        geometricMix(descriptor.formationSpanKm,
            0.1 + unitHash(input.deterministicSeed, 0x148cd) * 0.66),
        Math.min(descriptor.formationSpanKm[1], input.state.extent.majorRadiusKm * 2),
    ));
    const formationAspectRatio = formationAspectFor(input, geometricMix(
        variant.formationAspectRatio,
        0.18 + unitHash(input.deterministicSeed, 0x159d7) * 0.62,
    ));
    const elementScaleKm = Math.max(0.16, Math.min(
        formationSpanKm * 0.06,
        input.state.physical.geometricDepthKm * formationAspectRatio * 0.28,
    ));
    const verticalAspect = clamp(
        input.state.physical.geometricDepthKm / elementScaleKm,
        0.01,
        0.6,
    );
    const supportBandFraction = clamp(
        0.1 + 0.78 / midpoint(variant.hierarchyLevels),
        0.08,
        0.34,
    );
    const boundaryTransitionKm = boundaryTransitionFor(input, Math.max(
        elementScaleKm,
        formationSpanKm / formationAspectRatio,
    ) * 0.24);
    let state = withLifecycle(input.state, stage);
    const iceRadiusMicrons = geometricMix(descriptor.particleDiameterMicrons, t) * 0.5;
    const micro = withMicrophysics(
        state,
        0,
        8,
        iceRadiusMicrons,
        0.62 + unitHash(input.deterministicSeed, 0x16ae1) * 0.28,
        descriptor.opticalDepth,
    );
    state = {
        ...micro,
        extent: adaptedExtent(
            micro,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            input.preserveAuthoredManifold,
        ),
    };
    state = {
        ...state,
        organization: adaptedOrganization(
            state.organization,
            elementScaleKm,
            formationSpanKm,
            formationAspectRatio,
            boundaryTransitionKm,
            variant.wavelengthKm ? geometricMix(variant.wavelengthKm, t) : undefined,
        ),
    };
    const qualification = qualifyUpperProductionState({
        representation,
        latitudeDegrees: 40,
        month: 4,
        altitudeKm: state.physical.baseAltitudeKm,
        temperatureKelvin: state.physical.thermodynamics.topTemperatureKelvin,
        solarDepressionDegrees: -3,
        viewElevationDegrees: 35,
        environment: "day-oblique-natural",
        hasOrographicOrSevereStormGravityWave: true,
        hasCirrusRadiatusCompanion: true,
        origin,
        organization,
        lifecycleStage: stage,
    });
    if (!qualification.legal) {
        return {
            state,
            issues: qualification.violations.map((violation) => ({
                path: "familyProduction.upper",
                code: violation,
                severity: "error" as const,
                message: `${representation} failed its production foundation: ${violation}.`,
            })),
        };
    }
    return finalize(state, {
        family: "upper",
        representation,
        topologyVariantId: variant.id,
        formationSpanKm,
        elementScaleKm,
        reachabilityQualified: true,
        ...logicalTopologyMetadata(input),
    }, verticalAspect, supportBandFraction);
};

/**
 * Compile one owner through its family foundation. Cu/Cb deliberately remain
 * on their specialized state-map/deep-convection path.
 */
export const adaptCloudFamilyProduction = (
    input: CloudFamilyProductionAdapterInput,
): CloudFamilyProductionAdapterResult => {
    const causal = causalOriginState(input);
    const workingInput = { ...input, state: causal.state };
    const finish = (result: CloudFamilyProductionAdapterResult) =>
        withSpecialOriginState(
            withCausalMetadata(result, causal.metadata),
            input.specialOriginSource,
            input.deterministicSeed,
        );
    if (
        workingInput.rendererSpecies.startsWith("cumulus-") ||
        workingInput.rendererSpecies.startsWith("cumulonimbus-")
    ) {
        if (!causal.metadata &&
            workingInput.state.classification.origin.kind !== "special") {
            return {
                ...compileCloudSystem(workingInput.state),
                state: workingInput.state,
            };
        }
        const recipe = CLOUD_RENDERER_RECIPES[workingInput.rendererSpecies];
        return finish({
            ...compileCloudSystem(workingInput.state),
            state: workingInput.state,
            metadata: {
                family: "specialized-convective",
                representation: workingInput.rendererSpecies,
                topologyVariantId: "specialized-deep-convection",
                formationSpanKm: workingInput.state.extent.majorRadiusKm * 2,
                elementScaleKm: midpoint(recipe.elementScaleKm),
                reachabilityQualified: true,
                ...logicalTopologyMetadata(workingInput),
            },
        });
    }
    if (Object.hasOwn(HIGH_CLOUD_SPECIES_DESCRIPTORS, workingInput.rendererSpecies)) {
        return finish(adaptHighCloud(
            workingInput,
            workingInput.rendererSpecies as HighCloudSpecies,
        ));
    }
    const cirrostratus = cirrostratusRepresentationFor(
        workingInput.state.classification,
        workingInput.rendererSpecies,
    );
    if (cirrostratus) return finish(adaptCirrostratus(workingInput, cirrostratus));
    const middle = middleCloudRepresentationFor(
        workingInput.state.classification,
        workingInput.rendererSpecies,
    );
    if (middle) return finish(adaptMiddleCloud(workingInput, middle));
    const low = lowLayeredCloudRepresentationFor(
        workingInput.state.classification,
        workingInput.rendererSpecies,
    );
    if (low) return finish(adaptLowLayeredCloud(workingInput, low));
    const recipe = CLOUD_RENDERER_RECIPES[workingInput.rendererSpecies];
    return {
        state: workingInput.state,
        issues: [{
            path: "familyProduction",
            code: "missing-family-production-adapter",
            severity: "error",
            message: `${recipe.genus}/${workingInput.rendererSpecies} has no production foundation adapter.`,
        }],
    };
};

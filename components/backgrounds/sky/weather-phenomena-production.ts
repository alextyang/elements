import {
    evaluateLightningEventPower,
    type LightningChannelSegment,
    type LightningEventState,
    type WeatherVec3,
} from "./weather-optical-phenomena";
import {
    packResolvedProductionWeatherScene,
    WEATHER_SCENE_UNIFORM_BYTES,
    WEATHER_SCENE_VEC4_OFFSETS,
    type PackedWeatherSceneUniform,
} from "./weather-scene-abi";
import type { ResolvedProductionWeatherScene } from "./weather-scene";

/**
 * Production dispatch and reachability contract for the packed weather scene.
 *
 * This module deliberately owns no camera, render target, exposure, bloom, or
 * bind-group.  It turns an already-valid immutable scene into bounded physical
 * work.  Host wiring can therefore be mechanical and cannot silently promote a
 * screen-space approximation to a physical phenomenon.
 */

export type WeatherPhenomenaProductionStage =
    | "droplet-owner-scattering"
    | "oriented-ice-owner-scattering"
    | "lightning-channel-emission"
    | "lightning-cloud-illumination"
    | "auroral-volume-emission"
    | "blowing-boundary-volume";

export interface WeatherPhenomenaProductionPass {
    readonly stage: WeatherPhenomenaProductionStage;
    readonly recordCount: number;
    readonly recordVec4Offset: number;
    readonly authoritativeOwnerCoupling: "exact-owner-index" | "record-owned-volume";
    readonly finiteSupport: true;
    readonly atmosphereOrdering: "source-to-sample-then-sample-to-camera";
    readonly cameraPathTransmittanceAppliedByPass: false;
    readonly postProcessBloomAppliedByPass: false;
}

export interface WeatherPhenomenaFamilyReachability {
    readonly authored: boolean;
    readonly packed: boolean;
    readonly transportKernelAvailable: boolean;
    readonly hostWired: true;
    readonly photographicQualificationRequired: true;
    readonly state: "inactive" | "production-integrated";
}

export type WeatherPhenomenonProductionId =
    | "primary-rainbow"
    | "secondary-rainbow"
    | "fogbow"
    | "glory"
    | "corona"
    | "halo-22"
    | "halo-46"
    | "sundogs"
    | "circumzenithal-arc"
    | "light-pillar"
    | "diamond-dust-glints"
    | "lightning-intracloud"
    | "lightning-cloud-to-ground"
    | "aurora-oxygen-red"
    | "aurora-oxygen-green"
    | "aurora-nitrogen-blue-violet"
    | "blowing-snow"
    | "blowing-dust"
    | "resuspended-volcanic-ash";

export interface WeatherPhenomenonProductionReachability {
    readonly reachable: boolean;
    readonly packedRecordCount: number;
    readonly exactFiniteOwnerRequired: true;
    readonly state: "inactive" | "production-integrated";
}

export interface WeatherPhenomenaProductionState {
    readonly schema: 1;
    readonly packedScene: PackedWeatherSceneUniform;
    readonly uniformByteLength: typeof WEATHER_SCENE_UNIFORM_BYTES;
    readonly passes: readonly WeatherPhenomenaProductionPass[];
    readonly reachability: Readonly<Record<
        "dropletOptics" | "orientedIce" | "lightning" | "aurora" |
        "blowingMedium",
        WeatherPhenomenaFamilyReachability
    >>;
    readonly phenomenonReachability: Readonly<Record<
        WeatherPhenomenonProductionId,
        WeatherPhenomenonProductionReachability
    >>;
    readonly rendererHostWiringComplete: true;
    readonly productionDispatchReady: true;
}

const familyReachability = (authored: boolean): WeatherPhenomenaFamilyReachability => ({
    authored,
    packed: authored,
    transportKernelAvailable: true,
    hostWired: true,
    photographicQualificationRequired: true,
    state: authored ? "production-integrated" : "inactive",
});

const phenomenonReachability = (
    packedRecordCount: number,
): WeatherPhenomenonProductionReachability => ({
    reachable: packedRecordCount > 0,
    packedRecordCount,
    exactFiniteOwnerRequired: true,
    state: packedRecordCount > 0 ? "production-integrated" : "inactive",
});

/**
 * Build the exact bounded pass list consumed by the production host.
 * Invalid or partially rejected scenes cannot be packed and never reach a GPU.
 */
export function createWeatherPhenomenaProductionState(
    scene: ResolvedProductionWeatherScene,
): WeatherPhenomenaProductionState {
    const packedScene = packResolvedProductionWeatherScene(scene);
    const passes: WeatherPhenomenaProductionPass[] = [];
    const addPass = (
        stage: WeatherPhenomenaProductionStage,
        recordCount: number,
        recordVec4Offset: number,
        owner: WeatherPhenomenaProductionPass["authoritativeOwnerCoupling"],
    ) => {
        if (recordCount <= 0) return;
        passes.push({
            stage,
            recordCount,
            recordVec4Offset,
            authoritativeOwnerCoupling: owner,
            finiteSupport: true,
            atmosphereOrdering: "source-to-sample-then-sample-to-camera",
            cameraPathTransmittanceAppliedByPass: false,
            postProcessBloomAppliedByPass: false,
        });
    };

    addPass("droplet-owner-scattering", packedScene.counts.dropletOwners,
        WEATHER_SCENE_VEC4_OFFSETS.dropletOwners, "exact-owner-index");
    addPass("oriented-ice-owner-scattering", packedScene.counts.iceOwners,
        WEATHER_SCENE_VEC4_OFFSETS.iceOwners, "exact-owner-index");
    addPass("lightning-channel-emission", packedScene.counts.lightningSegments,
        WEATHER_SCENE_VEC4_OFFSETS.lightningSegments, "exact-owner-index");
    addPass("lightning-cloud-illumination", packedScene.counts.lightningEvents,
        WEATHER_SCENE_VEC4_OFFSETS.lightningEvent, "exact-owner-index");
    addPass("auroral-volume-emission", packedScene.counts.auroraCurtains,
        WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains, "record-owned-volume");
    addPass("blowing-boundary-volume", packedScene.counts.blowingMedia,
        WEATHER_SCENE_VEC4_OFFSETS.blowingMedia, "record-owned-volume");

    const dropletFeatureCount = (feature: string) =>
        scene.dropletOpticalOwners.filter(({ state }) =>
            state.enabledFeatures.includes(feature as never)).length;
    const iceFeatureCount = (feature: string) =>
        scene.orientedIceOpticalOwners.filter(({ state }) =>
            state.enabledFeatures.includes(feature as never)).length;
    const blowingCount = (kind: string) => scene.blowingBoundaryMedia.filter(
        (state) => state.kind === kind).length;
    const lightningTopology = scene.lightning?.state.topology;

    return {
        schema: 1,
        packedScene,
        uniformByteLength: WEATHER_SCENE_UNIFORM_BYTES,
        passes,
        reachability: {
            dropletOptics: familyReachability(
                packedScene.counts.dropletOwners > 0),
            orientedIce: familyReachability(packedScene.counts.iceOwners > 0),
            lightning: familyReachability(packedScene.counts.lightningEvents > 0),
            aurora: familyReachability(packedScene.counts.auroraCurtains > 0),
            blowingMedium: familyReachability(packedScene.counts.blowingMedia > 0),
        },
        phenomenonReachability: {
            "primary-rainbow": phenomenonReachability(
                dropletFeatureCount("primary-rainbow")),
            "secondary-rainbow": phenomenonReachability(
                dropletFeatureCount("secondary-rainbow")),
            fogbow: phenomenonReachability(dropletFeatureCount("fogbow")),
            glory: phenomenonReachability(dropletFeatureCount("glory")),
            corona: phenomenonReachability(dropletFeatureCount("corona")),
            "halo-22": phenomenonReachability(iceFeatureCount("halo-22")),
            "halo-46": phenomenonReachability(iceFeatureCount("halo-46")),
            sundogs: phenomenonReachability(iceFeatureCount("sundogs")),
            "circumzenithal-arc": phenomenonReachability(
                iceFeatureCount("circumzenithal-arc")),
            "light-pillar": phenomenonReachability(
                iceFeatureCount("light-pillar")),
            "diamond-dust-glints": phenomenonReachability(
                iceFeatureCount("diamond-dust-glints")),
            "lightning-intracloud": phenomenonReachability(
                lightningTopology === "intra-cloud" ? 1 : 0),
            "lightning-cloud-to-ground": phenomenonReachability(
                lightningTopology === "cloud-to-ground" ? 1 : 0),
            "aurora-oxygen-red": phenomenonReachability(
                packedScene.counts.auroraCurtains),
            "aurora-oxygen-green": phenomenonReachability(
                packedScene.counts.auroraCurtains),
            "aurora-nitrogen-blue-violet": phenomenonReachability(
                packedScene.counts.auroraCurtains),
            "blowing-snow": phenomenonReachability(
                blowingCount("blowing-snow")),
            "blowing-dust": phenomenonReachability(
                blowingCount("blowing-dust")),
            "resuspended-volcanic-ash": phenomenonReachability(
                blowingCount("volcanic-ash")),
        },
        rendererHostWiringComplete: true,
        productionDispatchReady: true,
    };
}

const add3 = (left: WeatherVec3, right: WeatherVec3): WeatherVec3 => [
    left[0] + right[0], left[1] + right[1], left[2] + right[2],
];
const scale3 = (value: WeatherVec3, scale: number): WeatherVec3 => [
    value[0] * scale, value[1] * scale, value[2] * scale,
];
const multiply3 = (left: WeatherVec3, right: WeatherVec3): WeatherVec3 => [
    left[0] * right[0], left[1] * right[1], left[2] * right[2],
];
const subtract3 = (left: WeatherVec3, right: WeatherVec3): WeatherVec3 => [
    left[0] - right[0], left[1] - right[1], left[2] - right[2],
];
const length3 = (value: WeatherVec3) => Math.hypot(...value);
const segmentLengthKm = (segment: LightningChannelSegment) => length3(subtract3(
    segment.endEastAltitudeNorthKm,
    segment.startEastAltitudeNorthKm,
));

export interface LightningCloudVolumeSample {
    readonly eventId: string;
    readonly ownerId: string;
    readonly enabled: boolean;
    readonly incidentChannelRadianceRgb: WeatherVec3;
    readonly cloudSourceCoefficientRgbPerKm: WeatherVec3;
    readonly evaluatedSegmentQuadraturePoints: number;
    readonly sourceToSampleAtmosphereApplied: true;
    readonly cameraPathTransmittanceApplied: false;
    readonly duplicatesChannelEmission: false;
}

export interface LightningCloudVolumeSampleInput {
    readonly event: LightningEventState;
    readonly eventTimeSeconds: number;
    readonly ownerId: string;
    readonly ownerSampleWeight: number;
    readonly positionEastAltitudeNorthKm: WeatherVec3;
    readonly cloudScatteringCoefficientRgbPerKm: WeatherVec3;
    /** Normalized cloud phase response for the segment direction, in sr^-1. */
    readonly cloudPhaseRgbPerSteradian: (
        directionFromSampleToChannel: WeatherVec3,
    ) => WeatherVec3;
    /** Atmosphere and intervening parent-cloud visibility, each in [0,1]. */
    readonly sourceToSampleTransmittanceRgb: (
        channelPositionEastAltitudeNorthKm: WeatherVec3,
    ) => WeatherVec3;
}

// Four-point Gauss-Legendre exactly integrates cubic line variation and is a
// stable bounded approximation for the inverse-square channel irradiance.
const GAUSS_ABSCISSA = [
    -0.8611363115940526,
    -0.3399810435848563,
    0.3399810435848563,
    0.8611363115940526,
] as const;
const GAUSS_WEIGHT = [
    0.3478548451374538,
    0.6521451548625461,
    0.6521451548625461,
    0.3478548451374538,
] as const;

/**
 * Integrate lightning line radiance into one exact parent-cloud sample.
 * Channel power is spent once over weighted physical length.  Centimetric
 * radius only regularizes the near field; it is never inflated for visibility.
 */
export function evaluateLightningCloudVolumeSample(
    input: LightningCloudVolumeSampleInput,
): LightningCloudVolumeSample {
    const zero = (): LightningCloudVolumeSample => ({
        eventId: input.event.id,
        ownerId: input.event.owner.id,
        enabled: false,
        incidentChannelRadianceRgb: [0, 0, 0],
        cloudSourceCoefficientRgbPerKm: [0, 0, 0],
        evaluatedSegmentQuadraturePoints: 0,
        sourceToSampleAtmosphereApplied: true,
        cameraPathTransmittanceApplied: false,
        duplicatesChannelEmission: false,
    });
    const event = input.event;
    if (!event.validity.valid || input.ownerId !== event.owner.id ||
        input.ownerSampleWeight <= 0 ||
        input.positionEastAltitudeNorthKm[1] < event.owner.bottomAltitudeKm ||
        input.positionEastAltitudeNorthKm[1] > event.owner.topAltitudeKm) {
        return zero();
    }
    const eventPower = evaluateLightningEventPower(
        event, input.eventTimeSeconds).emittedPowerRgb;
    if (eventPower.every((channel) => channel <= 0)) return zero();
    const weightedLengthKm = event.channelSegments.reduce((sum, segment) =>
        sum + segmentLengthKm(segment) * segment.emissiveWeight, 0);
    if (!(weightedLengthKm > 0)) return zero();

    let incident: WeatherVec3 = [0, 0, 0];
    let evaluated = 0;
    for (const segment of event.channelSegments) {
        const delta = subtract3(segment.endEastAltitudeNorthKm,
            segment.startEastAltitudeNorthKm);
        const lengthKm = length3(delta);
        if (!(lengthKm > 0) || segment.emissiveWeight <= 0) continue;
        const linePowerRgbPerKm = scale3(eventPower,
            segment.emissiveWeight / weightedLengthKm);
        for (let pointIndex = 0; pointIndex < GAUSS_ABSCISSA.length;
            pointIndex += 1) {
            const progress = 0.5 * (GAUSS_ABSCISSA[pointIndex] + 1);
            const channelPosition = add3(
                segment.startEastAltitudeNorthKm,
                scale3(delta, progress),
            );
            const sampleToChannel = subtract3(channelPosition,
                input.positionEastAltitudeNorthKm);
            const distanceKm = length3(sampleToChannel);
            const coreRadiusKm = Math.max(2e-6,
                segment.radiusMetres * 0.001);
            const direction: WeatherVec3 = distanceKm > 1e-12
                ? scale3(sampleToChannel, 1 / distanceKm)
                : [0, 1, 0];
            const inverseSphere = 1 / (4 * Math.PI *
                (distanceKm * distanceKm + coreRadiusKm * coreRadiusKm));
            const differentialLengthKm = lengthKm * 0.5 *
                GAUSS_WEIGHT[pointIndex];
            const transfer = input.sourceToSampleTransmittanceRgb(channelPosition)
                .map((channel) => Math.min(1, Math.max(0,
                    Number.isFinite(channel) ? channel : 0))) as
                unknown as WeatherVec3;
            const phase = input.cloudPhaseRgbPerSteradian(direction)
                .map((channel) => Math.max(0,
                    Number.isFinite(channel) ? channel : 0)) as
                unknown as WeatherVec3;
            incident = add3(incident, scale3(multiply3(
                multiply3(linePowerRgbPerKm, transfer), phase),
            inverseSphere * differentialLengthKm));
            evaluated += 1;
        }
    }
    const membership = Math.min(1, Math.max(0, input.ownerSampleWeight));
    const sigma = input.cloudScatteringCoefficientRgbPerKm.map((channel) =>
        Math.max(0, Number.isFinite(channel) ? channel : 0)) as
        unknown as WeatherVec3;
    return {
        eventId: event.id,
        ownerId: event.owner.id,
        enabled: incident.some((channel) => channel > 0),
        incidentChannelRadianceRgb: incident,
        cloudSourceCoefficientRgbPerKm: scale3(multiply3(sigma, incident),
            membership),
        evaluatedSegmentQuadraturePoints: evaluated,
        sourceToSampleAtmosphereApplied: true,
        cameraPathTransmittanceApplied: false,
        duplicatesChannelEmission: false,
    };
}

export interface FiniteRayInterval {
    readonly nearKm: number;
    readonly farKm: number;
}

/** Conservative ray interval for a finite oriented elliptical boundary volume. */
export function intersectFiniteOrientedEllipticalCylinder(
    rayOriginEastAltitudeNorthKm: WeatherVec3,
    rayDirection: WeatherVec3,
    centerEastNorthKm: readonly [number, number],
    majorRadiusKm: number,
    minorRadiusKm: number,
    orientationRadians: number,
    bottomAltitudeKm: number,
    topAltitudeKm: number,
): FiniteRayInterval | null {
    if (!(majorRadiusKm > 0 && minorRadiusKm > 0 &&
        topAltitudeKm > bottomAltitudeKm)) return null;
    const sine = Math.sin(orientationRadians);
    const cosine = Math.cos(orientationRadians);
    const transform = (east: number, north: number): readonly [number, number] => [
        (east * sine + north * cosine) / majorRadiusKm,
        (east * cosine - north * sine) / minorRadiusKm,
    ];
    const relativeEast = rayOriginEastAltitudeNorthKm[0] - centerEastNorthKm[0];
    const relativeNorth = rayOriginEastAltitudeNorthKm[2] - centerEastNorthKm[1];
    const origin = transform(relativeEast, relativeNorth);
    const direction = transform(rayDirection[0], rayDirection[2]);
    const quadratic = direction[0] ** 2 + direction[1] ** 2;
    const linear = 2 * (origin[0] * direction[0] + origin[1] * direction[1]);
    const constant = origin[0] ** 2 + origin[1] ** 2 - 1;
    let horizontalNear = 0;
    let horizontalFar = Number.POSITIVE_INFINITY;
    if (quadratic <= 1e-14) {
        if (constant > 0) return null;
    } else {
        const discriminant = linear * linear - 4 * quadratic * constant;
        if (discriminant < 0) return null;
        const root = Math.sqrt(discriminant);
        horizontalNear = (-linear - root) / (2 * quadratic);
        horizontalFar = (-linear + root) / (2 * quadratic);
    }
    let altitudeNear = 0;
    let altitudeFar = Number.POSITIVE_INFINITY;
    if (Math.abs(rayDirection[1]) <= 1e-14) {
        if (rayOriginEastAltitudeNorthKm[1] < bottomAltitudeKm ||
            rayOriginEastAltitudeNorthKm[1] > topAltitudeKm) return null;
    } else {
        const first = (bottomAltitudeKm - rayOriginEastAltitudeNorthKm[1]) /
            rayDirection[1];
        const second = (topAltitudeKm - rayOriginEastAltitudeNorthKm[1]) /
            rayDirection[1];
        altitudeNear = Math.min(first, second);
        altitudeFar = Math.max(first, second);
    }
    const nearKm = Math.max(0, horizontalNear, altitudeNear);
    const farKm = Math.min(horizontalFar, altitudeFar);
    return Number.isFinite(nearKm) && Number.isFinite(farKm) && farKm > nearKm
        ? { nearKm, farKm } : null;
}

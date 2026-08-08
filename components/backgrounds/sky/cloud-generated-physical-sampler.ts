import type {
    CloudClassification,
    CloudOrganizationState,
    CloudSystemState,
} from "./cloud-state-map";
import {
    CLOUD_MATERIAL_CLASS_CODES,
    combineCloudPhysicalSamples,
    resolveCloudPhysicalSample,
    type CloudFeatureSampleInput,
    type CloudGeometrySample,
    type CloudMaterialClass,
    type CloudPhysicalSample,
    type CloudVec3,
} from "./cloud-physical-sample";
import type {
    CloudWeatherDomain,
    CloudWeatherFeature,
    CloudWeatherOwner,
    CloudWeatherSimulation,
} from "./cloud-weather-engine";

/**
 * Analytic migration sampler for weather-generated owners.
 *
 * This is intentionally slower and simpler than the production atlas path. It
 * makes the new weather engine executable through the authoritative physical
 * sample immediately, provides reference-transport ground truth, and gives the
 * production camera/light paths one parity target while individual morphology
 * operators migrate to the same contract.
 */

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const mix = (left: number, right: number, amount: number) =>
    left + (right - left) * amount;
const smoothstep = (low: number, high: number, value: number) => {
    if (low === high) return value < low ? 0 : 1;
    const amount = clamp((value - low) / (high - low));
    return amount * amount * (3 - 2 * amount);
};
const normalize = (value: CloudVec3): CloudVec3 => {
    const length = Math.hypot(...value);
    return length > 1e-9
        ? [value[0] / length, value[1] / length, value[2] / length]
        : [0, 1, 0];
};

const rotateToOwner = (
    worldPositionKm: CloudVec3,
    owner: CloudWeatherOwner,
): CloudVec3 => {
    const east = worldPositionKm[0] - owner.centerEastKm;
    const north = worldPositionKm[2] - owner.centerNorthKm;
    const cosine = Math.cos(owner.orientationRadians);
    const sine = Math.sin(owner.orientationRadians);
    return [
        east * cosine + north * sine,
        worldPositionKm[1] -
            (owner.baseAltitudeKm + owner.geometricDepthKm * 0.5),
        -east * sine + north * cosine,
    ];
};

const rotateFromOwner = (
    ownerPositionKm: CloudVec3,
    owner: CloudWeatherOwner,
): CloudVec3 => {
    const cosine = Math.cos(owner.orientationRadians);
    const sine = Math.sin(owner.orientationRadians);
    return [
        owner.centerEastKm + ownerPositionKm[0] * cosine -
            ownerPositionKm[2] * sine,
        owner.baseAltitudeKm + owner.geometricDepthKm * 0.5 +
            ownerPositionKm[1],
        owner.centerNorthKm + ownerPositionKm[0] * sine +
            ownerPositionKm[2] * cosine,
    ];
};

const ownerOrganization = (
    owner: CloudWeatherOwner,
): CloudOrganizationState => {
    if (owner.organization === "wave-packet") {
        return {
            kind: "wave-packet",
            wavelengthKm: Math.max(0.2, owner.radiusNorthKm * 0.5),
            packetLengthKm: owner.radiusEastKm * 2,
            crestCount: Math.max(1, Math.round(owner.radiusEastKm /
                Math.max(0.2, owner.radiusNorthKm * 0.5))),
            orientation: owner.orientationRadians,
        };
    }
    if (owner.organization === "storm-complex") {
        return {
            kind: "storm-complex",
            inflowRadiusKm: owner.radiusEastKm * 1.3,
            updraftRadiusKm: owner.radiusNorthKm * 0.5,
            outflowRadiusKm: owner.radiusEastKm *
                (1.4 + owner.coldPoolStrength01),
            propagationDirection: owner.orientationRadians,
        };
    }
    if (owner.organization === "frontal") {
        return {
            kind: "frontal-shield",
            alongFrontLengthKm: owner.radiusEastKm * 2,
            crossFrontDepthKm: owner.radiusNorthKm * 2,
            leadingTransitionKm: owner.boundaryTransitionKm,
            trailingTransitionKm: owner.boundaryTransitionKm,
            orientation: owner.orientationRadians,
        };
    }
    if (owner.organization === "open-cell" ||
        owner.organization === "closed-cell") {
        return {
            kind: "cellular",
            topology: owner.organization === "open-cell" ? "open" : "closed",
            meanCellDiameterKm: Math.max(0.2, owner.radiusNorthKm * 0.35),
            wallWidthFraction: owner.organization === "open-cell" ? 0.22 : 0.48,
            centerJitter: 0.35,
            anisotropy: 0,
            orientation: owner.orientationRadians,
        };
    }
    return {
        kind: "point-process",
        distribution: owner.organization === "clustered"
            ? "clustered" : "poisson-disk",
        meanSpacingKm: Math.max(0.2, owner.radiusEastKm * 0.5),
        minimumSeparationKm: Math.max(0.1, owner.radiusNorthKm * 0.2),
        clusterRadiusKm: owner.radiusEastKm,
        anisotropy: clamp(owner.radiusEastKm /
            Math.max(0.1, owner.radiusNorthKm) - 1),
        orientation: owner.orientationRadians,
    };
};

const ownerState = (
    owner: CloudWeatherOwner,
    domain: CloudWeatherDomain,
): CloudSystemState => {
    const areaSquareMetres = Math.max(
        1,
        Math.PI * owner.radiusEastKm * 1_000 *
            owner.radiusNorthKm * 1_000,
    );
    const liquidPath = owner.liquidWaterMassKg * 1_000 / areaSquareMetres;
    const icePath = owner.iceWaterMassKg * 1_000 / areaSquareMetres;
    const totalPath = liquidPath + icePath;
    return {
        id: owner.id,
        classification: owner.classification as unknown as CloudClassification,
        physical: {
            baseAltitudeKm: owner.baseAltitudeKm,
            geometricDepthKm: owner.geometricDepthKm,
            coverageOktas: Math.max(1, Math.min(8,
                Math.round((owner.radiusEastKm * owner.radiusNorthKm) ** 0.35))),
            thermodynamics: {
                baseTemperatureKelvin: owner.temperatureKelvin +
                    owner.geometricDepthKm * 3,
                topTemperatureKelvin: owner.temperatureKelvin -
                    owner.geometricDepthKm * 3,
                relativeHumidity: owner.relativeHumidity01,
                environmentalLapseRate: 6.5,
                stabilityIndex: clamp(1 - domain.capeJoulesPerKilogram / 4_000),
                verticalVelocity: owner.verticalVelocityMetresPerSecond,
                entrainment: owner.entrainment01,
            },
            kinematics: {
                windSpeed: Math.hypot(
                    owner.velocityKmPerSecond[0],
                    owner.velocityKmPerSecond[2],
                ) * 1_000,
                windDirection: Math.atan2(
                    owner.velocityKmPerSecond[0],
                    owner.velocityKmPerSecond[2],
                ),
                verticalShear: 0,
                turbulenceIntegralScaleKm: Math.max(
                    0.05,
                    Math.min(owner.radiusEastKm, owner.radiusNorthKm) * 0.25,
                ),
                turbulenceDissipation: owner.turbulence01,
            },
            condensate: {
                liquidWaterPath: liquidPath,
                iceWaterPath: icePath,
                liquidFraction: totalPath > 1e-9 ? liquidPath / totalPath : 1,
                dropletEffectiveRadius: owner.liquidEffectiveRadiusMicrons,
                iceEffectiveRadius: owner.iceEffectiveRadiusMicrons,
            },
            precipitation: {
                kind: owner.precipitationKind,
                rate: owner.precipitationRateMillimetresPerHour,
                terminalVelocity: owner.precipitationKind === "hail" ? 22 :
                    owner.precipitationKind === "snow" ? 1.2 : 6,
                evaporationDepthKm: owner.precipitationKind === "virga"
                    ? Math.max(0.1, owner.baseAltitudeKm) : 0,
            },
            formation: {
                liftingCondensationLevelKm: owner.baseAltitudeKm,
                levelOfFreeConvectionKm: owner.family === "convective"
                    ? owner.baseAltitudeKm + 0.1 : null,
                equilibriumLevelKm: owner.family === "convective"
                    ? domain.equilibriumLevelKm : null,
                inversionBaseKm: domain.inversionBaseKm,
                inversionStrengthKelvin: domain.inversionStrengthKelvin,
                freezingLevelKm: domain.freezingLevelKm,
                shearLayerBaseKm: owner.baseAltitudeKm,
                shearLayerTopKm: owner.baseAltitudeKm + owner.geometricDepthKm,
            },
        },
        extent: {
            centerEastKm: owner.centerEastKm,
            centerNorthKm: owner.centerNorthKm,
            majorRadiusKm: owner.radiusEastKm,
            minorRadiusKm: owner.radiusNorthKm,
            orientation: owner.orientationRadians,
            boundaryTransitionKm: owner.boundaryTransitionKm,
        },
        organization: ownerOrganization(owner),
        lifecycle: {
            stage: owner.lifecycleStage === "dead" ? "decaying" :
                owner.lifecycleStage,
            stageProgress: owner.lifecycleProgress01,
            ageSeconds: owner.ageSeconds,
            cloudTopRiseRate: owner.verticalVelocityMetresPerSecond,
            condensateTendency: 0,
            glaciationRate: totalPath > 1e-9 ? icePath / totalPath : 0,
            precipitationEfficiency: clamp(
                owner.precipitationRateMillimetresPerHour / 20,
            ),
            outflowSpeed: Math.max(0, -owner.downdraftMetresPerSecond),
        },
    };
};

const ellipsoidGeometry = (
    worldPositionKm: CloudVec3,
    centerKm: CloudVec3,
    radiiKm: CloudVec3,
    boundaryTransitionKm: number,
): CloudGeometrySample => {
    const local: CloudVec3 = [
        worldPositionKm[0] - centerKm[0],
        worldPositionKm[1] - centerKm[1],
        worldPositionKm[2] - centerKm[2],
    ];
    const radii: CloudVec3 = radiiKm.map((radius) =>
        Math.max(0.01, radius)) as unknown as CloudVec3;
    const normalized: CloudVec3 = [
        local[0] / radii[0],
        local[1] / radii[1],
        local[2] / radii[2],
    ];
    const normalizedLength = Math.hypot(...normalized);
    const minimumRadius = Math.min(...radii);
    const signedDistanceKm = (normalizedLength - 1) * minimumRadius;
    const transition = Math.max(0.005, boundaryTransitionKm);
    const support = 1 - smoothstep(-transition, transition, signedDistanceKm);
    const radialDensity = clamp(1 - normalizedLength);
    const gradient = normalize([
        local[0] / (radii[0] * radii[0]),
        local[1] / (radii[1] * radii[1]),
        local[2] / (radii[2] * radii[2]),
    ]);
    const surfaceScale = normalizedLength > 1e-8 ? 1 / normalizedLength : 1;
    const closestSurfaceKm: CloudVec3 = [
        centerKm[0] + local[0] * surfaceScale,
        centerKm[1] + local[1] * surfaceScale,
        centerKm[2] + local[2] * surfaceScale,
    ];
    return {
        support,
        density: support * smoothstep(0, 0.42, radialDensity),
        signedDistanceKm,
        gradient,
        closestSurfaceKm,
        inverseCurvatureKm: 1 / Math.max(0.01,
            (radii[0] + radii[1] + radii[2]) / 3),
        seam01: 0,
        localAltitudeFraction01: clamp(
            (worldPositionKm[1] - (centerKm[1] - radii[1])) /
                Math.max(0.01, radii[1] * 2),
        ),
    };
};

const ownerGeometry = (
    owner: CloudWeatherOwner,
    worldPositionKm: CloudVec3,
): CloudGeometrySample => {
    const local = rotateToOwner(worldPositionKm, owner);
    const center: CloudVec3 = [0, 0, 0];
    const localGeometry = ellipsoidGeometry(
        local,
        center,
        [
            owner.radiusEastKm,
            owner.geometricDepthKm * 0.5,
            owner.radiusNorthKm,
        ],
        owner.boundaryTransitionKm,
    );
    const baseFraction = clamp(
        (worldPositionKm[1] - owner.baseAltitudeKm) /
            Math.max(0.01, owner.geometricDepthKm),
    );
    const flatBase = smoothstep(0, 0.06, baseFraction);
    const stratiformProfile = mix(
        0.7 + 0.3 * Math.sin(baseFraction * Math.PI),
        1,
        owner.stratusFraction01,
    );
    return {
        ...localGeometry,
        support: localGeometry.support * flatBase,
        density: localGeometry.density * flatBase * stratiformProfile *
            clamp(1 - Math.max(0, owner.lifecycleProgress01 - 0.82) * 2.8),
        closestSurfaceKm: rotateFromOwner(
            localGeometry.closestSurfaceKm,
            owner,
        ),
        gradient: normalize(rotateFromOwner(localGeometry.gradient, {
            ...owner,
            centerEastKm: 0,
            centerNorthKm: 0,
            baseAltitudeKm: -owner.geometricDepthKm * 0.5,
        }) as CloudVec3),
        localAltitudeFraction01: baseFraction,
    };
};

const featureCenter = (
    owner: CloudWeatherOwner,
    feature: CloudWeatherFeature,
): CloudVec3 => {
    const local: CloudVec3 = [
        feature.attachmentFraction[0] * owner.radiusEastKm,
        (feature.attachmentFraction[1] + 0.5) * owner.geometricDepthKm -
            owner.geometricDepthKm * 0.5,
        feature.attachmentFraction[2] * owner.radiusNorthKm,
    ];
    return rotateFromOwner(local, owner);
};

const featureMaterial = (
    feature: CloudWeatherFeature,
): CloudMaterialClass => feature.materialPhase === "ice" ? "ice-cloud" :
    feature.materialPhase === "mixed" ? "mixed-phase-cloud" :
        feature.materialPhase === "precipitation" ? "rain" : "liquid-cloud";

const featureInput = (
    feature: CloudWeatherFeature,
    owner: CloudWeatherOwner,
): CloudFeatureSampleInput => ({
    id: feature.id,
    parentOwnerId: owner.id,
    materialClass: featureMaterial(feature),
    densityMultiplier: feature.kind === "incus" ? 0.72 : 0.55,
    liquidMultiplier: feature.materialPhase === "ice" ? 0 : 1,
    iceMultiplier: feature.materialPhase === "ice" ? 1.7 : 1,
    precipitationMultiplier: feature.precipitationSourceKgPerSecond > 0
        ? 1.6 : 0,
    velocityOffsetKmPerSecond: [
        feature.velocityKmPerSecond[0] - owner.velocityKmPerSecond[0],
        feature.velocityKmPerSecond[1] - owner.velocityKmPerSecond[1],
        feature.velocityKmPerSecond[2] - owner.velocityKmPerSecond[2],
    ],
    ageOffsetSeconds: feature.ageSeconds - owner.ageSeconds,
});

export const sampleGeneratedCloudOwnerPhysical = (
    owner: CloudWeatherOwner,
    domain: CloudWeatherDomain,
    features: readonly CloudWeatherFeature[],
    worldPositionKm: CloudVec3,
): CloudPhysicalSample => {
    const state = ownerState(owner, domain);
    const base = resolveCloudPhysicalSample({
        owner: state,
        geometry: ownerGeometry(owner, worldPositionKm),
    });
    const positiveFeatures = features.filter((feature) =>
        feature.active && feature.parentOwnerId === owner.id &&
        feature.kind !== "cavum").map((feature) => resolveCloudPhysicalSample({
            owner: state,
            geometry: ellipsoidGeometry(
                worldPositionKm,
                featureCenter(owner, feature),
                feature.scaleKm.map((scale) =>
                    Math.max(0.02, scale * 0.5)) as unknown as CloudVec3,
                Math.max(0.01, owner.boundaryTransitionKm * 0.5),
            ),
            feature: featureInput(feature, owner),
        }));
    const combined = combineCloudPhysicalSamples([base, ...positiveFeatures]);
    const cavum = features.filter((feature) =>
        feature.active && feature.parentOwnerId === owner.id &&
        feature.kind === "cavum").map((feature) => ellipsoidGeometry(
            worldPositionKm,
            featureCenter(owner, feature),
            feature.scaleKm.map((scale) =>
                Math.max(0.02, scale * 0.5)) as unknown as CloudVec3,
            Math.max(0.01, owner.boundaryTransitionKm * 0.4),
        ).support).reduce((maximum, support) => Math.max(maximum, support), 0);
    if (cavum <= 0) return combined;
    const retained = 1 - clamp(cavum);
    return {
        ...combined,
        support: combined.support * retained,
        density: combined.density * retained,
        liquidWaterContent: combined.liquidWaterContent * retained,
        iceWaterContent: combined.iceWaterContent * retained,
        precipitationSource: combined.precipitationSource * retained,
        materialClass: combined.materialClass ||
            CLOUD_MATERIAL_CLASS_CODES["liquid-cloud"],
    };
};

/** Shared camera/source callback for strict reference transport and parity tests. */
export const sampleCloudWeatherSimulationPhysical = (
    simulation: CloudWeatherSimulation,
    worldPositionKm: CloudVec3,
): CloudPhysicalSample => combineCloudPhysicalSamples(
    simulation.owners.filter(({ active }) => active).map((owner) =>
        sampleGeneratedCloudOwnerPhysical(
            owner,
            simulation.domain,
            simulation.features,
            worldPositionKm,
        )),
);

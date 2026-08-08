import {
    CLOUD_RENDERER_RECIPES,
    type CloudClassification,
    type CloudLifecycleStage,
    type CloudOrganizationState,
    type CloudSpecies,
    type CloudSystemState,
} from "./cloud-state-map";
import type {
    CloudAuthoredSystemState,
    CloudLayerIndex,
    CloudLayerState,
    CloudScene,
} from "./cloud-scene";
import {
    compileCloudSystemV2,
    type CloudFeatureRecordV2,
    type CloudLifecycleEventV2,
    type CompiledCloudSystemV2,
} from "./cloud-system-abi-v2";
import {
    buildCloudInteractionGraph,
    type CloudInteractionGraph,
} from "./cloud-interaction-model";
import {
    createCloudWeatherSimulation,
    runCloudWeatherSimulation,
    type CloudGenerationMode,
    type CloudWeatherDomain,
    type CloudWeatherFeature,
    type CloudWeatherOwner,
    type CloudWeatherSimulation,
    type ConditionedCloudTarget,
    type CreateCloudWeatherSimulationInput,
    type GeneratedCloudClassification,
} from "./cloud-weather-engine";

export interface CloudGenerativeRuntime {
    mode: CloudGenerationMode;
    simulation: CloudWeatherSimulation;
    scene: CloudScene;
    systemsV2: readonly CompiledCloudSystemV2[];
    interactions: CloudInteractionGraph;
}

export interface CreateConditionedCloudRuntimeInput extends Omit<
    CreateCloudWeatherSimulationInput,
    "mode" | "target"
> {
    target: ConditionedCloudTarget;
    steps?: number;
}

export interface CreateFreeRunningCloudRuntimeInput extends Omit<
    CreateCloudWeatherSimulationInput,
    "mode" | "target"
> {
    steps?: number;
}

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));

const cloudSpeciesFor = (
    classification: GeneratedCloudClassification,
): Exclude<CloudSpecies, "generic"> => {
    if (classification.genus === "altostratus") return "altostratus-opacus";
    if (classification.genus === "nimbostratus") {
        return "nimbostratus-praecipitatio";
    }
    if (classification.genus === "cumulonimbus" &&
        classification.species === "capillatus" &&
        classification.supplementaryFeatures.includes("incus")) {
        return "cumulonimbus-capillatus-incus";
    }
    const candidate = `${classification.genus}-${classification.species}`;
    if (Object.hasOwn(CLOUD_RENDERER_RECIPES, candidate)) {
        return candidate as Exclude<CloudSpecies, "generic">;
    }
    const fallback: Record<GeneratedCloudClassification["genus"],
    Exclude<CloudSpecies, "generic">> = {
        cirrus: "cirrus-fibratus",
        cirrocumulus: "cirrocumulus-stratiformis",
        cirrostratus: "cirrostratus-nebulosus",
        altocumulus: "altocumulus-stratiformis",
        altostratus: "altostratus-opacus",
        nimbostratus: "nimbostratus-praecipitatio",
        stratocumulus: "stratocumulus-stratiformis",
        stratus: "stratus-nebulosus",
        cumulus: "cumulus-humilis",
        cumulonimbus: "cumulonimbus-calvus",
    };
    return fallback[classification.genus];
};

const layerIndexFor = (genus: GeneratedCloudClassification["genus"]):
CloudLayerIndex => {
    if (["cirrus", "cirrocumulus", "cirrostratus"].includes(genus)) return 2;
    if (["altocumulus", "altostratus", "nimbostratus"].includes(genus)) return 1;
    return 0;
};

const cloudOrganizationFor = (
    owner: CloudWeatherOwner,
): CloudOrganizationState => {
    switch (owner.organization) {
        case "open-cell":
        case "closed-cell":
            return {
                kind: "cellular",
                topology: owner.organization === "open-cell" ? "open" : "closed",
                meanCellDiameterKm: Math.max(
                    0.2,
                    (owner.radiusEastKm + owner.radiusNorthKm) * 0.18,
                ),
                wallWidthFraction: owner.organization === "open-cell" ? 0.2 : 0.48,
                centerJitter: 0.38 + owner.turbulence01 * 0.28,
                anisotropy: clamp(owner.radiusEastKm /
                    Math.max(0.1, owner.radiusNorthKm) - 1, 0, 1),
                orientation: owner.orientationRadians,
            };
        case "streets":
        case "banded":
            return {
                kind: "banded",
                bandSpacingKm: Math.max(0.4, owner.radiusNorthKm * 0.35),
                bandWidthFraction: 0.32,
                lengthKm: owner.radiusEastKm * 2,
                curvature: owner.turbulence01 * 0.2,
                orientation: owner.orientationRadians,
            };
        case "wave-packet":
            return {
                kind: "wave-packet",
                wavelengthKm: Math.max(0.4, owner.radiusNorthKm * 0.5),
                packetLengthKm: owner.radiusEastKm * 2,
                crestCount: Math.max(1, Math.round(owner.radiusEastKm /
                    Math.max(0.4, owner.radiusNorthKm * 0.5))),
                orientation: owner.orientationRadians,
            };
        case "frontal":
            return {
                kind: "frontal-shield",
                alongFrontLengthKm: owner.radiusEastKm * 2,
                crossFrontDepthKm: owner.radiusNorthKm * 2,
                leadingTransitionKm: owner.boundaryTransitionKm,
                trailingTransitionKm: owner.boundaryTransitionKm * 1.8,
                orientation: owner.orientationRadians,
            };
        case "storm-complex":
            return {
                kind: "storm-complex",
                inflowRadiusKm: owner.radiusEastKm * 1.4,
                updraftRadiusKm: Math.max(0.3, owner.radiusNorthKm * 0.42),
                outflowRadiusKm: owner.radiusEastKm *
                    (1.5 + owner.coldPoolStrength01),
                propagationDirection: owner.orientationRadians,
            };
        case "clustered":
        case "isolated":
        default:
            return {
                kind: "point-process",
                distribution: owner.organization === "clustered"
                    ? "clustered" : "poisson-disk",
                meanSpacingKm: Math.max(0.2, owner.radiusEastKm * 0.7),
                minimumSeparationKm: Math.max(0.1, owner.radiusNorthKm * 0.25),
                clusterRadiusKm: owner.radiusEastKm,
                anisotropy: clamp(owner.radiusEastKm /
                    Math.max(0.1, owner.radiusNorthKm) - 1, 0, 1),
                orientation: owner.orientationRadians,
            };
    }
};

const lifecycleStageFor = (owner: CloudWeatherOwner): CloudLifecycleStage =>
    owner.lifecycleStage === "dead" ? "decaying" : owner.lifecycleStage;

const waterPath = (massKg: number, owner: CloudWeatherOwner) => {
    const areaSquareMetres = Math.PI * owner.radiusEastKm * 1_000 *
        owner.radiusNorthKm * 1_000;
    return areaSquareMetres > 1
        ? Math.max(0, massKg * 1_000 / areaSquareMetres)
        : 0;
};

export const generatedOwnerToCloudSystemState = (
    owner: CloudWeatherOwner,
    domain: CloudWeatherDomain,
): CloudSystemState => {
    const liquidPath = waterPath(owner.liquidWaterMassKg, owner);
    const icePath = waterPath(owner.iceWaterMassKg, owner);
    const totalPath = liquidPath + icePath;
    const classification = owner.classification as unknown as CloudClassification;
    return {
        id: owner.id,
        classification,
        physical: {
            baseAltitudeKm: owner.baseAltitudeKm,
            geometricDepthKm: owner.geometricDepthKm,
            coverageOktas: Math.max(
                1,
                Math.min(8, Math.round((owner.radiusEastKm *
                    owner.radiusNorthKm) ** 0.35)),
            ),
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
                verticalShear: domain.sounding.length > 1
                    ? Math.hypot(
                        domain.sounding[domain.sounding.length - 1]
                            .windEastMetresPerSecond -
                            domain.sounding[0].windEastMetresPerSecond,
                        domain.sounding[domain.sounding.length - 1]
                            .windNorthMetresPerSecond -
                            domain.sounding[0].windNorthMetresPerSecond,
                    ) : 0,
                turbulenceIntegralScaleKm: Math.max(
                    0.05,
                    Math.min(owner.radiusEastKm, owner.radiusNorthKm) * 0.25,
                ),
                turbulenceDissipation: owner.turbulence01,
            },
            condensate: {
                liquidWaterPath: liquidPath,
                iceWaterPath: icePath,
                liquidFraction: totalPath > 1e-8 ? liquidPath / totalPath : 1,
                dropletEffectiveRadius: owner.liquidEffectiveRadiusMicrons,
                iceEffectiveRadius: owner.iceEffectiveRadiusMicrons,
            },
            precipitation: {
                kind: owner.precipitationKind,
                rate: owner.precipitationRateMillimetresPerHour,
                terminalVelocity: owner.precipitationKind === "hail" ? 22 :
                    owner.precipitationKind === "snow" ? 1.2 : 6,
                evaporationDepthKm: owner.precipitationKind === "virga"
                    ? Math.max(0.2, owner.baseAltitudeKm) : 0,
            },
            formation: {
                liftingCondensationLevelKm: owner.baseAltitudeKm,
                levelOfFreeConvectionKm: owner.family === "convective"
                    ? owner.baseAltitudeKm + 0.15 : null,
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
        organization: cloudOrganizationFor(owner),
        lifecycle: {
            stage: lifecycleStageFor(owner),
            stageProgress: owner.lifecycleProgress01,
            ageSeconds: owner.ageSeconds,
            cloudTopRiseRate: owner.verticalVelocityMetresPerSecond,
            condensateTendency: 0,
            glaciationRate: totalPath > 1e-8 ? icePath / totalPath : 0,
            precipitationEfficiency: clamp(
                owner.precipitationRateMillimetresPerHour / 20,
            ),
            outflowSpeed: Math.max(
                0,
                -owner.downdraftMetresPerSecond *
                    (1 + owner.coldPoolStrength01),
            ),
        },
    };
};

const featureToV2 = (
    feature: CloudWeatherFeature,
    owner: CloudWeatherOwner,
): Omit<CloudFeatureRecordV2, "featureId" | "parentOwnerNumericId"> => ({
    id: feature.id,
    parentOwnerId: owner.id,
    kind: feature.kind,
    attachmentKm: [
        feature.attachmentFraction[0] * owner.radiusEastKm,
        owner.baseAltitudeKm +
            (feature.attachmentFraction[1] + 0.5) * owner.geometricDepthKm,
        feature.attachmentFraction[2] * owner.radiusNorthKm,
    ],
    scaleKm: feature.scaleKm,
    orientationRadians: owner.orientationRadians,
    lifecycleProgress01: feature.lifecycleProgress01,
    active: feature.active,
    generation: feature.generation,
    materialClass: feature.materialPhase === "ice" ? "ice-cloud" :
        feature.materialPhase === "mixed" ? "mixed-phase-cloud" :
            feature.materialPhase === "precipitation" ? "rain" :
                "liquid-cloud",
    densityMultiplier: 1,
    liquidMultiplier: feature.materialPhase === "ice" ? 0 : 1,
    iceMultiplier: feature.materialPhase === "ice" ? 1.4 : 1,
    precipitationMultiplier: feature.precipitationSourceKgPerSecond > 0 ? 1.3 : 1,
    velocityOffsetKmPerSecond: [
        feature.velocityKmPerSecond[0] - owner.velocityKmPerSecond[0],
        feature.velocityKmPerSecond[1] - owner.velocityKmPerSecond[1],
        feature.velocityKmPerSecond[2] - owner.velocityKmPerSecond[2],
    ],
    ageOffsetSeconds: feature.ageSeconds - owner.ageSeconds,
});

const eventToV2 = (
    event: CloudWeatherSimulation["events"][number],
    simulation: CloudWeatherSimulation,
): CloudLifecycleEventV2 => ({
    id: event.id,
    step: event.step,
    simulationTimeSeconds: event.timeSeconds,
    kind: event.kind === "condensation" || event.kind === "evaporation"
        ? "growth" : event.kind,
    ownerIds: event.ownerIds.map((ownerId) =>
        simulation.owners.find(({ id }) => id === ownerId)?.numericId ?? 0)
        .filter((id) => id !== 0),
    featureIds: event.featureIds.map((featureId) =>
        simulation.features.find(({ id }) => id === featureId)?.numericId ?? 0)
        .filter((id) => id !== 0),
    parentEventIds: [],
    payload: event.values,
});

const adapterFor = (owner: CloudWeatherOwner) => {
    if (owner.family === "convective") return "specialized-deep-convection";
    if (owner.family === "high-ice") return "high-cloud-physical-foundation";
    if (owner.family === "middle") return "middle-cloud-physical-foundation";
    if (owner.family === "upper-atmospheric") {
        return "upper-atmospheric-cloud-foundation";
    }
    return "low-layered-cloud-physical-foundation";
};

export const compileGeneratedSimulationV2 = (
    simulation: CloudWeatherSimulation,
): readonly CompiledCloudSystemV2[] => simulation.owners
    .filter(({ active }) => active)
    .map((owner) => {
        const recipeId = cloudSpeciesFor(owner.classification);
        const recipe = CLOUD_RENDERER_RECIPES[recipeId];
        const state = generatedOwnerToCloudSystemState(owner, simulation.domain);
        return compileCloudSystemV2({
            state,
            recipeId,
            macroTopology: recipe.macroTopology,
            materialModel: recipe.materialModel,
            physicalFoundationAdapter: adapterFor(owner),
            atlasRepresentation: recipeId,
            generation: owner.generation,
            features: simulation.features
                .filter((feature) => feature.parentOwnerId === owner.id)
                .map((feature) => featureToV2(feature, owner)),
            events: simulation.events
                .filter(({ ownerIds }) => ownerIds.includes(owner.id))
                .map((event) => eventToV2(event, simulation)),
        });
    });

const layerOrganization = (
    owner: CloudWeatherOwner,
): CloudLayerState["organization"] => {
    if (owner.organization === "open-cell") return "open-cell";
    if (owner.organization === "closed-cell") return "closed-cell";
    if (owner.organization === "streets") return "streets";
    if (owner.organization === "frontal") return "frontal";
    if (owner.organization === "banded" ||
        owner.organization === "wave-packet") return "banded";
    if (owner.organization === "isolated") return "isolated";
    return "unorganized";
};

const layerFromOwner = (owner: CloudWeatherOwner): CloudLayerState => {
    const species = cloudSpeciesFor(owner.classification);
    const total = owner.liquidWaterMassKg + owner.iceWaterMassKg;
    const ice = total > 1e-8 ? owner.iceWaterMassKg / total : 0;
    const coverage = clamp(
        1 - Math.exp(-owner.radiusEastKm * owner.radiusNorthKm / 80),
    );
    return {
        genus: owner.classification.genus,
        species,
        present: owner.active,
        baseAltitude: owner.baseAltitudeKm * 1_000,
        thickness: owner.geometricDepthKm * 1_000,
        coverage,
        oktas: Math.max(1, Math.min(8, Math.round(coverage * 8))),
        opticalDepth: Math.max(0.02, Math.log1p(total / 1e7)),
        stratusBlend: owner.stratusFraction01,
        towerAmount: clamp(owner.verticalVelocityMetresPerSecond / 12),
        anvilAmount: owner.classification.supplementaryFeatures.includes("incus")
            ? 1 : clamp(ice * owner.geometricDepthKm / 8),
        iceFraction: ice,
        detailStrength: 0.2 + owner.turbulence01 * 0.75,
        windSpeed: Math.hypot(
            owner.velocityKmPerSecond[0],
            owner.velocityKmPerSecond[2],
        ) * 1_000,
        windDirection: Math.atan2(
            owner.velocityKmPerSecond[0],
            owner.velocityKmPerSecond[2],
        ),
        shear: clamp(owner.turbulence01 * 0.5 + ice * 0.4),
        turbulence: owner.turbulence01,
        precipitation: clamp(
            owner.precipitationRateMillimetresPerHour / 20,
        ),
        organization: layerOrganization(owner),
        lifecycle: owner.lifecycleProgress01,
        organizationStrength: clamp(
            0.35 + owner.turbulence01 * 0.3 +
            (owner.organization === "frontal" ? 0.25 : 0),
        ),
    };
};

const emptyLayer = (): CloudLayerState => ({
    genus: "clear",
    species: "generic",
    present: false,
    baseAltitude: 0,
    thickness: 0,
    coverage: 0,
    oktas: 0,
    opticalDepth: 0,
    stratusBlend: 0,
    towerAmount: 0,
    anvilAmount: 0,
    iceFraction: 0,
    detailStrength: 0,
    windSpeed: 0,
    windDirection: 0,
    shear: 0,
    turbulence: 0,
    precipitation: 0,
    organization: "unorganized",
    lifecycle: 0.5,
    organizationStrength: 0,
});

export const generatedSimulationToCloudScene = (
    simulation: CloudWeatherSimulation,
): CloudScene => {
    const activeOwners = simulation.owners.filter(({ active }) => active);
    const authoredSystems: CloudAuthoredSystemState[] = activeOwners.map(
        (owner) => ({
            id: owner.id,
            layerIndex: layerIndexFor(owner.classification.genus),
            layer: layerFromOwner(owner),
            manifold: {
                centerEastKm: owner.centerEastKm,
                centerNorthKm: owner.centerNorthKm,
                majorRadiusKm: owner.radiusEastKm,
                minorRadiusKm: owner.radiusNorthKm,
                orientation: owner.orientationRadians,
                boundaryTransitionKm: owner.boundaryTransitionKm,
            },
        }),
    );
    const layers: [CloudLayerState, CloudLayerState, CloudLayerState] = [
        emptyLayer(), emptyLayer(), emptyLayer(),
    ];
    for (const layerIndex of [0, 1, 2] as const) {
        const candidates = activeOwners.filter((owner) =>
            layerIndexFor(owner.classification.genus) === layerIndex)
            .sort((left, right) =>
                right.liquidWaterMassKg + right.iceWaterMassKg -
                left.liquidWaterMassKg - left.iceWaterMassKg);
        if (candidates[0]) layers[layerIndex] = layerFromOwner(candidates[0]);
    }
    const totalCoverage = 1 - layers.reduce(
        (clearFraction, layer) => clearFraction * (1 - layer.coverage),
        1,
    );
    const seed = simulation.seed >>> 0;
    return {
        layers,
        totalOktas: Math.round(totalCoverage * 8),
        convection: clamp(simulation.domain.capeJoulesPerKilogram / 4_000),
        instability: clamp(
            simulation.domain.capeJoulesPerKilogram / 3_500 -
            simulation.domain.cinJoulesPerKilogram / 600,
        ),
        humidity: simulation.domain.surfaceRelativeHumidity01,
        fog: clamp(Math.max(0, ...activeOwners.map((owner) =>
            owner.classification.genus === "stratus" &&
                owner.baseAltitudeKm < 0.15 ?
                1 - owner.baseAltitudeKm / 0.15 : 0))),
        noctilucent: clamp(Math.max(0, ...activeOwners.map((owner) =>
            owner.family === "upper-atmospheric" &&
                owner.baseAltitudeKm >= 70 ? 1 : 0))),
        authoredSystems,
        latitude: simulation.domain.latitudeDegrees,
        season: simulation.domain.season01,
        stratosphericTemperatureKelvin: simulation.domain.sounding.find(
            ({ altitudeKm }) => altitudeKm >= 15,
        )?.temperatureKelvin,
        mesopauseTemperatureKelvin: simulation.domain.sounding.find(
            ({ altitudeKm }) => altitudeKm >= 70,
        )?.temperatureKelvin,
        seed: [
            seed,
            (seed ^ 0x9e3779b9) >>> 0,
            Math.imul(seed || 1, 0x85ebca6b) >>> 0,
            Math.imul(seed || 1, 0xc2b2ae35) >>> 0,
        ],
    };
};

const createRuntime = (
    input: CreateCloudWeatherSimulationInput,
    steps: number,
): CloudGenerativeRuntime => {
    const simulation = runCloudWeatherSimulation(
        createCloudWeatherSimulation(input),
        steps,
    );
    return {
        mode: input.mode,
        simulation,
        scene: generatedSimulationToCloudScene(simulation),
        systemsV2: compileGeneratedSimulationV2(simulation),
        interactions: buildCloudInteractionGraph(simulation),
    };
};

export const createConditionedCloudRuntime = (
    input: CreateConditionedCloudRuntimeInput,
): CloudGenerativeRuntime => createRuntime({
    ...input,
    mode: "conditioned",
    target: input.target,
}, input.steps ?? 0);

export const createFreeRunningCloudRuntime = (
    input: CreateFreeRunningCloudRuntimeInput,
): CloudGenerativeRuntime => createRuntime({
    ...input,
    mode: "free-running",
}, input.steps ?? 0);

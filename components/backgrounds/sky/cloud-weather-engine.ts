import { cloudStableNumericId, type CloudVec3 } from "./cloud-physical-sample";

export const CLOUD_WEATHER_ENGINE_SCHEMA_VERSION = 1 as const;

export type CloudGenerationMode = "conditioned" | "free-running";
export type GeneratedCloudGenus =
    | "cirrus"
    | "cirrocumulus"
    | "cirrostratus"
    | "altocumulus"
    | "altostratus"
    | "nimbostratus"
    | "stratocumulus"
    | "stratus"
    | "cumulus"
    | "cumulonimbus";
export type GeneratedCloudFamily =
    | "convective"
    | "low-layered"
    | "middle"
    | "high-ice"
    | "upper-atmospheric";
export type GeneratedLifecycleStage =
    | "incipient"
    | "growing"
    | "mature"
    | "glaciating"
    | "precipitating"
    | "decaying"
    | "dead";
export type GeneratedPrecipitationKind =
    | "none"
    | "virga"
    | "drizzle"
    | "rain"
    | "shower"
    | "snow"
    | "hail";
export type GeneratedCloudFeatureKind =
    | "pileus"
    | "velum"
    | "pannus"
    | "arcus"
    | "mamma"
    | "cavum"
    | "virga"
    | "incus"
    | "murus"
    | "cauda"
    | "flumen"
    | "tuba";
export type CloudWeatherEdgeKind =
    | "lineage"
    | "merge"
    | "split"
    | "attachment"
    | "cold-pool-influence"
    | "overlap"
    | "genitus"
    | "mutatus";
export type CloudWeatherEventKind =
    | "birth"
    | "condensation"
    | "evaporation"
    | "growth"
    | "merge"
    | "split"
    | "glaciation"
    | "precipitation-onset"
    | "feature-attach"
    | "feature-detach"
    | "decay"
    | "death";

export interface GeneratedCloudClassification {
    genus: GeneratedCloudGenus;
    species: string | null;
    varieties: string[];
    supplementaryFeatures: string[];
    accessoryClouds: string[];
    origin:
        | { kind: "natural" }
        | { kind: "genitus" | "mutatus"; motherGenus: GeneratedCloudGenus }
        | { kind: "special"; designation: string; source?: string };
}

export interface CloudAtmosphericLevel {
    altitudeKm: number;
    temperatureKelvin: number;
    relativeHumidity01: number;
    windEastMetresPerSecond: number;
    windNorthMetresPerSecond: number;
    verticalVelocityMetresPerSecond: number;
}

export interface CloudWeatherDomain {
    id: string;
    latitudeDegrees: number;
    longitudeDegrees: number;
    season01: number;
    terrainElevationKm: number;
    terrainRoughness01: number;
    surfaceTemperatureKelvin: number;
    surfaceRelativeHumidity01: number;
    surfaceHeatFluxWattsPerSquareMetre: number;
    surfaceMoistureFluxGramsPerSquareMetrePerSecond: number;
    aerosolNumberConcentrationCm3: number;
    freezingLevelKm: number;
    equilibriumLevelKm: number;
    tropopauseKm: number;
    inversionBaseKm: number | null;
    inversionStrengthKelvin: number;
    capeJoulesPerKilogram: number;
    cinJoulesPerKilogram: number;
    sounding: readonly CloudAtmosphericLevel[];
}

export interface CloudWeatherForcing {
    surfaceHeatFluxMultiplier: number;
    surfaceMoistureFluxMultiplier: number;
    synopticLiftMetresPerSecond: number;
    convergence01: number;
    frontogenesis01: number;
    orographicLiftMetresPerSecond: number;
    cloudTopRadiativeCoolingKelvinPerHour: number;
    subsidenceMetresPerSecond: number;
    aerosolMultiplier: number;
    windShearMultiplier: number;
}

export interface ConditionedCloudTarget {
    genus: GeneratedCloudGenus;
    upperAtmosphericCloud?: "polar-stratospheric-sts" |
        "polar-stratospheric-nat" | "polar-stratospheric-ice" |
        "nacreous" | "noctilucent";
    species?: string | null;
    varieties?: readonly string[];
    supplementaryFeatures?: readonly string[];
    accessoryClouds?: readonly string[];
    origin?: GeneratedCloudClassification["origin"];
    lifecycleStage?: Exclude<GeneratedLifecycleStage, "dead">;
    coverageOktas?: number;
    ownerCount?: number;
}

export interface CloudOwnerSeed {
    id?: string;
    family?: GeneratedCloudFamily;
    centerEastKm: number;
    centerNorthKm: number;
    baseAltitudeKm: number;
    geometricDepthKm: number;
    radiusEastKm: number;
    radiusNorthKm: number;
    orientationRadians?: number;
    liquidWaterMassKg?: number;
    iceWaterMassKg?: number;
    verticalVelocityMetresPerSecond?: number;
    stratusFraction01?: number;
    organization?: CloudWeatherOwner["organization"];
    classification?: GeneratedCloudClassification;
    generation?: number;
}

export interface CreateCloudWeatherSimulationInput {
    mode: CloudGenerationMode;
    seed: number;
    domain: CloudWeatherDomain;
    forcing?: Partial<CloudWeatherForcing>;
    target?: ConditionedCloudTarget;
    fixedStepSeconds?: number;
    initialOwners?: readonly CloudOwnerSeed[];
    maxOwners?: number;
    maxFeatures?: number;
}

export interface CloudWeatherOwner {
    id: string;
    numericId: number;
    generation: number;
    family: GeneratedCloudFamily;
    classification: GeneratedCloudClassification;
    active: boolean;
    centerEastKm: number;
    centerNorthKm: number;
    baseAltitudeKm: number;
    geometricDepthKm: number;
    radiusEastKm: number;
    radiusNorthKm: number;
    orientationRadians: number;
    boundaryTransitionKm: number;
    velocityKmPerSecond: CloudVec3;
    liquidWaterMassKg: number;
    iceWaterMassKg: number;
    liquidEffectiveRadiusMicrons: number;
    iceEffectiveRadiusMicrons: number;
    temperatureKelvin: number;
    relativeHumidity01: number;
    verticalVelocityMetresPerSecond: number;
    downdraftMetresPerSecond: number;
    entrainment01: number;
    turbulence01: number;
    stratusFraction01: number;
    precipitationKind: GeneratedPrecipitationKind;
    precipitationRateMillimetresPerHour: number;
    coldPoolStrength01: number;
    lifecycleStage: GeneratedLifecycleStage;
    lifecycleProgress01: number;
    ageSeconds: number;
    organization:
        | "isolated"
        | "clustered"
        | "streets"
        | "open-cell"
        | "closed-cell"
        | "frontal"
        | "banded"
        | "wave-packet"
        | "storm-complex";
    parentOwnerIds: string[];
    childOwnerIds: string[];
    featureIds: string[];
    lastMergeStep: number | null;
    lastSplitStep: number | null;
}

export interface CloudWeatherFeature {
    id: string;
    numericId: number;
    kind: GeneratedCloudFeatureKind;
    parentOwnerId: string;
    parentOwnerNumericId: number;
    active: boolean;
    attachmentFraction: CloudVec3;
    scaleKm: CloudVec3;
    velocityKmPerSecond: CloudVec3;
    materialPhase: "liquid" | "mixed" | "ice" | "precipitation";
    precipitationSourceKgPerSecond: number;
    lifecycleProgress01: number;
    ageSeconds: number;
    generation: number;
}

export interface CloudWeatherEdge {
    id: string;
    kind: CloudWeatherEdgeKind;
    fromId: string;
    toId: string;
    createdStep: number;
    strength01: number;
}

export interface CloudWeatherEvent {
    id: string;
    kind: CloudWeatherEventKind;
    step: number;
    timeSeconds: number;
    ownerIds: string[];
    featureIds: string[];
    values: Record<string, number | string | boolean>;
}

export interface CloudWeatherSimulation {
    schemaVersion: typeof CLOUD_WEATHER_ENGINE_SCHEMA_VERSION;
    mode: CloudGenerationMode;
    seed: number;
    fixedStepSeconds: number;
    step: number;
    timeSeconds: number;
    domain: CloudWeatherDomain;
    forcing: CloudWeatherForcing;
    target?: ConditionedCloudTarget;
    owners: CloudWeatherOwner[];
    features: CloudWeatherFeature[];
    edges: CloudWeatherEdge[];
    events: CloudWeatherEvent[];
    nextOwnerSequence: number;
    nextFeatureSequence: number;
    nextEventSequence: number;
    maxOwners: number;
    maxFeatures: number;
}

export interface CloudWeatherStepUpdate {
    forcing?: Partial<CloudWeatherForcing>;
    domain?: Partial<Omit<CloudWeatherDomain, "sounding">> & {
        sounding?: readonly CloudAtmosphericLevel[];
    };
}

export type CloudWeatherStepInput =
    | Partial<CloudWeatherForcing>
    | CloudWeatherStepUpdate;

export interface CloudWeatherEngineIssue {
    code: string;
    subject: string;
    message: string;
}

const DEFAULT_FORCING: CloudWeatherForcing = {
    surfaceHeatFluxMultiplier: 1,
    surfaceMoistureFluxMultiplier: 1,
    synopticLiftMetresPerSecond: 0,
    convergence01: 0.25,
    frontogenesis01: 0,
    orographicLiftMetresPerSecond: 0,
    cloudTopRadiativeCoolingKelvinPerHour: 0.8,
    subsidenceMetresPerSecond: 0,
    aerosolMultiplier: 1,
    windShearMultiplier: 1,
};

const clamp = (value: number, low = 0, high = 1) =>
    Math.min(high, Math.max(low, value));
const mix = (left: number, right: number, amount: number) =>
    left + (right - left) * clamp(amount);
const finite = (value: number, fallback = 0) =>
    Number.isFinite(value) ? value : fallback;
const distance = (left: CloudWeatherOwner, right: CloudWeatherOwner) =>
    Math.hypot(
        left.centerEastKm - right.centerEastKm,
        left.centerNorthKm - right.centerNorthKm,
    );
const totalCondensate = (owner: CloudWeatherOwner) =>
    owner.liquidWaterMassKg + owner.iceWaterMassKg;
const iceFraction = (owner: CloudWeatherOwner) => {
    const total = totalCondensate(owner);
    return total > 1e-6 ? owner.iceWaterMassKg / total : 0;
};
const cloudTopKm = (owner: CloudWeatherOwner) =>
    owner.baseAltitudeKm + owner.geometricDepthKm;

const hash32 = (...values: number[]) => {
    let hash = 0x811c9dc5;
    for (const input of values) {
        hash ^= Math.trunc(input) >>> 0;
        hash = Math.imul(hash, 0x01000193);
        hash ^= hash >>> 13;
    }
    return hash >>> 0;
};

export const cloudWeatherRandom01 = (
    seed: number,
    ownerId: string,
    process: string,
    step: number,
    stream = 0,
) => hash32(
    seed,
    cloudStableNumericId(ownerId),
    cloudStableNumericId(process),
    step,
    stream,
) / 0x1_0000_0000;

const atmosphericLevelAt = (
    domain: CloudWeatherDomain,
    altitudeKm: number,
): CloudAtmosphericLevel => {
    const levels = [...domain.sounding].sort((left, right) =>
        left.altitudeKm - right.altitudeKm);
    if (levels.length === 0) {
        return {
            altitudeKm,
            temperatureKelvin: domain.surfaceTemperatureKelvin - altitudeKm * 6.5,
            relativeHumidity01: domain.surfaceRelativeHumidity01,
            windEastMetresPerSecond: 0,
            windNorthMetresPerSecond: 0,
            verticalVelocityMetresPerSecond: 0,
        };
    }
    const lower = [...levels].reverse().find((level) =>
        level.altitudeKm <= altitudeKm) ?? levels[0];
    const upper = levels.find((level) => level.altitudeKm >= altitudeKm) ??
        levels[levels.length - 1];
    if (lower === upper) return { ...lower, altitudeKm };
    const amount = (altitudeKm - lower.altitudeKm) /
        Math.max(1e-6, upper.altitudeKm - lower.altitudeKm);
    return {
        altitudeKm,
        temperatureKelvin: mix(
            lower.temperatureKelvin,
            upper.temperatureKelvin,
            amount,
        ),
        relativeHumidity01: mix(
            lower.relativeHumidity01,
            upper.relativeHumidity01,
            amount,
        ),
        windEastMetresPerSecond: mix(
            lower.windEastMetresPerSecond,
            upper.windEastMetresPerSecond,
            amount,
        ),
        windNorthMetresPerSecond: mix(
            lower.windNorthMetresPerSecond,
            upper.windNorthMetresPerSecond,
            amount,
        ),
        verticalVelocityMetresPerSecond: mix(
            lower.verticalVelocityMetresPerSecond,
            upper.verticalVelocityMetresPerSecond,
            amount,
        ),
    };
};

const genusFamily = (genus: GeneratedCloudGenus): GeneratedCloudFamily => {
    if (genus === "cumulus" || genus === "cumulonimbus") return "convective";
    if (genus === "stratus" || genus === "stratocumulus" ||
        genus === "nimbostratus") return "low-layered";
    if (genus === "altocumulus" || genus === "altostratus") return "middle";
    return "high-ice";
};

const defaultClassification = (
    genus: GeneratedCloudGenus,
    species: string | null = null,
): GeneratedCloudClassification => ({
    genus,
    species,
    varieties: [],
    supplementaryFeatures: [],
    accessoryClouds: [],
    origin: { kind: "natural" },
});

const conditionedProfile = (
    target: ConditionedCloudTarget,
    domain: CloudWeatherDomain,
): CloudOwnerSeed => {
    const coverage = clamp((target.coverageOktas ?? 3) / 8);
    const profiles: Record<GeneratedCloudGenus, {
        base: number; depth: number; radius: number; stratus: number;
        liquid: number; ice: number; updraft: number;
        organization: CloudWeatherOwner["organization"];
    }> = {
        cirrus: { base: 8.5, depth: 1.1, radius: 9, stratus: 0.2,
            liquid: 0, ice: 1.8e7, updraft: 0.05, organization: "banded" },
        cirrocumulus: { base: 7.4, depth: 0.6, radius: 5, stratus: 0.45,
            liquid: 1e5, ice: 8e6, updraft: 0.12, organization: "closed-cell" },
        cirrostratus: { base: 7.2, depth: 1.2, radius: 35, stratus: 0.96,
            liquid: 0, ice: 2.2e7, updraft: 0.02, organization: "frontal" },
        altocumulus: { base: 3.4, depth: 1.0, radius: 6, stratus: 0.45,
            liquid: 2.4e7, ice: 4e6, updraft: 0.7, organization: "closed-cell" },
        altostratus: { base: 2.8, depth: 2.0, radius: 45, stratus: 0.94,
            liquid: 5e7, ice: 1.7e7, updraft: 0.15, organization: "frontal" },
        nimbostratus: { base: 0.8, depth: 5.2, radius: 65, stratus: 0.98,
            liquid: 1.8e8, ice: 7e7, updraft: 0.25, organization: "frontal" },
        stratocumulus: { base: 0.7, depth: 0.9, radius: 16, stratus: 0.72,
            liquid: 7e7, ice: 0, updraft: 0.45, organization: "closed-cell" },
        stratus: { base: 0.18, depth: 0.45, radius: 28, stratus: 0.99,
            liquid: 4e7, ice: 0, updraft: 0.04, organization: "frontal" },
        cumulus: { base: 0.75, depth: 1.4, radius: 2.2, stratus: 0.08,
            liquid: 2.7e7, ice: 0, updraft: 3.5, organization: "isolated" },
        cumulonimbus: { base: 0.8, depth: 10.5, radius: 8, stratus: 0.08,
            liquid: 2.4e8, ice: 1.4e8, updraft: 12, organization: "storm-complex" },
    };
    const upperAtmospheric = target.upperAtmosphericCloud;
    const profile = upperAtmospheric ? {
        base: upperAtmospheric === "noctilucent" ? 80 : 18,
        depth: upperAtmospheric === "noctilucent" ? 1.2 : 2.2,
        radius: upperAtmospheric === "noctilucent" ? 90 : 38,
        stratus: 0.72, liquid: 0, ice: 1.1e7, updraft: 0.01,
        organization: "wave-packet" as const,
    } : profiles[target.genus];
    const classification = defaultClassification(
        target.genus,
        target.species ?? null,
    );
    classification.varieties = [...(target.varieties ?? [])];
    classification.supplementaryFeatures = [
        ...(target.supplementaryFeatures ?? []),
    ];
    classification.accessoryClouds = [...(target.accessoryClouds ?? [])];
    classification.origin = target.origin ?? { kind: "natural" };
    const requestedSpecies = target.species ?? "";
    const requestedOrganization = requestedSpecies === "lenticularis"
        ? "wave-packet" as const
        : requestedSpecies === "castellanus"
            ? "streets" as const
            : requestedSpecies === "floccus" || requestedSpecies === "uncinus"
                ? "isolated" as const
                : profile.organization;
    const requestedUpdraft = requestedSpecies === "castellanus"
        ? Math.max(profile.updraft, 1.8)
        : requestedSpecies === "lenticularis"
            ? Math.min(profile.updraft, 0.18)
            : profile.updraft;
    return {
        family: upperAtmospheric ? "upper-atmospheric" : genusFamily(target.genus),
        centerEastKm: 0,
        centerNorthKm: 24,
        baseAltitudeKm: Math.max(domain.terrainElevationKm, profile.base),
        geometricDepthKm: profile.depth,
        radiusEastKm: profile.radius * Math.max(0.3, coverage),
        radiusNorthKm: profile.radius * Math.max(0.3, coverage) * 0.8,
        liquidWaterMassKg: profile.liquid * Math.max(0.25, coverage),
        iceWaterMassKg: profile.ice * Math.max(0.25, coverage),
        verticalVelocityMetresPerSecond: requestedUpdraft,
        stratusFraction01: profile.stratus,
        organization: requestedOrganization,
        classification,
    };
};

const ownerFromSeed = (
    seed: CloudOwnerSeed,
    simulationSeed: number,
    sequence: number,
    domain: CloudWeatherDomain,
): CloudWeatherOwner => {
    const id = seed.id ?? `cloud-owner-${sequence}`;
    const midpointAltitude = seed.baseAltitudeKm + seed.geometricDepthKm * 0.5;
    const atmosphere = atmosphericLevelAt(domain, midpointAltitude);
    const classification = seed.classification ?? defaultClassification(
        seed.family === "convective" ? "cumulus" :
            seed.family === "middle" ? "altocumulus" :
                seed.family === "high-ice" ? "cirrus" :
                    seed.family === "upper-atmospheric" ? "cirrus" :
                        "stratocumulus",
        null,
    );
    const family = seed.family ?? genusFamily(classification.genus);
    const jitter = cloudWeatherRandom01(simulationSeed, id, "initial", 0);
    return {
        id,
        numericId: cloudStableNumericId(id),
        generation: seed.generation ?? 0,
        family,
        classification,
        active: true,
        centerEastKm: seed.centerEastKm,
        centerNorthKm: seed.centerNorthKm,
        baseAltitudeKm: seed.baseAltitudeKm,
        geometricDepthKm: Math.max(0.05, seed.geometricDepthKm),
        radiusEastKm: Math.max(0.05, seed.radiusEastKm),
        radiusNorthKm: Math.max(0.05, seed.radiusNorthKm),
        orientationRadians: seed.orientationRadians ?? jitter * Math.PI * 2,
        boundaryTransitionKm: Math.max(
            0.02,
            Math.min(seed.radiusEastKm, seed.radiusNorthKm) * 0.18,
        ),
        velocityKmPerSecond: [
            atmosphere.windEastMetresPerSecond / 1_000,
            (seed.verticalVelocityMetresPerSecond ??
                atmosphere.verticalVelocityMetresPerSecond) / 1_000,
            atmosphere.windNorthMetresPerSecond / 1_000,
        ],
        liquidWaterMassKg: Math.max(0, seed.liquidWaterMassKg ?? 1e6),
        iceWaterMassKg: Math.max(0, seed.iceWaterMassKg ?? 0),
        liquidEffectiveRadiusMicrons: 8 + jitter * 8,
        iceEffectiveRadiusMicrons: 25 + jitter * 35,
        temperatureKelvin: atmosphere.temperatureKelvin,
        relativeHumidity01: clamp(atmosphere.relativeHumidity01),
        verticalVelocityMetresPerSecond:
            seed.verticalVelocityMetresPerSecond ??
            atmosphere.verticalVelocityMetresPerSecond,
        downdraftMetresPerSecond: 0,
        entrainment01: 0.08 + jitter * 0.22,
        turbulence01: 0.15 + jitter * 0.45,
        stratusFraction01: clamp(seed.stratusFraction01 ?? 0.5),
        precipitationKind: "none",
        precipitationRateMillimetresPerHour: 0,
        coldPoolStrength01: 0,
        lifecycleStage: "incipient",
        lifecycleProgress01: 0,
        ageSeconds: 0,
        organization: seed.organization ?? "isolated",
        parentOwnerIds: [],
        childOwnerIds: [],
        featureIds: [],
        lastMergeStep: null,
        lastSplitStep: null,
    };
};

const emitEvent = (
    simulation: CloudWeatherSimulation,
    kind: CloudWeatherEventKind,
    ownerIds: string[],
    featureIds: string[] = [],
    values: Record<string, number | string | boolean> = {},
) => {
    const id = `weather-event-${simulation.nextEventSequence}`;
    simulation.nextEventSequence += 1;
    simulation.events.push({
        id,
        kind,
        step: simulation.step,
        timeSeconds: simulation.timeSeconds,
        ownerIds,
        featureIds,
        values,
    });
};

export const createCloudWeatherSimulation = (
    input: CreateCloudWeatherSimulationInput,
): CloudWeatherSimulation => {
    if (input.mode === "conditioned" && !input.target) {
        throw new Error("Conditioned generation requires a target.");
    }
    const forcing = { ...DEFAULT_FORCING, ...input.forcing };
    const initialSeeds = input.initialOwners?.length
        ? [...input.initialOwners]
        : input.mode === "conditioned"
            ? Array.from(
                { length: Math.max(1, input.target?.ownerCount ?? 1) },
                (_, index) => ({
                    ...conditionedProfile(input.target!, input.domain),
                    centerEastKm: index * 5 -
                        Math.max(0, (input.target?.ownerCount ?? 1) - 1) * 2.5,
                }),
            )
            : [];
    const simulation: CloudWeatherSimulation = {
        schemaVersion: CLOUD_WEATHER_ENGINE_SCHEMA_VERSION,
        mode: input.mode,
        seed: input.seed >>> 0,
        fixedStepSeconds: Math.max(1, input.fixedStepSeconds ?? 30),
        step: 0,
        timeSeconds: 0,
        domain: {
            ...input.domain,
            sounding: [...input.domain.sounding],
        },
        forcing,
        ...(input.target ? { target: { ...input.target } } : {}),
        owners: [],
        features: [],
        edges: [],
        events: [],
        nextOwnerSequence: 1,
        nextFeatureSequence: 1,
        nextEventSequence: 1,
        maxOwners: Math.max(1, input.maxOwners ?? 48),
        maxFeatures: Math.max(0, input.maxFeatures ?? 192),
    };
    for (const seed of initialSeeds) {
        const owner = ownerFromSeed(
            seed,
            simulation.seed,
            simulation.nextOwnerSequence,
            simulation.domain,
        );
        simulation.nextOwnerSequence += 1;
        simulation.owners.push(owner);
        emitEvent(simulation, "birth", [owner.id], [], { initial: true });
    }
    return simulation;
};

const cloneSimulation = (
    source: CloudWeatherSimulation,
): CloudWeatherSimulation => ({
    ...source,
    domain: { ...source.domain, sounding: source.domain.sounding.map((level) =>
        ({ ...level })) },
    forcing: { ...source.forcing },
    target: source.target ? { ...source.target } : undefined,
    owners: source.owners.map((owner) => ({
        ...owner,
        classification: {
            ...owner.classification,
            varieties: [...owner.classification.varieties],
            supplementaryFeatures: [
                ...owner.classification.supplementaryFeatures,
            ],
            accessoryClouds: [...owner.classification.accessoryClouds],
            origin: { ...owner.classification.origin },
        } as GeneratedCloudClassification,
        velocityKmPerSecond: [...owner.velocityKmPerSecond] as CloudVec3,
        parentOwnerIds: [...owner.parentOwnerIds],
        childOwnerIds: [...owner.childOwnerIds],
        featureIds: [...owner.featureIds],
    })),
    features: source.features.map((feature) => ({
        ...feature,
        attachmentFraction: [...feature.attachmentFraction] as CloudVec3,
        scaleKm: [...feature.scaleKm] as CloudVec3,
        velocityKmPerSecond: [...feature.velocityKmPerSecond] as CloudVec3,
    })),
    edges: source.edges.map((edge) => ({ ...edge })),
    events: source.events.map((event) => ({
        ...event,
        ownerIds: [...event.ownerIds],
        featureIds: [...event.featureIds],
        values: { ...event.values },
    })),
});

const lifecycleFor = (owner: CloudWeatherOwner): GeneratedLifecycleStage => {
    const total = totalCondensate(owner);
    if (!owner.active || total < 2e3) return "dead";
    if (owner.lifecycleProgress01 >= 0.86 ||
        owner.relativeHumidity01 < 0.48) return "decaying";
    if (owner.precipitationRateMillimetresPerHour > 0.2) {
        return "precipitating";
    }
    if (iceFraction(owner) >= 0.18 && owner.family === "convective") {
        return "glaciating";
    }
    if (owner.lifecycleProgress01 < 0.2) return "incipient";
    if (owner.lifecycleProgress01 < 0.48) return "growing";
    return "mature";
};

const classifyCloudOwner = (
    owner: CloudWeatherOwner,
    domain: CloudWeatherDomain,
): GeneratedCloudClassification => {
    const top = cloudTopKm(owner);
    const depth = owner.geometricDepthKm;
    const ice = iceFraction(owner);
    let genus: GeneratedCloudGenus;
    let species: string | null = null;

    // Family is a physical process contract, not an editorial label.  It is
    // therefore authoritative before altitude/updraft heuristics.  This keeps
    // orographic middle clouds from being reclassified as surface convection
    // and broad ice streamers from collapsing into Cirrocumulus solely because
    // their finite owner support has become narrow while dissipating.
    if (owner.family === "upper-atmospheric" || owner.baseAltitudeKm >= 15) {
        genus = "cirrus";
        species = domain.season01 > 0.72 ? "fibratus" : "spissatus";
    } else if (owner.family === "convective") {
        if (depth >= 6 || top >= 8.5) {
            genus = "cumulonimbus";
            species = ice >= 0.48 ? "capillatus" : "calvus";
        } else {
            genus = "cumulus";
            species = owner.lifecycleStage === "decaying" ? "fractus" :
                depth < 0.8 ? "humilis" : depth < 2.2
                    ? "mediocris" : "congestus";
        }
    } else if (owner.family === "high-ice") {
        if (owner.stratusFraction01 >= 0.78) {
            genus = "cirrostratus";
            species = owner.turbulence01 > 0.28 ? "fibratus" : "nebulosus";
        } else if (owner.organization === "closed-cell" ||
            owner.organization === "open-cell" ||
            (owner.radiusEastKm < 5 && owner.organization !== "isolated")) {
            genus = "cirrocumulus";
            species = owner.organization === "wave-packet"
                ? "lenticularis" : owner.verticalVelocityMetresPerSecond > 0.5
                    ? "castellanus" : owner.lifecycleStage === "decaying"
                        ? "floccus" : "stratiformis";
        } else {
            genus = "cirrus";
            species = owner.organization === "streets" ? "castellanus" :
                owner.organization === "isolated" &&
                    owner.classification.species === "uncinus" ? "uncinus" :
                owner.organization === "isolated" &&
                    owner.precipitationKind === "virga" ? "uncinus" :
                owner.organization === "isolated" &&
                    owner.turbulence01 > 0.52 ? "floccus" :
                owner.organization === "banded" &&
                    totalCondensate(owner) < 3e7 ? "fibratus" :
                    owner.classification.species === "uncinus" ? "uncinus" :
                    "spissatus";
        }
    } else if (owner.family === "middle") {
        if (owner.stratusFraction01 >= 0.82) {
            genus = owner.precipitationRateMillimetresPerHour > 0.8 && depth > 3
                ? "nimbostratus" : "altostratus";
            species = null;
        } else {
            genus = "altocumulus";
            species = owner.organization === "wave-packet" ? "lenticularis" :
                owner.verticalVelocityMetresPerSecond > 1.2 ? "castellanus" :
                    owner.lifecycleStage === "decaying" ? "floccus" :
                        owner.classification.species === "volutus"
                            ? "volutus" : "stratiformis";
        }
    } else if (owner.stratusFraction01 >= 0.9 &&
        owner.baseAltitudeKm <= 0.35) {
        genus = "stratus";
        species = owner.lifecycleStage === "decaying" ? "fractus" : "nebulosus";
    } else if (owner.stratusFraction01 >= 0.55) {
        genus = owner.precipitationRateMillimetresPerHour > 1.2 && depth > 3
            ? "nimbostratus" : "stratocumulus";
        species = genus === "stratocumulus"
            ? owner.organization === "wave-packet" ? "lenticularis" :
                owner.verticalVelocityMetresPerSecond > 1 ? "castellanus" :
                    owner.lifecycleStage === "decaying" ? "floccus" :
                        "stratiformis"
            : null;
    } else {
        genus = "cumulus";
        species = owner.lifecycleStage === "decaying" ? "fractus" :
            depth < 0.8 ? "humilis" : depth < 2.2 ? "mediocris" : "congestus";
    }

    const previous = owner.classification;
    return {
        genus,
        species,
        varieties: [...previous.varieties],
        supplementaryFeatures: [],
        accessoryClouds: [],
        origin: { ...previous.origin } as GeneratedCloudClassification["origin"],
    };
};

const processOwner = (
    owner: CloudWeatherOwner,
    simulation: CloudWeatherSimulation,
) => {
    if (!owner.active) return;
    const dt = simulation.fixedStepSeconds;
    const forcing = simulation.forcing;
    owner.ageSeconds += dt;
    // Orographic wave clouds are materially regenerated in the standing wave;
    // they do not advect as a rigid cloud card with the ambient wind.
    if (owner.family === "middle" &&
        forcing.orographicLiftMetresPerSecond > 0.25) {
        owner.velocityKmPerSecond = [0, owner.velocityKmPerSecond[1], 0];
    }
    owner.centerEastKm += owner.velocityKmPerSecond[0] * dt;
    owner.centerNorthKm += owner.velocityKmPerSecond[2] * dt;

    const midpoint = owner.baseAltitudeKm + owner.geometricDepthKm * 0.5;
    const atmosphere = atmosphericLevelAt(simulation.domain, midpoint);
    const topAtmosphere = atmosphericLevelAt(
        simulation.domain,
        cloudTopKm(owner),
    );
    const heatFlux = simulation.domain.surfaceHeatFluxWattsPerSquareMetre *
        forcing.surfaceHeatFluxMultiplier;
    const moistureFlux =
        simulation.domain.surfaceMoistureFluxGramsPerSquareMetrePerSecond *
        forcing.surfaceMoistureFluxMultiplier;
    const lift = atmosphere.verticalVelocityMetresPerSecond +
        forcing.synopticLiftMetresPerSecond +
        forcing.orographicLiftMetresPerSecond +
        forcing.convergence01 * 0.75 - forcing.subsidenceMetresPerSecond;
    const buoyancy = simulation.domain.capeJoulesPerKilogram / 4_000 -
        simulation.domain.cinJoulesPerKilogram / 600 + heatFlux / 500;
    const targetVertical = owner.family === "convective"
        ? Math.max(-2, lift + buoyancy * 8)
        : lift + forcing.cloudTopRadiativeCoolingKelvinPerHour *
            owner.stratusFraction01 * 0.12;
    owner.verticalVelocityMetresPerSecond = mix(
        owner.verticalVelocityMetresPerSecond,
        targetVertical,
        0.08,
    );
    owner.velocityKmPerSecond = [
        atmosphere.windEastMetresPerSecond / 1_000,
        owner.verticalVelocityMetresPerSecond / 1_000,
        atmosphere.windNorthMetresPerSecond / 1_000,
    ];
    owner.temperatureKelvin = mix(
        owner.temperatureKelvin,
        atmosphere.temperatureKelvin,
        0.04,
    );
    owner.relativeHumidity01 = clamp(mix(
        owner.relativeHumidity01,
        atmosphere.relativeHumidity01 + moistureFlux * 0.004 + lift * 0.025,
        0.06,
    ));
    if (owner.family === "low-layered") {
        const targetBaseKm = simulation.domain.terrainElevationKm +
            Math.max(0.02, (1 - simulation.domain.surfaceRelativeHumidity01) * 1.4);
        owner.baseAltitudeKm = mix(owner.baseAltitudeKm, targetBaseKm, 0.035);
        const targetStratus = clamp(
            0.42 + owner.relativeHumidity01 * 0.62 +
            forcing.cloudTopRadiativeCoolingKelvinPerHour * 0.07 -
            heatFlux / 520 - owner.turbulence01 * 0.08,
        );
        owner.stratusFraction01 = mix(
            owner.stratusFraction01,
            targetStratus,
            0.045,
        );
        owner.turbulence01 = clamp(mix(
            owner.turbulence01,
            heatFlux / 420 + Math.max(0, lift) * 0.25,
            0.035,
        ));
        if (forcing.frontogenesis01 > 0.55) owner.organization = "frontal";
        else if (owner.turbulence01 > 0.58) owner.organization = "open-cell";
        else if (owner.turbulence01 > 0.28) owner.organization = "closed-cell";
    } else if (owner.family === "middle") {
        owner.stratusFraction01 = mix(
            owner.stratusFraction01,
            clamp(0.35 + forcing.frontogenesis01 * 0.7 +
                owner.relativeHumidity01 * 0.22),
            0.025,
        );
        if (forcing.orographicLiftMetresPerSecond > 0.25) {
            owner.organization = "wave-packet";
            owner.velocityKmPerSecond = [0, owner.velocityKmPerSecond[1], 0];
        } else if (forcing.frontogenesis01 > 0.48) {
            owner.organization = "frontal";
        } else if (owner.verticalVelocityMetresPerSecond > 1.1) {
            owner.organization = "streets";
        }
    } else if (owner.family === "high-ice") {
        const shearStretch = Math.max(0, forcing.windShearMultiplier) *
            Math.hypot(
                simulation.domain.sounding.at(-1)?.windEastMetresPerSecond ?? 0,
                simulation.domain.sounding.at(-1)?.windNorthMetresPerSecond ?? 0,
            ) * dt / 3_600_000;
        owner.radiusEastKm *= 1 + Math.min(0.004, shearStretch);
        owner.radiusNorthKm *= 1 - Math.min(0.0015, shearStretch * 0.35);
        const sedimentationKm = owner.iceEffectiveRadiusMicrons *
            (0.00000008 + owner.turbulence01 * 0.00000003) * dt;
        owner.baseAltitudeKm = Math.max(
            simulation.domain.freezingLevelKm + 0.2,
            owner.baseAltitudeKm - sedimentationKm,
        );
        if (owner.organization !== "wave-packet" &&
            owner.organization !== "isolated") owner.organization = "banded";
    } else if (owner.family === "upper-atmospheric") {
        owner.verticalVelocityMetresPerSecond = mix(
            owner.verticalVelocityMetresPerSecond,
            0,
            0.2,
        );
        owner.velocityKmPerSecond = [
            atmosphere.windEastMetresPerSecond / 1_000,
            0,
            atmosphere.windNorthMetresPerSecond / 1_000,
        ];
        owner.stratusFraction01 = Math.max(owner.stratusFraction01, 0.6);
        owner.organization = "wave-packet";
    }

    const saturationExcess = Math.max(0, owner.relativeHumidity01 - 0.78);
    const condensationRateKgPerSecond = saturationExcess *
        Math.max(1, owner.radiusEastKm * owner.radiusNorthKm) *
        (2_500 + Math.max(0, lift) * 1_800) *
        (0.7 + forcing.aerosolMultiplier * 0.3);
    const evaporationRateKgPerSecond = Math.max(
        0,
        0.72 - owner.relativeHumidity01,
    ) * totalCondensate(owner) * (0.00005 + owner.entrainment01 * 0.00004);
    const condensateDelta = (condensationRateKgPerSecond -
        evaporationRateKgPerSecond) * dt;
    if (condensateDelta >= 0) {
        owner.liquidWaterMassKg += condensateDelta;
        if (condensateDelta > 1) {
            emitEvent(simulation, "condensation", [owner.id], [], {
                kilograms: condensateDelta,
            });
        }
    } else {
        const loss = Math.min(owner.liquidWaterMassKg, -condensateDelta);
        owner.liquidWaterMassKg -= loss;
        const remainder = Math.max(0, -condensateDelta - loss);
        owner.iceWaterMassKg = Math.max(0, owner.iceWaterMassKg - remainder);
        if (-condensateDelta > 1) {
            emitEvent(simulation, "evaporation", [owner.id], [], {
                kilograms: -condensateDelta,
            });
        }
    }

    if ((owner.family === "high-ice" ||
        owner.family === "upper-atmospheric") && owner.relativeHumidity01 < 0.68) {
        const sublimated = Math.min(
            owner.iceWaterMassKg,
            owner.iceWaterMassKg * (0.68 - owner.relativeHumidity01) *
                0.00005 * dt,
        );
        owner.iceWaterMassKg -= sublimated;
        if (sublimated > 1) {
            emitEvent(simulation, "evaporation", [owner.id], [], {
                kilograms: sublimated,
                phase: "ice",
            });
        }
    }

    const growthMetresPerSecond = Math.max(
        -2,
        owner.verticalVelocityMetresPerSecond *
            (owner.family === "convective" ? 0.22 : 0.035),
    );
    const oldDepth = owner.geometricDepthKm;
    owner.geometricDepthKm = Math.max(
        0.05,
        owner.geometricDepthKm + growthMetresPerSecond * dt / 1_000,
    );
    const maximumTopKm = owner.family === "convective"
        ? Math.max(
            simulation.domain.equilibriumLevelKm,
            simulation.domain.tropopauseKm,
        ) + 1.5
        : owner.family === "upper-atmospheric"
            ? owner.baseAltitudeKm + 4
            : simulation.domain.tropopauseKm;
    owner.geometricDepthKm = Math.min(
        owner.geometricDepthKm,
        Math.max(0.05, maximumTopKm - owner.baseAltitudeKm),
    );
    if (owner.geometricDepthKm - oldDepth > 0.01) {
        emitEvent(simulation, "growth", [owner.id], [], {
            depthKm: owner.geometricDepthKm,
        });
    }

    const freezingPenetration = clamp(
        (cloudTopKm(owner) - simulation.domain.freezingLevelKm) /
            Math.max(0.5, owner.geometricDepthKm),
    );
    const glaciationRate = freezingPenetration *
        Math.max(0, 258 - topAtmosphere.temperatureKelvin) / 45 *
        (0.00008 + owner.turbulence01 * 0.00007);
    const glaciated = Math.min(
        owner.liquidWaterMassKg,
        owner.liquidWaterMassKg * glaciationRate * dt,
    );
    if (glaciated > 0.5) {
        const before = iceFraction(owner);
        owner.liquidWaterMassKg -= glaciated;
        owner.iceWaterMassKg += glaciated;
        if (before < 0.18 && iceFraction(owner) >= 0.18) {
            emitEvent(simulation, "glaciation", [owner.id], [], {
                iceFraction: iceFraction(owner),
            });
        }
    }

    const condensate = totalCondensate(owner);
    const precipitationEfficiency = clamp(
        condensate / 1.5e8 + owner.geometricDepthKm / 10 +
            owner.turbulence01 * 0.18,
    );
    const precipitationRate = Math.max(
        0,
        (precipitationEfficiency - 0.42) * 22 *
            (0.65 + owner.relativeHumidity01 * 0.35),
    );
    const previousPrecipitation = owner.precipitationRateMillimetresPerHour;
    owner.precipitationRateMillimetresPerHour = mix(
        previousPrecipitation,
        precipitationRate,
        0.12,
    );
    if (previousPrecipitation <= 0.2 &&
        owner.precipitationRateMillimetresPerHour > 0.2) {
        emitEvent(simulation, "precipitation-onset", [owner.id], [], {
            millimetresPerHour: owner.precipitationRateMillimetresPerHour,
        });
    }
    const subcloudHumidity = simulation.domain.surfaceRelativeHumidity01;
    const frozenFraction = iceFraction(owner);
    owner.precipitationKind = owner.precipitationRateMillimetresPerHour <= 0.1
        ? "none"
        : subcloudHumidity < 0.58 ? "virga"
            : frozenFraction > 0.72 && owner.temperatureKelvin < 268 ? "snow"
                : frozenFraction > 0.38 &&
                    owner.verticalVelocityMetresPerSecond > 8 ? "hail"
                    : owner.family === "convective" ? "shower"
                        : owner.precipitationRateMillimetresPerHour < 0.6
                            ? "drizzle" : "rain";
    const falloutKg = Math.min(
        condensate * 0.08,
        owner.precipitationRateMillimetresPerHour *
            owner.radiusEastKm * owner.radiusNorthKm * dt * 240,
    );
    const liquidFallout = Math.min(
        owner.liquidWaterMassKg,
        falloutKg * (1 - frozenFraction),
    );
    owner.liquidWaterMassKg -= liquidFallout;
    owner.iceWaterMassKg = Math.max(
        0,
        owner.iceWaterMassKg - (falloutKg - liquidFallout),
    );
    owner.downdraftMetresPerSecond = mix(
        owner.downdraftMetresPerSecond,
        -owner.precipitationRateMillimetresPerHour * 0.22,
        0.08,
    );
    owner.coldPoolStrength01 = clamp(
        owner.coldPoolStrength01 +
        Math.max(0, -owner.downdraftMetresPerSecond) * dt / 1_200 - dt / 18_000,
    );

    const erosion = Math.max(0, 0.58 - owner.relativeHumidity01) *
        (0.00008 + owner.turbulence01 * 0.00005) * dt;
    owner.radiusEastKm = Math.max(0.03, owner.radiusEastKm * (1 - erosion));
    owner.radiusNorthKm = Math.max(0.03, owner.radiusNorthKm * (1 - erosion));
    const naturalLifetimeSeconds = owner.family === "convective" ? 5_400 :
        owner.family === "low-layered" ? 28_800 : 18_000;
    owner.lifecycleProgress01 = clamp(
        owner.lifecycleProgress01 + dt / naturalLifetimeSeconds +
        Math.max(0, 0.5 - owner.relativeHumidity01) * dt / 7_200,
    );
    const previousStage = owner.lifecycleStage;
    owner.lifecycleStage = lifecycleFor(owner);
    if (owner.lifecycleStage === "decaying" && previousStage !== "decaying") {
        emitEvent(simulation, "decay", [owner.id]);
    }
    if (owner.lifecycleStage === "dead") {
        owner.active = false;
        emitEvent(simulation, "death", [owner.id]);
    }
    owner.classification = classifyCloudOwner(owner, simulation.domain);
};

const spawnOwner = (
    simulation: CloudWeatherSimulation,
    seed: CloudOwnerSeed,
    parents: readonly string[] = [],
): CloudWeatherOwner | null => {
    if (simulation.owners.filter(({ active }) => active).length >=
        simulation.maxOwners) return null;
    const owner = ownerFromSeed(
        {
            ...seed,
            id: seed.id ?? `cloud-owner-${simulation.nextOwnerSequence}`,
        },
        simulation.seed,
        simulation.nextOwnerSequence,
        simulation.domain,
    );
    simulation.nextOwnerSequence += 1;
    owner.parentOwnerIds = [...parents];
    simulation.owners.push(owner);
    for (const parentId of parents) {
        const parent = simulation.owners.find(({ id }) => id === parentId);
        if (parent && !parent.childOwnerIds.includes(owner.id)) {
            parent.childOwnerIds.push(owner.id);
        }
        simulation.edges.push({
            id: `edge-lineage-${parentId}-${owner.id}`,
            kind: "lineage",
            fromId: parentId,
            toId: owner.id,
            createdStep: simulation.step,
            strength01: 1,
        });
    }
    emitEvent(simulation, "birth", [owner.id, ...parents], [], {
        initial: false,
    });
    return owner;
};

const spawnFreeRunningOwners = (simulation: CloudWeatherSimulation) => {
    if (simulation.mode !== "free-running") return;
    const activeCount = simulation.owners.filter(({ active }) => active).length;
    const domain = simulation.domain;
    const forcing = simulation.forcing;
    const convectivePotential = clamp(
        domain.capeJoulesPerKilogram / 3_000 -
        domain.cinJoulesPerKilogram / 500 +
        forcing.convergence01 * 0.45 +
        domain.surfaceRelativeHumidity01 * 0.35,
    );
    const layeredPotential = clamp(
        domain.surfaceRelativeHumidity01 * 0.65 +
        forcing.frontogenesis01 * 0.55 +
        forcing.cloudTopRadiativeCoolingKelvinPerHour * 0.08,
    );
    const birthInterval = 4;
    if (simulation.step % birthInterval !== 0 || activeCount >= simulation.maxOwners) {
        return;
    }
    const random = cloudWeatherRandom01(
        simulation.seed,
        "weather-domain",
        "owner-birth",
        simulation.step,
    );
    const potential = Math.max(convectivePotential, layeredPotential);
    if (random > potential && activeCount > 0) return;
    const convective = convectivePotential >= layeredPotential;
    const sequence = simulation.nextOwnerSequence;
    const bearing = cloudWeatherRandom01(
        simulation.seed,
        `birth-${sequence}`,
        "bearing",
        simulation.step,
    ) * Math.PI * 2;
    const range = 8 + cloudWeatherRandom01(
        simulation.seed,
        `birth-${sequence}`,
        "range",
        simulation.step,
    ) * 28;
    spawnOwner(simulation, convective ? {
        family: "convective",
        centerEastKm: Math.sin(bearing) * range,
        centerNorthKm: Math.cos(bearing) * range,
        baseAltitudeKm: Math.max(domain.terrainElevationKm + 0.35, 0.6),
        geometricDepthKm: 0.35 + convectivePotential * 0.8,
        radiusEastKm: 0.6 + convectivePotential * 0.9,
        radiusNorthKm: 0.5 + convectivePotential * 0.8,
        liquidWaterMassKg: 4e6 + convectivePotential * 2.5e7,
        verticalVelocityMetresPerSecond: 1.2 + convectivePotential * 5.5,
        stratusFraction01: 0.08,
        organization: forcing.convergence01 > 0.65 ? "clustered" : "isolated",
        classification: defaultClassification("cumulus", "humilis"),
    } : {
        family: "low-layered",
        centerEastKm: Math.sin(bearing) * range * 0.5,
        centerNorthKm: Math.cos(bearing) * range * 0.5,
        baseAltitudeKm: domain.surfaceRelativeHumidity01 > 0.94 ? 0.04 : 0.45,
        geometricDepthKm: 0.18 + layeredPotential * 0.65,
        radiusEastKm: 5 + layeredPotential * 14,
        radiusNorthKm: 4 + layeredPotential * 12,
        liquidWaterMassKg: 1.8e7 + layeredPotential * 6e7,
        verticalVelocityMetresPerSecond: 0.05 + layeredPotential * 0.45,
        stratusFraction01: 0.82 + layeredPotential * 0.16,
        organization: forcing.frontogenesis01 > 0.55 ? "frontal" : "closed-cell",
        classification: defaultClassification(
            domain.surfaceRelativeHumidity01 > 0.94 ? "stratus" :
                "stratocumulus",
            domain.surfaceRelativeHumidity01 > 0.94 ? "nebulosus" :
                "stratiformis",
        ),
    });
};

const mergeOwners = (simulation: CloudWeatherSimulation) => {
    const active = simulation.owners.filter(({ active }) => active);
    for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
        const left = active[leftIndex];
        if (!left.active) continue;
        for (let rightIndex = leftIndex + 1; rightIndex < active.length;
            rightIndex += 1) {
            const right = active[rightIndex];
            if (!right.active || left.family !== right.family) continue;
            if (left.lastMergeStep === simulation.step ||
                right.lastMergeStep === simulation.step) continue;
            const overlapDistance = Math.min(
                left.radiusEastKm + right.radiusEastKm,
                left.radiusNorthKm + right.radiusNorthKm,
            ) * 0.58;
            if (distance(left, right) > overlapDistance) continue;
            const leftMass = Math.max(1, totalCondensate(left));
            const rightMass = Math.max(1, totalCondensate(right));
            const totalMass = leftMass + rightMass;
            const merged = spawnOwner(simulation, {
                family: left.family,
                generation: Math.max(left.generation, right.generation) + 1,
                centerEastKm: (left.centerEastKm * leftMass +
                    right.centerEastKm * rightMass) / totalMass,
                centerNorthKm: (left.centerNorthKm * leftMass +
                    right.centerNorthKm * rightMass) / totalMass,
                baseAltitudeKm: Math.min(
                    left.baseAltitudeKm,
                    right.baseAltitudeKm,
                ),
                geometricDepthKm: Math.max(
                    cloudTopKm(left),
                    cloudTopKm(right),
                ) - Math.min(left.baseAltitudeKm, right.baseAltitudeKm),
                radiusEastKm: Math.sqrt(
                    left.radiusEastKm ** 2 + right.radiusEastKm ** 2,
                ) * 0.86,
                radiusNorthKm: Math.sqrt(
                    left.radiusNorthKm ** 2 + right.radiusNorthKm ** 2,
                ) * 0.86,
                liquidWaterMassKg: left.liquidWaterMassKg +
                    right.liquidWaterMassKg,
                iceWaterMassKg: left.iceWaterMassKg + right.iceWaterMassKg,
                verticalVelocityMetresPerSecond: Math.max(
                    left.verticalVelocityMetresPerSecond,
                    right.verticalVelocityMetresPerSecond,
                ) * 1.08,
                stratusFraction01: (left.stratusFraction01 * leftMass +
                    right.stratusFraction01 * rightMass) / totalMass,
                organization: left.organization,
                classification: leftMass >= rightMass
                    ? left.classification : right.classification,
            }, [left.id, right.id]);
            if (!merged) return;
            left.active = false;
            right.active = false;
            left.lastMergeStep = simulation.step;
            right.lastMergeStep = simulation.step;
            merged.lastMergeStep = simulation.step;
            simulation.edges.push({
                id: `edge-merge-${left.id}-${merged.id}`,
                kind: "merge",
                fromId: left.id,
                toId: merged.id,
                createdStep: simulation.step,
                strength01: 1,
            }, {
                id: `edge-merge-${right.id}-${merged.id}`,
                kind: "merge",
                fromId: right.id,
                toId: merged.id,
                createdStep: simulation.step,
                strength01: 1,
            });
            emitEvent(simulation, "merge", [left.id, right.id, merged.id], [], {
                combinedMassKg: totalMass,
            });
            break;
        }
    }
};

const splitOwners = (simulation: CloudWeatherSimulation) => {
    const candidates = simulation.owners.filter((owner) =>
        owner.active && owner.generation < 3 &&
        owner.lastMergeStep !== simulation.step &&
        owner.lastSplitStep === null &&
        ((owner.family === "convective" &&
            owner.radiusEastKm >= 3.2 && owner.geometricDepthKm >= 2.4) ||
        (owner.family === "low-layered" &&
            owner.radiusEastKm >= 18 && owner.turbulence01 >= 0.32)));
    for (const owner of candidates) {
        const chance = cloudWeatherRandom01(
            simulation.seed,
            owner.id,
            "owner-split",
            simulation.step,
        );
        if (chance < 0.35 && simulation.step < 6) continue;
        const totalMass = totalCondensate(owner);
        const axisEast = Math.cos(owner.orientationRadians);
        const axisNorth = Math.sin(owner.orientationRadians);
        const offset = Math.max(0.4, owner.radiusEastKm * 0.32);
        const children: CloudWeatherOwner[] = [];
        for (const sign of [-1, 1] as const) {
            const child = spawnOwner(simulation, {
                family: owner.family,
                generation: owner.generation + 1,
                centerEastKm: owner.centerEastKm + axisEast * offset * sign,
                centerNorthKm: owner.centerNorthKm + axisNorth * offset * sign,
                baseAltitudeKm: owner.baseAltitudeKm,
                geometricDepthKm: owner.geometricDepthKm *
                    (0.84 + 0.04 * sign),
                radiusEastKm: owner.radiusEastKm * 0.62,
                radiusNorthKm: owner.radiusNorthKm * 0.72,
                liquidWaterMassKg: owner.liquidWaterMassKg * 0.48,
                iceWaterMassKg: owner.iceWaterMassKg * 0.48,
                verticalVelocityMetresPerSecond:
                    owner.verticalVelocityMetresPerSecond *
                    (sign > 0 ? 1.08 : 0.92),
                stratusFraction01: owner.stratusFraction01,
                organization: owner.organization,
                classification: owner.classification,
            }, [owner.id]);
            if (child) children.push(child);
        }
        if (children.length !== 2) continue;
        owner.active = false;
        owner.lastSplitStep = simulation.step;
        for (const child of children) {
            child.lastSplitStep = simulation.step;
            simulation.edges.push({
                id: `edge-split-${owner.id}-${child.id}`,
                kind: "split",
                fromId: owner.id,
                toId: child.id,
                createdStep: simulation.step,
                strength01: 1,
            });
        }
        emitEvent(
            simulation,
            "split",
            [owner.id, ...children.map(({ id }) => id)],
            [],
            { sourceMassKg: totalMass },
        );
    }
};

const desiredFeatureKinds = (
    owner: CloudWeatherOwner,
    domain: CloudWeatherDomain,
): GeneratedCloudFeatureKind[] => {
    const desired: GeneratedCloudFeatureKind[] = [];
    const ice = iceFraction(owner);
    if (owner.family === "convective" &&
        owner.lifecycleStage === "growing" &&
        owner.verticalVelocityMetresPerSecond >= 5) desired.push("pileus");
    if (owner.family === "convective" &&
        owner.verticalVelocityMetresPerSecond >= 3 &&
        owner.geometricDepthKm >= 2) desired.push("velum");
    if (owner.classification.genus === "cumulonimbus" && ice >= 0.42) {
        desired.push("incus");
    }
    if (owner.classification.genus === "cumulonimbus" &&
        owner.lifecycleStage === "decaying" && ice >= 0.35) desired.push("mamma");
    if (owner.precipitationRateMillimetresPerHour > 0.2 &&
        domain.surfaceRelativeHumidity01 < 0.68) desired.push("virga");
    if (owner.precipitationRateMillimetresPerHour > 0.7 &&
        owner.baseAltitudeKm < 2.5) desired.push("pannus");
    if (owner.coldPoolStrength01 > 0.18) desired.push("arcus");
    if (owner.classification.genus === "cumulonimbus" &&
        owner.coldPoolStrength01 > 0.35 &&
        owner.verticalVelocityMetresPerSecond > 4) desired.push("murus");
    if (desired.includes("murus") && owner.downdraftMetresPerSecond < -1) {
        desired.push("cauda");
    }
    return desired;
};

const attachFeature = (
    simulation: CloudWeatherSimulation,
    owner: CloudWeatherOwner,
    kind: GeneratedCloudFeatureKind,
) => {
    if (simulation.features.filter(({ active }) => active).length >=
        simulation.maxFeatures) return;
    const id = `${owner.id}:feature:${kind}:${simulation.nextFeatureSequence}`;
    simulation.nextFeatureSequence += 1;
    const upper = ["pileus", "velum", "incus", "mamma"].includes(kind);
    const lower = ["pannus", "arcus", "murus", "cauda", "virga"].includes(kind);
    const feature: CloudWeatherFeature = {
        id,
        numericId: cloudStableNumericId(id),
        kind,
        parentOwnerId: owner.id,
        parentOwnerNumericId: owner.numericId,
        active: true,
        attachmentFraction: [0, upper ? 0.9 : lower ? -0.65 : 0, 0],
        scaleKm: [
            owner.radiusEastKm * (kind === "incus" ? 1.8 : 0.75),
            owner.geometricDepthKm * (upper ? 0.16 : 0.22),
            owner.radiusNorthKm * (kind === "incus" ? 1.35 : 0.7),
        ],
        velocityKmPerSecond: [...owner.velocityKmPerSecond] as CloudVec3,
        materialPhase: ["incus", "mamma"].includes(kind) ? "ice" :
            ["virga", "pannus", "arcus"].includes(kind)
                ? "precipitation" : "liquid",
        precipitationSourceKgPerSecond: ["virga", "pannus", "arcus"].includes(kind)
            ? owner.precipitationRateMillimetresPerHour *
                owner.radiusEastKm * owner.radiusNorthKm * 220
            : 0,
        lifecycleProgress01: 0,
        ageSeconds: 0,
        generation: owner.generation,
    };
    simulation.features.push(feature);
    owner.featureIds.push(id);
    simulation.edges.push({
        id: `edge-attachment-${owner.id}-${id}`,
        kind: "attachment",
        fromId: owner.id,
        toId: id,
        createdStep: simulation.step,
        strength01: 1,
    });
    emitEvent(simulation, "feature-attach", [owner.id], [id], { kind });
};

const updateFeatures = (simulation: CloudWeatherSimulation) => {
    const dt = simulation.fixedStepSeconds;
    for (const feature of simulation.features) {
        if (!feature.active) continue;
        const owner = simulation.owners.find(({ id }) =>
            id === feature.parentOwnerId);
        if (!owner || !owner.active) {
            feature.active = false;
            emitEvent(simulation, "feature-detach", owner ? [owner.id] : [],
                [feature.id], { reason: "parent-inactive" });
            continue;
        }
        feature.ageSeconds += dt;
        feature.lifecycleProgress01 = clamp(
            feature.lifecycleProgress01 + dt /
                (["pileus", "velum"].includes(feature.kind) ? 900 : 3_600),
        );
        feature.velocityKmPerSecond = [
            ...owner.velocityKmPerSecond,
        ] as CloudVec3;
        if (feature.lifecycleProgress01 >= 1) {
            feature.active = false;
            emitEvent(simulation, "feature-detach", [owner.id], [feature.id], {
                reason: "lifecycle-complete",
            });
        }
    }
    for (const owner of simulation.owners.filter(({ active }) => active)) {
        const desired = desiredFeatureKinds(owner, simulation.domain);
        const activeKinds = new Set(simulation.features.filter((feature) =>
            feature.active && feature.parentOwnerId === owner.id)
            .map(({ kind }) => kind));
        for (const kind of desired) {
            if (!activeKinds.has(kind)) attachFeature(simulation, owner, kind);
        }
        const activeFeatures = simulation.features.filter((feature) =>
            feature.active && feature.parentOwnerId === owner.id);
        owner.classification.supplementaryFeatures = activeFeatures
            .filter(({ kind }) => [
                "arcus", "mamma", "virga", "incus", "murus", "cauda",
                "tuba", "cavum",
            ].includes(kind))
            .map(({ kind }) => kind);
        owner.classification.accessoryClouds = activeFeatures
            .filter(({ kind }) => [
                "pileus", "velum", "pannus", "flumen",
            ].includes(kind))
            .map(({ kind }) => kind);
    }
};

const applyColdPoolInteractions = (simulation: CloudWeatherSimulation) => {
    const active = simulation.owners.filter(({ active }) => active);
    for (const source of active) {
        if (source.coldPoolStrength01 <= 0.08) continue;
        for (const target of active) {
            if (target.id === source.id) continue;
            const separation = distance(source, target);
            const influenceRadius = source.radiusEastKm *
                (1.4 + source.coldPoolStrength01 * 2.8);
            if (separation > influenceRadius) continue;
            const strength = clamp(
                (1 - separation / Math.max(0.1, influenceRadius)) *
                source.coldPoolStrength01,
            );
            target.verticalVelocityMetresPerSecond += strength *
                (target.family === "convective" ? 0.35 : -0.08);
            const edgeId = `edge-cold-pool-${source.id}-${target.id}`;
            if (!simulation.edges.some(({ id }) => id === edgeId)) {
                simulation.edges.push({
                    id: edgeId,
                    kind: "cold-pool-influence",
                    fromId: source.id,
                    toId: target.id,
                    createdStep: simulation.step,
                    strength01: strength,
                });
            }
        }
    }
};

export const stepCloudWeatherSimulation = (
    current: CloudWeatherSimulation,
    update?: CloudWeatherStepInput,
): CloudWeatherSimulation => {
    const simulation = cloneSimulation(current);
    simulation.step += 1;
    simulation.timeSeconds += simulation.fixedStepSeconds;
    const wrapped = update && (
        Object.hasOwn(update, "forcing") || Object.hasOwn(update, "domain")
    ) ? update as CloudWeatherStepUpdate : undefined;
    const forcingOverride = wrapped?.forcing ??
        (update as Partial<CloudWeatherForcing> | undefined);
    simulation.forcing = {
        ...simulation.forcing,
        ...forcingOverride,
    };
    if (wrapped?.domain) {
        simulation.domain = {
            ...simulation.domain,
            ...wrapped.domain,
            sounding: wrapped.domain.sounding
                ? wrapped.domain.sounding.map((level) => ({ ...level }))
                : simulation.domain.sounding,
        };
    }
    for (const owner of simulation.owners) processOwner(owner, simulation);
    spawnFreeRunningOwners(simulation);
    mergeOwners(simulation);
    splitOwners(simulation);
    applyColdPoolInteractions(simulation);
    updateFeatures(simulation);
    return simulation;
};

export const runCloudWeatherSimulation = (
    initial: CloudWeatherSimulation,
    steps: number,
    forcingSchedule?: (
        step: number,
        simulation: CloudWeatherSimulation,
    ) => CloudWeatherStepInput | undefined,
) => {
    let simulation = initial;
    for (let index = 0; index < Math.max(0, Math.trunc(steps)); index += 1) {
        simulation = stepCloudWeatherSimulation(
            simulation,
            forcingSchedule?.(index, simulation),
        );
    }
    return simulation;
};

export const cloudWeatherSimulationFingerprint = (
    simulation: CloudWeatherSimulation,
) => JSON.stringify({
    schemaVersion: simulation.schemaVersion,
    mode: simulation.mode,
    seed: simulation.seed,
    step: simulation.step,
    timeSeconds: simulation.timeSeconds,
    owners: simulation.owners.map((owner) => ({
        id: owner.id,
        generation: owner.generation,
        family: owner.family,
        active: owner.active,
        classification: owner.classification,
        centerEastKm: owner.centerEastKm,
        centerNorthKm: owner.centerNorthKm,
        baseAltitudeKm: owner.baseAltitudeKm,
        geometricDepthKm: owner.geometricDepthKm,
        radiusEastKm: owner.radiusEastKm,
        radiusNorthKm: owner.radiusNorthKm,
        liquidWaterMassKg: owner.liquidWaterMassKg,
        iceWaterMassKg: owner.iceWaterMassKg,
        precipitationKind: owner.precipitationKind,
        precipitationRateMillimetresPerHour:
            owner.precipitationRateMillimetresPerHour,
        lifecycleStage: owner.lifecycleStage,
        lifecycleProgress01: owner.lifecycleProgress01,
        parentOwnerIds: owner.parentOwnerIds,
        childOwnerIds: owner.childOwnerIds,
        featureIds: owner.featureIds,
    })),
    features: simulation.features.map((feature) => ({
        id: feature.id,
        kind: feature.kind,
        parentOwnerId: feature.parentOwnerId,
        active: feature.active,
        lifecycleProgress01: feature.lifecycleProgress01,
    })),
    edges: simulation.edges,
    events: simulation.events,
});

export const validateCloudWeatherSimulation = (
    simulation: CloudWeatherSimulation,
): readonly CloudWeatherEngineIssue[] => {
    const issues: CloudWeatherEngineIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });
    if (simulation.schemaVersion !== CLOUD_WEATHER_ENGINE_SCHEMA_VERSION) {
        issue("unsupported-schema", "simulation",
            `Expected schema ${CLOUD_WEATHER_ENGINE_SCHEMA_VERSION}.`);
    }
    const ownerIds = new Set<string>();
    const numericOwnerIds = new Set<number>();
    for (const owner of simulation.owners) {
        if (ownerIds.has(owner.id) || numericOwnerIds.has(owner.numericId)) {
            issue("duplicate-owner", owner.id,
                "Owner string and numeric identities must be unique.");
        }
        ownerIds.add(owner.id);
        numericOwnerIds.add(owner.numericId);
        for (const field of [
            owner.centerEastKm, owner.centerNorthKm, owner.baseAltitudeKm,
            owner.geometricDepthKm, owner.radiusEastKm, owner.radiusNorthKm,
            owner.liquidWaterMassKg, owner.iceWaterMassKg,
            owner.lifecycleProgress01,
        ]) {
            if (!Number.isFinite(field)) {
                issue("non-finite-owner", owner.id,
                    "All owner geometry, condensate, and lifecycle fields must be finite.");
                break;
            }
        }
        if (owner.liquidWaterMassKg < 0 || owner.iceWaterMassKg < 0) {
            issue("negative-condensate", owner.id,
                "Condensate inventories must remain non-negative.");
        }
        if (owner.precipitationRateMillimetresPerHour > 0 &&
            totalCondensate(owner) <= 0) {
            issue("ownerless-precipitation", owner.id,
                "Precipitation requires an upstream owner condensate inventory.");
        }
    }
    const featureIds = new Set<string>();
    for (const feature of simulation.features) {
        if (featureIds.has(feature.id)) {
            issue("duplicate-feature", feature.id,
                "Feature identities must be unique.");
        }
        featureIds.add(feature.id);
        const parent = simulation.owners.find(({ id }) =>
            id === feature.parentOwnerId);
        if (!parent || parent.numericId !== feature.parentOwnerNumericId) {
            issue("detached-feature", feature.id,
                "Features must reference an existing stable parent owner.");
        }
        if (feature.precipitationSourceKgPerSecond > 0 &&
            (!parent || parent.precipitationRateMillimetresPerHour <= 0)) {
            issue("ownerless-feature-precipitation", feature.id,
                "Precipitating features require a precipitating parent owner.");
        }
    }
    for (const edge of simulation.edges) {
        const fromExists = ownerIds.has(edge.fromId) || featureIds.has(edge.fromId);
        const toExists = ownerIds.has(edge.toId) || featureIds.has(edge.toId);
        if (!fromExists || !toExists) {
            issue("dangling-edge", edge.id,
                "Graph edges must reference existing owners or features.");
        }
    }
    if (simulation.owners.filter(({ active }) => active).length >
        simulation.maxOwners) {
        issue("owner-budget-exceeded", "simulation",
            "Active owner count exceeds the configured budget.");
    }
    if (simulation.features.filter(({ active }) => active).length >
        simulation.maxFeatures) {
        issue("feature-budget-exceeded", "simulation",
            "Active feature count exceeds the configured budget.");
    }
    return issues;
};

export const DEFAULT_CLOUD_WEATHER_DOMAIN: CloudWeatherDomain = {
    id: "temperate-summer-convective",
    latitudeDegrees: 40,
    longitudeDegrees: -105,
    season01: 0.82,
    terrainElevationKm: 0.4,
    terrainRoughness01: 0.35,
    surfaceTemperatureKelvin: 299,
    surfaceRelativeHumidity01: 0.76,
    surfaceHeatFluxWattsPerSquareMetre: 260,
    surfaceMoistureFluxGramsPerSquareMetrePerSecond: 0.08,
    aerosolNumberConcentrationCm3: 450,
    freezingLevelKm: 4.2,
    equilibriumLevelKm: 12.8,
    tropopauseKm: 13.4,
    inversionBaseKm: 1.8,
    inversionStrengthKelvin: 1.4,
    capeJoulesPerKilogram: 2_400,
    cinJoulesPerKilogram: 35,
    sounding: [
        { altitudeKm: 0, temperatureKelvin: 299, relativeHumidity01: 0.76,
            windEastMetresPerSecond: 3, windNorthMetresPerSecond: 2,
            verticalVelocityMetresPerSecond: 0.25 },
        { altitudeKm: 1, temperatureKelvin: 292.5, relativeHumidity01: 0.88,
            windEastMetresPerSecond: 5, windNorthMetresPerSecond: 3,
            verticalVelocityMetresPerSecond: 0.5 },
        { altitudeKm: 4, temperatureKelvin: 272, relativeHumidity01: 0.78,
            windEastMetresPerSecond: 11, windNorthMetresPerSecond: 7,
            verticalVelocityMetresPerSecond: 0.35 },
        { altitudeKm: 8, temperatureKelvin: 246, relativeHumidity01: 0.64,
            windEastMetresPerSecond: 21, windNorthMetresPerSecond: 12,
            verticalVelocityMetresPerSecond: 0.12 },
        { altitudeKm: 13, temperatureKelvin: 217, relativeHumidity01: 0.38,
            windEastMetresPerSecond: 34, windNorthMetresPerSecond: 16,
            verticalVelocityMetresPerSecond: 0 },
    ],
};

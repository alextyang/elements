import {
    resolveDeepConvectionSourceContracts,
    resolveDeepConvectionTopology,
    type DeepConvectionChargeRegion,
    type DeepConvectionDescriptor,
    type DeepConvectionTopologyRegionId,
} from "./deep-convection-physical-foundation";

/** World transform for one finite storm owner. Angles are radians. */
export interface DeepConvectionElectricalWorldFrame {
    centerEastKm: number;
    centerNorthKm: number;
    majorRadiusKm: number;
    minorRadiusKm: number;
    orientation: number;
    surfaceAltitudeKm: number;
}

export interface DeepConvectionWorldChargeReservoir {
    polarity: DeepConvectionChargeRegion["polarity"];
    carrier: DeepConvectionChargeRegion["carrier"];
    ownerRegion: DeepConvectionTopologyRegionId;
    centerEastKm: number;
    centerNorthKm: number;
    altitudeRangeKm: readonly [number, number];
    majorRadiusKm: number;
    minorRadiusKm: number;
    relativeCharge01: number;
}

export interface DeepConvectionDischargePathCandidate {
    id: string;
    kind: "intra-cloud" | "cloud-to-ground";
    fromReservoirIndex: number;
    toReservoirIndex: number | null;
    controlPointsEastAltitudeNorthKm: readonly (readonly [number, number, number])[];
    relativeProbability01: number;
    maximumChannelRadiusMetres: number;
}

export interface DeepConvectionElectricalSource {
    parentSystemId: string;
    active: boolean;
    intensity01: number;
    lifecycleStage: DeepConvectionDescriptor["lifecycleStage"];
    organization: DeepConvectionDescriptor["organization"];
    sourceRegion: "mixed-phase-core";
    reservoirs: readonly DeepConvectionWorldChargeReservoir[];
    dischargeCandidates: readonly DeepConvectionDischargePathCandidate[];
    stormOwnerBounds: {
        centerEastKm: number;
        centerNorthKm: number;
        bottomAltitudeKm: number;
        topAltitudeKm: number;
        majorRadiusKm: number;
        minorRadiusKm: number;
        orientationRadians: number;
    };
    illuminationEnvelope: {
        ownerId: string;
        centerEastKm: number;
        centerNorthKm: number;
        bottomAltitudeKm: number;
        topAltitudeKm: number;
        majorRadiusKm: number;
        minorRadiusKm: number;
        orientationRadians: number;
        /** Relative activity only; physical radiant joules live on each event. */
        eventIntensity01: number;
        /** The channel is the only primary emitter; this volume scatters it. */
        emissionSource: "channel-only";
        mode: "finite-storm-light-transport-volume";
    } | null;
}

export interface DeepConvectionElectricalIlluminationSample {
    ownerId: string;
    finiteEnvelopeWeight: number;
    primaryEmitter: false;
}

export interface DeepConvectionLightningEventContractInput {
    eventId: string;
    candidateId: string;
    peakCurrentKiloamps: number;
    radiantEnergyJoules: number;
    ownerOpticalDepth: number;
    ownerTemperatureKelvin: number;
    seed: number;
}

/** Structurally compatible with weather-optical-phenomena LightningEventInput. */
export interface DeepConvectionLightningEventContract {
    id: string;
    owner: {
        id: string;
        kind: "convective-cloud";
        finite: true;
        bottomAltitudeKm: number;
        topAltitudeKm: number;
        opticalDepth: number;
        temperatureKelvin: number;
    };
    topology: "intra-cloud" | "cloud-to-ground";
    negativeCharge: {
        centerEastAltitudeNorthKm: readonly [number, number, number];
        radiusKm: number;
        polarity: -1;
    };
    positiveCharge: {
        centerEastAltitudeNorthKm: readonly [number, number, number];
        radiusKm: number;
        polarity: 1;
    };
    groundAltitudeKm: number;
    peakCurrentKiloamps: number;
    radiantEnergyJoules: number;
    guideControlPointsEastAltitudeNorthKm:
        readonly (readonly [number, number, number])[];
    maximumChannelRadiusMetres: number;
    seed: number;
}

export interface DeepConvectionLightningEventContractResult {
    eventInput: DeepConvectionLightningEventContract | null;
    reasons: readonly string[];
}

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mix = (a: number, b: number, amount: number) => a + (b - a) * amount;

const worldHorizontal = (
    downwindKm: number,
    crosswindKm: number,
    descriptor: DeepConvectionDescriptor,
    frame: DeepConvectionElectricalWorldFrame,
) => {
    const bounds = descriptor.systemBoundary.horizontalBoundsKm;
    const downwindScale = Math.max(0.1, Math.abs(bounds[0]), Math.abs(bounds[1]));
    const crosswindScale = Math.max(0.1, Math.abs(bounds[2]), Math.abs(bounds[3]));
    const localAlongKm = clamp(downwindKm / downwindScale, -0.82, 0.82) *
        frame.majorRadiusKm;
    const localCrossKm = clamp(crosswindKm / crosswindScale, -0.82, 0.82) *
        frame.minorRadiusKm;
    const sine = Math.sin(frame.orientation);
    const cosine = Math.cos(frame.orientation);
    return {
        east: frame.centerEastKm + sine * localAlongKm + cosine * localCrossKm,
        north: frame.centerNorthKm + cosine * localAlongKm - sine * localCrossKm,
    };
};

/**
 * Resolves finite charge reservoirs and candidate connections only. It emits no
 * color, screen flash, hydrometeor density, or camera-wide exposure change.
 */
export function resolveDeepConvectionElectricalSource(
    descriptor: DeepConvectionDescriptor,
    parentSystemId: string,
    frame: DeepConvectionElectricalWorldFrame,
): DeepConvectionElectricalSource {
    const contract = resolveDeepConvectionSourceContracts(descriptor).lightning;
    const topology = resolveDeepConvectionTopology(descriptor);
    const reservoirs = contract.chargeRegions.map((charge) => {
        const owner = topology.regions.find((region) => region.id === charge.ownerRegion) ??
            topology.regions.find((region) => region.id === "mixed-phase-core") ??
            topology.regions[0];
        const center = worldHorizontal(
            owner.centreKm[0],
            owner.centreKm[2],
            descriptor,
            frame,
        );
        const bounds = descriptor.systemBoundary.horizontalBoundsKm;
        const downwindScale = Math.max(0.1, Math.abs(bounds[0]), Math.abs(bounds[1]));
        const crosswindScale = Math.max(0.1, Math.abs(bounds[2]), Math.abs(bounds[3]));
        const localAlong01 = clamp(owner.centreKm[0] / downwindScale, -0.82, 0.82);
        const localCross01 = clamp(owner.centreKm[2] / crosswindScale, -0.82, 0.82);
        return {
            polarity: charge.polarity,
            carrier: charge.carrier,
            ownerRegion: charge.ownerRegion,
            centerEastKm: center.east,
            centerNorthKm: center.north,
            altitudeRangeKm: charge.altitudeRangeKm,
            majorRadiusKm: Math.min(
                clamp(owner.halfExtentsKm[0] / downwindScale *
                    frame.majorRadiusKm, 0.08, frame.majorRadiusKm * 0.72),
                frame.majorRadiusKm * Math.max(0.04, 0.92 - Math.abs(localAlong01)),
            ),
            minorRadiusKm: Math.min(
                clamp(owner.halfExtentsKm[2] / crosswindScale *
                    frame.minorRadiusKm, 0.08, frame.minorRadiusKm * 0.72),
                frame.minorRadiusKm * Math.max(0.04, 0.92 - Math.abs(localCross01)),
            ),
            relativeCharge01: charge.relativeCharge01,
        } satisfies DeepConvectionWorldChargeReservoir;
    });

    const dischargeCandidates: DeepConvectionDischargePathCandidate[] = [];
    for (let from = 0; from < reservoirs.length; from += 1) {
        for (let to = from + 1; to < reservoirs.length; to += 1) {
            const a = reservoirs[from];
            const b = reservoirs[to];
            if (a.polarity === b.polarity) continue;
            const aAltitude = mix(a.altitudeRangeKm[0], a.altitudeRangeKm[1], 0.5);
            const bAltitude = mix(b.altitudeRangeKm[0], b.altitudeRangeKm[1], 0.5);
            dischargeCandidates.push({
                id: `${a.ownerRegion}->${b.ownerRegion}`,
                kind: "intra-cloud",
                fromReservoirIndex: from,
                toReservoirIndex: to,
                controlPointsEastAltitudeNorthKm: [[
                    a.centerEastKm, aAltitude, a.centerNorthKm,
                ], [
                    mix(a.centerEastKm, b.centerEastKm, 0.46),
                    mix(aAltitude, bAltitude, 0.53),
                    mix(a.centerNorthKm, b.centerNorthKm, 0.56),
                ], [
                    b.centerEastKm, bAltitude, b.centerNorthKm,
                ]],
                relativeProbability01: clamp(
                    Math.min(a.relativeCharge01, b.relativeCharge01) * 0.92,
                ),
                // Measured luminous/core radii are centimetric. Pixel width is
                // handled by analytic segment coverage and the camera PSF.
                maximumChannelRadiusMetres: mix(0.018, 0.075,
                    contract.intensity01),
            });
        }
    }
    const negativeIndex = reservoirs.findIndex((reservoir) =>
        reservoir.polarity === "negative");
    if (negativeIndex >= 0 && contract.reachesGroundFraction01 > 0.01) {
        const negative = reservoirs[negativeIndex];
        const sourceAltitude = negative.altitudeRangeKm[0];
        const ground = worldHorizontal(
            descriptor.coreRadiusKm * mix(0.65, 1.3,
                contract.reachesGroundFraction01),
            descriptor.coreRadiusKm * 0.12,
            descriptor,
            frame,
        );
        dischargeCandidates.push({
            id: `${negative.ownerRegion}->induced-ground-charge`,
            kind: "cloud-to-ground",
            fromReservoirIndex: negativeIndex,
            toReservoirIndex: null,
            controlPointsEastAltitudeNorthKm: [[
                negative.centerEastKm, sourceAltitude, negative.centerNorthKm,
            ], [
                mix(negative.centerEastKm, ground.east, 0.48),
                mix(sourceAltitude, frame.surfaceAltitudeKm, 0.56),
                mix(negative.centerNorthKm, ground.north, 0.52),
            ], [
                ground.east, frame.surfaceAltitudeKm, ground.north,
            ]],
            relativeProbability01: contract.reachesGroundFraction01,
            maximumChannelRadiusMetres: mix(0.025, 0.095,
                contract.intensity01),
        });
    }

    const active = contract.active && reservoirs.length >= 2;
    const illuminationEnvelope = active ? {
        ownerId: parentSystemId,
        centerEastKm: reservoirs.reduce((sum, value) =>
            sum + value.centerEastKm, 0) / reservoirs.length,
        centerNorthKm: reservoirs.reduce((sum, value) =>
            sum + value.centerNorthKm, 0) / reservoirs.length,
        bottomAltitudeKm: Math.min(...reservoirs.map((value) =>
            value.altitudeRangeKm[0])),
        topAltitudeKm: Math.max(...reservoirs.map((value) =>
            value.altitudeRangeKm[1])),
        majorRadiusKm: Math.min(
            frame.majorRadiusKm,
            Math.max(...reservoirs.map((value) => value.majorRadiusKm)) * 1.45,
        ),
        minorRadiusKm: Math.min(
            frame.minorRadiusKm,
            Math.max(...reservoirs.map((value) => value.minorRadiusKm)) * 1.45,
        ),
        orientationRadians: frame.orientation,
        eventIntensity01: contract.intensity01,
        emissionSource: "channel-only" as const,
        mode: "finite-storm-light-transport-volume" as const,
    } : null;

    return {
        parentSystemId,
        active,
        intensity01: contract.intensity01,
        lifecycleStage: descriptor.lifecycleStage,
        organization: descriptor.organization,
        sourceRegion: "mixed-phase-core",
        reservoirs,
        dischargeCandidates: active ? dischargeCandidates : [],
        stormOwnerBounds: {
            centerEastKm: frame.centerEastKm,
            centerNorthKm: frame.centerNorthKm,
            bottomAltitudeKm: frame.surfaceAltitudeKm,
            topAltitudeKm: descriptor.cloudTopKm,
            majorRadiusKm: frame.majorRadiusKm,
            minorRadiusKm: frame.minorRadiusKm,
            orientationRadians: frame.orientation,
        },
        illuminationEnvelope,
    };
}

const smoothstep = (minimum: number, maximum: number, value: number) => {
    const amount = clamp((value - minimum) / Math.max(1e-9, maximum - minimum));
    return amount * amount * (3 - 2 * amount);
};

/**
 * Finite membership for the volume in which channel light may illuminate the
 * owning storm. This is only a transport bound; the cloud-density field still
 * determines where scattering actually occurs.
 */
export function evaluateDeepConvectionElectricalIlluminationMembership(
    source: DeepConvectionElectricalSource,
    positionEastAltitudeNorthKm: readonly [number, number, number],
): DeepConvectionElectricalIlluminationSample {
    const envelope = source.illuminationEnvelope;
    if (!source.active || !envelope) {
        return { ownerId: source.parentSystemId, finiteEnvelopeWeight: 0,
            primaryEmitter: false };
    }
    const altitude = positionEastAltitudeNorthKm[1];
    if (altitude < envelope.bottomAltitudeKm || altitude > envelope.topAltitudeKm) {
        return { ownerId: source.parentSystemId, finiteEnvelopeWeight: 0,
            primaryEmitter: false };
    }
    const east = positionEastAltitudeNorthKm[0] - envelope.centerEastKm;
    const north = positionEastAltitudeNorthKm[2] - envelope.centerNorthKm;
    const sine = Math.sin(envelope.orientationRadians);
    const cosine = Math.cos(envelope.orientationRadians);
    const along = (east * sine + north * cosine) /
        Math.max(0.001, envelope.majorRadiusKm);
    const across = (east * cosine - north * sine) /
        Math.max(0.001, envelope.minorRadiusKm);
    const radial = Math.hypot(along, across);
    if (radial >= 1) {
        return { ownerId: source.parentSystemId, finiteEnvelopeWeight: 0,
            primaryEmitter: false };
    }
    const vertical01 = (altitude - envelope.bottomAltitudeKm) /
        Math.max(0.001, envelope.topAltitudeKm - envelope.bottomAltitudeKm);
    const horizontalWindow = 1 - smoothstep(0.78, 1, radial);
    const verticalWindow = smoothstep(0, 0.08, vertical01) *
        (1 - smoothstep(0.92, 1, vertical01));
    return {
        ownerId: source.parentSystemId,
        finiteEnvelopeWeight: clamp(horizontalWindow * verticalWindow),
        primaryEmitter: false,
    };
}

const reservoirChargeRegion = <Polarity extends -1 | 1>(
    reservoir: DeepConvectionWorldChargeReservoir,
    polarity: Polarity,
) => ({
    centerEastAltitudeNorthKm: [
        reservoir.centerEastKm,
        mix(reservoir.altitudeRangeKm[0], reservoir.altitudeRangeKm[1], 0.5),
        reservoir.centerNorthKm,
    ] as const,
    radiusKm: Math.max(0.05, Math.min(
        reservoir.majorRadiusKm,
        reservoir.minorRadiusKm,
        (reservoir.altitudeRangeKm[1] - reservoir.altitudeRangeKm[0]) * 0.5,
    )),
    polarity,
});

/**
 * Bridges qualified storm charge topology into the optical lightning event
 * constructor without importing or duplicating its renderer-independent code.
 */
export function createDeepConvectionLightningEventContract(
    source: DeepConvectionElectricalSource,
    input: DeepConvectionLightningEventContractInput,
): DeepConvectionLightningEventContractResult {
    const reasons: string[] = [];
    if (!source.active) reasons.push("electrical-source-is-inactive");
    const candidate = source.dischargeCandidates.find(({ id }) =>
        id === input.candidateId);
    if (!candidate) reasons.push("discharge-candidate-is-missing");
    if (!(input.peakCurrentKiloamps > 0) ||
        !Number.isFinite(input.peakCurrentKiloamps)) {
        reasons.push("lightning-peak-current-is-invalid");
    }
    if (!(input.radiantEnergyJoules > 0) ||
        !Number.isFinite(input.radiantEnergyJoules)) {
        reasons.push("lightning-radiant-energy-is-invalid");
    }
    if (!(input.ownerOpticalDepth > 0)) {
        reasons.push("convective-owner-optical-depth-is-empty");
    }
    if (!(input.ownerTemperatureKelvin > 0) ||
        !Number.isFinite(input.ownerTemperatureKelvin)) {
        reasons.push("convective-owner-temperature-is-invalid");
    }
    if (reasons.length > 0 || !candidate) return { eventInput: null, reasons };

    const from = source.reservoirs[candidate.fromReservoirIndex];
    const to = candidate.toReservoirIndex === null ? undefined :
        source.reservoirs[candidate.toReservoirIndex];
    const negative = [from, to].find((reservoir) =>
        reservoir?.polarity === "negative") ?? source.reservoirs.find((reservoir) =>
        reservoir.polarity === "negative");
    const positive = [from, to].find((reservoir) =>
        reservoir?.polarity === "positive") ?? source.reservoirs.find((reservoir) =>
        reservoir.polarity === "positive");
    if (!negative || !positive) {
        return { eventInput: null,
            reasons: ["discharge-candidate-lacks-opposite-charge-reservoirs"] };
    }
    return {
        eventInput: {
            id: input.eventId,
            owner: {
                id: source.parentSystemId,
                kind: "convective-cloud",
                finite: true,
                bottomAltitudeKm: source.stormOwnerBounds.bottomAltitudeKm,
                topAltitudeKm: source.stormOwnerBounds.topAltitudeKm,
                opticalDepth: input.ownerOpticalDepth,
                temperatureKelvin: input.ownerTemperatureKelvin,
            },
            topology: candidate.kind,
            negativeCharge: reservoirChargeRegion(negative, -1),
            positiveCharge: reservoirChargeRegion(positive, 1),
            groundAltitudeKm: source.stormOwnerBounds.bottomAltitudeKm,
            peakCurrentKiloamps: input.peakCurrentKiloamps,
            radiantEnergyJoules: input.radiantEnergyJoules,
            guideControlPointsEastAltitudeNorthKm:
                candidate.controlPointsEastAltitudeNorthKm,
            maximumChannelRadiusMetres: candidate.maximumChannelRadiusMetres,
            seed: input.seed,
        },
        reasons,
    };
}

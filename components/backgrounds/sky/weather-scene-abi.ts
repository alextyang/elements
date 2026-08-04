import {
    WEATHER_PHENOMENA_SCHEMA,
    weatherPhenomenonShaderSeed,
    type FinitePhenomenonOwnerKind,
    type IceOpticalFeature,
} from "./weather-optical-phenomena";
import {
    WEATHER_SCENE_MAX_AURORA_CURTAINS,
    WEATHER_SCENE_MAX_BLOWING_MEDIA,
    WEATHER_SCENE_MAX_DROPLET_OWNERS,
    WEATHER_SCENE_MAX_ICE_OWNERS,
    WEATHER_SCENE_MAX_LIGHTNING_EVENTS,
    WEATHER_SCENE_MAX_LIGHTNING_PULSES,
    WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS,
    WEATHER_SCENE_MAX_OWNER_INDEX,
    type ResolvedProductionWeatherScene,
} from "./weather-scene";

/** WebGPU's guaranteed maximum uniform-buffer binding size. */
export const WEATHER_SCENE_BASELINE_UNIFORM_LIMIT_BYTES = 65_536;
export const WEATHER_SCENE_VEC4_BYTES = 16;
export const WEATHER_SCENE_HEADER_VEC4S = 16;
export const WEATHER_SCENE_DROPLET_RECORD_VEC4S = 32;
export const WEATHER_SCENE_ICE_RECORD_VEC4S = 32;
export const WEATHER_SCENE_LIGHTNING_EVENT_VEC4S = 8;
export const WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S = 3;
export const WEATHER_SCENE_LIGHTNING_PULSE_VEC4S = 3;
export const WEATHER_SCENE_AURORA_RECORD_VEC4S = 10;
export const WEATHER_SCENE_BLOWING_RECORD_VEC4S = 8;

const DROPLET_OFFSET = WEATHER_SCENE_HEADER_VEC4S;
const ICE_OFFSET = DROPLET_OFFSET + WEATHER_SCENE_MAX_DROPLET_OWNERS *
    WEATHER_SCENE_DROPLET_RECORD_VEC4S;
const LIGHTNING_EVENT_OFFSET = ICE_OFFSET + WEATHER_SCENE_MAX_ICE_OWNERS *
    WEATHER_SCENE_ICE_RECORD_VEC4S;
const LIGHTNING_SEGMENT_OFFSET = LIGHTNING_EVENT_OFFSET +
    WEATHER_SCENE_LIGHTNING_EVENT_VEC4S;
const LIGHTNING_PULSE_OFFSET = LIGHTNING_SEGMENT_OFFSET +
    WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS * WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S;
const AURORA_OFFSET = LIGHTNING_PULSE_OFFSET +
    WEATHER_SCENE_MAX_LIGHTNING_PULSES * WEATHER_SCENE_LIGHTNING_PULSE_VEC4S;
const BLOWING_OFFSET = AURORA_OFFSET +
    WEATHER_SCENE_MAX_AURORA_CURTAINS * WEATHER_SCENE_AURORA_RECORD_VEC4S;
const UNPADDED_END_VEC4 = BLOWING_OFFSET +
    WEATHER_SCENE_MAX_BLOWING_MEDIA * WEATHER_SCENE_BLOWING_RECORD_VEC4S;
// Dynamic uniform offsets are 256-byte aligned on the WebGPU baseline.
const PADDED_END_VEC4 = Math.ceil(UNPADDED_END_VEC4 / 16) * 16;

/** Every value is a vec4 index from the start of the uniform. */
export const WEATHER_SCENE_VEC4_OFFSETS = Object.freeze({
    header: 0,
    dropletOwners: DROPLET_OFFSET,
    iceOwners: ICE_OFFSET,
    lightningEvent: LIGHTNING_EVENT_OFFSET,
    lightningSegments: LIGHTNING_SEGMENT_OFFSET,
    lightningPulses: LIGHTNING_PULSE_OFFSET,
    auroraCurtains: AURORA_OFFSET,
    blowingMedia: BLOWING_OFFSET,
    end: PADDED_END_VEC4,
});

export const WEATHER_SCENE_UNIFORM_VEC4S = WEATHER_SCENE_VEC4_OFFSETS.end;
export const WEATHER_SCENE_UNIFORM_FLOATS = WEATHER_SCENE_UNIFORM_VEC4S * 4;
export const WEATHER_SCENE_UNIFORM_BYTES = WEATHER_SCENE_UNIFORM_VEC4S *
    WEATHER_SCENE_VEC4_BYTES;

export const WEATHER_SCENE_BYTE_OFFSETS = Object.freeze(Object.fromEntries(
    Object.entries(WEATHER_SCENE_VEC4_OFFSETS).map(([key, value]) =>
        [key, value * WEATHER_SCENE_VEC4_BYTES]),
)) as Readonly<Record<keyof typeof WEATHER_SCENE_VEC4_OFFSETS, number>>;

export const WEATHER_SCENE_OWNER_KIND_CODE: Readonly<Record<
    FinitePhenomenonOwnerKind, number>> = {
    "rain-shaft": 1,
    "fog-bank": 2,
    "liquid-cloud": 3,
    "ice-cloud": 4,
    "diamond-dust-region": 5,
    "convective-cloud": 6,
    "boundary-layer-region": 7,
    "magnetospheric-sheet": 8,
};

export const WEATHER_SCENE_DROPLET_LOBE_CODE: Readonly<Record<string, number>> = {
    "primary-rainbow": 1,
    "secondary-rainbow": 2,
    fogbow: 3,
    "glory-inner": 4,
    "glory-outer": 5,
};

export const WEATHER_SCENE_DROPLET_FEATURE_BIT: Readonly<Record<string, number>> = {
    "primary-rainbow": 1,
    "secondary-rainbow": 2,
    fogbow: 4,
    glory: 8,
    corona: 16,
};

export const WEATHER_SCENE_ICE_FEATURE_CODE: Readonly<Record<
    IceOpticalFeature, number>> = {
    "halo-22": 1,
    "halo-46": 2,
    sundogs: 3,
    "circumzenithal-arc": 4,
    "light-pillar": 5,
    "diamond-dust-glints": 6,
};

export const WEATHER_SCENE_ICE_FEATURE_BIT: Readonly<Record<
    IceOpticalFeature, number>> = {
    "halo-22": 1,
    "halo-46": 2,
    sundogs: 4,
    "circumzenithal-arc": 8,
    "light-pillar": 16,
    "diamond-dust-glints": 32,
};

const WEATHER_SCENE_MAX_DROPLET_LOBES = 6;
const WEATHER_SCENE_MAX_ICE_FEATURES = 6;

const vec4FloatOffset = (vec4Offset: number) => vec4Offset * 4;
const writeVec4 = (
    data: Float32Array,
    vec4Offset: number,
    x = 0,
    y = 0,
    z = 0,
    w = 0,
) => data.set([x, y, z, w].map(Math.fround), vec4FloatOffset(vec4Offset));

const featureMask = (features: readonly string[], bits: Readonly<Record<
    string, number>>) => features.reduce((mask, feature) => mask | (bits[feature] ?? 0), 0);

const uint32Halves = (value: number) => ([
    value & 0xffff,
    (value >>> 16) & 0xffff,
] as const);

const assertFinitePayload = (data: Float32Array) => {
    for (let index = 0; index < data.length; index += 1) {
        if (!Number.isFinite(data[index])) {
            throw new Error(`weather-scene-uniform-non-finite-float-${index}`);
        }
    }
};

export interface PackedWeatherSceneUniform {
    data: Float32Array;
    byteLength: typeof WEATHER_SCENE_UNIFORM_BYTES;
    counts: {
        dropletOwners: number;
        iceOwners: number;
        lightningEvents: 0 | 1;
        lightningSegments: number;
        lightningPulses: number;
        auroraCurtains: number;
        blowingMedia: number;
    };
}

/**
 * Pack an already resolved, completely valid scene. `Float32Array` starts
 * zeroed, so every unused record, lane, and tail-alignment vector is guaranteed
 * to be zero without relying on caller buffer history.
 */
export function packResolvedProductionWeatherScene(
    scene: ResolvedProductionWeatherScene,
): PackedWeatherSceneUniform {
    if (!scene.valid || scene.diagnostics.length > 0) {
        throw new Error(`weather-scene-is-invalid:${scene.diagnostics.map(
            ({ code }) => code).join(",")}`);
    }
    if (scene.dropletOpticalOwners.length > WEATHER_SCENE_MAX_DROPLET_OWNERS ||
        scene.orientedIceOpticalOwners.length > WEATHER_SCENE_MAX_ICE_OWNERS ||
        scene.auroraCurtains.length > WEATHER_SCENE_MAX_AURORA_CURTAINS ||
        scene.blowingBoundaryMedia.length > WEATHER_SCENE_MAX_BLOWING_MEDIA ||
        (scene.lightning?.state.channelSegments.length ?? 0) >
            WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS ||
        (scene.lightning?.state.pulses.length ?? 0) >
            WEATHER_SCENE_MAX_LIGHTNING_PULSES) {
        throw new Error("weather-scene-resolved-capacity-exceeded");
    }
    const data = new Float32Array(WEATHER_SCENE_UNIFORM_FLOATS);
    const lightningSegments = scene.lightning?.state.channelSegments.length ?? 0;
    const lightningPulses = scene.lightning?.state.pulses.length ?? 0;
    const seedHalves = uint32Halves(scene.clock.deterministicSeed);
    writeVec4(data, 0, WEATHER_PHENOMENA_SCHEMA, WEATHER_SCENE_UNIFORM_VEC4S,
        WEATHER_SCENE_UNIFORM_BYTES, 1);
    writeVec4(data, 1, scene.clock.snapshotTimeSeconds,
        scene.clock.sceneTimeSeconds, seedHalves[0], seedHalves[1]);
    writeVec4(data, 2, scene.clock.shaderSeed,
        scene.dropletOpticalOwners.length,
        scene.orientedIceOpticalOwners.length, scene.lightning ? 1 : 0);
    writeVec4(data, 3, lightningSegments, lightningPulses,
        scene.auroraCurtains.length, scene.blowingBoundaryMedia.length);
    writeVec4(data, 4, WEATHER_SCENE_MAX_DROPLET_OWNERS,
        WEATHER_SCENE_MAX_ICE_OWNERS, WEATHER_SCENE_MAX_AURORA_CURTAINS,
        WEATHER_SCENE_MAX_BLOWING_MEDIA);
    writeVec4(data, 5, WEATHER_SCENE_MAX_LIGHTNING_EVENTS,
        WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS, WEATHER_SCENE_MAX_LIGHTNING_PULSES,
        WEATHER_SCENE_MAX_OWNER_INDEX);
    writeVec4(data, 6, WEATHER_SCENE_VEC4_OFFSETS.dropletOwners,
        WEATHER_SCENE_VEC4_OFFSETS.iceOwners,
        WEATHER_SCENE_VEC4_OFFSETS.lightningEvent,
        WEATHER_SCENE_VEC4_OFFSETS.lightningSegments);
    writeVec4(data, 7, WEATHER_SCENE_VEC4_OFFSETS.lightningPulses,
        WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains,
        WEATHER_SCENE_VEC4_OFFSETS.blowingMedia, WEATHER_SCENE_VEC4_OFFSETS.end);
    writeVec4(data, 8, WEATHER_SCENE_DROPLET_RECORD_VEC4S,
        WEATHER_SCENE_ICE_RECORD_VEC4S, WEATHER_SCENE_LIGHTNING_EVENT_VEC4S,
        WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S);
    writeVec4(data, 9, WEATHER_SCENE_LIGHTNING_PULSE_VEC4S,
        WEATHER_SCENE_AURORA_RECORD_VEC4S, WEATHER_SCENE_BLOWING_RECORD_VEC4S,
        WEATHER_SCENE_HEADER_VEC4S);
    // World coordinates are east/altitude/north kilometres; code 1 is fixed.
    writeVec4(data, 10, 1, WEATHER_PHENOMENA_SCHEMA,
        WEATHER_SCENE_MAX_DROPLET_LOBES, WEATHER_SCENE_MAX_ICE_FEATURES);

    for (let index = 0; index < scene.dropletOpticalOwners.length; index += 1) {
        const entry = scene.dropletOpticalOwners[index];
        const state = entry.state;
        const base = WEATHER_SCENE_VEC4_OFFSETS.dropletOwners +
            index * WEATHER_SCENE_DROPLET_RECORD_VEC4S;
        writeVec4(data, base, 1, state.schema, entry.ownerIndex,
            weatherPhenomenonShaderSeed(state.seed));
        writeVec4(data, base + 1, WEATHER_SCENE_OWNER_KIND_CODE[state.owner.kind],
            state.owner.bottomAltitudeKm, state.owner.topAltitudeKm,
            state.owner.opticalDepth);
        writeVec4(data, base + 2, state.owner.temperatureKelvin,
            state.distribution.effectiveRadiusMicrons,
            state.distribution.effectiveVariance,
            state.distribution.minimumRadiusMicrons);
        writeVec4(data, base + 3, state.distribution.maximumRadiusMicrons,
            state.lobes.length, state.corona ? 1 : 0,
            featureMask(state.enabledFeatures, WEATHER_SCENE_DROPLET_FEATURE_BIT));
        writeVec4(data, base + 4, ...state.replacementEnergyRgb);
        if (state.corona) {
            writeVec4(data, base + 5, state.corona.effectiveRadiusMicrons,
                state.corona.effectiveVariance);
            writeVec4(data, base + 6, ...state.corona.energyRgb);
            writeVec4(data, base + 7, ...state.corona.normalizationRgb);
        }
        for (let lobeIndex = 0; lobeIndex < Math.min(state.lobes.length,
            WEATHER_SCENE_MAX_DROPLET_LOBES); lobeIndex += 1) {
            const lobe = state.lobes[lobeIndex];
            const lobeBase = base + 8 + lobeIndex * 4;
            writeVec4(data, lobeBase, ...lobe.centerRadiansRgb,
                WEATHER_SCENE_DROPLET_LOBE_CODE[lobe.id] ?? 0);
            writeVec4(data, lobeBase + 1, ...lobe.sigmaRadiansRgb);
            writeVec4(data, lobeBase + 2, ...lobe.energyRgb);
            writeVec4(data, lobeBase + 3, ...lobe.normalizationRgb);
        }
    }

    for (let index = 0; index < scene.orientedIceOpticalOwners.length;
        index += 1) {
        const entry = scene.orientedIceOpticalOwners[index];
        const state = entry.state;
        const base = WEATHER_SCENE_VEC4_OFFSETS.iceOwners +
            index * WEATHER_SCENE_ICE_RECORD_VEC4S;
        writeVec4(data, base, 1, state.schema, entry.ownerIndex,
            weatherPhenomenonShaderSeed(state.seed));
        writeVec4(data, base + 1, WEATHER_SCENE_OWNER_KIND_CODE[state.owner.kind],
            state.owner.bottomAltitudeKm, state.owner.topAltitudeKm,
            state.owner.opticalDepth);
        writeVec4(data, base + 2, state.owner.temperatureKelvin,
            state.sourceElevationRadians, state.features.length,
            featureMask(state.enabledFeatures, WEATHER_SCENE_ICE_FEATURE_BIT));
        writeVec4(data, base + 3, ...state.sourceDirection);
        writeVec4(data, base + 4, ...state.localUpDirection);
        writeVec4(data, base + 5, state.distribution.plateFraction,
            state.distribution.columnFraction, state.distribution.aggregateFraction,
            state.distribution.randomOrientationFraction);
        writeVec4(data, base + 6, state.distribution.horizontalPlateFraction,
            state.distribution.horizontalColumnFraction,
            state.distribution.tiltStandardDeviationRadians,
            state.distribution.surfaceRoughness);
        writeVec4(data, base + 7, state.distribution.effectiveRadiusMicrons,
            ...state.replacementEnergyRgb);
        for (let featureIndex = 0; featureIndex < Math.min(state.features.length,
            WEATHER_SCENE_MAX_ICE_FEATURES); featureIndex += 1) {
            const feature = state.features[featureIndex];
            const featureBase = base + 8 + featureIndex * 4;
            writeVec4(data, featureBase,
                WEATHER_SCENE_ICE_FEATURE_CODE[feature.kind], ...feature.energyRgb);
            writeVec4(data, featureBase + 1, ...feature.normalizationRgb);
            writeVec4(data, featureBase + 2, ...feature.spectralAngleRadiansRgb);
            writeVec4(data, featureBase + 3, feature.angularWidthRadians,
                feature.secondaryWidthRadians);
        }
    }

    if (scene.lightning) {
        const { ownerIndex, eventStartSceneTimeSeconds, state } = scene.lightning;
        const base = WEATHER_SCENE_VEC4_OFFSETS.lightningEvent;
        writeVec4(data, base, 1, state.schema,
            state.topology === "cloud-to-ground" ? 2 : 1,
            weatherPhenomenonShaderSeed(state.seed));
        writeVec4(data, base + 1, eventStartSceneTimeSeconds,
            state.totalChannelLengthKm, state.groundAltitudeKm, ownerIndex);
        writeVec4(data, base + 2, state.owner.bottomAltitudeKm,
            state.owner.topAltitudeKm, state.owner.opticalDepth,
            state.owner.temperatureKelvin);
        writeVec4(data, base + 3, ...state.negativeCharge.centerEastAltitudeNorthKm,
            state.negativeCharge.radiusKm);
        writeVec4(data, base + 4, state.negativeCharge.polarity,
            state.positiveCharge.polarity, state.channelSegments.length,
            state.pulses.length);
        writeVec4(data, base + 5, ...state.positiveCharge.centerEastAltitudeNorthKm,
            state.positiveCharge.radiusKm);
        const channelPoints = state.channelSegments.flatMap((segment) => [
            segment.startEastAltitudeNorthKm,
            segment.endEastAltitudeNorthKm,
        ]);
        const channelMinimum = [0, 1, 2].map((axis) => Math.min(
            ...channelPoints.map((point) => point[axis]),
        )) as [number, number, number];
        const channelMaximum = [0, 1, 2].map((axis) => Math.max(
            ...channelPoints.map((point) => point[axis]),
        )) as [number, number, number];
        writeVec4(data, base + 6, ...channelMinimum,
            WEATHER_SCENE_OWNER_KIND_CODE[state.owner.kind]);
        writeVec4(data, base + 7, ...channelMaximum);
        for (let index = 0; index < state.channelSegments.length; index += 1) {
            const segment = state.channelSegments[index];
            const segmentBase = WEATHER_SCENE_VEC4_OFFSETS.lightningSegments +
                index * WEATHER_SCENE_LIGHTNING_SEGMENT_VEC4S;
            writeVec4(data, segmentBase, ...segment.startEastAltitudeNorthKm,
                segment.radiusMetres);
            writeVec4(data, segmentBase + 1, ...segment.endEastAltitudeNorthKm,
                segment.emissiveWeight);
            writeVec4(data, segmentBase + 2, segment.parentSegmentIndex,
                segment.branchOrder);
        }
        for (let index = 0; index < state.pulses.length; index += 1) {
            const pulse = state.pulses[index];
            const pulseBase = WEATHER_SCENE_VEC4_OFFSETS.lightningPulses +
                index * WEATHER_SCENE_LIGHTNING_PULSE_VEC4S;
            writeVec4(data, pulseBase, pulse.startSeconds, pulse.durationSeconds,
                pulse.riseSeconds, pulse.decaySeconds);
            writeVec4(data, pulseBase + 1, pulse.peakCurrentKiloamps,
                pulse.radiantEnergyJoules, pulse.temporalNormalization,
                pulse.peakNormalization);
            writeVec4(data, pulseBase + 2, ...pulse.spectrumRgb);
        }
    }

    for (let index = 0; index < scene.auroraCurtains.length; index += 1) {
        const state = scene.auroraCurtains[index];
        const base = WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains +
            index * WEATHER_SCENE_AURORA_RECORD_VEC4S;
        writeVec4(data, base, 1, state.schema,
            WEATHER_SCENE_OWNER_KIND_CODE[state.owner.kind],
            weatherPhenomenonShaderSeed(state.seed));
        writeVec4(data, base + 1, state.owner.bottomAltitudeKm,
            state.owner.topAltitudeKm, state.owner.opticalDepth,
            state.owner.temperatureKelvin);
        writeVec4(data, base + 2, ...state.centerEastNorthKm,
            state.orientationRadians, state.lengthKm);
        writeVec4(data, base + 3, state.sheetWidthKm, state.bottomAltitudeKm,
            state.topAltitudeKm, state.foldAmplitudeKm);
        writeVec4(data, base + 4, state.foldWavelengthKm, state.foldOctaves,
            state.emissionScale, state.solarAltitudeDegrees);
        writeVec4(data, base + 5, ...state.driftEastNorthKmPerSecond,
            state.geomagneticLatitudeDegrees, state.kpIndex);
        writeVec4(data, base + 6, ...state.magneticFieldDirection);
        writeVec4(data, base + 7, ...state.altitudeProfileNormalizationRgb);
        writeVec4(data, base + 8, ...state.columnEmissionRgb);
    }

    for (let index = 0; index < scene.blowingBoundaryMedia.length; index += 1) {
        const state = scene.blowingBoundaryMedia[index];
        const base = WEATHER_SCENE_VEC4_OFFSETS.blowingMedia +
            index * WEATHER_SCENE_BLOWING_RECORD_VEC4S;
        const kindCode = state.kind === "blowing-snow" ? 1 :
            state.kind === "blowing-dust" ? 2 : 3;
        const provenanceCode = state.provenance === "erodible-snowpack" ? 1 :
            state.provenance === "erodible-mineral-soil" ? 2 : 3;
        const ashCode = state.volcanicAshOpticalClass === "weakly-absorbing" ? 1 :
            state.volcanicAshOpticalClass === "moderately-absorbing" ? 2 :
                state.volcanicAshOpticalClass === "strongly-absorbing" ? 3 : 0;
        writeVec4(data, base, 1, state.schema, kindCode,
            weatherPhenomenonShaderSeed(state.seed));
        writeVec4(data, base + 1, state.owner.bottomAltitudeKm,
            state.owner.topAltitudeKm, state.owner.opticalDepth,
            state.owner.temperatureKelvin);
        writeVec4(data, base + 2, ...state.centerEastNorthKm,
            state.majorRadiusKm, state.minorRadiusKm);
        writeVec4(data, base + 3, state.orientationRadians, state.topAltitudeKm,
            state.boundaryTransitionFraction, state.frictionVelocityMps);
        writeVec4(data, base + 4, ...state.windEastNorthMps,
            state.visibilityKm, state.asymmetry);
        writeVec4(data, base + 5, ...state.extinctionRgbKm,
            state.particleMedianDiameterMicrons);
        writeVec4(data, base + 6, ...state.singleScatteringAlbedoRgb,
            state.particleDensityKgM3);
        writeVec4(data, base + 7, ...state.particleDiameterRangeMicrons,
            provenanceCode, ashCode);
    }

    assertFinitePayload(data);
    return {
        data,
        byteLength: WEATHER_SCENE_UNIFORM_BYTES,
        counts: {
            dropletOwners: scene.dropletOpticalOwners.length,
            iceOwners: scene.orientedIceOpticalOwners.length,
            lightningEvents: scene.lightning ? 1 : 0,
            lightningSegments,
            lightningPulses,
            auroraCurtains: scene.auroraCurtains.length,
            blowingMedia: scene.blowingBoundaryMedia.length,
        },
    };
}

/** Fixed, binding-free WGSL declaration. Renderer binding ownership stays elsewhere. */
export const WEATHER_SCENE_UNIFORM_WGSL = /* wgsl */ `
const WEATHER_SCENE_SCHEMA: f32 = ${WEATHER_PHENOMENA_SCHEMA}.0;
const WEATHER_SCENE_UNIFORM_VEC4S: u32 = ${WEATHER_SCENE_UNIFORM_VEC4S}u;
const WEATHER_SCENE_DROPLET_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.dropletOwners}u;
const WEATHER_SCENE_ICE_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.iceOwners}u;
const WEATHER_SCENE_LIGHTNING_EVENT_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningEvent}u;
const WEATHER_SCENE_LIGHTNING_SEGMENT_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningSegments}u;
const WEATHER_SCENE_LIGHTNING_PULSE_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.lightningPulses}u;
const WEATHER_SCENE_AURORA_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.auroraCurtains}u;
const WEATHER_SCENE_BLOWING_OFFSET: u32 = ${WEATHER_SCENE_VEC4_OFFSETS.blowingMedia}u;

struct WeatherSceneUniform {
    data: array<vec4<f32>, ${WEATHER_SCENE_UNIFORM_VEC4S}>,
};
`;

export const createWeatherSceneUniformDeclaration = (
    group: number,
    binding: number,
    variableName = "weather_scene",
) => `
@group(${Math.max(0, Math.floor(group))}) @binding(${Math.max(0, Math.floor(binding))})
var<uniform> ${variableName}: WeatherSceneUniform;
`;

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { CelestialScene } from "./astronomy";
import {
    integrateAnalyticLunarDiscProfileSolidAngle,
    packLunarPhotometry,
    type LunarDiscProfileKind,
} from "./celestial-physics";
import {
    resolveGroundAlbedoRgb,
} from "./atmospheric-composition";
import { AtmosphereCanvas, type SkyRadianceScene } from "./atmosphere-canvas";
import {
    CLOUD_QUALIFICATION_TRANSPORT_UPDATES,
    CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
    cloudTransportTransactionIdentityMatches,
    createCloudTransportRasterSchedule,
    createCloudTransportRasterSubmission,
    isCloudLightTransportEpochReady,
    resolveCloudRenderClock,
    resolveCloudTransportDeltaSeconds,
    shouldInvalidateCloudLightForTime,
    shouldScheduleCloudRender,
    type CloudTransportBatchCursor,
    type CloudTransportRasterTile,
    type CloudTransportTransactionIdentity,
} from "./cloud-qualification-clock";
import { CelestialCanvas } from "./celestial-canvas";
import { CLOUD_SPECIES_CODE, type CloudLayerState } from "./cloud-scene";
import {
    CLOUD_SYSTEM_BUFFER_FLOATS,
    CLOUD_SYSTEM_MAX_COUNT,
    cloudSystemSceneSignature,
    createCloudSystemRuntime,
    type RuntimeCloudSystem,
} from "./cloud-system-runtime";
import {
    embedCloudOrientationInCameraWorld,
    embedCloudRuntimeInCameraWorld,
} from "./cloud-world-frame";
import {
    createCloudLightVolumeRuntime,
    qualifyCloudLightVolumePlainFibratusSourcePath,
    type CloudLightVolumeMacroSupport,
} from "./cloud-light-volume-runtime";
import {
    cloudFibratusSourceFieldTextureOrigin,
    createCloudFibratusAtlasDensitySampler,
    createCloudFibratusSourceField,
    resolveCloudFibratusExtinctionRgbPerKm,
} from "./cloud-fibratus-source-field";
import {
    cloudRadiativeOwnerInputFromRuntime,
    createCloudRadiativeOwnerDomains,
} from "./cloud-radiative-domain";
import {
    DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH,
    DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES,
    DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES,
    createDirectionalCloudVisibilityDomains,
    createDirectionalCloudVisibilityInvalidationSignature,
    createDirectionalCloudVisibilityOwnerMasks,
    packDirectionalCloudVisibilityUniform,
} from "./directional-cloud-visibility";
import {
    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS,
    CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG,
    CLOUD_LIGHT_VOLUME_FACE_COUNT,
    CLOUD_LIGHT_VOLUME_SOURCE_COUNT,
    CLOUD_LIGHT_VOLUME_SOURCE_STRIDE_FLOATS,
    createCloudLightVolumePlan,
    packCloudLightVolumeSources,
    packCloudLightVolumeUniforms,
    packCloudLightVolumeViewUniforms,
    resolveCloudLightVolumeSmoothingParity,
    type CloudLightVolumeDirectSource,
    type CloudLightVolumeBrick,
    type CloudLightVolumeOwnerMask,
} from "./cloud-light-volume";
import {
    CLOUD_MORPHOLOGY_HEADER_TEXELS,
    CLOUD_MORPHOLOGY_MAX_RECORDS,
    CLOUD_MORPHOLOGY_RECORD_TEXELS,
    CLOUD_MORPHOLOGY_TEXTURE_WIDTH,
    loadCloudMorphologyModifierManifest,
    packCloudMorphologyModifiers,
    type CloudMorphologyBounds,
    type PackedCloudMorphologyModifiers,
} from "./cloud-morphology-modifiers";
import {
    CLOUD_OPTICS_OWNER_BUFFER_FLOATS,
    createCloudOpticsOwnerRuntime,
    resolveCloudLocalOptics,
    type CloudOpticsOwnerSelection,
} from "./cloud-optics-runtime";
import {
    CLOUD_OPTICS_PARAMETER_BUFFER_BYTES,
    loadCloudOptics,
    uploadCloudOptics,
} from "./cloud-optics";
import {
    CLOUD_MACRO_FORMATION_CODE,
    CLOUD_MACRO_TOPOLOGY_CODE,
    getCloudHighIceSourceSampleTransform,
    getCloudMacroConservativeSupport,
    loadCloudMacroAtlas,
    selectCloudMacroVolumeId,
    uploadCloudMacroAtlas,
    type CloudMacroAtlasManifest,
    type LoadedCloudMacroAtlas,
    type CloudMacroVolumeEntry,
} from "./cloud-volume-atlas";
import {
    cloudVolumeMipTailByteLength,
    createCloudVolumeAverageMips,
    unpackCloudVolumeMipTail,
    type CloudVolumeMipLevel,
} from "./cloud-volume-filtering";
import {
    HYDROMETEOR_HEADER_VEC4S,
    HYDROMETEOR_MAX_FIELDS,
    HYDROMETEOR_VEC4_STRIDE,
    createHydrometeorSceneOverrideSignature,
    createHydrometeorRuntime,
} from "./hydrometeor-system";
import {
    createPhysicalAtmosphereGpuResources,
    type AtmosphereArtisticGrade,
    type AtmosphereLightingState,
    type AtmosphereVec3,
    type PhysicalAtmosphereState,
} from "./physical-atmosphere";
import {
    resolveProductionWeatherScene,
    type ResolvedProductionWeatherScene,
} from "./weather-scene";
import {
    WEATHER_SCENE_UNIFORM_BYTES,
    packResolvedProductionWeatherScene,
} from "./weather-scene-abi";
import {
    resolveSkyRendererOptions,
    resolveSkyCloudSampling,
    selectSkyRendererBackend,
    SKY_QUALITY_PROFILES,
    type SkyDebugView,
    type SkyCloudComposition,
    type SkyCloudEditorialRegime,
    type SkyCloudPerspective,
    type SkyRendererBackend,
    type SkyRendererOptions,
    type SkyRendererStats,
    type SkyCloudSamplingDecision,
} from "./renderer-types";
import styles from "./sky.module.css";
import {
    cameraYawRadiansFromViewAzimuth,
    rotateDirectionByCameraYaw,
} from "./camera-contract";
import {
    WEBGPU_ATMOSPHERE_SHADER,
    WEBGPU_CLOUD_INTERVAL_SHADER,
    WEBGPU_CLOUD_COUPLING_SHADER,
    WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER,
    WEBGPU_CLOUD_LAYER_SHADER,
    WEBGPU_HYDROMETEOR_LAYER_SHADER,
    WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER,
    WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
    WEBGPU_CLOUD_METRICS_SHADER,
    WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER,
    WEBGPU_COMPOSITE_SHADER,
    WEBGPU_MOON_SHADER,
    WEBGPU_STAR_SHADER,
    WEBGPU_STELLAR_GLOW_SHADER,
} from "./webgpu-shaders";

const CLOUD_LIGHT_VOLUME_REFRESH_SLAB_DEPTH = 8;
// Exact owner morphology is substantially heavier than the cached multigrid
// graph. Production fails closed to 48x32x1 = 1,536 fine material and source
// queries per submission, preserving every x/y/z sample. One exact
// pass owns a compute-only submission so neither the watchdog bound nor its
// completion fence inherits background, stellar, or presentation work.
const CLOUD_LIGHT_VOLUME_EXACT_MEDIUM_SLAB_DEPTH = 8;
const CLOUD_LIGHT_VOLUME_EXACT_FINE_MEDIUM_SLAB_DEPTH = 1;
const CLOUD_LIGHT_VOLUME_EXACT_SOURCE_SLAB_DEPTH = 1;
const CLOUD_LIGHT_VOLUME_FILTERED_MEDIUM_BIT = 256;
const CLOUD_LIGHT_VOLUME_PAIRED_DIRECT_Y_BIT = 512;
const CLOUD_LIGHT_VOLUME_RESIDENT_SOURCE_MEDIUM_BIT = 1024;
const CLOUD_LIGHT_VOLUME_P1_ELIGIBLE_BIT = 2048;
const CLOUD_LIGHT_VOLUME_METADATA_SCHEMA_MASK = 255;
const CLOUD_LIGHT_VOLUME_KNOWN_METADATA_MASK =
    CLOUD_LIGHT_VOLUME_METADATA_SCHEMA_MASK |
    CLOUD_LIGHT_VOLUME_FILTERED_MEDIUM_BIT |
    CLOUD_LIGHT_VOLUME_PAIRED_DIRECT_Y_BIT |
    CLOUD_LIGHT_VOLUME_RESIDENT_SOURCE_MEDIUM_BIT |
    CLOUD_LIGHT_VOLUME_P1_ELIGIBLE_BIT;
// Amortize the fixed cost of a full presentation draw without turning a
// light-volume refresh into one unbounded GPU submission. Each encoded step
// retains its own uniform buffer because queue.writeBuffer calls precede the
// eventual submit; sharing one buffer would make every pass observe the last
// step's uniforms.
const CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW = 8;
const CLOUD_LIGHT_VOLUME_EXACT_PASSES_PER_SUBMISSION = 1;
const CLOUD_LIGHT_VOLUME_WARMING_RATE_HZ = 30;
const CLOUD_LIGHT_VOLUME_ADVECTION_EPOCH_SECONDS = 2;
// Three RGBA16F packet fields for low/mid/high, hydrometeors, and upper media.
// This is 120 bytes per cloud-resolution pixel and retains every scalar needed
// to reproduce the raw radiance/transmittance/geometry/motion ABI later.
const CLOUD_LAYER_PACKET_BYTES_PER_PIXEL = 5 * 3 * 8;

type CloudLightVolumeRefreshPhase =
    | "boundary"
    | "material"
    | "material-fine"
    | "prolongate-medium"
    | "restrict-medium"
    | "source-materialize-sun"
    | "direct-sun"
    | "source-materialize-moon"
    | "direct-moon"
    | "lightning-field"
    | "clear-fine"
    | "pre-smooth"
    | "restrict-residual"
    | "clear-coarse"
    | "coarse-smooth"
    | "prolongate"
    | "post-smooth"
    | "copy-packed"
    | "measure-residual"
    | "await-residual"
    | "copy-direct";

interface CloudLightVolumeRefreshWork {
    generation: number;
    brickIndex: number;
    phase: CloudLightVolumeRefreshPhase;
    slabStart: number;
    iteration: number;
    level: number;
    cycle: number;
}

interface StrictCloudTransportTransaction {
    serial: number;
    identity: CloudTransportTransactionIdentity;
    cursor: CloudTransportBatchCursor;
    tiles: readonly CloudTransportRasterTile[];
    maximumPixelsPerSubmission: number;
    maximumPacketBatchesPerSubmission: number;
    frozenParameters: Float32Array;
    frozenWeatherScene: Float32Array;
}

interface SkyRendererCanvasProps {
    radiance: SkyRadianceScene;
    celestial: CelestialScene;
    /** Canonical optical state shared with celestial CPU qualification. */
    physicalAtmosphereState: PhysicalAtmosphereState;
    /** Caller-owned identity for exact scene/frame qualification. */
    sceneKey?: string;
    paused?: boolean;
    options?: Partial<SkyRendererOptions>;
    onStats?: (stats: SkyRendererStats) => void;
}

interface WebGpuCanvasProps extends SkyRendererCanvasProps {
    options: SkyRendererOptions;
    onFailure: (message: string) => void;
}

// Exact no-cloud sky shipped in the longest-running Elements deployment
// (492508b, March 2025). It remains intentionally independent of the new
// renderer so a GPU failure cannot exercise another experimental sky path.
const LEGACY_FALLBACK_SKIES: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
    [["010A10", 30], ["59230B", 80], ["2F1107", 100]],
    [["090401", 50], ["4B1D06", 100]],
    [["00000c", 80], ["150800", 100]],
    [["00000c", 0], ["00000c", 0]],
    [["020111", 85], ["191621", 100]],
    [["020111", 60], ["20202c", 100]],
    [["020111", 10], ["3a3a52", 100]],
    [["20202c", 0], ["515175", 100]],
    [["40405c", 0], ["6f71aa", 80], ["8a76ab", 100]],
    [["4a4969", 0], ["7072ab", 50], ["cd82a0", 100]],
    [["757abf", 0], ["8583be", 60], ["eab0d1", 100]],
    [["82addb", 0], ["ebb2b1", 100]],
    [["94c5f8", 1], ["a6e6ff", 70], ["b1b5ea", 100]],
    [["b7eaff", 0], ["94dfff", 100]],
    [["9be2fe", 0], ["67d1fb", 100]],
    [["90dffe", 0], ["38a3d1", 100]],
    [["57c1eb", 0], ["246fa8", 100]],
    [["2d91c2", 0], ["1e528e", 100]],
    [["2473ab", 0], ["1e528e", 70], ["5b7983", 100]],
    [["1e528e", 0], ["265889", 50], ["9da671", 100]],
    [["1e528e", 0], ["728a7c", 50], ["e9ce5d", 100]],
    [["154277", 0], ["576e71", 30], ["e1c45e", 70], ["b26339", 100]],
    [["163C52", 0], ["4F4F47", 30], ["C5752D", 60], ["B7490F", 80], ["2F1107", 100]],
    [["071B26", 0], ["071B26", 30], ["8A3B12", 80], ["240E03", 100]],
];

const legacyFallbackGradient = () => {
    const stops = LEGACY_FALLBACK_SKIES[new Date().getHours() % 24];
    return `linear-gradient(175deg, #${stops[0][0]} 0%, ${stops
        .map(([color, position]) => `#${color} ${position + 10}%`)
        .join(", ")})`;
};

const DEBUG_VIEW_INDEX: Record<SkyDebugView, number> = {
    final: 0,
    coverage: 1,
    density: 2,
    transmittance: 3,
    depth: 4,
    velocity: 5,
    history: 6,
    lighting: 7,
    steps: 8,
    "lighting-direct-sun": 9,
    "lighting-exterior-diffuse": 10,
    "lighting-p1-cache": 11,
    "lighting-atmosphere-composite": 12,
    "lighting-source-higher-order": 13,
    "lighting-atmosphere-shadow-loss": 14,
};

const parseColor = (value: string): [number, number, number] => {
    const channels = value.match(/[\d.]+/g)?.map(Number);
    if (value.startsWith("rgb") && channels && channels.length >= 3) {
        return [channels[0] / 255, channels[1] / 255, channels[2] / 255];
    }
    const hex = value.replace("#", "");
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [
            Number.parseInt(hex.slice(0, 2), 16) / 255,
            Number.parseInt(hex.slice(2, 4), 16) / 255,
            Number.parseInt(hex.slice(4, 6), 16) / 255,
        ];
    }
    return [0, 0, 0];
};

const srgbChannelToLinear = (value: number) =>
    value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;

const rendererToAtmosphereDirection = (
    direction: readonly [number, number, number],
): AtmosphereVec3 => [direction[0], direction[2], direction[1]];

const sourceSolidAngle = (angularRadiusRadians: number) =>
    2 * Math.PI * (1 - Math.cos(angularRadiusRadians));

const sourceRadianceFromIrradiance = (
    irradiance: readonly [number, number, number],
    angularRadiusRadians: number,
): AtmosphereVec3 => {
    const solidAngle = Math.max(1e-9, sourceSolidAngle(angularRadiusRadians));
    return irradiance.map((channel) => Math.max(0, channel) / solidAngle) as
        unknown as AtmosphereVec3;
};

interface PhysicalAtmosphereFrame {
    state: PhysicalAtmosphereState;
    lighting: AtmosphereLightingState;
    grade: AtmosphereArtisticGrade;
}

/**
 * Resolve the bounded palette residual separately from the optical state. The
 * canonical state is created upstream and is shared byte-for-byte with the
 * CPU celestial qualification path; palette colour is applied only once after
 * atmosphere, celestial, cloud, and weather transport.
 */
const resolveAtmosphereGrade = (
    radiance: SkyRadianceScene,
): AtmosphereArtisticGrade => {
    const paletteLinear = [
        ...parseColor(radiance.palette.upper).map(srgbChannelToLinear),
    ] as [number, number, number];
    const paletteMean = Math.max(
        1e-5,
        (paletteLinear[0] + paletteLinear[1] + paletteLinear[2]) / 3,
    );
    const chromaResidual: AtmosphereVec3 = [
        Math.max(-0.12, Math.min(0.12, (paletteLinear[0] / paletteMean - 1) * 0.09)),
        Math.max(-0.12, Math.min(0.12, (paletteLinear[1] / paletteMean - 1) * 0.09)),
        Math.max(-0.12, Math.min(0.12, (paletteLinear[2] / paletteMean - 1) * 0.09)),
    ];
    return {
        exposureCompensationEv: 0,
        chromaResidual,
        moodStrength: Math.min(0.35, 0.08 + radiance.edgeStrength * 0.12),
    };
};

/** Convert the two celestial disk-integrated sources to LUT source radiance. */
const createPhysicalAtmosphereFrame = (
    radiance: SkyRadianceScene,
    celestial: CelestialScene,
    state: PhysicalAtmosphereState,
): PhysicalAtmosphereFrame => {
    const cameraYaw = cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth);
    const sun = celestial.sun.source;
    const moon = celestial.moon.radianceContract;
    const lighting: AtmosphereLightingState = {
        observerAltitudeKm: state.observerAltitudeKm,
        sources: [
            {
                kind: "sun",
                direction: rendererToAtmosphereDirection(
                    rotateDirectionByCameraYaw(sun.direction, cameraYaw),
                ),
                topOfAtmosphereRadiance: sourceRadianceFromIrradiance(
                    sun.topOfAtmosphereIrradianceRgb,
                    sun.angularRadiusRadians,
                ),
                angularRadiusRadians: sun.angularRadiusRadians,
                enabled: sun.topOfAtmosphereIrradianceRgb.some(
                    (channel) => channel > 1e-7,
                ),
            },
            {
                kind: "moon",
                direction: rendererToAtmosphereDirection(
                    rotateDirectionByCameraYaw(
                        celestial.moon.direction,
                        cameraYaw,
                    ),
                ),
                topOfAtmosphereRadiance: sourceRadianceFromIrradiance(
                    radiance.moonTopOfAtmosphereIrradiance,
                    moon.angularRadiusRadians,
                ),
                angularRadiusRadians: moon.angularRadiusRadians,
                enabled: radiance.moonTopOfAtmosphereIrradiance.some(
                    (channel) => channel > 1e-10,
                ),
            },
        ],
    };
    return { state, lighting, grade: resolveAtmosphereGrade(radiance) };
};

const createCloudLightVolumeSources = (
    radiance: SkyRadianceScene,
): readonly CloudLightVolumeDirectSource[] => {
    const cameraYaw = cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth);
    return [{
        kind: "sun",
        directionToSource: rotateDirectionByCameraYaw(
            radiance.sunDirection,
            cameraYaw,
        ),
        atmosphereTransportedIrradianceRgb:
            radiance.solarTopOfAtmosphereIrradiance,
        active: radiance.solarTopOfAtmosphereIrradiance.some(
            (channel) => channel > 0),
    },
    {
        kind: "moon",
        directionToSource: rotateDirectionByCameraYaw(
            radiance.moonDirection,
            cameraYaw,
        ),
        atmosphereTransportedIrradianceRgb:
            radiance.moonTopOfAtmosphereIrradiance,
        active: radiance.moonTopOfAtmosphereIrradiance.some(
            (channel) => channel > 0),
    }];
};

/**
 * Compile physical formation once, then rigidly embed its reference-view
 * world in the same Earth-local yaw used by camera rays and light sources.
 */
const createCloudRuntimeForRadiance = (radiance: SkyRadianceScene) =>
    embedCloudRuntimeInCameraWorld(
        createCloudSystemRuntime(radiance.cloudScene),
        cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
    );

const createHydrometeorRuntimeForRadiance = (
    radiance: SkyRadianceScene,
    systems: readonly RuntimeCloudSystem[],
) => {
    const surfaceLayer = radiance.cloudScene.layers[0];
    return createHydrometeorRuntime(
        systems,
        {
            surfaceAltitudeKm: Math.max(0, radiance.observerAltitude * 2.5),
            surfaceTemperatureKelvin: 288.15 + Math.max(-12, Math.min(10,
                radiance.solarAltitude * 0.12)),
            surfaceRelativeHumidity: Math.max(
                0.02, Math.min(0.99, radiance.humidity)),
            surfacePressureHpa: 1013.25,
            surfaceWindSpeed: surfaceLayer?.windSpeed ?? 2.5,
            surfaceWindDirection: embedCloudOrientationInCameraWorld(
                surfaceLayer?.windDirection ?? 0,
                cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
            ),
            fogAmount: radiance.cloudScene.fog,
        },
        HYDROMETEOR_MAX_FIELDS,
        radiance.hydrometeors,
    );
};

const requiresHydrometeorTransport = (
    radiance: SkyRadianceScene,
    systems: readonly RuntimeCloudSystem[],
) => createHydrometeorRuntimeForRadiance(radiance, systems).fields.length > 0 ||
    Boolean(radiance.weather?.blowingBoundaryMedia?.length ||
        radiance.weather?.lightning);

const requiresUpperAtmosphereTransport = (radiance: SkyRadianceScene) =>
    radiance.cloudScene.noctilucent > 0.0005 ||
    Boolean(radiance.weather?.auroraCurtains?.length) ||
    Boolean(radiance.cloudScene.classifications?.some((assignment) =>
        assignment.upperAtmosphericCloud));

const createCloudLightVolumeLightingSignature = (radiance: SkyRadianceScene) =>
    JSON.stringify({
        cameraYaw: cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
        sunDirection: rotateDirectionByCameraYaw(
            radiance.sunDirection,
            cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
        ),
        moonDirection: rotateDirectionByCameraYaw(
            radiance.moonDirection,
            cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
        ),
        sunIrradiance: radiance.solarTopOfAtmosphereIrradiance,
        moonIrradiance: radiance.moonTopOfAtmosphereIrradiance,
        aerosol: radiance.aerosol,
        aerosolTint: radiance.aerosolTint,
        aerosolSize: radiance.aerosolSize,
        aerosolAbsorption: radiance.aerosolAbsorption,
        humidity: radiance.humidity,
        ozone: radiance.ozone,
        stratosphericAerosol: radiance.stratosphericAerosol,
        observerAltitude: radiance.observerAltitude,
        groundAlbedoRgb: resolveGroundAlbedoRgb(
            radiance.groundAlbedo,
            radiance.groundAlbedoRgb,
        ),
        lightningGeometry: radiance.weather?.lightning ?? null,
    });

const setVector = (
    target: Float32Array,
    index: number,
    values: readonly number[],
) => {
    target.set(values, index * 4);
};

type PackedCameraState = readonly [number, number, number, number];

interface LoadedLunarProfileState {
    url: string;
    kind: LunarDiscProfileKind;
    /** Integral over the normalized unit-disc plane, before angular scaling. */
    normalizedDiscPlaneIntegralRgb: AtmosphereVec3;
    /** Mean decoded LROC reflectance used by the matching CPU quadrature. */
    analyticMeanAlbedoRgb: AtmosphereVec3;
}

const ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE = new Map<string, AtmosphereVec3>();

const analyticLunarProfileIntegral = (
    celestial: CelestialScene,
    albedo: AtmosphereVec3,
) => {
    const moon = celestial.moon;
    const key = JSON.stringify([
        moon.ephemeris.sunDirectionInDiscFrame.map((value) => value.toFixed(7)),
        moon.radianceContract.angularRadiusRadians.toFixed(9),
        moon.diskPhotometry.illuminatedFraction.toFixed(8),
        moon.diskPhotometry.roloCalibrationRgb.map((value) => value.toFixed(7)),
        albedo.map((value) => value.toFixed(7)),
    ]);
    const cached = ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE.get(key);
    if (cached) return cached;
    const integral = integrateAnalyticLunarDiscProfileSolidAngle({
        angularRadiusRadians: moon.radianceContract.angularRadiusRadians,
        sunDirectionInDiscFrame: moon.ephemeris.sunDirectionInDiscFrame,
        illuminatedFraction: moon.diskPhotometry.illuminatedFraction,
        roloCalibrationRgb: moon.diskPhotometry.roloCalibrationRgb,
        meanAlbedoRgb: albedo,
    }) as AtmosphereVec3;
    ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE.set(key, integral);
    if (ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE.size > 32) {
        ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE.delete(
            ANALYTIC_LUNAR_PROFILE_INTEGRAL_CACHE.keys().next().value!,
        );
    }
    return integral;
};

const createPackedCameraState = (
    radiance: SkyRadianceScene,
    width: number,
    height: number,
): PackedCameraState => [
    radiance.cameraProjection
        ? (radiance.horizontalFov * Math.PI) / 180
        : 2 * Math.atan(
              Math.tan((80 * Math.PI) / 360) *
                  Math.max(0.35, width / Math.max(1, height)),
          ),
    // The default view spans the physical horizon through the upper dome.
    // Centering at 50° cropped the horizon and forced low cloud into a warped
    // fringe along the canvas edge; 40° with the same 80° vertical field
    // preserves both real cloud perspective and the full palette composition.
    ((radiance.cameraProjection ? radiance.viewElevation : 40) * Math.PI) / 180,
    ((radiance.cameraProjection ? radiance.verticalFov : 80) * Math.PI) / 180,
    2,
];

const createParameterData = (
    radiance: SkyRadianceScene,
    celestial: CelestialScene,
    atmosphereGrade: AtmosphereArtisticGrade,
    lunarProfile: LoadedLunarProfileState,
    options: SkyRendererOptions,
    width: number,
    height: number,
    cloudWidth: number,
    cloudHeight: number,
    cloudTime: number,
    frame: number,
    historyProgress: number,
    historyAvailable: boolean,
    viewSteps: number,
    lightSteps: number,
    transportIndex: number,
    interleavedTransport: boolean,
    currentTransportCamera: PackedCameraState,
    previousTransportCamera: PackedCameraState,
    currentTransportYawRadians: number,
    previousTransportYawRadians: number,
    transportDeltaSeconds: number,
    newTransportSample: boolean,
    strictRadiometricQualification: boolean,
) => {
    const data = new Float32Array(54 * 4);
    const cameraYaw = cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth);
    setVector(data, 0, [width, height, cloudTime, frame]);
    setVector(data, 1, [
        radiance.sun[0],
        radiance.sun[1],
        radiance.moon[0],
        radiance.moon[1],
    ]);
    setVector(data, 2, [
        radiance.nightDepth,
        radiance.aerosol,
        radiance.humidity,
        radiance.cloudiness,
    ]);
    setVector(data, 3, [
        radiance.solarAltitude,
        radiance.moonlight,
        radiance.edgeStrength,
        radiance.horizonStrength,
    ]);
    const packedCamera = createPackedCameraState(radiance, width, height);
    setVector(data, 4, packedCamera);
    const palette = radiance.palette;
    [
        palette.top,
        palette.upper,
        palette.middle,
        palette.horizon,
        palette.low,
        palette.left,
        palette.right,
        palette.glow,
        palette.haze,
    ].forEach((color, index) => setVector(data, index + 5, [...parseColor(color), 1]));
    // Preserve the established palette lanes while extending the parameter ABI
    // with explicit celestial ephemeris and radiometry packets. Transport shaders receive
    // the same buffer but never read or apply these editorial values.
    data[5 * 4 + 3] = atmosphereGrade.exposureCompensationEv;
    data[6 * 4 + 3] = atmosphereGrade.moodStrength;
    data[7 * 4 + 3] = atmosphereGrade.chromaResidual[0];
    data[8 * 4 + 3] = atmosphereGrade.chromaResidual[1];
    data[9 * 4 + 3] = atmosphereGrade.chromaResidual[2];
    const sun = celestial.sun.source;
    setVector(data, 10, [
        ...sun.topOfAtmosphereIrradianceRgb,
        sun.angularRadiusRadians,
    ]);
    setVector(data, 11, [
        ...sun.limbDarkening,
        sun.solidAngleSteradians,
        celestial.sun.commonExposureScale,
    ]);
    const moonContract = celestial.moon.radianceContract;
    setVector(data, 12, [
        ...radiance.moonTopOfAtmosphereIrradiance,
        moonContract.angularRadiusRadians,
    ]);
    const lunarProfileIntegral = lunarProfile.kind === "nasa-svs-phase-profile"
        ? lunarProfile.normalizedDiscPlaneIntegralRgb.map((channel) =>
              channel * moonContract.angularRadiusRadians ** 2) as unknown as
                  AtmosphereVec3
        : analyticLunarProfileIntegral(
              celestial,
              lunarProfile.analyticMeanAlbedoRgb,
          );
    setVector(data, 13, [
        ...lunarProfileIntegral,
        lunarProfile.kind === "nasa-svs-phase-profile" ? 0 : 1,
    ]);
    setVector(data, 14, radiance.seed);
    setVector(data, 15, [...radiance.sunRadiance, 1]);
    setVector(data, 16, [...radiance.moonRadiance, 1]);
    setVector(data, 17, [...radiance.cloudAmbient, 1]);
    setVector(data, 18, [...radiance.cloudGroundLight, 1]);
    setVector(data, 19, [
        radiance.aerosolSize,
        radiance.aerosolAbsorption,
        radiance.ozone,
        radiance.observerAltitude * 2.5,
    ]);
    setVector(data, 20, [
        radiance.airglowStrength,
        radiance.nightBlackout,
        viewSteps,
        historyProgress,
    ]);
    setVector(data, 21, [...radiance.aerosolTint, 1]);
    setVector(data, 22, [
        radiance.cloudScene.fog,
        DEBUG_VIEW_INDEX[options.debugView],
        options.temporal && historyAvailable ? 1 : 0,
        radiance.cloudScene.noctilucent,
    ]);
    setVector(data, 23, [
        Math.min(window.devicePixelRatio || 1, 2),
        celestial.starsOpacity,
        celestial.stellarExposure,
        celestial.stellarGlow,
    ]);

    const moon = celestial.moon;
    const minimumDimension = Math.min(width, height);
    const radius = moon.physicalScale
        ? Math.max(
              0.75,
              width * (0.2595 * moon.scale) /
                  Math.max(0.5, (packedCamera[0] * 180) / Math.PI),
          )
        : Math.min(44, Math.max(16, minimumDimension * 0.019)) * moon.scale;
    setVector(data, 24, [
        ...rotateDirectionByCameraYaw(moon.direction, cameraYaw),
        radius,
    ]);
    setVector(data, 25, [
        moon.fraction,
        (moon.rotation * Math.PI) / 180,
        moon.earthshineOpacity,
        moon.opacity,
    ]);
    setVector(data, 26, [
        ...parseColor(moon.lightColor).map(srgbChannelToLinear),
        1,
    ]);
    setVector(data, 27, [
        lunarProfile.kind === "nasa-svs-phase-profile" ? 1 : 0,
        (moon.textureRotation * Math.PI) / 180,
        moon.radianceContract.commonExposureScale,
        moon.dispersion,
    ]);
    const cloudCompositionCode: Record<SkyCloudComposition, number> = {
        physical: 0,
        layered: 1,
        "edge-framed": 2,
        graphic: 3,
    };
    const cloudPerspectiveCode: Record<SkyCloudPerspective, number> = {
        natural: 0,
        wide: 1,
        telephoto: 2,
        orthographic: 3,
        panoramic: 4,
    };
    const cloudEditorialRegimeCode: Record<SkyCloudEditorialRegime, number> = {
        auto: 0,
        distant: 1,
        nearby: 2,
        overhead: 3,
    };
    setVector(data, 28, [
        celestial.backgroundLuminance,
        cloudCompositionCode[options.cloudComposition],
        cloudPerspectiveCode[options.cloudPerspective],
        cloudEditorialRegimeCode[options.cloudEditorialRegime],
    ]);
    setVector(data, 29, [
        lightSteps,
        radiance.adaptationExposure,
        Math.max(1, cloudWidth),
        Math.max(1, cloudHeight),
    ]);
    setVector(data, 30, [
        transportIndex,
        interleavedTransport ? 1 : 0,
        transportIndex % 2,
        transportDeltaSeconds,
    ]);
    setVector(data, 31, currentTransportCamera);
    setVector(data, 32, previousTransportCamera);
    // The composite can be presented more often than cloud transport is
    // evaluated. Carry an explicit sample-submission bit so presentation-only
    // frames copy the resolved radiance history instead of accumulating the
    // same stochastic sample repeatedly.
    setVector(data, 33, [
        ...rotateDirectionByCameraYaw(radiance.sunDirection, cameraYaw),
        newTransportSample ? 1 : 0,
    ]);
    setVector(data, 34, [
        ...rotateDirectionByCameraYaw(radiance.moonDirection, cameraYaw),
        0,
    ]);
    const night = celestial.naturalNight;
    setVector(data, 35, [
        ...rotateDirectionByCameraYaw(
            night.coordinateFrame.eclipticNorthDirection,
            cameraYaw,
        ),
        night.zodiacal.radianceScale,
    ]);
    setVector(data, 36, [
        ...rotateDirectionByCameraYaw(
            night.coordinateFrame.galacticNorthDirection,
            cameraYaw,
        ),
        night.galactic.radianceScale,
    ]);
    setVector(data, 37, [
        ...rotateDirectionByCameraYaw(
            night.coordinateFrame.galacticCenterDirection,
            cameraYaw,
        ),
        night.integratedStarlight.radianceScale,
    ]);
    // The padding lane is the immutable preview/cinematic qualification flag.
    // Live presentation leaves it zero so the resident P1 interior retains
    // its bounded cached cost; strict captures compare the analytic and P1
    // higher-order closures at every event, including brick interiors.
    setVector(data, 38, [
        ...night.airglow.zenithRadianceRgb,
        strictRadiometricQualification ? 1 : 0,
    ]);
    setVector(data, 39, [
        night.airglow.layerBottomKm,
        night.airglow.layerTopKm,
        night.airglow.observerAltitudeKm,
        night.airglow.gravityWaveAmplitude,
    ]);
    setVector(data, 40, [
        ...night.airglow.gravityWaveDirection,
        night.airglow.gravityWaveHorizontalScaleKm,
        night.airglow.gravityWavePhase,
    ]);
    setVector(data, 41, [
        ...night.zodiacal.solarSpectrumRgb,
        Math.max(0, Math.min(1, radiance.nightDepth)),
    ]);
    setVector(data, 42, [
        ...night.galactic.coolPlaneSpectrumRgb,
        night.galactic.calibratedMapWeight,
    ]);
    setVector(data, 43, [...night.galactic.warmBulgeSpectrumRgb, 0]);
    setVector(data, 44, [...night.integratedStarlight.stellarPopulationSpectrumRgb, 0]);
    const artificialGround = night.artificialGroundSource;
    if (artificialGround) {
        data[43 * 4 + 3] = artificialGround.radiusKm;
        setVector(data, 45, [
            ...artificialGround.upwardRadianceRgb,
            artificialGround.upwardAnisotropy,
        ]);
    }
    const lunarEphemeris = moon.ephemeris;
    setVector(data, 46, [
        lunarEphemeris.subEarthLongitudeRadians,
        lunarEphemeris.subEarthLatitudeRadians,
        lunarEphemeris.northPoleAngleFromZenithRadians,
        lunarEphemeris.brightLimbAngleFromZenithRadians,
    ]);
    setVector(data, 47, [
        ...lunarEphemeris.sunDirectionInDiscFrame,
        lunarEphemeris.apparentAngularRadiusRadians,
    ]);
    const lunarPhotometry = packLunarPhotometry();
    setVector(data, 48, Array.from(lunarPhotometry.slice(0, 4)));
    setVector(data, 49, Array.from(lunarPhotometry.slice(4, 8)));
    setVector(data, 50, [
        ...moon.diskPhotometry.roloCalibrationRgb,
        moon.diskPhotometry.relativeIrradiance,
    ]);
    setVector(data, 51, [...moon.transmittance, moon.topOfAtmosphereIrradiance]);
    setVector(data, 52, [
        moon.diskPhotometry.illuminatedFraction,
        moon.visible ? 1 : 0,
        moon.radianceContract.phaseApplicationCount,
        moon.earthshineOpacity,
    ]);
    // p[31]/p[32] retain their historical FOV/pitch/mode four-tuples.  The
    // append-only lane carries heading for both temporal camera snapshots so
    // a yaw-only move cannot be mistaken for an immutable capture epoch.
    setVector(data, 53, [
        currentTransportYawRadians,
        previousTransportYawRadians,
        0,
        0,
    ]);
    return data;
};

const extinctionForLayer = (layer: CloudLayerState) => {
    const thicknessKm = Math.max(0.02, layer.thickness / 1000);
    // The UI optical-depth control represents condensed path, while liquid
    // droplets and ice crystals do not convert that path to extinction at the
    // same rate. Thin high ice was previously assigned water-deck extinction,
    // turning cirrus tufts into dark opaque lentils. Deep convective towers
    // retain a liquid-dominated core even when their upper layer is glaciated.
    const effectiveIce = Math.max(0, Math.min(
        1,
        layer.iceFraction * (1 - layer.towerAmount * 0.75),
    ));
    const condensedPathCurve = 18 + (4 - 18) * effectiveIce;
    const targetOpticalDepth =
        layer.opticalDepth * 0.55 +
        layer.opticalDepth ** 2 * condensedPathCurve;
    return targetOpticalDepth / thicknessKm;
};

const CLOUD_GENUS_CODE: Record<CloudLayerState["genus"], number> = {
    clear: 0,
    cirrus: 1,
    cirrocumulus: 2,
    cirrostratus: 3,
    altocumulus: 4,
    altostratus: 5,
    nimbostratus: 6,
    stratocumulus: 7,
    stratus: 8,
    cumulus: 9,
    cumulonimbus: 10,
};

const CLOUD_ORGANIZATION_CODE: Record<
    CloudLayerState["organization"],
    number
> = {
    unorganized: 0,
    isolated: 1,
    streets: 2,
    "open-cell": 3,
    "closed-cell": 4,
    frontal: 5,
    banded: 6,
};

/**
 * Physical horizontal morphology scales for the shared packed basis. The old
 * altitude-tier constants made every low cloud repeat on roughly a 43 km
 * wavelength and its weather envelope on roughly 650 km, so fair cumulus could
 * disappear overhead and survive only at the horizon. These genus-specific
 * values put cellular clouds on kilometre-scale wavelengths while retaining
 * broad coherent sheets for stratiform and fibrous high cloud.
 */
const CLOUD_SPATIAL_SCALES: Record<
    CloudLayerState["genus"],
    readonly [base: number, detail: number, weather: number]
> = {
    clear: [0.5, 1.4, 0.08],
    cirrus: [6, 18, 0.16],
    cirrocumulus: [18, 38, 0.3],
    cirrostratus: [0.38, 1.2, 0.07],
    altocumulus: [14.5, 32, 0.28],
    altostratus: [0.55, 1.8, 0.085],
    nimbostratus: [0.45, 1.5, 0.065],
    stratocumulus: [12, 30, 0.26],
    stratus: [0.7, 2.0, 0.1],
    cumulus: [8.5, 20, 0.3],
    cumulonimbus: [5, 18, 0.14],
};

const createLayerData = (
    scene: SkyRadianceScene["cloudScene"],
    inflatedLayerBounds?: readonly (CloudMorphologyBounds | undefined)[],
) => {
    const data = new Float32Array(21 * 4);
    scene.layers.forEach((layer, index) => {
        const offset = index * 7;
        const [baseScale, detailScale, weatherScale] =
            CLOUD_SPATIAL_SCALES[layer.genus];
        const inflated = inflatedLayerBounds?.[index];
        const physicalBaseKm = layer.baseAltitude / 1000;
        const physicalTopKm = physicalBaseKm + Math.max(0.02, layer.thickness / 1000);
        const baseAltitudeKm = inflated
            ? Math.min(physicalBaseKm, inflated.minimumKm[1]) : physicalBaseKm;
        const topAltitudeKm = inflated
            ? Math.max(physicalTopKm, inflated.maximumKm[1]) : physicalTopKm;
        setVector(data, offset, [
            baseAltitudeKm,
            Math.max(0.02, topAltitudeKm - baseAltitudeKm),
            layer.present ? layer.coverage : 0,
            layer.present ? extinctionForLayer(layer) : 0,
        ]);
        setVector(data, offset + 1, [
            layer.stratusBlend,
            layer.towerAmount,
            layer.anvilAmount,
            layer.detailStrength,
        ]);
        setVector(data, offset + 2, [
            (Math.cos(layer.windDirection) * layer.windSpeed) / 1000,
            (Math.sin(layer.windDirection) * layer.windSpeed) / 1000,
            layer.shear,
            layer.turbulence,
        ]);
        setVector(data, offset + 3, [
            layer.iceFraction,
            layer.precipitation,
            layer.present ? 1 : 0,
            scene.seed[index % scene.seed.length],
        ]);
        setVector(data, offset + 4, [
            baseScale,
            detailScale,
            CLOUD_GENUS_CODE[layer.genus],
            weatherScale,
        ]);
        setVector(data, offset + 5, [
            CLOUD_ORGANIZATION_CODE[layer.organization],
            layer.lifecycle,
            layer.organizationStrength,
            scene.instability,
        ]);
        setVector(data, offset + 6, [
            CLOUD_SPECIES_CODE[layer.species],
            scene.convection,
            scene.humidity,
            layer.oktas,
        ]);
    });
    return data;
};

const morphologyLayerBounds = (
    packed: PackedCloudMorphologyModifiers,
    ownerLayers: readonly number[],
) => {
    const layers: Array<CloudMorphologyBounds | undefined> = [
        undefined, undefined, undefined,
    ];
    for (const [ownerIndex, layerIndex] of ownerLayers.entries()) {
        if (layerIndex < 0 || layerIndex > 2) continue;
        const bounds = packed.inflatedBounds.get(ownerIndex);
        if (!bounds) continue;
        const current = layers[layerIndex];
        layers[layerIndex] = current ? {
            minimumKm: current.minimumKm.map((value, component) =>
                Math.min(value, bounds.minimumKm[component])) as [number, number, number],
            maximumKm: current.maximumKm.map((value, component) =>
                Math.max(value, bounds.maximumKm[component])) as [number, number, number],
        } : bounds;
    }
    return layers;
};

// atlas scale/offset, majorant scale/offset, condensate paths, then the
// guarded authored high-ice source scale/offset pair.  The first five records
// remain byte-for-byte compatible; source metadata is append-only.
const CLOUD_MACRO_BINDING_VEC4_STRIDE = 7;
const CLOUD_MACRO_BINDING_BUFFER_FLOATS =
    (1 + CLOUD_SYSTEM_MAX_COUNT * CLOUD_MACRO_BINDING_VEC4_STRIDE) * 4;

/** Resolve the closest canonical species/lifecycle volume for one owner. */
const selectCloudMacroVolume = (
    system: RuntimeCloudSystem,
    manifest: CloudMacroAtlasManifest,
): CloudMacroVolumeEntry | undefined => {
    const volumeId = selectCloudMacroVolumeId({
        genus: system.state.classification.genus,
        species: system.compiled.recipeId,
        supplementaryFeatures: system.compiled.features.supplementary,
        varieties: system.state.classification.varieties,
        lifecycleStage: system.compiled.lifecycle.stage,
        organizationRegime: system.familyProduction?.organizationRegime,
        placementRegime: system.familyProduction?.lowLayeredDomain?.placement,
        nimbostratusParentTopologyVariantId:
            system.familyProduction?.nimbostratusParentTopologyVariantId,
        // The runtime selects a species-qualified, scene/day-stable topology
        // exemplar.  Owner order is only an allocation detail and otherwise
        // made the same sky jump between unrelated atlas variants whenever a
        // neighbouring system was added or removed.
        deterministicVariant: system.atlasDeterministicVariant,
    });
    return manifest.volumes.find((volume) => volume.id === volumeId);
};

const createCloudLightVolumeMacroSupports = (
    systems: readonly RuntimeCloudSystem[],
    loaded: LoadedCloudMacroAtlas,
) => new Map<number, CloudLightVolumeMacroSupport>(systems.flatMap(
    (system, ownerIndex) => {
        const volume = selectCloudMacroVolume(system, loaded.manifest);
        if (!volume) return [];
        const support = getCloudMacroConservativeSupport(loaded, volume.id);
        return [[ownerIndex, support] as const];
    },
));

const createCloudMacroVolumesByOwner = (
    systems: readonly RuntimeCloudSystem[],
    manifest: CloudMacroAtlasManifest,
) => new Map<number, CloudMacroVolumeEntry>(systems.flatMap(
    (system, ownerIndex) => {
        const volume = selectCloudMacroVolume(system, manifest);
        return volume ? [[ownerIndex, volume] as const] : [];
    },
));

/**
 * Manifest-derived per-owner texture transforms. The shader never assumes an
 * atlas resolution, z stride, or number of species/lifecycle volumes.
 */
const createCloudMacroBindingData = (
    systems: readonly RuntimeCloudSystem[],
    manifest: CloudMacroAtlasManifest,
) => {
    const count = Math.min(CLOUD_SYSTEM_MAX_COUNT, systems.length);
    const data = new Float32Array(CLOUD_MACRO_BINDING_BUFFER_FLOATS);
    const encodedSdfRange = Number(
        manifest.atlas.channels.a.rangeVoxels ?? 12,
    );
    const sdfRangeVoxels = Number.isFinite(encodedSdfRange)
        ? Math.max(1, encodedSdfRange)
        : 12;
    setVector(data, 0, [count, CLOUD_MACRO_BINDING_VEC4_STRIDE,
        manifest.volumes.length, sdfRangeVoxels]);
    for (let index = 0; index < count; index += 1) {
        const volume = selectCloudMacroVolume(systems[index], manifest);
        if (!volume) continue;
        const offset = 1 + index * CLOUD_MACRO_BINDING_VEC4_STRIDE;
        const formationCode =
            CLOUD_MACRO_FORMATION_CODE[volume.formation.mechanism];
        const topologyCode =
            CLOUD_MACRO_TOPOLOGY_CODE[volume.formation.topologyPolicy];
        const densityPaths = [
            volume.statistics.meanDensityPathVertical,
            volume.statistics.meanDensityPathCrosswind,
            volume.statistics.meanDensityPathDownwind,
            volume.statistics.p90DensityPathVertical,
        ] as const;
        if (!Number.isFinite(formationCode) ||
            !Number.isFinite(topologyCode) ||
            densityPaths.some((value) => !Number.isFinite(value))) {
            throw new Error(
                `Cloud macro volume ${volume.id} has a non-finite material ABI`,
            );
        }
        setVector(data, offset, [...volume.sampleTransform.scale, 1]);
        setVector(data, offset + 1, [...volume.sampleTransform.offset, volume.index]);
        setVector(data, offset + 2, [
            ...volume.majorantSampleTransform.scale,
            formationCode,
        ]);
        setVector(data, offset + 3,
            [
                ...volume.majorantSampleTransform.offset,
                topologyCode,
            ]);
        setVector(data, offset + 4, densityPaths);
        const sourceTransform = getCloudHighIceSourceSampleTransform(
            manifest,
            volume.id,
        );
        if (sourceTransform) {
            setVector(data, offset + 5, [...sourceTransform.scale, 1]);
            setVector(data, offset + 6, [...sourceTransform.offset, sourceTransform.slot]);
        } else {
            // w=0 is the source-present sentinel consumed by WGSL.  Keep all
            // xyz values zero as well so an accidental sample cannot address
            // the first source tile when this owner is analytic/non-high-ice.
            setVector(data, offset + 5, [0, 0, 0, 0]);
            setVector(data, offset + 6, [0, 0, 0, 0]);
        }
    }
    return data;
};

/**
 * Persistent mesoscale owners shared by view and light transport.
 *
 * Procedurally looking up an owner grid inside every density query makes the
 * grid itself part of the visible cloud: cirrus repeats as parallel strokes
 * and lenticularis repeats as a field of saucers.  These records instead make
 * each streamer bundle or mountain-wave packet a stable world-space object.
 * Noise is still responsible for the condensate boundary, but it no longer
 * decides where a cloud object starts or ends.
 *
 * Layout is eight vec4s (128 bytes) per feature and intentionally mirrors the
 * WGSL CloudFeature structure.  Twelve slots per meteorological layer keep the
 * shader loop bounded and leave room for sparse, individually varied cirrus.
 */
const CLOUD_FEATURE_SLOTS_PER_LAYER = 12;
const CLOUD_FEATURE_VEC4_STRIDE = 8;
const CLOUD_FEATURE_COUNT = CLOUD_FEATURE_SLOTS_PER_LAYER * 3;

const featureRandom = (seed: number) => {
    let state = (Math.floor(seed * 0x7fffffff) ^ 0x9e3779b9) >>> 0;
    return () => {
        state += 0x6d2b79f5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
    };
};

/**
 * Deprecated camera-authored feature generator retained only as migration
 * reference. Production uses createCloudSystemRuntime(), whose world owners
 * cannot observe the projection or editorial camera regime.
 */
const createCameraAuthoredLegacyCloudFeatureData = (
    radiance: SkyRadianceScene,
    options: SkyRendererOptions,
) => {
    const data = new Float32Array(
        CLOUD_FEATURE_COUNT * CLOUD_FEATURE_VEC4_STRIDE * 4,
    );
    const camera = createPackedCameraState(radiance, 1, 1);
    const regimeScale = options.cloudEditorialRegime === "distant"
        ? 1.55
        : options.cloudEditorialRegime === "nearby"
            ? 0.78
            : options.cloudEditorialRegime === "overhead"
                ? 0.52
                : 1;

    const writeFeature = (
        layerIndex: number,
        slot: number,
        vectors: ReadonlyArray<readonly number[]>,
    ) => {
        const featureOffset =
            (layerIndex * CLOUD_FEATURE_SLOTS_PER_LAYER + slot) *
            CLOUD_FEATURE_VEC4_STRIDE;
        vectors.forEach((vector, vectorIndex) =>
            setVector(data, featureOffset + vectorIndex, vector));
    };

    radiance.cloudScene.layers.forEach((layer, layerIndex) => {
        if (!layer.present || layer.coverage <= 0.001) return;
        const species = CLOUD_SPECIES_CODE[layer.species];
        const isCirrus = layer.genus === "cirrus";
        const isLenticular = species === 9 || species === 24 || species === 28;
        const isConvective = layer.genus === "cumulus" ||
            layer.genus === "cumulonimbus";
        const isVolutus = species === 14 || species === 27;
        const isFractus = species === 16;
        const isCellular = !isLenticular && !isVolutus && (
            layer.genus === "cirrocumulus" ||
            layer.genus === "altocumulus" ||
            layer.genus === "stratocumulus"
        );
        if (!isCirrus && !isLenticular && !isConvective && !isCellular &&
            !isVolutus && !isFractus) return;

        const random = featureRandom(
            radiance.cloudScene.seed[layerIndex] * 9973 +
            radiance.cloudScene.seed[(layerIndex + 1) % 4] * 7919 +
            species * 131 + layerIndex * 17,
        );
        const lowerElevation = Math.max(
            2.5 * Math.PI / 180,
            camera[1] - camera[2] * 0.5,
        );
        const upperElevation = Math.min(
            84 * Math.PI / 180,
            camera[1] + camera[2] * 0.5,
        );
        const frameFraction = layerIndex === 2 ? 0.58 : layerIndex === 1 ? 0.48 : 0.34;
        const targetElevation = lowerElevation +
            (upperElevation - lowerElevation) * frameFraction;
        const targetAltitudeKm =
            (layer.baseAltitude + layer.thickness * (layerIndex === 2 ? 0.34 : 0.24)) /
            1000;
        const visibleRange = Math.min(
            92,
            Math.max(0.3, targetAltitudeKm / Math.max(0.055, Math.tan(targetElevation))),
        ) * regimeScale;
        const cameraHalfFov = Math.max(0.42, camera[0] * 0.5);
        const side = random() < 0.5 ? -1 : 1;
        const primaryAngle = side * cameraHalfFov * (0.18 + random() * 0.34);
        const windAngle = layer.windDirection;

        if (isCirrus) {
            const compact = species === 22 || species === 23;
            const requestedCount = compact
                ? 5 + Math.round(layer.coverage * 6)
                : species === 2
                    ? 5 + Math.round(layer.coverage * 7)
                    : 3 + Math.round(layer.coverage * 7);
            const count = Math.min(CLOUD_FEATURE_SLOTS_PER_LAYER, requestedCount);
            for (let slot = 0; slot < count; slot += 1) {
                const angle = primaryAngle + (random() - 0.5) *
                    cameraHalfFov * (compact ? 1.25 : species === 2 ? 0.98 : 1.75);
                const range = visibleRange * (species === 2
                    ? 0.30 + random() * 0.22
                    : 0.62 + random() * 1.06);
                const centerX = Math.sin(angle) * range + (random() - 0.5) * 2.5;
                const centerZ = Math.cos(angle) * range + (random() - 0.5) * 2.5;
                const axisAngle = windAngle + (random() - 0.5) *
                    (compact ? 1.2 : 0.72);
                let major = compact ? 0.55 + random() * 1.25 : 2.8 + random() * 5.2;
                let minor = compact ? 0.28 + random() * 0.62 : 0.24 + random() * 0.72;
                if (species === 2) {
                    // Uncinus is a compact ice head with a vertically deep
                    // fallstreak, not a long horizontal fibratus ribbon.
                    major *= 0.88 + random() * 0.26;
                    minor *= 2.80;
                }
                // Uncinus generators occupy the upper part of their layer so
                // sedimenting ice has real vertical room to form the visible
                // mare's-tail below the hook.
                const centerHeight = species === 2
                    ? 0.72 + random() * 0.16
                    : 0.38 + random() * 0.32;
                const halfHeight = compact
                    ? 0.13 + random() * 0.16
                    : 0.035 + random() * 0.075;
                const bend = compact
                    ? 0.12 + random() * 0.38
                    : species === 2
                        ? 0.15 + random() * 0.27
                        : 0.22 + random() * 0.50;
                const requestedVerticalDropKm = layer.thickness / 1000 *
                    (species === 2 ? 0.52 + random() * 0.22 : 0.32 + random() * 0.46);
                // Keep the complete fallstreak inside the owning cloud layer.
                // The former uncinus request commonly descended below h=0,
                // so only its horizontal generator head survived transport.
                const verticalDropKm = species === 2
                    ? Math.min(
                        requestedVerticalDropKm,
                        layer.thickness / 1000 * Math.max(0.18, centerHeight - 0.08),
                    )
                    : requestedVerticalDropKm;
                const strandCount = compact
                    ? 1 + Math.floor(random() * 3)
                    : species === 2
                        ? 1 + Math.floor(random() * 2)
                        : 3 + Math.floor(random() * 5);
                const bound = major + Math.max(2, verticalDropKm * 2.2);
                writeFeature(layerIndex, slot, [
                    [1, layerIndex, species, 1],
                    [centerX, centerZ, centerHeight, bound],
                    [Math.cos(axisAngle), Math.sin(axisAngle), major, minor],
                    [centerHeight, halfHeight, bend,
                        species === 2 ? 0.80 + random() * 0.18 : 0.62 + random() * 0.38],
                    [random(), random(), random(), random()],
                    [strandCount, verticalDropKm, 0.55 + random() * 1.05, 0.42 + random() * 0.5],
                    [layer.coverage, layer.lifecycle, layer.turbulence, layer.shear],
                    [0, 0, 0, 0],
                ]);
            }
        } else if (isLenticular) {
            // A real orographic wave contains one stationary primary packet
            // and, sometimes, one or two related downstream packets. It is not
            // a periodic population of independently placed ellipsoids.
            const count = Math.min(2, 1 + Math.round(layer.coverage * 1.5));
            const minimumWaveRange = layerIndex === 2 ? 18 : layerIndex === 1 ? 12 : 6;
            const systemRange = Math.max(
                minimumWaveRange * regimeScale,
                visibleRange * (1.08 + random() * 0.42),
            );
            const primaryMajor = species === 24
                ? 1.0 + random() * 1.4
                : species === 28
                    ? 2.8 + random() * 3.7
                    : 2.2 + random() * 2.6;
            const crossWindAxis = windAngle + Math.PI * 0.5;
            for (let slot = 0; slot < count; slot += 1) {
                const alongTrain = (slot - (count - 1) * 0.5) * (3.4 + random() * 4.8);
                const angle = primaryAngle + (random() - 0.5) * cameraHalfFov * 0.22;
                const centerX = Math.sin(angle) * systemRange + Math.cos(windAngle) * alongTrain;
                const centerZ = Math.cos(angle) * systemRange + Math.sin(windAngle) * alongTrain;
                const physicalMajor = primaryMajor * (slot === 0
                    ? 1
                    : 0.66 + random() * 0.18);
                // Limit projected half-angle as well as physical scale. A
                // nearby packet spanning half the camera reads as an opaque
                // mask even when its kilometre dimensions are meteorological.
                const major = Math.min(physicalMajor, systemRange * 0.16);
                const minor = major * (species === 24
                    ? 0.26 + random() * 0.15
                    : species === 28
                        ? 0.36 + random() * 0.17
                        : 0.30 + random() * 0.17);
                const centerHeight = 0.40 + random() * 0.22;
                const halfHeight = species === 24
                    ? 0.026 + random() * 0.042
                    : species === 28
                        ? 0.072 + random() * 0.078
                        : 0.052 + random() * 0.072;
                const stackCount = slot === 0
                    ? 1 + Math.floor(random() * (species === 24 ? 2 : 3))
                    : 1 + Math.floor(random() * 2);
                writeFeature(layerIndex, slot, [
                    [2, layerIndex, species, 1],
                    [centerX, centerZ, centerHeight, major * 1.75],
                    [Math.cos(crossWindAxis), Math.sin(crossWindAxis), major, minor],
                    [centerHeight, halfHeight, 0.04 + random() * 0.13, 0.68 + random() * 0.3],
                    [random(), random(), random(), random()],
                    [slot, count, layer.coverage, layer.organizationStrength],
                    [layer.lifecycle, layer.turbulence, layer.shear, stackCount],
                    [0, 0, 0, 0],
                ]);
            }
        } else if (isConvective) {
            const storm = layer.genus === "cumulonimbus";
            // A cumulonimbus is an owned storm complex, not a repeated row of
            // towers.  Sparse and ordinary scenes therefore get one dominant
            // storm.  A second, deliberately smaller and more distant cell is
            // admitted only for genuinely extensive convective cover.
            const count = storm
                ? layer.coverage > 0.82 ? 2 : 1
                : species === 19
                    ? Math.min(4, 2 + Math.round(layer.coverage * 2))
                : Math.min(
                    CLOUD_FEATURE_SLOTS_PER_LAYER,
                    3 + Math.round(layer.coverage * 4),
                );
            const congestusPrimaryRadius = species === 19
                ? 1.55 + random() * 0.85
                : 0;
            const congestusPrimaryTop = species === 19
                ? 0.84 + random() * 0.12
                : 0;
            const minimumRange = storm
                ? options.cloudEditorialRegime === "nearby" ||
                    options.cloudEditorialRegime === "overhead" ? 6.5 : 10
                : species === 19 ? 7.5 : species === 18 ? 5.8 : 4.8;
            for (let slot = 0; slot < count; slot += 1) {
                const fieldPosition = count <= 1 ? 0 : slot / (count - 1);
                const stormPrimaryAngle = slot === 0
                    ? primaryAngle * 0.28
                    : -Math.sign(primaryAngle || 1) * cameraHalfFov *
                        (0.48 + random() * 0.18);
                const angle = (storm ? stormPrimaryAngle : primaryAngle) +
                    (fieldPosition - 0.5) * cameraHalfFov * (storm ? 0.24 : 1.62) +
                    (random() - 0.5) * cameraHalfFov * 0.28;
                const stormCentroidAltitude =
                    (layer.baseAltitude + layer.thickness * 0.56) / 1000;
                const stormCentroidRange = Math.min(
                    44,
                    Math.max(22, stormCentroidAltitude /
                        Math.max(0.12, Math.tan(camera[1]))),
                );
                const range = storm
                    ? stormCentroidRange * (0.88 + random() * 0.22) *
                        (slot === 0 ? 1 : 1.35 + random() * 0.28)
                    : species === 19
                        ? Math.max(
                            minimumRange,
                            visibleRange * (slot === 0
                                ? 0.72 + random() * 0.34
                                : 0.94 + random() * 1.10),
                        )
                    : Math.max(
                        minimumRange,
                        visibleRange * (0.72 + random() * 1.48),
                    );
                const centerX = Math.sin(angle) * range;
                const centerZ = Math.cos(angle) * range;
                let radius = storm
                    ? slot === 0
                        ? 2.7 + random() * 1.5
                        : 1.35 + random() * 1.1
                    : 0.34 + random() * 0.62;
                if (species === 17) radius *= 0.72;
                if (species === 18) radius *= 0.92;
                if (species === 19) {
                    radius = slot === 0
                        ? congestusPrimaryRadius
                        : congestusPrimaryRadius * (0.44 + random() * 0.28);
                }
                if (species === 31) radius *= 0.62;
                let top = storm ? 0.9 + random() * 0.08 : 0.38 + random() * 0.42;
                if (species === 17) top = 0.28 + random() * 0.24;
                if (species === 18) top = 0.48 + random() * 0.28;
                if (species === 19) {
                    top = slot === 0
                        ? congestusPrimaryTop
                        : congestusPrimaryTop * (0.58 + random() * 0.26);
                }
                if (species === 31) top = 0.24 + random() * 0.28;
                const axisAngle = windAngle + (random() - 0.5) * 0.22;
                const anvilDownwind = storm && species !== 20
                    ? radius * (1.02 + random() * 0.62)
                    : 0;
                const anvilWidth = storm && species !== 20
                    ? radius * (1.42 + random() * 0.82)
                    : 0;
                const bound = Math.max(
                    radius * 2.2,
                    radius * 0.7 + anvilDownwind + anvilWidth,
                );
                writeFeature(layerIndex, slot, [
                    [3, layerIndex, species, 1],
                    [centerX, centerZ, 0, bound],
                    [Math.cos(axisAngle), Math.sin(axisAngle), radius, top],
                    [top, layer.lifecycle, storm ? 1 : 0,
                        slot === 0 ? 0.82 + random() * 0.18 : 0.36 + random() * 0.24],
                    [random(), random(), random(), random()],
                    [radius * (0.52 + random() * 0.40), anvilDownwind,
                        anvilWidth, layer.thickness / 1000 * (0.072 + random() * 0.052)],
                    [layer.coverage, layer.towerAmount, layer.anvilAmount,
                        layer.organizationStrength],
                    [random(), random(), random(), random()],
                ]);
            }
        } else if (isVolutus) {
            const count = Math.min(2, 1 + Math.round(layer.coverage));
            for (let slot = 0; slot < count; slot += 1) {
                const angle = primaryAngle + (slot - (count - 1) * 0.5) *
                    cameraHalfFov * 0.32;
                const range = Math.max(
                    layerIndex === 1 ? 13 : 7,
                    visibleRange * (1.1 + random() * 0.42),
                );
                const halfLength = (layerIndex === 1 ? 2.6 : 4.2) +
                    random() * (layerIndex === 1 ? 2.2 : 3.0);
                const crossRadius = layer.thickness / 1000 *
                    (0.62 + random() * 0.26);
                const rollAxis = windAngle + Math.PI * 0.5 +
                    (random() - 0.5) * 0.12;
                writeFeature(layerIndex, slot, [
                    [6, layerIndex, species, 1],
                    [Math.sin(angle) * range, Math.cos(angle) * range, 0,
                        halfLength + crossRadius * 2],
                    [Math.cos(rollAxis), Math.sin(rollAxis), halfLength, crossRadius],
                    [0.42 + random() * 0.12, crossRadius * (0.70 + random() * 0.24),
                        0.1 + random() * 0.18, 0.72 + random() * 0.26],
                    [random(), random(), random(), random()],
                    [layer.coverage, layer.turbulence, layer.shear, 0],
                    [0, 0, 0, 0],
                    [0, 0, 0, 0],
                ]);
            }
        } else if (isFractus) {
            const count = Math.min(
                CLOUD_FEATURE_SLOTS_PER_LAYER,
                6 + Math.round(layer.coverage * 6),
            );
            for (let slot = 0; slot < count; slot += 1) {
                const angle = primaryAngle + (random() - 0.5) * cameraHalfFov * 1.72;
                const fragmentMinimumRange =
                    options.cloudEditorialRegime === "nearby" ? 1.35
                        : options.cloudEditorialRegime === "overhead" ? 1.8
                            : options.cloudEditorialRegime === "distant" ? 5.5
                                : 2.4;
                const range = Math.max(
                    fragmentMinimumRange,
                    visibleRange * (0.68 + random() * 1.12),
                );
                // Fractus shreds share the boundary-layer advection direction
                // but are not a regimented street. Modest directional scatter
                // retains the wind-torn reading without random oval patches.
                const axisAngle = windAngle + (random() - 0.5) * 0.42;
                const major = Math.min(
                    0.62 + random() * 1.48,
                    range * 0.24,
                );
                const minor = major * (0.18 + random() * 0.22);
                writeFeature(layerIndex, slot, [
                    [5, layerIndex, species, 1],
                    [Math.sin(angle) * range, Math.cos(angle) * range, 0,
                        major * 1.8],
                    [Math.cos(axisAngle), Math.sin(axisAngle), major, minor],
                    [0.24 + random() * 0.42, 0.08 + random() * 0.10,
                        0.34 + random() * 0.56, 0.62 + random() * 0.32],
                    [random(), random(), random(), random()],
                    [layer.coverage, layer.turbulence, layer.shear, layer.lifecycle],
                    [0, 0, 0, 0],
                    [0, 0, 0, 0],
                ]);
            }
        } else {
                const isStratiformis = species === 4 || species === 8 || species === 13;
                const isCastellanus = species === 5 || species === 10 || species === 29;
                const isFloccus = species === 25 || species === 26 || species === 30;
                // Feature scale follows observed species topology, not just
                // genus altitude. Cc stratiformis gets many minute ripple
                // granules; castellanus owners are wider common-base ribbons;
                // floccus owners are looser groups of detached tufts.
                const genusScale = layer.genus === "cirrocumulus"
                    ? isStratiformis
                        ? { range: 10.5, colony: [1.55, 3.4], element: [0.12, 0.25] }
                        : isCastellanus
                            ? { range: 10.5, colony: [1.5, 3.0], element: [0.15, 0.30] }
                            : { range: 9.8, colony: [1.35, 2.8], element: [0.13, 0.28] }
                    : layer.genus === "altocumulus"
                        ? isCastellanus
                            ? { range: 11.5, colony: [2.2, 4.2], element: [0.34, 0.62] }
                            : isFloccus
                                ? { range: 10.8, colony: [1.7, 3.4], element: [0.30, 0.62] }
                                : { range: 10.5, colony: [1.8, 3.8], element: [0.28, 0.68] }
                    // Stratocumulus is a field of many resolved shallow cells.
                    // Keeping a six-okta field at only 3–4 km made each owner
                    // project as a foreground wall and merged the colonies into
                    // two cropped arches.  A modestly more distant population
                    // with smaller cloudlets preserves world-space parallax
                    // while matching the angular scale of observed marine decks.
                    : isCastellanus
                        ? { range: 8.2, colony: [1.9, 3.6], element: [0.30, 0.58] }
                        : isFloccus
                            ? { range: 7.8, colony: [1.35, 2.8], element: [0.24, 0.52] }
                            : { range: 7.2, colony: [1.45, 3.2], element: [0.24, 0.54] };
            const count = Math.min(
                CLOUD_FEATURE_SLOTS_PER_LAYER,
                isCastellanus
                    ? 4 + Math.round(layer.coverage * 5)
                    : isFloccus
                        ? 5 + Math.round(layer.coverage * 6)
                        : layer.genus === "cirrocumulus"
                            ? 8 + Math.round(layer.coverage * 6)
                            : layer.genus === "stratocumulus"
                                ? 7 + Math.round(layer.coverage * 7)
                                : 6 + Math.round(layer.coverage * 6),
            );
            for (let slot = 0; slot < count; slot += 1) {
                const fieldPosition = count <= 1 ? 0.5 : slot / (count - 1);
                const angle = primaryAngle + (fieldPosition - 0.5) *
                    cameraHalfFov * 1.86 + (random() - 0.5) * cameraHalfFov * 0.26;
                const range = layer.genus === "stratocumulus"
                    ? Math.max(
                        4.2 * regimeScale,
                        visibleRange * (
                            0.58 + (slot % 3) * 0.38 + random() * 0.32
                        ),
                    )
                    : layer.genus === "altocumulus"
                    ? Math.max(
                        genusScale.range * regimeScale,
                        visibleRange * (0.82 + (slot % 3) * 0.18 + random() * 0.28),
                    )
                    : Math.max(
                        genusScale.range * regimeScale,
                        visibleRange * (0.86 + random() * 1.26),
                    );
                const physicalColonyRadius = genusScale.colony[0] + random() *
                    (genusScale.colony[1] - genusScale.colony[0]);
                const colonyRadius = Math.min(
                    physicalColonyRadius,
                    range * (layer.genus === "stratocumulus" ? 0.20 : 0.24),
                );
                const elementRadius = genusScale.element[0] + random() *
                    (genusScale.element[1] - genusScale.element[0]);
                const centerX = Math.sin(angle) * range;
                const centerZ = Math.cos(angle) * range;
                const axisAngle = windAngle + (random() - 0.5) * 0.38;
                const top = isCastellanus
                    ? 0.68 + random() * 0.26
                    : isFloccus
                        ? 0.48 + random() * 0.28
                        : 0.30 + random() * 0.28;
                const memberCount = species === 4
                    ? 9 + Math.floor(random() * 2)
                    : isCastellanus
                        ? 4 + Math.floor(random() * 3)
                        : isFloccus
                            ? 4 + Math.floor(random() * 4)
                            : layer.genus === "stratocumulus"
                                ? 7 + Math.floor(random() * 2)
                                : 5 + Math.floor(random() * 4);
                writeFeature(layerIndex, slot, [
                    [4, layerIndex, species, 1],
                    [centerX, centerZ, 0, colonyRadius + elementRadius * 2.4],
                    [Math.cos(axisAngle), Math.sin(axisAngle), colonyRadius, elementRadius],
                    [top, layer.lifecycle, layer.organizationStrength, 0.68 + random() * 0.32],
                    [random(), random(), random(), random()],
                    [memberCount, layer.coverage,
                        layer.turbulence, layer.shear],
                    [layer.stratusBlend, layer.iceFraction, layer.detailStrength, 0],
                    [random(), random(), random(), random()],
                ]);
            }
        }
    });
    return data;
};

const createCloudHistorySignature = (
    radiance: SkyRadianceScene,
    options: SkyRendererOptions,
) => {
    const scalar = (value: number) => Math.round(value * 10_000) / 10_000;
    return JSON.stringify({
        // Camera yaw is part of the temporal identity. A heading-only move
        // changes world-ray ownership even when all weather records are
        // unchanged, so history must not bridge the two frames blindly.
        cameraYawRadians: scalar(
            cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
        ),
        offset: scalar(radiance.cloudTimeOffset),
        fog: scalar(radiance.cloudScene.fog),
        noctilucent: scalar(radiance.cloudScene.noctilucent),
        seed: radiance.cloudScene.seed.map(scalar),
        composition: options.cloudComposition,
        perspective: options.cloudPerspective,
        editorialRegime: options.cloudEditorialRegime,
        // Source-isolation views change the radiance accumulated by the cloud
        // temporal resolver. Never let a prior lighting partition bleed into
        // the next one; all other views share the unchanged production source.
        lightingDebugPartition:
            options.debugView === "lighting-direct-sun" ||
            options.debugView === "lighting-exterior-diffuse" ||
            options.debugView === "lighting-p1-cache" ||
            options.debugView === "lighting-source-higher-order" ||
            options.debugView === "lighting-atmosphere-shadow-loss"
                ? options.debugView
                : "production",
        lighting: {
            sunDirection: radiance.sunDirection.map(scalar),
            moonDirection: radiance.moonDirection.map(scalar),
            sunToa: radiance.solarTopOfAtmosphereIrradiance.map(scalar),
            moonToa: radiance.moonTopOfAtmosphereIrradiance.map(scalar),
            aerosol: scalar(radiance.aerosol),
            aerosolSize: scalar(radiance.aerosolSize),
            aerosolAbsorption: scalar(radiance.aerosolAbsorption),
            humidity: scalar(radiance.humidity),
            ozone: scalar(radiance.ozone),
            stratosphericAerosol: scalar(radiance.stratosphericAerosol),
            observerAltitude: scalar(radiance.observerAltitude),
            groundAlbedoRgb: resolveGroundAlbedoRgb(
                radiance.groundAlbedo,
                radiance.groundAlbedoRgb,
            ).map(scalar),
        },
        hydrometeors: createHydrometeorSceneOverrideSignature(
            radiance.hydrometeors,
        ),
        lightningGeometry: radiance.weather?.lightning ?? null,
        systems: cloudSystemSceneSignature(radiance.cloudScene),
        layers: radiance.cloudScene.layers.map((layer) => ({
            genus: layer.genus,
            species: layer.species,
            present: layer.present,
            baseAltitude: scalar(layer.baseAltitude),
            thickness: scalar(layer.thickness),
            coverage: scalar(layer.coverage),
            opticalDepth: scalar(layer.opticalDepth),
            stratusBlend: scalar(layer.stratusBlend),
            towerAmount: scalar(layer.towerAmount),
            anvilAmount: scalar(layer.anvilAmount),
            iceFraction: scalar(layer.iceFraction),
            detailStrength: scalar(layer.detailStrength),
            windSpeed: scalar(layer.windSpeed),
            windDirection: scalar(layer.windDirection),
            shear: scalar(layer.shear),
            turbulence: scalar(layer.turbulence),
            precipitation: scalar(layer.precipitation),
            organization: layer.organization,
            lifecycle: scalar(layer.lifecycle),
            organizationStrength: scalar(layer.organizationStrength),
        })),
    });
};

const createBackgroundSignature = (
    radiance: SkyRadianceScene,
    celestial: CelestialScene,
    physicalAtmosphereState: PhysicalAtmosphereState,
    debugView: SkyDebugView,
) => JSON.stringify({
    debugPartition: debugView === "lighting-atmosphere-shadow-loss"
        ? debugView
        : "production",
    physicalAtmosphereState,
    palette: radiance.palette,
    solarAltitude: radiance.solarAltitude,
    nightDepth: radiance.nightDepth,
    nightBlackout: radiance.nightBlackout,
    moonlight: radiance.moonlight,
    aerosol: radiance.aerosol,
    humidity: radiance.humidity,
    optics: [
        radiance.aerosolSize,
        radiance.aerosolAbsorption,
        radiance.ozone,
        radiance.observerAltitude,
    ],
    camera: [
        radiance.viewAzimuth,
        cameraYawRadiansFromViewAzimuth(radiance.viewAzimuth),
        radiance.horizontalFov,
        radiance.cameraProjection,
        radiance.viewElevation,
        radiance.verticalFov,
    ],
    sunDirection: radiance.sunDirection,
    sun: celestial.sun,
    moon: {
        visible: celestial.moon.visible,
        direction: celestial.moon.direction,
        opacity: celestial.moon.opacity,
        fraction: celestial.moon.fraction,
        rotation: celestial.moon.rotation,
        textureRotation: celestial.moon.textureRotation,
        scale: celestial.moon.scale,
        discRadianceScale: celestial.moon.discRadianceScale,
        photoUrl: celestial.moon.photoUrl,
        ephemeris: celestial.moon.ephemeris,
        diskPhotometry: celestial.moon.diskPhotometry,
        radianceContract: celestial.moon.radianceContract,
        transmittance: celestial.moon.transmittance,
    },
    naturalNight: celestial.naturalNight,
    hydrometeors: createHydrometeorSceneOverrideSignature(
        radiance.hydrometeors,
    ),
});

const createStarData = (
    scene: CelestialScene,
    cameraYawRadians: number,
) => {
    const data = new Float32Array(scene.stars.length * 20);
    scene.stars.forEach((star, index) => {
        const offset = index * 20;
        data.set(
            [
                ...rotateDirectionByCameraYaw(star.direction, cameraYawRadians),
                Math.max(1, star.radius * 2.12),
                star.topOfAtmosphereFluxRgb[0] * star.transmittanceRgb[0],
                star.topOfAtmosphereFluxRgb[1] * star.transmittanceRgb[1],
                star.topOfAtmosphereFluxRgb[2] * star.transmittanceRgb[2],
                star.opacity,
                star.scintillation,
                star.phaseOffset,
                star.chromaticScintillation,
                star.detection,
                star.glow,
                star.psfFwhmRadians,
                star.psfBeta,
                star.psfWingFraction,
                star.psfWingScale,
                star.psfSupportRadiusRadians,
                ...star.tipTiltArcseconds,
            ],
            offset,
        );
    });
    return data;
};

const createWebGpuTexture = (
    device: any,
    width: number,
    height: number,
    format: string,
    usage: number,
    depthOrArrayLayers = 1,
) => device.createTexture({
    size: [width, height, depthOrArrayLayers],
    format,
    usage,
});

const transportArrayView = (texture: any) => texture.createView({
    dimension: "2d-array",
    baseArrayLayer: 0,
    arrayLayerCount: 2,
});

const transportLayerView = (texture: any, layer: 0 | 1) =>
    texture.createView({
        dimension: "2d",
        baseArrayLayer: layer,
        arrayLayerCount: 1,
    });

interface OriginalCloudNoiseData {
    base: Uint8Array;
    baseSize: number;
    baseMips: readonly CloudVolumeMipLevel[];
    detail: Uint8Array;
    detailSize: number;
    detailMips: readonly CloudVolumeMipLevel[];
    weather: Uint8Array;
    weatherSize: number;
}

let cloudNoisePromise: Promise<OriginalCloudNoiseData> | undefined;

const encodeUnit = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value * 255)));

/**
 * Builds seamless, original multi-frequency cloud volumes once per page. The
 * immutable density basis is shared by all days; deterministic weather fields,
 * height profiles and advection provide the actual scene variation.
 */
const generateOriginalCloudNoise = (): Promise<OriginalCloudNoiseData> =>
    new Promise((resolve) => {
        const generate = () => {
            const baseSize = 128;
            const detailSize = 64;
            const weatherSize = 256;
            const base = new Uint8Array(baseSize ** 3 * 4);
            const detail = new Uint8Array(detailSize ** 3 * 4);
            const weather = new Uint8Array(weatherSize ** 2 * 4);
            const tau = Math.PI * 2;

            for (let z = 0; z < baseSize; z += 1) {
                const nz = (z / baseSize) * tau;
                for (let y = 0; y < baseSize; y += 1) {
                    const ny = (y / baseSize) * tau;
                    for (let x = 0; x < baseSize; x += 1) {
                        const nx = (x / baseSize) * tau;
                        const offset = ((z * baseSize + y) * baseSize + x) * 4;
                        const broad =
                            0.5 +
                            Math.sin(nx * 3 + ny * 2 + nz) * 0.22 +
                            Math.sin(nx - ny * 3 + nz * 2 + 1.7) * 0.14 +
                            Math.sin(nx * 5 + ny + nz * 4 + 4.1) * 0.08;
                        const cellA = 1 - Math.abs(
                            Math.sin(nx * 7 + ny * 5 + nz * 3 + 0.9) *
                                Math.sin(nx * 3 - ny * 8 + nz * 5 + 2.4),
                        );
                        const cellB = 1 - Math.abs(
                            Math.sin(nx * 13 + ny * 9 - nz * 7 + 1.2) *
                                Math.cos(nx * 5 + ny * 11 + nz * 9),
                        );
                        const edge = 0.5 + Math.sin(nx * 17 - ny * 13 + nz * 11) * 0.5;
                        base[offset] = encodeUnit(broad);
                        base[offset + 1] = encodeUnit(cellA);
                        base[offset + 2] = encodeUnit(cellB);
                        base[offset + 3] = encodeUnit(edge);
                    }
                }
            }

            for (let z = 0; z < detailSize; z += 1) {
                const nz = (z / detailSize) * tau;
                for (let y = 0; y < detailSize; y += 1) {
                    const ny = (y / detailSize) * tau;
                    for (let x = 0; x < detailSize; x += 1) {
                        const nx = (x / detailSize) * tau;
                        const offset = ((z * detailSize + y) * detailSize + x) * 4;
                        const a = 0.5 + Math.sin(nx * 9 + ny * 7 + nz * 11) * 0.5;
                        const b = 0.5 + Math.sin(nx * 15 - ny * 13 + nz * 7 + 1.9) * 0.5;
                        const c = 0.5 + Math.cos(nx * 21 + ny * 17 - nz * 19 + 0.6) * 0.5;
                        const d = 0.5 + Math.sin(nx * 27 - ny * 23 + nz * 29 + 2.7) * 0.5;
                        detail.set(
                            [encodeUnit(a), encodeUnit(b), encodeUnit(c), encodeUnit(d)],
                            offset,
                        );
                    }
                }
            }

            for (let y = 0; y < weatherSize; y += 1) {
                const ny = (y / weatherSize) * tau;
                for (let x = 0; x < weatherSize; x += 1) {
                    const nx = (x / weatherSize) * tau;
                    const offset = (y * weatherSize + x) * 4;
                    const coverage =
                        0.5 +
                        Math.sin(nx * 2 + ny * 3) * 0.24 +
                        Math.sin(nx * 5 - ny * 4 + 2.1) * 0.14 +
                        Math.cos(nx * 9 + ny * 7 + 0.4) * 0.07;
                    const type = 0.5 + Math.sin(nx * 3 - ny * 2 + 1.2) * 0.5;
                    const curlX = 0.5 + Math.sin(nx * 7 + ny * 6) * 0.5;
                    const curlY = 0.5 + Math.cos(nx * 6 - ny * 8 + 0.7) * 0.5;
                    weather.set(
                        [
                            encodeUnit(coverage),
                            encodeUnit(type),
                            encodeUnit(curlX),
                            encodeUnit(curlY),
                        ],
                        offset,
                    );
                }
            }
            resolve({
                base,
                baseSize,
                baseMips: createCloudVolumeAverageMips(base, baseSize),
                detail,
                detailSize,
                detailMips: createCloudVolumeAverageMips(detail, detailSize),
                weather,
                weatherSize,
            });
        };
        if ("requestIdleCallback" in window) {
            window.requestIdleCallback(generate, { timeout: 180 });
        } else {
            setTimeout(generate, 0);
        }
    });

const readNoiseAsset = async (url: string, expectedBytes: number) => {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== expectedBytes) {
        throw new Error(`${url} contains ${bytes.byteLength} bytes; expected ${expectedBytes}`);
    }
    return bytes;
};

const createOriginalCloudNoise = (): Promise<OriginalCloudNoiseData> => {
    cloudNoisePromise ??= (async () => {
        const baseSize = 128;
        const detailSize = 64;
        const weatherSize = 256;
        try {
            const [base, baseMipTail, detail, detailMipTail, weather] =
                await Promise.all([
                readNoiseAsset(
                    "/assets/sky/cloud-base-rgba8-128.bin?v=perlin-worley-2",
                    baseSize ** 3 * 4,
                ),
                readNoiseAsset(
                    "/assets/sky/cloud-base-average-rgba8-mips-64.bin?v=perlin-worley-3",
                    cloudVolumeMipTailByteLength(baseSize),
                ),
                readNoiseAsset(
                    "/assets/sky/cloud-detail-rgba8-64.bin?v=perlin-worley-2",
                    detailSize ** 3 * 4,
                ),
                readNoiseAsset(
                    "/assets/sky/cloud-detail-average-rgba8-mips-32.bin?v=perlin-worley-3",
                    cloudVolumeMipTailByteLength(detailSize),
                ),
                readNoiseAsset(
                    "/assets/sky/cloud-weather-rgba8-256.bin?v=perlin-worley-2",
                    weatherSize ** 2 * 4,
                ),
            ]);
            return {
                base,
                baseSize,
                baseMips: unpackCloudVolumeMipTail(
                    base, baseMipTail, baseSize,
                ),
                detail,
                detailSize,
                detailMips: unpackCloudVolumeMipTail(
                    detail, detailMipTail, detailSize,
                ),
                weather,
                weatherSize,
            };
        } catch (error) {
            // Generating the 128³ basis on the main thread was an emergency
            // prototype path and could itself freeze the machine after an
            // asset failure. Let initialization fail into the proven legacy
            // no-cloud sky instead; production must never synthesize these
            // volumes interactively.
            throw new Error("Precomputed cloud basis unavailable", { cause: error });
        }
    })();
    return cloudNoisePromise;
};

/**
 * Derives low/middle/high synoptic fields from one provenance-safe basis. The
 * common component keeps fronts and broad cover meteorologically correlated;
 * wrapped rotations and offsets prevent vertically separated layers from
 * exposing one duplicated procedural mask.
 */
const createCorrelatedWeatherFields = (source: Uint8Array, size: number) => {
    const sample = (x: number, y: number, channel: number) => {
        const wrappedX = (x + size) % size;
        const wrappedY = (y + size) % size;
        return source[(wrappedY * size + wrappedX) * 4 + channel];
    };
    return [0, 1, 2].map((layerIndex) => {
        if (layerIndex === 0) return source;
        const field = new Uint8Array(source.length);
        const commonWeight = layerIndex === 1 ? 0.7 : 0.56;
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const transformedX = layerIndex === 1
                    ? x + Math.floor(y * 0.125) + 37
                    : size - 1 - y + 19;
                const transformedY = layerIndex === 1
                    ? y + 53
                    : x + 71;
                const target = (y * size + x) * 4;
                for (let channel = 0; channel < 2; channel += 1) {
                    field[target + channel] = Math.round(
                        sample(x, y, channel) * commonWeight +
                        sample(transformedX, transformedY, channel) * (1 - commonWeight),
                    );
                }
                // Curl channels are signed vectors encoded about 127.5. Blend
                // the common flow with a tier-specific rotated component.
                const commonCurlX = sample(x, y, 2) - 127.5;
                const commonCurlY = sample(x, y, 3) - 127.5;
                const transformedCurlX = sample(transformedX, transformedY, 2) - 127.5;
                const transformedCurlY = sample(transformedX, transformedY, 3) - 127.5;
                const rotation = layerIndex === 1 ? 0.34 : -0.52;
                const c = Math.cos(rotation);
                const s = Math.sin(rotation);
                const rotatedX = transformedCurlX * c - transformedCurlY * s;
                const rotatedY = transformedCurlX * s + transformedCurlY * c;
                field[target + 2] = Math.round(Math.min(255, Math.max(0,
                    127.5 + commonCurlX * commonWeight + rotatedX * (1 - commonWeight),
                )));
                field[target + 3] = Math.round(Math.min(255, Math.max(0,
                    127.5 + commonCurlY * commonWeight + rotatedY * (1 - commonWeight),
                )));
            }
        }
        return field;
    });
};

/**
 * Generates a wrap-safe conservative hierarchy for the large-scale weather
 * field. R stores a dilated maximum so a shader lookup can prove an entire
 * neighbourhood empty before paying for procedural and 3D density work. The
 * remaining channels retain locally averaged type/curl data for inspection.
 */
const createConservativeWeatherMips = (source: Uint8Array, sourceSize: number) => {
    const levels = [{ data: source, size: sourceSize }];
    let previous = source;
    let previousSize = sourceSize;
    while (previousSize > 1) {
        const size = Math.max(1, Math.floor(previousSize / 2));
        const data = new Uint8Array(size * size * 4);
        const wrap = (value: number) => (value + previousSize) % previousSize;
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                let maximumCoverage = 0;
                const averages = [0, 0, 0];
                for (let childY = 0; childY < 2; childY += 1) {
                    for (let childX = 0; childX < 2; childX += 1) {
                        const sourceX = wrap(x * 2 + childX);
                        const sourceY = wrap(y * 2 + childY);
                        const offset = (sourceY * previousSize + sourceX) * 4;
                        averages[0] += previous[offset + 1];
                        averages[1] += previous[offset + 2];
                        averages[2] += previous[offset + 3];
                    }
                }
                // Include one child texel of wrapped guard band around the
                // nominal 2x2 footprint. That keeps this value conservative
                // for bilinear level-zero samples crossing a block boundary.
                for (let guardY = -1; guardY <= 2; guardY += 1) {
                    for (let guardX = -1; guardX <= 2; guardX += 1) {
                        const sourceX = wrap(x * 2 + guardX);
                        const sourceY = wrap(y * 2 + guardY);
                        maximumCoverage = Math.max(
                            maximumCoverage,
                            previous[(sourceY * previousSize + sourceX) * 4],
                        );
                    }
                }
                const target = (y * size + x) * 4;
                data[target] = maximumCoverage;
                data[target + 1] = Math.round(averages[0] / 4);
                data[target + 2] = Math.round(averages[1] / 4);
                data[target + 3] = Math.round(averages[2] / 4);
            }
        }
        levels.push({ data, size });
        previous = data;
        previousSize = size;
    }
    return levels;
};

const createAtmosphereTransmittanceLut = (width = 256, height = 64) => {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        const altitudeKm = (y / (height - 1)) * 20;
        const density = Math.exp(-altitudeKm / 8.2);
        for (let x = 0; x < width; x += 1) {
            const elevationSine = -0.1 + (x / (width - 1)) * 1.1;
            const safeElevation = Math.max(0.018, elevationSine);
            const airMass = Math.min(
                40,
                1 /
                    (safeElevation +
                        0.115 * (safeElevation + 0.035) ** -0.55),
            );
            const horizonBlock = elevationSine < -0.015 ? 0.015 : 1;
            const opticalPath = airMass * density;
            const offset = (y * width + x) * 4;
            data[offset] = encodeUnit(Math.exp(-0.072 * opticalPath) * horizonBlock);
            data[offset + 1] = encodeUnit(Math.exp(-0.112 * opticalPath) * horizonBlock);
            data[offset + 2] = encodeUnit(Math.exp(-0.205 * opticalPath) * horizonBlock);
            data[offset + 3] = 255;
        }
    }
    return { data, width, height };
};

const INITIAL_LUNAR_PROFILE_STATE: LoadedLunarProfileState = {
    url: "",
    kind: "analytic-hapke-profile",
    normalizedDiscPlaneIntegralRgb: [0, 0, 0],
    analyticMeanAlbedoRgb: [
        (128 / 255) ** 2.2,
        (128 / 255) ** 2.2,
        (128 / 255) ** 2.2,
    ],
};

/** Decode a lunar asset once, before target radiometry or atmosphere transfer. */
const inspectLoadedLunarProfile = (
    bitmap: ImageBitmap,
    url: string,
    kind: LunarDiscProfileKind,
): LoadedLunarProfileState => {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Unable to inspect lunar profile pixels");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    const stride = Math.max(1, Math.ceil(
        Math.max(bitmap.width, bitmap.height) / 1024,
    ));
    const accumulated: [number, number, number] = [0, 0, 0];
    let accumulatedWeight = 0;
    const nasaTextureRadius = 0.432;
    for (let y = Math.floor(stride / 2); y < bitmap.height; y += stride) {
        for (let x = Math.floor(stride / 2); x < bitmap.width; x += stride) {
            const u = (x + 0.5) / bitmap.width;
            const v = (y + 0.5) / bitmap.height;
            if (kind === "nasa-svs-phase-profile" &&
                Math.hypot(u - 0.5, v - 0.5) > nasaTextureRadius) {
                continue;
            }
            const offset = (y * bitmap.width + x) * 4;
            const alpha = pixels[offset + 3] / 255;
            for (let channel = 0; channel < 3; channel += 1) {
                const encoded = pixels[offset + channel] / 255;
                const decoded = kind === "nasa-svs-phase-profile"
                    ? srgbChannelToLinear(encoded)
                    : Math.max(encoded, 0.004) ** 2.2;
                accumulated[channel] += decoded * alpha;
            }
            accumulatedWeight += alpha;
        }
    }
    if (kind === "nasa-svs-phase-profile") {
        const sampledPixelArea = stride ** 2 / (bitmap.width * bitmap.height);
        return {
            url,
            kind,
            normalizedDiscPlaneIntegralRgb: accumulated.map((channel) =>
                channel * sampledPixelArea / nasaTextureRadius ** 2,
            ) as unknown as AtmosphereVec3,
            analyticMeanAlbedoRgb: INITIAL_LUNAR_PROFILE_STATE
                .analyticMeanAlbedoRgb,
        };
    }
    const denominator = Math.max(1e-8, accumulatedWeight);
    return {
        url,
        kind,
        normalizedDiscPlaneIntegralRgb: [0, 0, 0],
        analyticMeanAlbedoRgb: accumulated.map((channel) =>
            channel / denominator) as unknown as AtmosphereVec3,
    };
};

function WebGpuSkyCanvas({
    radiance,
    celestial,
    physicalAtmosphereState,
    sceneKey,
    paused = false,
    options,
    onStats,
    onFailure,
}: WebGpuCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const propsRef = useRef({
        radiance,
        celestial,
        physicalAtmosphereState,
        sceneKey,
        paused,
        options,
        onStats,
    });
    const redrawRef = useRef<(() => void) | null>(null);
    const wakeRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        propsRef.current = {
            radiance,
            celestial,
            physicalAtmosphereState,
            sceneKey,
            paused,
            options,
            onStats,
        };
        redrawRef.current?.();
        wakeRef.current?.();
    }, [radiance, celestial, physicalAtmosphereState, sceneKey, paused, options, onStats]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        let disposed = false;
        let failureReported = false;
        let cancelTimer: number | undefined;
        let animationFrame: number | undefined;
        const captureInitializationTelemetry =
            new URLSearchParams(window.location.search).get("captureSession") ===
                "persistent";
        const initializationStarted = performance.now();
        let lastCaptureTransportMilestone = -1;
        let lastCaptureLightState = "";
        let lastCaptureLightWorkSignature = "";
        let lastCaptureLightWorkReportMs = -Infinity;
        let captureDrawOrdinal = 0;
        const reportFailure = (message: string) => {
            if (disposed || failureReported) return;
            failureReported = true;
            onFailure(message);
        };

        const initialize = async () => {
            const reportCaptureStage = (stage: string) => {
                if (!captureInitializationTelemetry) return;
                navigator.sendBeacon(
                    "/api/cloud-previews/init-stage",
                    JSON.stringify({
                        stage,
                        sceneKey: propsRef.current.sceneKey ?? "unidentified",
                        elapsedMs: performance.now() - initializationStarted,
                    }),
                );
            };
            const setInitializationStage = (stage: string) => {
                canvas.dataset.cloudRendererInitStage = stage;
                reportCaptureStage(stage);
            };
            const yieldInitializationTask = () => new Promise<void>((resolve) => {
                window.setTimeout(resolve, 0);
            });
            setInitializationStage("request-adapter");
            const gpu = (navigator as Navigator & { gpu?: any }).gpu;
            if (!gpu) throw new Error("WebGPU is unavailable");
            const adapter = await gpu.requestAdapter({ powerPreference: "low-power" });
            if (!adapter) throw new Error("No WebGPU adapter is available");
            const rawAdapterInfo = adapter.info as {
                vendor?: unknown;
                architecture?: unknown;
                device?: unknown;
                description?: unknown;
                isFallbackAdapter?: unknown;
            } | undefined;
            const adapterInfo = rawAdapterInfo
                ? {
                      vendor: typeof rawAdapterInfo.vendor === "string"
                          ? rawAdapterInfo.vendor
                          : undefined,
                      architecture: typeof rawAdapterInfo.architecture === "string"
                          ? rawAdapterInfo.architecture
                          : undefined,
                      device: typeof rawAdapterInfo.device === "string"
                          ? rawAdapterInfo.device
                          : undefined,
                      description: typeof rawAdapterInfo.description === "string"
                          ? rawAdapterInfo.description
                          : undefined,
                      isFallbackAdapter: typeof rawAdapterInfo.isFallbackAdapter === "boolean"
                          ? rawAdapterInfo.isFallbackAdapter
                          : undefined,
                  }
                : undefined;
            const supportsTimestamps = adapter.features?.has?.("timestamp-query") === true;
            setInitializationStage("request-device");
            const device = await adapter.requestDevice({
                requiredFeatures: supportsTimestamps ? ["timestamp-query"] : [],
            });
            if (disposed) {
                device.destroy();
                return;
            }
            const context = canvas.getContext("webgpu") as any;
            if (!context) throw new Error("Unable to create a WebGPU canvas context");
            const presentationFormat = gpu.getPreferredCanvasFormat();
            context.configure({
                device,
                format: presentationFormat,
                alphaMode: "opaque",
                colorSpace: "srgb",
            });

            const BUFFER = (globalThis as any).GPUBufferUsage;
            const TEXTURE = (globalThis as any).GPUTextureUsage;
            const SHADER = (globalThis as any).GPUShaderStage;
            if (!BUFFER || !TEXTURE || !SHADER) {
                throw new Error("WebGPU constants are unavailable");
            }
            const MAP_MODE = (globalThis as any).GPUMapMode;
            const initialRadiance = propsRef.current.radiance;
            const initialCloudRuntime = createCloudRuntimeForRadiance(
                initialRadiance,
            );

            const uncapturedErrorHandler = (event: Event & { error?: { message?: string } }) => {
                const message = event.error?.message || "Uncaptured WebGPU validation error";
                reportFailure(message);
            };
            device.addEventListener?.("uncapturederror", uncapturedErrorHandler);

            const parameterBuffer = device.createBuffer({
                size: 54 * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const directionalCloudVisibilityUniformBuffer = device.createBuffer({
                label: "directional cloud receiver-depth visibility uniforms",
                size: DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES,
                usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
            });
            const directionalCloudVisibilityOwnerMaskBuffer = device.createBuffer({
                label: "directional cloud finite-owner slab masks",
                size: DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            // Every multi-frame light solve reads one immutable cloud-time and
            // camera snapshot. The live render parameters continue advancing
            // independently without quilting multiple advection states into a
            // generation.
            const cloudLightParameterSnapshotBuffer = device.createBuffer({
                label: "cloud light-volume immutable parameter snapshot",
                size: 54 * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const layerBuffer = device.createBuffer({
                size: 21 * 4 * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudFeatureBuffer = device.createBuffer({
                size: CLOUD_FEATURE_COUNT * CLOUD_FEATURE_VEC4_STRIDE * 4 *
                    Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            // Packed physical systems are already production data. The current
            // WGSL still reads the compatibility CloudFeature projection at
            // binding 15; shader migration only needs to bind this buffer and
            // consume the documented sixteen-vec4 record ABI.
            const cloudSystemBuffer = device.createBuffer({
                size: CLOUD_SYSTEM_BUFFER_FLOATS * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudMacroBindingBuffer = device.createBuffer({
                size: CLOUD_MACRO_BINDING_BUFFER_FLOATS * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudOpticsOwnerBuffer = device.createBuffer({
                size: CLOUD_OPTICS_OWNER_BUFFER_FLOATS * Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const hydrometeorBuffer = device.createBuffer({
                size: (HYDROMETEOR_HEADER_VEC4S +
                    HYDROMETEOR_MAX_FIELDS * HYDROMETEOR_VEC4_STRIDE) * 4 *
                    Float32Array.BYTES_PER_ELEMENT,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const weatherSceneUniformBuffer = device.createBuffer({
                label: "finite optical and electrical weather scene",
                size: WEATHER_SCENE_UNIFORM_BYTES,
                usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
            });
            const cloudLightPlan = createCloudLightVolumePlan();
            if (!cloudLightPlan.validation.valid) {
                throw new Error(`Cloud light-volume plan is invalid: ${
                    cloudLightPlan.validation.reasons.join(", ")}`);
            }
            const cloudLightUniformBuffers = Array.from(
                { length: CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW },
                (_, index) => device.createBuffer({
                    label: `cloud light-volume compute uniforms ${index}`,
                    size: 64,
                    usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
                }),
            );
            const cloudLightBrickBuffer = device.createBuffer({
                label: "cloud light-volume compute bricks",
                size: CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks *
                    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS * 4,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudLightSourceBuffer = device.createBuffer({
                label: "cloud light-volume source records",
                size: CLOUD_LIGHT_VOLUME_SOURCE_COUNT *
                    CLOUD_LIGHT_VOLUME_SOURCE_STRIDE_FLOATS * 4,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudLightBoundaryBuffer = device.createBuffer({
                label: "cloud light-volume projected boundary",
                size: CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks *
                    CLOUD_LIGHT_VOLUME_FACE_COUNT * 16,
                usage: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const cloudLightViewUniformBuffer = device.createBuffer({
                label: "cloud light-volume fixed view records",
                size: 32 + CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks *
                    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS * 4,
                usage: BUFFER.UNIFORM | BUFFER.COPY_DST,
            });
            const cloudLightResidualStatusBuffer = device.createBuffer({
                label: "cloud light-volume normalized residual status",
                size: 80,
                usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST,
            });
            const cloudLightResidualReadBuffer = device.createBuffer({
                label: "cloud light-volume residual readback",
                size: 80,
                usage: BUFFER.MAP_READ | BUFFER.COPY_DST,
            });
            const cornerData = new Float32Array([
                -1, -1, 1, -1, -1, 1,
                -1, 1, 1, -1, 1, 1,
            ]);
            const cornerBuffer = device.createBuffer({
                size: cornerData.byteLength,
                usage: BUFFER.VERTEX | BUFFER.COPY_DST,
            });
            device.queue.writeBuffer(cornerBuffer, 0, cornerData);
            let starBuffer = device.createBuffer({
                size: 80,
                usage: BUFFER.VERTEX | BUFFER.COPY_DST,
            });
            let starCapacity = 1;

            setInitializationStage("shader-modules-core");
            const atmosphereModule = device.createShaderModule({ code: WEBGPU_ATMOSPHERE_SHADER });
            const cloudIntervalModule = device.createShaderModule({
                code: WEBGPU_CLOUD_INTERVAL_SHADER,
            });
            const cloudModule = device.createShaderModule({
                code: WEBGPU_CLOUD_COUPLING_SHADER,
            });
            const cloudLayerModule = device.createShaderModule({
                code: WEBGPU_CLOUD_LAYER_SHADER,
            });
            const cloudLayerCompositorModule = device.createShaderModule({
                code: WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER,
            });
            await yieldInitializationTask();
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("shader-module-cloud-light-source");
            const cloudLightSourceModule = device.createShaderModule({
                code: WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER,
            });
            await yieldInitializationTask();
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("shader-module-cloud-light-fibratus-source");
            const cloudLightFibratusSourceModule = device.createShaderModule({
                code: WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER,
            });
            await yieldInitializationTask();
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("shader-module-cloud-light-direct");
            const cloudLightDirectModule = device.createShaderModule({
                code: WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER,
            });
            await yieldInitializationTask();
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("shader-modules-diagnostics-and-celestial");
            const cloudMetricsModule = device.createShaderModule({
                code: WEBGPU_CLOUD_METRICS_SHADER,
            });
            const cloudReconstructionMetricsModule = device.createShaderModule({
                code: WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER,
            });
            const starModule = device.createShaderModule({ code: WEBGPU_STAR_SHADER });
            const stellarGlowModule = device.createShaderModule({
                code: WEBGPU_STELLAR_GLOW_SHADER,
            });
            const moonModule = device.createShaderModule({ code: WEBGPU_MOON_SHADER });
            const compositeModule = device.createShaderModule({ code: WEBGPU_COMPOSITE_SHADER });

            // Keep the directional-coupling compute ABI application-owned. An
            // auto layout changes whenever WGSL dead-code elimination changes,
            // which previously let this bind group retain six dead resources
            // and fail before the first cloud transport packet. This exact,
            // active-only layout is mirrored by the browser validator.
            const cloudCouplingComputeVisibility = SHADER.COMPUTE;
            const cloudCouplingShadowBindGroupLayout =
                device.createBindGroupLayout({
                    label: "directional cloud coupling active resource layout",
                    entries: [
                        {
                            binding: 0,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: { type: "read-only-storage" },
                        },
                        {
                            binding: 1,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize: 21 * 4 * Float32Array.BYTES_PER_ELEMENT,
                            },
                        },
                        {
                            binding: 2,
                            visibility: cloudCouplingComputeVisibility,
                            texture: { sampleType: "float", viewDimension: "3d" },
                        },
                        {
                            binding: 3,
                            visibility: cloudCouplingComputeVisibility,
                            texture: { sampleType: "float", viewDimension: "3d" },
                        },
                        {
                            binding: 5,
                            visibility: cloudCouplingComputeVisibility,
                            sampler: { type: "filtering" },
                        },
                        {
                            binding: 16,
                            visibility: cloudCouplingComputeVisibility,
                            texture: { sampleType: "float", viewDimension: "3d" },
                        },
                        {
                            binding: 17,
                            visibility: cloudCouplingComputeVisibility,
                            texture: {
                                sampleType: "unfilterable-float",
                                viewDimension: "3d",
                            },
                        },
                        {
                            binding: 18,
                            visibility: cloudCouplingComputeVisibility,
                            sampler: { type: "filtering" },
                        },
                        {
                            binding: 32,
                            visibility: cloudCouplingComputeVisibility,
                            texture: { sampleType: "float", viewDimension: "3d" },
                        },
                        {
                            binding: 19,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize: CLOUD_SYSTEM_BUFFER_FLOATS *
                                    Float32Array.BYTES_PER_ELEMENT,
                            },
                        },
                        {
                            binding: 20,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize: CLOUD_MACRO_BINDING_BUFFER_FLOATS *
                                    Float32Array.BYTES_PER_ELEMENT,
                            },
                        },
                        {
                            binding: 23,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize: CLOUD_OPTICS_PARAMETER_BUFFER_BYTES,
                            },
                        },
                        {
                            binding: 24,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize: CLOUD_OPTICS_OWNER_BUFFER_FLOATS *
                                    Float32Array.BYTES_PER_ELEMENT,
                            },
                        },
                        {
                            binding: 25,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: { type: "uniform", minBindingSize: 256 },
                        },
                        {
                            binding: 30,
                            visibility: cloudCouplingComputeVisibility,
                            texture: {
                                sampleType: "unfilterable-float",
                                viewDimension: "2d",
                            },
                        },
                        {
                            binding: 31,
                            visibility: cloudCouplingComputeVisibility,
                            storageTexture: {
                                access: "write-only",
                                format: "rgba16float",
                                viewDimension: "2d-array",
                            },
                        },
                        {
                            binding: 34,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "uniform",
                                minBindingSize:
                                    DIRECTIONAL_CLOUD_VISIBILITY_UNIFORM_BYTES,
                            },
                        },
                        {
                            binding: 36,
                            visibility: cloudCouplingComputeVisibility,
                            buffer: {
                                type: "read-only-storage",
                                minBindingSize:
                                    DIRECTIONAL_CLOUD_VISIBILITY_OWNER_MASK_BYTES,
                            },
                        },
                    ],
                });
            const cloudCouplingShadowPipelineLayout = device.createPipelineLayout({
                label: "directional cloud coupling active pipeline layout",
                bindGroupLayouts: [cloudCouplingShadowBindGroupLayout],
            });

            setInitializationStage("pipeline-atmosphere");
            const atmospherePipeline = await device.createRenderPipelineAsync({
                layout: "auto",
                vertex: { module: atmosphereModule, entryPoint: "fullscreen_vertex" },
                fragment: {
                    module: atmosphereModule,
                    entryPoint: "atmosphere_fragment",
                    targets: [{ format: "rgba16float" }],
                },
                primitive: { topology: "triangle-list" },
            });
            setInitializationStage("pipeline-cloud-interval");
            const cloudIntervalPipeline = await device.createRenderPipelineAsync({
                layout: "auto",
                vertex: {
                    module: cloudIntervalModule,
                    entryPoint: "fullscreen_vertex",
                },
                fragment: {
                    module: cloudIntervalModule,
                    entryPoint: "cloud_interval_fragment",
                    targets: [
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                    ],
                },
                primitive: { topology: "triangle-list" },
            });
            setInitializationStage("pipeline-cloud-coupling-shadow");
            const cloudCouplingShadowPipeline = await device.createComputePipelineAsync({
                label: "cloud directional-coupling shadow pipeline",
                layout: cloudCouplingShadowPipelineLayout,
                compute: {
                    module: cloudModule,
                    entryPoint: "cloud_coupling_shadow_compute",
                },
            });
            const createCloudLightPipeline = (
                module: any,
                entryPoint: string,
                label: string,
            ) =>
                device.createComputePipelineAsync({
                    label,
                    layout: "auto",
                    compute: { module, entryPoint },
                });
            const compileCloudLightPipelineFamily = async (
                family: string,
                module: any,
                descriptors: readonly (readonly [string, string])[],
            ) => {
                const pipelines: any[] = [];
                for (const [entryPoint, label] of descriptors) {
                    setInitializationStage(
                        `pipeline-cloud-light-${family}-${entryPoint}`,
                    );
                    await yieldInitializationTask();
                    pipelines.push(await createCloudLightPipeline(
                        module,
                        entryPoint,
                        label,
                    ));
                }
                return pipelines;
            };
            // Direct-only high-cloud scenes need two exact source fields, two
            // Beer scans, and one packed-partition vacuum clear. They never
            // compile boundary materialization or the seven-pipeline P1
            // hierarchy unless a resolved light-volume generation proves that
            // an entire layer is resident.
            const exactSourcePipelineDescriptors = [
                ["cloud_lv_materialize_source_0_compute",
                    "cloud light-volume resident/exact Sun-aligned material"],
                ["cloud_lv_materialize_source_1_compute",
                    "cloud light-volume resident/exact Moon-aligned material"],
            ] as const;
            const directPipelineDescriptors = [
                ["cloud_lv_direct_source_0_compute",
                    "cloud light-volume Sun Beer prefix scan"],
                ["cloud_lv_direct_source_1_compute",
                    "cloud light-volume Moon Beer prefix scan"],
                ["cloud_lv_clear_fluence_compute",
                    "cloud light-volume fluence clear"],
            ] as const;
            const p1ExactPipelineDescriptors = [
                ["cloud_lv_project_boundary_compute",
                    "cloud light-volume 17-lobe boundary projection"],
                ["cloud_lv_materialize_medium_compute",
                    "cloud light-volume exact level-one owner material"],
                ["cloud_lv_materialize_medium_fine_compute",
                    "cloud light-volume fail-closed exact fine owner material"],
            ] as const;
            const p1MinimalPipelineDescriptors = [
                ["cloud_lv_prolongate_medium_compute",
                    "cloud light-volume conservative fine material reconstruction"],
                ["cloud_lv_restrict_medium_compute",
                    "cloud light-volume conservative medium restriction"],
                ["cloud_lv_smooth_compute",
                    "cloud light-volume multigrid smoother"],
                ["cloud_lv_restrict_residual_compute",
                    "cloud light-volume signed residual restriction"],
                ["cloud_lv_prolongate_compute",
                    "cloud light-volume signed correction prolongation"],
                ["cloud_lv_copy_fluence_compute",
                    "cloud light-volume correction publication copy"],
                ["cloud_lv_measure_residual_compute",
                    "cloud light-volume normalized equation residual"],
            ] as const;
            const exactSourcePipelines = await compileCloudLightPipelineFamily(
                "exact-source",
                cloudLightSourceModule,
                exactSourcePipelineDescriptors,
            );
            const fibratusSourcePipelines =
                await compileCloudLightPipelineFamily(
                    "fibratus-source",
                    cloudLightFibratusSourceModule,
                    exactSourcePipelineDescriptors,
                );
            const directPipelines = await compileCloudLightPipelineFamily(
                "direct",
                cloudLightDirectModule,
                directPipelineDescriptors,
            );
            const [cloudLightSourceMaterializeSunPipeline,
                cloudLightSourceMaterializeMoonPipeline] = exactSourcePipelines;
            const [cloudLightFibratusSourceMaterializeSunPipeline,
                cloudLightFibratusSourceMaterializeMoonPipeline] =
                fibratusSourcePipelines;
            const [cloudLightDirectSunPipeline,
                cloudLightDirectMoonPipeline,
                cloudLightClearPipeline] = directPipelines;
            let cloudLightBoundaryPipeline: any = null;
            let cloudLightMaterialPipeline: any = null;
            let cloudLightMaterialFinePipeline: any = null;
            let cloudLightProlongateMediumPipeline: any = null;
            let cloudLightRestrictMediumPipeline: any = null;
            let cloudLightSmoothPipeline: any = null;
            let cloudLightRestrictResidualPipeline: any = null;
            let cloudLightProlongatePipeline: any = null;
            let cloudLightCopyPipeline: any = null;
            let cloudLightMeasureResidualPipeline: any = null;
            let cloudLightP1PipelinePromise: Promise<void> | null = null;
            const ensureCloudLightP1Pipelines = () => {
                if (cloudLightMeasureResidualPipeline) return Promise.resolve();
                cloudLightP1PipelinePromise ??= (async () => {
                    setInitializationStage("shader-module-cloud-light-resident");
                    await yieldInitializationTask();
                    const residentModule = device.createShaderModule({
                        code: WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER,
                    });
                    setInitializationStage("shader-module-cloud-light-p1");
                    await yieldInitializationTask();
                    const p1Module = device.createShaderModule({
                        code: WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER,
                    });
                    const exactPipelines = await compileCloudLightPipelineFamily(
                        "p1-exact",
                        residentModule,
                        p1ExactPipelineDescriptors,
                    );
                    const minimalPipelines = await compileCloudLightPipelineFamily(
                        "p1-minimal",
                        p1Module,
                        p1MinimalPipelineDescriptors,
                    );
                    [cloudLightBoundaryPipeline, cloudLightMaterialPipeline,
                        cloudLightMaterialFinePipeline] = exactPipelines;
                    [cloudLightProlongateMediumPipeline,
                        cloudLightRestrictMediumPipeline,
                        cloudLightSmoothPipeline,
                        cloudLightRestrictResidualPipeline,
                        cloudLightProlongatePipeline,
                        cloudLightCopyPipeline,
                        cloudLightMeasureResidualPipeline] = minimalPipelines;
                })().finally(() => {
                    cloudLightP1PipelinePromise = null;
                });
                return cloudLightP1PipelinePromise;
            };
            let cloudLightLightningPipeline: any = null;
            let cloudLightLightningPipelinePromise: Promise<void> | null = null;
            const ensureCloudLightLightningPipeline = () => {
                if (cloudLightLightningPipeline) return Promise.resolve();
                cloudLightLightningPipelinePromise ??= (async () => {
                    setInitializationStage("shader-module-cloud-light-lightning");
                    await yieldInitializationTask();
                    const lightningModule = device.createShaderModule({
                        code: WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER,
                    });
                    [cloudLightLightningPipeline] =
                        await compileCloudLightPipelineFamily(
                            "lightning",
                            lightningModule,
                            [["cloud_lv_materialize_lightning_transfer_compute",
                                "cloud light-volume finite lightning transfer"]],
                        );
                })().finally(() => {
                    cloudLightLightningPipelinePromise = null;
                });
                return cloudLightLightningPipelinePromise;
            };
            setInitializationStage("pipelines-cloud-physical-layer-transport");
            const cloudTransportFragment = SHADER.FRAGMENT;
            const cloudTransportReadOnlyStorage = {
                visibility: cloudTransportFragment,
                buffer: { type: "read-only-storage" },
            };
            const cloudTransportUniform = {
                visibility: cloudTransportFragment,
                buffer: { type: "uniform" },
            };
            const cloudTransportSampled2d = {
                visibility: cloudTransportFragment,
                texture: { sampleType: "float", viewDimension: "2d" },
            };
            const cloudTransportUnfilterable2d = {
                visibility: cloudTransportFragment,
                texture: {
                    sampleType: "unfilterable-float",
                    viewDimension: "2d",
                },
            };
            const cloudTransportSampled2dArray = {
                visibility: cloudTransportFragment,
                texture: { sampleType: "float", viewDimension: "2d-array" },
            };
            const cloudTransportSampled3d = {
                visibility: cloudTransportFragment,
                texture: { sampleType: "float", viewDimension: "3d" },
            };
            const cloudTransportFilteringSampler = {
                visibility: cloudTransportFragment,
                sampler: { type: "filtering" },
            };
            const cloudTransportEntry = (binding: number, descriptor: any) => ({
                binding,
                ...descriptor,
            });
            // Bind-group layouts returned by an auto-layout pipeline are
            // pipeline-exclusive in WebGPU and cannot legally be donated to a
            // new pipeline layout. All three cloud specializations and both
            // finite-weather graphs therefore share these application-owned
            // layouts and one explicit pipeline layout.
            const cloudTransportGroup0Layout = device.createBindGroupLayout({
                label: "shared cloud and finite-weather transport group 0",
                entries: [
                    cloudTransportEntry(0, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(1, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(2, cloudTransportSampled3d),
                    cloudTransportEntry(3, cloudTransportSampled3d),
                    cloudTransportEntry(4, cloudTransportSampled2dArray),
                    cloudTransportEntry(5, cloudTransportFilteringSampler),
                    cloudTransportEntry(6, cloudTransportSampled2d),
                    cloudTransportEntry(7, cloudTransportSampled2d),
                    cloudTransportEntry(8, cloudTransportSampled2d),
                    cloudTransportEntry(9, cloudTransportSampled2d),
                    cloudTransportEntry(14, cloudTransportSampled2dArray),
                    cloudTransportEntry(15, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(16, cloudTransportSampled3d),
                    cloudTransportEntry(17, cloudTransportSampled3d),
                    cloudTransportEntry(18, cloudTransportFilteringSampler),
                    cloudTransportEntry(32, cloudTransportSampled3d),
                    cloudTransportEntry(19, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(20, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(21, cloudTransportSampled2d),
                    cloudTransportEntry(22, cloudTransportFilteringSampler),
                    cloudTransportEntry(23, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(24, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(25, cloudTransportUniform),
                    cloudTransportEntry(26, cloudTransportSampled2d),
                    cloudTransportEntry(28, cloudTransportFilteringSampler),
                    cloudTransportEntry(29, cloudTransportReadOnlyStorage),
                    cloudTransportEntry(30, cloudTransportUnfilterable2d),
                    cloudTransportEntry(34, cloudTransportUniform),
                    cloudTransportEntry(35, cloudTransportUniform),
                ],
            });
            const cloudTransportGroup1Layout = device.createBindGroupLayout({
                label: "shared cloud and finite-weather light-volume group 1",
                entries: [
                    cloudTransportEntry(0, cloudTransportUniform),
                    cloudTransportEntry(1, cloudTransportSampled3d),
                    cloudTransportEntry(2, cloudTransportSampled3d),
                ],
            });
            const cloudTransportPipelineLayout = device.createPipelineLayout({
                label: "shared cloud and finite-weather transport layout",
                bindGroupLayouts: [
                    cloudTransportGroup0Layout,
                    cloudTransportGroup1Layout,
                ],
            });
            setInitializationStage("pipeline-cloud-physical-layer-transport");
            const cloudLayerPipeline = await device.createRenderPipelineAsync({
                label: "physical cloud layer transport",
                layout: cloudTransportPipelineLayout,
                vertex: {
                    module: cloudLayerModule,
                    entryPoint: "fullscreen_vertex",
                },
                fragment: {
                    module: cloudLayerModule,
                    entryPoint: "cloud_fragment_physical_layer",
                    targets: [
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                    ],
                },
                primitive: { topology: "triangle-list" },
            });
            const createSpecializedWeatherPipeline = (
                module: any,
                entryPoint: string,
                label: string,
            ) => device.createRenderPipelineAsync({
                label,
                layout: cloudTransportPipelineLayout,
                vertex: { module, entryPoint: "fullscreen_vertex" },
                fragment: {
                    module,
                    entryPoint,
                    targets: [
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                    ],
                },
                primitive: { topology: "triangle-list" },
            });
            let hydrometeorLayerPipeline: any = null;
            let hydrometeorLayerPipelinePromise: Promise<void> | null = null;
            const ensureHydrometeorLayerPipeline = () => {
                if (hydrometeorLayerPipeline) return Promise.resolve();
                hydrometeorLayerPipelinePromise ??= (async () => {
                    setInitializationStage("shader-module-hydrometeor-transport");
                    await yieldInitializationTask();
                    const module = device.createShaderModule({
                        code: WEBGPU_HYDROMETEOR_LAYER_SHADER,
                    });
                    setInitializationStage("pipeline-hydrometeor-transport");
                    hydrometeorLayerPipeline =
                        await createSpecializedWeatherPipeline(
                            module,
                            "hydrometeor_fragment_physical",
                            "physical hydrometeor transport",
                        );
                })().finally(() => {
                    hydrometeorLayerPipelinePromise = null;
                });
                return hydrometeorLayerPipelinePromise;
            };
            let upperAtmosphereLayerPipeline: any = null;
            let upperAtmosphereLayerPipelinePromise: Promise<void> | null = null;
            const ensureUpperAtmosphereLayerPipeline = () => {
                if (upperAtmosphereLayerPipeline) return Promise.resolve();
                upperAtmosphereLayerPipelinePromise ??= (async () => {
                    setInitializationStage(
                        "shader-module-upper-atmosphere-transport",
                    );
                    await yieldInitializationTask();
                    const module = device.createShaderModule({
                        code: WEBGPU_UPPER_ATMOSPHERE_LAYER_SHADER,
                    });
                    setInitializationStage("pipeline-upper-atmosphere-transport");
                    upperAtmosphereLayerPipeline =
                        await createSpecializedWeatherPipeline(
                            module,
                            "upper_atmosphere_fragment_physical",
                            "physical upper-atmosphere transport",
                        );
                })().finally(() => {
                    upperAtmosphereLayerPipelinePromise = null;
                });
                return upperAtmosphereLayerPipelinePromise;
            };
            if (requiresHydrometeorTransport(
                initialRadiance,
                initialCloudRuntime.systems,
            )) {
                await ensureHydrometeorLayerPipeline();
            }
            if (requiresUpperAtmosphereTransport(initialRadiance)) {
                await ensureUpperAtmosphereLayerPipeline();
            }
            let runtimePipelineCompilationPending = false;
            const waitForRuntimePipelines = (promises: readonly Promise<void>[]) => {
                if (runtimePipelineCompilationPending || promises.length === 0) {
                    return;
                }
                runtimePipelineCompilationPending = true;
                void Promise.all(promises).then(() => {
                    runtimePipelineCompilationPending = false;
                    if (disposed) return;
                    setInitializationStage("runtime-ready");
                    backgroundDirty = true;
                    draw(performance.now(), true);
                    schedule();
                }).catch((error) => {
                    runtimePipelineCompilationPending = false;
                    reportFailure(error instanceof Error
                        ? error.message : String(error));
                });
            };
            setInitializationStage("pipeline-cloud-layer-compositor");
            const cloudLayerCompositorPipeline =
                await device.createRenderPipelineAsync({
                    label: "physical cloud layer compositor",
                    layout: "auto",
                    vertex: {
                        module: cloudLayerCompositorModule,
                        entryPoint: "fullscreen_vertex",
                    },
                    fragment: {
                        module: cloudLayerCompositorModule,
                        entryPoint: "cloud_layer_composite_fragment",
                        targets: [
                            { format: "rgba16float" },
                            { format: "rgba16float" },
                            { format: "rgba16float" },
                            { format: "rgba16float" },
                        ],
                    },
                    primitive: { topology: "triangle-list" },
                });
            setInitializationStage("pipeline-cloud-metrics");
            const cloudMetricsPipeline = await device.createComputePipelineAsync({
                layout: "auto",
                compute: {
                    module: cloudMetricsModule,
                    entryPoint: "cloud_metrics_compute",
                },
            });
            setInitializationStage("pipeline-cloud-reconstruction-metrics");
            const cloudReconstructionMetricsPipeline =
                await device.createComputePipelineAsync({
                    layout: "auto",
                    compute: {
                        module: cloudReconstructionMetricsModule,
                        entryPoint: "cloud_reconstruction_metrics_compute",
                    },
                });
            setInitializationStage("pipeline-stars");
            const starPipeline = await device.createRenderPipelineAsync({
                layout: "auto",
                vertex: {
                    module: starModule,
                    entryPoint: "star_vertex",
                    buffers: [
                        {
                            arrayStride: 8,
                            stepMode: "vertex",
                            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
                        },
                        {
                            arrayStride: 80,
                            stepMode: "instance",
                            attributes: [
                                { shaderLocation: 1, offset: 0, format: "float32x3" },
                                { shaderLocation: 2, offset: 12, format: "float32" },
                                { shaderLocation: 3, offset: 16, format: "float32x3" },
                                { shaderLocation: 4, offset: 28, format: "float32" },
                                { shaderLocation: 5, offset: 32, format: "float32" },
                                { shaderLocation: 6, offset: 36, format: "float32" },
                                { shaderLocation: 7, offset: 40, format: "float32" },
                                { shaderLocation: 8, offset: 44, format: "float32" },
                                { shaderLocation: 9, offset: 48, format: "float32" },
                                { shaderLocation: 10, offset: 52, format: "float32" },
                                { shaderLocation: 11, offset: 56, format: "float32" },
                                { shaderLocation: 12, offset: 60, format: "float32" },
                                { shaderLocation: 13, offset: 64, format: "float32" },
                                { shaderLocation: 14, offset: 68, format: "float32" },
                                { shaderLocation: 15, offset: 72, format: "float32x2" },
                            ],
                        },
                    ],
                },
                fragment: {
                    module: starModule,
                    entryPoint: "star_fragment",
                    targets: [{
                        format: "rgba16float",
                        blend: {
                            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
                            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
                        },
                    }],
                },
                primitive: { topology: "triangle-list" },
            });
            const stellarGlowPipeline = async (entryPoint: string) =>
                device.createRenderPipelineAsync({
                    layout: "auto",
                    vertex: {
                        module: stellarGlowModule,
                        entryPoint: "fullscreen_vertex",
                    },
                    fragment: {
                        module: stellarGlowModule,
                        entryPoint,
                        targets: [{ format: "rgba16float" }],
                    },
                    primitive: { topology: "triangle-list" },
                });
            const [glowExtractPipeline, glowDownsamplePipeline,
                glowBlurHPipeline, glowBlurVPipeline] = await Promise.all([
                stellarGlowPipeline("glow_extract_fragment"),
                stellarGlowPipeline("glow_downsample_fragment"),
                stellarGlowPipeline("glow_blur_h_fragment"),
                stellarGlowPipeline("glow_blur_v_fragment"),
            ]);
            setInitializationStage("pipeline-moon");
            const moonPipeline = await device.createRenderPipelineAsync({
                layout: "auto",
                vertex: {
                    module: moonModule,
                    entryPoint: "moon_vertex",
                    buffers: [{
                        arrayStride: 8,
                        attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
                    }],
                },
                fragment: {
                    module: moonModule,
                    entryPoint: "moon_fragment",
                    targets: [{
                        format: "rgba16float",
                        blend: {
                            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
                            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
                        },
                    }],
                },
                primitive: { topology: "triangle-list" },
            });
            setInitializationStage("pipeline-composite");
            const compositePipeline = await device.createRenderPipelineAsync({
                layout: "auto",
                vertex: { module: compositeModule, entryPoint: "fullscreen_vertex" },
                fragment: {
                    module: compositeModule,
                    entryPoint: "composite_fragment",
                    targets: [
                        { format: presentationFormat },
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                        { format: "rgba16float" },
                    ],
                },
                primitive: { topology: "triangle-list" },
            });
            setInitializationStage("allocate-runtime-resources");

            const cloudTimestampQuery = supportsTimestamps
                ? device.createQuerySet({ type: "timestamp", count: 4 })
                : undefined;
            const cloudTimestampResolve = supportsTimestamps
                ? device.createBuffer({
                      size: 32,
                      usage: BUFFER.QUERY_RESOLVE | BUFFER.COPY_SRC,
                  })
                : undefined;
            const cloudTimestampRead = supportsTimestamps
                ? device.createBuffer({
                      size: 32,
                      usage: BUFFER.COPY_DST | BUFFER.MAP_READ,
                  })
                : undefined;
            const coldCloudTimestampResolve = supportsTimestamps
                ? device.createBuffer({
                      size: 32,
                      usage: BUFFER.QUERY_RESOLVE | BUFFER.COPY_SRC,
                  })
                : undefined;
            const coldCloudTimestampRead = supportsTimestamps
                ? device.createBuffer({
                      size: 32,
                      usage: BUFFER.COPY_DST | BUFFER.MAP_READ,
                  })
                : undefined;
            const cloudMetricsBuffer = device.createBuffer({
                size: 32,
                usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST,
            });
            const cloudMetricsRead = device.createBuffer({
                size: 32,
                usage: BUFFER.COPY_DST | BUFFER.MAP_READ,
            });
            const cloudReconstructionMetricsBuffer = device.createBuffer({
                label: "cloud reconstruction numerical diagnostics",
                size: 80,
                usage: BUFFER.STORAGE | BUFFER.COPY_SRC | BUFFER.COPY_DST,
            });
            const cloudReconstructionMetricsRead = device.createBuffer({
                label: "cloud reconstruction diagnostic readback",
                size: 80,
                usage: BUFFER.COPY_DST | BUFFER.MAP_READ,
            });

            const sampler = device.createSampler({
                magFilter: "linear",
                minFilter: "linear",
                addressModeU: "repeat",
                addressModeV: "clamp-to-edge",
            });
            const volumeSampler = device.createSampler({
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "linear",
                addressModeU: "repeat",
                addressModeV: "repeat",
                addressModeW: "repeat",
            });
            const initialAtmosphereFrame = createPhysicalAtmosphereFrame(
                propsRef.current.radiance,
                propsRef.current.celestial,
                propsRef.current.physicalAtmosphereState,
            );
            const [cloudNoise, loadedCloudMacroAtlas, loadedCloudOptics,
                loadedCloudMorphology, physicalAtmosphere] = await Promise.all([
                createOriginalCloudNoise(),
                loadCloudMacroAtlas(),
                loadCloudOptics(),
                loadCloudMorphologyModifierManifest(),
                createPhysicalAtmosphereGpuResources(
                    device,
                    initialAtmosphereFrame.state,
                    initialAtmosphereFrame.lighting,
                    {
                        texture: TEXTURE.TEXTURE_BINDING | TEXTURE.STORAGE_BINDING,
                        buffer: BUFFER.COPY_DST | BUFFER.UNIFORM,
                    },
                ),
            ]);
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("resolve-cloud-light-pipeline-families");
            const initialPackedMorphology = packCloudMorphologyModifiers(
                loadedCloudMorphology,
                initialCloudRuntime.morphologyRequests,
            );
            const initialCloudLightRuntime = createCloudLightVolumeRuntime({
                systems: initialCloudRuntime.systems,
                sources: createCloudLightVolumeSources(initialRadiance),
                morphologyBoundsByOwner: initialPackedMorphology.inflatedBounds,
                macroSupportByOwner: createCloudLightVolumeMacroSupports(
                    initialCloudRuntime.systems,
                    loadedCloudMacroAtlas,
                ),
                lightingSignature:
                    createCloudLightVolumeLightingSignature(initialRadiance),
            });
            if (initialCloudLightRuntime.residentLayerMask !== 0) {
                await ensureCloudLightP1Pipelines();
            }
            if (initialRadiance.weather?.lightning) {
                await ensureCloudLightLightningPipeline();
            }
            if (disposed) {
                device.destroy();
                return;
            }
            setInitializationStage("upload-runtime-resources");
            const cloudMacroAtlas = uploadCloudMacroAtlas(
                device,
                loadedCloudMacroAtlas,
                TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
            );
            const cloudOptics = uploadCloudOptics(device, loadedCloudOptics, {
                texture: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
                buffer: BUFFER.STORAGE | BUFFER.COPY_DST,
            });
            const morphologyTextureHeight = Math.max(1, Math.ceil(
                (CLOUD_MORPHOLOGY_HEADER_TEXELS +
                    CLOUD_MORPHOLOGY_MAX_RECORDS * CLOUD_MORPHOLOGY_RECORD_TEXELS) /
                    CLOUD_MORPHOLOGY_TEXTURE_WIDTH,
            ));
            const cloudMorphologyTexture = device.createTexture({
                label: "cloud morphology modifier records",
                size: [CLOUD_MORPHOLOGY_TEXTURE_WIDTH, morphologyTextureHeight],
                format: "rgba32float",
                usage: TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST,
            });
            const cloudMorphologyView = cloudMorphologyTexture.createView();
            const cloudMacroSampler = device.createSampler({
                magFilter: "linear",
                minFilter: "linear",
                addressModeU: "clamp-to-edge",
                addressModeV: "clamp-to-edge",
                addressModeW: "clamp-to-edge",
            });
            const blueNoiseSize = 64;
            let blueNoiseData: Uint8Array;
            try {
                blueNoiseData = await readNoiseAsset(
                    "/assets/sky/blue-noise-r8-64.bin",
                    blueNoiseSize ** 2,
                );
            } catch (error) {
                console.warn("Blue-noise asset unavailable; using deterministic fallback", error);
                blueNoiseData = new Uint8Array(blueNoiseSize ** 2);
                for (let index = 0; index < blueNoiseData.length; index += 1) {
                    let value = Math.imul(index + 1, 0x9e3779b1);
                    value ^= value >>> 16;
                    blueNoiseData[index] = value & 255;
                }
            }
            const noiseUsage = TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST;
            const baseVolume = device.createTexture({
                size: [cloudNoise.baseSize, cloudNoise.baseSize, cloudNoise.baseSize],
                dimension: "3d",
                format: "rgba8unorm",
                mipLevelCount: cloudNoise.baseMips.length,
                usage: noiseUsage,
            });
            const detailVolume = device.createTexture({
                size: [cloudNoise.detailSize, cloudNoise.detailSize, cloudNoise.detailSize],
                dimension: "3d",
                format: "rgba8unorm",
                mipLevelCount: cloudNoise.detailMips.length,
                usage: noiseUsage,
            });
            const weatherFields = createCorrelatedWeatherFields(
                cloudNoise.weather,
                cloudNoise.weatherSize,
            );
            const weatherMipChains = weatherFields.map((field) =>
                createConservativeWeatherMips(field, cloudNoise.weatherSize));
            const weatherTexture = device.createTexture({
                size: [cloudNoise.weatherSize, cloudNoise.weatherSize, weatherFields.length],
                format: "rgba8unorm",
                mipLevelCount: weatherMipChains[0].length,
                usage: noiseUsage,
            });
            cloudNoise.baseMips.forEach((level, mipLevel) => {
                device.queue.writeTexture(
                    { texture: baseVolume, mipLevel },
                    level.data,
                    { bytesPerRow: level.size * 4, rowsPerImage: level.size },
                    [level.size, level.size, level.size],
                );
            });
            cloudNoise.detailMips.forEach((level, mipLevel) => {
                device.queue.writeTexture(
                    { texture: detailVolume, mipLevel },
                    level.data,
                    { bytesPerRow: level.size * 4, rowsPerImage: level.size },
                    [level.size, level.size, level.size],
                );
            });
            weatherMipChains.forEach((mips, arrayLayer) => {
                mips.forEach((level, mipLevel) => {
                    device.queue.writeTexture(
                        { texture: weatherTexture, mipLevel, origin: [0, 0, arrayLayer] },
                        level.data,
                        { bytesPerRow: level.size * 4 },
                        [level.size, level.size, 1],
                    );
                });
            });
            const blueNoiseTexture = device.createTexture({
                size: [blueNoiseSize, blueNoiseSize],
                format: "r8unorm",
                usage: noiseUsage,
            });
            device.queue.writeTexture(
                { texture: blueNoiseTexture },
                blueNoiseData,
                { bytesPerRow: blueNoiseSize },
                [blueNoiseSize, blueNoiseSize],
            );
            const [cloudLightWidth, cloudLightHeight, cloudLightAtlasDepth] =
                cloudLightPlan.atlasDimensions;
            const cloudLightTextureUsage = TEXTURE.TEXTURE_BINDING |
                TEXTURE.STORAGE_BINDING | TEXTURE.COPY_SRC | TEXTURE.COPY_DST;
            const createCloudLightTexture = (label: string, depth: number) =>
                device.createTexture({
                    label,
                    size: [cloudLightWidth, cloudLightHeight, depth],
                    mipLevelCount:
                        CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.multigridLevels,
                    dimension: "3d",
                    format: "rgba16float",
                    usage: cloudLightTextureUsage,
                });
            // Six RGBA16F objects: exact extinction/scattering, independent
            // Sun/Moon Beer fields (whose coarse mips also carry signed RHS),
            // one source-material/multigrid scratch field, and a double-bank
            // packed view atlas.
            const cloudLightMediumExtinction = createCloudLightTexture(
                "cloud light-volume spectral extinction", cloudLightAtlasDepth);
            const cloudLightMediumScattering = createCloudLightTexture(
                "cloud light-volume spectral scattering", cloudLightAtlasDepth);
            const cloudLightDirectSun = createCloudLightTexture(
                "cloud light-volume Sun transmittance", cloudLightAtlasDepth);
            const cloudLightDirectMoon = createCloudLightTexture(
                "cloud light-volume Moon transmittance", cloudLightAtlasDepth);
            const cloudLightLightning = createCloudLightTexture(
                "cloud light-volume double-bank coarse lightning transfer",
                cloudLightAtlasDepth * 2);
            const cloudLightFluenceScratch = createCloudLightTexture(
                "cloud light-volume source material and multigrid scratch",
                cloudLightAtlasDepth);
            const cloudLightPackedView = createCloudLightTexture(
                "cloud light-volume atomic double-bank packed view atlas",
                cloudLightAtlasDepth * 6);
            const lunarSampler = device.createSampler({
                magFilter: "linear",
                minFilter: "linear",
                mipmapFilter: "linear",
                addressModeU: "clamp-to-edge",
                addressModeV: "clamp-to-edge",
            });
            let lunarTexture = createWebGpuTexture(
                device,
                1,
                1,
                "rgba8unorm",
                TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
            );
            device.queue.writeTexture(
                { texture: lunarTexture },
                new Uint8Array([128, 128, 128, 255]),
                {},
                [1, 1],
            );
            let requestedMoonUrl = "";
            let moonLoadGeneration = 0;
            let loadedLunarProfile = INITIAL_LUNAR_PROFILE_STATE;
            let backgroundDirty = true;
            let glowAvailable = false;
            let glowNeedsClear = true;
            let lastGlowUpdate = -Infinity;

            const loadMoon = async (
                url: string,
                kind: LunarDiscProfileKind,
            ) => {
                const generation = ++moonLoadGeneration;
                try {
                    const response = await fetch(url);
                    if (!response.ok) throw new Error(`Moon texture HTTP ${response.status}`);
                    const bitmap = await createImageBitmap(await response.blob(), {
                        colorSpaceConversion: "none",
                    });
                    if (disposed || generation !== moonLoadGeneration) {
                        bitmap.close();
                        return;
                    }
                    const inspectedProfile = inspectLoadedLunarProfile(
                        bitmap,
                        url,
                        kind,
                    );
                    const next = createWebGpuTexture(
                        device,
                        bitmap.width,
                        bitmap.height,
                        "rgba8unorm",
                        TEXTURE.TEXTURE_BINDING | TEXTURE.COPY_DST | TEXTURE.RENDER_ATTACHMENT,
                    );
                    device.queue.copyExternalImageToTexture(
                        { source: bitmap },
                        { texture: next },
                        [bitmap.width, bitmap.height],
                    );
                    bitmap.close();
                    lunarTexture.destroy();
                    lunarTexture = next;
                    loadedLunarProfile = inspectedProfile;
                    backgroundDirty = true;
                    redrawRef.current?.();
                } catch (error) {
                    console.warn("Lunar texture unavailable", error);
                }
            };

            let width = 0;
            let height = 0;
            let cloudWidth = 0;
            let cloudHeight = 0;
            let cloudSamplingDecision: SkyCloudSamplingDecision =
                resolveSkyCloudSampling({
                    quality: propsRef.current.options.quality,
                    resolutionScale: propsRef.current.options.resolutionScale,
                    cloudScene: propsRef.current.radiance.cloudScene,
                    sceneKey: propsRef.current.sceneKey ?? "",
                });
            let cloudSamplingSignature = "";
            let backgroundTexture: any;
            let cloudCurrent: any;
            let cloudPrevious: any;
            let geometryCurrent: any;
            let geometryPrevious: any;
            let motionCurrent: any;
            let motionPrevious: any;
            let temporalCurrent: any;
            let temporalPrevious: any;
            let resolvedCloudCurrent: any;
            let resolvedCloudPrevious: any;
            let intervalLowMiddle: any;
            let intervalHighMask: any;
            let cloudLayerRadianceFirstDepth: any;
            let cloudLayerTransmittanceMeanDepth: any;
            let cloudLayerMotionSteps: any;
            let strictCloudTransportTransaction:
                StrictCloudTransportTransaction | null = null;
            let strictCloudTransportSerial = 0;
            let strictCloudTransportSubmissionPending = false;
            let strictCloudTransportContinuationTimer: number | undefined;
            let starTexture: any;
            let glowHalfA: any;
            let glowHalfB: any;
            let glowQuarterA: any;
            let glowQuarterB: any;
            let glowEighthA: any;
            let glowEighthB: any;
            let frame = 0;
            let transportUpdates = 0;
            let activeViewSteps = 0;
            let activeLightSteps = 0;
            let activeTransportIndex = 0;
            let activeInterleavedTransport = false;
            let lastCloudUpdate = -Infinity;
            let lastCloudSystemSignature = "";
            let activeCloudOpticsOwnerSelections:
                readonly CloudOpticsOwnerSelection[] = [];
            let lastCloudMorphologySignature = "";
            let activeMorphologyLayerBounds: Array<CloudMorphologyBounds | undefined> = [
                undefined, undefined, undefined,
            ];
            let activeMorphologyOwnerBounds: ReadonlyMap<number, CloudMorphologyBounds> =
                new Map();
            let activePackedMorphology: PackedCloudMorphologyModifiers | null = null;
            let lastHydrometeorSignature = "";
            let lastComposite = -Infinity;
            let historyValid = false;
            let temporalNeedsClear = true;
            let currentTransportCamera = createPackedCameraState(
                propsRef.current.radiance, 1, 1,
            );
            let previousTransportCamera = currentTransportCamera;
            let currentTransportYawRadians = cameraYawRadiansFromViewAzimuth(
                propsRef.current.radiance.viewAzimuth,
            );
            let previousTransportYawRadians = currentTransportYawRadians;
            let activeTransportDeltaSeconds = 0;
            let previousTransportCloudClock = Number.NaN;
            let cloudHistorySignature = createCloudHistorySignature(
                propsRef.current.radiance,
                propsRef.current.options,
            );
            let activeSceneKey = propsRef.current.sceneKey ?? "";
            let backgroundSignature = createBackgroundSignature(
                propsRef.current.radiance,
                propsRef.current.celestial,
                propsRef.current.physicalAtmosphereState,
                propsRef.current.options.debugView,
            );
            let uploadedStars: CelestialScene | null = null;
            let uploadedStarsYaw = Number.NaN;
            let starCount = 0;
            let startTime = performance.now() / 1000;
            const initialCloudTime = propsRef.current.radiance.cloudTime % 10_000;
            let lastCloudGpuMs: number | null = null;
            let lastCloudIntervalMs: number | null = null;
            let lastCloudLightingMs: number | null = null;
            let lastCloudTransportMs: number | null = null;
            let cloudUpdateP50Ms: number | null = null;
            let cloudUpdateP95Ms: number | null = null;
            let cloudUpdateMaxMs: number | null = null;
            const cloudGpuSamples: number[] = [];
            let cloudUnsafeSampleCount = 0;
            let lastCompositeCpuMs: number | null = null;
            let timestampReadPending = false;
            let coldTimestampReadPending = false;
            let metricsReadPending = false;
            let reconstructionMetricsReadPending = false;
            let projectedOpacity: number | null = null;
            let occupiedSkyFraction: number | null = null;
            let acceptedIntervalFraction: number | null = null;
            let meanEvaluatedStepFraction: number | null = null;
            let coldCloudWarmupMs: number | null = null;
            let coldCloudWarmupQueueMs: number | null = null;
            let firstCloudUpdateMs: number | null = null;
            let firstCloudIntervalMs: number | null = null;
            let firstCloudLightingMs: number | null = null;
            let firstCloudTransportMs: number | null = null;
            let coldLightingWarmupComplete = false;
            let coldLightingWarmupPending = false;
            let cloudTargetsNeedClear = true;
            let couplingShadowsInitialized = false;
            let directionalCloudVisibilitySignature = "";
            let directionalCloudVisibilityGeneration = 0;
            let cloudLightSignature = "";
            let cloudLightStructuralKey = "";
            let cloudLightAdvectionEpoch = -1;
            let cloudLightPackedBricks = new Float32Array(
                CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks *
                    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS,
            );
            let cloudLightViewPackedBricks = new Float32Array(
                CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG.maxBricks *
                    CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS,
            );
            let cloudLightBrickKeys: readonly string[] = [];
            let cloudLightBrickCount = 0;
            let cloudLightReadyMask = 0;
            let cloudLightActiveBank = 0;
            let cloudLightTargetBank = 1;
            let cloudLightTargetResidentLayerMask = 0;
            let cloudLightActiveResidentLayerMask = 0;
            let cloudLightTargetResidentOwnerMask: CloudLightVolumeOwnerMask =
                [0, 0];
            let cloudLightActiveResidentOwnerMask: CloudLightVolumeOwnerMask =
                [0, 0];
            let cloudLightMaximumResidual: number | null = null;
            let cloudLightResidualNonFiniteCount = 0;
            let cloudLightResidualEnergyViolationCount = 0;
            let cloudLightResidualOccupiedCount = 0;
            let cloudLightMaximumFluence = [0, 0, 0];
            let cloudLightMaximumNumerator = [0, 0, 0];
            let cloudLightMaximumDenominator = [0, 0, 0];
            let cloudLightMaximumBoundary = [0, 0, 0];
            let cloudLightMaximumCandidate = [0, 0, 0];
            let cloudLightNearStorageRailCount = 0;
            let cloudTransportNonFiniteCount: number | null = null;
            let cloudRadianceNonFiniteCount: number | null = null;
            let cloudMaximumTransmittanceChroma: number | null = null;
            let rawRadianceTemporalDelta: number | null = null;
            let rawTransmittanceTemporalDelta: number | null = null;
            let resolvedRadianceTemporalDelta: number | null = null;
            let rawResolvedRadianceResidual: number | null = null;
            let historyAcceptanceFraction: number | null = null;
            let stableHistoryAge: number | null = null;
            let persistentHistoryConfidence: number | null = null;
            let rawRadianceSpatialVariation: number | null = null;
            let resolvedRadianceSpatialVariation: number | null = null;
            let finalOutputAdjacentVariation: number | null = null;
            let finalOutputScaleSeparatedVariation: number | null = null;
            let firstDepthTemporalDelta: number | null = null;
            let meanDepthTemporalDelta: number | null = null;
            let opticalDepthTemporalDelta: number | null = null;
            let reconstructionRawNonFiniteCount: number | null = null;
            let reconstructionResolvedNonFiniteCount: number | null = null;
            let cloudLightResidualReadPending = false;
            let cloudLightResidualFailure = "";
            let cloudLightRefreshWork: CloudLightVolumeRefreshWork | null = null;
            let cloudLightExactSubmissionSerial = 0;
            let cloudLightExactSubmissionPendingSerial: number | null = null;
            let cloudLightTargetGeneration = 0;
            let cloudLightBoundGeneration = 0;
            let cloudLightLastTransportCompletedGeneration = 0;
            let cloudLightTransportCompletionPendingGeneration: number | null =
                null;
            let cloudLightActiveSourceMask = 0;
            let cloudLightHasLightning = false;
            let cloudLightFibratusSourceOwnerIndices: ReadonlySet<number> =
                new Set();
            let cloudLightSourceBricks: readonly CloudLightVolumeBrick[] = [];
            let cloudLightFibratusSourceContexts: ReadonlyMap<number, {
                densityAtWorld: ReturnType<
                    typeof createCloudFibratusAtlasDensitySampler>;
                extinctionRgbPerKm: readonly [number, number, number];
            }> = new Map();
            let cloudLightFibratusSourceStagingBuffers: any[] = [];
            let cloudLightState: "empty" | "warming" | "complete" | "failed" =
                "empty";
            const exposeCloudLightState = () => {
                canvas.dataset.cloudLightVolumeState = cloudLightState;
                canvas.dataset.cloudLightVolumeGeneration =
                    String(cloudLightBoundGeneration);
                canvas.dataset.cloudLightVolumeTargetGeneration =
                    String(cloudLightTargetGeneration);
                canvas.dataset.cloudLightVolumeTransportedGeneration =
                    String(cloudLightLastTransportCompletedGeneration);
                canvas.dataset.cloudLightVolumePhase =
                    cloudLightRefreshWork?.phase ?? "idle";
                canvas.dataset.cloudLightVolumeWorkBrick =
                    String(cloudLightRefreshWork?.brickIndex ?? -1);
                canvas.dataset.cloudLightVolumeWorkSlab =
                    String(cloudLightRefreshWork?.slabStart ?? -1);
                canvas.dataset.cloudLightVolumeWorkCycle =
                    String(cloudLightRefreshWork?.cycle ?? 0);
                canvas.dataset.cloudLightVolumeExactPending =
                    String(cloudLightExactSubmissionPendingSerial !== null);
                canvas.dataset.cloudLightVolumeSelectedBricks =
                    String(cloudLightBrickCount);
                canvas.dataset.cloudLightVolumeReadyBricks = String(
                    cloudLightReadyMask.toString(2).replaceAll("0", "").length,
                );
                canvas.dataset.cloudLightVolumeActiveBank =
                    String(cloudLightActiveBank);
                canvas.dataset.cloudLightVolumeResidentLayerMask =
                    String(cloudLightActiveResidentLayerMask);
                canvas.dataset.cloudLightVolumeResidentOwnerMask =
                    cloudLightActiveResidentOwnerMask.join(",");
                canvas.dataset.cloudLightVolumeFibratusSourceOwners =
                    [...cloudLightFibratusSourceOwnerIndices].join(",");
                canvas.dataset.cloudLightVolumeFibratusSourceMode =
                    cloudLightFibratusSourceOwnerIndices.size > 0
                        ? "cpu-finite-volume" : "gpu-exact";
                canvas.dataset.cloudLightVolumeResidual =
                    cloudLightMaximumResidual?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudLightVolumeResidualTolerance =
                    String(cloudLightPlan.config.residualTolerance);
                canvas.dataset.cloudLightVolumeResidualNonFiniteCount =
                    String(cloudLightResidualNonFiniteCount);
                canvas.dataset.cloudLightVolumeResidualEnergyViolationCount =
                    String(cloudLightResidualEnergyViolationCount);
                canvas.dataset.cloudLightVolumeResidualOccupiedCount =
                    String(cloudLightResidualOccupiedCount);
                canvas.dataset.cloudLightVolumeMaximumFluence =
                    cloudLightMaximumFluence.map((value) =>
                        value.toPrecision(6)).join(",");
                canvas.dataset.cloudLightVolumeMaximumNumerator =
                    cloudLightMaximumNumerator.map((value) =>
                        value.toPrecision(6)).join(",");
                canvas.dataset.cloudLightVolumeMaximumDenominator =
                    cloudLightMaximumDenominator.map((value) =>
                        value.toPrecision(6)).join(",");
                canvas.dataset.cloudLightVolumeMaximumBoundary =
                    cloudLightMaximumBoundary.map((value) =>
                        value.toPrecision(6)).join(",");
                canvas.dataset.cloudLightVolumeMaximumCandidate =
                    cloudLightMaximumCandidate.map((value) =>
                        value.toPrecision(6)).join(",");
                canvas.dataset.cloudLightVolumeNearStorageRailCount =
                    String(cloudLightNearStorageRailCount);
                canvas.dataset.cloudTransportNonFiniteCount =
                    cloudTransportNonFiniteCount === null
                        ? "unavailable" : String(cloudTransportNonFiniteCount);
                canvas.dataset.cloudRadianceNonFiniteCount =
                    cloudRadianceNonFiniteCount === null
                        ? "unavailable" : String(cloudRadianceNonFiniteCount);
                canvas.dataset.cloudMaximumTransmittanceChroma =
                    cloudMaximumTransmittanceChroma?.toPrecision(6) ??
                        "unavailable";
                canvas.dataset.cloudRawRadianceTemporalDelta =
                    rawRadianceTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudRawTransmittanceTemporalDelta =
                    rawTransmittanceTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudResolvedRadianceTemporalDelta =
                    resolvedRadianceTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudRawResolvedRadianceResidual =
                    rawResolvedRadianceResidual?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudHistoryAcceptanceFraction =
                    historyAcceptanceFraction?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudStableHistoryAge =
                    stableHistoryAge?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudPersistentHistoryConfidence =
                    persistentHistoryConfidence?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudRawRadianceSpatialVariation =
                    rawRadianceSpatialVariation?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudResolvedRadianceSpatialVariation =
                    resolvedRadianceSpatialVariation?.toPrecision(6) ??
                        "unavailable";
                canvas.dataset.cloudFinalOutputAdjacentVariation =
                    finalOutputAdjacentVariation?.toPrecision(6) ??
                        "unavailable";
                canvas.dataset.cloudFinalOutputScaleSeparatedVariation =
                    finalOutputScaleSeparatedVariation?.toPrecision(6) ??
                        "unavailable";
                canvas.dataset.cloudFirstDepthTemporalDelta =
                    firstDepthTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudMeanDepthTemporalDelta =
                    meanDepthTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudOpticalDepthTemporalDelta =
                    opticalDepthTemporalDelta?.toPrecision(6) ?? "unavailable";
                canvas.dataset.cloudReconstructionRawNonFiniteCount =
                    reconstructionRawNonFiniteCount === null
                        ? "unavailable" : String(reconstructionRawNonFiniteCount);
                canvas.dataset.cloudReconstructionResolvedNonFiniteCount =
                    reconstructionResolvedNonFiniteCount === null
                        ? "unavailable" : String(
                            reconstructionResolvedNonFiniteCount);
                canvas.dataset.cloudLightVolumeResidualFailure =
                    cloudLightResidualFailure || "none";
                canvas.dataset.cloudLightVolumeExactSerial =
                    String(cloudLightExactSubmissionPendingSerial ?? 0);
                canvas.dataset.cloudLightVolumeWork = cloudLightRefreshWork
                    ? `${cloudLightRefreshWork.brickIndex}:` +
                        `${cloudLightRefreshWork.phase}:` +
                        `${cloudLightRefreshWork.level}:` +
                        `${cloudLightRefreshWork.cycle}:` +
                        `${cloudLightRefreshWork.iteration}:` +
                        `${cloudLightRefreshWork.slabStart}`
                    : "idle";
                if (captureInitializationTelemetry && cloudLightRefreshWork) {
                    const work = cloudLightRefreshWork;
                    const semanticSignature =
                        `${work.phase}:${work.brickIndex}:${work.cycle}`;
                    const now = performance.now();
                    if (semanticSignature !== lastCaptureLightWorkSignature ||
                        now - lastCaptureLightWorkReportMs >= 2_000) {
                        lastCaptureLightWorkSignature = semanticSignature;
                        lastCaptureLightWorkReportMs = now;
                        reportCaptureStage(
                            `light-work-${work.phase}-b${work.brickIndex}-` +
                            `s${work.slabStart}-c${work.cycle}`,
                        );
                    }
                }
            };
            exposeCloudLightState();
            const armCloudLightExactSubmissionFence = (
                submittedSerial: number,
            ) => {
                void device.queue.onSubmittedWorkDone().then(() => {
                    // A stale fence must never release a newer generation's
                    // exact-query token. Queue order makes uniform-buffer
                    // reuse safe once this specific serial completes.
                    if (cloudLightExactSubmissionPendingSerial ===
                        submittedSerial) {
                        cloudLightExactSubmissionPendingSerial = null;
                        exposeCloudLightState();
                        wakeRef.current?.();
                    }
                }).catch(() => {
                    if (cloudLightExactSubmissionPendingSerial ===
                        submittedSerial) {
                        cloudLightExactSubmissionPendingSerial = null;
                        cloudLightResidualFailure =
                            "exact-submission-fence-failed";
                        cloudLightRefreshWork = null;
                        cloudLightState = "failed";
                        exposeCloudLightState();
                        wakeRef.current?.();
                    }
                });
            };
            let cadenceScale = 1;
            let overBudgetSamples = 0;
            let measurementGeneration = 0;
            let resizeReady = true;
            let resizeTimer: number | undefined;
            const resetCloudMeasurements = () => {
                measurementGeneration += 1;
                lastCloudGpuMs = null;
                lastCloudIntervalMs = null;
                lastCloudLightingMs = null;
                lastCloudTransportMs = null;
                cloudUpdateP50Ms = null;
                cloudUpdateP95Ms = null;
                cloudUpdateMaxMs = null;
                cloudGpuSamples.length = 0;
                cloudUnsafeSampleCount = 0;
                projectedOpacity = null;
                occupiedSkyFraction = null;
                acceptedIntervalFraction = null;
                meanEvaluatedStepFraction = null;
                cloudTransportNonFiniteCount = null;
                cloudRadianceNonFiniteCount = null;
                cloudMaximumTransmittanceChroma = null;
                rawRadianceTemporalDelta = null;
                rawTransmittanceTemporalDelta = null;
                resolvedRadianceTemporalDelta = null;
                rawResolvedRadianceResidual = null;
                historyAcceptanceFraction = null;
                stableHistoryAge = null;
                persistentHistoryConfidence = null;
                rawRadianceSpatialVariation = null;
                resolvedRadianceSpatialVariation = null;
                finalOutputAdjacentVariation = null;
                finalOutputScaleSeparatedVariation = null;
                firstDepthTemporalDelta = null;
                meanDepthTemporalDelta = null;
                opticalDepthTemporalDelta = null;
                reconstructionRawNonFiniteCount = null;
                reconstructionResolvedNonFiniteCount = null;
                cadenceScale = 1;
                overBudgetSamples = 0;
            };
            const recordCloudGpuSample = (milliseconds: number) => {
                if (!Number.isFinite(milliseconds) || milliseconds < 0) return;
                lastCloudGpuMs = milliseconds;
                cloudGpuSamples.push(milliseconds);
                if (cloudGpuSamples.length > 120) cloudGpuSamples.shift();
                const sorted = [...cloudGpuSamples].sort((a, b) => a - b);
                const sampleAt = (quantile: number) =>
                    sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * quantile))];
                cloudUpdateP50Ms = sampleAt(0.5);
                cloudUpdateP95Ms = sampleAt(0.95);
                cloudUpdateMaxMs = sorted[sorted.length - 1];
                if (milliseconds > 32) cloudUnsafeSampleCount += 1;
            };
            const enforceGpuBudget = (milliseconds: number) => {
                overBudgetSamples = milliseconds > 32 ? overBudgetSamples + 1 : 0;
                // Explicit WebGPU is a laboratory/qualification request. Keep
                // recording and throttling it, but do not replace the very
                // render under inspection with the legacy fallback. Automatic
                // production selection retains the strict thermal safety gate.
                if (propsRef.current.options.preference === "webgpu") return;
                if (milliseconds > 80 || overBudgetSamples >= 2) {
                    reportFailure(
                        `WebGPU sky exceeded its safe frame budget (${milliseconds.toFixed(1)} ms)`,
                    );
                }
            };

            const cancelStrictCloudTransport = () => {
                strictCloudTransportSerial += 1;
                strictCloudTransportTransaction = null;
                strictCloudTransportSubmissionPending = false;
                if (strictCloudTransportContinuationTimer !== undefined) {
                    window.clearTimeout(strictCloudTransportContinuationTimer);
                    strictCloudTransportContinuationTimer = undefined;
                }
                canvas.dataset.cloudTransportTransaction = "idle";
            };

            const destroyTargets = () => {
                backgroundTexture?.destroy();
                cloudCurrent?.destroy();
                cloudPrevious?.destroy();
                geometryCurrent?.destroy();
                geometryPrevious?.destroy();
                motionCurrent?.destroy();
                motionPrevious?.destroy();
                temporalCurrent?.destroy();
                temporalPrevious?.destroy();
                resolvedCloudCurrent?.destroy();
                resolvedCloudPrevious?.destroy();
                intervalLowMiddle?.destroy();
                intervalHighMask?.destroy();
                cloudLayerRadianceFirstDepth?.destroy();
                cloudLayerTransmittanceMeanDepth?.destroy();
                cloudLayerMotionSteps?.destroy();
                starTexture?.destroy();
                glowHalfA?.destroy();
                glowHalfB?.destroy();
                glowQuarterA?.destroy();
                glowQuarterB?.destroy();
                glowEighthA?.destroy();
                glowEighthB?.destroy();
            };

            const resize = () => {
                if (!resizeReady && width > 0 && height > 0) return false;
                const bounds = canvas.getBoundingClientRect();
                const currentOptions = propsRef.current.options;
                const profile = SKY_QUALITY_PROFILES[currentOptions.quality];
                const nativeRatio = Math.min(window.devicePixelRatio || 1, 2);
                const budgetRatio = Math.sqrt(
                    profile.pixelBudget / Math.max(1, bounds.width * bounds.height),
                );
                const ratio = Math.min(nativeRatio, budgetRatio);
                const nextWidth = Math.max(1, Math.round(bounds.width * ratio));
                const nextHeight = Math.max(1, Math.round(bounds.height * ratio));
                const nextCloudSampling = resolveSkyCloudSampling({
                    quality: currentOptions.quality,
                    resolutionScale: currentOptions.resolutionScale,
                    cloudScene: propsRef.current.radiance.cloudScene,
                    sceneKey: propsRef.current.sceneKey ?? "",
                });
                const cloudScale = nextCloudSampling.effectiveScale;
                const nextCloudWidth = Math.max(2, Math.round(nextWidth * cloudScale / 2) * 2);
                const nextCloudHeight = Math.max(2, Math.round(nextHeight * cloudScale / 2) * 2);
                if (
                    nextWidth === width && nextHeight === height &&
                    nextCloudWidth === cloudWidth && nextCloudHeight === cloudHeight &&
                    nextCloudSampling.signature === cloudSamplingSignature
                ) return false;
                // Packet targets are private transaction storage. A resize
                // destroys them, so invalidate the transaction serial before
                // allocating replacements; no old completion callback may
                // commit into the new extent.
                cancelStrictCloudTransport();
                width = nextWidth;
                height = nextHeight;
                cloudWidth = nextCloudWidth;
                cloudHeight = nextCloudHeight;
                cloudSamplingDecision = nextCloudSampling;
                cloudSamplingSignature = nextCloudSampling.signature;
                canvas.width = width;
                canvas.height = height;
                destroyTargets();
                const renderUsage = TEXTURE.RENDER_ATTACHMENT | TEXTURE.TEXTURE_BINDING;
                backgroundTexture = createWebGpuTexture(device, width, height, "rgba16float", renderUsage);
                cloudCurrent = createWebGpuTexture(
                    device, cloudWidth, cloudHeight, "rgba16float", renderUsage, 2);
                cloudPrevious = createWebGpuTexture(
                    device, cloudWidth, cloudHeight, "rgba16float", renderUsage, 2);
                geometryCurrent = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                geometryPrevious = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                motionCurrent = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                motionPrevious = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                temporalCurrent = createWebGpuTexture(device, width, height, "rgba16float", renderUsage);
                temporalPrevious = createWebGpuTexture(device, width, height, "rgba16float", renderUsage);
                resolvedCloudCurrent = createWebGpuTexture(
                    device, width, height, "rgba16float", renderUsage, 2);
                resolvedCloudPrevious = createWebGpuTexture(
                    device, width, height, "rgba16float", renderUsage, 2);
                intervalLowMiddle = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                intervalHighMask = createWebGpuTexture(device, cloudWidth, cloudHeight, "rgba16float", renderUsage);
                const createCloudLayerPacketTexture = (label: string) =>
                    device.createTexture({
                        label,
                        // low, middle, high, hydrometeors, upper atmosphere
                        size: [cloudWidth, cloudHeight, 5],
                        format: "rgba16float",
                        usage: renderUsage,
                    });
                cloudLayerRadianceFirstDepth = createCloudLayerPacketTexture(
                    "cloud layer radiance and first depth packets",
                );
                cloudLayerTransmittanceMeanDepth = createCloudLayerPacketTexture(
                    "cloud layer transmittance and mean depth packets",
                );
                cloudLayerMotionSteps = createCloudLayerPacketTexture(
                    "cloud layer motion and step packets",
                );
                starTexture = createWebGpuTexture(device, width, height, "rgba16float", renderUsage);
                const halfWidth = Math.max(1, Math.ceil(width / 2));
                const halfHeight = Math.max(1, Math.ceil(height / 2));
                const quarterWidth = Math.max(1, Math.ceil(width / 4));
                const quarterHeight = Math.max(1, Math.ceil(height / 4));
                const eighthWidth = Math.max(1, Math.ceil(width / 8));
                const eighthHeight = Math.max(1, Math.ceil(height / 8));
                glowHalfA = createWebGpuTexture(device, halfWidth, halfHeight, "rgba16float", renderUsage);
                glowHalfB = createWebGpuTexture(device, halfWidth, halfHeight, "rgba16float", renderUsage);
                glowQuarterA = createWebGpuTexture(device, quarterWidth, quarterHeight, "rgba16float", renderUsage);
                glowQuarterB = createWebGpuTexture(device, quarterWidth, quarterHeight, "rgba16float", renderUsage);
                glowEighthA = createWebGpuTexture(device, eighthWidth, eighthHeight, "rgba16float", renderUsage);
                glowEighthB = createWebGpuTexture(device, eighthWidth, eighthHeight, "rgba16float", renderUsage);
                backgroundDirty = true;
                glowAvailable = false;
                glowNeedsClear = true;
                historyValid = false;
                temporalNeedsClear = true;
                currentTransportCamera = createPackedCameraState(
                    propsRef.current.radiance, width, height,
                );
                previousTransportCamera = currentTransportCamera;
                currentTransportYawRadians = cameraYawRadiansFromViewAzimuth(
                    propsRef.current.radiance.viewAzimuth,
                );
                previousTransportYawRadians = currentTransportYawRadians;
                activeTransportDeltaSeconds = 0;
                previousTransportCloudClock = Number.NaN;
                transportUpdates = 0;
                activeTransportIndex = 0;
                activeInterleavedTransport = false;
                lastCloudUpdate = -Infinity;
                coldCloudWarmupMs = null;
                coldCloudWarmupQueueMs = null;
                firstCloudUpdateMs = null;
                firstCloudIntervalMs = null;
                firstCloudLightingMs = null;
                firstCloudTransportMs = null;
                coldLightingWarmupComplete = false;
                coldLightingWarmupPending = false;
                cloudTargetsNeedClear = true;
                couplingShadowsInitialized = false;
                resetCloudMeasurements();
                return true;
            };

            const uploadStars = (scene: CelestialScene) => {
                const cameraYaw = cameraYawRadiansFromViewAzimuth(
                    propsRef.current.radiance.viewAzimuth,
                );
                if (uploadedStars === scene && uploadedStarsYaw === cameraYaw) {
                    return;
                }
                const data = createStarData(
                    scene,
                    cameraYaw,
                );
                if (scene.stars.length > starCapacity) {
                    starBuffer.destroy();
                    starCapacity = Math.max(1, scene.stars.length);
                    starBuffer = device.createBuffer({
                        size: starCapacity * 80,
                        usage: BUFFER.VERTEX | BUFFER.COPY_DST,
                    });
                }
                if (data.byteLength > 0) device.queue.writeBuffer(starBuffer, 0, data);
                starCount = scene.stars.length;
                uploadedStars = scene;
                uploadedStarsYaw = cameraYaw;
            };

            const cloudLightExactQueryGroup0 = (pipeline: any) =>
                device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        {
                            binding: 0,
                            resource: { buffer: cloudLightParameterSnapshotBuffer },
                        },
                        { binding: 2, resource: baseVolume.createView() },
                        { binding: 3, resource: detailVolume.createView() },
                        { binding: 5, resource: volumeSampler },
                        { binding: 16, resource: cloudMacroAtlas.atlasTexture.createView!() },
                        { binding: 17, resource: cloudMacroAtlas.majorantTexture.createView!() },
                        { binding: 18, resource: cloudMacroSampler },
                        {
                            binding: 32,
                            resource: cloudMacroAtlas.highIceSourceAtlasTexture.createView!(),
                        },
                        { binding: 19, resource: { buffer: cloudSystemBuffer } },
                        { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                        { binding: 23, resource: { buffer: cloudOptics.parameterBuffer } },
                        { binding: 24, resource: { buffer: cloudOpticsOwnerBuffer } },
                        { binding: 30, resource: cloudMorphologyView },
                    ],
                });

            // This exact layout mirrors the statically reachable bindings in
            // WEBGPU_CLOUD_LIGHT_VOLUME_FIBRATUS_SOURCE_SHADER. Supplying the
            // generic camera volumes or morphology texture here would defeat
            // the point of its compiler-isolated Metal path and is rejected by
            // the pipeline's automatic layout in any case.
            const cloudLightFibratusSourceGroup0 = (pipeline: any) =>
                device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 16, resource: cloudMacroAtlas.atlasTexture.createView!() },
                        { binding: 17, resource: cloudMacroAtlas.majorantTexture.createView!() },
                        { binding: 18, resource: cloudMacroSampler },
                        { binding: 19, resource: { buffer: cloudSystemBuffer } },
                        { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                        {
                            binding: 23,
                            resource: { buffer: cloudOptics.parameterBuffer },
                        },
                        {
                            binding: 24,
                            resource: { buffer: cloudOpticsOwnerBuffer },
                        },
                    ],
                });

            const cloudLightLightningGroup0 = (pipeline: any) =>
                device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(0),
                    entries: [
                        {
                            binding: 0,
                            resource: { buffer: cloudLightParameterSnapshotBuffer },
                        },
                        { binding: 2, resource: baseVolume.createView() },
                        { binding: 3, resource: detailVolume.createView() },
                        { binding: 5, resource: volumeSampler },
                        {
                            binding: 6,
                            resource: physicalAtmosphere.bindings.transmittanceView,
                        },
                        { binding: 16, resource: cloudMacroAtlas.atlasTexture.createView!() },
                        { binding: 17, resource: cloudMacroAtlas.majorantTexture.createView!() },
                        { binding: 18, resource: cloudMacroSampler },
                        {
                            binding: 32,
                            resource: cloudMacroAtlas.highIceSourceAtlasTexture.createView!(),
                        },
                        { binding: 19, resource: { buffer: cloudSystemBuffer } },
                        { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                        { binding: 23, resource: { buffer: cloudOptics.parameterBuffer } },
                        { binding: 24, resource: { buffer: cloudOpticsOwnerBuffer } },
                        {
                            binding: 25,
                            resource: { buffer: physicalAtmosphere.bindings.uniformBuffer },
                        },
                        {
                            binding: 26,
                            resource: physicalAtmosphere.bindings.multipleScatteringView,
                        },
                        { binding: 28, resource: physicalAtmosphere.bindings.sampler },
                        { binding: 30, resource: cloudMorphologyView },
                        {
                            binding: 35,
                            resource: { buffer: weatherSceneUniformBuffer },
                        },
                    ],
                });

            const cloudLightPhysicalGroup0 = (
                pipeline: any,
                includeDirectionalAtlas: boolean,
                includeExactMedium = false,
            ) => device.createBindGroup({
                layout: pipeline.getBindGroupLayout(0),
                entries: [
                    ...(includeExactMedium ? [
                        {
                            binding: 0,
                            resource: { buffer: cloudLightParameterSnapshotBuffer },
                        },
                        { binding: 2, resource: baseVolume.createView() },
                        { binding: 3, resource: detailVolume.createView() },
                        { binding: 5, resource: volumeSampler },
                        {
                            binding: 16,
                            resource: cloudMacroAtlas.atlasTexture.createView!(),
                        },
                        {
                            binding: 17,
                            resource: cloudMacroAtlas.majorantTexture.createView!(),
                        },
                        { binding: 18, resource: cloudMacroSampler },
                        {
                            binding: 32,
                            resource: cloudMacroAtlas.highIceSourceAtlasTexture.createView!(),
                        },
                        { binding: 19, resource: { buffer: cloudSystemBuffer } },
                        {
                            binding: 20,
                            resource: { buffer: cloudMacroBindingBuffer },
                        },
                        {
                            binding: 23,
                            resource: { buffer: cloudOptics.parameterBuffer },
                        },
                        {
                            binding: 24,
                            resource: { buffer: cloudOpticsOwnerBuffer },
                        },
                        { binding: 30, resource: cloudMorphologyView },
                    ] : []),
                    {
                        binding: 6,
                        resource: physicalAtmosphere.bindings.transmittanceView,
                    },
                    ...(includeDirectionalAtlas ? [{
                        binding: 14,
                        resource: physicalAtmosphere.bindings
                            .directionalCouplingAtlasView,
                    }] : []),
                    {
                        binding: 25,
                        resource: { buffer: physicalAtmosphere.bindings.uniformBuffer },
                    },
                    { binding: 28, resource: physicalAtmosphere.bindings.sampler },
                    ...(includeDirectionalAtlas ? [{
                        binding: 34,
                        resource: {
                            buffer: directionalCloudVisibilityUniformBuffer,
                        },
                    }] : []),
                ],
            });

            const encodeCloudLightComputePass = (
                encoder: any,
                label: string,
                pipeline: any,
                group0: any | undefined,
                group2Entries: Array<{ binding: number; resource: any }>,
                dispatch: readonly [number, number, number],
            ) => {
                const pass = encoder.beginComputePass({ label });
                pass.setPipeline(pipeline);
                if (group0) pass.setBindGroup(0, group0);
                pass.setBindGroup(2, device.createBindGroup({
                    layout: pipeline.getBindGroupLayout(2),
                    entries: group2Entries,
                }));
                pass.dispatchWorkgroups(...dispatch);
                pass.end();
            };

            const encodeCloudLightBrickRefreshStep = (
                encoder: any,
                work: CloudLightVolumeRefreshWork,
                uniformBuffer: any,
            ) => {
                const brickIndex = work.brickIndex;
                const [brickWidth, brickHeight, brickDepth] =
                    cloudLightPlan.config.dimensions;
                const level = work.level;
                const levelWidth = Math.max(1, brickWidth >> level);
                const levelHeight = Math.max(1, brickHeight >> level);
                const levelDepth = Math.max(1, brickDepth >> level);
                const samplingWord = Math.max(0, Math.round(
                    cloudLightPackedBricks[
                        brickIndex * CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS + 51
                    ] ?? 0,
                ));
                const samplingMetadataValid =
                    (samplingWord & CLOUD_LIGHT_VOLUME_METADATA_SCHEMA_MASK) === 1 &&
                    (samplingWord & ~CLOUD_LIGHT_VOLUME_KNOWN_METADATA_MASK) === 0 &&
                    ((samplingWord & CLOUD_LIGHT_VOLUME_PAIRED_DIRECT_Y_BIT) === 0 ||
                        (samplingWord &
                            CLOUD_LIGHT_VOLUME_FILTERED_MEDIUM_BIT) !== 0);
                const filteredMediumSafe =
                    samplingMetadataValid &&
                    (samplingWord & CLOUD_LIGHT_VOLUME_FILTERED_MEDIUM_BIT) !== 0;
                const pairedDirectYSafe =
                    samplingMetadataValid &&
                    (samplingWord & CLOUD_LIGHT_VOLUME_PAIRED_DIRECT_Y_BIT) !== 0;
                const residentSourceMediumSafe =
                    samplingMetadataValid && (samplingWord &
                        CLOUD_LIGHT_VOLUME_RESIDENT_SOURCE_MEDIUM_BIT) !== 0;
                const p1Eligible = samplingMetadataValid && (samplingWord &
                    CLOUD_LIGHT_VOLUME_P1_ELIGIBLE_BIT) !== 0;
                const requestedSlabDepth = work.phase === "material"
                    ? CLOUD_LIGHT_VOLUME_EXACT_MEDIUM_SLAB_DEPTH
                    : work.phase === "material-fine"
                        ? CLOUD_LIGHT_VOLUME_EXACT_FINE_MEDIUM_SLAB_DEPTH
                    : work.phase === "source-materialize-sun" ||
                        work.phase === "source-materialize-moon" ||
                        work.phase === "lightning-field"
                        ? pairedDirectYSafe || work.phase === "lightning-field"
                            ? CLOUD_LIGHT_VOLUME_EXACT_SOURCE_SLAB_DEPTH
                            : CLOUD_LIGHT_VOLUME_EXACT_FINE_MEDIUM_SLAB_DEPTH
                        : CLOUD_LIGHT_VOLUME_REFRESH_SLAB_DEPTH;
                const slabDepth = Math.min(
                    requestedSlabDepth,
                    levelDepth - work.slabStart,
                );
                const ownerAt = (index: number) => Math.max(0, Math.round(
                    cloudLightPackedBricks[
                        index * CLOUD_LIGHT_VOLUME_BRICK_STRIDE_FLOATS + 48
                    ] ?? 0,
                ));
                const ownerIndex = ownerAt(brickIndex);
                let representativeBrickIndex = brickIndex;
                for (let previous = 0; previous < brickIndex; previous += 1) {
                    if (ownerAt(previous) === ownerIndex) {
                        representativeBrickIndex = previous;
                        break;
                    }
                }
                const isRepresentativeBrick =
                    representativeBrickIndex === brickIndex;
                const writeUniform = (
                    readPacked = false,
                    writePacked = false,
                    slabStart = work.slabStart,
                    slabCount = slabDepth,
                ) =>
                    device.queue.writeBuffer(
                        uniformBuffer,
                        0,
                        packCloudLightVolumeUniforms(
                            cloudLightPlan,
                            cloudLightBrickCount,
                            brickIndex,
                            slabStart,
                            slabCount,
                            level,
                            cloudLightTargetBank,
                            readPacked,
                            writePacked,
                        ),
                    );
                const uniformEntry = {
                    binding: 0,
                    resource: { buffer: uniformBuffer },
                };
                const brickEntry = {
                    binding: 1,
                    resource: { buffer: cloudLightBrickBuffer },
                };
                const sourceEntry = {
                    binding: 2,
                    resource: { buffer: cloudLightSourceBuffer },
                };
                const boundaryEntry = {
                    binding: 12,
                    resource: { buffer: cloudLightBoundaryBuffer },
                };
                const residualEntry = {
                    binding: 13,
                    resource: { buffer: cloudLightResidualStatusBuffer },
                };
                const mipView = (texture: any, mipLevel: number) =>
                    texture.createView({
                        dimension: "3d",
                        baseMipLevel: mipLevel,
                        mipLevelCount: 1,
                    });
                const volumeSlabDispatch = [
                    Math.ceil(levelWidth / 4),
                    Math.ceil(levelHeight / 4),
                    Math.ceil(slabDepth / 4),
                ] as const;
                const exactSourceSlabDispatch = [
                    Math.ceil(levelWidth / 4),
                    // Production owns one invocation for each of the 32 exact
                    // source-axis centers. The experimental paired-y shader
                    // path rejects its upper half internally.
                    Math.ceil(brickHeight / 4),
                    slabDepth,
                ] as const;
                const directDispatch =
                    cloudLightPlan.dispatch.directWorkgroupsPerSource;
                const advanceBrick = (
                    nextPhase: CloudLightVolumeRefreshPhase,
                ) => {
                    if (work.brickIndex + 1 < cloudLightBrickCount) {
                        work.brickIndex += 1;
                        return false;
                    }
                    work.brickIndex = 0;
                    work.phase = nextPhase;
                    return true;
                };
                // A pass is a generation-wide barrier. Every selected brick
                // completes every z slab before a dependent level/iteration
                // can observe its output, so sibling halos never mix current
                // and stale target-bank states.
                const advanceGlobalPass = (
                    nextPhase: CloudLightVolumeRefreshPhase,
                ) => {
                    const nextStart = work.slabStart + slabDepth;
                    if (nextStart < levelDepth) {
                        work.slabStart = nextStart;
                        return false;
                    }
                    work.slabStart = 0;
                    return advanceBrick(nextPhase);
                };
                const encodeDirect = (pipeline: any, output: any, sourceIndex: number) =>
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume source ${sourceIndex} brick ${brickIndex} ` +
                            `full ${brickDepth}-cell depth`,
                        pipeline,
                        undefined,
                        [
                            uniformEntry,
                            brickEntry,
                            sourceEntry,
                            { binding: 5, resource: mipView(output, level) },
                            {
                                binding: 10,
                                resource: mipView(cloudLightFluenceScratch, level),
                            },
                        ],
                        directDispatch,
                    );
                const encodeSourceMaterialize = (
                    pipeline: any,
                    sourceIndex: number,
                    fibratusSource: boolean,
                ) => encodeCloudLightComputePass(
                    encoder,
                    `cloud light-volume source ${sourceIndex} exact material ` +
                        `brick ${brickIndex} z ${work.slabStart}+${slabDepth}`,
                    pipeline,
                    fibratusSource
                        ? cloudLightFibratusSourceGroup0(pipeline)
                        : cloudLightExactQueryGroup0(pipeline),
                    [
                        uniformEntry,
                        brickEntry,
                        sourceEntry,
                        {
                            binding: 11,
                            resource: mipView(cloudLightFluenceScratch, level),
                        },
                        {
                            binding: 6,
                            resource: mipView(cloudLightMediumExtinction, 0),
                        },
                    ],
                    exactSourceSlabDispatch,
                );
                const uploadFibratusSourceMaterial = (sourceIndex: 0 | 1) => {
                    const context = cloudLightFibratusSourceContexts.get(ownerIndex);
                    const sourceBrick = cloudLightSourceBricks[representativeBrickIndex];
                    if (!context || !sourceBrick) {
                        throw new Error(
                            `Missing qualified fibratus source context for owner ${ownerIndex}.`,
                        );
                    }
                    reportCaptureStage(
                        `light-cpu-start-g${work.generation}-o${ownerIndex}-` +
                            `b${representativeBrickIndex}-s${sourceIndex}`,
                    );
                    const field = createCloudFibratusSourceField({
                        dimensions: cloudLightPlan.config.dimensions,
                        transform: sourceBrick.directTransforms[sourceIndex],
                        extinctionRgbPerKm: context.extinctionRgbPerKm,
                        densityAtWorld: context.densityAtWorld,
                    });
                    reportCaptureStage(
                        `light-cpu-field-g${work.generation}-o${ownerIndex}-` +
                            `b${representativeBrickIndex}-s${sourceIndex}`,
                    );
                    const stagingBuffer = device.createBuffer({
                        label: `cloud fibratus source ${sourceIndex} owner ` +
                            `${ownerIndex} finite-volume upload`,
                        size: field.data.byteLength,
                        usage: BUFFER.COPY_SRC,
                        mappedAtCreation: true,
                    });
                    new Uint16Array(stagingBuffer.getMappedRange()).set(field.data);
                    stagingBuffer.unmap();
                    reportCaptureStage(
                        `light-cpu-buffer-g${work.generation}-o${ownerIndex}-` +
                            `b${representativeBrickIndex}-s${sourceIndex}`,
                    );
                    cloudLightFibratusSourceStagingBuffers.push(stagingBuffer);
                    // Keep this copy in the command stream. queue.writeTexture
                    // would run before every already encoded Sun Beer pass and
                    // could let a later Moon upload overwrite shared scratch.
                    encoder.copyBufferToTexture(
                        {
                            buffer: stagingBuffer,
                            bytesPerRow: field.bytesPerRow,
                            rowsPerImage: field.rowsPerImage,
                        },
                        {
                            texture: cloudLightFluenceScratch,
                            mipLevel: 0,
                            origin: cloudFibratusSourceFieldTextureOrigin(
                                representativeBrickIndex,
                                brickDepth,
                            ),
                        },
                        {
                            width: field.size[0],
                            height: field.size[1],
                            depthOrArrayLayers: field.size[2],
                        },
                    );
                    reportCaptureStage(
                        `light-cpu-copy-g${work.generation}-o${ownerIndex}-` +
                            `b${representativeBrickIndex}-s${sourceIndex}`,
                    );
                };

                if (work.phase === "boundary") {
                    work.level = 0;
                    work.slabStart = 0;
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume boundary brick ${brickIndex}`,
                        cloudLightBoundaryPipeline,
                        cloudLightPhysicalGroup0(
                            cloudLightBoundaryPipeline, true, true),
                        [
                            uniformEntry,
                            brickEntry,
                            sourceEntry,
                            {
                                binding: 8,
                                resource: cloudLightDirectSun.createView(),
                            },
                            {
                                binding: 9,
                                resource: cloudLightDirectMoon.createView(),
                            },
                            boundaryEntry,
                        ],
                        [1, 1, 1],
                    );
                    advanceBrick("clear-fine");
                    return "exact-progress" as const;
                }
                if (work.phase === "material") {
                    if (!p1Eligible) {
                        work.slabStart = 0;
                        if (advanceBrick("material-fine")) work.level = 0;
                        return "progress" as const;
                    }
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume material brick ${brickIndex} ` +
                            `z ${work.slabStart}+${slabDepth}`,
                        cloudLightMaterialPipeline,
                        cloudLightExactQueryGroup0(cloudLightMaterialPipeline),
                        [
                            uniformEntry,
                            brickEntry,
                            {
                                binding: 3,
                                resource: mipView(
                                    cloudLightMediumExtinction, level),
                            },
                            {
                                binding: 4,
                                resource: mipView(
                                    cloudLightMediumScattering, level),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("material-fine")) work.level = 0;
                    // Production metadata uses this pass only for the cheap
                    // eight-child support/majorant mask. It has no full medium
                    // queries and therefore must not consume an exact fence.
                    return filteredMediumSafe
                        ? "exact-progress" as const
                        : "progress" as const;
                }
                if (work.phase === "material-fine") {
                    if (!p1Eligible) {
                        work.slabStart = 0;
                        advanceBrick("prolongate-medium");
                        return "progress" as const;
                    }
                    if (filteredMediumSafe) {
                        work.slabStart = 0;
                        advanceBrick("prolongate-medium");
                        return "progress" as const;
                    }
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume exact fine material brick ${brickIndex} ` +
                            `z ${work.slabStart}+${slabDepth}`,
                        cloudLightMaterialFinePipeline,
                        cloudLightExactQueryGroup0(cloudLightMaterialFinePipeline),
                        [
                            uniformEntry,
                            brickEntry,
                            {
                                binding: 3,
                                resource: mipView(
                                    cloudLightMediumExtinction, level),
                            },
                            {
                                binding: 4,
                                resource: mipView(
                                    cloudLightMediumScattering, level),
                            },
                            {
                                binding: 6,
                                resource: mipView(
                                    cloudLightMediumExtinction, 1),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    advanceGlobalPass("prolongate-medium");
                    return "exact-progress" as const;
                }
                if (work.phase === "prolongate-medium") {
                    if (!p1Eligible || !filteredMediumSafe) {
                        work.slabStart = 0;
                        if (advanceBrick("restrict-medium")) work.level = 1;
                        return "progress" as const;
                    }
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume monotone material reconstruction ` +
                            `brick ${brickIndex} z ${work.slabStart}+${slabDepth}`,
                        cloudLightProlongateMediumPipeline,
                        undefined,
                        [
                            uniformEntry,
                            {
                                binding: 3,
                                resource: mipView(
                                    cloudLightMediumExtinction, 0),
                            },
                            {
                                binding: 4,
                                resource: mipView(
                                    cloudLightMediumScattering, 0),
                            },
                            {
                                binding: 6,
                                resource: mipView(
                                    cloudLightMediumExtinction, 1),
                            },
                            {
                                binding: 7,
                                resource: mipView(
                                    cloudLightMediumScattering, 1),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("restrict-medium")) work.level = 1;
                    return "progress" as const;
                }
                if (work.phase === "restrict-medium") {
                    if (!p1Eligible) {
                        work.slabStart = 0;
                        if (advanceBrick("source-materialize-sun")) {
                            if (work.level <
                                cloudLightPlan.config.multigridLevels - 1) {
                                work.level += 1;
                                work.phase = "restrict-medium";
                            } else {
                                work.level = 0;
                            }
                        }
                        return "progress" as const;
                    }
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume restrict medium L${level} ` +
                            `brick ${brickIndex} z ${work.slabStart}+${slabDepth}`,
                        cloudLightRestrictMediumPipeline,
                        undefined,
                        [
                            uniformEntry,
                            {
                                binding: 3,
                                resource: mipView(cloudLightMediumExtinction, level),
                            },
                            {
                                binding: 4,
                                resource: mipView(cloudLightMediumScattering, level),
                            },
                            {
                                binding: 6,
                                resource: mipView(
                                    cloudLightMediumExtinction, level - 1),
                            },
                            {
                                binding: 7,
                                resource: mipView(
                                    cloudLightMediumScattering, level - 1),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("source-materialize-sun")) {
                        if (work.level < cloudLightPlan.config.multigridLevels - 1) {
                            work.level += 1;
                            work.phase = "restrict-medium";
                        } else {
                            work.level = 0;
                        }
                    }
                    return "progress" as const;
                }
                if (work.phase === "source-materialize-sun") {
                    if ((cloudLightActiveSourceMask & 1) === 0) {
                        work.slabStart = 0;
                        advanceBrick("direct-sun");
                        return "progress" as const;
                    }
                    if (!isRepresentativeBrick) {
                        work.slabStart = 0;
                        advanceBrick("direct-sun");
                        return "progress" as const;
                    }
                    const fibratusSource =
                        cloudLightFibratusSourceOwnerIndices.has(ownerIndex);
                    if (fibratusSource) {
                        uploadFibratusSourceMaterial(0);
                        work.slabStart = 0;
                        advanceBrick("direct-sun");
                        // One bounded 48x32x48 finite-volume upload per draw.
                        // Yield before the next owner so preview generation and
                        // interactive scenes cannot accumulate a long CPU spike.
                        return "cpu-progress" as const;
                    }
                    writeUniform();
                    encodeSourceMaterialize(
                        cloudLightSourceMaterializeSunPipeline,
                        0,
                        false,
                    );
                    advanceGlobalPass("direct-sun");
                    return residentSourceMediumSafe
                        ? "progress" as const : "exact-progress" as const;
                }
                if (work.phase === "direct-sun") {
                    if (!isRepresentativeBrick) {
                        advanceBrick("source-materialize-moon");
                        return "progress" as const;
                    }
                    writeUniform(false, false, 0, brickDepth);
                    encodeDirect(cloudLightDirectSunPipeline, cloudLightDirectSun, 0);
                    // Every Sun scan pass precedes the first Moon material pass,
                    // so Moon may safely overwrite the shared mip-zero scratch.
                    advanceBrick("source-materialize-moon");
                    return "progress" as const;
                }
                if (work.phase === "source-materialize-moon") {
                    if ((cloudLightActiveSourceMask & 2) === 0) {
                        work.slabStart = 0;
                        advanceBrick("direct-moon");
                        return "progress" as const;
                    }
                    if (!isRepresentativeBrick) {
                        work.slabStart = 0;
                        advanceBrick("direct-moon");
                        return "progress" as const;
                    }
                    const fibratusSource =
                        cloudLightFibratusSourceOwnerIndices.has(ownerIndex);
                    if (fibratusSource) {
                        uploadFibratusSourceMaterial(1);
                        work.slabStart = 0;
                        advanceBrick("direct-moon");
                        return "cpu-progress" as const;
                    }
                    writeUniform();
                    encodeSourceMaterialize(
                        cloudLightSourceMaterializeMoonPipeline,
                        1,
                        false,
                    );
                    advanceGlobalPass("direct-moon");
                    return residentSourceMediumSafe
                        ? "progress" as const : "exact-progress" as const;
                }
                if (work.phase === "direct-moon") {
                    if (!isRepresentativeBrick) {
                        if (advanceBrick("lightning-field")) {
                            work.level = 2;
                            work.slabStart = 0;
                        }
                        return "progress" as const;
                    }
                    writeUniform(false, false, 0, brickDepth);
                    encodeDirect(cloudLightDirectMoonPipeline, cloudLightDirectMoon, 1);
                    if (advanceBrick("lightning-field")) {
                        work.level = 2;
                        work.slabStart = 0;
                    }
                    return "progress" as const;
                }
                if (work.phase === "lightning-field") {
                    const phaseAfterLightning =
                        cloudLightTargetResidentLayerMask !== 0
                            ? "boundary" : "clear-fine";
                    if (!cloudLightHasLightning) {
                        work.slabStart = 0;
                        if (advanceBrick(phaseAfterLightning)) work.level = 0;
                        return "progress" as const;
                    }
                    writeUniform();
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume lightning transfer brick ${brickIndex} ` +
                            `z ${work.slabStart}+${slabDepth}`,
                        cloudLightLightningPipeline,
                        cloudLightLightningGroup0(cloudLightLightningPipeline),
                        [
                            uniformEntry,
                            brickEntry,
                            {
                                binding: 14,
                                resource: mipView(cloudLightLightning, level),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass(phaseAfterLightning)) work.level = 0;
                    return "exact-progress" as const;
                }
                if (work.phase === "clear-fine" ||
                    work.phase === "clear-coarse") {
                    const nextSmoothPhase = work.phase === "clear-fine"
                        ? "pre-smooth" : "coarse-smooth";
                    writeUniform(false, true);
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume ${work.phase} brick ${brickIndex} ` +
                            `L${level} ` +
                            `z ${work.slabStart}+${slabDepth}`,
                        cloudLightClearPipeline,
                        undefined,
                        [uniformEntry, {
                            binding: 11,
                            resource: mipView(cloudLightPackedView, level),
                        }],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass(nextSmoothPhase)) {
                        if (nextSmoothPhase === "pre-smooth" &&
                            cloudLightTargetResidentLayerMask === 0) {
                            // The packed fluence field has now been explicitly
                            // cleared to vacuum. Direct-only generations can
                            // publish their identity/Beer partition without a
                            // boundary projection, multigrid solve, or residual
                            // readback.
                            work.phase = "copy-direct";
                            work.level = 0;
                            work.iteration = 0;
                            return "progress" as const;
                        }
                        const iterationCount = nextSmoothPhase === "pre-smooth"
                            ? cloudLightPlan.config.preSmoothIterations
                            : level === cloudLightPlan.config.multigridLevels - 1
                                ? cloudLightPlan.config.coarseSmoothIterations
                                : cloudLightPlan.config.preSmoothIterations;
                        // Packed owns the initial state. An odd Jacobi count
                        // starts from a seeded scratch copy so its final write
                        // still lands in packed, which every dependent global
                        // pass reads.
                        work.iteration = resolveCloudLightVolumeSmoothingParity(
                            iterationCount, "packed").requiresScratchSeed ? -1 : 0;
                    }
                    return "progress" as const;
                }
                if (work.phase === "pre-smooth" ||
                    work.phase === "coarse-smooth" ||
                    work.phase === "post-smooth") {
                    const post = work.phase === "post-smooth";
                    const iterationCount = work.phase === "coarse-smooth" &&
                        level === cloudLightPlan.config.multigridLevels - 1
                        ? cloudLightPlan.config.coarseSmoothIterations
                        : work.phase === "post-smooth"
                            ? cloudLightPlan.config.postSmoothIterations
                            : cloudLightPlan.config.preSmoothIterations;
                    if (work.iteration < 0) {
                        writeUniform(true, false);
                        encodeCloudLightComputePass(
                            encoder,
                            `cloud light-volume seed scratch before odd ` +
                                `${work.phase} L${level} brick ${brickIndex}`,
                            cloudLightCopyPipeline,
                            undefined,
                            [
                                uniformEntry,
                                {
                                    binding: 10,
                                    resource: mipView(cloudLightPackedView, level),
                                },
                                {
                                    binding: 11,
                                    resource: mipView(
                                        cloudLightFluenceScratch, level),
                                },
                            ],
                            volumeSlabDispatch,
                        );
                        if (advanceGlobalPass(work.phase)) work.iteration = 0;
                        return "progress" as const;
                    }
                    const smoothingParity =
                        resolveCloudLightVolumeSmoothingParity(
                            iterationCount, post ? "scratch" : "packed");
                    const initialReadPacked = smoothingParity.firstReadPacked;
                    const readPacked = initialReadPacked
                        ? work.iteration % 2 === 0
                        : work.iteration % 2 === 1;
                    const writePacked = !readPacked;
                    const read = readPacked
                        ? cloudLightPackedView : cloudLightFluenceScratch;
                    const write = writePacked
                        ? cloudLightPackedView : cloudLightFluenceScratch;
                    writeUniform(readPacked, writePacked);
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume ${work.phase} L${level} ` +
                            `${work.iteration + 1} brick ${brickIndex} ` +
                            `z ${work.slabStart}+${slabDepth}`,
                        cloudLightSmoothPipeline,
                        cloudLightPhysicalGroup0(cloudLightSmoothPipeline, false),
                        [
                            uniformEntry, brickEntry, sourceEntry,
                            {
                                binding: 6,
                                resource: cloudLightMediumExtinction.createView(),
                            },
                            {
                                binding: 7,
                                resource: cloudLightMediumScattering.createView(),
                            },
                            {
                                binding: 8,
                                resource: mipView(cloudLightDirectSun, level),
                            },
                            {
                                binding: 9,
                                resource: mipView(cloudLightDirectMoon, level),
                            },
                            { binding: 10, resource: mipView(read, level) },
                            { binding: 11, resource: mipView(write, level) },
                            boundaryEntry,
                        ],
                        volumeSlabDispatch,
                    );
                    if (!advanceGlobalPass(work.phase)) return "progress" as const;
                    work.iteration += 1;
                    if (work.iteration < iterationCount) {
                        return "progress" as const;
                    }
                    work.iteration = 0;
                    if (work.phase === "pre-smooth") {
                        work.level = 1;
                        work.phase = "restrict-residual";
                    } else if (work.phase === "coarse-smooth") {
                        if (level < cloudLightPlan.config.multigridLevels - 1) {
                            work.level += 1;
                            work.phase = "restrict-residual";
                        } else {
                            work.level = level - 1;
                            work.phase = "prolongate";
                        }
                    } else {
                        // Post-smoothing starts from prolongated scratch. An
                        // odd count already ends in packed; an even count ends
                        // in scratch and needs the explicit publication copy.
                        if (!smoothingParity.endsPacked) {
                            work.phase = "copy-packed";
                        } else if (level > 0) {
                            work.level = level - 1;
                            work.phase = "prolongate";
                        } else {
                            work.phase = "measure-residual";
                        }
                    }
                    return "progress" as const;
                }
                if (work.phase === "restrict-residual") {
                    const sourceLevel = level - 1;
                    writeUniform(true, false);
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume residual restrict L${sourceLevel}->` +
                            `L${level} brick ${brickIndex}`,
                        cloudLightRestrictResidualPipeline,
                        cloudLightPhysicalGroup0(
                            cloudLightRestrictResidualPipeline, false),
                        [
                            uniformEntry, brickEntry, sourceEntry,
                            {
                                binding: 5,
                                resource: mipView(cloudLightDirectSun, level),
                            },
                            {
                                binding: 6,
                                resource: cloudLightMediumExtinction.createView(),
                            },
                            {
                                binding: 7,
                                resource: cloudLightMediumScattering.createView(),
                            },
                            {
                                binding: 8,
                                resource: mipView(
                                    cloudLightDirectSun, sourceLevel),
                            },
                            {
                                binding: 9,
                                resource: mipView(
                                    cloudLightDirectMoon, sourceLevel),
                            },
                            {
                                binding: 10,
                                resource: mipView(cloudLightPackedView, sourceLevel),
                            },
                            boundaryEntry,
                        ],
                        volumeSlabDispatch,
                    );
                    advanceGlobalPass("clear-coarse");
                    return "progress" as const;
                }
                if (work.phase === "prolongate") {
                    writeUniform(true, false);
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume prolongate L${level + 1}->L${level} ` +
                            `brick ${brickIndex}`,
                        cloudLightProlongatePipeline,
                        undefined,
                        [
                            uniformEntry,
                            {
                                binding: 10,
                                resource: cloudLightPackedView.createView({
                                    dimension: "3d",
                                    baseMipLevel: 0,
                                    mipLevelCount:
                                        cloudLightPlan.config.multigridLevels,
                                }),
                            },
                            {
                                binding: 11,
                                resource: mipView(cloudLightFluenceScratch, level),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("post-smooth")) work.iteration = 0;
                    return "progress" as const;
                }
                if (work.phase === "copy-packed") {
                    writeUniform(false, true);
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume copy correction L${level} ` +
                            `brick ${brickIndex}`,
                        cloudLightCopyPipeline,
                        undefined,
                        [
                            uniformEntry,
                            {
                                binding: 10,
                                resource: mipView(cloudLightFluenceScratch, level),
                            },
                            {
                                binding: 11,
                                resource: mipView(cloudLightPackedView, level),
                            },
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("measure-residual")) {
                        if (level > 0) {
                            work.level -= 1;
                            work.phase = "prolongate";
                        }
                    }
                    return "progress" as const;
                }
                if (work.phase === "measure-residual") {
                    writeUniform(true, false);
                    if (work.brickIndex === 0 && work.slabStart === 0) {
                        encoder.clearBuffer(cloudLightResidualStatusBuffer);
                    }
                    encodeCloudLightComputePass(
                        encoder,
                        `cloud light-volume normalized residual brick ${brickIndex}`,
                        cloudLightMeasureResidualPipeline,
                        cloudLightPhysicalGroup0(
                            cloudLightMeasureResidualPipeline, false),
                        [
                            uniformEntry, brickEntry, sourceEntry,
                            {
                                binding: 6,
                                resource: cloudLightMediumExtinction.createView(),
                            },
                            {
                                binding: 7,
                                resource: cloudLightMediumScattering.createView(),
                            },
                            {
                                binding: 8,
                                resource: mipView(cloudLightDirectSun, 0),
                            },
                            {
                                binding: 9,
                                resource: mipView(cloudLightDirectMoon, 0),
                            },
                            {
                                binding: 10,
                                resource: mipView(cloudLightPackedView, 0),
                            },
                            boundaryEntry,
                            residualEntry,
                        ],
                        volumeSlabDispatch,
                    );
                    if (advanceGlobalPass("await-residual")) {
                        encoder.copyBufferToBuffer(
                            cloudLightResidualStatusBuffer, 0,
                            cloudLightResidualReadBuffer, 0, 80);
                        return "residual-read" as const;
                    }
                    return "progress" as const;
                }
                if (work.phase === "copy-direct") {
                    // Direct grids are full-owner fields. Sibling tiles copy
                    // their first stable owner's byte-identical field so the
                    // published ABI remains independently sampleable even
                    // though exact material and prefix work ran only once.
                    const sourceOrigin = [
                        0, 0, representativeBrickIndex * brickDepth,
                    ];
                    const copySize = [cloudLightWidth, cloudLightHeight, brickDepth];
                    const bankBase = cloudLightTargetBank * 3 * cloudLightAtlasDepth;
                    encoder.copyTextureToTexture(
                        { texture: cloudLightDirectSun, origin: sourceOrigin },
                        {
                            texture: cloudLightPackedView,
                            origin: [0, 0, bankBase + cloudLightAtlasDepth +
                                brickIndex * brickDepth],
                        },
                        copySize,
                    );
                    encoder.copyTextureToTexture(
                        { texture: cloudLightDirectMoon, origin: sourceOrigin },
                        {
                            texture: cloudLightPackedView,
                            origin: [0, 0, bankBase + cloudLightAtlasDepth * 2 +
                                brickIndex * brickDepth],
                        },
                        copySize,
                    );
                    if (advanceBrick("copy-direct")) {
                        return "generation-complete" as const;
                    }
                    return "progress" as const;
                }
                return "progress" as const;
            };

            const armStrictCloudTransportSubmissionFence = (
                submittedSerial: number,
                captureTrace?: string,
            ) => {
                void device.queue.onSubmittedWorkDone().then(() => {
                    if (disposed ||
                        strictCloudTransportSerial !== submittedSerial) return;
                    strictCloudTransportSubmissionPending = false;
                    if (captureTrace) {
                        reportCaptureStage(
                            `transport-fence-complete-${captureTrace}`);
                    }
                    // A zero-delay timer is intentional. Queue completion is
                    // the GPU boundary; the timer guarantees a distinct host
                    // event-loop turn without imposing the presentation-rate
                    // delay on tens of thousands of bounded strict batches.
                    strictCloudTransportContinuationTimer = window.setTimeout(
                        () => {
                            strictCloudTransportContinuationTimer = undefined;
                            if (!disposed &&
                                strictCloudTransportSerial === submittedSerial) {
                                draw(performance.now(), true);
                                schedule();
                            }
                        },
                        0,
                    );
                }).catch(() => {
                    if (strictCloudTransportSerial !== submittedSerial) return;
                    strictCloudTransportSubmissionPending = false;
                    cancelStrictCloudTransport();
                    reportFailure(
                        "Strict cloud transport submission fence failed");
                });
            };

            const draw = (timestamp = performance.now(), forceCloud = false) => {
                const hiddenCaptureAllowed = captureInitializationTelemetry &&
                    propsRef.current.paused;
                if (disposed || (document.hidden && !hiddenCaptureAllowed) ||
                    strictCloudTransportSubmissionPending ||
                    runtimePipelineCompilationPending) return;
                captureDrawOrdinal += 1;
                const captureDrawTrace = captureInitializationTelemetry &&
                    captureDrawOrdinal <= 24;
                if (captureDrawTrace) {
                    reportCaptureStage(
                        `draw-${captureDrawOrdinal}-start-f${forceCloud ? 1 : 0}`);
                }
                const drawStarted = performance.now();
                resize();
                const current = propsRef.current;
                const nextBackgroundSignature = createBackgroundSignature(
                    current.radiance,
                    current.celestial,
                    current.physicalAtmosphereState,
                    current.options.debugView,
                );
                if (nextBackgroundSignature !== backgroundSignature) {
                    backgroundSignature = nextBackgroundSignature;
                    backgroundDirty = true;
                }
                const nextCloudHistorySignature = createCloudHistorySignature(
                    current.radiance,
                    current.options,
                );
                const nextSceneKey = current.sceneKey ?? "";
                const strictSceneKey = `${nextSceneKey}:` +
                    `${nextCloudHistorySignature}:${nextBackgroundSignature}`;
                if (strictCloudTransportTransaction &&
                    (!current.paused ||
                        strictCloudTransportTransaction.identity.sceneKey !==
                            strictSceneKey)) {
                    cancelStrictCloudTransport();
                }
                if (nextCloudHistorySignature !== cloudHistorySignature ||
                    nextSceneKey !== activeSceneKey) {
                    cancelStrictCloudTransport();
                    cloudHistorySignature = nextCloudHistorySignature;
                    activeSceneKey = nextSceneKey;
                    historyValid = false;
                    temporalNeedsClear = true;
                    transportUpdates = 0;
                    activeTransportIndex = 0;
                    activeInterleavedTransport = false;
                    activeTransportDeltaSeconds = 0;
                    previousTransportCloudClock = Number.NaN;
                    lastCloudUpdate = -Infinity;
                    cloudTargetsNeedClear = true;
                    resetCloudMeasurements();
                    currentTransportCamera = createPackedCameraState(
                        current.radiance, width, height,
                    );
                    previousTransportCamera = currentTransportCamera;
                    currentTransportYawRadians = cameraYawRadiansFromViewAzimuth(
                        current.radiance.viewAzimuth,
                    );
                    previousTransportYawRadians = currentTransportYawRadians;
                }
                uploadStars(current.celestial);
                const requestedUrl = current.celestial.moon.photoUrl ??
                    "/assets/moon/lroc-color-2k.jpg";
                if (requestedUrl !== requestedMoonUrl) {
                    requestedMoonUrl = requestedUrl;
                    void loadMoon(
                        requestedUrl,
                        current.celestial.moon.photoUrl
                            ? "nasa-svs-phase-profile"
                            : "analytic-hapke-profile",
                    );
                }

                const seconds = timestamp / 1000;
                // Cadence adaptation must govern the expensive transport pass,
                // not only the lightweight presentation scheduler. Keeping the
                // raw requested interval here allowed the 2 Hz presentation
                // floor to defeat thermal throttling on balanced quality.
                const effectiveCloudRate = Math.max(
                    0.1,
                    current.options.updateRate * cadenceScale,
                );
                const cloudInterval = 1 / effectiveCloudRate;
                const hasUpperAtmosphericCloud =
                    current.radiance.cloudScene.classifications?.some(
                        (assignment) => Boolean(assignment.upperAtmosphericCloud),
                    ) ?? false;
                const authoredWeather = current.radiance.weather;
                const hasFiniteWeatherPhenomena = Boolean(
                    authoredWeather?.dropletOpticalOwners?.length ||
                    authoredWeather?.orientedIceOpticalOwners?.length ||
                    authoredWeather?.lightning ||
                    authoredWeather?.auroraCurtains?.length ||
                    authoredWeather?.blowingBoundaryMedia?.length,
                );
                const hasVolumetricContent =
                    current.radiance.cloudScene.layers.some(
                        (layer) => layer.present && layer.coverage > 0.0005,
                    ) ||
                    current.radiance.cloudScene.fog > 0.0005 ||
                    current.radiance.cloudScene.noctilucent > 0.0005 ||
                    hasUpperAtmosphericCloud ||
                    hasFiniteWeatherPhenomena;
                const cloudClock = resolveCloudRenderClock({
                    paused: current.paused,
                    requestedSnapshotSeconds:
                        current.radiance.cloudTime % 10_000,
                    initialSnapshotSeconds: initialCloudTime,
                    elapsedSeconds: seconds - startTime,
                    offsetSeconds: current.radiance.cloudTimeOffset,
                });
                // Determine the next immutable light epoch before deciding
                // whether this frame may submit view transport. Previously the
                // first structural frame observed refreshWork === null here,
                // then created a generation later in the same draw, coupling a
                // full cloud march to the exact-query completion fence.
                const cloudRuntime = createCloudRuntimeForRadiance(
                    current.radiance,
                );
                if (captureDrawTrace) {
                    reportCaptureStage(`draw-${captureDrawOrdinal}-runtime-ready`);
                }
                const missingScenePipelines: Promise<void>[] = [];
                if (!hydrometeorLayerPipeline && requiresHydrometeorTransport(
                    current.radiance,
                    cloudRuntime.systems,
                )) {
                    missingScenePipelines.push(
                        ensureHydrometeorLayerPipeline());
                }
                if (!upperAtmosphereLayerPipeline &&
                    requiresUpperAtmosphereTransport(current.radiance)) {
                    missingScenePipelines.push(
                        ensureUpperAtmosphereLayerPipeline());
                }
                if (missingScenePipelines.length > 0) {
                    waitForRuntimePipelines(missingScenePipelines);
                    return;
                }
                const morphologySignature = `${cloudRuntime.signature}:` +
                    loadedCloudMorphology.checksums.payload;
                const cloudLightLightingSignature =
                    createCloudLightVolumeLightingSignature(current.radiance);
                const nextCloudLightStructuralKey = `${cloudRuntime.signature}:` +
                    `${morphologySignature}:${cloudLightLightingSignature}`;
                const requestedCloudLightAdvectionEpoch = Math.floor(
                    cloudClock / CLOUD_LIGHT_VOLUME_ADVECTION_EPOCH_SECONDS);
                const structuralInvalidation = nextCloudLightStructuralKey !==
                    cloudLightStructuralKey;
                // A long exact solve may miss several two-second epochs. Do
                // not immediately replace its newly published bank: first
                // prove that at least one camera transport using that bank has
                // completed, then advance directly to the latest requested
                // epoch. Paused qualification remains on one immutable clock
                // and therefore never enters this live coalescing path.
                const timeInvalidation = shouldInvalidateCloudLightForTime({
                    lightVolumeState: cloudLightState,
                    requestedEpoch: requestedCloudLightAdvectionEpoch,
                    activeEpoch: cloudLightAdvectionEpoch,
                    boundGeneration: cloudLightBoundGeneration,
                    transportedGeneration:
                        cloudLightLastTransportCompletedGeneration,
                });
                const cloudLightInvalidationPending =
                    structuralInvalidation || timeInvalidation;
                if (strictCloudTransportTransaction &&
                    (cloudLightInvalidationPending ||
                        strictCloudTransportTransaction.identity.lightGeneration !==
                            cloudLightBoundGeneration ||
                        strictCloudTransportTransaction.identity.transportOrdinal !==
                            transportUpdates)) {
                    cancelStrictCloudTransport();
                }
                // Keep the immutable previous cloud history on screen while a
                // target light-volume generation warms. Running a fresh view
                // transport in the same submission as exact morphology both
                // mixes lighting epochs and can make the queue fence inherit
                // an unrelated full-frame march. Transport resumes immediately
                // after atomic light publication.
                const cloudLightTransportEpochReady =
                    isCloudLightTransportEpochReady({
                        refreshWorkPending: cloudLightRefreshWork !== null,
                        invalidationPending: cloudLightInvalidationPending,
                    });
                const qualificationTransportEligible =
                    !current.paused ||
                    transportUpdates < CLOUD_QUALIFICATION_TRANSPORT_UPDATES ||
                    (
                        forceCloud &&
                        transportUpdates ===
                            CLOUD_QUALIFICATION_TRANSPORT_UPDATES &&
                        historyAcceptanceFraction === null
                    );
                const strictTransportContinuation = current.paused &&
                    strictCloudTransportTransaction !== null;
                let updateCloud =
                    hasVolumetricContent && cloudLightTransportEpochReady &&
                    !coldLightingWarmupPending && qualificationTransportEligible &&
                    (strictTransportContinuation || forceCloud || !historyValid ||
                        seconds - lastCloudUpdate >= cloudInterval);
                // Lighting and transport belong to one coherent frame. The
                // former isolated cold-lighting submission held the first
                // visible cloud frame behind onSubmittedWorkDone(), leaving a
                // blank sky for seconds and amplifying GPU stalls on launch.
                const lightingWarmupOnly = false;
                // Paused transport becomes a submitted sample only when its
                // final packet tile commits below. Intermediate batches must
                // not swap temporal history, advance counters, or signal light
                // generation use.
                let transportedCloud = updateCloud && !current.paused &&
                    !lightingWarmupOnly;
                // Paused photographic qualification consumes diagnostics only
                // after its complete immutable history horizon. Dispatching
                // both reductions and mapping their staging buffers throughout
                // the tail can serialize otherwise independent transports on
                // some WebGPU implementations without changing a single output
                // pixel. Live diagnostics retain their existing cadence.
                const qualificationDiagnosticsDue = !current.paused ||
                    transportUpdates + 1 >=
                        CLOUD_QUALIFICATION_TRANSPORT_UPDATES;
                let transportedCloudLightGeneration: number | null =
                    transportedCloud && cloudLightState === "complete" &&
                            cloudLightBoundGeneration > 0
                        ? cloudLightBoundGeneration
                        : null;
                let historyProgress = historyValid
                    ? Math.min(1, (seconds - lastCloudUpdate) / cloudInterval)
                    : 1;
                if (updateCloud) historyProgress = 0;
                const profile = SKY_QUALITY_PROFILES[current.options.quality];
                const warmupScale = transportUpdates === 0
                    ? 0.45
                    : transportUpdates === 1
                        ? 0.65
                        : transportUpdates === 2
                            ? 0.82
                            : 1;
                const requestedViewSteps = Math.max(
                    6,
                    Math.round(profile.viewSteps * warmupScale),
                );
                const requestedLightSteps = Math.max(
                    1,
                    Math.round(profile.lightSteps * warmupScale),
                );
                const resolvedWeather = resolveProductionWeatherScene(
                    authoredWeather ?? {
                        clock: {
                            snapshotTimeSeconds: seconds,
                            sceneTimeSeconds: cloudClock,
                            deterministicSeed: Math.floor(
                                current.radiance.seed[0] * 0xffff_ffff,
                            ) >>> 0,
                        },
                    },
                );
                let packedWeatherScene: ResolvedProductionWeatherScene =
                    resolvedWeather;
                if (!resolvedWeather.valid) {
                    // Production never uploads a partially accepted scene.
                    // Invalid authoring fails closed to the finite empty state.
                    packedWeatherScene = resolveProductionWeatherScene({
                        clock: {
                            snapshotTimeSeconds: seconds,
                            sceneTimeSeconds: cloudClock,
                            deterministicSeed: 0,
                        },
                    });
                } else if (authoredWeather) {
                    packedWeatherScene = {
                        ...resolvedWeather,
                        clock: {
                            ...resolvedWeather.clock,
                            snapshotTimeSeconds: seconds,
                            sceneTimeSeconds: resolvedWeather.clock
                                .sceneTimeSeconds + Math.max(0, seconds - startTime),
                        },
                    };
                }
                const nextPackedWeatherSceneData =
                    packResolvedProductionWeatherScene(packedWeatherScene).data;
                const packedWeatherSceneData = strictCloudTransportTransaction
                    ? strictCloudTransportTransaction.frozenWeatherScene
                    : nextPackedWeatherSceneData;
                device.queue.writeBuffer(
                    weatherSceneUniformBuffer,
                    0,
                    packedWeatherSceneData,
                );
                const initializeTransportSample = updateCloud &&
                    (!current.paused || strictCloudTransportTransaction === null);
                if (initializeTransportSample) {
                    const nextTransportCamera = createPackedCameraState(
                        current.radiance, width, height,
                    );
                    const nextTransportYawRadians =
                        cameraYawRadiansFromViewAzimuth(
                            current.radiance.viewAzimuth,
                        );
                    previousTransportCamera = currentTransportCamera;
                    currentTransportCamera = nextTransportCamera;
                    previousTransportYawRadians = currentTransportYawRadians;
                    currentTransportYawRadians = nextTransportYawRadians;
                    activeTransportDeltaSeconds =
                        resolveCloudTransportDeltaSeconds({
                            historyAvailable: historyValid,
                            previousCloudClock: previousTransportCloudClock,
                            currentCloudClock: cloudClock,
                        });
                    previousTransportCloudClock = cloudClock;
                    activeViewSteps = requestedViewSteps;
                    activeLightSteps = requestedLightSteps;
                    activeTransportIndex = transportUpdates;
                    // Keep every transport update spatially complete while the
                    // cloud image is being qualified. Alternating checkerboard
                    // transport made soft density boundaries resolve as a
                    // diagonal fabric pattern under motion.
                    activeInterleavedTransport = false;
                }
                const atmosphereFrame = createPhysicalAtmosphereFrame(
                    current.radiance,
                    current.celestial,
                    current.physicalAtmosphereState,
                );
                const nextParameters = createParameterData(
                    current.radiance,
                    current.celestial,
                    atmosphereFrame.grade,
                    loadedLunarProfile,
                    current.options,
                    width,
                    height,
                    cloudWidth,
                    cloudHeight,
                    cloudClock,
                    frame,
                    historyProgress,
                    historyValid,
                    requestedViewSteps,
                    requestedLightSteps,
                    activeTransportIndex,
                    activeInterleavedTransport,
                    currentTransportCamera,
                    previousTransportCamera,
                    currentTransportYawRadians,
                    previousTransportYawRadians,
                    activeTransportDeltaSeconds,
                    updateCloud,
                    current.paused,
                );
                const parameters = strictCloudTransportTransaction
                    ? strictCloudTransportTransaction.frozenParameters
                    : nextParameters;
                let timestampReadRequestedThisFrame = false;
                let coldTimestampReadRequestedThisFrame = false;
                let coldWarmupSubmittedThisFrame = false;
                let submittedTransportOrdinal: number | null = null;
                let metricsReadRequestedThisFrame = false;
                let reconstructionMetricsReadRequestedThisFrame = false;
                let cloudLightCompletionGenerationThisFrame: number | null = null;
                let cloudLightExactSubmissionSerialThisFrame: number | null = null;
                let cloudLightResidualReadThisFrame: {
                    generation: number;
                    brickIndex: number;
                    cycle: number;
                } | null = null;
                device.queue.writeBuffer(parameterBuffer, 0, parameters);
                if (cloudRuntime.signature !== lastCloudSystemSignature) {
                    lastCloudSystemSignature = cloudRuntime.signature;
                    const cloudOpticsOwnerRuntime = createCloudOpticsOwnerRuntime(
                        cloudRuntime,
                        loadedCloudOptics,
                    );
                    activeCloudOpticsOwnerSelections =
                        cloudOpticsOwnerRuntime.selections;
                    device.queue.writeBuffer(
                        cloudSystemBuffer,
                        0,
                        cloudRuntime.packedSystemData.data,
                    );
                    device.queue.writeBuffer(
                        cloudMacroBindingBuffer,
                        0,
                        createCloudMacroBindingData(
                            cloudRuntime.systems,
                            cloudMacroAtlas.manifest,
                        ),
                    );
                    device.queue.writeBuffer(
                        cloudFeatureBuffer,
                        0,
                        cloudRuntime.legacyFeatureData,
                    );
                    device.queue.writeBuffer(
                        cloudOpticsOwnerBuffer,
                        0,
                        cloudOpticsOwnerRuntime.data,
                    );
                }
                if (morphologySignature !== lastCloudMorphologySignature) {
                    lastCloudMorphologySignature = morphologySignature;
                    const packedMorphology = packCloudMorphologyModifiers(
                        loadedCloudMorphology,
                        cloudRuntime.morphologyRequests,
                    );
                    activePackedMorphology = packedMorphology;
                    activeMorphologyLayerBounds = morphologyLayerBounds(
                        packedMorphology,
                        cloudRuntime.morphologyOwnerLayers,
                    );
                    activeMorphologyOwnerBounds = packedMorphology.inflatedBounds;
                    device.queue.writeTexture(
                        { texture: cloudMorphologyTexture },
                        packedMorphology.data,
                        {
                            bytesPerRow: packedMorphology.bytesPerRow,
                            rowsPerImage: packedMorphology.height,
                        },
                        {
                            width: packedMorphology.width,
                            height: packedMorphology.height,
                            depthOrArrayLayers: 1,
                        },
                    );
                    for (const diagnostic of packedMorphology.diagnostics) {
                        if (diagnostic.severity === "error") {
                            console.warn(`Cloud morphology: ${diagnostic.message}`);
                        }
                    }
                }
                device.queue.writeBuffer(
                    layerBuffer,
                    0,
                    createLayerData(
                        current.radiance.cloudScene,
                        activeMorphologyLayerBounds,
                    ),
                );
                const visibilityObserverAtmosphere: AtmosphereVec3 = [
                    0,
                    0,
                    atmosphereFrame.state.bottomRadiusKm +
                        atmosphereFrame.state.observerAltitudeKm,
                ];
                const visibilitySourceDirections =
                    atmosphereFrame.lighting.sources.map((source) =>
                        source.direction);
                const visibilityOwners = createCloudRadiativeOwnerDomains(
                    cloudRuntime.systems.map((system, ownerIndex) =>
                        cloudRadiativeOwnerInputFromRuntime(
                            system,
                            ownerIndex,
                            activeMorphologyOwnerBounds.get(ownerIndex),
                        )),
                );
                const visibilityDomains = createDirectionalCloudVisibilityDomains({
                    owners: visibilityOwners,
                    observerAtmosphereWorldKm: visibilityObserverAtmosphere,
                    sourceDirectionsAtmosphere: visibilitySourceDirections,
                });
                if (!visibilityDomains.validation.valid) {
                    throw new Error("Directional cloud visibility domains are invalid: " +
                        visibilityDomains.validation.reasons.join(", "));
                }
                // Directional visibility and the light volume are one
                // immutable lighting generation. While exact work is warming
                // (and until its first published view transport completes),
                // keep the cascade on that generation's epoch. Otherwise a
                // slow solve would rebuild the large visibility cascade on
                // every exact completion fence as the live clock advanced.
                const cloudLightGenerationEpochIsFrozen =
                    cloudLightRefreshWork !== null ||
                    cloudLightState === "warming" ||
                    (cloudLightState === "complete" &&
                        cloudLightLastTransportCompletedGeneration !==
                            cloudLightBoundGeneration);
                const directionalVisibilityAdvectionEpoch =
                    visibilityOwners.length > 0 &&
                    atmosphereFrame.lighting.sources.some(
                        (source) => source.enabled !== false)
                        ? Math.max(0, cloudLightGenerationEpochIsFrozen
                            ? cloudLightAdvectionEpoch
                            : requestedCloudLightAdvectionEpoch)
                        : 0;
                const nextDirectionalVisibilitySignature =
                    createDirectionalCloudVisibilityInvalidationSignature({
                        cloudRuntimeSignature: cloudRuntime.signature,
                        morphologySignature,
                        extinctionSignature: JSON.stringify({
                            phaseTexture:
                                loadedCloudOptics.manifest.checksums.phaseTexture,
                            parameterBuffer:
                                loadedCloudOptics.manifest.checksums.parameterBuffer,
                            sources: atmosphereFrame.lighting.sources.map(
                                (source) => source.enabled !== false),
                        }),
                        advectionEpoch: directionalVisibilityAdvectionEpoch,
                        observerAtmosphereWorldKm: visibilityObserverAtmosphere,
                        sourceDirectionsAtmosphere: visibilitySourceDirections,
                        domains: visibilityDomains.domains,
                    });
                if (strictCloudTransportTransaction &&
                    strictCloudTransportTransaction.identity
                        .directionalVisibilityKey !==
                            nextDirectionalVisibilitySignature) {
                    // Never finish a packet set across two cascade epochs.
                    // The already written packet tiles remain private and are
                    // cleared when the replacement transaction reaches their
                    // packet layer.
                    cancelStrictCloudTransport();
                    updateCloud = false;
                    transportedCloud = false;
                    transportedCloudLightGeneration = null;
                }
                const updateDirectionalCloudVisibility =
                    !couplingShadowsInitialized ||
                    nextDirectionalVisibilitySignature !==
                        directionalCloudVisibilitySignature;
                if (updateDirectionalCloudVisibility) {
                    directionalCloudVisibilityGeneration =
                        (directionalCloudVisibilityGeneration + 1) >>> 0;
                    device.queue.writeBuffer(
                        directionalCloudVisibilityUniformBuffer,
                        0,
                        packDirectionalCloudVisibilityUniform(
                            visibilityDomains.domains,
                            directionalCloudVisibilityGeneration,
                        ),
                    );
                    device.queue.writeBuffer(
                        directionalCloudVisibilityOwnerMaskBuffer,
                        0,
                        createDirectionalCloudVisibilityOwnerMasks({
                            owners: visibilityOwners,
                            domains: visibilityDomains.domains,
                            observerAtmosphereWorldKm:
                                visibilityDomains.observerAtmosphereWorldKm,
                            sourceDirectionsAtmosphere:
                                visibilityDomains.sourceDirectionsAtmosphere,
                        }),
                    );
                    directionalCloudVisibilitySignature =
                        nextDirectionalVisibilitySignature;
                }
                const cloudLightSources = createCloudLightVolumeSources(
                    current.radiance);
                if (captureDrawTrace) {
                    reportCaptureStage(`draw-${captureDrawOrdinal}-visibility-ready`);
                }
                if (structuralInvalidation || timeInvalidation) {
                    const macroVolumesByOwner = createCloudMacroVolumesByOwner(
                        cloudRuntime.systems,
                        loadedCloudMacroAtlas.manifest,
                    );
                    const cloudLightRuntime = createCloudLightVolumeRuntime({
                        systems: cloudRuntime.systems,
                        sources: cloudLightSources,
                        morphologyBoundsByOwner: activeMorphologyOwnerBounds,
                        macroSupportByOwner: createCloudLightVolumeMacroSupports(
                            cloudRuntime.systems,
                            loadedCloudMacroAtlas,
                        ),
                        lightingSignature: `${cloudLightLightingSignature}:` +
                            `morphology=${morphologySignature}:` +
                            `advection=${requestedCloudLightAdvectionEpoch}`,
                    });
                    const fibratusSourceQualification = activePackedMorphology
                        ? qualifyCloudLightVolumePlainFibratusSourcePath({
                            systems: cloudRuntime.systems,
                            macroVolumesByOwner,
                            morphology: activePackedMorphology,
                            retainedBricks: cloudLightRuntime.bricks,
                        })
                        : null;
                    const missingLightPipelines: Promise<void>[] = [];
                    if (cloudLightRuntime.residentLayerMask !== 0 &&
                        !cloudLightMeasureResidualPipeline) {
                        missingLightPipelines.push(
                            ensureCloudLightP1Pipelines());
                    }
                    if (packedWeatherScene.lightning !== null &&
                        !cloudLightLightningPipeline) {
                        missingLightPipelines.push(
                            ensureCloudLightLightningPipeline());
                    }
                    if (missingLightPipelines.length > 0) {
                        waitForRuntimePipelines(missingLightPipelines);
                        return;
                    }
                    cloudLightStructuralKey = nextCloudLightStructuralKey;
                    cloudLightAdvectionEpoch = requestedCloudLightAdvectionEpoch;
                    device.queue.writeBuffer(
                        cloudLightParameterSnapshotBuffer, 0, parameters);
                    if (cloudLightRuntime.signature !== cloudLightSignature) {
                        const retiredFibratusSourceStagingBuffers =
                            cloudLightFibratusSourceStagingBuffers;
                        cloudLightFibratusSourceStagingBuffers = [];
                        if (retiredFibratusSourceStagingBuffers.length > 0) {
                            void device.queue.onSubmittedWorkDone().then(() => {
                                retiredFibratusSourceStagingBuffers.forEach(
                                    (buffer) => buffer.destroy(),
                                );
                            });
                        }
                        cloudLightSignature = cloudLightRuntime.signature;
                        cloudLightTargetGeneration += 1;
                        cloudLightActiveSourceMask = cloudLightRuntime.sources.reduce(
                            (mask, source) => source.active
                                ? mask | (source.kind === "sun" ? 1 : 2)
                                : mask,
                            0,
                        );
                        cloudLightHasLightning = packedWeatherScene.lightning !== null;
                        cloudLightFibratusSourceOwnerIndices = new Set(
                            fibratusSourceQualification?.eligibleOwnerIndices ?? [],
                        );
                        cloudLightSourceBricks = cloudLightRuntime.bricks;
                        cloudLightFibratusSourceContexts = new Map(
                            [...cloudLightFibratusSourceOwnerIndices].flatMap(
                                (ownerIndex) => {
                                    const system = cloudRuntime.systems[ownerIndex];
                                    const volume = macroVolumesByOwner.get(ownerIndex);
                                    const opticsSelection =
                                        activeCloudOpticsOwnerSelections[ownerIndex];
                                    if (!system || !volume || !opticsSelection) return [];
                                    const localOptics = resolveCloudLocalOptics(
                                        opticsSelection,
                                        1,
                                    );
                                    return [[ownerIndex, {
                                        densityAtWorld:
                                            createCloudFibratusAtlasDensitySampler({
                                                atlasBytes:
                                                    loadedCloudMacroAtlas.atlasBytes,
                                                atlasDimensions:
                                                    loadedCloudMacroAtlas.manifest
                                                        .atlas.dimensions,
                                                volumeResolution:
                                                    loadedCloudMacroAtlas.manifest
                                                        .atlas.volumeResolution,
                                                sdfRangeVoxels: Number(
                                                    loadedCloudMacroAtlas.manifest
                                                        .atlas.channels.a
                                                        .rangeVoxels ?? 12,
                                                ),
                                                volume,
                                                system,
                                            }),
                                        extinctionRgbPerKm:
                                            resolveCloudFibratusExtinctionRgbPerKm({
                                                system,
                                                volume,
                                                massExtinctionRgbM2PerKg:
                                                    localOptics
                                                        .massExtinctionRgbM2PerKg,
                                            }),
                                    }] as const];
                                },
                            ),
                        );
                        cloudLightPackedBricks = cloudLightRuntime.packedBricks.data;
                        cloudLightBrickKeys = cloudLightRuntime.brickKeys;
                        cloudLightBrickCount = cloudLightRuntime.bricks.length;
                        cloudLightTargetBank = 1 - cloudLightActiveBank;
                        cloudLightTargetResidentLayerMask =
                            cloudLightRuntime.residentLayerMask;
                        cloudLightTargetResidentOwnerMask =
                            cloudLightRuntime.residentOwnerMask;
                        cloudLightMaximumResidual = null;
                        cloudLightResidualNonFiniteCount = 0;
                        cloudLightResidualEnergyViolationCount = 0;
                        cloudLightResidualOccupiedCount = 0;
                        cloudLightMaximumFluence = [0, 0, 0];
                        cloudLightMaximumNumerator = [0, 0, 0];
                        cloudLightMaximumDenominator = [0, 0, 0];
                        cloudLightMaximumBoundary = [0, 0, 0];
                        cloudLightMaximumCandidate = [0, 0, 0];
                        cloudLightNearStorageRailCount = 0;
                        cloudLightResidualFailure = "";
                        cloudLightRefreshWork = cloudLightBrickCount > 0 ? {
                            generation: cloudLightTargetGeneration,
                            brickIndex: 0,
                            // A direct-only generation needs exact Beer grids
                            // and an explicit vacuum fluence field, but no
                            // morphology volume or P1 hierarchy.
                            phase: cloudLightTargetResidentLayerMask !== 0
                                ? "material" : "source-materialize-sun",
                            slabStart: 0,
                            iteration: 0,
                            level: cloudLightTargetResidentLayerMask !== 0
                                ? 1 : 0,
                            cycle: 1,
                        } : null;
                        device.queue.writeBuffer(
                            cloudLightBrickBuffer, 0, cloudLightPackedBricks);
                        device.queue.writeBuffer(
                            cloudLightSourceBuffer, 0,
                            packCloudLightVolumeSources(cloudLightRuntime.sources));
                        if (cloudLightBrickCount > 0) {
                            // The complete active bank/header remains untouched
                            // while every target brick is solved and qualified.
                            cloudLightState = "warming";
                        } else {
                            cloudLightViewPackedBricks = new Float32Array(
                                cloudLightPackedBricks);
                            cloudLightReadyMask = 0;
                            cloudLightActiveResidentLayerMask = 0;
                            cloudLightActiveResidentOwnerMask = [0, 0];
                            device.queue.writeBuffer(
                                cloudLightViewUniformBuffer,
                                0,
                                packCloudLightVolumeViewUniforms(
                                    cloudLightViewPackedBricks,
                                    0,
                                    undefined,
                                    cloudLightActiveBank,
                                    0,
                                    [0, 0],
                                ),
                            );
                            // A non-empty cloud scene can legitimately have no
                            // publishable low-frequency cache: every selected
                            // owner may fail the direct optical-cell bound. In
                            // that case ready-mask zero is the explicit vacuum
                            // P1 field and identity Beer field. Publish the
                            // exact-only generation immediately instead of
                            // constructing cache data which the shader masks
                            // make impossible to sample.
                            cloudLightState =
                                cloudLightRuntime.selectedOwnerCount > 0
                                    ? "complete" : "empty";
                            cloudLightBoundGeneration = cloudLightTargetGeneration;
                        }
                        exposeCloudLightState();
                    }
                }

                const nextHydrometeorSignature = [
                    cloudRuntime.signature,
                    current.radiance.humidity.toPrecision(6),
                    current.radiance.solarAltitude.toPrecision(6),
                    current.radiance.cloudScene.fog.toPrecision(6),
                    current.radiance.observerAltitude.toPrecision(6),
                    createHydrometeorSceneOverrideSignature(
                        current.radiance.hydrometeors,
                    ),
                ].join(":");
                if (nextHydrometeorSignature !== lastHydrometeorSignature) {
                    lastHydrometeorSignature = nextHydrometeorSignature;
                    const hydrometeors = createHydrometeorRuntimeForRadiance(
                        current.radiance,
                        cloudRuntime.systems,
                    );
                    device.queue.writeBuffer(
                        hydrometeorBuffer,
                        0,
                        hydrometeors.packed.data,
                    );
                }

                const atmosphereUpdate = physicalAtmosphere.update(
                    atmosphereFrame.state,
                    atmosphereFrame.lighting,
                );
                if (atmosphereUpdate.uniformChanged) backgroundDirty = true;

                const encoder = device.createCommandEncoder();
                physicalAtmosphere.encodePendingLutUpdates(encoder);
                const updateCouplingShadows = updateDirectionalCloudVisibility;
                if (updateCouplingShadows) {
                    const couplingShadowBindGroup = device.createBindGroup({
                        layout: cloudCouplingShadowBindGroupLayout,
                        entries: [
                            { binding: 0, resource: { buffer: parameterBuffer } },
                            { binding: 1, resource: { buffer: layerBuffer } },
                            { binding: 2, resource: baseVolume.createView() },
                            { binding: 3, resource: detailVolume.createView() },
                            { binding: 5, resource: volumeSampler },
                            { binding: 16, resource: cloudMacroAtlas.atlasTexture.createView!() },
                            { binding: 17, resource: cloudMacroAtlas.majorantTexture.createView!() },
                            { binding: 18, resource: cloudMacroSampler },
                            {
                                binding: 32,
                                resource: cloudMacroAtlas.highIceSourceAtlasTexture.createView!(),
                            },
                            { binding: 19, resource: { buffer: cloudSystemBuffer } },
                            { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                            {
                                binding: 23,
                                resource: { buffer: cloudOptics.parameterBuffer },
                            },
                            {
                                binding: 24,
                                resource: { buffer: cloudOpticsOwnerBuffer },
                            },
                            {
                                binding: 25,
                                resource: { buffer: physicalAtmosphere.bindings.uniformBuffer },
                            },
                            { binding: 30, resource: cloudMorphologyView },
                            {
                                binding: 31,
                                resource: physicalAtmosphere.bindings
                                    .directionalCouplingAtlasStorageView,
                            },
                            {
                                binding: 34,
                                resource: {
                                    buffer: directionalCloudVisibilityUniformBuffer,
                                },
                            },
                            {
                                binding: 36,
                                resource: {
                                    buffer: directionalCloudVisibilityOwnerMaskBuffer,
                                },
                            },
                        ],
                    });
                    const couplingPass = encoder.beginComputePass({
                        label: "cloud source-shadow coupling cascades",
                    });
                    couplingPass.setPipeline(cloudCouplingShadowPipeline);
                    couplingPass.setBindGroup(0, couplingShadowBindGroup);
                    couplingPass.dispatchWorkgroups(
                        ...DIRECTIONAL_CLOUD_VISIBILITY_DISPATCH);
                    couplingPass.end();
                    couplingShadowsInitialized = true;
                    backgroundDirty = true;
                }
                if (!coldLightingWarmupPending &&
                    !cloudLightResidualReadPending &&
                    cloudLightExactSubmissionPendingSerial === null &&
                    cloudLightRefreshWork !== null) {
                    if (captureDrawTrace) {
                        reportCaptureStage(
                            `draw-${captureDrawOrdinal}-light-step-start-` +
                                `${cloudLightRefreshWork.phase}-` +
                                `b${cloudLightRefreshWork.brickIndex}`,
                        );
                    }
                    let exactPassCount = 0;
                    for (let stepIndex = 0;
                        stepIndex < CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW &&
                        cloudLightRefreshWork !== null;
                        stepIndex += 1) {
                        const activeWork = cloudLightRefreshWork;
                        const result = encodeCloudLightBrickRefreshStep(
                            encoder,
                            activeWork,
                            cloudLightUniformBuffers[stepIndex],
                        );
                        if (result === "exact-progress") {
                            exactPassCount += 1;
                            // One independently bounded exact slab owns the
                            // compute-only submission. This caps production at
                            // 48 x 32 x 1 = 1,536 exact cell queries while the
                            // distinct ring buffers retain correct coordinates
                            // for cached passes encoded before it.
                            if (exactPassCount >=
                                CLOUD_LIGHT_VOLUME_EXACT_PASSES_PER_SUBMISSION) {
                                break;
                            }
                            continue;
                        }
                        if (result === "cpu-progress") {
                            break;
                        }
                        if (result === "residual-read") {
                            cloudLightResidualReadPending = true;
                            cloudLightResidualReadThisFrame = {
                                generation: activeWork.generation,
                                brickIndex: activeWork.brickIndex,
                                cycle: activeWork.cycle,
                            };
                            break;
                        }
                        if (result === "generation-complete") {
                            cloudLightRefreshWork = null;
                            cloudLightCompletionGenerationThisFrame =
                                activeWork.generation;
                            break;
                        }
                    }
                    if (exactPassCount > 0) {
                        cloudLightExactSubmissionSerial += 1;
                        cloudLightExactSubmissionPendingSerial =
                            cloudLightExactSubmissionSerial;
                        cloudLightExactSubmissionSerialThisFrame =
                            cloudLightExactSubmissionSerial;
                    }
                    exposeCloudLightState();
                    if (captureDrawTrace) {
                        reportCaptureStage(
                            `draw-${captureDrawOrdinal}-light-step-return-` +
                                `${cloudLightRefreshWork?.phase ?? "complete"}-` +
                                `b${cloudLightRefreshWork?.brickIndex ?? -1}`,
                        );
                    }
                }
                if (cloudLightExactSubmissionSerialThisFrame !== null) {
                    // Exact morphology is deliberately a compute-only queue
                    // unit. Finishing here prevents background LUT draws,
                    // stars, glow, temporal reconstruction and presentation
                    // from becoming passengers on its global completion
                    // fence. The canvas keeps its last presented frame while
                    // this bounded 1,536-cell pass warms.
                    const submittedSerial =
                        cloudLightExactSubmissionSerialThisFrame;
                    const reportExactSubmissionBoundary =
                        captureInitializationTelemetry &&
                        (submittedSerial <= 2 || submittedSerial % 16 === 0);
                    if (reportExactSubmissionBoundary) {
                        reportCaptureStage(
                            `light-submit-finish-start-${submittedSerial}`);
                    }
                    const exactCommands = encoder.finish();
                    if (reportExactSubmissionBoundary) {
                        reportCaptureStage(
                            `light-submit-finish-returned-${submittedSerial}`);
                    }
                    device.queue.submit([exactCommands]);
                    if (reportExactSubmissionBoundary) {
                        reportCaptureStage(
                            `light-submit-returned-${submittedSerial}`);
                    }
                    armCloudLightExactSubmissionFence(submittedSerial);
                    if (reportExactSubmissionBoundary) {
                        reportCaptureStage(
                            `light-submit-fence-armed-${submittedSerial}`);
                    }
                    return;
                }
                if (cloudTargetsNeedClear) {
                    const clearViews = (
                        views: readonly any[],
                        clearValue: {
                            r: number;
                            g: number;
                            b: number;
                            a: number;
                        },
                    ) => {
                        // The low-resolution stochastic transport and the
                        // full-resolution resolved history intentionally have
                        // different extents. WebGPU requires every attachment
                        // in one render pass to share an extent, so clear each
                        // view independently. This reset is infrequent and
                        // avoids coupling resource size to attachment order.
                        views.forEach((view) => {
                            const pass = encoder.beginRenderPass({
                                label: "initialize neutral cloud history",
                                colorAttachments: [{
                                    view,
                                    clearValue,
                                    loadOp: "clear",
                                    storeOp: "store",
                                }],
                            });
                            pass.end();
                        });
                    };
                    clearViews(
                        [
                            transportLayerView(cloudCurrent, 0),
                            transportLayerView(cloudPrevious, 0),
                            transportLayerView(resolvedCloudCurrent, 0),
                            transportLayerView(resolvedCloudPrevious, 0),
                        ],
                        { r: 0, g: 0, b: 0, a: 0 },
                    );
                    clearViews(
                        [
                            transportLayerView(cloudCurrent, 1),
                            transportLayerView(cloudPrevious, 1),
                            transportLayerView(resolvedCloudCurrent, 1),
                            transportLayerView(resolvedCloudPrevious, 1),
                        ],
                        { r: 1, g: 1, b: 1, a: 1 },
                    );
                    clearViews(
                        [geometryCurrent.createView(), geometryPrevious.createView()],
                        { r: 140, g: 140, b: 0, a: 0 },
                    );
                    clearViews(
                        [motionCurrent.createView(), motionPrevious.createView()],
                        { r: 0, g: 0, b: -1, a: 0 },
                    );
                    cloudTargetsNeedClear = false;
                    if (!hasVolumetricContent) {
                        historyValid = true;
                        temporalNeedsClear = true;
                        lastCloudUpdate = seconds;
                    }
                }
                if (backgroundDirty) {
                    const atmosphereBindGroup = device.createBindGroup({
                        layout: atmospherePipeline.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: parameterBuffer } },
                            {
                                binding: 1,
                                resource: { buffer: physicalAtmosphere.bindings.uniformBuffer },
                            },
                            {
                                binding: 2,
                                resource: physicalAtmosphere.bindings.transmittanceView,
                            },
                            {
                                binding: 3,
                                resource: physicalAtmosphere.bindings
                                    .multipleScatteringView,
                            },
                            {
                                binding: 4,
                                resource: physicalAtmosphere.bindings.skyView,
                            },
                            { binding: 6, resource: physicalAtmosphere.bindings.sampler },
                            {
                                binding: 7,
                                resource: physicalAtmosphere.bindings
                                    .directionalCouplingAtlasView,
                            },
                            {
                                binding: 34,
                                resource: {
                                    buffer: directionalCloudVisibilityUniformBuffer,
                                },
                            },
                        ],
                    });
                    const backgroundPass = encoder.beginRenderPass({
                        colorAttachments: [{
                            view: backgroundTexture.createView(),
                            clearValue: { r: 0, g: 0, b: 0, a: 1 },
                            loadOp: "clear",
                            storeOp: "store",
                        }],
                    });
                    backgroundPass.setPipeline(atmospherePipeline);
                    backgroundPass.setBindGroup(0, atmosphereBindGroup);
                    backgroundPass.draw(3);
                    const moon = current.celestial.moon;
                    if (current.options.debugView !==
                            "lighting-atmosphere-shadow-loss" &&
                        moon.visible && moon.opacity > 0.001) {
                        const moonBindGroup = device.createBindGroup({
                            layout: moonPipeline.getBindGroupLayout(0),
                            entries: [
                                { binding: 0, resource: { buffer: parameterBuffer } },
                                { binding: 1, resource: lunarTexture.createView() },
                                { binding: 2, resource: lunarSampler },
                            ],
                        });
                        const moonAtmosphereBindGroup = device.createBindGroup({
                            layout: moonPipeline.getBindGroupLayout(1),
                            entries: [
                                {
                                    binding: 0,
                                    resource: {
                                        buffer: physicalAtmosphere.bindings.uniformBuffer,
                                    },
                                },
                                {
                                    binding: 1,
                                    resource: physicalAtmosphere.bindings.transmittanceView,
                                },
                                {
                                    binding: 5,
                                    resource: physicalAtmosphere.bindings.sampler,
                                },
                            ],
                        });
                        backgroundPass.setPipeline(moonPipeline);
                        backgroundPass.setBindGroup(0, moonBindGroup);
                        backgroundPass.setBindGroup(1, moonAtmosphereBindGroup);
                        backgroundPass.setVertexBuffer(0, cornerBuffer);
                        backgroundPass.draw(6);
                    }
                    backgroundPass.end();
                    backgroundDirty = false;
                }

                if (updateCloud) {
                    if (!current.paused) {
                        const swap = cloudPrevious;
                        cloudPrevious = cloudCurrent;
                        cloudCurrent = swap;
                        const geometrySwap = geometryPrevious;
                        geometryPrevious = geometryCurrent;
                        geometryCurrent = geometrySwap;
                        const motionSwap = motionPrevious;
                        motionPrevious = motionCurrent;
                        motionCurrent = motionSwap;
                    }
                    const intervalBindGroup = device.createBindGroup({
                        layout: cloudIntervalPipeline.getBindGroupLayout(0),
                        entries: [
                            { binding: 0, resource: { buffer: parameterBuffer } },
                            { binding: 1, resource: { buffer: layerBuffer } },
                        ],
                    });
                    if (!current.paused ||
                        strictCloudTransportTransaction === null) {
                    const intervalPass = encoder.beginRenderPass({
                        ...(cloudTimestampQuery ? {
                            timestampWrites: {
                                querySet: cloudTimestampQuery,
                                beginningOfPassWriteIndex: 0,
                                endOfPassWriteIndex: 1,
                            },
                        } : {}),
                        colorAttachments: [
                            {
                                view: intervalLowMiddle.createView(),
                                clearValue: { r: 140, g: 0, b: 140, a: 0 },
                                loadOp: "clear",
                                storeOp: "store",
                            },
                            {
                                view: intervalHighMask.createView(),
                                clearValue: { r: 140, g: 0, b: 0, a: 0 },
                                loadOp: "clear",
                                storeOp: "store",
                            },
                        ],
                    });
                    intervalPass.setPipeline(cloudIntervalPipeline);
                    intervalPass.setBindGroup(0, intervalBindGroup);
                    intervalPass.draw(3);
                    intervalPass.end();
                    }
                    if (!lightingWarmupOnly) {
                        const cloudBindGroupEntries = [
                            { binding: 0, resource: { buffer: parameterBuffer } },
                            { binding: 1, resource: { buffer: layerBuffer } },
                            { binding: 2, resource: baseVolume.createView() },
                            { binding: 3, resource: detailVolume.createView() },
                            { binding: 4, resource: weatherTexture.createView() },
                            { binding: 5, resource: volumeSampler },
                            {
                                binding: 6,
                                resource: physicalAtmosphere.bindings.transmittanceView,
                            },
                            { binding: 7, resource: intervalLowMiddle.createView() },
                            { binding: 8, resource: intervalHighMask.createView() },
                            { binding: 9, resource: blueNoiseTexture.createView() },
                            {
                                binding: 14,
                                resource: physicalAtmosphere.bindings
                                    .directionalCouplingAtlasView,
                            },
                            { binding: 15, resource: { buffer: cloudFeatureBuffer } },
                            { binding: 16, resource: cloudMacroAtlas.atlasTexture.createView!() },
                            { binding: 17, resource: cloudMacroAtlas.majorantTexture.createView!() },
                            { binding: 18, resource: cloudMacroSampler },
                            {
                                binding: 32,
                                resource: cloudMacroAtlas.highIceSourceAtlasTexture.createView!(),
                            },
                            { binding: 19, resource: { buffer: cloudSystemBuffer } },
                            { binding: 20, resource: { buffer: cloudMacroBindingBuffer } },
                            {
                                binding: 21,
                                resource: cloudOptics.phaseTexture.createView!(),
                            },
                            { binding: 22, resource: cloudOptics.phaseSampler },
                            {
                                binding: 23,
                                resource: { buffer: cloudOptics.parameterBuffer },
                            },
                            {
                                binding: 24,
                                resource: { buffer: cloudOpticsOwnerBuffer },
                            },
                            {
                                binding: 25,
                                resource: { buffer: physicalAtmosphere.bindings.uniformBuffer },
                            },
                            {
                                binding: 26,
                                resource: physicalAtmosphere.bindings.multipleScatteringView,
                            },
                            { binding: 28, resource: physicalAtmosphere.bindings.sampler },
                            {
                                binding: 29,
                                resource: { buffer: hydrometeorBuffer },
                            },
                            { binding: 30, resource: cloudMorphologyView },
                            {
                                binding: 34,
                                resource: {
                                    buffer: directionalCloudVisibilityUniformBuffer,
                                },
                            },
                            {
                                binding: 35,
                                resource: { buffer: weatherSceneUniformBuffer },
                            },
                        ];
                        const cloudBindGroup = device.createBindGroup({
                            layout: cloudTransportGroup0Layout,
                            entries: cloudBindGroupEntries,
                        });
                        const cloudLightViewEntries = [
                            {
                                binding: 0,
                                resource: { buffer: cloudLightViewUniformBuffer },
                            },
                            {
                                binding: 1,
                                resource: cloudLightPackedView.createView(),
                            },
                            {
                                binding: 2,
                                resource: cloudLightLightning.createView(),
                            },
                        ];
                        const cloudLightViewBindGroup = device.createBindGroup({
                            layout: cloudTransportGroup1Layout,
                            entries: cloudLightViewEntries,
                        });
                        const packetTargets = [
                            {
                                texture: cloudLayerRadianceFirstDepth,
                                clearValue: { r: 0, g: 0, b: 0, a: 140 },
                            },
                            {
                                texture: cloudLayerTransmittanceMeanDepth,
                                clearValue: { r: 1, g: 1, b: 1, a: 140 },
                            },
                            {
                                texture: cloudLayerMotionSteps,
                                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                            },
                        ];
                        const packetPipelines = [
                            cloudLayerPipeline,
                            cloudLayerPipeline,
                            cloudLayerPipeline,
                            hydrometeorLayerPipeline,
                            upperAtmosphereLayerPipeline,
                        ];
                        const encodePacketPass = (
                            packetLayer: number,
                            tiles: readonly CloudTransportRasterTile[] | null,
                            clearPacket: boolean,
                        ) => {
                            const packetPass = encoder.beginRenderPass({
                                ...(cloudTimestampQuery && packetLayer === 0 &&
                                    clearPacket ? {
                                    timestampWrites: {
                                        querySet: cloudTimestampQuery,
                                        beginningOfPassWriteIndex: 2,
                                    },
                                } : {}),
                                colorAttachments: packetTargets.map((target) => ({
                                    view: target.texture.createView({
                                        dimension: "2d",
                                        baseArrayLayer: packetLayer,
                                        arrayLayerCount: 1,
                                    }),
                                    clearValue: target.clearValue,
                                    loadOp: clearPacket ? "clear" : "load",
                                    storeOp: "store",
                                })),
                            });
                            const packetPipeline = packetPipelines[packetLayer];
                            if (!packetPipeline) {
                                // An unreachable optional medium is exactly the
                                // identity clear already written above. Keep its
                                // packet slot so compositor order and ABI remain
                                // byte-for-byte unchanged without compiling the
                                // absent transport graph.
                                packetPass.end();
                                return;
                            }
                            packetPass.setPipeline(packetPipeline);
                            packetPass.setBindGroup(0, cloudBindGroup);
                            packetPass.setBindGroup(1,
                                cloudLightViewBindGroup);
                            if (tiles === null) {
                                packetPass.draw(
                                    3,
                                    1,
                                    0,
                                    packetLayer < 3 ? packetLayer : 0,
                                );
                            } else {
                                for (const tile of tiles) {
                                    packetPass.setScissorRect(
                                        tile.x, tile.y,
                                        tile.width, tile.height);
                                    packetPass.draw(
                                        3,
                                        1,
                                        0,
                                        packetLayer < 3 ? packetLayer : 0,
                                    );
                                }
                            }
                            packetPass.end();
                        };
                        if (current.paused) {
                            const identity: CloudTransportTransactionIdentity = {
                                sceneKey: strictSceneKey,
                                directionalVisibilityKey:
                                    directionalCloudVisibilitySignature,
                                lightGeneration: cloudLightBoundGeneration,
                                width: cloudWidth,
                                height: cloudHeight,
                                transportOrdinal: transportUpdates,
                            };
                            if (strictCloudTransportTransaction === null) {
                                const rasterSchedule =
                                    createCloudTransportRasterSchedule(
                                        cloudWidth,
                                        cloudHeight,
                                        adapterInfo,
                                    );
                                strictCloudTransportSerial += 1;
                                strictCloudTransportTransaction = {
                                    serial: strictCloudTransportSerial,
                                    identity,
                                    cursor: { packetIndex: 0, tileIndex: 0 },
                                    tiles: rasterSchedule.tiles,
                                    maximumPixelsPerSubmission:
                                        rasterSchedule.maximumPixelsPerSubmission,
                                    maximumPacketBatchesPerSubmission:
                                        rasterSchedule
                                            .maximumPacketBatchesPerSubmission,
                                    frozenParameters: new Float32Array(parameters),
                                    frozenWeatherScene:
                                        new Float32Array(packedWeatherSceneData),
                                };
                            }
                            const transaction = strictCloudTransportTransaction;
                            if (!cloudTransportTransactionIdentityMatches(
                                transaction.identity, identity)) {
                                // This path is defensive: all known input
                                // changes cancel earlier, before encoding. A
                                // mismatched transaction is never eligible for
                                // a terminal commit.
                                cancelStrictCloudTransport();
                                updateCloud = false;
                                transportedCloud = false;
                                transportedCloudLightGeneration = null;
                                const replacementSerial =
                                    strictCloudTransportSerial;
                                strictCloudTransportSubmissionPending = true;
                                device.queue.submit([encoder.finish()]);
                                armStrictCloudTransportSubmissionFence(
                                    replacementSerial);
                                return;
                            } else {
                                const submission =
                                    createCloudTransportRasterSubmission(
                                        transaction.cursor,
                                        transaction.tiles,
                                        transaction.maximumPixelsPerSubmission,
                                        CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
                                        transaction
                                            .maximumPacketBatchesPerSubmission,
                                    );
                                for (const batch of submission.batches) {
                                    encodePacketPass(
                                        batch.packetIndex,
                                        batch.tiles,
                                        batch.clearPacket,
                                    );
                                }
                                const finalBatch = submission.batches.at(-1)!;
                                canvas.dataset.cloudTransportTransaction =
                                    `${transaction.identity.transportOrdinal}:` +
                                    `${finalBatch.packetIndex}:` +
                                    `${transaction.cursor.tileIndex}:` +
                                    `${transaction.tiles.length}`;
                                if (!submission.terminalCommit) {
                                    transaction.cursor = submission.nextCursor!;
                                    const submittedSerial = transaction.serial;
                                    const firstBatch = submission.batches[0]!;
                                    const firstTile = firstBatch.tiles[0]!;
                                    const lastBatch =
                                        submission.batches.at(-1)!;
                                    const lastTile =
                                        lastBatch.tiles.at(-1)!;
                                    const captureTrace =
                                        captureInitializationTelemetry &&
                                            transportUpdates === 0
                                            ? `u0-p${firstBatch.packetIndex}-` +
                                                `${lastBatch.packetIndex}-` +
                                                `xy${firstTile.x},${firstTile.y}-` +
                                                `${lastTile.x + lastTile.width},` +
                                                `${lastTile.y + lastTile.height}-` +
                                                `px${submission.shadedPixels}`
                                            : undefined;
                                    if (captureTrace) {
                                        reportCaptureStage(
                                            `transport-submit-${captureTrace}`);
                                    }
                                    strictCloudTransportSubmissionPending = true;
                                    device.queue.submit([encoder.finish()]);
                                    armStrictCloudTransportSubmissionFence(
                                        submittedSerial,
                                        captureTrace,
                                    );
                                    return;
                                }

                                // Commit the raw target swap only after all
                                // five private packet layers are complete. A
                                // cancelled transaction therefore cannot put a
                                // partial packet set into either history bank.
                                const swap = cloudPrevious;
                                cloudPrevious = cloudCurrent;
                                cloudCurrent = swap;
                                const geometrySwap = geometryPrevious;
                                geometryPrevious = geometryCurrent;
                                geometryCurrent = geometrySwap;
                                const motionSwap = motionPrevious;
                                motionPrevious = motionCurrent;
                                motionCurrent = motionSwap;
                                strictCloudTransportTransaction = null;
                                canvas.dataset.cloudTransportTransaction =
                                    "committing";
                                transportedCloud = true;
                                transportedCloudLightGeneration =
                                    cloudLightState === "complete" &&
                                        cloudLightBoundGeneration > 0
                                        ? cloudLightBoundGeneration
                                        : null;
                            }
                        } else {
                            for (let packetLayer = 0;
                                packetLayer < packetPipelines.length;
                                packetLayer += 1) {
                                encodePacketPass(packetLayer, null, true);
                            }
                        }
                        const cloudLayerCompositorBindGroup = device.createBindGroup({
                            layout: cloudLayerCompositorPipeline.getBindGroupLayout(0),
                            entries: [
                                {
                                    binding: 0,
                                    resource: cloudLayerRadianceFirstDepth.createView({
                                        dimension: "2d-array",
                                    }),
                                },
                                {
                                    binding: 1,
                                    resource: cloudLayerTransmittanceMeanDepth.createView({
                                        dimension: "2d-array",
                                    }),
                                },
                                {
                                    binding: 2,
                                    resource: cloudLayerMotionSteps.createView({
                                        dimension: "2d-array",
                                    }),
                                },
                                {
                                    binding: 3,
                                    resource: { buffer: parameterBuffer },
                                },
                            ],
                        });
                        const cloudPass = encoder.beginRenderPass({
                            ...(cloudTimestampQuery ? {
                                timestampWrites: {
                                    querySet: cloudTimestampQuery,
                                    endOfPassWriteIndex: 3,
                                },
                            } : {}),
                            colorAttachments: [
                                {
                                    view: transportLayerView(cloudCurrent, 0),
                                    clearValue: { r: 0, g: 0, b: 0, a: 0 },
                                    loadOp: "load",
                                    storeOp: "store",
                                },
                                {
                                    view: transportLayerView(cloudCurrent, 1),
                                    clearValue: { r: 1, g: 1, b: 1, a: 1 },
                                    loadOp: "load",
                                    storeOp: "store",
                                },
                                {
                                    view: geometryCurrent.createView(),
                                    clearValue: { r: 140, g: 140, b: 0, a: 0 },
                                    loadOp: "load",
                                    storeOp: "store",
                                },
                                {
                                    view: motionCurrent.createView(),
                                    clearValue: { r: 0, g: 0, b: -1, a: 0 },
                                    loadOp: "load",
                                    storeOp: "store",
                                },
                            ],
                        });
                        cloudPass.setPipeline(cloudLayerCompositorPipeline);
                        cloudPass.setBindGroup(0, cloudLayerCompositorBindGroup);
                        cloudPass.draw(3);
                        cloudPass.end();
                        // Final-color qualification also needs proof that cloud
                        // radiance reached the G-buffer. Production skies do
                        // not supply an onStats observer, so this diagnostic
                        // reduction remains absent from ordinary rendering.
                        if ((current.options.debugView !== "final" || current.onStats) &&
                            qualificationDiagnosticsDue && !metricsReadPending) {
                        device.queue.writeBuffer(
                            cloudMetricsBuffer,
                            0,
                            new Uint32Array(8),
                        );
                        const metricsBindGroup = device.createBindGroup({
                            layout: cloudMetricsPipeline.getBindGroupLayout(0),
                            entries: [
                                {
                                    binding: 0,
                                    resource: transportLayerView(cloudCurrent, 1),
                                },
                                { binding: 1, resource: intervalHighMask.createView() },
                                { binding: 2, resource: { buffer: parameterBuffer } },
                                { binding: 3, resource: { buffer: cloudMetricsBuffer } },
                                { binding: 4, resource: motionCurrent.createView() },
                                {
                                    binding: 5,
                                    resource: transportLayerView(cloudCurrent, 0),
                                },
                            ],
                        });
                        const metricsPass = encoder.beginComputePass({
                            label: "diagnostic projected cloud coverage",
                        });
                        metricsPass.setPipeline(cloudMetricsPipeline);
                        metricsPass.setBindGroup(0, metricsBindGroup);
                        metricsPass.dispatchWorkgroups(8, 5, 1);
                        metricsPass.end();
                        encoder.copyBufferToBuffer(
                            cloudMetricsBuffer,
                            0,
                            cloudMetricsRead,
                            0,
                            32,
                        );
                        metricsReadPending = true;
                        metricsReadRequestedThisFrame = true;
                        }
                        if (cloudTimestampQuery && cloudTimestampResolve) {
                            encoder.resolveQuerySet(cloudTimestampQuery, 0, 4, cloudTimestampResolve, 0);
                            if (
                                (transportUpdates === 0 || frame % 8 === 0) &&
                                !timestampReadPending && cloudTimestampRead
                            ) {
                                encoder.copyBufferToBuffer(cloudTimestampResolve, 0, cloudTimestampRead, 0, 32);
                                timestampReadPending = true;
                                timestampReadRequestedThisFrame = true;
                            }
                        }
                        lastCloudUpdate = seconds;
                        submittedTransportOrdinal = transportUpdates;
                        transportUpdates += 1;
                    } else {
                        if (
                            cloudTimestampQuery && coldCloudTimestampResolve &&
                            coldCloudTimestampRead && !coldTimestampReadPending
                        ) {
                            encoder.resolveQuerySet(
                                cloudTimestampQuery,
                                0,
                                4,
                                coldCloudTimestampResolve,
                                0,
                            );
                            encoder.copyBufferToBuffer(
                                coldCloudTimestampResolve,
                                0,
                                coldCloudTimestampRead,
                                0,
                                32,
                            );
                            coldTimestampReadPending = true;
                            coldTimestampReadRequestedThisFrame = true;
                        }
                        coldLightingWarmupPending = true;
                        coldWarmupSubmittedThisFrame = true;
                    }
                }

                // Stars live in their own HDR target. Their unresolved core is
                // composited at full resolution while only bright-source
                // energy enters the low-resolution atmospheric PSF.
                const stellarActive =
                    starCount > 0 && current.celestial.starsOpacity > 0.001;
                const starPass = encoder.beginRenderPass({
                    colorAttachments: [{
                        view: starTexture.createView(),
                        clearValue: { r: 0, g: 0, b: 0, a: 0 },
                        loadOp: "clear",
                        storeOp: "store",
                    }],
                });
                if (stellarActive) {
                    const starBindGroup = device.createBindGroup({
                        layout: starPipeline.getBindGroupLayout(0),
                        entries: [{ binding: 0, resource: { buffer: parameterBuffer } }],
                    });
                    starPass.setPipeline(starPipeline);
                    starPass.setBindGroup(0, starBindGroup);
                    starPass.setVertexBuffer(0, cornerBuffer);
                    starPass.setVertexBuffer(1, starBuffer);
                    starPass.draw(6, starCount);
                }
                starPass.end();

                const renderGlowPass = (
                    pipeline: any,
                    target: any,
                    entries: Array<{ binding: number; resource: any }>,
                ) => {
                    const pass = encoder.beginRenderPass({
                        colorAttachments: [{
                            view: target.createView(),
                            clearValue: { r: 0, g: 0, b: 0, a: 0 },
                            loadOp: "clear",
                            storeOp: "store",
                        }],
                    });
                    pass.setPipeline(pipeline);
                    pass.setBindGroup(0, device.createBindGroup({
                        layout: pipeline.getBindGroupLayout(0),
                        entries,
                    }));
                    pass.draw(3);
                    pass.end();
                };
                const sourceEntries = (texture: any) => [
                    { binding: 0, resource: sampler },
                    { binding: 1, resource: texture.createView() },
                ];
                const shouldRefreshGlow =
                    stellarActive && current.celestial.stellarGlow > 0.001 &&
                    (!glowAvailable || seconds - lastGlowUpdate >= 1 / 3);
                if (shouldRefreshGlow) {
                    renderGlowPass(glowExtractPipeline, glowHalfA, [
                        ...sourceEntries(starTexture),
                        {
                            binding: 2,
                            resource: transportLayerView(cloudCurrent, 1),
                        },
                    ]);
                    renderGlowPass(glowBlurHPipeline, glowHalfB, sourceEntries(glowHalfA));
                    renderGlowPass(glowBlurVPipeline, glowHalfA, sourceEntries(glowHalfB));
                    renderGlowPass(glowDownsamplePipeline, glowQuarterA, sourceEntries(glowHalfA));
                    renderGlowPass(glowBlurHPipeline, glowQuarterB, sourceEntries(glowQuarterA));
                    renderGlowPass(glowBlurVPipeline, glowQuarterA, sourceEntries(glowQuarterB));
                    renderGlowPass(glowDownsamplePipeline, glowEighthA, sourceEntries(glowQuarterA));
                    renderGlowPass(glowBlurHPipeline, glowEighthB, sourceEntries(glowEighthA));
                    renderGlowPass(glowBlurVPipeline, glowEighthA, sourceEntries(glowEighthB));
                    glowAvailable = true;
                    glowNeedsClear = false;
                    lastGlowUpdate = seconds;
                } else if (
                    (!stellarActive || current.celestial.stellarGlow <= 0.001) &&
                    (glowNeedsClear || glowAvailable)
                ) {
                    // Clear only the sampled sides; scratch textures are never
                    // read until a complete active glow chain overwrites them.
                    [glowHalfA, glowQuarterA, glowEighthA].forEach((target) => {
                        const pass = encoder.beginRenderPass({
                            colorAttachments: [{
                                view: target.createView(),
                                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                                loadOp: "clear",
                                storeOp: "store",
                            }],
                        });
                        pass.end();
                    });
                    glowAvailable = false;
                    glowNeedsClear = false;
                }

                const temporalSwap = temporalPrevious;
                temporalPrevious = temporalCurrent;
                temporalCurrent = temporalSwap;
                const resolvedCloudSwap = resolvedCloudPrevious;
                resolvedCloudPrevious = resolvedCloudCurrent;
                resolvedCloudCurrent = resolvedCloudSwap;
                if (temporalNeedsClear) {
                    const temporalClearPass = encoder.beginRenderPass({
                        colorAttachments: [{
                            view: temporalPrevious.createView(),
                            clearValue: { r: 0, g: 0, b: 0, a: 0 },
                            loadOp: "clear",
                            storeOp: "store",
                        }],
                    });
                    temporalClearPass.end();
                    temporalNeedsClear = false;
                }
                const compositeBindGroup = device.createBindGroup({
                    layout: compositePipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: sampler },
                        { binding: 1, resource: backgroundTexture.createView() },
                        { binding: 2, resource: transportArrayView(cloudCurrent) },
                        { binding: 3, resource: transportArrayView(cloudPrevious) },
                        { binding: 4, resource: geometryCurrent.createView() },
                        { binding: 5, resource: geometryPrevious.createView() },
                        { binding: 6, resource: motionCurrent.createView() },
                        { binding: 7, resource: motionPrevious.createView() },
                        { binding: 8, resource: { buffer: parameterBuffer } },
                        { binding: 9, resource: starTexture.createView() },
                        { binding: 10, resource: glowHalfA.createView() },
                        { binding: 11, resource: glowQuarterA.createView() },
                        { binding: 12, resource: glowEighthA.createView() },
                        { binding: 13, resource: temporalPrevious.createView() },
                        {
                            binding: 14,
                            resource: transportArrayView(resolvedCloudPrevious),
                        },
                    ],
                });
                const compositePass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: context.getCurrentTexture().createView(),
                            clearValue: { r: 0, g: 0, b: 0, a: 1 },
                            loadOp: "clear",
                            storeOp: "store",
                        },
                        {
                            view: temporalCurrent.createView(),
                            clearValue: { r: 0, g: 0, b: 0, a: 0 },
                            loadOp: "clear",
                            storeOp: "store",
                        },
                        {
                            view: transportLayerView(resolvedCloudCurrent, 0),
                            clearValue: { r: 0, g: 0, b: 0, a: 0 },
                            loadOp: "clear",
                            storeOp: "store",
                        },
                        {
                            view: transportLayerView(resolvedCloudCurrent, 1),
                            clearValue: { r: 1, g: 1, b: 1, a: 1 },
                            loadOp: "clear",
                            storeOp: "store",
                        },
                    ],
                });
                compositePass.setPipeline(compositePipeline);
                compositePass.setBindGroup(0, compositeBindGroup);
                compositePass.draw(3);
                compositePass.end();
                if (
                    transportedCloud &&
                    (current.options.debugView !== "final" || current.onStats) &&
                    qualificationDiagnosticsDue &&
                    !reconstructionMetricsReadPending
                ) {
                    device.queue.writeBuffer(
                        cloudReconstructionMetricsBuffer,
                        0,
                        new Uint32Array(20),
                    );
                    const reconstructionMetricsBindGroup =
                        device.createBindGroup({
                            layout: cloudReconstructionMetricsPipeline
                                .getBindGroupLayout(0),
                            entries: [
                                {
                                    binding: 0,
                                    resource: transportLayerView(cloudCurrent, 0),
                                },
                                {
                                    binding: 1,
                                    resource: transportLayerView(cloudPrevious, 0),
                                },
                                {
                                    binding: 2,
                                    resource: transportLayerView(cloudCurrent, 1),
                                },
                                {
                                    binding: 3,
                                    resource: transportLayerView(cloudPrevious, 1),
                                },
                                { binding: 4, resource: geometryCurrent.createView() },
                                { binding: 5, resource: geometryPrevious.createView() },
                                { binding: 6, resource: temporalCurrent.createView() },
                                { binding: 7, resource: temporalPrevious.createView() },
                                {
                                    binding: 8,
                                    resource: transportArrayView(resolvedCloudCurrent),
                                },
                                {
                                    binding: 9,
                                    resource: transportArrayView(resolvedCloudPrevious),
                                },
                                { binding: 10, resource: { buffer: parameterBuffer } },
                                {
                                    binding: 11,
                                    resource: {
                                        buffer: cloudReconstructionMetricsBuffer,
                                    },
                                },
                            ],
                        });
                    const reconstructionMetricsPass = encoder.beginComputePass({
                        label: "diagnostic cloud temporal reconstruction",
                    });
                    reconstructionMetricsPass.setPipeline(
                        cloudReconstructionMetricsPipeline,
                    );
                    reconstructionMetricsPass.setBindGroup(
                        0, reconstructionMetricsBindGroup,
                    );
                    reconstructionMetricsPass.dispatchWorkgroups(8, 5, 1);
                    reconstructionMetricsPass.end();
                    encoder.copyBufferToBuffer(
                        cloudReconstructionMetricsBuffer,
                        0,
                        cloudReconstructionMetricsRead,
                        0,
                        80,
                    );
                    reconstructionMetricsReadPending = true;
                    reconstructionMetricsReadRequestedThisFrame = true;
                }
                const submissionStarted = performance.now();
                const submittedMeasurementGeneration = measurementGeneration;
                device.queue.submit([encoder.finish()]);
                if (transportedCloudLightGeneration !== null &&
                    cloudLightLastTransportCompletedGeneration !==
                        transportedCloudLightGeneration &&
                    cloudLightTransportCompletionPendingGeneration !==
                        transportedCloudLightGeneration) {
                    const submittedGeneration = transportedCloudLightGeneration;
                    cloudLightTransportCompletionPendingGeneration =
                        submittedGeneration;
                    void device.queue.onSubmittedWorkDone().then(() => {
                        if (cloudLightTransportCompletionPendingGeneration ===
                            submittedGeneration) {
                            cloudLightLastTransportCompletedGeneration =
                                submittedGeneration;
                            cloudLightTransportCompletionPendingGeneration = null;
                            exposeCloudLightState();
                            wakeRef.current?.();
                        }
                    }).catch(() => {
                        if (cloudLightTransportCompletionPendingGeneration ===
                            submittedGeneration) {
                            cloudLightTransportCompletionPendingGeneration = null;
                            exposeCloudLightState();
                            wakeRef.current?.();
                        }
                    });
                }
                if (cloudLightResidualReadThisFrame !== null && MAP_MODE) {
                    const request = cloudLightResidualReadThisFrame;
                    void cloudLightResidualReadBuffer.mapAsync(MAP_MODE.READ).then(() => {
                        const mapped = cloudLightResidualReadBuffer.getMappedRange();
                        const words = new Uint32Array(mapped);
                        const residual = new Float32Array(mapped)[0];
                        const nonFiniteCount = words[1];
                        const energyViolationCount = words[2];
                        const occupiedCount = words[3];
                        const diagnostics = new Float32Array(mapped);
                        const maximumFluence = Array.from(
                            diagnostics.slice(4, 7));
                        const maximumNumerator = Array.from(
                            diagnostics.slice(7, 10));
                        const maximumDenominator = Array.from(
                            diagnostics.slice(10, 13));
                        const maximumBoundary = Array.from(
                            diagnostics.slice(13, 16));
                        const maximumCandidate = Array.from(
                            diagnostics.slice(16, 19));
                        const nearStorageRailCount = words[19];
                        cloudLightResidualReadBuffer.unmap();
                        cloudLightResidualReadPending = false;
                        if (disposed ||
                            request.generation !== cloudLightTargetGeneration ||
                            cloudLightRefreshWork === null ||
                            cloudLightRefreshWork.generation !== request.generation ||
                            cloudLightRefreshWork.brickIndex !== request.brickIndex ||
                            cloudLightRefreshWork.phase !== "await-residual") {
                            return;
                        }
                        cloudLightMaximumResidual = Number.isFinite(residual)
                            ? residual : null;
                        cloudLightResidualNonFiniteCount = nonFiniteCount;
                        cloudLightResidualEnergyViolationCount =
                            energyViolationCount;
                        cloudLightResidualOccupiedCount = occupiedCount;
                        cloudLightMaximumFluence = maximumFluence;
                        cloudLightMaximumNumerator = maximumNumerator;
                        cloudLightMaximumDenominator = maximumDenominator;
                        cloudLightMaximumBoundary = maximumBoundary;
                        cloudLightMaximumCandidate = maximumCandidate;
                        cloudLightNearStorageRailCount = nearStorageRailCount;
                        const qualified = occupiedCount > 0 &&
                            nonFiniteCount === 0 && energyViolationCount === 0 &&
                            nearStorageRailCount === 0 &&
                            Number.isFinite(residual) &&
                            residual <= cloudLightPlan.config.residualTolerance;
                        if (qualified) {
                            cloudLightRefreshWork.brickIndex = 0;
                            cloudLightRefreshWork.phase = "copy-direct";
                            cloudLightRefreshWork.slabStart = 0;
                            cloudLightResidualFailure = "";
                        } else if (request.cycle <
                            cloudLightPlan.config.maximumVCycles) {
                            cloudLightRefreshWork.cycle = request.cycle + 1;
                            cloudLightRefreshWork.brickIndex = 0;
                            cloudLightRefreshWork.phase = "pre-smooth";
                            cloudLightRefreshWork.level = 0;
                            cloudLightRefreshWork.iteration =
                                resolveCloudLightVolumeSmoothingParity(
                                    cloudLightPlan.config.preSmoothIterations,
                                    "packed",
                                ).requiresScratchSeed ? -1 : 0;
                            cloudLightRefreshWork.slabStart = 0;
                            cloudLightResidualFailure = occupiedCount === 0
                                ? "empty-occupied-domain"
                                : nonFiniteCount > 0
                                    ? "non-finite"
                                    : energyViolationCount > 0
                                        ? "energy-violation"
                                        : "residual-above-tolerance";
                        } else {
                            cloudLightResidualFailure = occupiedCount === 0
                                ? "empty-occupied-domain"
                                : nonFiniteCount > 0
                                    ? "non-finite"
                                    : energyViolationCount > 0
                                        ? "energy-violation"
                                        : "residual-ceiling-exceeded";
                            cloudLightRefreshWork = null;
                            cloudLightState = "failed";
                        }
                        exposeCloudLightState();
                        wakeRef.current?.();
                    }).catch(() => {
                        cloudLightResidualReadPending = false;
                        if (!disposed &&
                            request.generation === cloudLightTargetGeneration) {
                            cloudLightResidualFailure = "residual-readback-failed";
                            cloudLightRefreshWork = null;
                            cloudLightState = "failed";
                            exposeCloudLightState();
                        }
                    });
                } else if (cloudLightResidualReadThisFrame !== null) {
                    cloudLightResidualReadPending = false;
                    cloudLightResidualFailure = "residual-readback-unavailable";
                    cloudLightRefreshWork = null;
                    cloudLightState = "failed";
                    exposeCloudLightState();
                }
                if (cloudLightCompletionGenerationThisFrame !== null) {
                    const completedGeneration =
                        cloudLightCompletionGenerationThisFrame;
                    const completedBank = cloudLightTargetBank;
                    const completedRecords = new Float32Array(
                        cloudLightPackedBricks);
                    const completedBrickCount = cloudLightBrickCount;
                    const completedResidentLayerMask =
                        cloudLightTargetResidentLayerMask;
                    const completedResidentOwnerMask =
                        cloudLightTargetResidentOwnerMask;
                    void device.queue.onSubmittedWorkDone().then(() => {
                        if (!disposed &&
                            completedGeneration === cloudLightTargetGeneration &&
                            cloudLightRefreshWork === null) {
                            cloudLightActiveBank = completedBank;
                            cloudLightViewPackedBricks = completedRecords;
                            cloudLightReadyMask = completedBrickCount >= 32
                                ? 0xffffffff
                                : (2 ** completedBrickCount - 1) >>> 0;
                            cloudLightActiveResidentLayerMask =
                                completedResidentLayerMask;
                            cloudLightActiveResidentOwnerMask =
                                completedResidentOwnerMask;
                            device.queue.writeBuffer(
                                cloudLightViewUniformBuffer,
                                0,
                                packCloudLightVolumeViewUniforms(
                                    cloudLightViewPackedBricks,
                                    cloudLightReadyMask,
                                    undefined,
                                    cloudLightActiveBank,
                                    cloudLightActiveResidentLayerMask,
                                    cloudLightActiveResidentOwnerMask,
                                ),
                            );
                            cloudLightBoundGeneration = completedGeneration;
                            cloudLightState = "complete";
                            if (propsRef.current.paused) {
                                // Captures qualify only samples produced from
                                // the newly published, immutable light bank.
                                // Discard the pre-publication seed and run a
                                // bounded temporal convergence tail.
                                transportUpdates = 0;
                                activeTransportIndex = 0;
                                activeInterleavedTransport = false;
                                activeTransportDeltaSeconds = 0;
                                previousTransportCloudClock = Number.NaN;
                                historyValid = false;
                                temporalNeedsClear = true;
                                cloudTargetsNeedClear = true;
                            }
                            lastCloudUpdate = -Infinity;
                            exposeCloudLightState();
                            // The presentation scheduler deliberately sleeps
                            // while atomic publication is pending. Publication
                            // is therefore responsible for the one wake that
                            // starts the post-light qualification tail.
                            wakeRef.current?.();
                        }
                    });
                }
                if (
                    coldTimestampReadRequestedThisFrame &&
                    coldCloudTimestampRead && MAP_MODE
                ) {
                    void coldCloudTimestampRead.mapAsync(MAP_MODE.READ).then(() => {
                        if (!disposed &&
                            submittedMeasurementGeneration === measurementGeneration) {
                            const values = new BigUint64Array(
                                coldCloudTimestampRead.getMappedRange(),
                            );
                            const intervalNanoseconds = values[1] - values[0];
                            const lightingNanoseconds = values[3] - values[2];
                            coldCloudWarmupMs = Number(
                                intervalNanoseconds + lightingNanoseconds,
                            ) / 1_000_000;
                            enforceGpuBudget(coldCloudWarmupMs);
                            if (coldCloudWarmupMs > 18) {
                                cadenceScale = Math.max(0.2, cadenceScale * 0.58);
                            } else if (coldCloudWarmupMs > 8) {
                                cadenceScale = Math.max(0.3, cadenceScale * 0.78);
                            }
                        }
                        coldCloudTimestampRead.unmap();
                        coldTimestampReadPending = false;
                    }).catch(() => {
                        coldTimestampReadPending = false;
                    });
                }
                if (coldWarmupSubmittedThisFrame) {
                    void device.queue.onSubmittedWorkDone().then(() => {
                        if (!disposed &&
                            submittedMeasurementGeneration === measurementGeneration) {
                            coldCloudWarmupQueueMs = performance.now() - submissionStarted;
                            coldLightingWarmupComplete = true;
                            coldLightingWarmupPending = false;
                            if (!supportsTimestamps) {
                                enforceGpuBudget(coldCloudWarmupQueueMs);
                            }
                            window.requestAnimationFrame((time) => draw(time, true));
                        }
                    }).catch(() => {
                        if (submittedMeasurementGeneration === measurementGeneration) {
                            coldLightingWarmupPending = false;
                        }
                    });
                }
                if (metricsReadRequestedThisFrame && MAP_MODE) {
                    void cloudMetricsRead.mapAsync(MAP_MODE.READ).then(() => {
                        let publishCompletedCoverageMetrics = false;
                        if (!disposed &&
                            submittedMeasurementGeneration === measurementGeneration) {
                            const values = new Uint32Array(
                                cloudMetricsRead.getMappedRange(),
                            );
                            const totalWeight = Math.max(1, values[3]);
                            const floats = new Float32Array(values.buffer,
                                values.byteOffset, values.length);
                            projectedOpacity = values[0] / totalWeight;
                            occupiedSkyFraction = values[1] / totalWeight;
                            acceptedIntervalFraction = values[2] / totalWeight;
                            meanEvaluatedStepFraction = values[4] / totalWeight;
                            cloudTransportNonFiniteCount = values[5];
                            cloudRadianceNonFiniteCount = values[6];
                            cloudMaximumTransmittanceChroma = floats[7];
                            exposeCloudLightState();
                            publishCompletedCoverageMetrics =
                                propsRef.current.paused &&
                                transportUpdates >=
                                    CLOUD_QUALIFICATION_TRANSPORT_UPDATES;
                        }
                        cloudMetricsRead.unmap();
                        metricsReadPending = false;
                        // Coverage and reconstruction staging maps complete
                        // independently. Whichever finishes last must publish a
                        // presentation-only stats frame; otherwise readiness can
                        // retain the other callback's incomplete snapshot after
                        // the bounded transport scheduler has gone idle.
                        if (publishCompletedCoverageMetrics && !disposed) {
                            window.requestAnimationFrame((time) => draw(
                                time, false,
                            ));
                        }
                    }).catch(() => {
                        metricsReadPending = false;
                    });
                }
                if (reconstructionMetricsReadRequestedThisFrame && MAP_MODE) {
                    void cloudReconstructionMetricsRead.mapAsync(
                        MAP_MODE.READ,
                    ).then(() => {
                        let publishCompletedQualificationMetrics = false;
                        let needsOneHistoryDecisionSample = false;
                        if (!disposed &&
                            submittedMeasurementGeneration ===
                                measurementGeneration) {
                            const values = new Uint32Array(
                                cloudReconstructionMetricsRead.getMappedRange(),
                            );
                            const sampleCount = Math.max(1, values[0]);
                            const meanMetric = (index: number) =>
                                values[index] / sampleCount / 1_000_000;
                            rawRadianceTemporalDelta = meanMetric(1);
                            rawTransmittanceTemporalDelta = meanMetric(2);
                            resolvedRadianceTemporalDelta = meanMetric(3);
                            rawResolvedRadianceResidual = meanMetric(4);
                            const historyDecisions = values[5] + values[6];
                            historyAcceptanceFraction = historyDecisions > 0
                                ? values[5] / historyDecisions : null;
                            stableHistoryAge = meanMetric(7);
                            persistentHistoryConfidence = meanMetric(8);
                            rawRadianceSpatialVariation = meanMetric(9);
                            // The published resolved variation is the
                            // scale-separated full-resolution signal. The
                            // one-pixel companion is retained separately for
                            // diagnostics; readiness must not qualify a
                            // smooth bilinear result from raw-cloud spacing.
                            // Readiness uses the scale-separated full-resolution
                            // signal, not the adjacent low-resolution resolved
                            // sample. Keep this semantic mapping explicit: the
                            // WGSL fields at indices 10/11 are adjacent resolved
                            // diagnostics, while index 12 is the four-pixel
                            // full-resolution variation used for qualification.
                            resolvedRadianceSpatialVariation = meanMetric(12);
                            finalOutputAdjacentVariation = meanMetric(11);
                            finalOutputScaleSeparatedVariation = meanMetric(12);
                            firstDepthTemporalDelta = meanMetric(13);
                            meanDepthTemporalDelta = meanMetric(14);
                            opticalDepthTemporalDelta = meanMetric(15);
                            reconstructionRawNonFiniteCount = values[16];
                            reconstructionResolvedNonFiniteCount = values[17];
                            exposeCloudLightState();
                            publishCompletedQualificationMetrics =
                                propsRef.current.paused &&
                                transportUpdates >=
                                    CLOUD_QUALIFICATION_TRANSPORT_UPDATES;
                            needsOneHistoryDecisionSample =
                                historyAcceptanceFraction === null &&
                                transportUpdates ===
                                    CLOUD_QUALIFICATION_TRANSPORT_UPDATES;
                        }
                        cloudReconstructionMetricsRead.unmap();
                        reconstructionMetricsReadPending = false;
                        // The bounded paused scheduler may already be asleep by
                        // the time its final asynchronous audit maps. Publish
                        // those values through onStats with one presentation
                        // frame. In the pathological case where the first-ever
                        // readback stayed pending through the entire tail, allow
                        // exactly one extra immutable transport so the audit has
                        // a real history accept/reject decision to report.
                        if (publishCompletedQualificationMetrics && !disposed) {
                            window.requestAnimationFrame((time) => draw(
                                time, needsOneHistoryDecisionSample,
                            ));
                        }
                    }).catch(() => {
                        reconstructionMetricsReadPending = false;
                    });
                }
                if (timestampReadRequestedThisFrame && cloudTimestampRead && MAP_MODE) {
                    void cloudTimestampRead.mapAsync(MAP_MODE.READ).then(() => {
                        if (!disposed &&
                            submittedMeasurementGeneration === measurementGeneration) {
                            const values = new BigUint64Array(cloudTimestampRead.getMappedRange());
                            const intervalNanoseconds = values[1] - values[0];
                            const lightingNanoseconds = BigInt(0);
                            const transportNanoseconds = values[3] - values[2];
                            lastCloudIntervalMs = Number(intervalNanoseconds) / 1_000_000;
                            lastCloudLightingMs = Number(lightingNanoseconds) / 1_000_000;
                            lastCloudTransportMs = Number(transportNanoseconds) / 1_000_000;
                            const milliseconds = Number(
                                intervalNanoseconds + lightingNanoseconds + transportNanoseconds,
                            ) / 1_000_000;
                            if (submittedTransportOrdinal === 0) {
                                firstCloudUpdateMs = milliseconds;
                                firstCloudIntervalMs = Number(intervalNanoseconds) / 1_000_000;
                                firstCloudLightingMs = Number(lightingNanoseconds) / 1_000_000;
                                firstCloudTransportMs = Number(transportNanoseconds) / 1_000_000;
                            }
                            recordCloudGpuSample(milliseconds);
                            enforceGpuBudget(milliseconds);
                            cadenceScale = milliseconds > 18
                                ? Math.max(0.2, cadenceScale * 0.58)
                                : milliseconds > 8
                                    ? Math.max(0.3, cadenceScale * 0.78)
                                    : Math.min(1, cadenceScale + 0.02);
                        }
                        cloudTimestampRead.unmap();
                        timestampReadPending = false;
                    }).catch(() => {
                        timestampReadPending = false;
                    });
                } else if (
                    !supportsTimestamps && transportedCloud &&
                    (submittedTransportOrdinal === 0 || frame % 8 === 0)
                ) {
                    void device.queue.onSubmittedWorkDone().then(() => {
                        if (!disposed && updateCloud &&
                            submittedMeasurementGeneration === measurementGeneration) {
                            // Asynchronous queue completion is a conservative
                            // GPU-duty measurement. It never blocks rendering;
                            // timestamp queries can refine individual passes on
                            // adapters that expose the optional feature.
                            const milliseconds = performance.now() - submissionStarted;
                            if (submittedTransportOrdinal === 0) {
                                firstCloudUpdateMs = milliseconds;
                            }
                            recordCloudGpuSample(milliseconds);
                            enforceGpuBudget(milliseconds);
                            cadenceScale = milliseconds > 24
                                ? Math.max(0.2, cadenceScale * 0.6)
                                : milliseconds > 12
                                    ? Math.max(0.3, cadenceScale * 0.8)
                                    : Math.min(1, cadenceScale + 0.02);
                        }
                    });
                }

                const elapsed = performance.now() - drawStarted;
                lastCompositeCpuMs = elapsed;
                historyValid = historyValid || transportedCloud;
                frame += 1;
                const budgetStatus = overBudgetSamples > 0
                    ? "unsafe"
                    : transportUpdates < 4
                        ? "warming"
                        : cadenceScale < 0.99
                        ? "throttled"
                        : "nominal";
                const stats: SkyRendererStats = {
                    sceneKey: activeSceneKey,
                    backend: "webgpu",
                    quality: current.options.quality,
                    width,
                    height,
                    cloudWidth,
                    cloudHeight,
                    cloudUpdateMs: lastCloudGpuMs,
                    cloudIntervalMs: lastCloudIntervalMs,
                    cloudLightingMs: lastCloudLightingMs,
                    cloudTransportMs: lastCloudTransportMs,
                    coldCloudWarmupMs,
                    coldCloudWarmupQueueMs,
                    coldCloudWarmupComplete: coldLightingWarmupComplete,
                    firstCloudUpdateMs,
                    firstCloudIntervalMs,
                    firstCloudLightingMs,
                    firstCloudTransportMs,
                    projectedOpacity,
                    occupiedSkyFraction,
                    acceptedIntervalFraction,
                    meanEvaluatedStepFraction,
                    rawRadianceTemporalDelta,
                    rawTransmittanceTemporalDelta,
                    resolvedRadianceTemporalDelta,
                    rawResolvedRadianceResidual,
                    historyAcceptanceFraction,
                    stableHistoryAge,
                    persistentHistoryConfidence,
                    rawRadianceSpatialVariation,
                    resolvedRadianceSpatialVariation,
                    finalOutputAdjacentVariation,
                    finalOutputScaleSeparatedVariation,
                    firstDepthTemporalDelta,
                    meanDepthTemporalDelta,
                    opticalDepthTemporalDelta,
                    reconstructionRawNonFiniteCount,
                    reconstructionResolvedNonFiniteCount,
                    cloudUpdateP50Ms,
                    cloudUpdateP95Ms,
                    cloudUpdateMaxMs,
                    cloudTimingSamples: cloudGpuSamples.length,
                    transportUpdates,
                    cloudUnsafeSampleCount,
                    compositeMs: lastCompositeCpuMs,
                    textureMemoryMb:
                        ((width * height * 8.65625 +
                            cloudWidth * cloudHeight * 10.75) * 8 +
                            cloudWidth * cloudHeight *
                                CLOUD_LAYER_PACKET_BYTES_PER_PIXEL) /
                            (1024 * 1024) +
                        (cloudNoise.baseMips.reduce(
                            (total, level) => total + level.data.byteLength, 0) +
                            cloudNoise.detailMips.reduce(
                                (total, level) => total + level.data.byteLength, 0) +
                            cloudNoise.weather.byteLength * 4 + blueNoiseData.byteLength +
                            physicalAtmosphere.textureMemoryBytes) /
                            (1024 * 1024),
                    historyValid,
                    visible: !document.hidden,
                    effectiveUpdateRate: current.options.updateRate * cadenceScale,
                    requestedUpdateRate: current.options.updateRate,
                    cadenceScale,
                    viewSteps: activeViewSteps,
                    lightSteps: activeLightSteps,
                    interleavedTransport: activeInterleavedTransport,
                    transportPixelFraction: activeInterleavedTransport ? 0.5 : 1,
                    budgetStatus,
                    gpuTimingMode: supportsTimestamps
                        ? "timestamp-query"
                        : "queue-completion",
                    adapterInfo,
                };
                canvas.dataset.cloudGpuMs = lastCloudGpuMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudIntervalMs = lastCloudIntervalMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudLightingMs = lastCloudLightingMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudTransportMs = lastCloudTransportMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudColdWarmupMs =
                    coldCloudWarmupMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudColdWarmupQueueMs =
                    coldCloudWarmupQueueMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudColdWarmupComplete =
                    String(coldLightingWarmupComplete);
                canvas.dataset.cloudFirstUpdateMs =
                    firstCloudUpdateMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudFirstIntervalMs =
                    firstCloudIntervalMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudFirstLightingMs =
                    firstCloudLightingMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudFirstTransportMs =
                    firstCloudTransportMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudProjectedOpacity =
                    projectedOpacity?.toFixed(5) ?? "unavailable";
                canvas.dataset.cloudOccupiedSkyFraction =
                    occupiedSkyFraction?.toFixed(5) ?? "unavailable";
                canvas.dataset.cloudAcceptedIntervalFraction =
                    acceptedIntervalFraction?.toFixed(5) ?? "unavailable";
                canvas.dataset.cloudMeanEvaluatedStepFraction =
                    meanEvaluatedStepFraction?.toFixed(5) ?? "unavailable";
                canvas.dataset.cloudGpuP50Ms = cloudUpdateP50Ms?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudGpuP95Ms = cloudUpdateP95Ms?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudGpuMaxMs = cloudUpdateMaxMs?.toFixed(3) ?? "unavailable";
                canvas.dataset.cloudTimingSamples = String(cloudGpuSamples.length);
                canvas.dataset.cloudTransportUpdates = String(transportUpdates);
                canvas.dataset.cloudSceneKey = activeSceneKey;
                canvas.dataset.cloudUnsafeSampleCount = String(cloudUnsafeSampleCount);
                canvas.dataset.cloudCadenceScale = cadenceScale.toFixed(3);
                canvas.dataset.cloudBudgetStatus = budgetStatus;
                canvas.dataset.cloudResolution = `${cloudWidth}x${cloudHeight}`;
                canvas.dataset.cloudSamplingMode = cloudSamplingDecision.mode;
                canvas.dataset.cloudSamplingRequestedScale =
                    cloudSamplingDecision.requestedScale.toFixed(3);
                canvas.dataset.cloudSamplingEffectiveScale =
                    cloudSamplingDecision.effectiveScale.toFixed(3);
                canvas.dataset.cloudSamplingHighCloud =
                    String(cloudSamplingDecision.highCloudActive);
                canvas.dataset.cloudSamplingUpperAtmosphere =
                    String(cloudSamplingDecision.upperAtmosphereActive);
                const strictTransportReportingSchedule = current.paused
                    ? createCloudTransportRasterSchedule(
                        cloudWidth, cloudHeight, adapterInfo)
                    : null;
                canvas.dataset.cloudTransportDispatchMode = current.paused
                    ? `strict-${strictTransportReportingSchedule!.backend}`
                    : "fullscreen";
                canvas.dataset.cloudTransportDrawPixelCeiling = current.paused
                    ? String(
                        strictTransportReportingSchedule!.maximumPixelsPerDraw)
                    : "unbounded";
                canvas.dataset.cloudTransportSubmissionPixelCeiling =
                    current.paused
                        ? String(strictTransportReportingSchedule!
                            .maximumPixelsPerSubmission)
                        : "unbounded";
                canvas.dataset.cloudTransportPacketDraws = String(
                    current.paused
                        ? strictTransportReportingSchedule!.tiles.length *
                                CLOUD_STRICT_TRANSPORT_PACKET_COUNT
                        : CLOUD_STRICT_TRANSPORT_PACKET_COUNT,
                );
                canvas.dataset.cloudViewSteps = String(activeViewSteps);
                canvas.dataset.cloudLightSteps = String(activeLightSteps);
                canvas.dataset.cloudInterleaved = String(activeInterleavedTransport);
                canvas.dataset.cloudTransportPixelFraction = activeInterleavedTransport
                    ? "0.5"
                    : "1";
                if (captureInitializationTelemetry) {
                    const transportMilestone = transportUpdates >= 64
                        ? 64
                        : transportUpdates > 0 &&
                            (transportUpdates & (transportUpdates - 1)) === 0
                            ? transportUpdates
                            : -1;
                    if (transportMilestone > lastCaptureTransportMilestone) {
                        lastCaptureTransportMilestone = transportMilestone;
                        reportCaptureStage(
                            `transport-${transportMilestone}-${cloudLightState}`,
                        );
                    }
                    if (cloudLightState !== lastCaptureLightState) {
                        lastCaptureLightState = cloudLightState;
                        reportCaptureStage(`light-${cloudLightState}`);
                    }
                }
                if (captureDrawTrace) {
                    reportCaptureStage(`draw-${captureDrawOrdinal}-complete`);
                }
                current.onStats?.(stats);
            };

            redrawRef.current = () => {
                backgroundDirty = true;
                // Prop-driven redraws must respect the bounded transport
                // scheduler. A real cloud/camera/weather change invalidates
                // its history signature inside draw() and therefore schedules
                // a fresh sample without forcing every React redraw to bypass
                // the 64-sample qualification horizon.
                draw(performance.now(), false);
            };
            const schedule = () => {
                const captureScheduleTrace = captureInitializationTelemetry &&
                    captureDrawOrdinal < 24;
                if (disposed || cancelTimer !== undefined || animationFrame !== undefined) {
                    if (captureScheduleTrace) reportCaptureStage(
                        `schedule-skip-host-d${disposed ? 1 : 0}-` +
                            `t${cancelTimer !== undefined ? 1 : 0}-` +
                            `a${animationFrame !== undefined ? 1 : 0}-` +
                            `after-${captureDrawOrdinal}`,
                    );
                    return;
                }
                if (runtimePipelineCompilationPending) {
                    if (captureScheduleTrace) reportCaptureStage(
                        `schedule-skip-pipeline-after-${captureDrawOrdinal}`);
                    return;
                }
                if (strictCloudTransportSubmissionPending ||
                    strictCloudTransportContinuationTimer !== undefined ||
                    strictCloudTransportTransaction !== null) {
                    if (captureScheduleTrace) reportCaptureStage(
                        `schedule-skip-strict-s${strictCloudTransportSubmissionPending ? 1 : 0}-` +
                            `t${strictCloudTransportContinuationTimer !== undefined ? 1 : 0}-` +
                            `x${strictCloudTransportTransaction !== null ? 1 : 0}-` +
                            `after-${captureDrawOrdinal}`,
                    );
                    return;
                }
                const current = propsRef.current;
                // A paused capture must not enqueue presentation-only frames
                // behind an exact-query fence or residual map. Those frames
                // cannot advance the solve and turn each following exact pass
                // into an ever-growing queue backlog. Completion/readback owns
                // the wake that makes refresh work encodable again.
                const lightVolumeWarming = cloudLightRefreshWork !== null &&
                    cloudLightExactSubmissionPendingSerial === null &&
                    !cloudLightResidualReadPending;
                if (!shouldScheduleCloudRender({
                    hidden: document.hidden && !(
                        captureInitializationTelemetry && current.paused),
                    paused: current.paused,
                    lightVolumeWarming,
                    lightVolumeState: cloudLightState,
                    transportUpdates,
                    targetTransportUpdates:
                        CLOUD_QUALIFICATION_TRANSPORT_UPDATES,
                })) {
                    if (captureScheduleTrace) reportCaptureStage(
                        `schedule-skip-policy-${cloudLightState}-` +
                            `w${lightVolumeWarming ? 1 : 0}-` +
                            `u${transportUpdates}-after-${captureDrawOrdinal}`,
                    );
                    return;
                }
                const presentationRate = current.celestial.starsOpacity > 0.02
                    ? Math.min(6, Math.max(4, current.options.updateRate * 2))
                    : current.options.updateRate;
                const rate = lightVolumeWarming
                    ? Math.max(CLOUD_LIGHT_VOLUME_WARMING_RATE_HZ, presentationRate)
                    : presentationRate;
                if (captureScheduleTrace) reportCaptureStage(
                    `schedule-arm-${cloudLightState}-w${lightVolumeWarming ? 1 : 0}-` +
                        `after-${captureDrawOrdinal}`,
                );
                cancelTimer = window.setTimeout(() => {
                    cancelTimer = undefined;
                    // Offscreen native capture windows can suspend rAF even
                    // when Chromium's background throttling flags are disabled.
                    // A paused qualification scene has an immutable clock and a
                    // bounded update horizon, so advance it directly from this
                    // deliberately rate-limited timer. Interactive rendering
                    // remains presentation-synchronized below.
                    if (current.paused) {
                        if (captureInitializationTelemetry &&
                            captureDrawOrdinal < 24) {
                            reportCaptureStage(
                                `schedule-timer-after-${captureDrawOrdinal}`);
                        }
                        draw(performance.now());
                        schedule();
                        return;
                    }
                    animationFrame = window.requestAnimationFrame((time) => {
                        animationFrame = undefined;
                        if (captureInitializationTelemetry &&
                            captureDrawOrdinal < 24) {
                            reportCaptureStage(
                                `schedule-fire-after-${captureDrawOrdinal}`);
                        }
                        draw(time);
                        schedule();
                    });
                }, 1000 / Math.max(2,
                    rate * (lightVolumeWarming ? 1 : cadenceScale)));
            };
            const captureWindow = window as typeof window & {
                __elementsSkyRendererCaptureStep?: () => Promise<
                    "advanced" | "waiting" | "disposed">;
            };
            const captureStep = async () => {
                if (disposed) return "disposed" as const;
                // Serialize controller-driven work at the same queue boundary
                // used by exact-light and strict-transport publication. This is
                // both lower overhead than polling and gives their registered
                // promise callbacks a microtask turn before inspecting gates.
                if (strictCloudTransportSubmissionPending ||
                    cloudLightExactSubmissionPendingSerial !== null ||
                    cloudLightResidualReadPending ||
                    coldLightingWarmupPending) {
                    try {
                        await device.queue.onSubmittedWorkDone();
                    } catch {
                        return "waiting" as const;
                    }
                }
                // The controller invocation is already a distinct browser task,
                // so it may replace a continuation timer which an offscreen page
                // would otherwise suspend indefinitely.
                if (strictCloudTransportContinuationTimer !== undefined) {
                    window.clearTimeout(strictCloudTransportContinuationTimer);
                    strictCloudTransportContinuationTimer = undefined;
                }
                if (runtimePipelineCompilationPending ||
                    strictCloudTransportSubmissionPending ||
                    cloudLightExactSubmissionPendingSerial !== null ||
                    cloudLightResidualReadPending ||
                    coldLightingWarmupPending) {
                    return "waiting" as const;
                }
                if (cancelTimer !== undefined) {
                    window.clearTimeout(cancelTimer);
                    cancelTimer = undefined;
                }
                if (animationFrame !== undefined) {
                    window.cancelAnimationFrame(animationFrame);
                    animationFrame = undefined;
                }
                draw(performance.now(), true);
                try {
                    await device.queue.onSubmittedWorkDone();
                } catch {
                    return "waiting" as const;
                }
                return "advanced" as const;
            };
            if (captureInitializationTelemetry) {
                captureWindow.__elementsSkyRendererCaptureStep = captureStep;
            }
            wakeRef.current = schedule;

            const resizeObserver = new ResizeObserver(() => {
                resizeReady = false;
                if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
                resizeTimer = window.setTimeout(() => {
                    resizeTimer = undefined;
                    resizeReady = true;
                    backgroundDirty = true;
                    draw(performance.now(), true);
                }, 180);
            });
            resizeObserver.observe(canvas);
            const visibilityHandler = () => {
                if (cancelTimer !== undefined) window.clearTimeout(cancelTimer);
                if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
                if (strictCloudTransportContinuationTimer !== undefined) {
                    window.clearTimeout(strictCloudTransportContinuationTimer);
                    strictCloudTransportContinuationTimer = undefined;
                }
                cancelTimer = undefined;
                resizeTimer = undefined;
                resizeReady = true;
                if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
                animationFrame = undefined;
                if (!document.hidden || (
                    captureInitializationTelemetry && propsRef.current.paused
                )) {
                    draw(performance.now(), true);
                    schedule();
                }
            };
            document.addEventListener("visibilitychange", visibilityHandler);
            device.lost.then((info: { message?: string }) => {
                reportFailure(info.message || "WebGPU device was lost");
            });
            setInitializationStage("runtime-ready");
            setInitializationStage("first-draw-start");
            draw(performance.now(), true);
            setInitializationStage("first-draw-returned");
            schedule();

            return () => {
                if (captureWindow.__elementsSkyRendererCaptureStep === captureStep) {
                    delete captureWindow.__elementsSkyRendererCaptureStep;
                }
                resizeObserver.disconnect();
                document.removeEventListener("visibilitychange", visibilityHandler);
                device.removeEventListener?.("uncapturederror", uncapturedErrorHandler);
                if (cancelTimer !== undefined) window.clearTimeout(cancelTimer);
                if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
                if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
                cancelStrictCloudTransport();
                destroyTargets();
                lunarTexture.destroy();
                baseVolume.destroy();
                detailVolume.destroy();
                weatherTexture.destroy();
                cloudMacroAtlas.destroy();
                cloudMorphologyTexture.destroy();
                blueNoiseTexture.destroy();
                cloudLightMediumExtinction.destroy();
                cloudLightMediumScattering.destroy();
                cloudLightDirectSun.destroy();
                cloudLightDirectMoon.destroy();
                cloudLightLightning.destroy();
                cloudLightFluenceScratch.destroy();
                cloudLightPackedView.destroy();
                physicalAtmosphere.destroy();
                cloudOptics.destroy();
                parameterBuffer.destroy();
                directionalCloudVisibilityUniformBuffer.destroy();
                directionalCloudVisibilityOwnerMaskBuffer.destroy();
                cloudLightParameterSnapshotBuffer.destroy();
                layerBuffer.destroy();
                cloudFeatureBuffer.destroy();
                cloudSystemBuffer.destroy();
                cloudMacroBindingBuffer.destroy();
                cloudOpticsOwnerBuffer.destroy();
                hydrometeorBuffer.destroy();
                weatherSceneUniformBuffer.destroy();
                cloudLightUniformBuffers.forEach((buffer) => buffer.destroy());
                cloudLightFibratusSourceStagingBuffers.forEach(
                    (buffer) => buffer.destroy(),
                );
                cloudLightBrickBuffer.destroy();
                cloudLightSourceBuffer.destroy();
                cloudLightBoundaryBuffer.destroy();
                cloudLightViewUniformBuffer.destroy();
                cloudLightResidualStatusBuffer.destroy();
                if (!cloudLightResidualReadPending) {
                    cloudLightResidualReadBuffer.destroy();
                }
                cornerBuffer.destroy();
                starBuffer.destroy();
                cloudTimestampQuery?.destroy();
                cloudTimestampResolve?.destroy();
                if (!timestampReadPending) cloudTimestampRead?.destroy();
                coldCloudTimestampResolve?.destroy();
                if (!coldTimestampReadPending) coldCloudTimestampRead?.destroy();
                cloudMetricsBuffer.destroy();
                if (!metricsReadPending) cloudMetricsRead.destroy();
                cloudReconstructionMetricsBuffer.destroy();
                if (!reconstructionMetricsReadPending) {
                    cloudReconstructionMetricsRead.destroy();
                }
                device.destroy();
            };
        };

        let cleanup: (() => void) | undefined;
        let initializationTimer: number | undefined;
        // React Strict Mode replays effect setup/cleanup in development. Start
        // device acquisition on the next task so the replayed first setup is
        // cancelled before it can overlap a second WebGPU initialization.
        initializationTimer = window.setTimeout(() => {
            initializationTimer = undefined;
            void initialize()
                .then((nextCleanup) => {
                    if (disposed) nextCleanup?.();
                    else cleanup = nextCleanup;
                })
                .catch((error) => {
                    if (!disposed) onFailure(error instanceof Error
                        ? error.message : String(error));
                });
        }, 0);

        return () => {
            disposed = true;
            redrawRef.current = null;
            wakeRef.current = null;
            if (initializationTimer !== undefined) {
                window.clearTimeout(initializationTimer);
            }
            if (cancelTimer !== undefined) window.clearTimeout(cancelTimer);
            if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
            cleanup?.();
        };
    }, [onFailure]);

    return (
        <canvas
            ref={canvasRef}
            className={styles.radianceCanvas}
            data-sky-renderer="webgpu"
            data-cloud-light-volume-state="initializing"
            data-cloud-light-volume-generation="0"
            data-cloud-light-volume-selected-bricks="0"
            data-cloud-light-volume-ready-bricks="0"
            data-visible-stars={celestial.perceptibleStars}
            data-moon-phase={
                celestial.moon.visible ? celestial.moon.phaseName : "below horizon"
            }
        />
    );
}

export function SkyRendererCanvas({
    radiance,
    celestial,
    physicalAtmosphereState,
    sceneKey,
    paused = false,
    options: requestedOptions,
    onStats,
}: SkyRendererCanvasProps) {
    const options = useMemo(
        () => resolveSkyRendererOptions(requestedOptions),
        [
            requestedOptions?.preference,
            requestedOptions?.quality,
            requestedOptions?.debugView,
            requestedOptions?.resolutionScale,
            requestedOptions?.updateRate,
            requestedOptions?.temporal,
            requestedOptions?.cloudComposition,
            requestedOptions?.cloudPerspective,
            requestedOptions?.cloudEditorialRegime,
        ],
    );
    const [backend, setBackend] = useState<SkyRendererBackend>("fallback");
    const [webGpuError, setWebGpuError] = useState<string>();
    const sceneKeyRef = useRef(sceneKey);
    sceneKeyRef.current = sceneKey;

    useEffect(() => {
        setBackend(selectSkyRendererBackend(options.preference));
        setWebGpuError(undefined);
    }, [options.preference]);

    const handleWebGpuFailure = useMemo(
        () => (message: string) => {
            console.warn("WebGPU sky renderer unavailable; using legacy sky", message);
            setWebGpuError(message);
            setBackend("fallback");
            onStats?.({
                sceneKey: sceneKeyRef.current,
                backend: "fallback",
                quality: options.quality,
                width: 0,
                height: 0,
                cloudWidth: 0,
                cloudHeight: 0,
                cloudUpdateMs: null,
                compositeMs: null,
                textureMemoryMb: 0,
                historyValid: false,
                visible: !document.hidden,
                lastError: message,
            });
        },
        [onStats, options.quality],
    );

    if (backend === "webgpu") {
        return (
            <WebGpuSkyCanvas
                radiance={radiance}
                celestial={celestial}
                physicalAtmosphereState={physicalAtmosphereState}
                sceneKey={sceneKey}
                paused={paused}
                options={options}
                onStats={onStats}
                onFailure={handleWebGpuFailure}
            />
        );
    }

    if (backend === "webgl2") {
        return (
            <>
                <AtmosphereCanvas scene={radiance} />
                <div className={styles.edgeColor} />
                <div className={styles.horizon} />
                <CelestialCanvas scene={celestial} paused={paused} />
                <div className={`${styles.clouds} ${styles.cloudsHigh}`} />
                <div className={`${styles.clouds} ${styles.cloudsLow}`} />
                <div className={styles.mistLayer} />
                <div className={styles.atmosphere} />
                <div className={styles.grain} />
                {webGpuError && (
                    <span className={styles.rendererStatus} data-renderer-error={webGpuError} />
                )}
            </>
        );
    }

    return (
        <>
            <div
                className={styles.legacyFallback}
                style={{ background: legacyFallbackGradient() }}
            />
            {webGpuError && (
                <span className={styles.rendererStatus} data-renderer-error={webGpuError} />
            )}
        </>
    );
}

import type { CloudGenus, CloudSpecies } from "./cloud-scene";

export const CLOUD_PLATE_SCENE_SCHEMA_VERSION = 1 as const;
export const CLOUD_PLATE_ASSET_SCHEMA_VERSION = 1 as const;

export type CloudPlateRenderBackend =
    | "native-metal"
    | "blender-cycles-metal";

export type CloudPlateGroupKind =
    | "isolated-population"
    | "continuous-deep-convection"
    | "continuous-stratiform-deck"
    | "continuous-frontal-system"
    | "orographic-wave-train"
    | "upper-atmospheric-display";

export type CloudPlateComponentKind =
    | "cloud-species"
    | "supplementary-feature"
    | "accessory-cloud"
    | "precipitation"
    | "surface-obscuration";

export interface CloudPlateComponentDefinition {
    id: string;
    kind: CloudPlateComponentKind;
    role: string;
    genus: Exclude<CloudGenus, "clear">;
    species?: Exclude<CloudSpecies, "generic">;
    /** WMO feature/accessory/precipitation identity where species is insufficient. */
    form?: string;
    /** All components with the same id are rendered as one connected medium. */
    continuityVolumeId: string;
    /** Back-to-front physical ordering inside the shared group, never DOM z-index. */
    transportOrder: number;
    /** Relative contribution to the authored group, not an alpha multiplier. */
    contribution: number;
}

export interface CloudPlateGroupDefinition {
    id: string;
    label: string;
    kind: CloudPlateGroupKind;
    /** Components are rendered together into one transport operator. */
    continuity: "shared-volume";
    components: readonly CloudPlateComponentDefinition[];
}

export interface CloudPlateFixedCamera {
    perspectiveId: "oblique-natural";
    horizontalFovDegrees: number;
    verticalFovDegrees: number;
    viewElevationDegrees: number;
}

export interface CloudPlateOfflineVolumeInstance {
    id: string;
    componentId: string;
    target: readonly [number, number, number];
    scale: readonly [number, number, number];
    rotationDegrees: number;
    scatteringMultiplier: number;
    bottomFade: number;
    /** Stable per-component offset within the scene's loop-safe evolution. */
    phaseOffset: number;
}

export interface CloudPlateOfflineComposition {
    sourceKind: "wdas-complex";
    sourceAssetId: "wdas-cloud";
    scatteringStrength: number;
    /** Maps the offline reference-light units into the live sky's linear range. */
    radianceCalibration: number;
    volumeInstances: readonly CloudPlateOfflineVolumeInstance[];
    precipitation?: {
        componentId: string;
        target: readonly [number, number, number];
        dimensions: readonly [number, number, number];
        rotationDegrees: number;
        densityScale: number;
    };
}

export interface CloudPlateSceneDefinition {
    schemaVersion: typeof CLOUD_PLATE_SCENE_SCHEMA_VERSION;
    id: string;
    label: string;
    description: string;
    fixedCamera: CloudPlateFixedCamera;
    source: {
        captureParameter: "case" | "weather";
        caseId: string;
    };
    timeline: {
        durationSeconds: number;
        frameIntervalSeconds: number;
        loop: boolean;
        crossfadeSeconds: number;
    };
    render: {
        width: number;
        height: number;
        minimumTransportSamples: number;
        convergenceTarget: number;
        backend: CloudPlateRenderBackend;
    };
    /** Authored offline assembly consumed by Cycles; never a live blob recipe. */
    offlineComposition?: CloudPlateOfflineComposition;
    groups: readonly CloudPlateGroupDefinition[];
}

export type CloudPlateChannel =
    | "radiance"
    | "transmittance"
    | "geometry"
    | "motion";

export interface CloudPlateBinaryPlane {
    channel: CloudPlateChannel;
    url: string;
    sha256: string;
    width: number;
    height: number;
    format: "rgba16float-le";
    byteLength: number;
}

export interface CloudPlateTransportOperator {
    groupId: string;
    /** Smaller values are nearer the camera. */
    firstDepthKm: number;
    radiance: CloudPlateBinaryPlane;
    transmittance: CloudPlateBinaryPlane;
    geometry?: CloudPlateBinaryPlane;
    motion?: CloudPlateBinaryPlane;
}

export interface CloudPlateAssetFrame {
    index: number;
    timeSeconds: number;
    lightingSignature: string;
    transportSamples: number;
    convergenceDelta: number;
    previewUrl?: string;
    captureMetricsUrl?: string;
    operators: readonly CloudPlateTransportOperator[];
}

export interface CloudPlateAssetManifest {
    schemaVersion: typeof CLOUD_PLATE_ASSET_SCHEMA_VERSION;
    sceneId: string;
    sceneHash: string;
    definitionHash: string;
    rendererHash: string;
    generatedAt: string;
    status: "rendering" | "partial" | "complete";
    backend: CloudPlateRenderBackend;
    fixedCamera: CloudPlateFixedCamera;
    timeline: CloudPlateSceneDefinition["timeline"];
    groups: readonly CloudPlateGroupDefinition[];
    render: {
        width: number;
        height: number;
        minimumTransportSamples: number;
        convergenceTarget: number;
        radianceCalibration?: number;
    };
    completedFrames: number;
    totalFrames: number;
    frames: readonly CloudPlateAssetFrame[];
}

const finitePositive = (value: number) => Number.isFinite(value) && value > 0;
const stableId = (value: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const finiteVector3 = (value: readonly number[]) => value.length === 3 &&
    value.every(Number.isFinite);

export const cloudPlateFrameCount = (
    timeline: CloudPlateSceneDefinition["timeline"],
) => Math.max(1, Math.floor(
    timeline.durationSeconds / timeline.frameIntervalSeconds,
) + (timeline.loop ? 0 : 1));

export const validateCloudPlateScene = (
    scene: CloudPlateSceneDefinition,
): readonly string[] => {
    const failures: string[] = [];
    if (scene.schemaVersion !== CLOUD_PLATE_SCENE_SCHEMA_VERSION) {
        failures.push("unsupported-scene-schema");
    }
    if (!stableId(scene.id)) failures.push("invalid-scene-id");
    if (scene.fixedCamera.perspectiveId !== "oblique-natural") {
        failures.push("production-camera-must-be-oblique-natural");
    }
    if (!finitePositive(scene.timeline.durationSeconds) ||
        !finitePositive(scene.timeline.frameIntervalSeconds) ||
        scene.timeline.frameIntervalSeconds > scene.timeline.durationSeconds) {
        failures.push("invalid-scene-timeline");
    }
    if (!Number.isInteger(scene.render.width) ||
        !Number.isInteger(scene.render.height) ||
        scene.render.width < 64 || scene.render.height < 64) {
        failures.push("invalid-render-extent");
    }
    if (!Number.isInteger(scene.render.minimumTransportSamples) ||
        scene.render.minimumTransportSamples < 64) {
        failures.push("insufficient-offline-samples");
    }
    if (!["native-metal", "blender-cycles-metal"].includes(
        scene.render.backend,
    )) {
        failures.push("unsupported-render-backend");
    }
    const groupIds = new Set<string>();
    const componentIds = new Set<string>();
    for (const group of scene.groups) {
        if (!stableId(group.id) || groupIds.has(group.id)) {
            failures.push(`invalid-or-duplicate-group:${group.id}`);
        }
        groupIds.add(group.id);
        if (group.continuity !== "shared-volume") {
            failures.push(`group-is-not-continuous:${group.id}`);
        }
        if (group.components.length === 0) {
            failures.push(`empty-group:${group.id}`);
        }
        const continuityVolumes = new Set(
            group.components.map(({ continuityVolumeId }) => continuityVolumeId),
        );
        if (continuityVolumes.size !== 1) {
            failures.push(`group-split-across-volumes:${group.id}`);
        }
        for (const component of group.components) {
            if (!stableId(component.id) || componentIds.has(component.id)) {
                failures.push(`invalid-or-duplicate-component:${component.id}`);
            }
            componentIds.add(component.id);
            if (!finitePositive(component.contribution) ||
                component.contribution > 1) {
                failures.push(`invalid-component-contribution:${component.id}`);
            }
        }
    }
    if (scene.render.backend === "blender-cycles-metal") {
        const composition = scene.offlineComposition;
        if (!composition || composition.sourceKind !== "wdas-complex" ||
            composition.sourceAssetId !== "wdas-cloud" ||
            !finitePositive(composition.scatteringStrength) ||
            !finitePositive(composition.radianceCalibration) ||
            !Array.isArray(composition.volumeInstances) ||
            composition.volumeInstances.length === 0) {
            failures.push("invalid-offline-composition");
        } else {
            const offlineIds = new Set<string>();
            for (const instance of composition.volumeInstances) {
                if (!stableId(instance.id) || offlineIds.has(instance.id) ||
                    !componentIds.has(instance.componentId) ||
                    !finiteVector3(instance.target) ||
                    !finiteVector3(instance.scale) ||
                    !instance.scale.every(finitePositive) ||
                    !finitePositive(instance.scatteringMultiplier) ||
                    !Number.isFinite(instance.bottomFade) ||
                    instance.bottomFade < 0 || instance.bottomFade > 1 ||
                    !Number.isFinite(instance.rotationDegrees) ||
                    !Number.isFinite(instance.phaseOffset)) {
                    failures.push(`invalid-offline-volume:${instance.id}`);
                }
                offlineIds.add(instance.id);
            }
            const rain = composition.precipitation;
            if (rain && (!componentIds.has(rain.componentId) ||
                !finiteVector3(rain.target) ||
                !finiteVector3(rain.dimensions) ||
                !rain.dimensions.every(finitePositive) ||
                !finitePositive(rain.densityScale) ||
                !Number.isFinite(rain.rotationDegrees))) {
                failures.push("invalid-offline-precipitation");
            }
        }
    }
    if (scene.groups.length === 0) failures.push("scene-has-no-cloud-groups");
    return failures;
};

export const validateCloudPlateAssetManifest = (
    manifest: CloudPlateAssetManifest,
): readonly string[] => {
    const failures: string[] = [];
    if (manifest.schemaVersion !== CLOUD_PLATE_ASSET_SCHEMA_VERSION) {
        failures.push("unsupported-asset-schema");
    }
    if (manifest.completedFrames !== manifest.frames.length ||
        manifest.completedFrames > manifest.totalFrames) {
        failures.push("asset-frame-count-mismatch");
    }
    if (manifest.status === "complete" &&
        manifest.completedFrames !== manifest.totalFrames) {
        failures.push("complete-asset-is-missing-frames");
    }
    if (!/^[a-f0-9]{64}$/.test(manifest.sceneHash) ||
        !/^[a-f0-9]{64}$/.test(manifest.definitionHash) ||
        !/^[a-f0-9]{64}$/.test(manifest.rendererHash)) {
        failures.push("invalid-asset-content-identity");
    }
    if (manifest.fixedCamera.perspectiveId !== "oblique-natural") {
        failures.push("asset-camera-must-be-oblique-natural");
    }
    if (!Array.isArray(manifest.groups) || manifest.groups.length === 0) {
        failures.push("asset-has-no-cloud-groups");
    }
    if (!["native-metal", "blender-cycles-metal"].includes(
        manifest.backend,
    )) {
        failures.push("unsupported-asset-backend");
    }
    const frameIndices = new Set<number>();
    const declaredGroupIds = new Set(manifest.groups.map(({ id }) => id));
    for (const frame of manifest.frames) {
        if (!Number.isInteger(frame.index) || frameIndices.has(frame.index)) {
            failures.push(`invalid-or-duplicate-frame:${frame.index}`);
        }
        frameIndices.add(frame.index);
        if (!Number.isInteger(frame.transportSamples) ||
            frame.transportSamples < manifest.render.minimumTransportSamples ||
            !Number.isFinite(frame.convergenceDelta) ||
            frame.convergenceDelta > manifest.render.convergenceTarget) {
            failures.push(`unconverged-frame:${frame.index}`);
        }
        const groupIds = new Set<string>();
        for (const operator of frame.operators) {
            if (!declaredGroupIds.has(operator.groupId)) {
                failures.push(
                    `unknown-frame-group:${frame.index}:${operator.groupId}`,
                );
            }
            if (groupIds.has(operator.groupId)) {
                failures.push(`duplicate-frame-group:${frame.index}:${operator.groupId}`);
            }
            groupIds.add(operator.groupId);
            for (const plane of [operator.radiance, operator.transmittance,
                operator.geometry, operator.motion].filter(Boolean) as
                CloudPlateBinaryPlane[]) {
                if (plane.format !== "rgba16float-le" ||
                    plane.byteLength !== plane.width * plane.height * 8 ||
                    plane.width !== manifest.render.width ||
                    plane.height !== manifest.render.height ||
                    !/^[a-f0-9]{64}$/.test(plane.sha256) ||
                    !plane.url.startsWith("/generated/cloud-plates/")) {
                    failures.push(
                        `invalid-plane-layout:${frame.index}:${operator.groupId}:` +
                        plane.channel,
                    );
                }
            }
        }
    }
    return failures;
};

/**
 * Optical-depth interpolation avoids the gray halos produced by linearly
 * crossfading alpha/transmittance. Radiance remains a premultiplied source
 * term and is therefore interpolated directly.
 */
export const interpolateCloudPlateTransport = ({
    firstRadiance,
    firstTransmittance,
    secondRadiance,
    secondTransmittance,
    amount,
}: {
    firstRadiance: readonly number[];
    firstTransmittance: readonly number[];
    secondRadiance: readonly number[];
    secondTransmittance: readonly number[];
    amount: number;
}) => {
    const t = Math.min(1, Math.max(0, amount));
    const radiance = firstRadiance.map((value, index) =>
        value + ((secondRadiance[index] ?? value) - value) * t);
    const transmittance = firstTransmittance.map((value, index) => {
        const firstTau = -Math.log(Math.max(1e-6, value));
        const secondTau = -Math.log(Math.max(
            1e-6,
            secondTransmittance[index] ?? value,
        ));
        return Math.exp(-(firstTau + (secondTau - firstTau) * t));
    });
    return { radiance, transmittance };
};

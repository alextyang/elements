import {
    normalizeCameraAngleRadians,
    rotateDirectionByCameraYaw,
} from "./camera-contract";
import type {
    CloudMorphologyCompileRequest,
    CloudMorphologyOwnerGeometry,
} from "./cloud-morphology-modifiers";
import type { CloudOrganizationState } from "./cloud-state-map";
import {
    packCloudSystems,
    packLegacyCloudFeatures,
    type CloudSystemRuntime,
    type RuntimeCloudSystem,
} from "./cloud-system-runtime";

/**
 * Cloud scenes are authored in the renderer's explicit 180-degree reference
 * view. The camera contract turns that local view into an Earth-local ray by
 * applying a yaw. Finite cloud owners must receive the identical rigid-body
 * transform or a physical camera pan will look away from the authored scene.
 *
 * This adapter changes only the world frame. It never changes owner scale,
 * density, topology, optical state, relative spacing, or camera composition.
 */

const rotateWorldPoint = (
    point: readonly [number, number, number],
    cameraYawRadians: number,
) => rotateDirectionByCameraYaw(point, cameraYawRadians);

/**
 * Cloud orientations use zero on +east and increase toward +north. Camera
 * yaw uses zero on +north and rotates +north toward +east. Consequently the
 * same rigid-body rotation subtracts yaw from a cloud orientation angle.
 */
export const embedCloudOrientationInCameraWorld = (
    orientationRadians: number,
    cameraYawRadians: number,
) => normalizeCameraAngleRadians(orientationRadians - cameraYawRadians);

const embedOrganization = (
    organization: CloudOrganizationState,
    cameraYawRadians: number,
): CloudOrganizationState => {
    switch (organization.kind) {
        case "point-process":
        case "cellular":
        case "banded":
        case "frontal-shield":
        case "wave-packet":
            return {
                ...organization,
                orientation: embedCloudOrientationInCameraWorld(
                    organization.orientation,
                    cameraYawRadians,
                ),
            };
        case "storm-complex":
            return {
                ...organization,
                propagationDirection: embedCloudOrientationInCameraWorld(
                    organization.propagationDirection,
                    cameraYawRadians,
                ),
            };
    }
};

const embedSystem = (
    system: RuntimeCloudSystem,
    cameraYawRadians: number,
): RuntimeCloudSystem => {
    const center = rotateWorldPoint([
        system.state.extent.centerEastKm,
        0,
        system.state.extent.centerNorthKm,
    ], cameraYawRadians);
    const extent = {
        ...system.state.extent,
        centerEastKm: center[0],
        centerNorthKm: center[2],
        orientation: embedCloudOrientationInCameraWorld(
            system.state.extent.orientation,
            cameraYawRadians,
        ),
    };
    const physicalKinematics = {
        ...system.state.physical.kinematics,
        windDirection: embedCloudOrientationInCameraWorld(
            system.state.physical.kinematics.windDirection,
            cameraYawRadians,
        ),
    };
    const compiledKinematics = {
        ...system.compiled.kinematics,
        windDirection: embedCloudOrientationInCameraWorld(
            system.compiled.kinematics.windDirection,
            cameraYawRadians,
        ),
    };
    return {
        ...system,
        state: {
            ...system.state,
            extent,
            organization: embedOrganization(
                system.state.organization,
                cameraYawRadians,
            ),
            physical: {
                ...system.state.physical,
                kinematics: physicalKinematics,
            },
        },
        compiled: {
            ...system.compiled,
            geometry: {
                ...system.compiled.geometry,
                extent,
            },
            kinematics: compiledKinematics,
        },
    };
};

const embedMorphologyParent = (
    parent: CloudMorphologyOwnerGeometry,
    cameraYawRadians: number,
): CloudMorphologyOwnerGeometry => ({
    ...parent,
    centerKm: rotateWorldPoint(parent.centerKm, cameraYawRadians),
    axisU: rotateWorldPoint(parent.axisU, cameraYawRadians),
    axisV: rotateWorldPoint(parent.axisV, cameraYawRadians),
    axisW: rotateWorldPoint(parent.axisW, cameraYawRadians),
    ...(parent.anchorsKm ? {
        anchorsKm: Object.fromEntries(
            Object.entries(parent.anchorsKm).map(([name, point]) => [
                name,
                rotateWorldPoint(point, cameraYawRadians),
            ]),
        ),
    } : {}),
});

const embedMorphologyRequest = (
    request: CloudMorphologyCompileRequest,
    cameraYawRadians: number,
): CloudMorphologyCompileRequest => ({
    ...request,
    parent: embedMorphologyParent(request.parent, cameraYawRadians),
});

const embeddedRuntimeCache = new WeakMap<
    CloudSystemRuntime,
    Map<string, CloudSystemRuntime>
>();

/**
 * Rigidly embed a camera-reference cloud runtime in the Earth-local frame.
 * The base runtime remains immutable and cacheable; all CPU and GPU consumers
 * receive one coherent derived runtime with yaw included in its signature.
 */
export const embedCloudRuntimeInCameraWorld = (
    runtime: CloudSystemRuntime,
    cameraYawRadians: number,
): CloudSystemRuntime => {
    const yaw = normalizeCameraAngleRadians(cameraYawRadians);
    if (Math.abs(yaw) < 1e-12) return runtime;
    const key = yaw.toPrecision(15);
    let perRuntime = embeddedRuntimeCache.get(runtime);
    if (!perRuntime) {
        perRuntime = new Map();
        embeddedRuntimeCache.set(runtime, perRuntime);
    }
    const cached = perRuntime.get(key);
    if (cached) return cached;

    const systems = runtime.systems.map((system) => embedSystem(system, yaw));
    const embedded = {
        ...runtime,
        signature: `${runtime.signature}:earth-frame-yaw=${key}`,
        systems,
        packedSystemData: packCloudSystems(
            systems,
            runtime.packedSystemData.capacity,
        ),
        legacyFeatureData: packLegacyCloudFeatures(systems),
        morphologyRequests: runtime.morphologyRequests.map((request) =>
            embedMorphologyRequest(request, yaw)),
        // Composition qualifications are invariant under this matching rigid
        // camera/owner rotation, so retain the already qualified values.
        compositionQualifications: runtime.compositionQualifications,
    } satisfies CloudSystemRuntime;
    perRuntime.set(key, embedded);
    if (perRuntime.size > 8) {
        perRuntime.delete(perRuntime.keys().next().value as string);
    }
    return embedded;
};

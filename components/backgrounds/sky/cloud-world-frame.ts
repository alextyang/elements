import {
    normalizeCameraAngleRadians,
    rotateDirectionByCameraYaw,
} from "./camera-contract";
import type {
    CloudMorphologyCompileRequest,
    CloudMorphologyOwnerGeometry,
} from "./cloud-morphology-modifiers";
import {
    compileCloudShippingProductionRuntimeV1,
    type CloudShippingProductionRuntimeV1,
} from "./cloud-shipping-production-runtime";
import type { CloudOrganizationState } from "./cloud-state-map";
import type { CloudOwnerRecordV2 } from "./cloud-system-abi-v2";
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

export type RuntimeCloudSystemWithProductionSignature = RuntimeCloudSystem & {
    /** Exact V2 registry namespace for this camera-independent world runtime. */
    readonly productionRuntimeSignature: string;
    /** Index-matched V2 owner consumed by shipping CPU pass setup. */
    readonly productionV2Owner: CloudOwnerRecordV2 | null;
};

export type CloudSystemRuntimeWithProductionV1 = Omit<
    CloudSystemRuntime,
    "systems"
> & {
    readonly systems: readonly RuntimeCloudSystemWithProductionSignature[];
    /**
     * V2 owner/feature/event frame instantiated on the shipping runtime path.
     * Existing shaders remain on the legacy ABI until their bind groups migrate.
     */
    readonly productionV2: CloudShippingProductionRuntimeV1;
};

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

type NamespacedRuntimeCloudSystem = RuntimeCloudSystem & {
    readonly productionRuntimeSignature: string;
};

const embedSystem = (
    system: RuntimeCloudSystem,
    cameraYawRadians: number,
    productionRuntimeSignature: string,
): NamespacedRuntimeCloudSystem => {
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
        productionRuntimeSignature,
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
    Map<string, CloudSystemRuntimeWithProductionV1>
>();
const zeroYawRuntimeCache = new WeakMap<
    CloudSystemRuntime,
    CloudSystemRuntimeWithProductionV1
>();

const attachOwnerRecords = (
    systems: readonly NamespacedRuntimeCloudSystem[],
    productionV2: CloudShippingProductionRuntimeV1,
): readonly RuntimeCloudSystemWithProductionSignature[] =>
    systems.map((system, ownerIndex) => {
        const owner = productionV2.bridge.systemsV2[ownerIndex]?.owner ?? null;
        if (owner && owner.sourceId !== system.state.id) {
            throw new Error(
                `V2 world owner order mismatch at ${ownerIndex}: ` +
                `${owner.sourceId} != ${system.state.id}.`,
            );
        }
        return { ...system, productionV2Owner: owner };
    });

const attachProductionRuntime = (
    runtime: CloudSystemRuntime,
): CloudSystemRuntimeWithProductionV1 => {
    const cached = zeroYawRuntimeCache.get(runtime);
    if (cached) return cached;
    const namespacedSystems: NamespacedRuntimeCloudSystem[] =
        runtime.systems.map((system) => ({
            ...system,
            productionRuntimeSignature: runtime.signature,
        }));
    const namespacedRuntime: CloudSystemRuntime = {
        ...runtime,
        systems: namespacedSystems,
    };
    const productionV2 = compileCloudShippingProductionRuntimeV1(
        namespacedRuntime,
    );
    const systems = attachOwnerRecords(namespacedSystems, productionV2);
    const attached: CloudSystemRuntimeWithProductionV1 = {
        ...namespacedRuntime,
        systems,
        productionV2,
    };
    zeroYawRuntimeCache.set(runtime, attached);
    return attached;
};

/**
 * Rigidly embed a camera-reference cloud runtime in the Earth-local frame.
 * The base runtime remains immutable and cacheable; all CPU and GPU consumers
 * receive one coherent derived runtime with yaw included in its signature.
 *
 * The V2 production frame is compiled here because this function is the single
 * shipping boundary shared by camera, light-volume, atmosphere-shadow and
 * hydrometeor setup. It is present before those consumers inspect the runtime,
 * while shader bind groups remain explicitly gated by Gate A migration state.
 */
export const embedCloudRuntimeInCameraWorld = (
    runtime: CloudSystemRuntime,
    cameraYawRadians: number,
): CloudSystemRuntimeWithProductionV1 => {
    const yaw = normalizeCameraAngleRadians(cameraYawRadians);
    if (Math.abs(yaw) < 1e-12) return attachProductionRuntime(runtime);
    const key = yaw.toPrecision(15);
    let perRuntime = embeddedRuntimeCache.get(runtime);
    if (!perRuntime) {
        perRuntime = new Map();
        embeddedRuntimeCache.set(runtime, perRuntime);
    }
    const cached = perRuntime.get(key);
    if (cached) return cached;

    const signature = `${runtime.signature}:earth-frame-yaw=${key}`;
    const namespacedSystems = runtime.systems.map((system) => embedSystem(
        system,
        yaw,
        signature,
    ));
    const embeddedBase: CloudSystemRuntime = {
        ...runtime,
        signature,
        systems: namespacedSystems,
        packedSystemData: packCloudSystems(
            namespacedSystems,
            runtime.packedSystemData.capacity,
        ),
        legacyFeatureData: packLegacyCloudFeatures(namespacedSystems),
        morphologyRequests: runtime.morphologyRequests.map((request) =>
            embedMorphologyRequest(request, yaw)),
        // Composition qualifications are invariant under this matching rigid
        // camera/owner rotation, so retain the already qualified values.
        compositionQualifications: runtime.compositionQualifications,
    };
    const productionV2 = compileCloudShippingProductionRuntimeV1(embeddedBase);
    const systems = attachOwnerRecords(namespacedSystems, productionV2);
    const embedded: CloudSystemRuntimeWithProductionV1 = {
        ...embeddedBase,
        systems,
        productionV2,
    };
    perRuntime.set(key, embedded);
    if (perRuntime.size > 8) {
        perRuntime.delete(perRuntime.keys().next().value as string);
    }
    return embedded;
};

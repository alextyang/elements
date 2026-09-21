/**
 * Shared camera/world-frame contract.
 *
 * The renderer's local horizontal basis is `east / up / north` in the
 * mathematical sense (x = sin(azimuth), z = cos(azimuth)).  Historical sky
 * benchmark captures use `viewAzimuth = 180` as the reference heading for the
 * unrotated GPU camera (+Z).  Keep that reference explicit: a heading of 180
 * therefore produces zero yaw and leaves existing benchmark owners in place.
 *
 * CPU ephemeris directions are camera-relative (`worldHeading - viewAzimuth`)
 * so projected celestial overlays remain stable.  Before they enter a
 * world-space WebGPU pass, rotate them by this same yaw.  WGSL applies the
 * identical local-to-world rotation to every current and previous camera ray.
 */

export const CAMERA_REFERENCE_HEADING_DEGREES = 180;
export const CAMERA_REFERENCE_HEADING_RADIANS = Math.PI;
export const CAMERA_DEGREES_TO_RADIANS = Math.PI / 180;

/** Return an angle in the half-open interval [-PI, PI). */
export const normalizeCameraAngleRadians = (value: number) => {
    let wrapped = value % (Math.PI * 2);
    if (wrapped >= Math.PI) wrapped -= Math.PI * 2;
    if (wrapped < -Math.PI) wrapped += Math.PI * 2;
    return wrapped;
};

/**
 * Convert the public compass heading to the GPU local-to-world yaw.
 *
 * Positive yaw follows the existing x/z convention: `+Z` rotates toward `+X`
 * for a positive mathematical angle.  `undefined` is the legacy reference
 * heading, not an uninitialised camera.
 */
export const cameraYawRadiansFromViewAzimuth = (
    viewAzimuthDegrees: number | undefined,
) => normalizeCameraAngleRadians(
    ((viewAzimuthDegrees ?? CAMERA_REFERENCE_HEADING_DEGREES) -
        CAMERA_REFERENCE_HEADING_DEGREES) * CAMERA_DEGREES_TO_RADIANS,
);

/** Rotate an east/up/north direction from camera-local into Earth-local space. */
export const rotateDirectionByCameraYaw = <T extends readonly [number, number, number]>(
    direction: T,
    yawRadians: number,
): [number, number, number] => {
    const cosine = Math.cos(yawRadians);
    const sine = Math.sin(yawRadians);
    return [
        direction[0] * cosine + direction[2] * sine,
        direction[1],
        -direction[0] * sine + direction[2] * cosine,
    ];
};

/** Wrapped absolute difference used by temporal camera-history rejection. */
export const cameraYawDeltaRadians = (current: number, previous: number) =>
    Math.abs(normalizeCameraAngleRadians(current - previous));

/** One bounded rectilinear view shared by sky, clouds and celestial overlays. */
export const SKY_PROJECTION_VERSION = "rectilinear-v1" as const;

export interface SkyCameraState {
    viewAzimuth: number;
    viewElevation: number;
    horizontalFov: number;
    verticalFov: number;
}

export const PRODUCTION_SKY_CAMERA: Readonly<SkyCameraState> = Object.freeze({
    viewAzimuth: 55,
    viewElevation: 27,
    horizontalFov: 64,
    verticalFov: 43.52,
});

const finiteCameraValue = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Explicit diagnostic angles remain available; no rectilinear FOV reaches 180°. */
export const resolveSkyCamera = (
    overrides: Partial<SkyCameraState> = {},
): SkyCameraState => ({
    viewAzimuth: ((finiteCameraValue(overrides.viewAzimuth,
        PRODUCTION_SKY_CAMERA.viewAzimuth) % 360) + 360) % 360,
    viewElevation: Math.min(90, Math.max(-10,
        finiteCameraValue(overrides.viewElevation, PRODUCTION_SKY_CAMERA.viewElevation))),
    horizontalFov: Math.min(160, Math.max(2,
        finiteCameraValue(overrides.horizontalFov, PRODUCTION_SKY_CAMERA.horizontalFov))),
    verticalFov: Math.min(160, Math.max(2,
        finiteCameraValue(overrides.verticalFov, PRODUCTION_SKY_CAMERA.verticalFov))),
});

type CameraDirection = readonly [number, number, number];

/** Inverse pitch into the camera plane; input directions already have local yaw. */
const directionInCameraPlane = (
    direction: CameraDirection,
    camera: SkyCameraState,
): [number, number, number] => {
    const pitch = camera.viewElevation * CAMERA_DEGREES_TO_RADIANS;
    const cosine = Math.cos(pitch);
    const sine = Math.sin(pitch);
    return [direction[0], direction[1] * cosine - direction[2] * sine,
        direction[1] * sine + direction[2] * cosine];
};

/** The exact CPU inverse of the rectilinear shader ray; outside-frame UVs remain valid. */
export const projectCameraLocalDirectionToUv = (
    direction: CameraDirection,
    camera: SkyCameraState,
): [number, number] | null => {
    if (!direction.every(Number.isFinite)) return null;
    const local = directionInCameraPlane(direction, camera);
    if (local[2] <= 0.000001) return null;
    return [
        0.5 + local[0] / (2 * local[2] *
            Math.tan(camera.horizontalFov * CAMERA_DEGREES_TO_RADIANS * 0.5)),
        0.5 - local[1] / (2 * local[2] *
            Math.tan(camera.verticalFov * CAMERA_DEGREES_TO_RADIANS * 0.5)),
    ];
};

/** Project a world-space source using the same yaw/pitch as the sky shader. */
export const projectSkyDirectionToUv = (
    worldDirection: CameraDirection,
    camera: SkyCameraState,
): [number, number] | null => projectCameraLocalDirectionToUv(
    rotateDirectionByCameraYaw(worldDirection,
        -cameraYawRadiansFromViewAzimuth(camera.viewAzimuth)),
    camera,
);

/** A flat image plane retains geometric depth without panoramic/zenith folding. */
export const skyCameraRayDirection = (
    uv: readonly [number, number],
    camera: SkyCameraState,
): [number, number, number] => {
    const x = (uv[0] * 2 - 1) *
        Math.tan(camera.horizontalFov * CAMERA_DEGREES_TO_RADIANS * 0.5);
    const y = (1 - uv[1] * 2) *
        Math.tan(camera.verticalFov * CAMERA_DEGREES_TO_RADIANS * 0.5);
    const pitch = camera.viewElevation * CAMERA_DEGREES_TO_RADIANS;
    const cosine = Math.cos(pitch);
    const sine = Math.sin(pitch);
    const pitched: [number, number, number] = [x, y * cosine + sine,
        cosine - y * sine];
    const inverseLength = 1 / Math.hypot(...pitched);
    return rotateDirectionByCameraYaw(
        pitched.map((value) => value * inverseLength) as [number, number, number],
        cameraYawRadiansFromViewAzimuth(camera.viewAzimuth),
    );
};

/**
 * Horizontal half-extent of an angular disc in CSS pixels, including its
 * off-axis position. The compatibility Moon sprite stays circular; this is
 * not a claim that its complete off-axis conic/texture projection is exact.
 */
export const skyCameraAngularRadiusPixels = (
    angularRadiusRadians: number,
    viewportWidth: number,
    camera: SkyCameraState,
    cameraLocalDirection?: CameraDirection,
) => {
    const plane = cameraLocalDirection
        ? directionInCameraPlane(cameraLocalDirection, camera) : [0, 0, 1];
    const length = Math.hypot(...plane);
    if (!Number.isFinite(length) || length <= 0) return 0;
    const x = plane[0] / length;
    const z = plane[2] / length;
    const sineRadius = Math.sin(Math.max(0, angularRadiusRadians));
    const denominator = z * z - sineRadius * sineRadius;
    // A disc crossing the image plane has no finite projected extent.
    if (z <= 0 || denominator <= 0) return 0;
    const horizontalHalfExtent = sineRadius * Math.sqrt(Math.max(0,
        x * x + z * z - sineRadius * sineRadius)) / denominator;
    return Math.max(0, viewportWidth) * horizontalHalfExtent /
        (2 * Math.tan(camera.horizontalFov * CAMERA_DEGREES_TO_RADIANS * 0.5));
};

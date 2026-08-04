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


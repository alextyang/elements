"use client";

import { useEffect, useRef } from "react";

import type { CelestialScene } from "./astronomy";
import styles from "./sky.module.css";

const STAR_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
in float a_size;
in float a_opacity;
in vec3 a_color;
in float a_scintillation;
in float a_phase;
in float a_chromatic;

uniform float u_time;
uniform float u_pixel_ratio;
uniform float u_global_opacity;
uniform vec2 u_viewport;

out vec3 v_color;
out float v_opacity;
out float v_bright;

float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453123);
}

float noise1(float value) {
    float cell = floor(value);
    float local = fract(value);
    local = local * local * (3.0 - 2.0 * local);
    return mix(hash11(cell), hash11(cell + 1.0), local) * 2.0 - 1.0;
}

void main() {
    float slow = noise1(u_time * 0.43 + a_phase * 113.0);
    float medium = noise1(u_time * 1.73 + a_phase * 271.0);
    float quick = noise1(u_time * 4.21 + a_phase * 619.0);
    float shimmer = slow * 0.28 + medium * 0.46 + quick * 0.26;
    float intensity = exp(
        shimmer * a_scintillation * 1.42 -
        0.28 * a_scintillation * a_scintillation
    );
    float redNoise = noise1(u_time * 2.37 + a_phase * 887.0);
    float blueNoise = noise1(u_time * 3.11 + a_phase * 1289.0);
    vec3 spectralVariation = vec3(
        redNoise * a_chromatic,
        -(redNoise + blueNoise) * a_chromatic * 0.13,
        blueNoise * a_chromatic
    );
    vec2 wander = vec2(
        noise1(u_time * 1.31 + a_phase * 1597.0),
        noise1(u_time * 1.07 + a_phase * 1999.0)
    ) * a_scintillation * 0.72 * u_pixel_ratio;

    gl_Position = vec4(a_position.x * 2.0 - 1.0, 1.0 - a_position.y * 2.0, 0.0, 1.0);
    gl_Position.xy += wander * vec2(2.0 / u_viewport.x, 2.0 / u_viewport.y);
    gl_PointSize = a_size * u_pixel_ratio * (1.0 + max(0.0, shimmer) * a_scintillation * 0.07);
    v_color = clamp(a_color + spectralVariation, 0.0, 1.0);
    v_opacity = a_opacity * u_global_opacity * intensity;
    v_bright = smoothstep(3.2, 5.8, a_size);
}`;

const STAR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 v_color;
in float v_opacity;
in float v_bright;
out vec4 out_color;

void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float radius = length(p);
    if (radius > 1.0) discard;

    float radius2 = radius * radius;
    float seeing = pow(1.0 + radius2 * 5.8, -2.35) * 1.08;
    float core = exp(-radius2 * 22.0) * 0.32;
    float aureole = exp(-radius2 * 2.7) * 0.055 * v_bright;
    float alpha = clamp((seeing + core + aureole) * v_opacity, 0.0, 1.0);
    vec3 spectralCore = mix(
        v_color,
        vec3(1.0),
        clamp(core * v_bright * 0.42, 0.0, 0.22)
    );
    out_color = vec4(spectralCore, alpha);
}`;

const MOON_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
uniform vec2 u_center;
uniform vec2 u_extent;
out vec2 v_disc;

void main() {
    gl_Position = vec4(u_center + a_position * u_extent, 0.0, 1.0);
    v_disc = a_position * 8.0;
}`;

const MOON_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_disc;
uniform sampler2D u_albedo;
uniform sampler2D u_elevation;
uniform sampler2D u_photo;
uniform vec2 u_texel;
uniform float u_fraction;
uniform float u_light_angle;
uniform float u_texture_angle;
uniform float u_use_photo;
uniform float u_opacity;
uniform float u_halo_opacity;
uniform float u_earthshine;
uniform float u_exposure;
uniform vec3 u_light_tint;
uniform vec3 u_shadow_tint;
uniform vec3 u_transmittance;
out vec4 out_color;

const float PI = 3.141592653589793;

vec2 rotate2d(vec2 point, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c) * point;
}

vec3 tone_map(vec3 color) {
    // Compact ACES fitted curve. Celestial radiance stays scene-linear until
    // this final display transform, preserving lunar highlight and maria detail.
    color = max(color, vec3(0.0));
    return clamp(
        (color * (2.51 * color + 0.03)) /
            (color * (2.43 * color + 0.59) + 0.14),
        0.0,
        1.0
    );
}

void main() {
    // Work in screen coordinates: +x right, +y down. The apparent bright-limb
    // angle therefore remains identical to the astronomical projection.
    vec2 screen_point = vec2(v_disc.x, -v_disc.y);
    float radial = length(screen_point);
    if (radial > 8.0) discard;

    if (radial > 1.0) {
        // This pass contains only the compact optical PSF: diffraction/seeing
        // close to the limb and the eye/display glare tail. Kilometre-scale
        // aerosol scattering lives in the atmosphere shader, so there is no
        // arbitrary second circular halo. The centroid follows the bright
        // crescent instead of the geometrical centre of the dark hemisphere.
        vec2 bright_limb = vec2(cos(u_light_angle), sin(u_light_angle));
        vec2 glare_point = screen_point - bright_limb * (1.0 - u_fraction) * 0.24;
        float angle = atan(glare_point.y, glare_point.x);
        float anisotropic_radius = length(vec2(glare_point.x * 0.955, glare_point.y * 1.045));
        float irregularity = 0.018 * sin(angle * 3.0 + 0.8) +
            0.011 * sin(angle * 7.0 - 1.4);
        float separation = max(0.0, anisotropic_radius - 1.0 + irregularity);
        float near_psf = exp(-separation * 2.72) * 0.39;
        float ocular_glare = 0.046 / (0.24 + separation * separation * 1.16);
        float diffuse_tail = exp(-separation * 0.44) * 0.009;
        float angular_variation = 0.96 + 0.04 * cos(angle * 2.0 + 0.7);
        float quad_fade = 1.0 - smoothstep(6.2, 7.8, radial);
        float halo = u_halo_opacity *
            (near_psf + ocular_glare + diffuse_tail) *
            angular_variation *
            quad_fade;
        vec3 halo_color = mix(u_light_tint, vec3(0.78, 0.84, 0.96), 0.045);
        out_color = vec4(halo_color, halo * u_opacity);
        return;
    }

    float z = sqrt(max(0.0, 1.0 - radial * radial));
    vec3 surface_normal = normalize(vec3(screen_point, z));

    vec2 texture_point = rotate2d(screen_point, u_texture_angle);
    vec3 texture_normal = normalize(vec3(texture_point, z));
    vec2 uv = vec2(
        0.5 + atan(texture_normal.x, texture_normal.z) / (2.0 * PI),
        0.5 - asin(clamp(texture_normal.y, -1.0, 1.0)) / PI
    );

    vec3 albedo = texture(u_albedo, uv).rgb;
    float height_left = texture(u_elevation, uv - vec2(u_texel.x, 0.0)).r;
    float height_right = texture(u_elevation, uv + vec2(u_texel.x, 0.0)).r;
    float height_down = texture(u_elevation, uv - vec2(0.0, u_texel.y)).r;
    float height_up = texture(u_elevation, uv + vec2(0.0, u_texel.y)).r;
    vec2 relief = vec2(height_left - height_right, height_down - height_up);

    float phase_depth = u_fraction * 2.0 - 1.0;
    float transverse = sqrt(max(0.0, 1.0 - phase_depth * phase_depth));
    vec3 light_direction = normalize(vec3(
        cos(u_light_angle) * transverse,
        sin(u_light_angle) * transverse,
        phase_depth
    ));
    vec3 relief_normal = normalize(surface_normal + vec3(relief * 1.8, 0.0));
    float incidence = dot(relief_normal, light_direction);
    float lit_mask = smoothstep(-0.014, 0.022, incidence);
    float positive_incidence = max(incidence, 0.0);

    // A restrained Lommel-Seeliger/Lambert blend reproduces the Moon's dusty,
    // retroreflective surface better than ordinary sphere shading.
    float lommel_seeliger = (2.0 * positive_incidence) /
        max(0.12, positive_incidence + max(surface_normal.z, 0.0));
    float reflectance = clamp(
        lommel_seeliger * 0.72 + positive_incidence * 0.28,
        0.0,
        1.22
    );
    vec3 contrast_albedo = clamp((albedo - vec3(0.5)) * 1.34 + vec3(0.5), 0.0, 1.0);
    vec3 lunar_albedo = pow(max(contrast_albedo, vec3(0.012)), vec3(0.96));
    vec3 lit_surface = lunar_albedo * u_light_tint * (0.4 + reflectance * 0.84);
    vec3 dark_surface = lunar_albedo * u_shadow_tint *
        (0.0012 + u_earthshine * (0.24 + surface_normal.z * 0.18));
    vec3 procedural_surface = mix(dark_surface, lit_surface, lit_mask);

    // NASA's hourly LRO/LOLA render supplies real terrain shadows and
    // libration. Earthshine is added below only when phase and sky contrast
    // make it physically observable.
    // NASA's square Dial-A-Moon frames include a roughly 7% black border.
    // Sampling the whole image as the disc created a dark annulus and a false
    // outer radius. Crop the texture coordinates to the actual lunar limb.
    const float PHOTO_DISC_RADIUS = 0.432;
    vec2 photo_uv = vec2(
        0.5 + texture_point.x * PHOTO_DISC_RADIUS,
        0.5 - texture_point.y * PHOTO_DISC_RADIUS
    );
    vec3 photo_srgb = texture(u_photo, photo_uv).rgb;
    // Remove the compressed JPEG black floor before inverse transfer. Without
    // this, exposure turns the nominally unlit hemisphere into a gray plate.
    vec3 photo_linear = pow(
        max((photo_srgb - vec3(0.006)) / 0.994, vec3(0.0)),
        vec3(2.08)
    );
    vec3 photographed_surface = photo_linear * u_light_tint;
    float lunar_disc = 1.0 - smoothstep(0.94, 1.0, radial);
    float shadow_gate = 1.0 - smoothstep(-0.018, 0.035, incidence);
    vec3 earthshine = mix(u_shadow_tint, u_light_tint, 0.24) *
        u_earthshine * shadow_gate * lunar_disc * 0.16;
    photographed_surface += earthshine;
    vec3 surface = mix(procedural_surface, photographed_surface, u_use_photo);
    surface = tone_map(surface * u_transmittance * u_exposure);

    float limb_width = max(fwidth(radial) * 1.15, 0.006);
    float limb = 1.0 - smoothstep(1.0 - limb_width, 1.0, radial);
    float opposition_bloom = pow(smoothstep(0.985, 1.0, u_fraction), 2.0) *
        pow(max(surface_normal.z, 0.0), 5.0) * 0.055;
    surface += u_light_tint * opposition_bloom;
    out_color = vec4(surface, limb * u_opacity);
}`;

// NASA Scientific Visualization Studio CGI Moon Kit: LROC WAC albedo and
// LOLA elevation mosaics, projected onto the shader-lit lunar sphere below.
const MOON_ALBEDO_URL = "/assets/moon/lroc-color-2k.jpg";
const MOON_ELEVATION_URL = "/assets/moon/lola-elevation-1k.jpg";

const parseRgb = (color: string): [number, number, number] => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [255, 255, 255];
    return [channels[0] / 255, channels[1] / 255, channels[2] / 255];
};

const compileShader = (
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to allocate celestial shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(message);
    }
    return shader;
};

const createProgram = (
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
) => {
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to allocate celestial program");
    const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) ?? "Unknown program error";
        gl.deleteProgram(program);
        throw new Error(message);
    }
    return program;
};

const createTexture = (gl: WebGL2RenderingContext) => {
    const texture = gl.createTexture();
    if (!texture) throw new Error("Unable to allocate lunar texture");
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 128, 255]),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    return texture;
};

const loadTexture = (
    gl: WebGL2RenderingContext,
    texture: WebGLTexture,
    source: string,
    redraw: () => void,
) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image,
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        redraw();
    });
    image.src = source;
};

interface CelestialCanvasProps {
    scene: CelestialScene;
    paused?: boolean;
}

export function CelestialCanvas({ scene, paused = false }: CelestialCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef(scene);
    const pausedRef = useRef(paused);
    const redrawRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        sceneRef.current = scene;
        redrawRef.current?.();
    }, [scene]);

    useEffect(() => {
        pausedRef.current = paused;
        redrawRef.current?.();
    }, [paused]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;

        const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: true,
            depth: false,
            powerPreference: "low-power",
            premultipliedAlpha: true,
        });
        if (!gl) return undefined;

        let starProgram: WebGLProgram;
        let moonProgram: WebGLProgram;
        try {
            starProgram = createProgram(gl, STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER);
            moonProgram = createProgram(gl, MOON_VERTEX_SHADER, MOON_FRAGMENT_SHADER);
        } catch (error) {
            console.warn("Celestial shaders unavailable", error);
            return undefined;
        }

        const starBuffer = gl.createBuffer();
        const moonBuffer = gl.createBuffer();
        if (!starBuffer || !moonBuffer) return undefined;
        gl.bindBuffer(gl.ARRAY_BUFFER, moonBuffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            gl.STATIC_DRAW,
        );

        const albedoTexture = createTexture(gl);
        const elevationTexture = createTexture(gl);
        const photoTexture = createTexture(gl);
        let requestedPhotoUrl = "";
        let loadedPhotoUrl = "";
        let photoRequest = 0;
        let uploadedScene: CelestialScene | null = null;
        let starCount = 0;
        let devicePixelRatio = 1;

        const uniform = (program: WebGLProgram, name: string) =>
            gl.getUniformLocation(program, name);

        const requestPhotoTexture = (source: string) => {
            requestedPhotoUrl = source;
            loadedPhotoUrl = "";
            const request = ++photoRequest;
            const image = new Image();
            image.decoding = "async";
            image.addEventListener("load", () => {
                if (request !== photoRequest) return;
                gl.bindTexture(gl.TEXTURE_2D, photoTexture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA,
                    gl.RGBA,
                    gl.UNSIGNED_BYTE,
                    image,
                );
                gl.generateMipmap(gl.TEXTURE_2D);
                loadedPhotoUrl = source;
                draw();
            });
            image.addEventListener("error", () => {
                if (request === photoRequest) loadedPhotoUrl = "";
            });
            image.src = source;
        };

        const draw = (time = performance.now() / 1000) => {
            if (document.hidden) return;
            const current = sceneRef.current;
            if (
                current.moon.photoUrl &&
                current.moon.photoUrl !== requestedPhotoUrl
            ) {
                requestPhotoTexture(current.moon.photoUrl);
            }
            const bounds = canvas.getBoundingClientRect();
            devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(1, Math.round(bounds.width * devicePixelRatio));
            const height = Math.max(1, Math.round(bounds.height * devicePixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
                gl.viewport(0, 0, width, height);
            }

            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.disable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);

            if (uploadedScene !== current) {
                const starData = new Float32Array(current.stars.length * 10);
                current.stars.forEach((star, index) => {
                    const offset = index * 10;
                    const color = parseRgb(star.color);
                    starData.set(
                        [
                            star.x / 100,
                            star.y / 100,
                            Math.max(1, star.radius * 2.12),
                            star.opacity,
                            color[0],
                            color[1],
                            color[2],
                            star.scintillation,
                            star.phaseOffset,
                            star.chromaticScintillation,
                        ],
                        offset,
                    );
                });
                gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, starData, gl.DYNAMIC_DRAW);
                starCount = current.stars.length;
                uploadedScene = current;
            }

            if (starCount > 0 && current.starsOpacity > 0.001) {
                gl.useProgram(starProgram);
                gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
                const stride = 10 * Float32Array.BYTES_PER_ELEMENT;
                const attributes: Array<[string, number, number]> = [
                    ["a_position", 2, 0],
                    ["a_size", 1, 2],
                    ["a_opacity", 1, 3],
                    ["a_color", 3, 4],
                    ["a_scintillation", 1, 7],
                    ["a_phase", 1, 8],
                    ["a_chromatic", 1, 9],
                ];
                attributes.forEach(([name, size, offset]) => {
                    const location = gl.getAttribLocation(starProgram, name);
                    gl.enableVertexAttribArray(location);
                    gl.vertexAttribPointer(
                        location,
                        size,
                        gl.FLOAT,
                        false,
                        stride,
                        offset * Float32Array.BYTES_PER_ELEMENT,
                    );
                });
                gl.uniform1f(uniform(starProgram, "u_time"), time);
                gl.uniform1f(
                    uniform(starProgram, "u_pixel_ratio"),
                    devicePixelRatio,
                );
                gl.uniform1f(
                    uniform(starProgram, "u_global_opacity"),
                    current.starsOpacity,
                );
                gl.uniform2f(
                    uniform(starProgram, "u_viewport"),
                    width,
                    height,
                );
                gl.blendFuncSeparate(
                    gl.SRC_ALPHA,
                    gl.ONE,
                    gl.ONE,
                    gl.ONE_MINUS_SRC_ALPHA,
                );
                gl.drawArrays(gl.POINTS, 0, starCount);
            }

            const moon = current.moon;
            if (moon.visible && moon.opacity > 0.001) {
                gl.useProgram(moonProgram);
                gl.bindBuffer(gl.ARRAY_BUFFER, moonBuffer);
                const location = gl.getAttribLocation(moonProgram, "a_position");
                gl.enableVertexAttribArray(location);
                gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);

                const minimumDimension = Math.min(bounds.width, bounds.height);
                const radiusCss = Math.min(
                    20,
                    Math.max(10.5, minimumDimension * 0.016),
                ) * moon.scale;
                const radius = radiusCss * devicePixelRatio;
                const centerX = moon.x / 50 - 1;
                const centerY = 1 - moon.y / 50;
                gl.uniform2f(uniform(moonProgram, "u_center"), centerX, centerY);
                gl.uniform2f(
                    uniform(moonProgram, "u_extent"),
                    (radius * 8 * 2) / width,
                    (radius * 8 * 2) / height,
                );
                gl.uniform1f(uniform(moonProgram, "u_fraction"), moon.fraction);
                gl.uniform1f(
                    uniform(moonProgram, "u_light_angle"),
                    (moon.rotation * Math.PI) / 180,
                );
                gl.uniform1f(
                    uniform(moonProgram, "u_texture_angle"),
                    (moon.textureRotation * Math.PI) / 180,
                );
                gl.uniform1f(uniform(moonProgram, "u_opacity"), moon.opacity);
                gl.uniform1f(
                    uniform(moonProgram, "u_halo_opacity"),
                    moon.haloOpacity,
                );
                gl.uniform1f(
                    uniform(moonProgram, "u_earthshine"),
                    moon.earthshineOpacity,
                );
                gl.uniform1f(
                    uniform(moonProgram, "u_exposure"),
                    moon.exposure,
                );
                gl.uniform3fv(
                    uniform(moonProgram, "u_light_tint"),
                    parseRgb(moon.lightColor),
                );
                gl.uniform3fv(
                    uniform(moonProgram, "u_shadow_tint"),
                    parseRgb(moon.shadowColor),
                );
                gl.uniform3fv(
                    uniform(moonProgram, "u_transmittance"),
                    moon.transmittance,
                );
                gl.uniform2f(
                    uniform(moonProgram, "u_texel"),
                    1 / 2048,
                    1 / 1024,
                );
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, albedoTexture);
                gl.uniform1i(uniform(moonProgram, "u_albedo"), 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, elevationTexture);
                gl.uniform1i(uniform(moonProgram, "u_elevation"), 1);
                gl.activeTexture(gl.TEXTURE2);
                gl.bindTexture(gl.TEXTURE_2D, photoTexture);
                gl.uniform1i(uniform(moonProgram, "u_photo"), 2);
                gl.uniform1f(
                    uniform(moonProgram, "u_use_photo"),
                    moon.photoUrl && loadedPhotoUrl === moon.photoUrl ? 1 : 0,
                );
                gl.blendFuncSeparate(
                    gl.SRC_ALPHA,
                    gl.ONE_MINUS_SRC_ALPHA,
                    gl.ONE,
                    gl.ONE_MINUS_SRC_ALPHA,
                );
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
        };

        redrawRef.current = () => draw();
        loadTexture(gl, albedoTexture, MOON_ALBEDO_URL, () => draw());
        loadTexture(gl, elevationTexture, MOON_ELEVATION_URL, () => draw());
        draw();

        const resizeObserver = new ResizeObserver(() => draw());
        resizeObserver.observe(canvas);
        const animation = window.setInterval(() => {
            const current = sceneRef.current;
            if (
                !pausedRef.current &&
                current.starsOpacity > 0.02 &&
                current.stars.some((star) => star.scintillation > 0.01)
            ) {
                window.requestAnimationFrame((timestamp) => draw(timestamp / 1000));
            }
        }, 80);
        const handleVisibility = () => {
            if (!document.hidden) draw();
        };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            redrawRef.current = null;
            window.clearInterval(animation);
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", handleVisibility);
            gl.deleteBuffer(starBuffer);
            gl.deleteBuffer(moonBuffer);
            gl.deleteTexture(albedoTexture);
            gl.deleteTexture(elevationTexture);
            gl.deleteTexture(photoTexture);
            gl.deleteProgram(starProgram);
            gl.deleteProgram(moonProgram);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={styles.celestialCanvas}
            data-visible-stars={scene.stars.length}
            data-moon-phase={
                scene.moon.visible ? scene.moon.phaseName : "below horizon"
            }
            data-moon-renderer={
                scene.moon.photoUrl ? "nasa-hourly" : "lro-shader"
            }
        />
    );
}

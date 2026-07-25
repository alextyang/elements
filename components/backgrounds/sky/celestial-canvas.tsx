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

uniform float u_time;
uniform float u_pixel_ratio;
uniform float u_global_opacity;

out vec3 v_color;
out float v_opacity;
out float v_bright;

void main() {
    float slow = sin(u_time * 1.19 + a_phase * 19.7);
    float medium = sin(u_time * 2.31 + a_phase * 43.1);
    float quick = sin(u_time * 4.73 + a_phase * 71.9);
    float shimmer = slow * 0.52 + medium * 0.31 + quick * 0.17;
    float intensity = 1.0 + shimmer * a_scintillation;
    float chroma = shimmer * a_scintillation * 0.17;

    gl_Position = vec4(a_position.x * 2.0 - 1.0, 1.0 - a_position.y * 2.0, 0.0, 1.0);
    gl_PointSize = a_size * u_pixel_ratio * (1.0 + shimmer * a_scintillation * 0.1);
    v_color = clamp(a_color + vec3(chroma * 0.32, -chroma * 0.08, -chroma * 0.24), 0.0, 1.0);
    v_opacity = a_opacity * u_global_opacity * intensity;
    v_bright = smoothstep(5.2, 10.0, a_size);
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

    float core = exp(-radius * radius * 18.0);
    float airy = exp(-radius * radius * 3.7) * 0.27;
    float cross = (
        exp(-abs(p.x) * 28.0) + exp(-abs(p.y) * 28.0)
    ) * exp(-radius * 4.4) * 0.08 * v_bright;
    float alpha = (core + airy + cross) * v_opacity;
    vec3 spectralCore = mix(v_color, vec3(1.0), core * 0.76);
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
uniform vec2 u_texel;
uniform float u_fraction;
uniform float u_light_angle;
uniform float u_texture_angle;
uniform float u_opacity;
uniform float u_halo_opacity;
uniform float u_earthshine;
uniform vec3 u_light_tint;
uniform vec3 u_shadow_tint;
out vec4 out_color;

const float PI = 3.141592653589793;

vec2 rotate2d(vec2 point, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s, c) * point;
}

void main() {
    // Work in screen coordinates: +x right, +y down. The apparent bright-limb
    // angle therefore remains identical to the astronomical projection.
    vec2 screen_point = vec2(v_disc.x, -v_disc.y);
    float radial = length(screen_point);
    if (radial > 8.0) discard;

    if (radial > 1.0) {
        float near_aureole = exp(-(radial - 1.0) * 1.45);
        float atmospheric_scatter = exp(-(radial - 1.0) * 0.32);
        float halo = u_halo_opacity * (near_aureole * 0.82 + atmospheric_scatter * 0.12);
        out_color = vec4(u_light_tint, halo * u_opacity);
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
        (0.055 + u_earthshine * (0.58 + surface_normal.z * 0.42));
    vec3 surface = mix(dark_surface, lit_surface, lit_mask);

    float limb = smoothstep(0.0, 0.038, 1.0 - radial);
    float opposition_bloom = smoothstep(0.88, 1.0, u_fraction) *
        pow(max(surface_normal.z, 0.0), 5.0) * 0.1;
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
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
            premultipliedAlpha: false,
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
        let uploadedScene: CelestialScene | null = null;
        let starCount = 0;
        let devicePixelRatio = 1;

        const uniform = (program: WebGLProgram, name: string) =>
            gl.getUniformLocation(program, name);

        const draw = (time = performance.now() / 1000) => {
            if (document.hidden) return;
            const current = sceneRef.current;
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
                            Math.max(2.5, star.radius * 5.2),
                            star.opacity,
                            color[0],
                            color[1],
                            color[2],
                            star.scintillation,
                            star.phaseOffset,
                            star.bright ? 1 : 0,
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
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
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
                    36,
                    Math.max(16, minimumDimension * 0.027),
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
                gl.uniform3fv(
                    uniform(moonProgram, "u_light_tint"),
                    parseRgb(moon.lightColor),
                );
                gl.uniform3fv(
                    uniform(moonProgram, "u_shadow_tint"),
                    parseRgb(moon.shadowColor),
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
                gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
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
            gl.deleteProgram(starProgram);
            gl.deleteProgram(moonProgram);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={styles.celestialCanvas}
            data-visible-stars={scene.stars.length}
            data-moon-phase={scene.moon.visible ? scene.moon.phaseName : "below horizon"}
        />
    );
}

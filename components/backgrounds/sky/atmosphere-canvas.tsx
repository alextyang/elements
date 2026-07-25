"use client";

import { useEffect, useRef } from "react";

import type { SkyPalette } from "./sky-palettes";
import styles from "./sky.module.css";

export interface SkyRadianceScene {
    palette: SkyPalette;
    sun: [number, number];
    moon: [number, number];
    solarAltitude: number;
    nightDepth: number;
    moonlight: number;
    aerosol: number;
    humidity: number;
    cloudiness: number;
    edgeStrength: number;
    horizonStrength: number;
    airglowStrength: number;
    seed: [number, number, number, number];
}

const VERTEX_SHADER = `#version 300 es
precision highp float;

in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 out_color;

uniform vec2 u_resolution;
uniform vec2 u_sun;
uniform vec2 u_moon;
uniform vec4 u_optics;
uniform vec4 u_light;
uniform vec4 u_seed;
uniform float u_airglow;
uniform vec3 u_top;
uniform vec3 u_upper;
uniform vec3 u_middle;
uniform vec3 u_horizon;
uniform vec3 u_low;
uniform vec3 u_left;
uniform vec3 u_right;
uniform vec3 u_glow;
uniform vec3 u_haze;

const float PI = 3.141592653589793;

float saturate(float value) {
    return clamp(value, 0.0, 1.0);
}

float smoother(float edge0, float edge1, float value) {
    float t = saturate((value - edge0) / max(0.0001, edge1 - edge0));
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float hash21(vec2 point) {
    vec3 p3 = fract(vec3(point.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float value_noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

float fbm(vec2 point) {
    float sum = 0.0;
    float weight = 0.56;
    mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
    for (int octave = 0; octave < 4; octave++) {
        sum += value_noise(point) * weight;
        point = turn * point * 2.03 + 7.17;
        weight *= 0.48;
    }
    return sum / 1.02;
}

vec3 srgb_to_linear(vec3 color) {
    vec3 low = color / 12.92;
    vec3 high = pow((color + 0.055) / 1.055, vec3(2.4));
    return mix(low, high, step(vec3(0.04045), color));
}

vec3 linear_to_srgb(vec3 color) {
    color = max(color, vec3(0.0));
    vec3 low = color * 12.92;
    vec3 high = 1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), color));
}

vec3 sky_spline(float y) {
    // Five broad, zero-slope transitions form a continuous vertical radiance
    // profile. Unlike CSS color stops, no palette key owns a visible band.
    vec3 color = u_top;
    color = mix(color, u_upper, smoother(0.02, 0.39, y));
    color = mix(color, u_middle, smoother(0.20, 0.68, y));
    color = mix(color, u_horizon, smoother(0.47, 0.91, y));
    color = mix(color, u_low, smoother(0.73, 1.08, y));
    return color;
}

vec3 view_direction(vec2 uv) {
    float azimuth = (uv.x - 0.5) * PI * 1.34;
    float elevation = mix(PI * 0.51, -0.035, pow(uv.y, 0.91));
    float cos_elevation = cos(elevation);
    return normalize(vec3(
        sin(azimuth) * cos_elevation,
        sin(elevation),
        cos(azimuth) * cos_elevation
    ));
}

vec3 source_direction(vec2 point) {
    float azimuth = (point.x - 0.5) * PI * 1.34;
    float elevation = mix(PI * 0.51, -0.035, pow(clamp(point.y, 0.0, 1.15), 0.91));
    float cos_elevation = cos(elevation);
    return normalize(vec3(
        sin(azimuth) * cos_elevation,
        sin(elevation),
        cos(azimuth) * cos_elevation
    ));
}

float henyey_greenstein(float cosine, float g) {
    float g2 = g * g;
    return (1.0 - g2) /
        max(0.12, 4.0 * PI * pow(1.0 + g2 - 2.0 * g * cosine, 1.5));
}

void main() {
    // WebGL has a bottom-left texture origin; convert to the screen's top-left.
    vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
    float y = uv.y;
    float night = u_optics.x;
    float aerosol = u_optics.y;
    float humidity = u_optics.z;
    float cloudiness = u_optics.w;
    float solar_altitude = u_light.x;
    float moonlight = u_light.y;
    float edge_strength = u_light.z;
    float horizon_strength = u_light.w;

    vec3 base_srgb = sky_spline(y);
    vec3 radiance = srgb_to_linear(base_srgb);
    vec3 view = view_direction(uv);
    vec3 sun_direction = source_direction(u_sun);
    vec3 moon_direction = source_direction(u_moon);
    float sun_cosine = dot(view, sun_direction);
    float moon_cosine = dot(view, moon_direction);

    // Kasten-Young-inspired optical path length. It steepens naturally close
    // to the horizon without introducing a horizontal color-stop boundary.
    float elevation_sine = max(0.018, view.y);
    float air_mass = 1.0 / (elevation_sine + 0.115 * pow(elevation_sine + 0.035, -0.55));
    float normalized_path = saturate((air_mass - 0.88) / 4.6);
    float molecular = pow(normalized_path, 1.18);
    float aerosol_path = pow(normalized_path, mix(1.9, 0.72, aerosol));

    // Rayleigh is broad; Mie is strongly forward-scattering. A weaker reverse
    // lobe supplies the observed antisolar / Belt-of-Venus volume at twilight.
    float rayleigh_phase = 0.0597 * (1.0 + sun_cosine * sun_cosine);
    float mie_phase = henyey_greenstein(sun_cosine, mix(0.64, 0.82, aerosol));
    float reverse_phase = henyey_greenstein(-sun_cosine, 0.38);
    float sun_available = smoother(-15.0, 6.0, solar_altitude);
    float twilight = 1.0 - smoother(-5.0, 11.0, abs(solar_altitude + 2.0));
    float forward_scatter = sun_available * mie_phase *
        (0.026 + aerosol * 0.085) * (0.35 + aerosol_path * 0.92);
    float molecular_fill = sun_available * rayleigh_phase *
        (0.014 + molecular * 0.038) * (1.0 - cloudiness * 0.22);
    float antisolar = twilight * reverse_phase * molecular *
        (0.012 + (1.0 - humidity) * 0.018);

    vec3 glow_linear = srgb_to_linear(u_glow);
    vec3 haze_linear = srgb_to_linear(u_haze);
    radiance += glow_linear * forward_scatter * (1.0 - night * 0.84);
    radiance += mix(haze_linear, glow_linear, 0.28) * molecular_fill * (1.0 - night * 0.72);
    radiance += mix(srgb_to_linear(u_middle), haze_linear, 0.64) * antisolar;

    // Horizontal anisotropy wraps around the screen edges as atmospheric
    // illumination, not as a pair of recognizable radial stamps.
    float left_field = exp(-pow((uv.x + 0.07) / 0.48, 2.0)) *
        smoother(0.18, 0.94, y);
    float right_field = exp(-pow((1.07 - uv.x) / 0.49, 2.0)) *
        smoother(0.16, 0.93, y);
    float edge_fade = (1.0 - night * 0.58) * edge_strength;
    radiance = mix(radiance, srgb_to_linear(u_left), left_field * edge_fade * 0.16);
    radiance = mix(radiance, srgb_to_linear(u_right), right_field * edge_fade * 0.16);

    // Correlated low-frequency density variation gives clean skies depth and
    // makes aerosol fields non-uniform. The amplitude stays below cloud form.
    vec2 density_point = vec2(
        uv.x * (2.15 + u_seed.x * 1.2) + u_seed.z * 11.0,
        uv.y * (3.2 + u_seed.y * 1.4) + u_seed.w * 9.0
    );
    float density = fbm(density_point) - 0.50;
    float density_envelope = smoother(0.08, 0.87, y) * (1.0 - smoother(0.88, 1.02, y));
    float density_amount = (0.006 + aerosol * 0.012 + humidity * 0.008) * density_envelope;
    radiance *= 1.0 + density * density_amount * (1.0 - cloudiness * 0.38);

    // Multiple-scattering fill is wide and lowest-frequency. It prevents a
    // clear sky from reading as a flat ramp while retaining twilight contrast.
    float horizon_volume = exp(-pow((y - mix(0.77, 0.87, aerosol)) /
        mix(0.31, 0.20, aerosol), 2.0));
    float multi_scatter = horizon_volume * horizon_strength *
        (0.015 + aerosol * 0.024 + humidity * 0.018) * (1.0 - night * 0.72);
    radiance += haze_linear * multi_scatter;

    // Natural night is layered rather than uniformly blue: weak airglow,
    // integrated celestial radiance, moon aureole, and near-horizon extinction.
    float nocturnal_airglow = night * u_airglow *
        exp(-pow((y - (0.68 + u_seed.y * 0.13)) / (0.19 + u_seed.x * 0.08), 2.0));
    float airglow_ripple = 0.74 + 0.26 * fbm(vec2(uv.x * 2.5 + u_seed.z * 13.0, uv.y * 1.4));
    vec3 oxygen_airglow = mix(
        haze_linear,
        srgb_to_linear(vec3(0.20, 0.42, 0.34)),
        0.13 + (1.0 - aerosol) * 0.10
    );
    radiance += oxygen_airglow * nocturnal_airglow * airglow_ripple * (0.006 + 0.018 * u_seed.x);

    float zodiacal_axis = abs((uv.x - (0.25 + u_seed.z * 0.5)) + (y - 0.76) * (u_seed.y - 0.5));
    float zodiacal = night * (1.0 - moonlight) * (1.0 - aerosol) *
        exp(-zodiacal_axis * 8.5) * smoother(0.36, 0.86, y) * (0.002 + u_seed.x * 0.003);
    radiance += srgb_to_linear(vec3(0.48, 0.45, 0.39)) * zodiacal;

    float lunar_mie = henyey_greenstein(moon_cosine, mix(0.61, 0.76, aerosol));
    float lunar_aureole = moonlight * lunar_mie *
        (0.018 + aerosol * 0.06 + humidity * 0.025) * (0.38 + aerosol_path);
    radiance += mix(vec3(0.50, 0.61, 0.82), haze_linear, 0.35) * lunar_aureole;

    // Deeper clear-night zeniths preserve the range between pristine,
    // moonlit, humid, smoky, and cloud-amplified night instead of lifting all
    // families toward the same gray-purple floor.
    float zenith_depth = night * (1.0 - aerosol * 0.34) * (1.0 - humidity * 0.22) *
        (1.0 - smoother(0.42, 0.96, y));
    radiance *= 1.0 - zenith_depth * (0.20 - moonlight * 0.09);

    // A gentle shoulder contains additive scattering in scene-linear space.
    radiance = radiance / (vec3(1.0) + max(radiance - vec3(0.72), vec3(0.0)) * 0.72);
    vec3 display = linear_to_srgb(radiance);

    // One quantisation-level triangular dither removes 8-bit contouring. It is
    // fixed in physical pixel space, so the static pass never shimmers.
    float dither = (hash21(gl_FragCoord.xy + 17.0) + hash21(gl_FragCoord.yx + 83.0) - 1.0) / 255.0;
    display = clamp(display + dither, 0.0, 1.0);
    out_color = vec4(display, 1.0);
}`;

const createShader = (
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create atmospheric shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(message);
    }
    return shader;
};

const createProgram = (gl: WebGL2RenderingContext) => {
    const vertex = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create atmospheric program");
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

const parseColor = (value: string): [number, number, number] => {
    const rgb = value.match(/[\d.]+/g)?.map(Number);
    if (value.startsWith("rgb") && rgb && rgb.length >= 3) {
        return [rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];
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

interface AtmosphereCanvasProps {
    scene: SkyRadianceScene;
}

export function AtmosphereCanvas({ scene }: AtmosphereCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sceneRef = useRef(scene);
    const drawRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        sceneRef.current = scene;
        drawRef.current?.();
    }, [scene]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return undefined;
        const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            powerPreference: "low-power",
            premultipliedAlpha: false,
        });
        if (!gl) return undefined;

        let program: WebGLProgram;
        try {
            program = createProgram(gl);
        } catch (error) {
            console.warn("Atmospheric shader unavailable", error);
            return undefined;
        }

        const buffer = gl.createBuffer();
        if (!buffer) return undefined;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW,
        );

        const position = gl.getAttribLocation(program, "a_position");
        const uniform = (name: string) => gl.getUniformLocation(program, name);
        const colorUniforms = [
            ["u_top", "top"],
            ["u_upper", "upper"],
            ["u_middle", "middle"],
            ["u_horizon", "horizon"],
            ["u_low", "low"],
            ["u_left", "left"],
            ["u_right", "right"],
            ["u_glow", "glow"],
            ["u_haze", "haze"],
        ] as const;

        const draw = () => {
            if (document.hidden) return;
            const current = sceneRef.current;
            const bounds = canvas.getBoundingClientRect();
            // The field is deliberately low-frequency, so 1.5x DPR is visually
            // lossless while halving fill cost on dense laptop displays.
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
            const width = Math.max(1, Math.round(bounds.width * pixelRatio));
            const height = Math.max(1, Math.round(bounds.height * pixelRatio));
            if (canvas.width !== width || canvas.height !== height) {
                canvas.width = width;
                canvas.height = height;
            }

            gl.viewport(0, 0, width, height);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            gl.enableVertexAttribArray(position);
            gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
            gl.uniform2f(uniform("u_resolution"), width, height);
            gl.uniform2f(uniform("u_sun"), current.sun[0], current.sun[1]);
            gl.uniform2f(uniform("u_moon"), current.moon[0], current.moon[1]);
            gl.uniform4f(
                uniform("u_optics"),
                current.nightDepth,
                current.aerosol,
                current.humidity,
                current.cloudiness,
            );
            gl.uniform4f(
                uniform("u_light"),
                current.solarAltitude,
                current.moonlight,
                current.edgeStrength,
                current.horizonStrength,
            );
            gl.uniform4fv(uniform("u_seed"), current.seed);
            gl.uniform1f(uniform("u_airglow"), current.airglowStrength);
            colorUniforms.forEach(([uniformName, paletteKey]) => {
                gl.uniform3fv(uniform(uniformName), parseColor(current.palette[paletteKey]));
            });
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        };

        drawRef.current = draw;
        draw();
        const resizeObserver = new ResizeObserver(draw);
        resizeObserver.observe(canvas);
        const visibilityHandler = () => {
            if (!document.hidden) draw();
        };
        document.addEventListener("visibilitychange", visibilityHandler);

        return () => {
            drawRef.current = null;
            resizeObserver.disconnect();
            document.removeEventListener("visibilitychange", visibilityHandler);
            gl.deleteBuffer(buffer);
            gl.deleteProgram(program);
        };
    }, []);

    return <canvas ref={canvasRef} className={styles.radianceCanvas} />;
}

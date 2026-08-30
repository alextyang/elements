/**
 * Original cloud noise assets, generated on the GPU at renderer start.
 *
 * Three volumes follow the Horizon Zero Dawn / Nubis decomposition:
 *
 * - `base` (128³ RGBA): R is Perlin-Worley, GBA are inverted Worley at rising
 *   frequency. The FBM of GBA erodes R into connected billows.
 * - `detail` (32³ RGB): inverted Worley at three frequencies, used to carve
 *   wispy edges without disturbing the silhouette.
 * - `weather` (512² RGBA): R coverage, G cumulus/stratus type, B precipitation,
 *   A high-frequency break-up. Advected by wind as a UV offset.
 * - `curl` (128² RGB): 2D curl of a gradient field, deforming cloud edges.
 *
 * Every volume is tileable: cell coordinates are wrapped with `mod` against the
 * cell count so trilinear sampling stays continuous across the repeat boundary.
 * Nothing here is derived from a third-party shader pack; the noise is standard
 * published construction (Perlin gradient noise, Worley cellular noise).
 */

export interface CloudNoiseTextures {
    base: WebGLTexture;
    detail: WebGLTexture;
    weather: WebGLTexture;
    curl: WebGLTexture;
    dispose: () => void;
}

const BASE_SIZE = 128;
const DETAIL_SIZE = 32;
const WEATHER_SIZE = 512;
const CURL_SIZE = 128;

const QUAD_VERTEX = `#version 300 es
precision highp float;
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

/** Shared hashing and lattice noise used by every generator below. */
const NOISE_COMMON = `
precision highp float;

uniform float u_slice;
uniform float u_size;
uniform vec4 u_seed;

vec3 hash33(vec3 cell) {
    cell = vec3(
        dot(cell, vec3(127.1, 311.7, 74.7)),
        dot(cell, vec3(269.5, 183.3, 246.1)),
        dot(cell, vec3(113.5, 271.9, 124.6))
    );
    return fract(sin(cell + u_seed.xyz * 17.0) * 43758.5453123);
}

float hash13(vec3 cell) {
    return fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719)) +
        u_seed.w * 11.0) * 43758.5453123);
}

vec3 fade3(vec3 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

/**
 * Tileable Perlin gradient noise. Lattice corners are wrapped against the cell
 * count so the volume repeats seamlessly.
 */
float perlin3(vec3 point, float cells) {
    point *= cells;
    vec3 base = floor(point);
    vec3 local = fract(point);
    vec3 smoothed = fade3(local);

    float result = 0.0;
    for (int corner = 0; corner < 8; corner++) {
        vec3 offset = vec3(
            float(corner & 1),
            float((corner >> 1) & 1),
            float((corner >> 2) & 1)
        );
        vec3 wrapped = mod(base + offset, vec3(cells));
        vec3 gradient = normalize(hash33(wrapped) * 2.0 - 1.0);
        float contribution = dot(gradient, local - offset);
        vec3 weight = mix(1.0 - smoothed, smoothed, offset);
        result += contribution * weight.x * weight.y * weight.z;
    }
    return result * 0.5 + 0.5;
}

/**
 * Tileable Worley (cellular) noise, returned inverted so that 1.0 sits at the
 * feature points. This is the billow-shaped component of cloud structure.
 */
float worley3(vec3 point, float cells) {
    point *= cells;
    vec3 base = floor(point);
    vec3 local = fract(point);

    float nearest = 1.0;
    for (int z = -1; z <= 1; z++) {
        for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
                vec3 offset = vec3(float(x), float(y), float(z));
                vec3 wrapped = mod(base + offset, vec3(cells));
                vec3 feature = offset + hash33(wrapped) - local;
                nearest = min(nearest, dot(feature, feature));
            }
        }
    }
    return 1.0 - sqrt(clamp(nearest, 0.0, 1.0));
}

float worley_fbm(vec3 point, float cells) {
    return worley3(point, cells) * 0.625 +
        worley3(point, cells * 2.0) * 0.25 +
        worley3(point, cells * 4.0) * 0.125;
}

float remap(float value, float low0, float high0, float low1, float high1) {
    return low1 + (value - low0) / max(1e-5, high0 - low0) * (high1 - low1);
}
`;

const BASE_FRAGMENT = `#version 300 es
${NOISE_COMMON}
out vec4 out_color;

void main() {
    vec3 point = vec3(gl_FragCoord.xy / u_size, u_slice);

    // Perlin-Worley: Perlin FBM dilated by inverted Worley FBM. This keeps
    // Perlin's connected, natural distribution while adopting Worley's
    // rounded billow silhouette, which is what makes cumulus read as cloud
    // rather than as smoke.
    float perlin = perlin3(point, 4.0) * 0.625 +
        perlin3(point, 8.0) * 0.25 +
        perlin3(point, 16.0) * 0.125;
    perlin = clamp(perlin, 0.0, 1.0);

    float billow = worley_fbm(point, 4.0);
    float perlin_worley = remap(perlin, billow - 1.0, 1.0, 0.0, 1.0);

    out_color = vec4(
        clamp(perlin_worley, 0.0, 1.0),
        worley_fbm(point, 4.0),
        worley_fbm(point, 8.0),
        worley_fbm(point, 16.0)
    );
}`;

const DETAIL_FRAGMENT = `#version 300 es
${NOISE_COMMON}
out vec4 out_color;

void main() {
    vec3 point = vec3(gl_FragCoord.xy / u_size, u_slice);
    out_color = vec4(
        worley_fbm(point, 2.0),
        worley_fbm(point, 4.0),
        worley_fbm(point, 8.0),
        1.0
    );
}`;

const WEATHER_FRAGMENT = `#version 300 es
${NOISE_COMMON}
out vec4 out_color;

float perlin2(vec2 point, float cells) {
    return perlin3(vec3(point, 0.35), cells);
}

/**
 * Summing unit-weight octaves of gradient noise concentrates the result tightly
 * around 0.5, which produces a featureless field with no gaps. Expanding about
 * the midpoint restores the full 0-1 range so coverage thresholding can
 * actually carve holes in the deck.
 */
float weather_fbm(vec2 point, float cells) {
    float value = perlin2(point, cells) * 0.55 +
        perlin2(point, cells * 2.1) * 0.27 +
        perlin2(point, cells * 4.3) * 0.18;
    return clamp((value - 0.5) * 2.7 + 0.5, 0.0, 1.0);
}

void main() {
    vec2 point = gl_FragCoord.xy / u_size;

    // The map tiles every ~22 km, so these cell counts set real distances:
    // coverage varies over ~7 km (weather-system scale within the tile) and
    // break-up over ~2 km (individual convective cells).
    float coverage = weather_fbm(point, 3.0);

    // Type drives the cumulus/stratus continuum locally, so a single scene can
    // hold convective cells over one region and a flat deck over another.
    float type = weather_fbm(point + vec2(31.7, 11.3), 2.0);

    // Precipitation correlates with coverage: rain shafts only form where the
    // deck is already thick.
    float precipitation = clamp(
        weather_fbm(point + vec2(7.1, 53.9), 4.0) * 0.6 + coverage * 0.5,
        0.0,
        1.0
    );

    // Break-up adds gaps and cell structure at the scale of individual clouds.
    float breakup = weather_fbm(point + vec2(67.3, 23.1), 11.0);

    out_color = vec4(coverage, type, precipitation, breakup);
}`;

const CURL_FRAGMENT = `#version 300 es
${NOISE_COMMON}
out vec4 out_color;

/**
 * Analytic curl of a 2D gradient-noise potential. Using the perpendicular of
 * the gradient produces a divergence-free field, so advecting cloud edges with
 * it swirls detail without inflating or collapsing volume.
 */
vec2 curl(vec2 point, float cells) {
    float epsilon = 1.0 / u_size;
    float dx = perlin3(vec3(point + vec2(epsilon, 0.0), 0.5), cells) -
        perlin3(vec3(point - vec2(epsilon, 0.0), 0.5), cells);
    float dy = perlin3(vec3(point + vec2(0.0, epsilon), 0.5), cells) -
        perlin3(vec3(point - vec2(0.0, epsilon), 0.5), cells);
    return vec2(dy, -dx) / (2.0 * epsilon);
}

void main() {
    vec2 point = gl_FragCoord.xy / u_size;
    vec2 coarse = curl(point, 4.0);
    vec2 fine = curl(point, 12.0);
    vec2 field = normalize(coarse + fine * 0.45 + 1e-6);
    out_color = vec4(field * 0.5 + 0.5, 0.5, 1.0);
}`;

const compile = (
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Unable to create cloud noise shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) ?? "Unknown shader error";
        gl.deleteShader(shader);
        throw new Error(message);
    }
    return shader;
};

const link = (gl: WebGL2RenderingContext, fragmentSource: string) => {
    const vertex = compile(gl, gl.VERTEX_SHADER, QUAD_VERTEX);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Unable to create cloud noise program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const message = gl.getProgramInfoLog(program) ?? "Unknown link error";
        gl.deleteProgram(program);
        throw new Error(message);
    }
    return program;
};

/**
 * Generates every cloud noise volume once. Cost is a few hundred small draw
 * calls at start; nothing here runs per frame.
 */
export function createCloudNoise(
    gl: WebGL2RenderingContext,
    seed: [number, number, number, number] = [0.31, 0.67, 0.19, 0.83],
): CloudNoiseTextures | null {
    // Rendering into a float-filterable target is unnecessary here: all four
    // volumes are unit-range masks, so RGBA8 is sufficient and keeps the base
    // volume at 8 MB rather than 32 MB.
    const quad = gl.createBuffer();
    const framebuffer = gl.createFramebuffer();
    // Generation runs inside its own vertex-array object. Without it the
    // enabled attribute array would outlive the quad buffer deleted below, and
    // the next unrelated draw would fail with "vertex buffer is not big enough"
    // whenever the two programs resolve a_position to different attribute
    // indices. The star and Moon passes isolate their state the same way.
    const vao = gl.createVertexArray();
    if (!quad || !framebuffer || !vao) return null;

    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
    );

    const created: WebGLTexture[] = [];
    const programs: WebGLProgram[] = [];

    const runProgram = (
        source: string,
        size: number,
        bind: (program: WebGLProgram, slice: number) => void,
        slices: number,
    ) => {
        const program = link(gl, source);
        programs.push(program);
        gl.useProgram(program);
        const position = gl.getAttribLocation(program, "a_position");
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(gl.getUniformLocation(program, "u_size"), size);
        gl.uniform4fv(gl.getUniformLocation(program, "u_seed"), seed);
        gl.viewport(0, 0, size, size);
        for (let slice = 0; slice < slices; slice++) {
            bind(program, slice);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        return program;
    };

    const createVolume = (size: number, source: string) => {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Unable to allocate cloud noise volume");
        created.push(texture);
        gl.bindTexture(gl.TEXTURE_3D, texture);
        gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, size, size, size);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.REPEAT);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        runProgram(
            source,
            size,
            (program, slice) => {
                gl.framebufferTextureLayer(
                    gl.FRAMEBUFFER,
                    gl.COLOR_ATTACHMENT0,
                    texture,
                    0,
                    slice,
                );
                gl.uniform1f(
                    gl.getUniformLocation(program, "u_slice"),
                    (slice + 0.5) / size,
                );
            },
            size,
        );
        return texture;
    };

    const createPlane = (size: number, source: string) => {
        const texture = gl.createTexture();
        if (!texture) throw new Error("Unable to allocate cloud noise plane");
        created.push(texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size, size);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0,
            gl.TEXTURE_2D,
            texture,
            0,
        );
        runProgram(source, size, () => {}, 1);
        return texture;
    };

    try {
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        const base = createVolume(BASE_SIZE, BASE_FRAGMENT);
        const detail = createVolume(DETAIL_SIZE, DETAIL_FRAGMENT);
        const weather = createPlane(WEATHER_SIZE, WEATHER_FRAGMENT);
        const curl = createPlane(CURL_SIZE, CURL_FRAGMENT);

        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.viewport(
            previousViewport[0],
            previousViewport[1],
            previousViewport[2],
            previousViewport[3],
        );
        gl.bindVertexArray(null);
        gl.deleteVertexArray(vao);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteBuffer(quad);
        programs.forEach((program) => gl.deleteProgram(program));

        return {
            base,
            detail,
            weather,
            curl,
            dispose: () => created.forEach((texture) => gl.deleteTexture(texture)),
        };
    } catch (error) {
        console.warn("Cloud noise generation failed", error);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.bindVertexArray(null);
        gl.deleteVertexArray(vao);
        gl.deleteFramebuffer(framebuffer);
        gl.deleteBuffer(quad);
        programs.forEach((program) => gl.deleteProgram(program));
        created.forEach((texture) => gl.deleteTexture(texture));
        return null;
    }
}

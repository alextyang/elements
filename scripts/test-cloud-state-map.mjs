import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sceneSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-scene.ts", import.meta.url),
    "utf8",
);
const stateMapSource = readFileSync(
    new URL("../components/backgrounds/sky/cloud-state-map.ts", import.meta.url),
    "utf8",
);

const speciesBlock = sceneSource.match(
    /export const WMO_CLOUD_SPECIES:[\s\S]*?= \[([\s\S]*?)\] as const;/,
);
const officialSpecies = [...speciesBlock[1].matchAll(/"([a-z-]+)"/g)]
    .map((match) => match[1]);

test("every official cloud species has a renderer-component recipe", () => {
    assert.equal(officialSpecies.length, 29);
    for (const species of officialSpecies) {
        assert.match(stateMapSource, new RegExp(`"${species}": recipe\\(`));
    }
    assert.match(stateMapSource, /Record<Exclude<CloudSpecies, "generic">, CloudRendererRecipe>/);
});

test("compound legacy identifiers compile into the correct WMO dimensions", () => {
    assert.match(stateMapSource, /"altostratus-opacus"[\s\S]*species: null, varieties: \["opacus"\]/);
    assert.match(stateMapSource, /"nimbostratus-praecipitatio"[\s\S]*species: null,[\s\S]*supplementaryFeatures: \["praecipitatio"\]/);
    assert.match(stateMapSource, /"cumulonimbus-capillatus-incus"[\s\S]*species: "capillatus",[\s\S]*supplementaryFeatures: \["incus"\]/);
    const benchmarkSource = readFileSync(
        new URL("../components/backgrounds/sky/cloud-photograph-benchmark.ts", import.meta.url),
        "utf8",
    );
    assert.doesNotMatch(benchmarkSource, /as CloudSpecies/);
    assert.match(benchmarkSource, /classificationFromDesignation/);
    assert.match(benchmarkSource, /const seed = seedFor\(reference\.id\)/);
    assert.doesNotMatch(benchmarkSource, /seedFor\(`\$\{reference\.id\}:\$\{environment\.id\}`\)/);
});

test("canonical systems validate and compile without editorial camera state", () => {
    assert.match(stateMapSource, /export interface CloudSystemState/);
    assert.match(stateMapSource, /export function validateCloudSystem/);
    assert.match(stateMapSource, /export function compileCloudSystem/);
    assert.match(stateMapSource, /export interface CompiledCloudSystem/);
    assert.match(stateMapSource, /extinctionKm: \(liquidOpticalDepth \+ iceOpticalDepth\) \/ depthKm/);
    const compilerBlock = stateMapSource.match(
        /export function compileCloudSystem[\s\S]*?\n}\n\nexport function recipeForCloudSpecies/,
    )?.[0] ?? "";
    assert.doesNotMatch(compilerBlock, /editorial/);
    assert.doesNotMatch(compilerBlock, /cameraRangeKm|horizontalFieldOfView|frameAzimuthBias/);
});

test("the state map carries all orthogonal WMO appearance axes", () => {
    const varieties = [
        "intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
        "duplicatus", "translucidus", "perlucidus", "opacus",
    ];
    const features = [
        "incus", "mamma", "virga", "praecipitatio", "arcus", "tuba",
        "asperitas", "fluctus", "cavum", "murus", "cauda",
    ];
    const accessories = ["pileus", "velum", "pannus", "flumen"];
    const specialOrigins = [
        "flammagenitus", "homogenitus", "homomutatus",
        "cataractagenitus", "silvagenitus",
    ];
    for (const state of [...varieties, ...features, ...accessories, ...specialOrigins]) {
        assert.match(stateMapSource, new RegExp(`"${state}"`));
    }
    for (const state of [
        "polar-stratospheric-sts", "polar-stratospheric-nat",
        "polar-stratospheric-ice", "nacreous", "noctilucent",
    ]) assert.match(stateMapSource, new RegExp(`"${state}"`));
});

test("physical, rendering, and editorial parameters remain separately owned", () => {
    for (const category of [
        "meteorology", "morphology", "material", "organization",
        "derived-render", "editorial",
    ]) {
        assert.match(stateMapSource, new RegExp(`category: "${category}"`));
    }
    assert.match(stateMapSource, /includes\("translucidus"\).*includes\("opacus"\)/);
    assert.match(stateMapSource, /upperAtmosphericCloud !== "none" && genus !== "clear"/);
});

test("cellular and thermal families share bounded condensation material", () => {
    const shader = readFileSync(
        new URL("../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
        "utf8",
    );
    assert.match(shader, /struct GeometrySample/);
    assert.match(shader, /closest_surface_km: vec3<f32>/);
    assert.match(shader, /surface_normal: vec3<f32>/);
    assert.match(shader, /fn geometry_ellipsoid\(/);
    assert.match(shader, /fn geometry_smooth_union\(/);
    assert.match(shader, /fn geometry_clip_to_condensation_base\(/);
    assert.match(shader, /fn geometry_wave_packet\(/);
    assert.match(shader, /fn geometry_lenticular_lens\(/);
    assert.match(shader, /fn geometry_finite_roll\(/);
    assert.match(shader, /fn geometry_tapered_roll\(/);
    assert.match(shader, /fn geometry_subtract\(/);
    assert.match(shader, /fn geometry_shallow_cap\(/);
    assert.match(shader, /fn geometry_open_cell_wall\(/);
    assert.match(shader, /fn geometry_horizontal_slab\(/);
    assert.match(shader, /fn stratus_fractus_morphology\(/);
    assert.match(shader, /fn condensation_material_density\(/);
    const cellular = shader.match(
        /fn cellular_morphology[\s\S]*?fn cirrus_morphology/,
    )?.[0] ?? "";
    assert.match(cellular, /geometry_ellipsoid\(/);
    assert.match(cellular, /geometry_smooth_union\(/);
    assert.match(cellular, /geometry_clip_to_condensation_base\(/);
    assert.match(cellular, /geometry_shallow_cap\(/);
    assert.match(cellular, /geometry_open_cell_wall\(/);
    assert.doesNotMatch(cellular, /geometry_horizontal_slab\(/);
    assert.match(cellular, /Do not fill high-cover stratocumulus/);
    assert.match(cellular, /condensation_material_density\(\s*geometry,/);
    assert.match(cellular, /let colony_field = noise2\(/);
    assert.match(cellular, /let birth_rank = mix\(birth_seed, colony_field/);
    assert.match(cellular, /let stratiformis = species == 4 \|\| species == 8 \|\| species == 13/);
    assert.match(shader, /fn convective_morphology[\s\S]*condensation_material_density\(/);
    assert.doesNotMatch(
        cellular,
        /var cloudlet = max\(flat_base/,
    );
    assert.doesNotMatch(cellular, /let wall = 1\.0 - smoothstep/);
    assert.match(shader, /geometry\.surface_normal/);
    assert.match(shader, /geometry\.inverse_curvature_km/);
    assert.match(shader, /geometry\.seam_01/);
    const lenticular = shader.match(
        /fn lenticular_morphology[\s\S]*?fn volutus_morphology/,
    )?.[0] ?? "";
    const volutus = shader.match(
        /fn volutus_morphology[\s\S]*?fn stratus_fractus_morphology/,
    )?.[0] ?? "";
    assert.match(lenticular, /geometry_lenticular_lens\(/);
    assert.doesNotMatch(lenticular, /geometry_wave_packet\(/);
    assert.match(lenticular, /condensation_material_density\(/);
    assert.doesNotMatch(lenticular, /sdf_ellipsoid\(/);
    assert.match(volutus, /geometry_oriented_ellipsoid\(/);
    assert.match(volutus, /geometry_smooth_union\(/);
    assert.match(volutus, /geometry_tapered_roll\(/);
    assert.doesNotMatch(volutus, /geometry_subtract\(/);
    assert.match(volutus, /condensation_material_density\(/);
    assert.doesNotMatch(volutus, /sdf_ellipsoid\(/);
    const fiberBundle = shader.match(
        /fn cirrus_bundle_morphology[\s\S]*?fn density_at/,
    )?.[0] ?? "";
    assert.match(fiberBundle, /geometry_curved_fibre\(/);
    assert.match(fiberBundle, /bundle_geometry = geometry_smooth_union/);
    assert.match(fiberBundle, /condensation_material_density\(/);
    assert.match(fiberBundle, /if \(strand == 0 && species == 2\)/);
    assert.match(fiberBundle, /if \(strand == 0 && species == 3\)/);
    assert.match(fiberBundle, /let compact_tuft = species == 22 \|\| species == 23/);
    assert.match(fiberBundle, /if \(compact_tuft\)/);
    assert.match(fiberBundle, /for \(var turret_index = 0; turret_index < 3/);
    assert.match(fiberBundle, /let tail = geometry_oriented_ellipsoid/);
    assert.match(fiberBundle, /let tail_companion = geometry_oriented_ellipsoid/);
    assert.match(shader, /fn stratus_fractus_feature_morphology/);
    assert.match(shader, /genus == 8 && species == 16[\s\S]*stratus_fractus_feature_morphology\(/);
});

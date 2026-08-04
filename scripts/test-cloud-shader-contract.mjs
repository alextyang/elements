import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shaderSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
    "utf8",
);
const rendererSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/sky-renderer-canvas.tsx", import.meta.url),
    "utf8",
);
const rendererTypesSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/renderer-types.ts", import.meta.url),
    "utf8",
);
const cloudPhotographBenchmarkSource = fs.readFileSync(
    new URL("../app/cloud-photographs/cloud-photograph-benchmark.tsx", import.meta.url),
    "utf8",
);
const skySource = fs.readFileSync(
    new URL("../components/backgrounds/sky/sky.tsx", import.meta.url),
    "utf8",
);
const atmosphericCompositionSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/atmospheric-composition.ts", import.meta.url),
    "utf8",
);
const opticsWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-optics-wgsl.ts", import.meta.url),
    "utf8",
);
const opticsRuntimeSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-optics.ts", import.meta.url),
    "utf8",
);
const weatherProductionWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/weather-phenomena-production-wgsl.ts",
        import.meta.url),
    "utf8",
);
const specializedWeatherWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/specialized-weather-transport-wgsl.ts",
        import.meta.url),
    "utf8",
);
const weatherOpticsWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/weather-optical-phenomena-wgsl.ts",
        import.meta.url),
    "utf8",
);
const morphologyWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-morphology-modifiers-wgsl.ts",
        import.meta.url),
    "utf8",
);
const cloudLightWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-light-volume-wgsl.ts", import.meta.url),
    "utf8",
);
const cloudLightRuntimeSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-light-volume-runtime.ts", import.meta.url),
    "utf8",
);
const shadowedAtmosphereWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-shadowed-atmosphere-transport-wgsl.ts",
        import.meta.url),
    "utf8",
);
const cloudExteriorContractWgslSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-volume-exterior-contract-wgsl.ts",
        import.meta.url),
    "utf8",
);
const cloudVolumeAtlasSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-volume-atlas.ts", import.meta.url),
    "utf8",
);
const validatorSource = fs.readFileSync(
    new URL("./validate-webgpu-shaders.mjs", import.meta.url),
    "utf8",
);
const cloudShaderSource = shaderSource.slice(
    shaderSource.indexOf("export const WEBGPU_CLOUD_SHADER"),
    shaderSource.indexOf("export const WEBGPU_CLOUD_METRICS_SHADER"),
);
const compiledCloudShaderSource = cloudShaderSource.replace(
    /\/\*[\s\S]*?\*\//g,
    "",
);
const productionCloudEntryPoint = "cloud_fragment_physical_layers";
const experimentalCloudEntryPoint = "cloud_fragment_ordered_experimental";
const productionCloudStart = cloudShaderSource.indexOf(
    `@fragment\nfn ${productionCloudEntryPoint}(`,
);
const experimentalCloudStart = cloudShaderSource.indexOf(
    `@fragment\nfn ${experimentalCloudEntryPoint}(`,
);
const productionCloudEnd = cloudShaderSource.indexOf(
    "\n/*\n * Legacy mean-depth composition",
    productionCloudStart,
);
const productionCloudFragment = cloudShaderSource.slice(
    productionCloudStart,
    productionCloudEnd,
);
const experimentalCloudFragment = cloudShaderSource.slice(experimentalCloudStart);
const productionLayerShaderSource = shaderSource.slice(
    shaderSource.indexOf("export const WEBGPU_CLOUD_LAYER_SHADER"),
    shaderSource.indexOf("export const WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER"),
);
const productionLayerCompositorSource = shaderSource.slice(
    shaderSource.indexOf("export const WEBGPU_CLOUD_LAYER_COMPOSITOR_SHADER"),
    shaderSource.indexOf("export const WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER"),
);
const finalCompositeShaderSource = shaderSource.slice(
    shaderSource.indexOf("export const WEBGPU_COMPOSITE_SHADER"),
);

test("real WebGPU validation is browser-driven, bounded, and self-cleaning", () => {
    assert.match(validatorSource, /async function orchestrate\(\)/);
    assert.match(validatorSource, /startValidationServer\(\)/);
    assert.match(validatorSource, /WebGPU browser validation/);
    assert.match(validatorSource, /validationTimeoutMs \+ 15_000/);
    assert.match(validatorSource, /await stopProcessTree\(serverChild\)/);
    assert.match(validatorSource, /process\.argv\.includes\("--serve"\)/);
});

test("WebGPU validation fails closed on shader diagnostics and scoped pipeline errors", async () => {
    assert.match(validatorSource,
        /typeof module\.getCompilationInfo !== "function"/);
    assert.match(validatorSource,
        /boundedWebGPUWait\(\s*module\.getCompilationInfo\(\)/);
    assert.match(validatorSource,
        /return \[\.\.\.info\.messages\]\.filter\(isErrorSeverity\)/);
    assert.match(validatorSource,
        /\[message\.type, message\.severity\][\s\S]{0,160}=== "error"/);
    assert.match(validatorSource,
        /moduleName \+ line \+ column \+ " \[" \+ severity/);
    assert.match(validatorSource,
        /modules\[name\] = await withValidationErrorScope\(name,[\s\S]{0,240}compilationErrors\(name, module\)/);
    assert.match(validatorSource,
        /async function withValidationErrorScope\(name, operation\)[\s\S]{0,800}device\.popErrorScope\(\)/);
    assert.doesNotMatch(validatorSource, /popErrorScope\(\)\.catch/);
    assert.doesNotMatch(validatorSource, /if \(!module\.getCompilationInfo\) return \[\]/);

    const helperStart = validatorSource.indexOf("async function boundedWebGPUWait");
    const helperEnd = validatorSource.indexOf("async function validate()", helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart);
    const helpers = new Function("window", `
        "use strict";
        const shaderDiagnosticTimeoutMs = 50;
        ${validatorSource.slice(helperStart, helperEnd)}
        return { compilationErrors, formatCompilationMessage };
    `)({ setTimeout, clearTimeout });
    const reservedKeyword = {
        type: "error",
        message: "'active' is a reserved keyword",
        lineNum: 417,
        linePos: 13,
    };
    const errors = await helpers.compilationErrors("WEBGPU_CLOUD_SHADER", {
        async getCompilationInfo() {
            return { messages: [reservedKeyword, { type: "warning", message: "unused" }] };
        },
    });
    assert.deepEqual(errors, [reservedKeyword]);
    assert.equal(
        helpers.formatCompilationMessage("WEBGPU_CLOUD_SHADER", errors[0]),
        "WEBGPU_CLOUD_SHADER:417:13 [error] 'active' is a reserved keyword",
    );
    await assert.rejects(
        helpers.compilationErrors("UNCHECKED_SHADER", {}),
        /UNCHECKED_SHADER: GPUShaderModule\.getCompilationInfo\(\) is unavailable/,
    );
    await assert.rejects(
        helpers.compilationErrors("STALLED_SHADER", {
            getCompilationInfo() { return new Promise(() => {}); },
        }),
        /STALLED_SHADER getCompilationInfo\(\) did not complete within 50ms/,
    );
});

test("validator compiles exact production compositions and rejects broken weather ABI", () => {
    assert.match(validatorSource, /productionComposedShaderContracts/);
    assert.match(validatorSource,
        /WEBGPU_CLOUD_LAYER_SHADER[\s\S]*?weather_production_cloud_direct_radiance/);
    assert.match(validatorSource,
        /for \(const reservedIdentifier of \["active", "shared"\]\)/);
    assert.match(validatorSource,
        /WGSL multi-component swizzle assignment/);
    assert.match(validatorSource,
        /wgslCallArities[\s\S]*?cloud_macro_owner_sample expects 8 arguments/);
    assert.match(validatorSource,
        /Exact application-owned layout mirrored from sky-renderer-canvas\.tsx/);
    assert.match(validatorSource,
        /layout: cloudPipelineLayout[\s\S]*?cloud_fragment_physical_layer/);
    assert.match(validatorSource,
        /const productionParameterBufferBytes = 54 \* 16/);
    assert.match(validatorSource,
        /size: productionParameterBufferBytes/);
    assert.doesNotMatch(validatorSource, /35 \* 16/);
    assert.doesNotMatch(validatorSource,
        /exactCloudLayerPipelines\[0\]\.getBindGroupLayout/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_AUXILIARY_SHADER = withoutWgslEntryPoint\([\s\S]*?\) \+ WEATHER_PRODUCTION_TRANSPORT_WGSL/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_COUPLING_SHADER =\s*pruneWgslFunctionsToEntryPoints\(\s*WEBGPU_CLOUD_AUXILIARY_SHADER,\s*\["cloud_coupling_shadow_compute"\]/);
    assert.match(weatherOpticsWgslSource, /\benabled: f32/);
    assert.doesNotMatch(weatherOpticsWgslSource, /^\s*active\s*:/m);
    const stripComments = (source) => source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
    const compiledProductionSources = stripComments(
        `${shaderSource}\n${specializedWeatherWgslSource}`,
    );
    assert.doesNotMatch(stripComments(weatherProductionWgslSource), /\bactive\b/);
    assert.doesNotMatch(stripComments(specializedWeatherWgslSource), /\bactive\b/);
    assert.doesNotMatch(
        compiledProductionSources,
        /\b(?:let|var|const)\s+shared\b/,
        "Chrome/Dawn reserves `shared` in WGSL",
    );
    assert.doesNotMatch(
        compiledProductionSources,
        /\bresult\.xz\s*=/,
        "WGSL cannot assign through the non-contiguous xz swizzle",
    );
    assert.doesNotMatch(
        compiledProductionSources,
        /cloud_lv_sample_owner_scattering_radiance\([\s\S]{0,220}?\bdiffusion\s*,\s*asymmetry\s*\)/,
    );
});

test("cloud light-volume storage views bind one mip at a time", () => {
    assert.match(rendererSource,
        /binding: 5, resource: mipView\(output, level\)/);
    assert.match(rendererSource,
        /binding: 3,[\s\S]{0,180}mipView\([\s\S]{0,100}cloudLightMediumExtinction, level\)/);
    assert.match(rendererSource,
        /binding: 4,[\s\S]{0,180}mipView\([\s\S]{0,100}cloudLightMediumScattering, level\)/);
    assert.doesNotMatch(rendererSource,
        /binding: 5, resource: output\.createView\(\)/);
});

test("qualified fibratus source material uses ordered bounded CPU uploads", () => {
    const uploadStart = rendererSource.indexOf(
        "const uploadFibratusSourceMaterial =",
    );
    const uploadEnd = rendererSource.indexOf(
        'if (work.phase === "boundary")',
        uploadStart,
    );
    assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
    const uploadBlock = rendererSource.slice(uploadStart, uploadEnd);
    assert.match(uploadBlock, /createCloudFibratusSourceField\(\{/);
    assert.match(uploadBlock, /usage: BUFFER\.COPY_SRC/);
    assert.match(uploadBlock, /mappedAtCreation: true/);
    assert.match(uploadBlock, /encoder\.copyBufferToTexture\(/);
    assert.doesNotMatch(uploadBlock, /queue\.writeTexture\(/,
        "source uploads must retain Sun/Beer/Moon command ordering");
    const sunStart = rendererSource.indexOf(
        'if (work.phase === "source-materialize-sun")',
    );
    const sunEnd = rendererSource.indexOf(
        'if (work.phase === "direct-sun")',
        sunStart,
    );
    const moonStart = rendererSource.indexOf(
        'if (work.phase === "source-materialize-moon")',
    );
    const moonEnd = rendererSource.indexOf(
        'if (work.phase === "direct-moon")',
        moonStart,
    );
    const sunBlock = rendererSource.slice(sunStart, sunEnd);
    const moonBlock = rendererSource.slice(moonStart, moonEnd);
    assert.match(sunBlock, /if \(fibratusSource\)/);
    assert.match(sunBlock, /uploadFibratusSourceMaterial\(0\)/);
    assert.match(sunBlock, /advanceBrick\("direct-sun"\)/);
    assert.match(sunBlock, /return "cpu-progress"/);
    assert.match(moonBlock, /if \(fibratusSource\)/);
    assert.match(moonBlock, /uploadFibratusSourceMaterial\(1\)/);
    assert.match(moonBlock, /advanceBrick\("direct-moon"\)/);
    assert.match(moonBlock, /return "cpu-progress"/);
    assert.match(rendererSource,
        /if \(result === "cpu-progress"\) \{\s*break;\s*\}/,
        "one finite-volume field per draw bounds browser main-thread work");
});

test("cloud light-volume compilation is pruned by reachable family", () => {
    const pipelineStart = rendererSource.indexOf(
        "const exactSourcePipelineDescriptors",
    );
    const pipelineEnd = rendererSource.indexOf(
        'setInitializationStage("pipelines-cloud-physical-layer-transport")',
        pipelineStart,
    );
    assert.ok(pipelineStart >= 0 && pipelineEnd > pipelineStart);
    const pipelineBlock = rendererSource.slice(pipelineStart, pipelineEnd);
    assert.match(pipelineBlock, /exactSourcePipelineDescriptors/);
    assert.match(pipelineBlock, /directPipelineDescriptors/);
    assert.match(pipelineBlock, /p1ExactPipelineDescriptors/);
    assert.match(pipelineBlock, /p1MinimalPipelineDescriptors/);
    assert.match(pipelineBlock,
        /directPipelineDescriptors = \[[\s\S]*?cloud_lv_clear_fluence_compute/,
        "direct-only publication must compile its required vacuum clear");
    assert.match(pipelineBlock,
        /const \[cloudLightDirectSunPipeline,[\s\S]*?cloudLightClearPipeline\] = directPipelines/,
        "the always-compiled direct family must initialize the clear pipeline");
    assert.doesNotMatch(pipelineBlock, /let cloudLightClearPipeline/,
        "the direct-only clear pipeline must never be nullable or lazily P1-owned");
    assert.equal(
        (pipelineBlock.match(/\["cloud_lv_[^"]+_compute"/g) ?? []).length,
        16,
    );
    assert.match(rendererSource,
        /for \(const \[entryPoint, label\] of descriptors\)[\s\S]*?await createCloudLightPipeline/);
    assert.match(rendererSource,
        /initialCloudLightRuntime\.residentLayerMask !== 0[\s\S]*?ensureCloudLightP1Pipelines/);
    assert.match(rendererSource,
        /cloudLightRuntime\.residentLayerMask !== 0[\s\S]*?ensureCloudLightP1Pipelines/);
    const initialSourceModule = rendererSource.indexOf(
        "const cloudLightSourceModule = device.createShaderModule");
    const initialSourcePipelines = rendererSource.indexOf(
        "const exactSourcePipelines = await");
    const residentModule = rendererSource.indexOf(
        "code: WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER");
    const p1Module = rendererSource.indexOf(
        "code: WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER");
    const lightningModule = rendererSource.indexOf(
        "code: WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER");
    assert.ok(initialSourceModule >= 0 &&
        initialSourceModule < initialSourcePipelines);
    assert.ok(initialSourcePipelines < residentModule && residentModule < p1Module);
    assert.ok(initialSourcePipelines < lightningModule);
});

test("lightning light-volume compute binds every atmosphere dependency", () => {
    const bindingsBetween = (source, start, end) => {
        const first = source.indexOf(start);
        const last = source.indexOf(end, first + start.length);
        assert.ok(first >= 0 && last > first);
        return [...source.slice(first, last).matchAll(/binding:\s*(\d+)/g)]
            .map((match) => Number(match[1]));
    };
    const expected = [0, 2, 3, 5, 6, 16, 17, 18, 32, 19, 20, 23, 24, 25,
        26, 28, 30, 35];
    assert.deepEqual(bindingsBetween(rendererSource,
        "const cloudLightLightningGroup0", "const cloudLightPhysicalGroup0"),
    expected);
    assert.deepEqual(bindingsBetween(validatorSource,
        "const lightLightningGroup0", "const lightPhysicalGroup0"), expected);
});

test("mixed-resolution cloud histories are cleared in separate passes", () => {
    const clearStart = rendererSource.indexOf("const clearViews = (");
    const clearEnd = rendererSource.indexOf("if (backgroundDirty)", clearStart);
    const clearBlock = rendererSource.slice(clearStart, clearEnd);
    assert.match(clearBlock, /views\.forEach\(\(view\) =>/);
    assert.match(clearBlock, /colorAttachments: \[\{/);
    assert.doesNotMatch(clearBlock, /colorAttachments: views\.map/);
});

test("cloud turbulence consumes the packed weather curl field", () => {
    assert.match(shaderSource, /weather_sample\.ba/);
    assert.match(shaderSource, /layer\.motion\.w/);
});

test("production cloud transport materializes its light-volume sampling ABI", () => {
    assert.match(cloudShaderSource,
        /\$\{CLOUD_LIGHT_VOLUME_SAMPLING_WGSL\}/);
    assert.match(cloudShaderSource, /cloud_lv_owner_sample_confidence/);
});

test("primary density reuses packed weather and volume channels without duplicate hash fBm", () => {
    assert.match(shaderSource, /column_sample\.g \* 0\.64/);
    assert.match(shaderSource, /worley_fbm = dot\(base_sample\.gba/);
    assert.doesNotMatch(shaderSource, /fbm2\(weather_uv\)/);
    assert.doesNotMatch(shaderSource, /fbm3\(q \* layer\.scale\.x \* 0\.38\)/);
});

test("cloud organization breaks short texture periods without adding weather samples", () => {
    assert.match(shaderSource, /struct WeatherHierarchy/);
    assert.match(shaderSource, /fn weather_hierarchy/);
    assert.match(shaderSource, /weather_uv\.x \* 0\.613 - weather_uv\.y \* 0\.790/);
    assert.match(shaderSource, /first_coordinate = weather_uv \* 0\.173/);
    assert.match(shaderSource, /second_coordinate = rotated \* 0\.397/);
    assert.match(shaderSource, /let column_sample = weather_fields\.mesoscale/);
    assert.match(shaderSource, /let system_position = point\.xz \+ wind \* 0\.015/);
    assert.match(shaderSource, /cloud_editorial_population\(\s*system_position/);
    assert.match(shaderSource, /fn volume_domain/);
    assert.match(shaderSource, /basis_position = volume_domain/);
    assert.doesNotMatch(shaderSource, /let weather_coord = fract\(weather_uv \* 0\.28\)/);
    assert.match(shaderSource, /moisture_intersection = min\(first\.r, second\.r\)/);
});

test("analytic morphology is not clipped by the generic sheet profile", () => {
    assert.match(shaderSource, /let sheet_family = genus == 3 \|\| genus == 5 \|\| genus == 6 \|\| genus == 8/);
    assert.match(shaderSource, /if \(sheet_family\) \{[\s\S]*vertical = stratiform_vertical_profile/);
    assert.doesNotMatch(shaderSource, /let vertical = height_profile\(profile_h, layer, column\)/);
});

test("stratiform genera own distinct vertical and column constitutions", () => {
    const verticalProfile = shaderSource.match(
        /fn stratiform_vertical_profile[\s\S]*?fn sphere_hits/,
    )?.[0] ?? shaderSource.match(
        /fn stratiform_vertical_profile[\s\S]*?fn [a-z_]+\(/,
    )?.[0] ?? "";
    assert.match(shaderSource, /fn stratiform_vertical_profile\(/);
    assert.match(verticalProfile, /let veil_base =/);
    assert.match(verticalProfile, /let upper_ice_thinning =/);
    assert.match(verticalProfile, /let precipitation_core =/);
    assert.match(verticalProfile, /let top_loaded_droplets =/);
    assert.match(shaderSource, /vertical = stratiform_vertical_profile\(/);
    assert.match(shaderSource, /let top_sink = smoothstep\(/);
    assert.match(shaderSource, /if \(genus == 3\) \{[\s\S]*Cirrostratus veil/);
    assert.match(shaderSource, /if \(genus == 5\) \{[\s\S]*lower_liquid_loading/);
    assert.match(shaderSource, /if \(genus == 6\) \{[\s\S]*lower_particle_depletion/);
    assert.match(shaderSource, /if \(genus == 8\) \{[\s\S]*top of Stratus/);
});

test("stratus fractus is a thin advected shred with concave entrainment bites", () => {
    const fractus = shaderSource.match(
        /fn stratus_fractus_feature_morphology[\s\S]*?fn cellular_feature_morphology/,
    )?.[0] ?? "";
    assert.match(fractus, /for \(var shred_index = 1; shred_index < 6; shred_index\+\+\)/);
    assert.match(fractus, /let cross_drift =/);
    assert.match(fractus, /let vertical_drift =/);
    assert.match(fractus, /for \(var bite_index = 0; bite_index < 3; bite_index\+\+\)/);
    assert.match(fractus, /geometry = geometry_subtract\(geometry, entrainment_bite\)/);
    assert.doesNotMatch(fractus, /var geometry = geometry_ellipsoid\([\s\S]*vec3<f32>\(major \* 0\.52/);
    assert.match(rendererSource, /const axisAngle = windAngle \+ \(random\(\) - 0\.5\) \* 0\.42/);
    assert.match(rendererSource, /const minor = major \* \(0\.18 \+ random\(\) \* 0\.22\)/);
});

test("owned ice features and calvus geometry cannot detach from their parent", () => {
    assert.match(shaderSource, /head_ownership \* cell_active/);
    assert.match(shaderSource, /breakup \*[\s\S]*cell_active \* 0\.72/);
    assert.match(shaderSource, /let calvus_cap = geometry_ellipsoid/);
    assert.match(shaderSource, /geometry = geometry_smooth_union\(\s*geometry, calvus_cap/);
    assert.doesNotMatch(shaderSource, /sdf = max\(sdf, anvil \+ radius \* 0\.12\)/);
});

test("genus morphology is driven by its physical formation hierarchy", () => {
    assert.match(shaderSource, /fn convective_morphology/);
    assert.match(shaderSource, /let flat_base =/);
    assert.match(shaderSource, /let shoulder_a = morphology_lobe/);
    assert.match(shaderSource, /let shoulder_b = morphology_lobe/);
    assert.match(shaderSource, /let crown = morphology_lobe/);
    assert.match(shaderSource, /let cap = morphology_lobe/);
    assert.match(shaderSource, /let vertical_radius = clamp/);
    assert.match(shaderSource, /let anvil_horizontal =/);
    assert.match(shaderSource, /let overshoot = morphology_lobe/);
    assert.match(shaderSource, /fn editorial_storm_morphology/);
    assert.match(shaderSource, /tower, anvil and overshoot share the same local coordinates/);
    assert.match(shaderSource, /system_position, h, layer, index,\s*formation_driver/);
    assert.match(shaderSource, /system_position, h, layer, index, genus/);
    assert.match(shaderSource, /camera_visible_system_range/);
    assert.match(shaderSource, /cloud_editorial_primary_angle/);
    assert.doesNotMatch(shaderSource, /let core_geometry = geometry_ellipsoid/);
    assert.match(shaderSource, /let spine_count = select\(5, 8, storm\)/);
    assert.match(shaderSource, /if \(spine_parcel\)/);
    assert.match(shaderSource, /let projected_surface = sample_position - geometry\.surface_normal/);
    assert.match(shaderSource, /warped_surface = closest_surface \+ tangent_warp/);
    assert.match(shaderSource, /fn cellular_morphology/);
    assert.match(shaderSource, /Irregularly jittered cell centres/);
    assert.match(shaderSource, /second_distance - nearest_distance/);
    assert.match(shaderSource, /signed F2-F1 wall is a connected physical network/);
    assert.match(shaderSource, /fn cirrus_morphology/);
    assert.match(shaderSource, /let hooked_across =/);
    assert.match(shaderSource, /let along_taper =/);
    assert.match(shaderSource, /for \(var strand = 0; strand < 4; strand\+\+\)/);
    assert.match(shaderSource, /let half_height = mix/);
    assert.match(shaderSource, /fn cirrus_bundle_morphology/);
    assert.match(shaderSource, /bundle_geometry = geometry_smooth_union/);
    assert.match(shaderSource, /fn cirrus_feature_morphology/);
    assert.match(shaderSource, /fn cirrus_ice_microstructure/);
    assert.match(shaderSource,
        /cirrus_ice_microstructure\(\s*geometry, base_sample, detail_sample,[\s\S]*?species == 3/);
    assert.match(shaderSource,
        /let dense_ice = saturate\(dense_ice_fraction\)[\s\S]*?mix\(0\.30, 0\.52, dense_ice\)/);
    assert.match(shaderSource,
        /let edge_fraction = 1\.0 - smoothstep\([\s\S]*?geometry\.support_clearance_km/);
    assert.match(shaderSource,
        /if \(genus == 1\) \{ morphology_detail_frequency = 0\.12; \}/);
    assert.match(shaderSource, /var<storage, read> cloud_features: array<CloudFeature>/);
    assert.match(shaderSource, /return cirrus_feature_morphology/);
    assert.match(shaderSource, /return cellular_morphology/);
    assert.match(shaderSource, /fn convective_feature_morphology/);
    assert.match(shaderSource, /return convective_feature_morphology/);
    assert.match(shaderSource,
        /return genus == 5 \|\| genus == 6 \|\|\s*\(genus == 8 && species != 16\)/);
    assert.match(shaderSource,
        /Cirrostratus is a geometrically thin sheet[\s\S]*?owner-support event march/);
    assert.doesNotMatch(shaderSource,
        /return genus == 3 \|\| genus == 5 \|\| genus == 6 \|\| genus == 7/);
});

test("production cellular species use distinct meteorological owner topologies", () => {
    const cellularFeatures = shaderSource.match(
        /fn cirrocumulus_stratiformis_owner[\s\S]*?fn cellular_morphology/,
    )?.[0] ?? "";
    const dispatcher = shaderSource.match(
        /fn cellular_feature_morphology[\s\S]*?fn cellular_morphology/,
    )?.[0] ?? "";

    assert.match(cellularFeatures, /fn cirrocumulus_stratiformis_owner/);
    assert.match(cellularFeatures, /let row = f32\(member % 3\) - 1\.0/);
    assert.match(cellularFeatures, /let ripple_phase = sin\(/);
    assert.match(cellularFeatures, /for \(var member = 0; member < 10; member\+\+\)/);

    assert.match(cellularFeatures, /fn altocumulus_stratiformis_owner/);
    assert.match(cellularFeatures, /let shared_base_lift =/);
    assert.match(cellularFeatures, /geometry_clip_to_condensation_base/);

    assert.match(cellularFeatures, /fn stratocumulus_stratiformis_owner/);
    assert.match(cellularFeatures, /var geometry_valid = false/);
    assert.match(cellularFeatures, /geometry_shallow_cap_at/);
    assert.match(cellularFeatures, /for \(var channel_index = 0; channel_index < 2/);
    assert.match(cellularFeatures, /geometry_subtract\([\s\S]*geometry_capsule/);

    assert.match(cellularFeatures, /fn cellular_castellanus_owner/);
    assert.match(cellularFeatures, /let turret_count =/);
    assert.match(cellularFeatures, /for \(var turret_index = 0; turret_index < 6/);
    assert.match(cellularFeatures, /base_companion/);

    assert.match(cellularFeatures, /fn cellular_floccus_owner/);
    assert.match(cellularFeatures, /let dry_notch = geometry_ellipsoid/);
    assert.match(cellularFeatures, /let virga_probability =/);
    assert.match(cellularFeatures, /let virga = geometry_capsule/);
    assert.doesNotMatch(cellularFeatures, /post-density fade mask/);

    assert.match(dispatcher, /if \(species == 4\)/);
    assert.match(dispatcher, /else if \(species == 8\)/);
    assert.match(dispatcher, /else if \(species == 13\)/);
    assert.match(dispatcher, /species == 5 \|\| species == 10 \|\| species == 29/);
    assert.match(dispatcher, /species == 25 \|\| species == 26 \|\| species == 30/);

    assert.match(rendererSource, /const isStratiformis = species === 4/);
    assert.match(rendererSource, /const isCastellanus = species === 5/);
    assert.match(rendererSource, /const isFloccus = species === 25/);
    assert.match(rendererSource, /species === 4\s*\? 9 \+ Math\.floor\(random\(\) \* 2\)/);
    assert.match(rendererSource, /isCastellanus\s*\? 4 \+ Math\.floor\(random\(\) \* 3\)/);
});

test("lenticular packets use physical crosswind asymmetric lens geometry", () => {
    const lenticular = shaderSource.match(
        /fn lenticular_morphology[\s\S]*?fn volutus_morphology/,
    )?.[0] ?? "";
    assert.match(shaderSource, /fn geometry_lenticular_lens/);
    assert.match(shaderSource, /let elliptical_radius = sqrt/);
    assert.match(shaderSource, /let upper_depth =/);
    assert.match(shaderSource, /let lower_depth =/);
    assert.match(shaderSource, /let windward_width =/);
    assert.match(shaderSource, /let lee_width =/);
    assert.match(lenticular, /geometry_lenticular_lens\(/);
    assert.match(lenticular, /let lamina_count =/);
    assert.match(lenticular, /for \(var lamina = 0; lamina < 3; lamina\+\+\)/);
    assert.doesNotMatch(lenticular, /geometry_wave_packet\(/);
    assert.match(rendererSource, /const crossWindAxis = windAngle \+ Math\.PI \* 0\.5/);
    assert.match(rendererSource, /layer\.shear, stackCount/);
});

test("volutus uses one tapered roll support with restrained crest billows", () => {
    const volutus = shaderSource.match(
        /fn volutus_morphology[\s\S]*?fn stratus_fractus_morphology/,
    )?.[0] ?? "";
    assert.match(shaderSource, /fn geometry_tapered_roll/);
    assert.match(shaderSource, /let terminal_support =/);
    assert.match(shaderSource, /let end_taper =/);
    assert.match(shaderSource, /let circulation_bias =/);
    assert.match(volutus, /var geometry = geometry_tapered_roll\(/);
    assert.match(volutus, /for \(var billow_index = 0; billow_index < 6; billow_index\+\+\)/);
    assert.match(volutus, /let circulation_angle = atan2/);
    assert.doesNotMatch(volutus, /billow_index < 12/);
    assert.match(rendererSource, /const rollAxis = windAngle \+ Math\.PI \* 0\.5/);
});

test("owned cumulus uses connected persistent thermal branches", () => {
    const ownedConvection = shaderSource.match(
        /fn convective_feature_morphology[\s\S]*?fn density_at/,
    )?.[0] ?? "";
    assert.match(ownedConvection, /let root_radius =/);
    assert.match(ownedConvection, /root_height \* 0\.56/);
    assert.match(ownedConvection, /root_radius \* mix\(0\.82, 0\.90/);
    assert.match(ownedConvection, /var cumulus_branch_count = 3/);
    assert.match(ownedConvection, /var cumulus_tier_count = 2/);
    assert.match(ownedConvection, /let branch_direction =/);
    assert.match(ownedConvection, /var parent_center =/);
    assert.match(ownedConvection, /let hidden_connector = geometry_capsule\(/);
    assert.match(ownedConvection, /geometry_clip_to_condensation_base\(/);
    assert.match(ownedConvection, /let cumulus_base_ramp =/);
    assert.doesNotMatch(
        ownedConvection,
        /geometry = geometry_profiled_cumulus_tower\(/,
    );
});

test("owned storms use connected feeder trees and an attached ice shield", () => {
    const ownedConvection = shaderSource.match(
        /fn convective_feature_morphology[\s\S]*?fn density_at/,
    )?.[0] ?? "";
    assert.match(ownedConvection, /let storm_root_radius =/);
    assert.match(ownedConvection, /let storm_branch_count = 4/);
    assert.match(ownedConvection, /var branch_tier_count = 7/);
    assert.match(ownedConvection, /let feeder_amount =/);
    assert.match(
        ownedConvection,
        /let storm_hidden_connector = geometry_capsule\(/,
    );
    assert.match(ownedConvection, /storm_crown_center =/);
    assert.match(ownedConvection, /let crown_primary = geometry_ellipsoid\(/);
    assert.match(ownedConvection, /let crown_downwind = geometry_ellipsoid\(/);
    assert.match(ownedConvection, /let anvil_attachment_center = storm_crown_center/);
    assert.match(ownedConvection, /let crown_condensate =/);
    assert.doesNotMatch(
        ownedConvection,
        /geometry = geometry_profiled_storm_tower\(/,
    );
    assert.doesNotMatch(ownedConvection, /let tower_clearance =/);
    assert.match(
        shaderSource,
        /let terminal_thinning = mix\(\s*1\.0, 0\.64,/,
    );
});

test("every mapped WMO family samples camera-independent manifest macro volumes", () => {
    const systemStruct = shaderSource.match(
        /struct CloudSystem \{[\s\S]*?\n\};/,
    )?.[0] ?? "";
    assert.equal(
        [...systemStruct.matchAll(/:\s*vec4<f32>/g)].length,
        16,
        "CloudSystem WGSL ABI must remain exactly sixteen vec4s",
    );
    assert.match(shaderSource, /struct CloudSystemBuffer \{\s*header: vec4<f32>,\s*systems: array<CloudSystem>/);
    assert.match(shaderSource, /@binding\(16\) var cloud_macro_atlas: texture_3d<f32>/);
    assert.match(shaderSource, /@binding\(17\) var cloud_macro_majorants: texture_3d<f32>/);
    assert.match(shaderSource, /@binding\(18\) var cloud_macro_sampler: sampler/);
    assert.match(shaderSource, /@binding\(19\) var<storage, read> cloud_system_buffer: CloudSystemBuffer/);
    assert.match(shaderSource, /@binding\(20\) var<storage, read> cloud_macro_bindings: CloudMacroBindingBuffer/);
    assert.match(shaderSource, /condensate_paths: vec4<f32>/);
    assert.match(shaderSource, /cloud_macro_bindings\.header\.y - 7\.0/);

    assert.match(shaderSource,
        /import \{ CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL \} from/);
    assert.match(shaderSource, /\$\{CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL\}/);
    const macroDensity = (cloudExteriorContractWgslSource + shaderSource).match(
        /fn cloud_exterior_volume_contract[\s\S]*?\/\/ Feature-owned buoyant thermals/,
    )?.[0] ?? "";
    const sdfNormal = macroDensity.match(
        /fn cloud_macro_sdf_normal[\s\S]*?fn cloud_exterior_shape_signal/,
    )?.[0] ?? "";
    const displacedBoundary = macroDensity.match(
        /fn cloud_macro_displaced_boundary_density[\s\S]*?struct CloudMacroOwnerSample/,
    )?.[0] ?? "";
    assert.match(macroDensity, /for \(var slot = 0; slot < 36; slot\+\+\)/);
    assert.match(macroDensity, /if \(slot >= system_count\) \{ break; \}/);
    assert.match(macroDensity, /local_position\.xz - center/);
    assert.match(shaderSource, /x=crosswind, y=altitude/);
    assert.match(macroDensity, /dot\(delta, crosswind_axis\)/);
    assert.match(macroDensity, /dot\(delta, downwind_axis\)/);
    assert.match(macroDensity, /storage_coordinate \* atlas_binding\.atlas_scale\.xyz/);
    assert.match(macroDensity,
        /majorant_coordinate_local \* atlas_binding\.majorant_scale\.xyz/);
    assert.match(macroDensity, /textureLoad\(\s*cloud_macro_majorants/);
    assert.match(macroDensity, /textureSampleLevel\(\s*cloud_macro_atlas, cloud_macro_sampler/);
    assert.doesNotMatch(macroDensity, /fract\([^\n]*atlas_uv/);
    assert.match(macroDensity, /macro_sample\.r/);
    assert.match(macroDensity,
        /cloud_exterior_select_class\(\s*permitted_mask, saturate\(macro_sample\.g\), saturate\(macro_sample\.b\),\s*species, precipitation_kind\)/);
    assert.match(macroDensity,
        /let explicit_fibre = species == 1 \|\| species == 3 \|\| species == 22/);
    assert.match(macroDensity,
        /let explicit_sedimentation = species == 2 \|\| species == 23 \|\|\s*precipitation_kind == 1/);
    assert.match(macroDensity,
        /fn cloud_macro_protected_core_density\([\s\S]*?species == 1 \|\| species == 2[\s\S]*?return saturate\(macro_sample\.r\)/);
    assert.doesNotMatch(macroDensity,
        /formation_mechanism == 3\) \{ core_floor = 0\.28/);
    assert.equal((shaderSource.match(
        /cloud_macro_protected_core_density\(/g) ?? []).length, 2,
    "protected core is reachable only through the shared transport evaluator");
    assert.equal((shaderSource.match(
        /cloud_macro_transport_material_density\(/g) ?? []).length, 4,
    "camera, displaced low cloud, and filtered DSM share one material rule");
    assert.match(macroDensity,
        /fn cloud_macro_transport_material_density\([\s\S]*?genus >= 1 && genus <= 3[\s\S]*?return saturate\(macro_sample\.r\)/);
    assert.match(macroDensity, /let decoded = \(encoded \* 255\.0 - 128\.0\)/);
    assert.match(macroDensity, /cloud_macro_bindings\.header\.w/);
    assert.match(macroDensity,
        /fn cloud_macro_displaced_boundary_density\(/);
    assert.match(macroDensity,
        /let displaced_sdf_voxels = sdf_voxels - displacement_voxels/);
    assert.match(macroDensity,
        /let boundary_occupancy = 1\.0 - smoothstep/);
    assert.doesNotMatch(macroDensity, /boundary_material/);
    assert.match(macroDensity, /protected_core/);
    assert.match(macroDensity, /protected_base_scale/);
    assert.match(sdfNormal, /let voxel = 1\.0 \/ 47\.0/);
    for (const axis of ["dx", "dy", "dz"]) {
        assert.match(sdfNormal, new RegExp(`canonical \\+ ${axis}`));
        assert.match(sdfNormal, new RegExp(`canonical - ${axis}`));
    }
    assert.match(displacedBoundary,
        /maximum_axis_scale = max\(\s*detail_contract\.axis_scale\.x,\s*max\(detail_contract\.axis_scale\.y, detail_contract\.axis_scale\.z\)\)/);
    assert.match(displacedBoundary,
        /directional_axis_scale = length\(\s*sdf_normal \* detail_contract\.axis_scale\)/);
    assert.match(displacedBoundary,
        /displacement_voxels > 0\.0 && sdf_normal\.y < 0\.0/);
    const deepCoreReturn = displacedBoundary.indexOf(
        "if (sdf_voxels <= -6.0) { return protected_core; }",
    );
    const conservativeReach = displacedBoundary.indexOf(
        "let maximum_axis_reach_voxels =",
    );
    const conservativeReject = displacedBoundary.indexOf(
        "sdf_voxels > maximum_axis_reach_voxels + 0.75",
    );
    const normalEvaluation = displacedBoundary.indexOf(
        "let sdf_normal = cloud_macro_sdf_normal",
    );
    const directionalReject = displacedBoundary.indexOf(
        "sdf_voxels > directional_reach_voxels + 0.75",
    );
    const shapeEvaluation = displacedBoundary.indexOf(
        "let shape_signal = cloud_exterior_shape_signal",
    );
    assert.ok(deepCoreReturn >= 0 && deepCoreReturn < conservativeReach);
    assert.ok(conservativeReach < conservativeReject);
    assert.ok(conservativeReject < normalEvaluation,
        "maximum-axis far reject must precede the six-tap SDF normal");
    assert.ok(normalEvaluation < directionalReject);
    assert.ok(directionalReject < shapeEvaluation,
        "directional far reject must precede procedural shape noise");
    assert.match(macroDensity, /cloud_morphology_evaluate_owner\(/);
    assert.match(macroDensity, /cloud_morphology_compose_density\(/);
    assert.doesNotMatch(macroDensity,
        /if \(macro_sample\.r <= 0\.0001\) \{ continue; \}/);
    assert.match(macroDensity, /density_union = 1\.0 - \(1\.0 - density_union\)/);
    assert.match(shaderSource, /struct CloudMacroSample/);
    assert.match(macroDensity, /extinction_density_sum \+= optical_strength/);
    assert.match(macroDensity, /secondary_optical_strength/);
    assert.match(macroDensity,
        /result\.extinction_coefficient = extinction_density_sum \/\s*max\(0\.0001, result\.density\)/);
    assert.match(shaderSource,
        /if \(macro_atlas\.matched_owner > 0\.5\) \{\s*return macro_atlas\.density/);
    assert.doesNotMatch(shaderSource, /if \(genus == 9 \|\| genus == 10\) \{\s*let macro_atlas = cloud_macro_atlas_sample/);

    const topologyDeformation = shaderSource.match(
        /fn deform_cloud_macro_coordinate[\s\S]*?\/\/ Authoritative cloud macro volumes/,
    )?.[0] ?? "";
    for (const mechanism of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
        assert.match(topologyDeformation,
            new RegExp(`formation_mechanism == ${mechanism}`));
    }
    assert.match(topologyDeformation,
        /formation_mechanism == 11 \|\| topology == 2/,
        "generic fragmentation must remain confined to boundary-layer or fragmented policies");
    assert.doesNotMatch(topologyDeformation, /topology == 7/,
        "irregular stochastic patches must not enter the generic fragmentation warp");
    assert.match(topologyDeformation, /system\.precipitation\.z \/ max\(2\.0, system\.kinematics\.x\)/);
    assert.match(topologyDeformation, /system\.organization_primary\.y/);
    assert.match(topologyDeformation, /system\.cap_and_shear\.y/);
    assert.match(topologyDeformation, /Lenticular packets remain phase-locked to terrain/);
    assert.match(topologyDeformation, /Horizontal-roll circulation twists the cross-section/);
    assert.doesNotMatch(topologyDeformation, /p\[0\]\.z/);

    assert.match(shaderSource, /fn cloud_local_material_query/);
    assert.match(shaderSource, /struct CloudLocalMaterial/);
    assert.match(shaderSource, /struct CloudDensityMaterialSample/);
    assert.match(shaderSource, /fn cloud_local_material_optics/);
    assert.match(shaderSource, /let local_material = cloud_sample\.material/);
    assert.match(shaderSource,
        /cloud_local_material_optics\(\s*local_material, sun_cosine\)/);
    assert.match(shaderSource,
        /primary\.phase \* primary_scattering \+\s*secondary\.phase \* secondary_scattering/);
    assert.match(shaderSource, /fn is_sheet_layer\(layer: Layer\)/);
    assert.match(shaderSource, /\(genus == 8 && species != 16\)/);

    assert.match(rendererSource, /loadCloudMacroAtlas\(\)/);
    assert.match(rendererSource, /uploadCloudMacroAtlas\(/);
    assert.match(rendererSource, /selectCloudMacroVolumeId\(\{/);
    assert.match(rendererSource,
        /deterministicVariant: system\.atlasDeterministicVariant/);
    assert.doesNotMatch(rendererSource,
        /deterministicVariant: system\.systemIndex/);
    assert.match(cloudExteriorContractWgslSource,
        /CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE: f32 = 0\.14893617/);
    assert.match(shaderSource,
        /volume_index == 2u \|\| volume_index == 32u \|\| volume_index == 33u/);
    assert.match(shaderSource,
        /vec3<f32>\(3\.0, CLOUD_EXTERIOR_PROTECTED_CU_BASE_ALTITUDE, 0\.0\)/);
    for (const mechanism of [
        "sheared-ice-sedimentation",
        "cellular-convective-colony",
        "frontal-ascent-sheet",
        "orographic-wave-condensation",
        "horizontal-roll-circulation",
        "boundary-layer-fragmentation",
    ]) {
        assert.match(cloudVolumeAtlasSource, new RegExp(`"${mechanism}"`));
    }
    assert.match(rendererSource, /CLOUD_MACRO_FORMATION_CODE/);
    assert.match(rendererSource, /createCloudMacroBindingData\(\s*cloudRuntime\.systems/);
    assert.match(rendererSource, /CLOUD_MACRO_BINDING_VEC4_STRIDE = 7/);
    assert.match(rendererSource, /volume\.statistics\.meanDensityPathVertical/);
    assert.match(rendererSource, /volume\.statistics\.meanDensityPathCrosswind/);
    assert.match(rendererSource, /volume\.statistics\.meanDensityPathDownwind/);
    assert.match(rendererSource,
        /!Number\.isFinite\(formationCode\)[\s\S]*?non-finite material ABI/);
    assert.match(rendererSource, /volume\.statistics\.p90DensityPathVertical/);
    assert.match(rendererSource, /addressModeW: "clamp-to-edge"/);
    const ownerResourceConsumers = [
        ["light-volume exact-owner compute", rendererSource.slice(
            rendererSource.indexOf("const cloudLightExactQueryGroup0"),
            rendererSource.indexOf("const cloudLightPhysicalGroup0"),
        )],
        ["directional coupling shadow", rendererSource.slice(
            rendererSource.indexOf("const couplingShadowBindGroup"),
            rendererSource.indexOf("const couplingPass"),
        )],
        ["view transport", rendererSource.slice(
            rendererSource.indexOf("const cloudBindGroup"),
            rendererSource.indexOf("const cloudLightViewBindGroup"),
        )],
    ];
    for (const binding of [16, 17, 18, 19, 20]) {
        for (const [consumer, source] of ownerResourceConsumers) {
            assert.match(source, new RegExp(`\\{ binding: ${binding},`),
                `binding ${binding} must be present in ${consumer}`);
        }
    }
});

test("Cc, Cs, and Ci camera/source density share atlas-R support and authored RGBA calibration", () => {
    const materialDensity = shaderSource.match(
        /fn cloud_macro_transport_material_density\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const directOwner = shaderSource.match(
        /fn cloud_macro_owner_sample\([\s\S]*?fn cloud_macro_atlas_sample_with_footprint/,
    )?.[0] ?? "";
    const couplingOwner = shaderSource.match(
        /fn cloud_coupling_filtered_macro_owner_sample\([\s\S]*?fn cloud_coupling_filtered_owner_extinction/,
    )?.[0] ?? "";
    const cameraOwnerUnion = shaderSource.match(
        /fn cloud_macro_atlas_sample_with_footprint\([\s\S]*?fn cloud_macro_atlas_sample_filtered/,
    )?.[0] ?? "";
    const ownerExtinction = shaderSource.match(
        /fn cloud_owner_extinction_coefficient_from_mass_extinction\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const authoredSample = shaderSource.match(
        /fn cloud_high_ice_authored_sample\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const spissatusMoment = shaderSource.match(
        /fn cloud_spissatus_authored_second_moment\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const spissatusResidualVariance = shaderSource.match(
        /fn cloud_spissatus_residual_density_variance\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const sourceSampling = shaderSource.match(
        /fn cloud_high_ice_source_sample\([\s\S]*?fn cloud_macro_sdf_voxels/,
    )?.[0] ?? "";

    assert.match(materialDensity,
        /if \(genus >= 1 && genus <= 3\) \{\s*return saturate\(macro_sample\.r\);/,
        "all high genera must bypass the liquid protected-core floor");
    assert.ok(
        materialDensity.indexOf("return saturate(macro_sample.r)") <
            materialDensity.indexOf("cloud_macro_protected_core_density("),
        "high-cloud atlas R must return before any protected-core floor");
    assert.match(directOwner,
        /let transport_material_density = cloud_macro_transport_material_density\([\s\S]*?else if \(genus >= 1 && genus <= 3\) \{[\s\S]*?result\.density = transport_material_density;/,
        "camera Cc/Cs/Ci must use the shared raw-R base density");
    assert.match(couplingOwner,
        /let material_density = cloud_macro_transport_material_density\([\s\S]*?cloud_morphology_cirrus_fibratus_subvoxel_density\([\s\S]*?material_density/,
        "source Cc/Cs/Ci must use the same raw-R base density");
    assert.doesNotMatch(couplingOwner,
        /cloud_macro_protected_core_density\(/,
        "directional coupling cannot floor every occupied high-cloud voxel");
    assert.match(directOwner,
        /camera_footprint_query[\s\S]*?high_ice_lateral_filter_radius_km[\s\S]*?high_ice_depth_filter_radius_km[\s\S]*?high_ice_ray_direction_owner_local[\s\S]*?cloud_high_ice_authored_sample\([\s\S]*?source_voxel_dimensions[\s\S]*?high_ice_lateral_filter_radius_km,[\s\S]*?high_ice_depth_filter_radius_km,[\s\S]*?high_ice_ray_direction_owner_local\)/,
        "camera must pass its physical lateral/depth footprint and ray to the shared authored RGBA ice evaluator");
    const cameraSourceBranch = directOwner.match(
        /if \(authored_source_allowed\) \{[\s\S]*?\n    \} else \{/,
    )?.[0] ?? "";
    assert.match(cameraSourceBranch,
        /if \(species == 3\) \{[\s\S]*?cloud_resolved_high_ice_material\([\s\S]*?authored\.density/,
        "camera Spissatus must resolve stable sub-voxel material inside the authored carrier");
    assert.match(cameraSourceBranch, /result\.density = resolved_authored\.x/);
    assert.match(cameraSourceBranch, /result\.detail = resolved_authored\.y/);
    assert.match(cameraSourceBranch,
        /cloud_spissatus_authored_second_moment\([\s\S]*?authored\.density,[\s\S]*?authored\.second_moment,[\s\S]*?result\.density/,
        "camera Spissatus must remap authored moments to the resolved local mean");
    assert.match(cameraSourceBranch,
        /cloud_spissatus_residual_density_variance\([\s\S]*?result\.density, authored\.coverage, sdf_voxels/,
        "camera Spissatus must carry the residual density variance into expected Beer");
    assert.doesNotMatch(cameraSourceBranch,
        /cloud_morphology_cirrus_fibratus_subvoxel_density/,
        "source-backed Spissatus cannot inherit the separate Fibratus reconstruction");
    assert.match(directOwner,
        /let authored_source_allowed = genus >= 1 && genus <= 3 &&\s*!\(species == 1 && formation_mechanism == 3\) &&\s*atlas_binding\.high_ice_source_scale\.w > 0\.5/,
        "camera source availability must exclude analytic fibratus and require the transform sentinel");
    assert.match(couplingOwner,
        /cloud_high_ice_authored_sample\([\s\S]*?source_voxel_dimensions[\s\S]*?coupling_filter_radius_km,[\s\S]*?depth_filter_radius_km[\s\S]*?ray_direction_owner_local/,
        "source transport must retain the same anisotropically filtered authored RGBA ice evaluator");
    const couplingSourceBranch = couplingOwner.match(
        /if \(authored_source_allowed\) \{[\s\S]*?\n    \} else \{/,
    )?.[0] ?? "";
    assert.match(couplingSourceBranch,
        /if \(species == 3\) \{[\s\S]*?cloud_resolved_high_ice_material\([\s\S]*?authored\.density/,
        "source Spissatus must sample the same stationary sub-voxel material");
    assert.match(couplingSourceBranch, /result\.density = resolved_authored\.x/);
    assert.match(couplingSourceBranch, /result\.detail = resolved_authored\.y/);
    assert.match(couplingSourceBranch,
        /cloud_spissatus_authored_second_moment\([\s\S]*?authored\.density,[\s\S]*?authored\.second_moment,[\s\S]*?result\.density/,
        "source Spissatus must use the same moment remap as the camera");
    assert.match(couplingSourceBranch,
        /cloud_spissatus_residual_density_variance\([\s\S]*?result\.density, authored\.coverage, sdf_voxels/,
        "source Spissatus must expose the same residual variance to expected Beer");
    assert.doesNotMatch(couplingSourceBranch,
        /cloud_morphology_cirrus_fibratus_subvoxel_density/,
        "source-backed coupling Spissatus cannot inherit the Fibratus reconstruction");
    assert.match(couplingOwner,
        /let authored_source_allowed = genus >= 1 && genus <= 3 &&\s*!\(species == 1 && formation_mechanism == 3\) &&\s*atlas_binding\.high_ice_source_scale\.w > 0\.5/,
        "coupling source availability must use the same fibratus exclusion and sentinel");
    assert.match(authoredSample,
        /let ray_length = length\(ray_direction_owner_local\)/,
        "authored correlation must project the ray in owner-local atlas axes");
    assert.match(spissatusMoment,
        /source_variance[\s\S]*?source_capacity[\s\S]*?mapped_variance[\s\S]*?mean \* \(1\.0 - mean\)/,
        "Spissatus moment remapping must preserve normalized authored occupancy variance");
    assert.match(spissatusResidualVariance,
        /contrast_capacity = min\(mean, 1\.0 - mean\)/,
        "procedural residual variance must collapse at both density bounds");
    assert.match(spissatusResidualVariance,
        /residual_rms = contrast_capacity \* 2\.0 \* local_amplitude \* 0\.22/,
        "procedural residual variance must derive from the resolved field calibration");
    assert.match(spissatusResidualVariance,
        /support_probability \* residual_rms \* residual_rms/,
        "conditional Spissatus residual energy must be converted to an unconditional source moment");
    assert.match(shaderSource, /var high_ice_owner_active = false/,
        "camera union must track whether any owner has authored source support");
    assert.match(shaderSource,
        /if \(high_ice_owner_active\) \{[\s\S]*?result\.high_ice_second_moment/,
        "non-high owners must leave camera m2/coverage at exact zero");
    assert.match(shaderSource, /high_ice_second_moment_clear_product/,
        "owner masks must retain P1/P2 union state for authored source");
    assert.match(cameraOwnerUnion, /component_second_moment_product/,
        "camera morphology must compose authored high-ice E2 with independent clear products");
    assert.match(cameraOwnerUnion, /sidecar_filter_weight/,
        "camera filter metadata must normalize by participating authored components");
    assert.match(shaderSource, /fn cloud_coupling_filtered_owner_extinction\([\s\S]*?component_second_moment_product/,
        "source morphology must compose authored high-ice E2 with independent clear products");
    assert.match(shaderSource, /fn cloud_coupling_filtered_owner_extinction\([\s\S]*?sidecar_filter_weight/,
        "source filter metadata must normalize by participating authored components");
    const maskedCoupling = shaderSource.match(
        /fn cloud_coupling_masked_extinction\([\s\S]*?fn cloud_coupling_mask_contains_resolved_high_ice/,
    )?.[0] ?? "";
    assert.match(maskedCoupling, /high_ice_second_moment_clear_product/,
        "overlapping source owners must use P1/P2 clear products");
    assert.match(maskedCoupling, /high_ice_support_clear_product/,
        "overlapping source owners must union authored support coverage");
    assert.match(ownerExtinction, /atlas_binding\.condensate_paths\.x/);
    assert.match(rendererSource, /volume\.statistics\.meanDensityPathVertical/);

    assert.match(shaderSource,
        /@group\(0\) @binding\(32\) var cloud_high_ice_source_atlas: texture_3d<f32>/,
        "the authored source is one guarded RGBA8-compatible texture binding");
    assert.match(shaderSource,
        /struct CloudMacroBinding \{[\s\S]*?high_ice_source_scale: vec4<f32>,[\s\S]*?high_ice_source_offset: vec4<f32>,/,
        "each owner must carry canonical source scale and offset metadata");
    assert.match(sourceSampling,
        /fn cloud_high_ice_source_sample\([\s\S]*?\) -> vec4<f32>[\s\S]*?cloud_high_ice_source_atlas, cloud_macro_sampler/,
        "fine source sampling must preserve R/G/B/A in the shared linear sampler");
    assert.match(sourceSampling,
        /fn cloud_high_ice_source_coarse_moment_sample\([\s\S]*?let dimensions = vec3<f32>\(textureDimensions\(cloud_high_ice_source_atlas\)\)/,
        "coarse source metadata must derive dimensions from the bound atlas");
    assert.match(sourceSampling,
        /let coarse_scale = atlas_binding\.high_ice_source_scale\.xyz \* \(94\.0 \/ 95\.0\)/);
    assert.match(sourceSampling,
        /let coarse_offset = atlas_binding\.high_ice_source_offset\.xyz \+\s*0\.5 \/ dimensions/);
    assert.match(sourceSampling,
        /return source\.bg;/,
        "coarse metadata must read B=E[rho^2] and G=coverage");
    assert.match(authoredSample,
        /let axial_voxel_km = max\(1e-5, sqrt\(dot\(\s*voxel_squared, ray_unit \* ray_unit\)\)\)/,
        "q must use the owner-local projected axial voxel size");
    assert.match(authoredSample,
        /let lateral_voxel_km = max\(1e-5, sqrt\(max\(\s*1e-10,\s*0\.5 \* dot\(voxel_squared,/,
        "q must use the owner-local projected lateral voxel RMS");
    assert.match(authoredSample,
        /let footprint_ratio = max\(\s*1\.0,[\s\S]*?2\.0 \* max\(0\.0, lateral_filter_radius_km\)[\s\S]*?lateral_voxel_km[\s\S]*?2\.0 \* max\(0\.0, depth_filter_radius_km\)[\s\S]*?axial_voxel_km/,
        "q must be based on the owner-local projected physical footprint");
    assert.match(authoredSample,
        /let restriction = clamp\(log2\(footprint_ratio\), 0\.0, 1\.0\);\s*resolved_fraction = 1\.0 - smoothstep\(0\.0, 1\.0, restriction\);/,
        "q must transition monotonically from fine support to coarse restriction");
    assert.match(authoredSample,
        /var resolved_fraction = 0\.0;\s*if \(lateral_filter_radius_km >= 0\.0\)/,
        "the negative lateral-radius sentinel must force the coarse endpoint");
    assert.match(authoredSample,
        /fine_density = select\(0\.0, clamp\(fine_source\.r, 0\.0, 1\.0\),\s*fine_source\.a > 1e-6\)/,
        "fine q support must be gated by authored alpha and use source R density");
    assert.match(authoredSample,
        /fine_coverage = select\(0\.0, 1\.0, fine_density > 1e-6\)/,
        "at q=1 positive fine density must carry unit support coverage");
    assert.match(authoredSample,
        /let unresolved_variance = max\([\s\S]*?coarse_second_moment - macro_density \* macro_density[\s\S]*?max\(0\.0, 1.0 - resolved_fraction \* resolved_fraction\)/,
        "unresolved variance must vanish at the fine q=1 endpoint");
    assert.match(authoredSample,
        /let coverage = clamp\(max\(\s*density,\s*mix\(coarse_coverage, fine_coverage, resolved_fraction\)\)/,
        "coverage must resolve to fine support at q=1 while retaining coarse metadata");
    assert.match(authoredSample,
        /result\.second_moment = clamp\(\s*density \* density \+ unresolved_variance,\s*density \* density,/,
        "q=1 must retain ordinary Beer with m2=density² rather than zeroing the field");
});

test("Ci fibratus uses one finite analytic fibre field in view and coupling density", () => {
    const descriptor = morphologyWgslSource.match(
        /fn cloud_morphology_build_fibratus_descriptor[\s\S]*?fn cloud_morphology_fibratus_descriptor_for/,
    )?.[0] ?? "";
    const reconstruction = morphologyWgslSource.match(
        /fn cloud_morphology_cirrus_fibratus_subvoxel_density[\s\S]*?fn cloud_morphology_curl_warp/,
    )?.[0] ?? "";
    const directOwner = shaderSource.match(
        /fn cloud_macro_owner_sample\([\s\S]*?fn cloud_macro_atlas_sample_with_footprint/,
    )?.[0] ?? "";
    const couplingOwner = shaderSource.match(
        /fn cloud_coupling_filtered_macro_owner_sample\([\s\S]*?fn cloud_coupling_filtered_owner_extinction/,
    )?.[0] ?? "";

    assert.match(reconstruction, /species != 1 \|\| formation_mechanism != 3/);
    assert.match(reconstruction, /if \(sdf_voxels >= 0\.0\) \{ return 0\.0; \}/);
    assert.match(reconstruction, /let area_preservation = saturate/);
    assert.match(descriptor, /let terminal_width_ratio = mix/);
    assert.match(descriptor, /let terminal_density_ratio = mix/);
    assert.match(descriptor, /let sedimentation_drop_km = depth_km \* mix/);
    assert.match(descriptor, /let differential_cross_slope/);
    assert.match(reconstruction,
        /let terminal_width_ratio = descriptor\.taper_lane\.y/);
    assert.match(reconstruction,
        /let terminal_density_ratio = descriptor\.taper_lane\.z/);
    assert.doesNotMatch(reconstruction,
        /\bp\[\d+\]|fwidth|textureSample|textureLoad|sin\(|cos\(|atan/);

    assert.match(directOwner, /parent_owner_index: u32/);
    assert.match(directOwner,
        /if \(species == 1 && formation_mechanism == 3\)/);
    assert.match(directOwner,
        /cloud_morphology_cirrus_fibratus_subvoxel_density\(/);
    assert.match(directOwner, /fibratus_filter_radius_km/);
    assert.match(directOwner, /fibratus_ray_step_length_km/);
    assert.match(directOwner, /fibratus_ray_direction_owner_local/);
    assert.ok(
        directOwner.indexOf("let fibratus_ray_direction_owner_local") >
            directOwner.indexOf("if (species == 1 && formation_mechanism == 3)"),
        "the owner-local camera ray transform is fibratus-only",
    );
    assert.ok(
        directOwner.indexOf("let fibratus_ray_direction_owner_local") >
            directOwner.indexOf("conservative_majorant <= 0.0001"),
        "support and majorant misses must precede the owner-local ray transform",
    );
    assert.ok(
        directOwner.indexOf(
            "cloud_morphology_cirrus_fibratus_subvoxel_density(",
        ) < directOwner.indexOf(
            "cloud_macro_displaced_boundary_density(",
        ),
        "fibratus must bypass generic exterior dilation",
    );
    assert.match(couplingOwner, /parent_owner_index: u32/);
    assert.match(couplingOwner,
        /let coupling_filter_radius_km = max/);
    assert.match(couplingOwner,
        /cloud_morphology_cirrus_fibratus_subvoxel_density\(/);
    assert.match(couplingOwner,
        /coupling_filter_radius_km,[\s\S]*?ray_step_length_km[\s\S]*?ray_direction_owner_local\)/);
    assert.match(couplingOwner,
        /cloud_high_ice_authored_sample\([\s\S]*?coupling_filter_radius_km,[\s\S]*?depth_filter_radius_km[\s\S]*?ray_direction_owner_local\)/,
        "directional visibility must resolve the same authored 3-D high-ice field across its physical lateral and axial footprint");
    assert.equal(
        (shaderSource.match(
            /cloud_morphology_cirrus_fibratus_subvoxel_density\(/g,
        ) ?? []).length,
        2,
        "camera/exact and directional coupling must share one reconstruction",
    );
    assert.match(shaderSource,
        /cloud_macro_owner_sample\([\s\S]*?u32\(slot\), fibratus_filter_radius_km/);
    assert.match(shaderSource,
        /cloud_coupling_filtered_macro_owner_sample\([\s\S]*?owner_index\)/);
});

test("formation code 6 preserves authoritative Sc circulation surfaces", () => {
    const deformation = shaderSource.match(
        /fn deform_cloud_macro_coordinate\([\s\S]*?\/\/ Authoritative cloud macro volumes/,
    )?.[0] ?? "";
    const code6 = deformation.match(
        /if \(formation_mechanism == 6\) \{[\s\S]*?\n    \}/,
    )?.[0] ?? "";
    const protectedCore = shaderSource.match(
        /fn cloud_macro_protected_core_density\([\s\S]*?\n\}/,
    )?.[0] ?? "";

    assert.match(code6, /low-frequency, divergence-like drift/);
    assert.match(code6, /noise2\(deformation_coordinate\)/);
    assert.match(code6, /let upper_coupling = upper_amount \* upper_amount/);
    assert.match(code6,
        /let organization_topology = i32\(round\([\s\S]*?organization_secondary\.z/);
    assert.match(code6,
        /let coverage = saturate\(system\.organization_secondary\.w\)/);
    assert.match(code6,
        /let closed_cell = organization_kind == 1 &&[\s\S]*?organization_topology == 1/);
    assert.match(code6, /smoothstep\(0\.50, 0\.90, coverage\)/);
    assert.doesNotMatch(code6, /wall_fraction|cycle_count|cellular_phase|sin\(|cos\(|mod\(|floor\(/,
        "code 6 cannot stamp a second periodic cellular lattice over the atlas");
    assert.match(protectedCore,
        /if \(formation_mechanism == 6\) \{[\s\S]*?return saturate\(macro_sample\.r\)/,
        "code 6 must preserve atlas density gradients and clear channels");
    assert.ok(
        protectedCore.indexOf("if (formation_mechanism == 6)") <
            protectedCore.indexOf("return saturate(max(macro_sample.r, core_floor))"),
        "Sc must bypass the generic opaque liquid core floor",
    );
});

test("cloud illumination is material- and optical-depth-owned", () => {
    assert.match(shaderSource, /CLOUD_OPTICS_WGSL/);
    assert.match(shaderSource, /fn cloud_optical_multiple_scattering\(/);
    assert.match(shaderSource,
        /cloud_passive_local_directional_multiple_scattering\(/);
    assert.match(opticsWgslSource,
        /fn cloud_unresolved_footprint_optical_depth\(/);
    assert.match(opticsWgslSource,
        /fn cloud_camera_footprint_extinction\(/);
    assert.match(shaderSource,
        /@group\(0\) @binding\(32\) var cloud_high_ice_source_atlas: texture_3d<f32>/);
    assert.match(shaderSource,
        /fn cloud_high_ice_source_sample\([\s\S]*?textureSampleLevel\(\s*cloud_high_ice_source_atlas, cloud_macro_sampler/,
        "high-ice source RGBA must use the same linear sampler as macro R");
    assert.match(shaderSource,
        /fn cloud_high_ice_source_coarse_moment_sample\([\s\S]*?textureSampleLevel\(\s*cloud_high_ice_source_atlas, cloud_macro_sampler/,
        "high-ice coarse B/G moments must come from the same source atlas");
    assert.match(opticsWgslSource,
        /fn cloud_high_ice_expected_beer_tau\(/);
    assert.match(opticsWgslSource,
        /unit_tau = tau \/ max\(vec3<f32>\(1e-5\), vec3<f32>\(mu\)\)/,
        "moment closure must not multiply an already density-weighted tau twice");
    const cameraMarch = shaderSource.match(
        /fn march_layer\([\s\S]*?\n\}\n\nstruct HydrometeorTransport/,
    )?.[0] ?? "";
    assert.match(cameraMarch,
        /cloud_camera_footprint_extinction\([\s\S]*?resolved_cloud_extinction \* step_length,[\s\S]*?step_length\)/,
        "camera Beer must consume the current resolved segment tau");
    const cameraBeerCalls = [...cameraMarch.matchAll(
        /cloud_camera_footprint_extinction\(([\s\S]*?)\);/g,
    )].map((match) => match[1]);
    assert.ok(cameraBeerCalls.length >= 1);
    for (const call of cameraBeerCalls) {
        assert.doesNotMatch(call,
            /diffuse_optical_depth\.(?:upper|lower)_rgb/,
            "diffuse owner/SDF tau cannot drive camera segment Beer");
    }
    assert.match(opticsWgslSource,
        /complete_tau - local_tau/,
        "external DSM shadow must not be reclassified as local collisions");
    assert.doesNotMatch(opticsWgslSource,
        /complete_tau - resolved_local_tau/,
        "homogeneous local depth cannot erase remote attenuation for porous ice");
    assert.match(opticsWgslSource,
        /effective_optical_depth = cloud_unresolved_footprint_optical_depth\([\s\S]*?albedo \* exp\(-effective_optical_depth\)/,
        "higher-order subtraction must use the same Beer-equivalent first order");
    const directionalSourceTau = shaderSource.match(
        /fn cloud_local_directional_source_optical_depth\([\s\S]*?fn cloud_bulk_direct_radiance/,
    )?.[0] ?? "";
    assert.match(directionalSourceTau,
        /cloud_owner_source_exit_path_km\(/);
    assert.match(directionalSourceTau,
        /let slant_tau = vertical_tau \/ max\(1e-4, abs\(source_direction\.y\)\)/);
    assert.match(directionalSourceTau,
        /let finite_owner_tau = local_extinction \* owner_exit_path/);
    assert.match(directionalSourceTau,
        /min\(slant_tau, finite_owner_tau\)/);
    const fallbackDiffuse = shaderSource.match(
        /fn cloud_fallback_diffuse_radiance\([\s\S]*?fn is_sheet_layer/,
    )?.[0] ?? "";
    assert.match(fallbackDiffuse,
        /upper_hemisphere_transmittance =\s*cloud_hemispheric_diffuse_transmittance_rgb/);
    assert.match(fallbackDiffuse,
        /lower_hemisphere_transmittance =\s*cloud_hemispheric_diffuse_transmittance_rgb/);
    assert.doesNotMatch(fallbackDiffuse,
        /atmosphere_first_order_transmittance[\s\S]*?exp\(-upper_tau\)/,
        "atmosphere first order must use the sparse-footprint Beer expectation");
    assert.match(shaderSource, /fn cloud_diffuse_scattering_transport\(/);
    assert.match(shaderSource, /cloud_passive_diffuse_scattering_transport\(/);
    assert.match(shaderSource, /cloud_passive_high_order_diffuse_transport\(/);
    assert.match(opticsWgslSource, /fn cloud_multiple_scattering_input\(/);
    assert.match(opticsWgslSource, /fn cloud_higher_order_scattering_budget\(/);
    assert.match(opticsWgslSource, /return albedo \* albedo \* \(1\.0 - direct_transfer\)/);
    assert.match(opticsWgslSource,
        /fn cloud_direct_single_scattering_radiance\(/);
    assert.match(opticsWgslSource,
        /fn cloud_propagated_diffuse_scattering_radiance\(/);
    assert.match(weatherProductionWgslSource,
        /fn weather_production_cloud_direct_radiance\(/);
    assert.match(shaderSource, /fn cloud_bulk_direct_radiance\(/);
    assert.match(shaderSource,
        /cloud_bulk_direct_radiance\([\s\S]*?sun_optics/);
    assert.match(opticsWgslSource, /struct CloudOpticalMoments/);
    assert.match(opticsWgslSource, /fn cloud_local_optical_moments\(/);
    assert.match(opticsWgslSource, /fn cloud_local_mass_extinction\(/);
    const ownerExtinction = shaderSource.match(
        /fn cloud_owner_extinction_coefficient[\s\S]*?\n\}/,
    )?.[0] ?? "";
    assert.match(ownerExtinction, /system\.optical_material\.x/);
    assert.match(ownerExtinction, /atlas_binding\.condensate_paths\.x/);
    assert.doesNotMatch(ownerExtinction, /condensate_paths\.[yzw]/);
    assert.doesNotMatch(shaderSource, /fn cloud_directional_condensate_path\(/);
    assert.doesNotMatch(shaderSource, /let canonical_rate = vec3<f32>\(/);
    assert.match(shaderSource, /fn cloud_extinction_coefficient_from_mass\(/);
    assert.match(shaderSource,
        /return cloud_extinction_coefficient_from_mass\(local_material, layer\)/);
    assert.doesNotMatch(shaderSource,
        /cloud_extinction_coefficient_at\(\s*point,\s*(?:direction|sun_direction|moon_direction)/);
    assert.match(shaderSource,
        /let segment_tau = cloud_extinction \* step_length/);
    assert.match(shaderSource,
        /let resolved_cloud_extinction = max\(vec3<f32>\(0\.0\),\s*density \* spectral_extinction_coefficient\)/);
    assert.match(shaderSource,
        /let cloud_step_transmittance = exp\(-cloud_extinction \* ds\)/);
    assert.doesNotMatch(shaderSource,
        /let segment_tau = density \* layer\.geometry\.w \* step_length/);
    assert.doesNotMatch(shaderSource, /fn powder_effect\(/);
    assert.doesNotMatch(shaderSource, /fn phase_function\(/);
    assert.doesNotMatch(shaderSource, /sun_visibility/);
    assert.doesNotMatch(shaderSource, /sun_surface_exposure/);
    assert.doesNotMatch(shaderSource, /let internal_shadow/);
    assert.doesNotMatch(shaderSource, /let twilight_fill/);
    assert.doesNotMatch(shaderSource, /let saturated_column_modulation/);
    assert.doesNotMatch(shaderSource, /var direct_scale/);
    assert.doesNotMatch(shaderSource, /var direct_energy_scale/);
    assert.doesNotMatch(shaderSource, /var diffuse_scale/);
    assert.doesNotMatch(shaderSource, /var sheet_source/);
    assert.doesNotMatch(shaderSource, /var ambient_source_scale/);
    assert.doesNotMatch(shaderSource, /fn cloud_material_response\(/);
});

test("finite high-ice camera packets use bounded positive GL2 subsegments", () => {
    const cameraMarch = shaderSource.match(
        /fn march_layer\([\s\S]*?\n\}\n\nstruct HydrometeorTransport/,
    )?.[0] ?? "";
    assert.match(cameraMarch,
        /high_ice_camera_packet = finite_owner_mode &&\s*genus >= 1 && genus <= 3/);
    assert.match(cameraMarch,
        /camera_subnode < CLOUD_CAMERA_HIGH_ICE_GL2_SUBNODE_COUNT/);
    assert.match(cameraMarch,
        /CLOUD_CAMERA_HIGH_ICE_GL2_NODE[\s\S]*?0\.5 \* parent_step_length/);
    assert.match(cameraMarch,
        /step_length = select\([\s\S]*?0\.5 \* parent_step_length[\s\S]*?high_ice_camera_packet/);
    assert.match(cameraMarch,
        /cloud_density_material_sample_camera(?:_active)?\([\s\S]*?step_length, direction\)/);
    assert.match(shaderSource,
        /high_ice_depth_filter_radius_km[\s\S]*?CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR/);
    assert.match(opticsWgslSource,
        /CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR[\s\S]*?\$\{CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR\}/,
        "the CPU/WGSL ABI must document sigma_depth = ds/sqrt(12)");
    assert.match(opticsRuntimeSource,
        /CLOUD_CAMERA_HIGH_ICE_DEPTH_SIGMA_FACTOR = 1 \/ Math\.sqrt\(12\)/);
});

test("resolved families use cheap moisture envelopes and complete neighbour searches", () => {
    assert.match(shaderSource, /fn cloud_system_moisture/);
    assert.match(shaderSource, /family generators below create the actual visible boundary/);
    assert.match(shaderSource, /for \(var cell_y = -1; cell_y <= 1; cell_y\+\+\)/);
    assert.match(shaderSource, /for \(var cell_x = -1; cell_x <= 1; cell_x\+\+\)/);
    assert.match(shaderSource, /complete Moore neighbourhood/);
});

test("cloud morphology uses genus-specific physical spatial scales", () => {
    assert.match(rendererSource, /const CLOUD_SPATIAL_SCALES/);
    assert.match(rendererSource, /cumulus: \[8\.5, 20, 0\.3\]/);
    assert.match(rendererSource, /stratus: \[0\.7, 2\.0, 0\.1\]/);
    assert.match(rendererSource, /cirrus: \[6, 18, 0\.16\]/);
    assert.match(rendererSource, /cumulonimbus: \[5, 18, 0\.14\]/);
    assert.doesNotMatch(rendererSource, /const levelScale = index === 2/);
});

test("cloud density uses the calibrated projected-coverage statistic", () => {
    assert.match(shaderSource, /coverage_threshold = mix\(0\.8, 0\.3, pow\(coverage, 0\.9\)\)/);
    assert.match(shaderSource, /weather_density = smoothstep/);
    assert.match(shaderSource, /organization_strength/);
    assert.match(shaderSource, /texture_2d_array<f32>/);
    assert.match(rendererSource, /createCorrelatedWeatherFields/);
    assert.match(rendererSource, /createConservativeWeatherMips/);
    assert.match(rendererSource, /mipLevelCount: weatherMipChains\[0\]\.length/);
});

test("screen-space interval prepass supplies conservative per-layer shell bounds", () => {
    assert.match(shaderSource, /WEBGPU_CLOUD_INTERVAL_SHADER/);
    assert.match(shaderSource, /cloud_interval_fragment/);
    assert.match(shaderSource, /cloud_interval_low_middle/);
    assert.match(rendererSource, /cloudIntervalPipeline/);
    assert.match(
        rendererSource,
        /intervalNanoseconds \+ lightingNanoseconds \+ transportNanoseconds/,
    );
    assert.match(shaderSource, /return vec4<f32>\(near, far, 1\.0, 1\.0\)/);
    assert.match(shaderSource, /let far = min\(outer\.y, FAR_LIMIT\)/);
    assert.doesNotMatch(shaderSource, /let distance_limit/);
});

test("stratiform transport integrates local owner extinction at quadrature nodes", () => {
    const sourceStart = shaderSource.indexOf("fn sheet_node_source_radiance(");
    const marchStart = shaderSource.indexOf("fn march_sheet_layer(", sourceStart);
    const marchEnd = shaderSource.indexOf("fn march_layer(", marchStart);
    const nodeSource = shaderSource.slice(sourceStart, marchStart);
    const sheetMarch = shaderSource.slice(marchStart, marchEnd);
    assert.match(sheetMarch, /Twelve-point Gauss-Legendre quadrature/);
    assert.match(sheetMarch, /let nodes = array<f32, 12>\(/);
    assert.match(sheetMarch, /let weights = array<f32, 12>\(/);
    assert.match(sheetMarch,
        /let camera_to_shell_air = cloud_background_atmosphere_segment\(\s*origin, direction, 0\.0, near\);[\s\S]*?var combined_transport = camera_to_shell_air;[\s\S]*?var clear_transport = camera_to_shell_air/);
    assert.match(sheetMarch,
        /let cloud_sample = cloud_density_material_sample\(point, layer, index\)/);
    assert.match(sheetMarch, /let density = cloud_sample\.density/);
    assert.match(sheetMarch, /let local_material = cloud_sample\.material/);
    assert.doesNotMatch(sheetMarch, /cloud_local_material_query\(/);
    assert.match(sheetMarch,
        /cloud_spectral_extinction_coefficient_from_material\(\s*local_material, layer\)/);
    assert.match(sheetMarch, /let ds = weights\[sample\] \* path_length/);
    assert.match(sheetMarch,
        /cloud_extinction = max\(\s*vec3<f32>\(0\.0\), density \* spectral_extinction_coefficient\)/);
    assert.match(sheetMarch,
        /let source_radiance = sheet_node_source_radiance\([\s\S]*?point,[\s\S]*?local_material,[\s\S]*?spectral_extinction_coefficient,[\s\S]*?&directional_sky_cache,[\s\S]*?&directional_sky_cache_valid\)/);
    assert.match(sheetMarch,
        /cloud_source_coefficient = cloud_extinction \*[\s\S]*?source_radiance/);
    assert.match(sheetMarch,
        /let combined_source_coefficient = max\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km \+[\s\S]*?cloud_source_coefficient[\s\S]*?let combined_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.extinction_rgb_per_km \+ cloud_extinction[\s\S]*?combined_source_coefficient/);
    assert.match(sheetMarch,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km/);
    assert.doesNotMatch(sheetMarch,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.unshadowed_source_radiance_coefficient_rgb_per_km/);
    assert.match(sheetMarch,
        /let cloud_step_transmittance = exp\(-cloud_extinction \* ds\)/);
    assert.match(sheetMarch,
        /let local_cloud_source = cloud_source_share_of_combined_segment\([\s\S]*?cloud_source_radiance \+=[\s\S]*?let visible_removal = combined_transport\.transmittance \* removed;[\s\S]*?combined_transport = compose_camera_transport\([\s\S]*?clear_transport = compose_camera_transport\([\s\S]*?cloud_transmittance \*= cloud_step_transmittance/);
    assert.match(sheetMarch,
        /let exact_shared_air = cloud_background_atmosphere_segment\(\s*origin, direction, 0\.0, far\);[\s\S]*?cloud_relative_transport_from_air_moment\(\s*cloud_source_radiance, exact_shared_air,[\s\S]*?cloud_transmittance\)/);
    assert.match(sheetMarch,
        /result\.velocity = layer\.motion\.xy;[\s\S]*?result\.layer_identifier = f32\(index\);[\s\S]*?result\.evaluated_steps = 12\.0/);
    assert.match(sheetMarch,
        /weighted_depth \+= travelled \* contribution;[\s\S]*?depth_weight \+= contribution/);
    assert.doesNotMatch(sheetMarch,
        /representative_(?:point|strength|density)|extinction_integral|scalar_strength/);
    assert.doesNotMatch(sheetMarch,
        /density_integral \* extinction_coefficient \* path_length/);
    const sheetResolve = sheetMarch.slice(
        sheetMarch.indexOf("    let mean_depth = select("),
    );
    assert.doesNotMatch(sheetResolve,
        /radiance\s*(?:\*=|\+=|=\s*mix)|noise|tint/);

    assert.match(nodeSource,
        /physical_source_irradiance_at\(0u, point\)/);
    assert.match(nodeSource,
        /physical_source_irradiance_at\(1u, point\)/);
    assert.match(nodeSource,
        /cloud_camera_source_transmittance\(point, 0u\)/);
    assert.match(nodeSource,
        /cloud_camera_source_transmittance\(point, 1u\)/);
    assert.doesNotMatch(nodeSource,
        /same_layer_light_tau|cloud_lv_sample_layer_direct_transmittance|residual_light_tau/);
    assert.match(nodeSource,
        /cloud_sample_directional_sky_band_cache\([\s\S]*?sun_optics\.asymmetry/);
    assert.match(nodeSource,
        /physical_diffuse_irradiance_at\(point\)/);
    assert.match(nodeSource,
        /physical_lower_atmosphere_irradiance_at\(point\)/);
    assert.match(nodeSource,
        /physical_ground_irradiance_at\(point\)/);
    assert.match(nodeSource,
        /cloud_fallback_diffuse_radiance\(\s*sun_optics,[\s\S]*?directional_atmosphere_phase_integral,[\s\S]*?incident_sky,[\s\S]*?lower_atmosphere,[\s\S]*?ground_irradiance,[\s\S]*?sky_tau,[\s\S]*?ground_tau\)/);
    const sheetCommonSource = nodeSource.slice(
        nodeSource.indexOf("let source_sun_transmittance"),
        nodeSource.indexOf("let light_volume_direct_sun"),
    );
    const sheetResident = nodeSource.slice(
        nodeSource.indexOf("let light_volume_direct_sun"),
        nodeSource.indexOf("var analytic_diffuse_radiance"),
    );
    assert.match(sheetCommonSource,
        /cloud_bulk_direct_radiance\([\s\S]*?sun_optics/);
    assert.match(sheetCommonSource,
        /cloud_bulk_direct_radiance\([\s\S]*?moon_optics/);
    assert.doesNotMatch(sheetCommonSource,
        /weather_production_cloud_direct_radiance/);
    assert.match(sheetResident,
        /cloud_propagated_diffuse_scattering_radiance\(/);
    assert.doesNotMatch(sheetResident,
        /physical_diffuse_irradiance_at|physical_lower_atmosphere_irradiance_at|physical_ground_irradiance_at/);
    assert.match(nodeSource,
        /direct_radiance \+ mix\([\s\S]*?analytic_diffuse_radiance,[\s\S]*?light_volume_p1,[\s\S]*?higher_order_blend_confidence/);
    assert.doesNotMatch(nodeSource,
        /mix\([\s\S]{0,80}?source_sun_direct[\s\S]{0,80}?light_volume_confidence/);
});

test("production cloud layers co-integrate air and condensate as one relative operator", () => {
    const atmosphereStart = cloudShaderSource.indexOf(
        "fn cloud_coupled_atmosphere_direct_source(");
    const atmosphereEnd = cloudShaderSource.indexOf(
        "fn camera_transport_removed_luminance(", atmosphereStart);
    const atmosphere = cloudShaderSource.slice(atmosphereStart, atmosphereEnd);
    const marchStart = cloudShaderSource.indexOf("fn march_layer(");
    const marchEnd = cloudShaderSource.indexOf(
        "struct HydrometeorTransport", marchStart);
    const march = cloudShaderSource.slice(marchStart, marchEnd);
    const sanitizerStart = cloudShaderSource.indexOf(
        "fn sanitize_layer_transport(");
    const packetStart = cloudShaderSource.indexOf(
        "fn production_layer_packet(", sanitizerStart);
    const packetEnd = cloudShaderSource.indexOf(
        "fn layer_packet_precedes(", packetStart);
    const sanitizer = cloudShaderSource.slice(sanitizerStart, packetStart);
    const packet = cloudShaderSource.slice(packetStart, packetEnd);

    assert.ok(atmosphereStart >= 0 && atmosphereEnd > atmosphereStart);
    assert.match(atmosphere,
        /fn cloud_coupled_atmosphere_source_sample\(/);
    assert.match(atmosphere,
        /coupling_cloud_source_aerial_transmittance_at\(point, source_index\)/,
        "air co-integrated with cloud transport must use one uniform cascade band-limit");
    assert.match(cloudShaderSource,
        /fn cloud_camera_source_transmittance\([\s\S]*?coupling_cloud_source_transmittance_at\(/,
        "direct cloud illumination must retain the full spatial cascade path");
    assert.match(atmosphere,
        /fn cloud_background_atmosphere_segment\([\s\S]*?cloud_shadowed_atmosphere_segment_transport\([\s\S]*?segment\.radiance, segment\.transmittance/);
    assert.doesNotMatch(atmosphere,
        /mean_extinction|mean_removed_source|array<f32, 4>/,
        "cloud clear prefixes/gaps/tails must not retain the old mean-coefficient path");
    assert.equal((shaderSource.match(
        /\$\{CLOUD_SHADOWED_ATMOSPHERE_TRANSPORT_WGSL\}/g) ?? []).length, 2,
    "the atmosphere and cloud modules must embed the same shared operator source");
    assert.match(shadowedAtmosphereWgslSource,
        /fn cloud_shadowed_atmosphere_segment_transport\(/);
    assert.match(cloudShaderSource,
        /fn cloud_relative_transport_from_air_moment\([\s\S]*?let k = clamp\(select\(q, proxy_k,[\s\S]*?\), q, vec3<f32>\(1\.0\)\)[\s\S]*?\(k - q\) \* exact_shared_air\.radiance/,
        "the exact air correction must obey Q <= K <= 1");
    assert.match(cloudShaderSource,
        /fn cloud_source_share_of_combined_segment\([\s\S]*?combined_segment\.radiance \* source_share/,
        "cloud source must retain the combined-medium Beer denominator");

    assert.match(march,
        /let camera_to_shell_air = cloud_background_atmosphere_segment\(\s*origin, direction, 0\.0, near\)/);
    assert.match(march, /var combined_transport = camera_to_shell_air/);
    assert.match(march, /var clear_transport = camera_to_shell_air/);
    assert.match(march, /var cloud_transmittance = vec3<f32>\(1\.0\)/);
    assert.match(march,
        /let cloud_source_coefficient = cloud_extinction \* max\([\s\S]*?let combined_source_coefficient = max\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km \+[\s\S]*?cloud_source_coefficient[\s\S]*?let combined_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.extinction_rgb_per_km \+ cloud_extinction[\s\S]*?combined_source_coefficient/);
    assert.match(march,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km/);
    assert.doesNotMatch(march,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.unshadowed_source_radiance_coefficient_rgb_per_km/);
    assert.match(march,
        /let clear_gap = cloud_background_atmosphere_segment\([\s\S]*?combined_transport = compose_camera_transport\([\s\S]*?combined_transport, clear_gap[\s\S]*?clear_transport = compose_camera_transport\([\s\S]*?clear_transport, clear_gap/);
    assert.match(march,
        /let clear_tail = cloud_background_atmosphere_segment\([\s\S]*?combined_transport, clear_tail[\s\S]*?clear_transport, clear_tail/);
    assert.match(march,
        /let exact_shared_air = cloud_background_atmosphere_segment\(\s*origin, direction, 0\.0, far\);[\s\S]*?let relative_transport = cloud_relative_transport_from_air_moment\(\s*cloud_source_radiance, exact_shared_air,[\s\S]*?cloud_transmittance\)/);
    assert.match(march, /result\.transport = relative_transport/);
    assert.match(march,
        /let local_cloud_source = cloud_source_share_of_combined_segment\([\s\S]*?cloud_source_radiance \+=/);
    assert.match(march,
        /let cloud_midpoint_transmittance =[\s\S]*?cloud_transmittance \* sqrt\(segment_t\)[\s\S]*?cloud_weighted_air_proxy \+=/);
    assert.match(march,
        /This is a density miss inside a conservative occupied owner[\s\S]*?let clear_gap = integrate_camera_transport_coefficients\(/);
    assert.doesNotMatch(march,
        /This is a density miss inside a conservative occupied owner[\s\S]{0,500}?cloud_background_atmosphere_segment\(/,
        "density-miss microstrata must not dispatch adaptive atmosphere quadrature");

    assert.match(packet, /let marched = march_layer\(/);
    assert.doesNotMatch(packet, /finite_atmosphere_to_sample/);
    assert.doesNotMatch(packet, /camera_transport_through_foreground_air/);
    assert.match(sanitizer,
        /if \(finite_rgb\(transport\.radiance\)\) \{ radiance = transport\.radiance; \}/);
    assert.doesNotMatch(sanitizer,
        /radiance = max\(vec3<f32>\(0\.0\), transport\.radiance\)/);
});

test("resident and fallback cloud sources partition direct and hemispheric paths once", () => {
    const marchStart = shaderSource.indexOf("fn march_layer(");
    const marchEnd = shaderSource.indexOf("struct HydrometeorTransport", marchStart);
    const march = shaderSource.slice(marchStart, marchEnd);
    const residentStart = march.indexOf("if (light_volume_confidence > 0.0001)");
    const fallbackStart = march.indexOf(
        "if (strict_radiometric_agreement ||", residentStart);
    const blendStart = march.indexOf(
        "var higher_order_blend_confidence", fallbackStart);
    assert.ok(residentStart >= 0 && fallbackStart > residentStart &&
        blendStart > fallbackStart);
    const resident = march.slice(residentStart, fallbackStart);
    const fallback = march.slice(fallbackStart, blendStart);
    const commonSource = march.slice(
        march.lastIndexOf("let source_sun_transmittance", residentStart),
        residentStart);

    // Direct first order is complete in the cumulative RGB atlas before either
    // higher-order closure is selected. No camera sample retraces owners.
    assert.match(commonSource,
        /cloud_camera_source_transmittance\(point, 0u\)/);
    assert.match(commonSource,
        /cloud_camera_source_transmittance\(point, 1u\)/);
    assert.match(commonSource,
        /cloud_bulk_direct_radiance\([\s\S]*?source_sun_transmittance/);
    assert.match(commonSource,
        /cloud_bulk_direct_radiance\([\s\S]*?source_moon_transmittance/);
    assert.doesNotMatch(commonSource,
        /same_layer_light_tau|cloud_lv_sample_layer_direct_transmittance|weather_production_cloud_direct_radiance/);

    // Resident source: one propagated P1 field. Common direct light is added
    // outside the closure crossfade so residency cannot alter first order.
    // P1 boundaries already contain sky/ground and its volume source already
    // contains direct energy removed into higher orders.
    assert.match(resident,
        /cloud_propagated_diffuse_scattering_radiance\(\s*sun_optics, p1_incident\)/);
    assert.match(march,
        /cloud_local_sdf_diffuse_optical_depth\([\s\S]*?cloud_p1_diffusion_validity\([\s\S]*?diffuse_optical_depth\.upper_rgb \+[\s\S]*?diffuse_optical_depth\.lower_rgb/);
    assert.match(march,
        /let light_volume_confidence = min\([\s\S]*?\*\s*local_diffusion_validity/);
    assert.doesNotMatch(resident,
        /source_sun_direct \+ source_moon_direct/);
    assert.doesNotMatch(resident,
        /weather_production_cloud_direct_radiance/);
    assert.doesNotMatch(resident,
        /physical_diffuse_irradiance_at|physical_lower_atmosphere_irradiance_at|physical_ground_irradiance_at|cloud_optical_multiple_scattering/);
    assert.match(resident,
        /!finite_rgb\(light_volume_p1\)[\s\S]*?resolved_light_volume_confidence = 0\.0/);

    // Fallback source: exact direct first order plus a disjoint diffuse
    // partition. The full-sphere atmosphere phase integral owns atmospheric
    // first order; upper/lower atmosphere own only higher orders; separately
    // resolved ground reflection owns its complete first+higher closure.
    assert.doesNotMatch(fallback,
        /weather_production_cloud_direct_radiance|cloud_bulk_direct_radiance/);
    assert.match(fallback, /cloud_optical_multiple_scattering\(/);
    assert.match(fallback, /cloud_local_directional_source_optical_depth\(/);
    assert.match(fallback, /cloud_sample_directional_sky_band_cache\(/);
    assert.match(fallback, /sun_optics\.asymmetry/);
    assert.match(fallback, /physical_diffuse_irradiance_at\(point\)/);
    assert.match(fallback, /physical_lower_atmosphere_irradiance_at\(point\)/);
    assert.match(fallback, /physical_ground_irradiance_at\(point\)/);
    assert.match(fallback,
        /cloud_fallback_diffuse_radiance\(\s*sun_optics,[\s\S]*?directional_atmosphere_phase_integral,[\s\S]*?incident_sky,[\s\S]*?lower_atmosphere,[\s\S]*?ground,[\s\S]*?sky_tau,[\s\S]*?ground_tau\)/);
    assert.match(march.slice(blendStart),
        /cloud_higher_order_agreement_weight\([\s\S]*?direct_radiance \+ mix\([\s\S]*?analytic_diffuse_radiance,[\s\S]*?light_volume_p1,[\s\S]*?higher_order_blend_confidence/);

    const fallbackDiffuseStart = shaderSource.indexOf(
        "fn cloud_fallback_diffuse_radiance(");
    const fallbackDiffuseEnd = shaderSource.indexOf(
        "fn is_sheet_layer(", fallbackDiffuseStart);
    const fallbackDiffuse = shaderSource.slice(
        fallbackDiffuseStart, fallbackDiffuseEnd);
    assert.match(fallbackDiffuse,
        /directional_atmosphere_phase_integral[\s\S]*?atmosphere_first_order_transmittance/);
    assert.match(fallbackDiffuse,
        /upper_atmosphere_mean_radiance[\s\S]*?cloud_passive_high_order_hemispheric_diffuse_transport_rgb\(\s*local, upper_tau\)/);
    assert.match(fallbackDiffuse,
        /lower_atmosphere_mean_radiance[\s\S]*?cloud_passive_high_order_hemispheric_diffuse_transport_rgb\(\s*local, lower_tau\)/);
    assert.match(fallbackDiffuse,
        /ground_mean_radiance[\s\S]*?cloud_passive_hemispheric_diffuse_scattering_transport_rgb\(\s*local, lower_tau\)/);
    assert.match(fallbackDiffuse,
        /upper_atmosphere \* upper_hemisphere_transmittance[\s\S]*?lower_atmosphere \* lower_hemisphere_transmittance/);
    assert.doesNotMatch(fallbackDiffuse,
        /\(lower_atmosphere_mean_radiance \+ ground_mean_radiance\)/);

    const blend = march.slice(blendStart, blendStart + 900);
    assert.match(blend,
        /direct_radiance \+ mix\(\s*analytic_diffuse_radiance,\s*light_volume_p1,\s*higher_order_blend_confidence\)/);
    assert.doesNotMatch(blend,
        /mix\([\s\S]{0,80}?source_sun_direct[\s\S]{0,80}?light_volume_confidence/);
});

test("directional sky fallback uses a bounded continuous altitude and material cache", () => {
    const cacheStart = cloudShaderSource.indexOf(
        "struct CloudDirectionalSkyPhaseAnchors");
    const cacheEnd = cloudShaderSource.indexOf(
        "fn cloud_fallback_diffuse_radiance(", cacheStart);
    const cache = cloudShaderSource.slice(cacheStart, cacheEnd);
    const sheetStart = cloudShaderSource.indexOf(
        "fn sheet_node_source_radiance(");
    const sheetEnd = cloudShaderSource.indexOf(
        "fn march_sheet_layer(", sheetStart);
    const sheet = cloudShaderSource.slice(sheetStart, sheetEnd);
    const marchStart = cloudShaderSource.indexOf("fn march_layer(");
    const marchEnd = cloudShaderSource.indexOf(
        "struct HydrometeorTransport", marchStart);
    const march = cloudShaderSource.slice(marchStart, marchEnd);

    assert.ok(cacheStart >= 0 && cacheEnd > cacheStart);
    assert.match(cache, /const CLOUD_DIRECTIONAL_SKY_G_LOW/);
    assert.match(cache, /const CLOUD_DIRECTIONAL_SKY_G_MIDDLE/);
    assert.match(cache, /const CLOUD_DIRECTIONAL_SKY_G_HIGH/);
    const anchorStart = cache.indexOf("fn cloud_directional_sky_phase_anchors(");
    const anchorEnd = cache.indexOf(
        "fn cloud_mix_directional_sky_phase_anchors(", anchorStart);
    const anchors = cache.slice(anchorStart, anchorEnd);
    assert.match(anchors,
        /for \(var lobe_index = 0u; lobe_index < COUPLING_ACTIVE_LOBE_COUNT/);
    assert.equal((anchors.match(/coupling_profile_lobe\(/g) ?? []).length, 1,
        "all three material anchors must share one 17-lobe traversal");
    assert.match(anchors, /result\.low_g \+=/);
    assert.match(anchors, /result\.middle_g \+=/);
    assert.match(anchors, /result\.high_g \+=/);

    const bandStart = cache.indexOf("fn cloud_directional_sky_band_cache(");
    const bandEnd = cache.indexOf(
        "fn cloud_directional_sky_material_phase(", bandStart);
    const bands = cache.slice(bandStart, bandEnd);
    assert.match(bands,
        /let lower = cloud_directional_sky_phase_anchors\(\s*lower_altitude/);
    assert.match(bands,
        /let upper = cloud_directional_sky_phase_anchors\(\s*upper_altitude/);
    assert.match(bands,
        /if \(layer\.geometry\.y > 3\.5 \|\| genus == 9 \|\| genus == 10\) \{[\s\S]*?middle = cloud_directional_sky_phase_anchors/);
    assert.match(cache,
        /let low_to_middle = mix\([\s\S]*?let middle_to_high = mix\(/);
    assert.match(cache,
        /return max\(vec3<f32>\(0\.0\), select\(/);
    assert.match(cache,
        /let altitude_anchors = cloud_mix_directional_sky_phase_anchors\(/);

    for (const lightingPath of [sheet, march]) {
        assert.match(lightingPath, /cloud_directional_sky_band_cache\(/);
        assert.match(lightingPath,
            /cloud_sample_directional_sky_band_cache\([\s\S]*?sun_optics\.asymmetry/);
        assert.doesNotMatch(lightingPath, /coupling_profile_phase_integral\(/);
        assert.match(lightingPath, /physical_diffuse_irradiance_at\(point\)/);
        assert.match(lightingPath,
            /physical_lower_atmosphere_irradiance_at\(point\)/);
        assert.match(lightingPath, /physical_ground_irradiance_at\(point\)/);
    }
    assert.match(sheet,
        /directional_sky_cache: ptr<function, CloudDirectionalSkyBandCache>/);
    assert.match(sheet,
        /if \(!\(\*directional_sky_cache_valid\)\) \{[\s\S]*?\*directional_sky_cache_valid = true/);
    assert.match(march,
        /if \(!directional_sky_cache_valid\) \{[\s\S]*?directional_sky_cache_valid = true/);
    assert.doesNotMatch(march,
        /directional_sky_(?:incident|resolved)/);
    for (const lightingPath of [sheet, march]) {
        assert.match(lightingPath,
            /cloud_local_sdf_diffuse_optical_depth\(\s*point, density, spectral_extinction_coefficient,\s*local_material, layer\)/);
        assert.match(lightingPath,
            /let sky_tau = diffuse_optical_depth\.upper_rgb/);
        assert.match(lightingPath,
            /let ground_tau = diffuse_optical_depth\.lower_rgb/);
        assert.doesNotMatch(lightingPath,
            /upper_probe_distance|lower_probe_distance|local_sigma_y/);
    }
    assert.match(shaderSource,
        /upper_path_extinction_sum[\s\S]*?lower_path_extinction_sum/);
    assert.match(shaderSource,
        /owner_height_fraction[\s\S]*?density_response[\s\S]*?local_reach_km/);
    assert.match(shaderSource,
        /encoded_sdf_reach_voxels = min\(\s*47\.0, max\(1\.0, cloud_macro_bindings\.header\.w\)\)[\s\S]*?reach_cap_km =\s*owner_voxel_km \* encoded_sdf_reach_voxels/);
    const localDiffuseStart = cache.indexOf(
        "fn cloud_local_sdf_diffuse_optical_depth(");
    const localDiffuseEnd = cache.indexOf(
        "fn cloud_camera_source_transmittance(", localDiffuseStart);
    const localDiffuse = cache.slice(localDiffuseStart, localDiffuseEnd);
    assert.match(localDiffuse, /local_material\.local_upper_path_km/);
    assert.match(localDiffuse, /local_material\.local_lower_path_km/);
    assert.doesNotMatch(localDiffuse,
        /texture(?:Sample|Load)|cloud_morphology|cloud_integrate|for \(/);
    assert.doesNotMatch(shaderSource,
        /cloud_fallback_diffuse_ray_optical_depth|cloud_fallback_diffuse_hemisphere_optical_depth/);
});

test("aggregate optical material preserves the mass-extinction unit contract", () => {
    assert.match(opticsWgslSource,
        /mass extinction RGB \(m²\/kg\)/);
    assert.match(shaderSource,
        /mass_density_calibration_sum\s*\+=\s*calibration/);
    assert.match(shaderSource,
        /effective_mass_extinction\s*=\s*[\s\S]*?spectral_extinction_density_sum\s*\/[\s\S]*?mass_density_calibration_sum/);
    const materialOpticsStart = shaderSource.indexOf(
        "fn cloud_local_material_optics(");
    const materialOpticsEnd = shaderSource.indexOf(
        "fn tangent_point_at_altitude(", materialOpticsStart);
    const materialOptics = shaderSource.slice(
        materialOpticsStart, materialOpticsEnd);
    assert.match(materialOptics,
        /result\.mass_extinction\s*=\s*max\([\s\S]*?local_material\.effective_mass_extinction/);
    assert.doesNotMatch(materialOptics,
        /result\.mass_extinction\s*=\s*max\([\s\S]*?local_material\.spectral_extinction_coefficient/);
});

test("production composition generates genus-specific world-space cloud populations", () => {
    assert.match(shaderSource, /fn cloud_composition_uv/);
    assert.match(shaderSource, /fn cloud_composition_mask/);
    assert.match(shaderSource, /mode == 0 \|\| mode == 3/);
    assert.match(shaderSource, /fn cloud_population_blob/);
    assert.match(shaderSource, /fn cloud_system_population/);
    assert.doesNotMatch(shaderSource, /fn weather_bank_field/);
    assert.doesNotMatch(shaderSource, /fn weather_system_field/);
    assert.match(shaderSource, /fn cloud_editorial_population/);
    assert.match(shaderSource, /transition_km/);
    assert.match(shaderSource, /boundary_style == 0/);
    assert.match(shaderSource, /boundary_style == 1/);
    assert.match(shaderSource, /boundary_style == 2/);
    assert.match(shaderSource, /boundary_style == 3/);
    assert.match(shaderSource, /cloud_population_blob\([\s\S]*cell_field/);
    assert.match(shaderSource, /for \(var colony = 0; colony < 6; colony\+\+\)/);
    assert.match(shaderSource, /let leading_front/);
    assert.match(shaderSource, /for \(var fibre = 0; fibre < 5; fibre\+\+\)/);
    assert.match(shaderSource, /for \(var storm_cell = 0; storm_cell < 3; storm_cell\+\+\)/);
    assert.match(shaderSource, /layer\.phase\.w \* 23\.137/);
    assert.match(shaderSource, /weather_sample\.rgb/);
    assert.match(shaderSource, /continuous_sheet/);
    assert.match(shaderSource, /immediate_deck/);
    assert.match(shaderSource, /let nearby_storm = force_nearby \|\| force_overhead/);
    assert.match(shaderSource, /var formation_driver = weather_sample\.r/);
    assert.match(shaderSource, /editorial_population\.x \* 0\.82/);
    assert.doesNotMatch(shaderSource, /domain_erosion/);
    assert.doesNotMatch(shaderSource, /system_core_boost/);
    assert.match(shaderSource, /let camera_half_fov = max\(0\.42, p\[4\]\.x \* 0\.5\)/);
    assert.doesNotMatch(shaderSource, /editorial_population\.x \* weather_density/);
    assert.doesNotMatch(shaderSource, /mix\(0\.82, 1\.0, system\)/);
    assert.doesNotMatch(shaderSource, /if \(mode != 0 && mode != 2\)/);
    // The two older mask strategies remain available as direct Lab controls.
    assert.match(shaderSource, /let left = ellipse_field/);
    assert.match(shaderSource, /let right = ellipse_field/);
    assert.match(shaderSource, /let offset_accent = ellipse_field/);
    assert.match(rendererSource, /cloudCompositionCode/);
    assert.match(rendererSource, /graphic: 3/);
    assert.match(rendererSource, /cloudPerspectiveCode/);
    assert.match(rendererSource, /cloudEditorialRegimeCode/);
    assert.match(rendererSource, /orthographic: 3/);
    assert.match(shaderSource, /let perspective = i32\(round\(p\[28\]\.z\)\)/);
    assert.match(shaderSource, /result\.x - 0\.5\) \* 1\.48/);
});

test("thermal adaptation changes the expensive cloud transport interval", () => {
    assert.match(
        rendererSource,
        /current\.options\.updateRate \* cadenceScale/,
    );
    assert.match(rendererSource, /const cloudInterval = 1 \/ effectiveCloudRate/);
});

test("bounded traversal integrates exact finite world-space cloud support", () => {
    assert.match(shaderSource,
        /for \(var iteration = 0; iteration < 1900; iteration\+\+\)/);
    assert.match(shaderSource,
        /if \(\(!finite_owner_mode && iteration >= step_count\) \|\|/);
    assert.match(shaderSource,
        /step_far = min\(\s*finite_segment_end, integrated_far \+ finite_step_target_km\)/);
    assert.match(shaderSource,
        /step_near = near \+ interval_length \*\s*pow\(lower_t, distribution_power\)/);
    assert.match(shaderSource, /let parent_step_length = step_far - step_near/);
    assert.match(shaderSource, /if \(far <= near\)/);
    const supportStart = shaderSource.indexOf(
        "fn production_cloud_system_support_interval(",
    );
    const supportEnd = shaderSource.indexOf(
        "fn empty_cloud_output()", supportStart,
    );
    assert.ok(supportStart >= 0 && supportEnd > supportStart);
    const productionSupport = shaderSource.slice(supportStart, supportEnd);
    assert.match(productionSupport, /let owner_support_scale = 1\.30/);
    assert.match(productionSupport,
        /let along = hydrometeor_axis_interval\(/);
    assert.match(productionSupport,
        /let across = hydrometeor_axis_interval\(/);
    assert.match(productionSupport,
        /let altitude = hydrometeor_altitude_interval\(/);
    assert.match(productionSupport,
        /let range = cloud_morphology_owner_range\(owner_index\)/);
    assert.match(productionSupport,
        /cloud_morphology_load_record\(range\.x \+ local_index\)/);
    assert.match(productionSupport,
        /CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET/);
    assert.match(productionSupport,
        /abs\(cloud_system_buffer\.header\.y - 16\.0\) <= 0\.25/);
    assert.match(productionSupport,
        /abs\(cloud_macro_bindings\.header\.y - 7\.0\) <= 0\.25/);
    assert.match(productionSupport,
        /i32\(round\(system\.identity\.y\)\) != layer_index/);
    assert.match(productionSupport,
        /i32\(round\(system\.identity\.z\)\) != genus/);
    assert.match(productionSupport,
        /max\(shell\.x, owner_support\.x\)/);
    assert.match(productionSupport,
        /min\(shell\.y, owner_support\.y\)/);
    assert.match(productionSupport,
        /return select\(shell, finite_support, has_finite_owner\)/);
    assert.doesNotMatch(productionSupport, /input_uv|cloud_composition_mask|p\[28\]/);
    assert.match(shaderSource,
        /production_layer_interval\(\s*origin, direction, layer, index\)/);
});

test("timestamp telemetry separates interval, lighting, and transport costs", () => {
    assert.match(rendererSource, /lastCloudIntervalMs/);
    assert.match(rendererSource, /lastCloudLightingMs/);
    assert.match(rendererSource, /lastCloudTransportMs/);
    assert.match(rendererSource, /Number\(intervalNanoseconds\) \/ 1_000_000/);
});

test("meteorological changes reset visual and performance measurements", () => {
    assert.match(rendererSource, /const resetCloudMeasurements = \(\) =>/);
    assert.match(rendererSource, /cloudGpuSamples\.length = 0/);
    assert.match(rendererSource, /measurementGeneration \+= 1/);
    assert.match(
        rendererSource,
        /submittedMeasurementGeneration === measurementGeneration/,
    );
});

test("diagnostic coverage uses a bounded solid-angle GPU reduction", () => {
    assert.match(shaderSource, /WEBGPU_CLOUD_METRICS_SHADER/);
    assert.match(shaderSource, /fn solid_angle_weight/);
    assert.match(shaderSource, /@compute @workgroup_size\(8, 8, 1\)/);
    assert.match(shaderSource, /var transmittance_texture: texture_2d<f32>/);
    assert.match(shaderSource,
        /let opacity = 1\.0 - clamp\(transmittance\.a, 0\.0, 1\.0\)/);
    assert.match(shaderSource, /opacity >= 0\.02/);
    assert.match(shaderSource, /evaluated_step_weight/);
    assert.match(shaderSource, /textureLoad\(motion_texture, pixel, 0\)/);
    assert.match(rendererSource, /cloudMetricsPipeline/);
    assert.match(rendererSource, /dispatchWorkgroups\(8, 5, 1\)/);
    assert.match(rendererSource, /projectedOpacity = values\[0\] \/ totalWeight/);
    assert.match(rendererSource, /meanEvaluatedStepFraction = values\[4\] \/ totalWeight/);
    assert.match(rendererSource,
        /binding: 0,[\s\S]{0,120}?transportLayerView\(cloudCurrent, 1\)/);
    assert.match(rendererSource, /current\.options\.debugView !== "final"/);
});

test("cold WebGPU startup ramps bounded transport samples before full quality", () => {
    assert.match(rendererSource, /transportUpdates === 0/);
    assert.match(rendererSource, /warmupScale/);
    assert.match(rendererSource, /transportUpdates \+= 1/);
    assert.match(rendererSource, /\? "warming"/);
});

test("paused photographic qualification does not depend on offscreen rAF", () => {
    assert.match(rendererSource,
        /const hiddenCaptureAllowed = captureInitializationTelemetry &&\s*propsRef\.current\.paused/);
    assert.match(rendererSource,
        /document\.hidden && !hiddenCaptureAllowed/);
    assert.match(rendererSource,
        /hidden: document\.hidden && !\(\s*captureInitializationTelemetry && current\.paused\)/);
    assert.match(rendererSource,
        /if \(current\.paused\) \{[\s\S]{0,420}?draw\(performance\.now\(\)\);[\s\S]{0,80}?schedule\(\);/);
    assert.match(rendererSource, /Interactive rendering/);
    assert.match(rendererSource,
        /animationFrame = window\.requestAnimationFrame\(\(time\) =>/);
});

test("cold lighting first use is isolated before cloud transport", () => {
    assert.match(rendererSource, /const lightingWarmupOnly =/);
    assert.match(rendererSource,
        /let transportedCloud = updateCloud && !current\.paused &&\s*!lightingWarmupOnly/);
    assert.match(rendererSource,
        /strictCloudTransportTransaction = null;[\s\S]{0,180}?transportedCloud = true/);
    assert.match(rendererSource, /if \(!lightingWarmupOnly\)/);
    assert.match(rendererSource, /resolveQuerySet\([\s\S]*cloudTimestampQuery,[\s\S]*0,[\s\S]*4,/);
    assert.match(rendererSource, /coldWarmupSubmittedThisFrame/);
    assert.match(rendererSource, /device\.queue\.onSubmittedWorkDone\(\)\.then/);
    assert.match(rendererSource, /requestAnimationFrame\(\(time\) => draw\(time, true\)\)/);
    assert.match(rendererSource, /historyValid = historyValid \|\| transportedCloud/);
    assert.match(rendererSource, /initialize neutral cloud history/);
    assert.match(rendererSource, /transportUpdates === 0 \|\| frame % 8 === 0/);
    assert.match(rendererSource, /submittedTransportOrdinal === 0/);
    assert.match(rendererSource, /firstCloudTransportMs = Number\(transportNanoseconds\)/);
    assert.match(validatorSource, /warmupEncoder\.finish\(\)/);
    assert.match(validatorSource, /isolated cold lighting submission/);
});

test("full-frame production transport retains optional temporal reconstruction support", () => {
    assert.match(shaderSource, /interleaved_transport && checker != 0/);
    assert.match(shaderSource, /current_updated/);
    assert.match(shaderSource, /sample_previous_transport\(previous_uv\)/);
    assert.match(rendererSource, /let activeInterleavedTransport = false/);
    assert.match(rendererSource, /transportPixelFraction: activeInterleavedTransport \? 0\.5 : 1/);
    assert.match(rendererSource, /loadOp: "load"/);
});

test("cloud ray jitter uses progressive spatiotemporal blue noise", () => {
    const marchStart = shaderSource.indexOf("fn march_layer(");
    const marchEnd = shaderSource.indexOf("fn cloud_fragment", marchStart);
    const marchLayer = shaderSource.slice(marchStart, marchEnd);
    assert.match(shaderSource, /blue_noise_texture/);
    assert.match(marchLayer,
        /fract\([\s\S]*jitter \+ actual_steps \* 0\.5698402909980532[\s\S]*f32\(index\) \* 0\.438289/);
    assert.match(marchLayer, /mix\(0\.08, 0\.92, stratum_jitter\)/);
    assert.match(shaderSource,
        /let jitter = fract\(blue_noise \+ p\[30\]\.x \* 0\.7548776662466927\)/);
    assert.doesNotMatch(marchLayer, /hash31\(/);
    assert.doesNotMatch(marchLayer, /mix\(lower_t, upper_t, 0\.5\)/);
    assert.match(rendererSource, /blue-noise-r8-64\.bin/);
    assert.match(rendererSource, /format: "r8unorm"/);
});

test("camera cloud strata share one owner traversal for density and material", () => {
    const sharedStart = shaderSource.indexOf(
        "fn cloud_density_material_sample_filtered(");
    const sharedEnd = shaderSource.indexOf(
        "fn cloud_density_material_sample(", sharedStart);
    const sharedSample = shaderSource.slice(sharedStart, sharedEnd);
    assert.match(sharedSample,
        /let macro_atlas = cloud_macro_atlas_sample_with_footprint\([\s\S]*?true, restrict_to_active, active_set,[\s\S]*?fibratus_ray_direction\)/);
    assert.equal([
        ...sharedSample.matchAll(/cloud_macro_atlas_sample_with_footprint\(/g),
    ].length, 1, "shared camera sample must traverse macro owners exactly once");
    assert.match(sharedSample,
        /result\.density = density_at_filtered_from_macro_sample\([\s\S]*?macro_atlas\)/);
    assert.match(sharedSample,
        /result\.material = cloud_local_material_from_macro_sample\(\s*macro_atlas, layer\)/);

    const sheetStart = shaderSource.indexOf("fn march_sheet_layer(");
    const volumeStart = shaderSource.indexOf("fn march_layer(", sheetStart);
    const sheetMarch = shaderSource.slice(sheetStart, volumeStart);
    const volumeEnd = shaderSource.indexOf("struct HydrometeorTransport", volumeStart);
    const volumeMarch = shaderSource.slice(volumeStart, volumeEnd);
    const orderedStart = shaderSource.indexOf("fn ordered_cloud_weather_sample(");
    const orderedEnd = shaderSource.indexOf(
        "fn ordered_hydrometeor_weather_sample(", orderedStart);
    const orderedSample = shaderSource.slice(orderedStart, orderedEnd);
    const residualStart = shaderSource.indexOf("fn residual_light_tau(");
    const residualEnd = shaderSource.indexOf(
        "fn cloud_spectral_extinction_coefficient_from_material(",
        residualStart,
    );
    const residualLight = shaderSource.slice(residualStart, residualEnd);

    assert.match(sheetMarch,
        /let cloud_sample = cloud_density_material_sample\(point, layer, index\)/);
    assert.match(volumeMarch,
        /cloud_density_material_sample_camera_active\([\s\S]*?finite_active_set,[\s\S]*?fibratus_filter_radius_km, step_length, direction\)/);
    assert.match(volumeMarch,
        /cloud_density_material_sample_camera\([\s\S]*?fibratus_filter_radius_km,[\s\S]*?step_length, direction\)/);
    assert.match(shaderSource,
        /fn cloud_camera_fibratus_pixel_filter_radius_per_km\(\)[\s\S]*?p\[4\]\.x[\s\S]*?p\[0\]\.x[\s\S]*?p\[4\]\.z[\s\S]*?p\[0\]\.y/);
    assert.match(volumeMarch,
        /let fibratus_pixel_filter_radius_per_km =[\s\S]*?for \(var iteration[\s\S]*?let fibratus_filter_radius_km = max\(0\.0, travelled\) \*[\s\S]*?fibratus_pixel_filter_radius_per_km/);
    const cameraSample = shaderSource.match(
        /fn cloud_density_material_sample_camera\([\s\S]*?\n}\n\nfn cloud_density_material_sample_camera_active/,
    )?.[0] ?? "";
    assert.doesNotMatch(cameraSample, /normalize\(|camera_origin|length\(/,
        "camera projection and unit-ray invariants cannot be recomputed per stratum");
    assert.match(orderedSample,
        /let cloud_sample = cloud_density_material_sample_active\([\s\S]*?active_set\)/);
    assert.match(residualLight,
        /let cloud_sample = cloud_density_material_sample\([\s\S]*?layer_index\)/);
    for (const path of [sheetMarch, volumeMarch, orderedSample, residualLight]) {
        assert.match(path, /let density = cloud_sample\.density/);
        assert.doesNotMatch(path, /cloud_local_material_query(?:_active)?\(/);
    }
    for (const path of [sheetMarch, volumeMarch, orderedSample]) {
        assert.match(path, /let local_material = cloud_sample\.material/);
    }
    assert.match(residualLight,
        /cloud_extinction_coefficient_from_mass\(\s*cloud_sample\.material, layer\)/);
});

test("bounded camera cloud lighting uses atlas direct and local analytic diffuse", () => {
    const cameraSourceStart = shaderSource.indexOf(
        "fn cloud_camera_source_transmittance(");
    const cameraSourceEnd = shaderSource.indexOf(
        "struct HydrometeorTransport", cameraSourceStart);
    const cameraSource = shaderSource.slice(cameraSourceStart, cameraSourceEnd);
    assert.match(cameraSource,
        /coupling_cloud_source_transmittance_at\(\s*renderer_to_atmosphere_world\(renderer_point\), source_index\)/);
    assert.equal([
        ...cameraSource.matchAll(/cloud_camera_source_transmittance\(point, [01]u\)/g),
    ].length, 4, "sheet and volumetric source paths query Sun and Moon once each");
    assert.match(shaderSource, /fn cloud_local_sdf_diffuse_optical_depth\(/);
    assert.match(shaderSource, /local_material\.local_upper_path_km/);
    assert.match(shaderSource, /local_material\.local_lower_path_km/);
    assert.doesNotMatch(cameraSource,
        /same_layer_light_tau|cloud_integrate_owner_support_tau|cloud_owner_spectral_extinction_at/);
    assert.doesNotMatch(cameraSource,
        /cloud_lv_sample_layer_direct_transmittance|resident_sun_t|missing_sun_tau|cached_sun_tau_rgb/);
    assert.match(shaderSource, /fn cloud_higher_order_agreement_weight\(/);
    assert.match(cameraSource,
        /resolved_light_volume_confidence = 0\.0/);
});

test("world-space light volumes own exact material, Beer, P1, and boundary transport", () => {
    assert.match(shaderSource,
        /WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER =\s*pruneWgslFunctionsToEntryPoints\([\s\S]{0,160}WEBGPU_CLOUD_AUXILIARY_SHADER \+/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER =\s*pruneWgslFunctionsToEntryPoints/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER =\s*pruneWgslFunctionsToEntryPoints/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER =\s*pruneWgslFunctionsToEntryPoints/);
    assert.match(shaderSource,
        /WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER =\s*pruneWgslFunctionsToEntryPoints/);
    assert.match(shaderSource, /fn cloud_lv_query_world_medium\(/);
    assert.match(shaderSource,
        /morphology\.base_coverage <= 0\.0001[\s\S]*?morphology\.additive_density <= 0\.0001/);
    assert.match(shaderSource, /cloud_morphology_evaluate_owner\(owner_index, local_position\)/);
    assert.match(shaderSource, /morphology\.base_position_km/);
    assert.match(shaderSource, /morphology\.placement_position_km/);
    assert.match(shaderSource, /morphology\.reuse_weight/);
    assert.match(shaderSource, /cloud_morphology_compose_density\(/);
    assert.match(shaderSource, /morphology\.target_optical_depth/);
    assert.match(shaderSource, /fn cloud_lv_source_irradiance_at\(/);
    assert.match(shaderSource, /physical_source_irradiance_at\(min\(1u, source_index\)/);
    assert.match(shaderSource, /for \(var sample_index = 0u; sample_index < 64u/);
    assert.match(shaderSource, /lobe_index < COUPLING_ACTIVE_LOBE_COUNT/);
    assert.match(shaderSource, /coupling_profile_lobe\(lobe_index, altitude_km\)/);
    assert.match(shaderSource,
        /radiance \+= physical_ground_irradiance_at\(world_position_km\) \/ PI/);
    assert.match(shaderSource, /fn cloud_lv_resident_scene_medium\(/);
    assert.match(shaderSource, /fn cloud_lv_transform_ray_exit\(/);
    assert.match(shaderSource, /fn cloud_lv_truncated_directional_radiance\(/);
    assert.match(shaderSource,
        /cloud_passive_diffuse_scattering_transport\(\s*local_optics, scalar_optical_depth\)/);
    assert.doesNotMatch(shaderSource,
        /direct_irradiance \* albedo \*[\s\S]{0,120}\* 0\.25/);

    assert.match(shaderSource,
        /cloud_camera_source_transmittance\(point, 0u\)/);
    assert.match(shaderSource,
        /cloud_camera_source_transmittance\(point, 1u\)/);
    assert.match(shaderSource, /point, -direction, primary_owner, diffusion/);
    assert.match(shaderSource,
        /cloud_propagated_diffuse_scattering_radiance\(\s*sun_optics, p1_incident\)/);
    assert.match(shaderSource, /cloud_lv_owner_sample_confidence/);
    assert.match(cloudLightWgslSource, /fn cloud_lv_owner_resident\(/);
    const p1Confidence = cloudLightWgslSource.slice(
        cloudLightWgslSource.indexOf("fn cloud_lv_owner_sample_confidence"),
        cloudLightWgslSource.indexOf("fn cloud_lv_sample_packed_trilinear"));
    assert.match(p1Confidence,
        /!cloud_lv_layer_ready\(cloud_lv_sample_layer_index\(brick\)\)/,
        "mixed-residency owners must share the analytic higher-order closure");
    assert.doesNotMatch(shaderSource,
        /resident_sun_t|missing_sun_tau|same_layer_light_tau/);
    assert.match(shaderSource,
        /direct_radiance \+ mix\([\s\S]*?analytic_diffuse_radiance,[\s\S]*?light_volume_p1,[\s\S]*?higher_order_blend_confidence/);
    assert.match(shaderSource,
        /cloud_higher_order_agreement_weight\(/);
    assert.match(cloudLightWgslSource, /smoothstep\(0\.0, 2\.0/);
    assert.match(cloudLightWgslSource,
        /confidence = max\(confidence, cloud_lv_sample_brick_confidence\(center\)\)/);
    assert.match(cloudLightWgslSource,
        /fn cloud_lv_all_owner_direct_transmittance\(/);
    assert.match(cloudLightWgslSource,
        /incident_direct \+= cloud_lv_source_irradiance_at\(world, source_index\) \*[\s\S]*?cloud_lv_all_owner_direct_transmittance\(world, source_index\)/);
    assert.match(cloudLightWgslSource,
        /fn cloud_lv_halo_sample\(\s*world: vec3<f32>, current_brick: u32, level: u32/);
    for (const topology of [
        "layered-veil", "precipitating-sheet", "boundary-layer-sheet",
    ]) {
        assert.match(cloudLightRuntimeSource, new RegExp(`"${topology}"`));
    }
});

test("P1 publication rejects missing internal halos and strict captures compare interiors", () => {
    assert.match(cloudLightRuntimeSource,
        /qualifyCloudLightVolumeInternalHaloTopology\(selected\)/);
    assert.match(cloudLightRuntimeSource,
        /!internalHaloInvalidOwners\.has\(domain\.ownerIndex\)/,
        "a topologically incomplete owner must not publish a resident P1 layer");

    assert.match(cloudLightWgslSource,
        /fn cloud_lv_internal_halos_complete\(/);
    const equationStart = cloudLightWgslSource.indexOf(
        "fn cloud_lv_fine_equation_terms(");
    const equationEnd = cloudLightWgslSource.indexOf(
        "fn cloud_lv_equation_terms(", equationStart + 1);
    const equation = cloudLightWgslSource.slice(equationStart, equationEnd);
    assert.match(equation,
        /if \(boundary_kind == CLOUD_LV_BOUNDARY_INTERNAL\) \{ continue; \}[\s\S]*?cloud_lv_marshak_coefficient/,
        "an absent internal halo cannot become a black Marshak boundary");

    const residualStart = cloudLightWgslSource.indexOf(
        "fn cloud_lv_measure_residual_compute(");
    const residualEnd = cloudLightWgslSource.indexOf(
        "fn cloud_lv_pack_view_compute(", residualStart);
    const residual = cloudLightWgslSource.slice(residualStart, residualEnd);
    assert.match(residual,
        /!cloud_lv_internal_halos_complete\(local, brick_index, 0u\)[\s\S]*?energy_violation_count/,
        "the generation readback must fail closed before a broken P1 bank publishes");

    assert.match(rendererSource,
        /setVector\(data, 38, \[[\s\S]*?strictRadiometricQualification \? 1 : 0/);
    assert.match(rendererSource,
        /createParameterData\([\s\S]{0,1200}?updateCloud,\s*current\.paused,\s*\)/,
        "paused preview/cinematic frames enable strict radiometric qualification");
    assert.equal([
        ...shaderSource.matchAll(
            /let strict_radiometric_agreement = p\[38\]\.w > 0\.5;/g),
    ].length, 2, "both sheet-node and ordinary volume transport must qualify interiors");
    assert.equal([
        ...shaderSource.matchAll(
            /if \(strict_radiometric_agreement \|\|\s*resolved_light_volume_confidence < 0\.9999/g),
    ].length, 2);
    assert.ok([
        ...shaderSource.matchAll(/cloud_higher_order_agreement_weight\(/g),
    ].length >= 3, "strict analytic references must feed radiometric agreement");
});

test("light-volume refreshes are bounded and atomically published", () => {
    assert.equal([
        ...rendererSource.matchAll(/= createCloudLightTexture\(/g),
    ].length, 7, "six core fields plus one double-bank coarse lightning field");
    assert.match(rendererSource, /format: "rgba16float"/);
    assert.match(rendererSource, /cloudLightAtlasDepth \* 6/);
    assert.match(rendererSource,
        /mipLevelCount:\s*CLOUD_LIGHT_VOLUME_DEFAULT_CONFIG\.multigridLevels/);
    assert.match(rendererSource, /CLOUD_LIGHT_VOLUME_REFRESH_SLAB_DEPTH = 8/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_EXACT_MEDIUM_SLAB_DEPTH = 8/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_EXACT_FINE_MEDIUM_SLAB_DEPTH = 1/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_EXACT_SOURCE_SLAB_DEPTH = 1/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW = 8/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_EXACT_PASSES_PER_SUBMISSION = 1/);
    assert.match(rendererSource,
        /cloudLightUniformBuffers = Array\.from\([\s\S]*?length:\s*CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW/);
    assert.match(rendererSource,
        /stepIndex < CLOUD_LIGHT_VOLUME_REFRESH_STEPS_PER_DRAW/);
    assert.match(rendererSource,
        /cloudLightExactSubmissionPendingSerial === null/);
    assert.match(rendererSource,
        /const cloudLightInvalidationPending =\s*structuralInvalidation \|\| timeInvalidation/);
    assert.match(rendererSource,
        /const cloudLightTransportEpochReady =\s*isCloudLightTransportEpochReady\(\{[\s\S]{0,180}refreshWorkPending: cloudLightRefreshWork !== null,[\s\S]{0,120}invalidationPending: cloudLightInvalidationPending/);
    assert.match(rendererSource,
        /hasVolumetricContent && cloudLightTransportEpochReady/);
    const readinessDecision = rendererSource.indexOf(
        "const cloudLightTransportEpochReady =",
    );
    const runtimeInvalidation = rendererSource.indexOf(
        "if (structuralInvalidation || timeInvalidation)",
    );
    assert.ok(readinessDecision >= 0 && runtimeInvalidation > readinessDecision,
        "same-frame light invalidation must gate transport before refresh encoding");
    assert.match(rendererSource,
        /const timeInvalidation = shouldInvalidateCloudLightForTime\(\{[\s\S]{0,320}transportedGeneration:\s*cloudLightLastTransportCompletedGeneration/);
    assert.doesNotMatch(rendererSource,
        /cloudLightState !== "warming" &&[\s\S]*?requestedCloudLightAdvectionEpoch/);
    assert.match(rendererSource,
        /result === "exact-progress"[\s\S]{0,160}exactPassCount \+= 1/);
    assert.match(rendererSource,
        /exactPassCount >=[\s\S]{0,100}CLOUD_LIGHT_VOLUME_EXACT_PASSES_PER_SUBMISSION[\s\S]{0,80}break;/);
    assert.match(rendererSource,
        /if \(exactPassCount > 0\)[\s\S]{0,220}cloudLightExactSubmissionPendingSerial/);
    assert.match(rendererSource,
        /queue\.onSubmittedWorkDone\(\)[\s\S]*?cloudLightExactSubmissionPendingSerial ===[\s\S]*?submittedSerial/);
    const exactComputeOnlySubmit = rendererSource.indexOf(
        "if (cloudLightExactSubmissionSerialThisFrame !== null)",
    );
    const presentationWork = rendererSource.indexOf(
        "if (cloudTargetsNeedClear)", exactComputeOnlySubmit,
    );
    assert.ok(exactComputeOnlySubmit >= 0 &&
        presentationWork > exactComputeOnlySubmit,
    "exact work must submit and return before presentation encoding");
    const exactComputeOnlyBlock = rendererSource.slice(
        exactComputeOnlySubmit, presentationWork,
    );
    assert.match(exactComputeOnlyBlock,
        /const exactCommands = encoder\.finish\(\)[\s\S]*?queue\.submit\(\[exactCommands\]\)[\s\S]*?armCloudLightExactSubmissionFence\(submittedSerial\)[\s\S]*?return;/);
    assert.doesNotMatch(exactComputeOnlyBlock,
        /context\.getCurrentTexture|beginRenderPass|compositePipeline/);
    assert.match(rendererSource,
        /const cloudLightGenerationEpochIsFrozen =[\s\S]{0,320}cloudLightRefreshWork !== null[\s\S]{0,320}cloudLightLastTransportCompletedGeneration !==[\s\S]{0,120}cloudLightBoundGeneration/);
    assert.match(rendererSource,
        /directionalVisibilityAdvectionEpoch =[\s\S]{0,300}cloudLightGenerationEpochIsFrozen[\s\S]{0,120}cloudLightAdvectionEpoch[\s\S]{0,120}requestedCloudLightAdvectionEpoch/);
    assert.match(rendererSource,
        /transportedCloudLightGeneration[\s\S]*?queue\.onSubmittedWorkDone\(\)[\s\S]{0,320}cloudLightLastTransportCompletedGeneration =[\s\S]{0,80}submittedGeneration/);
    assert.match(rendererSource,
        /const lightVolumeWarming = cloudLightRefreshWork !== null &&[\s\S]{0,160}cloudLightExactSubmissionPendingSerial === null &&[\s\S]{0,100}!cloudLightResidualReadPending/);
    assert.match(rendererSource,
        /const cloudLightPhysicalGroup0 =[\s\S]*?binding: 34,[\s\S]*?directionalCloudVisibilityUniformBuffer/);
    assert.match(rendererSource,
        /encodeCloudLightBrickRefreshStep\([\s\S]*?cloudLightUniformBuffers\[stepIndex\]/);
    assert.doesNotMatch(rendererSource,
        /const cloudLightUniformBuffer = device\.createBuffer/);
    assert.match(rendererSource, /encodeCloudLightBrickRefreshStep/);
    assert.match(rendererSource,
        /advanceGlobalPass\("source-materialize-sun"\)/);
    assert.match(rendererSource,
        /advanceBrick\("source-materialize-moon"\)/);
    assert.match(rendererSource,
        /source-materialize-sun[\s\S]*?cloudLightSourceMaterializeSunPipeline[\s\S]*?advanceGlobalPass\("direct-sun"\)/);
    assert.match(rendererSource,
        /source-materialize-moon[\s\S]*?cloudLightSourceMaterializeMoonPipeline[\s\S]*?advanceGlobalPass\("direct-moon"\)/);
    assert.match(rendererSource,
        /work\.phase === "source-materialize-sun"[\s\S]{0,180}cloudLightActiveSourceMask & 1[\s\S]{0,180}return "progress"/);
    assert.match(rendererSource,
        /work\.phase === "source-materialize-moon"[\s\S]{0,180}cloudLightActiveSourceMask & 2[\s\S]{0,180}return "progress"/);
    assert.match(rendererSource,
        /work\.phase === "lightning-field"[\s\S]{0,360}!cloudLightHasLightning[\s\S]{0,240}return "progress"/);
    assert.match(rendererSource,
        /cloudLightActiveSourceMask = cloudLightRuntime\.sources\.reduce\(/);
    assert.match(rendererSource,
        /source\.active[\s\S]{0,100}source\.kind === "sun" \? 1 : 2/);
    assert.match(rendererSource,
        /packCloudLightVolumeSources\(cloudLightRuntime\.sources\)/);
    assert.match(cloudLightRuntimeSource,
        /CLOUD_LIGHT_VOLUME_DAYLIGHT_RELATIVE_SOURCE_THRESHOLD = 1e-5/);
    assert.match(cloudLightRuntimeSource,
        /source\.kind === "moon" && daylightSun/);
    assert.match(cloudLightRuntimeSource,
        /return active === source\.active \? source : \{ \.\.\.source, active \}/);
    assert.match(cloudLightRuntimeSource,
        /domains\.filter\(\(\{ ownerIndex \}\) => selectedOwnerIndices\.has\(ownerIndex\)\)[\s\S]{0,180}centerWorldKm: domain\.center[\s\S]{0,100}Math\.hypot\(\.\.\.domain\.halfExtent\)/);
    assert.match(rendererSource,
        /cloudLightHasLightning = packedWeatherScene\.lightning !== null/);
    assert.match(rendererSource,
        /work\.phase === "direct-sun"[\s\S]*?writeUniform\(false, false, 0, brickDepth\)[\s\S]*?advanceBrick\("source-materialize-moon"\)/);
    assert.match(rendererSource,
        /work\.phase === "direct-moon"[\s\S]*?writeUniform\(false, false, 0, brickDepth\)[\s\S]*?advanceBrick\("lightning-field"\)/);
    assert.match(rendererSource,
        /work\.phase === "lightning-field"[\s\S]*?work\.level = 2[\s\S]*?cloudLightLightningPipeline/);
    assert.match(rendererSource,
        /const sourceOrigin = \[[\s\S]*?representativeBrickIndex \* brickDepth/);
    assert.match(rendererSource,
        /if \(!isRepresentativeBrick\)[\s\S]*?advanceBrick\("direct-sun"\)/);
    assert.match(rendererSource,
        /source-materialize-moon[\s\S]{0,520}if \(!isRepresentativeBrick\)[\s\S]{0,160}advanceBrick\("direct-moon"\)/,
        "the host must suppress nonrepresentative Moon source materialization before dispatch");
    assert.match(rendererSource,
        /binding: 11,[\s\S]{0,180}mipView\(cloudLightFluenceScratch, level\)/);
    assert.match(rendererSource,
        /binding: 10,[\s\S]{0,180}mipView\(cloudLightFluenceScratch, level\)/);
    assert.match(rendererSource, /const advanceGlobalPass =/);
    assert.match(rendererSource, /resolveCloudLightVolumeSmoothingParity/);
    assert.match(rendererSource, /work\.iteration < 0/);
    assert.match(rendererSource,
        /initialReadPacked = smoothingParity\.firstReadPacked/);
    assert.match(rendererSource, /if \(!smoothingParity\.endsPacked\)/);
    assert.match(rendererSource,
        /binding: 6,[\s\S]{0,120}cloudLightMediumExtinction\.createView\(\)/);
    assert.match(rendererSource,
        /Every selected brick[\s\S]*dependent level\/iteration/);
    assert.match(rendererSource, /Math\.ceil\(slabDepth \/ 4\)/);
    assert.match(rendererSource,
        /directDispatch =\s*cloudLightPlan\.dispatch\.directWorkgroupsPerSource/);
    assert.match(rendererSource,
        /complete active bank\/header remains untouched[\s\S]*every target brick is solved and qualified/);
    assert.match(rendererSource, /cloudLightTargetBank = 1 - cloudLightActiveBank/);
    assert.match(rendererSource,
        /cloudLightTargetResidentOwnerMask =\s*cloudLightRuntime\.residentOwnerMask/);
    assert.match(rendererSource, /device\.queue\.onSubmittedWorkDone\(\)\.then/);
    assert.match(rendererSource, /cloudLightActiveBank = completedBank/);
    assert.match(rendererSource,
        /const completedResidentOwnerMask =\s*cloudLightTargetResidentOwnerMask/);
    assert.match(rendererSource,
        /cloudLightActiveResidentOwnerMask =\s*completedResidentOwnerMask/);
    assert.match(rendererSource,
        /cloudLightActiveResidentLayerMask,[\s\S]{0,120}cloudLightActiveResidentOwnerMask/);
    assert.doesNotMatch(rendererSource, /cloudLightReadyMask &= ~\(1 << brickIndex\)/);
    assert.doesNotMatch(rendererSource,
        /cloudLightReadyMask \|= 1 << activeWork\.brickIndex/);
    assert.match(rendererSource, /cloudLightRefreshWork === null/);
    assert.match(rendererSource, /cloudLightResidualStatusBuffer/);
    assert.match(rendererSource,
        /residual <= cloudLightPlan\.config\.residualTolerance/);
    assert.match(rendererSource,
        /request\.cycle <\s*cloudLightPlan\.config\.maximumVCycles/);
    assert.match(rendererSource,
        /work\.brickIndex === 0 && work\.slabStart === 0/);
    assert.match(rendererSource, /cloudLightState = "failed"/);
    assert.match(rendererSource,
        /"exact-submission-fence-failed"[\s\S]{0,180}cloudLightRefreshWork = null;[\s\S]{0,100}cloudLightState = "failed";[\s\S]{0,120}wakeRef\.current\?\.\(\)/);
    assert.match(rendererSource,
        /canvas\.dataset\.cloudLightVolumeResidualTolerance/);
    assert.match(rendererSource,
        /canvas\.dataset\.cloudLightVolumeResidualNonFiniteCount/);
    assert.match(rendererSource,
        /canvas\.dataset\.cloudLightVolumeResidualOccupiedCount/);
    assert.match(rendererSource,
        /canvas\.dataset\.cloudLightVolumeResidentLayerMask/);
    assert.match(rendererSource,
        /canvas\.dataset\.cloudLightVolumeResidentOwnerMask/);
    assert.match(cloudLightWgslSource, /fn cloud_lv_slab_local_z/);
    assert.match(cloudLightWgslSource, /fn cloud_lv_slab_contains/);
    assert.match(cloudLightWgslSource,
        /fn cloud_lv_materialize_medium_compute[\s\S]{0,240}if \(level != 1u\) \{ return; \}/);
    assert.match(cloudLightWgslSource,
        /fn cloud_lv_materialize_medium_fine_compute[\s\S]{0,240}if \(level != 0u\) \{ return; \}/);
    assert.match(cloudLightWgslSource,
        /CLOUD_LV_FILTERED_MEDIUM_BIT: u32 = 256u/);
    assert.match(cloudLightWgslSource,
        /CLOUD_LV_PAIRED_DIRECT_Y_BIT: u32 = 512u/);
    assert.match(cloudLightWgslSource,
        /CLOUD_LV_RESIDENT_SOURCE_MEDIUM_BIT: u32 = 1024u/);
    assert.match(cloudLightWgslSource, /fn cloud_lv_minmod\(/);
    assert.match(cloudLightWgslSource, /fn cloud_lv_monotone_child\(/);
    assert.match(cloudLightWgslSource,
        /let extinction = scattering \+ absorption/);
    assert.match(cloudLightWgslSource,
        /let occupancy = clamp\(extinction_samples\[0\]\.a, 0\.0, 1\.0\)/);
    assert.match(cloudLightWgslSource,
        /forward_samples\[sample_index\][\s\S]{0,260}backward_samples\[sample_index\]/);
    assert.match(cloudLightWgslSource,
        /let scattering = forward \+ backward/);
    assert.doesNotMatch(cloudLightWgslSource, /let parent_occupied =/);
    assert.match(cloudLightWgslSource,
        /local \/ vec3<u32>\(2u\)/);
    assert.match(rendererSource,
        /advanceGlobalPass\("material-fine"\)\) work\.level = 0/);
    assert.match(rendererSource,
        /work\.phase === "material-fine"[\s\S]*?cloudLightMaterialFinePipeline/);
    assert.match(rendererSource,
        /work\.phase === "material"[\s\S]*?return filteredMediumSafe[\s\S]{0,100}"exact-progress"[\s\S]{0,100}"progress"/);
    assert.match(rendererSource,
        /work\.phase === "prolongate-medium"[\s\S]*?cloudLightProlongateMediumPipeline[\s\S]*?advanceGlobalPass\("restrict-medium"\)\) work\.level = 1/);
    assert.match(rendererSource,
        /phase: cloudLightTargetResidentLayerMask !== 0[\s\S]{0,120}\? "material" : "source-materialize-sun"[\s\S]{0,180}level: cloudLightTargetResidentLayerMask !== 0[\s\S]{0,80}\? 1 : 0/);
    assert.match(cloudLightWgslSource,
        /invocation\.y >= CLOUD_LV_HEIGHT \/ 2u/);
    assert.match(rendererSource,
        /const exactSourceSlabDispatch = \[[\s\S]{0,360}Math\.ceil\(brickHeight \/ 4\)/);
    assert.doesNotMatch(rendererSource,
        /const exactSourceSlabDispatch = \[[\s\S]{0,360}brickHeight \/ 2/);
    assert.match(cloudLightWgslSource,
        /\(f32\(pair_local\.y\) \+ 0\.5\) \* 2\.0/);
    assert.match(cloudLightWgslSource,
        /let source_medium_y = select\(local\.y, local\.y \/ 2u, paired_y\)/);
    assert.match(cloudLightWgslSource,
        /let fine_local = vec3<u32>\(invocation\.xy, local_z\)/);
    assert.match(cloudLightWgslSource,
        /!cloud_lv_owner_may_sample\(world, owner_index\)/);
    assert.match(cloudLightWgslSource,
        /fn cloud_lv_sample_resident_owner_medium\([\s\S]*?cloud_lv_medium_extinction/);
    assert.match(cloudLightWgslSource,
        /cloud_lv_resident_source_medium_safe\(brick\)[\s\S]{0,220}cloud_lv_sample_resident_owner_medium/);
    assert.match(rendererSource,
        /CLOUD_LIGHT_VOLUME_RESIDENT_SOURCE_MEDIUM_BIT[\s\S]*?residentSourceMediumSafe/);
    assert.match(rendererSource,
        /const samplingMetadataValid =[\s\S]{0,420}CLOUD_LIGHT_VOLUME_KNOWN_METADATA_MASK/);
    assert.match(rendererSource,
        /const residentSourceMediumSafe =[\s\S]{0,120}samplingMetadataValid/);
    assert.match(rendererSource,
        /binding: 6,[\s\S]{0,140}cloudLightMediumExtinction/);
    assert.match(validatorSource,
        /materializePipeline[\s\S]{0,360}binding: 6,[\s\S]{0,140}cloudLightMediumExtinction/);
    assert.match(rendererSource,
        /return residentSourceMediumSafe[\s\S]{0,100}"progress"[\s\S]{0,100}"exact-progress"/);
    assert.match(cloudLightWgslSource,
        /let owner_has_support_modifier =\s*cloud_lv_owner_has_support_changing_modifier\(owner_index\)/);
    assert.match(cloudLightWgslSource,
        /var child_may_sample = false;[\s\S]{0,80}if \(owner_has_support_modifier\) \{[\s\S]{0,100}child_may_sample = cloud_lv_owner_may_sample\([\s\S]{0,120}else \{[\s\S]{0,100}child_may_sample = cloud_lv_owner_base_may_sample\([\s\S]{0,140}block_may_sample = block_may_sample \|\| child_may_sample/);
    assert.match(shaderSource, /fn cloud_lv_macro_owner_may_sample\(/);
    assert.match(shaderSource,
        /species == 1 && formation_mechanism == 3[\s\S]{0,240}cloud_macro_volume_rgba\(canonical, atlas_binding\)[\s\S]{0,120}macro_sample\.r <= 0\.0001[\s\S]{0,180}cloud_morphology_owner_topology\(owner_index\)[\s\S]{0,180}owner_topology\.connectivity == 1u[\s\S]{0,180}cloud_macro_sdf_voxels\(canonical, macro_sample\.a\) >= 0\.0/,
        "fibratus light-volume culling must reject its exact non-negative SDF support before the analytic fibre loop");
    assert.match(shaderSource,
        /cloud_lv_macro_owner_may_sample\(\s*local_position_km, system, atlas_binding, owner_index\)/,
        "the fibratus zero proof must use the current owner's topology");
    assert.match(shaderSource,
        /fn cloud_lv_filtered_fibratus_owner_sample\([\s\S]{0,2200}result\.density = saturate\(macro_sample\.r\)[\s\S]{0,500}fn cloud_lv_macro_owner_transport_sample/,
        "the light grid must consume the manifest's filtered fibratus condensate moment");
    assert.match(shaderSource,
        /species == 1 && formation_mechanism == 3[\s\S]{0,180}owner_topology\.connectivity == 1u[\s\S]{0,180}return cloud_lv_filtered_fibratus_owner_sample/,
        "qualified fibratus lighting must bypass the camera-only analytic strand kernel");
    assert.match(shaderSource,
        /base_sample = cloud_lv_macro_owner_transport_sample[\s\S]{0,360}placement_sample = cloud_lv_macro_owner_transport_sample[\s\S]{0,360}reuse_sample = cloud_lv_macro_owner_transport_sample/,
        "base, placed, and reused carriers must share the filtered light-grid query");
    assert.match(shaderSource, /fn cloud_lv_owner_base_may_sample\(/);
    assert.match(shaderSource,
        /fn cloud_lv_owner_modifier_may_change_support_at\(/);
    assert.match(shaderSource,
        /fn cloud_lv_owner_has_support_changing_modifier\(/);
    assert.match(shaderSource,
        /fn cloud_lv_morphology_operation_may_change_support\(/);
    assert.match(shaderSource,
        /cloud_morphology_local_position\(\s*record, local_position_km\)/);
    assert.match(shaderSource,
        /cloud_morphology_finite_envelope\(modifier_local\) > 0\.0/);
    assert.match(shaderSource,
        /operation == CLOUD_MORPHOLOGY_OP_PLACE_WORLD_BANDS[\s\S]{0,360}operation == CLOUD_MORPHOLOGY_OP_SUBTRACT_CAVUM[\s\S]{0,80}return false;[\s\S]{0,40}return true;/);
    assert.doesNotMatch(shaderSource,
        /fn cloud_lv_owner_support_has_uncertain_modifier\(/);
    assert.doesNotMatch(cloudLightWgslSource,
        /cloud_lv_owner_support_has_uncertain_modifier/);
    assert.doesNotMatch(cloudLightWgslSource,
        /cloud_lv_prolongate_source_medium_compute/);
    assert.match(cloudLightWgslSource, /atomicMax\(&cloud_lv_residual_status\.maximum/);
    assert.match(validatorSource, /WEBGPU_CLOUD_LIGHT_VOLUME_SOURCE_SHADER/);
    assert.match(validatorSource, /WEBGPU_CLOUD_LIGHT_VOLUME_DIRECT_SHADER/);
    assert.match(validatorSource, /WEBGPU_CLOUD_LIGHT_VOLUME_RESIDENT_SHADER/);
    assert.match(validatorSource, /WEBGPU_CLOUD_LIGHT_VOLUME_P1_SHADER/);
    assert.match(validatorSource, /WEBGPU_CLOUD_LIGHT_VOLUME_LIGHTNING_SHADER/);
    for (const entryPoint of [
        "cloud_lv_project_boundary_compute",
        "cloud_lv_materialize_medium_compute",
        "cloud_lv_materialize_medium_fine_compute",
        "cloud_lv_prolongate_medium_compute",
        "cloud_lv_materialize_source_0_compute",
        "cloud_lv_materialize_source_1_compute",
        "cloud_lv_restrict_medium_compute",
        "cloud_lv_direct_source_0_compute",
        "cloud_lv_direct_source_1_compute",
        "cloud_lv_clear_fluence_compute",
        "cloud_lv_smooth_compute",
        "cloud_lv_restrict_residual_compute",
        "cloud_lv_prolongate_compute",
        "cloud_lv_copy_fluence_compute",
        "cloud_lv_measure_residual_compute",
    ]) {
        assert.match(validatorSource, new RegExp(entryPoint));
    }
    assert.doesNotMatch(validatorSource, /cloud_lv_jacobi_compute/);
});

test("light-volume exact paths and filtered phase reconstruction preserve physical moments", () => {
    const minmod = (a, b) => a * b > 0
        ? Math.sign(a) * Math.min(Math.abs(a), Math.abs(b))
        : 0;
    const reconstruct = ([center, nx, px, ny, py, nz, pz]) => {
        const slopes = [
            minmod(center - nx, px - center),
            minmod(center - ny, py - center),
            minmod(center - nz, pz - center),
        ];
        const lower = Math.min(center, nx, px, ny, py, nz, pz);
        const upper = Math.max(center, nx, px, ny, py, nz, pz);
        const maximumDelta = 0.25 * slopes.reduce(
            (sum, value) => sum + Math.abs(value), 0);
        const scale = maximumDelta > 1e-8
            ? Math.min(1, (center - lower) / maximumDelta,
                (upper - center) / maximumDelta)
            : 1;
        return [-1, 1].flatMap((z) => [-1, 1].flatMap((y) =>
            [-1, 1].map((x) => center + 0.25 * scale *
                (x * slopes[0] + y * slopes[1] + z * slopes[2]))));
    };
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) /
        values.length;
    const close = (actual, expected) => assert.ok(
        Math.abs(actual - expected) <= 1e-12,
        `${actual} != ${expected}`,
    );

    const constant = reconstruct([3, 3, 3, 3, 3, 3, 3]);
    assert.deepEqual(constant, Array(8).fill(3));
    const affine = reconstruct([10, 8, 12, 6, 14, 9, 11]);
    close(mean(affine), 10);
    assert.ok(affine.every((value) => value >= 6 && value <= 14));
    const clipped = reconstruct([0.3, 0, 2.4, 0.1, 3.1, 0.2, 1.8]);
    close(mean(clipped), 0.3);
    assert.ok(clipped.every((value) => value >= 0 && value <= 3.1));

    // Reconstruct nonnegative s+ and s- separately. Their sum conserves
    // scattering and their difference conserves its first phase moment, with
    // realizable |g| <= 1 emerging without a post-reconstruction clamp.
    const scatteringParents = [0.7, 0.5, 0.9, 0.6, 0.8, 0.4, 1];
    const gParents = [0.78, 0.35, 0.88, -0.1, 0.6, -0.35, 0.93];
    const forwardParents = scatteringParents.map((value, index) =>
        0.5 * value * (1 + gParents[index]));
    const backwardParents = scatteringParents.map((value, index) =>
        0.5 * value * (1 - gParents[index]));
    const forwardChildren = reconstruct(forwardParents);
    const backwardChildren = reconstruct(backwardParents);
    const absorptionChildren = reconstruct([0.2, 0.1, 0.3, 0.15, 0.25, 0.05, 0.35]);
    close(mean(forwardChildren), forwardParents[0]);
    close(mean(backwardChildren), backwardParents[0]);
    close(mean(absorptionChildren), 0.2);
    forwardChildren.forEach((forward, index) => {
        const backward = backwardChildren[index];
        const scattering = forward + backward;
        const extinction = scattering + absorptionChildren[index];
        assert.ok(scattering >= 0 && scattering <= extinction);
        const g = scattering > 1e-12 ? (forward - backward) / scattering : 0;
        assert.ok(g >= -1 && g <= 1);
    });

    // Production is fail-closed: exact L0 retains a single fine-cell fibre
    // even when the corresponding level-one center would have seen vacuum.
    const thinEightChildBlock = [0, 0, 0, 0, 0, 0, 2.75, 0];
    assert.equal(thinEightChildBlock.filter((value) => value > 0).length, 1);
    assert.equal(thinEightChildBlock.reduce((sum, value) => sum + value, 0), 2.75);

    // The 32-y source reference retains a one-cell shaft and its exact Beer
    // column. Pair-midpoint emulation would either erase or double that shaft.
    const exactExtinction = Array(32).fill(0);
    exactExtinction[13] = 3.2;
    const cellKm = 0.17;
    let transmittance = 1;
    const exactFaces = [];
    for (let y = exactExtinction.length - 1; y >= 0; y--) {
        transmittance *= Math.exp(-exactExtinction[y] * cellKm);
        exactFaces[y] = transmittance;
    }
    close(exactFaces[0], Math.exp(-3.2 * cellKm));
    assert.ok(exactFaces[13] < exactFaces[14]);
    assert.equal(exactExtinction.filter((value) => value > 0).length, 1);
});

test("cloud transport reconstruction preserves silhouettes and optical depth", () => {
    assert.match(shaderSource, /fn cloud_reconstruction_weight\(/);
    assert.match(shaderSource, /fn reconstruct_cloud_transport\(/);
    assert.match(shaderSource, /reference\.w > 0\.002/);
    assert.match(shaderSource,
        /exp\(-abs\(reference\.z - candidate\.z\) \* 2\.4\)/);
    assert.match(shaderSource, /if \(x == 0 && y == 0\) \{ axis_weight = 8\.0; \}/);
    assert.match(shaderSource,
        /let sampled_current = select_composite_transport\([\s\S]*?direct_current,[\s\S]*?reconstruct_cloud_transport[\s\S]*?p\[30\]\.y > 0\.5/);
    assert.match(shaderSource,
        /accumulated_radiance \+= candidate\.radiance \* weight;[\s\S]*?accumulated_transmittance \+= candidate\.transmittance \* weight/);
    assert.doesNotMatch(shaderSource, /sampled_current = \(center \* 4\.0/);
    assert.match(shaderSource, /fn transmittance_edge_weight\(/);
    assert.match(shaderSource,
        /relative_opacity_delta[\s\S]*max\(0\.04, max\(reference_opacity, candidate_opacity\)\)/);
    assert.match(shaderSource,
        /return exp\(-relative_opacity_delta \* 7\.5 - spectral_delta \* 4\.0\)/);
    assert.match(shaderSource, /fn current_cloud_neighborhood\(/);
    assert.match(shaderSource, /vec3<f32>\( 2\.0,  0\.0, 1\.0\)/);
    assert.match(shaderSource, /if \(edge_weight >= 0\.08\)/);
    assert.doesNotMatch(shaderSource, /local_radiance_min|local_radiance_max/);
});

test("WebGPU validation uses the full explicit production cloud resource contract", () => {
    assert.match(validatorSource, /production cloud interval bind group layout/);
    assert.match(validatorSource, /production cloud lighting bind group layout/);
    assert.match(validatorSource, /production cloud transport bind group layout/);
    assert.match(validatorSource, /layout: intervalPipelineLayout/);
    assert.match(validatorSource, /layout: lightingPipelineLayout/);
    assert.match(validatorSource, /layout: cloudPipelineLayout/);
    assert.match(validatorSource,
        /production cloud layer compositor bind group layout/);
    assert.match(validatorSource, /layout: layerCompositorPipelineLayout/);
    assert.match(validatorSource,
        /validation cloud layer packet[\s\S]*?size: \[8, 8, 5\]/);
    assert.match(validatorSource, /production cloud coupling shadow bind group layout/);
    assert.match(validatorSource, /layout: cloudCouplingShadowPipelineLayout/);
    assert.match(validatorSource,
        /entry\(20, readOnlyStorage\(\(1 \+ 36 \* 5\) \* 16\)\)/);
    assert.match(validatorSource, /entry\(23, readOnlyStorage\(67 \* 128\)\)/);
    assert.match(validatorSource,
        /const cloudMacroBindingBuffer = device\.createBuffer\(\{ size: \(1 \+ 36 \* 5\) \* 16/);
    assert.match(validatorSource,
        /const cloudOpticalStateBuffer = device\.createBuffer\(\{ size: 67 \* 128/);
    assert.match(validatorSource, /entry\(30, unfilterable2d\)/);
    assert.match(validatorSource, /entry\(14, sampled2dArray\)/);
    assert.match(validatorSource, /entry\(31, computeWriteOnlyStorage2dArray\)/);
    assert.match(validatorSource, /entry\(34, sharedCloudUniform\)/);
    assert.match(validatorSource,
        /entry\(34, computeUniform\(\s*\$\{directionalCloudVisibilityUniformBytes\}\)\)/);
    assert.match(validatorSource,
        /directionalCouplingAtlas = device\.createTexture\([\s\S]*?size: \[96, 96, 193\]/);
    assert.match(validatorSource,
        /entryPoint: "cloud_coupling_shadow_compute"/);
    assert.match(validatorSource,
        /couplingShadowPass\.dispatchWorkgroups\(48, 48, 6\)/);
    assert.match(validatorSource,
        /cloudMorphologyModifiers = device\.createTexture\([\s\S]*?format: "rgba32float"/);
    assert.doesNotMatch(rendererSource, /cloudLightingPipeline|lightingLayers/);
    assert.match(rendererSource, /binding: 30, resource: cloudMorphologyView/);
    assert.match(morphologyWgslSource,
        /@group\(0\) @binding\(30\)\s*var cloud_morphology_modifiers: texture_2d<f32>/);
});

test("directional coupling compute binds only resources retained by its entry point", () => {
    const rendererStart = rendererSource.indexOf("const couplingShadowBindGroup");
    const rendererEnd = rendererSource.indexOf("const couplingPass", rendererStart);
    const rendererEntries = rendererSource.slice(rendererStart, rendererEnd);
    const validatorLayoutStart = validatorSource.indexOf(
        "production cloud coupling shadow bind group layout",
    );
    const validatorLayoutEnd = validatorSource.indexOf(
        "const cloudCouplingShadowPipelineLayout",
        validatorLayoutStart,
    );
    const validatorLayout = validatorSource.slice(
        validatorLayoutStart,
        validatorLayoutEnd,
    );
    const activeBindings = [0, 1, 2, 3, 5, 16, 17, 18, 19, 20, 23, 24, 25, 30, 31, 34, 36];
    const obsoleteBindings = [4, 15];

    assert.ok(rendererStart >= 0 && rendererEnd > rendererStart);
    assert.ok(validatorLayoutStart >= 0 && validatorLayoutEnd > validatorLayoutStart);
    assert.match(rendererSource,
        /const cloudModule = device\.createShaderModule\(\{\s*code: WEBGPU_CLOUD_COUPLING_SHADER/);
    assert.match(validatorSource,
        /module: modules\.WEBGPU_CLOUD_COUPLING_SHADER,\s*entryPoint: "cloud_coupling_shadow_compute"/);
    for (const binding of activeBindings) {
        assert.match(rendererEntries, new RegExp(`binding: ${binding}\\b`));
        assert.match(validatorLayout, new RegExp(`entry\\(${binding},`));
    }
    for (const binding of obsoleteBindings) {
        assert.doesNotMatch(rendererEntries, new RegExp(`binding: ${binding}\\b`));
        assert.doesNotMatch(validatorLayout, new RegExp(`entry\\(${binding},`));
    }
    assert.match(rendererSource,
        /directional cloud coupling active resource layout/);
    assert.match(rendererSource,
        /layout: cloudCouplingShadowPipelineLayout/);
    assert.match(rendererEntries, /layout: cloudCouplingShadowBindGroupLayout/);
    assert.doesNotMatch(rendererEntries, /getBindGroupLayout\(0\)/);
    assert.match(rendererSource,
        /binding: 17,[\s\S]{0,220}sampleType: "unfilterable-float"/);
    assert.match(validatorLayout, /entry\(17, computeUnfilterable3d\)/);
});

test("cloud and finite-weather pipelines share application-owned explicit layouts", () => {
    assert.match(rendererSource,
        /shared cloud and finite-weather transport group 0/);
    assert.match(rendererSource,
        /shared cloud and finite-weather light-volume group 1/);
    assert.match(rendererSource,
        /const cloudTransportPipelineLayout = device\.createPipelineLayout\(\{[\s\S]*?cloudTransportGroup0Layout,[\s\S]*?cloudTransportGroup1Layout/);
    assert.match(rendererSource,
        /physical cloud layer transport[\s\S]*?layout: cloudTransportPipelineLayout/);
    assert.match(rendererSource,
        /const createSpecializedWeatherPipeline[\s\S]*?layout: cloudTransportPipelineLayout/);
    assert.doesNotMatch(rendererSource,
        /cloudLayerPipelines\[0\]\.getBindGroupLayout/);
    assert.match(validatorSource,
        /const cloudPipelineLayout = device\.createPipelineLayout\(\{[\s\S]*?cloudBindGroupLayout,[\s\S]*?cloudLightViewBindGroupLayout/);
    assert.doesNotMatch(validatorSource,
        /getBindGroupLayout\(0\)[\s\S]{0,180}getBindGroupLayout\(1\)/);

    const between = (source, start, end) => {
        const first = source.indexOf(start);
        const last = source.indexOf(end, first + start.length);
        assert.ok(first >= 0 && last > first, `${start} must precede ${end}`);
        return source.slice(first, last);
    };
    const bindingNumbers = (source, expression) =>
        [...source.matchAll(expression)].map((match) => Number(match[1]));
    const expectedGroup0 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 14,
        15, 16, 17, 18, 32, 19, 20, 21, 22, 23, 24, 25, 26, 28, 29, 30, 34, 35];
    const rendererLayout0 = bindingNumbers(between(rendererSource,
        "const cloudTransportGroup0Layout", "const cloudTransportGroup1Layout"),
    /cloudTransportEntry\((\d+)/g);
    const rendererResources0 = bindingNumbers(between(rendererSource,
        "const cloudBindGroupEntries = [", "const cloudBindGroup ="),
    /binding:\s*(\d+)/g);
    const validatorLayout0 = bindingNumbers(between(validatorSource,
        "const cloudBindGroupEntries = [", "const cloudBindGroupLayout"),
    /entry\((\d+)/g);
    assert.deepEqual(rendererLayout0, expectedGroup0);
    assert.deepEqual(rendererResources0, expectedGroup0);
    assert.deepEqual(validatorLayout0, expectedGroup0);

    const expectedGroup1 = [0, 1, 2];
    const rendererLayout1 = bindingNumbers(between(rendererSource,
        "const cloudTransportGroup1Layout", "const cloudTransportPipelineLayout"),
    /cloudTransportEntry\((\d+)/g);
    const rendererResources1 = bindingNumbers(between(rendererSource,
        "const cloudLightViewEntries = [", "const cloudLightViewBindGroup ="),
    /binding:\s*(\d+)/g);
    const validatorLayout1 = bindingNumbers(between(validatorSource,
        "const cloudLightViewEntries = [", "const cloudLightViewBindGroupLayout"),
    /entry\((\d+)/g);
    assert.deepEqual(rendererLayout1, expectedGroup1);
    assert.deepEqual(rendererResources1, expectedGroup1);
    assert.deepEqual(validatorLayout1, expectedGroup1);
});

test("cloud transport stays below the aggregate WebGPU core sampled-texture limit", () => {
    assert.doesNotMatch(shaderSource,
        /cloud_lighting_layers|cloud_lighting_sampler|cached_lighting/);
    assert.doesNotMatch(rendererSource,
        /cloudLightingPipeline|lightingLayers|lightingPass/);
    assert.match(validatorSource, /const coreMaxSampledTexturesPerShaderStage = 16/);
    assert.match(validatorSource, /const cloudFragmentSampledTextureCount =/);
    assert.match(validatorSource,
        /cloudFragmentSampledTextureCount > coreMaxSampledTexturesPerShaderStage/);
    assert.match(validatorSource,
        /aggregate cloud fragment sampled-texture core limit/);
});

test("upper-atmosphere morphology uses curved finite shells and physical transport", () => {
    assert.match(shaderSource, /fn march_upper_atmosphere\(/);
    assert.match(shaderSource, /fn upper_record_interval\(/);
    assert.match(shaderSource, /hydrometeor_altitude_interval\(/);
    assert.match(shaderSource, /sphere_hits\(origin, direction, PLANET_RADIUS \+ 0\.0001\)/);
    assert.match(shaderSource, /UPPER_ATMOSPHERE_FAR_LIMIT: f32 = 1300\.0/);
    assert.match(shaderSource, /CLOUD_MORPHOLOGY_OP_ADD_UPPER_WAVE_SHEET/);
    assert.match(shaderSource, /morphology\.material_weight/);
    assert.match(shaderSource, /upper_material_extinction_km\(/);
    assert.match(shaderSource, /upper_nacreous_spectral_response\(/);
    assert.match(shaderSource, /upper_rayleigh_phase\(/);
    assert.match(shaderSource, /physical_source_irradiance_at\(0u, point\)/);
    assert.match(cloudShaderSource, /fn ordered_upper_weather_sample\(/);
    assert.match(cloudShaderSource, /fn ordered_upper_owner_material\(/);
    assert.match(experimentalCloudFragment, /ordered_all_weather_sample\(/);
    assert.match(experimentalCloudFragment,
        /let material = ordered_upper_owner_material\(owner\)/);
    assert.match(experimentalCloudFragment, /upper_record_interval\(/);
    assert.match(experimentalCloudFragment, /upper_record_step_km\(/);
    assert.doesNotMatch(experimentalCloudFragment, /&upper_intervals/);
    assert.doesNotMatch(experimentalCloudFragment, /&upper_profiles/);
    assert.doesNotMatch(experimentalCloudFragment,
        /upper_intervals: array<vec2<f32>, 36>/);
    assert.doesNotMatch(experimentalCloudFragment, /march_upper_atmosphere\(/);
    assert.doesNotMatch(productionCloudFragment, /ordered_upper_weather_sample\(/);
    assert.doesNotMatch(productionCloudFragment, /march_upper_atmosphere\(/);
    assert.doesNotMatch(shaderSource, /let noctilucent = p\[22\]\.w/);
    assert.match(rendererSource, /hasUpperAtmosphericCloud/);
});

test("experimental transport retains unified finite-media event integration", () => {
    assert.match(experimentalCloudFragment,
        /for \(var iteration = 0; iteration < 856; iteration \+= 1\)/);
    assert.match(experimentalCloudFragment, /actual_steps >= 512\.0/);
    assert.match(experimentalCloudFragment,
        /let clear_gap = ordered_clear_atmosphere_segment\(/);
    assert.match(experimentalCloudFragment,
        /var weather = ordered_all_weather_sample\(/);
    assert.match(experimentalCloudFragment,
        /var air = ordered_atmosphere_source_sample\([\s\S]*?true\)/);
    assert.match(experimentalCloudFragment,
        /air\.extinction_rgb_per_km \+ weather\.extinction_rgb_per_km/);
    assert.match(experimentalCloudFragment,
        /air\.source_radiance_coefficient_rgb_per_km \+[\s\S]*?weather\.source_coefficient_rgb_per_km/);
    assert.match(experimentalCloudFragment,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.source_radiance_coefficient_rgb_per_km/);
    assert.doesNotMatch(experimentalCloudFragment,
        /let clear_segment = integrate_camera_transport_coefficients\([\s\S]*?air\.unshadowed_source_radiance_coefficient_rgb_per_km/);
    assert.match(experimentalCloudFragment,
        /weather_transmittance \*= weather_step_transmittance/);
    assert.match(experimentalCloudFragment,
        /relative_weather_transport\([\s\S]*?weather_transmittance/);
    assert.match(experimentalCloudFragment, /maximum_tau <= 0\.2/);
    assert.doesNotMatch(experimentalCloudFragment, /march_layer\(/);
    assert.doesNotMatch(experimentalCloudFragment, /march_hydrometeors\(/);
    assert.doesNotMatch(experimentalCloudFragment,
        /finite_atmosphere_to_sample\(/);
});

test("experimental transport skips clear gaps between finite world owners", () => {
    assert.match(cloudShaderSource, /fn ordered_cloud_system_interval\(/);
    assert.match(cloudShaderSource, /fn ordered_local_support_interval\(/);
    assert.match(experimentalCloudFragment,
        /let owner_support = ordered_cloud_system_interval\(/);
    assert.match(experimentalCloudFragment,
        /layer_owner_counts\[layer_index\] \+= 1u/);
    assert.match(experimentalCloudFragment,
        /for \(var owner = 0u; owner < 36u; owner \+= 1u\)/);
    assert.doesNotMatch(experimentalCloudFragment, /cloud_event_intervals/);
    assert.doesNotMatch(experimentalCloudFragment, /cloud_event_step_targets/);
    assert.doesNotMatch(experimentalCloudFragment, /layer_step_targets/);
});

test("experimental event transport streams finite records without large private arrays", () => {
    assert.doesNotMatch(productionCloudFragment,
        /array<vec2<f32>, (?:36|40|96)>/);
    assert.doesNotMatch(productionCloudFragment,
        /array<(?:f32|u32), (?:36|40|96)>/);
    assert.doesNotMatch(compiledCloudShaderSource,
        /array<vec2<f32>, (?:36|40|96)>/);
    assert.doesNotMatch(compiledCloudShaderSource,
        /array<(?:f32|u32), (?:36|40|96)>/);
    assert.doesNotMatch(cloudShaderSource,
        /fn ordered_hydrometeor_weather_sample[\s\S]*?ptr<function, array<vec2<f32>, 96>>/);
    assert.doesNotMatch(cloudShaderSource,
        /fn ordered_upper_weather_sample[\s\S]*?ptr<function, array<(?:vec2<f32>|u32), 36>>/);
    assert.match(cloudShaderSource,
        /struct OrderedActiveSet \{\s*records_0_31: u32,\s*records_32_63: u32,\s*records_64_95: u32,\s*records_96_127: u32,\s*records_128_159: u32,\s*records_160_191: u32,/);
    assert.match(cloudShaderSource, /fn ordered_active_contains\(/);
    assert.match(experimentalCloudFragment,
        /var active_set = empty_ordered_active_set\(\)/);
    assert.match(experimentalCloudFragment, /var event_dirty = true/);
    assert.match(experimentalCloudFragment,
        /if \(event_dirty\) \{[\s\S]*?active_set = empty_ordered_active_set\(\)[\s\S]*?event_dirty = false;/);
    assert.match(experimentalCloudFragment,
        /var step_length = min\(\s*segment_step_target, max\(0\.0, segment_end - travelled\)\)/);
    assert.match(experimentalCloudFragment,
        /ordered_all_weather_sample\([\s\S]*?&layer_placements,[\s\S]*?active_set,/);
    assert.match(experimentalCloudFragment,
        /let record = hydrometeor_fields\.records\[index\][\s\S]*?hydrometeor_record_interval\(/);
    assert.match(experimentalCloudFragment,
        /ordered_upper_owner_material\(owner\)[\s\S]*?upper_record_interval\(/);
    assert.match(experimentalCloudFragment, /max\(1e-8, weather_extinction_y\)/);
    assert.match(experimentalCloudFragment, /safe_contribution_weight/);
    assert.match(experimentalCloudFragment,
        /weather = sanitize_ordered_weather_sample\(weather\)/);
    assert.match(experimentalCloudFragment,
        /if \(finite_rgb\(weather_transport\.transmittance\)\)/);
    assert.match(experimentalCloudFragment,
        /if \(finite_rgb\(weather_transport\.radiance\)\)/);
    assert.match(cloudShaderSource,
        /fn integrate_camera_transport_coefficients[\s\S]*?finite_rgb\(extinction_rgb_per_km\)/);
    assert.match(cloudShaderSource,
        /fn cloud_spectral_extinction_coefficient_from_material[\s\S]*?if \(!finite_rgb\(resolved\)\)/);
});

test("ordered samples evaluate only the cached active records", () => {
    const hydrometeors = cloudShaderSource.match(
        /fn ordered_hydrometeor_weather_sample[\s\S]*?fn ordered_upper_owner_material/,
    )?.[0] ?? "";
    const upper = cloudShaderSource.match(
        /fn ordered_upper_weather_sample[\s\S]*?fn ordered_layer_interval/,
    )?.[0] ?? "";
    assert.match(hydrometeors,
        /if \(!ordered_active_contains\(active_set, 40u \+ index\)\) \{ continue; \}/);
    assert.doesNotMatch(hydrometeors, /hydrometeor_record_interval\(/);
    assert.match(upper,
        /if \(!ordered_active_contains\(active_set, 136u \+ owner\)\) \{ continue; \}/);
    assert.doesNotMatch(upper, /upper_record_interval\(/);
    assert.match(cloudShaderSource,
        /fn density_at_active\([\s\S]*?density_at_filtered\(point, layer, index, true, active_set\)/);
    assert.match(cloudShaderSource,
        /matched_owner = 1\.0;\s*if \(restrict_to_active &&\s*!ordered_active_contains\(active_set, u32\(slot\)\)\) \{ continue; \}/);
    assert.match(cloudShaderSource,
        /restrict_to_active &&\s*!ordered_active_contains\(active_set, 36u \+ u32\(max\(0, index\)\)\)/);
});

test("each specialized production pass uses the same physical camera ray", () => {
    assert.match(productionLayerShaderSource,
        /let direction = view_direction\(input\.uv\)/);
    assert.doesNotMatch(productionLayerShaderSource,
        /view_direction\(cloud_composition_uv/);
});

test("production compiles one dynamically indexed full marcher pipeline", () => {
    assert.match(cloudShaderSource, /struct LayerPacket \{/);
    assert.match(shaderSource,
        /@builtin\(instance_index\) production_layer_index: u32/);
    assert.match(productionLayerShaderSource,
        /input\.production_layer_index/);
    assert.match(productionLayerShaderSource,
        /production_layer_packet\([\s\S]*?input\.uv, layer_index,/);
    assert.doesNotMatch(productionLayerShaderSource,
        /var packets: array<LayerPacket, 3>/);
    assert.doesNotMatch(productionLayerShaderSource,
        /cloud_fragment_physical_layers/);
    const packetStart = cloudShaderSource.indexOf("fn production_layer_packet(");
    const packetEnd = cloudShaderSource.indexOf(
        "fn layer_packet_precedes(", packetStart);
    const productionPacket = cloudShaderSource.slice(packetStart, packetEnd);
    assert.match(productionPacket, /let marched = march_layer\(/);
    assert.doesNotMatch(productionPacket, /finite_atmosphere_to_sample/);
    assert.doesNotMatch(productionPacket,
        /camera_transport_through_foreground_air/);
    assert.match(shaderSource,
        /withoutWgslSection\([\s\S]*?World-space source-aligned cascades[\s\S]*?fn lighting_for_layer/);
});

test("renderer and validator use specialized layer transport plus a tiny compositor", () => {
    assert.ok(productionCloudStart >= 0);
    assert.ok(experimentalCloudStart > productionCloudStart);
    for (const source of [rendererSource, validatorSource]) {
        assert.match(source, /entryPoint: "cloud_fragment_physical_layer"/);
        assert.match(source, /entryPoint: "cloud_layer_composite_fragment"/);
        assert.doesNotMatch(source,
            /entryPoint: "cloud_fragment_physical_layers"/);
    }
    assert.match(rendererSource,
        /packetLayer < 3 \? packetLayer : 0/);
    assert.doesNotMatch(rendererSource,
        /constants: \{ production_layer_index/);
    assert.doesNotMatch(validatorSource,
        /constants: \{ production_layer_index/);
    assert.match(rendererSource, /pipelines-cloud-physical-layer-transport/);
    assert.match(rendererSource, /pipeline-cloud-layer-compositor/);
    assert.doesNotMatch(rendererSource, /pipeline-cloud-ordered-transport/);
    assert.doesNotMatch(rendererSource,
        /entryPoint: "cloud_fragment_ordered_experimental"/);
});

test("paused strict transport bounds every queue submission without changing pixels", () => {
    assert.match(rendererSource,
        /createCloudTransportRasterSchedule\(\s*cloudWidth,\s*cloudHeight,\s*adapterInfo/);
    assert.match(rendererSource,
        /createCloudTransportRasterSubmission\([\s\S]*?transaction\.cursor,[\s\S]*?transaction\.tiles,[\s\S]*?transaction\.maximumPixelsPerSubmission/);
    assert.match(rendererSource,
        /for \(const batch of submission\.batches\)[\s\S]*?encodePacketPass\([\s\S]*?batch\.packetIndex,[\s\S]*?batch\.tiles,[\s\S]*?batch\.clearPacket/);
    assert.match(rendererSource,
        /for \(const tile of tiles\)[\s\S]*?setScissorRect\([\s\S]*?packetPass\.draw\([\s\S]{0,160}?3,/);
    assert.match(rendererSource,
        /loadOp: clearPacket \? "clear" : "load"/);
    assert.match(rendererSource,
        /if \(!submission\.terminalCommit\)[\s\S]*?device\.queue\.submit\(\[encoder\.finish\(\)\]\)[\s\S]*?armStrictCloudTransportSubmissionFence\([\s\S]*?return;/);
    assert.match(rendererSource,
        /device\.queue\.onSubmittedWorkDone\(\)\.then\([\s\S]*?window\.setTimeout\([\s\S]*?draw\(performance\.now\(\), true\)/);
    assert.match(rendererSource,
        /strictCloudTransportTransaction = null;[\s\S]*?transportedCloud = true;[\s\S]*?const cloudLayerCompositorBindGroup/);
    assert.match(rendererSource,
        /cloudTransportDispatchMode = current\.paused[\s\S]*?`strict-\$\{strictTransportReportingSchedule!\.backend\}`/);
    assert.match(rendererSource,
        /cloudTransportDrawPixelCeiling = current\.paused/);
    assert.match(rendererSource,
        /cloudTransportSubmissionPixelCeiling =\s*current\.paused/);
    assert.match(rendererSource,
        /transport-submit-\$\{captureTrace\}/);
    assert.match(rendererSource,
        /transport-fence-complete-\$\{captureTrace\}/);
    assert.match(rendererSource,
        /strictCloudTransportSubmissionPending \|\|[\s\S]*?strictCloudTransportContinuationTimer !== undefined \|\|[\s\S]*?strictCloudTransportTransaction !== null\) \{[\s\S]{0,500}?return;/);
    assert.match(rendererSource,
        /strictCloudTransportTransaction[\s\S]*?frozenWeatherScene[\s\S]*?strictCloudTransportTransaction[\s\S]*?frozenParameters/);
    assert.match(rendererSource,
        /cloudTransportTransactionIdentityMatches\([\s\S]*?cancelStrictCloudTransport\(\)/);
});

test("layer compositor depth-sorts scalar affine operators and preserves the raw ABI", () => {
    assert.match(productionLayerCompositorSource,
        /var first = decode_layer_packet\(pixel, 0\)/);
    assert.match(productionLayerCompositorSource,
        /var second = decode_layer_packet\(pixel, 1\)/);
    assert.match(productionLayerCompositorSource,
        /var third = decode_layer_packet\(pixel, 2\)/);
    assert.match(productionLayerCompositorSource,
        /var fourth = decode_layer_packet\(pixel, 3\)/);
    assert.match(productionLayerCompositorSource,
        /var fifth = decode_layer_packet\(pixel, 4\)/);
    assert.equal((productionLayerCompositorSource.match(
        /if \(layer_packet_precedes\(/g) ?? []).length, 10);
    assert.doesNotMatch(productionLayerCompositorSource,
        /array<LayerPacket/);
    assert.match(productionLayerCompositorSource,
        /@location\(0\) radiance: vec4<f32>/);
    assert.match(productionLayerCompositorSource,
        /@location\(3\) motion: vec4<f32>/);
    assert.match(rendererSource,
        /CLOUD_LAYER_PACKET_BYTES_PER_PIXEL = 5 \* 3 \* 8/);
    assert.match(rendererSource,
        /createCloudLayerPacketTexture[\s\S]*?size: \[cloudWidth, cloudHeight, 5\]/);
    assert.match(rendererSource,
        /cloudLayerRadianceFirstDepth\?\.destroy\(\)/);
    assert.match(rendererSource,
        /const cloudBindGroup = device\.createBindGroup\(\{[\s\S]*?layout: cloudTransportGroup0Layout/);
    assert.match(rendererSource,
        /const cloudLightViewBindGroup = device\.createBindGroup\(\{[\s\S]*?layout: cloudTransportGroup1Layout/);
    assert.match(rendererSource,
        /packetTargets\.map\([\s\S]*?baseArrayLayer: packetLayer/);
    assert.match(rendererSource, /hydrometeor_fragment_physical/);
    assert.match(rendererSource, /upper_atmosphere_fragment_physical/);
    assert.match(shaderSource, /withoutWgslBlockComments\(/);
});

test("ordered hydrometeors retain record-local passive parent lighting", () => {
    const orderedHydrometeors = cloudShaderSource.match(
        /fn ordered_hydrometeor_weather_sample[\s\S]*?fn ordered_upper_weather_sample/,
    )?.[0] ?? "";
    assert.match(orderedHydrometeors,
        /cloud_lv_sample_owner_direct_transmittance\(/);
    assert.match(orderedHydrometeors,
        /cloud_lv_sample_owner_scattering_radiance\(/);
    assert.match(orderedHydrometeors,
        /hydrometeor_resolve_passive_source_coefficient\(/);
    assert.match(orderedHydrometeors,
        /hydrometeor_accumulate_passive_overlap\(/);
    assert.doesNotMatch(orderedHydrometeors,
        /hydrometeor_multiple_scattering\(/);
    assert.doesNotMatch(orderedHydrometeors,
        /coupling_cloud_source_transmittance_at\(/);
});

test("cloud lighting uses positive directional atmosphere coupling and finite transport", () => {
    assert.match(shaderSource, /physicalAtmosphereConsumerWgsl/);
    assert.match(shaderSource, /irradianceBinding: 33/);
    assert.match(shaderSource,
        /@group\(0\) @binding\(14\) var directional_coupling_atlas: texture_2d_array<f32>/);
    assert.match(shaderSource, /DIRECTIONAL_ATMOSPHERE_CLOUD_LIGHTING_WGSL/);
    assert.match(shaderSource, /fn coupling_profile_phase_integral/);
    assert.match(cloudShaderSource,
        /cloud_sample_directional_sky_band_cache\([\s\S]*sun_optics\.asymmetry/);
    assert.doesNotMatch(cloudShaderSource,
        /cloud_sample_directional_sky_band_cache\([\s\S]{0,240}vec3<f32>\(0\.62\)/);
    assert.match(shaderSource, /fn physical_diffuse_irradiance_at/);
    assert.match(shaderSource, /fn physical_lower_atmosphere_irradiance_at/);
    assert.match(shaderSource, /coupling_profile_hemisphere_irradiance\(/);
    assert.match(shaderSource, /fn physical_source_irradiance_at/);
    assert.match(shaderSource, /atmo_source_radiance_radius\(source_index\)/);
    assert.match(shaderSource, /atmo_source_solid_angle\(source\.w\)/);
    assert.match(shaderSource, /atmo_source_direction\(0u\)/);
    assert.match(shaderSource, /atmo_source_direction\(1u\)/);
    assert.match(shaderSource, /fn finite_atmosphere_to_sample/);
    assert.match(shaderSource, /coupling_aerial_source\(/);
    assert.match(shaderSource, /coupling_integrate_aerial_step\(/);
    assert.match(shaderSource, /coupling_cloud_shadowed_ground_bounce\(/);
    assert.match(rendererSource,
        /physicalAtmosphere\.bindings[\s\S]*?directionalCouplingAtlasView/);
    assert.match(rendererSource, /physicalAtmosphere\.bindings\.multipleScatteringView/);
    assert.match(rendererSource, /physicalAtmosphere\.bindings\.uniformBuffer/);
    assert.doesNotMatch(shaderSource, /var atmosphere_lut:/);
    assert.doesNotMatch(shaderSource, /var atmosphere_irradiance_texture:/);
    assert.doesNotMatch(cloudShaderSource, /p\[(15|16|17|18|33|34)\]/);
});

test("production lighting partitions are inspectable without changing final transport", () => {
    for (const view of [
        "lighting-direct-sun",
        "lighting-exterior-diffuse",
        "lighting-p1-cache",
        "lighting-atmosphere-composite",
        "lighting-source-higher-order",
        "lighting-atmosphere-shadow-loss",
    ]) {
        assert.match(rendererTypesSource, new RegExp(`\\| "${view}"`));
        assert.match(cloudPhotographBenchmarkSource, new RegExp(`"${view}"`));
    }
    assert.match(rendererSource, /"lighting-direct-sun": 9/);
    assert.match(rendererSource, /"lighting-exterior-diffuse": 10/);
    assert.match(rendererSource, /"lighting-p1-cache": 11/);
    assert.match(rendererSource, /"lighting-atmosphere-composite": 12/);
    assert.match(rendererSource, /"lighting-source-higher-order": 13/);
    assert.match(rendererSource, /"lighting-atmosphere-shadow-loss": 14/);
    assert.match(rendererSource,
        /lightingDebugPartition:[\s\S]{0,300}options\.debugView === "lighting-direct-sun"[\s\S]{0,500}: "production"/);
    assert.match(cloudPhotographBenchmarkSource,
        /const RENDERER_DEBUG_VIEWS: readonly SkyDebugView\[\]/);
    assert.match(cloudPhotographBenchmarkSource,
        /data-cloud-debug-view=\{debugView\}/);
    assert.match(cloudPhotographBenchmarkSource,
        /RENDERER_DEBUG_VIEWS\.map\(\(value\) =>/);

    assert.match(cloudShaderSource, /fn cloud_lighting_debug_source\(/);
    assert.match(cloudShaderSource,
        /if \(debug_view == 9\) \{ return max\(vec3<f32>\(0\.0\), direct_sun_radiance\); \}/);
    assert.match(cloudShaderSource,
        /if \(debug_view == 10\) \{[\s\S]{0,120}exterior_diffuse_radiance/);
    assert.match(cloudShaderSource,
        /if \(debug_view == 11\) \{ return max\(vec3<f32>\(0\.0\), p1_cache_radiance\); \}/);
    assert.match(cloudShaderSource,
        /if \(debug_view == 13\) \{[\s\S]{0,120}source_higher_order_radiance/);
    assert.match(cloudShaderSource, /return production_radiance;/);

    const sheetLighting = cloudShaderSource.match(
        /fn sheet_node_source_radiance\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    const volumeLighting = cloudShaderSource.match(
        /fn march_layer\([\s\S]*?\n\}/,
    )?.[0] ?? "";
    for (const lightingPath of [sheetLighting, volumeLighting]) {
        assert.match(lightingPath, /light_volume_direct_sun/);
        assert.match(lightingPath, /exterior_diffuse_reference/);
        assert.match(lightingPath, /light_volume_p1/);
        assert.match(lightingPath, /source_higher_order_reference/);
        assert.match(lightingPath, /needs_source_higher_order_reference/);
        assert.match(lightingPath, /cloud_lighting_debug_source\(/);
    }

    assert.match(finalCompositeShaderSource,
        /if \(debug_view == 9 \|\| debug_view == 10 \|\| debug_view == 11 \|\|[\s\S]{0,60}debug_view == 13\) \{[\s\S]{0,100}radiance = cloud\.radiance/);
    assert.match(finalCompositeShaderSource,
        /if \(debug_view == 12\) \{[\s\S]{0,140}radiance = cloud_scattering \+ background \* cloud_transmittance/);
    assert.match(shaderSource,
        /if \(i32\(round\(p\[22\]\.y\)\) == 14\) \{[\s\S]{0,100}return vec4<f32>\(shadow_loss, 1\.0\)/);
    assert.match(finalCompositeShaderSource,
        /if \(debug_view == 14\) \{ radiance = background; \}/);
    assert.match(rendererSource,
        /debugPartition: debugView === "lighting-atmosphere-shadow-loss"[\s\S]{0,100}: "production"/);
    assert.match(rendererSource,
        /current\.options\.debugView !==[\s\S]{0,80}"lighting-atmosphere-shadow-loss"[\s\S]{0,100}moon\.visible/);
    assert.match(finalCompositeShaderSource,
        /var radiance = cloud_scattering \+ background \* cloud_transmittance \+\s*stellar_core \+ stellar_psf/);
});

test("atmosphere render bind group supplies every retained physical LUT", () => {
    const bindGroupStart = rendererSource.indexOf("const atmosphereBindGroup");
    const bindGroupEnd = rendererSource.indexOf(
        "const backgroundPass", bindGroupStart);
    assert.ok(bindGroupStart >= 0 && bindGroupEnd > bindGroupStart,
        "atmosphere render bind group must remain inspectable");
    const bindGroupSource = rendererSource.slice(bindGroupStart, bindGroupEnd);
    assert.match(bindGroupSource,
        /binding: 0,[\s\S]*?buffer: parameterBuffer/);
    assert.match(bindGroupSource,
        /binding: 1,[\s\S]*?physicalAtmosphere\.bindings\.uniformBuffer/);
    assert.match(bindGroupSource,
        /binding: 2,[\s\S]*?physicalAtmosphere\.bindings\.transmittanceView/);
    assert.match(bindGroupSource,
        /binding: 3,[\s\S]*?physicalAtmosphere\.bindings[\s\S]*?\.multipleScatteringView/);
    assert.match(bindGroupSource,
        /binding: 4,[\s\S]*?physicalAtmosphere\.bindings\.skyView/);
    assert.match(bindGroupSource,
        /binding: 6,[\s\S]*?physicalAtmosphere\.bindings\.sampler/);
    assert.match(bindGroupSource,
        /binding: 7,[\s\S]*?directionalCouplingAtlasView/);
    assert.match(bindGroupSource,
        /binding: 34,[\s\S]*?directionalCloudVisibilityUniformBuffer/);
});

test("cloud shadows couple into clouds and clear atmosphere through bounded world cascades", () => {
    assert.match(shaderSource,
        /@group\(0\) @binding\(31\) var directional_coupling_atlas_output/);
    assert.match(shaderSource, /fn cloud_coupling_shadow_compute\(/);
    assert.match(shaderSource, /struct DirectionalCloudVisibilityUniform/);
    assert.match(shaderSource, /@group\(0\) @binding\(34\) var<uniform>/);
    assert.match(shaderSource, /COUPLING_SHADOW_DEPTH_KNOT_COUNT/);
    assert.match(shaderSource, /fn coupling_cloud_source_visibility_at\(/);
    assert.match(shaderSource, /fn coupling_cloud_source_transmittance_at\(/);
    assert.match(shaderSource,
        /fn coupling_cloud_source_aerial_transmittance_at\([\s\S]*?far_cascade = COUPLING_SHADOW_CASCADE_COUNT - 1u[\s\S]*?coupling_cascade_visibility_at\(/);
    assert.doesNotMatch(shaderSource,
        /fn coupling_cloud_source_optical_depth_at\(/,
        "prefiltered visibility must not be converted back to tau before reconstruction");
    assert.match(shaderSource, /fn cloud_spectral_extinction_coefficient_at\(/);
    assert.match(shaderSource, /@compute @workgroup_size\(2, 2, 32\)/);
    assert.match(shaderSource, /var<workgroup> coupling_tau_scan_a/);
    assert.match(shaderSource, /COUPLING_GL_NODES/);
    assert.match(shaderSource,
        /plane_center_pairs: array<vec4<f32>, 3>/);
    assert.match(shaderSource,
        /fn coupling_visibility_depth_at_unit\(/);
    assert.match(shaderSource,
        /fn coupling_visibility_unit_at_depth\(/);
    assert.doesNotMatch(shaderSource,
        /receiver_distance_km = length\(relative\)/,
        "source-aligned visibility cannot select camera-centred radial shells");
    assert.match(shaderSource,
        /fn coupling_visibility_cascade_importance\([\s\S]*?plane - coupling_visibility_plane_center[\s\S]*?return max\(abs\(local_plane\.x\), abs\(local_plane\.y\)\)/);
    assert.match(shaderSource,
        /smoothstep\(\s*COUPLING_SHADOW_BLEND_MINIMUM,\s*COUPLING_SHADOW_BLEND_MAXIMUM, normalized_importance\)/);
    assert.match(shaderSource,
        /if \(blend_amount > 0\.0 && next_importance <= 1\.0\)/);
    assert.doesNotMatch(shaderSource, /source_most_occluder_depth/);
    assert.doesNotMatch(shaderSource, /behind_occluder/);
    assert.match(shaderSource, /fn cloud_shadowed_atmosphere_loss\(/);
    assert.match(shaderSource,
        /const COUPLING_AERIAL_SHADOW_INTERVAL_COUNT: u32 =\s*\$\{DIRECTIONAL_CLOUD_AERIAL_SHADOW_INTERVAL_COUNT\}u/);
    assert.match(shaderSource,
        /const COUPLING_AERIAL_SHADOW_GL_NODE: f32 =\s*\$\{DIRECTIONAL_CLOUD_AERIAL_SHADOW_GAUSS_NODE\}/);
    assert.match(shadowedAtmosphereWgslSource,
        /struct CloudShadowedAtmosphereSample/);
    assert.match(shadowedAtmosphereWgslSource,
        /fn cloud_shadowed_atmosphere_sample\([\s\S]*removed_source_coefficient/);
    assert.match(shadowedAtmosphereWgslSource,
        /cloud_shadowed_atmosphere_sample\([\s\S]*?coupling_cloud_source_aerial_transmittance_at\(/,
        "the long atmosphere solve must not reveal near/middle cascade surfaces");
    assert.match(shadowedAtmosphereWgslSource,
        /fn cloud_clear_segment_to_point_transmittance\([\s\S]*origin_boundary_transmittance[\s\S]*point_to_space[\s\S]*atmo_safe_div/,
    "camera-to-node transfer must use the exact same-ray LUT quotient");
    assert.match(shadowedAtmosphereWgslSource,
        /let origin_boundary_transmittance = atmo_transmittance_to_space\(\s*start_world, boundary_direction\)[\s\S]*cloud_shadowed_atmosphere_loss_interval\([\s\S]*origin_boundary_transmittance/,
    "the invariant camera boundary lookup must be shared by every loss node");
    assert.match(shadowedAtmosphereWgslSource,
        /fn cloud_shadowed_atmosphere_loss_node\([\s\S]*camera_transfer \* sample\.removed_source_coefficient/,
    "removed source must be weighted at its own camera depth");
    assert.match(shadowedAtmosphereWgslSource,
        /fn cloud_shadowed_atmosphere_loss_interval\([\s\S]*COUPLING_AERIAL_SHADOW_KRONROD_BASE_WEIGHT[\s\S]*sample_a\.loss_integrand \+ sample_b\.loss_integrand/,
    "adaptive refinement must retain the embedded base nodes");
    assert.match(shaderSource,
        /COUPLING_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT: u32 =\s*\$\{DIRECTIONAL_CLOUD_AERIAL_SHADOW_MAXIMUM_SAMPLE_COUNT\}u/);
    assert.doesNotMatch(shadowedAtmosphereWgslSource,
        /let removed_source = max\(vec3<f32>\(0\.0\),\s*\(sample_a\.removed_source_coefficient|removed_source \* \(vec3<f32>\(1\.0\) - step_transmittance\)/,
    "a sampled source coefficient cannot be promoted across a whole interval");
    assert.doesNotMatch(shadowedAtmosphereWgslSource,
        /\(sample_a\.extinction \* weight_a[\s\S]*sample_b\.extinction \* weight_b\) \/ step_length/,
    "the pointwise kernel cannot reconstruct interval-average extinction");
    assert.match(shaderSource,
        /let ground_throughput = cloud_clear_segment_to_point_transmittance\([\s\S]*removed_radiance \+= ground_throughput/,
    "ground loss must use exact full camera-path throughput");
    assert.doesNotMatch(shaderSource,
        /let count = 16u;[\s\S]{0,500}mix\(t0, t1, 0\.35\)/);
    assert.match(shaderSource,
        /let shadow_loss = cloud_shadowed_atmosphere_loss\(atmosphere_view\)/);
    assert.match(shaderSource,
        /let physical = max\(vec3<f32>\(0\.0\), clear_physical -[\s\S]*min\(clear_physical, shadow_loss\)\)/);
    assert.match(shaderSource,
        /if \(debug_view == 7\) \{ radiance = cloud\.radiance; \}/);
    assert.match(rendererSource, /cloud source-shadow coupling cascades/);
    assert.match(rendererSource,
        /binding: 31,[\s\S]*?directionalCouplingAtlasStorageView/);
    assert.match(rendererSource,
        /binding: 34,[\s\S]*?directionalCloudVisibilityUniformBuffer/);
    assert.match(rendererSource,
        /binding: 7,[\s\S]*?directionalCouplingAtlasView/);
    assert.match(rendererSource,
        /binding: 2,[\s\S]*?physicalAtmosphere\.bindings\.transmittanceView/);
    assert.match(cloudShaderSource,
        /physical_source_irradiance_at\(0u, point\) \*[\s\S]{0,180}coupling_cloud_source_transmittance_at\([\s\S]{0,120}atmosphere_point, 0u\)/);
    assert.match(cloudShaderSource,
        /fn upper_material_source\([\s\S]{0,500}coupling_cloud_source_transmittance_at\(atmosphere_point, 0u\)/);
});

test("one photographic exposure is applied after sky, clouds and celestial light compose", () => {
    assert.match(rendererSource, /radiance\.solarTopOfAtmosphereIrradiance/);
    assert.match(rendererSource, /radiance\.moonTopOfAtmosphereIrradiance/);
    assert.doesNotMatch(rendererSource, /moonTransmittance\[index\]/);
    assert.match(rendererSource,
        /setVector\(data, 29, \[[\s\S]*?lightSteps,[\s\S]*?radiance\.adaptationExposure,[\s\S]*?cloudWidth[\s\S]*?cloudHeight,[\s\S]*?\]\)/);
    assert.match(rendererSource,
        /setVector\(data, 25, \[[\s\S]*?moon\.opacity,[\s\S]*?\]\)/);
    assert.match(rendererSource,
        /setVector\(data, 27, \[[\s\S]*?moon\.radianceContract\.commonExposureScale,[\s\S]*?\]\)/);
    assert.match(shaderSource, /fn aces_fitted_luminance\(/);
    assert.match(shaderSource, /fn photographic_tonemap\(/);
    assert.match(shaderSource,
        /clamp\(exposure_multiplier, 0\.01, 100000\.0\)/);
    assert.match(shaderSource, /photographic_tonemap\(radiance, p\[29\]\.y\)/);
    assert.equal((shaderSource.match(/p\[29\]\.y/g) ?? []).length, 1);
    assert.match(shaderSource, /debug_view == 0 \|\| debug_view == 7/);
    assert.match(shaderSource, /celestial_lunar_surface\(/);
    assert.match(shaderSource,
        /celestial_calibrated_lunar_profile_radiance\([\s\S]{0,180}p\[13\]\.rgb,[\s\S]{0,80}p\[12\]\.rgb/);
    assert.match(shaderSource,
        /let atmosphere_transfer = select\([\s\S]{0,220}atmo_transmittance_to_space\(/);
    assert.doesNotMatch(shaderSource, /surface\.toa_radiance \* p\[50\]\.w/);
    assert.doesNotMatch(shaderSource, /source_radiance \*[\s\S]{0,120}p\[52\]\.z/);
    assert.match(rendererSource,
        /color: \{ srcFactor: "one", dstFactor: "one", operation: "add" \}/);
    assert.doesNotMatch(rendererSource, /moon\.opacity \* moon\.exposure/);
    assert.doesNotMatch(shaderSource, /exp2\(clamp\(exposure_multiplier/);
    assert.doesNotMatch(shaderSource, /cloud\.rgb \* 0\.16/);
});

test("finite Sun and calibrated Moon share one boundary and atmosphere transfer", () => {
    assert.match(rendererSource,
        /setVector\(data, 10, \[[\s\S]*?sun\.topOfAtmosphereIrradianceRgb,[\s\S]*?sun\.angularRadiusRadians/);
    assert.match(rendererSource,
        /setVector\(data, 11, \[[\s\S]*?sun\.limbDarkening,[\s\S]*?sun\.solidAngleSteradians/);
    assert.match(rendererSource,
        /normalizedDiscPlaneIntegralRgb:[\s\S]*?srgbChannelToLinear/);
    assert.match(rendererSource,
        /integrateAnalyticLunarDiscProfileSolidAngle\(/);
    assert.match(shaderSource,
        /fn physical_resolved_sun_disc\([\s\S]*?celestial_sun_disc_radiance\([\s\S]*?atmo_transmittance_to_space\(/);
    assert.match(shaderSource,
        /physical_resolved_sun_disc\(view, atmosphere_view\)/);
    assert.match(shaderSource,
        /resolved_lunar_boundary_coverage\(view\)/);
    assert.match(shaderSource,
        /WEBGPU_MOON_SHADER[\s\S]*?physicalAtmosphereConsumerWgsl\(\{ group: 1 \}\)/);
    assert.match(rendererSource,
        /moonPipeline\.getBindGroupLayout\(1\)[\s\S]*?binding: 0,[\s\S]*?uniformBuffer[\s\S]*?binding: 1,[\s\S]*?transmittanceView[\s\S]*?binding: 5,[\s\S]*?sampler/);
    assert.match(validatorSource,
        /\["moon pipeline"[\s\S]*?dstFactor: "one"/);
    assert.doesNotMatch(shaderSource,
        /WEBGPU_MOON_SHADER[\s\S]*?p\[51\]\.rgb/);
});

test("bounded creative grade is applied once to only the completed scene radiance", () => {
    const atmosphereStart = shaderSource.indexOf(
        "export const WEBGPU_ATMOSPHERE_SHADER",
    );
    const atmosphereEnd = shaderSource.indexOf(
        "export const WEBGPU_CLOUD_INTERVAL_SHADER",
        atmosphereStart,
    );
    const atmosphereShader = shaderSource.slice(atmosphereStart, atmosphereEnd);
    const compositeStart = shaderSource.indexOf(
        "export const WEBGPU_COMPOSITE_SHADER",
    );
    const compositeShader = shaderSource.slice(compositeStart);
    const finalComposition = compositeShader.slice(
        compositeShader.indexOf(
            "var radiance = cloud_scattering + background * cloud_transmittance",
        ),
    );

    assert.doesNotMatch(
        atmosphereShader,
        /physical_atmosphere_apply_grade\s*\(/,
    );
    assert.match(
        atmosphereShader,
        /let radiance = physical \+ physical_night_emission\(view, atmosphere_view\)/,
    );
    assert.match(atmosphereShader,
        /celestial_zodiacal_radiance\([\s\S]*?atmo_transmittance_to_space\(/);
    assert.match(atmosphereShader,
        /celestial_lunar_atmospheric_aureole\(/);
    assert.match(atmosphereShader,
        /fn physical_artificial_ground_skyglow\([\s\S]*?atmo_sample_medium\(point\)/);
    assert.match(rendererSource,
        /artificialGround\.upwardRadianceRgb[\s\S]*?artificialGround\.upwardAnisotropy/);
    assert.equal(
        (compositeShader.match(/physical_atmosphere_apply_grade\s*\(/g) ?? [])
            .length,
        2,
        "one definition and exactly one final-scene application",
    );
    assert.match(
        finalComposition,
        /if \(debug_view == 0\) \{[\s\S]*?radiance = physical_atmosphere_apply_grade\([\s\S]*?radiance,[\s\S]*?p\[5\]\.w,[\s\S]*?vec3<f32>\(p\[7\]\.w, p\[8\]\.w, p\[9\]\.w\),[\s\S]*?p\[6\]\.w,[\s\S]*?\);[\s\S]*?\}[\s\S]*?if \(debug_view == 0 \|\| debug_view == 7 \|\|[\s\S]{0,100}debug_view >= 9[\s\S]{0,100}debug_view <= 14[\s\S]{0,40}\) \{[\s\S]*?radiance = photographic_tonemap\(radiance, p\[29\]\.y\)/,
    );
    assert.doesNotMatch(
        shaderSource.slice(0, compositeStart),
        /radiance\s*=\s*physical_atmosphere_apply_grade\s*\(/,
    );
    assert.match(
        rendererSource,
        /data\[5 \* 4 \+ 3\] = atmosphereGrade\.exposureCompensationEv;[\s\S]*?data\[6 \* 4 \+ 3\] = atmosphereGrade\.moodStrength;[\s\S]*?data\[7 \* 4 \+ 3\] = atmosphereGrade\.chromaResidual\[0\];[\s\S]*?data\[8 \* 4 \+ 3\] = atmosphereGrade\.chromaResidual\[1\];[\s\S]*?data\[9 \* 4 \+ 3\] = atmosphereGrade\.chromaResidual\[2\]/,
    );
    assert.match(rendererSource, /new Float32Array\(54 \* 4\)/);
});

test("physical atmosphere and cloud-light invalidation preserve RGB ground reflectance", () => {
    assert.match(
        skySource,
        /createPhysicalAtmosphereStateFromComposition\([\s\S]*?composition,[\s\S]*?composition\.aerosolType/,
    );
    assert.match(
        atmosphericCompositionSource,
        /createPhysicalAtmosphereState\(\{[\s\S]*?groundAlbedo: resolved\.groundAlbedo,/,
    );
    assert.match(
        rendererSource,
        /createCloudLightVolumeLightingSignature[\s\S]*?groundAlbedoRgb: resolveGroundAlbedoRgb\(/,
    );
    assert.doesNotMatch(
        rendererSource,
        /groundAlbedo:\s*\[\s*radiance\.groundAlbedo,\s*radiance\.groundAlbedo,\s*radiance\.groundAlbedo,?\s*\]/,
    );
});

test("renderer consumes the one coherent physical atmosphere state created upstream", () => {
    const frameSource = rendererSource.slice(
        rendererSource.indexOf("const createPhysicalAtmosphereFrame"),
        rendererSource.indexOf("const createCloudLightVolumeSources"),
    );
    assert.match(frameSource, /state: PhysicalAtmosphereState/);
    assert.match(frameSource, /observerAltitudeKm: state\.observerAltitudeKm/);
    assert.match(frameSource, /const sun = celestial\.sun\.source/);
    assert.match(frameSource, /const moon = celestial\.moon\.radianceContract/);
    assert.match(frameSource, /return \{ state, lighting, grade:/);
    assert.doesNotMatch(frameSource, /createPhysicalAtmosphereState\(/);
    assert.doesNotMatch(frameSource, /resolvePhysicalAtmosphereComposition\(/);
    assert.match(skySource,
        /physicalAtmosphereState,[\s\S]*?solarTopOfAtmosphereIrradianceRgb/);
});

test("finite hydrometeor fields are sampled without fixed-distance gaps", () => {
    const fragmentStart = shaderSource.indexOf("fn cloud_fragment");
    const fragmentEnd = shaderSource.indexOf("fn stellar_visibility", fragmentStart);
    const cloudFragment = shaderSource.slice(
        fragmentStart,
        fragmentEnd > fragmentStart ? fragmentEnd : undefined,
    );
    assert.match(shaderSource, /fn hydrometeor_altitude_interval\(/);
    assert.match(shaderSource, /fn hydrometeor_record_interval\(/);
    assert.match(shaderSource, /let bottom_drift_km =/);
    assert.match(shaderSource, /hydrometeor_axis_interval\(/);
    assert.match(shaderSource, /var intervals: array<vec2<f32>, 96>/);
    assert.match(shaderSource, /fn hydrometeor_record_step_km\(/);
    assert.match(shaderSource, /let strata = select\(24\.0, 32\.0, render_class == 0u\)/);
    assert.match(shaderSource, /crossed_dimension \/ strata, 0\.001, 0\.25/);
    assert.match(shaderSource, /for \(var step = 0; step < 192; step\+\+\)/);
    assert.match(shaderSource, /travelled = max\(travelled \+ 1e-5, next_event\)/);
    assert.match(shaderSource, /hydrometeor_sample_record\(/);
    assert.doesNotMatch(shaderSource, /let far = 24\.0/);
    assert.doesNotMatch(shaderSource, /far \/ 12\.0/);
    assert.match(cloudFragment, /march_hydrometeors\(/);
    assert.match(shaderSource, /hydrometeor_fields\.header\.x/);
    assert.match(rendererSource, /createHydrometeorRuntime\(/);
    assert.match(rendererSource, /resource: \{ buffer: hydrometeorBuffer \}/);
});

test("hydrometeors use physical source lighting and normalized directional phase", () => {
    assert.match(shaderSource, /fn hydrometeor_spherical_gaussian\(/);
    assert.match(shaderSource,
        /bounded_concentration \/\s*\(2\.0 \* PI \* max\(1e-8, 1\.0 - exp\(-2\.0 \* bounded_concentration\)\)\)/);
    assert.match(shaderSource, /mix\(\s*hg\(cosine, asymmetry\),\s*hydrometeor_spherical_gaussian/);
    assert.match(shaderSource, /physical_source_irradiance_at\(0u, point\)/);
    assert.match(shaderSource, /physical_source_irradiance_at\(1u, point\)/);
    assert.match(shaderSource, /physical_diffuse_irradiance_at\(point\)/);
    assert.match(shaderSource, /physical_ground_irradiance_at\(point\)/);
    assert.match(shaderSource, /meteor\.direct_irradiance_weight/);
    assert.match(shaderSource, /meteor\.diffuse_irradiance_weight/);
    assert.match(shaderSource, /meteor\.multiple_scattering_boost/);
    assert.match(shaderSource, /let scattering_scale = min\(\s*extinction_scale/);
    // Sparse metadata cannot remove volume energy until a raster pass replaces
    // precisely the same energy with deterministic per-pixel coverage.
    assert.match(shaderSource,
        /let extinction = max\(vec3<f32>\(0\.0\), meteor\.extinction_rgb_km\)/);
    assert.doesNotMatch(shaderSource,
        /meteor\.extinction_rgb_km\s*\*\s*meteor\.volumetric_energy_fraction/);
});

test("normalized ice glint conserves energy across its supported concentration range", () => {
    for (const concentration of [8, 64, 512, 4_096, 28_000]) {
        const normalization = concentration /
            (2 * Math.PI * (1 - Math.exp(-2 * concentration)));
        const integratedSolidAngle = 2 * Math.PI * normalization *
            (1 - Math.exp(-2 * concentration)) / concentration;
        assert.ok(Math.abs(integratedSolidAngle - 1) < 1e-12);
    }
});

test("adaptive strata resolve ten-to-one-hundred metre weather depths", () => {
    for (const thicknessKm of [0.01, 0.025, 0.05, 0.1]) {
        const stepKm = Math.max(0.001, Math.min(0.25, thicknessKm / 24));
        assert.ok(Math.ceil(thicknessKm / stepKm) >= 10);
        assert.ok(stepKm < thicknessKm);
    }
});

test("3D cloud appearance volumes use offline mips and projected-footprint LOD", () => {
    assert.match(rendererSource, /cloud-base-average-rgba8-mips-64\.bin/);
    assert.match(rendererSource, /cloud-detail-average-rgba8-mips-32\.bin/);
    assert.match(rendererSource, /unpackCloudVolumeMipTail\(/);
    assert.match(rendererSource, /mipmapFilter: "linear"/);
    assert.match(rendererSource, /mipLevelCount: cloudNoise\.baseMips\.length/);
    assert.match(rendererSource, /mipLevelCount: cloudNoise\.detailMips\.length/);
    assert.match(rendererSource, /\{ texture: baseVolume, mipLevel \}/);
    assert.match(rendererSource, /\{ texture: detailVolume, mipLevel \}/);
    assert.match(shaderSource, /CLOUD_VOLUME_FILTERING_WGSL/);
    assert.match(shaderSource, /fn cloud_volume_lod_at_local_position\(/);
    assert.match(shaderSource, /max\(vec2<f32>\(1\.0\), p\[29\]\.zw\)/);
    assert.match(cloudShaderSource, /\$\{CLOUD_VOLUME_FILTERING_WGSL\}/);
    assert.match(cloudShaderSource, /fn cloud_volume_lod_at_local_position\(/);
    assert.match(shaderSource, /let broad_lod = cloud_volume_lod_at_local_position/);
    assert.match(shaderSource, /let fine_lod = cloud_volume_lod_at_local_position/);
    assert.match(shaderSource, /let base_lod = cloud_volume_lod_at_local_position/);
    assert.match(shaderSource, /let detail_lod = cloud_volume_lod_at_local_position/);
});

test("hydrometeors and clouds compose by finite first-interaction depth", () => {
    const fragmentStart = shaderSource.indexOf("fn cloud_fragment");
    const fragmentEnd = shaderSource.indexOf("fn stellar_visibility", fragmentStart);
    const cloudFragment = shaderSource.slice(
        fragmentStart,
        fragmentEnd > fragmentStart ? fragmentEnd : undefined,
    );
    assert.match(cloudFragment,
        /hydrometeors\.first_depth <= layer_first_depth\[index\]/);
    assert.match(cloudFragment, /var hydrometeor_pending =/);
    assert.match(cloudFragment, /finite_atmosphere_to_sample\(hydrometeor_point\)/);
    assert.match(cloudFragment, /finite_atmosphere_to_sample\(cloud_point\)/);
    assert.match(cloudFragment, /dominant_layer = hydrometeors\.parent_layer/);
});

test("WebGPU validation allocates the expanded hydrometeor ABI", () => {
    assert.match(validatorSource,
        /entry\(29, sharedCloudReadOnlyStorage\)/);
    assert.match(validatorSource,
        /hydrometeorBuffer = device\.createBuffer\(\{ size: \(1 \+ 96 \* 16\) \* 16/);
    assert.doesNotMatch(validatorSource, /96 \* 12/);
});

test("cloud G-buffer exports physical reconstruction channels", () => {
    assert.match(shaderSource, /@location\(2\) geometry: vec4<f32>/);
    assert.match(shaderSource, /@location\(3\) motion: vec4<f32>/);
    assert.match(shaderSource, /first_depth/);
    assert.match(shaderSource, /weighted_mean_depth/);
    assert.match(shaderSource, /-log\(max\(0\.0001, transmittance_y\)\)/);
    assert.match(shaderSource, /actual_steps \/ 144\.0/);
    assert.match(shaderSource, /var motion_texture: texture_2d<f32>/);
    assert.match(shaderSource,
        /let depth_contribution = photopic\(\s*combined_transport\.transmittance \* absorbed\)/);
    assert.match(shaderSource, /weighted_depth \+= travelled \* depth_contribution/);
});

test("RGB affine camera transport has one atomic two-layer history ABI", () => {
    const cloudOutput = shaderSource.match(
        /struct CloudOutput \{[\s\S]*?\n\};/,
    )?.[0] ?? "";
    const compositeStart = shaderSource.indexOf(
        "export const WEBGPU_COMPOSITE_SHADER",
    );
    const composite = shaderSource.slice(compositeStart);
    assert.match(cloudOutput, /@location\(0\) radiance: vec4<f32>/);
    assert.match(cloudOutput, /@location\(1\) transmittance: vec4<f32>/);
    assert.match(cloudOutput, /@location\(2\) geometry: vec4<f32>/);
    assert.match(cloudOutput, /@location\(3\) motion: vec4<f32>/);
    assert.match(shaderSource,
        /struct CameraTransport \{\s*radiance: vec3<f32>,\s*transmittance: vec3<f32>/);
    assert.match(shaderSource, /fn compose_camera_transport\(/);
    assert.match(shaderSource,
        /front\.radiance \+ front\.transmittance \* back\.radiance/);
    assert.match(shaderSource,
        /front\.transmittance \* back\.transmittance/);
    assert.match(shaderSource,
        /struct HydrometeorTransport \{[\s\S]*?transmittance: vec3<f32>/);
    assert.match(shaderSource,
        /struct UpperAtmosphereTransport \{[\s\S]*?transmittance: vec3<f32>/);
    assert.match(composite,
        /@binding\(2\) var cloud_texture: texture_2d_array<f32>/);
    assert.match(composite,
        /@binding\(3\) var previous_cloud_texture: texture_2d_array<f32>/);
    assert.match(composite,
        /@binding\(14\) var previous_resolved_cloud_texture:\s*texture_2d_array<f32>/);
    assert.match(composite,
        /var radiance = cloud_scattering \+ background \* cloud_transmittance/);
    assert.doesNotMatch(composite, /background \* cloud\.a/);
    assert.match(composite,
        /output\.resolved_transmittance = vec4<f32>\(\s*cloud_transmittance, cloud_transmittance_y\)/);
    assert.match(rendererSource,
        /cloudCurrent = createWebGpuTexture\([\s\S]{0,140}?renderUsage, 2\)/);
    assert.match(rendererSource,
        /resolvedCloudCurrent = createWebGpuTexture\([\s\S]{0,140}?renderUsage, 2\)/);
    assert.match(rendererSource,
        /transportArrayView\(cloudCurrent\)/);
    assert.match(rendererSource,
        /transportArrayView\(cloudPrevious\)/);
    assert.match(rendererSource,
        /transportLayerView\(cloudCurrent, 0\)[\s\S]{0,500}?\{ r: 0, g: 0, b: 0, a: 0 \}/);
    assert.match(rendererSource,
        /transportLayerView\(cloudCurrent, 1\)[\s\S]{0,500}?\{ r: 1, g: 1, b: 1, a: 1 \}/);
    assert.match(rendererSource,
        /resource: transportLayerView\(cloudCurrent, 1\)/);
    assert.match(validatorSource,
        /const cloudAttachmentCount = 4/);
    assert.match(validatorSource,
        /const cloudAttachmentBytesPerSample =\s*cloudAttachmentCount \* rgba16floatBytesPerSample/);
    assert.match(validatorSource,
        /coreMaxColorAttachmentBytesPerSample = 32/);
    assert.match(validatorSource,
        /compositeFragmentSampledTextureCount = 13/);
});

test("temporal reconstruction uses matching previous-frame geometry and motion", () => {
    assert.match(shaderSource, /previous_geometry_texture/);
    assert.match(shaderSource, /previous_motion_texture/);
    assert.match(shaderSource, /first_depth_delta/);
    assert.match(shaderSource, /optical_delta/);
    assert.match(shaderSource, /reconstruction_confidence/);
    assert.match(rendererSource, /geometryPrevious = geometryCurrent/);
    assert.match(rendererSource, /motionPrevious = motionCurrent/);
});

test("temporal reconstruction persists variance, confidence, and stable age", () => {
    assert.match(shaderSource, /previous_temporal_texture/);
    assert.match(shaderSource, /previous_resolved_cloud_texture/);
    assert.match(shaderSource,
        /@location\(2\) resolved_radiance: vec4<f32>/);
    assert.match(shaderSource,
        /@location\(3\) resolved_transmittance: vec4<f32>/);
    assert.match(shaderSource, /accumulated_variance/);
    assert.match(shaderSource, /persistent_confidence/);
    assert.match(shaderSource, /stable_age/);
    assert.match(shaderSource, /fn variance_guided_history_radiance\(/);
    assert.match(shaderSource,
        /sample_resolved_transport\([\s\S]*uv \+ descriptor\.xy \* texel/);
    assert.match(shaderSource,
        /variance_strength = variance \/ \(variance \+ 0\.0004\)/);
    assert.match(shaderSource,
        /filtered_history = CompositeTransport\([\s\S]*variance_guided_history_radiance[\s\S]*previous_resolved_history\.transmittance/);
    assert.match(shaderSource,
        /current_luminance = composite_photopic\(current\.radiance\)/);
    assert.doesNotMatch(shaderSource,
        /current_luminance = composite_photopic\([\s\S]{0,120}background/);
    assert.match(shaderSource,
        /accepted_mean = previous_temporal\.x \+[\s\S]*moment_delta \/ \(prior_count \+ 1\.0\)/);
    assert.match(shaderSource,
        /accepted_variance = max\(0\.0,[\s\S]*prior_count \* previous_temporal\.y[\s\S]*moment_delta \* \(current_luminance - accepted_mean\)/);
    assert.doesNotMatch(shaderSource, /instantaneous_variance/);
    assert.match(rendererSource, /temporalCurrent/);
    assert.match(rendererSource, /temporalPrevious/);
    assert.match(rendererSource, /resolvedCloudCurrent/);
    assert.match(rendererSource, /resolvedCloudPrevious/);
    assert.match(rendererSource, /newTransportSample: boolean/);
    assert.match(rendererSource, /newTransportSample \? 1 : 0/);
    assert.match(rendererSource,
        /binding: 14,[\s\S]{0,120}?transportArrayView\(resolvedCloudPrevious\)/);
    assert.match(rendererSource,
        /view: transportLayerView\(resolvedCloudCurrent, 0\)/);
    assert.match(rendererSource,
        /view: transportLayerView\(resolvedCloudCurrent, 1\)/);
});

test("resolved cloud history advances only for new transport samples", () => {
    const compositeStart = shaderSource.indexOf("fn composite_fragment(");
    const composite = shaderSource.slice(compositeStart);
    const historyStart = composite.indexOf("let history_weight");
    const historyEnd = composite.indexOf("let newly_resolved_cloud", historyStart);
    const historyWeight = composite.slice(historyStart, historyEnd);
    assert.match(composite, /let new_transport_sample = p\[33\]\.w > 0\.5/);
    assert.match(composite, /load_resolved_transport\(output_pixel\)/);
    assert.match(composite, /sample_resolved_transport\(previous_uv\)/);
    assert.match(composite, /prior_count \/ \(prior_count \+ 1\.0\)/);
    assert.match(composite,
        /let exact_mean_history = prior_count \/ \(prior_count \+ 1\.0\)/);
    assert.match(composite,
        /let bounded_live_history = min\(0\.98, exact_mean_history\)/);
    assert.match(composite,
        /let mean_history = select\([\s\S]*bounded_live_history,[\s\S]*exact_mean_history,[\s\S]*immutable_capture_epoch/);
    assert.match(composite,
        /let stable_interior = current_present && previous_present &&[\s\S]*reconstruction_confidence >= 0\.72[\s\S]*min\(geometry\.w, previous_geometry\.w\) >= 0\.08/);
    assert.match(composite,
        /let immutable_capture_epoch = p\[30\]\.w <= 1e-6 && camera_delta <= 1e-6/);
    assert.match(composite,
        /let immutable_sample_accept = immutable_capture_epoch &&[\s\S]*temporal_available && current_updated &&[\s\S]*temporal_history_visibility > 0\.5/);
    assert.match(composite,
        /let immutable_optical_accept = immutable_capture_epoch &&[\s\S]*current_present && previous_present[\s\S]*layer_match > 0\.5 && optical_delta <= 0\.35/);
    assert.match(composite,
        /reconstruction_confidence >= 0\.72 \|\| immutable_optical_accept/);
    assert.match(composite,
        /select_composite_transport\([\s\S]*neighborhood_clamped_history,[\s\S]*filtered_history,[\s\S]*stable_interior \|\| immutable_sample_accept/);
    assert.match(composite,
        /let geometric_accept = select\([\s\S]*reconstruction_confidence >= 0\.55/);
    assert.match(composite,
        /reconstruction_confidence >= 0\.55 \|\| immutable_sample_accept/);
    assert.doesNotMatch(historyWeight, /\* geometric_accept/);
    assert.match(historyWeight, /mean_history,/);
    assert.match(historyWeight, /new_transport_sample && accepts_history/);
    assert.doesNotMatch(historyWeight, /variance_confidence|residual_confidence|rejection|geometry\.w/);
    assert.match(composite,
        /let cloud = select_composite_transport\([\s\S]*direct_resolved_history,[\s\S]*newly_resolved_cloud,[\s\S]*new_transport_sample/);
    assert.match(validatorSource,
        /binding: 14, resource: transportArrayView\(resolvedCloudHistory\)/);
    assert.match(validatorSource,
        /view: transportLayerView\(resolvedCloudTarget, 0\)/);
    assert.match(validatorSource,
        /view: transportLayerView\(resolvedCloudTarget, 1\)/);
});

test("paused reconstruction follows immutable simulation time", () => {
    assert.match(rendererSource, /resolveCloudTransportDeltaSeconds/);
    assert.match(rendererSource, /let previousTransportCloudClock = Number\.NaN/);
    assert.match(rendererSource,
        /previousCloudClock: previousTransportCloudClock,[\s\S]*currentCloudClock: cloudClock/);
    assert.match(rendererSource, /previousTransportCloudClock = cloudClock/);
    assert.doesNotMatch(rendererSource,
        /activeTransportDeltaSeconds\s*=\s*Math\.min\([\s\S]{0,120}seconds\s*-\s*lastCloudUpdate/);
});

test("paused qualification defers nonvisual GPU readbacks to the final sample", () => {
    assert.match(rendererSource,
        /const qualificationDiagnosticsDue = !current\.paused \|\|[\s\S]*transportUpdates \+ 1 >=[\s\S]*CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(rendererSource,
        /current\.options\.debugView !== "final" \|\| current\.onStats\) &&[\s\S]{0,120}qualificationDiagnosticsDue && !metricsReadPending/);
    assert.match(rendererSource,
        /transportedCloud &&[\s\S]{0,160}qualificationDiagnosticsDue &&[\s\S]{0,80}!reconstructionMetricsReadPending/);
    assert.match(rendererSource,
        /publishCompletedCoverageMetrics =[\s\S]*propsRef\.current\.paused[\s\S]*transportUpdates >=[\s\S]*CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(rendererSource,
        /if \(publishCompletedCoverageMetrics && !disposed\)[\s\S]*draw\([\s\S]*time, false/,
        "the last independent diagnostic map publishes without another transport");
    assert.match(rendererSource,
        /if \(timestampReadRequestedThisFrame && cloudTimestampRead && MAP_MODE\)/,
        "GPU budget timestamps remain active while qualification converges");
});

test("immutable stochastic reconstruction accumulates monotone direct history", () => {
    const compositeStart = shaderSource.indexOf("fn composite_fragment(");
    const composite = shaderSource.slice(compositeStart);
    assert.match(composite,
        /let reproject_temporal_history =\s*new_transport_sample && !immutable_capture_epoch/);
    assert.match(composite,
        /let temporal_history_uv = select\(\s*input\.uv, previous_uv, reproject_temporal_history\)/);
    assert.match(composite,
        /let previous_temporal = select\([\s\S]*direct_previous_temporal,[\s\S]*reprojected_previous_temporal,[\s\S]*reproject_temporal_history/);
    assert.match(composite,
        /let direct_previous_temporal = textureLoad\(\s*previous_temporal_texture, output_pixel, 0\)/);
    assert.match(composite,
        /let direct_resolved_history = load_resolved_transport\(output_pixel\)/);
    assert.match(composite,
        /variance_guided_history_radiance\(\s*temporal_history_uv, previous_resolved_history/);
    assert.match(composite,
        /let immutable_resolve_current = select_composite_transport\(\s*denoised_current,\s*current,\s*immutable_capture_epoch/);
    assert.match(composite,
        /let immutable_resolve_history = select_composite_transport\(\s*clamped_resolved_history,\s*direct_resolved_history,\s*immutable_capture_epoch/);
    assert.match(composite,
        /let newly_resolved_cloud = mix_composite_transport\(\s*immutable_resolve_current,\s*immutable_resolve_history,\s*history_weight/);
    assert.match(composite,
        /let accepts_history = temporal_available && current_updated &&\s*temporal_history_visibility > 0\.5/);

    // Shader-equivalent scalar recurrence. Neighbour-derived values are made
    // deliberately adversarial; immutable output may depend only on the raw
    // current pixel and its exact prior same-pixel mean.
    const resolve = ({
        immutable,
        current,
        previous,
        denoisedCurrent,
        filteredHistory,
        priorCount,
    }) => {
        const currentInput = immutable ? current : denoisedCurrent;
        const historyInput = immutable ? previous : filteredHistory;
        const exactWeight = priorCount / (priorCount + 1);
        const weight = immutable ? exactWeight : Math.min(0.98, exactWeight);
        return currentInput * (1 - weight) + historyInput * weight;
    };
    const immutableInputs = {
        immutable: true,
        current: 0.37,
        previous: 0.61,
        priorCount: 17,
    };
    const immutableA = resolve({
        ...immutableInputs,
        denoisedCurrent: -1_000,
        filteredHistory: 2_000,
    });
    const immutableB = resolve({
        ...immutableInputs,
        denoisedCurrent: 4_000,
        filteredHistory: -8_000,
    });
    assert.equal(immutableA, immutableB);
    assert.ok(Math.abs(immutableA -
        ((immutableInputs.current +
            immutableInputs.previous * immutableInputs.priorCount) /
            (immutableInputs.priorCount + 1))) < 1e-15);

    const deterministicSamples = Array.from({ length: 64 }, (_, index) =>
        ((index * 37) % 101) / 100);
    let recurrenceMean = deterministicSamples[0];
    let directSum = deterministicSamples[0];
    for (let index = 1; index < deterministicSamples.length; index += 1) {
        recurrenceMean = resolve({
            immutable: true,
            current: deterministicSamples[index],
            previous: recurrenceMean,
            // Change spatial inputs every iteration so accidental use is loud.
            denoisedCurrent: 10_000 + index,
            filteredHistory: -10_000 - index,
            priorCount: index,
        });
        directSum += deterministicSamples[index];
        assert.ok(Math.abs(recurrenceMean - directSum / (index + 1)) < 1e-13);
    }

    // CPU reference for the shader's normalized age/confidence recurrence.
    // Radiance and occupancy deliberately alternate to represent stochastic
    // samples of one immutable sub-pixel silhouette; immutable identity makes
    // all samples after the seed eligible for same-pixel accumulation.
    const step = (previous, { historyAvailable, immutable, ownerChanged }) => {
        const accepted = historyAvailable && immutable && !ownerChanged;
        return {
            age: accepted
                ? Math.min(1, previous.age + 1 / 64)
                : 1 / 64,
            confidence: accepted
                ? Math.min(1, previous.confidence + 0.085)
                : 0,
        };
    };
    let state = { age: 0, confidence: 0 };
    const ages = [];
    const confidences = [];
    for (let sample = 0; sample < 64; sample += 1) {
        const stochasticOccupied = sample % 2 === 0;
        const stochasticRadiance = stochasticOccupied ? 0.82 : 0.03;
        assert.ok(Number.isFinite(stochasticRadiance));
        state = step(state, {
            historyAvailable: sample > 0,
            immutable: true,
            ownerChanged: false,
        });
        ages.push(state.age);
        confidences.push(state.confidence);
    }
    assert.ok(ages.every((value, index) => index === 0 || value > ages[index - 1]));
    assert.ok(confidences.every((value, index) =>
        index === 0 || value >= confidences[index - 1]));
    assert.equal(ages.at(-1), 1);
    assert.equal(confidences.at(-1), 1);

    // A genuine owner discontinuity still restarts the path rather than
    // inheriting an unrelated cloud's mature history.
    const rejected = step(state, {
        historyAvailable: true,
        immutable: false,
        ownerChanged: true,
    });
    assert.deepEqual(rejected, { age: 1 / 64, confidence: 0 });

    const redrawStart = rendererSource.indexOf("redrawRef.current = () => {");
    const redrawEnd = rendererSource.indexOf("const schedule = () =>", redrawStart);
    const redraw = rendererSource.slice(redrawStart, redrawEnd);
    assert.match(redraw, /draw\(performance\.now\(\), false\)/);
    assert.doesNotMatch(redraw, /draw\(performance\.now\(\), true\)/);
    assert.match(rendererSource,
        /const qualificationTransportEligible =[\s\S]*?!current\.paused[\s\S]*?transportUpdates < CLOUD_QUALIFICATION_TRANSPORT_UPDATES[\s\S]*?historyAcceptanceFraction === null/);
    assert.match(rendererSource,
        /!coldLightingWarmupPending && qualificationTransportEligible &&/);
});

test("post-composite reconstruction audit separates raw transport from history", () => {
    assert.match(shaderSource,
        /export const WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER/);
    assert.match(shaderSource,
        /raw_radiance_temporal_delta_sum: atomic<u32>/);
    assert.match(shaderSource,
        /raw_transmittance_temporal_delta_sum: atomic<u32>/);
    assert.match(shaderSource,
        /resolved_radiance_temporal_delta_sum: atomic<u32>/);
    assert.match(shaderSource,
        /history_accepted_count: atomic<u32>/);
    assert.match(shaderSource,
        /first_depth_delta_sum: atomic<u32>/);
    assert.match(shaderSource,
        /optical_depth_delta_sum: atomic<u32>/);
    assert.match(shaderSource,
        /raw_radiance_non_finite_count: atomic<u32>/);
    assert.match(shaderSource,
        /resolved_radiance_non_finite_count: atomic<u32>/);
    assert.match(rendererSource,
        /code: WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER/);
    assert.match(rendererSource,
        /label: "cloud reconstruction numerical diagnostics",\s*\n\s*size: 80,[\s\S]{0,180}BUFFER\.STORAGE \| BUFFER\.COPY_SRC/);
    assert.match(rendererSource,
        /label: "cloud reconstruction diagnostic readback",\s*\n\s*size: 80,[\s\S]{0,120}BUFFER\.COPY_DST \| BUFFER\.MAP_READ/);
    assert.match(rendererSource,
        /binding: 0,[\s\S]{0,100}transportLayerView\(cloudCurrent, 0\)/);
    assert.match(rendererSource,
        /binding: 1,[\s\S]{0,100}transportLayerView\(cloudPrevious, 0\)/);
    assert.match(rendererSource,
        /binding: 8,[\s\S]{0,120}transportArrayView\(resolvedCloudCurrent\)/);
    assert.match(rendererSource,
        /binding: 9,[\s\S]{0,120}transportArrayView\(resolvedCloudPrevious\)/);
    const compositeEnd = rendererSource.indexOf("compositePass.end();");
    const auditPass = rendererSource.indexOf(
        "const reconstructionMetricsPass = encoder.beginComputePass", compositeEnd);
    assert.ok(compositeEnd >= 0 && auditPass > compositeEnd,
        "the audit must observe completed reconstruction output");
    assert.match(rendererSource,
        /rawRadianceTemporalDelta = meanMetric\(1\)/);
    assert.match(rendererSource,
        /rawTransmittanceTemporalDelta = meanMetric\(2\)/);
    assert.match(rendererSource,
        /resolvedRadianceTemporalDelta = meanMetric\(3\)/);
    assert.match(rendererSource,
        /historyAcceptanceFraction = historyDecisions > 0/);
    assert.match(rendererSource,
        /publishCompletedQualificationMetrics[\s\S]*propsRef\.current\.paused[\s\S]*transportUpdates >=[\s\S]*CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(rendererSource,
        /needsOneHistoryDecisionSample[\s\S]*historyAcceptanceFraction === null[\s\S]*transportUpdates ===[\s\S]*CLOUD_QUALIFICATION_TRANSPORT_UPDATES/);
    assert.match(rendererSource,
        /requestAnimationFrame\(\(time\) => draw\([\s\S]*time, needsOneHistoryDecisionSample/);
    assert.match(validatorSource,
        /"WEBGPU_CLOUD_RECONSTRUCTION_METRICS_SHADER"/);
    assert.match(validatorSource,
        /entryPoint: "cloud_reconstruction_metrics_compute"/);
    const validatorCompositeEnd = validatorSource.indexOf("compositePass.end();");
    const validatorAuditPass = validatorSource.indexOf(
        "const reconstructionMetricsPass = encoder.beginComputePass", validatorCompositeEnd);
    assert.ok(validatorCompositeEnd >= 0 && validatorAuditPass > validatorCompositeEnd,
        "browser validation must execute the audit after the composite");
});

test("reconstruction metrics WGSL and readback indices share one ABI", () => {
    const structBody = shaderSource.match(
        /struct ReconstructionMetrics \{([\s\S]*?)\n\};/,
    )?.[1] ?? "";
    const fields = [...structBody.matchAll(
        /^\s*([a-z][a-z0-9_]*): atomic<u32>,/gm,
    )].map((match) => match[1]);
    assert.deepEqual(fields, [
        "occupied_sample_count",
        "raw_radiance_temporal_delta_sum",
        "raw_transmittance_temporal_delta_sum",
        "resolved_radiance_temporal_delta_sum",
        "raw_resolved_radiance_residual_sum",
        "history_accepted_count",
        "history_rejected_count",
        "stable_age_sum",
        "persistent_confidence_sum",
        "raw_radiance_spatial_variation_sum",
        "resolved_radiance_spatial_variation_sum",
        "final_output_adjacent_variation_sum",
        "final_output_scale_separated_variation_sum",
        "first_depth_delta_sum",
        "mean_depth_delta_sum",
        "optical_depth_delta_sum",
        "raw_radiance_non_finite_count",
        "resolved_radiance_non_finite_count",
    ]);
    assert.equal(fields.length * Uint32Array.BYTES_PER_ELEMENT, 72,
        "the WGSL storage struct occupies 72 bytes before the 80-byte allocation");

    // The renderer deliberately publishes the scale-separated signal at the
    // legacy resolved-variation property; the adjacent and scale-separated
    // output diagnostics remain separately exposed. Non-finite counts must
    // read the final two words, never depth sums at indices 14/15.
    assert.match(rendererSource,
        /resolvedRadianceSpatialVariation = meanMetric\(12\)/);
    assert.match(rendererSource,
        /finalOutputAdjacentVariation = meanMetric\(11\)/);
    assert.match(rendererSource,
        /finalOutputScaleSeparatedVariation = meanMetric\(12\)/);
    assert.match(rendererSource,
        /firstDepthTemporalDelta = meanMetric\(13\)/);
    assert.match(rendererSource,
        /meanDepthTemporalDelta = meanMetric\(14\)/);
    assert.match(rendererSource,
        /opticalDepthTemporalDelta = meanMetric\(15\)/);
    assert.match(rendererSource,
        /reconstructionRawNonFiniteCount = values\[16\]/);
    assert.match(rendererSource,
        /reconstructionResolvedNonFiniteCount = values\[17\]/);
    assert.match(validatorSource,
        /const cloudReconstructionMetricsBuffer = device\.createBuffer\(\{[\s\S]{0,400}size: 80,/);
});

test("temporal reconstruction reprojects camera and world-space layer motion", () => {
    assert.match(shaderSource, /view_direction_for_camera/);
    assert.match(shaderSource, /project_direction_to_camera/);
    assert.match(shaderSource, /previous_world_point/);
    assert.match(shaderSource, /reprojection_motion\.x \* p\[30\]\.w/);
    assert.match(shaderSource, /previous_camera_visibility/);
    assert.doesNotMatch(shaderSource, /pixel_motion/);
    assert.match(rendererSource, /currentTransportCamera/);
    assert.match(rendererSource, /previousTransportCamera/);
    assert.match(rendererSource, /activeTransportDeltaSeconds/);
});

test("meteorological discontinuities invalidate all temporal cloud history", () => {
    assert.match(rendererSource, /createCloudHistorySignature/);
    assert.match(rendererSource, /nextCloudHistorySignature !== cloudHistorySignature/);
    assert.match(rendererSource, /historyValid = false/);
    assert.match(rendererSource, /temporalNeedsClear = true/);
    assert.match(rendererSource, /transportUpdates = 0/);
    assert.match(rendererSource, /lastCloudUpdate = -Infinity/);
});

test("the WebGPU result has no post-display DOM atmosphere overlays", () => {
    const webGpuBranch = rendererSource.slice(
        rendererSource.indexOf('if (backend === "webgpu")'),
        rendererSource.indexOf('if (backend === "webgl2")'),
    );
    assert.doesNotMatch(webGpuBranch, /styles\.(edgeColor|horizon|mistLayer|atmosphere|grain)/);
    assert.doesNotMatch(shaderSource, /let foreground_air/);
});

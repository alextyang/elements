import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shaderSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
    "utf8",
);

const section = (startToken, endToken) => {
    const start = shaderSource.indexOf(startToken);
    const end = shaderSource.indexOf(endToken, start + startToken.length);
    assert.ok(start >= 0, `missing ${startToken}`);
    assert.ok(end > start, `missing ${endToken} after ${startToken}`);
    return shaderSource.slice(start, end);
};

const packedMipLevel = (path, sizes, targetSize) => {
    const bytes = fs.readFileSync(new URL(path, import.meta.url));
    let offset = 0;
    for (const size of sizes) {
        const byteLength = size ** 3 * 4;
        if (size === targetSize) {
            return bytes.subarray(offset, offset + byteLength);
        }
        offset += byteLength;
    }
    throw new RangeError(`missing ${targetSize}³ mip in ${path}`);
};

const residualStatistics = (bytes, residualAt) => {
    let sum = 0;
    let squareSum = 0;
    const count = bytes.byteLength / 4;
    for (let index = 0; index < count; index += 1) {
        const offset = index * 4;
        const channels = [
            bytes[offset] / 255,
            bytes[offset + 1] / 255,
            bytes[offset + 2] / 255,
            bytes[offset + 3] / 255,
        ];
        const residual = Math.max(-0.72, Math.min(0.72,
            residualAt(channels)));
        sum += residual;
        squareSum += residual * residual;
    }
    const mean = sum / count;
    return {
        mean,
        standardDeviation: Math.sqrt(Math.max(
            0, squareSum / count - mean * mean)),
    };
};

test("finite high-cloud owners resolve a physical 3-D residual inside atlas support", () => {
    const material = section(
        "fn cloud_resolved_high_ice_material(",
        "struct CloudMacroOwnerSample",
    );
    assert.match(material, /genus < 1 \|\| genus > 3/);
    assert.match(material,
        /owner_position_km = \(canonical - vec3<f32>\(0\.5\)\) \* vec3<f32>\(/);
    assert.match(material, /2\.0 \* minor_radius_km/);
    assert.match(material, /geometric_depth_km/);
    assert.match(material, /2\.0 \* major_radius_km/);
    assert.match(material, /broad_position = vec3<f32>\(/);
    assert.match(material, /fine_position = vec3<f32>\(/);
    assert.match(material, /cloud_volume_lod_at_local_position\(/);
    assert.match(material,
        /source_lateral_filter_radius_km >= 0\.0[\s\S]*?footprint_diameter_km[\s\S]*?log2\(max\(1\.0/,
        "source transport must select a physical lateral-footprint LOD");
    assert.match(material,
        /source_depth_filter_radius_km > 0\.0[\s\S]*?source_ray_direction_owner_local[\s\S]*?broad_omega_sigma[\s\S]*?fine_omega_sigma[\s\S]*?exp\(/,
        "source depth support must prefilter along the physical source ray");
    assert.equal(
        (material.match(/textureSampleLevel\(/g) ?? []).length,
        2,
        "the resolved material must use one broad and one fine filtered 3-D field",
    );
    for (const species of [1, 2, 3, 5, 6, 22, 23, 24, 25]) {
        assert.match(material, new RegExp(`species == ${species}`));
    }
    assert.doesNotMatch(material,
        /input\.uv|cloud_composition|view_direction|screen_position|frag_coord/);
    assert.match(material,
        /broad_sample\.g - broad_sample\.b[\s\S]*?broad_sample\.a - 0\.5 \* \(broad_sample\.g \+ broad_sample\.b\)/,
        "broad ice structure must be common-mean-free at every volume mip");
    assert.match(material,
        /fine_sample\.g - fine_sample\.b[\s\S]*?fine_sample\.r - fine_sample\.a/,
        "fine ice structure must be common-mean-free at every volume mip");
    assert.doesNotMatch(material,
        /\bbroad_signal\b|\bfine_signal\b|weighted[\s\S]*?-\s*0\.5/,
        "the approximately 0.56 asset mean must not become positive condensate");
    assert.match(material,
        /contrast_capacity = min\(base_density, 1\.0 - base_density\)[\s\S]*?resolved_density = clamp\([\s\S]*?base_density \+ centred_residual \* contrast_capacity/,
        "zero-mean texture may redistribute raw-R condensate only within symmetric headroom");
    assert.doesNotMatch(material,
        /resolved_density\s*=\s*saturate\(base_density\s*\*|density_scale/,
        "multiplicative clamping would bias the calibrated raw-R mass");
    assert.match(material,
        /broad_energy = broad_channel_residual \* broad_channel_residual[\s\S]*?fine_energy = fine_channel_residual \* fine_channel_residual[\s\S]*?residual_rms = sqrt/,
        "local variance must retain broad/fine second moments even when means cancel");
    assert.match(material,
        /variance_floor = select\(0\.26, 0\.42, species == 2\)[\s\S]*?variance_floor = select\(variance_floor, 0\.56, species == 1\)/,
        "fibratus and uncinus retain a bounded population-porosity floor");
});

test("shipped average mips retain centred broad and fine ice variance", () => {
    const broadResidual = ([, g, b, a]) =>
        (g - b - 0.0020) * 1.8 +
        (a - 0.5 * (g + b) - 0.0004) * 1.1;
    const fineResidual = ([r, g, b, a]) =>
        (g - b - 0.0016) * 2.6 +
        (r - a - 0.0007) * 1.4;
    const baseMipSizes = [64, 32, 16, 8, 4, 2, 1];
    const detailMipSizes = [32, 16, 8, 4, 2, 1];
    const cameraBroad = residualStatistics(packedMipLevel(
        "../public/assets/sky/cloud-base-average-rgba8-mips-64.bin",
        baseMipSizes, 16), broadResidual);
    const sourceBroad = residualStatistics(packedMipLevel(
        "../public/assets/sky/cloud-base-average-rgba8-mips-64.bin",
        baseMipSizes, 8), broadResidual);
    const cameraFine = residualStatistics(packedMipLevel(
        "../public/assets/sky/cloud-detail-average-rgba8-mips-32.bin",
        detailMipSizes, 8), fineResidual);

    for (const statistics of [cameraBroad, sourceBroad, cameraFine]) {
        assert.ok(Math.abs(statistics.mean) < 0.002,
            "balanced channel differences must remain mean-free after mip averaging");
    }
    assert.ok(cameraBroad.standardDeviation > 0.30);
    assert.ok(sourceBroad.standardDeviation > 0.17,
        "the near source footprint must retain broad 3-D ice structure");
    assert.ok(cameraFine.standardDeviation > 0.11);
});

test("camera and exact owner queries share the resolved high-cloud density", () => {
    const owner = section(
        "fn cloud_macro_owner_sample(",
        "fn cloud_macro_atlas_sample_with_footprint(",
    );
    const analytic = owner.indexOf(
        "cloud_morphology_cirrus_fibratus_subvoxel_density(",
    );
    const displaced = owner.indexOf("cloud_macro_displaced_boundary_density(");
    const resolved = owner.indexOf("cloud_resolved_high_ice_material(");
    assert.ok(analytic >= 0 && displaced > analytic && resolved > displaced);
    assert.match(owner, /result\.density = resolved_high_ice\.x/);
    assert.match(owner, /result\.detail = resolved_high_ice\.y/);

    const exactSource = section(
        "fn cloud_lv_macro_owner_transport_sample(",
        "fn cloud_lv_query_world_medium(",
    );
    assert.match(exactSource,
        /return cloud_macro_owner_sample\([\s\S]*?owner_index/);
    assert.match(exactSource,
        /cloud_lv_filtered_fibratus_owner_sample/,
        "source-grid Ci fibratus intentionally retains its cell-filtered conserved mass");
});

test("nonresident local lighting retains the atlas' complete encoded SDF depth", () => {
    const aggregate = section(
        "fn cloud_macro_atlas_sample_with_footprint(",
        "fn cloud_macro_atlas_sample_filtered(",
    );
    assert.match(aggregate,
        /encoded_sdf_reach_voxels = min\(\s*47\.0, max\(1\.0, cloud_macro_bindings\.header\.w\)\)/,
        "the no-query closure must consume the full finite SDF measurement");
    assert.match(aggregate,
        /reach_cap_km =\s*owner_voxel_km \* encoded_sdf_reach_voxels/);
    assert.doesNotMatch(aggregate, /reach_cap_km = owner_voxel_km \* 6\.0/,
        "a second shallow cap would wash dense high-ice interiors with boundary fill");
});

test("directional source visibility shares high-ice texture and finite Ci ray support", () => {
    const coupling = section(
        "fn cloud_coupling_filtered_macro_owner_sample(",
        "fn cloud_coupling_filtered_owner_extinction(",
    );
    assert.match(coupling,
        /cloud_resolved_high_ice_material\([\s\S]*?coupling_filter_radius_km,[\s\S]*?max\(0\.0, depth_filter_radius_km\),[\s\S]*?ray_direction_owner_local\)/);
    assert.match(coupling,
        /ray_direction_owner_local = vec3<f32>\([\s\S]*?ray_direction_renderer/);
    assert.match(coupling,
        /cloud_morphology_cirrus_fibratus_subvoxel_density\([\s\S]*?ray_step_length_km[\s\S]*?ray_direction_owner_local/);

    const producer = section(
        "@compute @workgroup_size(2, 2, 32)",
        "fn lighting_for_layer(",
    );
    assert.match(producer,
        /quadrature_support_km = abs\(interval_length\) \*[\s\S]*?depth_weight \* 0\.5/);
    assert.match(producer,
        /depth_filter_radius_km = quadrature_support_km \*[\s\S]*?0\.28867513459481287/);
    assert.match(producer,
        /cloud_coupling_masked_extinction\([\s\S]*?lateral_filter_radius_km,[\s\S]*?depth_filter_radius_km,[\s\S]*?quadrature_support_km, ray_direction_renderer\)/);
    assert.doesNotMatch(producer, /volume_filter_radius_km/,
        "lateral and axial footprints must not collapse to an isotropic mip");
});

test("thin raw-R high ice receives positive GL4 source-depth quadrature", () => {
    const qualifier = section(
        "fn cloud_coupling_mask_contains_resolved_high_ice(",
        "// Four adjacent columns share a suffix scan",
    );
    assert.match(qualifier, /genus >= 1 && genus <= 3/);
    assert.match(qualifier, /firstTrailingBit\(low\)/);
    assert.match(qualifier, /firstTrailingBit\(high\)/);

    const producer = section(
        "@compute @workgroup_size(2, 2, 32)",
        "fn lighting_for_layer(",
    );
    assert.match(shaderSource,
        /COUPLING_HIGH_ICE_GL_NODES = array<f32, 4>\([\s\S]*?-0\.8611363116,[\s\S]*?-0\.3399810436,[\s\S]*?0\.3399810436,[\s\S]*?0\.8611363116/);
    assert.match(shaderSource,
        /COUPLING_HIGH_ICE_GL_WEIGHTS = array<f32, 4>\([\s\S]*?0\.3478548451,[\s\S]*?0\.6521451549,[\s\S]*?0\.6521451549,[\s\S]*?0\.3478548451/);
    assert.match(producer,
        /for \(var quadrature = 0u; quadrature < 4u;[\s\S]*?if \(!refine_high_ice_depth && quadrature >= 2u\) \{ break; \}/,
        "non-high intervals must retain exactly two source-depth queries");
    assert.match(producer,
        /if \(refine_high_ice_depth\) \{[\s\S]*?COUPLING_HIGH_ICE_GL_NODES\[quadrature\][\s\S]*?COUPLING_HIGH_ICE_GL_WEIGHTS\[quadrature\][\s\S]*?\} else \{[\s\S]*?COUPLING_GL_NODES\[quadrature\][\s\S]*?COUPLING_GL_WEIGHTS\[quadrature\]/);
    assert.match(producer,
        /resolved_interval_tau = coupling_sample\.extinction \*[\s\S]*?interval_weight/);
    assert.match(producer,
        /interval_tau \+=\s*cloud_unresolved_footprint_optical_depth_signal\([\s\S]*?coupling_sample\.unresolved_ice_variance[\s\S]*?coupling_sample\.unresolved_ice_correlation/,
        "source Beer must use the same bounded unresolved-footprint law as camera transport");
    assert.doesNotMatch(producer,
        /interval_tau\s*=\s*max\(|max\(interval_tau,\s*spectral_extinction/,
        "thin support must be integrated, never broadened by a slab maximum");

    const gl2Nodes = [-0.5773502692, 0.5773502692];
    const gl2Weights = [1, 1];
    const gl4Nodes = [-0.8611363116, -0.3399810436,
        0.3399810436, 0.8611363116];
    const gl4Weights = [0.3478548451, 0.6521451549,
        0.6521451549, 0.3478548451];
    assert.ok(gl4Weights.every((weight) => weight > 0));
    assert.ok(Math.abs(gl4Weights.reduce((sum, weight) =>
        sum + weight, 0) - 2) < 1e-9);

    // A smooth component with roughly one-fifth of the interval's width lies
    // between both legacy nodes, matching the atlas-support/warped-knot scale
    // separation seen in Spissatus. Compare Beer visibility, not density.
    const component = (depth) =>
        Math.exp(-0.5 * ((depth + 0.2) / 0.1) ** 2);
    const integrate = (nodes, weights) => nodes.reduce((sum, node, index) =>
        sum + weights[index] * component(node), 0);
    const referenceSampleCount = 1 << 17;
    let referenceTau = 0;
    for (let index = 0; index < referenceSampleCount; index += 1) {
        const depth = -1 + (index + 0.5) * 2 / referenceSampleCount;
        referenceTau += component(depth) * 2 / referenceSampleCount;
    }
    const legacyTau = integrate(gl2Nodes, gl2Weights);
    const refinedTau = integrate(gl4Nodes, gl4Weights);
    const referenceVisibility = Math.exp(-referenceTau);
    const legacyVisibility = Math.exp(-legacyTau);
    const refinedVisibility = Math.exp(-refinedTau);
    assert.ok(legacyTau < referenceTau * 0.01,
        "the two-node rule should demonstrate the thin-support miss");
    assert.ok(Math.abs(refinedVisibility - referenceVisibility) <
        Math.abs(legacyVisibility - referenceVisibility) * 0.08,
    "GL4 should converge the Beer result after hitting the finite component");
    const slabMaximumTau = 2 * Math.max(...gl4Nodes.map(component));
    assert.ok(refinedTau < slabMaximumTau * 0.5,
        "positive weights must not stamp the sampled maximum across the slab");
});

test("Cirrostratus uses finite support-aware stochastic strata, not fixed shell nodes", () => {
    const classifier = section(
        "fn is_sheet_layer(",
        "fn sheet_node_source_radiance(",
    );
    assert.match(classifier,
        /return genus == 5 \|\| genus == 6 \|\|\s*\(genus == 8 && species != 16\)/);
    assert.doesNotMatch(classifier, /return[^;]*genus == 3/);

    const march = section("fn march_layer(", "struct HydrometeorTransport");
    assert.match(march, /if \(genus == 3\) \{ maximum_step_km = 0\.12; \}/);
    assert.match(march, /production_layer_traversal_event\(/);
    assert.match(march, /finite_segment_occupied/);
    assert.match(march, /stratum_jitter = fract\(/);
    assert.match(march, /guarded_jitter = mix\(0\.08, 0\.92, stratum_jitter\)/);

    const fixedSheet = section("fn march_sheet_layer(", "fn march_layer(");
    assert.match(fixedSheet, /array<f32, 12>/,
        "the fixed rule remains available only for its qualified low/middle decks");
});

test("the high-ice residual is bounded, symmetric, and preserves raw-R support", () => {
    const amplitudes = [0.14, 0.20, 0.30, 0.43, 0.46, 0.54, 0.56, 0.60, 0.62, 0.66];
    const residuals = Array.from({ length: 145 }, (_, index) =>
        -0.72 + index * 0.01);
    const resolve = (baseDensity, residual, amplitude, coreScale) => {
        const boundedBase = Math.min(1, Math.max(0, baseDensity));
        const boundedResidual = Math.min(0.72, Math.max(-0.72, residual));
        const capacity = Math.min(boundedBase, 1 - boundedBase);
        const contrast = Math.min(1, 2 * amplitude * coreScale);
        return Math.min(1, Math.max(0,
            boundedBase + boundedResidual * capacity * contrast));
    };
    for (const amplitude of amplitudes) {
        for (const coreScale of [0.72, 0.86, 1]) {
            for (const baseDensity of [0, 0.02, 0.2, 0.5, 0.8, 0.98, 1]) {
                const resolved = residuals.map((residual) =>
                    resolve(baseDensity, residual, amplitude, coreScale));
                assert.ok(Math.min(...resolved) >= 0);
                assert.ok(Math.max(...resolved) <= 1);
                const mean = resolved.reduce((sum, value) => sum + value, 0) /
                    resolved.length;
                assert.ok(Math.abs(mean - baseDensity) < 1e-12,
                    `symmetric residual changed raw-R mass at ${baseDensity}/${amplitude}/${coreScale}`);
            }
        }
    }
    assert.equal(resolve(0, 0.72, 0.66, 1), 0,
        "a residual must not manufacture condensate outside atlas support");
    assert.equal(resolve(1, -0.72, 0.66, 1), 1,
        "a residual must not excavate an atlas-R cell with no symmetric headroom");
});

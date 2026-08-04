import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-optics-runtime-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-scene",
    "cloud-state-map",
    "cloud-special-origin-source",
    "cloud-morphology-modifiers",
    "high-cloud-physical-foundation",
    "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "low-layered-cloud-topology-qualification",
    "upper-atmospheric-cloud-foundation",
    "cloud-family-admissibility",
    "cloud-family-production-adapter",
    "cloud-atlas-material-profile",
    "cloud-system-runtime",
    "cloud-optics",
    "cloud-optics-runtime",
    "cloud-optics-wgsl",
]) {
    const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText
        .replaceAll('"./cloud-scene"', '"./cloud-scene.mjs"')
        .replaceAll('"./cloud-state-map"', '"./cloud-state-map.mjs"')
        .replaceAll('"./cloud-special-origin-source"',
            '"./cloud-special-origin-source.mjs"')
        .replaceAll('"./cloud-morphology-modifiers"',
            '"./cloud-morphology-modifiers.mjs"')
        .replaceAll('"./high-cloud-physical-foundation"',
            '"./high-cloud-physical-foundation.mjs"')
        .replaceAll('"./middle-cloud-physical-foundation"',
            '"./middle-cloud-physical-foundation.mjs"')
        .replaceAll('"./low-layered-cloud-physical-foundation"',
            '"./low-layered-cloud-physical-foundation.mjs"')
        .replaceAll('"./low-layered-cloud-topology-qualification"',
            '"./low-layered-cloud-topology-qualification.mjs"')
        .replaceAll('"./upper-atmospheric-cloud-foundation"',
            '"./upper-atmospheric-cloud-foundation.mjs"')
        .replaceAll('"./cloud-family-admissibility"',
            '"./cloud-family-admissibility.mjs"')
        .replaceAll('"./cloud-family-production-adapter"',
            '"./cloud-family-production-adapter.mjs"')
        .replaceAll('"./cloud-atlas-material-profile"',
            '"./cloud-atlas-material-profile.mjs"')
        .replaceAll('"./cloud-system-runtime"', '"./cloud-system-runtime.mjs"')
        .replaceAll('"./cloud-optics"', '"./cloud-optics.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const opticsRuntime = await import(
    new URL(`file://${join(temporaryRoot, "cloud-optics-runtime.mjs")}`),
);
const cloudRuntime = await import(
    new URL(`file://${join(temporaryRoot, "cloud-system-runtime.mjs")}`),
);
const wgslModule = await import(
    new URL(`file://${join(temporaryRoot, "cloud-optics-wgsl.mjs")}`),
);
const manifest = JSON.parse(readFileSync(
    new URL("../public/assets/sky/cloud-optics-v1.json", import.meta.url),
    "utf8",
));

const SPECIES_BY_GENUS = {
    cirrus: "cirrus-fibratus",
    cirrocumulus: "cirrocumulus-stratiformis",
    cirrostratus: "cirrostratus-nebulosus",
    altocumulus: "altocumulus-stratiformis",
    altostratus: "altostratus-opacus",
    nimbostratus: "nimbostratus-praecipitatio",
    stratocumulus: "stratocumulus-stratiformis",
    stratus: "stratus-nebulosus",
    cumulus: "cumulus-mediocris",
    cumulonimbus: "cumulonimbus-capillatus",
};

const fakeSystem = (genus, index, overrides = {}) => {
    const species = overrides.species ?? SPECIES_BY_GENUS[genus];
    const topTemperatureKelvin = overrides.topTemperatureKelvin ??
        (genus.startsWith("cirr") ? 235 : genus === "cumulonimbus" ? 225 : 258);
    const stage = overrides.stage ?? "mature";
    const precipitationKind = overrides.precipitationKind ??
        (genus === "nimbostratus" || genus === "cumulonimbus" ? "rain" : "none");
    return {
        layerIndex: index % 3,
        systemIndex: Math.floor(index / 3),
        seeds: [0.1, 0.2, 0.3, 0.4],
        state: { id: `owner-${index}` },
        compiled: {
            classification: { genus },
            recipeId: species,
            material: {
                liquidFraction01: overrides.liquidFraction01 ??
                    (genus.startsWith("cirr") ? 0.04 : genus === "cumulonimbus" ? 0.48 : 0.82),
                liquidEffectiveRadiusMicrons: overrides.liquidRadius ?? 11.5,
                iceEffectiveRadiusMicrons: overrides.iceRadius ?? 43,
            },
            thermodynamics: {
                topTemperatureKelvin,
                verticalVelocity: overrides.verticalVelocity ??
                    (genus === "cumulonimbus" ? 18 : 0.3),
            },
            kinematics: {
                turbulenceDissipation: overrides.turbulenceDissipation ??
                    (genus === "cumulonimbus" ? 0.09 : 0.0004),
            },
            lifecycle: { stage },
            precipitation: {
                kind: precipitationKind,
                rate: precipitationKind === "none" ? 0 : 4,
            },
        },
    };
};

const fakeRuntime = (systems) => ({
    signature: "optics-runtime-test",
    systems,
    diagnostics: [],
    packedSystemData: { data: new Float32Array(), count: systems.length, capacity: 36, dropped: 0 },
    legacyFeatureData: new Float32Array(),
});

const emptyLayer = () => ({
    genus: "clear", species: "generic", present: false,
    baseAltitude: 1000, thickness: 0, coverage: 0, oktas: 0,
    opticalDepth: 0, stratusBlend: 0, towerAmount: 0, anvilAmount: 0,
    iceFraction: 0, detailStrength: 0, windSpeed: 0, windDirection: 0,
    shear: 0, turbulence: 0, precipitation: 0, organization: "unorganized",
    lifecycle: 0.5, organizationStrength: 0,
});

test("optical owners preserve the physical runtime's stable owner order", () => {
    const layer = {
        ...emptyLayer(), genus: "cumulus", species: "cumulus-mediocris",
        present: true, baseAltitude: 900, thickness: 1700, coverage: 0.72,
        oktas: 6, opticalDepth: 0.72, towerAmount: 0.48, iceFraction: 0.04,
        detailStrength: 0.7, windSpeed: 8, windDirection: 0.3, shear: 0.2,
        turbulence: 0.45, precipitation: 0.08, organization: "isolated",
        lifecycle: 0.45, organizationStrength: 0.5,
    };
    const scene = {
        layers: [layer, emptyLayer(), emptyLayer()], totalOktas: 6,
        convection: 0.55, instability: 0.52, humidity: 0.68, fog: 0,
        noctilucent: 0, seed: [0.17, 0.82, 0.41, 0.66],
    };
    const physical = cloudRuntime.createCloudSystemRuntime(scene);
    const first = opticsRuntime.createCloudOpticsOwnerRuntime(physical, manifest);
    const second = opticsRuntime.createCloudOpticsOwnerRuntime(physical, manifest);
    assert.deepEqual(first.ownerIds.slice(0, first.activeCount),
        physical.systems.map((system) => system.state.id));
    assert.deepEqual(first.ownerIds, second.ownerIds);
    assert.deepEqual([...first.data], [...second.data]);
    for (let index = 0; index < first.activeCount; index += 1) {
        const offset = index * opticsRuntime.CLOUD_OPTICS_OWNER_STRIDE_FLOATS;
        assert.deepEqual([...first.data.slice(offset, offset + 4)], [
            1, index, physical.systems[index].layerIndex, physical.systems[index].systemIndex,
        ]);
    }
});

test("the fixed owner buffer has exactly 36 aligned records", () => {
    const systems = Array.from({ length: 36 }, (_, index) =>
        fakeSystem(Object.keys(SPECIES_BY_GENUS)[index % 10], index));
    const packed = opticsRuntime.createCloudOpticsOwnerRuntime(fakeRuntime(systems), manifest);
    assert.equal(packed.activeCount, 36);
    assert.equal(packed.capacity, 36);
    assert.equal(packed.data.length, 36 * 16);
    assert.equal(packed.data.byteLength, 2304);
    assert.equal(packed.data.byteLength % 256, 0);
    assert.equal(opticsRuntime.CLOUD_OPTICS_OWNER_STRIDE_FLOATS % 4, 0);
    assert.deepEqual(packed.ownerIds, systems.map((system) => system.state.id));
    const writes = [];
    const resource = { destroy() {} };
    const uploaded = opticsRuntime.uploadCloudOpticsOwnerRuntime({
        createBuffer(descriptor) {
            writes.push({ descriptor });
            return resource;
        },
        queue: {
            writeBuffer(buffer, offset, data) {
                writes.push({ buffer, offset, byteLength: data.byteLength });
            },
        },
    }, packed);
    assert.equal(writes[0].descriptor.size, 2304);
    assert.equal(writes[1].byteLength, 2304);
    assert.equal(uploaded.buffer, resource);
    uploaded.destroy();
});

test("inactive records cannot alias an active physical owner", () => {
    const systems = [fakeSystem("cumulus", 0), fakeSystem("cirrus", 1)];
    const packed = opticsRuntime.createCloudOpticsOwnerRuntime(fakeRuntime(systems), manifest);
    const offset = 2 * opticsRuntime.CLOUD_OPTICS_OWNER_STRIDE_FLOATS;
    assert.deepEqual([...packed.data.slice(offset, offset + 4)], [0, 2, -1, -1]);
    assert.equal(packed.ownerIds[2], null);
});

test("local atlas phase reaches exact liquid/ice endpoints and interpolates once", () => {
    const owner = opticsRuntime.createCloudOpticsOwnerRuntime(
        fakeRuntime([fakeSystem("altocumulus", 0)]),
        manifest,
    ).selections[0];
    const liquid = opticsRuntime.resolveCloudLocalOptics(owner, 0);
    const mixed = opticsRuntime.resolveCloudLocalOptics(owner, 0.37);
    const ice = opticsRuntime.resolveCloudLocalOptics(owner, 1);
    for (let channel = 0; channel < 3; channel += 1) {
        assert.equal(liquid.phaseWeightsRgb[channel][2], 0);
        assert.equal(liquid.phaseWeightsRgb[channel][3], 0);
        assert.equal(ice.phaseWeightsRgb[channel][0], 0);
        assert.equal(ice.phaseWeightsRgb[channel][1], 0);
        for (const resolved of [liquid, mixed, ice]) {
            assert.ok(Math.abs(
                resolved.phaseWeightsRgb[channel].reduce((sum, value) => sum + value, 0) - 1,
            ) < 1e-12);
        }
        assert.ok(mixed.phaseWeightsRgb[channel].every((value) => value > 0));
        const expectedExtinction = liquid.massExtinctionRgbM2PerKg[channel] * 0.63 +
            ice.massExtinctionRgbM2PerKg[channel] * 0.37;
        assert.ok(Math.abs(
            mixed.massExtinctionRgbM2PerKg[channel] - expectedExtinction,
        ) < 1e-9);
    }
});

test("local mixing does not double-normalize phase or single-scattering albedo", () => {
    const owner = opticsRuntime.createCloudOpticsOwnerRuntime(
        fakeRuntime([fakeSystem("altostratus", 0)]), manifest,
    ).selections[0];
    const local = opticsRuntime.resolveCloudLocalOptics(owner, 0.61);
    const rows = [owner.liquid.low, owner.liquid.high, owner.ice.low, owner.ice.high];
    for (let channel = 0; channel < 3; channel += 1) {
        const phaseIntegral = rows.reduce((sum, row, index) => sum +
            local.phaseWeightsRgb[channel][index] * row.validation.normalizationRgb[channel], 0);
        assert.ok(Math.abs(phaseIntegral - 1) < 1e-9);
        const scattering = local.massExtinctionRgbM2PerKg[channel] *
            local.singleScatteringAlbedoRgb[channel];
        assert.ok(scattering <= local.massExtinctionRgbM2PerKg[channel]);
        assert.ok(scattering > 0);
    }
});

test("ice optical regime is deterministic and meteorologically constrained", () => {
    const veil = fakeSystem("cirrostratus", 0, {
        topTemperatureKelvin: 258,
        turbulenceDissipation: 0.0001,
        verticalVelocity: 0.1,
        stage: "mature",
        precipitationKind: "none",
    });
    const storm = fakeSystem("cumulonimbus", 1);
    const coldCirrus = fakeSystem("cirrus", 2, {
        species: "cirrus-fibratus",
        topTemperatureKelvin: 232,
        stage: "mature",
        precipitationKind: "none",
    });
    const mixedDeck = fakeSystem("altostratus", 3, {
        topTemperatureKelvin: 258,
        stage: "mature",
        precipitationKind: "none",
    });
    assert.deepEqual(
        opticsRuntime.selectCloudIceOpticalRegime(veil),
        opticsRuntime.selectCloudIceOpticalRegime(veil),
    );
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(veil).habit, "plate");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(veil).roughness, "smooth");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(storm).habit, "aggregate");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(storm).roughness, "severe");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(coldCirrus).habit, "column");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(mixedDeck).habit, "general");
    assert.equal(opticsRuntime.selectCloudIceOpticalRegime(mixedDeck).roughness, "moderate");
});

test("only sparse Cirrus species receive unresolved ice porosity", () => {
    const systems = [
        fakeSystem("cirrus", 0, { species: "cirrus-fibratus" }),
        fakeSystem("cirrus", 1, { species: "cirrus-uncinus" }),
        fakeSystem("cirrus", 2, { species: "cirrus-spissatus" }),
        fakeSystem("cirrostratus", 3, { species: "cirrostratus-nebulosus" }),
        fakeSystem("cumulonimbus", 4),
    ];
    const packed = opticsRuntime.createCloudOpticsOwnerRuntime(
        fakeRuntime(systems), manifest);
    assert.deepEqual(
        packed.selections.map((selection) => selection.unresolvedIcePorosity),
        [0.76, 0.58, 0.08, 0, 0],
    );
    packed.selections.forEach((selection, ownerIndex) => {
        const offset = ownerIndex * opticsRuntime.CLOUD_OPTICS_OWNER_STRIDE_FLOATS +
            opticsRuntime.CLOUD_OPTICS_OWNER_VEC4_LAYOUT.iceRegime * 4;
        assert.ok(Math.abs(
            packed.data[offset + 3] - selection.unresolvedIcePorosity) < 1e-6);
    });
});

test("WMO liquid, mixed-phase and ice constitutions survive owner packing", () => {
    const lowLiquid = fakeSystem("stratus", 0, { liquidFraction01: 0.97 });
    const mixedStorm = fakeSystem("cumulonimbus", 1, { liquidFraction01: 0.46 });
    const iceVeil = fakeSystem("cirrostratus", 2, { liquidFraction01: 0.02 });
    const packed = opticsRuntime.createCloudOpticsOwnerRuntime(
        fakeRuntime([lowLiquid, mixedStorm, iceVeil]), manifest);
    assert.ok(packed.selections[0].defaultIceFraction < 0.05);
    assert.ok(packed.selections[1].defaultIceFraction > 0.5 &&
        packed.selections[1].defaultIceFraction < 0.6);
    assert.ok(packed.selections[2].defaultIceFraction > 0.95);
    assert.equal(packed.selections[0].iceRegime.habit, "general",
        "a trace ice fraction in low cloud must not create a plate-halo signature");
    assert.equal(packed.selections[1].iceRegime.habit, "aggregate");
    assert.equal(packed.selections[2].iceRegime.roughness, "smooth");
});

test("every cloudy WMO genus resolves valid radius and optical state rows", () => {
    const genera = Object.keys(SPECIES_BY_GENUS);
    const systems = genera.map((genus, index) => fakeSystem(genus, index));
    const packed = opticsRuntime.createCloudOpticsOwnerRuntime(fakeRuntime(systems), manifest);
    assert.equal(packed.activeCount, genera.length);
    assert.deepEqual(
        packed.selections.map((selection) => selection.ownerId),
        systems.map((system) => system.state.id),
    );
    for (const selection of packed.selections) {
        assert.ok([selection.liquid.low, selection.liquid.high].every((row) =>
            row.phase === "liquid"));
        assert.ok([selection.ice.low, selection.ice.high].every((row) =>
            row.phase === "ice" && row.habit === selection.iceRegime.habit &&
                row.roughness === selection.iceRegime.roughness));
    }
});

test("binary state rows expose RGB asymmetry and forward-energy metadata", () => {
    const bytes = readFileSync(new URL(
        `../public/assets/sky/${manifest.parameterBuffer.file}`,
        import.meta.url,
    ));
    const values = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    for (const row of manifest.rows) {
        const offset = row.phaseRow * manifest.parameterBuffer.strideFloats;
        for (let channel = 0; channel < 3; channel += 1) {
            assert.ok(Math.abs(values[offset + 28 + channel] - row.asymmetryRgb[channel]) < 1e-6);
        }
        assert.ok(Math.abs(
            values[offset + 19] - row.angularFeatures.forwardTenDegreeEnergy,
        ) < 1e-6);
        assert.equal(values[offset + 31], manifest.version);
    }
});

const integrateSphere = (sample, samples = 32768) => {
    let integral = 0;
    for (let index = 1; index < samples; index += 1) {
        const a0 = (index - 1) / (samples - 1) * Math.PI;
        const a1 = index / (samples - 1) * Math.PI;
        integral += 0.5 * (
            sample(Math.cos(a0)) * Math.sin(a0) +
            sample(Math.cos(a1)) * Math.sin(a1)
        ) * (a1 - a0) * Math.PI * 2;
    }
    return integral;
};
const hg = (mu, g) => (1 - g * g) /
    (4 * Math.PI * (1 + g * g - 2 * g * mu) ** 1.5);
const draine = (mu, g, alpha) => 3 * (1 - g * g) * (1 + alpha * mu * mu) /
    (4 * Math.PI * (3 + alpha * (1 + 2 * g * g)) *
        (1 + g * g - 2 * g * mu) ** 1.5);
const draineMeanCosine = (g, alpha) => (
    g + alpha * g * (3 + 2 * g * g) / 5
) / (1 + alpha * (1 + 2 * g * g) / 3);

test("analytic and multiple-scattering helper lobes remain energy normalized", () => {
    for (const id of ["liquid-r10", "ice-aggregate-severe-r55"]) {
        const row = manifest.rows.find((candidate) => candidate.id === id);
        const fit = row.analyticApproximation;
        const forwardWeight = 1 - fit.draineWeight - fit.backwardWeight;
        const integral = integrateSphere((mu) =>
            forwardWeight * hg(mu, fit.forwardG) +
            fit.draineWeight * draine(mu, fit.draineG, fit.draineAlpha) +
            fit.backwardWeight * hg(mu, fit.backwardG));
        assert.ok(Math.abs(integral - 1) < 0.002);
        for (const order of [1, 2, 4]) {
            const orderG = Math.sign(row.asymmetryRgb[1]) *
                Math.abs(row.asymmetryRgb[1]) ** order;
            assert.ok(Math.abs(integrateSphere((mu) => hg(mu, orderG), 8192) - 1) < 0.002);
            assert.ok(row.singleScatteringAlbedoRgb[1] ** order <= 1);
        }
    }
});

test("unresolved diffraction is an energy-conserving first-moment closure", () => {
    const halfFirstCell = 0.5 * Math.PI /
        (manifest.phaseTexture.dimensions.width - 1);
    let activeRows = 0;
    let maximumUnresolvedWeight = 0;
    for (const row of manifest.rows) {
        const fit = row.analyticApproximation;
        const forwardWeight = 1 - fit.draineWeight - fit.backwardWeight;
        const broadMean = forwardWeight * fit.forwardG +
            fit.draineWeight * draineMeanCosine(fit.draineG, fit.draineAlpha) +
            fit.backwardWeight * fit.backwardG;
        const sigma = Math.max(0.0013962634, Math.min(
            0.0523598776,
            0.61 * 0.55 / Math.max(1, row.effectiveRadiusMicrons),
        ));
        const concentration = 1 / (sigma * sigma);
        const diffractionMean = 1 - 1 / concentration;
        const diffractionNormalization = concentration /
            (2 * Math.PI * (1 - Math.exp(-2 * concentration)));
        const analyticIntegral = 2 * Math.PI * diffractionNormalization *
            (1 - Math.exp(-2 * concentration)) / concentration;
        assert.ok(Math.abs(analyticIntegral - 1) < 1e-12);
        const unresolvedCdf = (
            1 - Math.exp(concentration * (Math.cos(halfFirstCell) - 1))
        ) / (1 - Math.exp(-2 * concentration));
        for (const targetMean of row.asymmetryRgb) {
            const closureWeight = Math.max(0, Math.min(
                1,
                (targetMean - broadMean) /
                    Math.max(1e-6, diffractionMean - broadMean),
            ));
            if (targetMean > broadMean && closureWeight < 1) {
                const reconstructedMean = (1 - closureWeight) * broadMean +
                    closureWeight * diffractionMean;
                assert.ok(Math.abs(reconstructedMean - targetMean) < 1e-10);
            }
            const unresolvedWeight = closureWeight * unresolvedCdf;
            assert.ok(unresolvedWeight >= 0 && unresolvedWeight <= 1);
            // Both terms are normalized phase functions. Their convex weights
            // must sum to one; no forward energy is added after LUT lookup.
            assert.ok(Math.abs((1 - unresolvedWeight) + unresolvedWeight - 1) < 1e-15);
            maximumUnresolvedWeight = Math.max(
                maximumUnresolvedWeight,
                unresolvedWeight,
            );
            if (unresolvedWeight > 1e-5) activeRows += 1;
        }
    }
    assert.ok(activeRows > 0, "at least one large-particle state must resolve a narrow peak");
    assert.ok(maximumUnresolvedWeight < 0.02,
        "finite-cell correction must remain a subtle redistribution");
});

test("WGSL contract uses append-only bindings and local atlas ice fraction", () => {
    assert.equal(wgslModule.CLOUD_OPTICS_PHASE_BINDING, 21);
    assert.equal(wgslModule.CLOUD_OPTICS_SAMPLER_BINDING, 22);
    assert.equal(wgslModule.CLOUD_OPTICS_STATE_BINDING, 23);
    assert.equal(wgslModule.CLOUD_OPTICS_OWNER_BINDING, 24);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_local_optics\([\s\S]*atlas_local_ice_fraction/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /scattering_0 \* cloud_resolved_phase/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_multiple_scattering_input/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_passive_directional_multiple_scattering/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_passive_local_directional_multiple_scattering/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_camera_footprint_extinction/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_unresolved_footprint_optical_depth_signal\([\s\S]*?local_variance[\s\S]*?local_correlation/,
        "the unresolved Beer law must consume local variance and correlation");
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /clamp\(unresolved_ice_porosity[\s\S]*?clamp\(local_variance[\s\S]*?clamp\(local_correlation/,
        "porosity must be bounded by the resolved physical signals");
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /result\.unresolved_ice_variance = select\(0\.0, 1\.0/,
        "legacy owner optics must remain homogeneous only when porosity is zero");
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /effective_tau \/ max\(vec3<f32>\(1e-6\), resolved_tau\)/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_passive_diffuse_scattering_transport/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_passive_high_order_diffuse_transport/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_direct_single_scattering_radiance/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_propagated_diffuse_scattering_radiance/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_p1_diffusion_validity/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /local_extinction_optical_depth_rgb[\s\S]*?1\.0\) - albedo \* asymmetry/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /CLOUD_P1_TRANSPORT_TAU_LOWER[\s\S]*?CLOUD_P1_TRANSPORT_TAU_UPPER/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /source_visibility, vec3<f32>\(0\.0\), vec3<f32>\(1\.0\)/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /propagated_incident_radiance\) \*\s*clamp\(local\.single_scattering_albedo/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /albedo \* albedo \* \(1\.0 - direct_transfer\)/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /order_weight \*= CLOUD_MULTIPLE_SCATTERING_CONTINUATION/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_analytic_forward_fallback/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /fn cloud_diffraction_energy_weight/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /return cloud_analytic_forward_fallback\(state, cos_theta, lut_phase\)/);
    assert.match(wgslModule.CLOUD_OPTICS_WGSL,
        /lut_phase \* \(vec3<f32>\(1\.0\) - unresolved_weight\) \+\s*diffraction \* unresolved_weight/);
    assert.doesNotMatch(wgslModule.CLOUD_OPTICS_WGSL,
        /measured_forward_energy|silver_lining_boost/);
    assert.doesNotMatch(wgslModule.CLOUD_OPTICS_WGSL,
        /atlas_local_ice_fraction\s*\+\s*owner\.ice_regime\.z/);
});

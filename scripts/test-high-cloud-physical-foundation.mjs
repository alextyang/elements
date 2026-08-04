import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-high-cloud-foundation-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const compile = (name) => {
    const source = readFileSync(new URL(
        `../components/backgrounds/sky/${name}.ts`,
        import.meta.url,
    ), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText.replace(
        /"\.\/high-cloud-physical-foundation"/g,
        '"./high-cloud-physical-foundation.mjs"',
    );
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
};

compile("high-cloud-physical-foundation");
compile("high-cloud-topology-qualification");
const foundation = await import(new URL(
    `file://${join(temporaryRoot, "high-cloud-physical-foundation.mjs")}`,
));
const topology = await import(new URL(
    `file://${join(temporaryRoot, "high-cloud-topology-qualification.mjs")}`,
));

const canonicalProductionState = {
    "cirrus-fibratus": { lifecycleStage: "mature", origin: "natural", organization: "aperiodic-field", precipitationKind: "none", instability: 0, turbulenceDissipation: 0.01, sedimentationStrength: 0.3, iceFraction: 1 },
    "cirrus-uncinus": { lifecycleStage: "precipitating", origin: "natural", organization: "isolated", precipitationKind: "virga", instability: 0, turbulenceDissipation: 0.01, sedimentationStrength: 0.8, iceFraction: 1 },
    "cirrus-spissatus": { lifecycleStage: "mature", origin: "cumulonimbus-genitus", organization: "banded", precipitationKind: "none", instability: 0, turbulenceDissipation: 0.02, sedimentationStrength: 0.4, iceFraction: 1 },
    "cirrus-castellanus": { lifecycleStage: "growing", origin: "natural", organization: "common-base-line", precipitationKind: "none", instability: 0.5, turbulenceDissipation: 0.03, sedimentationStrength: 0.2, iceFraction: 1 },
    "cirrus-floccus": { lifecycleStage: "decaying", origin: "castellanus-transition", organization: "isolated", precipitationKind: "virga", instability: 0, turbulenceDissipation: 0.03, sedimentationStrength: 0.6, iceFraction: 1 },
    "cirrocumulus-stratiformis": { lifecycleStage: "mature", origin: "gravity-wave", organization: "extensive-sheet", precipitationKind: "none", instability: 0, turbulenceDissipation: 0.01, sedimentationStrength: 0.1, iceFraction: 0.96 },
    "cirrocumulus-lenticularis": { lifecycleStage: "mature", origin: "orographic-wave", organization: "finite-wave-packet", precipitationKind: "none", instability: -0.2, turbulenceDissipation: 0.005, sedimentationStrength: 0.1, iceFraction: 0.96 },
    "cirrocumulus-castellanus": { lifecycleStage: "growing", origin: "natural", organization: "common-base-line", precipitationKind: "none", instability: 0.5, turbulenceDissipation: 0.02, sedimentationStrength: 0.1, iceFraction: 0.96 },
    "cirrocumulus-floccus": { lifecycleStage: "decaying", origin: "castellanus-transition", organization: "aperiodic-field", precipitationKind: "virga", instability: 0, turbulenceDissipation: 0.02, sedimentationStrength: 0.5, iceFraction: 0.96 },
};

test("all WMO Cirrus and Cirrocumulus species have explicit physical descriptors", () => {
    assert.equal(foundation.HIGH_CLOUD_SPECIES.length, 9);
    assert.deepEqual(
        Object.keys(foundation.HIGH_CLOUD_SPECIES_DESCRIPTORS).sort(),
        [...foundation.HIGH_CLOUD_SPECIES].sort(),
    );
    for (const species of foundation.HIGH_CLOUD_SPECIES) {
        const descriptor = foundation.HIGH_CLOUD_SPECIES_DESCRIPTORS[species];
        assert.equal(descriptor.species, species);
        assert.ok(descriptor.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.physicalConstitutionSource.startsWith(
            "https://cloudatlas.wmo.int/",
        ));
        assert.ok(descriptor.elementDiameterKm[0] > 0);
        assert.ok(descriptor.elementDiameterKm[1] > descriptor.elementDiameterKm[0]);
        assert.ok(descriptor.formationSpanKm[0] > descriptor.elementDiameterKm[0]);
        assert.ok(descriptor.requiredMorphology.length >= 3);
        assert.ok(descriptor.forbiddenMorphology.length >= 3);
        if (descriptor.genus === "cirrocumulus") {
            assert.equal(descriptor.angularConstraint.maximumElementDiameterDegrees, 1);
            assert.equal(descriptor.angularConstraint.appliesToFormationEnvelope, false);
            assert.equal(descriptor.opticalAppearance.permitsGreySourceFacingDensity, false);
        } else {
            assert.equal(descriptor.angularConstraint, null);
        }
    }
    assert.equal(
        foundation.HIGH_CLOUD_SPECIES_DESCRIPTORS["cirrus-spissatus"]
            .opticalAppearance.permitsSourceObscuration,
        true,
    );
});

test("formation extent is independent of the sub-degree Cc element constraint", () => {
    const wideSheet = foundation.qualifyHighCloudProjection({
        species: "cirrocumulus-stratiformis",
        elementDiameterKm: 0.22,
        formationSpanKm: 42,
        slantRangeKm: 18,
        viewElevationDegrees: 38,
    });
    assert.equal(wideSheet.valid, true);
    assert.ok(wideSheet.angularDiameterDegrees < 1);

    const giantGrain = foundation.qualifyHighCloudProjection({
        species: "cirrocumulus-stratiformis",
        elementDiameterKm: 0.22,
        formationSpanKm: 42,
        slantRangeKm: 10,
        viewElevationDegrees: 38,
    });
    assert.equal(giantGrain.valid, false);
    assert.ok(giantGrain.violations.includes(
        "cirrocumulus-element-is-not-sub-degree",
    ));
    assert.ok(foundation.highCloudMinimumSlantRangeKm(
        "cirrocumulus-stratiformis", 0.22, 38,
    ) > 12.6);
    assert.equal(foundation.highCloudMinimumSlantRangeKm(
        "cirrus-fibratus", 0.22, 38,
    ), 0);
});

test("each species supplies four deterministic, physically distinct macroforms", () => {
    for (const species of foundation.HIGH_CLOUD_SPECIES) {
        const variants = foundation.HIGH_CLOUD_TOPOLOGY_VARIANTS[species];
        assert.equal(variants.length, 4);
        const qualification = topology.qualifyHighCloudVariantSet(species);
        assert.equal(qualification.valid, true,
            `${species}: ${qualification.violations.join(", ")} (${qualification.minimumPairwiseSignatureDistance})`);
        assert.ok(qualification.minimumPairwiseSignatureDistance >=
            topology.HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT
                .minimumVariantSignatureDistance);
        assert.equal(
            foundation.selectHighCloudTopologyVariant(species, 5),
            variants[1],
        );
        assert.equal(
            foundation.selectHighCloudTopologyVariant(species, -5),
            variants[1],
        );
    }
});

test("topology variants cover only legal lifecycles and every reachable origin", () => {
    for (const species of foundation.HIGH_CLOUD_SPECIES) {
        const variants = foundation.HIGH_CLOUD_TOPOLOGY_VARIANTS[species];
        const contract = foundation.HIGH_CLOUD_REACHABILITY_CONTRACTS[species];
        for (const variant of variants) {
            for (const origin of variant.origins) {
                assert.ok(contract.origins.includes(origin),
                    `${species}/${variant.id} has illegal origin ${origin}`);
            }
            for (const stage of variant.lifecycleStages) {
                assert.ok(contract.lifecycleStages.includes(stage),
                    `${species}/${variant.id} has illegal lifecycle ${stage}`);
            }
        }
        const representedOrigins = new Set(variants.flatMap(({ origins }) => origins));
        for (const origin of contract.origins) {
            assert.ok(representedOrigins.has(origin),
                `${species} has no topology for reachable origin ${origin}`);
        }
    }
});

const microphysics = (overrides = {}) => foundation.sampleHighCloudLocalMicrophysics({
    species: "cirrus-uncinus",
    normalizedHeight: 0.5,
    trailFraction: 0,
    denseCoreFraction: 0.5,
    waveCrestFraction: 0,
    lifecycleStage: "mature",
    origin: "natural",
    temperatureKelvin: 225,
    turbulenceDissipation: 0.008,
    ...overrides,
});

test("microphysics is locally and vertically stratified rather than owner-global", () => {
    const upperSource = microphysics({ normalizedHeight: 0.9 });
    const lowerSource = microphysics({ normalizedHeight: 0.1 });
    const lowerTrail = microphysics({ normalizedHeight: 0.1, trailFraction: 1 });
    assert.ok(lowerSource.iceEffectiveRadiusMicrons >
        upperSource.iceEffectiveRadiusMicrons);
    assert.ok(lowerTrail.iceEffectiveRadiusMicrons >
        lowerSource.iceEffectiveRadiusMicrons);
    assert.ok(lowerTrail.sedimentationWeight > upperSource.sedimentationWeight);
    assert.ok(lowerTrail.terminalVelocityMetresPerSecond >
        upperSource.terminalVelocityMetresPerSecond);
    assert.ok(lowerTrail.habitFractions.aggregate >
        upperSource.habitFractions.aggregate);
});

test("all local microphysical states are bounded, normalized, and deterministic", () => {
    for (const species of foundation.HIGH_CLOUD_SPECIES) {
        for (const height of [0, 0.35, 0.75, 1]) {
            const input = {
                species,
                normalizedHeight: height,
                trailFraction: 1 - height,
                denseCoreFraction: height * 0.7,
                waveCrestFraction: 0.62,
                lifecycleStage: canonicalProductionState[species].lifecycleStage,
                origin: canonicalProductionState[species].origin,
                temperatureKelvin: species.startsWith("cirrus-") ? 222 : 238,
                turbulenceDissipation: 0.009,
            };
            const first = foundation.sampleHighCloudLocalMicrophysics(input);
            const second = foundation.sampleHighCloudLocalMicrophysics(input);
            assert.deepEqual(first, second);
            assert.ok(first.iceEffectiveRadiusMicrons >= 8 &&
                first.iceEffectiveRadiusMicrons <= 160);
            assert.ok(first.iceFraction >= (species.startsWith("cirrus-") ? 0.98 : 0.9));
            assert.ok(first.iceFraction <= 1);
            assert.ok(first.surfaceRoughness >= 0.08 && first.surfaceRoughness <= 0.92);
            assert.ok(first.relativeCondensate >= 0 && first.relativeCondensate <= 1);
            const habitSum = Object.values(first.habitFractions)
                .reduce((sum, value) => sum + value, 0);
            assert.ok(Math.abs(habitSum - 1) < 1e-12);
        }
    }
});

test("species-specific local optics preserve dense, smooth, and decaying regimes", () => {
    const spissatusFringe = microphysics({
        species: "cirrus-spissatus", denseCoreFraction: 0,
    });
    const spissatusCore = microphysics({
        species: "cirrus-spissatus", denseCoreFraction: 1,
    });
    assert.ok(spissatusCore.relativeCondensate > spissatusFringe.relativeCondensate);

    const lens = microphysics({
        species: "cirrocumulus-lenticularis",
        origin: "orographic-wave",
        waveCrestFraction: 1,
        temperatureKelvin: 248,
        turbulenceDissipation: 0.002,
    });
    assert.equal(lens.roughnessClass, "smooth");
    assert.ok(lens.iceFraction < 1 && lens.iceFraction >= 0.9,
        "Cc can retain a small strongly supercooled liquid fraction");

    const matureFloccus = microphysics({
        species: "cirrocumulus-floccus",
        lifecycleStage: "mature",
        origin: "castellanus-transition",
    });
    const decayingFloccus = microphysics({
        species: "cirrocumulus-floccus",
        lifecycleStage: "decaying",
        origin: "castellanus-transition",
    });
    assert.ok(decayingFloccus.sublimationFraction > matureFloccus.sublimationFraction);
    assert.ok(decayingFloccus.relativeCondensate < matureFloccus.relativeCondensate);
});

test("every high-cloud species has a legal production state", () => {
    for (const species of foundation.HIGH_CLOUD_SPECIES) {
        const qualification = foundation.qualifyHighCloudProductionState({
            species,
            ...canonicalProductionState[species],
        });
        assert.equal(qualification.legal, true,
            `${species}: ${qualification.violations.join(", ")}`);
    }
});

test("reachability rejects species aliases created by illegal state combinations", () => {
    const decayingCastellanus = foundation.qualifyHighCloudProductionState({
        species: "cirrocumulus-castellanus",
        ...canonicalProductionState["cirrocumulus-castellanus"],
        lifecycleStage: "decaying",
    });
    assert.equal(decayingCastellanus.legal, false);
    assert.ok(decayingCastellanus.violations.includes(
        "illegal-lifecycle-stage-for-species",
    ));
    const uncinusWithoutSedimentation = foundation.qualifyHighCloudProductionState({
        species: "cirrus-uncinus",
        ...canonicalProductionState["cirrus-uncinus"],
        sedimentationStrength: 0.02,
    });
    assert.equal(uncinusWithoutSedimentation.legal, false);
    assert.ok(uncinusWithoutSedimentation.violations.includes(
        "insufficient-sedimentation-for-species",
    ));
    const turbulentLens = foundation.qualifyHighCloudProductionState({
        species: "cirrocumulus-lenticularis",
        ...canonicalProductionState["cirrocumulus-lenticularis"],
        turbulenceDissipation: 0.1,
    });
    assert.equal(turbulentLens.legal, false);
    assert.ok(turbulentLens.violations.includes("excess-turbulence-for-species"));
});

test("only transient cavum-bearing Cirrocumulus may retain supercooled liquid", () => {
    const base = canonicalProductionState["cirrocumulus-stratiformis"];
    const transient = foundation.qualifyHighCloudProductionState({
        species: "cirrocumulus-stratiformis",
        ...base,
        iceFraction: 0.72,
        transientSupercooledCavum: true,
    });
    assert.equal(transient.legal, true, transient.violations.join(","));
    const ordinary = foundation.qualifyHighCloudProductionState({
        species: "cirrocumulus-stratiformis",
        ...base,
        iceFraction: 0.72,
    });
    assert.ok(ordinary.violations.includes(
        "insufficient-ice-fraction-for-high-cloud-species",
    ));
    const tooLiquid = foundation.qualifyHighCloudProductionState({
        species: "cirrocumulus-stratiformis",
        ...base,
        iceFraction: 0.4,
        transientSupercooledCavum: true,
    });
    assert.ok(tooLiquid.violations.includes(
        "insufficient-ice-fraction-for-high-cloud-species",
    ));
    const wrongGenus = foundation.qualifyHighCloudProductionState({
        species: "cirrus-fibratus",
        ...canonicalProductionState["cirrus-fibratus"],
        iceFraction: 0.72,
        transientSupercooledCavum: true,
    });
    assert.ok(wrongGenus.violations.includes(
        "insufficient-ice-fraction-for-high-cloud-species",
    ));
});

test("lifecycle transitions retain species identity only while it remains legal", () => {
    assert.equal(foundation.isLegalHighCloudLifecycleTransition(
        "cirrus-uncinus", "mature", "precipitating",
    ), true);
    assert.equal(foundation.isLegalHighCloudLifecycleTransition(
        "cirrus-uncinus", "precipitating", "decaying",
    ), true);
    assert.equal(foundation.isLegalHighCloudLifecycleTransition(
        "cirrocumulus-castellanus", "mature", "decaying",
    ), false, "a dissipating Cc castellanus should transition to floccus");
    assert.equal(foundation.isLegalHighCloudLifecycleTransition(
        "cirrocumulus-floccus", "mature", "decaying",
    ), true, "nonprecipitating floccus may decay without acquiring visible virga");
});

test("coherent production state returns only reachable species deterministically", () => {
    const state = {
        genus: "cirrocumulus",
        lifecycleStage: "mature",
        origin: "gravity-wave",
        organization: "finite-wave-packet",
        precipitationKind: "none",
        instability: 0,
        turbulenceDissipation: 0.005,
        sedimentationStrength: 0.2,
        iceFraction: 0.96,
    };
    const reachable = foundation.reachableHighCloudSpecies(state);
    assert.ok(reachable.includes("cirrocumulus-stratiformis"));
    assert.ok(reachable.includes("cirrocumulus-lenticularis"));
    assert.ok(!reachable.includes("cirrocumulus-castellanus"));
    assert.equal(
        foundation.selectReachableHighCloudSpecies(state, 1),
        reachable[1 % reachable.length],
    );
    assert.equal(
        foundation.selectReachableHighCloudSpecies(state, 1),
        foundation.selectReachableHighCloudSpecies(state, 1),
    );
});

test("nonfinite and nonphysical contract inputs fail rather than aliasing a valid state", () => {
    const invalid = foundation.qualifyHighCloudProductionState({
        species: "cirrus-fibratus",
        ...canonicalProductionState["cirrus-fibratus"],
        iceFraction: Number.NaN,
        turbulenceDissipation: -0.1,
    });
    assert.equal(invalid.legal, false);
    assert.ok(invalid.violations.includes("iceFraction-must-be-finite"));
    assert.ok(invalid.violations.includes(
        "turbulence-dissipation-must-be-nonnegative",
    ));
    assert.throws(() => foundation.qualifyHighCloudProjection({
        species: "cirrocumulus-stratiformis",
        elementDiameterKm: 0.1,
        formationSpanKm: Number.NaN,
        slantRangeKm: 20,
        viewElevationDegrees: 40,
    }), /formation span must be finite/);
    assert.throws(() => microphysics({
        turbulenceDissipation: -0.1,
    }), /must be nonnegative/);
});

const topologySignature = (species, variantIndex) =>
    foundation.highCloudTopologyVariantSignature(
        foundation.HIGH_CLOUD_TOPOLOGY_VARIANTS[species][variantIndex],
    );

test("aperiodic varied owner populations pass clone and grid constraints", () => {
    const points = [
        [0, 0], [1.1, 0.25], [2.45, -0.12], [0.38, 1.42],
        [1.82, 1.08], [3.2, 1.71], [0.05, 3.0], [2.15, 2.75],
    ];
    const instances = points.map(([centerEastKm, centerNorthKm], index) => ({
        variantId: foundation.HIGH_CLOUD_TOPOLOGY_VARIANTS["cirrus-fibratus"]
            [index % 4].id,
        centerEastKm,
        centerNorthKm,
        majorRadiusKm: 2 + index * 0.17,
        minorRadiusKm: 0.22 + index * 0.018,
        topologySignature: topologySignature("cirrus-fibratus", index % 4),
    }));
    const result = topology.qualifyHighCloudLayout(instances);
    assert.equal(result.valid, true, JSON.stringify(result));
    assert.ok(result.cloneFraction <=
        topology.HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT.maximumExactCloneFraction);
    assert.ok(result.projectedGridAutocorrelation <=
        topology.HIGH_CLOUD_TOPOLOGY_QUALIFICATION_CONTRACT
            .maximumProjectedGridAutocorrelation);
});

test("a cloned rectangular owner lattice fails loudly", () => {
    const signature = topologySignature("cirrocumulus-stratiformis", 0);
    const instances = [];
    for (let north = 0; north < 4; north += 1) {
        for (let east = 0; east < 4; east += 1) {
            instances.push({
                variantId: "extensive-ripple-sheet",
                centerEastKm: east,
                centerNorthKm: north,
                majorRadiusKm: 3,
                minorRadiusKm: 2,
                topologySignature: signature,
            });
        }
    }
    const result = topology.qualifyHighCloudLayout(instances);
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes("too-many-exact-macroshape-clones"));
    assert.ok(result.violations.includes(
        "projected-owner-layout-forms-a-repeated-grid",
    ));
    assert.ok(result.violations.includes("owner-spacing-is-too-regular"));
});

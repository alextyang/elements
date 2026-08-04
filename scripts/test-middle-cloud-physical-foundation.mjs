import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-middle-cloud-foundation-"));
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
        /"\.\/middle-cloud-physical-foundation"/g,
        '"./middle-cloud-physical-foundation.mjs"',
    );
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
};

compile("middle-cloud-physical-foundation");
compile("middle-cloud-topology-qualification");
const foundation = await import(new URL(
    `file://${join(temporaryRoot, "middle-cloud-physical-foundation.mjs")}`,
));
const topology = await import(new URL(
    `file://${join(temporaryRoot, "middle-cloud-topology-qualification.mjs")}`,
));

const canonicalState = {
    "altocumulus-stratiformis": { lifecycleStage: "mature", origin: "natural", organization: "extensive-sheet", precipitation: "none", instability: 0, turbulenceDissipation: 0.01, opticalDepth: 3 },
    "altocumulus-lenticularis": { lifecycleStage: "mature", origin: "orographic-wave", organization: "finite-wave-packet", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.004, opticalDepth: 4 },
    "altocumulus-castellanus": { lifecycleStage: "growing", origin: "natural", organization: "common-base-line", precipitation: "none", instability: 0.6, turbulenceDissipation: 0.03, opticalDepth: 5 },
    "altocumulus-floccus": { lifecycleStage: "decaying", origin: "castellanus-transition", organization: "detached-tufts", precipitation: "virga", instability: 0.1, turbulenceDissipation: 0.03, opticalDepth: 3 },
    "altocumulus-volutus": { lifecycleStage: "mature", origin: "shear-layer-roll", organization: "single-roll", precipitation: "none", instability: 0, turbulenceDissipation: 0.02, opticalDepth: 4 },
    "altostratus-translucidus": { lifecycleStage: "mature", origin: "frontal-ascent", organization: "frontal-shield", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.01, opticalDepth: 1.5 },
    "altostratus-opacus": { lifecycleStage: "mature", origin: "frontal-ascent", organization: "frontal-shield", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.01, opticalDepth: 8 },
    "altostratus-duplicatus": { lifecycleStage: "mature", origin: "superposed-fronts", organization: "superposed-shields", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.01, opticalDepth: 7 },
    "altostratus-undulatus": { lifecycleStage: "mature", origin: "gravity-wave", organization: "undulating-shield", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.01, opticalDepth: 5 },
    "altostratus-radiatus": { lifecycleStage: "mature", origin: "frontal-ascent", organization: "parallel-band-shield", precipitation: "none", instability: -0.2, turbulenceDissipation: 0.01, opticalDepth: 4 },
    "altostratus-praecipitatio": { lifecycleStage: "precipitating", origin: "frontal-ascent", organization: "precipitating-shield", precipitation: "rain", instability: -0.2, turbulenceDissipation: 0.02, opticalDepth: 12 },
};

test("all Ac species and required As state representations are explicit", () => {
    assert.equal(foundation.MIDDLE_CLOUD_REPRESENTATIONS.length, 11);
    for (const representation of foundation.MIDDLE_CLOUD_REPRESENTATIONS) {
        const descriptor = foundation.MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS[
            representation
        ];
        assert.equal(descriptor.representation, representation);
        assert.ok(descriptor.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.physicalConstitutionSource.startsWith(
            "https://cloudatlas.wmo.int/",
        ));
        assert.ok(descriptor.formationSpanKm[1] > descriptor.formationSpanKm[0]);
        assert.ok(descriptor.geometricDepthKm[1] > descriptor.geometricDepthKm[0]);
        assert.ok(descriptor.requiredMorphology.length >= 4);
        assert.ok(descriptor.forbiddenMorphology.length >= 4);
        if (descriptor.genus === "altocumulus") {
            assert.equal(descriptor.classificationAxis, "wmo-species");
            assert.ok(descriptor.elementDiameterKm);
            assert.equal(descriptor.angularConstraint.minimumElementDiameterDegrees, 1);
            assert.equal(descriptor.angularConstraint.maximumElementDiameterDegrees, 5);
            assert.equal(descriptor.rendererSpecies, representation);
        } else {
            assert.equal(descriptor.elementDiameterKm, null);
            assert.equal(descriptor.angularConstraint, null);
            assert.equal(descriptor.rendererSpecies, "altostratus-opacus");
            assert.equal(descriptor.classification.wmoSpecies, null);
            assert.equal(descriptor.permitsHalo, false);
        }
    }
});

test("Altostratus modes preserve WMO orthogonal taxonomy", () => {
    const descriptors = foundation.MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS;
    assert.deepEqual(
        [...descriptors["altostratus-translucidus"].classification.requiredVarieties],
        ["translucidus"],
    );
    assert.deepEqual(
        [...descriptors["altostratus-opacus"].classification.requiredVarieties],
        ["opacus"],
    );
    assert.deepEqual(
        [...descriptors["altostratus-duplicatus"].classification.requiredVarieties],
        ["duplicatus"],
    );
    assert.deepEqual(
        [...descriptors["altostratus-undulatus"].classification.requiredVarieties],
        ["undulatus"],
    );
    assert.deepEqual(
        [...descriptors["altostratus-radiatus"].classification.requiredVarieties],
        ["radiatus"],
    );
    assert.equal(descriptors["altostratus-undulatus"].transparency, "either");
    assert.deepEqual(
        [...descriptors["altostratus-praecipitatio"].classification
            .requiredSupplementaryFeatures],
        ["praecipitatio"],
    );
});

test("Ac element width stays between one and five degrees independently of formation span", () => {
    const valid = foundation.qualifyMiddleCloudProjection({
        representation: "altocumulus-stratiformis",
        elementDiameterKm: 1,
        formationSpanKm: 80,
        slantRangeKm: 20,
        viewElevationDegrees: 38,
    });
    assert.equal(valid.valid, true);
    assert.ok(valid.angularDiameterDegrees > 1 && valid.angularDiameterDegrees < 5);

    const tooSmall = foundation.qualifyMiddleCloudProjection({
        representation: "altocumulus-stratiformis",
        elementDiameterKm: 0.25,
        formationSpanKm: 80,
        slantRangeKm: 20,
        viewElevationDegrees: 38,
    });
    assert.equal(tooSmall.valid, false);
    assert.ok(tooSmall.violations.includes(
        "altocumulus-element-would-read-as-cirrocumulus",
    ));
    const tooLarge = foundation.qualifyMiddleCloudProjection({
        representation: "altocumulus-stratiformis",
        elementDiameterKm: 2,
        formationSpanKm: 80,
        slantRangeKm: 20,
        viewElevationDegrees: 38,
    });
    assert.equal(tooLarge.valid, false);
    assert.ok(tooLarge.violations.includes(
        "altocumulus-element-would-read-as-stratocumulus",
    ));
});

test("projection helper reports when no physical Ac scale fits a distant camera", () => {
    const nearby = foundation.middleCloudFeasibleElementDiameterKm(
        "altocumulus-stratiformis", 20, 40,
    );
    assert.equal(nearby.feasible, true);
    assert.ok(nearby.minimumKm >= 0.34 && nearby.maximumKm <= 1.75);
    const distant = foundation.middleCloudFeasibleElementDiameterKm(
        "altocumulus-stratiformis", 200, 40,
    );
    assert.equal(distant.feasible, false,
        "the owner must move/scale rather than silently resemble Cirrocumulus");
    assert.throws(() => foundation.middleCloudFeasibleElementDiameterKm(
        "altostratus-opacus", 20, 40,
    ), /continuous Altostratus/);
});

test("Altostratus optical modes enforce blur, opacity, precipitation, and no halos", () => {
    assert.equal(foundation.qualifyMiddleCloudOpticalState({
        representation: "altostratus-translucidus",
        opticalDepth: 1.5,
        sourceDiscVisibility: "blurred-position",
        haloVisible: false,
        precipitation: "none",
    }).valid, true);
    const sharpAlias = foundation.qualifyMiddleCloudOpticalState({
        representation: "altostratus-translucidus",
        opticalDepth: 1.5,
        sourceDiscVisibility: "sharp-outline",
        haloVisible: true,
        precipitation: "none",
    });
    assert.equal(sharpAlias.valid, false);
    assert.ok(sharpAlias.violations.includes("altostratus-never-shows-halo"));
    assert.ok(sharpAlias.violations.includes(
        "altostratus-source-outline-must-always-be-blurred",
    ));
    assert.ok(sharpAlias.violations.includes(
        "translucidus-must-reveal-blurred-source-position",
    ));
    const transparentOpacus = foundation.qualifyMiddleCloudOpticalState({
        representation: "altostratus-opacus",
        opticalDepth: 2,
        sourceDiscVisibility: "blurred-position",
        haloVisible: false,
        precipitation: "none",
    });
    assert.equal(transparentOpacus.valid, false);
    assert.ok(transparentOpacus.violations.includes(
        "opacus-must-conceal-source-over-greater-part",
    ));
    assert.equal(foundation.qualifyMiddleCloudOpticalState({
        representation: "altostratus-praecipitatio",
        opticalDepth: 10,
        sourceDiscVisibility: "concealed",
        haloVisible: false,
        precipitation: "none",
    }).valid, false);
});

test("each representation has four distinct deterministic macroforms", () => {
    for (const representation of foundation.MIDDLE_CLOUD_REPRESENTATIONS) {
        const variants = foundation.MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation];
        assert.equal(variants.length, 4);
        const result = topology.qualifyMiddleCloudVariantSet(representation);
        assert.equal(result.valid, true,
            `${representation}: ${result.violations} (${result.minimumPairwiseSignatureDistance})`);
        assert.equal(
            foundation.selectMiddleCloudTopologyVariant(representation, 6),
            variants[2],
        );
    }
});

test("topology states remain within legal origins and lifecycle stages", () => {
    for (const representation of foundation.MIDDLE_CLOUD_REPRESENTATIONS) {
        const variants = foundation.MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation];
        const contract = foundation.MIDDLE_CLOUD_REACHABILITY_CONTRACTS[representation];
        const origins = new Set();
        const stages = new Set();
        for (const variant of variants) {
            variant.origins.forEach((origin) => {
                origins.add(origin);
                assert.ok(contract.origins.includes(origin));
            });
            variant.lifecycleStages.forEach((stage) => {
                stages.add(stage);
                assert.ok(contract.lifecycleStages.includes(stage));
            });
        }
        contract.origins.forEach((origin) => assert.ok(origins.has(origin),
            `${representation} lacks topology for ${origin}`));
        contract.lifecycleStages.forEach((stage) => assert.ok(stages.has(stage),
            `${representation} lacks topology for ${stage}`));
    }
});

const sample = (overrides = {}) => foundation.sampleMiddleCloudLocalMicrophysics({
    representation: "altocumulus-stratiformis",
    normalizedHeight: 0.5,
    cellCoreFraction: 0.7,
    waveCrestFraction: 0.5,
    trailFraction: 0,
    lifecycleStage: "mature",
    origin: "natural",
    temperatureKelvin: 243,
    turbulenceDissipation: 0.008,
    opticalDepth: 3,
    precipitation: "none",
    ...overrides,
});

test("Ac mixed phase retains top liquid while ice and virga increase below", () => {
    const top = sample({ normalizedHeight: 0.92 });
    const base = sample({ normalizedHeight: 0.08 });
    const trail = sample({ normalizedHeight: 0.08, trailFraction: 1,
        precipitation: "virga" });
    assert.ok(top.liquidFraction > base.liquidFraction);
    assert.ok(base.iceFraction > top.iceFraction);
    assert.ok(trail.iceFraction > base.iceFraction);
    assert.ok(trail.iceEffectiveRadiusMicrons > base.iceEffectiveRadiusMicrons);
    assert.ok(trail.virgaFraction > base.virgaFraction);
    assert.ok(top.longwaveCoolingSourceWeight >
        base.longwaveCoolingSourceWeight);
    const middle = sample({ normalizedHeight: 0.46 });
    assert.ok(middle.radiativelyDrivenTurbulenceWeight >
        top.radiativelyDrivenTurbulenceWeight);
    assert.ok(top.liquidFraction > 0,
        "ordinary Ac remains droplet-bearing even when mixed phase");
});

test("a cold eroding Ac trail can become an all-ice diffuse remnant", () => {
    const remnant = sample({
        representation: "altocumulus-floccus",
        normalizedHeight: 0,
        trailFraction: 1,
        cellCoreFraction: 0,
        lifecycleStage: "decaying",
        origin: "castellanus-transition",
        temperatureKelvin: 228,
        precipitation: "virga",
    });
    assert.equal(remnant.iceFraction, 1);
    assert.equal(remnant.liquidFraction, 0);
    assert.ok(remnant.sublimationFraction > 0.6);
});

test("Altostratus resolves lower liquid, middle mixed, and upper ice parts", () => {
    const state = (height) => sample({
        representation: "altostratus-opacus",
        normalizedHeight: height,
        lifecycleStage: "mature",
        origin: "frontal-ascent",
        temperatureKelvin: 248,
        opticalDepth: 8,
    });
    const lower = state(0.05);
    const middle = state(0.52);
    const upper = state(0.96);
    assert.ok(lower.liquidFraction > middle.liquidFraction);
    assert.ok(middle.liquidFraction > upper.liquidFraction);
    assert.ok(upper.iceFraction > middle.iceFraction);
    assert.ok(middle.iceFraction > lower.iceFraction);
    assert.ok(lower.sourceDiscBlurSigmaDegrees > 0);
    assert.equal(lower.orientedIceHaloEligible, false);
    assert.equal(upper.orientedIceHaloEligible, false);
    assert.equal(lower.coronaOrIrisationEligible, false);
});

test("all microphysical outputs are bounded, normalized, and deterministic", () => {
    for (const representation of foundation.MIDDLE_CLOUD_REPRESENTATIONS) {
        for (const height of [0, 0.35, 0.7, 1]) {
            const input = {
                representation,
                normalizedHeight: height,
                cellCoreFraction: 0.62,
                waveCrestFraction: 0.4,
                trailFraction: 1 - height,
                lifecycleStage: canonicalState[representation].lifecycleStage,
                origin: canonicalState[representation].origin,
                temperatureKelvin: 246,
                turbulenceDissipation: 0.008,
                opticalDepth: canonicalState[representation].opticalDepth,
                precipitation: canonicalState[representation].precipitation,
            };
            const first = foundation.sampleMiddleCloudLocalMicrophysics(input);
            assert.deepEqual(first,
                foundation.sampleMiddleCloudLocalMicrophysics(input));
            assert.ok(Math.abs(first.liquidFraction + first.iceFraction - 1) < 1e-12);
            assert.ok(first.relativeCondensate >= 0 && first.relativeCondensate <= 1);
            assert.ok(first.iceSurfaceRoughness >= 0.08 &&
                first.iceSurfaceRoughness <= 0.94);
            const habitSum = Object.values(first.iceHabitFractions)
                .reduce((sum, value) => sum + value, 0);
            assert.ok(Math.abs(habitSum - 1) < 1e-12);
        }
    }
});

test("every representation is reachable in all five lighting environments", () => {
    for (const representation of foundation.MIDDLE_CLOUD_REPRESENTATIONS) {
        for (const environment of foundation.MIDDLE_CLOUD_BENCHMARK_ENVIRONMENTS) {
            const result = foundation.qualifyMiddleCloudProductionState({
                representation,
                ...canonicalState[representation],
                environment,
            });
            assert.equal(result.legal, true,
                `${representation}/${environment}: ${result.violations}`);
        }
    }
});

test("reachability rejects unphysical aliases", () => {
    const calmCastellanus = foundation.qualifyMiddleCloudProductionState({
        representation: "altocumulus-castellanus",
        ...canonicalState["altocumulus-castellanus"],
        instability: 0,
        environment: "day-oblique-natural",
    });
    assert.equal(calmCastellanus.legal, false);
    assert.ok(calmCastellanus.violations.includes(
        "insufficient-instability-for-representation",
    ));
    const turbulentLens = foundation.qualifyMiddleCloudProductionState({
        representation: "altocumulus-lenticularis",
        ...canonicalState["altocumulus-lenticularis"],
        turbulenceDissipation: 0.2,
        environment: "golden-backlit-telephoto",
    });
    assert.equal(turbulentLens.legal, false);
    const dryPrecipitation = foundation.qualifyMiddleCloudProductionState({
        representation: "altostratus-praecipitatio",
        ...canonicalState["altostratus-praecipitatio"],
        precipitation: "none",
        environment: "moonlight-natural",
    });
    assert.equal(dryPrecipitation.legal, false);
});

test("cross-representation lifecycle transitions encode observed relationships", () => {
    assert.equal(foundation.isLegalMiddleCloudRepresentationTransition(
        "altocumulus-castellanus", "altocumulus-floccus",
    ), true);
    assert.equal(foundation.isLegalMiddleCloudRepresentationTransition(
        "altocumulus-floccus", "altocumulus-castellanus",
    ), false);
    assert.equal(foundation.isLegalMiddleCloudRepresentationTransition(
        "altostratus-translucidus", "altostratus-opacus",
    ), true);
    assert.equal(foundation.isLegalMiddleCloudRepresentationTransition(
        "altostratus-opacus", "altostratus-praecipitatio",
    ), true);
});

const signature = (representation, index) =>
    foundation.middleCloudTopologyVariantSignature(
        foundation.MIDDLE_CLOUD_TOPOLOGY_VARIANTS[representation][index],
    );

test("aperiodic Ac formation passes while a cloned grid fails", () => {
    const points = [
        [0, 0], [1.15, 0.22], [2.5, -0.1], [0.35, 1.45],
        [1.86, 1.05], [3.25, 1.75], [0.08, 3.05], [2.18, 2.72],
    ];
    const natural = points.map(([centerEastKm, centerNorthKm], index) => ({
        variantId: foundation.MIDDLE_CLOUD_TOPOLOGY_VARIANTS[
            "altocumulus-stratiformis"
        ][index % 4].id,
        centerEastKm,
        centerNorthKm,
        majorRadiusKm: 2.5 + index * 0.21,
        minorRadiusKm: 1.1 + index * 0.09,
        topologySignature: signature("altocumulus-stratiformis", index % 4),
    }));
    assert.equal(topology.qualifyMiddleCloudLayout(
        "altocumulus-stratiformis", natural,
    ).valid, true);

    const lattice = [];
    for (let north = 0; north < 4; north += 1) {
        for (let east = 0; east < 4; east += 1) {
            lattice.push({
                variantId: "extensive-merged-sheet",
                centerEastKm: east,
                centerNorthKm: north,
                majorRadiusKm: 3,
                minorRadiusKm: 1.5,
                topologySignature: signature("altocumulus-stratiformis", 0),
            });
        }
    }
    const failed = topology.qualifyMiddleCloudLayout(
        "altocumulus-stratiformis", lattice,
    );
    assert.equal(failed.valid, false);
    assert.ok(failed.violations.includes("too-many-exact-macroshape-clones"));
    assert.ok(failed.violations.includes("owner-layout-forms-a-repeated-grid"));
});

test("solitary rolls and continuous shields cannot become tiled stamp fields", () => {
    const owner = {
        variantId: "solitary-straight-roll",
        centerEastKm: 0,
        centerNorthKm: 0,
        majorRadiusKm: 20,
        minorRadiusKm: 1,
        topologySignature: signature("altocumulus-volutus", 0),
    };
    assert.equal(topology.qualifyMiddleCloudLayout(
        "altocumulus-volutus", [owner],
    ).valid, true);
    assert.equal(topology.qualifyMiddleCloudLayout(
        "altocumulus-volutus", [owner, { ...owner, centerEastKm: 12 }],
    ).valid, false);

    const shield = {
        ...owner,
        variantId: "ground-glass-shield",
        topologySignature: signature("altostratus-translucidus", 0),
    };
    assert.equal(topology.qualifyMiddleCloudLayout(
        "altostratus-translucidus", [shield],
    ).valid, true);
    assert.equal(topology.qualifyMiddleCloudLayout(
        "altostratus-translucidus",
        [0, 1, 2, 3].map((index) => ({ ...shield, centerEastKm: index * 30 })),
    ).valid, false);
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-low-layered-foundation-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const compile = (name) => {
    const source = readFileSync(new URL(
        `../components/backgrounds/sky/${name}.ts`, import.meta.url,
    ), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(
        /"\.\/low-layered-cloud-physical-foundation"/g,
        '"./low-layered-cloud-physical-foundation.mjs"',
    );
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
};

compile("low-layered-cloud-physical-foundation");
compile("low-layered-cloud-topology-qualification");
const foundation = await import(new URL(
    `file://${join(temporaryRoot, "low-layered-cloud-physical-foundation.mjs")}`,
));
const topology = await import(new URL(
    `file://${join(temporaryRoot, "low-layered-cloud-topology-qualification.mjs")}`,
));

const canonical = {
    "stratocumulus-stratiformis": { lifecycleStage: "mature", origin: "marine-boundary-layer", organization: "closed-cell-deck", precipitation: "none", opticalDepth: 8, instability: 0.05 },
    "stratocumulus-lenticularis": { lifecycleStage: "mature", origin: "orographic-wave", organization: "finite-wave-lens", precipitation: "none", opticalDepth: 7, instability: -0.1 },
    "stratocumulus-castellanus": { lifecycleStage: "growing", origin: "continental-boundary-layer", organization: "common-base-line", precipitation: "none", opticalDepth: 10, instability: 0.7 },
    "stratocumulus-floccus": { lifecycleStage: "decaying", origin: "castellanus-transition", organization: "detached-tufts", precipitation: "none", opticalDepth: 5, instability: 0.25 },
    "stratocumulus-volutus": { lifecycleStage: "mature", origin: "shear-layer-roll", organization: "single-roll", precipitation: "none", opticalDepth: 8, instability: 0.05 },
    "stratus-nebulosus": { lifecycleStage: "mature", origin: "radiative-cooling", organization: "uniform-boundary-layer", precipitation: "drizzle", opticalDepth: 6, instability: -0.1 },
    "stratus-fractus": { lifecycleStage: "growing", origin: "dry-fractus-transition", organization: "ragged-fragment-field", precipitation: "none", opticalDepth: 3, instability: 0.05 },
    nimbostratus: { lifecycleStage: "mature", origin: "altostratus-thickening", organization: "frontal-shield", precipitation: "none", opticalDepth: 30, instability: -0.2 },
    "nimbostratus-virga": { lifecycleStage: "precipitating", origin: "altostratus-thickening", organization: "precipitating-shield", precipitation: "virga", opticalDepth: 36, instability: -0.15 },
    "nimbostratus-praecipitatio": { lifecycleStage: "precipitating", origin: "altostratus-thickening", organization: "precipitating-shield", precipitation: "rain", opticalDepth: 45, instability: -0.1 },
    "nimbostratus-pannus": { lifecycleStage: "precipitating", origin: "precipitation-moistening", organization: "pannus-underdeck", precipitation: "rain", opticalDepth: 50, instability: -0.1 },
};

test("all WMO low-cloud species and orthogonal Nimbostratus states are explicit", () => {
    assert.equal(foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS.length, 11);
    const scSpecies = [];
    const stSpecies = [];
    for (const representation of foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS) {
        const descriptor = foundation.LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[representation];
        assert.equal(descriptor.representation, representation);
        assert.ok(descriptor.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.physicalConstitutionSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.requiredMorphology.length >= 4);
        assert.ok(descriptor.forbiddenMorphology.length >= 4);
        assert.ok(descriptor.formationSpanKm[1] > descriptor.formationSpanKm[0]);
        assert.ok(descriptor.geometricDepthKm[1] > descriptor.geometricDepthKm[0]);
        if (descriptor.genus === "stratocumulus") scSpecies.push(descriptor.classification.wmoSpecies);
        if (descriptor.genus === "stratus") stSpecies.push(descriptor.classification.wmoSpecies);
        if (descriptor.genus === "nimbostratus") {
            assert.equal(descriptor.classification.wmoSpecies, null);
            assert.equal(descriptor.sourceDisc, "concealed");
        }
    }
    assert.deepEqual(scSpecies, ["stratiformis", "lenticularis", "castellanus", "floccus", "volutus"]);
    assert.deepEqual(stSpecies, ["nebulosus", "fractus"]);
    assert.equal(foundation.LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[
        "nimbostratus-pannus"
    ].classification.accessoryCloud, "pannus");
});

test("Stratocumulus element scale is separate from system span and remains over five degrees", () => {
    const valid = foundation.qualifyStratocumulusProjection({
        representation: "stratocumulus-stratiformis", elementDiameterKm: 2,
        formationSpanKm: 300, slantRangeKm: 12, viewElevationDegrees: 42,
    });
    assert.equal(valid.valid, true);
    assert.ok(valid.angularDiameterDegrees > 5);
    const aliased = foundation.qualifyStratocumulusProjection({
        representation: "stratocumulus-stratiformis", elementDiameterKm: 0.5,
        formationSpanKm: 300, slantRangeKm: 20, viewElevationDegrees: 42,
    });
    assert.equal(aliased.valid, false);
    assert.ok(aliased.violations.includes(
        "stratocumulus-element-would-read-as-altocumulus-or-smaller",
    ));
    assert.equal(foundation.stratocumulusFeasibleElementDiameterKm(
        "stratocumulus-stratiformis", 150, 45,
    ).feasible, false);
});

test("each representation has three physically distinct runtime-selectable topologies", () => {
    for (const representation of foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS) {
        const variants = foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation];
        assert.equal(
            variants.length,
            representation === "stratocumulus-stratiformis" ? 4 : 3,
        );
        const result = topology.qualifyLowLayeredVariantSet(representation);
        assert.equal(result.valid, true,
            `${representation}: ${result.violations} (${result.minimumPairwiseSignatureDistance})`);
        assert.equal(
            foundation.selectLowLayeredCloudTopologyVariant(representation, 7),
            variants[7 % variants.length],
        );
    }
});

test("Sc stratiformis resolves organization before topology and placement", () => {
    const resolve = (overrides = {}) =>
        foundation.resolveStratocumulusStratiformisOrganizationRegime({
            organization: {
                kind: "cellular", topology: "closed", meanCellDiameterKm: 8,
                wallWidthFraction: 0.4, centerJitter: 0.4, anisotropy: 1,
                orientation: 0,
            },
            lifecycleStage: "mature",
            coverageOktas: 4,
            precipitationEfficiency: 0.08,
            precipitationKind: "none",
            varieties: [],
            ...overrides,
        });
    assert.deepEqual(
        [resolve({ coverageOktas: 2 }).regime,
            resolve({ coverageOktas: 2 }).placement],
        ["closed-cell", "distant-finite-system"],
    );
    assert.deepEqual(
        [resolve({ coverageOktas: 7 }).regime,
            resolve({ coverageOktas: 7 }).placement],
        ["closed-cell", "immediate-overcast"],
    );
    const open = resolve({
        organization: {
            kind: "cellular", topology: "open", meanCellDiameterKm: 12,
            wallWidthFraction: 0.22, centerJitter: 0.55, anisotropy: 1,
            orientation: 0,
        },
        lifecycleStage: "precipitating",
        coverageOktas: 4,
        precipitationEfficiency: 0.44,
        precipitationKind: "drizzle",
    });
    assert.equal(open.regime, "open-cell");
    assert.equal(open.foundationVariantId, "drizzling-open-cell-field");
    assert.equal(open.placement, "immediate-broken-field");
    assert.equal(open.boundaryMechanism, "drizzle-cold-pool-network");
    const street = resolve({ varieties: ["radiatus"] });
    assert.equal(street.regime, "street");
    assert.equal(street.foundationVariantId, "finite-street-and-broken-deck");
    const transition = resolve({
        organization: {
            kind: "cellular", topology: "lacunar", meanCellDiameterKm: 10,
            wallWidthFraction: 0.24, centerJitter: 0.6, anisotropy: 1,
            orientation: 0,
        },
    });
    assert.equal(transition.regime, "sparse-transition");
    assert.equal(transition.foundationVariantId, "closed-open-transition-mosaic");
    const classifiedLacunosus = resolve({
        coverageOktas: 6,
        varieties: ["lacunosus"],
    });
    assert.equal(classifiedLacunosus.regime, "sparse-transition");
    assert.equal(classifiedLacunosus.foundationVariantId,
        "closed-open-transition-mosaic");
    assert.equal(classifiedLacunosus.placement, "immediate-broken-field");
    const authoredContradiction = resolve({
        organization: {
            kind: "cellular", topology: "open", meanCellDiameterKm: 12,
            wallWidthFraction: 0.22, centerJitter: 0.55, anisotropy: 1,
            orientation: 0,
        },
        lifecycleStage: "growing",
        coverageOktas: 7,
        strictAuthored: true,
    });
    assert.equal(authoredContradiction.regime, "open-cell");
    assert.deepEqual(authoredContradiction.violations, [
        "open-cell-lifecycle-is-not-mature-or-precipitating",
        "open-cell-coverage-exceeds-physical-regime",
    ]);
});

test("topology variants cover every declared legal origin, stage, and organization", () => {
    for (const representation of foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS) {
        const contract = foundation.LOW_LAYERED_REACHABILITY_CONTRACTS[representation];
        const variants = foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation];
        for (const origin of contract.origins) {
            assert.ok(variants.some((variant) => variant.origins.includes(origin)));
        }
        for (const stage of contract.lifecycleStages) {
            assert.ok(variants.some((variant) => variant.lifecycleStages.includes(stage)));
        }
        for (const organization of contract.organizations) {
            assert.ok(variants.some((variant) => variant.organizations.includes(organization)));
        }
    }
});

test("immediate overcast and distant finite systems are mutually exclusive physical placements", () => {
    const immediate = foundation.qualifyLowLayeredSystemDomain({
        representation: "stratus-nebulosus", placement: "immediate-overcast",
        boundaryMechanism: "entrainment-eroded", horizontalSpanKm: 120,
        boundaryTransitionKm: 5, cameraInsideCondensateDomain: true,
        skyCoverageFraction: 0.94, horizonContactFraction: 0.7,
        generatedFiniteSupport: true, postDensityMaskWeight: 0,
    });
    assert.equal(immediate.valid, true);
    const contradictory = foundation.qualifyLowLayeredSystemDomain({
        representation: "nimbostratus-praecipitatio", placement: "distant-finite-system",
        boundaryMechanism: "frontal-moisture-gradient", horizontalSpanKm: 300,
        boundaryTransitionKm: 10, cameraInsideCondensateDomain: true,
        skyCoverageFraction: 0.96, horizonContactFraction: 0.7,
        generatedFiniteSupport: false, postDensityMaskWeight: 0.5,
    });
    assert.equal(contradictory.valid, false);
    assert.ok(contradictory.violations.includes(
        "distant-system-cannot-simultaneously-read-as-immediate-overcast",
    ));
    assert.ok(contradictory.violations.includes(
        "post-density-mask-cannot-create-system-boundary",
    ));
});

const micro = (overrides = {}) => foundation.sampleLowLayeredLocalMicrophysics({
    representation: "stratocumulus-stratiformis", normalizedHeight: 0.5,
    normalizedBoundaryDistance: 0.8, coherentCoreFraction: 0.7,
    lifecycleStage: "mature", origin: "marine-boundary-layer",
    temperatureKelvin: 278, turbulenceDissipation: 0.02,
    opticalDepth: 8, precipitation: "none", normalizedMeltingLevel: null,
    ...overrides,
});

test("Stratocumulus and Stratus retain liquid optics except rare extreme-cold states", () => {
    const ordinarySc = micro();
    const coldSc = micro({ temperatureKelvin: 230, lifecycleStage: "glaciating" });
    const ordinarySt = micro({ representation: "stratus-nebulosus", opticalDepth: 2,
        origin: "radiative-cooling" });
    assert.ok(ordinarySc.liquidFraction > 0.95);
    assert.ok(coldSc.iceFraction > ordinarySc.iceFraction);
    assert.ok(ordinarySt.liquidFraction > 0.95);
    assert.ok(ordinarySc.cloudTopLongwaveCoolingWeight >
        micro({ normalizedHeight: 0.5 }).cloudTopLongwaveCoolingWeight * 0.9);
});

test("Nimbostratus resolves upper generating ice, aggregation, melting, and lower precipitation", () => {
    const state = (height) => micro({
        representation: "nimbostratus-praecipitatio", normalizedHeight: height,
        lifecycleStage: "precipitating", origin: "altostratus-thickening",
        temperatureKelvin: height > 0.55 ? 245 : 276, opticalDepth: 45,
        precipitation: "rain", normalizedMeltingLevel: 0.42,
    });
    const top = state(0.9);
    const melting = state(0.42);
    const base = state(0.08);
    assert.ok(top.iceFraction > base.iceFraction);
    assert.ok(base.iceHabitFractions.aggregate > top.iceHabitFractions.aggregate);
    assert.ok(melting.meltingFraction > 0.99);
    assert.equal(top.sourceDiscSharpness, 0);
    assert.equal(base.sourceDiscSharpness, 0);
});

test("Nimbostratus parent-shield causes stay orthogonal to fall and pannus owners", () => {
    const parentVariants = foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS.nimbostratus;
    assert.deepEqual(parentVariants.map(({ id }) => id), [
        "deepening-altostratus-shield",
        "generating-cell-stratiform-shield",
        "thickened-low-deck-nimbostratus",
    ]);
    assert.deepEqual(parentVariants.map(({ mechanism }) => mechanism), [
        "frontal-ascent",
        "stratiform-generating-cells",
        "frontal-ascent",
    ]);
    assert.ok(parentVariants.every(({ connectivity }) =>
        connectivity === "deep-continuous-layer"));
    const pannusVariants = foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[
        "nimbostratus-pannus"
    ];
    assert.ok(pannusVariants.every(({ connectivity }) =>
        connectivity === "parent-plus-underdeck"));
    assert.ok(foundation.LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS[
        "nimbostratus-pannus"
    ].forbiddenMorphology.includes("pannus baked into parent density"));
});

test("microphysical outputs remain finite, normalized, bounded, and deterministic", () => {
    for (const representation of foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS) {
        for (const height of [0, 0.37, 0.72, 1]) {
            const state = canonical[representation];
            const input = {
                representation, normalizedHeight: height,
                normalizedBoundaryDistance: 0.62, coherentCoreFraction: 0.68,
                lifecycleStage: state.lifecycleStage, origin: state.origin,
                temperatureKelvin: 248 + height * 18,
                turbulenceDissipation: 0.015, opticalDepth: state.opticalDepth,
                precipitation: state.precipitation,
                normalizedMeltingLevel: representation.startsWith("nimbostratus") ? 0.4 : null,
            };
            const first = foundation.sampleLowLayeredLocalMicrophysics(input);
            assert.deepEqual(first, foundation.sampleLowLayeredLocalMicrophysics(input));
            assert.ok(Math.abs(first.liquidFraction + first.iceFraction - 1) < 1e-12);
            assert.ok(first.relativeCondensate >= 0 && first.relativeCondensate <= 1);
            const habitSum = Object.values(first.iceHabitFractions)
                .reduce((sum, value) => sum + value, 0);
            assert.ok(Math.abs(habitSum - 1) < 1e-12);
            for (const value of Object.values(first)) {
                if (typeof value === "number") assert.ok(Number.isFinite(value));
            }
        }
    }
});

test("pannus is separately owned, wet-weather underdeck and heavy rain reduces coverage", () => {
    assert.equal(foundation.qualifyUnderdeckOwnership({
        kind: "wet-pannus", parentRepresentation: "nimbostratus-pannus",
        precipitationActive: true, parentGapKm: 0.4, mergedWithParentFraction: 0.2,
        precipitationIntensity: 0.5, relativeHumidity: 0.96,
    }).valid, true);
    const alias = foundation.qualifyUnderdeckOwnership({
        kind: "dry-stratus-fractus", parentRepresentation: "nimbostratus-praecipitatio",
        precipitationActive: true, parentGapKm: 0.2, mergedWithParentFraction: 0,
        precipitationIntensity: 0.5, relativeHumidity: 0.95,
    });
    assert.equal(alias.valid, false);
    const moderate = foundation.samplePannusUnderdeckState(0.55, 0.98, 0.7);
    const deluge = foundation.samplePannusUnderdeckState(1, 0.98, 0.1);
    assert.ok(moderate.coverageFraction > deluge.coverageFraction);
    assert.ok(deluge.washoutFraction > moderate.washoutFraction);
});

test("all representations qualify morphologically in all five established environments", () => {
    assert.equal(Object.keys(foundation.LOW_LAYERED_ENVIRONMENT_CONTRACTS).length, 5);
    for (const representation of foundation.LOW_LAYERED_CLOUD_REPRESENTATIONS) {
        for (const environment of foundation.LOW_LAYERED_BENCHMARK_ENVIRONMENTS) {
            const environmentContract = foundation.LOW_LAYERED_ENVIRONMENT_CONTRACTS[
                environment
            ];
            assert.ok(environmentContract.requiredEvidence.length >= 3);
            assert.ok(environmentContract.forbiddenCompensation.length >= 2);
            const result = foundation.qualifyLowLayeredProductionState({
                representation, ...canonical[representation], environment,
            });
            assert.equal(result.legal, true,
                `${representation}/${environment}: ${result.violations}`);
        }
    }
});

test("legal transitions preserve taxonomy and observed formation pathways", () => {
    assert.equal(foundation.isLegalLowLayeredRepresentationTransition(
        "stratocumulus-castellanus", "stratocumulus-floccus",
    ), true);
    assert.equal(foundation.isLegalLowLayeredRepresentationTransition(
        "stratocumulus-floccus", "stratocumulus-castellanus",
    ), false);
    assert.equal(foundation.isLegalLowLayeredRepresentationTransition(
        "stratus-fractus", "stratus-nebulosus",
    ), true);
    assert.equal(foundation.isLegalLowLayeredRepresentationTransition(
        "nimbostratus-praecipitatio", "nimbostratus-pannus",
    ), true);
});

const signature = (representation, index) =>
    foundation.lowLayeredCloudTopologyVariantSignature(
        foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[representation][index],
    );

test("aperiodic cellular organization passes while a cloned grid fails", () => {
    const points = [[0, 0], [2.1, 0.2], [4.8, -0.3], [0.6, 2.9],
        [3.5, 2.1], [6.4, 3.4], [0.2, 6.2], [4.6, 5.5]];
    const natural = points.map(([centerEastKm, centerNorthKm], index) => ({
        variantId: foundation.LOW_LAYERED_CLOUD_TOPOLOGY_VARIANTS[
            "stratocumulus-stratiformis"
        ][index % 3].id,
        centerEastKm, centerNorthKm,
        majorRadiusKm: 3 + index * 0.23, minorRadiusKm: 1.5 + index * 0.08,
        boundaryCorrelationId: `weather-${index % 2}`,
        topologySignature: signature("stratocumulus-stratiformis", index % 3),
        parentOwnerId: null,
    }));
    assert.equal(topology.qualifyLowLayeredLayout(
        "stratocumulus-stratiformis", natural,
    ).valid, true);
    const lattice = [];
    for (let north = 0; north < 4; north += 1) {
        for (let east = 0; east < 4; east += 1) lattice.push({
            variantId: "closed-cell-radiative-deck", centerEastKm: east * 2,
            centerNorthKm: north * 2, majorRadiusKm: 3, minorRadiusKm: 1.5,
            boundaryCorrelationId: "cloned", topologySignature: signature(
                "stratocumulus-stratiformis", 0,
            ), parentOwnerId: null,
        });
    }
    const failed = topology.qualifyLowLayeredLayout(
        "stratocumulus-stratiformis", lattice,
    );
    assert.equal(failed.valid, false);
    assert.ok(failed.violations.includes("too-many-exact-macroshape-clones"));
    assert.ok(failed.violations.includes("owner-layout-forms-a-repeated-grid"));
});

test("continuous shields cannot be owner-stamp fields and pannus requires separate parent ownership", () => {
    const shield = {
        variantId: "continuous-rain-frontal-shield", centerEastKm: 0,
        centerNorthKm: 0, majorRadiusKm: 180, minorRadiusKm: 90,
        boundaryCorrelationId: "shield-a",
        topologySignature: signature("nimbostratus-praecipitatio", 0),
        parentOwnerId: null,
    };
    assert.equal(topology.qualifyLowLayeredLayout(
        "nimbostratus-praecipitatio", [shield],
    ).valid, true);
    assert.equal(topology.qualifyLowLayeredLayout(
        "nimbostratus-praecipitatio",
        [0, 1, 2, 3].map((index) => ({ ...shield, centerEastKm: index * 80 })),
    ).valid, false);
    const pannus = {
        ...shield, variantId: "incipient-separated-pannus",
        topologySignature: signature("nimbostratus-pannus", 0),
        boundaryCorrelationId: "pannus-a", parentOwnerId: "shield-a",
    };
    assert.equal(topology.qualifyLowLayeredLayout(
        "nimbostratus-pannus", [pannus],
    ).valid, true);
    assert.equal(topology.qualifyLowLayeredLayout(
        "nimbostratus-pannus", [{ ...pannus, parentOwnerId: null }],
    ).valid, false);
});

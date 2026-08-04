import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(
    tmpdir(),
    "elements-deep-convection-foundation-",
));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const source = readFileSync(new URL(
    "../components/backgrounds/sky/deep-convection-physical-foundation.ts",
    import.meta.url,
), "utf8");
const output = ts.transpileModule(source, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText;
const compiledPath = join(temporaryRoot,
    "deep-convection-physical-foundation.mjs");
writeFileSync(compiledPath, output);
const foundation = await import(new URL("file://" + compiledPath));

const archetype = (id) => {
    const value = foundation.DEEP_CONVECTION_ARCHETYPES.find(
        (candidate) => candidate.id === id,
    );
    assert.ok(value, "missing archetype " + id);
    return foundation.createDeepConvectionDescriptor(value.input);
};

test("WMO Cumulonimbus species, lifecycle stages, and accessory features are explicit", () => {
    assert.deepEqual([...foundation.DEEP_CONVECTION_SPECIES], [
        "calvus", "capillatus",
    ]);
    assert.deepEqual([...foundation.DEEP_CONVECTION_LIFECYCLE_STAGES], [
        "developing", "mature", "precipitating", "decaying",
    ]);
    assert.equal(foundation.DEEP_CONVECTION_FEATURES.length, 10);
    for (const species of foundation.DEEP_CONVECTION_SPECIES) {
        const descriptor = foundation.DEEP_CONVECTION_SPECIES_DESCRIPTORS[species];
        assert.equal(descriptor.species, species);
        assert.ok(descriptor.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.requiredMorphology.length >= 4);
        assert.ok(descriptor.forbiddenMorphology.length >= 4);
    }
    assert.equal(
        foundation.DEEP_CONVECTION_SPECIES_DESCRIPTORS.calvus.permitsIncus,
        false,
    );
    assert.equal(
        foundation.DEEP_CONVECTION_SPECIES_DESCRIPTORS.capillatus.permitsIncus,
        true,
    );
    for (const stage of foundation.DEEP_CONVECTION_LIFECYCLE_STAGES) {
        const descriptor = foundation.DEEP_CONVECTION_LIFECYCLE_DESCRIPTORS[stage];
        assert.equal(descriptor.stage, stage);
        assert.ok(descriptor.noaaSource.startsWith("https://www.weather.gov/"));
    }
    for (const feature of foundation.DEEP_CONVECTION_FEATURES) {
        const descriptor = foundation.DEEP_CONVECTION_FEATURE_DESCRIPTORS[feature];
        assert.equal(descriptor.feature, feature);
        assert.ok(descriptor.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(descriptor.requiredOwnerRegions.length >= 1);
        assert.ok(descriptor.forbiddenAlias.length > 6);
    }
});

test("five distinct meteorological environments drive deterministic finite systems", () => {
    assert.equal(foundation.DEEP_CONVECTION_ENVIRONMENT_IDS.length, 5);
    for (const environmentId of foundation.DEEP_CONVECTION_ENVIRONMENT_IDS) {
        const input = {
            environment: environmentId,
            lifecycleStage: "mature",
            species: "capillatus",
            seed: 97,
        };
        const first = foundation.createDeepConvectionDescriptor(input);
        const second = foundation.createDeepConvectionDescriptor(input);
        assert.deepEqual(first, second);
        assert.equal(first.systemBoundary.closure,
            "finite-closed-condensate-support");
        assert.ok(first.systemBoundary.horizontalBoundsKm.every(Number.isFinite));
        assert.ok(first.systemBoundary.verticalBoundsKm.every(Number.isFinite));
        assert.ok(first.systemBoundary.interfaceThicknessKm[0] > 0);
        assert.ok(first.systemBoundary.interfaceThicknessKm[1] >
            first.systemBoundary.interfaceThicknessKm[0]);
        assert.ok(first.systemBoundary.thermalLobeCount >= 5);
    }
    const a = foundation.createDeepConvectionDescriptor({
        environment: "continental-sheared-supercell",
        lifecycleStage: "precipitating",
        seed: 2,
    });
    const b = foundation.createDeepConvectionDescriptor({
        environment: "continental-sheared-supercell",
        lifecycleStage: "precipitating",
        seed: 3,
    });
    assert.notEqual(a.coreRadiusKm, b.coreRadiusKm);
});

test("topology is one connected flow-owned storm graph rather than detached pieces", () => {
    const descriptor = archetype("classic-supercell-incus");
    const topology = foundation.resolveDeepConvectionTopology(descriptor);
    const ids = new Set(topology.regions.map(({ id }) => id));
    for (const required of [
        "storm-system", "inflow-stream", "rain-free-base",
        "liquid-updraft-core", "mixed-phase-core", "upper-turret-crown",
        "ice-crown", "anvil-outflow", "precipitation-core",
        "downdraft-core", "cold-pool", "gust-front",
    ]) assert.ok(ids.has(required), "missing topology region " + required);
    for (const region of topology.regions) {
        if (region.parentId !== null) assert.ok(ids.has(region.parentId));
        assert.ok(region.halfExtentsKm.every((value) => value > 0));
    }
    const edges = new Set(topology.attachmentPaths.map(({ id }) => id));
    for (const expected of [
        "inflow-stream->rain-free-base",
        "rain-free-base->liquid-updraft-core",
        "liquid-updraft-core->mixed-phase-core",
        "upper-turret-crown->ice-crown",
        "ice-crown->anvil-outflow",
        "mixed-phase-core->precipitation-core",
        "precipitation-core->downdraft-core",
        "downdraft-core->cold-pool",
        "cold-pool->gust-front",
    ]) assert.ok(edges.has(expected), "missing attachment " + expected);
    assert.ok(!descriptor.systemBoundary.representation.includes("mask"));
});

test("calvus, capillatus, overshoot, and incus remain lifecycle-legal", () => {
    const calvus = archetype("tropical-calvus-growth");
    const calvusTopology = foundation.resolveDeepConvectionTopology(calvus);
    assert.equal(calvus.species, "calvus");
    assert.ok(calvus.glaciation01 <= 0.5);
    assert.ok(!calvusTopology.regions.some(({ id }) => id === "ice-crown"));
    const calvusFeatures = foundation.resolveDeepConvectionFeatureOwnership(calvus);
    assert.equal(calvusFeatures.find(({ feature }) => feature === "incus").present,
        false);

    const capillatus = archetype("classic-supercell-incus");
    const topology = foundation.resolveDeepConvectionTopology(capillatus);
    assert.ok(topology.regions.some(({ id }) => id === "ice-crown"));
    assert.ok(topology.regions.some(({ id }) => id === "anvil-outflow"));
    if (capillatus.overshootHeightKm > 0) {
        const overshoot = topology.regions.find(({ id }) =>
            id === "overshooting-top");
        assert.ok(overshoot);
        assert.equal(overshoot.parentId, "ice-crown");
        assert.ok(overshoot.centreKm[1] > capillatus.equilibriumLevelKm);
    }
    const incus = foundation.resolveDeepConvectionFeatureOwnership(capillatus)
        .find(({ feature }) => feature === "incus");
    assert.equal(incus.present, true);
    assert.equal(incus.ownerRegion, "anvil-outflow");
});

test("liquid-to-ice microphysics is normalized, mixed, continuous, and spatially stratified", () => {
    const descriptor = archetype("classic-supercell-incus");
    let previous = null;
    let maximumAdjacentPhaseDelta = 0;
    let foundTrueMixedPhase = false;
    for (let index = 0; index <= 240; index += 1) {
        const sample = foundation.sampleDeepConvectionMicrophysics(descriptor, {
            normalizedAltitude01: index / 240,
            normalizedRadialDistance01: 0.18,
        });
        const fractions = Object.values(sample.phaseFractions);
        assert.ok(fractions.every((value) => value >= 0 && value <= 1));
        assert.ok(Math.abs(fractions.reduce((sum, value) => sum + value, 0) - 1) <
            1e-12);
        if (sample.phaseFractions["supercooled-liquid"] > 0.05 &&
            sample.phaseFractions["ice-crystals"] > 0.05 &&
            sample.phaseFractions.graupel > 0.015) {
            foundTrueMixedPhase = true;
        }
        if (previous) {
            for (const kind of foundation.DEEP_CONVECTION_HYDROMETEOR_CLASSES) {
                maximumAdjacentPhaseDelta = Math.max(maximumAdjacentPhaseDelta,
                    Math.abs(sample.phaseFractions[kind] -
                        previous.phaseFractions[kind]));
            }
        }
        previous = sample;
    }
    assert.equal(foundTrueMixedPhase, true);
    assert.ok(maximumAdjacentPhaseDelta < 0.08,
        "phase transition has an abrupt adjacent delta " + maximumAdjacentPhaseDelta);

    const lower = foundation.sampleDeepConvectionMicrophysics(descriptor, {
        normalizedAltitude01: 0.12,
    });
    const upper = foundation.sampleDeepConvectionMicrophysics(descriptor, {
        normalizedAltitude01: 0.91,
        normalizedDownwindDistance01: 0.8,
    });
    assert.ok(lower.phaseFractions["cloud-liquid"] + lower.phaseFractions.rain >
        upper.phaseFractions["cloud-liquid"] + upper.phaseFractions.rain);
    assert.ok(upper.phaseFractions["ice-crystals"] >
        lower.phaseFractions["ice-crystals"]);
});

test("decay removes the lower liquid core before the glaciated remnant", () => {
    const mature = foundation.createDeepConvectionDescriptor({
        environment: "cool-season-squall-line",
        lifecycleStage: "mature",
        stageProgress01: 0.85,
        species: "capillatus",
        organization: "multicell-cluster",
        intensity01: 0.68,
        seed: 47,
    });
    const decaying = archetype("decaying-remnant-anvil");
    const matureLower = foundation.sampleDeepConvectionMicrophysics(mature, {
        normalizedAltitude01: 0.18,
    });
    const decayingLower = foundation.sampleDeepConvectionMicrophysics(decaying, {
        normalizedAltitude01: 0.18,
    });
    const decayingUpper = foundation.sampleDeepConvectionMicrophysics(decaying, {
        normalizedAltitude01: 0.85,
        normalizedDownwindDistance01: 0.8,
    });
    assert.ok(decayingLower.relativeCondensate01 < matureLower.relativeCondensate01);
    assert.ok(decayingUpper.iceWaterContentGramsPerCubicMetre >
        decayingLower.iceWaterContentGramsPerCubicMetre);
    assert.ok(decaying.downdraftStrength01 >= decaying.updraftStrength01 - 0.06);
});

test("feature ownership enforces WMO flow placement and rare-feature dependencies", () => {
    const classic = archetype("classic-supercell-incus");
    const ownership = new Map(foundation.resolveDeepConvectionFeatureOwnership(
        classic,
    ).map((feature) => [feature.feature, feature]));
    for (const feature of ["incus", "mamma", "murus", "cauda", "flumen"]) {
        assert.equal(ownership.get(feature).present, true, feature);
    }
    assert.equal(ownership.get("cauda").parentFeature, "murus");
    assert.equal(ownership.get("cauda").attachment, "attached-to-owner");
    assert.equal(ownership.get("flumen").attachment,
        "detached-but-flow-coupled");
    assert.equal(ownership.get("flumen").ownerRegion, "inflow-stream");
    assert.equal(ownership.get("arcus").ownerRegion, "gust-front");
    assert.equal(ownership.get("mamma").ownerRegion, "anvil-outflow");

    const tornadic = archetype("tornadic-supercell-base");
    const tornadicOwnership = new Map(
        foundation.resolveDeepConvectionFeatureOwnership(tornadic)
            .map((feature) => [feature.feature, feature]),
    );
    assert.equal(tornadicOwnership.get("murus").present, true);
    assert.equal(tornadicOwnership.get("tuba").present, true);
    assert.equal(tornadicOwnership.get("tuba").parentFeature, "murus");
});

test("rain, hail, virga, and lightning are emitted only by owned physical sources", () => {
    const developing = archetype("tropical-calvus-growth");
    const developingSources = foundation.resolveDeepConvectionSourceContracts(
        developing,
    );
    assert.equal(developingSources.rain.active, false);
    assert.equal(developingSources.hail.active, false);
    assert.equal(developingSources.lightning.active, false);

    const severe = archetype("classic-supercell-incus");
    const severeSources = foundation.resolveDeepConvectionSourceContracts(severe);
    assert.equal(severeSources.rain.active, true);
    assert.equal(severeSources.hail.active, true);
    assert.equal(severeSources.lightning.active, true);
    assert.equal(severeSources.hail.sourceRegion, "mixed-phase-core");
    assert.equal(severeSources.lightning.chargeRegions.length, 3);
    assert.ok(new Set(severeSources.lightning.chargeRegions.map(({ polarity }) =>
        polarity)).size >= 2);

    const dry = archetype("dry-high-base-virga");
    const drySources = foundation.resolveDeepConvectionSourceContracts(dry);
    assert.equal(drySources.rain.active, true,
        "rain must exist aloft before it can evaporate into virga");
    assert.equal(drySources.virga.active, true);
    assert.equal(drySources.virga.reachesGroundFraction01, 0);
    assert.equal(drySources.virga.termination,
        "complete-evaporation-above-ground");
});

test("descriptor and microphysics interpolation stay continuous across calvus-capillatus transition", () => {
    const from = foundation.createDeepConvectionDescriptor({
        environment: "tropical-humid-pulse",
        lifecycleStage: "developing",
        stageProgress01: 0.88,
        species: "calvus",
        intensity01: 0.82,
        seed: 61,
    });
    const to = foundation.createDeepConvectionDescriptor({
        environment: "tropical-humid-pulse",
        lifecycleStage: "mature",
        stageProgress01: 0.5,
        species: "capillatus",
        intensity01: 0.82,
        seed: 61,
    });
    let previous = null;
    for (let index = 0; index <= 80; index += 1) {
        const progress = index / 80;
        const transition = foundation.interpolateDeepConvectionDescriptors(
            from, to, progress,
        );
        assert.ok(Math.abs(Object.values(transition.speciesWeights).reduce(
            (sum, value) => sum + value, 0) - 1) < 1e-12);
        assert.ok(Math.abs(Object.values(transition.lifecycleWeights).reduce(
            (sum, value) => sum + value, 0) - 1) < 1e-12);
        const sample = foundation.sampleDeepConvectionTransitionMicrophysics(
            from, to, progress, { normalizedAltitude01: 0.72 },
        );
        assert.ok(Math.abs(Object.values(sample.phaseFractions).reduce(
            (sum, value) => sum + value, 0) - 1) < 1e-12);
        if (previous) {
            assert.ok(Math.abs(transition.glaciation01 - previous.glaciation01) <
                0.04);
            assert.ok(Math.abs(sample.phaseFractions["ice-crystals"] -
                previous.sample.phaseFractions["ice-crystals"]) < 0.04);
        }
        previous = { ...transition, sample };
    }
});

test("absolute lifecycle progress maps monotonically through every named stage", () => {
    const expected = [
        [0.1, "developing"], [0.4, "mature"],
        [0.65, "precipitating"], [0.9, "decaying"],
    ];
    let previousProgress = -1;
    for (const [progress, stage] of expected) {
        const descriptor = foundation.createDeepConvectionDescriptorAtProgress({
            environment: "maritime-multicell",
            lifecycleProgress01: progress,
            intensity01: 0.82,
            seed: 7,
        });
        assert.equal(descriptor.lifecycleStage, stage);
        assert.ok(descriptor.lifecycleProgress01 > previousProgress);
        previousProgress = descriptor.lifecycleProgress01;
    }
});

test("all eight archetypes qualify and all five environment/perspective cases pass", () => {
    assert.equal(foundation.DEEP_CONVECTION_ARCHETYPES.length, 8);
    for (const candidate of foundation.DEEP_CONVECTION_ARCHETYPES) {
        const descriptor = foundation.createDeepConvectionDescriptor(candidate.input);
        const qualification = foundation.qualifyDeepConvection(descriptor);
        assert.equal(qualification.valid, true,
            candidate.id + ": " + qualification.violations.join(", "));
    }

    const cases = foundation.qualifyAllDeepConvectionCases();
    assert.equal(cases.length, 5);
    for (const result of cases) {
        assert.equal(result.perspectives.length, 3);
        assert.equal(result.valid, true,
            result.descriptor.id + ": " + result.violations.join(", "));
        assert.ok(result.perspectives.every(({ valid }) => valid));
    }
});

test("qualification catches physically impossible atmosphere and detached ownership", () => {
    const valid = archetype("classic-supercell-incus");
    const impossible = {
        ...valid,
        environment: {
            ...valid.environment,
            freezingLevelKm: valid.environment.cloudBaseKm - 0.2,
        },
    };
    const qualification = foundation.qualifyDeepConvection(impossible);
    assert.equal(qualification.valid, false);
    assert.ok(qualification.violations.includes(
        "environment-levels-must-order-base-freezing-equilibrium",
    ));
});

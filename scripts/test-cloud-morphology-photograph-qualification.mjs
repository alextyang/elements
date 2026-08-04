import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS,
    CLOUD_MORPHOLOGY_PHOTOGRAPH_SUMMARY,
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS,
    MORPHOLOGY_PHOTOGRAPH_COVERAGES,
    MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS,
    MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES,
    applyMorphologyPhotographCaseToScene,
    cloudMorphologyPhotographCaseId,
    iterateCloudMorphologyPhotographCases,
    iterateCloudMorphologyPhotographSmokeCases,
    morphologyPhotographRendererSpecies,
    resolveCloudMorphologyPhotographCase,
} from "../components/backgrounds/sky/cloud-morphology-photograph-qualification.ts";
import {
    CLOUD_ACCESSORY_GENERA,
    CLOUD_FEATURE_GENERA,
    CLOUD_VARIETY_GENERA,
} from "../components/backgrounds/sky/cloud-state-map.ts";

const source = readFileSync(
    new URL("../components/backgrounds/sky/cloud-morphology-photograph-qualification.ts", import.meta.url),
    "utf8",
);

const expectedVarieties = [
    "intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
    "duplicatus", "translucidus", "perlucidus", "opacus",
];
const expectedFeatures = [
    "incus", "mamma", "arcus", "tuba", "asperitas",
    "fluctus", "cavum", "murus", "cauda",
];
const expectedAccessories = ["pileus", "velum", "pannus", "flumen"];
const expectedUpper = ["polar-stratospheric-sts", "nacreous", "noctilucent"];
const expectedExterior = ["liquid-convection", "stratiform-scud", "ice-fibre"];

test("photographic target map covers every requested orthogonal and exterior state exactly", () => {
    assert.deepEqual(CLOUD_MORPHOLOGY_PHOTOGRAPH_SUMMARY, {
        targets: 28,
        varieties: 9,
        supplementaryFeatures: 9,
        accessories: 4,
        upperAtmospheric: 3,
        exteriorBoundaries: 3,
        smokeTargets: 8,
    });
    assert.equal(new Set(CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((target) => target.id)).size, 28);
    const byAxis = (axis) => CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS
        .filter((target) => target.axis === axis)
        .map((target) => target.designation);
    assert.deepEqual(byAxis("variety"), expectedVarieties);
    assert.deepEqual(byAxis("supplementary-feature"), expectedFeatures);
    assert.deepEqual(byAxis("accessory-cloud"), expectedAccessories);
    assert.deepEqual(byAxis("upper-atmospheric"), expectedUpper);
    assert.deepEqual(byAxis("exterior-boundary"), expectedExterior);
    assert.ok(!byAxis("supplementary-feature").includes("virga"));
    assert.ok(!byAxis("supplementary-feature").includes("praecipitatio"));
});

test("every target has direct WMO provenance, an individual credit, and no bundled image", () => {
    for (const target of CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS) {
        const reference = target.reference;
        assert.equal(reference.provider, "WMO International Cloud Atlas");
        assert.match(reference.imageUrl, /^https:\/\/cloudatlas\.wmo\.int\/images\/compressed\/\d+_main_/);
        assert.equal(reference.viewerUrl, `https://cloudatlas.wmo.int/en/imgviewer-${reference.imageId}.txt`);
        assert.match(reference.taxonomyUrl, /^https:\/\/cloudatlas\.wmo\.int\//);
        assert.match(reference.credit, /WMO International Cloud Atlas$/);
        assert.ok(reference.credit.length > 32);
    }
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /new\s+Image\s*\(/);
    assert.doesNotMatch(source, /<img\b|next\/image/);
    assert.doesNotMatch(source, /data:image\//);
});

test("classification assignments use the production CloudScene path and valid WMO owners", () => {
    for (const target of CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS) {
        assert.equal(target.assignment.classification, target.classification);
        assert.ok(target.assignment.layerIndex >= 0 && target.assignment.layerIndex <= 2);
        assert.ok(morphologyPhotographRendererSpecies(target.id));
        if (target.axis === "variety") {
            assert.deepEqual(target.classification.varieties, [target.designation]);
            assert.ok(CLOUD_VARIETY_GENERA[target.designation].includes(target.classification.genus));
        }
        if (target.axis === "supplementary-feature") {
            assert.ok(target.classification.supplementaryFeatures.includes(target.designation));
            assert.ok(CLOUD_FEATURE_GENERA[target.designation].includes(target.classification.genus));
        }
        if (target.axis === "accessory-cloud") {
            assert.deepEqual(target.classification.accessoryClouds, [target.designation]);
            assert.ok(CLOUD_ACCESSORY_GENERA[target.designation].includes(target.classification.genus));
        }
        if (target.axis === "upper-atmospheric") {
            assert.equal(target.assignment.layerIndex, 2);
            assert.equal(target.assignment.systemIndex, 11);
            assert.equal(target.assignment.upperAtmosphericCloud, target.designation);
        } else {
            assert.equal(target.assignment.upperAtmosphericCloud, undefined);
        }
    }
    const cauda = CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.find((target) => target.designation === "cauda");
    assert.deepEqual(cauda.classification.supplementaryFeatures, ["murus", "cauda"]);
});

test("every target spans multiple physical environments, perspectives, and coverage regimes", () => {
    const environmentIds = new Set(MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS.map((entry) => entry.id));
    const perspectiveIds = new Set(MORPHOLOGY_PHOTOGRAPH_PERSPECTIVES.map((entry) => entry.id));
    const coverageIds = new Set(MORPHOLOGY_PHOTOGRAPH_COVERAGES.map((entry) => entry.id));
    for (const target of CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS) {
        assert.ok(target.environmentIds.length >= 3, `${target.id} needs several environments`);
        assert.ok(target.perspectiveIds.length >= 3, `${target.id} needs several perspectives`);
        assert.ok(target.coverageIds.length >= 2, `${target.id} needs several coverage regimes`);
        assert.ok(target.environmentIds.every((id) => environmentIds.has(id)));
        assert.ok(target.perspectiveIds.every((id) => perspectiveIds.has(id)));
        assert.ok(target.coverageIds.every((id) => coverageIds.has(id)));
    }
    for (const environment of MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS) {
        assert.ok(environment.relativeHumidity >= 0 && environment.relativeHumidity <= 1);
        assert.ok(environment.aerosolOpticalDepth >= 0 && environment.aerosolOpticalDepth <= 1);
        assert.ok(environment.season >= 0 && environment.season <= 1);
        assert.ok(environment.moonIlluminatedFraction >= 0 && environment.moonIlluminatedFraction <= 1);
    }
});

test("upper-atmosphere targets select physically valid polar seasons and source geometry", () => {
    const environments = new Map(MORPHOLOGY_PHOTOGRAPH_ENVIRONMENTS.map((entry) => [entry.id, entry]));
    for (const target of CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.filter((entry) => entry.axis === "upper-atmospheric")) {
        for (const environmentId of target.environmentIds) {
            const selected = environments.get(environmentId);
            assert.ok(Math.abs(selected.latitude) >= 60);
            if (target.designation === "noctilucent") {
                assert.ok(selected.season >= 0.85);
                assert.ok(-selected.solarElevationDegrees >= 6 && -selected.solarElevationDegrees <= 16);
            } else {
                assert.ok(selected.season <= 0.15);
                assert.ok(selected.stratosphericTemperatureKelvin <= 195);
                // The deep-night case is intentional moonlit morphology; the
                // two twilight cases retain grazing solar visibility.
                assert.ok(selected.lighting === "moon" || selected.solarElevationDegrees >= -12);
            }
        }
    }
});

test("acceptance cues explicitly catch structural, attachment, and lighting failures", () => {
    const globallyCovered = new Set();
    for (const target of CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS) {
        assert.ok(target.cues.length >= 3);
        const targetFailures = new Set(target.cues.flatMap((cue) => cue.rejects));
        for (const failure of targetFailures) globallyCovered.add(failure);
        assert.ok(
            targetFailures.has("lighting-discontinuity") ||
                targetFailures.has("atmosphere-color-mismatch"),
            `${target.id} needs a lighting/color discriminator`,
        );
        assert.ok(target.cues.every((cue) => cue.pass.length > 40));
    }
    assert.deepEqual([...globallyCovered].sort(), [
        "atmosphere-color-mismatch",
        "boundary-clipping",
        "detached-owner-feature",
        "fake-grid",
        "lighting-discontinuity",
        "repeated-stamp",
        "screen-space-mask",
        "wrong-relative-placement",
        "wrong-scale-hierarchy",
    ]);
});

test("case iteration is lazy, deterministic, unique, and has an eight-case smoke path", () => {
    const iterator = iterateCloudMorphologyPhotographCases();
    assert.equal(typeof iterator.next, "function");
    const first = iterator.next();
    assert.equal(first.done, false);
    assert.equal(first.value.target.id, CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS[0].id);
    const allCases = [...iterateCloudMorphologyPhotographCases()];
    assert.ok(allCases.length > 400);
    assert.equal(new Set(allCases.map((entry) => entry.id)).size, allCases.length);
    const smoke = [...iterateCloudMorphologyPhotographSmokeCases()];
    assert.equal(smoke.length, CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS.length);
    assert.deepEqual(smoke.map((entry) => entry.target.id), [...CLOUD_MORPHOLOGY_PHOTOGRAPH_SMOKE_TARGET_IDS]);
    assert.ok(smoke.every((entry) => entry.classifications.length === 1));
});

test("one URL case resolves directly without materializing the qualification matrix", () => {
    const id = cloudMorphologyPhotographCaseId({
        targetId: "feature-mamma",
        environmentId: "tropical-storm-backlight",
        perspectiveId: "near-uplook",
        coverageId: "broken",
    });
    assert.equal(id,
        "feature-mamma--tropical-storm-backlight--near-uplook--broken");
    const resolved = resolveCloudMorphologyPhotographCase(id);
    assert.equal(resolved.id, id);
    assert.equal(resolved.target.designation, "mamma");
    assert.equal(resolved.environment.id, "tropical-storm-backlight");
    assert.equal(resolved.perspective.id, "near-uplook");
    assert.equal(resolved.coverage.id, "broken");
    assert.deepEqual(resolved.classifications, [resolved.target.assignment]);
    assert.equal(resolveCloudMorphologyPhotographCase(
        "feature-mamma--clean-side-day--near-uplook--broken"), undefined,
    );
    assert.equal(resolveCloudMorphologyPhotographCase("cu-mediocris--day-oblique-natural"), undefined);
    const resolverBlock = source.match(
        /export const resolveCloudMorphologyPhotographCase[\s\S]*?\n};/,
    )?.[0] ?? "";
    assert.doesNotMatch(resolverBlock, /iterateCloudMorphologyPhotographCases|yield|flatMap/);
});

test("scene adapter changes only review coverage and the classification assignment path", () => {
    // The adapter intentionally treats layer state as opaque. Keeping this
    // fixture local makes the qualification test independent of renderer
    // module resolution and proves the original references are preserved.
    const layer = {};
    const scene = {
        layers: [layer, layer, layer],
        totalOktas: 0,
        convection: 0,
        instability: 0,
        humidity: 0.5,
        fog: 0,
        noctilucent: 0,
        seed: [0.1, 0.2, 0.3, 0.4],
    };
    const first = iterateCloudMorphologyPhotographCases({ targetIds: ["feature-cavum"] }).next().value;
    const applied = applyMorphologyPhotographCaseToScene(scene, first);
    assert.equal(applied.totalOktas, first.coverage.oktas);
    assert.deepEqual(applied.classifications, first.classifications);
    assert.notEqual(applied.layers, scene.layers);
    assert.equal(applied.layers[first.target.assignment.layerIndex].oktas,
        first.coverage.oktas);
    assert.equal(applied.layers[first.target.assignment.layerIndex].coverage,
        first.coverage.oktas / 8);
    assert.equal(applied.latitude, first.environment.latitude);
    assert.equal(applied.season, first.environment.season);
    assert.equal(applied.solarDepression,
        Math.max(0, -first.environment.solarElevationDegrees));
    assert.equal(applied.noctilucent, 0);
    const noctilucent = iterateCloudMorphologyPhotographCases({ targetIds: ["upper-noctilucent"] }).next().value;
    assert.equal(applyMorphologyPhotographCaseToScene(scene, noctilucent).noctilucent, 0.82);
});

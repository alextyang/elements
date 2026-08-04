import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-weather-matrix-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-scene", "cloud-state-map", "cloud-special-origin-source",
    "cloud-morphology-modifiers",
    "high-cloud-physical-foundation", "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "low-layered-cloud-topology-qualification",
    "upper-atmospheric-cloud-foundation", "cloud-family-admissibility",
    "cloud-family-production-adapter",
    "cloud-atlas-material-profile",
    "cloud-system-runtime", "deep-convection-physical-foundation",
    "hydrometeor-system", "weather-qualification-matrix",
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
        .replaceAll('"./cloud-system-runtime"',
            '"./cloud-system-runtime.mjs"')
        .replaceAll('"./deep-convection-physical-foundation"',
            '"./deep-convection-physical-foundation.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}

const stateMap = await import(
    new URL(`file://${join(temporaryRoot, "cloud-state-map.mjs")}`)
);
const matrix = await import(
    new URL(`file://${join(temporaryRoot, "weather-qualification-matrix.mjs")}`)
);
const runtime = await import(
    new URL(`file://${join(temporaryRoot, "cloud-system-runtime.mjs")}`)
);
const specialSources = await import(
    new URL(`file://${join(temporaryRoot, "cloud-special-origin-source.mjs")}`)
);
const hydrometeors = await import(
    new URL(`file://${join(temporaryRoot, "hydrometeor-system.mjs")}`)
);
const morphology = await import(
    new URL(`file://${join(temporaryRoot, "cloud-morphology-modifiers.mjs")}`)
);
const morphologyManifest = morphology.validateCloudMorphologyModifierManifest(
    JSON.parse(readFileSync(new URL(
        "../public/assets/sky/cloud-morphology-modifiers-v1.json",
        import.meta.url,
    ), "utf8")),
);

const radians = (degrees) => degrees * Math.PI / 180;
const stableProductionProjection = (cloudRuntime, sampleCount = 4096) =>
    runtime.estimateCloudPopulationProjection(cloudRuntime.systems, {
        azimuthRadians: matrix.QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
        elevationRadians: radians(27),
        horizontalFovRadians: radians(64),
        verticalFovRadians: radians(64 * 0.68),
        sampleCount,
    });
const minimumOccupiedSkyFor = (scene) => {
    const coverage = Math.max(0, ...scene.layers.map((layer) =>
        layer.present ? layer.coverage : 0));
    return coverage > 0 ? Math.max(0.0025, coverage * 0.02) : 0;
};
const firstQualificationCase = (targetId) =>
    matrix.iterateWeatherQualificationCases(new Set([targetId])).next().value;
const bearingOf = (extent) => Math.atan2(
    extent.centerEastKm,
    extent.centerNorthKm,
);
const angleDelta = (left, right) => Math.atan2(
    Math.sin(left - right),
    Math.cos(left - right),
);

test("the lazy matrix covers every WMO identity and orthogonal appearance axis", () => {
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS;
    assert.equal(targets.length, 216);
    assert.equal(matrix.WEATHER_QUALIFICATION_SUMMARY.cases, 3272);
    assert.equal(new Set(targets.map((target) => target.id)).size, targets.length);
    assert.equal(targets.filter((target) => target.axis === "species").length, 31);
    assert.ok(targets.some((target) =>
        target.id === "precipitation-stratocumulus-snow-pellets"));
    assert.ok(!targets.some((target) =>
        target.id === "precipitation-stratocumulus-drizzle"));

    const cloudTargets = targets.filter((target) => target.kind === "cloud");
    const values = (field) => new Set(cloudTargets.flatMap((target) =>
        target.classification[field] ?? []));
    assert.deepEqual([...values("varieties")].sort(), [
        "duplicatus", "intortus", "lacunosus", "opacus", "perlucidus",
        "radiatus", "translucidus", "undulatus", "vertebratus",
    ]);
    assert.deepEqual([...values("supplementaryFeatures")].sort(), [
        "arcus", "asperitas", "cauda", "cavum", "fluctus", "incus",
        "mamma", "murus", "praecipitatio", "tuba", "virga",
    ]);
    assert.deepEqual([...values("accessoryClouds")].sort(), [
        "flumen", "pannus", "pileus", "velum",
    ]);
    const origins = new Set(cloudTargets.map((target) =>
        target.classification.origin.kind === "special"
            ? target.classification.origin.designation
            : target.classification.origin.kind));
    for (const origin of [
        "genitus", "mutatus", "flammagenitus", "homogenitus",
        "homomutatus", "cataractagenitus", "silvagenitus",
    ]) assert.ok(origins.has(origin), `missing ${origin}`);
    for (const cirriformGenus of ["cirrus", "cirrocumulus", "cirrostratus"]) {
        assert.ok(targets.some((target) =>
            target.id === `origin-${cirriformGenus}-homomutatus`),
        `missing ${cirriformGenus} homomutatus`);
    }
    const freshContrail = targets.find((target) =>
        target.id === "origin-cirrus-homogenitus").classification;
    assert.equal(freshContrail.species, null);
    assert.deepEqual(freshContrail.varieties, []);
    assert.deepEqual(freshContrail.supplementaryFeatures, []);
    assert.equal(freshContrail.origin.source, "aircraft-condensation-trail");

    assert.deepEqual(
        targets.filter((target) => target.kind === "upper-atmospheric")
            .map((target) => target.upperCloud).sort(),
        ["nacreous", "noctilucent", "polar-stratospheric-ice",
            "polar-stratospheric-nat", "polar-stratospheric-sts"],
    );
    assert.deepEqual(
        targets.filter((target) => target.kind === "surface-obscuration")
            .map((target) => target.obscuration).sort(),
        ["diamond-dust", "fog", "ice-fog", "mist"],
    );
    assert.equal(targets.filter((target) =>
        target.implementation === "not-representable").length, 0);
});

test("the complete WMO mother-cloud table is represented and enforced", () => {
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS.filter(
        (target) => target.axis === "mother-cloud",
    );
    const expected = [];
    for (const [genus, relations] of Object.entries(
        stateMap.CLOUD_MOTHER_GENUS_RELATIONS,
    )) {
        for (const relation of ["genitus", "mutatus"]) {
            for (const motherGenus of relations[relation]) {
                expected.push(`${genus}:${relation}:${motherGenus}`);
            }
        }
    }
    const actual = targets.map(({ classification }) =>
        `${classification.genus}:${classification.origin.kind}:` +
        `${classification.origin.motherGenus}`).sort();
    assert.equal(targets.length, 48);
    assert.deepEqual(actual, expected.sort());
});

test("all 48 standalone mother-cloud targets materialize two attached finite owners", () => {
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS.filter(
        (target) => target.axis === "mother-cloud",
    );
    for (const target of targets) {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([target.id]),
        ).next().value;
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        assert.equal(resolved.cloudScene.authoredSystems.length, 2, target.id);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], target.id);
        const relation = target.classification.origin.kind;
        const child = cloudRuntime.systems.find((owner) =>
            owner.morphologyAssignment?.relation === relation);
        assert.ok(child, `${target.id}: missing causal daughter`);
        const lineage = child.familyProduction?.causalOrigin;
        assert.equal(lineage?.crossOwner, true, target.id);
        assert.equal(lineage?.motherGenus,
            target.classification.origin.motherGenus, target.id);
        const mother = cloudRuntime.systems.find((owner) =>
            owner.state.id === lineage.parentSystemId);
        assert.ok(mother, `${target.id}: missing materialized mother`);
        assert.equal(mother.state.classification.genus,
            target.classification.origin.motherGenus, target.id);
        assert.ok(lineage.verticalOverlapFraction > 0, target.id);
        assert.ok(lineage.horizontalAttachmentFraction > 0, target.id);
        assert.equal(target.implementation, "transport-attached", target.id);
    }
});

test("Altocumulus mutatus keeps its authored Nimbostratus mother on a synoptic shield", () => {
    const caseId = "mother-altocumulus-nimbostratus-mutatus--" +
        "clean-midday-side--horizon-wide";
    const qualificationCase = [...matrix.iterateWeatherQualificationCases(
        new Set(["mother-altocumulus-nimbostratus-mutatus"]),
    )].find((candidate) => candidate.id === caseId);
    assert.ok(qualificationCase, caseId);
    const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
    const motherSystem = resolved.cloudScene.authoredSystems.find(({ id }) =>
        id === "mother-altocumulus-nimbostratus-mutatus:mother-owner");
    assert.ok(motherSystem, "missing authored Nimbostratus mother owner");
    assert.ok(motherSystem.manifold.majorRadiusKm * 2 >= 80,
        "precipitating Nimbostratus mother must retain an 80 km synoptic span");

    const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
    assert.deepEqual(cloudRuntime.diagnostics, [], caseId);
    const daughter = cloudRuntime.systems.find((owner) =>
        owner.morphologyAssignment?.relation === "mutatus");
    assert.ok(daughter, "missing Altocumulus mutatus daughter");
    assert.equal(daughter.familyProduction.causalOrigin.parentSystemId,
        motherSystem.id);
});

test("Stratocumulus duplicatus authors both immediate decks around the observer", () => {
    const caseId = "variety-stratocumulus-duplicatus--" +
        "clean-midday-side--oblique-natural";
    const qualificationCase = [...matrix.iterateWeatherQualificationCases(
        new Set(["variety-stratocumulus-duplicatus"]),
    )].find((candidate) => candidate.id === caseId);
    assert.ok(qualificationCase, caseId);
    const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
    assert.equal(resolved.cloudScene.authoredSystems.length, 2);
    for (const system of resolved.cloudScene.authoredSystems) {
        assert.equal(Math.hypot(
            system.manifold.centerEastKm,
            system.manifold.centerNorthKm,
        ), 0, system.id);
    }

    const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
    assert.deepEqual(cloudRuntime.diagnostics, [], caseId);
    const domain = runtime.qualifyLowLayeredRuntimePopulation(
        cloudRuntime.systems,
    ).find(({ representation }) =>
        representation === "stratocumulus-stratiformis");
    assert.ok(domain, "missing Stratocumulus runtime domain");
    assert.equal(domain.placement, "immediate-overcast");
    assert.ok(domain.supportFraction >= 0.68,
        `immediate deck support collapsed to ${domain.supportFraction}`);
    assert.deepEqual(domain.violations, []);
});

test("Cirrus and Altocumulus duplicatus keep both levels in the stable production frame", () => {
    for (const caseId of [
        "variety-cirrus-duplicatus--clean-midday-side--oblique-natural",
        "variety-altocumulus-duplicatus--clean-midday-side--oblique-natural",
    ]) {
        const targetId = caseId.split("--")[0];
        const qualificationCase = [...matrix.iterateWeatherQualificationCases(
            new Set([targetId]),
        )].find(({ id }) => id === caseId);
        assert.ok(qualificationCase, caseId);
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        assert.equal(resolved.cloudScene.authoredSystems.length, 2, caseId);
        const authoredBearings = resolved.cloudScene.authoredSystems.map(
            ({ manifold }) => bearingOf(manifold),
        );
        assert.ok(authoredBearings.every((bearing) =>
            Math.abs(angleDelta(
                bearing,
                matrix.QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
            )) <= matrix.QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS),
        `${caseId}: authored outside bounded forward sector`);

        const cloudRuntime = runtime.createCloudSystemRuntime(
            resolved.cloudScene,
        );
        assert.deepEqual(cloudRuntime.diagnostics, [], caseId);
        assert.equal(cloudRuntime.systems.length, 2, caseId);
        const ranges = cloudRuntime.systems.map(({ state }) =>
            Math.hypot(
                state.extent.centerEastKm,
                state.extent.centerNorthKm,
            ));
        const midAltitudes = cloudRuntime.systems.map(({ state }) =>
            state.physical.baseAltitudeKm +
                state.physical.geometricDepthKm * 0.5);
        assert.notEqual(ranges[0], ranges[1], `${caseId}: no range parallax`);
        assert.notEqual(midAltitudes[0], midAltitudes[1],
            `${caseId}: no two-level separation`);
        assert.notEqual(
            cloudRuntime.systems[0].state.physical.kinematics.windDirection,
            cloudRuntime.systems[1].state.physical.kinematics.windDirection,
            `${caseId}: both levels share one kinematic plane`,
        );
        const frame = stableProductionProjection(cloudRuntime);
        assert.equal(frame.visibleOwnerCount, 2,
            `${caseId}: only ${frame.visibleOwnerCount} duplicatus levels visible; ` +
            cloudRuntime.systems.map(({ state }) =>
                `${state.physical.baseAltitudeKm.toFixed(2)}km@` +
                `${Math.hypot(state.extent.centerEastKm,
                    state.extent.centerNorthKm).toFixed(1)}km/` +
                `${(bearingOf(state.extent) * 180 / Math.PI).toFixed(1)}deg/` +
                `${state.extent.majorRadiusKm.toFixed(1)}x` +
                `${state.extent.minorRadiusKm.toFixed(1)}km`).join(", "));
        assert.ok(frame.supportFraction > 0,
            `${caseId}: duplicatus has no fixed-camera support`);
    }
});

test("curated genitus and mutatus scenes compile as attached cross-owner lineages", () => {
    const runtimeFor = (targetId) => {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([targetId]),
        ).next().value;
        assert.ok(qualificationCase, targetId);
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], targetId);
        return cloudRuntime;
    };

    const anvil = runtimeFor("multilayer-convective-anvil");
    const daughter = anvil.systems.find((owner) =>
        owner.morphologyAssignment?.relation === "genitus");
    assert.ok(daughter);
    const anvilLineage = daughter.familyProduction.causalOrigin;
    assert.equal(anvilLineage.crossOwner, true);
    assert.equal(anvilLineage.motherGenus, "cumulonimbus");
    assert.equal(anvilLineage.parentSystemId,
        "multilayer-convective-anvil:system:0");
    assert.equal(anvilLineage.childSystemId, daughter.state.id);
    assert.ok(anvilLineage.horizontalAttachmentFraction > 0.05);
    assert.ok(anvilLineage.verticalOverlapFraction > 0);
    assert.ok(anvilLineage.materialAncestryFraction >= 0.42);
    const storm = anvil.systems.find((owner) =>
        owner.state.id === anvilLineage.parentSystemId);
    assert.ok(storm);
    const angularWindDifference = Math.abs(Math.atan2(
        Math.sin(daughter.state.physical.kinematics.windDirection -
            storm.state.physical.kinematics.windDirection),
        Math.cos(daughter.state.physical.kinematics.windDirection -
            storm.state.physical.kinematics.windDirection),
    ));
    assert.ok(angularWindDifference < 0.5,
        `daughter wind detached by ${angularWindDifference.toFixed(3)} rad`);

    const warmFront = runtimeFor("multilayer-warm-front");
    const transformed = warmFront.systems.find((owner) =>
        owner.morphologyAssignment?.relation === "mutatus");
    assert.ok(transformed);
    const transition = transformed.familyProduction.causalOrigin;
    assert.equal(transition.crossOwner, true);
    assert.equal(transition.motherGenus, "altostratus");
    assert.equal(transition.transitionProgress, 0.56);
    assert.ok(transition.verticalOverlapFraction > 0);
    const mother = warmFront.systems.find((owner) =>
        owner.state.id === transition.parentSystemId);
    assert.ok(mother);
    assert.equal(mother.state.physical.kinematics.windDirection,
        transformed.state.physical.kinematics.windDirection);
    assert.equal(mother.state.physical.kinematics.windSpeed,
        transformed.state.physical.kinematics.windSpeed);
    const mass = (owner) => owner.state.physical.condensate.liquidWaterPath +
        owner.state.physical.condensate.iceWaterPath;
    const transitionedFraction = mass(transformed) /
        (mass(mother) + mass(transformed));
    assert.ok(Math.abs(transitionedFraction - transition.transitionProgress) < 1e-10,
        "mutatus material was duplicated instead of partitioned");
    for (const owner of [mother, transformed, storm, daughter]) {
        assert.ok(Object.values(owner.state.extent).every(Number.isFinite));
        assert.ok(Number.isFinite(owner.compiled.material.extinctionKm));
    }
});

test("every special-origin cloud is driven by a finite compatible source", () => {
    const sourceKinds = new Set();
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS.filter((target) =>
        target.axis === "special-origin");
    for (const target of targets) {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([target.id]),
        ).next().value;
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        assert.equal(resolved.cloudScene.specialOriginSources.length, 1, target.id);
        const source = resolved.cloudScene.specialOriginSources[0];
        assert.deepEqual(specialSources.validateCloudSpecialOriginSource(
            source,
            target.classification.genus,
        ), [], target.id);
        const assignment = resolved.cloudScene.classifications[0];
        assert.equal(assignment.sourceId, source.id, target.id);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], target.id);
        const owners = cloudRuntime.systems.filter((owner) =>
            owner.state.classification.origin.kind === "special");
        assert.ok(owners.length > 0, target.id);
        for (const owner of owners) {
            const metadata = owner.familyProduction.specialOrigin;
            assert.equal(metadata.sourceId, source.id, target.id);
            assert.equal(metadata.designation,
                target.classification.origin.designation, target.id);
            assert.ok(metadata.sourceMaterialFraction > 0 &&
                metadata.sourceMaterialFraction < 1, target.id);
            assert.ok(metadata.finiteFormationRadiusKm.every((value) =>
                Number.isFinite(value) && value > 0), target.id);
            assert.ok(Object.values(owner.state.extent).every(Number.isFinite),
                target.id);
            sourceKinds.add(metadata.sourceKind);
        }
    }
    assert.ok(sourceKinds.size >= 6,
        `special-source map collapsed to ${[...sourceKinds].join(", ")}`);

    const waterfallCase = matrix.iterateWeatherQualificationCases(
        new Set(["origin-stratus-cataractagenitus"]),
    ).next().value;
    const waterfallScene = matrix.resolveWeatherQualificationCase(
        waterfallCase,
    ).cloudScene;
    const specialOwner = runtime.createCloudSystemRuntime(
        waterfallScene,
    ).systems[0];
    const naturalScene = structuredClone(waterfallScene);
    delete naturalScene.specialOriginSources;
    delete naturalScene.classifications[0].sourceId;
    naturalScene.classifications[0].classification.origin = { kind: "natural" };
    const naturalOwner = runtime.createCloudSystemRuntime(naturalScene).systems[0];
    assert.notDeepEqual(specialOwner.state.extent, naturalOwner.state.extent,
        "finite waterfall placement did not reach the packed owner");
    assert.notDeepEqual(specialOwner.state.physical.thermodynamics,
        naturalOwner.state.physical.thermodynamics,
        "source thermodynamics did not reach the packed owner");
    assert.notDeepEqual(specialOwner.state.physical.condensate,
        naturalOwner.state.physical.condensate,
        "source material ancestry did not reach the packed owner");

    const alternativeKinds = new Set();
    for (let seed = 0; seed < 64; seed += 1) {
        alternativeKinds.add(specialSources.createCloudSpecialOriginSource({
            id: `fire-${seed}`, designation: "flammagenitus",
            genus: "cumulonimbus", deterministicSeed: seed,
        }).kind);
        alternativeKinds.add(specialSources.createCloudSpecialOriginSource({
            id: `aircraft-${seed}`, designation: "homogenitus",
            genus: "cirrus", deterministicSeed: seed,
        }).kind);
    }
    assert.ok(alternativeKinds.has("wildfire-convection"));
    assert.ok(alternativeKinds.has("volcanic-convection"));
    assert.ok(alternativeKinds.has("aircraft-exhaust-line"));
    assert.ok(alternativeKinds.has("aircraft-aerodynamic-line"));
});

test("special-origin editorial bearing rigidly rotates the complete trajectory", () => {
    const input = {
        id: "rigid-source-trajectory",
        designation: "homomutatus",
        genus: "cirrus",
        deterministicSeed: 0x51a77,
    };
    const ordinary = specialSources.createCloudSpecialOriginSource(input);
    assert.deepEqual(ordinary, specialSources.createCloudSpecialOriginSource({
        ...input,
        editorialTerminalBearing: undefined,
    }), "omitting the editorial bearing must preserve ordinary source output");
    assert.throws(() => specialSources.createCloudSpecialOriginSource({
        ...input,
        editorialTerminalBearing: Number.NaN,
    }), /bearing must be finite/);
    const targetBearing = 0.073;
    const curated = specialSources.createCloudSpecialOriginSource({
        ...input,
        editorialTerminalBearing: targetBearing,
    });
    const activeAge = Math.min(curated.ageSeconds, curated.activeLifetimeSeconds);
    const endpoint = (source) => [
        source.geometry.centerEastKm +
            Math.cos(source.advectionDirection) *
                source.advectionSpeedMps * activeAge / 1000,
        source.geometry.centerNorthKm +
            Math.sin(source.advectionDirection) *
                source.advectionSpeedMps * activeAge / 1000,
    ];
    const ordinaryEndpoint = endpoint(ordinary);
    const curatedEndpoint = endpoint(curated);
    assert.ok(Math.abs(angleDelta(
        Math.atan2(curatedEndpoint[0], curatedEndpoint[1]),
        targetBearing,
    )) < 1e-12);
    assert.ok(Math.abs(
        Math.hypot(...ordinaryEndpoint) - Math.hypot(...curatedEndpoint)
    ) < 1e-10, "trajectory endpoint range changed");
    assert.ok(Math.abs(
        Math.hypot(
            ordinary.geometry.centerEastKm,
            ordinary.geometry.centerNorthKm,
        ) - Math.hypot(
            curated.geometry.centerEastKm,
            curated.geometry.centerNorthKm,
        )
    ) < 1e-10, "source distance changed");
    assert.ok(Math.abs(angleDelta(
        ordinary.geometry.orientation - ordinary.advectionDirection,
        curated.geometry.orientation - curated.advectionDirection,
    )) < 1e-12, "source axis and advection were not rotated rigidly");
    for (const property of [
        "kind", "designation", "ageSeconds", "activeLifetimeSeconds",
        "advectionSpeedMps",
    ]) assert.equal(curated[property], ordinary[property], property);
    assert.equal(curated.geometry.majorRadiusKm,
        ordinary.geometry.majorRadiusKm);
    assert.equal(curated.geometry.minorRadiusKm,
        ordinary.geometry.minorRadiusKm);
    assert.deepEqual(curated.emission, ordinary.emission);
    assert.deepEqual(curated.composition, ordinary.composition);
});

test("all curated causal, special-origin, and multilayer previews meet the fixed camera", () => {
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS.filter(({ axis }) =>
        axis === "mother-cloud" || axis === "special-origin" ||
        axis === "multilayer");
    for (const target of targets) {
        const qualificationCase = firstQualificationCase(target.id);
        assert.ok(qualificationCase, target.id);
        const resolved = matrix.resolveWeatherQualificationCase(
            qualificationCase,
        );
        const cloudRuntime = runtime.createCloudSystemRuntime(
            resolved.cloudScene,
        );
        assert.deepEqual(cloudRuntime.diagnostics, [], target.id);
        const frame = stableProductionProjection(cloudRuntime, 65_536);
        const gate = minimumOccupiedSkyFor(resolved.cloudScene);
        if (gate === 0) continue;
        const requiredMargin = gate * 1.2;
        assert.ok(frame.visibleOwnerCount > 0 &&
            frame.supportFraction >= requiredMargin,
            `${target.id}: support ${frame.supportFraction.toFixed(6)} < ` +
            `${requiredMargin.toFixed(6)} (gate ${gate.toFixed(6)}); ` +
            cloudRuntime.systems.map(({ state }) =>
                `${state.physical.baseAltitudeKm.toFixed(2)}km@` +
                `${Math.hypot(state.extent.centerEastKm,
                    state.extent.centerNorthKm).toFixed(1)}km/` +
                `${(bearingOf(state.extent) * 180 / Math.PI).toFixed(1)}deg/` +
                `${state.extent.majorRadiusKm.toFixed(1)}x` +
                `${state.extent.minorRadiusKm.toFixed(1)}km`).join(", "));

        if (target.axis === "multilayer") {
            const physicalCenters = new Set(
                (resolved.cloudScene.authoredSystems ?? []).map(({ manifold }) =>
                    `${manifold.centerEastKm.toFixed(8)}:` +
                    manifold.centerNorthKm.toFixed(8)),
            );
            assert.equal(
                physicalCenters.size,
                resolved.cloudScene.authoredSystems?.length ?? 0,
                `${target.id}: multilayer roles collapsed onto one position`,
            );
        }
        if (target.axis === "special-origin") {
            const repeated = matrix.resolveWeatherQualificationCase(
                qualificationCase,
            );
            assert.deepEqual(
                repeated.cloudScene.specialOriginSources,
                resolved.cloudScene.specialOriginSources,
                `${target.id}: qualification source selection is not deterministic`,
            );
        }

        for (const system of resolved.cloudScene.authoredSystems ?? []) {
            const range = Math.hypot(
                system.manifold.centerEastKm,
                system.manifold.centerNorthKm,
            );
            if (range === 0) continue;
            assert.ok(Math.abs(angleDelta(
                bearingOf(system.manifold),
                matrix.QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
            )) <= matrix.QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS + 1e-12,
            `${target.id}: ${system.id} escaped editorial bearing bound`);
        }
        for (const source of resolved.cloudScene.specialOriginSources ?? []) {
            const activeAge = Math.min(
                source.ageSeconds,
                source.activeLifetimeSeconds,
            );
            const terminalEast = source.geometry.centerEastKm +
                Math.cos(source.advectionDirection) *
                    source.advectionSpeedMps * activeAge / 1000;
            const terminalNorth = source.geometry.centerNorthKm +
                Math.sin(source.advectionDirection) *
                    source.advectionSpeedMps * activeAge / 1000;
            assert.ok(Math.abs(angleDelta(
                Math.atan2(terminalEast, terminalNorth),
                matrix.QUALIFICATION_FORWARD_MERIDIAN_RADIANS,
            )) <= matrix.QUALIFICATION_EDITORIAL_BEARING_LIMIT_RADIANS + 1e-12,
            `${target.id}: source endpoint escaped editorial bearing bound`);
        }
    }
});

test("qualification edge cases retain geometric support above publication gates", () => {
    const expectations = [
        ["mother-altocumulus-cirrocumulus-mutatus", 0.01],
        ["mother-stratocumulus-cumulus-genitus", 0.0125],
        ["mother-altostratus-cirrostratus-mutatus", 0.015],
        ["mother-cumulus-altocumulus-genitus", 0.01],
        ["mother-cirrocumulus-cirrus-mutatus", 0.01],
        ["origin-stratus-silvagenitus", 0.0175],
    ];
    for (const [targetId, gate] of expectations) {
        const qualificationCase = firstQualificationCase(targetId);
        assert.ok(qualificationCase, targetId);
        const resolved = matrix.resolveWeatherQualificationCase(
            qualificationCase,
        );
        const cloudRuntime = runtime.createCloudSystemRuntime(
            resolved.cloudScene,
        );
        assert.deepEqual(cloudRuntime.diagnostics, [], targetId);
        const frame = stableProductionProjection(cloudRuntime);
        const requiredMargin = gate * 1.2;
        assert.ok(frame.supportFraction >= requiredMargin,
            `${targetId}: support ${frame.supportFraction.toFixed(6)} < ` +
            `${requiredMargin.toFixed(6)} (gate ${gate.toFixed(4)}); ` +
            cloudRuntime.systems.map(({ state }) =>
                `${state.physical.baseAltitudeKm.toFixed(2)}km@` +
                `${Math.hypot(state.extent.centerEastKm,
                    state.extent.centerNorthKm).toFixed(1)}km/` +
                `${(bearingOf(state.extent) * 180 / Math.PI).toFixed(1)}deg/` +
                `${state.extent.majorRadiusKm.toFixed(1)}x` +
                `${state.extent.minorRadiusKm.toFixed(1)}km`).join(", ") +
            `; source ${JSON.stringify(resolved.cloudScene
                .specialOriginSources?.[0]?.geometry ?? null)}`);
        if (targetId.startsWith("mother-")) {
            assert.ok(frame.supportFraction <= 0.25,
                `${targetId}: support ${frame.supportFraction.toFixed(6)} ` +
                "crowds the fixed qualification lens");
            const authored = resolved.cloudScene.authoredSystems ?? [];
            assert.equal(authored.length, 2, targetId);
            const ranges = authored.map(({ manifold }) => Math.hypot(
                manifold.centerEastKm,
                manifold.centerNorthKm,
            ));
            assert.ok(Math.abs(ranges[0] - ranges[1]) < 1e-9,
                `${targetId}: lineage did not retain a shared physical range`);
            assert.ok(Math.abs(angleDelta(
                bearingOf(authored[1].manifold),
                bearingOf(authored[0].manifold),
            ) - 0.025) < 1e-12,
            `${targetId}: altitude-layer parallax bearing collapsed`);
        }
    }
});

test("the shared 276-preview weather catalogue clears exact occupied-sky gates", () => {
    const invisibleCausalOwners = [];
    const outOfBandCausalEnvelopes = [];
    for (let targetIndex = 0;
        targetIndex < matrix.WEATHER_QUALIFICATION_TARGETS.length;
        targetIndex += 1) {
        const target = matrix.WEATHER_QUALIFICATION_TARGETS[targetIndex];
        const qualificationCase = firstQualificationCase(target.id);
        assert.ok(qualificationCase, target.id);
        const resolved = matrix.resolveWeatherQualificationCase(
            qualificationCase,
        );
        const cloudRuntime = runtime.createCloudSystemRuntime(
            resolved.cloudScene,
        );
        assert.deepEqual(cloudRuntime.diagnostics, [], target.id);
        const frame = stableProductionProjection(cloudRuntime, 65_536);
        const gate = minimumOccupiedSkyFor(resolved.cloudScene);
        if (gate === 0) continue;
        const requiredMargin = gate * 1.2;
        const geometry = cloudRuntime.systems.map(({ state }) =>
            `${state.id}:${state.physical.baseAltitudeKm.toFixed(2)}km@` +
            `${Math.hypot(state.extent.centerEastKm,
                state.extent.centerNorthKm).toFixed(1)}km/` +
            `${(bearingOf(state.extent) * 180 / Math.PI).toFixed(1)}deg/` +
            `${state.extent.majorRadiusKm.toFixed(1)}x` +
            `${state.extent.minorRadiusKm.toFixed(1)}km`).join(", ");
        assert.ok(frame.supportFraction >= requiredMargin,
            `preview ${61 + targetIndex} ${target.id}: support ` +
            `${frame.supportFraction.toFixed(6)} < ` +
            `${requiredMargin.toFixed(6)} (gate ${gate.toFixed(6)}); ` +
            geometry);

        if (target.axis === "mother-cloud") {
            const authored = resolved.cloudScene.authoredSystems ?? [];
            assert.equal(authored.length, 2, target.id);
            const ranges = authored.map(({ manifold }) => Math.hypot(
                manifold.centerEastKm,
                manifold.centerNorthKm,
            ));
            const immediate = ranges.some((range) => range < 1e-9);
            if (!immediate) {
                if (frame.visibleOwnerCount !== 2) {
                    invisibleCausalOwners.push(
                        `${target.id}: ${frame.visibleOwnerCount}/2; ${geometry}`,
                    );
                }
                if (frame.supportFraction < 0.07 ||
                    frame.supportFraction > 0.12) {
                    outOfBandCausalEnvelopes.push(
                        `${target.id}: ${frame.supportFraction.toFixed(6)}; ` +
                        geometry,
                    );
                }
                assert.ok(Math.abs(ranges[0] - ranges[1]) < 1e-9,
                    `${target.id}: causal owners do not share one coupled ` +
                    "physical range");
            }
        }
        if (target.axis === "special-origin") {
            assert.ok(frame.supportFraction <= 0.25,
                `${target.id}: support ${frame.supportFraction.toFixed(6)} ` +
                `crowds the production frame; ${geometry}`);
        }
    }
    assert.deepEqual(invisibleCausalOwners, [],
        "every non-immediate lineage must visibly retain both causal owners");
    assert.deepEqual(outOfBandCausalEnvelopes, [],
        "every non-immediate lineage must occupy 7-12% of the production frame");
});

test("invalid source and cross-owner combinations are rejected before packing", () => {
    const firstCase = (targetId) => matrix.iterateWeatherQualificationCases(
        new Set([targetId]),
    ).next().value;
    const special = matrix.resolveWeatherQualificationCase(
        firstCase("origin-stratus-silvagenitus"),
    ).cloudScene;
    const missingSource = structuredClone(special);
    missingSource.classifications[0].sourceId = "absent-source";
    assert.ok(runtime.createCloudSystemRuntime(missingSource).diagnostics.some(
        (message) => message.includes("missing-special-origin-source"),
    ));
    const wrongSource = structuredClone(special);
    wrongSource.specialOriginSources[0].designation = "cataractagenitus";
    wrongSource.specialOriginSources[0].kind = "waterfall-spray";
    assert.ok(runtime.createCloudSystemRuntime(wrongSource).diagnostics.some(
        (message) => message.includes("special-origin-source-mismatch"),
    ));

    const anvil = matrix.resolveWeatherQualificationCase(
        firstCase("multilayer-convective-anvil"),
    ).cloudScene;
    const missingParent = structuredClone(anvil);
    const childAssignment = missingParent.classifications.find((assignment) =>
        assignment.relation === "genitus");
    childAssignment.causalParent.systemId = "absent-mother-owner";
    assert.ok(runtime.createCloudSystemRuntime(missingParent).diagnostics.some(
        (message) => message.includes("missing-causal-parent-owner"),
    ));
    const wrongParentGenus = structuredClone(anvil);
    const wrongChild = wrongParentGenus.classifications.find((assignment) =>
        assignment.relation === "genitus");
    wrongChild.classification.origin.motherGenus = "altocumulus";
    assert.ok(runtime.createCloudSystemRuntime(wrongParentGenus).diagnostics.some(
        (message) => message.includes("causal-parent-genus-mismatch"),
    ));
    const selfParent = structuredClone(anvil);
    const selfChild = selfParent.classifications.find((assignment) =>
        assignment.relation === "genitus");
    selfChild.causalParent = {
        layerIndex: selfChild.layerIndex,
        systemId: selfChild.systemId,
    };
    assert.ok(runtime.createCloudSystemRuntime(selfParent).diagnostics.some(
        (message) => message.includes("self-causal-parent"),
    ));
});

test("environment states cover physically distinct aerosol, twilight and night radiance", () => {
    const environments = matrix.WEATHER_QUALIFICATION_ENVIRONMENTS;
    for (const environment of environments) {
        assert.deepEqual(matrix.validateQualificationEnvironment(environment), [],
            environment.id);
    }
    assert.deepEqual(new Set(environments.map(({ aerosolType }) => aerosolType)),
        new Set(["clean", "maritime", "dust", "smoke", "sulfate", "pollution"]));
    const nights = environments.filter(({ solarElevationDegrees }) =>
        solarElevationDegrees <= -12);
    assert.ok(nights.length >= 7);
    assert.ok(nights.some(({ lighting }) => lighting === "moonless"));
    assert.ok(nights.some(({ moonIlluminatedFraction }) =>
        moonIlluminatedFraction > 0.9));
    assert.ok(nights.some(({ artificialSkyglow }) => artificialSkyglow > 0.5));
});

test("the nimbostratus pannus scene preserves both the parent and lower underdeck", () => {
    const qualificationCase = matrix.iterateWeatherQualificationCases(
        new Set(["multilayer-precipitation-pannus"]),
    ).next().value;
    assert.ok(qualificationCase);
    const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
    assert.equal(resolved.cloudScene.layers[0].present, true);
    assert.equal(resolved.cloudScene.layers[0].species, "stratus-fractus");
    assert.equal(resolved.cloudScene.layers[1].genus, "nimbostratus");
    assert.equal(resolved.cloudScene.layers[1].present, true);
    assert.ok(resolved.cloudScene.classifications.some((assignment) =>
        assignment.layerIndex === 0 && assignment.relation === "embedded"));
});

test("every lazy case resolves to executable scene, atmosphere, surface and lighting state", () => {
    const darknessValues = new Set();
    let resolvedCount = 0;
    for (const qualificationCase of matrix.iterateWeatherQualificationCases()) {
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        resolvedCount += 1;
        assert.equal(resolved.cloudScene.layers.length, 3,
            qualificationCase.id);
        assert.ok(resolved.atmosphere.aerosolOpticalDepth550 >= 0,
            qualificationCase.id);
        assert.ok(resolved.atmosphere.visibilityKm > 0,
            qualificationCase.id);
        assert.ok(resolved.surface.albedo >= 0 && resolved.surface.albedo <= 1,
            qualificationCase.id);
        assert.equal(
            resolved.hydrometeors.boundaryLayer?.surfaceTemperatureKelvin,
            qualificationCase.environment.surfaceTemperatureKelvin,
            qualificationCase.id,
        );
        assert.ok(
            (resolved.hydrometeors.boundaryLayer?.surfaceRelativeHumidity ?? 0) >=
                qualificationCase.environment.relativeHumidity,
            qualificationCase.id,
        );
        assert.ok(resolved.illumination.darkness >= 0 &&
            resolved.illumination.darkness <= 1, qualificationCase.id);
        darknessValues.add(resolved.illumination.darkness.toFixed(2));
        if (qualificationCase.target.kind === "cloud") {
            assert.equal(resolved.classifications.length,
                qualificationCase.target.axis === "mother-cloud" ? 2 : 1,
                qualificationCase.id);
            assert.ok(resolved.cloudScene.layers.some(({ present }) => present),
                qualificationCase.id);
            if (qualificationCase.target.precipitationKind) {
                assert.equal(resolved.hydrometeors.cloudPrecipitation?.[0].kind,
                    qualificationCase.target.precipitationKind,
                    qualificationCase.id);
                if (qualificationCase.target.precipitationKind === "ice-pellets") {
                    assert.ok(resolved.hydrometeors.phaseProfile,
                        qualificationCase.id);
                }
            }
        } else if (qualificationCase.target.kind === "surface-obscuration") {
            assert.equal(resolved.hydrometeors.surface?.phenomenon,
                qualificationCase.target.obscuration,
                qualificationCase.id);
            assert.ok(resolved.hydrometeors.surface?.region,
                qualificationCase.id);
        }
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], qualificationCase.id);
        if (qualificationCase.target.axis === "precipitation" ||
            qualificationCase.target.kind === "surface-obscuration") {
            const hydrometeorRuntime = hydrometeors.createHydrometeorRuntime(
                cloudRuntime.systems,
                {
                    surfaceAltitudeKm:
                        qualificationCase.perspective.observerAltitudeKm,
                    surfaceTemperatureKelvin:
                        qualificationCase.environment.surfaceTemperatureKelvin,
                    surfaceRelativeHumidity:
                        qualificationCase.environment.relativeHumidity,
                    surfacePressureHpa: 1013.25,
                    surfaceWindSpeed:
                        qualificationCase.environment.windSpeedMetersPerSecond,
                    surfaceWindDirection: 0,
                    fogAmount: resolved.cloudScene.fog,
                },
                96,
                resolved.hydrometeors,
            );
            assert.ok(hydrometeorRuntime.fields.length > 0,
                `${qualificationCase.id}: no executable hydrometeor field`);
            assert.deepEqual(hydrometeorRuntime.diagnostics, [],
                qualificationCase.id);
        }
    }
    assert.equal(resolvedCount, matrix.WEATHER_QUALIFICATION_SUMMARY.cases);
    assert.ok(darknessValues.size >= 6,
        `night/twilight collapsed to ${[...darknessValues].join(", ")}`);
});

test("every labeled morphology target reaches every finite production owner", () => {
    const modifierIds = new Set(morphology.CLOUD_MORPHOLOGY_MODIFIER_IDS);
    for (const target of matrix.WEATHER_QUALIFICATION_TARGETS) {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([target.id]),
        ).next().value;
        assert.ok(qualificationCase, target.id);
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        const expected = target.kind === "cloud" ? [
            ...target.classification.varieties,
            ...target.classification.supplementaryFeatures,
            ...target.classification.accessoryClouds,
        ].filter((id) => modifierIds.has(id))
            : target.kind === "upper-atmospheric" ? [
                morphology.upperMorphologyModifierForState(target.upperCloud),
            ] : [];
        if (expected.length === 0) continue;
        const applicableRequests = cloudRuntime.morphologyRequests.filter((request) =>
            target.kind === "upper-atmospheric"
                ? request.upperAtmosphericCloud === target.upperCloud
                : request.classification?.genus === target.classification.genus,
        );
        assert.ok(applicableRequests.length > 0,
            `${target.id}: no finite morphology owner`);
        for (const request of applicableRequests) {
            const selection = morphology.selectCloudMorphologyModifiers(
                morphologyManifest,
                request,
            );
            assert.deepEqual(selection.diagnostics, [],
                `${target.id}: ${selection.diagnostics.map(({ modifierId, code }) =>
                    `${modifierId}:${code}`).join(",")}`);
            const selected = new Set(selection.modifiers.map(({ id }) => id));
            for (const id of expected) assert.ok(selected.has(id),
                `${target.id}: ${id} did not reach owner ${request.parent.ownerIndex}`);
        }
    }
});

test("matrix implementation labels distinguish packing, operators, transport, and photographs", () => {
    const operatorAxes = new Set([
        "variety", "supplementary-feature", "accessory-cloud",
    ]);
    const transportAxes = new Set([
        "species", "precipitation", "convective-lifecycle", "mother-cloud",
        "surface-obscuration", "upper-atmospheric", "multilayer",
    ]);
    for (const target of matrix.WEATHER_QUALIFICATION_TARGETS) {
        if (operatorAxes.has(target.axis)) {
            assert.equal(target.implementation, "operator-active", target.id);
        }
        if (transportAxes.has(target.axis)) {
            assert.equal(target.implementation, "transport-attached", target.id);
        }
        if (target.axis === "special-origin") {
            const origin = target.classification.origin;
            const needsAerosolTransport = origin.designation === "flammagenitus" ||
                origin.designation === "homogenitus" &&
                target.classification.genus !== "cirrus";
            assert.equal(target.implementation,
                needsAerosolTransport ? "operator-active" : "transport-attached",
                target.id);
        }
        assert.notEqual(target.implementation, "photographically-qualified",
            `${target.id} must not claim photographic evidence from CPU state alone`);
    }
    assert.equal(matrix.WEATHER_QUALIFICATION_SUMMARY.byImplementation[
        "photographically-qualified"
    ], 0);
    assert.ok(matrix.WEATHER_QUALIFICATION_SUMMARY.transportGaps > 0);
    assert.equal(matrix.WEATHER_QUALIFICATION_SUMMARY.photographicGaps,
        matrix.WEATHER_QUALIFICATION_SUMMARY.targets);
});

test("Nimbostratus virga and ground precipitation retain distinct physical paths", () => {
    const ownerFor = (targetId) => {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([targetId]),
        ).next().value;
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], targetId);
        return cloudRuntime.systems.find((owner) =>
            owner.state.classification.genus === "nimbostratus");
    };
    const virga = ownerFor("feature-nimbostratus-virga");
    const precipitation = ownerFor("feature-nimbostratus-praecipitatio");
    assert.ok(virga && precipitation);
    assert.equal(virga.familyProduction.representation, "nimbostratus-virga");
    assert.equal(precipitation.familyProduction.representation,
        "nimbostratus-praecipitatio");
    assert.equal(virga.compiled.precipitation.kind, "virga");
    assert.ok(virga.compiled.precipitation.evaporationDepthKm > 0);
    assert.ok(precipitation.compiled.precipitation.kind === "rain" ||
        precipitation.compiled.precipitation.kind === "snow");
    assert.ok(precipitation.compiled.precipitation.rate > 0);
    assert.equal(precipitation.compiled.precipitation.evaporationDepthKm, 0);
    assert.notEqual(virga.familyProduction.topologyVariantId,
        precipitation.familyProduction.topologyVariantId);
    assert.notEqual(virga.compiled.material.extinctionKm,
        precipitation.compiled.material.extinctionKm);
});

test("upper qualification propagates real thermal domains and distinct materials", () => {
    const materialProfiles = new Set();
    const particleCompositions = new Set();
    const stateIds = new Set();
    for (const targetId of [
        "upper-psc-type-ib-sts", "upper-psc-type-ia-nat",
        "upper-psc-type-ii-ice", "upper-nacreous", "upper-noctilucent",
    ]) {
        const qualificationCase = matrix.iterateWeatherQualificationCases(
            new Set([targetId]),
        ).next().value;
        const resolved = matrix.resolveWeatherQualificationCase(qualificationCase);
        assert.equal(resolved.cloudScene.stratosphericTemperatureKelvin,
            qualificationCase.environment.stratosphericTemperatureKelvin);
        assert.equal(resolved.cloudScene.mesopauseTemperatureKelvin,
            qualificationCase.environment.mesopauseTemperatureKelvin);
        const cloudRuntime = runtime.createCloudSystemRuntime(resolved.cloudScene);
        assert.deepEqual(cloudRuntime.diagnostics, [], targetId);
        const request = cloudRuntime.morphologyRequests.find((candidate) =>
            candidate.upperAtmosphericCloud === qualificationCase.target.upperCloud);
        assert.ok(request, targetId);
        const selection = morphology.selectCloudMorphologyModifiers(
            morphologyManifest,
            request,
        );
        assert.deepEqual(selection.diagnostics, [], targetId);
        const compiled = morphology.compileCloudMorphologyRecords(
            morphologyManifest,
            [request],
        );
        assert.deepEqual(compiled.diagnostics, [], targetId);
        assert.equal(compiled.records.length, 1, targetId);
        const record = compiled.records[0];
        materialProfiles.add(record.shape1[3]);
        particleCompositions.add(record.upperAtmosphericState.composition);
        stateIds.add(record.upperAtmosphericState.stateId);
        assert.equal(record.upperAtmosphericState.topologyVariantId,
            request.upperAtmosphericState.topologyVariantId);
        const packed = morphology.packCloudMorphologyModifiers(
            morphologyManifest,
            [request],
        );
        const profileWord = (morphology.CLOUD_MORPHOLOGY_HEADER_TEXELS + 7) * 4 + 3;
        assert.equal(packed.data[profileWord], record.shape1[3], targetId);
    }
    assert.equal(materialProfiles.size, 3);
    assert.equal(particleCompositions.size, 4);
    assert.equal(stateIds.size, 5);
});

test("every qualification target is physically valid and every context is exercised", () => {
    for (const target of matrix.WEATHER_QUALIFICATION_TARGETS) {
        assert.deepEqual(
            matrix.validateWeatherQualificationTarget(target),
            [],
            target.id,
        );
    }
    const cases = matrix.iterateWeatherQualificationCases();
    assert.equal(typeof cases.next, "function");
    assert.equal(Array.isArray(cases), false);
    const caseIds = new Set();
    const environmentIds = new Set();
    const perspectiveIds = new Set();
    let count = 0;
    for (const qualificationCase of cases) {
        count += 1;
        caseIds.add(qualificationCase.id);
        environmentIds.add(qualificationCase.environment.id);
        perspectiveIds.add(qualificationCase.perspective.id);
    }
    assert.equal(count, matrix.WEATHER_QUALIFICATION_SUMMARY.cases);
    assert.equal(caseIds.size, count);
    assert.deepEqual(
        environmentIds,
        new Set(matrix.WEATHER_QUALIFICATION_ENVIRONMENTS.map(({ id }) => id)),
    );
    assert.deepEqual(
        perspectiveIds,
        new Set(matrix.WEATHER_QUALIFICATION_PERSPECTIVES.map(({ id }) => id)),
    );
    assert.ok(matrix.WEATHER_QUALIFICATION_SUMMARY.transportGaps > 0,
        "operator-only phenomena remain visible rather than silently promoted");
    assert.equal(matrix.WEATHER_QUALIFICATION_SUMMARY.photographicGaps,
        matrix.WEATHER_QUALIFICATION_SUMMARY.targets,
        "CPU readiness must not be mislabeled as photographic qualification");
});

const classification = (
    rendererSpecies,
    overrides = {},
) => ({
    ...stateMap.classificationFromRendererSpecies(rendererSpecies),
    ...overrides,
});

const system = ({
    rendererSpecies = "cumulus-congestus",
    classificationOverrides = {},
    precipitationKind = "none",
    rate = precipitationKind === "none" ? 0 : 4,
    terminalVelocity = precipitationKind === "none" ? 0 : 3,
    evaporationDepthKm = precipitationKind === "virga" ? 0.5 : 0,
    organization,
    lifecycleStage = "mature",
    iceWaterPath = rendererSpecies.startsWith("cumulonimbus") ? 0.3 : 0,
    verticalVelocity = 4,
} = {}) => {
    const isStorm = rendererSpecies.startsWith("cumulonimbus");
    const baseAltitudeKm = 0.8;
    const geometricDepthKm = isStorm ? 11 : 2.8;
    return {
        id: "qualification-test",
        classification: classification(rendererSpecies, classificationOverrides),
        physical: {
            baseAltitudeKm,
            geometricDepthKm,
            coverageOktas: 4,
            thermodynamics: {
                baseTemperatureKelvin: 286,
                topTemperatureKelvin: isStorm ? 211 : 269,
                relativeHumidity: 0.98,
                environmentalLapseRate: 6.1,
                stabilityIndex: isStorm ? -0.8 : -0.2,
                verticalVelocity,
                entrainment: 0.15,
            },
            kinematics: {
                windSpeed: 12,
                windDirection: 0.5,
                verticalShear: 4,
                turbulenceIntegralScaleKm: 0.6,
                turbulenceDissipation: 0.02,
            },
            condensate: {
                liquidWaterPath: 0.5,
                iceWaterPath,
                liquidFraction: isStorm ? 0.55 : 0.98,
                dropletEffectiveRadius: 14,
                iceEffectiveRadius: 52,
            },
            precipitation: {
                kind: precipitationKind,
                rate,
                terminalVelocity,
                evaporationDepthKm,
            },
            formation: {
                liftingCondensationLevelKm: baseAltitudeKm,
                levelOfFreeConvectionKm: isStorm ? 0.9 : 0.9,
                equilibriumLevelKm: isStorm ? 11.6 : 3.5,
                inversionBaseKm: null,
                inversionStrengthKelvin: 0,
                freezingLevelKm: 2.3,
                shearLayerBaseKm: 0.8,
                shearLayerTopKm: isStorm ? 11.8 : 3.6,
            },
        },
        extent: {
            centerEastKm: 12,
            centerNorthKm: 24,
            majorRadiusKm: 9,
            minorRadiusKm: 6,
            orientation: 0.5,
            boundaryTransitionKm: 1,
        },
        organization: organization ?? (isStorm ? {
            kind: "storm-complex",
            inflowRadiusKm: 8,
            updraftRadiusKm: 3,
            outflowRadiusKm: 15,
            propagationDirection: 0.7,
        } : {
            kind: "point-process",
            distribution: "clustered",
            meanSpacingKm: 3,
            minimumSeparationKm: 1,
            clusterRadiusKm: 8,
            anisotropy: 1.4,
            orientation: 0.5,
        }),
        lifecycle: {
            stage: lifecycleStage,
            stageProgress: 0.6,
            ageSeconds: 2400,
            cloudTopRiseRate: 3,
            condensateTendency: 0,
            glaciationRate: isStorm ? 0.01 : 0,
            precipitationEfficiency: precipitationKind === "none" ? 0 : 0.5,
            outflowSpeed: isStorm ? 18 : 0,
        },
    };
};

test("canonical state validation rejects physically impossible weather combinations", () => {
    const codes = (candidate) => new Set(
        stateMap.validateCloudSystem(candidate).map((issue) => issue.code),
    );
    assert.ok(codes(system({ precipitationKind: "hail" }))
        .has("invalid-precipitation-owner"));
    assert.ok(codes(system({ precipitationKind: "virga", rate: 0,
        terminalVelocity: 0, evaporationDepthKm: 0 }))
        .has("virga-without-evaporation"));
    assert.ok(codes(system({ classificationOverrides: {
        origin: { kind: "special", designation: "silvagenitus" },
    } })).has("invalid-special-origin-owner"));
    assert.ok(codes(system({ classificationOverrides: {
        origin: { kind: "mutatus", motherGenus: "cumulus" },
    } })).has("self-mother-cloud"));
    assert.ok(codes(system({ classificationOverrides: {
        origin: { kind: "genitus", motherGenus: "cirrus" },
    } })).has("invalid-mother-cloud-relation"));
    assert.ok(codes(system({ rendererSpecies: "cumulonimbus-capillatus",
        classificationOverrides: { supplementaryFeatures: ["cauda"] },
    })).has("cauda-without-murus"));
    assert.ok(codes(system({ rendererSpecies: "cumulonimbus-capillatus",
        classificationOverrides: { accessoryClouds: ["flumen"] },
        organization: {
            kind: "point-process", distribution: "clustered",
            meanSpacingKm: 5, minimumSeparationKm: 2,
            clusterRadiusKm: 10, anisotropy: 1, orientation: 0,
        },
    })).has("storm-feature-without-storm-complex"));
    assert.ok(codes(system({ rendererSpecies: "cumulonimbus-capillatus-incus",
        lifecycleStage: "growing", iceWaterPath: 0,
    })).has("incus-without-glaciated-outflow"));
    assert.ok(codes(system({ classificationOverrides: {
        varieties: ["radiatus"],
    } })).has("radiatus-without-radiating-bands"));
    assert.ok(codes(system({ classificationOverrides: {
        supplementaryFeatures: ["fluctus"],
    }, verticalVelocity: 4 })).has("fluctus-without-shear-instability") === false,
    "the physically sheared test state should support fluctus");
    assert.ok(codes(system({ classificationOverrides: {
        accessoryClouds: ["pannus"],
    } })).has("pannus-without-saturated-precipitation-layer"));
});

test("upper-atmosphere orthogonal state remains valid only outside a tropospheric genus", () => {
    const upper = {
        varieties: [], supplementaryFeatures: [], accessories: [],
        specialOrigin: "natural", upperAtmosphericCloud: "noctilucent",
        lifecycleStage: "mature", precipitationKind: "none",
    };
    assert.equal(stateMap.isOrthogonalStateValid("clear", upper), true);
    assert.equal(stateMap.isOrthogonalStateValid("cirrus", upper), false);
});

test("Stratocumulus precipitation no longer masquerades as WMO drizzle", () => {
    const empty = {
        genus: "clear", species: "generic", present: false,
        baseAltitude: 1000, thickness: 0, coverage: 0, oktas: 0,
        opticalDepth: 0, stratusBlend: 0, towerAmount: 0, anvilAmount: 0,
        iceFraction: 0, detailStrength: 0, windSpeed: 0, windDirection: 0,
        shear: 0, turbulence: 0, precipitation: 0, organization: "unorganized",
        lifecycle: 0.5, organizationStrength: 0,
    };
    const low = {
        ...empty, genus: "stratocumulus", species: "stratocumulus-stratiformis",
        present: true, baseAltitude: 700, thickness: 900, coverage: 0.75,
        oktas: 6, opticalDepth: 0.8, iceFraction: 0.02,
        detailStrength: 0.7, windSpeed: 9, windDirection: 0.4,
        shear: 0.2, turbulence: 0.3, precipitation: 0.7,
        organization: "closed-cell", organizationStrength: 0.7,
    };
    const result = runtime.createCloudSystemRuntime({
        layers: [low, empty, empty], totalOktas: 6,
        convection: 0.2, instability: 0.2, humidity: 0.88,
        fog: 0, noctilucent: 0, seed: [0.1, 0.2, 0.3, 0.4],
    });
    assert.deepEqual(result.diagnostics, []);
    assert.ok(result.systems.length > 0);
    assert.ok(result.systems.every(({ compiled }) =>
        compiled.precipitation.kind === "rain"));
});

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-weather-engine-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

for (const name of [
    "cloud-physical-sample",
    "cloud-weather-engine",
    "cloud-interaction-model",
]) {
    let output = ts.transpileModule(
        readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8"),
        { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } },
    ).outputText;
    output = output.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"');
    writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
}
const engine = await import(
    new URL(`file://${join(temporaryRoot, "cloud-weather-engine.mjs")}`)
);
const interactions = await import(
    new URL(`file://${join(temporaryRoot, "cloud-interaction-model.mjs")}`)
);

test("fixed-step replay is exactly deterministic and camera-independent", () => {
    const input = {
        mode: "free-running",
        seed: 0x12345678,
        domain: engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        fixedStepSeconds: 30,
        maxOwners: 16,
    };
    const left = engine.runCloudWeatherSimulation(
        engine.createCloudWeatherSimulation(input),
        80,
    );
    const right = engine.runCloudWeatherSimulation(
        engine.createCloudWeatherSimulation(input),
        80,
    );
    assert.equal(
        engine.cloudWeatherSimulationFingerprint(left),
        engine.cloudWeatherSimulationFingerprint(right),
    );
    assert.equal("camera" in left, false);
    assert.deepEqual(engine.validateCloudWeatherSimulation(left), []);
});

test("persistent owners demonstrate birth, merge, split, lineage, and bounded attachment", () => {
    const initial = engine.createCloudWeatherSimulation({
        mode: "free-running",
        seed: 456,
        domain: engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        fixedStepSeconds: 30,
        maxOwners: 20,
        initialOwners: [
            { id: "thermal-a", family: "convective", centerEastKm: -0.2,
                centerNorthKm: 10, baseAltitudeKm: 0.8, geometricDepthKm: 3,
                radiusEastKm: 3.5, radiusNorthKm: 3.2,
                liquidWaterMassKg: 1e8, verticalVelocityMetresPerSecond: 5,
                stratusFraction01: 0.1, organization: "clustered" },
            { id: "thermal-b", family: "convective", centerEastKm: 0.2,
                centerNorthKm: 10.2, baseAltitudeKm: 0.8, geometricDepthKm: 3,
                radiusEastKm: 3.5, radiusNorthKm: 3.2,
                liquidWaterMassKg: 1e8, verticalVelocityMetresPerSecond: 5,
                stratusFraction01: 0.1, organization: "clustered" },
        ],
    });
    const final = engine.runCloudWeatherSimulation(initial, 20);
    const kinds = new Set(final.events.map(({ kind }) => kind));
    assert.ok(kinds.has("birth"));
    assert.ok(kinds.has("merge"));
    assert.ok(kinds.has("split"));
    assert.ok(final.edges.some(({ kind }) => kind === "merge"));
    assert.ok(final.edges.some(({ kind }) => kind === "split"));
    assert.ok(final.edges.some(({ kind }) => kind === "lineage"));
    assert.ok(final.features.every(({ parentOwnerId, parentOwnerNumericId }) => {
        const parent = final.owners.find(({ id }) => id === parentOwnerId);
        return parent?.numericId === parentOwnerNumericId;
    }));
    assert.deepEqual(engine.validateCloudWeatherSimulation(final), []);
});

test("one continuous convective owner progresses through Cu, Cb, ice, precipitation, anvil, and decay", () => {
    let simulation = engine.createCloudWeatherSimulation({
        mode: "conditioned",
        seed: 123,
        domain: engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        target: { genus: "cumulus", species: "humilis", ownerCount: 1 },
        fixedStepSeconds: 60,
        maxOwners: 1,
    });
    const identities = new Set([
        `${simulation.owners[0].classification.genus}:` +
        `${simulation.owners[0].classification.species}`,
    ]);
    for (let index = 0; index < 260; index += 1) {
        simulation = engine.stepCloudWeatherSimulation(simulation);
        const owner = simulation.owners[0];
        identities.add(`${owner.classification.genus}:${owner.classification.species}`);
    }
    const owner = simulation.owners[0];
    const eventKinds = new Set(simulation.events.map(({ kind }) => kind));
    assert.ok(identities.has("cumulus:humilis"));
    assert.ok(identities.has("cumulus:mediocris"));
    assert.ok(identities.has("cumulus:congestus"));
    assert.ok(identities.has("cumulonimbus:calvus"));
    assert.ok(identities.has("cumulonimbus:capillatus"));
    assert.ok(eventKinds.has("glaciation"));
    assert.ok(eventKinds.has("precipitation-onset"));
    assert.ok(simulation.features.some(({ kind }) => kind === "incus"));
    assert.ok(owner.iceWaterMassKg > 0);
    assert.ok(owner.geometricDepthKm <=
        engine.DEFAULT_CLOUD_WEATHER_DOMAIN.tropopauseKm + 1.5 -
        owner.baseAltitudeKm + 1e-6);
    assert.equal(owner.lifecycleStage, "dead");
    assert.deepEqual(engine.validateCloudWeatherSimulation(simulation), []);
});

test("controlled boundary forcing transitions fog/stratus to cellular Sc and clearing", () => {
    const humidSounding = engine.DEFAULT_CLOUD_WEATHER_DOMAIN.sounding.map(
        (level) => ({ ...level, relativeHumidity01: 0.97,
            verticalVelocityMetresPerSecond: 0.02 }),
    );
    const mixedSounding = engine.DEFAULT_CLOUD_WEATHER_DOMAIN.sounding.map(
        (level) => ({ ...level, relativeHumidity01: 0.78,
            verticalVelocityMetresPerSecond: 0.08 }),
    );
    const drySounding = engine.DEFAULT_CLOUD_WEATHER_DOMAIN.sounding.map(
        (level) => ({ ...level, relativeHumidity01: 0.28,
            verticalVelocityMetresPerSecond: -0.3 }),
    );
    const domain = {
        ...engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        id: "marine-boundary-layer-transition",
        terrainElevationKm: 0,
        surfaceRelativeHumidity01: 0.99,
        surfaceHeatFluxWattsPerSquareMetre: 10,
        surfaceMoistureFluxGramsPerSquareMetrePerSecond: 0.1,
        capeJoulesPerKilogram: 80,
        cinJoulesPerKilogram: 180,
        inversionBaseKm: 0.5,
        inversionStrengthKelvin: 4,
        sounding: humidSounding,
    };
    let simulation = engine.createCloudWeatherSimulation({
        mode: "free-running",
        seed: 9,
        domain,
        fixedStepSeconds: 60,
        maxOwners: 1,
        initialOwners: [{
            id: "marine-deck", family: "low-layered",
            centerEastKm: 0, centerNorthKm: 5,
            baseAltitudeKm: 0.02, geometricDepthKm: 0.2,
            radiusEastKm: 12, radiusNorthKm: 10,
            liquidWaterMassKg: 4e7, verticalVelocityMetresPerSecond: 0.03,
            stratusFraction01: 0.99, organization: "frontal",
        }],
    });
    const identities = new Set();
    for (let index = 0; index < 420; index += 1) {
        const update = index < 30 ? {
            domain: { surfaceRelativeHumidity01: 0.99,
                surfaceHeatFluxWattsPerSquareMetre: 10,
                sounding: humidSounding },
            forcing: { cloudTopRadiativeCoolingKelvinPerHour: 2,
                frontogenesis01: 0.8 },
        } : index < 90 ? {
            domain: { surfaceRelativeHumidity01: 0.78,
                surfaceHeatFluxWattsPerSquareMetre: 260,
                sounding: mixedSounding },
            forcing: { cloudTopRadiativeCoolingKelvinPerHour: 0.8,
                frontogenesis01: 0.1, convergence01: 0.3 },
        } : {
            domain: { surfaceRelativeHumidity01: 0.2,
                surfaceHeatFluxWattsPerSquareMetre: 380,
                surfaceMoistureFluxGramsPerSquareMetrePerSecond: 0,
                sounding: drySounding },
            forcing: { cloudTopRadiativeCoolingKelvinPerHour: 0,
                subsidenceMetresPerSecond: 1.5,
                surfaceMoistureFluxMultiplier: 0 },
        };
        simulation = engine.stepCloudWeatherSimulation(simulation, update);
        const owner = simulation.owners[0];
        identities.add(`${owner.classification.genus}:${owner.classification.species}`);
    }
    const owner = simulation.owners[0];
    assert.ok(identities.has("stratus:nebulosus"));
    assert.ok(identities.has("stratocumulus:stratiformis"));
    assert.ok(identities.has("cumulus:fractus"));
    assert.ok(owner.lifecycleStage === "dead" ||
        owner.lifecycleStage === "decaying");
    assert.ok(owner.relativeHumidity01 < 0.5);
    assert.deepEqual(engine.validateCloudWeatherSimulation(simulation), []);
});

test("conditioned upper-atmospheric clouds use the same owner representation", () => {
    const noctilucent = engine.createCloudWeatherSimulation({
        mode: "conditioned",
        seed: 88,
        domain: { ...engine.DEFAULT_CLOUD_WEATHER_DOMAIN, season01: 0.92 },
        target: {
            genus: "cirrus",
            upperAtmosphericCloud: "noctilucent",
            coverageOktas: 3,
        },
    });
    assert.equal(noctilucent.owners[0].family, "upper-atmospheric");
    assert.ok(noctilucent.owners[0].baseAltitudeKm >= 80);
    assert.deepEqual(engine.validateCloudWeatherSimulation(noctilucent), []);
});

test("middle-cloud forcing preserves stationary wave packets and distinct classifications", () => {
    let simulation = engine.createCloudWeatherSimulation({
        mode: "conditioned",
        seed: 0xace1,
        domain: engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        target: {
            genus: "altocumulus",
            species: "lenticularis",
            coverageOktas: 4,
            ownerCount: 1,
        },
        forcing: { orographicLiftMetresPerSecond: 0.8 },
        fixedStepSeconds: 30,
        maxOwners: 1,
    });
    const start = simulation.owners[0];
    for (let index = 0; index < 40; index += 1) {
        simulation = engine.stepCloudWeatherSimulation(simulation, {
            forcing: { orographicLiftMetresPerSecond: 0.8 },
        });
    }
    const owner = simulation.owners[0];
    assert.equal(owner.family, "middle");
    assert.equal(owner.organization, "wave-packet");
    assert.equal(owner.classification.genus, "altocumulus");
    assert.equal(owner.classification.species, "lenticularis");
    assert.ok(Math.abs(owner.centerEastKm - start.centerEastKm) < 1e-9);
    assert.ok(Math.abs(owner.centerNorthKm - start.centerNorthKm) < 1e-9);
    assert.deepEqual(engine.validateCloudWeatherSimulation(simulation), []);
});

test("high-ice owners shear, sediment, and sublimate through the common process loop", () => {
    const dryUpperSounding = engine.DEFAULT_CLOUD_WEATHER_DOMAIN.sounding.map(
        (level) => level.altitudeKm >= 6
            ? { ...level, relativeHumidity01: 0.18 }
            : level,
    );
    const domain = {
        ...engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        id: "dry-sheared-upper-troposphere",
        sounding: dryUpperSounding,
    };
    let simulation = engine.createCloudWeatherSimulation({
        mode: "conditioned",
        seed: 0xc1a0,
        domain,
        target: {
            genus: "cirrus",
            species: "uncinus",
            coverageOktas: 3,
            ownerCount: 1,
        },
        forcing: { windShearMultiplier: 2.2 },
        fixedStepSeconds: 60,
        maxOwners: 1,
    });
    const initial = { ...simulation.owners[0] };
    let maximumAspect = initial.radiusEastKm / initial.radiusNorthKm;
    for (let index = 0; index < 80; index += 1) {
        simulation = engine.stepCloudWeatherSimulation(simulation, {
            forcing: { windShearMultiplier: 2.2 },
        });
        maximumAspect = Math.max(
            maximumAspect,
            simulation.owners[0].radiusEastKm /
                simulation.owners[0].radiusNorthKm,
        );
    }
    const owner = simulation.owners[0];
    assert.equal(owner.family, "high-ice");
    assert.equal(owner.classification.genus, "cirrus");
    assert.equal(owner.classification.species, "uncinus");
    assert.ok(owner.baseAltitudeKm < initial.baseAltitudeKm);
    assert.ok(maximumAspect > initial.radiusEastKm / initial.radiusNorthKm);
    assert.ok(owner.iceWaterMassKg < initial.iceWaterMassKg);
    assert.ok(simulation.events.some(({ kind }) => kind === "evaporation"));
    assert.deepEqual(engine.validateCloudWeatherSimulation(simulation), []);
});


test("compound owners expose ordered shadows, precipitation traversal, outflow, and lineage", () => {
    const simulation = engine.createCloudWeatherSimulation({
        mode: "free-running",
        seed: 0x1a73,
        domain: engine.DEFAULT_CLOUD_WEATHER_DOMAIN,
        maxOwners: 4,
        initialOwners: [
            {
                id: "lower-deck", family: "low-layered",
                centerEastKm: 0, centerNorthKm: 10,
                baseAltitudeKm: 0.35, geometricDepthKm: 1.0,
                radiusEastKm: 7, radiusNorthKm: 6,
                liquidWaterMassKg: 7e7, stratusFraction01: 0.8,
                organization: "closed-cell",
            },
            {
                id: "storm-owner", family: "convective",
                centerEastKm: 0.4, centerNorthKm: 10.2,
                baseAltitudeKm: 0.8, geometricDepthKm: 10,
                radiusEastKm: 8, radiusNorthKm: 7,
                liquidWaterMassKg: 2e8, iceWaterMassKg: 1.6e8,
                verticalVelocityMetresPerSecond: 9,
                stratusFraction01: 0.08, organization: "storm-complex",
                classification: {
                    genus: "cumulonimbus", species: "capillatus",
                    varieties: [], supplementaryFeatures: ["incus"],
                    accessoryClouds: [], origin: { kind: "natural" },
                },
            },
        ],
    });
    const storm = simulation.owners.find(({ id }) => id === "storm-owner");
    assert.ok(storm);
    storm.precipitationKind = "rain";
    storm.precipitationRateMillimetresPerHour = 12;
    storm.coldPoolStrength01 = 0.65;
    simulation.edges.push({
        id: "edge-test-lineage", kind: "genitus",
        fromId: "storm-owner", toId: "lower-deck",
        createdStep: simulation.step, strength01: 0.7,
    });
    const graph = interactions.buildCloudInteractionGraph(simulation);
    const kinds = new Set(graph.interactions.map(({ kind }) => kind));
    assert.ok(kinds.has("ordered-overlap"));
    assert.ok(kinds.has("radiative-shadow"));
    assert.ok(kinds.has("precipitation-through-layer"));
    assert.ok(kinds.has("cold-pool-influence"));
    assert.ok(kinds.has("anvil-stabilization"));
    assert.ok(kinds.has("lineage-continuity"));
    assert.ok(interactions.cloudInteractionSourceTransmittance(
        graph, "lower-deck") < 1);
    assert.deepEqual(
        interactions.validateCloudInteractionGraph(simulation, graph),
        [],
    );
});

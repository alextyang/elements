import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import ts from "typescript";

const source = fs.readFileSync(
    new URL("../components/backgrounds/sky/cloud-scene.ts", import.meta.url),
    "utf8",
);
const javascript = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
    },
}).outputText;
const moduleObject = { exports: {} };
new Function("exports", "module", javascript)(moduleObject.exports, moduleObject);

const {
    CLOUD_GENERA,
    CLOUD_GENUS_LEVEL,
    CLOUD_SPECIES_CODE,
    WMO_CLOUD_SPECIES,
    constrainScene,
    createDailyCloudScene,
    createLayer,
    EMPTY_LAYER,
} = moduleObject.exports;

test("the renderer enumerates every WMO genus-species combination", () => {
    assert.equal(WMO_CLOUD_SPECIES.length, 29);
    assert.equal(new Set(WMO_CLOUD_SPECIES).size, 29);
    assert.ok(WMO_CLOUD_SPECIES.every((species) => CLOUD_SPECIES_CODE[species] > 0));
    assert.equal(
        new Set(WMO_CLOUD_SPECIES.map((species) => CLOUD_SPECIES_CODE[species])).size,
        29,
    );
});

test("explicit renderer species cannot be authored under the wrong genus", () => {
    assert.throws(
        () => createLayer({
            genus: "stratus",
            species: "cirrus-uncinus",
            oktas: 3,
        }),
        /cirrus-uncinus cannot be authored as genus stratus/,
    );
});

const scene = (layers, overrides = {}) => ({
    layers,
    totalOktas: 0,
    convection: 0.5,
    instability: 0.5,
    humidity: 0.5,
    fog: 0,
    noctilucent: 0,
    seed: [0.1, 0.2, 0.3, 0.4],
    ...overrides,
});

test("combined oktas is a coverage union", () => {
    const low = createLayer({ genus: "cumulus", oktas: 4 });
    const middle = createLayer({ genus: "altocumulus", oktas: 4 });
    const result = constrainScene(scene([low, middle, { ...EMPTY_LAYER }]));
    assert.equal(result.totalOktas, 6);
});

test("explicit same-tier owners retain independent physics and replace only their aggregate coverage", () => {
    const aggregate = createLayer({ genus: "altostratus", oktas: 2 });
    const lower = createLayer({
        genus: "altostratus", species: "altostratus-opacus", oktas: 4,
        baseAltitude: 2_800, thickness: 1_100,
        windSpeed: 14, windDirection: 0.4,
    });
    const upper = createLayer({
        genus: "altostratus", species: "altostratus-opacus", oktas: 4,
        baseAltitude: 4_250, thickness: 820,
        windSpeed: 22, windDirection: 0.72,
    });
    const authoredSystems = [lower, upper].map((layer, index) => ({
        id: `as-duplicatus-${index}`,
        layerIndex: 1,
        layer,
        manifold: {
            centerEastKm: index === 0 ? -12 : 18,
            centerNorthKm: index === 0 ? 34 : 58,
            majorRadiusKm: index === 0 ? 44 : 31,
            minorRadiusKm: index === 0 ? 21 : 14,
            orientation: layer.windDirection,
            boundaryTransitionKm: index === 0 ? 3.2 : 2.4,
        },
    }));
    const result = constrainScene(scene([
        { ...EMPTY_LAYER }, aggregate, { ...EMPTY_LAYER },
    ], { authoredSystems }));
    assert.equal(result.totalOktas, 6,
        "two independent 4-okta owners should union to six oktas");
    assert.deepEqual(result.authoredSystems.map(({ id, layer, manifold }) => ({
        id,
        base: layer.baseAltitude,
        depth: layer.thickness,
        wind: [layer.windSpeed, layer.windDirection],
        center: [manifold.centerEastKm, manifold.centerNorthKm],
    })), [
        { id: "as-duplicatus-0", base: 2_800, depth: 1_100,
            wind: [14, 0.4], center: [-12, 34] },
        { id: "as-duplicatus-1", base: 4_250, depth: 820,
            wind: [22, 0.72], center: [18, 58] },
    ]);
    assert.notEqual(result.authoredSystems, authoredSystems);
    assert.notEqual(result.authoredSystems[0].layer, lower);
    assert.notEqual(result.authoredSystems[0].manifold,
        authoredSystems[0].manifold);
});

test("cumulonimbus requires convection and instability", () => {
    const storm = createLayer({
        genus: "cumulonimbus",
        oktas: 4,
        convection: 0.95,
    });
    const result = constrainScene(
        scene([storm, { ...EMPTY_LAYER }, { ...EMPTY_LAYER }], {
            convection: 0.9,
            instability: 0.2,
        }),
    );
    assert.equal(result.layers[0].genus, "cumulus");
    assert.equal(result.layers[0].anvilAmount, 0);
});

test("deep convection may span ordinary altitude tiers", () => {
    const storm = createLayer({
        genus: "cumulonimbus",
        oktas: 4,
        convection: 1,
        baseAltitude: 900,
        thickness: 12_000,
    });
    const middle = createLayer({
        genus: "altocumulus",
        oktas: 2,
        baseAltitude: 4_200,
        thickness: 900,
    });
    const result = constrainScene(
        scene([storm, middle, { ...EMPTY_LAYER }], {
            convection: 1,
            instability: 1,
        }),
    );
    assert.equal(result.layers[1].baseAltitude, 4_200);
});

test("thin clouds cannot produce precipitation", () => {
    const layer = createLayer({
        genus: "altostratus",
        oktas: 7,
        opticalDepth: 0.2,
        precipitation: 1,
    });
    const result = constrainScene(
        scene([{ ...EMPTY_LAYER }, layer, { ...EMPTY_LAYER }]),
    );
    assert.equal(result.layers[1].precipitation, 0);
});

test("high cloud remains ice dominated", () => {
    const layer = createLayer({
        genus: "cirrus",
        oktas: 3,
        iceFraction: 0.1,
    });
    const result = constrainScene(
        scene([{ ...EMPTY_LAYER }, { ...EMPTY_LAYER }, layer]),
    );
    assert.ok(result.layers[2].iceFraction >= 0.9);
});

test("every WMO genus produces bounded physical layer state", () => {
    for (const genus of CLOUD_GENERA) {
        const layer = createLayer({ genus, oktas: genus === "clear" ? 0 : 5 });
        if (genus === "clear") {
            assert.equal(layer.present, false);
            continue;
        }
        assert.equal(layer.genus, genus);
        assert.equal(layer.present, true);
        assert.ok(layer.baseAltitude >= 0);
        assert.ok(layer.thickness > 0);
        assert.equal(layer.coverage, 5 / 8);
        assert.ok(layer.opticalDepth >= 0 && layer.opticalDepth <= 1);
        assert.ok(layer.iceFraction >= 0 && layer.iceFraction <= 1);
        assert.ok(["low", "middle", "high"].includes(CLOUD_GENUS_LEVEL[genus]));
    }
});

test("stratiform decks cannot retain convective towers or anvils", () => {
    const stratus = {
        ...createLayer({ genus: "stratus", oktas: 7 }),
        towerAmount: 1,
        anvilAmount: 1,
    };
    const result = constrainScene(scene([stratus, { ...EMPTY_LAYER }, { ...EMPTY_LAYER }]));
    assert.equal(result.layers[0].towerAmount, 0);
    assert.equal(result.layers[0].anvilAmount, 0);
});

test("separate layers cannot move as a rigid duplicated sheet", () => {
    const low = createLayer({ genus: "stratocumulus", oktas: 4, windSpeed: 8, windDirection: 1 });
    const middle = createLayer({ genus: "altocumulus", oktas: 4, windSpeed: 8, windDirection: 1 });
    const high = createLayer({ genus: "cirrus", oktas: 2, windSpeed: 8, windDirection: 1 });
    const result = constrainScene(scene([low, middle, high]));
    assert.ok(result.layers[1].windSpeed > result.layers[0].windSpeed);
    assert.ok(result.layers[2].windSpeed > result.layers[1].windSpeed);
    assert.notEqual(result.layers[1].windDirection, result.layers[0].windDirection);
    assert.notEqual(result.layers[2].windDirection, result.layers[1].windDirection);
});

test("nimbostratus owns the lower rain deck without hiding high ice", () => {
    const low = createLayer({ genus: "stratus", oktas: 6 });
    const rain = createLayer({ genus: "nimbostratus", oktas: 8, opticalDepth: 1 });
    const high = createLayer({ genus: "cirrostratus", oktas: 3 });
    const result = constrainScene(scene([low, rain, high]));
    assert.equal(result.layers[0].present, false);
    assert.equal(result.layers[1].present, true);
    assert.equal(result.layers[2].present, true);
});

test("nimbostratus preserves a physically separate fractus or pannus underdeck", () => {
    const fractus = createLayer({
        genus: "stratus",
        species: "stratus-fractus",
        oktas: 4,
        baseAltitude: 150,
        thickness: 300,
    });
    const rain = createLayer({
        genus: "nimbostratus",
        species: "nimbostratus-praecipitatio",
        oktas: 8,
        opticalDepth: 1,
        baseAltitude: 800,
        thickness: 4_700,
    });
    const result = constrainScene(scene([
        fractus,
        rain,
        { ...EMPTY_LAYER },
    ]));
    assert.equal(result.layers[0].present, true);
    assert.equal(result.layers[0].species, "stratus-fractus");
    assert.ok(
        result.layers[0].baseAltitude + result.layers[0].thickness <
            result.layers[1].baseAltitude,
    );
});

test("nimbostratus preserves an explicitly classified pannus accessory", () => {
    const low = createLayer({ genus: "stratus", oktas: 5 });
    const rain = createLayer({ genus: "nimbostratus", oktas: 8, opticalDepth: 1 });
    const input = scene([low, rain, { ...EMPTY_LAYER }]);
    input.classifications = [{
        layerIndex: 1,
        systemIndex: 0,
        classification: {
            genus: "nimbostratus",
            species: null,
            varieties: [],
            supplementaryFeatures: ["praecipitatio"],
            accessoryClouds: ["pannus"],
            origin: { kind: "natural" },
        },
    }];
    const result = constrainScene(input);
    assert.equal(result.layers[0].present, true);
});

test("ordinary layers are separated vertically after constraints", () => {
    const low = createLayer({
        genus: "stratocumulus",
        oktas: 5,
        baseAltitude: 800,
        thickness: 1_200,
    });
    const middle = createLayer({
        genus: "altocumulus",
        oktas: 4,
        baseAltitude: 1_500,
        thickness: 900,
    });
    const high = createLayer({
        genus: "cirrus",
        oktas: 2,
        baseAltitude: 2_100,
        thickness: 700,
    });
    const result = constrainScene(scene([low, middle, high]));
    assert.ok(result.layers[1].baseAltitude >= 2_250);
    assert.ok(
        result.layers[2].baseAltitude >=
            result.layers[1].baseAltitude + result.layers[1].thickness + 400,
    );
});

test("low non-convective cloud cannot become ice dominated", () => {
    const layer = createLayer({
        genus: "stratus",
        oktas: 7,
        iceFraction: 1,
    });
    const result = constrainScene(scene([layer, { ...EMPTY_LAYER }, { ...EMPTY_LAYER }]));
    assert.ok(result.layers[0].iceFraction <= 0.15);
});

test("daily scene generation is deterministic for identical inputs", () => {
    const request = {
        random: Array.from({ length: 24 }, (_, index) => ((index * 37) % 101) / 100),
        regime: "soft",
        density: 1.4,
        latitude: 42,
        season: 0.72,
        humidity: 0.68,
        solarDepression: 9,
    };
    assert.deepEqual(createDailyCloudScene(request), createDailyCloudScene(request));
});

test("noctilucent displays require latitude, season, and solar depression", () => {
    const random = Array(24).fill(1);
    const base = {
        random,
        regime: "crystal",
        density: 0,
        season: 0.9,
        humidity: 0.3,
        solarDepression: 10,
    };
    assert.ok(createDailyCloudScene({ ...base, latitude: 60 }).noctilucent > 0);
    assert.equal(createDailyCloudScene({ ...base, latitude: 35 }).noctilucent, 0);
    assert.equal(
        createDailyCloudScene({ ...base, latitude: 60, season: 0.3 }).noctilucent,
        0,
    );
    assert.equal(
        createDailyCloudScene({ ...base, latitude: 60, solarDepression: 2 }).noctilucent,
        0,
    );
});

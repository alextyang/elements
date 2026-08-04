import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const modules = new Map();
const compileCommonJs = (input) => {
    let url = input instanceof URL ? input : new URL(input, import.meta.url);
    if (!extname(fileURLToPath(url))) url = new URL(`${url.href}.ts`);
    if (modules.has(url.href)) return modules.get(url.href).exports;
    const source = readFileSync(url, "utf8");
    const javascript = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: fileURLToPath(url),
    }).outputText;
    const moduleObject = { exports: {} };
    modules.set(url.href, moduleObject);
    new Function("exports", "module", "require", javascript)(
        moduleObject.exports,
        moduleObject,
        (specifier) => {
            if (!specifier.startsWith(".")) {
                throw new Error(`Unexpected import ${specifier}`);
            }
            return compileCommonJs(new URL(specifier, url));
        },
    );
    return moduleObject.exports;
};

const abi = compileCommonJs(
    "../components/backgrounds/sky/cloud-source-lineage-abi.ts",
);
const wgsl = compileCommonJs(
    "../components/backgrounds/sky/cloud-source-lineage-wgsl.ts",
);
const matrix = compileCommonJs(
    "../components/backgrounds/sky/weather-qualification-matrix.ts",
);
const runtimeModule = compileCommonJs(
    "../components/backgrounds/sky/cloud-system-runtime.ts",
);
const specialSources = compileCommonJs(
    "../components/backgrounds/sky/cloud-special-origin-source.ts",
);

const near = (actual, expected, tolerance = 1e-6, label = "value") =>
    assert.ok(Math.abs(actual - expected) <= tolerance,
        `${label}: ${actual} != ${expected} within ${tolerance}`);

const resolvedFor = (targetId) => {
    const qualificationCase = matrix.iterateWeatherQualificationCases(
        new Set([targetId]),
    ).next().value;
    assert.ok(qualificationCase, `missing qualification target ${targetId}`);
    return matrix.resolveWeatherQualificationCase(qualificationCase);
};

const runtimeFor = (targetId) => {
    const resolved = resolvedFor(targetId);
    const runtime = runtimeModule.createCloudSystemRuntime(resolved.cloudScene);
    assert.deepEqual(runtime.diagnostics, [], targetId);
    return { resolved, runtime };
};

const packFor = (targetId, capacity) => {
    const { resolved, runtime } = runtimeFor(targetId);
    return {
        scene: resolved.cloudScene,
        runtime,
        packed: abi.packCloudSourceLineageRecords(
            resolved.cloudScene,
            runtime.systems,
            capacity,
        ),
    };
};

test("source/lineage uniform is 256-byte aligned and strictly bounded", () => {
    assert.equal(abi.CLOUD_SOURCE_LINEAGE_VEC4_STRIDE, 16);
    assert.equal(abi.CLOUD_SOURCE_LINEAGE_HEADER_VEC4S, 16);
    assert.equal(abi.CLOUD_SOURCE_LINEAGE_RECORD_BYTES, 256);
    assert.equal(abi.CLOUD_SOURCE_LINEAGE_HEADER_VEC4S * 16, 256);
    assert.equal(abi.CLOUD_SOURCE_LINEAGE_BUFFER_BYTES, 9_472);
    assert.ok(abi.CLOUD_SOURCE_LINEAGE_BUFFER_BYTES < 10 * 1_024);
    assert.ok(abi.CLOUD_SOURCE_LINEAGE_BUFFER_BYTES <=
        wgsl.CLOUD_SOURCE_LINEAGE_BASELINE_UNIFORM_LIMIT_BYTES);
    assert.equal(wgsl.CLOUD_SOURCE_LINEAGE_BASELINE_UNIFORM_LIMIT_BYTES, 65_536);

    const { packed } = packFor("origin-cumulus-flammagenitus");
    assert.equal(packed.data.byteLength, abi.CLOUD_SOURCE_LINEAGE_BUFFER_BYTES);
    assert.equal((abi.CLOUD_SOURCE_LINEAGE_HEADER_VEC4S * 16) % 256, 0);
    for (let index = 0; index < packed.capacity; index += 1) {
        assert.equal((256 + index * abi.CLOUD_SOURCE_LINEAGE_RECORD_BYTES) % 256, 0);
    }
    assert.deepEqual([...packed.data.slice(0, 4)], [
        abi.CLOUD_SOURCE_LINEAGE_SCHEMA,
        packed.count,
        abi.CLOUD_SOURCE_LINEAGE_VEC4_STRIDE,
        packed.capacity,
    ]);
    assert.equal(packed.data[8], 0);
    [0.68, 0.55, 0.44].forEach((wavelength, channel) =>
        near(packed.data[9 + channel], wavelength, 1e-7,
            `wavelength ${channel}`));
    const first = packed.records[0];
    for (const [name, vectorIndex] of Object.entries(
        abi.CLOUD_SOURCE_LINEAGE_VEC4_LAYOUT,
    )) {
        const packedOffset = abi.CLOUD_SOURCE_LINEAGE_HEADER_VEC4S * 4 +
            vectorIndex * 4;
        first[name].forEach((value, lane) => assert.equal(
            packed.data[packedOffset + lane], Math.fround(value),
            `${name}.${lane} byte-layout parity`,
        ));
    }
});

test("curated genitus and mutatus pairs retain exact owner lineage", () => {
    const anvil = packFor("multilayer-convective-anvil");
    assert.deepEqual(anvil.packed.diagnostics, []);
    assert.equal(anvil.packed.sourceRecordCount, 0);
    assert.equal(anvil.packed.relationRecordCount, 1);
    const genitus = anvil.packed.records[0];
    assert.equal(genitus.identity[2], abi.CLOUD_SOURCE_LINEAGE_EVENT_CODE.genitus);
    assert.equal(genitus.identity[3], abi.CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.line);
    assert.equal(genitus.classification[2],
        abi.CLOUD_SOURCE_LINEAGE_RELATION_CODE.genitus);
    assert.ok(genitus.ownership[2] >= 0 && genitus.ownership[3] >= 0);
    assert.notEqual(genitus.ownership[2], genitus.ownership[3]);
    assert.deepEqual(genitus.ownerWeights.slice(0, 3), [1, 1, 1]);
    assert.ok(genitus.lineage[1] > 0 && genitus.lineage[2] > 0);

    const warmFront = packFor("multilayer-warm-front");
    assert.deepEqual(warmFront.packed.diagnostics, []);
    assert.equal(warmFront.packed.relationRecordCount, 1);
    const mutatus = warmFront.packed.records[0];
    assert.equal(mutatus.identity[2], abi.CLOUD_SOURCE_LINEAGE_EVENT_CODE.mutatus);
    assert.equal(mutatus.identity[3], abi.CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.area);
    near(mutatus.timingAndTransition[3], 0.56, 1e-12, "transition progress");
    near(mutatus.ownerWeights[0] + mutatus.ownerWeights[1], 1, 1e-12,
        "mutatus density partition");
    assert.equal(mutatus.ownerWeights[2], 2);
});

test("all special origins pack finite point, line, and area manifolds", () => {
    const geometries = new Set();
    const designations = new Set();
    let recordCount = 0;
    const targets = matrix.WEATHER_QUALIFICATION_TARGETS.filter(
        (target) => target.axis === "special-origin",
    );
    for (const target of targets) {
        const { packed } = packFor(target.id);
        assert.deepEqual(packed.diagnostics, [], target.id);
        assert.ok(packed.sourceRecordCount > 0, target.id);
        for (const record of packed.records) {
            recordCount += 1;
            geometries.add(record.identity[3]);
            designations.add(record.classification[0]);
            assert.ok(record.identity[3] >= 1 && record.identity[3] <= 3);
            assert.ok(record.classification[1] >= 1 && record.classification[1] <= 8);
            assert.ok(record.centerAndAge.every(Number.isFinite));
            assert.ok(record.emission.every(Number.isFinite));
            assert.ok(record.thermodynamics.every(Number.isFinite));
            near(record.timingAndTransition[0] + record.centerAndAge[3], 0,
                1e-3, `${target.id} birth + age`);
        }
    }
    assert.ok(recordCount > targets.length);
    assert.deepEqual([...geometries].sort(), [1, 2, 3]);
    assert.deepEqual([...designations].sort(), [1, 2, 3, 4, 5]);
});

test("source catalog covers every emitter and conserves RGB aerosol optics", () => {
    const kinds = new Map();
    const recipes = [
        ["flammagenitus", "cumulus"],
        ["homogenitus", "cumulus"],
        ["homogenitus", "cirrus"],
        ["homomutatus", "cirrus"],
        ["homomutatus", "cirrocumulus"],
        ["homomutatus", "cirrostratus"],
        ["cataractagenitus", "stratus"],
        ["silvagenitus", "stratus"],
    ];
    for (const [designation, genus] of recipes) {
        for (let seed = 0; seed < 1_024; seed += 1) {
            const source = specialSources.createCloudSpecialOriginSource({
                id: `${designation}-${genus}-${seed}`,
                designation,
                genus,
                deterministicSeed: seed,
            });
            kinds.set(source.kind, source);
        }
    }
    assert.deepEqual([...kinds.keys()].sort(), [
        "aircraft-aerodynamic-line", "aircraft-exhaust-line",
        "forest-evapotranspiration", "industrial-thermal",
        "persistent-contrail-field", "volcanic-convection",
        "waterfall-spray", "wildfire-convection",
    ]);
    assert.deepEqual(new Set([...kinds.values()].map((source) =>
        source.geometry.kind)), new Set(["point", "line", "area"]));

    for (const source of kinds.values()) {
        assert.deepEqual(specialSources.validateCloudSpecialOriginSource(source), []);
        const optics = abi.evaluateCloudSourceAerosolOptics(source);
        const composition = source.composition;
        near(composition.waterFraction + composition.iceFraction +
            composition.aerosolFraction, 1, 1e-12, `${source.kind} composition`);
        for (let channel = 0; channel < 3; channel += 1) {
            near(optics.extinctionRgbPerKm[channel],
                optics.absorptionRgbPerKm[channel] +
                    optics.scatteringRgbPerKm[channel],
                1e-12, `${source.kind} channel ${channel}`);
            assert.ok(optics.singleScatteringAlbedoRgb[channel] >= 0 &&
                optics.singleScatteringAlbedoRgb[channel] <= 1);
        }
    }
    const smoke = abi.evaluateCloudSourceAerosolOptics(
        kinds.get("wildfire-convection"),
    );
    assert.ok(smoke.extinctionRgbPerKm[2] > smoke.extinctionRgbPerKm[0]);
    assert.ok(smoke.absorptionRgbPerKm[2] > smoke.absorptionRgbPerKm[0]);
    near(kinds.get("volcanic-convection").composition.aerosolAngstromExponent,
        0.5, 1e-12, "coarse ash Angstrom exponent");
});

test("one physical source is allocated exactly once across all child owners", () => {
    const { packed } = packFor("origin-cumulus-flammagenitus");
    assert.ok(packed.sourceRecordCount > 1);
    const allocations = packed.records.map((record) => record.ownerWeights[3]);
    near(allocations.reduce((sum, value) => sum + value, 0), 1, 1e-12,
        "source allocation");
    const referenceExtinction = packed.records[0].aerosolExtinction.slice(0, 3);
    const sampledExtinction = [0, 0, 0];
    for (const record of packed.records) {
        const age = record.centerAndAge[3];
        const center = [
            record.centerAndAge[0] + record.advection[0] * age / 1_000,
            record.centerAndAge[1],
            record.centerAndAge[2] + record.advection[2] * age / 1_000,
        ];
        const sample = abi.sampleCloudSourceLineageRecord(record, center, 0);
        for (let channel = 0; channel < 3; channel += 1) {
            sampledExtinction[channel] += sample.aerosolExtinctionRgbPerKm[channel];
        }
    }
    referenceExtinction.forEach((value, channel) => near(
        sampledExtinction[channel], value, 1e-6,
        `allocated source extinction channel ${channel}`,
    ));
});

const referenceSupport = (record, position, secondsFromSnapshot) => {
    const event = Math.round(record.identity[2]);
    const source = event === abi.CLOUD_SOURCE_LINEAGE_EVENT_CODE.specialOrigin;
    const relativeTime = Math.max(0, secondsFromSnapshot);
    const age = Math.max(0, record.centerAndAge[3] + relativeTime);
    const centerTime = source ? age : relativeTime;
    const east = record.centerAndAge[0] + record.advection[0] * centerTime / 1_000;
    const north = record.centerAndAge[2] + record.advection[2] * centerTime / 1_000;
    const de = position[0] - east;
    const da = position[1] - record.centerAndAge[1];
    const dn = position[2] - north;
    const along = de * record.axisAndExtent[0] + dn * record.axisAndExtent[1];
    const cross = -de * record.axisAndExtent[1] + dn * record.axisAndExtent[0];
    const major = Math.max(0.02, record.axisAndExtent[2]);
    const minor = Math.max(0.02, record.axisAndExtent[3]);
    const vertical = Math.max(0.02, record.support[0]);
    const radius = Math.round(record.identity[3]) ===
        abi.CLOUD_SOURCE_LINEAGE_GEOMETRY_CODE.line
        ? Math.hypot(Math.max(0, Math.abs(along) - major) / minor,
            cross / minor, da / vertical)
        : Math.hypot(along / major, cross / minor, da / vertical);
    const compact = radius >= 1 ? 0 : (1 - Math.max(0, radius)) ** 4 *
        (1 + 4 * Math.max(0, radius));
    const remaining = Math.max(0, Math.min(1,
        1 - age / Math.max(1, record.timingAndTransition[1])));
    const lifecycle = source ? Math.max(0, Math.min(1, remaining / 0.15)) : 1;
    const allocation = source ? Math.max(0, Math.min(1,
        record.ownerWeights[3])) : 1;
    return compact * lifecycle * allocation;
};

test("CPU decoder matches the binding-free WGSL support and density contract", () => {
    const cases = [
        packFor("origin-stratus-cataractagenitus").packed.records[0],
        packFor("origin-cirrus-homogenitus").packed.records[0],
        packFor("origin-cumulus-flammagenitus").packed.records[0],
        packFor("multilayer-convective-anvil").packed.records[0],
        packFor("multilayer-warm-front").packed.records[0],
    ];
    for (const record of cases) {
        const positions = [
            record.centerAndAge.slice(0, 3),
            [record.centerAndAge[0] + record.axisAndExtent[2] * 0.37,
                record.centerAndAge[1] + record.support[0] * 0.11,
                record.centerAndAge[2] + record.axisAndExtent[3] * 0.19],
            [record.centerAndAge[0] + record.axisAndExtent[2] * 2.2,
                record.centerAndAge[1], record.centerAndAge[2]],
        ];
        for (const seconds of [0, 31.25]) {
            for (const position of positions) {
                const actual = abi.sampleCloudSourceLineageRecord(
                    record, position, seconds,
                );
                near(actual.supportWeight,
                    referenceSupport(record, position, seconds), 1e-12,
                    "CPU/WGSL support parity");
                actual.aerosolExtinctionRgbPerKm.forEach((extinction, channel) =>
                    near(extinction,
                        record.aerosolExtinction[channel] * actual.supportWeight,
                        1e-12, `extinction parity ${channel}`));
            }
        }
    }

    const genitus = abi.sampleCloudSourceLineageRecord(cases[3],
        cases[3].centerAndAge.slice(0, 3), 0);
    near(abi.resolveCloudSourceLineageDensity(0.9, 0.72, 0.44, genitus),
        0.72, 1e-12, "genitus compact union");
    const mutatus = abi.sampleCloudSourceLineageRecord(cases[4],
        cases[4].centerAndAge.slice(0, 3), 0);
    near(abi.resolveCloudSourceLineageDensity(0.9, 0.72, 0.44, mutatus),
        0.72 * 0.44 + 0.44 * 0.56, 1e-12, "mutatus partition");

    assert.doesNotMatch(wgsl.CLOUD_SOURCE_LINEAGE_WGSL, /@group|@binding/);
    const recordStruct = wgsl.CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL.match(
        /struct CloudSourceLineageRecord \{([\s\S]*?)\};/,
    )[1];
    assert.equal([...recordStruct.matchAll(/: vec4<f32>/g)].length, 16);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL,
        /header: array<vec4<f32>, 16>/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL,
        /records: array<CloudSourceLineageRecord, 36>/);
    assert.doesNotMatch(wgsl.CLOUD_SOURCE_LINEAGE_UNIFORM_WGSL,
        /records: array<CloudSourceLineageRecord>\s*,?\s*;/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /const CLOUD_SL_MAX_RECORDS: u32 = 36u/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /header_0\.w <= f32\(CLOUD_SL_MAX_RECORDS\)/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /return min\(\s*CLOUD_SL_MAX_RECORDS,/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /fn cloud_sl_wendland_c2/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /fn cloud_sl_resolve_owner_density/);
    assert.match(wgsl.CLOUD_SOURCE_LINEAGE_EVALUATOR_WGSL,
        /fn cloud_sl_conservative_support_interval/);
    assert.equal((wgsl.CLOUD_SOURCE_LINEAGE_WGSL.match(/\{/g) ?? []).length,
        (wgsl.CLOUD_SOURCE_LINEAGE_WGSL.match(/\}/g) ?? []).length);
});

test("source/lineage binding helper emits only a baseline-safe uniform", () => {
    const declaration = wgsl.createCloudSourceLineageUniformDeclaration(
        0, 35,
    );
    assert.match(declaration, /@group\(0\) @binding\(35\)/);
    assert.match(declaration,
        /var<uniform> cloud_source_lineage: CloudSourceLineageUniform;/);
    assert.doesNotMatch(declaration, /var<storage/);
    assert.doesNotMatch(wgsl.CLOUD_SOURCE_LINEAGE_WGSL,
        /var<(?:storage|uniform)>/);

    const clamped = wgsl.createCloudSourceLineageUniformDeclaration(
        -4.2, -7.9, "lineage_test",
    );
    assert.match(clamped, /@group\(0\) @binding\(0\)/);
    assert.match(clamped,
        /var<uniform> lineage_test: CloudSourceLineageUniform;/);
});

test("packing and scene signatures are deterministic and source-complete", () => {
    const { resolved, runtime } = runtimeFor("origin-cumulus-flammagenitus");
    const scene = resolved.cloudScene;
    const first = abi.packCloudSourceLineageRecords(scene, runtime.systems);
    const second = abi.packCloudSourceLineageRecords(
        structuredClone(scene), structuredClone(runtime.systems),
    );
    assert.deepEqual([...first.data], [...second.data]);
    assert.deepEqual(first.records, second.records);
    const baseline = runtimeModule.cloudSystemSceneSignature(scene);
    const changedBirth = structuredClone(scene);
    changedBirth.specialOriginSources[0].birthTimeSeconds -= 1;
    assert.notEqual(runtimeModule.cloudSystemSceneSignature(changedBirth), baseline);
    const changedAbsorption = structuredClone(scene);
    changedAbsorption.specialOriginSources[0]
        .composition.aerosolSingleScatteringAlbedoRgb[2] -= 0.01;
    assert.notEqual(runtimeModule.cloudSystemSceneSignature(changedAbsorption), baseline);

    const timestamped = abi.packCloudSourceLineageRecords(
        scene, runtime.systems, abi.CLOUD_SOURCE_LINEAGE_MAX_RECORDS, 123.25,
    );
    assert.equal(timestamped.snapshotTimeSeconds, 123.25);
    assert.equal(timestamped.data[8], 123.25);
});

test("conservative ray scheduling contains exact compact support", () => {
    const record = packFor("origin-stratus-cataractagenitus").packed.records[0];
    const planetRadius = 6_371;
    const age = record.centerAndAge[3];
    const center = [
        record.centerAndAge[0] + record.advection[0] * age / 1_000,
        planetRadius + record.centerAndAge[1],
        record.centerAndAge[2] + record.advection[2] * age / 1_000,
    ];
    const origin = [0, planetRadius, 0];
    const delta = center.map((value, index) => value - origin[index]);
    const distance = Math.hypot(...delta);
    const direction = delta.map((value) => value / distance);
    const interval = abi.intersectCloudSourceLineageSupport(
        record, origin, direction, 0, planetRadius, 400,
    );
    assert.equal(interval.valid, true);
    assert.ok(interval.nearKm < distance && interval.farKm > distance);
    const exact = abi.sampleCloudSourceLineageRecord(record,
        [center[0], center[1] - planetRadius, center[2]], 0);
    assert.ok(exact.supportWeight > 0);

    const miss = abi.intersectCloudSourceLineageSupport(
        record, origin, direction.map((value) => -value),
        0, planetRadius, 400,
    );
    assert.equal(miss.valid, false);

    const expired = structuredClone(record);
    expired.centerAndAge[3] = expired.timingAndTransition[1];
    assert.equal(abi.intersectCloudSourceLineageSupport(
        expired, origin, direction, 0, planetRadius, 400,
    ).valid, false);
});

test("capacity overflow is explicit and header counts remain coherent", () => {
    const { resolved, runtime } = runtimeFor("origin-cumulus-flammagenitus");
    const scene = resolved.cloudScene;
    const packed = abi.packCloudSourceLineageRecords(scene, runtime.systems, 1);
    assert.equal(packed.capacity, 1);
    assert.equal(packed.count, 1);
    assert.ok(packed.dropped > 0);
    assert.equal(packed.data.byteLength, 512);
    assert.equal(packed.records[0].ownerWeights[3], 1,
        "the retained source remains a complete transport event");
    assert.deepEqual([...packed.data.slice(0, 8)], [
        abi.CLOUD_SOURCE_LINEAGE_SCHEMA, 1,
        abi.CLOUD_SOURCE_LINEAGE_VEC4_STRIDE, 1,
        packed.dropped, packed.sourceRecordCount,
        packed.relationRecordCount, packed.diagnostics.length,
    ]);
});

test("invalid source states never enter the transport record set", () => {
    const { resolved, runtime } = runtimeFor("origin-cumulus-flammagenitus");
    const scene = resolved.cloudScene;
    const corruptions = [
        (copy) => { copy.specialOriginSources[0].composition.waterFraction += 0.2; },
        (copy) => { copy.specialOriginSources[0]
            .composition.aerosolSingleScatteringAlbedoRgb[0] = Number.NaN; },
        (copy) => { copy.specialOriginSources[0].birthTimeSeconds -= 4; },
    ];
    for (const corrupt of corruptions) {
        const invalid = structuredClone(scene);
        corrupt(invalid);
        const packed = abi.packCloudSourceLineageRecords(invalid, runtime.systems);
        assert.equal(packed.sourceRecordCount, 0);
        assert.ok(packed.diagnostics.some((diagnostic) =>
            diagnostic.startsWith("source:")));
    }

    const duplicateSource = structuredClone(scene);
    duplicateSource.specialOriginSources.push(
        structuredClone(duplicateSource.specialOriginSources[0]),
    );
    assert.ok(abi.packCloudSourceLineageRecords(
        duplicateSource, runtime.systems,
    ).diagnostics.some((diagnostic) => diagnostic.includes("duplicate-source-id")));

    const duplicateOwner = structuredClone(runtime.systems);
    duplicateOwner.push(structuredClone(duplicateOwner[0]));
    assert.ok(abi.packCloudSourceLineageRecords(scene, duplicateOwner)
        .diagnostics.some((diagnostic) => diagnostic.includes("duplicate-owner-id")));

    const badSnapshot = abi.packCloudSourceLineageRecords(
        scene, runtime.systems, abi.CLOUD_SOURCE_LINEAGE_MAX_RECORDS, Number.NaN,
    );
    assert.equal(badSnapshot.snapshotTimeSeconds, 0);
    assert.ok(badSnapshot.diagnostics.includes("header:non-finite-snapshot-time"));
    const badCapacity = abi.packCloudSourceLineageRecords(
        scene, runtime.systems, Number.NaN,
    );
    assert.equal(badCapacity.capacity, abi.CLOUD_SOURCE_LINEAGE_MAX_RECORDS);
    assert.ok(badCapacity.diagnostics.includes("header:non-finite-capacity"));
});

test("invalid ownership, transitions, and cyclic lineages are rejected", () => {
    const anvil = runtimeFor("multilayer-convective-anvil");
    const brokenOwners = structuredClone(anvil.runtime.systems);
    const daughter = brokenOwners.find((owner) =>
        owner.morphologyAssignment?.relation === "genitus");
    daughter.familyProduction.causalOrigin.parentSystemId = "absent-owner";
    let packed = abi.packCloudSourceLineageRecords(
        anvil.resolved.cloudScene, brokenOwners,
    );
    assert.equal(packed.relationRecordCount, 0);
    assert.ok(packed.diagnostics.some((diagnostic) =>
        diagnostic.includes("invalid-parent-owner-index")));

    const front = runtimeFor("multilayer-warm-front");
    const invalidTransition = structuredClone(front.runtime.systems);
    invalidTransition.find((owner) =>
        owner.morphologyAssignment?.relation === "mutatus")
        .familyProduction.causalOrigin.transitionProgress = 0;
    packed = abi.packCloudSourceLineageRecords(
        front.resolved.cloudScene, invalidTransition,
    );
    assert.equal(packed.relationRecordCount, 0);
    assert.ok(packed.diagnostics.some((diagnostic) =>
        diagnostic.includes("invalid-lineage-transition")));

    const cyclic = structuredClone(anvil.runtime.systems);
    const cyclicChildIndex = cyclic.findIndex((owner) =>
        owner.morphologyAssignment?.relation === "genitus");
    const cyclicChild = cyclic[cyclicChildIndex];
    const cyclicParentIndex = cyclic.findIndex((owner) =>
        owner.state.id === cyclicChild.familyProduction.causalOrigin.parentSystemId);
    const cyclicParent = cyclic[cyclicParentIndex];
    cyclicChild.state.classification = {
        ...cyclicChild.state.classification,
        genus: "cumulus",
        origin: { kind: "genitus", motherGenus: "stratocumulus" },
    };
    cyclicChild.familyProduction.causalOrigin = {
        ...cyclicChild.familyProduction.causalOrigin,
        motherGenus: "stratocumulus",
    };
    cyclicParent.state.classification = {
        ...cyclicParent.state.classification,
        genus: "stratocumulus",
        origin: { kind: "genitus", motherGenus: "cumulus" },
    };
    cyclicParent.morphologyAssignment = {
        ...structuredClone(cyclicChild.morphologyAssignment),
        relation: "genitus",
        causalParent: {
            layerIndex: cyclicChild.layerIndex,
            systemIndex: cyclicChild.systemIndex,
            systemId: cyclicChild.state.id,
        },
    };
    cyclicParent.familyProduction = {
        ...(cyclicParent.familyProduction ?? cyclicChild.familyProduction),
        causalOrigin: {
            ...structuredClone(cyclicChild.familyProduction.causalOrigin),
            relation: "genitus",
            motherGenus: "cumulus",
            parentSystemId: cyclicChild.state.id,
            childSystemId: cyclicParent.state.id,
        },
    };
    packed = abi.packCloudSourceLineageRecords(anvil.resolved.cloudScene, cyclic);
    assert.equal(packed.relationRecordCount, 0);
    assert.ok(packed.diagnostics.some((diagnostic) =>
        diagnostic.startsWith("lineage:cycle:")));
});

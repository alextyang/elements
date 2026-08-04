import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const transpiled = new Map();

const loadTypeScriptModule = async (modulePath) => {
    const resolved = path.resolve(modulePath);
    if (transpiled.has(resolved)) return transpiled.get(resolved).exports;
    const source = await readFile(resolved, "utf8");
    const compiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
        },
        fileName: resolved,
    });
    const module = { exports: {} };
    transpiled.set(resolved, module);
    const requests = [...compiled.outputText.matchAll(/require\("(\.[^"]+)"\)/g)]
        .map((match) => match[1]);
    const dependencies = new Map();
    for (const request of requests) {
        const candidate = path.resolve(path.dirname(resolved), request);
        dependencies.set(request, await loadTypeScriptModule(
            path.extname(candidate) ? candidate : `${candidate}.ts`,
        ));
    }
    new Function("exports", "require", "module", compiled.outputText)(
        module.exports,
        (request) => dependencies.has(request)
            ? dependencies.get(request)
            : require(request),
        module,
    );
    return module.exports;
};

const runtime = await loadTypeScriptModule(new URL(
    "../components/backgrounds/sky/cloud-light-volume-runtime.ts",
    import.meta.url,
).pathname);
const lightVolume = await loadTypeScriptModule(new URL(
    "../components/backgrounds/sky/cloud-light-volume.ts",
    import.meta.url,
).pathname);

const system = (overrides = {}) => ({
    state: {
        classification: { genus: "cirrus", species: "fibratus" },
    },
    compiled: { recipeId: "cirrus-fibratus" },
    topologyExemplar: { connectivity: "fragmented-population" },
    ...overrides,
});

const volume = (overrides = {}) => ({
    classification: { genus: "cirrus", species: "fibratus" },
    formation: {
        mechanism: "sheared-ice-sedimentation",
        topologyPolicy: "fragmented-population",
    },
    ...overrides,
});

const morphology = (owners = [0, 1]) => ({
    ownerRanges: owners.map((ownerIndex) => ({
        ownerIndex, offset: 0, count: 0, dropped: 0,
    })),
    fibratusOwnerRanges: owners.map((ownerIndex) => ({
        ownerIndex, offset: ownerIndex * 7, count: 7, dropped: 0,
    })),
    fibratusDescriptors: owners.flatMap((ownerIndex) =>
        Array.from({ length: 7 }, (_, index) => ({ ownerIndex, index }))),
});

const qualify = (overrides = {}) =>
    runtime.qualifyCloudLightVolumePlainFibratusSourcePath({
        systems: [system(), system()],
        macroVolumesByOwner: new Map([[0, volume()], [1, volume()]]),
        morphology: morphology(),
        retainedBricks: [
            { ownerIndex: 1, samplingFlags: 0 },
            { ownerIndex: 0, samplingFlags: 0 },
            { ownerIndex: 1, samplingFlags: 0 },
        ],
        ...overrides,
    });

test("plain nonresident Ci fibratus owners qualify as one safe retained set", () => {
    const result = qualify();
    assert.equal(result.retainedOwnerCount, 2);
    assert.deepEqual(result.owners.map(({ ownerIndex }) => ownerIndex), [0, 1]);
    assert.deepEqual(result.eligibleOwnerIndices, [0, 1]);
    assert.equal(result.allRetainedOwnersSafe, true);
    assert.ok(result.owners.every(({ reasons }) => reasons.length === 0));
});

test("every semantic specialization gate fails closed", () => {
    const cases = [
        {
            reason: "not-ci-fibratus",
            overrides: { systems: [system({
                state: { classification: { genus: "cirrus", species: "uncinus" } },
            })] },
        },
        {
            reason: "formation-not-sheared-ice-sedimentation",
            overrides: { macroVolumesByOwner: new Map([[0, volume({
                formation: {
                    mechanism: "elevated-convective-ice",
                    topologyPolicy: "fragmented-population",
                },
            })]]) },
        },
        {
            reason: "topology-not-fragmented-population",
            overrides: { systems: [system({
                topologyExemplar: { connectivity: "single-connected" },
            })] },
        },
        {
            reason: "owner-medium-is-resident",
            overrides: {
                retainedBricks: [{
                    ownerIndex: 0,
                    samplingFlags: lightVolume
                        .CLOUD_LIGHT_VOLUME_BRICK_RESIDENT_SOURCE_MEDIUM_FLAG,
                }],
            },
        },
        {
            reason: "ordinary-morphology-range-not-empty",
            overrides: { morphology: {
                ...morphology([0]),
                ownerRanges: [{ ownerIndex: 0, offset: 0, count: 1, dropped: 0 }],
            } },
        },
        {
            reason: "fibratus-descriptor-count-out-of-range",
            overrides: { morphology: {
                ...morphology([0]),
                fibratusOwnerRanges: [
                    { ownerIndex: 0, offset: 0, count: 5, dropped: 0 },
                ],
            } },
        },
        {
            reason: "fibratus-descriptors-dropped",
            overrides: { morphology: {
                ...morphology([0]),
                fibratusOwnerRanges: [
                    { ownerIndex: 0, offset: 0, count: 7, dropped: 1 },
                ],
            } },
        },
    ];
    for (const { reason, overrides } of cases) {
        const result = qualify({
            retainedBricks: [{ ownerIndex: 0, samplingFlags: 0 }],
            systems: [system()],
            macroVolumesByOwner: new Map([[0, volume()]]),
            morphology: morphology([0]),
            ...overrides,
        });
        assert.equal(result.allRetainedOwnersSafe, false, reason);
        assert.ok(result.owners[0].reasons.includes(reason), reason);
    }
});

test("descriptor payload integrity and mixed-owner summaries remain conservative", () => {
    const packed = morphology();
    packed.fibratusDescriptors[7] = { ownerIndex: 0, index: 0 };
    const result = qualify({ morphology: packed });
    assert.equal(result.owners[0].eligible, true);
    assert.equal(result.owners[1].eligible, false);
    assert.ok(result.owners[1].reasons.includes(
        "fibratus-descriptor-owner-mismatch"));
    assert.deepEqual(result.eligibleOwnerIndices, [0]);
    assert.equal(result.allRetainedOwnersSafe, false);

    const invalidRange = qualify({
        retainedBricks: [{ ownerIndex: 0, samplingFlags: 0 }],
        systems: [system()],
        macroVolumesByOwner: new Map([[0, volume()]]),
        morphology: {
            ...morphology([0]),
            fibratusOwnerRanges: [
                { ownerIndex: 0, offset: 6, count: 7, dropped: 0 },
            ],
        },
    });
    assert.ok(invalidRange.owners[0].reasons.includes(
        "fibratus-descriptor-range-invalid"));
});

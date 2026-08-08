import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const root = new URL("../components/backgrounds/sky/", import.meta.url);
const adapterSource = readFileSync(new URL(
    "cloud-morphology-v2-feature-adapter.ts", root,
), "utf8");
const shippingSource = readFileSync(new URL(
    "cloud-shipping-production-runtime.ts", root,
), "utf8");
const worldSource = readFileSync(new URL("cloud-world-frame.ts", root), "utf8");

const temporaryRoot = mkdtempSync(join(tmpdir(), "cloud-shipping-v2-"));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));
const output = ts.transpileModule(adapterSource, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText;
writeFileSync(join(temporaryRoot, "adapter.mjs"), output);
const adapter = await import(new URL(`file://${join(temporaryRoot, "adapter.mjs")}`));

const system = (systemIndex = 0) => ({
    systemIndex,
    state: { id: `owner-${systemIndex}` },
});
const request = (overrides = {}) => ({
    parent: {
        ownerIndex: 0,
        centerKm: [10, 5, -2],
        halfExtentsKm: [4, 2, 6],
        axisU: [1, 0, 0],
        axisV: [0, 1, 0],
        axisW: [0, 0, 1],
    },
    classification: {
        genus: "cumulonimbus",
        species: "capillatus",
        varieties: ["lacunosus"],
        supplementaryFeatures: ["incus", "virga"],
        accessoryClouds: ["pileus"],
        origin: { kind: "special", designation: "flammagenitus" },
    },
    phase: "mixed",
    lifecycle: "glaciating",
    intensity: 0.8,
    ...overrides,
});

test("all orthogonal WMO semantics have explicit parent-owned V2 profiles", () => {
    for (const semantic of [
        "intortus", "vertebratus", "undulatus", "radiatus", "lacunosus",
        "duplicatus", "translucidus", "perlucidus", "opacus",
        "incus", "mamma", "virga", "praecipitatio", "arcus", "tuba",
        "asperitas", "fluctus", "cavum", "murus", "cauda",
        "pileus", "velum", "pannus", "flumen",
        "polar-stratospheric-sts", "polar-stratospheric-nat",
        "polar-stratospheric-ice", "nacreous", "noctilucent",
        "flammagenitus", "homogenitus", "homomutatus",
        "cataractagenitus", "silvagenitus",
    ]) assert.match(adapterSource, new RegExp(`\\b${semantic}\\b`), semantic);
    assert.doesNotMatch(adapterSource,
        /cameraRangeKm|horizontalFieldOfView|viewAzimuth|frameAzimuthBias/);
});

test("semantic migration preserves ownership, blend intent, material and precipitation source", () => {
    const migrated = adapter.adaptCloudMorphologyRequestToV2Features(
        request(),
        system(),
    );
    assert.equal(migrated.semanticComplete, true);
    assert.equal(migrated.operatorParityComplete, false);
    assert.equal(migrated.features.length, 5);
    const byKind = new Map(migrated.features.map((feature) => [
        feature.kind.split(":").at(-1), feature,
    ]));
    assert.equal(byKind.get("lacunosus").kind, "subtract:lacunosus");
    assert.equal(byKind.get("lacunosus").densityMultiplier, 0);
    assert.equal(byKind.get("incus").materialClass, "ice-cloud");
    assert.equal(byKind.get("virga").materialClass, "rain");
    assert.ok(byKind.get("virga").precipitationMultiplier > 0);
    assert.equal(byKind.get("pileus").parentOwnerId, "owner-0");
    assert.ok(byKind.get("pileus").attachmentKm.every(Number.isFinite));
    assert.equal(byKind.get("flammagenitus").materialClass,
        "aerosol-condensation");
});

test("unknown semantics fail closed instead of silently dropping a feature", () => {
    const migrated = adapter.adaptCloudMorphologyRequestToV2Features(request({
        classification: {
            ...request().classification,
            varieties: ["future-unmapped-variety"],
            supplementaryFeatures: [],
            accessoryClouds: [],
            origin: { kind: "natural" },
        },
    }), system());
    assert.equal(migrated.semanticComplete, false);
    assert.ok(migrated.issues.some(({ code }) =>
        code === "unsupported-semantic-feature"));
});

test("runtime migration returns a deterministic resolver for every owner", () => {
    const runtime = {
        systems: [system(0), system(1)],
        morphologyRequests: [request()],
    };
    const migrated = adapter.adaptCloudRuntimeMorphologyV2(runtime);
    assert.equal(migrated.owners.length, 2);
    assert.equal(migrated.expectedSemanticFeatures, 5);
    assert.equal(migrated.migratedSemanticFeatures, 5);
    assert.equal(migrated.featuresByOwner.get(1).length, 0);
    const resolver = adapter.createCloudMorphologyV2FeatureResolver(migrated);
    assert.equal(resolver(system(0), 0).length, 5);
    assert.equal(resolver(system(1), 1).length, 0);
});

test("the shipping boundary instantiates V2 frames without overstating operator parity", () => {
    assert.match(shippingSource, /compileCloudSystemRuntimeProductionV1/);
    assert.match(shippingSource, /featureResolver:\s*createCloudMorphologyV2FeatureResolver/);
    assert.match(shippingSource,
        /legacyFeaturesFullyMigrated:\s*\n\s*morphology\.operatorParityComplete/);
    assert.match(shippingSource, /ownerFeatureEventBuffersLive: true/);
    assert.match(shippingSource,
        /productionReady: bridge\.productionReady[\s\S]*morphology\.operatorParityComplete/);
    assert.doesNotMatch(shippingSource, /navigator\.gpu|requestAdapter|requestDevice/);
});

test("the actual camera-world runtime now carries the cached shipping V2 frame", () => {
    assert.match(worldSource, /CloudSystemRuntimeWithProductionV1/);
    assert.match(worldSource, /readonly productionV2:/);
    assert.match(worldSource, /compileCloudShippingProductionRuntimeV1\(runtime\)/);
    assert.match(worldSource,
        /productionV2: compileCloudShippingProductionRuntimeV1\(embeddedBase\)/);
    assert.match(worldSource, /zeroYawRuntimeCache/);
});

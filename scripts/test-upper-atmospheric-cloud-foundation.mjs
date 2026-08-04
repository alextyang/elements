import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const root = mkdtempSync(join(tmpdir(), "elements-upper-cloud-foundation-"));
after(() => rmSync(root, { recursive: true, force: true }));
const compile = (name) => {
    const source = readFileSync(new URL(`../components/backgrounds/sky/${name}.ts`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    }).outputText.replace(/"\.\/upper-atmospheric-cloud-foundation"/g,
        '"./upper-atmospheric-cloud-foundation.mjs"');
    writeFileSync(join(root, `${name}.mjs`), output);
};
compile("upper-atmospheric-cloud-foundation");
compile("upper-atmospheric-cloud-topology-qualification");
const foundation = await import(`file://${join(root, "upper-atmospheric-cloud-foundation.mjs")}`);
const topology = await import(`file://${join(root, "upper-atmospheric-cloud-topology-qualification.mjs")}`);

test("Cs species, requested optical/organization axes, PSC classes, nacreous, and NLC are explicit", () => {
    assert.equal(foundation.UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS.length, 12);
    for (const representation of foundation.UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS) {
        const d = foundation.UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
        assert.equal(d.representation, representation);
        assert.ok(d.wmoSource.startsWith("https://cloudatlas.wmo.int/"));
        assert.ok(d.requiredMorphology.length >= 4);
        assert.ok(d.forbiddenMorphology.length >= 4);
        assert.ok(d.altitudeKm[1] > d.altitudeKm[0]);
        assert.ok(d.formationSpanKm[1] > d.formationSpanKm[0]);
    }
});

test("Cs taxonomy does not invent radiatus, translucidus, or opacus varieties", () => {
    const d = foundation.UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS;
    assert.equal(d["cirrostratus-fibratus"].wmoCanonicalDesignation, true);
    assert.equal(d["cirrostratus-nebulosus"].wmoCanonicalDesignation, true);
    assert.equal(d["cirrostratus-duplicatus"].classificationAxis, "wmo-variety");
    assert.equal(d["cirrostratus-undulatus"].classificationAxis, "wmo-variety");
    assert.equal(d["cirrostratus-radiatus"].classificationAxis, "companion-cloud-organization");
    assert.equal(d["cirrostratus-translucidus"].classificationAxis, "noncanonical-optical-state");
    assert.equal(d["cirrostratus-opacus"].productionReachable, false);
});

test("every representation has three distinct deterministic topologies", () => {
    for (const representation of foundation.UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS) {
        const variants = foundation.UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[representation];
        assert.equal(variants.length, 3);
        const result = topology.qualifyUpperVariantSet(representation);
        assert.equal(result.valid, true,
            `${representation}: ${result.violations} (${result.minimumPairwiseSignatureDistance})`);
        assert.equal(foundation.selectUpperTopologyVariant(representation, 7), variants[1]);
    }
});

const environmentDepression = {
    "day-oblique-natural": -3,
    "golden-backlit-telephoto": 1,
    "humid-wide-nearby": -2,
    "twilight-overhead": 6,
    "moonlight-natural": 11,
};
const admissible = (representation, environment, overrides = {}) => {
    const d = foundation.UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
    const psc = d.family === "polar-stratospheric-cloud";
    const nlc = d.family === "noctilucent-cloud";
    return {
        representation, latitudeDegrees: psc ? 68 : nlc ? 58 : 40,
        month: psc ? 1 : nlc ? 6 : 4,
        altitudeKm: (d.altitudeKm[0] + d.altitudeKm[1]) * 0.5,
        temperatureKelvin: representation === "nacreous-ice" ||
            representation === "polar-stratospheric-ice" ? 185
            : psc ? 192 : nlc ? 145 : 225,
        solarDepressionDegrees: environmentDepression[environment],
        viewElevationDegrees: nlc ? 15 : 35,
        environment,
        hasOrographicOrSevereStormGravityWave: true,
        hasCirrusRadiatusCompanion: true,
        ...overrides,
    };
};

test("each state qualifies only in its physically legal established contexts", () => {
    for (const representation of foundation.UPPER_ATMOSPHERIC_CLOUD_REPRESENTATIONS) {
        const d = foundation.UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
        for (const environment of d.legalEnvironments) {
            const result = foundation.qualifyUpperAtmosphericAdmissibility(
                admissible(representation, environment),
            );
            assert.equal(result.legal, true,
                `${representation}/${environment}: ${result.violations}`);
        }
        for (const environment of foundation.UPPER_BENCHMARK_ENVIRONMENTS) {
            if (d.legalEnvironments.includes(environment) || !d.productionReachable) continue;
            assert.equal(foundation.qualifyUpperAtmosphericAdmissibility(
                admissible(representation, environment),
            ).legal, false);
        }
    }
});

test("NLC gate enforces mesopause altitude, local summer, cold, latitude, and twilight illumination", () => {
    assert.equal(foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("noctilucent", "twilight-overhead"),
    ).legal, true);
    const impossible = foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("noctilucent", "twilight-overhead", {
            latitudeDegrees: 25, month: 1, altitudeKm: 25,
            temperatureKelvin: 190, solarDepressionDegrees: 0,
        }),
    );
    assert.equal(impossible.legal, false);
    assert.ok(impossible.violations.includes("nlc-requires-local-summer"));
    assert.ok(impossible.violations.includes("mesopause-too-warm-for-noctilucent-ice"));
    assert.ok(impossible.violations.includes("nlc-ground-view-latitude-outside-observed-band"));
});

test("PSC classes enforce polar winter, altitude, temperature, and wave support for nacreous ice", () => {
    assert.equal(foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("nacreous-ice", "golden-backlit-telephoto"),
    ).legal, true);
    const warm = foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("nacreous-ice", "golden-backlit-telephoto", {
            latitudeDegrees: 35, month: 7, altitudeKm: 9,
            temperatureKelvin: 205, hasOrographicOrSevereStormGravityWave: false,
        }),
    );
    assert.equal(warm.legal, false);
    assert.ok(warm.violations.includes("psc-requires-high-latitude-polar-air"));
    assert.ok(warm.violations.includes("psc-requires-polar-winter"));
    assert.ok(warm.violations.includes("nacreous-display-needs-wave-scale-cold-pocket"));
});

test("PSC Type Ia, Ib, and II retain distinct frost-point gates", () => {
    const cases = [
        ["polar-stratospheric-sts", 197.5, 198],
        ["polar-stratospheric-nat", 194.5, 195],
        ["polar-stratospheric-ice", 187.8, 188.15],
    ];
    for (const [representation, legalTemperature, threshold] of cases) {
        const legal = foundation.qualifyUpperAtmosphericAdmissibility(
            admissible(representation, "twilight-overhead", {
                temperatureKelvin: legalTemperature,
            }),
        );
        assert.equal(legal.legal, true, representation);
        const warm = foundation.qualifyUpperAtmosphericAdmissibility(
            admissible(representation, "twilight-overhead", {
                temperatureKelvin: threshold + 0.01,
            }),
        );
        assert.equal(warm.legal, false, representation);
        assert.ok(warm.violations.includes(
            "stratosphere-too-warm-for-selected-particle-class"));
        const wrongDomain = foundation.qualifyUpperAtmosphericAdmissibility(
            admissible(representation, "twilight-overhead", {
                latitudeDegrees: 35,
                month: 7,
                altitudeKm: 10,
                solarDepressionDegrees: 14,
            }),
        );
        assert.equal(wrongDomain.legal, false, representation);
        for (const violation of [
            "psc-requires-high-latitude-polar-air",
            "psc-requires-polar-winter",
            "altitude-outside-physical-layer",
            "psc-not-plausibly-sunlit-in-selected-view",
        ]) assert.ok(wrongDomain.violations.includes(violation),
            `${representation}: ${violation}`);
    }
});

test("spectral narrow-size particle optics gate nacreous iridescence", () => {
    const valid = foundation.qualifyPhysicalIridescence({
        representation: "nacreous-ice", particleDiameterMicrons: 10,
        particleDiameterCoefficientOfVariation: 0.12, opticalDepth: 0.08,
        scatteringAngleDegrees: 28, spectralPhaseFunctionAvailable: true,
    });
    assert.equal(valid.eligible, true);
    const decorative = foundation.qualifyPhysicalIridescence({
        representation: "nacreous-ice", particleDiameterMicrons: 10,
        particleDiameterCoefficientOfVariation: 0.7, opticalDepth: 0.8,
        scatteringAngleDegrees: 120, spectralPhaseFunctionAvailable: false,
    });
    assert.equal(decorative.eligible, false);
    assert.ok(decorative.violations.includes(
        "iridescence-needs-spectral-size-dependent-phase-function",
    ));
});

test("halo qualification samples an oriented-ice phase locus rather than drawing a ring", () => {
    const valid = foundation.qualifyPhysicalCirrostratusHalo({
        representation: "cirrostratus-nebulosus", localOpticalDepth: 0.4,
        iceFraction: 0.99, orientedHexagonalFraction: 0.18,
        sourceElevationDegrees: 25, scatteringAngleDegrees: 22.3,
        requestedFamily: "22-degree", spectralIceMuellerAvailable: true,
    });
    assert.equal(valid.eligible, true);
    assert.equal(valid.phaseLocusDegrees, 22);
    const fake = foundation.qualifyPhysicalCirrostratusHalo({
        representation: "cirrostratus-nebulosus", localOpticalDepth: 0.4,
        iceFraction: 0.99, orientedHexagonalFraction: 0.18,
        sourceElevationDegrees: 25, scatteringAngleDegrees: 10,
        requestedFamily: "22-degree", spectralIceMuellerAvailable: false,
    });
    assert.equal(fake.eligible, false);
    assert.ok(fake.violations.includes("sample-is-outside-requested-ice-optics-locus"));
});

test("all particle classes expose polarization-ready non-emissive atmosphere coupling", () => {
    for (const material of Object.values(foundation.UPPER_OPTICAL_MATERIAL_CONTRACTS)) {
        assert.equal(material.polarizationReady, true);
        assert.equal(material.selfEmissive, false);
        assert.equal(material.atmosphereCoupling, "spectral-sun-path-cloud-view-path");
    }
});

test("production reachability rejects Cs opacus and unsupported radiatus aliases", () => {
    const opacus = foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("cirrostratus-opacus", "day-oblique-natural"),
    );
    assert.equal(opacus.legal, false);
    assert.ok(opacus.violations.includes("noncanonical-state-must-transition-before-production"));
    const unsupported = foundation.qualifyUpperAtmosphericAdmissibility(
        admissible("cirrostratus-radiatus", "day-oblique-natural", {
            hasCirrusRadiatusCompanion: false,
        }),
    );
    assert.equal(unsupported.legal, false);
});

test("legal lifecycle transitions preserve genus and particle-state relationships", () => {
    assert.equal(foundation.isLegalUpperTransition(
        "cirrostratus-fibratus", "cirrostratus-nebulosus",
    ), true);
    assert.equal(foundation.isLegalUpperTransition(
        "cirrostratus-opacus", "cirrostratus-nebulosus",
    ), false);
    assert.equal(foundation.isLegalUpperTransition(
        "polar-stratospheric-sts", "nacreous-ice",
    ), true);
    assert.equal(foundation.isLegalUpperTransition(
        "polar-stratospheric-nat", "polar-stratospheric-ice",
    ), true);
    assert.equal(foundation.isLegalUpperTransition("noctilucent", "nacreous-ice"), false);
});

const signature = (representation, index) => foundation.upperTopologySignature(
    foundation.UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS[representation][index],
);
test("nonperiodic upper-cloud layouts pass while a cloned world grid fails", () => {
    const points = [[0, 0], [30, 4], [67, -8], [9, 42], [48, 31], [89, 55], [4, 88], [62, 81]];
    const natural = points.map(([centerEastKm, centerNorthKm], index) => ({
        variantId: foundation.UPPER_ATMOSPHERIC_TOPOLOGY_VARIANTS.noctilucent[index % 3].id,
        centerEastKm, centerNorthKm, altitudeKm: 83 + (index % 3 - 1) * 0.3,
        majorRadiusKm: 30 + index * 2.3, minorRadiusKm: 8 + index * 0.7,
        orientationRadians: 0.2 + index * 0.13,
        topologySignature: signature("noctilucent", index % 3),
    }));
    assert.equal(topology.qualifyUpperLayout("noctilucent", natural).valid, true);
    const lattice = [];
    for (let north = 0; north < 4; north += 1) for (let east = 0; east < 4; east += 1) lattice.push({
        variantId: "nlc-veil-and-long-bands", centerEastKm: east * 20,
        centerNorthKm: north * 20, altitudeKm: 83, majorRadiusKm: 30,
        minorRadiusKm: 8, orientationRadians: 0.2,
        topologySignature: signature("noctilucent", 0),
    });
    const failed = topology.qualifyUpperLayout("noctilucent", lattice);
    assert.equal(failed.valid, false);
    assert.ok(failed.violations.includes("too-many-cloned-topologies"));
    assert.ok(failed.violations.includes("layout-is-periodic-grid"));
});

test("continuous Cirrostratus cannot be assembled from tiled population stamps", () => {
    const owner = {
        variantId: "invading-fibrous-front", centerEastKm: 0, centerNorthKm: 0,
        altitudeKm: 9, majorRadiusKm: 200, minorRadiusKm: 80,
        orientationRadians: 0.2,
        topologySignature: signature("cirrostratus-fibratus", 0),
    };
    assert.equal(topology.qualifyUpperLayout("cirrostratus-fibratus", [owner]).valid, true);
    const tiled = [0, 1, 2, 3].map((index) => ({ ...owner, centerEastKm: index * 150 }));
    assert.equal(topology.qualifyUpperLayout("cirrostratus-fibratus", tiled).valid, false);
});

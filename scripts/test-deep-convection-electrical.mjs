import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after } from "node:test";
import ts from "typescript";

const temporaryRoot = mkdtempSync(join(
    tmpdir(),
    "elements-deep-convection-electrical-",
));
after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

const foundationSource = readFileSync(new URL(
    "../components/backgrounds/sky/deep-convection-physical-foundation.ts",
    import.meta.url,
), "utf8");
const electricalSource = readFileSync(new URL(
    "../components/backgrounds/sky/deep-convection-electrical.ts",
    import.meta.url,
), "utf8");
const weatherPhenomenaSource = readFileSync(new URL(
    "../components/backgrounds/sky/weather-optical-phenomena.ts",
    import.meta.url,
), "utf8");
const transpile = (value) => ts.transpileModule(value, {
    compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
    },
}).outputText;
writeFileSync(
    join(temporaryRoot, "deep-convection-physical-foundation.mjs"),
    transpile(foundationSource),
);
writeFileSync(
    join(temporaryRoot, "weather-optical-phenomena.mjs"),
    transpile(weatherPhenomenaSource),
);
writeFileSync(
    join(temporaryRoot, "deep-convection-electrical.mjs"),
    transpile(electricalSource).replace(
        /from "\.\/deep-convection-physical-foundation";/g,
        'from "./deep-convection-physical-foundation.mjs";',
    ),
);
const foundation = await import(new URL(
    `file://${join(temporaryRoot, "deep-convection-physical-foundation.mjs")}`,
));
const electrical = await import(new URL(
    `file://${join(temporaryRoot, "deep-convection-electrical.mjs")}`,
));
const phenomena = await import(new URL(
    `file://${join(temporaryRoot, "weather-optical-phenomena.mjs")}`,
));

const frame = {
    centerEastKm: 23,
    centerNorthKm: -14,
    majorRadiusKm: 21,
    minorRadiusKm: 13,
    orientation: 0.63,
    surfaceAltitudeKm: 0.18,
};
const matureDescriptor = () => foundation.createDeepConvectionDescriptor({
    environment: "continental-sheared-supercell",
    lifecycleStage: "mature",
    stageProgress01: 0.68,
    species: "capillatus",
    organization: "supercell",
    intensity01: 1,
    seed: 307,
    requestedFeatures: ["incus", "lightning", "praecipitatio"],
});

const stormCoordinates = (eastKm, northKm) => {
    const east = eastKm - frame.centerEastKm;
    const north = northKm - frame.centerNorthKm;
    return {
        alongKm: east * Math.sin(frame.orientation) +
            north * Math.cos(frame.orientation),
        crossKm: east * Math.cos(frame.orientation) -
            north * Math.sin(frame.orientation),
    };
};

test("mature supercell electrical sources are finite, deterministic, and charge-owned", () => {
    const descriptor = matureDescriptor();
    const first = electrical.resolveDeepConvectionElectricalSource(
        descriptor,
        "storm-owner",
        frame,
    );
    const second = electrical.resolveDeepConvectionElectricalSource(
        structuredClone(descriptor),
        "storm-owner",
        structuredClone(frame),
    );
    assert.deepEqual(first, second);
    assert.equal(first.active, true);
    assert.equal(first.parentSystemId, "storm-owner");
    assert.equal(first.sourceRegion, "mixed-phase-core");
    assert.equal(first.reservoirs.length, 3);
    assert.ok(first.reservoirs.some(({ polarity }) => polarity === "positive"));
    assert.ok(first.reservoirs.some(({ polarity }) => polarity === "negative"));
    assert.ok(first.reservoirs.some(({ carrier }) => carrier === "small-ice"));
    assert.ok(first.reservoirs.some(({ carrier }) => carrier === "graupel"));
    assert.ok(first.dischargeCandidates.some(({ kind }) =>
        kind === "intra-cloud"));
    assert.ok(first.dischargeCandidates.some(({ kind }) =>
        kind === "cloud-to-ground"));

    for (const reservoir of first.reservoirs) {
        const local = stormCoordinates(
            reservoir.centerEastKm,
            reservoir.centerNorthKm,
        );
        assert.ok(Math.abs(local.alongKm) + reservoir.majorRadiusKm <=
            frame.majorRadiusKm * 0.93 + 1e-9);
        assert.ok(Math.abs(local.crossKm) + reservoir.minorRadiusKm <=
            frame.minorRadiusKm * 0.93 + 1e-9);
        assert.ok(reservoir.altitudeRangeKm[0] >= frame.surfaceAltitudeKm);
        assert.ok(reservoir.altitudeRangeKm[1] <= descriptor.cloudTopKm + 1e-9);
        assert.ok(reservoir.altitudeRangeKm[1] > reservoir.altitudeRangeKm[0]);
        assert.ok(reservoir.relativeCharge01 > 0);
    }
    for (const candidate of first.dischargeCandidates) {
        assert.equal(candidate.controlPointsEastAltitudeNorthKm.length, 3);
        assert.ok(candidate.relativeProbability01 > 0);
        assert.ok(candidate.relativeProbability01 <= 1);
        assert.ok(candidate.maximumChannelRadiusMetres >= 0.018);
        assert.ok(candidate.maximumChannelRadiusMetres <= 0.095);
        for (const [eastKm, altitudeKm, northKm] of
            candidate.controlPointsEastAltitudeNorthKm) {
            assert.ok([eastKm, altitudeKm, northKm].every(Number.isFinite));
            const local = stormCoordinates(eastKm, northKm);
            assert.ok(Math.abs(local.alongKm) <= frame.majorRadiusKm + 1e-9);
            assert.ok(Math.abs(local.crossKm) <= frame.minorRadiusKm + 1e-9);
            assert.ok(altitudeKm >= frame.surfaceAltitudeKm - 1e-9);
            assert.ok(altitudeKm <= descriptor.cloudTopKm + 1e-9);
        }
    }

    assert.ok(first.illuminationEnvelope);
    assert.equal(
        first.illuminationEnvelope.mode,
        "finite-storm-light-transport-volume",
    );
    assert.equal(first.illuminationEnvelope.ownerId, first.parentSystemId);
    assert.equal(first.illuminationEnvelope.emissionSource, "channel-only");
    assert.ok(first.illuminationEnvelope.majorRadiusKm <= frame.majorRadiusKm);
    assert.ok(first.illuminationEnvelope.minorRadiusKm <= frame.minorRadiusKm);
    assert.ok(first.illuminationEnvelope.bottomAltitudeKm >=
        frame.surfaceAltitudeKm);
    assert.ok(first.illuminationEnvelope.topAltitudeKm <=
        descriptor.cloudTopKm + 1e-9);
    const centreMembership =
        electrical.evaluateDeepConvectionElectricalIlluminationMembership(
            first,
            [first.illuminationEnvelope.centerEastKm,
                (first.illuminationEnvelope.bottomAltitudeKm +
                    first.illuminationEnvelope.topAltitudeKm) * 0.5,
                first.illuminationEnvelope.centerNorthKm],
        );
    assert.ok(centreMembership.finiteEnvelopeWeight > 0.99);
    assert.equal(centreMembership.primaryEmitter, false);
    assert.equal(
        electrical.evaluateDeepConvectionElectricalIlluminationMembership(
            first, [1_000, 5, 1_000]).finiteEnvelopeWeight,
        0,
    );

    const cloudToGround = first.dischargeCandidates.find(({ kind }) =>
        kind === "cloud-to-ground");
    const eventContract = electrical.createDeepConvectionLightningEventContract(
        first,
        {
            eventId: "storm-owner-flash-1",
            candidateId: cloudToGround.id,
            peakCurrentKiloamps: 42,
            radiantEnergyJoules: 2.5e6,
            ownerOpticalDepth: 48,
            ownerTemperatureKelvin: 248,
            seed: 811,
        },
    );
    assert.deepEqual(eventContract.reasons, []);
    assert.ok(eventContract.eventInput);
    assert.equal(eventContract.eventInput.owner.id, first.parentSystemId);
    assert.equal(eventContract.eventInput.topology, "cloud-to-ground");
    assert.ok(eventContract.eventInput.maximumChannelRadiusMetres < 0.1);
    const opticalEvent = phenomena.createLightningEventState(
        eventContract.eventInput);
    assert.equal(opticalEvent.validity.valid, true,
        opticalEvent.validity.reasons.join(","));
    assert.ok(opticalEvent.channelSegments.every(({ radiusMetres }) =>
        radiusMetres <= eventContract.eventInput.maximumChannelRadiusMetres));
});

test("lifecycle gating suppresses immature and decayed electrical sources", () => {
    for (const lifecycleStage of ["developing", "decaying"]) {
        const descriptor = foundation.createDeepConvectionDescriptor({
            environment: "continental-sheared-supercell",
            lifecycleStage,
            stageProgress01: 0.72,
            species: lifecycleStage === "developing" ? "calvus" : "capillatus",
            organization: "supercell",
            intensity01: 1,
            seed: 307,
        });
        const result = electrical.resolveDeepConvectionElectricalSource(
            descriptor,
            `storm-${lifecycleStage}`,
            frame,
        );
        assert.equal(result.active, false);
        assert.deepEqual(result.reservoirs, []);
        assert.deepEqual(result.dischargeCandidates, []);
        assert.equal(result.illuminationEnvelope, null);
    }
});

test("electrical topology cannot masquerade as hydrometeor opacity or a screen flash", () => {
    const result = electrical.resolveDeepConvectionElectricalSource(
        matureDescriptor(),
        "storm-owner",
        frame,
    );
    assert.equal("opacity" in result, false);
    assert.equal("screen" in result, false);
    assert.equal("color" in result, false);
    assert.equal("hydrometeorDensity" in result, false);
    assert.ok(result.dischargeCandidates.every((candidate) =>
        candidate.controlPointsEastAltitudeNorthKm.length === 3));
});

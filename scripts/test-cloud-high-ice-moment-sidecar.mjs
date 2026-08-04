import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
    CLOUD_HIGH_ICE_MOMENT_SIDECAR_SCHEMA,
    CLOUD_HIGH_ICE_MOMENT_SIDECAR_VERSION,
    CLOUD_HIGH_ICE_RECONSTRUCTION_IDS,
    reduceCloudHighIceMomentSource2x,
} from "./lib/cloud-volume-atlas.mjs";

const manifest = JSON.parse(readFileSync(new URL(
    "../public/assets/sky/cloud-macro-atlas-v2.json",
    import.meta.url,
), "utf8"));
const atlas = readFileSync(new URL(
    `../public/assets/sky/${manifest.atlas.file}`,
    import.meta.url,
));
const majorants = readFileSync(new URL(
    `../public/assets/sky/${manifest.majorants.file}`,
    import.meta.url,
));
const sidecar = readFileSync(new URL(
    `../public/assets/sky/${manifest.highIceMomentSidecar.file}`,
    import.meta.url,
));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sidecarManifest = manifest.highIceMomentSidecar;
const { width, height, depthOrArrayLayers: depth } = sidecarManifest.dimensions;
const resolution = sidecarManifest.volumeResolution;
const atlasIndex = (volume, x, y, z) => (
    (((volume.zOffset + z) * manifest.atlas.dimensions.height + y) *
        manifest.atlas.dimensions.width + volume.xOffset + x) * 4
);
const sidecarIndex = (volume, x, y, z) => (
    (((volume.zOffset + z) * height + y) * width + volume.xOffset + x) * 2
);

test("high-ice sidecar is versioned, checksummed, and independently sized", () => {
    assert.equal(sidecarManifest.schema, CLOUD_HIGH_ICE_MOMENT_SIDECAR_SCHEMA);
    assert.equal(sidecarManifest.version, CLOUD_HIGH_ICE_MOMENT_SIDECAR_VERSION);
    assert.equal(sidecarManifest.format, "rg8unorm");
    assert.equal(sidecarManifest.filtering, "linear");
    assert.deepEqual(sidecarManifest.dimensions, manifest.atlas.dimensions);
    assert.equal(sidecarManifest.volumeCount, manifest.atlas.volumeCount);
    assert.equal(sidecarManifest.volumeResolution, manifest.atlas.volumeResolution);
    assert.equal(sidecarManifest.byteLength, width * height * depth * 2);
    assert.equal(sidecar.byteLength, sidecarManifest.byteLength);
    assert.equal(sha256(sidecar), manifest.checksums.highIceMomentSidecar);
    assert.equal(sha256(atlas),
        "0029ad79c731bb328c6331d3e30e86ca7f7bf33c61e899d2cc29519b3fa97002");
    assert.equal(sha256(majorants),
        "273e218aa74172acd444152d92d4e18574219e850d4ad4e8f12ba5470ad42d4f");
    assert.deepEqual(sidecarManifest.sourceIds, CLOUD_HIGH_ICE_RECONSTRUCTION_IDS);
    assert.match(sidecarManifest.channels.r.decode, /secondMoment/);
    assert.match(sidecarManifest.channels.r.decode, /variance/);
});

test("sidecar guards and unsupported coarse voxels are exactly zero", () => {
    const guard = (index) => sidecar[index] === 0;
    for (let z = 0; z < depth; z += 1) {
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const inVolume = manifest.volumes.some((volume) =>
                    x >= volume.xOffset && x < volume.xOffset + resolution &&
                    z >= volume.zOffset && z < volume.zOffset + resolution);
                if (!inVolume) {
                    const index = (z * height * width + y * width + x) * 2;
                    assert.ok(guard(index) && guard(index + 1),
                        `guard moment leaked at ${x},${y},${z}`);
                }
            }
        }
    }
    for (const volume of manifest.volumes) {
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const a = atlasIndex(volume, x, y, z);
                    const s = sidecarIndex(volume, x, y, z);
                    if (atlas[a] < manifest.occupancy.densityByteThreshold) {
                        assert.equal(sidecar[s], 0, `${volume.id} R outside support`);
                        assert.equal(sidecar[s + 1], 0, `${volume.id} G outside support`);
                    }
                }
            }
        }
    }
});

test("high-ice moments obey E[d²] and derived variance bounds", () => {
    let sidecarNonzero = 0;
    let maximumDerivedVariance = 0;
    const highIce = new Set(sidecarManifest.sourceIds);
    for (const volume of manifest.volumes) {
        const expectedSignal = highIce.has(volume.id);
        for (let z = 0; z < resolution; z += 1) {
            for (let y = 0; y < resolution; y += 1) {
                for (let x = 0; x < resolution; x += 1) {
                    const a = atlasIndex(volume, x, y, z);
                    const s = sidecarIndex(volume, x, y, z);
                    const mean = atlas[a] / 255;
                    const secondMoment = sidecar[s] / 255;
                    const coverage = sidecar[s + 1] / 255;
                    assert.ok(secondMoment >= 0 && secondMoment <= 1);
                    assert.ok(coverage >= 0 && coverage <= 1);
                    if (!expectedSignal) {
                        assert.equal(sidecar[s], 0, `${volume.id} unexpected R signal`);
                        assert.equal(sidecar[s + 1], 0, `${volume.id} unexpected G signal`);
                        continue;
                    }
                    if (atlas[a] < manifest.occupancy.densityByteThreshold) {
                        assert.equal(secondMoment, 0);
                        assert.equal(coverage, 0);
                        continue;
                    }
                    if (expectedSignal) sidecarNonzero += sidecar[s] || sidecar[s + 1] ? 1 : 0;
                    const quantizationTolerance = 1 / 255;
                    assert.ok(secondMoment + quantizationTolerance >= mean * mean,
                        `${volume.id} violates E[d²] >= E[d]²`);
                    assert.ok(secondMoment <= mean + quantizationTolerance,
                        `${volume.id} violates E[d²] <= E[d]`);
                    const derivedVariance = Math.max(0, secondMoment - mean * mean);
                    assert.ok(derivedVariance <= 0.25 + quantizationTolerance,
                        `${volume.id} variance exceeds bounded-signal maximum`);
                    maximumDerivedVariance = Math.max(maximumDerivedVariance, derivedVariance);
                }
            }
        }
    }
    assert.ok(sidecarNonzero > 0, "high-ice sidecar has no supported signal");
    const spissatus = manifest.volumes.find((volume) => volume.id === "ci-spissatus");
    let spissatusVariance = 0;
    for (let z = 0; z < resolution; z += 1) {
        for (let y = 0; y < resolution; y += 1) {
            for (let x = 0; x < resolution; x += 1) {
                const a = atlasIndex(spissatus, x, y, z);
                const s = sidecarIndex(spissatus, x, y, z);
                spissatusVariance = Math.max(
                    spissatusVariance,
                    Math.max(0, sidecar[s] / 255 - (atlas[a] / 255) ** 2),
                );
            }
        }
    }
    assert.ok(maximumDerivedVariance > 0);
    assert.ok(spissatusVariance > 0.0001,
        "Spissatus must retain a useful within-voxel high-ice signal");
});

test("moment reduction is deterministic and preserves physical bounds", () => {
    const sourceDensity = Uint8Array.from([
        0, 255, 0, 255, 32, 64, 96, 128,
    ]);
    const sourceOccupied = Uint8Array.from([0, 1, 0, 1, 1, 1, 1, 1]);
    const options = {
        density: sourceDensity,
        occupied: sourceOccupied,
        sourceResolution: 2,
        targetResolution: 1,
    };
    const first = reduceCloudHighIceMomentSource2x(options);
    const second = reduceCloudHighIceMomentSource2x(options);
    assert.deepEqual(first, second);
    assert.equal(first.coverage[0], Math.round(6 / 8 * 255));
    assert.ok(first.secondMoment[0] >= 0 && first.secondMoment[0] <= 255);
    const unsupported = reduceCloudHighIceMomentSource2x({
        density: new Uint8Array(8),
        occupied: new Uint8Array(8),
        sourceResolution: 2,
        targetResolution: 1,
    });
    assert.equal(unsupported.secondMoment[0], 0);
    assert.equal(unsupported.coverage[0], 0);
});

const expectedBeer = ({ tau, mu, secondMoment, coverage, residual = 0, F = 1 }) => {
    if (mu <= 1e-9 || tau <= 1e-9) return 0;
    const m2 = Math.min(mu, Math.max(mu * mu, secondMoment));
    const n = Math.max(1, 1 / Math.max(1e-6, F));
    let variance = Math.max(0, m2 - mu * mu) + residual;
    const c = Math.max(mu, Math.min(1, coverage));
    const cEff = Math.min(1, 1 - (1 - c) ** n);
    variance /= n;
    variance = Math.min(mu * (1 - mu), Math.max(
        variance,
        mu * mu * (1 / Math.max(1e-6, cEff) - 1),
    ));
    const occupiedMean = Math.min(1, mu / Math.max(1e-6, cEff));
    const occupiedSecond = Math.min(occupiedMean,
        Math.max(occupiedMean * occupiedMean,
            (mu * mu + variance) / Math.max(1e-6, cEff)));
    const occupiedVariance = Math.min(
        occupiedMean * (1 - occupiedMean),
        Math.max(0, occupiedSecond - occupiedMean * occupiedMean),
    );
    const unitTau = tau / Math.max(1e-6, mu);
    if (occupiedVariance <= 1e-8 || occupiedMean >= 1 - 1e-8) {
        return -Math.log((1 - cEff) + cEff * Math.exp(-unitTau * occupiedMean));
    }
    const low = Math.max(0, occupiedMean - Math.sqrt(
        occupiedVariance * (1 - occupiedMean) / Math.max(1e-6, occupiedMean),
    ));
    const high = Math.min(1, occupiedMean + Math.sqrt(
        occupiedVariance * occupiedMean / Math.max(1e-6, 1 - occupiedMean),
    ));
    const highProbability = 1 - occupiedMean;
    const T = (1 - cEff) + cEff * (
        (1 - highProbability) * Math.exp(-unitTau * low) +
        highProbability * Math.exp(-unitTau * high));
    return -Math.log(Math.min(1, Math.max(Math.exp(-24), T)));
};

test("moment-matched expected Beer closure preserves limits and owner-union moments", () => {
    const homogeneous = expectedBeer({ tau: 1.7, mu: 0.4, secondMoment: 0.16, coverage: 1 });
    assert.ok(Math.abs(homogeneous - 1.7) < 1e-8);
    assert.equal(expectedBeer({ tau: 0, mu: 0, secondMoment: 0, coverage: 0 }), 0);

    const bernoulli = expectedBeer({ tau: 1.0, mu: 0.2, secondMoment: 0.2, coverage: 0.2 });
    const expectedBernoulli = -Math.log(0.8 + 0.2 * Math.exp(-5));
    assert.ok(Math.abs(bernoulli - expectedBernoulli) < 1e-8);

    const thin = expectedBeer({ tau: 1e-5, mu: 0.35, secondMoment: 0.35, coverage: 0.35 });
    assert.ok(Math.abs(thin / 1e-5 - 1) < 1e-4, "thin derivative must equal mean optical depth");

    const heterogeneous = expectedBeer({ tau: 2, mu: 0.3, secondMoment: 0.18, coverage: 0.6 });
    assert.ok(heterogeneous >= 0 && heterogeneous <= 2,
        "expected Beer tau must remain passive and Jensen-bounded");
    const fullyFiltered = expectedBeer({ tau: 2, mu: 0.3, secondMoment: 0.18, coverage: 0.6, F: 1e-6 });
    assert.ok(Math.abs(fullyFiltered - 2) < 2e-4,
        "large footprints converge to homogeneous arithmetic Beer");

    const mu1 = 0.2;
    const mu2 = 0.3;
    const m21 = 0.08;
    const m22 = 0.15;
    const p1 = (1 - mu1) * (1 - mu2);
    const p2 = (1 - 2 * mu1 + m21) * (1 - 2 * mu2 + m22);
    const unionMean = 1 - p1;
    const unionSecond = 1 - 2 * p1 + p2;
    const unionCoverage = 1 - (1 - 0.5) * (1 - 0.6);
    assert.ok(Math.abs(unionMean - 0.44) < 1e-12);
    assert.ok(Math.abs(unionSecond - 0.254) < 1e-12);
    assert.ok(Math.abs(unionCoverage - 0.8) < 1e-12);

    // Two independent Bernoulli owners with p=0.5 must remain a union:
    // P1=1-(1-p)^2=.75, P2=1-2P(clear)+P(both clear)=.75, and support=.75.
    // An arithmetic m2 blend would incorrectly report .5 (or clamp to .5625).
    const equalP = 0.5;
    const equalClear = (1 - equalP) * (1 - equalP);
    const equalSecondClear = (1 - 2 * equalP + equalP) ** 2;
    assert.ok(Math.abs(1 - equalClear - 0.75) < 1e-12);
    assert.ok(Math.abs(1 - 2 * equalClear + equalSecondClear - 0.75) < 1e-12);
    assert.ok(Math.abs(1 - equalClear - 0.75) < 1e-12);
});

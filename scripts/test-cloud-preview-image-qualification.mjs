import assert from "node:assert/strict";
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import sharp from "sharp";

import {
    HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT,
    cloudMaskFromCoverage,
    evaluateHighCloudPreviewImage,
    measureCloudPreviewImage,
} from "./lib/cloud-preview-image-qualification.mjs";
import {
    qualifyCloudPreviewPair,
    retainRejectedCloudPair,
} from "./generate-cloud-previews.mjs";

const captureSource = readFileSync(new URL(
    "./capture-cloud-preview.sh", import.meta.url), "utf8");
const blackBoxSource = readFileSync(new URL(
    "./test-cloud-previews-black-box.mjs", import.meta.url), "utf8");
const generatorSource = readFileSync(new URL(
    "./generate-cloud-previews.mjs", import.meta.url), "utf8");
const shaderSource = readFileSync(new URL(
    "../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url), "utf8");

const image = (width, height, sample) => {
    const channels = 3;
    const data = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const value = sample(x, y);
            const offset = (y * width + x) * channels;
            data[offset] = value[0];
            data[offset + 1] = value[1];
            data[offset + 2] = value[2];
        }
    }
    return { data, width, height, channels };
};

const measureFixture = async (filename) => {
    const fixture = new URL(`./fixtures/${filename}`, import.meta.url);
    const { data, info } = await sharp(readFileSync(fixture))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return measureCloudPreviewImage({
        data,
        width: info.width,
        height: info.height,
        channels: info.channels,
    });
};

test("screen-wide radial bands fail the final high-cloud image gate", () => {
    const width = 256;
    const height = 144;
    const pixels = image(width, height, (x, y) => {
        const radius = Math.hypot(x - width * 0.62, y + height * 0.16);
        const band = 24 * Math.sin(radius * 0.19);
        const base = 126 + y * 0.35 + band;
        return [base * 0.66, base * 0.84, base];
    });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(pixels));
    assert.ok(result.metrics.radialExplainedCoverage > 0.45);
    assert.equal(result.radialArtifact, true);
    assert.equal(result.ready, false);
});

test("localized radial foreground does not impersonate screen-wide bands", () => {
    const width = 256;
    const height = 160;
    const pixels = image(width, height, (x, y) => {
        const sky = 110 + y * 0.55;
        const localizedDisc = Math.hypot(x - 12, y - 148) < 8;
        const value = localizedDisc ? 28 : sky;
        return localizedDisc
            ? [value, value, value]
            : [value * 0.67, value * 0.84, value];
    });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(pixels));
    assert.ok(result.metrics.radialExplainedVariance > 0.45);
    assert.ok(result.metrics.radialExplainedCoverage < 0.02);
    assert.equal(result.radialArtifact, false);
});

test("rejected spissatus canary has localized rather than broad radial evidence",
    async () => {
        const metrics = await measureFixture(
            "rejected-ci-spissatus-canary.png");
        const result = evaluateHighCloudPreviewImage(metrics);
        assert.ok(Math.abs(
            metrics.radialExplainedVariance - 0.24666709486656396,
        ) < 1e-12);
        assert.ok(Math.abs(
            metrics.radialExplainedCoverage - 0.012890625,
        ) < 1e-12);
        assert.ok(
            metrics.radialExplainedCoverage <
                HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT
                    .minimumRadialExplainedCoverage,
        );
        assert.equal(result.radialArtifact, false);
    });

test("real screen-wide spissatus bands retain broad radial evidence",
    async () => {
        const metrics = await measureFixture(
            "banded-ci-spissatus-canary.png");
        const result = evaluateHighCloudPreviewImage(metrics);
        assert.ok(Math.abs(
            metrics.radialExplainedVariance - 0.26242569881580424,
        ) < 1e-12);
        assert.ok(Math.abs(
            metrics.radialExplainedCoverage - 0.15888671875,
        ) < 1e-12);
        assert.ok(
            metrics.radialExplainedCoverage >=
                HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT
                    .minimumRadialExplainedCoverage,
        );
        assert.equal(result.radialArtifact, true);
        assert.equal(result.ready, false);
    });

test("a smooth analytic plate without internal detail fails structure", () => {
    const width = 256;
    const height = 144;
    const pixels = image(width, height, (x, y) => {
        const sky = 130 + y * 0.3;
        const inside = ((x - 145) / 82) ** 2 + ((y - 62) / 18) ** 2 < 1;
        const lift = inside ? 48 : 0;
        return [sky * 0.68 + lift, sky * 0.85 + lift, sky + lift];
    });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(pixels));
    assert.equal(result.scaleSeparatedStructureReady, false);
    assert.equal(result.ready, false);
    assert.equal(evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(pixels), {
            requireScaleSeparatedStructure: false,
        }).ready, true, "the explicit smooth-veil profile bypasses texture only");
});

test("smooth atmosphere with localized multiscale cloud detail is admitted", () => {
    const width = 256;
    const height = 144;
    const pixels = image(width, height, (x, y) => {
        const sky = 130 + y * 0.3;
        const dx = (x - 150) / 58;
        const dy = (y - 62) / 24;
        const cloud = Math.exp(-(dx * dx + dy * dy) * 1.4);
        const detail = cloud * (
            22 + 24 * Math.sin(x * 0.89) * Math.sin(y * 0.73) +
            9 * Math.sin(x * 0.27 + y * 0.39));
        return [sky * 0.68 + detail, sky * 0.85 + detail, sky + detail];
    });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(pixels));
    assert.equal(result.radialArtifact, false);
    assert.equal(result.ready, true);
});

const cloudLocalFixture = ({ detailed }) => {
    const width = 256;
    const height = 144;
    const data = new Uint8Array(width * height * 3);
    const cloudMask = new Float64Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const pixel = y * width + x;
            const dx = (x - 150) / 78;
            const dy = (y - 68) / 25;
            const inside = dx * dx + dy * dy < 1;
            cloudMask[pixel] = inside ? 1 : 0;
            // A radial sky/background is intentionally unrelated to the
            // renderer-owned support matte.
            const radius = Math.hypot(x - 26, y + 18);
            const sky = 122 + 22 * Math.sin(radius * 0.18) + y * 0.25;
            const cloud = inside
                ? 36 + (detailed
                    ? 24 * Math.sin(x * 0.82) * Math.sin(y * 0.71) +
                        10 * Math.sin(x * 0.23 + y * 0.39)
                    : 12 * Math.sin(radius * 0.18))
                : 0;
            const offset = pixel * 3;
            data[offset] = Math.max(0, Math.min(255, sky * 0.65 + cloud));
            data[offset + 1] = Math.max(0, Math.min(255, sky * 0.84 + cloud));
            data[offset + 2] = Math.max(0, Math.min(255, sky + cloud));
        }
    }
    return { data, width, height, channels: 3, cloudMask };
};

// Three sparse smooth patches reproduce the observed false-positive shape:
// almost all measured fine energy is an antialiased outline, while the
// renderer-owned matte reports only a small amount of support.
const sparseSmoothPatchFixture = () => {
    const width = 256;
    const height = 144;
    const patches = [
        [38, 38, 16, 6],
        [126, 74, 21, 7],
        [211, 43, 15, 6],
    ];
    const data = new Uint8Array(width * height * 3);
    const cloudMask = new Float64Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let support = 0;
            for (const [centerX, centerY, radiusX, radiusY] of patches) {
                const distance = ((x - centerX) / radiusX) ** 2 +
                    ((y - centerY) / radiusY) ** 2;
                support = Math.max(support, distance < 1 ? 1 : 0);
            }
            const pixel = y * width + x;
            cloudMask[pixel] = support;
            const sky = 120 + y * 0.2;
            const value = sky + support * 36;
            const offset = pixel * 3;
            data[offset] = value * 0.67;
            data[offset + 1] = value * 0.84;
            data[offset + 2] = value;
        }
    }
    return { data, width, height, channels: 3, cloudMask };
};

const thinFibrousFixture = () => {
    const width = 256;
    const height = 144;
    const data = new Uint8Array(width * height * 3);
    const cloudMask = new Float64Array(width * height);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let support = false;
            let lane = 0;
            for (let index = 0; index < 5; index += 1) {
                const centerY = 20 + index * 23 +
                    12 * Math.sin(x * 0.045 + index);
                if (Math.abs(y - centerY) < 1.5) {
                    support = true;
                    lane = index;
                }
            }
            const pixel = y * width + x;
            cloudMask[pixel] = support ? 1 : 0;
            const sky = 122 + y * 0.2;
            const material = support
                ? 26 + 14 * Math.sin(x * 0.47 + y * 0.19) +
                    8 * Math.sin(x * 0.13 + lane)
                : 0;
            const value = sky + material;
            const offset = pixel * 3;
            data[offset] = value * 0.67;
            data[offset + 1] = value * 0.84;
            data[offset + 2] = value;
        }
    }
    return { data, width, height, channels: 3, cloudMask };
};

test("renderer matte removes radial sky evidence while preserving detailed cloud evidence", () => {
    const fixture = cloudLocalFixture({ detailed: true });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(fixture),
        { requireCloudMask: true },
    );
    assert.equal(result.cloudMaskUsed, true);
    assert.equal(result.cloudLocalStructureReady, true);
    assert.equal(result.ready, true);
});

test("smooth radial cloud fails over a benign sky when matte localizes it", () => {
    const fixture = cloudLocalFixture({ detailed: false });
    const result = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(fixture),
        { requireCloudMask: true },
    );
    assert.equal(result.cloudMaskUsed, true);
    assert.equal(result.radialArtifact, true);
    assert.equal(result.ready, false);
});

test("sparse smooth patches cannot pass from silhouette-only fine energy", () => {
    const fixture = sparseSmoothPatchFixture();
    const metrics = measureCloudPreviewImage(fixture);
    const result = evaluateHighCloudPreviewImage(metrics, {
        requireCloudMask: true,
    });
    assert.ok(metrics.cloudSupportFraction < 0.08);
    assert.ok(metrics.fineTextureFraction >=
        HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT.minimumFineTextureFraction);
    assert.ok(metrics.cloudEdgeFraction > 0.2);
    assert.ok(metrics.cloudInteriorTextureFraction <
        HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT
            .minimumCloudInteriorTextureFraction);
    assert.equal(result.cloudLocalStructureReady, false);
    assert.equal(result.ready, false);
});

test("thin fibrous cirrus can pass with matte-normalized residual detail", () => {
    const fixture = thinFibrousFixture();
    const metrics = measureCloudPreviewImage(fixture);
    const result = evaluateHighCloudPreviewImage(metrics, {
        requireCloudMask: true,
    });
    assert.equal(metrics.cloudCoreSupportFraction, 0);
    assert.ok(metrics.cloudMaskResidualTextureFraction >=
        HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT
            .minimumCloudMaskResidualTextureFraction);
    assert.equal(result.cloudLocalStructureReady, true);
    assert.equal(result.ready, true);
});

test("missing or mismatched renderer matte fails closed", () => {
    const fixture = cloudLocalFixture({ detailed: true });
    const { cloudMask: _unusedCloudMask, ...withoutMatteFixture } = fixture;
    const withoutMatte = evaluateHighCloudPreviewImage(
        measureCloudPreviewImage(withoutMatteFixture),
        { requireCloudMask: true },
    );
    assert.equal(withoutMatte.matteMissing, true);
    assert.equal(withoutMatte.ready, false);
    assert.throws(
        () => measureCloudPreviewImage({
            ...fixture,
            cloudMask: new Float64Array(fixture.width * fixture.height - 1),
        }),
        /matte dimensions are incomplete/,
    );
    assert.throws(
        () => cloudMaskFromCoverage({
            data: new Uint8Array(2 * 2 * 3),
            width: 3,
            height: 2,
            channels: 3,
        }),
        /matte pixels are incomplete/,
    );
});

test("pair qualifier rejects missing and mismatched matte files", async () => {
    const root = mkdtempSync(join(tmpdir(), "cloud-preview-matte-contract-"));
    const finalPath = join(root, "final.png");
    const mattePath = join(root, "coverage.png");
    const wrongMattePath = join(root, "wrong-coverage.png");
    try {
        const finalPixels = Buffer.alloc(64 * 40 * 3, 120);
        const mattePixels = Buffer.alloc(64 * 40 * 3, 0);
        await sharp(finalPixels, {
            raw: { width: 64, height: 40, channels: 3 },
        }).png().toFile(finalPath);
        await sharp(mattePixels, {
            raw: { width: 64, height: 40, channels: 3 },
        }).png().toFile(mattePath);
        await sharp(Buffer.alloc(63 * 40 * 3), {
            raw: { width: 63, height: 40, channels: 3 },
        }).png().toFile(wrongMattePath);
        await assert.rejects(
            qualifyCloudPreviewPair({ imagePath: finalPath, mattePath: join(root, "missing.png") }),
            /requires both final image and same-case coverage matte/,
        );
        await assert.rejects(
            qualifyCloudPreviewPair({ imagePath: finalPath, mattePath: wrongMattePath }),
            /do not match final image/,
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("rejected high-cloud pair is retained privately with bounded replacement", () => {
    const root = mkdtempSync(join(tmpdir(), "cloud-preview-rejection-retention-"));
    const finalPath = join(root, "final.png");
    const coveragePath = join(root, "coverage.png");
    const finalMetricsPath = join(root, "final.state.json");
    const coverageMetricsPath = join(root, "coverage.state.json");
    try {
        writeFileSync(finalPath, "final-pixels");
        writeFileSync(coveragePath, "coverage-pixels");
        writeFileSync(finalMetricsPath, JSON.stringify({
            sceneKey: "ci-case",
            debugView: "final",
            productionCameraSignature: "camera-a",
        }));
        writeFileSync(coverageMetricsPath, JSON.stringify({
            sceneKey: "ci-case",
            debugView: "coverage",
            productionCameraSignature: "camera-a",
        }));
        const first = retainRejectedCloudPair({
            root,
            caseId: "ci-case",
            rendererRevision: "a".repeat(64),
            productionPerspective: "oblique-natural",
            finalPath,
            coveragePath,
            finalMetricsPath,
            coverageMetricsPath,
            qualification: { ready: false, radialArtifact: true },
            now: () => "2026-01-01T00:00:00.000Z",
        });
        assert.match(first.destination, /rejected-high-cloud\/ci-case--a{16}$/);
        assert.equal(existsSync(join(first.destination, "final.png")), true);
        assert.equal(existsSync(join(first.destination, "coverage.png")), true);
        const rejection = JSON.parse(readFileSync(
            join(first.destination, "rejection.json"), "utf8"));
        assert.equal(rejection.finalReadiness.debugView, "final");
        assert.equal(rejection.coverageReadiness.debugView, "coverage");
        assert.equal(rejection.publicManifestPublished, false);
        writeFileSync(finalPath, "replacement-final");
        retainRejectedCloudPair({
            root,
            caseId: "ci-case",
            rendererRevision: "b".repeat(64),
            productionPerspective: "oblique-natural",
            finalPath,
            coveragePath,
            finalMetricsPath,
            coverageMetricsPath,
            qualification: { ready: false, matteMissing: true },
        });
        assert.equal(readdirSync(join(root, "rejected-high-cloud")).length, 1,
            "one case keeps one latest private rejection directory");
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("non-finite evidence fails closed", () => {
    const result = evaluateHighCloudPreviewImage({
        fineRms: Number.NaN,
        broadBandRms: 0,
        fineTextureFraction: 0,
        fineToBroadRatio: 0,
        radialExplainedVariance: 0,
        radialExplainedCoverage: 0,
    });
    assert.equal(result.finite, false);
    assert.equal(result.scaleSeparatedStructureReady, false);
    assert.equal(result.ready, false);
});

test("renderer-local evidence is finite and support-gated", () => {
    const fixture = thinFibrousFixture();
    const metrics = measureCloudPreviewImage(fixture);
    const unsupported = evaluateHighCloudPreviewImage({
        ...metrics,
        cloudSupportFraction: 0,
    }, { requireCloudMask: true });
    assert.equal(unsupported.cloudSupportReady, false);
    assert.equal(unsupported.ready, false);
    const incomplete = evaluateHighCloudPreviewImage({
        ...metrics,
        cloudMaskResidualRms: Number.NaN,
    }, { requireCloudMask: true });
    assert.equal(incomplete.cloudLocalStructureReady, false);
    assert.equal(incomplete.ready, false);
});

test("canonical high-cloud PNGs are qualified before capture publication", () => {
    assert.match(captureSource, /\^\(ci\|cc\|cs\)-/);
    assert.match(captureSource, /qualify-cloud-preview-image\.mjs/);
    assert.match(captureSource,
        /persist_capture_failure "high-cloud-image-qualification"/);
    assert.match(captureSource,
        /high-cloud-image-qualification"[\s\S]*rm -f "\$capture_output"/);
    assert.match(captureSource, /cs-nebulosus-[\s\S]*--allow-smooth-veil/);
});

test("black-box PNG checks delegate to the production qualifier and defer topology", () => {
    assert.match(blackBoxSource,
        /HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT[\s\S]*?evaluateHighCloudPreviewImage[\s\S]*?measureCloudPreviewImage/);
    assert.match(blackBoxSource,
        /resize\(\{ width: HIGH_CLOUD_IMAGE_QUALIFICATION_CONTRACT\.analysisWidth \}\)/);
    assert.match(blackBoxSource,
        /production image qualifier is ready/);
    assert.match(blackBoxSource,
        /exact body topology deferred[\s\S]*?interfaceGap/);
    assert.doesNotMatch(blackBoxSource, /componentCount\(|bodyCount ===|BODY_COUNT_EXPECTED/);
    assert.doesNotMatch(blackBoxSource, /fineEnergy|broadEnergy|radialAlignment/);
});

test("black-box integrity, deadline, and static-route checks remain observable", () => {
    assert.match(blackBoxSource, /sha256File\(path\)/);
    assert.match(blackBoxSource, /PNG digest matches imageContentHash/);
    assert.match(blackBoxSource, /descendantsInProcessGroup/);
    assert.match(blackBoxSource, /capture process group is cleaned up/);
    assert.match(blackBoxSource,
        /static matrix contains no observable live-renderer surface/);
    assert.match(blackBoxSource, /catalogueFromPublicCommand/);
    assert.match(blackBoxSource, /partial manifest is not labelled complete/);
});

test("coverage debug semantics are renderer-owned 1-T, not raw T", () => {
    assert.match(shaderSource,
        /if \(debug_view == 1\) \{\s*radiance = vec3<f32>\(1\.0 - cloud_transmittance_y\);/);
    assert.match(shaderSource,
        /if \(debug_view == 3\) \{ radiance = cloud_transmittance; \}/);
    const clearAndCloud = new Uint8Array([
        0, 0, 0,
        255, 255, 255,
    ]);
    const coverageMask = cloudMaskFromCoverage({
        data: clearAndCloud,
        width: 2,
        height: 1,
        channels: 3,
    });
    assert.equal(coverageMask[0], 0);
    assert.ok(Math.abs(coverageMask[1] - 1) < 1e-12);
    const invertedTMask = cloudMaskFromCoverage({
        data: new Uint8Array(clearAndCloud).map((value) => 255 - value),
        width: 2,
        height: 1,
        channels: 3,
    });
    assert.ok(Math.abs(invertedTMask[0] - 1) < 1e-12);
    assert.equal(invertedTMask[1], 0);
    const fixture = cloudLocalFixture({ detailed: true });
    const coverageData = new Uint8Array(fixture.width * fixture.height * 3);
    for (let pixel = 0; pixel < fixture.cloudMask.length; pixel += 1) {
        const value = fixture.cloudMask[pixel] > 0 ? 255 : 0;
        coverageData[pixel * 3] = value;
        coverageData[pixel * 3 + 1] = value;
        coverageData[pixel * 3 + 2] = value;
    }
    const coverage = cloudMaskFromCoverage({
        data: coverageData,
        width: fixture.width,
        height: fixture.height,
        channels: 3,
    });
    const invertedCoverageData = Uint8Array.from(coverageData,
        (value) => 255 - value);
    const invertedCoverage = cloudMaskFromCoverage({
        data: invertedCoverageData,
        width: fixture.width,
        height: fixture.height,
        channels: 3,
    });
    assert.equal(evaluateHighCloudPreviewImage(
        measureCloudPreviewImage({ ...fixture, cloudMask: coverage }),
        { requireCloudMask: true },
    ).ready, true);
    assert.equal(evaluateHighCloudPreviewImage(
        measureCloudPreviewImage({ ...fixture, cloudMask: invertedCoverage }),
        { requireCloudMask: true },
    ).ready, false, "raw T inverted the cloud support and must fail");
});

test("public high-cloud qualification captures final and coverage serially with bounded views", () => {
    const finalCapture = generatorSource.indexOf('debugView: "final"');
    const matteCapture = generatorSource.indexOf('debugView: "coverage"');
    assert.ok(finalCapture >= 0 && matteCapture > finalCapture);
    assert.match(generatorSource, /CLOUD_PREVIEW_SKIP_IMAGE_QUALIFICATION: "1"/);
    assert.match(generatorSource,
        /CLOUD_PREVIEW_CAPTURE_METRICS_PATH: metricsPath/);
    assert.match(generatorSource,
        /captureView = async \(\{ debugView, outputPath, metricsPath \}\)/);
    assert.match(generatorSource,
        /captureView\(\{[\s\S]*debugView: "coverage"/);
    assert.match(generatorSource,
        /timeoutMs: options\.timeoutMs,[\s\S]*signal: shutdownController\.signal/);
    assert.match(generatorSource,
        /qualifyCloudPreviewPair\(\{[\s\S]*mattePath: coveragePath/);
    assert.match(generatorSource,
        /rmSync\(coveragePath, \{ force: true \}\)/);
    assert.match(generatorSource,
        /same case, production perspective, and camera signature/);
    assert.match(generatorSource, /retainRejectedCloudPair/);
    assert.match(generatorSource, /rejected-high-cloud/);
    assert.match(generatorSource, /publicManifestPublished: false/);
    assert.doesNotMatch(generatorSource,
        /rejected-high-cloud[\s\S]*public\/generated\/cloud-previews/);
});

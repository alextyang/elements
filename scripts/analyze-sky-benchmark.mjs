#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "output", "sky-benchmark");
const RENDERS = path.join(OUTPUT, "renders");
const MANIFEST = JSON.parse(
    await readFile(path.join(ROOT, "data", "moon-benchmark.json"), "utf8"),
);
const LUMA = [0.2126, 0.7152, 0.0722];
const exists = (file) => access(file).then(() => true).catch(() => false);
const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));
const mean = (values) => values.reduce((sum, value) => sum + value, 0) /
    Math.max(1, values.length);
const median = (values) => percentile(values, 0.5);

function percentile(values, amount) {
    if (!values.length) return 0;
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.round((ordered.length - 1) * clamp(amount))];
}

const localReference = (entry) => path.join(
    ROOT,
    "public",
    (entry.comparisonImage ?? entry.referenceImage).replace(/^\//, ""),
);

const decode = async (bytes, options = {}) => {
    let image = sharp(bytes).rotate();
    if (options.width && options.height) {
        image = image.resize(options.width, options.height, {
            fit: options.fit ?? "cover",
            position: "centre",
        });
    }
    const { data, info } = await image
        .removeAlpha()
        .toColorspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, channels: info.channels };
};

const luminanceAt = (pixels, x, y) => {
    const offset = (y * pixels.width + x) * pixels.channels;
    return (
        pixels.data[offset] * LUMA[0] +
        pixels.data[offset + 1] * LUMA[1] +
        pixels.data[offset + 2] * LUMA[2]
    ) / 255;
};

const globalStatistics = (pixels) => {
    const values = [];
    const chroma = [];
    const rgb = [0, 0, 0];
    const bands = Array.from({ length: 12 }, () => []);
    let clipped = 0;
    for (let y = 0; y < pixels.height; y += 1) {
        for (let x = 0; x < pixels.width; x += 1) {
            const offset = (y * pixels.width + x) * pixels.channels;
            const channels = [0, 1, 2].map((channel) => pixels.data[offset + channel] / 255);
            const light = channels.reduce((sum, value, index) => sum + value * LUMA[index], 0);
            values.push(light);
            chroma.push(Math.max(...channels) - Math.min(...channels));
            channels.forEach((value, channel) => { rgb[channel] += value; });
            bands[Math.min(11, Math.floor(y / pixels.height * 12))].push(light);
            if (light > 0.985) clipped += 1;
        }
    }
    const bandMeans = bands.map(mean);
    const bandSteps = bandMeans.slice(1).map((value, index) => value - bandMeans[index]);
    const bandCurvature = bandSteps.slice(1).map((value, index) => value - bandSteps[index]);
    return {
        meanRgb: rgb.map((value) => value / values.length),
        meanLuminance: mean(values),
        p05: percentile(values, 0.05),
        p50: percentile(values, 0.5),
        p95: percentile(values, 0.95),
        meanChroma: mean(chroma),
        clippedFraction: clipped / values.length,
        darkFraction: values.filter((value) => value < 0.045).length / values.length,
        verticalProfile: bandMeans,
        gradientCurvaturePeak: Math.max(0, ...bandCurvature.map(Math.abs)),
    };
};

const pointSources = (pixels, exclusionRadius = 0) => {
    const centerX = (pixels.width - 1) / 2;
    const centerY = (pixels.height - 1) / 2;
    const points = [];
    for (let y = 2; y < pixels.height - 2; y += 1) {
        for (let x = 2; x < pixels.width - 2; x += 1) {
            if (Math.hypot(x - centerX, y - centerY) < exclusionRadius) continue;
            const value = luminanceAt(pixels, x, y);
            let neighborhood = 0;
            let localMaximum = true;
            let samples = 0;
            for (let dy = -2; dy <= 2; dy += 1) {
                for (let dx = -2; dx <= 2; dx += 1) {
                    if (!dx && !dy) continue;
                    const nearby = luminanceAt(pixels, x + dx, y + dy);
                    neighborhood += nearby;
                    samples += 1;
                    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && nearby > value) {
                        localMaximum = false;
                    }
                }
            }
            const contrast = value - neighborhood / samples;
            if (localMaximum && value > 0.065 && contrast > 0.027) {
                points.push({ value, contrast });
            }
        }
    }
    return {
        count: points.length,
        strongest: Math.max(0, ...points.map((point) => point.contrast)),
        meanContrast: mean(points.map((point) => point.contrast)),
    };
};

const radialMoon = (pixels, expectedRadius) => {
    const centerX = (pixels.width - 1) / 2;
    const centerY = (pixels.height - 1) / 2;
    const maximumRadius = Math.max(18, Math.min(
        Math.hypot(centerX, centerY),
        expectedRadius * 12,
    ));
    const maximumNormalizedRadius = maximumRadius / Math.max(0.5, expectedRadius);
    const backgroundFrom = Math.min(7, maximumNormalizedRadius * 0.76);
    const backgroundTo = Math.min(10, maximumNormalizedRadius * 0.96);
    const rings = Array.from({ length: 64 }, () => []);
    const disc = [];
    const annulus = [];
    for (let y = Math.max(0, Math.floor(centerY - maximumRadius));
        y <= Math.min(pixels.height - 1, Math.ceil(centerY + maximumRadius)); y += 1) {
        for (let x = Math.max(0, Math.floor(centerX - maximumRadius));
            x <= Math.min(pixels.width - 1, Math.ceil(centerX + maximumRadius)); x += 1) {
            const radius = Math.hypot(x - centerX, y - centerY);
            const normalized = radius / Math.max(0.5, expectedRadius);
            const value = luminanceAt(pixels, x, y);
            const ring = Math.floor(normalized * 4);
            if (ring >= 0 && ring < rings.length) rings[ring].push(value);
            if (normalized <= 0.92) disc.push(value);
            if (normalized >= backgroundFrom && normalized <= backgroundTo) annulus.push(value);
        }
    }
    const background = median(annulus);
    // A camera PSF can occupy only part of a sub-pixel ring when the physical
    // Moon is 4–8 pixels wide. Ring means retain that energy; medians erase it.
    const profile = rings.map((ring) => ring.length ? mean(ring) - background : 0);
    const corePeak = percentile(disc, 0.995);
    const threshold = background + Math.max(0.025, (corePeak - background) * 0.16);
    let measuredRadius = 0;
    for (let index = 0; index < profile.length; index += 1) {
        if (profile[index] + background >= threshold) measuredRadius = (index + 0.5) / 4;
    }
    const haloBand = (from, to) => mean(profile.slice(from * 4, to * 4));
    const haloProfile = profile.slice(4, 32);
    const secondDerivative = haloProfile.slice(2).map((value, index) =>
        value - 2 * haloProfile[index + 1] + haloProfile[index],
    );
    return {
        expectedRadiusPixels: expectedRadius,
        measuredRadiusRatio: measuredRadius,
        background,
        discP05: percentile(disc, 0.05),
        discP50: percentile(disc, 0.5),
        corePeak,
        coreContrast: corePeak - background,
        darkDiscContrast: percentile(disc, 0.05) - background,
        innerHalo: haloBand(1.25, 2.25),
        middleHalo: haloBand(2.25, 4),
        outerHalo: haloBand(4, 8),
        haloBandingPeak: Math.max(0, ...secondDerivative.map(Math.abs)),
        radialProfile: profile,
    };
};

const discTexture = (pixels, radius) => {
    const size = 256;
    const centerX = (pixels.width - 1) / 2;
    const centerY = (pixels.height - 1) / 2;
    const values = [];
    const sampled = new Float32Array(size * size);
    sampled.fill(Number.NaN);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const nx = ((x + 0.5) / size * 2 - 1) * 0.9;
            const ny = ((y + 0.5) / size * 2 - 1) * 0.9;
            if (nx * nx + ny * ny > 0.81) continue;
            const value = luminanceAt(
                pixels,
                Math.round(centerX + nx * radius),
                Math.round(centerY + ny * radius),
            );
            sampled[y * size + x] = value;
            values.push(value);
        }
    }
    const contrast = percentile(values, 0.95) - percentile(values, 0.05);
    const gradients = [];
    for (let y = 1; y < size; y += 1) {
        for (let x = 1; x < size; x += 1) {
            const value = sampled[y * size + x];
            const left = sampled[y * size + x - 1];
            const above = sampled[(y - 1) * size + x];
            if (Number.isFinite(value) && Number.isFinite(left) && Number.isFinite(above)) {
                gradients.push((Math.abs(value - left) + Math.abs(value - above)) * 0.5);
            }
        }
    }
    return {
        contrast,
        normalizedDetail: mean(gradients) / Math.max(0.01, contrast),
    };
};

const normalizedChromaticity = (rgb) => {
    const total = Math.max(0.001, rgb.reduce((sum, value) => sum + value, 0));
    return rgb.map((value) => value / total);
};

const globalComparison = (reference, render) => ({
    exposureStops: Math.log2((render.meanLuminance + 0.004) / (reference.meanLuminance + 0.004)),
    chromaticityError: mean(normalizedChromaticity(reference.meanRgb).map(
        (value, index) => Math.abs(value - normalizedChromaticity(render.meanRgb)[index]),
    )),
    dynamicRangeRatio: (render.p95 - render.p05) / Math.max(0.005, reference.p95 - reference.p05),
    darknessDeficit: Math.max(0, reference.darkFraction - render.darkFraction),
    gradientCurvatureRatio: render.gradientCurvaturePeak /
        Math.max(0.002, reference.gradientCurvaturePeak),
});

const expectedMoonRadius = (entry, width) =>
    width * (0.2595 * (384400 / entry.astronomy.lunarDistanceKilometers)) /
    Math.max(0.5, entry.capture.horizontalFov);

const unavailableMoonMetric = () => ({
    expectedRadiusPixels: Number.NaN,
    measuredRadiusRatio: Number.NaN,
    background: Number.NaN,
    discP05: Number.NaN,
    discP50: Number.NaN,
    corePeak: Number.NaN,
    coreContrast: Number.NaN,
    darkDiscContrast: Number.NaN,
    innerHalo: Number.NaN,
    middleHalo: Number.NaN,
    outerHalo: Number.NaN,
    haloBandingPeak: Number.NaN,
    radialProfile: [],
});

const summarize = (results, selector) => {
    const entries = results.filter(selector);
    const fieldMedian = (getter) => median(entries.map(getter).filter(Number.isFinite));
    return {
        count: entries.length,
        exposureStops: fieldMedian((entry) => entry.comparison.exposureStops),
        chromaticityError: fieldMedian((entry) => entry.comparison.chromaticityError),
        dynamicRangeRatio: fieldMedian((entry) => entry.comparison.dynamicRangeRatio),
        renderStars: fieldMedian((entry) => entry.renderStars.count),
        referenceStars: fieldMedian((entry) => entry.referenceStars.count),
        luminousFootprintRatio: fieldMedian((entry) => entry.renderMoon.measuredRadiusRatio),
        referenceInnerHalo: fieldMedian((entry) => entry.referenceMoon.innerHalo),
        renderInnerHalo: fieldMedian((entry) => entry.renderMoon.innerHalo),
        referenceOuterHalo: fieldMedian((entry) => entry.referenceMoon.outerHalo),
        renderOuterHalo: fieldMedian((entry) => entry.renderMoon.outerHalo),
        referenceHaloBanding: fieldMedian((entry) => entry.referenceMoon.haloBandingPeak),
        renderHaloBanding: fieldMedian((entry) => entry.renderMoon.haloBandingPeak),
        referenceDarkDiscContrast: fieldMedian((entry) => entry.referenceMoon.darkDiscContrast),
        renderDarkDiscContrast: fieldMedian((entry) => entry.renderMoon.darkDiscContrast),
        referenceDiscContrast: fieldMedian((entry) => entry.referenceDisc.contrast),
        renderDiscContrast: fieldMedian((entry) => entry.renderDisc.contrast),
        referenceDiscDetail: fieldMedian((entry) => entry.referenceDisc.normalizedDetail),
        renderDiscDetail: fieldMedian((entry) => entry.renderDisc.normalizedDetail),
    };
};

const findingText = (report) => {
    const atmospheric = report.byReferenceClass.atmosphericScene;
    const calibrated = report.bySource["eye2sky-oluol"];
    const polar = report.bySource["aadc-davis-all-sky"];
    const fullMoon = report.strata.nasaFullMoon;
    const crescent = report.strata.nasaCrescent;
    const issues = [];
    if (fullMoon?.luminousFootprintRatio) {
        const ratio = fullMoon.luminousFootprintRatio;
        issues.push(`The threshold-measured full-Moon edge is ${ratio.toFixed(2)}× the physical lunar radius in 2° scientific views (${Math.abs(1 - ratio) * 100 < 15 ? "within the analyzer's quarter-ring sampling tolerance" : "a material apparent-size error"}).`);
        issues.push(`Resolved full-Moon surface contrast is ${fullMoon.renderDiscContrast.toFixed(3)} versus ${fullMoon.referenceDiscContrast.toFixed(3)} in NASA truth; normalized small-scale detail is ${(fullMoon.renderDiscDetail / Math.max(0.0001, fullMoon.referenceDiscDetail)).toFixed(2)}× the reference.`);
    }
    if (crescent) {
        issues.push(`The crescent dark disc is ${crescent.renderDarkDiscContrast.toFixed(3)} below its surrounding rendered sky at the median, while NASA truth remains ${crescent.referenceDarkDiscContrast.toFixed(3)} above its black reference field. The renderer is subtractively occluding sky radiance instead of compositing non-negative earthshine/transmitted light.`);
    }
    if (calibrated) {
        issues.push(`Against calibrated 80 ms full-Moon frames, the renderer retains ${(calibrated.renderInnerHalo / Math.max(0.000001, calibrated.referenceInnerHalo) * 100).toFixed(0)}% of measured inner-halo energy and ${(calibrated.renderOuterHalo / Math.max(0.000001, calibrated.referenceOuterHalo) * 100).toFixed(0)}% of outer-halo energy, yet its radial ring curvature is ${(calibrated.renderHaloBanding / Math.max(0.000001, calibrated.referenceHaloBanding)).toFixed(0)}× higher. The energy is redistributed into an incorrect, visibly banded radial profile.`);
        issues.push(`The calibrated night photographs contain a median ${calibrated.referenceStars.toFixed(0)} detected point sources versus ${calibrated.renderStars.toFixed(0)} in matched renders; this exposes exposure/extinction coupling rather than merely star density.`);
        issues.push(`The same DLR scenes render ${calibrated.exposureStops.toFixed(2)} EV brighter with ${calibrated.dynamicRangeRatio.toFixed(1)}× the reference range, showing that camera exposure/tone response is not coupled to the lunar source and atmosphere.`);
    }
    if (atmospheric && polar) {
        issues.push(`Across phase-balanced AADC scenes the renderer is ${polar.exposureStops.toFixed(2)} EV darker and preserves only ${polar.dynamicRangeRatio.toFixed(2)}× the photographed sky range, the opposite camera-response bias from DLR night frames. This is evidence for a scene-linear radiance stage followed by an independent editorial tone map—not a request to copy either exposure.`);
    }
    issues.push("AADC all-sky frames are authoritative for whole-sky color, cloud veil, and brightness distribution; their low-resolution Moon detections are deliberately excluded from lunar-edge conclusions.");
    issues.push("Contextual Commons photographs validate color, exposure, phase, scale, and atmospheric interaction, but not pixel registration because photographer optical-axis metadata is unavailable.");
    return `# Lunar renderer realism evidence\n\nGenerated ${report.generatedAt} from ${report.evaluatedCases} same-state renders. These measurements reveal physical relationships and opportunities; they are not photo-matching objectives.\n\n## Quantified findings\n\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\n## Realism opportunities\n\n- Composite the unlit lunar disc with non-negative transmitted sky and earthshine. It must never become a darker circular cutout in bright sky.\n- Drive the textured disc, camera PSF, aureole, haze, and cloud forward-scattering from one scene-linear lunar radiance value. Use smooth, energy-conserving radial kernels so extra artistic emphasis remains continuous rather than ring-shaped.\n- Make lunar detail frequency-aware: preserve large maria and terminator relief while filtering high-frequency texture by apparent size, seeing, aerosol path, cloud optical depth, and the editorial exposure.\n- Couple stellar limiting magnitude, scintillation, and local extinction to sky radiance and lunar glare, then apply a separate editorial visibility floor if desired. This keeps intentionally beautiful stars without making them look pasted over the atmosphere.\n- Generate depth and variety from coherent latent conditions—humidity profile, aerosol type and height, cloud optical depth, ground albedo, lunar altitude, and adaptation—then apply the palette's intentional grade. Avoid independently randomizing effects that should share the same scattering state.\n\n## Editorial interpretation\n\n- Preserve the app's intentional subtlety, vibrancy, emphasis, and day-to-day diversity. Correct discontinuities and implausible interactions before considering any global color or exposure shift.\n- NASA SVS frames are used for phase, libration, limb, and surface truth—not atmospheric exposure or an editorial color grade.\n- DLR Eye2Sky is the strongest local source for full-Moon PSF, halo shape, sky suppression, and nearby-star interaction because its 80 ms exposure and camera calibration are known. Its star count is evidence about coupled extinction/exposure, not a requirement to suppress the app's stars to the same count.\n- AADC and Commons photographs teach the range and co-occurrence of sky depth, cloud veil, color, and Moon integration. Their camera tone curves and white balance are not radiometric ground truth.\n- No reference pixel chooses renderer palette, exposure, aerosol, humidity, or cloud density.\n`;
};

await mkdir(OUTPUT, { recursive: true });
const results = [];
for (const entry of MANIFEST.cases) {
    const renderPath = path.join(RENDERS, `${entry.id}.png`);
    const referencePath = localReference(entry);
    if (!(await exists(renderPath)) || !(await exists(referencePath))) continue;
    const [referenceBytes, renderBytes] = await Promise.all([
        readFile(referencePath),
        readFile(renderPath),
    ]);
    const [referenceGlobalPixels, renderGlobalPixels, referenceFull, renderFull] = await Promise.all([
        decode(referenceBytes, { width: 320, height: 200 }),
        decode(renderBytes, { width: 320, height: 200 }),
        decode(referenceBytes, entry.referenceClass === "lunarDiscTruth"
            ? { width: 800, height: 800 }
            : { width: 1280, height: 800 }),
        decode(renderBytes),
    ]);
    const reference = globalStatistics(referenceGlobalPixels);
    const render = globalStatistics(renderGlobalPixels);
    const expectedRadius = expectedMoonRadius(entry, renderFull.width);
    const referenceRadius = entry.referenceClass === "lunarDiscTruth"
        ? Math.min(referenceFull.width, referenceFull.height) * 0.47
        : expectedRadius;
    const referenceMoonIsRegistered = entry.source.id === "eye2sky-oluol" ||
        entry.referenceClass === "lunarDiscTruth";
    const localAtmosphereIsReliable = entry.source.id === "eye2sky-oluol" &&
        entry.normalization?.quality !== "low";
    const starExclusion = Math.max(8, expectedRadius * 10);
    results.push({
        id: entry.id,
        referenceClass: entry.referenceClass,
        source: entry.source.id,
        phase: entry.astronomy.phaseClass,
        solarRegime: entry.astronomy.solarRegime,
        lunarAltitudeClass: entry.astronomy.lunarAltitudeClass,
        normalizationQuality: entry.normalization?.quality ?? null,
        reference,
        render,
        comparison: globalComparison(reference, render),
        referenceStars: localAtmosphereIsReliable
            ? pointSources(referenceFull, starExclusion)
            : { count: Number.NaN, strongest: Number.NaN, meanContrast: Number.NaN },
        renderStars: localAtmosphereIsReliable
            ? pointSources(renderFull, starExclusion)
            : { count: Number.NaN, strongest: Number.NaN, meanContrast: Number.NaN },
        referenceMoon: referenceMoonIsRegistered &&
            (entry.referenceClass === "lunarDiscTruth" || localAtmosphereIsReliable)
            ? radialMoon(referenceFull, referenceRadius)
            : unavailableMoonMetric(),
        renderMoon: radialMoon(renderFull, expectedRadius),
        referenceDisc: entry.referenceClass === "lunarDiscTruth"
            ? discTexture(referenceFull, referenceRadius)
            : { contrast: Number.NaN, normalizedDetail: Number.NaN },
        renderDisc: entry.referenceClass === "lunarDiscTruth"
            ? discTexture(renderFull, expectedRadius)
            : { contrast: Number.NaN, normalizedDetail: Number.NaN },
    });
}

const values = (field) => [...new Set(results.map((entry) => entry[field]))];
const group = (field) => Object.fromEntries(
    values(field).map((value) => [value, summarize(results, (entry) => entry[field] === value)]),
);
const report = {
    generatedAt: new Date().toISOString(),
    manifestCases: MANIFEST.cases.length,
    evaluatedCases: results.length,
    exclusions: {
        missingRenderOrReference: MANIFEST.cases.length - results.length,
        lowConfidenceAllSkyMoonLocalMetrics:
            results.filter((entry) => entry.referenceClass === "atmosphericScene" &&
                entry.normalizationQuality === "low").length,
    },
    byReferenceClass: group("referenceClass"),
    bySource: group("source"),
    byPhase: group("phase"),
    bySolarRegime: group("solarRegime"),
    strata: {
        nasaFullMoon: summarize(results, (entry) =>
            entry.referenceClass === "lunarDiscTruth" && entry.phase === "full"),
        nasaCrescent: summarize(results, (entry) =>
            entry.referenceClass === "lunarDiscTruth" && entry.phase.toLowerCase().includes("crescent")),
        calibratedFullMoon: summarize(results, (entry) =>
            entry.source === "eye2sky-oluol" && entry.normalizationQuality !== "low"),
        deepNightAtmosphere: summarize(results, (entry) =>
            entry.referenceClass === "atmosphericScene" && entry.solarRegime === "deepNight"),
    },
    results,
};
await writeFile(path.join(OUTPUT, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const findings = findingText(report);
await writeFile(path.join(OUTPUT, "findings.md"), findings);
await writeFile(path.join(ROOT, "data", "moon-benchmark-findings.md"), findings);
console.log(JSON.stringify({
    evaluatedCases: report.evaluatedCases,
    byReferenceClass: report.byReferenceClass,
    bySource: report.bySource,
}, null, 2));

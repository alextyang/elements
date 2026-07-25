#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const SKY_PATH = path.join(ROOT, "data", "sky-benchmark.json");
const MOON_PATH = path.join(ROOT, "data", "moon-benchmark.json");

const phaseForAltitude = (altitude) => {
    if (altitude < -18) return "night";
    if (altitude < -12) return "astronomicalTwilight";
    if (altitude < -6) return "blueHour";
    if (altitude < -0.833) return "civilTwilight";
    if (altitude < 8) return "golden";
    if (altitude < 25) return "lowDay";
    if (altitude < 50) return "midDay";
    return "highDay";
};

const main = async () => {
    const [sky, moon] = await Promise.all([
        readFile(SKY_PATH, "utf8").then(JSON.parse),
        readFile(MOON_PATH, "utf8").then(JSON.parse),
    ]);
    sky.cases = sky.cases.filter((entry) => !entry.id.startsWith("moon-atmosphere-"));

    const atmospheric = moon.cases
        .filter((entry) =>
            entry.referenceClass === "atmosphericScene" &&
            entry.comparisonImage &&
            ["high", "medium"].includes(entry.normalization?.quality),
        )
        .map((entry) => {
            const horizontalFov = entry.normalization.outputHorizontalFov ?? 92;
            const clouded = entry.renderer.atmosphereStyle === "mist";
            const polar = entry.source.id === "aadc-davis-all-sky";
            return {
                id: `moon-atmosphere-${entry.id}`,
                sourceId: entry.sourceId,
                source: {
                    name: entry.source.name,
                    url: entry.source.url,
                    license: entry.source.license,
                    acknowledgement: entry.source.acknowledgement,
                },
                referenceImage: entry.comparisonImage,
                capture: {
                    timestamp: entry.capture.timestamp,
                    latitude: entry.capture.latitude,
                    longitude: entry.capture.longitude,
                    elevationMeters: entry.capture.elevationMeters,
                    viewDirection: "moonCentered",
                    viewAzimuth: entry.astronomy.lunarAzimuth,
                    horizontalFov,
                    viewElevation: entry.astronomy.lunarAltitude,
                    verticalFov: horizontalFov * 0.625,
                    projection: "rectilinear",
                    sourceProjection: entry.capture.sourceProjection,
                    normalizationQuality: entry.normalization.quality,
                    exposureMilliseconds: entry.capture.exposureMilliseconds,
                },
                observed: {
                    condition: polar ? "moonlitPolar" : "moonlitMarine",
                    phase: phaseForAltitude(entry.astronomy.solarAltitude),
                    solarAltitude: entry.astronomy.solarAltitude,
                    solarAzimuth: entry.astronomy.solarAzimuth,
                    lunarAltitude: entry.astronomy.lunarAltitude,
                    lunarIllumination: entry.astronomy.lunarIllumination,
                    lunarPhaseClass: entry.astronomy.phaseClass,
                    cloudCoverage: entry.observed.cloudCoverage,
                    cloudOpacity: entry.observed.cloudOpacity,
                    classificationAgreement: null,
                    classificationCount: null,
                    region: polar ? "polar" : "marine",
                },
                renderer: {
                    ...entry.renderer,
                    familyId: entry.renderer.familyId === "midnight-depth"
                        ? "violet-nocturne"
                        : entry.renderer.familyId,
                    aerosolType: entry.renderer.aerosolType === "polar"
                        ? "clean"
                        : entry.renderer.aerosolType,
                    cloudType: clouded ? "stratus" : "none",
                    cloudCoverage: clouded
                        ? Math.min(0.72, entry.renderer.cloudDensity / 1.8)
                        : 0,
                    cloudOpticalDepth: clouded
                        ? Math.min(0.48, entry.renderer.cloudDensity / 2.4)
                        : 0,
                },
            };
        });

    sky.cases.push(...atmospheric);
    sky.sources = sky.sources.filter((source) => source.id !== "lunar-atmosphere-corpus");
    sky.sources.push({
        id: "lunar-atmosphere-corpus",
        manifest: "data/moon-benchmark.json",
        caseCount: String(atmospheric.length),
        sources: "Australian Antarctic Division Davis All-Sky Camera; DLR Eye2Sky OLUOL",
        note: "High/medium-confidence moon-centred inverse-fisheye normalizations only",
    });
    sky.summary.caseCount = sky.cases.length;
    sky.summary.conditionCounts = Object.fromEntries(
        [...new Set(sky.cases.map((entry) => entry.observed.condition))]
            .sort()
            .map((condition) => [condition, sky.cases.filter((entry) => entry.observed.condition === condition).length]),
    );
    sky.summary.phaseCounts = Object.fromEntries(
        [...new Set(sky.cases.map((entry) => entry.observed.phase))]
            .sort()
            .map((phase) => [phase, sky.cases.filter((entry) => entry.observed.phase === phase).length]),
    );
    sky.methodology += " The night corpus additionally admits high/medium-confidence moon-centred inverse-fisheye normalizations from the phase-balanced lunar benchmark.";
    await writeFile(SKY_PATH, `${JSON.stringify(sky, null, 2)}\n`);
    console.log(`Assembled ${sky.cases.length} photographic sky cases (${atmospheric.length} lunar-atmosphere additions)`);
};

await main();

#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import SunCalc from "suncalc";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data", "moon-benchmark.json");
const IMAGE_DIRECTORY = path.join(
    ROOT,
    "public",
    "sky-benchmark",
    "references",
    "nasa-svs",
);
const SOURCE_ROOT =
    "https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/frames/730x730_1x1_30p";
const FIRST_HOUR = Date.UTC(2026, 0, 1);
const TARGET_PHASES = [
    0.025, 0.065, 0.11, 0.165, 0.225, 0.29, 0.36, 0.425, 0.475,
    0.5,
    0.525, 0.575, 0.64, 0.71, 0.775, 0.835, 0.89, 0.935, 0.975,
];
const SITES = [
    { id: "los-angeles", latitude: 34.0522, longitude: -118.2437, elevationMeters: 89 },
    { id: "reykjavik", latitude: 64.1466, longitude: -21.9426, elevationMeters: 61 },
    { id: "singapore", latitude: 1.3521, longitude: 103.8198, elevationMeters: 15 },
    { id: "sydney", latitude: -33.8688, longitude: 151.2093, elevationMeters: 58 },
];

const degrees = (radians) => radians * 180 / Math.PI;
const compassAzimuth = (azimuth) =>
    ((degrees(azimuth) + 180) % 360 + 360) % 360;

const angularDistance = (left, right) => {
    const distance = Math.abs(left - right) % 1;
    return Math.min(distance, 1 - distance);
};

const phaseClass = (phase) => {
    if (phase < 0.035 || phase >= 0.965) return "new";
    if (phase < 0.22) return "waxingCrescent";
    if (phase < 0.3) return "firstQuarter";
    if (phase < 0.465) return "waxingGibbous";
    if (phase < 0.535) return "full";
    if (phase < 0.7) return "waningGibbous";
    if (phase < 0.8) return "lastQuarter";
    return "waningCrescent";
};

const solarRegime = (altitude) => {
    if (altitude >= 6) return "day";
    if (altitude >= -6) return "goldenCivil";
    if (altitude >= -12) return "nauticalTwilight";
    if (altitude >= -18) return "astronomicalTwilight";
    return "deepNight";
};

const frameForPhase = (target) => {
    let best;
    for (let frame = 1; frame <= 8_760; frame += 1) {
        const date = new Date(FIRST_HOUR + (frame - 1) * 3_600_000);
        const illumination = SunCalc.getMoonIllumination(date);
        const error = angularDistance(illumination.phase, target);
        if (!best || error < best.error) {
            best = { frame, date, illumination, error };
        }
    }
    return best;
};

const chooseSite = (date, index) => {
    const desiredRegimes = [
        "deepNight",
        "day",
        "goldenCivil",
        "astronomicalTwilight",
        "nauticalTwilight",
    ];
    const desired = desiredRegimes[index % desiredRegimes.length];
    const options = SITES.map((site) => {
        const sun = SunCalc.getPosition(date, site.latitude, site.longitude);
        const moon = SunCalc.getMoonPosition(date, site.latitude, site.longitude);
        const sunAltitude = degrees(sun.altitude);
        const moonAltitude = degrees(moon.altitude);
        const regime = solarRegime(sunAltitude);
        return {
            site,
            sun,
            moon,
            sunAltitude,
            moonAltitude,
            regime,
            score: (regime === desired ? 100 : 0) + moonAltitude,
        };
    }).filter((option) => option.moonAltitude > 5);
    return options.sort((left, right) => right.score - left.score)[0] ??
        SITES.map((site) => {
            const sun = SunCalc.getPosition(date, site.latitude, site.longitude);
            const moon = SunCalc.getMoonPosition(date, site.latitude, site.longitude);
            const sunAltitude = degrees(sun.altitude);
            return {
                site,
                sun,
                moon,
                sunAltitude,
                moonAltitude: degrees(moon.altitude),
                regime: solarRegime(sunAltitude),
            };
        }).sort((left, right) => right.moonAltitude - left.moonAltitude)[0];
};

const main = async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    manifest.cases = manifest.cases.filter(
        (entry) => entry.source.id !== "nasa-svs-lunar-2026",
    );
    await mkdir(IMAGE_DIRECTORY, { recursive: true });
    const cases = [];
    for (let index = 0; index < TARGET_PHASES.length; index += 1) {
        const selected = frameForPhase(TARGET_PHASES[index]);
        const frameCode = String(selected.frame).padStart(4, "0");
        const sourceUrl = `${SOURCE_ROOT}/moon.${frameCode}.jpg`;
        const response = await fetch(sourceUrl, {
            headers: { "user-agent": "Elements lunar benchmark curator/1.0" },
        });
        if (!response.ok) throw new Error(`${sourceUrl}: ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const id = `nasa-svs-2026-${frameCode}`;
        const fileName = `${id}.jpg`;
        await sharp(bytes).jpeg({ quality: 96, chromaSubsampling: "4:4:4" })
            .toFile(path.join(IMAGE_DIRECTORY, fileName));
        const observation = chooseSite(selected.date, index);
        const illumination = selected.illumination;
        cases.push({
            id,
            referenceClass: "lunarDiscTruth",
            sourceId: `SVS 5587 frame ${selected.frame}`,
            source: {
                id: "nasa-svs-lunar-2026",
                name: "NASA SVS Moon Phase and Libration, 2026",
                url: "https://svs.gsfc.nasa.gov/5587/",
                imageUrl: sourceUrl,
                license: "NASA media usage guidelines",
                acknowledgement:
                    "NASA Scientific Visualization Studio; LRO/LOLA/LROC data visualization by Ernie Wright.",
            },
            referenceImage: `/sky-benchmark/references/nasa-svs/${fileName}`,
            capture: {
                timestamp: selected.date.toISOString(),
                timestampConfidence: "hourlyEphemerisFrame",
                latitude: observation.site.latitude,
                longitude: observation.site.longitude,
                elevationMeters: observation.site.elevationMeters,
                viewDirection: "moonCentered",
                viewAzimuth: compassAzimuth(observation.moon.azimuth),
                // A narrow virtual telephoto field preserves enough pixels for
                // terminator, limb, earthshine, and antialiasing measurements.
                horizontalFov: 2,
                sourceHorizontalFov: null,
                sourceProjection: "orthographicLunarDisc",
                comparisonProjection: "normalizedLunarDiscCrop",
                exposureMilliseconds: null,
                sensor: "LRO-derived scientific visualization",
                sourceResolution: [730, 730],
            },
            astronomy: {
                solarAltitude: Number(observation.sunAltitude.toFixed(4)),
                solarAzimuth: Number(compassAzimuth(observation.sun.azimuth).toFixed(4)),
                lunarAltitude: Number(observation.moonAltitude.toFixed(4)),
                lunarAzimuth: Number(compassAzimuth(observation.moon.azimuth).toFixed(4)),
                lunarDistanceKilometers: Number(observation.moon.distance.toFixed(1)),
                lunarIllumination: Number(illumination.fraction.toFixed(5)),
                lunarPhase: Number(illumination.phase.toFixed(5)),
                phaseClass: phaseClass(illumination.phase),
                solarRegime: observation.regime,
                lunarAltitudeClass: observation.moonAltitude < 12 ? "horizon" :
                    observation.moonAltitude < 30 ? "low" :
                        observation.moonAltitude < 55 ? "mid" : "high",
                ephemeris: "NASA SVS hourly geocentric frame; SunCalc topocentric placement",
            },
            observed: {
                condition: "lunarSurfaceTruth",
                cloudCoverage: 0,
                cloudOpacity: 0,
                imageStatistics: null,
                atmosphericClassificationConfidence: "notApplicable",
            },
            renderer: {
                familyId: observation.regime === "day" ? "crystal-azure" : "violet-nocturne",
                atmosphereStyle: "crystal",
                aerosolType: "clean",
                cloudDensity: 0,
                composition: {
                    aerosol: 0.1,
                    humidity: 0.32,
                    aerosolSize: 0.3,
                    aerosolAbsorption: 0.025,
                    observerAltitude: 0.03,
                    inversion: 0.04,
                    groundAlbedo: 0.2,
                },
            },
        });
        process.stdout.write(`[${index + 1}/${TARGET_PHASES.length}] ${id}\n`);
    }
    manifest.cases.push(...cases);
    manifest.sources = manifest.sources.filter(
        (source) => source.id !== "nasa-svs-lunar-2026",
    );
    manifest.sources.push({
        id: "nasa-svs-lunar-2026",
        datasetUrl: "https://svs.gsfc.nasa.gov/5587/",
        license: "NASA media usage guidelines",
        temporalCoverage: "2026-01-01/2026-12-31",
        cadence: "hourly",
        product: "730 px north-up phase/libration/apparent-diameter frames",
    });
    manifest.summary.caseCount = manifest.cases.length;
    manifest.summary.sourceCounts["nasa-svs-lunar-2026"] = cases.length;
    manifest.summary.phaseCounts = Object.fromEntries(
        [...new Set(manifest.cases.map((entry) => entry.astronomy.phaseClass))].map((phase) => [
            phase,
            manifest.cases.filter((entry) => entry.astronomy.phaseClass === phase).length,
        ]),
    );
    manifest.summary.referenceClassCounts = Object.fromEntries(
        [...new Set(manifest.cases.map((entry) => entry.referenceClass))].map((kind) => [
            kind,
            manifest.cases.filter((entry) => entry.referenceClass === kind).length,
        ]),
    );
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Added ${cases.length} NASA lunar-disc truth cases`);
};

await main();

#!/usr/bin/env node

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

import sharp from "sharp";
import SunCalc from "suncalc";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "data", "moon-benchmark.json");
const REFERENCE_ROOT = path.join(
    ROOT,
    "public",
    "sky-benchmark",
    "references",
);
const AADC_DIRECTORY = path.join(REFERENCE_ROOT, "aadc");
const TEMP_DIRECTORY = path.join(ROOT, "output", "moon-curation-cache");

const AADC = {
    id: "aadc-davis-all-sky",
    uuid: "5a3fef52-46b0-4998-9606-d2f3092bb90d",
    datasetPath: "AAS_4292_Davis_All_Sky_Camera",
    datasetUrl:
        "https://data.aad.gov.au/dataset/5a3fef52-46b0-4998-9606-d2f3092bb90d",
    apiBase: "https://data.aad.gov.au/eds/api",
    latitude: -68.5766,
    longitude: 77.9674,
    elevationMeters: 23,
    imageWidth: 720,
    imageHeight: 576,
    // Measured from the camera mask in the published frames. Orientation is
    // recovered per frame from the astronomical Moon position during the
    // normalization pass, so no undocumented north-up assumption is made.
    opticalCenter: [360, 292],
    usableRadius: 251,
};

const TARGET_AADC_CASES = Number(process.env.MOON_BENCHMARK_AADC_COUNT ?? 56);

const clamp = (value, min = 0, max = 1) =>
    Math.min(max, Math.max(min, value));

const degrees = (radians) => radians * 180 / Math.PI;

const compassAzimuth = (suncalcAzimuth) =>
    ((degrees(suncalcAzimuth) + 180) % 360 + 360) % 360;

const hash = (value) => {
    let result = 2166136261;
    for (const character of value) {
        result ^= character.charCodeAt(0);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
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

const lunarAltitudeClass = (altitude) => {
    if (altitude < 12) return "horizon";
    if (altitude < 30) return "low";
    if (altitude < 55) return "mid";
    return "high";
};

const downloadUrl = (objectName) =>
    `${AADC.apiBase}/dataset/${AADC.uuid}/object/download?prefix=${encodeURIComponent(objectName)}`;

const fetchJson = async (url) => {
    const response = await fetch(url, {
        headers: { "user-agent": "Elements lunar benchmark curator/1.0" },
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.json();
};

const fetchBytes = async (url) => {
    const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Elements lunar benchmark curator/1.0" },
    });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
};

const inspectFrame = async (bytes) => {
    const { data, info } = await sharp(bytes)
        .resize(180, 144, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const luminance = [];
    const chroma = [];
    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            const normalizedX = (x / info.width * AADC.imageWidth - AADC.opticalCenter[0]) /
                AADC.usableRadius;
            const normalizedY = (y / info.height * AADC.imageHeight - AADC.opticalCenter[1]) /
                AADC.usableRadius;
            if (normalizedX ** 2 + normalizedY ** 2 > 0.92 ** 2) continue;
            const offset = (y * info.width + x) * info.channels;
            const rgb = [data[offset], data[offset + 1], data[offset + 2]];
            luminance.push(
                (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255,
            );
            chroma.push((Math.max(...rgb) - Math.min(...rgb)) / 255);
        }
    }
    const mean = luminance.reduce((sum, value) => sum + value, 0) /
        Math.max(1, luminance.length);
    const variance = luminance.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0,
    ) / Math.max(1, luminance.length);
    const sorted = [...luminance].sort((left, right) => left - right);
    const percentile = (amount) => sorted[Math.round((sorted.length - 1) * amount)] ?? 0;
    return {
        meanLuminance: Number(mean.toFixed(4)),
        luminanceDeviation: Number(Math.sqrt(variance).toFixed(4)),
        p05: Number(percentile(0.05).toFixed(4)),
        p95: Number(percentile(0.95).toFixed(4)),
        meanChroma: Number((chroma.reduce((sum, value) => sum + value, 0) /
            Math.max(1, chroma.length)).toFixed(4)),
    };
};

const enumerateCandidates = (objects) => {
    const days = objects
        .map((entry) => entry.name)
        .filter((name) => /^20\d{2}\/20\d{6}\.mkv$/.test(name));
    const candidates = [];
    for (const objectName of days) {
        const dateCode = path.basename(objectName, ".mkv");
        const year = Number(dateCode.slice(0, 4));
        const month = Number(dateCode.slice(4, 6));
        const day = Number(dateCode.slice(6, 8));
        for (let hour = 0; hour < 24; hour += 1) {
            const date = new Date(Date.UTC(year, month - 1, day, hour));
            const sun = SunCalc.getPosition(date, AADC.latitude, AADC.longitude);
            const moon = SunCalc.getMoonPosition(date, AADC.latitude, AADC.longitude);
            const illumination = SunCalc.getMoonIllumination(date);
            const lunarAltitude = degrees(moon.altitude);
            const solarAltitude = degrees(sun.altitude);
            if (lunarAltitude < 4 || illumination.fraction < 0.025) continue;
            const phase = phaseClass(illumination.phase);
            candidates.push({
                objectName,
                dateCode,
                hour,
                date,
                year,
                phase,
                solarRegime: solarRegime(solarAltitude),
                altitudeClass: lunarAltitudeClass(lunarAltitude),
                solarAltitude,
                solarAzimuth: compassAzimuth(sun.azimuth),
                lunarAltitude,
                lunarAzimuth: compassAzimuth(moon.azimuth),
                lunarDistanceKilometers: moon.distance,
                lunarIllumination: illumination.fraction,
                lunarPhase: illumination.phase,
                sortKey: hash(`${dateCode}:${hour}`),
            });
        }
    }
    return candidates;
};

const selectDiverse = (candidates, target) => {
    const phaseGroups = new Map();
    for (const candidate of candidates) {
        const group = phaseGroups.get(candidate.phase) ?? new Map();
        const cell = `${candidate.solarRegime}:${candidate.altitudeClass}`;
        const entries = group.get(cell) ?? [];
        entries.push(candidate);
        group.set(cell, entries);
        phaseGroups.set(candidate.phase, group);
    }
    for (const group of phaseGroups.values()) {
        for (const entries of group.values()) {
            entries.sort((left, right) => left.sortKey - right.sortKey);
        }
    }
    const phases = [
        "waxingCrescent",
        "firstQuarter",
        "waxingGibbous",
        "full",
        "waningGibbous",
        "lastQuarter",
        "waningCrescent",
    ];
    const selected = [];
    const usedDates = new Set();
    let progress = true;
    while (selected.length < target && progress) {
        progress = false;
        for (const phase of phases) {
            const group = phaseGroups.get(phase);
            if (!group) continue;
            const cells = [...group.entries()].sort(([left], [right]) =>
                hash(`${phase}:${left}:${selected.length}`) -
                hash(`${phase}:${right}:${selected.length}`),
            );
            for (const [, entries] of cells) {
                const index = entries.findIndex((entry) => !usedDates.has(entry.dateCode));
                if (index < 0) continue;
                const [candidate] = entries.splice(index, 1);
                selected.push(candidate);
                usedDates.add(candidate.dateCode);
                progress = true;
                break;
            }
            if (selected.length >= target) break;
        }
    }
    return selected;
};

const extractAadcFrame = async (candidate) => {
    const id = `aadc-${candidate.dateCode}-${String(candidate.hour).padStart(2, "0")}`;
    const outputPath = path.join(AADC_DIRECTORY, `${id}.jpg`);
    const videoPath = path.join(TEMP_DIRECTORY, `${candidate.dateCode}.mkv`);
    const manifestName = `${candidate.objectName.slice(0, -4)}.mnf`;
    const [video, frameManifest] = await Promise.all([
        fetchBytes(downloadUrl(candidate.objectName)),
        fetchBytes(downloadUrl(manifestName)).then((bytes) => bytes.toString("utf8")),
    ]);
    await writeFile(videoPath, video);
    const expectedName = `${candidate.dateCode}_${String(candidate.hour).padStart(2, "0")}00_raw.jpg`;
    const frames = frameManifest.trim().split(/\r?\n/).filter(Boolean);
    const frameIndex = frames.findIndex((name) => name === expectedName);
    if (frameIndex < 0) {
        throw new Error(`${id}: ${expectedName} not listed in ${manifestName}`);
    }
    const result = spawnSync(
        "ffmpeg",
        [
            "-v", "error",
            "-i", videoPath,
            "-vf", `select=eq(n\\,${frameIndex})`,
            "-frames:v", "1",
            "-f", "image2pipe",
            "-vcodec", "mjpeg",
            "pipe:1",
        ],
        { maxBuffer: 12 * 1024 * 1024 },
    );
    await rm(videoPath, { force: true });
    if (result.status !== 0 || result.stdout.length < 2_000) {
        throw new Error(`${id}: ffmpeg extraction failed: ${result.stderr}`);
    }
    const optimized = await sharp(result.stdout)
        .jpeg({ quality: 91, chromaSubsampling: "4:4:4" })
        .toBuffer();
    await writeFile(outputPath, optimized);
    return {
        id,
        referenceImage: `/sky-benchmark/references/aadc/${id}.jpg`,
        imageStatistics: await inspectFrame(optimized),
    };
};

const rendererSettings = (candidate) => {
    const dark = clamp((-candidate.solarAltitude - 2) / 18);
    return {
        familyId: dark > 0.72 ? "violet-nocturne" :
            candidate.solarAltitude < -5 ? "marine-pearl" : "crystal-azure",
        // AADC has no per-frame meteorological classification. Keep a clean,
        // polar baseline instead of reverse-engineering renderer controls from
        // photographed luminance or color.
        atmosphereStyle: "crystal",
        aerosolType: "clean",
        cloudDensity: 0.08,
        composition: {
            aerosol: 0.07,
            humidity: 0.34,
            aerosolSize: 0.31,
            aerosolAbsorption: 0.025,
            observerAltitude: 0.008,
            inversion: 0.12,
            groundAlbedo: 0.74,
        },
    };
};

const main = async () => {
    await mkdir(AADC_DIRECTORY, { recursive: true });
    await mkdir(TEMP_DIRECTORY, { recursive: true });
    const objects = await fetchJson(
        `${AADC.apiBase}/dataset/${AADC.uuid}/objects?recursive=true&removeBasePath=true`,
    );
    const candidates = enumerateCandidates(objects);
    const selected = selectDiverse(candidates, TARGET_AADC_CASES);
    const cases = [];
    for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index];
        process.stdout.write(
            `[${index + 1}/${selected.length}] ${candidate.date.toISOString()} ` +
            `${candidate.phase} ${candidate.solarRegime}\n`,
        );
        try {
            const extracted = await extractAadcFrame(candidate);
            const sourceUrl = downloadUrl(candidate.objectName);
            cases.push({
                id: extracted.id,
                referenceClass: "atmosphericScene",
                sourceId: `${candidate.objectName}#${candidate.hour}`,
                source: {
                    id: AADC.id,
                    name: "Australian Antarctic Division Davis All-Sky Camera",
                    url: AADC.datasetUrl,
                    imageUrl: sourceUrl,
                    license: "CC BY 4.0",
                    acknowledgement:
                        "French, J. and Alexander, S. (2022), Australian Antarctic Data Centre, doi:10.26179/ca3s-ve64.",
                },
                referenceImage: extracted.referenceImage,
                capture: {
                    timestamp: candidate.date.toISOString(),
                    timestampConfidence: "frameManifest",
                    latitude: AADC.latitude,
                    longitude: AADC.longitude,
                    elevationMeters: AADC.elevationMeters,
                    viewDirection: "zenith",
                    viewAzimuth: candidate.lunarAzimuth,
                    horizontalFov: 92,
                    sourceHorizontalFov: 180,
                    sourceProjection: "fisheyeEquidistant",
                    comparisonProjection: "moonCenteredRectilinear",
                    exposureMilliseconds: null,
                    sensor: "Moonglow Technologies All-Sky-Cam",
                    sourceResolution: [AADC.imageWidth, AADC.imageHeight],
                    opticalCenter: AADC.opticalCenter,
                    usableRadius: AADC.usableRadius,
                },
                astronomy: {
                    solarAltitude: Number(candidate.solarAltitude.toFixed(4)),
                    solarAzimuth: Number(candidate.solarAzimuth.toFixed(4)),
                    lunarAltitude: Number(candidate.lunarAltitude.toFixed(4)),
                    lunarAzimuth: Number(candidate.lunarAzimuth.toFixed(4)),
                    lunarDistanceKilometers: Number(candidate.lunarDistanceKilometers.toFixed(1)),
                    lunarIllumination: Number(candidate.lunarIllumination.toFixed(5)),
                    lunarPhase: Number(candidate.lunarPhase.toFixed(5)),
                    phaseClass: candidate.phase,
                    solarRegime: candidate.solarRegime,
                    lunarAltitudeClass: candidate.altitudeClass,
                    ephemeris: "SunCalc topocentric approximation",
                },
                observed: {
                    condition: "unclassifiedPolarAllSky",
                    cloudCoverage: null,
                    cloudOpacity: null,
                    imageStatistics: extracted.imageStatistics,
                    atmosphericClassificationConfidence: "unclassified",
                },
                renderer: rendererSettings(candidate),
            });
        } catch (error) {
            console.warn(`Skipped ${candidate.date.toISOString()}: ${error.message}`);
        }
    }
    const manifest = {
        version: 2,
        generatedAt: new Date().toISOString(),
        methodology:
            "Deterministic, phase-balanced selection from exact UTC frame manifests. One frame per date is chosen across waxing/waning phase, solar-depression regime, lunar-altitude band, season, and year. Source fisheye frames are preserved; comparison views are generated separately so pixel metrics never compare incompatible projections.",
        sources: [
            {
                id: AADC.id,
                datasetUrl: AADC.datasetUrl,
                doi: "10.26179/ca3s-ve64",
                license: "CC BY 4.0",
                temporalCoverage: "2015-06-10/2021-12-31",
                cadence: "one source frame per minute; published lossless daily videos sampled hourly",
            },
        ],
        summary: {
            caseCount: cases.length,
            sourceCounts: { [AADC.id]: cases.length },
            phaseCounts: Object.fromEntries(
                [...new Set(cases.map((entry) => entry.astronomy.phaseClass))].map((phase) => [
                    phase,
                    cases.filter((entry) => entry.astronomy.phaseClass === phase).length,
                ]),
            ),
            solarRegimeCounts: Object.fromEntries(
                [...new Set(cases.map((entry) => entry.astronomy.solarRegime))].map((regime) => [
                    regime,
                    cases.filter((entry) => entry.astronomy.solarRegime === regime).length,
                ]),
            ),
            lunarAltitudeCounts: Object.fromEntries(
                [...new Set(cases.map((entry) => entry.astronomy.lunarAltitudeClass))].map((band) => [
                    band,
                    cases.filter((entry) => entry.astronomy.lunarAltitudeClass === band).length,
                ]),
            ),
        },
        cases,
    };
    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify(manifest.summary, null, 2));
};

await main();

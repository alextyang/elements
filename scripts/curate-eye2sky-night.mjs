#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

import sharp from "sharp";
import SunCalc from "suncalc";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data", "moon-benchmark.json");
const IMAGE_DIRECTORY = path.join(
    ROOT,
    "public",
    "sky-benchmark",
    "references",
    "eye2sky",
);
const STATION = {
    id: "OLUOL",
    latitude: 53.15348,
    longitude: 8.16192,
    elevationMeters: 36,
    opticalCenter: [1064.65, 1029.29],
    calibrationUrl:
        "https://eye2sky.de/data/asi/meta/OLUOL/OLUOL_20220603.yaml",
};
const FULL_MOON_DATES = [
    "2022-04-16",
    "2022-05-16",
    "2022-06-14",
    "2022-07-13",
    "2022-08-12",
    "2022-09-10",
    "2022-10-09",
    "2022-11-08",
    "2022-12-08",
    "2023-01-06",
    "2023-02-05",
    "2023-03-07",
];
const ARCHIVES = FULL_MOON_DATES.map((date) => ({
    date,
    url: `https://eye2sky.de/data/asi/imgs/${date.replaceAll("-", "/")}/ASI_${date.replaceAll("-", "")}_${STATION.id}.zip`,
}));

const degrees = (radians) => radians * 180 / Math.PI;
const compassAzimuth = (suncalcAzimuth) =>
    ((degrees(suncalcAzimuth) + 180) % 360 + 360) % 360;

const rangeFetch = async (url, start, end) => {
    const response = await fetch(url, {
        headers: {
            range: `bytes=${start}-${end}`,
            "user-agent": "Elements lunar benchmark curator/1.0",
        },
    });
    if (!response.ok && response.status !== 206) {
        throw new Error(`Range request failed for ${url}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
};

const archiveSize = async (url) => {
    const response = await fetch(url, { method: "HEAD" });
    if (!response.ok) throw new Error(`Unable to inspect ${url}: ${response.status}`);
    const length = Number(response.headers.get("content-length"));
    if (!Number.isFinite(length)) throw new Error(`Missing content length for ${url}`);
    return length;
};

const centralDirectory = async (url) => {
    const size = await archiveSize(url);
    const tailStart = Math.max(0, size - 131_072);
    const tail = await rangeFetch(url, tailStart, size - 1);
    let end = -1;
    for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
        if (tail.readUInt32LE(offset) === 0x06054b50) {
            end = offset;
            break;
        }
    }
    if (end < 0) throw new Error(`ZIP end record not found for ${url}`);
    const directorySize = tail.readUInt32LE(end + 12);
    const directoryOffset = tail.readUInt32LE(end + 16);
    const directory = await rangeFetch(
        url,
        directoryOffset,
        directoryOffset + directorySize - 1,
    );
    const entries = [];
    let offset = 0;
    while (offset + 46 <= directory.length) {
        if (directory.readUInt32LE(offset) !== 0x02014b50) break;
        const method = directory.readUInt16LE(offset + 10);
        const compressedSize = directory.readUInt32LE(offset + 20);
        const uncompressedSize = directory.readUInt32LE(offset + 24);
        const fileNameLength = directory.readUInt16LE(offset + 28);
        const extraLength = directory.readUInt16LE(offset + 30);
        const commentLength = directory.readUInt16LE(offset + 32);
        const localOffset = directory.readUInt32LE(offset + 42);
        const name = directory
            .subarray(offset + 46, offset + 46 + fileNameLength)
            .toString("utf8");
        entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
        offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return entries;
};

const extractEntry = async (url, entry) => {
    const header = await rangeFetch(url, entry.localOffset, entry.localOffset + 29);
    if (header.readUInt32LE(0) !== 0x04034b50) {
        throw new Error(`Invalid local ZIP header for ${entry.name}`);
    }
    const fileNameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataStart = entry.localOffset + 30 + fileNameLength + extraLength;
    const compressed = await rangeFetch(
        url,
        dataStart,
        dataStart + entry.compressedSize - 1,
    );
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return inflateRawSync(compressed);
    if (entry.method === 12) {
        const result = spawnSync("bzip2", ["-dc"], {
            input: compressed,
            maxBuffer: entry.uncompressedSize + 1024,
        });
        if (result.status === 0) return result.stdout;
        throw new Error(`bzip2 failed for ${entry.name}: ${result.stderr}`);
    }
    throw new Error(`Unsupported ZIP compression ${entry.method} for ${entry.name}`);
};

const timestampFromName = (name) => {
    const match = name.match(/(\d{8})(\d{6})_(\d+)\.jpg$/i);
    if (!match) return undefined;
    const [, date, time, exposure] = match;
    return {
        date: new Date(
            `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T` +
            `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`,
        ),
        exposureCode: Number(exposure),
        exposureMilliseconds: Number(exposure) / 1000,
    };
};

const selectLunarEntries = (entries) => {
    const candidates = entries
        .map((entry) => {
            const capture = timestampFromName(entry.name);
            if (!capture || capture.exposureCode < 70_000) return undefined;
            const sun = SunCalc.getPosition(
                capture.date,
                STATION.latitude,
                STATION.longitude,
            );
            const moon = SunCalc.getMoonPosition(
                capture.date,
                STATION.latitude,
                STATION.longitude,
            );
            return {
                entry,
                capture,
                sun,
                moon,
                solarAltitude: degrees(sun.altitude),
                lunarAltitude: degrees(moon.altitude),
            };
        })
        .filter((candidate) =>
            candidate && candidate.solarAltitude < -5 && candidate.lunarAltitude > 5,
        );
    if (!candidates.length) return [];
    const high = [...candidates].sort(
        (left, right) => right.lunarAltitude - left.lunarAltitude,
    )[0];
    const low = [...candidates]
        .filter((candidate) =>
            Math.abs(candidate.capture.date - high.capture.date) > 45 * 60_000,
        )
        .sort((left, right) =>
            Math.abs(left.lunarAltitude - 13) - Math.abs(right.lunarAltitude - 13),
        )[0];
    return [low, high].filter(Boolean).sort(
        (left, right) => left.capture.date - right.capture.date,
    );
};

const imageStatistics = async (bytes) => {
    const { data, info } = await sharp(bytes)
        .resize(160, 155, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const values = [];
    for (let y = 0; y < info.height; y += 1) {
        for (let x = 0; x < info.width; x += 1) {
            const nx = (x / info.width - 0.5) * 2;
            const ny = (y / info.height - 0.5) * 2;
            if (nx ** 2 + ny ** 2 > 0.84) continue;
            const offset = (y * info.width + x) * info.channels;
            values.push(
                (data[offset] * 0.2126 + data[offset + 1] * 0.7152 +
                    data[offset + 2] * 0.0722) / 255,
            );
        }
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const deviation = Math.sqrt(values.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0,
    ) / values.length);
    return {
        meanLuminance: Number(mean.toFixed(4)),
        luminanceDeviation: Number(deviation.toFixed(4)),
    };
};

const main = async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    manifest.cases = manifest.cases.filter(
        (entry) => entry.source.id !== "eye2sky-oluol",
    );
    await mkdir(IMAGE_DIRECTORY, { recursive: true });
    const cases = [];

    for (let archiveIndex = 0; archiveIndex < ARCHIVES.length; archiveIndex += 1) {
        const archive = ARCHIVES[archiveIndex];
        process.stdout.write(`[${archiveIndex + 1}/${ARCHIVES.length}] ${archive.date}\n`);
        try {
            const entries = await centralDirectory(archive.url);
            const selected = selectLunarEntries(entries);
            for (let index = 0; index < selected.length; index += 1) {
                const candidate = selected[index];
                const bytes = await extractEntry(archive.url, candidate.entry);
                const illumination = SunCalc.getMoonIllumination(candidate.capture.date);
                const id = `eye2sky-${archive.date.replaceAll("-", "")}-${index + 1}`;
                const fileName = `${id}.jpg`;
                const optimized = await sharp(bytes)
                    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
                    .toBuffer();
                await writeFile(path.join(IMAGE_DIRECTORY, fileName), optimized);
                const statistics = await imageStatistics(optimized);
                cases.push({
                    id,
                    referenceClass: "atmosphericScene",
                    sourceId: candidate.entry.name,
                    source: {
                        id: "eye2sky-oluol",
                        name: "DLR Eye2Sky All-Sky Imager, OLUOL",
                        url: "https://eye2sky.de/data/",
                        imageUrl: archive.url,
                        license: "CC BY-SA 3.0",
                        acknowledgement:
                            "Eye2Sky ASI image data, German Aerospace Center (DLR), station OLUOL.",
                    },
                    referenceImage: `/sky-benchmark/references/eye2sky/${fileName}`,
                    capture: {
                        timestamp: candidate.capture.date.toISOString(),
                        timestampConfidence: "filenameUtc",
                        latitude: STATION.latitude,
                        longitude: STATION.longitude,
                        elevationMeters: STATION.elevationMeters,
                        viewDirection: "zenith",
                        viewAzimuth: compassAzimuth(candidate.moon.azimuth),
                        horizontalFov: 92,
                        sourceHorizontalFov: 180,
                        sourceProjection: "calibratedFisheyePolynomial",
                        comparisonProjection: "moonCenteredRectilinear",
                        exposureMilliseconds: candidate.capture.exposureMilliseconds,
                        sensor: "EKO ASI-16 Q25",
                        sourceResolution: [2112, 2048],
                        opticalCenter: STATION.opticalCenter,
                        calibrationUrl: STATION.calibrationUrl,
                    },
                    astronomy: {
                        solarAltitude: Number(candidate.solarAltitude.toFixed(4)),
                        solarAzimuth: Number(compassAzimuth(candidate.sun.azimuth).toFixed(4)),
                        lunarAltitude: Number(candidate.lunarAltitude.toFixed(4)),
                        lunarAzimuth: Number(compassAzimuth(candidate.moon.azimuth).toFixed(4)),
                        lunarDistanceKilometers: Number(candidate.moon.distance.toFixed(1)),
                        lunarIllumination: Number(illumination.fraction.toFixed(5)),
                        lunarPhase: Number(illumination.phase.toFixed(5)),
                        phaseClass: "full",
                        solarRegime: candidate.solarAltitude < -18 ? "deepNight" :
                            candidate.solarAltitude < -12 ? "astronomicalTwilight" :
                                candidate.solarAltitude < -6 ? "nauticalTwilight" : "goldenCivil",
                        lunarAltitudeClass: candidate.lunarAltitude < 12 ? "horizon" :
                            candidate.lunarAltitude < 30 ? "low" :
                                candidate.lunarAltitude < 55 ? "mid" : "high",
                        ephemeris: "SunCalc topocentric approximation",
                    },
                    observed: {
                        condition: "fullMoonCalibratedAllSky",
                        cloudCoverage: null,
                        cloudOpacity: null,
                        imageStatistics: statistics,
                        atmosphericClassificationConfidence: "visualAuditPending",
                    },
                    renderer: {
                        familyId: "violet-nocturne",
                        atmosphereStyle: "crystal",
                        aerosolType: "maritime",
                        cloudDensity: 0.08,
                        composition: {
                            aerosol: 0.11,
                            humidity: 0.52,
                            aerosolSize: 0.38,
                            aerosolAbsorption: 0.04,
                            observerAltitude: 0.005,
                            inversion: 0.12,
                            groundAlbedo: 0.24,
                        },
                    },
                });
            }
        } catch (error) {
            console.warn(`Skipped ${archive.date}: ${error.message}`);
        }
    }

    manifest.cases.push(...cases);
    manifest.sources = manifest.sources.filter(
        (source) => source.id !== "eye2sky-oluol",
    );
    manifest.sources.push({
        id: "eye2sky-oluol",
        dataUrl: "https://eye2sky.de/data/asi/imgs",
        metadataUrl: STATION.calibrationUrl,
        documentationUrl: "https://eye2sky.de/data/data_description/",
        licenseUrl: "https://eye2sky.de/data/license/",
        license: "CC BY-SA 3.0",
        temporalCoverage: "2022-04/2023-03",
        exposure: "80 ms full-Moon night frames",
    });
    manifest.summary.caseCount = manifest.cases.length;
    manifest.summary.sourceCounts["eye2sky-oluol"] = cases.length;
    manifest.summary.phaseCounts.full = manifest.cases.filter(
        (entry) => entry.astronomy.phaseClass === "full",
    ).length;
    for (const field of ["solarRegime", "lunarAltitudeClass"]) {
        const summaryField = field === "solarRegime" ?
            "solarRegimeCounts" : "lunarAltitudeCounts";
        manifest.summary[summaryField] = Object.fromEntries(
            [...new Set(manifest.cases.map((entry) => entry.astronomy[field]))].map((value) => [
                value,
                manifest.cases.filter((entry) => entry.astronomy[field] === value).length,
            ]),
        );
    }
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Added ${cases.length} calibrated Eye2Sky lunar cases`);
};

await main();

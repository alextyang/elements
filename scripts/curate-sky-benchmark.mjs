#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import SunCalc from "suncalc";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "data", "sky-benchmark.json");

const GLOBE_OBSERVATIONS_URL =
    "https://observer.globe.gov/documents/19589576/60147054/CLOUDGAZE-TestData-GLOBEObs_2022-06-02_v1-0.csv";
const GLOBE_TYPES_URL =
    "https://observer.globe.gov/documents/19589576/60147054/CLOUDGAZE-TestData-CloudType_2022-06-06_v1-0.csv";
const GLOBE_TERMINATOR_URL =
    "https://observer.globe.gov/documents/19589576/60147054/2021_GLOBE_terminator_problem_cloud_data_2021-07-07_v2-0.csv";

const DIRECTIONS = {
    North: { azimuth: 0, key: "north" },
    East: { azimuth: 90, key: "east" },
    South: { azimuth: 180, key: "south" },
    West: { azimuth: 270, key: "west" },
};

const CONDITION_FIELDS = [
    ["dust", "Dust"],
    ["smokeHaze", "Smoke/Haze"],
    ["cumulonimbus", "Cumulonimbus"],
    ["cumulus", "Cumulus"],
    ["stratocumulus", "Stratocumulus"],
    ["stratus", "Altostratus/Stratus"],
    ["cirrocumulus", "Cirrocumulus/Altocumulus"],
    ["cirrus", "Cirrus/Cirrostratus"],
    ["contrails", "Contrails"],
    ["clear", "Clearsky"],
];

const QUOTAS = {
    clear: 16,
    cirrus: 12,
    cirrocumulus: 8,
    stratus: 8,
    stratocumulus: 10,
    cumulus: 14,
    cumulonimbus: 6,
    contrails: 6,
    smokeHaze: 10,
    dust: 6,
};

const fetchText = async (url) => {
    let lastStatus = "network error";
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(url, {
            headers: { "user-agent": "Elements sky benchmark curator/1.0" },
        }).catch(() => undefined);
        if (response?.ok) return response.text();
        lastStatus = response?.status ?? lastStatus;
        await new Promise((resolve) => setTimeout(resolve, 650 * (attempt + 1)));
    }
    throw new Error(`Unable to download ${url}: ${lastStatus}`);
};

const parseCsv = (source) => {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;

    for (let index = 0; index < source.length; index += 1) {
        const character = source[index];
        if (character === '"') {
            if (quoted && source[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(value);
            value = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && source[index + 1] === "\n") index += 1;
            row.push(value);
            value = "";
            if (row.some(Boolean)) rows.push(row);
            row = [];
        } else {
            value += character;
        }
    }
    if (value || row.length) {
        row.push(value);
        rows.push(row);
    }

    const [headers, ...data] = rows;
    return data.map((values) =>
        Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
};

const number = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));

const hash = (value) => {
    let result = 2166136261;
    for (const character of value) {
        result ^= character.charCodeAt(0);
        result = Math.imul(result, 16777619);
    }
    return result >>> 0;
};

const phaseForAltitude = (altitude) => {
    if (altitude < -12) return "night";
    if (altitude < -6) return "blueHour";
    if (altitude < -0.833) return "civilTwilight";
    if (altitude < 8) return "golden";
    if (altitude < 25) return "lowDay";
    if (altitude < 50) return "midDay";
    return "highDay";
};

const coverageFraction = (row) => {
    const reported = number(String(row["Total Cloud Cover %"]).replace("%", ""), -1);
    if (reported >= 0) return clamp(reported / 100);
    const label = row["Total Cloud Cover"]?.toLowerCase();
    return {
        none: 0,
        clear: 0,
        isolated: 0.12,
        scattered: 0.36,
        broken: 0.7,
        overcast: 0.96,
    }[label] ?? 0.35;
};

const opacityValue = (row) => {
    const values = ["High Cloud Opacity", "Mid Cloud Opacity", "Low Cloud Opacity"]
        .map((field) => row[field]?.toLowerCase())
        .filter(Boolean)
        .map((value) => ({ transparent: 0.2, translucent: 0.5, opaque: 0.9 })[value] ?? 0.45);
    return values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0.42;
};

const classify = (typeRow, direction, observation) => {
    if (number(observation.Dust) > 0 || number(observation.Sand) > 0) return "dust";
    if (
        number(observation.Smoke) > 0 ||
        number(observation.Haze) > 0 ||
        number(observation.Fog) > 0
    ) {
        return "smokeHaze";
    }
    for (const [key, suffix] of CONDITION_FIELDS) {
        if (number(typeRow[`${direction} ${suffix}`]) > 0) return key;
    }
    return undefined;
};

const classifyObservation = (observation) => {
    if (number(observation.Dust) > 0 || number(observation.Sand) > 0) return "dust";
    if (
        number(observation.Smoke) > 0 ||
        number(observation.Haze) > 0 ||
        number(observation.Fog) > 0
    ) return "smokeHaze";
    if (number(observation.Cumulonimbus) > 0) return "cumulonimbus";
    if (number(observation.Cumulus) > 0) return "cumulus";
    if (number(observation.Stratocumulus) > 0) return "stratocumulus";
    if (number(observation.Stratus) > 0 || number(observation.Altostratus) > 0) return "stratus";
    if (number(observation.Cirrocumulus) > 0 || number(observation.Altocumulus) > 0) return "cirrocumulus";
    if (number(observation.Cirrus) > 0 || number(observation.Cirrostratus) > 0) return "cirrus";
    if (
        number(observation["Short Lived Contrails"]) > 0 ||
        number(observation["Spreading Contrails"]) > 0 ||
        number(observation["Non Spreading Contrails"]) > 0
    ) return "contrails";
    return "clear";
};

const regionFor = (latitude, longitude) => {
    const absolute = Math.abs(latitude);
    if (absolute < 23.5) return "tropical";
    if (absolute > 58) return "polar";
    if (
        (longitude > -25 && longitude < 55 && latitude > 18 && latitude < 40) ||
        (longitude > 110 && longitude < 155 && latitude < -18 && latitude > -38)
    ) {
        return "dry";
    }
    return "continental";
};

const rendererCloudType = (condition) => ({
    clear: "none",
    cirrus: "cirrus",
    contrails: "cirrus",
    cirrocumulus: "cirrocumulus",
    stratus: "stratus",
    stratocumulus: "stratocumulus",
    cumulus: "cumulus",
    cumulonimbus: "cumulonimbus",
    smokeHaze: "none",
    dust: "none",
}[condition] ?? "none");

const rendererMatch = ({ condition, observation, cloudCoverage, cloudOpacity, elevation }) => {
    const reportedHumidity = number(observation["Surface Relative Humidity %"], -1);
    const humidity = reportedHumidity >= 0
        ? clamp(reportedHumidity / 100)
        : clamp(0.38 + cloudCoverage * 0.34 + (condition === "smokeHaze" ? 0.16 : 0));
    const altitude = clamp(Math.max(0, elevation) / 3500, 0, 1);
    const base = {
        cloudDensity: clamp(0.18 + cloudCoverage * 2.3 + cloudOpacity * 0.24, 0.12, 3),
        cloudType: rendererCloudType(condition),
        cloudCoverage: condition === "clear" || condition === "smokeHaze" || condition === "dust"
            ? 0
            : cloudCoverage,
        cloudOpticalDepth: condition === "clear" || condition === "smokeHaze" || condition === "dust"
            ? 0
            : clamp(cloudOpacity * (condition === "cirrus" || condition === "contrails" ? 0.62 : 1)),
        composition: {
            humidity,
            observerAltitude: altitude,
            groundAlbedo: number(observation["Surface Snow/Ice"]) > 0 ? 0.78 : 0.22,
        },
    };

    if (condition === "dust") {
        return {
            ...base,
            familyId: "saharan-veil",
            atmosphereStyle: "haze",
            aerosolType: "dust",
            composition: {
                ...base.composition,
                aerosol: 0.82,
                aerosolSize: 0.78,
                aerosolAbsorption: 0.18,
                inversion: 0.42,
            },
        };
    }
    if (condition === "smokeHaze") {
        const smoke = number(observation.Smoke) > 0;
        return {
            ...base,
            familyId: smoke ? "smoky-copper" : "sage-haze",
            atmosphereStyle: number(observation.Fog) > 0 ? "mist" : "haze",
            aerosolType: smoke ? "smoke" : "pollution",
            composition: {
                ...base.composition,
                aerosol: smoke ? 0.74 : 0.58,
                aerosolSize: smoke ? 0.34 : 0.62,
                aerosolAbsorption: smoke ? 0.62 : 0.24,
                inversion: number(observation.Fog) > 0 ? 0.72 : 0.48,
            },
        };
    }
    if (condition === "clear") {
        return {
            ...base,
            familyId: altitude > 0.3 ? "winter-ice" : "post-storm-cerulean",
            atmosphereStyle: "crystal",
            aerosolType: "clean",
            cloudDensity: 0.08,
            cloudCoverage: 0,
            cloudOpticalDepth: 0,
            composition: {
                ...base.composition,
                aerosol: 0.08 + humidity * 0.08,
                aerosolSize: 0.16,
                aerosolAbsorption: 0.03,
                inversion: 0.03,
            },
        };
    }
    if (condition === "cirrus" || condition === "contrails") {
        return {
            ...base,
            familyId: "marine-pearl",
            atmosphereStyle: "cirrus",
            aerosolType: "clean",
            composition: {
                ...base.composition,
                aerosol: 0.16,
                aerosolSize: 0.2,
                aerosolAbsorption: 0.04,
            },
        };
    }
    if (condition === "cumulonimbus") {
        return {
            ...base,
            familyId: "storm-slate",
            atmosphereStyle: "soft",
            aerosolType: "maritime",
            cloudDensity: clamp(1.4 + cloudCoverage * 1.5, 1.4, 3),
            composition: {
                ...base.composition,
                aerosol: 0.36,
                aerosolSize: 0.52,
                aerosolAbsorption: 0.08,
                inversion: 0.18,
            },
        };
    }
    if (condition === "stratus" || condition === "stratocumulus") {
        return {
            ...base,
            familyId: condition === "stratus" ? "coastal-silver" : "monsoon-pewter",
            atmosphereStyle: condition === "stratus" ? "mist" : "soft",
            aerosolType: "maritime",
            composition: {
                ...base.composition,
                aerosol: 0.32,
                aerosolSize: 0.58,
                aerosolAbsorption: 0.05,
                inversion: condition === "stratus" ? 0.68 : 0.34,
            },
        };
    }
    return {
        ...base,
        familyId: condition === "cirrocumulus" ? "marine-pearl" : "humid-aqua",
        atmosphereStyle: condition === "cirrocumulus" ? "cirrus" : "soft",
        aerosolType: "maritime",
        composition: {
            ...base.composition,
            aerosol: 0.2 + humidity * 0.16,
            aerosolSize: 0.38,
            aerosolAbsorption: 0.04,
            inversion: 0.1,
        },
    };
};

const diverseSelection = (candidates, quota) => {
    const strata = new Map();
    for (const candidate of candidates) {
        const latitudeBand = Math.floor((candidate.latitude + 90) / 30);
        const key = `${candidate.phase}:${candidate.direction}:${latitudeBand}`;
        const stratum = strata.get(key) ?? [];
        stratum.push(candidate);
        strata.set(key, stratum);
    }
    for (const stratum of strata.values()) {
        stratum.sort((left, right) => left.sortKey - right.sortKey);
    }
    const selected = [];
    const usedObservations = new Set();
    const ordered = [...strata.entries()].sort(([left], [right]) => hash(left) - hash(right));
    let progress = true;
    while (selected.length < quota && progress) {
        progress = false;
        for (const [, stratum] of ordered) {
            const index = stratum.findIndex(
                (candidate) => !usedObservations.has(candidate.observationId),
            );
            const candidate = index >= 0 ? stratum.splice(index, 1)[0] : stratum.shift();
            if (!candidate) continue;
            selected.push(candidate);
            usedObservations.add(candidate.observationId);
            progress = true;
            if (selected.length >= quota) break;
        }
    }
    return selected;
};

const main = async () => {
    const [observationCsv, typeCsv, terminatorCsv] = await Promise.all([
        fetchText(GLOBE_OBSERVATIONS_URL),
        fetchText(GLOBE_TYPES_URL),
        fetchText(GLOBE_TERMINATOR_URL),
    ]);
    const observations = parseCsv(observationCsv);
    const typeRows = new Map(
        parseCsv(typeCsv).map((row) => [row["Observation Number"], row]),
    );

    const candidatesByCondition = new Map(
        Object.keys(QUOTAS).map((condition) => [condition, []]),
    );

    for (const observation of observations) {
        const observationId = observation["Observation Id"];
        const typeRow = typeRows.get(observationId);
        if (!typeRow) continue;
        const latitude = number(observation["Observation Latitude"]);
        const longitude = number(observation["Observation Longitude"]);
        const elevation = Math.max(0, number(observation["Observation Elevation"]));
        const timestamp = new Date(
            `${observation["Measurement Date (UTC)"]}T${observation["Measurement Time (UTC)"]}Z`,
        );
        if (Number.isNaN(timestamp.getTime())) continue;
        const sun = SunCalc.getPosition(timestamp, latitude, longitude);
        const solarAltitude = sun.altitude * 180 / Math.PI;
        const solarAzimuth = ((sun.azimuth * 180 / Math.PI + 180) % 360 + 360) % 360;
        const cloudCoverage = coverageFraction(observation);
        const cloudOpacity = opacityValue(observation);

        for (const [direction, directionMeta] of Object.entries(DIRECTIONS)) {
            const imageUrl = typeRow[`${direction} Image URL`] || observation[`Ground Image ${direction}`];
            const agreement = number(typeRow[`${direction} Agreement`]);
            const classificationCount = number(typeRow[`${direction} Classification Count`]);
            if (!imageUrl || agreement < 0.65 || classificationCount < 5) continue;
            const condition = classify(typeRow, direction, observation);
            if (!condition || !candidatesByCondition.has(condition)) continue;

            candidatesByCondition.get(condition).push({
                observationId,
                imageUrl,
                timestamp: timestamp.toISOString(),
                latitude,
                longitude,
                elevation,
                direction: directionMeta.key,
                viewAzimuth: directionMeta.azimuth,
                solarAltitude,
                solarAzimuth,
                phase: phaseForAltitude(solarAltitude),
                condition,
                agreement,
                classificationCount,
                cloudCoverage,
                cloudOpacity,
                region: regionFor(latitude, longitude),
                renderer: rendererMatch({
                    condition,
                    observation,
                    cloudCoverage,
                    cloudOpacity,
                    elevation,
                }),
                measured: {
                    reportedCloudCover: observation["Total Cloud Cover"] || null,
                    reportedCloudCoverPercent: observation["Total Cloud Cover %"] || null,
                    highCloudOpacity: observation["High Cloud Opacity"] || null,
                    midCloudOpacity: observation["Mid Cloud Opacity"] || null,
                    lowCloudOpacity: observation["Low Cloud Opacity"] || null,
                    relativeHumidityPercent:
                        number(observation["Surface Relative Humidity %"], -1) >= 0
                            ? number(observation["Surface Relative Humidity %"])
                            : null,
                    satelliteSolarZenith: number(observation["GEO Szen"], -1) >= 0
                        ? number(observation["GEO Szen"])
                        : null,
                },
                sortKey: hash(`${observationId}:${direction}`),
            });
        }
    }

    const selected = [];
    for (const [condition, quota] of Object.entries(QUOTAS)) {
        selected.push(...diverseSelection(candidatesByCondition.get(condition), quota));
    }

    const terminatorCandidates = [];
    for (const observation of parseCsv(terminatorCsv)) {
        const observationId = String(observation["Observation Number"]);
        const latitude = number(observation["Observation Latitude"]);
        const longitude = number(observation["Observation Longitude"]);
        const elevation = Math.max(0, number(observation["Observation Elevation"]));
        const timestamp = new Date(
            `${observation["Measurement Date (UTC)"]}T${observation["Measurement Time (UTC)"]}Z`,
        );
        if (Number.isNaN(timestamp.getTime())) continue;
        const sun = SunCalc.getPosition(timestamp, latitude, longitude);
        const solarAltitude = sun.altitude * 180 / Math.PI;
        if (solarAltitude < -14 || solarAltitude > 7) continue;
        const solarAzimuth = ((sun.azimuth * 180 / Math.PI + 180) % 360 + 360) % 360;
        const cloudCoverage = coverageFraction(observation);
        const cloudOpacity = opacityValue(observation);
        const condition = classifyObservation(observation);
        for (const [direction, directionMeta] of Object.entries(DIRECTIONS)) {
            const imageUrl = observation[`Ground Image ${direction}`];
            if (!imageUrl) continue;
            terminatorCandidates.push({
                observationId: `terminator-${observationId}`,
                imageUrl,
                timestamp: timestamp.toISOString(),
                latitude,
                longitude,
                elevation,
                direction: directionMeta.key,
                viewAzimuth: directionMeta.azimuth,
                solarAltitude,
                solarAzimuth,
                phase: phaseForAltitude(solarAltitude),
                condition,
                agreement: null,
                classificationCount: null,
                cloudCoverage,
                cloudOpacity,
                region: regionFor(latitude, longitude),
                renderer: rendererMatch({
                    condition,
                    observation,
                    cloudCoverage,
                    cloudOpacity,
                    elevation,
                }),
                measured: {
                    reportedCloudCover: observation["Total Cloud Cover"] || null,
                    reportedCloudCoverPercent: observation["Total Cloud Cover %"] || null,
                    highCloudOpacity: observation["High Cloud Opacity"] || null,
                    midCloudOpacity: observation["Mid Cloud Opacity"] || null,
                    lowCloudOpacity: observation["Low Cloud Opacity"] || null,
                    relativeHumidityPercent:
                        number(observation["Surface Relative Humidity %"], -1) >= 0
                            ? number(observation["Surface Relative Humidity %"])
                            : null,
                    satelliteSolarZenith: number(observation["GEO Szen"], -1) >= 0
                        ? number(observation["GEO Szen"])
                        : null,
                },
                sortKey: hash(`terminator:${observationId}:${direction}`),
            });
        }
    }
    selected.push(...diverseSelection(terminatorCandidates, 24));
    selected.sort((left, right) =>
        left.phase.localeCompare(right.phase) ||
        left.condition.localeCompare(right.condition) ||
        left.timestamp.localeCompare(right.timestamp),
    );

    const cases = selected.map((candidate, index) => ({
        id: `globe-${String(index + 1).padStart(3, "0")}`,
        sourceId: candidate.observationId,
        source: {
            name: "NASA GLOBE Clouds / CLOUD GAZE",
            url: "https://observer.globe.gov/get-data/clouds-data",
            license: "Free for research, publications, and commercial applications with requested acknowledgement",
            acknowledgement:
                "These data were obtained from the Zooniverse online platform, the GLOBE Program and NASA Langley Research Center.",
        },
        referenceImage: candidate.imageUrl,
        capture: {
            timestamp: candidate.timestamp,
            latitude: candidate.latitude,
            longitude: candidate.longitude,
            elevationMeters: candidate.elevation,
            viewDirection: candidate.direction,
            viewAzimuth: candidate.viewAzimuth,
            horizontalFov: 64,
            viewElevation: 24,
            verticalFov: 48,
            projection: "rectilinear",
        },
        observed: {
            condition: candidate.condition,
            phase: candidate.phase,
            solarAltitude: Number(candidate.solarAltitude.toFixed(3)),
            solarAzimuth: Number(candidate.solarAzimuth.toFixed(3)),
            cloudCoverage: Number(candidate.cloudCoverage.toFixed(3)),
            cloudOpacity: Number(candidate.cloudOpacity.toFixed(3)),
            classificationAgreement: candidate.agreement ?? null,
            classificationCount: candidate.classificationCount ?? null,
            region: candidate.region,
            ...candidate.measured,
        },
        renderer: candidate.renderer,
    }));

    const counts = Object.fromEntries(
        Object.keys(QUOTAS).map((condition) => [
            condition,
            cases.filter((entry) => entry.observed.condition === condition).length,
        ]),
    );
    const manifest = {
        version: 1,
        generatedAt: new Date().toISOString(),
        methodology:
            "Balanced, deterministic selection across cloud/aerosol class, solar-altitude regime, camera direction, and latitude band. Only direction images with CLOUD GAZE agreement >= 0.65 and at least five classifications are admitted.",
        sources: [
            {
                id: "globe-cloud-gaze",
                observationsUrl: GLOBE_OBSERVATIONS_URL,
                classificationsUrl: GLOBE_TYPES_URL,
                documentationUrl: "https://observer.globe.gov/documents/19589576/60147054/CLOUD%2BGAZE%2BData%2BDescription%2Bv2.0.pdf",
            },
            {
                id: "globe-terminator-problem",
                observationsUrl: GLOBE_TERMINATOR_URL,
                documentationUrl: "https://observer.globe.gov/get-data/clouds-data",
            },
        ],
        summary: {
            caseCount: cases.length,
            conditionCounts: counts,
            phaseCounts: Object.fromEntries(
                [...new Set(cases.map((entry) => entry.observed.phase))].map((phase) => [
                    phase,
                    cases.filter((entry) => entry.observed.phase === phase).length,
                ]),
            ),
        },
        cases,
    };

    await mkdir(path.dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${cases.length} curated cases to ${path.relative(ROOT, OUTPUT)}`);
    console.log(JSON.stringify(manifest.summary, null, 2));
};

await main();

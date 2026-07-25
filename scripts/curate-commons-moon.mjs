#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import SunCalc from "suncalc";
import tzlookup from "tz-lookup";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "data", "moon-benchmark.json");
const IMAGE_DIRECTORY = path.join(
    ROOT,
    "public",
    "sky-benchmark",
    "references",
    "commons",
);
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const TARGET_COUNT = Number(process.env.MOON_BENCHMARK_COMMONS_COUNT ?? 42);
const SEARCH_LIMIT = Number(process.env.MOON_BENCHMARK_COMMONS_SEARCH_LIMIT ?? 500);

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const degrees = (radians) => radians * 180 / Math.PI;
const compassAzimuth = (azimuth) =>
    ((degrees(azimuth) + 180) % 360 + 360) % 360;

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

const metadataMap = (imageInfo) => Object.fromEntries(
    (imageInfo.metadata ?? []).map((entry) => [entry.name, entry.value]),
);

const rational = (value) => {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return null;
    const match = value.match(/^(-?[\d.]+)(?:\/([\d.]+))?$/);
    if (!match) return null;
    return Number(match[1]) / Number(match[2] ?? 1);
};

const localTimestampToUtc = (timestamp, timezone) => {
    const match = timestamp.match(
        /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/,
    );
    if (!match) return undefined;
    const target = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] ?? 0),
    );
    let candidate = target;
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });
    for (let iteration = 0; iteration < 3; iteration += 1) {
        const parts = Object.fromEntries(
            formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]),
        );
        const represented = Date.UTC(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second),
        );
        candidate += target - represented;
    }
    return new Date(candidate);
};

const api = async (parameters) => {
    const url = new URL(COMMONS_API);
    for (const [key, value] of Object.entries(parameters)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await fetch(url, {
            headers: { "user-agent": "Elements lunar benchmark curator/1.0 (research benchmark)" },
        });
        if (response.ok) return response.json();
        if (response.status !== 429 || attempt === 4) {
            throw new Error(`${url}: ${response.status}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000 * (attempt + 1)));
    }
    throw new Error(`${url}: retry budget exhausted`);
};

const download = async (url) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const response = await fetch(url, {
            headers: { "user-agent": "Elements lunar benchmark curator/1.0 (research benchmark)" },
        });
        if (response.ok) return Buffer.from(await response.arrayBuffer());
        if (![429, 502, 503, 504].includes(response.status) || attempt === 5) {
            throw new Error(`image download failed (${response.status}): ${url}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 2_500 * (attempt + 1)));
    }
    throw new Error(`image download retry budget exhausted: ${url}`);
};

const searchCandidates = async () => {
    const searchResults = [];
    let offset = 0;
    while (searchResults.length < SEARCH_LIMIT) {
        const result = await api({
            action: "query",
            list: "search",
            srsearch: "haswbstatement:P180=Q405 haswbstatement:P1259",
            srnamespace: 6,
            srlimit: Math.min(100, SEARCH_LIMIT - searchResults.length),
            sroffset: offset || undefined,
            format: "json",
            formatversion: 2,
        });
        searchResults.push(...(result.query?.search ?? []));
        if (!result.continue?.sroffset) break;
        offset = result.continue.sroffset;
        await new Promise((resolve) => setTimeout(resolve, 1_200));
    }

    const pages = [];
    for (let index = 0; index < searchResults.length; index += 50) {
        const batch = searchResults.slice(index, index + 50);
        const result = await api({
            action: "query",
            pageids: batch.map((entry) => entry.pageid).join("|"),
            prop: "imageinfo",
            iiprop: "url|extmetadata|metadata|size|mime",
            iilimit: 1,
            iiurlwidth: 1600,
            format: "json",
            formatversion: 2,
        });
        pages.push(...(result.query?.pages ?? []));
        await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
    return pages;
};

const structuredLocations = async (pages) => {
    const locations = new Map();
    for (let index = 0; index < pages.length; index += 50) {
        const batch = pages.slice(index, index + 50);
        const result = await api({
            action: "wbgetentities",
            ids: batch.map((page) => `M${page.pageid}`).join("|"),
            props: "claims",
            format: "json",
            formatversion: 2,
        });
        for (const entity of Object.values(result.entities ?? {})) {
            const statement = entity.statements?.P1259?.find(
                (entry) => entry.mainsnak?.datavalue?.value,
            );
            const coordinate = statement?.mainsnak?.datavalue?.value;
            if (coordinate) locations.set(Number(entity.id.slice(1)), coordinate);
        }
        await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
    return locations;
};

const fovFromMetadata = (metadata, width, height) => {
    const focal35 = rational(metadata.FocalLengthIn35mmFilm);
    const focal = focal35 || rational(metadata.FocalLength);
    if (!focal || focal <= 0) return 54;
    const sensorWidth = focal35 ? 36 : 23.6;
    const landscapeWidth = width >= height ? sensorWidth : sensorWidth * width / height;
    return clamp(
        2 * Math.atan(landscapeWidth / (2 * focal)) * 180 / Math.PI,
        2,
        120,
    );
};

const inspectImage = async (bytes) => {
    const { data, info } = await sharp(bytes)
        .rotate()
        .resize(256, 192, { fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const luminance = [];
    const chroma = [];
    for (let offset = 0; offset < data.length; offset += info.channels) {
        const rgb = [data[offset], data[offset + 1], data[offset + 2]];
        luminance.push(
            (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) / 255,
        );
        chroma.push((Math.max(...rgb) - Math.min(...rgb)) / 255);
    }
    const mean = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    const deviation = Math.sqrt(luminance.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0,
    ) / luminance.length);
    return {
        meanLuminance: Number(mean.toFixed(4)),
        luminanceDeviation: Number(deviation.toFixed(4)),
        meanChroma: Number((chroma.reduce((sum, value) => sum + value, 0) /
            chroma.length).toFixed(4)),
    };
};

const buildCandidates = async () => {
    const pages = await searchCandidates();
    const locations = await structuredLocations(pages);
    const candidates = [];
    const audit = {
        searched: pages.length,
        structuredLocations: locations.size,
        jpegAndSized: 0,
        exactExifTime: 0,
        astronomicallyVisible: 0,
    };
    for (const page of pages) {
        const imageInfo = page.imageinfo?.[0];
        const coordinate = locations.get(page.pageid);
        if (/eclipse|eclisse|occultation|composite|montage|time.?lapse|sequence|blood moon|dogecoin|nokia|view of earth/i.test(page.title)) {
            continue;
        }
        if (!imageInfo?.thumburl || !coordinate || imageInfo.mime !== "image/jpeg") continue;
        if (imageInfo.width < 800 || imageInfo.height < 480) continue;
        audit.jpegAndSized += 1;
        const metadata = metadataMap(imageInfo);
        const localTimestamp = metadata.DateTimeOriginal || metadata.DateTimeDigitized;
        if (!localTimestamp) continue;
        audit.exactExifTime += 1;
        let timezone;
        try {
            timezone = tzlookup(coordinate.latitude, coordinate.longitude);
        } catch {
            continue;
        }
        const date = localTimestampToUtc(String(localTimestamp), timezone);
        if (!date || Number.isNaN(date.getTime())) continue;
        const sun = SunCalc.getPosition(date, coordinate.latitude, coordinate.longitude);
        const moon = SunCalc.getMoonPosition(date, coordinate.latitude, coordinate.longitude);
        const illumination = SunCalc.getMoonIllumination(date);
        const moonAltitude = degrees(moon.altitude);
        if (moonAltitude < -3) continue;
        audit.astronomicallyVisible += 1;
        const sunAltitude = degrees(sun.altitude);
        const fov = fovFromMetadata(metadata, imageInfo.width, imageInfo.height);
        const title = page.title.replace(/^File:/, "");
        candidates.push({
            page,
            imageInfo,
            metadata,
            coordinate,
            timezone,
            date,
            sun,
            moon,
            illumination,
            moonAltitude,
            sunAltitude,
            phase: phaseClass(illumination.phase),
            regime: solarRegime(sunAltitude),
            fov,
            fovBand: fov < 12 ? "telephoto" : fov < 42 ? "normal" : "wide",
            atmosphereTag: /cloud|mist|fog|haze|smog|storm/i.test(title) ? "cloudVeil" : "clearOrUnknown",
            sortKey: hash(`${page.pageid}:${title}`),
        });
    }
    audit.distinctCaptureDates = new Set(
        candidates.map((candidate) => candidate.date.toISOString().slice(0, 10)),
    ).size;
    console.log("Commons preflight", audit);
    return candidates;
};

const selectDiverse = (candidates, target) => {
    const cells = new Map();
    for (const candidate of candidates) {
        const key = `${candidate.phase}:${candidate.regime}:${candidate.fovBand}:${candidate.atmosphereTag}`;
        const entries = cells.get(key) ?? [];
        entries.push(candidate);
        cells.set(key, entries);
    }
    for (const entries of cells.values()) {
        entries.sort((left, right) => left.sortKey - right.sortKey);
    }
    const selected = [];
    const dateCounts = new Map();
    let progress = true;
    while (selected.length < target && progress) {
        progress = false;
        for (const [key, entries] of [...cells.entries()].sort(
            ([left], [right]) => hash(`${left}:${selected.length}`) - hash(`${right}:${selected.length}`),
        )) {
            while (entries.length) {
                const candidate = entries.shift();
                const dateKey = candidate.date.toISOString().slice(0, 10);
                if ((dateCounts.get(dateKey) ?? 0) >= 3) continue;
                selected.push(candidate);
                dateCounts.set(dateKey, (dateCounts.get(dateKey) ?? 0) + 1);
                progress = true;
                break;
            }
            if (!entries.length) cells.delete(key);
            if (selected.length >= target) break;
        }
    }
    return selected;
};

const rendererSettings = (candidate) => ({
    familyId: candidate.regime === "day" ? "crystal-azure" :
        candidate.regime === "goldenCivil" ? "marine-pearl" : "violet-nocturne",
    atmosphereStyle: candidate.atmosphereTag === "cloudVeil" ? "mist" : "crystal",
    aerosolType: "clean",
    cloudDensity: candidate.atmosphereTag === "cloudVeil" ? 0.48 : 0.08,
    composition: {
        aerosol: candidate.atmosphereTag === "cloudVeil" ? 0.16 : 0.1,
        humidity: candidate.atmosphereTag === "cloudVeil" ? 0.68 : 0.36,
        aerosolSize: 0.34,
        aerosolAbsorption: 0.035,
        observerAltitude: 0.04,
        inversion: 0.08,
        groundAlbedo: 0.2,
    },
});

const main = async () => {
    const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
    manifest.cases = manifest.cases.filter(
        (entry) => entry.source.id !== "wikimedia-commons-structured-moon",
    );
    await mkdir(IMAGE_DIRECTORY, { recursive: true });
    const selected = selectDiverse(await buildCandidates(), TARGET_COUNT);
    const cases = [];
    for (let index = 0; index < selected.length; index += 1) {
        const candidate = selected[index];
        const id = `commons-moon-${candidate.page.pageid}`;
        const fileName = `${id}.jpg`;
        let sourceBytes;
        try {
            const cached = path.join(IMAGE_DIRECTORY, fileName);
            sourceBytes = await access(cached).then(() => readFile(cached)).catch(
                () => download(candidate.imageInfo.thumburl),
            );
        } catch (error) {
            console.warn(`[${index + 1}/${selected.length}] ${error.message}`);
            continue;
        }
        const bytes = await sharp(sourceBytes)
            .rotate()
            .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
            .toBuffer();
        await writeFile(path.join(IMAGE_DIRECTORY, fileName), bytes);
        const statistics = await inspectImage(bytes);
        const metadata = candidate.metadata;
        const exposureSeconds = rational(metadata.ExposureTime);
        const focalLength = rational(metadata.FocalLength);
        const focalLength35 = rational(metadata.FocalLengthIn35mmFilm);
        cases.push({
            id,
            referenceClass: "contextualPhotograph",
            sourceId: candidate.page.title,
            source: {
                id: "wikimedia-commons-structured-moon",
                name: "Wikimedia Commons structured Moon photographs",
                url: candidate.imageInfo.descriptionurl,
                imageUrl: candidate.imageInfo.thumburl,
                license: candidate.imageInfo.extmetadata?.LicenseShortName?.value ?? "Commons free media",
                acknowledgement:
                    candidate.imageInfo.extmetadata?.AttributionRequired?.value === "true" ?
                        (candidate.imageInfo.extmetadata?.Artist?.value ?? "See source page for attribution") :
                        "See source page for author and reuse terms.",
            },
            referenceImage: `/sky-benchmark/references/commons/${fileName}`,
            capture: {
                timestamp: candidate.date.toISOString(),
                localTimestamp: String(metadata.DateTimeOriginal || metadata.DateTimeDigitized),
                timezone: candidate.timezone,
                timestampConfidence: "exifLocalTimeAndStructuredLocation",
                latitude: candidate.coordinate.latitude,
                longitude: candidate.coordinate.longitude,
                elevationMeters: candidate.coordinate.altitude ?? 0,
                viewDirection: "photographerComposition",
                viewAzimuth: compassAzimuth(candidate.moon.azimuth),
                horizontalFov: Number(candidate.fov.toFixed(3)),
                sourceHorizontalFov: Number(candidate.fov.toFixed(3)),
                sourceProjection: "rectilinear",
                comparisonProjection: "rectilinearComposition",
                exposureMilliseconds: exposureSeconds == null ? null : exposureSeconds * 1000,
                aperture: rational(metadata.FNumber),
                iso: rational(metadata.ISOSpeedRatings),
                focalLengthMillimeters: focalLength,
                focalLength35Millimeters: focalLength35,
                sensor: metadata.Model ?? metadata.Make ?? null,
                sourceResolution: [candidate.imageInfo.width, candidate.imageInfo.height],
            },
            astronomy: {
                solarAltitude: Number(candidate.sunAltitude.toFixed(4)),
                solarAzimuth: Number(compassAzimuth(candidate.sun.azimuth).toFixed(4)),
                lunarAltitude: Number(candidate.moonAltitude.toFixed(4)),
                lunarAzimuth: Number(compassAzimuth(candidate.moon.azimuth).toFixed(4)),
                lunarDistanceKilometers: Number(candidate.moon.distance.toFixed(1)),
                lunarIllumination: Number(candidate.illumination.fraction.toFixed(5)),
                lunarPhase: Number(candidate.illumination.phase.toFixed(5)),
                phaseClass: candidate.phase,
                solarRegime: candidate.regime,
                lunarAltitudeClass: candidate.moonAltitude < 12 ? "horizon" :
                    candidate.moonAltitude < 30 ? "low" :
                        candidate.moonAltitude < 55 ? "mid" : "high",
                ephemeris: "SunCalc topocentric approximation",
            },
            observed: {
                condition: candidate.atmosphereTag,
                cloudCoverage: null,
                cloudOpacity: null,
                imageStatistics: statistics,
                atmosphericClassificationConfidence: candidate.atmosphereTag === "cloudVeil" ?
                    "filenameKeyword" : "unclassified",
            },
            renderer: rendererSettings(candidate),
        });
        process.stdout.write(`[${index + 1}/${selected.length}] ${id}\n`);
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    manifest.cases.push(...cases);
    manifest.sources = manifest.sources.filter(
        (source) => source.id !== "wikimedia-commons-structured-moon",
    );
    manifest.sources.push({
        id: "wikimedia-commons-structured-moon",
        datasetUrl:
            "https://commons.wikimedia.org/w/index.php?search=haswbstatement%3AP180%3DQ405+haswbstatement%3AP1259&title=Special:MediaSearch&type=image",
        license: "Per-file free license recorded in the manifest",
        selection:
            "Depicts Moon (P180=Q405), structured location (P1259), EXIF local capture time, free Commons media",
    });
    manifest.summary.caseCount = manifest.cases.length;
    manifest.summary.sourceCounts["wikimedia-commons-structured-moon"] = cases.length;
    for (const [field, summaryField] of [
        ["phaseClass", "phaseCounts"],
        ["solarRegime", "solarRegimeCounts"],
        ["lunarAltitudeClass", "lunarAltitudeCounts"],
    ]) {
        manifest.summary[summaryField] = Object.fromEntries(
            [...new Set(manifest.cases.map((entry) => entry.astronomy[field]))].map((value) => [
                value,
                manifest.cases.filter((entry) => entry.astronomy[field] === value).length,
            ]),
        );
    }
    manifest.summary.referenceClassCounts = Object.fromEntries(
        [...new Set(manifest.cases.map((entry) => entry.referenceClass))].map((kind) => [
            kind,
            manifest.cases.filter((entry) => entry.referenceClass === kind).length,
        ]),
    );
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Added ${cases.length} structured contextual Moon photographs`);
};

await main();

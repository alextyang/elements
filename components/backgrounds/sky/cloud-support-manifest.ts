import {
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS,
} from "./cloud-morphology-photograph-qualification";
import {
    CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT,
    CLOUD_PHOTOGRAPHIC_QUALIFICATION_MANIFEST,
    CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT,
    CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT,
} from "./cloud-photographic-qualification-matrix";
import {
    WEATHER_QUALIFICATION_TARGETS,
    type WeatherQualificationTarget,
} from "./weather-qualification-matrix";
import {
    buildCloudSupportManifest,
    validateCloudSupportManifest,
    type CloudSupportClassificationSnapshot,
    type CloudSupportRouteDraft,
    type CloudSupportSourceStatus,
} from "./cloud-support-manifest-core";

const unique = (values: readonly string[]) => [...new Set(values)];

const titleCase = (value: string) => value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());

const requireEntry = <Value>(
    value: Value | undefined,
    id: string,
): Value => {
    if (!value) throw new Error(`Cloud support source ${id} did not resolve.`);
    return value;
};

const classificationSnapshot = (classification: {
    genus: string;
    species: string | null;
    varieties: readonly string[];
    supplementaryFeatures: readonly string[];
    accessoryClouds: readonly string[];
    origin: unknown;
}): CloudSupportClassificationSnapshot => ({
    genus: classification.genus,
    species: classification.species,
    varieties: [...classification.varieties],
    supplementaryFeatures: [...classification.supplementaryFeatures],
    accessoryClouds: [...classification.accessoryClouds],
    origin: classification.origin,
});

const baseRowsByReference = new Map<
    string,
    (typeof CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT)[number][]
>();
for (const row of CLOUD_SPECIES_PHOTOGRAPHIC_AUDIT) {
    const rows = baseRowsByReference.get(row.referenceId) ?? [];
    rows.push(row);
    baseRowsByReference.set(row.referenceId, rows);
}

const baseRoutes: CloudSupportRouteDraft[] = [...baseRowsByReference.values()]
    .map((rows) => {
        const first = requireEntry(rows[0], "base-reference");
        return {
            id: `base:${first.genus}:${first.species}`,
            catalog: "base",
            axis: "species",
            kind: "cloud",
            genus: first.genus,
            designation: first.species,
            label: `${titleCase(first.genus)} ${titleCase(first.species)}`,
            sourceStatus: "transport-attached",
            source: first.source,
            qualification: {
                caseCount: rows.length,
                environments: unique(rows.map(({ environmentId }) => environmentId)),
                perspectives: unique(rows.map(({ perspective }) => perspective)),
                invariantIds: unique(rows.flatMap(({ invariantIds }) => invariantIds)),
                cues: unique(rows.flatMap(({ expectedCues }) => expectedCues)),
            },
        };
    });

const morphologyTargetById = new Map(
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((target) => [target.id, target]),
);
const orthogonalRoutes: CloudSupportRouteDraft[] =
    CLOUD_MORPHOLOGY_PHOTOGRAPHIC_AUDIT.map((row) => {
        const target = requireEntry(morphologyTargetById.get(row.id), row.id);
        return {
            id: `orthogonal:${row.id}`,
            catalog: "orthogonal",
            axis: row.axis,
            kind: "cloud",
            genus: target.classification.genus,
            designation: String(row.designation),
            label: target.label,
            sourceStatus: "operator-active",
            source: target.reference.viewerUrl,
            classification: classificationSnapshot(target.classification),
            qualification: {
                caseCount: row.environmentIds.length *
                    row.perspectiveIds.length * row.coverageIds.length,
                environments: row.environmentIds,
                perspectives: row.perspectiveIds,
                coverages: row.coverageIds,
                invariantIds: row.invariantIds,
                cues: row.expectedCues,
            },
        };
    });

const weatherTargetById = new Map(
    WEATHER_QUALIFICATION_TARGETS.map((target) => [target.id, target]),
);

const weatherDesignation = (target: WeatherQualificationTarget): string => {
    switch (target.kind) {
        case "cloud":
            return target.classification.species ?? target.classification.genus;
        case "surface-obscuration":
            return target.obscuration;
        case "upper-atmospheric":
            return target.upperCloud;
        case "multilayer":
            return "multilayer";
    }
};

const weatherGenus = (target: WeatherQualificationTarget) =>
    target.kind === "cloud" ? target.classification.genus : null;

const weatherRoutes: CloudSupportRouteDraft[] =
    CLOUD_WEATHER_PHOTOGRAPHIC_AUDIT.map((row) => {
        const target = requireEntry(weatherTargetById.get(row.id), row.id);
        return {
            id: `weather:${row.id}`,
            catalog: "weather",
            axis: row.axis,
            kind: row.kind,
            genus: weatherGenus(target),
            designation: weatherDesignation(target),
            label: target.label,
            sourceStatus: row.implementation as CloudSupportSourceStatus,
            source: target.source,
            ...(target.kind === "cloud" ? {
                classification: classificationSnapshot(target.classification),
            } : {}),
            qualification: {
                caseCount: row.environmentIds.length * row.perspectiveIds.length,
                environments: row.environmentIds,
                perspectives: row.perspectiveIds,
                invariantIds: row.invariantIds,
                cues: row.expectedCues,
            },
        };
    });

export const CLOUD_SUPPORT_MANIFEST = buildCloudSupportManifest({
    taxonomy: CLOUD_PHOTOGRAPHIC_QUALIFICATION_MANIFEST.taxonomy,
    generatedFrom: [
        "components/backgrounds/sky/cloud-photograph-benchmark.ts",
        "components/backgrounds/sky/cloud-morphology-photograph-qualification.ts",
        "components/backgrounds/sky/cloud-photographic-qualification-matrix.ts",
        "components/backgrounds/sky/weather-qualification-matrix.ts",
    ],
    expectedCounts: {
        base: 32,
        orthogonal: 28,
        weather: 216,
        total: 276,
        genera: 10,
    },
    routes: [...baseRoutes, ...orthogonalRoutes, ...weatherRoutes],
});

export const CLOUD_SUPPORT_MANIFEST_ISSUES =
    validateCloudSupportManifest(CLOUD_SUPPORT_MANIFEST);

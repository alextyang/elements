import {
    CLOUD_PHOTOGRAPH_CASES,
} from "@/components/backgrounds/sky/cloud-photograph-benchmark";
import {
    CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS,
    cloudMorphologyPhotographCaseId,
} from "@/components/backgrounds/sky/cloud-morphology-photograph-qualification";
import {
    WEATHER_QUALIFICATION_TARGETS,
    type WeatherImplementationStatus,
    type WeatherQualificationAxis,
} from "@/components/backgrounds/sky/weather-qualification-matrix";
import {
    productionPerspectiveCameraSignature,
    weatherQualificationCaseId,
} from
    "@/components/backgrounds/sky/weather-cloud-photograph-benchmark";

export type MatrixScope = "canonical" | "complete-weather";
export type MatrixGroup = "base-species" |
    "variety" | "supplementary-feature" | "accessory-cloud" |
    "upper-atmospheric" | "exterior-boundary" | WeatherQualificationAxis;

export interface PreviewDefinition {
    id: string;
    caseId: string;
    title: string;
    detail: string;
    genus: string;
    group: MatrixGroup;
    scope: MatrixScope;
    captureParameter: "case" | "weather";
    qualificationUrl: string;
    implementation?: WeatherImplementationStatus;
    photographicEvidence: "photographically qualified" |
        "not photographically qualified";
    permutationCount: number;
    productionPerspective: string;
    productionCameraSignature: string;
}

export const titleCase = (value: string) => value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());

/**
 * The canonical static-preview catalogue. The background generator and the
 * read-only matrix use this same identity set; camera variation is deliberately
 * excluded, so every entry resolves through one production perspective.
 */
export const previewDefinitions = (
    productionPerspective: string,
): PreviewDefinition[] => {
    const baseByForm = new Map<string, typeof CLOUD_PHOTOGRAPH_CASES[number]>();
    for (const entry of CLOUD_PHOTOGRAPH_CASES) {
        const key = `${entry.genus}--${entry.species}`;
        if (!baseByForm.has(key) ||
            entry.environment.id === "day-oblique-natural") {
            baseByForm.set(key, entry);
        }
    }
    const base: PreviewDefinition[] = [...baseByForm.values()].map((entry) => ({
        id: `base:${entry.genus}:${entry.species}`,
        caseId: entry.id,
        title: entry.title,
        detail: entry.environment.label,
        genus: entry.genus,
        group: "base-species",
        scope: "canonical",
        captureParameter: "case",
        qualificationUrl: `/cloud-photographs?case=${encodeURIComponent(entry.id)}` +
            `&productionPerspective=${productionPerspective}`,
        photographicEvidence: "not photographically qualified",
        permutationCount: 5,
        productionPerspective,
        productionCameraSignature: productionPerspectiveCameraSignature(
            productionPerspective,
        ),
    }));
    const orthogonal: PreviewDefinition[] =
        CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS.map((target) => {
            const nativePerspective = target.perspectiveIds[0];
            const caseId = cloudMorphologyPhotographCaseId({
                targetId: target.id,
                environmentId: target.environmentIds[0],
                perspectiveId: nativePerspective,
                coverageId: target.coverageIds[0],
            });
            return {
                id: `orthogonal:${target.id}`,
                caseId,
                title: target.label,
                detail: `${titleCase(target.axis)} · ${target.environmentIds[0]}`,
                genus: target.classification.genus,
                group: target.axis,
                scope: "canonical",
                captureParameter: "case",
                qualificationUrl:
                    `/cloud-photographs?case=${encodeURIComponent(caseId)}` +
                    `&productionPerspective=${productionPerspective}`,
                photographicEvidence: "not photographically qualified",
                permutationCount: target.environmentIds.length *
                    target.perspectiveIds.length * target.coverageIds.length,
                productionPerspective,
                productionCameraSignature: productionPerspectiveCameraSignature(
                    productionPerspective,
                ),
            };
        });
    const weather: PreviewDefinition[] = WEATHER_QUALIFICATION_TARGETS.map(
        (target) => {
            const environmentId = target.environments[0];
            const nativePerspective = target.perspectives[0];
            const caseId = weatherQualificationCaseId({
                targetId: target.id,
                environmentId,
                perspectiveId: nativePerspective,
            });
            const genus = target.kind === "cloud"
                ? target.classification.genus : target.kind;
            return {
                id: `weather:${target.id}`,
                caseId,
                title: target.label,
                detail: `${titleCase(target.axis)} · ${environmentId}`,
                genus,
                group: target.axis,
                scope: "complete-weather",
                captureParameter: "weather",
                qualificationUrl:
                    `/cloud-photographs?weather=${encodeURIComponent(caseId)}` +
                    `&capture=render&productionPerspective=` +
                    encodeURIComponent(productionPerspective),
                implementation: target.implementation,
                photographicEvidence: target.implementation ===
                    "photographically-qualified"
                    ? "photographically qualified"
                    : "not photographically qualified",
                permutationCount: target.environments.length *
                    target.perspectives.length,
                productionPerspective,
                productionCameraSignature: productionPerspectiveCameraSignature(
                    productionPerspective,
                ),
            };
        },
    );
    return [...base, ...orthogonal, ...weather];
};


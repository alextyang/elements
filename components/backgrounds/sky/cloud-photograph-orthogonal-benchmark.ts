import {
    CLOUD_PHOTOGRAPH_CASES,
    type CloudPhotographCase,
    type EvaluationEnvironment,
} from "./cloud-photograph-benchmark";
import {
    applyMorphologyPhotographCaseToScene,
    resolveCloudMorphologyPhotographCase,
    type MorphologyPhotographCase,
} from "./cloud-morphology-photograph-qualification";
import { rendererSpeciesForClassification } from "./cloud-state-map";

export interface OrthogonalCloudPhotographCase extends CloudPhotographCase {
    morphologyCase: MorphologyPhotographCase;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const orthogonalEnvironment = (
    qualificationCase: MorphologyPhotographCase,
): EvaluationEnvironment => {
    const environment = qualificationCase.environment;
    const perspective = qualificationCase.perspective;
    const twilight = environment.lighting === "twilight";
    const moon = environment.lighting === "moon";
    const backlit = environment.lighting === "back";
    const humid = environment.relativeHumidity >= 0.75;
    return {
        id: environment.id,
        label: `${environment.label} · ${perspective.label}`,
        description: `${environment.purpose} ${perspective.purpose} ${qualificationCase.coverage.purpose}`,
        date: environment.date,
        latitude: environment.latitude,
        longitude: environment.longitude,
        // This bearing is editorial only. Date/location still own the source
        // positions, and atmosphere, celestial objects and clouds share the
        // physical camera projection below.
        viewAzimuth: backlit ? 270 : environment.lighting === "side" ? 55 : 180,
        viewElevation: perspective.viewElevationDegrees,
        horizontalFov: perspective.horizontalFieldOfViewDegrees,
        verticalFov: Math.min(72, Math.max(24,
            Math.round(perspective.horizontalFieldOfViewDegrees * 0.68))),
        perspective: perspective.range === "near" ? "wide"
            : perspective.range === "distant" ? "telephoto" : "natural",
        regime: perspective.range === "near" ? "nearby"
            : perspective.range === "distant" ? "distant" : "auto",
        familyId: moon ? "violet-nocturne"
            : twilight ? "rose-afterglow"
                : backlit ? "cobalt-gold"
                    : humid ? "humid-aqua" : "crystal-azure",
        atmosphereStyle: humid ? "soft" : backlit ? "haze" : "crystal",
        aerosolType: environment.aerosolType,
        composition: {
            aerosol: clamp01(environment.aerosolOpticalDepth * 1.55),
            humidity: environment.relativeHumidity,
            aerosolSize: environment.aerosolType === "maritime" ? 0.56
                : environment.aerosolType === "pollution" ? 0.36 : 0.22,
            aerosolAbsorption: environment.aerosolType === "pollution" ? 0.09 : 0.02,
            ozone: twilight ? 1.06 : 1,
            observerAltitude: perspective.observerAltitudeKm,
            inversion: humid ? 0.28 : 0.05,
            stratosphericAerosol: qualificationCase.target.axis === "upper-atmospheric"
                ? 0.03 : 0,
            groundAlbedo: Math.abs(environment.latitude) >= 60 ? 0.62 : 0.2,
        },
        ...(moon ? { nightExposure: -0.28 } : {}),
    };
};

/**
 * Resolve exactly one orthogonal case into the existing photographic preview
 * contract. This never enumerates the 400+ case matrix and never fetches its
 * reference image; the route's selected Reference component owns that load.
 */
export const resolveOrthogonalCloudPhotographCase = (
    caseId: string | null | undefined,
): OrthogonalCloudPhotographCase | undefined => {
    const morphologyCase = resolveCloudMorphologyPhotographCase(caseId);
    if (!morphologyCase) return undefined;
    const rendererSpecies = rendererSpeciesForClassification(
        morphologyCase.target.classification,
    );
    if (!rendererSpecies) return undefined;
    const base = CLOUD_PHOTOGRAPH_CASES.find((candidate) =>
        rendererSpeciesForClassification(candidate.classification) === rendererSpecies);
    if (!base?.preview.cloudScene) return undefined;
    const environment = orthogonalEnvironment(morphologyCase);
    return {
        id: morphologyCase.id,
        genus: morphologyCase.target.classification.genus,
        species: rendererSpecies,
        classification: morphologyCase.target.classification,
        title: morphologyCase.target.label,
        referenceImage: morphologyCase.reference.imageUrl,
        source: morphologyCase.reference.viewerUrl,
        credit: morphologyCase.reference.credit,
        cues: morphologyCase.target.cues.map((cue) => cue.pass),
        environment,
        morphologyCase,
        preview: {
            ...base.preview,
            date: new Date(environment.date),
            latitude: environment.latitude,
            longitude: environment.longitude,
            viewAzimuth: environment.viewAzimuth,
            viewElevation: environment.viewElevation,
            horizontalFov: environment.horizontalFov,
            verticalFov: environment.verticalFov,
            familyId: environment.familyId,
            atmosphereStyle: environment.atmosphereStyle,
            aerosolType: environment.aerosolType,
            composition: environment.composition,
            cloudScene: applyMorphologyPhotographCaseToScene(
                base.preview.cloudScene,
                morphologyCase,
            ),
            cloudPerspective: "natural",
            cloudEditorialRegime: environment.regime,
            nightExposure: environment.nightExposure,
        },
    };
};

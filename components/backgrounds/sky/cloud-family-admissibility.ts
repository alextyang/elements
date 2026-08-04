/**
 * Canonical CPU-side family admissibility gate.
 *
 * Renderer recipes are implementation keys, not permission to place any
 * condensate at any level. This bridge applies the physical envelopes already
 * qualified by the high-, middle-, low-, and upper-cloud foundations before a
 * state is allowed to become a runtime owner.
 */

import {
    CLOUD_GENUS_LEVEL,
    CLOUD_SPECIES_GENUS,
    type CloudLayerState,
    type CloudLevel,
    type CloudScene,
    type CloudSpecies,
} from "./cloud-scene";
import {
    HIGH_CLOUD_REACHABILITY_CONTRACTS,
    type HighCloudSpecies,
} from "./high-cloud-physical-foundation";
import {
    MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
    type MiddleCloudRepresentation,
} from "./middle-cloud-physical-foundation";
import {
    LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
    type LowLayeredCloudRepresentation,
} from "./low-layered-cloud-physical-foundation";
import {
    UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS,
    qualifyUpperAtmosphericAdmissibility,
    type UpperAtmosphericCloudRepresentation,
} from "./upper-atmospheric-cloud-foundation";
import type {
    CloudClassification,
    UpperAtmosphericCloud,
} from "./cloud-state-map";

export interface CloudFamilyAdmissibilityIssue {
    readonly code: string;
    readonly path: string;
    readonly message: string;
}

const LEVEL_BY_LAYER_INDEX: readonly CloudLevel[] = ["low", "middle", "high"];

const issue = (
    code: string,
    path: string,
    message: string,
): CloudFamilyAdmissibilityIssue => ({ code, path, message });

const paddedRange = (
    [minimum, maximum]: readonly [number, number],
    lowerFraction = 0.2,
    upperFraction = 0.25,
) => {
    const span = maximum - minimum;
    return [
        Math.max(0, minimum - span * lowerFraction),
        maximum + span * upperFraction,
    ] as const;
};

const outside = (value: number, range: readonly [number, number]) =>
    value < range[0] || value > range[1];

const envelope = (
    ranges: readonly (readonly [number, number])[],
) => [
    Math.min(...ranges.map((range) => range[0])),
    Math.max(...ranges.map((range) => range[1])),
] as const;

export const middleCloudRepresentationFor = (
    classification: CloudClassification | undefined,
    rendererSpecies: Exclude<CloudSpecies, "generic">,
): MiddleCloudRepresentation | undefined => {
    if (classification?.genus === "altostratus") {
        if (classification.supplementaryFeatures.includes("praecipitatio")) {
            return "altostratus-praecipitatio";
        }
        if (classification.varieties.includes("duplicatus")) {
            return "altostratus-duplicatus";
        }
        if (classification.varieties.includes("undulatus")) {
            return "altostratus-undulatus";
        }
        if (classification.varieties.includes("radiatus")) {
            return "altostratus-radiatus";
        }
        if (classification.varieties.includes("opacus")) {
            return "altostratus-opacus";
        }
        return "altostratus-translucidus";
    }
    return Object.hasOwn(
        MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
        rendererSpecies,
    ) ? rendererSpecies as MiddleCloudRepresentation : undefined;
};

export const lowLayeredCloudRepresentationFor = (
    classification: CloudClassification | undefined,
    rendererSpecies: Exclude<CloudSpecies, "generic">,
): LowLayeredCloudRepresentation | undefined => {
    if (classification?.genus === "nimbostratus") {
        if (classification.accessoryClouds.includes("pannus")) {
            return "nimbostratus-pannus";
        }
        if (classification.supplementaryFeatures.includes("praecipitatio")) {
            return "nimbostratus-praecipitatio";
        }
        if (classification.supplementaryFeatures.includes("virga")) {
            return "nimbostratus-virga";
        }
        return "nimbostratus";
    }
    return Object.hasOwn(
        LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
        rendererSpecies,
    ) ? rendererSpecies as LowLayeredCloudRepresentation : undefined;
};

export const cirrostratusRepresentationFor = (
    classification: CloudClassification | undefined,
    rendererSpecies: Exclude<CloudSpecies, "generic">,
): UpperAtmosphericCloudRepresentation | undefined => {
    if (classification?.genus === "cirrostratus") {
        if (classification.varieties.includes("duplicatus")) {
            return "cirrostratus-duplicatus";
        }
        if (classification.varieties.includes("undulatus")) {
            return "cirrostratus-undulatus";
        }
        if (classification.varieties.includes("radiatus")) {
            return "cirrostratus-radiatus";
        }
        if (classification.varieties.includes("translucidus")) {
            return "cirrostratus-translucidus";
        }
    }
    return rendererSpecies === "cirrostratus-fibratus" ||
        rendererSpecies === "cirrostratus-nebulosus"
        ? rendererSpecies : undefined;
};

export interface CloudLayerFamilyAdmissibilityInput {
    readonly layer: CloudLayerState;
    readonly layerIndex: number;
    readonly rendererSpecies: Exclude<CloudSpecies, "generic">;
    readonly classification?: CloudClassification;
}

/**
 * Qualify one authored tropospheric owner against its actual WMO level,
 * family scale, geometric depth, and bulk phase. Foundation ranges receive a
 * small climate/measurement margin; this is an impossibility gate rather than
 * a photographic preset clamp.
 */
export const qualifyCloudLayerFamilyAdmissibility = ({
    layer,
    layerIndex,
    rendererSpecies,
    classification,
}: CloudLayerFamilyAdmissibilityInput) => {
    const issues: CloudFamilyAdmissibilityIssue[] = [];
    const expectedLevel = LEVEL_BY_LAYER_INDEX[layerIndex];
    const genus = classification?.genus ?? layer.genus;
    if (!expectedLevel) {
        issues.push(issue(
            "invalid-layer-index",
            "layerIndex",
            `Cloud layer index ${layerIndex} is outside the low/middle/high state tuple.`,
        ));
        return { legal: false, issues };
    }
    if (genus === "clear" || CLOUD_GENUS_LEVEL[genus] !== expectedLevel) {
        issues.push(issue(
            "classification-level-mismatch",
            "classification.genus",
            `${genus} belongs to the ${CLOUD_GENUS_LEVEL[genus]} level, not layer ${layerIndex} (${expectedLevel}).`,
        ));
    }
    if (CLOUD_SPECIES_GENUS[rendererSpecies] !== genus) {
        issues.push(issue(
            "genus-species-mismatch",
            "species",
            `${rendererSpecies} belongs to ${CLOUD_SPECIES_GENUS[rendererSpecies]}, not ${genus}.`,
        ));
    }
    for (const [name, value] of Object.entries({
        baseAltitude: layer.baseAltitude,
        thickness: layer.thickness,
        iceFraction: layer.iceFraction,
    })) {
        if (!Number.isFinite(value)) {
            issues.push(issue(
                "non-finite-family-state",
                `layer.${name}`,
                `${name} must be finite before runtime compilation.`,
            ));
        }
    }
    if (layer.baseAltitude < 0) {
        issues.push(issue(
            "base-altitude-below-surface",
            "layer.baseAltitude",
            "Cloud base altitude cannot be below the surface datum.",
        ));
    }
    if (layer.thickness <= 0) {
        issues.push(issue(
            "non-positive-geometric-depth",
            "layer.thickness",
            "A present cloud owner requires positive geometric depth.",
        ));
    }
    if (layer.iceFraction < 0 || layer.iceFraction > 1) {
        issues.push(issue(
            "phase-fraction-outside-unit-interval",
            "layer.iceFraction",
            "Bulk ice fraction must remain between zero and one.",
        ));
    }

    const baseAltitudeKm = layer.baseAltitude / 1000;
    const geometricDepthKm = layer.thickness / 1000;
    let baseRange: readonly [number, number] | undefined;
    let depthRange: readonly [number, number] | undefined;
    let minimumIceFraction: number | undefined;

    if (Object.hasOwn(HIGH_CLOUD_REACHABILITY_CONTRACTS, rendererSpecies)) {
        const contract = HIGH_CLOUD_REACHABILITY_CONTRACTS[
            rendererSpecies as HighCloudSpecies
        ];
        baseRange = [4.5, 18];
        depthRange = [0.04, 6];
        minimumIceFraction = contract.minimumIceFraction;
    } else {
        const cirrostratus = cirrostratusRepresentationFor(
            classification,
            rendererSpecies,
        );
        const middle = middleCloudRepresentationFor(
            classification,
            rendererSpecies,
        );
        const low = lowLayeredCloudRepresentationFor(
            classification,
            rendererSpecies,
        );
        if (cirrostratus) {
            const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[cirrostratus];
            baseRange = paddedRange(descriptor.altitudeKm);
            depthRange = paddedRange(descriptor.geometricDepthKm);
            minimumIceFraction = 0.9;
        } else if (middle) {
            const descriptors = Object.values(
                MIDDLE_CLOUD_REPRESENTATION_DESCRIPTORS,
            ).filter((descriptor) => descriptor.genus === genus);
            baseRange = [1.5, 8];
            depthRange = paddedRange(envelope(
                descriptors.map((descriptor) => descriptor.geometricDepthKm),
            ));
        } else if (low) {
            const descriptors = Object.values(
                LOW_LAYERED_CLOUD_REPRESENTATION_DESCRIPTORS,
            ).filter((descriptor) => descriptor.genus === genus);
            baseRange = paddedRange(envelope(
                descriptors.map((descriptor) => descriptor.baseAltitudeKm),
            ));
            depthRange = paddedRange(envelope(
                descriptors.map((descriptor) => descriptor.geometricDepthKm),
            ));
        } else if (genus === "cumulus") {
            baseRange = [0.02, 4.5];
            depthRange = [0.04, 8];
        } else if (genus === "cumulonimbus") {
            baseRange = [0.02, 4];
            depthRange = [4, 18];
        }
    }

    if (baseRange && outside(baseAltitudeKm, baseRange)) {
        issues.push(issue(
            "base-altitude-outside-family-envelope",
            "layer.baseAltitude",
            `${genus} base ${baseAltitudeKm.toFixed(3)} km is outside ` +
            `${baseRange[0].toFixed(3)}-${baseRange[1].toFixed(3)} km.`,
        ));
    }
    if (depthRange && outside(geometricDepthKm, depthRange)) {
        issues.push(issue(
            "geometric-depth-outside-family-envelope",
            "layer.thickness",
            `${rendererSpecies} depth ${geometricDepthKm.toFixed(3)} km is outside ` +
            `${depthRange[0].toFixed(3)}-${depthRange[1].toFixed(3)} km.`,
        ));
    }
    if (
        minimumIceFraction !== undefined &&
        layer.iceFraction < minimumIceFraction
    ) {
        issues.push(issue(
            "phase-outside-family-envelope",
            "layer.iceFraction",
            `${rendererSpecies} requires an ice fraction of at least ` +
            `${minimumIceFraction.toFixed(2)}.`,
        ));
    }
    return { legal: issues.length === 0, issues };
};

export const upperRepresentationFor = (
    upper: Exclude<UpperAtmosphericCloud, "none">,
): UpperAtmosphericCloudRepresentation => upper === "nacreous"
    ? "nacreous-ice"
    : upper === "polar-stratospheric-nat"
        ? "polar-stratospheric-nat"
        : upper === "polar-stratospheric-ice"
            ? "polar-stratospheric-ice"
            : upper === "polar-stratospheric" ||
                upper === "polar-stratospheric-sts"
        ? "polar-stratospheric-sts"
        : "noctilucent";

const canonicalUpperDefaults = (
    upper: Exclude<UpperAtmosphericCloud, "none">,
) => upper === "noctilucent"
    ? { latitude: 60, season: 1, solarDepression: 10, temperature: 145 }
    : {
        latitude: 70,
        season: 0,
        solarDepression: 6,
        temperature: upper === "nacreous" ||
            upper === "polar-stratospheric-ice" ? 185
            : upper === "polar-stratospheric-nat" ? 191 : 196,
    };

/** Resolve and qualify an upper-atmosphere request before it creates an owner. */
export const qualifyUpperAtmosphericSceneState = (
    scene: CloudScene,
    upper: Exclude<UpperAtmosphericCloud, "none">,
) => {
    const defaults = canonicalUpperDefaults(upper);
    const latitude = scene.latitude ?? defaults.latitude;
    const season = scene.season ?? defaults.season;
    const solarDepression = scene.solarDepression ?? defaults.solarDepression;
    const temperature = upper === "noctilucent"
        ? scene.mesopauseTemperatureKelvin ?? defaults.temperature
        : scene.stratosphericTemperatureKelvin ?? defaults.temperature;
    const representation = upperRepresentationFor(upper);
    const descriptor = UPPER_ATMOSPHERIC_CLOUD_DESCRIPTORS[representation];
    const altitudeKm = (descriptor.altitudeKm[0] + descriptor.altitudeKm[1]) * 0.5;
    const localSummer = season >= 0.5;
    const northern = latitude >= 0;
    const month = localSummer
        ? northern ? 7 : 1
        : northern ? 1 : 7;
    const invalidInputs: string[] = [];
    if (!Number.isFinite(season) || season < 0 || season > 1) {
        invalidInputs.push("season-must-be-normalized");
    }
    if (!Number.isFinite(temperature) || temperature <= 0) {
        invalidInputs.push("upper-atmosphere-temperature-must-be-positive-and-finite");
    }
    const qualification = invalidInputs.length > 0
        ? { legal: false, violations: invalidInputs }
        : qualifyUpperAtmosphericAdmissibility({
            representation,
            latitudeDegrees: latitude,
            month,
            altitudeKm,
            temperatureKelvin: temperature,
            solarDepressionDegrees: solarDepression,
            viewElevationDegrees: upper === "noctilucent" ? 15 : 25,
            environment: "twilight-overhead",
            hasOrographicOrSevereStormGravityWave: true,
            hasCirrusRadiatusCompanion: true,
        });
    return {
        ...qualification,
        representation,
        altitudeKm,
        temperatureKelvin: temperature,
        absoluteLatitudeDegrees: Math.abs(latitude),
        season: localSummer ? "summer" as const : "winter" as const,
        solarDepressionDegrees: solarDepression,
    };
};

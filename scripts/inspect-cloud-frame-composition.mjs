#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
    transpileCloudPreviewModuleClosure,
} from "./lib/cloud-preview-scenarios.mjs";
import {
    decodeCloudAtlasVolume,
    projectCloudAtlasDensityProductionPerspective,
} from "./lib/cloud-atlas-projection-qualification.mjs";

const repositoryRoot = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const sourceRoot = join(repositoryRoot, "components/backgrounds/sky");
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-composition-audit-"));
const strict = process.argv.includes("--strict");
const atlasManifest = JSON.parse(readFileSync(join(
    repositoryRoot,
    "public/assets/sky/cloud-macro-atlas-v2.json",
), "utf8"));
const atlasBytes = readFileSync(join(
    repositoryRoot,
    "public/assets/sky/cloud-macro-atlas-v2-rgba8-48.bin",
));

const atlasVolumeForRecipe = (recipe, variant = 0) => {
    if (recipe === "nimbostratus-praecipitatio") return "ns-precipitating";
    const variants = recipe === "cirrus-fibratus"
        ? ["ci-fibratus", "ci-fibratus-depth-shear", "ci-fibratus-split-source"]
        : recipe === "cirrostratus-fibratus" ? ["cs-fibratus"]
            : recipe === "cirrostratus-nebulosus" ? ["cs-veil"]
                : recipe === "cirrocumulus-stratiformis"
                    ? ["cc-stratiformis", "cc-stratiformis-dispersive"]
                    : recipe === "stratocumulus-stratiformis"
                        ? ["sc-stratiformis"]
                        : [recipe
                            .replace(/^cirrus-/, "ci-")
                            .replace(/^cirrocumulus-/, "cc-")
                            .replace(/^altocumulus-/, "ac-")
                            .replace(/^altostratus-/, "as-")
                            .replace(/^nimbostratus-/, "ns-")
                            .replace(/^stratocumulus-/, "sc-")
                            .replace(/^stratus-/, "st-")
                            .replace(/^cumulonimbus-/, "cb-")
                            .replace(/^cumulus-/, "cu-")];
    return variants[Math.abs(variant) % variants.length];
};

const productionAtlasMaterialEvidence = (systems, camera) => {
    const width = 96;
    const height = 64;
    const threshold = atlasManifest.occupancy.densityByteThreshold / 255;
    const occupied = new Uint8Array(width * height);
    const ownerFractions = [];
    for (const system of systems) {
        const volumeId = atlasVolumeForRecipe(
            system.compiled.recipeId,
            system.atlasDeterministicVariant,
        );
        const decoded = decodeCloudAtlasVolume({
            atlas: atlasBytes,
            manifest: atlasManifest,
            volumeId,
        });
        const projection = projectCloudAtlasDensityProductionPerspective(decoded, {
            owner: {
                ...system.state.extent,
                orientationRadians: system.state.extent.orientation,
                baseAltitudeKm: system.compiled.geometry.baseAltitudeKm,
                geometricDepthKm: system.compiled.geometry.geometricDepthKm,
            },
            camera,
            outputWidth: width,
            outputHeight: height,
            samplesPerVoxel: 1,
            densityThreshold: threshold,
        });
        let ownerOccupied = 0;
        for (let index = 0; index < projection.maximum.length; index += 1) {
            if (projection.maximum[index] < threshold) continue;
            ownerOccupied += 1;
            occupied[index] = 1;
        }
        ownerFractions.push(ownerOccupied / (width * height));
    }
    const occupiedSamples = occupied.reduce((sum, value) => sum + value, 0);
    return {
        supportFraction: occupiedSamples / occupied.length,
        ownerFractions,
        occupiedSamples,
        sampledRays: occupied.length,
        source: "atlas-production-projection",
    };
};

try {
    transpileCloudPreviewModuleClosure({
        sourceRoot,
        temporaryRoot,
        rootModuleNames: [
            "cloud-system-runtime",
            "cloud-photograph-benchmark",
            "cloud-morphology-photograph-qualification",
            "cloud-photograph-orthogonal-benchmark",
        ],
    });
    const runtimeModule = await import(pathToFileURL(
        join(temporaryRoot, "cloud-system-runtime.mjs"),
    ).href);
    const benchmarkModule = await import(pathToFileURL(
        join(temporaryRoot, "cloud-photograph-benchmark.mjs"),
    ).href);
    const morphologyModule = await import(pathToFileURL(
        join(temporaryRoot, "cloud-morphology-photograph-qualification.mjs"),
    ).href);
    const orthogonalModule = await import(pathToFileURL(
        join(temporaryRoot, "cloud-photograph-orthogonal-benchmark.mjs"),
    ).href);

    const naturalBaseCases = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.filter(
        ({ id }) => id.endsWith("--day-oblique-natural"),
    );
    const orthogonalCases = morphologyModule.CLOUD_MORPHOLOGY_PHOTOGRAPH_TARGETS
        .map(({ id }) => {
            const morphologyCase = morphologyModule
                .iterateCloudMorphologyPhotographCases({
                    targetIds: [id],
                    smokeOnly: true,
                }).next().value;
            return orthogonalModule.resolveOrthogonalCloudPhotographCase(
                morphologyCase.id,
            );
        });
    const cases = [
        ...naturalBaseCases.map((entry) => ({ category: "base-species", entry })),
        ...orthogonalCases.map((entry) => ({
            category: entry.morphologyCase.target.axis,
            entry,
        })),
    ];
    if (cases.length !== 60) {
        throw new Error(`Expected 60 canonical cases, found ${cases.length}`);
    }

    const records = cases.map(({ category, entry }) => {
        const runtime = runtimeModule.createCloudSystemRuntime(
            entry.preview.cloudScene,
        );
        const owner = runtime.systems[0];
        const layerIndex = entry.morphologyCase?.target.assignment.layerIndex ??
            owner?.layerIndex ?? 0;
        const layer = entry.preview.cloudScene.layers[layerIndex];
        const productionCamera = {
            ...runtimeModule.CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS,
            observerAltitudeKm: 0,
        };
        const materialEvidence = productionAtlasMaterialEvidence(
            runtime.systems.filter((system) => system.layerIndex === layerIndex),
            productionCamera,
        );
        const qualification = runtimeModule.qualifyCloudFrameComposition({
            systems: runtime.systems.filter((system) =>
                system.layerIndex === layerIndex),
            layer,
            layerIndex,
            classification: entry.classification,
            materialEvidence,
        });
        return {
            category,
            id: entry.id,
            species: entry.species,
            ownerSpecies: runtime.systems[0]?.compiled.recipeId,
            layerIndex,
            semantic: qualification.contract.semantic,
            authoredCoverage: qualification.contract.authoredCoverage,
            authoredOktas: qualification.contract.authoredOktas,
            expectedSupport: qualification.contract.expectedSupport,
            supportFraction: qualification.projection.supportFraction,
            materialSupportFraction: qualification.materialSupportFraction,
            materialEvidenceSource: qualification.materialEvidence.source,
            visibleOwnerCount: qualification.projection.visibleOwnerCount,
            edgeContacts: qualification.projection.edgeContacts,
            ownerRadialRangesKm: runtime.systems
                .filter((system) => system.layerIndex === layerIndex)
                .map((system) => Number(Math.hypot(
                    system.state.extent.centerEastKm,
                    system.state.extent.centerNorthKm,
                ).toFixed(3))),
            ownerExtents: runtime.systems
                .filter((system) => system.layerIndex === layerIndex)
                .map((system) => ({
                    radialKm: Number(Math.hypot(
                        system.state.extent.centerEastKm,
                        system.state.extent.centerNorthKm,
                    ).toFixed(3)),
                    majorKm: Number(system.state.extent.majorRadiusKm.toFixed(3)),
                    minorKm: Number(system.state.extent.minorRadiusKm.toFixed(3)),
                })),
            cameraInside: qualification.cameraInside,
            population: qualification.population,
            valid: qualification.valid,
            violations: qualification.violations,
            diagnostics: runtime.diagnostics,
        };
    });
    const summary = {
        cases: records.length,
        valid: records.filter(({ valid }) => valid).length,
        invalid: records.filter(({ valid }) => !valid).length,
        byCategory: Object.fromEntries([...new Set(records.map(({ category }) => category))]
            .map((category) => [
                category,
                records.filter((record) => record.category === category).length,
        ])),
    };
    if (strict) {
        const expectedResidualIds = new Set();
        const actualResidualIds = new Set(records.filter(({ valid }) => !valid)
            .map(({ id }) => id));
        const sameResiduals = expectedResidualIds.size === actualResidualIds.size &&
            [...expectedResidualIds].every((id) => actualResidualIds.has(id));
        if (!sameResiduals) {
            throw new Error(
                `Strict composition residual mismatch: expected ` +
                `${[...expectedResidualIds].join(", ")}; actual ` +
                `${[...actualResidualIds].join(", ")}`,
            );
        }
    }
    console.log(JSON.stringify({
        productionFrame: runtimeModule.CLOUD_PRODUCTION_FRAME_COMPOSITION_OPTIONS,
        materialCaveat: "supportFraction is the finite owner-envelope projection; materialSupportFraction is generated-atlas occupancy evidence (fixed production atlas projection in this audit, deterministic profile fallback in runtime qualification), and authored coverage remains the contract expectation.",
        summary,
        records,
    }, null, 2));
} finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
}

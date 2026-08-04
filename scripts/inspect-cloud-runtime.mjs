import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

const sourceRoot = new URL("../components/backgrounds/sky/", import.meta.url);
const temporaryRoot = mkdtempSync(join(tmpdir(), "elements-cloud-inspect-"));
const moduleNames = [
    "cloud-scene",
    "cloud-state-map",
    "cloud-special-origin-source",
    "cloud-morphology-modifiers",
    "high-cloud-physical-foundation",
    "middle-cloud-physical-foundation",
    "low-layered-cloud-physical-foundation",
    "low-layered-cloud-topology-qualification",
    "upper-atmospheric-cloud-foundation",
    "cloud-family-admissibility",
    "cloud-family-production-adapter",
    "cloud-atlas-material-profile",
    "cloud-system-runtime",
    "cloud-photograph-benchmark",
];

try {
    for (const name of moduleNames) {
        const source = readFileSync(new URL(`${name}.ts`, sourceRoot), "utf8");
        let output = ts.transpileModule(source, {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.ES2022,
            },
        }).outputText;
        for (const dependency of moduleNames) {
            output = output.replaceAll(
                `"./${dependency}"`,
                `"./${dependency}.mjs"`,
            );
        }
        writeFileSync(join(temporaryRoot, `${name}.mjs`), output);
    }

    const runtimeModule = await import(
        new URL(`file://${join(temporaryRoot, "cloud-system-runtime.mjs")}`)
    );
    const benchmarkModule = await import(
        new URL(`file://${join(temporaryRoot, "cloud-photograph-benchmark.mjs")}`)
    );
    const caseId = process.argv[2] ?? "cu-congestus--day-oblique-natural";
    const benchmarkCase = benchmarkModule.CLOUD_PHOTOGRAPH_CASES.find(
        (candidate) => candidate.id === caseId,
    );
    if (!benchmarkCase) throw new Error(`Unknown cloud photograph case ${caseId}`);
    const runtime = runtimeModule.createCloudSystemRuntime(
        benchmarkCase.preview.cloudScene,
    );
    const frameProjection = runtimeModule.estimateCloudFrameProjection(
        runtime.systems,
        {
            azimuthRadians: 0,
            elevationRadians: benchmarkCase.environment.viewElevation * Math.PI / 180,
            horizontalFovRadians:
                benchmarkCase.environment.horizontalFov * Math.PI / 180,
            verticalFovRadians:
                benchmarkCase.environment.verticalFov * Math.PI / 180,
        },
    );
    console.log(JSON.stringify({
        caseId,
        diagnostics: runtime.diagnostics,
        frameProjection,
        systems: runtime.systems.map((system) => {
            const footprint = runtimeModule.estimateThermalOwnerAngularFootprint(
                system.state.extent,
            );
            return {
                systemIndex: system.systemIndex,
                species: system.compiled.recipeId,
                topologyExemplar: system.topologyExemplar.id,
                atlasDeterministicVariant: system.atlasDeterministicVariant,
                centerEastKm: system.state.extent.centerEastKm,
                centerNorthKm: system.state.extent.centerNorthKm,
                majorRadiusKm: system.state.extent.majorRadiusKm,
                minorRadiusKm: system.state.extent.minorRadiusKm,
                bearingDegrees: footprint.bearingRadians * 180 / Math.PI,
                angularHalfWidthDegrees: footprint.halfWidthRadians * 180 / Math.PI,
                baseAltitudeKm: system.compiled.geometry.baseAltitudeKm,
                geometricDepthKm: system.compiled.geometry.geometricDepthKm,
                lifecycleStage: system.compiled.lifecycle.stage,
                seeds: system.seeds,
            };
        }),
    }, null, 2));
} finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
}

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
    createCloudProtectedCuBaseContractWgsl,
    generateCloudMacroAtlas,
} from "./lib/cloud-volume-atlas.mjs";

const outputDirectory = fileURLToPath(new URL("../public/assets/sky/", import.meta.url));
const shaderContractFile = fileURLToPath(new URL(
    "../components/backgrounds/sky/cloud-volume-exterior-contract-wgsl.ts",
    import.meta.url,
));
const generationStarted = performance.now();
const {
    atlas,
    majorants,
    highIceMomentSidecar,
    highIceSourceAtlas,
    manifest,
} = generateCloudMacroAtlas();
const exteriorContractWgsl = createCloudProtectedCuBaseContractWgsl(
    manifest.volumes,
);
const generationFinished = performance.now();

await mkdir(outputDirectory, { recursive: true });
const writeStarted = performance.now();
await Promise.all([
    writeFile(`${outputDirectory}${manifest.atlas.file}`, atlas),
    writeFile(`${outputDirectory}${manifest.majorants.file}`, majorants),
    writeFile(
        `${outputDirectory}${manifest.highIceMomentSidecar.file}`,
        highIceMomentSidecar,
    ),
    writeFile(
        `${outputDirectory}${manifest.highIceSourceAtlas.file}`,
        highIceSourceAtlas,
    ),
    writeFile(
        `${outputDirectory}cloud-macro-atlas-v${manifest.version}.json`,
        `${JSON.stringify(manifest, null, 2)}\n`,
    ),
    writeFile(
        shaderContractFile,
        "/** Generated from the checked-in cloud macro atlas manifest. */\n" +
        "export const CLOUD_PROTECTED_CU_BASE_CONTRACT_WGSL = /* wgsl */ `\n" +
        `${exteriorContractWgsl}\n` +
        "`;\n",
    ),
]);
const writeFinished = performance.now();

const occupied = manifest.volumes.map((volume) =>
    `${volume.id}=${(volume.statistics.occupancyFraction * 100).toFixed(1)}%`,
).join(", ");
console.log(
    `Wrote ${(atlas.byteLength / 1048576).toFixed(2)} MiB macro atlas, ` +
    `${majorants.byteLength} byte majorants, ${highIceMomentSidecar.byteLength} byte ` +
    `high-ice moment sidecar, ${(highIceSourceAtlas.byteLength / 1048576).toFixed(2)} MiB ` +
    `high-ice source atlas, and manifest. Occupancy: ${occupied}`,
);
console.log(
    `Phases: generation=${(generationFinished - generationStarted).toFixed(1)}ms, ` +
    `asset-write=${(writeFinished - writeStarted).toFixed(1)}ms, ` +
    `total=${(writeFinished - generationStarted).toFixed(1)}ms`,
);

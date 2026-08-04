import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { generateCloudMorphologyModifierManifest } from "./lib/cloud-morphology-modifiers.mjs";

const outputDirectory = fileURLToPath(new URL("../public/assets/sky/", import.meta.url));
const manifest = generateCloudMorphologyModifierManifest();

await mkdir(outputDirectory, { recursive: true });
await writeFile(
    `${outputDirectory}cloud-morphology-modifiers-v${manifest.version}.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(
    `Wrote ${manifest.modifiers.length} orthogonal cloud morphology modifiers ` +
    `(payload ${manifest.checksums.payload}).`,
);


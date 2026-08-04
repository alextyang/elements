import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCloudOptics } from "./lib/cloud-optics.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = resolve(scriptDirectory, "../public/assets/sky");
mkdirSync(outputDirectory, { recursive: true });

const { manifest, phaseBytes, parameterBytes } = generateCloudOptics();
const manifestPath = resolve(outputDirectory, "cloud-optics-v1.json");
const phasePath = resolve(outputDirectory, manifest.phaseTexture.file);
const parameterPath = resolve(outputDirectory, manifest.parameterBuffer.file);

writeFileSync(phasePath, phaseBytes);
writeFileSync(parameterPath, parameterBytes);
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(
    `Generated ${manifest.rows.length} cloud optical states: ` +
    `${phaseBytes.byteLength} phase bytes + ${parameterBytes.byteLength} parameter bytes.\n`,
);


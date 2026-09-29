import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [requestPath, outputDirectory] = process.argv.slice(2);
if (!requestPath || !outputDirectory) {
    throw new Error("Evidence request and output directory are required.");
}

const document = JSON.parse(readFileSync(requestPath, "utf8"));
if (document?.version !== 1 || !Array.isArray(document.requests) ||
    document.requests.length < 1 || document.requests.length > 16) {
    throw new Error("Evidence request must contain 1..16 version-1 requests.");
}
const labels = new Set();
for (const request of document.requests) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(request?.label) ||
        labels.has(request.label)) {
        throw new Error("Evidence request labels must be unique safe slugs.");
    }
    labels.add(request.label);
    if (!["radiance", "transmittance", "density-slice"].includes(request.mode) ||
        ![undefined, "live", "absent-layer"].includes(request.variant) ||
        (request.variant === "absent-layer" &&
            ![0, 1, 2].includes(request.absentLayerIndex))) {
        throw new Error(`Invalid evidence request ${request.label}.`);
    }
    if (request.expectError !== undefined &&
        !/^[A-Z_]+$/.test(request.expectError)) {
        throw new Error(`Invalid expected error for ${request.label}.`);
    }
}

process.stdout.write(JSON.stringify({
    outputDirectory: resolve(outputDirectory),
    requests: document.requests,
}));

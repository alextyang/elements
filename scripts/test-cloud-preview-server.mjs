import assert from "node:assert/strict";
import { createServer } from "node:net";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    CLOUD_PREVIEW_LAB_DIST_NAME,
    CLOUD_PREVIEW_LAB_LOCK_NAME,
    assertCloudPreviewDynamicApis,
    parseCloudPreviewLabArguments,
} from "./serve-cloud-preview-matrix.mjs";
import { assertLoopbackPortAvailable } from
    "./lib/cloud-preview-managed-server.mjs";

const serverSource = readFileSync(new URL(
    "./serve-cloud-preview-matrix.mjs", import.meta.url,
), "utf8");
const manifestRouteSource = readFileSync(new URL(
    "../app/api/cloud-previews/manifest/route.ts", import.meta.url,
), "utf8");
const imageRouteSource = readFileSync(new URL(
    "../app/api/cloud-previews/image/[filename]/route.ts", import.meta.url,
), "utf8");
const manifestClientSource = readFileSync(new URL(
    "../app/cloud-preview-matrix/cloud-preview-manifest.ts", import.meta.url,
), "utf8");
const packageSource = JSON.parse(readFileSync(new URL(
    "../package.json", import.meta.url,
), "utf8"));

test("preview matrix server has reproducible loopback defaults", () => {
    assert.deepEqual(parseCloudPreviewLabArguments([]), {
        serverPort: 3_000,
        buildTimeoutMs: 1_200_000,
        healthTimeoutMs: 180_000,
    });
    assert.equal(CLOUD_PREVIEW_LAB_DIST_NAME, ".next-cloud-preview-lab");
    assert.equal(CLOUD_PREVIEW_LAB_LOCK_NAME, ".cloud-preview-lab-server.lock");
    assert.deepEqual(parseCloudPreviewLabArguments([
        "--server-port=4312",
        "--build-timeout-ms", "2000",
        "--health-timeout-ms=3000",
    ]), {
        serverPort: 4_312,
        buildTimeoutMs: 2_000,
        healthTimeoutMs: 3_000,
    });
    assert.throws(() => parseCloudPreviewLabArguments(["--server-port", "0"]),
        /1 to 65535/);
    assert.throws(() => parseCloudPreviewLabArguments(["--unknown"]),
        /Unknown option/);
});

test("preview matrix server owns only its dedicated dist and process group", () => {
    assert.equal(packageSource.scripts["cloud:previews:serve"],
        "node scripts/serve-cloud-preview-matrix.mjs");
    assert.match(serverSource, /acquireGenerationLock\(lockPath\)/);
    assert.ok(serverSource.indexOf("assertLoopbackPortAvailable(options.serverPort)") <
        serverSource.indexOf("acquireGenerationLock(lockPath)"),
    "an existing server must be detected before lock or dist mutation");
    assert.ok(serverSource.indexOf("acquireGenerationLock(lockPath)") <
        serverSource.indexOf("rmSync(previewDistPath"),
    "ownership must be established before deleting the dedicated dist");
    assert.match(serverSource, /ELEMENTS_NEXT_DIST_DIR: CLOUD_PREVIEW_LAB_DIST_NAME/);
    assert.match(serverSource, /ELEMENTS_PREVIEW_SKIP_TYPECHECK: "1"/);
    assert.match(serverSource, /"start", "--hostname", "127\.0\.0\.1"/);
    assert.match(serverSource, /await stopManagedProcess\(server\)/);
    assert.doesNotMatch(serverSource, /\.next-cloud-preview-production/);
    assert.doesNotMatch(serverSource, /watch-cloud-previews/);
});

test("occupied loopback port is rejected without touching a stable server", async () => {
    const blocker = createServer();
    await new Promise((resolve, reject) => {
        blocker.once("error", reject);
        blocker.listen(0, "127.0.0.1", resolve);
    });
    const address = blocker.address();
    assert.ok(address && typeof address === "object");
    try {
        await assert.rejects(assertLoopbackPortAvailable(address.port),
            /already in use/);
    } finally {
        await new Promise((resolve, reject) => blocker.close((error) =>
            error ? reject(error) : resolve()));
    }
});

test("dynamic API startup audit distinguishes route JSON from a rendered 404", async () => {
    const headers = (values) => new Headers(values);
    await assertCloudPreviewDynamicApis({
        baseUrl: "http://127.0.0.1:4312",
        fetchImplementation: async (url) => url.endsWith("/manifest")
            ? { status: 404, headers: headers({
                "content-type": "application/json",
                "cache-control": "no-store, max-age=0",
            }) }
            : { status: 400, headers: headers({
                "content-type": "application/json",
            }) },
    });
    await assert.rejects(assertCloudPreviewDynamicApis({
        baseUrl: "http://127.0.0.1:4312",
        fetchImplementation: async () => ({
            status: 404,
            headers: headers({ "content-type": "text/html" }),
        }),
    }), /dynamic API is absent/);
});

test("matrix reads live manifest and content-hashed images through dynamic APIs", () => {
    assert.match(manifestClientSource, /"\/api\/cloud-previews\/manifest"/);
    assert.match(manifestClientSource, /\/api\/cloud-previews\/image\/\$\{filename\}/);
    assert.match(manifestRouteSource, /export const dynamic = "force-dynamic"/);
    assert.match(manifestRouteSource, /readFile\(MANIFEST_PATH\)/);
    assert.match(manifestRouteSource, /"Cache-Control": "no-store, max-age=0"/);
    assert.match(imageRouteSource, /export const dynamic = "force-dynamic"/);
    assert.match(imageRouteSource, /\[a-f0-9\]\{12\}\\\.png/);
    assert.match(imageRouteSource, /readFile\(join\(IMAGE_DIRECTORY, filename\)\)/);
});

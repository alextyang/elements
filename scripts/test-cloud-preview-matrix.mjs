import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    CLOUD_PREVIEW_MANIFEST_URL,
    cloudPreviewImageProxyUrl,
    parseCloudPreviewManifest,
} from "../app/cloud-preview-matrix/cloud-preview-manifest.ts";
import {
    stepCloudPreviewOption,
} from "../app/cloud-preview-matrix/cloud-preview-queue.ts";

const source = readFileSync(new URL(
    "../app/cloud-preview-matrix/cloud-preview-matrix.tsx",
    import.meta.url,
), "utf8");
const catalogueSource = readFileSync(new URL(
    "../app/cloud-preview-matrix/cloud-preview-catalog.ts",
    import.meta.url,
), "utf8");
const styleSource = readFileSync(new URL(
    "../app/cloud-preview-matrix/cloud-preview-matrix.module.css",
    import.meta.url,
), "utf8");
const imageRouteSource = readFileSync(new URL(
    "../app/api/cloud-previews/image/[filename]/route.ts",
    import.meta.url,
), "utf8");

const validEntry = {
    id: "base:cumulus:humilis",
    caseId: "cu-humilis--day-oblique-natural",
    captureParameter: "case",
    imageUrl: "/generated/cloud-previews/images/base-cumulus-humilis-aaaaaaaaaaaa.png",
    width: 960,
    height: 600,
    contentHash: "b".repeat(64),
    imageContentHash: "a".repeat(64),
    generatedAt: "2026-07-29T12:00:00.000Z",
};

test("matrix is a static manifest consumer and cannot create a renderer", () => {
    assert.match(source, /data-preview-source="static-manifest"/);
    assert.match(source, /data-live-capture-count="0"/);
    assert.match(source, /CLOUD_PREVIEW_MANIFEST_URL/);
    assert.match(source, /cache: "no-store"/);
    assert.doesNotMatch(source, /<iframe\b|<canvas\b|createImageBitmap/);
    assert.doesNotMatch(source,
        /SerialCaptureFrame|SkyRendererCanvas|navigator\.gpu|WEBGPU_CLOUD/);
    assert.doesNotMatch(source,
        /CLOUD_CAPTURE_SHUTDOWN_MESSAGE|cloudPreviewQueueReducer/);
});

test("manifest polling is incremental, visibility-aware, and manually refreshable", () => {
    assert.equal(CLOUD_PREVIEW_MANIFEST_URL,
        "/api/cloud-previews/manifest");
    assert.match(source, /MANIFEST_POLL_INTERVAL_MS = 3_000/);
    assert.match(source, /window\.setInterval/);
    assert.match(source, /if \(!document\.hidden\) void refreshManifest\(\)/);
    assert.match(source, /document\.addEventListener\("visibilitychange"/);
    assert.match(source, />\s*Refresh manifest\s*</);
    assert.match(source, /manifest\?\.status === "partial" \? "Generating"/);
});

test("manifest parser accepts the generator schema and rejects unsafe entries", () => {
    const manifest = {
    schemaVersion: 1,
    rendererHash: "c".repeat(64),
    assetChecksums: {
        algorithm: "SHA-256",
        atlas: "a".repeat(64),
        majorants: "b".repeat(64),
        exteriorBoundary: "c".repeat(64),
    },
        productionPerspective: "oblique-natural",
        captureMode: "native-metal",
        generatedAt: "2026-07-29T12:00:00.000Z",
        status: "partial",
        total: 276,
        completed: 1,
        entries: [validEntry],
    };
    assert.deepEqual(parseCloudPreviewManifest(manifest), manifest);
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        completed: 2,
    }), undefined, "completed must equal the atomic entry list length");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        entries: [{ ...validEntry, imageUrl: "https://example.com/cloud.png" }],
    }), undefined, "the page only loads generated same-origin image paths");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        entries: [{ ...validEntry, imageUrl:
            "/generated/cloud-previews/images/../../secret.png" }],
    }), undefined, "generated image paths cannot traverse directories");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        entries: [validEntry, validEntry],
        completed: 2,
    }), undefined, "duplicate ids cannot ambiguously replace a card");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        productionPerspective: "high-horizon",
    }), undefined, "only the selected production camera can populate the grid");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        total: 60,
    }), undefined, "a partial catalogue cannot masquerade as the full grid");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        entries: [{ ...validEntry, imageContentHash: "d".repeat(64) }],
    }), undefined, "the immutable URL suffix must match the PNG byte hash");
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        schemaVersion: 2,
    }), undefined);
    assert.equal(parseCloudPreviewManifest({
        ...manifest,
        assetChecksums: undefined,
    }), undefined, "old manifests without asset identities are stale");
});

test("completed entries are joined by stable catalogue id", () => {
    assert.match(source, /new Map\([\s\S]*?manifest\?\.entries\.flatMap/);
    assert.match(source, /preview\.caseId === entry\.caseId/);
    assert.match(source,
        /preview\.captureParameter === entry\.captureParameter/);
    assert.match(source, /manifestEntries\.get\(preview\.id\)/);
    assert.match(source, /manifestEntries\.has\(preview\.id\)/);
    assert.equal(cloudPreviewImageProxyUrl(validEntry.imageUrl),
        "/api/cloud-previews/image/base-cumulus-humilis-aaaaaaaaaaaa.png");
    assert.equal(cloudPreviewImageProxyUrl(
        "/generated/cloud-previews/images/../../secret.png"), undefined);
    assert.match(source, /<img src=\{staticImageUrl\}/);
    assert.match(source, /width=\{entry\.width\}/);
    assert.match(source, /height=\{entry\.height\}/);
    assert.match(source, /Waiting for background render/);
    assert.doesNotMatch(source, /preview\.qualificationUrl/,
        "pending static cards must not navigate to a live GPU qualification page");
    assert.match(source, /preview pending/);
    assert.doesNotMatch(source, /blob:|URL\.createObjectURL|URL\.revokeObjectURL/);
    assert.match(imageRouteSource, /IMAGE_NAME = \/\^\[a-z0-9-\]\+/);
    assert.match(imageRouteSource, /readFile\(join\(IMAGE_DIRECTORY, filename\)\)/);
    assert.match(imageRouteSource, /max-age=31536000, immutable/);
});

test("catalogue is shared, JSON-safe, and fixes every target to one perspective", () => {
    assert.match(catalogueSource, /export const previewDefinitions/);
    assert.match(catalogueSource, /productionPerspective: string/);
    assert.match(catalogueSource,
        /productionPerspectiveCameraSignature\([\s\S]*?productionPerspective/);
    assert.match(catalogueSource,
        /return \[\.\.\.base, \.\.\.orthogonal, \.\.\.weather\]/);
    assert.match(catalogueSource, /nativePerspective = target\.perspectiveIds\[0\]/);
    assert.match(catalogueSource, /nativePerspective = target\.perspectives\[0\]/);
    assert.match(catalogueSource, /scope: "canonical"/);
    assert.match(catalogueSource, /scope: "complete-weather"/);
    assert.doesNotMatch(source, /Production perspective" value=/,
        "the static page must not advertise ungenerated camera variation");
    assert.match(source,
        /productionPerspective = manifest\?\.productionPerspective/);
    assert.match(source, /Every image uses the single production perspective/);
});

test("every remaining selector has deterministic cyclic arrow navigation", () => {
    const options = [
        { value: "first" },
        { value: "middle" },
        { value: "last" },
    ];
    assert.equal(stepCloudPreviewOption(options, "first", -1), "last");
    assert.equal(stepCloudPreviewOption(options, "last", 1), "first");
    assert.equal(stepCloudPreviewOption(options, "middle", 4), "last");
    assert.equal(stepCloudPreviewOption([], "unchanged", 1), "unchanged");

    const selectorUsages = source.match(/<StepSelect\b/g) ?? [];
    const nativeSelects = source.match(/<select\b/g) ?? [];
    assert.equal(selectorUsages.length, 5,
        "scope, family, genus, status, and evidence use arrow controls");
    assert.equal(nativeSelects.length, 1,
        "the only native select is encapsulated by StepSelect");
    assert.match(source, /Previous \$\{label\}/);
    assert.match(source, /Next \$\{label\}/);
    assert.match(source, /data-preview-selector=\{label\}/);
});

test("display filters preserve useful catalogue labels and static statuses", () => {
    for (const label of [
        "Matrix scope",
        "Family",
        "Genus",
        "Status",
        "Evidence",
    ]) assert.match(source, new RegExp(`label="${label}"`));
    assert.match(source, /Canonical 60/);
    assert.match(source, /Complete \$\{WEATHER_QUALIFICATION_SUMMARY\.targets\}/);
    assert.match(source, /"pending" \| "ready"/);
    assert.match(source, /preview\.implementation === evidenceFilter/);
    assert.match(source, /preview\.photographicEvidence/);
    assert.match(styleSource, /\.card\[data-state="pending"\]/);
    assert.match(styleSource, /\.manifestBadge\[data-state="complete"\]/);
    assert.match(styleSource, /\.manifestBadge\[data-state="partial"\]/);
});

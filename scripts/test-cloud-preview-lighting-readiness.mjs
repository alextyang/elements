import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION,
    CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION,
    cloudPreviewHighCloudProfile,
    cloudLayersRequireVolumetricLightingEvidence,
    evaluateCloudPreviewHighCloudReadiness,
    evaluateCloudPreviewLightingReadiness,
    minimumHighCloudOccupiedSky,
} from "../components/backgrounds/sky/cloud-preview-lighting-readiness.ts";
const captureSource = readFileSync(new URL(
    "./capture-cloud-preview.sh", import.meta.url), "utf8");
const benchmarkSource = readFileSync(new URL(
    "../app/cloud-photographs/cloud-photograph-benchmark.tsx",
    import.meta.url), "utf8");
const matrixSource = readFileSync(new URL(
    "../app/cloud-preview-matrix/cloud-preview-matrix.tsx",
    import.meta.url), "utf8");

const evidence = (overrides = {}) => ({
    requiresVolumetricLighting: true,
    rawRadianceSpatialVariation: 0,
    resolvedRadianceSpatialVariation: 0,
    selectedBricks: 0,
    readyBricks: 0,
    residentLayerMask: 0,
    occupiedP1Voxels: 0,
    ...overrides,
});

const layer = (species, opticalDepth, present = true) => ({
    species,
    opticalDepth,
    present,
});

test("thick canonical convective and cellular cases require volume-light evidence", () => {
    for (const species of [
        "stratocumulus-stratiformis",
        "stratocumulus-castellanus",
        "cumulus-humilis",
        "cumulus-congestus",
        "cumulonimbus-calvus",
    ]) {
        assert.equal(cloudLayersRequireVolumetricLightingEvidence([
            layer(species, 0.9),
        ]), true, species);
    }
});

test("thin ice and empty scenes retain legitimate exact-only publication", () => {
    for (const species of [
        "cirrus-fibratus",
        "cirrocumulus-stratiformis",
        "cirrostratus-nebulosus",
        "stratus-nebulosus",
    ]) {
        assert.equal(cloudLayersRequireVolumetricLightingEvidence(
            [layer(species, 1)]), false, species);
    }
    assert.equal(cloudLayersRequireVolumetricLightingEvidence([
        layer("cumulus-congestus", 0.69),
    ]), false, "optically thin convection stays outside the thick-cloud gate");
    assert.equal(cloudLayersRequireVolumetricLightingEvidence([
        layer("cumulonimbus-calvus", 1, false),
    ]), false, "an absent cloud owner never requires lighting evidence");
    assert.equal(cloudLayersRequireVolumetricLightingEvidence([]), false);
    assert.equal(evaluateCloudPreviewLightingReadiness(evidence({
        requiresVolumetricLighting: false,
    })).ready, true);
});

test("canonical high-cloud families require image structure without requiring P1", () => {
    for (const species of [
        "cirrus-fibratus",
        "cirrus-spissatus",
        "cirrocumulus-stratiformis",
        "cirrostratus-fibratus",
    ]) {
        assert.equal(cloudPreviewHighCloudProfile([layer(species, 0.2)]),
            "structured", species);
    }
    assert.equal(cloudPreviewHighCloudProfile([
        layer("cirrostratus-nebulosus", 0.2),
    ]), "smooth-veil");
    assert.equal(cloudPreviewHighCloudProfile([
        layer("cumulus-humilis", 0.8),
    ]), "none");

    const base = {
        profile: "structured",
        rawRadianceSpatialVariation: 0,
        resolvedRadianceSpatialVariation: 0,
        projectedOpacity: 0.02,
        occupiedSkyFraction: 0.2,
        minimumOccupiedSkyFraction: 0.01,
    };
    assert.equal(evaluateCloudPreviewHighCloudReadiness(base).ready, false,
        "flat analytic ribbons fail even when their footprint is large");
    const structured = evaluateCloudPreviewHighCloudReadiness({
        ...base,
        rawRadianceSpatialVariation:
            CLOUD_PREVIEW_MIN_HIGH_CLOUD_RAW_RADIANCE_VARIATION,
        resolvedRadianceSpatialVariation:
            CLOUD_PREVIEW_MIN_HIGH_CLOUD_RESOLVED_RADIANCE_VARIATION,
    });
    assert.deepEqual(structured, {
        ready: true,
        spatialStructureReady: true,
        footprintReady: true,
    });
    assert.equal(evaluateCloudPreviewHighCloudReadiness({
        ...base,
        profile: "smooth-veil",
    }).ready, true, "a physically smooth veil passes on footprint evidence");
    assert.equal(evaluateCloudPreviewHighCloudReadiness({
        ...base,
        profile: "smooth-veil",
        occupiedSkyFraction: 0.009,
    }).ready, false, "a tiny smooth veil is not a canonical full-sky veil");
});

test("high-cloud footprint scales with authored coverage", () => {
    assert.equal(minimumHighCloudOccupiedSky([
        { ...layer("cirrus-fibratus", 0.2), coverage: 0.5 },
    ]), 0.015);
    assert.equal(minimumHighCloudOccupiedSky([
        { ...layer("cumulus-humilis", 0.8), coverage: 1 },
    ]), 0);
});

test("a flat thick cloud with no direct or P1 volume cannot publish", () => {
    assert.deepEqual(evaluateCloudPreviewLightingReadiness(evidence()), {
        ready: false,
        spatialVariationReady: false,
        directVolumeReady: false,
        residentP1Ready: false,
    });
});

test("measured spatial structure or either real volume signal admits publication", () => {
    assert.equal(evaluateCloudPreviewLightingReadiness(evidence({
        rawRadianceSpatialVariation:
            CLOUD_PREVIEW_MIN_RAW_RADIANCE_VARIATION,
        resolvedRadianceSpatialVariation:
            CLOUD_PREVIEW_MIN_RESOLVED_RADIANCE_VARIATION,
    })).ready, true, "qualified analytic direct lighting remains valid");
    assert.equal(evaluateCloudPreviewLightingReadiness(evidence({
        selectedBricks: 3,
        readyBricks: 3,
    })).directVolumeReady, true);
    assert.equal(evaluateCloudPreviewLightingReadiness(evidence({
        residentLayerMask: 2,
        occupiedP1Voxels: 18,
    })).residentP1Ready, true);
    assert.equal(evaluateCloudPreviewLightingReadiness(evidence({
        selectedBricks: 3,
        readyBricks: 2,
    })).ready, false, "partial direct-volume work is not evidence");
});

test("benchmark and capture independently enforce the publication gate", () => {
    assert.match(benchmarkSource,
        /cloudLayersRequireVolumetricLightingEvidence/);
    assert.match(benchmarkSource,
        /reconstructionMature &&\s*volumetricLighting\.ready/);
    assert.match(benchmarkSource, /cloudLight\.state === "empty"/);
    assert.match(benchmarkSource, /exactOnlyCloudLightReady/);
    assert.match(benchmarkSource, /highCloud\.ready/);
    assert.match(benchmarkSource, /data-cloud-high-cloud-ready=/);
    assert.match(benchmarkSource,
        /data-cloud-volumetric-lighting-ready=/);
    assert.match(captureSource,
        /requiresVolumetricLighting &&\s*!state\.volumetricLightingReady/);
    assert.match(captureSource, /exactOnlyLightingReady/);
    assert.match(captureSource, /rawRadianceSpatialVariation/);
    assert.match(captureSource, /directVolumeReady/);
    assert.match(captureSource, /residentP1Ready/);
    assert.match(captureSource, /requiresHighCloudEvidence &&\s*!state\.highCloudReady/);
});

test("the preview grid remains an offline immutable-image consumer", () => {
    assert.match(matrixSource, /data-preview-source="static-manifest"/);
    assert.match(matrixSource, /data-live-capture-count="0"/);
    assert.match(matrixSource, /<img src=\{staticImageUrl\}/);
    assert.doesNotMatch(matrixSource,
        /<canvas\b|<iframe\b|navigator\.gpu|capture-cloud-preview|generate-cloud-previews/);
});

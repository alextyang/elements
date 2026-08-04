import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const shaderSource = fs.readFileSync(
    new URL("../components/backgrounds/sky/webgpu-shaders.ts", import.meta.url),
    "utf8",
);

const FAR_LIMIT_KM = 140;
const EVENT_ITERATION_LIMIT = 1900;
const EPSILON = 1e-9;

const clipSupports = (supports, shell) => supports
    .map(([near, far]) => [Math.max(shell[0], near), Math.min(shell[1], far)])
    .filter(([near, far]) => far > near);

const traversalEvent = (supports, travelled, far) => {
    const epsilon = Math.max(1e-6, Math.abs(travelled) * 1e-7);
    let segmentEnd = far;
    let occupied = false;
    const active = [];
    for (const [owner, interval] of supports.entries()) {
        if (interval[0] <= travelled + epsilon &&
            interval[1] > travelled + epsilon) {
            occupied = true;
            active.push(owner);
            segmentEnd = Math.min(segmentEnd, interval[1]);
        } else if (interval[0] > travelled + epsilon) {
            segmentEnd = Math.min(segmentEnd, interval[0]);
        }
    }
    return { segmentEnd, occupied, active };
};

const traverseSupports = (rawSupports, shell, targetStepKm) => {
    const supports = clipSupports(rawSupports, shell);
    if (supports.length === 0) {
        return { steps: [], gaps: [], iterations: 0, near: Infinity, far: -Infinity };
    }
    const near = Math.min(...supports.map((interval) => interval[0]));
    const far = Math.max(...supports.map((interval) => interval[1]));
    const steps = [];
    const gaps = [];
    let travelled = near;
    let iterations = 0;
    while (travelled < far - EPSILON && iterations < EVENT_ITERATION_LIMIT) {
        iterations += 1;
        const event = traversalEvent(supports, travelled, far);
        assert.ok(event.segmentEnd > travelled,
            "the half-open endpoint rule must always advance the cursor");
        if (!event.occupied) {
            gaps.push([travelled, event.segmentEnd]);
            travelled = event.segmentEnd;
            continue;
        }
        const stepFar = Math.min(event.segmentEnd, travelled + targetStepKm);
        steps.push([travelled, stepFar]);
        travelled = stepFar;
    }
    return { steps, gaps, iterations, near, far, complete: travelled >= far - EPSILON };
};

const occupiedLength = (traversal) => traversal.steps.reduce(
    (sum, [near, far]) => sum + far - near, 0);

const gapLength = (traversal) => traversal.gaps.reduce(
    (sum, [near, far]) => sum + far - near, 0);

const sphereHits = (origin, direction, radius) => {
    const b = origin.reduce((sum, value, index) =>
        sum + value * direction[index], 0);
    const c = origin.reduce((sum, value) => sum + value * value, 0) -
        radius * radius;
    const discriminant = b * b - c;
    if (discriminant < 0) return [Infinity, -Infinity];
    const root = Math.sqrt(discriminant);
    return [-b - root, -b + root];
};

const curvedShellInterval = (
    origin, direction, bottomAltitudeKm, depthKm, planetRadiusKm = 6371,
) => {
    const inner = sphereHits(origin, direction,
        planetRadiusKm + bottomAltitudeKm);
    const outer = sphereHits(origin, direction,
        planetRadiusKm + bottomAltitudeKm + depthKm);
    if (outer[1] <= 0) return [Infinity, -Infinity];
    const near = inner[1] > 0 ? inner[1] : Math.max(0, outer[0]);
    const far = Math.min(FAR_LIMIT_KM, outer[1]);
    return far > near ? [near, far] : [Infinity, -Infinity];
};

const rgbMap = (first, second, operation) => first.map(
    (value, channel) => operation(value, second[channel]));
const rgbAdd = (first, second) => rgbMap(first, second, (a, b) => a + b);
const rgbSubtract = (first, second) => rgbMap(first, second, (a, b) => a - b);
const rgbMultiply = (first, second) => rgbMap(first, second, (a, b) => a * b);

const identity = () => ({ radiance: [0, 0, 0], transmittance: [1, 1, 1] });
const compose = (front, back) => ({
    radiance: rgbAdd(front.radiance,
        rgbMultiply(front.transmittance, back.radiance)),
    transmittance: rgbMultiply(front.transmittance, back.transmittance),
});
const integrate = (extinction, source, distance) => {
    const transmittance = extinction.map((sigma) => Math.exp(-sigma * distance));
    return {
        radiance: source.map((coefficient, channel) =>
            extinction[channel] <= 1e-12
                ? coefficient * distance
                : coefficient * (1 - transmittance[channel]) / extinction[channel]),
        transmittance,
    };
};
const assertRgbClose = (actual, expected, tolerance = 1e-11) => {
    for (let channel = 0; channel < 3; channel += 1) {
        assert.ok(Math.abs(actual[channel] - expected[channel]) <= tolerance,
            `channel ${channel}: ${actual[channel]} != ${expected[channel]}`);
    }
};

test("finite-owner traversal skips disjoint empty kilometres without spending strata", () => {
    const traversal = traverseSupports([[1, 2], [20, 21]], [0, 30], 0.1);
    assert.equal(traversal.complete, true);
    assert.ok(Math.abs(occupiedLength(traversal) - 2) < 1e-10);
    assert.ok(Math.abs(gapLength(traversal) - 18) < 1e-10);
    assert.equal(traversal.steps.length, 20);
    assert.deepEqual(traversal.gaps, [[2, 20]]);
});

test("overlapping and nested owners are marched as one support union", () => {
    const overlap = traverseSupports([[1, 3], [2, 4]], [0, 8], 0.1);
    const nested = traverseSupports([[1, 5], [2, 3]], [0, 8], 0.1);
    assert.ok(Math.abs(occupiedLength(overlap) - 3) < 1e-10);
    assert.ok(Math.abs(occupiedLength(nested) - 4) < 1e-10);
    assert.equal(overlap.steps.length, 30,
        "the overlap must not be sampled once per owner");
    assert.equal(nested.steps.length, 40,
        "a nested owner must not add a second transport path");
});

test("owner-event masks retain exactly the owners active on each segment", () => {
    const supports = [[1, 5], [2, 4], [3, 6], [7, 8]];
    assert.deepEqual(traversalEvent(supports, 1, 8), {
        segmentEnd: 2, occupied: true, active: [0],
    });
    assert.deepEqual(traversalEvent(supports, 2, 8), {
        segmentEnd: 3, occupied: true, active: [0, 1],
    });
    assert.deepEqual(traversalEvent(supports, 3, 8), {
        segmentEnd: 4, occupied: true, active: [0, 1, 2],
    });
    assert.deepEqual(traversalEvent(supports, 6, 8), {
        segmentEnd: 7, occupied: false, active: [],
    });
    assert.deepEqual(traversalEvent(supports, 7, 8), {
        segmentEnd: 8, occupied: true, active: [3],
    });
});

test("finite supports are clipped by the exact curved shell before traversal", () => {
    const radius = 6371;
    const origin = [0, radius + 0.2, 0];
    const direction = [1, 0, 0];
    const shell = curvedShellInterval(origin, direction, 1, 1, radius);
    assert.ok(Number.isFinite(shell[0]) && shell[1] > shell[0]);
    const clipped = clipSupports([
        [shell[0] - 2, shell[0] + 0.4],
        [shell[1] - 0.3, shell[1] + 3],
        [shell[1] + 1, shell[1] + 2],
    ], shell);
    assert.deepEqual(clipped, [
        [shell[0], shell[0] + 0.4],
        [shell[1] - 0.3, shell[1]],
    ]);
});

test("clear prefix, owner gaps, and tail preserve the shadowed-atmosphere baseline", () => {
    const airExtinction = [0.018, 0.027, 0.044];
    const airSource = [0.004, 0.009, 0.018];
    const cloudExtinction = [0.62, 0.57, 0.49];
    const cloudSource = [0.15, 0.17, 0.20];
    const clear = (distance) => integrate(airExtinction, airSource, distance);
    const occupied = (distance) => integrate(
        rgbAdd(airExtinction, cloudExtinction),
        rgbAdd(airSource, cloudSource), distance);

    const prefix = clear(1);
    const firstOwner = occupied(1);
    const gap = clear(18);
    const secondOwner = occupied(1);
    const tail = clear(9);
    const combinedThroughOwners = [prefix, firstOwner, gap, secondOwner]
        .reduce(compose, identity());
    const clearThroughOwners = clear(21);
    const cloudTransmittance = cloudExtinction.map(
        (sigma) => Math.exp(-sigma * 2));
    const relativeThroughOwners = {
        radiance: rgbSubtract(combinedThroughOwners.radiance,
            rgbMultiply(cloudTransmittance, clearThroughOwners.radiance)),
        transmittance: cloudTransmittance,
    };

    const combinedWithTail = compose(combinedThroughOwners, tail);
    const clearWithTail = clear(30);
    const relativeWithTail = {
        radiance: rgbSubtract(combinedWithTail.radiance,
            rgbMultiply(cloudTransmittance, clearWithTail.radiance)),
        transmittance: cloudTransmittance,
    };
    assertRgbClose(relativeThroughOwners.radiance, relativeWithTail.radiance);
    assertRgbClose(relativeThroughOwners.transmittance,
        relativeWithTail.transmittance);
});

test("occupied steps meet the physical target and the worst path is statically bounded", () => {
    const target = 0.08;
    const worstPath = traverseSupports([[0, FAR_LIMIT_KM]],
        [0, FAR_LIMIT_KM], target);
    assert.equal(worstPath.complete, true);
    assert.equal(worstPath.steps.length, 1750);
    assert.ok(worstPath.iterations <= EVENT_ITERATION_LIMIT);
    assert.ok(worstPath.steps.every(([near, far]) =>
        far - near <= target + 1e-12));

    const partitioned = Array.from({ length: 36 }, (_, index) => [
        index * FAR_LIMIT_KM / 36,
        (index + 1) * FAR_LIMIT_KM / 36,
    ]);
    const allOwners = traverseSupports(partitioned,
        [0, FAR_LIMIT_KM], target);
    assert.equal(allOwners.complete, true);
    assert.ok(allOwners.iterations <= EVENT_ITERATION_LIMIT);
});

test("short finite paths retain the configured temporal stratum density", () => {
    const hullLength = 1;
    const configuredSteps = 48;
    const physicalTarget = 0.1;
    const finiteTarget = Math.min(
        physicalTarget, hullLength / configuredSteps);
    const traversal = traverseSupports([[3, 4]], [0, 10], finiteTarget);
    assert.equal(traversal.steps.length, configuredSteps);
    assert.ok(traversal.steps.every(([near, far]) =>
        far - near <= physicalTarget + 1e-12));
});

test("front-to-back affine transport is passive, ordered, and energy bounded", () => {
    const front = integrate([0.7, 0.6, 0.5], [0.10, 0.13, 0.17], 0.8);
    const back = integrate([0.3, 0.4, 0.6], [0.21, 0.16, 0.09], 1.2);
    const ordered = compose(front, back);
    const reversed = compose(back, front);
    assert.ok(ordered.transmittance.every((value) => value >= 0 && value <= 1));
    assert.ok(ordered.radiance.every((value) => Number.isFinite(value) && value >= 0));
    assertRgbClose(ordered.transmittance, reversed.transmittance);
    assert.notDeepEqual(ordered.radiance, reversed.radiance,
        "radiance must retain front-to-back source order");
});

test("shipping WGSL uses a bounded owner-event traversal", () => {
    const marchStart = shaderSource.indexOf("fn march_layer(");
    const marchEnd = shaderSource.indexOf("struct HydrometeorTransport", marchStart);
    const march = shaderSource.slice(marchStart, marchEnd);
    const eventStart = shaderSource.indexOf("fn production_layer_traversal_event(");
    const eventEnd = shaderSource.indexOf("fn production_layer_interval(", eventStart);
    const event = shaderSource.slice(eventStart, eventEnd);
    const packetStart = shaderSource.indexOf("fn production_layer_packet(");
    const packetEnd = shaderSource.indexOf("fn layer_packet_precedes(", packetStart);
    const packet = shaderSource.slice(packetStart, packetEnd);

    assert.match(march, /for \(var iteration = 0; iteration < 1900; iteration\+\+\)/);
    assert.match(march, /if \(finite_event_dirty\)[\s\S]*?production_layer_traversal_event\(/);
    assert.match(march,
        /finite_active_set = event\.active_set[\s\S]*?cloud_density_material_sample_camera_active\([\s\S]*?finite_active_set/);
    assert.match(march,
        /let finite_step_target_km = min\([\s\S]*?maximum_step_km[\s\S]*?interval_length \/ f32\(max\(1, step_count\)\)/);
    assert.match(march, /integrated_far \+ finite_step_target_km/);
    assert.match(march,
        /if \(!finite_segment_occupied\)[\s\S]*?cloud_background_atmosphere_segment\([\s\S]*?combined_transport, clear_gap[\s\S]*?clear_transport, clear_gap/);
    assert.match(event, /for \(var slot = 0; slot < 36; slot \+= 1\)/);
    assert.match(event,
        /active_set = ordered_active_insert\(active_set, u32\(slot\)\)/);
    assert.match(event,
        /return ProductionLayerTraversalEvent\([\s\S]*?active_set/);
    assert.match(event, /segment_end = min\(segment_end, interval\.y\)/);
    assert.match(event, /segment_end = min\(segment_end, interval\.x\)/);
    assert.doesNotMatch(event, /array<vec2<f32>,\s*36>/);
    assert.match(shaderSource,
        /fn cloud_density_material_sample_camera_active\([\s\S]*?true, active_set/);
    assert.match(packet, /production_layer_has_finite_owner\(layer, index\)/);
    assert.match(packet,
        /jitter, interval, finite_owner_mode\)/);
    assert.doesNotMatch(packet, /cached_lighting/);
});

test("finite-owned stratiform layers bypass shell-wide fixed quadrature", () => {
    const marchStart = shaderSource.indexOf("fn march_layer(");
    const marchEnd = shaderSource.indexOf("struct HydrometeorTransport", marchStart);
    const march = shaderSource.slice(marchStart, marchEnd);
    assert.match(
        march,
        /if \(is_sheet_layer\(layer\) && !finite_owner_mode\) \{[\s\S]*?return march_sheet_layer\(/,
        "atlas-backed sheets must use the finite physical marcher",
    );
    assert.match(
        march,
        /fixed sheet quadrature remains the conservative fallback for legacy/,
    );
    assert.match(
        march,
        /finite_active_set = event\.active_set[\s\S]*?cloud_density_material_sample_camera_active\(/,
        "finite sheet strata must keep the owner set and camera footprint path",
    );
});

test("inversion-bounded deck atlas material is vertically footprint-filtered", () => {
    const sampleStart = shaderSource.indexOf("fn cloud_macro_volume_rgba(");
    const sampleEnd = shaderSource.indexOf("fn cloud_macro_sdf_voxels(", sampleStart);
    const sample = shaderSource.slice(sampleStart, sampleEnd);
    assert.match(sample, /let formation_mechanism = i32\(round\(atlas_binding\.majorant_scale\.w\)\)/);
    assert.match(sample, /if \(formation_mechanism != 10\) \{ return centre; \}/);
    assert.match(sample, /let vertical_voxel = vec3<f32>\(0\.0, 1\.0 \/ 47\.0, 0\.0\)/);
    assert.match(sample, /let lower = textureSampleLevel\([\s\S]*?let upper = textureSampleLevel\(/);
    assert.match(sample, /let monotone_lower = min\(lower, min\(centre, upper\)\)/);
    assert.match(sample, /let monotone_upper = max\(lower, max\(centre, upper\)\)/);
    assert.match(sample, /\(lower \+ centre \* 2\.0 \+ upper\) \* 0\.25/);
    assert.match(sample, /select\(0\.0, filtered\.r, centre\.r > 0\.0001\)/);
    assert.match(sample, /material_has_two_sided_support = centre\.r > 0\.0001/);
    assert.match(sample, /select\(centre\.g, filtered\.g, material_has_two_sided_support\)/);
    assert.match(sample, /select\(centre\.b, filtered\.b, material_has_two_sided_support\)/);
    assert.match(sample, /centre\.a,/);
    assert.match(sample, /symmetric kernel has unit mass/);
    assert.match(sample, /shared by\n    \/\/ camera and source transport/);
});

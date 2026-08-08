import {
    CLOUD_FEATURE_RECORD_V2_FLOATS,
    CLOUD_FEATURE_RECORD_V2_UINTS,
    CLOUD_OWNER_RECORD_V2_FLOATS,
    CLOUD_OWNER_RECORD_V2_UINTS,
    packCloudSystemV2,
    type CloudLifecycleEventKind,
    type CloudLifecycleEventV2,
    type CompiledCloudSystemV2,
} from "./cloud-system-abi-v2";
import { cloudStableNumericId } from "./cloud-physical-sample";

export const CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION = 1 as const;
export const CLOUD_PRODUCTION_HEADER_UINTS = 8 as const;
export const CLOUD_EVENT_RECORD_FLOATS = 4 as const;
export const CLOUD_EVENT_RECORD_UINTS = 12 as const;

export interface CloudProductionBufferCapacities {
    owners: number;
    features: number;
    events: number;
    eventReferences: number;
}

export const DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES:
CloudProductionBufferCapacities = Object.freeze({
    owners: 64,
    features: 256,
    events: 1_024,
    eventReferences: 8_192,
});

export interface CloudProductionOwnerOffset {
    ownerId: number;
    sourceId: string;
    ownerIndex: number;
    featureStart: number;
    featureCount: number;
}

export interface CloudProductionBuffersV1 {
    schemaVersion: typeof CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION;
    capacities: CloudProductionBufferCapacities;
    ownerCount: number;
    featureCount: number;
    eventCount: number;
    eventReferenceCount: number;
    droppedOwners: number;
    droppedFeatures: number;
    droppedEvents: number;
    droppedEventReferences: number;
    headerUints: Uint32Array;
    ownerFloats: Float32Array;
    ownerUints: Uint32Array;
    featureFloats: Float32Array;
    featureUints: Uint32Array;
    eventFloats: Float32Array;
    eventUints: Uint32Array;
    eventReferenceUints: Uint32Array;
    ownerOffsets: readonly CloudProductionOwnerOffset[];
    events: readonly CloudLifecycleEventV2[];
    fingerprint: string;
}

export interface CloudProductionBufferIssue {
    code: string;
    subject: string;
    message: string;
}

const EVENT_KIND_CODE: Record<CloudLifecycleEventKind, number> = {
    birth: 1,
    growth: 2,
    merge: 3,
    split: 4,
    glaciation: 5,
    "precipitation-onset": 6,
    "feature-attach": 7,
    "feature-detach": 8,
    decay: 9,
    death: 10,
};

const positiveInteger = (value: number, fallback: number) =>
    Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

const normalizedCapacities = (
    value?: Partial<CloudProductionBufferCapacities>,
): CloudProductionBufferCapacities => ({
    owners: positiveInteger(
        value?.owners ?? DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.owners,
        DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.owners,
    ),
    features: positiveInteger(
        value?.features ?? DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.features,
        DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.features,
    ),
    events: positiveInteger(
        value?.events ?? DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.events,
        DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.events,
    ),
    eventReferences: positiveInteger(
        value?.eventReferences ??
            DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.eventReferences,
        DEFAULT_CLOUD_PRODUCTION_BUFFER_CAPACITIES.eventReferences,
    ),
});

const sortedSystems = (
    systems: readonly CompiledCloudSystemV2[],
): readonly CompiledCloudSystemV2[] => [...systems].sort((left, right) =>
    left.owner.ownerId - right.owner.ownerId ||
    left.owner.sourceId.localeCompare(right.owner.sourceId));

const uniqueEvents = (
    systems: readonly CompiledCloudSystemV2[],
): readonly CloudLifecycleEventV2[] => {
    const byId = new Map<string, CloudLifecycleEventV2>();
    for (const system of systems) {
        for (const event of system.events) {
            const previous = byId.get(event.id);
            if (!previous || event.simulationTimeSeconds <
                previous.simulationTimeSeconds) {
                byId.set(event.id, event);
            }
        }
    }
    return [...byId.values()].sort((left, right) =>
        left.simulationTimeSeconds - right.simulationTimeSeconds ||
        left.step - right.step || left.id.localeCompare(right.id));
};

const hashTypedArray = (
    hash: number,
    array: ArrayBufferView,
): number => {
    const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength,
    );
    let result = hash >>> 0;
    for (const byte of bytes) {
        result ^= byte;
        result = Math.imul(result, 0x01000193);
    }
    return result >>> 0;
};

const fingerprintFor = (
    arrays: readonly ArrayBufferView[],
): string => {
    let hash = 0x811c9dc5;
    for (const array of arrays) hash = hashTypedArray(hash, array);
    return hash.toString(16).padStart(8, "0");
};

const payloadStatistics = (
    payload: Readonly<Record<string, number | string | boolean>>,
): readonly [sum: number, maximumMagnitude: number, numericCount: number] => {
    let sum = 0;
    let maximumMagnitude = 0;
    let numericCount = 0;
    for (const value of Object.values(payload)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        sum += value;
        maximumMagnitude = Math.max(maximumMagnitude, Math.abs(value));
        numericCount += 1;
    }
    return [sum, maximumMagnitude, numericCount];
};

export const buildCloudProductionBuffersV1 = (
    inputSystems: readonly CompiledCloudSystemV2[],
    requestedCapacities?: Partial<CloudProductionBufferCapacities>,
): CloudProductionBuffersV1 => {
    const capacities = normalizedCapacities(requestedCapacities);
    const allSystems = sortedSystems(inputSystems);
    const systems = allSystems.slice(0, capacities.owners);
    const includedOwnerIds = new Set(systems.map(({ owner }) => owner.ownerId));

    const headerUints = new Uint32Array(CLOUD_PRODUCTION_HEADER_UINTS);
    const ownerFloats = new Float32Array(
        capacities.owners * CLOUD_OWNER_RECORD_V2_FLOATS,
    );
    const ownerUints = new Uint32Array(
        capacities.owners * CLOUD_OWNER_RECORD_V2_UINTS,
    );
    const featureFloats = new Float32Array(
        capacities.features * CLOUD_FEATURE_RECORD_V2_FLOATS,
    );
    const featureUints = new Uint32Array(
        capacities.features * CLOUD_FEATURE_RECORD_V2_UINTS,
    );
    const eventFloats = new Float32Array(
        capacities.events * CLOUD_EVENT_RECORD_FLOATS,
    );
    const eventUints = new Uint32Array(
        capacities.events * CLOUD_EVENT_RECORD_UINTS,
    );
    const eventReferenceUints = new Uint32Array(capacities.eventReferences);

    const ownerOffsets: CloudProductionOwnerOffset[] = [];
    const includedFeatureIds = new Set<number>();
    let featureCount = 0;
    let droppedFeatures = 0;

    systems.forEach((system, ownerIndex) => {
        const activeFeatures = system.features.filter(({ active }) => active);
        const availableFeatures = Math.max(0, capacities.features - featureCount);
        const selectedFeatures = activeFeatures.slice(0, availableFeatures);
        droppedFeatures += activeFeatures.length - selectedFeatures.length;
        const featureStart = featureCount;
        const packed = packCloudSystemV2({
            ...system,
            owner: {
                ...system.owner,
                featureStart,
                featureCount: selectedFeatures.length,
            },
            features: selectedFeatures,
        });
        ownerFloats.set(
            packed.ownerFloats,
            ownerIndex * CLOUD_OWNER_RECORD_V2_FLOATS,
        );
        ownerUints.set(
            packed.ownerUints,
            ownerIndex * CLOUD_OWNER_RECORD_V2_UINTS,
        );
        featureFloats.set(
            packed.featureFloats,
            featureStart * CLOUD_FEATURE_RECORD_V2_FLOATS,
        );
        featureUints.set(
            packed.featureUints,
            featureStart * CLOUD_FEATURE_RECORD_V2_UINTS,
        );
        for (const feature of selectedFeatures) {
            includedFeatureIds.add(feature.featureId);
        }
        featureCount += selectedFeatures.length;
        ownerOffsets.push({
            ownerId: system.owner.ownerId,
            sourceId: system.owner.sourceId,
            ownerIndex,
            featureStart,
            featureCount: selectedFeatures.length,
        });
    });

    const allEvents = uniqueEvents(allSystems);
    const selectedEvents: CloudLifecycleEventV2[] = [];
    let eventReferenceCount = 0;
    let droppedEventReferences = 0;

    for (const event of allEvents) {
        if (selectedEvents.length >= capacities.events) break;
        const ownerIds = event.ownerIds.filter((id) => includedOwnerIds.has(id));
        const featureIds = event.featureIds.filter((id) =>
            includedFeatureIds.has(id));
        const parentIds = event.parentEventIds.map(cloudStableNumericId);
        const requiredReferences = ownerIds.length + featureIds.length +
            parentIds.length;
        if (requiredReferences === 0 ||
            eventReferenceCount + requiredReferences > capacities.eventReferences) {
            droppedEventReferences += requiredReferences;
            continue;
        }

        const eventIndex = selectedEvents.length;
        const ownerReferenceStart = eventReferenceCount;
        eventReferenceUints.set(ownerIds, eventReferenceCount);
        eventReferenceCount += ownerIds.length;
        const featureReferenceStart = eventReferenceCount;
        eventReferenceUints.set(featureIds, eventReferenceCount);
        eventReferenceCount += featureIds.length;
        const parentReferenceStart = eventReferenceCount;
        eventReferenceUints.set(parentIds, eventReferenceCount);
        eventReferenceCount += parentIds.length;

        const [payloadSum, payloadMaximum, numericCount] = payloadStatistics(
            event.payload,
        );
        eventFloats.set([
            event.simulationTimeSeconds,
            payloadSum,
            payloadMaximum,
            numericCount,
        ], eventIndex * CLOUD_EVENT_RECORD_FLOATS);
        eventUints.set([
            cloudStableNumericId(event.id),
            EVENT_KIND_CODE[event.kind],
            event.step,
            ownerReferenceStart,
            ownerIds.length,
            featureReferenceStart,
            featureIds.length,
            parentReferenceStart,
            parentIds.length,
            cloudStableNumericId(JSON.stringify(event.payload)),
            0,
            0,
        ], eventIndex * CLOUD_EVENT_RECORD_UINTS);
        selectedEvents.push(event);
    }

    const droppedOwners = allSystems.length - systems.length;
    const droppedEvents = allEvents.length - selectedEvents.length;
    headerUints.set([
        CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION,
        systems.length,
        featureCount,
        selectedEvents.length,
        droppedOwners,
        droppedFeatures,
        droppedEvents,
        eventReferenceCount,
    ]);
    const fingerprint = fingerprintFor([
        headerUints,
        ownerFloats,
        ownerUints,
        featureFloats,
        featureUints,
        eventFloats,
        eventUints,
        eventReferenceUints,
    ]);

    return {
        schemaVersion: CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION,
        capacities,
        ownerCount: systems.length,
        featureCount,
        eventCount: selectedEvents.length,
        eventReferenceCount,
        droppedOwners,
        droppedFeatures,
        droppedEvents,
        droppedEventReferences,
        headerUints,
        ownerFloats,
        ownerUints,
        featureFloats,
        featureUints,
        eventFloats,
        eventUints,
        eventReferenceUints,
        ownerOffsets,
        events: selectedEvents,
        fingerprint,
    };
};

const finiteArray = (array: Float32Array) =>
    array.every((value) => Number.isFinite(value));

export const validateCloudProductionBuffersV1 = (
    buffers: CloudProductionBuffersV1,
): readonly CloudProductionBufferIssue[] => {
    const issues: CloudProductionBufferIssue[] = [];
    const issue = (code: string, subject: string, message: string) =>
        issues.push({ code, subject, message });

    if (buffers.schemaVersion !== CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION) {
        issue("unsupported-schema", "buffers",
            `Expected schema ${CLOUD_PRODUCTION_BUFFER_SCHEMA_VERSION}.`);
    }
    if (buffers.headerUints[1] !== buffers.ownerCount ||
        buffers.headerUints[2] !== buffers.featureCount ||
        buffers.headerUints[3] !== buffers.eventCount ||
        buffers.headerUints[7] !== buffers.eventReferenceCount) {
        issue("header-count-mismatch", "header",
            "Header counts must match the populated production buffers.");
    }
    if (buffers.ownerCount > buffers.capacities.owners ||
        buffers.featureCount > buffers.capacities.features ||
        buffers.eventCount > buffers.capacities.events ||
        buffers.eventReferenceCount > buffers.capacities.eventReferences) {
        issue("capacity-overflow", "buffers",
            "Populated counts exceed declared fixed capacities.");
    }
    if (!finiteArray(buffers.ownerFloats) ||
        !finiteArray(buffers.featureFloats) ||
        !finiteArray(buffers.eventFloats)) {
        issue("non-finite-buffer", "floats",
            "GPU float records must remain finite.");
    }

    const ownerIds = new Set<number>();
    for (const offset of buffers.ownerOffsets) {
        if (ownerIds.has(offset.ownerId)) {
            issue("duplicate-owner-id", offset.sourceId,
                "Stable owner IDs must be unique in one frame.");
        }
        ownerIds.add(offset.ownerId);
        if (offset.featureStart + offset.featureCount > buffers.featureCount) {
            issue("feature-range-overflow", offset.sourceId,
                "Owner feature range exceeds the populated feature buffer.");
        }
        const uintOffset = offset.ownerIndex * CLOUD_OWNER_RECORD_V2_UINTS;
        if (buffers.ownerUints[uintOffset + 5] !== offset.featureStart ||
            buffers.ownerUints[uintOffset + 6] !== offset.featureCount) {
            issue("packed-feature-range-mismatch", offset.sourceId,
                "Packed owner feature offsets were not rebased globally.");
        }
    }

    const featureIds = new Set<number>();
    for (let index = 0; index < buffers.featureCount; index += 1) {
        const offset = index * CLOUD_FEATURE_RECORD_V2_UINTS;
        const featureId = buffers.featureUints[offset];
        const parentOwnerId = buffers.featureUints[offset + 1];
        if (featureIds.has(featureId)) {
            issue("duplicate-feature-id", String(featureId),
                "Feature identities must be unique across the production frame.");
        }
        featureIds.add(featureId);
        if (!ownerIds.has(parentOwnerId)) {
            issue("detached-feature", String(buffers.featureUints[offset]),
                "Packed features must reference an included owner.");
        }
    }
    for (let index = 0; index < buffers.eventCount; index += 1) {
        const offset = index * CLOUD_EVENT_RECORD_UINTS;
        for (const pair of [[3, 4], [5, 6], [7, 8]] as const) {
            const start = buffers.eventUints[offset + pair[0]];
            const count = buffers.eventUints[offset + pair[1]];
            if (start + count > buffers.eventReferenceCount) {
                issue("event-reference-overflow", String(index),
                    "Event reference range exceeds the populated reference buffer.");
            }
        }
    }
    return issues;
};

export const CLOUD_PRODUCTION_BUFFERS_WGSL = /* wgsl */ `
struct CloudProductionHeaderV1 {
    schema_version: u32,
    owner_count: u32,
    feature_count: u32,
    event_count: u32,
    dropped_owner_count: u32,
    dropped_feature_count: u32,
    dropped_event_count: u32,
    event_reference_count: u32,
};

struct CloudOwnerFloatRecordV2 {
    lanes: array<vec4<f32>, 8>,
};

struct CloudOwnerUintRecordV2 {
    lanes: array<vec4<u32>, 2>,
};

struct CloudFeatureFloatRecordV2 {
    lanes: array<vec4<f32>, 6>,
};

struct CloudFeatureUintRecordV2 {
    lanes: array<vec4<u32>, 2>,
};

struct CloudLifecycleEventFloatRecordV1 {
    values: vec4<f32>,
};

struct CloudLifecycleEventUintRecordV1 {
    lanes: array<vec4<u32>, 3>,
};
`;

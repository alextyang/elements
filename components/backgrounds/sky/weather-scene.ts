import {
    createDeepConvectionLightningEventContract,
    type DeepConvectionElectricalSource,
    type DeepConvectionLightningEventContractInput,
} from "./deep-convection-electrical";
import {
    WEATHER_PHENOMENA_SCHEMA,
    createAuroralCurtainState,
    createBlowingBoundaryLayerState,
    createDropletOpticalPhenomenonState,
    createLightningEventState,
    createOrientedIcePhenomenonState,
    weatherPhenomenonShaderSeed,
    type AuroralCurtainInput,
    type AuroralCurtainState,
    type BlowingBoundaryLayerInput,
    type BlowingBoundaryLayerState,
    type DropletOpticalPhenomenonInput,
    type DropletOpticalPhenomenonState,
    type LightningEventInput,
    type LightningEventState,
    type OrientedIcePhenomenonInput,
    type OrientedIcePhenomenonState,
} from "./weather-optical-phenomena";

/** Fixed production capacities mirrored by weather-scene-abi.ts. */
export const WEATHER_SCENE_MAX_DROPLET_OWNERS = 36;
export const WEATHER_SCENE_MAX_ICE_OWNERS = 36;
export const WEATHER_SCENE_MAX_AURORA_CURTAINS = 4;
export const WEATHER_SCENE_MAX_BLOWING_MEDIA = 8;
export const WEATHER_SCENE_MAX_LIGHTNING_EVENTS = 1;
export const WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS = 128;
export const WEATHER_SCENE_MAX_LIGHTNING_PULSES = 4;
export const WEATHER_SCENE_MAX_OWNER_INDEX = 65_535;

export interface WeatherSceneClockAuthoring {
    /** Monotonic renderer clock captured when this immutable scene was resolved. */
    snapshotTimeSeconds: number;
    /** Deterministic authored scene time at the snapshot. */
    sceneTimeSeconds: number;
    /** Unsigned 32-bit seed; its f32 shader twin is resolved once on the CPU. */
    deterministicSeed: number;
}

export interface ResolvedWeatherSceneClock extends WeatherSceneClockAuthoring {
    shaderSeed: number;
}

export interface WeatherOpticalOwnerAuthoring<Input> {
    /** Index of the authoritative finite density owner in the production scene. */
    ownerIndex: number;
    input: Input;
}

export interface DirectWeatherLightningAuthoring {
    kind: "direct";
    /** Authoritative finite convective-density owner in the production scene. */
    ownerIndex: number;
    eventStartSceneTimeSeconds: number;
    input: LightningEventInput;
}

export interface DeepConvectionWeatherLightningAuthoring {
    kind: "deep-convection";
    /** Authoritative finite convective-density owner in the production scene. */
    ownerIndex: number;
    eventStartSceneTimeSeconds: number;
    source: DeepConvectionElectricalSource;
    contract: DeepConvectionLightningEventContractInput;
}

export type WeatherLightningAuthoring =
    | DirectWeatherLightningAuthoring
    | DeepConvectionWeatherLightningAuthoring;

/**
 * Renderer-independent production authoring. Every spatial phenomenon is
 * world-space and finite; this contract contains no camera, viewport, alpha,
 * exposure, bloom, or screen-space placement controls.
 */
export interface ProductionWeatherSceneAuthoring {
    schema?: typeof WEATHER_PHENOMENA_SCHEMA;
    clock: WeatherSceneClockAuthoring;
    dropletOpticalOwners?: readonly WeatherOpticalOwnerAuthoring<
        DropletOpticalPhenomenonInput>[];
    orientedIceOpticalOwners?: readonly WeatherOpticalOwnerAuthoring<
        OrientedIcePhenomenonInput>[];
    lightning?: WeatherLightningAuthoring;
    auroraCurtains?: readonly AuroralCurtainInput[];
    blowingBoundaryMedia?: readonly BlowingBoundaryLayerInput[];
}

export type WeatherSceneDiagnosticFamily =
    | "scene"
    | "clock"
    | "droplet-optics"
    | "oriented-ice"
    | "lightning"
    | "aurora"
    | "blowing-medium";

export interface WeatherSceneDiagnostic {
    family: WeatherSceneDiagnosticFamily;
    index: number;
    code: string;
    reasons: readonly string[];
}

export interface ResolvedWeatherOpticalOwner<State> {
    ownerIndex: number;
    state: State;
}

export interface ResolvedWeatherLightningEvent {
    ownerIndex: number;
    eventStartSceneTimeSeconds: number;
    state: LightningEventState;
}

export interface ResolvedProductionWeatherScene {
    schema: typeof WEATHER_PHENOMENA_SCHEMA;
    clock: ResolvedWeatherSceneClock;
    dropletOpticalOwners: readonly ResolvedWeatherOpticalOwner<
        DropletOpticalPhenomenonState>[];
    orientedIceOpticalOwners: readonly ResolvedWeatherOpticalOwner<
        OrientedIcePhenomenonState>[];
    lightning: ResolvedWeatherLightningEvent | null;
    auroraCurtains: readonly AuroralCurtainState[];
    blowingBoundaryMedia: readonly BlowingBoundaryLayerState[];
    valid: boolean;
    diagnostics: readonly WeatherSceneDiagnostic[];
}

const zeroClock = (): ResolvedWeatherSceneClock => ({
    snapshotTimeSeconds: 0,
    sceneTimeSeconds: 0,
    deterministicSeed: 0,
    shaderSeed: weatherPhenomenonShaderSeed(0),
});

const resolveClock = (
    input: WeatherSceneClockAuthoring,
    diagnostics: WeatherSceneDiagnostic[],
): ResolvedWeatherSceneClock => {
    const reasons: string[] = [];
    if (!Number.isFinite(input.snapshotTimeSeconds) ||
        input.snapshotTimeSeconds < 0) {
        reasons.push("snapshot-time-is-invalid");
    }
    if (!Number.isFinite(input.sceneTimeSeconds) || input.sceneTimeSeconds < 0) {
        reasons.push("scene-time-is-invalid");
    }
    if (!Number.isSafeInteger(input.deterministicSeed) ||
        input.deterministicSeed < 0 || input.deterministicSeed > 0xffff_ffff) {
        reasons.push("deterministic-seed-is-not-uint32");
    }
    if (reasons.length > 0) {
        diagnostics.push({ family: "clock", index: 0,
            code: "invalid-scene-clock", reasons });
        return zeroClock();
    }
    const deterministicSeed = input.deterministicSeed >>> 0;
    return {
        snapshotTimeSeconds: input.snapshotTimeSeconds,
        sceneTimeSeconds: input.sceneTimeSeconds,
        deterministicSeed,
        shaderSeed: weatherPhenomenonShaderSeed(deterministicSeed),
    };
};

const ownerIndexReasons = (ownerIndex: number) => {
    const reasons: string[] = [];
    if (!Number.isInteger(ownerIndex) || ownerIndex < 0 ||
        ownerIndex > WEATHER_SCENE_MAX_OWNER_INDEX) {
        reasons.push("owner-index-is-outside-exact-production-range");
    }
    return reasons;
};

const addCapacityDiagnostic = (
    diagnostics: WeatherSceneDiagnostic[],
    family: WeatherSceneDiagnosticFamily,
    count: number,
    capacity: number,
) => {
    if (count <= capacity) return;
    diagnostics.push({
        family,
        index: capacity,
        code: "scene-capacity-exceeded",
        reasons: [`authored-${count}-capacity-${capacity}`],
    });
};

const nonFiniteStateReasons = (value: unknown, path = "state"): string[] => {
    if (typeof value === "number") {
        return Number.isFinite(value) ? [] : [`${path}-contains-non-finite-number`];
    }
    if (!value || typeof value !== "object") return [];
    const reasons: string[] = [];
    for (const [key, child] of Object.entries(value)) {
        reasons.push(...nonFiniteStateReasons(child, `${path}.${key}`));
    }
    return reasons;
};

const copyDeepConvectionLightningInput = (
    input: NonNullable<ReturnType<
        typeof createDeepConvectionLightningEventContract>["eventInput"]>,
): LightningEventInput => ({
    ...input,
    owner: { ...input.owner },
    negativeCharge: {
        ...input.negativeCharge,
        centerEastAltitudeNorthKm: [...input.negativeCharge
            .centerEastAltitudeNorthKm],
    },
    positiveCharge: {
        ...input.positiveCharge,
        centerEastAltitudeNorthKm: [...input.positiveCharge
            .centerEastAltitudeNorthKm],
    },
    guideControlPointsEastAltitudeNorthKm:
        input.guideControlPointsEastAltitudeNorthKm.map((point) => [...point]),
});

const resolveLightning = (
    input: WeatherLightningAuthoring | undefined,
    diagnostics: WeatherSceneDiagnostic[],
): ResolvedWeatherLightningEvent | null => {
    if (!input) return null;
    if (!Number.isFinite(input.eventStartSceneTimeSeconds) ||
        input.eventStartSceneTimeSeconds < 0) {
        diagnostics.push({ family: "lightning", index: 0,
            code: "invalid-lightning-event-clock",
            reasons: ["event-start-scene-time-is-invalid"] });
        return null;
    }
    const ownerReasons = ownerIndexReasons(input.ownerIndex);
    if (ownerReasons.length > 0) {
        diagnostics.push({ family: "lightning", index: 0,
            code: "invalid-lightning-owner-index", reasons: ownerReasons });
        return null;
    }
    let eventInput: LightningEventInput | null = null;
    if (input.kind === "direct") {
        eventInput = input.input;
    } else {
        const contract = createDeepConvectionLightningEventContract(
            input.source,
            input.contract,
        );
        if (!contract.eventInput) {
            diagnostics.push({ family: "lightning", index: 0,
                code: "invalid-deep-convection-lightning-contract",
                reasons: contract.reasons });
            return null;
        }
        eventInput = copyDeepConvectionLightningInput(contract.eventInput);
    }
    const state = createLightningEventState(eventInput);
    const reasons = [...state.validity.reasons];
    reasons.push(...nonFiniteStateReasons(state));
    if (state.channelSegments.length > WEATHER_SCENE_MAX_LIGHTNING_SEGMENTS) {
        reasons.push("lightning-segment-capacity-exceeded");
    }
    if (state.pulses.length > WEATHER_SCENE_MAX_LIGHTNING_PULSES) {
        reasons.push("lightning-pulse-capacity-exceeded");
    }
    if (!state.validity.valid || reasons.length > 0) {
        diagnostics.push({ family: "lightning", index: 0,
            code: "invalid-lightning-event", reasons });
        return null;
    }
    return { ownerIndex: input.ownerIndex,
        eventStartSceneTimeSeconds: input.eventStartSceneTimeSeconds, state };
};

/**
 * Resolve and strictly bound one authoring snapshot. Invalid entries are
 * rejected, never coerced into a different physical phenomenon. The valid
 * subset remains available for diagnostics and deterministic tooling, while
 * `valid` tells production callers whether the complete authoring was accepted.
 */
export function resolveProductionWeatherScene(
    authoring: ProductionWeatherSceneAuthoring,
): ResolvedProductionWeatherScene {
    const diagnostics: WeatherSceneDiagnostic[] = [];
    if (authoring.schema !== undefined &&
        authoring.schema !== WEATHER_PHENOMENA_SCHEMA) {
        diagnostics.push({ family: "scene", index: 0,
            code: "unsupported-weather-scene-schema",
            reasons: [`schema-${authoring.schema}`] });
    }
    const clock = resolveClock(authoring.clock, diagnostics);

    const dropletOpticalOwners: ResolvedWeatherOpticalOwner<
        DropletOpticalPhenomenonState>[] = [];
    const dropletInputs = authoring.dropletOpticalOwners ?? [];
    addCapacityDiagnostic(diagnostics, "droplet-optics", dropletInputs.length,
        WEATHER_SCENE_MAX_DROPLET_OWNERS);
    const dropletOwnerIndices = new Set<number>();
    for (let index = 0; index < Math.min(dropletInputs.length,
        WEATHER_SCENE_MAX_DROPLET_OWNERS); index += 1) {
        const entry = dropletInputs[index];
        const reasons = ownerIndexReasons(entry.ownerIndex);
        if (dropletOwnerIndices.has(entry.ownerIndex)) {
            reasons.push("duplicate-droplet-owner-index");
        }
        const state = createDropletOpticalPhenomenonState(entry.input);
        reasons.push(...state.validity.reasons);
        reasons.push(...nonFiniteStateReasons(state));
        if (state.lobes.length > 6) {
            reasons.push("droplet-lobe-capacity-exceeded");
        }
        if (!state.validity.valid || reasons.length > 0) {
            diagnostics.push({ family: "droplet-optics", index,
                code: "invalid-droplet-optical-owner", reasons });
            continue;
        }
        dropletOwnerIndices.add(entry.ownerIndex);
        dropletOpticalOwners.push({ ownerIndex: entry.ownerIndex, state });
    }

    const orientedIceOpticalOwners: ResolvedWeatherOpticalOwner<
        OrientedIcePhenomenonState>[] = [];
    const iceInputs = authoring.orientedIceOpticalOwners ?? [];
    addCapacityDiagnostic(diagnostics, "oriented-ice", iceInputs.length,
        WEATHER_SCENE_MAX_ICE_OWNERS);
    const iceOwnerIndices = new Set<number>();
    for (let index = 0; index < Math.min(iceInputs.length,
        WEATHER_SCENE_MAX_ICE_OWNERS); index += 1) {
        const entry = iceInputs[index];
        const reasons = ownerIndexReasons(entry.ownerIndex);
        if (iceOwnerIndices.has(entry.ownerIndex)) {
            reasons.push("duplicate-ice-owner-index");
        }
        const state = createOrientedIcePhenomenonState(entry.input);
        reasons.push(...state.validity.reasons);
        reasons.push(...nonFiniteStateReasons(state));
        if (state.features.length > 6) {
            reasons.push("oriented-ice-feature-capacity-exceeded");
        }
        if (!state.validity.valid || reasons.length > 0) {
            diagnostics.push({ family: "oriented-ice", index,
                code: "invalid-oriented-ice-owner", reasons });
            continue;
        }
        iceOwnerIndices.add(entry.ownerIndex);
        orientedIceOpticalOwners.push({ ownerIndex: entry.ownerIndex, state });
    }

    const lightning = resolveLightning(authoring.lightning, diagnostics);

    const auroraCurtains: AuroralCurtainState[] = [];
    const auroraInputs = authoring.auroraCurtains ?? [];
    addCapacityDiagnostic(diagnostics, "aurora", auroraInputs.length,
        WEATHER_SCENE_MAX_AURORA_CURTAINS);
    for (let index = 0; index < Math.min(auroraInputs.length,
        WEATHER_SCENE_MAX_AURORA_CURTAINS); index += 1) {
        const state = createAuroralCurtainState(auroraInputs[index]);
        const reasons = [...state.validity.reasons,
            ...nonFiniteStateReasons(state)];
        if (!state.validity.valid || reasons.length > 0) {
            diagnostics.push({ family: "aurora", index,
                code: "invalid-auroral-curtain", reasons });
            continue;
        }
        auroraCurtains.push(state);
    }

    const blowingBoundaryMedia: BlowingBoundaryLayerState[] = [];
    const blowingInputs = authoring.blowingBoundaryMedia ?? [];
    addCapacityDiagnostic(diagnostics, "blowing-medium", blowingInputs.length,
        WEATHER_SCENE_MAX_BLOWING_MEDIA);
    for (let index = 0; index < Math.min(blowingInputs.length,
        WEATHER_SCENE_MAX_BLOWING_MEDIA); index += 1) {
        const state = createBlowingBoundaryLayerState(blowingInputs[index]);
        const reasons = [...state.validity.reasons,
            ...nonFiniteStateReasons(state)];
        if (!state.validity.valid || reasons.length > 0) {
            diagnostics.push({ family: "blowing-medium", index,
                code: "invalid-blowing-boundary-medium",
                reasons });
            continue;
        }
        blowingBoundaryMedia.push(state);
    }

    return {
        schema: WEATHER_PHENOMENA_SCHEMA,
        clock,
        dropletOpticalOwners,
        orientedIceOpticalOwners,
        lightning,
        auroraCurtains,
        blowingBoundaryMedia,
        valid: diagnostics.length === 0,
        diagnostics,
    };
}

/** Advance an immutable snapshot with a caller-owned monotonic clock. */
export function weatherSceneTimeSeconds(
    scene: ResolvedProductionWeatherScene,
    currentTimeSeconds: number,
) {
    if (!Number.isFinite(currentTimeSeconds)) return scene.clock.sceneTimeSeconds;
    return scene.clock.sceneTimeSeconds + Math.max(0,
        currentTimeSeconds - scene.clock.snapshotTimeSeconds);
}

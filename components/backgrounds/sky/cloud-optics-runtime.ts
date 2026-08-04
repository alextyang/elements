import {
    CLOUD_OPTICS_ICE_HABITS,
    CLOUD_OPTICS_ROUGHNESSES,
    type CloudIceHabit,
    type CloudOpticsManifest,
    type CloudOpticsRow,
    type CloudParticleRoughness,
    type LoadedCloudOptics,
} from "./cloud-optics";
import {
    CLOUD_SYSTEM_MAX_COUNT,
    type CloudSystemRuntime,
    type RuntimeCloudSystem,
} from "./cloud-system-runtime";

/** One fixed, vec4-aligned material record for each physical world owner. */
export const CLOUD_OPTICS_OWNER_COUNT = CLOUD_SYSTEM_MAX_COUNT;
export const CLOUD_OPTICS_OWNER_VEC4_STRIDE = 4;
export const CLOUD_OPTICS_OWNER_STRIDE_FLOATS =
    CLOUD_OPTICS_OWNER_VEC4_STRIDE * 4;
export const CLOUD_OPTICS_OWNER_BUFFER_FLOATS =
    CLOUD_OPTICS_OWNER_COUNT * CLOUD_OPTICS_OWNER_STRIDE_FLOATS;

export const CLOUD_OPTICS_OWNER_VEC4_LAYOUT = {
    identity: 0,
    radiusRows: 1,
    radiusInterpolation: 2,
    iceRegime: 3,
} as const;

const clamp = (value: number, minimum = 0, maximum = 1) =>
    Math.min(maximum, Math.max(minimum, value));

interface RadiusBracket {
    low: CloudOpticsRow;
    high: CloudOpticsRow;
    amount: number;
}

export interface CloudIceOpticalRegime {
    habit: CloudIceHabit;
    roughness: CloudParticleRoughness;
    /** Human-readable reason retained for lab/debug inspection. */
    rationale: string;
}

export interface CloudOpticsOwnerSelection {
    ownerIndex: number;
    ownerId: string;
    layerIndex: number;
    systemIndex: number;
    liquid: RadiusBracket;
    ice: RadiusBracket;
    iceRegime: CloudIceOpticalRegime;
    defaultIceFraction: number;
    topTemperatureKelvin: number;
    /**
     * Fraction of a reconstruction footprint occupied by optically sparse
     * channels in a sub-voxel ice-fibre ensemble. This is not a density or
     * opacity multiplier: the shader reconstructs a mean-preserving optical-
     * depth distribution and its expected Beer visibility from it. Liquid
     * decks and dense ice have zero.
     */
    unresolvedIcePorosity: number;
}

export interface CloudOpticsOwnerRuntime {
    signature: string;
    activeCount: number;
    capacity: typeof CLOUD_OPTICS_OWNER_COUNT;
    data: Float32Array;
    ownerIds: readonly (string | null)[];
    selections: readonly CloudOpticsOwnerSelection[];
}

interface BufferLike {
    destroy?: () => void;
}

interface CloudOpticsOwnerGpuDevice {
    createBuffer: (descriptor: Record<string, unknown>) => BufferLike;
    queue: {
        writeBuffer: (
            buffer: BufferLike,
            bufferOffset: number,
            data: Float32Array,
        ) => void;
    };
}

export interface UploadedCloudOpticsOwners {
    buffer: BufferLike;
    runtime: CloudOpticsOwnerRuntime;
    destroy: () => void;
}

const manifestOf = (optics: CloudOpticsManifest | LoadedCloudOptics) =>
    "manifest" in optics ? optics.manifest : optics;

const bracketRows = (
    rows: readonly CloudOpticsRow[],
    effectiveRadiusMicrons: number,
): RadiusBracket => {
    const sorted = [...rows].sort((left, right) =>
        left.effectiveRadiusMicrons - right.effectiveRadiusMicrons);
    if (!sorted.length) throw new Error("Cloud optical radius family has no rows");
    if (effectiveRadiusMicrons <= sorted[0].effectiveRadiusMicrons) {
        return { low: sorted[0], high: sorted[0], amount: 0 };
    }
    const last = sorted[sorted.length - 1];
    if (effectiveRadiusMicrons >= last.effectiveRadiusMicrons) {
        return { low: last, high: last, amount: 0 };
    }
    const highIndex = sorted.findIndex((row) =>
        row.effectiveRadiusMicrons >= effectiveRadiusMicrons);
    const low = sorted[highIndex - 1];
    const high = sorted[highIndex];
    // Radius-dependent Mie structure evolves more evenly in log size than in
    // linear size, especially across the broad 10–90 µm ice domain.
    const amount = (
        Math.log(effectiveRadiusMicrons) - Math.log(low.effectiveRadiusMicrons)
    ) / (
        Math.log(high.effectiveRadiusMicrons) - Math.log(low.effectiveRadiusMicrons)
    );
    return { low, high, amount };
};

/**
 * Deterministic bulk ice regime. Surface roughness is deliberately biased
 * toward natural rough crystals; smooth particles are reserved for stable,
 * nonprecipitating halo-producing veils.
 */
export const selectCloudIceOpticalRegime = (
    system: Pick<RuntimeCloudSystem, "compiled" | "state">,
): CloudIceOpticalRegime => {
    const { compiled } = system;
    const genus = compiled.classification.genus;
    const species = compiled.recipeId;
    const topTemperature = compiled.thermodynamics.topTemperatureKelvin;
    const verticalVelocity = Math.abs(compiled.thermodynamics.verticalVelocity);
    const dissipation = compiled.kinematics.turbulenceDissipation;
    const stage = compiled.lifecycle.stage;
    const precipitating = compiled.precipitation.kind !== "none" &&
        compiled.precipitation.rate > 0.05;
    const stronglyTurbulent = dissipation > 0.012 || verticalVelocity > 4;
    const aggregating = genus === "cumulonimbus" || genus === "nimbostratus" ||
        species === "cirrus-spissatus" || species.includes("floccus") ||
        precipitating || stage === "decaying" || stage === "precipitating" ||
        stage === "glaciating";
    const stableHaloVeil = genus === "cirrostratus" && !precipitating &&
        !stronglyTurbulent && stage === "mature";

    let habit: CloudIceHabit;
    let habitReason: string;
    if (aggregating) {
        habit = "aggregate";
        habitReason = "precipitation, glaciation, or turbulent collision growth";
    } else if (genus === "cirrus" &&
        (species === "cirrus-fibratus" || species === "cirrus-uncinus")) {
        habit = topTemperature < 251 ? "column" : "general";
        habitReason = "cold sedimenting cirrus columns and mixed small-crystal habits";
    } else if (stableHaloVeil && topTemperature >= 251 &&
        topTemperature <= 265) {
        habit = "plate";
        habitReason = "stable ice veil in the plate-growth temperature domain";
    } else if (stableHaloVeil && topTemperature < 251) {
        habit = "column";
        habitReason = "cold stable ice veil represented by randomized columns";
    } else {
        habit = "general";
        habitReason = "mixed natural habit population without a halo-selecting veil";
    }

    let roughness: CloudParticleRoughness;
    let roughnessReason: string;
    if (stableHaloVeil) {
        roughness = "smooth";
        roughnessReason = "stable halo-producing ice veil";
    } else if (aggregating || stronglyTurbulent) {
        roughness = "severe";
        roughnessReason = "natural roughening from turbulence, collision, or sublimation";
    } else {
        roughness = "moderate";
        roughnessReason = "ordinary randomly oriented atmospheric ice";
    }
    return {
        habit,
        roughness,
        rationale: `${habitReason}; ${roughnessReason}`,
    };
};

const selectionForSystem = (
    system: RuntimeCloudSystem,
    ownerIndex: number,
    manifest: CloudOpticsManifest,
): CloudOpticsOwnerSelection => {
    const iceRegime = selectCloudIceOpticalRegime(system);
    const liquid = bracketRows(
        manifest.rows.filter((row) => row.phase === "liquid"),
        system.compiled.material.liquidEffectiveRadiusMicrons,
    );
    const ice = bracketRows(
        manifest.rows.filter((row) =>
            row.phase === "ice" &&
            row.habit === iceRegime.habit &&
            row.roughness === iceRegime.roughness),
        system.compiled.material.iceEffectiveRadiusMicrons,
    );
    const species = system.compiled.recipeId;
    // Thin Cirrus is a sparse population of fine ice crystals rather than a
    // homogeneous white slab. Encode only the unresolved areal distribution;
    // resolved atlas mass and world density remain authoritative. Camera Beer
    // and the multi-ray source field evaluate that distribution's expected
    // transmittance. Fibratus needs the strongest sub-footprint
    // porosity, while denser hooks/tufts and spissatus retain progressively
    // less. This field is consumed as a mean-preserving two-point tau mixture.
    const unresolvedIcePorosity = species === "cirrus-fibratus" ? 0.76
        : species === "cirrus-uncinus" ? 0.58
        : species === "cirrus-floccus" ? 0.34
        : species === "cirrus-castellanus" ? 0.24
        : species === "cirrus-spissatus" ? 0.08
        : 0;
    return {
        ownerIndex,
        ownerId: system.state.id,
        layerIndex: system.layerIndex,
        systemIndex: system.systemIndex,
        liquid,
        ice,
        iceRegime,
        defaultIceFraction: clamp(1 - system.compiled.material.liquidFraction01),
        topTemperatureKelvin: system.compiled.thermodynamics.topTemperatureKelvin,
        unresolvedIcePorosity,
    };
};

const setVec4 = (
    target: Float32Array,
    ownerIndex: number,
    vectorIndex: number,
    values: readonly number[],
) => target.set(
    values,
    ownerIndex * CLOUD_OPTICS_OWNER_STRIDE_FLOATS + vectorIndex * 4,
);

/**
 * Packs exactly the same owner index order used by `packCloudSystems`.
 * Inactive records keep their explicit index and negative layer/system IDs.
 */
export const createCloudOpticsOwnerRuntime = (
    runtime: CloudSystemRuntime,
    optics: CloudOpticsManifest | LoadedCloudOptics,
): CloudOpticsOwnerRuntime => {
    const manifest = manifestOf(optics);
    const activeCount = Math.min(runtime.systems.length, CLOUD_OPTICS_OWNER_COUNT);
    const data = new Float32Array(CLOUD_OPTICS_OWNER_BUFFER_FLOATS);
    const ownerIds: (string | null)[] = Array(CLOUD_OPTICS_OWNER_COUNT).fill(null);
    for (let ownerIndex = 0; ownerIndex < CLOUD_OPTICS_OWNER_COUNT; ownerIndex += 1) {
        setVec4(data, ownerIndex, CLOUD_OPTICS_OWNER_VEC4_LAYOUT.identity,
            [0, ownerIndex, -1, -1]);
    }
    const selections: CloudOpticsOwnerSelection[] = [];
    for (let ownerIndex = 0; ownerIndex < activeCount; ownerIndex += 1) {
        const system = runtime.systems[ownerIndex];
        const selection = selectionForSystem(system, ownerIndex, manifest);
        selections.push(selection);
        ownerIds[ownerIndex] = selection.ownerId;
        setVec4(data, ownerIndex, CLOUD_OPTICS_OWNER_VEC4_LAYOUT.identity, [
            1,
            ownerIndex,
            selection.layerIndex,
            selection.systemIndex,
        ]);
        setVec4(data, ownerIndex, CLOUD_OPTICS_OWNER_VEC4_LAYOUT.radiusRows, [
            selection.liquid.low.phaseRow,
            selection.liquid.high.phaseRow,
            selection.ice.low.phaseRow,
            selection.ice.high.phaseRow,
        ]);
        setVec4(data, ownerIndex, CLOUD_OPTICS_OWNER_VEC4_LAYOUT.radiusInterpolation, [
            selection.liquid.amount,
            selection.ice.amount,
            system.compiled.material.liquidEffectiveRadiusMicrons,
            system.compiled.material.iceEffectiveRadiusMicrons,
        ]);
        setVec4(data, ownerIndex, CLOUD_OPTICS_OWNER_VEC4_LAYOUT.iceRegime, [
            CLOUD_OPTICS_ICE_HABITS.indexOf(selection.iceRegime.habit),
            CLOUD_OPTICS_ROUGHNESSES.indexOf(selection.iceRegime.roughness) / 2,
            selection.defaultIceFraction,
            selection.unresolvedIcePorosity,
        ]);
    }
    return {
        signature: `${runtime.signature}:${manifest.checksums.phaseTexture}`,
        activeCount,
        capacity: CLOUD_OPTICS_OWNER_COUNT,
        data,
        ownerIds,
        selections,
    };
};

/** Creates binding 24's fixed-size read-only storage buffer. */
export const uploadCloudOpticsOwnerRuntime = (
    device: CloudOpticsOwnerGpuDevice,
    runtime: CloudOpticsOwnerRuntime,
    usage = 0x08 | 0x80, // GPUBufferUsage.COPY_DST | STORAGE
): UploadedCloudOpticsOwners => {
    const buffer = device.createBuffer({
        label: "cloud optical owner blends (36 physical systems)",
        size: runtime.data.byteLength,
        usage,
    });
    device.queue.writeBuffer(buffer, 0, runtime.data);
    return {
        buffer,
        runtime,
        destroy: () => buffer.destroy?.(),
    };
};

export interface ResolvedCloudLocalOptics {
    localIceFraction: number;
    massExtinctionRgbM2PerKg: [number, number, number];
    singleScatteringAlbedoRgb: [number, number, number];
    asymmetryRgb: [number, number, number];
    /** Four rows in liquid-low, liquid-high, ice-low, ice-high order. */
    rows: [number, number, number, number];
    /** Per-channel phase weights; every non-vacuum channel sums to one once. */
    phaseWeightsRgb: [
        [number, number, number, number],
        [number, number, number, number],
        [number, number, number, number],
    ];
}

/** CPU reference for the exact WGSL local-phase mixing equations. */
export const resolveCloudLocalOptics = (
    selection: CloudOpticsOwnerSelection,
    localIceFraction: number,
): ResolvedCloudLocalOptics => {
    const iceFraction = clamp(localIceFraction);
    const rows = [
        selection.liquid.low,
        selection.liquid.high,
        selection.ice.low,
        selection.ice.high,
    ] as const;
    const materialWeights = [
        (1 - iceFraction) * (1 - selection.liquid.amount),
        (1 - iceFraction) * selection.liquid.amount,
        iceFraction * (1 - selection.ice.amount),
        iceFraction * selection.ice.amount,
    ];
    const massExtinctionRgbM2PerKg = [0, 1, 2].map((channel) =>
        rows.reduce((sum, row, index) => sum +
            materialWeights[index] * row.massExtinctionRgbM2PerKg[channel], 0),
    ) as [number, number, number];
    const scatteringRgb = [0, 1, 2].map((channel) =>
        rows.reduce((sum, row, index) => sum +
            materialWeights[index] * row.massExtinctionRgbM2PerKg[channel] *
                row.singleScatteringAlbedoRgb[channel], 0),
    ) as [number, number, number];
    const singleScatteringAlbedoRgb = scatteringRgb.map((scattering, channel) =>
        scattering / Math.max(1e-12, massExtinctionRgbM2PerKg[channel]),
    ) as [number, number, number];
    const phaseWeightsRgb = [0, 1, 2].map((channel) => {
        const contributions = rows.map((row, index) =>
            materialWeights[index] * row.massExtinctionRgbM2PerKg[channel] *
                row.singleScatteringAlbedoRgb[channel]);
        const total = contributions.reduce((sum, value) => sum + value, 0);
        return contributions.map((value) => total > 0 ? value / total : 0) as
            [number, number, number, number];
    }) as ResolvedCloudLocalOptics["phaseWeightsRgb"];
    const asymmetryRgb = [0, 1, 2].map((channel) =>
        rows.reduce((sum, row, index) => sum +
            phaseWeightsRgb[channel][index] * row.asymmetryRgb[channel], 0),
    ) as [number, number, number];
    return {
        localIceFraction: iceFraction,
        massExtinctionRgbM2PerKg,
        singleScatteringAlbedoRgb,
        asymmetryRgb,
        rows: rows.map((row) => row.phaseRow) as [number, number, number, number],
        phaseWeightsRgb,
    };
};

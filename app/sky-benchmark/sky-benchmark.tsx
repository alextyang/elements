"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Sky, type SkySnapshot } from "@/components/backgrounds/sky/sky";
import {
    previewForBenchmark,
    MOON_BENCHMARK,
    type MoonBenchmarkCase,
} from "@/components/backgrounds/sky/sky-benchmark";

import styles from "./sky-benchmark.module.css";

type CaptureMode = "pair" | "render" | "reference" | "overlay";

const titleCase = (value: string) =>
    value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());

const referenceLabel = (benchmark: MoonBenchmarkCase) =>
    benchmark.referenceClass === "lunarDiscTruth"
        ? "Scientific lunar-disc truth"
        : benchmark.referenceClass === "contextualPhotograph"
            ? "Metadata-qualified photograph"
            : "Calibrated all-sky photograph";

const Reference = ({ benchmark }: { benchmark: MoonBenchmarkCase }) => (
    <div className={styles.reference} data-benchmark-reference>
        {/* Native img deliberately preserves the source photograph without Next image transforms. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            src={benchmark.comparisonImage ?? benchmark.referenceImage}
            alt={`${titleCase(benchmark.observed.condition)} sky reference`}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
        />
    </div>
);

const Render = ({
    benchmark,
    onVisualChange,
}: {
    benchmark: MoonBenchmarkCase;
    onVisualChange?: (snapshot: SkySnapshot) => void;
}) => (
    <div className={styles.render} data-benchmark-render>
        <Sky
            preview={previewForBenchmark(benchmark)}
            paused
            contained
            onVisualChange={onVisualChange}
        />
    </div>
);

export function SkyBenchmark() {
    const search = useSearchParams();
    const router = useRouter();
    const requestedCase = search.get("case");
    const requestedMode = search.get("capture") as CaptureMode | null;
    const mode: CaptureMode = ["pair", "render", "reference", "overlay"].includes(
        requestedMode ?? "",
    )
        ? requestedMode as CaptureMode
        : "pair";
    const [condition, setCondition] = useState("all");
    const [phase, setPhase] = useState("all");
    const [source, setSource] = useState("all");
    const [overlayOpacity, setOverlayOpacity] = useState(0.5);
    const [snapshot, setSnapshot] = useState<SkySnapshot>();

    const filtered = useMemo(
        () => MOON_BENCHMARK.cases.filter((entry) =>
            (condition === "all" || entry.referenceClass === condition) &&
            (phase === "all" || entry.astronomy.phaseClass === phase) &&
            (source === "all" || entry.source.id === source),
        ),
        [condition, phase, source],
    );
    const benchmark =
        MOON_BENCHMARK.cases.find((entry) => entry.id === requestedCase) ??
        filtered[0] ??
        MOON_BENCHMARK.cases[0];
    const conditions = Object.keys(MOON_BENCHMARK.summary.referenceClassCounts ?? {});
    const phases = Object.keys(MOON_BENCHMARK.summary.phaseCounts);
    const sources = Object.keys(MOON_BENCHMARK.summary.sourceCounts);

    const navigate = (id: string, nextMode = mode) => {
        router.replace(
            `/sky-benchmark?case=${encodeURIComponent(id)}&capture=${nextMode}`,
            { scroll: false },
        );
    };
    const index = filtered.findIndex((entry) => entry.id === benchmark.id);
    const adjacent = (offset: number) => {
        if (!filtered.length) return;
        const next = filtered[(Math.max(0, index) + offset + filtered.length) % filtered.length];
        navigate(next.id);
    };

    if (mode === "render") {
        return (
            <main className={styles.capture} data-benchmark-case={benchmark.id}>
                <Render benchmark={benchmark} onVisualChange={setSnapshot} />
                <output className={styles.captureReady} data-benchmark-ready>
                    {snapshot ? "ready" : "rendering"}
                </output>
            </main>
        );
    }
    if (mode === "reference") {
        return (
            <main className={styles.capture} data-benchmark-case={benchmark.id}>
                <Reference benchmark={benchmark} />
            </main>
        );
    }

    return (
        <main className={styles.page} data-benchmark-case={benchmark.id}>
            <section className={styles.viewer}>
                {mode === "overlay" ? (
                    <div className={styles.overlay}>
                        <Render benchmark={benchmark} onVisualChange={setSnapshot} />
                        <div
                            className={styles.overlayReference}
                            style={{ opacity: overlayOpacity }}
                        >
                            <Reference benchmark={benchmark} />
                        </div>
                    </div>
                ) : (
                    <div className={styles.pair}>
                        <figure>
                            <Reference benchmark={benchmark} />
                            <figcaption>{referenceLabel(benchmark)}</figcaption>
                        </figure>
                        <figure>
                            <Render benchmark={benchmark} onVisualChange={setSnapshot} />
                            <figcaption>Same-state editorial renderer</figcaption>
                        </figure>
                    </div>
                )}
            </section>

            <aside className={styles.panel}>
                <header>
                    <p className={styles.eyebrow}>Unlisted realism study</p>
                    <h1>Lunar rendering evidence</h1>
                    <p>{MOON_BENCHMARK.summary.caseCount} condition-known references</p>
                </header>

                <div className={styles.filters}>
                    <label>
                        Reference class
                        <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                            <option value="all">All reference classes</option>
                            {conditions.map((value) => (
                                <option key={value} value={value}>
                                    {titleCase(value)} ({MOON_BENCHMARK.summary.referenceClassCounts?.[value] ?? 0})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Lunar phase
                        <select value={phase} onChange={(event) => setPhase(event.target.value)}>
                            <option value="all">All regimes</option>
                            {phases.map((value) => (
                                <option key={value} value={value}>
                                    {titleCase(value)} ({MOON_BENCHMARK.summary.phaseCounts[value]})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Source
                        <select value={source} onChange={(event) => setSource(event.target.value)}>
                            <option value="all">All sources</option>
                            {sources.map((value) => (
                                <option key={value} value={value}>
                                    {titleCase(value)} ({MOON_BENCHMARK.summary.sourceCounts[value]})
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Case
                        <select value={benchmark.id} onChange={(event) => navigate(event.target.value)}>
                            {filtered.map((entry) => (
                                <option key={entry.id} value={entry.id}>
                                    {entry.id} · {titleCase(entry.astronomy.phaseClass)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        View
                        <select value={mode} onChange={(event) => navigate(benchmark.id, event.target.value as CaptureMode)}>
                            <option value="pair">Side by side</option>
                            <option value="overlay">Reference overlay</option>
                        </select>
                    </label>
                    {mode === "overlay" && (
                        <label>
                            Reference opacity {Math.round(overlayOpacity * 100)}%
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={overlayOpacity}
                                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
                            />
                        </label>
                    )}
                </div>

                <div className={styles.navigation}>
                    <button type="button" onClick={() => adjacent(-1)}>Previous</button>
                    <span>{Math.max(0, index) + 1} / {filtered.length}</span>
                    <button type="button" onClick={() => adjacent(1)}>Next</button>
                </div>

                <dl className={styles.metadata}>
                    <div><dt>UTC capture</dt><dd>{benchmark.capture.timestamp}</dd></div>
                    <div><dt>Position</dt><dd>{benchmark.capture.latitude.toFixed(3)}°, {benchmark.capture.longitude.toFixed(3)}°</dd></div>
                    <div><dt>Camera</dt><dd>{titleCase(benchmark.capture.viewDirection)}, {benchmark.capture.horizontalFov.toFixed(1)}° · {benchmark.capture.exposureMilliseconds == null ? "exposure unavailable" : `${benchmark.capture.exposureMilliseconds.toFixed(2)} ms`}</dd></div>
                    <div><dt>Sun</dt><dd>{benchmark.astronomy.solarAltitude.toFixed(1)}° altitude, {titleCase(benchmark.astronomy.solarRegime)}</dd></div>
                    <div><dt>Moon</dt><dd>{Math.round(benchmark.astronomy.lunarIllumination * 100)}% · {benchmark.astronomy.lunarAltitude.toFixed(1)}° altitude</dd></div>
                    <div><dt>Reference</dt><dd>{titleCase(benchmark.referenceClass)} · {titleCase(benchmark.observed.condition)}</dd></div>
                    {benchmark.normalization && <div><dt>Detection</dt><dd>{titleCase(benchmark.normalization.quality)} · z {benchmark.normalization.sourceMoonDetection.confidenceZ.toFixed(1)}</dd></div>}
                    <div><dt>Match</dt><dd>{benchmark.renderer.familyId} · {benchmark.renderer.aerosolType}</dd></div>
                    {snapshot && <div><dt>Result</dt><dd>{snapshot.lightingRegime} · {snapshot.visibleStars} stars</dd></div>}
                </dl>

                <footer>
                    <a href={benchmark.source.url} target="_blank" rel="noreferrer">
                        {benchmark.source.name}
                    </a>
                    <p>{benchmark.source.license}</p>
                </footer>
            </aside>
        </main>
    );
}

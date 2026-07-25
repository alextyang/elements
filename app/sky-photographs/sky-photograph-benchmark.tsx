"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Sky, type SkySnapshot } from "@/components/backgrounds/sky/sky";
import {
    previewForSkyPhotograph,
    SKY_PHOTOGRAPH_BENCHMARK,
    type SkyPhotographCase,
} from "@/components/backgrounds/sky/sky-photograph-benchmark";

import styles from "../sky-benchmark/sky-benchmark.module.css";

type CaptureMode = "pair" | "render" | "reference" | "overlay";
const titleCase = (value: string) => value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (letter) => letter.toUpperCase());

const Reference = ({ benchmark }: { benchmark: SkyPhotographCase }) => (
    <div className={styles.reference} data-benchmark-reference>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
            src={benchmark.referenceImage}
            alt={`${titleCase(benchmark.observed.condition)} sky reference`}
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
        />
    </div>
);

const Render = ({ benchmark, onVisualChange }: {
    benchmark: SkyPhotographCase;
    onVisualChange?: (snapshot: SkySnapshot) => void;
}) => (
    <div className={styles.render} data-benchmark-render>
        <Sky
            preview={previewForSkyPhotograph(benchmark)}
            paused
            contained
            onVisualChange={onVisualChange}
        />
    </div>
);

export function SkyPhotographBenchmark() {
    const search = useSearchParams();
    const router = useRouter();
    const requestedCase = search.get("case");
    const requestedMode = search.get("capture") as CaptureMode | null;
    const mode: CaptureMode = ["pair", "render", "reference", "overlay"].includes(requestedMode ?? "")
        ? requestedMode as CaptureMode
        : "pair";
    const [condition, setCondition] = useState("all");
    const [phase, setPhase] = useState("all");
    const [overlayOpacity, setOverlayOpacity] = useState(0.5);
    const [snapshot, setSnapshot] = useState<SkySnapshot>();
    const filtered = useMemo(() => SKY_PHOTOGRAPH_BENCHMARK.cases.filter((entry) =>
        (condition === "all" || entry.observed.condition === condition) &&
        (phase === "all" || entry.observed.phase === phase),
    ), [condition, phase]);
    const benchmark = SKY_PHOTOGRAPH_BENCHMARK.cases.find((entry) => entry.id === requestedCase) ??
        filtered[0] ?? SKY_PHOTOGRAPH_BENCHMARK.cases[0];
    const index = filtered.findIndex((entry) => entry.id === benchmark.id);
    const navigate = (id: string, nextMode = mode) => router.replace(
        `/sky-photographs?case=${encodeURIComponent(id)}&capture=${nextMode}`,
        { scroll: false },
    );
    const adjacent = (offset: number) => {
        if (!filtered.length) return;
        navigate(filtered[(Math.max(0, index) + offset + filtered.length) % filtered.length].id);
    };

    if (mode === "render") return (
        <main className={styles.capture} data-benchmark-case={benchmark.id}>
            <Render benchmark={benchmark} onVisualChange={setSnapshot} />
            <output className={styles.captureReady} data-benchmark-ready>
                {snapshot ? "ready" : "rendering"}
            </output>
        </main>
    );
    if (mode === "reference") return (
        <main className={styles.capture} data-benchmark-case={benchmark.id}>
            <Reference benchmark={benchmark} />
        </main>
    );

    const conditions = Object.keys(SKY_PHOTOGRAPH_BENCHMARK.summary.conditionCounts);
    const phases = Object.keys(SKY_PHOTOGRAPH_BENCHMARK.summary.phaseCounts);
    return (
        <main className={styles.page} data-benchmark-case={benchmark.id}>
            <section className={styles.viewer}>
                {mode === "overlay" ? (
                    <div className={styles.overlay}>
                        <Render benchmark={benchmark} onVisualChange={setSnapshot} />
                        <div className={styles.overlayReference} style={{ opacity: overlayOpacity }}>
                            <Reference benchmark={benchmark} />
                        </div>
                    </div>
                ) : (
                    <div className={styles.pair}>
                        <figure><Reference benchmark={benchmark} /><figcaption>Measured photograph</figcaption></figure>
                        <figure><Render benchmark={benchmark} onVisualChange={setSnapshot} /><figcaption>Matched renderer</figcaption></figure>
                    </div>
                )}
            </section>
            <aside className={styles.panel}>
                <header>
                    <p className={styles.eyebrow}>Unlisted validation utility</p>
                    <h1>Sky photograph benchmark</h1>
                    <p>{SKY_PHOTOGRAPH_BENCHMARK.summary.caseCount} condition-known photographs</p>
                </header>
                <div className={styles.filters}>
                    <label>Condition<select value={condition} onChange={(event) => setCondition(event.target.value)}>
                        <option value="all">All conditions</option>
                        {conditions.map((value) => <option key={value} value={value}>{titleCase(value)} ({SKY_PHOTOGRAPH_BENCHMARK.summary.conditionCounts[value]})</option>)}
                    </select></label>
                    <label>Solar regime<select value={phase} onChange={(event) => setPhase(event.target.value)}>
                        <option value="all">All regimes</option>
                        {phases.map((value) => <option key={value} value={value}>{titleCase(value)} ({SKY_PHOTOGRAPH_BENCHMARK.summary.phaseCounts[value]})</option>)}
                    </select></label>
                    <label>Case<select value={benchmark.id} onChange={(event) => navigate(event.target.value)}>
                        {filtered.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} · {titleCase(entry.observed.condition)}</option>)}
                    </select></label>
                    <label>View<select value={mode} onChange={(event) => navigate(benchmark.id, event.target.value as CaptureMode)}>
                        <option value="pair">Side by side</option><option value="overlay">Exposure overlay</option>
                    </select></label>
                    {mode === "overlay" && <label>Reference opacity {Math.round(overlayOpacity * 100)}%
                        <input type="range" min="0" max="1" step="0.01" value={overlayOpacity} onChange={(event) => setOverlayOpacity(Number(event.target.value))} />
                    </label>}
                </div>
                <div className={styles.navigation}>
                    <button type="button" onClick={() => adjacent(-1)}>Previous</button>
                    <span>{Math.max(0, index) + 1} / {filtered.length}</span>
                    <button type="button" onClick={() => adjacent(1)}>Next</button>
                </div>
                <dl className={styles.metadata}>
                    <div><dt>UTC capture</dt><dd>{benchmark.capture.timestamp}</dd></div>
                    <div><dt>Position</dt><dd>{benchmark.capture.latitude.toFixed(3)}°, {benchmark.capture.longitude.toFixed(3)}°</dd></div>
                    <div><dt>Camera</dt><dd>{titleCase(benchmark.capture.viewDirection)}, {benchmark.capture.horizontalFov.toFixed(1)}°</dd></div>
                    <div><dt>Sun</dt><dd>{benchmark.observed.solarAltitude.toFixed(1)}° altitude</dd></div>
                    <div><dt>Clouds</dt><dd>{benchmark.observed.cloudCoverage == null ? "Unclassified" : `${Math.round(benchmark.observed.cloudCoverage * 100)}% cover`}</dd></div>
                    {benchmark.observed.lunarIllumination != null && <div><dt>Moon</dt><dd>{Math.round(benchmark.observed.lunarIllumination * 100)}% · {benchmark.observed.lunarAltitude?.toFixed(1)}°</dd></div>}
                    <div><dt>Match</dt><dd>{benchmark.renderer.familyId} · {benchmark.renderer.aerosolType}</dd></div>
                    {snapshot && <div><dt>Result</dt><dd>{snapshot.lightingRegime} · {snapshot.visibleStars} stars</dd></div>}
                </dl>
                <footer><a href={benchmark.source.url} target="_blank" rel="noreferrer">{benchmark.source.name}</a><p>{benchmark.source.license}</p></footer>
            </aside>
        </main>
    );
}

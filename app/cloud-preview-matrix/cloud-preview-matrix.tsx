"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
    WEATHER_QUALIFICATION_SUMMARY,
    type WeatherImplementationStatus,
} from "@/components/backgrounds/sky/weather-qualification-matrix";
import {
    DEFAULT_PRODUCTION_PERSPECTIVE_ID,
} from "@/components/backgrounds/sky/weather-cloud-photograph-benchmark";

import {
    previewDefinitions,
    titleCase,
    type MatrixGroup,
    type MatrixScope,
} from "./cloud-preview-catalog";
import {
    CLOUD_PREVIEW_MANIFEST_URL,
    cloudPreviewImageProxyUrl,
    parseCloudPreviewManifest,
    type CloudPreviewManifest,
} from "./cloud-preview-manifest";
import { stepCloudPreviewOption } from "./cloud-preview-queue";
import styles from "./cloud-preview-matrix.module.css";

type StaticPreviewStatus = "pending" | "ready";

const MANIFEST_POLL_INTERVAL_MS = 3_000;

function StepSelect({
    label,
    value,
    options,
    onChange,
}: {
    label: string;
    value: string;
    options: readonly { value: string; label: string }[];
    onChange: (value: string) => void;
}) {
    const step = (offset: number) => onChange(
        stepCloudPreviewOption(options, value, offset),
    );
    return <label>{label}<span className={styles.stepSelect}>
        <button type="button" aria-label={`Previous ${label}`}
            disabled={options.length < 2} onClick={() => step(-1)}>‹</button>
        <select data-preview-selector={label} value={value}
            onChange={(event) => onChange(event.target.value)}>
            {options.map((option) => <option key={option.value}
                value={option.value}>{option.label}</option>)}
        </select>
        <button type="button" aria-label={`Next ${label}`}
            disabled={options.length < 2} onClick={() => step(1)}>›</button>
    </span></label>;
}

export function CloudPreviewMatrix() {
    const [manifest, setManifest] = useState<CloudPreviewManifest>();
    const [manifestError, setManifestError] = useState<string>();
    const [scope, setScope] = useState<MatrixScope>("canonical");
    const [groupFilter, setGroupFilter] = useState<MatrixGroup | "all">("all");
    const [genusFilter, setGenusFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<StaticPreviewStatus | "all">(
        "all",
    );
    const [evidenceFilter, setEvidenceFilter] =
        useState<WeatherImplementationStatus | "all">("all");

    const refreshManifest = useCallback(async () => {
        try {
            const response = await fetch(CLOUD_PREVIEW_MANIFEST_URL, {
                cache: "no-store",
            });
            if (!response.ok) {
                throw new Error(`manifest request returned ${response.status}`);
            }
            const parsed = parseCloudPreviewManifest(await response.json());
            if (!parsed) throw new Error("manifest has an invalid schema");
            setManifest(parsed);
            setManifestError(undefined);
        } catch (error) {
            setManifestError(error instanceof Error
                ? error.message : String(error));
        }
    }, []);

    useEffect(() => {
        void refreshManifest();
        const interval = window.setInterval(() => {
            if (!document.hidden) void refreshManifest();
        }, MANIFEST_POLL_INTERVAL_MS);
        const refreshVisible = () => {
            if (!document.hidden) void refreshManifest();
        };
        document.addEventListener("visibilitychange", refreshVisible);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener("visibilitychange", refreshVisible);
        };
    }, [refreshManifest]);

    const productionPerspective = manifest?.productionPerspective ??
        DEFAULT_PRODUCTION_PERSPECTIVE_ID;
    const previews = useMemo(
        () => previewDefinitions(productionPerspective),
        [productionPerspective],
    );
    const previewById = useMemo(
        () => new Map(previews.map((preview) => [preview.id, preview])),
        [previews],
    );
    const manifestEntries = useMemo(() => new Map(
        manifest?.entries.flatMap((entry) => {
            const preview = previewById.get(entry.id);
            return preview && preview.caseId === entry.caseId &&
                preview.captureParameter === entry.captureParameter
                ? [[entry.id, entry] as const] : [];
        }) ?? [],
    ), [manifest, previewById]);
    const scopeDefinitions = useMemo(
        () => previews.filter((preview) => preview.scope === scope),
        [previews, scope],
    );
    const visibleDefinitions = useMemo(
        () => scopeDefinitions.filter((preview) => {
            const status: StaticPreviewStatus = manifestEntries.has(preview.id)
                ? "ready" : "pending";
            return (groupFilter === "all" || preview.group === groupFilter) &&
                (genusFilter === "all" || preview.genus === genusFilter) &&
                (statusFilter === "all" || status === statusFilter) &&
                (evidenceFilter === "all" ||
                    preview.implementation === evidenceFilter);
        }),
        [evidenceFilter, genusFilter, groupFilter, manifestEntries,
            scopeDefinitions, statusFilter],
    );
    const readyCount = scopeDefinitions.reduce(
        (count, preview) => count + Number(manifestEntries.has(preview.id)),
        0,
    );
    const pendingCount = scopeDefinitions.length - readyCount;
    const genera = [...new Set(scopeDefinitions.map((preview) => preview.genus))];
    const groups = [...new Set(scopeDefinitions.map((preview) => preview.group))];
    const generatedAt = manifest?.generatedAt
        ? new Date(manifest.generatedAt).toLocaleString() : "Not generated yet";

    const changeScope = (next: MatrixScope) => {
        setScope(next);
        setGroupFilter("all");
        setGenusFilter("all");
        setStatusFilter("all");
        setEvidenceFilter("all");
    };

    return (
        <main
            className={styles.page}
            data-cloud-preview-matrix
            data-preview-source="static-manifest"
            data-production-perspective={productionPerspective}
            data-manifest-status={manifest?.status ?? "unavailable"}
            data-live-capture-count="0"
        >
            <header className={styles.header}>
                <div>
                    <p className={styles.eyebrow}>Unlisted · generated production previews</p>
                    <h1>Cloud preview matrix</h1>
                    <p className={styles.introduction}>
                        {scope === "canonical"
                            ? "Canonical 60: 32 WMO base forms and 28 varieties, features, upper-atmosphere states, and exterior systems."
                            : `Complete production matrix: ${WEATHER_QUALIFICATION_SUMMARY.targets} WMO/weather targets; ${WEATHER_QUALIFICATION_SUMMARY.cases.toLocaleString()} valid qualification combinations remain catalogued.`} This page only displays completed image files from the background preview command. It never creates a cloud renderer or GPU device. Every image uses the single production perspective recorded in the manifest.
                    </p>
                </div>
                <div className={styles.progress} aria-live="polite">
                    <strong>{readyCount} / {scopeDefinitions.length}</strong>
                    <span>{manifest?.completed ?? 0} / {manifest?.total ?? previews.length} full-grid images generated</span>
                    <div className={styles.progressTrack}><i style={{
                        width: `${scopeDefinitions.length
                            ? readyCount / scopeDefinitions.length * 100 : 0}%`,
                    }} /></div>
                </div>
            </header>

            <section className={styles.toolbar} aria-label="Preview filters">
                <div className={styles.manifestState}>
                    <span className={styles.manifestBadge}
                        data-state={manifest?.status ?? "unavailable"}>
                        {manifest?.status === "complete" ? "Grid complete" :
                            manifest?.status === "partial" ? "Generating" :
                                "Awaiting manifest"}
                    </span>
                    <span>Production perspective: <strong>{titleCase(
                        productionPerspective,
                    )}</strong></span>
                    <span>Capture backend: <strong>{titleCase(
                        manifest?.captureMode ?? "awaiting-manifest",
                    )}</strong></span>
                    <span>Updated: {generatedAt}</span>
                    <button type="button" onClick={() => void refreshManifest()}>
                        Refresh manifest
                    </button>
                </div>
                <div className={styles.filters}>
                    <StepSelect label="Matrix scope" value={scope} options={[
                        { value: "canonical", label: "Canonical 60" },
                        { value: "complete-weather", label: `Complete ${WEATHER_QUALIFICATION_SUMMARY.targets}` },
                    ]} onChange={(value) => changeScope(value as MatrixScope)} />
                    <StepSelect label="Family" value={groupFilter} options={[
                        { value: "all", label: "All cloud forms" },
                        ...groups.map((group) => ({
                            value: group,
                            label: titleCase(group),
                        })),
                    ]} onChange={(value) =>
                        setGroupFilter(value as MatrixGroup | "all")} />
                    <StepSelect label="Genus" value={genusFilter} options={[
                        { value: "all", label: "All genera" },
                        ...genera.map((genus) => ({
                            value: genus,
                            label: titleCase(genus),
                        })),
                    ]} onChange={setGenusFilter} />
                    <StepSelect label="Status" value={statusFilter} options={[
                        { value: "all", label: "All states" },
                        { value: "pending", label: "Pending" },
                        { value: "ready", label: "Ready" },
                    ]} onChange={(value) => setStatusFilter(
                        value as StaticPreviewStatus | "all",
                    )} />
                    {scope === "complete-weather" &&
                        <StepSelect label="Evidence" value={evidenceFilter} options={[
                            { value: "all", label: "All implementation states" },
                            { value: "packed", label: "Packed state" },
                            { value: "operator-active", label: "Operator active" },
                            { value: "transport-attached", label: "Transport attached" },
                            { value: "photographically-qualified", label: "Photographically qualified" },
                            { value: "not-representable", label: "Not representable" },
                        ]} onChange={(value) => setEvidenceFilter(
                            value as WeatherImplementationStatus | "all",
                        )} />}
                </div>
            </section>

            <section className={styles.summary} aria-label="Generated preview states">
                <span data-state="ready"><i /> {readyCount} ready</span>
                <span data-state="pending"><i /> {pendingCount} pending</span>
                <span>{visibleDefinitions.length} visible</span>
                <span>Renderer hash: {manifest?.rendererHash.slice(0, 12) ?? "—"}</span>
                {manifestError && <span className={styles.pauseReason}>
                    Manifest unavailable: {manifestError}
                    {manifest ? " · showing the last loaded revision" : ""}
                </span>}
            </section>

            <section className={styles.matrix} aria-label="Cloud previews">
                {visibleDefinitions.map((preview) => {
                    const entry = manifestEntries.get(preview.id);
                    const status: StaticPreviewStatus = entry ? "ready" : "pending";
                    const staticImageUrl = entry
                        ? cloudPreviewImageProxyUrl(entry.imageUrl) : undefined;
                    return <article key={preview.id} className={styles.card}
                        data-state={status}>
                        {entry && staticImageUrl ?
                            <a className={styles.imageWell}
                                href={staticImageUrl}
                                target="_blank" rel="noreferrer">
                                {/* Generated files are immutable, content-hashed assets. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={staticImageUrl} width={entry.width}
                                    height={entry.height}
                                    alt={`${preview.title} production render`} />
                            </a> :
                            <div className={styles.imageWell}
                                aria-label={`${preview.title} preview pending`}>
                                <span className={styles.placeholder}>
                                    <i /> Waiting for background render
                                </span>
                            </div>}
                        <div className={styles.cardBody}>
                            <div className={styles.cardTitle}>
                                <div><strong>{preview.title}</strong>
                                    <span>{preview.detail}</span></div>
                                <em>{status}</em>
                            </div>
                            <p>{titleCase(preview.genus)} · {titleCase(preview.group)} · {preview.permutationCount} valid permutations</p>
                            {preview.implementation && <p className={styles.evidence}>
                                {titleCase(preview.implementation)} · {preview.photographicEvidence}
                            </p>}
                            {entry && <p>Generated {new Date(
                                entry.generatedAt,
                            ).toLocaleString()} · {entry.width}×{entry.height}</p>}
                        </div>
                    </article>;
                })}
            </section>
        </main>
    );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { CloudPhotographBenchmark } from "./cloud-photograph-benchmark";

export const metadata: Metadata = {
    title: "Cloud Photograph Qualification",
    robots: { index: false, follow: false },
};

export default function Page() {
    return <Suspense><CloudPhotographBenchmark /></Suspense>;
}

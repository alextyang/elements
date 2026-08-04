import type { Metadata } from "next";
import { Suspense } from "react";

import { CloudPreviewMatrix } from "./cloud-preview-matrix";

export const metadata: Metadata = {
    title: "Cloud Production Preview Matrix",
    robots: { index: false, follow: false },
};

export default function Page() {
    return <Suspense><CloudPreviewMatrix /></Suspense>;
}

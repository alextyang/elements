import type { Metadata } from "next";

import { SkyLab } from "./sky-lab";

export const metadata: Metadata = {
    title: "Sky Laboratory",
    robots: {
        index: false,
        follow: false,
        nocache: true,
    },
};

export default function SkyLabPage() {
    return <SkyLab />;
}

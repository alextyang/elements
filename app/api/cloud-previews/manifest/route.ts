import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

const MANIFEST_PATH = join(
    process.cwd(),
    "public",
    "generated",
    "cloud-previews",
    "manifest.json",
);

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const bytes = await readFile(MANIFEST_PATH);
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                "Cache-Control": "no-store, max-age=0",
                "Content-Type": "application/json; charset=utf-8",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return NextResponse.json({ error: "Preview manifest not found." }, {
                headers: { "Cache-Control": "no-store, max-age=0" },
                status: 404,
            });
        }
        throw error;
    }
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

const IMAGE_NAME = /^[a-z0-9-]+-[a-f0-9]{12}\.png$/;
const IMAGE_DIRECTORY = join(
    process.cwd(),
    "public",
    "generated",
    "cloud-previews",
    "images",
);

export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    context: { params: Promise<{ filename: string }> },
) {
    const { filename } = await context.params;
    if (!IMAGE_NAME.test(filename)) {
        return NextResponse.json({ error: "Invalid preview image name." }, {
            status: 400,
        });
    }
    try {
        const bytes = await readFile(join(IMAGE_DIRECTORY, filename));
        return new NextResponse(new Uint8Array(bytes), {
            headers: {
                "Cache-Control": "public, max-age=31536000, immutable",
                "Content-Type": "image/png",
            },
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return NextResponse.json({ error: "Preview image not found." }, {
                status: 404,
            });
        }
        throw error;
    }
}

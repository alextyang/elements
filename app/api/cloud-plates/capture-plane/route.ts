import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS = new Set([
    "radiance",
    "transmittance",
    "direct-response",
    "sky-response",
    "ground-response",
]);
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const authorized = (request: NextRequest) => {
    const expected = process.env.CLOUD_PLATE_CAPTURE_TOKEN ??
        "local-cloud-plate-capture";
    const supplied = request.headers.get("x-cloud-plate-capture-token");
    if (!expected || !supplied) return false;
    const expectedBytes = Buffer.from(expected);
    const suppliedBytes = Buffer.from(supplied);
    return expectedBytes.length === suppliedBytes.length &&
        timingSafeEqual(expectedBytes, suppliedBytes);
};

export async function POST(request: NextRequest) {
    if (process.env.NODE_ENV === "production" || !authorized(request)) {
        return new NextResponse(null, { status: 404 });
    }
    const sceneId = request.nextUrl.searchParams.get("scene") ?? "";
    const frame = Number(request.nextUrl.searchParams.get("frame"));
    const channel = request.nextUrl.searchParams.get("channel") ?? "";
    const width = Number(request.nextUrl.searchParams.get("width"));
    const height = Number(request.nextUrl.searchParams.get("height"));
    if (!SAFE_ID.test(sceneId) || !Number.isInteger(frame) || frame < 0 ||
        !CHANNELS.has(channel) || !Number.isInteger(width) || width < 1 ||
        !Number.isInteger(height) || height < 1) {
        return NextResponse.json({ error: "invalid-capture-plane-request" },
            { status: 400 });
    }
    const payload = Buffer.from(await request.arrayBuffer());
    const expectedLength = width * height * 8;
    if (payload.byteLength !== expectedLength) {
        return NextResponse.json({
            error: "invalid-rgba16float-plane-length",
            expectedLength,
            actualLength: payload.byteLength,
        }, { status: 400 });
    }
    const stagingRoot = resolve(
        process.cwd(), "output/cloud-plates/staging",
    );
    const output = join(
        stagingRoot,
        sceneId,
        String(frame).padStart(5, "0"),
        `${channel}.rgba16f`,
    );
    if (!output.startsWith(`${stagingRoot}/`)) {
        return NextResponse.json({ error: "capture-path-escaped-root" },
            { status: 400 });
    }
    await mkdir(dirname(output), { recursive: true });
    const temporary = `${output}.${process.pid}.tmp`;
    await writeFile(temporary, payload, { flag: "wx" });
    await rename(temporary, output);
    return NextResponse.json({
        sceneId,
        frame,
        channel,
        width,
        height,
        format: "rgba16float-le",
        byteLength: payload.byteLength,
        sha256: createHash("sha256").update(payload).digest("hex"),
        stagingPath: output,
    });
}

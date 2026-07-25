const NASA_MOON_FRAMES =
    "https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/frames/730x730_1x1_30p";

export const runtime = "edge";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ frame: string }> },
) {
    const { frame: rawFrame } = await params;
    const frame = Number.parseInt(rawFrame, 10);
    if (!Number.isInteger(frame) || frame < 1 || frame > 8_760) {
        return new Response("Invalid lunar frame", { status: 400 });
    }

    const filename = `moon.${String(frame).padStart(4, "0")}.jpg`;
    const upstream = await fetch(`${NASA_MOON_FRAMES}/${filename}`, {
        next: { revalidate: 31_536_000 },
    });
    if (!upstream.ok || !upstream.body) {
        return new Response("Lunar frame unavailable", { status: 502 });
    }

    return new Response(upstream.body, {
        headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
        },
    });
}

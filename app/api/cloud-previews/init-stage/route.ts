export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_STAGE = /^[a-z0-9-]{1,96}$/;
const SAFE_SCENE = /^[A-Za-z0-9:_-]{1,192}$/;

/**
 * Capture-only cold-start telemetry. The renderer uses a keepalive beacon so
 * the last line written before a browser-main-thread compiler stall identifies
 * the exact shader or pipeline boundary without evaluating the blocked page.
 */
export async function POST(request: Request) {
    try {
        const value = JSON.parse(await request.text()) as {
            stage?: unknown;
            sceneKey?: unknown;
            elapsedMs?: unknown;
        };
        if (typeof value.stage !== "string" || !SAFE_STAGE.test(value.stage) ||
            typeof value.sceneKey !== "string" || !SAFE_SCENE.test(value.sceneKey) ||
            typeof value.elapsedMs !== "number" || !Number.isFinite(value.elapsedMs) ||
            value.elapsedMs < 0 || value.elapsedMs > 3_600_000) {
            return new Response(null, { status: 400 });
        }
        console.info(
            `[cloud-preview-init] scene=${value.sceneKey} ` +
            `stage=${value.stage} elapsed_ms=${Math.round(value.elapsedMs)}`,
        );
        return new Response(null, { status: 204 });
    } catch {
        return new Response(null, { status: 400 });
    }
}

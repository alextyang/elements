import { appendFile, mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number(process.env.CLOUD_QUALIFICATION_RECEIVER_PORT || process.argv[2]);
const outputPath = process.env.CLOUD_QUALIFICATION_RAW || process.argv[3];

if (!Number.isInteger(port) || port <= 0 || !outputPath) {
    throw new Error("Usage: cloud-qualification-receiver.mjs <port> <output.ndjson>");
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, "");

const readBody = (request) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1_000_000) {
            reject(new Error("qualification record exceeds 1 MB"));
            request.destroy();
            return;
        }
        chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
});

const server = http.createServer(async (request, response) => {
    try {
        if (request.method === "GET" && request.url === "/health") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end("ok");
            return;
        }
        if (request.method === "PUT" && request.url === "/record") {
            const record = JSON.parse(await readBody(request));
            if (!record || typeof record.jobId !== "string" || !record.stats) {
                response.writeHead(400, { "content-type": "text/plain" });
                response.end("invalid qualification record");
                return;
            }
            await appendFile(outputPath, `${JSON.stringify(record)}\n`);
            response.writeHead(204);
            response.end();
            return;
        }
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
    } catch (error) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(error instanceof Error ? error.message : String(error));
    }
});

server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`cloud qualification receiver listening on ${port}\n`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);

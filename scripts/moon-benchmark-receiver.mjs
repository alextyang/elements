#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const output = process.env.MOON_BENCHMARK_OUTPUT;
const port = Number(process.env.MOON_BENCHMARK_PORT);
if (!output || !Number.isInteger(port)) {
    throw new Error("MOON_BENCHMARK_OUTPUT and MOON_BENCHMARK_PORT are required");
}
await mkdir(output, { recursive: true });

const server = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
        response.writeHead(204).end();
        return;
    }
    const id = decodeURIComponent((request.url ?? "").replace(/^\//, ""));
    if (request.method !== "PUT" || !/^[a-z0-9-]+$/.test(id)) {
        response.writeHead(400).end("invalid request");
        return;
    }
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    await writeFile(path.join(output, `${id}.png`), Buffer.concat(chunks));
    response.writeHead(201).end();
});

server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`ready ${port}\n`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);

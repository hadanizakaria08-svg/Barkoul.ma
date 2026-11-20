import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps", "web", "dist");
const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
// Expose the development server to the local device only unless explicitly overridden.
const host = valueAfter("--host", "127.0.0.1");
const port = Number(valueAfter("--port", process.env.PORT ?? "5173"));
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2"
};

const context = await buildApp({ watch: true });

const server = http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    const target = path.resolve(dist, "." + pathname);
    if (target !== dist && !target.startsWith(dist + path.sep)) {
      response.writeHead(400).end("Bad request");
      return;
    }

    let file = target;
    try {
      const stat = await fs.stat(file);
      if (stat.isDirectory()) file = path.join(file, "index.html");
    } catch {
      if (request.headers.accept?.includes("text/html")) file = path.join(dist, "index.html");
      else {
        response.writeHead(404).end("Not found");
        return;
      }
    }

    const body = await fs.readFile(file);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch {
    response.writeHead(500).end("Internal server error");
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Barkoul dev server listening on http://${host}:${port}\n`);
});

async function shutdown() {
  server.close();
  await context?.dispose();
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

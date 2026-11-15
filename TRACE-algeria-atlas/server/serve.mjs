import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createDataAPI } from "./api.mjs";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
if (!existsSync(resolve(root, "index.html"))) {
  console.error("TRACE: no production build found. Run npm run build first.");
  process.exit(1);
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".geojson": "application/geo+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".ktx2": "image/ktx2",
};
const dataAPI = createDataAPI();
const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (dataAPI(req, res)) return;
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end("Read-only server.");
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://trace.local").pathname,
    );
    if (
      pathname.includes("\0") ||
      pathname.split("/").some((part) => part.startsWith("."))
    ) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let info;
    try {
      info = await stat(path);
    } catch {
      if (
        !extname(pathname) &&
        (req.headers.accept || "").includes("text/html")
      ) {
        path = resolve(root, "index.html");
        info = await stat(path);
      } else {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
    }
    if (!info.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        types[extname(path).toLowerCase()] || "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": path.includes(`${sep}assets${sep}`)
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    if (req.method === "HEAD") res.end();
    else
      createReadStream(path)
        .on("error", () => res.destroy())
        .pipe(res);
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end("Invalid request.");
  }
});
server.headersTimeout = 15000;
server.requestTimeout = 20000;
const port = Number(process.env.PORT || 5173);
server.listen(port, "0.0.0.0", () =>
  console.log(`TRACE atlas + read-only data API listening on 0.0.0.0:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));

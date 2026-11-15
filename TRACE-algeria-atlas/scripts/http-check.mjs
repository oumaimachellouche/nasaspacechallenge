// One-shot production routing and geographic-asset integrity check.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { base } from "./browser-helpers.mjs";
const hash = (b) => createHash("sha256").update(b).digest("hex");
const routes = [
  ["/", 200, "text/html"],
  ["/cesium/Cesium.js", 200, "javascript"],
  ["/cesium/Workers/createTaskProcessorWorker.js", 200, "javascript"],
  [
    "/data/atlas.json",
    200,
    "application/json",
    "GET",
    "public/data/atlas.json",
  ],
  ["/api/health", 200, "application/json"],
  ["/api/catalog", 200, "application/json"],
  ["/api/view?region=Oran_West&variable=T2M", 200, "application/json"],
  ["/no-such-asset.png", 404],
  ["/api/no-such-route", 404, "application/json"],
  ["/.env", 404],
  ["/api/health", 405, "application/json", "POST"],
  ["/index.html", 405, undefined, "POST"],
  [
    "/data/study-wilayas.geojson",
    200,
    "application/geo+json",
    "GET",
    "public/data/study-wilayas.geojson",
  ],
  [
    "/data/wilaya-display-metadata.json",
    200,
    "application/json",
    "GET",
    "public/data/wilaya-display-metadata.json",
  ],
  [
    "/data/geography/geoBoundaries-DZA-ADM1-2017.geojson",
    200,
    "application/geo+json",
    "GET",
    "public/data/geography/geoBoundaries-DZA-ADM1-2017.geojson",
  ],
  [
    "/licenses/geoBoundaries-ODbL-1.0.txt",
    200,
    "text/plain",
    "GET",
    "public/licenses/geoBoundaries-ODbL-1.0.txt",
  ],
];
const checks = [];
for (const [path, status, type, method = "GET", file] of routes) {
  const r = await fetch(new URL(path, base), { method });
  const bytes = Buffer.from(await r.arrayBuffer()),
    contentType = r.headers.get("content-type");
  const passed =
    r.status === status &&
    (!type || contentType?.includes(type)) &&
    (!file || hash(bytes) === hash(fs.readFileSync(file)));
  checks.push({
    path,
    method,
    expectedStatus: status,
    status: r.status,
    contentType,
    ...(file ? { matchesLocalSHA256: passed } : {}),
    passed,
  });
  console.log(passed ? "PASS" : "FAIL", method, path, r.status);
}
fs.writeFileSync(
  "analysis/production-http.json",
  JSON.stringify({ release: "wilaya-layers-v2.1", base, checks }, null, 2) +
    "\n",
);
if (checks.some((c) => !c.passed)) process.exitCode = 1;

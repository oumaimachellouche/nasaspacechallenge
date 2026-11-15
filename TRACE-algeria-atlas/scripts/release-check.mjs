// Verify an extracted/minimal included build, without installing dependencies there.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
if (!process.argv[2])
  throw new Error(
    "Usage: node scripts/release-check.mjs /path/to/extracted/TRACE-algeria-atlas",
  );
const target = path.resolve(process.argv[2]);
const reportPath =
  process.env.TRACE_RELEASE_REPORT ||
  path.join(project, "analysis/release-runtime.json");
const checks = [];
const check = (name, passed, detail) => {
  checks.push({ name, passed, ...(detail === undefined ? {} : { detail }) });
  console.log(passed ? "PASS" : "FAIL", name);
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
check(
  "included build has no node_modules",
  !fs.existsSync(path.join(target, "node_modules")),
);
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const child = spawn(process.execPath, ["server/serve.mjs"], {
  cwd: target,
  env: { ...process.env, PORT: String(port), NODE_PATH: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "",
  failure;
child.stdout.on("data", (b) => {
  output += b.toString();
});
child.stderr.on("data", (b) => {
  output += b.toString();
});
const exited = once(child, "exit");
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Included-build server startup timed out")),
      15000,
    );
    const inspect = () => {
      if (output.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", inspect);
    child.once("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Included-build server exited: ${code}`));
    });
    inspect();
  });
  check(
    "Node starts the included production service without dependency installation",
    true,
  );
  const base = `http://127.0.0.1:${port}`;
  const index = await fetch(base + "/");
  const html = await index.text();
  check(
    "included app HTML returns 200",
    index.status === 200 && html.includes("TRACE — Field Atlas"),
  );
  const resources = [
    ["/cesium/Cesium.js", "javascript"],
    ["/cesium/Workers/createTaskProcessorWorker.js", "javascript"],
    [html.match(/src="([^"]+\/index-[^"]+\.js)"/)?.[1], "javascript"],
    [html.match(/href="([^"]+\/index-[^"]+\.css)"/)?.[1], "text/css"],
    ["/data/study-wilayas.geojson", "application/geo+json"],
    ["/data/wilaya-display-metadata.json", "application/json"],
    [
      "/data/geography/geoBoundaries-DZA-ADM1-2017.geojson",
      "application/geo+json",
    ],
    ["/licenses/geoBoundaries-ODbL-1.0.txt", "text/plain"],
  ];
  for (const [url, type] of resources) {
    const r = url ? await fetch(base + url) : null;
    const bytes = r && Buffer.from(await r.arrayBuffer());
    check(
      `included resource ${url || "MISSING"}`,
      !!r &&
        r.status === 200 &&
        r.headers.get("content-type")?.includes(type) &&
        bytes.length > 0 &&
        hash(bytes) === hash(fs.readFileSync(path.join(project, "dist", url))),
    );
  }
  const expectedHash = hash(
    fs.readFileSync(path.join(project, "public/data/atlas.json")),
  );
  const healthResponse = await fetch(base + "/api/health");
  const health = await healthResponse.json();
  check(
    "included API identifies the exact v2.1 prepared archive",
    healthResponse.status === 200 &&
      health.dataSHA256 === expectedHash &&
      health.preparationVersion === "trace-prep-2" &&
      health.curatedClues === 7 &&
      health.combinations === 6 &&
      health.liveNASAIngestion === false,
  );
  const archive = await fetch(base + "/data/atlas.json");
  check(
    "included static archive matches the tested API archive",
    archive.status === 200 &&
      hash(Buffer.from(await archive.arrayBuffer())) === expectedHash,
  );
  for (const url of ["/.env", "/api/missing", "/missing.png"]) {
    const r = await fetch(base + url);
    check(`included server preserves 404 for ${url}`, r.status === 404);
    await r.arrayBuffer();
  }
} catch (e) {
  failure = e.message;
  check("included-build startup/HTTP verification completed", false, failure);
} finally {
  if (child.exitCode === null) child.kill("SIGTERM");
  await exited;
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        release: "wilaya-layers-v2.1",
        target: "Isolated included production build, no installed dependencies",
        runtime: process.version,
        passed: !failure && checks.every((c) => c.passed),
        checks,
        ...(failure ? { failure, serverOutput: output } : {}),
      },
      null,
      2,
    ),
  );
  if (failure || checks.some((c) => !c.passed)) process.exitCode = 1;
}

import { spawnSync } from "node:child_process";
for (const mobile of ["0", "1"]) {
  const result = spawnSync(process.execPath, ["scripts/browser-smoke.mjs"], {
    stdio: "inherit",
    env: { ...process.env, TRACE_MOBILE: mobile },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

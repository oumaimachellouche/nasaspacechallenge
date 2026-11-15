import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDataAPI } from "../server/api.mjs";

await test("TRACE read-only data API", async (suite) => {
  const middleware = createDataAPI();
  const server = createServer((req, res) => {
    if (!middleware(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  suite.after(() => new Promise((resolve) => server.close(resolve)));

  await suite.test(
    "health discloses the archive mode, not a live NASA connection",
    async () => {
      const res = await fetch(base + "/api/health");
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.mode, "read-only-prepared-archive");
      assert.equal(data.views, 1620);
      assert.equal(data.liveNASAIngestion, false);
      assert.equal(data.curatedClues, 7);
      assert.equal(data.combinations, 6);
      assert.equal(data.preparationVersion, "trace-prep-2");
    },
  );
  await suite.test(
    "catalog contains six sites, a retained archive and the seven-clue/six-combination interface",
    async () => {
      const data = await (await fetch(base + "/api/catalog")).json();
      assert.equal(data.regions.length, 6);
      assert.equal(data.variables.length, 28);
      assert.equal(data.recipes.length, 10);
      assert.equal(data.interface.primaryVariables.length, 7);
      assert.equal(data.interface.caseIds.length, 6);
      assert.ok(data.audit.warnings.some((w) => w.id === "footprints"));
      assert.ok(
        data.regions.every((r) => r.location_note.includes("not a wilaya")),
      );
    },
  );
  await suite.test(
    "full bundle is compressed, cacheable and conditional",
    async () => {
      const res = await fetch(base + "/api/atlas", {
        headers: { "accept-encoding": "gzip" },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-encoding"), "gzip");
      const data = await res.json();
      assert.equal(data.schemaVersion, 1);
      const second = await fetch(base + "/api/atlas", {
        headers: { "if-none-match": res.headers.get("etag") },
      });
      assert.equal(second.status, 304);
      assert.equal(await second.text(), "");
    },
  );
  await suite.test(
    "a selected view preserves source statistics and per-year units",
    async () => {
      const res = await fetch(base + "/api/view?region=Oran_West&variable=T2M");
      const data = await res.json();
      assert.equal(data.view.source, "supplied");
      assert.equal(data.view.n, 41);
      assert.ok(Math.abs(data.view.slope * 10 - 0.302) < 0.001);
      assert.match(data.slopeUnits, /per year/);
      assert.equal(data.view.qFamilySize, 114);
    },
  );
  await suite.test(
    "IMERG cannot be queried as a fictional 41-year view",
    async () => {
      const res = await fetch(
        base + "/api/view?region=Oran_West&variable=PRECIP_gpm",
      );
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, "coverage_unavailable");
      const valid = await (
        await fetch(
          base +
            "/api/view?region=Oran_West&variable=PRECIP_gpm&period=2001-2024&season=DJF",
        )
      ).json();
      assert.equal(valid.view.n, 23);
      assert.equal(valid.view.start, 2002);
    },
  );
  await suite.test(
    "compound views include formulas, the six-test family and actual monthly thresholds",
    async () => {
      const data = await (
        await fetch(base + "/api/view?region=Oran_West&variable=HEAT_DRY_RAIN")
      ).json();
      assert.equal(data.view.source, "recomputed");
      assert.equal(data.view.qFamilySize, 6);
      assert.equal(data.recipe.kind, "joint_event");
      assert.equal(data.recipe.inputs.length, 3);
      assert.deepEqual(data.recipe.inputs, [
        "T2M",
        "VPD_kpa",
        "PRECTOTCORR_m2",
      ]);
      assert.equal(Object.keys(data.thresholds).length, 12);
      assert.equal(data.thresholds["Oran_West|HEAT_DRY_RAIN|1"][0].n, 30);
    },
  );
  await suite.test(
    "paired rainfall difference is not extrapolated before 2001",
    async () => {
      assert.equal(
        (await fetch(base + "/api/view?region=Oran_West&variable=RAIN_GAP"))
          .status,
        404,
      );
      const data = await (
        await fetch(
          base +
            "/api/view?region=Oran_West&variable=RAIN_GAP&period=2001-2024",
        )
      ).json();
      assert.equal(data.view.n, 24);
      assert.equal(data.recipe.kind, "product_difference");
      assert.equal(Object.keys(data.thresholds).length, 0);
    },
  );
  await suite.test(
    "CSV endpoint returns native rows and metadata, not displayed rounded values",
    async () => {
      const res = await fetch(
        base + "/api/view?region=Oran_West&variable=T2M&format=csv",
      );
      assert.match(res.headers.get("content-type"), /text\/csv/);
      assert.match(res.headers.get("content-disposition"), /attachment/);
      const rows = (await res.text()).split("\r\n");
      assert.equal(rows.length, 42);
      assert.match(rows[0], /slope_per_year/);
      assert.match(rows[1], /114 supplied annual tests/);
    },
  );
  await suite.test(
    "monthly endpoint respects actual coverage and validates requested years",
    async () => {
      const data = await (
        await fetch(
          base +
            "/api/monthly?region=Oran_West&variable=PRECIP_gpm&start=1984&end=2024",
        )
      ).json();
      assert.equal(data.n, 288);
      assert.equal(data.series[0][0], "2001-01");
      assert.equal(
        (
          await fetch(
            base + "/api/monthly?region=Oran_West&variable=T2M&start=2025",
          )
        ).status,
        400,
      );
    },
  );
  await suite.test(
    "invalid selectors, methods and routes return explicit JSON errors",
    async () => {
      for (const path of [
        "/api/view?region=unknown&variable=T2M",
        "/api/view?region=Oran_West&variable=T2M&season=XXX",
        "/api/view?region=Oran_West&variable=T2M&format=html",
      ]) {
        assert.equal((await fetch(base + path)).status, 400);
      }
      const bad = await fetch(base + "/api/catalog", { method: "POST" });
      assert.equal(bad.status, 405);
      assert.equal(bad.headers.get("allow"), "GET, HEAD");
      assert.equal((await fetch(base + "/api/not-an-endpoint")).status, 404);
    },
  );
  await suite.test("HEAD returns metadata but no response body", async () => {
    const res = await fetch(base + "/api/catalog", { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.ok(+res.headers.get("content-length") > 0);
    assert.equal(await res.text(), "");
  });
});

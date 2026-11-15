import { expect } from "@playwright/test";
import fs from "node:fs";
import {
  launch,
  contextOptions,
  ready,
  quiet,
  panel,
  closePanel,
  clue,
  lens,
  minimize,
  openChart,
  report,
  base,
} from "./browser-helpers.mjs";
const browser = await launch(),
  context = await browser.newContext(contextOptions),
  page = await context.newPage();
page.setDefaultTimeout(15000);
await context.grantPermissions(["clipboard-read", "clipboard-write"], {
  origin: new URL(base).origin,
});
const qa = report("analysis/extended-check.json");
page.on("pageerror", (e) => qa.errors.push(e.message));
fs.mkdirSync("analysis/exports", { recursive: true });
const check = async (name, fn) => {
  await qa.check(name, fn);
  await page
    .evaluate(() => {
      document.querySelector("#infoDialog")?.close();
      document.querySelector("#boardDialog")?.close();
      window.__TRACE__?.manager.minimizeAll();
    })
    .catch(() => {});
  await quiet(page).catch(() => {});
};
const runCamera = async (
  fn,
  condition = () => !window.__TRACE__.map.viewer.camera._currentFlight,
) => {
  await page.evaluate(
    () => (window.__TRACE__.map.viewer.useDefaultRenderLoop = true),
  );
  await fn();
  await page.waitForFunction(condition, null, { timeout: 20000 });
  await quiet(page);
};
const clickGeo = async (lon, lat) => {
  const p = await page.evaluate(
    ({ lon, lat }) => {
      const t = window.__TRACE__,
        p = window.Cesium.SceneTransforms.worldToWindowCoordinates(
          t.map.viewer.scene,
          window.Cesium.Cartesian3.fromDegrees(lon, lat),
        );
      return { x: p.x, y: p.y };
    },
    { lon, lat },
  );
  const box = await page.locator("#cesiumContainer canvas").boundingBox();
  await page.mouse.click(box.x + p.x, box.y + p.y);
};
const grab = async (locator, action, file) => {
  const t = Date.now();
  const [dl] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    locator.locator(action).click(),
  ]);
  await dl.saveAs(file);
  return { bytes: fs.readFileSync(file), ms: Date.now() - t };
};
let seriesId,
  cardCount = 0,
  noteId,
  shareURL;
try {
  await ready(page, base, { tiles: true });
  await check(
    "frontend health describes seven clues, six combinations and archive-only API connectivity",
    async () => {
      await expect(page.locator("#dataConnection")).toContainText(
        "ARCHIVE API",
      );
      const h = await (
        await page.request.get(new URL("/api/health", base).href)
      ).json();
      expect(h.curatedClues).toBe(7);
      expect(h.combinations).toBe(6);
      expect(h.liveNASAIngestion).toBe(false);
    },
  );
  await check(
    "terrain, imagery, label and opacity controls change real map state and survive panel reopen",
    async () => {
      await panel(page, "map");
      await page.locator("#terrainSetting").uncheck();
      await page.locator("#labelSetting").uncheck();
      await page.locator("#opacitySetting").fill("65");
      await page.locator("#imagerySetting").selectOption("natural");
      expect(
        await page.evaluate(() => window.__TRACE__.map.layerSettings),
      ).toEqual({ terrain: false, labels: false, opacity: 0.65 });
      expect(await page.evaluate(() => window.__TRACE__.map.imagery)).toBe(
        "natural",
      );
      expect(await page.locator(".site-chip:visible").count()).toBe(0);
      expect(
        await page
          .locator(".site-anchor")
          .evaluateAll(
            (es) =>
              es.filter((e) => getComputedStyle(e).display !== "none").length,
          ),
      ).toBe(6);
      expect(
        await page.evaluate(
          () =>
            window.__TRACE__.map.viewer.entities
              .getById("trace-site-Oran_West")
              .point.color.getValue().alpha,
        ),
      ).toBeCloseTo(0.65, 2);
      await closePanel(page);
      await panel(page, "map");
      await expect(page.locator("#terrainSetting")).not.toBeChecked();
      await expect(page.locator("#labelSetting")).not.toBeChecked();
      await page.locator("#labelSetting").check();
      await page.locator("#opacitySetting").fill("100");
      await closePanel(page);
    },
  );
  await check(
    "the stronger-trend filter hides precisely the unsupported full-period temperature record",
    async () => {
      await panel(page, "map");
      await page.locator("#supportSetting").check();
      expect(
        await page
          .locator(".site-anchor")
          .evaluateAll(
            (es) =>
              es.filter((e) => getComputedStyle(e).display !== "none").length,
          ),
      ).toBe(5);
      expect(
        await page
          .locator('.site-anchor[data-region="Annaba_East"]')
          .evaluate((e) => getComputedStyle(e).display),
      ).toBe("none");
      await page.locator("#supportSetting").uncheck();
      await closePanel(page);
    },
  );
  await check(
    "palette changes affect both the map legend and the actual Cesium site colors",
    async () => {
      const before = await page
          .locator("#legendRamp")
          .evaluate((e) => e.style.background),
        point = await page.evaluate(() =>
          window.__TRACE__.map.viewer.entities
            .getById("trace-site-Oran_West")
            .point.color.getValue()
            .toCssColorString(),
        );
      await page.locator("#paletteButton").click();
      expect(
        await page.locator("#legendRamp").evaluate((e) => e.style.background),
      ).not.toBe(before);
      expect(
        await page.evaluate(() =>
          window.__TRACE__.map.viewer.entities
            .getById("trace-site-Oran_West")
            .point.color.getValue()
            .toCssColorString(),
        ),
      ).not.toBe(point);
    },
  );
  await check(
    "Cesium zoom and Fit Algeria controls actually change and restore the camera",
    async () => {
      const before = await page.evaluate(
        () => window.__TRACE__.map.viewer.camera.positionCartographic.height,
      );
      await page.locator("#zoomIn").click();
      expect(
        await page.evaluate(
          () => window.__TRACE__.map.viewer.camera.positionCartographic.height,
        ),
      ).toBeLessThan(before);
      await runCamera(() => page.locator("#mapHome").click());
      expect(
        await page.evaluate(
          () => window.__TRACE__.map.viewer.camera.positionCartographic.height,
        ),
      ).toBeGreaterThan(before * 0.9);
    },
  );
  await check(
    "the terrain-tilt control changes camera pitch and returns to top-down without a fake terrain mesh",
    async () => {
      await runCamera(() => page.locator("#tiltButton").click());
      expect(
        await page.evaluate(() => window.__TRACE__.map.viewer.camera.pitch),
      ).toBeGreaterThan(-1.2);
      await expect(page.locator("#tiltButton")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await runCamera(() => page.locator("#tiltButton").click());
      expect(
        await page.evaluate(() => window.__TRACE__.map.viewer.camera.pitch),
      ).toBeCloseTo(-Math.PI / 2, 1);
    },
  );
  await check("reset north restores the real Cesium heading", async () => {
    await page.evaluate(() => {
      const c = window.__TRACE__.map.viewer.camera;
      c.setView({ orientation: { heading: 0.8, pitch: c.pitch, roll: 0 } });
    });
    await runCamera(() => page.locator("#northButton").click());
    const h = await page.evaluate(
      () => window.__TRACE__.map.viewer.camera.heading,
    );
    expect(Math.min(h, 2 * Math.PI - h)).toBeLessThan(0.02);
  });
  await check(
    "Fly to area fits its real administrative display boundary, without claiming an extraction footprint",
    async () => {
      await page.evaluate(() =>
        window.__TRACE__.selectRegion("Tamanrasset_Hoggar"),
      );
      await runCamera(() => page.locator('[data-inspect="fly"]').click());
      const p = await page.evaluate(() => {
        const p = window.__TRACE__.map.viewer.camera.positionCartographic;
        return {
          lon: (p.longitude * 180) / Math.PI,
          lat: (p.latitude * 180) / Math.PI,
          height: p.height,
        };
      });
      expect(p.height).toBeLessThan(4000000);
      expect(Math.abs(p.lon - 5.6)).toBeLessThan(5);
      expect(Math.abs(p.lat - 22.9)).toBeLessThan(5);
      await page.locator('[data-inspect="close"]').click();
      await runCamera(() => page.locator("#mapHome").click());
    },
  );
  await check(
    "2D / 3D is a true Cesium scene morph and disables inapplicable tilt in 2D",
    async () => {
      await runCamera(
        () => page.locator("#projectionButton").click(),
        () =>
          window.__TRACE__.map.viewer.scene.mode ===
          window.Cesium.SceneMode.SCENE2D,
      );
      await expect(page.locator("#projectionButton")).toHaveText("2D");
      await expect(page.locator("#tiltButton")).toBeDisabled();
      await runCamera(
        () => page.locator("#projectionButton").click(),
        () =>
          window.__TRACE__.map.viewer.scene.mode ===
          window.Cesium.SceneMode.SCENE3D,
      );
      await expect(page.locator("#tiltButton")).toBeEnabled();
    },
  );
  await check(
    "the geographic probe reports the clicked WGS84 coordinate without fabricating a climate pixel",
    async () => {
      await page.evaluate(
        () => (window.__TRACE__.map.viewer.useDefaultRenderLoop = true),
      );
      await page
        .waitForFunction(
          () => window.__TRACE__.map.viewer.scene.globe.tilesLoaded,
          null,
          { timeout: 20000 },
        )
        .catch(() => {});
      await page.locator("#probeButton").click();
      await clickGeo(2, 28);
      await expect(page.locator("#geoReadout")).toContainText("28.0000° N");
      await expect(page.locator("#geoReadout")).toContainText("2.0000° E");
      await expect(page.locator("#geoReadout")).toContainText(
        "No climate estimate",
      );
      await page.keyboard.press("Escape");
      await expect(page.locator("#geoReadout")).toBeHidden();
    },
  );
  await check(
    "two clicked positions produce a genuine WGS84 geodesic measurement, and Escape removes it",
    async () => {
      await page.evaluate(
        () => (window.__TRACE__.map.viewer.useDefaultRenderLoop = true),
      );
      const baselineEntities = await page.evaluate(
        () => window.__TRACE__.map.viewer.entities.values.length,
      );
      await page.locator("#measureButton").click();
      await clickGeo(2, 27);
      await expect(page.locator("#geoReadout")).toContainText("First position");
      await clickGeo(6, 27);
      const text = await page.locator("#geoReadout").innerText(),
        shown = Number(text.match(/([0-9.]+) km/)[1]),
        expected = await page.evaluate(
          () =>
            new window.Cesium.EllipsoidGeodesic(
              window.Cesium.Cartographic.fromDegrees(2, 27),
              window.Cesium.Cartographic.fromDegrees(6, 27),
            ).surfaceDistance / 1000,
        );
      expect(Math.abs(shown - expected)).toBeLessThan(0.2);
      expect(
        await page.evaluate(
          () => window.__TRACE__.map.viewer.entities.values.length,
        ),
      ).toBe(baselineEntities + 3);
      await page.keyboard.press("Escape");
      expect(
        await page.evaluate(
          () => window.__TRACE__.map.viewer.entities.values.length,
        ),
      ).toBe(baselineEntities);
    },
  );
  await check(
    "analysis windows move by keyboard and pointer and resize with their own chart canvas",
    async () => {
      await page.evaluate(() =>
        window.__TRACE__.selectRegion("Oran_West", false),
      );
      await clue(page, "T2M");
      await lens(page, {
        period: "1984-2024",
        season: "annual",
        quantity: "trend",
      });
      const w = await openChart(page, "series");
      seriesId = await w.getAttribute("data-window");
      let a = await w.boundingBox();
      await w.locator(".move-handle").focus();
      await w.locator(".move-handle").press("ArrowRight");
      await w.locator(".move-handle").press("ArrowDown");
      let b = await w.boundingBox();
      expect(b.x - a.x).toBe(20);
      expect(b.y - a.y).toBe(20);
      const h = await w.locator(".window-heading").boundingBox();
      await page.mouse.move(h.x + 130, h.y + 20);
      await page.mouse.down();
      await page.mouse.move(h.x - 50, h.y + 120, { steps: 8 });
      await page.mouse.up();
      let c = await w.boundingBox();
      expect(c.x).toBeCloseTo(b.x - 180, 0);
      expect(c.y).toBeCloseTo(b.y + 100, 0);
      await page.mouse.move(c.x + c.width - 3, c.y + c.height - 3);
      await page.mouse.down();
      await page.mouse.move(c.x + c.width + 70, c.y + c.height + 35, {
        steps: 6,
      });
      await page.mouse.up();
      let d = await w.boundingBox();
      expect(d.width).toBeGreaterThan(c.width + 30);
      expect(d.height).toBeGreaterThan(c.height + 15);
      await page.waitForFunction((id) => {
        const w = window.__TRACE__.manager.windows.get(id);
        return (
          Math.abs(
            w.chart.chart.getWidth() -
              w.el.querySelector(".win-chart").clientWidth,
          ) < 2
        );
      }, seriesId);
    },
  );
  await check(
    "expand, minimize, tray and dock restore the same window instead of creating hidden duplicates",
    async () => {
      await page.locator(`[data-restore="${seriesId}"]`).click();
      const w = page.locator(`[data-window="${seriesId}"]`),
        before = await w.boundingBox();
      await w.locator('[data-action="maximize"]').click();
      expect((await w.boundingBox()).width).toBeGreaterThan(1300);
      await w.locator('[data-action="maximize"]').click();
      expect((await w.boundingBox()).width).toBeCloseTo(before.width, 0);
      await w.locator('[data-action="minimize"]').click();
      await expect(w).toBeHidden();
      await expect(page.locator(`[data-restore="${seriesId}"]`)).toBeVisible();
      await page.locator('.evidence-dock [data-open-chart="series"]').click();
      await expect(w).toBeVisible();
      expect(await page.locator(".evidence-window").count()).toBe(1);
    },
  );
  await check(
    "each chart CSV downloads its own native/plotted calculation with units and correct row counts",
    async () => {
      const lengths = {
        series: 42,
        cycle: 13,
        stripes: 42,
        compare: 7,
        relationships: 42,
      };
      for (const [type, n] of Object.entries(lengths)) {
        const w = await openChart(page, type),
          { bytes } = await grab(
            w,
            '[data-action="csv"]',
            `analysis/exports/${type}.csv`,
          ),
          text = bytes.toString();
        expect(text.split("\r\n")).toHaveLength(n);
        expect(text).toContain(
          type === "cycle"
            ? "monthly_mean"
            : type === "stripes"
              ? "reference_mean"
              : type === "compare"
                ? "plotted_value"
                : type === "relationships"
                  ? "native_x"
                  : "native_value",
        );
        expect(text).toContain("Oran_West");
        expect(text).toContain(type === "relationships" ? "kPa" : "°C");
        await minimize(page);
      }
    },
  );
  await check(
    "all five high-resolution PNG exports include non-empty figures with a valid PNG encoding",
    async () => {
      for (const type of [
        "series",
        "cycle",
        "stripes",
        "compare",
        "relationships",
      ]) {
        const w = await openChart(page, type),
          { bytes, ms } = await grab(
            w,
            '[data-action="png"]',
            `analysis/exports/${type}.png`,
          );
        expect(bytes.subarray(1, 4).toString()).toBe("PNG");
        expect(bytes.length).toBeGreaterThan(20000);
        expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(1280);
        console.log("  PNG", type, ms + "ms", bytes.length + " bytes");
        await minimize(page);
      }
    },
  );
  await check(
    "collecting the five chart types stores distinct, frozen, type-specific evidence cards",
    async () => {
      for (const type of [
        "series",
        "cycle",
        "stripes",
        "compare",
        "relationships",
      ]) {
        const w = await openChart(page, type);
        await w.locator('[data-action="collect"]').click();
        await minimize(page);
      }
      expect(await page.evaluate(() => window.__TRACE__.board.length)).toBe(5);
      await page.locator("#boardButton").click();
      expect(await page.locator(".board-card").count()).toBe(5);
      await expect(
        page.locator(".board-card").filter({ hasText: "Monthly peak" }),
      ).toHaveCount(1);
      await expect(
        page.locator(".board-card").filter({ hasText: "2024 vs" }),
      ).toHaveCount(1);
    },
  );
  await check(
    "compound analysis JSON retains the actual monthly thresholds, source hashes and recomputed test family",
    async () => {
      await panel(page, "combine");
      await page.locator('[data-variable="HEAT_DRY_RAIN"]').click();
      const w = await openChart(page, "series");
      await w.locator('[data-action="details"]').click();
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#snapshotDownload").click(),
      ]);
      await dl.saveAs("analysis/exports/compound-analysis.json");
      const j = JSON.parse(
        fs.readFileSync("analysis/exports/compound-analysis.json", "utf8"),
      );
      expect(j.recipe.inputs).toEqual(["T2M", "VPD_kpa", "PRECTOTCORR_m2"]);
      expect(Object.keys(j.thresholds)).toHaveLength(12);
      expect(j.thresholds["1"][0].n).toBe(30);
      expect(j.view.qFamilySize).toBe(6);
      expect(j.sources.inputFiles).toHaveLength(5);
      expect(j.selection.variable).toBe("HEAT_DRY_RAIN");
      expect(
        await page.evaluate(() =>
          window.__TRACE__.board.every((r) => r.selection.variable === "T2M"),
        ),
      ).toBe(true);
    },
  );
  await check(
    "board sorting supports type, clue, region and newest; arrow reordering persists the visible order",
    async () => {
      await clue(page, "SWGDN");
      await panel(page, "clues");
      await page.locator("#regionPicker").selectOption("Ouargla_Sahara");
      await closePanel(page);
      const w = await openChart(page, "series");
      await w.locator('[data-action="collect"]').click();
      await minimize(page);
      await page.locator("#boardButton").click();
      cardCount = await page.locator(".board-card").count();
      expect(cardCount).toBe(6);
      for (const mode of ["type", "variable", "region", "newest"]) {
        await page.locator("#boardSort").selectOption(mode);
        await expect(page.locator("#boardSort")).toHaveValue(mode);
      }
      await page.locator("#boardSort").selectOption("type");
      const before = await page
        .locator(".board-card")
        .evaluateAll((es) => es.map((e) => e.dataset.card));
      await page
        .locator(".board-card")
        .first()
        .locator('[data-card-action="down"]')
        .click();
      const after = await page
        .locator(".board-card")
        .evaluateAll((es) => es.map((e) => e.dataset.card));
      expect(after[0]).toBe(before[1]);
      expect(after[1]).toBe(before[0]);
      await expect(page.locator("#boardSort")).toHaveValue("manual");
      expect(
        await page.evaluate(() => localStorage.getItem("trace-board-sort-v2")),
      ).toBe("manual");
    },
  );
  await check(
    "evidence cards can also be reordered by actual drag and drop",
    async () => {
      await page.locator("#boardButton").click();
      const cards = page.locator(".board-card"),
        before = await cards.evaluateAll((es) => es.map((e) => e.dataset.card));
      await cards.nth(0).dragTo(cards.nth(2));
      const after = await cards.evaluateAll((es) =>
        es.map((e) => e.dataset.card),
      );
      expect(after[2]).toBe(before[0]);
      expect(after[0]).toBe(before[1]);
    },
  );
  await check(
    "board JSON exports notes and frozen numerical evidence but deliberately omits preview images",
    async () => {
      await page.locator("#boardButton").click();
      noteId = await page
        .locator(".board-card")
        .first()
        .getAttribute("data-card");
      await page
        .locator("[data-note]")
        .first()
        .fill("PRIVATE NOTE: distinguish association from mechanism.");
      const [dl] = await Promise.all([
        page.waitForEvent("download"),
        page.locator("#exportBoard").click(),
      ]);
      await dl.saveAs("analysis/exports/evidence-board.json");
      const j = JSON.parse(
        fs.readFileSync("analysis/exports/evidence-board.json", "utf8"),
      );
      expect(j.schemaVersion).toBe(2);
      expect(j.records).toHaveLength(cardCount);
      expect(j.records.some((r) => r.note.includes("PRIVATE NOTE"))).toBe(true);
      expect(
        j.records.every((r) => !("image" in r) && r.chartData && r.metric),
      ).toBe(true);
    },
  );
  await check(
    "selection sharing restores the Time lens while excluding private notes and evidence-board contents",
    async () => {
      await clue(page, "VPD_kpa");
      await lens(page, {
        period: "2001-2024",
        season: "DJF",
        quantity: "value",
      });
      await panel(page, "time");
      await page.locator("#yearPicker").fill("2010");
      await closePanel(page);
      await page.locator("#shareButton").click();
      shareURL = await page.evaluate(
        async () =>
          document.querySelector("#shareLink")?.value ||
          (await navigator.clipboard.readText()),
      );
      const u = new URL(shareURL);
      expect(u.searchParams.get("region")).toBe("Ouargla_Sahara");
      expect(u.searchParams.get("season")).toBe("DJF");
      expect(u.searchParams.get("year")).toBe("2010");
      expect(shareURL).not.toMatch(/PRIVATE|note|board/);
      const c = await browser.newContext(contextOptions),
        p = await c.newPage();
      p.on("pageerror", (e) => qa.errors.push("shared view: " + e.message));
      await ready(p, shareURL);
      const s = await p.evaluate(() => ({
        region: window.__TRACE__.state.region,
        variable: window.__TRACE__.state.variable,
        season: window.__TRACE__.state.season,
        quantity: window.__TRACE__.state.quantity,
        year: window.__TRACE__.state.year,
      }));
      expect(s).toEqual({
        region: "Ouargla_Sahara",
        variable: "VPD_kpa",
        season: "DJF",
        quantity: "value",
        year: 2010,
      });
      await expect(p.locator("#boardCount")).toHaveText("0");
      await c.close();
    },
  );
  await check(
    "a closed window disposes only its own ECharts instance",
    async () => {
      const result = await page.evaluate(() => {
        const t = window.__TRACE__,
          w = [...t.manager.windows.values()][0],
          n = t.manager.count;
        w.el.querySelector('[data-action="close"]').click();
        return {
          disposed: w.chart.chart.isDisposed(),
          remaining: t.manager.count,
          expected: n - 1,
        };
      });
      expect(result.disposed).toBe(true);
      expect(result.remaining).toBe(result.expected);
    },
  );
  await check(
    "mobile and short-screen layouts keep map, popups, board sorting and PNG export accessible",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const w = await openChart(page, "cycle");
      await expect(w.locator(".window-context p")).toContainText(
        "All calendar months",
      );
      await expect(w.locator('[data-action="collect"]')).toBeVisible();
      const { bytes } = await grab(
        w,
        '[data-action="png"]',
        "analysis/exports/mobile-cycle.png",
      );
      expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(1280);
      expect(bytes.readUInt32BE(20)).toBeGreaterThan(bytes.readUInt32BE(16));
      await minimize(page);
      await page.locator("#boardButton").click();
      await expect(page.locator("#boardSort")).toBeVisible();
      await expect(
        page
          .locator(".board-card")
          .first()
          .locator('[data-card-action="down"]'),
      ).toBeVisible();
      await page.locator("#closeBoard").click();
      for (const size of [
        { width: 320, height: 650 },
        { width: 768, height: 600 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(size);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBe(size.width);
        const win = await openChart(page, "series"),
          b = await win.boundingBox();
        expect(b.x + b.width).toBeLessThanOrEqual(size.width + 1);
        await expect(win.locator('[data-action="close"]')).toBeVisible();
        await minimize(page);
      }
      await page.setViewportSize(contextOptions.viewport);
    },
  );
  await check(
    "a page reload preserves manual board order, private notes and the selected sort mode",
    async () => {
      const order = await page.evaluate(() =>
        window.__TRACE__.board.map((r) => r.id),
      );
      await ready(page, base);
      await page.locator("#boardButton").click();
      await expect(page.locator("#boardSort")).toHaveValue("manual");
      expect(
        await page
          .locator(".board-card")
          .evaluateAll((es) => es.map((e) => e.dataset.card)),
      ).toEqual(order);
      await expect(page.locator(`[data-note="${noteId}"]`)).toHaveValue(
        "PRIVATE NOTE: distinguish association from mechanism.",
      );
    },
  );
  await page.close();
  async function fallbackPage(prefix, setup, fn) {
    const p = await context.newPage();
    p.on("pageerror", (e) => qa.errors.push(prefix + ": " + e.message));
    try {
      await setup(p);
      await ready(p);
      await fn(p);
    } finally {
      await p.close();
    }
  }
  await qa.check(
    "a static deployment falls back from a missing API and labels the local archive honestly",
    async () =>
      fallbackPage(
        "static",
        (p) =>
          p.route("**/api/atlas", (r) =>
            r.fulfill({
              status: 404,
              contentType: "application/json",
              body: '{"error":"not_deployed"}',
            }),
          ),
        async (p) => {
          await expect(p.locator("#dataConnection")).toHaveText(
            "LOCAL ARCHIVE",
          );
          await p
            .locator('.site-anchor[data-region="Oran_West"] .site-chip')
            .click();
          await expect(p.locator(".inspector-value")).toContainText("+0.302");
        },
      ),
  );
  await qa.check(
    "blocked remote imagery/elevation retain the real local basemap and an explicitly labelled ellipsoid",
    async () =>
      fallbackPage(
        "remote fallback",
        async (p) => {
          await p.route("https://gibs.earthdata.nasa.gov/**", (r) => r.abort());
          await p.route("https://elevation3d.arcgis.com/**", (r) => r.abort());
        },
        async (p) => {
          await p.evaluate(
            () => (window.__TRACE__.map.viewer.useDefaultRenderLoop = true),
          );
          await p.waitForFunction(
            () => window.__TRACE__.map.imagery === "natural",
            null,
            { timeout: 20000 },
          );
          await expect(p.locator("#terrainStatus")).toContainText(
            "TERRAIN UNAVAILABLE",
          );
          await expect(p.locator("#terrainStatus")).toContainText(
            "LOCAL BASEMAP",
          );
          expect(await p.evaluate(() => window.__TRACE__.map.fallback)).toBe(
            false,
          );
          const w = await openChart(p, "series");
          await expect(w.locator(".window-stats")).toContainText("+0.302");
          await quiet(p);
        },
      ),
  );
  await qa.check(
    "disabled WebGL uses the geographic 2D fallback and disables unsupported camera tools",
    async () =>
      fallbackPage(
        "WebGL fallback",
        (p) =>
          p.addInitScript(() => {
            const get = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
              return /webgl/i.test(type) ? null : get.call(this, type, ...args);
            };
          }),
        async (p) => {
          expect(await p.evaluate(() => window.__TRACE__.map.fallback)).toBe(
            true,
          );
          await expect(p.locator("#fallbackMap svg")).toBeVisible();
          await expect(p.locator("#measureButton")).toBeDisabled();
          await expect(p.locator("#zoomIn")).toBeDisabled();
          await p
            .locator('.site-anchor[data-region="Djelfa_Steppe"] .site-chip')
            .click();
          await expect(p.locator(".inspector-value")).toContainText("+0.366");
        },
      ),
  );
  await qa.check(
    "a missing Cesium SDK still permits CSV-backed charts and accessible regional selection",
    async () =>
      fallbackPage(
        "SDK fallback",
        (p) => p.route("**/cesium/Cesium.js", (r) => r.abort()),
        async (p) => {
          expect(await p.evaluate(() => window.__TRACE__.map.fallback)).toBe(
            true,
          );
          const w = await openChart(p, "series");
          await expect(w.locator(".window-stats")).toContainText("+0.302");
          await expect(p.locator("#fallbackMap svg")).toBeVisible();
        },
      ),
  );
  await qa.check(
    "unavailable browser storage gives an explicit in-memory warning while evidence remains exportable",
    async () =>
      fallbackPage(
        "storage fallback",
        (p) =>
          p.addInitScript(() => {
            localStorage.removeItem("trace-board-v2");
            const set = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
              if (key.startsWith("trace-board"))
                throw new DOMException("Storage disabled", "SecurityError");
              return set.call(this, key, value);
            };
          }),
        async (p) => {
          await p.evaluate(() => {
            try {
              localStorage.removeItem("trace-board-v2");
            } catch {}
          });
          const w = await openChart(p, "series");
          await w.locator('[data-action="collect"]').click();
          await expect(p.locator("#toast")).toContainText("memory only");
          await p.locator("#boardButton").click();
          const [dl] = await Promise.all([
            p.waitForEvent("download"),
            p.locator("#exportBoard").click(),
          ]);
          await dl.saveAs("analysis/exports/in-memory-board.json");
          expect(
            JSON.parse(
              fs.readFileSync("analysis/exports/in-memory-board.json", "utf8"),
            ).records.length,
          ).toBeGreaterThan(0);
        },
      ),
  );
  await qa.check(
    "missing API and static data leave a useful visible startup error, not a fabricated empty atlas",
    async () => {
      const p = await context.newPage();
      p.on("pageerror", (e) =>
        qa.errors.push("data unavailable: " + e.message),
      );
      try {
        await p.route("**/api/atlas", (r) =>
          r.fulfill({ status: 503, body: "unavailable" }),
        );
        await p.route("**/data/atlas.json", (r) =>
          r.fulfill({ status: 503, body: "unavailable" }),
        );
        await p.goto(base, { waitUntil: "domcontentloaded" });
        await expect(p.locator("#startup")).toContainText(
          "Prepared data could not be loaded",
        );
        expect(await p.evaluate(() => !!window.__TRACE__)).toBe(false);
      } finally {
        await p.close();
      }
    },
  );
} catch (e) {
  qa.errors.push("Harness: " + e.message);
  console.log("HARNESS", e.message);
} finally {
  qa.finish();
  await browser.close();
}

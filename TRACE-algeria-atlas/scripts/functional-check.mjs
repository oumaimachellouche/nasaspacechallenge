import { expect } from "@playwright/test";
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
  plotClick,
  report,
  base,
} from "./browser-helpers.mjs";
const browser = await launch(),
  context = await browser.newContext(contextOptions),
  page = await context.newPage();
page.setDefaultTimeout(12000);
const qa = report("analysis/functional-check.json");
page.on("pageerror", (e) => qa.errors.push(e.message));
const check = async (name, fn) => {
  await qa.check(name, fn);
  await page
    .evaluate(() => {
      document.querySelector("#infoDialog")?.close();
      document.querySelector("#boardDialog")?.close();
      window.__TRACE__?.manager.minimizeAll();
    })
    .catch(() => {});
};
let frozenId, seriesId, boardLength;
try {
  await ready(page);
  await check(
    "the real Cesium map occupies at least 80% of the screen, without a fixed sidebar",
    async () => {
      const s = await page.evaluate(() => ({
        ratio:
          document.querySelector("#fieldMap").getBoundingClientRect().height /
          innerHeight,
        viewer: !!window.__TRACE__.map.viewer,
        fallback: window.__TRACE__.map.fallback,
        count: document.querySelectorAll(".site-chip").length,
        visible: [...document.querySelectorAll(".site-anchor")].filter(
          (e) => getComputedStyle(e).display !== "none",
        ).length,
      }));
      expect(s.ratio).toBeGreaterThanOrEqual(0.8);
      expect(s.viewer).toBe(true);
      expect(s.fallback).toBe(false);
      expect(s.count).toBe(6);
      expect(s.visible).toBe(6);
      await expect(page.locator("#dataConnection")).toHaveText(
        "ARCHIVE API CONNECTED",
      );
      expect(await page.locator("#datasetSelect").count()).toBe(0);
    },
  );
  await check(
    "the selected Oran record reproduces the supplied rate, uncertainty rule and q value",
    async () => {
      await page
        .locator('.site-anchor[data-region="Oran_West"] .site-chip')
        .click();
      await expect(page.locator(".inspector-value")).toContainText("+0.302");
      await expect(page.locator(".inspector-value")).toContainText("10 yr");
      const w = await openChart(page, "series");
      await w.locator('[data-action="details"]').click();
      await expect(page.locator("#dialogContent")).toContainText("0.0031");
      await expect(page.locator("#dialogContent")).toContainText(
        "114 supplied annual tests",
      );
      await expect(page.locator("#dialogContent")).toContainText(
        "not proof of no change",
      );
    },
  );
  await check(
    "the clue picker exposes exactly the seven agreed concepts and their beginner labels",
    async () => {
      await panel(page, "clues");
      const ids = await page
        .locator(".clue-option")
        .evaluateAll((es) => es.map((e) => e.dataset.variable));
      expect(ids).toEqual([
        "T2M",
        "VPD_kpa",
        "P_minus_E",
        "PRECTOTCORR_m2",
        "PRECIP_gpm",
        "SWGDN",
        "AOD_total",
      ]);
      await expect(page.locator("#panelContent")).toContainText(
        "not soil wetness",
      );
      await expect(page.locator("#panelContent")).toContainText(
        "not a visibility",
      );
      await closePanel(page);
    },
  );
  await check(
    "every curated primary clue changes the mapped quantity; archived choices cannot be selected",
    async () => {
      for (const id of [
        "T2M",
        "VPD_kpa",
        "P_minus_E",
        "PRECTOTCORR_m2",
        "PRECIP_gpm",
        "SWGDN",
        "AOD_total",
      ]) {
        await clue(page, id);
        expect(await page.evaluate(() => window.__TRACE__.state.variable)).toBe(
          id,
        );
        expect(
          await page.locator(".site-value").allTextContents(),
        ).not.toContain("NaN");
      }
      const before = await page.locator("#activeName").innerText();
      await page.evaluate(() => window.__TRACE__.selectVariable("DUST_SHARE"));
      await expect(page.locator("#activeName")).toHaveText(before);
    },
  );
  await check(
    "IMERG automatically uses its actual overlap and complete winters contain 23 values",
    async () => {
      await clue(page, "PRECIP_gpm");
      await panel(page, "time");
      await expect(page.locator('[data-period="1984-2024"]')).toBeDisabled();
      await page.locator('[data-season="DJF"]').click();
      await closePanel(page);
      const w = await openChart(page, "series");
      await expect(w.locator(".metric-secondary")).toContainText("23 seasons");
      expect(await page.evaluate(() => window.__TRACE__.state.period)).toBe(
        "2001-2024",
      );
    },
  );
  await check(
    "the unified Time lens retains whole-year calculations as well as complete seasons",
    async () => {
      await clue(page, "T2M");
      await lens(page, {
        period: "1984-2024",
        season: "DJF",
        quantity: "trend",
      });
      let w = await openChart(page, "series");
      await expect(w.locator(".metric-secondary")).toContainText("40 seasons");
      await minimize(page);
      await lens(page, { season: "annual" });
      w = await openChart(page, "series");
      await expect(w.locator(".metric-secondary")).toContainText("41 years");
    },
  );
  await check(
    "all six two/three-input combinations map actual event frequencies or a physical product difference",
    async () => {
      const ids = [
        "HEAT_DRYING",
        "HEAT_RAIN",
        "HEAT_DRY_RAIN",
        "RAIN_GAP",
        "CLEAR_SOLAR",
        "HOT_WATER",
      ];
      await panel(page, "combine");
      expect(await page.locator(".case-option").count()).toBe(6);
      await closePanel(page);
      for (const id of ids) {
        await panel(page, "combine");
        await page.locator(`[data-variable="${id}"]`).click();
        const s = await page.evaluate(() => {
          const t = window.__TRACE__,
            s = t.state,
            v =
              t.data.views[
                [s.region, s.variable, s.period, s.season].join("|")
              ];
          return {
            variable: s.variable,
            quantity: s.quantity,
            slope: v.slope * 10,
            shown: document.querySelector(
              `.site-anchor[data-region="${s.region}"] .site-value`,
            ).textContent,
          };
        });
        expect(s.variable).toBe(id);
        expect(s.quantity).toBe("trend");
        expect(Number(s.shown.replaceAll(",", ""))).toBeCloseTo(s.slope, 2);
        await expect(page.locator("#legendUnit")).toHaveText(
          id === "RAIN_GAP" ? "mm/day / 10 yr" : "pp / 10 yr",
        );
      }
    },
  );
  await check(
    "combination help exposes the real formula, fixed reference and exact threshold table",
    async () => {
      await panel(page, "combine");
      await page.locator('[data-variable="HEAT_DRY_RAIN"]').click();
      await page.locator("#legendInfo").click();
      await expect(page.locator(".formula")).toContainText("AND");
      await expect(page.locator("#dialogContent")).toContainText("1991–2020");
      await expect(page.locator("#dialogContent")).toContainText(
        "not a validated",
      );
      await page.locator("#closeDialog").click();
      const w = await openChart(page, "series");
      await w.locator('[data-action="details"]').click();
      expect(await page.locator(".threshold-details tbody tr").count()).toBe(
        12,
      );
      await expect(page.locator(".threshold-details")).toContainText("n = 30");
    },
  );
  await check(
    "all five analysis types exist simultaneously as independently rendered popup windows",
    async () => {
      await clue(page, "T2M");
      await lens(page, {
        period: "1984-2024",
        season: "annual",
        quantity: "trend",
      });
      for (const type of [
        "series",
        "cycle",
        "stripes",
        "compare",
        "relationships",
      ]) {
        const w = await openChart(page, type);
        await expect(w.locator("canvas")).toHaveCount(1);
        await expect(w.locator(".win-legend")).not.toBeEmpty();
        await expect(w.locator(".win-caption")).not.toBeEmpty();
      }
      expect(await page.locator(".evidence-window").count()).toBe(5);
      expect(
        await page.evaluate(
          () =>
            new Set(
              [...window.__TRACE__.manager.windows.values()].map(
                (w) => w.chart.chart,
              ),
            ).size,
        ),
      ).toBe(5);
    },
  );
  await check(
    "following and duplicated/frozen windows keep genuinely independent selections",
    async () => {
      const w = await openChart(page, "series");
      seriesId = await w.getAttribute("data-window");
      await w.locator('[data-action="clone"]').click();
      frozenId = await page.evaluate(
        () => [...window.__TRACE__.manager.windows.values()].at(-1).id,
      );
      await minimize(page);
      await clue(page, "VPD_kpa");
      const states = await page.evaluate(
        ({ a, b }) => [
          window.__TRACE__.manager.windows.get(a).state.variable,
          window.__TRACE__.manager.windows.get(b).state.variable,
        ],
        { a: seriesId, b: frozenId },
      );
      expect(states).toEqual(["VPD_kpa", "T2M"]);
      await page.locator(`[data-restore="${frozenId}"]`).click();
      await expect(
        page.locator(`[data-window="${frozenId}"] .window-follow`),
      ).toContainText("Frozen selection");
    },
  );
  await check(
    "anomalies subtract the stated reference rather than rescaling the observations",
    async () => {
      await page.locator(`[data-restore="${frozenId}"]`).click();
      const w = page.locator(`[data-window="${frozenId}"]`);
      await w.locator('[data-param="anomaly"]').check();
      const values = await page.evaluate((id) => {
        const t = window.__TRACE__,
          w = t.manager.windows.get(id),
          v = t.data.views["Oran_West|T2M|1984-2024|annual"],
          ref = v.series.filter((p) => p[0] >= 1991 && p[0] <= 2020);
        return {
          shown: w.chart.chart
            .getOption()
            .series.find((s) => s.name === "Observed").data[0][1],
          expected:
            v.series[0][1] - ref.reduce((a, p) => a + p[1], 0) / ref.length,
        };
      }, frozenId);
      expect(values.shown).toBeCloseTo(values.expected, 8);
      await expect(w.locator('[data-param="anomaly"]')).toBeFocused();
    },
  );
  await check(
    "regional comparison bars include zero and retain each region’s 95% slope interval",
    async () => {
      const w = await openChart(page, "compare"),
        id = await w.getAttribute("data-window");
      const s = await page.evaluate((id) => {
        const c = window.__TRACE__.manager.windows.get(id).chart.chart,
          o = c.getOption();
        return {
          scale: o.xAxis[0].scale,
          series: o.series.map((s) => s.name),
          zero: c.convertToPixel({ xAxisIndex: 0 }, 0),
          first: c.convertToPixel({ xAxisIndex: 0 }, 0.05),
        };
      }, id);
      expect(s.scale).toBe(false);
      expect(s.series).toContain("95% slope interval");
      expect(s.first).toBeGreaterThan(s.zero);
      await plotClick(page, w, "Regional value", 1);
      expect(await page.evaluate(() => window.__TRACE__.state.region)).toBe(
        "Annaba_East",
      );
    },
  );
  await check(
    "a climate stripe can inspect its actual year on the map and has a numerical anomaly legend",
    async () => {
      const w = await openChart(page, "stripes");
      await expect(w.locator(".win-legend")).toContainText("kPa");
      await expect(w.locator(".win-caption")).toContainText(
        "local to this selection",
      );
      await plotClick(page, w, "Anomaly", 10);
      expect(await page.evaluate(() => window.__TRACE__.state.year)).toBe(1994);
      expect(await page.evaluate(() => window.__TRACE__.state.quantity)).toBe(
        "value",
      );
    },
  );
  await check(
    "relationship selectors are restricted, and detrending changes the actual paired association",
    async () => {
      const w = await openChart(page, "relationships"),
        id = await w.getAttribute("data-window");
      expect(await w.locator('[data-param="relationX"] option').count()).toBe(
        7,
      );
      const before = await page.evaluate(
        (id) => window.__TRACE__.manager.windows.get(id).chart.relation.r,
        id,
      );
      await w.locator('[data-param="detrend"]').check();
      const after = await page.evaluate(
        (id) => window.__TRACE__.manager.windows.get(id).chart.relation.r,
        id,
      );
      expect(after).not.toBeCloseTo(before, 4);
      await expect(w.locator(".win-caption")).toContainText(
        "Temperature is an input to VPD",
      );
    },
  );
  await check(
    "a relationship containing IMERG is paired only over 2001–2024",
    async () => {
      const w = await openChart(page, "relationships"),
        id = await w.getAttribute("data-window");
      await w.locator('[data-param="relationY"]').selectOption("PRECIP_gpm");
      const r = await page.evaluate((id) => {
        const w = window.__TRACE__.manager.windows.get(id);
        return {
          period: w.state.period,
          n: w.chart.relation.n,
          first: w.chart.relation.points[0][0],
        };
      }, id);
      expect(r).toEqual({ period: "2001-2024", n: 24, first: 2001 });
      await expect(w.locator(".window-context p")).toContainText("2001–2024");
    },
  );
  await check(
    "collecting chart-specific snapshots prevents exact duplicates and preserves context",
    async () => {
      for (const type of ["series", "cycle", "relationships"]) {
        const w = await openChart(page, type);
        await w.locator('[data-action="collect"]').click();
        await minimize(page);
      }
      boardLength = await page.evaluate(() => window.__TRACE__.board.length);
      expect(boardLength).toBe(3);
      const w = await openChart(page, "cycle");
      await w.locator('[data-action="collect"]').click();
      await expect(page.locator("#boardCount")).toHaveText("3");
      await page.locator("#boardButton").click();
      expect(await page.locator(".board-card").count()).toBe(3);
      await expect(
        page
          .locator(".board-card")
          .filter({ hasText: "Annual cycle" })
          .locator(".metric-label"),
      ).toContainText("Monthly peak");
    },
  );
  await check(
    "evidence notes persist locally with a frozen calculation, source hashes and honest units",
    async () => {
      await page.locator("#boardButton").click();
      await page
        .locator("[data-note]")
        .first()
        .fill("Separate a changing record from a causal explanation.");
      const rows = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("trace-board-v2")),
      );
      expect(rows).toHaveLength(boardLength);
      expect(rows[0].note).toContain("causal explanation");
      expect(rows[0].schemaVersion).toBe(2);
      expect(rows[0].sources.inputFiles).toHaveLength(5);
      expect(rows[0].metric.unit).toBe("Pearson r");
    },
  );
  await check(
    "a reload retains the evidence board and reopening a saved card freezes its original selection",
    async () => {
      await ready(page, base);
      await expect(page.locator("#boardCount")).toHaveText(String(boardLength));
      await page.locator("#boardButton").click();
      await expect(page.locator("[data-note]").first()).toHaveValue(
        "Separate a changing record from a causal explanation.",
      );
      await page.locator('[data-card-action="revisit"]').first().click();
      await expect(
        page.locator(".evidence-window .window-follow"),
      ).toContainText("Frozen selection");
    },
  );
  await check(
    "year playback advances real values and pauses without changing annual logic",
    async () => {
      await lens(page, {
        period: "1984-2024",
        season: "annual",
        quantity: "value",
      });
      await panel(page, "time");
      await page.locator("#yearPicker").fill("1990");
      await page.locator("#playButton").click();
      await expect(page.locator("#playButton")).toHaveAttribute(
        "aria-label",
        "Pause yearly observations",
      );
      await page.waitForFunction(
        () => window.__TRACE__.state.year > 1990,
        null,
        { timeout: 5000 },
      );
      await page.locator("#playButton").click();
      await expect(page.locator("#playButton")).toHaveAttribute(
        "aria-label",
        "Play yearly observations",
      );
      expect(await page.evaluate(() => window.__TRACE__.state.season)).toBe(
        "annual",
      );
      await closePanel(page);
    },
  );
  await check(
    "mobile keeps a map-first viewport and usable chart, Time lens and evidence controls",
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const size = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        ratio:
          document.querySelector("#fieldMap").getBoundingClientRect().height /
          innerHeight,
      }));
      expect(size.width).toBe(390);
      expect(size.ratio).toBeGreaterThan(0.8);
      await panel(page, "time");
      await expect(page.locator('[data-season="annual"]')).toBeVisible();
      await closePanel(page);
      const w = await openChart(page, "series");
      const box = await w.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
      await expect(w.locator('[data-action="collect"]')).toBeVisible();
      await expect(w.locator('[data-action="close"]')).toBeVisible();
      await expect(page.locator("#boardButton")).toBeVisible();
    },
  );
} catch (e) {
  qa.errors.push("Harness: " + e.message);
  console.log("HARNESS", e.message);
} finally {
  qa.finish();
  await browser.close();
}

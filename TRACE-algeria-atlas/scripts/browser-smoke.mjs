import { expect } from "@playwright/test";
import fs from "node:fs";
import {
  launch,
  contextOptions,
  ready,
  quiet,
  settleMap,
  minimize,
  openChart,
  panel,
  closePanel,
  base,
} from "./browser-helpers.mjs";
const mobile = process.env.TRACE_MOBILE === "1",
  name = mobile ? "mobile" : "desktop";
const browser = await launch(),
  context = await browser.newContext({
    ...contextOptions,
    viewport: mobile ? { width: 390, height: 844 } : contextOptions.viewport,
  }),
  page = await context.newPage();
const logs = [];
page.on("pageerror", (e) =>
  logs.push({ type: "pageerror", message: e.message }),
);
page.on("console", (m) => {
  if (["error", "warning"].includes(m.type()))
    logs.push({ type: m.type(), message: m.text().slice(0, 700) });
});
page.on("requestfailed", (r) =>
  logs.push({
    type: "requestfailed",
    url: r.url(),
    message: r.failure()?.errorText,
  }),
);
let state, failure;
fs.mkdirSync("analysis/screenshots", { recursive: true });
try {
  await ready(page, base, { tiles: true });
  await settleMap(page, { tiles: true });
  state = await page.evaluate(() => ({
    ready: !!window.__TRACE__,
    fallback: window.__TRACE__.map.fallback,
    terrainReady: window.__TRACE__.map.terrainReady,
    tilesLoaded: window.__TRACE__.map.viewer?.scene.globe.tilesLoaded,
    renderedTiles:
      window.__TRACE__.map.viewer?.scene.globe._surface._tilesToRender.length,
    frames: window.__TRACE__.map.viewer?.scene.frameState.frameNumber,
    projection: window.__TRACE__.map.projection,
    imagery: window.__TRACE__.map.imagery,
    points: document.querySelectorAll(".site-anchor").length,
    visiblePoints: [...document.querySelectorAll(".site-anchor")].filter(
      (e) => getComputedStyle(e).display !== "none",
    ).length,
    status: document.querySelector("#terrainStatus").textContent,
    areaLayer: window.__TRACE__.map.regionalLayer,
    mapAreaFraction:
      document.querySelector("#fieldMap").getBoundingClientRect().height /
      innerHeight,
    bodyWidth: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  await page.screenshot({
    path: `analysis/screenshots/${name}-initial.png`,
    timeout: 30000,
  });
  expect(state.ready).toBe(true);
  expect(state.fallback).toBe(false);
  expect(state.terrainReady).toBe(true);
  expect(state.areaLayer.status).toBe("ready");
  expect(state.areaLayer.areaCount).toBe(6);
  expect(state.tilesLoaded).toBe(true);
  expect(state.renderedTiles).toBeGreaterThan(0);
  expect(state.visiblePoints).toBe(6);
  expect(state.mapAreaFraction).toBeGreaterThan(0.8);
  expect(state.bodyWidth).toBe(state.viewport);
  const w = await openChart(page, "series");
  await w.locator('[data-action="collect"]').click();
  await page.screenshot({
    path: `analysis/screenshots/${name}-window.png`,
    timeout: 30000,
  });
  await minimize(page);
  if (!mobile) {
    await panel(page, "combine");
    await page.locator('[data-variable="HEAT_DRY_RAIN"]').click();
    await page
      .locator('.site-anchor[data-region="Oran_West"] .site-chip')
      .click();
    await settleMap(page);
    await page.screenshot({
      path: "analysis/screenshots/desktop-compound.png",
      timeout: 30000,
    });
    const c = await openChart(page, "compare");
    await c.locator('[data-action="collect"]').click();
    await minimize(page);
    const cycle = await openChart(page, "cycle");
    await cycle.locator('[data-action="collect"]').click();
    await minimize(page);
    await page.locator("#boardButton").click();
    await page.screenshot({
      path: "analysis/screenshots/desktop-board.png",
      timeout: 30000,
    });
    await page.locator("#closeBoard").click();
  }
  expect(logs.filter((e) => e.type === "pageerror")).toHaveLength(0);
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  const report = {
    release: "wilaya-layers-v2.1",
    base,
    browser: await browser.version(),
    passed: !failure,
    state,
    failure,
    logs,
  };
  fs.writeFileSync(
    `analysis/smoke-${name}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log("STATE", JSON.stringify(state, null, 2));
  console.log("LOGS", JSON.stringify(logs, null, 2));
  await browser.close();
}

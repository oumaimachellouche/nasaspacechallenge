import { chromium } from "@playwright/test";
import fs from "node:fs";
export const base = process.env.TRACE_BASE_URL || "http://127.0.0.1:5173/";
export const launch = () =>
  chromium.launch({
    channel: process.env.TRACE_BROWSER_CHANNEL || "chromium",
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--disable-accelerated-2d-canvas",
      "--disable-dev-shm-usage",
      "--no-sandbox",
    ],
  });
export const contextOptions = {
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
  reducedMotion: "reduce",
};
export async function quiet(page) {
  await page.evaluate(() => {
    if (window.__TRACE__?.map.viewer)
      window.__TRACE__.map.viewer.useDefaultRenderLoop = false;
  });
}
export async function ready(
  page,
  url = base,
  { tiles = false, tilesTimeout = 90000 } = {},
) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__TRACE__, null, {
    timeout: 45000,
  });
  await page.locator("#startup").waitFor({ state: "detached", timeout: 10000 });
  if (tiles)
    await page
      .waitForFunction(
        () => {
          const m = window.__TRACE__.map,
            g = m.viewer?.scene.globe;
          return (
            m.fallback ||
            (g?.tilesLoaded &&
              m.viewer.dataSourceDisplay.ready &&
              g._surface._tilesToRender.length > 0 &&
              (m.terrainReady ||
                document
                  .querySelector("#terrainStatus")
                  .textContent.includes("UNAVAILABLE")) &&
              !m.viewer.camera._currentFlight)
          );
        },
        null,
        { timeout: tilesTimeout },
      )
      .catch(() => {});
  await quiet(page);
}
// A new material can be queued after an old dataSourceDisplay.ready=true.
// Advance actual scene frames before freezing captures. These flags are test-only.
export async function settleMap(page, { tiles = false } = {}) {
  await page.evaluate(() => {
    const v = window.__TRACE__?.map.viewer;
    if (!v || window.__TRACE__.map.fallback) return;
    window.__traceCaptureFrame = v.scene.frameState.frameNumber;
    v.useDefaultRenderLoop = true;
    v.scene.requestRenderMode = false;
    v.scene.requestRender();
  });
  try {
    await page.waitForFunction(
      (tiles) => {
        const m = window.__TRACE__.map,
          v = m.viewer;
        return (
          m.fallback ||
          (v.scene.frameState.frameNumber > window.__traceCaptureFrame + 5 &&
            v.dataSourceDisplay.ready &&
            (!tiles || v.scene.globe.tilesLoaded))
        );
      },
      tiles,
      { timeout: 60000 },
    );
  } finally {
    await page.evaluate(() => {
      const v = window.__TRACE__?.map.viewer;
      if (v) {
        v.scene.requestRenderMode = true;
        v.useDefaultRenderLoop = false;
      }
    });
  }
}
export async function minimize(page) {
  await page.evaluate(() => window.__TRACE__.manager.minimizeAll());
}
export async function closeWindows(page) {
  await page.evaluate(() =>
    document
      .querySelectorAll('.evidence-window [data-action="close"]')
      .forEach((b) => b.click()),
  );
}
export async function panel(page, name) {
  if (
    (await page
      .locator(`[data-panel="${name}"]`)
      .getAttribute("aria-expanded")) !== "true"
  )
    await page.locator(`[data-panel="${name}"]`).click();
}
export async function closePanel(page) {
  if (await page.locator("#toolPanel").isVisible())
    await page.locator("#closePanel").click();
}
export async function clue(page, id) {
  await panel(page, "clues");
  await page.locator(`[data-variable="${id}"]`).click();
}
export async function lens(page, { period, season, quantity } = {}) {
  await panel(page, "time");
  if (period) await page.locator(`[data-period="${period}"]`).click();
  if (season) await page.locator(`[data-season="${season}"]`).click();
  if (quantity) await page.locator(`[data-quantity="${quantity}"]`).click();
  await closePanel(page);
}
export async function openChart(page, type) {
  await page.locator(`.evidence-dock [data-open-chart="${type}"]`).click();
  const id = await page.evaluate(
    (type) =>
      [...window.__TRACE__.manager.windows.values()]
        .reverse()
        .find((w) => w.state.tab === type && w.follow)?.id,
    type,
  );
  return page.locator(`[data-window="${id}"]`);
}
export async function plotClick(page, windowLocator, seriesName, index) {
  const id = await windowLocator.getAttribute("data-window");
  const point = await page.evaluate(
    ({ id, seriesName, index }) => {
      const w = window.__TRACE__.manager.windows.get(id),
        s = w.chart.chart.getOption().series.find((s) => s.name === seriesName),
        d = s.data[index];
      const p =
        seriesName === "Anomaly"
          ? [index, 0.5]
          : seriesName === "Regional value"
            ? [d.value / 2, index]
            : d;
      return w.chart.chart.convertToPixel(
        {
          seriesIndex: w.chart.chart
            .getOption()
            .series.findIndex((s) => s.name === seriesName),
        },
        p,
      );
    },
    { id, seriesName, index },
  );
  const box = await windowLocator.locator(".win-chart").boundingBox();
  await page.mouse.move(box.x + point[0], box.y + point[1]);
  await page.mouse.click(box.x + point[0], box.y + point[1]);
}
export function report(file) {
  const checks = [],
    errors = [];
  const save = () => {
    fs.mkdirSync("analysis", { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          release: "wilaya-layers-v2.1",
          browser: process.env.TRACE_BROWSER_CHANNEL || "chromium",
          checks,
          errors,
        },
        null,
        2,
      ),
    );
  };
  const check = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, passed: true });
      console.log("PASS", name);
    } catch (e) {
      checks.push({ name, passed: false, error: e.message });
      console.log("FAIL", name, e.message.slice(0, 400));
    }
    save();
  };
  const finish = () => {
    save();
    console.log(
      "SUMMARY",
      `${checks.filter((c) => c.passed).length}/${checks.length}`,
      "page errors:",
      errors,
    );
    if (checks.some((c) => !c.passed) || errors.length) process.exitCode = 1;
  };
  return { checks, errors, check, finish };
}

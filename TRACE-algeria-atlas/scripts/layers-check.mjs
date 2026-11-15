import { expect } from "@playwright/test";
import fs from "node:fs";
import { createHash } from "node:crypto";
import {
  launch,
  contextOptions,
  ready,
  quiet,
  settleMap,
  panel,
  closePanel,
  clue,
  lens,
  openChart,
  minimize,
  report,
  base,
} from "./browser-helpers.mjs";
const browser = await launch(),
  context = await browser.newContext(contextOptions),
  page = await context.newPage();
page.setDefaultTimeout(20000);
const qa = report("analysis/layers-check.json");
page.on("pageerror", (e) => qa.errors.push(e.message));
const screenshots = [];
fs.mkdirSync("analysis/screenshots", { recursive: true });
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
const geoScreen = async (p, lon, lat) => {
  const point = await p.evaluate(
    ({ lon, lat }) => {
      const v = window.__TRACE__.map.viewer,
        C = window.Cesium,
        p = C.SceneTransforms.worldToWindowCoordinates(
          v.scene,
          C.Cartesian3.fromDegrees(lon, lat),
        );
      return { x: p.x, y: p.y };
    },
    { lon, lat },
  );
  const box = await p.locator("#cesiumContainer canvas").boundingBox();
  return { x: box.x + point.x, y: box.y + point.y };
};
const capture = async (p, filename) => {
  await p.evaluate(() =>
    document.querySelector("#toast")?.classList.remove("visible"),
  );
  await p.screenshot({
    path: `analysis/screenshots/${filename}`,
    timeout: 30000,
  });
};
try {
  await ready(page, base, { tiles: true });
  await settleMap(page);
  await check(
    "six real GeoJSON polygon entities are loaded into Cesium with disclosed 2017 display-only provenance",
    async () => {
      const s = await page.evaluate(() => ({
        layer: window.__TRACE__.map.regionalLayer,
        meta: window.__TRACE__.map.regionMetadata,
        ds:
          window.__TRACE__.map.viewer.dataSources.get(0) instanceof
          window.Cesium.GeoJsonDataSource,
      }));
      expect(s.layer.status).toBe("ready");
      expect(s.layer.areaCount).toBe(6);
      expect(s.layer.partCount).toBe(6);
      expect(s.ds).toBe(true);
      expect(s.meta.boundaryYearRepresented).toBe(2017);
      expect(s.meta.currentLegalBoundariesClaimed).toBe(false);
      expect(s.layer.records.every((r) => r.visible)).toBe(true);
      await expect(page.locator("#footprintNote")).toContainText("2017");
    },
  );
  await check(
    "Cesium GPU picking hits the interior of the actual Tamanrasset polygon, away from any label or point",
    async () => {
      const p = await geoScreen(page, 4.2, 24);
      const hit = await page.evaluate(({ x, y }) => {
        const v = window.__TRACE__.map.viewer,
          r = v.canvas.getBoundingClientRect(),
          pick = v.scene.pick(
            new window.Cesium.Cartesian2(x - r.left, y - r.top),
          );
        return {
          polygon: !!pick?.id?.polygon,
          region: pick?.id?.properties?.traceRegion?.getValue(),
        };
      }, p);
      expect(hit).toEqual({ polygon: true, region: "Tamanrasset_Hoggar" });
    },
  );
  await check(
    "hovering an area shows its actual numerical value, a pointer cursor and the display-footprint caveat",
    async () => {
      const p = await geoScreen(page, 4.2, 24);
      await page.mouse.move(p.x, p.y);
      await expect(page.locator("#mapHover")).toBeVisible();
      await expect(page.locator("#mapHover")).toContainText("Tamanrasset");
      await expect(page.locator("#mapHover")).toContainText("+0.338");
      await expect(page.locator("#mapHover")).toContainText(
        "not an extraction footprint",
      );
      expect(
        await page.evaluate(() => window.__TRACE__.map.regionalLayer.hovered),
      ).toBe("Tamanrasset_Hoggar");
      expect(
        await page
          .locator("#cesiumContainer canvas")
          .evaluate((e) => e.style.cursor),
      ).toBe("pointer");
    },
  );
  await check(
    "clicking the polygon interior selects its record and opens the inspector without touching a label",
    async () => {
      const p = await geoScreen(page, 4.2, 24);
      await page.mouse.click(p.x, p.y);
      expect(await page.evaluate(() => window.__TRACE__.state.region)).toBe(
        "Tamanrasset_Hoggar",
      );
      await expect(page.locator("#siteInspector")).toBeVisible();
      await expect(page.locator(".inspector-value")).toContainText("+0.338");
      await page.locator('[data-inspect="close"]').click();
    },
  );
  await check(
    "an unfilled location does not invent a regional climate readout or select the nearest label",
    async () => {
      const p = await geoScreen(page, -3, 27);
      await page.mouse.move(p.x, p.y);
      await page.mouse.click(p.x, p.y);
      await expect(page.locator("#mapHover")).toBeHidden();
      expect(await page.evaluate(() => window.__TRACE__.state.region)).toBe(
        "Tamanrasset_Hoggar",
      );
    },
  );
  await check(
    "dragging the real map changes projected geography and Fit Algeria restores it",
    async () => {
      const before = await geoScreen(page, 4.2, 24);
      await page.evaluate(() => {
        window.__TRACE__.map.viewer.useDefaultRenderLoop = true;
      });
      await page.mouse.move(1100, 520);
      await page.mouse.down();
      await page.mouse.move(1220, 560, { steps: 12 });
      await page.mouse.up();
      await settleMap(page);
      const moved = await geoScreen(page, 4.2, 24);
      expect(
        Math.hypot(moved.x - before.x, moved.y - before.y),
      ).toBeGreaterThan(15);
      await page.evaluate(() => {
        window.__TRACE__.map.viewer.useDefaultRenderLoop = true;
      });
      await page.locator("#mapHome").click();
      await page.waitForFunction(
        () => !window.__TRACE__.map.viewer.camera._currentFlight,
      );
      await settleMap(page);
      const restored = await geoScreen(page, 4.2, 24);
      expect(
        Math.hypot(restored.x - before.x, restored.y - before.y),
      ).toBeLessThan(2);
    },
  );
  const ids = [
    "HEAT_DRYING",
    "HEAT_RAIN",
    "HEAT_DRY_RAIN",
    "RAIN_GAP",
    "CLEAR_SOLAR",
    "HOT_WATER",
  ];
  const patterns = [
    "diagonal",
    "stipple",
    "crosshatch",
    "paired",
    "solar",
    "waves",
  ];
  for (let i = 0; i < ids.length; i++)
    await check(
      `${ids[i]} renders its own named texture on all six areas, with real per-region slopes and matching units`,
      async () => {
        const id = ids[i];
        await panel(page, "combine");
        await expect(page.locator("#panelContent")).not.toContainText(
          /COMBINATION\s*\d/,
        );
        await page.locator(`[data-variable="${id}"]`).click();
        await settleMap(page);
        const s = await page.evaluate(() => {
          const t = window.__TRACE__,
            s = t.state,
            C = window.Cesium;
          const material = t.map.viewer.dataSources
            .get(0)
            .entities.values.filter((e) => e.polygon)
            .map((e) => ({
              id: e.properties.traceRegion.getValue(),
              type: e.polygon.material.getType(C.JulianDate.now()),
              color: e.polygon.material.color
                .getValue(C.JulianDate.now())
                .toCssHexString(),
            }));
          return {
            state: { ...s },
            layer: t.map.regionalLayer,
            material,
            expected: t.data.regions.map((r) => ({
              id: r.id,
              slope:
                t.data.views[[r.id, s.variable, s.period, s.season].join("|")]
                  .slope * 10,
            })),
          };
        });
        expect(s.state.quantity).toBe("trend");
        expect(s.layer.style).toBe(patterns[i]);
        expect(s.material.every((m) => m.type === "Image")).toBe(true);
        for (const r of s.layer.records) {
          expect(r.value).toBeCloseTo(
            s.expected.find((e) => e.id === r.region).slope,
            7,
          );
          expect(r.pattern).toBe(patterns[i]);
          expect(
            s.material
              .find((m) => m.id === r.region)
              .color.toLowerCase()
              .slice(0, 7),
          ).toBe(r.color.toLowerCase());
        }
        await expect(page.locator("#activeName")).not.toContainText(
          /combination\s*\d/i,
        );
        await expect(page.locator("#legendUnit")).toHaveText(
          id === "RAIN_GAP" ? "mm/day / 10 yr" : "pp / 10 yr",
        );
        // Assert rendered geometry, not only Entity/material metadata. A premature
        // capture can still show labels while asynchronous ground geometry builds.
        const pick = await page.evaluate(() => {
          const v = window.__TRACE__.map.viewer,
            C = window.Cesium;
          const p = C.SceneTransforms.worldToWindowCoordinates(
            v.scene,
            C.Cartesian3.fromDegrees(4.2, 24),
          );
          const hit = v.scene.pick(p)?.id;
          return {
            polygon: !!hit?.polygon,
            region: hit?.properties?.traceRegion?.getValue(),
          };
        });
        expect(pick).toEqual({ polygon: true, region: "Tamanrasset_Hoggar" });
        const bytes = await page
          .locator("#cesiumContainer canvas")
          .screenshot({ timeout: 30000 });
        screenshots.push(createHash("sha256").update(bytes).digest("hex"));
        await capture(page, `layer-${id}.png`);
      },
    );
  await check(
    "the six textured layer screenshots are genuinely different rendered map canvases",
    async () => {
      expect(new Set(screenshots).size).toBe(6);
    },
  );
  await check(
    "Average and Year quick controls recolor areas with actual frequency/product values, not slopes or scores",
    async () => {
      await panel(page, "combine");
      await page.locator('[data-variable="HEAT_DRY_RAIN"]').click();
      for (const [quantity, field] of [
        ["mean", "mean"],
        ["value", "series"],
      ]) {
        await page
          .locator(`#legendQuantity [data-map-quantity="${quantity}"]`)
          .click();
        await settleMap(page);
        const s = await page.evaluate(() => {
          const t = window.__TRACE__,
            s = t.state;
          return {
            layer: t.map.regionalLayer,
            quantity: s.quantity,
            expected: t.data.regions.map((r) => {
              const v =
                t.data.views[[r.id, s.variable, s.period, s.season].join("|")];
              return {
                id: r.id,
                value:
                  s.quantity === "mean"
                    ? v.mean
                    : v.series.find((p) => p[0] === s.year)[1],
              };
            }),
          };
        });
        expect(s.quantity).toBe(quantity);
        for (const r of s.layer.records)
          expect(r.value).toBeCloseTo(
            s.expected.find((e) => e.id === r.region).value,
            7,
          );
        await expect(page.locator("#legendUnit")).toHaveText("% of months");
      }
      await lens(page, {
        season: "DJF",
        period: "2001-2024",
        quantity: "trend",
      });
      await settleMap(page);
      const s = await page.evaluate(() => {
        const t = window.__TRACE__,
          s = t.state;
        return {
          value: t.map.regionalLayer.records[0].value,
          expected:
            t.data.views[
              [
                t.map.regionalLayer.records[0].region,
                s.variable,
                s.period,
                s.season,
              ].join("|")
            ].slope * 10,
        };
      });
      expect(s.value).toBeCloseTo(s.expected, 7);
    },
  );
  await check(
    "texture/area/opacity controls change actual materials and visibility while retaining the record values",
    async () => {
      await panel(page, "map");
      await page.locator("#textureSetting").uncheck();
      await closePanel(page);
      await settleMap(page);
      expect(
        await page.evaluate(() =>
          window.__TRACE__.map.viewer.dataSources
            .get(0)
            .entities.values.every(
              (e) =>
                !e.polygon ||
                e.polygon.material.getType(window.Cesium.JulianDate.now()) ===
                  "Color",
            ),
        ),
      ).toBe(true);
      await panel(page, "map");
      await page.locator("#areaOpacitySetting").fill("20");
      expect(
        await page.evaluate(
          () => window.__TRACE__.map.regionSettings.fillOpacity,
        ),
      ).toBe(0.2);
      await page.locator("#regionSetting").uncheck();
      expect(
        await page.evaluate(() =>
          window.__TRACE__.map.viewer.dataSources
            .get(0)
            .entities.values.every((e) => !e.show),
        ),
      ).toBe(true);
      await page.locator("#regionSetting").check();
      await page.locator("#textureSetting").check();
      await page.locator("#areaOpacitySetting").fill("58");
      await closePanel(page);
      await settleMap(page);
      expect(
        await page.evaluate(() =>
          window.__TRACE__.map.regionalLayer.records.every(
            (r) => r.visible && r.pattern === "crosshatch",
          ),
        ),
      ).toBe(true);
    },
  );
  await check(
    "unsupported trends have faded fills and dashed borders; support-only filtering hides the actual polygon too",
    async () => {
      await clue(page, "T2M");
      await lens(page, {
        period: "1984-2024",
        season: "annual",
        quantity: "trend",
      });
      await settleMap(page);
      const before = await page.evaluate(() => {
        const t = window.__TRACE__,
          C = window.Cesium,
          e = t.map.viewer.dataSources.get(0).entities.getById("Annaba_East"),
          b = t.map.viewer.entities.values.find(
            (e) => e.name === "Annaba · display boundary (2017)",
          );
        return {
          alpha: e.polygon.material.color.getValue(C.JulianDate.now()).alpha,
          border: b.polyline.material.getType(C.JulianDate.now()),
        };
      });
      expect(before.alpha).toBeCloseTo(0.58 * 0.53, 5);
      expect(before.border).toBe("PolylineDash");
      await panel(page, "map");
      await page.locator("#supportSetting").check();
      expect(
        await page.evaluate(
          () =>
            window.__TRACE__.map.viewer.dataSources
              .get(0)
              .entities.getById("Annaba_East").show,
        ),
      ).toBe(false);
      expect(
        await page.evaluate(
          () =>
            window.__TRACE__.map.regionalLayer.records.filter((r) => r.visible)
              .length,
        ),
      ).toBe(5);
      await page.locator("#supportSetting").uncheck();
      await closePanel(page);
    },
  );
  await check(
    "2D and 3D retain the same GPU-pickable geographic display polygons",
    async () => {
      for (const projection of ["2D", "3D"]) {
        await page.evaluate(() => {
          window.__TRACE__.map.viewer.useDefaultRenderLoop = true;
        });
        await page.locator("#projectionButton").click();
        await page.waitForFunction(
          (projection) => window.__TRACE__.map.projection === projection,
          projection,
          { timeout: 30000 },
        );
        await settleMap(page);
        const hit = await page.evaluate(() => {
          const v = window.__TRACE__.map.viewer,
            C = window.Cesium;
          const p = C.SceneTransforms.worldToWindowCoordinates(
            v.scene,
            C.Cartesian3.fromDegrees(4.2, 24),
          );
          const entity = v.scene.pick(p)?.id;
          return {
            polygon: !!entity?.polygon,
            region: entity?.properties?.traceRegion?.getValue(),
          };
        });
        expect(hit).toEqual({ polygon: true, region: "Tamanrasset_Hoggar" });
      }
    },
  );
  await check(
    "opening/collecting an analysis after an area click keeps the selected record and display-geometry provenance",
    async () => {
      await settleMap(page);
      const p = await geoScreen(page, 4.2, 24);
      await page.mouse.click(p.x, p.y);
      const w = await openChart(page, "series");
      await w.locator('[data-action="collect"]').click();
      const card = await page.evaluate(() => window.__TRACE__.board[0]);
      expect(card.selection.region).toBe("Tamanrasset_Hoggar");
      expect(
        card.mapDisplay?.boundaryYear ??
          card.snapshot?.mapDisplay?.boundaryYear,
      ).toBe(2017);
      await minimize(page);
      await page.locator('[data-inspect="close"]').click();
    },
  );
  await check(
    "a fresh touch-sized mobile map renders the areas and tapping the polygon selects its record",
    async () => {
      const c = await browser.newContext({
        ...contextOptions,
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      // The separate fresh-mobile smoke checks live providers. This touch
      // interaction check uses the explicit local context to isolate input.
      await c.route(
        /https:\/\/(gibs\.earthdata\.nasa\.gov|elevation3d\.arcgis\.com)\//,
        (r) => r.abort(),
      );
      const p = await c.newPage();
      p.on("pageerror", (e) => qa.errors.push(e.message));
      try {
        await ready(p, base, { tiles: true });
        await settleMap(p, { tiles: true });
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth === innerWidth,
          ),
        ).toBe(true);
        expect(
          await p.evaluate(() => window.__TRACE__.map.regionalLayer.areaCount),
        ).toBe(6);
        const g = await geoScreen(p, 4.2, 24);
        await p.touchscreen.tap(g.x, g.y);
        await expect
          .poll(() => p.evaluate(() => window.__TRACE__.state.region))
          .toBe("Tamanrasset_Hoggar");
        await expect(p.locator("#siteInspector")).toBeVisible();
        await p.locator('[data-inspect="close"]').click();
        await panel(p, "combine");
        await p.locator('[data-variable="CLEAR_SOLAR"]').click();
        await settleMap(p);
        await capture(p, "layers-mobile.png");
      } finally {
        await c.close();
      }
    },
  );
  await check(
    "without the Cesium SDK the labelled SVG fallback retains the same selectable, textured administrative areas",
    async () => {
      const c = await browser.newContext(contextOptions);
      await c.route("**/cesium/Cesium.js", (r) => r.abort());
      const p = await c.newPage();
      p.on("pageerror", (e) => qa.errors.push(e.message));
      try {
        await ready(p);
        expect(await p.evaluate(() => window.__TRACE__.map.fallback)).toBe(
          true,
        );
        expect(await p.locator("[data-region-area]").count()).toBe(6);
        const area = p.locator('[data-region-area="Tamanrasset_Hoggar"]');
        await area.focus();
        await p.keyboard.press("Enter");
        expect(await p.evaluate(() => window.__TRACE__.state.region)).toBe(
          "Tamanrasset_Hoggar",
        );
        await p.locator('[data-inspect="close"]').click();
        await panel(p, "combine");
        await p.locator('[data-variable="HEAT_RAIN"]').click();
        expect(
          await p.locator("#fallbackMap pattern#area-texture circle").count(),
        ).toBe(2);
        await capture(p, "layers-svg-fallback.png");
      } finally {
        await c.close();
      }
    },
  );
  await check(
    "a missing boundary file shows an explicit warning but never removes the scientific records or invents polygons",
    async () => {
      const c = await browser.newContext(contextOptions);
      await c.route("**/data/study-wilayas.geojson", (r) =>
        r.fulfill({ status: 404, body: "missing" }),
      );
      const p = await c.newPage();
      p.on("pageerror", (e) => qa.errors.push(e.message));
      try {
        await ready(p);
        expect(
          await p.evaluate(() => window.__TRACE__.map.regionalLayer.status),
        ).toBe("unavailable");
        await expect(p.locator("#footprintNote")).toContainText("unavailable");
        const w = await openChart(p, "series");
        await expect(w.locator(".window-stats")).toContainText("+0.302");
      } finally {
        await c.close();
      }
    },
  );
} finally {
  qa.finish();
  await browser.close();
}

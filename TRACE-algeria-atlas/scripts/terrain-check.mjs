// Optional live-provider check: the archive/data tests do not need this network call.
import { expect } from "@playwright/test";
import fs from "node:fs";
import {
  launch,
  contextOptions,
  ready,
  quiet,
  base,
} from "./browser-helpers.mjs";
const browser = await launch();
const context = await browser.newContext(contextOptions);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let state, failure;
try {
  await ready(page, base, { tiles: true });
  await page.evaluate(() => {
    const m = window.__TRACE__.map,
      C = window.Cesium;
    m.settings({ labels: false, regions: false });
    window.__terrainStartFrame = m.viewer.scene.frameState.frameNumber;
    m.viewer.useDefaultRenderLoop = true;
    // A geographic context view in the Hoggar mountains, not a climate footprint.
    m.viewer.camera.flyToBoundingSphere(
      new C.BoundingSphere(C.Cartesian3.fromDegrees(5.7, 23.3), 0),
      {
        duration: 0,
        offset: new C.HeadingPitchRange(0, C.Math.toRadians(-35), 60000),
      },
    );
    m.viewer.scene.requestRender();
    m.viewer.render();
  });
  await page.waitForFunction(
    () => {
      const m = window.__TRACE__.map;
      return (
        m.terrainReady &&
        m.viewer.scene.frameState.frameNumber >
          window.__terrainStartFrame + 2 &&
        m.viewer.scene.globe.tilesLoaded &&
        Math.max(
          ...m.viewer.scene.globe._surface._tilesToRender.map((t) => t.level),
        ) >= 6 &&
        !m.viewer.camera._currentFlight
      );
    },
    null,
    { timeout: 90000 },
  );
  state = await page.evaluate(async () => {
    const m = window.__TRACE__.map,
      C = window.Cesium;
    const positions = [];
    for (const lat of [23.1, 23.3, 23.5])
      for (const lon of [5.5, 5.7, 5.9])
        positions.push(C.Cartographic.fromDegrees(lon, lat));
    const sampled = await Promise.race([
      C.sampleTerrain(m.viewer.terrainProvider, 10, positions, true),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Elevation sample timed out")),
          45000,
        ),
      ),
    ]);
    return {
      provider:
        m.viewer.terrainProvider instanceof
        C.ArcGISTiledElevationTerrainProvider
          ? "Esri ArcGIS elevation"
          : "Other configured terrain",
      terrainReady: m.terrainReady,
      terrainTilesLoaded: m.viewer.scene.globe.tilesLoaded,
      frame: m.viewer.scene.frameState.frameNumber,
      renderedLevels: [
        ...new Set(
          m.viewer.scene.globe._surface._tilesToRender.map((t) => t.level),
        ),
      ].sort((a, b) => a - b),
      projection: m.projection,
      imagery: m.imagery,
      verticalExaggeration: m.viewer.scene.verticalExaggeration,
      cameraPitchDegrees: C.Math.toDegrees(m.viewer.camera.pitch),
      cameraHeightMetres: m.viewer.camera.positionCartographic.height,
      sampleLevel: 10,
      samples: sampled.map((p) => ({
        lon: C.Math.toDegrees(p.longitude),
        lat: C.Math.toDegrees(p.latitude),
        heightMetres: p.height,
      })),
      caution:
        "External-provider geometric context; approximate sampled elevations, not survey validation or the resolution/footprint of the climate archive.",
    };
  });
  const heights = state.samples.map((p) => p.heightMetres);
  expect(state.terrainReady).toBe(true);
  expect(state.terrainTilesLoaded).toBe(true);
  expect(heights.every(Number.isFinite)).toBe(true);
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(100);
  expect(state.verticalExaggeration).toBe(1);
  expect(errors).toHaveLength(0);
  await quiet(page);
  await page.evaluate(() => {
    const v = window.__TRACE__.map.viewer;
    v.scene.requestRender();
    v.render();
  });
  fs.mkdirSync("analysis/screenshots", { recursive: true });
  await page.screenshot({
    path: "analysis/screenshots/terrain-hoggar.png",
    timeout: 30000,
  });
  console.log(JSON.stringify(state, null, 2));
} catch (e) {
  failure = e.message;
  throw e;
} finally {
  fs.writeFileSync(
    "analysis/terrain-check.json",
    JSON.stringify(
      {
        release: "wilaya-layers-v2.1",
        base,
        passed: !failure,
        state,
        failure,
        errors,
      },
      null,
      2,
    ),
  );
  await browser.close();
}

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  LENS_STYLES,
  layerStyle,
  geometryPolygons,
  pointInGeometry,
  patternMarkup,
  patternURL,
} from "../src/map-layers.js";
import { scaleDomain, PALETTES, colorFor } from "../src/data.js";
import { statsSnapshot } from "../src/field.js";
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url));
const json = (name) => JSON.parse(read(name));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const source = json(
  "public/data/geography/geoBoundaries-DZA-ADM1-2017.geojson",
);
const areas = json("public/data/study-wilayas.geojson");
const meta = json("public/data/wilaya-display-metadata.json");
const data = json("public/data/atlas.json");
const state = {
  region: "Oran_West",
  variable: "T2M",
  period: "1984-2024",
  season: "annual",
  quantity: "trend",
  palette: 0,
  tab: "series",
  year: 2024,
};

test("the licensed boundary snapshot is pinned, hashed and explicitly dated, not represented as current legal geography", () => {
  assert.equal(source.features.length, 48);
  assert.equal(meta.boundaryYearRepresented, 2017);
  assert.equal(meta.currentLegalBoundariesClaimed, false);
  assert.match(meta.license, /ODbL-1.0/);
  assert.equal(
    hash(read("public/data/geography/geoBoundaries-DZA-ADM1-2017.geojson")),
    meta.sourceSHA256,
  );
  assert.equal(
    hash(read("public/data/study-wilayas.geojson")),
    meta.displaySHA256,
  );
  assert.match(
    read("public/licenses/geoBoundaries-ODbL-1.0.txt").toString(),
    /Open Database/,
  );
});
test("all six user-approved administrative display areas preserve source coordinates without fabricated extraction footprints", () => {
  assert.equal(areas.features.length, 6);
  assert.deepEqual(
    new Set(areas.features.map((f) => f.properties.traceRegion)),
    new Set(data.regions.map((r) => r.id)),
  );
  for (const f of areas.features) {
    const original = source.features.find(
      (s) => s.properties.shapeID === f.properties.shapeID,
    );
    assert.ok(original);
    assert.deepEqual(f.geometry, original.geometry);
    assert.equal(f.properties.displayOnly, true);
    assert.match(
      f.properties.geometryRole,
      /not a verified extraction footprint/,
    );
  }
});
test("every display ring closes and every new label location is inside its real wilaya geometry", () => {
  for (const f of areas.features) {
    const b = f.properties.bounds;
    assert.ok(pointInGeometry(f.geometry, ...f.properties.labelPoint));
    for (const p of geometryPolygons(f.geometry))
      for (const ring of p) {
        assert.deepEqual(ring[0], ring.at(-1));
        assert.ok(ring.length >= 4);
        for (const [lon, lat] of ring) {
          assert.ok(Number.isFinite(lon) && Number.isFinite(lat));
          assert.ok(lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]);
        }
      }
  }
});
test("point-in-area picking respects holes and multipart geography, not a radius around a label", () => {
  const g = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
      [
        [
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 11],
          [10, 10],
        ],
      ],
    ],
  };
  assert.equal(pointInGeometry(g, 0.5, 0.5), true);
  assert.equal(pointInGeometry(g, 2, 2), false);
  assert.equal(pointInGeometry(g, 10.5, 10.5), true);
  assert.equal(pointInGeometry(g, 5, 5), false);
});
test("the six named lenses have six distinct texture identities and valid shared palettes", () => {
  assert.deepEqual(Object.keys(LENS_STYLES), data.interface.caseIds);
  assert.equal(
    new Set(Object.values(LENS_STYLES).map((s) => s.pattern)).size,
    6,
  );
  for (const [id, s] of Object.entries(LENS_STYLES)) {
    assert.equal(s.name, data.recipes.find((r) => r.id === id).title);
    assert.doesNotMatch(s.name, /combination\s*\d/i);
    assert.ok(PALETTES[s.palette]);
    assert.ok(patternMarkup(s.pattern).length > 40);
  }
  assert.equal(layerStyle("T2M").pattern, "solid");
});
test("texture swatches are separate embedded patterns, not a network image or generated climate raster", () => {
  const urls = Object.values(LENS_STYLES).map((s) => patternURL(s.pattern));
  assert.equal(new Set(urls).size, 6);
  for (const u of urls) {
    assert.ok(u.startsWith("data:image/svg+xml,"));
    assert.match(decodeURIComponent(u.split(",")[1]), /<pattern/);
  }
});
test("rainfall disagreement remains zero-centered in all three map quantities and all palette colors are finite", () => {
  for (const quantity of ["trend", "mean", "value"]) {
    const s = { ...state, variable: "RAIN_GAP", period: "2001-2024", quantity };
    const d = scaleDomain(data, s);
    assert.equal(d[0], -d[1]);
    for (let p = 0; p < PALETTES.length; p++)
      for (const v of [d[0], 0, d[1]])
        assert.match(colorFor(v, d, p), /^#[0-9a-f]{6}$/);
  }
});
test("analysis exports preserve the display-only geometry role and its own provenance hash", () => {
  assert.equal(data.sources.regionalDisplay.displaySHA256, meta.displaySHA256);
  const snapshot = statsSnapshot(data, state);
  assert.equal(snapshot.mapDisplay.geometrySHA256, meta.displaySHA256);
  assert.equal(snapshot.mapDisplay.uniformRegionalColor, true);
  assert.match(snapshot.mapDisplay.textureMeaning, /not within-area/);
});

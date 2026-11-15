# Validation handoff — TRACE 2.1.0

## Executed against the wilaya-layer production build

The application was built with Vite and served by **`npm start` → `node server/serve.mjs` on port 5173**, not just the development server. The tested environment used Node 20.20.2, full Chromium 159.0.8154.6 headless with SwiftShader, and preparation `trace-prep-2`.

Prepared archive SHA-256: `3bca495d24885fe8f4c293844854147382f90860a85f64d291992c2d1aa08fc6`.

| Check group | Executed result |
|---|---|
| Archive/data tests | **25 / 25 passed**, including eight geometry/provenance/texture/export checks |
| Isolated Node API tests | **11 / 11 endpoint subtests passed**, plus the enclosing test group (Node reports 12 passing tests) |
| Wilaya/texture production-browser interactions | **21 / 21 passed**; actual polygon GPU picking, all six textures, pointer hover/click, mobile touch, 2D/3D, value/season controls, opacity/visibility/support and failure paths; page errors `[]` |
| Core production-browser interactions | **20 / 20 passed**; captured page errors `[]` |
| Extended production-browser/map/export/failure checks | **30 / 30 passed**; captured page errors `[]` |
| Production HTTP routing | **16 / 16 passed**: UI, SDK, worker, archive and API; the subset, metadata, upstream geometry and license all match local hashes; genuine missing-file/API 404s; `.env` blocked; unsupported writes return 405 |
| Fresh desktop smoke, 1440 × 900 | Cesium 3D, NASA imagery, real elevation initialized, country-view tile queue complete, **six visible labels and six real display areas**, map canvas **93.56%** of viewport; warnings/errors/request failures `[]` |
| Fresh mobile smoke, 390 × 844 | A new mobile-sized context, not a resized desktop session: same real providers, six labels and six real display areas, map canvas **93.60%**, no horizontal overflow; warnings/errors/request failures `[]` |
| Additional live-terrain check | Hoggar oblique view rendered levels 5/8/9 with **1× vertical exaggeration**; nine level-10 provider samples were finite, approximately **1,441–2,366 m**; no captured page errors |
| Isolated included-build startup | **16 / 16 passed** in a separate folder **without `node_modules`**: Node startup, built UI/SDK/worker/JS/CSS, exact v2.1 API/static archive and four hash-checked geometry/provenance/license assets and genuine missing-file 404s |

The archive/API tests are independent numerical/endpoint checks; the API suite starts its own temporary server. The UI suites, smoke runs and separate HTTP checks used the production service. `npm run test:smoke` completed both fresh desktop and mobile runs sequentially.

The original and regenerated display subset/metadata are byte-identical after offline reproduction. Source geometry SHA-256 is `99c13937ec0ce1d937815999b6b546c5ab1912dc5924c6c798c5e11b617feac8`; the six-feature subset SHA-256 is `d0ee10afa3b4c36b567a4aeeb3c960aab9873e3f07d58923ede0bbc8e03ec2e0`. Formal tests verify all six source-coordinate arrays, label containment, closed rings, hole/multipart picking, distinct texture identities and zero-centered rainfall-disagreement domains.

A direct comparison to the delivered v2.0 archive confirmed **all observations, 1,620 numerical views, formulas, interface definitions and monthly threshold tables are unchanged**. Only geographic provenance/limitation metadata changed in the prepared payload (`analysis/geography-data-regression.json`).

The default Oran whole-year temperature record reproduces **+0.302 °C / 10 years**, with supplied MK q approximately **0.0031**. Statistical support remains conditional on the documented classical assumptions and declared multiple-testing family.

## Covered interactions

### Map-first investigation

- At least 80% map-canvas area without a permanent data sidebar or fixed chart column.
- Exactly seven agreed primary clues and six current two/three-input combinations; archived quantities are not exposed through a new exhaustive picker.
- Actual fixed-percentile joint-month frequencies, a three-input heat/dry-air/low-rain layer, and the paired 2001–2024 rainfall-product difference.
- Whole-year and complete-season calculations retained in the unified Time lens; actual IMERG overlap and complete winter counts.
- True Cesium camera zoom/home, regional fly-to, north reset, oblique view and 2D/3D scene morphing.
- Terrain, imagery, labels, opacity, palette and conditional trend-support controls.
- WGS84 geographic probe and two-position ellipsoidal geodesic measurement; no invented climate-pixel readout.
- Observed-year inspection, chart-to-map point/stripe/region selection and playback/pause.

### Real administrative display layers

- Direct Cesium `scene.pick` from polygon interiors away from labels, with pointer hover/value cards, area selection and bounds-based focus; a non-filled location does not select a nearby record.
- All six actual rendered lens textures have screenshots and a ground-polygon GPU-pick assertion, not just Entity/material metadata: Thermal diagonals, Rainfall stipple, Three-clue crosshatch, Paired rainfall bands, Solar lattice and Water-balance waves.
- Actual per-region slope × 10 / mean / selected-year values and units, seasonal/period changes, material colors, named swatches, adjustable fills, true area hiding and conditional support filtering.
- 2D and 3D retain GPU-pickable polygons. A fresh **touch-emulated 390 × 844** context taps an interior location and selects Tamanrasset, then renders the solar texture. This input-isolation check deliberately uses the labelled local/ellipsoid context; the separate fresh-mobile smoke verifies live NASA/Esri context.
- Missing SDK → keyboard-selectable, textured SVG areas; missing boundary GeoJSON → explicit unavailable warning while scientific charts remain accessible. No unverified substitute shapes are invented.
- All geometry checks concern **user-approved, fixed 2017 administrative display proxies**, not verification of original climate extraction coverage or current legal boundaries.

### Independent analysis windows and evidence

- All five independent types can coexist: time series, annual cycle, stripes, comparison and relationships.
- Separate ECharts instances, correct disposal, map-follow/freeze, duplicate, drag/keyboard movement, resize, expand, minimize and restore.
- Chart-specific summaries: monthly peak for cycle, latest anomaly for stripes, selected regional quantity for comparison, and descriptive paired r for relationships.
- Native-unit versus anomaly calculations; numerical stripe scale; zero-anchored comparison bars with each slope interval; paired-period detrending.
- Collection de-duplication, frozen selections, notes, persistence, revisit, manual/arrow/drag ordering and type/clue/region/newest sorting.
- Selection-only share URLs restore the Time lens but exclude private notes and board contents; a separate fresh browser context restored zero board cards.
- Responsive checks at 390 × 844, 320 × 650, 768 × 600 and 1920 × 1080, in addition to the fresh mobile launch.

### Real downloads

The extended suite saved the files in `analysis/exports/`, rather than only inspecting mock links:

- Five chart CSVs contain **42 / 13 / 42 / 7 / 42 rows including the header**, respectively, for the default time-series / cycle / stripes / comparison / relationship checks.
- Five valid, non-empty PNGs are at least 1,280 pixels wide. Their exported legends, units and method notes were visually inspected; a separate portrait mobile-cycle PNG was also generated.
- Compound analysis JSON retains the 12 monthly input cutoffs, operators, reference n=30, formula, source hashes and six-region recomputed test family.
- Evidence-board JSON retains notes and frozen numerical context but deliberately omits preview-image data. Storage-failure evidence remains exportable in memory.

The screenshots of the latest desktop/mobile map, popup, compound inspector and board were visually inspected for framing and layout. The five exported chart figures were inspected for distinct visual encodings, readable legends, uncertainty labels and non-causal interpretation. The separate Hoggar capture confirms a rendered oblique context view, not a new regional climate surface.

### Explicit failure behavior

- Missing API → local prepared JSON and **LOCAL ARCHIVE**, not a false connected badge.
- Blocked remote context → local Natural Earth imagery and an explicitly labelled ellipsoid.
- Disabled WebGL / missing SDK → labelled geographic SVG fallback, retained real display areas/data/charts and disabled unsupported camera tools.
- Missing display-area GeoJSON → explicit area-unavailable notice, retained record selectors and scientific charts, no fabricated replacement polygons.
- Unavailable browser storage → visible in-memory-only warning, not a false persistence promise.
- Missing API and static archive → useful visible startup error, not fabricated observations.

## Evidence files

- `analysis/validation.json`: numerical consistency audit and known scientific warnings.
- `analysis/source-manifest.json`: unchanged original CSV SHA-256 hashes.
- `analysis/data-tests.txt`, `analysis/api-tests.txt`: Node test results.
- `analysis/core-tests.txt`, `analysis/extended-tests.txt`: production-browser console results.
- `analysis/functional-check.json`, `analysis/extended-check.json`: 20 and 30 individual browser checks.
- `analysis/layers-check.json`, `analysis/layers-tests.txt`: 21 specific polygon/texture/interaction/failure checks.
- `analysis/boundary-preparation.json`, `analysis/boundary-reproduction.txt`, `analysis/geography-data-regression.json`: pinned selection, unchanged offline output and unchanged scientific data/definitions.
- `analysis/smoke-desktop.json`, `analysis/smoke-mobile.json`, `analysis/production-smoke.txt`: final clean fresh-context smoke diagnostics.
- `analysis/production-http.json`, `analysis/production-http.txt`: 16 production routing/hash checks; repeat with `node scripts/http-check.mjs`.
- `analysis/release-runtime.json`, `analysis/release-runtime.txt`: isolated included-build startup and HTTP checks. To repeat against an extracted ZIP, run `node scripts/release-check.mjs /path/to/TRACE-algeria-atlas` from the source project; do not install dependencies into the target folder for this check.
- `analysis/terrain-check.json`, `analysis/terrain-check.txt`: optional external elevation sampling / rendered-view check; rerun with `node scripts/terrain-check.mjs` while the app is running.
- `analysis/screenshots/desktop-initial.png`, `mobile-initial.png`, `desktop-window.png`, `mobile-window.png`, `desktop-compound.png`, `desktop-board.png`, `terrain-hoggar.png`.
- `analysis/screenshots/layer-*.png`: six separate settled, rendered map textures; `layers-mobile.png`, `layers-svg-fallback.png`: touch-sized local context and SDK-failure geometry.
- `analysis/exports/`: test-generated CSV/PNG/JSON samples, not a user's personal board.
- `analysis/production-build.txt`: successful build output. The classic Cesium script warning is expected: the official SDK is copied locally instead of rebundled.

## Qualifications, not certifications

Chromium used a **software GPU**, not a physical device. Browser tests disable accelerated 2D canvas to avoid a software-renderer PNG readback stall. They pause the Cesium render loop only inside the harness for deterministic captures; the app's render loop remains interactive. The separate terrain capture explicitly waits for new-view frames and tile detail after moving the camera.

The harness waits up to 90 seconds for loaded, rendered tiles and resolved terrain. Ground geometry/material updates are asynchronous: Entity values and a stale `dataSourceDisplay.ready` flag alone can produce a premature labels-only capture. The final layer/smoke harness resumes the actual loop, advances at least six additional scene frames with ready geometry, and checks actual polygon GPU picking. The six final texture captures visibly contain the expected filled, bordered geography. Final desktop/mobile live-context smoke runs passed with warnings/errors/request failures `[]`. Provider initialization alone is not treated as proof of fully rendered relief.

Terrain samples and Blue Marble are **external geographic context**, not independent validation of elevation accuracy, a climate raster or the extraction geometry. The Blue Marble source has finite native resolution and deep zoom does not create extra imagery detail. One country view and one oblique terrain view do not establish every zoom level, terrain cell, device, provider license or future availability. Failure suites intentionally induce warnings in separate contexts.

These checks are not an exhaustive WCAG audit, penetration test, cross-browser certification, physical-device performance audit or independent validation of upstream NASA extraction. Original climate extraction footprints, current legal certification, upstream collection/processing provenance and climate-data redistribution rights remain unverified. Boundary-source/license/vintage are separately documented; administrative display geometry does not resolve those scientific limitations. The gauge-weight unit conflict is preserved/flagged. Temporal dependence is not corrected; threshold-event layers and sparse-event OLS remain exploratory. See [Science](SCIENCE.md) and [Sources](SOURCES.md).

## Handoff status

The Node backend serves the prepared owner-supplied archive; it is **not live NASA ingestion**. The v2 evidence board stays in this browser and is not a central notebook/database service.

The restored handoff workspace has no `.git` directory. **No remote GitHub repository has been created or pushed.** Publication still requires the owner's secure authentication, intentional repository visibility, source-code licensing decision and data-permission review. The release package excludes `.git`, dependencies, local environment files and credential paths; the owner can initialize a fresh repository after extraction.

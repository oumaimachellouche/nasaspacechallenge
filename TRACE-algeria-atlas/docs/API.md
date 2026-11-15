# Read-only prepared-data API

The Node backend serves the supplied, reproducibly prepared **local archive**, not live NASA ingestion. It is available through the same-origin `/api` prefix in `npm run dev`, `npm run preview` and `npm start`. No account or credentials are needed for these uploaded records.

## Endpoints

| GET / HEAD endpoint | Response |
|---|---|
| `/api/health` | Archive mode/hash, dimensions, preparation version, curated clue/combination counts, `liveNASAIngestion:false` |
| `/api/catalog` | Retained archive catalog **plus `interface`**, supported seasons/periods, audit and sources |
| `/api/atlas` | Complete browser archive, monthly values, thresholds and **1,620 views** |
| `/api/view?region=...&variable=...` | Selected annual/seasonal view, definition/recipe, compound thresholds, support rule and caveats |
| `/api/view?...&format=csv` | Annual/seasonal native-unit values and trend metadata |
| `/api/monthly?region=...&variable=...` | Monthly values over actual supplied coverage |

### Interface scope is intentional

The archive retains 28 metrics and 10 definitions/recipes for provenance. A beginner-facing client should use:

- `interface.primaryVariables`: the **seven** agreed primary clues, with approachable labels, original IDs, units in the variable catalog and icons/colors.
- `interface.caseIds`: the **six** current two/three-input combinations.
- `interface.variableDecisions`: GWETROOT replacement, confirmed PRECTROOT alias, separate Solar/Clarity choices and their limits.

Do not populate a new exhaustive 28-item UI from `variables[]`. The preserved GPCP hot–dry and dust-share metrics are not part of the current combination menu. Original IDs/definitions remain available for provenance and explicit archival queries.

## Geographic display provenance (not extraction coverage)

`/api/catalog` and `/api/atlas` expose `sources.regionalDisplay`: the fixed **2017 geoBoundaries / OpenStreetMap historical 48-unit** source, its ODbL license, six-record display mapping, bounds/label points, and source/subset SHA-256 digests. Original `regions[].lon/lat` values are retained for archive compatibility, not certified measurement locations; the map uses the separate interior display-label points.

The locally served display files are **static resources, not new observation/API endpoints**:

- `/data/study-wilayas.geojson` — six real administrative display polygons;
- `/data/wilaya-display-metadata.json` — dated source, mappings, hashes and caveats;
- `/data/geography/geoBoundaries-DZA-ADM1-2017.geojson` — unchanged 48-unit source;
- `/licenses/geoBoundaries-ODbL-1.0.txt` — full boundary license.

No query asserts that the regional record covers the whole polygon. The geometry is not a time-varying/current-legal model, extraction mask, pixel grid or service for interpolated climate values. Analysis/card JSON also includes a `mapDisplay` role, geometry digest and texture-meaning caveat.

## Selected annual/seasonal view

```sh
curl 'http://localhost:5173/api/view?region=Oran_West&variable=T2M&period=1984-2024&season=annual'
curl 'http://localhost:5173/api/view?region=Oran_West&variable=T2M&format=csv' -o oran-temperature.csv
curl 'http://localhost:5173/api/view?region=Oran_West&variable=HEAT_DRY_RAIN'
curl 'http://localhost:5173/api/view?region=Oran_West&variable=RAIN_GAP&period=2001-2024'
```

Parameters:

- `region`: exact `regions[].id` from the catalog.
- `variable`: exact archival `variables[].id`; use the interface lists above for curated exploration.
- `period`: `1984-2024` (default) or `2001-2024`.
- `season`: `annual` (default), `DJF`, `MAM`, `JJA` or `SON`.
- `format`: `json` (default) or `csv`.

The JSON includes:

```text
selection, region, variable, view, recipe (when defined), thresholds,
slopeUnits, supportRule, caveats
```

`view.series` is an ordered array of `[year,value]`. `slope`, `ciLow`, `ciHigh` and `senSlope` are **per year**; multiply by 10 for the displayed change over ten years. Rates remain rates. Event-frequency trends are percentage points per ten years, not percent relative growth.

`source` distinguishes supplied/recomputed trend statistics. `qFamily` and `qFamilySize` declare the multiple-testing family. `fitBand` is the classical 95% OLS fitted-mean interval, not a prediction interval. Constant responses are flagged `constantSeries:true`; their finite zero-width OLS interval is degenerate, not evidence of zero event probability. See [Science](SCIENCE.md).

For a joint-condition metric, `thresholds` contains its 12 site/month entries keyed as `region|metric|month`, each with input ID, operator, quantile, cutoff and reference n. The product difference has no percentile thresholds and returns an empty object. Recipes distinguish `joint_event` from `product_difference` and retain formulas/cautions.

Requests for a full 1984–2024 IMERG or `RAIN_GAP` view return **404**. The API never silently extrapolates or substitutes coverage. The UI deliberately switches to the true overlap and announces it.

## Monthly values

```sh
curl 'http://localhost:5173/api/monthly?region=Ouargla_Sahara&variable=VPD_kpa&start=1991&end=2020'
```

Optional `start`/`end` are inclusive integer calendar years within 1984–2024, defaulting to the quantity’s actual bounds. Asking for IMERG over a wider range still returns only its 288 supplied months with a coverage note, not pre-2001 values.

Joint-event monthly values are 0 or 100. Complete annual/seasonal arithmetic means become percentages of months meeting every condition. Fixed thresholds come from the full local 1991–2020 calendar-month reference, not the currently selected analysis period.

## API CSV versus chart CSV

The endpoint’s `format=csv` is a selected annual/seasonal series with native-unit values, per-year slopes/limits, OLS/MK p, adjusted q, support flag, source and family.

The UI’s chart-specific CSVs are composed in `src/field.js` from the same archive:

- **Time series:** native and plotted values, anomaly reference, OLS fit and fitted-mean limits.
- **Annual cycle:** 12 monthly climatology rows, reference counts and P10/P90.
- **Stripes:** values, anomalies, fixed reference and numerical color limit.
- **Compare:** one row per displayed region with the chosen quantity and each trend’s statistics.
- **Relationships:** paired years, native/plotted X/Y, units and detrending flag.

Prepared values use 10 significant digits in native units; the untouched raw source CSVs preserve original precision and are separately downloadable. “Native” does not mean NASA was newly queried.

## Errors and operations

- `400`: invalid selector, period, season, format or year bounds.
- `404`: unknown endpoint or unavailable complete view.
- `405`: unsupported method; **GET and HEAD only**.
- `414`: URL exceeds 4,096 characters.
- `503`: missing/unreadable archive; inspect logs and regenerate.

Errors are JSON `{error,message}` and are not rewritten to the SPA HTML. Clients do not receive filesystem paths or stack traces.

The server caches the archive until mtime/size changes. Successful responses provide a weak representation ETag and `X-Trace-Data-SHA256`; conditional requests can receive 304 and larger responses support gzip. Running the preparation script updates the archive; no continuously running ingestion job exists.

There is no wildcard CORS, upload/write endpoint, account service or central evidence store. Browser requests are relative/same-origin. Cards/notes stay under `trace-board-v2`; sort mode uses `trace-board-sort-v2`. Sharing a selection does not send or encode these notes.

## Deployment modes

1. **Node:** `npm run build && npm start` serves app and archive API on one port.
2. **Static:** serve the complete `dist/` from `/`. If the API fails or exceeds the frontend’s eight-second attempt, `/data/atlas.json` is used and labelled **LOCAL ARCHIVE**, not backend connectivity. The connected label is **ARCHIVE API CONNECTED**.

Static fallback is not a claim that a backend or live NASA service is running. Any future ingestion must be a separate authenticated, provenance-preserving server-side job; never embed Earthdata credentials in this browser payload.

# Science & methods — map-first release

## 1. Supplied archive versus curated interface

Five owner-supplied Giovanni-derived CSVs contain **six regional records, 20 supplied variables, 57,816 monthly rows and 120 region × variable source series**. Nineteen variables span January 1984–December 2024 (492 months); IMERG spans January 2001–December 2024 (288 months). No duplicate monthly keys or internal missing monthly values occur. The annual wide file’s 102 pre-2001 IMERG blanks are real coverage limits, not observations to impute.

Preparation `trace-prep-2` preserves matching supplied annual/seasonal trend statistics. Other views are labelled `recomputed`. The archive contains **28 metrics and 1,620 views**, but the interface deliberately exposes only seven primary clues and six current combinations:

| Clue | Record / units | Interpretation |
|---|---|---|
| Temperature | `T2M`, °C | Supplied mean air temperature at 2 m |
| Air drying | `VPD_kpa`, kPa | Atmospheric saturation deficit, derived from temperature/dew point |
| Water balance | `P_minus_E`, mm/day | Precipitation-minus-evaporation flux proxy; authorized GWETROOT replacement, **not root-zone wetness** |
| Rainfall · model | `PRECTOTCORR_m2`, mm/day | Supplied MERRA-2 corrected precipitation; the confirmed meaning of PRECTROOT |
| Rainfall · satellite | `PRECIP_gpm`, mm/day | Supplied IMERG series, starting in 2001 |
| Solar energy | `SWGDN`, kWh/m²/day | Downward surface shortwave energy, not PV electricity |
| Clarity clue | `AOD_total`, AOD | Total column aerosol optical depth; lower means less aerosol extinction, **not measured visibility** |

GWETROOT was never supplied. The replacement is a different measured/derived concept, not a reconstruction of absent soil moisture. Solar and the aerosol clue are separate variables. The precise aerosol collection/wavelength metadata still need to be archived; TRACE does not invent them.

Raw CSVs are unchanged and downloadable. `sources.inputFiles` retains SHA-256 digests/byte counts. Prepared browser/API/plot tables use **10 significant digits in native units**; the raw files retain original precision. Statistical reproduction audits run before that serialization.

## 2. Geography is not an extraction definition

The country outline is Natural Earth’s 1:10m admin-0 Algeria feature. Its original longitude/latitude vertices remain unchanged; the display polyline is raised 3 km for efficient, visible country-scale rendering. It is **display geometry**, not a terrain-clamped extraction boundary, survey or cadastral line.

The user-approved regional display layer is the **geoBoundaries DZA ADM1 / OpenStreetMap–Wambacher fixed 2017 snapshot**, selected from its historical 48-unit source. It is not a statement about the current administrative count, current legal boundaries or changes during 1984–2024. The six selected upstream simplified geometries are unchanged; no extra smoothing, interpolation or invented boundaries is applied.

| CSV region ID | Administrative display feature |
|---|---|
| Oran_West | Oran |
| Annaba_East | Annaba |
| Setif_Highlands | Sétif |
| Djelfa_Steppe | Djelfa |
| Ouargla_Sahara | Ouargla |
| Tamanrasset_Hoggar | Tamanrasset |

These **real wilaya shapes are display proxies, not verified extraction footprints**, point measurements or proof of whole-wilaya climate coverage. Original extraction polygons/bounds remain unverified. A single supplied regional statistic is repeated uniformly across the chosen display area; there is no within-area interpolation, event-location map, raster reconstruction or national area-weighted estimate.

`public/data/study-wilayas.geojson` contains the six features. `wilaya-display-metadata.json` declares the source, vintage, record mapping, bounds, interior label points, license and SHA-256 digests. Interior points position labels only; original prototype coordinates retained in the archive are not measurement locations. Upstream geometry and license are also bundled. See [Sources](SOURCES.md) for the pinned source and full hashes.

Ground-classified fills follow Cesium’s rendered surface; raised 3,200 m display polylines make the real geographic limits visible at country scale. Longitude/latitude vertices remain unchanged; these strokes are not terrain surveys. Picking uses real polygon entities, with geographic containment for filled display areas while remote tiles load. Hide-areas and support-only filters also suppress area selection. Hover/selection changes the outline, not the underlying data.

### Map value, texture and statistical support

- **Color:** actual `slope × 10`, period mean or selected observed year/complete season, shared with the numerical legend. No normalized risk or suitability score is invented.
- **Texture:** identifies the selected diagnostic only. Heat + dry air → Thermal diagonals; Heat + rainfall shortfall → Rainfall stipple; Heat, dry air + low rain → Three-clue crosshatch; Two rainfall stories → Paired rainfall bands; Bright + low-aerosol months → Solar lattice; Heat + water-balance shortfall → Water-balance waves.
- The texture is decorative identity, never within-region variation, event frequency, location, confidence or uncertainty. Its spacing/stretch has no scientific scale or area meaning.
- Trend colors use symmetric divergence when their values span zero. Rainfall-product disagreement is explicitly zero-centered for trend, mean and year values; sign means IMERG minus MERRA-2, not bias against ground truth. Legends rescale for each selected lens/time context.
- A faded trend fill and dashed border mean the stated support rule failed, not zero/no change. Base fill opacity is adjustable; unsupported trend alpha is 0.53 times that setting. Average/year views do not apply trend-support fading. The stronger-trend filter is conditional on trend view.
- On devices lacking ground-material support, fills remain numeric solid colors and the UI states that texture rendering is unavailable. With WebGL/the SDK unavailable, the labelled SVG fallback reuses the same real geometry and textures; it does not invent relief.

NASA Blue Marble and Esri/optional ion terrain are geographic context, not the spatial resolution of the uploaded records. The supplied PNG is an unchanged reference illustration and is never sampled for numerical values.

### Geographic tools

- Pan, zoom, home, north, tilt, 2D/3D and regional fly-to operate on the actual Cesium camera/scene.
- Probe readouts are WGS84 geographic context. Loaded-terrain height is approximate, depends on current tile detail and is not a survey-quality elevation. With terrain off/unavailable, the mathematical ellipsoid is used and real elevation is not claimed.
- Measurement uses `EllipsoidGeodesic.surfaceDistance` on WGS84 between two clicked geographic positions. It is **horizontal ellipsoidal surface distance**, not terrain-following distance, a route, or an extraction footprint. The raised display line is not used to calculate the number.
- Fallbacks are identified as local imagery, ellipsoid, or geographic SVG 2D; none invent relief or climate values.

## 3. The Time lens retains annual calculations

The Time lens combines period, aggregation and displayed quantity; it does not replace whole-year logic with seasonal-only calculations.

- **Whole year:** unweighted arithmetic mean of 12 monthly values. It matches the supplied annual table and is not day-weighted.
- **Seasons:** unweighted means of three complete months. December is assigned to the following DJF year. Long-record DJF starts in **1985**, n=40; IMERG/rainfall-difference DJF starts in **2002**, n=23.
- **Periods:** 1984–2024 or 2001–2024. A 2001-start variable cannot acquire a fictional full-length view. The UI switches/announces actual overlap; the API returns 404 for unavailable requested views.
- **Change over 10 years:** OLS slope per year × 10. This is a rate, **not** a difference between first/last observations or a 10-year forecast.
- **Typical conditions:** mean of the complete annual/seasonal summaries in that period.
- **Inspect a year:** that complete observed year/season, with playback through actual available years.
- **Rates remain rates:** mm/day means are not annual precipitation totals or accumulated water volumes.

Anomalies subtract the selected season’s fixed **1991–2020** mean, or **2001–2020** for IMERG and the paired rainfall difference. The baseline does not move when changing analysis period. Actual reference n is retained: the shorter DJF reference has 19 complete winters, 2002–2020, even though the nominal label is 2001–2020.

## 4. What each visualization calculates

| Window | Calculation / legend | Important limit |
|---|---|---|
| Time series | Native-unit or baseline-subtracted regional means, OLS fit and 95% fitted-mean band | Band is not a prediction interval; click an observation to inspect its year |
| Annual cycle | Calendar-month means and across-year P10–P90, using all months in the period | Explicitly ignores the map’s season; envelope is a distribution, not statistical confidence |
| Climate stripes | One complete year/season per stripe minus its fixed local reference mean | Numerical symmetric limits rescale independently by selection; equal colors across windows need not mean equal anomalies or significance |
| Compare regions | Six regional values for the selected quantity; trend view adds each slope’s 95% interval | Bars include zero; faded trends fail the support rule; no national area-weighted estimate |
| Relationships | Paired annual/seasonal observations, Pearson r/r² and descriptive association line; color encodes year | No correlation-significance/causal claim; optional paired-interval detrending |

Each window has its own state and ECharts instance. Following windows track map geography, clue and Time lens; custom relationship X/Y and display choices remain window-specific. Freezing/duplicating or revisiting a collected card preserves its original selection. The annual-cycle summary reports a monthly peak rather than falsely labelling an annual trend as its main calculation; stripes report the latest anomaly; comparison summaries identify the selected record, not a national statistic.

Chart CSVs reflect the actual figure: series native/plotted values, fits and fitted-mean limits; 12 monthly climatology/P10/P90 rows; stripe anomalies/reference; regional values and trend metadata; or native/plotted paired values. The separate API view CSV remains an annual/seasonal native-unit series. Full analysis/card JSON keeps source hashes, calculation context and explicit compound thresholds. PNGs include a legend, units and method notes.

## 5. Trend estimators, uncertainty and multiple testing

For `y = a + b × year`, the point trend is the OLS slope of complete annual/seasonal summaries against year. Stored `slope`, `ciLow`, `ciHigh` and `senSlope` are **per year**. Multiply slopes and limits by 10 for the interface’s rate. Frequency changes are **percentage points / 10 years**, not relative percent growth.

The classical two-sided 95% slope interval uses Student t with n−2 degrees of freedom. The fitted-mean interval is:

`fit(year) ± t(.975,n−2) × residual_sd × sqrt[1/n + (year − mean_year)² / Sxx]`

It is not a prediction interval and does not represent all upstream retrieval/model/input uncertainty. Sen’s median pairwise slope is retained as a second estimator.

Basic Mann–Kendall uses tie-corrected S variance and a continuity-corrected normal approximation. Benjamini–Hochberg adjustment applies to MK p-values. The support rule is:

**OLS p < 0.05 AND BH-adjusted MK q < 0.05**

A non-supported result is not proof of no change. A supported result is not causal attribution or independent scientific validation.

### Declared BH families

| Statistics source | Family |
|---|---|
| Supplied annual, 1984–2024 | 114 region × variable tests |
| Supplied annual, 2001–2024 | 120 region × variable tests |
| Supplied seasonal | All 480 supplied seasonal tests pooled across variables, regions and supplied coverage; not separate by season |
| Additional/recomputed view | Six regions for that metric, season and period |

The pipeline verifies the supplied BH values against those families. `source`, `qFamily` and `qFamilySize` accompany each prepared view/export. Newly computed views never silently reuse another family’s q value.

**Temporal dependence:** no autocorrelation correction is documented in the supplied tests or added to recomputed tests. Residual lag-1 correlation is a diagnostic, not an adjustment. OLS intervals and support labels are conditional on their classical assumptions. Defensible dependence-aware sensitivity analysis remains future work.

**Sparse and constant events:** binary monthly conditions produce discrete/sparse annual/seasonal percentages. OLS is an exploratory unbounded trend summary, not a bounded probability model or validated hazard forecast; its fit/band can lie outside 0–100. Constant series are flagged `constantSeries:true`, with slope=0, OLS/MK p=1, r²=0, finite fitted means and a degenerate [0,0] slope interval. This convention avoids undefined NaN intervals; it is **not** proof of zero event probability or certainty about future change. Percentile envelopes can also be zero-width when events are rare.

## 6. Physical definitions behind the primary clues

### VPD

For temperature T in °C:

`es(T) = 0.6108 × exp[17.27 × T / (237.3 + T)]` kPa

`VPD = max(es(T2M) − es(T2MDEW), 0)` kPa

The supplied monthly VPD reproduces this formula. It describes atmospheric saturation deficit, not root-zone moisture or an independent humidity measurement. VPD from monthly-mean inputs differs from averaging instantaneous VPD because the formula is nonlinear. Temperature is an input, so temperature/VPD agreement is not independent causal evidence.

### P−E

`P_minus_E = PRECTOTCORR_m2 − EVAP_m2` mm/day.

The supplied MERRA-2 flux difference reproduces this equation. It is not GWETROOT, a closed land-water budget, runoff, groundwater, irrigation demand, potential evapotranspiration or usable water. Low P−E need not have the same interpretation/trend as high VPD. The authorized substitution changes the question; it does not reconstruct missing soil wetness.

### Solar and aerosol extinction

SWGDN is the supplied downward shortwave energy at the surface, in kWh/m²/day, not electricity yield. AOD_total is a column aerosol optical quantity. Lower AOD means less aerosol extinction at the recorded quantity’s wavelength, not measured visibility, surface concentration, exposure, transmittance or a complete sky-clarity index. Clouds and other factors affect solar energy too.

## 7. The six current combinations

### Fixed monthly joint conditions

For each site and calendar month separately:

1. Take the **30 reference monthly observations in 1991–2020** for each input.
2. Calculate the required P90/P10 using linearly interpolated empirical quantiles.
3. Use strict `>`/`<` comparisons. Ties can mean a percentile does not select exactly 10% of months.
4. Code 100 only when **every** condition is true; otherwise code 0.
5. Average complete 12-month years or complete 3-month seasons to obtain **% of months**. Thresholds stay fixed when changing the analysis period.

| ID / name | Explicit monthly event |
|---|---|
| `HEAT_DRYING` — Heat + dry air | T2M > P90 AND VPD_kpa > P90 |
| `HEAT_RAIN` — Heat + rainfall shortfall | T2M > P90 AND PRECTOTCORR_m2 < P10 |
| `HEAT_DRY_RAIN` — Heat, dry air + low rain | T2M > P90 AND VPD_kpa > P90 AND PRECTOTCORR_m2 < P10 |
| `CLEAR_SOLAR` — Bright + low-aerosol months | SWGDN > P90 AND AOD_total < P10 |
| `HOT_WATER` — Heat + water-balance shortfall | T2M > P90 AND P_minus_E < P10 |

The thresholds, quantile/operator, input ID and reference n are stored under `compoundThresholds["region|diagnostic|month"]`, shown in analysis methods and retained in JSON. These are named co-occurrence diagnostics, **not arbitrary weighted scores**.

Limitations:

- Temperature and VPD are mathematically dependent.
- Relative rainfall shortfall in an already arid month does not establish absolute drought or water scarcity.
- MERRA-2 precipitation—not GPCP—is used in the current hot/low-rain combinations.
- P−E shortfall is not soil-moisture deficit.
- Low AOD/high solar co-occurrence is not aerosol causality, visibility or PV-yield validation.
- Binary sparse events, thresholds, shared models and temporal dependence limit inferential interpretation. No layer is validated as a drought, crop, fire, health or general stress index.

### `RAIN_GAP` — Two rainfall stories

`RAIN_GAP(month) = PRECIP_gpm(month) − PRECTOTCORR_m2(month)` mm/day.

Only actual paired months from **2001–2024** are used. Complete annual/seasonal summaries preserve this difference, and their trend remains mm/day per year (display ×10). Positive values mean IMERG estimates more rainfall; negative values mean less, relative to MERRA-2 in that time lens.

This is **cross-product disagreement**, not observational bias against ground truth. Retrievals, model structure, resolution, sampling and original extraction choices can differ. There is no validated “true rain” reference here and no threshold baseline for the difference itself.

## 8. Relationships are not driver attribution

The relationship window aligns only overlapping complete annual/seasonal values by year and calculates descriptive Pearson r and r². Detrending removes each input’s OLS trend **on that paired interval**. No correlation-significance test is asserted. A shorter input forces actual 2001–2024 coverage in that window.

Shared trends, omitted variables, shared model structure and mathematical dependence can drive association. Temperature enters VPD, and precipitation enters P−E. Selecting a quantity against itself yields self-correlation, not a second line of evidence. The uploaded file named `step4_driver_attribution.csv` contains pairwise associations; its filename is not causal proof.

## 9. Retained archival definitions and QA

The new UI does not expose an exhaustive archival picker. Internal preservation does not imply these are extra primary clues:

- `DUST_SHARE = 100 × AOD_dust / AOD_total`, computed monthly and then averaged. It is optical share, not aerosol mass/surface exposure.
- Legacy `HOT_DRY` uses T2M > local monthly P90 AND **GPCP** rain < P10 on fixed 1991–2020 thresholds in `hotDryThresholds`. It is not substituted for the new MERRA-2-based layers.
- `WS2M_vec = hypot(U2M,V2M)` is magnitude of monthly-mean 2 m components, not mean instantaneous speed or the flux-product scalar SPEED_sfc.
- `GPCP_gauge_wt` is labelled fraction in the source but ranges about 22–91. Values are unchanged, flagged and excluded from the curated suite/combinations; no silent division by 100 is made.

Before public scientific/operational release, archive exact product collection/version IDs, extraction dates/geometry, spatial aggregation/masking, original conversion/processing scripts and redistribution permissions. Independently validate upstream measurements when required; reproducing supplied CSV statistics is a consistency check, not that validation.

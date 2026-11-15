# Sources & provenance

## Supplied scientific archive

These files were supplied by the project owner as prepared Giovanni-derived data. They are not newly acquired by TRACE, and their family labels do not replace the missing original extraction metadata.

| File | Content | Rows |
|---|---|---:|
| `algeria_6regions_monthly_tidy.csv` | Region, variable, monthly date/value/unit/dataset fields | 57,816 |
| `algeria_6regions_annual_wide.csv` | Six regions × 41 years; 20 supplied variables | 246 |
| `step4_master_trends_6x20.csv` | Supplied annual trend records across available windows | 234 |
| `step4_seasonal_trends.csv` | Supplied seasonal trends | 480 |
| `step4_driver_attribution.csv` | Supplied pairwise associations, not causal attribution | 42 |

The five unchanged copies are in `public/data/raw/`. Their complete SHA-256 digests and byte counts are in `analysis/source-manifest.json` and in the prepared archive under `sources.inputFiles`. `npm run test:data` verifies those hashes.

The reference image `public/reference/spatial-atlas.png` is an unchanged copy of the supplied `algeria_41yr_spatial_atlas.png`. It is not a numerical or georeferenced raster layer and is not used to derive measurements.

The source license/redistribution permissions have **not** been inferred from the fact that the files were uploaded. Confirm them before making a public repository or deployment.

## Preparation and validation

`scripts/prepare_data.py` runs offline from the distributed raw CSVs. The script:

1. Checks unique monthly keys and native coverage.
2. Reproduces annual arithmetic means and complete seasonal groups.
3. Reproduces OLS slopes and basic Mann–Kendall p-values.
4. Checks the supplied annual/seasonal Benjamini–Hochberg families.
5. Retains matching supplied statistical rows; labels other views as recomputed with their own six-region BH family.
6. Retains the legacy dust-share and GPCP hot–dry diagnostics for provenance, not as selectable new-interface clues.
7. Uses `scripts/compound_lenses.py` to define the seven agreed primary concepts and six two/three-input combinations. Five count explicit joint calendar-month conditions using fixed 1991–2020 thresholds; one computes paired IMERG-minus-MERRA-2 rainfall differences in 2001–2024.
8. Handles constant responses explicitly, with finite degenerate OLS intervals and a `constantSeries` flag rather than undefined JSON fields.
9. Writes 28 archival metrics / 1,620 views, the restricted `interface`, actual `compoundThresholds`, SHA-256 source manifest and audit. Algorithm version: **trace-prep-2**.
10. Embeds the separately prepared `sources.regionalDisplay` provenance and an explicit display-only footprint caveat. The v2.1 map update leaves all numerical observations/views, recipes and threshold tables unchanged (`analysis/geography-data-regression.json`).

Current maximum absolute reproduction errors, before JSON serialization:

| Check | Maximum error |
|---|---:|
| Annual means | 1.4211 × 10⁻¹⁴ |
| OLS slope per year | 3.0531 × 10⁻¹⁶ |
| Basic MK p-value | 2.2204 × 10⁻¹⁶ |

This is a check of consistency with the supplied tables, **not** independent validation of satellite observations, model reanalysis, unit-conversion lineage or extraction geography. No live NASA data ingestion is implemented.

## Geographic and rendering sources

### Algeria country boundary

- Natural Earth 1:10m admin-0 countries, Algeria feature (`ADM0_A3=DZA`).
- Distributed as `public/data/algeria.geojson`, retaining original feature properties and source metadata.
- Source vector: <https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson>
- Project: <https://www.naturalearthdata.com/>
- Natural Earth data are public domain. This display boundary is not a verified regional extraction footprint or cadastral boundary.
- The raised country-outline polyline is a visual-performance choice documented in `SCIENCE.md`; original longitude/latitude vertices are retained.

### Six wilaya administrative display areas

The user explicitly approved **real wilaya shapes as display proxies**, not original extraction geography.

- Source: **geoBoundaries gbOpen, DZA ADM1**, boundary ID `DZA-ADM1-43142294`, based on **OpenStreetMap contributors / Wambacher**. Attribution: © OpenStreetMap contributors; geoBoundaries / William & Mary geoLab; Wambacher.
- Vintage: **2017, historical 48-unit source snapshot**. The word `current` in the upstream API URL means its release listing, not certification of current Algerian legal divisions. TRACE does not model boundary changes over the climate record.
- Metadata discovery: <https://www.geoboundaries.org/api/current/gbOpen/DZA/ADM1/>
- Pinned upstream simplified geometry: <https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/DZA/ADM1/geoBoundaries-DZA-ADM1_simplified.geojson>
- Unchanged bundled upstream copy: `public/data/geography/geoBoundaries-DZA-ADM1-2017.geojson`, **682,435 bytes / 48 features**. SHA-256: `99c13937ec0ce1d937815999b6b546c5ab1912dc5924c6c798c5e11b617feac8`.
- Display subset: `public/data/study-wilayas.geojson`, **72,459 bytes / six features / 3,205 vertices**. SHA-256: `d0ee10afa3b4c36b567a4aeeb3c960aab9873e3f07d58923ede0bbc8e03ec2e0`.
- Selection: Oran, Annaba, Sétif, Djelfa, Ouargla and Tamanrasset. `scripts/prepare_boundaries.py` selects those source features unchanged and adds TRACE record IDs, bounds and interior display-label points; it does not simplify further or change coordinates/holes. All six selected features in this source happen to be single-ring Polygons; containment helpers also test holes and multipart geometry.
- Metadata/mapping/hashes/limitations: `public/data/wilaya-display-metadata.json`, embedded in the archive under `sources.regionalDisplay`. The original upstream API JSON is retained beside the bundled source.
- License: **Open Data Commons Open Database License 1.0 (ODbL-1.0)**, <https://opendatacommons.org/licenses/odbl/1-0/>. The full text is included at `public/licenses/geoBoundaries-ODbL-1.0.txt`; the geometry/subset remain under that license, with changes and attribution disclosed. This does not relicense the owner-supplied climate archive or the application code.
- Reproduce offline: `npm run geometry:prepare`; optional `python scripts/prepare_boundaries.py --download` restores only the pinned SHA-verified source. Run this before archive preparation if regenerating provenance.

These shapes are **not verified original Giovanni footprints, point samples or evidence of whole-wilaya data coverage**. A uniform area color repeats one regional summary. Texture identifies a named lens, not within-area climate detail, event locations or uncertainty. Geometry, provenance and license are downloadable from the map’s geographic-limit dialog. Original extraction metadata are still required for coverage claims.

### Contextual imagery

- NASA GIBS Blue Marble Shaded Relief / Bathymetry, Web Mercator WMTS.
- <https://gibs.earthdata.nasa.gov/>
- Used only as geographic context, never as a time-varying climate measurement layer.
- Local fallback: Natural Earth II texture distributed with the official Cesium SDK.
- Credits remain in the map. Check provider usage guidance for production deployment.

### Real elevation

- Public Esri World Elevation Terrain3D service, when available:
  <https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer>
- Returned metadata/attribution are recorded in `analysis/terrain-source.json`.
- Reported contributors include Vantor, Airbus DS, USGS, NGA, NASA, CGIAR, GEBCO, N Robinson, NCEAS, NLS, OS, NMA, Geodatastyrelsen and the GIS User Community.
- The provider initialized without a key in browser testing. This is not a guarantee of free unlimited use, permission for every deployment, coverage quality or future availability.
- Optional replacement: Cesium ion World Terrain with an appropriately restricted public browser token.
- On failure, the app labels the ellipsoid fallback. If WebGL/the SDK fails, it labels a geographic 2D fallback. Neither fallback invents relief.

### Interface and software

The supplied Copernicus Interactive Climate Atlas screenshot informed the earlier prototype, but the current release is an independent **map-first redesign**: an almost full-viewport Cesium canvas, on-demand tool panels, five separate analysis windows and an evidence board. TRACE has its own identity/implementation and is not affiliated with that service. No unsupported climate scenario, future projection or global-warming-level controls are offered for these historical records. Cesium’s 2D/3D camera mode is a map-display choice, not a climate projection.

See `THIRD_PARTY_NOTICES.md` for the renderer, charts, fonts, icons and animation dependencies.

## Metadata still required for a scientific release

- Exact original product collection/version IDs, not just the displayed family names.
- Extraction timestamps, region polygons/bounds, spatial aggregation and coverage/masking rules.
- Original unit-conversion and processing scripts.
- Resolution of the gauge-weight unit conflict.
- Source licensing/redistribution confirmation and provider terms review.
- Independent review of significance assumptions and exploratory combined diagnostics.

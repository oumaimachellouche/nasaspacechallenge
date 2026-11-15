# Third-party notices

TRACE’s generated source and the owner-supplied scientific files do not receive a blanket open-source/data license through this notice. Choose the project’s source-code license and confirm data-sharing permissions before public publication.

Direct dependencies are installed with `npm ci`; exact versions and transitive dependencies are recorded in `package-lock.json`.

| Component | Installed version at handoff | License / source |
|---|---|---|
| CesiumJS | 1.133.0 | Apache-2.0; <https://github.com/CesiumGS/cesium> |
| Apache ECharts | 6.1.0 | Apache-2.0; <https://echarts.apache.org/> |
| GSAP | 3.15.1 | GSAP standard “no charge” license; <https://gsap.com/standard-license/> |
| Lucide icons | 0.468.0 | ISC; <https://lucide.dev/license> |
| Tailwind CSS | 3.4.19 | MIT; <https://github.com/tailwindlabs/tailwindcss> |
| Vite | 6.4.6 | MIT; <https://github.com/vitejs/vite> |
| Lato via Fontsource | 5.3.0 package | SIL Open Font License 1.1; <https://fontsource.org/fonts/lato> |
| IBM Plex Mono via Fontsource | 5.3.0 package | SIL Open Font License 1.1; <https://fontsource.org/fonts/ibm-plex-mono> |

License text copies for shipped runtime components/fonts are retained in `public/licenses/`. Cesium’s third-party notices are also copied there. Consult those texts and installed package notices for full conditions; this table is a navigation aid, not legal advice. GSAP license information is linked above and also appears in its distributed source headers.

The official Cesium prebuilt SDK, workers, assets, widgets and third-party runtime assets are hosted locally. Cesium/provider credit display is retained. Fonts are hosted locally; no font CDN is required.

Natural Earth country geometry and local Natural Earth context are public-domain map data. NASA GIBS and Esri/Cesium terrain are separate external contextual services with their own attribution, usage terms and availability. Their credits are not replaced by this notice. See `docs/SOURCES.md`.

The six wilaya display shapes and the unchanged upstream 48-feature source are **geoBoundaries / © OpenStreetMap contributors / Wambacher, fixed 2017 DZA ADM1 snapshot**, licensed under **Open Database License 1.0 (ODbL-1.0)**. Full text: `public/licenses/geoBoundaries-ODbL-1.0.txt`; license URL: <https://opendatacommons.org/licenses/odbl/1-0/>. The derived display subset selects six features and adds record IDs/bounds/display-label points; source coordinates and holes remain unchanged. Attribution, vintage, source/derivative hashes and changes are retained in `public/data/wilaya-display-metadata.json` and [Sources](docs/SOURCES.md), with visible map credits. Geometry remains under ODbL; this notice does not apply that license to the separate climate CSVs, measurements or application code. The geometry is a display proxy, not current legal certification or verified extraction geography.

Scientific source CSVs and the reference PNG are user-supplied; no upstream extraction license or redistribution permission is assumed. TRACE’s statistical consistency checks do not establish those rights or upstream scientific validity.

# Deployment, keys and repository handoff

## Runtime

- A current Node LTS release (22+ recommended). Package minimum is Node 20.19; the supplied sandbox used Node 20.20.2. That tested minimum is not a recommendation to deploy an unsupported Node release.
- Python only for archive regeneration; the current scientific environment is captured in `requirements.txt` (tested on Python 3.13.18).
- Modern browser with WebGL2 for the full Cesium scene. Without it, the app clearly labels a geographic SVG fallback and retains the data/charts.
- External network access for NASA GIBS and real elevation. The locally hosted Natural Earth context is the imagery fallback.

Cesium is pinned to **1.133.0**, which supports the tested Node runtime. Newer Cesium versions can require a newer Node version. Do not upgrade without checking engines and rerunning build/map tests.

## Production

The ZIP includes `dist/`. After extracting the complete folder, `npm start` (or `npm.cmd start` on Windows) runs that build directly with Node, without dependency installation. Open http://localhost:5173 and do not double-click `index.html`.

For a source checkout or rebuild:

```sh
npm ci
npm run build
npm start
# Optional POSIX override: PORT=8080 npm start
```

The production server binds `0.0.0.0`, serves the built app from `dist/`, and handles `/api/*` from the same origin. It reads `public/data/atlas.json`; include that file along with `dist/`, `server/`, `package.json` and the lockfile in a Node deployment. A full source checkout is the simplest handoff.

Use HTTPS, an appropriate reverse proxy, request limits, access logging and deployment monitoring for a public service. The included server is a small read-only application service, not an audited enterprise platform. It neither accepts credentials nor stores user notes centrally.

Do not add `X-Frame-Options: DENY` or an incompatible embedding policy to the hosted interactive-preview environment. The app uses relative browser URLs and supports the preview host. A production origin should apply its own considered host/origin policy at the reverse proxy.

The current paths assume a root deployment. A project-subdirectory host requires coordinated changes to Vite base, Cesium base/asset URLs, data URLs and server routing; a custom-domain root is easier.

### Static-only hosting

Upload the complete `dist/` output, including `cesium/`, `data/`, `reference/`, `licenses/` and `assets/`. Do not copy just `index.html`. Opening it as `file://` is not supported because the SDK and JSON use HTTP paths.

The frontend falls back to the prepared JSON when `/api/atlas` is unavailable. This preserves exploration but is not a backend deployment. It displays LOCAL ARCHIVE in that mode. Avoid an SPA rewrite that returns HTML for every missing binary/data asset; genuine 404s are easier to diagnose.

## Which keys are actually required?

| Feature | Current setup | Secret needed? |
|---|---|---|
| Uploaded scientific records | Local CSV → prepared JSON → Node API | No |
| CesiumJS renderer and local workers | Bundled official SDK | No |
| Country outline / local imagery | Locally hosted Natural Earth assets | No |
| Six dated wilaya display shapes | Bundled geoBoundaries / OpenStreetMap, 2017 / ODbL | No; keep attribution, license and provenance |
| NASA GIBS Blue Marble | Public contextual imagery | No current key; subject to service terms/availability |
| Esri public World Elevation endpoint | Attempted real elevation provider | Initialized without a key in testing; terms/availability must be checked for deployment |
| Cesium ion World Terrain | Optional replacement terrain | Restricted **public browser token** |
| Future fresh NASA acquisition | Not implemented | Earthdata authentication may be required server-side |
| GitHub publishing | Not performed | Owner’s authenticated session, never a secret in chat |

A working token-free fallback is not a promise of unlimited third-party service usage or an SLA. Keep provider credits and respect their terms.

## Optional Cesium ion terrain

1. Create a dedicated token in your own Cesium ion account.
2. Give it only the public read scope needed for the selected terrain asset, with asset and URL/referrer restrictions. Do not use an account-management or write token.
3. Copy `.env.example` to `.env.local` and set:

   ```dotenv
   VITE_CESIUM_ION_TOKEN=your_restricted_public_browser_token
   ```

4. Allow the exact preview/deployment host in token restrictions. Rebuild/restart Vite. Build-time `VITE_*` values are included in public JavaScript.
5. Verify terrain status and attribution. If unavailable, the atlas reports the ellipsoid fallback rather than inventing relief.

A browser token is visible to visitors by design. **Never put an Earthdata password, GitHub PAT, private API key, `.netrc` content or any other secret in a `VITE_*` variable.** Changing a build-time token requires rebuilding the frontend.

## GitHub handoff — status and safe next step

The source package is ready for a repository, but **no remote GitHub repository has been created or pushed**. The in-session connector did not support GitHub, and no user credentials have been supplied. A local repository can exist independently of a remote.

Use the repository owner’s own terminal or another supported authenticated environment. Prefer a browser/device authentication flow or credential manager; do not paste a token into the chat or embed it in a remote URL.

Example using GitHub CLI after installing it on the owner’s machine:

```sh
gh auth login --web --git-protocol https
git status
# Review included CSVs and their sharing permissions before publishing.
git add .
git commit -m "Build TRACE Algeria Earth System Atlas"
# Choose visibility intentionally. Private is a safer starting point for unreviewed data.
gh repo create trace-algeria-atlas --private --source=. --remote=origin --push
```

If the supplied source package is not yet initialized, run `git init -b main` first. Use your own Git author configuration. The repository name above is a suggestion, not an existing repository URL.

`.gitignore` excludes dependency/build folders, local environment files and credential paths. Still review `git diff --cached` before any push. Data are intentionally included in `public/data/raw/`; their redistribution/license status must be confirmed rather than assumed to be open.

The included CI workflow reproduces the SHA-pinned boundary subset offline, checks its unchanged output, and runs archive/geometry/API tests plus a production build without credentials. It does not claim to validate upstream NASA extraction, all browsers, accessibility conformance or external-provider uptime.

## Remaining scientific/infrastructure work

- Obtain and archive original extraction polygons or bounding boxes and product collection/version IDs.
- Confirm unit conversions and resolve the gauge-weight metadata conflict.
- If numerical climate rasters are desired, ingest properly georeferenced grid files; do not digitize the supplied PNG or interpolate six regional values into false detail.
- Plan dependence-aware uncertainty sensitivity tests and review all five exploratory joint-condition layers, sparse-event assumptions and threshold sensitivity.
- Add authenticated, provenance-preserving live ingestion only if it is actually needed.
- Add a database/account service only if cross-device/shared evidence boards are needed. The current board deliberately sends no notes to the API. It uses `trace-board-v2` / `trace-board-sort-v2`, warns on quota/storage failure, and has JSON export but no import/sync service. Old v1 notebook keys are left intact and are not automatically migrated.
- Complete a full accessibility and real-device performance review before a public scientific release.

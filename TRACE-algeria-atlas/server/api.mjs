import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const defaultDataFile = fileURLToPath(
  new URL("../public/data/atlas.json", import.meta.url),
);
const seasons = new Set(["annual", "DJF", "MAM", "JJA", "SON"]);
const periods = new Set(["1984-2024", "2001-2024"]);
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const toCSV = (rows) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

/** Same-origin, read-only API. No account, token, database, or remote ingestion. */
export function createDataAPI({ dataFile = defaultDataFile } = {}) {
  let cache;
  function archive() {
    const { mtimeMs, size } = statSync(dataFile);
    if (!cache || cache.mtimeMs !== mtimeMs || cache.size !== size) {
      const bytes = readFileSync(dataFile);
      const data = JSON.parse(bytes);
      cache = {
        data,
        bytes,
        zipped: gzipSync(bytes),
        mtimeMs,
        size,
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
    }
    return cache;
  }
  function send(
    req,
    res,
    status,
    content,
    type = "application/json; charset=utf-8",
    extra = {},
  ) {
    let bytes = Buffer.isBuffer(content)
      ? content
      : Buffer.from(
          typeof content === "string" ? content : JSON.stringify(content),
        );
    const headers = {
      "Content-Type": type,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    };
    if (
      status === 200 &&
      /\bgzip\b/.test(req.headers["accept-encoding"] || "") &&
      bytes.length > 1024
    ) {
      bytes = extra["X-Trace-Bundle"] ? archive().zipped : gzipSync(bytes);
      headers["Content-Encoding"] = "gzip";
    }
    delete headers["X-Trace-Bundle"];
    headers.Vary = "Accept-Encoding";
    headers["Content-Length"] = bytes.length;
    res.writeHead(status, headers);
    res.end(req.method === "HEAD" ? undefined : bytes);
  }
  function error(req, res, status, code, message) {
    send(req, res, status, { error: code, message });
  }
  return function dataAPI(req, res, next) {
    let url;
    try {
      url = new URL(req.url, "http://trace.local");
    } catch {
      return error(req, res, 400, "invalid_url", "Invalid request URL.");
    }
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
      next?.();
      return false;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.setHeader("Allow", "GET, HEAD");
      error(
        req,
        res,
        405,
        "read_only",
        "This scientific archive API is read-only.",
      );
      return true;
    }
    if (req.url.length > 4096) {
      error(
        req,
        res,
        414,
        "url_too_long",
        "Request URL exceeds the supported length.",
      );
      return true;
    }
    try {
      const { data, bytes, hash } = archive();
      const representation = createHash("sha256")
        .update(hash + url.pathname + url.search)
        .digest("hex");
      const common = {
        ETag: `W/"${representation}"`,
        "X-Trace-Data-SHA256": hash,
      };
      if (req.headers["if-none-match"] === common.ETag) {
        res.writeHead(304, common);
        res.end();
        return true;
      }
      if (url.pathname === "/api/health") {
        send(
          req,
          res,
          200,
          {
            status: "ok",
            mode: "read-only-prepared-archive",
            schemaVersion: data.schemaVersion,
            regions: data.regions.length,
            variables: data.variables.length,
            views: Object.keys(data.views).length,
            dataSHA256: hash,
            preparationVersion: data.sources.preparation.algorithmVersion,
            curatedClues: data.interface?.primaryVariables.length,
            combinations: data.interface?.caseIds.length,
            liveNASAIngestion: false,
            notebookStorage: "browser-local",
            boardSchemaVersion: 2,
          },
          undefined,
          common,
        );
      } else if (url.pathname === "/api/atlas") {
        send(req, res, 200, bytes, undefined, {
          ...common,
          "X-Trace-Bundle": "1",
        });
      } else if (url.pathname === "/api/catalog") {
        send(
          req,
          res,
          200,
          {
            schemaVersion: data.schemaVersion,
            title: data.title,
            period: data.period,
            baseline: data.baseline,
            regions: data.regions,
            variables: data.variables,
            recipes: data.recipes,
            interface: data.interface,
            seasons: [...seasons],
            windows: [...periods],
            audit: data.audit,
            sources: data.sources,
          },
          undefined,
          common,
        );
      } else if (["/api/view", "/api/monthly"].includes(url.pathname)) {
        const region = url.searchParams.get("region"),
          variable = url.searchParams.get("variable");
        const r = data.regions.find((item) => item.id === region),
          v = data.variables.find((item) => item.id === variable);
        if (!r || !v) {
          error(
            req,
            res,
            400,
            "invalid_selection",
            "Supply valid region and variable IDs from /api/catalog.",
          );
          return true;
        }
        if (url.pathname === "/api/monthly") {
          const start = url.searchParams.has("start")
            ? Number(url.searchParams.get("start"))
            : v.start;
          const end = url.searchParams.has("end")
            ? Number(url.searchParams.get("end"))
            : v.end;
          if (
            ![start, end].every(Number.isInteger) ||
            start < 1984 ||
            end > 2024 ||
            start > end
          ) {
            error(
              req,
              res,
              400,
              "invalid_years",
              "Use integer years within 1984–2024, with start no later than end.",
            );
            return true;
          }
          const series = data.monthly[region][variable].filter(
            ([date]) => +date.slice(0, 4) >= start && +date.slice(0, 4) <= end,
          );
          send(
            req,
            res,
            200,
            {
              region: r,
              variable: v,
              requestedYears: [start, end],
              series,
              n: series.length,
              note: "Native monthly values. No data are extrapolated beyond the supplied coverage.",
            },
            undefined,
            common,
          );
        } else {
          const period = url.searchParams.get("period") || "1984-2024",
            season = url.searchParams.get("season") || "annual";
          if (!periods.has(period) || !seasons.has(season)) {
            error(
              req,
              res,
              400,
              "invalid_window",
              "Unsupported analysis period or season.",
            );
            return true;
          }
          const view = data.views[[region, variable, period, season].join("|")];
          if (!view) {
            error(
              req,
              res,
              404,
              "coverage_unavailable",
              "No complete view exists for this coverage. IMERG and its paired rainfall difference start in 2001.",
            );
            return true;
          }
          const format = url.searchParams.get("format") || "json";
          if (!["json", "csv"].includes(format)) {
            error(req, res, 400, "invalid_format", "Use json or csv format.");
            return true;
          }
          if (format === "csv") {
            const rows = [
              [
                "region",
                "variable",
                "unit",
                "aggregation",
                "window",
                "year",
                "value",
                "slope_per_year",
                "slope_ci_low",
                "slope_ci_high",
                "p_ols",
                "p_mk",
                "q_mk",
                "supported",
                "statistics_source",
                "fdr_family",
              ],
              ...view.series.map(([year, value]) => [
                region,
                variable,
                v.unit,
                season,
                period,
                year,
                value,
                view.slope,
                view.ciLow,
                view.ciHigh,
                view.pOLS,
                view.pMK,
                view.qMK,
                view.supported,
                view.source,
                view.qFamily,
              ]),
            ];
            send(req, res, 200, toCSV(rows), "text/csv; charset=utf-8", {
              ...common,
              "Content-Disposition": `attachment; filename="TRACE-${region}-${variable}-${season}-${period}.csv"`,
            });
          } else {
            send(
              req,
              res,
              200,
              {
                selection: { region, variable, period, season },
                region: r,
                variable: v,
                view,
                recipe: data.recipes.find((item) => item.id === variable),
                thresholds: Object.fromEntries(
                  Object.entries(data.compoundThresholds || {}).filter(
                    ([key]) => key.startsWith(region + "|" + variable + "|"),
                  ),
                ),
                slopeUnits:
                  "per year; multiply slope and confidence limits by 10 for change per 10 years",
                supportRule: data.audit.supportRule,
                caveats: data.audit.warnings,
              },
              undefined,
              common,
            );
          }
        }
      } else {
        error(
          req,
          res,
          404,
          "not_found",
          "Unknown API endpoint. See docs/API.md.",
        );
      }
    } catch (err) {
      console.error("TRACE data API:", err.message);
      error(
        req,
        res,
        503,
        "archive_unavailable",
        "The prepared archive is unavailable. Run npm run data:prepare and check the server logs.",
      );
    }
    return true;
  };
}

export function traceAPIPlugin() {
  return {
    name: "trace-read-only-data-api",
    configureServer(server) {
      server.middlewares.use(createDataAPI());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDataAPI());
    },
  };
}

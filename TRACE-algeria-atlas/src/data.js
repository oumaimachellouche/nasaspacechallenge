export const SEASON_NAMES = {
  annual: "Annual",
  DJF: "Winter · DJF",
  MAM: "Spring · MAM",
  JJA: "Summer · JJA",
  SON: "Autumn · SON",
};
export const SEASON_SHORT = {
  annual: "annual",
  DJF: "winter",
  MAM: "spring",
  JJA: "summer",
  SON: "autumn",
};
export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
export const PALETTES = [
  {
    name: "Earth · warm",
    colors: ["#e9c7a0", "#ce8c5e", "#a34d48"],
    diverging: ["#3b7286", "#e2e8e7", "#b96b45"],
  },
  {
    name: "Ocean · sequential",
    colors: ["#c1d9d9", "#6b9a9d", "#315e73"],
    diverging: ["#326a8e", "#e7ebe8", "#a47b32"],
  },
  {
    name: "Plum · sequential",
    colors: ["#dbcede", "#a38baa", "#655675"],
    diverging: ["#397975", "#e6e9e6", "#92567f"],
  },
  {
    name: "Solar · gold",
    colors: ["#f2e4a5", "#c2a647", "#7b722c"],
    diverging: ["#537f9a", "#efebda", "#a18229"],
  },
  {
    name: "Rainfall shortfall · amber",
    colors: ["#f4d7aa", "#d59450", "#9d512d"],
    diverging: ["#488493", "#ede9dc", "#af5938"],
  },
  {
    name: "Water balance · teal",
    colors: ["#cce5dc", "#76aaa3", "#266e73"],
    diverging: ["#b28b45", "#e9ece4", "#2a797d"],
  },
];
export function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function fmt(v, dp = 2, signed = false) {
  if (v === null || v === undefined || !Number.isFinite(+v)) return "—";
  const n = Math.abs(v) < Math.pow(10, -dp) / 2 ? 0 : +v;
  return (
    (signed && n > 0 ? "+" : "") +
    n.toLocaleString("en-US", {
      minimumFractionDigits: dp,
      maximumFractionDigits: dp,
    })
  );
}
export function fmtP(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (v < 0.0001) return v.toExponential(1);
  return v.toFixed(v < 0.01 ? 4 : 3);
}
export function decimals(variable, trend = false) {
  return trend
    ? variable.id.startsWith("AOD")
      ? 4
      : variable.decimals === 2
        ? 3
        : variable.decimals
    : variable.decimals;
}
export function getView(
  data,
  state,
  region = state.region,
  variable = state.variable,
) {
  return data.views[[region, variable, state.period, state.season].join("|")];
}
export function getVariable(data, id) {
  return data.variables.find((v) => v.id === id);
}
export function getRegion(data, id) {
  return data.regions.find((r) => r.id === id);
}
export function getBaseline(
  data,
  state,
  rid = state.region,
  vid = state.variable,
) {
  const variable = getVariable(data, vid),
    window = variable.start === 2001 ? "2001-2024" : "1984-2024";
  const v = data.views[[rid, vid, window, state.season].join("|")];
  const first = variable.start === 2001 ? 2001 : 1991,
    last = 2020;
  const vals = (v?.series || [])
    .filter((p) => p[0] >= first && p[0] <= last)
    .map((p) => p[1]);
  return {
    mean: mean(vals),
    first,
    last,
    n: vals.length,
    label: `${first}–${last}`,
  };
}
export function mean(a) {
  return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
}
export function quantile(values, q) {
  const a = [...values].sort((a, b) => a - b),
    pos = (a.length - 1) * q,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return a.length ? a[lo] + (a[hi] - a[lo]) * (pos - lo) : NaN;
}
export function mapValue(data, state, rid) {
  const v = getView(data, state, rid);
  if (!v) return null;
  if (state.quantity === "trend") return v.slope * 10;
  if (state.quantity === "mean") return v.mean;
  return v.series.find((p) => p[0] === state.year)?.[1] ?? null;
}
export function scaleDomain(data, state) {
  const vals = data.regions
    .map((r) => mapValue(data, state, r.id))
    .filter((v) => v !== null && Number.isFinite(v));
  let lo = Math.min(...vals),
    hi = Math.max(...vals);
  if (!vals.length) return [0, 1];
  if (lo === hi) {
    if (
      getVariable(data, state.variable).unit === "% of months" &&
      state.quantity !== "trend"
    ) {
      lo = 0;
      hi = Math.max(hi, 1);
    } else {
      lo -= 0.5;
      hi += 0.5;
    }
  }
  if ((lo < 0 && hi > 0) || state.variable === "RAIN_GAP") {
    const m = Math.max(Math.abs(lo), Math.abs(hi));
    return [-m, m];
  }
  return [lo, hi];
}
function mix(a, b, t) {
  const aa = a.replace("#", ""),
    bb = b.replace("#", "");
  const rgb = [0, 2, 4].map((i) =>
    Math.round(
      parseInt(aa.slice(i, i + 2), 16) * (1 - t) +
        parseInt(bb.slice(i, i + 2), 16) * t,
    ),
  );
  return "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
}
export function colorFor(value, domain, palette = 0) {
  if (value === null || !Number.isFinite(value)) return "#a5acac";
  const [lo, hi] = domain;
  if (lo < 0 && hi > 0) {
    const max = Math.max(Math.abs(lo), Math.abs(hi)),
      colors = PALETTES[palette].diverging;
    return value < 0
      ? mix(colors[1], colors[0], Math.min(1, Math.abs(value) / max))
      : mix(colors[1], colors[2], Math.min(1, value / max));
  }
  const colors = PALETTES[palette].colors;
  const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
  return t < 0.5
    ? mix(colors[0], colors[1], t * 2)
    : mix(colors[1], colors[2], (t - 0.5) * 2);
}
export function rampCSS(domain, palette = 0) {
  return domain[0] < 0 && domain[1] > 0
    ? `linear-gradient(90deg,${PALETTES[palette].diverging.join(",")})`
    : `linear-gradient(90deg,${PALETTES[palette].colors.join(",")})`;
}
export function linearFit(points) {
  const x = points.map((p) => p[0]),
    y = points.map((p) => p[1]),
    xm = mean(x),
    ym = mean(y);
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - xm) ** 2;
    sxy += (x[i] - xm) * (y[i] - ym);
  }
  const slope = sxx ? sxy / sxx : 0;
  return {
    slope,
    intercept: ym - slope * xm,
    predict: (v) => ym + slope * (v - xm),
  };
}
export function relationship(data, state, xId, yId, detrend = false) {
  const xs = getView(data, state, state.region, xId)?.series || [],
    ys = getView(data, state, state.region, yId)?.series || [],
    ymap = new Map(ys),
    pts = xs
      .filter((p) => ymap.has(p[0]))
      .map((p) => [p[0], p[1], ymap.get(p[0])]);
  let values = pts.map((p) => [p[0], p[1], p[2]]);
  if (detrend && pts.length > 2) {
    const fx = linearFit(pts.map((p) => [p[0], p[1]])),
      fy = linearFit(pts.map((p) => [p[0], p[2]]));
    values = pts.map((p) => [
      p[0],
      p[1] - fx.predict(p[0]),
      p[2] - fy.predict(p[0]),
    ]);
  }
  const xx = values.map((p) => p[1]),
    yy = values.map((p) => p[2]),
    xm = mean(xx),
    ym = mean(yy);
  let cross = 0,
    vx = 0,
    vy = 0;
  for (let i = 0; i < xx.length; i++) {
    cross += (xx[i] - xm) * (yy[i] - ym);
    vx += (xx[i] - xm) ** 2;
    vy += (yy[i] - ym) ** 2;
  }
  const r = vx > 0 && vy > 0 ? cross / Math.sqrt(vx * vy) : null;
  return {
    points: values,
    n: values.length,
    r,
    r2: r === null ? null : r * r,
    detrended: detrend,
    xId,
    yId,
  };
}
export function download(name, contents, type = "text/plain") {
  const blob =
    contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  (document.querySelector("dialog[open]") || document.body).appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"')
        .join(","),
    )
    .join("\r\n");
}
export function viewCSV(data, state) {
  const variable = getVariable(data, state.variable),
    region = getRegion(data, state.region),
    view = getView(data, state);
  return csv([
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
    ...(view?.series || []).map(([year, value]) => [
      region.id,
      variable.id,
      variable.unit,
      state.season,
      state.period,
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
  ]);
}

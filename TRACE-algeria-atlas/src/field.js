import {
  getVariable,
  getView,
  getRegion,
  getBaseline,
  fmt,
  fmtP,
  decimals,
  relationship,
  mean,
  quantile,
  MONTHS,
  csv,
} from "./data.js";

export const TYPES = {
  series: {
    name: "Time series",
    kicker: "FOLLOW THE LONG RECORD",
    icon: "chart-no-axes-combined",
    color: "#9b4650",
  },
  cycle: {
    name: "Annual cycle",
    kicker: "FIND THE SEASONAL RHYTHM",
    icon: "circle-gauge",
    color: "#287e7c",
  },
  stripes: {
    name: "Climate stripes",
    kicker: "SPOT DEPARTURES FROM THE REFERENCE",
    icon: "chart-no-axes-column",
    color: "#3f7389",
  },
  compare: {
    name: "Compare regions",
    kicker: "PUT SIX RECORDS SIDE BY SIDE",
    icon: "git-compare-arrows",
    color: "#5475a3",
  },
  relationships: {
    name: "Relationships",
    kicker: "TEST A CONNECTION, NOT A CAUSE",
    icon: "scatter-chart",
    color: "#785c97",
  },
};
export const SEASONS = {
  annual: "Whole year",
  DJF: "Winter · DJF",
  MAM: "Spring · MAM",
  JJA: "Summer · JJA",
  SON: "Autumn · SON",
};
export const unit = (v, trend = false) =>
  (trend ? v.trendUnit : v.unit).replace("decade", "10 yr");
export const primary = (data, id) =>
  data.interface.primaryVariables.find((v) => v.id === id);
export const recipe = (data, id) => data.recipes.find((r) => r.id === id);
export const label = (data, id) =>
  primary(data, id)?.label ||
  recipe(data, id)?.title ||
  getVariable(data, id)?.short ||
  id;
export const shortCode = (data, id) =>
  primary(data, id)?.code || getVariable(data, id)?.short || id;
export const timeText = (s) =>
  `${s.period.replace("-", "–")} · ${SEASONS[s.season]}`;
export const analysisContext = (s) =>
  s.tab === "cycle"
    ? `${s.period.replace("-", "–")} · All calendar months`
    : timeText(s);
export const quantityText = (s) =>
  s.quantity === "trend"
    ? "Change over 10 years"
    : s.quantity === "mean"
      ? "Average conditions"
      : `${s.year} · one year`;

export function selectionValue(data, s) {
  const v = getView(data, s);
  return !v
    ? null
    : s.quantity === "trend"
      ? v.slope * 10
      : s.quantity === "mean"
        ? v.mean
        : v.series.find((p) => p[0] === s.year)?.[1];
}
export function signal(data, s) {
  const v = getView(data, s),
    m = getVariable(data, s.variable);
  if (m.exploratory) return "Exploratory frequency · not a validated hazard index";
  if (!v) return "No data for this selection";
  const slopeVal = fmt(v.slope * 10, decimals(m, true), true);
  const dir = v.slope > 0
    ? "positive — the variable tends to increase over time"
    : v.slope < 0
      ? "negative — the variable tends to decrease over time"
      : "zero — no change detected";
  const rule = v.supported
    ? "Trend passes the stated test rule (statistically significant)"
    : "Trend does not pass the stated test rule (not statistically significant)";
  return `${rule}. Slope = ${slopeVal} ${unit(m, true)} · average change per decade · ${dir}. The 95% CI gives the plausible range for the true slope.`;
}
export function describe(data, s) {
  const m = getVariable(data, s.variable);
  return `${fmt(selectionValue(data, s), decimals(m, s.quantity === "trend"), s.quantity === "trend")} ${unit(m, s.quantity === "trend")}`;
}

// These helpers are shared by the chart, card, JSON and CSV: exports describe
// what is actually plotted, not an unrelated annual view behind the window.
export function cycleData(data, s) {
  const [start, end] = s.period.split("-").map(Number),
    months = Array.from({ length: 12 }, () => []);
  for (const [date, value] of data.monthly[s.region][s.variable] || []) {
    const y = +date.slice(0, 4);
    if (y >= start && y <= end && Number.isFinite(value))
      months[+date.slice(5, 7) - 1].push(value);
  }
  return months.map((a, i) => ({
    month: i + 1,
    name: MONTHS[i],
    n: a.length,
    mean: mean(a),
    p10: quantile(a, 0.1),
    p90: quantile(a, 0.9),
  }));
}
export function stripeData(data, s) {
  const baseline = getBaseline(data, s),
    view = getView(data, s);
  const rows = (view?.series || []).map(([year, value]) => ({
    year,
    value,
    anomaly: value - baseline.mean,
  }));
  return {
    baseline,
    rows,
    limit: Math.max(...rows.map((p) => Math.abs(p.anomaly)), 0.0001),
  };
}
export function comparisonData(data, s) {
  return data.regions
    .map((region) => {
      const view = getView(data, s, region.id);
      return {
        region,
        view,
        value: selectionValue(data, { ...s, region: region.id }),
      };
    })
    .filter(
      (r) =>
        r.view &&
        Number.isFinite(r.value) &&
        !(s.supportedOnly && s.quantity === "trend" && !r.view.supported),
    );
}
export function dependenceNote(x, y) {
  if ([x, y].includes("T2M") && [x, y].includes("VPD_kpa"))
    return " Temperature is an input to VPD, so these are not independent lines of evidence.";
  if ([x, y].includes("P_minus_E") && [x, y].includes("PRECTOTCORR_m2"))
    return " P−E contains this same precipitation record; the inputs are mathematically coupled.";
  if (x === y)
    return " The same variable is selected twice; self-correlation is not new evidence.";
  return "";
}
export function analysisMetric(data, s) {
  const v = getView(data, s),
    m = getVariable(data, s.variable);
  if (s.tab === "relationships") {
    const r = relationship(data, s, s.relationX, s.relationY, s.detrend);
    return {
      value: r.r,
      dp: 3,
      signed: true,
      unit: "Pearson r",
      label: s.detrend ? "Detrended association" : "Paired association",
      secondary: `n = ${r.n} paired ${s.season === "annual" ? "years" : "seasons"}`,
    };
  }
  if (s.tab === "cycle") {
    const months = cycleData(data, s),
      sorted = [...months].sort((a, b) => a.mean - b.mean),
      low = sorted[0],
      high = sorted.at(-1);
    return {
      value: high.mean,
      dp: m.decimals,
      signed: false,
      unit: m.unit,
      label: `Monthly peak · ${high.name}`,
      secondary: `Low · ${low.name} ${fmt(low.mean, m.decimals)} ${m.unit}`,
    };
  }
  if (s.tab === "stripes") {
    const d = stripeData(data, s),
      last = d.rows.at(-1);
    return {
      value: last.anomaly,
      dp: m.decimals,
      signed: true,
      unit: m.unit,
      label: `${last.year} vs ${d.baseline.label}`,
      secondary: `n = ${d.rows.length} stripes`,
    };
  }
  if (s.tab === "compare") {
    const rows = comparisonData(data, s);
    return {
      value: selectionValue(data, s),
      dp: decimals(m, s.quantity === "trend"),
      signed: s.quantity === "trend",
      unit: unit(m, s.quantity === "trend"),
      label: `${getRegion(data, s.region).name} · ${quantityText(s).toLowerCase()}`,
      secondary: `${rows.length} regional records`,
    };
  }
  return {
    value: v.slope * 10,
    dp: decimals(m, true),
    signed: true,
    unit: unit(m, true),
    label: "Linear change over 10 years",
    secondary: `n = ${v.n} ${s.season === "annual" ? "years" : "seasons"}`,
  };
}

export function chartCopy(data, s) {
  const m = getVariable(data, s.variable),
    ref = getBaseline(data, s);
  const base =
    s.season === "annual"
      ? "Whole-year arithmetic means of 12 monthly observations." +
        (m.unit === "mm/day"
          ? " Values are mean rates, not annual totals."
          : "")
      : "Complete 3-month means; December belongs to the following winter.";
  if (s.tab === "series")
    return {
      legend: [
        ["", "Regional means"],
        ["fit", "OLS trend"],
        ["band", "95% fitted-mean CI"],
      ],
      note: `${s.anomaly ? "Anomalies from " + ref.label + ". " : ""}${base} Shading is not a prediction interval.${m.exploratory ? " OLS is unbounded, not a probability forecast." : ""}`,
      interaction: "Click the record to inspect a year on the map.",
    };
  if (s.tab === "cycle")
    return {
      legend: [
        ["fit", "Monthly climatology"],
        ["band", "P10–P90 across years"],
      ],
      note: `All calendar months in ${s.period.replace("-", "–")}, regardless of the map’s season. Shading is a distribution, not statistical confidence.`,
    };
  if (s.tab === "stripes") {
    const { limit } = stripeData(data, s);
    return {
      legend: [
        ["cool", `${fmt(-limit, m.decimals)} ${m.unit}`],
        ["zero", `0 · reference ${ref.label}`],
        ["warm", `${fmt(limit, m.decimals, true)} ${m.unit}`],
      ],
      note: `One stripe per ${s.season === "annual" ? "year" : "complete season"}; anomalies from ${ref.label} (${ref.n} reference years). The symmetric color scale is local to this selection. Color is not significance.`,
      interaction: "Click a stripe to inspect that year.",
    };
  }
  if (s.tab === "compare")
    return {
      legend: [
        ["map", "Colors follow the map legend"],
        ...(s.quantity === "trend" ? [["interval", "95% slope interval"]] : []),
      ],
      note:
        "Six regional summaries, not a national area-weighted estimate. " +
        (s.quantity === "trend"
          ? "Faded bars fail the stated trend rule. "
          : "") +
        "",
      interaction: "Click a bar to select its regional record.",
    };
  return {
    legend: [
      [
        "year",
        `${getView(data, s, s.region, s.relationX)?.start ?? "Earlier"} → ${getView(data, s, s.region, s.relationY)?.end ?? "later"} observations`,
      ],
      ["association", "Association fit"],
    ],
    note:
      "Pearson association is not attribution. " +
      (s.detrend
        ? "Each input’s linear time trend is removed."
        : "Shared trends can affect the result.") +
      dependenceNote(s.relationX, s.relationY) +
      " No correlation significance test is asserted.",
    interaction: "Click a point to inspect its year.",
  };
}

export function chartData(data, s) {
  if (s.tab === "cycle") return cycleData(data, s);
  if (s.tab === "stripes") return stripeData(data, s);
  if (s.tab === "compare")
    return comparisonData(data, s).map((r) => ({
      region: r.region.id,
      value: r.value,
      n: r.view.n,
      ciLow: s.quantity === "trend" ? r.view.ciLow * 10 : null,
      ciHigh: s.quantity === "trend" ? r.view.ciHigh * 10 : null,
      supported: r.view.supported,
      qMK: r.view.qMK,
      source: r.view.source,
    }));
  if (s.tab === "relationships")
    return relationship(data, s, s.relationX, s.relationY, s.detrend);
  return {
    anomaly: !!s.anomaly,
    baseline: getBaseline(data, s),
    series: getView(data, s)?.series,
  };
}
export function statsSnapshot(data, s) {
  return {
    schemaVersion: 2,
    thresholds:
      s.tab !== "relationships" &&
      recipe(data, s.variable)?.kind === "joint_event"
        ? Object.fromEntries(
            Array.from({ length: 12 }, (_, i) => [
              i + 1,
              data.compoundThresholds[`${s.region}|${s.variable}|${i + 1}`],
            ]),
          )
        : undefined,
    selection: { ...s },
    context: analysisContext(s),
    metric: analysisMetric(data, s),
    chartData: chartData(data, s),
    region: getRegion(data, s.region),
    variable: getVariable(data, s.variable),
    view: getView(data, s),
    baseline: getBaseline(data, s),
    recipe: s.tab === "relationships" ? undefined : recipe(data, s.variable),
    inputs: (s.tab === "relationships"
      ? [s.relationX, s.relationY]
      : recipe(data, s.variable)?.inputs || [s.variable]
    ).map((id) => getVariable(data, id)),
    viewRole:
      s.tab === "relationships"
        ? "Mapped-clue context only; the paired calculation uses inputs/chartData."
        : "Selected annual/seasonal trend context; see chartData for the plotted calculation.",
    relationship:
      s.tab === "relationships"
        ? relationship(data, s, s.relationX, s.relationY, s.detrend)
        : undefined,
    sources: data.sources,
    mapDisplay: {
      role: "Administrative display proxy only; not verified extraction geography",
      boundaryYear: 2017,
      geometryURL: "/data/study-wilayas.geojson",
      metadataURL: "/data/wilaya-display-metadata.json",
      geometrySHA256: data.sources.regionalDisplay?.displaySHA256,
      textureMeaning:
        "Lens identity, not within-area detail, event locations or uncertainty",
      uniformRegionalColor: true,
    },
    caveats: data.audit.warnings,
  };
}
export function statNote(data, s) {
  const v = getView(data, s),
    m = getVariable(data, s.variable);
  if (s.tab === "relationships") {
    const r = relationship(data, s, s.relationX, s.relationY, s.detrend);
    return `Pearson correlation coefficient (r) measures how strongly two variables vary together on a linear scale, ranging from -1 (perfect negative) to +1 (perfect positive). Here r = ${fmt(r.r, 3, true)} with a sample size of n=${r.n}. ${s.detrend ? "Linear trends have been removed from each variable before calculating the correlation." : "This is the raw correlation without detrending."} The associated slope indicates the average change in the Y variable per decade of X (or per unit change), providing a beginner‑friendly sense of the relationship direction. No statistical significance test is performed; this is an association, not a proof of causation.${dependenceNote(s.relationX, s.relationY)}`;
  }
  if (s.tab === "cycle") {
    const rows = cycleData(data, s);
    return `Monthly climatology and across-year P10–P90; ${Math.min(...rows.map((r) => r.n))}–${Math.max(...rows.map((r) => r.n))} observations per calendar month. All months in ${s.period.replace("-", "–")}; ignores the map's season. Distribution, not a confidence interval.`;
  }
  const slopeVal = fmt(v.slope * 10, decimals(m, true), true);
  const trend = `OLS slope ${slopeVal} ${unit(m, true)}; 95% slope CI [${fmt(v.ciLow * 10, 4, true)}, ${fmt(v.ciHigh * 10, 4, true)}]; MK q ${fmtP(v.qMK)}; n=${v.n}. FDR family: ${v.qFamily}. Temporal dependence is not corrected${v.constantSeries ? " Constant series: its zero-width OLS interval is degenerate, not proof of zero event probability." : ""}`;
  const slopeDirection = v.slope > 0 ? "a positive value means the variable tends to increase over time." : v.slope < 0 ? "a negative value means the variable tends to decrease over time." : "a zero value indicates no change over time.";
  const explanation = `The slope shows the average change per decade; ${slopeDirection}`;
  if (s.tab === "compare")
    return `${getRegion(data, s.region).name} is the selected record. Bar units: ${unit(m, s.quantity === "trend")}. Every region retains its own interval and test result; see CSV/analysis JSON. ${trend} ${explanation}`;
  return `${getRegion(data, s.region).name}: ${trend} ${explanation}`;
}

export function chartCSV(data, s) {
  const m = getVariable(data, s.variable),
    v = getView(data, s),
    common = [s.region, s.variable, m.unit, s.season, s.period];
  if (s.tab === "cycle")
    return csv([
      [
        "region",
        "variable",
        "unit",
        "window",
        "month",
        "month_name",
        "n_observations",
        "monthly_mean",
        "p10_across_years",
        "p90_across_years",
      ],
      ...cycleData(data, s).map((r) => [
        s.region,
        s.variable,
        m.unit,
        s.period,
        r.month,
        r.name,
        r.n,
        r.mean,
        r.p10,
        r.p90,
      ]),
    ]);
  if (s.tab === "stripes") {
    const d = stripeData(data, s);
    return csv([
      [
        "region",
        "variable",
        "unit",
        "aggregation",
        "window",
        "year",
        "native_value",
        "reference_period",
        "reference_mean",
        "anomaly",
        "symmetric_color_limit",
      ],
      ...d.rows.map((r) => [
        ...common,
        r.year,
        r.value,
        d.baseline.label,
        d.baseline.mean,
        r.anomaly,
        d.limit,
      ]),
    ]);
  }
  if (s.tab === "compare")
    return csv([
      [
        "region",
        "variable",
        "unit",
        "aggregation",
        "window",
        "quantity",
        "inspection_year",
        "plotted_value",
        "slope_95ci_low_per_10yr",
        "slope_95ci_high_per_10yr",
        "n",
        "p_ols",
        "q_mk",
        "trend_supported",
        "statistics_source",
        "fdr_family",
      ],
      ...comparisonData(data, s).map((r) => [
        r.region.id,
        s.variable,
        unit(m, s.quantity === "trend"),
        s.season,
        s.period,
        s.quantity,
        s.quantity === "value" ? s.year : "",
        r.value,
        s.quantity === "trend" ? r.view.ciLow * 10 : "",
        s.quantity === "trend" ? r.view.ciHigh * 10 : "",
        r.view.n,
        r.view.pOLS,
        r.view.qMK,
        r.view.supported,
        r.view.source,
        r.view.qFamily,
      ]),
    ]);
  if (s.tab === "relationships") {
    const rel = relationship(data, s, s.relationX, s.relationY, s.detrend),
      x = new Map(getView(data, s, s.region, s.relationX)?.series),
      y = new Map(getView(data, s, s.region, s.relationY)?.series);
    return csv([
      [
        "region",
        "window",
        "aggregation",
        "year",
        "x_variable",
        "y_variable",
        "x_unit",
        "y_unit",
        "detrended",
        "plotted_x",
        "plotted_y",
        "native_x",
        "native_y",
      ],
      ...rel.points.map((p) => [
        s.region,
        s.period,
        s.season,
        p[0],
        s.relationX,
        s.relationY,
        getVariable(data, s.relationX).unit,
        getVariable(data, s.relationY).unit,
        s.detrend,
        p[1],
        p[2],
        x.get(p[0]),
        y.get(p[0]),
      ]),
    ]);
  }
  const ref = getBaseline(data, s),
    offset = s.anomaly ? ref.mean : 0,
    band = new Map(v.fitBand.map((p) => [p[0], p.slice(1)]));
  return csv([
    [
      "region",
      "variable",
      "unit",
      "aggregation",
      "window",
      "year",
      "native_value",
      "plotted_value",
      "anomaly",
      "reference_period",
      "reference_mean",
      "plotted_ols_fit",
      "fit_mean_95ci_low",
      "fit_mean_95ci_high",
      "slope_per_year",
      "slope_95ci_low_per_year",
      "slope_95ci_high_per_year",
      "p_ols",
      "p_mk",
      "q_mk",
      "trend_supported",
      "statistics_source",
      "fdr_family",
    ],
    ...v.series.map(([year, value]) => [
      ...common,
      year,
      value,
      value - offset,
      !!s.anomaly,
      ref.label,
      ref.mean,
      v.intercept + v.slope * year - offset,
      band.get(year)[0] - offset,
      band.get(year)[1] - offset,
      v.slope,
      v.ciLow,
      v.ciHigh,
      v.pOLS,
      v.pMK,
      v.qMK,
      v.supported,
      v.source,
      v.qFamily,
    ]),
  ]);
}

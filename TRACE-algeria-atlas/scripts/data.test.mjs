import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  getBaseline,
  linearFit,
  relationship,
  scaleDomain,
  quantile,
} from "../src/data.js";
import {
  cycleData,
  stripeData,
  comparisonData,
  analysisMetric,
  chartCSV,
  statsSnapshot,
} from "../src/field.js";

const data = JSON.parse(
  readFileSync(new URL("../public/data/atlas.json", import.meta.url)),
);
const state = {
  region: "Oran_West",
  variable: "T2M",
  period: "1984-2024",
  season: "annual",
  quantity: "trend",
};
const approx = (a, b, tolerance = 1e-7) =>
  assert.ok(
    Math.abs(a - b) < tolerance * (1 + Math.abs(b)),
    `${a} does not reproduce ${b}`,
  );

await test("payload dimensions and supplied/recomputed distinctions are retained", () => {
  assert.equal(data.regions.length, 6);
  assert.equal(data.variables.length, 28);
  assert.equal(Object.keys(data.views).length, 1620);
  assert.equal(
    Object.values(data.views).filter((view) => view.source === "supplied")
      .length,
    714,
  );
  assert.equal(data.audit.monthlyRows, 57816);
  assert.equal(data.audit.duplicates, 0);
});
await test("distributed source CSVs match their SHA-256 manifest", () => {
  assert.equal(data.sources.inputFiles.length, 5);
  for (const file of data.sources.inputFiles) {
    const bytes = readFileSync(
      new URL(`../public/data/raw/${file.filename}`, import.meta.url),
    );
    assert.equal(bytes.length, file.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256);
  }
});
await test("every view has a complete ordered record and the stated support rule", () => {
  for (const [key, view] of Object.entries(data.views)) {
    assert.equal(view.n, view.series.length, key);
    assert.equal(view.start, view.series[0][0]);
    assert.equal(view.end, view.series.at(-1)[0]);
    assert.equal(view.supported, view.pOLS < 0.05 && view.qMK < 0.05, key);
    assert.ok(view.ciLow <= view.slope && view.slope <= view.ciHigh, key);
    assert.ok(view.qMK >= 0 && view.qMK <= 1, key);
    for (let i = 1; i < view.series.length; i++)
      assert.equal(view.series[i][0], view.series[i - 1][0] + 1, key);
    approx(linearFit(view.series).slope, view.slope);
  }
});
await test("GPM starts in 2001 and winter uses complete cross-year seasons", () => {
  for (const region of data.regions) {
    assert.equal(data.monthly[region.id].PRECIP_gpm.length, 288);
    assert.equal(data.monthly[region.id].T2M.length, 492);
    assert.equal(
      data.views[`${region.id}|PRECIP_gpm|1984-2024|annual`],
      undefined,
    );
    const winter = data.views[`${region.id}|T2M|1984-2024|DJF`];
    assert.equal(winter.n, 40);
    assert.equal(winter.start, 1985);
    const imerg = data.views[`${region.id}|PRECIP_gpm|2001-2024|DJF`];
    assert.equal(imerg.n, 23);
    assert.equal(imerg.start, 2002);
    const monthly = new Map(data.monthly[region.id].T2M);
    const first =
      (monthly.get("1984-12") +
        monthly.get("1985-01") +
        monthly.get("1985-02")) /
      3;
    approx(winter.series[0][1], first);
  }
});
await test("physical combined variables reproduce their supplied inputs", () => {
  const es = (temp) => 0.6108 * Math.exp((17.27 * temp) / (237.3 + temp));
  for (const region of data.regions) {
    const s = data.monthly[region.id];
    for (let i = 0; i < s.T2M.length; i++) {
      approx(
        s.VPD_kpa[i][1],
        Math.max(0, es(s.T2M[i][1]) - es(s.T2MDEW[i][1])),
      );
      approx(s.P_minus_E[i][1], s.PRECTOTCORR_m2[i][1] - s.EVAP_m2[i][1]);
      approx(s.WS2M_vec[i][1], Math.hypot(s.U2M[i][1], s.V2M[i][1]));
      approx(s.DUST_SHARE[i][1], (100 * s.AOD_dust[i][1]) / s.AOD_total[i][1]);
      assert.ok(s.AOD_dust[i][1] <= s.AOD_total[i][1]);
    }
  }
});
await test("hot–dry thresholds and strict co-occurrence rules are reproducible", () => {
  for (const region of data.regions) {
    const s = data.monthly[region.id];
    for (let month = 1; month <= 12; month++) {
      const indices = s.T2M.map(([date], i) => ({ date, i }))
        .filter(
          ({ date }) =>
            +date.slice(5) === month &&
            +date.slice(0, 4) >= 1991 &&
            +date.slice(0, 4) <= 2020,
        )
        .map((p) => p.i);
      const threshold = data.hotDryThresholds[`${region.id}|${month}`];
      assert.equal(threshold.baseline_n, 30);
      approx(
        quantile(
          indices.map((i) => s.T2M[i][1]),
          0.9,
        ),
        threshold.temperature_p90,
      );
      approx(
        quantile(
          indices.map((i) => s.PRECIP_gpcp[i][1]),
          0.1,
        ),
        threshold.rainfall_p10,
      );
    }
    for (let i = 0; i < s.HOT_DRY.length; i++) {
      const date = s.T2M[i][0],
        threshold = data.hotDryThresholds[`${region.id}|${+date.slice(5)}`];
      const event =
        s.T2M[i][1] > threshold.temperature_p90 &&
        s.PRECIP_gpcp[i][1] < threshold.rainfall_p10;
      assert.equal(s.HOT_DRY[i][1], event ? 100 : 0);
    }
    for (const [year, value] of data.views[
      `${region.id}|HOT_DRY|1984-2024|annual`
    ].series) {
      const count = s.HOT_DRY.filter(
        ([date, value]) => +date.slice(0, 4) === year && value === 100,
      ).length;
      approx(value, (100 * count) / 12);
    }
  }
});
await test("baselines respect the shorter IMERG coverage", () => {
  const baseline = getBaseline(data, state);
  assert.equal(baseline.n, 30);
  assert.equal(baseline.label, "1991–2020");
  const imerg = getBaseline(data, {
    ...state,
    variable: "PRECIP_gpm",
    period: "2001-2024",
  });
  assert.equal(imerg.n, 20);
  assert.equal(imerg.label, "2001–2020");
});
await test("relationship statistics are descriptive and detrending removes time trends", () => {
  const original = relationship(data, state, "CLDTOT", "SWGDN");
  assert.equal(original.n, 41);
  approx(original.r, -0.686, 0.001);
  const adjusted = relationship(data, state, "CLDTOT", "SWGDN", true);
  assert.notEqual(adjusted.r, original.r);
  approx(linearFit(adjusted.points.map((p) => [p[0], p[1]])).slope, 0);
  approx(linearFit(adjusted.points.map((p) => [p[0], p[2]])).slope, 0);
});
await test("QA variable remains native and is excluded from combined recipes", () => {
  const gauge = data.variables.find((v) => v.id === "GPCP_gauge_wt");
  assert.equal(gauge.qa, true);
  const values = data.regions.flatMap((r) =>
    data.monthly[r.id].GPCP_gauge_wt.map((p) => p[1]),
  );
  assert.ok(Math.min(...values) > 21);
  assert.ok(Math.max(...values) > 90);
  assert.ok(data.recipes.every((recipe) => !recipe.inputs.includes(gauge.id)));
});
await test("zero-crossing map domains use a consistent symmetric diverging legend", () => {
  for (const variable of data.variables) {
    const domain = scaleDomain(data, {
      ...state,
      variable: variable.id,
      period: variable.start === 2001 ? "2001-2024" : state.period,
    });
    if (domain[0] < 0 && domain[1] > 0) approx(domain[0], -domain[1]);
  }
});

await test("the curated interface contains exactly seven agreed clues and six permitted combinations", () => {
  const ids = [
    "T2M",
    "VPD_kpa",
    "P_minus_E",
    "PRECTOTCORR_m2",
    "PRECIP_gpm",
    "SWGDN",
    "AOD_total",
  ];
  assert.deepEqual(
    data.interface.primaryVariables.map((v) => v.id),
    ids,
  );
  assert.equal(data.interface.caseIds.length, 6);
  assert.ok(!data.variables.some((v) => v.id === "GWETROOT"));
  assert.match(
    data.interface.variableDecisions.GWETROOT,
    /not a soil-wetness/i,
  );
  for (const id of data.interface.caseIds) {
    const recipe = data.recipes.find((r) => r.id === id);
    assert.ok(recipe.inputs.length >= 2 && recipe.inputs.length <= 3);
    assert.ok(recipe.inputs.every((input) => ids.includes(input)));
    assert.ok(recipe.formula && recipe.caution && recipe.scientificName);
    assert.ok(!recipe.inputs.includes("PRECIP_gpcp"));
  }
});
await test("all five new joint-condition diagnostics reproduce their fixed monthly thresholds and event counts", () => {
  const cases = data.recipes.filter((r) => r.kind === "joint_event");
  assert.equal(cases.length, 5);
  for (const region of data.regions) {
    const monthly = data.monthly[region.id];
    for (const recipe of cases) {
      for (let month = 1; month <= 12; month++) {
        const cuts =
          data.compoundThresholds[`${region.id}|${recipe.id}|${month}`];
        assert.equal(cuts.length, recipe.inputs.length);
        for (const cut of cuts) {
          assert.equal(cut.n, 30);
          const reference = monthly[cut.variable]
            .filter(
              ([date]) =>
                +date.slice(0, 4) >= 1991 &&
                +date.slice(0, 4) <= 2020 &&
                +date.slice(5) === month,
            )
            .map((p) => p[1]);
          approx(quantile(reference, cut.quantile), cut.threshold);
        }
      }
      for (let i = 0; i < monthly[recipe.id].length; i++) {
        const [date, event] = monthly[recipe.id][i],
          cuts =
            data.compoundThresholds[
              `${region.id}|${recipe.id}|${+date.slice(5)}`
            ];
        const meets = cuts.every((c) =>
          c.operator === ">"
            ? monthly[c.variable][i][1] > c.threshold
            : monthly[c.variable][i][1] < c.threshold,
        );
        assert.equal(
          event,
          meets ? 100 : 0,
          `${region.id} ${recipe.id} ${date}`,
        );
      }
      for (const [year, value] of data.views[
        `${region.id}|${recipe.id}|1984-2024|annual`
      ].series) {
        const count = monthly[recipe.id].filter(
          ([date, event]) => +date.slice(0, 4) === year && event === 100,
        ).length;
        approx(value, (count / 12) * 100);
      }
    }
  }
});
await test("the rainfall difference uses only paired 2001–2024 coverage and is not labelled observational bias", () => {
  for (const region of data.regions) {
    const s = data.monthly[region.id],
      merra = new Map(s.PRECTOTCORR_m2),
      imerg = new Map(s.PRECIP_gpm);
    assert.equal(s.RAIN_GAP.length, 288);
    assert.equal(s.RAIN_GAP[0][0], "2001-01");
    for (const [date, value] of s.RAIN_GAP)
      approx(value, imerg.get(date) - merra.get(date));
    assert.equal(
      data.views[`${region.id}|RAIN_GAP|1984-2024|annual`],
      undefined,
    );
  }
  const r = data.recipes.find((r) => r.id === "RAIN_GAP");
  assert.match(r.caution, /not observational bias/);
  assert.equal(getBaseline(data, { ...state, variable: "RAIN_GAP" }).n, 20);
});
await test("constant event views retain finite diagnostics and no false trend support", () => {
  const constant = Object.values(data.views).filter((v) =>
    v.series.every((p) => p[1] === v.series[0][1]),
  );
  assert.ok(constant.length > 0);
  for (const v of constant) {
    assert.equal(v.slope, 0);
    assert.equal(v.pOLS, 1);
    assert.equal(v.pMK, 1);
    assert.equal(v.qMK, 1);
    assert.equal(v.r2, 0);
    assert.equal(v.supported, false);
  }
  for (const [key, v] of Object.entries(data.views))
    for (const k of [
      "mean",
      "slope",
      "ciLow",
      "ciHigh",
      "pOLS",
      "pMK",
      "qMK",
      "residualLag1",
      "r2",
    ])
      assert.ok(Number.isFinite(v[k]), `${key} ${k}`);
});
await test("chart-specific CSVs export the displayed calculation, rather than a substituted annual series", () => {
  const s = {
    ...state,
    year: 2024,
    palette: 0,
    supportedOnly: false,
    relationX: "T2M",
    relationY: "VPD_kpa",
    detrend: false,
    anomaly: true,
  };
  const lengths = {
    series: 42,
    cycle: 13,
    stripes: 42,
    compare: 7,
    relationships: 42,
  };
  for (const [tab, n] of Object.entries(lengths))
    assert.equal(chartCSV(data, { ...s, tab }).split("\r\n").length, n, tab);
  const monthly = cycleData(data, s);
  assert.equal(monthly.length, 12);
  assert.ok(monthly.every((m) => m.n === 41));
  assert.deepEqual(cycleData(data, { ...s, season: "DJF" }), monthly);
  assert.match(chartCSV(data, { ...s, tab: "cycle" }), /p10_across_years/);
  assert.match(chartCSV(data, { ...s, tab: "stripes" }), /reference_mean/);
  assert.match(chartCSV(data, { ...s, tab: "compare" }), /Annaba_East/);
  assert.match(
    chartCSV(data, { ...s, tab: "relationships", detrend: true }),
    /native_x/,
  );
  assert.match(
    chartCSV(data, { ...s, tab: "series" }),
    /native_value.*plotted_value/,
  );
});
await test("window/card summaries are specific to the visualization and preserve honest units", () => {
  const s = {
    ...state,
    year: 2024,
    palette: 0,
    supportedOnly: false,
    relationX: "T2M",
    relationY: "VPD_kpa",
    detrend: false,
  };
  const d = stripeData(data, s);
  approx(
    d.rows.at(-1).anomaly,
    data.views["Oran_West|T2M|1984-2024|annual"].series.at(-1)[1] -
      getBaseline(data, s).mean,
  );
  assert.match(
    analysisMetric(data, { ...s, tab: "cycle" }).label,
    /Monthly peak/,
  );
  assert.match(analysisMetric(data, { ...s, tab: "stripes" }).label, /2024 vs/);
  assert.equal(
    analysisMetric(data, { ...s, tab: "relationships" }).unit,
    "Pearson r",
  );
  assert.equal(comparisonData(data, { ...s, supportedOnly: true }).length, 5);
  const paired = statsSnapshot(data, {
    ...s,
    variable: "HEAT_DRY_RAIN",
    tab: "relationships",
  });
  assert.deepEqual(
    paired.inputs.map((v) => v.id),
    ["T2M", "VPD_kpa"],
  );
  assert.equal(paired.thresholds, undefined);
  assert.equal(paired.recipe, undefined);
  const snap = statsSnapshot(data, { ...s, tab: "series" });
  assert.equal(snap.schemaVersion, 2);
  assert.equal(snap.view.qFamilySize, 114);
  assert.match(snap.metric.unit, /10 yr/);
  assert.ok(snap.view.slope < 0.1);
});

await test("constant frequency map domains never invent a negative percentage, and snapshots retain thresholds", () => {
  for (const id of data.interface.caseIds.filter((id) => id !== "RAIN_GAP"))
    for (const season of ["annual", "DJF", "MAM", "JJA", "SON"]) {
      const domain = scaleDomain(data, {
        ...state,
        variable: id,
        season,
        quantity: "mean",
      });
      assert.ok(domain[0] >= 0 && domain[1] <= 100);
    }
  const s = {
    ...state,
    variable: "HEAT_DRY_RAIN",
    year: 2024,
    tab: "series",
    palette: 0,
  };
  const snap = statsSnapshot(data, s);
  assert.equal(Object.keys(snap.thresholds).length, 12);
  assert.equal(snap.thresholds["1"][0].n, 30);
});

import * as echarts from "echarts";
import {
  getView,
  getVariable,
  getRegion,
  getBaseline,
  fmt,
  decimals,
  MONTHS,
  relationship,
  linearFit,
  colorFor,
  scaleDomain,
  esc,
} from "./data.js";
import { cycleData, comparisonData, stripeData, label, unit } from "./field.js";

const INK = "#6a7d86",
  WINE = "#902d4b",
  MUTED = "#687981",
  GRID = "#edf0f0";
const font = "Lato, sans-serif";
export function createCharts(
  data,
  onYear,
  onRegion,
  target = document.getElementById("chart"),
) {
  const element = target;
  const chart = echarts.init(element, null, { renderer: "canvas" });
  let state = null,
    lastRelation = null;
  const axis = {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      fontFamily: font,
      fontSize: 11,
      color: MUTED,
      hideOverlap: true,
    },
    splitLine: { lineStyle: { color: GRID, width: 0.7 } },
    nameTextStyle: { fontFamily: font, fontSize: 10, color: MUTED },
    scale: true,
  };
  const tooltip = {
    trigger: "axis",
    backgroundColor: "#fffffffa",
    borderColor: "#e0e5e5",
    borderWidth: 1,
    padding: [10, 12],
    textStyle: { fontFamily: font, fontSize: 12, color: "#54636d" },
    extraCssText: "box-shadow:0 3px 16px rgba(29,48,56,.08);border-radius:5px;",
    confine: true,
    axisPointer: { lineStyle: { color: "#b4bdc0", type: "dashed", width: 1 } },
  };
  function base() {
    return {
      animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      animationDuration: 650,
      animationDurationUpdate: 350,
      textStyle: { fontFamily: font },
      grid: { left: 51, right: 24, top: 27, bottom: 32 },
      tooltip,
      aria: { enabled: true },
      xAxis: { ...axis, splitLine: { show: false }, minInterval: 1 },
      yAxis: { ...axis, splitNumber: 3 },
      series: [],
    };
  }
  function update(next) {
    state = { ...next };
    const v = getVariable(data, state.variable),
      view = getView(data, state);
    lastRelation = null;
    if (!view) {
      chart.clear();
      chart.setOption({
        title: {
          text: "No complete observations in this selection",
          left: "center",
          top: "middle",
          textStyle: {
            fontFamily: font,
            fontSize: 12,
            fontWeight: "normal",
            color: MUTED,
          },
        },
      });
      return;
    }
    let option = base();
    if (state.tab === "series") option = timeSeries(option, v, view);
    if (state.tab === "cycle") option = cycle(option, v);
    if (state.tab === "stripes") option = stripes(option, v, view);
    if (state.tab === "compare") option = compare(option, v);
    if (state.tab === "relationships") option = scatter(option);
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
  }
  function bandSeries(xs, lo, hi, color = "#d6b8c4") {
    return [
      {
        name: "_band base",
        type: "line",
        data: xs.map((x, i) => [x, lo[i]]),
        stack: "uncertainty",
        stackStrategy: "all",
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { opacity: 0 },
        silent: true,
        z: 0,
      },
      {
        name: "_band range",
        type: "line",
        data: xs.map((x, i) => [x, hi[i] - lo[i]]),
        stack: "uncertainty",
        stackStrategy: "all",
        symbol: "none",
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.22 },
        silent: true,
        z: 0,
      },
    ];
  }
  function timeSeries(o, v, view) {
    const baseline = getBaseline(data, state),
      offset = state.anomaly ? baseline.mean : 0,
      xs = view.series.map((p) => p[0]),
      values = view.series.map((p) => [p[0], p[1] - offset]);
    const lows = view.fitBand.map((p) => p[1] - offset),
      highs = view.fitBand.map((p) => p[2] - offset);
    const fit = xs.map((year) => [
      year,
      view.intercept + view.slope * year - offset,
    ]);
    o.xAxis = {
      ...o.xAxis,
      min: xs[0],
      max: xs.at(-1),
      interval: xs.length > 30 ? 10 : 5,
      axisLabel: { ...axis.axisLabel, formatter: (v) => String(Math.round(v)) },
    };
    o.yAxis.name = v.unit;
    o.yAxis.nameTextStyle = {
      ...o.yAxis.nameTextStyle,
      align: "left",
      fontSize: 10,
    };
    o.yAxis.axisLabel = {
      ...axis.axisLabel,
      formatter: (x) =>
        fmt(x, Math.abs(x) < 0.1 ? 3 : v.id.startsWith("AOD") ? 2 : 1),
    };
    o.tooltip = {
      ...tooltip,
      formatter: (params) => {
        const p = params.find((p) => p.seriesName === "Observed");
        if (!p) return "";
        const year = p.value[0],
          val = p.value[1],
          f = view.intercept + view.slope * year - offset;
        return `<b style="color:#344952">${year}</b><br/><span style="color:#809299">${state.anomaly ? "Anomaly" : "Observed"}</span> <b>${fmt(val, v.decimals)} ${esc(v.unit)}</b><br/><span style="color:#902d4b">Linear fit</span> ${fmt(f, v.decimals)} ${esc(v.unit)}`;
      },
    };
    o.series = [
      ...bandSeries(xs, lows, highs),
      {
        name: "Observed",
        type: "line",
        data: values,
        showSymbol: false,
        symbolSize: 5,
        lineStyle: { color: INK, width: 2 },
        itemStyle: { color: INK },
        markPoint: {
          symbol: "circle",
          symbolSize: 6,
          label: { show: false },
          data: [
            { type: "max", name: "Highest" },
            { type: "min", name: "Lowest" },
          ],
        },
        z: 3,
      },
      {
        name: "Linear fit",
        type: "line",
        data: fit,
        symbol: "none",
        lineStyle: { color: WINE, width: 1.7 },
        z: 4,
      },
    ];
    if (state.quantity === "value")
      o.series[2].markLine = {
        silent: true,
        symbol: "none",
        label: { show: false },
        lineStyle: { color: "#b49aa3", type: "dashed", width: 1 },
        data: [{ xAxis: state.year }],
      };
    if (state.anomaly)
      o.series[2].markLine = {
        ...(o.series[2].markLine || {}),
        silent: true,
        symbol: "none",
        label: { show: false },
        lineStyle: { color: "#c1c8ca", type: "dashed", width: 1 },
        data: [...(o.series[2].markLine?.data || []), { yAxis: 0 }],
      };
    return o;
  }
  function cycle(o, v) {
    const months = cycleData(data, state),
      xs = months.map((_, i) => i),
      lo = months.map((r) => r.p10),
      hi = months.map((r) => r.p90),
      means = months.map((r) => r.mean);
    o.yAxis.name = v.unit;
    o.xAxis = {
      ...o.xAxis,
      min: 0,
      max: 11,
      interval: 1,
      axisLabel: { ...axis.axisLabel, formatter: (i) => MONTHS[i] },
    };
    o.series = [
      ...bandSeries(xs, lo, hi, "#b7cacc"),
      {
        name: "Monthly climatology",
        type: "line",
        data: xs.map((x, i) => [x, means[i]]),
        symbol: "circle",
        symbolSize: 3,
        lineStyle: { color: "#297e7c", width: 2.3 },
        itemStyle: { color: "#297e7c" },
        z: 4,
      },
    ];
    o.tooltip = {
      ...tooltip,
      formatter: (params) => {
        const pp = params.find((p) => p.seriesName === "Monthly climatology");
        if (!pp) return "";
        const i = pp.value[0];
        return `<b>${MONTHS[i]}</b><br/>Mean: <b>${fmt(means[i], v.decimals)} ${esc(v.unit)}</b><br/>P10–P90: ${fmt(lo[i], v.decimals)} – ${fmt(hi[i], v.decimals)}<br/>${months[i].n} monthly observations`;
      },
    };
    return o;
  }
  function stripes(o, v, view) {
    const { baseline, rows, limit: max } = stripeData(data, state),
      anomalies = rows.map((p) => p.anomaly);
    o.grid = { left: 15, right: 14, top: 22, bottom: 35 };
    o.xAxis = {
      type: "category",
      data: view.series.map((p) => String(p[0])),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        fontFamily: font,
        fontSize: 10,
        color: MUTED,
        interval: (i) =>
          i === 0 || i === view.series.length - 1 || i % 10 === 0,
      },
    };
    o.yAxis = { type: "value", min: 0, max: 1, show: false };
    o.tooltip = {
      ...tooltip,
      trigger: "item",
      formatter: (p) => {
        const i = p.dataIndex;
        return `<b>${view.series[i][0]}</b><br/>${fmt(view.series[i][1], v.decimals)} ${esc(v.unit)}<br/>Anomaly: <b>${fmt(anomalies[i], v.decimals, true)} ${esc(v.unit)}</b><br/>Reference: ${baseline.label}`;
      },
    };
    o.series = [
      {
        name: "Anomaly",
        type: "bar",
        barWidth: "100%",
        barCategoryGap: "0%",
        data: anomalies.map((value) => ({
          value: 1,
          itemStyle: {
            color:
              value < 0
                ? interpolate("#ece8e2", "#2a6684", Math.abs(value) / max)
                : interpolate("#ece8e2", "#a52b45", value / max),
          },
        })),
        silent: false,
      },
    ];
    return o;
  }
  function compare(o, v) {
    const rows = comparisonData(data, state);
    if (!rows.length) {
      o.title = {
        text: "No regions pass this selection’s support filter",
        left: "center",
        top: "middle",
        textStyle: {
          fontFamily: font,
          fontSize: 11,
          fontWeight: "normal",
          color: MUTED,
        },
      };
      o.xAxis.show = false;
      o.yAxis.show = false;
      return o;
    }
    o.grid = { left: 104, right: 32, top: 18, bottom: 51 };
    o.xAxis = {
      ...axis,
      scale: false,
      name: unit(v, state.quantity === "trend"),
      nameLocation: "middle",
      nameGap: 30,
      splitNumber: 4,
      axisLabel: {
        ...axis.axisLabel,
        formatter: (x) => fmt(x, Math.abs(x) < 0.01 ? 3 : 2),
      },
    };
    o.yAxis = {
      type: "category",
      data: rows.map((r) => r.region.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontFamily: font, fontSize: 11, color: "#536b5f" },
    };
    const domain = scaleDomain(data, state);
    o.series = [
      {
        name: "Regional value",
        type: "bar",
        barMaxWidth: 17,
        data: rows.map((r) => ({
          value: r.value,
          regionId: r.region.id,
          itemStyle: {
            color: colorFor(r.value, domain, state.palette),
            opacity: state.quantity === "trend" && !r.view.supported ? 0.65 : 1,
            borderColor: r.region.id === state.region ? WINE : "transparent",
            borderWidth: r.region.id === state.region ? 1 : 0,
            borderRadius: 2,
          },
        })),
        z: 2,
      },
    ];
    if (state.quantity === "trend")
      o.series.push({
        name: "95% slope interval",
        type: "custom",
        silent: true,
        encode: { x: [0, 1], y: 2 },
        data: rows.map((r, i) => [r.view.ciLow * 10, r.view.ciHigh * 10, i]),
        renderItem: (params, api) => {
          const low = api.coord([api.value(0), api.value(2)]),
            high = api.coord([api.value(1), api.value(2)]);
          return {
            type: "group",
            children: [
              {
                type: "line",
                shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] },
                style: { stroke: "#576d76", lineWidth: 0.8 },
              },
              {
                type: "line",
                shape: {
                  x1: low[0],
                  y1: low[1] - 3,
                  x2: low[0],
                  y2: low[1] + 3,
                },
                style: { stroke: "#576d76", lineWidth: 0.8 },
              },
              {
                type: "line",
                shape: {
                  x1: high[0],
                  y1: high[1] - 3,
                  x2: high[0],
                  y2: high[1] + 3,
                },
                style: { stroke: "#576d76", lineWidth: 0.8 },
              },
            ],
          };
        },
        z: 4,
      });
    o.tooltip = {
      ...tooltip,
      trigger: "axis",
      axisPointer: { type: "shadow", shadowStyle: { color: "#d5dfe515" } },
      formatter: (params) => {
        const p = params.find((p) => p.seriesName === "Regional value");
        if (!p) return "";
        const r = rows[p.dataIndex];
        return `<b>${esc(r.region.name)}</b><br/>${fmt(r.value, decimals(v, state.quantity === "trend"), state.quantity === "trend")} ${esc(state.quantity === "trend" ? v.trendUnit.replace("decade", "10 yr") : v.unit)}${state.quantity === "trend" ? `<br/>95% CI: ${fmt(r.view.ciLow * 10, decimals(v, true), true)} to ${fmt(r.view.ciHigh * 10, decimals(v, true), true)}<br/>MK q: ${fmt(r.view.qMK, 4)}<br/>${r.view.supported ? "Passes" : "Does not pass"} OLS + MK/FDR rule` : ""}`;
      },
    };
    return o;
  }
  function scatter(o) {
    const rel = relationship(
      data,
      state,
      state.relationX,
      state.relationY,
      state.detrend,
    );
    lastRelation = rel;
    const vx = getVariable(data, rel.xId),
      vy = getVariable(data, rel.yId);
    o.grid = { left: 60, right: 25, top: 28, bottom: 53 };
    o.xAxis = {
      ...axis,
      name: `${label(data, rel.xId)} (${vx.unit})${rel.detrended ? " · residual" : ""}`,
      nameLocation: "middle",
      nameGap: 29,
      nameTextStyle: { fontFamily: font, fontSize: 10, color: MUTED },
      splitNumber: 4,
    };
    o.yAxis = {
      ...axis,
      splitNumber: 3,
      name: `${label(data, rel.yId)} (${vy.unit})${rel.detrended ? " · residual" : ""}`,
      nameTextStyle: {
        fontFamily: font,
        fontSize: 10,
        align: "left",
        color: MUTED,
      },
    };
    if (!rel.n) {
      o.title = {
        text: "No overlapping complete observations",
        left: "center",
        top: "middle",
        textStyle: {
          fontFamily: font,
          fontSize: 11,
          fontWeight: "normal",
          color: MUTED,
        },
      };
      return o;
    }
    o.visualMap = {
      show: false,
      min: rel.points[0][0],
      max: rel.points.at(-1)[0],
      dimension: 2,
      inRange: { color: ["#bbd2cc", "#7c8baf", "#684c81"] },
      seriesIndex: 0,
    };
    const pts = rel.points.map((p) => [p[1], p[2], p[0]]),
      fit = linearFit(pts.map((p) => [p[0], p[1]])),
      xs = pts.map((p) => p[0]),
      lo = Math.min(...xs),
      hi = Math.max(...xs);
    o.series = [
      {
        name: "Paired observations",
        type: "scatter",
        data: pts,
        symbolSize: 8,
        itemStyle: { opacity: 0.76, borderColor: "#fff", borderWidth: 0.7 },
        emphasis: {
          itemStyle: { opacity: 1, borderColor: "#fff", borderWidth: 1 },
        },
        z: 4,
      },
      {
        name: "Association fit",
        type: "line",
        data: [
          [lo, fit.predict(lo)],
          [hi, fit.predict(hi)],
        ],
        symbol: "none",
        lineStyle: { color: "#9dabb0", width: 1, type: "dashed" },
        silent: true,
      },
    ];
    o.tooltip = {
      ...tooltip,
      trigger: "item",
      formatter: (p) =>
        p.seriesName !== "Paired observations"
          ? ""
          : `<b>${p.value[2]}</b>${rel.detrended ? " · detrended residuals" : ""}<br/>${esc(vx.short)}: ${fmt(p.value[0], vx.decimals)} ${esc(vx.unit)}<br/>${esc(vy.short)}: ${fmt(p.value[1], vy.decimals)} ${esc(vy.unit)}`,
    };
    return o;
  }
  chart.on("click", (p) => {
    if (p.seriesName === "Observed" && Array.isArray(p.value))
      onYear(p.value[0]);
    if (p.seriesName === "Anomaly")
      onYear(getView(data, state).series[p.dataIndex][0]);
    if (p.seriesName === "Paired observations") onYear(p.value[2]);
    if (p.seriesName === "Regional value" && p.data.regionId)
      onRegion(p.data.regionId);
  });
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(element);
  return {
    update,
    resize: () => chart.resize(),
    get relation() {
      return lastRelation;
    },
    exportPNG: (meta) => exportWithContext(chart, meta),
    dispose: () => {
      observer.disconnect();
      chart.dispose();
    },
    get chart() {
      return chart;
    },
  };
}
function interpolate(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return (
    "#" +
    [0, 2, 4]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i + 1, i + 3), 16) * (1 - t) +
            parseInt(b.slice(i + 1, i + 3), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function exportWithContext(
  chart,
  {
    title = "TRACE · Regional analysis",
    subtitle = "",
    legend = [],
    notes = [],
  } = {},
) {
  chart.getZr().flush();
  const image = chart.renderToCanvas({
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  const ratio = 2,
    width = Math.max(chart.getWidth(), 640),
    canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  const wrap = (text, maxWidth) => {
    const words = String(text).split(/\s+/),
      lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  };
  ctx.font = "11px Lato, sans-serif";
  const lines = notes.flatMap((note) => wrap(note, width - 64));
  let lx = 32,
    ly = 92;
  const keys = [];
  for (const item of legend) {
    const size = ctx.measureText(item.text).width + 43;
    if (lx + size > width - 25 && lx > 32) {
      lx = 32;
      ly += 19;
    }
    keys.push({ ...item, x: lx, y: ly });
    lx += size;
  }
  const header = keys.length ? ly + 18 : 88;
  // Preserve the chart's aspect ratio, including for narrow/mobile exports.
  const chartHeight = (chart.getHeight() * (width - 32)) / chart.getWidth(),
    footer = 37 + lines.length * 17,
    height = Math.ceil(header + chartHeight + footer);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.scale(ratio, ratio);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#902d4b";
  ctx.font = "700 10px Lato, sans-serif";
  ctx.fillText("TRACE / ALGERIA EARTH SYSTEM ATLAS", 32, 23);
  ctx.fillStyle = "#26343c";
  ctx.font = "700 20px Lato, sans-serif";
  ctx.fillText(title, 32, 49, width - 64);
  ctx.fillStyle = "#647780";
  ctx.font = "12px Lato, sans-serif";
  ctx.fillText(subtitle, 32, 69, width - 64);
  ctx.font = "11px Lato, sans-serif";
  for (const key of keys) {
    let fill = key.color || "#6a7d86";
    if (key.ramp) {
      fill = ctx.createLinearGradient(key.x, 0, key.x + 25, 0);
      key.ramp.forEach((c, i) =>
        fill.addColorStop(i / (key.ramp.length - 1), c),
      );
    }
    ctx.fillStyle = fill;
    ctx.fillRect(key.x, key.y - 7, 25, 6);
    ctx.fillStyle = "#52645e";
    ctx.fillText(key.text, key.x + 31, key.y);
  }
  ctx.drawImage(image, 16, header, width - 32, chartHeight);
  ctx.strokeStyle = "#e4e6e7";
  ctx.beginPath();
  ctx.moveTo(32, header + chartHeight + 10);
  ctx.lineTo(width - 32, header + chartHeight + 10);
  ctx.stroke();
  ctx.font = "11px Lato, sans-serif";
  ctx.fillStyle = "#63747b";
  lines.forEach((line, i) =>
    ctx.fillText(line, 32, header + chartHeight + 30 + i * 17),
  );
  const encoded = canvas.toDataURL("image/png").split(",")[1],
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

import { createCharts } from "./charts.js";
import { iconize } from "./icons.js";
import { gsap } from "gsap";
import {
  esc,
  getVariable,
  getView,
  getRegion,
  fmt,
  download,
  PALETTES,
  scaleDomain,
  rampCSS,
} from "./data.js";
import {
  TYPES,
  label,
  analysisContext,
  unit,
  chartCopy,
  chartCSV,
  statsSnapshot,
  statNote,
  analysisMetric,
} from "./field.js";

export function createWindowManager(
  data,
  { getState, onYear, onRegion, onCollect, onDetails, toast },
) {
  const layer = document.getElementById("windowLayer"),
    tray = document.getElementById("windowTray"),
    windows = new Map();
  let z = 60,
    sequence = 0;
  const options = (items, current) =>
    items
      .map(
        ([id, name]) =>
          `<option value="${id}" ${id === current ? "selected" : ""}>${esc(name)}</option>`,
      )
      .join("");

  function ensure(s) {
    if (
      getVariable(data, s.variable).start === 2001 ||
      (s.tab === "relationships" &&
        [s.relationX, s.relationY].some(
          (id) => getVariable(data, id).start === 2001,
        ))
    )
      s.period = "2001-2024";
    const v = getView(data, s);
    if (v && !v.series.some((p) => p[0] === s.year)) s.year = v.end;
  }
  function open(type, selection = null, { follow = selection === null } = {}) {
    if (!TYPES[type]) return;
    if (!selection) {
      const current = [...windows.values()]
        .reverse()
        .find((w) => w.state.tab === type && w.follow);
      if (current) {
        restore(current);
        return current;
      }
    }
    const id = crypto.randomUUID(),
      state = { ...getState(), ...(selection || {}), tab: type };
    ensure(state);
    const spec = TYPES[type],
      i = sequence++,
      el = document.createElement("section");
    el.className = "evidence-window";
    el.dataset.window = id;
    el.dataset.type = type;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-label", spec.name + " analysis window");
    el.setAttribute("aria-modal", "false");
    el.tabIndex = -1;
    el.style.setProperty("--chart-color", spec.color);
    el.style.left =
      Math.max(
        14,
        innerWidth - Math.min(690, innerWidth - 28) - 36 - (i % 5) * 24,
      ) + "px";
    el.style.top =
      Math.max(10, Math.min(28 + (i % 5) * 24, layer.clientHeight - 570)) +
      "px";
    el.innerHTML = `<div class="window-heading"><button class="move-handle" aria-label="Move window with arrow keys" title="Drag header, or use arrow keys on this handle"><i data-lucide="grip-vertical"></i></button><i data-lucide="${spec.icon}"></i><span>${esc(spec.name.toUpperCase())} / ${String(i + 1).padStart(2, "0")}</span><button class="icon-button" data-action="clone" aria-label="Duplicate window" title="Duplicate a frozen selection"><i data-lucide="copy"></i></button><button class="icon-button" data-action="minimize" aria-label="Minimize window" title="Minimize to map tray"><i data-lucide="minus"></i></button><button class="icon-button" data-action="maximize" aria-label="Expand window" title="Expand / restore"><i data-lucide="maximize-2"></i></button><button class="icon-button" data-action="close" aria-label="Close window" title="Close"><i data-lucide="x"></i></button></div><div class="window-context"><div><h2></h2><p></p></div><button class="window-follow" data-action="follow" title="Follow map geography, clue and time lens, or freeze this window"></button></div><div class="window-toolbar"><label>Region<select data-param="region" aria-label="Window region"></select></label><div class="window-options"></div><div class="window-stats"></div></div><div class="win-legend" aria-label="Chart legend"></div><div class="win-chart" role="img"></div><p class="win-caption"></p><div class="window-footer"><button class="button button-accent" data-action="collect"><i data-lucide="bookmark-plus"></i>Collect evidence</button><button class="button button-outline" data-action="png" title="Download chart, legend and methods as PNG"><i data-lucide="image-down"></i>PNG</button><button class="button button-outline" data-action="csv" title="Download the data plotted in this chart">CSV</button><button class="text-button" data-action="details">Method & uncertainty</button></div>`;
    layer.appendChild(el);
    const w = { id, el, state, follow, chart: null, index: i };
    windows.set(id, w);
    w.chart = createCharts(
      data,
      (year) => {
        w.state.year = year;
        w.state.quantity = "value";
        w.follow = false;
        render(w);
        onYear?.(year);
      },
      (rid) => {
        w.state.region = rid;
        w.follow = false;
        render(w);
        onRegion?.(rid);
      },
      el.querySelector(".win-chart"),
    );
    el.addEventListener("pointerdown", () => front(w));
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-action]")?.dataset.action;
      if (a) action(w, a);
    });
    el.addEventListener("change", (e) => {
      const param = e.target.dataset.param;
      if (!param) return;
      w.state[param] =
        e.target.type === "checkbox" ? e.target.checked : e.target.value;
      if (param === "region") w.follow = false;
      ensure(w.state);
      render(w);
      el.querySelector(`[data-param="${param}"]`)?.focus({
        preventScroll: true,
      });
    });
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        action(w, "close");
      }
    });
    const head = el.querySelector(".window-heading");
    head.addEventListener("pointerdown", (e) => {
      if (
        e.target.closest("button") ||
        innerWidth < 701 ||
        el.classList.contains("maximized")
      )
        return;
      drag(w, e, head);
    });
    el.querySelector(".move-handle").addEventListener("pointerdown", (e) => {
      if (innerWidth > 700 && !el.classList.contains("maximized"))
        drag(w, e, e.currentTarget);
    });
    el.querySelector(".move-handle").addEventListener("keydown", (e) => {
      const delta = {
        ArrowLeft: [-20, 0],
        ArrowRight: [20, 0],
        ArrowUp: [0, -20],
        ArrowDown: [0, 20],
      }[e.key];
      if (!delta || innerWidth < 701 || el.classList.contains("maximized"))
        return;
      e.preventDefault();
      moveTo(w, el.offsetLeft + delta[0], el.offsetTop + delta[1]);
    });
    render(w);
    front(w);
    updateTray();
    el.focus({ preventScroll: true });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      gsap.fromTo(
        el,
        { opacity: 0, y: 12, scale: 0.985 },
        { opacity: 1, y: 0, scale: 1, duration: 0.3, clearProps: "transform" },
      );
    iconize();
    return w;
  }
  function front(w) {
    w.el.style.zIndex = ++z;
  }
  function fit(w) {
    if (innerWidth < 701 || w.el.classList.contains("maximized")) return;
    const width = Math.min(w.el.offsetWidth, innerWidth - 28);
    w.el.style.width = width + "px";
    w.el.style.left =
      Math.max(14, Math.min(w.el.offsetLeft, innerWidth - width - 14)) + "px";
    w.el.style.top =
      Math.max(
        12,
        Math.min(w.el.offsetTop, layer.clientHeight - w.el.offsetHeight - 12),
      ) + "px";
    w.chart.resize();
  }
  window.addEventListener("resize", () => {
    for (const w of windows.values()) fit(w);
  });
  function moveTo(w, left, top) {
    w.el.style.left =
      Math.min(innerWidth - 140, Math.max(-w.el.offsetWidth + 140, left)) +
      "px";
    w.el.style.top = Math.min(layer.clientHeight - 43, Math.max(0, top)) + "px";
  }
  function drag(w, e, handle) {
    e.preventDefault();
    const x = e.clientX,
      y = e.clientY,
      left = w.el.offsetLeft,
      top = w.el.offsetTop;
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => moveTo(w, left + ev.clientX - x, top + ev.clientY - y);
    const end = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }
  function render(w) {
    const { el, state: s } = w;
    if (el.classList.contains("minimized")) return;
    ensure(s);
    const v = getVariable(data, s.variable),
      view = getView(data, s),
      copy = chartCopy(data, s),
      metric = analysisMetric(data, s);
    el.querySelector("h2").textContent =
      s.tab === "relationships"
        ? label(data, s.relationX) + " × " + label(data, s.relationY)
        : label(data, s.variable);
    el.querySelector(".window-context p").textContent =
      analysisContext(s) +
      (s.tab === "cycle"
        ? " · monthly distribution"
        : s.tab === "relationships"
          ? " · overlapping observations"
          : s.tab === "compare"
            ? " · each record keeps its own statistics"
            : view?.source === "supplied"
              ? " · supplied trend statistics"
              : " · recomputed view");
    const f = el.querySelector(".window-follow");
    f.classList.toggle("following", w.follow);
    f.innerHTML = `<i data-lucide="${w.follow ? "eye" : "pin"}"></i>${w.follow ? "Following map" : "Frozen selection"}`;
    f.setAttribute("aria-pressed", String(w.follow));
    el.querySelector('[data-param="region"]').innerHTML = options(
      data.regions.map((r) => [r.id, r.name]),
      s.region,
    );
    const controls = el.querySelector(".window-options");
    if (s.tab === "series")
      controls.innerHTML = `<label><input type="checkbox" data-param="anomaly" ${s.anomaly ? "checked" : ""}/>Show anomalies</label>`;
    else if (s.tab === "relationships") {
      const vars = data.interface.primaryVariables.map((v) => [v.id, v.label]);
      controls.innerHTML = `<div class="relationship-controls"><label>X<select data-param="relationX" aria-label="X variable">${options(vars, s.relationX)}</select></label><label>Y<select data-param="relationY" aria-label="Y variable">${options(vars, s.relationY)}</select></label><label><input type="checkbox" data-param="detrend" ${s.detrend ? "checked" : ""}/>Detrend</label></div>`;
    } else controls.innerHTML = "";
    el.querySelector(".window-stats").innerHTML =
      `<div><span class="metric-label">${esc(metric.label)}</span><strong>${fmt(metric.value, metric.dp, metric.signed)}</strong> <small>${esc(metric.unit)}</small></div><small class="metric-secondary">${esc(metric.secondary)}</small>`;
    el.querySelector(".win-legend").innerHTML = copy.legend
      .map(
        ([c, t]) =>
          `<span><b class="legend-stroke ${c}" ${c === "map" ? `style="background:${rampCSS(scaleDomain(data, s), s.palette)}"` : ""}></b>${esc(t)}</span>`,
      )
      .join("");
    el.querySelector(".win-caption").textContent =
      copy.note +
      (copy.interaction ? " " + copy.interaction : "") +
      (v.exploratory && s.tab !== "relationships"
        ? " Exploratory diagnostic, not a validated hazard index."
        : "");
    el.querySelector(".win-chart").setAttribute(
      "aria-label",
      `${TYPES[s.tab].name}: ${el.querySelector("h2").textContent}; ${getRegion(data, s.region).name}; ${analysisContext(s)}. ${metric.label}: ${fmt(metric.value, metric.dp, metric.signed)} ${metric.unit}. ${copy.note}`,
    );
    // Populate all surrounding text before measuring the flex chart area.
    w.chart.resize();
    w.chart.update(s);
    iconize();
  }
  function legendForExport(s) {
    const domain = scaleDomain(data, s),
      mapColors =
        domain[0] < 0 && domain[1] > 0
          ? PALETTES[s.palette].diverging
          : PALETTES[s.palette].colors;
    const colors = {
      "": "#6a7d86",
      fit: s.tab === "cycle" ? "#297e7c" : "#902d4b",
      band: s.tab === "cycle" ? "#b7cacc" : "#d6b8c4",
      cool: "#2a6684",
      warm: "#a52b45",
      zero: "#ece8e2",
      interval: "#576d76",
      association: "#9dabb0",
      map: PALETTES[s.palette].colors[1],
      year: "#7c8baf",
    };
    return chartCopy(data, s).legend.map(([kind, text]) => ({
      color: colors[kind],
      text,
      ramp:
        kind === "year"
          ? ["#bbd2cc", "#7c8baf", "#684c81"]
          : kind === "map"
            ? mapColors
            : undefined,
    }));
  }
  function action(w, a) {
    if (a === "close") {
      w.chart.dispose();
      w.el.remove();
      windows.delete(w.id);
      updateTray();
      document
        .querySelector(`[data-open-chart="${w.state.tab}"]`)
        ?.focus({ preventScroll: true });
    }
    if (a === "minimize") {
      w.el.classList.add("minimized");
      updateTray();
      document
        .querySelector(`[data-open-chart="${w.state.tab}"]`)
        ?.focus({ preventScroll: true });
    }
    if (a === "maximize") {
      w.el.classList.toggle("maximized");
      fit(w);
      w.el
        .querySelector('[data-action="maximize"]')
        .setAttribute(
          "aria-label",
          w.el.classList.contains("maximized")
            ? "Restore window size"
            : "Expand window",
        );
      w.chart.resize();
    }
    if (a === "clone") open(w.state.tab, { ...w.state }, { follow: false });
    if (a === "follow") {
      w.follow = !w.follow;
      if (w.follow) assignMap(w);
      render(w);
      updateTray();
    }
    if (a === "collect") {
      w.chart.chart.getZr().flush();
      let image = "";
      try {
        image = w.chart.chart.getDataURL({
          type: "jpeg",
          pixelRatio: 0.7,
          backgroundColor: "#fff",
        });
      } catch {}
      onCollect({
        ...statsSnapshot(data, w.state),
        kind: w.state.tab,
        title: w.el.querySelector("h2").textContent,
        image,
        typeName: TYPES[w.state.tab].name,
        color: TYPES[w.state.tab].color,
      });
    }
    if (a === "details") onDetails(w.state);
    if (a === "png") {
      const s = w.state,
        v = getVariable(data, s.variable),
        t = TYPES[s.tab];
      try {
        download(
          `TRACE-${s.region}-${s.variable}-${s.tab}.png`,
          w.chart.exportPNG({
            title: w.el.querySelector("h2").textContent,
            subtitle: `${getRegion(data, s.region).name} · ${analysisContext(s)} · ${t.name} · ${s.tab === "relationships" ? "x: " + getVariable(data, s.relationX).unit + "; y: " + getVariable(data, s.relationY).unit : s.tab === "compare" ? unit(v, s.quantity === "trend") : v.unit}`,
            legend: legendForExport(s),
            notes: [
              chartCopy(data, s).note,
              statNote(data, s),
              ...(v.exploratory && s.tab !== "relationships"
                ? [
                    "Exploratory frequency diagnostic, not a validated hazard index.",
                  ]
                : []),
              "Source inputs: supplied Giovanni-derived CSV archive. Wilaya administrative display areas (2017), not verified extraction footprints or within-area climate pixels. Definitions and source-family limitations: TRACE field guide.",
            ],
          }),
          "image/png",
        );
      } catch (error) {
        toast("PNG export failed. The CSV remains available.");
        console.error(error);
      }
    }
    if (a === "csv")
      download(
        `TRACE-${w.state.region}-${w.state.variable}-${w.state.tab}.csv`,
        chartCSV(data, w.state),
        "text/csv",
      );
  }
  function updateTray() {
    tray.innerHTML = [...windows.values()]
      .filter((w) => w.el.classList.contains("minimized"))
      .map(
        (w) =>
          `<button data-restore="${w.id}">${esc(TYPES[w.state.tab].name)} · ${esc(getRegion(data, w.state.region).name)} ↗</button>`,
      )
      .join("");
    document
      .querySelectorAll(".evidence-dock [data-open-chart]")
      .forEach((b) => {
        const open = [...windows.values()].some(
          (w) => w.state.tab === b.dataset.openChart,
        );
        b.classList.toggle("is-open", open);
        b.setAttribute("aria-pressed", String(open));
      });
  }
  function restore(w) {
    w.el.classList.remove("minimized");
    render(w);
    front(w);
    updateTray();
    w.el.focus({ preventScroll: true });
  }
  tray.addEventListener("click", (e) => {
    const id = e.target.closest("[data-restore]")?.dataset.restore,
      w = windows.get(id);
    if (w) restore(w);
  });
  function assignMap(w) {
    const s = getState();
    for (const k of [
      "variable",
      "region",
      "period",
      "season",
      "quantity",
      "year",
      "palette",
      "supportedOnly",
    ])
      w.state[k] = s[k];
    ensure(w.state);
  }
  return {
    open,
    sync() {
      for (const w of windows.values())
        if (w.follow) {
          assignMap(w);
          render(w);
        }
      updateTray();
    },
    get windows() {
      return windows;
    },
    get count() {
      return windows.size;
    },
    minimizeAll() {
      for (const w of windows.values()) w.el.classList.add("minimized");
      updateTray();
    },
  };
}

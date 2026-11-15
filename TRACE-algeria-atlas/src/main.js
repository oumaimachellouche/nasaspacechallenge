import "./styles.css";
import { gsap } from "gsap";
import { iconize } from "./icons.js";
import { createAtlasMap } from "./map.js";
import { layerStyle, patternURL } from "./map-layers.js";
import { createWindowManager } from "./windows.js";
import {
  PALETTES,
  colorFor,
  esc,
  fmt,
  fmtP,
  decimals,
  getVariable,
  getView,
  getRegion,
  scaleDomain,
  rampCSS,
  download,
  getBaseline,
} from "./data.js";
import {
  TYPES,
  SEASONS,
  primary,
  recipe,
  label,
  shortCode,
  unit,
  timeText,
  analysisContext,
  analysisMetric,
  cycleData,
  comparisonData,
  stripeData,
  dependenceNote,
  quantityText,
  selectionValue,
  describe,
  signal,
  statsSnapshot,
  statNote,
} from "./field.js";
const $ = (id) => document.getElementById(id);
let DATA,
  map,
  manager,
  activePanel = null,
  toastTimer,
  playing = null,
  mapTool = null,
  tilted = false,
  is3D = true,
  board = [];
const boardKey = "trace-board-v2";
let boardSort = "manual";
const state = {
  region: "Oran_West",
  variable: "T2M",
  period: "1984-2024",
  season: "annual",
  quantity: "trend",
  year: 2024,
  palette: 0,
  supportedOnly: false,
  tab: "series",
  anomaly: false,
  relationX: "T2M",
  relationY: "VPD_kpa",
  detrend: false,
};

async function init() {
  iconize();
  try {
    const res = await fetch("/api/atlas", {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw Error();
    DATA = await res.json();
    $("dataConnection").textContent = "ARCHIVE API CONNECTED";
  } catch {
    const res = await fetch("/data/atlas.json");
    if (!res.ok) throw Error("Prepared data could not be loaded.");
    DATA = await res.json();
    $("dataConnection").textContent = "LOCAL ARCHIVE";
  }
  if (!DATA.interface)
    throw Error("Regenerate the map-first archive with npm run data:prepare.");
  readURL();
  try {
    const stored = JSON.parse(localStorage.getItem(boardKey) || "[]");
    board = Array.isArray(stored)
      ? stored
          .filter(
            (r) =>
              r &&
              typeof r.id === "string" &&
              r.selection &&
              Object.hasOwn(TYPES, r.kind) &&
              availableIds().includes(r.selection.variable) &&
              getView(DATA, r.selection) &&
              getRegion(DATA, r.selection.region) &&
              [
                "T2M",
                "VPD_kpa",
                "P_minus_E",
                "PRECTOTCORR_m2",
                "PRECIP_gpm",
                "SWGDN",
                "AOD_total",
              ].includes(r.selection.relationX) &&
              [
                "T2M",
                "VPD_kpa",
                "P_minus_E",
                "PRECTOTCORR_m2",
                "PRECIP_gpm",
                "SWGDN",
                "AOD_total",
              ].includes(r.selection.relationY),
          )
          .map((r) => ({
            ...r,
            metric:
              r.metric || analysisMetric(DATA, { ...r.selection, tab: r.kind }),
            context:
              r.context || analysisContext({ ...r.selection, tab: r.kind }),
          }))
      : [];
    boardSort = localStorage.getItem("trace-board-sort-v2") || "manual";
    if (!["manual", "newest", "region", "type", "variable"].includes(boardSort))
      boardSort = "manual";
  } catch {}
  manager = createWindowManager(DATA, {
    getState: () => ({ ...state }),
    onYear: (year) => {
      state.year = year;
      state.quantity = "value";
      update();
    },
    onRegion: (rid) => selectRegion(rid, false),
    onCollect: collect,
    onDetails: showAnalysisDetails,
    toast,
  });
  bind();
  map = await createAtlasMap(
    DATA,
    (rid) => selectRegion(rid),
    (text) => {
      $("terrainStatus").textContent = text;
      if (text.startsWith("2D FALLBACK"))
        for (const id of [
          "tiltButton",
          "projectionButton",
          "probeButton",
          "measureButton",
          "northButton",
          "zoomIn",
          "zoomOut",
        ])
          $(id).disabled = true;
    },
  );
  update();
  updateBoardCount();
  iconize();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches)
    $("startup").remove();
  else
    gsap.to("#startup", {
      opacity: 0,
      duration: 0.35,
      onComplete: () => $("startup")?.remove(),
    });
  window.__TRACE__ = {
    data: DATA,
    state,
    selectVariable,
    selectRegion,
    map,
    manager,
    get board() {
      return board;
    },
    get chart() {
      return [...manager.windows.values()][0]?.chart.chart;
    },
  };
}
function availableIds() {
  return [
    ...DATA.interface.primaryVariables.map((v) => v.id),
    ...DATA.interface.caseIds,
  ];
}
function ensure() {
  const m = getVariable(DATA, state.variable);
  if (m.start === 2001 && state.period === "1984-2024") {
    state.period = "2001-2024";
    toast(
      "This record starts in 2001. The time lens now uses the actual overlap.",
    );
  }
  const v = getView(DATA, state);
  if (v && !v.series.some((p) => p[0] === state.year)) state.year = v.end;
}
function update(repanel = false) {
  ensure();
  const v = getVariable(DATA, state.variable),
    p = primary(DATA, state.variable),
    r = recipe(DATA, state.variable),
    domain = scaleDomain(DATA, state);
  $("activeName").textContent = label(DATA, state.variable);
  $("activeContext").textContent =
    `${SEASONS[state.season]} · ${quantityText(state).toLowerCase()}`;
  $("activeClue").querySelector(".clue-dot").style.background =
    p?.color || r?.color || "#9a3e46";
  $("timeSummary").textContent = state.period.replace("-", "—");
  $("legendTitle").textContent =
    state.quantity === "trend"
      ? "Change over 10 years"
      : r?.kind === "joint_event" && state.quantity === "mean"
        ? "Months meeting every condition"
        : r?.kind === "product_difference"
          ? "IMERG minus MERRA-2"
          : state.quantity === "mean"
            ? "Average conditions"
            : String(state.year) + " conditions";
  $("legendRamp").style.background = rampCSS(domain, state.palette);
  $("legendMin").textContent = fmt(
    domain[0],
    Math.min(4, decimals(v, state.quantity === "trend")),
  );
  $("legendMax").textContent = fmt(
    domain[1],
    Math.min(4, decimals(v, state.quantity === "trend")),
  );
  $("legendUnit").textContent = unit(v, state.quantity === "trend");
  $("legendNote").textContent =
    (r?.kind === "joint_event"
      ? "Exploratory frequency, not a hazard score. "
      : state.variable === "AOD_total"
        ? "Lower AOD means less column extinction, not measured visibility. "
        : "") +
    "Wilaya display areas (2017), not extraction footprints. No within-area climate detail." +
    (state.quantity === "trend"
      ? " Faded fill / dashed border: trend rule not passed."
      : "");
  const style = layerStyle(state.variable),
    areaOptions = map?.regionSettings;
  const textured =
    areaOptions?.textures !== false &&
    map?.regionalLayer.texturesAvailable !== false;
  $("textureName").textContent =
    map?.regionalLayer.status === "unavailable"
      ? "Area layer unavailable"
      : !areaOptions?.regions
        ? "Area fills hidden"
        : textured
          ? style.texture
          : "Solid regional fill";
  $("textureSwatch").style.backgroundImage =
    `url("${patternURL(textured ? style.pattern : "solid", colorFor((domain[0] + domain[1]) / 2, domain, state.palette))}")`;
  $("textureMeaning").textContent =
    "Texture = lens identity · color = numerical value";
  document
    .querySelectorAll("#legendQuantity button")
    .forEach((b) =>
      b.setAttribute(
        "aria-pressed",
        String(b.dataset.mapQuantity === state.quantity),
      ),
    );
  if (map?.regionalLayer.status === "unavailable")
    $("footprintNote").innerHTML =
      "Wilaya display layer unavailable · regional labels retained <i data-lucide='info'></i>";
  if (repanel && activePanel) renderPanel(activePanel);
  if ($("yearPicker")) {
    $("yearPicker").value = state.year;
    $("yearOutput").textContent = state.year;
  }
  if (!$("siteInspector").hidden) renderInspector();
  map?.update(state);
  manager?.sync();
  iconize();
}
function selectVariable(id) {
  if (!availableIds().includes(id)) return;
  stopPlay();
  state.variable = id;
  const r = recipe(DATA, id);
  if (DATA.interface.caseIds.includes(id)) {
    state.quantity = "trend";
    state.palette = layerStyle(id).palette;
    if (r.inputs.length > 1) {
      state.relationX = r.inputs[0];
      state.relationY = r.inputs[1];
    }
  }
  closePanel();
  update();
  if (DATA.interface.caseIds.includes(id)) {
    toast(
      `${r.title} mapped. Color shows change over 10 years; texture identifies the lens. Switch to Average for frequency or product difference.`,
    );
  }
}
function selectRegion(id, inspect = true) {
  if (!getRegion(DATA, id)) return;
  state.region = id;
  if (inspect) $("siteInspector").hidden = false;
  update();
}
function toast(message) {
  clearTimeout(toastTimer);
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}
function showDialog(title, content, eyebrow = "FIELD GUIDE") {
  $("dialogTitle").textContent = title;
  $("dialogEyebrow").textContent = eyebrow;
  $("dialogContent").innerHTML = content;
  if (!$("infoDialog").open) $("infoDialog").showModal();
  $("dialogContent").scrollTop = 0;
  iconize();
}
function closePanel() {
  activePanel = null;
  $("toolPanel").hidden = true;
  document.querySelectorAll("[data-panel]").forEach((b) => {
    b.classList.remove("active");
    b.setAttribute("aria-expanded", "false");
  });
  map?.requestRender();
}
function openPanel(name) {
  if (activePanel === name) {
    closePanel();
    return;
  }
  activePanel = name;
  renderPanel(name);
  $("toolPanel").hidden = false;
  document.querySelectorAll("[data-panel]").forEach((b) => {
    b.classList.toggle("active", b.dataset.panel === name);
    b.setAttribute("aria-expanded", String(b.dataset.panel === name));
  });
  map?.requestRender();
}
function renderPanel(name) {
  const titles = {
    clues: ["CHOOSE A LINE OF EVIDENCE", "The clues"],
    combine: ["TWO OR THREE INPUTS / NO ARBITRARY SCORE", "Combine the clues"],
    time: ["ONE TIME LENS / ALL THE LOGIC", "Look through time"],
    map: ["GEOGRAPHIC CONTEXT, NOT CLIMATE RASTERS", "Map layers"],
  };
  $("panelEyebrow").textContent = titles[name][0];
  $("panelTitle").textContent = titles[name][1];
  const html = {
    clues: () =>
      `<p class="panel-intro">Seven focused records. Start with a question, then follow the signal.</p>${DATA.interface.primaryVariables.map((v) => `<button class="clue-option ${state.variable === v.id ? "selected" : ""}" data-variable="${v.id}" style="--clue:${v.color}"><span class="clue-symbol"><i data-lucide="${v.icon}"></i></span><span><strong>${esc(v.label)}</strong><small>${esc(v.subtitle)}</small></span></button>`).join("")}<label class="form-label" for="regionPicker">Jump to a regional record</label><select id="regionPicker" style="width:100%;padding:9px;border:1px solid #ccd8c2;border-radius:4px;background:white;font-size:11px">${DATA.regions.map((r) => `<option value="${r.id}" ${r.id === state.region ? "selected" : ""}>${esc(r.name)} · ${esc(r.subtitle)}</option>`).join("")}</select><p class="time-explanation">Water balance replaces the unavailable GWETROOT. It is not soil wetness. “Clarity” uses aerosol optical depth, not a visibility measurement.</p><button class="text-button" data-show="sources">Original names, sources & definitions →</button>`,
    combine: () =>
      `<p class="panel-intro">Map the fraction of months that meet explicit conditions—or the difference between two rainfall estimates.</p>${DATA.interface.caseIds
        .map((id, i) => {
          const r = recipe(DATA, id);
          return `<button class="case-option ${state.variable === id ? "selected" : ""}" data-variable="${id}" style="--case:${r.color}"><span class="case-kicker"><span class="case-texture" style="background-image:url('${patternURL(layerStyle(id).pattern, r.color)}')" aria-hidden="true"></span>${r.kind === "joint_event" ? "JOINT-CONDITION LAYER" : "RAINFALL COMPARISON"}<span>${r.inputs.length} CLUES</span></span><strong>${esc(r.title)}</strong><p>${esc(r.subtitle)}</p><span class="case-inputs">${r.inputs.map((v) => `<span>${esc(shortCode(DATA, v))}</span>`).join("")}</span></button>`;
        })
        .join(
          "",
        )}<p class="time-explanation">Thresholds are fixed to 1991–2020, separately by site and calendar month. No co-occurrence is presented as causal attribution.</p>`,
    time: () =>
      `<p class="panel-intro">Choose what you want to notice. The period, season and rate live together here.</p><label class="form-label">What are you looking for?</label><div class="segmented">${[
        ["trend", "Follow<br/>change"],
        ["mean", "Typical<br/>conditions"],
        ["value", "Inspect<br/>a year"],
      ]
        .map(
          ([id, t]) =>
            `<button data-quantity="${id}" class="${state.quantity === id ? "active" : ""}">${t}</button>`,
        )
        .join(
          "",
        )}</div><label class="form-label">Open the record</label><div class="segmented">${["1984-2024", "2001-2024"].map((p) => `<button data-period="${p}" class="${state.period === p ? "active" : ""}" ${getVariable(DATA, state.variable).start === 2001 && p === "1984-2024" ? "disabled" : ""}>${p.replace("-", "–")}</button>`).join("")}</div><label class="form-label">Which part of the year?</label><div class="season-pills">${Object.entries(
        SEASONS,
      )
        .map(
          ([id, n]) =>
            `<button data-season="${id}" class="${state.season === id ? "active" : ""}">${n}</button>`,
        )
        .join(
          "",
        )}</div>${state.quantity === "value" ? `<div class="time-scrub"><button id="playButton" class="icon-button" aria-label="${playing ? "Pause" : "Play"} yearly observations"><i data-lucide="${playing ? "pause" : "play"}"></i></button><input id="yearPicker" type="range" min="${getView(DATA, state).start}" max="2024" value="${state.year}" aria-label="Inspection year"/><output id="yearOutput">${state.year}</output></div>` : ""}<p class="time-explanation">${state.quantity === "trend" ? "“Change over 10 years” is the fitted yearly slope × 10. It is a rate, not the difference between the first and last observations." : state.quantity === "mean" ? "Typical conditions average the complete yearly or seasonal summaries in this window." : "Scrub through actual yearly or seasonal values. No missing years are invented."} Whole-year values are monthly arithmetic means—not annual rainfall totals.</p><p class="time-explanation">${state.season === "DJF" ? "Winter requires December + January + February. Incomplete boundary winters are omitted. " : ""}Anomaly reference: ${getBaseline(DATA, state).label}.</p>`,
    map: () => {
      const s = map?.layerSettings || {
        terrain: true,
        labels: true,
        opacity: 1,
      };
      const a = map?.regionSettings || {
        regions: true,
        textures: true,
        fillOpacity: 0.58,
      };
      return `<p class="panel-intro">Click or hover over real wilaya display areas. Color repeats the regional summary; texture identifies the selected lens—not climate detail within the area.</p><div class="map-area-status" id="areaLayerStatus">${map?.regionalLayer.status === "ready" ? "6 WILAYA DISPLAY AREAS · FIXED 2017 SNAPSHOT" : "WILAYA DISPLAY LAYER UNAVAILABLE"}</div><label class="panel-setting">Wilaya areas & borders<input id="regionSetting" type="checkbox" ${a.regions ? "checked" : ""} ${map?.regionalLayer.status !== "ready" ? "disabled" : ""}/></label><label class="panel-setting">Named layer textures<input id="textureSetting" type="checkbox" ${a.textures ? "checked" : ""}/></label><label class="panel-setting">Area opacity<input id="areaOpacitySetting" type="range" min="10" max="90" value="${Math.round(a.fillOpacity * 100)}"/></label><p class="panel-intro">Use the globe to investigate geographic context. The records remain six regional summaries—not detailed climate pixels.</p><label class="panel-setting">Context imagery<select id="imagerySetting" ${map?.fallback ? "disabled" : ""}><option value="nasa" ${map?.imagery === "nasa" ? "selected" : ""}>NASA Blue Marble</option><option value="natural" ${map?.imagery === "natural" ? "selected" : ""}>Local Natural Earth</option></select></label><label class="panel-setting">Real terrain<input id="terrainSetting" type="checkbox" ${map?.fallback ? "disabled" : ""} ${s.terrain ? "checked" : ""}/></label><label class="panel-setting">Study labels<input id="labelSetting" type="checkbox" ${s.labels ? "checked" : ""}/></label><label class="panel-setting">Label / point opacity<input id="opacitySetting" type="range" min="25" max="100" value="${s.opacity * 100}"/></label><label class="panel-setting">Only stronger trend signals<input id="supportSetting" type="checkbox" ${state.supportedOnly ? "checked" : ""} ${state.quantity !== "trend" ? "disabled" : ""}/></label><p class="time-explanation">${map?.fallback ? "WebGL or the SDK is unavailable. A labelled geographic 2D fallback is in use." : map?.terrainReady ? "A real elevation provider is available. Tilt the view or fly to a study area to see relief." : "The map uses the ellipsoid while real elevation is loading or unavailable."}</p><button class="text-button" data-show="footprints">About the wilaya display boundaries →</button>`;
    },
  };
  $("panelContent").innerHTML = html[name]();
  iconize();
}
function renderInspector() {
  const r = getRegion(DATA, state.region),
    v = getVariable(DATA, state.variable),
    view = getView(DATA, state),
    rec = recipe(DATA, state.variable),
    value = selectionValue(DATA, state);
  let interpretation = signal(DATA, state);
  if (rec?.kind === "joint_event" && state.quantity !== "trend")
    interpretation = `${Math.round((value / 100) * (state.quantity === "value" ? 1 : view.n) * (state.season === "annual" ? 12 : 3))} of ${(state.quantity === "value" ? 1 : view.n) * (state.season === "annual" ? 12 : 3)} complete months meet every condition. Exploratory frequency, not a hazard index.`;
  if (rec?.kind === "product_difference" && state.quantity !== "trend")
    interpretation = `IMERG estimates ${value >= 0 ? "more" : "less"} rainfall than MERRA-2 in this time lens. Difference, not bias against a ground-truth reference.`;
  $("siteInspector").innerHTML =
    `<div class="inspector-top"><span>${r.code}</span><h2>${esc(r.name)}</h2><button class="icon-button" data-inspect="close" aria-label="Close region card"><i data-lucide="x"></i></button></div><p class="inspector-subtitle">${esc(timeText(state))}</p><div class="inspector-value">${fmt(value, decimals(v, state.quantity === "trend"), state.quantity === "trend")}<small>${esc(unit(v, state.quantity === "trend"))}</small></div><p class="signal-copy ${view.supported ? "supported" : ""}">${esc(interpretation)}</p>${rec?.kind === "joint_event" ? `<div class="inspector-logic">${rec.tests.map(([id, op, q]) => esc(shortCode(DATA, id) + " " + op + " P" + Math.round(q * 100))).join(" AND ")}<small>Fixed local calendar-month thresholds · 1991–2020</small><small style="display:block;margin-top:4px;color:#6a7d86">${rec.tests.map(([id, op, q]) => `${esc(getVariable(DATA, id).short || id)} ${esc(op)} P${Math.round(q * 100)}: ${esc(getVariable(DATA, id).name)} exceeds its ${Math.round(q * 100)}th-percentile threshold for that calendar month`).join("; ")}. Both conditions must be true simultaneously (compound event). Each threshold is computed locally from the 1991–2020 reference period.</small></div>` : ""}${DATA.interface.caseIds.includes(state.variable) ? `<div class="input-breakdown">${rec.inputs.map((id) => `<span>${esc(label(DATA, id))}: ${esc(describe(DATA, { ...state, variable: id }))}</span>`).join("")}</div><p class="input-footnote">Input summaries in this time lens—not event thresholds.</p>` : ""}<div class="inspector-actions"><button class="button button-dark" data-open-chart="series">Open record <i data-lucide="arrow-up-right"></i></button><button class="button button-outline" data-inspect="fly"><i data-lucide="locate-fixed"></i>Fly to area</button></div><button class="text-button" style="font-size:10px;margin-top:10px" data-show="layer">Definition & interpretation →</button>`;
  iconize();
}
function bind() {
  $("activeClue").onclick = () => openPanel("clues");
  $("timeButton").onclick = () => openPanel("time");
  $("closePanel").onclick = closePanel;
  document
    .querySelectorAll("[data-panel]")
    .forEach((b) => (b.onclick = () => openPanel(b.dataset.panel)));
  document.addEventListener("click", (e) => {
    const b = e.target.closest(
      "[data-variable],[data-period],[data-season],[data-quantity],[data-map-quantity],[data-open-chart],[data-show],[data-inspect]",
    );
    if (!b) return;
    if (b.dataset.variable) selectVariable(b.dataset.variable);
    if (b.dataset.period) {
      state.period = b.dataset.period;
      update(true);
    }
    if (b.dataset.season) {
      state.season = b.dataset.season;
      update(true);
    }
    if (b.dataset.mapQuantity) {
      state.quantity = b.dataset.mapQuantity;
      if (state.quantity !== "value") stopPlay();
      update(true);
    }
    if (b.dataset.quantity) {
      state.quantity = b.dataset.quantity;
      if (state.quantity !== "value") stopPlay();
      update(true);
    }
    if (b.dataset.openChart) {
      closePanel();
      manager.open(b.dataset.openChart);
    }
    if (b.dataset.show === "sources") showSources();
    if (b.dataset.show === "footprints") showFootprints();
    if (b.dataset.show === "layer") showLayer();
    if (b.dataset.inspect === "close") {
      $("siteInspector").hidden = true;
      map.requestRender();
    }
    if (b.dataset.inspect === "fly") {
      map.focus(state.region);
      tilted = false;
      $("tiltButton").setAttribute("aria-pressed", "false");
    }
  });
  $("panelContent").addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "regionPicker") selectRegion(t.value);
    if (t.id === "imagerySetting") map.settings({ imagery: t.value });
    if (t.id === "terrainSetting") map.settings({ terrain: t.checked });
    if (t.id === "labelSetting") map.settings({ labels: t.checked });
    if (t.id === "regionSetting") {
      map.settings({ regions: t.checked });
      update();
    }
    if (t.id === "textureSetting") {
      map.settings({ textures: t.checked });
      update();
    }
    if (t.id === "supportSetting") {
      state.supportedOnly = t.checked;
      update();
    }
  });
  $("panelContent").addEventListener("input", (e) => {
    if (e.target.id === "yearPicker") {
      state.year = +e.target.value;
      update();
    }
    if (e.target.id === "opacitySetting")
      map.settings({ opacity: +e.target.value / 100 });
    if (e.target.id === "areaOpacitySetting")
      map.settings({ fillOpacity: +e.target.value / 100 });
  });
  $("panelContent").addEventListener("click", (e) => {
    if (e.target.closest("#playButton")) togglePlay();
  });
  $("mapHome").onclick = () => {
    map.home();
    tilted = false;
    $("tiltButton").setAttribute("aria-pressed", "false");
  };
  $("zoomIn").onclick = () => map.zoom(1);
  $("zoomOut").onclick = () => map.zoom(-1);
  $("tiltButton").onclick = () => {
    tilted = !tilted;
    $("tiltButton").setAttribute("aria-pressed", String(tilted));
    map.tilt(tilted);
  };
  $("northButton").onclick = () => map.north();
  $("projectionButton").onclick = () => {
    is3D = !is3D;
    tilted = false;
    $("tiltButton").setAttribute("aria-pressed", "false");
    $("tiltButton").disabled = !is3D;
    map.mode(is3D);
    $("projectionButton").textContent = is3D ? "3D" : "2D";
    $("projectionButton").setAttribute(
      "aria-label",
      is3D ? "Switch to 2D" : "Switch to 3D",
    );
  };
  $("probeButton").onclick = () => selectTool("probe");
  $("measureButton").onclick = () => selectTool("measure");
  $("legendInfo").onclick = () => showLayer();
  $("paletteButton").onclick = () => {
    state.palette = (state.palette + 1) % PALETTES.length;
    update();
  };
  $("footprintNote").onclick = showFootprints;
  $("helpButton").onclick = showSources;
  $("shareButton").onclick = shareView;
  $("closeDialog").onclick = () => $("infoDialog").close();
  $("boardButton").onclick = openBoard;
  $("closeBoard").onclick = () => $("boardDialog").close();
  $("boardSort").onchange = (e) => {
    boardSort = e.target.value;
    try {
      localStorage.setItem("trace-board-sort-v2", boardSort);
    } catch {}
    renderBoard();
  };
  $("exportBoard").onclick = () =>
    download(
      "TRACE-evidence-board.json",
      JSON.stringify(
        {
          schemaVersion: 2,
          project: "TRACE Field Atlas",
          exportedAt: new Date().toISOString(),
          caveat:
            "Regional records displayed on administrative proxy areas; wilaya display polygons are not verified extraction footprints.",
          records: board.map(({ image, ...r }) => r),
        },
        null,
        2,
      ),
      "application/json",
    );
  $("clearBoard").onclick = () => {
    if (!board.length) return;
    showDialog(
      "Clear the evidence board?",
      '<p>This removes the cards stored in this browser. Export them first if you want a permanent record.</p><button id="confirmClear" class="button button-accent">Clear cards</button>',
      "NOTEBOOK CONTROL",
    );
    $("confirmClear").onclick = () => {
      board = [];
      persist();
      renderBoard();
      $("infoDialog").close();
    };
  };
  $("boardCards").addEventListener("input", (e) => {
    if (e.target.dataset.note) {
      const r = board.find((r) => r.id === e.target.dataset.note);
      if (r) {
        r.note = e.target.value.slice(0, 3000);
        persist();
      }
    }
  });
  $("boardCards").addEventListener("click", (e) => {
    const b = e.target.closest("[data-card-action]");
    if (!b) return;
    const id = b.closest(".board-card").dataset.card,
      rec = board.find((r) => r.id === id);
    if (!rec) return;
    const a = b.dataset.cardAction;
    if (a === "revisit") {
      $("boardDialog").close();
      manager.open(rec.kind, rec.selection, { follow: false });
      return;
    }
    if (a === "map") {
      $("boardDialog").close();
      stopPlay();
      for (const k of Object.keys(state))
        if (k in rec.selection) state[k] = rec.selection[k];
      update();
      return;
    }
    if (a === "up" || a === "down") {
      board = orderedBoard();
      boardSort = "manual";
    }
    const i = board.findIndex((r) => r.id === id);
    if (a === "remove") board.splice(i, 1);
    if (a === "up" && i > 0)
      [board[i - 1], board[i]] = [board[i], board[i - 1]];
    if (a === "down" && i < board.length - 1)
      [board[i], board[i + 1]] = [board[i + 1], board[i]];
    persist();
    renderBoard();
  });
  let dragged = null;
  $("boardCards").addEventListener("dragstart", (e) => {
    const c = e.target.closest(".board-card");
    if (!c || e.target.closest("textarea,button")) {
      e.preventDefault();
      return;
    }
    dragged = c.dataset.card;
    c.classList.add("dragging");
    e.dataTransfer.setData("text/plain", dragged);
    e.dataTransfer.effectAllowed = "move";
  });
  $("boardCards").addEventListener("dragover", (e) => {
    const c = e.target.closest(".board-card");
    if (c && dragged && c.dataset.card !== dragged) {
      e.preventDefault();
      c.classList.add("drag-over");
    }
  });
  $("boardCards").addEventListener("dragleave", (e) =>
    e.target.closest(".board-card")?.classList.remove("drag-over"),
  );
  $("boardCards").addEventListener("drop", (e) => {
    e.preventDefault();
    const target = e.target.closest(".board-card")?.dataset.card,
      from = board.findIndex((r) => r.id === dragged),
      to = board.findIndex((r) => r.id === target);
    if (from >= 0 && to >= 0 && from !== to) {
      const [r] = board.splice(from, 1);
      board.splice(to, 0, r);
      boardSort = "manual";
      persist();
      renderBoard();
    }
    dragged = null;
  });
  $("boardCards").addEventListener("dragend", () => {
    dragged = null;
    document
      .querySelectorAll(".dragging,.drag-over")
      .forEach((el) => el.classList.remove("dragging", "drag-over"));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("infoDialog").open && !$("boardDialog").open) {
      closePanel();
      selectTool(null);
      stopPlay();
      $("siteInspector").hidden = true;
      map.requestRender();
    }
  });
}
function selectTool(tool) {
  mapTool = mapTool === tool ? null : tool;
  if (!mapTool) $("geoReadout").hidden = true;
  for (const id of ["probe", "measure"])
    $(id + "Button").setAttribute("aria-pressed", String(mapTool === id));
  document.body.classList.toggle("view-cursor", !!mapTool);
  $("mapNotice").hidden = !mapTool;
  $("mapNotice").textContent =
    mapTool === "measure"
      ? "Click two positions to measure an ellipsoidal geodesic. This does not define a sampling footprint."
      : "Click the map for geographic context. Climate values are only available at the six regional summaries.";
  map?.tool(mapTool, (info) => {
    $("geoReadout").hidden = false;
    $("geoReadout").innerHTML =
      `<strong>${esc(info.title)}</strong><br/>${esc(info.detail)} <button id="closeGeo" aria-label="Close geographic readout">×</button>`;
    $("closeGeo").onclick = () => {
      $("geoReadout").hidden = true;
      selectTool(null);
    };
  });
}
function stopPlay() {
  if (playing) clearInterval(playing);
  playing = null;
  const b = $("playButton");
  if (b) {
    b.setAttribute("aria-label", "Play yearly observations");
    b.innerHTML = '<i data-lucide="play"></i>';
    iconize();
  }
}
function togglePlay() {
  if (playing) {
    stopPlay();
    renderPanel("time");
    return;
  }
  if (state.year >= 2024) state.year = getView(DATA, state).start;
  state.quantity = "value";
  update();
  playing = setInterval(() => {
    state.year++;
    if (state.year > 2024) {
      state.year = 2024;
      stopPlay();
      renderPanel("time");
    }
    update();
  }, 950);
  renderPanel("time");
}
function showFootprints() {
  showDialog(
    "Display areas are not data footprints.",
    '<p>The six regional records now use <strong>real wilaya administrative polygons as user-approved display areas</strong>. You can select an area directly. This does <strong>not</strong> establish that the supplied climate record was extracted over that entire wilaya.</p><p>The bundled geoBoundaries / OpenStreetMap geometry is a fixed <strong>2017, 48-unit snapshot</strong>. It is not a time-varying boundary model or certification of current legal divisions. The six selected polygons retain the upstream simplified coordinates and holes; interior label positions are display locations, not measurements.</p><p>One color repeats the same summary uniformly across its display area. Texture identifies the named lens; it does not encode within-region climate detail, event locations or uncertainty. Faded fills and dashed outlines identify trends that fail the stated rule.</p><div class="callout">Original Giovanni extraction polygons/bounds are still required for verified data-coverage geography. No climate values are interpolated between or within these six areas.</div><p>Boundary source: geoBoundaries / William &amp; Mary geoLab; © OpenStreetMap contributors; Wambacher. ODbL 1.0.</p><div class="source-links"><a href="/data/study-wilayas.geojson" download>Six display areas · GeoJSON ↗</a><a href="/data/wilaya-display-metadata.json" target="_blank" rel="noopener">Source, vintage, hashes &amp; limitations ↗</a><a href="/data/geography/geoBoundaries-DZA-ADM1-2017.geojson" download>Unchanged upstream 48-unit snapshot ↗</a><a href="/licenses/geoBoundaries-ODbL-1.0.txt" target="_blank" rel="noopener">ODbL license ↗</a></div>',
    "GEOGRAPHIC LIMIT",
  );
}
function showLayer(id = state.variable) {
  const v = getVariable(DATA, id),
    r = recipe(DATA, id),
    p = primary(DATA, id);
  showDialog(
    label(DATA, id),
    `<p>${esc(r?.question || v.description)}</p>${r ? `<div class="formula">${esc(r.formula)}</div><p><strong>Scientific diagnostic:</strong> ${esc(r.scientificName || v.name)}<br/><strong>Inputs:</strong> ${r.inputs.map((id) => esc(getVariable(DATA, id).name)).join(" + ")}<br/><strong>Units:</strong> ${esc(r.unit)}<br/><strong>Reference:</strong> ${esc(r.baseline || "Physical definition; supplied monthly values")}</p><div class="callout">${esc(r.caution)}</div>` : `<p><strong>Original quantity:</strong> ${esc(v.name)}<br/><strong>Source family:</strong> ${esc(v.dataset)}<br/><strong>Units:</strong> ${esc(v.unit)} · Available ${v.start}–2024</p>`}${id === "AOD_total" ? '<div class="callout">“Clarity clue” is a plain-language reading aid for aerosol optical depth. Lower AOD means less column aerosol extinction. It is not measured visibility, a complete sky-clarity index, PM2.5 or a health-risk score.</div>' : ""}${id === "P_minus_E" ? '<div class="callout">This available water-budget proxy replaces the missing GWETROOT by agreement. It is not root-zone soil wetness and cannot be interpreted as such.</div>' : ""}${r?.kind === "joint_event" ? "<p>At each site, thresholds are computed independently for every calendar month from the 30 observations in 1991–2020, using linearly interpolated quantiles. Strict inequalities define the event. Each month counts 0 or 100; complete yearly/seasonal means are percentages of months. “pp / 10 yr” means percentage-point change over ten years, not relative percent growth.</p>" : ""}<p>Explore the actual values, not just the title. Trend support does not establish causality. Source inputs and boundaries still require upstream provenance review.</p>`,
    "MAPPED CLUE / DEFINITION",
  );
}
function thresholdTable(s) {
  const r = recipe(DATA, s.variable);
  if (r?.kind !== "joint_event") return "";
  return `<details class="threshold-details"><summary>Inspect the actual 1991–2020 thresholds</summary><p>One independent reference distribution per site and calendar month; n = 30 for each threshold. Inequalities are strict; quantiles use linear interpolation.</p><div class="table-scroll"><table class="method-table"><thead><tr><th>Month</th>${r.tests.map(([id, op, q]) => `<th>${esc(shortCode(DATA, id))}<br/>${esc(op)} P${Math.round(q * 100)} (${esc(getVariable(DATA, id).unit)})</th>`).join("")}</tr></thead><tbody>${Array.from(
    { length: 12 },
    (_, i) => {
      const cuts =
        DATA.compoundThresholds[`${s.region}|${s.variable}|${i + 1}`];
      return `<tr><td>${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, i, 1)))}</td>${cuts.map((c) => `<td>${fmt(c.threshold, getVariable(DATA, c.variable).decimals)}</td>`).join("")}</tr>`;
    },
  ).join(
    "",
  )}</tbody></table></div><p>Analysis JSON retains the thresholds at archive precision.</p></details>`;
}
function showAnalysisDetails(s) {
  const view = getView(DATA, s),
    v = getVariable(DATA, s.variable),
    rec = recipe(DATA, s.variable),
    snapshot = statsSnapshot(DATA, s);
  let detail = "";
  if (s.tab === "cycle")
    detail = `<h3>The monthly distribution</h3><p>Each calendar month is summarized across the selected years. The map’s season selector does not filter this annual-cycle chart.</p><div class="table-scroll"><table class="method-table"><thead><tr><th>Month</th><th>n</th><th>Mean (${esc(v.unit)})</th><th>P10</th><th>P90</th></tr></thead><tbody>${cycleData(
      DATA,
      s,
    )
      .map(
        (r) =>
          `<tr><td>${r.name}</td><td>${r.n}</td><td>${fmt(r.mean, v.decimals)}</td><td>${fmt(r.p10, v.decimals)}</td><td>${fmt(r.p90, v.decimals)}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="callout">The P10–P90 envelope is across-year spread, not a confidence interval for the mean. An exploratory 0/100 event series may have a zero-width percentile envelope even when rare events occur.</div>`;
  else if (s.tab === "relationships") {
    const rel = snapshot.relationship;
    detail = `<h3>Aligned observations, not attribution</h3><table class="method-table"><tr><td>X</td><td>${esc(label(DATA, s.relationX))} · ${esc(getVariable(DATA, s.relationX).unit)}</td></tr><tr><td>Y</td><td>${esc(label(DATA, s.relationY))} · ${esc(getVariable(DATA, s.relationY).unit)}</td></tr><tr><td>Pearson r / r²</td><td>${fmt(rel.r, 4, true)} / ${fmt(rel.r2, 4)}</td></tr><tr><td>Paired observations</td><td>${rel.n}</td></tr><tr><td>Preprocessing</td><td>${s.detrend ? "Separate linear time trends removed from X and Y" : "Unadjusted annual/seasonal values"}</td></tr></table><div class="callout">No correlation significance test or causal finding is asserted. Shared trends, omitted variables and temporal dependence can affect association.${esc(dependenceNote(s.relationX, s.relationY))}</div><p>Only overlapping complete observations are paired. Detrending is fitted on that paired interval. The CSV includes both native and plotted values.</p>`;
  } else if (s.tab === "compare")
    detail = `<h3>Each regional record keeps its own statistics</h3><div class="table-scroll"><table class="method-table"><thead><tr><th>Region</th><th>${esc(unit(v, s.quantity === "trend"))}</th><th>95% slope interval / 10 yr</th><th>MK q</th><th>Trend rule</th></tr></thead><tbody>${comparisonData(
      DATA,
      s,
    )
      .map(
        (r) =>
          `<tr><td>${esc(r.region.name)}</td><td>${fmt(r.value, decimals(v, s.quantity === "trend"), s.quantity === "trend")}</td><td>[${fmt(r.view.ciLow * 10, 4, true)}, ${fmt(r.view.ciHigh * 10, 4, true)}]</td><td>${fmtP(r.view.qMK)}</td><td>${r.view.supported ? "Pass" : "Not passed"}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><p>The bars include zero and share a common axis. Intervals belong to slopes, not to a mean or an inspected year. Regions hidden by the stronger-trend filter are also absent from this table and CSV. There is no national area-weighted estimate.</p>`;
  else {
    if (s.tab === "stripes") {
      const d = stripeData(DATA, s);
      detail += `<h3>The anomaly reference</h3><p>${esc(d.baseline.label)} · ${d.baseline.n} complete reference years/seasons · mean ${fmt(d.baseline.mean, v.decimals)} ${esc(v.unit)}. Every stripe subtracts this same local mean. The color limits are symmetric at ±${fmt(d.limit, v.decimals)} ${esc(v.unit)} and rescale for each selection; colors are not directly comparable between independently scaled windows.</p>`;
    }
    detail += `<h3>Time-trend context</h3><p>Trend support requires OLS p &lt; 0.05 <strong>and</strong> Benjamini–Hochberg-adjusted Mann–Kendall q &lt; 0.05. A failed test is not proof of no change.</p><table class="method-table"><tr><td>OLS p</td><td>${fmtP(view.pOLS)}</td></tr><tr><td>MK p / adjusted q</td><td>${fmtP(view.pMK)} / ${fmtP(view.qMK)}</td></tr><tr><td>Sen slope / 10 years</td><td>${fmt(view.senSlope * 10, 4, true)} ${esc(unit(v, true))}</td></tr><tr><td>Residual lag-1 correlation</td><td>${fmt(view.residualLag1, 3)}</td></tr><tr><td>Statistics source</td><td>${esc(view.source)}</td></tr></table><div class="callout">No temporal-dependence correction is documented or applied. The 95% OLS band describes the fitted mean, not individual observations. ${v.exploratory ? "Threshold-event trends are exploratory; a linear test is not hazard validation." : ""}</div>`;
  }
  showDialog(
    "The method behind this evidence.",
    `<h3>${esc(s.tab === "relationships" ? label(DATA, s.relationX) + " × " + label(DATA, s.relationY) : label(DATA, s.variable))} · ${esc(getRegion(DATA, s.region).name)}</h3><p>${esc(analysisContext(s))} · ${TYPES[s.tab].name}</p>${rec && s.tab !== "relationships" ? `<div class="formula">${esc(rec.formula)}</div><p>${esc(rec.caution)}</p>` : ""}<div class="formula">${esc(statNote(DATA, s))}</div>${detail}${s.tab === "relationships" ? "" : thresholdTable(s)}<p>Whole-year values are unweighted monthly means, not precipitation totals. Complete seasons require three months; winter assigns December to the following year. Source/extraction provenance and redistribution permissions still need upstream review.</p><button id="snapshotDownload" class="button button-dark"><i data-lucide="download"></i>Export full analysis JSON</button>`,
    "UNCERTAINTY / REPRODUCIBLE CONTEXT",
  );
  if (s.tab !== "relationships" && rec?.kind === "joint_event")
    snapshot.thresholds = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [
        i + 1,
        DATA.compoundThresholds[`${s.region}|${s.variable}|${i + 1}`],
      ]),
    );
  $("snapshotDownload").onclick = () =>
    download(
      `TRACE-${s.region}-${s.variable}-${s.tab}-analysis.json`,
      JSON.stringify(snapshot, null, 2),
      "application/json",
    );
}
function showSources() {
  showDialog(
    "The field guide.",
    `<h3>Read the signals, not a score.</h3><p>TRACE uses the five supplied Giovanni-derived regional CSV files. The map-first interface offers seven focused clues and six new compound diagnostics. The original full archive remains intact for provenance; it is not exposed as a long beginner-facing variable menu.</p><h3>The selected clues</h3><table class="method-table">${DATA.interface.primaryVariables
      .map((p) => {
        const v = getVariable(DATA, p.id);
        return `<tr><td><strong>${esc(p.label)}</strong><br/>${esc(v.name)}</td><td>${esc(v.dataset)}<br/>${esc(v.unit)}</td></tr>`;
      })
      .join(
        "",
      )}</table><div class="callout">GWETROOT was not supplied. Water balance (P−E) is a different available quantity, not fabricated soil moisture. “Clarity” is the supplied AOD_total aerosol-extinction clue, kept separate from SWGDN solar energy.</div><h3>One time lens</h3><p>Whole-year and complete-season aggregation, analysis window and quantity are grouped together. “Change over 10 years” is OLS slope × 10. Rates remain rates. Anomalies use 1991–2020, or 2001–2020 for IMERG and the paired rainfall difference. December belongs to the following winter.</p><h3>Combining variables honestly</h3><p>Five new exploratory layers count joint calendar-month conditions above/below fixed local percentiles. The sixth is an IMERG-minus-MERRA-2 rainfall difference on actual 2001–2024 overlap. These are explicit diagnostics, not validated hazard scores or causal findings. Temperature and VPD share mathematical dependence.</p><h3>Trend support and uncertainty</h3><p>Support requires OLS p &lt; .05 AND BH-adjusted MK q &lt; .05. Matching supplied statistics retain their source families: 114/120 annual tests or 480 pooled seasonal tests. Newly computed views use six regions per metric, season and window. Temporal autocorrelation is not corrected. Full details and residual diagnostics are available from each analysis window.</p><h3>Geographic honesty</h3><p>Natural Earth supplies the Algeria country outline. Six real wilaya polygons are user-approved display proxies, not verified extraction footprints, point samples or proof of whole-wilaya data coverage. They use the fixed 2017 geoBoundaries / OpenStreetMap snapshot; administrative changes are not modelled. Click or hover an area to inspect its regional summary. Textures distinguish named lenses, not within-area climate detail. NASA GIBS Blue Marble and public Esri elevation are context, not climate rasters. Failed sources get explicit local/ellipsoid/2D fallbacks. The original spatial PNG is a reference only, never digitized into measurements.</p><h3>Data audit</h3><p>57,816 supplied monthly rows; no duplicate monthly keys. Annual means and supplied OLS slopes/MK p-values reproduce within floating-point tolerance. Source CSV SHA-256 hashes are retained. Original collection IDs, extraction polygons, processing lineage and redistribution permissions still need to be archived.</p><p>GPCP gauge-weight unit conflict remains flagged in the archival payload and is excluded from the curated interface and combinations.</p><div class="source-links">${DATA.sources.inputFiles.map((f) => `<a href="${f.url}" download>${esc(f.filename)} ↗</a>`).join("")}<a href="/reference/spatial-atlas.png" target="_blank" rel="noopener">Supplied spatial PNG · reference only ↗</a></div><h3>Privacy and status</h3><p>The evidence board is stored only in this browser. Selection sharing does not share your private notes. The read-only Node API serves the prepared archive; it is not live NASA ingestion. This independent project is not an official NASA or Copernicus application.</p><p>Map providers: <a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noopener">NASA GIBS</a> · <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth</a> · <a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank" rel="noopener">Esri elevation</a>. All displayed credits remain applicable.</p>`,
    "METHODS / ORIGINAL NAMES / SOURCES",
  );
}
function collect(snap) {
  const signature = JSON.stringify([
    snap.kind,
    snap.selection.region,
    snap.selection.variable,
    snap.selection.period,
    snap.selection.season,
    snap.selection.quantity,
    snap.selection.quantity === "value" ? snap.selection.year : null,
    snap.selection.anomaly,
    snap.selection.relationX,
    snap.selection.relationY,
    snap.selection.detrend,
  ]);
  if (board.some((r) => r.signature === signature)) {
    toast("This selection is already on your board.");
    return;
  }
  if (board.length >= 80) {
    toast("Export the board before collecting more than 80 cards.");
    return;
  }
  board.unshift({
    ...snap,
    id: crypto.randomUUID(),
    signature,
    createdAt: new Date().toISOString(),
    note: "",
  });
  const saved = persist();
  toast(
    saved
      ? "Evidence collected. Open the board to arrange it and add your interpretation."
      : "Collected in memory only. Browser storage is full or unavailable; export the board before leaving.",
  );
}
function persist() {
  let saved = true;
  try {
    localStorage.setItem(boardKey, JSON.stringify(board));
    localStorage.setItem("trace-board-sort-v2", boardSort);
  } catch {
    saved = false;
    toast(
      "Browser storage is full or unavailable. Export the evidence board to keep these cards.",
    );
  }
  updateBoardCount();
  return saved;
}
function updateBoardCount() {
  $("boardCount").textContent = board.length;
}
function openBoard() {
  $("boardSort").value = boardSort;
  renderBoard();
  $("boardDialog").showModal();
}
function orderedBoard() {
  const rows = [...board];
  if (boardSort === "newest")
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (boardSort === "region")
    rows.sort((a, b) => a.region.name.localeCompare(b.region.name));
  if (boardSort === "type")
    rows.sort((a, b) => a.typeName.localeCompare(b.typeName));
  if (boardSort === "variable")
    rows.sort((a, b) => a.title.localeCompare(b.title));
  return rows;
}
function renderBoard() {
  const rows = orderedBoard();
  $("boardSort").value = boardSort;
  $("boardCards").innerHTML = rows.length
    ? rows
        .map((r, i) => {
          const m =
            r.metric || analysisMetric(DATA, { ...r.selection, tab: r.kind });
          const note =
            r.kind === "relationships"
              ? "Descriptive association, not attribution."
              : r.kind === "cycle"
                ? "Monthly climatology and the range between the 10th and 90th percentiles across years (not a confidence interval)."
                : r.kind === "stripes"
                  ? `Anomalies from ${r.baseline.label}; color is not significance.`
                  : r.kind === "compare"
                    ? "Six regional summaries; not a national area‑weighted estimate."
                    : r.variable.exploratory
                      ? "Exploratory diagnostic, not a validated hazard index."
                      : r.view.supported
                        ? `Trend passes the test rule: slope ${fmt(r.metric.value, r.metric.dp)} ${r.metric.unit} per decade.`
                        : `Trend does not pass the test rule: slope ${fmt(r.metric.value, r.metric.dp)} ${r.metric.unit} per decade.`;
          return `<article class="board-card" draggable="${boardSort === "manual"}" data-card="${esc(r.id)}" style="--card-color:${TYPES[r.kind].color}"><div class="board-card-top"><span>${esc(r.typeName.toUpperCase())} / ${String(i + 1).padStart(2, "0")}</span><button data-card-action="remove" aria-label="Remove ${esc(r.typeName)} evidence"><i data-lucide="x"></i></button></div><h3>${esc(r.title)}</h3><p>${esc(r.region.name)} · ${esc(r.context || analysisContext(r.selection))}</p>${typeof r.image === "string" && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(r.image) ? `<img class="card-preview" src="${r.image}" alt="Saved ${esc(r.typeName)} chart preview"/>` : ""}<span class="metric-label">${esc(m.label)}</span><div class="card-value">${fmt(m.value, m.dp, m.signed)}<small>${esc(m.unit)}</small></div><p>${esc(note)}</p><textarea data-note="${esc(r.id)}" maxlength="3000" aria-label="Your interpretation of ${esc(r.title)}" placeholder="What does this show? What does it not show?">${esc(r.note)}</textarea><div class="card-actions"><button data-card-action="revisit">Reopen chart ↗</button><button class="icon-button" data-card-action="map" aria-label="Restore selection on map" title="Show on map"><i data-lucide="map"></i></button><button class="icon-button" data-card-action="up" aria-label="Move evidence up" title="Move up" ${i === 0 ? "disabled" : ""}><i data-lucide="arrow-up"></i></button><button class="icon-button" data-card-action="down" aria-label="Move evidence down" title="Move down" ${i === rows.length - 1 ? "disabled" : ""}><i data-lucide="arrow-down"></i></button></div></article>`;
        })
        .join("")
    : '<div class="board-empty"><i data-lucide="notebook-pen"></i><h3>Keep observations, not assumptions.</h3><p>Open a time series, annual cycle or another chart. Choose “Collect evidence” to freeze it here. Then arrange your cards and write down the interpretation.</p></div>';
  iconize();
}
function readURL() {
  const q = new URLSearchParams(location.search);
  if (getRegion(DATA, q.get("region"))) state.region = q.get("region");
  if (availableIds().includes(q.get("var"))) {
    state.variable = q.get("var");
    state.palette = layerStyle(state.variable).palette;
  }
  if (["1984-2024", "2001-2024"].includes(q.get("period")))
    state.period = q.get("period");
  if (Object.keys(SEASONS).includes(q.get("season")))
    state.season = q.get("season");
  if (["trend", "mean", "value"].includes(q.get("quantity")))
    state.quantity = q.get("quantity");
  if (
    q.has("year") &&
    Number.isInteger(+q.get("year")) &&
    +q.get("year") >= 1984 &&
    +q.get("year") <= 2024
  )
    state.year = +q.get("year");
}
async function shareView() {
  const u = new URL(location.pathname, location.origin);
  for (const [k, v] of Object.entries({
    region: state.region,
    var: state.variable,
    period: state.period,
    season: state.season,
    quantity: state.quantity,
    ...(state.quantity === "value" ? { year: state.year } : {}),
  }))
    u.searchParams.set(k, v);
  try {
    await navigator.clipboard.writeText(u.href);
    toast(
      "Map selection copied. Your evidence board and private notes are not shared.",
    );
  } catch {
    showDialog(
      "Share this map selection.",
      `<p>This restores the mapped clue and time lens, not your private evidence board.</p><input id="shareLink" readonly style="width:100%;padding:10px;border:1px solid #ccc;border-radius:4px;font-size:11px" aria-label="Shareable map URL" value="${esc(u.href)}"/>`,
      "SHARE THE VIEW",
    );
    $("shareLink").select();
  }
}
init().catch((error) => {
  console.error(error);
  if ($("startup"))
    $("startup").innerHTML =
      `<div class="startup-brand">trace.</div><p>${esc(error.message)} Check the local server and prepared archive.</p>`;
});

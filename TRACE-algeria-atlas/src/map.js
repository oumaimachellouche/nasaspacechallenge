// Use the locally hosted official prebuilt SDK to avoid rebundling Cesium.
const C = window.Cesium;
import "cesium/Build/Cesium/Widgets/widgets.css";
import { createAreaLayer } from "./areas.js";
import {
  getView,
  getVariable,
  mapValue,
  scaleDomain,
  colorFor,
  decimals,
  fmt,
  esc,
} from "./data.js";

export async function createAtlasMap(data, onSelect, onStatus) {
  const container = document.getElementById("cesiumContainer"),
    labels = document.getElementById("mapLabels"),
    stage = container.parentElement;
  let viewer = null,
    state = null,
    fallback = false,
    labelOpacity = 1,
    showLabels = true,
    useTerrain = true,
    currentImagery = "nasa",
    boundary = null,
    areas = null,
    hoverPosition = null,
    hoverId = null,
    display3D = true;
  const anchors = new Map();
  let terrainProvider = null,
    terrainLabel = "BASEMAP READY",
    toolMode = null,
    toolCallback = null,
    measurePoints = [],
    measureEntities = [],
    handler = null,
    nasaLayer = null,
    nasaErrors = 0;
  const reportStatus = () => {
    if (!fallback)
      onStatus(
        `CESIUMJS · ${terrainLabel}${currentImagery === "natural" ? " · LOCAL BASEMAP" : ""}`,
      );
  };
  for (const site of data.regions) {
    const el = document.createElement("div");
    el.className = "site-anchor";
    el.dataset.region = site.id;
    el.innerHTML = `<svg class="site-leader" aria-hidden="true"><line x1="0" y1="0" x2="12" y2="0"/></svg><button class="site-dot" aria-label="Select ${esc(site.name)} regional record" title="Select ${esc(site.name)} regional record"></button><button class="site-chip" aria-label="Select ${esc(site.name)} study region"><span class="site-name">${esc(site.name)}</span><span class="site-value"></span></button>`;
    for (const button of el.querySelectorAll("button")) {
      button.addEventListener("click", () => onSelect(site.id));
      button.addEventListener("dblclick", () => focus(site.id));
    }
    labels.appendChild(el);
    anchors.set(site.id, {
      el,
      site,
      displayPoint: [site.lon, site.lat],
      world: C ? C.Cartesian3.fromDegrees(site.lon, site.lat, 1000) : null,
      chip: el.querySelector(".site-chip"),
      value: el.querySelector(".site-value"),
    });
  }
  try {
    if (!C) throw new Error("The local Cesium SDK could not be loaded.");
    C.Ion.defaultAccessToken =
      import.meta.env.VITE_CESIUM_ION_TOKEN || undefined;
    const credits = document.createElement("div");
    credits.className = "map-provider-credits";
    stage.appendChild(credits);
    viewer = new C.Viewer(container, {
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
      showRenderLoopErrors: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      terrainProvider: new C.EllipsoidTerrainProvider(),
      creditContainer: credits,
      contextOptions: {
        webgl: { alpha: false, antialias: true, preserveDrawingBuffer: true },
      },
    });
    viewer.scene.backgroundColor = C.Color.fromCssColorString("#e3e9e6");
    viewer.scene.globe.baseColor = C.Color.fromCssColorString("#e3e9e6");
    viewer.scene.globe.enableLighting = false;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.targetFrameRate = 30;
    viewer.resolutionScale = Math.min(1, 1.5 / (window.devicePixelRatio || 1));
    viewer.scene.globe.maximumScreenSpaceError = 4;
    viewer.scene.fog.enabled = false;
    viewer.scene.skyBox.show = false;
    viewer.scene.skyAtmosphere.show = false;
    viewer.scene.sun.show = false;
    viewer.scene.moon.show = false;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1500;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 18000000;
    viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    viewer.camera.percentageChanged = 0.05;
    labels.classList.add("cesium-markers");
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
    // Built-in, locally served Natural Earth imagery is a reliable key-free fallback.
    C.TileMapServiceImageryProvider.fromUrl(
      "/cesium/Assets/Textures/NaturalEarthII/",
    )
      .then((provider) => {
        const layer = viewer.imageryLayers.addImageryProvider(provider, 0);
        layer.saturation = 0.38;
        layer.brightness = 1.18;
        layer.contrast = 0.88;
        viewer.scene.requestRender();
      })
      .catch(() => {});
    const nasa = new C.UrlTemplateImageryProvider({
      url: "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg",
      tilingScheme: new C.WebMercatorTilingScheme(),
      maximumLevel: 8,
      credit: new C.Credit(
        '<a href="https://gibs.earthdata.nasa.gov/" target="_blank" rel="noopener">NASA GIBS / Blue Marble</a>',
        true,
      ),
    });
    nasaLayer = viewer.imageryLayers.addImageryProvider(nasa);
    nasaLayer.saturation = 0.35;
    nasaLayer.brightness = 1.17;
    nasaLayer.contrast = 0.9;
    nasaLayer.gamma = 1.05;
    nasa.errorEvent.addEventListener(() => {
      nasaErrors++;
      if (nasaErrors >= 4 && nasaLayer.show) {
        nasaLayer.show = false;
        currentImagery = "natural";
        reportStatus();
        viewer.scene.requestRender();
      }
    });
    const terrainURL =
      "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
    const terrainPromise = import.meta.env.VITE_CESIUM_ION_TOKEN
      ? C.createWorldTerrainAsync()
      : C.ArcGISTiledElevationTerrainProvider.fromUrl(terrainURL);
    terrainPromise
      .then((provider) => {
        terrainProvider = provider;
        if (useTerrain && !fallback) viewer.terrainProvider = provider;
        terrainLabel = useTerrain
          ? import.meta.env.VITE_CESIUM_ION_TOKEN
            ? "ION TERRAIN"
            : "ESRI ELEVATION"
          : "ELLIPSOID";
        reportStatus();
        let failures = 0;
        provider.errorEvent.addEventListener((error) => {
          failures++;
          if (error.timesRetried > 2) error.retry = false;
          if (failures > 12 && !fallback) {
            terrainProvider = null;
            viewer.terrainProvider = new C.EllipsoidTerrainProvider();
            terrainLabel = "ELLIPSOID / TERRAIN UNAVAILABLE";
            reportStatus();
          }
        });
        viewer.scene.requestRender();
      })
      .catch(() => {
        terrainLabel = "ELLIPSOID / TERRAIN UNAVAILABLE";
        reportStatus();
      });
    reportStatus();
    fetch("/data/algeria.geojson")
      .then((r) => r.json())
      .then(async (json) => {
        boundary = json;
        // Boundary lines are display geometry, raised 3 km to remain visible at
        // country scale without expensive globe-wide ground-polyline tessellation.
        // Longitude/latitude vertices remain the Natural Earth geometry.
        if (fallback) {
          drawFallback();
          return;
        }
        for (const feature of json.features) {
          const polygons =
            feature.geometry.type === "MultiPolygon"
              ? feature.geometry.coordinates
              : [feature.geometry.coordinates];
          for (const polygon of polygons) {
            viewer.entities.add({
              name: "Algeria · Natural Earth boundary",
              polyline: {
                positions: C.Cartesian3.fromDegreesArrayHeights(
                  polygon[0].flatMap((p) => [p[0], p[1], 3000]),
                ),
                width: 1.35,
                material: C.Color.fromCssColorString("#52655e").withAlpha(0.95),
                depthFailMaterial:
                  C.Color.fromCssColorString("#52655e").withAlpha(0.65),
              },
            });
          }
        }
        viewer.scene.requestRender();
      })
      .catch(() => {});
    setupInteraction();
    viewer.scene.postRender.addEventListener(positionLabels);
    viewer.scene.renderError.addEventListener((_scene, error) => {
      activateFallback(error);
    });
    home(false);
    container
      .querySelector("canvas")
      ?.setAttribute(
        "aria-label",
        "Cesium globe. Drag to pan, wheel to zoom, or use the accessible site buttons.",
      );
  } catch (error) {
    await activateFallback(error);
  }
  areas = await createAreaLayer({ C, viewer: fallback ? null : viewer, data });
  for (const [rid, a] of anchors) {
    const point = areas.feature(rid)?.properties.labelPoint;
    if (!point) continue;
    a.displayPoint = point;
    a.world = C ? C.Cartesian3.fromDegrees(point[0], point[1], 1000) : null;
    if (a.pointEntity) a.pointEntity.position = a.world;
  }
  if (fallback) drawFallback();
  const fallbackSurface = document.getElementById("fallbackMap");
  fallbackSurface.addEventListener("click", (event) => {
    const rid = event.target.closest("[data-region-area]")?.dataset.regionArea;
    if (rid) onSelect(rid);
  });
  fallbackSurface.addEventListener("keydown", (event) => {
    const rid = event.target.closest("[data-region-area]")?.dataset.regionArea;
    if (rid && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      onSelect(rid);
    }
  });
  fallbackSurface.addEventListener("mousemove", (event) => {
    const rid = event.target.closest("[data-region-area]")?.dataset.regionArea;
    const r = stage.getBoundingClientRect();
    showHover(rid, { x: event.clientX - r.left, y: event.clientY - r.top });
  });
  fallbackSurface.addEventListener("mouseleave", () => showHover(null));
  container.addEventListener("mouseleave", () => showHover(null));
  function showHover(rid, position) {
    hoverId = toolMode ? null : rid;
    hoverPosition = position || hoverPosition;
    areas?.setHover(hoverId);
    const el = document.getElementById("mapHover"),
      info = areas?.summary(hoverId);
    if (!el) return;
    if (!info || !info.visible || !hoverPosition) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = `<span class="hover-kicker">WILAYA DISPLAY AREA · 2017</span><strong>${esc(info.name)}</strong><span>${esc(info.label)}</span><b>${esc(info.formatted)}</b><small>${info.quantity === "trend" ? (info.supported ? "Passes the stated trend rule" : "Trend rule not passed") : "Regional summary, uniformly displayed"}</small><em>Click the area to inspect · not an extraction footprint</em>`;
    el.style.left = `${Math.max(8, Math.min(stage.clientWidth - el.offsetWidth - 12, hoverPosition.x + 16))}px`;
    el.style.top = `${Math.max(8, Math.min(stage.clientHeight - el.offsetHeight - 14, hoverPosition.y + 16))}px`;
  }
  async function activateFallback(error) {
    if (fallback) return;
    console.warn(
      "Cesium unavailable; using the explicitly labelled 2D geographic fallback.",
      error?.message || "Rendering unavailable",
    );
    fallback = true;
    useTerrain = false;
    labels.classList.remove("cesium-markers");
    container.hidden = true;
    if (viewer) viewer.useDefaultRenderLoop = false;
    const surface = document.getElementById("fallbackMap");
    surface.hidden = false;
    onStatus("2D FALLBACK · WEBGL / SDK UNAVAILABLE");
    const notice = document.createElement("div");
    notice.className = "webgl-message";
    notice.setAttribute("role", "status");
    notice.textContent = "3D unavailable · geographic 2D fallback";
    stage.appendChild(notice);
    try {
      boundary =
        boundary ||
        (await fetch("/data/algeria.geojson").then((r) => {
          if (!r.ok) throw new Error("Boundary unavailable");
          return r.json();
        }));
      drawFallback();
    } catch {
      surface.innerHTML =
        '<p style="padding:100px 30px;color:#63747b;font-size:12px">Geographic outline unavailable. Regional charts and downloads remain available.</p>';
    }
  }
  function fallbackPoint(lon, lat) {
    const w = stage.clientWidth,
      h = stage.clientHeight;
    const scale = Math.min((w - 130) / (22 * 0.88), (h - 82) / 19.8),
      cx = w / 2 - 5,
      cy = h / 2 + 9;
    return { x: cx + (lon - 2) * 0.88 * scale, y: cy - (lat - 28.2) * scale };
  }
  function drawFallback() {
    if (!fallback || !boundary) return;
    const rings = [];
    for (const f of boundary.features) {
      const polygons =
        f.geometry.type === "MultiPolygon"
          ? f.geometry.coordinates
          : [f.geometry.coordinates];
      for (const polygon of polygons) {
        rings.push(
          polygon[0]
            .map((p, i) => {
              const q = fallbackPoint(...p);
              return `${i ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
            })
            .join(" ") + " Z",
        );
      }
    }
    document.getElementById("fallbackMap").innerHTML =
      `<svg viewBox="0 0 ${stage.clientWidth} ${stage.clientHeight}" aria-label="Natural Earth geographic boundary of Algeria"><defs><pattern id="fallback-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#cad5d1" stroke-width=".5"/></pattern></defs><rect width="100%" height="100%" fill="#e2e9e4"/><rect width="100%" height="100%" fill="url(#fallback-grid)"/><path d="${rings.join(" ")}" fill="#f1eee3" stroke="#80938b" stroke-width="1.2"/>${areas?.svg(fallbackPoint) || ""}</svg>`;
    positionLabels();
  }
  function positionLabels() {
    if (!state) return;
    const width = stage.clientWidth,
      height = stage.clientHeight,
      rect = stage.getBoundingClientRect(),
      placed = [];
    for (const el of stage.querySelectorAll(
      ".map-heading,.tool-rail,.tool-panel:not([hidden]),.map-tools,.map-legend,.site-inspector:not([hidden]),.evidence-dock,.webgl-message",
    )) {
      const b = el.getBoundingClientRect();
      if (b.width && b.height)
        placed.push({
          x: b.left - rect.left,
          y: b.top - rect.top,
          w: b.width,
          h: b.height,
        });
    }
    const occluder =
      !fallback && viewer?.scene.mode === C.SceneMode.SCENE3D
        ? new C.EllipsoidalOccluder(
            viewer.scene.globe.ellipsoid,
            viewer.camera.positionWC,
          )
        : null;
    const order = [...anchors.values()].sort((a, b) =>
      a.site.id === state.region ? -1 : b.site.id === state.region ? 1 : 0,
    );
    for (const a of order) {
      const stat = getView(data, state, a.site.id);
      const hidden =
        state.supportedOnly && state.quantity === "trend" && !stat?.supported;
      const point = fallback
        ? fallbackPoint(...a.displayPoint)
        : viewer
          ? C.SceneTransforms.worldToWindowCoordinates(viewer.scene, a.world)
          : null;
      const visible =
        !hidden &&
        (!occluder || occluder.isPointVisible(a.world)) &&
        point &&
        point.x > 5 &&
        point.x < width - 5 &&
        point.y > 24 &&
        point.y < height - 19;
      a.el.style.display = visible ? "block" : "none";
      if (!visible) continue;
      a.el.style.transform = `translate(${point.x}px,${point.y}px)`;
      if (!showLabels) continue;
      const cw = a.chip.offsetWidth || 110,
        ch = a.chip.offsetHeight || 30;
      const preference =
        a.site.id === "Oran_West"
          ? [
              [-cw - 14, -15],
              [-cw - 14, 20],
              [14, -18],
              [14, 22],
            ]
          : a.site.id === "Annaba_East"
            ? [
                [14, -21],
                [14, 20],
                [-cw - 14, -17],
                [-cw - 14, 22],
              ]
            : a.site.id === "Setif_Highlands"
              ? [
                  [-cw - 15, -42],
                  [15, -48],
                  [16, 17],
                  [-cw - 16, 22],
                ]
              : a.site.id === "Djelfa_Steppe"
                ? [
                    [-cw - 20, 12],
                    [-cw - 15, 42],
                    [16, 14],
                    [16, 43],
                  ]
                : [
                    [16, -10],
                    [16, 25],
                    [-cw - 15, 5],
                    [-cw - 15, 38],
                  ];
      const candidates = [
        ...preference,
        [16, -70],
        [-cw - 16, -70],
        [16, 62],
        [-cw - 16, 62],
      ];
      let best = null,
        bestScore = Infinity;
      for (const [dx, dy] of candidates) {
        let x = Math.max(12, Math.min(width - cw - 55, point.x + dx)),
          y = Math.max(13, Math.min(height - ch - 38, point.y + dy));
        let score = 0;
        for (const b of placed) {
          const overlapX =
              Math.min(x + cw + 5, b.x + b.w + 5) - Math.max(x - 5, b.x - 5),
            overlapY =
              Math.min(y + ch + 4, b.y + b.h + 4) - Math.max(y - 4, b.y - 4);
          if (overlapX > 0 && overlapY > 0) score += overlapX * overlapY;
        }
        score += Math.hypot(x - point.x, y - point.y) * 0.015;
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
      placed.push({ ...best, w: cw, h: ch });
      a.chip.style.left = `${best.x - point.x}px`;
      a.chip.style.top = `${best.y - point.y}px`;
      const line = a.el.querySelector("line");
      line.setAttribute("x2", best.x + cw / 2 - point.x);
      line.setAttribute("y2", best.y + ch / 2 - point.y);
    }
  }
  function home(animate = true) {
    if (!viewer || fallback) {
      drawFallback();
      return;
    }
    if (viewer.scene.mode === C.SceneMode.SCENE2D) {
      viewer.camera.flyTo({
        destination: C.Rectangle.fromDegrees(-12, 16, 15, 40),
        duration: animate ? 0.65 : 0,
      });
      return;
    }
    // Cesium fits a true geographic rectangle to the current aspect ratio;
    // fixed camera ranges crop Algeria on short, wide dashboard viewports.
    viewer.camera.flyTo({
      destination: C.Rectangle.fromDegrees(-10.5, 16, 14.5, 39.5),
      duration: animate ? 0.75 : 0,
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
    viewer.scene.requestRender();
  }
  function update(next) {
    state = { ...next };
    const domain = scaleDomain(data, state),
      variable = getVariable(data, state.variable);
    for (const a of anchors.values()) {
      const stat = getView(data, state, a.site.id),
        value = mapValue(data, state, a.site.id);
      a.el.style.setProperty(
        "--marker",
        colorFor(value, domain, state.palette),
      );
      a.el.classList.toggle("selected", a.site.id === state.region);
      a.el.classList.toggle(
        "unsupported",
        !stat?.supported && state.quantity === "trend",
      );
      a.value.textContent = fmt(
        value,
        Math.min(4, decimals(variable, state.quantity === "trend")),
        state.quantity === "trend",
      );
      a.el.style.opacity = labelOpacity;
      if (a.pointEntity) {
        a.pointEntity.show = !(
          state.supportedOnly &&
          state.quantity === "trend" &&
          !stat?.supported
        );
        const unsupported = !stat?.supported && state.quantity === "trend",
          color = C.Color.fromCssColorString(
            colorFor(value, domain, state.palette),
          );
        a.pointEntity.point.color = (
          unsupported ? C.Color.fromCssColorString("#f7f6f0") : color
        ).withAlpha(labelOpacity);
        a.pointEntity.point.outlineColor = (
          unsupported ? color : C.Color.WHITE
        ).withAlpha(labelOpacity);
        a.pointEntity.point.pixelSize = a.site.id === state.region ? 15 : 12;
      }
      a.chip.setAttribute("aria-pressed", String(a.site.id === state.region));
      a.el
        .querySelector(".site-dot")
        .setAttribute("aria-pressed", String(a.site.id === state.region));
      a.chip.title = `${a.site.name} · ${a.site.subtitle}\n${fmt(value, decimals(variable, state.quantity === "trend"), state.quantity === "trend")} ${state.quantity === "trend" ? variable.trendUnit : variable.unit}\nWilaya display area (2017 snapshot), not a measurement location or verified extraction footprint.`;
    }
    areas?.update(state);
    if (fallback) drawFallback();
    positionLabels();
    if (hoverId) showHover(hoverId, hoverPosition);
    viewer?.scene.requestRender();
  }
  function focus(rid) {
    if (!viewer || fallback) return;
    const site = data.regions.find((r) => r.id === rid);
    const b = areas?.feature(rid)?.properties.bounds;
    if (b) {
      const dx = Math.max(0.12, (b[2] - b[0]) * 0.18),
        dy = Math.max(0.12, (b[3] - b[1]) * 0.18);
      viewer.camera.flyTo({
        destination: C.Rectangle.fromDegrees(
          b[0] - dx,
          b[1] - dy,
          b[2] + dx,
          b[3] + dy,
        ),
        duration: 0.9,
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      viewer.scene.requestRender();
      return;
    }
    if (viewer.scene.mode === C.SceneMode.SCENE2D) {
      viewer.camera.flyTo({
        destination: C.Rectangle.fromDegrees(
          site.lon - 2.5,
          site.lat - 1.8,
          site.lon + 2.5,
          site.lat + 1.8,
        ),
        duration: 0.8,
      });
    } else
      viewer.camera.flyToBoundingSphere(
        new C.BoundingSphere(C.Cartesian3.fromDegrees(site.lon, site.lat), 10),
        {
          duration: 1,
          offset: new C.HeadingPitchRange(0, C.Math.toRadians(-48), 360000),
        },
      );
  }
  function mode(is3D) {
    display3D = is3D;
    if (!viewer || fallback) return;
    const remove = viewer.scene.morphComplete.addEventListener(() => {
      remove();
      home(false);
    });
    if (is3D) viewer.scene.morphTo3D(0.6);
    else viewer.scene.morphTo2D(0.6);
  }
  function zoom(direction) {
    if (!viewer || fallback) return;
    const distance = viewer.camera.positionCartographic.height * 0.35;
    if (direction > 0) viewer.camera.zoomIn(distance);
    else viewer.camera.zoomOut(distance);
    viewer.scene.requestRender();
  }
  function settings({
    opacity,
    labels: labelSetting,
    terrain,
    imagery,
    regions,
    textures,
    fillOpacity,
  } = {}) {
    areas?.settings({ regions, textures, fillOpacity });
    if (opacity !== undefined) {
      labelOpacity = opacity;
      for (const a of anchors.values()) a.el.style.opacity = opacity;
    }
    if (labelSetting !== undefined) {
      showLabels = labelSetting;
      labels.classList.toggle("labels-hidden", !showLabels);
    }
    if (terrain !== undefined && viewer && !fallback) {
      useTerrain = terrain;
      viewer.terrainProvider =
        terrain && terrainProvider
          ? terrainProvider
          : new C.EllipsoidTerrainProvider();
      terrainLabel = terrain
        ? terrainProvider
          ? import.meta.env.VITE_CESIUM_ION_TOKEN
            ? "ION TERRAIN"
            : "ESRI ELEVATION"
          : "ELLIPSOID / TERRAIN UNAVAILABLE"
        : "ELLIPSOID";
      reportStatus();
    }
    if (imagery !== undefined && viewer && !fallback) {
      currentImagery = imagery;
      if (imagery === "nasa") nasaErrors = 0;
      for (let i = 0; i < viewer.imageryLayers.length; i++) {
        const l = viewer.imageryLayers.get(i);
        if (
          l.imageryProvider instanceof C.UrlTemplateImageryProvider &&
          !(l.imageryProvider instanceof C.TileMapServiceImageryProvider)
        )
          l.show = imagery === "nasa";
      }
      reportStatus();
    }
    if (state) update(state);
    else positionLabels();
    viewer?.scene.requestRender();
  }
  function setupInteraction() {
    for (const a of anchors.values())
      a.pointEntity = viewer.entities.add({
        id: "trace-site-" + a.site.id,
        properties: { traceRegion: a.site.id },
        position: a.world,
        point: {
          pixelSize: 10,
          color: C.Color.fromCssColorString("#9a6951"),
          outlineColor: C.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    const siteAt = (position) => {
      const picked = viewer.scene.pick(position);
      const rid = picked?.id?.properties?.traceRegion?.getValue();
      if (rid) return rid;
      // Administrative hit-testing remains available while remote terrain
      // tiles are loading. This ellipsoid fallback selects an area only; it
      // never reports a fabricated terrain height or climate pixel.
      const world =
        groundAt(position) ||
        viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid);
      if (!world) return null;
      const p = C.Cartographic.fromCartesian(world);
      return areas?.regionAt(
        C.Math.toDegrees(p.longitude),
        C.Math.toDegrees(p.latitude),
      );
    };
    const groundAt = (position) => {
      if (!useTerrain || !terrainProvider)
        return viewer.camera.pickEllipsoid(
          position,
          viewer.scene.globe.ellipsoid,
        );
      const ray = viewer.camera.getPickRay(position);
      return ray ? viewer.scene.globe.pick(ray, viewer.scene) : null;
    };
    handler = new C.ScreenSpaceEventHandler(viewer.canvas);
    handler.setInputAction((event) => {
      if (!toolMode) {
        const rid = siteAt(event.position);
        if (rid) onSelect(rid);
        return;
      }
      const world = groundAt(event.position);
      if (!world) return;
      const p = C.Cartographic.fromCartesian(world),
        lon = C.Math.toDegrees(p.longitude),
        lat = C.Math.toDegrees(p.latitude);
      if (toolMode === "probe") {
        toolCallback?.({
          title: `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`,
          detail:
            useTerrain && terrainProvider
              ? `Loaded-surface height ≈ ${Math.round(p.height)} m (current tile detail; approximate). Geographic context only, never an interpolated climate estimate.`
              : "Ellipsoid context. Real elevation unavailable/off. No climate estimate is interpolated here.",
        });
        return;
      }
      if (measurePoints.length === 2) {
        clearMeasure();
        measurePoints = [];
      }
      measurePoints.push(p);
      measureEntities.push(
        viewer.entities.add({
          position: C.Cartesian3.fromRadians(p.longitude, p.latitude, 5000),
          point: {
            pixelSize: 8,
            color: C.Color.fromCssColorString("#9a3e46"),
            outlineColor: C.Color.WHITE,
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
      );
      if (measurePoints.length === 1)
        toolCallback?.({
          title: "First position recorded",
          detail:
            "Click the second position. Distance is horizontal on the WGS84 ellipsoid, not terrain-following.",
        });
      else {
        const distance = new C.EllipsoidGeodesic(
          measurePoints[0],
          measurePoints[1],
        ).surfaceDistance;
        measureEntities.push(
          viewer.entities.add({
            polyline: {
              positions: measurePoints.map((p) =>
                C.Cartesian3.fromRadians(p.longitude, p.latitude, 5000),
              ),
              width: 2,
              material: C.Color.fromCssColorString("#9a3e46"),
              arcType: C.ArcType.GEODESIC,
            },
          }),
        );
        toolCallback?.({
          title: `${(distance / 1000).toFixed(1)} km · geodesic distance`,
          detail:
            "WGS84 surface distance, not a travel route or extraction footprint. Click again to start a new measurement.",
        });
      }
      viewer.scene.requestRender();
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    handler.setInputAction((event) => {
      if (toolMode) return;
      const rid = siteAt(event.position);
      if (rid) {
        onSelect(rid);
        focus(rid);
      }
    }, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    handler.setInputAction((event) => {
      const rid = toolMode ? null : siteAt(event.endPosition);
      viewer.canvas.style.cursor = toolMode
        ? "crosshair"
        : rid
          ? "pointer"
          : "grab";
      showHover(rid, event.endPosition);
    }, C.ScreenSpaceEventType.MOUSE_MOVE);
    viewer.camera.changed.addEventListener(() => {
      const needle = document.getElementById("northNeedle");
      if (needle)
        needle.style.transform = `rotate(${-C.Math.toDegrees(viewer.camera.heading)}deg)`;
    });
  }
  function clearMeasure() {
    if (!viewer) return;
    for (const e of measureEntities) viewer.entities.remove(e);
    measureEntities = [];
    measurePoints = [];
    viewer.scene.requestRender();
  }
  function tool(mode, callback) {
    toolMode = mode;
    showHover(null);
    toolCallback = callback;
    clearMeasure();
  }
  function tilt(enabled) {
    if (!viewer || fallback || viewer.scene.mode !== C.SceneMode.SCENE3D)
      return;
    const ray = viewer.camera.getPickRay(
        new C.Cartesian2(
          viewer.canvas.clientWidth / 2,
          viewer.canvas.clientHeight / 2,
        ),
      ),
      center =
        (ray && viewer.scene.globe.pick(ray, viewer.scene)) ||
        C.Cartesian3.fromDegrees(2.5, 28.5),
      range = C.Cartesian3.distance(center, viewer.camera.positionWC);
    viewer.camera.flyToBoundingSphere(new C.BoundingSphere(center, 0), {
      duration: 0.85,
      offset: new C.HeadingPitchRange(
        viewer.camera.heading,
        C.Math.toRadians(enabled ? -50 : -90),
        range,
      ),
    });
  }
  function north() {
    if (!viewer || fallback) return;
    viewer.camera.flyTo({
      destination: viewer.camera.positionWC.clone(),
      orientation: { heading: 0, pitch: viewer.camera.pitch, roll: 0 },
      duration: 0.5,
    });
  }
  let lastWidth = stage.clientWidth;
  const ro = new ResizeObserver(() => {
    if (!fallback) viewer?.resize();
    const crossed = lastWidth < 600 !== stage.clientWidth < 600;
    lastWidth = stage.clientWidth;
    if (crossed && !fallback) home(false);
    if (fallback) drawFallback();
    positionLabels();
  });
  ro.observe(stage);
  return {
    update,
    tool,
    tilt,
    north,
    home: () => home(true),
    focus,
    mode,
    zoom,
    settings,
    get viewer() {
      return viewer;
    },
    get fallback() {
      return fallback;
    },
    get regionalLayer() {
      return areas?.diagnostic || { status: "loading", areaCount: 0 };
    },
    get regionSettings() {
      return (
        areas?.options || { regions: true, textures: true, fillOpacity: 0.58 }
      );
    },
    get regionMetadata() {
      return areas?.metadata;
    },
    get terrainReady() {
      return !fallback && !!terrainProvider;
    },
    get layerSettings() {
      return { terrain: useTerrain, labels: showLabels, opacity: labelOpacity };
    },
    get projection() {
      return fallback
        ? "2D fallback"
        : viewer?.scene.mode === C.SceneMode.SCENE2D
          ? "2D"
          : "3D";
    },
    get imagery() {
      return currentImagery;
    },
    requestRender: () => {
      positionLabels();
      viewer?.scene.requestRender();
    },
  };
}

import {
  getView,
  getVariable,
  mapValue,
  scaleDomain,
  colorFor,
  fmt,
  decimals,
  esc,
} from "./data.js";
import { label, unit } from "./field.js";
import {
  layerStyle,
  geometryPolygons,
  pointInGeometry,
  geometryPath,
  patternCanvas,
  patternMarkup,
} from "./map-layers.js";

/** Real, pickable Cesium GeoJSON areas. Geometry is a disclosed display proxy. */
export async function createAreaLayer({ C, viewer, data }) {
  let geojson = null,
    source = null,
    metadata = null,
    state = null,
    hovered = null;
  let status = "loading",
    error = null,
    show = true,
    textures = true,
    fillOpacity = 0.58;
  const regions = new Map(),
    textureCache = new Map();
  const texturesAvailable =
    !viewer || C.GroundPrimitive.supportsMaterials(viewer.scene);
  try {
    const response = await fetch("/data/study-wilayas.geojson", {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error("Wilaya display file could not be loaded");
    geojson = await response.json();
    const ids = data.regions.map((r) => r.id);
    if (
      geojson.type !== "FeatureCollection" ||
      geojson.features.length !== 6 ||
      geojson.features.some(
        (f) =>
          !ids.includes(f.properties.traceRegion) || !f.properties.displayOnly,
      )
    )
      throw new Error("Invalid wilaya display geometry");
    metadata = await fetch("/data/wilaya-display-metadata.json")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    for (const feature of geojson.features)
      regions.set(feature.properties.traceRegion, {
        feature,
        entities: [],
        borders: [],
        value: null,
        visible: false,
        color: "#b8c7bf",
        materialKey: null,
      });
    if (viewer) {
      source = await C.GeoJsonDataSource.load(geojson, {
        clampToGround: true,
        stroke: C.Color.TRANSPARENT,
      });
      source.name =
        "TRACE · wilaya display areas (2017), not extraction footprints";
      for (const entity of source.entities.values) {
        const rid = entity.properties?.traceRegion?.getValue();
        if (!regions.has(rid) || !entity.polygon) continue;
        entity.show = false;
        entity.polygon.outline = false;
        entity.polygon.classificationType = C.ClassificationType.TERRAIN;
        entity.polygon.zIndex = 1;
        regions.get(rid).entities.push(entity);
      }
      await viewer.dataSources.add(source);
      for (const [rid, area] of regions) {
        for (const polygon of geometryPolygons(area.feature.geometry))
          for (const ring of polygon) {
            // Like the country outline, the display stroke is raised; the fill is
            // ground-classified. No terrain-following distance is inferred here.
            const entity = viewer.entities.add({
              name:
                area.feature.properties.shapeName +
                " · display boundary (2017)",
              properties: { traceRegion: rid, displayOnly: true },
              show: false,
              polyline: {
                positions: C.Cartesian3.fromDegreesArrayHeights(
                  ring.flatMap((p) => [p[0], p[1], 3200]),
                ),
                width: 2,
                material: C.Color.fromCssColorString("#334e53"),
                arcType: C.ArcType.GEODESIC,
                depthFailMaterial: C.Color.fromCssColorString("#334e53"),
              },
            });
            area.borders.push(entity);
          }
      }
      viewer.cesiumWidget.creditDisplay.addStaticCredit(
        new C.Credit(
          '<a href="https://www.geoboundaries.org/" target="_blank" rel="noopener">geoBoundaries</a> / <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · ODbL',
          true,
        ),
      );
    }
    status = "ready";
  } catch (e) {
    status = "unavailable";
    error = e.message;
    console.warn(
      "Wilaya display layer unavailable; regional labels remain available.",
      error,
    );
  }

  function tile(pattern, color) {
    const key = `${pattern}|${color}`;
    if (!textureCache.has(key)) {
      textureCache.set(key, patternCanvas(pattern, color));
      if (textureCache.size > 96)
        textureCache.delete(textureCache.keys().next().value);
    }
    return textureCache.get(key);
  }
  function update(next) {
    state = { ...next };
    if (status !== "ready") return;
    const domain = scaleDomain(data, state),
      style = layerStyle(state.variable);
    for (const [rid, a] of regions) {
      const view = getView(data, state, rid);
      a.value = mapValue(data, state, rid);
      a.color = colorFor(a.value, domain, state.palette);
      a.unsupported = state.quantity === "trend" && !view?.supported;
      a.visible =
        show &&
        Number.isFinite(a.value) &&
        !(state.supportedOnly && a.unsupported);
      const alpha = fillOpacity * (a.unsupported ? 0.53 : 1);
      const pattern = textures && texturesAvailable ? style.pattern : "solid";
      // Keep each material instance/geometry stable while colors change with
      // season, year or playback. Only uniforms change; no animated fake field.
      for (const e of a.entities) {
        e.show = a.visible;
        const type = e.polygon.material?.getType(C.JulianDate.now());
        if (pattern === "solid") {
          if (type !== "Color")
            e.polygon.material = new C.ColorMaterialProperty();
          e.polygon.material.color = C.Color.fromCssColorString(
            a.color,
          ).withAlpha(alpha);
        } else {
          if (type !== "Image") {
            const b = a.feature.properties.bounds;
            e.polygon.material = new C.ImageMaterialProperty({
              image: tile(pattern, "#ffffff"),
              transparent: true,
              repeat: new C.Cartesian2(
                Math.max(1, (b[2] - b[0]) * 0.8),
                Math.max(1, (b[3] - b[1]) * 0.8),
              ),
            });
          } else if (a.materialKey !== pattern) {
            e.polygon.material.image = tile(pattern, "#ffffff");
          }
          e.polygon.material.color = C.Color.fromCssColorString(
            a.color,
          ).withAlpha(alpha);
        }
      }
      a.materialKey = pattern;
    }
    if (hovered && !regions.get(hovered)?.visible) hovered = null;
    updateBorders();
    viewer?.scene.requestRender();
  }
  function updateBorders() {
    if (!viewer || !state) return;
    for (const [rid, a] of regions) {
      const selected = state.region === rid,
        hover = hovered === rid;
      const color = C.Color.fromCssColorString(
        selected ? "#8e354c" : hover ? "#143f52" : "#385759",
      );
      for (const e of a.borders) {
        e.show = a.visible;
        e.polyline.width = selected ? 3.5 : hover ? 3 : 1.8;
        e.polyline.material = a.unsupported
          ? new C.PolylineDashMaterialProperty({
              color: color.withAlpha(0.86),
              dashLength: 14,
            })
          : new C.PolylineOutlineMaterialProperty({
              color,
              outlineColor:
                C.Color.fromCssColorString("#faf7ed").withAlpha(0.85),
              outlineWidth: selected || hover ? 1.2 : 0.6,
            });
        e.polyline.depthFailMaterial = e.polyline.material;
      }
    }
  }
  function settings(options) {
    if (options.regions !== undefined) show = options.regions;
    if (options.textures !== undefined) textures = options.textures;
    if (options.fillOpacity !== undefined)
      fillOpacity = Math.max(0.1, Math.min(0.9, options.fillOpacity));
    if (state) update(state);
  }
  function setHover(rid) {
    const next = regions.get(rid)?.visible ? rid : null;
    if (next !== hovered) {
      hovered = next;
      updateBorders();
      viewer?.scene.requestRender();
    }
  }
  function regionAt(lon, lat) {
    for (const [rid, a] of regions) {
      if (!a.visible) continue;
      const b = a.feature.properties.bounds;
      if (
        lon >= b[0] &&
        lon <= b[2] &&
        lat >= b[1] &&
        lat <= b[3] &&
        pointInGeometry(a.feature.geometry, lon, lat)
      )
        return rid;
    }
    return null;
  }
  function summary(rid) {
    const a = regions.get(rid);
    if (!a || !state) return null;
    const v = getVariable(data, state.variable),
      view = getView(data, state, rid);
    return {
      region: rid,
      name: data.regions.find((r) => r.id === rid)?.name,
      wilaya: a.feature.properties.shapeName,
      value: a.value,
      color: a.color,
      visible: a.visible,
      formatted: `${fmt(a.value, decimals(v, state.quantity === "trend"), state.quantity === "trend")} ${unit(v, state.quantity === "trend")}`,
      supported: view?.supported,
      label: label(data, state.variable),
      quantity: state.quantity,
      pattern:
        textures && texturesAvailable
          ? layerStyle(state.variable).pattern
          : "solid",
      labelPoint: a.feature.properties.labelPoint,
      bounds: a.feature.properties.bounds,
      entityIds: a.entities.map((e) => e.id),
    };
  }
  function svg(project) {
    if (!state || status !== "ready" || !show) return "";
    const style = layerStyle(state.variable),
      pattern = textures ? style.pattern : "solid";
    const defs = `<defs><pattern id="area-texture" width="16" height="16" patternUnits="userSpaceOnUse">${patternMarkup(pattern)}</pattern></defs>`;
    return (
      defs +
      [...regions]
        .filter(([, a]) => a.visible)
        .map(([rid, a]) => {
          const path = geometryPath(a.feature.geometry, project),
            selected = state.region === rid,
            info = summary(rid);
          return `<g data-region-area="${esc(rid)}" class="fallback-area ${selected ? "selected" : ""}" role="button" tabindex="0" aria-label="Select ${esc(info.name)} wilaya display area: ${esc(info.formatted)}" aria-pressed="${selected}"><title>${esc(info.name)} · ${esc(info.formatted)} · administrative display only</title><path d="${path}" fill="${a.color}" fill-opacity="${fillOpacity * (a.unsupported ? 0.53 : 1)}" fill-rule="evenodd"/><path d="${path}" fill="url(#area-texture)" fill-opacity="${fillOpacity}" fill-rule="evenodd" pointer-events="none"/><path class="area-border" d="${path}" fill="none" stroke="${selected ? "#8e354c" : "#385759"}" stroke-width="${selected ? 2.5 : 1.2}" ${a.unsupported ? 'stroke-dasharray="5 3"' : ""} pointer-events="none"/></g>`;
        })
        .join("")
    );
  }
  return {
    update,
    settings,
    setHover,
    regionAt,
    summary,
    svg,
    feature: (rid) => regions.get(rid)?.feature,
    get metadata() {
      return metadata;
    },
    get options() {
      return { regions: show, textures, fillOpacity };
    },
    get diagnostic() {
      return {
        status,
        error,
        source: "geoBoundaries / OpenStreetMap · 2017 snapshot",
        geometryRole:
          "Administrative display proxy only; extraction footprints unconfirmed",
        areaCount: regions.size,
        partCount: [...regions.values()].reduce(
          (n, a) => n + a.entities.length,
          0,
        ),
        texturesAvailable,
        ...this.options,
        textureName: layerStyle(state?.variable).texture,
        style: layerStyle(state?.variable).pattern,
        hovered,
        records: [...regions.keys()].map(summary).filter(Boolean),
      };
    },
  };
}

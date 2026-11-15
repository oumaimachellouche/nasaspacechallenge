// Administrative display geometry and visual identity, never spatial inference.
// Texture identifies a named lens; only its UNIFORM regional color encodes data.
export const LENS_STYLES = {
  HEAT_DRYING: {
    pattern: "diagonal",
    name: "Heat + dry air",
    texture: "Thermal diagonals",
    palette: 0,
  },
  HEAT_RAIN: {
    pattern: "stipple",
    name: "Heat + rainfall shortfall",
    texture: "Rainfall stipple",
    palette: 4,
  },
  HEAT_DRY_RAIN: {
    pattern: "crosshatch",
    name: "Heat, dry air + low rain",
    texture: "Three-clue crosshatch",
    palette: 2,
  },
  RAIN_GAP: {
    pattern: "paired",
    name: "Two rainfall stories",
    texture: "Paired rainfall bands",
    palette: 1,
  },
  CLEAR_SOLAR: {
    pattern: "solar",
    name: "Bright + low-aerosol months",
    texture: "Solar lattice",
    palette: 3,
  },
  HOT_WATER: {
    pattern: "waves",
    name: "Heat + water-balance shortfall",
    texture: "Water-balance waves",
    palette: 5,
  },
};
const PLAIN = { pattern: "solid", texture: "Solid regional fill", palette: 0 };
export const layerStyle = (id) => LENS_STYLES[id] || PLAIN;

export function pointInRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
export const geometryPolygons = (g) =>
  g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
export function pointInGeometry(g, lon, lat) {
  return geometryPolygons(g).some(
    (p) =>
      pointInRing(p[0], lon, lat) &&
      !p.slice(1).some((r) => pointInRing(r, lon, lat)),
  );
}
export function geometryPath(g, project) {
  return geometryPolygons(g)
    .flatMap((p) =>
      p.map(
        (r) =>
          r
            .map((xy, i) => {
              const q = project(xy[0], xy[1]);
              return `${i ? "L" : "M"}${q.x.toFixed(2)},${q.y.toFixed(2)}`;
            })
            .join(" ") + " Z",
      ),
    )
    .join(" ");
}

// One seamless tile, shared by the legend, picker swatches and SVG fallback.
export function patternMarkup(pattern, ink = "#233e43") {
  const a = `fill="none" stroke="${ink}" stroke-width="1.1" stroke-opacity=".55"`;
  if (pattern === "diagonal")
    return `<path d="M-8 8L8-8M0 16L16 0M8 24L24 8" ${a}/>`;
  if (pattern === "stipple")
    return `<g fill="${ink}" fill-opacity=".55"><circle cx="4" cy="4" r="1.25"/><circle cx="12" cy="12" r="1.25"/></g>`;
  if (pattern === "crosshatch")
    return `<path d="M-8 8L8-8M0 16L16 0M8 24L24 8M-8 8L8 24M0 0L16 16M8-8L24 8" ${a}/>`;
  if (pattern === "paired") return `<path d="M5 0V16M8 0V16" ${a}/>`;
  if (pattern === "solar")
    return `<circle cx="8" cy="8" r="2" ${a}/><path d="M8 1V4M8 12V15M1 8H4M12 8H15" ${a}/>`;
  if (pattern === "waves")
    return `<path d="M-4 5Q0 1 4 5T12 5T20 5M-4 13Q0 9 4 13T12 13T20 13" ${a}/>`;
  return "";
}
export function patternURL(pattern, background = "#e1dfd6") {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs><pattern id="p" width="16" height="16" patternUnits="userSpaceOnUse">${patternMarkup(pattern)}</pattern></defs><rect width="32" height="32" fill="${background}"/><rect width="32" height="32" fill="url(#p)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Native canvas tiles are passed directly to Cesium ImageMaterialProperty.
export function patternCanvas(pattern, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const x = c.getContext("2d");
  x.fillStyle = color;
  x.fillRect(0, 0, 64, 64);
  x.strokeStyle = "rgba(28,49,55,.48)";
  x.fillStyle = "rgba(28,49,55,.48)";
  x.lineWidth = 1.7;
  if (pattern === "diagonal" || pattern === "crosshatch") {
    x.beginPath();
    for (let n = -64; n <= 128; n += 16) {
      x.moveTo(n, 0);
      x.lineTo(n - 64, 64);
      if (pattern === "crosshatch") {
        x.moveTo(n, 0);
        x.lineTo(n + 64, 64);
      }
    }
    x.stroke();
  } else if (pattern === "stipple") {
    for (let a = 0; a < 64; a += 16)
      for (let b = 0; b < 64; b += 16) {
        x.beginPath();
        x.arc(a + 4 + (b % 32 ? 8 : 0), b + 4, 1.7, 0, Math.PI * 2);
        x.fill();
      }
  } else if (pattern === "paired") {
    x.beginPath();
    for (let n = 4; n < 64; n += 16) {
      x.moveTo(n, 0);
      x.lineTo(n, 64);
      x.moveTo(n + 4, 0);
      x.lineTo(n + 4, 64);
    }
    x.stroke();
  } else if (pattern === "solar") {
    for (let a = 8; a < 64; a += 16)
      for (let b = 8; b < 64; b += 16) {
        x.beginPath();
        x.arc(a, b, 2.1, 0, Math.PI * 2);
        x.moveTo(a - 6, b);
        x.lineTo(a - 4, b);
        x.moveTo(a + 4, b);
        x.lineTo(a + 6, b);
        x.moveTo(a, b - 6);
        x.lineTo(a, b - 4);
        x.moveTo(a, b + 4);
        x.lineTo(a, b + 6);
        x.stroke();
      }
  } else if (pattern === "waves") {
    x.beginPath();
    for (let b = 8; b < 72; b += 16) {
      x.moveTo(0, b);
      for (let a = 0; a < 64; a += 16) {
        x.quadraticCurveTo(a + 4, b - 5, a + 8, b);
        x.quadraticCurveTo(a + 12, b + 5, a + 16, b);
      }
    }
    x.stroke();
  }
  return c;
}

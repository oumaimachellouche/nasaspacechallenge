"""Reproduce six user-approved wilaya DISPLAY areas, not extraction footprints.

The bundled geoBoundaries 2017 / 48-unit snapshot is intentionally fixed; this is
not a claim about today's legal divisions. Coordinates are selected unchanged.
Run: python scripts/prepare_boundaries.py
Add --download to restore the pinned upstream source (network required).
"""
from pathlib import Path
from urllib.request import urlopen
import hashlib
import json
import math
import sys

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'public/data/geography'
SOURCE = BASE / 'geoBoundaries-DZA-ADM1-2017.geojson'
URL = 'https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/DZA/ADM1/geoBoundaries-DZA-ADM1_simplified.geojson'
SOURCE_HASH = '99c13937ec0ce1d937815999b6b546c5ab1912dc5924c6c798c5e11b617feac8'
NAMES = {
    'Oran': 'Oran_West', 'Annaba': 'Annaba_East', 'Sétif': 'Setif_Highlands',
    'Djelfa': 'Djelfa_Steppe', 'Ouargla': 'Ouargla_Sahara', 'Tamanrasset': 'Tamanrasset_Hoggar',
}
ORDER = list(NAMES.values())


def polygons(g):
    return g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]


def ring_contains(ring, x, y):
    inside = False
    for a, b in zip(ring, ring[1:] + ring[:1]):
        if (a[1] > y) != (b[1] > y) and x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]:
            inside = not inside
    return inside


def contains(g, x, y):
    return any(ring_contains(p[0], x, y) and not any(ring_contains(r, x, y) for r in p[1:]) for p in polygons(g))


def label_point(g, bounds):
    # Select an interior LABEL location, never an observation/sampling point.
    west, south, east, north = bounds
    cos_lat = math.cos(math.radians((south + north) / 2))
    best, best_distance = None, -1
    segments = [(a, b) for p in polygons(g) for ring in p for a, b in zip(ring, ring[1:])]
    for i in range(1, 25):
        for j in range(1, 25):
            x, y = west + (east - west) * i / 25, south + (north - south) * j / 25
            if not contains(g, x, y):
                continue
            distance = float('inf')
            for a, b in segments:
                dx, dy = (b[0] - a[0]) * cos_lat, b[1] - a[1]
                px, py = (x - a[0]) * cos_lat, y - a[1]
                t = max(0, min(1, (px * dx + py * dy) / (dx * dx + dy * dy))) if dx or dy else 0
                distance = min(distance, (px - t * dx) ** 2 + (py - t * dy) ** 2)
            if distance > best_distance:
                best, best_distance = [round(x, 6), round(y, 6)], distance
    assert best and contains(g, *best), 'No interior label location'
    return best


BASE.mkdir(parents=True, exist_ok=True)
if '--download' in sys.argv or not SOURCE.exists():
    data = urlopen(URL, timeout=60).read()
    assert hashlib.sha256(data).hexdigest() == SOURCE_HASH, 'Pinned source changed'
    SOURCE.write_bytes(data)
data = SOURCE.read_bytes()
assert hashlib.sha256(data).hexdigest() == SOURCE_HASH
original = json.loads(data)
features = []
for f in original['features']:
    name = f['properties']['shapeName']
    if name not in NAMES:
        continue
    g = f['geometry']
    points = [xy for p in polygons(g) for ring in p for xy in ring]
    bounds = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
    features.append({
        'type': 'Feature', 'id': NAMES[name],
        'properties': {
            **f['properties'], 'traceRegion': NAMES[name], 'displayOnly': True,
            'boundaryYear': 2017, 'geometryRole': 'User-approved administrative display proxy, not a verified extraction footprint',
            'labelPoint': label_point(g, bounds), 'bounds': bounds,
        },
        'geometry': g,
    })
features.sort(key=lambda f: ORDER.index(f['properties']['traceRegion']))
assert len(features) == 6
selected = {'type': 'FeatureCollection', 'name': 'TRACE wilaya display areas — fixed 2017 snapshot', 'features': features}
output = ROOT / 'public/data/study-wilayas.geojson'
output.write_text(json.dumps(selected, ensure_ascii=False, separators=(',', ':')) + '\n')
metadata = {
    'schemaVersion': 1, 'role': 'Administrative display areas only',
    'userDecision': 'Use real wilaya boundaries as clearly labelled display proxies, not verified extraction footprints',
    'source': 'geoBoundaries DZA ADM1, OpenStreetMap contributors / Wambacher',
    'sourcePage': 'https://www.geoboundaries.org/api/current/gbOpen/DZA/ADM1/',
    'pinnedDownloadURL': URL, 'boundaryID': 'DZA-ADM1-43142294',
    'boundaryYearRepresented': 2017, 'sourceUnitCount': len(original['features']),
    'currentLegalBoundariesClaimed': False,
    'license': 'Open Data Commons Open Database License 1.0 (ODbL-1.0)',
    'licenseURL': 'https://opendatacommons.org/licenses/odbl/1-0/',
    'attribution': '© OpenStreetMap contributors; geoBoundaries / William & Mary geoLab; Wambacher',
    'changes': 'Six named features selected; record IDs, bounds and interior label points added. Upstream simplified coordinates and polygon holes are unchanged. No additional simplification or spatial interpolation.',
    'sourceSHA256': SOURCE_HASH,
    'displaySHA256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'upstreamSourceURL': '/data/geography/geoBoundaries-DZA-ADM1-2017.geojson',
    'displayURL': '/data/study-wilayas.geojson',
    'regions': [{'record': f['properties']['traceRegion'], 'wilaya': f['properties']['shapeName'], 'shapeID': f['properties']['shapeID'], 'labelPoint': f['properties']['labelPoint'], 'bounds': f['properties']['bounds']} for f in features],
    'caveat': 'Fixed 2017, 48-unit administrative snapshot; boundaries are not time-varying, current legal certification, or the sampling geometry of the 1984–2024 climate records. Uniform area color repeats one regional summary; texture identifies the layer and is not within-region climate detail.',
}
(ROOT / 'public/data/wilaya-display-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'features': 6, 'sourceUnits': len(original['features']), 'boundaryYear': 2017, 'vertices': sum(len(r) for f in features for p in polygons(f['geometry']) for r in p), 'bytes': output.stat().st_size, 'sha256': metadata['displaySHA256']}, indent=2))

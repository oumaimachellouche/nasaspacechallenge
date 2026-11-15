"""Package the validated source + included build, never dependencies or secrets.

Run from any directory after the tests/build, using Python's standard library:
    python scripts/package_release.py [output.zip]
Only the current, named QA evidence is shipped; historical/scratch files stay out.
"""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]).expanduser().resolve() if len(sys.argv) > 1 else ROOT.parent / "TRACE-algeria-atlas.zip"
PREFIX = "TRACE-algeria-atlas"

TOP = [
    ".env.example", ".gitignore", "README.md", "THIRD_PARTY_NOTICES.md",
    "index.html", "package.json", "package-lock.json", "postcss.config.js",
    "tailwind.config.js", "vite.config.js", "requirements.txt", "release-manifest.json",
]
DIRECTORIES = [".github", "docs", "src", "server", "scripts", "public", "dist"]
REPORTS = [
    "validation.json", "source-manifest.json", "terrain-source.json",
    "data-preparation.txt", "data-tests.txt", "api-tests.txt", "core-tests.txt", "extended-tests.txt",
    "functional-check.json", "extended-check.json", "smoke-desktop.json", "smoke-mobile.json",
    "production-smoke.txt", "production-http.json", "production-build.txt",
    "terrain-check.json", "terrain-check.txt", "release-runtime.json", "release-runtime.txt",
    "layers-check.json", "layers-tests.txt", "boundary-preparation.json", "boundary-reproduction.txt",
    "geography-data-regression.json", "production-http.txt",
]
SCREENSHOTS = [
    "desktop-initial.png", "mobile-initial.png", "desktop-window.png", "mobile-window.png",
    "desktop-compound.png", "desktop-board.png", "terrain-hoggar.png",
    "layer-HEAT_DRYING.png", "layer-HEAT_RAIN.png", "layer-HEAT_DRY_RAIN.png",
    "layer-RAIN_GAP.png", "layer-CLEAR_SOLAR.png", "layer-HOT_WATER.png",
    "layers-mobile.png", "layers-svg-fallback.png",
]
FORBIDDEN = {"node_modules", ".git", "__pycache__", ".venv", ".cache", ".netrc", ".dodsrc", ".npmrc", ".git-credentials", "credentials"}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def permitted(path):
    relative = path.relative_to(ROOT)
    return (
        not any(part in FORBIDDEN for part in relative.parts)
        and not path.is_symlink()
        and path.suffix.lower() not in {".pyc", ".pem", ".key", ".log"}
        and not (path.name.startswith(".env") and path.name != ".env.example")
    )


manifest = json.loads((ROOT / "release-manifest.json").read_text())
assert manifest["version"] == "2.1.0", "Refresh the release manifest before packaging"
expected_hash = manifest["dataSHA256"]
for name in ["public/data/atlas.json", "dist/data/atlas.json"]:
    assert sha256((ROOT / name).read_bytes()) == expected_hash, f"Stale data: {name}"
for name in ["functional-check.json", "extended-check.json", "layers-check.json", "production-http.json"]:
    report = json.loads((ROOT / "analysis" / name).read_text())
    assert report["release"] == manifest["release"], f"Stale report release: {name}"
    assert all(c["passed"] for c in report["checks"]) and not report.get("errors"), f"Failed checks: {name}"
for name in ["smoke-desktop.json", "smoke-mobile.json", "terrain-check.json", "release-runtime.json"]:
    report = json.loads((ROOT / "analysis" / name).read_text())
    assert report["release"] == manifest["release"], f"Stale report release: {name}"
    assert report["passed"], f"Failed checks: {name}"

package = json.loads((ROOT / "package.json").read_text())
assert package["version"] == manifest["version"]
geometry = json.loads((ROOT / "public/data/wilaya-display-metadata.json").read_text())
assert geometry["boundaryYearRepresented"] == 2017 and not geometry["currentLegalBoundariesClaimed"]
for name, expected in [
    ("data/study-wilayas.geojson", geometry["displaySHA256"]),
    ("data/geography/geoBoundaries-DZA-ADM1-2017.geojson", geometry["sourceSHA256"]),
]:
    for base in ["public", "dist"]:
        assert sha256((ROOT / base / name).read_bytes()) == expected, f"Stale geography: {base}/{name}"
assert sha256((ROOT / "dist/index.html").read_bytes()) == manifest["build"]["indexSHA256"]
assert sha256((ROOT / "dist" / manifest["build"]["entrypoint"].lstrip("/")).read_bytes()) == manifest["build"]["entrypointSHA256"]
regression = json.loads((ROOT / "analysis/geography-data-regression.json").read_text())
assert all(regression["unchangedNumericalAndDefinitionFields"].values())
assert regression["newPreparedSHA256"] == expected_hash
for name in ["data-tests.txt", "api-tests.txt"]:
    assert "# fail 0" in (ROOT / "analysis" / name).read_text(), f"Failing data/API suite: {name}"

files = [ROOT / name for name in TOP]
for directory in DIRECTORIES:
    files.extend(p for p in (ROOT / directory).rglob("*") if p.is_file() and permitted(p))
files.extend(ROOT / "analysis" / name for name in REPORTS)
files.extend(ROOT / "analysis/screenshots" / name for name in SCREENSHOTS)
files.extend(p for p in (ROOT / "analysis/exports").glob("*") if p.is_file() and permitted(p))
files = sorted(set(files))
for path in files:
    assert path.is_file() and permitted(path), f"Missing or forbidden release file: {path.relative_to(ROOT)}"
assert OUTPUT not in files
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
temporary = OUTPUT.with_suffix(".zip.partial")
with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in files:
        archive.write(path, f"{PREFIX}/{path.relative_to(ROOT).as_posix()}")
with zipfile.ZipFile(temporary) as archive:
    assert archive.testzip() is None, "Release ZIP CRC failed"
    assert len(archive.namelist()) == len(files)
    for path in files:
        name = f"{PREFIX}/{path.relative_to(ROOT).as_posix()}"
        assert sha256(archive.read(name)) == sha256(path.read_bytes()), f"Content mismatch: {name}"
temporary.replace(OUTPUT)
checksum = sha256(OUTPUT.read_bytes())
checksum_file = OUTPUT.with_suffix(OUTPUT.suffix + ".sha256")
checksum_file.write_text(f"{checksum}  {OUTPUT.name}\n")
print(json.dumps({
    "archive": str(OUTPUT), "version": manifest["version"], "files": len(files),
    "compressedBytes": OUTPUT.stat().st_size, "sha256": checksum,
    "crcAndAllFileHashes": "passed", "excluded": "dependencies, .git, environment/credential files, historical/scratch analysis",
}, indent=2))

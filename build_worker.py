"""Embed the static interface and schedule into a Sites Worker bundle."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
}

assets = {}
for path in DIST.rglob("*"):
    if not path.is_file() or "server" in path.relative_to(DIST).parts:
        continue
    if path.suffix not in TYPES:
        continue
    assets["/" + path.relative_to(DIST).as_posix()] = {
        "type": TYPES[path.suffix],
        "body": path.read_text(encoding="utf-8"),
    }

required = {"/index.html", "/styles.css", "/app.js", "/games.json", "/results.json"}
if not required.issubset(assets):
    raise RuntimeError(f"Missing assets: {required - assets.keys()}")

template = (ROOT / "worker" / "handler.js").read_text(encoding="utf-8")
output = DIST / "server" / "index.js"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(template.replace("__EMBEDDED_ASSETS__", json.dumps(assets, ensure_ascii=False, separators=(",", ":"))), encoding="utf-8")
print(f"Built Worker with {len(assets)} assets ({output.stat().st_size:,} bytes)")

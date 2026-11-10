"""Embed the static interface and schedule into a Sites Worker bundle."""

from __future__ import annotations

import json
import hashlib
import re
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

# A new URL prevents browsers from keeping older CSS and JavaScript after a publish.
index_path = DIST / "index.html"
index_html = index_path.read_text(encoding="utf-8")
for filename in ("styles.css", "app.js"):
    digest = hashlib.sha256((DIST / filename).read_bytes()).hexdigest()[:12]
    index_html = re.sub(
        rf"\./{re.escape(filename)}(?:\?v=[0-9a-f]{{12}})?",
        f"./{filename}?v={digest}",
        index_html,
    )
if index_html != index_path.read_text(encoding="utf-8"):
    index_path.write_text(index_html, encoding="utf-8")

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

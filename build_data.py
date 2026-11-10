"""Build the site's schedule and logo assets from the supplied KBL files."""

from __future__ import annotations

import json
import re
import shutil
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent
OUT = ROOT / "dist"


def nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def child_named(parent: Path, name: str) -> Path:
    return next(path for path in parent.iterdir() if nfc(path.name) == name)


data_dir = child_named(SOURCE, "데이터")
photo_dir = child_named(SOURCE, "사진자료")
calendar = next(path for path in data_dir.iterdir() if "전체" in nfc(path.name))

raw = calendar.read_text(encoding="utf-8-sig")
raw = re.sub(r"\r?\n[ \t]", "", raw)
events = []

for block in raw.split("BEGIN:VEVENT")[1:]:
    block = block.split("END:VEVENT", 1)[0]
    fields = {}
    for line in block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        fields[key.split(";", 1)[0]] = value.strip()
    match = re.fullmatch(r"KBL \| (.+) vs (.+)", nfc(fields["SUMMARY"]))
    if not match:
        raise ValueError(f"Unexpected summary: {fields['SUMMARY']}")
    start = fields["DTSTART"]
    end = fields["DTEND"]
    events.append(
        {
            "id": fields["UID"].split("@", 1)[0],
            "date": f"{start[:4]}-{start[4:6]}-{start[6:8]}",
            "time": f"{start[9:11]}:{start[11:13]}",
            "endTime": f"{end[9:11]}:{end[11:13]}",
            "home": match.group(1),
            "away": match.group(2),
            "venue": nfc(fields["LOCATION"]),
            "url": fields["URL"],
        }
    )

events.sort(key=lambda event: (event["date"], event["time"], event["id"]))
teams = sorted({event[side] for event in events for side in ("home", "away")})
venues = sorted({event["venue"] for event in events})
assert len(events) == 270 and len(teams) == 10 and len(venues) == 9
assert len({event["id"] for event in events}) == len(events)

assets = OUT / "assets" / "logos"
assets.mkdir(parents=True, exist_ok=True)
for team in teams:
    folder = child_named(photo_dir, team.replace(" ", ""))
    shutil.copyfile(folder / "로고.svg", assets / f"{team.replace(' ', '-')}.svg")

(OUT / "games.json").write_text(
    json.dumps({"updated": "2026-09-29", "events": events}, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
print(f"Built {len(events)} games, {len(teams)} logos, {len(venues)} venues")

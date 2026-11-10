"""Save a fallback snapshot of completed 2026–27 KBL games from the official API."""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parent
MONTHS = [(2026, month) for month in (10, 11, 12)] + [(2027, month) for month in (1, 2, 3, 4)]
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Channel": "WEB",
    "TeamCode": "XX",
    "lang": "ko",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://www.kbl.or.kr",
    "Referer": "https://www.kbl.or.kr/",
}


def last_day(year: int, month: int) -> int:
    from calendar import monthrange

    return monthrange(year, month)[1]


results = {}
now_seoul = datetime.now(ZoneInfo("Asia/Seoul"))
for year, month in MONTHS:
    if (year, month) > (now_seoul.year, now_seoul.month):
        break
    url = (
        "https://api.kbl.or.kr/match/list"
        f"?fromDate={year}{month:02d}01&toDate={year}{month:02d}{last_day(year, month):02d}&tcodeList=all"
    )
    command = ["curl", "-fsS", "--max-time", "20"]
    for key, value in HEADERS.items():
        command.extend(["-H", f"{key}: {value}"])
    games = json.loads(subprocess.check_output([*command, url], text=True))
    for game in games:
        if game.get("seasonCode") != 49 or game.get("seasonCategory") != "R":
            continue
        if game.get("isEnded") != 1:
            continue
        results[game["gmkey"]] = {
            "status": "ended",
            "home": game["scoreH"],
            "away": game["scoreA"],
        }

output = ROOT / "dist" / "results.json"
payload = {
    "source": "https://api.kbl.or.kr/match/list",
    "fetchedAt": datetime.now(timezone.utc).isoformat(),
    "results": results,
}
temporary = output.with_suffix(".tmp")
temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
temporary.replace(output)
print(f"Saved {len(results)} completed results")

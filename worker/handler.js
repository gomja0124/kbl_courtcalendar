const ASSETS = __EMBEDDED_ASSETS__;
const RESULT_SNAPSHOT = JSON.parse(ASSETS["/results.json"].body);

const KBL_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Channel: "WEB",
  TeamCode: "XX",
  lang: "ko",
  "X-Requested-With": "XMLHttpRequest",
  Origin: "https://www.kbl.or.kr",
  Referer: "https://www.kbl.or.kr/",
};

function json(data, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": cache },
  });
}

function validMonth(month) {
  return /^2026-(10|11|12)$/.test(month) || /^2027-(01|02|03|04)$/.test(month);
}

async function officialResults(month) {
  const [year, number] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const fromDate = `${year}${String(number).padStart(2, "0")}01`;
  const toDate = `${year}${String(number).padStart(2, "0")}${lastDay}`;
  const url = `https://api.kbl.or.kr/match/list?fromDate=${fromDate}&toDate=${toDate}&tcodeList=all`;
  const response = await fetch(url, { headers: KBL_HEADERS });
  if (!response.ok) throw new Error(`KBL API ${response.status}`);
  const games = await response.json();
  if (!Array.isArray(games)) throw new Error("Unexpected KBL response");
  const results = {};
  for (const game of games) {
    if (game.seasonCode !== 49 || game.seasonCategory !== "R" || !/^S49G01N\d+$/.test(game.gmkey)) continue;
    const status = game.isEnded === 1 ? "ended" : game.isStarted === 1 ? "live" : "scheduled";
    if (status === "scheduled") continue;
    results[game.gmkey] = { status, home: Number(game.scoreH), away: Number(game.scoreA) };
  }
  return json({ source: "live", fetchedAt: new Date().toISOString(), results }, 200, "public, max-age=300");
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });

    if (url.pathname === "/api/results") {
      const month = url.searchParams.get("month") || "";
      if (!validMonth(month)) return json({ error: "Invalid month" }, 400);
      try {
        return await officialResults(month);
      } catch {
        return json({ source: "snapshot", fetchedAt: RESULT_SNAPSHOT.fetchedAt, results: RESULT_SNAPSHOT.results }, 200, "public, max-age=60");
      }
    }

    const path = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const asset = ASSETS[path];
    if (!asset) return new Response("Not found", { status: 404 });
    return new Response(request.method === "HEAD" ? null : asset.body, {
      headers: { "Content-Type": asset.type, "Cache-Control": "no-cache" },
    });
  },
};

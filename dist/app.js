const TEAM_INFO = [
  { name: "고양 소노", short: "소노", color: "#223E63", secondary: "#72A3CD" },
  { name: "대구 한국가스공사", short: "가스공사", color: "#374EA2", secondary: "#DCDDDE" },
  { name: "부산 KCC", short: "KCC", color: "#054196", secondary: "#F09814" },
  { name: "서울 삼성", short: "삼성", color: "#000000", secondary: "#FAC10B" },
  { name: "서울 SK", short: "SK", color: "#E1002B", secondary: "#F5A200" },
  { name: "수원 KT", short: "KT", color: "#D92728", secondary: "#241A16" },
  { name: "안양 정관장", short: "정관장", color: "#CF1F25", secondary: "#000000" },
  { name: "울산 현대모비스", short: "현대모비스", color: "#1A3065", secondary: "#DF2528" },
  { name: "원주 DB", short: "DB", color: "#007F41", secondary: "#001B54" },
  { name: "창원 LG", short: "LG", color: "#470000", secondary: "#FFD900" },
];
const teamMap = new Map(TEAM_INFO.map((team) => [team.name, team]));
const monthMin = "2026-10";
const monthMax = "2027-04";
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function seoulToday() {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const today = seoulToday();
const saved = (() => { try { return JSON.parse(localStorage.getItem("courtside-filters") || "{}"); } catch { return {}; } })();
const selectedTeams = new Set(Array.isArray(saved.teams) ? saved.teams.filter((team) => teamMap.has(team)) : []);
const state = {
  events: [],
  results: new Map(),
  resultSource: "snapshot",
  loadedMonths: new Map(),
  pendingMonths: new Set(),
  month: today.slice(0, 7) < monthMin ? monthMin : today.slice(0, 7) > monthMax ? monthMax : today.slice(0, 7),
  date: today,
  teams: selectedTeams,
  venue: typeof saved.venue === "string" ? saved.venue : "",
  role: ["all", "home", "away"].includes(saved.role) && selectedTeams.size ? saved.role : "all",
  view: saved.view === "list" ? "list" : "month",
};
const exportState = { start: "", end: "", selected: new Set() };

function logo(teamName) { return `./assets/logos/${encodeURIComponent(teamName.replaceAll(" ", "-"))}.svg`; }
function short(teamName) { return teamMap.get(teamName)?.short || teamName; }
function resultFor(game) { return state.results.get(game.id); }
function resultLabel(game) {
  const result = resultFor(game);
  if (result?.status === "ended") return `${result.home} : ${result.away}`;
  if (result?.status === "live") return `${result.home} : ${result.away}`;
  return game.date < today ? "—" : "VS";
}
function gameStatus(game) {
  const status = resultFor(game)?.status;
  return status === "ended" ? "종료" : status === "live" ? "진행 중" : game.date < today ? "결과 확인" : "예정";
}
function officialGameUrl(game) {
  return resultFor(game)?.status === "ended" || game.date < today
    ? `https://www.kbl.or.kr/match/record/${encodeURIComponent(game.id)}/${game.date.replaceAll("-", "")}`
    : game.url;
}
function colorFor(event) {
  return teamMap.get(event.home)?.color || "#627887";
}
function weekDay(date) {
  const [year, month, day] = date.split("-").map(Number);
  return weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}
function readableDate(date) {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일 (${weekDay(date)})`;
}
function monthLabel(month) {
  const [year, number] = month.split("-");
  return `${year}년 ${Number(number)}월`;
}
function matching(event) {
  if (state.venue && event.venue !== state.venue) return false;
  if (!state.teams.size) return true;
  if (state.role === "home") return state.teams.has(event.home);
  if (state.role === "away") return state.teams.has(event.away);
  return state.teams.has(event.home) || state.teams.has(event.away);
}
function filteredEvents() { return state.events.filter(matching); }
function storeFilters() {
  try { localStorage.setItem("courtside-filters", JSON.stringify({ teams: [...state.teams], venue: state.venue, role: state.role, view: state.view })); } catch { /* Browsers can disable storage. */ }
}
function pickFirstDate(monthGames) {
  if (state.month === today.slice(0, 7) && monthGames.some((game) => game.date === today)) return today;
  return monthGames[0]?.date || `${state.month}-01`;
}
function navigateMonth(delta) {
  const [year, month] = state.month.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  if (nextMonth < monthMin || nextMonth > monthMax) return;
  state.month = nextMonth;
  state.date = "";
  render();
}

function renderTeamOptions() {
  $("#teamOptions").innerHTML = TEAM_INFO.map((team) => `<button class="team-option" type="button" data-team="${esc(team.name)}" aria-pressed="${state.teams.has(team.name)}" title="${esc(team.name)}" style="--team-color:${team.color};--team-tint:${team.color}12"><img src="${logo(team.name)}" alt="" /><span>${esc(team.name)}</span></button>`).join("");
  $("#teamCount").textContent = state.teams.size ? `${state.teams.size}팀 선택` : "전체";
}
function renderVenueOptions() {
  const counts = new Map();
  state.events.forEach((game) => counts.set(game.venue, (counts.get(game.venue) || 0) + 1));
  const venues = [...counts.keys()].sort((a, b) => a.localeCompare(b, "ko"));
  if (!venues.includes(state.venue)) state.venue = "";
  $("#venueSelect").innerHTML = `<option value="">모든 경기장</option>${venues.map((venue) => `<option value="${esc(venue)}">${esc(venue)} · ${counts.get(venue)}경기</option>`).join("")}`;
  $("#venueSelect").value = state.venue;
}
function renderRole() {
  if (!state.teams.size) state.role = "all";
  $("#roleOptions").querySelectorAll("button").forEach((button) => {
    const active = button.dataset.role === state.role;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    button.disabled = !state.teams.size && button.dataset.role !== "all";
  });
  $("#roleHint").textContent = state.teams.size ? "선택한 팀을 기준으로 홈·원정을 구분합니다." : "팀을 고르면 홈·원정을 나눠 볼 수 있어요.";
}
function renderSummary(all) {
  const bits = [];
  if (state.teams.size) bits.push([...state.teams].map(short).join(" · "));
  if (state.venue) bits.push(state.venue);
  if (state.teams.size && state.role !== "all") bits.push(state.role === "home" ? "홈 경기" : "원정 경기");
  $("#filterSummary").textContent = `${bits.length ? bits.join(" / ") : "전체 경기 일정"} · ${all.length}경기`;
  $("#openExport").disabled = !all.length;
}
function pill(game) {
  const color = colorFor(game);
  const result = resultFor(game);
  const match = result?.status === "ended" || result?.status === "live"
    ? `${short(game.home)} <span class="pill-score">${result.home}-${result.away}</span> ${short(game.away)}`
    : game.date < today ? `${short(game.home)} <span class="pill-versus">결과 확인</span> ${short(game.away)}` : `${short(game.home)} <span class="pill-versus">vs</span> ${short(game.away)}`;
  return `<button class="game-pill ${result?.status || ""}" type="button" data-game="${esc(game.id)}" style="--game-color:${color};--game-tint:${color}18" title="${esc(game.time + " " + game.home + " " + resultLabel(game) + " " + game.away)}"><span class="pill-time">${esc(game.time)}</span> ${match}</button>`;
}
function renderCalendar(monthGames) {
  const [year, month] = state.month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const slotCount = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const byDate = new Map();
  monthGames.forEach((game) => {
    if (!byDate.has(game.date)) byDate.set(game.date, []);
    byDate.get(game.date).push(game);
  });
  let html = "";
  for (let slot = 0; slot < slotCount; slot++) {
    const day = slot - firstDay + 1;
    if (day < 1 || day > daysInMonth) { html += `<div class="day-cell empty" aria-hidden="true"></div>`; continue; }
    const date = `${state.month}-${String(day).padStart(2, "0")}`;
    const games = byDate.get(date) || [];
    const classes = ["day-cell", slot % 7 === 0 ? "sunday" : "", slot % 7 === 6 ? "saturday" : "", date === today ? "today" : "", date === state.date ? "selected" : ""].filter(Boolean).join(" ");
    html += `<div class="${classes}"><button class="day-number" type="button" data-date="${date}" aria-label="${readableDate(date)}, ${games.length}경기">${day}</button>${games.slice(0, 2).map(pill).join("")}${games.length > 2 ? `<button class="more-games" data-date="${date}" type="button">+ ${games.length - 2}경기 더보기</button>` : ""}</div>`;
  }
  $("#calendarGrid").innerHTML = html;
}
function renderList(monthGames) {
  if (!monthGames.length) {
    $("#listContainer").innerHTML = `<div class="calendar-empty"><strong>조건에 맞는 경기가 없어요.</strong>팀이나 경기장 선택을 바꿔보세요.</div>`;
    return;
  }
  let previousDate = "";
  $("#listContainer").innerHTML = monthGames.map((game) => {
    let heading = "";
    if (game.date !== previousDate) {
      previousDate = game.date;
      heading = `<div class="list-date">${Number(game.date.slice(5, 7))}월 ${Number(game.date.slice(8))}일 <span class="weekday">${weekDay(game.date)}요일</span></div>`;
    }
    return `${heading}${gameCard(game)}`;
  }).join("");
}
function gameCard(game) {
  const result = resultFor(game);
  const ended = result?.status === "ended";
  const live = result?.status === "live";
  const homeLost = ended && result.home < result.away;
  const awayLost = ended && result.away < result.home;
  const color = colorFor(game);
  return `<button class="result-card" type="button" data-game="${esc(game.id)}" style="--game-color:${color};--game-tint:${color}18"><span class="result-card-meta"><span class="game-type">정규시즌</span><span>${esc(game.time)}</span><span>${esc(game.venue)}</span><strong class="status-tag ${ended ? "finished" : live ? "live" : ""}">${gameStatus(game)}</strong></span><span class="result-card-main"><span class="result-team home ${homeLost ? "lost" : ""}"><span>${esc(game.home)}</span><img src="${logo(game.home)}" alt="" /></span><span class="result-score ${ended ? "final" : live ? "in-progress" : ""}">${resultLabel(game)}</span><span class="result-team away ${awayLost ? "lost" : ""}"><img src="${logo(game.away)}" alt="" /><span>${esc(game.away)}</span></span><span class="card-chevron" aria-hidden="true">›</span></span></button>`;
}
function renderDay(all) {
  const games = all.filter((game) => game.date === state.date);
  $("#dayPanelTitle").textContent = readableDate(state.date);
  $("#dayGameCount").textContent = `${games.length}경기`;
  $("#dayGames").innerHTML = games.length ? games.map(gameCard).join("") : `<p class="day-empty">이날은 선택한 조건에 맞는 경기가 없어요.</p>`;
}
async function loadResultsForMonth(month, force = false) {
  const lastLoad = state.loadedMonths.get(month) || 0;
  if (state.pendingMonths.has(month) || (!force && Date.now() - lastLoad < 300000)) return;
  state.pendingMonths.add(month);
  try {
    const response = await fetch(`/api/results?month=${month}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Official results unavailable");
    const data = await response.json();
    for (const [id, result] of Object.entries(data.results || {})) {
      if (/^S49G01N\d+$/.test(id) && ["ended", "live"].includes(result.status) && Number.isFinite(result.home) && Number.isFinite(result.away)) {
        state.results.set(id, result);
      }
    }
    state.resultSource = data.source === "live" ? "live" : "snapshot";
    $("#resultStatus").textContent = state.resultSource === "live" ? "KBL 공식 결과 반영" : "저장된 결과 표시";
  } catch {
    $("#resultStatus").textContent = "저장된 결과 표시";
  } finally {
    state.loadedMonths.set(month, Date.now());
    state.pendingMonths.delete(month);
    if (state.month === month) render();
  }
}
function render() {
  if (!state.events.length) return;
  const all = filteredEvents();
  const monthGames = all.filter((game) => game.date.startsWith(state.month));
  if (!state.date || !state.date.startsWith(state.month)) state.date = pickFirstDate(monthGames);
  renderTeamOptions();
  renderRole();
  renderSummary(all);
  $("#monthTitle").textContent = monthLabel(state.month);
  $("#monthCount").textContent = `이번 달 ${monthGames.length}경기`;
  $("#prevMonth").disabled = state.month === monthMin;
  $("#nextMonth").disabled = state.month === monthMax;
  $("#monthView").classList.toggle("active", state.view === "month");
  $("#listView").classList.toggle("active", state.view === "list");
  $("#monthView").setAttribute("aria-pressed", String(state.view === "month"));
  $("#listView").setAttribute("aria-pressed", String(state.view === "list"));
  $("#calendarView").hidden = state.view !== "month";
  $("#listContainer").hidden = state.view !== "list";
  $(".day-panel").hidden = state.view !== "month";
  renderCalendar(monthGames);
  renderList(monthGames);
  renderDay(all);
  storeFilters();
  void loadResultsForMonth(state.month);
}

function openGame(id) {
  const game = state.events.find((event) => event.id === id);
  if (!game) return;
  const result = resultFor(game);
  const score = result?.status === "ended" || result?.status === "live" ? `<strong class="dialog-score">${result.home} : ${result.away}</strong><small>${gameStatus(game)}</small>` : `<strong>${game.date < today ? "—" : "VS"}</strong><small>${gameStatus(game)}</small>`;
  $("#dialogContent").innerHTML = `<div class="dialog-inner"><div class="dialog-top"><span class="dialog-kicker">KBL 2026–27 · 정규시즌</span><button class="dialog-close" data-close type="button" aria-label="닫기">×</button></div><div class="dialog-date" id="dialogTitle">${readableDate(game.date)} · ${esc(game.time)}</div><div class="dialog-match"><div class="dialog-team"><img src="${logo(game.home)}" alt="" /><strong>${esc(game.home)}</strong><small>HOME</small></div><div class="dialog-vs">${score}</div><div class="dialog-team"><img src="${logo(game.away)}" alt="" /><strong>${esc(game.away)}</strong><small>AWAY</small></div></div><div class="dialog-details"><div class="dialog-detail"><span>경기 시간</span><strong>${esc(game.time)} – ${esc(game.endTime)} KST</strong></div><div class="dialog-detail"><span>경기장</span><strong>${esc(game.venue)}</strong></div></div><a class="dialog-link" href="${esc(officialGameUrl(game))}" target="_blank" rel="noopener noreferrer">${result?.status === "ended" || game.date < today ? "KBL 공식 기록" : "KBL 공식 경기 정보"} ↗</a></div>`;
  $("#gameDialog").showModal();
}

function escapeIcs(value) { return String(value).replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll("\n", "\\n"); }
function foldIcs(line) {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const character of line) {
    const length = encoder.encode(character).length;
    if (bytes + length > 75) { result += "\r\n "; bytes = 1; }
    result += character;
    bytes += length;
  }
  return result;
}
function downloadIcs(games, start, end) {
  if (!games.length) return;
  const now = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//COURTSIDE//KBL 2026-27//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:KBL 2026-27 선택 경기", "X-WR-TIMEZONE:Asia/Seoul", "BEGIN:VTIMEZONE", "TZID:Asia/Seoul", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:KST", "END:STANDARD", "END:VTIMEZONE"];
  games.forEach((game) => {
    const day = game.date.replaceAll("-", "");
    lines.push("BEGIN:VEVENT", `UID:${game.id}@kbl.or.kr`, `DTSTAMP:${now}`, `DTSTART;TZID=Asia/Seoul:${day}T${game.time.replace(":", "")}00`, `DTEND;TZID=Asia/Seoul:${day}T${game.endTime.replace(":", "")}00`, `SUMMARY:${escapeIcs(game.home + " vs " + game.away)}`, `LOCATION:${escapeIcs(game.venue)}`, `URL:${game.url}`, `DESCRIPTION:${escapeIcs("KBL 2026–27 정규시즌 · 홈 " + game.home + " / 원정 " + game.away)}`, "END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const content = lines.map(foldIcs).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob([content], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `KBL_선택경기_${start.replaceAll("-", "")}_${end.replaceAll("-", "")}.ics`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCandidates() {
  if (!exportState.start || !exportState.end || exportState.start > exportState.end) return [];
  return filteredEvents().filter((game) => game.date >= exportState.start && game.date <= exportState.end);
}
function renderExport() {
  const invalid = exportState.start > exportState.end;
  $("#rangeError").hidden = !invalid;
  $("#rangeError").textContent = invalid ? "종료일은 시작일보다 빠를 수 없어요." : "";
  const candidates = exportCandidates();
  const candidateIds = new Set(candidates.map((game) => game.id));
  for (const id of exportState.selected) if (!candidateIds.has(id)) exportState.selected.delete(id);
  $("#candidateCount").textContent = `${candidates.length}경기 중 직접 선택`;
  $("#selectionCount").textContent = `${exportState.selected.size}경기 선택`;
  $("#downloadSelected").disabled = !exportState.selected.size || invalid;
  $("#selectAllGames").disabled = !candidates.length;
  $("#clearGames").disabled = !exportState.selected.size;
  if (!candidates.length) {
    $("#exportGames").innerHTML = `<div class="export-empty">${invalid ? "기간을 다시 확인해 주세요." : "이 기간에는 현재 필터에 맞는 경기가 없어요."}</div>`;
    return;
  }
  let previous = "";
  $("#exportGames").innerHTML = candidates.map((game) => {
    const heading = game.date !== previous ? `<div class="export-date">${readableDate(game.date)}</div>` : "";
    previous = game.date;
    const result = resultFor(game);
    const score = result?.status === "ended" ? `${result.home} : ${result.away}` : game.time;
    return `${heading}<label class="export-game" style="--game-color:${colorFor(game)}"><input type="checkbox" data-export-game="${esc(game.id)}" ${exportState.selected.has(game.id) ? "checked" : ""} /><img src="${logo(game.home)}" alt="" /><span class="export-match">${esc(game.home)} <small>vs</small> ${esc(game.away)}<small>${esc(game.venue)}</small></span><img src="${logo(game.away)}" alt="" /><strong>${esc(score)}</strong></label>`;
  }).join("");
}
function openExport() {
  const [year, month] = state.month.split("-").map(Number);
  exportState.start = state.month === monthMin ? "2026-10-03" : `${state.month}-01`;
  exportState.end = state.month === monthMax ? "2027-04-11" : `${state.month}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`;
  exportState.selected.clear();
  $("#rangeStart").value = exportState.start;
  $("#rangeEnd").value = exportState.end;
  renderExport();
  $("#exportDialog").showModal();
}

$("#teamOptions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-team]");
  if (!button) return;
  const name = button.dataset.team;
  if (state.teams.has(name)) state.teams.delete(name); else state.teams.add(name);
  state.date = "";
  render();
});
$("#venueSelect").addEventListener("change", (event) => { state.venue = event.target.value; state.date = ""; render(); });
$("#roleOptions").addEventListener("click", (event) => { const button = event.target.closest("[data-role]"); if (!button || button.disabled) return; state.role = button.dataset.role; state.date = ""; render(); });
$("#resetFilters").addEventListener("click", () => { state.teams.clear(); state.venue = ""; state.role = "all"; state.date = ""; $("#venueSelect").value = ""; render(); });
$("#prevMonth").addEventListener("click", () => navigateMonth(-1));
$("#nextMonth").addEventListener("click", () => navigateMonth(1));
$("#todayButton").addEventListener("click", () => { state.month = today.slice(0, 7) < monthMin ? monthMin : today.slice(0, 7) > monthMax ? monthMax : today.slice(0, 7); state.date = today.startsWith(state.month) ? today : ""; render(); });
$("#monthView").addEventListener("click", () => { state.view = "month"; render(); });
$("#listView").addEventListener("click", () => { state.view = "list"; render(); });
$("#openExport").addEventListener("click", openExport);
$("#closeExport").addEventListener("click", () => $("#exportDialog").close());
$("#rangeStart").addEventListener("change", (event) => { exportState.start = event.target.value; renderExport(); });
$("#rangeEnd").addEventListener("change", (event) => { exportState.end = event.target.value; renderExport(); });
$("#selectAllGames").addEventListener("click", () => { exportState.selected = new Set(exportCandidates().map((game) => game.id)); renderExport(); });
$("#clearGames").addEventListener("click", () => { exportState.selected.clear(); renderExport(); });
$("#exportGames").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-export-game]");
  if (!checkbox) return;
  if (checkbox.checked) exportState.selected.add(checkbox.dataset.exportGame); else exportState.selected.delete(checkbox.dataset.exportGame);
  renderExport();
});
$("#downloadSelected").addEventListener("click", () => {
  const games = exportCandidates().filter((game) => exportState.selected.has(game.id));
  if (!games.length) return;
  downloadIcs(games, exportState.start, exportState.end);
  $("#exportDialog").close();
});
document.addEventListener("click", (event) => {
  const game = event.target.closest("[data-game]");
  if (game) { openGame(game.dataset.game); return; }
  const date = event.target.closest("[data-date]");
  if (date) { state.date = date.dataset.date; render(); return; }
  if (event.target.closest("[data-close]")) $("#gameDialog").close();
});
$("#gameDialog").addEventListener("click", (event) => { if (event.target === $("#gameDialog")) $("#gameDialog").close(); });
$("#exportDialog").addEventListener("click", (event) => { if (event.target === $("#exportDialog")) $("#exportDialog").close(); });
$("#homeColorGuide").innerHTML = TEAM_INFO.map((team) => `<span class="home-color-guide-item" title="${esc(team.name)}"><i aria-hidden="true" style="background:${team.color}"></i>${esc(team.short)}</span>`).join("");

Promise.all([
  fetch("./games.json").then((response) => { if (!response.ok) throw new Error("일정 파일을 읽지 못했습니다."); return response.json(); }),
  fetch("./results.json").then((response) => response.ok ? response.json() : { results: {} }).catch(() => ({ results: {} })),
])
  .then(([schedule, snapshot]) => {
    state.events = schedule.events;
    state.results = new Map(Object.entries(snapshot.results || {}));
    $("#resultStatus").textContent = "저장된 결과 표시";
    renderVenueOptions();
    render();
  })
  .catch(() => { $("#calendarGrid").innerHTML = `<div class="calendar-empty"><strong>일정을 불러오지 못했어요.</strong>잠시 후 새로고침해 주세요.</div>`; });

setInterval(() => { if (document.visibilityState === "visible" && state.events.length) void loadResultsForMonth(state.month, true); }, 300000);

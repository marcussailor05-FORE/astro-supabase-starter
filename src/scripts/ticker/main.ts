import {
  TYPE_META,
  dateKey,
  loadItems,
  loadSettings,
  nextOccurrence,
  occursOn,
  parseLocal,
  saveItems,
  saveSettings,
  timerRemaining,
  uid,
  type Item,
  type ItemType,
  type Settings,
} from "./store";
import { describe, fetchForecast, weatherIcon, type DayForecast } from "./weather";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

let items = loadItems();
let settings = loadSettings();
let forecast: DayForecast[] = [];

const params = new URLSearchParams(location.search);
if (params.has("compact") || params.get("mode") === "widget") document.body.classList.add("compact");

function persist() {
  saveItems(items);
  renderAll();
}

// ───────────────────────── formatting ─────────────────────────

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDay = (d: Date) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** "in 2h 15m", "in 3d", "5m ago" */
function relative(at: Date, now = new Date()): string {
  const diff = Math.round((at.getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diff);
  let text: string;
  if (abs < 1) text = "now";
  else if (abs < 60) text = `${abs}m`;
  else if (abs < 60 * 24) text = `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}`;
  else text = `${Math.round(abs / 1440)}d`;
  if (text === "now") return "now";
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

function newsAge(published?: string): string {
  if (!published) return "";
  const t = new Date(published);
  if (Number.isNaN(t.getTime())) return "";
  const mins = Math.round((Date.now() - t.getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

// ───────────────────────── clock ─────────────────────────

function renderClock() {
  const now = new Date();
  $("#clock-time").textContent = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  $("#clock-date").textContent = now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// ───────────────────────── weather ─────────────────────────

async function loadWeather() {
  $("#loc-name").textContent = settings.location.name;
  try {
    forecast = await fetchForecast(settings.location);
    renderWeather();
    renderToday();
  } catch {
    $("#weather-row").innerHTML = `<div class="wx-error">Weather unavailable — retrying shortly.</div>`;
  }
}

function renderWeather() {
  const todayKey = dateKey(new Date());
  $("#weather-row").innerHTML = forecast
    .map((day) => {
      const d = parseLocal(day.date, "12:00");
      const name = day.date === todayKey ? "Today" : d.toLocaleDateString([], { weekday: "short" });
      const { label } = describe(day.code);
      return `<div class="wx-card${day.date === todayKey ? " is-today" : ""}" title="${label}">
        <div class="wx-day">${name}</div>
        <div class="wx-icon">${weatherIcon(day.code)}</div>
        <div class="wx-temps"><span class="wx-hi">${day.high}°</span><span class="wx-lo">${day.low}°</span></div>
        <div class="wx-label">${label}</div>
        <div class="wx-precip${day.precip >= 50 ? " wet" : ""}">💧 ${day.precip}%</div>
      </div>`;
    })
    .join("");
}

// ───────────────────────── horoscope ─────────────────────────

const GLYPHS: Record<string, string> = {
  Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍",
  Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓",
};

async function loadHoroscope() {
  $("#horo-glyph").textContent = GLYPHS[settings.sign] ?? "✦";
  $("#horo-sign").textContent = settings.sign.toUpperCase();
  try {
    const res = await fetch(`/api/ticker/horoscope?sign=${settings.sign}&date=${dateKey(new Date())}`);
    const data = await res.json();
    $("#horo-text").textContent = data.text;
    $("#horo-text").title = data.live ? `Source: ${data.source}` : "Live horoscope sources are unreachable — showing an offline reading.";
  } catch {
    $("#horo-text").textContent = "The stars are cloudy right now — check back soon.";
  }
}

// ───────────────────────── tickers ─────────────────────────

const PX_PER_SEC = 70;

/** Fills a tape with `html`, doubling it so the CSS loop is seamless, and sizes the duration to the content. */
function fillTape(name: string, html: string) {
  const tape = $(`[data-tape="${name}"]`);
  const track = $(".tape-track", tape);
  if (track.dataset.src === html) return;
  track.dataset.src = html;
  track.innerHTML = `<div class="tape-run">${html}</div><div class="tape-run" aria-hidden="true">${html}</div>`;
  requestAnimationFrame(() => {
    const width = ($(".tape-run", track) as HTMLElement).scrollWidth;
    track.style.setProperty("--dur", `${Math.max(12, width / (PX_PER_SEC * settings.speed))}s`);
  });
}

function retime() {
  $$(".tape-track").forEach((track) => {
    const run = $(".tape-run", track);
    if (run) track.style.setProperty("--dur", `${Math.max(12, run.scrollWidth / (PX_PER_SEC * settings.speed))}s`);
  });
}

interface NewsItem {
  title: string;
  link: string;
  source?: string;
  published?: string;
}

async function loadNews(desk: string) {
  try {
    const res = await fetch(`/api/ticker/news?desk=${desk}`);
    const data: { items: NewsItem[] } = await res.json();
    if (!data.items?.length) throw new Error("empty");
    fillTape(
      desk,
      data.items
        .map((n) => {
          const age = newsAge(n.published);
          const meta = [n.source, age].filter(Boolean).join(" · ");
          return `<a class="tick" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}${
            meta ? ` <span class="tick-meta">${esc(meta)}</span>` : ""
          }</a>`;
        })
        .join(""),
    );
  } catch {
    const track = $(`[data-tape="${desk}"] .tape-track`);
    if (!track.dataset.src) {
      fillTape(desk, `<span class="tick muted">Headlines unavailable right now — retrying in a few minutes.</span>`);
    }
  }
}

/** Personal items for the MY DAY tape: everything upcoming in the next two weeks plus anything overdue. */
function tapeItems(now: Date) {
  const horizon = now.getTime() + 14 * 86400000;
  return items
    .filter((i) => !i.done)
    .map((item) => ({ item, at: nextOccurrence(item, now) }))
    .filter(({ item, at }) => item.type === "timer" || item.type === "project" || (at && at.getTime() < horizon))
    .sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
}

function renderMineTape() {
  const now = new Date();
  const entries = tapeItems(now);
  if (!entries.length) {
    fillTape("mine", `<span class="tick muted">Nothing scheduled — press ＋ Add to put something on the tape.</span>`);
    return;
  }
  fillTape(
    "mine",
    entries
      .map(({ item, at }) => {
        const meta = TYPE_META[item.type];
        let when = "";
        if (item.type === "timer") {
          when = `<span class="live-timer" data-id="${item.id}">${fmtDuration(timerRemaining(item))}</span>${item.endsAt ? "" : " paused"}`;
        } else if (item.type === "project") {
          when = `${item.progress ?? 0}%${at ? ` · due ${fmtDay(at)}` : ""}`;
        } else if (at) {
          const sameDay = dateKey(at) === dateKey(now);
          when = `${sameDay ? "Today" : fmtDay(at)}${item.time ? ` ${fmtTime(at)}` : ""} · <span class="live-rel" data-at="${at.getTime()}">${relative(at, now)}</span>`;
        }
        const overdue = at && at < now && item.type !== "timer" && item.type !== "project";
        return `<span class="tick tick-item${item.priority === "high" ? " hot" : ""}${overdue ? " overdue" : ""}" style="--c:${meta.color}">
          <span class="chip">${meta.icon} ${meta.label.toUpperCase()}</span>${esc(item.title)} <span class="tick-meta">${when}</span></span>`;
      })
      .join(""),
  );
}

/** Updates countdowns inside the tape without rebuilding it, so the scroll never jumps. */
function tickLiveText() {
  const now = new Date();
  $$(".live-rel").forEach((el) => (el.textContent = relative(new Date(Number(el.dataset.at)), now)));
  $$(".live-timer").forEach((el) => {
    const item = items.find((i) => i.id === el.dataset.id);
    if (item) el.textContent = fmtDuration(timerRemaining(item));
  });
}

// ───────────────────────── today ─────────────────────────

interface Bullet {
  html: string;
  sort: number;
  item?: Item;
  tone?: "alert" | "warn" | "info";
}

function todayBullets(): Bullet[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);
  const bullets: Bullet[] = [];

  for (const item of items) {
    if (item.done) continue;
    const meta = TYPE_META[item.type];
    const tag = `<span class="b-tag" style="--c:${meta.color}">${meta.icon}</span>`;
    const star = item.priority === "high" ? ` <span class="star">★</span>` : "";

    if (item.type === "timer") {
      if (item.endsAt) {
        bullets.push({ item, sort: -1, html: `${tag}<strong>${esc(item.title)}</strong> — <span class="live-timer" data-id="${item.id}">${fmtDuration(timerRemaining(item))}</span> left` });
      }
      continue;
    }
    if (!item.date || item.doneOn === dateKey(today)) continue;

    const due = parseLocal(item.date, item.time);
    if (item.repeat === "none" && due < today && (item.type === "deadline" || item.type === "project")) {
      bullets.push({ item, sort: -2, tone: "alert", html: `${tag}<strong>OVERDUE:</strong> ${esc(item.title)} <em>(was due ${fmtDay(due)})</em>${star}` });
    } else if (occursOn(item, today)) {
      const at = item.time ? parseLocal(dateKey(today), item.time) : undefined;
      const past = at && at < now;
      bullets.push({
        item,
        sort: at ? at.getTime() : today.getTime() + 86399000,
        tone: item.type === "deadline" ? "alert" : undefined,
        html: `${tag}<span class="b-time${past ? " past" : ""}">${at ? fmtTime(at) : "All day"}</span>${
          item.type === "deadline" ? "<strong>DUE:</strong> " : ""
        }${esc(item.title)}${star}`,
      });
    } else if (occursOn(item, tomorrow) && (item.type === "deadline" || item.priority === "high")) {
      bullets.push({ item, sort: tomorrow.getTime() + 1e12, tone: "warn", html: `${tag}<strong>Tomorrow:</strong> ${esc(item.title)}${item.time ? ` at ${fmtTime(due)}` : ""}${star}` });
    } else if (item.type === "project" && due >= today && due.getTime() - today.getTime() <= 7 * 86400000) {
      bullets.push({ item, sort: due.getTime() + 2e12, tone: "warn", html: `${tag}<strong>${esc(item.title)}</strong> — ${item.progress ?? 0}% done, due ${fmtDay(due)}${star}` });
    }
  }

  const wx = forecast.find((d) => d.date === dateKey(now));
  if (wx) {
    const { kind } = describe(wx.code);
    if (wx.precip >= 50 || kind === "rain" || kind === "storm") {
      bullets.push({ sort: 3e15, tone: "info", html: `<span class="b-tag">☔</span>Bring an umbrella — ${wx.precip}% chance of precipitation` });
    } else if (kind === "snow" || kind === "sleet") {
      bullets.push({ sort: 3e15, tone: "info", html: `<span class="b-tag">🧤</span>Snow or ice expected — allow extra drive time` });
    }
    if (wx.high >= 88) bullets.push({ sort: 3e15, tone: "info", html: `<span class="b-tag">🥵</span>Hot one: high of ${wx.high}° — stay hydrated` });
    if (wx.low <= 25) bullets.push({ sort: 3e15, tone: "info", html: `<span class="b-tag">🥶</span>Bundle up: low of ${wx.low}°` });
  }

  return bullets.sort((a, b) => a.sort - b.sort);
}

function renderToday() {
  const bullets = todayBullets();
  const list = $("#today-list");
  $("#today-count").textContent = bullets.length ? `· ${bullets.length}` : "";
  if (!bullets.length) {
    list.innerHTML = `<li class="b-empty">Clear skies — nothing urgent today. ✨</li>`;
    return;
  }
  list.innerHTML = bullets
    .map(
      (b) => `<li class="bullet${b.tone ? ` ${b.tone}` : ""}">
        ${b.item ? `<button class="b-check" data-done="${b.item.id}" title="Mark done" aria-label="Mark done"></button>` : `<span class="b-dot"></span>`}
        <span class="b-body">${b.html}</span>
      </li>`,
    )
    .join("");
}

// ───────────────────────── timers ─────────────────────────

function renderTimers() {
  const timers = items.filter((i) => i.type === "timer" && !i.done);
  $("#timer-list").innerHTML = timers.length
    ? timers
        .map((t) => {
          const total = t.durationSec ?? 1;
          const pct = Math.min(100, (1 - timerRemaining(t) / total) * 100);
          return `<div class="timer${t.endsAt ? " running" : ""}" style="--pct:${pct}%">
            <div class="timer-head"><span>${esc(t.title)}</span><span class="live-timer timer-num" data-id="${t.id}">${fmtDuration(timerRemaining(t))}</span></div>
            <div class="timer-bar"><div></div></div>
            <div class="timer-actions">
              <button class="btn btn-small" data-timer="toggle" data-id="${t.id}">${t.endsAt ? "Pause" : "Start"}</button>
              <button class="btn btn-small" data-timer="reset" data-id="${t.id}">Reset</button>
              <button class="btn btn-small" data-timer="remove" data-id="${t.id}">✕</button>
            </div>
          </div>`;
        })
        .join("")
    : `<div class="muted small">No timers yet.</div>`;
}

function timerAction(id: string, action: string) {
  const t = items.find((i) => i.id === id);
  if (!t) return;
  if (action === "toggle") {
    if (t.endsAt) {
      t.pausedRemaining = timerRemaining(t);
      t.endsAt = undefined;
    } else {
      const remaining = timerRemaining(t) || t.durationSec || 60;
      t.endsAt = Date.now() + remaining * 1000;
      t.alerted = undefined;
      unlockAudio();
    }
  } else if (action === "reset") {
    t.endsAt = undefined;
    t.pausedRemaining = t.durationSec;
    t.alerted = undefined;
  } else if (action === "remove") {
    items = items.filter((i) => i.id !== id);
  }
  persist();
}

// ───────────────────────── alerts ─────────────────────────

let audio: AudioContext | undefined;
function unlockAudio() {
  audio ??= new AudioContext();
  if (audio.state === "suspended") audio.resume();
}

function chime() {
  if (!settings.sound) return;
  try {
    unlockAudio();
    const ctx = audio!;
    [880, 1175, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      const t0 = ctx.currentTime + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.55);
    });
  } catch {
    // audio not allowed until the user interacts with the page
  }
}

function toast(title: string, body: string, color = "#fbbf24") {
  const el = document.createElement("div");
  el.className = "toast";
  el.style.setProperty("--c", color);
  el.innerHTML = `<strong>${esc(title)}</strong><span>${esc(body)}</span><button aria-label="Dismiss">✕</button>`;
  el.querySelector("button")!.onclick = () => el.remove();
  $("#toasts").append(el);
  setTimeout(() => el.remove(), 30000);
}

function alertFor(item: Item, body: string) {
  const meta = TYPE_META[item.type];
  toast(`${meta.icon} ${item.title}`, body, meta.color);
  chime();
  if ("Notification" in window && Notification.permission === "granted" && localStorage.getItem("daily-ticker:notify") === "1") {
    new Notification(item.title, { body, icon: "/ticker-icon.svg", tag: item.id });
  }
}

const ALERT_WINDOW_MS = 5 * 60 * 1000;

function checkAlerts() {
  const now = new Date();
  const todayKey = dateKey(now);
  let changed = false;

  for (const item of items) {
    if (item.done) continue;
    if (item.type === "timer") {
      if (item.endsAt && item.endsAt <= now.getTime()) {
        item.endsAt = undefined;
        item.pausedRemaining = 0;
        item.alerted = "timer";
        alertFor(item, "Time's up!");
        changed = true;
      }
      continue;
    }
    if (!item.time || !occursOn(item, now) || item.alerted === todayKey || item.doneOn === todayKey) continue;
    const at = parseLocal(todayKey, item.time).getTime();
    // Alerts fire at the time; deadlines also get a heads-up 15 minutes early.
    const lead = item.type === "deadline" ? 15 * 60 * 1000 : 0;
    const diff = now.getTime() - (at - lead);
    if (diff >= 0 && diff < ALERT_WINDOW_MS + lead) {
      item.alerted = todayKey;
      alertFor(item, item.type === "deadline" ? `Due at ${fmtTime(new Date(at))}` : `Now · ${fmtTime(new Date(at))}`);
      changed = true;
    }
  }
  if (changed) persist();
}

// ───────────────────────── dialogs: item form ─────────────────────────

const dlgItem = $<HTMLDialogElement>("#dlg-item");
const itemForm = $<HTMLFormElement>("#item-form");

function syncFormFields() {
  const type = (itemForm.elements.namedItem("type") as HTMLSelectElement).value as ItemType;
  $$("[data-for]", itemForm).forEach((el) => {
    const f = el.dataset.for;
    el.hidden = f === "dated" ? type === "timer" : f !== type;
  });
}

function openItemForm(item?: Item, type: ItemType = "schedule") {
  itemForm.reset();
  const f = itemForm.elements as unknown as Record<string, HTMLInputElement>;
  $("#item-form-title").textContent = item ? "Edit item" : "Add item";
  f.id.value = item?.id ?? "";
  f.type.value = item?.type ?? type;
  f.title.value = item?.title ?? "";
  f.date.value = item?.date ?? dateKey(new Date());
  f.time.value = item?.time ?? "";
  f.repeat.value = item?.repeat ?? "none";
  f.priority.value = item?.priority ?? "normal";
  f.progress.value = String(item?.progress ?? 0);
  f.notes.value = item?.notes ?? "";
  const dur = item?.durationSec ?? 25 * 60;
  f.hours.value = String(Math.floor(dur / 3600));
  f.minutes.value = String(Math.floor((dur % 3600) / 60));
  syncFormFields();
  dlgItem.showModal();
  f.title.focus();
}

itemForm.addEventListener("change", (e) => {
  if ((e.target as HTMLElement).getAttribute("name") === "type") syncFormFields();
});

itemForm.addEventListener("submit", () => {
  const data = new FormData(itemForm);
  const get = (k: string) => String(data.get(k) ?? "").trim();
  const type = get("type") as ItemType;
  const existing = items.find((i) => i.id === get("id"));
  const durationSec = (Number(get("hours")) * 3600 + Number(get("minutes")) * 60) || 60;

  const next: Item = {
    ...existing,
    id: existing?.id ?? uid(),
    type,
    title: get("title"),
    date: type === "timer" ? undefined : get("date") || undefined,
    time: type === "timer" ? undefined : get("time") || undefined,
    repeat: type === "timer" ? "none" : (get("repeat") as Item["repeat"]),
    priority: get("priority") as Item["priority"],
    notes: get("notes") || undefined,
    progress: type === "project" ? Number(get("progress")) : undefined,
    done: existing?.done ?? false,
    example: false,
  };
  if (type === "timer") {
    next.durationSec = durationSec;
    if (!existing || existing.durationSec !== durationSec) {
      next.endsAt = undefined;
      next.pausedRemaining = durationSec;
    }
  }
  if (existing && (existing.date !== next.date || existing.time !== next.time)) next.alerted = undefined;

  items = existing ? items.map((i) => (i.id === next.id ? next : i)) : [...items, next];
  persist();
  if (dlgItem.dataset.from === "manage") renderManage();
});

// ───────────────────────── dialogs: manage ─────────────────────────

const dlgManage = $<HTMLDialogElement>("#dlg-manage");
let filter: ItemType | "all" = "all";

function renderManage() {
  $("#filter-row").innerHTML = (["all", ...Object.keys(TYPE_META)] as (ItemType | "all")[])
    .map((t) => {
      const label = t === "all" ? "All" : `${TYPE_META[t].icon} ${TYPE_META[t].label}`;
      const count = t === "all" ? items.length : items.filter((i) => i.type === t).length;
      return `<button class="pill${filter === t ? " active" : ""}" data-filter="${t}">${label} <b>${count}</b></button>`;
    })
    .join("");

  const now = new Date();
  const shown = items
    .filter((i) => filter === "all" || i.type === filter)
    .sort((a, b) => Number(a.done) - Number(b.done) || (nextOccurrence(a, now)?.getTime() ?? Infinity) - (nextOccurrence(b, now)?.getTime() ?? Infinity));

  $("#manage-list").innerHTML = shown.length
    ? shown
        .map((i) => {
          const meta = TYPE_META[i.type];
          const at = nextOccurrence(i, now);
          const when =
            i.type === "timer"
              ? fmtDuration(i.durationSec ?? 0)
              : [i.date ? fmtDay(parseLocal(i.date, "12:00")) : "", i.time && at ? fmtTime(at) : "", i.repeat !== "none" ? `↻ ${i.repeat}` : ""]
                  .filter(Boolean)
                  .join(" · ");
          return `<li class="m-item${i.done ? " done" : ""}" style="--c:${meta.color}">
            <input type="checkbox" ${i.done ? "checked" : ""} data-toggle="${i.id}" aria-label="Done" />
            <span class="m-icon">${meta.icon}</span>
            <span class="m-body"><span class="m-title">${esc(i.title)}${i.priority === "high" ? " ★" : ""}${i.example ? ` <small class="muted">example</small>` : ""}</span>
              <span class="m-when">${when}${i.type === "project" ? ` · ${i.progress ?? 0}%` : ""}${i.notes ? ` · ${esc(i.notes)}` : ""}</span></span>
            <button class="btn btn-small" data-edit="${i.id}">Edit</button>
            <button class="btn btn-small" data-delete="${i.id}" aria-label="Delete">✕</button>
          </li>`;
        })
        .join("")
    : `<li class="muted">Nothing here yet.</li>`;
}

dlgManage.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-filter],[data-edit],[data-delete],[data-toggle]");
  if (!el) return;
  if (el.dataset.filter) filter = el.dataset.filter as typeof filter;
  if (el.dataset.delete) items = items.filter((i) => i.id !== el.dataset.delete);
  if (el.dataset.toggle) {
    const item = items.find((i) => i.id === el.dataset.toggle);
    if (item) item.done = !item.done;
  }
  if (el.dataset.edit) {
    dlgItem.dataset.from = "manage";
    openItemForm(items.find((i) => i.id === el.dataset.edit));
    return;
  }
  persist();
  renderManage();
});

$("#btn-clear-done").onclick = () => {
  items = items.filter((i) => !i.done);
  persist();
  renderManage();
};

// ───────────────────────── dialogs: settings ─────────────────────────

const dlgSettings = $<HTMLDialogElement>("#dlg-settings");
const settingsForm = $<HTMLFormElement>("#settings-form");
let pendingLocation: Settings["location"] | undefined;

function openSettings() {
  const f = settingsForm.elements as unknown as Record<string, HTMLInputElement>;
  pendingLocation = undefined;
  f.place.value = settings.location.name;
  f.sign.value = settings.sign;
  f.speed.value = String(settings.speed);
  f.sound.checked = settings.sound;
  f.notify.checked = localStorage.getItem("daily-ticker:notify") === "1" && "Notification" in window && Notification.permission === "granted";
  $("#geo-status").textContent = "";
  dlgSettings.showModal();
}

async function geocode() {
  const place = (settingsForm.elements.namedItem("place") as HTMLInputElement).value.trim();
  if (!place) return;
  $("#geo-status").textContent = "Searching…";
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&countryCode=US`);
    const { results } = await res.json();
    if (!results?.length) throw new Error("none");
    const r = results[0];
    pendingLocation = { name: `${r.name}, ${r.admin1_code ?? r.admin1 ?? r.country_code}`, lat: r.latitude, lon: r.longitude };
    $("#geo-status").textContent = `✓ ${pendingLocation.name} — press Save to apply`;
  } catch {
    $("#geo-status").textContent = "Couldn't find that place.";
  }
}

$("#btn-geo").onclick = geocode;

settingsForm.addEventListener("submit", async () => {
  const f = settingsForm.elements as unknown as Record<string, HTMLInputElement>;
  const signChanged = f.sign.value !== settings.sign;
  const locChanged = !!pendingLocation;
  settings = {
    ...settings,
    location: pendingLocation ?? settings.location,
    sign: f.sign.value,
    speed: Number(f.speed.value),
    sound: f.sound.checked,
  };
  saveSettings(settings);
  if (f.notify.checked && "Notification" in window) {
    const perm = await Notification.requestPermission();
    localStorage.setItem("daily-ticker:notify", perm === "granted" ? "1" : "0");
  } else {
    localStorage.setItem("daily-ticker:notify", "0");
  }
  retime();
  if (signChanged) loadHoroscope();
  if (locChanged) loadWeather();
});

$("#btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify({ items, settings }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `daily-ticker-${dateKey(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

$<HTMLInputElement>("#file-import").onchange = async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming: Item[] = Array.isArray(data) ? data : data.items;
    if (!Array.isArray(incoming)) throw new Error("bad file");
    const ids = new Set(items.map((i) => i.id));
    items = [...items.filter((i) => !i.example), ...incoming.filter((i) => i.id && i.title && i.type in TYPE_META && !ids.has(i.id))];
    persist();
    $("#geo-status").textContent = `Imported ${incoming.length} items.`;
  } catch {
    $("#geo-status").textContent = "That file isn't a Daily Ticker export.";
  }
};

// ───────────────────────── wiring ─────────────────────────

$$("[data-close]").forEach((b) => (b.onclick = () => (b.closest("dialog") as HTMLDialogElement).close()));
dlgItem.addEventListener("close", () => delete dlgItem.dataset.from);

$("#btn-add").onclick = () => openItemForm();
$("#btn-manage").onclick = () => {
  renderManage();
  dlgManage.showModal();
};
$("#btn-settings").onclick = openSettings;

async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen().catch(() => {});
  }
}
$("#btn-full").onclick = toggleFullscreen;

// Keep the screen awake while fullscreen, for wall-mounted displays.
let wakeLock: { release(): Promise<void> } | undefined;
document.addEventListener("fullscreenchange", async () => {
  try {
    if (document.fullscreenElement && "wakeLock" in navigator) {
      wakeLock = await (navigator as any).wakeLock.request("screen");
    } else {
      await wakeLock?.release();
      wakeLock = undefined;
    }
  } catch {
    // wake lock unsupported or denied
  }
});

document.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-timer],[data-done]");
  if (!el) return;
  if (el.dataset.timer) timerAction(el.dataset.id!, el.dataset.timer);
  if (el.dataset.done) {
    const item = items.find((i) => i.id === el.dataset.done);
    if (!item) return;
    el.closest("li")?.classList.add("leaving");
    setTimeout(() => {
      // A repeating item is only finished for today; it returns on its next occurrence.
      if (item.repeat === "none") item.done = true;
      else item.doneOn = dateKey(new Date());
      persist();
    }, 350);
  }
});

$<HTMLFormElement>("#quick-timer").addEventListener("submit", (e) => {
  e.preventDefault();
  const mins = Number((e.target as HTMLFormElement).minutes.value) || 10;
  unlockAudio();
  items.push({
    id: uid(),
    type: "timer",
    title: `${mins}-min timer`,
    durationSec: mins * 60,
    endsAt: Date.now() + mins * 60000,
    priority: "normal",
    repeat: "none",
    done: false,
  });
  persist();
});

document.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "n") openItemForm();
  if (e.key === "m") $("#btn-manage").click();
  if (e.key === "f") toggleFullscreen();
});

// Other tabs editing the same items stay in sync.
window.addEventListener("storage", (e) => {
  if (e.key === "daily-ticker:items") {
    items = loadItems();
    renderAll();
  }
});

function renderAll() {
  renderMineTape();
  renderToday();
  renderTimers();
}

// ───────────────────────── boot ─────────────────────────

renderClock();
renderAll();
loadWeather();
loadHoroscope();
const DESKS = ["world", "national", "metro"];
DESKS.forEach(loadNews);

let lastDay = dateKey(new Date());
let lastMinute = new Date().getMinutes();
setInterval(() => {
  renderClock();
  tickLiveText();
  checkAlerts();
  $$(".timer").forEach((el) => {
    const id = $(".live-timer", el)?.dataset.id;
    const t = items.find((i) => i.id === id);
    if (t) el.style.setProperty("--pct", `${Math.min(100, (1 - timerRemaining(t) / (t.durationSec ?? 1)) * 100)}%`);
  });
  const now = new Date();
  if (now.getMinutes() !== lastMinute) {
    lastMinute = now.getMinutes();
    renderToday();
  }
  if (dateKey(now) !== lastDay) {
    lastDay = dateKey(now);
    renderAll();
    loadHoroscope();
    loadWeather();
  }
}, 1000);

setInterval(() => DESKS.forEach(loadNews), 10 * 60 * 1000);
setInterval(loadWeather, 60 * 60 * 1000);
setInterval(renderMineTape, 15 * 60 * 1000);

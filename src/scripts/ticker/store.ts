export type ItemType = "schedule" | "project" | "deadline" | "event" | "reminder" | "timer";
export type Priority = "low" | "normal" | "high";
export type Repeat = "none" | "daily" | "weekdays" | "weekly";

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  /** YYYY-MM-DD, local time. Projects use it as the due date. */
  date?: string;
  /** HH:MM, 24h local time. */
  time?: string;
  notes?: string;
  priority: Priority;
  repeat: Repeat;
  done: boolean;
  /** Repeating items only: the date key they were checked off for. */
  doneOn?: string;
  /** Projects only, 0–100. */
  progress?: number;
  /** Timers only. */
  durationSec?: number;
  endsAt?: number;
  pausedRemaining?: number;
  /** Date key (or "timer") of the last alert, so each occurrence alerts once. */
  alerted?: string;
  example?: boolean;
}

export interface Settings {
  location: { name: string; lat: number; lon: number };
  sign: string;
  speed: number;
  sound: boolean;
}

export const TYPE_META: Record<ItemType, { label: string; icon: string; color: string }> = {
  schedule: { label: "Schedule", icon: "🗓️", color: "#38bdf8" },
  project: { label: "Project", icon: "🚀", color: "#a78bfa" },
  deadline: { label: "Deadline", icon: "⏰", color: "#f87171" },
  event: { label: "Event", icon: "🎉", color: "#fbbf24" },
  reminder: { label: "Reminder", icon: "🔔", color: "#34d399" },
  timer: { label: "Timer", icon: "⏱️", color: "#fb923c" },
};

const ITEMS_KEY = "daily-ticker:items";
const SETTINGS_KEY = "daily-ticker:settings";

export const DEFAULT_SETTINGS: Settings = {
  location: { name: "Detroit, MI", lat: 42.3314, lon: -83.0458 },
  sign: "Capricorn",
  speed: 1,
  sound: true,
};

function read<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked; the session keeps working in memory
  }
}

export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function parseLocal(date: string, time?: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time ?? "23:59").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function examples(): Item[] {
  const today = new Date();
  const plus = (n: number) => dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + n));
  const base = { priority: "normal" as Priority, repeat: "none" as Repeat, done: false, example: true };
  return [
    { ...base, id: uid(), type: "schedule", title: "Morning stand-up", date: plus(0), time: "09:00", repeat: "weekdays" },
    { ...base, id: uid(), type: "schedule", title: "Gym — leg day", date: plus(0), time: "18:00" },
    { ...base, id: uid(), type: "deadline", title: "Submit quarterly report", date: plus(1), time: "17:00", priority: "high" },
    { ...base, id: uid(), type: "project", title: "Website redesign", date: plus(12), progress: 45 },
    { ...base, id: uid(), type: "event", title: "Lions game at Ford Field", date: plus(4), time: "13:00" },
    { ...base, id: uid(), type: "reminder", title: "Call Mom", date: plus(0), time: "19:30", priority: "high" },
    { ...base, id: uid(), type: "timer", title: "Focus sprint", durationSec: 25 * 60, pausedRemaining: 25 * 60 },
  ];
}

export function loadItems(): Item[] {
  return read<Item[]>(ITEMS_KEY) ?? examples();
}

export function saveItems(items: Item[]) {
  write(ITEMS_KEY, items);
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(SETTINGS_KEY) };
}

export function saveSettings(settings: Settings) {
  write(SETTINGS_KEY, settings);
}

/** Whether a dated item (or its repeat) falls on `day`. */
export function occursOn(item: Item, day: Date): boolean {
  if (!item.date) return false;
  const start = parseLocal(item.date, "00:00");
  const key = dateKey(day);
  if (key === item.date) return true;
  if (item.repeat === "none" || day < start) return false;
  if (item.repeat === "daily") return true;
  if (item.repeat === "weekdays") return day.getDay() > 0 && day.getDay() < 6;
  if (item.repeat === "weekly") return day.getDay() === start.getDay();
  return false;
}

/** The next moment this item happens at or after `now`, or its due moment if past and not repeating. */
export function nextOccurrence(item: Item, now: Date): Date | undefined {
  if (item.type === "timer") return item.endsAt ? new Date(item.endsAt) : undefined;
  if (!item.date) return undefined;
  if (item.repeat === "none") return parseLocal(item.date, item.time);
  for (let i = 0; i < 8; i++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (!occursOn(item, day) || dateKey(day) === item.doneOn) continue;
    const at = parseLocal(dateKey(day), item.time);
    if (at >= now || !item.time) return at;
  }
  return undefined;
}

export function timerRemaining(item: Item, now = Date.now()): number {
  if (item.endsAt) return Math.max(0, Math.round((item.endsAt - now) / 1000));
  return item.pausedRemaining ?? item.durationSec ?? 0;
}

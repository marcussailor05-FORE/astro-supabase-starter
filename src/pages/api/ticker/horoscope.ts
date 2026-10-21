import type { APIRoute } from "astro";

export const prerender = false;

interface Reading {
  sign: string;
  date: string;
  text: string;
  source: string;
  live: boolean;
}

type Provider = (sign: string) => Promise<string | undefined>;

const PROVIDERS: { name: string; get: Provider }[] = [
  {
    name: "horoscope-app-api",
    get: async (sign) => {
      const res = await fetch(
        `https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${sign}&day=TODAY`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return undefined;
      const json = await res.json();
      return json?.data?.horoscope_data;
    },
  },
  {
    name: "ohmanda",
    get: async (sign) => {
      const res = await fetch(`https://ohmanda.com/api/horoscope/${sign.toLowerCase()}/`, {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return undefined;
      const json = await res.json();
      return json?.horoscope;
    },
  },
];

// Used only when every provider is unreachable; seeded by date so it's stable for the day.
const OPENERS = [
  "Saturn, your ruler, rewards the steady climb today.",
  "The Moon lights up your sector of ambition.",
  "A quiet trine sharpens your focus.",
  "Venus softens your usual all-business approach.",
  "Mars hands you extra drive before noon.",
  "Mercury favors careful words and clear plans.",
];
const MIDDLES = [
  "Tackle the task you've been circling — momentum builds once you start.",
  "A conversation with a colleague or friend opens a practical door.",
  "Review the details twice; a small fix now saves hours later.",
  "Say yes to help that's offered; you don't have to carry it all.",
  "Money matters look brighter when you trim one unnecessary cost.",
  "Your patience is your edge — let others rush while you get it right.",
];
const CLOSERS = [
  "Evening favors rest over one more checklist item.",
  "Lucky number: {n}. Best hours: late afternoon.",
  "Make time for someone who makes you laugh.",
  "Wrap up early and enjoy a well-earned win.",
  "Lucky color: deep green. Trust your long game.",
  "Write down tomorrow's top three before bed.",
];

function seeded(date: string) {
  let h = 2166136261;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function offlineReading(date: string): string {
  const rand = seeded(`capricorn-${date}`);
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  return [pick(OPENERS), pick(MIDDLES), pick(CLOSERS)].join(" ").replace("{n}", String(1 + Math.floor(rand() * 40)));
}

const cache = new Map<string, Reading>();

export const GET: APIRoute = async ({ url }) => {
  const sign = (url.searchParams.get("sign") ?? "Capricorn").replace(/^\w/, (c) => c.toUpperCase());
  const date = url.searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const key = `${sign}-${date}`;

  const cached = cache.get(key);
  if (cached?.live) return Response.json(cached, { headers: { "Cache-Control": "public, s-maxage=3600" } });

  for (const provider of PROVIDERS) {
    try {
      const text = await provider.get(sign);
      if (text && text.length > 20) {
        const reading = { sign, date, text: text.trim(), source: provider.name, live: true };
        cache.set(key, reading);
        return Response.json(reading, { headers: { "Cache-Control": "public, s-maxage=3600" } });
      }
    } catch {
      // try the next provider
    }
  }

  const reading = { sign, date, text: offlineReading(date), source: "offline", live: false };
  return Response.json(reading, { headers: { "Cache-Control": "public, s-maxage=600" } });
};

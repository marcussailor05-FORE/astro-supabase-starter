export interface DayForecast {
  date: string;
  code: number;
  high: number;
  low: number;
  precip: number;
}

export interface Location {
  name: string;
  lat: number;
  lon: number;
}

export const DETROIT: Location = { name: "Detroit, MI", lat: 42.3314, lon: -83.0458 };

export async function fetchForecast(loc: Location): Promise<DayForecast[]> {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: "7",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const { daily } = await res.json();
  return daily.time.map((date: string, i: number) => ({
    date,
    code: daily.weather_code[i],
    high: Math.round(daily.temperature_2m_max[i]),
    low: Math.round(daily.temperature_2m_min[i]),
    precip: daily.precipitation_probability_max[i] ?? 0,
  }));
}

type Kind = "sun" | "partly" | "cloud" | "fog" | "drizzle" | "rain" | "sleet" | "snow" | "storm";

/** Maps WMO weather interpretation codes to an icon and label. */
export function describe(code: number): { kind: Kind; label: string } {
  if (code === 0) return { kind: "sun", label: "Sunny" };
  if (code === 1) return { kind: "partly", label: "Mostly sunny" };
  if (code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "cloud", label: "Cloudy" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 55) return { kind: "drizzle", label: "Drizzle" };
  if (code === 56 || code === 57 || code === 66 || code === 67) return { kind: "sleet", label: "Freezing rain" };
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return { kind: "rain", label: code >= 80 ? "Showers" : "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: "snow", label: "Snow" };
  if (code >= 95) return { kind: "storm", label: "Thunderstorms" };
  return { kind: "cloud", label: "Cloudy" };
}

const SUN = `<circle cx="24" cy="24" r="9" fill="url(#g-sun)"/>
  <g stroke="#FDB813" stroke-width="3" stroke-linecap="round">
    <path d="M24 5v5M24 38v5M5 24h5M38 24h5M10.6 10.6l3.5 3.5M33.9 33.9l3.5 3.5M10.6 37.4l3.5-3.5M33.9 14.1l3.5-3.5"/>
  </g>`;
const SMALL_SUN = `<circle cx="17" cy="17" r="7" fill="url(#g-sun)"/>
  <g stroke="#FDB813" stroke-width="2.5" stroke-linecap="round">
    <path d="M17 3v4M3 17h4M7 7l2.8 2.8M27 7l-2.8 2.8M7 27l2.8-2.8"/>
  </g>`;
const CLOUD = (fill = "url(#g-cloud)") =>
  `<path d="M14 38h22a8 8 0 0 0 1-15.9A11 11 0 0 0 16 20a9 9 0 0 0-2 18z" fill="${fill}"/>`;
const DROPS = (color: string) => `<g stroke="${color}" stroke-width="3" stroke-linecap="round">
    <path d="M17 41l-2 4M25 41l-2 4M33 41l-2 4"/></g>`;

const DEFS = `<defs>
  <radialGradient id="g-sun" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFF176"/><stop offset="1" stop-color="#FF9F1C"/></radialGradient>
  <linearGradient id="g-cloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#C9D6E8"/></linearGradient>
  <linearGradient id="g-dark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A3B1C6"/><stop offset="1" stop-color="#5E6E87"/></linearGradient>
</defs>`;

const BODIES: Record<Kind, string> = {
  sun: SUN,
  partly: `${SMALL_SUN}${CLOUD()}`,
  cloud: `<path d="M10 30h18a6 6 0 0 0 .5-12A8.5 8.5 0 0 0 12 17a6.5 6.5 0 0 0-2 13z" fill="#9FB0C8"/>${CLOUD()}`,
  fog: `${CLOUD()}<g stroke="#B8C4D6" stroke-width="3" stroke-linecap="round"><path d="M9 42h30M13 46h22"/></g>`,
  drizzle: `${CLOUD()}<g fill="#4FC3F7"><circle cx="17" cy="43" r="1.8"/><circle cx="25" cy="44" r="1.8"/><circle cx="33" cy="43" r="1.8"/></g>`,
  rain: `${CLOUD("url(#g-dark)")}${DROPS("#29B6F6")}`,
  sleet: `${CLOUD("url(#g-dark)")}${DROPS("#80DEEA")}<g fill="#E0F7FA"><circle cx="21" cy="45" r="1.6"/><circle cx="29" cy="45" r="1.6"/></g>`,
  snow: `${CLOUD()}<g fill="#90CAF9" font-size="9" font-family="sans-serif" text-anchor="middle"><text x="17" y="47">❄</text><text x="27" y="47">❄</text><text x="36" y="47">❄</text></g>`,
  storm: `${CLOUD("url(#g-dark)")}<path d="M26 34l-6 8h5l-3 7 9-10h-5l3-5z" fill="#FFD54F" stroke="#F57F17" stroke-width="1"/>`,
};

export function weatherIcon(code: number, size = 44): string {
  const { kind, label } = describe(code);
  return `<svg viewBox="0 0 48 50" width="${size}" height="${size}" role="img" aria-label="${label}">${DEFS}${BODIES[kind]}</svg>`;
}

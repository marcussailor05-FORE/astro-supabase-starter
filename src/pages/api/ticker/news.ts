import type { APIRoute } from "astro";
import { fetchFeed, type NewsItem } from "../../../utils/rss";

export const prerender = false;

interface FeedSource {
  url: string;
  source: string;
}

const googleNews = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;

// Each desk pulls from several outlets; any that fail are skipped.
const DESKS: Record<string, FeedSource[]> = {
  world: [
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
    { url: "https://feeds.npr.org/1004/rss.xml", source: "NPR" },
    { url: "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en", source: "Google News" },
  ],
  national: [
    { url: "https://feeds.npr.org/1003/rss.xml", source: "NPR" },
    { url: "https://feeds.abcnews.com/abcnews/usheadlines", source: "ABC News" },
    { url: "https://news.google.com/rss/headlines/section/topic/NATION?hl=en-US&gl=US&ceid=US:en", source: "Google News" },
  ],
  metro: [
    { url: googleNews('"metro Detroit" OR Detroit OR Dearborn OR "Oakland County" OR "Macomb County" when:2d'), source: "Google News" },
    { url: "https://www.clickondetroit.com/arc/outboundfeeds/rss/category/news/local/?outputType=xml", source: "WDIV Local 4" },
    { url: "https://www.wxyz.com/news/local-news.rss", source: "WXYZ 7" },
    { url: "https://www.michiganpublic.org/news.rss", source: "Michigan Public" },
  ],
};

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; items: NewsItem[] }>();

function interleave(lists: NewsItem[][], limit: number): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (let i = 0; out.length < limit && lists.some((list) => i < list.length); i++) {
    for (const list of lists) {
      const item = list[i];
      if (!item) continue;
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out.slice(0, limit);
}

export const GET: APIRoute = async ({ url }) => {
  const desk = url.searchParams.get("desk") ?? "world";
  const sources = DESKS[desk];
  if (!sources) {
    return Response.json({ error: `Unknown desk "${desk}"` }, { status: 400 });
  }

  const cached = cache.get(desk);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return Response.json({ desk, items: cached.items, cached: true }, { headers: cacheHeaders() });
  }

  const results = await Promise.allSettled(sources.map((s) => fetchFeed(s.url, s.source)));
  const lists = results.flatMap((r) => (r.status === "fulfilled" ? [r.value.slice(0, 15)] : []));
  const items = interleave(lists, 24);

  if (items.length === 0) {
    if (cached) {
      return Response.json({ desk, items: cached.items, stale: true }, { headers: cacheHeaders() });
    }
    return Response.json({ desk, items: [], error: "All feeds unavailable" }, { status: 502 });
  }

  cache.set(desk, { at: Date.now(), items });
  return Response.json({ desk, items }, { headers: cacheHeaders() });
};

function cacheHeaders() {
  return { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" };
}

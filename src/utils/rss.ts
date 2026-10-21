export interface NewsItem {
  title: string;
  link: string;
  source?: string;
  published?: string;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
};

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return match ? decode(match[1]) : undefined;
}

/** Parses RSS 2.0 `<item>` and Atom `<entry>` elements without a DOM. */
export function parseFeed(xml: string, fallbackSource?: string): NewsItem[] {
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) ?? [];
  const items: NewsItem[] = [];

  for (const block of blocks) {
    let title = tag(block, "title");
    if (!title) continue;

    let link = tag(block, "link");
    if (!link) {
      link = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    }

    let source = tag(block, "source") ?? fallbackSource;
    // Google News appends " - Publisher" to every headline; move it to `source`.
    const suffix = title.match(/^(.*)\s+-\s+([^-]{2,60})$/);
    if (suffix && (!source || suffix[2] === source)) {
      title = suffix[1];
      source = suffix[2];
    }

    items.push({
      title,
      link: link ?? "",
      source,
      published: tag(block, "pubDate") ?? tag(block, "updated") ?? tag(block, "published"),
    });
  }

  return items;
}

export async function fetchFeed(url: string, source?: string, timeoutMs = 8000): Promise<NewsItem[]> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; DailyTicker/1.0)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${url} responded ${response.status}`);
  }
  return parseFeed(await response.text(), source);
}

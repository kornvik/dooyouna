import RSSParser from "rss-parser";
import type { NewsArticle } from "@/types";

const FETCH_TIMEOUT_MS = 15_000;

interface FeedConfig {
  name: string;
  url: string;
  weight: number;
}

const FEEDS: FeedConfig[] = [
  { name: "Bangkok Post", url: "https://www.bangkokpost.com/rss/data/topstories.xml", weight: 5 },
  { name: "The Nation Thailand", url: "https://www.nationthailand.com/rss", weight: 4 },
  { name: "Khmer Times", url: "https://www.khmertimeskh.com/feed/", weight: 5 },
  { name: "Phnom Penh Post", url: "https://www.phnompenhpost.com/rss.xml", weight: 4 },
  { name: "CNA Southeast Asia", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511", weight: 3 },
  { name: "GDACS Disasters", url: "https://www.gdacs.org/xml/rss.xml", weight: 3 },
  { name: "ReliefWeb Thailand", url: "https://reliefweb.int/updates/rss.xml?search=Thailand", weight: 2 },
  { name: "ReliefWeb Cambodia", url: "https://reliefweb.int/updates/rss.xml?search=Cambodia", weight: 2 },
];

const MAX_ITEMS_PER_FEED = 10;
const MAX_TOTAL_ARTICLES = 50;
const SUMMARY_MAX_LENGTH = 200;

function trimSummary(raw: string | undefined): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (trimmed.length <= SUMMARY_MAX_LENGTH) return trimmed;
  return trimmed.slice(0, SUMMARY_MAX_LENGTH);
}

async function parseFeed(
  feed: FeedConfig,
  parser: RSSParser,
): Promise<NewsArticle[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let xml: string;
    try {
      const response = await fetch(feed.url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      xml = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    const parsed = await parser.parseString(xml);
    const items = parsed.items.slice(0, MAX_ITEMS_PER_FEED);

    return items.map((entry) => ({
      title: entry.title ?? "",
      link: entry.link ?? "",
      source: feed.name,
      weight: feed.weight,
      published: entry.pubDate ?? entry.isoDate ?? "",
      summary: trimSummary(entry.contentSnippet),
    }));
  } catch (err) {
    console.error(`RSS error for ${feed.name}:`, err);
    return [];
  }
}

export async function fetchNews(): Promise<NewsArticle[]> {
  const parser = new RSSParser();

  const results = await Promise.all(
    FEEDS.map((feed) => parseFeed(feed, parser)),
  );

  const allArticles = results.flat();

  allArticles.sort((a, b) => b.weight - a.weight);

  return allArticles.slice(0, MAX_TOTAL_ARTICLES);
}

import RSSParser from "rss-parser";
import type { NewsArticle } from "@/types";

const FETCH_TIMEOUT_MS = 15_000;

interface FeedConfig {
  name: string;
  url: string;
}

const FEEDS: FeedConfig[] = [
  // Thai news — reliable sources
  { name: "Bangkok Post", url: "https://www.bangkokpost.com/rss/data/topstories.xml" },
  { name: "Prachatai English", url: "https://prachataienglish.com/feed" },
  // Cambodia news
  { name: "CNA Southeast Asia", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511" },
  // Regional security & disasters
  { name: "GDACS Disasters", url: "https://www.gdacs.org/xml/rss.xml" },
  // Google News for targeted topics (more reliable than individual sites)
  { name: "Thailand News", url: "https://news.google.com/rss/search?q=Thailand+when:3d&hl=en&gl=US&ceid=US:en" },
  { name: "Cambodia News", url: "https://news.google.com/rss/search?q=Cambodia+when:3d&hl=en&gl=US&ceid=US:en" },
  { name: "Myanmar News", url: "https://news.google.com/rss/search?q=Myanmar+military+OR+conflict+when:3d&hl=en&gl=US&ceid=US:en" },
  { name: "SE Asia Security", url: "https://news.google.com/rss/search?q=Southeast+Asia+security+OR+military+OR+disaster+when:3d&hl=en&gl=US&ceid=US:en" },
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

// Region keywords — article must mention one of these places
const REGION_KEYWORDS = [
  "thailand", "thai", "cambodia", "khmer", "myanmar", "burma", "laos", "vietnam",
  "southeast asia", "asean", "mekong", "andaman", "south china sea",
  "bangkok", "pattaya", "chiang mai", "chiang rai", "phuket", "phnom penh",
  "siem reap", "yangon", "mandalay", "hanoi", "vientiane",
];

// Risk keywords — each match adds +2 to risk score (capped at 10)
const RISK_KEYWORDS = [
  "flood", "earthquake", "tsunami", "disaster", "crisis", "emergency",
  "military", "conflict", "attack", "war", "missile", "strike",
  "fire", "wildfire", "hotspot", "pm2.5", "pollution", "haze",
  "explosion", "nuclear", "clash", "tension", "protest", "coup",
  "drought", "storm", "typhoon", "cyclone", "landslide",
];

// Pre-compiled regex for each risk keyword (word-boundary match)
const RISK_PATTERNS = RISK_KEYWORDS.map((kw) => new RegExp(`\\b${kw}\\b`, "i"));

/** Calculate risk score (1–10) based on keyword matches in title + summary */
export function calculateRiskScore(title: string, summary: string): number {
  const text = `${title} ${summary}`;
  let score = 1;
  for (const pattern of RISK_PATTERNS) {
    if (pattern.test(text)) score += 2;
  }
  return Math.min(score, 10);
}

function isRelevant(article: NewsArticle): boolean {
  const text = `${article.title} ${article.summary}`.toLowerCase();
  return REGION_KEYWORDS.some(kw => text.includes(kw));
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

    return items.map((entry) => {
      const title = entry.title ?? "";
      const summary = trimSummary(entry.contentSnippet);
      return {
        title,
        link: entry.link ?? "",
        source: feed.name,
        weight: calculateRiskScore(title, summary),
        published: entry.pubDate ?? entry.isoDate ?? "",
        summary,
      };
    });
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

  const allArticles = results.flat().filter(isRelevant);

  // Sort by risk score (content keywords) then by date
  allArticles.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return new Date(b.published).getTime() - new Date(a.published).getTime();
  });

  return allArticles.slice(0, MAX_TOTAL_ARTICLES);
}

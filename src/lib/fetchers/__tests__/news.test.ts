import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock rss-parser before importing the module
vi.mock("rss-parser", () => {
  const MockParser = vi.fn();
  MockParser.prototype.parseString = vi.fn();
  return { default: MockParser };
});

import RSSParser from "rss-parser";
import { fetchNews, calculateRiskScore } from "../news";

const mockParseString = RSSParser.prototype.parseString as ReturnType<typeof vi.fn>;

function makeFeedResult(
  items: Array<{
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
    contentSnippet?: string;
  }>,
) {
  return { items };
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Default: fetch returns XML text, parseString returns items
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue("<xml/>"),
    }),
  );
});

describe("calculateRiskScore", () => {
  it("returns 1 for articles with no risk keywords", () => {
    expect(calculateRiskScore("Bangkok traffic report", "Roads are busy today.")).toBe(1);
  });

  it("adds 2 per keyword match", () => {
    // "flood" = +2 → 3
    expect(calculateRiskScore("Thailand flood warning", "")).toBe(3);
    // "military" + "conflict" = +4 → 5
    expect(calculateRiskScore("Military conflict in Myanmar", "")).toBe(5);
  });

  it("caps at 10", () => {
    // flood, disaster, crisis, emergency, storm, landslide = 6 keywords * 2 = 12 + 1 = 13 → capped at 10
    expect(calculateRiskScore("flood disaster crisis emergency storm landslide", "")).toBe(10);
  });

  it("checks both title and summary", () => {
    expect(calculateRiskScore("Breaking news", "earthquake near Bangkok")).toBe(3);
  });
});

describe("fetchNews", () => {
  it("returns articles mapped from all 8 feeds", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Thailand military exercises begin",
          link: "https://example.com/1",
          pubDate: "2024-01-01",
          contentSnippet: "A short summary about Thailand.",
        },
      ]),
    );

    const articles = await fetchNews();

    // 8 feeds * 1 article each = 8 articles (all pass relevance filter)
    expect(articles).toHaveLength(8);
    expect(articles[0]).toMatchObject({
      title: "Thailand military exercises begin",
      link: "https://example.com/1",
      published: "2024-01-01",
      summary: "A short summary about Thailand.",
    });
  });

  it("sorts articles by risk score descending then by date", async () => {
    let callCount = 0;
    mockParseString.mockImplementation(() => {
      callCount++;
      // First feed: high-risk article
      if (callCount === 1) {
        return makeFeedResult([{ title: "Thailand military conflict escalates", link: "https://x.com/1", pubDate: "2024-01-01" }]);
      }
      // Other feeds: low-risk article
      return makeFeedResult([{ title: "Bangkok weather update", link: "https://x.com/2", pubDate: "2024-01-02" }]);
    });

    const articles = await fetchNews();

    // "military conflict" = 1+2+2=5, "Bangkok weather" = 1 — high risk should come first
    expect(articles[0].weight).toBeGreaterThan(articles[articles.length - 1].weight);
  });

  it("caps total articles at 50", async () => {
    // Return 10 items per feed (8 feeds * 10 = 80 > 50)
    const tenItems = Array.from({ length: 10 }, (_, i) => ({
      title: `Thailand earthquake report ${i}`,
      link: `https://example.com/${i}`,
      pubDate: "2024-01-01",
    }));
    mockParseString.mockResolvedValue(makeFeedResult(tenItems));

    const articles = await fetchNews();

    expect(articles.length).toBeLessThanOrEqual(50);
  });

  it("takes only top 10 items per feed", async () => {
    const fifteenItems = Array.from({ length: 15 }, (_, i) => ({
      title: `Cambodia government update ${i}`,
      link: `https://example.com/${i}`,
      pubDate: "2024-01-01",
    }));
    mockParseString.mockResolvedValue(makeFeedResult(fifteenItems));

    const articles = await fetchNews();

    // 8 feeds * 10 items = 80 but capped at 50
    expect(articles.length).toBe(50);
  });

  it("trims summary to 200 characters", async () => {
    const longText = "Thailand flood warning ".repeat(20);
    mockParseString.mockResolvedValue(
      makeFeedResult([
        { title: "Thailand alert", link: "https://x.com", contentSnippet: longText },
      ]),
    );

    const articles = await fetchNews();

    expect(articles[0].summary.length).toBe(200);
  });

  it("handles empty contentSnippet gracefully", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "Myanmar conflict escalates", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    expect(articles[0].summary).toBe("");
  });

  it("uses isoDate when pubDate is absent", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Thai military drill",
          link: "https://x.com",
          isoDate: "2024-06-15T10:00:00Z",
        },
      ]),
    );

    const articles = await fetchNews();

    expect(articles[0].published).toBe("2024-06-15T10:00:00Z");
  });

  it("skips feeds that fail and returns remaining", async () => {
    let callCount = 0;
    mockParseString.mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new Error("Parse failed");
      return makeFeedResult([{ title: "Cambodia election update", link: "https://x.com" }]);
    });

    const articles = await fetchNews();

    // One feed failed out of 8, so 7 articles remain
    expect(articles).toHaveLength(7);
  });

  it("skips feeds where fetch fails (HTTP error)", async () => {
    let fetchCallCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          return Promise.resolve({ ok: false, status: 500, statusText: "Internal Server Error" });
        }
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("<xml/>"),
        });
      }),
    );
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "ASEAN security summit", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    expect(articles).toHaveLength(7);
  });

  it("assigns correct source name to each article", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "Thailand earthquake report", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    const sources = articles.map((a) => a.source);
    expect(sources).toContain("Bangkok Post");
    expect(sources).toContain("Prachatai English");
    expect(sources).toContain("CNA Southeast Asia");
    expect(sources).toContain("GDACS Disasters");
  });

  it("returns empty array when all feeds fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const articles = await fetchNews();

    expect(articles).toEqual([]);
  });

  it("filters out articles without relevant keywords", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Celebrity gossip and entertainment news",
          link: "https://example.com/gossip",
          pubDate: "2024-01-01",
          contentSnippet: "Latest celebrity dating rumors and fashion trends.",
        },
      ]),
    );

    const articles = await fetchNews();

    // No relevant keywords in title or summary, so all articles are filtered out
    expect(articles).toHaveLength(0);
  });

  it("keeps articles that match relevant keywords in title", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Thailand floods displace thousands",
          link: "https://example.com/flood",
          pubDate: "2024-01-01",
          contentSnippet: "Heavy rains cause widespread damage.",
        },
      ]),
    );

    const articles = await fetchNews();

    // "Thailand" and "flood" are relevant keywords
    expect(articles).toHaveLength(8);
    expect(articles[0].title).toBe("Thailand floods displace thousands");
  });

  it("keeps articles that match region keywords in summary only", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Breaking: Major event unfolds",
          link: "https://example.com/event",
          pubDate: "2024-01-01",
          contentSnippet: "The earthquake struck near Bangkok at 3am.",
        },
      ]),
    );

    const articles = await fetchNews();

    // "Bangkok" is a region keyword in the summary
    expect(articles).toHaveLength(8);
  });
});

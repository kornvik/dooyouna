import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock rss-parser before importing the module
vi.mock("rss-parser", () => {
  const MockParser = vi.fn();
  MockParser.prototype.parseString = vi.fn();
  return { default: MockParser };
});

import RSSParser from "rss-parser";
import { fetchNews } from "../news";

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

describe("fetchNews", () => {
  it("returns articles mapped from all 8 feeds", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "Test Article",
          link: "https://example.com/1",
          pubDate: "2024-01-01",
          contentSnippet: "A short summary.",
        },
      ]),
    );

    const articles = await fetchNews();

    // 8 feeds * 1 article each = 8 articles
    expect(articles).toHaveLength(8);
    expect(articles[0]).toMatchObject({
      title: "Test Article",
      link: "https://example.com/1",
      published: "2024-01-01",
      summary: "A short summary.",
    });
  });

  it("sorts articles by weight descending", async () => {
    // Each feed call returns 1 item
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "Article", link: "https://x.com", pubDate: "2024-01-01" }]),
    );

    const articles = await fetchNews();

    // Weight 5 feeds come first, then 4, then 3, then 2
    const weights = articles.map((a) => a.weight);
    for (let i = 1; i < weights.length; i++) {
      expect(weights[i]).toBeLessThanOrEqual(weights[i - 1]);
    }
  });

  it("caps total articles at 50", async () => {
    // Return 10 items per feed (8 feeds * 10 = 80 > 50)
    const tenItems = Array.from({ length: 10 }, (_, i) => ({
      title: `Article ${i}`,
      link: `https://example.com/${i}`,
      pubDate: "2024-01-01",
    }));
    mockParseString.mockResolvedValue(makeFeedResult(tenItems));

    const articles = await fetchNews();

    expect(articles.length).toBeLessThanOrEqual(50);
  });

  it("takes only top 10 items per feed", async () => {
    const fifteenItems = Array.from({ length: 15 }, (_, i) => ({
      title: `Article ${i}`,
      link: `https://example.com/${i}`,
      pubDate: "2024-01-01",
    }));
    mockParseString.mockResolvedValue(makeFeedResult(fifteenItems));

    const articles = await fetchNews();

    // 8 feeds * 10 items = 80 but capped at 50
    expect(articles.length).toBe(50);
  });

  it("trims summary to 200 characters", async () => {
    const longText = "A".repeat(300);
    mockParseString.mockResolvedValue(
      makeFeedResult([
        { title: "Long", link: "https://x.com", contentSnippet: longText },
      ]),
    );

    const articles = await fetchNews();

    expect(articles[0].summary.length).toBe(200);
  });

  it("handles empty contentSnippet gracefully", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "No snippet", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    expect(articles[0].summary).toBe("");
  });

  it("uses isoDate when pubDate is absent", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([
        {
          title: "ISO",
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
      return makeFeedResult([{ title: "OK", link: "https://x.com" }]);
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
      makeFeedResult([{ title: "OK", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    expect(articles).toHaveLength(7);
  });

  it("assigns correct source name to each article", async () => {
    mockParseString.mockResolvedValue(
      makeFeedResult([{ title: "Test", link: "https://x.com" }]),
    );

    const articles = await fetchNews();

    const sources = articles.map((a) => a.source);
    expect(sources).toContain("Bangkok Post");
    expect(sources).toContain("Khmer Times");
    expect(sources).toContain("CNA Southeast Asia");
    expect(sources).toContain("ReliefWeb Thailand");
  });

  it("returns empty array when all feeds fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error")),
    );

    const articles = await fetchNews();

    expect(articles).toEqual([]);
  });
});

"use client";

import type { NewsArticle } from "@/types";
import { ExternalLink } from "lucide-react";

interface NewsFeedProps {
  articles: NewsArticle[];
  visible: boolean;
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  } catch {
    return "";
  }
}

function weightToColor(weight: number): string {
  if (weight >= 5) return "#ff4444";
  if (weight >= 4) return "#ffaa00";
  if (weight >= 3) return "#00d4ff";
  return "var(--text-secondary)";
}

export default function NewsFeed({ articles, visible }: NewsFeedProps) {
  if (!visible) return null;

  return (
    <div className="hud-panel w-72 flex flex-col max-h-[50vh]">
      <div className="px-3 py-2 border-b border-[var(--border-color)]">
        <div className="text-[10px] tracking-widest text-[var(--accent)] glow-text">
          INTEL FEED
        </div>
      </div>

      <div className="overflow-y-auto p-2 flex flex-col gap-1.5">
        {articles.length === 0 && (
          <div className="text-[11px] text-[var(--text-secondary)] p-2">
            No articles available
          </div>
        )}
        {articles.map((article, i) => (
          <a
            key={i}
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-2 rounded hover:bg-[rgba(0,255,136,0.05)] transition-colors group"
          >
            <div className="flex items-start gap-2">
              <div
                className="w-1 h-1 rounded-full mt-1.5 flex-shrink-0"
                style={{ background: weightToColor(article.weight) }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] line-clamp-2">
                  {article.title}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[9px] text-[var(--text-secondary)]">
                  <span style={{ color: weightToColor(article.weight) }}>
                    {article.source}
                  </span>
                  <span>{timeAgo(article.published)}</span>
                  <ExternalLink
                    size={8}
                    className="opacity-0 group-hover:opacity-100"
                  />
                </div>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

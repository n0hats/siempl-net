#!/usr/bin/env python3
"""
Fetches security news RSS feeds and writes data/feeds.json.
Run via GitHub Actions daily, or locally: python scripts/fetch_feeds.py
"""

import json
import re
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

import feedparser
import requests

FEEDS = [
    {
        "name": "KrebsOnSecurity",
        "url": "https://krebsonsecurity.com/feed/",
        "category": "threat-intel",
        "color": "#ff6b35",
    },
    {
        "name": "Hacker News",
        "url": "https://news.ycombinator.com/rss",
        "category": "community",
        "color": "#ff6600",
    },
    {
        "name": "Bleeping Computer",
        "url": "https://www.bleepingcomputer.com/feed/",
        "category": "news",
        "color": "#4a9eff",
    },
    {
        "name": "Dark Reading",
        "url": "https://www.darkreading.com/rss.xml",
        "category": "news",
        "color": "#9b59b6",
    },
    {
        "name": "Schneier on Security",
        "url": "https://www.schneier.com/feed/atom/",
        "category": "analysis",
        "color": "#2ecc71",
    },
    {
        "name": "SANS ISC",
        "url": "https://isc.sans.edu/rssfeed_full.xml",
        "category": "threat-intel",
        "color": "#e74c3c",
    },
]

MAX_ITEMS_PER_FEED = 25
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "feeds.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; siempl.net/1.0; +https://siempl.net)"}


def parse_time(entry) -> datetime:
    for attr in ("published_parsed", "updated_parsed", "created_parsed"):
        t = getattr(entry, attr, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return datetime.now(timezone.utc)


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"&lt;", "<", text)
    text = re.sub(r"&gt;", ">", text)
    text = re.sub(r"&quot;", '"', text)
    text = re.sub(r"&#?\w+;", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def get_summary(entry) -> str:
    raw = (
        getattr(entry, "summary", "")
        or getattr(entry, "description", "")
        or getattr(entry, "content", [{}])[0].get("value", "")
        or ""
    )
    clean = strip_html(raw)
    return clean[:350] + ("…" if len(clean) > 350 else "")


def fetch_feed(feed_config: dict) -> list[dict]:
    items = []
    try:
        resp = requests.get(feed_config["url"], headers=HEADERS, timeout=20)
        resp.raise_for_status()
        parsed = feedparser.parse(resp.content)

        for entry in parsed.entries[:MAX_ITEMS_PER_FEED]:
            url = getattr(entry, "link", "").strip()
            if not url:
                continue

            title = strip_html(getattr(entry, "title", "Untitled")).strip()
            published = parse_time(entry)

            # Tag CVEs and 0days in the title/summary for visual highlighting
            summary = get_summary(entry)
            tags = []
            combined = f"{title} {summary}".upper()
            if re.search(r"CVE-\d{4}-\d+", combined, re.I):
                tags.append("CVE")
            if re.search(r"0[- ]?DAY|ZERO[- ]?DAY", combined, re.I):
                tags.append("0DAY")
            if re.search(r"RANSOMWARE", combined, re.I):
                tags.append("RANSOMWARE")
            if re.search(r"PATCH|UPDATE|FIX", combined, re.I):
                tags.append("PATCH")
            if re.search(r"BREACH|LEAK|EXPOSED", combined, re.I):
                tags.append("BREACH")

            items.append(
                {
                    "id": hashlib.md5(url.encode()).hexdigest(),
                    "title": title,
                    "url": url,
                    "source": feed_config["name"],
                    "source_category": feed_config["category"],
                    "source_color": feed_config["color"],
                    "published": published.isoformat(),
                    "summary": summary,
                    "tags": tags,
                }
            )
    except Exception as exc:
        print(f"  [FAIL] {feed_config['name']}: {exc}", file=sys.stderr)

    return items


def main():
    all_items = []
    failed = []

    for feed in FEEDS:
        print(f"Fetching {feed['name']}...", end=" ", flush=True)
        items = fetch_feed(feed)
        all_items.extend(items)
        if items:
            print(f"{len(items)} items")
        else:
            failed.append(feed["name"])

    # Sort newest first
    all_items.sort(key=lambda x: x["published"], reverse=True)

    # Deduplicate by ID
    seen: set[str] = set()
    unique: list[dict] = []
    for item in all_items:
        if item["id"] not in seen:
            seen.add(item["id"])
            unique.append(item)

    output = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "item_count": len(unique),
        "failed_sources": failed,
        "items": unique,
    }

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {len(unique)} items → {OUTPUT_PATH}")
    if failed:
        print(f"Failed sources: {', '.join(failed)}", file=sys.stderr)


if __name__ == "__main__":
    main()

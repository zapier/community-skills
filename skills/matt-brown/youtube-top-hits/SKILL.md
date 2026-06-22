---
name: youtube-top-hits
description: "Analyze a YouTube channel's most popular videos using the Apify YouTube Scraper (streamers/youtube-scraper). Use this skill whenever the user asks about a YouTuber's top videos, biggest hits, most viewed content, best performing uploads, viral videos, or channel analytics. Also trigger when the user provides a YouTube channel URL and wants to know what content performed best, or asks to compare video performance across a channel. Even casual mentions like 'what are their best videos' or 'which videos blew up' should trigger this skill."
license: MIT
metadata:
  author: matt-brown
---

# YouTube Top Hits Analyzer

This skill fetches video data from a YouTube channel via the Apify API and identifies the top-performing videos by view count.

## How It Works

1. The user provides a YouTube channel URL (e.g., `https://www.youtube.com/@KevinStratvert`)
2. You write out and run the Python script below, which calls the recommended Apify scraper, [**YouTube Scraper** (`streamers/youtube-scraper`)](https://apify.com/streamers/youtube-scraper)
3. The script filters videos to the requested time window, sorts by views, and returns the top hits

## Prerequisites

This skill calls a paid third-party API (Apify), so **each user must supply their own Apify API token** — there is no shared or built-in key.

- **Apify account + token (required):** Create a free account at <https://apify.com>, then copy your token from **Settings → API & Integrations**. The free tier includes monthly credits that are enough for occasional channel scrapes.
- **Set the token as an environment variable named `APIFY_API_KEY`** before running:
  - macOS / Linux: `export APIFY_API_KEY="your_token_here"`
  - Windows (PowerShell): `$env:APIFY_API_KEY="your_token_here"`
  - To avoid setting it every session, add the `export` line to your shell profile (`~/.zshrc`, `~/.bashrc`) or your agent's environment/secrets config.
- The script reads the token **only** from this environment variable. If it is missing, the script stops immediately and tells the user how to set it — it never falls back to any other key.
- **requests library:** Should be pre-installed. If not: `pip install requests --break-system-packages`

## Recommended Scraper: YouTube Scraper (`streamers/youtube-scraper`)

This skill is built around Apify's **[YouTube Scraper](https://apify.com/streamers/youtube-scraper)** (actor id `streamers/youtube-scraper`), a maintained, general-purpose YouTube actor that extracts video title, URL, view count, likes, comments, duration, and upload date from a channel, video, playlist, or search URL.

**One-time setup:**

1. Create a free account at <https://console.apify.com/sign-up>.
2. Open the actor at <https://apify.com/streamers/youtube-scraper> and click **Try for free** to add it to your account (this is required before the API will run it for you).
3. Copy your API token from **Settings → API & Integrations** and set it as `APIFY_API_KEY` (see Prerequisites above).

**How the script uses it:** it calls the actor's REST API with the channel URL as a `startUrl`, pulls up to `--max-results` videos, then does the time-window filtering and view-count sorting locally — so you don't need to configure any sort/date options in the Apify console. The script requests regular videos only (shorts and streams are set to 0).

**Cost note:** this is a pay-per-result actor (priced per 1,000 videos — see the actor's [Pricing tab](https://apify.com/streamers/youtube-scraper/pricing) for the current rate), drawn from your own Apify credits. Keep `--max-results` modest to control spend.

**Cheaper / alternative actors:** for channel-only analysis, Apify's purpose-built [Fast YouTube Channel Scraper](https://apify.com/streamers/youtube-channel-scraper) is often less expensive. To swap, change the `ACTOR_ID` constant near the top of the script and verify the new actor returns compatible fields (`viewCount`, `date`, `title`, `url`); the parsing helpers already try several common field-name variants.

## Important: Network Access

This skill makes outbound HTTP calls to `api.apify.com`. It works in environments with unrestricted network access (Claude Code, local terminal). It will NOT work in sandboxed environments that block external API calls.

## Usage

Save the script below as `fetch_top_hits.py` (a temp directory is fine), confirm `APIFY_API_KEY` is set, then run:

```bash
python fetch_top_hits.py "<channel_url>" \
  --years 2 \
  --top 5 \
  --max-results 200
```

### Parameters

| Flag | Default | Description |
|------|---------|-------------|
| `channel_url` | (required) | YouTube channel URL — accepts formats like `@handle`, `/channel/ID`, or full URLs |
| `--years` | 2 | How far back to look (supports decimals like 0.5 for 6 months) |
| `--top` | 5 | Number of top videos to return |
| `--max-results` | 200 | Max videos to pull from the API (increase for very active channels) |
| `--json-output` | off | Output machine-readable JSON instead of formatted text |

The Apify token is **not** a command-line flag — it is read from the `APIFY_API_KEY` environment variable (see Prerequisites). This keeps tokens out of shell history.

### Normalizing Channel URLs

The script handles most URL formats, but if the user gives you something unusual, normalize it before passing it in:

- `https://www.youtube.com/@KevinStratvert/videos` → `https://www.youtube.com/@KevinStratvert`
- `@KevinStratvert` → `https://www.youtube.com/@KevinStratvert`
- `youtube.com/channel/UC4QZ_LsYcvcq7qOsOhpAI4A` → pass as-is

## The Script

```python
#!/usr/bin/env python3
"""
Fetch a YouTube channel's top videos using the Apify YouTube Channel Scraper REST API.
Usage: python fetch_top_hits.py <channel_url> [--years 2] [--top 5]

Requires the APIFY_API_KEY environment variable (your own Apify token).
Uses only the requests library (no apify-client needed).
"""

import argparse
import json
import os
import sys
import time
import requests
from datetime import datetime, timedelta, timezone


ACTOR_ID = "streamers~youtube-scraper"
APIFY_BASE = "https://api.apify.com/v2"


def get_api_key():
    """Read the Apify token from the environment. Never fall back to a built-in key."""
    key = os.environ.get("APIFY_API_KEY", "").strip()
    if not key:
        sys.stderr.write(
            "ERROR: No Apify token found.\n\n"
            "This skill needs your own Apify API token. To get one:\n"
            "  1. Create a free account at https://apify.com\n"
            "  2. Copy your token from Settings -> API & Integrations\n"
            "  3. Set it as an environment variable, e.g.:\n"
            "       export APIFY_API_KEY=\"your_token_here\"   (macOS/Linux)\n"
            "       $env:APIFY_API_KEY=\"your_token_here\"      (PowerShell)\n\n"
            "Then re-run this command.\n"
        )
        sys.exit(1)
    return key


def run_actor(api_key, channel_url, max_results=200):
    """Start the Apify actor, poll until done, return dataset items."""
    url = f"{APIFY_BASE}/acts/{ACTOR_ID}/runs"
    params = {"token": api_key}
    payload = {
        "startUrls": [{"url": channel_url}],
        "maxResults": max_results,
        "maxResultsShorts": 0,
        "maxResultStreams": 0,
    }

    print("Starting Apify actor run... (this typically takes 30-90 seconds)")
    resp = requests.post(url, params=params, json=payload, timeout=30)
    if resp.status_code == 401:
        print("ERROR: Apify rejected the token (401). Check that APIFY_API_KEY is a valid token.")
        sys.exit(1)
    if resp.status_code != 201:
        print(f"ERROR starting actor: {resp.status_code} - {resp.text[:500]}")
        sys.exit(1)

    run_data = resp.json()["data"]
    run_id = run_data["id"]
    dataset_id = run_data["defaultDatasetId"]
    print(f"  Run ID: {run_id}")

    # Poll for completion
    status_url = f"{APIFY_BASE}/acts/{ACTOR_ID}/runs/{run_id}"
    status = None
    for i in range(120):  # up to ~10 minutes
        time.sleep(5)
        status_resp = requests.get(status_url, params={"token": api_key}, timeout=15)
        status = status_resp.json()["data"]["status"]
        if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
            break
        if i % 6 == 0:
            print(f"  Status: {status} ({(i+1)*5}s elapsed)")

    if status != "SUCCEEDED":
        print(f"ERROR: Actor run ended with status: {status}")
        sys.exit(1)

    print("  Actor run succeeded.\n")

    # Fetch dataset
    items_url = f"{APIFY_BASE}/datasets/{dataset_id}/items"
    items_resp = requests.get(items_url, params={"token": api_key, "format": "json"}, timeout=60)
    if items_resp.status_code != 200:
        print(f"ERROR fetching dataset: {items_resp.status_code}")
        sys.exit(1)

    return items_resp.json()


def parse_view_count(item):
    """Extract view count, handling various field name conventions."""
    for key in ["viewCount", "views", "viewsCount", "view_count", "numberOfViews"]:
        val = item.get(key)
        if val is not None:
            if isinstance(val, str):
                val = val.replace(",", "").replace(" ", "")
                try:
                    return int(val)
                except ValueError:
                    continue
            return int(val)
    stats = item.get("statistics", {})
    if isinstance(stats, dict):
        val = stats.get("viewCount") or stats.get("views")
        if val is not None:
            return int(str(val).replace(",", ""))
    return 0


def parse_relative_date(val):
    """Handle YouTube-style relative dates like '5 years ago', 'Streamed 2 months ago'."""
    import re
    m = re.search(r"(\d+)\s*(year|month|week|day|hour|minute)s?\s*ago", val.lower())
    if not m:
        return None
    qty = int(m.group(1))
    unit = m.group(2)
    days_per = {"year": 365.25, "month": 30.44, "week": 7, "day": 1, "hour": 1 / 24, "minute": 1 / 1440}
    return datetime.now(timezone.utc) - timedelta(days=qty * days_per[unit])


def parse_date(item):
    """Extract upload/publish date from an item (handles ISO, common absolute, and relative formats)."""
    for key in ["date", "uploadDate", "publishedAt", "publishDate", "uploaded", "datePublished"]:
        val = item.get(key)
        if not val:
            continue
        sval = str(val)
        try:
            if "T" in sval:
                return datetime.fromisoformat(sval.replace("Z", "+00:00"))
            for fmt in ["%Y-%m-%d", "%b %d, %Y", "%d %b %Y", "%Y/%m/%d"]:
                try:
                    return datetime.strptime(sval, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
            rel = parse_relative_date(sval)
            if rel is not None:
                return rel
        except Exception:
            continue
    return None


def get_title(item):
    return item.get("title") or item.get("name") or item.get("videoTitle") or "Unknown"


def get_url(item):
    url = item.get("url") or item.get("videoUrl") or item.get("link")
    if url:
        return url
    video_id = item.get("id") or item.get("videoId")
    if video_id:
        return f"https://www.youtube.com/watch?v={video_id}"
    return "N/A"


def get_likes(item):
    for key in ["likes", "likeCount", "numberOfLikes"]:
        val = item.get(key)
        if val is not None:
            return int(str(val).replace(",", ""))
    stats = item.get("statistics", {})
    if isinstance(stats, dict):
        val = stats.get("likeCount") or stats.get("likes")
        if val is not None:
            return int(str(val).replace(",", ""))
    return 0


def get_comments(item):
    for key in ["commentsCount", "commentCount", "comments", "numberOfComments"]:
        val = item.get(key)
        if val is not None:
            return int(str(val).replace(",", ""))
    return 0


def get_duration(item):
    return item.get("duration") or item.get("length") or item.get("videoDuration") or "N/A"


def format_number(n):
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def main():
    parser = argparse.ArgumentParser(description="Find a YouTube channel's top hits")
    parser.add_argument("channel_url", help="YouTube channel URL")
    parser.add_argument("--years", type=float, default=2, help="Years to look back (default: 2)")
    parser.add_argument("--top", type=int, default=5, help="Number of top videos (default: 5)")
    parser.add_argument("--max-results", type=int, default=200, help="Max videos to fetch (default: 200)")
    parser.add_argument("--json-output", action="store_true", help="Output JSON instead of text")
    args = parser.parse_args()

    api_key = get_api_key()

    # Normalize the channel URL
    channel_url = args.channel_url.rstrip("/")
    if channel_url.endswith("/videos"):
        channel_url = channel_url[: -len("/videos")]

    print(f"Fetching videos from: {channel_url}")
    print(f"Looking back: {args.years} years | Returning top: {args.top}\n")

    start_time = time.time()
    dataset_items = run_actor(api_key, channel_url, args.max_results)
    elapsed = time.time() - start_time
    print(f"Total time: {elapsed:.0f}s")

    if not dataset_items:
        print("No videos found. Check the channel URL and try again.")
        sys.exit(1)

    # The actor pushes "error items" (e.g. unavailable videos) into the dataset; drop them.
    error_items = [it for it in dataset_items if isinstance(it, dict) and it.get("error")]
    dataset_items = [it for it in dataset_items if isinstance(it, dict) and not it.get("error")]
    if error_items:
        print(f"Note: skipped {len(error_items)} error item(s) returned by the actor "
              f"(e.g. {error_items[0].get('error')}).\n")

    if not dataset_items:
        print("No usable videos returned (only error items). Check the channel URL is valid and public.")
        sys.exit(1)

    # Show sample fields for debugging
    sample = dataset_items[0]
    print(f"Found {len(dataset_items)} videos. Sample fields: {list(sample.keys())[:12]}\n")

    # Filter by date
    cutoff = datetime.now(timezone.utc) - timedelta(days=int(args.years * 365.25))
    filtered = []
    skipped_no_date = 0

    for item in dataset_items:
        dt = parse_date(item)
        if dt is None:
            skipped_no_date += 1
            filtered.append(item)
        elif dt >= cutoff:
            filtered.append(item)

    if skipped_no_date > 0:
        print(f"Note: {skipped_no_date} videos had no parseable date and were included anyway.\n")

    # Sort by views descending
    filtered.sort(key=lambda x: parse_view_count(x), reverse=True)
    top = filtered[: args.top]

    if args.json_output:
        output = []
        for i, item in enumerate(top, 1):
            output.append({
                "rank": i,
                "title": get_title(item),
                "url": get_url(item),
                "views": parse_view_count(item),
                "likes": get_likes(item),
                "comments": get_comments(item),
                "duration": get_duration(item),
                "date": str(parse_date(item) or "Unknown"),
            })
        print(json.dumps(output, indent=2))
    else:
        print(f"{'='*60}")
        print(f" TOP {args.top} BIGGEST HITS (last {args.years} years)")
        print(f"{'='*60}\n")
        for i, item in enumerate(top, 1):
            views = parse_view_count(item)
            likes = get_likes(item)
            comments = get_comments(item)
            dt = parse_date(item)
            date_str = dt.strftime("%b %d, %Y") if dt else "Unknown date"

            print(f"  #{i}  {get_title(item)}")
            print(f"      Views: {format_number(views)}  |  Likes: {format_number(likes)}  |  Comments: {format_number(comments)}")
            print(f"      Date: {date_str}  |  Duration: {get_duration(item)}")
            print(f"      {get_url(item)}")
            print()

        total_views = sum(parse_view_count(v) for v in filtered)
        avg_views = total_views // len(filtered) if filtered else 0
        print(f"{'='*60}")
        print(f" Channel stats (last {args.years}y): {len(filtered)} videos | {format_number(total_views)} total views | {format_number(avg_views)} avg views")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()
```

## Presenting Results

After the script runs, present the results conversationally. Highlight what makes each video notable — is it a tutorial that clearly hit a nerve? A timely topic? Give the user context, not just a data dump. Mention the channel's overall stats (total views, average views per video) to put the top hits in perspective.

If the user wants to dig deeper (e.g., "what topics do best?", "show me a trend"), you can use the `--json-output` flag and do further analysis in Python.

## Troubleshooting

- **"No Apify token found" / 401 Unauthorized**: The `APIFY_API_KEY` environment variable is missing or invalid. Follow the Prerequisites to set a valid token, then re-run.
- **Actor fails or times out**: The Apify free tier has limited compute. Suggest reducing `--max-results` to 50-100, or checking their Apify account balance.
- **No videos returned**: Double-check the channel URL is valid and public. Try the `@handle` format.
- **View counts are 0**: The API output field names may have changed. The script tries multiple field name variations, but if all views show as 0, print a sample item's raw JSON to debug: use `--json-output` and inspect the fields.
- **Rate limits**: Apify has rate limits on the free tier. If the user hits them, wait a minute and retry.

<!-- SPDX-License-Identifier: MIT -->
<!-- Licensed under the MIT License. -->
<!-- Attribution: Matt Brown (matt-brown) -->

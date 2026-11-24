#!/usr/bin/env python3
import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

API_BASE = "https://www.googleapis.com/youtube/v3"
TARGET = 50
MAX_SEARCH_CALLS = 20
SEARCH_QUOTA_UNITS = 100
# search.list's "short" bucket is under 4 minutes. Keep anything under 2 minutes.
SHORTS_MAX_SECONDS = 120
ROOT = Path(__file__).resolve().parent
RUN_PATH = ROOT / ".search_run"
HISTORY_PATH = ROOT / ".search_history"
ENV_PATH = ROOT / ".env"
WATCH_URL = "https://www.youtube.com/watch?v={video_id}"
LANG_RE = re.compile(r"^[a-z]{2}$|^zh-Hans$|^zh-Hant$")
DURATION_RE = re.compile(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?")


class YouTubeAPIError(Exception):
    pass


def normalize_lang(lang: str) -> str | None:
    if lang.lower() == "zh-hans":
        return "zh-Hans"
    if lang.lower() == "zh-hant":
        return "zh-Hant"
    lowered = lang.lower()
    if LANG_RE.fullmatch(lowered):
        return lowered
    return None


def language_matches(audio_language: str | None, lang: str) -> bool:
    if not audio_language:
        return False
    audio = audio_language.replace("_", "-").lower()
    want = lang.lower()
    return audio == want or audio.startswith(want + "-")


def parse_duration_seconds(iso_duration: str | None) -> int | None:
    if not iso_duration:
        return None
    match = DURATION_RE.fullmatch(iso_duration)
    if not match or not any(match.groups()):
        return None
    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return hours * 3600 + minutes * 60 + seconds


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def api_get(path: str, params: dict[str, str]) -> dict:
    url = f"{API_BASE}/{path}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        message = exc.reason
        try:
            body = json.loads(exc.read().decode())
            message = body["error"]["message"]
        except (OSError, ValueError, KeyError, TypeError, UnicodeDecodeError):
            pass
        raise YouTubeAPIError(f"YouTube API error: {message}") from exc
    except urllib.error.URLError as exc:
        raise YouTubeAPIError(f"YouTube API request failed: {exc.reason}") from exc
    if not isinstance(payload, dict):
        raise YouTubeAPIError("YouTube API returned a response that was not a JSON object")
    return payload


def search_page(
    api_key: str,
    lang: str,
    q: str | None,
    published_before: str,
    page_token: str | None,
) -> dict:
    params = {
        "key": api_key,
        "part": "snippet",
        "type": "video",
        "videoCaption": "closedCaption",
        "videoDuration": "short",
        "relevanceLanguage": lang,
        "order": "date",
        "maxResults": str(TARGET),
        "publishedBefore": published_before,
    }
    if q is not None:
        params["q"] = q
    if page_token:
        params["pageToken"] = page_token
    return api_get("search", params)


def video_details(api_key: str, video_ids: list[str]) -> dict[str, dict]:
    if not video_ids:
        return {}
    payload = api_get(
        "videos",
        {
            "key": api_key,
            "part": "snippet,contentDetails",
            "id": ",".join(video_ids),
            "maxResults": str(TARGET),
        },
    )
    details = {}
    for item in payload.get("items") or []:
        if isinstance(item, dict) and isinstance(item.get("id"), str):
            details[item["id"]] = item
    return details


def atomic_write(path: Path, text: str) -> None:
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(text)
        tmp.replace(path)
    except OSError as exc:
        raise YouTubeAPIError(f"could not write {path}: {exc}") from exc


def load_run() -> dict:
    if not RUN_PATH.exists():
        return {}
    try:
        data = json.loads(RUN_PATH.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise YouTubeAPIError(f"could not read {RUN_PATH}: {exc}") from exc
    if not isinstance(data, dict):
        raise YouTubeAPIError(f"could not read {RUN_PATH}: expected a JSON object")
    return data


def save_run(state: dict) -> None:
    atomic_write(RUN_PATH, json.dumps(state, indent=2) + "\n")


def load_history() -> set[str]:
    if not HISTORY_PATH.exists():
        return set()
    try:
        text = HISTORY_PATH.read_text()
    except OSError as exc:
        raise YouTubeAPIError(f"could not read {HISTORY_PATH}: {exc}") from exc
    return {line.strip() for line in text.splitlines() if line.strip()}


def save_history(video_ids: set[str]) -> None:
    body = "".join(f"{video_id}\n" for video_id in sorted(video_ids))
    atomic_write(HISTORY_PATH, body)


def stored_cursor(state: dict, lang: str, q: str | None) -> str | None:
    key = q if q is not None else ""
    bucket = state.get(lang)
    if not isinstance(bucket, dict):
        return None
    entry = bucket.get(key)
    if not isinstance(entry, dict) or not isinstance(entry.get("published_before"), str):
        return None
    return entry["published_before"]


def write_cursor(state: dict, lang: str, q: str | None, published_before: str) -> None:
    key = q if q is not None else ""
    bucket = state.get(lang)
    if not isinstance(bucket, dict):
        bucket = {}
        state[lang] = bucket
    bucket[key] = {"published_before": published_before}


def snippet_value(resource: dict | None, key: str) -> str | None:
    if not isinstance(resource, dict):
        return None
    snippet = resource.get("snippet")
    if not isinstance(snippet, dict):
        return None
    value = snippet.get(key)
    return value if isinstance(value, str) else None


def published_at(item: dict, detail: dict | None) -> str | None:
    return snippet_value(detail, "publishedAt") or snippet_value(item, "publishedAt")


def describe(video_id: str, item: dict, detail: dict | None) -> str:
    title = snippet_value(detail, "title") or snippet_value(item, "title")
    if not title:
        return video_id
    title = " ".join(title.split())
    if len(title) > 80:
        title = title[:77] + "..."
    return f"{video_id} {title}"


def duration_iso(detail: dict | None) -> str | None:
    if not isinstance(detail, dict):
        return None
    content = detail.get("contentDetails")
    if not isinstance(content, dict):
        return None
    duration = content.get("duration")
    return duration if isinstance(duration, str) else None


def collect(
    api_key: str,
    lang: str,
    q: str | None,
    published_before: str,
    history: set[str],
) -> tuple[list[str], int, int, int, int, str | None, str | None]:
    """Return kept ids, language rejects, duration rejects, history skips, search calls, new cursor, shortfall reason.

    A new cursor of None means the saved cursor should stay where it is (empty page).
    IDs in history are not output again.
    """
    seen = set(history)
    kept: list[str] = []
    rejected_language = 0
    rejected_duration = 0
    skipped_history = 0
    search_calls = 0
    page_token: str | None = None
    last_considered: str | None = None
    examined = False
    stop_reason: str | None = None

    while len(kept) < TARGET and search_calls < MAX_SEARCH_CALLS:
        log(
            f"search {search_calls + 1}/{MAX_SEARCH_CALLS} "
            f"lang={lang} q={q or '-'} publishedBefore={published_before} "
            f"pageToken={page_token or '-'}"
        )
        page = search_page(api_key, lang, q, published_before, page_token)
        search_calls += 1
        items = [item for item in (page.get("items") or []) if isinstance(item, dict)]
        video_ids = []
        for item in items:
            video_id = item.get("id", {}).get("videoId") if isinstance(item.get("id"), dict) else None
            if isinstance(video_id, str):
                video_ids.append(video_id)
        log(f"search returned {len(video_ids)} videos")
        if not video_ids:
            stop_reason = "catalog exhausted"
            log("search page empty; catalog exhausted")
            break

        log(f"videos.list {len(video_ids)} ids")
        details = video_details(api_key, video_ids)
        if len(details) != len(video_ids):
            log(f"videos.list returned {len(details)} of {len(video_ids)}")
        reached_target = False
        for item in items:
            item_id = item.get("id")
            video_id = item_id.get("videoId") if isinstance(item_id, dict) else None
            if not isinstance(video_id, str):
                continue
            examined = True
            detail = details.get(video_id)
            label = describe(video_id, item, detail)
            stamp = published_at(item, detail)
            if stamp:
                last_considered = stamp
            if video_id in seen:
                skipped_history += 1
                log(f"skip {label} already in history")
                continue
            duration = parse_duration_seconds(duration_iso(detail))
            if duration is None or duration >= SHORTS_MAX_SECONDS:
                rejected_duration += 1
                if duration is None:
                    log(f"reject {label} no duration")
                else:
                    log(f"reject {label} duration={duration}s")
                continue
            audio_language = snippet_value(detail, "defaultAudioLanguage")
            if not language_matches(audio_language, lang):
                rejected_language += 1
                log(f"reject {label} audio={audio_language or 'missing'}")
                continue
            kept.append(video_id)
            seen.add(video_id)
            log(f"keep {WATCH_URL.format(video_id=video_id)} {duration}s {audio_language} ({len(kept)}/{TARGET})")
            if len(kept) == TARGET:
                reached_target = True
                break
        if reached_target:
            log(f"reached {TARGET} videos")
            break
        next_token = page.get("nextPageToken")
        if not isinstance(next_token, str) or not next_token:
            stop_reason = "catalog exhausted"
            log("no next page; catalog exhausted")
            break
        log("continuing to next page")
        page_token = next_token

    if len(kept) < TARGET and stop_reason is None:
        stop_reason = f"stopped after {MAX_SEARCH_CALLS} search calls"
        log(stop_reason)

    # publishedBefore is inclusive, so the next invocation re-sees the boundary timestamp.
    # History IDs are not output again. An empty page leaves the cursor alone.
    if last_considered:
        new_cursor = last_considered
    elif examined:
        new_cursor = published_before
    else:
        new_cursor = None
    return kept, rejected_language, rejected_duration, skipped_history, search_calls, new_cursor, stop_reason


def report(
    kept: int,
    rejected_language: int,
    rejected_duration: int,
    skipped_history: int,
    search_calls: int,
    stop_reason: str | None,
) -> None:
    quota = search_calls * SEARCH_QUOTA_UNITS
    message = (
        f"kept {kept}, skipped {skipped_history} in history, "
        f"rejected {rejected_language} for language, "
        f"rejected {rejected_duration} for duration, "
        f"search calls {search_calls} ({quota} quota units)"
    )
    if kept < TARGET and stop_reason:
        message += f"; {stop_reason}"
    log(message)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Search YouTube for captioned Shorts in a language and print their watch URLs."
    )
    parser.add_argument("lang", help="speech language (ISO 639-1, or zh-Hans / zh-Hant)")
    parser.add_argument("q", nargs="?", help="optional YouTube search query, passed as the q parameter")
    args = parser.parse_args()

    lang = normalize_lang(args.lang)
    if lang is None:
        parser.error("lang must be an ISO 639-1 code, or zh-Hans / zh-Hant")

    load_dotenv(ENV_PATH)
    api_key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        print(f"YOUTUBE_API_KEY is not set (environment or {ENV_PATH})", file=sys.stderr)
        return 1

    try:
        run = load_run()
        history = load_history()
        published_before = stored_cursor(run, lang, args.q)
        if published_before is None:
            published_before = utc_now()
            log(f"no saved cursor for this query; starting at {published_before}")
        else:
            log(f"cursor {published_before} from {RUN_PATH}")
        if HISTORY_PATH.exists():
            log(f"history {len(history)} ids from {HISTORY_PATH}")
        else:
            log(f"no history file {HISTORY_PATH}")
        kept, rejected_language, rejected_duration, skipped_history, search_calls, new_cursor, stop_reason = collect(
            api_key, lang, args.q, published_before, history
        )
        if kept:
            updated = history | set(kept)
            save_history(updated)
            log(f"history {len(history)} -> {len(updated)} ids, wrote {HISTORY_PATH}")
        else:
            log("history unchanged")
        if new_cursor is not None:
            write_cursor(run, lang, args.q, new_cursor)
            save_run(run)
            log(f"cursor {published_before} -> {new_cursor}, wrote {RUN_PATH}")
        else:
            log(f"cursor unchanged ({published_before})")
        report(len(kept), rejected_language, rejected_duration, skipped_history, search_calls, stop_reason)
    except YouTubeAPIError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if not kept:
        return 1

    for video_id in kept:
        print(WATCH_URL.format(video_id=video_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())

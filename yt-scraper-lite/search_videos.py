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
# search.list's "short" bucket is under 4 minutes. Match the repo's Shorts cutoff.
SHORTS_MAX_SECONDS = 60
ROOT = Path(__file__).resolve().parent
STATE_PATH = ROOT / ".search_state.json"
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


def load_state() -> dict:
    if not STATE_PATH.exists():
        return {}
    try:
        data = json.loads(STATE_PATH.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise YouTubeAPIError(f"could not read {STATE_PATH}: {exc}") from exc
    if not isinstance(data, dict):
        raise YouTubeAPIError(f"could not read {STATE_PATH}: expected a JSON object")
    return data


def save_state(state: dict) -> None:
    tmp = STATE_PATH.with_name(".search_state.json.tmp")
    try:
        tmp.write_text(json.dumps(state, indent=2) + "\n")
        tmp.replace(STATE_PATH)
    except OSError as exc:
        raise YouTubeAPIError(f"could not write {STATE_PATH}: {exc}") from exc


def read_cursor(state: dict, lang: str, q: str | None) -> tuple[str, list[str]]:
    key = q if q is not None else ""
    bucket = state.get(lang)
    if not isinstance(bucket, dict):
        return utc_now(), []
    entry = bucket.get(key)
    if not isinstance(entry, dict) or not isinstance(entry.get("published_before"), str):
        return utc_now(), []
    raw_ids = entry.get("returned_ids")
    if not isinstance(raw_ids, list):
        raw_ids = []
    return entry["published_before"], [video_id for video_id in raw_ids if isinstance(video_id, str)]


def write_cursor(state: dict, lang: str, q: str | None, published_before: str, returned_ids: list[str]) -> None:
    key = q if q is not None else ""
    bucket = state.get(lang)
    if not isinstance(bucket, dict):
        bucket = {}
        state[lang] = bucket
    bucket[key] = {"published_before": published_before, "returned_ids": returned_ids}


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
    returned_ids: list[str],
) -> tuple[list[str], int, int, int, str | None, str | None]:
    """Return kept ids, language rejects, duration rejects, search calls, new cursor, shortfall reason.

    A new cursor of None means the saved cursor should stay where it is (empty page).
    """
    seen = set(returned_ids)
    kept: list[str] = []
    rejected_language = 0
    rejected_duration = 0
    search_calls = 0
    page_token: str | None = None
    last_considered: str | None = None
    examined = False
    stop_reason: str | None = None

    while len(kept) < TARGET and search_calls < MAX_SEARCH_CALLS:
        page = search_page(api_key, lang, q, published_before, page_token)
        search_calls += 1
        items = [item for item in (page.get("items") or []) if isinstance(item, dict)]
        video_ids = []
        for item in items:
            video_id = item.get("id", {}).get("videoId") if isinstance(item.get("id"), dict) else None
            if isinstance(video_id, str):
                video_ids.append(video_id)
        if not video_ids:
            stop_reason = "catalog exhausted"
            break

        details = video_details(api_key, video_ids)
        reached_target = False
        for item in items:
            item_id = item.get("id")
            video_id = item_id.get("videoId") if isinstance(item_id, dict) else None
            if not isinstance(video_id, str):
                continue
            examined = True
            detail = details.get(video_id)
            stamp = published_at(item, detail)
            if stamp:
                last_considered = stamp
            if video_id in seen:
                continue
            duration = parse_duration_seconds(duration_iso(detail))
            if duration is None or duration >= SHORTS_MAX_SECONDS:
                rejected_duration += 1
                continue
            audio_language = snippet_value(detail, "defaultAudioLanguage")
            if not language_matches(audio_language, lang):
                rejected_language += 1
                continue
            kept.append(video_id)
            seen.add(video_id)
            if len(kept) == TARGET:
                reached_target = True
                break
        if reached_target:
            break
        next_token = page.get("nextPageToken")
        if not isinstance(next_token, str) or not next_token:
            stop_reason = "catalog exhausted"
            break
        page_token = next_token

    if len(kept) < TARGET and stop_reason is None:
        stop_reason = f"stopped after {MAX_SEARCH_CALLS} search calls"

    # publishedBefore is inclusive, so the next run re-sees the boundary timestamp.
    # Returned ids are stored and skipped. An empty page leaves the cursor alone.
    if last_considered:
        new_cursor = last_considered
    elif examined:
        new_cursor = published_before
    else:
        new_cursor = None
    return kept, rejected_language, rejected_duration, search_calls, new_cursor, stop_reason


def report(kept: int, rejected_language: int, rejected_duration: int, search_calls: int, stop_reason: str | None) -> None:
    quota = search_calls * SEARCH_QUOTA_UNITS
    message = (
        f"kept {kept}, rejected {rejected_language} for language, "
        f"rejected {rejected_duration} for duration, "
        f"search calls {search_calls} ({quota} quota units)"
    )
    if kept < TARGET and stop_reason:
        message += f"; {stop_reason}"
    print(message, file=sys.stderr)


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
        state = load_state()
        published_before, returned_ids = read_cursor(state, lang, args.q)
        kept, rejected_language, rejected_duration, search_calls, new_cursor, stop_reason = collect(
            api_key, lang, args.q, published_before, returned_ids
        )
        if new_cursor is not None:
            write_cursor(state, lang, args.q, new_cursor, returned_ids + kept)
            save_state(state)
        report(len(kept), rejected_language, rejected_duration, search_calls, stop_reason)
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

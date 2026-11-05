#!/usr/bin/env python3
import argparse

import yt_dlp


def download(urls: list[str]) -> None:
    with yt_dlp.YoutubeDL() as ydl:
        ydl.download(urls)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download one or more YouTube videos using yt-dlp.")
    parser.add_argument("urls", nargs="+", help="YouTube video URL(s) to download")
    args = parser.parse_args()

    download(args.urls)


if __name__ == "__main__":
    main()

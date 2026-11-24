#!/usr/bin/env python3
import argparse
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.parse
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent
SEARCH_PATH = ROOT / "search_videos.py"
DOWNLOAD_PATH = ROOT / "download_videos.py"
SPEECH_PATH = ROOT / "speech_ratio.py"
RUN_PATH = ROOT / ".search_run"
HISTORY_PATH = ROOT / ".search_history"

HELP = """\
usage: worker.py [-h] speech_ratio n [search arguments ...]

Run search_videos repeatedly, download each batch, and print the watch URL
of every video whose speech ratio is at least speech_ratio. Stop after n
videos have been taken from search, or when the search is exhausted.
Deletes .search_run before starting so each invocation is a new search run.

positional arguments:
  speech_ratio          minimum speech fraction, from 0 to 1
  n                     number of videos to download and score

Remaining arguments are passed through to search_videos.py.
-h / --help prints this text and search_videos.py help.

arguments forwarded to search_videos.py:

"""


class SearchResult(NamedTuple):
    urls: list[str]
    exhausted: bool
    error_code: int | None


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def print_help() -> None:
    sys.stdout.write(HELP)
    proc = subprocess.run(
        [sys.executable, str(SEARCH_PATH), "--help"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if proc.stdout:
        sys.stdout.write(proc.stdout)
        if not proc.stdout.endswith("\n"):
            sys.stdout.write("\n")
    if proc.returncode != 0 and proc.stderr:
        sys.stderr.write(proc.stderr)


def parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        prog="worker.py",
        add_help=False,
        usage="%(prog)s [-h] speech_ratio n [search arguments ...]",
    )


def parse_cli(argv: list[str]) -> tuple[float, int, list[str]]:
    cli = parser()
    if len(argv) < 1:
        cli.error("the following arguments are required: speech_ratio, n")
    if len(argv) < 2:
        cli.error("the following arguments are required: n")
    try:
        speech_ratio = float(argv[0])
    except ValueError:
        cli.error(f"invalid speech_ratio: {argv[0]!r}")
    if not 0.0 <= speech_ratio <= 1.0:
        cli.error("speech_ratio must be between 0 and 1")
    try:
        n = int(argv[1])
    except ValueError:
        cli.error(f"invalid n: {argv[1]!r}")
    if n < 1:
        cli.error("n must be a positive integer")
    return speech_ratio, n, argv[2:]


def read_text(path: Path) -> str | None:
    if not path.exists():
        return None
    return path.read_text()


def video_id(url: str) -> str | None:
    values = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("v")
    if not values or not values[0]:
        return None
    return values[0]


def reset_run() -> None:
    if not RUN_PATH.exists():
        return
    RUN_PATH.unlink()
    log(f"removed {RUN_PATH}")


def release_unprocessed(urls: list[str]) -> None:
    """Remove search hits this run did not download from .search_history.

    search_videos records every kept id before the batch can be capped at n.
    The next invocation deletes the cursor and skips history, so those ids
    would otherwise never be downloaded.
    """
    if not urls or not HISTORY_PATH.exists():
        return
    drop: set[str] = set()
    for url in urls:
        vid = video_id(url)
        if vid:
            drop.add(vid)
    if not drop:
        return
    current = {line.strip() for line in HISTORY_PATH.read_text().splitlines() if line.strip()}
    updated = current - drop
    if updated == current:
        return
    body = "".join(f"{vid}\n" for vid in sorted(updated))
    tmp = HISTORY_PATH.with_name(HISTORY_PATH.name + ".tmp")
    tmp.write_text(body)
    tmp.replace(HISTORY_PATH)
    log(f"released {len(current) - len(updated)} videos not downloaded")


def classify(
    stdout: str,
    stderr: str,
    returncode: int,
    cursor_before: str | None,
    cursor_after: str | None,
) -> SearchResult:
    urls = [line.strip() for line in stdout.splitlines() if line.strip().startswith("https://")]
    exhausted = "catalog exhausted" in stderr
    # search_videos exits 1 both when the catalog is empty and when the API fails.
    # A finished search always reports "kept 0"; an API or argument error does not.
    if not urls and returncode != 0 and "kept 0" not in stderr:
        return SearchResult([], False, returncode or 1)
    if urls:
        return SearchResult(urls, exhausted, None)
    if exhausted or cursor_after == cursor_before:
        return SearchResult([], True, None)
    return SearchResult([], False, None)


def run_search(search_args: list[str]) -> SearchResult:
    before = read_text(RUN_PATH)
    command = [sys.executable, str(SEARCH_PATH), *search_args]
    log(" ".join(command))
    try:
        proc = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=ROOT,
        )
    except OSError as exc:
        log(f"could not run search_videos: {exc}")
        return SearchResult([], False, 1)

    stderr_lines: list[str] = []

    def forward_stderr() -> None:
        assert proc.stderr is not None
        for line in proc.stderr:
            stderr_lines.append(line)
            sys.stderr.write(line)
            sys.stderr.flush()

    thread = threading.Thread(target=forward_stderr)
    thread.start()
    try:
        assert proc.stdout is not None
        stdout = proc.stdout.read()
        returncode = proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        thread.join()
    return classify(stdout, "".join(stderr_lines), returncode, before, read_text(RUN_PATH))


def find_download(dest: Path, vid: str) -> Path | None:
    marker = f"[{vid}]"
    files = [
        path
        for path in dest.iterdir()
        if path.is_file() and marker in path.stem and path.suffix not in {".part", ".ytdl", ".temp"}
    ]
    finals = [path for path in files if path.stem.endswith(marker)]
    pool = finals or files
    if not pool:
        return None
    return max(pool, key=lambda path: path.stat().st_size)


def download(urls: list[str], dest: Path) -> None:
    log(f"downloading {len(urls)} videos into {dest}")
    proc = subprocess.Popen(
        [sys.executable, str(DOWNLOAD_PATH), *urls],
        cwd=dest,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stderr.write(line)
            sys.stderr.flush()
        returncode = proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if returncode != 0:
        log(f"download_videos exited {returncode}")


def speech_score(path: Path) -> tuple[float | None, int]:
    try:
        proc = subprocess.run(
            [sys.executable, str(SPEECH_PATH), str(path)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=ROOT,
            check=False,
        )
    except OSError as exc:
        log(f"could not run speech_ratio: {exc}")
        return None, 1
    if proc.stderr:
        sys.stderr.write(proc.stderr)
        if not proc.stderr.endswith("\n"):
            sys.stderr.write("\n")
    if proc.returncode != 0:
        log(f"speech_ratio exited {proc.returncode} for {path}")
        return None, proc.returncode
    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    if not lines:
        log(f"speech_ratio produced no score for {path}")
        return None, 1
    try:
        return float(lines[-1]), 0
    except ValueError:
        log(f"speech_ratio produced {lines[-1]!r} for {path}")
        return None, 1


def process_batch(urls: list[str], minimum: float) -> tuple[int, int]:
    dest = Path(tempfile.mkdtemp(prefix="worker-"))
    printed = 0
    code = 0
    try:
        try:
            download(urls, dest)
        except OSError as exc:
            log(f"could not run download_videos: {exc}")
            return 0, 1
        for url in urls:
            vid = video_id(url)
            path = find_download(dest, vid) if vid else None
            if path is None:
                names = ", ".join(item.name for item in dest.iterdir()) or "nothing"
                log(f"no file for {url}; directory has {names}")
                continue
            ratio, status = speech_score(path)
            if status != 0 or ratio is None:
                code = status or 1
                break
            if ratio >= minimum:
                log(f"keep {ratio:.4f} {url}")
                print(url, flush=True)
                printed += 1
            else:
                log(f"drop {ratio:.4f} {url}")
    finally:
        shutil.rmtree(dest, ignore_errors=True)
        log(f"deleted {dest}")
    return printed, code


def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]
    if "-h" in argv or "--help" in argv:
        print_help()
        return 0
    speech_ratio, n, search_args = parse_cli(argv)
    reset_run()
    worked = 0
    printed = 0
    while worked < n:
        result = run_search(search_args)
        if result.error_code is not None:
            return result.error_code
        if not result.urls:
            if result.exhausted:
                log("search exhausted")
                break
            log("search batch empty")
            continue
        remaining = n - worked
        batch = result.urls[:remaining]
        release_unprocessed(result.urls[remaining:])
        count, code = process_batch(batch, speech_ratio)
        worked += len(batch)
        printed += count
        if code != 0:
            return code
        if result.exhausted:
            log("search exhausted")
            break
    log(f"worked on {worked}, printed {printed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

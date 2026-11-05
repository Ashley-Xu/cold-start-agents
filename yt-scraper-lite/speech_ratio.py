#!/usr/bin/env python3
import argparse
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
import torch
from silero_vad import get_speech_timestamps, load_silero_vad

SAMPLE_RATE = 16000


def extract_audio(video_path: Path, wav_path: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not found on PATH; install it to extract audio from the video")
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", str(SAMPLE_RATE),
        "-sample_fmt", "s16",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True)


def load_wav_as_tensor(wav_path: Path) -> torch.Tensor:
    with wave.open(str(wav_path), "rb") as wf:
        if wf.getframerate() != SAMPLE_RATE or wf.getnchannels() != 1 or wf.getsampwidth() != 2:
            raise RuntimeError("expected 16kHz mono 16-bit PCM wav from the ffmpeg step")
        raw = wf.readframes(wf.getnframes())
    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0
    return torch.from_numpy(samples)


def speech_ratio(video_path: Path) -> float:
    with tempfile.TemporaryDirectory() as tmp:
        wav_path = Path(tmp) / "audio.wav"
        extract_audio(video_path, wav_path)
        audio = load_wav_as_tensor(wav_path)

    total_samples = audio.shape[0]
    if total_samples == 0:
        return 0.0

    model = load_silero_vad()
    timestamps = get_speech_timestamps(audio, model, sampling_rate=SAMPLE_RATE)

    speech_samples = sum(ts["end"] - ts["start"] for ts in timestamps)
    return speech_samples / total_samples


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compute the fraction (0.0-1.0) of a video's runtime that is human speech."
    )
    parser.add_argument("video", type=Path, help="path to the input video file")
    args = parser.parse_args()

    if not args.video.exists():
        parser.error(f"video file not found: {args.video}")

    ratio = speech_ratio(args.video)
    print(f"{ratio:.4f}")


if __name__ == "__main__":
    main()

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

_MEAN_VOLUME_RE = re.compile(r"mean_volume:\s*([-\d.]+)\s*dB", re.IGNORECASE)
_MAX_VOLUME_RE = re.compile(r"max_volume:\s*([-\d.]+)\s*dB", re.IGNORECASE)
_DURATION_RE = re.compile(
    r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", re.IGNORECASE
)

FFMPEG_INSTALL_HINT = (
    "Install ffmpeg on the AI server and restart ai-runtime "
    "(Windows: winget install Gyan.FFmpeg, then restart Tilt; "
    "or set FFMPEG_BIN in .env to the folder containing ffmpeg.exe)."
)

_ffmpeg_path: str | None = None
_ffprobe_path: str | None = None


def _win_get_bin_dirs() -> list[Path]:
    if sys.platform != "win32":
        return []
    dirs: list[Path] = []
    local = os.environ.get("LOCALAPPDATA", "")
    if not local:
        return dirs

    links = Path(local) / "Microsoft" / "WinGet" / "Links"
    if (links / "ffmpeg.exe").is_file():
        dirs.append(links)

    packages = Path(local) / "Microsoft" / "WinGet" / "Packages"
    if packages.is_dir():
        for pkg in packages.glob("Gyan.FFmpeg*"):
            for exe in pkg.rglob("ffmpeg.exe"):
                dirs.append(exe.parent)

    for candidate in (
        Path(r"C:\ffmpeg\bin"),
        Path(os.environ.get("ProgramFiles", "")) / "ffmpeg" / "bin",
    ):
        if candidate.is_dir() and (candidate / "ffmpeg.exe").is_file():
            dirs.append(candidate)

    seen: set[str] = set()
    unique: list[Path] = []
    for d in dirs:
        key = str(d.resolve()).lower()
        if key not in seen:
            seen.add(key)
            unique.append(d)
    return unique


def _resolve_tool(name: str) -> str | None:
    bin_dir = os.getenv("FFMPEG_BIN", "").strip()
    if bin_dir:
        ext = ".exe" if sys.platform == "win32" else ""
        candidate = Path(bin_dir) / f"{name}{ext}"
        if candidate.is_file():
            return str(candidate)

    if name == "ffmpeg":
        explicit = os.getenv("FFMPEG_PATH", "").strip()
        if explicit and Path(explicit).is_file():
            return explicit
    elif name == "ffprobe":
        explicit = os.getenv("FFPROBE_PATH", "").strip()
        if explicit and Path(explicit).is_file():
            return explicit

    found = shutil.which(name)
    if found:
        return found

    ext = ".exe" if sys.platform == "win32" else ""
    for directory in _win_get_bin_dirs():
        candidate = directory / f"{name}{ext}"
        if candidate.is_file():
            return str(candidate)

    return None


def _ffmpeg_exe() -> str:
    global _ffmpeg_path
    if _ffmpeg_path is None:
        _ffmpeg_path = _resolve_tool("ffmpeg")
    if not _ffmpeg_path:
        raise RuntimeError(f"ffmpeg is required for voice transcription. {FFMPEG_INSTALL_HINT}")
    return _ffmpeg_path


def _ffprobe_exe() -> str:
    global _ffprobe_path
    if _ffprobe_path is None:
        _ffprobe_path = _resolve_tool("ffprobe")
    return _ffprobe_path or _ffmpeg_exe()


def ffmpeg_available() -> bool:
    try:
        _ffmpeg_exe()
        _ffprobe_exe()
        return True
    except RuntimeError:
        return False


def ensure_ffmpeg_on_path() -> bool:
    """Prepend discovered ffmpeg bin dir to PATH for child processes."""
    if not ffmpeg_available():
        return False
    bin_dir = str(Path(_ffmpeg_exe()).parent)
    path = os.environ.get("PATH", "")
    if bin_dir.lower() not in path.lower().split(os.pathsep):
        os.environ["PATH"] = bin_dir + os.pathsep + path
    return True


def require_ffmpeg() -> str:
    return _ffmpeg_exe()


def require_ffprobe() -> str:
    return _ffprobe_exe()


def run_checked(cmd: list[str], *, timeout: float) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise RuntimeError(f"ffmpeg failed: {detail}") from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffmpeg timed out while processing audio") from exc


def _duration_from_ffmpeg_stderr(stderr: str) -> float | None:
    match = _DURATION_RE.search(stderr)
    if not match:
        return None
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def probe_duration_seconds(path: str) -> float:
    ffprobe = _resolve_tool("ffprobe")
    if ffprobe:
        try:
            proc = subprocess.run(
                [
                    ffprobe,
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    path,
                ],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if proc.returncode == 0:
                text = (proc.stdout or "").strip()
                if text and text.lower() not in ("n/a", "nan"):
                    return float(text)
        except (subprocess.TimeoutExpired, ValueError, OSError):
            pass

    try:
        proc = subprocess.run(
            [require_ffmpeg(), "-i", path],
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffmpeg timed out while reading audio duration") from exc

    duration = _duration_from_ffmpeg_stderr(proc.stderr or "")
    if duration is not None:
        return duration
    raise RuntimeError("ffmpeg could not read audio duration")


def probe_volume_db(
    path: str, *, timeout: float = 60.0, analyze_seconds: float | None = None
) -> tuple[float, float]:
    cmd = [require_ffmpeg(), "-i", path]
    if analyze_seconds is not None and analyze_seconds > 0:
        cmd.extend(["-t", str(analyze_seconds)])
    cmd.extend(["-af", "volumedetect", "-f", "null", "-"])
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError("ffmpeg timed out while analyzing audio loudness") from exc

    stderr = proc.stderr or ""
    mean_match = _MEAN_VOLUME_RE.search(stderr)
    max_match = _MAX_VOLUME_RE.search(stderr)
    if not mean_match or not max_match:
        raise RuntimeError("ffmpeg could not measure audio loudness")
    return float(mean_match.group(1)), float(max_match.group(1))


def convert_to_wav(
    source_path: str,
    dest_path: str,
    *,
    sample_rate: int = 16_000,
    channels: int = 1,
    timeout: float = 120.0,
) -> None:
    run_checked(
        [
            require_ffmpeg(),
            "-y",
            "-err_detect",
            "ignore_err",
            "-i",
            source_path,
            "-ar",
            str(sample_rate),
            "-ac",
            str(channels),
            dest_path,
        ],
        timeout=timeout,
    )

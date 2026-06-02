
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AI_RUNTIME = ROOT / "services" / "ai-runtime"
sys.path.insert(0, str(AI_RUNTIME))


def main() -> int:
    from models.voice.ffmpeg import FFMPEG_INSTALL_HINT, ffmpeg_available, require_ffmpeg

    if not ffmpeg_available():
        print("[verify-ffmpeg] FAILED — ffmpeg/ffprobe not found")
        print(f"  {FFMPEG_INSTALL_HINT}")
        return 1

    ffmpeg = require_ffmpeg()
    try:
        proc = subprocess.run(
            [ffmpeg, "-version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=True,
        )
        first = (proc.stdout or "").splitlines()[0]
        print(f"[verify-ffmpeg] OK — {first}")
        print(f"  ffmpeg: {ffmpeg}")
        return 0
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        print(f"[verify-ffmpeg] FAILED — could not run ffmpeg: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())

"""Resolve patched core on Windows 3.12 x64 and hash only its installable wheels."""
from __future__ import annotations
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from packaging.requirements import Requirement
from packaging.utils import canonicalize_name, parse_wheel_filename

ROOT = Path(__file__).resolve().parents[1]

def write_lock(resolved: Path, wheels: Path, target: Path) -> None:
    artifacts = {}
    for wheel in wheels.glob("*.whl"):
        name, version, _, _ = parse_wheel_filename(wheel.name)
        key = (canonicalize_name(name), str(version))
        if key in artifacts:
            raise ValueError("More than one wheel for " + str(key))
        artifacts[key] = hashlib.file_digest(wheel.open("rb"), "sha256").hexdigest()
    lines = [
        "# Generated on Windows x64 with CPython 3.12; not a cross-platform lock.",
        "# Source: scripts/requirements-windows.in -> apps/api/requirements-core.txt",
        "# Regenerate: powershell.exe -NoProfile -File scripts/update-windows-lock.ps1",
        "# Each hash is for the Windows 3.12 or platform-independent wheel actually downloaded.",
        "# No source builds; keep --require-hashes when installing.", "",
    ]
    required = set()
    for line in resolved.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        req = Requirement(line)
        spec = list(req.specifier)
        if len(spec) != 1 or spec[0].operator != "==" or req.url or req.extras:
            raise ValueError("Not an exact runtime requirement: " + line)
        key = (canonicalize_name(req.name), spec[0].version)
        required.add(key)
        digest = artifacts[key]  # Missing Windows wheel is a hard failure.
        lines.append(str(req) + " --hash=sha256:" + digest)
    if required != set(artifacts):
        raise ValueError("Wheel set differs from the resolved runtime closure")
    target.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

if __name__ == "__main__":
    if os.name != "nt" or sys.version_info[:2] != (3, 12) or sys.maxsize <= 2**32:
        raise SystemExit("Use CPython 3.12 x64 on Windows")
    with tempfile.TemporaryDirectory(prefix="opentutor-lock-") as folder:
        temp = Path(folder)
        resolved = temp / "resolved.txt"
        subprocess.run([
            sys.executable, "-m", "piptools", "compile", "--upgrade", "--resolver=backtracking",
            "--strip-extras", "--no-header", "--no-annotate", "--no-emit-index-url",
            "--no-emit-trusted-host", "--output-file=" + str(resolved),
            "scripts/requirements-windows.in",
        ], cwd=ROOT, check=True)
        subprocess.run([
            sys.executable, "-m", "pip", "download", "--only-binary=:all:", "--no-deps",
            "--dest", str(temp / "wheels"), "-r", str(resolved),
        ], cwd=ROOT, check=True)
        write_lock(resolved, temp / "wheels", ROOT / "scripts/requirements-windows.lock")

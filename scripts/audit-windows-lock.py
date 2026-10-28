"""Audit the exact Windows lock, without resolving a different environment."""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]

def audit(python: str, report: Path) -> None:
    report.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        python, "-m", "pip_audit", "--disable-pip", "--no-deps",
        "--require-hashes", "--format", "json", "--output", str(report),
        "-r", str(ROOT / "scripts/requirements-windows.lock"),
    ], cwd=ROOT, check=True)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", default=sys.executable,
                        help="Build-tool Python with pip-audit installed (never the shipped runtime)")
    parser.add_argument("--report", type=Path, default=ROOT / "source-release/windows-lock-audit.json")
    args = parser.parse_args()
    audit(args.python, args.report.resolve())

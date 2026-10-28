"""Public audit logs and reports must never contain matched credential values."""

import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest


def load_bundle(root, monkeypatch):
    script = Path(__file__).resolve().parents[1] / "scripts/source-bundle.py"
    spec = importlib.util.spec_from_file_location("source_bundle_privacy", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "ROOT", root)
    monkeypatch.setattr(module, "GIT", ["git", "-c", f"safe.directory={root.as_posix()}"])
    return module


@pytest.mark.parametrize("history_only", [False, True])
def test_export_blocks_credentials_without_disclosing_them(
    tmp_path, monkeypatch, capsys, history_only
):
    root = tmp_path.resolve()
    bundle = load_bundle(root, monkeypatch)

    def git(*args):
        subprocess.run(
            ["git", *args], cwd=root, check=True, capture_output=True
        )

    git("init", "-q")
    (root / ".gitignore").write_text(".env\nsource-release/\n", encoding="utf-8")
    # A synthetic sentinel, never a real provider credential.
    sentinel = "synthetic-private-value-82481963724"
    (root / ".env").write_text(f"OPENAI_API_KEY={sentinel}\n", encoding="utf-8")
    candidate = root / "example.txt"
    candidate.write_text(sentinel, encoding="utf-8")
    git("add", ".")
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid",
        "-c", "commit.gpgsign=false", "commit", "-qm", "Synthetic fixture")
    if history_only:
        candidate.write_text("Public content", encoding="utf-8")

    monkeypatch.setattr(sys, "argv", ["source-bundle.py", "--history", "--zip"])
    with pytest.raises(SystemExit) as error:
        bundle.main()
    assert error.value.code == 1

    output = capsys.readouterr()
    report_text = (root / "source-release/source-audit.json").read_text(encoding="utf-8")
    report = json.loads(report_text)
    assert sentinel not in output.out + output.err + report_text
    assert not report["ok"]
    assert bool(report["findings"]) is not history_only
    assert report["history"]["current_private_credential_matches"]
    assert not (root / "source-release/OpenTutor-source.zip").exists()
    assert "Source audit failed" in output.out
    assert "OPENAI_API_KEY" not in output.out


def test_clean_source_exports_with_summary_and_detailed_report(tmp_path, monkeypatch, capsys):
    root = tmp_path.resolve()
    bundle = load_bundle(root, monkeypatch)
    (root / "example.txt").write_text("Public content", encoding="utf-8")
    monkeypatch.setattr(bundle, "public_files", lambda: ["example.txt"])
    monkeypatch.setattr(sys, "argv", ["source-bundle.py", "--zip"])
    bundle.main()
    report = json.loads((root / "source-release/source-audit.json").read_text(encoding="utf-8"))
    assert report["ok"]
    assert report["findings"] == []
    assert (root / "source-release/OpenTutor-source.zip").exists()
    assert "Source audit passed; files=1; findings=0" in capsys.readouterr().out

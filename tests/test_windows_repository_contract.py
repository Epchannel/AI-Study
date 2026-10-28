"""Catch flattened browser uploads and mixed teaching changes before installation."""
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = (
    "scripts/native-control.ps1", "scripts/native-setup.py", "scripts/native-init.py",
    "scripts/native-server.py", "scripts/native-web-server.cjs", "scripts/native-backup.py",
    "scripts/native-cleanup.py", "scripts/native-log-archive.ps1",
    "scripts/build-native-launcher.ps1", "scripts/build-windows-package.py",
    "scripts/windows/Launcher.cs", "scripts/windows/Setup.cs", "scripts/windows/Node-LICENSE.txt",
    "scripts/requirements-windows.in", "scripts/requirements-windows.lock",
    "scripts/audit-windows-lock.py", "scripts/update-windows-lock.ps1", "scripts/resolve-windows-lock.py",
    "apps/api/config.py", "apps/api/services/app_lifecycle.py",
    "apps/api/services/agent/code_execution.py", "apps/api/services/health.py",
    "apps/web/next.config.ts", "docs/guides/windows-native-support.md",
    "tests/test_native_init.py", "tests/test_native_api_import.py",
    "tests/test_windows_lock.py", "tests/test_windows_native_flow.py",
)

def test_repository_tree_preserves_entrypoint_targets():
    # Inspect Git's repository file names as well as the working tree. Including
    # untracked files permits local checks before staging; CI checks tracked files.
    result = subprocess.run([
        "git", "-c", "safe.directory=" + ROOT.as_posix(), "-C", str(ROOT),
        "ls-files", "--cached", "--others", "--exclude-standard", "-z",
    ], check=True, capture_output=True)
    tree = set(result.stdout.decode("utf-8").split("\0"))
    missing = [name for name in REQUIRED if name not in tree or not (ROOT / name).is_file()]
    assert not missing, "Restore the original repository paths: " + ", ".join(missing)
    for name in REQUIRED:
        assert not (ROOT / Path(name).name).is_file(), "Flattened upload: " + Path(name).name

def test_cmd_entrypoints_reference_real_controller():
    for name, action in (("Start-OpenTutor.cmd", "Start"), ("Stop-OpenTutor.cmd", "Stop"),
                         ("Backup-OpenTutor.cmd", "Backup")):
        text = (ROOT / name).read_text(encoding="utf-8-sig")
        assert '%~dp0scripts\\native-control.ps1' in text
        assert "-Action " + action in text

def test_native_switches_are_in_live_modules():
    assert "app_auto_seed_demo" in (ROOT / "apps/api/config.py").read_text(encoding="utf-8-sig")
    assert "app_auto_seed_demo" in (ROOT / "apps/api/services/app_lifecycle.py").read_text(encoding="utf-8-sig")
    assert "OPENTUTOR_PACKAGE" in (ROOT / "apps/web/next.config.ts").read_text(encoding="utf-8-sig")

def test_new_regressions_are_in_ci_collection_directory():
    names = ["test_windows_repository_contract.py", "test_windows_lock.py", "test_windows_native_flow.py"]
    assert all((ROOT / "tests" / name).is_file() for name in names)
    ci = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    assert re.search(r"python -m pytest tests -q", ci)
    native_ci = (ROOT / ".github/workflows/windows-native.yml").read_text(encoding="utf-8")
    assert "scripts/audit-windows-lock.py" in native_ci
    assert "scripts/native-setup.py" in native_ci
    assert "tests/test_windows_native_flow.py" in native_ci

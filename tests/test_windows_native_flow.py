"""Opt-in real Windows start/stop/restart test; never runs on a user's active install."""
from pathlib import Path
import json
import os
import sqlite3
import subprocess
import urllib.request
import pytest

ROOT = Path(__file__).resolve().parents[1]

@pytest.mark.skipif(os.name != "nt" or os.environ.get("RUN_WINDOWS_NATIVE_SMOKE") != "1",
                    reason="Requires a disposable Windows checkout after native-setup.py")
def test_windows_start_stop_restart_and_backup():
    def control(action):
        return subprocess.run([
            "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
            str(ROOT / "scripts/native-control.ps1"), "-Action", action, "-NoBrowser",
        ], cwd=ROOT, capture_output=True, timeout=240, check=True).stdout.decode("utf-8-sig", errors="replace")
    def get(path):
        with urllib.request.urlopen(path, timeout=15) as response:
            return response.status, response.read()
    before = json.loads(control("Status"))
    assert not before["API"] and not before["Web"], "Use a fresh disposable checkout"
    try:
        # Exercise the exact .cmd entry point without opening the default browser.
        env = {**os.environ, "OPENTUTOR_NO_BROWSER": "1"}
        subprocess.run(["cmd.exe", "/d", "/c", str(ROOT / "Start-OpenTutor.cmd")],
                       cwd=ROOT, env=env, check=True, timeout=240)
        status = json.loads(control("Status"))
        assert status["API"] and status["Web"]
        assert get("http://127.0.0.1:8000/api/health/live")[0] == 200
        assert get("http://127.0.0.1:3001/settings")[0] == 200
        assert json.loads(get("http://127.0.0.1:8000/api/courses/")[1]) == []
        control("Backup")
        databases = list((ROOT / "local-backups").glob("*.sqlite3"))
        assert databases
        with sqlite3.connect(databases[-1]) as connection:
            assert connection.execute("PRAGMA quick_check").fetchone()[0] == "ok"
        original = (ROOT / "native-data/settings.env").read_bytes()
        subprocess.run(["cmd.exe", "/d", "/c", str(ROOT / "Stop-OpenTutor.cmd")], cwd=ROOT, check=True, timeout=60)
        stopped = json.loads(control("Status"))
        assert not stopped["API"] and not stopped["Web"]
        control("Start")
        assert (ROOT / "native-data/settings.env").read_bytes() == original
        assert get("http://127.0.0.1:3001/")[0] == 200
    finally:
        control("Stop")

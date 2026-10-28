"""An installer must exclude unrelated/stale tools even if they exist in the venv."""
import importlib.util
from pathlib import Path
import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("windows_package", ROOT / "scripts/build-windows-package.py")
package = importlib.util.module_from_spec(spec)
spec.loader.exec_module(package)

def make_distribution(site, name, version):
    info = site / f"{name}-{version}.dist-info"
    info.mkdir(parents=True)
    (site / f"{name}.py").write_text("# synthetic module\n")
    (info / "METADATA").write_text(f"Name: {name}\nVersion: {version}\n")
    paths = [f"{name}.py", f"{info.name}/METADATA", f"{info.name}/RECORD"]
    (info / "RECORD").write_text("".join(path + ",,\n" for path in paths))

def prepare(tmp_path, monkeypatch):
    (tmp_path / "scripts").mkdir()
    (tmp_path / "scripts/requirements-windows.lock").write_text("required==1.0 --hash=sha256:" + "0" * 64 + "\n")
    site = tmp_path / "site-packages"
    site.mkdir()
    monkeypatch.setattr(package, "ROOT", tmp_path)
    return site

def test_installer_keeps_only_locked_runtime_not_stale_or_test_packages(tmp_path, monkeypatch):
    site = prepare(tmp_path, monkeypatch)
    make_distribution(site, "required", "1.0")
    make_distribution(site, "ecdsa", "0.19.2")
    make_distribution(site, "pytest", "9.1.1")
    names = {path.relative_to(site).as_posix() for path in package.locked_runtime_files(site)}
    assert "required.py" in names
    assert "required-1.0.dist-info/METADATA" in names
    assert not any("ecdsa" in name or "pytest" in name for name in names)

def test_installer_refuses_a_venv_with_version_drift(tmp_path, monkeypatch):
    site = prepare(tmp_path, monkeypatch)
    make_distribution(site, "required", "0.9")
    with pytest.raises(ValueError, match="differs from Windows lock"):
        list(package.locked_runtime_files(site))

def test_installer_refuses_missing_runtime_library_files(tmp_path, monkeypatch):
    site = prepare(tmp_path, monkeypatch)
    make_distribution(site, "required", "1.0")
    (site / "required.py").unlink()
    with pytest.raises(ValueError, match="file missing"):
        list(package.locked_runtime_files(site))

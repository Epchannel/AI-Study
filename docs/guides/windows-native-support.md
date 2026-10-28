# Windows native installation and startup support

This PR adds Windows packaging and process management. It does not change AI teaching prompts, layouts, grading, notes, or upstream Docker defaults. Both review PRs start independently from upstream main at `039bfb9102f1aafc7fcc617a1f5a0ff7ae478613`.

## Supported targets and actual verification

| Item | Target / requirement | Actually checked |
| --- | --- | --- |
| Windows | Windows 10 22H2 x64 / Windows 11 x64 | Windows 11 23H2, OS build 22631.6199, x64 |
| Python | CPython 3.12 x64 for building from source; included in an installer | 3.12.14 |
| Node.js | 24.x x64 with npm for source setup; included in an installer | 24.21.0 |
| PowerShell | Windows PowerShell 5.1 | 5.1.22621.6133 |
| .NET Framework | 4.8+ for launcher / installer | Installed release key 533320 |
| Network | Needed to install source dependencies and use online model APIs | No paid model calls made during PR checks |

Windows 10, ARM64, Windows Server, and a separate clean physical PC have not been validated. The target compatibility range is not a claim that those systems passed testing. Microsoft's build mapping identifies build 22631 as Windows 11 23H2: https://learn.microsoft.com/en-us/windows/release-health/windows11-release-information .

## Install from a fork or source ZIP

1. Install CPython 3.12 x64 and Node.js 24 x64 with npm. Use a writable folder. Keep any existing installation and private configuration separate.
2. Open PowerShell at this repository root. Verify `py -3.12 --version` and `node --version`.
3. Prepare the application:

```powershell
py -3.12 scripts/native-setup.py --check
py -3.12 scripts/native-setup.py
```

`--check` only verifies installed build tools. The second command copies the interpreter without global site-packages, creates the project virtual environment, installs only hashed, Windows-compatible pinned Python wheels and runs `pip check`, installs frontend dependencies, builds Next's standalone server and static assets, compiles the launcher, and creates private local configuration if missing. It downloads dependencies and the matching Node.js license; it does not ask for an API key. If Node is not on PATH, add `--node "C:/Program Files/nodejs/node.exe"`.

4. Double-click `OpenTutor.exe` or `Start-OpenTutor.cmd`, then open http://localhost:3001 . Select the provider / model and enter your own API key in Settings. Online models require network access and an appropriate account. Nothing in this PR provides a model subscription or model weights.

Alternative management commands:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/native-control.ps1 -Action Start
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/native-control.ps1 -Action Status
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/native-control.ps1 -Action Stop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/native-control.ps1 -Action Backup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/native-control.ps1 -Action Clean
```

The API binds to 127.0.0.1:8000 and the web server to 127.0.0.1:3001. Startup refuses to terminate unrelated processes occupying those ports. Closing the page does not stop services; use the launcher or Stop command. Logs are owned by the services and archived per restart, rather than overwritten.

## Build and use a distributable installer

After native setup, Git is additionally required for the source/privacy allowlist:

```powershell
py -3.12 -m venv .venv-build
.venv-build/Scripts/python.exe -m pip install pip-audit==2.10.1 pip-tools==7.6.2
.venv-build/Scripts/python.exe -X utf8 scripts/build-windows-package.py
```

The builder audits the exact lock before distribution and only includes wheel RECORD files from the locked runtime closure. Missing files or version drift fail the build; stale virtualenv packages and test tools are excluded.

The output `source-release/OpenTutor-Setup-1.2.0-win-x64.exe` includes CPython, Node.js, installed runtime dependencies, the standalone frontend, backend code, and third-party licenses. Binaries are build artifacts for a Release attachment, not files for this source PR. The bundled program reflects only this PR's upstream baseline; the separate teaching PR is not needed to install or start it.

For an end user: run the installer, choose a writable empty directory, install, then launch and configure their own API in Settings. They do not need to install Python, Node.js, Git, Docker, or WSL. The installer validates its payload hash, rejects unsafe archive paths, and refuses to overwrite a non-empty directory. It is not code-signed and does not support in-place upgrades. Back up and stop an older installation before installing to a new folder.

## Local data and safety boundaries

- `native-data/settings.env`: current user's model settings and per-install signing/encryption keys. Created once and preserved on repeat initialization.
- `native-data/data/opentutor.db`: local SQLite data; `native-data/uploads/`: imported files.
- `native-data/logs/`: active logs and restart archives; `local-backups/`: SQLite snapshot and full backup.
- `.runtime/`, `.venv-win/`, `node_modules/`, `.next/`, `OpenTutor.exe`, and `source-release/` are generated and excluded from ordinary source export.
- `CODE_SANDBOX_BACKEND=disabled` is explicit for native installs: it does not substitute unsafe host execution for Docker isolation. Existing non-Windows container/process policies remain opt-in behavior.
- `APP_AUTO_SEED_DEMO=false` skips the demo course while retaining system templates. The upstream default is unchanged unless configured.
- Full backups contain API settings and private data. Do not attach backups, real environment files, databases, imported courses, or classmates' work to a PR.

## Lock provenance and security regression checks

The lock is derived from the current `apps/api/requirements-core.txt` via `scripts/requirements-windows.in`, resolved on CPython 3.12 x64 / Windows. It is not a frozen copy of the old developer virtual environment. `tests/test_windows_lock.py` also checks the constraints in `apps/api/pyproject.toml`. Optional `requirements-full.txt` integrations are not bundled by this core Windows installer.

Regenerate and audit on Windows (build tools are not shipped in the runtime):

```powershell
py -3.12 -m venv .venv-build
.venv-build/Scripts/python.exe -m pip install pip-tools==7.6.2 pip-audit==2.10.1
powershell.exe -NoProfile -File scripts/update-windows-lock.ps1 -Python .venv-build/Scripts/python.exe
```

Resolution starts from a temporary file rather than reusing old pins. Each resolved dependency must have an installable wheel for Windows CPython 3.12; its SHA256 is recorded. Source setup uses `--require-hashes`. The single wheel hash per package deliberately limits this lock to the stated platform; it must not be used as a Linux/macOS lock.

CI audits that exact lock with `pip-audit --disable-pip --no-deps --require-hashes`; there are no ignored vulnerabilities. It does not audit a newly resolved substitute environment. The new Windows workflow uses a clean Windows Server 2022 runner, checks source paths and metadata constraints, executes native setup, validates installed dependencies, runs real start/stop/restart/backup checks, and preserves audit/log artifacts. The existing Ubuntu `python -m pytest tests -q` gate is unchanged; new Python regressions live under `tests/` and are collected there. The real runtime test is opt-in and skips on ordinary non-Windows runs.

## Actual verification on 2026-10-26

Baseline: upstream main `039bfb9102f1aafc7fcc617a1f5a0ff7ae478613`, which includes the #98 security fixes. Only this Windows overlay was applied, without the teaching overlay.

- Host: Windows 11 Pro 23H2 x64, build 22631.6199; CPython 3.12.14; Node.js 24.21.0; Windows PowerShell 5.1.22621.6133.
- An exact audit of the previous Windows lock reproduced 38 advisory records affecting 8 packages. The rebuilt 94-package lock reported zero known vulnerabilities, with zero packages skipped, using pip-audit 2.10.1. This is a dated database result, not a permanent security guarantee.
- `certifi` -> 2026.10.23, `lxml` -> 6.1.3, `lxml-html-clean` -> 0.4.5, `pypdf` -> 6.21.2, `python-dotenv` -> 1.2.4, `python-multipart` -> 0.0.32, `starlette` -> 1.10.0; obsolete python-jose/ecdsa/rsa/pyasn1 are absent. FastAPI 0.136.3, PyJWT 2.15.1 and OpenAI 2.54.0 satisfy patched main.
- Full `native-setup.py --node D:/node/node.exe` ran in a newly extracted upstream source tree with no copied runtime, Python environment or node_modules. It installed hashed dependencies, passed `pip check`, ran npm ci, completed a standalone production build, compiled the launcher, and created blank per-install settings. Existing package download caches were allowed; no manual runtime dependency repair was made.
- 31 targeted Python regressions passed: existing native/seed/sandbox/import tests plus repository tree, lock constraints, and package-closure tests. A real Windows flow test also passed (32 relevant checks total): the .cmd entrypoint starts the API and web/Settings; courses are empty; SQLite backup passes quick_check; stop/restart succeeds and preserves private settings bytes. Log archival PowerShell checks passed.
- The audited installer built successfully and installed into a new path containing Chinese text and a space. It passed the same start/stop/restart/backup flow using its bundled interpreter, without project virtualenv or separate runtimes. Obsolete ecdsa/rsa and pytest were absent from the installed runtime.
- The unmodified upstream frontend npm audit reports 5 low findings, with zero moderate/high/critical. Frontend dependency changes are outside this Windows-only fix.

GitHub Actions has been added but not run remotely as part of preparing these source files. The Windows Server CI target, Windows 10, ARM64 and a separate clean physical computer have not been verified by these local checks. No live model calls or teaching-quality claims are included. Local synthetic settings and course-empty checks do not involve real students or API keys. Test reports shared for review are sanitized; private logs/configuration are not part of the source overlay.

#Requires -Version 5.1
param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Regenerate on Windows x64 with CPython 3.12.' }
$lockRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Push-Location -LiteralPath $lockRoot
$previousCommand = $env:CUSTOM_COMPILE_COMMAND
try {
    & $Python -c "import sys; assert sys.version_info[:2] == (3,12) and sys.maxsize > 2**32"
    if ($LASTEXITCODE -ne 0) { throw 'Use CPython 3.12 x64.' }
    & $Python scripts/resolve-windows-lock.py
    if ($LASTEXITCODE -ne 0) { throw 'Windows dependency resolution failed.' }
    & $Python scripts/audit-windows-lock.py
    if ($LASTEXITCODE -ne 0) { throw 'Exact Windows lock audit failed; do not distribute.' }
} finally {
    $env:CUSTOM_COMPILE_COMMAND = $previousCommand
    Pop-Location
}

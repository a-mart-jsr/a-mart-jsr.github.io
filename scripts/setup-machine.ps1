$ErrorActionPreference = "Stop"

Set-Location (Split-Path -Parent $PSScriptRoot)

function Test-Command {
  param([Parameter(Mandatory = $true)][string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
  param(
    [Parameter(Mandatory = $true)][string]$Id,
    [Parameter(Mandatory = $true)][string]$Name
  )

  if (-not (Test-Command winget)) {
    throw "winget was not found. Install $Name manually, then run this script again."
  }

  Write-Host "Installing $Name..."
  winget install --id $Id --exact --source winget --accept-package-agreements --accept-source-agreements
}

function Get-PythonCommand {
  if (Test-Command py) {
    return [pscustomobject]@{ Exe = "py"; Args = @("-3") }
  }

  if (Test-Command python) {
    return [pscustomobject]@{ Exe = "python"; Args = @() }
  }

  return $null
}

if (-not (Test-Command git)) {
  Install-WithWinget -Id "Git.Git" -Name "Git"
}

$pythonCommand = Get-PythonCommand
if (-not $pythonCommand) {
  Install-WithWinget -Id "Python.Python.3.12" -Name "Python"
  $pythonCommand = Get-PythonCommand
}

if (-not (Test-Command git)) {
  throw "Git was installed but is not available in this PowerShell session. Close PowerShell, open it again, and rerun this script."
}

if (-not $pythonCommand) {
  throw "Python was installed but is not available in this PowerShell session. Close PowerShell, open it again, and rerun this script."
}

Write-Host ""
Write-Host "Installed tools:"
git --version
& $pythonCommand.Exe @($pythonCommand.Args) --version

try {
  git config --global credential.helper manager | Out-Null
} catch {
  Write-Host "Could not set Git Credential Manager automatically. Git push may ask you to sign in another way."
}

$gitName = (git config --global user.name) 2>$null
if ([string]::IsNullOrWhiteSpace($gitName)) {
  $gitName = Read-Host "Enter the name Git should use for commits"
  if (-not [string]::IsNullOrWhiteSpace($gitName)) {
    git config --global user.name $gitName
  }
}

$gitEmail = (git config --global user.email) 2>$null
if ([string]::IsNullOrWhiteSpace($gitEmail)) {
  $gitEmail = Read-Host "Enter the email Git should use for commits"
  if (-not [string]::IsNullOrWhiteSpace($gitEmail)) {
    git config --global user.email $gitEmail
  }
}

Write-Host ""
if (Test-Path ".git") {
  $origin = (git remote get-url origin) 2>$null
  if ([string]::IsNullOrWhiteSpace($origin)) {
    Write-Host "This folder is a Git repo, but it has no origin remote. Add one before using the admin Update button to push."
  } else {
    Write-Host "Git origin remote: $origin"
  }
} else {
  Write-Host "This folder is not a Git repo. Use a Git clone of the project if the admin Update button should push to GitHub."
}

Write-Host ""
Write-Host "Setup complete. Start the local editor with:"
Write-Host ".\start-admin.bat"

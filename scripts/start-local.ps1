$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$Host.UI.RawUI.WindowTitle = "Care SaaS Local Services"

Write-Host "Starting local API and two web workspaces..." -ForegroundColor Green
Write-Host ""
Write-Host "Organization: http://127.0.0.1:5173"
Write-Host "Platform:     http://127.0.0.1:5174"
Write-Host "API:          http://127.0.0.1:3000"
Write-Host ""
Write-Host "Keep this window open while using the local demo." -ForegroundColor Yellow
Write-Host ""

corepack pnpm dev

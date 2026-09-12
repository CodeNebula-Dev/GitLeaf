<#
.SYNOPSIS
    GitLeaf Setup Script for Windows PowerShell
.DESCRIPTION
    One-script automated installer and dependency guide for GitLeaf on Windows.
#>

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "                GitLeaf One-Script Installer & Setup Guide                     " -ForegroundColor White
Write-Host "            Local-First Collaborative LaTeX Platform (Windows)                 " -ForegroundColor Gray
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if Node.js is installed
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
    Write-Host "[X] Node.js was not detected on this system!" -ForegroundColor Red
    Write-Host "GitLeaf requires Node.js (version 18 or higher) to run.`n" -ForegroundColor Yellow
    
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
    Write-Host "Recommended ways to install Node.js on Windows:" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. Via Windows Package Manager (winget):" -ForegroundColor Cyan
    Write-Host "     winget install OpenJS.NodeJS.LTS" -ForegroundColor White
    Write-Host ""
    Write-Host "  2. Via Official Installer:" -ForegroundColor Cyan
    Write-Host "     Download and run the Windows installer from: https://nodejs.org/" -ForegroundColor White
    Write-Host ""
    Write-Host "  3. Via Chocolatey or Scoop:" -ForegroundColor Cyan
    Write-Host "     choco install nodejs-lts" -ForegroundColor White
    Write-Host "     scoop install nodejs" -ForegroundColor White
    Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
    Write-Host ""

    $openBrowser = Read-Host "Would you like to open the Node.js download page in your browser? (y/N)"
    if ($openBrowser -match "^[yY]") {
        Start-Process "https://nodejs.org/"
    }

    Write-Host "`nAfter installing Node.js, reopen PowerShell and run .\setup.ps1 again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# 2. Check Node version (>= 18)
$nodeVerStr = (node -v).Trim().TrimStart('v')
$majorVer = [int]($nodeVerStr.Split('.')[0])

if ($majorVer -lt 18) {
    Write-Host "[!] Your Node.js version ($nodeVerStr) is older than v18.0.0." -ForegroundColor Red
    Write-Host "GitLeaf requires Node.js 18 or higher." -ForegroundColor Yellow
    Write-Host "Please upgrade via: winget install OpenJS.NodeJS.LTS or https://nodejs.org/" -ForegroundColor Cyan
    Read-Host "Press Enter to exit"
    exit 1
}

# 3. Run cross-platform setup engine
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptDir\scripts\setup.mjs" $args

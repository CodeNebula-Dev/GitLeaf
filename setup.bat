@echo off
setlocal enabledelayedexpansion

:: Switch to UTF-8 code page for unicode/box characters
chcp 65001 >nul

echo ===============================================================================
echo                GitLeaf One-Script Installer ^& Setup Guide
echo            Local-First Collaborative LaTeX Platform (Windows)
echo ===============================================================================
echo.

:: 1. Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] Node.js was not detected on this system!
    echo GitLeaf requires Node.js (version 18 or higher) to run.
    echo.
    echo -------------------------------------------------------------------------------
    echo Recommended ways to install Node.js on Windows:
    echo.
    echo   1. Via Windows Package Manager (winget - Recommended):
    echo      Open PowerShell and run:
    echo      winget install OpenJS.NodeJS.LTS
    echo.
    echo   2. Via Official Installer:
    echo      Download and run the Windows .msi installer from:
    echo      https://nodejs.org/
    echo.
    echo   3. Via Chocolatey or Scoop:
    echo      choco install nodejs-lts
    echo      scoop install nodejs
    echo -------------------------------------------------------------------------------
    echo.

    set /p OPEN_WEB="Would you like to open the Node.js download page now? (Y/N): "
    if /i "!OPEN_WEB!"=="Y" (
        start https://nodejs.org/
    )

    echo.
    echo After installing Node.js, close this window and run setup.bat again.
    pause
    exit /b 1
)

:: 2. Check Node.js version (>= 18)
node -e "process.exit(parseInt(process.version.replace('v','').split('.')[0], 10) >= 18 ? 0 : 1)"
if %errorlevel% neq 0 (
    echo [!] Your Node.js version is older than v18.0.0.
    echo GitLeaf requires Node.js 18 or higher.
    echo Please upgrade via: winget install OpenJS.NodeJS.LTS
    echo or download from https://nodejs.org/
    pause
    exit /b 1
)

:: 3. Run cross-platform setup engine
node "%~dp0scripts\setup.mjs" %*

endlocal

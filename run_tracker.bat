@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: Move to the directory where this batch file is located
cd /d "%~dp0"

echo ===================================================
echo   Financial Regulatory Tracker Dashboard
echo ===================================================
echo.
echo [1/2] Fetching updates from FSC Korea...
echo.

:: Run the script using the virtual environment python
call ".\venv\Scripts\python.exe" "src\main.py"

echo.
echo [2/2] Fetch complete. Opening dashboard in browser...
echo.

:: Open the index.html
start "" "index.html"

echo.
echo Dashboard loaded successfully.
echo.

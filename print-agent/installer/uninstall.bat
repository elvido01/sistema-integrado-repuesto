@echo off
REM Motoflow Print Agent - Desinstalador

net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo [ERROR] Ejecuta como Administrador.
    pause
    exit /b 1
)

set "DEST=C:\Program Files\Motoflow\PrintAgent"
set "EXE_NAME=motoflow-print-agent.exe"
set "STARTUP_FILE=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Motoflow Print Agent.bat"

echo Deteniendo agente...
taskkill /F /IM %EXE_NAME% >nul 2>&1

echo Quitando autostart...
schtasks /Delete /TN "Motoflow Print Agent" /F >nul 2>&1
schtasks /Delete /TN "Motoflow Print Agent Watchdog" /F >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /f >nul 2>&1
reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /f >nul 2>&1
if exist "%STARTUP_FILE%" del /F /Q "%STARTUP_FILE%" >nul 2>&1

echo Eliminando archivos...
if exist "%DEST%" rmdir /S /Q "%DEST%"

echo.
echo Motoflow Print Agent desinstalado.
pause

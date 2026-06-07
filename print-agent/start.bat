@echo off
REM ============================================================
REM Motoflow Print Agent — arranque con auto-reinicio
REM ============================================================
REM Wrapper que relanza el agente automaticamente si:
REM   - Sale con exit code 42 (solicitado por /restart-self)
REM   - Crashea inesperadamente (cualquier exit code != 0)
REM
REM Salida limpia (Ctrl+C o exit 0) NO relanza.
REM ============================================================

title Motoflow Print Agent
cd /d "%~dp0"

:loop
echo.
echo === %DATE% %TIME% — Iniciando agente ===
node index.js
set CODE=%ERRORLEVEL%
echo.
echo === %DATE% %TIME% — Agente termino con codigo: %CODE% ===

if "%CODE%"=="0" (
    echo Salida limpia. Cerrando wrapper.
    pause
    exit /b 0
)

if "%CODE%"=="42" (
    echo Reinicio solicitado por /restart-self. Relanzando...
    timeout /t 2 /nobreak >nul
    goto loop
)

echo Crash detectado. Reintentando en 5 segundos...
timeout /t 5 /nobreak >nul
goto loop

@echo off
REM ============================================================
REM Motoflow Print Agent - Instalador sin administrador
REM ============================================================
REM Instala el agente solo para el usuario actual:
REM   %LOCALAPPDATA%\Motoflow\PrintAgent\
REM Registra inicio automatico en HKCU\Run.
REM No requiere ejecutar como Administrador.
REM ============================================================

setlocal enabledelayedexpansion

set "DEST=%LOCALAPPDATA%\Motoflow\PrintAgent"
set "EXE_NAME=motoflow-print-agent.exe"
set "TARGET=%DEST%\%EXE_NAME%"
set "STARTER=%DEST%\start-agent-user.bat"
set "LOGDIR=%LOCALAPPDATA%\Motoflow\PrintAgent\logs"

REM Busca el exe en varias ubicaciones segun como se distribuya el zip.
set "SOURCE="
if exist "%~dp0%EXE_NAME%" set "SOURCE=%~dp0%EXE_NAME%"
if not defined SOURCE if exist "%~dp0..\%EXE_NAME%" set "SOURCE=%~dp0..\%EXE_NAME%"
if not defined SOURCE if exist "%~dp0..\dist\%EXE_NAME%" set "SOURCE=%~dp0..\dist\%EXE_NAME%"
if not defined SOURCE if exist "%~dp0dist\%EXE_NAME%" set "SOURCE=%~dp0dist\%EXE_NAME%"

echo.
echo ===============================================================
echo   Motoflow Print Agent - Instalador sin administrador
echo ===============================================================
echo.

if not defined SOURCE (
    echo [ERROR] No se encontro %EXE_NAME%.
    echo Coloca install-user.bat en la misma carpeta del ejecutable.
    echo.
    pause
    exit /b 1
)

echo Encontrado: %SOURCE%

echo [1/4] Creando carpeta de usuario...
if not exist "%DEST%" mkdir "%DEST%"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

echo [2/4] Deteniendo agente anterior si existe...
taskkill /F /IM %EXE_NAME% >nul 2>&1

echo [3/4] Copiando agente...
copy /Y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el archivo a:
    echo %TARGET%
    pause
    exit /b 1
)

echo Creando arrancador...
(
  echo @echo off
  echo setlocal
  echo set "DEST=%DEST%"
  echo set "EXE=%TARGET%"
  echo set "LOGDIR=%LOGDIR%"
  echo if not exist "%%LOGDIR%%" mkdir "%%LOGDIR%%" ^>nul 2^>^&1
  echo powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9123/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; if (Test-Path $env:EXE) { Start-Process -FilePath $env:EXE -WorkingDirectory $env:DEST -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:LOGDIR 'agent.out.log') -RedirectStandardError (Join-Path $env:LOGDIR 'agent.err.log') }"
  echo endlocal
) > "%STARTER%"

echo [4/4] Registrando inicio automatico para este usuario...
reg add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /t REG_SZ /d "\"%STARTER%\"" /f >nul
if errorlevel 1 (
    echo [WARN] No se pudo registrar HKCU\Run. El agente funcionara hoy, pero puede no iniciar con Windows.
) else (
    echo Inicio automatico registrado en HKCU\Run.
)

echo.
echo Arrancando el agente...
call "%STARTER%"

echo.
echo ===============================================================
echo   INSTALACION COMPLETADA SIN ADMINISTRADOR
echo ===============================================================
echo   Ubicacion: %DEST%
echo   URL local: http://127.0.0.1:9123
echo.
echo   Verifica abriendo en el navegador:
echo     http://127.0.0.1:9123/health
echo ===============================================================
echo.
pause

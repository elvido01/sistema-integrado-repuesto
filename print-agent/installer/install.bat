@echo off
REM ============================================================
REM Motoflow Print Agent — Instalador
REM ============================================================
REM Instala el agente en C:\Program Files\Motoflow\PrintAgent\
REM Registra autostart al iniciar Windows.
REM Requiere ejecutarse como Administrador.
REM ============================================================

setlocal enabledelayedexpansion

REM Verificar permisos de administrador
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo [ERROR] Este instalador debe ejecutarse como Administrador.
    echo Cierra esta ventana, haz clic derecho sobre install.bat y selecciona
    echo "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

set "DEST=C:\Program Files\Motoflow\PrintAgent"
set "EXE_NAME=motoflow-print-agent.exe"
set "TARGET=%DEST%\%EXE_NAME%"
set "STARTER=%DEST%\start-agent.bat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "STARTUP_FILE=%STARTUP_DIR%\Motoflow Print Agent.bat"

REM Busca el exe en varias ubicaciones (segun como se distribuya el zip)
set "SOURCE="
if exist "%~dp0%EXE_NAME%" set "SOURCE=%~dp0%EXE_NAME%"
if not defined SOURCE if exist "%~dp0..\%EXE_NAME%" set "SOURCE=%~dp0..\%EXE_NAME%"
if not defined SOURCE if exist "%~dp0..\dist\%EXE_NAME%" set "SOURCE=%~dp0..\dist\%EXE_NAME%"
if not defined SOURCE if exist "%~dp0dist\%EXE_NAME%" set "SOURCE=%~dp0dist\%EXE_NAME%"

echo.
echo ===============================================================
echo   Motoflow Print Agent - Instalador
echo ===============================================================
echo.

REM 1. Verificar que existe el exe origen
if not defined SOURCE (
    echo [ERROR] No se encontro %EXE_NAME% en:
    echo   - %~dp0%EXE_NAME%
    echo   - %~dp0..\%EXE_NAME%
    echo   - %~dp0..\dist\%EXE_NAME%
    echo   - %~dp0dist\%EXE_NAME%
    echo.
    echo Asegurate de tener motoflow-print-agent.exe en la misma carpeta que install.bat
    pause
    exit /b 1
)
echo Encontrado: %SOURCE%

REM 2. Crear carpeta destino
echo [1/4] Creando carpeta de instalacion...
if not exist "%DEST%" mkdir "%DEST%"

REM 3. Detener proceso anterior si existe
echo [2/4] Deteniendo agente anterior si existe...
taskkill /F /IM %EXE_NAME% >nul 2>&1

REM 4. Copiar exe
echo [3/4] Copiando archivo a %TARGET%...
copy /Y "%SOURCE%" "%TARGET%" >nul
if errorlevel 1 (
    echo [ERROR] No se pudo copiar el archivo.
    pause
    exit /b 1
)

echo Creando arrancador persistente...
(
  echo @echo off
  echo setlocal
  echo set "DEST=%DEST%"
  echo set "EXE=%TARGET%"
  echo set "LOGDIR=%%ProgramData%%\Motoflow\PrintAgent\logs"
  echo if not exist "%%LOGDIR%%" mkdir "%%LOGDIR%%" ^>nul 2^>^&1
  echo powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9123/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { }; if (Test-Path $env:EXE) { Start-Process -FilePath $env:EXE -WorkingDirectory $env:DEST -WindowStyle Hidden -RedirectStandardOutput (Join-Path $env:LOGDIR 'agent.out.log') -RedirectStandardError (Join-Path $env:LOGDIR 'agent.err.log') }"
  echo endlocal
) > "%STARTER%"

REM 5. Registrar autostart en Windows.
REM    Preferimos Task Scheduler porque es mas confiable despues de reiniciar
REM    y permite correr con privilegios elevados. Dejamos HKLM/HKCU/Startup como respaldo.
echo [4/4] Configurando inicio automatico con Windows...
schtasks /Delete /TN "Motoflow Print Agent" /F >nul 2>&1
schtasks /Delete /TN "Motoflow Print Agent Watchdog" /F >nul 2>&1
schtasks /Create /TN "Motoflow Print Agent" /TR "\"%STARTER%\"" /SC ONLOGON /RL HIGHEST /F >nul
if errorlevel 1 (
    echo [WARN] No se pudo crear la tarea programada. Usando registro HKLM\Run.
) else (
    echo Tarea programada creada: Motoflow Print Agent
)
reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /t REG_SZ /d "\"%STARTER%\"" /f >nul
reg add "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /t REG_SZ /d "\"%STARTER%\"" /f >nul
if not exist "%STARTUP_DIR%" mkdir "%STARTUP_DIR%" >nul 2>&1
copy /Y "%STARTER%" "%STARTUP_FILE%" >nul 2>&1

REM 6. Iniciar agente
echo.
echo Arrancando el agente...
call "%STARTER%"

echo.
echo ===============================================================
echo   INSTALACION COMPLETADA
echo ===============================================================
echo   Ubicacion: %DEST%
echo   URL local: http://127.0.0.1:9123
echo   Autostart: si (Task Scheduler al iniciar Windows + respaldos Run/Startup)
echo   Watchdog: no. El sistema verifica el agente al imprimir.
echo.
echo   Verifica abriendo en el navegador:
echo     http://127.0.0.1:9123/health
echo ===============================================================
echo.
pause

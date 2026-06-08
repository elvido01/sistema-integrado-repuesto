@echo off
REM ============================================================
REM Motoflow Print Agent - Instalador desde codigo fuente
REM ============================================================
REM Instala el agente como tarea programada que ejecuta
REM `node index.js` desde la carpeta del repo (no EXE compilado).
REM
REM Ventajas vs install.bat tradicional:
REM   - Para actualizar: git pull + relanzar tarea (sin compilar)
REM   - Stack traces reales si algo falla
REM   - Mismo codigo en main y en deploy
REM
REM Requiere:
REM   - Node.js instalado (node --version debe responder)
REM   - PowerShell admin (este .bat lo verifica)
REM   - El repo c:\Users\PC\sistema-integrado-repuesto en la PC
REM ============================================================

setlocal enabledelayedexpansion

REM Verificar admin
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo [ERROR] Este instalador necesita ejecutarse como Administrador.
    echo Click derecho sobre install-from-source.bat -^> "Ejecutar como administrador".
    echo.
    pause
    exit /b 1
)

REM Verificar Node
where node >nul 2>&1
if %errorLevel% NEQ 0 (
    echo.
    echo [ERROR] Node.js no esta en el PATH. Instalalo desde https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM Calcular rutas. Este script vive en print-agent\installer\
set "SCRIPT_DIR=%~dp0"
set "AGENT_DIR=%SCRIPT_DIR%.."
pushd "%AGENT_DIR%"
set "AGENT_DIR=%CD%"
popd

set "INDEX_JS=%AGENT_DIR%\index.js"
set "LOGDIR=%ProgramData%\Motoflow\PrintAgent\logs"
set "STARTER=%AGENT_DIR%\start-as-service.bat"

if not exist "%INDEX_JS%" (
    echo [ERROR] No se encontro %INDEX_JS%
    echo Asegurate que el repo este en su lugar.
    pause
    exit /b 1
)

echo.
echo ===============================================================
echo   Motoflow Print Agent - Instalacion desde codigo fuente
echo ===============================================================
echo   Carpeta agente: %AGENT_DIR%
echo   index.js:       %INDEX_JS%
echo   Logs:           %LOGDIR%
echo ===============================================================
echo.

REM 1. Detener cualquier instancia anterior (EXE compilado + node)
echo [1/5] Deteniendo agente anterior...
taskkill /F /IM motoflow-print-agent.exe >nul 2>&1
REM Matamos node.exe SOLO si esta escuchando en 9123 (no toca otros node)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9123 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"

REM Eliminar tareas y entradas Run viejas para no duplicar
schtasks /Delete /TN "Motoflow Print Agent" /F >nul 2>&1
schtasks /Delete /TN "Motoflow Print Agent Watchdog" /F >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /f >nul 2>&1
reg delete "HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /f >nul 2>&1
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Motoflow Print Agent.bat" >nul 2>&1

REM 2. Crear carpeta de logs
echo [2/5] Creando carpeta de logs...
if not exist "%LOGDIR%" mkdir "%LOGDIR%" >nul 2>&1

REM 3. Crear el starter que se ejecutara al iniciar Windows
echo [3/5] Creando arrancador...
(
  echo @echo off
  echo setlocal
  echo cd /d "%AGENT_DIR%"
  echo for /f %%%%I in ^('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"'^) do set "TODAY=%%%%I"
  echo set "LOGFILE=%LOGDIR%\agent-%%TODAY%%.log"
  echo REM Si ya hay algo escuchando en 9123 salimos limpio.
  echo powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 9123 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" ^>nul
  echo if %%errorlevel%% EQU 0 exit /b 0
  echo :loop
  echo echo [%%date%% %%time%%] Arrancando agente... ^>^> "%%LOGFILE%%"
  echo node "%INDEX_JS%" ^>^> "%%LOGFILE%%" 2^>^&1
  echo set CODE=%%errorlevel%%
  echo echo [%%date%% %%time%%] Agente termino con codigo: %%CODE%% ^>^> "%%LOGFILE%%"
  echo REM Cualquier salida no-0 ^(crash^) o 42 ^(restart-self^) relanza.
  echo if "%%CODE%%"=="0" exit /b 0
  echo timeout /t 3 /nobreak ^>nul
  echo goto loop
) > "%STARTER%"

REM 4. Registrar Task Scheduler (al iniciar Windows, con SYSTEM)
echo [4/5] Creando tarea programada...
schtasks /Create /TN "Motoflow Print Agent" /TR "\"%STARTER%\"" /SC ONLOGON /RL HIGHEST /F >nul
if errorlevel 1 (
    echo [WARN] No se pudo crear la tarea programada. Cayendo a HKLM\Run.
    reg add "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run" /v "MotoflowPrintAgent" /t REG_SZ /d "\"%STARTER%\"" /f >nul
) else (
    echo Tarea "Motoflow Print Agent" creada.
)

REM 5. Arrancar el agente AHORA
echo [5/5] Arrancando agente...
start "" /B "%STARTER%"

echo.
echo Esperando 3 segundos a que arranque...
timeout /t 3 /nobreak >nul

echo.
echo === Verificando que el agente respondio ===
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9123/health' -TimeoutSec 5; $j = $r.Content | ConvertFrom-Json; Write-Host ''; Write-Host ('OK - Agente v' + $j.version + ' corriendo. Uptime: ' + $j.uptimeSeconds + 's') -ForegroundColor Green } catch { Write-Host ''; Write-Host 'NO RESPONDE. Revisa los logs en:' -ForegroundColor Red; Write-Host '%LOGDIR%' -ForegroundColor Yellow }"

echo.
echo ===============================================================
echo   INSTALACION COMPLETADA
echo ===============================================================
echo   URL local: http://127.0.0.1:9123/health
echo   Logs: %LOGDIR%
echo   Tarea: schtasks /Query /TN "Motoflow Print Agent"
echo.
echo   Para actualizar en el futuro:
echo     1. cd %AGENT_DIR%
echo     2. git pull
echo     3. Click en boton "Reiniciar Agente" en la web
echo        ^(o: schtasks /End + /Run de la tarea^)
echo ===============================================================
echo.
pause

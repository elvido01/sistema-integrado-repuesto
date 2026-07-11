@echo off
setlocal EnableDelayedExpansion

REM ================================================================
REM  Respaldo diario estilo SiiF (mismo formato que Caminero Motors)
REM  Crea  E:\COPIAS\YYYY-MM-DD\<base>.<YYYY-MM-DD>.SQL  con mysqldump
REM
REM  Para la PC vieja de REPUESTOS MORLA (o cualquier PC con SiiF).
REM  Configura las 4 variables de abajo UNA sola vez y prográmalo en el
REM  Programador de tareas de Windows (ver instrucciones al final).
REM ================================================================

REM Carpeta bin de MySQL (donde están mysql.exe y mysqldump.exe).
REM Típicos: C:\xampp\mysql\bin  ·  C:\wamp\bin\mysql\mysqlX.X\bin
REM          C:\Program Files\MySQL\MySQL Server X.X\bin
set "MYSQL_BIN=C:\xampp\mysql\bin"

REM Usuario y clave de MySQL del SiiF (dejar MYSQL_PASS vacío si no tiene)
set "MYSQL_USER=root"
set "MYSQL_PASS="

REM Destino en el disco externo (igual que Caminero Motors)
set "DEST=E:\COPIAS"

REM ----------------------------------------------------------------
REM  No hace falta tocar nada debajo de esta línea
REM ----------------------------------------------------------------

REM Fecha YYYY-MM-DD independiente del idioma de Windows
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "FECHA=%%i"

if not exist "%MYSQL_BIN%\mysqldump.exe" (
  echo [ERROR] No se encontro mysqldump en "%MYSQL_BIN%".
  echo         Corrige la variable MYSQL_BIN dentro de este archivo.
  pause
  exit /b 1
)

if not exist "%DEST%\" (
  echo [ERROR] No se encuentra %DEST% — conecta el disco externo e intenta de nuevo.
  pause
  exit /b 1
)

set "CARPETA=%DEST%\%FECHA%"
if not exist "%CARPETA%" mkdir "%CARPETA%"

set "PASSARG="
if not "%MYSQL_PASS%"=="" set "PASSARG=-p%MYSQL_PASS%"

set "PATH=%MYSQL_BIN%;%PATH%"

echo.
echo Respaldando bases de datos a %CARPETA% ...
set "ERRORES=0"
for /f "delims=" %%D in ('mysql -u %MYSQL_USER% %PASSARG% -N -e "SHOW DATABASES"') do (
  if /i not "%%D"=="information_schema" if /i not "%%D"=="performance_schema" if /i not "%%D"=="mysql" if /i not "%%D"=="sys" (
    echo   - %%D
    mysqldump -u %MYSQL_USER% %PASSARG% --routines --triggers "%%D" > "%CARPETA%\%%D.%FECHA%.SQL"
    if errorlevel 1 (
      echo     [ERROR] fallo el respaldo de %%D
      set "ERRORES=1"
    )
  )
)

echo.
if "%ERRORES%"=="1" (
  echo Respaldo %FECHA% terminado CON ERRORES — revisar arriba.
  pause
  exit /b 1
)
echo Listo: respaldo %FECHA% completado sin errores.
exit /b 0

REM ================================================================
REM  PROGRAMARLO AUTOMATICO (una sola vez, en cmd como Administrador):
REM
REM    schtasks /create /tn "Respaldo SiiF diario" ^
REM      /tr "C:\respaldo\respaldo-diario-siif.bat" ^
REM      /sc daily /st 19:30
REM
REM  (Copiar este .bat a C:\respaldo\ en esa PC, o ajustar la ruta.)
REM ================================================================

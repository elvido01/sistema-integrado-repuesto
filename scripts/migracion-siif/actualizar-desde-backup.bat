@echo off
REM ============================================================
REM  Actualiza el sistema nuevo con el respaldo MAS RECIENTE
REM  de E:\COPIAS (clientes + vehiculos + prestamos).
REM  Idempotente: se puede correr cada dia; no duplica datos.
REM
REM  Doble clic para correr, o programar en el Programador de
REM  tareas de Windows (Task Scheduler).
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  Migrando desde el respaldo mas reciente de E:\COPIAS ...
echo.

node "migrar-todo.mjs" --commit

echo.
if %ERRORLEVEL% NEQ 0 (
  echo  *** Hubo un error. Revisa el mensaje de arriba. ***
) else (
  echo  *** Listo. Datos actualizados en el sistema nuevo. ***
)
echo.
pause

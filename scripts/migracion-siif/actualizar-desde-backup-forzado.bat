@echo off
REM ============================================================
REM  Igual que actualizar-desde-backup.bat pero con --force:
REM  re-genera las cuotas AUNQUE existan abonos aplicados en el
REM  sistema nuevo (los des-aplica y deja el libro identico al
REM  respaldo del dia).
REM
REM  USAR SOLO mientras SiiF siga siendo el libro oficial y todo
REM  pago se digite alla. Si un cobro existe SOLO en MotoFlow,
REM  correr esto lo des-aplica.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo  *** MODO FORZADO: los abonos hechos en el sistema nuevo ***
echo  *** se des-aplican y el libro queda igual al respaldo.  ***
echo.
choice /C SN /M "Seguro que quieres continuar"
if %ERRORLEVEL% NEQ 1 goto :fin

node "migrar-todo.mjs" --commit --force

echo.
if %ERRORLEVEL% NEQ 0 (
  echo  *** Hubo un error. Revisa el mensaje de arriba. ***
) else (
  echo  *** Listo. Datos actualizados en el sistema nuevo. ***
)
:fin
echo.
pause

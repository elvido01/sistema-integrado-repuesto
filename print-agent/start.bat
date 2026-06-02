@echo off
REM Arranque rápido del Motoflow Print Agent en desarrollo
REM Asegúrate de haber corrido `npm install` antes

title Motoflow Print Agent
cd /d "%~dp0"
node index.js
pause

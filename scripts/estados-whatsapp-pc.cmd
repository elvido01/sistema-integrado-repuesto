@echo off
rem Carpeta del Estado de WhatsApp: baja las promociones aprobadas a
rem C:\RepuestosMorla\Publicaciones\Pendientes y mueve a Publicados lo ya
rem publicado. Un acceso directo a este archivo en la carpeta Inicio de
rem Windows lo arranca al encender la PC. Ver scripts\estados-whatsapp-pc.mjs.
cd /d "%~dp0.."
if not exist "C:\RepuestosMorla\Publicaciones" mkdir "C:\RepuestosMorla\Publicaciones"
node scripts\estados-whatsapp-pc.mjs >> "C:\RepuestosMorla\Publicaciones\programa.log" 2>&1

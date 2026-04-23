#!/bin/bash
# ============================================================
# Backup automático de Supabase → VPS
# Ejecución: cron diario a las 2:00 AM
#
# Instalación en el VPS:
#   1. Copiar este archivo a /root/backups/supabase_backup.sh
#   2. chmod +x /root/backups/supabase_backup.sh
#   3. Editar las variables SUPABASE_DB_* abajo
#   4. Instalar pg_dump: apt install postgresql-client-16
#   5. Agregar al crontab:
#      crontab -e
#      0 2 * * * /root/backups/supabase_backup.sh >> /root/backups/backup.log 2>&1
# ============================================================

# ── CONFIGURACIÓN (editar con tus datos de Supabase) ──
SUPABASE_DB_HOST="db.zdvxowpuklbypweyqqki.supabase.co"
SUPABASE_DB_PORT="5432"
SUPABASE_DB_NAME="postgres"
SUPABASE_DB_USER="postgres"
SUPABASE_DB_PASS="TU_PASSWORD_AQUI"  # ← Cambiar por tu contraseña real

# ── RUTAS ──
BACKUP_DIR="/root/backups/daily"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M)
FILENAME="motoflow_backup_${DATE}.sql.gz"

# ── EJECUTAR ──
echo "================================================"
echo "[$(date)] Iniciando backup de Supabase..."
echo "================================================"

# Crear directorio si no existe
mkdir -p "$BACKUP_DIR"

# Exportar password para pg_dump
export PGPASSWORD="$SUPABASE_DB_PASS"

# Ejecutar pg_dump y comprimir
pg_dump \
  -h "$SUPABASE_DB_HOST" \
  -p "$SUPABASE_DB_PORT" \
  -U "$SUPABASE_DB_USER" \
  -d "$SUPABASE_DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  -F p \
  | gzip > "$BACKUP_DIR/$FILENAME"

# Verificar resultado
if [ $? -eq 0 ] && [ -s "$BACKUP_DIR/$FILENAME" ]; then
  SIZE=$(du -h "$BACKUP_DIR/$FILENAME" | cut -f1)
  echo "[$(date)] ✅ Backup exitoso: $FILENAME ($SIZE)"
else
  echo "[$(date)] ❌ ERROR: El backup falló"
  rm -f "$BACKUP_DIR/$FILENAME"  # Eliminar archivo vacío/corrupto
  exit 1
fi

# Limpiar backups antiguos (más de N días)
DELETED=$(find "$BACKUP_DIR" -name "motoflow_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] 🗑️ Eliminados $DELETED backups antiguos (>$RETENTION_DAYS días)"
fi

# Listar backups actuales
echo ""
echo "Backups disponibles:"
ls -lh "$BACKUP_DIR"/motoflow_backup_*.sql.gz 2>/dev/null
echo ""
echo "[$(date)] Backup completado."

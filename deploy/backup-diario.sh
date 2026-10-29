#!/usr/bin/env bash
# Backup diario de la base (salvatore-backup.timer, 03:00). Guarda los ultimos
# 14 en ~/deploy/backups/diarios; deploy-notify.ps1 copia el mas reciente a la PC.
set -euo pipefail
REPO="$HOME/Salvatore"
DIR="$HOME/deploy/backups/diarios"
KEEP=14

. "$REPO/deploy/db.sh"
cargar_db "$REPO"
mkdir -p "$DIR"
F="$DIR/$PGDATABASE-$(date +%Y%m%d-%H%M).dump"
/usr/pgsql-17/bin/pg_dump -Fc -f "$F.tmp"
mv "$F.tmp" "$F"
ls -1t "$DIR"/*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "backup: $F ($(du -h "$F" | cut -f1))"

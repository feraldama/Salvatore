#!/usr/bin/env bash
# Instalacion unica (idempotente) del deploy automatico en el servidor:
#   - servicios systemd de usuario: salvatore-api, salvatore-client,
#     salvatore-deploy.timer (deploy cada minuto) y salvatore-backup.timer (03:00)
#   - linger: los servicios arrancan con el equipo aunque nadie inicie sesion
#   - tabla schema_migrations; si esta vacia, marca como aplicadas las migraciones
#     que ya existen (se aplicaron a mano antes de automatizar).
# Uso: bash ~/Salvatore/deploy/install-server.sh
set -euo pipefail

REPO="$HOME/Salvatore"
UNIT_DIR="$HOME/.config/systemd/user"
PSQL="/usr/pgsql-17/bin/psql -X"
cd "$REPO"

loginctl enable-linger "$USER"
mkdir -p "$UNIT_DIR" "$HOME/deploy/logs" "$HOME/deploy/backups/migraciones" "$HOME/deploy/backups/diarios"
cp deploy/systemd/* "$UNIT_DIR/"
systemctl --user daemon-reload
systemctl --user enable salvatore-api salvatore-client
systemctl --user enable --now salvatore-deploy.timer salvatore-backup.timer

. deploy/db.sh
cargar_db "$REPO"

$PSQL -q -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   VARCHAR(200) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  commit     VARCHAR(40)
);
SQL
if [ "$($PSQL -At -c 'select count(*) from schema_migrations')" = 0 ]; then
  echo "Marcando como ya aplicadas las migraciones existentes:"
  for f in $(ls api/migrations | grep -E '^[0-9]{3}_.*\.sql$' | sort); do
    echo "  $f"
    $PSQL -q -v ON_ERROR_STOP=1 -c "insert into schema_migrations (filename, commit) values ('$f', 'baseline')"
  done
fi

echo ""
for s in salvatore-api salvatore-client salvatore-deploy.timer salvatore-backup.timer; do
  printf '%-26s %s\n' "$s" "$(systemctl --user is-active $s)"
done
echo "Si la API o el client siguen corriendo en una terminal, cerrarlos y ejecutar:"
echo "  systemctl --user start salvatore-api salvatore-client"

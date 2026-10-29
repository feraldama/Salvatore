#!/usr/bin/env bash
# Migraciones de api/migrations (NNN_nombre.sql) contra la base de api/.env,
# registradas en schema_migrations. Lo usan server-deploy.sh (servidor),
# traer-db.ps1 y el hook pre-push (Windows, via Git Bash).
#   migrar.sh --pendientes   lista las pendientes, sin aplicar nada
#   migrar.sh                aplica las pendientes en orden; corta en la primera que falla
# Salida: 0 ok | 1 fallo una migracion | 2 no se pudo leer schema_migrations
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"
. deploy/db.sh
cargar_db "$REPO"

if [ -z "${PSQL_BIN:-}" ]; then
  for p in /usr/pgsql-17/bin/psql "/d/Archivos de programa/PostgreSQL/18/bin/psql.exe" \
           "/c/Program Files/PostgreSQL/18/bin/psql.exe"; do
    [ -x "$p" ] && PSQL_BIN="$p" && break
  done
  PSQL_BIN=${PSQL_BIN:-psql}
fi
sql() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 "$@"; }

# tr: psql.exe de Windows termina las lineas con \r\n.
if ! APPLIED=$(sql -At -c "select filename from schema_migrations" 2>&1 | tr -d '\r'); then
  echo "no se pudo leer schema_migrations en la base '$PGDATABASE': $APPLIED" >&2
  exit 2
fi

PENDING=()
for f in $(ls api/migrations | grep -E '^[0-9]{3}_.*\.sql$' | sort); do
  echo "$APPLIED" | grep -qxF "$f" || PENDING+=("$f")
done

if [ "${1:-}" = "--pendientes" ]; then
  [ ${#PENDING[@]} -gt 0 ] && printf '%s\n' "${PENDING[@]}"
  exit 0
fi

COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo local)
for f in "${PENDING[@]}"; do
  echo "==> migracion $f"
  sql -f "api/migrations/$f" || { echo "fallo la migracion $f" >&2; exit 1; }
  sql -q -c "insert into schema_migrations (filename, commit) values ('$f', '$COMMIT')" \
    || { echo "$f se aplico pero no se pudo registrar en schema_migrations" >&2; exit 1; }
done
[ ${#PENDING[@]} -eq 0 ] && echo "Sin migraciones pendientes en '$PGDATABASE'."
exit 0

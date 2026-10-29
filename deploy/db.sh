# Conexion a la base leida de api/.env (variables PG* para psql/pg_dump).
# Sirve en el servidor y en Windows (Git Bash). Uso: . deploy/db.sh; cargar_db <repo>
# DB_OVERRIDE apunta a otra base del mismo servidor (traer-db.ps1 -Base).
cargar_db() {
  local envfile="$1/api/.env"
  dbenv() { grep -E "^$1=" "$envfile" | tail -1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^[\"'](.*)[\"']$/\1/"; }
  export PGHOST=$(dbenv DB_HOST) PGUSER=$(dbenv DB_USER) PGPASSWORD=$(dbenv DB_PASSWORD)
  export PGDATABASE=${DB_OVERRIDE:-$(dbenv DB_NAME)}
  export PGPORT=$(dbenv DB_PORT)
  export PGPORT=${PGPORT:-5432} PGCLIENTENCODING=UTF8
}

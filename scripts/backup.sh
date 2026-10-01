#!/bin/sh
# Backup diário do PostgreSQL com rotação. Roda no serviço `backup` do docker compose.
# Mantém os últimos BACKUP_KEEP_DAILY diários e BACKUP_KEEP_MONTHLY mensais em /backups.
set -eu

KEEP_DAILY="${BACKUP_KEEP_DAILY:-14}"
KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"

mkdir -p /backups/daily /backups/monthly

prune() {
  dir="$1"; keep="$2"
  ls -1t "$dir"/*.dump 2>/dev/null | tail -n "+$((keep + 1))" | while read -r f; do rm -f "$f"; done
}

while true; do
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  target="/backups/daily/${PGDATABASE}-${stamp}.dump"
  if pg_dump --format=custom --file="${target}.tmp" && mv "${target}.tmp" "$target"; then
    echo "backup: $target"
    month="$(date -u +%Y%m)"
    if ! ls /backups/monthly/"${PGDATABASE}-${month}"*.dump >/dev/null 2>&1; then
      cp "$target" "/backups/monthly/${PGDATABASE}-${month}.dump"
    fi
    prune /backups/daily "$KEEP_DAILY"
    prune /backups/monthly "$KEEP_MONTHLY"
  else
    rm -f "${target}.tmp"
    echo "backup: FALHOU em $stamp" >&2
  fi
  sleep "$INTERVAL_SECONDS"
done

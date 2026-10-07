#!/bin/sh
# Atualiza o Historico de precos (macOS / Linux): backup, versao nova, reinicio e conferencia.
# Seus dados ficam no volume do Docker e nao sao apagados.
set -u
cd "$(dirname "$0")"

APP_PORT=3000
if [ -f .env ]; then
  value=$(grep -E '^APP_PORT=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r')
  [ -n "$value" ] && APP_PORT=$value
fi

fail() { echo; echo "$1"; exit 1; }

echo "[1/5] Conferindo o Docker..."
docker info >/dev/null 2>&1 || fail "O Docker nao esta rodando. Inicie o Docker e rode este script de novo. Nada foi alterado."

echo "[2/5] Fazendo backup do banco antes de atualizar..."
if ! docker compose exec -T backup true >/dev/null 2>&1; then
  echo "      O sistema estava parado. Iniciando para poder fazer o backup..."
  docker compose up -d || fail "Nao foi possivel iniciar o sistema. Nada foi alterado."
  sleep 20
fi
docker compose exec -T backup sh -c 'pg_dump --format=custom --file=/backups/antes-de-atualizar-$(date +%Y%m%d-%H%M%S).dump' \
  || fail "Nao foi possivel fazer o backup. Por seguranca, a atualizacao foi cancelada e nada foi alterado."
echo "      Backup salvo na pasta backups."

echo "[3/5] Baixando a versao nova..."
before=$(git rev-parse HEAD)
git pull --ff-only || fail "Nao foi possivel baixar a versao nova (git pull). O sistema continua na versao anterior."
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  echo "[4/5] Ja estava na versao mais recente. Garantindo que esta tudo rodando..."
  docker compose up -d || fail "O Docker nao conseguiu iniciar o sistema."
else
  echo "[4/5] Reconstruindo e reiniciando. Isso leva alguns minutos..."
  docker compose up -d --build || fail "O Docker nao conseguiu iniciar a versao nova. Seus dados continuam no volume do Docker."
fi

echo "[5/5] Aguardando a aplicacao responder..."
i=0
version=""
while [ $i -lt 90 ]; do
  body=$(curl -fsS "http://localhost:$APP_PORT/api/health" 2>/dev/null || true)
  case "$body" in
    *'"status":"ok"'*)
      version=$(printf '%s' "$body" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')
      break ;;
  esac
  i=$((i + 1))
  sleep 2
done
[ -n "$version" ] || fail "A aplicacao nao respondeu em 3 minutos. Veja: docker compose ps e docker compose logs web"
echo "      Aplicacao no ar. Versao $version"

if [ "$before" != "$after" ] && ! git diff --quiet "$before" "$after" -- extension; then
  echo
  echo "ATENCAO: a extensao do navegador mudou nesta versao."
  echo "Abra chrome://extensions e clique em recarregar no cartao \"Historico de precos\"."
fi

echo
echo "Pronto: http://localhost:$APP_PORT"

#!/usr/bin/env bash
#
# Corre as migrações e os testes de RLS num Postgres descartável.
#
# É a alternativa a `supabase db reset` para quem não tem o Docker a correr:
# levanta um cluster temporário, aplica supabase/tests/00_stub_supabase.sql (os
# arreios mínimos do Supabase — papéis, auth.uid(), storage), aplica todas as
# migrações por ordem e executa a bateria de testes. No fim deita tudo fora.
#
# Uso: ./scripts/testar-rls.sh

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Preferimos o Postgres 17 do Homebrew; caindo para o que estiver no PATH.
for candidato in /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@17/bin; do
  if [[ -x "$candidato/initdb" ]]; then
    export PATH="$candidato:$PATH"
    break
  fi
done

if ! command -v initdb >/dev/null 2>&1; then
  echo "Não encontrei o initdb. Instala o Postgres (brew install postgresql@17)." >&2
  exit 1
fi

# Sem LC_ALL definido, o postmaster do macOS torna-se multithreaded no arranque
# e recusa-se a subir. A base fica em UTF8, só as mensagens é que são em C.
export LC_ALL=C
export PGCLIENTENCODING=UTF8

TMP="$(mktemp -d "${TMPDIR:-/tmp}/quadros-rls-XXXXXX")"
PGDATA="$TMP/dados"
export PGDATABASE="quadros_teste"

# Só TCP em localhost: o caminho de um socket unix tem um limite de 103 bytes e
# os diretórios temporários do macOS já lá vão a meio.
export PGHOST="127.0.0.1"
export PGPORT="$(
  python3 - <<'PY'
import socket
s = socket.socket()
s.bind(("127.0.0.1", 0))
print(s.getsockname()[1])
s.close()
PY
)"

limpar() {
  pg_ctl -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpar EXIT

echo "→ A criar cluster temporário em $TMP"
initdb -D "$PGDATA" --username=postgres --auth=trust --encoding=UTF8 --locale=C >/dev/null

echo "→ A arrancar o Postgres no porto $PGPORT"
pg_ctl -D "$PGDATA" \
       -o "-h 127.0.0.1 -p $PGPORT -k ''" \
       -l "$TMP/postgres.log" -w start >/dev/null || {
  cat "$TMP/postgres.log" >&2
  exit 1
}

export PGUSER=postgres
createdb "$PGDATABASE"

echo "→ Arreios do Supabase"
psql -v ON_ERROR_STOP=1 -q -f "$RAIZ/supabase/tests/00_stub_supabase.sql"

echo "→ Migrações"
for migracao in "$RAIZ"/supabase/migrations/*.sql; do
  echo "   $(basename "$migracao")"
  psql -v ON_ERROR_STOP=1 -q -f "$migracao"
done

echo "→ Testes"
# Correm todos na mesma base e por ordem: o 02 aproveita as contas do 01.
# O psql escreve para ficheiro para o código de saída não se perder num pipe.
for ficheiro in "$RAIZ"/supabase/tests/[0-9]*.sql; do
  case "$(basename "$ficheiro")" in
    00_*) continue ;;  # arreios, já aplicados
  esac

  if ! psql -v ON_ERROR_STOP=1 -q -f "$ficheiro" >>"$TMP/saida.txt" 2>&1; then
    cat "$TMP/saida.txt"
    echo
    echo "✗ Falhou em $(basename "$ficheiro")." >&2
    exit 1
  fi
done

sed -nE 's/^.*NOTICE:  //p; /^==/p' "$TMP/saida.txt"

echo
echo "✓ Migrações aplicadas e testes passados."

#!/bin/bash
# Doble clic en macOS para arrancar la oficina y abrirla en el navegador.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Falta Node.js. Instálalo desde https://nodejs.org (versión LTS) y vuelve a hacer doble clic."
  open "https://nodejs.org"
  read -n 1 -s -r -p "  Pulsa una tecla para cerrar…"
  exit 1
fi

if [ ! -f .env ] || ! grep -q '^ANTHROPIC_API_KEY=sk-ant-[A-Za-z0-9_-]\{20,\}' .env; then
  echo ""
  echo "  Pega tu API key de Anthropic (empieza por sk-ant-) y pulsa Enter."
  echo "  La consigues en https://console.anthropic.com/settings/keys"
  read -r -p "  > " KEY
  KEY="$(echo "$KEY" | tr -d '[:space:]')"
  if [[ "$KEY" != sk-ant-* ]]; then
    echo "  Esa clave no parece válida. Vuelve a intentarlo."
    read -n 1 -s -r -p "  Pulsa una tecla para cerrar…"
    exit 1
  fi
  [ -f .env ] || cp .env.example .env
  if grep -q '^ANTHROPIC_API_KEY=' .env; then
    sed -i '' "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$KEY|" .env
  else
    echo "ANTHROPIC_API_KEY=$KEY" >> .env
  fi
  echo "  Clave guardada en .env"
fi

PORT=$(grep -E '^PORT=' .env | cut -d= -f2)
PORT=${PORT:-8020}

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "  La oficina ya está encendida."
  open "http://127.0.0.1:$PORT"
  exit 0
fi

(sleep 1.5 && open "http://127.0.0.1:$PORT") &
echo "  Deja esta ventana abierta mientras uses la oficina. Para apagarla: Ctrl+C."
node server.js

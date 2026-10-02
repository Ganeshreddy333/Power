#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ROOT="${APP_ROOT}/backend"
FRONTEND_ROOT="${APP_ROOT}/frontend"

if [ -f "${HOME}/.nvm/nvm.sh" ]; then
  . "${HOME}/.nvm/nvm.sh"
  nvm use --lts >/dev/null 2>&1 || true
fi

export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.nvm/versions/node/*/bin:${PATH}"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js/npm not available in this shell. Load nvm or install Node.js LTS first."
  exit 1
fi

cd "${BACKEND_ROOT}"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build
npm run migrate:deploy
npm run seed:admin || true

cd "${FRONTEND_ROOT}"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build

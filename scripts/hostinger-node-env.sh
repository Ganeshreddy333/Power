#!/usr/bin/env bash

# Loads Node.js and npm into the current Hostinger SSH session when they are installed
# via nvm, but not automatically available in the shell.

export NVM_DIR="${HOME}/.nvm"

if [ -s "${NVM_DIR}/nvm.sh" ]; then
  . "${NVM_DIR}/nvm.sh"
  . "${NVM_DIR}/bash_completion" 2>/dev/null || true

  if command -v nvm >/dev/null 2>&1; then
    nvm use --lts >/dev/null 2>&1 || true
  fi
fi

COMMON_NODE_PATHS=(
  "/usr/local/bin"
  "/usr/local/sbin"
  "/usr/bin"
  "/bin"
  "${HOME}/.nvm/versions/node"/*/bin
)

for path in "${COMMON_NODE_PATHS[@]}"; do
  if [ -d "$path" ] && [[ ":$PATH:" != *":$path:"* ]]; then
    export PATH="$path:$PATH"
  fi
done

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm were not found in this SSH session."
  echo "Install Node.js LTS in Hostinger or source your nvm profile first."
  echo "Typical fix:"
  echo "  export NVM_DIR=\"\$HOME/.nvm\""
  echo "  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\""
  echo "  nvm install --lts && nvm use --lts"
  return 1 2>/dev/null || exit 1
fi

node -v
npm -v

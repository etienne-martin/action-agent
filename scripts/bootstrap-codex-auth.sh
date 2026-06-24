#!/usr/bin/env bash
set -euo pipefail

CODEX_VERSION="0.136.0"
CODEX_HOME_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$CODEX_HOME_DIR"
}
trap cleanup EXIT

export CODEX_HOME="$CODEX_HOME_DIR"

cat > "$CODEX_HOME/config.toml" <<'EOF'
cli_auth_credentials_store = "file"
forced_login_method = "chatgpt"
EOF

echo "Using temporary CODEX_HOME: $CODEX_HOME"
echo "This does not touch ~/.codex/auth.json."
echo "Opening browser for Codex ChatGPT login."

npx --yes "@openai/codex@${CODEX_VERSION}" login

pbcopy < "$CODEX_HOME/auth.json"

echo "Copied Codex auth.json to clipboard."
echo "Paste it into the CODEX_AUTH_JSON GitHub Actions secret."
echo "Run this once per repo or org secret. Do not reuse this auth.json across repos or orgs."

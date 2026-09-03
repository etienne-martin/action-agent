#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$SCRIPT_DIR/setup-codex-auth-secret.sh"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/bootstrap-codex-auth.sh"
TEST_ROOT="$(mktemp -d)"
TEST_NUMBER=0
RUN_ROOT=""
MOCK_BIN=""
GH_LOG=""
NPX_LOG=""
SECRET_INPUT=""
TEMP_DIR=""
CLIPBOARD_LOG=""
CLIPBOARD_OUTPUT=""
OUTPUT=""

cleanup() {
  rm -rf -- "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  if [[ -n "$OUTPUT" && -f "$OUTPUT" ]]; then
    echo "Script output:" >&2
    sed 's/^/  /' "$OUTPUT" >&2
  fi
  exit 1
}

assert_contains() {
  local file="$1"
  local expected="$2"
  grep -Fq -- "$expected" "$file" || fail "Expected $file to contain: $expected"
}

assert_not_contains() {
  local file="$1"
  local unexpected="$2"
  if grep -Fq -- "$unexpected" "$file"; then
    fail "Expected $file not to contain: $unexpected"
  fi
}

setup_run() {
  TEST_NUMBER=$((TEST_NUMBER + 1))
  RUN_ROOT="$TEST_ROOT/$TEST_NUMBER"
  MOCK_BIN="$RUN_ROOT/bin"
  GH_LOG="$RUN_ROOT/gh.log"
  NPX_LOG="$RUN_ROOT/npx.log"
  SECRET_INPUT="$RUN_ROOT/secret-input"
  TEMP_DIR="$RUN_ROOT/tmp"
  CLIPBOARD_LOG="$RUN_ROOT/clipboard.log"
  CLIPBOARD_OUTPUT="$RUN_ROOT/clipboard-output"
  OUTPUT="$RUN_ROOT/output"
  mkdir -p "$MOCK_BIN" "$TEMP_DIR"
  : > "$GH_LOG"
  : > "$NPX_LOG"
  : > "$CLIPBOARD_LOG"

  cat > "$MOCK_BIN/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

{
  printf 'gh'
  for argument in "$@"; do
    printf '\t%s' "$argument"
  done
  printf '\n'
} >> "$TEST_GH_LOG"

if [[ "$1" == "api" && "$2" == "user" ]]; then
  [[ "${TEST_GH_AUTH_FAIL:-}" != "true" ]] || exit 1
  echo "alice"
  exit 0
fi

if [[ "$1" == "api" && "$2" == "--paginate" && "$3" == "user/memberships/orgs" ]]; then
  if [[ "${TEST_EMPTY_ORGS:-}" != "true" ]]; then
    echo "acme"
  fi
  exit 0
fi

if [[ "$1" == "org" && "$2" == "list" ]]; then
  echo "acme"
  exit 0
fi

if [[ "$1" == "repo" && "$2" == "list" ]]; then
  if [[ "${TEST_EMPTY_REPOS:-}" == "true" ]]; then
    exit 0
  fi
  case "$3" in
    alice) printf 'alice/alpha\nalice/zeta\n' ;;
    acme) printf 'acme/api\nacme/app\n' ;;
    *) exit 1 ;;
  esac
  exit 0
fi

if [[ "$1" == "secret" && "$2" == "list" ]]; then
  for argument in "$@"; do
    if [[ "$argument" == "--repo" ]]; then
      if [[ "${TEST_REPO_SECRET_EXISTS:-}" == "true" ]]; then
        echo "CODEX_AUTH_JSON"
      fi
      exit 0
    fi
    if [[ "$argument" == "--org" ]]; then
      if [[ -n "${TEST_ORG_VISIBILITY:-}" ]]; then
        echo "$TEST_ORG_VISIBILITY"
      fi
      exit 0
    fi
  done
fi

if [[ "$1" == "secret" && "$2" == "set" ]]; then
  cat > "$TEST_SECRET_INPUT"
  [[ "${TEST_GH_SET_FAIL:-}" != "true" ]] || exit 1
  exit 0
fi

echo "Unexpected gh command" >&2
exit 1
EOF

  cat > "$MOCK_BIN/npx" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$TEST_NPX_LOG"
grep -Fq 'cli_auth_credentials_store = "file"' "$CODEX_HOME/config.toml"
grep -Fq 'forced_login_method = "chatgpt"' "$CODEX_HOME/config.toml"
printf '%s' '{"test":"TEST_ONLY_AUTH"}' > "$CODEX_HOME/auth.json"
EOF

  cat > "$MOCK_BIN/pbcopy" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pbcopy called" >> "$TEST_CLIPBOARD_LOG"
if [[ "${TEST_ALLOW_CLIPBOARD:-}" == "true" ]]; then
  cat > "$TEST_CLIPBOARD_OUTPUT"
  exit 0
fi
exit 1
EOF

  cat > "$MOCK_BIN/pbpaste" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "pbpaste called" >> "$TEST_CLIPBOARD_LOG"
exit 1
EOF

  chmod +x "$MOCK_BIN/gh" "$MOCK_BIN/npx" "$MOCK_BIN/pbcopy" "$MOCK_BIN/pbpaste"

  export TEST_GH_LOG="$GH_LOG"
  export TEST_NPX_LOG="$NPX_LOG"
  export TEST_SECRET_INPUT="$SECRET_INPUT"
  export TEST_CLIPBOARD_LOG="$CLIPBOARD_LOG"
  export TEST_CLIPBOARD_OUTPUT="$CLIPBOARD_OUTPUT"
  export TEST_ALLOW_CLIPBOARD=""
  export TEST_GH_AUTH_FAIL=""
  export TEST_GH_SET_FAIL=""
  export TEST_EMPTY_ORGS=""
  export TEST_EMPTY_REPOS=""
  export TEST_REPO_SECRET_EXISTS=""
  export TEST_ORG_VISIBILITY=""
}

run_success() {
  local input="$1"

  if ! printf '%b' "$input" | TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script exited with an error."
  fi
}

run_failure() {
  local input="$1"

  if printf '%b' "$input" | TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script succeeded unexpectedly."
  fi
}

assert_secret_was_uploaded() {
  [[ -f "$SECRET_INPUT" ]] || fail "The GitHub secret input was not written."
  [[ "$(< "$SECRET_INPUT")" == '{"test":"TEST_ONLY_AUTH"}' ]] || fail "The GitHub secret input changed."
  assert_not_contains "$OUTPUT" "TEST_ONLY_AUTH"
  assert_not_contains "$GH_LOG" "TEST_ONLY_AUTH"
  assert_contains "$NPX_LOG" "--yes @openai/codex@0.145.0 login"
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The automatic flow used the clipboard."
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "A temporary auth file was not deleted."
  fi
}

test_personal_repository_secret() {
  setup_run
  export TEST_REPO_SECRET_EXISTS="true"
  run_success '1\n1\n1\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--repo\talice/alpha'
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value."
  assert_secret_was_uploaded
}

test_organization_repository_secret() {
  setup_run
  run_success '1\n2\n1\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--repo\tacme/api'
  assert_contains "$OUTPUT" "This creates CODEX_AUTH_JSON."
  assert_secret_was_uploaded
}

test_new_organization_secret() {
  setup_run
  run_success '2\n1\n1\n0\n\n3\nx\n999999999999999999999999999999999999\n1, 2,1\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tlist\t--app\tactions\t--repo\tacme/api'
  assert_contains "$GH_LOG" $'gh\tsecret\tlist\t--app\tactions\t--repo\tacme/app'
  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapi,app'
  assert_contains "$OUTPUT" "selected repositories: acme/api, acme/app"
  assert_contains "$OUTPUT" "Choose one or more listed numbers separated by commas, or q."
  assert_secret_was_uploaded
}

test_existing_selected_organization_secret() {
  setup_run
  export TEST_ORG_VISIBILITY="selected"
  run_success '2\n1\n1\n2\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tselected\t--repos\tapp'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: selected."
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value and organization access configuration."
  assert_secret_was_uploaded
}

test_private_organization_secret_skips_repository_selection() {
  setup_run
  run_success '2\n1\n2\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tprivate'
  assert_not_contains "$GH_LOG" $'gh\trepo\tlist\tacme'
  assert_not_contains "$GH_LOG" $'--repos'
  assert_contains "$OUTPUT" "organization acme (private repositories)"
  assert_secret_was_uploaded
}

test_existing_organization_secret_changes_visibility() {
  setup_run
  export TEST_ORG_VISIBILITY="private"
  export TEST_EMPTY_REPOS="true"
  run_success '2\n1\n3\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tall'
  assert_not_contains "$GH_LOG" $'gh\trepo\tlist\tacme'
  assert_not_contains "$GH_LOG" $'--repos'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: private."
  assert_contains "$OUTPUT" "organization acme (all repositories)"
  assert_contains "$OUTPUT" "This replaces the existing CODEX_AUTH_JSON value and organization access configuration."
  assert_secret_was_uploaded
}

test_existing_all_organization_secret_can_change_to_private() {
  setup_run
  export TEST_ORG_VISIBILITY="all"
  run_success '2\n1\n2\ny\n'

  assert_contains "$GH_LOG" $'gh\tsecret\tset\tCODEX_AUTH_JSON\t--app\tactions\t--org\tacme\t--visibility\tprivate'
  assert_not_contains "$GH_LOG" $'gh\trepo\tlist\tacme'
  assert_not_contains "$GH_LOG" $'--repos'
  assert_contains "$OUTPUT" "Current CODEX_AUTH_JSON visibility: all."
  assert_contains "$OUTPUT" "organization acme (private repositories)"
  assert_secret_was_uploaded
}

test_cancel_at_organization_visibility() {
  setup_run
  run_success '2\n1\nq\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after visibility cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_cancel_at_selected_repository_selection() {
  setup_run
  run_success '2\n1\n1\nq\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after repository selection cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_empty_selected_organization_repository_list() {
  setup_run
  export TEST_EMPTY_REPOS="true"
  run_failure '2\n1\n1\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran without an eligible organization repository."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "No repositories with admin access found for acme."
}

test_cancel_before_login() {
  setup_run
  run_success 'q\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_cancel_at_confirmation() {
  setup_run
  run_success '1\n1\n1\nn\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after cancellation."
  assert_not_contains "$GH_LOG" $'gh\tsecret\tset'
  assert_contains "$OUTPUT" "Cancelled."
}

test_rejects_shadowed_organization_secret() {
  setup_run
  export TEST_REPO_SECRET_EXISTS="true"
  run_failure '2\n1\n1\n1\n'

  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran for a shadowed organization secret."
  assert_contains "$OUTPUT" "Remove that repository secret before using the organization secret there."
}

test_empty_repository_list() {
  setup_run
  export TEST_EMPTY_REPOS="true"
  run_failure '1\n1\n'

  assert_contains "$OUTPUT" "No repositories with admin access found for alice."
  assert_not_contains "$OUTPUT" "unbound variable"
}

test_empty_organization_list() {
  setup_run
  export TEST_EMPTY_ORGS="true"
  run_failure '2\n'

  assert_contains "$OUTPUT" "No organizations with owner access found."
  assert_not_contains "$OUTPUT" "unbound variable"
}

test_failed_github_auth() {
  setup_run
  export TEST_GH_AUTH_FAIL="true"

  if printf '' | TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Script succeeded after GitHub authentication failed."
  fi
  [[ ! -s "$NPX_LOG" ]] || fail "Codex login ran after GitHub authentication failed."
  assert_contains "$OUTPUT" "Run 'gh auth login', then rerun."
}

test_failed_secret_upload_cleans_auth_file() {
  setup_run
  export TEST_GH_SET_FAIL="true"
  run_failure '1\n1\n1\ny\n'

  [[ -f "$SECRET_INPUT" ]] || fail "The failed upload did not receive the auth file."
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The failed upload left a temporary auth file."
  fi
  [[ ! -s "$CLIPBOARD_LOG" ]] || fail "The failed automatic flow used the clipboard."
}

test_manual_clipboard_bootstrap() {
  setup_run
  export TEST_ALLOW_CLIPBOARD="true"

  if ! TMPDIR="$TEMP_DIR" PATH="$MOCK_BIN:$PATH" "$BOOTSTRAP_SCRIPT" > "$OUTPUT" 2>&1; then
    fail "Manual clipboard bootstrap exited with an error."
  fi
  [[ "$(< "$CLIPBOARD_OUTPUT")" == '{"test":"TEST_ONLY_AUTH"}' ]] || fail "Clipboard output changed."
  assert_contains "$CLIPBOARD_LOG" "pbcopy called"
  assert_not_contains "$OUTPUT" "TEST_ONLY_AUTH"
  if [[ -n "$(find "$TEMP_DIR" -mindepth 1 -print -quit)" ]]; then
    fail "The manual bootstrap left a temporary auth file."
  fi
}

test_personal_repository_secret
test_organization_repository_secret
test_new_organization_secret
test_existing_selected_organization_secret
test_private_organization_secret_skips_repository_selection
test_existing_organization_secret_changes_visibility
test_existing_all_organization_secret_can_change_to_private
test_cancel_at_organization_visibility
test_cancel_at_selected_repository_selection
test_empty_selected_organization_repository_list
test_cancel_before_login
test_cancel_at_confirmation
test_rejects_shadowed_organization_secret
test_empty_repository_list
test_empty_organization_list
test_failed_github_auth
test_failed_secret_upload_cleans_auth_file
test_manual_clipboard_bootstrap

echo "setup-codex-auth-secret tests passed ($TEST_NUMBER)"

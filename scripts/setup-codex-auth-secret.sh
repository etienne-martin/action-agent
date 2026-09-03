#!/usr/bin/env bash
set -euo pipefail
set +x
umask 077

SECRET_NAME="CODEX_AUTH_JSON"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOOTSTRAP_SCRIPT="$SCRIPT_DIR/bootstrap-codex-auth.sh"
AUTH_DIR=""
SELECTED=""
SELECTED_VALUES=()
TARGET_LABEL=""
REPLACES_EXISTING="false"
SECRET_ARGS=()

die() {
  echo "Error: $*" >&2
  exit 1
}

cleanup() {
  if [[ -n "$AUTH_DIR" && -d "$AUTH_DIR" ]]; then
    rm -rf -- "$AUTH_DIR"
  fi
}
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

choose() {
  local prompt="$1"
  shift
  local options=("$@")
  local choice

  [[ "${#options[@]}" -gt 0 ]] || die "No choices are available."

  echo >&2
  echo "$prompt" >&2
  PS3="> "
  select choice in "${options[@]}"; do
    case "$REPLY" in
      q|Q)
        echo "Cancelled." >&2
        exit 0
        ;;
    esac

    if [[ -n "$choice" ]]; then
      SELECTED="$choice"
      return
    fi
    echo "Choose a listed number or q." >&2
  done

  die "Input closed."
}

choose_multiple() {
  local prompt="$1"
  shift
  local options=("$@")
  local choices=()
  local input
  local choice
  local index
  local maximum
  local selected
  local duplicate
  local valid
  local i

  [[ "${#options[@]}" -gt 0 ]] || die "No choices are available."
  maximum="${#options[@]}"

  while true; do
    echo >&2
    echo "$prompt" >&2
    for ((i = 0; i < ${#options[@]}; i++)); do
      printf '%d) %s\n' "$((i + 1))" "${options[$i]}" >&2
    done
    printf '> ' >&2
    IFS= read -r input || die "Input closed."

    case "$input" in
      q|Q)
        echo "Cancelled." >&2
        exit 0
        ;;
    esac

    SELECTED_VALUES=()
    valid="true"
    choices=()
    IFS=',' read -r -a choices <<< "$input"
    if [[ "${#choices[@]}" -gt 0 ]]; then
      for choice in "${choices[@]}"; do
        choice="${choice#"${choice%%[![:space:]]*}"}"
        choice="${choice%"${choice##*[![:space:]]}"}"
        if [[ ! "$choice" =~ ^[1-9][0-9]*$ ]] || \
          ((${#choice} > ${#maximum})) || ((choice > maximum)); then
          valid="false"
          break
        fi

        index=$((choice - 1))
        duplicate="false"
        if [[ "${#SELECTED_VALUES[@]}" -gt 0 ]]; then
          for selected in "${SELECTED_VALUES[@]}"; do
            if [[ "$selected" == "${options[$index]}" ]]; then
              duplicate="true"
              break
            fi
          done
        fi
        if [[ "$duplicate" == "false" ]]; then
          SELECTED_VALUES+=("${options[$index]}")
        fi
      done
    fi

    if [[ "$valid" == "true" && "${#SELECTED_VALUES[@]}" -gt 0 ]]; then
      return
    fi
    echo "Choose one or more listed numbers separated by commas, or q." >&2
  done
}

secret_exists() {
  local output

  if ! output="$(gh secret list --app actions "$@" --json name \
    --jq ".[] | select(.name == \"${SECRET_NAME}\") | .name")"; then
    die "Could not inspect GitHub Actions secrets. Reauthenticate with gh, then rerun."
  fi

  [[ -n "$output" ]]
}

select_repository_target() {
  local viewer="$1"
  local organizations_output
  local repositories_output
  local organization
  local repository
  local owners=("$viewer")
  local repositories=()

  if ! organizations_output="$(gh org list --limit 1000)"; then
    die "Could not list your GitHub organizations. Reauthenticate with gh, then rerun."
  fi

  while IFS= read -r organization; do
    [[ -n "$organization" ]] && owners+=("$organization")
  done <<< "$organizations_output"

  choose "Choose the repository owner ($viewer is your personal account)." "${owners[@]}"

  if ! repositories_output="$(gh repo list "$SELECTED" --limit 1000 --no-archived \
    --json nameWithOwner,viewerPermission \
    --jq 'map(select(.viewerPermission == "ADMIN")) | sort_by(.nameWithOwner)[] | .nameWithOwner')"; then
    die "Could not list repositories for $SELECTED. Reauthenticate with gh, then rerun."
  fi

  while IFS= read -r repository; do
    [[ -n "$repository" ]] && repositories+=("$repository")
  done <<< "$repositories_output"

  [[ "${#repositories[@]}" -gt 0 ]] || die "No repositories with admin access found for $SELECTED."
  choose "Choose a repository where you have admin access." "${repositories[@]}"
  repository="$SELECTED"

  if secret_exists --repo "$repository"; then
    REPLACES_EXISTING="true"
  fi
  TARGET_LABEL="repository $repository"
  SECRET_ARGS=(--repo "$repository")
}

select_organization_target() {
  local organizations_output
  local existing_visibility
  local repositories_output
  local organization
  local repository
  local visibility
  local selected_repositories=""
  local selected_labels=""
  local organizations=()
  local repositories=()

  if ! organizations_output="$(gh api --paginate user/memberships/orgs \
    --jq '.[] | select(.state == "active" and .role == "admin") | .organization.login')"; then
    die "Could not list organizations you administer. Run 'gh auth refresh --scopes admin:org', then rerun."
  fi

  while IFS= read -r organization; do
    [[ -n "$organization" ]] && organizations+=("$organization")
  done <<< "$organizations_output"

  [[ "${#organizations[@]}" -gt 0 ]] || die "No organizations with owner access found."
  choose "Choose an organization where you are an owner." "${organizations[@]}"
  organization="$SELECTED"

  if ! existing_visibility="$(gh secret list --app actions --org "$organization" \
    --json name,visibility \
    --jq ".[] | select(.name == \"${SECRET_NAME}\") | .visibility")"; then
    die "Could not inspect Actions secrets for $organization. Run 'gh auth refresh --scopes admin:org', then rerun."
  fi

  if [[ -n "$existing_visibility" ]]; then
    case "$existing_visibility" in
      all|private|selected) ;;
      *) die "Unexpected visibility for the $organization organization secret: $existing_visibility" ;;
    esac
    REPLACES_EXISTING="true"
    echo "Current ${SECRET_NAME} visibility: $existing_visibility." >&2
  fi

  choose "Choose the organization secret visibility." \
    "Selected repositories (recommended)" \
    "Private repositories" \
    "All repositories"

  case "$SELECTED" in
    "Selected repositories (recommended)") visibility="selected" ;;
    "Private repositories") visibility="private" ;;
    "All repositories") visibility="all" ;;
  esac

  if [[ "$visibility" == "selected" ]]; then
    if ! repositories_output="$(gh repo list "$organization" --limit 1000 --no-archived \
      --json nameWithOwner,viewerPermission \
      --jq 'map(select(.viewerPermission == "ADMIN")) | sort_by(.nameWithOwner)[] | .nameWithOwner')"; then
      die "Could not list repositories for $organization. Reauthenticate with gh, then rerun."
    fi

    while IFS= read -r repository; do
      [[ -n "$repository" ]] && repositories+=("$repository")
    done <<< "$repositories_output"

    [[ "${#repositories[@]}" -gt 0 ]] || die "No repositories with admin access found for $organization."
    choose_multiple "Choose repositories that can use this organization secret (comma-separated numbers)." "${repositories[@]}"

    for repository in "${SELECTED_VALUES[@]}"; do
      if secret_exists --repo "$repository"; then
        die "$repository already has ${SECRET_NAME}. Remove that repository secret before using the organization secret there."
      fi
      if [[ -n "$selected_repositories" ]]; then
        selected_repositories="${selected_repositories},"
        selected_labels="${selected_labels}, "
      fi
      selected_repositories="${selected_repositories}${repository#*/}"
      selected_labels="${selected_labels}${repository}"
    done

    TARGET_LABEL="organization $organization (selected repositories: $selected_labels)"
    SECRET_ARGS=(--org "$organization" --visibility selected --repos "$selected_repositories")
  else
    TARGET_LABEL="organization $organization ($visibility repositories)"
    SECRET_ARGS=(--org "$organization" --visibility "$visibility")
  fi
}

main() {
  local viewer
  local confirmation

  require_command gh
  require_command npx
  [[ -x "$BOOTSTRAP_SCRIPT" ]] || die "Bootstrap script not found: $BOOTSTRAP_SCRIPT"

  if ! viewer="$(gh api user --jq '.login')"; then
    die "GitHub CLI authentication failed. Run 'gh auth login', then rerun."
  fi
  [[ -n "$viewer" ]] || die "GitHub CLI did not return an authenticated user."

  echo "Authenticated to GitHub as $viewer."
  choose "Where should ${SECRET_NAME} be stored?" \
    "Repository Actions secret" \
    "Organization Actions secret"

  if [[ "$SELECTED" == "Repository Actions secret" ]]; then
    select_repository_target "$viewer"
  else
    select_organization_target
  fi

  echo >&2
  echo "Target: $TARGET_LABEL" >&2
  if [[ "$REPLACES_EXISTING" == "true" ]]; then
    if [[ "${SECRET_ARGS[0]}" == "--org" ]]; then
      echo "This replaces the existing ${SECRET_NAME} value and organization access configuration." >&2
    else
      echo "This replaces the existing ${SECRET_NAME} value." >&2
    fi
  else
    echo "This creates ${SECRET_NAME}." >&2
  fi
  if [[ "${SECRET_ARGS[0]}" == "--org" ]]; then
    echo "A repository secret with the same name takes precedence over this organization secret." >&2
  fi
  printf 'Open the Codex login and continue? [y/N] ' >&2
  IFS= read -r confirmation || die "Input closed."
  case "$confirmation" in
    y|Y|yes|Yes|YES) ;;
    *)
      echo "Cancelled." >&2
      exit 0
      ;;
  esac

  AUTH_DIR="$(mktemp -d)"
  "$BOOTSTRAP_SCRIPT" --output "$AUTH_DIR/auth.json"
  gh secret set "$SECRET_NAME" --app actions "${SECRET_ARGS[@]}" < "$AUTH_DIR/auth.json"

  echo "Set ${SECRET_NAME} for $TARGET_LABEL."
  echo "This login is dedicated to that secret. Do not reuse it for another repo or org secret."
}

main "$@"

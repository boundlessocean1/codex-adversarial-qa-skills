#!/usr/bin/env bash
set -euo pipefail

REPO_URL=""
BRANCH="main"
INSTALL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO_URL="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --target|--registry|--skip-deps|--skip-browsers|--no-force)
      if [[ "$1" == "--target" || "$1" == "--registry" ]]; then
        INSTALL_ARGS+=("$1" "$2")
        shift 2
      else
        INSTALL_ARGS+=("$1")
        shift 1
      fi
      ;;
    *)
      INSTALL_ARGS+=("$1")
      shift 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ ! -f "$ROOT_DIR/package.json" || ! -d "$ROOT_DIR/skills" ]]; then
  if [[ -z "$REPO_URL" ]]; then
    echo "This installer is not running inside the repository. Pass --repo https://github.com/<user>/codex-adversarial-qa-skills.git" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$TMP_DIR/repo"
  ROOT_DIR="$TMP_DIR/repo"
fi

node "$ROOT_DIR/scripts/install.js" "${INSTALL_ARGS[@]}"

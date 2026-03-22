#!/usr/bin/env bash

set -euo pipefail

quiet=0
force=0

for arg in "$@"; do
  case "$arg" in
    --quiet)
      quiet=1
      ;;
    --force)
      force=1
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log() {
  if [[ "$quiet" -eq 0 ]]; then
    echo "$@"
  fi
}

repo_root=$(git rev-parse --show-toplevel)
current_worktree="$repo_root"
main_worktree=""
active_worktree=""

while IFS= read -r line; do
  case "$line" in
    worktree\ *)
      active_worktree="${line#worktree }"
      ;;
    branch\ refs/heads/main)
      main_worktree="$active_worktree"
      ;;
  esac
done < <(git worktree list --porcelain)

if [[ -z "$main_worktree" ]]; then
  log "No main worktree found. Skipping env sync."
  exit 0
fi

if [[ "$main_worktree" == "$current_worktree" ]]; then
  log "Current worktree is main. Nothing to sync."
  exit 0
fi

files=(
  "apps/web/.env.local"
)

synced=0

for relative_path in "${files[@]}"; do
  source_path="$main_worktree/$relative_path"
  target_path="$repo_root/$relative_path"

  if [[ ! -f "$source_path" ]]; then
    log "Source file missing, skipped: $relative_path"
    continue
  fi

  if [[ -f "$target_path" && "$force" -ne 1 ]]; then
    log "Target already exists, skipped: $relative_path"
    continue
  fi

  mkdir -p "$(dirname "$target_path")"
  cp "$source_path" "$target_path"
  synced=1
  log "Synced $relative_path from $main_worktree"
done

if [[ "$synced" -eq 0 ]]; then
  log "No env files were synced."
fi

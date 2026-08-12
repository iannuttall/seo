#!/usr/bin/env bash
set -euo pipefail

# Conductor workspace setup.
#
# Purpose: Link local web configuration from the root repo and install
# dependencies.
#
# Run: invoked by Conductor via .conductor/settings.toml

root_path="${CONDUCTOR_ROOT_PATH:-}"
if [[ -z "$root_path" ]]; then
  echo "CONDUCTOR_ROOT_PATH is not set. Are you running inside Conductor?" >&2
  exit 1
fi

link_if_present() {
  local src="$root_path/$1"
  local dest="$1"

  if [[ ! -e "$src" ]]; then
    return 0
  fi

  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "Skipping $dest: workspace already has a non-symlink file." >&2
    return 0
  fi

  mkdir -p "$(dirname "$dest")"
  ln -snf "$src" "$dest"
}

# Web env files from the root checkout.
link_if_present "apps/web/.dev.vars"
link_if_present "apps/web/.dev.vars.production"

pnpm install

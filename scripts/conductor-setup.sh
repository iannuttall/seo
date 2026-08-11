#!/usr/bin/env bash
set -euo pipefail

# Conductor workspace setup.
#
# Purpose: Make Conductor worktrees usable by symlinking non-git-tracked env
# files from the root repo, then installing and building as before.
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

# Web env files (deploy secrets + local vars). The web pre-commit secrets
# check requires .dev.vars.production to exist, so worktrees need these
# links before any apps/web commit.
link_if_present "apps/web/.dev.vars"
link_if_present "apps/web/.dev.vars.production"

# Fall back to creating from examples if no root files exist
if [[ ! -e "apps/web/.dev.vars" && -e "apps/web/.dev.vars.example" ]]; then
  cp apps/web/.dev.vars.example apps/web/.dev.vars
  echo "Created apps/web/.dev.vars from example (no root copy found)." >&2
fi

if [[ ! -e "apps/web/.dev.vars.production" && -e "apps/web/.dev.vars.production.example" ]]; then
  cp apps/web/.dev.vars.production.example apps/web/.dev.vars.production
  echo "Created apps/web/.dev.vars.production from example (no root copy found)." >&2
fi

pnpm install --frozen-lockfile
pnpm hooks:install
pnpm build

# Release the `seo` package

The repository publishes one unscoped package. Private `@seo/*` workspace packages are build boundaries only and must never appear as dependencies in the tarball.

## Install from npm

```bash
npm install --global seo
seo start
```

The package includes:

- the `seo` CLI
- the programmatic API from `seo`
- the MCP API from `seo/mcp`
- the local stdio MCP server through `seo mcp serve`
- the agent skills under `skills/`

## Release checklist

1. Inject the shared Google OAuth client during release, never into git.
2. Run the full gate set.
3. Inspect the dry-run tarball and verify it contains no `@seo/*` runtime imports.
4. Install the tarball in a clean temporary directory and smoke-test the CLI, library, and MCP exports.
5. Publish `seo` from the repository root.
6. Create a GitHub release with install and migration notes.

Commands:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm pack --dry-run
pnpm publish --dry-run --no-git-checks
```

## GitHub workflows

The repo includes:

- CI for build, typecheck, test, and lint.
- A manual release workflow that publishes only the root `seo` package.
- Dry-run publishing enabled by default.

## Platform binaries

Crawlie ships Rust platform binaries. This project is currently a Node CLI, so there is no platform binary to compile yet.

If the CLI later moves to a single-file binary, add platform packages then. For now, the right target is a clean npm global install.

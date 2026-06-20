# Release and packaging

The package name is not final yet. Until it is, releases should stay dry-run by default.

## Current install path

```bash
git clone <repo-url>
cd seo
pnpm install
pnpm build
node packages/cli/dist/index.js start
```

## Target install path

Once the npm name is chosen:

```bash
npm i -g <package-name>
seo start
```

The package should install both:

- the `seo` CLI
- the local MCP server, available through `seo mcp serve`

## Release checklist

1. Choose and verify the npm package name.
2. Decide whether packages publish under one package or a scope.
3. Inject the shared Google OAuth client during release, not in git.
4. Run the full gate set.
5. Publish a dry run first.
6. Publish to npm.
7. Create a GitHub release with install notes and migration notes.

Commands:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm publish -r --dry-run
```

## GitHub workflows

The repo includes:

- CI for build, typecheck, test, and lint.
- A manual release workflow with `dryRun` enabled by default.

Do not turn on automatic npm publishing until the package name and npm scope are settled.

## Platform binaries

Crawlie ships Rust platform binaries. This project is currently a Node CLI, so there is no platform binary to compile yet.

If the CLI later moves to a single-file binary, add platform packages then. For now, the right target is a clean npm global install.


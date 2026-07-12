# Release the `seo` package

The repository publishes one unscoped package. Private `@seo/*` workspace packages are build boundaries only and must never appear as dependencies in the tarball.

## Install from npm

```bash
npm i -g seo
seo start
```

The package includes:

- the `seo` CLI
- the programmatic API from `seo`
- the MCP API from `seo/mcp`
- the local stdio MCP server through `seo mcp serve`
- the `seo` agent skill under `skills/` and its evals under `evals/`

## Release checklist

1. Confirm GitHub private vulnerability reporting is enabled for the repository.
2. Inject the shared Google OAuth client during release, never into git.
3. Run the full gate set, dependency audit, and secret scan.
4. Inspect the dry-run tarball and verify it contains no `@seo/*` runtime imports.
5. Install the tarball in a clean temporary directory and smoke-test the CLI, library, and MCP exports.
6. Publish `seo` from the repository root.
7. Create a GitHub release with install and migration notes.

Commands:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm security:check
pnpm pack --dry-run
npm publish --dry-run
```

## GitHub workflows

The repo includes:

- CI for build, typecheck, test, and lint.
- A manual release workflow that publishes only the root `seo` package.
- Dry-run publishing enabled by default.
- npm trusted publishing through GitHub Actions. No long-lived npm token is
  used.

Configure the `seo` package on npm with this trusted publisher:

```txt
Provider: GitHub Actions
Owner: iannuttall
Repository: seo
Workflow: release.yml
Allowed action: npm publish
```

Leave the environment name empty unless the workflow is also updated to use a
matching GitHub environment. After trusted publishing works, set npm publishing
access to require two-factor authentication and disallow tokens. Revoke any old
automation token. Do not add an `NPM_TOKEN` to this repository.

The release job also needs the `SEO_GOOGLE_CLIENT_ID` and
`SEO_GOOGLE_CLIENT_SECRET` repository secrets. Those values are compiled into
the published desktop OAuth client configuration. They are unrelated to npm
authentication.

Enable private vulnerability reporting under the repository's Security
settings before launch. The public security policy sends sensitive reports to
GitHub's private advisory flow.

## Platform binaries

This project is currently a Node CLI, so there is no platform binary to compile
or sign.

If the CLI later moves to a single-file binary, add platform packages then. For now, the right target is a clean npm global install.

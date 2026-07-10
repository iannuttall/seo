# Security

## Report a vulnerability

Do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting flow:

```txt
https://github.com/iannuttall/seo/security/advisories/new
```

Include the affected command, package, or workflow, clear reproduction steps,
and the practical impact. Remove Google tokens, API keys, account identifiers,
analytics data, private URLs, and client data from every example.

Use [GitHub Issues](https://github.com/iannuttall/seo/issues) for ordinary
questions and non-sensitive bugs.

## Local data and credentials

`seo` is local-first. Project profiles, Google OAuth metadata, crawl reports,
and caches stay on the machine running the command. Access and refresh tokens
use the operating-system keychain when enabled; fallback token files and local
credential files use private file permissions.

Desktop OAuth client credentials are not confidential secrets. User tokens,
provider API keys, and analytics data are confidential and must never be
committed, pasted into issues, or included in fixtures.

Use `seo privacy` to inspect local storage and `seo reset --yes` to remove it.
Google grants can also be revoked at
<https://myaccount.google.com/connections>.

## Maintainer checks

Before a public release or a change to auth, storage, crawling, or provider
boundaries, run:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm security:check
pnpm pack --dry-run
```

The shared desktop OAuth client values are release build inputs. Store them as
GitHub Actions secrets so they are injected only into the release build.
Checked-in generated OAuth files must contain placeholders only.

`pnpm security:check` runs the dependency audit and gitleaks. On macOS the
helper installs gitleaks with Homebrew when it is missing. Other platforms must
install gitleaks first.

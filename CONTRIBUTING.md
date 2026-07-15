# Contributing

Questions, bugs, and proposals belong in
[GitHub Issues](https://github.com/iannuttall/seo/issues). Search existing
issues first and keep one problem per issue.

For suspected vulnerabilities, use the private process in
[SECURITY.md](SECURITY.md). Never post tokens, API keys, analytics data, private
URLs, or client data publicly.

## Before writing code

- Reproduce the problem with the smallest command or fixture you can.
- Say whether the evidence is observed, derived, partial, capped, or missing.
- For report changes, explain the technical SEO basis and the expected data
  contract.
- Keep human output calm and concise. Keep JSON deterministic and complete.

Large report or architecture changes should start with an issue. Small bug
fixes can go straight to a pull request.

## Local checks

Install dependencies and run the full gate from the repository root:

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

When command help changes, also run:

```sh
node dist/cli.js help
node dist/cli.js help all
node dist/cli.js start --help
node dist/cli.js report --help
```

Use `node dist/cli.js` for repository changes. A globally installed `seo`
command represents the published npm package and must not be linked back to the
working tree.

Keep pull requests focused. Add or update tests for behavior changes, avoid
unrelated formatting, and use conventional commit subjects.

## Report quality rules

- Preserve source rows and provenance needed to verify a conclusion.
- Do not turn missing, failed, partial, sampled, or capped evidence into an
  all-clear.
- Keep observations separate from heuristics and recommendations.
- Do not claim causation, traffic lift, indexing state, or an SEO defect unless
  the returned evidence supports it.
- Keep ordering and limits deterministic for agents and CI.

Contributions are licensed under Apache-2.0, as described in [LICENSE](LICENSE).
The separate [trademark and brand policy](TRADEMARKS.md) applies to project
names and artwork.

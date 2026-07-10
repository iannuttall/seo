---
name: okf-validate
description: Validate OKF paths, frontmatter, required files, concept links, and citation structure deterministically. Use before consuming or distributing a bundle, while checking factual quality separately.
---

# Validate an OKF bundle

Validation protects the file contract an agent depends on: required paths, unique files, root metadata, Markdown content, concept frontmatter, links, and citation sections. It does not browse cited sources or determine whether the knowledge is true, current, owned, complete, or safe.

## Run it

For MCP, call `seo_list_reports` with category `crawl` only if discovery is needed. Call `seo_describe_report` with `{ "id": "okf-validate" }`, then call `seo_run_report` with:

```json
{
  "id": "okf-validate",
  "params": {
    "files": [
      { "path": "index.md", "content": "---\nokf: \"0.1\"\ntype: \"index\"\n---\n# Example" },
      { "path": "log.md", "content": "# Log" },
      { "path": "concepts/index.md", "content": "# Concepts" },
      { "path": "inventory/pages.md", "content": "---\ntype: \"inventory\"\n---\n# Pages\n\n# Citations" },
      { "path": "graph/links.md", "content": "---\ntype: \"graph\"\n---\n# Links\n\n# Citations" },
      { "path": "caveats.md", "content": "---\ntype: \"caveats\"\n---\n# Caveats\n\n# Citations" }
    ]
  }
}
```

Check `isError`, then consume `structuredContent`.

The CLI uses the same strict schema. This minimal six-file bundle is structurally valid:

```sh
seo reports describe okf-validate --json
seo reports run okf-validate --params '{"files":[{"path":"index.md","content":"---\nokf: \"0.1\"\ntype: \"index\"\n---\n# Example"},{"path":"log.md","content":"# Log"},{"path":"concepts/index.md","content":"# Concepts"},{"path":"inventory/pages.md","content":"---\ntype: \"inventory\"\n---\n# Pages\n\n# Citations"},{"path":"graph/links.md","content":"---\ntype: \"graph\"\n---\n# Links\n\n# Citations"},{"path":"caveats.md","content":"---\ntype: \"caveats\"\n---\n# Caveats\n\n# Citations"}]}' --json
```

## Resolve findings

Read `validation.valid`, file and concept counts, then every issue's level, path, and message. Errors invalidate the supported contract and should be fixed file by file. Warnings identify weaker portability or provenance, such as missing citation sections, and still require review even when `valid` is true. Use `explanation.nextActions` as ordering guidance, not as evidence that automated edits are safe.

Preserve the original bundle while correcting a copy, rerun validation, and compare issue sets deterministically. After structural success, separately verify cited URLs, claims, dates, access restrictions, publisher intent, and the crawl snapshot recorded by the bundle. Never report `valid: true` as "fact checked."

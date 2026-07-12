# Evals

Evals are behaviour tests for the `seo` skill. Each one pairs a realistic user
request with a description of the correct agent behaviour and a list of
checkable assertions. They exist to catch the skill routing to the wrong report
id, building bad parameters, skipping the evidence checks, or breaking a report
truth rule such as calling capped data an all-clear or promising traffic from a
heuristic.

Each file targets one report id or one common job. A report eval checks that the
skill discovers, describes, and runs that report and reads its evidence
correctly. A job eval checks a router-level chain, such as a full site audit or
a fix queue, where the correct move spans several reports in order.

## File shape

One file per subject at `evals/<subject>.json`. The `subject` names the report
id or the job the eval targets. It matches the filename.

```json
{
  "subject": "quick-wins",
  "evals": [
    {
      "id": 1,
      "prompt": "Where can we get some easy SEO wins without new content?",
      "expected_output": "Prose describing what a correct agent does.",
      "assertions": [
        "Uses report id quick-wins for the opportunity queue",
        "Clarifies quick win names the review queue, not expected traffic"
      ],
      "files": []
    }
  ]
}
```

Every `id` is a unique integer. `prompt`, `expected_output`, and each
`assertions` entry are non-empty. Each assertion is one behaviour a judge can
check on its own. Vary the prompts across a vague human ask, a precise agent
ask, and an adversarial ask where the correct move is to refuse a claim or
surface partial data.

## Run them

`seo skills eval` runs these against a real agent on your machine and judges the
result, so you catch a routing or truth-rule regression before it ships. It
stays local: you bring your own agent, and nothing is sent to a hosted service.

List what is available, then run one subject, several, or all of them:

```sh
seo skills eval --list          # subjects with their eval counts
seo skills eval quick-wins      # one subject
seo skills eval quick-wins seo  # several subjects
seo skills eval                 # every subject
seo skills eval quick-wins --id 3
```

Each eval sends the `seo` router skill as context, then the eval prompt, to your
agent. The default agent is `claude -p`. Point `--agent` at any command that
reads a prompt and prints a reply. Put `{prompt}` in the command to receive the
prompt as an argument, or leave it out to receive the prompt on stdin:

```sh
seo skills eval quick-wins --agent "claude -p"
seo skills eval quick-wins --agent "my-agent --input {prompt}"
```

The prompt is always passed as a single argument, never through a shell, so a
prompt cannot inject extra commands. Use `--no-skill` to send the eval prompt
without the router skill, and `--timeout <seconds>` (default 300) to bound each
call. Run up to four evals at once with `--concurrency <n>`.

The agent must be allowed to execute the `seo` CLI or MCP tools, or every
behavioural assertion will fail for the honest reason that the agent never ran
anything. A sandboxed `claude -p` cannot approve permission prompts, so grant
the permission up front, for example with a permission mode or allowlist that
covers `seo` commands. Judged failures always carry the judge's reason, so a
sandbox problem is visible in the output rather than silent.

Write assertions about outcomes, not narration. An agent that used a field
rarely names it, so "presents the diagnosis from the check results" is
judgeable where "reads generatedAt last" is not. Accept both surfaces in
assertions: the MCP tools and the `seo reports` CLI flow are equivalent, and
an agent without MCP configured will correctly use the CLI.

### Judging

By default the same agent judges each reply against the assertions and returns a
pass or fail with a short reason. Judge with a different model using
`--judge-agent "<command>"`. These verdicts are model judgments, not ground
truth, so the output labels them as judge verdicts and keeps every reason
visible for you to check.

Use `--no-judge` to skip judging. That prints each reply next to an assertion
checklist so you can score the run by hand.

### CI usage

The command exits `0` when every assertion passes and `1` when any assertion
fails or an eval errors, so it drops straight into a pipeline. Add `--json` for
one structured document with per-assertion verdicts, reasons, durations, and the
agent and judge commands used. JSON mode never prompts and never decorates its
output.

```sh
seo skills eval --agent "claude -p" --json > eval-results.json
```

## Validation

`node scripts/validate-skills.mjs` checks the structure of every `evals/*.json`.
It confirms the JSON parses, `subject` matches the filename, ids are unique
integers, the prompt, expected output, and assertions are non-empty, and every
backtick-quoted `seo` command and every referenced report id resolves to a real
command and report. It does not run the evals or judge agent output.

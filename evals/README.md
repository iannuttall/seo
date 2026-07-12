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

## Running an eval

Load the `seo` skill in an agent and feed it one prompt at a time. For example,
use `claude -p` with the skill available, send the `prompt`, then judge the
reply against each assertion. Score an eval as a pass only when every assertion
holds.

## Validation

`node scripts/validate-skills.mjs` checks the structure of every `evals/*.json`.
It confirms the JSON parses, `subject` matches the filename, ids are unique
integers, the prompt, expected output, and assertions are non-empty, and every
backtick-quoted `seo` command and every referenced report id resolves to a real
command and report. It does not run the evals or judge agent output.

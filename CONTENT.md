# Content

This file is the writing contract for SEO Skill. Use it for the website,
documentation, report pages, command help, onboarding, README copy, metadata,
and any other words a user will read.

The order of priority is simple:

1. Tell the truth.
2. Help the user understand what to do.
3. Make the page useful.
4. Give the writing some personality.
5. Make the page easy to find in search.

SEO never outranks clarity. Personality never outranks accuracy.

## Write for the user

Start with the question that brought someone to the page. Give them the answer,
the next action, or the command they need before explaining the machinery behind
it.

Users should not have to translate product architecture into a benefit. They do
not need a tour of the CLI, MCP server, library, registry, schema, and skill on
every page. Tell them which part matters for the job in front of them.

Good content answers these questions:

- What can I do here?
- What do I need before I start?
- What should I run or click?
- What will I get back?
- What can the result prove?
- What should I do next?

If a paragraph does not help answer one of those questions, it probably does not
belong on the page.

## Name things consistently

- **SEO Skill** is the product name when the prose needs one.
- **`seo`** is the command and npm package.
- **CLI**, **MCP server**, **skill**, and **TypeScript library** are product
  surfaces. They are not separate brands.
- Speak of the skill in the singular.
- **Report** is the product and catalog term. A report is the saved or returned
  artifact.
- **Audit** describes work that is genuinely an audit. Do not rename analysis,
  monitoring, measurement, or export tools as audits just to make the language
  consistent.

Use the exact term a user will see in the interface or command. Do not switch
between report, tool, check, command, and audit in the same section unless the
distinction helps them.

## Use a clear, direct voice

Write in plain English. Prefer the word someone would use while explaining the
problem to a colleague.

- Say "use" instead of "leverage".
- Say "start" instead of "commence".
- Say "missing data" instead of "data unavailability".
- Say "the crawl stopped at 500 pages" instead of "the crawl was subject to a
  configured page constraint".

Keep one main idea in each sentence. Most paragraphs should be two to four
sentences. A short sentence can land the point. A longer sentence can explain a
real condition or tradeoff. Vary the rhythm so the page does not sound like a
list of generated statements.

Be verbose when it removes doubt. Be short when the next step is obvious.

## Add personality without performing it

The writing should sound like a person who has used the product and has an
opinion about what matters.

Use an occasional aside in brackets when it helps:

> Setup can add the skill for you (and if you chose no, you can add it later).

Use casual language when it is the clearest language:

> A stale crawl is not much use after a large release.

State a real opinion when it helps someone decide:

> Start with the site crawl. Running five narrow reports against an unknown
> technical baseline creates more noise than answers.

One or two human moments on a short page is enough. Do not bolt jokes onto every
section. Phrases such as "without the hype" are not personality when the rest of
the title still reads like marketing copy.

## Lead with the benefit, then explain the feature

Features matter after the reader knows why they should care.

Weak:

> One skill routes all 52 reports.

Better:

> Ask your agent what is hurting search performance and get an answer based on
> your crawl, Search Console, Google Analytics, and clearly labelled research
> provider data.

Weak:

> Every surface uses the same report definition and returns the same evidence.

Better:

> Run the report from your terminal or ask your agent to run it. The result is
> the same, so you can inspect the evidence before anything gets changed.

Do not turn benefit-led writing into vague promises. Name the actual data,
result, or action. Never promise rankings, traffic, citations, or revenue.

## Keep titles short and literal

An H1 names the page. The description underneath explains why the page matters.
Do not force both jobs into the heading.

Good:

- SEO reports for audits and analysis
- AI search visibility and readiness
- Install the SEO skill for agents
- Technical SEO crawler
- Technical SEO site crawl audit

Bad:

- Find the SEO report that gets you to the next fix
- Generative engine optimization and llms.txt without the hype
- Technical SEO site crawl audit: checks, results and setup

Use sentence case. Lead with the phrase a user would search for or recognise in
the product. Avoid colons, slogans, claims, and filler after the main topic. The
site appends `| SEO Skill` to page titles where needed, so do not repeat the
brand in every H1.

This project's short, direct title rule takes priority over padding a title to a
generic character target.

H2 and H3 headings should tell the reader what is in the section. A reader who
scans only the headings should still understand the page.

Good:

- Add the skill for your agent
- Run the site crawl audit
- Check coverage before trusting the issue count
- Use the saved crawl in another report

Avoid headings such as "Overview", "Command facts", "Everything you need to
know", or "Get to the first useful answer faster". They label the section or
sell an outcome without saying what is inside it.

## Write instructions as a real sequence

Do not assume the user knows what happened in an earlier setup screen. State
the condition, the action, and what happens next.

Good:

> During `seo start` you can choose to add the skill to your supported agents.
> If you chose no during setup, or need to reinstall it later, run:
>
> ```sh
> seo skill install
> ```

For onboarding pages, prefer this order:

1. Install the package with `npm i -g seo`.
2. Run `seo start`.
3. Explain the choices setup presents.
4. Run the first useful report.
5. Explain how to read it and what to do next.

Introduce a command before the code block. Do not leave a heading and a command
floating together with no explanation. Avoid repeating that every report works
through the CLI, MCP server, and library. Explain alternate surfaces once, in a
section where the choice is useful.

## Make report pages useful on their own

Every report page should feel written for that report. Shared structure is
fine. Repeated generic copy is not.

Shared templates do not excuse shared filler. Every introduction must name the
report's actual evidence, result, limitation, or next decision. If the same
paragraph could be pasted onto twenty report pages unchanged, remove it or make
it conditional. "Keep the next step tied to the evidence" is true, but it does
not tell someone what to do with a crawl, index check, referral report, or
redirect trace.

A useful report page covers:

1. What question the report answers.
2. When to use it.
3. What data or setup it needs.
4. The shortest normal way to run it.
5. What comes back.
6. How to read the important fields.
7. What the evidence cannot prove.
8. Which report to use for a nearby but different job.
9. How an agent or application can run it when that is useful.

Use conditional content for different report families. A crawl audit, Search
Console analysis, Google Analytics measurement report, keyword or competitor
research report, export tool, and monitoring command should not have identical
introductions or fact tables.

Mention scheduled agent tasks only when repeat runs make the report more
useful. Name a sensible cadence or trigger, say what the agent should report,
and explain which scope, filters, or date windows must stay comparable. Do not
paste a generic "run this regularly" line onto every report.

The limits section needs room to explain the boundary properly. Use at least
two short paragraphs. The first states what the report cannot establish from
its evidence. The second explains how to interpret or verify that specific
result. Do not leave a single caveat sentence floating in a large card.

Show parallel facts in a table or structured card. Use prose for explanation,
limits, and decisions. Code examples must be complete, copyable, and able to
wrap or scroll without appearing cut off.

## Explain evidence like a careful human

SEO findings are useful only when the reader knows what was observed and where
the limits are.

- Separate the evidence from the interpretation.
- Say when data is missing, partial, capped, sampled, filtered, or stale.
- Do not turn a missing row into zero.
- Do not call a correlation a cause.
- Do not treat a heuristic as a search engine rule.
- Do not describe an intentional `noindex`, canonical, robots rule, or snippet
  limit as an error before intent is known.
- Give a way to verify the change.

Prefer:

> Search Console returned no retained rows for this query in the selected date
> range.

Avoid:

> This query gets no traffic.

The first sentence describes the evidence. The second claims more than the data
can prove.

## Use SEO without writing for a robot

Each page should have one clear search intent and one clear job.

- Put the main topic in the title, H1, opening paragraph, and URL when it fits
  naturally.
- Write a specific meta description that explains what the page contains.
- Use descriptive internal links that name the destination.
- Link to primary sources for search engine rules, standards, and third-party
  product claims.
- Keep one H1 and a logical heading hierarchy.
- Add structured data only when it matches the visible page.
- Do not add filler to hit a word count.
- Do not repeat a keyword where a pronoun or plain phrase reads better.

Programmatic report pages need unique, useful content. A generated title and
the same seven paragraphs with a different report id is not a content strategy.
Use report metadata and conditional sections to explain the actual input,
output, limits, and decisions for each report family.

The title tag can be direct. The description and page body carry the supporting
terms. Do not add a colon and a pile of keyword variants just to make the title
longer.

## Link like the words belong together

Link the phrase that describes the destination.

Good:

> The [Google connection guide](/docs/google) explains the permissions before
> you sign in.

Avoid:

> Click [here](/docs/google) to learn more.

Do not use bare internal paths as link text. External links should point to
primary sources and open in a new tab with `rel="noreferrer"`.

## Patterns to remove

Cut these during every edit:

- Em dashes and en dashes.
- "It is important to note" and "It is worth noting".
- "The honest answer" and "The truth is".
- "In today's landscape" and similar scene-setting filler.
- "It is not about X, it is about Y" constructions.
- "Unlock", "leverage", "seamless", "robust", and "holistic" when a plain
  word works.
- "Source of truth" when the sentence can name the actual file, field, or
  result.
- "Without the hype" and similar claims that tell the reader about the tone
  instead of proving it.
- "Gets you to the next fix", "everything you need", and other vague outcome
  language.
- Three sentences or bullets with the same shape.
- Repeated explanations of product architecture.
- Long titles that contain the heading, description, and sales pitch at once.

The repository rejects dash punctuation in user-facing copy. Use a full stop,
comma, brackets, or rewrite the sentence.

## Review every page before shipping

Read the page once as a user who has not seen the product before.

- Is the title the shortest accurate name for the page?
- Does the opening explain what the user can do?
- Is the next action obvious?
- Are setup requirements stated before the command?
- Does every section add information?
- Are benefits tied to real data or actions?
- Are the limits clear without sounding defensive?
- Does the page contain at least one human sentence or aside?
- Can a reader scan only the headings and follow the page?
- Are links descriptive?
- Are commands complete and copyable?
- Does the page avoid claims the evidence cannot support?
- Did you remove dash punctuation and generated-sounding filler?

If the page is accurate but boring, add a concrete example, a useful opinion,
or one natural aside. If it is lively but unclear, remove the personality until
the instructions make sense on the first read.

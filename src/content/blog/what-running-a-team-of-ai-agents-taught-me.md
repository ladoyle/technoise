---
title: "What running a team of AI agents taught me"
description: "Everyone says AI will replace engineers. I built two agent systems to see where it fits, and learned about context, scripts and who takes the blame."
pubDate: 2026-11-07
tags: [ai-agents, claude-code, security]
draft: false
---

**The short version.** AI agents are not a replacement for engineers or for deterministic software. They are a force multiplier for a human who gives them narrow roles, small context, real tools, and a person to answer to. It took me two projects, one blown usage limit and one security audit to learn that.

## The hype and the gap

Everyone seems convinced that AI will replace software engineers. Hardly anyone can say where it slots into a real software development lifecycle: who specifies, who reviews, who decides what ships, who gets blamed when it breaks. I wanted an answer from practice, not a keynote, so I built two agent systems: twelve agents for a budgeting app and five for this site.

## Borrowing the playbook

I'm an engineer, so I didn't start from nothing. I listened to other engineers, and the idea of a multi-agent system with specialised roles came from them. What I had to learn myself was how it behaves under real load.

## Roles sharpen focus

The core idea is splitting the work into roles. On the budgeting app that means an architecture agent, a security agent, a financial agent, a backend agent and so on, each with its own file, its own area of ownership and its own tools. The stages run in a fixed order: specify, review, revise, test first, implement, gate.

The site uses a lighter chain: designer, developer, QA, documenter, plus a gatekeeper that reviews a pull request only when I ask. An agent told what it owns, and what it doesn't, stops improvising in other people's territory.

## Then I ran out of context

One phase of the budgeting app took about twenty runs and exhausted my usage limit. A single run climbed to roughly 587,000 tokens and 72 tool calls, then died without leaving anything behind. Agents started cold and read open-ended piles of documents, two invented the same values in parallel, and resumed agents re-sent their whole transcripts.

That's when reporting became the backbone. Every run now ends with exactly one report: from, to, status, references, a list of docs to read, and a message. My first version capped reports at 250 characters and kept them out of git. After the incident I raised the cap to 500, committed them, and added the docs list so the next agent reads six things, not sixty. A run that hits about 80% of its budget commits and files a PARTIAL, which a fresh run picks up.

Checkpointing came next. Each phase keeps one small checkpoint file; to resume, an agent reads it, prints the report chain, and checks the latest commit matches. Agents are never resumed. Rework goes to a fresh run with the diff and one batched list of findings.

## Teach the agents to ask

Agents guess when they're not told otherwise, and guesses compound. So I gave them a QUESTION status. If a value is missing from the specs, the agent asks the owner and never invents it. This post began the same way. Each answer narrows the next step, so I end up directing instead of correcting. I came up with the pattern on my own, then found others had published it as the [grill-me skill](https://www.aihero.dev/skills-grill-me).

## Not everything needs AI

The other lesson was about what *not* to ask a model. Most of what software does has an algorithmic answer. If a rule has one right answer, a script should own it. Quality gates run through one command that logs everything and prints a short summary. Report validation and spec lookups are scripts. Money is integer minor units, calculated in one tested place, never re-derived by a prompt.

A skill is the bridge: it wraps a deterministic procedure so the agent calls it instead of improvising. That leaves the model the ambiguous work, like design trade-offs, review, and noticing two documents disagree.

## Auditing my own agents

Recently I had Claude audit both systems against the Agents Rule of Two, and I checked its findings against the agent files myself. A session is dangerous when it combines untrusted input, access to sensitive data or systems, and the ability to change state or communicate externally. Allow two at most.

Some of it held up: no budgeting agent can browse the web or post to GitHub, and my UX agent has no shell.

Some of it didn't. A shell can curl out and read environment variables, so Bash quietly switches on all three properties, and nearly every agent has it. My review agents are "read-only" in prose but still hold write tools, and a rule in a prompt is a request, not enforcement. Neither repo says outright that fetched text and PR comments are data, not instructions. These are known gaps, not fixed ones. Next steps: remove Bash or Write from review roles, isolate web access in a research stage, and add the data-not-instructions rule to both agent contracts.

## Who signs

No agent approves or merges. The gatekeeper can only comment, and big milestones stop for my approval. A machine can't be held accountable, so a human has to be. That human is whoever points the agent and presses merge.

## Lessons learned

- **Context:** treat it as a budget. Short reading lists, tool-call limits, one report per run, checkpoints, and fresh starts beat long conversations.
- **Security:** count the three properties for every agent, remember that a shell adds back what you removed, and enforce limits in tools rather than prose.
- **Accountability:** AI augments; it doesn't replace people or deterministic code.

**If you take one thing away:** don't ask whether AI can replace the engineer. Ask which parts of your workflow have one right answer (give those to scripts), which are ambiguous (give those to narrow, well-briefed agents that ask questions), and who signs for the result (always a person). Start small, and add structure only when something breaks.

## Links

- [The grill-me skill](https://www.aihero.dev/skills-grill-me): the ask-the-human-questions pattern, published as a skill.

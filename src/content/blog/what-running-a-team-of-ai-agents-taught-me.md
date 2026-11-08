---
title: "Lessons from running a team of AI agents"
description: "People are saying AI will replace engineers. I as an engineer have built a couple ai agent systems and products to find the truth and pitfalls in that statement. Here is my journey and some lessons along the way."
pubDate: 2026-11-08
tags: [ai-agents, claude-code, security]
draft: false
---

**The short version.** AI agents are not a replacement for engineers or for deterministic software. They are a force multiplier for a human who gives them narrow roles, small context, real tools, and a person to answer to. It took me two projects, one blown usage limit and a security audit to learn this.

## The hype and the gap

AI is a magical new tool to most people, and I hear a lot that AI will replace software engineers. However, hardly anyone can say where it slots into a real software development lifecycle: who specifies, who reviews, who decides what ships, who gets blamed when it breaks. Frankly getting something to work by yourself is not the same as engineering a product that millions of customers will use. I wanted a clearer answer from my own practice, not a keynote, so I built two agent systems: twelve agents for a budgeting app and five for this site.

## Borrowing the playbook

I'm an engineer, so I didn't start from nothing. I listened to others, and the idea of a multi-agent system with specialized roles grew up quickly from people that were using AI to build large PoCs (Proof-of-Concept). What I had to learn myself was how it behaves under real load.

## Roles sharpen focus

The core idea is splitting the work into roles. On the budgeting app, that means architecture, security, financial, backend and so on, each with its own file, area of ownership and tools. In the system I use now, the stages run in a fixed order: specify, review, revise, test first, implement, gate. Getting that order to hold in practice was part of the learning.

The idea is not new. It comes from how we break up work as projects become larger. One person did not build the Eiffel Tower or the Coliseum, but teams of people in specialized roles working together.

The site uses a lighter chain: designer, developer, QA, documenter, plus a gatekeeper that reviews a pull request when I ask. An agent told what it owns, and what it doesn't, is less likely to improvise on other people's territory.

## Then I ran out of context

For the budgeting app, I divided the large project into milestones or phases, each covering defined pieces of the system to design and implement. I would ask Claude to build a phase, and it would direct agents to architect, test, build, and finally review. Agents ran in parallel and handed reports to one another without committing them. The first couple of phases worked well enough, but implementation decisions soon left the growing documentation full of conflicts. Designers and implementers ran at the same time, reports disappeared when agents died, and new agents arrived to stacks of documents they struggled to understand.

The cost became impossible to ignore when one budgeting-app phase took about twenty runs and exhausted my usage limit. A single run reached roughly 587,000 tokens and 72 tool calls before dying without leaving anything behind. Work kept multiplying: fresh agents read open-ended piles of documents, two agents invented the same values in parallel, and resumed agents re-sent their entire transcripts.

My first fix was the hand-off. If specialized roles are the brain of the system, reporting is its nervous system. Every run now ends with exactly one report containing the sender, recipient, status message, and references, a list of documents for the next agent to read. Initially, I capped reports at 250 characters and kept them out of git. After the incident, I raised the cap to 500 characters, committed the reports, and added the reading list so the next agent reads six things, not sixty. When a run reaches about 80% of its budget, it commits its work and files a PARTIAL report for a fresh run to pick up.

Checkpointing came next: a way to resume the work without resuming the agent. Each phase keeps one small checkpoint file. A fresh agent reads it, prints the report chain, and checks that the latest commit matches. I no longer resume agents; rework goes to a fresh run with the diff and one batched list of findings.

Finally, I tightened the rules for parallel work after implementation agents wrote conflicting code where their tasks overlapped. Planning agents seem to work well in parallel, but agents that create production code must wait for the planners and be cautious about running alongside one another.

The contrast with TechNoise taught me that the amount of coordination must fit the project. My initial work on the website was small enough that a simple hand-off structure worked like a small team building a barn; it didn't need all the heavy reporting, checkpointing, agent rules, and documentation. At the budgeting app's scale, though, direct reporting and clear documentation became key to saving my context and resources.

## Teach the agents to ask

The context failure also exposed a different problem: two agents had invented the same values in parallel. Better hand-offs could keep work from getting lost, but they couldn't supply decisions the specs hadn't made.
AI is fundamentally a probability model. Given a set of inputs and trained data, it will follow a path of most likely results. This is what leads LLMs and agents to hallucinate or invent unrealistic output. Put simply, agents guess when they're not told otherwise, and guesses compound. So, I gave them a QUESTION status. If a value is missing from the specs or specs conflict, the agent asks the owner and never invents it. Both projects began the same way. Each answer narrows the next step, so I end up directing instead of correcting. I came up with the pattern on my own but quickly discovered that others had even built an AI skill to do exactly this, published as the [grill-me skill](https://www.aihero.dev/skills-grill-me).

## Not everything needs AI

The other lesson was about what *not* to ask a model. Most of what software does has an algorithmic answer. If a rule has one right answer, a script should own it. Quality gates run through one command that logs everything and prints a short summary. Report validation and spec lookups are scripts. Money is pure, defined mathematics, calculated in one tested place, never re-derived by a prompt. These pieces of work should not be guessed or follow a "likely" path.

A skill is the bridge or skeleton of our ai system: it wraps a deterministic procedure, so the agent calls it instead of improvising. That leaves the ambiguous work to the model, like design trade-offs, review, and noticing two documents disagree.

## Auditing my own agents

Making the workflow more reliable wasn't the same as making it safe. As the budgeting app moved closer to production, I also needed to examine what the agents were allowed to do, not just whether their output passed the gates.
Consistently throughout this process, I audited my agents, reviewing their output and monitoring token and context usage. This helped to identify most problems early, target repetitive tasks for skills, and guide the agents to better results and fewer issues. Recently as I got closer to production with my budgeting app, I had Claude audit both systems against the [Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/). I wanted to determine security issues and places the agents might cause major bugs before they arose. A session is dangerous when it combines untrusted input, access to sensitive data or systems, and the ability to change state or communicate externally. Meta defined the rule and the industry has accepted it as best practice. Only two of the three scenarios should be allowed at a time to maintain a safe system.

Some of mine held up: no budgeting agent can browse the web or post to GitHub, and my UX agent has no shell.

However, some of it didn't. A shell can curl out and read environment variables, so Bash quietly switches on all three properties, and nearly every agent has it. My review agents are "read-only" in prose but still hold write tools, and a rule in a prompt is a request, not enforcement. Neither repo says outright that fetched text and PR comments are data, not instructions. These are known gaps, not fixed ones. Next steps for me are to remove Bash or Write from review roles, isolate web access in a research stage, and add the data-not-instructions rule to both agent contracts.

## Who signs

No agent approves or merges. Human approval is a keystone of my system because I own everything the AI generates: I'm guiding the work, my name will be on the app that ships, and I'm responsible if a bad PR gets merged and breaks. I can't blame the agents, Claude, or Anthropic for bad code I approved. That responsibility shapes the rules: I gatekeep all PRs, nothing gets merged without my explicit review and OK, the gatekeeper agent can only comment, and big milestones stop for my approval. These limits keep agents from running wild. If users' account data is accidentally deleted from the database, a machine can't be held accountable, but a human will be. That human should be the one to press merge.

## Lessons learned

- **Context:** treat it as a budget. Short reading lists, tool-call limits, one report per run, checkpoints, and fresh starts beat long conversations.
- **Security:** count the three properties for every agent, remember that a shell adds back what you removed, and enforce limits in tools rather than prose.
- **Accountability:** AI augments; it doesn't replace people or deterministic code.

**If you take one thing away:** these projects changed the question I ask. Instead of asking whether AI can replace the engineer, I ask which parts of my workflow have one right answer, which are ambiguous, and who signs for the result. AI is powerful and will change how technology is developed, but writing code is only part of software engineering. Engineering will always involve defining a problem, architecting a solution, building it out, testing the results, and owning the finished product. That's the work I continue to do, even with a team of agents. Build with AI but keep engineering!

## Links

- [The grill-me skill](https://www.aihero.dev/skills-grill-me): the ask-the-human-questions pattern, published as a skill.
- [Agents Rule of Two](https://ai.meta.com/blog/practical-ai-agent-security/): agent security standards published by Meta.

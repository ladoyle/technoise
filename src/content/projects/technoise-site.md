---
title: "The TechNoise site"
description: "A static personal site built on Astro with no client JavaScript, a token-only design system, and typed Markdown content collections."
stack: ["Astro", "TypeScript", "CSS", "Markdown", "GitHub Actions"]
status: in-progress
startDate: 2026-09-14
repoUrl: "https://github.com/ladoyle/technoise"
draft: false
---

This is the site you are reading, built in public and still in progress.

## Problem

A personal site has two failure modes that show up years apart. The first is cost: a
stack that quietly needs a database, a platform plan or a paid build tier turns a blog
into a subscription. The second is decay — a site that cannot be built five years later
because the toolchain rotted underneath it.

The target was an all-in cost of roughly the price of a `.com` at wholesale, about ten
dollars a year, with a build that stays reproducible: a pinned Node version, a
committed lockfile, and plain Markdown content that would survive being moved to an
entirely different generator.

## Approach

Tokens first, content second. Before any page existed, the colour roles, the eight-step
type scale and the nine-step spacing scale were encoded as CSS custom properties, with
every contrast ratio measured against the page colour. Components may name a semantic
role — `--link`, `--text`, `--surface` — and nothing else. There are no hex values
outside the token file.

Zero client JavaScript is a posture, not an aspiration. The navigation is links. The
dark scheme is the same tokens bound to different values under
`prefers-color-scheme: dark`. Nothing hydrates, so there is nothing to hydrate slowly.

Content is typed at the schema level. A post with no description, a title over
forty-eight characters, or a tag with a capital letter in it fails the build rather
than shipping.

## Stack

Astro for static output and typed content collections. TypeScript for the content
schemas and the handful of helper functions that sort posts, count tags and format
dates. Hand-written CSS — no framework, no preprocessor, no utility classes. Markdown
for every post and project. A GitHub Actions workflow builds the site and hands it to
GitHub Pages; it has not been allowed to run against a real domain yet.

## What was hard

Two problems took far longer than the features around them.

The first was a cascade problem. Markdown output arrives through a slot, so its
typography has to live in an unscoped stylesheet — and an unscoped `.prose p` rule
outranks a component's own class, silently repainting anything dropped inside a post.
Wrapping every element selector in `:where()` drops those rules to the weight of
`.prose` alone, which turns prose typography into a defaults layer that any component
beats outright instead of a landmine that components have to defend against.

The second was the primary button. Its label is ink on raw orange at 4.24:1, which
passes the large-text contrast floor and fails the normal-text one, so the label has to
be large text by WCAG's definition. The bold-weight route to that definition depends on
whatever bold face the reader's machine happens to have, so the size route was the only
guarantee available and the label is pinned at 25px. It is the least elegant rule in
the system and the most defensible one.

## What I'd do differently

Define the content schemas before the design system, not after. The type scale and the
prose rules were settled against placeholder copy, and the first real posts immediately
raised questions — how long a title is allowed to be, how a date and a read time sit
together in a meta line — that actual content would have answered a week earlier. The
design survived, but it was verified in the wrong order.

The second thing: measure the contrast of the brand colours before treating any of them
as fixed. That one happened to go the right way here, and only because the numbers were
run in the planning document rather than during the build.

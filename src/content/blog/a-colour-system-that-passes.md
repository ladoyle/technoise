---
title: "A colour system that passes"
description: "The brand blue measures 4.1:1 on cream and fails the body-text floor. The measurement, the darker blue that replaced it, and the button it did not save."
pubDate: 2026-09-15
tags: [accessibility, design-systems, css]
draft: false
---

Every colour on this site was measured before it was used anywhere. That order matters:
a palette is much easier to change on day one than after fifty posts have been written
against it.

## The measurement that changed the palette

The brand's signal blue is `#0C83AE`. Against the cream page, `#FDF9F3`, it measures
4.1:1. WCAG asks for 4.5:1 on normal-size text, so the brand's own blue is not a legal
colour for a link inside a paragraph. It misses by about a tenth of a step, which is
exactly the kind of miss that gets waved through when nobody has run the number.

Darkening it to `#0A6F94` gives 5.4:1 and reads as the same blue. That darker value is
`--signal-700`, and it is what every body link on this site actually uses. The raw
signal is not banned outright — it is still correct for a focus ring, an icon, or a
border, all of which answer to the 3:1 non-text floor instead.

| Role | Value | On cream | Floor |
|---|---|---|---|
| Body text | `#0C3242` | 12.9:1 | 4.5 |
| Muted text | `#48646E` | 6.0:1 | 4.5 |
| Link text | `#0A6F94` | 5.4:1 | 4.5 |
| Raw signal | `#0C83AE` | 4.1:1 | fails 4.5 |
| Orange as text | `#B94614` | 5.1:1 | 4.5 |
| Raw pulse | `#F75E1A` | 3.1:1 | fills only |
| Borders | `#C2D1D8` | 1.5:1 | decorative |

## Semantic tokens over brand names

The seven brand values above appear exactly once each, in the token file, and no
component is allowed to name them. Components name a role instead: `--text`,
`--text-muted`, `--link`, `--surface`, `--border`, `--focus`, `--accent-fill`. A card
asking for `--link` gets whatever the current scheme decided a link should be.

The payoff is the next section. The cost is one layer of indirection, and a rule that
has to be enforced by review rather than by the compiler: nothing stops someone writing
`color: #0A6F94` except the fact that it is a defect.

## Dark mode is a re-binding, not a second stylesheet

There is no dark stylesheet in this repo. Under `prefers-color-scheme: dark`, the same
role tokens point at different values: the page becomes ink, links lighten to `#6EC9E8`
at 7.2:1 on ink, and orange-as-text lightens to `#FF9F6B` at 6.7:1. Both lighter values
are tints of the same two brand bases, so the dark scheme is recognisably the same
brand rather than a second one.

Because the components only ever named roles, not one of them carries a dark-mode rule.
If a component ever needs one, that is a signal that it reached past the tokens.

## The orange button problem

This is the one the measurements did not rescue. The primary button is ink on raw
pulse, which measures 4.24:1. That clears the 3:1 floor for large text and fails the
4.5:1 floor for normal text, so the label has to qualify as large. WCAG offers two
routes: 18.66px when bold, or 24px at any weight.

The bold route depends on a font file. The label is pinned at 25px instead, the top of
the type scale's mid-range, because 25px is arithmetic and a bold face on a stranger's
machine is not:

```css
.button {
  font-size: max(var(--size-25), 25px);
  font-weight: var(--weight-bold);
}
```

The `max()` is doing real work. The token is in `rem`, so it scales up for a reader who
raises their default font size, and it would drop to 18.75px for a reader who lowers
it — the literal holds the floor at the scale's 25px in that case.

The alternative was to buy the contrast rather than the size: fill the button with
`--pulse-700` and set the label in cream, which measures 5.07:1 and passes at any size
and any weight. It was rejected because it spends the brand's raw orange, which is the
one loud thing the whole palette is built around. That is a design decision, not a
technical one, and it is written down in the stylesheet so the next person can reopen
it with the numbers in hand.

## One orange per screen

The last rule is not a contrast rule. Orange is the "do this" colour, and it appears
once per page or not at all. A blog index has nothing to do, so it has no orange. A
project page has one action, so it has one orange button. Three orange things on a page
means the page has no call to action and is simply shouting. The cost is that some
pages look plainer than they could — which is the same thing as saying the one thing
worth clicking is obvious.

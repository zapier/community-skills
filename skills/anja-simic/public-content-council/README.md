---
title: "Public Content Council: introduction"
created_by: "Anja Simic"
created_at: 2026-11-06
last_updated_by: "Anja Simic"
last_updated_at: 2026-11-06
content_type: reference
summary: "What the Content Council reviews, what to supply, and how to use its public skill package."
---

# Content Council

Content Council reviews a draft through several editorial lenses and returns a prioritized memo. It is useful for articles, reports, guides, whitepapers, playbooks, one-pagers, and executive briefs.

## Use it

Install or provide the entire skill folder to an agent that supports the Agent Skills format. The `SKILL.md` file and all three files in `references/` must stay together. Give the agent a draft and, if available, a brief, target audience, intended publication surface, desired reader action, source material, and house standards.

Example requests:

- "Review this article with the Content Council. The readers are finance directors who recommend purchases to the CFO."
- "Run a quick review of this outline."
- "Review this without waiting for audience confirmation and label the assumptions."

The default council seats six standing members: The Strategist, The Editor, The Impatient Reader, The Skeptic, The Distribution Lead, and Surface Tells. It also seats one simulated Target Reader and, when useful, one Domain Expert. The agent uses parallel helpers only if the host supports them and sharing the draft is permitted. Otherwise it runs the members sequentially and explains the limitation.

## Boundaries

The council diagnoses; it does not rewrite or publish. A simulated reader is not user research. A source is not verified merely because a draft links to it. The review is not legal or professional advice and does not replace fact-checking or a human publishing decision.

## Contents

```text
public-content-council/
  SKILL.md
  references/
    standards.md
    reviewers.md
    memo-template.md
```

Author: Anja Simic. License: MIT.

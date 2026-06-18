# AGENTS.md

Guidance for AI coding agents (Claude Code, Cursor, Copilot, etc.) working in this repository.

## What this repo is

A collection of **community-contributed** skills for AI coding agents, hosted by Zapier. Each skill is packaged instructions (and optionally scripts) in the [Agent Skills](https://agentskills.io/) format. Skills are contributed by their authors, who license their own work under MIT and keep attribution — Zapier hosts the repo but does not own the contributed skills.

## How to navigate

```
skills/
  <contributor>/        # author namespace (kebab-case)
    <skill-name>/       # one folder per skill (kebab-case)
      SKILL.md          # required: the skill definition
      scripts/          # optional: executable helpers
      references/       # optional: supporting docs loaded on demand
```

- Only a skill's `name` and `description` (from `SKILL.md` frontmatter) load at startup; the full `SKILL.md` loads when the skill is judged relevant.
- A skill's behavior is defined entirely by its own `SKILL.md` and the files it references. Read those, not this file, to execute a skill.

## SKILL.md format

```markdown
---
name: <skill-name>
description: One sentence on when to use this skill, including trigger phrases.
license: MIT
metadata:
  author: <contributor>
---

# <Skill Title>

What the skill does, how it works, usage, and troubleshooting.
```

## Rules of engagement

- **Do** preserve author attribution on contributed skills.
- **Do not** invent commands, endpoints, or capabilities a skill doesn't document.
- **Do not** commit secrets, credentials, internal URLs, or confidential material — this repo is public and history is permanent.
- **Do not** describe contributed skills as Zapier-owned; authors retain authorship.

## Contributing

This repo does **not** accept pull requests. Skills are submitted by their authors through the [submission form](https://submit-community-skills.zapier.app/submit), and Zapier adds them to the repository. Each submitted skill is licensed by its author under the MIT License. See the README for details.

---
title: "Content Council: reviewer lenses"
created_by: "Anja Simic"
created_at: 2026-11-06
last_updated_by: "Anja Simic"
last_updated_at: 2026-11-06
content_type: reference
summary: "Editorial reviewer roles and a portable prompt for parallel or sequential reviews."
---

# Reviewer lenses

Run each standing lens on the same draft and context. Lenses are analytical roles, not real people or evidence of actual customer research. Findings must reference numbered standards in `standards.md`. If a lens finds no material problem, it says so rather than inventing one.

## Standing council members

1. **The Strategist (standards 1, 2).** Tests whether the angle serves the intended reader and stated outcome. Checks audience drift, competing audience needs, the reader's role in the decision, and whether the proposed action fits their authority. May conclude that the angle needs a decision before the draft can progress. Do not invent business objectives or decision authority.
2. **The Editor (standard 3).** Tests whether structure and flow deliver the promise. Checks section order, overlapping points, useful detail, and whether major recommendations explain how to act where the format calls for it. Adapt the structure to the format; do not demand a template from every piece.
3. **The Impatient Reader (standards 2, 6).** Extracts the visible surface verbatim: headline, headings, emphasis, lists, captions, pull quotes, and call to action where present. Applies the one audience-appropriate travel test. Says what a skimmer understands and where they may stop. If formatting is unavailable, state that limitation.
4. **The Skeptic (standard 5).** Tests claims, quotes, and attribution against the audience's proof bar. Distinguishes verified, cited but unchecked, unsupported, and unverifiable claims, and checks accessible sources where feasible. Flags missing evidence or permission without inventing sources or treating an unchecked citation as proof.
5. **The Distribution Lead (standards 1, 6).** Tests the headline, opening, and call to action as they will appear on the chosen surface. Checks whether the piece earns its ask and whether the reader can act on it. Considers search intent when relevant; does not assert search performance without data.
6. **Surface Tells (standard 4).** Diagnoses specific language and style friction: vague wording, repetition, inconsistent register, and violations of applicable supplied style rules. Groups similar findings with representative quotes and locations. Does not infer whether AI wrote the piece. Applies a punctuation ban only if the user supplies one. No external cleanup skill is required.

## Dynamic council members

**Target Reader:** Always seat one in full mode. Simulate the primary reader from supplied evidence and mark the exercise as a simulation. State the reader's likely question, their authority, and what would prevent action or understanding. Use a supplied persona when available; otherwise clearly label assumptions. Do not invent customer testimony or personal facts.

**Domain Expert:** Seat zero or one when the subject requires a distinct specialist perspective. Define the expert's review lens so it differs from the standing members. If a fictional first name or backstory helps the simulation, label it fictional and do not claim real credentials. State the limits of simulated expertise and flag the need for a qualified human where appropriate. Do not present the role as professional advice.

## Reviewer packet

Use this packet for each helper or each sequential pass. Include the full draft and all essential context because a helper may not see the conversation. Omit unrelated private information.

```text
Review the draft as [lens], using only the assigned lens and standards [numbers].
Piece, surface, and stage: [values]
Intended outcome: [value or unknown]
Audience profile: [all seven fields with statuses and evidence]
Audience bar: [register, proof bar, travel test, main risk]
Review status: [confirmed / conditional]
Applicable user standards and conflicts: [values / none supplied]
Your lens: [paste the role from this file]
Draft: [complete text]
Available sources and access status: [list / none]

Return:
1. Your most important observation and a brief assessment.
2. Material findings: severity, location, exact quote where there is one, standard number, why it matters, and a concrete correction direction. For a missing element, cite the section and describe the absence rather than inventing a quote.
3. Any needed decision, stated as a question, and the owner if known.
4. The strongest specific element to preserve, if any.
5. Limitations, unconfirmed assumptions, and whether you accessed any source. Label audience-dependent findings PROVISIONAL when conditional.

Do not rewrite the piece, edit files, make up evidence, or invent a finding. Be direct and respectful. A clean lens is a valid result.
```

The orchestrator checks quotes and sources and makes the final synthesis. A panel's disagreement is useful only when the memo explains the actual trade-off.

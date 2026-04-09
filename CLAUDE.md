# Spreadcom LinkedIn Agent — Developer Workflow Rules

This file governs how all development work on this project is executed.
Read `tasks/lessons.md` before starting any session.

---

## Pre-Flight (Before Writing Any Code)

1. **Query `tasks/lessons.md`** for keywords matching the current task (e.g., "auth", "api", "schema", "model", "cron").
2. **Write the plan to `tasks/todo.md`** with checkable items and a risk/side-effect assessment.
3. **Trigger Plan Mode** for any task with 3+ steps or architectural impact.
4. **Check in with the user** before starting heavy implementation.

---

## In-Flight (During Implementation)

- Mark `tasks/todo.md` items complete as you go — atomic updates only.
- **The Pivot Rule**: If the plan requires >2 on-the-fly adjustments, STOP. Re-map the dependency graph and re-plan before continuing.
- **Side-Effect Audit**: For every significant change, list three potential downstream breakages in `tasks/todo.md`.
- **Staff Engineer Bar**: Ask — "Is this solution self-documenting, or does it need a comment to explain why it's not a bug?" If the latter, add the comment.

---

## Post-Flight (After Implementation)

- Provide `stdout`, logs, or diffs as evidence of correctness.
- Add a debrief block to the relevant `tasks/todo.md` session section.
- **If a bug was fixed**: update `tasks/lessons.md` with the Anti-Pattern and Heuristic — never just record the mistake.

---

## Subagent Rules

- One task per subagent — no combined responsibilities.
- Subagents report results in structured Markdown or JSON only.
- For any non-trivial implementation: use the **Peer Reviewer Pattern** — one subagent implements, a second critiques.
- Parallel exploration: for complex "how-to" decisions, launch subagents with different constraints and compare.

---

## Core Principles

- **No Ghost Fixes**: Never fix a bug without identifying the root cause. Document the "why" in `tasks/lessons.md`.
- **No Context Drift**: Explicitly list irrelevant files before starting to stay focused.
- **Rule of Three**: Abstract on the third copy. Keep it simple on the second.
- **Total Ownership**: A fix that breaks a downstream dependency is a failure, not a completion. Audit side-effects.
- **Zero Hand-Holding**: Resolve bugs autonomously using logs and tests. Do not ask for information available in the codebase.

---

## Project Key Files

| File | Purpose |
|---|---|
| `src/agent.js` | Main orchestrator — cron scheduling, CLI entry point |
| `src/linkedin.js` | All LinkedIn API calls — base: `https://api.linkedin.com/rest`, version: `202501` |
| `src/content.js` | Claude content generation — models: opus-4-5 (posts), haiku-3-5 (fast tasks) |
| `src/engage.js` | Comment monitoring + reply cycle |
| `src/leads.js` | Lead pipeline — stored in `data/leads.json` |
| `src/report.js` | Weekly analytics report |
| `src/auth.js` | OAuth 2.0 flow — run `npm run auth` to refresh token |
| `tasks/todo.md` | Active task log with pre/in/post-flight tracking |
| `tasks/lessons.md` | Anti-pattern and heuristic log — **query before every session** |
| `.env` | Live credentials — never commit, never log values |

---

## LinkedIn API Quick Reference

```
Base URL:    https://api.linkedin.com/rest
Version hdr: LinkedIn-Version: 202501
Post text:   post.commentary  (NOT specificContent.shareCommentary.text)
Post time:   post.createdAt   (NOT post.created.time)
Post ID:     res.headers['x-restli-id']  (NOT res.data.id — body is empty on 201)
Comment URN: comment.commentUrn  (NOT comment.id — must be composite URN for replies)
```

# Spreadcom LinkedIn Agent — Task Log

## Pre-Flight Protocol
> Before any implementation: write plan here, assess risks, get user sign-off on scope.

---

## Session 1 — Initial Build + Peer Review
**Date:** 2026-03-13
**Scope:** Build LinkedIn automation agent from context document, apply peer review fixes.

### Build Tasks
- [x] Scaffold project: `package.json`, `.env.example`, directory structure
- [x] `src/auth.js` — OAuth 2.0 flow with local callback server
- [x] `src/linkedin.js` — LinkedIn API client (posting, comments, analytics)
- [x] `src/content.js` — Claude-powered content and reply generation
- [x] `src/engage.js` — Comment monitoring and engagement cycle
- [x] `src/leads.js` — Lead tracking and pipeline management
- [x] `src/report.js` — Weekly analytics report generation
- [x] `src/logger.js` — Winston logger with file rotation
- [x] `src/agent.js` — Main orchestrator with cron scheduling
- [x] `.env` populated with credentials by user

### Peer Review — 25 Issues Found & Fixed
- [x] **#1** `linkedin.js` — Missing `LinkedIn-Version` header (root cause of all 403s)
- [x] **#2** `linkedin.js` — Wrong base URL `/v2` → `/rest`
- [x] **#3** `linkedin.js` — `createPost`/`createImagePost` using deprecated UGC Posts schema
- [x] **#4** `linkedin.js` — `getOrgPosts` deprecated endpoint + wrong `authors` param
- [x] **#5** `linkedin.js` — `getComments` hitting `/v2` (fixed by #2)
- [x] **#6** `linkedin.js` — `replyToComment` wrong actor (person vs org) + missing `object` field
- [x] **#7** `linkedin.js` — `getFollowerStats` wrong `edgeType` casing
- [x] **#8** `linkedin.js` — `getPostStats` calling non-existent `/socialMetadata` endpoint
- [x] **#9** `linkedin.js` — `getPageStats` malformed `timeIntervals` string param
- [x] **#10** `linkedin.js` — `likePost` deprecated `socialActions/likes` → Reactions API
- [x] **#11** `content.js` — Invalid model `claude-opus-4-6` → `claude-opus-4-5`
- [x] **#12** `content.js` — Invalid model `claude-haiku-4-5-20251001` → `claude-haiku-3-5-20241022` (×4)
- [x] **#13** `linkedin.js` — Post ID must be read from `x-restli-id` response header
- [x] **#14** `auth.js` — Missing `w_organization_social_feed` + `r_organization_social_feed` scopes
- [x] **#15** `engage.js` — Reading `specificContent` UGC field → `post.commentary`
- [x] **#16** `report.js` — Same UGC field path → `post.commentary`
- [x] **#17** `report.js` — Stat field names (fixed by #8 normalization)
- [x] **#18** `report.js` — `p.created?.time` → `p.createdAt`
- [x] **#19** `engage.js` — Using bare `comment.id` → composite `comment.commentUrn`
- [x] **#20** `leads.js` — Duplicate detection broken when `company` always empty
- [x] **#21** `linkedin.js` — `commentOnPost` missing required `object` field
- [x] **#22** `.env` — Added `LINKEDIN_API_VERSION=202501`
- [x] **#23** `agent.js` — Added cron expression validation before scheduling
- [x] **#24** `logger.js` — Added rotation config to `errors.log`
- [x] **#25** `content.js` — Lazy Anthropic client init

### Side-Effect Audit (post-review)
> Per workflow rule §4 — list three potential downstream breakages per major change:
- **API base URL change** `/v2` → `/rest`: All existing access tokens may have been scoped to v2 paths — confirmed OK, tokens are not path-scoped.
- **Post ID from header not body**: `agent.js` `result.id` log was already updated in `createPost` return value — no downstream breakage.
- **`commentUrn` vs `comment.id` in `replied_comments.json`**: Pre-existing entries use bare IDs. On first run post-fix, old entries remain valid; new entries use composite URNs. No conflict — Set.has() is identity-based.

### Pending — Awaiting User Action
- [x] Fix Anthropic API key typo in `.env`
- [ ] Confirm LinkedIn Developer App has **Marketing Developer Platform** product enabled
- [ ] Re-run `npm run auth` after MDP approval — uncomment PHASE 2 scopes in `auth.js`, switch all `personUrn()` → `orgUrn()` in `linkedin.js`
- [x] Run `npm run post` — FIRST LIVE POST PUBLISHED ✓
- [ ] Run `npm run engage` to confirm comment monitoring works
- [ ] Run `npm run report` to confirm analytics report generates

### Post-Flight — Evidence of Correctness
- First post published: `urn:li:share:7438421104903409665` (pillar: security_awareness, 1321 chars)
- 25/25 peer review issues + 15/15 second review issues fixed
- All model names validated
- `npm install` — 0 vulnerabilities
- Working API version confirmed: `202602`

---

## Session 2 — Content Variation Fix
**Date:** 2026-03-16
**Scope:** Fix repeated daily posts. Apply to both local and Azure versions.

### Root Cause (5 Whys)
1. Why same post every day? → Same pillar selected every run
2. Why same pillar? → `pillarIndex` resets to 0 on process restart
3. Why does it reset? → Stored in module memory, not persisted to disk
4. Why no variation even within a pillar? → Same broad prompt → Claude generates structurally similar content
5. Why no date/context? → Prompt has no date or "avoid recent topics" instruction

### Plan
- [x] Add `PILLAR_SUB_TOPICS` — 6-8 specific angles per pillar
- [x] Add `content_state.json` in data dir — persists `pillarIndex` + `recentSubTopics` (last 14)
- [x] Update `generateDailyPost()` — load/save state, select sub-topic not recently used, inject date + angle + recent-topics-to-avoid into prompt
- [x] Apply to local version: `src/content.js`
- [x] Apply to Azure version: `src/content.js`
- [x] Peer review both versions — 3 issues found and fixed

### Peer Review Fixes
- [x] CRITICAL — `agent.js` ignored `subTopic` in destructuring → added to both agent.js files + logs
- [x] HIGH — `saveState()` called before API call → moved after successful `messages.create()` in both versions
- [x] MEDIUM — exhaustion reset pool could immediately re-select recent topic → re-filter on fallback, exclude last 4

### Risk Assessment
- `content_state.json` write happens before API call — if process dies mid-call, pillar index increments but no post is published. Acceptable (avoids repeats; at worst skips one pillar slot).
- `result.pillar` is still returned from `generateDailyPost()` — `agent.js` still works.
- No breaking changes to any other module.

---

## Session 3 — Write Project Documentation
**Date:** 2026-04-08
**Scope:** Review full codebase and produce README.md at project root.

### Plan
- [x] Read lessons.md (pre-flight)
- [x] Read all src/ modules, package.json, .env.example, tasks/todo.md
- [x] Write README.md — setup, auth, usage, architecture, content system, lead pipeline, API notes

### Risk Assessment
- Documentation only — no code changes, no side-effects.

---

## Debrief Template
```
## Debrief
- What broke and why (5 Whys if recurring):
- Anti-pattern identified:
- Heuristic added to lessons.md: [yes/no + entry title]
- Rules updated: [yes/no]
```

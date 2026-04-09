# Spreadcom LinkedIn Agent — Lessons & Anti-Patterns

> Updated after every correction. Format: Anti-Pattern (why it happened) → Heuristic (how to prevent).
> Query this file by keyword before starting any session touching: `auth`, `api`, `async`, `model`, `cron`, `schema`.

---

## [L-001] LinkedIn API Versioning — Missing `LinkedIn-Version` Header
**Date:** 2026-03-13
**File:** `src/linkedin.js`
**Symptom:** All API calls returned `403 ACCESS_DENIED` despite valid credentials.

**5 Whys:**
1. Why did the API fail? → Missing `LinkedIn-Version` header.
2. Why was it missing? → Code was built against the pre-2023 v2 API docs.
3. Why were old docs used? → LinkedIn's migration to versioned REST API wasn't accounted for.
4. Why wasn't it caught in testing? → No live API test was run before delivery.
5. Why wasn't it caught in review? → Peer review was run post-build, not pre-build.

**Anti-Pattern:** Building LinkedIn API integrations from memory or old examples without checking current docs. The LinkedIn REST API has required `LinkedIn-Version: YYYYMM` on every request since June 2023.

**Heuristic:** Before writing any LinkedIn API client code, verify the current base URL and required headers at `learn.microsoft.com/linkedin` or `developer.linkedin.com/docs`. Always include `LinkedIn-Version` in the shared `headers()` function — never inline it.

---

## [L-002] LinkedIn API Base URL Migration — `/v2` vs `/rest`
**Date:** 2026-03-13
**File:** `src/linkedin.js`

**Anti-Pattern:** Using `https://api.linkedin.com/v2` as the base URL. The v2 path is being sunset. The versioned API base is `https://api.linkedin.com/rest`.

**Heuristic:** `const BASE = 'https://api.linkedin.com/rest'` — hardcode this. If any LinkedIn endpoint ever returns `NONEXISTENT_VERSION`, the base URL is likely `/v2` instead of `/rest`.

---

## [L-003] LinkedIn Posts API Schema Migration — UGC Posts → Posts API
**Date:** 2026-03-13
**File:** `src/linkedin.js`

**Anti-Pattern:** Using the UGC Posts schema (`specificContent['com.linkedin.ugc.ShareContent']`, `shareCommentary`, nested visibility object). The current Posts API uses a flat schema: `commentary` (string), `visibility` (string), `distribution` object.

**Heuristic:**
- Old: `POST /v2/ugcPosts` with `specificContent.shareCommentary.text`
- New: `POST /rest/posts` with `commentary` (top-level string), `visibility: 'PUBLIC'`
- Post ID is returned in the **response header** `x-restli-id`, not `res.data.id` (201 response body is empty).

---

## [L-004] LinkedIn OAuth Scopes — Feed-Suffixed Scopes Required Post-June 2023
**Date:** 2026-03-13
**File:** `src/auth.js`

**Anti-Pattern:** Requesting only `w_organization_social` and `r_organization_social` for comment/reaction operations. These base scopes are insufficient for the Reactions API and Comments API as of June 2023.

**Heuristic:** For full company page management (post + comment + react + read), always request all six scopes:
```
w_organization_social
r_organization_social
w_organization_social_feed   ← required for reactions/comments
r_organization_social_feed   ← required for reading reactions/comments
rw_organization_admin
w_member_social
```
After any scope change: re-run `npm run auth` to get a fresh token — existing tokens do not inherit new scopes.

---

## [L-005] Anthropic Model ID Validation
**Date:** 2026-03-13
**File:** `src/content.js`

**Anti-Pattern:** Using model IDs by guessing version patterns (e.g., `claude-opus-4-6`, `claude-haiku-4-5-20251001`). Invalid model IDs cause silent 404/400 failures at generation time, not at import time.

**Heuristic:** Always use validated model IDs from the Anthropic docs or system context:
- High-quality generation: `claude-opus-4-5`
- Fast/cheap classification/replies: `claude-haiku-3-5-20241022`
- Balanced: `claude-sonnet-4-6`

Test model IDs at session start with a single `messages.create` call before wiring into production flows.

---

## [L-006] LinkedIn Comment Reply — Required `object` Field
**Date:** 2026-03-13
**File:** `src/linkedin.js`

**Anti-Pattern:** Omitting the `object` field from the Comments API POST body. The field is required — it specifies which post is being commented on. Its absence causes 400 errors that look unrelated.

**Heuristic:** LinkedIn's `socialActions/{postUrn}/comments` POST body always requires three fields: `actor`, `object` (= the postUrn), `message: { text }`. For replies, add `parentComment` (composite commentUrn).

---

## [L-007] LinkedIn Comment URN — Composite URN vs Bare ID
**Date:** 2026-03-13
**File:** `src/engage.js`

**Anti-Pattern:** Using `comment.id` (a bare numeric string) as the `parentComment` value when replying. The Comments API requires a composite URN: `urn:li:comment:(urn:li:activity:...,numericId)`.

**Heuristic:** Always use `comment.commentUrn` (pre-built composite) from the comments API response. Fall back to `comment.id` only for local deduplication tracking. Never pass a bare numeric ID to any LinkedIn API endpoint that expects a URN.

---

## [L-008] Anthropic Client — Lazy Initialization
**Date:** 2026-03-13
**File:** `src/content.js`

**Anti-Pattern:** Instantiating `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` at module load time. If the module is imported before `dotenv/config` runs, `ANTHROPIC_API_KEY` is `undefined` and the client silently fails on first use.

**Heuristic:** Always use lazy initialization for API clients that depend on env vars:
```js
let _client;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _client;
}
```
Applies equally to any SDK client (axios instances with auth headers, DB clients, etc.).

---

## [L-009] LinkedIn Posts API — Response Field Name Changes
**Date:** 2026-03-13
**Files:** `src/engage.js`, `src/report.js`

**Anti-Pattern:** Reading `post.specificContent['com.linkedin.ugc.ShareContent'].shareCommentary.text` for post text, and `post.created?.time` for timestamp. These are UGC Posts API field paths.

**Heuristic:** New Posts API field names:
- Post text: `post.commentary` (top-level string)
- Creation timestamp: `post.createdAt` (Unix ms number)
- Stats: `totalShareStatistics.likeCount`, `.commentCount`, `.shareCount`, `.impressionCount`

When switching any LinkedIn API endpoint from v2 to rest, audit all field path accesses in the consuming code.

---

## [L-011] Phase Transitions — All actor/author Fields Must Be Updated Together
**Date:** 2026-03-13

**Anti-Pattern:** Updating `createPost` author from `orgUrn()` to `personUrn()` for Phase 1 without updating all other functions that also use `orgUrn()` as actor — `createImagePost`, `replyToComment`, `commentOnPost`, `likePost`, `getOrgPosts`. Each of these will 403 independently under Phase 1 scopes.

**Heuristic:** When changing a scope phase, grep for every occurrence of `orgUrn()` in `linkedin.js` and evaluate each one. Create a `// PHASE 1 — change to orgUrn() after MDP` comment on every line that needs to change at Phase 2 transition. Never change one and assume the others are unaffected.

---

## [L-012] Data Directory — Always Guard With `mkdirSync` Before Writing
**Date:** 2026-03-13

**Anti-Pattern:** Writing to `data/` or `logs/` with `writeFileSync` without first ensuring the directory exists. On a clean clone or fresh environment, the directory won't exist and the write will throw `ENOENT`.

**Heuristic:** Every `writeFileSync` to a non-guaranteed path must be preceded by `mkdirSync(dir, { recursive: true })`. Use atomic writes (`writeFileSync(tmp)` + `renameSync(tmp, target)`) for any file that accumulates state across runs.

---

## [L-013] Engagement Cycle — Persist State After Each Action, Not Only at Cycle End
**Date:** 2026-03-13

**Anti-Pattern:** Calling `saveReplied()` only once at the end of the engagement cycle. A mid-cycle crash loses all progress and causes duplicate replies on the next run — a visible user-facing error.

**Heuristic:** Call `saveReplied(replied)` inside the inner loop immediately after marking a comment handled. The final call at cycle end is a belt-and-suspenders flush but must not be the only save point.

---

## [L-014] Model Output Validation — Validate Classifier Output Before Using as Dict Key
**Date:** 2026-03-13

**Anti-Pattern:** Using raw LLM output as a dictionary key without validation. If the model returns `"LEAD SIGNAL"` (space), `"LEAD_SIGNAL."` (punctuation), or any unexpected string, the key lookup returns `undefined` and downstream `=== 'SPAM'` and `=== 'LEAD_SIGNAL'` checks silently fail.

**Heuristic:** Always define a `VALID` set and gate the return: `return VALID.includes(raw) ? raw : 'GENERAL'`. Apply this pattern to any function that uses LLM output as a control-flow discriminator.

---

## [L-015] LinkedIn API Version — Active Version Window and Format
**Date:** 2026-03-13

**Anti-Pattern:** Using `202501` (January 2025) as the `LinkedIn-Version` header value. LinkedIn expands YYYYMM to YYYYMMDD internally (`20250101`) and that version had been sunset by March 2026. The safe range is approximately the last 12–18 months.

**Heuristic:** The active LinkedIn API version should be within ~12 months of the current date. Always test multiple recent versions when a `NONEXISTENT_VERSION` error appears. As of March 2026, `202602` (February 2026) is the latest active version. Update `LINKEDIN_API_VERSION` in `.env` and the fallback in `linkedin.js` whenever this error appears.

Test script to find the active version:
```js
for v of ['202603','202602','202601','202512',...]:
  POST /rest/posts → if not NONEXISTENT_VERSION → version is active
```

---

## [L-016] LinkedIn Auth — OIDC Tokens vs OAuth Tokens Are Not Interchangeable
**Date:** 2026-03-13

**Anti-Pattern:** Requesting `openid profile email` scopes generates OIDC identity tokens (JWT format). These are rejected by LinkedIn's REST API (`INVALID_ACCESS_TOKEN`) even though they are technically valid LinkedIn tokens. The Posts API requires standard OAuth 2.0 opaque tokens.

**Heuristic:** For LinkedIn REST API access (posting, reading, comments), only request scopes from the **"Share on LinkedIn"** or **MDP** products, never from the "Sign In with LinkedIn using OpenID Connect" product alone. The `w_member_social` scope via "Share on LinkedIn" generates a proper OAuth token. Verify a new token immediately after exchange by calling `/v2/me` — a `403` (not `401`) confirms the token is valid but just missing `r_liteprofile` scope, which is acceptable.

---

## [L-018] Content Generation — In-Memory State Resets on Process Restart
**Date:** 2026-03-16
**File:** `src/content.js`

**Anti-Pattern:** Storing rotation state (e.g., `pillarIndex`, last-used topics) in module-level variables. The variable resets to its initial value on every process restart. On Azure Web App, restarts happen on deployment, auto-heal, and scale events — meaning the agent always starts from index 0 and posts the same content.

**Heuristic:** Any state that must survive process restarts must be persisted to disk (or a database). For lightweight rotation state, write to `{DATA_DIR}/content_state.json` on every update. Load on first use. Always guard the write with `mkdirSync({ recursive: true })` (L-012) and save state only AFTER a successful API call to avoid consuming a slot on a failed generation.

---

## [L-019] Content Generation — Save State After Successful API Call, Not Before
**Date:** 2026-03-16
**File:** `src/content.js`

**Anti-Pattern:** Calling `saveState()` before the Claude API call. If the API call fails (network error, rate limit), the pillar index has advanced and the sub-topic has been added to the recent list — but no post was published. The next run skips a pillar unnecessarily.

**Heuristic:** Persist rotation state only after the API call succeeds. Pre-compute the new state object (e.g., `updatedRecent`) before the call so it is ready to save immediately after success. This trades the risk of "occasionally repeating a sub-topic on process crash" for the guarantee of "never skipping a pillar on API failure" — the better tradeoff for content quality.

---

## [L-010] API Integration — Always Run a Read-Only Connectivity Test First
**Date:** 2026-03-13

**Anti-Pattern:** Wiring full write operations (post creation, comment replies) into a production schedule without first verifying read-only connectivity with the live credentials.

**Heuristic:** For any new API integration, the first test should always be a read-only `GET` call (e.g., get profile, list posts). Only proceed to write operations once a successful `2xx` is confirmed. Prevents wasted API calls and avoids accidental duplicate posts during debugging.

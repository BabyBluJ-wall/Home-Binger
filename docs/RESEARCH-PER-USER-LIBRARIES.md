# RESEARCH — Per-user library access (the parents/kids ask)

**Owner ask (2026-09-12):** "An admin should be able to allow which
libraries each individual user sees. Say parents set it up and have
spicy content. That shouldn't show up in the kids library."

Research-only doc, standard doctrine: code audit + verdicts first, zero
implementation.

**OWNER FLOW DECISION (2026-09-12): the access question is asked AT
LINK TIME.** "Admin signs in, links libraries; when selected, asked if
they go to all accounts or certain ones; if certain ones, which ones."
§2 below is the v2 design shaped by that call.

---

## 1 · Verdict table (code audit, 2026-09-12)

| Question | Verdict | Why |
|---|---|---|
| Possible without new server endpoints? | **YES** | The machinery already exists: per-visitor catalogue **views** (`userView`), per-item section keys (`sectionId`, e.g. `archive:staff-picks`), the **exact allowlist predicate** already written for friend share lists (`shareableWith` in friends.js), session users with `isAdmin`, and an admin endpoint that already lists every own-section (`/api/admin/friend-sections`) |
| Server-side enforcement (the part that makes it REAL)? | **YES — one gap to close** | `/api/library`, `/api/item`, `/img` (posters) already flow through per-visitor views. **`/api/play` and `/api/tv/stream` do NOT check any view today** — they serve anything configured. Hiding content in the UI without closing this is cosmetic (dev tools reach the stream directly). The fix: resolve the requesting user, look the item up, 403 if its section isn't on their list |
| Backward compatible? | **YES** | A user record with no `sections` field = sees everything (today's behavior). The feature is opt-in per user, off by default — no migration, no surprise |
| Simple for parents? | **YES — one place** | Admin → Users → pick the kid → "Library access" checkbox list of every section, all ON by default. Uncheck the spicy library, save. Done. (Same pattern as the friend share-list picker the admin already knows) |
| Break the friend path? | **NO** | Friend stores see the share lists (already independently enforced, `shareableWith`). Local per-user rules govern local logins only. Orthogonal — it cannot jeopardize the friend gate |
| Break the jukebox / case view / search? | **NO — automatic** | Every client list (shelves, jukebox music, search, case view) is built from `state.items`, which comes from `/api/library`. Filter the endpoint, every surface follows |
| Ask access AT LINK TIME (owner's flow)? | **YES — and it's the better data model** | Instead of per-user lists written after the fact, the LIBRARY carries its audience (`all` / `certain accounts`), chosen the moment it's linked. Per-user views are derived, new "all" libraries fan out to nobody's write-list, and a forgotten prompt can never silently expose or hide anything |

## 2 · The flow (v2 — owner-shaped: access is asked AT LINK TIME)

**Owner (2026-09-12): "Admin signs in, links libraries; when selected,
asked if they go to all accounts or certain ones; if certain ones,
which ones."** The question lives WHERE the library is linked — not in
a panel the admin must remember to visit afterward.

1. Admin signs in → Admin → Media → links/enables a library (a
   Plex/Jellyfin section, an Archive section, a radio genre, a podcast
   feed, a grabber folder, an extra instance, a friend store).
2. **THE PROMPT** (one question, plain language): *"Who gets this
   library?"*
   - **All accounts** — the default, exactly today's behavior
   - **Only certain accounts** → a checkbox picker of every registered
     account
3. Save. The library exists for exactly those accounts. Everyone else
   never sees it — shelves, search, jukebox, case view, and the play
   route answers **403**.

**Data model — the LIBRARY carries its audience (source of truth):**

- `libraryAccess: { [sectionKey]: 'all' | { users: ['kid', …] } }`
  (admin-owned, config-side).
- A user's effective view is DERIVED: every section marked `all`, plus
  any section whose list names them. No fan-out writes when a new
  "all" library is linked; no stale per-user copies to drift.
- **Absent key = `all`** → an existing install updating to this version
  changes NOTHING until the admin answers the prompt for something new.
- **New accounts created later:** they automatically get every `all`
  library; `certain-ones` libraries stay HIDDEN from them until the
  admin adds them. (The kid-safety default: a sibling's new account
  doesn't silently inherit the spicy library.)
- Dismissing/cancelling the prompt = `all` — linking is never blocked
  by the question.

**Both doors, one truth:** the link-time prompt is where access is
usually decided; Admin → Users → per-account "Libraries this account
can see" is the audit/edit reflection (it reads and writes the same
`libraryAccess` map, for the power user who wants to review one kid).

**Server enforcement map (unchanged from the audit — the prompt is UX,
the routes are the law):**

- `/api/library` — filter items by the requesting account's derived
  view AFTER the shared catalogue fetch (one cache, cheap per-user
  filter — no cache-slot explosion per user)
- `/api/play/*` — resolve user (session token) → find the item →
  not in their view → **403** (THE security fix)
- `/api/tv/stream` — same guard
- `/api/item/*`, `/img/*` — already view-aware; add the same guard
- Admins always see everything; guests are covered by §3's caveat.

## 3 · Honest caveats (recorded, not solved in v1)

- **The theater screen is a shared surface.** If an adult puts spicy
  content ON the store TV, everyone in the theater sees the screen.
  Per-user access controls what each person can BROWSE and START — not
  what's already playing. (A future "safe screen" toggle could limit
  what the TV itself accepts; not v1, and parents should know.)
- **Anonymous visitors see everything the admin has on.** Guests
  without an account have no allowlist. If a "locked-down house" mode is
  ever wanted (anonymous = a restricted default set), that's a small
  follow-up toggle — noted, not v1. (Friends on the tailnet browse
  anonymously or with accounts today; restricting THEM is the share-list
  system, which already exists.)
- **Section keys are stable but per-source.** A Plex library key like
  `plex:2` is chosen by the Plex server; if the parent rebuilds their
  Plex, the allowlist needs a re-check. The Users panel showing friendly
  names (not raw keys) keeps this invisible until it matters.

## 4 · Effort + sequencing

- **Small-to-medium t-block.** No new endpoints (one PUT field + reuse
  of friend-sections), one filter, one guard in four routes, one Users
  panel block, tests. Everything audited above already exists.
- **Sequencing call (mine, owner can override): rides the combined
  release**, built beside Live TV with the same modular rule — it is
  independent of the friend path (cannot jeopardize the gate) and it
  completes the release's story: *your library, your friends, your kids,
  free TV.* If the box gets heavy, it lifts out cleanly.
- **Easy Start synergy:** the link-time prompt is exactly the shape the
  future first-run wizard needs (link a library → "who gets it?") —
  building it this way now means the wizard inherits it for free.

## 5 · Gate checklist before writing any code

- [ ] Owner OKs the design (checkbox list in Users panel; per-account
      model; anonymous = full access for v1).
- [ ] Tests (t-block): user with allowlist → library filtered; play of a
      hidden item → 403; poster of a hidden item → 404; guest unchanged;
      admin sees all; user with no list unchanged (backward compat);
      jukebox/search/case-view inherit the filter automatically.
- [ ] Users panel test: the per-account reflection matches the
      libraryAccess map in both directions (edit either door, the other
      updates).
- [ ] PROMPT tests: tick a section → prompt appears; "all" → everyone
      incl. accounts created later; "certain" + pick → unpicked accounts
      get 403 on play; cancel = all (link proceeds); a pre-update
      section stays `all` (upgrade test).
- [ ] New-account rule: account created after a "certain-ones" library
      was linked does NOT see it until added.
- [ ] Caveat #1 (shared TV screen) stated in the release notes honestly.

# RESEARCH — HB↔HB Rung 2 (item-level sharing · offline indicators · browse polish)

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12). Feeds the queue item after the Tailscale on-ramp.
> This one is all OUR code — the research is a code audit, not web research.

## The goal (owner's words, standing rules)

Rung 1 (t97, live): friends' *sections* appear in your store, their media
streams through their machine. Rung 2, per the queue: **item-level share
granularity** (share a single title, not a whole shelf), a **"friend store
offline" indicator**, and **follower-side browse polish** — all without
breaking the standing rules: approval-based, per-friend lists, **no
transitive sharing**, nothing public.

## What exists today (code audit, 2026-09-12)

- `server/lib/friends.js` (131 lines):
  - HOST side: `cfg.friendShare.entries[] = { id, name, token (18-hex), on, sections[] }`.
    `shareableWith(entry, item, friendIds)` → item must be ours (no
    transitive) AND its `sectionKeyOf(item)` in `entry.sections` (empty = all
    our own shelves). **Granularity today = the SECTION, nothing finer.**
  - FOLLOWER side: `cfg.friendStores[] = { id, name, url, token, on }`;
    `fetchFriendCatalog(store)` → 8 s abort timeout, **quiet-fail** (throws;
    caller logs `[fs-1] friend store failed: …` and skips). **No record of
    WHO failed, WHEN, or for how long — that's the offline-indicator gap.**
- `server/lib/library.js`: friend catalogs fold into the library with a
  signature-based cache; a friend's items carry `source: <their store id>`.
- `server/routes/api.js`: `/api/friend/catalog?token=` (the host endpoint),
  `/api/friend/item/…` + stream proxies (token-gated per media request);
  admin PUT validates/merges entries (≤50) and stores (≤24).
- `public/js/ui.js`: My Media → Friends' stores toggles; sections show with
  the friend's label (t88 collision-safe naming).

## Verdicts — every component, yes/no/maybe

| Component | Verdict | Reasoning |
|---|---|---|
| Item-level share lists (schema) | **YES** | Additive: `entry.items = [itemId…]` (cap ~2,000). `shareableWith` order becomes: ours? → if `entry.items?.length` → id must be in it; else section rule; else all. Absent field = exactly today's behavior — old stores and old friends keep working (backward compatible by construction). |
| Item-level share lists (admin UI) | **YES** | The invite editor gains a search box (same pattern as the booth/jukebox music picker, t113/t121) over OUR items with per-title checkboxes; the section checkboxes stay. One screen, no new menu. |
| Item-level on the wire | **YES** | `/api/friend/catalog` already filters item-by-item through `shareableWith` — no protocol change, just finer filtering. Friend-side needs NOTHING new. |
| Offline indicator | **YES** | `fetchFriendCatalog` already knows success/failure — record it: per-store `{ lastOkAt, lastError, lastAttemptAt }` (in-memory map + persisted to a small runtime file so a server restart doesn't forget). Surface via `/api/bootstrap` (`friendStores[].health`) → My Media shows a dot + "last seen 2 h ago" (amber stale / red failed / green live). **Offline ≠ gone**: the cached catalog stays shelved; the indicator says "stale," never silently empties a shelf. |
| Change toasts | **YES** | Poll health on the existing library refresh cadence; toast on state transitions ("Retro Palace went offline"). |
| Browse polish | **YES** | Follower-side sections get the same lazy-row treatment as the booth list when a friend's catalog is big (cap first-chunk rows, load on scroll). Their library sizes are the only unknown — the pattern is proven at 237 rows locally. |
| Per-item streaming revocation | **YES (already works)** | Streams are token-gated per request through the friend's server — revoke the item from the list and the *next* stream request for it fails. Already-queued copies play out; that matches rung-1 semantics. |
| Risks | **MANAGED** | (a) Item ids churn if a friend rebuilds their library — ids embed the source key and are stable per file (same scheme as our own items); prune dead ids on catalog refresh with a UI note. (b) Catalog size: item filtering is O(items × friends) once per cache window — the same cost as today's section filter. (c) UI overload: the picker caps search results, not the schema. |

Nothing here is a NO and nothing is a MAYBE — rung 2 is mechanical work on
structures we already own, with a schema that degrades to today's behavior
when the new fields are absent.

## Proposed structure (NOT implemented)

```
server/lib/friends.js      entry.items rule + health recorder (lastOkAt/err)
server/routes/api.js       /api/bootstrap exposes friendStores[].health;
                           admin PUT accepts items[] (validated, capped)
public/js/ui.js            invite editor: title picker + section boxes;
                           My Media: health dots + stale labels + toasts
public/js/store3d/*        nothing — the 3D side already renders sections
tests/v35.cjs              t122: item-level share (in/out/revocation),
                           health states (live/stale/offline), browse polish
```

## Owner decisions — LOCKED (2026-09-12: "go with your calls")

1. **Admin invite editor only in v1.** The case-view "share this movie"
   button is a follow-up once the schema exists (the design supports it).
2. **Three health states, with WORDS not just colors:** "online" ·
   "last seen 2 h ago" (amber, the important one — a sleeping friend PC
   must read as asleep, not broken) · "offline" (red).

## Gate checklist before writing any code

- [x] ~~Owner picks: case-view share button in v1 or not (Q1).~~ — answered 2026-09-12 (editor only).
- [ ] Confirm the health persistence file rides the existing data dir
      (portable-uninstall doctrine: delete-folder = everything gone).
- [ ] t122 test plan reviewed — item rules must provably NOT leak un-shared
      titles and NOT enable transitive sharing (extend the existing
      t97 noTransitive assertion).

# 📋 RESEARCH — Shelf organization bugs + multi-source spec
> **STATUS: SHIPPED 2026-09-08 (t87+t88).** All five bugs fixed + the
> multi-source spec implemented (instance array, "Nickname · Library" labels,
> per-user toggles, commit-on-change map). Kept for the reasoning.

*Research doc, 2026-09-08. No code changed. Findings from reading
ui.js (panelShelves), shelves.js (sortItems / assignItems), state.js,
config.js (SORT_MODES). Owner's report: "custom was buggy, picking the
categories is as well, mixing them is even worse."*

---

## The five bugs found (all confirmed in code)

### BUG 1 — A mapped section can silently fall back to the mixed shelf
`assignItems` builds section pools from `capped = ordered.slice(0,
TUNING.displayCap)` — only the first N items of the GLOBAL sort order.
If a section's items sit beyond the cap (big libraries + unlucky sort),
or the saved section key went STALE (library renamed, server
reconnected, admin re-added a source), `pools.has(key)` is false → the
"mapped" unit quietly stocks the automatic mix.
**User experience:** "I picked Sci-Fi for the back wall and it's showing
random junk." This is almost certainly the core of "picking the
categories is buggy."
**Fix:** (a) build pools from the UNCAPPED catalogue (cap only the
general pool), (b) detect stale keys at panel-open and show them as
"(no longer available)" with a one-click cleanup, (c) never silently
mix — an empty mapped section should show an "empty shelf" state or
fall back WITH a visible hint in the panel.

### BUG 2 — Preview without save (no cancel path)
Selecting a section fires `ctx.previewShelves(map)` instantly — the 3D
store restocks live. But nothing is SAVED until "Save my shelf map", and
closing the panel doesn't revert. So: close-without-save → scene shows
one arrangement, profile holds another; next reload snaps back.
**User experience:** "it ignores my changes" AND "it keeps changes I
undid" — both, depending on the day. Buggy by any definition.
**Fix (pick one doctrine, recommend the first):**
- **Commit-on-change** — like the sort mode and direction radios
  already work: every select change saves immediately; the Save button
  becomes "Done". Simplest, zero divergence, matches the rest of the
  panel.
- Or: keep preview + add a real Cancel that restores the snapshot.

### BUG 3 — Direction does nothing in 'genre' and 'library' modes
`sortItems` early-returns for both: groups ordered by SIZE, items
alphabetical ASC — `dir` never applies. The Direction dropdown stays
enabled, so the user picks "Ascending", nothing changes.
**Fix:** apply `dir` to group ordering (largest-first vs smallest-first)
and to within-group title order; or disable the dropdown with a hint
("grouping modes ignore direction") until fixed.

### BUG 4 — Genre sort × shelf map = two taxonomies fighting
The map assigns by SECTION (the server's library: "Movies", "TV
Shows"); genre mode sorts by each item's first GENRE. They're orthogonal
axes. A mapped unit's pool inherits the global genre-grouped order, so a
mapped shelf shows genre clusters inside it, while the aisle signs
relabel by genre — contradicting the section the user pinned there.
**User experience:** "mixing them is even worse."
**Fix:** within a MAPPED unit, sort the pool by plain title (or the
mode's within-group comparator), not the global grouped order — the map
wins the taxonomy, the mode wins the order inside it. Plus a hint line
in the panel: "Grouping modes (Genre / By Library) shape the AUTOMATIC
mix; pinned shelves always show their own section."

### BUG 5 — Duplicate section names are indistinguishable
The map's selects show only `sec.name` — two sources with a "Movies"
library render two identical options. Today that's an edge case. The
moment we do the owner's multi-source ask (below), it's guaranteed.
**Fix:** label every option "Instance · Section" (e.g., "Bob's Plex ·
Movies"), which the multi-source work needs anyway.

### Smaller notes (fix while in there)
- Reset writes `unitId: ''` entries instead of deleting keys — harmless
  today, but messy state; make Reset delete keys.
- The map UI rebuilds music groups from ITEMS (good) but video sections
  from `state.sections` — a source with zero items yet listed in
  sections shows a "(0)" option that maps to an empty shelf (see BUG 1's
  fallback fix).

## The multi-source spec (owner: "as many sources of each type as they please")

This is also the foundation for the future library-sharing work — same item.

**Today's shape:** one instance per type — `sources: { plex: {url, token,
sections}, jellyfin: {...}, archive: {...} }`.

**Proposed shape:** an ARRAY of instances, each self-describing:
```
sources: [
  { id: 'plex-bob',   kind: 'plex',     name: "Bob's Plex",   url, token, sections, enabled: true },
  { id: 'plex-alice', kind: 'plex',     name: "Alice's Plex", url, token, sections, enabled: true },
  { id: 'jf-uncle',   kind: 'jellyfin', name: "Uncle's JF",   url, key,   sections, enabled: false },
  { id: 'free-arc',   kind: 'archive',  name: 'Free shelves', sections }
]
```
**What it touches (impact map):**
- server config + admin UI: source cards become add/edit/remove per
  instance; "Test connection" per instance.
- adapters: instantiated per source (they're already modular; the
  registry keyed by instance id).
- item identity: `item.source` becomes instance id (not bare 'plex');
  section keys namespaced `plex-bob:3` — the shelf map and prefs
  SURVIVE an instance being reordered/edit-renamed.
- "By Library" grouping + shelf-map labels: "Instance · Section" (BUG 5's
  fix, done once).
- per-user source toggles (My Media): prefs.sources keyed by instance id
  — the UI lists instances with their names.
- bootstrap/prefs backward compatibility: migrate old single-instance
  config → one array entry on first read (id: 'plex', name: 'Plex').
- suite: new checks (two plex instances, per-user opt-out of one,
  shelf-map labels distinct).

**Effort:** ~1–1.5 sessions on its own, and it should land BEFORE the
shelf-map bug fixes where labels are involved (so we fix labels once).

## Suggested session order

1. Multi-source (foundation; includes BUG 5's labels) — ~1–1.5 sessions
2. Shelf-map bug pass (BUG 1–4 + commit-on-change doctrine) — ~1 session
3. Suite updates riding each session (not separate)

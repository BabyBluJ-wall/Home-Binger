# 📡 TCC — The CordCut Co-op · Master Plan

> 🔒 **CONFIDENTIAL — workspace-only until the owner announces TCC.**
> Do NOT upload this file to the public repo. Same for ROADMAP.md and
> CHANGELOG.md (both carry TCC entries) until the owner lifts the hold.
> **Publish gate (owner, 2026-09-07): TCC stays private until the
> HB ↔ HB connection (Phase C, the Follow Link) is figured out and working.**

*Master plan v2 (2026-09-07) — merges the founder's original TCC pitch
verbatim with the Home Binger federation design.*

---

## 1 · The vision (founder's words, kept)

> The CordCut Co-op is a community-run media server. One shared library of
> movies, music, TV, and audiobooks — built from the collections we already
> own — streamed privately to any device, anywhere in the world.
> "CordCut" is the promise. "Co-op" is the method. We own it together.
> No customers, no corporation. Just us.

Core doctrine (owner, non-negotiable): **security, privacy, ownership.**
No port forwarding — ever. Nothing exposed to the public internet.

## 2 · The architecture: two layers, one co-op

The original pitch described a jointly-funded central library. Today's HB
design is a federation of equals. **Both are right — they're different
layers:**

### Layer 1 — The Federation (the face & the plumbing) · $0 software
Every member runs their own **Home Binger** on their own machine. Your
store is yours; you follow the people you choose; you publish only the
folders you tick, per follower. Connective tissue: one shared **ZeroTier
virtual LAN** (free: 10 devices / 1 network per center — pricing rechecked 2026-09-09, was 25 before the 2025–26 restructure; self-hosted controller lifts it) — no member ever opens a
port, nothing is publicly reachable, streams flow directly member-to-member
encrypted. Members' existing **Plex/Jellyfin** servers plug in as sources.
The founder's always-on PC is simply the most reliable node — his content,
24/7.

### Layer 2 — The Hearth (the pitch's long-term promise) · **DEFERRED — growth stage only**
The pitch's dues-funded shared server (24/7 core collection, archival
redundancy, solar + battery). **NOT part of v1.** The owner's call
(2026-09-07): if the co-op grows into wanting shared infrastructure, the
hearth — and the $15/mo that funds parts, electricity, and digitizing
time — enters then, with its own decision round. Until that day:
- every member manages their own node — own parts, own electricity,
  own digitizing (the Phase E guide is self-service)
- the founder's planned always-on PC is just his own reliable node —
  not a co-op service, not dues-funded
- each member's media safety = their own backups (the Phase E guide
  includes a backup recommendation)

Federation alone can't keep the pitch's archival/always-on promises —
which is exactly why those promises are explicitly DEFERRED with the
hearth, not quietly assumed at launch. The launch model owes nothing
it isn't delivering.

## 3 · Pitch → plan traceability (every promise has an owner)

| The pitch promises | Delivered by |
|---|---|
| "One shared library… for everyone" | Federation follow links (C) + multi-source shelves (B) — mixed shelves already exist in HB today |
| "Streamed privately to any device, anywhere" | Shared virtual LAN (A) — phones included, works from any network on earth |
| "Members contribute the media they own" | Per-follower publish folders (C) + the self-serve digitization guide (E) |
| "We fund the hardware together · $15/mo" | The Hearth (F) — **growth stage, deferred**; v1: everyone self-funds their own node |
| "Everyone streams free" | HB's proxy streaming — already built, credentials never leave the server |
| "No ads, no tracking, no 'left the library'" | 100% self-hosted, zero third parties — already true |
| "We archive your collection… redundancy" | Hearth drives (F) — **deferred**; until then each member's own backups (E guide) |
| "Solar + battery backup" | Hearth (F, phase 2) — **deferred** |
| "A voice in the co-op" | Founder-run at v1; formalize as the co-op grows (out of software scope) |
| "Audiobooks" | HB's Book Nook (existing HB Phase 2 — the roadmaps interlock) |
| "Private, encrypted, members-only" | Enforced architecturally: no public endpoints exist at all, approval-based follows, no transitive sharing |

## 4 · Phases (merged roadmap, DLC still last overall)

- **TCC-A · Co-op LAN + hardening** (~1 session): stand up the shared
  network, member onboarding guide, login rate-limiting + sign-in audit
  log + admin-route strictness (defense-in-depth; nothing is public).
- **TCC-B · Many remote Plex/Jellyfin libraries** (~1–2): sources become a
  list — "Bob's Plex, Alice's Jellyfin" — owner-labeled on shelves,
  per-user opt-out, one-click revocation. Members who already run Jellyfin
  join day one.
- **TCC-C · The Follow Link (HB ↔ HB)** (~2–3) — **the big one and the
  publish gate**: discovery on the co-op LAN, approval-based follow
  requests, per-follower publish lists, catalog sync with owner labels,
  direct proxy streaming (your HB → their HB), offline-member shelves
  ("Bob — offline", not an error), reconnect handling. **Decided rules:
  every follower individually approved; share lists chosen per follower;
  NO transitive sharing — content never hops; a stream only flows from
  its owner to a follower the owner approved.**
- **TCC-D · The TCC face + grabber previews** (~1): optional TCC skin,
  browser-side thumbnails for local grabs (video seek → canvas → poster
  cache; music gets theme art).
- **TCC-E · Digitization guide (self-service)** (~1): a member-facing
  guide, not a co-op service — each member digitizes their OWN media:
  CDs → FLAC (clean case); DVDs/Blu-rays → MakeMKV/Handbrake (the gray
  zone the pitch honestly acknowledges); naming + quality conventions;
  backup recommendation. Written once, every member follows it themselves.
- **TCC-F · The Hearth** (DEFERRED — growth stage, ~1 + hardware lead
  time if triggered): enters only if the co-op grows into wanting shared
  always-on infrastructure — dues-funded dedicated box (HB + mirrored
  storage), archive workflow, uptime plan; v2 = solar/battery. Comes with
  its own decision round: whether to do it at all, the dues model, and
  the entity/legal review that recurring money implies.
- **Interlocks with HB's own queue:** tester-fix wave first; booth
  sweetening and Book Nook slot between TCC phases (Book Nook IS the
  audiobooks promise); itch.io page late; **DLC last** (standing order).

Suggested running order: A → B → D → C (gate passes → TCC can go public)
→ E (self-serve guide). F stays parked unless the co-op votes it in.

## 5 · The trust & legal doctrine (from the pitch, kept verbatim in spirit)

- Only media members **legally own** — purchased DVDs, CDs, digital buys.
- **Private, closed, members-only** — never public, never sold.
- Dues fund **hardware, storage, power** — never content.
- Free, legal, open-source software only (HB itself + members' Jellyfin).
- The lines we do not cross: no downloading media we don't own, no public
  access, no charging for content.
- Engineering note: the federation design enforces the privacy promises
  *architecturally* — there is no public endpoint to leak, and every
  stream requires the owner's explicit approval. The architecture is the
  best legal defense: nothing to find, nothing to sell, nothing shared
  beyond approved friends.
- **IP posture (set 2026-09-07):** the CONTENT (pitch, plan, code, art)
  is © BluJ Productions automatically on creation — ownership needs no
  registration (US registration, $45, is only required before suing
  someone; the "mail it to yourself" trick is folklore — the real
  evidence trail is these dated docs + git history). The NAME is
  trademark territory, not copyright: ™ is free common-law from first
  public use; federal ® (~$250–350/class + months + genuine use in
  commerce) is deferred until public/commercial. Name scan 2026-09-07
  (casual): no existing "CordCut Co-op" brand found; "cord cutter" is
  generic industry vocabulary (Cord Cutters News, cordcutting.org…) so
  "CordCut" alone is unprotectable — the FULL phrase "The CordCut
  Co-op" is the mark. Formal USPTO knockout search before launch.
- **Other law buckets, mapped:** **CDs** are the clean case — no
  encryption, personal ripping to FLAC is well-trodden. **DVDs/Blu-rays**
  are the gray zone for a DIFFERENT reason than copying: ripping breaks
  CSS/AACS encryption, which touches DMCA anti-circumvention. **Bought
  digital files:** never strip DRM. Phase E follows this ladder
  (clean → gray → don't). **Privacy law:** HB collects nothing — no
  watch-history analytics, no telemetry, no third parties — so there is
  no behavioral data to leak or comply with; keeping it that way is
  doctrine (no analytics, ever). **Money at scale:** casual cost-sharing
  among friends needs no paperwork, but recurring dues past a small
  group eventually want a real entity (co-op or nonprofit LLC) to
  protect the founder personally — a growth-stage item on the TCC-F
  checklist, not a launch blocker.
- Founder's pitch text (verbatim, for the future landing page) is
  preserved in §7 below.

## 6 · Founder decisions log

1. ✅ TCC is the umbrella; HB is its face. Queues merge.
2. ✅ Federated membership — everyone curates from the people they select.
3. ✅ Always-on PC: founder's, as hearth v0.
4. ✅ Follows are approval-based; share lists are per-follower; no
   transitive sharing (the "private collection" case).
5. ✅ TCC stays confidential until the Follow Link works (publish gate).
6. ✅ DECIDED (owner, 2026-09-07, revised): **v1 has NO dues at all.**
   The launch model is pure federation — every member self-manages their
   own node: own parts, own electricity, own digitizing. Joining the
   mesh is free (the software is free; everyone carries their own costs).
   **Dues arrive only WITH the hearth, if the co-op ever grows into it** —
   and if that day comes: uniform $15/household, infrastructure-only
   (never content-scaled, no tiers), founder pays too, entity/legal
   review first. (The earlier "no free tier" ruling answered a question
   that doesn't exist at v1 — superseded. The reasoning is parked inside
   the future hearth decision, where it belongs.)
   Legal side effect: with zero money flowing between members, v1 is
   pure reciprocal sharing among self-sufficient friends — the cleanest
   posture possible; no customer/service shape exists anywhere.
7. **OPEN:** Hearth hardware spec + exact dues math (at TCC-F time).
8. **OPEN:** Follow-request UX details (at TCC-C build time).

## 7 · Founder's pitch (verbatim archive, 2026-09-07)

> **The CordCut Co-op (TCC) — Cut the cord for good.**
> You're paying $50–70 a month for Netflix, Spotify, Disney+, and the
> rest. Every year that's $600–800 — for content you don't own, that can
> vanish overnight, with ads creeping in and prices climbing.
>
> **What if it cost less — and you owned the library?**
> The CordCut Co-op is a community-run media server. One shared library
> of movies, music, TV, and audiobooks — built from the collections we
> already own — streamed privately to any device, anywhere in the world.
>
> **"CordCut" is the promise — freedom from subscriptions. "Co-op" is the
> method — we own it together. No customers, no corporation. Just us.**
>
> How it works: (1) Members contribute the media they own — DVDs, CDs,
> digital purchases. Every new member grows the library for everyone.
> (2) We fund the hardware together — a simple monthly contribution
> covers the server, storage, and power. (3) Everyone streams free
> through a private, encrypted connection. No ads, no tracking, no
> "this title has left the library."
>
> **The cost: $15 a month. That's it.** Covers: server hardware and
> upkeep; new storage drives as the library grows; electricity to keep it
> running 24/7; future upgrades including solar + battery backup. You
> get: the full library on any device; a private encrypted connection
> from anywhere; and a voice in the co-op — this is ours, not a
> company's. Why it beats what you have now: save $35–55 every month;
> ownership (no corporation can delete a movie or pull a song); privacy
> (no one tracks what you watch); it grows with you (bring a drive,
> bring your collection); community, not subscription — you're a
> co-owner, not a customer.
>
> **Your media, protected — not just streamed.** We archive your
> collection: contributed DVDs, CDs and files are digitized and
> preserved, so media survives scratched/lost originals. Built-in
> redundancy across multiple drives. Built to stay online — solar +
> battery backup in the plan. The goal: a library that outlasts any
> single hard drive, any power outage, and any corporation's decision
> to delete what you paid for.
>
> **The honest fine print.** This is for media each member legally owns.
> It's a co-op, not a service — contributions keep the lights on and the
> library growing, nothing more.
>
> **On copyright (the founder's note):** we're not building a piracy
> service. We only digitize media members already own; it's a private,
> members-only library — the digital equivalent of friends lending each
> other movies and albums they bought; no one is selling access to
> content (the $15 covers hardware/storage/electricity, like chipping in
> for gas on a road trip); we use free, legal, open-source software.
> Honest limits: format-shifting sits in a gray area in some places —
> the risk is dramatically lower than piracy, and the lines we will not
> cross are: downloading media we don't own, opening the library to the
> public, or charging for the content itself. As designed, this is the
> responsible way to do it. Royalties apply to selling or public
> performance — neither is happening here.

---

*v2 merges: founder's pitch (§7) + the Home Binger federation design +
follow-model decisions. Owners of the two new phases: E digitization,
F hearth. DLC remains last on the overall roadmap (standing order).*

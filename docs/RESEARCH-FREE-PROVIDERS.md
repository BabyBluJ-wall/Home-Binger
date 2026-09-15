# RESEARCH — Free Providers (the "free section" deep search)

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12). Owner asks: *"Scholastic has a free streaming app
> to potentially add … I also want another deep search into other possible
> providers that we could grab from for free with no payment."*

## The bar a provider must clear

Free to STREAM in their own app ≠ free for Home Binger to serve. A
provider qualifies only if ALL of these hold: **(1)** no payment, **(2)**
no account/registration, **(3)** a legal access path (public API or public
domain), **(4)** content license permits re-serving to a household (public
domain / permissive CC), **(5)** survives our zero-dependency proxy
doctrine (same pattern as the existing archive/radio/podcast adapters).

## Scholastic — the specific suggestion: **NO**

- **Their free app is gone.** Scholastic Home Base — the free app people
  mean — **shut down November 4, 2025** ("no longer available on our
  website, app stores, or for download"). Nothing to integrate.
- **It wasn't a media catalog anyway** — a kids' virtual-world game with
  book excerpts and moderated chat.
- **Their actual video products (BookFlix, Watch & Learn Library, the
  *Flix family) are copyrighted school-licensed subscriptions** — no
  public API, terms forbid redistribution. "Free to watch in their app"
  never transfers to us.
- **The one legal Scholastic path that exists today:** if Scholastic
  publishes any public podcast feed (they have made shows like "Scholastic
  Reads"), our existing RSS podcast system can add it in Admin with ZERO
  code. Verify the feed URL at implementation time. And for kids' content
  generally, the legal free lane is public-domain kids' books/audio —
  which LibriVox (below) delivers by the thousands.

## What's ALREADY in (code audit — good news)

- **Internet Archive** — the film shelves (public domain, API).
- **Radio-Browser** — surprise finding: the "world radio wall" ALREADY
  runs on the community radio-browser.info database (6 genre buttons ×
  8 upvoted stations, proxied). So "add thousands of free stations" is
  not a new provider — it's an UPGRADE to a source we ship (cheapest win
  on this list: let the owner pick genres instead of our 6 hardcoded).
- **Any RSS podcast feed** — already addable by the admin, zero code.

## The deep-search verdicts (all sources checked 2026-09-12)

| Provider | What it is | Verdict | Why |
|---|---|---|---|
| **LibriVox** | ~20,000 volunteer-read public-domain audiobooks | **YES — the star** | Public API verified: `librivox.org/api/feed/audiobooks` (JSON, no auth, no account, paging, genre/author/title search, cover art flag). Content is public domain — stream/download/share freely. Free forever, no ads. Maps to our adapter pattern exactly (sections = genres; registry-gated stream URLs; proxy doctrine). Audiobooks are a whole NEW content type for the jukebox. |
| **Radio-Browser upgrade** | 45,000+ stations (already our radio source) | **YES — cheapest** | Public-domain data, open API, no key, CORS, mirror DNS. Upgrade = owner-selectable genre tags + more stations per genre, instead of 6 hardcoded buttons. |
| **Library of Congress — National Screening Room** | Public-domain films, downloadable MP4s | **YES (gate-verify the API)** | PD movies, free downloads. LoC publishes a public JSON API (loc.gov) — endpoints + rate limits to be verified live before building the adapter. Pairs beautifully with the existing archive film shelves. |
| **NASA media** | Public-domain space video/audio/images | **YES (with rules)** | US-government works = public domain. NASA has real public APIs (images API). Two rules: attribute NASA, and never imply endorsement (no logo-forward branding). A "Space" section is a natural shelf. |
| **Wikimedia Commons** | CC/public-domain video corpus | **YES-ish (biggest curation problem)** | Real API, permissive licenses, no account. Caveat: hit-or-miss cataloging — needs a curated entry query, not a firehose. |
| **National Park Service B-roll** | Public-domain nature footage | **MAYBE** | Genuinely PD, but it's webpage-driven with no clean API — scraping pages is fragile. Only if someone wants it badly. |
| **TED Talks** | CC BY-NC-ND talk videos | **MAYBE** | License fits a non-commercial household app; API access has changed over the years — verify current terms before any work. |
| **Jamendo** | CC-licensed indie music | **MAYBE** | Free tier exists but requires a registered API key — technically $0 but breaks the "no account" cleanliness bar. Only if music demand is real. |
| Pond5 Public Domain Project | PD footage clips | **NO** | Requires creating an account — fails bar #2. |
| Kanopy / Hoopla | Big-studio films "free with a library card" | **NO** | No public API; terms restrict to their apps; needs a US library card. Not ours to re-serve. |
| Tubi / Pluto TV / Crackle / Plex free channels | Ad-supported commercial streaming | **NO** | Free to watch, but no public APIs and re-serving breaks their terms (and strips the ads that pay for it). |
| YouTube / Vimeo extraction | Everything | **NO** | Extracting streams violates the platforms' terms; HB stays out of that gray zone (consistent with the no-piracy posture). |

## Recommended order (all additive — can slot between the big queue items)

**UPDATED 2026-09-12 — owner decision:** "I want to wait before adding
anything book wise. Podcasts are ok for my due to some having a video
version and an audio version."

1. **Radio genre picker** (upgrade the source we already ship — smallest
   possible change, immediately felt).
2. **Podcasts stay green as-is** — already shipped, owner reaffirmed: OK
   partly because some shows come in both a video and an audio version.
3. **LoC National Screening Room** (more PD films for the shelves).
4. **NASA "Space" section** (crowd-pleaser; attribution + no-endorsement
   rules in the adapter).
5. ~~LibriVox audiobooks~~ **PARKED by the owner (2026-09-12): "wait before
   adding anything book wise."** The research stands (API verified, public
   domain, maps to our adapter pattern) — it is deferred, not dead. Revisit
   when the owner reopens book-type content.

## Gate checklist before writing any code

- [ ] Live-test each chosen API from a clean box (endpoints, rate limits,
      pagination, uptime).
- [ ] License spot-check per source (PD assertions on IA-style catalogs
      are uploader-claimed — same discernment note the archive adapter
      already carries).
- [ ] NASA: attribution line + no-endorsement wording baked into the
      adapter, not bolted on.
- [ ] Each provider = its own adapter + its own t-block test (proxy
      gating, no open-proxy abuse, cache behavior) — same standard as
      t93's multi-source work.
- [x] Owner picks which to green-light — **radio genre picker is the
      recommendation; LibriVox parked by owner decision above.** (Owner
      confirmation of the radio-first order still pending.)


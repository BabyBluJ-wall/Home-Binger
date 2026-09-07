# 💿 DLC Pack System — the protection + integration plan

*Designed 2026-09-06 for the owner's commercial music packs. Companion to
ROADMAP Phase 4. Every piece uses Node BUILT-INS only — the zero-dependency
doctrine holds.*

## The honest threat model (read this first)

**No local app can achieve perfect DRM.** If the app can play the media, a
determined attacker with full control of their machine can capture it
(audio loopback, network sniff on localhost, memory inspection). Spotify,
Steam games, and every local-media product accepts this residual risk.

What we CAN do — and what this design does — is **kill every casual path**:

- ❌ No song/video **files** ever exist on the buyer's disk — not in
  Music/, not in Temp, not in cache. One opaque encrypted blob.
- ❌ Renaming/copying/sharing the blob is useless without a per-buyer
  **signed license**.
- ❌ Nothing to browse, nothing to drag into a player, nothing findable.

That converts "share my whole album folder" (trivial today) into "run a
custom decryption + capture pipeline" (99.9% of people will never).

## The .hbd pack format (Home Binger DLC)

One file, `packname.hbd`:

```
[header]    magic "HBD1" · version · manifest length
[manifest]  JSON, PLAINTEXT: pack name, cover art, item index
            (titles, artists, durations, byte offsets, lengths, checksums),
            room theme (signage text, colors, credit line)
[media]     every track's bytes, encrypted with AES-256-CTR
            (CTR = seekable: byte-range decrypt makes HTTP Range streaming
             instant — our whole media pipeline depends on this)
[license]   (separate small file, `packname.hbl`)
            the AES key for the pack + buyer ID, SIGNED with the owner's
            Ed25519 private key; the app verifies with the built-in public
            key. No server, no phone-home, fully offline.
```

Why these choices:

- **AES-256-CTR** (Node `crypto` builtin): stream-decrypts at hundreds of
  MB/s, and being a stream cipher it can jump to any byte offset — Range
  requests (seek/pause/resume in the theater and jukebox) work exactly as
  they do for plain files.
- **Ed25519-signed license** (also builtin): the app never trusts the pack,
  only the signature. You hand out a license per purchase; a pack copied
  without its license is a paperweight. You can sign on your PC with one
  command; no infrastructure ever.
- **Plaintext manifest**: titles/art are the shop window — buyers see what
  they own; the goods stay sealed.

## Integration with what we already have

1. **New server adapter — `server/lib/adapters/pack.js`** (sibling of the
   local/plex/jellyfin/archive adapters):
   - scans a `packs/` folder for `.hbd` + verifies each license signature
   - exposes items through the EXISTING library API (source: `pack`)
   - `/api/play/pack/<item>` streams decrypted ranges — same contract as
     every other source, so **the jukebox, DJ decks, and theater play pack
     media with zero client changes**
2. **Room dressing (the Phase 4 visual)**: the manifest's theme block feeds
   the pack wing — signage, shelf styling, gold-record wall from the
   manifest's credit/art. A pack doesn't just "add songs"; it dresses its
   own aisle in the building.
3. **Buyer flow**: buy on itch/Gumroad → get `pack.hbd` + `license.hbl` →
   drop both into the app's `packs/` folder (or Settings → "Add DLC") →
   the wing lights up. No accounts, no online check.

## Owner-side tooling

`tools/build-dlc.mjs` (to be built):

```
node tools/build-dlc.mjs "D:/MyMusic/Vol1" --name "BluJ Vol. 1" \
     --art cover.jpg --out vol1.hbd
node tools/sign-dlc.mjs vol1.hbd --buyer "order-12345"        # → vol1.hbl
```

Encrypts, indexes, embeds art/theme, and produces the sellable blob.
Signing a buyer's license is one command (or automated later via
Gumroad/itch key-gen webhooks — optional, not required).

## What this does NOT protect (the line, stated plainly)

- A determined buyer capturing the decrypted stream on their own machine
  (industry-accepted residual risk; same class as Spotify/Steam).
- Screen-recording the app (same as recording any player).
- Us publishing your music in the repo/zips — already handled:
  `tests/media/` and packs are git-ignored and zip-excluded.

## Build order (when we start Phase 4)

1. Pack writer + reader (format above) + round-trip tests — ~1 session
2. `pack` adapter + Range streaming + suite checks (pack items play in
   jukebox AND theater; license refusal without signature) — ~1 session
3. Buyer license signing tooling + Settings "Add DLC" UX — ~1 session
4. Wing dressing from manifest theme — ~1 session (the fun one)
5. Pilot: your 113 MB folder becomes `vol1.hbd`; we test the whole loop

*Estimated: 3–4 focused sessions end-to-end, fully testable in-sandbox.*

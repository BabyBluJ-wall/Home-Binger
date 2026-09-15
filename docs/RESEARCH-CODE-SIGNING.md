# RESEARCH — Code Signing: making Windows stop flagging Home Binger

**Owner ask (2026-09-12):** "i kinda want windows to stop flagging the program as
possibly harmful having to click more info just to click run anyway."

Research-only doc, same doctrine as the others: verdicts before any code.
**Nothing below is implemented** — the desktop build's signing step is designed
here but stays unwritten until the owner picks a paid path (or decides to stay
free).

---

## 1 · What is actually happening when Windows flags the program

Two DIFFERENT warnings get confused constantly, and they have different fixes:

| Warning | What it asks | What fixes it |
|---|---|---|
| **"Unknown Publisher"** (the UAC/properties prompt) | *Who* made this file? | A code-signing certificate — fixes it **immediately**, forever |
| **SmartScreen "Windows protected your PC"** (the blue full-screen, "More info → Run anyway" one — the owner's complaint) | Is this exact file *known-good* yet? | **Nothing you can buy.** Reputation = real downloads + time. A certificate only changes the trajectory |

What a signature actually buys:

- The warning screen shows your verified name instead of "Unknown publisher".
- Reputation accrues to the **certificate** and **compounds across releases**.
- Unsigned files accrue reputation per file-hash only → **every new release
  restarts at zero forever.** (Microsoft's own docs say this.)

## 2 · The 2024/2026 reality check (this changed the whole market)

- **EV certificates no longer skip SmartScreen.** Microsoft removed the
  instant-reputation benefit in 2024. As of 2026 Microsoft's docs list EV and
  OV as identical for SmartScreen. Anyone selling "EV = no warning" is selling
  yesterday's behavior. EV still matters for kernel drivers — irrelevant to us.
- Reputation timelines (per Microsoft + publisher reports): signed apps with
  steady download volume typically clear in **days to a few weeks**; small-
  audience apps can take **weeks to months**. Unsigned: never durably.
- There is **no paid fast lane**. The one free lever: submit the flagged file
  to Microsoft's Security Intelligence portal as the developer (with SHA-256 +
  download URL) — analysts can adjust reputation ahead of the organic curve.
  Free, not guaranteed, per-release.
- Files run from a USB stick or LAN share usually carry no "Mark of the Web"
  → no SmartScreen check at all. Browser-downloaded files always carry it.
  (Note for the friend path: friends downloading over the tailnet still get
  the warning — it's still a browser download.)

## 3 · What is flagged in OUR case

- **`HomeBinger.exe`** (the desktop build): unsigned Electron exe → the full
  SmartScreen screen on every fresh download. THE main complaint.
- **`.bat` files** (`START-WITH-NODE.bat`, `start.bat`, the future invite
  script): **batch files cannot be Authenticode-signed at all.** No certificate
  of any price changes how Windows treats them. The invite flow's
  "More info → Run anyway" note (already in the on-ramp doc) is permanent
  unless the invite eventually becomes a signed `.exe` helper.

## 4 · Verdict table (researched 2026-09-12)

| Path | Cost | Verdict | Why |
|---|---|---|---|
| Do nothing + free MS submission per release | $0 | **baseline (weak)** | Warning stays; submissions may speed clearing; the "More info → Run anyway" line stays in START-HERE |
| **SignPath Foundation** (free OSS signing) | $0 | **NO — INELIGIBLE** | Requires an **OSI-approved open-source license**; Home Binger's license is CC BY-NC-SA 4.0 (NonCommercial ≠ open source by OSI rules). Also requires CI-built binaries, a published signing policy, and manual approval of every signing request — a process overhaul for a non-technical owner |
| **Azure Trusted Signing** (aka Azure Artifact Signing) | ~$9.99/mo (~$120/yr), Basic tier | **YES if paying — first choice** | US individuals are eligible (owner is US); Microsoft-native; no USB token, no key handling; signs via cloud API/GitHub Action; publisher name shown; SmartScreen reputation builds the normal way |
| **Certum Individual OV "in the Cloud"** (SimplySign) | ~$115–167/yr (reseller; direct ~€209) | **YES if paying — second choice** | Cheapest traditional cert that works with plain `signtool` on the owner's machine; cloud "virtual smart card" = no USB token; individual OV available; 3–5 day identity validation |
| SSL.com OV | $129/yr **+** eSigner $180/yr or YubiKey $249 | MAYBE — dominated | Works, but total cost beats Certum/Azure for the same SmartScreen outcome |
| Any EV certificate | $226–749/yr | **NO** | Instant-bypass removed in 2024. Costs more for zero SmartScreen benefit |
| Self-signed certificate | $0 | **NO** | Only trusted on machines where you manually install your own root — useless for friends |
| **Microsoft Store (MSIX)** | signing free; individual dev account ~$19 one-time | **PARKED — the only zero-warning endgame** | Store-signed apps carry no SmartScreen prompt at all, and "get it from the Store" is the simplest possible friend install. Costs: MSIX packaging, store certification review per release, and a distribution-model change (today: GitHub releases + zips). Revisit when the Friends Update makes friend-install simplicity the top priority |

## 5 · Owner decision — LOCKED (2026-09-12): STAY $0

Owner: "Im obviously not paying as im a broke bitch."

- **No certificate, no signing service.** The exe stays unsigned; the
  SmartScreen "More info → Run anyway" screen stays on fresh downloads.
- The free lever we DO use: submit each release's exe to Microsoft's
  Security Intelligence portal (free, ~5 min, per release) — analysts
  can clear the warning ahead of the organic curve. Not guaranteed.
- START-HERE's click-through note stays (it already walks users through
  the screen).
- §6's optional signing step in build-desktop.mjs stays UNWRITTEN. If
  the budget ever changes, Azure Trusted Signing is the first choice.
- Microsoft Store stays parked (would also change how HB is distributed).

## 6 · What signing would mean for OUR build (design only — not implemented)

- One optional step at the end of `tools/build-desktop.mjs`, env-gated, e.g.
  `HB_SIGN=1 node tools/build-desktop.mjs`:
  - Azure path: their signtool extension / GitHub Action signs the exe in the
    cloud (needs an Azure account + identity validation once).
  - Certum path: `signtool sign /fd SHA256 /tr <RFC-3161 timestamp URL>
    /td SHA256 HomeBinger.exe` with the SimplySign cloud card present —
    signs on the owner's machine, no pipeline needed.
- **Always timestamp** (RFC 3161). Without it the signature dies when the
  certificate expires. Azure's 3-day certificates make timestamping
  non-negotiable there.
- Sign exactly one artifact: `HomeBinger.exe`. (The portable zip needs
  nothing else; the Tailscale MSI is already signed by Tailscale.)
- Default build flow (no env var) stays byte-identical to today — a friend
  or the owner building without credentials notices no difference.

## 7 · Gate checklist — CLOSED ($0 path chosen, nothing to implement)

- [x] Owner picked a path: **$0 — stay unsigned** (2026-09-12).
- [n/a] Azure / Certum steps — not taken (no purchase).
- [x] Nothing new to verify on a clean box: the warning appears on fresh
      downloads, and START-HERE already explains the click-through.
- [x] Honest expectation recorded: the warning only fades with downloads
      + time, and every new unsigned release restarts at zero (per-file
      reputation). The free Microsoft submission per release is the only
      accelerator we have.

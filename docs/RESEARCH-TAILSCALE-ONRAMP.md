# RESEARCH — Tailscale On-Ramp (one-click-ish remote access for friends)

> Status: **RESEARCH COMPLETE — structure only, nothing implemented** (owner
> doctrine, 2026-09-12: "dont implement until we fully know that it will all
> work. i dont guess i research to know yes no or maybe.")
> Feeds the queue item: *Tailscale on-ramp → HB↔HB rung 2 → watch party.*

## The goal

Today a far-away friend needs ~7 manual steps (install Tailscale, make an
account, log in, join, find the MagicDNS name, type it in a browser). The
on-ramp turns that into: **the owner clicks "invite" in Admin, sends the
friend one file, the friend runs it, clicks ONE UAC prompt, and their
browser opens on the store.**

## What exists today (code audit, 2026-09-12)

- `tailscale-setup.exe` ships inside the exe zip (unmodified official
  installer, 1,394,992 B) + `docs/REMOTE-ACCESS.md` (the manual 7-step guide).
- HB binds `0.0.0.0:8181` — reachable over a tailnet with zero changes.
- No HB code touches Tailscale in any way (installer is user-run, optional).
- Doctrine constraints that bind this design: **no port forwarding, no
  Funnel, nothing public** (owner, standing). $0 budget. Zero npm deps.

## Research findings (verified against sources, not guessed)

| # | Question | Verdict | Evidence |
|---|---|---|---|
| 1 | Can a device join the owner's tailnet with NO browser login? | **YES** | Tailscale pre-auth keys (kb/1085): `tailscale up --authkey=tskey-…` registers the node directly. Terraform registry docs confirm key options: `reusable`, `ephemeral`, `preauthorized`, `expiry`. |
| 2 | Do friends consume Tailscale paid seats? | **NO — free** | Tailscale Personal plan (2026 pricing): 6 users, **unlimited user devices**. A node joined with the owner's auth key belongs to the owner's user — friends' machines count as the owner's devices, not seats. Seats only count people who authenticate their own identity. |
| 3 | Can the install be silent? | **YES — via the MSI, not the exe** | `msiexec /qn` with MSI properties `TS_NOLAUNCH=1`, `TS_UNATTENDEDMODE=always`, `TS_ONBOARDING_FLOW=hide`, `TS_ADMINCONSOLE=hide` (reference: MacsInSpace/tailscale-silent-installer). That project **deliberately avoids the tailscale-setup.exe self-extractor** ("known issues with the self-extracting engine on some systems") — so the joiner downloads/uses the plain `tailscale-setup-<ver>-amd64.msi` from pkgs.tailscale.com. Our bundled exe stays for manual installs. |
| 4 | Does it survive reboots / no user login? | **YES** | `tailscale up --unattended` (Windows-only flag) keeps the service running at boot without interactive login. |
| 5 | Known failure modes? | **ONE, mitigable** | `tailscale up` can hang after an MSI install with `TS_NOLAUNCH` (tailscale issue #16086 — service still "Starting"). Mitigations: wait for the service to report Running, and pass `--timeout=<dur>` (documented flag) so `up` can never hang forever. Exit code 3010 = reboot wanted (warn, don't force). |
| 6 | Can friend devices be LOCKED to only the store? | **MAYBE — two tiers** | Personal plans include ACLs (3 ACL groups). BUT auth-key devices belong to the *owner's user*, and ACLs match on user/tag — not "which of the owner's laptops." So a plain-key friend can reach every device on the tailnet. **Tier 2 fix:** join friends with a *tagged* pre-auth key (e.g. `tag:hb-guest`), then one ACL rule allows `tag:hb-guest → host:8181` only. Tagged resources: 50 free — far more than any friend group. Must be confirmed live at implementation time (tagged keys are created in the console; behavior with `--unattended` to verify on a real box). |
| 7 | Can HB show the owner their MagicDNS URL? | **YES** | Server-side `tailscale status --json` (spawn the CLI; plain node, no deps) exposes the tailnet's MagicDNS name + this machine's IPs. Show it in the admin panel; today the owner has to find it themselves. |
| 8 | Revocation? | **YES** | Delete the auth key (console) and/or remove the device → the friend's tunnel dies immediately. HB-side: the friend's HB *account* still gates what they see (approval-based, existing doctrine). Defense in depth. |
| 9 | Does the friend need a Tailscale account at all? | **NO** (auth-key model) / **YES** (node-share model) | kb/1084 node-sharing requires the invitee's own account (they join *their* tailnet and see the shared node). The auth-key model needs no friend account — fewer steps, which is why it wins for non-technical friends. Trade-off: their device lives on the owner's tailnet (see #6). |

**Sources:** tailscale.com/kb/1085 (auth keys) · kb/1084 (sharing) ·
tailscale.com/docs/reference/tailscale-cli/up (flags, verified Jan 2026) ·
tailscale.com/changelog (`--auth-key`/`--authkey` both accepted) ·
github.com/tailscale/tailscale/issues/16086 (the NOLAUNCH hang) ·
github.com/MacsInSpace/tailscale-silent-installer (MSI property table) ·
2026 pricing pages (ssdnodes.com/learn/is-tailscale-free-plan-limits,
codingprotocols.com — Personal = 6 users / unlimited user devices /
50 tagged resources). All checked 2026-09-12.

## Proposed structure (NOT implemented)

**Tier 1 — trusted-friend invite (simple, ships first):**
1. Admin → Server → "Remote access" panel: owner pastes ONE pre-auth key
   (from the Tailscale console — minted as one-time or reusable, their
   choice) + picks a nickname per invite.
2. HB writes `HB-Invite-<name>.bat` into the data folder for the owner to
   send (text message, USB, whatever). The bat:
   - self-elevates (the single UAC click),
   - silently installs the **MSI** (downloaded on the friend's machine, or
     co-located if the owner sends it next to the bat),
   - `tailscale up --authkey=… --unattended --timeout=60s --accept-dns=false`,
   - polls `tailscale status` until the store answers, then
   - `start http://<store-magicdns-name>:8181`.
3. Admin panel shows the store's MagicDNS URL + a "test invite" button.

**Tier 2 — locked-down invite (opt-in, one console change by the owner):**
- Owner creates a TAGGED key (`tag:hb-guest`) instead; HB's bat passes it
  unchanged. One ACL rule (HB prints the exact snippet to paste):
  `action=accept src=tag:hb-guest dst=<host-tag-or-name>:8181`.
- Friends then see ONLY the store — nothing else on the tailnet.

**Out of scope, deliberately:** no Funnel, no public ports, no HB-branded
Tailscale account system, no auto-downloading of installers by the server
(the friend's machine fetches the MSI from Tailscale's own CDN — official,
unmodified, matches the CREDITS.md doctrine).

## Owner decisions — LOCKED (2026-09-12: "go with your calls")

1. **Tier 2 lockdown is the DEFAULT** (friends reach only the store), with
   a "fully trusted" toggle for the rare exception. Conditional on the
   live Windows verification below — if the tagged key misbehaves, fall
   back to Tier 1 + honest warning, and SAY SO.
2. **One one-time pre-auth key per friend, ~30-day expiry, tracked by
   nickname.** Per-person revoke; forgotten invites expire on their own.
3. **Plaintext key in the invite file: accepted.** It is a revocable house
   key, not a password.

## Review-pass additions (the "what did we miss" sweep, 2026-09-12)

- **SmartScreen/AV false positives:** Windows SmartScreen and several
  antivirus engines flag self-elevating .bat files on sight. The invite
  file WILL trip warnings on some machines. Mitigation: the invite
  includes a one-line "Windows may show a blue SmartScreen window —
  click More info → Run anyway" note; the gate test must confirm this on
  a clean, non-dev Windows box with Defender defaults.
- **The host PC going to sleep takes the store dark.** The on-ramp's
  admin panel should carry a plain-language "keep this PC awake" note
  (Windows power settings), and the invite flow reminds the owner once.
- **Lost/stolen friend device runbook:** revoke = delete the device in
  the Tailscale console (tunnel dies immediately) + optionally remove
  the friend's HB account. One paragraph, linked from the admin panel.

## Gate checklist before writing any code

- [ ] Live-confirm Tier 2: tagged pre-auth key + `--unattended` on a real
      Windows box, and that the friend can reach ONLY :8181 under the ACL.
- [ ] Live-confirm the #16086 mitigation (`--timeout` + service-wait).
- [ ] Confirm the MSI URL pattern is stable for pinning + fallback to
      "download latest" when the pinned one 404s.
- [x] ~~Owner answers the three questions above.~~ — answered 2026-09-12.
- [ ] **RELEASE GATE (owner, 2026-09-12): nothing ships until the whole
      friend path works live with AT LEAST ONE REAL FRIEND** — invite →
      they join → they browse → they play something — on the owner's real
      hardware and the friend's real phone/PC.

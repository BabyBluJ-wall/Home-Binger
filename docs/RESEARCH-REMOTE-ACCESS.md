# Remote Access Research — Tailscale (and the VPN layer generally)

> Research note for the **remote connections** feature: letting you (and later,
> far-away friends) reach a Home Binger server that isn't on your Wi-Fi —
> with **no ports opened to the internet, ever**.
> Status: RESEARCH — nothing here is shipped yet. Fact-checked 2026-09-09;
> re-verified against the live pricing page + official docs that same
> morning. **DECISION: Tailscale chosen (owner, 2026-09-09).**
> Companion doc for the VPN comparison: this file replaces the earlier
> ZeroTier-only notes (kept below in abbreviated form).

## What we need from the VPN layer

1. A friend's device can reach the host's Home Binger (one port: 8181) from
   anywhere, with nothing exposed to the public internet.
2. Least lag possible — Home Binger streams video through it.
3. Simple enough for non-technical friends: an installer, a login, done.
4. Free ($0 budget, always).
5. Every Home Binger stays independent — the wire is just a wire; HB's own
   accounts and per-store settings never merge.

## Tailscale — the facts that matter (verified 2026-09-09; re-verified live, same day)

**What it is:** a WireGuard-based mesh VPN. Each device runs the Tailscale
client; a coordination service introduces peers; traffic is end-to-end
encrypted **directly between devices** (peer-to-peer UDP) whenever the
networks allow it. The operator only ever sees encrypted metadata — not
media, not content.

**Free plan (Personal):**
- **6 users ("seats" = people, not machines) per network (tailnet)**, and
  **unlimited devices per user** — your PC + phone + laptop + server count
  as ONE seat. The cap counts humans.
- 50 tagged resources, 3 ACL groups, MagicDNS, subnet routers — included.
- A 7th user moves the whole tailnet to paid ($8/user/mo) — so the free
  circle is "the center + 5 people".
- **Every person can ALSO be the center of their own free 6-person circle**
  — circles overlap; nobody has to choose.
- **Re-verified 2026-09-09 against the LIVE pricing page — all current.**
  Staleness warning: Tailscale reworked its plans on **2026-04-08** (the
  free tier went 3 → 6 users; user devices became unlimited on every
  plan), so older guides claiming "3 users / 100 devices" describe the
  previous model — the same trap as ZeroTier's old "25 devices". And as
  of July 2026 Tailscale states it is *not yet enforcing* hard limits on
  ACL groups / tagged resources — treat the caps as real anyway.

**The sharing mechanic (important for us):** a user account belongs to one
tailnet, and cross-circle access happens by **node sharing** — the center
shares a specific *machine* with an external user, and that machine appears
inside the recipient's own Tailscale app. **Official docs (kb/1464, "Funnel vs. sharing devices") draw the line
explicitly: inviting a user increases your user count; sharing a device
does NOT** — it's the separate, temporary mechanic, and recipients don't
consume seats. Bonus we didn't expect: shared devices are automatically
**quarantined (inbound-only)** — a friend can reach INTO the Home Binger
node, but the node cannot initiate connections back out. Exactly the
shape we want: a center shares **only the Home Binger machine**, never the
rest of their home network. *(Final numeric check on the live console at
build time, as always.)*

**Performance (for video streaming):**
- Direct connections (the ~95% case): near line-rate — gigabit-class, 1–2 ms
  overhead. Streaming is a non-issue.
- DERP relay fallback (hard NAT / blocked UDP, ~5% of connections): shared
  relays, roughly **~35 Mbps** and +20–50 ms. Enough for 1080p streams and
  most 4K encodes; tight for 80 Mbps 4K remuxes.
- 2026 addition: **peer relays** — a well-connected node in your network can
  relay for others when direct fails (Tailscale's own Jan-2026 blog,
  "How Peer Relays saved my holiday": 12.5× over DERP, 2.2 → 27–35 Mbps;
  path order = direct → peer relay → DERP). The host's always-on PC is a
  natural peer relay.
- The client shows whether a connection is direct or relayed
  (`tailscale status`) — good diagnostics for "why is my stream slow".

**Nice UX wins:**
- **MagicDNS:** machines get stable names — a friend can reach the store at
  `http://machinename:8181` instead of an IP that might change.
- **ACLs (free tier):** the center can restrict guests to reach ONLY the
  Home Binger machine and ONLY port 8181 — friends on your tailnet can't
  touch anything else of yours. Great security story, plain config.
- **Install:** standard Windows installer (also `winget install
  Tailscale.Tailscale`), runs as a background service with a tray app.

**Off-doctrine feature, do not use:** Tailscale **Funnel** publishes a
service to the *public* internet — against our nothing-public rule. Plain
tailnet access only.

**Licensing (for bundling):** the Tailscale client is **BSD-3-Clause**
open source, and the Windows installer's bundled Wintun driver is
redistributable. We may legally include the **unmodified official
installer** with our downloads, provided we (a) include their license
notice (add to `docs/CREDITS.md`), and (b) don't imply endorsement by
Tailscale. Best form: ship it as a **separate optional release asset**
("Optional — Tailscale, for remote access") rather than inflating the main
zip, and keep the in-app guide pointing at the official download too.

## Headscale — the "unlimited forever" growth path (later)

Self-hosted, open-source Tailscale control server; **the official clients
work unchanged** (connect via `tailscale up --login-server …`), no SaaS
account, no seat caps. The honest catch: the control endpoint must be
reachable at a public HTTPS address (a domain + port 443 forwarded, usually
via a reverse proxy), and it runs on Linux/Docker. That's a real port
forward and real ops work — fine as a growth-stage option for a dedicated
center, but not the v1 path. Until a circle outgrows the free caps, the
SaaS product is simpler and still $0.

## ZeroTier — the comparison in one table

| | Tailscale free | ZeroTier free |
|---|---|---|
| Circle cap | 6 **people** (unlimited devices each) | 10 **devices** total |
| Guest needs | a Tailscale account (Google/GitHub/etc. login) | no account (network ID + approval) |
| Cross-circle | node sharing (share just the HB machine) | join multiple networks (one install) |
| Layer | L3 (WireGuard) | L2 (virtual Ethernet) |
| Relay fallback | DERP (~35 Mbps) + peer relays | ZeroTier relays (avoid when possible) |
| Self-host escape | Headscale (needs public endpoint) | ZT controller (embedded, no public endpoint) |
| Client license | BSD-3 (bundle-able) | open source core |

**DECIDED (owner, 2026-09-09): Tailscale** gets the guided in-app flow —
"I think tailscale will be the best option as well looking at the
research." Free circles = 6 people with unlimited devices, node sharing
beyond that. ZeroTier stays supported as the by-hand fallback — the
generic "enter a friend's address" path works over any VPN, so nobody is
locked out. Accounts are acceptable on the VPN layer — Home Binger itself
stays profile-optional regardless.

## What this means for the build

1. **Exe users:** optional Tailscale installer rides the release as a second
   asset + a plain-language in-app guide (detect installed → guide login →
   show green "reachable remotely" + the store's Tailscale address).
2. **Repo/server users (Node/Docker):** a `docs/REMOTE-ACCESS.md` how-to —
   install the client, log in, (optionally) share the node with friends,
   lock guests down to port 8181 with an ACL, and verify with
   `tailscale status`. No HB code required for the basic path.
3. **In HB later:** a "friend's Home Binger" connection entry (address +
   nickname) so a friend's store can appear as a source — separate feature,
   rides on top of whatever wire exists.

*Nothing here changes Home Binger's rules: the app itself never requires an
account, nothing is ever exposed to the public internet, and every store
stays its owner's alone.*

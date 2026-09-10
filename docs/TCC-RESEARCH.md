# 🔒 RESEARCH — TCC-A (co-op LAN) + the HB↔HB Follow Link

> 🔒 **CONFIDENTIAL — workspace-only until TCC goes public (gate: the
> Follow Link works).** Companion to docs/TCC-PLAN.md (v2).

*Research doc, 2026-09-08. No code changed.*

---

## Part 1 — TCC-A: the co-op LAN + hardening (~1 session)

### The ZeroTier specifics (fact-checked 2026-09-08)

- Free tier: 25 devices (≈10 members with PC + phone) — fits a founding
  co-op; a self-hosted controller lifts the cap later ($0, homelab path).
- **Latency behavior is the key fact:** ZeroTier establishes **direct
  peer-to-peer paths** whenever NAT allows — traffic then flows
  member-to-member at essentially LAN speed (typically +1–5 ms vs raw
  internet). Fallback to RELAY servers happens only behind hard NAT
  (symmetric NAT / UDP 9993 blocked) — relayed paths work but add hops
  and throttle throughput. Sources: ZeroTier's enterprise docs and
  tuning guides — `zerotier-cli peers` shows DIRECT vs RELAY per peer.
- Practical guardrails for the co-op guide: allow UDP 9993 outbound in
  Windows Firewall (or click Allow on first run), keep MTU at the
  default (fragmentation = packet loss), and if a member shows RELAY,
  the fix is usually their router's "strict NAT"/AP isolation setting.
- Owner's personal remote access: phone joins the same network → visit
  `http://<hb-pc-tailscale…>` no wait — `http://<owner-PC's-ZT-IP>:8181`
  from anywhere on earth. Zero config beyond joining.

### What TCC-A actually builds (it's mostly guide + hygiene, not plumbing)

1. **The founder's network setup guide** (plain language, like the
   phones FAQ): create network at my.zerotier.com → copy the 16-char
   Network ID → install app on each device → join → approve in the
   dashboard. Revoke = one click, cuts a member from the entire mesh.
2. **A "Co-op" page inside HB** (Settings or its own sidebar entry):
   shows this machine's co-op IP, a copy button (same pattern as the
   t84 invite button), and — placeholder UI for the Follow Link (Part 2)
   until Phase C lands.
3. **Hardening pass** (defense-in-depth; nothing is public, but the LAN
   has more people than your house):
   - Login rate-limiting (per-IP + per-account, e.g. 5 fails → 1 min
     lockout; scrypt already makes each guess expensive).
   - Sign-in audit log (data/audit.jsonl: timestamp, user, IP, ok/fail) —
     admins can see "who tried what" in Admin → Users.
   - Session expiry sweep + token rotation on password change.
   - Strict route audit: every /api/admin/* path behind requireAdmin
     (they are today — keep a suite check that it stays true as routes
     are added).
   - Registration remains founder/policies-gated.

## Part 2 — The Follow Link: least-lag HB↔HB streaming + host-controlled sharing

### The transport decision (the "least amount of lag" question)

**Recommendation: plain HTTP over the co-op LAN, proxied through the
FOLLOWER'S HB — the architecture HB already runs.**

The insight: HB already proxies every stream (`/api/play/...`), speaks
HTTP Range end-to-end (resume, seek), and binds 0.0.0.0. The Follow Link
is therefore NOT new transport tech — it's a new SOURCE TYPE:

```
Friend's browser → Friend's HB (localhost:8181)
                     └─ follows → Host's HB (http://100.x.y.z:8181)
                                    └─ serves item list + streams (Range)
```

Why this beats the alternatives:
- **WebRTC / data channels**: built for sub-100ms interactive media
  (video calls). File streaming is THROUGHPUT-bound, not latency-bound —
  a movie packet arriving 40 ms late is invisible. WebRTC would add SDP
  handshakes, ICE (redundant — ZeroTier already solved NAT), and
  chunk-reassembly complexity. Rejected.
- **Direct fetch from the friend's browser to the host**: one less hop
  (marginally), but it leaks the host's URL to the friend's browser and
  bypasses the follower-side proxy doctrine (creds/paths server-side
  only). Rejected on trust grounds.
- **The proxy double-hop** (friend browser → friend HB → host HB):
  adds one local hop (~1–3 ms on the same machine) and zero extra
  copies — the friend's HB streams the bytes through as they arrive
  (Node streams pipe; no buffering of whole files). Perceived lag =
  the direct ZT path + one localhost hop ≈ imperceptible.

**Catalog sync:** the friend's HB polls the host's `/api/coop/catalog`
(the sections the host published TO THEM) — small JSON, ETag-cached,
every few minutes or on-demand; media never syncs, only lists. Playback
is always live from the host.

### The sharing model — the owner's new rule fits the existing architecture

Owner's spec (2026-09-08): the HOST picks WHAT gets shared; the FRIEND
can only put the host's library on A SHELF OF THEIR CHOOSING.

That's exactly the existing per-user shelf map, extended:
- **Host side (what):** per-follower publish list — which sections
  (and per the t82 pattern, revocable instantly). The host's catalog
  endpoint serves each follower ONLY their approved sections. No
  transitive sharing (a follower's own followers never see the host's
  items — the follower can only PUBLISH things they own).
- **Follower side (where):** the host's sections appear in the
  follower's shelf-map panel labeled "Bob's Plex · Movies" (the
  multi-source labeling from the shelves research, done once, reused
  here), and the follower pins them to any shelf unit THEY like —
  or leaves them out of the automatic mix via their per-user source
  toggles. The host has zero say in the follower's interior design;
  the follower has zero say in the host's share list.
- Playback: click a host item → the follower's HB proxies from the
  host → works on the store TV, theater, jukebox, queue — everything,
  because to the app it's just another source.

### Engineering pieces for Phase C (the ~2–3 session estimate)

1. **Auth between HBs:** an invite key per follower (host generates;
  the friend pastes it in their Co-op page). Key = follower identity +
  a shared secret for the catalog/stream calls. Revocation kills the key.
2. **Coop endpoints on the host:** `/api/coop/catalog` (scoped, keyed),
   `/api/coop/play/:itemId` (Range-capable stream of local files —
   reuse the grabber's file streaming path).
3. **Client adapter on the follower:** "remote-hb" source kind in the
   multi-source array (from the shelves research — another reason
   multi-source lands first).
4. **Presence/health:** heartbeat in the catalog poll → "Bob's shelves
   — offline" placeholder row when the host sleeps (not an error).
5. **Reconnect/backpressure:** Node pipe() already applies TCP
   backpressure end-to-end; add retry-on-ECONNRESET around the proxy.
6. **Suite:** two HB instances on different ports in the sandbox,
   follow + catalog + byte-exact Range round-trip through the chain.

### Sequencing note (decision for the owner)

The shelves research's multi-source work is the FOUNDATION for both the
shelf-map fixes (labels) and the Follow Link (remote HB = just another
source instance). Recommended order stands: shelves/multi-source first,
then the Follow Link builds on it.

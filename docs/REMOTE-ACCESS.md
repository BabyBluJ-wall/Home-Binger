# Remote Access — reach your Home Binger from anywhere

> How to connect to YOUR Home Binger (and share it with far-away friends)
> from anywhere — with **no ports opened to the public internet, ever**.
> Works for the exe, the Node path, and Docker. Plain language, step by
> step. Written 2026-09-09.

## The idea (30 seconds)

Home Binger only listens on your own network. To reach it from elsewhere we
use **Tailscale** — a free, open-source, WireGuard-based "mesh VPN". Every
device you (and your friends) log into joins one private network that spans
the internet. Nothing is published to the public internet: only devices you
personally approve can even see each other, and all traffic is end-to-end
encrypted.

- **Free forever for up to 6 people**, with unlimited devices per person
  (your PC + phone + laptop + server = one person). A 7th person is
  Tailscale's own paid plan — you never pay us; Home Binger is free.
- Home Binger itself never requires an account. The VPN layer is the only
  part with a login, and only the person running the store strictly needs
  one.

## Step 1 — put Tailscale on the Home Binger machine

**If you downloaded our exe zip:** the official Tailscale installer ships
right inside it (named like `tailscale-setup.exe`, next to the app). Run
it, then log in (Google, Microsoft, GitHub, or email). We ship the
installer unmodified — you can always grab the latest from
https://tailscale.com/download instead.

**Windows (manual):** run the installer from tailscale.com/download, or:

    winget install Tailscale.Tailscale

then log in from the tray icon.

**Linux (Node/Docker users):**

    curl -fsSL https://tailscale.com/install.sh | sh
    sudo tailscale up

Log in with the link it prints. For a headless server, that's it.

## Step 2 — put Tailscale on the device you want to watch from

Phone or PC: install the Tailscale app (App Store / Play Store /
tailscale.com/download) and log in with the SAME account. Your devices can
now see each other.

## Step 3 — open the store from anywhere

Find your Home Binger machine's name at https://login.tailscale.com →
**Machines**. With MagicDNS on (on by default), the store is at:

    http://MACHINENAME:8181

from any of your logged-in devices, anywhere. (MagicDNS off? Use the
machine's 100.x.y.z address shown on that same page, same port.)

**Docker note:** if Home Binger runs in Docker, make sure the container
publishes port 8181 to the host (our `docker-compose.yml` already does),
and connect to the HOST machine's name/IP — not the container's.

## Sharing with a friend (without giving them your network)

Share ONE machine — the Home Binger machine — never your whole network:

1. https://login.tailscale.com → **Machines** → find the Home Binger
   machine → **Share** → enter your friend's email (they need a free
   Tailscale account of their own).
2. Your friend accepts the invite in their Tailscale app; the shared
   machine appears in their list.
3. They open `http://MACHINENAME:8181` — your store, nothing else of yours.
4. To revoke: same screen → remove them. Instant.

Tailscale automatically **quarantines shared machines**: your friend can
reach INTO the Home Binger machine, but that machine cannot initiate any
connection back out to them. And share recipients don't count toward your
6 people.

**Lock guests down further (optional, recommended):** in the admin console
→ Access Controls you can restrict guests to reach only port 8181 on that
one machine — see Tailscale's ACL docs for the current syntax. With the
default policy they can already only reach machines you explicitly shared.

## Is it fast enough for video?

- When your devices can talk directly (the common case): essentially full
  speed — gigabit-class, no noticeable lag.
- When they can't (strict routers/CGNAT), traffic relays end-to-end
  encrypted via Tailscale's relays: fine for 1080p and most 4K encodes; a
  giant 4K remux might stutter.
- Check yours: `tailscale status` shows `direct` or `via DERP` per device.

## The rules we keep

- **Nothing is ever exposed to the public internet** — no port forwarding,
  no public URLs. (Tailscale's "Funnel" feature publishes things publicly;
  we don't use it, ever.)
- **Home Binger never requires an account** — the app itself stays
  profile-optional; only the VPN layer has a login.
- **Your store stays yours** — the wire is just a wire.

## Troubleshooting

- **Store won't load:** is Tailscale "Connected" on BOTH devices? Same
  account (or a valid share)?
- **Wrong address:** `tailscale status` lists each machine's name + 100.x
  address.
- **Works on Wi-Fi, not remotely:** check `tailscale status` for `direct`
  vs `via DERP`; try `tailscale ping MACHINENAME`.
- **Firewall:** Windows may prompt to allow Home Binger (or Node) on
  private networks — allow it.

---

*Guide version 2026-09-09. Tailscale's free-plan details were verified
against their pricing page on that date — plans can change; see
https://tailscale.com/pricing.*

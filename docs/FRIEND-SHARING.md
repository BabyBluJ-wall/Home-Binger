# Friend sharing — Home Binger to Home Binger 🤝

> Share your shelves with a friend's Home Binger — and bring theirs into
> your store. Written 2026-09-09. Works over your home network, or any
> distance with the Tailscale setup from REMOTE-ACCESS.md. Nothing is ever
> opened to the public internet.

## The idea (30 seconds)

Every Home Binger can play two roles at once:

- **Host:** "These are my shelves — THIS friend may see THESE ones."
- **Follower:** "My friend's shelves now live in my store too."

Each connection is a deliberate handshake: the host invites a friend by
name, the app mints a **friend code**, and the host hands over their store
address + that code (say it out loud, text it — your call). No code, no
access. Delete the friend and access ends instantly.

## If a friend shared THEIR store with you

1. Get two things from them: their **store address** (like
   `http://their-pc:8181`) and their **friend code**.
2. In your Home Binger: **Admin → Server → Friends' stores**.
3. Click **+ Add a friend's Home Binger**, type a nickname, paste the
   address and the code, click **Test** — you should see their name and
   how many titles they're sharing.
4. **Save Settings.** Their shelves appear as new sections in your store.

Everyone in your house can switch each friend's store on or off for
themselves in **My Media** (Settings → My Media).

## If YOU want to share YOUR store with a friend

1. **Admin → Server → Friend sharing** → tick **Let friends connect to my
   store**.
2. Click **+ Invite a friend**, type their name, **Save Settings**.
3. A **friend code** appears (click it to copy). Give them:
   - your store address (find it on the Home Binger start screen —
     `http://<your-pc-name-or-ip>:8181`), and
   - the code.
4. Tick which of **your shelves** they see. Untick everything to pause
   them without deleting. Delete the friend to end access instantly.

## The rules we keep

- **Approval-based.** A friend connects only with a code you deliberately
  gave them — there's no open door, ever.
- **Your logins stay home.** Friends stream through YOUR Home Binger. Your
  Plex/Jellyfin (or other) tokens never leave your machine.
- **No friend-chains.** Shelves a friend shared into your store can never
  be shared onward by you — your share lists only ever offer YOUR OWN
  shelves. What's yours to share is decided by who owns it.
- **Nothing public.** All of this rides your home network or a private
  VPN (see REMOTE-ACCESS.md). No ports are opened to the internet.

## Troubleshooting

- **"Not invited" / test fails:** wrong code, or the host paused sharing.
  Ask them to check Friend sharing in their Admin → Server.
- **Their shelves vanished:** their store is offline or they revoked the
  code — nothing broke on your side; it returns when they're back.
- **Slow video from far away:** that's the network between the two homes,
  not the app — see the speed notes in REMOTE-ACCESS.md.

---

*Guide version 2026-09-09 (t97). Home Binger is free, and friend sharing
is free — no accounts, no fees, no limits we impose.*

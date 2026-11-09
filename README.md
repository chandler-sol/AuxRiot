# AuxRiot

1v1 beat battles. A producer posts a beat; the first producer to answer it locks in the battle, and a 24h or 48h vote starts. Voters score Drums / Melody / Mix / Overall (1–5 stars) after listening to at least 75% of both beats.

**Stack:** SvelteKit 3 on Cloudflare Workers · D1 (SQLite) · R2 (audio, no bandwidth fees) · optional Turnstile.
Expected cost at launch: **$0/month** on the free tiers, plus a domain.

## How it works

| Piece | Where |
|---|---|
| Schema | `migrations/0001_init.sql` |
| Auth (PBKDF2 passwords, hashed session tokens, device cookie) | `src/lib/server/auth.ts`, `src/hooks.server.ts` |
| Battle lifecycle, results, listen tracking, vote weighting | `src/lib/server/battles.ts` |
| Server-side MP3 validation (real duration from frames) | `src/lib/server/mp3.ts` |
| In-browser decode → trim to 2:00 → waveform → 128 kbps MP3 | `src/lib/audio-prep.ts`, `src/lib/encoder.worker.ts` |
| Player with waveform + listen tracking | `src/lib/components/Player.svelte` |
| Audio streaming with HTTP Range | `src/routes/audio/[...key]/+server.ts` |
| Battle page (respond, vote, comments, report) | `src/routes/battles/[id]/` |
| Moderation (reports, linked accounts, discounted votes, DMCA, shadowban) | `src/routes/admin/` |

**Battles close without a cron job.** Expired votes are finalized lazily whenever the home page or the battle page loads. The update is idempotent, so concurrent requests can't double-count wins.

**Anti-cheat layers**
- Voting requires an account at least `MIN_VOTER_ACCOUNT_AGE_HOURS` old (default 168 = 7 days). Participants can't vote in their own battle.
- Listen-through: the browser reports unique seconds played at 1x speed. The server limits total credited listening across the battle to the wall-clock time since the user first pressed play, so neither a script nor playing both beats at once gets around it.
- Signals: salted hashes of IP and a long-lived device cookie are stored per account.
  - A voter who shares a **device** with a participant → vote weight 0.
  - A voter who shares only an **IP** → weight 0.5. Mobile carriers and dorms put many users behind one shared IP, so this is discounted, not zeroed.
  - A voter whose past ballots almost always favor the same producer → weight 0.25.
- Shadowban: the user notices nothing, but their votes count for 0 and their comments are visible only to themselves. Shadowbans are rechecked when a battle closes.
- User reports feed the admin queue.
- Discounted votes look completely normal to the voter.

## Local development

```bash
npm install
npx wrangler d1 migrations apply auxriot --local
npm run build
npx wrangler dev --var MIN_VOTER_ACCOUNT_AGE_HOURS:0 --var ADMIN_USERNAMES:yourname
```

Open http://localhost:8787. (`npm run dev` also works for UI work.) Locally every account shares one IP, so votes show as "shared_ip" (weight 0.5). That's expected.

## Deploying to Cloudflare

```bash
npx wrangler login
```

```bash
npx wrangler d1 create auxriot
```

Paste the printed `database_id` into `wrangler.jsonc`.

```bash
npx wrangler r2 bucket create auxriot-audio
```

```bash
npx wrangler d1 migrations apply auxriot --remote
```

```bash
openssl rand -base64 32 | npx wrangler secret put SIGNAL_SALT
```

```bash
npm run build && npx wrangler deploy
```

Then set `ADMIN_USERNAMES` in `wrangler.jsonc` (or the dashboard) to your username.

**Optional bot check on sign-up:** create a Turnstile widget in the dashboard, put the site key in `TURNSTILE_SITE_KEY`, and run `npx wrangler secret put TURNSTILE_SECRET`.

**Recommended free extras:** a Cloudflare rate-limiting rule on `POST /login` and `POST /signup`.

## Not built yet

- OAuth (Google/Discord). The `oauth_accounts` table is ready.
- Email verification and password reset (needs an email provider, e.g. Resend's free tier).
- Phone verification for tournaments or money battles.
- Pool battles, "David vs Goliath" challenges (unlocked after N wins at X% win rate).
- Pro tier: 320 kbps playback, no ads.
- Notifications ("someone answered your battle").

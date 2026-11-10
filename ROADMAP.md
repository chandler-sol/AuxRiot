# AuxRiot Roadmap

Ideas and decisions captured so far. Nothing below is built unless it's under **Shipped**.

## Shipped

- 1v1 battles: first producer to answer takes the slot; 24h or 48h vote.
- Beats trimmed to 2:00 and encoded to 128 kbps MP3 in the uploader's browser; stream only.
- Voting: 1–5 on Drums / Melody / Mix / Overall; must hear 75% of both beats; scores sealed until close.
- Anti-cheat: voter account age (admin toggle, launched at 24h), listen-time checks, device/IP matching, one-sided voting history, silent shadowbans, user reports.
- Comments, DMCA takedown flow, admin moderation page.
- Flyer redesign; per-battle color pairs; user signature colors with clash rules.
- Profiles: avatar, bio, social links (Instagram, TikTok, YouTube, SoundCloud, Spotify, Apple Music, BeatStars, X, Twitch, website).
- Auto-deploy to Cloudflare on every push to `main`.

## Next up (small to medium)

- **Google / Discord login** alongside email (the `oauth_accounts` table already exists).
- **Email verification and password reset** (needs an email provider, e.g. Resend's free tier).
- **Notifications**: "someone answered your battle", "voting closed — you won".
- **Login and sign-up rate limiting** with a Cloudflare rate-limit rule.
- **Pool battles**: one beat, many challengers, one winner.
- **David vs Goliath**: challenge mode unlocked after N wins at a minimum win rate (e.g. 5–10 wins, ≥60%).
- **Phone verification** for tournaments or money battles only.

## Battle Credits

Credits are an in-site currency. **They can never be cashed out or traded for anything of real value.** Cash-out would make AuxRiot a regulated money service.

**Spending: promoted battles**
- 500 credits = 1 hour at the top of the feed (1,000 = 2 hours, and so on).
- One or two "Promoted" slots above the feed, clearly labeled; a queue when they're full.
- Only open or live battles can be promoted.

**Buying**

| Pack | Price | Promo time |
|---|---|---|
| 1,000 | $4.99 | 2 hrs |
| 2,500 | $9.99 | 5 hrs (+20%) |
| 6,000 | $19.99 | 12 hrs (+40%) |

No packs under ~$5: card fees (≈30¢ + 3%) eat small purchases.

**Earning**
- Win: 100 credits. Loss: 25 credits (keeps people coming back without making losing pay).
- Anti-farming:
  - Only pay out when a battle has a minimum number of *counted* votes (e.g. 5, after anti-cheat weighting).
  - Cap earnings per day.
  - Claw back credits from accounts later found cheating.

**Other sources**
- Monthly allowance for Pro members (e.g. 1,000/month).
- Giveaways, including free monthly giveaways for Pro members.

**Build notes**
- A credits ledger (every earn and spend is a row, so balances are auditable and reversible).
- Stripe Checkout for purchases.
- The promo queue.

## Marketplace: exclusive beats only

- **No leases.** One beat, one buyer. Once sold, it's off the market for good.
- Battles stay up with a **SOLD** stamp on the poster (free advertising for the producer).
- **What's sold:** the full-length, untagged WAV, uploaded privately. The 2:00 battle preview is never the product.
- **Producer promise** when listing: never sold or leased anywhere else.
- **Payments:** Stripe Connect pays producers directly (AuxRiot never holds their money) and handles ID checks and tax forms. Files unlock as soon as payment clears.
- **Fee:** 10–15% of each sale.
- **Lawyer needed:** a contract template for what transfers (master rights, publishing split, credit).
- **Copyright:** require a "no uncleared samples" promise to list; a takedown also pulls the beat from sale.

**Stems upsell**
- Two prices per beat: **Exclusive** (WAV) or **Exclusive + Stems** (producer sets the extra, e.g. +$50–$300).
- Storage is cheap: about 0.5 GB per stem set, well under a cent a month on R2, and downloads are free.
- Large files upload straight to R2 (presigned or multipart uploads), not through the site, which caps request size at around 100 MB.

## AuxRiot Pro

Launch ad-free with better audio first; add perks as they're built.

| | Free | Pro |
|---|---|---|
| Ads | Light ads (later) | None |
| Playback | 128 kbps | 320 kbps |
| Marketplace fee | 15% | 8% |
| Stem storage | 1 GB | 50 GB |
| Credits | Earned only | + monthly allowance, giveaways |

A producer selling one or two exclusives a year saves more on fees than Pro costs.

## Betting / staking (legal review first)

- Betting **purchasable** credits on battle outcomes, or staking money on your own battle, is gambling in most US states (licenses, age checks, state-by-state rules). **Not without lawyers.**
- The usual safe version is free-to-play predictions: only earned credits, prizes are badges or leaderboard spots, and nothing has cash value. Even that gets a legal check first.

## Open questions

- Final credit prices and earn rates once real usage exists.
- Pro price point.
- Whether sold beats stay playable in battle history (current lean: yes, with the SOLD stamp).

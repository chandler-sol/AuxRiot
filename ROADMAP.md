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
- **Battle results ledger** (`battle_outcomes`): every finished battle records each participant's win/loss/tie, scores, counted votes and close time, ready for retroactive credit awards.
- **Promo slots**: Slot 1 and Slot 2 above the feed. Every booking automatically takes the earliest opening in either slot; the booker is told the slot and start time, and the battle's creator sees it on their battle page. Automatic start/stop, early end when a battle closes. Admin-booked for now.
- Live-ticking countdowns on cards, unique view counts, feed sorting (ending soonest/last, newest/oldest, most votes/comments/views).
- **Email (Resend)**: mail.auxriot.com verified; sign-up confirmation (required to vote), forgot/reset password. Sender: AuxRiot <admin@mail.auxriot.com>.
- Landing page for visitors with 30-second previews; desktop layout.
- **Battle Credits (earned)**: +100 win / +50 tie / +25 loss on close, ledger-backed balances, min counted votes (admin setting, default 3), linked-account and 5-a-day guards, backfill of past battles, Credits page, spend 250 credits for a 3-hour promo slot from the battle page (auto-refund if booking fails), admin grant/claw back.
- Winner reveal animation when a battle's clock runs out (and once for first-time visitors to recently finished battles).
- **Moderation suite**:
  - **Moderator role**: admins assign it from Users. Mods get battles, ballots, comments, reports, bans and suspensions, but no credits, settings, promos, news, DMCA or emails, and they can't act on other staff.
  - **Battle panel**: end voting now; extend or shorten the clock; recount; remove or restore a battle (reverses W-L and credits); delete a beat.
  - **Ballot overrides**: count fully, half, don't count, or delete. These stick even if the voter re-votes, and they auto-recount finished battles.
  - **Comments**: feed with search and filters, hide/unhide, bulk actions, and a blocked-words list. Matching comments are held; only the author sees them until a mod approves.
  - **Reports**: grouped by target, with the content inline and one-tap hide, remove, shadowban, suspend, handled or dismiss.
  - **Suspensions**: hard block, logged out everywhere, with the reason shown at login.
  - **Mod log**: an append-only record of every staff action, including credits and settings.
- **Comment upvotes and flair**: one upvote per person per comment (toggle; confirmed email; not your own); Top/Oldest sort. Upvotes earn **respect**, capped at 3 from any one person. Flair: ★ Sharp ear (15), ★★ Trusted ear (75), ★★★ Tastemaker (250), shown on comments and profiles. Same-device upvotes are silently ignored; hidden/held comments and shadowbanned voters don't count.
- **Growth batch**:
  - **Battle alerts by email**: answered, results, and a 3-day "still waiting" nudge. Settings toggle plus one-click unsubscribe.
  - **Challenge links** (`/c/[id]`): 30-second preview with "Sign up & answer".
  - **Per-battle share images**.
  - **Per-IP limits** on failed logins, sign-ups and reset requests.
  - **Cloudflare Web Analytics**.
  - **Google/Discord sign-in**: on once the keys are added.

## Next up (small to medium)

- **Bounce/complaint webhooks** from Resend so bad addresses stop getting mail.
- **Pool battles**: one beat, many challengers, one winner.
- **David vs Goliath**: challenge mode unlocked after N wins at a minimum win rate (e.g. 5–10 wins, ≥60%).
- **Phone verification** for tournaments or money battles only.
- **Promo scheduler**: let people pick a specific start time instead of the next opening (the booking engine already supports `mode: 'at'`).

## Battle Credits

Credits are an in-site currency. **They can never be cashed out or traded for anything of real value.** Cash-out would make AuxRiot a regulated money service.

**Spending: promoted battles** (slots and scheduling already built; credits plug into `bookPromotion` with `source: 'credits'`)
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
- Launch backfill: award past records from `battle_outcomes`, applying the same minimum-counted-votes rule.
- Stripe Checkout for purchases.
- The promo queue.

## Marketplace: exclusive beats only (in progress on beta.auxriot.com)

**Decided (Nov 2026)**
- **Exclusive only, no leases.** One buyer, then it's off the market for good. The battle stays up with a **SOLD** stamp.
- **When producers list:** at upload (a "Sell this beat too" checkbox) or anytime from their battle.
- **What's delivered:**
  - The producer's choice of a full-length **WAV or MP3**, tagged or untagged (buyers are told which), uploaded privately. The 2:00 battle preview is never the product.
  - Optional **stems zip** (up to 4 GB).
- **Pricing:**
  - Two prices: **Exclusive** and **Exclusive + Stems**.
  - **Suggested minimum $20.** Producers may go lower (we advise against it).
  - No maximum. Admin Store desk flags outliers.
- **Buy unlocks after the battle ends**, so a purchase can't sway the vote.
- **Store details:** BPM, key, genre, up to 3 moods.
- **Samples:** a listing checkbox puts clearance on the producer and buyer. We remove beats only on a valid DMCA notice.
- **Seller:** one per beat. Whoever lists it gets paid; no splits yet.
- **Fee:** **20%** of the final sale price. It's an admin setting, so it can change without code.
- **Card processing** (2.9% + 30¢): comes out of the producer's share, shown explicitly in the earnings preview.
- **Payouts:** Stripe Connect Express, so AuxRiot never holds producers' money. Proposed schedule: weekly on Fridays as a refund/chargeback buffer (daily is one setting away).
- **Refunds:** before download only. Watch producer feedback.
- **Sales tax:** collect where required (Stripe Tax). Accountant check.
- **Discount codes:**
  - **Producer codes** come off the sale price, and our 20% shrinks with it.
  - **Site-wide codes** (Black Friday etc.) are AuxRiot-funded: the producer is paid on full price, capped at our fee %.
  - Controls: expiry, max uses, which beats, one per buyer.
- **Buyers need an account.** Auto-generated PDF license; downloads valid 7 days, re-downloadable from "My purchases".
- **Storefront** on every profile, and a **Store** page with filters and a "Producers selling" list.
- **Notifications:** "your beat sold", purchase receipt, payout on the way.

**Phase 1 (built on beta):** listings, private chunked uploads, earnings preview, Store page, storefronts, battle-page sale status, admin fee/minimum and listings monitor, moderation sync.
**Phase 2 (needs a Stripe account):** Connect onboarding, Checkout, Stripe Tax, webhooks, delivery and downloads, PDF license, refunds, discount codes, sale and payout notifications.

**Store legal (temporary drafts, on beta)**
- **Rights:** the producer keeps copyright and grants an exclusive, perpetual, worldwide license with unlimited commercial use. "Prod. by" credit is required. The producer keeps 50% of the writer's share, with no master royalties. Only the buyer may register Content ID.
- **Copyright removal after a sale:** AuxRiot refunds the buyer and recovers the money from the producer.
- **Off-site payment for listed beats is prohibited.**
- **Seller checklist:** agreed once before the first listing, recorded with timestamp and version.
- **Per-beat license signature:** typed legal name (kept private) plus a sample disclosure. Changing the disclosure clears the signature.
- **Buyer signs at checkout** (Phase 2).
- **Pages:** /store/terms and /store/license.

**Messaging (built on beta)**
- **Public Q&A on every listing:** anyone asks, and the producer answers publicly. Uses the blocked-words filter and is reportable.
- **Private "Ask the producer" threads,** one per buyer per beat, with an inbox at /messages:
  - An unread badge in the header.
  - At most one email per thread every 30 minutes, with its own on/off setting.
  - Confirmed email required; 10 new threads a day and 60 messages an hour.
  - Block and report, plus a "keep deals on AuxRiot" notice.
  - Phone numbers, emails and payment apps are flagged with a warning, never blocked.
  - Shadowbanned senders' messages are silently undelivered.
  - Mods only see a conversation when a message in it is reported.
- **After purchase (Phase 2):** the same thread becomes the order thread, as the record for disputes and refunds.
- **Producer ↔ producer:** no open DMs. Profile social links now read "Hit me up". Revisit open DMs with message requests if there's demand.

**Later**
- **Make an offer** (negotiated price).
- **"Featured in the store"** placement bought with Battle Credits, like promoted battles.
- **Lawyer review of the store documents.** Temporary ChatGPT drafts are live on beta: Store Terms, Exclusive Beat License and Seller checklist, with lawyer notes kept in `docs/legal/`.
- **Co-producer splits** (Stripe Connect transfers to multiple accounts).
- **Battle Credits toward purchases:** revisit later. Today they have no cash value per the Terms.

## Services (in progress on beta.auxriot.com)

**Decided (Nov 2026)**
- **Categories:** mixing, mastering, custom beat, vocal mix/tuning, feature.
- **Fee:** 20% plus card processing, the same as beats. Revisit with data.
- **Who can offer:** anyone, including engineers who sign up just for services (a sign-up checkbox). Reputation comes from battling, judging and respect, all shown on every service card.
- **Samples are stream-only,** like battle beats: no downloads, 2:00 max. Mixing, mastering and vocal services can show before/after pairs.
- **Paying outside AuxRiot is prohibited** for services, as for listed beats.
- **Reviews:** only after a completed paid job.

**Phase 1 (built on beta):**
- Create and manage services at /settings/services.
- Samples upload with an optional "before" version; a service can't go live without one.
- Public /services page with filters, beside the Beats tab.
- Profile "Hire …" section and a "Judged" stat.
- "Request a quote" opens a private thread.
- Mods can remove a service from the Store desk.

**Phase 2 (after store checkout):**
- Custom offers in the thread (scope, price, deadline, revisions).
- Payment held until delivery, with delivery and approval in the thread.
- Auto-release 3 days after delivery; disputes go to mods.
- Services added to the Store Terms.

**Phase 3:** reviews, featured placement with credits, milestone payments.

## Judging credits (built on beta)

- **+10 battle credits per judged battle,** paid at close and only for counted votes: not shadowbanned or suspended, and not zeroed by fair-play checks or a mod.
- **Capped at 10 judged battles a day.**
- **Reversed on a recount or removal** (ledger reason judge_void).
- **Voters see "+10 credits for judging"** on the results.

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

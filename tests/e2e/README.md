# The test robot

Clicks through AuxRiot like a person, on a private copy of the site (local
database and storage, beta settings). It runs automatically before every deploy
and every night; a failure stops the deploy and GitHub emails you.

## What it covers

| File | Flows |
| --- | --- |
| `01-smoke` | Every main page loads, no browser errors, nothing wider than a phone; admin pages hidden; webhook rejects unsigned calls |
| `02-battle` | Upload a beat → guest preview → answer → judges score → comment → results, records, credits, notifications |
| `03-best-of` | Best of 3: hidden rounds, per-round ballots, tie → overtime, blind drops, overtime vote; forced overtime forfeit |
| `04-social` | @tag autocomplete, links, 5-tag limit, comment notifications merging; the bell; verified badge, crew link signup, join/leave |
| `05-store` | Store section on finished battles, payouts gate, paid order via signed Stripe webhook, SOLD, downloads, license escaping, refund guard, abandoned checkout, chargebacks |
| `06-admin` | Users list fits a phone, one-tap verify, give credits; test lab builds and fast-forwards a battle |

Stripe itself is never called: payments arrive as signed webhook events, the same
way Stripe sends them.

## Run it

```bash
npm run test:e2e        # build, migrate the local DB, run everything (~8 min)
npx playwright test store   # just one file (after a build)
```

Needs `.dev.vars.beta` with `BETA_PASSWORD=local-test-pw` and
`STRIPE_WEBHOOK_SECRET=whsec_localtest123` (CI writes these itself).

When something fails, screenshots of what the robot saw are in `test-results/`
(in CI: the run's **robot-report** artifact).

## Adding a test

Use the helpers in `helpers.ts`: `signup()` makes a verified, vote-ready account
(`{ admin: true }` for admin), `sql()` reads or tweaks the local database,
`action()` posts a form action, `stripeEvent()` sends a signed Stripe event,
`labBattle()` runs a test-lab scenario, and `eventually()` waits for notifications.

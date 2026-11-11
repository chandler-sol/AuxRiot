/**
 * Battle Credits (earned only for now). Credits never cash out and can't be
 * transferred. Payout rules guard against farming: a battle only pays when it
 * had enough counted (non-discounted) votes, battles between linked accounts
 * never pay, and each producer earns from at most DAILY_CAP battles per day.
 */
import { newId, DAY } from './util.ts';
import { sharedSignals } from './battles.ts';
import { bookPromotion } from './promos.ts';

export const CREDITS = {
	win: 100,
	loss: 25,
	tie: 50,
	promoPerHour: 500,
	dailyCap: 5
} as const;
export const MIN_VOTES_KEY = 'credits_min_votes';

export async function getMinVotes(db: D1Database) {
	const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(MIN_VOTES_KEY).first<{ value: string }>();
	const n = Number(row?.value ?? 3);
	return Number.isFinite(n) && n >= 0 ? n : 3;
}

const recompute = (db: D1Database, userId: string) =>
	db
		.prepare('UPDATE users SET credits = (SELECT COALESCE(SUM(amount), 0) FROM credit_ledger WHERE user_id = ?) WHERE id = ?')
		.bind(userId, userId);

/** Record a credit change (idempotent per user+reason+ref). Returns true if it was new. */
export async function addCredits(db: D1Database, userId: string, amount: number, reason: string, ref: string, note = '', at = Date.now()) {
	const res = await db.batch([
		db
			.prepare('INSERT OR IGNORE INTO credit_ledger (id, user_id, amount, reason, ref, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(newId(), userId, Math.trunc(amount), reason, ref, note.slice(0, 200), at),
		recompute(db, userId)
	]);
	return (res[0].meta.changes ?? 0) > 0;
}

/** Spend credits only if the balance covers it. Returns true on success. */
export async function spendCredits(db: D1Database, userId: string, amount: number, reason: string, ref: string, note = '') {
	const res = await db.batch([
		db
			.prepare(
				`INSERT INTO credit_ledger (id, user_id, amount, reason, ref, note, created_at)
				 SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT credits FROM users WHERE id = ?) >= ?`
			)
			.bind(newId(), userId, -Math.abs(amount), reason, ref, note.slice(0, 200), Date.now(), userId, Math.abs(amount)),
		recompute(db, userId)
	]);
	return (res[0].meta.changes ?? 0) > 0;
}

export type AwardOutcome = { userId: string; amount: number; awarded: boolean; reason?: string };

/**
 * Pay out a finished battle from its battle_outcomes rows. Safe to call more
 * than once (the ledger's unique key stops double payouts), which is how the
 * backfill of older battles works too.
 */
export async function awardBattle(db: D1Database, battleId: string, minVotes?: number): Promise<AwardOutcome[]> {
	const rows = await db
		.prepare('SELECT user_id, outcome, counted_votes, closed_at FROM battle_outcomes WHERE battle_id = ?')
		.bind(battleId)
		.all<{ user_id: string; outcome: 'win' | 'loss' | 'tie'; counted_votes: number; closed_at: number }>();
	if (rows.results.length !== 2) return [];
	const min = minVotes ?? (await getMinVotes(db));
	const [p1, p2] = rows.results;
	if (p1.counted_votes < min) return rows.results.map((r) => ({ userId: r.user_id, amount: 0, awarded: false, reason: 'not_enough_votes' }));
	// Battles between accounts on the same device never pay (stops farming wins/losses with an alt).
	const linked = await sharedSignals(db, p1.user_id, [p2.user_id, p2.user_id]);
	if (linked.device) return rows.results.map((r) => ({ userId: r.user_id, amount: 0, awarded: false, reason: 'linked_accounts' }));

	const out: AwardOutcome[] = [];
	for (const r of rows.results) {
		const amount = CREDITS[r.outcome];
		const earnedThatDay = await db
			.prepare(
				`SELECT COUNT(*) AS n FROM credit_ledger
				 WHERE user_id = ? AND reason LIKE 'battle_%' AND ref != ? AND created_at > ? AND created_at <= ?`
			)
			.bind(r.user_id, battleId, r.closed_at - DAY, r.closed_at)
			.first<{ n: number }>();
		if ((earnedThatDay?.n ?? 0) >= CREDITS.dailyCap) {
			out.push({ userId: r.user_id, amount: 0, awarded: false, reason: 'daily_cap' });
			continue;
		}
		const isNew = await addCredits(db, r.user_id, amount, `battle_${r.outcome}`, battleId, '', r.closed_at);
		out.push({ userId: r.user_id, amount, awarded: isNew });
	}
	return out;
}

/** Pay out every finished battle that hasn't been paid yet (oldest first). */
export async function backfillCredits(db: D1Database) {
	const min = await getMinVotes(db);
	const battles = await db
		.prepare(
			`SELECT o.battle_id FROM battle_outcomes o
			 WHERE NOT EXISTS (SELECT 1 FROM credit_ledger l WHERE l.ref = o.battle_id AND l.reason LIKE 'battle_%')
			 GROUP BY o.battle_id ORDER BY MIN(o.closed_at) ASC LIMIT 200`
		)
		.all<{ battle_id: string }>();
	let paidBattles = 0;
	let credits = 0;
	for (const { battle_id } of battles.results) {
		const res = await awardBattle(db, battle_id, min);
		const paid = res.filter((r) => r.awarded);
		if (paid.length) paidBattles++;
		credits += paid.reduce((s, r) => s + r.amount, 0);
	}
	return { checked: battles.results.length, paidBattles, credits };
}

/** Spend credits on a promo slot; refunds automatically if no slot can be booked. */
export async function buyPromotion(db: D1Database, userId: string, battleId: string, hours: number) {
	const cost = CREDITS.promoPerHour * hours;
	const attempt = newId();
	if (!(await spendCredits(db, userId, cost, 'promo_spend', attempt, `${hours}h promo for battle ${battleId}`))) {
		return { ok: false as const, error: `That costs ${cost.toLocaleString()} credits — you don't have enough yet.` };
	}
	const res = await bookPromotion(db, { battleId, bookedBy: userId, hours, source: 'credits' });
	if (!res.ok) {
		await addCredits(db, userId, cost, 'promo_refund', attempt, 'Booking failed — refunded');
		return { ok: false as const, error: `${res.error} Your credits were refunded.` };
	}
	await db.prepare("UPDATE credit_ledger SET note = ? WHERE user_id = ? AND reason = 'promo_spend' AND ref = ?").bind(`${hours}h promo — slot ${res.slot}`, userId, attempt).run();
	return { ok: true as const, slot: res.slot, startsAt: res.startsAt, endsAt: res.endsAt, startsNow: res.startsNow, cost };
}

import { finalizeBattle } from './battles.ts';
import { CREDITS, addCredits } from './credits.ts';

/**
 * Battle-level moderation: changing the clock, ending early, recounting after
 * ballot changes, and voiding. Every function here is safe to call twice.
 */

export async function getModBattle(db: D1Database, id: string) {
	return db
		.prepare(
			`SELECT b.id, b.title, b.status, b.creator_id, b.challenger_id, b.vote_hours, b.created_at,
			        b.voting_started_at, b.voting_ends_at, b.winner_id, b.result_json, b.color_a, b.color_b, b.views,
			        c.username AS creator, ch.username AS challenger
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
			 WHERE b.id = ?`
		)
		.bind(id)
		.first<{
			id: string; title: string; status: string; creator_id: string; challenger_id: string | null; vote_hours: number;
			created_at: number; voting_started_at: number | null; voting_ends_at: number | null; winner_id: string | null;
			result_json: string | null; color_a: string | null; color_b: string | null; views: number; creator: string; challenger: string | null;
		}>();
}

/** Close voting right now and publish the result. */
export async function endVotingNow(db: D1Database, battleId: string) {
	const now = Date.now();
	const r = await db.prepare(`UPDATE battles SET voting_ends_at = ? WHERE id = ? AND status = 'voting'`).bind(now, battleId).run();
	if (!r.meta.changes) return false;
	await finalizeBattle(db, battleId);
	return true;
}

/** Move a live battle's closing time. Must stay in the future and within 7 days of now. */
export async function setVotingEnd(db: D1Database, battleId: string, endsAt: number) {
	const now = Date.now();
	if (!Number.isFinite(endsAt) || endsAt <= now + 60_000) return 'The new closing time has to be at least a minute from now.';
	if (endsAt > now + 7 * 86_400_000) return 'Keep it within 7 days from now.';
	const r = await db.prepare(`UPDATE battles SET voting_ends_at = ? WHERE id = ? AND status = 'voting'`).bind(endsAt, battleId).run();
	return r.meta.changes ? null : 'Only live battles have a clock to change.';
}

/**
 * Undo a closed battle's result: W-L-T records, the outcome rows, and any
 * credits it paid. The ledger keeps the original rows (re-tagged) next to a
 * reversing row, so history stays auditable and a recount can pay out again.
 * Leaves the battle in 'voting' with the clock at now, so the caller decides
 * whether to recount (finalize again) or remove it.
 */
async function reverseResult(db: D1Database, battleId: string) {
	const outcomes = await db
		.prepare('SELECT user_id, outcome FROM battle_outcomes WHERE battle_id = ?')
		.bind(battleId)
		.all<{ user_id: string; outcome: 'win' | 'loss' | 'tie' }>();
	const col = { win: 'wins', loss: 'losses', tie: 'ties' } as const;
	const now = Date.now();
	const tag = `${battleId}#void${now}`;
	const paid = await db
		.prepare(`SELECT user_id, amount, reason FROM credit_ledger WHERE (ref = ? OR ref = ?) AND (reason LIKE 'battle_%' OR reason = 'judge_reward')`)
		.bind(battleId, `${battleId}:ot`)
		.all<{ user_id: string; amount: number; reason: string }>();

	await db.batch([
		...outcomes.results.map((o) => db.prepare(`UPDATE users SET ${col[o.outcome]} = MAX(0, ${col[o.outcome]} - 1) WHERE id = ?`).bind(o.user_id)),
		db.prepare('DELETE FROM battle_outcomes WHERE battle_id = ?').bind(battleId),
		db.prepare(`UPDATE credit_ledger SET ref = ? || '#' || ref, note = 'Reversed by a moderator' WHERE (ref = ? OR ref = ?) AND (reason LIKE 'battle_%' OR reason = 'judge_reward')`).bind(tag, battleId, `${battleId}:ot`),
		db.prepare(`UPDATE battles SET status = 'voting', winner_id = NULL, result_json = NULL, voting_ends_at = ? WHERE id = ? AND status = 'closed'`).bind(now, battleId)
	]);
	for (const [i, p] of paid.results.entries()) {
		if (!p.amount) continue;
		const judging = p.reason === 'judge_reward';
		// One reversal per original row (a judge can have both set and overtime credits).
		await addCredits(db, p.user_id, -p.amount, judging ? 'judge_void' : 'battle_void', `${tag}:${i}`, judging ? 'Judging credits reversed' : 'Battle result reversed');
	}
	return outcomes.results.length > 0;
}

/** Re-score a closed battle (after ballots were changed) and pay out again under the current rules. */
export async function recount(db: D1Database, battleId: string) {
	const b = await db.prepare('SELECT status FROM battles WHERE id = ?').bind(battleId).first<{ status: string }>();
	if (b?.status !== 'closed') return false;
	await reverseResult(db, battleId);
	await finalizeBattle(db, battleId);
	return true;
}

/** Take a battle off the site. A finished battle's result, records and credits are undone too. */
export async function voidBattle(db: D1Database, battleId: string) {
	const b = await db.prepare('SELECT status FROM battles WHERE id = ?').bind(battleId).first<{ status: string }>();
	if (!b || b.status === 'removed') return false;
	if (b.status === 'closed') await reverseResult(db, battleId);
	await cancelPromos(db, battleId);
	await db.batch([
		db.prepare(`UPDATE battles SET status = 'removed' WHERE id = ?`).bind(battleId),
		// Its beats come off the store too (sold ones stay sold; the buyer keeps their files).
		db.prepare(`UPDATE listings SET status = 'removed', updated_at = ? WHERE battle_id = ? AND status != 'sold'`).bind(Date.now(), battleId)
	]);
	return true;
}

/** Put a removed battle back where it would be now (an early remove of an open or live battle). */
export async function restoreBattle(db: D1Database, battleId: string) {
	const b = await db
		.prepare('SELECT status, challenger_id, voting_ends_at FROM battles WHERE id = ?')
		.bind(battleId)
		.first<{ status: string; challenger_id: string | null; voting_ends_at: number | null }>();
	if (b?.status !== 'removed') return 'Only removed battles can be restored.';
	const removedBeats = await db.prepare('SELECT COUNT(*) AS n FROM entries WHERE battle_id = ? AND removed = 1').bind(battleId).first<{ n: number }>();
	if (removedBeats?.n) return "A beat in this battle was deleted, so it can't come back.";
	const status = b.challenger_id ? 'voting' : 'open';
	await db.batch([
		db.prepare('UPDATE battles SET status = ? WHERE id = ?').bind(status, battleId),
		// Listings come back as "off the store"; the producer chooses whether to relist.
		db.prepare(`UPDATE listings SET status = 'unlisted', updated_at = ? WHERE battle_id = ? AND status = 'removed'`).bind(Date.now(), battleId)
	]);
	// A live battle whose clock ran out while removed closes now with the votes it has.
	if (status === 'voting' && (b.voting_ends_at ?? 0) <= Date.now()) await finalizeBattle(db, battleId);
	return null;
}

/** Delete one beat's audio for good. The battle can't be judged without it, so it's voided. */
export async function removeBeat(db: D1Database, bucket: R2Bucket, battleId: string, slot: number) {
	// A battler's whole set comes down (every round, plus any overtime beat).
	const entries = await db
		.prepare('SELECT id, audio_key FROM entries WHERE battle_id = ? AND slot = ? AND removed = 0')
		.bind(battleId, slot)
		.all<{ id: string; audio_key: string }>();
	if (!entries.results.length) return false;
	for (const e of entries.results) {
		await bucket.delete(e.audio_key);
		await db.prepare('UPDATE entries SET removed = 1 WHERE id = ?').bind(e.id).run();
	}
	await voidBattle(db, battleId);
	return true;
}

/** Stop promos for a battle and refund credits for any that hadn't started. */
async function cancelPromos(db: D1Database, battleId: string) {
	const now = Date.now();
	const future = await db
		.prepare(`SELECT id, booked_by, source FROM promotions WHERE battle_id = ? AND cancelled = 0 AND starts_at > ?`)
		.bind(battleId, now)
		.all<{ id: string; booked_by: string; source: string }>();
	await db.batch([
		db.prepare(`UPDATE promotions SET ends_at = ? WHERE battle_id = ? AND cancelled = 0 AND starts_at <= ? AND ends_at > ?`).bind(now, battleId, now, now),
		db.prepare(`UPDATE promotions SET cancelled = 1 WHERE battle_id = ? AND cancelled = 0 AND starts_at > ?`).bind(battleId, now)
	]);
	for (const p of future.results) {
		if (p.source === 'credits') await addCredits(db, p.booked_by, CREDITS.promoPrice, 'promo_refund', `cancel-${p.id}`, 'Battle removed before the promo started');
	}
}

// ---------------------------------------------------------------------------
// Ballots

/** Override a ballot's weight (0 = doesn't count, 1 = full). Recorded in its flags. */
export async function setBallotWeight(db: D1Database, battleId: string, voterId: string, weight: number) {
	const tag = weight >= 1 ? 'mod_restored' : weight <= 0 ? 'mod_discounted' : 'mod_half';
	const row = await db.prepare('SELECT flags FROM votes WHERE battle_id = ? AND voter_id = ?').bind(battleId, voterId).first<{ flags: string }>();
	if (!row) return false;
	const flags = row.flags
		.split(',')
		.filter((f) => f && !f.startsWith('mod_'))
		.concat(tag)
		.join(',');
	await db.prepare('UPDATE votes SET weight = ?, flags = ? WHERE battle_id = ? AND voter_id = ?').bind(weight, flags, battleId, voterId).run();
	return true;
}

export async function deleteBallot(db: D1Database, battleId: string, voterId: string) {
	const r = await db.prepare('DELETE FROM votes WHERE battle_id = ? AND voter_id = ?').bind(battleId, voterId).run();
	return (r.meta.changes ?? 0) > 0;
}

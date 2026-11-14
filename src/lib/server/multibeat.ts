import { CATEGORIES, LISTEN_THRESHOLD, ballotWeight, castVote, type Scores } from './battles.ts';

/**
 * Judging for multi-beat battles. Each round is scored on its own (after hearing
 * 75% of both beats in that round) and saved, so judges can come back later. The
 * ballot only counts once every round is scored: at that point the votes row is
 * written with the per-category averages across rounds, through the same
 * fair-play checks as a single-beat ballot.
 */

export type BattleForVote = { id: string; creator_id: string; challenger_id: string; rounds: number };

async function heardRound(db: D1Database, voterId: string, battleId: string, round: number) {
	const heard = await db
		.prepare(
			`SELECT e.duration_ms, COALESCE(l.listened_ms, 0) AS listened
			 FROM entries e LEFT JOIN listens l ON l.entry_id = e.id AND l.user_id = ?
			 WHERE e.battle_id = ? AND e.round = ? AND e.removed = 0`
		)
		.bind(voterId, battleId, round)
		.all<{ duration_ms: number; listened: number }>();
	return heard.results.length === 2 && heard.results.every((h) => h.listened >= h.duration_ms * LISTEN_THRESHOLD);
}

const validScores = (s: Scores) => s.every((x) => CATEGORIES.every((c) => Number.isInteger(x[c]) && x[c] >= 1 && x[c] <= 5));

/** Save one round of a multi-beat ballot. Returns an error message, or how many rounds are now scored. */
export async function saveRoundVote(db: D1Database, voter: SessionUser, b: BattleForVote, round: number, scores: Scores, wantsOt: boolean) {
	if (!Number.isInteger(round) || round < 1 || round > b.rounds) return { error: 'Pick a round.' };
	if (!validScores(scores)) return { error: 'Rate every category for both beats (1–5 stars).' };
	if (!(await heardRound(db, voter.id, b.id, round))) return { error: `Listen to at least 75% of both beats in round ${round} first.` };
	const now = Date.now();
	const [a, c] = scores;
	await db
		.prepare(
			`INSERT INTO round_votes (battle_id, voter_id, round, s0_drums, s0_melody, s0_mix, s0_overall, s1_drums, s1_melody, s1_mix, s1_overall, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (battle_id, voter_id, round) DO UPDATE SET
			   s0_drums = excluded.s0_drums, s0_melody = excluded.s0_melody, s0_mix = excluded.s0_mix, s0_overall = excluded.s0_overall,
			   s1_drums = excluded.s1_drums, s1_melody = excluded.s1_melody, s1_mix = excluded.s1_mix, s1_overall = excluded.s1_overall,
			   updated_at = excluded.updated_at`
		)
		.bind(b.id, voter.id, round, a.drums, a.melody, a.mix, a.overall, c.drums, c.melody, c.mix, c.overall, now)
		.run();
	return { scored: await completeBallotIfReady(db, voter, b, wantsOt) };
}

/** When every round is scored, write (or refresh) the counted ballot. Returns rounds scored. */
async function completeBallotIfReady(db: D1Database, voter: SessionUser, b: BattleForVote, wantsOt: boolean) {
	const rows = await db
		.prepare('SELECT * FROM round_votes WHERE battle_id = ? AND voter_id = ? AND round <= ?')
		.bind(b.id, voter.id, b.rounds)
		.all<Record<string, number>>();
	if (rows.results.length < b.rounds) return rows.results.length;
	const avg = [0, 1].map((s) => {
		const out = {} as Record<(typeof CATEGORIES)[number], number>;
		for (const c of CATEGORIES) out[c] = Math.round((rows.results.reduce((t, r) => t + r[`s${s}_${c}`], 0) / rows.results.length) * 100) / 100;
		return out;
	}) as Scores;
	await castVote(db, voter, b, avg, wantsOt);
	return rows.results.length;
}

/** Flip the "I want overtime" flag on a complete ballot. */
export async function setWantsOt(db: D1Database, voterId: string, battleId: string, on: boolean) {
	await db.prepare('UPDATE votes SET wants_ot = ? WHERE battle_id = ? AND voter_id = ?').bind(on ? 1 : 0, battleId, voterId).run();
}

/** Score the overtime round. Same listening rule and fair-play weighting as any ballot. */
export async function saveOtVote(db: D1Database, voter: SessionUser, b: BattleForVote, scores: Scores) {
	const round = b.rounds + 1;
	if (!validScores(scores)) return { error: 'Rate every category for both beats (1–5 stars).' };
	if (!(await heardRound(db, voter.id, b.id, round))) return { error: 'Listen to at least 75% of both overtime beats first.' };
	const { weight, flags } = await ballotWeight(db, voter, b, scores);
	const [a, c] = scores;
	await db
		.prepare(
			`INSERT INTO round_votes (battle_id, voter_id, round, s0_drums, s0_melody, s0_mix, s0_overall, s1_drums, s1_melody, s1_mix, s1_overall, weight, flags, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (battle_id, voter_id, round) DO UPDATE SET
			   s0_drums = excluded.s0_drums, s0_melody = excluded.s0_melody, s0_mix = excluded.s0_mix, s0_overall = excluded.s0_overall,
			   s1_drums = excluded.s1_drums, s1_melody = excluded.s1_melody, s1_mix = excluded.s1_mix, s1_overall = excluded.s1_overall,
			   weight = excluded.weight, flags = excluded.flags, updated_at = excluded.updated_at`
		)
		.bind(b.id, voter.id, round, a.drums, a.melody, a.mix, a.overall, c.drums, c.melody, c.mix, c.overall, weight, flags.join(','), Date.now())
		.run();
	return { ok: true };
}

/**
 * A battler accepts overtime by dropping their beat (one step). Neither side's
 * overtime beat is shown until both are in; then the overtime vote opens.
 */
export async function submitOvertime(
	db: D1Database,
	b: BattleForVote & { status: string; ot_status: string | null; ot_deadline: number | null },
	userId: string,
	audio: { key: string; durationMs: number; peaks: string },
	newId: () => string,
	voteHours: number
) {
	if (b.status !== 'overtime' || b.ot_status !== 'offered') return 'Overtime is not open for this battle.';
	if ((b.ot_deadline ?? 0) <= Date.now()) return 'The overtime window has closed.';
	const slot = userId === b.creator_id ? 0 : userId === b.challenger_id ? 1 : -1;
	if (slot < 0) return 'Only the battlers can drop an overtime beat.';
	const round = b.rounds + 1;
	try {
		await db
			.prepare(`INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
			.bind(newId(), b.id, userId, slot, round, audio.key, audio.durationMs, audio.peaks, Date.now())
			.run();
	} catch {
		return 'You already dropped your overtime beat.';
	}
	const both = await db.prepare('SELECT COUNT(*) AS n FROM entries WHERE battle_id = ? AND round = ? AND removed = 0').bind(b.id, round).first<{ n: number }>();
	if ((both?.n ?? 0) >= 2) {
		await db
			.prepare(`UPDATE battles SET ot_status = 'voting', ot_ends_at = ? WHERE id = ? AND status = 'overtime' AND ot_status = 'offered'`)
			.bind(Date.now() + voteHours * 3_600_000, b.id)
			.run();
	}
	return null;
}

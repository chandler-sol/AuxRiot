import { newId, DAY, HOUR } from './util';
import { parseMp3 } from './mp3';
import { awardBattle } from './credits.ts';

export const MAX_DURATION_MS = 120_000;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const LISTEN_THRESHOLD = 0.75;
export const CATEGORIES = ['drums', 'melody', 'mix', 'overall'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface SlotResult {
	avg: Record<Category, number>;
	total: number; // mean of the four category averages
}
export interface BattleResult {
	slots: [SlotResult, SlotResult];
	countedVotes: number; // weighted ballots that counted (weight > 0)
	totalWeight: number;
}

// ---------------------------------------------------------------------------
// Uploads

export interface UploadedAudio {
	key: string;
	durationMs: number;
	peaks: string;
}

/**
 * Validate an MP3 produced by the in-browser encoder and store it in R2.
 * The browser already trimmed to 2:00; we re-check from the actual frames.
 */
export async function storeAudio(bucket: R2Bucket, file: File, peaksRaw: string): Promise<UploadedAudio | string> {
	if (!(file instanceof File) || file.size === 0) return 'Missing audio file.';
	if (file.size > MAX_UPLOAD_BYTES) return 'Audio file is too large.';
	const bytes = new Uint8Array(await file.arrayBuffer());
	const info = parseMp3(bytes);
	if (!info) return 'That file is not a valid MP3.';
	if (info.durationMs > MAX_DURATION_MS + 1500) return 'Beats must be 2:00 or shorter.';
	if (info.maxKbps > 320) return 'Unsupported bitrate.';

	let peaks: number[];
	try {
		peaks = JSON.parse(peaksRaw);
	} catch {
		return 'Bad waveform data.';
	}
	if (!Array.isArray(peaks) || peaks.length < 16 || peaks.length > 400 || !peaks.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) {
		return 'Bad waveform data.';
	}

	const key = `beats/${newId(16)}.mp3`;
	await bucket.put(key, bytes, {
		httpMetadata: { contentType: 'audio/mpeg', cacheControl: 'public, max-age=31536000, immutable' }
	});
	return { key, durationMs: Math.min(info.durationMs, MAX_DURATION_MS), peaks: JSON.stringify(peaks) };
}

// ---------------------------------------------------------------------------
// Lifecycle: battles are finalized lazily whenever lists/pages load, so we
// don't need a cron job (or a paid plan) to close voting on time.

export async function finalizeDue(db: D1Database, openExpiryDays: number) {
	const now = Date.now();
	await db.batch([
		db.prepare(
			`UPDATE promotions SET cancelled = 1 WHERE cancelled = 0 AND battle_id IN
			   (SELECT id FROM battles WHERE status = 'open' AND created_at < ?)`
		).bind(now - openExpiryDays * DAY),
		db.prepare(`UPDATE battles SET status = 'expired' WHERE status = 'open' AND created_at < ?`).bind(now - openExpiryDays * DAY)
	]);

	const due = await db
		.prepare(`SELECT id FROM battles WHERE status = 'voting' AND voting_ends_at <= ? LIMIT 25`)
		.bind(now)
		.all<{ id: string }>();
	for (const { id } of due.results) await finalizeBattle(db, id);
}

export async function computeResult(db: D1Database, battleId: string): Promise<BattleResult> {
	// Re-check shadowbans at close time so a ban applied mid-battle still zeroes those votes.
	const rows = await db
		.prepare(
			`SELECT v.*, u.shadowbanned FROM votes v JOIN users u ON u.id = v.voter_id WHERE v.battle_id = ?`
		)
		.bind(battleId)
		.all<Record<string, number>>();

	const sums = [0, 1].map(() => ({ drums: 0, melody: 0, mix: 0, overall: 0 }));
	let totalWeight = 0;
	let countedVotes = 0;
	for (const r of rows.results) {
		const w = r.shadowbanned ? 0 : r.weight;
		if (w <= 0) continue;
		countedVotes++;
		totalWeight += w;
		for (const s of [0, 1]) for (const c of CATEGORIES) sums[s][c] += w * r[`s${s}_${c}`];
	}
	const slots = sums.map((sum) => {
		const avg = { drums: 0, melody: 0, mix: 0, overall: 0 };
		for (const c of CATEGORIES) avg[c] = totalWeight ? round2(sum[c] / totalWeight) : 0;
		const total = round2((avg.drums + avg.melody + avg.mix + avg.overall) / 4);
		return { avg, total };
	}) as [SlotResult, SlotResult];
	return { slots, countedVotes, totalWeight: round2(totalWeight) };
}

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

export async function finalizeBattle(db: D1Database, battleId: string) {
	const battle = await db
		.prepare(`SELECT id, creator_id, challenger_id FROM battles WHERE id = ? AND status = 'voting'`)
		.bind(battleId)
		.first<{ id: string; creator_id: string; challenger_id: string }>();
	if (!battle) return;

	const result = await computeResult(db, battleId);
	const [a, b] = result.slots;
	// Higher overall average breaks a tie on the combined score.
	let winner: string | null = null;
	if (a.total !== b.total) winner = a.total > b.total ? battle.creator_id : battle.challenger_id;
	else if (a.avg.overall !== b.avg.overall) winner = a.avg.overall > b.avg.overall ? battle.creator_id : battle.challenger_id;

	// The status guard makes this idempotent if two requests race to close it.
	const closed = await db
		.prepare(`UPDATE battles SET status = 'closed', winner_id = ?, result_json = ? WHERE id = ? AND status = 'voting'`)
		.bind(winner, JSON.stringify(result), battleId)
		.run();
	if (!closed.meta.changes) return;

	if (winner) {
		const loser = winner === battle.creator_id ? battle.challenger_id : battle.creator_id;
		await db.batch([
			db.prepare('UPDATE users SET wins = wins + 1 WHERE id = ?').bind(winner),
			db.prepare('UPDATE users SET losses = losses + 1 WHERE id = ?').bind(loser)
		]);
	} else {
		await db
			.prepare('UPDATE users SET ties = ties + 1 WHERE id IN (?, ?)')
			.bind(battle.creator_id, battle.challenger_id)
			.run();
	}

	// Permanent per-battle record (used later to award credits retroactively).
	const closedAt = Date.now();
	const outcome = (uid: string) => (winner === null ? 'tie' : winner === uid ? 'win' : 'loss');
	const ins = db.prepare(
		`INSERT OR IGNORE INTO battle_outcomes (battle_id, user_id, outcome, score, opponent_score, counted_votes, closed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`
	);
	await db.batch([
		ins.bind(battleId, battle.creator_id, outcome(battle.creator_id), a.total, b.total, result.countedVotes, closedAt),
		ins.bind(battleId, battle.challenger_id, outcome(battle.challenger_id), b.total, a.total, result.countedVotes, closedAt),
		// A finished battle can't stay promoted: end any running promo now and drop future ones, freeing the slot.
		db.prepare(`UPDATE promotions SET ends_at = ? WHERE battle_id = ? AND cancelled = 0 AND starts_at <= ? AND ends_at > ?`).bind(closedAt, battleId, closedAt, closedAt),
		db.prepare(`UPDATE promotions SET cancelled = 1 WHERE battle_id = ? AND cancelled = 0 AND starts_at > ?`).bind(battleId, closedAt)
	]);

	// Battle Credits payout (rules and anti-farming checks live in credits.ts).
	await awardBattle(db, battleId);
}

// ---------------------------------------------------------------------------
// Listening progress (server side of the 75% listen-through rule)

/**
 * The client reports how many unique seconds it has played. We clamp that to
 * wall-clock time: across ALL beats in the battle, total credited listening can't
 * exceed the time since the user first pressed play on any of them. So a script
 * can't claim a full listen in one request, and playing both beats at once
 * (muted tabs) doesn't halve the wait.
 */
export async function recordListen(db: D1Database, userId: string, entryId: string, reportedMs: number) {
	const entry = await db
		.prepare('SELECT battle_id, duration_ms FROM entries WHERE id = ?')
		.bind(entryId)
		.first<{ battle_id: string; duration_ms: number }>();
	if (!entry) return null;
	const now = Date.now();
	const rows = await db
		.prepare(
			`SELECT l.entry_id, l.first_at, l.listened_ms FROM listens l JOIN entries e ON e.id = l.entry_id
			 WHERE l.user_id = ? AND e.battle_id = ?`
		)
		.bind(userId, entry.battle_id)
		.all<{ entry_id: string; first_at: number; listened_ms: number }>();

	const mine = rows.results.find((r) => r.entry_id === entryId);
	const others = rows.results.filter((r) => r.entry_id !== entryId);
	const battleStart = Math.min(now, ...rows.results.map((r) => r.first_at));
	const othersMs = others.reduce((sum, r) => sum + r.listened_ms, 0);
	const budget = now - battleStart + 3000 - othersMs;

	const prev = mine?.listened_ms ?? 0;
	const listened = Math.max(prev, Math.min(reportedMs, budget, entry.duration_ms));
	await db
		.prepare(
			`INSERT INTO listens (user_id, entry_id, first_at, last_at, listened_ms) VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (user_id, entry_id) DO UPDATE SET last_at = excluded.last_at, listened_ms = excluded.listened_ms`
		)
		.bind(userId, entryId, mine?.first_at ?? now, now, listened)
		.run();
	return { listenedMs: listened, durationMs: entry.duration_ms };
}

// ---------------------------------------------------------------------------
// Voting

export type Scores = [Record<Category, number>, Record<Category, number>];

/** Which fraud signals (salted IP / device hashes) the voter shares with either participant. */
export async function sharedSignals(db: D1Database, voterId: string, otherIds: string[]) {
	const rows = await db
		.prepare(
			`SELECT DISTINCT a.kind FROM user_signals a JOIN user_signals b
			   ON a.kind = b.kind AND a.value_hash = b.value_hash
			 WHERE a.user_id = ? AND b.user_id IN (?, ?)`
		)
		.bind(voterId, otherIds[0], otherIds[1])
		.all<{ kind: string }>();
	const kinds = new Set(rows.results.map((r) => r.kind));
	return { device: kinds.has('device'), ip: kinds.has('ip') };
}

/**
 * Store (or update) a ballot. Suspicious ballots are accepted normally from the
 * voter's point of view but silently weighted down — they never learn which
 * rule tripped.
 */
export async function castVote(
	db: D1Database,
	voter: SessionUser,
	battle: { id: string; creator_id: string; challenger_id: string },
	scores: Scores
) {
	const flags: string[] = [];
	let weight = 1;

	const totals = scores.map((s) => s.drums + s.melody + s.mix + s.overall);
	const favored = totals[0] === totals[1] ? null : totals[0] > totals[1] ? battle.creator_id : battle.challenger_id;

	if (voter.shadowbanned) {
		weight = 0;
		flags.push('shadowbanned');
	}
	const shared = await sharedSignals(db, voter.id, [battle.creator_id, battle.challenger_id]);
	if (shared.device) {
		// Same browser/device as a participant: almost certainly an alt.
		weight = 0;
		flags.push('shared_device');
	} else if (shared.ip) {
		// Same IP only: could be roommates or mobile carrier NAT, so discount rather than zero.
		weight = Math.min(weight, 0.5);
		flags.push('shared_ip');
	}
	if (favored) {
		// Pattern: almost every past ballot from this voter favors the same artist.
		const hist = await db
			.prepare(
				`SELECT COUNT(*) AS n, SUM(CASE WHEN favored_user_id = ? THEN 1 ELSE 0 END) AS same
				 FROM votes WHERE voter_id = ? AND battle_id != ?`
			)
			.bind(favored, voter.id, battle.id)
			.first<{ n: number; same: number | null }>();
		if (hist && hist.n >= 4 && (hist.same ?? 0) / hist.n >= 0.9) {
			weight = Math.min(weight, 0.25);
			flags.push('one_sided_history');
		}
	}

	const now = Date.now();
	const [a, b] = scores;
	await db
		.prepare(
			`INSERT INTO votes (battle_id, voter_id, s0_drums, s0_melody, s0_mix, s0_overall,
			   s1_drums, s1_melody, s1_mix, s1_overall, favored_user_id, weight, flags, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (battle_id, voter_id) DO UPDATE SET
			   s0_drums = excluded.s0_drums, s0_melody = excluded.s0_melody, s0_mix = excluded.s0_mix, s0_overall = excluded.s0_overall,
			   s1_drums = excluded.s1_drums, s1_melody = excluded.s1_melody, s1_mix = excluded.s1_mix, s1_overall = excluded.s1_overall,
			   favored_user_id = excluded.favored_user_id,
			   -- A moderator's override sticks even if the voter changes their scores.
			   weight = CASE WHEN instr(votes.flags, 'mod_') > 0 THEN votes.weight ELSE excluded.weight END,
			   flags = CASE WHEN instr(votes.flags, 'mod_') > 0 THEN votes.flags ELSE excluded.flags END,
			   updated_at = excluded.updated_at`
		)
		.bind(battle.id, voter.id, a.drums, a.melody, a.mix, a.overall, b.drums, b.melody, b.mix, b.overall, favored, weight, flags.join(','), now, now)
		.run();
}

export function voterAgeOk(user: SessionUser, minHours: number) {
	return Date.now() - user.createdAt >= minHours * HOUR;
}


import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, HOUR } from '#lib/server/util.ts';
import { logAction, requireMod } from '#lib/server/mod.ts';
import { CATEGORIES, finalizeBattle, type BattleResult } from '#lib/server/battles.ts';
import {
	deleteBallot,
	endVotingNow,
	getModBattle,
	recount,
	removeBeat,
	restoreBattle,
	setBallotWeight,
	setVotingEnd,
	voidBattle
} from '#lib/server/modtools.ts';

export const load: PageServerLoad = async ({ locals, platform, params }) => {
	requireMod(locals);
	const db = getEnv(platform).DB;
	let b = await getModBattle(db, params.id);
	if (!b) error(404, 'Battle not found');
	if (b.status === 'voting' && (b.voting_ends_at ?? 0) <= Date.now()) {
		await finalizeBattle(db, b.id);
		b = (await getModBattle(db, params.id))!;
	}

	const [entries, ballots, reports, log, comments, promos] = await Promise.all([
		db.prepare('SELECT id, user_id, slot, audio_key, duration_ms, removed, created_at FROM entries WHERE battle_id = ? ORDER BY slot')
			.bind(b.id)
			.all<{ id: string; user_id: string; slot: number; audio_key: string; duration_ms: number; removed: number; created_at: number }>(),
		db.prepare(
			`SELECT v.*, u.username, u.created_at AS joined, u.shadowbanned, u.suspended_at
			 FROM votes v JOIN users u ON u.id = v.voter_id WHERE v.battle_id = ?
			 ORDER BY v.weight ASC, v.updated_at DESC LIMIT 500`
		)
			.bind(b.id)
			.all<Record<string, number | string | null>>(),
		db.prepare(
			`SELECT r.id, r.reason, r.details, r.created_at, r.target_type, u.username AS reporter
			 FROM reports r JOIN users u ON u.id = r.reporter_id
			 WHERE r.status = 'open' AND ((r.target_type = 'battle' AND r.target_id = ?)
			    OR (r.target_type = 'comment' AND r.target_id IN (SELECT id FROM comments WHERE battle_id = ?)))
			 ORDER BY r.created_at DESC`
		)
			.bind(b.id, b.id)
			.all<{ id: string; reason: string; details: string; created_at: number; target_type: string; reporter: string }>(),
		db.prepare(
			`SELECT l.action, l.details, l.created_at, u.username AS actor FROM mod_log l JOIN users u ON u.id = l.actor_id
			 WHERE (l.target_type = 'battle' AND l.target_id = ?) OR (l.target_type = 'vote' AND l.target_id LIKE ?)
			 ORDER BY l.created_at DESC LIMIT 50`
		)
			.bind(b.id, `${b.id}:%`)
			.all<{ action: string; details: string; created_at: number; actor: string }>(),
		db.prepare(
			`SELECT COUNT(*) AS total, COALESCE(SUM(hidden), 0) AS hidden, COALESCE(SUM(held = 1 AND hidden = 0), 0) AS held FROM comments WHERE battle_id = ?`
		)
			.bind(b.id)
			.first<{ total: number; hidden: number; held: number }>(),
		db.prepare(`SELECT starts_at, ends_at, slot, source FROM promotions WHERE battle_id = ? AND cancelled = 0 AND ends_at > ? ORDER BY starts_at`)
			.bind(b.id, Date.now())
			.all<{ starts_at: number; ends_at: number; slot: number | null; source: string }>()
	]);

	const sum = (r: Record<string, unknown>, s: number) => CATEGORIES.reduce((t, c) => t + Number(r[`s${s}_${c}`]), 0);
	return {
		battle: {
			id: b.id,
			title: b.title,
			status: b.status,
			creator: b.creator,
			challenger: b.challenger,
			creatorId: b.creator_id,
			challengerId: b.challenger_id,
			voteHours: b.vote_hours,
			createdAt: b.created_at,
			votingStartedAt: b.voting_started_at,
			votingEndsAt: b.voting_ends_at,
			winnerId: b.winner_id,
			colorA: b.color_a,
			colorB: b.color_b,
			views: b.views,
			// Final results are public once closed; live tallies stay sealed, even here.
			result: b.status === 'closed' && b.result_json ? (JSON.parse(b.result_json) as BattleResult) : null
		},
		entries: entries.results.map((e) => ({ ...e, src: e.removed ? null : `/audio/${e.audio_key}` })),
		ballots: ballots.results.map((v) => ({
			voterId: String(v.voter_id),
			username: String(v.username),
			joined: Number(v.joined),
			shadowbanned: !!v.shadowbanned,
			suspended: !!v.suspended_at,
			weight: Number(v.weight),
			flags: String(v.flags ?? '').split(',').filter(Boolean),
			a: sum(v, 0),
			b: sum(v, 1),
			updatedAt: Number(v.updated_at)
		})),
		reports: reports.results,
		log: log.results,
		comments: comments ?? { total: 0, hidden: 0, held: 0 },
		promos: promos.results,
		now: Date.now()
	};
};

async function ctx(locals: App.Locals, platform: App.Platform | undefined, id: string) {
	const me = requireMod(locals);
	const env = getEnv(platform);
	const b = await getModBattle(env.DB, id);
	if (!b) error(404, 'Battle not found');
	return { me, env, db: env.DB, b };
}

const note = (f: FormData) => String(f.get('note') ?? '').trim().slice(0, 300);

export const actions: Actions = {
	endNow: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		if (!(await endVotingNow(db, b.id))) return fail(400, { error: 'Only live battles can be ended early.' });
		await logAction(db, me, 'battle.end_now', 'battle', b.id, note(f));
		return { ok: 'Voting closed and the result is published.' };
	},

	clock: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		const mode = String(f.get('mode'));
		const hours = Number(f.get('hours'));
		if (!Number.isFinite(hours) || hours === 0 || Math.abs(hours) > 168) return fail(400, { error: 'Pick a number of hours (up to 168).' });
		const base = mode === 'from_now' ? Date.now() : (b.voting_ends_at ?? Date.now());
		const ends = base + hours * HOUR;
		const err = await setVotingEnd(db, b.id, ends);
		if (err) return fail(400, { error: err });
		await logAction(db, me, 'battle.clock', 'battle', b.id, `${mode === 'from_now' ? 'set to' : hours > 0 ? 'extended' : 'shortened'} ${Math.abs(hours)}h → ${new Date(ends).toISOString()}${note(f) ? ' — ' + note(f) : ''}`);
		return { ok: 'Clock updated.' };
	},

	recount: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		if (!(await recount(db, b.id))) return fail(400, { error: 'Only finished battles can be recounted.' });
		await logAction(db, me, 'battle.recount', 'battle', b.id, note(f));
		return { ok: 'Recounted. Records and credits now match the new result.' };
	},

	void: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		if (!note(f)) return fail(400, { error: 'Add a reason so the log explains why.' });
		if (!(await voidBattle(db, b.id))) return fail(400, { error: 'Already removed.' });
		await logAction(db, me, 'battle.remove', 'battle', b.id, `was ${b.status} — ${note(f)}`);
		return { ok: b.status === 'closed' ? 'Battle removed. Its result, W-L records and credits were reversed.' : 'Battle removed.' };
	},

	restore: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		const err = await restoreBattle(db, b.id);
		if (err) return fail(400, { error: err });
		await logAction(db, me, 'battle.restore', 'battle', b.id, note(f));
		return { ok: 'Battle restored.' };
	},

	removeBeat: async ({ locals, platform, params, request }) => {
		const { me, env, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		const slot = Number(f.get('slot'));
		if (slot !== 0 && slot !== 1) return fail(400, { error: 'Pick a beat.' });
		if (!note(f)) return fail(400, { error: 'Add a reason so the log explains why.' });
		if (!(await removeBeat(db, env.AUDIO, b.id, slot))) return fail(400, { error: 'That beat is already gone.' });
		await logAction(db, me, 'entry.remove', 'battle', b.id, `${slot === 0 ? b.creator : b.challenger}'s beat — ${note(f)}`);
		return { ok: "Beat deleted and the battle pulled (it can't be judged with one beat)." };
	},

	ballot: async ({ locals, platform, params, request }) => {
		const { me, db, b } = await ctx(locals, platform, params.id);
		const f = await request.formData();
		const voterId = String(f.get('voter_id') ?? '');
		const op = String(f.get('op'));
		const voter = await db.prepare('SELECT username FROM users WHERE id = ?').bind(voterId).first<{ username: string }>();
		if (!voter) return fail(404, { error: 'Voter not found.' });
		if (b.status !== 'voting' && b.status !== 'closed') return fail(400, { error: "This battle isn't being judged." });

		let done = false;
		if (op === 'delete') done = await deleteBallot(db, b.id, voterId);
		else {
			const weight = op === 'zero' ? 0 : op === 'half' ? 0.5 : 1;
			done = await setBallotWeight(db, b.id, voterId, weight);
		}
		if (!done) return fail(404, { error: 'Ballot not found.' });
		const recounted = b.status === 'closed' ? await recount(db, b.id) : false;
		await logAction(db, me, `vote.${op}`, 'vote', `${b.id}:${voterId}`, `${voter.username}${recounted ? ' (recounted)' : ''}`);
		const what = { delete: 'deleted', zero: "won't count", half: 'counts half', full: 'counts in full' }[op] ?? 'updated';
		return { ok: `${voter.username}'s ballot ${what}.${recounted ? ' Result recounted.' : ''}` };
	}
};

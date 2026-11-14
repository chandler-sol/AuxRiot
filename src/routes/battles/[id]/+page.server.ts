import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	CATEGORIES,
	LISTEN_THRESHOLD,
	castVote,
	finalizeBattle,
	finalizeOvertime,
	storeAudio,
	voterAgeOk,
	type BattleResult,
	type Scores
} from '#lib/server/battles.ts';
import { getEnv, newId, sha256, HOUR } from '#lib/server/util.ts';
import { getVoterMinAgeHours } from '#lib/server/settings.ts';
import { previewSlot, promoStatus } from '#lib/server/promos.ts';
import { CREDITS, buyPromotion, getMinVotes } from '#lib/server/credits.ts';
import { challengerColor, creatorColor } from '#lib/colors.ts';
import { getBlockedWords, logAction, matchesBlocked } from '#lib/server/mod.ts';
import { refreshComment, toggleUpvote } from '#lib/server/respect.ts';
import { notifyAnswered } from '#lib/server/notify.ts';
import { buyOpen } from '#lib/server/store.ts';
import { saveOtVote, saveRoundVote, setWantsOt, submitOvertime } from '#lib/server/multibeat.ts';
import { OPEN_PREVIEW_SECONDS, OT_VOTE_HOURS, formatOf } from '#lib/battleformat.ts';

interface BattleRow {
	id: string;
	title: string;
	status: string;
	creator_id: string;
	challenger_id: string | null;
	vote_hours: number;
	created_at: number;
	voting_started_at: number | null;
	voting_ends_at: number | null;
	winner_id: string | null;
	result_json: string | null;
	color_a: string | null;
	color_b: string | null;
	views: number;
	rounds: number;
	ot_status: string | null;
	ot_mode: string | null;
	ot_deadline: number | null;
	ot_ends_at: number | null;
	base_result_json: string | null;
	creator: string;
	challenger: string | null;
}

async function getBattle(db: D1Database, id: string) {
	return db
		.prepare(
			`SELECT b.*, c.username AS creator, ch.username AS challenger
			 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
			 WHERE b.id = ?`
		)
		.bind(id)
		.first<BattleRow>();
}

export const load: PageServerLoad = async ({ params, platform, locals }) => {
	const env = getEnv(platform);
	let battle = await getBattle(env.DB, params.id);
	if (!battle || battle.status === 'removed') error(404, 'Battle not found');

	if (battle.status === 'voting' && battle.voting_ends_at! <= Date.now()) {
		await finalizeBattle(env.DB, battle.id);
		battle = (await getBattle(env.DB, params.id))!;
	}
	if (battle.status === 'overtime') {
		await finalizeOvertime(env.DB, battle.id);
		battle = (await getBattle(env.DB, params.id))!;
	}

	const user = locals.user;
	const newView = await countView(env, battle.id, locals.deviceId);
	const isBattler = !!user && (user.id === battle.creator_id || user.id === battle.challenger_id);
	const promo = isBattler || user?.isAdmin ? await promoStatus(env.DB, battle.id, Date.now()) : null;

	// Credits: what this battler earned here, and promo options while the battle is open or live.
	let credits: null | {
		earned: number | null;
		reason: string | null;
		minVotes: number;
		balance: number;
		price: number;
		hours: number;
		canPromote: boolean;
		nextSlot: { start: number; slot: number } | null;
	} = null;
	if (isBattler) {
		const minVotes = await getMinVotes(env.DB);
		const award = await env.DB.prepare(
			"SELECT amount FROM credit_ledger WHERE user_id = ? AND ref = ? AND reason LIKE 'battle_%'"
		)
			.bind(user!.id, battle.id)
			.first<{ amount: number }>();
		let reason: string | null = null;
		if (battle.status === 'closed' && !award) {
			const o = await env.DB.prepare('SELECT counted_votes FROM battle_outcomes WHERE battle_id = ? LIMIT 1').bind(battle.id).first<{ counted_votes: number }>();
			reason = o && o.counted_votes < minVotes ? 'votes' : 'rules';
		}
		const bal = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(user!.id).first<{ credits: number }>();
		const canPromote = battle.status === 'open' || battle.status === 'voting' || battle.status === 'overtime';
		credits = {
			earned: award?.amount ?? null,
			reason,
			minVotes,
			balance: bal?.credits ?? 0,
			price: CREDITS.promoPrice,
			hours: CREDITS.promoHours,
			canPromote,
			nextSlot: canPromote ? await previewSlot(env.DB, battle.id, CREDITS.promoHours) : null
		};
	}
	const [entries, comments, voteCount, myVote, listens] = await Promise.all([
		env.DB.prepare(`SELECT id, user_id, slot, round, audio_key, duration_ms, peaks, removed FROM entries WHERE battle_id = ? ORDER BY round, slot`)
			.bind(battle.id)
			.all<{ id: string; user_id: string; slot: number; round: number; audio_key: string; duration_ms: number; peaks: string; removed: number }>(),
		env.DB.prepare(
			// Held comments (blocked words) and shadowbanned authors are only visible to the author.
			`SELECT m.id, m.body, m.created_at, m.user_id, m.held, m.upvotes, u.username, u.avatar_key, u.color, u.respect,
			        COALESCE((SELECT cv.counted + 1 FROM comment_votes cv WHERE cv.comment_id = m.id AND cv.user_id = ?), 0) AS upvoted
			 FROM comments m JOIN users u ON u.id = m.user_id
			 WHERE m.battle_id = ? AND m.hidden = 0 AND ((u.shadowbanned = 0 AND m.held = 0) OR m.user_id = ?)
			 ORDER BY m.created_at ASC LIMIT 500`
		)
			.bind(user?.id ?? '', battle.id, user?.id ?? '')
			.all<{ id: string; body: string; created_at: number; user_id: string; held: number; upvotes: number; username: string; avatar_key: string | null; color: string | null; respect: number; upvoted: number }>(),
		env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE battle_id = ?').bind(battle.id).first<{ n: number }>(),
		user
			? env.DB.prepare('SELECT * FROM votes WHERE battle_id = ? AND voter_id = ?').bind(battle.id, user.id).first<Record<string, number>>()
			: null,
		user
			? env.DB.prepare(
					`SELECT l.entry_id, l.listened_ms FROM listens l JOIN entries e ON e.id = l.entry_id WHERE e.battle_id = ? AND l.user_id = ?`
				)
					.bind(battle.id, user.id)
					.all<{ entry_id: string; listened_ms: number }>()
			: null
	]);

	const listenMap = Object.fromEntries((listens?.results ?? []).map((l) => [l.entry_id, l.listened_ms]));
	const isParticipant = !!user && (user.id === battle.creator_id || user.id === battle.challenger_id);
	const minHours = await getVoterMinAgeHours(env.DB, env);

	let voteBlock: string | null = null;
	if (battle.status === 'voting' || (battle.status === 'overtime' && battle.ot_status === 'voting')) {
		if (!user) voteBlock = 'login';
		else if (isParticipant) voteBlock = 'participant';
		else if (!user.emailVerified) voteBlock = 'unverified';
		else if (!voterAgeOk(user, minHours)) voteBlock = 'age';
	}

	// What each person can hear:
	// - open challenge: only round 1's first 10 seconds (the creator hears all of theirs);
	// - overtime beats: hidden until both battlers have dropped theirs.
	const rounds = battle.rounds || 1;
	const isCreator = !!user && user.id === battle.creator_id;
	const otVisible = battle.ot_status === 'voting' || battle.status === 'closed';
	const visibleEntries = entries.results.filter((e) => {
		if (battle.status === 'open' && !isCreator && e.round > 1) return false;
		if (e.round > rounds && !otVisible && e.user_id !== user?.id) return false;
		return true;
	});
	const previewOpen = battle.status === 'open' && !isCreator ? OPEN_PREVIEW_SECONDS : null;

	// Multi-beat ballot progress and overtime state for this viewer.
	let roundVotes: Record<number, Scores> = {};
	if (user && rounds > 1) {
		const rv = await env.DB.prepare('SELECT * FROM round_votes WHERE battle_id = ? AND voter_id = ?').bind(battle.id, user.id).all<Record<string, number>>();
		roundVotes = Object.fromEntries(rv.results.map((r) => [r.round, [0, 1].map((s) => Object.fromEntries(CATEGORIES.map((c) => [c, r[`s${s}_${c}`]]))) as Scores]));
	}
	const otEntries = entries.results.filter((e) => e.round === rounds + 1 && !e.removed);
	const overtime =
		battle.ot_status || battle.status === 'overtime'
			? {
					status: battle.ot_status,
					mode: battle.ot_mode,
					deadline: battle.ot_deadline,
					endsAt: battle.ot_ends_at,
					submitted: [otEntries.some((e) => e.slot === 0), otEntries.some((e) => e.slot === 1)] as [boolean, boolean],
					mine: !!user && otEntries.some((e) => e.user_id === user.id),
					base: battle.base_result_json ? (JSON.parse(battle.base_result_json) as BattleResult) : null,
					myVote: user && rounds > 1 ? (roundVotes[rounds + 1] ?? null) : null
				}
			: null;

	return {
		format: { rounds, ...formatOf(rounds) },
		roundVotes,
		wantsOt: !!myVote?.wants_ot,
		overtime,
		previewSeconds: previewOpen,
		hiddenRounds: battle.status === 'open' && !isCreator ? rounds - 1 : 0,
		battle: {
			id: battle.id,
			title: battle.title,
			status: battle.status,
			creatorId: battle.creator_id,
			challengerId: battle.challenger_id,
			creator: battle.creator,
			challenger: battle.challenger,
			voteHours: battle.vote_hours,
			createdAt: battle.created_at,
			votingEndsAt: battle.voting_ends_at,
			winnerId: battle.winner_id,
			colorA: battle.color_a,
			colorB: battle.color_b,
			result: battle.result_json ? (JSON.parse(battle.result_json) as BattleResult) : null
		},
		entries: visibleEntries.map((e) => ({
			id: e.id,
			userId: e.user_id,
			slot: e.slot,
			round: e.round,
			src: e.removed ? null : `/audio/${e.audio_key}`,
			durationMs: e.duration_ms,
			peaks: JSON.parse(e.peaks) as number[],
			listenedMs: listenMap[e.id] ?? 0
		})),
		// The voter always sees their own upvote in the count, even when it silently doesn't count.
		comments: comments.results.map(({ upvoted, ...c }) => ({
			...c,
			mine: upvoted > 0,
			score: c.upvotes + (upvoted === 1 || (upvoted === 2 && user?.shadowbanned) ? 1 : 0)
		})),
		voteCount: voteCount?.n ?? 0,
		myVote: myVote
			? ([0, 1].map((s) => Object.fromEntries(CATEGORIES.map((c) => [c, myVote[`s${s}_${c}`]]))) as Scores)
			: null,
		voteBlock,
		voterUnlockAt: user ? user.createdAt + minHours * HOUR : null,
		canRespond: battle.status === 'open' && !!user && user.id !== battle.creator_id,
		threshold: LISTEN_THRESHOLD,
		og: battleOg(battle),
		credits,
		// Voters see what judging this battle earned them once it's closed.
		judged:
			user && battle.status === 'closed' && !isBattler
				? ((
						await env.DB.prepare(`SELECT SUM(amount) AS amount FROM credit_ledger WHERE user_id = ? AND ref IN (?, ?) AND reason = 'judge_reward'`)
							.bind(user.id, battle.id, `${battle.id}:ot`)
							.first<{ amount: number | null }>()
					)?.amount ?? null)
				: null,
		promo,
		sale: await saleInfo(env.DB, battle.id, battle.status, user?.id ?? null),
		views: battle.views + (newView ? 1 : 0),
		now: Date.now()
	};
};

/** Store status for each beat in this battle (public prices; the battler also sees their own drafts). */
async function saleInfo(db: D1Database, battleId: string, status: string, userId: string | null) {
	const rows = await db
		.prepare(
			`SELECT l.id, l.status, l.price_cents, l.stems_price_cents, l.stems_key IS NOT NULL AS has_stems, l.file_format, l.tagged, l.seller_id, e.slot
			 FROM listings l JOIN entries e ON e.id = l.entry_id WHERE l.battle_id = ?`
		)
		.bind(battleId)
		.all<{ id: string; status: string; price_cents: number | null; stems_price_cents: number | null; has_stems: number; file_format: string | null; tagged: number; seller_id: string; slot: number; round: number }>();
	const open = buyOpen(status);
	const visible = rows.results.filter((r) => r.status === 'listed' || r.status === 'sold' || r.seller_id === userId);
	const ids = visible.map((r) => r.id);
	// Public Q&A per listing. Held (blocked words) questions show only to their author and the producer.
	const qs = ids.length
		? (
				await db
					.prepare(
						`SELECT q.id, q.listing_id, q.body, q.answer, q.answered_at, q.created_at, q.held, q.user_id, u.username, u.avatar_key, u.color, u.respect
						 FROM listing_questions q JOIN users u ON u.id = q.user_id
						 WHERE q.listing_id IN (${ids.map(() => '?').join(',')}) AND q.hidden = 0
						   AND ((q.held = 0 AND u.shadowbanned = 0) OR q.user_id = ? OR EXISTS (SELECT 1 FROM listings l WHERE l.id = q.listing_id AND l.seller_id = ?))
						 ORDER BY q.created_at ASC LIMIT 200`
					)
					.bind(...ids, userId ?? '', userId ?? '')
					.all<{ id: string; listing_id: string; body: string; answer: string | null; answered_at: number | null; created_at: number; held: number; user_id: string; username: string; avatar_key: string | null; color: string | null; respect: number }>()
			).results
		: [];
	return visible
		.map((r) => ({
			listingId: r.id,
			questions: qs.filter((q) => q.listing_id === r.id).map(({ listing_id, ...q }) => q),
			slot: r.slot,
			round: r.round,
			status: r.status,
			mine: r.seller_id === userId,
			priceCents: r.price_cents,
			stemsPriceCents: r.has_stems ? r.stems_price_cents : null,
			format: r.file_format,
			tagged: !!r.tagged,
			buyOpen: open
		}));
}

function battleOg(b: BattleRow) {
	return { ...battleOgText(b), image: `/og/battle/${b.id}.png` };
}

function battleOgText(b: BattleRow) {
	const vs = `${b.creator} vs ${b.challenger ?? '???'}`;
	if (b.status === 'open') {
		return { title: `${b.creator} wants smoke — who's answering? · AuxRiot`, description: `"${b.title}" — open 1v1 beat battle. First producer to answer takes corner B.` };
	}
	if (b.status === 'voting') {
		const h = b.voting_ends_at ? Math.max(1, Math.round((b.voting_ends_at - Date.now()) / 3_600_000)) : 0;
		return { title: `${vs} · live vote · AuxRiot`, description: `"${b.title}" — listen to both beats and score it.${h ? ` Voting closes in ~${h}h.` : ''}` };
	}
	if (b.status === 'closed') {
		const winner = b.winner_id === null ? null : b.winner_id === b.creator_id ? b.creator : b.challenger;
		return { title: `${winner ? `${winner} wins` : 'Dead even'} — ${vs} · AuxRiot`, description: `"${b.title}" — final scores are in. Hear both beats and see the card.` };
	}
	return { title: `${vs} · AuxRiot`, description: `"${b.title}" on AuxRiot.` };
}

/** One view per device per battle; repeat visits and refreshes don't count again. */
async function countView(env: Env, battleId: string, deviceId: string) {
	const viewer = await sha256((env.SIGNAL_SALT ?? 'dev-salt') + ':v:' + deviceId);
	const ins = await env.DB.prepare('INSERT OR IGNORE INTO battle_views (battle_id, viewer_hash, viewed_at) VALUES (?, ?, ?)')
		.bind(battleId, viewer, Date.now())
		.run();
	if (!ins.meta.changes) return false;
	await env.DB.prepare('UPDATE battles SET views = views + 1 WHERE id = ?').bind(battleId).run();
	return true;
}

/** Why this user can't judge this battle (null if they can). */
async function voteEligibility(env: Env, user: SessionUser, battle: BattleRow) {
	if (user.id === battle.creator_id || user.id === battle.challenger_id) return "You can't vote in your own battle.";
	if (!user.emailVerified) return 'Confirm your email to vote — check your inbox for the link.';
	if (!voterAgeOk(user, await getVoterMinAgeHours(env.DB, env))) return 'Your account is too new to vote yet.';
	return null;
}

function readScores(form: FormData) {
	return [0, 1].map((s) => {
		const r = {} as Record<(typeof CATEGORIES)[number], number>;
		for (const c of CATEGORIES) r[c] = Number(form.get(`s${s}_${c}`));
		return r;
	}) as Scores;
}

function requireUser(locals: App.Locals, path: string) {
	if (!locals.user) redirect(303, `/login?next=${encodeURIComponent(path)}`);
	return locals.user;
}

export const actions: Actions = {
	respond: async ({ request, params, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv(platform);
		const form = await request.formData();
		if (form.get('ack_rights') !== 'on') return fail(400, { respondError: 'Please confirm the copyright notice.' });

		const battle = await getBattle(env.DB, params.id);
		if (!battle || battle.status !== 'open') return fail(400, { respondError: 'Someone already took this battle.' });
		if (battle.creator_id === user.id) return fail(400, { respondError: "You can't battle yourself." });

		// The challenger answers with one beat per round, all at once, so the battle never stalls halfway.
		const rounds = battle.rounds || 1;
		const beats: { key: string; durationMs: number; peaks: string }[] = [];
		for (let i = 0; i < rounds; i++) {
			const file = (form.get(`audio_${i}`) ?? (i === 0 ? form.get('audio') : null)) as File;
			const peaks = String(form.get(`peaks_${i}`) ?? (i === 0 ? form.get('peaks') : '') ?? '');
			const audio = await storeAudio(env.AUDIO, file, peaks);
			if (typeof audio === 'string') {
				for (const b of beats) await env.AUDIO.delete(b.key);
				return fail(400, { respondError: rounds > 1 ? `Round ${i + 1}: ${audio}` : audio });
			}
			beats.push(audio);
		}

		// "First to enter takes it": UNIQUE(battle_id, slot, round) means only one challenger's
		// inserts can ever succeed, and the batch runs as a single transaction.
		const now = Date.now();
		const ends = now + battle.vote_hours * HOUR;
		const me = await env.DB.prepare('SELECT color FROM users WHERE id = ?').bind(user.id).first<{ color: string | null }>();
		const colorA = battle.color_a ?? creatorColor(battle.id, null);
		const colorB = challengerColor(battle.id, colorA, me?.color);
		try {
			const res = await env.DB.batch([
				...beats.map((b, i) =>
					env.DB.prepare(
						`INSERT INTO entries (id, battle_id, user_id, slot, round, audio_key, duration_ms, peaks, created_at)
						 SELECT ?, id, ?, 1, ?, ?, ?, ?, ? FROM battles WHERE id = ? AND status = 'open' AND creator_id != ?`
					).bind(newId(), user.id, i + 1, b.key, b.durationMs, b.peaks, now, battle.id, user.id)
				),
				env.DB.prepare(
					`UPDATE battles SET challenger_id = ?, status = 'voting', voting_started_at = ?, voting_ends_at = ?, color_a = ?, color_b = ?
					 WHERE id = ? AND status = 'open'
					   AND (SELECT COUNT(*) FROM entries WHERE battle_id = ? AND slot = 1 AND user_id = ?) = ?`
				).bind(user.id, now, ends, colorA, colorB, battle.id, battle.id, user.id, rounds)
			]);
			if (!res[res.length - 1].meta.changes) throw new Error('lost race');
		} catch {
			for (const b of beats) await env.AUDIO.delete(b.key);
			return fail(409, { respondError: 'Too slow — someone else answered this battle first.' });
		}
		notifyAnswered(env.DB, battle.id);
		return { responded: true };
	},

	vote: async ({ request, params, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv(platform);
		const battle = await getBattle(env.DB, params.id);
		if (!battle || battle.status !== 'voting' || battle.voting_ends_at! <= Date.now()) {
			return fail(400, { voteError: 'Voting is closed for this battle.' });
		}
		if ((battle.rounds || 1) > 1) return fail(400, { voteError: 'Score this battle round by round.' });
		if (user.id === battle.creator_id || user.id === battle.challenger_id) {
			return fail(403, { voteError: "You can't vote in your own battle." });
		}
		if (!user.emailVerified) {
			return fail(403, { voteError: 'Confirm your email to vote — check your inbox for the link.' });
		}
		if (!voterAgeOk(user, await getVoterMinAgeHours(env.DB, env))) {
			return fail(403, { voteError: 'Your account is too new to vote yet.' });
		}

		const form = await request.formData();
		const scores = [0, 1].map((s) => {
			const r = {} as Record<(typeof CATEGORIES)[number], number>;
			for (const c of CATEGORIES) r[c] = Number(form.get(`s${s}_${c}`));
			return r;
		}) as Scores;
		if (!scores.every((s) => CATEGORIES.every((c) => Number.isInteger(s[c]) && s[c] >= 1 && s[c] <= 5))) {
			return fail(400, { voteError: 'Rate every category for both beats (1–5 stars).' });
		}

		// Listen-through: must have heard at least 75% of each beat (server-verified).
		const heard = await env.DB.prepare(
			`SELECT e.duration_ms, COALESCE(l.listened_ms, 0) AS listened
			 FROM entries e LEFT JOIN listens l ON l.entry_id = e.id AND l.user_id = ?
			 WHERE e.battle_id = ?`
		)
			.bind(user.id, battle.id)
			.all<{ duration_ms: number; listened: number }>();
		if (heard.results.length !== 2 || heard.results.some((h) => h.listened < h.duration_ms * LISTEN_THRESHOLD)) {
			return fail(400, { voteError: 'Listen to at least 75% of both beats before voting.' });
		}

		await castVote(env.DB, user, { id: battle.id, creator_id: battle.creator_id, challenger_id: battle.challenger_id! }, scores);
		return { voted: true };
	},

	voteRound: async ({ request, params, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv();
		const battle = await getBattle(env.DB, params.id);
		if (!battle || battle.status !== 'voting' || battle.voting_ends_at! <= Date.now()) return fail(400, { voteError: 'Voting is closed for this battle.' });
		const block = await voteEligibility(env, user, battle);
		if (block) return fail(403, { voteError: block });
		const form = await request.formData();
		const round = Number(form.get('round'));
		const res = await saveRoundVote(env.DB, user, { ...battle, challenger_id: battle.challenger_id!, rounds: battle.rounds }, round, readScores(form), form.get('wants_ot') === 'on');
		if ('error' in res) return fail(400, { voteError: res.error, voteRound: round });
		return { roundSaved: round, scored: res.scored };
	},

	wantsOt: async ({ request, params, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv();
		const battle = await getBattle(env.DB, params.id);
		if (!battle || battle.status !== 'voting') return fail(400, { voteError: 'Voting is closed for this battle.' });
		await setWantsOt(env.DB, user.id, battle.id, (await request.formData()).get('on') === '1');
		return { wantsOtSaved: true };
	},

	submitOt: async ({ request, params, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv();
		const battle = await getBattle(env.DB, params.id);
		if (!battle) return fail(404, { otError: 'Battle not found.' });
		const form = await request.formData();
		if (form.get('ack_rights') !== 'on') return fail(400, { otError: 'Please confirm the copyright notice.' });
		const audio = await storeAudio(env.AUDIO, form.get('audio') as File, String(form.get('peaks') ?? ''));
		if (typeof audio === 'string') return fail(400, { otError: audio });
		const err = await submitOvertime(env.DB, { ...battle, challenger_id: battle.challenger_id! }, user.id, audio, newId, OT_VOTE_HOURS);
		if (err) {
			await env.AUDIO.delete(audio.key);
			return fail(400, { otError: err });
		}
		return { otSubmitted: true };
	},

	voteOt: async ({ request, params, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv();
		const battle = await getBattle(env.DB, params.id);
		if (!battle || battle.status !== 'overtime' || battle.ot_status !== 'voting' || (battle.ot_ends_at ?? 0) <= Date.now()) {
			return fail(400, { voteError: 'The overtime vote is closed.' });
		}
		const block = await voteEligibility(env, user, battle);
		if (block) return fail(403, { voteError: block });
		const res = await saveOtVote(env.DB, user, { ...battle, challenger_id: battle.challenger_id! }, readScores(await request.formData()));
		if ('error' in res) return fail(400, { voteError: res.error });
		return { otVoted: true };
	},

	promote: async ({ request, params, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv(platform);
		const battle = await getBattle(env.DB, params.id);
		if (!battle || (user.id !== battle.creator_id && user.id !== battle.challenger_id)) {
			return fail(403, { promoError: 'Only the producers in this battle can promote it.' });
		}
		const res = await buyPromotion(env.DB, user.id, battle.id);
		if (!res.ok) return fail(400, { promoError: res.error });
		return { promoted: { slot: res.slot, startsAt: res.startsAt, endsAt: res.endsAt, startsNow: res.startsNow, cost: res.cost } };
	},

	comment: async ({ request, params, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const env = getEnv(platform);
		const body = String((await request.formData()).get('body') ?? '').trim();
		if (body.length < 1 || body.length > 1000) return fail(400, { commentError: 'Comments are 1–1000 characters.' });

		const last = await env.DB.prepare('SELECT created_at FROM comments WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
			.bind(user.id)
			.first<{ created_at: number }>();
		if (last && Date.now() - last.created_at < 10_000) return fail(429, { commentError: 'Slow down a little.', body });

		const battle = await env.DB.prepare(`SELECT status FROM battles WHERE id = ?`).bind(params.id).first<{ status: string }>();
		if (!battle || battle.status === 'removed') return fail(404, { commentError: 'Battle not found.' });

		const held = matchesBlocked(body, await getBlockedWords(env.DB)) ? 1 : 0;
		await env.DB.prepare('INSERT INTO comments (id, battle_id, user_id, body, created_at, held) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(newId(), params.id, user.id, body, Date.now(), held)
			.run();
		return { commented: true, held: !!held };
	},

	deleteComment: async ({ request, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const id = String((await request.formData()).get('id') ?? '');
		const db = getEnv(platform).DB;
		const c = await db.prepare('SELECT user_id, body FROM comments WHERE id = ?').bind(id).first<{ user_id: string; body: string }>();
		if (!c) return { deleted: true };
		if (c.user_id === user.id) await db.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();
		else if (user.isMod) {
			await db.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();
			await logAction(db, user, 'comment.hide', 'comment', id, c.body.slice(0, 120));
		}
		await refreshComment(db, id);
		return { deleted: true };
	},

	upvote: async ({ request, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const id = String((await request.formData()).get('id') ?? '');
		const res = await toggleUpvote(getEnv(platform).DB, user, id);
		if ('error' in res) return fail(400, { upvoteError: res.error, upvoteId: id });
		return { upvoted: res.on, upvoteId: id };
	},

	ask: async ({ request, params, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const db = getEnv().DB;
		const f = await request.formData();
		const listingId = String(f.get('listing_id') ?? '');
		const body = String(f.get('body') ?? '').trim();
		if (!user.emailVerified) return fail(403, { qError: 'Confirm your email to ask questions.', qListing: listingId });
		if (body.length < 3 || body.length > 500) return fail(400, { qError: 'Questions are 3–500 characters.', qListing: listingId, qBody: body });
		const l = await db.prepare(`SELECT seller_id, status FROM listings WHERE id = ? AND battle_id = ?`).bind(listingId, params.id).first<{ seller_id: string; status: string }>();
		if (!l || (l.status !== 'listed' && l.status !== 'sold')) return fail(404, { qError: 'That beat is not for sale.', qListing: listingId });
		if (l.seller_id === user.id) return fail(400, { qError: 'Answer questions instead of asking them 😄', qListing: listingId });
		const last = await db.prepare('SELECT created_at FROM listing_questions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').bind(user.id).first<{ created_at: number }>();
		if (last && Date.now() - last.created_at < 20_000) return fail(429, { qError: 'Slow down a little.', qListing: listingId, qBody: body });
		const held = matchesBlocked(body, await getBlockedWords(db)) ? 1 : 0;
		await db
			.prepare('INSERT INTO listing_questions (id, listing_id, user_id, body, held, created_at) VALUES (?, ?, ?, ?, ?, ?)')
			.bind(newId(), listingId, user.id, body, held, Date.now())
			.run();
		return { asked: listingId };
	},

	answer: async ({ request, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const db = getEnv().DB;
		const f = await request.formData();
		const id = String(f.get('question_id') ?? '');
		const answer = String(f.get('answer') ?? '').trim();
		if (answer.length < 1 || answer.length > 1000) return fail(400, { aError: 'Answers are 1–1000 characters.', aId: id });
		const r = await db
			.prepare(`UPDATE listing_questions SET answer = ?, answered_at = ? WHERE id = ? AND listing_id IN (SELECT id FROM listings WHERE seller_id = ?)`)
			.bind(answer, Date.now(), id, user.id)
			.run();
		if (!r.meta.changes) return fail(403, { aError: 'Only the producer can answer.', aId: id });
		return { answered: id };
	},

	hideQuestion: async ({ request, locals, url }) => {
		const user = requireUser(locals, url.pathname);
		const db = getEnv().DB;
		const id = String((await request.formData()).get('question_id') ?? '');
		// The asker, the producer, or a moderator can take a question down.
		const r = await db
			.prepare(
				`UPDATE listing_questions SET hidden = 1 WHERE id = ? AND (user_id = ? OR ? = 1 OR listing_id IN (SELECT id FROM listings WHERE seller_id = ?))`
			)
			.bind(id, user.id, user.isMod ? 1 : 0, user.id)
			.run();
		if (r.meta.changes && user.isMod) await logAction(db, user, 'question.hide', 'question', id);
		return { hiddenQ: id };
	},

	report: async ({ request, locals, platform, url }) => {
		const user = requireUser(locals, url.pathname);
		const form = await request.formData();
		const targetType = String(form.get('target_type'));
		const targetId = String(form.get('target_id') ?? '');
		const reason = String(form.get('reason') ?? '');
		const details = String(form.get('details') ?? '').slice(0, 1000);
		if (!['user', 'battle', 'comment', 'question'].includes(targetType) || !targetId) return fail(400, { reportError: 'Bad report.' });
		if (!['fake_votes', 'alt_account', 'harassment', 'spam', 'stolen_beat', 'other'].includes(reason)) {
			return fail(400, { reportError: 'Pick a reason.' });
		}
		await getEnv(platform)
			.DB.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(newId(), user.id, targetType, targetId, reason, details, Date.now())
			.run();
		return { reported: true };
	}
};

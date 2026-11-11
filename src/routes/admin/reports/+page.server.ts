import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { logAction, requireMod, setShadowban, setSuspended } from '#lib/server/mod.ts';
import { voidBattle } from '#lib/server/modtools.ts';

type Report = { id: string; target_type: string; target_id: string; reason: string; details: string; created_at: number; status: string; reporter: string };
type Person = { id: string; username: string; shadowbanned: number; suspended_at: number | null; is_mod: number; is_admin: number };

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	requireMod(locals);
	const db = getEnv(platform).DB;
	const status = url.searchParams.get('status') === 'closed' ? 'closed' : 'open';
	const reports = (
		await db
			.prepare(
				`SELECT r.id, r.target_type, r.target_id, r.reason, r.details, r.created_at, r.status, u.username AS reporter
				 FROM reports r JOIN users u ON u.id = r.reporter_id
				 WHERE ${status === 'open' ? "r.status = 'open'" : "r.status != 'open'"}
				 ORDER BY r.created_at DESC LIMIT 300`
			)
			.all<Report>()
	).results;

	// One card per reported thing, most-reported first.
	const groups = new Map<string, { type: string; id: string; reports: Report[]; latest: number }>();
	for (const r of reports) {
		const k = `${r.target_type}:${r.target_id}`;
		const g = groups.get(k) ?? { type: r.target_type, id: r.target_id, reports: [], latest: 0 };
		g.reports.push(r);
		g.latest = Math.max(g.latest, r.created_at);
		groups.set(k, g);
	}
	const ids = (t: string) => [...groups.values()].filter((g) => g.type === t).map((g) => g.id);
	const inList = (n: number) => Array(n).fill('?').join(',') || "''";
	const person = 'u.id, u.username, u.shadowbanned, u.suspended_at, u.is_mod, u.is_admin';

	const cIds = ids('comment');
	const comments = cIds.length
		? (
				await db
					.prepare(
						`SELECT m.id, m.body, m.hidden, m.held, m.created_at, m.battle_id, m.user_id, b.title
						 FROM comments m JOIN battles b ON b.id = m.battle_id WHERE m.id IN (${inList(cIds.length)})`
					)
					.bind(...cIds)
					.all<{ id: string; body: string; hidden: number; held: number; created_at: number; battle_id: string; user_id: string; title: string }>()
			).results
		: [];

	const bIds = ids('battle');
	const battles = bIds.length
		? (
				await db
					.prepare(
						`SELECT b.id, b.title, b.status, b.voting_ends_at, b.creator_id, b.challenger_id, c.username AS creator, ch.username AS challenger,
						        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id AND v.weight < 1) AS flagged,
						        (SELECT COUNT(*) FROM votes v WHERE v.battle_id = b.id) AS votes
						 FROM battles b JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id WHERE b.id IN (${inList(bIds.length)})`
					)
					.bind(...bIds)
					.all<{ id: string; title: string; status: string; voting_ends_at: number | null; creator_id: string; challenger_id: string | null; creator: string; challenger: string | null; flagged: number; votes: number }>()
			).results
		: [];

	const people = new Set<string>([...ids('user'), ...comments.map((c) => c.user_id), ...battles.flatMap((b) => [b.creator_id, b.challenger_id ?? ''])].filter(Boolean));
	const pIds = [...people];
	const users = pIds.length
		? (
				await db
					.prepare(
						`SELECT ${person}, u.created_at,
						        (SELECT COUNT(*) FROM reports r WHERE r.status = 'open' AND ((r.target_type = 'user' AND r.target_id = u.id)
						           OR (r.target_type = 'comment' AND r.target_id IN (SELECT id FROM comments WHERE user_id = u.id)))) AS against
						 FROM users u WHERE u.id IN (${inList(pIds.length)})`
					)
					.bind(...pIds)
					.all<Person & { created_at: number; against: number }>()
			).results
		: [];

	const userById = Object.fromEntries(users.map((u) => [u.id, u]));
	const commentById = Object.fromEntries(comments.map((c) => [c.id, { id: c.id, body: c.body, hidden: c.hidden, held: c.held, battleId: c.battle_id, title: c.title, createdAt: c.created_at, author: userById[c.user_id] ?? null }]));
	const battleById = Object.fromEntries(battles.map((b) => [b.id, { ...b, creatorUser: userById[b.creator_id] ?? null, challengerUser: b.challenger_id ? (userById[b.challenger_id] ?? null) : null }]));

	return {
		status,
		groups: [...groups.values()]
			.sort((a, b) => b.reports.length - a.reports.length || b.latest - a.latest)
			.map((g) => ({
				...g,
				comment: g.type === 'comment' ? (commentById[g.id] ?? null) : null,
				battle: g.type === 'battle' ? (battleById[g.id] ?? null) : null,
				user: g.type === 'user' ? (userById[g.id] ?? null) : null
			})),
		now: Date.now()
	};
};

async function resolve(db: D1Database, type: string, id: string, status: 'actioned' | 'dismissed') {
	await db.prepare(`UPDATE reports SET status = ? WHERE target_type = ? AND target_id = ? AND status = 'open'`).bind(status, type, id).run();
}

export const actions: Actions = {
	dismiss: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const f = await request.formData();
		const type = String(f.get('type'));
		const id = String(f.get('id'));
		const status = f.get('status') === 'actioned' ? 'actioned' : 'dismissed';
		await resolve(db, type, id, status);
		await logAction(db, me, `report.${status === 'actioned' ? 'resolve' : 'dismiss'}`, type, id);
		return { ok: status === 'actioned' ? 'Marked handled.' : 'Dismissed.' };
	},

	hideComment: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const id = String((await request.formData()).get('id'));
		const c = await db.prepare('SELECT body FROM comments WHERE id = ?').bind(id).first<{ body: string }>();
		if (!c) return fail(404, { error: 'Comment not found.' });
		await db.prepare('UPDATE comments SET hidden = 1 WHERE id = ?').bind(id).run();
		await resolve(db, 'comment', id, 'actioned');
		await logAction(db, me, 'comment.hide', 'comment', id, c.body.slice(0, 120));
		return { ok: 'Comment hidden.' };
	},

	removeBattle: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const f = await request.formData();
		const id = String(f.get('id'));
		const reason = String(f.get('note') ?? '').trim().slice(0, 300);
		if (!reason) return fail(400, { error: 'Add a reason so the log explains why.' });
		const b = await db.prepare('SELECT status FROM battles WHERE id = ?').bind(id).first<{ status: string }>();
		if (!b) return fail(404, { error: 'Battle not found.' });
		await voidBattle(db, id);
		await resolve(db, 'battle', id, 'actioned');
		await logAction(db, me, 'battle.remove', 'battle', id, `was ${b.status} — ${reason} (from report)`);
		return { ok: 'Battle removed.' };
	},

	user: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const f = await request.formData();
		const userId = String(f.get('user_id'));
		const op = String(f.get('op'));
		const err =
			op === 'shadowban' || op === 'unshadowban'
				? await setShadowban(db, me, userId, op === 'shadowban')
				: op === 'suspend' || op === 'unsuspend'
					? await setSuspended(db, me, userId, op === 'suspend', String(f.get('note') ?? '').trim())
					: 'Unknown action.';
		if (err) return fail(403, { error: err });
		// Resolve reports about this user (their profile and their comments) when we act against them.
		if (op === 'shadowban' || op === 'suspend') {
			await resolve(db, 'user', userId, 'actioned');
			await db
				.prepare(`UPDATE reports SET status = 'actioned' WHERE status = 'open' AND target_type = 'comment' AND target_id IN (SELECT id FROM comments WHERE user_id = ?)`)
				.bind(userId)
				.run();
		}
		return { ok: { shadowban: 'Shadowbanned.', unshadowban: 'Shadowban lifted.', suspend: 'Suspended and logged out.', unsuspend: 'Suspension lifted.' }[op] };
	}
};

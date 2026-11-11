import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { setSetting } from '#lib/server/settings.ts';
import { refreshComment } from '#lib/server/respect.ts';
import { BLOCKED_WORDS_KEY, getBlockedWords, logAction, matchesBlocked, requireMod } from '#lib/server/mod.ts';

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	requireMod(locals);
	const db = getEnv(platform).DB;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
	const user = (url.searchParams.get('user') ?? '').trim().slice(0, 30);
	const battle = (url.searchParams.get('battle') ?? '').trim().slice(0, 40);
	const st = url.searchParams.get('status');
	const status = st === 'held' || st === 'hidden' || st === 'visible' ? st : 'all';

	const where: string[] = [];
	const binds: unknown[] = [];
	if (q) {
		where.push('m.body LIKE ?');
		binds.push(`%${q}%`);
	}
	if (user) {
		where.push('u.username = ?');
		binds.push(user);
	}
	if (battle) {
		where.push('m.battle_id = ?');
		binds.push(battle.match(/battles\/([A-Za-z0-9_-]+)/)?.[1] ?? battle);
	}
	if (status === 'held') where.push('m.held = 1 AND m.hidden = 0');
	if (status === 'hidden') where.push('m.hidden = 1');
	if (status === 'visible') where.push('m.held = 0 AND m.hidden = 0');

	const rows = await db
		.prepare(
			`SELECT m.id, m.body, m.created_at, m.hidden, m.held, m.battle_id, m.user_id,
			        u.username, u.shadowbanned, u.suspended_at, b.title, c.username AS creator, ch.username AS challenger,
			        (SELECT COUNT(*) FROM reports r WHERE r.target_type = 'comment' AND r.target_id = m.id AND r.status = 'open') AS reports
			 FROM comments m JOIN users u ON u.id = m.user_id JOIN battles b ON b.id = m.battle_id
			 JOIN users c ON c.id = b.creator_id LEFT JOIN users ch ON ch.id = b.challenger_id
			 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			 ORDER BY m.created_at DESC LIMIT 200`
		)
		.bind(...binds)
		.all<{
			id: string; body: string; created_at: number; hidden: number; held: number; battle_id: string; user_id: string;
			username: string; shadowbanned: number; suspended_at: number | null; title: string; creator: string; challenger: string | null; reports: number;
		}>();
	const words = await getBlockedWords(db);
	const heldCount = await db.prepare('SELECT COUNT(*) AS n FROM comments WHERE held = 1 AND hidden = 0').first<{ n: number }>();
	return {
		comments: rows.results.map((c) => ({ ...c, matched: c.held ? matchesBlocked(c.body, words) : null })),
		q, user, battle, status,
		words,
		heldCount: heldCount?.n ?? 0,
		now: Date.now()
	};
};

export const actions: Actions = {
	/** hide | unhide | approve (clears held) */
	set: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const f = await request.formData();
		const op = String(f.get('op'));
		const ids = f.getAll('id').map(String).filter(Boolean).slice(0, 200);
		if (!ids.length) return fail(400, { error: 'Pick at least one comment.' });
		const sql = {
			hide: 'UPDATE comments SET hidden = 1 WHERE id = ?',
			unhide: 'UPDATE comments SET hidden = 0, held = 0 WHERE id = ?',
			approve: 'UPDATE comments SET held = 0, hidden = 0 WHERE id = ?'
		}[op];
		if (!sql) return fail(400, { error: 'Unknown action.' });
		await db.batch(ids.map((id) => db.prepare(sql).bind(id)));
		// Resolve open reports on the comments we hid.
		if (op === 'hide') await db.batch(ids.map((id) => db.prepare(`UPDATE reports SET status = 'actioned' WHERE target_type = 'comment' AND target_id = ? AND status = 'open'`).bind(id)));
		for (const id of ids) {
			await refreshComment(db, id);
			await logAction(db, me, `comment.${op}`, 'comment', id);
		}
		const verb = { hide: 'Hidden', unhide: 'Visible again', approve: 'Approved' }[op];
		return { ok: `${verb}: ${ids.length} comment${ids.length === 1 ? '' : 's'}.` };
	},

	words: async ({ request, locals, platform }) => {
		const me = requireMod(locals);
		const db = getEnv(platform).DB;
		const raw = String((await request.formData()).get('words') ?? '');
		const list = [...new Set(raw.split(/[\n,]/).map((w) => w.trim().toLowerCase()).filter((w) => w.length >= 2 && w.length <= 40))].slice(0, 500);
		await setSetting(db, BLOCKED_WORDS_KEY, list.join('\n'), me.username);
		await logAction(db, me, 'settings.blocked_words', 'settings', BLOCKED_WORDS_KEY, `${list.length} words`);
		return { ok: `Saved ${list.length} blocked word${list.length === 1 ? '' : 's'}. New comments that match are held for review.` };
	}
};

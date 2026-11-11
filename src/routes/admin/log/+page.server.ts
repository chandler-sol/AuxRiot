import type { PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { requireMod } from '#lib/server/mod.ts';

const KINDS = ['battle', 'entry', 'vote', 'comment', 'user', 'report', 'credits', 'settings', 'promo', 'dmca'];

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	requireMod(locals);
	const db = getEnv(platform).DB;
	const actor = (url.searchParams.get('actor') ?? '').trim().slice(0, 30);
	const k = url.searchParams.get('kind') ?? '';
	const kind = KINDS.includes(k) ? k : '';
	const before = Number(url.searchParams.get('before')) || 0;
	const where: string[] = [];
	const binds: unknown[] = [];
	if (actor) {
		where.push('u.username = ?');
		binds.push(actor);
	}
	if (kind) {
		where.push('l.action LIKE ?');
		binds.push(`${kind}.%`);
	}
	if (before) {
		where.push('l.created_at < ?');
		binds.push(before);
	}
	const rows = await db
		.prepare(
			`SELECT l.id, l.action, l.target_type, l.target_id, l.details, l.created_at, u.username AS actor,
			        CASE WHEN l.target_type = 'user' THEN (SELECT username FROM users WHERE id = l.target_id) END AS target_user,
			        CASE WHEN l.target_type = 'comment' THEN (SELECT battle_id FROM comments WHERE id = l.target_id) END AS comment_battle
			 FROM mod_log l JOIN users u ON u.id = l.actor_id
			 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			 ORDER BY l.created_at DESC LIMIT 101`
		)
		.bind(...binds)
		.all<{ id: string; action: string; target_type: string; target_id: string; details: string; created_at: number; actor: string; target_user: string | null; comment_battle: string | null }>();
	const staff = await db
		.prepare('SELECT username, is_admin FROM users WHERE is_mod = 1 OR is_admin = 1 ORDER BY is_admin DESC, username')
		.all<{ username: string; is_admin: number }>();
	const more = rows.results.length > 100;
	const entries = rows.results.slice(0, 100);
	return { entries, more, nextBefore: more ? entries[entries.length - 1].created_at : null, actor, kind, kinds: KINDS, staff: staff.results, now: Date.now() };
};

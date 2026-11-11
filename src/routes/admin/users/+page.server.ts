import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId, DAY } from '#lib/server/util.ts';
import { addCredits } from '#lib/server/credits.ts';

function requireAdmin(locals: App.Locals) {
	if (!locals.user?.isAdmin) error(404);
	return locals.user;
}

const SORTS = {
	newest: 'u.created_at DESC',
	oldest: 'u.created_at ASC',
	credits: 'u.credits DESC, u.created_at DESC',
	wins: 'u.wins DESC, u.losses ASC',
	battles: 'battles DESC, u.created_at DESC',
	active: 'last_seen DESC'
} as const;
type Sort = keyof typeof SORTS;

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	requireAdmin(locals);
	const db = getEnv(platform).DB;
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
	const sortParam = url.searchParams.get('sort') as Sort | null;
	const sort: Sort = sortParam && sortParam in SORTS ? sortParam : 'newest';
	const filter = url.searchParams.get('filter') ?? 'all';
	const where: string[] = [];
	const binds: unknown[] = [];
	if (q) {
		where.push('(u.username LIKE ? OR u.email LIKE ?)');
		binds.push(`%${q}%`, `%${q}%`);
	}
	if (filter === 'confirmed') where.push('u.email_verified_at IS NOT NULL');
	if (filter === 'unconfirmed') where.push('u.email_verified_at IS NULL');
	if (filter === 'shadowbanned') where.push('u.shadowbanned = 1');
	if (filter === 'news') where.push('u.news_opt_in = 1');

	const rows = await db
		.prepare(
			`SELECT u.id, u.username, u.email, u.created_at, u.email_verified_at, u.credits, u.wins, u.losses, u.ties,
			        u.shadowbanned, u.is_admin, u.news_opt_in, u.avatar_key, u.color,
			        (SELECT COUNT(*) FROM entries e WHERE e.user_id = u.id) AS battles,
			        (SELECT COUNT(*) FROM votes v WHERE v.voter_id = u.id) AS votes,
			        (SELECT MAX(last_seen) FROM user_signals s WHERE s.user_id = u.id) AS last_seen,
			        (SELECT COUNT(DISTINCT b.user_id) FROM user_signals a JOIN user_signals b
			           ON a.kind = 'device' AND b.kind = 'device' AND a.value_hash = b.value_hash AND b.user_id != u.id
			         WHERE a.user_id = u.id) AS linked
			 FROM users u ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
			 ORDER BY ${SORTS[sort]} LIMIT 200`
		)
		.bind(...binds)
		.all<{
			id: string; username: string; email: string; created_at: number; email_verified_at: number | null; credits: number;
			wins: number; losses: number; ties: number; shadowbanned: number; is_admin: number; news_opt_in: number;
			avatar_key: string | null; color: string | null; battles: number; votes: number; last_seen: number | null; linked: number;
		}>();
	const total = await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
	return { users: rows.results, total: total?.n ?? 0, q, sort, filter, now: Date.now() };
};

export const actions: Actions = {
	grant: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const userId = String(f.get('user_id') ?? '');
		const amount = Number(f.get('amount'));
		const note = String(f.get('note') ?? '').trim();
		if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100000) {
			return fail(400, { error: 'Amount must be a whole number (negative to take credits back).' });
		}
		const db = getEnv(platform).DB;
		const u = await db.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first<{ username: string }>();
		if (!u) return fail(404, { error: 'User not found.' });
		await addCredits(db, userId, amount, amount > 0 ? 'admin_grant' : 'admin_clawback', newId(), note || `From ${admin.username}`);
		return { ok: `${amount > 0 ? 'Gave' : 'Took'} ${Math.abs(amount).toLocaleString()} credits ${amount > 0 ? 'to' : 'from'} ${u.username}.` };
	},

	shadowban: async ({ request, locals, platform }) => {
		requireAdmin(locals);
		const f = await request.formData();
		const on = f.get('on') === '1' ? 1 : 0;
		await getEnv(platform).DB.prepare('UPDATE users SET shadowbanned = ? WHERE id = ?').bind(on, String(f.get('user_id'))).run();
		return { ok: on ? 'Shadowbanned.' : 'Restored.' };
	},

	/** Give credits to N randomly picked members (giveaways). */
	drop: async ({ request, locals, platform }) => {
		const admin = requireAdmin(locals);
		const f = await request.formData();
		const count = Number(f.get('count'));
		const amount = Number(f.get('amount'));
		const pool = String(f.get('pool') ?? 'confirmed');
		const note = String(f.get('note') ?? '').trim() || 'Random drop';
		if (!Number.isInteger(count) || count < 1 || count > 100) return fail(400, { error: 'Pick 1–100 winners.' });
		if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return fail(400, { error: 'Amount must be 1–10,000 credits.' });
		const db = getEnv(platform).DB;
		const conds = ['u.shadowbanned = 0', 'u.email_verified_at IS NOT NULL'];
		const binds: unknown[] = [];
		if (pool === 'active') {
			conds.push('(SELECT MAX(last_seen) FROM user_signals s WHERE s.user_id = u.id) > ?');
			binds.push(Date.now() - 30 * DAY);
		}
		if (pool === 'battlers') conds.push('EXISTS (SELECT 1 FROM entries e WHERE e.user_id = u.id)');
		if (f.get('exclude_me') === 'on') {
			conds.push('u.id != ?');
			binds.push(admin.id);
		}
		const winners = await db
			.prepare(`SELECT u.id, u.username FROM users u WHERE ${conds.join(' AND ')} ORDER BY RANDOM() LIMIT ?`)
			.bind(...binds, count)
			.all<{ id: string; username: string }>();
		if (!winners.results.length) return fail(400, { error: 'Nobody matches that pool yet (members need a confirmed email).' });
		const dropId = newId(8);
		for (const w of winners.results) await addCredits(db, w.id, amount, 'admin_grant', `drop-${dropId}`, note);
		return {
			ok: `Dropped ${amount.toLocaleString()} credits on ${winners.results.length} member${winners.results.length === 1 ? '' : 's'}.`,
			winners: winners.results.map((w) => w.username)
		};
	}
};

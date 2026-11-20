import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';

/** @mention autocomplete: usernames starting with q (logged-in only, small and cheap). */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json([], { status: 401 });
	const q = (url.searchParams.get('q') ?? '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
	if (!q) return json([]);
	const rows = await getEnv()
		.DB.prepare(
			`SELECT username, avatar_key, color, verified_label FROM users
			 WHERE username LIKE ? ESCAPE '\\' AND suspended_at IS NULL AND shadowbanned = 0 AND id != ?
			 ORDER BY verified_label IS NULL, LENGTH(username), username LIMIT 6`
		)
		.bind(`${q.replace(/_/g, '\\_')}%`, locals.user.id)
		.all<{ username: string; avatar_key: string | null; color: string | null; verified_label: string | null }>();
	return json(rows.results.map((r) => ({ username: r.username, avatarKey: r.avatar_key, color: r.color, verified: r.verified_label })), {
		headers: { 'cache-control': 'private, max-age=30' }
	});
};

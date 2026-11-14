import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { createSession, destroySession } from '#lib/server/auth.ts';
import { readReturnCookie, RETURN_COOKIE } from '#lib/server/seed.ts';

/** Leave a test account and go back to the admin who opened it (beta only). */
export const POST: RequestHandler = async ({ cookies, url }) => {
	const env = getEnv();
	if (env.ENVIRONMENT !== 'beta') error(404);
	const adminId = await readReturnCookie(env.SIGNAL_SALT ?? 'dev-salt', cookies.get(RETURN_COOKIE));
	if (!adminId) error(403, 'No admin session to return to.');
	const admin = await env.DB.prepare('SELECT id FROM users WHERE id = ? AND is_test = 0').bind(adminId).first();
	if (!admin) error(403);
	await destroySession(env.DB, cookies);
	await createSession(env.DB, cookies, adminId, url.protocol === 'https:');
	cookies.delete(RETURN_COOKIE, { path: '/' });
	redirect(303, '/admin/seed');
};

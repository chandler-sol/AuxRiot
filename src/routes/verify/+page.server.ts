import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { consumeEmailToken, createEmailToken, sendEmail, verifyEmail } from '#lib/server/email.ts';
import { syncNewsContact } from '#lib/server/news.ts';

export const load: PageServerLoad = async ({ url, platform }) => {
	const token = url.searchParams.get('token');
	if (!token) return { state: 'missing' as const };
	const env = getEnv(platform);
	const db = env.DB;
	const userId = await consumeEmailToken(db, token, 'verify');
	if (!userId) return { state: 'invalid' as const };
	await db.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(Date.now(), userId).run();
	const u = await db.prepare('SELECT email, username, news_opt_in FROM users WHERE id = ?').bind(userId).first<{ email: string; username: string; news_opt_in: number }>();
	if (u?.news_opt_in) await syncNewsContact(env, { id: userId, email: u.email, username: u.username, optIn: true, verified: true });
	return { state: 'verified' as const };
};

export const actions: Actions = {
	/** Send a fresh verification link to the logged-in user. */
	resend: async ({ locals, platform, url }) => {
		if (!locals.user) redirect(303, '/login');
		if (locals.user.emailVerified) return { already: true };
		const env = getEnv(platform);
		const row = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(locals.user.id).first<{ email: string }>();
		const t = await createEmailToken(env.DB, locals.user.id, 'verify');
		if ('error' in t) return fail(429, { resendError: 'Just sent one — give it a minute before asking again.' });
		const res = await sendEmail(env, { to: row!.email, ...verifyEmail(locals.user.username, `${url.origin}/verify?token=${t.token}`, t.token) });
		if (!res.ok) return fail(502, { resendError: "Couldn't send the email right now. Try again shortly." });
		return { resent: true };
	}
};

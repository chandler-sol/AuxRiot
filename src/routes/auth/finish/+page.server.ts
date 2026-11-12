import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { USERNAME_RE, createSession, recordSignals } from '#lib/server/auth.ts';
import { hashToken } from '#lib/server/oauth.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';
import { createEmailToken, sendEmail, verifyEmail } from '#lib/server/email.ts';

type Pending = { token_hash: string; provider: string; provider_user_id: string; email: string | null; email_verified: number; suggested: string; created_at: number };
const TTL = 30 * 60_000;

async function pending(db: D1Database, token: string | undefined) {
	if (!token) return null;
	const p = await db.prepare('SELECT * FROM oauth_pending WHERE token_hash = ?').bind(await hashToken(token)).first<Pending>();
	return p && Date.now() - p.created_at < TTL ? p : null;
}

export const load: PageServerLoad = async ({ cookies, locals }) => {
	if (locals.user) redirect(303, '/battles');
	const p = await pending(getEnv().DB, cookies.get('oauth_pending'));
	if (!p) redirect(303, '/signup');
	return {
		provider: p.provider === 'google' ? 'Google' : 'Discord',
		suggested: p.suggested,
		email: p.email ?? '',
		emailLocked: !!(p.email && p.email_verified)
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, locals, url }) => {
		const env = getEnv();
		const p = await pending(env.DB, cookies.get('oauth_pending'));
		if (!p) redirect(303, '/signup');
		const f = await request.formData();
		const username = String(f.get('username') ?? '').trim();
		const email = p.email && p.email_verified ? p.email : String(f.get('email') ?? '').trim().toLowerCase();
		const values = { username, email };
		if (!USERNAME_RE.test(username)) return fail(400, { ...values, error: 'Username: 3–20 letters, numbers or underscores.' });
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(400, { ...values, error: 'Enter a valid email.' });
		if (f.get('agree') !== 'on') return fail(400, { ...values, error: 'Please confirm you are 18+ and agree to the Terms and Privacy Policy.' });
		const salt = env.SIGNAL_SALT ?? 'dev-salt';
		const limited = await overLimit(env.DB, locals.ip, salt, 'signup');
		if (limited) return fail(429, { ...values, error: limited });

		const taken = await env.DB.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?').bind(username, email).first<{ username: string; email: string }>();
		if (taken) {
			return fail(400, {
				...values,
				error: taken.username.toLowerCase() === username.toLowerCase() ? 'That username is taken.' : 'An account with that email already exists — log in with your password instead.'
			});
		}

		const id = newId();
		const now = Date.now();
		const verified = !!(p.email && p.email_verified && email === p.email);
		const news = f.get('news') === 'on';
		await env.DB.batch([
			env.DB.prepare(
				'INSERT INTO users (id, username, email, password_hash, created_at, email_verified_at, news_opt_in, news_opt_in_at, terms_accepted_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)'
			).bind(id, username, email, now, verified ? now : null, news ? 1 : 0, news ? now : null, now),
			env.DB.prepare('INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)').bind(p.provider, p.provider_user_id, id),
			env.DB.prepare('DELETE FROM oauth_pending WHERE token_hash = ? OR created_at < ?').bind(p.token_hash, now - TTL)
		]);
		await recordSignals(env.DB, id, locals.ip, locals.deviceId, salt);
		await recordAttempt(env.DB, locals.ip, salt, 'signup');
		await createSession(env.DB, cookies, id, url.protocol === 'https:');
		if (!verified) {
			const t = await createEmailToken(env.DB, id, 'verify');
			if ('token' in t) await sendEmail(env, { to: email, ...verifyEmail(username, `${url.origin}/verify?token=${t.token}`, t.token) });
		}
		const next = cookies.get('oauth_next2') ?? '/battles';
		cookies.delete('oauth_pending', { path: '/' });
		cookies.delete('oauth_next2', { path: '/' });
		redirect(303, next.startsWith('/') && !next.startsWith('//') ? next : '/battles');
	}
};

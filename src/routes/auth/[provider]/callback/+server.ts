import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEnv, newId } from '#lib/server/util.ts';
import { createSession, recordSignals } from '#lib/server/auth.ts';
import { callbackUrl, cleanUsername, enabledProviders, fetchProfile, hashToken, isProvider } from '#lib/server/oauth.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';

export const GET: RequestHandler = async ({ params, url, cookies, locals }) => {
	const env = getEnv();
	const provider = params.provider;
	if (!isProvider(provider) || !enabledProviders(env).includes(provider)) error(404);
	const salt = env.SIGNAL_SALT ?? 'dev-salt';
	const fail = (why: string) => redirect(303, `/login?oauth_error=${encodeURIComponent(why)}`);

	const saved = cookies.get('oauth_state') ?? '';
	const next = cookies.get('oauth_next') ?? '/battles';
	cookies.delete('oauth_state', { path: '/auth' });
	cookies.delete('oauth_next', { path: '/auth' });
	const [sp, state, verifier] = saved.split(':');
	const code = url.searchParams.get('code');
	if (url.searchParams.get('error')) fail('Sign-in was cancelled.');
	if (!code || sp !== provider || !state || state !== url.searchParams.get('state')) fail('That sign-in link expired. Try again.');
	if (await overLimit(env.DB, locals.ip, salt, 'oauth')) fail('Too many sign-in attempts. Wait a few minutes.');
	await recordAttempt(env.DB, locals.ip, salt, 'oauth');

	const profile = await fetchProfile(env, provider, code!, verifier, callbackUrl(url, provider));
	if (!profile) fail(`Couldn't reach ${provider === 'google' ? 'Google' : 'Discord'}. Try again.`);
	const p = profile!;
	const secure = url.protocol === 'https:';

	type U = { id: string; suspended_at: number | null; suspended_reason: string | null; email_verified_at: number | null };
	const loginAs = async (u: U) => {
		if (u.suspended_at) fail(`Account suspended: ${u.suspended_reason || 'this account broke the rules.'}`);
		await recordSignals(env.DB, u.id, locals.ip, locals.deviceId, salt);
		await createSession(env.DB, cookies, u.id, secure);
		redirect(303, next);
	};

	// 1) Returning: this provider account is already linked.
	const linked = await env.DB.prepare(
		`SELECT u.id, u.suspended_at, u.suspended_reason, u.email_verified_at FROM oauth_accounts o JOIN users u ON u.id = o.user_id
		 WHERE o.provider = ? AND o.provider_user_id = ?`
	)
		.bind(provider, p.id)
		.first<U>();
	if (linked) return loginAs(linked);

	// 2) Same verified email as an existing account: link it (the provider proved they own the inbox).
	if (p.email && p.emailVerified) {
		const byEmail = await env.DB.prepare('SELECT id, suspended_at, suspended_reason, email_verified_at FROM users WHERE email = ?').bind(p.email).first<U>();
		if (byEmail) {
			await env.DB.batch([
				env.DB.prepare('INSERT OR IGNORE INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)').bind(provider, p.id, byEmail.id),
				env.DB.prepare('UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?) WHERE id = ?').bind(Date.now(), byEmail.id)
			]);
			return loginAs(byEmail);
		}
	}

	// 3) New here: hold the profile and let them pick a username.
	const token = newId(24);
	await env.DB.prepare(
		`INSERT INTO oauth_pending (token_hash, provider, provider_user_id, email, email_verified, suggested, avatar_url, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	)
		.bind(await hashToken(token), provider, p.id, p.email, p.emailVerified ? 1 : 0, cleanUsername(p.suggested), p.avatarUrl, Date.now())
		.run();
	cookies.set('oauth_pending', token, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 1800 });
	cookies.set('oauth_next2', next, { path: '/', httpOnly: true, sameSite: 'lax', secure, maxAge: 1800 });
	redirect(303, '/auth/finish');
};

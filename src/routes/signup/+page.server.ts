import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { USERNAME_RE, createSession, hashPassword, recordSignals, verifyTurnstile } from '#lib/server/auth.ts';
import { getEnv, newId } from '#lib/server/util.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';
import { enabledProviders } from '#lib/server/oauth.ts';
import { describeHours, getVoterMinAgeHours } from '#lib/server/settings.ts';
import { createEmailToken, sendEmail, verifyEmail } from '#lib/server/email.ts';

function safeNext(next: string | null) {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/battles';
}

export const load: PageServerLoad = async ({ locals, platform, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
	const env = getEnv(platform);
	return {
		turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
		providers: enabledProviders(env),
		next: url.searchParams.get('next') ?? '',
		voterWait: describeHours(await getVoterMinAgeHours(env.DB, env))
	};
};

export const actions: Actions = {
	default: async ({ request, platform, cookies, locals, url }) => {
		const env = getEnv(platform);
		const form = await request.formData();
		const username = String(form.get('username') ?? '').trim();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		const values = { username, email };

		if (!USERNAME_RE.test(username)) return fail(400, { ...values, error: 'Username: 3–20 letters, numbers or underscores.' });
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return fail(400, { ...values, error: 'Enter a valid email.' });
		if (password.length < 8 || password.length > 200) return fail(400, { ...values, error: 'Password must be at least 8 characters.' });

		if (form.get('agree') !== 'on') return fail(400, { ...values, error: 'Please confirm you are 18+ and agree to the Terms and Privacy Policy.' });
		const salt = env.SIGNAL_SALT ?? 'dev-salt';
		const limited = await overLimit(env.DB, locals.ip, salt, 'signup');
		if (limited) return fail(429, { ...values, error: limited });

		const human = await verifyTurnstile(env.TURNSTILE_SECRET, form.get('cf-turnstile-response') as string | null, locals.ip);
		if (!human) return fail(400, { ...values, error: 'Bot check failed. Please try again.' });

		const taken = await env.DB.prepare('SELECT username, email FROM users WHERE username = ? OR email = ?')
			.bind(username, email)
			.first<{ username: string; email: string }>();
		if (taken) {
			return fail(400, {
				...values,
				error: taken.username.toLowerCase() === username.toLowerCase() ? 'That username is taken.' : 'An account with that email already exists.'
			});
		}

		const id = newId();
		const news = form.get('news') === 'on';
		await env.DB.prepare(
			'INSERT INTO users (id, username, email, password_hash, created_at, news_opt_in, news_opt_in_at, terms_accepted_at, email_verified_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		)
			.bind(id, username, email, await hashPassword(password), Date.now(), news ? 1 : 0, news ? Date.now() : null, Date.now(), env.ENVIRONMENT === 'beta' ? Date.now() : null)
			.run();
		await recordSignals(env.DB, id, locals.ip, locals.deviceId, env.SIGNAL_SALT ?? 'dev-salt');
		await recordAttempt(env.DB, locals.ip, salt, 'signup');
		await createSession(env.DB, cookies, id, url.protocol === 'https:');

		// Verification email. A failure here never blocks sign-up; they can resend from the banner.
		const t = await createEmailToken(env.DB, id, 'verify');
		if ('token' in t) {
			const link = `${url.origin}/verify?token=${t.token}`;
			await sendEmail(env, { to: email, ...verifyEmail(username, link, t.token) });
		}
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};

import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { USERNAME_RE, createSession, hashPassword, recordSignals, verifyTurnstile } from '#lib/server/auth.ts';
import { getEnv, newId } from '#lib/server/util.ts';
import { describeHours, getVoterMinAgeHours } from '#lib/server/settings.ts';

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (locals.user) redirect(303, '/');
	const env = getEnv(platform);
	return {
		turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
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
		await env.DB.prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind(id, username, email, await hashPassword(password), Date.now())
			.run();
		await recordSignals(env.DB, id, locals.ip, locals.deviceId, env.SIGNAL_SALT ?? 'dev-salt');
		await createSession(env.DB, cookies, id, url.protocol === 'https:');
		redirect(303, '/');
	}
};

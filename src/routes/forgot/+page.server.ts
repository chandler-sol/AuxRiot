import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getEnv } from '#lib/server/util.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';
import { createEmailToken, resetEmail, sendEmail } from '#lib/server/email.ts';

export const actions: Actions = {
	default: async ({ request, platform, url, locals }) => {
		const env = getEnv(platform);
		const login = String((await request.formData()).get('login') ?? '').trim();
		if (!login) return fail(400, { error: 'Enter your email or username.' });
		const salt = env.SIGNAL_SALT ?? 'dev-salt';
		const limited = await overLimit(env.DB, locals.ip, salt, 'forgot');
		if (limited) return fail(429, { error: limited });
		await recordAttempt(env.DB, locals.ip, salt, 'forgot');

		const user = await env.DB.prepare('SELECT id, username, email FROM users WHERE email = ? OR username = ?')
			.bind(login.toLowerCase(), login)
			.first<{ id: string; username: string; email: string }>();
		if (user) {
			const t = await createEmailToken(env.DB, user.id, 'reset');
			if ('token' in t) {
				await sendEmail(env, { to: user.email, ...resetEmail(user.username, `${url.origin}/reset?token=${t.token}`, t.token) });
			}
		}
		// Same answer whether or not the account exists, so this can't be used to probe for emails.
		return { sent: true };
	}
};

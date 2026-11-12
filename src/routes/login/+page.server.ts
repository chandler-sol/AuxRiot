import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createSession, recordSignals, verifyPassword } from '#lib/server/auth.ts';
import { getEnv } from '#lib/server/util.ts';
import { overLimit, recordAttempt } from '#lib/server/ratelimit.ts';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) redirect(303, safeNext(url.searchParams.get('next')));
};

function safeNext(next: string | null) {
	return next && next.startsWith('/') && !next.startsWith('//') ? next : '/battles';
}

export const actions: Actions = {
	default: async ({ request, platform, cookies, locals, url }) => {
		const env = getEnv(platform);
		const form = await request.formData();
		const login = String(form.get('login') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const salt = env.SIGNAL_SALT ?? 'dev-salt';
		const limited = await overLimit(env.DB, locals.ip, salt, 'login_fail');
		if (limited) return fail(429, { login, error: limited });

		const user = await env.DB.prepare('SELECT id, password_hash, suspended_at, suspended_reason FROM users WHERE username = ? OR email = ?')
			.bind(login, login.toLowerCase())
			.first<{ id: string; password_hash: string | null; suspended_at: number | null; suspended_reason: string | null }>();
		if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
			await recordAttempt(env.DB, locals.ip, salt, 'login_fail');
			return fail(400, { login, error: 'Wrong username/email or password.' });
		}
		if (user.suspended_at) {
			// Only shown after a correct password, so it doesn't reveal which accounts exist.
			return fail(403, {
				login,
				suspended: user.suspended_reason || 'This account broke the rules.'
			});
		}
		await recordSignals(env.DB, user.id, locals.ip, locals.deviceId, env.SIGNAL_SALT ?? 'dev-salt');
		await createSession(env.DB, cookies, user.id, url.protocol === 'https:');
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
